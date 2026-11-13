// Package codec turns the PWA's record payloads into database rows.
//
// The payload bytes a device sent are kept verbatim alongside the projected
// columns, so a field the projection does not know about yet still survives a
// round trip. Projection is a queryable view, never the only copy.
package codec

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
)

// Row is one projected record: a table, its columns and the matching values.
type Row struct {
	Table   string
	Columns []string
	Values  []any
}

// Table names the projection table for an entity.
func Table(entity domain.Entity) (string, error) {
	if entity == domain.EntityClub {
		return "clubs", nil
	}
	name, ok := tables[entity]
	if !ok {
		return "", domain.Invalid("unknown entity %q", entity)
	}
	return name, nil
}

// tables mirrors the registry so callers can find a row's home without
// projecting a payload first.
var tables = map[domain.Entity]string{
	domain.EntityTeams:         "teams",
	domain.EntityPlayers:       "players",
	domain.EntityEvents:        "events",
	domain.EntityAttendance:    "attendance",
	domain.EntityStats:         "match_stats",
	domain.EntityInvoices:      "invoices",
	domain.EntityPayments:      "payments",
	domain.EntityCategories:    "finance_categories",
	domain.EntityAccounts:      "accounts",
	domain.EntityTransactions:  "ledger_entries",
	domain.EntityProducts:      "products",
	domain.EntityStockMovement: "stock_movements",
}

// Assign lists "column = ?" fragments for an UPDATE, in column order. The
// primary key columns are never assigned; payload joins the list only when the
// caller wants the wire bytes rewritten too.
func (r Row) Assign(payload bool) string {
	skip := map[string]bool{"club_id": true, "id": true}
	if !payload {
		skip["payload"] = true
	}
	parts := make([]string, 0, len(r.Columns))
	for _, name := range r.Columns {
		if skip[name] {
			continue
		}
		parts = append(parts, name+" = ?")
	}
	return strings.Join(parts, ", ")
}

// AssignArgs drops the primary key values from the value list so it lines up
// with Assign.
func (r Row) AssignArgs(payload bool) []any {
	skip := map[string]bool{"club_id": true, "id": true}
	if !payload {
		skip["payload"] = true
	}
	out := make([]any, 0, len(r.Values))
	for i, name := range r.Columns {
		if skip[name] {
			continue
		}
		out = append(out, r.Values[i])
	}
	return out
}

// Upsert lists "column = EXCLUDED.column" fragments for an INSERT ... ON
// CONFLICT DO UPDATE, in column order. The key columns stay as the row that
// conflicted already has them: two devices cannot disagree about which record
// they are writing without one of them being wrong about its own id.
func (r Row) Upsert() string {
	skip := map[string]bool{"club_id": true, "id": true}
	parts := make([]string, 0, len(r.Columns))
	for _, name := range r.Columns {
		if skip[name] {
			continue
		}
		parts = append(parts, name+" = EXCLUDED."+name)
	}
	return strings.Join(parts, ", ")
}

// Insert writes the column list and the placeholder list for an INSERT.
func (r Row) Insert() (columns string, placeholders string) {
	cols := make([]string, 0, len(r.Columns))
	ques := make([]string, 0, len(r.Columns))
	for _, name := range r.Columns {
		cols = append(cols, name)
		ques = append(ques, "?")
	}
	return strings.Join(cols, ", "), strings.Join(ques, ", ")
}

// project builds the column list and values for one entity payload.
type project func(clubID, id string, payload json.RawMessage) (Row, error)

var registry = map[domain.Entity]project{}

// Project maps a wire entity onto its table row.
func Project(entity domain.Entity, clubID, id string, payload json.RawMessage) (Row, error) {
	turn, ok := registry[entity]
	if !ok {
		return Row{}, domain.Invalid("unknown entity %q", entity)
	}
	if err := checkRecordID(entity, id, payload); err != nil {
		return Row{}, err
	}
	return turn(clubID, id, payload)
}

// checkRecordID guards the one field that arrives twice: the client flattens
// whole rows, so a record's id sits in its payload as well as in the envelope.
// Two copies of the same key that disagree would decide which row a phone
// overwrites, so the envelope wins and the disagreement is refused.
func checkRecordID(entity domain.Entity, id string, payload json.RawMessage) error {
	if entity == domain.EntityClub {
		return nil
	}
	var envelope struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return domain.Invalid("payload for %s rejected: %v", entity, cleanJSONError(err))
	}
	if envelope.ID != "" && envelope.ID != id {
		return domain.Invalid("payload for %s carries id %q inside the record %q", entity, envelope.ID, id)
	}
	return nil
}

// Decode reads a payload strictly: an unknown key is a bug in one side of the
// contract, so it must surface instead of silently dropping a member's data.
// The record id is the envelope's copy of a key already checked above, so it is
// the one field the projection structs do not have to declare.
func Decode(entity domain.Entity, payload json.RawMessage, target any) error {
	if len(bytes.TrimSpace(payload)) == 0 {
		return domain.Invalid("payload for %s is empty", entity)
	}
	dec := json.NewDecoder(bytes.NewReader(withoutRecordID(payload)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		return domain.Invalid("payload for %s rejected: %v", entity, cleanJSONError(err))
	}
	return nil
}

// withoutRecordID drops the top-level id for decoding only. The bytes that
// reach storage are the ones the device sent, id included: a phone pulling the
// row back needs it to rebuild its own array.
func withoutRecordID(payload json.RawMessage) json.RawMessage {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return payload
	}
	if _, ok := fields["id"]; !ok {
		return payload
	}
	delete(fields, "id")
	stripped, err := json.Marshal(fields)
	if err != nil {
		return payload
	}
	return stripped
}

func cleanJSONError(err error) string {
	message := err.Error()
	message = strings.TrimPrefix(message, "json: unknown field ")
	return message
}

// Hash fingerprints the exact bytes that travel on the wire. A deleted marker
// hashes apart from an empty payload so "gone" and "blank" never collide.
func Hash(payload json.RawMessage, deleted bool) string {
	var material []byte
	if deleted {
		material = []byte("\x00deleted")
	} else {
		compact := bytes.NewBuffer(nil)
		if err := json.Compact(compact, payload); err != nil {
			material = append([]byte(nil), payload...)
		} else {
			material = compact.Bytes()
		}
	}
	sum := sha256.Sum256(material)
	return hex.EncodeToString(sum[:])
}

/* ------------------------------ value helpers ----------------------------- */

// text stores "" as empty string for NOT NULL DEFAULT ” columns.
func text(v string) any { return v }

// optText stores a missing optional string as NULL.
func optText(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}

// optNum keeps a missing number NULL instead of inventing a zero.
func optNum[T int64 | float64](v *T) any {
	if v == nil {
		return nil
	}
	return *v
}

func num[T int64 | float64](v T) any { return v }

func flag(v *bool, def bool) any {
	if v == nil {
		return def
	}
	return *v
}

func optFlag(v *bool) any {
	if v == nil {
		return nil
	}
	return *v
}

// raw keeps JSON bytes as the device sent them.
func raw(v json.RawMessage) any {
	if len(v) == 0 {
		return nil
	}
	return string(v)
}

// date accepts the two shapes the app writes for a day: ۱۴۰۵-style calendar
// strings "2025-01-09" and full timestamps. Both land in a DATE column; the
// payload keeps the original text, so nothing is lost.
func date(value string) (any, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	if len(value) == 10 {
		if _, err := time.Parse("2006-01-02", value); err != nil {
			return nil, fmt.Errorf("bad date %q", value)
		}
		return value, nil
	}
	at, err := instant(value)
	if err != nil {
		return nil, err
	}
	return at.Format("2006-01-02"), nil
}

// instant renders an app timestamp as a UTC moment.
func instant(value string) (time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return time.Time{}, nil
	}
	if len(value) == 10 {
		day, err := time.Parse("2006-01-02", value)
		if err != nil {
			return time.Time{}, fmt.Errorf("bad date %q", value)
		}
		return day, nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05"} {
		if at, err := time.Parse(layout, value); err == nil {
			return at.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("bad timestamp %q", value)
}

func datetime(value string) (any, error) {
	at, err := instant(value)
	if err != nil {
		return nil, err
	}
	if at.IsZero() {
		return nil, nil
	}
	// The offset travels with the literal: a timestamp Postgres has to guess a
	// timezone for is a timestamp that moves by an hour every deploy.
	return at.Format("2006-01-02 15:04:05.000+00"), nil
}

func optDatetime(value *string) (any, error) {
	if value == nil {
		return nil, nil
	}
	return datetime(*value)
}

func requiredID(value, field string) (any, error) {
	if strings.TrimSpace(value) == "" {
		return nil, domain.Invalid("%s is required", field)
	}
	return value, nil
}
