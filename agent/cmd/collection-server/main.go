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
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"strconv"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/auth"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/eventbus"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/validation"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/ws"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/storage"
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

func (g *groupRegistry) get(id string) (*groupRecord, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	rec, ok := g.groups[id]
	return rec, ok
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

// ── Agent Config Registry ─────────────────────────────────────────────────

type configHistoryEntry struct {
	Version   int                    `json:"version"`
	Config    map[string]interface{} `json:"config"`
	ChangedAt time.Time              `json:"changedAt"`
	ChangedBy string                 `json:"changedBy"`
}

type configRecord struct {
	AgentID   string                 `json:"agentId"`
	Version   int                    `json:"version"`
	Config    map[string]interface{} `json:"config"`
	UpdatedAt time.Time              `json:"updatedAt"`
	UpdatedBy string                 `json:"updatedBy"`
	History   []configHistoryEntry   `json:"history"`
}

type configRegistry struct {
	mu      sync.RWMutex
	configs map[string]*configRecord
}

func newConfigRegistry() *configRegistry {
	return &configRegistry{configs: make(map[string]*configRecord)}
}

func (cr *configRegistry) get(agentID string) (*configRecord, bool) {
	cr.mu.RLock()
	defer cr.mu.RUnlock()
	rec, ok := cr.configs[agentID]
	return rec, ok
}

func (cr *configRegistry) defaultFor(agentID string) *configRecord {
	return &configRecord{
		AgentID:   agentID,
		Version:   1,
		UpdatedAt: time.Now().UTC(),
		UpdatedBy: "system",
		Config: map[string]interface{}{
			"collect.interval_sec":   30,
			"collect.timeout_sec":    10,
			"collect.ai_enabled":     true,
			"collect.os_enabled":     true,
			"heartbeat.interval_sec": 30,
			"log.level":              "info",
		},
		History: []configHistoryEntry{},
	}
}

func (cr *configRegistry) set(agentID, updatedBy string, cfg map[string]interface{}) *configRecord {
	cr.mu.Lock()
	defer cr.mu.Unlock()
	rec, ok := cr.configs[agentID]
	if !ok {
		rec = &configRecord{
			AgentID: agentID,
			Version: 0,
			History: []configHistoryEntry{},
		}
		cr.configs[agentID] = rec
	}
	if rec.Config != nil {
		entry := configHistoryEntry{
			Version:   rec.Version,
			Config:    rec.Config,
			ChangedAt: rec.UpdatedAt,
			ChangedBy: rec.UpdatedBy,
		}
		rec.History = append(rec.History, entry)
		if len(rec.History) > 20 {
			rec.History = rec.History[len(rec.History)-20:]
		}
	}
	rec.Version++
	rec.Config = cfg
	rec.UpdatedAt = time.Now().UTC()
	rec.UpdatedBy = updatedBy
	return rec
}

// ── SDK Alert Registry ────────────────────────────────────────────────────

type sdkAlertRecord struct {
	ID           string    `json:"id"`
	AgentID      string    `json:"agentId"`
	Hostname     string    `json:"hostname"`
	Language     string    `json:"language"`
	SDKName      string    `json:"sdkName"`
	SDKVersion   string    `json:"sdkVersion"`
	OTelEnabled  bool      `json:"otelEnabled"`
	Acknowledged bool      `json:"acknowledged"`
	DetectedAt   time.Time `json:"detectedAt"`
}

type sdkAlertRegistry struct {
	mu     sync.RWMutex
	alerts map[string]*sdkAlertRecord
	seq    int
}

func newSDKAlertRegistry() *sdkAlertRegistry {
	return &sdkAlertRegistry{alerts: make(map[string]*sdkAlertRecord)}
}

func (s *sdkAlertRegistry) list() []*sdkAlertRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*sdkAlertRecord, 0, len(s.alerts))
	for _, v := range s.alerts {
		out = append(out, v)
	}
	return out
}

func (s *sdkAlertRegistry) create(agentID, hostname, language, sdkName, sdkVersion string, otelEnabled bool) *sdkAlertRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	rec := &sdkAlertRecord{
		ID:          fmt.Sprintf("sdk-%04d", s.seq),
		AgentID:     agentID,
		Hostname:    hostname,
		Language:    language,
		SDKName:     sdkName,
		SDKVersion:  sdkVersion,
		OTelEnabled: otelEnabled,
		DetectedAt:  time.Now().UTC(),
	}
	s.alerts[rec.ID] = rec
	return rec
}

func (s *sdkAlertRegistry) acknowledge(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.alerts[id]
	if !ok {
		return false
	}
	rec.Acknowledged = true
	return true
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
	AIDetected    bool                    `json:"ai_detected"`
	SDKLangs      []string                `json:"sdk_langs,omitempty"`
	Approved      bool                    `json:"approved"`
	OSMetrics     *models.OSMetrics       `json:"os_metrics,omitempty"`
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
	if hb.AIDetected {
		rec.AIDetected = true
	}
	if hb.SDKLangs != nil {
		rec.SDKLangs = hb.SDKLangs
	}
	if hb.OSMetrics != nil {
		rec.OSMetrics = hb.OSMetrics
	}
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

func (f *fleet) delete(id string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.agents[id]
	if ok {
		delete(f.agents, id)
	}
	return ok
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
		"ai_detected":    rec.AIDetected,
		"sdk_langs":      rec.SDKLangs,
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

	// Initialize storage backend
	storageCfg := storage.StorageConfig{
		Type: envOrDefault("AITOP_STORAGE_TYPE", "local"),
		S3: storage.S3Config{
			Endpoint:  os.Getenv("AITOP_S3_ENDPOINT"),
			Bucket:    envOrDefault("AITOP_S3_BUCKET", "aitop-evidence"),
			AccessKey: os.Getenv("AITOP_S3_ACCESS_KEY"),
			SecretKey: os.Getenv("AITOP_S3_SECRET_KEY"),
			Region:    envOrDefault("AITOP_S3_REGION", "us-east-1"),
			UseSSL:    os.Getenv("AITOP_S3_USE_SSL") == "true",
			PathStyle: os.Getenv("AITOP_S3_PATH_STYLE") != "false",
		},
		Local: storage.LocalConfig{
			BasePath:      envOrDefault("AITOP_STORAGE_PATH", "./data"),
			RetentionDays: envOrDefaultInt("AITOP_STORAGE_RETENTION_DAYS", 30),
		},
	}

	var store storage.StorageBackend
	store, err := storage.NewFromConfig(storageCfg, logger)
	if err != nil {
		logger.Error("storage init failed", "error", err)
		os.Exit(1)
	}
	logger.Info("storage backend initialized", "type", store.Type())

	f := newFleet()
	gr := newGroupRegistry()
	sr := newScheduleRegistry()
	cr := newConfigRegistry()
	sar := newSDKAlertRegistry()
	mux := buildMux(f, gr, sr, cr, sar, logger, jwtMgr, bus, validator, wsHub, store)

	// Apply middleware: CORS → JWT Auth
	corsMiddleware := auth.CORS("*")
	authMiddleware := auth.Middleware(jwtMgr, []string{
		"POST /api/v1/auth/login",
		"/api/v1/auth/login",
		"POST /api/v1/auth/refresh",
		"/api/v1/auth/refresh",
		"POST /api/v1/profiles",
		"/api/v1/heartbeat",
		"/api/v1/collect/",
		"/api/v1/evidence/",
		"/health",
		"/api/v1/proxy/",
		"/api/v1/realdata/",
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

	// Start background purge scheduler
	go startPurgeScheduler(ctx, store, storageCfg.Local.RetentionDays, logger)

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
func buildMux(f *fleet, gr *groupRegistry, sr *scheduleRegistry, cr *configRegistry, sar *sdkAlertRegistry, logger *slog.Logger, jwtMgr *auth.JWTManager, bus *eventbus.Bus, validator *validation.Gateway, wsHub *ws.Hub, store storage.StorageBackend) http.Handler {
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

		// Store evidence
		var storageRef string
		if store != nil {
			resultID := fmt.Sprintf("cr-%d", time.Now().UnixNano())
			key := storage.EvidenceKey(agentID, collectorID, resultID, time.Now())
			ref, err := store.Put(r.Context(), key, sanitized, map[string]string{
				"agent_id":     agentID,
				"collector_id": collectorID,
				"result_id":    resultID,
			})
			if err != nil {
				logger.Error("evidence storage failed", "key", key, "error", err)
			} else {
				storageRef = ref
				logger.Info("evidence stored", "ref", ref)
			}
		}

		// Publish event
		bus.Publish(eventbus.Event{
			Type:    eventbus.EventCollectCompleted,
			AgentID: agentID,
			Data: map[string]interface{}{
				"collector_id": collectorID,
				"sanitized":    result.Sanitized,
				"storage_ref":  storageRef,
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

		// GET /api/v1/agents/{id}/config
		if subPath == "config" {
			cfgRec, ok := cr.get(agentID)
			if !ok {
				cfgRec = cr.defaultFor(agentID)
			}
			writeJSON(w, http.StatusOK, cfgRec)
			return
		}

		// GET /api/v1/agents/{id}/config/history
		if subPath == "config/history" {
			cfgRec, ok := cr.get(agentID)
			if !ok {
				writeJSON(w, http.StatusOK, map[string]interface{}{"history": []interface{}{}})
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"history": cfgRec.History})
			return
		}

		writeJSON(w, http.StatusOK, snapshot(rec))
	})

	// ── POST /api/v1/agents/{id}/* ─────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/agents/", func(w http.ResponseWriter, r *http.Request) {
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
		if _, ok := f.get(agentID); !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		switch subPath {
		case "collect":
			// POST /api/v1/agents/{id}/collect — trigger immediate collection.
			logger.Info("manual collect triggered", "agent_id", agentID)
			writeJSON(w, http.StatusAccepted, map[string]string{
				"status":   "queued",
				"agent_id": agentID,
			})
		case "restart":
			// POST /api/v1/agents/{id}/restart — restart agent process.
			logger.Info("agent restart requested", "agent_id", agentID)
			bus.Publish(eventbus.Event{
				Type:      "agent.restart.requested",
				Timestamp: time.Now().UTC(),
				AgentID:   agentID,
			})
			writeJSON(w, http.StatusAccepted, map[string]interface{}{
				"status":    "restart_queued",
				"agent_id":  agentID,
				"queued_at": time.Now().UTC().Format(time.RFC3339),
			})
		case "config/reload":
			// POST /api/v1/agents/{id}/config/reload — trigger config hot reload.
			logger.Info("config hot reload triggered", "agent_id", agentID)
			bus.Publish(eventbus.Event{
				Type:      "agent.config.reload",
				Timestamp: time.Now().UTC(),
				AgentID:   agentID,
			})
			writeJSON(w, http.StatusAccepted, map[string]interface{}{
				"status":    "reload_queued",
				"agent_id":  agentID,
				"queued_at": time.Now().UTC().Format(time.RFC3339),
			})
		case "diagnose":
			// POST /api/v1/agents/{id}/diagnose — manual (🖐️) diagnostic trigger (Phase 31-3a).
			var body struct {
				Mode        string `json:"mode"`
				TriggeredBy string `json:"triggered_by"`
				Role        string `json:"role"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "invalid JSON body", http.StatusBadRequest)
				return
			}
			if body.Role == "" {
				body.Role = "viewer"
			}
			allowedRoles := map[string]bool{"admin": true, "sre": true}
			if !allowedRoles[body.Role] {
				writeJSON(w, http.StatusForbidden, map[string]string{
					"error": "role '" + body.Role + "' is not permitted to trigger diagnostic runs",
				})
				return
			}
			if body.Mode == "full" && body.Role != "admin" && body.Role != "sre" {
				writeJSON(w, http.StatusForbidden, map[string]string{
					"error": "role '" + body.Role + "' is not permitted to trigger full/manual diagnostic items",
				})
				return
			}
			runID := fmt.Sprintf("manual-%s-%d", agentID, time.Now().UnixMilli())
			logger.Info("manual diagnostic triggered",
				"agent_id", agentID,
				"run_id", runID,
				"mode", body.Mode,
				"triggered_by", body.TriggeredBy,
				"role", body.Role,
			)
			bus.Publish(eventbus.Event{
				Type:      "agent.diagnose.requested",
				Timestamp: time.Now().UTC(),
				AgentID:   agentID,
			})
			writeJSON(w, http.StatusAccepted, map[string]string{
				"run_id":   runID,
				"agent_id": agentID,
				"status":   "queued",
			})
		default:
			http.Error(w, "unknown sub-path", http.StatusNotFound)
		}
	})

	// ── PUT /api/v1/agents/{id}/config ─────────────────────────────────────
	mux.HandleFunc("PUT /api/v1/agents/", func(w http.ResponseWriter, r *http.Request) {
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
		if subPath != "config" {
			http.Error(w, "unknown sub-path", http.StatusNotFound)
			return
		}
		if _, ok := f.get(agentID); !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		updatedBy := "admin"
		if claims := auth.GetClaims(r); claims != nil {
			updatedBy = claims.Email
		}
		rec := cr.set(agentID, updatedBy, body)
		logger.Info("agent config updated", "agent_id", agentID, "version", rec.Version, "by", updatedBy)
		writeJSON(w, http.StatusOK, rec)
	})

	// ── DELETE /api/v1/agents/{id} ────────────────────────────────────────────
	mux.HandleFunc("DELETE /api/v1/agents/", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.URL.Path[len("/api/v1/agents/"):]
		if agentID == "" {
			http.Error(w, "agent id required", http.StatusBadRequest)
			return
		}
		if !f.delete(agentID) {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		logger.Info("agent deleted", "agent_id", agentID)
		w.WriteHeader(http.StatusNoContent)
	})

	// ── DELETE /api/v1/fleet/agents/{id} ──────────────────────────────────
	mux.HandleFunc("DELETE /api/v1/fleet/agents/", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.URL.Path[len("/api/v1/fleet/agents/"):]
		if agentID == "" {
			http.Error(w, "agent id required", http.StatusBadRequest)
			return
		}
		if !f.delete(agentID) {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		logger.Info("agent deleted via fleet API", "agent_id", agentID)
		w.WriteHeader(http.StatusNoContent)
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

	// ── POST /api/v1/fleet/groups/{id}/* — assign agents / trigger collect / trigger update ──
	mux.HandleFunc("POST /api/v1/fleet/groups/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[len("/api/v1/fleet/groups/"):]
		groupID, subPath := path, ""
		for i, c := range path {
			if c == '/' {
				groupID = path[:i]
				subPath = path[i+1:]
				break
			}
		}
		grp, ok := gr.get(groupID)
		if !ok {
			http.Error(w, "group not found", http.StatusNotFound)
			return
		}
		switch subPath {
		case "agents":
			// POST /api/v1/fleet/groups/{id}/agents — assign agents to group (25-2-2)
			var body struct {
				AgentIDs []string `json:"agentIds"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			existing := make(map[string]bool)
			for _, id := range grp.AgentIDs {
				existing[id] = true
			}
			for _, id := range body.AgentIDs {
				existing[id] = true
			}
			merged := make([]string, 0, len(existing))
			for id := range existing {
				merged = append(merged, id)
			}
			rec, _ := gr.update(groupID, grp.Name, grp.Description, merged, grp.Tags)
			logger.Info("agents assigned to group", "group_id", groupID, "added", len(body.AgentIDs))
			writeJSON(w, http.StatusOK, rec)
		case "collect":
			// POST /api/v1/fleet/groups/{id}/collect — trigger collection for all agents (25-2-5)
			logger.Info("group collection triggered", "group_id", groupID, "agents", len(grp.AgentIDs))
			bus.Publish(eventbus.Event{
				Type:      "group.collect.triggered",
				Timestamp: time.Now().UTC(),
				Data: map[string]interface{}{
					"group_id":  groupID,
					"agent_ids": grp.AgentIDs,
				},
			})
			writeJSON(w, http.StatusAccepted, map[string]interface{}{
				"status":     "queued",
				"group_id":   groupID,
				"agentCount": len(grp.AgentIDs),
			})
		case "update":
			// POST /api/v1/fleet/groups/{id}/update — trigger OTA for all agents in group (25-2-5)
			var body struct {
				TargetVersion string `json:"targetVersion"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TargetVersion == "" {
				body.TargetVersion = "1.2.0"
			}
			logger.Info("group OTA triggered", "group_id", groupID, "version", body.TargetVersion, "agents", len(grp.AgentIDs))
			writeJSON(w, http.StatusAccepted, map[string]interface{}{
				"status":        "queued",
				"group_id":      groupID,
				"targetVersion": body.TargetVersion,
				"queued":        len(grp.AgentIDs),
			})
		default:
			http.Error(w, "unknown sub-path", http.StatusNotFound)
		}
	})

	mux.HandleFunc("DELETE /api/v1/fleet/groups/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[len("/api/v1/fleet/groups/"):]

		// DELETE /api/v1/fleet/groups/{id}/agents/{agentId} — remove agent from group (25-2-2)
		if parts := strings.SplitN(path, "/", 3); len(parts) == 3 && parts[1] == "agents" {
			groupID, agentID := parts[0], parts[2]
			grp, ok := gr.get(groupID)
			if !ok {
				http.Error(w, "group not found", http.StatusNotFound)
				return
			}
			newIDs := make([]string, 0, len(grp.AgentIDs))
			for _, id := range grp.AgentIDs {
				if id != agentID {
					newIDs = append(newIDs, id)
				}
			}
			gr.update(groupID, grp.Name, grp.Description, newIDs, grp.Tags)
			logger.Info("agent removed from group", "group_id", groupID, "agent_id", agentID)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// DELETE /api/v1/fleet/groups/{id} — delete group
		if !gr.delete(path) {
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
		if _, ok := f.get(agentID); !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		switch subPath {
		case "collect":
			logger.Info("manual collect triggered via fleet API", "agent_id", agentID)
			writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued", "agent_id": agentID})
		case "restart":
			logger.Info("agent restart requested via fleet API", "agent_id", agentID)
			bus.Publish(eventbus.Event{
				Type:      "agent.restart.requested",
				Timestamp: time.Now().UTC(),
				AgentID:   agentID,
			})
			writeJSON(w, http.StatusAccepted, map[string]interface{}{
				"status":    "restart_queued",
				"agent_id":  agentID,
				"queued_at": time.Now().UTC().Format(time.RFC3339),
			})
		default:
			http.Error(w, "unknown sub-path", http.StatusNotFound)
		}
	})

	// ── Fleet Jobs endpoint (/api/v1/fleet/jobs) ────────────────────────────

	mux.HandleFunc("GET /api/v1/fleet/jobs", func(w http.ResponseWriter, r *http.Request) {
		// MVP: return empty list; real job tracking is future work
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	// Fleet Plugins — registerPluginRoutes()에서 처리 (plugin_api.go)

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

	// ── SDK Alert endpoints (25-1-3) ─────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/fleet/sdk-alerts", func(w http.ResponseWriter, r *http.Request) {
		alerts := sar.list()
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": alerts, "total": len(alerts)})
	})

	mux.HandleFunc("POST /api/v1/fleet/sdk-alerts", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentID     string `json:"agentId"`
			Hostname    string `json:"hostname"`
			Language    string `json:"language"`
			SDKName     string `json:"sdkName"`
			SDKVersion  string `json:"sdkVersion"`
			OTelEnabled bool   `json:"otelEnabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		rec := sar.create(body.AgentID, body.Hostname, body.Language, body.SDKName, body.SDKVersion, body.OTelEnabled)
		logger.Info("SDK alert created", "id", rec.ID, "language", rec.Language, "sdk", rec.SDKName)
		bus.Publish(eventbus.Event{
			Type:      "sdk.detected",
			Timestamp: time.Now().UTC(),
			AgentID:   body.AgentID,
			Data: map[string]interface{}{
				"alert_id":     rec.ID,
				"language":     rec.Language,
				"sdk_name":     rec.SDKName,
				"otel_enabled": rec.OTelEnabled,
			},
		})
		writeJSON(w, http.StatusCreated, rec)
	})

	// POST /api/v1/fleet/sdk-alerts/{id}/acknowledge
	mux.HandleFunc("POST /api/v1/fleet/sdk-alerts/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/fleet/sdk-alerts/")
		if strings.HasSuffix(path, "/acknowledge") {
			alertID := strings.TrimSuffix(path, "/acknowledge")
			if sar.acknowledge(alertID) {
				writeJSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
			} else {
				http.Error(w, "alert not found", http.StatusNotFound)
			}
			return
		}
		http.Error(w, "unknown sub-path", http.StatusNotFound)
	})

	// ── Fleet Agent Detail (GET /api/v1/fleet/agents/{id}) ───────────────────

	mux.HandleFunc("GET /api/v1/fleet/agents/", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.URL.Path[len("/api/v1/fleet/agents/"):]
		if agentID == "" {
			http.Error(w, "agent id required", http.StatusBadRequest)
			return
		}
		rec, ok := f.get(agentID)
		if !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, snapshot(rec))
	})

	// ── Infra Hosts API (/api/v1/infra/hosts) ────────────────────────────────

	mux.HandleFunc("GET /api/v1/infra/hosts", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		hosts := make([]map[string]interface{}, 0, len(agents))
		for _, a := range agents {
			a.mu.RLock()
			hosts = append(hosts, map[string]interface{}{
				"hostname":   a.Hostname,
				"agent_id":   a.ID,
				"status":     string(a.Status),
				"os_type":    a.OSType,
				"os_version": a.OSVersion,
				"cpu_percent": a.CPUPercent,
				"memory_mb":  a.MemoryMB,
				"last_heartbeat": a.LastHeartbeat.Format(time.RFC3339),
			})
			a.mu.RUnlock()
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": hosts, "total": len(hosts)})
	})

	// ── AI Services API (/api/v1/ai/*) ───────────────────────────────────────

	demoAIServices := func() []map[string]interface{} {
		return []map[string]interface{}{
			{
				"id": "test-rag-service", "name": "RAG Q&A Service", "type": "rag",
				"status": "healthy", "model": "gpt-4o", "provider": "openai",
				"ttft_p50_ms": 180, "ttft_p95_ms": 420, "tps": 45.2,
				"token_usage_24h": 1250000, "cost_24h_usd": 18.75,
				"error_rate": 0.2, "request_count_24h": 8500,
			},
			{
				"id": "ai-svc-002", "name": "Code Assistant", "type": "completion",
				"status": "healthy", "model": "claude-sonnet-4-20250514", "provider": "anthropic",
				"ttft_p50_ms": 220, "ttft_p95_ms": 580, "tps": 38.7,
				"token_usage_24h": 980000, "cost_24h_usd": 14.70,
				"error_rate": 0.1, "request_count_24h": 5200,
			},
			{
				"id": "ai-svc-003", "name": "Image Classifier", "type": "inference",
				"status": "degraded", "model": "resnet-50", "provider": "self-hosted",
				"ttft_p50_ms": 45, "ttft_p95_ms": 120, "tps": 210.5,
				"token_usage_24h": 0, "cost_24h_usd": 2.30,
				"error_rate": 1.8, "request_count_24h": 42000,
			},
		}
	}

	mux.HandleFunc("GET /api/v1/ai/services", func(w http.ResponseWriter, r *http.Request) {
		items := demoAIServices()
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "total": len(items)})
	})

	mux.HandleFunc("GET /api/v1/ai/services/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[len("/api/v1/ai/services/"):]
		svcID := path
		subPath := ""
		for i, c := range path {
			if c == '/' {
				svcID = path[:i]
				subPath = path[i+1:]
				break
			}
		}

		// Find the service
		var svc map[string]interface{}
		for _, s := range demoAIServices() {
			if s["id"] == svcID {
				svc = s
				break
			}
		}
		if svc == nil {
			http.Error(w, "ai service not found", http.StatusNotFound)
			return
		}

		switch subPath {
		case "llm":
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"service_id": svcID, "model": svc["model"], "provider": svc["provider"],
				"ttft_p50_ms": svc["ttft_p50_ms"], "ttft_p95_ms": svc["ttft_p95_ms"], "tps": svc["tps"],
				"token_usage_24h": svc["token_usage_24h"], "cost_24h_usd": svc["cost_24h_usd"],
				"error_rate": svc["error_rate"],
				"ttft_histogram": []map[string]interface{}{
					{"bucket_ms": 100, "count": 120}, {"bucket_ms": 200, "count": 340},
					{"bucket_ms": 500, "count": 85}, {"bucket_ms": 1000, "count": 22}, {"bucket_ms": 2000, "count": 5},
				},
			})
		case "rag":
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"service_id": svcID,
				"embedding": map[string]interface{}{"model": "text-embedding-3-small", "dimension": 1536, "latency_ms": 12},
				"retrieval": map[string]interface{}{"vectordb": "qdrant", "top_k": 5, "latency_ms": 35, "relevancy_score": 0.87},
				"generation": map[string]interface{}{"model": svc["model"], "ttft_ms": svc["ttft_p50_ms"], "tps": svc["tps"]},
				"guardrail": map[string]interface{}{"enabled": true, "block_rate": 2.1, "latency_ms": 8},
			})
		case "guardrail":
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"service_id": svcID, "enabled": true,
				"policies": []map[string]interface{}{
					{"name": "PII Detection", "type": "pii", "action": "mask", "triggered_24h": 45},
					{"name": "SQL Injection", "type": "injection", "action": "block", "triggered_24h": 3},
					{"name": "Prompt Injection", "type": "prompt_injection", "action": "block", "triggered_24h": 12},
					{"name": "Toxicity Filter", "type": "toxicity", "action": "block", "triggered_24h": 7},
				},
				"total_blocked_24h": 67, "total_requests_24h": svc["request_count_24h"],
				"block_rate": 2.1,
			})
		default:
			writeJSON(w, http.StatusOK, svc)
		}
	})

	mux.HandleFunc("GET /api/v1/ai/gpu", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": []map[string]interface{}{
				{
					"gpu_id": "gpu-0", "name": "NVIDIA A100 80GB", "host": "gpu-node-01",
					"utilization_pct": 78.5, "memory_used_mb": 65536, "memory_total_mb": 81920,
					"temperature_c": 72, "power_w": 285, "power_limit_w": 400,
					"sm_clock_mhz": 1410, "mem_clock_mhz": 1593,
					"processes": []map[string]interface{}{
						{"pid": 12345, "name": "vllm-worker", "memory_mb": 42000},
						{"pid": 12346, "name": "embedding-svc", "memory_mb": 18000},
					},
				},
				{
					"gpu_id": "gpu-1", "name": "NVIDIA A100 80GB", "host": "gpu-node-01",
					"utilization_pct": 45.2, "memory_used_mb": 40960, "memory_total_mb": 81920,
					"temperature_c": 65, "power_w": 220, "power_limit_w": 400,
					"sm_clock_mhz": 1410, "mem_clock_mhz": 1593,
					"processes": []map[string]interface{}{
						{"pid": 22345, "name": "training-job-7", "memory_mb": 38000},
					},
				},
				{
					"gpu_id": "gpu-2", "name": "NVIDIA H100 80GB", "host": "gpu-node-02",
					"utilization_pct": 92.1, "memory_used_mb": 74752, "memory_total_mb": 81920,
					"temperature_c": 79, "power_w": 650, "power_limit_w": 700,
					"sm_clock_mhz": 1980, "mem_clock_mhz": 2619,
					"processes": []map[string]interface{}{
						{"pid": 33456, "name": "vllm-worker", "memory_mb": 72000},
					},
				},
			},
			"total": 3,
			"summary": map[string]interface{}{
				"total_gpus": 3, "avg_utilization_pct": 71.9,
				"total_memory_mb": 245760, "used_memory_mb": 181248,
			},
		})
	})

	// ── Diagnostics API (/api/v1/diagnostics/*) ──────────────────────────────

	mux.HandleFunc("POST /api/v1/diagnostics/trigger", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentID string `json:"agent_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AgentID == "" {
			http.Error(w, "agent_id required", http.StatusBadRequest)
			return
		}
		runID := fmt.Sprintf("diag-%d", time.Now().UnixMilli())
		logger.Info("diagnostic triggered", "agent_id", body.AgentID, "run_id", runID)
		bus.Publish(eventbus.Event{
			Type:      "diagnostic.started",
			Timestamp: time.Now().UTC(),
			AgentID:   body.AgentID,
			Data:      map[string]interface{}{"run_id": runID},
		})
		writeJSON(w, http.StatusAccepted, map[string]interface{}{
			"run_id": runID, "agent_id": body.AgentID, "status": "started",
			"started_at": time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /api/v1/diagnostics/runs", func(w http.ResponseWriter, r *http.Request) {
		agentFilter := r.URL.Query().Get("agent")
		items := []map[string]interface{}{
			{"run_id": "diag-001", "agent_id": "agent-01", "status": "completed", "total_checks": 86, "passed": 82, "failed": 3, "warnings": 1, "started_at": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339), "completed_at": time.Now().Add(-2*time.Hour + 45*time.Second).UTC().Format(time.RFC3339)},
			{"run_id": "diag-002", "agent_id": "agent-02", "status": "completed", "total_checks": 86, "passed": 85, "failed": 0, "warnings": 1, "started_at": time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339), "completed_at": time.Now().Add(-1*time.Hour + 38*time.Second).UTC().Format(time.RFC3339)},
			{"run_id": "diag-003", "agent_id": "agent-01", "status": "running", "total_checks": 86, "passed": 40, "failed": 0, "warnings": 0, "started_at": time.Now().Add(-30 * time.Second).UTC().Format(time.RFC3339)},
		}
		if agentFilter != "" {
			filtered := make([]map[string]interface{}, 0)
			for _, item := range items {
				if item["agent_id"] == agentFilter {
					filtered = append(filtered, item)
				}
			}
			items = filtered
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "total": len(items)})
	})

	mux.HandleFunc("GET /api/v1/diagnostics/runs/", func(w http.ResponseWriter, r *http.Request) {
		runID := r.URL.Path[len("/api/v1/diagnostics/runs/"):]
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"run_id": runID, "agent_id": "agent-01", "status": "completed",
			"total_checks": 86, "passed": 82, "failed": 3, "warnings": 1,
			"started_at":   time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
			"completed_at": time.Now().Add(-2*time.Hour + 45*time.Second).UTC().Format(time.RFC3339),
			"categories": []map[string]interface{}{
				{"name": "OS", "total": 15, "passed": 15, "failed": 0},
				{"name": "Network", "total": 12, "passed": 11, "failed": 1},
				{"name": "Storage", "total": 10, "passed": 10, "failed": 0},
				{"name": "Security", "total": 14, "passed": 12, "failed": 2},
				{"name": "Performance", "total": 18, "passed": 17, "failed": 0},
				{"name": "AI/LLM", "total": 17, "passed": 17, "failed": 0},
			},
		})
	})

	// ── Multi-Cloud API (Phase 23-1) ─────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/cloud/costs", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"provider": "aws", "totalCost": 12450, "computeCost": 8200, "storageCost": 2800, "networkCost": 1450, "trend": 3.2},
			{"provider": "gcp", "totalCost": 8320, "computeCost": 5100, "storageCost": 1900, "networkCost": 1320, "trend": -1.5},
			{"provider": "azure", "totalCost": 5680, "computeCost": 3400, "storageCost": 1200, "networkCost": 1080, "trend": 8.4},
		}})
	})

	mux.HandleFunc("GET /api/v1/cloud/resources", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "cr-01", "provider": "aws", "type": "EC2 (g5.2xlarge)", "name": "gpu-inference-01", "region": "us-east-1", "status": "running", "monthlyCost": 2400},
			{"id": "cr-02", "provider": "gcp", "type": "GCE (a2-highgpu-1g)", "name": "training-node-01", "region": "us-central1", "status": "running", "monthlyCost": 3200},
			{"id": "cr-03", "provider": "azure", "type": "VM (NC6s_v3)", "name": "finetune-worker-01", "region": "eastus", "status": "running", "monthlyCost": 1900},
		}})
	})

	// ── Pipeline API (Phase 23-3) ────────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/pipelines", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "pipe-01", "name": "daily-embedding-refresh", "orchestrator": "airflow", "status": "running", "totalTasks": 6, "completedTasks": 4, "successRate": 96.5},
			{"id": "pipe-02", "name": "model-evaluation-suite", "orchestrator": "prefect", "status": "success", "totalTasks": 4, "completedTasks": 4, "successRate": 100},
			{"id": "pipe-03", "name": "guardrail-dataset-update", "orchestrator": "dagster", "status": "failed", "totalTasks": 5, "completedTasks": 3, "successRate": 87.3},
		}})
	})

	mux.HandleFunc("GET /api/v1/pipelines/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"id": "pipe-01", "name": "daily-embedding-refresh", "status": "running"})
	})

	// ── Business KPI API (Phase 23-4) ────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/business/kpis", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "bk-01", "name": "Revenue Impact", "value": 285000, "unit": "$/month", "trend": 12.5, "category": "revenue"},
			{"id": "bk-02", "name": "Conversion Rate", "value": 4.2, "unit": "%", "trend": 0.8, "category": "conversion"},
			{"id": "bk-03", "name": "AI ROI", "value": 340, "unit": "%", "trend": 25, "category": "efficiency"},
			{"id": "bk-04", "name": "Cost per Transaction", "value": 0.023, "unit": "$", "trend": -8.5, "category": "efficiency"},
		}})
	})

	mux.HandleFunc("GET /api/v1/business/correlation", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"aiMetric": 0.8, "bizMetric": 4.5, "label": "rag-service"},
			{"aiMetric": 1.2, "bizMetric": 4.2, "label": "chatbot-v2"},
			{"aiMetric": 2.5, "bizMetric": 2.8, "label": "code-assistant"},
		}})
	})

	mux.HandleFunc("GET /api/v1/business/roi", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"category": "RAG Service", "investment": 8500, "revenue": 42000, "savings": 12000, "roi": 535},
			{"category": "Chatbot v2", "investment": 5200, "revenue": 28000, "savings": 8500, "roi": 601},
			{"category": "Guardrail", "investment": 2100, "revenue": 0, "savings": 18000, "roi": 757},
		}})
	})

	// ── Marketplace API (Phase 23-5) ─────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/marketplace", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "mp-01", "name": "GPU Cluster Dashboard", "type": "dashboard", "author": "AITOP Team", "downloads": 1240, "rating": 4.8, "featured": true},
			{"id": "mp-02", "name": "RAG Quality Prompts", "type": "prompt", "author": "AI Lab", "downloads": 890, "rating": 4.6, "featured": true},
			{"id": "mp-03", "name": "Cost Anomaly Detector", "type": "plugin", "author": "CloudOps", "downloads": 560, "rating": 4.3, "featured": false},
			{"id": "mp-04", "name": "Incident Runbook", "type": "notebook", "author": "SRE Guild", "downloads": 720, "rating": 4.7, "featured": true},
		}})
	})

	mux.HandleFunc("POST /api/v1/marketplace", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["id"] = fmt.Sprintf("mp-%d", time.Now().UnixMilli())
		writeJSON(w, http.StatusCreated, body)
	})

	// ── AI Copilot API (Phase 22-1) ──────────────────────────────────────────

	mux.HandleFunc("POST /api/v1/copilot/chat", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Message string `json:"message"` }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"response": map[string]interface{}{
				"id": fmt.Sprintf("msg-%d", time.Now().UnixMilli()), "role": "assistant",
				"content": "Based on the current metrics, the TTFT P95 for rag-service is 1.8s (SLO: <2s). GPU utilization is at 72% across the cluster.", "timestamp": time.Now().UnixMilli(),
				"promql": `histogram_quantile(0.95, rate(llm_ttft_seconds_bucket{service="rag-service"}[5m]))`,
				"suggestions": []string{"Show GPU trend", "Compare with last week", "Check error rate"},
			},
		})
	})

	mux.HandleFunc("GET /api/v1/copilot/suggestions", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "cs-1", "text": "TTFT가 높은 서비스는?", "category": "performance"},
			{"id": "cs-2", "text": "GPU 사용률 추이를 보여줘", "category": "gpu"},
			{"id": "cs-3", "text": "에러율이 가장 높은 엔드포인트", "category": "reliability"},
			{"id": "cs-4", "text": "지난 1시간 비용 분석", "category": "cost"},
		}})
	})

	mux.HandleFunc("POST /api/v1/copilot/query", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Query string `json:"query"` }
		_ = json.NewDecoder(r.Body).Decode(&body)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"promql": `histogram_quantile(0.95, rate(llm_ttft_seconds_bucket[5m]))`,
			"data":   map[string]interface{}{"series": []map[string]interface{}{{"label": "rag-service", "values": []float64{1.2, 1.5, 1.8, 1.4, 1.6}}}},
		})
	})

	// ── Topology API (Phase 22-2) ────────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/topology", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"nodes": []map[string]interface{}{
				{"id": "api-gateway", "name": "api-gateway", "layer": "ui", "status": "healthy", "rpm": 3200, "errorRate": 0.3, "p95": 120},
				{"id": "rag-service", "name": "rag-service", "layer": "agent", "status": "warning", "rpm": 450, "errorRate": 1.2, "p95": 1800},
				{"id": "vllm", "name": "vLLM Inference", "layer": "llm", "status": "healthy", "rpm": 200, "errorRate": 0.5, "p95": 1200},
				{"id": "redis", "name": "Redis", "layer": "data", "status": "healthy", "rpm": 4000, "errorRate": 0.0, "p95": 1},
			},
			"edges": []map[string]interface{}{
				{"source": "api-gateway", "target": "rag-service", "rpm": 450, "protocol": "http", "isNew": false},
				{"source": "rag-service", "target": "vllm", "rpm": 200, "protocol": "http", "isNew": false},
				{"source": "rag-service", "target": "redis", "rpm": 120, "protocol": "redis", "isNew": true},
			},
			"lastScanAt": time.Now().UnixMilli(), "totalConnections": 3,
		})
	})

	mux.HandleFunc("GET /api/v1/topology/changes", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "tc-1", "timestamp": time.Now().Add(-1 * time.Hour).UnixMilli(), "type": "connection_added", "sourceService": "rag-service", "targetService": "redis", "protocol": "redis", "description": "New Redis cache connection detected"},
			{"id": "tc-2", "timestamp": time.Now().Add(-24 * time.Hour).UnixMilli(), "type": "connection_removed", "sourceService": "guardrail", "targetService": "postgres", "protocol": "sql", "description": "SQL connection no longer active"},
		}})
	})

	// ── Training API (Phase 22-3) ────────────────────────────────────────────

	mux.HandleFunc("GET /api/v1/training/jobs", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "train-001", "name": "chatbot-finetune-v2", "baseModel": "GPT-4-Turbo", "dataset": "customer-support-50k", "status": "running", "currentEpoch": 7, "totalEpochs": 10, "trainLoss": 0.42, "valAccuracy": 86.2, "gpuUtilization": 94},
			{"id": "train-002", "name": "rag-embedding-retrain", "baseModel": "text-embedding-3-large", "dataset": "docs-120k", "status": "completed", "currentEpoch": 5, "totalEpochs": 5, "trainLoss": 0.18, "valAccuracy": 92.8, "gpuUtilization": 89},
		}})
	})

	mux.HandleFunc("GET /api/v1/training/jobs/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/training/jobs/")
		parts := strings.Split(path, "/")

		if len(parts) >= 2 && parts[1] == "checkpoints" {
			if len(parts) >= 4 && parts[3] == "deploy" {
				writeJSON(w, http.StatusOK, map[string]string{"status": "deployed"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
				{"id": "cp-1", "epoch": 1, "trainLoss": 2.1, "valLoss": 2.3, "valAccuracy": 35.2, "deployed": false},
				{"id": "cp-7", "epoch": 7, "trainLoss": 0.42, "valLoss": 0.48, "valAccuracy": 86.2, "deployed": false},
			}})
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id": parts[0], "name": "chatbot-finetune-v2", "status": "running", "currentEpoch": 7, "totalEpochs": 10,
		})
	})

	// ── Terraform Resource CRUD API (Phase 21-2) ────────────────────────────

	// Alert Policies CRUD
	mux.HandleFunc("GET /api/v1/alerts/policies", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoAlertPolicies(), "total": 3})
	})
	mux.HandleFunc("POST /api/v1/alerts/policies", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}
		body["policy_id"] = fmt.Sprintf("pol-%d", time.Now().UnixMilli())
		body["created_at"] = time.Now().UTC().Format(time.RFC3339)
		body["updated_at"] = body["created_at"]
		writeJSON(w, http.StatusCreated, body)
	})
	mux.HandleFunc("GET /api/v1/alerts/policies/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/v1/alerts/policies/")
		policies := demoAlertPolicies()
		for _, p := range policies {
			if p["policy_id"] == id {
				writeJSON(w, http.StatusOK, p)
				return
			}
		}
		http.Error(w, `{"message":"not found"}`, http.StatusNotFound)
	})
	mux.HandleFunc("PUT /api/v1/alerts/policies/", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["updated_at"] = time.Now().UTC().Format(time.RFC3339)
		writeJSON(w, http.StatusOK, body)
	})
	mux.HandleFunc("DELETE /api/v1/alerts/policies/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// SLO CRUD
	mux.HandleFunc("GET /api/v1/slo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoSLOs(), "total": 3})
	})
	mux.HandleFunc("POST /api/v1/slo", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["slo_id"] = fmt.Sprintf("slo-%d", time.Now().UnixMilli())
		writeJSON(w, http.StatusCreated, body)
	})
	mux.HandleFunc("GET /api/v1/slo/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/v1/slo/")
		for _, s := range demoSLOs() {
			if s["slo_id"] == id {
				writeJSON(w, http.StatusOK, s)
				return
			}
		}
		http.Error(w, `{"message":"not found"}`, http.StatusNotFound)
	})
	mux.HandleFunc("PUT /api/v1/slo/", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		writeJSON(w, http.StatusOK, body)
	})
	mux.HandleFunc("DELETE /api/v1/slo/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// Dashboards CRUD
	mux.HandleFunc("GET /api/v1/dashboards", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"dashboard_id": "dash-001", "name": "Service Overview", "description": "High-level service health", "managed_by": "ui"},
			{"dashboard_id": "dash-002", "name": "GPU Cluster", "description": "GPU utilization dashboard", "managed_by": "terraform"},
		}, "total": 2})
	})
	mux.HandleFunc("POST /api/v1/dashboards", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["dashboard_id"] = fmt.Sprintf("dash-%d", time.Now().UnixMilli())
		writeJSON(w, http.StatusCreated, body)
	})
	mux.HandleFunc("GET /api/v1/dashboards/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"dashboard_id": "dash-001", "name": "Service Overview"})
	})
	mux.HandleFunc("PUT /api/v1/dashboards/", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		writeJSON(w, http.StatusOK, body)
	})
	mux.HandleFunc("DELETE /api/v1/dashboards/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// Notification Channels CRUD
	mux.HandleFunc("GET /api/v1/alerts/channels", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"channel_id": "ch-001", "name": "#ops-alerts", "type": "slack", "enabled": true},
			{"channel_id": "ch-002", "name": "SRE Team", "type": "email", "enabled": true},
			{"channel_id": "ch-003", "name": "PagerDuty", "type": "pagerduty", "enabled": true},
		}, "total": 3})
	})
	mux.HandleFunc("POST /api/v1/alerts/channels", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["channel_id"] = fmt.Sprintf("ch-%d", time.Now().UnixMilli())
		writeJSON(w, http.StatusCreated, body)
	})
	mux.HandleFunc("GET /api/v1/alerts/channels/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"channel_id": "ch-001", "name": "#ops-alerts", "type": "slack"})
	})
	mux.HandleFunc("PUT /api/v1/alerts/channels/", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		writeJSON(w, http.StatusOK, body)
	})
	mux.HandleFunc("DELETE /api/v1/alerts/channels/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// API Keys CRUD (admin only)
	mux.HandleFunc("GET /api/v1/settings/api-keys", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"key_id": "key-001", "key_prefix": "aitop_pr", "name": "Production Admin", "role": "admin"},
			{"key_id": "key-002", "key_prefix": "aitop_ci", "name": "CI Pipeline", "role": "sre"},
			{"key_id": "key-003", "key_prefix": "aitop_tf", "name": "Terraform Provider", "role": "admin"},
		}, "total": 3})
	})
	mux.HandleFunc("POST /api/v1/settings/api-keys", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		keyID := fmt.Sprintf("key-%d", time.Now().UnixMilli())
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"key_id":  keyID,
			"api_key": fmt.Sprintf("aitop_%s_%s", body["role"], keyID),
			"name":    body["name"],
			"role":    body["role"],
		})
	})
	mux.HandleFunc("DELETE /api/v1/settings/api-keys/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// SSO Settings API (Phase 21-3)
	mux.HandleFunc("GET /api/v1/auth/sso/providers", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "sso-okta", "name": "Okta", "protocol": "oidc", "enabled": true, "buttonLabel": "Sign in with Okta"},
			{"id": "sso-azure", "name": "Azure AD", "protocol": "oidc", "enabled": true, "buttonLabel": "Sign in with Microsoft"},
			{"id": "sso-google", "name": "Google Workspace", "protocol": "oidc", "enabled": false, "buttonLabel": "Sign in with Google"},
		}})
	})
	mux.HandleFunc("GET /api/v1/auth/sso/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/auth/sso/")
		if strings.HasSuffix(path, "/login") {
			// SSO login initiation — in production, redirect to IdP
			writeJSON(w, http.StatusOK, map[string]string{"status": "redirect_to_idp", "message": "SSO login would redirect to IdP in production"})
			return
		}
		if strings.HasSuffix(path, "/callback") {
			writeJSON(w, http.StatusOK, map[string]string{"status": "callback_received", "message": "OIDC callback handler"})
			return
		}
		if strings.HasSuffix(path, "/metadata") {
			w.Header().Set("Content-Type", "application/xml")
			_, _ = w.Write([]byte(`<?xml version="1.0"?><EntityDescriptor entityID="aitop-monitoring"/>`))
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/v1/auth/sso/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/auth/sso/")
		if strings.HasSuffix(path, "/acs") {
			writeJSON(w, http.StatusOK, map[string]string{"status": "saml_acs_received", "message": "SAML ACS handler"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/v1/settings/sso", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []map[string]interface{}{
			{"id": "sso-okta", "name": "Okta", "protocol": "oidc", "enabled": true, "oidc_issuer": "https://dev-123456.okta.com", "oidc_client_id": "0oa1234567890", "default_role": "viewer", "auto_provision": true},
			{"id": "sso-azure", "name": "Azure AD", "protocol": "oidc", "enabled": true, "oidc_issuer": "https://login.microsoftonline.com/tenant-id/v2.0", "oidc_client_id": "app-client-id", "default_role": "viewer", "auto_provision": true},
		}})
	})
	mux.HandleFunc("POST /api/v1/settings/sso", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["id"] = fmt.Sprintf("sso-%d", time.Now().UnixMilli())
		writeJSON(w, http.StatusCreated, body)
	})
	mux.HandleFunc("PUT /api/v1/settings/sso/", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		writeJSON(w, http.StatusOK, body)
	})
	mux.HandleFunc("DELETE /api/v1/settings/sso/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// ── Profiling API (Phase 21-1: Continuous Profiling) ─────────────────────

	mux.HandleFunc("POST /api/v1/profiles", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.Header.Get("X-Agent-ID")
		if agentID == "" {
			agentID = "unknown"
		}
		var body struct {
			ServiceName string            `json:"service_name"`
			Language    string            `json:"language"`
			ProfileType string            `json:"profile_type"`
			Format      string            `json:"format"`
			DurationSec int               `json:"duration_sec"`
			SampleCount int               `json:"sample_count"`
			SizeBytes   int64             `json:"size_bytes"`
			Labels      map[string]string `json:"labels"`
			TraceID     string            `json:"trace_id"`
			SpanID      string            `json:"span_id"`
			StartedAt   string            `json:"started_at"`
			EndedAt     string            `json:"ended_at"`
			DataBase64  string            `json:"data_base64"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}

		profileID := fmt.Sprintf("prof-%s-%d", agentID, time.Now().UnixMilli())
		startedAt, _ := time.Parse(time.RFC3339, body.StartedAt)
		endedAt, _ := time.Parse(time.RFC3339, body.EndedAt)
		if startedAt.IsZero() {
			startedAt = time.Now().UTC()
		}
		if endedAt.IsZero() {
			endedAt = startedAt.Add(time.Duration(body.DurationSec) * time.Second)
		}

		s3Key := storage.ProfileKey(agentID, body.ServiceName, profileID, startedAt)

		// Store profile data in storage backend
		if store != nil && body.DataBase64 != "" {
			ref, err := store.Put(r.Context(), s3Key, []byte(body.DataBase64), map[string]string{
				"language":     body.Language,
				"profile_type": body.ProfileType,
				"format":       body.Format,
			})
			if err != nil {
				logger.Error("store profile failed", "error", err)
			} else {
				logger.Info("profile stored", "key", s3Key, "ref", ref)
			}
		}

		logger.Info("profile uploaded", "id", profileID, "agent", agentID, "service", body.ServiceName, "type", body.ProfileType)
		bus.Publish(eventbus.Event{Type: "profile.uploaded", AgentID: agentID, Data: map[string]interface{}{"profile_id": profileID}})

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"profile_id": profileID,
			"s3_key":     s3Key,
			"status":     "uploaded",
		})
	})

	mux.HandleFunc("GET /api/v1/profiles", func(w http.ResponseWriter, r *http.Request) {
		// Return demo profiles for MVP (DB integration in production)
		q := r.URL.Query()
		profiles := generateDemoProfiles(q.Get("service"), q.Get("language"), q.Get("type"))
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": profiles, "total": len(profiles)})
	})

	mux.HandleFunc("GET /api/v1/profiles/compare", func(w http.ResponseWriter, r *http.Request) {
		baseID := r.URL.Query().Get("base")
		targetID := r.URL.Query().Get("target")
		if baseID == "" || targetID == "" {
			http.Error(w, `{"message":"base and target query params required"}`, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"base_profile_id":   baseID,
			"target_profile_id": targetID,
			"root": map[string]interface{}{
				"name": "root", "baseValue": 10000, "targetValue": 12000, "delta": 2000,
				"children": []map[string]interface{}{
					{"name": "main.handleRequest", "baseValue": 5000, "targetValue": 7000, "delta": 2000, "children": []interface{}{}},
					{"name": "runtime.gcBgMarkWorker", "baseValue": 3000, "targetValue": 2500, "delta": -500, "children": []interface{}{}},
				},
			},
		})
	})

	mux.HandleFunc("GET /api/v1/profiles/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/profiles/")
		parts := strings.Split(path, "/")
		profileID := parts[0]

		if len(parts) > 1 && parts[1] == "flamegraph" {
			// Return demo flame graph
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"profileId": profileID, "profileType": "cpu", "language": "go",
				"serviceName": "api-gateway", "totalSamples": 15420, "durationSec": 30,
				"root": map[string]interface{}{
					"name": "root", "fullName": "root", "value": 15420, "selfValue": 0,
					"children": []map[string]interface{}{
						{"name": "main.main", "fullName": "main.main", "value": 12000, "selfValue": 200,
							"children": []map[string]interface{}{
								{"name": "net/http.(*Server).Serve", "fullName": "net/http.(*Server).Serve", "value": 9800, "selfValue": 150,
									"children": []map[string]interface{}{
										{"name": "net/http.(*conn).serve", "fullName": "net/http.(*conn).serve", "value": 9000, "selfValue": 800,
											"children": []map[string]interface{}{
												{"name": "main.handleRequest", "fullName": "main.handleRequest", "value": 5200, "selfValue": 1200, "children": []interface{}{}},
												{"name": "encoding/json.Marshal", "fullName": "encoding/json.Marshal", "value": 2000, "selfValue": 2000, "children": []interface{}{}},
												{"name": "database/sql.(*DB).Query", "fullName": "database/sql.(*DB).Query", "value": 1000, "selfValue": 1000, "children": []interface{}{}},
											}},
									}},
							}},
						{"name": "runtime.gcBgMarkWorker", "fullName": "runtime.gcBgMarkWorker", "value": 2420, "selfValue": 2420, "children": []interface{}{}},
						{"name": "runtime.mcall", "fullName": "runtime.mcall", "value": 1000, "selfValue": 1000, "children": []interface{}{}},
					},
				},
			})
			return
		}

		if len(parts) > 1 && parts[1] == "raw" {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pb.gz"`, profileID))
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("# pprof binary data placeholder"))
			return
		}

		// Profile metadata
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"profile_id": profileID, "agent_id": "agent-01", "service_name": "api-gateway",
			"language": "go", "profile_type": "cpu", "format": "pprof",
			"duration_sec": 30, "sample_count": 15420, "size_bytes": 245760,
			"started_at": time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339),
			"ended_at":   time.Now().Add(-9*time.Minute - 30*time.Second).UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /api/v1/traces/{traceId}/profiles", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": []map[string]interface{}{
				{
					"profile_id": "prof-trace-001", "service_name": "api-gateway",
					"language": "go", "profile_type": "cpu", "duration_sec": 30,
					"started_at": time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339),
				},
			},
		})
	})

	// ── SSE (Server-Sent Events) real-time stream ───────────────────────────
	// Frontend connects: new EventSource('/api/v1/events?channel=fleet&channel=collect')
	if wsHub != nil {
		mux.HandleFunc("GET /api/v1/events", wsHub.SSEHandler())
	}

	// ── Central Plugin Deployment API (Phase 33) ────────────────────────────
	pluginReg := newPluginRegistry()
	registerPluginRoutes(mux, pluginReg, f)
	// Background tickers for scheduled/staged deploys — stopped when the
	// server's context is cancelled (process exit via signal).
	pluginStopCh := make(chan struct{})
	pluginReg.startScheduledDeployTicker(pluginStopCh)
	pluginReg.startStagedDeployTicker(pluginStopCh)
	// pluginStopCh is closed on server shutdown (see main).

	// ── Runtime Attach API (Phase 34) ─────────────────────────────────────────
	attachReg := newAttachRegistry()
	registerAttachRoutes(mux, attachReg)

	// ── Batch Process Monitoring API (Phase 36) ──────────────────────────────
	registerBatchRoutes(mux)

	// ── Batch Runtime Profiling API (Phase 37) ───────────────────────────────
	registerBatchProfilingRoutes(mux)

	// ── Batch Alert Rules API (Phase 38) ─────────────────────────────────────
	registerBatchAlertRoutes(mux)

	// ── Virtual Thread Monitoring API (Phase 39) ──────────────────────────────
	registerVirtualThreadRoutes(mux)

	// ── perf/eBPF Flamegraph API (Phase 35) ──────────────────────────────────
	registerFlamegraphRoutes(mux, store)

	// ── Phase 40: 출시 전 Critical 기능 API ──────────────────────────────────
	registerPhase40Routes(mux)

	// ── Phase 41-3: 실데이터 프록시 API (Prometheus + Jaeger + Agent 집계) ──
	registerProxyRoutes(mux, f)

	// ── Evidence API (Phase 31-2d/31-3a) ─────────────────────────────────────
	// In-memory store for uploaded evidence bundles (keyed by run_id).
	evidenceStore := newEvidenceStore()

	// POST /api/v1/evidence/upload — agent uploads a ZIP bundle (Phase 31-2d).
	mux.HandleFunc("POST /api/v1/evidence/upload", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.Header.Get("X-Agent-ID")
		if agentID == "" {
			agentID = "unknown"
		}
		// Limit upload size to 32 MiB.
		r.Body = http.MaxBytesReader(w, r.Body, 32*1024*1024)
		data, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "body read error", http.StatusBadRequest)
			return
		}
		runID := fmt.Sprintf("diag-%s-%d", agentID, time.Now().UnixMilli())
		evidenceStore.store(runID, agentID, data)
		slog.Info("evidence bundle received",
			"agent_id", agentID,
			"run_id", runID,
			"bytes", len(data),
		)
		writeJSON(w, http.StatusAccepted, map[string]string{
			"run_id": runID,
			"status": "accepted",
		})
	})

	// GET /api/v1/evidence — list all received bundles (Fleet view, Phase 31-2f).
	mux.HandleFunc("GET /api/v1/evidence", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.URL.Query().Get("agent_id")
		writeJSON(w, http.StatusOK, evidenceStore.list(agentID))
	})

	// GET /api/v1/evidence/{run_id} — get a specific bundle metadata.
	mux.HandleFunc("GET /api/v1/evidence/", func(w http.ResponseWriter, r *http.Request) {
		runID := r.URL.Path[len("/api/v1/evidence/"):]
		if runID == "" {
			http.Error(w, "missing run_id", http.StatusBadRequest)
			return
		}
		rec, ok := evidenceStore.get(runID)
		if !ok {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, rec)
	})

	// ── Health endpoints ─────────────────────────────────────────────────────
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]string{"status": "ok", "version": version.Full()}
		if store != nil {
			resp["storage"] = store.Type()
			if err := store.Health(r.Context()); err != nil {
				resp["storage_health"] = err.Error()
			} else {
				resp["storage_health"] = "ok"
			}
		}
		writeJSON(w, http.StatusOK, resp)
	}
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /health", healthHandler)

	return mux
}

// demoAlertPolicies returns demo alert policies for the MVP.
func demoAlertPolicies() []map[string]interface{} {
	return []map[string]interface{}{
		{"policy_id": "pol-001", "name": "High Error Rate", "severity": "critical", "target": "service:api-gateway", "condition_type": "metric", "condition": "error_rate > 5%", "threshold_type": "static", "enabled": true, "managed_by": "ui"},
		{"policy_id": "pol-002", "name": "GPU VRAM Critical", "severity": "critical", "target": "host:gpu-*", "condition_type": "metric", "condition": "gpu_vram_usage > 95%", "threshold_type": "static", "enabled": true, "managed_by": "terraform"},
		{"policy_id": "pol-003", "name": "LLM TTFT High", "severity": "warning", "target": "service:rag-*", "condition_type": "metric", "condition": "ttft_p95 > 2000ms", "threshold_type": "dynamic", "enabled": true, "managed_by": "ui"},
	}
}

// demoSLOs returns demo SLO definitions for the MVP.
func demoSLOs() []map[string]interface{} {
	return []map[string]interface{}{
		{"slo_id": "slo-001", "name": "API P99 Latency", "service": "api-gateway", "sli": "latency_p99 < 500ms", "target": 99.9, "window": "30d", "managed_by": "terraform"},
		{"slo_id": "slo-002", "name": "RAG Availability", "service": "rag-service", "sli": "availability >= 99.5%", "target": 99.5, "window": "30d", "managed_by": "ui"},
		{"slo_id": "slo-003", "name": "GPU Uptime", "service": "gpu-cluster", "sli": "uptime >= 99.9%", "target": 99.9, "window": "7d", "managed_by": "terraform"},
	}
}

// generateDemoProfiles returns demo profiling data for the MVP.
func generateDemoProfiles(service, language, profileType string) []map[string]interface{} {
	demos := []map[string]interface{}{
		{"profile_id": "prof-001", "agent_id": "agent-01", "service_name": "api-gateway", "language": "go", "profile_type": "cpu", "format": "pprof", "duration_sec": 30, "sample_count": 15420, "size_bytes": 245760, "started_at": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-002", "agent_id": "agent-01", "service_name": "api-gateway", "language": "go", "profile_type": "memory", "format": "pprof", "duration_sec": 0, "sample_count": 8230, "size_bytes": 189440, "started_at": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-003", "agent_id": "agent-02", "service_name": "rag-service", "language": "python", "profile_type": "cpu", "format": "collapsed", "duration_sec": 30, "sample_count": 22100, "size_bytes": 312000, "started_at": time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-004", "agent_id": "agent-02", "service_name": "rag-service", "language": "python", "profile_type": "memory", "format": "collapsed", "duration_sec": 0, "sample_count": 5600, "size_bytes": 98000, "started_at": time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-005", "agent_id": "agent-03", "service_name": "payment-api", "language": "java", "profile_type": "cpu", "format": "jfr", "duration_sec": 60, "sample_count": 45000, "size_bytes": 524288, "started_at": time.Now().Add(-30 * time.Minute).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-006", "agent_id": "agent-03", "service_name": "payment-api", "language": "java", "profile_type": "memory", "format": "jfr", "duration_sec": 60, "sample_count": 18000, "size_bytes": 312000, "started_at": time.Now().Add(-30 * time.Minute).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-007", "agent_id": "agent-04", "service_name": "auth-service", "language": "go", "profile_type": "goroutine", "format": "pprof", "duration_sec": 0, "sample_count": 342, "size_bytes": 45000, "started_at": time.Now().Add(-15 * time.Minute).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-008", "agent_id": "agent-05", "service_name": "ml-inference", "language": "python", "profile_type": "cpu", "format": "collapsed", "duration_sec": 30, "sample_count": 31000, "size_bytes": 420000, "started_at": time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-009", "agent_id": "agent-03", "service_name": "order-service", "language": "java", "profile_type": "thread", "format": "jfr", "duration_sec": 30, "sample_count": 12500, "size_bytes": 198000, "started_at": time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339)},
		{"profile_id": "prof-010", "agent_id": "agent-01", "service_name": "api-gateway", "language": "go", "profile_type": "cpu", "format": "pprof", "duration_sec": 30, "sample_count": 16200, "size_bytes": 256000, "trace_id": "abc123def456", "started_at": time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339)},
	}

	var filtered []map[string]interface{}
	for _, p := range demos {
		if service != "" && p["service_name"] != service {
			continue
		}
		if language != "" && p["language"] != language {
			continue
		}
		if profileType != "" && p["profile_type"] != profileType {
			continue
		}
		filtered = append(filtered, p)
	}
	if filtered == nil {
		return demos
	}
	return filtered
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envOrDefaultInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// ── Evidence Store (Phase 31-2d/2e/2f) ───────────────────────────────────────

// evidenceRecord holds metadata and raw ZIP bytes for a received evidence bundle.
type evidenceRecord struct {
	RunID     string    `json:"run_id"`
	AgentID   string    `json:"agent_id"`
	ReceivedAt time.Time `json:"received_at"`
	Bytes     int       `json:"bytes"`
}

type evidenceBundleStore struct {
	mu      sync.RWMutex
	records []*evidenceRecord
}

func newEvidenceStore() *evidenceBundleStore {
	return &evidenceBundleStore{}
}

func (s *evidenceBundleStore) store(runID, agentID string, data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.records = append(s.records, &evidenceRecord{
		RunID:      runID,
		AgentID:    agentID,
		ReceivedAt: time.Now().UTC(),
		Bytes:      len(data),
	})
}

func (s *evidenceBundleStore) list(agentID string) []*evidenceRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*evidenceRecord
	for _, r := range s.records {
		if agentID == "" || r.AgentID == agentID {
			out = append(out, r)
		}
	}
	return out
}

func (s *evidenceBundleStore) get(runID string) (*evidenceRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, r := range s.records {
		if r.RunID == runID {
			return r, true
		}
	}
	return nil, false
}
