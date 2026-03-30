// Package pgstore provides a PostgreSQL storage adapter for the AITOP
// Collection Server (WS-1.6).
//
// It implements the same write/query interface as the SQLite WarmStore but
// backed by PostgreSQL with native partitioning, JSONB, and full-text search.
//
// Components:
//   - Adapter      (S6-1): PostgreSQL storage for metrics + traces + spans
//   - Partitioner  (S6-2): Daily partition auto-creation + expiry DROP
//   - RetentionEngine (S6-3): Smart retention scoring (Critical/Slow/Normal/Health)
//   - AutoDetect   (S6-4): storage.mode auto → PostgreSQL switch recommendation
package pgstore

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Config holds PostgreSQL connection parameters.
type Config struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	DBName   string `yaml:"dbname"`
	SSLMode  string `yaml:"sslmode"` // disable, require, verify-ca, verify-full
}

// DSN returns the PostgreSQL connection string.
func (c Config) DSN() string {
	if c.Port == 0 {
		c.Port = 5432
	}
	if c.SSLMode == "" {
		c.SSLMode = "disable"
	}
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.DBName, c.SSLMode)
}

// Enabled returns true when PostgreSQL is configured.
func (c Config) Enabled() bool {
	return c.Host != "" && c.DBName != ""
}

// ── S6-1: PostgreSQL Storage Adapter ─────────────────────────────────────────

// Adapter provides PostgreSQL-backed storage for metrics and traces.
type Adapter struct {
	db        *sql.DB
	config    Config
	logger    *slog.Logger
	retention *RetentionEngine
}

// New creates and initializes a PostgreSQL adapter.
func New(cfg Config, logger *slog.Logger) (*Adapter, error) {
	if !cfg.Enabled() {
		return nil, fmt.Errorf("pgstore: PostgreSQL not configured")
	}

	db, err := sql.Open("postgres", cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("pgstore: open: %w", err)
	}

	// Connection pool tuning.
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("pgstore: ping: %w", err)
	}

	a := &Adapter{
		db:     db,
		config: cfg,
		logger: logger,
	}

	if err := a.applySchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("pgstore: schema: %w", err)
	}

	a.retention = NewRetentionEngine(db, logger)

	logger.Info("pgstore: connected to PostgreSQL", "host", cfg.Host, "db", cfg.DBName)
	return a, nil
}

// Close closes the database connection.
func (a *Adapter) Close() error { return a.db.Close() }

// DB returns the underlying database connection (for direct queries).
func (a *Adapter) DB() *sql.DB { return a.db }

// ── Schema ───────────────────────────────────────────────────────────────────

func (a *Adapter) applySchema() error {
	_, err := a.db.Exec(`
-- ═══════════════════════════════════════════════════════════
-- AITOP PostgreSQL Schema (WS-1.6)
-- ═══════════════════════════════════════════════════════════

-- Metric samples (partitioned by day)
CREATE TABLE IF NOT EXISTS metric_samples (
    metric_name  TEXT        NOT NULL,
    labels       JSONB       NOT NULL DEFAULT '{}',
    labels_hash  TEXT        NOT NULL,
    ts           BIGINT      NOT NULL,  -- Unix nanoseconds
    value        DOUBLE PRECISION NOT NULL
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS idx_metric_name_hash_ts
    ON metric_samples (metric_name, labels_hash, ts);
CREATE INDEX IF NOT EXISTS idx_metric_ts
    ON metric_samples (ts);
CREATE INDEX IF NOT EXISTS idx_metric_labels
    ON metric_samples USING GIN (labels);

-- Metric names catalogue
CREATE TABLE IF NOT EXISTS metric_names (
    name TEXT PRIMARY KEY
);

-- Trace summaries (partitioned by day)
CREATE TABLE IF NOT EXISTS traces (
    trace_id     TEXT        NOT NULL,
    service_name TEXT        NOT NULL,
    root_name    TEXT        NOT NULL DEFAULT '',
    start_time   BIGINT      NOT NULL,
    end_time     BIGINT      NOT NULL,
    duration_ms  DOUBLE PRECISION NOT NULL,
    status_code  SMALLINT    NOT NULL DEFAULT 0,
    span_count   INTEGER     NOT NULL DEFAULT 1,
    created_at   BIGINT      NOT NULL,
    PRIMARY KEY (trace_id, start_time)
) PARTITION BY RANGE (start_time);

CREATE INDEX IF NOT EXISTS idx_traces_service ON traces (service_name);
CREATE INDEX IF NOT EXISTS idx_traces_status  ON traces (status_code);

-- Spans (partitioned by day)
CREATE TABLE IF NOT EXISTS spans (
    span_id          TEXT    NOT NULL,
    trace_id         TEXT    NOT NULL,
    parent_id        TEXT    NOT NULL DEFAULT '',
    service_name     TEXT    NOT NULL,
    name             TEXT    NOT NULL,
    kind             SMALLINT NOT NULL DEFAULT 0,
    start_time       BIGINT  NOT NULL,
    end_time         BIGINT  NOT NULL,
    duration_ms      DOUBLE PRECISION NOT NULL,
    status_code      SMALLINT NOT NULL DEFAULT 0,
    status_message   TEXT    NOT NULL DEFAULT '',
    attributes       JSONB   NOT NULL DEFAULT '{}',
    events           JSONB   NOT NULL DEFAULT '[]',
    resource         JSONB   NOT NULL DEFAULT '{}',
    received_at      BIGINT  NOT NULL,
    PRIMARY KEY (span_id, start_time)
) PARTITION BY RANGE (start_time);

CREATE INDEX IF NOT EXISTS idx_spans_trace   ON spans (trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_service ON spans (service_name);
CREATE INDEX IF NOT EXISTS idx_spans_attrs   ON spans USING GIN (attributes);

-- Downsampled metric aggregates (1 minute)
CREATE TABLE IF NOT EXISTS metric_samples_1m (
    metric_name  TEXT        NOT NULL,
    labels       JSONB       NOT NULL DEFAULT '{}',
    labels_hash  TEXT        NOT NULL,
    ts           BIGINT      NOT NULL,
    val_avg      DOUBLE PRECISION NOT NULL,
    val_min      DOUBLE PRECISION NOT NULL,
    val_max      DOUBLE PRECISION NOT NULL,
    val_sum      DOUBLE PRECISION NOT NULL,
    val_count    BIGINT      NOT NULL
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS idx_metric_1m_name_hash_ts
    ON metric_samples_1m (metric_name, labels_hash, ts);

-- Downsampled metric aggregates (1 hour)
CREATE TABLE IF NOT EXISTS metric_samples_1h (
    metric_name  TEXT        NOT NULL,
    labels       JSONB       NOT NULL DEFAULT '{}',
    labels_hash  TEXT        NOT NULL,
    ts           BIGINT      NOT NULL,
    val_avg      DOUBLE PRECISION NOT NULL,
    val_min      DOUBLE PRECISION NOT NULL,
    val_max      DOUBLE PRECISION NOT NULL,
    val_sum      DOUBLE PRECISION NOT NULL,
    val_count    BIGINT      NOT NULL
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS idx_metric_1h_name_hash_ts
    ON metric_samples_1h (metric_name, labels_hash, ts);

-- S6-3: Retention policy metadata
CREATE TABLE IF NOT EXISTS retention_policies (
    metric_name  TEXT    NOT NULL,
    labels_hash  TEXT    NOT NULL DEFAULT '*',
    grade        TEXT    NOT NULL DEFAULT 'normal',  -- critical, slow, normal, health
    retain_days  INTEGER NOT NULL DEFAULT 90,
    updated_at   BIGINT  NOT NULL,
    PRIMARY KEY (metric_name, labels_hash)
);
`)
	return err
}

// ── S6-2: Daily Partition Management ─────────────────────────────────────────

// EnsurePartitions creates daily partitions for the next N days.
func (a *Adapter) EnsurePartitions(daysAhead int) error {
	tables := []string{"metric_samples", "metric_samples_1m", "metric_samples_1h", "traces", "spans"}

	for d := -1; d <= daysAhead; d++ {
		day := time.Now().UTC().AddDate(0, 0, d)
		dayStr := day.Format("2006_01_02")
		startNs := day.Truncate(24 * time.Hour).UnixNano()
		endNs := day.Truncate(24*time.Hour).AddDate(0, 0, 1).UnixNano()

		for _, table := range tables {
			partName := fmt.Sprintf("%s_p%s", table, dayStr)
			sql := fmt.Sprintf(
				`CREATE TABLE IF NOT EXISTS %s PARTITION OF %s FOR VALUES FROM (%d) TO (%d)`,
				partName, table, startNs, endNs)
			if _, err := a.db.Exec(sql); err != nil {
				// Partition may already exist — ignore.
				if !strings.Contains(err.Error(), "already exists") {
					a.logger.Warn("pgstore: create partition", "table", partName, "error", err)
				}
			}
		}
	}
	return nil
}

// DropExpiredPartitions removes partitions older than retainDays.
func (a *Adapter) DropExpiredPartitions(retainDays int) error {
	cutoff := time.Now().UTC().AddDate(0, 0, -retainDays)
	tables := []string{"metric_samples", "metric_samples_1m", "metric_samples_1h", "traces", "spans"}

	for d := retainDays; d < retainDays+365; d++ {
		day := time.Now().UTC().AddDate(0, 0, -d)
		if day.After(cutoff) {
			continue
		}
		dayStr := day.Format("2006_01_02")

		for _, table := range tables {
			partName := fmt.Sprintf("%s_p%s", table, dayStr)
			sql := fmt.Sprintf("DROP TABLE IF EXISTS %s", partName)
			if _, err := a.db.Exec(sql); err != nil {
				a.logger.Warn("pgstore: drop partition", "table", partName, "error", err)
			} else {
				a.logger.Info("pgstore: dropped expired partition", "table", partName)
			}
		}
	}
	return nil
}

// ── Write methods ────────────────────────────────────────────────────────────

// WriteMetricSamples writes a batch of metric samples.
func (a *Adapter) WriteMetricSamples(samples []MetricSample) error {
	if len(samples) == 0 {
		return nil
	}
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	stmt, err := tx.Prepare(
		`INSERT INTO metric_samples (metric_name, labels, labels_hash, ts, value)
		 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	nameStmt, err := tx.Prepare(`INSERT INTO metric_names (name) VALUES ($1) ON CONFLICT DO NOTHING`)
	if err != nil {
		return err
	}
	defer nameStmt.Close()

	for _, s := range samples {
		labelsJSON, _ := json.Marshal(s.Labels)
		stmt.Exec(s.MetricName, string(labelsJSON), s.LabelsHash, s.TimestampNs, s.Value) //nolint:errcheck
		nameStmt.Exec(s.MetricName) //nolint:errcheck
	}
	return tx.Commit()
}

// WriteSpans writes a batch of trace spans.
func (a *Adapter) WriteSpans(spans []SpanRecord) error {
	if len(spans) == 0 {
		return nil
	}
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	spanStmt, err := tx.Prepare(
		`INSERT INTO spans (span_id, trace_id, parent_id, service_name, name, kind,
		  start_time, end_time, duration_ms, status_code, status_message,
		  attributes, events, resource, received_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		 ON CONFLICT DO NOTHING`)
	if err != nil {
		return err
	}
	defer spanStmt.Close()

	traceStmt, err := tx.Prepare(
		`INSERT INTO traces (trace_id, service_name, root_name, start_time, end_time,
		  duration_ms, status_code, span_count, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)
		 ON CONFLICT (trace_id, start_time) DO UPDATE SET
		    end_time = GREATEST(traces.end_time, EXCLUDED.end_time),
		    duration_ms = GREATEST(traces.duration_ms, EXCLUDED.duration_ms),
		    status_code = GREATEST(traces.status_code, EXCLUDED.status_code),
		    span_count = traces.span_count + 1`)
	if err != nil {
		return err
	}
	defer traceStmt.Close()

	now := time.Now().UTC().UnixNano()
	for _, s := range spans {
		attrsJSON, _ := json.Marshal(s.Attributes)
		eventsJSON, _ := json.Marshal(s.Events)
		resourceJSON, _ := json.Marshal(s.Resource)

		spanStmt.Exec(s.SpanID, s.TraceID, s.ParentID, s.ServiceName, s.Name, s.Kind,
			s.StartTimeNs, s.EndTimeNs, s.DurationMS, s.StatusCode, s.StatusMessage,
			string(attrsJSON), string(eventsJSON), string(resourceJSON), s.ReceivedAtNs) //nolint:errcheck

		traceStmt.Exec(s.TraceID, s.ServiceName, s.RootName,
			s.StartTimeNs, s.EndTimeNs, s.DurationMS, s.StatusCode, now) //nolint:errcheck
	}
	return tx.Commit()
}

// ── S6-4: Auto-detection + recommendation ────────────────────────────────────

// StorageRecommendation provides guidance on when to switch to PostgreSQL.
type StorageRecommendation struct {
	CurrentMode     string `json:"currentMode"`     // sqlite, postgresql
	RecommendedMode string `json:"recommendedMode"`
	Reason          string `json:"reason"`
	MetricCount     int64  `json:"metricCount"`
	TraceCount      int64  `json:"traceCount"`
	DataSizeMB      int64  `json:"dataSizeMb"`
}

// RecommendStorageMode evaluates whether PostgreSQL should be used.
func RecommendStorageMode(metricSeriesCount int, traceCountPerDay int64, dataSizeMB int64) StorageRecommendation {
	rec := StorageRecommendation{
		CurrentMode: "sqlite",
		MetricCount: int64(metricSeriesCount),
		TraceCount:  traceCountPerDay,
		DataSizeMB:  dataSizeMB,
	}

	// Thresholds for PostgreSQL recommendation.
	if metricSeriesCount > 10000 || traceCountPerDay > 1_000_000 || dataSizeMB > 10_000 {
		rec.RecommendedMode = "postgresql"
		rec.Reason = "데이터 규모가 SQLite 한계를 초과합니다. PostgreSQL 전환을 권장합니다."
	} else if metricSeriesCount > 5000 || traceCountPerDay > 500_000 || dataSizeMB > 5_000 {
		rec.RecommendedMode = "postgresql"
		rec.Reason = "데이터 증가 추세를 고려하여 PostgreSQL 전환을 권장합니다."
	} else {
		rec.RecommendedMode = "sqlite"
		rec.Reason = "현재 데이터 규모에서는 SQLite로 충분합니다."
	}

	return rec
}

// ── Run background maintenance ───────────────────────────────────────────────

// StartMaintenance launches partition management + retention in background.
func (a *Adapter) StartMaintenance(ctx context.Context, retainDays int) {
	// Create partitions for next 3 days immediately.
	a.EnsurePartitions(3)

	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.EnsurePartitions(3)
				a.DropExpiredPartitions(retainDays)
				a.retention.RunRetentionCycle()
			}
		}
	}()
}

// ── Data models ──────────────────────────────────────────────────────────────

// MetricSample is a single metric data point for PostgreSQL write.
type MetricSample struct {
	MetricName  string
	Labels      map[string]string
	LabelsHash  string
	TimestampNs int64
	Value       float64
}

// SpanRecord is a single span for PostgreSQL write.
type SpanRecord struct {
	SpanID        string
	TraceID       string
	ParentID      string
	ServiceName   string
	Name          string
	RootName      string
	Kind          int
	StartTimeNs   int64
	EndTimeNs     int64
	DurationMS    float64
	StatusCode    int
	StatusMessage string
	Attributes    map[string]string
	Events        []interface{}
	Resource      map[string]string
	ReceivedAtNs  int64
}
