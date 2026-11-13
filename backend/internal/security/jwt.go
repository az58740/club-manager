package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
)

// SignHS256 mints the token a live subscription is checked against. Supabase
// verifies it with the project's own JWT secret, so the claims have to carry the
// same read scope the API enforces; the database and the service then answer
// alike without sharing code.
func SignHS256(secret string, claims map[string]any) (string, error) {
	if secret == "" {
		return "", errors.New("a JWT needs its signing secret")
	}
	body, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("jwt claims: %w", err)
	}
	input := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`)) +
		"." + base64.RawURLEncoding.EncodeToString(body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(input))
	return input + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
