//go:build !windows

package health

import "github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"

func collectCPUBreakdownWindows() models.CPUMetrics     { return models.CPUMetrics{IdlePct: 100} }
func collectMemoryBreakdownWindows() models.MemoryMetrics { return models.MemoryMetrics{} }
func collectDiskMetricsWindows() []models.DiskMetrics    { return nil }
func collectNetMetricsWindows() []models.NetMetrics      { return nil }
func collectTopProcessesWindows() []models.ProcessInfo   { return nil }
