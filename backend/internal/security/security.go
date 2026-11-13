// Package security holds the primitives that must never be improvised:
// password hashing and the opaque tokens the PWA carries.
package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters chosen for a phone-sized user base on one small Railway
// container: ~100 ms per hash stops a scripted guess, and one sign-in is a
// fraction of a second.
const (
	timeCost    = 2
	memoryCost  = 64 * 1024 // KiB
	parallelism = 1
	keyLength   = 32
	saltLength  = 16
)

var ErrMismatch = errors.New("password does not match")

// Hash returns the algorithm tag, salt and digest, so an old hash can be
// recognised and re-derived with newer parameters later.
func Hash(password string) (algo string, salt, digest []byte, err error) {
	salt = make([]byte, saltLength)
	if _, err = rand.Read(salt); err != nil {
		return "", nil, nil, fmt.Errorf("salt: %w", err)
	}
	digest = argon2.IDKey([]byte(password), salt, timeCost, memoryCost, parallelism, keyLength)
	return "argon2id", salt, digest, nil
}

// Verify re-derives a stored password. Unknown algorithms are refused rather
// than guessed at, because silently accepting them is how a weak hash survives.
func Verify(algo string, salt, digest []byte, password string) error {
	if algo != "argon2id" {
		return fmt.Errorf("unsupported password algorithm %q", algo)
	}
	candidate := argon2.IDKey([]byte(password), salt, timeCost, memoryCost, parallelism, uint32(len(digest)))
	if !hmac.Equal(candidate, digest) {
		return ErrMismatch
	}
	return nil
}

// Token is a fresh opaque secret: the raw half goes to the client, only the
// fingerprint is stored, so a database dump cannot sign anybody in.
type Token struct {
	Raw    string
	Digest []byte
}

func NewToken() (Token, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return Token{}, fmt.Errorf("token: %w", err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	return Token{Raw: encoded, Digest: Digest(encoded)}, nil
}

// Digest fingerprints a token exactly as it will be looked up later.
func Digest(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}
