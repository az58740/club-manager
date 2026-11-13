package codec

import (
	"encoding/json"
	"testing"

	"github.com/az58740/club-manager/backend/internal/domain"
)

// The read scope is a privacy decision, so it is pinned per entity: a new
// entity that nobody classified must land on staff, never on the whole club.
func TestVisibilityPerEntity(t *testing.T) {
	cases := []struct {
		entity   domain.Entity
		id       string
		payload  string
		scope    domain.Scope
		playerID string
		teamID   string
	}{
		{domain.EntityClub, "club", `{"name":"باشگاه"}`, domain.ScopeClub, "", ""},
		{domain.EntityTeams, "t-1", `{"id":"t-1","name":"نوجوانان"}`, domain.ScopeClub, "", ""},
		{domain.EntityPlayers, "p-1", `{"id":"p-1","teamId":"t-1"}`, domain.ScopePlayer, "p-1", "t-1"},
		{domain.EntityEvents, "e-1", `{"id":"e-1","teamId":"t-2"}`, domain.ScopeTeam, "", "t-2"},
		{domain.EntityAttendance, "a-1", `{"id":"a-1","playerId":"p-1"}`, domain.ScopePlayer, "p-1", ""},
		{domain.EntityStats, "s-1", `{"id":"s-1","playerId":"p-2"}`, domain.ScopePlayer, "p-2", ""},
		{domain.EntityInvoices, "i-1", `{"id":"i-1","playerId":"p-1"}`, domain.ScopePlayer, "p-1", ""},
		{domain.EntityPayments, "pay-1", `{"id":"pay-1","playerId":"p-1"}`, domain.ScopePlayer, "p-1", ""},
		{domain.EntityCategories, "c-1", `{"id":"c-1"}`, domain.ScopeStaff, "", ""},
		{domain.EntityAccounts, "acc-1", `{"id":"acc-1"}`, domain.ScopeStaff, "", ""},
		{domain.EntityTransactions, "tx-1", `{"id":"tx-1","playerId":"p-1"}`, domain.ScopeStaff, "", ""},
		{domain.EntityProducts, "pr-1", `{"id":"pr-1"}`, domain.ScopeStaff, "", ""},
		{domain.EntityStockMovement, "sm-1", `{"id":"sm-1","playerId":"p-1"}`, domain.ScopeStaff, "", ""},
	}
	for _, want := range cases {
		t.Run(string(want.entity), func(t *testing.T) {
			scope, playerID, teamID := Visibility(want.entity, want.id, json.RawMessage(want.payload))
			if scope != want.scope || playerID != want.playerID || teamID != want.teamID {
				t.Fatalf("Visibility(%s) = %s/%s/%s, want %s/%s/%s",
					want.entity, scope, playerID, teamID, want.scope, want.playerID, want.teamID)
			}
		})
	}
}

// A ledger entry or a credit sale can name a player, but naming one must never
// make the club's books readable by that player.
func TestPlayerNamedOnAStaffRowStaysStaff(t *testing.T) {
	scope, playerID, _ := Visibility(domain.EntityTransactions, "tx-1", json.RawMessage(`{"playerId":"p-1"}`))
	if scope != domain.ScopeStaff || playerID != "" {
		t.Fatalf("ledger scope = %s, player = %q; want staff and no owner", scope, playerID)
	}
}

// A tombstone has no body. It must not fall back to "everyone may read this".
func TestVisibilityOfATombstone(t *testing.T) {
	scope, playerID, teamID := Visibility(domain.EntityInvoices, "i-1", json.RawMessage("null"))
	if scope != domain.ScopePlayer {
		t.Fatalf("tombstone scope = %s, want player", scope)
	}
	if playerID != "" || teamID != "" {
		t.Fatalf("tombstone owners = %q/%q; the adapter carries the previous ones over", playerID, teamID)
	}
}

func TestVisibilitySurvivesABrokenBody(t *testing.T) {
	for _, payload := range []string{"", "null", "{", `{"playerId":42}`} {
		scope, playerID, teamID := Visibility(domain.EntityAttendance, "a-1", json.RawMessage(payload))
		if scope != domain.ScopePlayer || playerID != "" || teamID != "" {
			t.Fatalf("payload %q gave %s/%q/%q, want player with no owner", payload, scope, playerID, teamID)
		}
	}
}
