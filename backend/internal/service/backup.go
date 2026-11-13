package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/az58740/club-manager/backend/internal/domain"
)

// ImportReport tells the person who pressed "restore" exactly what arrived.
type ImportReport struct {
	Clubs    int            `json:"clubProfile"`
	Records  int            `json:"records"`
	ByEntity map[string]int `json:"byEntity"`
	Skipped  map[string]int `json:"skipped"`
	Head     int64          `json:"head"`
}

// ImportBackup takes the app's own backup file — the bytes the settings screen
// downloads — and writes every shared record it contains into the club. This is
// how the data a club already has moves off Supabase without anything being
// retyped.
//
// It only adds and updates. A record missing from the file stays exactly where
// it is: a partly damaged backup must never be able to empty a club.
func (s *Service) ImportBackup(ctx context.Context, actor Actor, body []byte) (ImportReport, error) {
	if err := actor.requireManager(); err != nil {
		return ImportReport{}, err
	}

	var document map[string]json.RawMessage
	if err := json.Unmarshal(body, &document); err != nil {
		return ImportReport{}, domain.Invalid("that is not a backup file: %v", err)
	}
	if _, ok := document["club"]; !ok {
		return ImportReport{}, domain.Invalid("that backup has no club profile in it")
	}

	report := ImportReport{
		ByEntity: map[string]int{},
		Skipped:  map[string]int{},
	}

	for _, entity := range domain.Entities {
		raw, ok := document[string(entity)]
		if !ok || len(raw) == 0 || string(raw) == "null" {
			continue
		}

		if entity == domain.EntityClub {
			if err := s.importOne(ctx, actor, entity, domain.ClubRecordID, raw, &report); err != nil {
				return report, err
			}
			report.Clubs++
			continue
		}

		var rows []json.RawMessage
		if err := json.Unmarshal(raw, &rows); err != nil {
			return report, domain.Invalid("`%s` in the backup is not a list", entity)
		}
		for _, row := range rows {
			var shaped struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(row, &shaped); err != nil {
				return report, domain.Invalid("`%s` has a row that is not an object", entity)
			}
			if shaped.ID == "" {
				report.Skipped[string(entity)]++
				continue
			}
			if err := s.importOne(ctx, actor, entity, shaped.ID, row, &report); err != nil {
				return report, err
			}
		}
	}

	head, err := s.deps.Records.Head(ctx, actor.ClubID)
	if err != nil {
		return report, err
	}
	report.Head = head
	if report.Records == 0 {
		return report, errors.New("nothing in that backup could be imported")
	}
	return report, nil
}

func (s *Service) importOne(ctx context.Context, actor Actor, entity domain.Entity, id string, payload []byte, report *ImportReport) error {
	// The op id is derived from the content, so re-uploading the same file is
	// recognised as the same write instead of appending a duplicate.
	if _, err := s.apply(ctx, actor, Change{Entity: entity, ID: id, Payload: payload}, ""); err != nil {
		return fmt.Errorf("import %s/%s: %w", entity, id, err)
	}
	report.Records++
	report.ByEntity[string(entity)]++
	return nil
}
