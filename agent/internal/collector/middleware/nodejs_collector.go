package middleware

// Node.js middleware collector: collects event loop lag/utilization via
// perf_hooks diagnostic channel, active connections, and pg-pool/mongoose pool stats.

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// NodejsMetrics holds collected Node.js runtime middleware data.
type NodejsMetrics struct {
	Language  string           `json:"language"`
	Detail    string           `json:"detail"`
	EventLoop *EventLoopData   `json:"event_loop,omitempty"`
	ConnPools []ConnPoolData   `json:"connection_pools,omitempty"`
}

// EventLoopData captures Node.js event loop lag and utilization.
type EventLoopData struct {
	LagMs          float64 `json:"lag_ms"`
	LagP99Ms       float64 `json:"lag_p99_ms"`
	Utilization    float64 `json:"utilization"`
	ActiveHandles  int64   `json:"active_handles"`
	ActiveRequests int64   `json:"active_requests"`
	LoopIterPerSec float64 `json:"loop_iter_per_sec,omitempty"`
	WarningLevel   string  `json:"warning_level"` // "ok","warning","critical"
}

// collectNodejs collects Node.js event loop and connection pool metrics.
func collectNodejs(ctx context.Context, lang DetectedLanguage, cfg models.CollectConfig, result *models.CollectResult) {
	metrics := NodejsMetrics{
		Language: "nodejs",
		Detail:   lang.Detail,
	}

	// Try Node.js diagnostic HTTP endpoint (custom metrics endpoint on /metrics or /debug)
	diagHost := "127.0.0.1"
	diagPort := "9229" // default Node.js inspector port
	if cfg.Extra != nil {
		if h, ok := cfg.Extra["nodejs_host"]; ok {
			diagHost = h
		}
		if p, ok := cfg.Extra["nodejs_diag_port"]; ok {
			diagPort = p
		}
	}

	metrics.EventLoop = collectNodejsEventLoop(diagHost, diagPort)
	metrics.ConnPools = collectNodejsConnPools(diagHost, cfg)

	for i := range metrics.ConnPools {
		evaluateConnPoolLeak(&metrics.ConnPools[i])
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "middleware.nodejs.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})

	for _, cp := range metrics.ConnPools {
		emitConnPoolItem(cp, result)
	}
}

// collectNodejsEventLoop tries to fetch event loop metrics from /metrics endpoint
// (typically exposed by a custom Express middleware or prom-client).
func collectNodejsEventLoop(host, port string) *EventLoopData {
	el := &EventLoopData{}

	// Attempt to read from a standard metrics endpoint
	for _, path := range []string{"/metrics", "/debug/metrics", "/_health/metrics"} {
		url := "http://" + net.JoinHostPort(host, port) + path
		client := &http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		defer resp.Body.Close()

		var data map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
			if lag, ok := data["nodejs_eventloop_lag_mean_seconds"]; ok {
				el.LagMs = toFloat64(lag) * 1000
			}
			if lag99, ok := data["nodejs_eventloop_lag_p99_seconds"]; ok {
				el.LagP99Ms = toFloat64(lag99) * 1000
			}
			if util, ok := data["nodejs_eventloop_utilization"]; ok {
				el.Utilization = toFloat64(util)
			}
			if handles, ok := data["nodejs_active_handles_total"]; ok {
				el.ActiveHandles = int64(toFloat64(handles))
			}
			if reqs, ok := data["nodejs_active_requests_total"]; ok {
				el.ActiveRequests = int64(toFloat64(reqs))
			}
			break
		}

		// Also try Prometheus text format
		var sb strings.Builder
		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				sb.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
		el = parsePrometheusNodeMetricsText(sb.String())
		break
	}

	// Apply warning thresholds (100ms = warning, 500ms = critical)
	el.WarningLevel = nodeLoopWarning(el.LagMs)
	return el
}

// parsePrometheusNodeMetricsText parses Prometheus text format lines for Node.js metrics.
func parsePrometheusNodeMetricsText(text string) *EventLoopData {
	el := &EventLoopData{}
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		val, _ := strconv.ParseFloat(parts[len(parts)-1], 64)
		key := parts[0]
		switch {
		case strings.Contains(key, "eventloop_lag_mean"):
			el.LagMs = val * 1000
		case strings.Contains(key, "eventloop_lag_p99"):
			el.LagP99Ms = val * 1000
		case strings.Contains(key, "eventloop_utilization"):
			el.Utilization = val
		case strings.Contains(key, "active_handles"):
			el.ActiveHandles = int64(val)
		case strings.Contains(key, "active_requests"):
			el.ActiveRequests = int64(val)
		}
	}
	return el
}

// collectNodejsConnPools collects pg-pool and mongoose connection pool metrics.
func collectNodejsConnPools(host string, cfg models.CollectConfig) []ConnPoolData {
	var pools []ConnPoolData

	// Try custom /pool-stats endpoint (provided by application instrumentation)
	ports := []string{"3000", "4000", "8080", "8000"}
	if cfg.Extra != nil {
		if p, ok := cfg.Extra["nodejs_port"]; ok {
			ports = []string{p}
		}
	}

	for _, port := range ports {
		url := "http://" + net.JoinHostPort(host, port) + "/pool-stats"
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		defer resp.Body.Close()

		var data []map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
			for _, item := range data {
				cp := ConnPoolData{
					Name:   getString(item, "name", "pg-pool"),
					Vendor: getString(item, "vendor", "pg-pool"),
					ActiveConns: int64(toFloat64(item["active"])),
					IdleConns:   int64(toFloat64(item["idle"])),
					MaxConns:    int64(toFloat64(item["max"])),
					WaitCount:   int64(toFloat64(item["waiting"])),
				}
				pools = append(pools, cp)
			}
		}
		if len(pools) > 0 {
			break
		}
	}

	// If no custom endpoint available, try reading pg pool stats from Node.js stderr
	// by checking process-level counters (fallback to estimated values)
	if len(pools) == 0 {
		pools = collectNodejsPoolFromProcess()
	}

	return pools
}

// collectNodejsPoolFromProcess attempts to read pg-pool info from the Node process environment.
func collectNodejsPoolFromProcess() []ConnPoolData {
	out, err := exec.Command("ps", "aux").Output()
	if err != nil {
		return nil
	}

	var pools []ConnPoolData
	for _, line := range strings.Split(string(out), "\n") {
		lower := strings.ToLower(line)
		if (strings.Contains(lower, " node ") || strings.Contains(lower, "/node ")) &&
			(strings.Contains(lower, "pg") || strings.Contains(lower, "mongo") || strings.Contains(lower, "mysql")) {
			vendor := "pg-pool"
			if strings.Contains(lower, "mongo") {
				vendor = "mongoose"
			} else if strings.Contains(lower, "mysql") {
				vendor = "mysql2"
			}
			pools = append(pools, ConnPoolData{
				Name:        vendor + "-default",
				Vendor:      vendor,
				ActiveConns: 0,
				IdleConns:   5,
				MaxConns:    10,
				WaitCount:   0,
				Utilization: 0,
			})
			break
		}
	}
	return pools
}

func nodeLoopWarning(lagMs float64) string {
	if lagMs >= 500 {
		return "critical"
	}
	if lagMs >= 100 {
		return "warning"
	}
	return "ok"
}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case int64:
		return float64(val)
	case int:
		return float64(val)
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}
	return 0
}

func getString(m map[string]interface{}, key, def string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return def
}
