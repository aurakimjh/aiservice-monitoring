package middleware

// Go runtime middleware collector: collects goroutine count, sql.DB pool stats,
// memory/GC stats, and optional /debug/vars endpoint data.

import (
	"context"
	"encoding/json"
	"net/http"
	"runtime"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// GoMetrics holds collected Go runtime middleware data.
type GoMetrics struct {
	Language    string          `json:"language"`
	Detail      string          `json:"detail"`
	Goroutines  *GoroutineStats `json:"goroutines,omitempty"`
	MemStats    *GoMemStats     `json:"mem_stats,omitempty"`
	ConnPools   []ConnPoolData  `json:"connection_pools,omitempty"`
	DebugVars   map[string]interface{} `json:"debug_vars,omitempty"`
}

// GoroutineStats tracks goroutine counts and leak detection.
type GoroutineStats struct {
	Current       int     `json:"current"`
	Baseline      int     `json:"baseline"`
	LeakThreshold int     `json:"leak_threshold"`
	LeakSuspected bool    `json:"leak_suspected"`
	PprofURL      string  `json:"pprof_url,omitempty"`
	WarningLevel  string  `json:"warning_level"` // "ok","warning","critical"
}

// GoMemStats captures a subset of runtime.MemStats.
type GoMemStats struct {
	AllocMB      float64 `json:"alloc_mb"`
	SysMB        float64 `json:"sys_mb"`
	NumGC        uint32  `json:"num_gc"`
	PauseTotalMs float64 `json:"gc_pause_total_ms"`
	LastGCPauseMs float64 `json:"last_gc_pause_ms"`
	HeapObjects  uint64  `json:"heap_objects"`
	NextGCMB     float64 `json:"next_gc_mb"`
}

// collectGoRuntime collects Go runtime metrics (self-profiling).
func collectGoRuntime(ctx context.Context, lang DetectedLanguage, cfg models.CollectConfig, result *models.CollectResult) {
	metrics := GoMetrics{
		Language: "go",
		Detail:   lang.Detail,
	}

	// Self-collection: these always work for the agent itself.
	metrics.Goroutines = collectGoroutineStats(cfg)
	metrics.MemStats = collectGoMemStats()

	// Try to read /debug/vars from other Go processes on configured port
	debugHost := "127.0.0.1"
	debugPort := "6060"
	if cfg.Extra != nil {
		if h, ok := cfg.Extra["go_debug_host"]; ok {
			debugHost = h
		}
		if p, ok := cfg.Extra["go_debug_port"]; ok {
			debugPort = p
		}
	}
	metrics.DebugVars = fetchDebugVars(debugHost, debugPort)
	metrics.ConnPools = collectGoConnPools(metrics.DebugVars, cfg)

	for i := range metrics.ConnPools {
		evaluateConnPoolLeak(&metrics.ConnPools[i])
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "middleware.go.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})

	for _, cp := range metrics.ConnPools {
		emitConnPoolItem(cp, result)
	}
}

// collectGoroutineStats reads the current goroutine count and evaluates leak detection.
func collectGoroutineStats(cfg models.CollectConfig) *GoroutineStats {
	current := runtime.NumGoroutine()

	// Baseline: read from cfg.Extra or use a default heuristic
	baseline := 50
	if cfg.Extra != nil {
		if b, ok := cfg.Extra["go_goroutine_baseline"]; ok {
			n, _ := parseInt(b)
			if n > 0 {
				baseline = n
			}
		}
	}

	// Leak threshold = baseline × 2 (configurable)
	leakThreshold := baseline * 2
	if cfg.Extra != nil {
		if t, ok := cfg.Extra["go_goroutine_leak_threshold"]; ok {
			n, _ := parseInt(t)
			if n > 0 {
				leakThreshold = n
			}
		}
	}

	pprofURL := ""
	debugHost := "127.0.0.1"
	debugPort := "6060"
	if cfg.Extra != nil {
		if h, ok := cfg.Extra["go_debug_host"]; ok {
			debugHost = h
		}
		if p, ok := cfg.Extra["go_debug_port"]; ok {
			debugPort = p
		}
	}
	pprofURL = "http://" + debugHost + ":" + debugPort + "/debug/pprof/goroutine?debug=1"

	gs := &GoroutineStats{
		Current:       current,
		Baseline:      baseline,
		LeakThreshold: leakThreshold,
		LeakSuspected: current >= leakThreshold,
		PprofURL:      pprofURL,
	}

	switch {
	case current >= leakThreshold*2:
		gs.WarningLevel = "critical"
	case current >= leakThreshold:
		gs.WarningLevel = "warning"
	default:
		gs.WarningLevel = "ok"
	}

	return gs
}

// collectGoMemStats captures a subset of runtime.MemStats.
func collectGoMemStats() *GoMemStats {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	lastPause := float64(0)
	if ms.NumGC > 0 {
		lastPause = float64(ms.PauseNs[(ms.NumGC+255)%256]) / 1e6
	}

	return &GoMemStats{
		AllocMB:       float64(ms.Alloc) / (1024 * 1024),
		SysMB:         float64(ms.Sys) / (1024 * 1024),
		NumGC:         ms.NumGC,
		PauseTotalMs:  float64(ms.PauseTotalNs) / 1e6,
		LastGCPauseMs: lastPause,
		HeapObjects:   ms.HeapObjects,
		NextGCMB:      float64(ms.NextGC) / (1024 * 1024),
	}
}

// fetchDebugVars reads the /debug/vars endpoint of a Go process.
func fetchDebugVars(host, port string) map[string]interface{} {
	url := "http://" + host + ":" + port + "/debug/vars"
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}
	return data
}

// collectGoConnPools reads sql.DB stats from /debug/vars or pprof endpoint.
func collectGoConnPools(debugVars map[string]interface{}, cfg models.CollectConfig) []ConnPoolData {
	if debugVars == nil {
		return defaultGoConnPool()
	}

	var pools []ConnPoolData

	// Standard /debug/vars keys set by database/sql when sql.Register is called with stats hooks
	// Keys: "sql_db_stats" -> {"MaxOpenConnections":N,"OpenConnections":N,"InUse":N,"Idle":N,"WaitCount":N}
	if stats, ok := debugVars["sql_db_stats"]; ok {
		if m, ok := stats.(map[string]interface{}); ok {
			active := int64(toFloat64(m["InUse"]))
			idle := int64(toFloat64(m["Idle"]))
			max := int64(toFloat64(m["MaxOpenConnections"]))
			pools = append(pools, ConnPoolData{
				Name:        "sql.DB",
				Vendor:      "sql_db",
				ActiveConns: active,
				IdleConns:   idle,
				MaxConns:    max,
				WaitCount:   int64(toFloat64(m["WaitCount"])),
				Utilization: safeRatio(active, max),
			})
		}
	}

	if len(pools) == 0 {
		return defaultGoConnPool()
	}
	return pools
}

func defaultGoConnPool() []ConnPoolData {
	return []ConnPoolData{
		{
			Name:        "sql.DB-default",
			Vendor:      "sql_db",
			ActiveConns: 0,
			IdleConns:   0,
			MaxConns:    25, // database/sql default
			WaitCount:   0,
			Utilization: 0,
		},
	}
}

func parseInt(s string) (int, error) {
	v, err := json.Number(s).Int64()
	return int(v), err
}
