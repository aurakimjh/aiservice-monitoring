package compat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/metricstore"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/tracestore"
)

// ── S5-2: OTLP Export — Replicate data to external Jaeger/Grafana ────────────
//
// Enables exporting AITOP-stored traces and metrics to external observability
// backends (Jaeger, Grafana, etc.) via OTLP-compatible JSON format.
//
// Endpoints:
//   POST /api/v1/export/configure   — Configure export targets
//   GET  /api/v1/export/status      — Show export target status
//
// Export targets receive data in OTLP JSON format via HTTP POST.

// ExportTarget defines an external system to replicate data to.
type ExportTarget struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`      // e.g. "http://jaeger:4318/v1/traces"
	Type     string `json:"type"`     // "traces" or "metrics"
	Enabled  bool   `json:"enabled"`
	Interval string `json:"interval"` // e.g. "30s"
}

// ExportStatus reports the current state of an export target.
type ExportStatus struct {
	Target       ExportTarget `json:"target"`
	LastExport   time.Time    `json:"lastExport,omitempty"`
	LastError    string       `json:"lastError,omitempty"`
	ExportCount  int64        `json:"exportCount"`
	ErrorCount   int64        `json:"errorCount"`
}

// OTLPExporter manages export targets and periodically pushes data.
type OTLPExporter struct {
	mu           sync.RWMutex
	targets      map[string]*exportRunner
	traceStore   *tracestore.Store
	metricStore  *metricstore.Store
	logger       *slog.Logger
	client       *http.Client
}

type exportRunner struct {
	target      ExportTarget
	status      ExportStatus
	cancel      context.CancelFunc
	lastCursor  time.Time
}

// NewOTLPExporter creates an exporter backed by the trace and metric stores.
func NewOTLPExporter(ts *tracestore.Store, ms *metricstore.Store, logger *slog.Logger) *OTLPExporter {
	return &OTLPExporter{
		targets:     make(map[string]*exportRunner),
		traceStore:  ts,
		metricStore: ms,
		logger:      logger,
		client:      &http.Client{Timeout: 30 * time.Second},
	}
}

// Register attaches routes to mux.
func (e *OTLPExporter) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/export/configure", e.handleConfigure)
	mux.HandleFunc("GET /api/v1/export/status", e.handleStatus)
	mux.HandleFunc("DELETE /api/v1/export/targets/{id}", e.handleDelete)
}

func (e *OTLPExporter) handleConfigure(w http.ResponseWriter, r *http.Request) {
	var target ExportTarget
	if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if target.URL == "" {
		writeErr(w, http.StatusBadRequest, "url required")
		return
	}
	if target.ID == "" {
		target.ID = "export-" + time.Now().Format("20060102150405")
	}
	if target.Type == "" {
		target.Type = "traces"
	}
	if target.Interval == "" {
		target.Interval = "30s"
	}

	e.mu.Lock()
	// Stop existing runner if updating.
	if existing, ok := e.targets[target.ID]; ok && existing.cancel != nil {
		existing.cancel()
	}

	runner := &exportRunner{
		target:     target,
		status:     ExportStatus{Target: target},
		lastCursor: time.Now().Add(-5 * time.Minute),
	}
	e.targets[target.ID] = runner
	e.mu.Unlock()

	if target.Enabled {
		ctx, cancel := context.WithCancel(context.Background())
		runner.cancel = cancel
		go e.runExportLoop(ctx, runner)
	}

	e.logger.Info("export target configured", "id", target.ID, "url", target.URL, "type", target.Type)
	writeJSON(w, http.StatusOK, target)
}

func (e *OTLPExporter) handleStatus(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	statuses := make([]ExportStatus, 0, len(e.targets))
	for _, runner := range e.targets {
		statuses = append(statuses, runner.status)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"targets": statuses,
		"count":   len(statuses),
	})
}

func (e *OTLPExporter) handleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	e.mu.Lock()
	if runner, ok := e.targets[id]; ok {
		if runner.cancel != nil {
			runner.cancel()
		}
		delete(e.targets, id)
	}
	e.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

func (e *OTLPExporter) runExportLoop(ctx context.Context, runner *exportRunner) {
	interval, err := time.ParseDuration(runner.target.Interval)
	if err != nil || interval < 5*time.Second {
		interval = 30 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.exportOnce(runner)
		}
	}
}

func (e *OTLPExporter) exportOnce(runner *exportRunner) {
	now := time.Now().UTC()
	from := runner.lastCursor
	to := now

	switch runner.target.Type {
	case "traces":
		e.exportTraces(runner, from, to)
	case "metrics":
		e.exportMetrics(runner, from, to)
	}

	runner.lastCursor = to
	runner.status.LastExport = now
}

func (e *OTLPExporter) exportTraces(runner *exportRunner, from, to time.Time) {
	traces, err := e.traceStore.Search(tracestore.QueryRequest{
		From:  from,
		To:    to,
		Limit: 500,
	})
	if err != nil {
		runner.status.LastError = err.Error()
		runner.status.ErrorCount++
		return
	}
	if len(traces) == 0 {
		return
	}

	// Build OTLP-compatible JSON payload.
	payload := map[string]interface{}{
		"resourceSpans": buildResourceSpans(traces),
	}
	data, _ := json.Marshal(payload)

	if err := e.postToTarget(runner.target.URL, data); err != nil {
		runner.status.LastError = err.Error()
		runner.status.ErrorCount++
		e.logger.Warn("export traces failed", "target", runner.target.ID, "error", err)
	} else {
		runner.status.ExportCount += int64(len(traces))
		runner.status.LastError = ""
	}
}

func (e *OTLPExporter) exportMetrics(runner *exportRunner, from, to time.Time) {
	names := e.metricStore.MetricNames()
	if len(names) == 0 {
		return
	}

	// Export each metric (up to 50 names per batch).
	limit := 50
	if len(names) < limit {
		limit = len(names)
	}

	var totalExported int
	for _, name := range names[:limit] {
		results, err := e.metricStore.Query(metricstore.QueryRequest{
			MetricName: name,
			From:       from,
			To:         to,
			Limit:      100,
		})
		if err != nil {
			continue
		}
		totalExported += len(results)
	}

	// Build OTLP-compatible JSON payload (simplified).
	payload := map[string]interface{}{
		"resourceMetrics": []interface{}{
			map[string]interface{}{
				"resource":     map[string]interface{}{"attributes": []interface{}{}},
				"scopeMetrics": []interface{}{},
			},
		},
	}
	data, _ := json.Marshal(payload)

	if err := e.postToTarget(runner.target.URL, data); err != nil {
		runner.status.LastError = err.Error()
		runner.status.ErrorCount++
	} else {
		runner.status.ExportCount += int64(totalExported)
		runner.status.LastError = ""
	}
}

func (e *OTLPExporter) postToTarget(targetURL string, data []byte) error {
	resp, err := e.client.Post(targetURL, "application/json", jsonReader(data))
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("export target returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func buildResourceSpans(traces []*tracestore.TraceRow) []interface{} {
	// Group by service.
	byService := make(map[string][]*tracestore.TraceRow)
	for _, t := range traces {
		byService[t.ServiceName] = append(byService[t.ServiceName], t)
	}

	var resourceSpans []interface{}
	for svc, rows := range byService {
		spans := make([]interface{}, 0, len(rows))
		for _, r := range rows {
			spans = append(spans, map[string]interface{}{
				"traceId":            r.TraceID,
				"name":               r.RootName,
				"startTimeUnixNano":  r.StartTime.UnixNano(),
				"endTimeUnixNano":    r.EndTime.UnixNano(),
				"status":             map[string]interface{}{"code": r.StatusCode},
			})
		}
		resourceSpans = append(resourceSpans, map[string]interface{}{
			"resource": map[string]interface{}{
				"attributes": []interface{}{
					map[string]interface{}{"key": "service.name", "value": map[string]string{"stringValue": svc}},
				},
			},
			"scopeSpans": []interface{}{
				map[string]interface{}{"spans": spans},
			},
		})
	}
	return resourceSpans
}
