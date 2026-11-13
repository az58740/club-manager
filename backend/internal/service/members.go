package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/codec"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/security"
)

// CreateMember is the manager adding an account by hand. Some players and
// coaches never sign up themselves: the club types their name and address and
// hands over a password in person.
type CreateMember struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone,omitempty"`
	Role     string `json:"role"`
	Password string `json:"password,omitempty"`
	TeamID   string `json:"teamId,omitempty"`
	PlayerID string `json:"playerId,omitempty"`
}

// MemberResult is the account after a manager write, plus the password when one
// was minted here. It is shown once: only its hash is kept.
type MemberResult struct {
	User         domain.User `json:"user"`
	TempPassword string      `json:"tempPassword,omitempty"`
}

func (s *Service) CreateMember(ctx context.Context, actor Actor, in CreateMember) (MemberResult, error) {
	if err := actor.requireManager(); err != nil {
		return MemberResult{}, err
	}
	name := strings.TrimSpace(in.Name)
	email, err := normalizeEmail(in.Email)
	if err != nil {
		return MemberResult{}, err
	}
	if name == "" {
		return MemberResult{}, domain.Invalid("the member needs a name")
	}
	role := domain.Role(strings.TrimSpace(in.Role))
	if role != domain.RoleCoach && role != domain.RolePlayer {
		return MemberResult{}, domain.Invalid("a member is a coach or a player; the club has one manager")
	}
	if _, err := s.deps.Users.UserByEmail(ctx, email); err == nil {
		return MemberResult{}, domain.Invalid("an account with that email already exists")
	} else if !errors.Is(err, domain.ErrNotFound) {
		return MemberResult{}, err
	}

	password := strings.TrimSpace(in.Password)
	if password == "" {
		password = tempPassword()
	}
	if len(password) < minPassword {
		return MemberResult{}, domain.Invalid("the password must be at least %d characters", minPassword)
	}

	teamID := strings.TrimSpace(in.TeamID)
	playerID := strings.TrimSpace(in.PlayerID)
	if playerID != "" {
		if role != domain.RolePlayer {
			return MemberResult{}, domain.Invalid("only a player account is linked to a roster row")
		}
		teamID, err = s.playerTeam(ctx, actor.ClubID, playerID)
		if err != nil {
			return MemberResult{}, err
		}
	}

	user := domain.User{
		ID:       "u-" + randomID(),
		ClubID:   actor.ClubID,
		Name:     name,
		Email:    email,
		Phone:    strings.TrimSpace(in.Phone),
		Role:     role,
		Status:   domain.StatusActive,
		TeamID:   teamID,
		PlayerID: playerID,
		// The manager vouched for the address by typing it, so no confirmation
		// link stands between this account and its first sign-in.
		EmailSeen: true,
	}
	salt, digest, _, err := hashPassword(password)
	if err != nil {
		return MemberResult{}, err
	}
	if err := s.deps.Users.InsertUser(ctx, user, digest, salt); err != nil {
		return MemberResult{}, err
	}
	created, err := s.deps.Users.User(ctx, user.ID)
	if err != nil {
		return MemberResult{}, err
	}
	return MemberResult{User: *created, TempPassword: password}, nil
}

// LinkPlayer is what makes a player's phone live: the account is attached to a
// roster row, and from then on the sync read hands it exactly that player's
// rows. Linking a request that is still waiting also approves it, because
// naming the player is the decision the manager was asked for.
func (s *Service) LinkPlayer(ctx context.Context, actor Actor, userID, playerID string) (*domain.User, error) {
	if err := actor.requireManager(); err != nil {
		return nil, err
	}
	target, err := s.clubMember(ctx, actor, userID)
	if err != nil {
		return nil, err
	}
	if target.Role != domain.RolePlayer {
		return nil, domain.Invalid("only a player account can be linked to a roster row")
	}

	playerID = strings.TrimSpace(playerID)
	teamID := ""
	if playerID != "" {
		teamID, err = s.playerTeam(ctx, actor.ClubID, playerID)
		if err != nil {
			return nil, err
		}
	}
	if err := s.deps.Users.SetUserLink(ctx, target.ID, playerID, teamID); err != nil {
		return nil, err
	}
	if playerID != "" && target.Status == domain.StatusPending {
		if err := s.deps.Users.SetUserStatus(ctx, target.ID, domain.StatusActive, actor.UserID); err != nil {
			return nil, err
		}
	}
	return s.deps.Users.User(ctx, target.ID)
}

// ResetMemberPassword is the manager's answer to "I forgot it". The old password
// stops working everywhere at the same moment, which is also what makes it safe
// to hand the new one over on paper.
func (s *Service) ResetMemberPassword(ctx context.Context, actor Actor, userID string) (MemberResult, error) {
	if err := actor.requireManager(); err != nil {
		return MemberResult{}, err
	}
	target, err := s.clubMember(ctx, actor, userID)
	if err != nil {
		return MemberResult{}, err
	}
	password := tempPassword()
	salt, digest, algo, err := hashPassword(password)
	if err != nil {
		return MemberResult{}, err
	}
	if err := s.deps.Secrets.PutSecret(ctx, target.ID, algo, salt, digest); err != nil {
		return MemberResult{}, err
	}
	if err := s.deps.Sessions.RevokeUserSessions(ctx, target.ID); err != nil {
		return MemberResult{}, err
	}
	updated, err := s.deps.Users.User(ctx, target.ID)
	if err != nil {
		return MemberResult{}, err
	}
	return MemberResult{User: *updated, TempPassword: password}, nil
}

// ChangePassword is the owner changing their own. Every session dies with the
// old password and the caller gets a fresh one, so the phone that made the
// change stays signed in and any other device has to sign in again.
func (s *Service) ChangePassword(ctx context.Context, actor Actor, current, next string) (Session, error) {
	if err := actor.active(); err != nil {
		return Session{}, err
	}
	if len(next) < minPassword {
		return Session{}, domain.Invalid("the password must be at least %d characters", minPassword)
	}
	algo, salt, digest, err := s.deps.Secrets.Secret(ctx, actor.UserID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return Session{}, domain.Unauthorized("this account has no password yet; ask the manager to reset it")
		}
		return Session{}, err
	}
	if err := security.Verify(algo, salt, digest, current); err != nil {
		return Session{}, domain.Unauthorized("the current password is wrong")
	}
	newSalt, newDigest, newAlgo, err := hashPassword(next)
	if err != nil {
		return Session{}, err
	}
	if err := s.deps.Secrets.PutSecret(ctx, actor.UserID, newAlgo, newSalt, newDigest); err != nil {
		return Session{}, err
	}
	if err := s.deps.Sessions.RevokeUserSessions(ctx, actor.UserID); err != nil {
		return Session{}, err
	}
	return s.issue(ctx, actor.UserID, actor.DeviceID, time.Now().UTC())
}

/* --------------------------------- helpers -------------------------------- */

// clubMember finds an account the manager is allowed to touch: one of their own.
func (s *Service) clubMember(ctx context.Context, actor Actor, userID string) (*domain.User, error) {
	target, err := s.deps.Users.User(ctx, strings.TrimSpace(userID))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.Invalid("no such account")
		}
		return nil, err
	}
	if target.ClubID != actor.ClubID {
		return nil, domain.Forbidden("that account belongs to another club")
	}
	return target, nil
}

// playerTeam checks the roster row exists and takes its team from the record
// itself, so an account can never be linked to a team the player is not in.
func (s *Service) playerTeam(ctx context.Context, clubID, playerID string) (string, error) {
	record, err := s.deps.Records.Latest(ctx, clubID, domain.EntityPlayers, playerID)
	if err != nil {
		return "", err
	}
	if record == nil || record.Deleted {
		return "", domain.Invalid("there is no player %s in this club", playerID)
	}
	_, _, teamID := codec.Visibility(record.Entity, record.ID, record.Payload)
	return teamID, nil
}

// tempPassword is long enough to read out over the phone and short enough to
// type once before the owner changes it.
func tempPassword() string {
	var raw [9]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("no randomness: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(raw[:])
}
