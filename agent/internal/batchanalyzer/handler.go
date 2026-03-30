package batchanalyzer

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
)

// Handler exposes batch analysis APIs via HTTP.
//
// Routes:
//   POST /api/v2/batch/analyze/sql           — WS-3.1: SQL bottleneck analysis
//   POST /api/v2/batch/analyze/chunk         — WS-3.2: Chunk/parallelization analysis
//   POST /api/v2/batch/analyze/trend         — WS-3.3: Regression + SLA prediction
//   POST /api/v2/batch/analyze/resources     — WS-3.4: Resource efficiency analysis
//   POST /api/v2/batch/analyze/compare       — WS-3.4: Normal vs abnormal comparison
//   POST /api/v2/batch/analyze/report        — WS-3.4: Auto optimization report
//   GET  /api/v2/batch/live                  — WS-3.5: List running batches
//   GET  /api/v2/batch/live/{id}             — WS-3.5: Single batch live state
//   POST /api/v2/batch/live/{id}/progress    — WS-3.5: Update progress
//   POST /api/v2/batch/live/{id}/step        — WS-3.5: Update step status
//   POST /api/v2/batch/live/{id}/throughput  — WS-3.5: Record throughput
//   POST /api/v2/batch/live/{id}/sql         — WS-3.5: Update SQL Top-N
type Handler struct {
	liveView *LiveViewStore
	logger   *slog.Logger
}

// NewHandler creates a batch analyzer HTTP handler.
func NewHandler(logger *slog.Logger) *Handler {
	return &Handler{
		liveView: NewLiveViewStore(),
		logger:   logger,
	}
}

// Register attaches all routes to mux.
func (h *Handler) Register(mux *http.ServeMux) {
	// Analysis endpoints (stateless — input data in request body).
	mux.HandleFunc("POST /api/v2/batch/analyze/sql", h.handleAnalyzeSQL)
	mux.HandleFunc("POST /api/v2/batch/analyze/chunk", h.handleAnalyzeChunk)
	mux.HandleFunc("POST /api/v2/batch/analyze/trend", h.handleAnalyzeTrend)
	mux.HandleFunc("POST /api/v2/batch/analyze/resources", h.handleAnalyzeResources)
	mux.HandleFunc("POST /api/v2/batch/analyze/compare", h.handleCompare)
	mux.HandleFunc("POST /api/v2/batch/analyze/report", h.handleReport)
	// Live view endpoints (stateful).
	mux.HandleFunc("GET /api/v2/batch/live/{id}", h.handleLiveGet)
	mux.HandleFunc("GET /api/v2/batch/live", h.handleLiveList)
	mux.HandleFunc("POST /api/v2/batch/live/{id}/progress", h.handleLiveProgress)
	mux.HandleFunc("POST /api/v2/batch/live/{id}/step", h.handleLiveStep)
	mux.HandleFunc("POST /api/v2/batch/live/{id}/throughput", h.handleLiveThroughput)
	mux.HandleFunc("POST /api/v2/batch/live/{id}/sql", h.handleLiveSQL)
}

// ── WS-3.1: SQL Analysis ─────────────────────────────────────────────────────

func (h *Handler) handleAnalyzeSQL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ExecutionID string       `json:"executionId"`
		Profiles    []SQLProfile `json:"profiles"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	result := AnalyzeSQL(req.ExecutionID, req.Profiles)
	writeJSON(w, http.StatusOK, result)
}

// ── WS-3.2: Chunk Analysis ───────────────────────────────────────────────────

func (h *Handler) handleAnalyzeChunk(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChunkMetrics []ChunkMetric    `json:"chunkMetrics"`
		Steps        []StepDependency `json:"steps"`
		MemLimitMB   float64          `json:"memLimitMb"`
		CPUCores     int              `json:"cpuCores"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if req.CPUCores <= 0 {
		req.CPUCores = 4
	}
	if req.MemLimitMB <= 0 {
		req.MemLimitMB = 4096
	}
	result := AnalyzeChunk(req.ChunkMetrics, req.Steps, req.MemLimitMB, req.CPUCores)
	writeJSON(w, http.StatusOK, result)
}

// ── WS-3.3: Trend Analysis ──────────────────────────────────────────────────

func (h *Handler) handleAnalyzeTrend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		JobName        string             `json:"jobName"`
		History        []ExecutionHistory `json:"history"`
		SLAThresholdMS float64            `json:"slaThresholdMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	result := AnalyzeTrend(req.JobName, req.History, req.SLAThresholdMS)
	writeJSON(w, http.StatusOK, result)
}

// ── WS-3.4: Resource Analysis ────────────────────────────────────────────────

func (h *Handler) handleAnalyzeResources(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ExecutionID string          `json:"executionId"`
		Metrics     ResourceMetrics `json:"metrics"`
		DurationMS  float64         `json:"durationMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	result := AnalyzeResources(req.ExecutionID, req.Metrics, req.DurationMS)
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleCompare(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Label    string             `json:"label"`
		Baseline []ExecutionHistory `json:"baseline"`
		Compare  []ExecutionHistory `json:"compare"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	result := CompareExecutions(req.Label, req.Baseline, req.Compare)
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) handleReport(w http.ResponseWriter, r *http.Request) {
	var req struct {
		JobName   string              `json:"jobName"`
		SQL       *SQLAnalysisResult  `json:"sql,omitempty"`
		Chunk     *ChunkAnalysisResult `json:"chunk,omitempty"`
		Trend     *TrendAnalysisResult `json:"trend,omitempty"`
		Resource  *ResourceAnalysisResult `json:"resource,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	report := GenerateReport(req.JobName, req.SQL, req.Chunk, req.Trend, req.Resource)
	writeJSON(w, http.StatusOK, report)
}

// ── WS-3.5: Live View ────────────────────────────────────────────────────────

func (h *Handler) handleLiveList(w http.ResponseWriter, r *http.Request) {
	states := h.liveView.ListRunning()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"running": states,
		"count":   len(states),
	})
}

func (h *Handler) handleLiveGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	state := h.liveView.GetState(id)
	if state == nil {
		writeErr(w, http.StatusNotFound, "batch not running")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (h *Handler) handleLiveProgress(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		JobName   string `json:"jobName"`
		Processed int64  `json:"processed"`
		Total     int64  `json:"total"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	h.liveView.UpdateProgress(id, req.JobName, req.Processed, req.Total)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleLiveStep(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var step LiveStepState
	if err := json.NewDecoder(r.Body).Decode(&step); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	h.liveView.UpdateStep(id, step)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleLiveThroughput(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		ItemsSec float64 `json:"itemsSec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	h.liveView.RecordThroughput(id, req.ItemsSec)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) handleLiveSQL(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Stats []LiveSQLStat `json:"stats"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	h.liveView.UpdateSQLTopN(id, req.Stats)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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

// unused but required by handler pattern
var _ = strconv.Itoa
