package main

// virtual_thread_api.go — Phase 39-3: Collection Server Virtual Thread API
//
// Endpoints:
//   GET  /api/v1/virtual-threads/{agentId}            — latest VT metrics
//   GET  /api/v1/virtual-threads/{agentId}/pinning    — pinning events + stacks
//   GET  /api/v1/virtual-threads/{agentId}/alerts     — VT alert history
//   POST /api/v1/virtual-threads/{agentId}/alerts     — acknowledge alert
//   GET  /api/v1/virtual-threads/{agentId}/thread-dumps — stored thread dumps
//   POST /api/v1/virtual-threads/{agentId}/thread-dumps — trigger new dump

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── In-memory stores ─────────────────────────────────────────────────────────

type vtMetricsStore struct {
	mu      sync.RWMutex
	metrics map[string]*vtAgentMetrics // agentId → metrics
}

type vtAgentMetrics struct {
	AgentID     string             `json:"agent_id"`
	UpdatedAt   time.Time          `json:"updated_at"`
	JavaVersion string             `json:"java_version"`
	JDK21Plus   bool               `json:"jdk21_plus"`
	Metrics     vtMetricsSnapshot  `json:"metrics"`
	Alerts      []vtAlertRecord    `json:"alerts"`
	PinnedStacks []vtPinnedStack   `json:"pinned_stacks"`
	ThreadDumps []vtThreadDumpRef  `json:"thread_dumps"`
}

type vtMetricsSnapshot struct {
	ActiveCount      int64          `json:"active_count"`
	WaitingCount     int64          `json:"waiting_count"`
	MountedCount     int64          `json:"mounted_count"`
	CreatedPerMin    int64          `json:"created_per_min"`
	SubmitFailedRate float64        `json:"submit_failed_rate"`
	PinnedCount      int64          `json:"pinned_count"`
	PinnedP99Ms      float64        `json:"pinned_p99_ms"`
	CarrierPool      vtCarrierPool  `json:"carrier_pool"`
	CollectedAt      time.Time      `json:"collected_at"`
	// Historical 30-min buckets for chart (1-min resolution)
	SubmitFailedHistory []int64 `json:"submit_failed_history"`
	ActiveHistory       []int64 `json:"active_history"`
}

type vtCarrierPool struct {
	Parallelism int     `json:"parallelism"`
	ActiveCount int     `json:"active_count"`
	QueuedTasks int64   `json:"queued_tasks"`
	Utilization float64 `json:"utilization"`
}

type vtAlertRecord struct {
	AlertID    string    `json:"alert_id"`
	Severity   string    `json:"severity"`
	Rule       string    `json:"rule"`
	Message    string    `json:"message"`
	Value      float64   `json:"value"`
	Threshold  float64   `json:"threshold"`
	FiredAt    time.Time `json:"fired_at"`
	Acked      bool      `json:"acked"`
	AckedAt    *time.Time `json:"acked_at,omitempty"`
}

type vtPinnedStack struct {
	ID         string    `json:"id"`
	DurationMs float64   `json:"duration_ms"`
	StackTrace string    `json:"stack_trace"`
	TopMethod  string    `json:"top_method"`
	CapturedAt time.Time `json:"captured_at"`
}

type vtThreadDumpRef struct {
	DumpID      string    `json:"dump_id"`
	StorageKey  string    `json:"storage_key"`
	TotalThreads int      `json:"total_threads"`
	VTCount     int       `json:"vt_count"`
	TriggeredAt time.Time `json:"triggered_at"`
}

var vtStore = &vtMetricsStore{
	metrics: map[string]*vtAgentMetrics{},
}

func init() {
	// Seed demo data for agent-001 (JDK 21 host)
	vtStore.metrics["agent-001"] = demovtMetrics("agent-001")
}

func demovtMetrics(agentID string) *vtAgentMetrics {
	now := time.Now().UTC()
	history30 := make([]int64, 30)
	activeHist := make([]int64, 30)
	for i := range history30 {
		history30[i] = int64(i % 3) // mostly 0–2 submit failures per min
		activeHist[i] = int64(800 + i*10 + (i%5)*50)
	}
	return &vtAgentMetrics{
		AgentID:     agentID,
		UpdatedAt:   now,
		JavaVersion: "21.0.2",
		JDK21Plus:   true,
		Metrics: vtMetricsSnapshot{
			ActiveCount:         1284,
			WaitingCount:        342,
			MountedCount:        8,
			CreatedPerMin:       4500,
			SubmitFailedRate:    1.2,
			PinnedCount:         7,
			PinnedP99Ms:         145.3,
			SubmitFailedHistory: history30,
			ActiveHistory:       activeHist,
			CollectedAt:         now,
			CarrierPool: vtCarrierPool{
				Parallelism: 16,
				ActiveCount: 12,
				QueuedTasks: 24,
				Utilization: 0.75,
			},
		},
		Alerts: []vtAlertRecord{
			{
				AlertID:   "vt-alert-000001",
				Severity:  "warning",
				Rule:      "vt.pinned.rate",
				Message:   "Virtual Thread pinning rate too high: 12 events/min (threshold: 10)",
				Value:     12,
				Threshold: 10,
				FiredAt:   now.Add(-5 * time.Minute),
				Acked:     false,
			},
		},
		PinnedStacks: []vtPinnedStack{
			{
				ID:         "pin-001",
				DurationMs: 245.8,
				StackTrace: "java.lang.Object.wait(Object.java)\n  com.example.LegacySync.doWork(LegacySync.java:42)\n  java.lang.Thread.run(Thread.java:833)",
				TopMethod:  "com.example.LegacySync.doWork",
				CapturedAt: now.Add(-3 * time.Minute),
			},
			{
				ID:         "pin-002",
				DurationMs: 189.2,
				StackTrace: "sun.nio.fs.UnixNativeDispatcher.read(UnixNativeDispatcher.java)\n  com.example.FileService.readSync(FileService.java:88)\n  java.lang.Thread.run(Thread.java:833)",
				TopMethod:  "com.example.FileService.readSync",
				CapturedAt: now.Add(-2 * time.Minute),
			},
			{
				ID:         "pin-003",
				DurationMs: 124.5,
				StackTrace: "jdk.internal.reflect.NativeMethodAccessorImpl.invoke()\n  com.example.ReflectionUtil.call(ReflectionUtil.java:15)\n  java.lang.Thread.run(Thread.java:833)",
				TopMethod:  "com.example.ReflectionUtil.call",
				CapturedAt: now.Add(-1 * time.Minute),
			},
		},
		ThreadDumps: []vtThreadDumpRef{
			{
				DumpID:      "td-001",
				StorageKey:  fmt.Sprintf("thread-dumps/%s/%s.json", agentID, now.Add(-10*time.Minute).Format("20060102-150405")),
				TotalThreads: 1842,
				VTCount:     1284,
				TriggeredAt: now.Add(-10 * time.Minute),
			},
		},
	}
}

// ─── Route registration ───────────────────────────────────────────────────────

func registerVirtualThreadRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/virtual-threads/", handleVTGet)
	mux.HandleFunc("POST /api/v1/virtual-threads/", handleVTPost)
}

func handleVTGet(w http.ResponseWriter, r *http.Request) {
	// Parse: /api/v1/virtual-threads/{agentId}[/pinning|/alerts|/thread-dumps]
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/virtual-threads/")
	parts := strings.SplitN(path, "/", 2)
	agentID := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	vtStore.mu.RLock()
	data, ok := vtStore.metrics[agentID]
	vtStore.mu.RUnlock()

	if !ok {
		// Return empty stub for unknown agents
		data = &vtAgentMetrics{AgentID: agentID, JDK21Plus: false}
	}

	switch sub {
	case "pinning":
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"agent_id":      agentID,
			"pinned_stacks": data.PinnedStacks,
			"pinned_count":  data.Metrics.PinnedCount,
			"p99_ms":        data.Metrics.PinnedP99Ms,
		})
	case "alerts":
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"agent_id": agentID,
			"alerts":   data.Alerts,
			"total":    len(data.Alerts),
		})
	case "thread-dumps":
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"agent_id":    agentID,
			"thread_dumps": data.ThreadDumps,
		})
	default:
		writeJSON(w, http.StatusOK, data)
	}
}

func handleVTPost(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/virtual-threads/")
	parts := strings.SplitN(path, "/", 2)
	agentID := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	switch sub {
	case "alerts":
		// Acknowledge an alert: POST body = {"alert_id": "..."}
		var body struct {
			AlertID string `json:"alert_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		vtStore.mu.Lock()
		if data, ok := vtStore.metrics[agentID]; ok {
			for i := range data.Alerts {
				if data.Alerts[i].AlertID == body.AlertID {
					data.Alerts[i].Acked = true
					t := time.Now().UTC()
					data.Alerts[i].AckedAt = &t
					break
				}
			}
		}
		vtStore.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]string{"status": "acked"})

	case "thread-dumps":
		// Trigger a new thread dump (simulated)
		now := time.Now().UTC()
		dumpID := fmt.Sprintf("td-%06d", now.UnixMilli()%1000000)
		ref := vtThreadDumpRef{
			DumpID:      dumpID,
			StorageKey:  fmt.Sprintf("thread-dumps/%s/%s.json", agentID, now.Format("20060102-150405")),
			TotalThreads: 1890,
			VTCount:     1350,
			TriggeredAt: now,
		}
		vtStore.mu.Lock()
		if _, ok := vtStore.metrics[agentID]; !ok {
			vtStore.metrics[agentID] = &vtAgentMetrics{AgentID: agentID}
		}
		vtStore.metrics[agentID].ThreadDumps = append(vtStore.metrics[agentID].ThreadDumps, ref)
		vtStore.mu.Unlock()
		writeJSON(w, http.StatusAccepted, map[string]interface{}{
			"status":  "triggered",
			"dump_id": dumpID,
		})

	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}
