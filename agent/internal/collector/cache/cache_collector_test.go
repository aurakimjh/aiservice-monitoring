package cache

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// --- Interface tests ---

func TestCacheCollectorInterface(t *testing.T) {
	c := New()
	if c.ID() != "it-cache" {
		t.Errorf("expected ID 'it-cache', got %q", c.ID())
	}
	if c.Version() == "" {
		t.Error("Version() must not be empty")
	}
	if len(c.SupportedPlatforms()) == 0 {
		t.Error("SupportedPlatforms() must not be empty")
	}
	if len(c.OutputSchemas()) == 0 {
		t.Error("OutputSchemas() must not be empty")
	}
}

func TestAutoDetect_NoCache(t *testing.T) {
	c := New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	_ = result.Detected
}

func TestCollect_NoCache(t *testing.T) {
	c := New()
	result, err := c.Collect(context.Background(), models.CollectConfig{Hostname: "test"})
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if result.CollectorID != "it-cache" {
		t.Errorf("expected CollectorID 'it-cache', got %q", result.CollectorID)
	}
}

// --- parseRedisInfo tests ---

func TestParseRedisInfo_Full(t *testing.T) {
	raw := `# Server
redis_version:7.0.15
uptime_in_seconds:86400

# Clients
connected_clients:42
blocked_clients:2

# Memory
used_memory:2097152
used_memory_peak:4194304
used_memory_rss:3145728
maxmemory:8388608
mem_fragmentation_ratio:1.50

# Stats
total_connections_received:1000
total_commands_processed:50000
instantaneous_ops_per_sec:120
keyspace_hits:40000
keyspace_misses:10000
evicted_keys:5
expired_keys:200

# Replication
role:master
connected_slaves:2

# Keyspace
db0:keys=1500,expires=300,avg_ttl=3600000
db1:keys=500,expires=100,avg_ttl=7200000
`
	m := parseRedisInfo(raw)

	if m.Version != "7.0.15" {
		t.Errorf("Version = %q, want '7.0.15'", m.Version)
	}
	if m.UptimeSeconds != 86400 {
		t.Errorf("UptimeSeconds = %d, want 86400", m.UptimeSeconds)
	}
	if m.ConnectedClients != 42 {
		t.Errorf("ConnectedClients = %d, want 42", m.ConnectedClients)
	}
	if m.BlockedClients != 2 {
		t.Errorf("BlockedClients = %d, want 2", m.BlockedClients)
	}
	if m.UsedMemory != 2097152 {
		t.Errorf("UsedMemory = %d, want 2097152", m.UsedMemory)
	}
	if m.UsedMemoryPeak != 4194304 {
		t.Errorf("UsedMemoryPeak = %d, want 4194304", m.UsedMemoryPeak)
	}
	if m.UsedMemoryRSS != 3145728 {
		t.Errorf("UsedMemoryRSS = %d, want 3145728", m.UsedMemoryRSS)
	}
	if m.MaxMemory != 8388608 {
		t.Errorf("MaxMemory = %d, want 8388608", m.MaxMemory)
	}
	if m.MemFragRatio != 1.50 {
		t.Errorf("MemFragRatio = %f, want 1.50", m.MemFragRatio)
	}
	if m.TotalConnReceived != 1000 {
		t.Errorf("TotalConnReceived = %d, want 1000", m.TotalConnReceived)
	}
	if m.TotalCmdsProcessed != 50000 {
		t.Errorf("TotalCmdsProcessed = %d, want 50000", m.TotalCmdsProcessed)
	}
	if m.OpsPerSec != 120 {
		t.Errorf("OpsPerSec = %d, want 120", m.OpsPerSec)
	}
	if m.KeyspaceHits != 40000 {
		t.Errorf("KeyspaceHits = %d, want 40000", m.KeyspaceHits)
	}
	if m.KeyspaceMisses != 10000 {
		t.Errorf("KeyspaceMisses = %d, want 10000", m.KeyspaceMisses)
	}
	if m.EvictedKeys != 5 {
		t.Errorf("EvictedKeys = %d, want 5", m.EvictedKeys)
	}
	if m.ExpiredKeys != 200 {
		t.Errorf("ExpiredKeys = %d, want 200", m.ExpiredKeys)
	}
	if m.Role != "master" {
		t.Errorf("Role = %q, want 'master'", m.Role)
	}
	if m.ConnectedSlaves != 2 {
		t.Errorf("ConnectedSlaves = %d, want 2", m.ConnectedSlaves)
	}
	if m.TotalKeys != 2000 {
		t.Errorf("TotalKeys = %d, want 2000 (1500+500)", m.TotalKeys)
	}
	if m.ExpiringKeys != 400 {
		t.Errorf("ExpiringKeys = %d, want 400 (300+100)", m.ExpiringKeys)
	}
	// HitRate: 40000 / (40000+10000) = 0.8
	if m.HitRate < 0.799 || m.HitRate > 0.801 {
		t.Errorf("HitRate = %f, want ~0.8", m.HitRate)
	}
}

func TestParseRedisInfo_Empty(t *testing.T) {
	m := parseRedisInfo("")
	if m.Version != "" {
		t.Errorf("expected empty version from empty input, got %q", m.Version)
	}
	if m.HitRate != 0 {
		t.Errorf("expected 0 hit rate from empty input, got %f", m.HitRate)
	}
}

func TestParseRedisInfo_ZeroHits(t *testing.T) {
	raw := `keyspace_hits:0
keyspace_misses:0`
	m := parseRedisInfo(raw)
	if m.HitRate != 0 {
		t.Errorf("HitRate should be 0 when both hits and misses are 0, got %f", m.HitRate)
	}
}

// --- parseMemcachedStats tests ---

func TestParseMemcachedStats(t *testing.T) {
	server, client := net.Pipe()
	defer client.Close()

	go func() {
		defer server.Close()
		data := "STAT version 1.6.22\r\n" +
			"STAT uptime 86400\r\n" +
			"STAT curr_items 5000\r\n" +
			"STAT total_items 120000\r\n" +
			"STAT bytes 10485760\r\n" +
			"STAT limit_maxbytes 67108864\r\n" +
			"STAT curr_connections 25\r\n" +
			"STAT get_hits 90000\r\n" +
			"STAT get_misses 10000\r\n" +
			"STAT evictions 42\r\n" +
			"STAT cmd_get 100000\r\n" +
			"STAT cmd_set 20000\r\n" +
			"END\r\n"
		server.Write([]byte(data))
	}()

	m := parseMemcachedStats(client)

	if m.Version != "1.6.22" {
		t.Errorf("Version = %q, want '1.6.22'", m.Version)
	}
	if m.UptimeSeconds != 86400 {
		t.Errorf("UptimeSeconds = %d, want 86400", m.UptimeSeconds)
	}
	if m.CurrItems != 5000 {
		t.Errorf("CurrItems = %d, want 5000", m.CurrItems)
	}
	if m.TotalItems != 120000 {
		t.Errorf("TotalItems = %d, want 120000", m.TotalItems)
	}
	if m.Bytes != 10485760 {
		t.Errorf("Bytes = %d, want 10485760", m.Bytes)
	}
	if m.LimitMaxBytes != 67108864 {
		t.Errorf("LimitMaxBytes = %d, want 67108864", m.LimitMaxBytes)
	}
	if m.CurrConnections != 25 {
		t.Errorf("CurrConnections = %d, want 25", m.CurrConnections)
	}
	if m.GetHits != 90000 {
		t.Errorf("GetHits = %d, want 90000", m.GetHits)
	}
	if m.GetMisses != 10000 {
		t.Errorf("GetMisses = %d, want 10000", m.GetMisses)
	}
	if m.Evictions != 42 {
		t.Errorf("Evictions = %d, want 42", m.Evictions)
	}
	if m.CmdGet != 100000 {
		t.Errorf("CmdGet = %d, want 100000", m.CmdGet)
	}
	if m.CmdSet != 20000 {
		t.Errorf("CmdSet = %d, want 20000", m.CmdSet)
	}
	// HitRate: 90000 / (90000+10000) = 0.9
	if m.HitRate < 0.899 || m.HitRate > 0.901 {
		t.Errorf("HitRate = %f, want ~0.9", m.HitRate)
	}
}

func TestParseMemcachedStats_Empty(t *testing.T) {
	server, client := net.Pipe()
	defer client.Close()

	go func() {
		defer server.Close()
		server.Write([]byte("END\r\n"))
	}()

	m := parseMemcachedStats(client)
	if m.Version != "" {
		t.Errorf("expected empty version, got %q", m.Version)
	}
	if m.HitRate != 0 {
		t.Errorf("expected 0 hit rate, got %f", m.HitRate)
	}
}

// --- resolveTargets tests ---

func TestResolveTargets_FromExtra(t *testing.T) {
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"engine": "redis",
			"host":   "10.0.0.1",
			"port":   "6380",
		},
	}
	targets := resolveTargets(cfg)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0].engine != "redis" || targets[0].host != "10.0.0.1" || targets[0].port != "6380" {
		t.Errorf("unexpected target: %+v", targets[0])
	}
}

func TestResolveTargets_DefaultPorts(t *testing.T) {
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"engine": "memcached",
		},
	}
	targets := resolveTargets(cfg)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0].port != "11211" {
		t.Errorf("expected default memcached port 11211, got %q", targets[0].port)
	}
}

func TestResolveTargets_RedisDefaultPort(t *testing.T) {
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"engine": "keydb",
		},
	}
	targets := resolveTargets(cfg)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0].port != "6379" {
		t.Errorf("expected default redis port 6379, got %q", targets[0].port)
	}
}

func TestResolveTargets_NoExtra(t *testing.T) {
	cfg := models.CollectConfig{}
	targets := resolveTargets(cfg)
	// Without running services, should return empty or whatever is reachable
	_ = targets
}

// --- isPortOpen test ---

func TestIsPortOpen_Closed(t *testing.T) {
	open := isPortOpen("127.0.0.1", "19999")
	if open {
		t.Skip("port 19999 unexpectedly open — skipping test")
	}
}

// --- collectRedis against mock server ---

func TestCollectRedis_MockServer(t *testing.T) {
	// Start a minimal Redis-like mock server
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	_, port, _ := net.SplitHostPort(ln.Addr().String())

	infoResp := "# Server\r\nredis_version:7.0.0\r\nuptime_in_seconds:3600\r\n\r\n" +
		"# Clients\r\nconnected_clients:10\r\n\r\n" +
		"# Memory\r\nused_memory:1048576\r\nused_memory_peak:2097152\r\n\r\n" +
		"# Stats\r\nkeyspace_hits:8000\r\nkeyspace_misses:2000\r\n\r\n" +
		"# Replication\r\nrole:master\r\n\r\n" +
		"# Keyspace\r\ndb0:keys=100,expires=10,avg_ttl=1000\r\n"

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go handleMockRedis(conn, infoResp)
		}
	}()

	result := &models.CollectResult{
		Items:  []models.CollectedItem{},
		Errors: []models.CollectError{},
	}
	target := cacheCandidate{engine: "redis", host: "127.0.0.1", port: port}
	cfg := models.CollectConfig{}
	collectRedis(target, cfg, result)

	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}

	metrics, ok := result.Items[0].Data.(RedisMetrics)
	if !ok {
		t.Fatal("expected RedisMetrics data type")
	}
	if metrics.Version != "7.0.0" {
		t.Errorf("Version = %q, want '7.0.0'", metrics.Version)
	}
	if metrics.ConnectedClients != 10 {
		t.Errorf("ConnectedClients = %d, want 10", metrics.ConnectedClients)
	}
	if metrics.TotalKeys != 100 {
		t.Errorf("TotalKeys = %d, want 100", metrics.TotalKeys)
	}
	if metrics.Engine != "redis" {
		t.Errorf("Engine = %q, want 'redis'", metrics.Engine)
	}
}

// handleMockRedis is a minimal RESP server that responds to INFO and SLOWLOG LEN.
func handleMockRedis(conn net.Conn, infoResp string) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	buf := make([]byte, 4096)

	for {
		n, err := conn.Read(buf)
		if err != nil {
			return
		}
		data := string(buf[:n])

		switch {
		case containsCommand(data, "INFO"):
			// Send bulk string response
			resp := "$" + itoa(len(infoResp)) + "\r\n" + infoResp + "\r\n"
			conn.Write([]byte(resp))
		case containsCommand(data, "SLOWLOG"):
			// Return integer 5
			conn.Write([]byte(":5\r\n"))
		default:
			conn.Write([]byte("-ERR unknown command\r\n"))
		}
	}
}

func containsCommand(data, cmd string) bool {
	for i := 0; i <= len(data)-len(cmd); i++ {
		if len(data) >= i+len(cmd) {
			match := true
			for j := 0; j < len(cmd); j++ {
				c := data[i+j]
				if c != cmd[j] && c != cmd[j]+32 && c != cmd[j]-32 {
					match = false
					break
				}
			}
			if match {
				return true
			}
		}
	}
	return false
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	result := ""
	for n > 0 {
		result = string(rune('0'+n%10)) + result
		n /= 10
	}
	return result
}
