// Package config reads the service's environment once, at start-up.
package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Config is what the API needs to run. Everything comes from the environment so
// Railway needs no file and no command-line flags.
type Config struct {
	Port           string
	DSN            string
	Origin         string
	AccessTTL      time.Duration
	RefreshTTL     time.Duration
	SMTP           SMTP
	MigrateOnStart bool
	// SupabaseJWTSecret signs the token a live subscription is checked against.
	// It stays on the server: an empty one means the app polls instead.
	SupabaseJWTSecret string
}

// SMTP settings for verification and reset links. An empty Host means the
// service prints the link instead of sending it, which is how the first club
// gets started before any mailbox exists.
type SMTP struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

func (s SMTP) Enabled() bool { return s.Host != "" }

// Load builds the config, naming whatever is missing.
func Load() (Config, error) {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required (postgres://user:pass@host:5432/postgres?sslmode=require)")
	}

	cfg := Config{
		Port:              fallback(os.Getenv("PORT"), "8080"),
		DSN:               dsn,
		Origin:            strings.TrimRight(fallback(os.Getenv("FRONTEND_ORIGIN"), "*"), "/"),
		AccessTTL:         duration("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTTL:        duration("REFRESH_TOKEN_TTL", 60*24*time.Hour),
		MigrateOnStart:    os.Getenv("MIGRATE_ON_START") != "false",
		SupabaseJWTSecret: strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET")),
		SMTP: SMTP{
			Host:     os.Getenv("SMTP_HOST"),
			Port:     fallback(os.Getenv("SMTP_PORT"), "587"),
			Username: os.Getenv("SMTP_USERNAME"),
			Password: os.Getenv("SMTP_PASSWORD"),
			From:     fallback(os.Getenv("SMTP_FROM"), "noreply@club.local"),
		},
	}
	if cfg.AccessTTL < time.Minute {
		return Config{}, fmt.Errorf("ACCESS_TOKEN_TTL is too short to be useful")
	}
	return cfg, nil
}

func fallback(value, alternate string) string {
	if strings.TrimSpace(value) == "" {
		return alternate
	}
	return value
}

func duration(name string, def time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return def
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return def
	}
	return parsed
}
