package framework

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// AirflowDAGRun represents a single DAG run from the Airflow REST API.
type AirflowDAGRun struct {
	DAGRunID        string    `json:"dag_run_id"`
	DAGID           string    `json:"dag_id"`
	State           string    `json:"state"` // success, failed, running, queued
	ExecutionDate   time.Time `json:"execution_date"`
	StartDate       time.Time `json:"start_date"`
	EndDate         time.Time `json:"end_date,omitempty"`
	ExternalTrigger bool      `json:"external_trigger"`
	Conf            string    `json:"conf,omitempty"`
}

// airflowDAGRunsResponse is the Airflow API response for listing DAG runs.
type airflowDAGRunsResponse struct {
	DAGRuns    []airflowDAGRunJSON `json:"dag_runs"`
	TotalCount int                 `json:"total_entries"`
}

type airflowDAGRunJSON struct {
	DAGRunID        string `json:"dag_run_id"`
	DAGID           string `json:"dag_id"`
	State           string `json:"state"`
	ExecutionDate   string `json:"execution_date"`
	StartDate       string `json:"start_date"`
	EndDate         string `json:"end_date"`
	ExternalTrigger bool   `json:"external_trigger"`
}

// AirflowCollector queries the Airflow REST API for DAG run information.
type AirflowCollector struct {
	baseURL string
	token   string
	client  *http.Client
	logger  *slog.Logger
}

// NewAirflowCollector creates a new Airflow collector.
func NewAirflowCollector(baseURL, token string, logger *slog.Logger) *AirflowCollector {
	return &AirflowCollector{
		baseURL: baseURL,
		token:   token,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		logger: logger.With("framework", "airflow"),
	}
}

// DetectAirflow checks if the Airflow webserver is accessible.
func (c *AirflowCollector) DetectAirflow(ctx context.Context) (bool, error) {
	if c.baseURL == "" {
		return false, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v1/health", nil)
	if err != nil {
		return false, err
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		c.logger.Debug("airflow health check failed", "error", err)
		return false, nil
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK, nil
}

// CollectDAGRuns queries the Airflow REST API for DAG runs since the given time.
func (c *AirflowCollector) CollectDAGRuns(ctx context.Context, dagID string, since time.Time) ([]AirflowDAGRun, error) {
	if c.baseURL == "" {
		return nil, fmt.Errorf("airflow base URL not configured")
	}

	url := fmt.Sprintf("%s/api/v1/dags/%s/dagRuns?order_by=-start_date&limit=100", c.baseURL, dagID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("airflow API request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("airflow API returned status %d", resp.StatusCode)
	}

	var apiResp airflowDAGRunsResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode airflow response: %w", err)
	}

	var runs []AirflowDAGRun
	for _, r := range apiResp.DAGRuns {
		execDate, _ := time.Parse(time.RFC3339, r.ExecutionDate)
		startDate, _ := time.Parse(time.RFC3339, r.StartDate)
		endDate, _ := time.Parse(time.RFC3339, r.EndDate)

		if startDate.Before(since) {
			continue
		}

		runs = append(runs, AirflowDAGRun{
			DAGRunID:        r.DAGRunID,
			DAGID:           r.DAGID,
			State:           r.State,
			ExecutionDate:   execDate,
			StartDate:       startDate,
			EndDate:         endDate,
			ExternalTrigger: r.ExternalTrigger,
		})
	}

	return runs, nil
}

// GenerateDemoAirflowDAGRuns returns realistic demo Airflow DAG runs
// for the Collection Server MVP.
func GenerateDemoAirflowDAGRuns() []AirflowDAGRun {
	now := time.Now().UTC()
	return []AirflowDAGRun{
		{
			DAGRunID:      "scheduled__2026-03-25T04:00:00+00:00",
			DAGID:         "data-warehouse-etl",
			State:         "success",
			ExecutionDate: now.Add(-20 * time.Hour),
			StartDate:     now.Add(-20 * time.Hour),
			EndDate:       now.Add(-19*time.Hour - 15*time.Minute),
		},
		{
			DAGRunID:      "scheduled__2026-03-24T04:00:00+00:00",
			DAGID:         "data-warehouse-etl",
			State:         "success",
			ExecutionDate: now.Add(-44 * time.Hour),
			StartDate:     now.Add(-44 * time.Hour),
			EndDate:       now.Add(-43*time.Hour - 20*time.Minute),
		},
		{
			DAGRunID:      "scheduled__2026-03-23T04:00:00+00:00",
			DAGID:         "data-warehouse-etl",
			State:         "failed",
			ExecutionDate: now.Add(-68 * time.Hour),
			StartDate:     now.Add(-68 * time.Hour),
			EndDate:       now.Add(-68*time.Hour + 3*time.Minute),
		},
		{
			DAGRunID:      "scheduled__2026-03-20T00:00:00+00:00",
			DAGID:         "ml-model-retrain",
			State:         "success",
			ExecutionDate: now.Add(-5 * 24 * time.Hour),
			StartDate:     now.Add(-5 * 24 * time.Hour),
			EndDate:       now.Add(-5*24*time.Hour + 2*time.Hour + 30*time.Minute),
		},
		{
			DAGRunID:      "scheduled__2026-03-13T00:00:00+00:00",
			DAGID:         "ml-model-retrain",
			State:         "success",
			ExecutionDate: now.Add(-12 * 24 * time.Hour),
			StartDate:     now.Add(-12 * 24 * time.Hour),
			EndDate:       now.Add(-12*24*time.Hour + 2*time.Hour + 45*time.Minute),
		},
	}
}
