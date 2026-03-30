package tracestore

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// Handler exposes the Trace Engine via HTTP.
//
// Routes (to be registered on the main mux):
//
//	GET  /api/v2/traces              — S2-3: search traces
//	GET  /api/v2/traces/{traceId}    — S2-4: trace detail (span tree)
//	GET  /api/v2/traces/xlog         — S2-5: XLog scatter-plot data
//	GET  /api/v2/services            — S2-6: service list
//	GET  /api/v2/services/deps       — S2-6: dependency graph
//	GET  /api/v2/traces/_stats       — ring buffer + store stats
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
	mux.HandleFunc("GET /api/v2/traces/xlog/stream", h.handleXLogStream) // XL-16: SSE
	mux.HandleFunc("GET /api/v2/traces/xlog", h.handleXLog)            // must be before /{traceId}
	mux.HandleFunc("GET /api/v2/traces/_stats", h.handleStats)
	mux.HandleFunc("GET /api/v2/traces/{traceId}", h.handleGetTrace)
	mux.HandleFunc("GET /api/v2/traces", h.handleSearch)
	mux.HandleFunc("GET /api/v2/services", h.handleServices)
	mux.HandleFunc("GET /api/v2/services/deps", h.handleDeps)
	// E4-1: Business Transaction endpoints
	mux.HandleFunc("GET /api/v2/biztx", h.handleListBizTx)
	mux.HandleFunc("GET /api/v2/biztx/{id}", h.handleGetBizTx)
	mux.HandleFunc("POST /api/v2/biztx/{id}/slo", h.handleSetBizTxSLO)
	mux.HandleFunc("DELETE /api/v2/biztx/{id}/slo", h.handleRemoveBizTxSLO)
	// E1-1: Database entity endpoints
	mux.HandleFunc("GET /api/v2/databases", h.handleListDatabases)
	mux.HandleFunc("GET /api/v2/databases/{id}/slow-queries", h.handleSlowQueries)
	mux.HandleFunc("GET /api/v2/databases/{id}", h.handleGetDatabase)
	mux.HandleFunc("GET /api/v2/services/{name}/databases", h.handleServiceDatabases)
	mux.HandleFunc("GET /api/v2/services/db-edges", h.handleServiceDBEdges)
}

// ── S2-3: Search traces ───────────────────────────────────────────────────────
//
// Query params:
//   service    string
//   from       RFC3339 or Unix ms (default: now-1h)
//   to         RFC3339 or Unix ms (default: now)
//   status     0|1|2  (unset|ok|error)
//   minMs      float  minimum duration in ms
//   maxMs      float  maximum duration in ms
//   limit      int    (default 100, max 1000)
//   offset     int

func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	now := time.Now().UTC()
	req := QueryRequest{
		ServiceName:  q.Get("service"),
		ServiceNames: q["service"], // XL-1: multi-service support
		From:         now.Add(-time.Hour),
		To:           now,
		Limit:        100,
	}

	if v := q.Get("from"); v != "" {
		req.From = parseTime(v, req.From)
	}
	if v := q.Get("to"); v != "" {
		req.To = parseTime(v, req.To)
	}
	if v := q.Get("status"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			req.StatusCode = otlp.StatusCode(n)
		}
	}
	if v := q.Get("minMs"); v != "" {
		req.MinDurationMS, _ = strconv.ParseFloat(v, 64)
	}
	if v := q.Get("maxMs"); v != "" {
		req.MaxDurationMS, _ = strconv.ParseFloat(v, 64)
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 1000 {
				n = 1000
			}
			req.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		req.Offset, _ = strconv.Atoi(v)
	}

	rows, err := h.store.Search(req)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"traces": rows,
		"total":  len(rows),
	})
}

// ── S2-4: Get trace detail ────────────────────────────────────────────────────
//
// Path: /api/v2/traces/{traceId}
// Query: from, to (window hint for warm-tier lookup; defaults to last 24 h)

func (h *Handler) handleGetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := r.PathValue("traceId")
	if traceID == "" {
		writeErr(w, http.StatusBadRequest, "traceId required")
		return
	}

	now := time.Now().UTC()
	from := now.Add(-24 * time.Hour)
	to := now

	q := r.URL.Query()
	if v := q.Get("from"); v != "" {
		from = parseTime(v, from)
	}
	if v := q.Get("to"); v != "" {
		to = parseTime(v, to)
	}

	trace, err := h.store.GetTrace(traceID, from, to)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if trace == nil {
		writeErr(w, http.StatusNotFound, "trace not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"trace": traceToDetail(trace),
	})
}

// ── XL-15: XLog scatter-plot data (lightweight, multi-service) ───────────────
//
// GET /api/v2/traces/xlog
// Query: service (required, repeatable for multi-service), from, to, limit (default 5000)
//        downsample=true (XL-17: auto-downsample for ranges > 1h)

func (h *Handler) handleXLog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	services := q["service"] // XL-15: multi-service support
	if len(services) == 0 {
		writeErr(w, http.StatusBadRequest, "service param required")
		return
	}

	now := time.Now().UTC()
	from := now.Add(-10 * time.Minute)
	to := now
	limit := 5000

	if v := q.Get("from"); v != "" {
		from = parseTime(v, from)
	}
	if v := q.Get("to"); v != "" {
		to = parseTime(v, to)
	}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	// XL-17: Auto-downsample for time ranges > 1 hour.
	downsample := q.Get("downsample") == "true" || to.Sub(from) > time.Hour

	// Fetch points for all requested services.
	var allPts []XLogPoint
	perService := limit / len(services)
	if perService < 100 {
		perService = 100
	}
	for _, svc := range services {
		pts, err := h.store.XLogPoints(svc, from, to, perService)
		if err != nil {
			h.logger.Warn("xlog query error", "service", svc, "error", err)
			continue
		}
		allPts = append(allPts, pts...)
	}

	// XL-17: Downsample by bucketing into time windows.
	if downsample && len(allPts) > 2000 {
		allPts = downsampleXLog(allPts, 500)
	}

	// Cap to limit.
	if len(allPts) > limit {
		allPts = allPts[:limit]
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"services":    services,
		"from":        from,
		"to":          to,
		"points":      allPts,
		"count":       len(allPts),
		"downsampled": downsample && len(allPts) > 0,
	})
}

// ── XL-16: SSE streaming for real-time XLog updates ──────────────────────────
//
// GET /api/v2/traces/xlog/stream?service=svc1&service=svc2
// Returns Server-Sent Events (text/event-stream) with new XLog points every 3s.

func (h *Handler) handleXLogStream(w http.ResponseWriter, r *http.Request) {
	services := r.URL.Query()["service"]
	if len(services) == 0 {
		writeErr(w, http.StatusBadRequest, "service param required")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx := r.Context()
	cursor := time.Now().UTC()

	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
			now := time.Now().UTC()
			var pts []XLogPoint
			for _, svc := range services {
				sp, _ := h.store.XLogPoints(svc, cursor, now, 200)
				pts = append(pts, sp...)
			}
			cursor = now

			if len(pts) > 0 {
				data, _ := json.Marshal(map[string]interface{}{
					"points": pts,
					"count":  len(pts),
					"time":   now,
				})
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			}
		}
	}
}

// ── XL-17: Downsample helper ─────────────────────────────────────────────────

// downsampleXLog reduces points by keeping representative samples per time bucket.
func downsampleXLog(pts []XLogPoint, targetCount int) []XLogPoint {
	if len(pts) <= targetCount || targetCount <= 0 {
		return pts
	}

	// Find time bounds.
	minT, maxT := pts[0].Timestamp, pts[0].Timestamp
	for _, p := range pts[1:] {
		if p.Timestamp.Before(minT) {
			minT = p.Timestamp
		}
		if p.Timestamp.After(maxT) {
			maxT = p.Timestamp
		}
	}

	bucketCount := targetCount
	span := maxT.Sub(minT)
	if span <= 0 {
		return pts[:targetCount]
	}
	bucketWidth := span / time.Duration(bucketCount)

	// Keep one representative per bucket (max latency — preserves outliers).
	type bucket struct {
		best XLogPoint
		set  bool
	}
	buckets := make([]bucket, bucketCount)

	for _, p := range pts {
		idx := int(p.Timestamp.Sub(minT) / bucketWidth)
		if idx >= bucketCount {
			idx = bucketCount - 1
		}
		if !buckets[idx].set || p.DurationMS > buckets[idx].best.DurationMS {
			buckets[idx].best = p
			buckets[idx].set = true
		}
	}

	out := make([]XLogPoint, 0, bucketCount)
	for _, b := range buckets {
		if b.set {
			out = append(out, b.best)
		}
	}
	return out
}

// ── S2-6: Service list ────────────────────────────────────────────────────────

func (h *Handler) handleServices(w http.ResponseWriter, r *http.Request) {
	svcs := h.store.Services()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"services": svcs,
		"count":    len(svcs),
	})
}

// ── S2-6: Dependency graph ────────────────────────────────────────────────────

func (h *Handler) handleDeps(w http.ResponseWriter, r *http.Request) {
	// Service-to-service edges from trace parent-child.
	svcEdges := h.store.DependencyGraph()
	// Service-to-database edges from db.* span attributes (E3-1 enhancement).
	dbEdges := h.store.ServiceDBEdges()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"edges":   svcEdges,
		"dbEdges": dbEdges,
		"count":   len(svcEdges) + len(dbEdges),
	})
}

// ── Stats ─────────────────────────────────────────────────────────────────────

func (h *Handler) handleStats(w http.ResponseWriter, r *http.Request) {
	ring := h.store.RingStats()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ring": ring,
	})
}

// ── E4-1: Business Transaction API handlers ───────────────────────────────────

func (h *Handler) handleListBizTx(w http.ResponseWriter, r *http.Request) {
	txns := h.store.BizTransactions()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"transactions": txns,
		"count":        len(txns),
	})
}

func (h *Handler) handleGetBizTx(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tx := h.store.GetBizTransaction(id)
	if tx == nil {
		writeErr(w, http.StatusNotFound, "business transaction not found")
		return
	}
	writeJSON(w, http.StatusOK, tx)
}

// E4-3: Set SLO for a business transaction.
func (h *Handler) handleSetBizTxSLO(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var slo BizTxSLO
	if err := json.NewDecoder(r.Body).Decode(&slo); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	h.store.SetBizTxSLO(id, slo)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "biztxId": id})
}

func (h *Handler) handleRemoveBizTxSLO(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	h.store.RemoveBizTxSLO(id)
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

// ── E1-1: Database entity API handlers ────────────────────────────────────────

func (h *Handler) handleListDatabases(w http.ResponseWriter, r *http.Request) {
	dbs := h.store.Databases()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"databases": dbs,
		"count":     len(dbs),
	})
}

func (h *Handler) handleGetDatabase(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "database id required")
		return
	}
	db := h.store.GetDatabase(id)
	if db == nil {
		writeErr(w, http.StatusNotFound, "database not found")
		return
	}
	writeJSON(w, http.StatusOK, db)
}

func (h *Handler) handleSlowQueries(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	queries := h.store.SlowQueries(id, limit)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"queries": queries,
		"count":   len(queries),
	})
}

func (h *Handler) handleServiceDatabases(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		writeErr(w, http.StatusBadRequest, "service name required")
		return
	}
	dbs := h.store.DatabasesForService(name)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"databases": dbs,
		"count":     len(dbs),
	})
}

func (h *Handler) handleServiceDBEdges(w http.ResponseWriter, r *http.Request) {
	edges := h.store.ServiceDBEdges()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"edges": edges,
		"count": len(edges),
	})
}

// ── Serialisation helpers ─────────────────────────────────────────────────────

// traceDetail is the JSON shape for the trace-detail endpoint.
type traceDetail struct {
	TraceID     string       `json:"traceId"`
	ServiceName string       `json:"serviceName"`
	RootName    string       `json:"rootName"`
	StartTime   time.Time    `json:"startTime"`
	EndTime     time.Time    `json:"endTime"`
	DurationMS  float64      `json:"durationMs"`
	StatusCode  int          `json:"statusCode"`
	SpanCount   int          `json:"spanCount"`
	Spans       []spanDetail `json:"spans"`
}

type spanDetail struct {
	SpanID        string            `json:"spanId"`
	ParentID      string            `json:"parentSpanId,omitempty"`
	ServiceName   string            `json:"serviceName"`
	Name          string            `json:"name"`
	Kind          int               `json:"kind"`
	StartTime     time.Time         `json:"startTime"`
	EndTime       time.Time         `json:"endTime"`
	DurationMS    float64           `json:"durationMs"`
	StatusCode    int               `json:"statusCode"`
	StatusMessage string            `json:"statusMessage,omitempty"`
	Attributes    map[string]string `json:"attributes,omitempty"`
	Events        []otlp.SpanEvent  `json:"events,omitempty"`
	Resource      map[string]string `json:"resource,omitempty"`
	Children      []string          `json:"children,omitempty"` // child span IDs
}

func traceToDetail(t *otlp.Trace) traceDetail {
	// Build child-ID map.
	children := make(map[string][]string)
	for _, sp := range t.Spans {
		if sp.ParentID != "" {
			children[sp.ParentID] = append(children[sp.ParentID], sp.SpanID)
		}
	}

	spans := make([]spanDetail, 0, len(t.Spans))
	for _, sp := range t.Spans {
		spans = append(spans, spanDetail{
			SpanID:        sp.SpanID,
			ParentID:      sp.ParentID,
			ServiceName:   sp.ServiceName,
			Name:          sp.Name,
			Kind:          int(sp.Kind),
			StartTime:     sp.StartTime,
			EndTime:       sp.EndTime,
			DurationMS:    sp.DurationMS(),
			StatusCode:    int(sp.StatusCode),
			StatusMessage: sp.StatusMessage,
			Attributes:    sp.Attributes,
			Events:        sp.Events,
			Resource:      sp.Resource,
			Children:      children[sp.SpanID],
		})
	}

	return traceDetail{
		TraceID:     t.TraceID,
		ServiceName: t.ServiceName,
		RootName:    t.RootName,
		StartTime:   t.StartTime,
		EndTime:     t.EndTime,
		DurationMS:  t.DurationMS,
		StatusCode:  int(t.StatusCode),
		SpanCount:   t.SpanCount,
		Spans:       spans,
	}
}

// ── Utility ───────────────────────────────────────────────────────────────────

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
	// Try RFC3339 first.
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC()
	}
	// Try numeric.
	s = strings.TrimSpace(s)
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return fallback
	}
	// Heuristic: > 1e12 → milliseconds, else seconds.
	if n > 1_000_000_000_000 {
		return time.UnixMilli(n).UTC()
	}
	return time.Unix(n, 0).UTC()
}
