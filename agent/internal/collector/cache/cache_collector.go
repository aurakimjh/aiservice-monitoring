package cache

// Collector gathers metrics from Redis-compatible caches.
// Supported: Redis 5-7, Valkey, KeyDB, DragonflyDB, Memcached.

import (
	"context"
	"fmt"
	"net"
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
// TODO: implement Redis INFO parsing, SLOWLOG retrieval, and Memcached stats.
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
	result.Duration = time.Since(start)
	return result, nil
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

// redisINFO sends the INFO command to a Redis-compatible server and returns the raw response.
// This is a placeholder for future implementation.
func redisINFO(host, port string) (string, error) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 3*time.Second)
	if err != nil {
		return "", fmt.Errorf("connect to %s:%s: %w", host, port, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	_, err = conn.Write([]byte("*1\r\n$4\r\nINFO\r\n"))
	if err != nil {
		return "", fmt.Errorf("write INFO command: %w", err)
	}

	buf := make([]byte, 64*1024)
	n, err := conn.Read(buf)
	if err != nil {
		return "", fmt.Errorf("read INFO response: %w", err)
	}
	return string(buf[:n]), nil
}
