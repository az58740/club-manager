// Package ports describes what the services need from storage, so the HTTP and
// application layers never import the database driver.
package ports

import (
	"context"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
)

// Apply carries one record change with everything needed to log it.
type Apply struct {
	Entity   domain.Entity
	ID       string
	Payload  []byte
	Deleted  bool
	BaseHash string
	UserID   string
	DeviceID string
	OpID     string
}

// Repository is the record spine: write a row, read it back, walk the log.
type Repository interface {
	// Apply writes one record and appends it to the sync log. It returns the
	// stored row including its sequence and hash, or a *domain.ConflictError
	// when the device built its edit on a version the server no longer has.
	Apply(ctx context.Context, clubID string, change Apply) (domain.Record, error)

	// Latest returns the current row for a record, or nil when it never existed.
	Latest(ctx context.Context, clubID string, entity domain.Entity, id string) (*domain.Record, error)

	// Pull walks the log after a cursor. Rows arrive in sequence order.
	Pull(ctx context.Context, clubID string, after int64, limit int) ([]domain.Record, int64, error)

	// ClubSnapshot rebuilds every live record of a club for a first-time device.
	ClubSnapshot(ctx context.Context, clubID string) ([]domain.Record, int64, error)

	// Head reports the newest sequence for a club.
	Head(ctx context.Context, clubID string) (int64, error)

	// NoteDevice records how far a device has read, for support.
	NoteDevice(ctx context.Context, clubID, deviceID string, seq int64) error
}

// ClubStore holds clubs and their invite codes.
type ClubStore interface {
	CreateClub(ctx context.Context, club domain.Club) (domain.Club, error)
	Club(ctx context.Context, id string) (*domain.Club, error)
	ClubByInvite(ctx context.Context, code string) (*domain.Club, error)
	RotateInvite(ctx context.Context, clubID, code string) error
}

// UserStore holds accounts, their roles and their approval state.
type UserStore interface {
	InsertUser(ctx context.Context, user domain.User, secret []byte, salt []byte) error
	User(ctx context.Context, id string) (*domain.User, error)
	UserByEmail(ctx context.Context, email string) (*domain.User, error)
	UsersOfClub(ctx context.Context, clubID string) ([]domain.User, error)
	UserCount(ctx context.Context) (int, error)
	SetUserClub(ctx context.Context, id, clubID string, role domain.Role, status domain.UserStatus) error
	// SetUserLink attaches an account to the roster row it belongs to, which is
	// what decides how much of the club that phone may read. Empty ids detach it.
	SetUserLink(ctx context.Context, id, playerID, teamID string) error
	SetUserStatus(ctx context.Context, id string, status domain.UserStatus, reviewedBy string) error
	SetUserSeenEmail(ctx context.Context, id string) error
	TouchLogin(ctx context.Context, id string, at time.Time) error
}

// PasskeyStore maps a WebAuthn credential back to its account. The PWA checks
// the assertion on the device; the server only needs to know who it came from.
type PasskeyStore interface {
	PutPasskey(ctx context.Context, id, userID string, publicKey []byte) error
	Passkey(ctx context.Context, id string) (userID string, publicKey []byte, err error)
}

// SecretStore keeps password and token material away from record payloads.
type SecretStore interface {
	Secret(ctx context.Context, userID string) (algo string, salt []byte, hash []byte, err error)
	PutSecret(ctx context.Context, userID, algo string, salt, hash []byte) error
}

// SessionStore issues and rotates the opaque tokens the PWA carries.
type SessionStore interface {
	OpenSession(ctx context.Context, session Session) error
	SessionByAccess(ctx context.Context, accessHash []byte) (*Session, error)
	SessionByRefresh(ctx context.Context, refreshHash []byte) (*Session, error)
	RotateSession(ctx context.Context, id string, accessHash, refreshHash []byte, accessAt, refreshAt, expiresAt time.Time) error
	RevokeSession(ctx context.Context, id string) error
	RevokeUserSessions(ctx context.Context, userID string) error
}

// Session is one signed-in device.
type Session struct {
	ID          string
	UserID      string
	DeviceID    string
	AccessHash  []byte
	RefreshHash []byte
	AccessAt    time.Time
	RefreshAt   time.Time
	ExpiresAt   time.Time
	RevokedAt   *time.Time
}

// EmailTokenStore backs verification and password reset links.
type EmailTokenStore interface {
	PutEmailToken(ctx context.Context, id, userID, purpose string, hash []byte, expiresAt time.Time) error
	EmailToken(ctx context.Context, hash []byte, purpose string) (*EmailToken, error)
	UseEmailToken(ctx context.Context, id string) error
}

// EmailToken is one outstanding verification or reset link.
type EmailToken struct {
	ID        string
	UserID    string
	Purpose   string
	ExpiresAt time.Time
	UsedAt    *time.Time
}

// InviteStore holds coach invite codes.
type InviteStore interface {
	PutInvite(ctx context.Context, invite Invite) (Invite, error)
	InviteByCode(ctx context.Context, code string) (*Invite, error)
	ClaimInvite(ctx context.Context, id, userID string) error
	ListInvites(ctx context.Context, clubID string) ([]Invite, error)
}

// Invite is a manager-issued coach code.
type Invite struct {
	ID        string
	ClubID    string
	FullName  string
	Email     string
	Code      string
	TeamID    string
	CreatedBy string
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedAt    *time.Time
	UsedBy    string
}

// Mailer sends verification and reset links.
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}

// Pinger reports whether storage answers at all, which is what /health needs.
type Pinger interface {
	Ping(ctx context.Context) error
}
