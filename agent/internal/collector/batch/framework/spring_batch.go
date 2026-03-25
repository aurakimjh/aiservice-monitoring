// Package framework provides integrations with specific batch frameworks
// such as Spring Batch and Apache Airflow.
package framework

import (
	"context"
	"fmt"
	"log/slog"
	"time"
)

// SpringBatchExecution represents a single Spring Batch job execution record.
type SpringBatchExecution struct {
	JobExecutionID int64     `json:"job_execution_id"`
	JobInstanceID  int64     `json:"job_instance_id"`
	JobName        string    `json:"job_name"`
	Status         string    `json:"status"` // COMPLETED, FAILED, STARTED, STOPPED, ABANDONED
	StartTime      time.Time `json:"start_time"`
	EndTime        time.Time `json:"end_time,omitempty"`
	ExitCode       string    `json:"exit_code"`
	ExitMessage    string    `json:"exit_message,omitempty"`
	CreateTime     time.Time `json:"create_time"`
	LastUpdated    time.Time `json:"last_updated"`
}

// SpringBatchCollector queries the Spring Batch metadata tables for
// job execution records.
type SpringBatchCollector struct {
	dbURL  string
	logger *slog.Logger
}

// NewSpringBatchCollector creates a new Spring Batch collector.
func NewSpringBatchCollector(dbURL string, logger *slog.Logger) *SpringBatchCollector {
	return &SpringBatchCollector{
		dbURL:  dbURL,
		logger: logger.With("framework", "spring-batch"),
	}
}

// DetectSpringBatch checks if Spring Batch tables exist in the configured
// database by testing for the BATCH_JOB_EXECUTION table.
func (c *SpringBatchCollector) DetectSpringBatch(ctx context.Context) (bool, error) {
	if c.dbURL == "" {
		return false, nil
	}

	// TODO: implement actual JDBC-style database connection and table check.
	// Queries:
	//   SELECT COUNT(*) FROM information_schema.tables
	//   WHERE table_name = 'BATCH_JOB_EXECUTION'
	//
	// For MVP, return false since we don't have a live DB connection.
	c.logger.Debug("spring batch detection skipped — no DB driver in MVP")
	return false, nil
}

// CollectExecutions queries BATCH_JOB_EXECUTION + BATCH_JOB_INSTANCE tables
// for recent job execution records.
func (c *SpringBatchCollector) CollectExecutions(ctx context.Context, since time.Time) ([]SpringBatchExecution, error) {
	if c.dbURL == "" {
		return nil, fmt.Errorf("spring batch DB URL not configured")
	}

	// TODO: implement actual database queries.
	// SQL:
	//   SELECT
	//     bje.JOB_EXECUTION_ID,
	//     bje.JOB_INSTANCE_ID,
	//     bji.JOB_NAME,
	//     bje.STATUS,
	//     bje.START_TIME,
	//     bje.END_TIME,
	//     bje.EXIT_CODE,
	//     bje.EXIT_MESSAGE,
	//     bje.CREATE_TIME,
	//     bje.LAST_UPDATED
	//   FROM BATCH_JOB_EXECUTION bje
	//   JOIN BATCH_JOB_INSTANCE bji ON bje.JOB_INSTANCE_ID = bji.JOB_INSTANCE_ID
	//   WHERE bje.START_TIME >= ?
	//   ORDER BY bje.START_TIME DESC
	//   LIMIT 100

	c.logger.Debug("spring batch collection skipped — no DB driver in MVP",
		"since", since.Format(time.RFC3339),
	)
	return nil, nil
}

// GenerateDemoExecutions returns realistic demo Spring Batch executions
// for the Collection Server MVP.
func GenerateDemoSpringBatchExecutions() []SpringBatchExecution {
	now := time.Now().UTC()
	return []SpringBatchExecution{
		{
			JobExecutionID: 1001,
			JobInstanceID:  501,
			JobName:        "daily-order-settlement",
			Status:         "COMPLETED",
			StartTime:      now.Add(-22 * time.Hour),
			EndTime:        now.Add(-21*time.Hour - 45*time.Minute),
			ExitCode:       "COMPLETED",
			CreateTime:     now.Add(-22 * time.Hour),
			LastUpdated:    now.Add(-21*time.Hour - 45*time.Minute),
		},
		{
			JobExecutionID: 1002,
			JobInstanceID:  502,
			JobName:        "daily-order-settlement",
			Status:         "FAILED",
			StartTime:      now.Add(-46 * time.Hour),
			EndTime:        now.Add(-46*time.Hour + 5*time.Minute),
			ExitCode:       "FAILED",
			ExitMessage:    "org.springframework.dao.DataAccessException: Connection refused",
			CreateTime:     now.Add(-46 * time.Hour),
			LastUpdated:    now.Add(-46*time.Hour + 5*time.Minute),
		},
		{
			JobExecutionID: 1003,
			JobInstanceID:  503,
			JobName:        "inventory-sync",
			Status:         "COMPLETED",
			StartTime:      now.Add(-30 * time.Minute),
			EndTime:        now.Add(-28 * time.Minute),
			ExitCode:       "COMPLETED",
			CreateTime:     now.Add(-30 * time.Minute),
			LastUpdated:    now.Add(-28 * time.Minute),
		},
	}
}
