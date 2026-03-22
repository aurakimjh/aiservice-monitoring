package transport

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// PrometheusMetric is a single time-series sample.
type PrometheusMetric struct {
	// Name is the metric name (becomes the __name__ label).
	Name string
	// Labels are extra key=value pairs attached to this metric.
	Labels map[string]string
	// Value is the sample value.
	Value float64
	// Timestamp overrides the send time; zero means "use current time".
	Timestamp time.Time
}

// PrometheusWriter sends metrics to a Prometheus-compatible remote_write endpoint
// using gzip-compressed Prometheus text exposition format.
//
// Most Prometheus-compatible receivers (VictoriaMetrics, Grafana Mimir, Thanos)
// accept text/plain in addition to the binary protobuf format, which removes
// the need for the heavy prometheus/prometheus dependency in the MVP.
type PrometheusWriter struct {
	remoteWriteURL string
	httpClient     *http.Client
	logger         *slog.Logger
}

// NewPrometheusWriter creates a writer targeting the given remote_write URL.
func NewPrometheusWriter(remoteWriteURL string, logger *slog.Logger) *PrometheusWriter {
	return &PrometheusWriter{
		remoteWriteURL: remoteWriteURL,
		httpClient:     &http.Client{Timeout: 15 * time.Second},
		logger:         logger,
	}
}

// Write sends a batch of metrics to the remote_write endpoint.
func (w *PrometheusWriter) Write(ctx context.Context, metrics []PrometheusMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	payload := formatTextProto(metrics)

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(payload); err != nil {
		return fmt.Errorf("prometheus: gzip: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("prometheus: gzip close: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.remoteWriteURL, &buf)
	if err != nil {
		return fmt.Errorf("prometheus: build request: %w", err)
	}
	req.Header.Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	req.Header.Set("Content-Encoding", "gzip")

	resp, err := w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("prometheus: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("prometheus: server returned %d", resp.StatusCode)
	}

	w.logger.Info("prometheus metrics written", "count", len(metrics), "status", resp.StatusCode)
	return nil
}

// formatTextProto serialises metrics as Prometheus text exposition format.
//
// Example line:
//
//	aitop_cpu_percent{agent_id="a1",hostname="h1"} 23.5 1700000000000
func formatTextProto(metrics []PrometheusMetric) []byte {
	var buf bytes.Buffer
	for _, m := range metrics {
		buf.WriteString(m.Name)
		if len(m.Labels) > 0 {
			buf.WriteByte('{')
			first := true
			for k, v := range m.Labels {
				if !first {
					buf.WriteByte(',')
				}
				buf.WriteString(k)
				buf.WriteString(`="`)
				buf.WriteString(strings.ReplaceAll(v, `"`, `\"`))
				buf.WriteByte('"')
				first = false
			}
			buf.WriteByte('}')
		}
		buf.WriteByte(' ')
		buf.WriteString(strconv.FormatFloat(m.Value, 'f', -1, 64))
		if !m.Timestamp.IsZero() {
			buf.WriteByte(' ')
			buf.WriteString(strconv.FormatInt(m.Timestamp.UnixMilli(), 10))
		}
		buf.WriteByte('\n')
	}
	return buf.Bytes()
}

// CollectResultToMetrics converts a serialised CollectResult JSON payload into
// a flat list of Prometheus metrics.  Only numeric leaf values inside the
// "items" array are emitted with the prefix "aitop_{collectorID}_".
func CollectResultToMetrics(agentID, hostname, collectorID string, data []byte) []PrometheusMetric {
	var payload struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := json.Unmarshal(data, &payload); err != nil || len(payload.Items) == 0 {
		return nil
	}

	baseLabels := map[string]string{
		"agent_id":     agentID,
		"hostname":     hostname,
		"collector_id": collectorID,
	}

	var out []PrometheusMetric
	for _, item := range payload.Items {
		schema, _ := item["schema_name"].(string)
		for k, v := range item {
			f, ok := toFloat64(v)
			if !ok {
				continue
			}
			name := sanitizeMetricName("aitop_" + collectorID + "_" + k)
			lbl := make(map[string]string, len(baseLabels)+1)
			for kk, vv := range baseLabels {
				lbl[kk] = vv
			}
			if schema != "" {
				lbl["schema"] = schema
			}
			out = append(out, PrometheusMetric{Name: name, Labels: lbl, Value: f})
		}
	}
	return out
}

// toFloat64 coerces JSON-decoded numeric values to float64.
func toFloat64(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return 0, false
}

// sanitizeMetricName replaces characters not allowed in Prometheus metric names with underscores.
func sanitizeMetricName(s string) string {
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' {
			b = append(b, c)
		} else {
			b = append(b, '_')
		}
	}
	return string(b)
}
