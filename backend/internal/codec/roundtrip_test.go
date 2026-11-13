package codec

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/az58740/club-manager/backend/internal/domain"
)

// The fixtures beside these tests are generated from the PWA's own types, not
// written by hand:
//
//	node scripts/gen-codec-fixtures.mjs
//
// What they pin down is the rule the club cannot afford to break — a member, a
// payment or a club field a phone reported must still be there when it reads
// back. Projection is a view; the payload bytes are the record.

const (
	testdataFixtures = "../../testdata/payloads.json"
	testdataShapes   = "../../testdata/client-fields.json"
	schemaPath       = "../../migrations/0001_init.sql"
	fixtureClubID    = "c-fixture-1"
)

type fixture struct {
	Case    string          `json:"case"`
	Payload json.RawMessage `json:"payload"`
}

type clientField struct {
	Name     string `json:"name"`
	Optional bool   `json:"optional"`
	Type     string `json:"type"`
}

type clientShape struct {
	Interface string        `json:"interface"`
	Fields    []clientField `json:"fields"`
}

// projectionStructs names the Go struct behind each entity so reflection can
// compare its json tags against the client's field list.
var projectionStructs = map[domain.Entity]any{
	domain.EntityClub:          clubProfile{},
	domain.EntityTeams:         teamRow{},
	domain.EntityPlayers:       playerRow{},
	domain.EntityEvents:        eventRow{},
	domain.EntityAttendance:    attendanceRow{},
	domain.EntityStats:         statRow{},
	domain.EntityInvoices:      invoiceRow{},
	domain.EntityPayments:      paymentRow{},
	domain.EntityCategories:    categoryRow{},
	domain.EntityAccounts:      accountRow{},
	domain.EntityTransactions:  transactionRow{},
	domain.EntityProducts:      productRow{},
	domain.EntityStockMovement: stockMovementRow{},
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(raw)
}

func readFixtureFile(t *testing.T, path string, target any) {
	t.Helper()
	if err := json.Unmarshal([]byte(mustRead(t, path)), target); err != nil {
		t.Fatalf("parse %s: %v (regenerate with: node scripts/gen-codec-fixtures.mjs)", path, err)
	}
}

func fixtures(t *testing.T) map[string][]fixture {
	t.Helper()
	out := map[string][]fixture{}
	readFixtureFile(t, testdataFixtures, &out)
	if len(out) == 0 {
		t.Fatal("no fixtures found")
	}
	return out
}

func clientShapes(t *testing.T) map[string]clientShape {
	t.Helper()
	out := map[string]clientShape{}
	readFixtureFile(t, testdataShapes, &out)
	return out
}

// recordID is the device-generated id the client keeps inside the payload as
// well as in the envelope, because flattenData sends the whole row.
func recordID(t *testing.T, entity domain.Entity, payload json.RawMessage) string {
	t.Helper()
	if entity == domain.EntityClub {
		return domain.ClubRecordID
	}
	var key struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &key); err != nil {
		t.Fatalf("entity %s: %v", entity, err)
	}
	if key.ID == "" {
		t.Fatalf("entity %s fixture has no id inside its payload", entity)
	}
	return key.ID
}

func projectFixture(t *testing.T, entity domain.Entity, payload json.RawMessage) Row {
	t.Helper()
	row, err := Project(entity, fixtureClubID, recordID(t, entity, payload), payload)
	if err != nil {
		t.Fatalf("project %s: %v", entity, err)
	}
	return row
}

func columnValue(row Row, name string) (any, bool) {
	for i, col := range row.Columns {
		if col == name {
			return row.Values[i], true
		}
	}
	return nil, false
}

/* ------------------------------- the contract ------------------------------ */

func TestEveryClientEntityHasAProjector(t *testing.T) {
	seen := map[domain.Entity]bool{}
	for _, entity := range domain.Entities {
		if _, ok := registry[entity]; !ok {
			t.Errorf("entity %q has no projector", entity)
		}
		if _, ok := projectionStructs[entity]; !ok {
			t.Errorf("entity %q has no projection struct to reflect over", entity)
		}
		if _, err := Table(entity); err != nil {
			t.Errorf("entity %q has no table: %v", entity, err)
		}
		seen[entity] = true
	}
	for entity := range registry {
		if !seen[entity] {
			t.Errorf("registry projects %q, which domain.Entities does not list", entity)
		}
	}
	for entity := range tables {
		if !seen[entity] {
			t.Errorf("tables maps %q, which domain.Entities does not list", entity)
		}
	}

	shapes := clientShapes(t)
	for entity := range shapes {
		if !domain.Entity(entity).Valid() {
			t.Errorf("the client sends entity %q, which the server does not accept", entity)
		}
	}
	for _, entity := range domain.Entities {
		if _, ok := shapes[string(entity)]; !ok {
			t.Errorf("entity %q has no client fixture: run scripts/gen-codec-fixtures.mjs", entity)
		}
	}
}

// TestPayloadBytesSurviveProjection is the anti-data-loss test: whatever the
// phone sent must be the exact thing stored beside the projected columns, so an
// unprojected field is still recoverable.
func TestPayloadBytesSurviveProjection(t *testing.T) {
	for entityName, rows := range fixtures(t) {
		entity := domain.Entity(entityName)
		for _, row := range rows {
			name := fmt.Sprintf("%s/%s", entityName, row.Case)
			t.Run(name, func(t *testing.T) {
				projected := projectFixture(t, entity, row.Payload)

				stored, ok := columnValue(projected, "payload")
				if !ok {
					t.Fatalf("%s: no payload column in %v", name, projected.Columns)
				}
				if got, isText := stored.(string); !isText {
					t.Fatalf("%s: payload column holds %T, want the bytes as text", name, stored)
				} else if got != string(row.Payload) {
					t.Errorf("%s: payload rewritten on the way to storage\n got %s\nwant %s", name, got, row.Payload)
				}
			})
		}
	}
}

func TestRowShapeIsConsistent(t *testing.T) {
	for entityName, rows := range fixtures(t) {
		entity := domain.Entity(entityName)
		for _, row := range rows {
			projected := projectFixture(t, entity, row.Payload)
			if len(projected.Columns) != len(projected.Values) {
				t.Errorf("%s/%s: %d columns but %d values", entityName, row.Case, len(projected.Columns), len(projected.Values))
			}
			seen := map[string]bool{}
			for _, column := range projected.Columns {
				if seen[column] {
					t.Errorf("%s/%s: column %q projected twice", entityName, row.Case, column)
				}
				seen[column] = true
			}
			if want, err := Table(entity); err == nil && projected.Table != want && entity != domain.EntityClub {
				t.Errorf("%s/%s: row targets %q, Table() says %q", entityName, row.Case, projected.Table, want)
			}
			for _, column := range []string{"club_id", "id", "payload"} {
				if _, ok := columnValue(projected, column); !ok {
					t.Errorf("%s/%s: missing the %s column", entityName, row.Case, column)
				}
			}
		}
	}
}

/* ---------------------------- against the schema --------------------------- */

type schemaTable struct {
	columns map[string]string
}

func parseSchema(t *testing.T) map[string]schemaTable {
	t.Helper()
	out := parseSchemaText(mustRead(t, schemaPath))
	if len(out) == 0 {
		t.Fatalf("no tables parsed from %s", schemaPath)
	}
	return out
}

var schemaKeywords = map[string]bool{
	"primary": true, "unique": true, "key": true, "index": true,
	"constraint": true, "foreign": true, "check": true,
}

var schemaTableStart = regexp.MustCompile("^CREATE TABLE (?:IF NOT EXISTS )?`?([a-z_]+)`? \\(")

func parseSchemaText(text string) map[string]schemaTable {
	out := map[string]schemaTable{}
	var current string
	var body []string
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if match := schemaTableStart.FindStringSubmatch(trimmed); match != nil {
			current, body = match[1], nil
			continue
		}
		if current == "" {
			continue
		}
		if strings.HasPrefix(trimmed, ")") {
			table := schemaTable{columns: map[string]string{}}
			for _, entry := range body {
				fields := strings.Fields(entry)
				if len(fields) < 2 {
					continue
				}
				name := strings.Trim(fields[0], "`")
				if schemaKeywords[strings.ToLower(name)] {
					continue
				}
				table.columns[name] = strings.Join(fields[1:], " ")
			}
			out[current] = table
			current = ""
			continue
		}
		if trimmed == "" {
			continue
		}
		body = append(body, strings.TrimRight(trimmed, ","))
	}
	return out
}

func TestProjectedColumnsExistInSchema(t *testing.T) {
	schema := parseSchema(t)
	for entityName, rows := range fixtures(t) {
		entity := domain.Entity(entityName)
		for _, row := range rows {
			projected := projectFixture(t, entity, row.Payload)
			table, ok := schema[projected.Table]
			if !ok {
				t.Errorf("%s: table %q is not in the migration", entityName, projected.Table)
				continue
			}
			for _, column := range projected.Columns {
				// The club profile row is the clubs row itself, keyed by id;
				// it has no club_id of its own.
				if entity == domain.EntityClub && column == "club_id" {
					continue
				}
				if _, ok := table.columns[column]; !ok {
					t.Errorf("%s/%s: projects column %q, which %s does not declare",
						entityName, row.Case, column, projected.Table)
				}
			}
		}
	}
}

// TestCheckedColumnsAcceptProjectedValues catches the drift that only shows up
// as a rejected write at 3am: the client grows a status the schema never heard
// of. The schema states its allowed values as CHECK (column IN (...)), which
// is what a Postgres ENUM became.
func TestCheckedColumnsAcceptProjectedValues(t *testing.T) {
	schema := parseSchema(t)
	check := regexp.MustCompile(`CHECK\s*\(\s*\w+\s+IN\s*\(([^)]*)\)\)`)
	for entityName, rows := range fixtures(t) {
		entity := domain.Entity(entityName)
		for _, row := range rows {
			projected := projectFixture(t, entity, row.Payload)
			table, ok := schema[projected.Table]
			if !ok {
				continue
			}
			for i, column := range projected.Columns {
				def, ok := table.columns[column]
				if !ok {
					continue
				}
				match := check.FindStringSubmatch(def)
				if match == nil {
					continue
				}
				value := projected.Values[i]
				text, isText := value.(string)
				if !isText {
					continue
				}
				allowed := strings.Split(match[1], ",")
				found := false
				for _, option := range allowed {
					if strings.Trim(strings.TrimSpace(option), "'") == text {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("%s/%s: %s.%s = %q is not one of %s",
						entityName, row.Case, projected.Table, column, text, match[1])
				}
			}
		}
	}
}

/* ------------------------------ field parity ------------------------------ */

func structJSONFields(t *testing.T, sample any) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	value := reflect.TypeOf(sample)
	if value.Kind() == reflect.Pointer {
		value = value.Elem()
	}
	for i := 0; i < value.NumField(); i++ {
		field := value.Field(i)
		tag := field.Tag.Get("json")
		name := strings.Split(tag, ",")[0]
		if name == "-" || name == "" {
			name = field.Name
		}
		out[name] = strings.Contains(tag, "omitempty")
	}
	return out
}

// TestClientFieldsAreKnownToTheCodec is the one that pays for itself. Decode
// refuses unknown keys on purpose, so a field the club adds on the phone
// silently stops every push of that entity until the server learns it too.
func TestClientFieldsAreKnownToTheCodec(t *testing.T) {
	for entityName, shape := range clientShapes(t) {
		entity := domain.Entity(entityName)
		sample, ok := projectionStructs[entity]
		if !ok {
			t.Errorf("%s: no projection struct registered", entityName)
			continue
		}
		held := structJSONFields(t, sample)
		for _, field := range shape.Fields {
			// The row id travels in the payload as well as in the envelope.
			if field.Name == "id" {
				continue
			}
			if _, ok := held[field.Name]; !ok {
				t.Errorf("%s: %s sends %q but %T does not decode it — pushes of this entity will be rejected",
					entityName, shape.Interface, field.Name, sample)
			}
		}
		clientNames := map[string]bool{}
		for _, field := range shape.Fields {
			clientNames[field.Name] = true
		}
		for name := range held {
			if name == "id" {
				continue
			}
			if !clientNames[name] {
				t.Errorf("%s: %T decodes %q, which %s no longer declares", entityName, sample, name, shape.Interface)
			}
		}
	}
}

/* ------------------------------- strictness ------------------------------- */

func TestDecodeRejectsUnknownField(t *testing.T) {
	for entityName, rows := range fixtures(t) {
		if len(rows) == 0 {
			continue
		}
		entity := domain.Entity(entityName)
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(rows[0].Payload, &fields); err != nil {
			t.Fatalf("%s: %v", entityName, err)
		}
		fields["aFieldNobodyDeclared"] = json.RawMessage(`"x"`)
		extended, err := json.Marshal(fields)
		if err != nil {
			t.Fatalf("%s: %v", entityName, err)
		}
		if _, err := Project(entity, fixtureClubID, recordID(t, entity, extended), extended); err == nil {
			t.Errorf("%s: an undeclared field slipped through the decoder", entityName)
		} else if !strings.Contains(err.Error(), "aFieldNobodyDeclared") {
			t.Errorf("%s: error should name the field, got %v", entityName, err)
		}
	}
}

func TestBadValuesAreRefused(t *testing.T) {
	cases := []struct {
		name   string
		entity domain.Entity
		patch  string
		wants  string
	}{
		{"player without jersey", domain.EntityPlayers, `"jersey":null`, "jersey"},
		{"player amount with decimals", domain.EntityPlayers, `"monthlyFee":1500000.5`, "whole number"},
		{"player without a name", domain.EntityPlayers, `"fullName":""`, "fullName"},
		{"player without a team", domain.EntityPlayers, `"teamId":""`, "teamId"},
		{"player birth date in words", domain.EntityPlayers, `"birthDate":"21 فروردین"`, "birthDate"},
		{"payment without an invoice", domain.EntityPayments, `"invoiceId":""`, "invoiceId"},
		{"invoice with a decimal amount", domain.EntityInvoices, `"amount":12.5`, "whole number"},
		{"event with a local timestamp", domain.EntityEvents, `"startsAt":"15/03/2026"`, "startsAt"},
		{"ledger entry without a category", domain.EntityTransactions, `"categoryId":""`, "categoryId"},
		{"stock movement without a product", domain.EntityStockMovement, `"productId":""`, "productId"},
		{"stat without an event", domain.EntityStats, `"eventId":""`, "eventId"},
		{"club without a name", domain.EntityClub, `"name":""`, "club name"},
	}
	fixtureRows := fixtures(t)
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			rows := fixtureRows[string(testCase.entity)]
			if len(rows) == 0 {
				t.Fatalf("no fixture for %s", testCase.entity)
			}
			body := string(rows[0].Payload)
			key := strings.SplitN(testCase.patch, ":", 2)[0]
			pattern := regexp.MustCompile(key + `\s*:\s*[^,}]*`)
			if !pattern.MatchString(body) {
				t.Fatalf("fixture for %s has no %s to replace", testCase.entity, key)
			}
			patched := pattern.ReplaceAllString(body, testCase.patch)
			payload := json.RawMessage(patched)
			_, err := Project(testCase.entity, fixtureClubID, recordID(t, testCase.entity, payload), payload)
			if err == nil {
				t.Fatalf("accepted a broken payload: %s", patched)
			}
			if !strings.Contains(err.Error(), testCase.wants) {
				t.Errorf("error should mention %q, got %v", testCase.wants, err)
			}
		})
	}
}

/* --------------------------------- hashing -------------------------------- */

func TestHashTellsGoneApartFromBlank(t *testing.T) {
	deleted := Hash(nil, true)
	blank := Hash(json.RawMessage("null"), false)
	if deleted == blank {
		t.Fatalf("a delete and an empty payload hash alike: %s", deleted)
	}
	spaced := Hash(json.RawMessage("{ \"a\" : 1 }"), false)
	tight := Hash(json.RawMessage(`{"a":1}`), false)
	if spaced != tight {
		t.Errorf("layout changed the fingerprint: %s vs %s", spaced, tight)
	}
	other := Hash(json.RawMessage(`{"a":2}`), false)
	if tight == other {
		t.Errorf("different payloads share a fingerprint")
	}
}

func TestAssignAndInsertLineUp(t *testing.T) {
	rows := fixtures(t)
	for entityName, list := range rows {
		entity := domain.Entity(entityName)
		for _, row := range list {
			projected := projectFixture(t, entity, row.Payload)
			assign := projected.Assign(true)
			args := projected.AssignArgs(true)
			fragments := map[string]bool{}
			for _, fragment := range strings.Split(assign, ", ") {
				fragments[fragment] = true
			}
			if got := strings.Count(assign, "?"); got != len(args) {
				t.Errorf("%s/%s: %d assignments but %d arguments", entityName, row.Case, got, len(args))
			}
			for _, banned := range []string{"club_id = ?", "id = ?"} {
				if fragments[banned] {
					t.Errorf("%s/%s: UPDATE rewrites the key %q", entityName, row.Case, banned)
				}
			}

			// The same row is written by one upsert statement in Postgres, so
			// the EXCLUDED list must cover every column except the key.
			upsert := projected.Upsert()
			keyed := map[string]int{"club_id": 0, "id": 0}
			pairs := 0
			for _, fragment := range strings.Split(upsert, ", ") {
				hands := strings.SplitN(fragment, " = ", 2)
				if len(hands) != 2 {
					t.Errorf("%s/%s: upsert fragment %q is not an assignment", entityName, row.Case, fragment)
					continue
				}
				if _, isKey := keyed[hands[0]]; isKey {
					t.Errorf("%s/%s: upsert rewrites the key %q", entityName, row.Case, hands[0])
					continue
				}
				if hands[1] != "EXCLUDED."+hands[0] {
					t.Errorf("%s/%s: upsert sets %s to %q, want the row being inserted",
						entityName, row.Case, hands[0], hands[1])
				}
				pairs++
			}
			if want := len(projected.Columns) - 2; pairs != want {
				t.Errorf("%s/%s: upsert assigns %d columns, want %d", entityName, row.Case, pairs, want)
			}

			columns, placeholders := projected.Insert()
			if strings.Count(placeholders, "?") != len(projected.Columns) {
				t.Errorf("%s/%s: INSERT has %d placeholders for %d columns",
					entityName, row.Case, strings.Count(placeholders, "?"), len(projected.Columns))
			}
			if strings.Count(columns, ",")+1 != len(projected.Columns) {
				t.Errorf("%s/%s: INSERT names %d columns for %d values",
					entityName, row.Case, strings.Count(columns, ",")+1, len(projected.Columns))
			}
		}
	}
}

// TestEachEntityHasItsOwnTable: two entities sharing a table would overwrite
// each other's rows under the same (club_id, id) key.
func TestEachEntityHasItsOwnTable(t *testing.T) {
	seen := map[domain.Entity]string{}
	for entity, name := range tables {
		if name == "" {
			t.Errorf("entity %q maps to an empty table", entity)
		}
		for other, previous := range seen {
			if previous == name {
				t.Errorf("%q and %q both project into %q", entity, other, name)
			}
		}
		seen[entity] = name
	}
}
