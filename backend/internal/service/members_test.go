package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/az58740/club-manager/backend/internal/config"
	"github.com/az58740/club-manager/backend/internal/domain"
	"github.com/az58740/club-manager/backend/internal/ports"
	"github.com/az58740/club-manager/backend/internal/security"
)

/* --------------------------------- fakes ---------------------------------- */

type fakeSecret struct {
	algo       string
	salt, hash []byte
}

type fakeSecrets struct{ rows map[string]fakeSecret }

func (f *fakeSecrets) Secret(_ context.Context, userID string) (string, []byte, []byte, error) {
	secret, ok := f.rows[userID]
	if !ok {
		return "", nil, nil, domain.ErrNotFound
	}
	return secret.algo, secret.salt, secret.hash, nil
}

func (f *fakeSecrets) PutSecret(_ context.Context, userID, algo string, salt, hash []byte) error {
	if f.rows == nil {
		f.rows = map[string]fakeSecret{}
	}
	f.rows[userID] = fakeSecret{algo: algo, salt: salt, hash: hash}
	return nil
}

// fakeUsers keeps accounts in a map and stores the password beside them exactly
// as the Postgres adapter does, so a test can sign in with what a flow minted.
type fakeUsers struct {
	rows    map[string]domain.User
	secrets *fakeSecrets
}

func (f *fakeUsers) InsertUser(ctx context.Context, user domain.User, secret, salt []byte) error {
	if f.rows == nil {
		f.rows = map[string]domain.User{}
	}
	f.rows[user.ID] = user
	if len(secret) > 0 && f.secrets != nil {
		return f.secrets.PutSecret(ctx, user.ID, "argon2id", salt, secret)
	}
	return nil
}

func (f *fakeUsers) User(_ context.Context, id string) (*domain.User, error) {
	user, ok := f.rows[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return &user, nil
}

func (f *fakeUsers) UserByEmail(_ context.Context, email string) (*domain.User, error) {
	for _, user := range f.rows {
		if user.Email == email {
			found := user
			return &found, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *fakeUsers) UsersOfClub(_ context.Context, clubID string) ([]domain.User, error) {
	out := make([]domain.User, 0, len(f.rows))
	for _, user := range f.rows {
		if user.ClubID == clubID {
			out = append(out, user)
		}
	}
	return out, nil
}

func (f *fakeUsers) UserCount(context.Context) (int, error) { return len(f.rows), nil }

func (f *fakeUsers) edit(id string, change func(*domain.User)) error {
	user, ok := f.rows[id]
	if !ok {
		return domain.ErrNotFound
	}
	change(&user)
	f.rows[id] = user
	return nil
}

func (f *fakeUsers) SetUserClub(_ context.Context, id, clubID string, role domain.Role, status domain.UserStatus) error {
	return f.edit(id, func(user *domain.User) {
		user.ClubID, user.Role, user.Status = clubID, role, status
	})
}

func (f *fakeUsers) SetUserLink(_ context.Context, id, playerID, teamID string) error {
	return f.edit(id, func(user *domain.User) { user.PlayerID, user.TeamID = playerID, teamID })
}

func (f *fakeUsers) SetUserStatus(_ context.Context, id string, status domain.UserStatus, _ string) error {
	return f.edit(id, func(user *domain.User) { user.Status = status })
}

func (f *fakeUsers) SetUserSeenEmail(_ context.Context, id string) error {
	return f.edit(id, func(user *domain.User) { user.EmailSeen = true })
}

func (f *fakeUsers) TouchLogin(_ context.Context, id string, at time.Time) error {
	return f.edit(id, func(user *domain.User) { user.LastLoginAt = at.UTC().Format(time.RFC3339) })
}

type fakeClubs struct{ row domain.Club }

func (f *fakeClubs) CreateClub(_ context.Context, club domain.Club) (domain.Club, error) {
	f.row = club
	return club, nil
}

func (f *fakeClubs) Club(_ context.Context, id string) (*domain.Club, error) {
	if f.row.ID != id {
		return nil, domain.ErrNotFound
	}
	club := f.row
	return &club, nil
}

func (f *fakeClubs) ClubByInvite(_ context.Context, code string) (*domain.Club, error) {
	if f.row.InviteCode != code {
		return nil, domain.ErrNotFound
	}
	club := f.row
	return &club, nil
}

func (f *fakeClubs) RotateInvite(_ context.Context, _, code string) error {
	f.row.InviteCode = code
	return nil
}

type fakeSessions struct {
	opened       int
	revokedUsers []string
}

func (f *fakeSessions) OpenSession(context.Context, ports.Session) error {
	f.opened++
	return nil
}

func (f *fakeSessions) SessionByAccess(context.Context, []byte) (*ports.Session, error) {
	return nil, domain.ErrNotFound
}

func (f *fakeSessions) SessionByRefresh(context.Context, []byte) (*ports.Session, error) {
	return nil, domain.ErrNotFound
}

func (f *fakeSessions) RotateSession(context.Context, string, []byte, []byte, time.Time, time.Time, time.Time) error {
	return nil
}

func (f *fakeSessions) RevokeSession(context.Context, string) error { return nil }

func (f *fakeSessions) RevokeUserSessions(_ context.Context, userID string) error {
	f.revokedUsers = append(f.revokedUsers, userID)
	return nil
}

// memberFixture is a club with a manager, a waiting player request and the
// roster rows clubRows() seeds.
type memberFixture struct {
	svc      *Service
	users    *fakeUsers
	secrets  *fakeSecrets
	sessions *fakeSessions
	repo     *fakeRepo
	manager  Actor
}

func newMemberFixture(t *testing.T) memberFixture {
	t.Helper()
	secrets := &fakeSecrets{}
	users := &fakeUsers{rows: map[string]domain.User{}, secrets: secrets}
	sessions := &fakeSessions{}
	repo := clubRows(t)
	svc := &Service{deps: Deps{
		Users: users, Secrets: secrets, Sessions: sessions, Records: repo,
		Clubs:  &fakeClubs{row: domain.Club{ID: "club-1", Name: "Club", InviteCode: "JOINCODE"}},
		Config: config.Config{AccessTTL: 15 * time.Minute, RefreshTTL: 24 * time.Hour},
	}}
	users.rows["u-manager"] = domain.User{
		ID: "u-manager", ClubID: "club-1", Name: "Manager", Email: "manager@club.example",
		Role: domain.RoleManager, Status: domain.StatusActive, EmailSeen: true,
	}
	users.rows["u-waiting"] = domain.User{
		ID: "u-waiting", ClubID: "club-1", Name: "Waiting Player", Email: "waiting@club.example",
		Role: domain.RolePlayer, Status: domain.StatusPending, EmailSeen: true,
	}
	return memberFixture{
		svc: svc, users: users, secrets: secrets, sessions: sessions, repo: repo,
		manager: Actor{
			UserID: "u-manager", DeviceID: "d-manager", ClubID: "club-1",
			Role: domain.RoleManager, Status: domain.StatusActive,
		},
	}
}

func (f memberFixture) passwordOf(t *testing.T, userID, password string) {
	t.Helper()
	algo, salt, hash, err := f.secrets.Secret(context.Background(), userID)
	if err != nil {
		t.Fatalf("secret for %s: %v", userID, err)
	}
	if err := security.Verify(algo, salt, hash, password); err != nil {
		t.Fatalf("stored password does not match the one handed over: %v", err)
	}
}

/* ---------------------------------- tests --------------------------------- */

// The whole point of the lifecycle: a manager creates the account, the player
// signs in with the password they were given, and their phone is handed exactly
// their own rows.
func TestCreatedPlayerSignsInAndReadsTheirOwnRows(t *testing.T) {
	f := newMemberFixture(t)
	ctx := context.Background()

	created, err := f.svc.CreateMember(ctx, f.manager, CreateMember{
		Name: "Ali", Email: "Ali@Club.example", Role: "player", PlayerID: "p-1",
	})
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	if created.TempPassword == "" || len(created.TempPassword) < minPassword {
		t.Fatalf("temp password = %q, want one the manager can hand over", created.TempPassword)
	}
	if created.User.PlayerID != "p-1" || created.User.TeamID != "t-1" {
		t.Fatalf("link = %q/%q, want p-1/t-1 taken from the roster row", created.User.PlayerID, created.User.TeamID)
	}
	if created.User.Email != "ali@club.example" {
		t.Fatalf("email = %q, want it normalised", created.User.Email)
	}
	if created.User.Status != domain.StatusActive || !created.User.EmailSeen {
		t.Fatalf("status = %s, emailSeen = %v; the manager vouched for this account", created.User.Status, created.User.EmailSeen)
	}
	f.passwordOf(t, created.User.ID, created.TempPassword)

	session, err := f.svc.SignIn(ctx, "ali@club.example", created.TempPassword, "d-phone")
	if err != nil {
		t.Fatalf("player sign-in: %v", err)
	}
	actor := Actor{
		UserID: session.User.ID, ClubID: session.User.ClubID, Role: session.User.Role,
		Status: session.User.Status, PlayerID: session.User.PlayerID, TeamID: session.User.TeamID,
		DeviceID: "d-phone",
	}
	page, err := f.svc.Pull(ctx, actor, 0, 500)
	if err != nil {
		t.Fatalf("player pull: %v", err)
	}
	want := []string{
		"club/club", "teams/t-1", "teams/t-2", "players/p-1",
		"events/e-1", "attendance/a-1", "stats/s-1", "invoices/i-1", "payments/pay-1",
	}
	if got := ids(page.Records); !equalIDs(got, want) {
		t.Fatalf("created player rows\n got %v\nwant %v", got, want)
	}
}

func TestLinkPlayerApprovesTheWaitingRequest(t *testing.T) {
	f := newMemberFixture(t)
	user, err := f.svc.LinkPlayer(context.Background(), f.manager, "u-waiting", "p-3")
	if err != nil {
		t.Fatalf("link player: %v", err)
	}
	if user.PlayerID != "p-3" || user.TeamID != "t-2" {
		t.Fatalf("link = %q/%q, want p-3/t-2", user.PlayerID, user.TeamID)
	}
	if user.Status != domain.StatusActive {
		t.Fatalf("status = %s, want active: naming the player is the approval", user.Status)
	}

	unlinked, err := f.svc.LinkPlayer(context.Background(), f.manager, "u-waiting", "")
	if err != nil {
		t.Fatalf("unlink player: %v", err)
	}
	if unlinked.PlayerID != "" || unlinked.TeamID != "" {
		t.Fatalf("unlink left %q/%q behind", unlinked.PlayerID, unlinked.TeamID)
	}
}

func TestMemberWritesAreTheManagersOnly(t *testing.T) {
	f := newMemberFixture(t)
	ctx := context.Background()
	coach := f.manager
	coach.Role = domain.RoleCoach
	player := f.manager
	player.Role = domain.RolePlayer

	cases := []struct {
		name  string
		actor Actor
		call  func() error
	}{
		{"coach creates", coach, func() error {
			_, err := f.svc.CreateMember(ctx, coach, CreateMember{Name: "X", Email: "x@club.example", Role: "player"})
			return err
		}},
		{"player creates", player, func() error {
			_, err := f.svc.CreateMember(ctx, player, CreateMember{Name: "X", Email: "x@club.example", Role: "player"})
			return err
		}},
		{"coach links", coach, func() error {
			_, err := f.svc.LinkPlayer(ctx, coach, "u-waiting", "p-1")
			return err
		}},
		{"coach resets", coach, func() error {
			_, err := f.svc.ResetMemberPassword(ctx, coach, "u-waiting")
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var forbidden *domain.ForbiddenError
			if err := tc.call(); !errors.As(err, &forbidden) {
				t.Fatalf("returned %v, want a forbidden error", err)
			}
		})
	}
}

func TestMemberWritesRefuseBadTargets(t *testing.T) {
	f := newMemberFixture(t)
	ctx := context.Background()
	f.users.rows["u-other"] = domain.User{
		ID: "u-other", ClubID: "club-2", Role: domain.RolePlayer, Status: domain.StatusPending,
	}
	f.users.rows["u-coach"] = domain.User{
		ID: "u-coach", ClubID: "club-1", Role: domain.RoleCoach, Status: domain.StatusActive,
	}
	if _, err := f.repo.Apply(ctx, "club-1", ports.Apply{
		Entity: domain.EntityPlayers, ID: "p-gone", Payload: []byte(`{"id":"p-gone","teamId":"t-1"}`),
		Deleted: true, OpID: "op-gone",
	}); err != nil {
		t.Fatalf("seed tombstone: %v", err)
	}

	cases := map[string]func() error{
		"another club": func() error {
			_, err := f.svc.LinkPlayer(ctx, f.manager, "u-other", "p-1")
			return err
		},
		"no such account": func() error {
			_, err := f.svc.LinkPlayer(ctx, f.manager, "u-missing", "p-1")
			return err
		},
		"a coach account": func() error {
			_, err := f.svc.LinkPlayer(ctx, f.manager, "u-coach", "p-1")
			return err
		},
		"a player who is not on the roster": func() error {
			_, err := f.svc.LinkPlayer(ctx, f.manager, "u-waiting", "p-missing")
			return err
		},
		"a deleted player": func() error {
			_, err := f.svc.LinkPlayer(ctx, f.manager, "u-waiting", "p-gone")
			return err
		},
		"a second manager": func() error {
			_, err := f.svc.CreateMember(ctx, f.manager, CreateMember{Name: "X", Email: "x@club.example", Role: "manager"})
			return err
		},
		"an email already taken": func() error {
			_, err := f.svc.CreateMember(ctx, f.manager, CreateMember{
				Name: "X", Email: "waiting@club.example", Role: "player",
			})
			return err
		},
		"a coach linked to a player": func() error {
			_, err := f.svc.CreateMember(ctx, f.manager, CreateMember{
				Name: "X", Email: "x@club.example", Role: "coach", PlayerID: "p-1",
			})
			return err
		},
		"a password that is too short": func() error {
			_, err := f.svc.CreateMember(ctx, f.manager, CreateMember{
				Name: "X", Email: "x@club.example", Role: "player", Password: "123",
			})
			return err
		},
	}
	for name, call := range cases {
		t.Run(name, func(t *testing.T) {
			if err := call(); err == nil {
				t.Fatal("the write was allowed")
			}
		})
	}
}

func TestManagerResetHandsOverAWorkingPassword(t *testing.T) {
	f := newMemberFixture(t)
	ctx := context.Background()
	if err := f.secrets.PutSecret(ctx, "u-waiting", "argon2id", []byte("salt"), []byte("old")); err != nil {
		t.Fatalf("seed secret: %v", err)
	}
	if err := f.users.SetUserStatus(ctx, "u-waiting", domain.StatusActive, "u-manager"); err != nil {
		t.Fatalf("activate: %v", err)
	}

	result, err := f.svc.ResetMemberPassword(ctx, f.manager, "u-waiting")
	if err != nil {
		t.Fatalf("reset: %v", err)
	}
	f.passwordOf(t, "u-waiting", result.TempPassword)
	if len(f.sessions.revokedUsers) != 1 || f.sessions.revokedUsers[0] != "u-waiting" {
		t.Fatalf("revoked %v, want the account signed out everywhere", f.sessions.revokedUsers)
	}
	if _, err := f.svc.SignIn(ctx, "waiting@club.example", result.TempPassword, "d-phone"); err != nil {
		t.Fatalf("sign-in with the reset password: %v", err)
	}
}

func TestChangePasswordKeepsThisPhoneAndSignsOutTheRest(t *testing.T) {
	f := newMemberFixture(t)
	ctx := context.Background()
	salt, digest, algo, err := hashPassword("old-password")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if err := f.secrets.PutSecret(ctx, "u-manager", algo, salt, digest); err != nil {
		t.Fatalf("seed secret: %v", err)
	}

	if _, err := f.svc.ChangePassword(ctx, f.manager, "wrong", "new-password"); err == nil {
		t.Fatal("a wrong current password was accepted")
	}
	var invalid *domain.ValidationError
	if _, err := f.svc.ChangePassword(ctx, f.manager, "old-password", "123"); !errors.As(err, &invalid) {
		t.Fatalf("short password returned %v, want a validation error", err)
	}
	if f.sessions.opened != 0 {
		t.Fatal("a refused change still opened a session")
	}

	session, err := f.svc.ChangePassword(ctx, f.manager, "old-password", "new-password")
	if err != nil {
		t.Fatalf("change password: %v", err)
	}
	if session.AccessToken == "" || session.RefreshToken == "" || session.User == nil {
		t.Fatalf("change returned an unusable session: %+v", session)
	}
	f.passwordOf(t, "u-manager", "new-password")
	if len(f.sessions.revokedUsers) != 1 || f.sessions.revokedUsers[0] != "u-manager" {
		t.Fatalf("revoked %v, want every session of this account", f.sessions.revokedUsers)
	}
	if f.sessions.opened != 1 {
		t.Fatalf("opened %d sessions, want the caller's fresh one", f.sessions.opened)
	}
}

// Joining a club with a player account asks the manager to name the roster row;
// it must not hand over the club as if the account were staff.
func TestPlayerJoinWaitsForTheManager(t *testing.T) {
	for _, tc := range []struct {
		role domain.Role
		want domain.UserStatus
	}{
		{domain.RolePlayer, domain.StatusPending},
		{domain.RoleCoach, domain.StatusActive},
	} {
		t.Run(string(tc.role), func(t *testing.T) {
			f := newMemberFixture(t)
			f.users.rows["u-new"] = domain.User{
				ID: "u-new", Name: "New", Email: "new@club.example", Role: tc.role, Status: domain.StatusActive,
			}
			actor := Actor{UserID: "u-new", Role: tc.role, Status: domain.StatusActive}
			if _, err := f.svc.Join(context.Background(), actor, "JOINCODE"); err != nil {
				t.Fatalf("join: %v", err)
			}
			joined, err := f.users.User(context.Background(), "u-new")
			if err != nil {
				t.Fatalf("joined account: %v", err)
			}
			if joined.Status != tc.want || joined.ClubID != "club-1" {
				t.Fatalf("joined as %s in %q, want %s in club-1", joined.Status, joined.ClubID, tc.want)
			}
		})
	}
}

// A waiting player request is decided the same way a coach's is.
func TestReviewDecidesAPlayerRequest(t *testing.T) {
	f := newMemberFixture(t)
	ctx := context.Background()
	if err := f.svc.Review(ctx, f.manager, "u-waiting", false); err != nil {
		t.Fatalf("reject player: %v", err)
	}
	rejected, err := f.users.User(ctx, "u-waiting")
	if err != nil {
		t.Fatalf("rejected account: %v", err)
	}
	if rejected.Status != domain.StatusRejected {
		t.Fatalf("status = %s, want rejected", rejected.Status)
	}
	if len(f.sessions.revokedUsers) != 1 || f.sessions.revokedUsers[0] != "u-waiting" {
		t.Fatalf("revoked %v, want the rejected account signed out", f.sessions.revokedUsers)
	}
	if err := f.svc.Review(ctx, f.manager, "u-waiting", true); err == nil {
		t.Fatal("a decided request was reviewed twice")
	}
}
