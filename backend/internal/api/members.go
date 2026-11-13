package api

import (
	"net/http"

	"github.com/az58740/club-manager/backend/internal/service"
)

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in service.CreateMember
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	result, err := s.svc.CreateMember(r.Context(), actor, in)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, result)
}

func (s *Server) handleLinkPlayer(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in struct {
		PlayerID string `json:"playerId"`
	}
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	user, err := s.svc.LinkPlayer(r.Context(), actor, r.PathValue("id"), in.PlayerID)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]any{"user": user})
}

func (s *Server) handleResetUserPassword(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	result, err := s.svc.ResetMemberPassword(r.Context(), actor, r.PathValue("id"))
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, result)
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		Password        string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	session, err := s.svc.ChangePassword(r.Context(), actor, in.CurrentPassword, in.Password)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, session)
}
