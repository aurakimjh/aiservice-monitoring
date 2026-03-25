package main

// Phase 35-3: perf/eBPF Flamegraph API
//
// Endpoints:
//   GET  /api/v1/profiling/flamegraph          — generate flamegraph SVG or JSON
//   GET  /api/v1/profiling/stacks              — return raw folded stack data (gzip)
//   POST /api/v1/profiling/trigger             — trigger async profiling on agent
//   GET  /api/v1/profiling/system/profiles     — list perf/eBPF profiles
//   POST /api/v1/profiling/system/upload       — upload folded stacks from agent

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/profiling"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/storage"
)

// ── Profile Registry (in-memory for MVP) ──────────────────────────────────

type systemProfileRecord struct {
	ProfileID          string            `json:"profile_id"`
	AgentID            string            `json:"agent_id"`
	Hostname           string            `json:"hostname"`
	ProfileType        string            `json:"profile_type"`
	Target             string            `json:"target"`
	SamplingFrequency  int               `json:"sampling_frequency"`
	DurationSec        int               `json:"duration_sec"`
	TotalSamples       int64             `json:"total_samples"`
	StackDepth         int               `json:"stack_depth"`
	SizeBytes          int               `json:"size_bytes"`
	CapturedAt         time.Time         `json:"captured_at"`
	StorageKey         string            `json:"storage_key"`
	SymbolStats        symbolStatsRecord `json:"symbol_stats"`
}

type symbolStatsRecord struct {
	Resolved int `json:"resolved"`
	Unknown  int `json:"unknown"`
	JIT      int `json:"jit"`
}

type systemProfileRegistry struct {
	mu       sync.RWMutex
	profiles []*systemProfileRecord
	seq      int
}

func newSystemProfileRegistry() *systemProfileRegistry {
	return &systemProfileRegistry{}
}

func (r *systemProfileRegistry) add(rec *systemProfileRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	if rec.ProfileID == "" {
		rec.ProfileID = fmt.Sprintf("sys-prof-%04d", r.seq)
	}
	r.profiles = append(r.profiles, rec)
}

func (r *systemProfileRegistry) list(agentID, profileType string) []*systemProfileRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []*systemProfileRecord
	for _, p := range r.profiles {
		if agentID != "" && p.AgentID != agentID {
			continue
		}
		if profileType != "" && p.ProfileType != profileType {
			continue
		}
		out = append(out, p)
	}
	return out
}

func (r *systemProfileRegistry) get(id string) (*systemProfileRecord, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.profiles {
		if p.ProfileID == id {
			return p, true
		}
	}
	return nil, false
}

// ── Profiling Job Registry ───────────────────────────────────────────────

type profilingJob struct {
	JobID       string    `json:"job_id"`
	AgentID     string    `json:"agent_id"`
	ProfileType string    `json:"profile_type"`
	DurationSec int       `json:"duration_sec"`
	Target      string    `json:"target"`
	Status      string    `json:"status"` // pending, running, completed, failed
	CreatedAt   time.Time `json:"created_at"`
	ProfileID   string    `json:"profile_id,omitempty"`
}

type profilingJobRegistry struct {
	mu   sync.RWMutex
	jobs []*profilingJob
	seq  int
}

func newProfilingJobRegistry() *profilingJobRegistry {
	return &profilingJobRegistry{}
}

func (r *profilingJobRegistry) create(agentID, profileType, target string, durationSec int) *profilingJob {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	j := &profilingJob{
		JobID:       fmt.Sprintf("pjob-%04d", r.seq),
		AgentID:     agentID,
		ProfileType: profileType,
		DurationSec: durationSec,
		Target:      target,
		Status:      "pending",
		CreatedAt:   time.Now().UTC(),
	}
	r.jobs = append(r.jobs, j)
	return j
}

func (r *profilingJobRegistry) get(jobID string) (*profilingJob, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, j := range r.jobs {
		if j.JobID == jobID {
			return j, true
		}
	}
	return nil, false
}

// ── Route Registration ──────────────────────────────────────────────────

// registerFlamegraphRoutes registers all perf/eBPF flamegraph API routes.
func registerFlamegraphRoutes(mux *http.ServeMux, store storage.StorageBackend) {
	profReg := newSystemProfileRegistry()
	jobReg := newProfilingJobRegistry()

	// Seed demo profiles
	seedDemoProfiles(profReg)

	// POST /api/v1/profiling/system/upload — agent uploads folded stack
	mux.HandleFunc("POST /api/v1/profiling/system/upload", func(w http.ResponseWriter, r *http.Request) {
		handleUploadSystemProfile(w, r, profReg, store)
	})

	// GET /api/v1/profiling/flamegraph — generate flamegraph
	mux.HandleFunc("GET /api/v1/profiling/flamegraph", func(w http.ResponseWriter, r *http.Request) {
		handleGetFlamegraph(w, r, profReg, store)
	})

	// GET /api/v1/profiling/stacks — raw folded stack data
	mux.HandleFunc("GET /api/v1/profiling/stacks", func(w http.ResponseWriter, r *http.Request) {
		handleGetStacks(w, r, profReg, store)
	})

	// POST /api/v1/profiling/trigger — trigger profiling
	mux.HandleFunc("POST /api/v1/profiling/trigger", func(w http.ResponseWriter, r *http.Request) {
		handleTriggerProfiling(w, r, jobReg)
	})

	// GET /api/v1/profiling/system/profiles — list profiles
	mux.HandleFunc("GET /api/v1/profiling/system/profiles", func(w http.ResponseWriter, r *http.Request) {
		handleListSystemProfiles(w, r, profReg)
	})
}

// ── Handlers ────────────────────────────────────────────────────────────

func handleUploadSystemProfile(w http.ResponseWriter, r *http.Request, reg *systemProfileRegistry, store storage.StorageBackend) {
	agentID := r.Header.Get("X-Agent-ID")
	if agentID == "" {
		agentID = r.URL.Query().Get("agent_id")
	}
	if agentID == "" {
		http.Error(w, "agent_id required", http.StatusBadRequest)
		return
	}

	profileType := r.URL.Query().Get("type")
	if profileType == "" {
		profileType = "cpu"
	}

	hostname := r.URL.Query().Get("hostname")

	// Read gzip-compressed folded stack
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024*1024)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	profileID := fmt.Sprintf("sys-prof-%s-%d", agentID, now.UnixMilli())
	storageKey := storage.PerfProfileKey(agentID, profileType, profileID, now)

	// Store the compressed data
	if store != nil {
		if _, err := store.Put(r.Context(), storageKey, data, map[string]string{
			"agent_id":     agentID,
			"profile_type": profileType,
			"hostname":     hostname,
		}); err != nil {
			slog.Error("failed to store profile", "key", storageKey, "error", err)
		}
	}

	// Count samples by decompressing
	var totalSamples int64
	var symbolResolved, symbolUnknown, symbolJIT int
	gr, err := gzip.NewReader(strings.NewReader(string(data)))
	if err == nil {
		raw, _ := io.ReadAll(gr)
		gr.Close()
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			idx := strings.LastIndex(line, " ")
			if idx < 0 {
				continue
			}
			var n int64
			fmt.Sscanf(strings.TrimSpace(line[idx+1:]), "%d", &n)
			totalSamples += n

			// Count symbol types
			stackPart := line[:idx]
			frames := strings.Split(stackPart, ";")
			for _, f := range frames {
				if f == "[unknown]" {
					symbolUnknown++
				} else if strings.HasPrefix(f, "JIT:") || strings.Contains(f, "$lambda") {
					symbolJIT++
				} else {
					symbolResolved++
				}
			}
		}
	}

	rec := &systemProfileRecord{
		ProfileID:         profileID,
		AgentID:           agentID,
		Hostname:          hostname,
		ProfileType:       profileType,
		Target:            r.URL.Query().Get("target"),
		SamplingFrequency: 99,
		DurationSec:       30,
		TotalSamples:      totalSamples,
		StackDepth:        127,
		SizeBytes:         len(data),
		CapturedAt:        now,
		StorageKey:        storageKey,
		SymbolStats: symbolStatsRecord{
			Resolved: symbolResolved,
			Unknown:  symbolUnknown,
			JIT:      symbolJIT,
		},
	}
	reg.add(rec)

	slog.Info("system profile uploaded",
		"profile_id", profileID,
		"agent_id", agentID,
		"type", profileType,
		"samples", totalSamples,
		"size", len(data),
	)

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"profile_id":    profileID,
		"storage_key":   storageKey,
		"total_samples": totalSamples,
		"status":        "accepted",
	})
}

func handleGetFlamegraph(w http.ResponseWriter, r *http.Request, reg *systemProfileRegistry, store storage.StorageBackend) {
	profileID := r.URL.Query().Get("profile_id")
	agentID := r.URL.Query().Get("agent_id")
	profileType := r.URL.Query().Get("type")
	format := r.URL.Query().Get("format")
	diffFrom := r.URL.Query().Get("diff_from")
	diffTo := r.URL.Query().Get("diff_to")

	if format == "" {
		format = "json"
	}

	// Diff mode
	if diffFrom != "" && diffTo != "" {
		handleDiffFlamegraph(w, r, reg, store, diffFrom, diffTo, format)
		return
	}

	// If profile_id given, use it directly
	if profileID == "" && agentID != "" {
		// Find the latest profile for this agent
		profiles := reg.list(agentID, profileType)
		if len(profiles) > 0 {
			profileID = profiles[len(profiles)-1].ProfileID
		}
	}

	// Demo mode: generate from demo data if no real profile
	if profileID == "" || strings.HasPrefix(profileID, "demo-") {
		if profileType == "" {
			profileType = "cpu"
		}
		foldedData := demoFoldedStacks(profileType)
		root := profiling.ParseCollapsedStacks(foldedData)

		if format == "svg" {
			svg := GenerateFlamegraphSVG(root, profileType, 1200, fmt.Sprintf("System Flamegraph — %s", profileType))
			w.Header().Set("Content-Type", "image/svg+xml")
			w.WriteHeader(http.StatusOK)
			w.Write(svg)
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"profileId":    profileID,
			"profileType":  profileType,
			"agentId":      agentID,
			"hostname":     "demo-host",
			"totalSamples": root.Value,
			"durationSec":  30,
			"capturedAt":   time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339),
			"root":         root,
		})
		return
	}

	// Load from registry
	rec, ok := reg.get(profileID)
	if !ok {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}

	// Load folded stacks from storage
	foldedData := loadFoldedStackData(r, rec, store)
	if foldedData == nil {
		// Fallback to demo data
		foldedData = demoFoldedStacks(rec.ProfileType)
	}

	root := profiling.ParseCollapsedStacks(foldedData)

	if format == "svg" {
		title := fmt.Sprintf("System Flamegraph — %s — %s", rec.ProfileType, rec.AgentID)
		svg := GenerateFlamegraphSVG(root, rec.ProfileType, 1200, title)
		w.Header().Set("Content-Type", "image/svg+xml")
		w.WriteHeader(http.StatusOK)
		w.Write(svg)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"profileId":    rec.ProfileID,
		"profileType":  rec.ProfileType,
		"agentId":      rec.AgentID,
		"hostname":     rec.Hostname,
		"totalSamples": root.Value,
		"durationSec":  rec.DurationSec,
		"capturedAt":   rec.CapturedAt.Format(time.RFC3339),
		"root":         root,
	})
}

func handleDiffFlamegraph(w http.ResponseWriter, r *http.Request, reg *systemProfileRegistry, store storage.StorageBackend, baseID, targetID, format string) {
	baseFolded := loadProfileFolded(r, reg, store, baseID)
	targetFolded := loadProfileFolded(r, reg, store, targetID)

	if baseFolded == nil {
		baseFolded = demoFoldedStacks("cpu")
	}
	if targetFolded == nil {
		targetFolded = demoFoldedStacksVariant("cpu")
	}

	baseRoot := profiling.ParseCollapsedStacks(baseFolded)
	targetRoot := profiling.ParseCollapsedStacks(targetFolded)
	diffRoot := profiling.DiffFlameGraphs(baseRoot, targetRoot)

	if format == "svg" {
		svg := GenerateDiffFlamegraphSVG(diffRoot, 1200, "Differential Flamegraph")
		w.Header().Set("Content-Type", "image/svg+xml")
		w.WriteHeader(http.StatusOK)
		w.Write(svg)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"base_profile_id":   baseID,
		"target_profile_id": targetID,
		"root":              diffRoot,
	})
}

func handleGetStacks(w http.ResponseWriter, r *http.Request, reg *systemProfileRegistry, store storage.StorageBackend) {
	profileID := r.URL.Query().Get("profile_id")
	if profileID == "" {
		http.Error(w, "profile_id required", http.StatusBadRequest)
		return
	}

	rec, ok := reg.get(profileID)
	if !ok {
		// Demo fallback
		w.Header().Set("Content-Type", "application/gzip")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.folded.gz", profileID))
		w.WriteHeader(http.StatusOK)
		data := demoFoldedStacks("cpu")
		gz := gzip.NewWriter(w)
		gz.Write(data)
		gz.Close()
		return
	}

	if store != nil && rec.StorageKey != "" {
		data, err := store.Get(r.Context(), rec.StorageKey)
		if err == nil {
			w.Header().Set("Content-Type", "application/gzip")
			w.Header().Set("Content-Disposition",
				fmt.Sprintf("attachment; filename=%s.folded.gz", rec.ProfileID))
			w.WriteHeader(http.StatusOK)
			w.Write(data)
			return
		}
	}

	http.Error(w, "stacks not available", http.StatusNotFound)
}

func handleTriggerProfiling(w http.ResponseWriter, r *http.Request, jobReg *profilingJobRegistry) {
	var req struct {
		AgentID     string `json:"agent_id"`
		ProfileType string `json:"profile_type"`
		DurationSec int    `json:"duration_sec"`
		Target      string `json:"target"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if req.AgentID == "" {
		http.Error(w, "agent_id required", http.StatusBadRequest)
		return
	}
	if req.ProfileType == "" {
		req.ProfileType = "cpu"
	}
	if req.DurationSec <= 0 {
		req.DurationSec = 30
	}
	if req.DurationSec > 300 {
		http.Error(w, "duration_sec max is 300", http.StatusBadRequest)
		return
	}
	if req.Target == "" {
		req.Target = "all"
	}

	job := jobReg.create(req.AgentID, req.ProfileType, req.Target, req.DurationSec)

	slog.Info("profiling job created",
		"job_id", job.JobID,
		"agent_id", req.AgentID,
		"type", req.ProfileType,
	)

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":       job.JobID,
		"status":       job.Status,
		"agent_id":     job.AgentID,
		"profile_type": job.ProfileType,
		"duration_sec": job.DurationSec,
		"target":       job.Target,
	})
}

func handleListSystemProfiles(w http.ResponseWriter, r *http.Request, reg *systemProfileRegistry) {
	agentID := r.URL.Query().Get("agent_id")
	profileType := r.URL.Query().Get("type")

	profiles := reg.list(agentID, profileType)
	if len(profiles) == 0 {
		profiles = demoSystemProfiles()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": profiles,
		"total": len(profiles),
	})
}

// ── Helpers ─────────────────────────────────────────────────────────────

func loadFoldedStackData(r *http.Request, rec *systemProfileRecord, store storage.StorageBackend) []byte {
	if store == nil || rec.StorageKey == "" {
		return nil
	}
	data, err := store.Get(r.Context(), rec.StorageKey)
	if err != nil {
		return nil
	}
	// Decompress
	gr, err := gzip.NewReader(strings.NewReader(string(data)))
	if err != nil {
		return data
	}
	raw, err := io.ReadAll(gr)
	gr.Close()
	if err != nil {
		return data
	}
	return raw
}

func loadProfileFolded(r *http.Request, reg *systemProfileRegistry, store storage.StorageBackend, profileID string) []byte {
	rec, ok := reg.get(profileID)
	if !ok {
		return nil
	}
	return loadFoldedStackData(r, rec, store)
}

// ── Demo Data ───────────────────────────────────────────────────────────

func seedDemoProfiles(reg *systemProfileRegistry) {
	now := time.Now().UTC()
	demos := demoSystemProfiles()
	for _, d := range demos {
		reg.add(d)
	}
	_ = now
}

func demoSystemProfiles() []*systemProfileRecord {
	now := time.Now().UTC()
	return []*systemProfileRecord{
		{
			ProfileID: "sys-prof-demo-001", AgentID: "agent-01", Hostname: "prod-api-01",
			ProfileType: "cpu", Target: "all", SamplingFrequency: 99, DurationSec: 30,
			TotalSamples: 29700, StackDepth: 127, SizeBytes: 384000,
			CapturedAt: now.Add(-2 * time.Hour),
			SymbolStats: symbolStatsRecord{Resolved: 4250, Unknown: 180, JIT: 0},
		},
		{
			ProfileID: "sys-prof-demo-002", AgentID: "agent-01", Hostname: "prod-api-01",
			ProfileType: "offcpu", Target: "all", SamplingFrequency: 0, DurationSec: 30,
			TotalSamples: 15800, StackDepth: 127, SizeBytes: 256000,
			CapturedAt: now.Add(-2 * time.Hour),
			SymbolStats: symbolStatsRecord{Resolved: 2100, Unknown: 320, JIT: 0},
		},
		{
			ProfileID: "sys-prof-demo-003", AgentID: "agent-02", Hostname: "prod-gpu-01",
			ProfileType: "cpu", Target: "pid:12345", SamplingFrequency: 99, DurationSec: 60,
			TotalSamples: 59400, StackDepth: 127, SizeBytes: 720000,
			CapturedAt: now.Add(-1 * time.Hour),
			SymbolStats: symbolStatsRecord{Resolved: 8900, Unknown: 420, JIT: 1200},
		},
		{
			ProfileID: "sys-prof-demo-004", AgentID: "agent-03", Hostname: "prod-gpu-02",
			ProfileType: "memory", Target: "pid:54321", SamplingFrequency: 0, DurationSec: 30,
			TotalSamples: 8200, StackDepth: 64, SizeBytes: 128000,
			CapturedAt: now.Add(-30 * time.Minute),
			SymbolStats: symbolStatsRecord{Resolved: 1500, Unknown: 90, JIT: 350},
		},
		{
			ProfileID: "sys-prof-demo-005", AgentID: "agent-01", Hostname: "prod-api-01",
			ProfileType: "cpu", Target: "all", SamplingFrequency: 99, DurationSec: 30,
			TotalSamples: 31200, StackDepth: 127, SizeBytes: 398000,
			CapturedAt: now.Add(-15 * time.Minute),
			SymbolStats: symbolStatsRecord{Resolved: 4400, Unknown: 150, JIT: 0},
		},
	}
}

func demoFoldedStacks(profileType string) []byte {
	switch profileType {
	case "offcpu":
		return []byte(`java;java_start;main;HttpServer.handle;OrderService.createOrder;DB.query;java.net.SocketInputStream.read;__GI___libc_read;entry_SYSCALL_64;do_syscall_64;ksys_read;vfs_read;ext4_file_read_iter;io_schedule 42000
java;java_start;main;HttpServer.handle;UserService.authenticate;Redis.get;java.net.SocketInputStream.read;__GI___libc_read;entry_SYSCALL_64;do_syscall_64;ksys_read;io_schedule 18500
kthread;worker_thread;process_one_work;flush_to_ldisc;io_schedule 3200
java;java_start;main;GCThread.run;ParallelScavengeHeap.collect;PSPromotionManager.drain;futex_wait;entry_SYSCALL_64;do_syscall_64;do_futex;futex_wait_queue 8800
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;run_mod;PyEval_EvalCode;_PyEval_EvalFrameDefault;app.main;httpserver.serve;handler.process;db.query;socketmodule.connect;entry_SYSCALL_64;do_syscall_64;io_schedule 12400
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;database/sql.(*DB).QueryContext;net.(*conn).Read;entry_SYSCALL_64;do_syscall_64;io_schedule 9800
node;node::Start;uv_run;node::binding::HTTPParser;onIncoming;requestHandler;pool.query;net.Socket.write;entry_SYSCALL_64;do_syscall_64;io_schedule 7600
`)
	case "memory":
		return []byte(`java;java_start;main;HttpServer.handle;OrderService.createOrder;ArrayList.<init>;Unsafe.allocateMemory 524288
java;java_start;main;HttpServer.handle;OrderService.createOrder;DB.query;PreparedStatement.executeQuery;ByteBuffer.allocate 2097152
java;java_start;main;HttpServer.handle;ResponseBuilder.toJSON;Jackson.serialize;ByteArrayOutputStream.grow 1048576
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;app.main;handler.process;numpy.array;PyArray_NewFromDescr;PyDataMem_NEW 4194304
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;app.main;handler.process;pandas.DataFrame.from_records;_libs.lib.fast_multiget;PyObject_Malloc 8388608
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;encoding/json.Marshal;runtime.mallocgc 262144
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;bytes.(*Buffer).grow;runtime.mallocgc 131072
node;node::Start;uv_run;onIncoming;requestHandler;Buffer.alloc;node::Buffer::New 1048576
kthread;worker_thread;alloc_pages;__alloc_pages_nodemask 16777216
`)
	default: // cpu
		return []byte(`java;java_start;main;HttpServer.handle;OrderService.createOrder;DB.query;java.net.SocketInputStream.read 42
java;java_start;main;HttpServer.handle;OrderService.createOrder;DB.query;ResultSetParser.parse 28
java;java_start;main;HttpServer.handle;OrderService.createOrder;Validator.validate 15
java;java_start;main;HttpServer.handle;UserService.authenticate;BCrypt.hashpw 65
java;java_start;main;HttpServer.handle;UserService.authenticate;Redis.get 8
java;java_start;main;HttpServer.handle;ResponseBuilder.toJSON;Jackson.serialize 38
java;java_start;main;GCThread.run;ParallelScavengeHeap.collect;PSPromotionManager.drain 22
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;run_mod;PyEval_EvalCode;_PyEval_EvalFrameDefault;app.main;httpserver.serve;handler.process;transformer.predict 55
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;run_mod;PyEval_EvalCode;_PyEval_EvalFrameDefault;app.main;httpserver.serve;handler.process;db.query 18
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;run_mod;PyEval_EvalCode;_PyEval_EvalFrameDefault;app.main;gc.collect 12
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;main.processPayload;encoding/json.Unmarshal 35
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;database/sql.(*DB).QueryContext 20
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;main.validateAuth;crypto/hmac.Equal 12
go;runtime.gcBgMarkWorker;runtime.gcDrain;runtime.scanobject 18
go;runtime.mcall;runtime.schedule;runtime.findrunnable 8
node;node::Start;uv_run;node::binding::HTTPParser;onIncoming;requestHandler;processJSON;JSON.parse 25
node;node::Start;uv_run;node::binding::HTTPParser;onIncoming;requestHandler;pool.query 15
node;node::Start;uv_run;uv__io_poll;epoll_wait 10
kthread;worker_thread;io_schedule 3
swapper;cpu_startup_entry;do_idle;cpuidle_enter;intel_idle 45
`)
	}
}

func demoFoldedStacksVariant(profileType string) []byte {
	// Return a slightly different variant for diff comparison
	return []byte(`java;java_start;main;HttpServer.handle;OrderService.createOrder;DB.query;java.net.SocketInputStream.read 55
java;java_start;main;HttpServer.handle;OrderService.createOrder;DB.query;ResultSetParser.parse 32
java;java_start;main;HttpServer.handle;OrderService.createOrder;Validator.validate 12
java;java_start;main;HttpServer.handle;UserService.authenticate;BCrypt.hashpw 48
java;java_start;main;HttpServer.handle;UserService.authenticate;Redis.get 12
java;java_start;main;HttpServer.handle;ResponseBuilder.toJSON;Jackson.serialize 45
java;java_start;main;HttpServer.handle;OrderService.createOrder;CacheManager.invalidate 18
java;java_start;main;GCThread.run;ParallelScavengeHeap.collect;PSPromotionManager.drain 30
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;run_mod;PyEval_EvalCode;_PyEval_EvalFrameDefault;app.main;httpserver.serve;handler.process;transformer.predict 62
python;_start;__libc_start_main;Py_BytesMain;PyRun_SimpleFileObject;run_mod;PyEval_EvalCode;_PyEval_EvalFrameDefault;app.main;httpserver.serve;handler.process;db.query 22
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;main.processPayload;encoding/json.Unmarshal 28
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;database/sql.(*DB).QueryContext 25
go;runtime.main;main.main;net/http.(*Server).Serve;net/http.(*conn).serve;main.handleAPI;main.validateAuth;crypto/hmac.Equal 15
go;runtime.gcBgMarkWorker;runtime.gcDrain;runtime.scanobject 14
node;node::Start;uv_run;node::binding::HTTPParser;onIncoming;requestHandler;processJSON;JSON.parse 30
node;node::Start;uv_run;node::binding::HTTPParser;onIncoming;requestHandler;pool.query 20
kthread;worker_thread;io_schedule 5
swapper;cpu_startup_entry;do_idle;cpuidle_enter;intel_idle 38
`)
}
