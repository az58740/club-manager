package codec

import (
	"encoding/json"

	"github.com/az58740/club-manager/backend/internal/domain"
)

// Visibility decides who may read a record and names the owner it belongs to.
// The answer is stored beside the payload, so a reader never has to decode a
// body to know whether it may hand the row to a player, and a tombstone — whose
// payload is null — still knows whose row it was.
func Visibility(entity domain.Entity, id string, payload json.RawMessage) (domain.Scope, string, string) {
	switch entity {
	case domain.EntityClub, domain.EntityTeams:
		return domain.ScopeClub, "", ""
	case domain.EntityEvents:
		return domain.ScopeTeam, "", owner(payload, "teamId")
	case domain.EntityPlayers:
		return domain.ScopePlayer, id, owner(payload, "teamId")
	case domain.EntityAttendance, domain.EntityStats, domain.EntityInvoices, domain.EntityPayments:
		return domain.ScopePlayer, owner(payload, "playerId"), ""
	default:
		return domain.ScopeStaff, "", ""
	}
}

// owner reads one identifying field without judging the rest of the payload:
// projection is strict about the contract, visibility only needs a hint.
func owner(payload json.RawMessage, field string) string {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return ""
	}
	var value string
	if err := json.Unmarshal(fields[field], &value); err != nil {
		return ""
	}
	return value
}
