// Command collection-server is the AITOP Collection Server MVP.
//
// It provides a lightweight REST API for:
//   - Agent heartbeat reception and state management (Fleet)
//   - Collect-result ingestion
//   - Fleet dashboard REST queries
//
// All agent state is kept in-memory for the MVP; a PostgreSQL-backed
// implementation is planned for Phase 16.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/version"
)

// agentRecord holds in-memory state for one registered agent.
type agentRecord struct {
	mu            sync.RWMutex
	ID            string             `json:"id"`
	Hostname      string             `json:"hostname"`
	Status        models.AgentStatus `json:"status"`
	AgentVersion  string             `json:"agent_version"`
	OSType        string             `json:"os_type"`
	OSVersion     string             `json:"os_version"`
	CPUPercent    float64            `json:"cpu_percent"`
	MemoryMB      float64            `json:"memory_mb"`
	Plugins       []models.PluginStatus `json:"plugins"`
	LastHeartbeat time.Time          `json:"last_heartbeat"`
	RegisteredAt  time.Time          `json:"registered_at"`
	PrivReport    *models.PrivilegeReport `json:"privilege_report,omitempty"`
}

// fleet is the in-memory agent registry.
type fleet struct {
	mu     sync.RWMutex
	agents map[string]*agentRecord
}

func newFleet() *fleet {
	return &fleet{agents: make(map[string]*agentRecord)}
}

func (f *fleet) upsert(hb *models.Heartbeat) {
	f.mu.Lock()
	defer f.mu.Unlock()

	rec, ok := f.agents[hb.AgentID]
	if !ok {
		rec = &agentRecord{
			ID:           hb.AgentID,
			RegisteredAt: time.Now().UTC(),
			Status:       models.AgentRegistered,
		}
		f.agents[hb.AgentID] = rec
	}
	rec.mu.Lock()
	rec.Hostname = hb.Hostname
	rec.AgentVersion = hb.AgentVersion
	rec.OSType = hb.OSType
	rec.OSVersion = hb.OSVersion
	rec.CPUPercent = hb.CPUPercent
	rec.MemoryMB = hb.MemoryMB
	rec.Plugins = hb.Plugins
	rec.LastHeartbeat = hb.Timestamp
	if hb.PrivilegeReport != nil {
		rec.PrivReport = hb.PrivilegeReport
	}

	// Advance state: registered/offline → approved/healthy on first check-in.
	switch rec.Status {
	case models.AgentRegistered:
		rec.Status = models.AgentApproved
	case models.AgentApproved, models.AgentOffline:
		rec.Status = models.AgentHealthy
	}
	// If the heartbeat itself reports healthy / degraded, trust it.
	if hb.Status == models.AgentDegraded {
		rec.Status = models.AgentDegraded
	}
	rec.mu.Unlock()
}

func (f *fleet) list() []*agentRecord {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]*agentRecord, 0, len(f.agents))
	for _, a := range f.agents {
		out = append(out, a)
	}
	return out
}

func (f *fleet) get(id string) (*agentRecord, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	a, ok := f.agents[id]
	return a, ok
}

// snapshot returns a copy safe for JSON serialisation (no lock needed on copy).
func snapshot(rec *agentRecord) map[string]interface{} {
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	return map[string]interface{}{
		"id":             rec.ID,
		"hostname":       rec.Hostname,
		"status":         rec.Status,
		"agent_version":  rec.AgentVersion,
		"os_type":        rec.OSType,
		"os_version":     rec.OSVersion,
		"cpu_percent":    rec.CPUPercent,
		"memory_mb":      rec.MemoryMB,
		"plugins":        rec.Plugins,
		"last_heartbeat": rec.LastHeartbeat,
		"registered_at":  rec.RegisteredAt,
	}
}

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	showVer := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVer {
		fmt.Println(version.Full())
		os.Exit(0)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	f := newFleet()
	mux := buildMux(f, logger)

	srv := &http.Server{
		Addr:         *addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("collection-server starting", "addr", *addr, "version", version.Full())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down…")
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutCtx)
	logger.Info("collection-server stopped")
}

// buildMux wires all REST endpoints.
func buildMux(f *fleet, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()

	// ── POST /api/v1/heartbeat ──────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		var hb models.Heartbeat
		if err := json.NewDecoder(r.Body).Decode(&hb); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if hb.AgentID == "" {
			http.Error(w, "agent_id required", http.StatusBadRequest)
			return
		}
		f.upsert(&hb)
		logger.Info("heartbeat received", "agent_id", hb.AgentID, "status", hb.Status)

		resp := models.HeartbeatResponse{}
		writeJSON(w, http.StatusOK, resp)
	})

	// ── POST /api/v1/collect/{collector_id} ────────────────────────────────
	mux.HandleFunc("POST /api/v1/collect/", func(w http.ResponseWriter, r *http.Request) {
		// Accept any payload for MVP; just acknowledge receipt.
		logger.Info("collect result received", "path", r.URL.Path)
		writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
	})

	// ── GET /api/v1/agents ─────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/agents", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		out := make([]map[string]interface{}, 0, len(agents))
		for _, a := range agents {
			out = append(out, snapshot(a))
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"agents": out,
			"total":  len(out),
		})
	})

	// ── GET /api/v1/agents/{id} ────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/agents/", func(w http.ResponseWriter, r *http.Request) {
		// Strip prefix to get the agent ID (or sub-path like {id}/privileges).
		path := r.URL.Path[len("/api/v1/agents/"):]
		agentID := path
		subPath := ""
		for i, c := range path {
			if c == '/' {
				agentID = path[:i]
				subPath = path[i+1:]
				break
			}
		}

		rec, ok := f.get(agentID)
		if !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}

		if subPath == "privileges" {
			// GET /api/v1/agents/{id}/privileges
			rec.mu.RLock()
			priv := rec.PrivReport
			rec.mu.RUnlock()
			if priv == nil {
				priv = &models.PrivilegeReport{AgentID: agentID}
			}
			writeJSON(w, http.StatusOK, priv)
			return
		}

		writeJSON(w, http.StatusOK, snapshot(rec))
	})

	// ── POST /api/v1/agents/{id}/collect ───────────────────────────────────
	mux.HandleFunc("POST /api/v1/agents/", func(w http.ResponseWriter, r *http.Request) {
		// POST /api/v1/agents/{id}/collect — trigger immediate collection.
		path := r.URL.Path[len("/api/v1/agents/"):]
		agentID := path
		subPath := ""
		for i, c := range path {
			if c == '/' {
				agentID = path[:i]
				subPath = path[i+1:]
				break
			}
		}
		if subPath != "collect" {
			http.Error(w, "unknown sub-path", http.StatusNotFound)
			return
		}
		if _, ok := f.get(agentID); !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		logger.Info("manual collect triggered", "agent_id", agentID)
		writeJSON(w, http.StatusAccepted, map[string]string{
			"status":   "queued",
			"agent_id": agentID,
		})
	})

	// ── GET /healthz ────────────────────────────────────────────────────────
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": version.Full()})
	})

	return mux
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
