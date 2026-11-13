// Package api exposes the service over HTTP. It owns nothing but the shape of
// requests and answers: every rule lives in the service layer.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/config"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/service"
)

// maxBody is the ceiling for a request. A club backup with base64 logos is the
// largest thing this API ever sees, and a few dozen megabytes covers it.
const maxBody = 64 << 20

type Server struct {
	svc *service.Service
	cfg config.Config
	log *log.Logger
}

func New(svc *service.Service, cfg config.Config, logger *log.Logger) *Server {
	if logger == nil {
		logger = log.Default()
	}
	return &Server{svc: svc, cfg: cfg, log: logger}
}

// Handler builds the routes. Go's own mux does the matching: this API has no
// framework to learn and nothing to keep updated.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /v1/health", s.handleHealth)

	mux.HandleFunc("POST /v1/auth/bootstrap", s.handleBootstrap)
	mux.HandleFunc("POST /v1/auth/sign-up", s.handleSignUp)
	mux.HandleFunc("POST /v1/auth/sign-in", s.handleSignIn)
	mux.HandleFunc("POST /v1/auth/refresh", s.handleRefresh)
	mux.HandleFunc("POST /v1/auth/sign-out", s.handleSignOut)
	mux.HandleFunc("POST /v1/auth/verify-email", s.handleVerifyEmail)
	mux.HandleFunc("POST /v1/auth/resend-confirmation", s.handleResendConfirmation)
	mux.HandleFunc("POST /v1/auth/password-reset", s.handlePasswordReset)
	mux.HandleFunc("POST /v1/auth/password-reset/confirm", s.handlePasswordResetConfirm)

	mux.HandleFunc("POST /v1/auth/passkeys", s.auth(s.handleRegisterPasskey))
	mux.HandleFunc("POST /v1/auth/password", s.auth(s.handleChangePassword))

	mux.HandleFunc("GET /v1/me", s.auth(s.handleMe))
	mux.HandleFunc("GET /v1/clubs/current", s.auth(s.handleCurrentClub))
	mux.HandleFunc("POST /v1/clubs/join", s.auth(s.handleJoinClub))
	mux.HandleFunc("POST /v1/clubs/invite-code/rotate", s.auth(s.handleRotateInvite))

	mux.HandleFunc("GET /v1/users", s.auth(s.handleUsers))
	mux.HandleFunc("POST /v1/users", s.auth(s.handleCreateUser))
	mux.HandleFunc("POST /v1/users/{id}/review", s.auth(s.handleReviewUser))
	mux.HandleFunc("POST /v1/users/{id}/link", s.auth(s.handleLinkPlayer))
	mux.HandleFunc("POST /v1/users/{id}/password", s.auth(s.handleResetUserPassword))

	mux.HandleFunc("POST /v1/invites", s.auth(s.handleCreateInvite))
	mux.HandleFunc("GET /v1/invites", s.auth(s.handleInvites))

	mux.HandleFunc("POST /v1/sync/push", s.auth(s.handlePush))
	mux.HandleFunc("GET /v1/sync/pull", s.auth(s.handlePull))
	mux.HandleFunc("GET /v1/sync/snapshot", s.auth(s.handleSnapshot))
	mux.HandleFunc("GET /v1/realtime/token", s.auth(s.handleRealtimeToken))

	mux.HandleFunc("POST /v1/backup/import", s.auth(s.handleImportBackup))

	return s.wrap(mux)
}

/* -------------------------------- middleware ------------------------------- */

func (s *Server) wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.cors(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		recorder := &tracker{ResponseWriter: w, code: http.StatusOK}
		r.Body = http.MaxBytesReader(recorder, r.Body, maxBody)

		started := time.Now()
		next.ServeHTTP(recorder, r)
		s.log.Printf("%s %s %d %s", r.Method, r.URL.Path, recorder.code,
			time.Since(started).Round(time.Millisecond))
	})
}

// tracker remembers the status a handler wrote so the access log can say it.
type tracker struct {
	http.ResponseWriter
	code int
}

func (t *tracker) WriteHeader(code int) {
	t.code = code
	t.ResponseWriter.WriteHeader(code)
}

// cors is deliberately narrow: the PWA is served from another origin, and an
// iPhone will not accept a redirect through a proxy, so the browser must be
// able to call this host directly. Tokens travel in a header, never a cookie,
// so no credentials are granted.
func (s *Server) cors(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return
	}
	if s.cfg.Origin != "*" && s.cfg.Origin != "" && !sameOrigin(s.cfg.Origin, origin) {
		return
	}
	header := w.Header()
	header.Set("Access-Control-Allow-Origin", origin)
	header.Set("Vary", "Origin")
	header.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Device-Id")
	header.Set("Access-Control-Max-Age", "600")
}

// sameOrigin compares scheme://host, so a configured origin with a trailing
// path still matches the browser's shorter Origin header.
func sameOrigin(configured, origin string) bool {
	schemeA, hostA, okA := splitOrigin(configured)
	schemeB, hostB, okB := splitOrigin(origin)
	return okA && okB && strings.EqualFold(schemeA, schemeB) && strings.EqualFold(hostA, hostB)
}

func splitOrigin(raw string) (scheme, host string, ok bool) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return "", "", false
	}
	return parsed.Scheme, parsed.Host, true
}

// auth resolves the bearer token into an actor and hands it to the handler.
func (s *Server) auth(h func(http.ResponseWriter, *http.Request, service.Actor)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			s.fail(w, domain.Unauthorized("sign in again"))
			return
		}
		actor, err := s.svc.Identify(r.Context(), token)
		if err != nil {
			s.fail(w, err)
			return
		}
		h(w, r, actor)
	}
}

func bearer(r *http.Request) string {
	value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return strings.TrimSpace(r.Header.Get("X-Access-Token"))
	}
	return strings.TrimSpace(value)
}

func (s *Server) deviceID(r *http.Request) string {
	return strings.TrimSpace(r.Header.Get("X-Device-Id"))
}

/* --------------------------------- helpers -------------------------------- */

func decode[T any](r *http.Request, out *T) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return domain.Invalid("the request body could not be read")
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return domain.Invalid("a request body is required")
	}
	if err := json.Unmarshal(body, out); err != nil {
		return domain.Invalid("that is not valid JSON: %v", err)
	}
	return nil
}

func (s *Server) json(w http.ResponseWriter, code int, payload any) {
	header := w.Header()
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		s.log.Printf("encode response: %v", err)
	}
}

func (s *Server) ok(w http.ResponseWriter, payload any) { s.json(w, http.StatusOK, payload) }

func (s *Server) fail(w http.ResponseWriter, err error) {
	var (
		validation *domain.ValidationError
		auth       *domain.UnauthorizedError
		forbidden  *domain.ForbiddenError
		conflict   *domain.ConflictError
	)
	status, message := http.StatusInternalServerError, "something went wrong; try again"
	switch {
	case errors.As(err, &conflict):
		status = http.StatusConflict
		s.json(w, status, map[string]any{"error": err.Error(), "current": conflict.Record})
		return
	case errors.As(err, &validation):
		status, message = http.StatusBadRequest, err.Error()
	case errors.As(err, &auth):
		status, message = http.StatusUnauthorized, err.Error()
	case errors.As(err, &forbidden):
		status, message = http.StatusForbidden, err.Error()
	case errors.Is(err, domain.ErrNotFound):
		status = http.StatusNotFound
	default:
		s.log.Printf("request failed: %v", err)
	}
	s.json(w, status, map[string]string{"error": message})
}

func queryInt(r *http.Request, name string, def int64) int64 {
	raw := strings.TrimSpace(r.URL.Query().Get(name))
	if raw == "" {
		return def
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return def
	}
	return value
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.svc.Ping(r.Context()); err != nil {
		s.json(w, http.StatusServiceUnavailable, map[string]string{"status": "down", "error": err.Error()})
		return
	}
	s.ok(w, map[string]string{"status": "ok", "time": time.Now().UTC().Format(time.RFC3339)})
}
