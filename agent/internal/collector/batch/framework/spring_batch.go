// Package framework provides integrations with specific batch frameworks
// such as Spring Batch and Apache Airflow.
package framework

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
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

// SpringBatchCollector queries Spring Batch job execution records via the
// application's Actuator HTTP endpoint or direct database connection.
//
// Detection priority:
//   1. HTTP Actuator (Spring Boot application exposes /actuator/health)
//   2. Direct DB (requires JDBC-compatible URL — future enhancement)
type SpringBatchCollector struct {
	dbURL       string // jdbc: or postgres: URL (reserved for future DB driver)
	actuatorURL string // http://host:port/actuator (preferred)
	httpClient  *http.Client
	logger      *slog.Logger
}

// NewSpringBatchCollector creates a new Spring Batch collector.
// If dbURL starts with "http", it is treated as an Actuator base URL.
func NewSpringBatchCollector(dbURL string, logger *slog.Logger) *SpringBatchCollector {
	c := &SpringBatchCollector{
		logger: logger.With("framework", "spring-batch"),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
	if strings.HasPrefix(dbURL, "http") {
		c.actuatorURL = strings.TrimSuffix(dbURL, "/")
	} else {
		c.dbURL = dbURL
	}
	return c
}

// DetectSpringBatch checks if the Spring Boot application has batch support
// by probing the Actuator health endpoint for a "db" component.
func (c *SpringBatchCollector) DetectSpringBatch(ctx context.Context) (bool, error) {
	// Actuator-based detection
	if c.actuatorURL != "" {
		return c.detectViaActuator(ctx)
	}

	// DB URL provided but no HTTP driver — log and skip
	if c.dbURL != "" {
		c.logger.Debug("spring batch DB-based detection requires Actuator URL",
			"hint", "configure actuator_url=http://app:8080/actuator instead of direct DB URL")
		return false, nil
	}

	return false, nil
}

// detectViaActuator probes the /actuator/health endpoint for batch indicators.
func (c *SpringBatchCollector) detectViaActuator(ctx context.Context) (bool, error) {
	url := c.actuatorURL + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Debug("actuator health probe failed", "url", url, "error", err)
		return false, nil // not an error — app may not be running
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return false, err
	}

	// Check if response contains batch-related components
	bodyStr := strings.ToLower(string(body))
	hasBatch := strings.Contains(bodyStr, "batch") || strings.Contains(bodyStr, "spring.batch")
	hasDB := strings.Contains(bodyStr, "\"db\"") || strings.Contains(bodyStr, "datasource")

	if hasBatch || hasDB {
		c.logger.Info("spring batch detected via actuator", "url", url)
		return true, nil
	}

	return false, nil
}

// CollectExecutions retrieves recent job execution records from the Spring Boot
// application via the Actuator batch endpoint.
func (c *SpringBatchCollector) CollectExecutions(ctx context.Context, since time.Time) ([]SpringBatchExecution, error) {
	if c.actuatorURL != "" {
		return c.collectViaActuator(ctx, since)
	}

	if c.dbURL == "" {
		return nil, fmt.Errorf("spring batch URL not configured (set actuator_url or db_url)")
	}

	// Direct DB path — reserved for future when a DB driver is added.
	// SQL reference:
	//   SELECT bje.JOB_EXECUTION_ID, bji.JOB_NAME, bje.STATUS,
	//          bje.START_TIME, bje.END_TIME, bje.EXIT_CODE, bje.EXIT_MESSAGE
	//   FROM BATCH_JOB_EXECUTION bje
	//   JOIN BATCH_JOB_INSTANCE bji ON bje.JOB_INSTANCE_ID = bji.JOB_INSTANCE_ID
	//   WHERE bje.START_TIME >= ?
	//   ORDER BY bje.START_TIME DESC LIMIT 100
	c.logger.Debug("spring batch DB collection requires Actuator URL",
		"since", since.Format(time.RFC3339))
	return nil, nil
}

// actuatorJobExecution represents the JSON response from Spring Batch Actuator.
type actuatorJobExecution struct {
	ID         int64  `json:"id"`
	JobName    string `json:"jobName"`
	Status     string `json:"status"`
	StartTime  string `json:"startTime"`
	EndTime    string `json:"endTime"`
	ExitCode   string `json:"exitCode"`
	ExitDesc   string `json:"exitDescription"`
	CreateTime string `json:"createTime"`
	InstanceID int64  `json:"jobInstanceId"`
}

// collectViaActuator queries the batch job executions via HTTP.
// Tries: /actuator/batch/executions → /batch/executions → /api/batch/executions
func (c *SpringBatchCollector) collectViaActuator(ctx context.Context, since time.Time) ([]SpringBatchExecution, error) {
	paths := []string{
		c.actuatorURL + "/batch/executions",
		strings.TrimSuffix(c.actuatorURL, "/actuator") + "/batch/executions",
		strings.TrimSuffix(c.actuatorURL, "/actuator") + "/api/batch/executions",
	}

	for _, url := range paths {
		execs, err := c.fetchExecutions(ctx, url, since)
		if err == nil && len(execs) > 0 {
			return execs, nil
		}
	}

	c.logger.Debug("no batch executions found via actuator",
		"since", since.Format(time.RFC3339))
	return nil, nil
}

func (c *SpringBatchCollector) fetchExecutions(ctx context.Context, url string, since time.Time) ([]SpringBatchExecution, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1*1024*1024))
	if err != nil {
		return nil, err
	}

	// Try to parse as array of job executions
	var rawExecs []actuatorJobExecution
	if err := json.Unmarshal(body, &rawExecs); err != nil {
		// Try wrapped response: { "executions": [...] } or { "items": [...] }
		var wrapped struct {
			Executions []actuatorJobExecution `json:"executions"`
			Items      []actuatorJobExecution `json:"items"`
		}
		if err2 := json.Unmarshal(body, &wrapped); err2 != nil {
			return nil, fmt.Errorf("failed to parse batch executions: %w", err)
		}
		rawExecs = wrapped.Executions
		if len(rawExecs) == 0 {
			rawExecs = wrapped.Items
		}
	}

	// Convert to SpringBatchExecution
	var results []SpringBatchExecution
	for _, raw := range rawExecs {
		startTime := parseFlexTime(raw.StartTime)
		if !since.IsZero() && startTime.Before(since) {
			continue
		}
		results = append(results, SpringBatchExecution{
			JobExecutionID: raw.ID,
			JobInstanceID:  raw.InstanceID,
			JobName:        raw.JobName,
			Status:         raw.Status,
			StartTime:      startTime,
			EndTime:        parseFlexTime(raw.EndTime),
			ExitCode:       raw.ExitCode,
			ExitMessage:    raw.ExitDesc,
			CreateTime:     parseFlexTime(raw.CreateTime),
			LastUpdated:    parseFlexTime(raw.EndTime),
		})
	}

	return results, nil
}

// parseFlexTime parses time strings in ISO 8601 or common formats.
func parseFlexTime(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	for _, layout := range []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
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
