package metricstore

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Handler exposes the Metric Engine via HTTP.
//
// Routes (to be registered on the main mux):
//
//	GET   /api/v2/metrics/query       — S3-3: query metrics (JSON body or query params)
//	POST  /api/v2/metrics/query       — S3-3: query metrics (JSON body)
//	GET   /api/v2/metrics/promql      — S3-7: PromQL query
//	GET   /api/v2/metrics/names       — list all metric names
//	GET   /api/v2/metrics/series      — list series for a metric
//	GET   /api/v2/metrics/_stats      — store statistics
//	GET   /api/v2/alerts/rules        — S3-6: list alert rules
//	POST  /api/v2/alerts/rules        — S3-6: create alert rule
//	DELETE /api/v2/alerts/rules/{id}  — S3-6: delete alert rule
//	GET   /api/v2/alerts/states       — S3-6: current alert states
type Handler struct {
	store  *Store
	logger *slog.Logger
}

// NewHandler creates an HTTP handler backed by store.
func NewHandler(store *Store, logger *slog.Logger) *Handler {
	return &Handler{store: store, logger: logger}
}

// Register attaches all routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v2/metrics/query", h.handleQuery)
	mux.HandleFunc("POST /api/v2/metrics/query", h.handleQueryPost)
	mux.HandleFunc("GET /api/v2/metrics/promql", h.handlePromQL)
	mux.HandleFunc("GET /api/v2/metrics/names", h.handleNames)
	mux.HandleFunc("GET /api/v2/metrics/series", h.handleSeries)
	mux.HandleFunc("GET /api/v2/metrics/_stats", h.handleStats)
	mux.HandleFunc("GET /api/v2/alerts/rules", h.handleListAlertRules)
	mux.HandleFunc("POST /api/v2/alerts/rules", h.handleCreateAlertRule)
	mux.HandleFunc("DELETE /api/v2/alerts/rules/{id}", h.handleDeleteAlertRule)
	mux.HandleFunc("GET /api/v2/alerts/states", h.handleAlertStates)
}

// ── S3-3: Query metrics (GET with query params) ─────────────────────────────
//
// Query params:
//   metric    string (required)
//   from      RFC3339 or Unix ms (default: now-1h)
//   to        RFC3339 or Unix ms (default: now)
//   step      duration string (default: 15s)
//   agg       aggregation function (default: avg)
//   label.*   label filters (e.g. label.service=api-gateway)
//   limit     int (default: 100, max 1000)

func (h *Handler) handleQuery(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	metric := q.Get("metric")
	if metric == "" {
		writeErr(w, http.StatusBadRequest, "metric param required")
		return
	}

	now := time.Now().UTC()
	req := QueryRequest{
		MetricName:  metric,
		LabelMatch:  make(map[string]string),
		From:        now.Add(-time.Hour),
		To:          now,
		Step:        15 * time.Second,
		Aggregation: AggAvg,
		Limit:       100,
	}

	if v := q.Get("from"); v != "" {
		req.From = parseTime(v, req.From)
	}
	if v := q.Get("to"); v != "" {
		req.To = parseTime(v, req.To)
	}
	if v := q.Get("step"); v != "" {
		if d := parseDurationParam(v); d > 0 {
			req.Step = d
		}
	}
	if v := q.Get("agg"); v != "" {
		req.Aggregation = AggFunc(v)
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 1000 {
				n = 1000
			}
			req.Limit = n
		}
	}

	// Label filters: label.key=value
	for key, vals := range q {
		if strings.HasPrefix(key, "label.") && len(vals) > 0 {
			labelKey := strings.TrimPrefix(key, "label.")
			req.LabelMatch[labelKey] = vals[0]
		}
	}

	results, err := h.store.Query(req)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"metric":  metric,
		"from":    req.From,
		"to":      req.To,
		"step":    req.Step.String(),
		"results": results,
		"count":   len(results),
	})
}

// ── S3-3: Query metrics (POST with JSON body) ───────────────────────────────

func (h *Handler) handleQueryPost(w http.ResponseWriter, r *http.Request) {
	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if req.MetricName == "" {
		writeErr(w, http.StatusBadRequest, "metric field required")
		return
	}
	if req.From.IsZero() {
		req.From = time.Now().UTC().Add(-time.Hour)
	}
	if req.To.IsZero() {
		req.To = time.Now().UTC()
	}
	if req.Step <= 0 {
		req.Step = 15 * time.Second
	}
	if req.Aggregation == "" {
		req.Aggregation = AggAvg
	}
	if req.Limit <= 0 {
		req.Limit = 100
	}
	if req.Limit > 1000 {
		req.Limit = 1000
	}

	results, err := h.store.Query(req)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"metric":  req.MetricName,
		"from":    req.From,
		"to":      req.To,
		"step":    req.Step.String(),
		"results": results,
		"count":   len(results),
	})
}

// ── S3-7: PromQL query ──────────────────────────────────────────────────────
//
// GET /api/v2/metrics/promql?query=rate(http_requests_total[5m])&from=...&to=...&step=15s

func (h *Handler) handlePromQL(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	expr := q.Get("query")
	if expr == "" {
		writeErr(w, http.StatusBadRequest, "query param required")
		return
	}

	now := time.Now().UTC()
	from := now.Add(-time.Hour)
	to := now
	step := 15 * time.Second

	if v := q.Get("from"); v != "" {
		from = parseTime(v, from)
	}
	if v := q.Get("to"); v != "" {
		to = parseTime(v, to)
	}
	if v := q.Get("step"); v != "" {
		if d := parseDurationParam(v); d > 0 {
			step = d
		}
	}

	results, err := h.store.QueryPromQL(expr, from, to, step)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "promql error: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"query":   expr,
		"from":    from,
		"to":      to,
		"step":    step.String(),
		"results": results,
		"count":   len(results),
	})
}

// ── Metric names ─────────────────────────────────────────────────────────────

func (h *Handler) handleNames(w http.ResponseWriter, r *http.Request) {
	names := h.store.MetricNames()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"names": names,
		"count": len(names),
	})
}

// ── Series list ──────────────────────────────────────────────────────────────
//
// GET /api/v2/metrics/series?metric=http_requests_total

func (h *Handler) handleSeries(w http.ResponseWriter, r *http.Request) {
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		writeErr(w, http.StatusBadRequest, "metric param required")
		return
	}

	now := time.Now().UTC()
	from := now.Add(-HotRetention)
	results := h.store.hot.Query(metric, nil, from, now)

	type seriesInfo struct {
		Key    string            `json:"key"`
		Labels map[string]string `json:"labels"`
	}
	series := make([]seriesInfo, 0, len(results))
	for _, r := range results {
		series = append(series, seriesInfo{
			Key:    r.Series.Key,
			Labels: r.Series.Labels,
		})
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"metric": metric,
		"series": series,
		"count":  len(series),
	})
}

// ── Stats ────────────────────────────────────────────────────────────────────

func (h *Handler) handleStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.Stats())
}

// ── S3-6: Alert rule CRUD ────────────────────────────────────────────────────

func (h *Handler) handleListAlertRules(w http.ResponseWriter, r *http.Request) {
	rules := h.store.alerts.Rules()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"rules": rules,
		"count": len(rules),
	})
}

func (h *Handler) handleCreateAlertRule(w http.ResponseWriter, r *http.Request) {
	var rule AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if rule.ID == "" {
		rule.ID = fmt.Sprintf("rule-%d", time.Now().UnixNano())
	}
	if rule.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	if rule.Metric == "" {
		writeErr(w, http.StatusBadRequest, "metric required")
		return
	}
	h.store.alerts.AddRule(rule)
	writeJSON(w, http.StatusCreated, rule)
}

func (h *Handler) handleDeleteAlertRule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "rule id required")
		return
	}
	h.store.alerts.RemoveRule(id)
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

func (h *Handler) handleAlertStates(w http.ResponseWriter, r *http.Request) {
	states := h.store.alerts.States()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"states": states,
		"count":  len(states),
	})
}

// ── Utility ──────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// parseTime parses RFC3339, Unix-seconds, or Unix-milliseconds strings.
func parseTime(s string, fallback time.Time) time.Time {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC()
	}
	s = strings.TrimSpace(s)
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return fallback
	}
	if n > 1_000_000_000_000 {
		return time.UnixMilli(n).UTC()
	}
	return time.Unix(n, 0).UTC()
}

// parseDurationParam parses "15s", "1m", "1h" etc.
func parseDurationParam(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		// Try PromQL-style duration.
		return parseDuration(s)
	}
	return d
}
