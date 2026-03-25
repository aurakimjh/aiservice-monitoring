package main

// Phase 34: Runtime Attach API
//
// Endpoints:
//   GET  /api/v1/attach/processes          — list attachable processes (all agents)
//   GET  /api/v1/attach/{agentId}/processes — list processes for a specific agent
//   POST /api/v1/attach/{agentId}/sessions  — start attach session (command)
//   GET  /api/v1/attach/{agentId}/sessions  — list active attach sessions
//   GET  /api/v1/attach/{agentId}/sessions/{pid} — get single session
//   DELETE /api/v1/attach/{agentId}/sessions/{pid} — detach
//   POST /api/v1/attach/{agentId}/sessions/{pid}/profile — trigger profile capture
//   POST /api/v1/attach/{agentId}/sessions/{pid}/result — agent pushes profile result
//
// Session lifecycle:
//  1. UI calls POST …/sessions → creates a "pending" attach command in the registry.
//  2. Agent polls GET …/sessions on heartbeat → discovers pending commands, executes Attach.
//  3. Agent calls PATCH …/sessions/{pid} (or POST result) to report status.
//  4. UI polls GET …/sessions/{pid} to see Attach status + profile data.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─── attach session registry ─────────────────────────────────────────────────

// attachSessionStatus is the state of an attach session.
type attachSessionStatus string

const (
	attachPending  attachSessionStatus = "pending"   // command queued, agent not yet confirmed
	attachActive   attachSessionStatus = "active"    // agent confirmed attach
	attachFailed   attachSessionStatus = "failed"    // agent reported error
	attachDetached attachSessionStatus = "detached"  // detached
)

// attachSession represents a single Runtime Attach profiling session.
type attachSession struct {
	SessionID   string              `json:"session_id"`
	AgentID     string              `json:"agent_id"`
	PID         int                 `json:"pid"`
	Runtime     string              `json:"runtime"`
	ServiceName string              `json:"service_name"`
	Status      attachSessionStatus `json:"status"`
	ErrorCode   string              `json:"error_code,omitempty"`
	ErrorMsg    string              `json:"error_message,omitempty"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
	// Latest profile result (set when agent pushes a collected profile)
	LatestProfile *attachProfileResult `json:"latest_profile,omitempty"`
}

// attachProfileResult holds the profile snapshot pushed by the agent.
type attachProfileResult struct {
	ProfileID   string    `json:"profile_id"`
	ProfileType string    `json:"profile_type"`
	Format      string    `json:"format"`
	DurationSec int       `json:"duration_sec"`
	SizeBytes   int       `json:"size_bytes"`
	CapturedAt  time.Time `json:"captured_at"`
}

// detectedProcess is a process report pushed by agents during heartbeat.
type detectedProcess struct {
	AgentID     string    `json:"agent_id"`
	PID         int       `json:"pid"`
	Runtime     string    `json:"runtime"`
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	ReportedAt  time.Time `json:"reported_at"`
}

// attachRegistry manages in-memory attach sessions and detected processes.
type attachRegistry struct {
	mu       sync.RWMutex
	sessions map[string]*attachSession  // sessionID → session
	procs    map[string][]detectedProcess // agentID → processes
	seq      int
}

func newAttachRegistry() *attachRegistry {
	return &attachRegistry{
		sessions: make(map[string]*attachSession),
		procs:    make(map[string][]detectedProcess),
	}
}

func (r *attachRegistry) nextID() string {
	r.seq++
	return fmt.Sprintf("ats-%06d", r.seq)
}

func (r *attachRegistry) createSession(agentID string, pid int, runtime, serviceName string) *attachSession {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := &attachSession{
		SessionID:   r.nextID(),
		AgentID:     agentID,
		PID:         pid,
		Runtime:     runtime,
		ServiceName: serviceName,
		Status:      attachPending,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	r.sessions[s.SessionID] = s
	return s
}

func (r *attachRegistry) listSessionsByAgent(agentID string) []*attachSession {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []*attachSession
	for _, s := range r.sessions {
		if s.AgentID == agentID {
			out = append(out, s)
		}
	}
	return out
}

func (r *attachRegistry) getSession(sessionID string) (*attachSession, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.sessions[sessionID]
	return s, ok
}

func (r *attachRegistry) getSessionByPID(agentID string, pid int) (*attachSession, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, s := range r.sessions {
		if s.AgentID == agentID && s.PID == pid && s.Status != attachDetached {
			return s, true
		}
	}
	return nil, false
}

func (r *attachRegistry) updateStatus(sessionID string, status attachSessionStatus, errCode, errMsg string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[sessionID]
	if !ok {
		return false
	}
	s.Status = status
	s.ErrorCode = errCode
	s.ErrorMsg = errMsg
	s.UpdatedAt = time.Now().UTC()
	return true
}

func (r *attachRegistry) setProfile(sessionID string, pr *attachProfileResult) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[sessionID]
	if !ok {
		return false
	}
	s.LatestProfile = pr
	s.UpdatedAt = time.Now().UTC()
	return true
}

func (r *attachRegistry) deleteSession(sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s, ok := r.sessions[sessionID]; ok {
		s.Status = attachDetached
		s.UpdatedAt = time.Now().UTC()
	}
}

func (r *attachRegistry) reportProcesses(agentID string, procs []detectedProcess) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.procs[agentID] = procs
}

func (r *attachRegistry) listProcesses(agentID string) []detectedProcess {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if agentID != "" {
		return r.procs[agentID]
	}
	var all []detectedProcess
	for _, ps := range r.procs {
		all = append(all, ps...)
	}
	return all
}

// ─── demo process generator ───────────────────────────────────────────────────

func demoAttachProcesses(agentID string) []detectedProcess {
	now := time.Now().UTC()
	return []detectedProcess{
		{AgentID: agentID, PID: 12345, Runtime: "java", Name: "OrderService", Version: "17.0.9", ReportedAt: now},
		{AgentID: agentID, PID: 23456, Runtime: "python", Name: "ml-inference", Version: "3.11.5", ReportedAt: now},
		{AgentID: agentID, PID: 34567, Runtime: "dotnet", Name: "PaymentAPI", Version: "8.0.1", ReportedAt: now},
		{AgentID: agentID, PID: 45678, Runtime: "nodejs", Name: "api-gateway", Version: "20.11.0", ReportedAt: now},
		{AgentID: agentID, PID: 56789, Runtime: "go", Name: "metrics-exporter", Version: "1.22.0", ReportedAt: now},
	}
}

// ─── route registration ───────────────────────────────────────────────────────

// registerAttachRoutes adds all /api/v1/attach/* routes to mux.
func registerAttachRoutes(mux *http.ServeMux, reg *attachRegistry) {
	// GET /api/v1/attach/processes — all agents' detected processes
	mux.HandleFunc("GET /api/v1/attach/processes", func(w http.ResponseWriter, r *http.Request) {
		agentID := r.URL.Query().Get("agent_id")
		procs := reg.listProcesses(agentID)
		if len(procs) == 0 && agentID != "" {
			// Return demo data for MVP
			procs = demoAttachProcesses(agentID)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": procs,
			"total": len(procs),
		})
	})

	// GET /api/v1/attach/{agentId}/processes
	mux.HandleFunc("GET /api/v1/attach/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/attach/")
		parts := strings.SplitN(path, "/", 3)
		if len(parts) < 2 {
			http.NotFound(w, r)
			return
		}
		agentID := parts[0]
		sub := parts[1]

		switch {
		case sub == "processes" && r.Method == http.MethodGet:
			procs := reg.listProcesses(agentID)
			if len(procs) == 0 {
				procs = demoAttachProcesses(agentID)
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"items": procs,
				"total": len(procs),
			})

		case sub == "sessions" && r.Method == http.MethodGet:
			sessions := reg.listSessionsByAgent(agentID)
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"items": sessions,
				"total": len(sessions),
			})

		case sub == "sessions" && r.Method == http.MethodPost:
			// POST /api/v1/attach/{agentId}/sessions
			var req struct {
				PID         int    `json:"pid"`
				Runtime     string `json:"runtime"`
				ServiceName string `json:"service_name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.PID <= 0 || req.Runtime == "" {
				http.Error(w, `{"message":"pid and runtime required"}`, http.StatusBadRequest)
				return
			}
			// Check for existing active session
			if existing, ok := reg.getSessionByPID(agentID, req.PID); ok {
				writeJSON(w, http.StatusConflict, map[string]interface{}{
					"error":      "ATTACH_ALREADY_ACTIVE",
					"message":    fmt.Sprintf("PID %d already has an active session", req.PID),
					"session_id": existing.SessionID,
				})
				return
			}
			sess := reg.createSession(agentID, req.PID, req.Runtime, req.ServiceName)
			writeJSON(w, http.StatusCreated, sess)

		default:
			// Handle /api/v1/attach/{agentId}/sessions/{sessionId}[/...]
			if sub == "sessions" && len(parts) >= 3 {
				sessionIDOrPID := parts[2]
				subAction := ""
				if idx := strings.Index(sessionIDOrPID, "/"); idx >= 0 {
					subAction = sessionIDOrPID[idx+1:]
					sessionIDOrPID = sessionIDOrPID[:idx]
				}

				// Try by sessionID first, then by PID
				var sess *attachSession
				var ok bool
				sess, ok = reg.getSession(sessionIDOrPID)
				if !ok {
					// try as PID
					if pid, err := strconv.Atoi(sessionIDOrPID); err == nil {
						sess, ok = reg.getSessionByPID(agentID, pid)
					}
				}

				switch {
				case r.Method == http.MethodGet && subAction == "":
					if !ok {
						http.NotFound(w, r)
						return
					}
					writeJSON(w, http.StatusOK, sess)

				case r.Method == http.MethodDelete && subAction == "":
					if !ok {
						http.NotFound(w, r)
						return
					}
					reg.deleteSession(sess.SessionID)
					writeJSON(w, http.StatusOK, map[string]string{"status": "detached"})

				case r.Method == http.MethodPost && subAction == "profile":
					// POST .../sessions/{id}/profile — trigger profile capture
					if !ok {
						http.NotFound(w, r)
						return
					}
					var req struct {
						ProfileType string `json:"profile_type"`
						DurationSec int    `json:"duration_sec"`
					}
					_ = json.NewDecoder(r.Body).Decode(&req)
					if req.ProfileType == "" {
						req.ProfileType = "cpu"
					}
					if req.DurationSec <= 0 {
						req.DurationSec = 30
					}
					// In production the collection server would push this command
					// to the agent via WebSocket/SSE. For MVP, return the pending
					// trigger record and the agent polls on next heartbeat.
					writeJSON(w, http.StatusAccepted, map[string]interface{}{
						"session_id":   sess.SessionID,
						"status":       "profile_triggered",
						"profile_type": req.ProfileType,
						"duration_sec": req.DurationSec,
					})

				case r.Method == http.MethodPost && subAction == "result":
					// POST .../sessions/{id}/result — agent pushes profile result
					var res attachProfileResult
					if err := json.NewDecoder(r.Body).Decode(&res); err != nil {
						http.Error(w, err.Error(), http.StatusBadRequest)
						return
					}
					if !ok {
						http.NotFound(w, r)
						return
					}
					reg.setProfile(sess.SessionID, &res)
					writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})

				case r.Method == http.MethodPatch && subAction == "":
					// PATCH .../sessions/{id} — agent reports status update
					var upd struct {
						Status    string `json:"status"`
						ErrorCode string `json:"error_code"`
						ErrorMsg  string `json:"error_message"`
					}
					if err := json.NewDecoder(r.Body).Decode(&upd); err != nil {
						http.Error(w, err.Error(), http.StatusBadRequest)
						return
					}
					if !ok {
						http.NotFound(w, r)
						return
					}
					status := attachSessionStatus(upd.Status)
					reg.updateStatus(sess.SessionID, status, upd.ErrorCode, upd.ErrorMsg)
					writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})

				default:
					http.NotFound(w, r)
				}
				return
			}
			http.NotFound(w, r)
		}
	})

	// POST /api/v1/attach/{agentId}/processes — agent reports detected processes
	// (called by agent on heartbeat to update process list)
	mux.HandleFunc("POST /api/v1/attach/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/attach/")
		parts := strings.SplitN(path, "/", 3)
		if len(parts) < 2 || parts[1] != "processes" {
			http.NotFound(w, r)
			return
		}
		agentID := parts[0]

		var procs []detectedProcess
		if err := json.NewDecoder(r.Body).Decode(&procs); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		for i := range procs {
			procs[i].AgentID = agentID
			procs[i].ReportedAt = time.Now().UTC()
		}
		reg.reportProcesses(agentID, procs)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}
