// Package mail delivers verification and reset links.
package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/az58740/club-manager/backend/internal/config"
)

// Mailer sends through SMTP when a mailbox is configured and prints to stdout
// when it is not. A club's very first manager has no mailbox yet, and that one
// link must still reach them.
type Mailer struct {
	cfg config.SMTP
	Log func(string, ...any)
}

func New(cfg config.SMTP, log func(string, ...any)) *Mailer {
	if log == nil {
		log = func(string, ...any) {}
	}
	return &Mailer{cfg: cfg, Log: log}
}

func (m *Mailer) Send(ctx context.Context, to, subject, body string) error {
	if !m.cfg.Enabled() {
		m.Log("email not sent (SMTP_HOST is empty): to=%s subject=%s link=%s",
			to, subject, firstLine(body))
		return nil
	}
	return m.sendSMTP(ctx, to, subject, body)
}

func (m *Mailer) sendSMTP(ctx context.Context, to, subject, body string) error {
	addr := net.JoinHostPort(m.cfg.Host, m.cfg.Port)
	msg := strings.Join([]string{
		"From: " + m.cfg.From,
		"To: " + to,
		"Subject: " + subject,
		"Date: " + nowStamp(),
		"MIME-Version: 1.0",
		`Content-Type: text/plain; charset="utf-8"`,
		"",
		body,
	}, "\r\n")

	client, err := (&net.Dialer{}).DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp connect: %w", err)
	}
	defer client.Close()

	conn, err := smtp.NewClient(client, m.cfg.Host)
	if err != nil {
		return err
	}
	defer conn.Quit()

	if ok, _ := conn.Extension("STARTTLS"); ok {
		if err = conn.StartTLS(&tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if m.cfg.Username != "" {
		if err = conn.Auth(smtpAuth(m.cfg)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err = conn.Mail(m.cfg.From); err != nil {
		return err
	}
	if err = conn.Rcpt(to); err != nil {
		return err
	}
	writer, err := conn.Data()
	if err != nil {
		return err
	}
	if _, err = writer.Write([]byte(msg)); err != nil {
		return err
	}
	return writer.Close()
}

func smtpAuth(cfg config.SMTP) smtp.Auth {
	// Login is what most transactional providers speak; Plain needs TLS, which
	// STARTTLS above already established.
	return smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
}

func firstLine(body string) string {
	line, _, _ := strings.Cut(body, "\n")
	if strings.TrimSpace(line) == "" {
		return body
	}
	return strings.TrimSpace(line)
}

func nowStamp() string {
	// RFC 1123 with an explicit offset: mail clients refuse to guess a timezone.
	return time.Now().UTC().Format("Mon, 02 Jan 2006 15:04:05 -0000")
}
