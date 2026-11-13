package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/az58740/club-manager/backend/internal/codec"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
)

// fakeRepo is the record spine in memory. It stamps the same read scope the
// Postgres adapter stamps, so these tests exercise the real visibility rule
// without a database.
type fakeRepo struct {
	rows    []domain.Record
	head    int64
	applied []ports.Apply
	noted   map[string]int64
}

func (f *fakeRepo) Apply(_ context.Context, _ string, change ports.Apply) (domain.Record, error) {
	f.applied = append(f.applied, change)
	f.head++
	record := domain.Record{
		Entity: change.Entity, ID: change.ID, Payload: change.Payload,
		Deleted: change.Deleted, Hash: "hash", Seq: f.head,
	}
	record.Scope, record.PlayerID, record.TeamID = codec.Visibility(change.Entity, change.ID, change.Payload)
	f.rows = append(f.rows, record)
	return record, nil
}

func (f *fakeRepo) Latest(_ context.Context, _ string, entity domain.Entity, id string) (*domain.Record, error) {
	for _, record := range f.rows {
		if record.Entity == entity && record.ID == id {
			return &record, nil
		}
	}
	return nil, nil
}

func (f *fakeRepo) Pull(_ context.Context, _ string, after int64, limit int) ([]domain.Record, int64, error) {
	out := make([]domain.Record, 0, limit)
	cursor := after
	for _, record := range f.rows {
		if record.Seq <= after {
			continue
		}
		if len(out) == limit {
			break
		}
		out = append(out, record)
		cursor = record.Seq
	}
	return out, cursor, nil
}

func (f *fakeRepo) ClubSnapshot(_ context.Context, _ string) ([]domain.Record, int64, error) {
	live := make([]domain.Record, 0, len(f.rows))
	for _, record := range f.rows {
		if !record.Deleted {
			live = append(live, record)
		}
	}
	return live, f.head, nil
}

func (f *fakeRepo) Head(_ context.Context, _ string) (int64, error) { return f.head, nil }

func (f *fakeRepo) NoteDevice(_ context.Context, _, deviceID string, seq int64) error {
	if f.noted == nil {
		f.noted = map[string]int64{}
	}
	f.noted[deviceID] = seq
	return nil
}

// clubRows is one club with two teams, three players and a little money, in the
// order a pull would hand them over.
func clubRows(t *testing.T) *fakeRepo {
	t.Helper()
	repo := &fakeRepo{}
	add := func(entity domain.Entity, id, payload string) {
		t.Helper()
		if _, err := repo.Apply(context.Background(), "club-1", ports.Apply{
			Entity: entity, ID: id, Payload: json.RawMessage(payload), UserID: "u-manager", OpID: "op-" + id,
		}); err != nil {
			t.Fatalf("seed %s/%s: %v", entity, id, err)
		}
	}
	add(domain.EntityPlayers, "p-2", `{"id":"p-2","teamId":"t-1"}`)
	add(domain.EntityCategories, "c-1", `{"id":"c-1"}`)
	add(domain.EntityClub, "club", `{"name":"باشگاه"}`)
	add(domain.EntityTeams, "t-1", `{"id":"t-1"}`)
	add(domain.EntityTeams, "t-2", `{"id":"t-2"}`)
	add(domain.EntityPlayers, "p-1", `{"id":"p-1","teamId":"t-1"}`)
	add(domain.EntityPlayers, "p-3", `{"id":"p-3","teamId":"t-2"}`)
	add(domain.EntityEvents, "e-1", `{"id":"e-1","teamId":"t-1"}`)
	add(domain.EntityEvents, "e-2", `{"id":"e-2","teamId":"t-2"}`)
	add(domain.EntityAttendance, "a-1", `{"id":"a-1","playerId":"p-1"}`)
	add(domain.EntityAttendance, "a-2", `{"id":"a-2","playerId":"p-2"}`)
	add(domain.EntityStats, "s-1", `{"id":"s-1","playerId":"p-1"}`)
	add(domain.EntityInvoices, "i-1", `{"id":"i-1","playerId":"p-1"}`)
	add(domain.EntityInvoices, "i-2", `{"id":"i-2","playerId":"p-2"}`)
	add(domain.EntityPayments, "pay-1", `{"id":"pay-1","playerId":"p-1"}`)
	add(domain.EntityAccounts, "acc-1", `{"id":"acc-1"}`)
	add(domain.EntityTransactions, "tx-1", `{"id":"tx-1"}`)
	add(domain.EntityProducts, "pr-1", `{"id":"pr-1"}`)
	add(domain.EntityStockMovement, "sm-1", `{"id":"sm-1"}`)
	return repo
}

func playerActor() Actor {
	return Actor{
		UserID: "u-player", DeviceID: "d-player", ClubID: "club-1",
		Role: domain.RolePlayer, Status: domain.StatusActive,
		PlayerID: "p-1", TeamID: "t-1",
	}
}

func ids(rows []Row) []string {
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, string(row.Entity)+"/"+row.ID)
	}
	return out
}

func equalIDs(a, b []string) bool {
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

// A player's phone must stay live, but only on the rows the app shows them.
func TestPlayerPullIsScopedToTheirOwnRows(t *testing.T) {
	svc := &Service{deps: Deps{Records: clubRows(t)}}
	page, err := svc.Pull(context.Background(), playerActor(), 0, 500)
	if err != nil {
		t.Fatalf("player pull: %v", err)
	}
	want := []string{
		"club/club", "teams/t-1", "teams/t-2", "players/p-1",
		"events/e-1", "attendance/a-1", "stats/s-1", "invoices/i-1", "payments/pay-1",
	}
	if got := ids(page.Records); !equalIDs(got, want) {
		t.Fatalf("player rows\n got %v\nwant %v", got, want)
	}
	if page.Cursor != 19 {
		t.Fatalf("cursor = %d, want 19: a filtered page must still advance past hidden rows", page.Cursor)
	}
}

func TestStaffPullSeesTheWholeClub(t *testing.T) {
	for _, role := range []domain.Role{domain.RoleManager, domain.RoleCoach} {
		t.Run(string(role), func(t *testing.T) {
			repo := clubRows(t)
			svc := &Service{deps: Deps{Records: repo}}
			actor := playerActor()
			actor.Role = role
			page, err := svc.Pull(context.Background(), actor, 0, 500)
			if err != nil {
				t.Fatalf("%s pull: %v", role, err)
			}
			if len(page.Records) != len(repo.rows) {
				t.Fatalf("%s got %d rows, want all %d", role, len(page.Records), len(repo.rows))
			}
		})
	}
}

func TestPlayerSnapshotIsScopedToo(t *testing.T) {
	svc := &Service{deps: Deps{Records: clubRows(t)}}
	page, err := svc.Snapshot(context.Background(), playerActor())
	if err != nil {
		t.Fatalf("player snapshot: %v", err)
	}
	want := []string{
		"club/club", "teams/t-1", "teams/t-2", "players/p-1",
		"events/e-1", "attendance/a-1", "stats/s-1", "invoices/i-1", "payments/pay-1",
	}
	if got := ids(page.Records); !equalIDs(got, want) {
		t.Fatalf("player snapshot\n got %v\nwant %v", got, want)
	}
}

// A page full of rows the player may not see must not stall the cursor, or the
// phone would ask for the same page forever and never reach its own rows.
func TestFilteredPageKeepsPaging(t *testing.T) {
	svc := &Service{deps: Deps{Records: clubRows(t)}}
	page, err := svc.Pull(context.Background(), playerActor(), 0, 3)
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if got := ids(page.Records); !equalIDs(got, []string{"club/club"}) {
		t.Fatalf("first page rows = %v, want only club/club", got)
	}
	if !page.HasMore || page.Cursor != 3 {
		t.Fatalf("HasMore = %v, cursor = %d; want true and 3", page.HasMore, page.Cursor)
	}
	next, err := svc.Pull(context.Background(), playerActor(), page.Cursor, 500)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if next.Cursor != 19 || next.HasMore {
		t.Fatalf("second page cursor = %d, HasMore = %v; want 19 and false", next.Cursor, next.HasMore)
	}
	if len(next.Records) != 8 {
		t.Fatalf("second page handed %d rows, want the remaining 8", len(next.Records))
	}
}

// An account that is not linked to a player row yet still sees the club and the
// teams, and nothing that belongs to somebody.
func TestUnlinkedPlayerSeesOnlySharedRows(t *testing.T) {
	svc := &Service{deps: Deps{Records: clubRows(t)}}
	actor := playerActor()
	actor.PlayerID, actor.TeamID = "", ""
	page, err := svc.Pull(context.Background(), actor, 0, 500)
	if err != nil {
		t.Fatalf("unlinked pull: %v", err)
	}
	if got := ids(page.Records); !equalIDs(got, []string{"club/club", "teams/t-1", "teams/t-2"}) {
		t.Fatalf("unlinked player rows = %v", got)
	}
}

func TestPlayerCannotWrite(t *testing.T) {
	repo := clubRows(t)
	svc := &Service{deps: Deps{Records: repo}}
	before := len(repo.applied)
	_, err := svc.Push(context.Background(), playerActor(), []Change{{
		Entity: domain.EntityPlayers, ID: "p-1", Payload: json.RawMessage(`{"id":"p-1","teamId":"t-2"}`),
	}})
	var forbidden *domain.ForbiddenError
	if !errors.As(err, &forbidden) {
		t.Fatalf("player push returned %v, want a forbidden error", err)
	}
	if len(repo.applied) != before {
		t.Fatal("a refused push still wrote a record")
	}
}

func TestReadNeedsAnActiveAccountInAClub(t *testing.T) {
	cases := map[string]Actor{
		"pending":        {Status: domain.StatusPending, ClubID: "club-1", Role: domain.RolePlayer},
		"rejected":       {Status: domain.StatusRejected, ClubID: "club-1", Role: domain.RoleCoach},
		"without a club": {Status: domain.StatusActive, Role: domain.RoleManager},
	}
	for name, actor := range cases {
		t.Run(name, func(t *testing.T) {
			svc := &Service{deps: Deps{Records: clubRows(t)}}
			if _, err := svc.Pull(context.Background(), actor, 0, 10); err == nil {
				t.Fatal("pull succeeded for an account that may not read")
			}
			if _, err := svc.Snapshot(context.Background(), actor); err == nil {
				t.Fatal("snapshot succeeded for an account that may not read")
			}
		})
	}
}

// The cursor a player reports is the club's real sequence, so support can tell
// how far that phone read even though most rows were filtered out.
func TestPullNotesTheDeviceCursor(t *testing.T) {
	repo := clubRows(t)
	svc := &Service{deps: Deps{Records: repo}}
	if _, err := svc.Pull(context.Background(), playerActor(), 0, 500); err != nil {
		t.Fatalf("pull: %v", err)
	}
	if repo.noted["d-player"] != 19 {
		t.Fatalf("device cursor = %d, want 19", repo.noted["d-player"])
	}
}
