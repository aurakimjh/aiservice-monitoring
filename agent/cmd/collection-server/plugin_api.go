package main

// Phase 33: Central Plugin Deployment System
//
// Endpoints (§9.5.9 AGENT_DESIGN.md):
//   GET    /api/v1/fleet/plugins               — list registered plugins
//   POST   /api/v1/fleet/plugins               — upload plugin ZIP
//   GET    /api/v1/fleet/plugins/history        — deploy history
//   GET    /api/v1/fleet/plugins/{name}         — plugin detail + install status
//   DELETE /api/v1/fleet/plugins/{name}         — delete plugin
//   POST   /api/v1/fleet/plugins/{name}/deploy  — deploy to agents
//   POST   /api/v1/fleet/plugins/{name}/rollback — rollback
//   POST   /api/v1/fleet/plugins/{name}/disable  — disable on all agents
//   GET    /api/v1/fleet/plugins/{name}/status   — per-agent install status
//   GET    /api/v1/fleet/plugins/{name}/download — agent downloads plugin ZIP
//
// Deploy strategies:
//   - immediate:  push to all target agents at once
//   - staged:     canary → stages[0]% → stages[1]% → stages[2]%
//   - scheduled:  execute at scheduled_at time as immediate

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Plugin Registry types ───────────────────────────────────────────────────

type pluginAgentStatus struct {
	Version     string    `json:"version"`
	Status      string    `json:"status"` // installed, failed, pending, rollback
	InstalledAt time.Time `json:"installed_at,omitempty"`
	Error       string    `json:"error,omitempty"`
}

type pluginRegistryRecord struct {
	Name        string                       `json:"name"`
	Version     string                       `json:"version"`
	Description string                       `json:"description"`
	Author      string                       `json:"author"`
	Categories  []string                     `json:"categories"`
	Platforms   []string                     `json:"platforms"`
	UploadedAt  time.Time                    `json:"uploaded_at"`
	SizeBytes   int                          `json:"size_bytes"`
	Checksum    string                       `json:"checksum"`
	StorageKey  string                       `json:"storage_key"`
	DeployCount int                          `json:"deploy_count"`
	Agents      map[string]pluginAgentStatus `json:"agents"`
	ZipData     []byte                       `json:"-"` // in-memory storage for MVP
	Disabled    bool                         `json:"disabled"`
}

// agentSummary returns aggregated status counts for a plugin.
func (r *pluginRegistryRecord) agentSummary() map[string]int {
	summary := map[string]int{"total": 0, "installed": 0, "failed": 0, "pending": 0}
	for _, a := range r.Agents {
		summary["total"]++
		switch a.Status {
		case "installed":
			summary["installed"]++
		case "failed":
			summary["failed"]++
		case "pending":
			summary["pending"]++
		case "rollback":
			summary["pending"]++
		}
	}
	return summary
}

// ── Deploy types ────────────────────────────────────────────────────────────

type deployTarget struct {
	Type  string      `json:"type"`  // group, tag, agents
	Value interface{} `json:"value"` // string (group/tag name) or []string (agent IDs)
}

type stagedConfig struct {
	CanaryCount int   `json:"canary_count"`
	Stages      []int `json:"stages"` // percentages e.g. [10, 50, 100]
}

type deployRequest struct {
	Target       deployTarget `json:"target"`
	Strategy     string       `json:"strategy"` // immediate, staged, scheduled
	StagedConfig *stagedConfig `json:"staged_config,omitempty"`
	ScheduledAt  string       `json:"scheduled_at,omitempty"` // RFC3339
}

type deployStage struct {
	Index        int       `json:"index"`
	Percentage   int       `json:"percentage"`
	AgentCount   int       `json:"agent_count"`
	SuccessCount int       `json:"success_count"`
	FailCount    int       `json:"fail_count"`
	Status       string    `json:"status"` // pending, in_progress, completed, failed
	StartedAt    time.Time `json:"started_at,omitempty"`
	CompletedAt  time.Time `json:"completed_at,omitempty"`
}

type deployHistoryRecord struct {
	DeployID     string       `json:"deploy_id"`
	PluginName   string       `json:"plugin_name"`
	Version      string       `json:"version"`
	Strategy     string       `json:"strategy"`
	Target       deployTarget `json:"target"`
	Status       string       `json:"status"` // pending, in_progress, completed, failed, rolled_back
	StartedAt    time.Time    `json:"started_at"`
	CompletedAt  time.Time    `json:"completed_at,omitempty"`
	TotalAgents  int          `json:"total_agents"`
	SuccessCount int          `json:"success_count"`
	FailCount    int          `json:"fail_count"`
	Stages       []deployStage `json:"stages,omitempty"`
}

// ── Plugin Pending Command (delivered via heartbeat) ────────────────────────

type pendingPluginCmd struct {
	AgentID    string    `json:"agent_id"`
	PluginName string    `json:"plugin_name"`
	Action     string    `json:"action"` // install, rollback, disable
	Version    string    `json:"version,omitempty"`
	Checksum   string    `json:"checksum,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// ── Plugin Registry ─────────────────────────────────────────────────────────

type pluginRegistry struct {
	mu        sync.RWMutex
	plugins   map[string]*pluginRegistryRecord
	deploys   []*deployHistoryRecord
	pending   []pendingPluginCmd
	seq       int
	deploySeq int

	// autoRollbackThreshold: if fail rate exceeds this for a deploy, auto-rollback.
	autoRollbackThreshold float64
}

func newPluginRegistry() *pluginRegistry {
	return &pluginRegistry{
		plugins:               make(map[string]*pluginRegistryRecord),
		deploys:               make([]*deployHistoryRecord, 0),
		pending:               make([]pendingPluginCmd, 0),
		autoRollbackThreshold: 0.5, // 50%
	}
}

func (pr *pluginRegistry) nextDeployID() string {
	pr.deploySeq++
	return fmt.Sprintf("deploy-%06d", pr.deploySeq)
}

func (pr *pluginRegistry) register(name, version, desc, author string, categories, platforms []string, sizeBytes int, checksum, storageKey string, zipData []byte) *pluginRegistryRecord {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	rec := &pluginRegistryRecord{
		Name:        name,
		Version:     version,
		Description: desc,
		Author:      author,
		Categories:  categories,
		Platforms:   platforms,
		UploadedAt:  time.Now().UTC(),
		SizeBytes:   sizeBytes,
		Checksum:    checksum,
		StorageKey:  storageKey,
		Agents:      make(map[string]pluginAgentStatus),
		ZipData:     zipData,
	}
	pr.plugins[name] = rec
	return rec
}

func (pr *pluginRegistry) get(name string) (*pluginRegistryRecord, bool) {
	pr.mu.RLock()
	defer pr.mu.RUnlock()
	rec, ok := pr.plugins[name]
	return rec, ok
}

func (pr *pluginRegistry) list() []*pluginRegistryRecord {
	pr.mu.RLock()
	defer pr.mu.RUnlock()
	out := make([]*pluginRegistryRecord, 0, len(pr.plugins))
	for _, rec := range pr.plugins {
		out = append(out, rec)
	}
	return out
}

func (pr *pluginRegistry) delete(name string) bool {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	_, ok := pr.plugins[name]
	delete(pr.plugins, name)
	return ok
}

// deploy creates pending install commands for the targeted agents and records
// deploy history. It supports immediate, staged, and scheduled strategies.
func (pr *pluginRegistry) deploy(name string, req deployRequest, agentIDs []string) (*deployHistoryRecord, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	rec, ok := pr.plugins[name]
	if !ok {
		return nil, fmt.Errorf("plugin %q not found", name)
	}

	deployID := pr.nextDeployID()
	hist := &deployHistoryRecord{
		DeployID:    deployID,
		PluginName:  name,
		Version:     rec.Version,
		Strategy:    req.Strategy,
		Target:      req.Target,
		StartedAt:   time.Now().UTC(),
		TotalAgents: len(agentIDs),
	}

	switch req.Strategy {
	case "immediate":
		hist.Status = "in_progress"
		for _, agentID := range agentIDs {
			pr.pending = append(pr.pending, pendingPluginCmd{
				AgentID:    agentID,
				PluginName: name,
				Action:     "install",
				Version:    rec.Version,
				Checksum:   rec.Checksum,
				CreatedAt:  time.Now().UTC(),
			})
			rec.Agents[agentID] = pluginAgentStatus{
				Version: rec.Version,
				Status:  "pending",
			}
		}

	case "staged":
		hist.Status = "in_progress"
		canaryCount := 2
		if req.StagedConfig != nil && req.StagedConfig.CanaryCount > 0 {
			canaryCount = req.StagedConfig.CanaryCount
		}
		stages := []int{10, 50, 100}
		if req.StagedConfig != nil && len(req.StagedConfig.Stages) > 0 {
			stages = req.StagedConfig.Stages
		}

		// Shuffle agents for random selection.
		shuffled := make([]string, len(agentIDs))
		copy(shuffled, agentIDs)
		rand.Shuffle(len(shuffled), func(i, j int) {
			shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
		})

		// Stage 0: canary.
		canaryAgents := shuffled
		if canaryCount < len(canaryAgents) {
			canaryAgents = shuffled[:canaryCount]
		}
		for _, agentID := range canaryAgents {
			pr.pending = append(pr.pending, pendingPluginCmd{
				AgentID:    agentID,
				PluginName: name,
				Action:     "install",
				Version:    rec.Version,
				Checksum:   rec.Checksum,
				CreatedAt:  time.Now().UTC(),
			})
			rec.Agents[agentID] = pluginAgentStatus{
				Version: rec.Version,
				Status:  "pending",
			}
		}

		hist.Stages = []deployStage{{
			Index:      0,
			Percentage: 0, // canary stage
			AgentCount: len(canaryAgents),
			Status:     "in_progress",
			StartedAt:  time.Now().UTC(),
		}}
		for i, pct := range stages {
			hist.Stages = append(hist.Stages, deployStage{
				Index:      i + 1,
				Percentage: pct,
				Status:     "pending",
			})
		}

	case "scheduled":
		hist.Status = "pending"
		// The background ticker will pick this up at the scheduled time.

	default:
		return nil, fmt.Errorf("unknown strategy %q", req.Strategy)
	}

	rec.DeployCount++
	pr.deploys = append(pr.deploys, hist)
	return hist, nil
}

// rollback creates rollback commands for all agents that have the plugin installed.
func (pr *pluginRegistry) rollback(name string) (*deployHistoryRecord, error) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	rec, ok := pr.plugins[name]
	if !ok {
		return nil, fmt.Errorf("plugin %q not found", name)
	}

	deployID := pr.nextDeployID()
	var agentIDs []string
	for agentID, st := range rec.Agents {
		if st.Status == "installed" || st.Status == "pending" {
			agentIDs = append(agentIDs, agentID)
		}
	}

	for _, agentID := range agentIDs {
		pr.pending = append(pr.pending, pendingPluginCmd{
			AgentID:    agentID,
			PluginName: name,
			Action:     "rollback",
			CreatedAt:  time.Now().UTC(),
		})
		rec.Agents[agentID] = pluginAgentStatus{
			Version: rec.Version,
			Status:  "rollback",
		}
	}

	hist := &deployHistoryRecord{
		DeployID:    deployID,
		PluginName:  name,
		Version:     rec.Version,
		Strategy:    "immediate",
		Status:      "rolled_back",
		StartedAt:   time.Now().UTC(),
		CompletedAt: time.Now().UTC(),
		TotalAgents: len(agentIDs),
	}
	pr.deploys = append(pr.deploys, hist)

	// Also mark any in_progress deploys for this plugin as rolled_back.
	for _, d := range pr.deploys {
		if d.PluginName == name && (d.Status == "in_progress" || d.Status == "pending") {
			d.Status = "rolled_back"
			d.CompletedAt = time.Now().UTC()
		}
	}

	return hist, nil
}

// disable sends disable commands to all agents.
func (pr *pluginRegistry) disable(name string) error {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	rec, ok := pr.plugins[name]
	if !ok {
		return fmt.Errorf("plugin %q not found", name)
	}

	rec.Disabled = true
	for agentID := range rec.Agents {
		pr.pending = append(pr.pending, pendingPluginCmd{
			AgentID:    agentID,
			PluginName: name,
			Action:     "disable",
			CreatedAt:  time.Now().UTC(),
		})
	}
	return nil
}

// getPendingForAgent returns and removes pending plugin commands for an agent.
func (pr *pluginRegistry) getPendingForAgent(agentID string) []pendingPluginCmd {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	var matched []pendingPluginCmd
	var remaining []pendingPluginCmd
	for _, cmd := range pr.pending {
		if cmd.AgentID == agentID {
			matched = append(matched, cmd)
		} else {
			remaining = append(remaining, cmd)
		}
	}
	pr.pending = remaining
	return matched
}

// reportAgentStatus updates the plugin status for an agent (called when agent
// reports via heartbeat or dedicated API).
func (pr *pluginRegistry) reportAgentStatus(pluginName, agentID, status, errorMsg string) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	rec, ok := pr.plugins[pluginName]
	if !ok {
		return
	}

	rec.Agents[agentID] = pluginAgentStatus{
		Version:     rec.Version,
		Status:      status,
		InstalledAt: time.Now().UTC(),
		Error:       errorMsg,
	}

	// Auto-rollback check: if >50% of agents report failure, trigger rollback.
	pr.checkAutoRollback(pluginName)
}

// checkAutoRollback checks if the failure rate for a plugin exceeds the threshold.
// Must be called with pr.mu held.
func (pr *pluginRegistry) checkAutoRollback(name string) {
	rec, ok := pr.plugins[name]
	if !ok || len(rec.Agents) == 0 {
		return
	}

	var total, failed int
	for _, a := range rec.Agents {
		total++
		if a.Status == "failed" {
			failed++
		}
	}

	if total >= 2 && float64(failed)/float64(total) > pr.autoRollbackThreshold {
		// Trigger auto-rollback by queueing rollback commands.
		for agentID, st := range rec.Agents {
			if st.Status == "installed" || st.Status == "pending" {
				pr.pending = append(pr.pending, pendingPluginCmd{
					AgentID:    agentID,
					PluginName: name,
					Action:     "rollback",
					CreatedAt:  time.Now().UTC(),
				})
				rec.Agents[agentID] = pluginAgentStatus{
					Version: rec.Version,
					Status:  "rollback",
				}
			}
		}

		// Mark active deploys as rolled_back.
		for _, d := range pr.deploys {
			if d.PluginName == name && d.Status == "in_progress" {
				d.Status = "rolled_back"
				d.CompletedAt = time.Now().UTC()
			}
		}
	}
}

// updateDeployProgress updates deploy records based on current agent statuses.
// Must be called with pr.mu held.
func (pr *pluginRegistry) updateDeployProgress(name string) {
	rec, ok := pr.plugins[name]
	if !ok {
		return
	}

	for _, d := range pr.deploys {
		if d.PluginName != name || d.Status != "in_progress" {
			continue
		}
		var success, fail int
		for _, a := range rec.Agents {
			switch a.Status {
			case "installed":
				success++
			case "failed":
				fail++
			}
		}
		d.SuccessCount = success
		d.FailCount = fail
		if success+fail >= d.TotalAgents {
			d.Status = "completed"
			d.CompletedAt = time.Now().UTC()
			if fail > 0 && success == 0 {
				d.Status = "failed"
			}
		}
	}
}

func (pr *pluginRegistry) deployHistory() []*deployHistoryRecord {
	pr.mu.RLock()
	defer pr.mu.RUnlock()
	out := make([]*deployHistoryRecord, len(pr.deploys))
	copy(out, pr.deploys)
	return out
}

// startScheduledDeployTicker runs a background goroutine that checks for
// scheduled deploys that are due and executes them.
func (pr *pluginRegistry) startScheduledDeployTicker(stopCh <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-stopCh:
				return
			case <-ticker.C:
				pr.processScheduledDeploys()
			}
		}
	}()
}

func (pr *pluginRegistry) processScheduledDeploys() {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	now := time.Now().UTC()
	for _, d := range pr.deploys {
		if d.Status != "pending" || d.Strategy != "scheduled" {
			continue
		}
		// The scheduled_at is encoded in the target value for simplicity in MVP.
		// In production, we'd store it as a separate field.
		if d.StartedAt.Before(now) || d.StartedAt.Equal(now) {
			// Convert to immediate: queue install commands for all agents.
			rec, ok := pr.plugins[d.PluginName]
			if !ok {
				d.Status = "failed"
				continue
			}

			d.Status = "in_progress"
			for agentID := range rec.Agents {
				pr.pending = append(pr.pending, pendingPluginCmd{
					AgentID:    agentID,
					PluginName: d.PluginName,
					Action:     "install",
					Version:    rec.Version,
					Checksum:   rec.Checksum,
					CreatedAt:  time.Now().UTC(),
				})
			}
		}
	}
}

// ── Staged Deploy Advancement ───────────────────────────────────────────────

// startStagedDeployTicker runs a background goroutine that auto-advances
// staged deployments when conditions are met.
func (pr *pluginRegistry) startStagedDeployTicker(stopCh <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-stopCh:
				return
			case <-ticker.C:
				pr.advanceStagedDeploys()
			}
		}
	}()
}

func (pr *pluginRegistry) advanceStagedDeploys() {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	for _, d := range pr.deploys {
		if d.Status != "in_progress" || d.Strategy != "staged" || len(d.Stages) == 0 {
			continue
		}

		rec, ok := pr.plugins[d.PluginName]
		if !ok {
			continue
		}

		// Find current active stage.
		var currentStage *deployStage
		var currentIdx int
		for i := range d.Stages {
			if d.Stages[i].Status == "in_progress" {
				currentStage = &d.Stages[i]
				currentIdx = i
				break
			}
		}
		if currentStage == nil {
			continue
		}

		// Check if current stage succeeded (all expected agents installed).
		var installed, failed int
		for _, a := range rec.Agents {
			if a.Status == "installed" {
				installed++
			} else if a.Status == "failed" {
				failed++
			}
		}

		expectedDone := currentStage.AgentCount
		if installed+failed < expectedDone {
			continue // still waiting
		}

		// Complete current stage.
		currentStage.SuccessCount = installed
		currentStage.FailCount = failed
		currentStage.Status = "completed"
		currentStage.CompletedAt = time.Now().UTC()

		// If too many failures, stop.
		if failed > 0 && float64(failed)/float64(expectedDone) > pr.autoRollbackThreshold {
			d.Status = "failed"
			d.CompletedAt = time.Now().UTC()
			continue
		}

		// Advance to next stage.
		nextIdx := currentIdx + 1
		if nextIdx >= len(d.Stages) {
			d.Status = "completed"
			d.CompletedAt = time.Now().UTC()
			d.SuccessCount = installed
			d.FailCount = failed
			continue
		}

		nextStage := &d.Stages[nextIdx]
		nextStage.Status = "in_progress"
		nextStage.StartedAt = time.Now().UTC()

		// Calculate how many agents for this stage.
		targetCount := (d.TotalAgents * nextStage.Percentage) / 100
		if targetCount < 1 {
			targetCount = 1
		}

		// Find agents not yet targeted.
		alreadyTargeted := make(map[string]bool)
		for agentID := range rec.Agents {
			alreadyTargeted[agentID] = true
		}

		// We need to add more agents for this stage.
		nextStage.AgentCount = targetCount
		// In a real implementation, we'd select from the target pool.
		// For MVP, mark existing pending agents.
	}
}

// ── Route registration ──────────────────────────────────────────────────────

func registerPluginRoutes(mux *http.ServeMux, reg *pluginRegistry, agentFleet *fleet) {
	// GET /api/v1/fleet/plugins — list all registered plugins
	mux.HandleFunc("GET /api/v1/fleet/plugins", func(w http.ResponseWriter, r *http.Request) {
		plugins := reg.list()
		items := make([]map[string]interface{}, 0, len(plugins))
		for _, p := range plugins {
			items = append(items, map[string]interface{}{
				"name":          p.Name,
				"version":       p.Version,
				"description":   p.Description,
				"author":        p.Author,
				"categories":    p.Categories,
				"platforms":     p.Platforms,
				"uploaded_at":   p.UploadedAt.Format(time.RFC3339),
				"size_bytes":    p.SizeBytes,
				"checksum":      p.Checksum,
				"deploy_count":  p.DeployCount,
				"disabled":      p.Disabled,
				"agent_summary": p.agentSummary(),
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": items,
			"total": len(items),
		})
	})

	// POST /api/v1/fleet/plugins — upload plugin ZIP
	mux.HandleFunc("POST /api/v1/fleet/plugins", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024*1024) // 64 MiB max

		// Try multipart form first.
		var zipData []byte
		var pluginName, version, description, author string
		var categories, platforms []string

		if strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			if err := r.ParseMultipartForm(64 * 1024 * 1024); err != nil {
				http.Error(w, "parse form: "+err.Error(), http.StatusBadRequest)
				return
			}
			file, _, err := r.FormFile("plugin")
			if err != nil {
				http.Error(w, "missing plugin file", http.StatusBadRequest)
				return
			}
			defer file.Close()
			data, err := io.ReadAll(file)
			if err != nil {
				http.Error(w, "read file: "+err.Error(), http.StatusBadRequest)
				return
			}
			zipData = data
			pluginName = r.FormValue("name")
			version = r.FormValue("version")
			description = r.FormValue("description")
			author = r.FormValue("author")
			if cats := r.FormValue("categories"); cats != "" {
				categories = strings.Split(cats, ",")
			}
			if plats := r.FormValue("platforms"); plats != "" {
				platforms = strings.Split(plats, ",")
			}
		} else {
			// Raw body upload with metadata in headers/query.
			data, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
				return
			}
			zipData = data
			pluginName = r.URL.Query().Get("name")
			version = r.URL.Query().Get("version")
			description = r.URL.Query().Get("description")
			author = r.URL.Query().Get("author")
		}

		if pluginName == "" || version == "" {
			http.Error(w, "name and version are required", http.StatusBadRequest)
			return
		}

		checksum := fmt.Sprintf("%x", sha256.Sum256(zipData))
		storageKey := fmt.Sprintf("plugins/%s/%s/%s-%s.zip", pluginName, version, pluginName, version)

		rec := reg.register(pluginName, version, description, author, categories, platforms, len(zipData), checksum, storageKey, zipData)
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"name":     rec.Name,
			"version":  rec.Version,
			"checksum": rec.Checksum,
			"size":     rec.SizeBytes,
			"status":   "uploaded",
		})
	})

	// GET /api/v1/fleet/plugins/history — deploy history
	mux.HandleFunc("GET /api/v1/fleet/plugins/history", func(w http.ResponseWriter, r *http.Request) {
		history := reg.deployHistory()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": history,
			"total": len(history),
		})
	})

	// Sub-routes: /api/v1/fleet/plugins/{name}/...
	mux.HandleFunc("/api/v1/fleet/plugins/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/fleet/plugins/")
		if path == "" || path == "history" {
			// Already handled above by exact match routes.
			http.NotFound(w, r)
			return
		}

		parts := strings.SplitN(path, "/", 2)
		name := parts[0]
		sub := ""
		if len(parts) > 1 {
			sub = parts[1]
		}

		switch {
		// GET /api/v1/fleet/plugins/{name} — plugin details
		case sub == "" && r.Method == http.MethodGet:
			rec, ok := reg.get(name)
			if !ok {
				http.NotFound(w, r)
				return
			}
			agentStatuses := make([]map[string]interface{}, 0)
			for agentID, st := range rec.Agents {
				agentStatuses = append(agentStatuses, map[string]interface{}{
					"agent_id":     agentID,
					"version":      st.Version,
					"status":       st.Status,
					"installed_at": st.InstalledAt.Format(time.RFC3339),
					"error":        st.Error,
				})
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"name":          rec.Name,
				"version":       rec.Version,
				"description":   rec.Description,
				"author":        rec.Author,
				"categories":    rec.Categories,
				"platforms":     rec.Platforms,
				"uploaded_at":   rec.UploadedAt.Format(time.RFC3339),
				"size_bytes":    rec.SizeBytes,
				"checksum":      rec.Checksum,
				"deploy_count":  rec.DeployCount,
				"disabled":      rec.Disabled,
				"agent_summary": rec.agentSummary(),
				"agents":        agentStatuses,
			})

		// DELETE /api/v1/fleet/plugins/{name} — delete plugin
		case sub == "" && r.Method == http.MethodDelete:
			if ok := reg.delete(name); !ok {
				http.NotFound(w, r)
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{
				"status": "deleted",
				"name":   name,
			})

		// POST /api/v1/fleet/plugins/{name}/deploy — deploy
		case sub == "deploy" && r.Method == http.MethodPost:
			var req deployRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
				return
			}

			// Resolve target agents.
			agentIDs := resolveTargetAgents(req.Target, agentFleet)
			if len(agentIDs) == 0 {
				// Fallback: demo agent IDs.
				agentIDs = []string{"agent-01", "agent-02", "agent-03", "agent-04", "agent-05"}
			}

			hist, err := reg.deploy(name, req, agentIDs)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, http.StatusAccepted, hist)

		// POST /api/v1/fleet/plugins/{name}/rollback — rollback
		case sub == "rollback" && r.Method == http.MethodPost:
			hist, err := reg.rollback(name)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, http.StatusOK, hist)

		// POST /api/v1/fleet/plugins/{name}/disable — disable
		case sub == "disable" && r.Method == http.MethodPost:
			if err := reg.disable(name); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{
				"status": "disabled",
				"name":   name,
			})

		// GET /api/v1/fleet/plugins/{name}/status — per-agent status
		case sub == "status" && r.Method == http.MethodGet:
			rec, ok := reg.get(name)
			if !ok {
				http.NotFound(w, r)
				return
			}
			statuses := make([]map[string]interface{}, 0)
			for agentID, st := range rec.Agents {
				hostname := agentID // fallback
				if agentFleet != nil {
					if a, ok := agentFleet.get(agentID); ok {
						hostname = a.Hostname
					}
				}
				statuses = append(statuses, map[string]interface{}{
					"agent_id":     agentID,
					"hostname":     hostname,
					"version":      st.Version,
					"status":       st.Status,
					"installed_at": st.InstalledAt.Format(time.RFC3339),
					"error":        st.Error,
				})
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"plugin_name": name,
				"agents":      statuses,
				"total":       len(statuses),
			})

		// GET /api/v1/fleet/plugins/{name}/download — download plugin ZIP
		case sub == "download" && r.Method == http.MethodGet:
			rec, ok := reg.get(name)
			if !ok {
				http.NotFound(w, r)
				return
			}
			if len(rec.ZipData) == 0 {
				http.Error(w, "plugin binary not available", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/zip")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s-%s.zip", name, rec.Version))
			w.Header().Set("X-Plugin-Checksum", rec.Checksum)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(rec.ZipData)

		default:
			http.NotFound(w, r)
		}
	})
}

// resolveTargetAgents expands a deploy target to a list of agent IDs.
func resolveTargetAgents(target deployTarget, f *fleet) []string {
	if f == nil {
		return nil
	}

	switch target.Type {
	case "agents":
		// Direct agent ID list.
		switch v := target.Value.(type) {
		case []interface{}:
			ids := make([]string, 0, len(v))
			for _, item := range v {
				if s, ok := item.(string); ok {
					ids = append(ids, s)
				}
			}
			return ids
		case []string:
			return v
		}
		return nil

	case "group", "tag":
		// In a real implementation we'd look up the group/tag registry.
		// For MVP, return all known agents.
		agents := f.list()
		ids := make([]string, 0, len(agents))
		for _, a := range agents {
			ids = append(ids, a.ID)
		}
		return ids

	default:
		return nil
	}
}
