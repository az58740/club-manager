// Package migrations embeds the SQL files so the binary can migrate a fresh
// database with no files on disk.
package migrations

import "embed"

//go:embed *.sql
var Files embed.FS
