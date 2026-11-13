package api

import (
	"net/http"

	"github.com/az58740/club-manager/backend/internal/service"
)

func (s *Server) handleCurrentClub(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	club, err := s.svc.CurrentClub(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, club)
}

func (s *Server) handleJoinClub(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in struct {
		Code string `json:"code"`
	}
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	club, err := s.svc.Join(r.Context(), actor, in.Code)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, club)
}

func (s *Server) handleRotateInvite(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	code, err := s.svc.RotateInvite(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]string{"inviteCode": code})
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	users, err := s.svc.Members(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]any{"users": users})
}

func (s *Server) handleReviewUser(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in struct {
		Approve bool `json:"approve"`
	}
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if err := s.svc.Review(r.Context(), actor, r.PathValue("id"), in.Approve); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"decided": true})
}

func (s *Server) handleCreateInvite(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in struct {
		FullName string `json:"fullName"`
		Email    string `json:"email"`
	}
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	invite, err := s.svc.CreateInvite(r.Context(), actor, in.FullName, in.Email)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, invite)
}

func (s *Server) handleInvites(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	invites, err := s.svc.Invites(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]any{"invites": invites})
}
