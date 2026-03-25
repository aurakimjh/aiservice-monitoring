package batch

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector implements models.Collector for batch process auto-detection
// and monitoring.
type Collector struct {
	lifecycle *LifecycleManager
	procCol   *ProcessCollector
	cfg       DetectorConfig
	logger    *slog.Logger
}

// New returns a new Batch Collector.
func New() *Collector {
	logger := slog.Default().With("collector", "batch")
	return &Collector{
		lifecycle: NewLifecycleManager(logger),
		procCol:   NewProcessCollector(),
		cfg: DetectorConfig{
			PollInterval: 5 * time.Second,
		},
		logger: logger,
	}
}

func (c *Collector) ID() string      { return "batch" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "read", Target: "/proc/[pid]/stat", Description: "read process CPU stats"},
		{Type: "read", Target: "/proc/[pid]/status", Description: "read process memory stats"},
		{Type: "read", Target: "/proc/[pid]/io", Description: "read process I/O counters"},
		{Type: "read", Target: "/proc/[pid]/cmdline", Description: "detect batch processes"},
		{Type: "read", Target: "/proc/[pid]/cgroup", Description: "detect systemd timer children"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"batch.execution.v1",
		"batch.metrics.v1",
	}
}

// AutoDetect checks whether any batch processes are running or manual
// configuration exists.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	// Check if manual batch config exists
	if len(c.cfg.ManualBatches) > 0 {
		return models.DetectResult{
			Detected: true,
			Details: map[string]string{
				"reason":        "manual_config",
				"manual_count":  strconv.Itoa(len(c.cfg.ManualBatches)),
			},
		}, nil
	}

	// Attempt auto-detection
	procs := DetectBatchProcesses(c.cfg)
	if len(procs) > 0 {
		return models.DetectResult{
			Detected: true,
			Details: map[string]string{
				"reason":          "auto_detected",
				"process_count":   strconv.Itoa(len(procs)),
				"first_name":      procs[0].Name,
				"first_scheduler": procs[0].Scheduler,
			},
		}, nil
	}

	return models.DetectResult{Detected: false}, nil
}

// Collect runs the full batch monitoring cycle:
//  1. Detect batch processes
//  2. Track new processes in the lifecycle manager
//  3. Collect metrics for running processes
//  4. Check for completed processes
//  5. Return execution records and metrics snapshots
func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	// Step 1: Detect batch processes
	detected := DetectBatchProcesses(c.cfg)

	// Step 2: Track new processes
	for _, bp := range detected {
		c.lifecycle.TrackProcess(bp)
	}

	// Step 3: Collect metrics for running processes
	trackedPIDs := c.lifecycle.TrackedPIDs()
	detectedPIDs := make(map[int]bool, len(detected))
	for _, bp := range detected {
		detectedPIDs[bp.PID] = true
	}

	for pid := range trackedPIDs {
		m, err := c.procCol.CollectMetrics(pid)
		if err != nil {
			// Process may have exited — check and complete
			if !processExists(pid) {
				exitCode := readExitCode(pid)
				c.lifecycle.CompleteProcess(pid, exitCode)
				c.procCol.CleanupPID(pid)
			} else {
				result.Errors = append(result.Errors, models.CollectError{
					Code:    models.ErrParseError,
					Message: fmt.Sprintf("metrics collection failed for PID %d: %v", pid, err),
				})
			}
			continue
		}
		c.lifecycle.UpdateMetrics(pid, m)
	}

	// Step 4: Check for processes that disappeared (not in current scan)
	for pid := range trackedPIDs {
		if !detectedPIDs[pid] && !processExists(pid) {
			exitCode := readExitCode(pid)
			c.lifecycle.CompleteProcess(pid, exitCode)
			c.procCol.CleanupPID(pid)
		}
	}

	// Step 5: Build output items

	// Running batch process metrics snapshot
	running := c.lifecycle.GetRunning()
	if len(running) > 0 {
		metricsData := make([]map[string]interface{}, 0, len(running))
		for _, exec := range running {
			var latestMetrics *ProcessMetrics
			if len(exec.Metrics) > 0 {
				latestMetrics = &exec.Metrics[len(exec.Metrics)-1]
			}
			entry := map[string]interface{}{
				"execution_id": exec.ExecutionID,
				"job_name":     exec.JobName,
				"pid":          exec.PID,
				"language":     exec.Language,
				"scheduler":    exec.Scheduler,
				"state":        exec.State,
				"started_at":   exec.StartedAt.Format(time.RFC3339),
				"detected_via": exec.DetectedVia,
			}
			if latestMetrics != nil {
				entry["cpu_percent"] = latestMetrics.CPUPercent
				entry["memory_rss"] = latestMetrics.MemoryRSS
				entry["memory_vms"] = latestMetrics.MemoryVMS
				entry["thread_count"] = latestMetrics.ThreadCount
				entry["io_read_bytes"] = latestMetrics.IOReadBytes
				entry["io_write_bytes"] = latestMetrics.IOWriteBytes
			}
			metricsData = append(metricsData, entry)
		}

		result.Items = append(result.Items, models.CollectedItem{
			SchemaName:    "batch.metrics.v1",
			SchemaVersion: "1.0.0",
			MetricType:    "gauge",
			Category:      "it",
			Data: map[string]interface{}{
				"running_count": len(running),
				"processes":     metricsData,
			},
		})
	}

	// Completed batch execution records (last 100)
	completed := c.lifecycle.GetCompleted(100)
	if len(completed) > 0 {
		execData := make([]map[string]interface{}, 0, len(completed))
		for _, exec := range completed {
			execData = append(execData, map[string]interface{}{
				"execution_id":   exec.ExecutionID,
				"job_name":       exec.JobName,
				"pid":            exec.PID,
				"language":       exec.Language,
				"scheduler":      exec.Scheduler,
				"state":          exec.State,
				"started_at":     exec.StartedAt.Format(time.RFC3339),
				"ended_at":       exec.EndedAt.Format(time.RFC3339),
				"exit_code":      exec.ExitCode,
				"duration_ms":    exec.DurationMs,
				"cpu_avg":        exec.CPUAvg,
				"cpu_max":        exec.CPUMax,
				"memory_avg":     exec.MemoryAvg,
				"memory_max":     exec.MemoryMax,
				"io_read_total":  exec.IOReadTotal,
				"io_write_total": exec.IOWriteTotal,
				"detected_via":   exec.DetectedVia,
			})
		}

		result.Items = append(result.Items, models.CollectedItem{
			SchemaName:    "batch.execution.v1",
			SchemaVersion: "1.0.0",
			MetricType:    "event",
			Category:      "it",
			Data: map[string]interface{}{
				"completed_count": len(completed),
				"executions":      execData,
			},
		})
	}

	// Set final status
	if len(result.Items) == 0 && len(result.Errors) > 0 {
		result.Status = models.StatusFailed
	} else if len(result.Errors) > 0 {
		result.Status = models.StatusPartial
	} else if len(result.Items) == 0 {
		result.Status = models.StatusSkipped
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrEnvNotDetected,
			Message: "no batch processes detected or tracked",
		})
	}

	result.Duration = time.Since(start)
	return result, nil
}

// processExists checks if a PID is still running.
func processExists(pid int) bool {
	_, err := os.Stat(fmt.Sprintf("/proc/%d", pid))
	return err == nil
}

// readExitCode attempts to read the exit code for a recently exited process.
// On Linux, /proc/{pid}/stat disappears immediately on exit, so we default to
// a heuristic: 0 if process exited normally, 1 otherwise.
func readExitCode(pid int) int {
	// Try to read wait status from /proc/{pid}/stat if still available
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		// Process already gone — assume normal exit
		return 0
	}

	s := string(data)
	closeParen := strings.LastIndex(s, ")")
	if closeParen < 0 || closeParen+2 >= len(s) {
		return 0
	}
	fields := strings.Fields(s[closeParen+2:])
	if len(fields) < 1 {
		return 0
	}
	// state field: Z = zombie (has exit code in field 49, but rarely available)
	state := fields[0]
	if state == "Z" {
		return 1 // zombie typically means abnormal exit
	}
	return 0
}
