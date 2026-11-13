package postgres

import (
	"context"
	"database/sql"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
)

/* --------------------------------- clubs --------------------------------- */

func (d *DB) CreateClub(ctx context.Context, club domain.Club) (domain.Club, error) {
	if club.ID == "" {
		club.ID = NewID("cl")
	}
	if club.InviteCode == "" {
		club.InviteCode = NewCode()
	}
	if club.ShortName == "" {
		club.ShortName = club.Name
	}
	if club.Sport == "" {
		club.Sport = "volleyball"
	}
	_, err := d.Exec(ctx,
		`INSERT INTO clubs (id, name, short_name, sport, invite_code, city, founded, phone, season, created_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		club.ID, club.Name, club.ShortName, club.Sport, club.InviteCode,
		club.City, club.Founded, club.Phone, club.Season, nullText(club.CreatedBy))
	if err != nil {
		return domain.Club{}, err
	}
	return club, nil
}

const clubSelect = `SELECT id, name, short_name, sport, invite_code, city, founded, phone, season, created_by
   FROM clubs`

func (d *DB) Club(ctx context.Context, id string) (*domain.Club, error) {
	return scanClub(d.QueryRow(ctx, clubSelect+` WHERE id = ?`, id))
}

func (d *DB) ClubByInvite(ctx context.Context, code string) (*domain.Club, error) {
	return scanClub(d.QueryRow(ctx, clubSelect+` WHERE invite_code = ?`, code))
}

func scanClub(row Row) (*domain.Club, error) {
	var (
		club      domain.Club
		createdBy sql.NullString
	)
	err := row.Scan(&club.ID, &club.Name, &club.ShortName, &club.Sport, &club.InviteCode,
		&club.City, &club.Founded, &club.Phone, &club.Season, &createdBy)
	if noRow(err) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	club.CreatedBy = createdBy.String
	return &club, nil
}

func (d *DB) RotateInvite(ctx context.Context, clubID, code string) error {
	_, err := d.Exec(ctx, `UPDATE clubs SET invite_code = ?, updated_at = now() WHERE id = ?`, code, clubID)
	return err
}

/* -------------------------------- invites -------------------------------- */

func (d *DB) PutInvite(ctx context.Context, invite ports.Invite) (ports.Invite, error) {
	if invite.ID == "" {
		invite.ID = NewID("inv")
	}
	if invite.Code == "" {
		invite.Code = NewCode()
	}
	if invite.ExpiresAt.IsZero() {
		invite.ExpiresAt = time.Now().UTC().Add(30 * 24 * time.Hour)
	}
	_, err := d.Exec(ctx,
		`INSERT INTO coach_invites (id, club_id, full_name, email, code, team_id, created_by, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		invite.ID, invite.ClubID, invite.FullName, invite.Email, invite.Code,
		nullText(invite.TeamID), nullText(invite.CreatedBy), invite.ExpiresAt.UTC())
	if err != nil {
		return ports.Invite{}, err
	}
	return invite, nil
}

func (d *DB) InviteByCode(ctx context.Context, code string) (*ports.Invite, error) {
	return scanInvite(d.QueryRow(ctx, inviteSelect+` WHERE code = ?`, code))
}

func (d *DB) ListInvites(ctx context.Context, clubID string) ([]ports.Invite, error) {
	rows, err := d.Query(ctx, inviteSelect+` WHERE club_id = ? ORDER BY created_at DESC LIMIT 100`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]ports.Invite, 0, 8)
	for rows.Next() {
		invite, err := scanInviteRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *invite)
	}
	return out, rows.Err()
}

// ClaimInvite marks a code used and returns the club it belongs to.
func (d *DB) ClaimInvite(ctx context.Context, id, userID string) error {
	affected, err := d.Exec(ctx,
		`UPDATE coach_invites SET used_at = now(), used_by = ?
		  WHERE id = ? AND used_at IS NULL AND expires_at > now()`, userID, id)
	if err != nil {
		return err
	}
	if affected == 0 {
		return domain.Invalid("this invite code is already used or has expired")
	}
	return nil
}

const inviteSelect = `SELECT id, club_id, full_name, email, code, team_id, created_by, created_at, expires_at, used_at, used_by
   FROM coach_invites`

func scanInvite(row Row) (*ports.Invite, error) {
	invite, err := scanInviteRow(row)
	if noRow(err) {
		return nil, domain.ErrNotFound
	}
	return invite, err
}

func scanInviteRow(q scanner) (*ports.Invite, error) {
	var (
		invite    ports.Invite
		teamID    sql.NullString
		createdBy sql.NullString
		usedBy    sql.NullString
		expires   time.Time
		used      sql.NullTime
	)
	err := q.Scan(&invite.ID, &invite.ClubID, &invite.FullName, &invite.Email, &invite.Code,
		&teamID, &createdBy, &invite.CreatedAt, &expires, &used, &usedBy)
	if err != nil {
		return nil, err
	}
	invite.TeamID, invite.CreatedBy, invite.ExpiresAt, invite.UsedBy = teamID.String, createdBy.String, expires, usedBy.String
	if used.Valid {
		at := used.Time
		invite.UsedAt = &at
	}
	return &invite, nil
}
