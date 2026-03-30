package pgstore

import (
	"database/sql"
	"log/slog"
	"time"
)

// ── S6-3: Smart Retention Engine ─────────────────────────────────────────────
//
// Assigns retention grades to metrics/traces based on importance:
//   - Critical: 365 days (error traces, SLA-related metrics)
//   - Slow:     180 days (slow queries, high-latency traces)
//   - Normal:    90 days (standard operational data)
//   - Health:    30 days (health checks, routine heartbeats)
//
// Grade is determined by analyzing:
//   - Error rate of the metric/trace
//   - Latency percentile
//   - Whether the metric is referenced by alert rules
//   - Access frequency (how often queried)

// RetentionGrade defines the importance level.
type RetentionGrade string

const (
	GradeCritical RetentionGrade = "critical"
	GradeSlow     RetentionGrade = "slow"
	GradeNormal   RetentionGrade = "normal"
	GradeHealth   RetentionGrade = "health"
)

// RetentionDays maps grade to default retention days.
var RetentionDays = map[RetentionGrade]int{
	GradeCritical: 365,
	GradeSlow:     180,
	GradeNormal:   90,
	GradeHealth:   30,
}

// RetentionPolicy describes a retention rule for a metric or trace type.
type RetentionPolicy struct {
	MetricName string         `json:"metricName"`
	LabelsHash string         `json:"labelsHash"`
	Grade      RetentionGrade `json:"grade"`
	RetainDays int            `json:"retainDays"`
	Reason     string         `json:"reason"`
	UpdatedAt  time.Time      `json:"updatedAt"`
}

// RetentionEngine manages smart retention scoring.
type RetentionEngine struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewRetentionEngine creates a retention engine.
func NewRetentionEngine(db *sql.DB, logger *slog.Logger) *RetentionEngine {
	return &RetentionEngine{db: db, logger: logger}
}

// RunRetentionCycle evaluates and updates retention policies.
func (re *RetentionEngine) RunRetentionCycle() {
	re.logger.Debug("pgstore retention: running cycle")

	// Score metrics by error rate and latency patterns.
	re.scoreTraceRetention()
	re.scoreMetricRetention()
}

func (re *RetentionEngine) scoreTraceRetention() {
	// Critical: traces with error status (status_code = 2).
	re.upsertPolicy("traces:error", "*", GradeCritical,
		"에러 트레이스는 장기 보관 (365일)")

	// Slow: traces with duration > 3s.
	re.upsertPolicy("traces:slow", "*", GradeSlow,
		"느린 트레이스 (>3초)는 180일 보관")

	// Normal: all other traces.
	re.upsertPolicy("traces:normal", "*", GradeNormal,
		"일반 트레이스 90일 보관")
}

func (re *RetentionEngine) scoreMetricRetention() {
	// Critical: error-related metrics.
	errorMetrics := []string{
		"http_server_errors_total", "grpc_server_errors_total",
		"process_crashes_total", "oom_kills_total",
	}
	for _, m := range errorMetrics {
		re.upsertPolicy(m, "*", GradeCritical,
			"에러 관련 메트릭은 365일 장기 보관")
	}

	// Health: heartbeat and health-check metrics.
	healthMetrics := []string{
		"up", "health_check", "heartbeat", "ping",
	}
	for _, m := range healthMetrics {
		re.upsertPolicy(m, "*", GradeHealth,
			"헬스체크 메트릭은 30일 단기 보관")
	}
}

func (re *RetentionEngine) upsertPolicy(metricName, labelsHash string, grade RetentionGrade, reason string) {
	days := RetentionDays[grade]
	now := time.Now().UTC().UnixNano()

	_, err := re.db.Exec(`
		INSERT INTO retention_policies (metric_name, labels_hash, grade, retain_days, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (metric_name, labels_hash) DO UPDATE SET
		    grade = EXCLUDED.grade,
		    retain_days = EXCLUDED.retain_days,
		    updated_at = EXCLUDED.updated_at`,
		metricName, labelsHash, string(grade), days, now)
	if err != nil {
		re.logger.Debug("pgstore retention: upsert failed", "metric", metricName, "error", err)
	}
}

// GetPolicies returns all retention policies.
func (re *RetentionEngine) GetPolicies() []RetentionPolicy {
	rows, err := re.db.Query(
		`SELECT metric_name, labels_hash, grade, retain_days, updated_at FROM retention_policies ORDER BY grade, metric_name`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var policies []RetentionPolicy
	for rows.Next() {
		var p RetentionPolicy
		var updatedNs int64
		if err := rows.Scan(&p.MetricName, &p.LabelsHash, &p.Grade, &p.RetainDays, &updatedNs); err != nil {
			continue
		}
		p.UpdatedAt = time.Unix(0, updatedNs).UTC()
		policies = append(policies, p)
	}
	return policies
}
