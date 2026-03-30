package metricstore

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // CGO-free SQLite driver
)

// WarmStore is the SQLite-backed warm tier (7–90 day rolling window).
// Each calendar day lives in its own SQLite file to allow cheap pruning.
//
// Schema:
//
//	samples(metric_name, labels_json, labels_hash, timestamp, value)
//	metric_names(name UNIQUE) — fast metric-name lookup
//	label_index(metric_name, label_key, label_value) — label queries
//
// All timestamps are stored as Unix nanoseconds (INTEGER).
type WarmStore struct {
	dir    string
	logger *slog.Logger
	open   map[string]*sql.DB // "YYYY-MM-DD" → DB handle
}

// NewWarmStore opens (or creates) the warm-tier store under dir.
func NewWarmStore(dir string, logger *slog.Logger) (*WarmStore, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("metricstore warm: mkdir %s: %w", dir, err)
	}
	return &WarmStore{
		dir:    dir,
		logger: logger,
		open:   make(map[string]*sql.DB),
	}, nil
}

// Write persists a batch of metric samples into the appropriate daily file.
func (w *WarmStore) Write(points []ingestPoint) error {
	byDay := make(map[string][]ingestPoint)
	for i := range points {
		day := points[i].sample.T.UTC().Format("2006-01-02")
		byDay[day] = append(byDay[day], points[i])
	}
	for day, batch := range byDay {
		db, err := w.dbForDay(day)
		if err != nil {
			return err
		}
		if err := w.writeBatch(db, batch); err != nil {
			return fmt.Errorf("metricstore warm write day=%s: %w", day, err)
		}
	}
	return nil
}

// Query searches the warm tier across the [from,to] window.
func (w *WarmStore) Query(name string, labelMatch map[string]string, from, to time.Time, limit int) ([]QueryResult, error) {
	days := daysInRange(from, to)
	// Accumulate raw samples per series key.
	byKey := make(map[string]*QueryResult)

	for _, day := range days {
		db, err := w.dbForDay(day)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		if err := w.queryFromDB(db, name, labelMatch, from, to, byKey); err != nil {
			w.logger.Warn("warm query error", "day", day, "error", err)
			continue
		}
	}

	results := make([]QueryResult, 0, len(byKey))
	for _, qr := range byKey {
		results = append(results, *qr)
	}
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

// MetricNames returns all distinct metric names across all warm files.
func (w *WarmStore) MetricNames() []string {
	seen := make(map[string]struct{})
	entries, _ := os.ReadDir(w.dir)
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		day := strings.TrimSuffix(e.Name(), ".db")
		db, err := w.dbForDay(day)
		if err != nil {
			continue
		}
		rows, err := db.Query("SELECT DISTINCT name FROM metric_names")
		if err != nil {
			continue
		}
		for rows.Next() {
			var n string
			if rows.Scan(&n) == nil {
				seen[n] = struct{}{}
			}
		}
		rows.Close()
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	return names
}

// Prune removes warm-tier SQLite files older than retainDays.
func (w *WarmStore) Prune(retainDays int) error {
	cutoff := time.Now().UTC().AddDate(0, 0, -retainDays)
	entries, err := os.ReadDir(w.dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		day := strings.TrimSuffix(e.Name(), ".db")
		t, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		if t.Before(cutoff) {
			if db, ok := w.open[day]; ok {
				db.Close()
				delete(w.open, day)
			}
			path := filepath.Join(w.dir, e.Name())
			if err := os.Remove(path); err != nil {
				w.logger.Warn("warm prune: remove failed", "file", path, "error", err)
			} else {
				w.logger.Info("warm prune: removed", "file", path)
			}
		}
	}
	return nil
}

// DayCount returns the number of warm-tier day files.
func (w *WarmStore) DayCount() int {
	entries, _ := os.ReadDir(w.dir)
	count := 0
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".db") {
			count++
		}
	}
	return count
}

// Close closes all open SQLite handles.
func (w *WarmStore) Close() {
	for _, db := range w.open {
		db.Close()
	}
}

// ── internal helpers ─────────────────────────────────────────────────────────

func (w *WarmStore) dbForDay(day string) (*sql.DB, error) {
	if db, ok := w.open[day]; ok {
		return db, nil
	}
	path := filepath.Join(w.dir, day+".db")
	db, err := sql.Open("sqlite", path+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", path, err)
	}
	db.SetMaxOpenConns(1)
	if err := applyMetricSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	w.open[day] = db
	return db, nil
}

func applyMetricSchema(db *sql.DB) error {
	_, err := db.Exec(`
-- Raw metric samples
CREATE TABLE IF NOT EXISTS samples (
    metric_name TEXT    NOT NULL,
    labels_json TEXT    NOT NULL DEFAULT '{}',
    labels_hash TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL, -- Unix nanoseconds
    value       REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_samples_name      ON samples(metric_name);
CREATE INDEX IF NOT EXISTS idx_samples_hash      ON samples(labels_hash);
CREATE INDEX IF NOT EXISTS idx_samples_ts        ON samples(timestamp);
CREATE INDEX IF NOT EXISTS idx_samples_name_hash ON samples(metric_name, labels_hash, timestamp);

-- Downsampled 1-minute aggregates
CREATE TABLE IF NOT EXISTS samples_1m (
    metric_name TEXT    NOT NULL,
    labels_json TEXT    NOT NULL DEFAULT '{}',
    labels_hash TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL, -- bucket start (Unix nanoseconds)
    val_avg     REAL    NOT NULL,
    val_min     REAL    NOT NULL,
    val_max     REAL    NOT NULL,
    val_sum     REAL    NOT NULL,
    val_count   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_1m_name_hash ON samples_1m(metric_name, labels_hash, timestamp);

-- Downsampled 1-hour aggregates
CREATE TABLE IF NOT EXISTS samples_1h (
    metric_name TEXT    NOT NULL,
    labels_json TEXT    NOT NULL DEFAULT '{}',
    labels_hash TEXT    NOT NULL,
    timestamp   INTEGER NOT NULL,
    val_avg     REAL    NOT NULL,
    val_min     REAL    NOT NULL,
    val_max     REAL    NOT NULL,
    val_sum     REAL    NOT NULL,
    val_count   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_1h_name_hash ON samples_1h(metric_name, labels_hash, timestamp);

-- Fast metric name lookup
CREATE TABLE IF NOT EXISTS metric_names (
    name TEXT NOT NULL UNIQUE
);

-- Label inverted index for fast label-based queries
CREATE TABLE IF NOT EXISTS label_index (
    metric_name TEXT NOT NULL,
    label_key   TEXT NOT NULL,
    label_value TEXT NOT NULL,
    labels_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_label_kv ON label_index(metric_name, label_key, label_value);
`)
	return err
}

func (w *WarmStore) writeBatch(db *sql.DB, points []ingestPoint) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	stmtSample, err := tx.Prepare(
		`INSERT INTO samples (metric_name, labels_json, labels_hash, timestamp, value) VALUES (?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer stmtSample.Close()

	stmtName, err := tx.Prepare(`INSERT OR IGNORE INTO metric_names (name) VALUES (?)`)
	if err != nil {
		return err
	}
	defer stmtName.Close()

	stmtLabel, err := tx.Prepare(
		`INSERT OR IGNORE INTO label_index (metric_name, label_key, label_value, labels_hash) VALUES (?,?,?,?)`)
	if err != nil {
		return err
	}
	defer stmtLabel.Close()

	for _, p := range points {
		labelsJSON, _ := json.Marshal(p.series.Labels)
		hash := p.key

		if _, err := stmtSample.Exec(
			p.series.Name, string(labelsJSON), hash,
			p.sample.T.UnixNano(), p.sample.V,
		); err != nil {
			return fmt.Errorf("insert sample %s: %w", p.key, err)
		}

		stmtName.Exec(p.series.Name) //nolint:errcheck

		for k, v := range p.series.Labels {
			stmtLabel.Exec(p.series.Name, k, v, hash) //nolint:errcheck
		}
	}
	return tx.Commit()
}

func (w *WarmStore) queryFromDB(db *sql.DB, name string, labelMatch map[string]string, from, to time.Time, byKey map[string]*QueryResult) error {
	var conds []string
	var args []interface{}

	conds = append(conds, "metric_name = ?")
	args = append(args, name)
	conds = append(conds, "timestamp >= ? AND timestamp <= ?")
	args = append(args, from.UnixNano(), to.UnixNano())

	// If label filters given, find matching hashes via label_index.
	if len(labelMatch) > 0 {
		hashes, err := w.findHashesByLabels(db, name, labelMatch)
		if err != nil {
			return err
		}
		if len(hashes) == 0 {
			return nil // no matches
		}
		placeholders := make([]string, len(hashes))
		for i, h := range hashes {
			placeholders[i] = "?"
			args = append(args, h)
		}
		conds = append(conds, "labels_hash IN ("+strings.Join(placeholders, ",")+")")
	}

	query := "SELECT labels_json, labels_hash, timestamp, value FROM samples WHERE " +
		strings.Join(conds, " AND ") + " ORDER BY timestamp ASC"

	rows, err := db.Query(query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var labelsJSON, hash string
		var tsNano int64
		var val float64
		if err := rows.Scan(&labelsJSON, &hash, &tsNano, &val); err != nil {
			return err
		}
		qr, ok := byKey[hash]
		if !ok {
			var labels map[string]string
			json.Unmarshal([]byte(labelsJSON), &labels) //nolint:errcheck
			qr = &QueryResult{
				Series: Series{Name: name, Labels: labels, Key: hash},
			}
			byKey[hash] = qr
		}
		qr.Samples = append(qr.Samples, Sample{
			T: time.Unix(0, tsNano).UTC(),
			V: val,
		})
	}
	return rows.Err()
}

func (w *WarmStore) findHashesByLabels(db *sql.DB, metricName string, match map[string]string) ([]string, error) {
	// Intersect: for each label k=v, find the set of hashes; return the intersection.
	var hashSets []map[string]struct{}
	for k, v := range match {
		rows, err := db.Query(
			"SELECT DISTINCT labels_hash FROM label_index WHERE metric_name = ? AND label_key = ? AND label_value = ?",
			metricName, k, v)
		if err != nil {
			return nil, err
		}
		set := make(map[string]struct{})
		for rows.Next() {
			var h string
			rows.Scan(&h) //nolint:errcheck
			set[h] = struct{}{}
		}
		rows.Close()
		hashSets = append(hashSets, set)
	}

	if len(hashSets) == 0 {
		return nil, nil
	}

	// Intersect all sets.
	result := hashSets[0]
	for i := 1; i < len(hashSets); i++ {
		intersected := make(map[string]struct{})
		for h := range result {
			if _, ok := hashSets[i][h]; ok {
				intersected[h] = struct{}{}
			}
		}
		result = intersected
	}

	hashes := make([]string, 0, len(result))
	for h := range result {
		hashes = append(hashes, h)
	}
	return hashes, nil
}

// Downsample aggregates raw samples into 1-minute buckets for a given day.
func (w *WarmStore) Downsample1m(day string) error {
	db, err := w.dbForDay(day)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
INSERT OR REPLACE INTO samples_1m (metric_name, labels_json, labels_hash, timestamp, val_avg, val_min, val_max, val_sum, val_count)
SELECT
    metric_name,
    labels_json,
    labels_hash,
    (timestamp / 60000000000) * 60000000000 AS bucket,
    AVG(value),
    MIN(value),
    MAX(value),
    SUM(value),
    COUNT(*)
FROM samples
GROUP BY metric_name, labels_hash, bucket
`)
	return err
}

// Downsample1h aggregates 1-minute samples into 1-hour buckets.
func (w *WarmStore) Downsample1h(day string) error {
	db, err := w.dbForDay(day)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
INSERT OR REPLACE INTO samples_1h (metric_name, labels_json, labels_hash, timestamp, val_avg, val_min, val_max, val_sum, val_count)
SELECT
    metric_name,
    labels_json,
    labels_hash,
    (timestamp / 3600000000000) * 3600000000000 AS bucket,
    SUM(val_avg * val_count) / SUM(val_count),
    MIN(val_min),
    MAX(val_max),
    SUM(val_sum),
    SUM(val_count)
FROM samples_1m
GROUP BY metric_name, labels_hash, bucket
`)
	return err
}

// PurgeRawAfterDownsample removes raw samples from days that have been downsampled.
func (w *WarmStore) PurgeRawAfterDownsample(day string) error {
	db, err := w.dbForDay(day)
	if err != nil {
		return err
	}
	_, err = db.Exec("DELETE FROM samples")
	return err
}

// daysInRange returns "YYYY-MM-DD" strings covering [from, to].
func daysInRange(from, to time.Time) []string {
	var days []string
	cur := from.UTC().Truncate(24 * time.Hour)
	end := to.UTC().Truncate(24 * time.Hour)
	for !cur.After(end) {
		days = append(days, cur.Format("2006-01-02"))
		cur = cur.AddDate(0, 0, 1)
	}
	return days
}
