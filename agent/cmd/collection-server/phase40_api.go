package main

// phase40_api.go — Phase 40: 출시 전 Critical 기능 보완 API
//
// Endpoints:
//   ── 40-1: RUM ──
//   GET  /api/v1/rum/sessions         — list RUM sessions
//   GET  /api/v1/rum/pages            — page-level Core Web Vitals
//   GET  /api/v1/rum/geo              — geographic latency metrics
//   GET  /api/v1/rum/stats            — RUM KPI stats
//
//   ── 40-2: Golden Signals ──
//   GET  /api/v1/golden-signals/services   — per-service golden signals
//   GET  /api/v1/golden-signals/timeseries — time-series data
//   GET  /api/v1/golden-signals/stats      — aggregated KPI
//
//   ── 40-3: Python Runtime ──
//   GET  /api/v1/runtime/python            — Python runtime metrics
//   GET  /api/v1/runtime/python/stats      — Python KPI
//
//   ── 40-4: .NET Runtime ──
//   GET  /api/v1/runtime/dotnet            — .NET AOT metrics
//   GET  /api/v1/runtime/dotnet/stats      — .NET KPI
//
//   ── 40-5: Go Runtime ──
//   GET  /api/v1/runtime/go                — Go scheduler metrics
//   GET  /api/v1/runtime/go/histogram      — scheduler latency histogram
//   GET  /api/v1/runtime/go/stats          — Go KPI
//
//   ── 40-6: Database Monitoring ──
//   GET  /api/v1/database/instances        — DB instance list
//   GET  /api/v1/database/slow-queries     — slow query list
//   GET  /api/v1/database/locks            — active lock list
//   GET  /api/v1/database/wait-events      — wait event summary
//   GET  /api/v1/database/stats            — DB KPI

import (
	"math"
	"net/http"
	"time"
)

// ═══════════════════════════════════════════════════════════════════════════════
// 40-1: RUM (Real User Monitoring)
// ═══════════════════════════════════════════════════════════════════════════════

type rumSession struct {
	ID                string  `json:"id"`
	UserID            string  `json:"user_id"`
	PageURL           string  `json:"page_url"`
	Device            string  `json:"device"`
	Browser           string  `json:"browser"`
	Country           string  `json:"country"`
	LCPMs             float64 `json:"lcp_ms"`
	FIDMs             float64 `json:"fid_ms"`
	CLS               float64 `json:"cls"`
	INPMs             float64 `json:"inp_ms"`
	TTFBMs            float64 `json:"ttfb_ms"`
	FCPMs             float64 `json:"fcp_ms"`
	SessionDurationMs int64   `json:"session_duration_ms"`
	PageViews         int     `json:"page_views"`
	ErrorCount        int     `json:"error_count"`
	StartedAt         string  `json:"started_at"`
}

type rumPageMetrics struct {
	PageURL             string  `json:"page_url"`
	AvgLCPMs            float64 `json:"avg_lcp_ms"`
	AvgFIDMs            float64 `json:"avg_fid_ms"`
	AvgCLS              float64 `json:"avg_cls"`
	AvgINPMs            float64 `json:"avg_inp_ms"`
	SampleCount         int     `json:"sample_count"`
	GoodPct             float64 `json:"good_pct"`
	NeedsImprovementPct float64 `json:"needs_improvement_pct"`
	PoorPct             float64 `json:"poor_pct"`
}

type rumGeoMetrics struct {
	Region    string  `json:"region"`
	LatencyMs float64 `json:"latency_ms"`
	Sessions  int     `json:"sessions"`
	ErrorRate float64 `json:"error_rate"`
}

func demoRUMSessions() []rumSession {
	now := time.Now().UTC()
	return []rumSession{
		{ID: "rum-001", UserID: "u-1042", PageURL: "/dashboard", Device: "desktop", Browser: "Chrome 124", Country: "KR", LCPMs: 1820, FIDMs: 45, CLS: 0.05, INPMs: 120, TTFBMs: 180, FCPMs: 950, SessionDurationMs: 342000, PageViews: 12, ErrorCount: 0, StartedAt: now.Add(-15 * time.Minute).Format(time.RFC3339)},
		{ID: "rum-002", UserID: "u-2091", PageURL: "/ai/services", Device: "desktop", Browser: "Firefox 126", Country: "KR", LCPMs: 2400, FIDMs: 78, CLS: 0.08, INPMs: 180, TTFBMs: 220, FCPMs: 1100, SessionDurationMs: 185000, PageViews: 7, ErrorCount: 1, StartedAt: now.Add(-32 * time.Minute).Format(time.RFC3339)},
		{ID: "rum-003", UserID: "u-3105", PageURL: "/metrics", Device: "mobile", Browser: "Safari 18", Country: "JP", LCPMs: 3200, FIDMs: 120, CLS: 0.15, INPMs: 280, TTFBMs: 350, FCPMs: 1800, SessionDurationMs: 95000, PageViews: 4, ErrorCount: 0, StartedAt: now.Add(-48 * time.Minute).Format(time.RFC3339)},
		{ID: "rum-004", UserID: "u-4200", PageURL: "/traces", Device: "desktop", Browser: "Chrome 124", Country: "US", LCPMs: 2100, FIDMs: 55, CLS: 0.03, INPMs: 140, TTFBMs: 280, FCPMs: 1050, SessionDurationMs: 520000, PageViews: 18, ErrorCount: 0, StartedAt: now.Add(-1 * time.Hour).Format(time.RFC3339)},
		{ID: "rum-005", UserID: "u-5310", PageURL: "/infra/hosts", Device: "tablet", Browser: "Chrome 124", Country: "SG", LCPMs: 2800, FIDMs: 90, CLS: 0.12, INPMs: 220, TTFBMs: 300, FCPMs: 1400, SessionDurationMs: 132000, PageViews: 6, ErrorCount: 2, StartedAt: now.Add(-2 * time.Hour).Format(time.RFC3339)},
		{ID: "rum-006", UserID: "u-6012", PageURL: "/copilot", Device: "desktop", Browser: "Edge 124", Country: "DE", LCPMs: 1950, FIDMs: 40, CLS: 0.04, INPMs: 110, TTFBMs: 250, FCPMs: 980, SessionDurationMs: 275000, PageViews: 9, ErrorCount: 0, StartedAt: now.Add(-3 * time.Hour).Format(time.RFC3339)},
		{ID: "rum-007", UserID: "u-7088", PageURL: "/alerts", Device: "mobile", Browser: "Safari 18", Country: "KR", LCPMs: 4200, FIDMs: 180, CLS: 0.28, INPMs: 450, TTFBMs: 400, FCPMs: 2200, SessionDurationMs: 48000, PageViews: 2, ErrorCount: 1, StartedAt: now.Add(-4 * time.Hour).Format(time.RFC3339)},
		{ID: "rum-008", UserID: "u-8145", PageURL: "/dashboard", Device: "desktop", Browser: "Chrome 124", Country: "JP", LCPMs: 1650, FIDMs: 35, CLS: 0.02, INPMs: 95, TTFBMs: 160, FCPMs: 850, SessionDurationMs: 610000, PageViews: 22, ErrorCount: 0, StartedAt: now.Add(-5 * time.Hour).Format(time.RFC3339)},
	}
}

func demoRUMPages() []rumPageMetrics {
	return []rumPageMetrics{
		{PageURL: "/dashboard", AvgLCPMs: 1735, AvgFIDMs: 40, AvgCLS: 0.035, AvgINPMs: 107, SampleCount: 4820, GoodPct: 82, NeedsImprovementPct: 14, PoorPct: 4},
		{PageURL: "/ai/services", AvgLCPMs: 2400, AvgFIDMs: 78, AvgCLS: 0.08, AvgINPMs: 180, SampleCount: 2150, GoodPct: 65, NeedsImprovementPct: 25, PoorPct: 10},
		{PageURL: "/metrics", AvgLCPMs: 2850, AvgFIDMs: 95, AvgCLS: 0.11, AvgINPMs: 210, SampleCount: 3200, GoodPct: 52, NeedsImprovementPct: 32, PoorPct: 16},
		{PageURL: "/traces", AvgLCPMs: 2100, AvgFIDMs: 55, AvgCLS: 0.04, AvgINPMs: 140, SampleCount: 2800, GoodPct: 74, NeedsImprovementPct: 20, PoorPct: 6},
		{PageURL: "/infra/hosts", AvgLCPMs: 2600, AvgFIDMs: 85, AvgCLS: 0.09, AvgINPMs: 195, SampleCount: 1920, GoodPct: 58, NeedsImprovementPct: 28, PoorPct: 14},
		{PageURL: "/copilot", AvgLCPMs: 1950, AvgFIDMs: 42, AvgCLS: 0.03, AvgINPMs: 115, SampleCount: 3500, GoodPct: 78, NeedsImprovementPct: 17, PoorPct: 5},
	}
}

func demoRUMGeo() []rumGeoMetrics {
	return []rumGeoMetrics{
		{Region: "Seoul (KR)", LatencyMs: 45, Sessions: 12500, ErrorRate: 0.8},
		{Region: "Tokyo (JP)", LatencyMs: 82, Sessions: 4200, ErrorRate: 1.2},
		{Region: "Singapore (SG)", LatencyMs: 120, Sessions: 2800, ErrorRate: 1.5},
		{Region: "US-West (US)", LatencyMs: 185, Sessions: 3600, ErrorRate: 0.9},
		{Region: "Frankfurt (DE)", LatencyMs: 210, Sessions: 2100, ErrorRate: 1.1},
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 40-2: SRE Golden Signals
// ═══════════════════════════════════════════════════════════════════════════════

type goldenSignalService struct {
	ServiceName             string  `json:"service_name"`
	LatencyP50Ms            float64 `json:"latency_p50_ms"`
	LatencyP95Ms            float64 `json:"latency_p95_ms"`
	LatencyP99Ms            float64 `json:"latency_p99_ms"`
	TrafficRPM              float64 `json:"traffic_rpm"`
	ErrorRatePct            float64 `json:"error_rate_pct"`
	SaturationCPUPct        float64 `json:"saturation_cpu_pct"`
	SaturationMemPct        float64 `json:"saturation_mem_pct"`
	SLOTarget               float64 `json:"slo_target"`
	SLOCurrent              float64 `json:"slo_current"`
	ErrorBudgetRemainingPct float64 `json:"error_budget_remaining_pct"`
	BurnRate                float64 `json:"burn_rate"`
	Status                  string  `json:"status"`
}

type goldenSignalTS struct {
	Timestamp  string  `json:"timestamp"`
	LatencyP95 float64 `json:"latency_p95"`
	TrafficRPM float64 `json:"traffic_rpm"`
	ErrorRate  float64 `json:"error_rate"`
	Saturation float64 `json:"saturation"`
}

func demoGoldenSignalServices() []goldenSignalService {
	return []goldenSignalService{
		{ServiceName: "api-gateway", LatencyP50Ms: 12, LatencyP95Ms: 45, LatencyP99Ms: 120, TrafficRPM: 8500, ErrorRatePct: 0.12, SaturationCPUPct: 42, SaturationMemPct: 58, SLOTarget: 99.95, SLOCurrent: 99.97, ErrorBudgetRemainingPct: 62, BurnRate: 0.4, Status: "healthy"},
		{ServiceName: "auth-service", LatencyP50Ms: 8, LatencyP95Ms: 22, LatencyP99Ms: 55, TrafficRPM: 3200, ErrorRatePct: 0.05, SaturationCPUPct: 28, SaturationMemPct: 45, SLOTarget: 99.99, SLOCurrent: 99.995, ErrorBudgetRemainingPct: 85, BurnRate: 0.15, Status: "healthy"},
		{ServiceName: "payment-service", LatencyP50Ms: 35, LatencyP95Ms: 120, LatencyP99Ms: 350, TrafficRPM: 1200, ErrorRatePct: 0.35, SaturationCPUPct: 55, SaturationMemPct: 62, SLOTarget: 99.9, SLOCurrent: 99.82, ErrorBudgetRemainingPct: 18, BurnRate: 1.8, Status: "warning"},
		{ServiceName: "recommendation-engine", LatencyP50Ms: 85, LatencyP95Ms: 250, LatencyP99Ms: 680, TrafficRPM: 4500, ErrorRatePct: 1.2, SaturationCPUPct: 78, SaturationMemPct: 72, SLOTarget: 99.5, SLOCurrent: 99.1, ErrorBudgetRemainingPct: 8, BurnRate: 2.4, Status: "critical"},
		{ServiceName: "search-service", LatencyP50Ms: 18, LatencyP95Ms: 65, LatencyP99Ms: 180, TrafficRPM: 6200, ErrorRatePct: 0.08, SaturationCPUPct: 35, SaturationMemPct: 52, SLOTarget: 99.9, SLOCurrent: 99.95, ErrorBudgetRemainingPct: 72, BurnRate: 0.3, Status: "healthy"},
		{ServiceName: "notification-service", LatencyP50Ms: 5, LatencyP95Ms: 15, LatencyP99Ms: 40, TrafficRPM: 2800, ErrorRatePct: 0.02, SaturationCPUPct: 18, SaturationMemPct: 35, SLOTarget: 99.9, SLOCurrent: 99.98, ErrorBudgetRemainingPct: 90, BurnRate: 0.1, Status: "healthy"},
	}
}

func demoGoldenSignalTimeSeries() []goldenSignalTS {
	now := time.Now().UTC()
	out := make([]goldenSignalTS, 0, 24)
	for i := 23; i >= 0; i-- {
		t := now.Add(-time.Duration(i) * time.Hour)
		hour := float64(t.Hour())
		// Simulate daily traffic pattern
		trafficMult := 0.5 + 0.5*math.Sin((hour-6)*math.Pi/12)
		if trafficMult < 0.3 {
			trafficMult = 0.3
		}
		out = append(out, goldenSignalTS{
			Timestamp:  t.Format(time.RFC3339),
			LatencyP95: 40 + 30*trafficMult + float64(i%5)*3,
			TrafficRPM: 2000 + 6000*trafficMult,
			ErrorRate:  0.1 + 0.2*trafficMult,
			Saturation: 30 + 35*trafficMult,
		})
	}
	return out
}

// ═══════════════════════════════════════════════════════════════════════════════
// 40-3: Python Runtime
// ═══════════════════════════════════════════════════════════════════════════════

type pythonRuntimeMetrics struct {
	AgentID                string  `json:"agent_id"`
	Hostname               string  `json:"hostname"`
	PythonVersion          string  `json:"python_version"`
	IsFreeThreaded         bool    `json:"is_free_threaded"`
	GILContentionPct       float64 `json:"gil_contention_pct"`
	FreeThreadUtilPct      float64 `json:"free_thread_utilization_pct"`
	ActiveThreads          int     `json:"active_threads"`
	AsyncioTasksPending    int     `json:"asyncio_tasks_pending"`
	AsyncioTasksRunning    int     `json:"asyncio_tasks_running"`
	GCGen0Collections      int     `json:"gc_gen0_collections"`
	GCGen1Collections      int     `json:"gc_gen1_collections"`
	GCGen2Collections      int     `json:"gc_gen2_collections"`
	GCGen0TimeMs           float64 `json:"gc_gen0_time_ms"`
	GCGen1TimeMs           float64 `json:"gc_gen1_time_ms"`
	GCGen2TimeMs           float64 `json:"gc_gen2_time_ms"`
	GCTotalPauseMs         float64 `json:"gc_total_pause_ms"`
	MemoryRSSMB            float64 `json:"memory_rss_mb"`
	CollectedAt            string  `json:"collected_at"`
}

func demoPythonMetrics() []pythonRuntimeMetrics {
	now := time.Now().UTC().Format(time.RFC3339)
	return []pythonRuntimeMetrics{
		{AgentID: "py-001", Hostname: "ml-worker-01", PythonVersion: "3.13.1t", IsFreeThreaded: true, GILContentionPct: 0, FreeThreadUtilPct: 78.5, ActiveThreads: 16, AsyncioTasksPending: 42, AsyncioTasksRunning: 8, GCGen0Collections: 1250, GCGen1Collections: 85, GCGen2Collections: 12, GCGen0TimeMs: 2.1, GCGen1TimeMs: 8.5, GCGen2TimeMs: 45.2, GCTotalPauseMs: 55.8, MemoryRSSMB: 2048, CollectedAt: now},
		{AgentID: "py-002", Hostname: "ml-worker-02", PythonVersion: "3.13.1t", IsFreeThreaded: true, GILContentionPct: 0, FreeThreadUtilPct: 82.3, ActiveThreads: 16, AsyncioTasksPending: 28, AsyncioTasksRunning: 12, GCGen0Collections: 980, GCGen1Collections: 72, GCGen2Collections: 8, GCGen0TimeMs: 1.8, GCGen1TimeMs: 7.2, GCGen2TimeMs: 38.5, GCTotalPauseMs: 47.5, MemoryRSSMB: 1856, CollectedAt: now},
		{AgentID: "py-003", Hostname: "api-server-01", PythonVersion: "3.12.8", IsFreeThreaded: false, GILContentionPct: 32.5, FreeThreadUtilPct: 0, ActiveThreads: 8, AsyncioTasksPending: 120, AsyncioTasksRunning: 4, GCGen0Collections: 2400, GCGen1Collections: 160, GCGen2Collections: 22, GCGen0TimeMs: 3.5, GCGen1TimeMs: 12.8, GCGen2TimeMs: 62.0, GCTotalPauseMs: 78.3, MemoryRSSMB: 1024, CollectedAt: now},
		{AgentID: "py-004", Hostname: "api-server-02", PythonVersion: "3.12.8", IsFreeThreaded: false, GILContentionPct: 28.1, FreeThreadUtilPct: 0, ActiveThreads: 8, AsyncioTasksPending: 95, AsyncioTasksRunning: 4, GCGen0Collections: 2100, GCGen1Collections: 145, GCGen2Collections: 18, GCGen0TimeMs: 3.2, GCGen1TimeMs: 11.5, GCGen2TimeMs: 55.0, GCTotalPauseMs: 69.7, MemoryRSSMB: 980, CollectedAt: now},
		{AgentID: "py-005", Hostname: "etl-runner-01", PythonVersion: "3.11.9", IsFreeThreaded: false, GILContentionPct: 45.2, FreeThreadUtilPct: 0, ActiveThreads: 4, AsyncioTasksPending: 8, AsyncioTasksRunning: 2, GCGen0Collections: 3200, GCGen1Collections: 210, GCGen2Collections: 35, GCGen0TimeMs: 4.8, GCGen1TimeMs: 18.2, GCGen2TimeMs: 85.0, GCTotalPauseMs: 108.0, MemoryRSSMB: 4096, CollectedAt: now},
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 40-4: .NET AOT Runtime
// ═══════════════════════════════════════════════════════════════════════════════

type dotnetAOTMetrics struct {
	AgentID                string  `json:"agent_id"`
	Hostname               string  `json:"hostname"`
	DotNetVersion          string  `json:"dotnet_version"`
	IsNativeAOT            bool    `json:"is_native_aot"`
	ThreadPoolThreads      int     `json:"threadpool_threads"`
	ThreadPoolQueueLength  int     `json:"threadpool_queue_length"`
	ThreadPoolCompleted    int64   `json:"threadpool_completed"`
	ThreadPoolStarvation   int     `json:"threadpool_starvation_count"`
	GCPauseTimeMs          float64 `json:"gc_pause_time_ms"`
	GCSuspensionTimeMs     float64 `json:"gc_suspension_time_ms"`
	GCHeapSizeMB           float64 `json:"gc_heap_size_mb"`
	GCGen0Count            int     `json:"gc_gen0_count"`
	GCGen1Count            int     `json:"gc_gen1_count"`
	GCGen2Count            int     `json:"gc_gen2_count"`
	GCFragmentationPct     float64 `json:"gc_fragmentation_pct"`
	AOTReflectionWarnings  int     `json:"aot_reflection_warnings"`
	AOTTrimmingWarnings    int     `json:"aot_trimming_warnings"`
	JITCompiledMethods     int     `json:"jit_compiled_methods"`
	MemoryWorkingSetMB     float64 `json:"memory_working_set_mb"`
	CollectedAt            string  `json:"collected_at"`
}

func demoDotNetMetrics() []dotnetAOTMetrics {
	now := time.Now().UTC().Format(time.RFC3339)
	return []dotnetAOTMetrics{
		{AgentID: "dn-001", Hostname: "web-prod-01", DotNetVersion: "9.0.2-aot", IsNativeAOT: true, ThreadPoolThreads: 12, ThreadPoolQueueLength: 2, ThreadPoolCompleted: 1250000, ThreadPoolStarvation: 0, GCPauseTimeMs: 1.2, GCSuspensionTimeMs: 0.3, GCHeapSizeMB: 128, GCGen0Count: 4500, GCGen1Count: 320, GCGen2Count: 18, GCFragmentationPct: 8.5, AOTReflectionWarnings: 3, AOTTrimmingWarnings: 1, JITCompiledMethods: 0, MemoryWorkingSetMB: 85, CollectedAt: now},
		{AgentID: "dn-002", Hostname: "web-prod-02", DotNetVersion: "9.0.2-aot", IsNativeAOT: true, ThreadPoolThreads: 14, ThreadPoolQueueLength: 5, ThreadPoolCompleted: 1180000, ThreadPoolStarvation: 2, GCPauseTimeMs: 1.5, GCSuspensionTimeMs: 0.4, GCHeapSizeMB: 142, GCGen0Count: 4800, GCGen1Count: 350, GCGen2Count: 22, GCFragmentationPct: 12.3, AOTReflectionWarnings: 5, AOTTrimmingWarnings: 2, JITCompiledMethods: 0, MemoryWorkingSetMB: 92, CollectedAt: now},
		{AgentID: "dn-003", Hostname: "api-prod-01", DotNetVersion: "8.0.11", IsNativeAOT: false, ThreadPoolThreads: 24, ThreadPoolQueueLength: 12, ThreadPoolCompleted: 2800000, ThreadPoolStarvation: 8, GCPauseTimeMs: 4.8, GCSuspensionTimeMs: 1.2, GCHeapSizeMB: 512, GCGen0Count: 12000, GCGen1Count: 850, GCGen2Count: 65, GCFragmentationPct: 22.5, AOTReflectionWarnings: 0, AOTTrimmingWarnings: 0, JITCompiledMethods: 28500, MemoryWorkingSetMB: 380, CollectedAt: now},
		{AgentID: "dn-004", Hostname: "worker-01", DotNetVersion: "9.0.2", IsNativeAOT: false, ThreadPoolThreads: 32, ThreadPoolQueueLength: 8, ThreadPoolCompleted: 3500000, ThreadPoolStarvation: 15, GCPauseTimeMs: 6.2, GCSuspensionTimeMs: 1.8, GCHeapSizeMB: 768, GCGen0Count: 18000, GCGen1Count: 1200, GCGen2Count: 95, GCFragmentationPct: 35.2, AOTReflectionWarnings: 0, AOTTrimmingWarnings: 0, JITCompiledMethods: 42000, MemoryWorkingSetMB: 520, CollectedAt: now},
		{AgentID: "dn-005", Hostname: "scheduler-01", DotNetVersion: "8.0.11", IsNativeAOT: false, ThreadPoolThreads: 16, ThreadPoolQueueLength: 3, ThreadPoolCompleted: 950000, ThreadPoolStarvation: 1, GCPauseTimeMs: 3.2, GCSuspensionTimeMs: 0.8, GCHeapSizeMB: 256, GCGen0Count: 8500, GCGen1Count: 580, GCGen2Count: 42, GCFragmentationPct: 18.0, AOTReflectionWarnings: 0, AOTTrimmingWarnings: 0, JITCompiledMethods: 18200, MemoryWorkingSetMB: 195, CollectedAt: now},
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 40-5: Go Scheduler
// ═══════════════════════════════════════════════════════════════════════════════

type goSchedulerMetrics struct {
	AgentID            string  `json:"agent_id"`
	Hostname           string  `json:"hostname"`
	GoVersion          string  `json:"go_version"`
	SchedLatencyP50Us  float64 `json:"sched_latency_p50_us"`
	SchedLatencyP95Us  float64 `json:"sched_latency_p95_us"`
	SchedLatencyP99Us  float64 `json:"sched_latency_p99_us"`
	GCSTWPauseUs       float64 `json:"gc_stw_pause_us"`
	GCSTWFrequency     float64 `json:"gc_stw_frequency"`
	GoroutinesTotal    int     `json:"goroutines_total"`
	GoroutinesRunnable int     `json:"goroutines_runnable"`
	GoroutinesWaiting  int     `json:"goroutines_waiting"`
	GOMAXPROCS         int     `json:"gomaxprocs"`
	CgoCalls           int64   `json:"cgo_calls"`
	HeapAllocMB        float64 `json:"heap_alloc_mb"`
	HeapSysMB          float64 `json:"heap_sys_mb"`
	StackInUseMB       float64 `json:"stack_inuse_mb"`
	CollectedAt        string  `json:"collected_at"`
}

type goSchedHistogramBucket struct {
	LeUs  float64 `json:"le_us"`
	Count int64   `json:"count"`
}

func demoGoSchedulerMetrics() []goSchedulerMetrics {
	now := time.Now().UTC().Format(time.RFC3339)
	return []goSchedulerMetrics{
		{AgentID: "go-001", Hostname: "ingestion-01", GoVersion: "go1.24.1", SchedLatencyP50Us: 8.2, SchedLatencyP95Us: 65, SchedLatencyP99Us: 180, GCSTWPauseUs: 120, GCSTWFrequency: 2.5, GoroutinesTotal: 4500, GoroutinesRunnable: 120, GoroutinesWaiting: 4200, GOMAXPROCS: 16, CgoCalls: 0, HeapAllocMB: 256, HeapSysMB: 512, StackInUseMB: 32, CollectedAt: now},
		{AgentID: "go-002", Hostname: "collector-01", GoVersion: "go1.24.1", SchedLatencyP50Us: 12.5, SchedLatencyP95Us: 95, SchedLatencyP99Us: 350, GCSTWPauseUs: 200, GCSTWFrequency: 3.2, GoroutinesTotal: 8200, GoroutinesRunnable: 280, GoroutinesWaiting: 7500, GOMAXPROCS: 16, CgoCalls: 48000, HeapAllocMB: 512, HeapSysMB: 1024, StackInUseMB: 64, CollectedAt: now},
		{AgentID: "go-003", Hostname: "gateway-01", GoVersion: "go1.24.1", SchedLatencyP50Us: 5.8, SchedLatencyP95Us: 42, SchedLatencyP99Us: 120, GCSTWPauseUs: 85, GCSTWFrequency: 1.8, GoroutinesTotal: 2800, GoroutinesRunnable: 95, GoroutinesWaiting: 2600, GOMAXPROCS: 8, CgoCalls: 0, HeapAllocMB: 128, HeapSysMB: 256, StackInUseMB: 18, CollectedAt: now},
		{AgentID: "go-004", Hostname: "worker-01", GoVersion: "go1.24.1", SchedLatencyP50Us: 18.5, SchedLatencyP95Us: 180, SchedLatencyP99Us: 850, GCSTWPauseUs: 350, GCSTWFrequency: 4.5, GoroutinesTotal: 15200, GoroutinesRunnable: 520, GoroutinesWaiting: 14000, GOMAXPROCS: 32, CgoCalls: 125000, HeapAllocMB: 1024, HeapSysMB: 2048, StackInUseMB: 128, CollectedAt: now},
		{AgentID: "go-005", Hostname: "processor-01", GoVersion: "go1.24.1", SchedLatencyP50Us: 10.2, SchedLatencyP95Us: 78, SchedLatencyP99Us: 220, GCSTWPauseUs: 150, GCSTWFrequency: 2.8, GoroutinesTotal: 6400, GoroutinesRunnable: 180, GoroutinesWaiting: 5800, GOMAXPROCS: 16, CgoCalls: 32000, HeapAllocMB: 384, HeapSysMB: 768, StackInUseMB: 48, CollectedAt: now},
		{AgentID: "go-006", Hostname: "legacy-api-01", GoVersion: "go1.22.8", SchedLatencyP50Us: 22.0, SchedLatencyP95Us: 250, SchedLatencyP99Us: 1200, GCSTWPauseUs: 480, GCSTWFrequency: 5.2, GoroutinesTotal: 3200, GoroutinesRunnable: 150, GoroutinesWaiting: 2800, GOMAXPROCS: 8, CgoCalls: 0, HeapAllocMB: 192, HeapSysMB: 384, StackInUseMB: 24, CollectedAt: now},
	}
}

func demoGoHistogram() []goSchedHistogramBucket {
	return []goSchedHistogramBucket{
		{LeUs: 1, Count: 125000},
		{LeUs: 10, Count: 480000},
		{LeUs: 100, Count: 320000},
		{LeUs: 500, Count: 85000},
		{LeUs: 1000, Count: 32000},
		{LeUs: 5000, Count: 8500},
		{LeUs: 10000, Count: 2200},
		{LeUs: 50000, Count: 450},
		{LeUs: 100000, Count: 85},
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 40-6: Database Monitoring
// ═══════════════════════════════════════════════════════════════════════════════

type dbInstance struct {
	ID                string  `json:"id"`
	Engine            string  `json:"engine"`
	Hostname          string  `json:"hostname"`
	Port              int     `json:"port"`
	Version           string  `json:"version"`
	Status            string  `json:"status"`
	ConnectionsActive int     `json:"connections_active"`
	ConnectionsMax    int     `json:"connections_max"`
	QPS               float64 `json:"qps"`
	AvgQueryTimeMs    float64 `json:"avg_query_time_ms"`
	CacheHitRatio     float64 `json:"cache_hit_ratio"`
	ReplicationLagMs  float64 `json:"replication_lag_ms"`
	DiskUsagePct      float64 `json:"disk_usage_pct"`
	CollectedAt       string  `json:"collected_at"`
}

type dbSlowQuery struct {
	ID              string  `json:"id"`
	DBInstanceID    string  `json:"db_instance_id"`
	QueryText       string  `json:"query_text"`
	QueryHash       string  `json:"query_hash"`
	Calls           int64   `json:"calls"`
	AvgTimeMs       float64 `json:"avg_time_ms"`
	MaxTimeMs       float64 `json:"max_time_ms"`
	TotalTimeMs     float64 `json:"total_time_ms"`
	RowsExamined    int64   `json:"rows_examined"`
	RowsReturned    int64   `json:"rows_returned"`
	WaitEventType   string  `json:"wait_event_type"`
	WaitEvent       string  `json:"wait_event"`
	FirstSeen       string  `json:"first_seen"`
	LastSeen        string  `json:"last_seen"`
}

type dbLock struct {
	ID             string `json:"id"`
	DBInstanceID   string `json:"db_instance_id"`
	LockType       string `json:"lock_type"`
	BlockingPID    int    `json:"blocking_pid"`
	BlockedPID     int    `json:"blocked_pid"`
	BlockingQuery  string `json:"blocking_query"`
	BlockedQuery   string `json:"blocked_query"`
	DurationMs     int64  `json:"duration_ms"`
	TableName      string `json:"table_name"`
	DetectedAt     string `json:"detected_at"`
}

type dbWaitEvent struct {
	EventType   string  `json:"event_type"`
	EventName   string  `json:"event_name"`
	Count       int64   `json:"count"`
	TotalTimeMs float64 `json:"total_time_ms"`
	AvgTimeMs   float64 `json:"avg_time_ms"`
}

func demoDBInstances() []dbInstance {
	now := time.Now().UTC().Format(time.RFC3339)
	return []dbInstance{
		{ID: "db-pg-01", Engine: "postgresql", Hostname: "pg-primary-01", Port: 5432, Version: "16.4", Status: "healthy", ConnectionsActive: 45, ConnectionsMax: 200, QPS: 1250, AvgQueryTimeMs: 2.8, CacheHitRatio: 99.2, ReplicationLagMs: 0, DiskUsagePct: 62, CollectedAt: now},
		{ID: "db-pg-02", Engine: "postgresql", Hostname: "pg-replica-01", Port: 5432, Version: "16.4", Status: "healthy", ConnectionsActive: 28, ConnectionsMax: 200, QPS: 850, AvgQueryTimeMs: 1.5, CacheHitRatio: 99.5, ReplicationLagMs: 120, DiskUsagePct: 58, CollectedAt: now},
		{ID: "db-my-01", Engine: "mysql", Hostname: "mysql-primary-01", Port: 3306, Version: "8.4.3", Status: "warning", ConnectionsActive: 180, ConnectionsMax: 300, QPS: 3200, AvgQueryTimeMs: 5.2, CacheHitRatio: 97.8, ReplicationLagMs: 0, DiskUsagePct: 78, CollectedAt: now},
		{ID: "db-my-02", Engine: "mysql", Hostname: "mysql-replica-01", Port: 3306, Version: "8.4.3", Status: "healthy", ConnectionsActive: 95, ConnectionsMax: 300, QPS: 2100, AvgQueryTimeMs: 3.1, CacheHitRatio: 98.5, ReplicationLagMs: 250, DiskUsagePct: 72, CollectedAt: now},
	}
}

func demoDBSlowQueries() []dbSlowQuery {
	now := time.Now().UTC()
	return []dbSlowQuery{
		{ID: "sq-001", DBInstanceID: "db-pg-01", QueryText: "SELECT o.id, o.status, u.name, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.created_at > $1 AND o.status IN ($2, $3) ORDER BY o.created_at DESC LIMIT 100", QueryHash: "a1b2c3d4", Calls: 12500, AvgTimeMs: 45.2, MaxTimeMs: 1250, TotalTimeMs: 565000, RowsExamined: 850000, RowsReturned: 12500, WaitEventType: "IO", WaitEvent: "DataFileRead", FirstSeen: now.Add(-72 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-2 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-002", DBInstanceID: "db-pg-01", QueryText: "UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3 AND quantity >= $1", QueryHash: "e5f6g7h8", Calls: 8200, AvgTimeMs: 28.5, MaxTimeMs: 850, TotalTimeMs: 233700, RowsExamined: 8200, RowsReturned: 8200, WaitEventType: "Lock", WaitEvent: "relation", FirstSeen: now.Add(-48 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-5 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-003", DBInstanceID: "db-my-01", QueryText: "SELECT p.*, c.name as category_name, AVG(r.rating) as avg_rating FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN reviews r ON r.product_id = p.id WHERE p.is_active = 1 GROUP BY p.id ORDER BY avg_rating DESC LIMIT 50", QueryHash: "i9j0k1l2", Calls: 5600, AvgTimeMs: 120.8, MaxTimeMs: 3500, TotalTimeMs: 676480, RowsExamined: 2800000, RowsReturned: 5600, WaitEventType: "IO", WaitEvent: "DataFileRead", FirstSeen: now.Add(-120 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-1 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-004", DBInstanceID: "db-my-01", QueryText: "SELECT DATE(created_at) as day, COUNT(*) as cnt, SUM(amount) as total FROM transactions WHERE created_at BETWEEN ? AND ? AND merchant_id = ? GROUP BY DATE(created_at) ORDER BY day", QueryHash: "m3n4o5p6", Calls: 3400, AvgTimeMs: 85.3, MaxTimeMs: 2200, TotalTimeMs: 290020, RowsExamined: 15000000, RowsReturned: 3400, WaitEventType: "IO", WaitEvent: "DataFileRead", FirstSeen: now.Add(-96 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-10 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-005", DBInstanceID: "db-pg-02", QueryText: "SELECT s.id, s.name, COUNT(DISTINCT e.user_id) as unique_users, SUM(e.duration_ms) as total_duration FROM services s JOIN events e ON e.service_id = s.id WHERE e.timestamp > $1 GROUP BY s.id, s.name HAVING COUNT(DISTINCT e.user_id) > $2", QueryHash: "q7r8s9t0", Calls: 2100, AvgTimeMs: 65.0, MaxTimeMs: 1800, TotalTimeMs: 136500, RowsExamined: 5200000, RowsReturned: 2100, WaitEventType: "LWLock", WaitEvent: "buffer_mapping", FirstSeen: now.Add(-24 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-3 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-006", DBInstanceID: "db-pg-01", QueryText: "WITH ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn FROM user_sessions WHERE created_at > $1) SELECT * FROM ranked WHERE rn = 1", QueryHash: "u1v2w3x4", Calls: 1800, AvgTimeMs: 95.5, MaxTimeMs: 2800, TotalTimeMs: 171900, RowsExamined: 9500000, RowsReturned: 1800, WaitEventType: "IO", WaitEvent: "DataFileRead", FirstSeen: now.Add(-36 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-8 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-007", DBInstanceID: "db-my-02", QueryText: "DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY) AND status = 'archived' LIMIT 10000", QueryHash: "y5z6a7b8", Calls: 720, AvgTimeMs: 250.0, MaxTimeMs: 5500, TotalTimeMs: 180000, RowsExamined: 12000000, RowsReturned: 0, WaitEventType: "IO", WaitEvent: "DataFileRead", FirstSeen: now.Add(-168 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-30 * time.Minute).Format(time.RFC3339)},
		{ID: "sq-008", DBInstanceID: "db-my-01", QueryText: "INSERT INTO analytics_daily (date, metric_name, value, dimensions) SELECT DATE(timestamp), metric, AVG(value), JSON_OBJECT('service', service_name, 'env', environment) FROM raw_metrics WHERE timestamp BETWEEN ? AND ? GROUP BY DATE(timestamp), metric, service_name, environment ON DUPLICATE KEY UPDATE value = VALUES(value)", QueryHash: "c9d0e1f2", Calls: 480, AvgTimeMs: 380.0, MaxTimeMs: 8200, TotalTimeMs: 182400, RowsExamined: 25000000, RowsReturned: 0, WaitEventType: "Lock", WaitEvent: "relation", FirstSeen: now.Add(-72 * time.Hour).Format(time.RFC3339), LastSeen: now.Add(-1 * time.Hour).Format(time.RFC3339)},
	}
}

func demoDBLocks() []dbLock {
	now := time.Now().UTC()
	return []dbLock{
		{ID: "lk-001", DBInstanceID: "db-pg-01", LockType: "RowExclusiveLock", BlockingPID: 12045, BlockedPID: 12089, BlockingQuery: "UPDATE orders SET status = 'shipped' WHERE id = 98234", BlockedQuery: "UPDATE orders SET tracking_no = 'TRK-98234-KR' WHERE id = 98234", DurationMs: 12500, TableName: "orders", DetectedAt: now.Add(-2 * time.Minute).Format(time.RFC3339)},
		{ID: "lk-002", DBInstanceID: "db-my-01", LockType: "RECORD", BlockingPID: 8832, BlockedPID: 8845, BlockingQuery: "UPDATE inventory SET quantity = quantity - 5 WHERE product_id = 1024", BlockedQuery: "SELECT quantity FROM inventory WHERE product_id = 1024 FOR UPDATE", DurationMs: 3200, TableName: "inventory", DetectedAt: now.Add(-5 * time.Minute).Format(time.RFC3339)},
		{ID: "lk-003", DBInstanceID: "db-pg-01", LockType: "AccessExclusiveLock", BlockingPID: 12102, BlockedPID: 12045, BlockingQuery: "ALTER TABLE users ADD COLUMN phone_verified boolean DEFAULT false", BlockedQuery: "SELECT * FROM users WHERE id = 42", DurationMs: 45000, TableName: "users", DetectedAt: now.Add(-1 * time.Minute).Format(time.RFC3339)},
	}
}

func demoDBWaitEvents() []dbWaitEvent {
	return []dbWaitEvent{
		{EventType: "IO", EventName: "DataFileRead", Count: 185000, TotalTimeMs: 92500, AvgTimeMs: 0.5},
		{EventType: "LWLock", EventName: "buffer_mapping", Count: 42000, TotalTimeMs: 12600, AvgTimeMs: 0.3},
		{EventType: "Lock", EventName: "relation", Count: 8500, TotalTimeMs: 25500, AvgTimeMs: 3.0},
		{EventType: "Client", EventName: "ClientRead", Count: 320000, TotalTimeMs: 160000, AvgTimeMs: 0.5},
		{EventType: "IO", EventName: "WALWrite", Count: 95000, TotalTimeMs: 19000, AvgTimeMs: 0.2},
		{EventType: "LWLock", EventName: "wal_insert", Count: 28000, TotalTimeMs: 5600, AvgTimeMs: 0.2},
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// Route registration
// ═══════════════════════════════════════════════════════════════════════════════

func registerPhase40Routes(mux *http.ServeMux) {
	// ── 40-1: RUM ──────────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/rum/sessions", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoRUMSessions(), "total": 8})
	})
	mux.HandleFunc("GET /api/v1/rum/pages", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoRUMPages(), "total": 6})
	})
	mux.HandleFunc("GET /api/v1/rum/geo", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoRUMGeo(), "total": 5})
	})
	mux.HandleFunc("GET /api/v1/rum/stats", func(w http.ResponseWriter, _ *http.Request) {
		sessions := demoRUMSessions()
		var lcpSum, fidSum, clsSum float64
		for _, s := range sessions {
			lcpSum += s.LCPMs
			fidSum += s.FIDMs
			clsSum += s.CLS
		}
		n := float64(len(sessions))
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"avg_lcp_ms":     math.Round(lcpSum/n*10) / 10,
			"avg_fid_ms":     math.Round(fidSum/n*10) / 10,
			"avg_cls":        math.Round(clsSum/n*1000) / 1000,
			"total_sessions": 25200,
		})
	})

	// ── 40-2: Golden Signals ───────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/golden-signals/services", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoGoldenSignalServices(), "total": 6})
	})
	mux.HandleFunc("GET /api/v1/golden-signals/timeseries", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoGoldenSignalTimeSeries(), "total": 24})
	})
	mux.HandleFunc("GET /api/v1/golden-signals/stats", func(w http.ResponseWriter, _ *http.Request) {
		svcs := demoGoldenSignalServices()
		var latSum, errSum, cpuSum, memSum, trafficSum float64
		for _, s := range svcs {
			latSum += s.LatencyP95Ms
			errSum += s.ErrorRatePct
			cpuSum += s.SaturationCPUPct
			memSum += s.SaturationMemPct
			trafficSum += s.TrafficRPM
		}
		n := float64(len(svcs))
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"avg_latency_p95_ms": math.Round(latSum/n*10) / 10,
			"total_traffic_rpm":  math.Round(trafficSum),
			"avg_error_rate_pct": math.Round(errSum/n*100) / 100,
			"avg_saturation_pct": math.Round((cpuSum+memSum)/(2*n)*10) / 10,
		})
	})

	// ── 40-3: Python Runtime ───────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/runtime/python", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoPythonMetrics(), "total": 5})
	})
	mux.HandleFunc("GET /api/v1/runtime/python/stats", func(w http.ResponseWriter, _ *http.Request) {
		metrics := demoPythonMetrics()
		var gilSum, ftSum, gcSum float64
		var threads, asyncPending int
		gilCount, ftCount := 0, 0
		for _, m := range metrics {
			if m.IsFreeThreaded {
				ftSum += m.FreeThreadUtilPct
				ftCount++
			} else {
				gilSum += m.GILContentionPct
				gilCount++
			}
			threads += m.ActiveThreads
			asyncPending += m.AsyncioTasksPending
			gcSum += m.GCTotalPauseMs
		}
		avgGIL := 0.0
		if gilCount > 0 {
			avgGIL = gilSum / float64(gilCount)
		}
		avgFT := 0.0
		if ftCount > 0 {
			avgFT = ftSum / float64(ftCount)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"avg_gil_contention_pct":       math.Round(avgGIL*10) / 10,
			"avg_free_thread_util_pct":     math.Round(avgFT*10) / 10,
			"total_threads":                threads,
			"total_asyncio_pending":        asyncPending,
			"avg_gc_total_pause_ms":        math.Round(gcSum/float64(len(metrics))*10) / 10,
			"free_threaded_agent_count":    ftCount,
			"gil_agent_count":             gilCount,
		})
	})

	// ── 40-4: .NET Runtime ─────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/runtime/dotnet", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoDotNetMetrics(), "total": 5})
	})
	mux.HandleFunc("GET /api/v1/runtime/dotnet/stats", func(w http.ResponseWriter, _ *http.Request) {
		metrics := demoDotNetMetrics()
		var starvation, reflWarn, trimWarn int
		var gcSuspSum, heapSum float64
		for _, m := range metrics {
			starvation += m.ThreadPoolStarvation
			reflWarn += m.AOTReflectionWarnings
			trimWarn += m.AOTTrimmingWarnings
			gcSuspSum += m.GCSuspensionTimeMs
			heapSum += m.GCHeapSizeMB
		}
		n := float64(len(metrics))
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"total_starvation_events":  starvation,
			"avg_gc_suspension_ms":     math.Round(gcSuspSum/n*10) / 10,
			"avg_heap_size_mb":         math.Round(heapSum/n*10) / 10,
			"total_aot_warnings":       reflWarn + trimWarn,
			"total_reflection_warnings": reflWarn,
			"total_trimming_warnings":  trimWarn,
		})
	})

	// ── 40-5: Go Runtime ───────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/runtime/go", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoGoSchedulerMetrics(), "total": 6})
	})
	mux.HandleFunc("GET /api/v1/runtime/go/histogram", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"buckets": demoGoHistogram()})
	})
	mux.HandleFunc("GET /api/v1/runtime/go/stats", func(w http.ResponseWriter, _ *http.Request) {
		metrics := demoGoSchedulerMetrics()
		var p95Sum, stwSum, heapSum float64
		var goroutines int
		for _, m := range metrics {
			p95Sum += m.SchedLatencyP95Us
			stwSum += m.GCSTWPauseUs
			goroutines += m.GoroutinesTotal
			heapSum += m.HeapAllocMB
		}
		n := float64(len(metrics))
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"avg_sched_latency_p95_us": math.Round(p95Sum/n*10) / 10,
			"avg_gc_stw_pause_us":      math.Round(stwSum/n*10) / 10,
			"total_goroutines":         goroutines,
			"avg_heap_alloc_mb":        math.Round(heapSum/n*10) / 10,
		})
	})

	// ── 40-6: Database Monitoring ──────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/database/instances", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoDBInstances(), "total": 4})
	})
	mux.HandleFunc("GET /api/v1/database/slow-queries", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoDBSlowQueries(), "total": 8})
	})
	mux.HandleFunc("GET /api/v1/database/locks", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoDBLocks(), "total": 3})
	})
	mux.HandleFunc("GET /api/v1/database/wait-events", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": demoDBWaitEvents(), "total": 6})
	})
	mux.HandleFunc("GET /api/v1/database/stats", func(w http.ResponseWriter, _ *http.Request) {
		instances := demoDBInstances()
		var qpsSum, queryTimeSum float64
		for _, inst := range instances {
			qpsSum += inst.QPS
			queryTimeSum += inst.AvgQueryTimeMs
		}
		n := float64(len(instances))
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"total_instances":     len(instances),
			"avg_qps":            math.Round(qpsSum/n*10) / 10,
			"slow_queries_24h":   len(demoDBSlowQueries()),
			"active_locks":       len(demoDBLocks()),
			"avg_query_time_ms":  math.Round(queryTimeSum/n*10) / 10,
		})
	})
}
