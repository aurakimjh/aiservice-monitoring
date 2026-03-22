// Package buffer provides an SQLite-backed local buffer for storing collected
// data while the agent is offline, and flushing it once connectivity is restored.
package buffer

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"sync"
	"time"

	_ "modernc.org/sqlite" // CGo-free SQLite driver; registers as "sqlite"
)

// Item is a single buffered payload waiting to be transmitted.
type Item struct {
	ID          int64
	CollectorID string
	Data        []byte
	CreatedAt   time.Time
}

// Buffer is an SQLite-backed store for offline data buffering.
// All methods are safe for concurrent use.
type Buffer struct {
	mu     sync.Mutex
	db     *sql.DB
	logger *slog.Logger
}

// Open opens (or creates) the SQLite buffer database at path.
// The directory containing path must already exist.
func Open(path string, logger *slog.Logger) (*Buffer, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("buffer: open %s: %w", path, err)
	}
	// SQLite performs best with a single writer connection to avoid locking.
	db.SetMaxOpenConns(1)

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("buffer: migrate: %w", err)
	}
	logger.Info("buffer: opened", "path", path)
	return &Buffer{db: db, logger: logger}, nil
}

// Close closes the underlying database connection.
func (b *Buffer) Close() error {
	return b.db.Close()
}

// Store saves a collected payload to the local buffer for later transmission.
func (b *Buffer) Store(collectorID string, data []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, err := b.db.Exec(
		`INSERT INTO buffer (collector_id, data, created_at) VALUES (?, ?, ?)`,
		collectorID, data, time.Now().Unix(),
	)
	if err != nil {
		return fmt.Errorf("buffer: store: %w", err)
	}
	b.logger.Debug("buffer: item stored", "collector_id", collectorID, "bytes", len(data))
	return nil
}

// Pending returns all items not yet successfully transmitted, ordered by insertion.
func (b *Buffer) Pending() ([]Item, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	rows, err := b.db.Query(
		`SELECT id, collector_id, data, created_at
		   FROM buffer
		  WHERE sent_at IS NULL
		  ORDER BY id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("buffer: pending query: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var it Item
		var ts int64
		if err := rows.Scan(&it.ID, &it.CollectorID, &it.Data, &ts); err != nil {
			return nil, fmt.Errorf("buffer: scan: %w", err)
		}
		it.CreatedAt = time.Unix(ts, 0)
		items = append(items, it)
	}
	return items, rows.Err()
}

// MarkSent records that item id was successfully transmitted.
func (b *Buffer) MarkSent(id int64) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, err := b.db.Exec(
		`UPDATE buffer SET sent_at = ? WHERE id = ?`,
		time.Now().Unix(), id,
	)
	return err
}

// PendingCount returns the number of items waiting to be sent.
func (b *Buffer) PendingCount() (int64, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	var n int64
	err := b.db.QueryRow(`SELECT COUNT(*) FROM buffer WHERE sent_at IS NULL`).Scan(&n)
	return n, err
}

// Flush iterates over all pending items and calls sendFn for each one.
// Items successfully sent are marked as sent in the database.
// Flush returns an error summary if any sends failed, but continues processing
// remaining items regardless.
func (b *Buffer) Flush(ctx context.Context, sendFn func(collectorID string, data []byte) error) error {
	items, err := b.Pending()
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return nil
	}
	b.logger.Info("buffer: flushing", "pending", len(items))

	var failed int
	for _, it := range items {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := sendFn(it.CollectorID, it.Data); err != nil {
			b.logger.Warn("buffer: flush send failed",
				"id", it.ID, "collector_id", it.CollectorID, "error", err)
			failed++
			continue
		}
		if err := b.MarkSent(it.ID); err != nil {
			b.logger.Warn("buffer: mark sent failed", "id", it.ID, "error", err)
		}
	}
	if failed > 0 {
		return fmt.Errorf("buffer: flush: %d of %d items failed to send", failed, len(items))
	}
	b.logger.Info("buffer: flush complete", "sent", len(items))
	return nil
}

// Prune deletes already-sent items older than maxAge to reclaim disk space.
func (b *Buffer) Prune(maxAge time.Duration) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	cutoff := time.Now().Add(-maxAge).Unix()
	res, err := b.db.Exec(
		`DELETE FROM buffer WHERE sent_at IS NOT NULL AND sent_at < ?`, cutoff,
	)
	if err != nil {
		return fmt.Errorf("buffer: prune: %w", err)
	}
	if n, _ := res.RowsAffected(); n > 0 {
		b.logger.Info("buffer: pruned old sent items", "deleted", n)
	}
	return nil
}

// migrate creates the buffer table if it does not already exist.
func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS buffer (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			collector_id TEXT    NOT NULL,
			data         BLOB    NOT NULL,
			created_at   INTEGER NOT NULL,
			sent_at      INTEGER
		)
	`)
	return err
}
