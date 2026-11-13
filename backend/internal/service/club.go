package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
)

// Me reports the account behind a token. A device needs this after a sign-in
// on a different phone, where it knows nothing about the user yet.
func (s *Service) Me(ctx context.Context, actor Actor) (*domain.User, error) {
	return s.deps.Users.User(ctx, actor.UserID)
}

// PublicClub is what a device may know about the club it belongs to. The invite
// code is included because the manager screen shows it to hand out.
type PublicClub struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ShortName  string `json:"shortName"`
	Sport      string `json:"sport"`
	InviteCode string `json:"inviteCode"`
}

func publicClub(club domain.Club) PublicClub {
	return PublicClub{ID: club.ID, Name: club.Name, ShortName: club.ShortName, Sport: club.Sport, InviteCode: club.InviteCode}
}

// CurrentClub answers «which club am I in?» for a device that signed in on a
// different phone.
func (s *Service) CurrentClub(ctx context.Context, actor Actor) (*PublicClub, error) {
	if actor.ClubID == "" {
		return nil, domain.ErrNotFound
	}
	club, err := s.deps.Clubs.Club(ctx, actor.ClubID)
	if err != nil {
		return nil, err
	}
	out := publicClub(*club)
	return &out, nil
}

// Join attaches an already signed-in account to the club behind an invite
// code. It refuses to move anybody who already belongs to a club: a device
// that changes clubs mid-session would otherwise keep data from both.
func (s *Service) Join(ctx context.Context, actor Actor, code string) (*PublicClub, error) {
	normalized := strings.ToUpper(strings.TrimSpace(code))
	if normalized == "" {
		return nil, domain.Invalid("an invite code is required")
	}
	if actor.ClubID != "" {
		club, err := s.deps.Clubs.Club(ctx, actor.ClubID)
		if err != nil {
			return nil, err
		}
		if club.InviteCode != normalized {
			return nil, domain.Forbidden("this account already belongs to another club")
		}
		out := publicClub(*club)
		return &out, nil
	}

	club, err := s.deps.Clubs.ClubByInvite(ctx, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.Invalid("that invite code is not valid")
	}
	if err != nil {
		return nil, err
	}
	status := domain.StatusActive
	if actor.Role == domain.RolePlayer {
		// A player reads nothing personal until the manager names the roster row
		// they are, so joining waits for that decision.
		status = domain.StatusPending
	}
	if err := s.deps.Users.SetUserClub(ctx, actor.UserID, club.ID, actor.Role, status); err != nil {
		return nil, err
	}
	out := publicClub(*club)
	return &out, nil
}

// RotateInvite replaces the club's join code. The old one stops working at the
// same moment, which is the point of rotating it.
func (s *Service) RotateInvite(ctx context.Context, actor Actor) (string, error) {
	if err := actor.requireManager(); err != nil {
		return "", err
	}
	code := newCode()
	if err := s.deps.Clubs.RotateInvite(ctx, actor.ClubID, code); err != nil {
		return "", err
	}
	return code, nil
}

// Members is the manager's user list: staff of this club, pending requests
// included, because those are what they are here to decide.
func (s *Service) Members(ctx context.Context, actor Actor) ([]domain.User, error) {
	if err := actor.requireManager(); err != nil {
		return nil, err
	}
	return s.deps.Users.UsersOfClub(ctx, actor.ClubID)
}

// Review decides a pending request, coach or player. Approving activates the
// account; rejecting signs it out everywhere. A player still has to be linked
// to a roster row before their phone shows anything personal.
func (s *Service) Review(ctx context.Context, actor Actor, userID string, approve bool) error {
	if err := actor.requireManager(); err != nil {
		return err
	}
	target, err := s.deps.Users.User(ctx, userID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.Invalid("no such account")
		}
		return err
	}
	if target.ClubID != actor.ClubID {
		return domain.Forbidden("that request belongs to another club")
	}
	if target.Status != domain.StatusPending {
		return domain.Invalid("only a pending request can be reviewed")
	}

	status := domain.StatusRejected
	if approve {
		status = domain.StatusActive
	}
	if err := s.deps.Users.SetUserStatus(ctx, target.ID, status, actor.UserID); err != nil {
		return err
	}
	if !approve {
		return s.deps.Sessions.RevokeUserSessions(ctx, target.ID)
	}
	return nil
}

// Invite is what the manager screen lists for a coach.
type Invite struct {
	ID        string     `json:"id"`
	FullName  string     `json:"fullName"`
	Email     string     `json:"email"`
	Code      string     `json:"code"`
	TeamID    string     `json:"teamId,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
	UsedAt    *time.Time `json:"usedAt,omitempty"`
}

// CreateInvite issues a one-shot code for a named coach.
func (s *Service) CreateInvite(ctx context.Context, actor Actor, fullName, email string) (Invite, error) {
	if err := actor.requireManager(); err != nil {
		return Invite{}, err
	}
	name := strings.TrimSpace(fullName)
	mail, err := normalizeEmail(email)
	if err != nil {
		return Invite{}, err
	}
	if name == "" {
		return Invite{}, domain.Invalid("the coach needs a name")
	}

	created, err := s.deps.Invites.PutInvite(ctx, ports.Invite{
		ClubID:    actor.ClubID,
		FullName:  name,
		Email:     mail,
		Code:      newCode(),
		CreatedBy: actor.UserID,
	})
	if err != nil {
		return Invite{}, err
	}
	return toInvite(created), nil
}

func (s *Service) Invites(ctx context.Context, actor Actor) ([]Invite, error) {
	if err := actor.requireManager(); err != nil {
		return nil, err
	}
	stored, err := s.deps.Invites.ListInvites(ctx, actor.ClubID)
	if err != nil {
		return nil, err
	}
	out := make([]Invite, 0, len(stored))
	for _, invite := range stored {
		out = append(out, toInvite(invite))
	}
	return out, nil
}

func toInvite(invite ports.Invite) Invite {
	return Invite{
		ID:        invite.ID,
		FullName:  invite.FullName,
		Email:     invite.Email,
		Code:      invite.Code,
		TeamID:    invite.TeamID,
		CreatedAt: invite.CreatedAt,
		ExpiresAt: invite.ExpiresAt,
		UsedAt:    invite.UsedAt,
	}
}
