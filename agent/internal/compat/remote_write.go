// Package compat provides external integration endpoints for the AITOP
// Collection Server (WS-1.5).
//
//   - S5-1: Prometheus Remote Write receiver  (POST /api/v1/prom/write)
//   - S5-2: OTLP Export to external systems   (POST /api/v1/otlp/export)
//   - S5-3: Self-monitoring /metrics endpoint  (GET  /metrics)
package compat

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/metricstore"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// ── S5-1: Prometheus Remote Write Receiver ───────────────────────────────────
//
// Accepts metrics from external Prometheus instances via the remote_write
// protocol.  Supports two formats:
//
//  1. Prometheus text exposition format (text/plain) — simple and lightweight
//  2. JSON array of {name, labels, value, timestamp} — easy integration
//
// Both formats are ingested into the AITOP Metric Engine (metricstore).
//
// Endpoints:
//   POST /api/v1/prom/write     — Prometheus remote write receiver
//   POST /api/v1/prom/push      — Alias (Pushgateway-style)

// RemoteWriteHandler receives Prometheus-compatible metric data.
type RemoteWriteHandler struct {
	metricStore *metricstore.Store
	logger      *slog.Logger
}

// NewRemoteWriteHandler creates a remote write receiver.
func NewRemoteWriteHandler(ms *metricstore.Store, logger *slog.Logger) *RemoteWriteHandler {
	return &RemoteWriteHandler{metricStore: ms, logger: logger}
}

// Register attaches routes to mux.
func (h *RemoteWriteHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/prom/write", h.handleWrite)
	mux.HandleFunc("POST /api/v1/prom/push", h.handleWrite) // pushgateway alias
}

func (h *RemoteWriteHandler) handleWrite(w http.ResponseWriter, r *http.Request) {
	// Decompress if gzip.
	var reader io.Reader = r.Body
	if r.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "gzip decode error: "+err.Error())
			return
		}
		defer gz.Close()
		reader = gz
	}

	body, err := io.ReadAll(io.LimitReader(reader, 4*1024*1024)) // 4 MiB max
	if err != nil {
		writeErr(w, http.StatusBadRequest, "read body: "+err.Error())
		return
	}

	ct := r.Header.Get("Content-Type")

	var points []*otlp.MetricPoint

	switch {
	case strings.Contains(ct, "application/json"):
		points, err = parseJSONMetrics(body)
	case strings.Contains(ct, "text/plain"), ct == "":
		points, err = parseTextExposition(body)
	default:
		points, err = parseTextExposition(body) // default: try text format
	}

	if err != nil {
		writeErr(w, http.StatusBadRequest, "parse error: "+err.Error())
		return
	}

	if len(points) == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{"accepted": 0})
		return
	}

	h.metricStore.Ingest(points)
	h.logger.Debug("prom remote write ingested", "points", len(points))

	writeJSON(w, http.StatusOK, map[string]interface{}{"accepted": len(points)})
}

// ── JSON format parser ───────────────────────────────────────────────────────
//
// Accepts: [{"name":"cpu_usage", "labels":{"host":"a"}, "value":0.95, "timestamp":1700000000000}]

type jsonMetric struct {
	Name      string            `json:"name"`
	Labels    map[string]string `json:"labels"`
	Value     float64           `json:"value"`
	Timestamp int64             `json:"timestamp"` // Unix ms or s; 0 = now
}

func parseJSONMetrics(data []byte) ([]*otlp.MetricPoint, error) {
	var metrics []jsonMetric
	if err := json.Unmarshal(data, &metrics); err != nil {
		return nil, err
	}

	now := time.Now()
	points := make([]*otlp.MetricPoint, 0, len(metrics))
	for _, m := range metrics {
		ts := now
		if m.Timestamp > 0 {
			if m.Timestamp > 1e15 { // nanoseconds
				ts = time.Unix(0, m.Timestamp)
			} else if m.Timestamp > 1e12 { // milliseconds
				ts = time.UnixMilli(m.Timestamp)
			} else { // seconds
				ts = time.Unix(m.Timestamp, 0)
			}
		}

		attrs := make([]otlp.KeyValue, 0, len(m.Labels))
		for k, v := range m.Labels {
			attrs = append(attrs, otlp.KeyValue{Key: k, Value: v})
		}

		points = append(points, &otlp.MetricPoint{
			Name:       m.Name,
			Type:       otlp.MetricTypeGauge,
			TimeNano:   uint64(ts.UnixNano()),
			AsDouble:   m.Value,
			IsDouble:   true,
			Attributes: attrs,
			ReceivedAt: now,
		})
	}
	return points, nil
}

// ── Prometheus text exposition format parser ──────────────────────────────────
//
// Parses lines like:
//   http_requests_total{method="GET",code="200"} 1027 1395066363000
//   cpu_usage 0.95

func parseTextExposition(data []byte) ([]*otlp.MetricPoint, error) {
	now := time.Now()
	var points []*otlp.MetricPoint

	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue // skip comments and empty lines
		}

		mp := parseTextLine(line, now)
		if mp != nil {
			points = append(points, mp)
		}
	}
	return points, scanner.Err()
}

func parseTextLine(line string, now time.Time) *otlp.MetricPoint {
	// Format: metric_name{label1="val1",label2="val2"} value [timestamp_ms]
	var name string
	var labelsStr string
	var rest string

	if idx := strings.IndexByte(line, '{'); idx >= 0 {
		name = line[:idx]
		closeIdx := strings.IndexByte(line[idx:], '}')
		if closeIdx < 0 {
			return nil
		}
		labelsStr = line[idx+1 : idx+closeIdx]
		rest = strings.TrimSpace(line[idx+closeIdx+1:])
	} else {
		parts := strings.Fields(line)
		if len(parts) < 2 {
			return nil
		}
		name = parts[0]
		rest = strings.Join(parts[1:], " ")
	}

	// Parse value and optional timestamp.
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		return nil
	}
	val, err := strconv.ParseFloat(fields[0], 64)
	if err != nil || math.IsNaN(val) {
		return nil
	}

	ts := now
	if len(fields) >= 2 {
		if ms, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
			ts = time.UnixMilli(ms)
		}
	}

	// Parse labels.
	var attrs []otlp.KeyValue
	if labelsStr != "" {
		for _, pair := range splitLabels(labelsStr) {
			eqIdx := strings.IndexByte(pair, '=')
			if eqIdx <= 0 {
				continue
			}
			k := strings.TrimSpace(pair[:eqIdx])
			v := strings.Trim(strings.TrimSpace(pair[eqIdx+1:]), `"`)
			attrs = append(attrs, otlp.KeyValue{Key: k, Value: v})
		}
	}

	return &otlp.MetricPoint{
		Name:       name,
		Type:       otlp.MetricTypeGauge,
		TimeNano:   uint64(ts.UnixNano()),
		AsDouble:   val,
		IsDouble:   true,
		Attributes: attrs,
		ReceivedAt: now,
	}
}

// splitLabels splits "key1=\"val1\",key2=\"val2\"" respecting quoted commas.
func splitLabels(s string) []string {
	var parts []string
	inQuote := false
	start := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			inQuote = !inQuote
		case ',':
			if !inQuote {
				parts = append(parts, s[start:i])
				start = i + 1
			}
		}
	}
	if start < len(s) {
		parts = append(parts, s[start:])
	}
	return parts
}
