package otel

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// metricsQuery defines a Prometheus metric to snapshot for AI diagnostics.
type metricsQuery struct {
	Name      string // collector-friendly name
	PromQL    string // Prometheus instant query expression
	AffectedItems []string
}

// aiMetricQueries are the AI-specific OTel/Prometheus metrics to snapshot.
var aiMetricQueries = []metricsQuery{
	{Name: "llm_ttft_p95", PromQL: `histogram_quantile(0.95, rate(llm_time_to_first_token_bucket[5m]))`, AffectedItems: []string{"ITEM0207"}},
	{Name: "llm_tps_p50", PromQL: `histogram_quantile(0.50, rate(llm_tokens_per_second_bucket[5m]))`, AffectedItems: []string{"ITEM0207"}},
	{Name: "gpu_utilization", PromQL: `avg(gpu_utilization)`, AffectedItems: []string{"ITEM0220"}},
	{Name: "gpu_memory_used_bytes", PromQL: `sum(gpu_memory_used_bytes)`, AffectedItems: []string{"ITEM0220"}},
	{Name: "gpu_temperature_celsius", PromQL: `max(gpu_temperature_celsius)`, AffectedItems: []string{"ITEM0228"}},
	{Name: "gpu_power_draw_watts", PromQL: `sum(gpu_power_draw_watts)`, AffectedItems: []string{"ITEM0228"}},
	{Name: "vectordb_search_duration_p99", PromQL: `histogram_quantile(0.99, rate(vectordb_search_duration_seconds_bucket[5m]))`, AffectedItems: []string{"ITEM0206"}},
	{Name: "guardrail_validation_duration_p99", PromQL: `histogram_quantile(0.99, rate(guardrail_validation_duration_seconds_bucket[5m]))`, AffectedItems: []string{"ITEM0229"}},
	{Name: "guardrail_block_total", PromQL: `increase(guardrail_block_total[5m])`, AffectedItems: []string{"ITEM0229"}},
	{Name: "external_api_error_total", PromQL: `increase(external_api_error_total[5m])`, AffectedItems: []string{"ITEM0202"}},
	{Name: "vectordb_cache_hit_total", PromQL: `increase(vectordb_cache_hit_total[5m])`, AffectedItems: []string{"ITEM0211"}},
}

// Collector queries an existing Prometheus or OTel Collector endpoint
// to snapshot AI-related metrics for diagnostic evidence.
type Collector struct {
	httpClient     *http.Client
	prometheusURL  string
	otelHTTPURL    string
}

func New() *Collector {
	return &Collector{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		prometheusURL: getEnvOrDefault("PROMETHEUS_URL", "http://localhost:9090"),
		otelHTTPURL:   getEnvOrDefault("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"),
	}
}

func (c *Collector) ID() string      { return "ai-otel" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "net", Target: c.prometheusURL, Description: "access Prometheus query API"},
		{Type: "net", Target: c.otelHTTPURL, Description: "access OTel Collector OTLP HTTP endpoint"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"ai.otel_metrics_snapshot.v1",
	}
}

// AutoDetect returns true if Prometheus or OTel Collector is reachable.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	details := map[string]string{}

	// Check Prometheus
	if c.pingPrometheus(ctx) {
		details["prometheus_url"] = c.prometheusURL
	}

	// Check OTel Collector health endpoint
	otelHealthURL := strings.TrimRight(c.otelHTTPURL, "/") + "/v1/metrics"
	if c.pingHTTP(ctx, otelHealthURL) {
		details["otel_http_url"] = c.otelHTTPURL
	}

	// Also check if env vars suggest OTel is configured
	otlpEnvs := []string{"OTEL_EXPORTER_OTLP_ENDPOINT", "PROMETHEUS_URL", "OTEL_SERVICE_NAME"}
	for _, env := range otlpEnvs {
		if val := os.Getenv(env); val != "" {
			details["env_"+strings.ToLower(env)] = val
		}
	}

	if len(details) == 0 {
		return models.DetectResult{Detected: false}, nil
	}
	return models.DetectResult{Detected: true, Details: details}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	var errs []models.CollectError

	if item, err := c.collectMetricsSnapshot(ctx); err == nil {
		result.Items = append(result.Items, *item)
	} else {
		errs = append(errs, models.CollectError{
			Code:       models.ErrConnectionRefused,
			Message:    fmt.Sprintf("OTel metrics snapshot failed: %v", err),
			Required:   "net:" + c.prometheusURL,
			Suggestion: "Ensure Prometheus is running and PROMETHEUS_URL is set correctly",
		})
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(result.Items) == 0 {
		result.Status = models.StatusFailed
	}

	return result, nil
}

// MetricSnapshot holds a single metric value from Prometheus.
type MetricSnapshot struct {
	Name          string   `json:"name"`
	Value         float64  `json:"value"`
	Timestamp     int64    `json:"timestamp"`
	AffectedItems []string `json:"affected_items,omitempty"`
	Error         string   `json:"error,omitempty"`
}

func (c *Collector) collectMetricsSnapshot(ctx context.Context) (*models.CollectedItem, error) {
	if !c.pingPrometheus(ctx) {
		return nil, fmt.Errorf("Prometheus at %s is not reachable", c.prometheusURL)
	}

	snapshots := []MetricSnapshot{}
	successCount := 0

	for _, q := range aiMetricQueries {
		snap := MetricSnapshot{
			Name:          q.Name,
			AffectedItems: q.AffectedItems,
			Timestamp:     time.Now().Unix(),
		}

		val, err := c.queryInstant(ctx, q.PromQL)
		if err != nil {
			snap.Error = fmt.Sprintf("query failed: %v", err)
		} else {
			snap.Value = val
			successCount++
		}
		snapshots = append(snapshots, snap)
	}

	if successCount == 0 {
		return nil, fmt.Errorf("all %d metric queries failed", len(aiMetricQueries))
	}

	return &models.CollectedItem{
		SchemaName:    "ai.otel_metrics_snapshot",
		SchemaVersion: "1.0.0",
		MetricType:    "ai_otel_snapshot",
		Category:      "ai",
		Data: map[string]interface{}{
			"prometheus_url":  c.prometheusURL,
			"queries_total":   len(aiMetricQueries),
			"queries_success": successCount,
			"snapshot_time":   time.Now().UTC().Format(time.RFC3339),
			"metrics":         snapshots,
		},
	}, nil
}

// queryInstant executes a Prometheus instant query and returns the first scalar/vector value.
func (c *Collector) queryInstant(ctx context.Context, expr string) (float64, error) {
	queryURL := fmt.Sprintf("%s/api/v1/query", strings.TrimRight(c.prometheusURL, "/"))

	params := url.Values{}
	params.Set("query", expr)
	params.Set("time", fmt.Sprintf("%d", time.Now().Unix()))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, queryURL+"?"+params.Encode(), nil)
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("prometheus returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return 0, fmt.Errorf("read body: %w", err)
	}

	// Prometheus response: {"status":"success","data":{"resultType":"vector","result":[{"metric":{},"value":[ts,"val"]}]}}
	var promResp struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Value []json.RawMessage `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &promResp); err != nil {
		return 0, fmt.Errorf("parse response: %w", err)
	}

	if promResp.Status != "success" {
		return 0, fmt.Errorf("prometheus status: %s", promResp.Status)
	}

	if len(promResp.Data.Result) == 0 {
		return 0, fmt.Errorf("no data returned for query")
	}

	values := promResp.Data.Result[0].Value
	if len(values) < 2 {
		return 0, fmt.Errorf("unexpected value format")
	}

	var valStr string
	if err := json.Unmarshal(values[1], &valStr); err != nil {
		return 0, fmt.Errorf("parse value: %w", err)
	}

	var result float64
	_, err = fmt.Sscanf(valStr, "%f", &result)
	return result, err
}

// pingPrometheus checks if Prometheus is reachable via /-/healthy.
func (c *Collector) pingPrometheus(ctx context.Context) bool {
	healthURL := strings.TrimRight(c.prometheusURL, "/") + "/-/healthy"
	return c.pingHTTP(ctx, healthURL)
}

func (c *Collector) pingHTTP(ctx context.Context, rawURL string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return false
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
