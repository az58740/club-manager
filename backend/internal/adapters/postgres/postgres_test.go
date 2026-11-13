package postgres_test

// These tests need a real Postgres, because everything they are for is a
// dialect: how a payload's bytes come back, how a sequence is generated, how a
// unique index behaves. On a workstation that can be PGlite, no Docker needed:
//
//	node scripts/pglite-server.mjs 55432
//	cd backend
//	TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable' \
//	  go test ./internal/adapters/postgres/
//
// Against Supabase, point TEST_DATABASE_URL at the project instead. Without the
// variable the whole file skips: a green run that proved nothing is worse than
// a red one.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/az58740/club-manager/backend/internal/adapters/postgres"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
)

var (
	migrateOnce sync.Once
	migrateErr  error
)

func open(t *testing.T) *postgres.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; see the comment at the top of this file")
	}
	db, err := postgres.Open(dsn)
	if err != nil {
		t.Fatalf("open %s: %v", dsn, err)
	}
	t.Cleanup(func() { _ = db.Close() })

	migrateOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		_, migrateErr = postgres.Migrate(ctx, db)
	})
	if migrateErr != nil {
		t.Fatalf("migrate: %v", migrateErr)
	}
	return db
}

func unique(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UTC().UnixNano())
}

// digest32 returns a token digest no earlier run left in a unique index. The
// database outlives the test binary when it runs against PGlite, so reusing a
// literal hash makes the second run fail on a collision that proves nothing.
func digest32(prefix string) []byte {
	token := []byte(unique(prefix))
	if len(token) > 32 {
		return token[:32]
	}
	return append(token, make([]byte, 32-len(token))...)
}

// fixturePayload returns the same JSON document the PWA sends for an entity,
// with the record id replaced so concurrent tests cannot collide.
func fixturePayload(t *testing.T, entity, id string) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("..", "..", "..", "testdata", "payloads.json"))
	if err != nil {
		t.Fatalf("read fixtures: %v", err)
	}
	var all map[string][]struct {
		Case    string          `json:"case"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(body, &all); err != nil {
		t.Fatalf("parse fixtures: %v", err)
	}
	list, ok := all[entity]
	if !ok || len(list) == 0 {
		t.Fatalf("no fixtures for %s", entity)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(list[0].Payload, &fields); err != nil {
		t.Fatalf("fixture %s is not an object: %v", entity, err)
	}
	keyed, err := json.Marshal(id)
	if err != nil {
		t.Fatal(err)
	}
	fields["id"] = keyed
	stamped, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return stamped
}

// edited returns the fixture with one field changed, so a test can send a real
// second version of a record rather than the same bytes again.
func edited(t *testing.T, entity, id string, field string, value any) []byte {
	t.Helper()
	body := fixturePayload(t, entity, id)
	var fields map[string]any
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatalf("fixture %s is not an object: %v", entity, err)
	}
	fields[field] = value
	stamped, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return stamped
}

func apply(t *testing.T, store *postgres.Store, clubID string, entity domain.Entity, id string, payload []byte, opID string) domain.Record {
	t.Helper()
	rec, err := store.Apply(context.Background(), clubID, ports.Apply{
		Entity:   entity,
		ID:       id,
		Payload:  payload,
		UserID:   "u-" + clubID,
		DeviceID: "d-" + clubID,
		OpID:     opID,
	})
	if err != nil {
		t.Fatalf("apply %s/%s: %v", entity, id, err)
	}
	return rec
}

func TestRecordRoundTrip(t *testing.T) {
	db := open(t)
	store := postgres.NewStore(db)
	ctx := context.Background()
	club := unique("club")

	payload := fixturePayload(t, "players", "p-1")
	written := apply(t, store, club, domain.EntityPlayers, "p-1", payload, "op-1")
	if written.Seq == 0 {
		t.Fatal("the log gave the record no sequence")
	}

	current, err := store.Latest(ctx, club, domain.EntityPlayers, "p-1")
	if err != nil || current == nil {
		t.Fatalf("latest: %v (%+v)", err, current)
	}
	if string(current.Payload) != string(payload) {
		t.Errorf("payload rewritten on the way through the database\n got %s\nwant %s", current.Payload, payload)
	}

	// A money record is the one a club cannot afford to lose quietly.
	money := fixturePayload(t, "transactions", "l-1")
	apply(t, store, club, domain.EntityTransactions, "l-1", money, "op-2")

	rows, _, err := store.Pull(ctx, club, 0, 100)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("pull returned %d records, want 2", len(rows))
	}
	if rows[0].Seq > rows[1].Seq {
		t.Errorf("the log came back out of order: %d then %d", rows[0].Seq, rows[1].Seq)
	}

	snapshot, head, err := store.ClubSnapshot(ctx, club)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	if len(snapshot) != 2 {
		t.Errorf("snapshot has %d records, want 2", len(snapshot))
	}
	if head != rows[1].Seq {
		t.Errorf("snapshot head is %d, the log ends at %d", head, rows[1].Seq)
	}

	// The queryable projection must say the same thing the payload does.
	var name string
	var fee int64
	if err := db.QueryRow(ctx,
		`SELECT full_name, monthly_fee FROM players WHERE club_id = ? AND id = ?`, club, "p-1").
		Scan(&name, &fee); err != nil {
		t.Fatalf("projection row: %v", err)
	}
	if name != "Sample Player" || fee != 8000000 {
		t.Errorf("projection holds %q and %d, want %q and %d", name, fee, "Sample Player", 8000000)
	}
}

func TestConflictAndReplay(t *testing.T) {
	db := open(t)
	store := postgres.NewStore(db)
	ctx := context.Background()
	club := unique("club")

	first := apply(t, store, club, domain.EntityTeams, "t-1", fixturePayload(t, "teams", "t-1"), "op-1")

	// A coach edits an older copy of the row than the one now on the server.
	// The base hash is what makes the stale edit visible, so it has to be
	// checked against a payload that really differs from the live one: the
	// same bytes twice are a no-op, not a conflict.
	second := edited(t, "teams", "t-1", "coach", "Someone else")
	_, err := store.Apply(ctx, club, ports.Apply{
		Entity:   domain.EntityTeams,
		ID:       "t-1",
		Payload:  second,
		BaseHash: "not the version this device edited",
		UserID:   "u-" + club,
		DeviceID: "d-" + club,
		OpID:     "op-2",
	})
	var clash *domain.ConflictError
	if !errors.As(err, &clash) {
		t.Fatalf("a stale edit returned %v, want a conflict", err)
	}
	if clash.Record == nil || clash.Record.Hash != first.Hash {
		t.Errorf("the conflict did not carry the live row back to the device")
	}

	live, err := store.Latest(ctx, club, domain.EntityTeams, "t-1")
	if err != nil || live == nil {
		t.Fatalf("latest after a refused write: %v", err)
	}
	if string(live.Payload) != string(fixturePayload(t, "teams", "t-1")) {
		t.Errorf("the stale edit reached the row despite the conflict: %s", live.Payload)
	}

	// The same operation, sent again because a phone never saw the answer.
	replay := apply(t, store, club, domain.EntityTeams, "t-1", second, "op-1")
	if replay.Seq != first.Seq {
		t.Errorf("a retried op took a new sequence: %d, then %d", first.Seq, replay.Seq)
	}
	var logged int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM sync_log WHERE club_id = ?`, club).Scan(&logged); err != nil {
		t.Fatalf("count the log: %v", err)
	}
	if logged != 1 {
		t.Errorf("the log holds %d rows for one operation, want 1", logged)
	}
}

func TestSoftDeleteKeepsTheRow(t *testing.T) {
	db := open(t)
	store := postgres.NewStore(db)
	ctx := context.Background()
	club := unique("club")

	apply(t, store, club, domain.EntityPlayers, "p-9", fixturePayload(t, "players", "p-9"), "op-1")
	gone, err := store.Apply(ctx, club, ports.Apply{
		Entity:   domain.EntityPlayers,
		ID:       "p-9",
		Deleted:  true,
		UserID:   "u-" + club,
		DeviceID: "d-" + club,
		OpID:     "op-2",
	})
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !gone.Deleted {
		t.Error("the record came back without its delete marker")
	}

	var payload string
	var deletedAt *time.Time
	if err := db.QueryRow(ctx,
		`SELECT payload, deleted_at FROM players WHERE club_id = ? AND id = ?`, club, "p-9").
		Scan(&payload, &deletedAt); err != nil {
		t.Fatalf("the projection row vanished: %v", err)
	}
	if deletedAt == nil {
		t.Error("the projection is not marked deleted")
	}
	if !strings.Contains(payload, "Sample Player") {
		t.Errorf("the deleted row lost its bytes: %s", payload)
	}

	snapshot, _, err := store.ClubSnapshot(ctx, club)
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	for _, rec := range snapshot {
		if rec.ID == "p-9" {
			t.Error("a deleted record was offered to a first-time device")
		}
	}
}

func TestAccountsTokensAndSessions(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	club := unique("club")

	user := domain.User{
		ID:     unique("u"),
		Name:   "مدیر باشگاه",
		Email:  strings.ToUpper(club) + "@club.example",
		Role:   domain.RoleManager,
		Status: domain.StatusActive,
	}
	salt := []byte("0123456789abcdef0123456789abcdef")
	secret := []byte("hash-of-a-password-that-never-leaves")
	if err := db.InsertUser(ctx, user, secret, salt); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	// The club types an address in whatever case the phone keyboard offered.
	found, err := db.UserByEmail(ctx, strings.ToLower(user.Email)+"!")
	if err == nil && found != nil {
		t.Fatalf("looked up %q and found it, which should not happen", found.Email)
	}
	found, err = db.UserByEmail(ctx, strings.ToLower(user.Email))
	if err != nil {
		t.Fatalf("email lookup: %v", err)
	}
	if found.Name != "مدیر باشگاه" {
		t.Errorf("the name came back as %q", found.Name)
	}
	if found.Role != domain.RoleManager {
		t.Errorf("role came back as %q", found.Role)
	}

	algo, gotSalt, gotHash, err := db.Secret(ctx, user.ID)
	if err != nil {
		t.Fatalf("secret: %v", err)
	}
	if algo != "argon2id" || string(gotSalt) != string(salt) || string(gotHash) != string(secret) {
		t.Errorf("credential bytes changed: %q %q %q", algo, gotSalt, gotHash)
	}

	now := time.Now().UTC().Truncate(time.Millisecond)
	session := ports.Session{
		ID: unique("s"), UserID: user.ID, DeviceID: "d-1",
		AccessHash:  digest32("access"),
		RefreshHash: digest32("refresh"),
		AccessAt:    now,
		RefreshAt:   now,
		ExpiresAt:   now.Add(time.Hour),
	}
	if err := db.OpenSession(ctx, session); err != nil {
		t.Fatalf("open session: %v", err)
	}
	loaded, err := db.SessionByAccess(ctx, session.AccessHash)
	if err != nil {
		t.Fatalf("session lookup: %v", err)
	}
	if !loaded.ExpiresAt.Equal(session.ExpiresAt) {
		t.Errorf("expiry moved by %s", loaded.ExpiresAt.Sub(session.ExpiresAt))
	}
	if loaded.RevokedAt != nil {
		t.Error("a fresh session is already revoked")
	}

	// A reset link invalidates every device, and the old access token dies.
	if err := db.RevokeUserSessions(ctx, user.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	after, err := db.SessionByRefresh(ctx, session.RefreshHash)
	if err != nil {
		t.Fatalf("refresh lookup: %v", err)
	}
	if after.RevokedAt == nil {
		t.Error("the session reports itself still signed in")
	}

	token := unique("t")
	digest := digest32("email")
	if err := db.PutEmailToken(ctx, token, user.ID, "reset", digest, now.Add(time.Hour)); err != nil {
		t.Fatalf("email token: %v", err)
	}
	if _, err := db.EmailToken(ctx, digest, "reset"); err != nil {
		t.Fatalf("email token lookup: %v", err)
	}

	key := []byte("a passkey public key, stored as bytes")
	if err := db.PutPasskey(ctx, unique("pk")+"-1", user.ID, key); err != nil {
		t.Fatalf("passkey: %v", err)
	}

	// A mailbox that only differs in capitalisation is the same account.
	if err := db.InsertUser(ctx, domain.User{
		ID: unique("u"), Name: "Other", Email: strings.ToLower(user.Email),
		Role: domain.RolePlayer, Status: domain.StatusPending,
	}, nil, nil); err == nil {
		t.Fatal("two accounts were created for one mailbox")
	}
}

// The read scope is stored, not recomputed: a player's phone is filtered on
// these columns, and so is the row level policy a live subscription is checked
// against. A tombstone has no payload to read an owner from, so it must keep
// the owner of the row it removes.
func TestReadScopeIsStoredAndSurvivesADelete(t *testing.T) {
	db := open(t)
	store := postgres.NewStore(db)
	ctx := context.Background()
	club := unique("club")

	apply(t, store, club, domain.EntityPlayers, "p-fixture-1", fixturePayload(t, "players", "p-fixture-1"), "op-1")
	apply(t, store, club, domain.EntityInvoices, "i-1", fixturePayload(t, "invoices", "i-1"), "op-2")
	apply(t, store, club, domain.EntityTransactions, "l-1", fixturePayload(t, "transactions", "l-1"), "op-3")
	apply(t, store, club, domain.EntityEvents, "e-1", fixturePayload(t, "events", "e-1"), "op-4")
	apply(t, store, club, domain.EntityTeams, "t-fixture-1", fixturePayload(t, "teams", "t-fixture-1"), "op-5")

	rows, _, err := store.Pull(ctx, club, 0, 100)
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	want := map[string]struct {
		scope    domain.Scope
		playerID string
		teamID   string
	}{
		"players/p-fixture-1": {domain.ScopePlayer, "p-fixture-1", "t-fixture-1"},
		"invoices/i-1":        {domain.ScopePlayer, "p-fixture-1", ""},
		"transactions/l-1":    {domain.ScopeStaff, "", ""},
		"events/e-1":          {domain.ScopeTeam, "", "t-fixture-1"},
		"teams/t-fixture-1":   {domain.ScopeClub, "", ""},
	}
	if len(rows) != len(want) {
		t.Fatalf("pull returned %d rows, want %d", len(rows), len(want))
	}
	for _, row := range rows {
		key := string(row.Entity) + "/" + row.ID
		expect, ok := want[key]
		if !ok {
			t.Errorf("unexpected row %s", key)
			continue
		}
		if row.Scope != expect.scope || row.PlayerID != expect.playerID || row.TeamID != expect.teamID {
			t.Errorf("%s came back as %s/%q/%q, want %s/%q/%q",
				key, row.Scope, row.PlayerID, row.TeamID, expect.scope, expect.playerID, expect.teamID)
		}
	}

	gone, err := store.Apply(ctx, club, ports.Apply{
		Entity: domain.EntityInvoices, ID: "i-1", Deleted: true,
		UserID: "u-" + club, DeviceID: "d-" + club, OpID: "op-6",
	})
	if err != nil {
		t.Fatalf("delete the invoice: %v", err)
	}
	if gone.Scope != domain.ScopePlayer || gone.PlayerID != "p-fixture-1" {
		t.Errorf("the tombstone lost its owner: %s/%q", gone.Scope, gone.PlayerID)
	}

	var scope, playerID string
	if err := db.QueryRow(ctx,
		`SELECT scope, player_id FROM sync_log WHERE club_id = ? AND op_id = ?`, club, "op-6").
		Scan(&scope, &playerID); err != nil {
		t.Fatalf("read the delete from the log: %v", err)
	}
	if scope != string(domain.ScopePlayer) || playerID != "p-fixture-1" {
		t.Errorf("the logged delete is %s/%q; the player who could see the invoice must still get its deletion", scope, playerID)
	}

	current, err := store.Latest(ctx, club, domain.EntityInvoices, "i-1")
	if err != nil || current == nil {
		t.Fatalf("latest after the delete: %v", err)
	}
	if !current.Deleted || current.Scope != domain.ScopePlayer || current.PlayerID != "p-fixture-1" {
		t.Errorf("record_state lost the delete or its owner: %+v", current)
	}
}

// The link between a sign-in and a roster row is what a player's whole read
// scope hangs on, so it has to survive a round trip through the database and be
// removable without touching the account itself.
func TestPlayerLinkIsStoredAndRemovable(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	club := unique("club")

	user := domain.User{
		ID: unique("u"), ClubID: club, Name: "بازیکن", Email: unique("mail") + "@club.example",
		Role: domain.RolePlayer, Status: domain.StatusPending, EmailSeen: true,
	}
	if err := db.InsertUser(ctx, user, nil, nil); err != nil {
		t.Fatalf("insert player account: %v", err)
	}
	if err := db.SetUserLink(ctx, user.ID, "p-fixture-1", "t-fixture-1"); err != nil {
		t.Fatalf("link: %v", err)
	}
	linked, err := db.User(ctx, user.ID)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if linked.PlayerID != "p-fixture-1" || linked.TeamID != "t-fixture-1" {
		t.Fatalf("link came back as %q/%q", linked.PlayerID, linked.TeamID)
	}
	if linked.Role != domain.RolePlayer || linked.Status != domain.StatusPending {
		t.Fatalf("linking changed the account: %s/%s", linked.Role, linked.Status)
	}

	if err := db.SetUserLink(ctx, user.ID, "", ""); err != nil {
		t.Fatalf("unlink: %v", err)
	}
	unlinked, err := db.User(ctx, user.ID)
	if err != nil {
		t.Fatalf("read back after unlink: %v", err)
	}
	if unlinked.PlayerID != "" || unlinked.TeamID != "" {
		t.Fatalf("unlink left %q/%q behind", unlinked.PlayerID, unlinked.TeamID)
	}
}

// The number is contact information the club typed, so it has to come back
// unchanged; an account created before the column existed reads as empty.
func TestContactNumberSurvivesTheAccountRow(t *testing.T) {
	db := open(t)
	ctx := context.Background()

	user := domain.User{
		ID: unique("u"), ClubID: unique("club"), Name: "Member",
		Email: unique("mail") + "@club.example", Phone: "09123456789",
		Role: domain.RoleCoach, Status: domain.StatusActive, EmailSeen: true,
	}
	if err := db.InsertUser(ctx, user, nil, nil); err != nil {
		t.Fatalf("insert account: %v", err)
	}
	stored, err := db.UserByEmail(ctx, user.Email)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if stored.Phone != user.Phone {
		t.Fatalf("the number came back as %q, want %q", stored.Phone, user.Phone)
	}

	legacy := domain.User{
		ID: unique("u"), ClubID: user.ClubID, Name: "Legacy",
		Email: unique("mail") + "@club.example",
		Role:  domain.RolePlayer, Status: domain.StatusActive, EmailSeen: true,
	}
	if err := db.InsertUser(ctx, legacy, nil, nil); err != nil {
		t.Fatalf("insert account without a number: %v", err)
	}
	read, err := db.User(ctx, legacy.ID)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if read.Phone != "" {
		t.Fatalf("an absent number read as %q", read.Phone)
	}
}

// A live subscription and the API must hand one phone the same rows. This runs
// supabase/realtime.sql against the real record_state table and then reads it the
// way Supabase's socket does: as the authenticated role, with the claims the Go
// service signs into its token. The expected lists are the ones
// TestPlayerPullIsScopedToTheirOwnRows pins on the service side.
func TestRealtimePolicyHandsOverTheSameRowsAsTheAPI(t *testing.T) {
	db := open(t)
	store := postgres.NewStore(db)
	ctx := context.Background()
	club := unique("club")

	apply(t, store, club, domain.EntityClub, "club", fixturePayload(t, "club", "club"), "op-1")
	apply(t, store, club, domain.EntityTeams, "t-fixture-1", fixturePayload(t, "teams", "t-fixture-1"), "op-2")
	apply(t, store, club, domain.EntityTeams, "t-2", edited(t, "teams", "t-2", "name", "Other team"), "op-3")
	apply(t, store, club, domain.EntityPlayers, "p-fixture-1", fixturePayload(t, "players", "p-fixture-1"), "op-4")
	apply(t, store, club, domain.EntityPlayers, "p-2", edited(t, "players", "p-2", "teamId", "t-2"), "op-5")
	apply(t, store, club, domain.EntityEvents, "e-1", fixturePayload(t, "events", "e-1"), "op-6")
	apply(t, store, club, domain.EntityEvents, "e-2", edited(t, "events", "e-2", "teamId", "t-2"), "op-7")
	apply(t, store, club, domain.EntityInvoices, "i-1", fixturePayload(t, "invoices", "i-1"), "op-8")
	apply(t, store, club, domain.EntityInvoices, "i-2", edited(t, "invoices", "i-2", "playerId", "p-2"), "op-9")
	apply(t, store, club, domain.EntityTransactions, "l-1", fixturePayload(t, "transactions", "l-1"), "op-10")

	supabaseScaffolding(t, db)
	policy, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "supabase", "realtime.sql"))
	if err != nil {
		t.Fatalf("read the policy file: %v", err)
	}
	if _, err := db.Exec(ctx, string(policy)); err != nil {
		t.Fatalf("apply supabase/realtime.sql: %v", err)
	}
	// Running it twice is what a redeploy does; it must not fail or widen.
	if _, err := db.Exec(ctx, string(policy)); err != nil {
		t.Fatalf("re-apply supabase/realtime.sql: %v", err)
	}

	player := visibleOverRealtime(t, db, club, map[string]string{
		"club_id": club, "app_role": "player", "player_id": "p-fixture-1", "team_id": "t-fixture-1",
	})
	wantPlayer := []string{
		"club/club", "teams/t-fixture-1", "teams/t-2", "players/p-fixture-1", "events/e-1", "invoices/i-1",
	}
	if !equalStrings(player, wantPlayer) {
		t.Errorf("the socket would send a player\n got %v\nwant %v", player, wantPlayer)
	}

	for _, role := range []string{"coach", "manager"} {
		staff := visibleOverRealtime(t, db, club, map[string]string{"club_id": club, "app_role": role})
		if len(staff) != 10 {
			t.Errorf("%s sees %d rows over the socket, want all 10: %v", role, len(staff), staff)
		}
	}

	// A token from another club, or one with no club at all, opens nothing.
	outsider := visibleOverRealtime(t, db, club, map[string]string{
		"club_id": unique("other"), "app_role": "player", "player_id": "p-fixture-1", "team_id": "t-fixture-1",
	})
	if len(outsider) != 0 {
		t.Errorf("another club's token read %d rows here: %v", len(outsider), outsider)
	}
	// A player whose account is not linked to a roster row yet gets the shared
	// rows only, exactly as the API hands them over.
	unlinked := visibleOverRealtime(t, db, club, map[string]string{"club_id": club, "app_role": "player"})
	if !equalStrings(unlinked, []string{"club/club", "teams/t-fixture-1", "teams/t-2"}) {
		t.Errorf("an unlinked player sees %v", unlinked)
	}
}

// supabaseScaffolding recreates only what a plain Postgres lacks. Everything is
// created when missing, never replaced: TEST_DATABASE_URL may point at a real
// project, where auth.jwt() and the publication are Supabase's own.
func supabaseScaffolding(t *testing.T, db *postgres.DB) {
	t.Helper()
	ctx := context.Background()
	statements := []string{
		`DO $$ BEGIN
		   IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		                  WHERE n.nspname = 'auth' AND p.proname = 'jwt') THEN
		     CREATE SCHEMA IF NOT EXISTS auth;
		     CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
		       $fn$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $fn$;
		   END IF;
		 END $$`,
		`DO $$ BEGIN
		   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		     CREATE ROLE authenticated;
		   END IF;
		 END $$`,
		`DO $$ BEGIN
		   IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
		     CREATE PUBLICATION supabase_realtime;
		   END IF;
		 END $$`,
		`GRANT SELECT ON public.record_state TO authenticated`,
		`GRANT USAGE ON SCHEMA public TO authenticated`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(ctx, statement); err != nil {
			t.Fatalf("scaffolding: %v\n%s", err, statement)
		}
	}
}

// visibleOverRealtime reads record_state inside one transaction as the socket's
// role, because SET ROLE and the claims are both connection-local and the pool
// would otherwise hand the next statement to somebody else's connection.
func visibleOverRealtime(t *testing.T, db *postgres.DB, club string, claims map[string]string) []string {
	t.Helper()
	body, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	got := []string{}
	if err := db.Tx(ctx, func(tx postgres.Runner) error {
		if _, err := tx.Exec(ctx, `SELECT set_config('request.jwt.claims', ?, true)`, string(body)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `SET LOCAL ROLE authenticated`); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT entity, record_id FROM record_state WHERE club_id = ? ORDER BY seq`, club)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var entity, id string
			if err := rows.Scan(&entity, &id); err != nil {
				return err
			}
			got = append(got, entity+"/"+id)
		}
		return rows.Err()
	}); err != nil {
		t.Fatalf("read as the socket would: %v", err)
	}
	return got
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestDeviceCursorNeverMovesBackwards(t *testing.T) {
	db := open(t)
	store := postgres.NewStore(db)
	ctx := context.Background()
	club := unique("club")
	device := "d-" + club

	if err := store.NoteDevice(ctx, club, device, 9); err != nil {
		t.Fatalf("note device: %v", err)
	}
	if err := store.NoteDevice(ctx, club, device, 4); err != nil {
		t.Fatalf("note an older cursor: %v", err)
	}
	var seq int64
	if err := db.QueryRow(ctx, `SELECT seq FROM device_cursors WHERE club_id = ? AND device_id = ?`, club, device).
		Scan(&seq); err != nil {
		t.Fatalf("read cursor: %v", err)
	}
	if seq != 9 {
		t.Errorf("a reconnecting device moved the cursor backwards to %d", seq)
	}
}
