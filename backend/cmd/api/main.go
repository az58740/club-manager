// Command api serves the club API, and with -migrate only applies migrations.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/az58740/club-manager/backend/internal/adapters/mail"
	"github.com/az58740/club-manager/backend/internal/adapters/postgres"
	"github.com/az58740/club-manager/backend/internal/api"
	"github.com/az58740/club-manager/backend/internal/config"
	"github.com/az58740/club-manager/backend/internal/service"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "apply migrations and exit")
	flag.Parse()

	logger := log.New(os.Stdout, "club-api ", log.LstdFlags|log.Lmsgprefix)
	if err := run(*migrateOnly, logger); err != nil {
		logger.Printf("fatal: %v", err)
		os.Exit(1)
	}
}

func run(migrateOnly bool, logger *log.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := postgres.Open(cfg.DSN)
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	applied, err := postgres.Migrate(ctx, db)
	if err != nil {
		return err
	}
	for _, name := range applied {
		logger.Printf("migrated %s", name)
	}
	if migrateOnly {
		return nil
	}

	svc, err := service.New(service.Deps{
		Users:    db,
		Secrets:  db,
		Sessions: db,
		Tokens:   db,
		Passkeys: db,
		Clubs:    db,
		Invites:  db,
		Records:  postgres.NewStore(db),
		Mail:     mail.New(cfg.SMTP, logger.Printf),
		Health:   db,
		Config:   cfg,
		Log:      logger,
	})
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.New(svc, cfg, logger).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       3 * time.Minute,
	}

	errs := make(chan error, 1)
	go func() {
		logger.Printf("listening on %s", server.Addr)
		errs <- server.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		logger.Printf("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}
