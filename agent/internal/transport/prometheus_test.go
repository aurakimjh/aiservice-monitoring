package transport

import (
	"compress/gzip"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func newPromLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestFormatTextProto_Basic(t *testing.T) {
	metrics := []PrometheusMetric{
		{Name: "aitop_cpu_percent", Labels: map[string]string{"host": "h1"}, Value: 42.5},
		{Name: "aitop_mem_mb", Value: 1024},
	}
	out := string(formatTextProto(metrics))
	if !strings.Contains(out, `aitop_cpu_percent{host="h1"} 42.5`) {
		t.Errorf("unexpected output:\n%s", out)
	}
	if !strings.Contains(out, "aitop_mem_mb 1024") {
		t.Errorf("unexpected output:\n%s", out)
	}
}

func TestFormatTextProto_Timestamp(t *testing.T) {
	ts := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	// 2026-01-01 00:00:00 UTC = Unix 1767225600 s = 1767225600000 ms
	wantMs := strconv.FormatInt(ts.UnixMilli(), 10)
	metrics := []PrometheusMetric{
		{Name: "m", Value: 1, Timestamp: ts},
	}
	out := string(formatTextProto(metrics))
	if !strings.Contains(out, wantMs) {
		t.Errorf("expected unix milli timestamp %s, got: %s", wantMs, out)
	}
}

func TestPrometheusWriter_Write(t *testing.T) {
	var receivedBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Encoding") != "gzip" {
			t.Errorf("expected gzip encoding")
		}
		gr, err := gzip.NewReader(r.Body)
		if err != nil {
			t.Errorf("gzip reader: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer gr.Close()
		receivedBody, _ = io.ReadAll(gr)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	writer := NewPrometheusWriter(srv.URL, newPromLogger())
	metrics := []PrometheusMetric{
		{Name: "aitop_cpu_percent", Labels: map[string]string{"agent_id": "a1"}, Value: 55.0},
	}
	if err := writer.Write(context.Background(), metrics); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if !strings.Contains(string(receivedBody), "aitop_cpu_percent") {
		t.Errorf("server did not receive expected metric body:\n%s", receivedBody)
	}
}

func TestPrometheusWriter_Empty(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	writer := NewPrometheusWriter(srv.URL, newPromLogger())
	if err := writer.Write(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	if calls != 0 {
		t.Fatal("expected no HTTP call for empty metrics")
	}
}

func TestPrometheusWriter_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal", http.StatusInternalServerError)
	}))
	defer srv.Close()

	writer := NewPrometheusWriter(srv.URL, newPromLogger())
	err := writer.Write(context.Background(), []PrometheusMetric{{Name: "m", Value: 1}})
	if err == nil {
		t.Fatal("expected error on 500 response")
	}
}

func TestCollectResultToMetrics(t *testing.T) {
	data := []byte(`{
		"collector_id": "os",
		"items": [
			{
				"schema_name": "os.cpu_metrics.v1",
				"cpu_percent": 23.5,
				"load_avg_1m": 1.2,
				"hostname": "myhost"
			}
		]
	}`)
	metrics := CollectResultToMetrics("agent-1", "myhost", "os", data)
	if len(metrics) == 0 {
		t.Fatal("expected metrics, got none")
	}
	found := false
	for _, m := range metrics {
		if m.Name == "aitop_os_cpu_percent" && m.Value == 23.5 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected aitop_os_cpu_percent=23.5 in metrics: %+v", metrics)
	}
}

func TestSanitizeMetricName(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"cpu_percent", "cpu_percent"},
		{"cpu-percent", "cpu_percent"},
		{"cpu.percent", "cpu_percent"},
		{"cpu percent", "cpu_percent"},
	}
	for _, c := range cases {
		got := sanitizeMetricName(c.in)
		if got != c.want {
			t.Errorf("sanitizeMetricName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
