package api

import (
	"net/http"

	"github.com/az58740/club-manager/backend/internal/service"
)

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in struct {
		Changes []service.Change `json:"changes"`
	}
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	report, err := s.svc.Push(r.Context(), actor, in.Changes)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, report)
}

func (s *Server) handlePull(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	cursor := queryInt(r, "cursor", 0)
	limit := int(queryInt(r, "limit", 500))
	page, err := s.svc.Pull(r.Context(), actor, cursor, limit)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, page)
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	page, err := s.svc.Snapshot(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, page)
}

func (s *Server) handleRealtimeToken(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	grant, err := s.svc.RealtimeToken(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, grant)
}
