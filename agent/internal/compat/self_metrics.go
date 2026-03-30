package compat

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/metricstore"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/tracestore"
)

// ── S5-3: /metrics — Self-monitoring Prometheus-compatible endpoint ───────────
//
// Exposes AITOP Collection Server's own operational metrics in Prometheus
// text exposition format.  This allows external Prometheus/Grafana instances
// to scrape AITOP's health without any special integration.
//
// Endpoint:
//   GET /metrics — Prometheus scrape endpoint

// SelfMetricsHandler serves /metrics in Prometheus text format.
type SelfMetricsHandler struct {
	traceStore  *tracestore.Store
	metricStore *metricstore.Store
	logger      *slog.Logger
	startTime   time.Time

	// Counters updated externally.
	OTLPSpansReceived  atomic.Uint64
	OTLPPointsReceived atomic.Uint64
	HTTPRequestsTotal  atomic.Uint64
}

// NewSelfMetricsHandler creates a self-metrics handler.
func NewSelfMetricsHandler(ts *tracestore.Store, ms *metricstore.Store, logger *slog.Logger) *SelfMetricsHandler {
	return &SelfMetricsHandler{
		traceStore:  ts,
		metricStore: ms,
		logger:      logger,
		startTime:   time.Now(),
	}
}

// Register attaches the /metrics route to mux.
func (h *SelfMetricsHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /metrics", h.handleMetrics)
}

func (h *SelfMetricsHandler) handleMetrics(w http.ResponseWriter, r *http.Request) {
	h.HTTPRequestsTotal.Add(1)

	var b strings.Builder

	// ── Process metrics ──────────────────────────────────────────────────
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	writeMetric(&b, "aitop_process_uptime_seconds", nil,
		time.Since(h.startTime).Seconds())
	writeMetric(&b, "aitop_process_goroutines", nil,
		float64(runtime.NumGoroutine()))
	writeMetric(&b, "aitop_process_memory_alloc_bytes", nil,
		float64(mem.Alloc))
	writeMetric(&b, "aitop_process_memory_sys_bytes", nil,
		float64(mem.Sys))
	writeMetric(&b, "aitop_process_memory_heap_inuse_bytes", nil,
		float64(mem.HeapInuse))
	writeMetric(&b, "aitop_process_gc_pause_total_ns", nil,
		float64(mem.PauseTotalNs))
	writeMetric(&b, "aitop_process_gc_completed_total", nil,
		float64(mem.NumGC))

	// ── OTLP ingestion counters ──────────────────────────────────────────
	writeMetric(&b, "aitop_otlp_spans_received_total", nil,
		float64(h.OTLPSpansReceived.Load()))
	writeMetric(&b, "aitop_otlp_metric_points_received_total", nil,
		float64(h.OTLPPointsReceived.Load()))
	writeMetric(&b, "aitop_http_requests_total", nil,
		float64(h.HTTPRequestsTotal.Load()))

	// ── Trace Engine metrics ─────────────────────────────────────────────
	ringStats := h.traceStore.RingStats()
	writeMetric(&b, "aitop_trace_hot_capacity", nil,
		float64(ringStats.Capacity))
	writeMetric(&b, "aitop_trace_hot_used", nil,
		float64(ringStats.Used))
	writeMetric(&b, "aitop_trace_hot_total_written", nil,
		float64(ringStats.TotalWritten))

	services := h.traceStore.Services()
	writeMetric(&b, "aitop_trace_services_count", nil,
		float64(len(services)))

	// Per-service span/error counts.
	for _, svc := range services {
		labels := map[string]string{"service": svc.Name}
		writeMetric(&b, "aitop_trace_service_span_count", labels,
			float64(svc.SpanCount))
		writeMetric(&b, "aitop_trace_service_error_count", labels,
			float64(svc.ErrorCount))
	}

	// ── Metric Engine metrics ────────────────────────────────────────────
	metricStats := h.metricStore.Stats()
	writeMetric(&b, "aitop_metric_hot_series_count", nil,
		float64(metricStats.HotSeriesCount))
	writeMetric(&b, "aitop_metric_hot_sample_count", nil,
		float64(metricStats.HotSampleCount))
	writeMetric(&b, "aitop_metric_total_ingested", nil,
		float64(metricStats.TotalIngested))
	writeMetric(&b, "aitop_metric_warm_day_files", nil,
		float64(metricStats.WarmDayFiles))
	writeMetric(&b, "aitop_metric_alert_rules_count", nil,
		float64(metricStats.AlertRuleCount))
	writeMetric(&b, "aitop_metric_alert_firing_count", nil,
		float64(metricStats.AlertFiringCount))

	// ── Go runtime info ──────────────────────────────────────────────────
	b.WriteString("# TYPE aitop_go_info gauge\n")
	writeMetric(&b, "aitop_go_info",
		map[string]string{"version": runtime.Version()}, 1)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(b.String())) //nolint:errcheck
}

// writeMetric writes a single Prometheus text exposition line.
func writeMetric(b *strings.Builder, name string, labels map[string]string, value float64) {
	b.WriteString(name)
	if len(labels) > 0 {
		b.WriteByte('{')
		first := true
		for k, v := range labels {
			if !first {
				b.WriteByte(',')
			}
			b.WriteString(k)
			b.WriteString(`="`)
			b.WriteString(strings.ReplaceAll(v, `"`, `\"`))
			b.WriteByte('"')
			first = false
		}
		b.WriteByte('}')
	}
	b.WriteByte(' ')
	b.WriteString(fmt.Sprintf("%g", value))
	b.WriteByte('\n')
}
