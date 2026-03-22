package otel

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestCollectorMetadata(t *testing.T) {
	c := New()
	if c.ID() != "ai-otel" {
		t.Errorf("expected ID ai-otel, got %s", c.ID())
	}
	if c.Version() != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %s", c.Version())
	}
	if len(c.OutputSchemas()) == 0 {
		t.Error("expected at least one output schema")
	}
}

func TestAutoDetectNoPrometheus(t *testing.T) {
	c := New()
	c.prometheusURL = "http://localhost:59999" // unlikely to be running
	ctx := context.Background()

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	// Without env vars or Prometheus, should not detect
	_ = result
}

func TestAutoDetectWithEnvVar(t *testing.T) {
	c := New()
	ctx := context.Background()
	t.Setenv("OTEL_SERVICE_NAME", "my-ai-service")

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true with OTEL_SERVICE_NAME set")
	}
}

func TestAutoDetectWithMockPrometheus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/-/healthy" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := New()
	c.prometheusURL = srv.URL
	ctx := context.Background()

	result, err := c.AutoDetect(ctx)
	if err != nil {
		t.Fatalf("AutoDetect error: %v", err)
	}
	if !result.Detected {
		t.Error("expected Detected=true with mock Prometheus running")
	}
	if result.Details["prometheus_url"] != srv.URL {
		t.Errorf("expected prometheus_url=%s, got %v", srv.URL, result.Details["prometheus_url"])
	}
}

func TestCollectWithMockPrometheus(t *testing.T) {
	// Build minimal Prometheus instant query response
	makePromResponse := func(val float64) []byte {
		resp := map[string]interface{}{
			"status": "success",
			"data": map[string]interface{}{
				"resultType": "vector",
				"result": []interface{}{
					map[string]interface{}{
						"metric": map[string]interface{}{},
						"value":  []interface{}{float64(1711027200), "1.23"},
					},
				},
			},
		}
		b, _ := json.Marshal(resp)
		return b
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/-/healthy":
			w.WriteHeader(http.StatusOK)
		case "/api/v1/query":
			w.Header().Set("Content-Type", "application/json")
			w.Write(makePromResponse(1.23))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := New()
	c.prometheusURL = srv.URL
	ctx := context.Background()

	result, err := c.Collect(ctx, models.CollectConfig{
		ProjectID: "test",
		Hostname:  "localhost",
	})
	if err != nil {
		t.Fatalf("Collect error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Status == models.StatusFailed {
		t.Errorf("unexpected FAILED status: errors=%v", result.Errors)
	}
	if len(result.Items) == 0 {
		t.Error("expected at least one item")
	}

	item := result.Items[0]
	data := item.Data.(map[string]interface{})
	if data["prometheus_url"] != srv.URL {
		t.Errorf("unexpected prometheus_url: %v", data["prometheus_url"])
	}
	if data["queries_total"].(int) != len(aiMetricQueries) {
		t.Errorf("expected %d total queries, got %v", len(aiMetricQueries), data["queries_total"])
	}
}

func TestCollectNoPrometheus(t *testing.T) {
	c := New()
	c.prometheusURL = "http://localhost:59999" // not running
	ctx := context.Background()

	result, err := c.Collect(ctx, models.CollectConfig{Hostname: "localhost"})
	if err != nil {
		t.Fatalf("Collect error: %v", err)
	}
	// Should fail gracefully with FAILED status
	if result.Status != models.StatusFailed {
		t.Errorf("expected FAILED status when Prometheus unreachable, got %s", result.Status)
	}
	if len(result.Errors) == 0 {
		t.Error("expected at least one error")
	}
}

func TestQueryInstantParseError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/-/healthy" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"error","error":"unknown metric"}`))
	}))
	defer srv.Close()

	c := New()
	c.prometheusURL = srv.URL
	ctx := context.Background()

	_, err := c.queryInstant(ctx, "nonexistent_metric")
	if err == nil {
		t.Error("expected error for Prometheus error response")
	}
}

func TestGetEnvOrDefault(t *testing.T) {
	t.Setenv("TEST_OTel_KEY", "custom-value")
	if got := getEnvOrDefault("TEST_OTel_KEY", "default"); got != "custom-value" {
		t.Errorf("expected custom-value, got %s", got)
	}
	if got := getEnvOrDefault("TEST_NONEXISTENT_KEY_XYZ", "fallback"); got != "fallback" {
		t.Errorf("expected fallback, got %s", got)
	}
}

func TestAIMetricQueriesNotEmpty(t *testing.T) {
	if len(aiMetricQueries) == 0 {
		t.Error("aiMetricQueries should not be empty")
	}
	for _, q := range aiMetricQueries {
		if q.Name == "" {
			t.Error("metric query should have a Name")
		}
		if q.PromQL == "" {
			t.Errorf("metric query %s should have PromQL", q.Name)
		}
		if len(q.AffectedItems) == 0 {
			t.Errorf("metric query %s should have AffectedItems", q.Name)
		}
	}
}
