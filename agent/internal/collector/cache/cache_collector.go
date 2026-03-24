package cache

// Collector gathers metrics from Redis-compatible caches.
// Supported: Redis 5-7, Valkey, KeyDB, DragonflyDB, Memcached.

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector implements the models.Collector interface for cache servers.
type Collector struct{}

// New returns a new Cache Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "it-cache" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{}
}

func (c *Collector) OutputSchemas() []string {
	return []string{"cache.info.v1", "cache.slowlog.v1"}
}

// cacheCandidate represents a potential cache endpoint to probe.
type cacheCandidate struct {
	engine string
	host   string
	port   string
}

// defaultCandidates lists the default ports used by supported cache engines.
var defaultCandidates = []cacheCandidate{
	{engine: "redis", host: "127.0.0.1", port: "6379"},
	{engine: "keydb", host: "127.0.0.1", port: "6379"},
	{engine: "valkey", host: "127.0.0.1", port: "6379"},
	{engine: "dragonfly", host: "127.0.0.1", port: "6379"},
	{engine: "redis", host: "127.0.0.1", port: "6380"},
	{engine: "memcached", host: "127.0.0.1", port: "11211"},
}

// RedisMetrics holds metrics parsed from Redis INFO + SLOWLOG LEN.
type RedisMetrics struct {
	Engine             string  `json:"engine"`
	Host               string  `json:"host"`
	Port               string  `json:"port"`
	Version            string  `json:"version"`
	UptimeSeconds      int64   `json:"uptime_seconds"`
	ConnectedClients   int64   `json:"connected_clients"`
	BlockedClients     int64   `json:"blocked_clients"`
	UsedMemory         int64   `json:"used_memory"`
	UsedMemoryPeak     int64   `json:"used_memory_peak"`
	UsedMemoryRSS      int64   `json:"used_memory_rss"`
	MaxMemory          int64   `json:"maxmemory"`
	MemFragRatio       float64 `json:"mem_fragmentation_ratio"`
	TotalConnReceived  int64   `json:"total_connections_received"`
	TotalCmdsProcessed int64   `json:"total_commands_processed"`
	OpsPerSec          int64   `json:"instantaneous_ops_per_sec"`
	KeyspaceHits       int64   `json:"keyspace_hits"`
	KeyspaceMisses     int64   `json:"keyspace_misses"`
	HitRate            float64 `json:"hit_rate"`
	EvictedKeys        int64   `json:"evicted_keys"`
	ExpiredKeys        int64   `json:"expired_keys"`
	Role               string  `json:"role"`
	ConnectedSlaves    int64   `json:"connected_slaves"`
	TotalKeys          int64   `json:"total_keys"`
	ExpiringKeys       int64   `json:"expiring_keys"`
	SlowlogLen         int64   `json:"slowlog_len"`
}

// MemcachedMetrics holds metrics parsed from Memcached stats command.
type MemcachedMetrics struct {
	Host            string  `json:"host"`
	Port            string  `json:"port"`
	Version         string  `json:"version"`
	UptimeSeconds   int64   `json:"uptime"`
	CurrItems       int64   `json:"curr_items"`
	TotalItems      int64   `json:"total_items"`
	Bytes           int64   `json:"bytes"`
	LimitMaxBytes   int64   `json:"limit_maxbytes"`
	CurrConnections int64   `json:"curr_connections"`
	GetHits         int64   `json:"get_hits"`
	GetMisses       int64   `json:"get_misses"`
	HitRate         float64 `json:"hit_rate"`
	Evictions       int64   `json:"evictions"`
	CmdGet          int64   `json:"cmd_get"`
	CmdSet          int64   `json:"cmd_set"`
}

// AutoDetect checks whether a Redis-compatible cache is reachable on standard ports.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	for _, cand := range defaultCandidates {
		if isPortOpen(cand.host, cand.port) {
			return models.DetectResult{
				Detected: true,
				Details: map[string]string{
					"engine": cand.engine,
					"host":   cand.host,
					"port":   cand.port,
				},
			}, nil
		}
	}
	return models.DetectResult{Detected: false}, nil
}

// Collect runs the cache metric collection.
// Supports Redis-compatible servers (Redis, KeyDB, Valkey, DragonflyDB) and Memcached.
func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
		Items:            []models.CollectedItem{},
		Errors:           []models.CollectError{},
	}

	targets := resolveTargets(cfg)
	if len(targets) == 0 {
		result.Status = models.StatusSkipped
		result.Duration = time.Since(start)
		return result, nil
	}

	for _, t := range targets {
		if t.engine == "memcached" {
			collectMemcached(t, result)
		} else {
			collectRedis(t, cfg, result)
		}
	}

	if len(result.Items) == 0 && len(result.Errors) > 0 {
		result.Status = models.StatusFailed
	} else if len(result.Errors) > 0 {
		result.Status = models.StatusPartial
	}

	result.Duration = time.Since(start)
	return result, nil
}

// resolveTargets returns cache endpoints to collect from, using cfg.Extra or auto-detection.
func resolveTargets(cfg models.CollectConfig) []cacheCandidate {
	if cfg.Extra != nil {
		if engine, ok := cfg.Extra["engine"]; ok {
			host := cfg.Extra["host"]
			port := cfg.Extra["port"]
			if host == "" {
				host = "127.0.0.1"
			}
			if port == "" {
				if engine == "memcached" {
					port = "11211"
				} else {
					port = "6379"
				}
			}
			return []cacheCandidate{{engine: engine, host: host, port: port}}
		}
	}
	var targets []cacheCandidate
	for _, cand := range defaultCandidates {
		if isPortOpen(cand.host, cand.port) {
			targets = append(targets, cand)
		}
	}
	return targets
}

// collectRedis gathers metrics from a Redis-compatible server via INFO and SLOWLOG LEN.
func collectRedis(t cacheCandidate, cfg models.CollectConfig, result *models.CollectResult) {
	addr := net.JoinHostPort(t.host, t.port)

	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("connect to %s %s: %v", t.engine, addr, err),
		})
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	reader := bufio.NewReader(conn)

	// AUTH if password provided
	if cfg.Extra != nil {
		if pw, ok := cfg.Extra["password"]; ok && pw != "" {
			if err := redisAuth(conn, reader, pw); err != nil {
				result.Errors = append(result.Errors, models.CollectError{
					Code:    models.ErrAuthFailed,
					Message: fmt.Sprintf("auth %s %s: %v", t.engine, addr, err),
				})
				return
			}
		}
	}

	// INFO command
	infoRaw, err := redisSimpleCommand(conn, reader, "INFO")
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("INFO from %s %s: %v", t.engine, addr, err),
		})
		return
	}

	metrics := parseRedisInfo(infoRaw)
	metrics.Engine = t.engine
	metrics.Host = t.host
	metrics.Port = t.port

	// SLOWLOG LEN
	slowlogRaw, err := redisSimpleCommand(conn, reader, "SLOWLOG", "LEN")
	if err == nil {
		metrics.SlowlogLen, _ = strconv.ParseInt(strings.TrimSpace(slowlogRaw), 10, 64)
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "cache.info.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})
}

// collectMemcached gathers metrics from a Memcached server via the stats command.
func collectMemcached(t cacheCandidate, result *models.CollectResult) {
	addr := net.JoinHostPort(t.host, t.port)

	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("connect to memcached %s: %v", addr, err),
		})
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	if _, err := conn.Write([]byte("stats\r\n")); err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("write stats to memcached %s: %v", addr, err),
		})
		return
	}

	metrics := parseMemcachedStats(conn)
	metrics.Host = t.host
	metrics.Port = t.port

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "cache.info.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})
}

// --- Redis RESP protocol helpers ---

// redisAuth sends the AUTH command and validates the response.
func redisAuth(conn net.Conn, reader *bufio.Reader, password string) error {
	cmd := fmt.Sprintf("*2\r\n$4\r\nAUTH\r\n$%d\r\n%s\r\n", len(password), password)
	if _, err := conn.Write([]byte(cmd)); err != nil {
		return err
	}
	line, err := reader.ReadString('\n')
	if err != nil {
		return err
	}
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "+") {
		return fmt.Errorf("auth rejected: %s", line)
	}
	return nil
}

// redisSimpleCommand sends a RESP command and returns the response body.
// Handles bulk strings ($), integers (:), simple strings (+), and errors (-).
func redisSimpleCommand(conn net.Conn, reader *bufio.Reader, args ...string) (string, error) {
	var cmd strings.Builder
	fmt.Fprintf(&cmd, "*%d\r\n", len(args))
	for _, arg := range args {
		fmt.Fprintf(&cmd, "$%d\r\n%s\r\n", len(arg), arg)
	}
	if _, err := conn.Write([]byte(cmd.String())); err != nil {
		return "", fmt.Errorf("write command: %w", err)
	}

	line, err := reader.ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	line = strings.TrimRight(line, "\r\n")

	switch {
	case strings.HasPrefix(line, "+"):
		return line[1:], nil
	case strings.HasPrefix(line, "-"):
		return "", fmt.Errorf("redis error: %s", line[1:])
	case strings.HasPrefix(line, ":"):
		return line[1:], nil
	case strings.HasPrefix(line, "$"):
		size, err := strconv.Atoi(line[1:])
		if err != nil {
			return "", fmt.Errorf("parse bulk size: %w", err)
		}
		if size < 0 {
			return "", nil
		}
		buf := make([]byte, size+2) // +2 for trailing \r\n
		if _, err := io.ReadFull(reader, buf); err != nil {
			return "", fmt.Errorf("read bulk body: %w", err)
		}
		return string(buf[:size]), nil
	default:
		return line, nil
	}
}

// --- Parsers ---

// parseRedisInfo parses the key:value text from Redis INFO into RedisMetrics.
func parseRedisInfo(raw string) RedisMetrics {
	m := RedisMetrics{}
	kv := make(map[string]string)

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if parts := strings.SplitN(line, ":", 2); len(parts) == 2 {
			kv[parts[0]] = parts[1]
		}
	}

	m.Version = kv["redis_version"]
	m.UptimeSeconds, _ = strconv.ParseInt(kv["uptime_in_seconds"], 10, 64)
	m.ConnectedClients, _ = strconv.ParseInt(kv["connected_clients"], 10, 64)
	m.BlockedClients, _ = strconv.ParseInt(kv["blocked_clients"], 10, 64)
	m.UsedMemory, _ = strconv.ParseInt(kv["used_memory"], 10, 64)
	m.UsedMemoryPeak, _ = strconv.ParseInt(kv["used_memory_peak"], 10, 64)
	m.UsedMemoryRSS, _ = strconv.ParseInt(kv["used_memory_rss"], 10, 64)
	m.MaxMemory, _ = strconv.ParseInt(kv["maxmemory"], 10, 64)
	m.MemFragRatio, _ = strconv.ParseFloat(kv["mem_fragmentation_ratio"], 64)
	m.TotalConnReceived, _ = strconv.ParseInt(kv["total_connections_received"], 10, 64)
	m.TotalCmdsProcessed, _ = strconv.ParseInt(kv["total_commands_processed"], 10, 64)
	m.OpsPerSec, _ = strconv.ParseInt(kv["instantaneous_ops_per_sec"], 10, 64)
	m.KeyspaceHits, _ = strconv.ParseInt(kv["keyspace_hits"], 10, 64)
	m.KeyspaceMisses, _ = strconv.ParseInt(kv["keyspace_misses"], 10, 64)
	m.EvictedKeys, _ = strconv.ParseInt(kv["evicted_keys"], 10, 64)
	m.ExpiredKeys, _ = strconv.ParseInt(kv["expired_keys"], 10, 64)
	m.Role = kv["role"]
	m.ConnectedSlaves, _ = strconv.ParseInt(kv["connected_slaves"], 10, 64)

	if m.KeyspaceHits+m.KeyspaceMisses > 0 {
		m.HitRate = float64(m.KeyspaceHits) / float64(m.KeyspaceHits+m.KeyspaceMisses)
	}

	// Keyspace: db0:keys=123,expires=45,avg_ttl=67890
	for k, v := range kv {
		if !strings.HasPrefix(k, "db") {
			continue
		}
		for _, field := range strings.Split(v, ",") {
			parts := strings.SplitN(field, "=", 2)
			if len(parts) != 2 {
				continue
			}
			val, _ := strconv.ParseInt(parts[1], 10, 64)
			switch parts[0] {
			case "keys":
				m.TotalKeys += val
			case "expires":
				m.ExpiringKeys += val
			}
		}
	}

	return m
}

// parseMemcachedStats parses "STAT key value" lines from Memcached into MemcachedMetrics.
func parseMemcachedStats(conn net.Conn) MemcachedMetrics {
	m := MemcachedMetrics{}
	scanner := bufio.NewScanner(conn)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "END" {
			break
		}
		parts := strings.SplitN(line, " ", 3)
		if len(parts) != 3 || parts[0] != "STAT" {
			continue
		}
		key, val := parts[1], parts[2]
		switch key {
		case "version":
			m.Version = val
		case "uptime":
			m.UptimeSeconds, _ = strconv.ParseInt(val, 10, 64)
		case "curr_items":
			m.CurrItems, _ = strconv.ParseInt(val, 10, 64)
		case "total_items":
			m.TotalItems, _ = strconv.ParseInt(val, 10, 64)
		case "bytes":
			m.Bytes, _ = strconv.ParseInt(val, 10, 64)
		case "limit_maxbytes":
			m.LimitMaxBytes, _ = strconv.ParseInt(val, 10, 64)
		case "curr_connections":
			m.CurrConnections, _ = strconv.ParseInt(val, 10, 64)
		case "get_hits":
			m.GetHits, _ = strconv.ParseInt(val, 10, 64)
		case "get_misses":
			m.GetMisses, _ = strconv.ParseInt(val, 10, 64)
		case "evictions":
			m.Evictions, _ = strconv.ParseInt(val, 10, 64)
		case "cmd_get":
			m.CmdGet, _ = strconv.ParseInt(val, 10, 64)
		case "cmd_set":
			m.CmdSet, _ = strconv.ParseInt(val, 10, 64)
		}
	}

	if m.GetHits+m.GetMisses > 0 {
		m.HitRate = float64(m.GetHits) / float64(m.GetHits+m.GetMisses)
	}

	return m
}

// isPortOpen checks if a TCP port is accepting connections.
func isPortOpen(host, port string) bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 2*time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
