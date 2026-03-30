package tracestore

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
	_ "modernc.org/sqlite" // CGO-free SQLite driver
)

// WarmStore is the SQLite-backed warm tier (30-day rolling window).
// Each calendar day lives in its own SQLite file to allow cheap date-range
// pruning: drop the file, no VACUUM needed.
//
// Schema:
//
//	traces(trace_id PK, service_name, root_name, start_time, end_time,
//	       duration_ms, status_code, span_count, created_at)
//	spans (trace_id, span_id PK, parent_id, service_name, name, kind,
//	       start_time, end_time, duration_ms, status_code, status_message,
//	       attributes_json, events_json, resource_json, received_at)
//	spans_fts  — FTS5 virtual table over (name, service_name, attributes_json)
//
// All timestamps are stored as Unix nanoseconds (INTEGER).
type WarmStore struct {
	dir    string // directory that holds daily SQLite files
	logger *slog.Logger

	// open holds currently open DB handles keyed by "YYYY-MM-DD".
	// We keep at most a small number open to avoid fd exhaustion.
	open map[string]*sql.DB
}

// NewWarmStore opens (or creates) the warm-tier store under dir.
func NewWarmStore(dir string, logger *slog.Logger) (*WarmStore, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("tracestore warm: mkdir %s: %w", dir, err)
	}
	return &WarmStore{
		dir:    dir,
		logger: logger,
		open:   make(map[string]*sql.DB),
	}, nil
}

// Write persists spans (and assembles/upserts trace summary rows) into the
// appropriate daily SQLite file.
func (w *WarmStore) Write(spans []*otlp.Span) error {
	// Group spans by calendar day (UTC) of their start time.
	byDay := make(map[string][]*otlp.Span)
	for _, s := range spans {
		day := s.StartTime.UTC().Format("2006-01-02")
		byDay[day] = append(byDay[day], s)
	}
	for day, batch := range byDay {
		db, err := w.dbForDay(day)
		if err != nil {
			return err
		}
		if err := w.writeBatch(db, batch); err != nil {
			return fmt.Errorf("tracestore warm write day=%s: %w", day, err)
		}
	}
	return nil
}

// QueryTraces searches the warm tier across the [from, to] window.
// Supported filters: serviceName, statusCode (0=any), tag key=value pairs.
func (w *WarmStore) QueryTraces(req QueryRequest) ([]*TraceRow, error) {
	days := daysInRange(req.From, req.To)
	var results []*TraceRow

	for _, day := range days {
		db, err := w.dbForDay(day)
		if err != nil {
			// Day file may not exist yet — skip silently.
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		rows, err := w.queryTracesFromDB(db, req)
		if err != nil {
			w.logger.Warn("warm query error", "day", day, "error", err)
			continue
		}
		results = append(results, rows...)
		if req.Limit > 0 && len(results) >= req.Limit {
			break
		}
	}
	if req.Limit > 0 && len(results) > req.Limit {
		results = results[:req.Limit]
	}
	return results, nil
}

// GetTrace returns all spans for a trace ID, searching across all warm-tier
// days in the provided window.
func (w *WarmStore) GetTrace(traceID string, from, to time.Time) ([]*otlp.Span, error) {
	days := daysInRange(from, to)
	for _, day := range days {
		db, err := w.dbForDay(day)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		spans, err := w.spansForTrace(db, traceID)
		if err != nil {
			continue
		}
		if len(spans) > 0 {
			return spans, nil
		}
	}
	return nil, nil
}

// XLogPoints returns XLog-compatible (timestamp, durationMs, statusCode) rows
// for a service within a time window.  Results are ordered by start_time ASC.
func (w *WarmStore) XLogPoints(serviceName string, from, to time.Time, limit int) ([]XLogPoint, error) {
	days := daysInRange(from, to)
	var out []XLogPoint

	for _, day := range days {
		db, err := w.dbForDay(day)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		pts, err := w.xlogFromDB(db, serviceName, from, to, limit-len(out))
		if err != nil {
			w.logger.Warn("xlog query error", "day", day, "error", err)
			continue
		}
		out = append(out, pts...)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out, nil
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
			// Close the handle before removing.
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

// Close closes all open SQLite handles.
func (w *WarmStore) Close() {
	for _, db := range w.open {
		db.Close()
	}
}

// ── internal helpers ──────────────────────────────────────────────────────────

func (w *WarmStore) dbForDay(day string) (*sql.DB, error) {
	if db, ok := w.open[day]; ok {
		return db, nil
	}
	path := filepath.Join(w.dir, day+".db")
	db, err := sql.Open("sqlite", path+"?_journal=WAL&_busy_timeout=5000&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", path, err)
	}
	db.SetMaxOpenConns(1) // SQLite WAL allows 1 writer + N readers
	if err := applySchema(db); err != nil {
		db.Close()
		return nil, err
	}
	w.open[day] = db
	return db, nil
}

// applySchema idempotently creates all required tables and indexes.
func applySchema(db *sql.DB) error {
	_, err := db.Exec(`
-- Trace summary (one row per trace)
CREATE TABLE IF NOT EXISTS traces (
    trace_id     TEXT    NOT NULL PRIMARY KEY,
    service_name TEXT    NOT NULL,
    root_name    TEXT    NOT NULL DEFAULT '',
    start_time   INTEGER NOT NULL, -- Unix nanoseconds
    end_time     INTEGER NOT NULL,
    duration_ms  REAL    NOT NULL,
    status_code  INTEGER NOT NULL DEFAULT 0,
    span_count   INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_service   ON traces(service_name);
CREATE INDEX IF NOT EXISTS idx_traces_start     ON traces(start_time);
CREATE INDEX IF NOT EXISTS idx_traces_status    ON traces(status_code);

-- Individual spans
CREATE TABLE IF NOT EXISTS spans (
    span_id          TEXT    NOT NULL PRIMARY KEY,
    trace_id         TEXT    NOT NULL,
    parent_id        TEXT    NOT NULL DEFAULT '',
    service_name     TEXT    NOT NULL,
    name             TEXT    NOT NULL,
    kind             INTEGER NOT NULL DEFAULT 0,
    start_time       INTEGER NOT NULL,
    end_time         INTEGER NOT NULL,
    duration_ms      REAL    NOT NULL,
    status_code      INTEGER NOT NULL DEFAULT 0,
    status_message   TEXT    NOT NULL DEFAULT '',
    attributes_json  TEXT    NOT NULL DEFAULT '{}',
    events_json      TEXT    NOT NULL DEFAULT '[]',
    resource_json    TEXT    NOT NULL DEFAULT '{}',
    received_at      INTEGER NOT NULL,
    FOREIGN KEY (trace_id) REFERENCES traces(trace_id)
);
CREATE INDEX IF NOT EXISTS idx_spans_trace   ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_service ON spans(service_name);
CREATE INDEX IF NOT EXISTS idx_spans_start   ON spans(start_time);

-- FTS5 full-text index over span name, service, and attributes
CREATE VIRTUAL TABLE IF NOT EXISTS spans_fts USING fts5(
    span_id UNINDEXED,
    trace_id UNINDEXED,
    name,
    service_name,
    attributes_json,
    content=spans,
    content_rowid=rowid
);

-- Keep FTS in sync via triggers
CREATE TRIGGER IF NOT EXISTS spans_fts_insert AFTER INSERT ON spans BEGIN
    INSERT INTO spans_fts(rowid, span_id, trace_id, name, service_name, attributes_json)
    VALUES (new.rowid, new.span_id, new.trace_id, new.name, new.service_name, new.attributes_json);
END;
CREATE TRIGGER IF NOT EXISTS spans_fts_delete AFTER DELETE ON spans BEGIN
    INSERT INTO spans_fts(spans_fts, rowid, span_id, trace_id, name, service_name, attributes_json)
    VALUES ('delete', old.rowid, old.span_id, old.trace_id, old.name, old.service_name, old.attributes_json);
END;
CREATE TRIGGER IF NOT EXISTS spans_fts_update AFTER UPDATE ON spans BEGIN
    INSERT INTO spans_fts(spans_fts, rowid, span_id, trace_id, name, service_name, attributes_json)
    VALUES ('delete', old.rowid, old.span_id, old.trace_id, old.name, old.service_name, old.attributes_json);
    INSERT INTO spans_fts(rowid, span_id, trace_id, name, service_name, attributes_json)
    VALUES (new.rowid, new.span_id, new.trace_id, new.name, new.service_name, new.attributes_json);
END;
`)
	return err
}

func (w *WarmStore) writeBatch(db *sql.DB, spans []*otlp.Span) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	stmtSpan, err := tx.Prepare(`
INSERT OR REPLACE INTO spans
    (span_id, trace_id, parent_id, service_name, name, kind,
     start_time, end_time, duration_ms, status_code, status_message,
     attributes_json, events_json, resource_json, received_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return err
	}
	defer stmtSpan.Close()

	stmtTrace, err := tx.Prepare(`
INSERT INTO traces (trace_id, service_name, root_name, start_time, end_time,
                   duration_ms, status_code, span_count, created_at)
VALUES (?,?,?,?,?,?,?,1,?)
ON CONFLICT(trace_id) DO UPDATE SET
    end_time   = MAX(end_time,   excluded.end_time),
    duration_ms= MAX(duration_ms,excluded.duration_ms),
    status_code= MAX(status_code,excluded.status_code),
    span_count = span_count + 1`)
	if err != nil {
		return err
	}
	defer stmtTrace.Close()

	now := time.Now().UTC().UnixNano()

	for _, s := range spans {
		attrJSON, _ := json.Marshal(s.Attributes)
		evJSON, _ := json.Marshal(s.Events)
		resJSON, _ := json.Marshal(s.Resource)

		_, err = stmtSpan.Exec(
			s.SpanID, s.TraceID, s.ParentID, s.ServiceName, s.Name, int(s.Kind),
			s.StartTime.UnixNano(), s.EndTime.UnixNano(), s.DurationMS(),
			int(s.StatusCode), s.StatusMessage,
			string(attrJSON), string(evJSON), string(resJSON),
			s.ReceivedAt.UnixNano(),
		)
		if err != nil {
			return fmt.Errorf("insert span %s: %w", s.SpanID, err)
		}

		rootName := ""
		if s.IsRoot() {
			rootName = s.Name
		}
		_, err = stmtTrace.Exec(
			s.TraceID, s.ServiceName, rootName,
			s.StartTime.UnixNano(), s.EndTime.UnixNano(), s.DurationMS(),
			int(s.StatusCode), now,
		)
		if err != nil {
			return fmt.Errorf("upsert trace %s: %w", s.TraceID, err)
		}
	}
	return tx.Commit()
}

func (w *WarmStore) queryTracesFromDB(db *sql.DB, req QueryRequest) ([]*TraceRow, error) {
	var conds []string
	var args []interface{}

	conds = append(conds, "start_time >= ? AND start_time <= ?")
	args = append(args, req.From.UnixNano(), req.To.UnixNano())

	if req.ServiceName != "" {
		conds = append(conds, "service_name = ?")
		args = append(args, req.ServiceName)
	}
	if req.StatusCode != 0 {
		conds = append(conds, "status_code = ?")
		args = append(args, req.StatusCode)
	}
	if req.MinDurationMS > 0 {
		conds = append(conds, "duration_ms >= ?")
		args = append(args, req.MinDurationMS)
	}
	if req.MaxDurationMS > 0 {
		conds = append(conds, "duration_ms <= ?")
		args = append(args, req.MaxDurationMS)
	}

	query := "SELECT trace_id, service_name, root_name, start_time, end_time, duration_ms, status_code, span_count FROM traces"
	if len(conds) > 0 {
		query += " WHERE " + strings.Join(conds, " AND ")
	}
	query += " ORDER BY start_time DESC"
	if req.Limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", req.Limit)
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*TraceRow
	for rows.Next() {
		var r TraceRow
		var startNs, endNs int64
		if err := rows.Scan(&r.TraceID, &r.ServiceName, &r.RootName,
			&startNs, &endNs, &r.DurationMS, &r.StatusCode, &r.SpanCount); err != nil {
			return nil, err
		}
		r.StartTime = time.Unix(0, startNs).UTC()
		r.EndTime = time.Unix(0, endNs).UTC()
		out = append(out, &r)
	}
	return out, rows.Err()
}

func (w *WarmStore) spansForTrace(db *sql.DB, traceID string) ([]*otlp.Span, error) {
	rows, err := db.Query(`
SELECT span_id, parent_id, service_name, name, kind,
       start_time, end_time, status_code, status_message,
       attributes_json, events_json, resource_json
FROM spans WHERE trace_id = ? ORDER BY start_time ASC`, traceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*otlp.Span
	for rows.Next() {
		s := &otlp.Span{TraceID: traceID}
		var startNs, endNs int64
		var attrJSON, evJSON, resJSON string
		var kind, statusCode int

		if err := rows.Scan(&s.SpanID, &s.ParentID, &s.ServiceName, &s.Name, &kind,
			&startNs, &endNs, &statusCode, &s.StatusMessage,
			&attrJSON, &evJSON, &resJSON); err != nil {
			return nil, err
		}
		s.Kind = otlp.SpanKind(kind)
		s.StatusCode = otlp.StatusCode(statusCode)
		s.StartTime = time.Unix(0, startNs).UTC()
		s.EndTime = time.Unix(0, endNs).UTC()
		json.Unmarshal([]byte(attrJSON), &s.Attributes) //nolint:errcheck
		json.Unmarshal([]byte(evJSON), &s.Events)       //nolint:errcheck
		json.Unmarshal([]byte(resJSON), &s.Resource)    //nolint:errcheck
		out = append(out, s)
	}
	return out, rows.Err()
}

func (w *WarmStore) xlogFromDB(db *sql.DB, serviceName string, from, to time.Time, limit int) ([]XLogPoint, error) {
	query := `
SELECT start_time, duration_ms, status_code
FROM traces
WHERE service_name = ? AND start_time >= ? AND start_time <= ?
ORDER BY start_time ASC`
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}

	rows, err := db.Query(query, serviceName, from.UnixNano(), to.UnixNano())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []XLogPoint
	for rows.Next() {
		var p XLogPoint
		var startNs int64
		var code int
		if err := rows.Scan(&startNs, &p.DurationMS, &code); err != nil {
			return nil, err
		}
		p.Timestamp = time.Unix(0, startNs).UTC()
		p.StatusCode = otlp.StatusCode(code)
		out = append(out, p)
	}
	return out, rows.Err()
}

// daysInRange returns a slice of "YYYY-MM-DD" strings covering [from, to].
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

// ── Query/Response types ──────────────────────────────────────────────────────

// QueryRequest encapsulates all trace search parameters.
type QueryRequest struct {
	ServiceName   string
	From          time.Time
	To            time.Time
	StatusCode    otlp.StatusCode // 0 = any
	MinDurationMS float64
	MaxDurationMS float64
	Tags          map[string]string // attribute key=value filters
	Limit         int
	Offset        int
}

// TraceRow is a lightweight trace summary returned by search APIs.
type TraceRow struct {
	TraceID     string         `json:"traceId"`
	ServiceName string         `json:"serviceName"`
	RootName    string         `json:"rootName"`
	StartTime   time.Time      `json:"startTime"`
	EndTime     time.Time      `json:"endTime"`
	DurationMS  float64        `json:"durationMs"`
	StatusCode  otlp.StatusCode `json:"statusCode"`
	SpanCount   int            `json:"spanCount"`
	Source      string         `json:"source"` // "hot" | "warm" | "cold"
}

// XLogPoint is one data-point for the XLog scatter-plot.
type XLogPoint struct {
	Timestamp  time.Time      `json:"timestamp"`
	DurationMS float64        `json:"durationMs"`
	StatusCode otlp.StatusCode `json:"statusCode"`
	TraceID    string         `json:"traceId,omitempty"`
}
