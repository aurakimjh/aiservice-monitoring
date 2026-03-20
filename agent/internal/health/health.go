package health

import (
	"os"
	"runtime"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/version"
)

// Monitor tracks the agent's own health status.
type Monitor struct {
	agentID  string
	hostname string
	startAt  time.Time
}

// NewMonitor creates a new health monitor.
func NewMonitor(agentID string) *Monitor {
	hostname, _ := os.Hostname()
	return &Monitor{
		agentID:  agentID,
		hostname: hostname,
		startAt:  time.Now(),
	}
}

// SelfMetrics returns the agent's own resource usage.
type SelfMetrics struct {
	HeapAllocMB   float64 `json:"heap_alloc_mb"`
	SysMemMB      float64 `json:"sys_mem_mb"`
	NumGoroutines int     `json:"num_goroutines"`
	UptimeSeconds float64 `json:"uptime_seconds"`
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
	}
}

// BuildHeartbeat creates a heartbeat message with current agent state.
func (m *Monitor) BuildHeartbeat(plugins []models.PluginStatus, privReport *models.PrivilegeReport) *models.Heartbeat {
	self := m.GetSelfMetrics()

	return &models.Heartbeat{
		AgentID:         m.agentID,
		Hostname:        m.hostname,
		Timestamp:       time.Now().UTC(),
		Status:          models.AgentHealthy,
		AgentVersion:    version.Version,
		OSType:          runtime.GOOS,
		OSVersion:       "",
		CPUPercent:      0, // TODO: track agent CPU usage
		MemoryMB:        self.SysMemMB,
		Plugins:         plugins,
		PrivilegeReport: privReport,
	}
}
