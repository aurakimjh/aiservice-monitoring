// Package database provides the PostgreSQL persistence layer for the Collection Server.
// It replaces the in-memory registries with durable storage and provides
// CRUD operations for agents, jobs, results, diagnostics, and terminal sessions.
package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// DB wraps a PostgreSQL connection pool.
type DB struct {
	conn *sql.DB
}

// Config holds database connection parameters.
type Config struct {
	URL             string        `yaml:"url"` // postgres://user:pass@host:5432/dbname?sslmode=disable
	MaxOpenConns    int           `yaml:"max_open_conns"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime time.Duration `yaml:"conn_max_lifetime"`
}

// Agent represents a row in the agents table.
type Agent struct {
	AgentID       string    `json:"agent_id"`
	Hostname      string    `json:"hostname"`
	OSType        string    `json:"os_type"`
	OSVersion     string    `json:"os_version"`
	AgentVersion  string    `json:"agent_version"`
	Status        string    `json:"status"`
	ProjectID     string    `json:"project_id,omitempty"`
	Tags          []string  `json:"tags"`
	CPUPercent    float64   `json:"cpu_percent"`
	MemoryMB      float64   `json:"memory_mb"`
	RegisteredAt  time.Time `json:"registered_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// CollectionJob represents a row in the collection_jobs table.
type CollectionJob struct {
	JobID       string    `json:"job_id"`
	AgentID     string    `json:"agent_id"`
	JobType     string    `json:"job_type"`
	Status      string    `json:"status"`
	Collectors  []string  `json:"collectors"`
	Progress    int       `json:"progress"`
	ResultCount int       `json:"result_count"`
	ErrorCount  int       `json:"error_count"`
	StartedAt   time.Time `json:"started_at,omitempty"`
	CompletedAt time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// CollectResult represents a row in the collect_results table.
type CollectResult struct {
	ResultID    string    `json:"result_id"`
	JobID       string    `json:"job_id,omitempty"`
	AgentID     string    `json:"agent_id"`
	CollectorID string    `json:"collector_id"`
	SchemaName  string    `json:"schema_name"`
	Status      string    `json:"status"`
	ItemCount   int       `json:"item_count"`
	ErrorCount  int       `json:"error_count"`
	DurationMS  int       `json:"duration_ms"`
	S3Key       string    `json:"s3_key,omitempty"`
	Metadata    string    `json:"metadata,omitempty"`
	CollectedAt time.Time `json:"collected_at"`
	ReceivedAt  time.Time `json:"received_at"`
}

// DiagnosticResult represents a row in the diagnostic_results table.
type DiagnosticResult struct {
	DiagnosticID string          `json:"diagnostic_id"`
	AgentID      string          `json:"agent_id"`
	JobID        string          `json:"job_id,omitempty"`
	Scope        string          `json:"scope"`
	TotalItems   int             `json:"total_items"`
	Passed       int             `json:"passed"`
	Warned       int             `json:"warned"`
	Failed       int             `json:"failed"`
	Items        json.RawMessage `json:"items,omitempty"`
	StartedAt    time.Time       `json:"started_at,omitempty"`
	CompletedAt  time.Time       `json:"completed_at,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
}

// New opens a database connection using the provided config.
// If the URL is empty, returns a nil DB (fallback to in-memory mode).
func New(cfg Config) (*DB, error) {
	if cfg.URL == "" {
		return nil, nil
	}

	conn, err := sql.Open("postgres", cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	if cfg.MaxOpenConns > 0 {
		conn.SetMaxOpenConns(cfg.MaxOpenConns)
	} else {
		conn.SetMaxOpenConns(25)
	}
	if cfg.MaxIdleConns > 0 {
		conn.SetMaxIdleConns(cfg.MaxIdleConns)
	} else {
		conn.SetMaxIdleConns(5)
	}
	if cfg.ConnMaxLifetime > 0 {
		conn.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	} else {
		conn.SetConnMaxLifetime(5 * time.Minute)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return &DB{conn: conn}, nil
}

// Close closes the database connection.
func (db *DB) Close() error {
	if db == nil || db.conn == nil {
		return nil
	}
	return db.conn.Close()
}

// IsAvailable returns true if the DB connection is active.
func (db *DB) IsAvailable() bool {
	return db != nil && db.conn != nil
}

// ── Agent CRUD ──────────────────────────────────────────────────────────────

// UpsertAgent inserts or updates an agent record (on heartbeat).
func (db *DB) UpsertAgent(ctx context.Context, a *Agent) error {
	if !db.IsAvailable() {
		return nil
	}

	tagsJSON, _ := json.Marshal(a.Tags)

	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO agents (agent_id, hostname, os_type, os_version, agent_version, status, project_id, tags, cpu_percent, memory_mb, last_heartbeat, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
		ON CONFLICT (agent_id) DO UPDATE SET
			hostname = EXCLUDED.hostname,
			os_type = EXCLUDED.os_type,
			os_version = EXCLUDED.os_version,
			agent_version = EXCLUDED.agent_version,
			status = EXCLUDED.status,
			cpu_percent = EXCLUDED.cpu_percent,
			memory_mb = EXCLUDED.memory_mb,
			last_heartbeat = EXCLUDED.last_heartbeat,
			updated_at = NOW()
	`, a.AgentID, a.Hostname, a.OSType, a.OSVersion, a.AgentVersion,
		a.Status, a.ProjectID, string(tagsJSON), a.CPUPercent, a.MemoryMB, a.LastHeartbeat)

	return err
}

// ListAgents returns all agents, optionally filtered by project.
func (db *DB) ListAgents(ctx context.Context, projectID string) ([]Agent, error) {
	if !db.IsAvailable() {
		return nil, nil
	}

	query := `SELECT agent_id, hostname, os_type, os_version, agent_version, status,
	           COALESCE(project_id,''), cpu_percent, memory_mb, registered_at,
	           COALESCE(last_heartbeat, registered_at), updated_at
	          FROM agents`
	args := []interface{}{}
	if projectID != "" {
		query += " WHERE project_id = $1"
		args = append(args, projectID)
	}
	query += " ORDER BY hostname"

	rows, err := db.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		if err := rows.Scan(&a.AgentID, &a.Hostname, &a.OSType, &a.OSVersion,
			&a.AgentVersion, &a.Status, &a.ProjectID, &a.CPUPercent, &a.MemoryMB,
			&a.RegisteredAt, &a.LastHeartbeat, &a.UpdatedAt); err != nil {
			return nil, err
		}
		agents = append(agents, a)
	}
	return agents, rows.Err()
}

// GetAgent returns a single agent by ID.
func (db *DB) GetAgent(ctx context.Context, agentID string) (*Agent, error) {
	if !db.IsAvailable() {
		return nil, nil
	}

	var a Agent
	err := db.conn.QueryRowContext(ctx, `
		SELECT agent_id, hostname, os_type, os_version, agent_version, status,
		       COALESCE(project_id,''), cpu_percent, memory_mb, registered_at,
		       COALESCE(last_heartbeat, registered_at), updated_at
		FROM agents WHERE agent_id = $1
	`, agentID).Scan(&a.AgentID, &a.Hostname, &a.OSType, &a.OSVersion,
		&a.AgentVersion, &a.Status, &a.ProjectID, &a.CPUPercent, &a.MemoryMB,
		&a.RegisteredAt, &a.LastHeartbeat, &a.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &a, err
}

// ── Collection Job CRUD ─────────────────────────────────────────────────────

// InsertJob creates a new collection job.
func (db *DB) InsertJob(ctx context.Context, j *CollectionJob) error {
	if !db.IsAvailable() {
		return nil
	}

	collectorsJSON, _ := json.Marshal(j.Collectors)

	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO collection_jobs (job_id, agent_id, job_type, status, collectors, progress)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, j.JobID, j.AgentID, j.JobType, j.Status, string(collectorsJSON), j.Progress)

	return err
}

// UpdateJobStatus updates a job's status and progress.
func (db *DB) UpdateJobStatus(ctx context.Context, jobID, status string, progress int) error {
	if !db.IsAvailable() {
		return nil
	}

	completedAt := sql.NullTime{}
	if status == "completed" || status == "failed" || status == "cancelled" {
		completedAt = sql.NullTime{Time: time.Now(), Valid: true}
	}

	_, err := db.conn.ExecContext(ctx, `
		UPDATE collection_jobs SET status=$1, progress=$2, completed_at=$3 WHERE job_id=$4
	`, status, progress, completedAt, jobID)

	return err
}

// ListJobs returns recent collection jobs, optionally filtered by agent.
func (db *DB) ListJobs(ctx context.Context, agentID string, limit int) ([]CollectionJob, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	if limit <= 0 {
		limit = 50
	}

	query := `SELECT job_id, agent_id, job_type, status, progress, result_count, error_count,
	           COALESCE(started_at, created_at), COALESCE(completed_at, created_at), created_at
	          FROM collection_jobs`
	args := []interface{}{}
	if agentID != "" {
		query += " WHERE agent_id = $1"
		args = append(args, agentID)
	}
	query += " ORDER BY created_at DESC LIMIT " + fmt.Sprintf("%d", limit)

	rows, err := db.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []CollectionJob
	for rows.Next() {
		var j CollectionJob
		if err := rows.Scan(&j.JobID, &j.AgentID, &j.JobType, &j.Status,
			&j.Progress, &j.ResultCount, &j.ErrorCount,
			&j.StartedAt, &j.CompletedAt, &j.CreatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

// ── Collect Result CRUD ─────────────────────────────────────────────────────

// InsertResult stores a collect result metadata row (evidence is in S3).
func (db *DB) InsertResult(ctx context.Context, r *CollectResult) error {
	if !db.IsAvailable() {
		return nil
	}

	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO collect_results (result_id, job_id, agent_id, collector_id, schema_name,
		  status, item_count, error_count, duration_ms, s3_key, metadata, collected_at)
		VALUES ($1, NULLIF($2,''), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, r.ResultID, r.JobID, r.AgentID, r.CollectorID, r.SchemaName,
		r.Status, r.ItemCount, r.ErrorCount, r.DurationMS, r.S3Key, r.Metadata, r.CollectedAt)

	return err
}

// ── Diagnostic Result CRUD ──────────────────────────────────────────────────

// InsertDiagnostic stores a diagnostic run result.
func (db *DB) InsertDiagnostic(ctx context.Context, d *DiagnosticResult) error {
	if !db.IsAvailable() {
		return nil
	}

	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO diagnostic_results (diagnostic_id, agent_id, job_id, scope,
		  total_items, passed, warned, failed, items, started_at, completed_at)
		VALUES ($1, $2, NULLIF($3,''), $4, $5, $6, $7, $8, $9, $10, $11)
	`, d.DiagnosticID, d.AgentID, d.JobID, d.Scope,
		d.TotalItems, d.Passed, d.Warned, d.Failed, string(d.Items),
		d.StartedAt, d.CompletedAt)

	return err
}

// ListDiagnostics returns recent diagnostic runs.
func (db *DB) ListDiagnostics(ctx context.Context, agentID string, limit int) ([]DiagnosticResult, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	if limit <= 0 {
		limit = 20
	}

	query := `SELECT diagnostic_id, agent_id, COALESCE(job_id,''), scope,
	           total_items, passed, warned, failed,
	           COALESCE(started_at, created_at), COALESCE(completed_at, created_at), created_at
	          FROM diagnostic_results`
	args := []interface{}{}
	if agentID != "" {
		query += " WHERE agent_id = $1"
		args = append(args, agentID)
	}
	query += " ORDER BY created_at DESC LIMIT " + fmt.Sprintf("%d", limit)

	rows, err := db.conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var diags []DiagnosticResult
	for rows.Next() {
		var d DiagnosticResult
		if err := rows.Scan(&d.DiagnosticID, &d.AgentID, &d.JobID, &d.Scope,
			&d.TotalItems, &d.Passed, &d.Warned, &d.Failed,
			&d.StartedAt, &d.CompletedAt, &d.CreatedAt); err != nil {
			return nil, err
		}
		diags = append(diags, d)
	}
	return diags, rows.Err()
}

// ── Health Check ────────────────────────────────────────────────────────────

// Ping checks the database connection.
func (db *DB) Ping(ctx context.Context) error {
	if !db.IsAvailable() {
		return fmt.Errorf("database not configured")
	}
	return db.conn.PingContext(ctx)
}
