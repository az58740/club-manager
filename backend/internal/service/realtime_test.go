package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/az58740/club-manager/backend/internal/config"
	"github.com/az58740/club-manager/backend/internal/domain"
)

const testJWTSecret = "a-project-jwt-secret-that-never-leaves-the-server"

// claimsOf checks the signature the way Supabase will, then hands back the
// payload: a token that verifies with the wrong secret is worse than no token.
func claimsOf(t *testing.T, token, secret string) map[string]any {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token has %d parts, want header.payload.signature", len(parts))
	}
	header, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatalf("header: %v", err)
	}
	if string(header) != `{"alg":"HS256","typ":"JWT"}` {
		t.Fatalf("header = %s, want HS256", header)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(parts[2])) {
		t.Fatal("the signature does not match the signing secret")
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("payload: %v", err)
	}
	var claims map[string]any
	if err := json.Unmarshal(body, &claims); err != nil {
		t.Fatalf("claims: %v", err)
	}
	return claims
}

// The socket is only useful if the database can tell whose rows it may send, so
// the claims have to be the very fields the API filters on.
func TestRealtimeTokenCarriesTheReadScope(t *testing.T) {
	svc := &Service{deps: Deps{Config: config.Config{
		AccessTTL:         15 * time.Minute,
		SupabaseJWTSecret: testJWTSecret,
	}}}
	before := time.Now().UTC()
	grant, err := svc.RealtimeToken(context.Background(), playerActor())
	if err != nil {
		t.Fatalf("realtime token: %v", err)
	}
	if !grant.Enabled || grant.Token == "" {
		t.Fatalf("grant = %+v, want a live token", grant)
	}
	claims := claimsOf(t, grant.Token, testJWTSecret)
	for key, want := range map[string]string{
		"role":      "authenticated",
		"sub":       "u-player",
		"club_id":   "club-1",
		"app_role":  "player",
		"player_id": "p-1",
		"team_id":   "t-1",
	} {
		if claims[key] != want {
			t.Errorf("claim %s = %v, want %q", key, claims[key], want)
		}
	}
	exp, ok := claims["exp"].(float64)
	if !ok {
		t.Fatalf("exp = %v, want a unix timestamp", claims["exp"])
	}
	if !grant.ExpiresAt.Equal(time.Unix(int64(exp), 0).UTC()) {
		t.Errorf("the grant expires at %s but the token says %s", grant.ExpiresAt, time.Unix(int64(exp), 0).UTC())
	}
	if grant.ExpiresAt.Before(before.Add(14*time.Minute)) || grant.ExpiresAt.After(before.Add(16*time.Minute)) {
		t.Errorf("expiry %s is not one access token's life from now", grant.ExpiresAt)
	}
}

func TestRealtimeTokenForStaffNamesNoPlayer(t *testing.T) {
	for _, role := range []domain.Role{domain.RoleManager, domain.RoleCoach} {
		t.Run(string(role), func(t *testing.T) {
			svc := &Service{deps: Deps{Config: config.Config{
				AccessTTL: time.Hour, SupabaseJWTSecret: testJWTSecret,
			}}}
			actor := playerActor()
			actor.Role = role
			actor.PlayerID, actor.TeamID = "", ""
			grant, err := svc.RealtimeToken(context.Background(), actor)
			if err != nil {
				t.Fatalf("realtime token: %v", err)
			}
			claims := claimsOf(t, grant.Token, testJWTSecret)
			if claims["app_role"] != string(role) {
				t.Errorf("app_role = %v, want %s", claims["app_role"], role)
			}
			if claims["player_id"] != "" || claims["team_id"] != "" {
				t.Errorf("a staff token narrows itself to %v/%v", claims["player_id"], claims["team_id"])
			}
		})
	}
}

// Without a Supabase project the server says so instead of failing: the phone
// keeps working on its polling fallback.
func TestRealtimeTokenIsDisabledWithoutASecret(t *testing.T) {
	svc := &Service{deps: Deps{Config: config.Config{AccessTTL: time.Hour}}}
	grant, err := svc.RealtimeToken(context.Background(), playerActor())
	if err != nil {
		t.Fatalf("realtime token: %v", err)
	}
	if grant.Enabled || grant.Token != "" {
		t.Fatalf("grant = %+v, want live updates reported as off", grant)
	}
}

func TestRealtimeTokenNeedsAnActiveMember(t *testing.T) {
	svc := &Service{deps: Deps{Config: config.Config{
		AccessTTL: time.Hour, SupabaseJWTSecret: testJWTSecret,
	}}}
	cases := map[string]Actor{
		"pending":        {Status: domain.StatusPending, ClubID: "club-1", Role: domain.RolePlayer},
		"rejected":       {Status: domain.StatusRejected, ClubID: "club-1", Role: domain.RoleCoach},
		"without a club": {Status: domain.StatusActive, Role: domain.RoleManager},
	}
	for name, actor := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := svc.RealtimeToken(context.Background(), actor); err == nil {
				t.Fatal("a subscription token was handed to an account that may not read")
			}
		})
	}
}
