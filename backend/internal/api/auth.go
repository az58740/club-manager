package api

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/service"
)

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	var in service.Bootstrap
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if in.DeviceID == "" {
		in.DeviceID = s.deviceID(r)
	}
	session, club, err := s.svc.Bootstrap(r.Context(), in)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]any{"session": session, "club": club})
}

func (s *Server) handleSignUp(w http.ResponseWriter, r *http.Request) {
	var in service.SignUp
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if in.DeviceID == "" {
		in.DeviceID = s.deviceID(r)
	}
	result, err := s.svc.SignUp(r.Context(), in)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, result)
}

// credentials is the body of both sign-in and the demo password paths.
type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	DeviceID string `json:"deviceId,omitempty"`
}

func (s *Server) handleSignIn(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if in.DeviceID == "" {
		in.DeviceID = s.deviceID(r)
	}
	session, err := s.svc.SignIn(r.Context(), in.Email, in.Password, in.DeviceID)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, session)
}

type tokenBody struct {
	RefreshToken string `json:"refreshToken"`
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var in tokenBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	session, err := s.svc.Refresh(r.Context(), in.RefreshToken)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, session)
}

func (s *Server) handleSignOut(w http.ResponseWriter, r *http.Request) {
	var in tokenBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if err := s.svc.SignOut(r.Context(), in.RefreshToken); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"signedOut": true})
}

type emailBody struct {
	Email string `json:"email"`
}

type linkBody struct {
	Token    string `json:"token"`
	Password string `json:"password,omitempty"`
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var in linkBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if err := s.svc.VerifyEmail(r.Context(), in.Token); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"verified": true})
}

func (s *Server) handleResendConfirmation(w http.ResponseWriter, r *http.Request) {
	var in emailBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if err := s.svc.ResendConfirmation(r.Context(), in.Email); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"sent": true})
}

func (s *Server) handlePasswordReset(w http.ResponseWriter, r *http.Request) {
	var in emailBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if err := s.svc.StartPasswordReset(r.Context(), in.Email); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"sent": true})
}

func (s *Server) handlePasswordResetConfirm(w http.ResponseWriter, r *http.Request) {
	var in linkBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	if err := s.svc.CompletePasswordReset(r.Context(), in.Token, in.Password); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"changed": true})
}

// passkeyBody is a registered WebAuthn credential. The phone verified the
// user; the server only records who the credential belongs to.
type passkeyBody struct {
	CredentialID string `json:"credentialId"`
	PublicKey    string `json:"publicKey"`
}

func (s *Server) handleRegisterPasskey(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	var in passkeyBody
	if err := decode(r, &in); err != nil {
		s.fail(w, err)
		return
	}
	key, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(in.PublicKey))
	if err != nil {
		if key, err = base64.StdEncoding.DecodeString(strings.TrimSpace(in.PublicKey)); err != nil {
			s.fail(w, domain.Invalid("the public key must be base64"))
			return
		}
	}
	if err := s.svc.RegisterPasskey(r.Context(), actor, in.CredentialID, key); err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, map[string]bool{"registered": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, actor service.Actor) {
	user, err := s.svc.Me(r.Context(), actor)
	if err != nil {
		s.fail(w, err)
		return
	}
	s.ok(w, user)
}
