package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
	"github.com/az58740/club-manager/backend/internal/security"
)

// SignUp is the front door. Three cases matter, and they are the three the app
// has always had: the very first account becomes the manager, a coach arriving
// with a personal invite code is active at once, and anybody else waits for the
// manager to approve them.
type SignUp struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	FullName    string `json:"fullName"`
	Phone       string `json:"phone,omitempty"`
	Role        string `json:"role"`
	Code        string `json:"code,omitempty"`
	TeamID      string `json:"teamId,omitempty"`
	RequestNote string `json:"requestNote,omitempty"`
	DeviceID    string `json:"deviceId,omitempty"`
}

// Result says what the phone should show next. Pending and ConfirmPending are
// the two "not signed in yet" states the login screen already renders.
type Result struct {
	Session  Session `json:"session"`
	SignedIn bool    `json:"signedIn"`
	// EmailVerificationSent means the address still has to be confirmed before
	// the account can sign in.
	EmailVerificationSent bool   `json:"emailVerificationSent"`
	Pending               bool   `json:"pending"`
	Message               string `json:"message,omitempty"`
}

const minPassword = 6

func (s *Service) SignUp(ctx context.Context, in SignUp) (Result, error) {
	email, err := normalizeEmail(in.Email)
	if err != nil {
		return Result{}, err
	}
	name := strings.TrimSpace(in.FullName)
	if name == "" {
		return Result{}, domain.Invalid("a full name is required")
	}
	if len(in.Password) < minPassword {
		return Result{}, domain.Invalid("the password must be at least %d characters", minPassword)
	}
	role := domain.Role(strings.TrimSpace(in.Role))
	if role == "" {
		role = domain.RoleCoach
	}
	if !role.Valid() {
		return Result{}, domain.Invalid("unknown role %q", in.Role)
	}
	if role == domain.RoleManager {
		return Result{}, domain.Invalid("a club has one manager, set when the club is created")
	}

	if _, err := s.deps.Users.UserByEmail(ctx, email); err == nil {
		return Result{}, domain.Invalid("an account with that email already exists")
	} else if !errors.Is(err, domain.ErrNotFound) {
		return Result{}, err
	}

	user := domain.User{
		ID:          "u-" + randomID(),
		Name:        name,
		Email:       email,
		Phone:       strings.TrimSpace(in.Phone),
		Role:        role,
		Status:      domain.StatusPending,
		TeamID:      strings.TrimSpace(in.TeamID),
		RequestNote: strings.TrimSpace(in.RequestNote),
	}

	code := strings.ToUpper(strings.TrimSpace(in.Code))
	joined, err := s.inviteFor(ctx, code)
	switch {
	case err != nil:
		return Result{}, err
	case joined != nil:
		user.ClubID = joined.ClubID
		user.Status = domain.StatusActive
		user.Role = domain.RoleCoach
		if user.TeamID == "" {
			user.TeamID = joined.TeamID
		}
	default:
		// No personal code: the coach asks to join the club named by its
		// invite code and waits. Without either code there is no club to join.
		if code != "" {
			club, err := s.deps.Clubs.ClubByInvite(ctx, code)
			if err != nil {
				if errors.Is(err, domain.ErrNotFound) {
					return Result{}, domain.Invalid("that invite code is not valid")
				}
				return Result{}, err
			}
			user.ClubID = club.ID
		}
	}
	if user.ClubID == "" {
		return Result{}, domain.Invalid("an invite code from the club is required")
	}

	user.EmailSeen = !s.deps.Config.SMTP.Enabled()
	salt, digest, _, err := hashPassword(in.Password)
	if err != nil {
		return Result{}, err
	}
	if err := s.deps.Users.InsertUser(ctx, user, digest, salt); err != nil {
		return Result{}, err
	}

	if joined != nil {
		if err := s.deps.Invites.ClaimInvite(ctx, joined.ID, user.ID); err != nil {
			return Result{}, err
		}
	}

	out := Result{}
	if user.Status != domain.StatusActive {
		out.Pending = true
		out.Message = "the club manager has to approve this account"
	}
	if !user.EmailSeen {
		out.EmailVerificationSent = true
		if err := s.sendEmailToken(ctx, user.ID, email, "verify", "Confirm your club account"); err != nil {
			s.deps.Log.Printf("verification mail failed for %s: %v", email, err)
		}
	}
	if user.Status == domain.StatusActive && user.EmailSeen {
		out.Session, err = s.issue(ctx, user.ID, in.DeviceID, time.Now().UTC())
		if err != nil {
			return Result{}, err
		}
		out.SignedIn = true
	}
	return out, nil
}

// Bootstrap makes the first account and the club it owns in one step, which is
// how a phone that has never seen this server becomes a club.
type Bootstrap struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FullName  string `json:"fullName"`
	Phone     string `json:"phone,omitempty"`
	ClubName  string `json:"clubName"`
	ShortName string `json:"shortName,omitempty"`
	Sport     string `json:"sport,omitempty"`
	DeviceID  string `json:"deviceId,omitempty"`
}

func (s *Service) Bootstrap(ctx context.Context, in Bootstrap) (Session, domain.Club, error) {
	email, err := normalizeEmail(in.Email)
	if err != nil {
		return Session{}, domain.Club{}, err
	}
	name := strings.TrimSpace(in.FullName)
	if name == "" || len(in.Password) < minPassword {
		return Session{}, domain.Club{}, domain.Invalid("a manager account needs a name and a %d character password", minPassword)
	}
	if strings.TrimSpace(in.ClubName) == "" {
		return Session{}, domain.Club{}, domain.Invalid("the club needs a name")
	}

	count, err := s.deps.Users.UserCount(ctx)
	if err != nil {
		return Session{}, domain.Club{}, err
	}
	if count > 0 {
		return Session{}, domain.Club{}, domain.Forbidden("this server already hosts a club; ask its manager for an invite code")
	}

	user := domain.User{
		ID:        "u-" + randomID(),
		Name:      name,
		Email:     email,
		Phone:     strings.TrimSpace(in.Phone),
		Role:      domain.RoleManager,
		Status:    domain.StatusActive,
		EmailSeen: true,
	}
	salt, digest, _, err := hashPassword(in.Password)
	if err != nil {
		return Session{}, domain.Club{}, err
	}

	// The club is written first and named after an id that does not exist yet:
	// if the account insert then fails, nothing claims a half-made manager.
	club, err := s.deps.Clubs.CreateClub(ctx, domain.Club{
		Name:      strings.TrimSpace(in.ClubName),
		ShortName: strings.TrimSpace(in.ShortName),
		Sport:     strings.TrimSpace(in.Sport),
		CreatedBy: user.ID,
	})
	if err != nil {
		return Session{}, domain.Club{}, err
	}
	user.ClubID = club.ID

	if err := s.deps.Users.InsertUser(ctx, user, digest, salt); err != nil {
		return Session{}, domain.Club{}, err
	}

	session, err := s.issue(ctx, user.ID, in.DeviceID, time.Now().UTC())
	if err != nil {
		return Session{}, domain.Club{}, err
	}
	return session, club, nil
}

// SignIn checks the password and, when it passes, opens a fresh session. A
// pending or rejected account is refused with a message the login screen shows.
func (s *Service) SignIn(ctx context.Context, email, password, deviceID string) (Session, error) {
	normalized, err := normalizeEmail(email)
	if err != nil {
		return Session{}, err
	}
	user, err := s.deps.Users.UserByEmail(ctx, normalized)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return Session{}, domain.Unauthorized("email or password is wrong")
		}
		return Session{}, err
	}
	algo, salt, digest, err := s.deps.Secrets.Secret(ctx, user.ID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return Session{}, domain.Unauthorized("email or password is wrong")
		}
		return Session{}, err
	}
	if err := security.Verify(algo, salt, digest, password); err != nil {
		return Session{}, domain.Unauthorized("email or password is wrong")
	}
	switch user.Status {
	case domain.StatusActive:
	case domain.StatusPending:
		return Session{}, domain.Forbidden("the club manager has not approved this account yet")
	default:
		return Session{}, domain.Forbidden("this account was rejected")
	}
	if !user.EmailSeen && s.deps.Config.SMTP.Enabled() {
		return Session{}, domain.Forbidden("confirm your email address before signing in")
	}

	now := time.Now().UTC()
	if !user.EmailSeen {
		// Confirmation is off, so the first successful sign-in records that the
		// owner really does control the address.
		if err := s.deps.Users.SetUserSeenEmail(ctx, user.ID); err != nil {
			return Session{}, err
		}
	}
	if err := s.deps.Users.TouchLogin(ctx, user.ID, now); err != nil {
		return Session{}, err
	}
	return s.issue(ctx, user.ID, deviceID, now)
}

// Refresh rotates a session. The old refresh token dies with the request, so a
// stolen one is only useful until the owner signs in again.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (Session, error) {
	current, err := s.deps.Sessions.SessionByRefresh(ctx, security.Digest(strings.TrimSpace(refreshToken)))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return Session{}, domain.Unauthorized("this session is no longer valid")
		}
		return Session{}, err
	}
	now := time.Now().UTC()
	if current.RevokedAt != nil || current.ExpiresAt.Before(now) {
		return Session{}, domain.Unauthorized("this session expired, sign in again")
	}
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
	if err := s.deps.Sessions.RotateSession(ctx, current.ID, access.Digest, refresh.Digest, accessAt, refreshAt, refreshAt); err != nil {
		return Session{}, err
	}
	user, err := s.deps.Users.User(ctx, current.UserID)
	if err != nil {
		return Session{}, err
	}
	if user.Status != domain.StatusActive {
		return Session{}, domain.Forbidden("this account is not active anymore")
	}
	return Session{AccessToken: access.Raw, RefreshToken: refresh.Raw, ExpiresAt: accessAt, User: user}, nil
}

func (s *Service) SignOut(ctx context.Context, refreshToken string) error {
	session, err := s.deps.Sessions.SessionByRefresh(ctx, security.Digest(strings.TrimSpace(refreshToken)))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil
		}
		return err
	}
	return s.deps.Sessions.RevokeSession(ctx, session.ID)
}

// Identify resolves an access token into the actor every other call needs.
func (s *Service) Identify(ctx context.Context, accessToken string) (Actor, error) {
	session, err := s.deps.Sessions.SessionByAccess(ctx, security.Digest(strings.TrimSpace(accessToken)))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return Actor{}, domain.Unauthorized("sign in again")
		}
		return Actor{}, err
	}
	if session.RevokedAt != nil || session.ExpiresAt.Before(time.Now().UTC()) {
		return Actor{}, domain.Unauthorized("this session expired, sign in again")
	}
	user, err := s.deps.Users.User(ctx, session.UserID)
	if err != nil {
		return Actor{}, err
	}
	if user.Status != domain.StatusActive {
		return Actor{}, domain.Forbidden("this account is not active")
	}
	return Actor{
		UserID:   user.ID,
		DeviceID: session.DeviceID,
		ClubID:   user.ClubID,
		Role:     user.Role,
		Status:   user.Status,
		Email:    user.Email,
		Name:     user.Name,
		PlayerID: user.PlayerID,
		TeamID:   user.TeamID,
	}, nil
}

/* ------------------------------ email links ------------------------------- */

// VerifyEmail consumes a confirmation link.
func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	userID, err := s.consumeToken(ctx, token, "verify")
	if err != nil {
		return err
	}
	return s.deps.Users.SetUserSeenEmail(ctx, userID)
}

func (s *Service) ResendConfirmation(ctx context.Context, email string) error {
	normalized, err := normalizeEmail(email)
	if err != nil {
		return err
	}
	user, err := s.deps.Users.UserByEmail(ctx, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		// Never confirm which addresses exist.
		return nil
	}
	if err != nil {
		return err
	}
	if user.EmailSeen {
		return nil
	}
	return s.sendEmailToken(ctx, user.ID, normalized, "verify", "Confirm your club account")
}

// StartPasswordReset mails a link. It answers the same way whether or not the
// address exists, so it cannot be used to enumerate accounts.
func (s *Service) StartPasswordReset(ctx context.Context, email string) error {
	normalized, err := normalizeEmail(email)
	if err != nil {
		return err
	}
	user, err := s.deps.Users.UserByEmail(ctx, normalized)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	return s.sendEmailToken(ctx, user.ID, normalized, "reset", "Reset your club password")
}

// CompletePasswordReset takes the link token and the new password.
func (s *Service) CompletePasswordReset(ctx context.Context, token, password string) error {
	if len(password) < minPassword {
		return domain.Invalid("the password must be at least %d characters", minPassword)
	}
	userID, err := s.consumeToken(ctx, token, "reset")
	if err != nil {
		return err
	}
	salt, digest, algo, err := hashPassword(password)
	if err != nil {
		return err
	}
	if err := s.deps.Secrets.PutSecret(ctx, userID, algo, salt, digest); err != nil {
		return err
	}
	// A reset is also the answer to "somebody else had my old password".
	return s.revokeEverySession(ctx, userID)
}

/* --------------------------------- passkeys -------------------------------- */

// RegisterPasskey stores the credential id the phone's biometric unlocks. The
// assertion itself is verified on the device: what lands here only maps a
// credential back to an account.
func (s *Service) RegisterPasskey(ctx context.Context, actor Actor, credentialID string, publicKey []byte) error {
	if err := actor.active(); err != nil {
		return err
	}
	if strings.TrimSpace(credentialID) == "" || len(publicKey) == 0 {
		return domain.Invalid("a passkey needs its credential id and public key")
	}
	return s.deps.Passkeys.PutPasskey(ctx, credentialID, actor.UserID, publicKey)
}

/* --------------------------------- internals ------------------------------- */

func (s *Service) inviteFor(ctx context.Context, code string) (*ports.Invite, error) {
	if code == "" {
		return nil, nil
	}
	invite, err := s.deps.Invites.InviteByCode(ctx, code)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if invite.UsedAt != nil || invite.ExpiresAt.Before(time.Now().UTC()) {
		return nil, domain.Invalid("that invite code is used up or expired")
	}
	return invite, nil
}

func (s *Service) sendEmailToken(ctx context.Context, userID, email, purpose, subject string) error {
	token, err := security.NewToken()
	if err != nil {
		return err
	}
	if err := s.deps.Tokens.PutEmailToken(ctx, "et-"+randomID(), userID, purpose, token.Digest,
		time.Now().UTC().Add(24*time.Hour)); err != nil {
		return err
	}
	link := fmt.Sprintf("%s/auth/callback?token=%s&kind=%s", strings.TrimRight(s.deps.Config.Origin, "/"), token.Raw, purpose)
	if s.deps.Config.Origin == "" || s.deps.Config.Origin == "*" {
		link = fmt.Sprintf("token=%s kind=%s", token.Raw, purpose)
	}
	body := "Open this link to continue:\n\n" + link + "\n"
	return s.deps.Mail.Send(ctx, email, subject, body)
}

func (s *Service) consumeToken(ctx context.Context, raw, purpose string) (string, error) {
	token, err := s.deps.Tokens.EmailToken(ctx, security.Digest(strings.TrimSpace(raw)), purpose)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return "", domain.Invalid("that link is not valid")
		}
		return "", err
	}
	if token.UsedAt != nil || token.ExpiresAt.Before(time.Now().UTC()) {
		return "", domain.Invalid("that link expired, request a new one")
	}
	if err := s.deps.Tokens.UseEmailToken(ctx, token.ID); err != nil {
		return "", err
	}
	return token.UserID, nil
}

func (s *Service) revokeEverySession(ctx context.Context, userID string) error {
	return s.deps.Sessions.RevokeUserSessions(ctx, userID)
}

func hashPassword(password string) (salt, digest []byte, algo string, err error) {
	algo, salt, digest, err = security.Hash(password)
	if err != nil {
		return nil, nil, "", err
	}
	return salt, digest, algo, nil
}
