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

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/auth"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/eventbus"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/validation"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/ws"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/version"
)

// ── Fleet Group Registry ──────────────────────────────────────────────────

type groupRecord struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	AgentIDs    []string  `json:"agentIds"`
	Tags        []string  `json:"tags"`
	CreatedAt   time.Time `json:"createdAt"`
}

type groupRegistry struct {
	mu     sync.RWMutex
	groups map[string]*groupRecord
	seq    int
}

func newGroupRegistry() *groupRegistry {
	return &groupRegistry{groups: make(map[string]*groupRecord)}
}

func (g *groupRegistry) list() []*groupRecord {
	g.mu.RLock()
	defer g.mu.RUnlock()
	out := make([]*groupRecord, 0, len(g.groups))
	for _, v := range g.groups {
		out = append(out, v)
	}
	return out
}

func (g *groupRegistry) create(name, desc string, agentIDs, tags []string) *groupRecord {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.seq++
	rec := &groupRecord{
		ID:          fmt.Sprintf("grp-%04d", g.seq),
		Name:        name,
		Description: desc,
		AgentIDs:    agentIDs,
		Tags:        tags,
		CreatedAt:   time.Now().UTC(),
	}
	g.groups[rec.ID] = rec
	return rec
}

func (g *groupRegistry) update(id, name, desc string, agentIDs, tags []string) (*groupRecord, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	rec, ok := g.groups[id]
	if !ok {
		return nil, false
	}
	if name != "" {
		rec.Name = name
	}
	if desc != "" {
		rec.Description = desc
	}
	if agentIDs != nil {
		rec.AgentIDs = agentIDs
	}
	if tags != nil {
		rec.Tags = tags
	}
	return rec, true
}

func (g *groupRegistry) delete(id string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	_, ok := g.groups[id]
	delete(g.groups, id)
	return ok
}

// ── Schedule Registry ─────────────────────────────────────────────────────

type scheduleRecord struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId,omitempty"`
	Cron       string `json:"cron"`
	Enabled    bool   `json:"enabled"`
}

type scheduleRegistry struct {
	mu        sync.RWMutex
	schedules map[string]*scheduleRecord
	seq       int
}

func newScheduleRegistry() *scheduleRegistry {
	return &scheduleRegistry{schedules: make(map[string]*scheduleRecord)}
}

func (s *scheduleRegistry) list() []*scheduleRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*scheduleRecord, 0, len(s.schedules))
	for _, v := range s.schedules {
		out = append(out, v)
	}
	return out
}

func (s *scheduleRegistry) upsert(id, name, targetType, targetID, cron string, enabled bool) *scheduleRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id == "" {
		s.seq++
		id = fmt.Sprintf("sched-%04d", s.seq)
	}
	rec := &scheduleRecord{
		ID: id, Name: name, TargetType: targetType,
		TargetID: targetID, Cron: cron, Enabled: enabled,
	}
	s.schedules[id] = rec
	return rec
}

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

	// Initialize subsystems
	jwtMgr := auth.NewJWTManager(auth.JWTConfig{})
	bus := eventbus.New(1000)
	validator := validation.NewGateway()
	wsHub := ws.NewHub(logger, bus)
	defer wsHub.Close()

	f := newFleet()
	gr := newGroupRegistry()
	sr := newScheduleRegistry()
	mux := buildMux(f, gr, sr, logger, jwtMgr, bus, validator, wsHub)

	// Apply middleware: CORS → JWT Auth
	corsMiddleware := auth.CORS("*")
	authMiddleware := auth.Middleware(jwtMgr, []string{
		"POST /api/v1/auth/login",
		"/api/v1/auth/login",
		"POST /api/v1/auth/refresh",
		"/api/v1/auth/refresh",
	})

	handler := corsMiddleware(authMiddleware(mux))

	srv := &http.Server{
		Addr:         *addr,
		Handler:      handler,
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
func buildMux(f *fleet, gr *groupRegistry, sr *scheduleRegistry, logger *slog.Logger, jwtMgr *auth.JWTManager, bus *eventbus.Bus, validator *validation.Gateway, wsHub *ws.Hub) http.Handler {
	mux := http.NewServeMux()

	// ── Auth endpoints ────────────────────────────────────────────────────────

	mux.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}

		user := auth.FindDemoUser(body.Email, body.Password)
		if user == nil {
			http.Error(w, `{"message":"invalid email or password"}`, http.StatusUnauthorized)
			return
		}

		accessToken, expiresAt, err := jwtMgr.GenerateAccessToken(user.ID, user.Email, user.Name, user.Role, user.OrgID)
		if err != nil {
			http.Error(w, `{"message":"token generation failed"}`, http.StatusInternalServerError)
			return
		}
		refreshToken, err := jwtMgr.GenerateRefreshToken(user.ID)
		if err != nil {
			http.Error(w, `{"message":"token generation failed"}`, http.StatusInternalServerError)
			return
		}

		logger.Info("user login", "email", user.Email, "role", user.Role)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"user": map[string]interface{}{
				"id":               user.ID,
				"email":            user.Email,
				"name":             user.Name,
				"role":             user.Role,
				"organizationId":   user.OrgID,
				"organizationName": user.OrgName,
			},
			"tokens": map[string]interface{}{
				"accessToken":  accessToken,
				"refreshToken": refreshToken,
				"expiresAt":    expiresAt,
			},
		})
	})

	mux.HandleFunc("POST /api/v1/auth/refresh", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RefreshToken string `json:"refreshToken"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}

		claims, err := jwtMgr.Verify(body.RefreshToken)
		if err != nil {
			http.Error(w, `{"message":"invalid refresh token"}`, http.StatusUnauthorized)
			return
		}

		// Find the user to regenerate full claims
		var user *auth.DemoUser
		for _, u := range auth.DemoUsers {
			if u.ID == claims.UserID {
				user = &u
				break
			}
		}
		if user == nil {
			http.Error(w, `{"message":"user not found"}`, http.StatusUnauthorized)
			return
		}

		accessToken, expiresAt, _ := jwtMgr.GenerateAccessToken(user.ID, user.Email, user.Name, user.Role, user.OrgID)
		refreshToken, _ := jwtMgr.GenerateRefreshToken(user.ID)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"accessToken":  accessToken,
			"refreshToken": refreshToken,
			"expiresAt":    expiresAt,
		})
	})

	mux.HandleFunc("GET /api/v1/auth/me", func(w http.ResponseWriter, r *http.Request) {
		claims := auth.GetClaims(r)
		if claims == nil {
			http.Error(w, `{"message":"not authenticated"}`, http.StatusUnauthorized)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":               claims.UserID,
			"email":            claims.Email,
			"name":             claims.Name,
			"role":             claims.Role,
			"organizationId":   claims.OrganizationID,
			"organizationName": "AITOP",
		})
	})

	mux.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

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
		collectorID := r.URL.Path[len("/api/v1/collect/"):]

		// Read body (limited to 10MB)
		body := http.MaxBytesReader(w, r.Body, 10*1024*1024)
		data := make([]byte, 0, 4096)
		buf := make([]byte, 4096)
		for {
			n, err := body.Read(buf)
			data = append(data, buf[:n]...)
			if err != nil {
				break
			}
		}

		// Validate
		result, sanitized := validator.Validate(data)
		if result.Status == validation.StatusRejected {
			logger.Warn("collect rejected", "collector", collectorID, "errors", result.Errors)
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"status": "rejected",
				"errors": result.Errors,
			})
			return
		}

		agentID := r.Header.Get("X-Agent-ID")
		logger.Info("collect result received",
			"collector", collectorID,
			"agent_id", agentID,
			"sanitized", result.Sanitized,
			"size", len(sanitized),
		)

		// Publish event
		bus.Publish(eventbus.Event{
			Type:    eventbus.EventCollectCompleted,
			AgentID: agentID,
			Data: map[string]interface{}{
				"collector_id": collectorID,
				"sanitized":    result.Sanitized,
			},
		})

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":   string(result.Status),
			"warnings": result.Warnings,
		})
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

	// ── Fleet Group endpoints (/api/v1/fleet/groups) ────────────────────────

	mux.HandleFunc("GET /api/v1/fleet/groups", func(w http.ResponseWriter, r *http.Request) {
		items := gr.list()
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
	})

	mux.HandleFunc("POST /api/v1/fleet/groups", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			AgentIDs    []string `json:"agentIds"`
			Tags        []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rec := gr.create(body.Name, body.Description, body.AgentIDs, body.Tags)
		logger.Info("group created", "id", rec.ID, "name", rec.Name)
		writeJSON(w, http.StatusCreated, rec)
	})

	mux.HandleFunc("PUT /api/v1/fleet/groups/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/fleet/groups/"):]
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			AgentIDs    []string `json:"agentIds"`
			Tags        []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rec, ok := gr.update(id, body.Name, body.Description, body.AgentIDs, body.Tags)
		if !ok {
			http.Error(w, "group not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, rec)
	})

	mux.HandleFunc("DELETE /api/v1/fleet/groups/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/fleet/groups/"):]
		if !gr.delete(id) {
			http.Error(w, "group not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// ── Fleet Agent endpoints (/api/v1/fleet/agents) ────────────────────────

	mux.HandleFunc("GET /api/v1/fleet/agents", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		out := make([]map[string]interface{}, 0, len(agents))
		for _, a := range agents {
			out = append(out, snapshot(a))
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": out, "total": len(out)})
	})

	mux.HandleFunc("POST /api/v1/fleet/agents/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[len("/api/v1/fleet/agents/"):]
		agentID, subPath := path, ""
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
		logger.Info("manual collect triggered via fleet API", "agent_id", agentID)
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued", "agent_id": agentID})
	})

	// ── Fleet Jobs endpoint (/api/v1/fleet/jobs) ────────────────────────────

	mux.HandleFunc("GET /api/v1/fleet/jobs", func(w http.ResponseWriter, r *http.Request) {
		// MVP: return empty list; real job tracking is future work
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	// ── Fleet Plugins endpoint (/api/v1/fleet/plugins) ──────────────────────

	mux.HandleFunc("GET /api/v1/fleet/plugins", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	mux.HandleFunc("POST /api/v1/fleet/plugins/deploy", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PluginName string   `json:"pluginName"`
			TargetType string   `json:"targetType"`
			TargetID   string   `json:"targetId"`
			AgentIDs   []string `json:"agentIds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		logger.Info("plugin deploy queued", "plugin", body.PluginName, "target", body.TargetType)
		writeJSON(w, http.StatusAccepted, map[string]interface{}{"queued": 1})
	})

	// ── Fleet Updates endpoints (/api/v1/fleet/updates) ─────────────────────

	mux.HandleFunc("GET /api/v1/fleet/updates", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		items := make([]map[string]interface{}, 0, len(agents))
		for _, a := range agents {
			s := snapshot(a)
			items = append(items, map[string]interface{}{
				"agentId":        s["id"],
				"hostname":       s["hostname"],
				"currentVersion": s["agent_version"],
				"targetVersion":  "1.2.0",
				"phase":          "completed",
				"progress":       100,
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
	})

	mux.HandleFunc("POST /api/v1/fleet/updates", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentIDs      []string `json:"agentIds"`
			TargetVersion string   `json:"targetVersion"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		logger.Info("OTA update queued", "agents", len(body.AgentIDs), "version", body.TargetVersion)
		writeJSON(w, http.StatusAccepted, map[string]interface{}{"queued": len(body.AgentIDs)})
	})

	// ── Fleet Schedules endpoints (/api/v1/fleet/schedules) ─────────────────

	mux.HandleFunc("GET /api/v1/fleet/schedules", func(w http.ResponseWriter, r *http.Request) {
		items := sr.list()
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
	})

	mux.HandleFunc("POST /api/v1/fleet/schedules", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name       string `json:"name"`
			TargetType string `json:"targetType"`
			TargetID   string `json:"targetId"`
			Cron       string `json:"cron"`
			Enabled    bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rec := sr.upsert("", body.Name, body.TargetType, body.TargetID, body.Cron, body.Enabled)
		logger.Info("schedule created", "id", rec.ID, "cron", rec.Cron)
		writeJSON(w, http.StatusCreated, rec)
	})

	mux.HandleFunc("PUT /api/v1/fleet/schedules/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/fleet/schedules/"):]
		var body struct {
			Name       string `json:"name"`
			TargetType string `json:"targetType"`
			TargetID   string `json:"targetId"`
			Cron       string `json:"cron"`
			Enabled    bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rec := sr.upsert(id, body.Name, body.TargetType, body.TargetID, body.Cron, body.Enabled)
		writeJSON(w, http.StatusOK, rec)
	})

	// ── SSE (Server-Sent Events) real-time stream ───────────────────────────
	// Frontend connects: new EventSource('/api/v1/events?channel=fleet&channel=collect')
	if wsHub != nil {
		mux.HandleFunc("GET /api/v1/events", wsHub.SSEHandler())
	}

	// ── Health endpoints ─────────────────────────────────────────────────────
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": version.Full()})
	}
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /health", healthHandler)

	return mux
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
