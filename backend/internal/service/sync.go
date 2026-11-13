package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
)

// Change is one record a device wants the club to have.
type Change struct {
	Entity  domain.Entity   `json:"entity"`
	ID      string          `json:"id"`
	Payload json.RawMessage `json:"payload"`
	Deleted bool            `json:"deleted,omitempty"`
	OpID    string          `json:"opId,omitempty"`
}

// Row is a record as the server holds it. `hash` is what a device compares
// before it edits again; `seq` is the cursor it stores.
type Row struct {
	Entity  domain.Entity   `json:"entity"`
	ID      string          `json:"id"`
	Payload json.RawMessage `json:"payload"`
	Deleted bool            `json:"deleted"`
	Hash    string          `json:"hash"`
	Seq     int64           `json:"seq"`
}

// PushReport answers a push: what landed, what was already there, and where the
// device should read from next.
type PushReport struct {
	Applied  []Row  `json:"applied"`
	Head     int64  `json:"head"`
	DeviceID string `json:"deviceId,omitempty"`
}

// PullPage is one page of the log.
type PullPage struct {
	Records    []Row  `json:"records"`
	Cursor     int64  `json:"cursor"`
	HasMore    bool   `json:"hasMore"`
	ServerTime string `json:"serverTime"`
}

// Push writes straight to the club. Manager and coach alike: the phone is the
// author of its rows, the server keeps the history, and a stale edit surfaces
// as a conflict on the hash rather than waiting for somebody's approval.
func (s *Service) Push(ctx context.Context, actor Actor, changes []Change) (PushReport, error) {
	if err := actor.requireStaff(); err != nil {
		return PushReport{}, err
	}
	report := PushReport{Applied: make([]Row, 0, len(changes))}
	for _, change := range changes {
		record, err := s.apply(ctx, actor, change, "")
		if err != nil {
			return report, err
		}
		report.Applied = append(report.Applied, asRow(record))
	}
	head, err := s.deps.Records.Head(ctx, actor.ClubID)
	if err != nil {
		return report, err
	}
	report.Head = head
	report.DeviceID = actor.DeviceID
	return report, nil
}

// Pull walks the log after a cursor. A device that has never synced passes 0
// and the server hands it the whole club in pages — or, for a player, the part
// of it that is theirs. The cursor still advances over the rows they may not
// see, so a filtered page never stalls the next one.
func (s *Service) Pull(ctx context.Context, actor Actor, cursor int64, limit int) (PullPage, error) {
	if err := actor.requireMember(); err != nil {
		return PullPage{}, err
	}
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	records, next, err := s.deps.Records.Pull(ctx, actor.ClubID, cursor, limit)
	if err != nil {
		return PullPage{}, err
	}
	page := PullPage{
		Records:    make([]Row, 0, len(records)),
		Cursor:     next,
		HasMore:    len(records) == limit,
		ServerTime: time.Now().UTC().Format(time.RFC3339),
	}
	for _, record := range records {
		if !actor.visible(record) {
			continue
		}
		page.Records = append(page.Records, asRow(record))
	}
	if actor.DeviceID != "" {
		// Recording how far each phone read is the only way to answer
		// "my device is missing rows" later without asking the owner to
		// describe their screen.
		if err := s.deps.Records.NoteDevice(ctx, actor.ClubID, actor.DeviceID, next); err != nil {
			return PullPage{}, err
		}
	}
	return page, nil
}

// Snapshot is the whole club at once, for a phone that lost its cursor.
func (s *Service) Snapshot(ctx context.Context, actor Actor) (PullPage, error) {
	if err := actor.requireMember(); err != nil {
		return PullPage{}, err
	}
	records, head, err := s.deps.Records.ClubSnapshot(ctx, actor.ClubID)
	if err != nil {
		return PullPage{}, err
	}
	out := PullPage{Records: make([]Row, 0, len(records)), Cursor: head}
	for _, record := range records {
		if !actor.visible(record) {
			continue
		}
		out.Records = append(out.Records, asRow(record))
	}
	if actor.DeviceID != "" {
		if err := s.deps.Records.NoteDevice(ctx, actor.ClubID, actor.DeviceID, head); err != nil {
			return PullPage{}, err
		}
	}
	return out, nil
}

/* --------------------------------- writing -------------------------------- */

// apply is the single path into club data. Every change carries an op id so a
// retried request lands once, not twice.
func (s *Service) apply(ctx context.Context, actor Actor, change Change, op string) (domain.Record, error) {
	if strings.TrimSpace(change.ID) == "" {
		return domain.Record{}, domain.Invalid("a record needs an id")
	}
	record, err := s.deps.Records.Apply(ctx, actor.ClubID, ports.Apply{
		Entity:   change.Entity,
		ID:       change.ID,
		Payload:  change.Payload,
		Deleted:  change.Deleted,
		UserID:   actor.UserID,
		DeviceID: actor.DeviceID,
		OpID:     opID(actor, change, op),
	})
	if err != nil {
		return domain.Record{}, err
	}
	return record, nil
}

// opID is the idempotency key. A device may send its own; otherwise the server
// derives one from the content, which makes an identical retry a no-op and a
// genuine second edit a new row.
func opID(actor Actor, change Change, explicit string) string {
	if explicit != "" {
		return truncate(explicit, 64)
	}
	if change.OpID != "" {
		return truncate(change.OpID, 64)
	}
	digest := sha256.Sum256([]byte(strings.Join([]string{
		actor.DeviceID, string(change.Entity), change.ID, string(change.Payload),
	}, "|")))
	short := hex.EncodeToString(digest[:])[:48]
	if change.Deleted {
		return short + ".d"
	}
	return short
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])[:max]
}

func asRow(record domain.Record) Row {
	return Row{
		Entity:  record.Entity,
		ID:      record.ID,
		Payload: defaultJSON(record.Payload),
		Deleted: record.Deleted,
		Hash:    record.Hash,
		Seq:     record.Seq,
	}
}

func defaultJSON(payload []byte) json.RawMessage {
	if len(payload) == 0 {
		return json.RawMessage("null")
	}
	return json.RawMessage(payload)
}
