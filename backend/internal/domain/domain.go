// Package domain holds the vocabulary the whole service shares: accounts, clubs
// and the record entities the PWA syncs.
package domain

import (
	"encoding/json"
	"errors"
	"fmt"
)

// Role is what an account is allowed to do inside its club.
type Role string

const (
	RoleManager Role = "manager"
	RoleCoach   Role = "coach"
	RolePlayer  Role = "player"
)

func (r Role) Valid() bool {
	switch r {
	case RoleManager, RoleCoach, RolePlayer:
		return true
	}
	return false
}

// Staff may see and change club data; players only see their own rows.
func (r Role) Staff() bool { return r == RoleManager || r == RoleCoach }

// Scope is who may read a record row. It is stored beside the payload so a
// player's phone is handed only its own rows without the reader decoding every
// body, and so the database can enforce the same rule on a live subscription.
type Scope string

const (
	ScopeClub   Scope = "club"   // every member: the club profile and the teams
	ScopeTeam   Scope = "team"   // one team's members: its events
	ScopePlayer Scope = "player" // one player: their own row, attendance, stats and money
	ScopeStaff  Scope = "staff"  // manager and coach: the ledger, accounts and stock
)

// UserStatus is the approval state of an account.
type UserStatus string

const (
	StatusActive   UserStatus = "active"
	StatusPending  UserStatus = "pending"
	StatusRejected UserStatus = "rejected"
)

// User is one sign-in account. Password material lives beside it and never in a
// record payload. The tags are the client's own field names: the PWA reads an
// account straight into its AppUser shape.
type User struct {
	ID          string     `json:"id"`
	ClubID      string     `json:"clubId,omitempty"`
	Name        string     `json:"name"`
	Email       string     `json:"email"`
	Phone       string     `json:"phone,omitempty"`
	Role        Role       `json:"role"`
	Status      UserStatus `json:"status"`
	TeamID      string     `json:"teamId,omitempty"`
	PlayerID    string     `json:"playerId,omitempty"`
	RequestNote string     `json:"requestNote,omitempty"`
	Photo       string     `json:"photo,omitempty"`
	EmailSeen   bool       `json:"emailSeen"`
	CreatedAt   string     `json:"createdAt,omitempty"`
	LastLoginAt string     `json:"lastLoginAt,omitempty"`
}

// Club is the tenancy root: every record row carries a ClubID.
type Club struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ShortName  string `json:"shortName,omitempty"`
	Sport      string `json:"sport,omitempty"`
	InviteCode string `json:"inviteCode,omitempty"`
	City       string `json:"city,omitempty"`
	Season     string `json:"season,omitempty"`
	Phone      string `json:"phone,omitempty"`
	Founded    string `json:"founded,omitempty"`
	Logo       string `json:"logo,omitempty"`
	CreatedBy  string `json:"createdBy,omitempty"`
}

// Entity names are the wire names the PWA already uses, so the client keeps its
// own vocabulary and the server maps it onto tables.
type Entity string

const (
	EntityClub          Entity = "club"
	EntityTeams         Entity = "teams"
	EntityPlayers       Entity = "players"
	EntityEvents        Entity = "events"
	EntityAttendance    Entity = "attendance"
	EntityStats         Entity = "stats"
	EntityInvoices      Entity = "invoices"
	EntityPayments      Entity = "payments"
	EntityCategories    Entity = "categories"
	EntityAccounts      Entity = "accounts"
	EntityTransactions  Entity = "transactions"
	EntityProducts      Entity = "products"
	EntityStockMovement Entity = "stockMovements"
)

// Entities is ordered the way the PWA flattens its state, which keeps diffs and
// import reports comparable with the client's own counters.
var Entities = []Entity{
	EntityClub, EntityTeams, EntityPlayers, EntityEvents, EntityAttendance,
	EntityStats, EntityInvoices, EntityPayments, EntityCategories, EntityAccounts,
	EntityTransactions, EntityProducts, EntityStockMovement,
}

func (e Entity) Valid() bool {
	for _, want := range Entities {
		if want == e {
			return true
		}
	}
	return false
}

// ClubRecordID is the fixed id the club profile row uses; the PWA sends the same
// constant for it.
const ClubRecordID = "club"

// Record is one synced row. Payload keeps the exact bytes the device sent: the
// projected columns are a queryable view, never the only copy of a field.
// The read scope never travels on the wire; it is the server's own decision.
type Record struct {
	Entity   Entity
	ID       string
	Payload  json.RawMessage
	Deleted  bool
	Hash     string
	Seq      int64
	Scope    Scope  `json:"-"`
	PlayerID string `json:"-"`
	TeamID   string `json:"-"`
}

// ErrNotFound marks a missing row so the HTTP layer can answer 404 without
// leaking storage details.
var ErrNotFound = errors.New("not found")

// ConflictError reports that the device edited a version the server no longer
// has, and carries the current row so the client can show both.
type ConflictError struct {
	Record *Record
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("record changed on the server: %s/%s", e.current().Entity, e.current().ID)
}

func (e *ConflictError) current() *Record {
	if e == nil || e.Record == nil {
		return &Record{}
	}
	return e.Record
}

// ValidationError is a client mistake: bad payload, unknown field, impossible
// value. The message is safe to show.
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func Invalid(format string, args ...any) *ValidationError {
	return &ValidationError{Msg: fmt.Sprintf(format, args...)}
}

// ForbiddenError is a role or membership decision, not a missing row.
type ForbiddenError struct{ Msg string }

func (e *ForbiddenError) Error() string { return e.Msg }

func Forbidden(format string, args ...any) *ForbiddenError {
	return &ForbiddenError{Msg: fmt.Sprintf(format, args...)}
}

// UnauthorizedError answers "who are you": bad credentials or a dead session.
// It is distinct from Forbidden because the phone must re-login for one and
// simply stop for the other.
type UnauthorizedError struct{ Msg string }

func (e *UnauthorizedError) Error() string { return e.Msg }

func Unauthorized(format string, args ...any) *UnauthorizedError {
	return &UnauthorizedError{Msg: fmt.Sprintf(format, args...)}
}
