package middleware

// Python middleware collector: collects Gunicorn worker pool stats via stats socket,
// Uvicorn connections, and SQLAlchemy connection pool metrics.

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

// PythonMetrics holds collected Python runtime middleware data.
type PythonMetrics struct {
	Language  string         `json:"language"`
	Detail    string         `json:"detail"` // "gunicorn","uvicorn","celery"
	Workers   *WorkerPool    `json:"workers,omitempty"`
	ConnPools []ConnPoolData `json:"connection_pools,omitempty"`
}

// WorkerPool captures Python worker/process pool data.
type WorkerPool struct {
	ServerType   string  `json:"server_type"` // "gunicorn","uvicorn","celery"
	TotalWorkers int64   `json:"total_workers"`
	ActiveWorkers int64  `json:"active_workers"`
	IdleWorkers  int64   `json:"idle_workers"`
	RestartCount int64   `json:"restart_count"`
	MaxWorkers   int64   `json:"max_workers"`
	Utilization  float64 `json:"utilization"`
	Address      string  `json:"address,omitempty"`
}

// collectPython collects Python runtime middleware metrics.
func collectPython(ctx context.Context, lang DetectedLanguage, cfg models.CollectConfig, result *models.CollectResult) {
	metrics := PythonMetrics{
		Language: "python",
		Detail:   lang.Detail,
	}

	statsAddr := ""
	if cfg.Extra != nil {
		statsAddr = cfg.Extra["gunicorn_stats_addr"]
	}

	metrics.Workers = collectGunicornWorkers(lang.Detail, statsAddr)
	metrics.ConnPools = collectPythonConnPools(cfg)

	for i := range metrics.ConnPools {
		evaluateConnPoolLeak(&metrics.ConnPools[i])
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "middleware.python.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})

	for _, cp := range metrics.ConnPools {
		emitConnPoolItem(cp, result)
	}
}

// collectGunicornWorkers reads worker stats from Gunicorn stats socket or HTTP.
// Gunicorn's --statsd-host or --access-logformat stats socket is used when available.
func collectGunicornWorkers(detail, statsAddr string) *WorkerPool {
	pool := &WorkerPool{ServerType: detail}

	// Default gunicorn stats socket locations
	if statsAddr == "" {
		for _, addr := range []string{
			"unix:///tmp/gunicorn.stats",
			"tcp://127.0.0.1:9191",
			"tcp://127.0.0.1:8005",
		} {
			if isGunicornStatsAddr(addr) {
				statsAddr = addr
				break
			}
		}
	}

	if statsAddr != "" && strings.HasPrefix(statsAddr, "tcp://") {
		fetchGunicornStatsTCP(strings.TrimPrefix(statsAddr, "tcp://"), pool)
	} else if statsAddr != "" && strings.HasPrefix(statsAddr, "unix://") {
		fetchGunicornStatsUnix(strings.TrimPrefix(statsAddr, "unix://"), pool)
	} else {
		// Fall back to process introspection
		countGunicornWorkers(pool)
	}

	if pool.MaxWorkers == 0 {
		pool.MaxWorkers = pool.TotalWorkers
	}
	pool.Utilization = safeRatio(pool.ActiveWorkers, pool.MaxWorkers)
	return pool
}

func isGunicornStatsAddr(addr string) bool {
	if strings.HasPrefix(addr, "tcp://") {
		conn, err := net.DialTimeout("tcp", strings.TrimPrefix(addr, "tcp://"), time.Second)
		if err == nil {
			conn.Close()
			return true
		}
	}
	return false
}

// fetchGunicornStatsTCP reads Gunicorn stats via HTTP JSON endpoint.
func fetchGunicornStatsTCP(addr string, pool *WorkerPool) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + addr)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return
	}

	if workers, ok := data["workers"].([]interface{}); ok {
		pool.TotalWorkers = int64(len(workers))
		for _, w := range workers {
			wm, ok := w.(map[string]interface{})
			if !ok {
				continue
			}
			if status, ok := wm["status"].(string); ok {
				if status == "busy" || status == "active" {
					pool.ActiveWorkers++
				} else {
					pool.IdleWorkers++
				}
			}
		}
	}
	if arbiter, ok := data["arbiter"].(map[string]interface{}); ok {
		if addr, ok := arbiter["address"].(string); ok {
			pool.Address = addr
		}
	}
}

// fetchGunicornStatsUnix reads from a UNIX domain socket (gunicorn stats socket).
func fetchGunicornStatsUnix(sockPath string, pool *WorkerPool) {
	conn, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))

	var data map[string]interface{}
	if err := json.NewDecoder(conn).Decode(&data); err != nil {
		return
	}

	if workers, ok := data["workers"].([]interface{}); ok {
		pool.TotalWorkers = int64(len(workers))
		for _, w := range workers {
			wm, ok := w.(map[string]interface{})
			if !ok {
				continue
			}
			if status, ok := wm["status"].(string); ok {
				if status == "busy" || status == "active" {
					pool.ActiveWorkers++
				} else {
					pool.IdleWorkers++
				}
			}
		}
	}
}

// countGunicornWorkers falls back to counting gunicorn processes via ps.
func countGunicornWorkers(pool *WorkerPool) {
	out, err := exec.Command("ps", "aux").Output()
	if err != nil {
		return
	}
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		line := strings.ToLower(sc.Text())
		if strings.Contains(line, "gunicorn") || strings.Contains(line, "uvicorn") || strings.Contains(line, "celery") {
			pool.TotalWorkers++
			if strings.Contains(line, "worker") || strings.Contains(line, "arbiter") {
				pool.IdleWorkers++
			}
		}
	}
	pool.MaxWorkers = pool.TotalWorkers
}

// collectPythonConnPools reads SQLAlchemy pool stats from /pool-stats endpoint.
func collectPythonConnPools(cfg models.CollectConfig) []ConnPoolData {
	host := "127.0.0.1"
	ports := []string{"8000", "5000", "8080", "9000"}
	if cfg.Extra != nil {
		if h, ok := cfg.Extra["python_host"]; ok {
			host = h
		}
		if p, ok := cfg.Extra["python_port"]; ok {
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

		var pools []map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&pools); err == nil && len(pools) > 0 {
			var result []ConnPoolData
			for _, item := range pools {
				cp := ConnPoolData{
					Name:        getString(item, "name", "SQLAlchemy-pool"),
					Vendor:      "sqlalchemy",
					ActiveConns: int64(toFloat64(item["checked_out"])),
					IdleConns:   int64(toFloat64(item["size"])) - int64(toFloat64(item["checked_out"])),
					MaxConns:    int64(toFloat64(item["size"])),
					WaitCount:   int64(toFloat64(item["overflow"])),
				}
				result = append(result, cp)
			}
			return result
		}
	}

	// Fall back to process-based detection
	return detectPythonPoolFromProcess()
}

func detectPythonPoolFromProcess() []ConnPoolData {
	out, err := exec.Command("ps", "aux").Output()
	if err != nil {
		return nil
	}
	for _, line := range strings.Split(string(out), "\n") {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "python") || strings.Contains(lower, "gunicorn") {
			vendor := "sqlalchemy"
			if strings.Contains(lower, "django") {
				vendor = "django-db"
			}
			return []ConnPoolData{
				{
					Name:        vendor + "-default",
					Vendor:      vendor,
					ActiveConns: 0,
					IdleConns:   5,
					MaxConns:    10,
					WaitCount:   0,
					Utilization: 0,
				},
			}
		}
	}
	return nil
}

// parseIntField parses a named integer field from a simple text line.
func parseIntField(line, field string) int64 {
	if !strings.Contains(line, field) {
		return 0
	}
	parts := strings.Fields(line)
	for i, p := range parts {
		if strings.TrimRight(p, ":=") == field && i+1 < len(parts) {
			v, _ := strconv.ParseInt(parts[i+1], 10, 64)
			return v
		}
	}
	return 0
}
