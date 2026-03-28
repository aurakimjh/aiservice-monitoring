package health

import (
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestNewMonitor(t *testing.T) {
	m := NewMonitor("agent-001")
	if m.agentID != "agent-001" {
		t.Errorf("agentID = %q, want 'agent-001'", m.agentID)
	}
	if m.hostname == "" {
		t.Error("hostname should not be empty")
	}
	if m.startAt.IsZero() {
		t.Error("startAt should not be zero")
	}
	if m.prevWallAt.IsZero() {
		t.Error("prevWallAt should be initialized")
	}
}

func TestGetSelfMetrics(t *testing.T) {
	m := NewMonitor("test-agent")
	// Small sleep so uptime > 0
	time.Sleep(10 * time.Millisecond)
	metrics := m.GetSelfMetrics()

	if metrics.HeapAllocMB <= 0 {
		t.Errorf("HeapAllocMB should be > 0, got %f", metrics.HeapAllocMB)
	}
	if metrics.SysMemMB <= 0 {
		t.Errorf("SysMemMB should be > 0, got %f", metrics.SysMemMB)
	}
	if metrics.NumGoroutines <= 0 {
		t.Errorf("NumGoroutines should be > 0, got %d", metrics.NumGoroutines)
	}
	if metrics.UptimeSeconds <= 0 {
		t.Errorf("UptimeSeconds should be > 0, got %f", metrics.UptimeSeconds)
	}
	if metrics.CPUPercent < 0 {
		t.Errorf("CPUPercent should be >= 0, got %f", metrics.CPUPercent)
	}
}

func TestSampleCPUPercent_NonNegative(t *testing.T) {
	m := NewMonitor("test-agent")
	// First sample — delta is small, should still be >= 0
	pct := m.sampleCPUPercent()
	if pct < 0 {
		t.Errorf("sampleCPUPercent should be >= 0, got %f", pct)
	}

	// Do some work to generate CPU usage
	sum := 0.0
	for i := 0; i < 1_000_000; i++ {
		sum += float64(i) * 0.001
	}
	_ = sum

	pct2 := m.sampleCPUPercent()
	if pct2 < 0 {
		t.Errorf("sampleCPUPercent after work should be >= 0, got %f", pct2)
	}
}

func TestProcessCPUSeconds(t *testing.T) {
	s := processCPUSeconds()
	if s < 0 {
		t.Errorf("processCPUSeconds should be >= 0, got %f", s)
	}
}

func TestBuildHeartbeat(t *testing.T) {
	m := NewMonitor("hb-agent")
	time.Sleep(10 * time.Millisecond)

	plugins := []models.PluginStatus{
		{PluginID: "it-cache", Status: "active", AutoDetected: true},
	}
	hb := m.BuildHeartbeat(plugins, nil)

	if hb.AgentID != "hb-agent" {
		t.Errorf("AgentID = %q, want 'hb-agent'", hb.AgentID)
	}
	if hb.Hostname == "" {
		t.Error("Hostname should not be empty")
	}
	if hb.Timestamp.IsZero() {
		t.Error("Timestamp should not be zero")
	}
	if hb.Status != models.AgentHealthy {
		t.Errorf("Status = %q, want AgentHealthy", hb.Status)
	}
	if hb.MemoryMB <= 0 {
		t.Errorf("MemoryMB should be > 0, got %f", hb.MemoryMB)
	}
	if hb.CPUPercent < 0 {
		t.Errorf("CPUPercent should be >= 0, got %f", hb.CPUPercent)
	}
	if len(hb.Plugins) != 1 {
		t.Errorf("expected 1 plugin, got %d", len(hb.Plugins))
	}
}

func TestBuildHeartbeat_CPUUpdates(t *testing.T) {
	m := NewMonitor("cpu-agent")

	// First heartbeat
	hb1 := m.BuildHeartbeat(nil, nil)

	// Generate CPU work between heartbeats
	sum := 0.0
	for i := 0; i < 2_000_000; i++ {
		sum += float64(i) * 0.001
	}
	_ = sum

	// Second heartbeat — CPU should still be non-negative
	hb2 := m.BuildHeartbeat(nil, nil)

	if hb1.CPUPercent < 0 {
		t.Errorf("first heartbeat CPUPercent should be >= 0, got %f", hb1.CPUPercent)
	}
	if hb2.CPUPercent < 0 {
		t.Errorf("second heartbeat CPUPercent should be >= 0, got %f", hb2.CPUPercent)
	}
}

func TestSelfMetrics_CPUPercent_Field(t *testing.T) {
	m := NewMonitor("field-test")
	metrics := m.GetSelfMetrics()

	// Verify the CPUPercent field exists and is populated
	if metrics.CPUPercent < 0 {
		t.Errorf("CPUPercent in SelfMetrics should be >= 0, got %f", metrics.CPUPercent)
	}
}
