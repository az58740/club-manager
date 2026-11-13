package postgres

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
	"gorm.io/gorm"
)

// Accounts live outside the record payloads on purpose: a backup file or a
// synced player row must never carry a password hash.

var (
	_ ports.UserStore       = (*DB)(nil)
	_ ports.SecretStore     = (*DB)(nil)
	_ ports.SessionStore    = (*DB)(nil)
	_ ports.EmailTokenStore = (*DB)(nil)
	_ ports.PasskeyStore    = (*DB)(nil)
	_ ports.ClubStore       = (*DB)(nil)
	_ ports.InviteStore     = (*DB)(nil)
)

func (d *DB) InsertUser(ctx context.Context, user domain.User, secret []byte, salt []byte) error {
	_, err := d.Exec(ctx,
		`INSERT INTO users (id, club_id, name, email, phone, role, status, team_id, player_id, request_note, photo, email_seen)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		user.ID, nullText(user.ClubID), user.Name, user.Email, nullText(user.Phone), string(user.Role), string(user.Status),
		nullText(user.TeamID), nullText(user.PlayerID), nullText(user.RequestNote), nullText(user.Photo),
		user.EmailSeen)
	if err != nil {
		return err
	}
	if len(secret) > 0 {
		return d.PutSecret(ctx, user.ID, "argon2id", salt, secret)
	}
	return nil
}

func (d *DB) User(ctx context.Context, id string) (*domain.User, error) {
	return scanUser(d.QueryRow(ctx, userSelect+` WHERE id = ?`, id))
}

// UserByEmail matches the way the club types an address, not the way it was
// stored: the unique index is on lower(email) because a mailbox name that
// differs only in capitalisation is the same account.
func (d *DB) UserByEmail(ctx context.Context, email string) (*domain.User, error) {
	return scanUser(d.QueryRow(ctx, userSelect+` WHERE lower(email) = lower(?)`, email))
}

func (d *DB) UsersOfClub(ctx context.Context, clubID string) ([]domain.User, error) {
	rows, err := d.Query(ctx, userSelect+` WHERE club_id = ? ORDER BY created_at DESC LIMIT 500`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.User, 0, 16)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		if user == nil {
			continue
		}
		out = append(out, *user)
	}
	return out, rows.Err()
}

const userSelect = `SELECT id, club_id, name, email, phone, role, status, team_id, player_id,
       request_note, photo, email_seen, created_at, last_login_at FROM users`

// UserCount answers the one question that decides how a club starts: is this
// the first account, or the hundredth?
func (d *DB) UserCount(ctx context.Context) (int, error) {
	var count int
	err := d.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func scanUser(q scanner) (*domain.User, error) {
	var (
		id, clubID, name, email, phone, role, status, teamID, playerID, note, photo sql.NullString
		seen                                                                        bool
		created, login                                                              sql.NullTime
	)
	if err := q.Scan(&id, &clubID, &name, &email, &phone, &role, &status, &teamID, &playerID,
		&note, &photo, &seen, &created, &login); err != nil {
		if noRow(err) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &domain.User{
		ID:          id.String,
		ClubID:      clubID.String,
		Name:        name.String,
		Email:       email.String,
		Phone:       phone.String,
		Role:        domain.Role(role.String),
		Status:      domain.UserStatus(status.String),
		TeamID:      teamID.String,
		PlayerID:    playerID.String,
		RequestNote: note.String,
		Photo:       photo.String,
		EmailSeen:   seen,
		CreatedAt:   stamp(created),
		LastLoginAt: stamp(login),
	}, nil
}

func (d *DB) SetUserClub(ctx context.Context, id, clubID string, role domain.Role, status domain.UserStatus) error {
	_, err := d.Exec(ctx, `UPDATE users SET club_id = ?, role = ?, status = ? WHERE id = ?`,
		clubID, string(role), string(status), id)
	return err
}

func (d *DB) SetUserLink(ctx context.Context, id, playerID, teamID string) error {
	_, err := d.Exec(ctx, `UPDATE users SET player_id = ?, team_id = ? WHERE id = ?`,
		nullText(playerID), nullText(teamID), id)
	return err
}

func (d *DB) SetUserStatus(ctx context.Context, id string, status domain.UserStatus, reviewedBy string) error {
	_, err := d.Exec(ctx,
		`UPDATE users SET status = ?, reviewed_by = ?, reviewed_at = now() WHERE id = ?`,
		string(status), nullText(reviewedBy), id)
	return err
}

func (d *DB) SetUserSeenEmail(ctx context.Context, id string) error {
	_, err := d.Exec(ctx, `UPDATE users SET email_seen = true WHERE id = ?`, id)
	return err
}

func (d *DB) TouchLogin(ctx context.Context, id string, at time.Time) error {
	_, err := d.Exec(ctx, `UPDATE users SET last_login_at = ? WHERE id = ?`, at.UTC(), id)
	return err
}

/* ------------------------------- secrets -------------------------------- */

func (d *DB) Secret(ctx context.Context, userID string) (string, []byte, []byte, error) {
	var (
		algo       string
		salt, hash []byte
	)
	err := d.QueryRow(ctx,
		`SELECT algo, salt, secret_hash FROM credentials WHERE user_id = ?`, userID).
		Scan(&algo, &salt, &hash)
	if noRow(err) {
		return "", nil, nil, domain.ErrNotFound
	}
	return algo, salt, hash, err
}

func (d *DB) PutSecret(ctx context.Context, userID, algo string, salt, hash []byte) error {
	_, err := d.Exec(ctx,
		`INSERT INTO credentials (user_id, algo, salt, secret_hash, updated_at)
		 VALUES (?, ?, ?, ?, now())
		 ON CONFLICT (user_id) DO UPDATE
		    SET algo = EXCLUDED.algo, salt = EXCLUDED.salt, secret_hash = EXCLUDED.secret_hash, updated_at = now()`,
		userID, algo, salt, hash)
	return err
}

/* ------------------------------- sessions -------------------------------- */

func (d *DB) OpenSession(ctx context.Context, session ports.Session) error {
	_, err := d.Exec(ctx,
		`INSERT INTO sessions (id, user_id, device_id, access_hash, refresh_hash, access_at, refresh_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		session.ID, session.UserID, session.DeviceID, session.AccessHash, session.RefreshHash,
		session.AccessAt.UTC(), session.RefreshAt.UTC(), session.ExpiresAt.UTC())
	return err
}

func (d *DB) SessionByAccess(ctx context.Context, accessHash []byte) (*ports.Session, error) {
	return scanSession(d.QueryRow(ctx, sessionSelect+` WHERE access_hash = ?`, accessHash))
}

func (d *DB) SessionByRefresh(ctx context.Context, refreshHash []byte) (*ports.Session, error) {
	return scanSession(d.QueryRow(ctx, sessionSelect+` WHERE refresh_hash = ?`, refreshHash))
}

const sessionSelect = `SELECT id, user_id, device_id, access_hash, refresh_hash, access_at, refresh_at, expires_at, revoked_at
   FROM sessions`

func scanSession(row Row) (*ports.Session, error) {
	var (
		session                      ports.Session
		accessAt, refreshAt, expires time.Time
		revoked                      sql.NullTime
	)
	if err := row.Scan(&session.ID, &session.UserID, &session.DeviceID, &session.AccessHash,
		&session.RefreshHash, &accessAt, &refreshAt, &expires, &revoked); err != nil {
		if noRow(err) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	session.AccessAt, session.RefreshAt, session.ExpiresAt = accessAt, refreshAt, expires
	if revoked.Valid {
		at := revoked.Time
		session.RevokedAt = &at
	}
	return &session, nil
}

func (d *DB) RotateSession(ctx context.Context, id string, accessHash, refreshHash []byte, accessAt, refreshAt, expiresAt time.Time) error {
	_, err := d.Exec(ctx,
		`UPDATE sessions SET access_hash = ?, refresh_hash = ?, access_at = ?, refresh_at = ?, expires_at = ?
		  WHERE id = ?`,
		accessHash, refreshHash, accessAt.UTC(), refreshAt.UTC(), expiresAt.UTC(), id)
	return err
}

func (d *DB) RevokeSession(ctx context.Context, id string) error {
	_, err := d.Exec(ctx, `UPDATE sessions SET revoked_at = now() WHERE id = ?`, id)
	return err
}

// RevokeUserSessions signs an account out everywhere, which is what a password
// reset or a rejection has to do.
func (d *DB) RevokeUserSessions(ctx context.Context, userID string) error {
	_, err := d.Exec(ctx,
		`UPDATE sessions SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL`, userID)
	return err
}

/* ----------------------------- email tokens ------------------------------ */

func (d *DB) PutEmailToken(ctx context.Context, id, userID, purpose string, hash []byte, expiresAt time.Time) error {
	// One live link per purpose: an older code must not still work after a
	// second "send it again" tap.
	if _, err := d.Exec(ctx,
		`UPDATE email_tokens SET used_at = now() WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
		userID, purpose); err != nil {
		return err
	}
	_, err := d.Exec(ctx,
		`INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)`,
		id, userID, purpose, hash, expiresAt.UTC())
	return err
}

func (d *DB) EmailToken(ctx context.Context, hash []byte, purpose string) (*ports.EmailToken, error) {
	var (
		token   ports.EmailToken
		userID  string
		kind    string
		expires time.Time
		used    sql.NullTime
	)
	err := d.QueryRow(ctx,
		`SELECT id, user_id, purpose, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = ?`,
		hash, purpose).Scan(&token.ID, &userID, &kind, &expires, &used)
	if noRow(err) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	token.UserID, token.Purpose, token.ExpiresAt = userID, kind, expires
	if used.Valid {
		at := used.Time
		token.UsedAt = &at
	}
	return &token, nil
}

func (d *DB) UseEmailToken(ctx context.Context, id string) error {
	_, err := d.Exec(ctx, `UPDATE email_tokens SET used_at = now() WHERE id = ?`, id)
	return err
}

/* --------------------------------- passkeys ------------------------------- */

// PutPasskey stores a device authenticator's public key for assertion checks.
func (d *DB) PutPasskey(ctx context.Context, id, userID string, publicKey []byte) error {
	_, err := d.Exec(ctx,
		`INSERT INTO passkeys (id, user_id, public_key, created_at)
		 VALUES (?, ?, ?, now())
		 ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, public_key = EXCLUDED.public_key`,
		id, userID, publicKey)
	return err
}

// Passkey looks up a stored authenticator.
func (d *DB) Passkey(ctx context.Context, id string) (userID string, publicKey []byte, err error) {
	err = d.QueryRow(ctx, `SELECT user_id, public_key FROM passkeys WHERE id = ?`, id).Scan(&userID, &publicKey)
	if noRow(err) {
		return "", nil, domain.ErrNotFound
	}
	return userID, publicKey, err
}

/* --------------------------------- helpers -------------------------------- */

// noRow recognises "this record is not in the database" in either dialect the
// row readers can return: database/sql's empty result or GORM's.
func noRow(err error) bool {
	return errors.Is(err, sql.ErrNoRows) || errors.Is(err, gorm.ErrRecordNotFound)
}

func nullText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func stamp(at sql.NullTime) string {
	if !at.Valid {
		return ""
	}
	return at.Time.UTC().Format(time.RFC3339Nano)
}
