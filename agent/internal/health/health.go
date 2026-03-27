package health

import (
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/version"
)

// Monitor tracks the agent's own health status.
type Monitor struct {
	agentID  string
	hostname string
	startAt  time.Time

	mu          sync.Mutex
	prevCPUTime float64
	prevWallAt  time.Time
	lastCPUPct  float64
}

// NewMonitor creates a new health monitor.
func NewMonitor(agentID string) *Monitor {
	hostname, _ := os.Hostname()
	now := time.Now()
	return &Monitor{
		agentID:     agentID,
		hostname:    hostname,
		startAt:     now,
		prevCPUTime: processCPUSeconds(),
		prevWallAt:  now,
	}
}

// SelfMetrics returns the agent's own resource usage.
type SelfMetrics struct {
	HeapAllocMB   float64 `json:"heap_alloc_mb"`
	SysMemMB      float64 `json:"sys_mem_mb"`
	NumGoroutines int     `json:"num_goroutines"`
	UptimeSeconds float64 `json:"uptime_seconds"`
	CPUPercent    float64 `json:"cpu_percent"`
}

// GetSelfMetrics returns current agent resource usage.
func (m *Monitor) GetSelfMetrics() SelfMetrics {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	return SelfMetrics{
		HeapAllocMB:   float64(mem.HeapAlloc) / 1024 / 1024,
		SysMemMB:      float64(mem.Sys) / 1024 / 1024,
		NumGoroutines: runtime.NumGoroutine(),
		UptimeSeconds: time.Since(m.startAt).Seconds(),
		CPUPercent:    m.sampleCPUPercent(),
	}
}

// sampleCPUPercent computes the agent's CPU usage since the last sample.
func (m *Monitor) sampleCPUPercent() float64 {
	now := time.Now()
	cpuNow := processCPUSeconds()

	m.mu.Lock()
	defer m.mu.Unlock()

	wallDelta := now.Sub(m.prevWallAt).Seconds()
	if wallDelta > 0 {
		cpuDelta := cpuNow - m.prevCPUTime
		m.lastCPUPct = (cpuDelta / wallDelta) * 100
	}
	m.prevCPUTime = cpuNow
	m.prevWallAt = now

	return m.lastCPUPct
}

// BuildHeartbeat creates a heartbeat message with current agent state.
// Includes detailed OS metrics (CPU breakdown, memory breakdown, disk, network, processes).
func (m *Monitor) BuildHeartbeat(plugins []models.PluginStatus, privReport *models.PrivilegeReport) *models.Heartbeat {
	osm := CollectOSMetrics()

	return &models.Heartbeat{
		AgentID:         m.agentID,
		Hostname:        m.hostname,
		Timestamp:       time.Now().UTC(),
		Status:          models.AgentHealthy,
		AgentVersion:    version.Version,
		OSType:          runtime.GOOS,
		OSVersion:       "",
		CPUPercent:      osm.CPU.TotalPct,
		MemoryMB:        osm.Memory.UsedMB,
		Plugins:         plugins,
		PrivilegeReport: privReport,
		OSMetrics:       osm,
	}
}
