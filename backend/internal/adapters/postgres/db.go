// Package postgres implements the storage ports against Postgres 15+, which is
// what Supabase runs.
//
// GORM owns the connection pool, the transactions and the $n placeholders; the
// statements themselves stay hand-written SQL because the record spine's column
// contract is a data contract, and the round-trip tests beside the codec are
// what keep a phone's payload inside it.
package postgres

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	pgxstdlib "github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/az58740/club-manager/backend/migrations"
)

// Unique violation is how Postgres reports the race this store expects: two
// devices creating the same new row at the same moment.
const errUniqueViolation = "23505"

// DB is the pool, wrapped by GORM. One value answers every account-shaped
// port, so the wiring in cmd/api has no surprises left at run time.
type DB struct {
	GORM *gorm.DB
}

// Open connects with the settings this service needs.
//
// Statements go over the wire one at a time with their arguments already
// written in, because Supabase's transaction pooler hands a connection to
// somebody else between transactions and a prepared statement cached on one
// would be missing the next time this pool asked for it.
func Open(dsn string) (*DB, error) {
	config, err := pgx.ParseConfig(withSimpleProtocol(dsn))
	if err != nil {
		return nil, fmt.Errorf("bad DATABASE_URL: %w", err)
	}

	pool := pgxstdlib.OpenDB(*config)
	pool.SetMaxOpenConns(12)
	pool.SetMaxIdleConns(4)
	pool.SetConnMaxLifetime(30 * time.Minute)

	engine, err := gorm.Open(postgres.New(postgres.Config{Conn: pool}), &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Warn),
		SkipDefaultTransaction: true,
	})
	if err != nil {
		_ = pool.Close()
		return nil, fmt.Errorf("database unreachable: %w", err)
	}

	db := &DB{GORM: engine}
	pingCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.Ping(pingCtx); err != nil {
		_ = pool.Close()
		return nil, fmt.Errorf("database unreachable: %w", err)
	}
	return db, nil
}

// withSimpleProtocol adds pgx's simple-protocol setting to a DSN that does not
// already choose an execution mode, for either the URL or the keyword form
// Supabase prints.
func withSimpleProtocol(dsn string) string {
	if strings.Contains(dsn, "default_query_exec_mode") {
		return dsn
	}
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		if strings.Contains(dsn, "?") {
			return dsn + "&default_query_exec_mode=simple_protocol"
		}
		return dsn + "?default_query_exec_mode=simple_protocol"
	}
	return dsn + " default_query_exec_mode=simple_protocol"
}

// isDuplicate reports Postgres error 23505: the race this store expects, when
// two devices create the same new row at the same moment.
func isDuplicate(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == errUniqueViolation
}

/* ------------------------------ statement API ----------------------------- */

// Row is a result row whose failure travels with it. A dropped connection must
// not reach the caller as "no such record", because Apply reads that answer as
// "nothing to conflict with" and would overwrite live data.
type Row struct {
	row   *sql.Row
	err   error
	ready bool
}

// Scan reports the connection failure instead of the missing-row error.
func (r Row) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if r.row == nil {
		return errors.New("query produced no row to read")
	}
	return r.row.Scan(dest...)
}

// Runner executes one statement. The pool and a transaction inside it answer
// the same three verbs, which is why the sync spine takes a Runner rather than
// a driver-specific transaction type.
type Runner interface {
	Exec(ctx context.Context, query string, args ...any) (int64, error)
	Query(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRow(ctx context.Context, query string, args ...any) Row
}

type runner struct{ gorm *gorm.DB }

func (r runner) Exec(ctx context.Context, query string, args ...any) (int64, error) {
	tx := r.gorm.WithContext(ctx).Exec(query, args...)
	return tx.RowsAffected, tx.Error
}

func (r runner) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return r.gorm.WithContext(ctx).Raw(query, args...).Rows()
}

func (r runner) QueryRow(ctx context.Context, query string, args ...any) Row {
	tx := r.gorm.WithContext(ctx).Raw(query, args...)
	return Row{row: tx.Row(), err: tx.Error}
}

// Run gives the package its statement API without a transaction.
func (d *DB) Run() Runner { return runner{d.GORM} }

// Exec, Query and QueryRow go straight to the pool. They exist so the adapters
// read the way they always have.
func (d *DB) Exec(ctx context.Context, query string, args ...any) (int64, error) {
	return d.Run().Exec(ctx, query, args...)
}

func (d *DB) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return d.Run().Query(ctx, query, args...)
}

func (d *DB) QueryRow(ctx context.Context, query string, args ...any) Row {
	return d.Run().QueryRow(ctx, query, args...)
}

// Tx runs one function inside a transaction and commits it only if the
// function said nothing went wrong.
func (d *DB) Tx(ctx context.Context, fn func(Runner) error) error {
	return d.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(runner{tx})
	})
}

// Ping reports whether the pool can still reach Postgres, for /health.
func (d *DB) Ping(ctx context.Context) error {
	var one int
	return d.QueryRow(ctx, `SELECT 1`).Scan(&one)
}

// Close drains the pool.
func (d *DB) Close() error {
	pool, err := d.GORM.DB()
	if err != nil {
		return err
	}
	return pool.Close()
}

/* --------------------------------- ids ----------------------------------- */

// NewID mints an id in the shape the PWA already uses, so ids created by the
// server are indistinguishable from ids created on a phone.
func NewID(prefix string) string {
	var raw [6]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("no randomness: " + err.Error())
	}
	return prefix + "-" + hex.EncodeToString(raw[:])[:8]
}

// NewCode mints an uppercase invite-style code.
func NewCode() string {
	var raw [4]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("no randomness: " + err.Error())
	}
	return strings.ToUpper(hex.EncodeToString(raw[:]))
}

// NewToken returns 32 random bytes for hashing into the database.
func NewToken() ([]byte, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	return buf, nil
}

/* ------------------------------- migrations ------------------------------- */

// Migrate applies every embedded .sql file that has not run yet. Every boot
// calls the same command, so this has to be safe to repeat.
func Migrate(ctx context.Context, db *DB) ([]string, error) {
	if _, err := db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name VARCHAR(191) NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now(),
		checksum VARCHAR(64) NOT NULL,
		PRIMARY KEY (name)
	)`); err != nil {
		return nil, err
	}

	entries, err := fs.Glob(migrations.Files, "*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(entries)

	done, err := applied(ctx, db)
	if err != nil {
		return nil, err
	}

	var ran []string
	for _, name := range entries {
		body, err := migrations.Files.ReadFile(name)
		if err != nil {
			return nil, err
		}
		sum := hashBytes(body)
		if at, ok := done[name]; ok {
			if at != sum {
				return ran, fmt.Errorf("%s changed after it was applied; add a new migration instead", name)
			}
			continue
		}
		// One migration, one transaction: a table half-created by a dropped
		// connection must not be recorded as applied.
		if err := db.Tx(ctx, func(tx Runner) error {
			for _, statement := range splitStatements(string(body)) {
				if _, err := tx.Exec(ctx, statement); err != nil {
					return fmt.Errorf("%s: %w", name, err)
				}
			}
			_, err := tx.Exec(ctx,
				`INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)`, name, sum)
			return err
		}); err != nil {
			return ran, err
		}
		ran = append(ran, name)
	}
	return ran, nil
}

func applied(ctx context.Context, db *DB) (map[string]string, error) {
	rows, err := db.Query(ctx, `SELECT name, checksum FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var name, sum string
		if err := rows.Scan(&name, &sum); err != nil {
			return nil, err
		}
		out[name] = sum
	}
	return out, rows.Err()
}

// hashBytes fingerprints a migration file so an edited history is refused.
func hashBytes(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// splitStatements cuts a migration file on semicolons while respecting string
// literals and comments, because Persian text and quoted defaults appear in
// both.
func splitStatements(body string) []string {
	var out []string
	var current strings.Builder
	inLine := false
	inBlock := false
	inString := false

	runes := []rune(body)
	for i := 0; i < len(runes); i++ {
		c := runes[i]

		switch {
		case inString:
			current.WriteRune(c)
			if c == '\\' && i+1 < len(runes) {
				i++
				current.WriteRune(runes[i])
				continue
			}
			if c == '\'' {
				inString = false
			}
			continue
		case inLine:
			current.WriteRune(c)
			if c == '\n' {
				inLine = false
			}
			continue
		case inBlock:
			current.WriteRune(c)
			if c == '*' && i+1 < len(runes) && runes[i+1] == '/' {
				i++
				current.WriteRune('/')
				inBlock = false
			}
			continue
		}

		if c == '\'' {
			inString = true
			current.WriteRune(c)
			continue
		}
		if c == '-' && i+1 < len(runes) && runes[i+1] == '-' {
			inLine = true
			current.WriteRune(c)
			continue
		}
		if c == '/' && i+1 < len(runes) && runes[i+1] == '*' {
			inBlock = true
			current.WriteRune(c)
			continue
		}
		if c == ';' {
			statement := strings.TrimSpace(current.String())
			if statement != "" {
				out = append(out, statement)
			}
			current.Reset()
			continue
		}
		current.WriteRune(c)
	}

	if tail := strings.TrimSpace(current.String()); tail != "" {
		out = append(out, tail)
	}
	return out
}
