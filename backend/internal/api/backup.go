package api

import (
	"io"
	"net/http"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/service"
)

// handleImportBackup takes the backup file itself as the body, exactly as the
// settings screen downloads it, so a phone can restore without re-encoding.
func (s *Server) handleImportBackup(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.fail(w, domain.Invalid("the backup could not be read"))
		return
	}
	if len(body) == 0 {
		s.fail(w, domain.Invalid("the backup is empty"))
		return
	}
	report, err := s.svc.ImportBackup(r.Context(), actor, body)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, report)
}
