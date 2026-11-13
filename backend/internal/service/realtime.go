package service

import (
	"context"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/security"
)

// RealtimeGrant is what a phone needs to listen for changes: a token Supabase
// checks against its row policy, and the moment to ask for another. Enabled is
// false on a server with no Supabase project behind it, and the app then polls.
type RealtimeGrant struct {
	Enabled   bool      `json:"enabled"`
	Token     string    `json:"token,omitempty"`
	ExpiresAt time.Time `json:"expiresAt,omitempty"`
}

// RealtimeToken signs a subscription token for one account. Our sign-in is not
// GoTrue, so Supabase would otherwise have no way to know whose rows a socket
// may see: these claims are the same fields Actor.visible filters on, and
// supabase/realtime.sql turns them into the identical rule.
func (s *Service) RealtimeToken(_ context.Context, actor Actor) (RealtimeGrant, error) {
	if err := actor.requireMember(); err != nil {
		return RealtimeGrant{}, err
	}
	secret := strings.TrimSpace(s.deps.Config.SupabaseJWTSecret)
	if secret == "" {
		return RealtimeGrant{}, nil
	}
	// exp is whole seconds, so the expiry the phone is told matches the token.
	now := time.Now().UTC().Truncate(time.Second)
	expires := now.Add(s.deps.Config.AccessTTL)
	token, err := security.SignHS256(secret, map[string]any{
		"role":      "authenticated",
		"aud":       "authenticated",
		"iss":       "club-manager",
		"sub":       actor.UserID,
		"iat":       now.Unix(),
		"exp":       expires.Unix(),
		"club_id":   actor.ClubID,
		"app_role":  string(actor.Role),
		"player_id": actor.PlayerID,
		"team_id":   actor.TeamID,
	})
	if err != nil {
		return RealtimeGrant{}, err
	}
	return RealtimeGrant{Enabled: true, Token: token, ExpiresAt: expires}, nil
}
