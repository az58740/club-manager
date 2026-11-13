package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/az58740/club-manager/backend/internal/codec"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
	"gorm.io/gorm"
)

// Store is the sync spine: record_state holds the current version of every
// row, sync_log the ordered history a phone walks to catch up, and the
// projection tables a queryable view derived from both.
type Store struct{ DB *DB }

func NewStore(db *DB) *Store { return &Store{DB: db} }

var _ ports.Repository = (*Store)(nil)

// Apply writes one record change. It is the only path that mutates club data,
// so a manager edit, an approved coach item and a backup import all pass the
// same checks and land in the same log.
func (s *Store) Apply(ctx context.Context, clubID string, change ports.Apply) (domain.Record, error) {
	if !change.Entity.Valid() {
		return domain.Record{}, domain.Invalid("unknown entity %q", change.Entity)
	}
	if strings.TrimSpace(change.ID) == "" {
		return domain.Record{}, domain.Invalid("record id is required")
	}
	if strings.TrimSpace(change.UserID) == "" {
		return domain.Record{}, domain.Invalid("a record change needs the account that made it")
	}

	payload := append([]byte(nil), change.Payload...)
	if change.Deleted || len(strings.TrimSpace(string(payload))) == 0 {
		payload = []byte("null")
	}
	digest := codec.Hash(payload, change.Deleted)

	var out domain.Record
	err := s.DB.Tx(ctx, func(tx Runner) error {
		existing, found, err := findRecord(ctx, tx, clubID, change.Entity, change.ID)
		if err != nil {
			return err
		}
		if found {
			if existing.Hash == digest && existing.Deleted == change.Deleted {
				// Nothing moved: report the row as it stands instead of growing
				// the log with a no-op every device would have to replay.
				out = existing
				return nil
			}
			if change.BaseHash != "" && change.BaseHash != existing.Hash {
				return &domain.ConflictError{Record: &existing}
			}
		} else if change.BaseHash != "" {
			// The device edited a version it pulled, and the row is gone server
			// side. Say so rather than resurrecting it as a fresh create.
			missing := domain.Record{Entity: change.Entity, ID: change.ID, Payload: []byte("null"), Deleted: true, Hash: codec.Hash(nil, true)}
			return &domain.ConflictError{Record: &missing}
		}

		if change.OpID != "" {
			replayed, ok, err := replayedOp(ctx, tx, clubID, change.OpID)
			if err != nil {
				return err
			}
			if ok {
				out = replayed
				return nil
			}
		}

		record := domain.Record{
			Entity: change.Entity, ID: change.ID, Payload: payload,
			Deleted: change.Deleted, Hash: digest,
		}
		record.Scope, record.PlayerID, record.TeamID = codec.Visibility(change.Entity, change.ID, payload)
		if found && string(payload) == "null" {
			// A tombstone has no body to read an owner from, so it keeps the
			// owner of the row it removes: the player who could see that row
			// still receives the deletion.
			record.Scope, record.PlayerID, record.TeamID = existing.Scope, existing.PlayerID, existing.TeamID
		}

		seq, err := appendLog(ctx, tx, clubID, change, record)
		if err != nil {
			return err
		}
		record.Seq = seq
		if err := putState(ctx, tx, clubID, change, record); err != nil {
			return err
		}
		if err := projectRow(ctx, tx, clubID, change.Entity, change.ID, payload, change.Deleted, change.UserID); err != nil {
			return err
		}

		out = record
		return nil
	})
	if err != nil {
		return domain.Record{}, err
	}
	return out, nil
}

// Latest returns the current row of one record, or nil when it never existed.
func (s *Store) Latest(ctx context.Context, clubID string, entity domain.Entity, id string) (*domain.Record, error) {
	row, found, err := findRecord(ctx, s.DB.Run(), clubID, entity, id)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &row, nil
}

// Pull walks the log after a cursor in sequence order.
func (s *Store) Pull(ctx context.Context, clubID string, after int64, limit int) ([]domain.Record, int64, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	rows, err := s.DB.Query(ctx,
		`SELECT entity, record_id, payload, deleted, hash, seq, scope, player_id, team_id
		   FROM sync_log WHERE club_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
		clubID, after, limit)
	if err != nil {
		return nil, after, err
	}
	defer rows.Close()

	out := make([]domain.Record, 0, 64)
	cursor := after
	for rows.Next() {
		rec, err := scanRecord(rows)
		if err != nil {
			return nil, after, err
		}
		out = append(out, rec)
		cursor = rec.Seq
	}
	if err := rows.Err(); err != nil {
		return nil, after, err
	}
	return out, cursor, nil
}

// ClubSnapshot is the newest version of every live row, read from record_state
// so a first-time device gets one consistent picture instead of replaying the
// whole history.
func (s *Store) ClubSnapshot(ctx context.Context, clubID string) ([]domain.Record, int64, error) {
	head, err := s.Head(ctx, clubID)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.DB.Query(ctx,
		`SELECT entity, record_id, payload, deleted, hash, seq, scope, player_id, team_id
		   FROM record_state WHERE club_id = ? AND deleted = false ORDER BY entity, record_id`, clubID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]domain.Record, 0, 64)
	for rows.Next() {
		rec, err := scanRecord(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return out, head, nil
}

// Head reports the newest sequence for a club, which is what a device keeps as
// its cursor after a full sync.
func (s *Store) Head(ctx context.Context, clubID string) (int64, error) {
	var head *int64
	if err := s.DB.QueryRow(ctx, `SELECT MAX(seq) FROM sync_log WHERE club_id = ?`, clubID).Scan(&head); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	if head == nil {
		return 0, nil
	}
	return *head, nil
}

// NoteDevice records the furthest sequence a device has read, for support:
// when a phone reports missing rows, this says whether it ever asked past that
// point. Older cursors are never moved backwards.
func (s *Store) NoteDevice(ctx context.Context, clubID, deviceID string, seq int64) error {
	if strings.TrimSpace(deviceID) == "" {
		return nil
	}
	_, err := s.DB.Exec(ctx,
		`INSERT INTO device_cursors (club_id, device_id, seq, seen_at)
		 VALUES (?, ?, ?, now())
		 ON CONFLICT (club_id, device_id) DO UPDATE
		    SET seq = EXCLUDED.seq, seen_at = now()
		  WHERE device_cursors.seq < EXCLUDED.seq`,
		clubID, deviceID, seq)
	return err
}

/* ------------------------------- internals ------------------------------- */

type scanner interface{ Scan(dest ...any) error }

func scanRecord(rows scanner) (domain.Record, error) {
	var (
		rec    domain.Record
		entity string
		scope  string
		body   string
	)
	if err := rows.Scan(&entity, &rec.ID, &body, &rec.Deleted, &rec.Hash, &rec.Seq,
		&scope, &rec.PlayerID, &rec.TeamID); err != nil {
		return domain.Record{}, err
	}
	rec.Entity = domain.Entity(entity)
	rec.Scope = domain.Scope(scope)
	rec.Payload = []byte(body)
	return rec, nil
}

// findRecord reports a storage failure instead of treating it as "no such row":
// a dropped connection must never look like a record the server lost, or Apply
// would skip its conflict check and overwrite live data.
func findRecord(ctx context.Context, q Runner, clubID string, entity domain.Entity, id string) (domain.Record, bool, error) {
	var (
		rec  domain.Record
		body string
	)
	err := q.QueryRow(ctx,
		`SELECT entity, record_id, payload, deleted, hash, seq, scope, player_id, team_id
		   FROM record_state WHERE club_id = ? AND entity = ? AND record_id = ?`,
		clubID, string(entity), id).
		Scan(&rec.Entity, &rec.ID, &body, &rec.Deleted, &rec.Hash, &rec.Seq,
			&rec.Scope, &rec.PlayerID, &rec.TeamID)
	if errors.Is(err, sql.ErrNoRows) || errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.Record{}, false, nil
	}
	if err != nil {
		return domain.Record{}, false, err
	}
	rec.Payload = []byte(body)
	return rec, true, nil
}

// replayedOp finds an operation the server already applied, so a phone that
// retried after a dropped response does not write twice.
func replayedOp(ctx context.Context, tx Runner, clubID, opID string) (domain.Record, bool, error) {
	var (
		entity, id, body string
		scope            string
		playerID, teamID string
		deleted          bool
		digest           string
		seq              int64
	)
	err := tx.QueryRow(ctx,
		`SELECT entity, record_id, payload, deleted, hash, seq, scope, player_id, team_id
		   FROM sync_log WHERE club_id = ? AND op_id = ?`, clubID, opID).
		Scan(&entity, &id, &body, &deleted, &digest, &seq, &scope, &playerID, &teamID)
	if errors.Is(err, sql.ErrNoRows) || errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.Record{}, false, nil
	}
	if err != nil {
		return domain.Record{}, false, err
	}
	return domain.Record{
		Entity:   domain.Entity(entity),
		ID:       id,
		Payload:  []byte(body),
		Deleted:  deleted,
		Hash:     digest,
		Seq:      seq,
		Scope:    domain.Scope(scope),
		PlayerID: playerID,
		TeamID:   teamID,
	}, true, nil
}

// appendLog records the change and returns its place in the pull order. The
// sequence is a Postgres identity, so it comes back on the statement rather
// than through a driver call that only MySQL answers.
func appendLog(ctx context.Context, tx Runner, clubID string, change ports.Apply, record domain.Record) (int64, error) {
	var base any
	if change.BaseHash != "" {
		base = change.BaseHash
	}
	var seq int64
	err := tx.QueryRow(ctx,
		`INSERT INTO sync_log (club_id, entity, record_id, payload, deleted, hash, base_hash, user_id, device_id, op_id,
		                       scope, player_id, team_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING seq`,
		clubID, string(record.Entity), record.ID, string(record.Payload), record.Deleted, record.Hash, base,
		change.UserID, change.DeviceID, change.OpID,
		string(record.Scope), record.PlayerID, record.TeamID).Scan(&seq)
	if err != nil {
		if isDuplicate(err) {
			// Another connection applied the same op while this one looked.
			return 0, fmt.Errorf("operation %s was applied concurrently: %w", change.OpID, err)
		}
		return 0, err
	}
	return seq, nil
}

// putState writes the current version of the record. One statement: an UPDATE
// followed by an INSERT would let two writers both miss the row and then both
// try to create it.
func putState(ctx context.Context, tx Runner, clubID string, change ports.Apply, record domain.Record) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO record_state (club_id, entity, record_id, payload, deleted, hash, seq, scope, player_id, team_id,
		                           updated_by, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
		 ON CONFLICT (club_id, entity, record_id) DO UPDATE
		    SET payload = EXCLUDED.payload, deleted = EXCLUDED.deleted, hash = EXCLUDED.hash,
		        seq = EXCLUDED.seq, scope = EXCLUDED.scope, player_id = EXCLUDED.player_id,
		        team_id = EXCLUDED.team_id, updated_by = EXCLUDED.updated_by, updated_at = now()`,
		clubID, string(record.Entity), record.ID, string(record.Payload), record.Deleted, record.Hash, record.Seq,
		string(record.Scope), record.PlayerID, record.TeamID, change.UserID)
	return err
}

// projectRow keeps the queryable tables in step with record_state. A delete is
// a soft delete here: the payload row stays, so nothing a phone reported as
// "gone" can ever take a member's data with it.
func projectRow(ctx context.Context, tx Runner, clubID string, entity domain.Entity, id string, payload []byte, deleted bool, userID string) error {
	if entity == domain.EntityClub {
		row, err := codec.Project(entity, clubID, id, payload)
		if err != nil {
			return err
		}
		args := append(row.AssignArgs(true), userID, clubID)
		_, err = tx.Exec(ctx,
			fmt.Sprintf(`UPDATE clubs SET %s, updated_by = ?, updated_at = now() WHERE id = ?`, row.Assign(true)),
			args...)
		return err
	}

	if deleted {
		_, err := tx.Exec(ctx,
			fmt.Sprintf(`UPDATE %s SET deleted_at = now(), updated_by = ?, updated_at = now() WHERE club_id = ? AND id = ?`,
				tableFor(entity)), userID, clubID, id)
		return err
	}

	row, err := codec.Project(entity, clubID, id, payload)
	if err != nil {
		return err
	}

	columns, placeholders := row.Insert()
	insert := fmt.Sprintf(`INSERT INTO %s (%s, updated_at, updated_by) VALUES (%s, now(), ?)
		ON CONFLICT (club_id, id) DO UPDATE SET %s, updated_at = now(), updated_by = EXCLUDED.updated_by, deleted_at = NULL`,
		row.Table, columns, placeholders, row.Upsert())
	_, err = tx.Exec(ctx, insert, append(append([]any{}, row.Values...), userID)...)
	return err
}

func tableFor(entity domain.Entity) string {
	name, err := codec.Table(entity)
	if err != nil {
		return ""
	}
	return name
}
