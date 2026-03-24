// Package lite provides a lightweight HTTP server for AITOP Lite mode.
// It serves a status dashboard, report generation API, and cleanup API.
package lite

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/buffer"
)

// Server is the Lite mode HTTP server.
type Server struct {
	port      string
	buf       *buffer.Buffer
	logger    *slog.Logger
	startTime time.Time
}

// NewServer creates a Lite HTTP server.
func NewServer(port string, buf *buffer.Buffer, logger *slog.Logger) *Server {
	return &Server{
		port:      port,
		buf:       buf,
		logger:    logger,
		startTime: time.Now(),
	}
}

// Start runs the Lite HTTP server until the context is cancelled.
func (s *Server) Start(ctx context.Context) {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /", s.handleDashboard)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("POST /api/report", s.handleReport)
	mux.HandleFunc("POST /api/report/pdf", s.handleReportPDF)
	mux.HandleFunc("GET /reports/{file}", s.handleReportFile)
	mux.HandleFunc("POST /api/cleanup", s.handleCleanup)
	mux.HandleFunc("GET /health", s.handleHealth)

	srv := &http.Server{
		Addr:    ":" + s.port,
		Handler: mux,
	}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutCtx)
	}()

	s.logger.Info("lite HTTP server starting", "port", s.port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		s.logger.Error("lite server error", "error", err)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"mode":   "lite",
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	pending, _ := s.buf.PendingCount()
	uptime := time.Since(s.startTime)

	// Check data directory size
	dataSize := dirSize(envOrDefault("AITOP_STORAGE_PATH", "./data"))

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"mode":           "lite",
		"uptime_seconds": int(uptime.Seconds()),
		"uptime_human":   formatDuration(uptime),
		"pending_items":  pending,
		"data_size_mb":   dataSize / (1024 * 1024),
		"retention_days": 7,
		"started_at":     s.startTime.Format(time.RFC3339),
	})
}

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	pending, _ := s.buf.PendingCount()
	uptime := time.Since(s.startTime)
	dataSize := dirSize(envOrDefault("AITOP_STORAGE_PATH", "./data"))

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AITOP Lite Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;padding:2rem}
h1{color:#58a6ff;margin-bottom:1.5rem;font-size:1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem}
.card .label{font-size:.75rem;color:#8b949e;margin-bottom:.25rem}
.card .value{font-size:1.5rem;font-weight:600;color:#f0f6fc}
.card .unit{font-size:.75rem;color:#8b949e;margin-left:.25rem}
.actions{display:flex;gap:.75rem;margin-top:1.5rem}
.btn{padding:.5rem 1.25rem;border-radius:6px;border:1px solid #30363d;background:#21262d;color:#c9d1d9;cursor:pointer;font-size:.875rem;transition:background .15s}
.btn:hover{background:#30363d}
.btn.primary{background:#238636;border-color:#238636;color:#fff}
.btn.primary:hover{background:#2ea043}
.btn.danger{background:#da3633;border-color:#da3633;color:#fff}
.btn.danger:hover{background:#f85149}
.status{display:inline-block;width:8px;height:8px;border-radius:50%%;background:#3fb950;margin-right:.5rem}
footer{margin-top:2rem;font-size:.75rem;color:#484f58;text-align:center}
</style>
</head>
<body>
<h1><span class="status"></span>AITOP Lite — Performance Diagnosis</h1>
<div class="grid">
  <div class="card"><div class="label">Uptime</div><div class="value">%s</div></div>
  <div class="card"><div class="label">Collected Items</div><div class="value">%d</div></div>
  <div class="card"><div class="label">Data Size</div><div class="value">%.1f<span class="unit">MB</span></div></div>
  <div class="card"><div class="label">Retention</div><div class="value">7<span class="unit">days</span></div></div>
</div>
<div class="actions">
  <button class="btn primary" onclick="fetch('/api/report',{method:'POST'}).then(r=>r.json()).then(d=>alert(d.message||d.error))">Generate Report</button>
  <button class="btn danger" onclick="if(confirm('All data will be deleted. Continue?'))fetch('/api/cleanup',{method:'POST'}).then(r=>r.json()).then(d=>alert(d.message||d.error))">Cleanup Data</button>
</div>
<footer>AITOP Lite v1.0 — Started %s</footer>
</body></html>`,
		formatDuration(uptime),
		pending,
		float64(dataSize)/(1024*1024),
		s.startTime.Format("2006-01-02 15:04:05"),
	)
}

func (s *Server) handleReport(w http.ResponseWriter, r *http.Request) {
	outputDir := envOrDefault("AITOP_REPORT_PATH", "./reports")
	if err := os.MkdirAll(outputDir, 0750); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	report := NewReportGenerator(s.buf, s.logger)
	path, err := report.GenerateHTML(outputDir, s.startTime)
	if err != nil {
		s.logger.Error("report generation failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	s.logger.Info("report generated", "path", path)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Report generated successfully",
		"path":    path,
	})
}

func (s *Server) handleReportPDF(w http.ResponseWriter, r *http.Request) {
	outputDir := envOrDefault("AITOP_REPORT_PATH", "./reports")
	if err := os.MkdirAll(outputDir, 0750); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	report := NewReportGenerator(s.buf, s.logger)
	path, err := report.GeneratePDF(outputDir, s.startTime)
	if err != nil {
		s.logger.Error("PDF report generation failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	s.logger.Info("PDF report generated", "path", path)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":  "PDF report generated successfully",
		"path":     path,
		"filename": filepath.Base(path),
	})
}

// handleReportFile serves a generated report file (HTML or PDF) by filename.
// Only the base filename is accepted; directory traversal is prevented.
func (s *Server) handleReportFile(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.PathValue("file"))
	if name == "." || name == "/" {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}
	outputDir := envOrDefault("AITOP_REPORT_PATH", "./reports")
	http.ServeFile(w, r, filepath.Join(outputDir, name))
}

func (s *Server) handleCleanup(w http.ResponseWriter, r *http.Request) {
	dataDir := envOrDefault("AITOP_STORAGE_PATH", "./data")
	result := Cleanup(dataDir, s.logger)
	writeJSON(w, http.StatusOK, result)
}

// helpers

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func formatDuration(d time.Duration) string {
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	mins := int(d.Minutes()) % 60
	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, mins)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, mins)
	}
	return fmt.Sprintf("%dm", mins)
}

func dirSize(path string) int64 {
	var size int64
	entries, err := os.ReadDir(path)
	if err != nil {
		return 0
	}
	for _, e := range entries {
		if info, err := e.Info(); err == nil {
			size += info.Size()
		}
	}
	return size
}
