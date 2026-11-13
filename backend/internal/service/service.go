// Package service holds the rules the API enforces: who may do what, and what
// happens to club data when they do it. It talks only to the ports, so nothing
// here knows a database exists.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/mail"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/config"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
	"github.com/az58740/club-manager/backend/internal/security"
)

// Deps is everything the service needs, wired once at start-up.
type Deps struct {
	Users    ports.UserStore
	Secrets  ports.SecretStore
	Sessions ports.SessionStore
	Tokens   ports.EmailTokenStore
	Passkeys ports.PasskeyStore
	Clubs    ports.ClubStore
	Invites  ports.InviteStore
	Records  ports.Repository
	Mail     ports.Mailer
	Health   ports.Pinger
	Config   config.Config
	Log      *log.Logger
}

// Service runs the flows. It is safe for concurrent use: it holds no state
// beyond its dependencies.
type Service struct {
	deps Deps
}

func New(deps Deps) (*Service, error) {
	switch {
	case deps.Users == nil, deps.Secrets == nil, deps.Sessions == nil, deps.Tokens == nil:
		return nil, errors.New("service: auth ports are required")
	case deps.Clubs == nil, deps.Invites == nil, deps.Records == nil:
		return nil, errors.New("service: data ports are required")
	case deps.Passkeys == nil, deps.Mail == nil:
		return nil, errors.New("service: passkey and mail ports are required")
	}
	if deps.Log == nil {
		deps.Log = log.Default()
	}
	return &Service{deps: deps}, nil
}

// Actor is who the request came from, resolved from its access token.
type Actor struct {
	UserID   string
	DeviceID string
	ClubID   string
	Role     domain.Role
	Status   domain.UserStatus
	Email    string
	Name     string
	PlayerID string
	TeamID   string
}

func (a Actor) active() error {
	if a.Status != domain.StatusActive {
		return domain.Forbidden("this account is not active yet")
	}
	return nil
}

// requireStaff is the write gate: players never change shared club data, only
// managers and coaches do.
func (a Actor) requireStaff() error {
	if err := a.requireMember(); err != nil {
		return err
	}
	if !a.Role.Staff() {
		return domain.Forbidden("only the club manager or a coach may do this")
	}
	return nil
}

// requireMember is the read gate. Every active account in the club may read, so
// a player's phone stays live too; visible() decides which rows it is handed.
func (a Actor) requireMember() error {
	if err := a.active(); err != nil {
		return err
	}
	if a.ClubID == "" {
		return domain.Forbidden("this account is not attached to a club yet")
	}
	return nil
}

// visible mirrors what the app shows a player: the club profile, the teams,
// their team's events, and the rows that are about them. The ledger, the bank
// accounts, the shop and anybody else's money never reach their phone.
func (a Actor) visible(record domain.Record) bool {
	if a.Role.Staff() {
		return true
	}
	switch record.Scope {
	case domain.ScopeClub:
		return true
	case domain.ScopeTeam:
		return record.TeamID != "" && record.TeamID == a.TeamID
	case domain.ScopePlayer:
		return record.PlayerID != "" && record.PlayerID == a.PlayerID
	default:
		return false
	}
}

func (a Actor) requireManager() error {
	if err := a.requireStaff(); err != nil {
		return err
	}
	if a.Role != domain.RoleManager {
		return domain.Forbidden("only the club manager may do this")
	}
	return nil
}

// Session is what a signed-in device keeps. Tokens are opaque: the raw refresh
// half is never stored, only its fingerprint.
type Session struct {
	AccessToken  string       `json:"accessToken"`
	RefreshToken string       `json:"refreshToken"`
	ExpiresAt    time.Time    `json:"expiresAt"`
	User         *domain.User `json:"user"`
}

/* --------------------------------- helpers -------------------------------- */

// Ping answers the health check. Without a storage probe the endpoint would
// report "ok" while every request behind it failed.
func (s *Service) Ping(ctx context.Context) error {
	if s.deps.Health == nil {
		return nil
	}
	return s.deps.Health.Ping(ctx)
}

func normalizeEmail(email string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(email))
	if trimmed == "" {
		return "", domain.Invalid("email is required")
	}
	if _, err := mail.ParseAddress(trimmed); err != nil {
		return "", domain.Invalid("that email address is not valid")
	}
	return trimmed, nil
}

func (s *Service) issue(ctx context.Context, userID, deviceID string, now time.Time) (Session, error) {
	access, err := security.NewToken()
	if err != nil {
		return Session{}, err
	}
	refresh, err := security.NewToken()
	if err != nil {
		return Session{}, err
	}
	accessAt := now.Add(s.deps.Config.AccessTTL)
	refreshAt := now.Add(s.deps.Config.RefreshTTL)

	if err := s.deps.Sessions.OpenSession(ctx, ports.Session{
		ID:          "se" + "-" + randomID(),
		UserID:      userID,
		DeviceID:    deviceID,
		AccessHash:  access.Digest,
		RefreshHash: refresh.Digest,
		AccessAt:    accessAt,
		RefreshAt:   refreshAt,
		ExpiresAt:   refreshAt,
	}); err != nil {
		return Session{}, err
	}
	user, err := s.deps.Users.User(ctx, userID)
	if err != nil {
		return Session{}, err
	}
	return Session{AccessToken: access.Raw, RefreshToken: refresh.Raw, ExpiresAt: accessAt, User: user}, nil
}

func randomID() string {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("no randomness: " + err.Error())
	}
	return hex.EncodeToString(raw[:])
}

// newCode mints an invite code in the shape the app already shows: eight
// uppercase characters, handed over by word of mouth on a phone screen.
func newCode() string {
	var raw [4]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("no randomness: " + err.Error())
	}
	return strings.ToUpper(hex.EncodeToString(raw[:]))
}
