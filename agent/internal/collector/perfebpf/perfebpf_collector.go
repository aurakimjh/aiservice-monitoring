// Package perfebpf provides a Collector for system-level perf/eBPF profiling.
// It captures on-CPU, off-CPU, and memory allocation flamegraphs using Linux
// perf_events and eBPF (bpftrace) tooling.
//
// Supported only on Linux; requires CAP_BPF + CAP_PERFMON (or CAP_SYS_ADMIN
// fallback) and read access to /proc.
package perfebpf

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers system-level perf/eBPF profiling data and produces
// folded-stack output suitable for flamegraph generation.
type Collector struct{}

// New returns a new perf/eBPF Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "perf-ebpf" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "cap", Target: "CAP_BPF", Description: "eBPF program loading"},
		{Type: "cap", Target: "CAP_PERFMON", Description: "perf_event_open for sampling"},
		{Type: "cap", Target: "CAP_SYS_ADMIN", Description: "fallback: combined BPF+perf capability"},
		{Type: "cap", Target: "CAP_SYS_PTRACE", Description: "read /proc/[pid]/* of other processes"},
		{Type: "read", Target: "/proc", Description: "read process info and kernel capabilities"},
		{Type: "exec", Target: "perf", Description: "run perf record/script pipeline"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"profiling.perf_oncpu.v1",
		"profiling.perf_offcpu.v1",
		"profiling.perf_memory.v1",
	}
}

// AutoDetect checks whether the current host is Linux with perf available and
// sufficient kernel capabilities for eBPF profiling.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	if runtime.GOOS != "linux" {
		return models.DetectResult{Detected: false, Details: map[string]string{
			"reason": "perf/eBPF profiling requires Linux",
		}}, nil
	}

	// Check perf binary
	perfPath, err := exec.LookPath("perf")
	if err != nil {
		return models.DetectResult{Detected: false, Details: map[string]string{
			"reason": "perf binary not found in PATH",
		}}, nil
	}

	// Check capabilities
	hasBPF, hasPerfmon, hasSysAdmin, _ := checkCapabilities()
	if !hasBPF && !hasSysAdmin {
		return models.DetectResult{Detected: false, Details: map[string]string{
			"reason": "missing CAP_BPF or CAP_SYS_ADMIN",
		}}, nil
	}
	if !hasPerfmon && !hasSysAdmin {
		return models.DetectResult{Detected: false, Details: map[string]string{
			"reason": "missing CAP_PERFMON or CAP_SYS_ADMIN",
		}}, nil
	}

	details := map[string]string{
		"perf_path":    perfPath,
		"has_bpf":      strconv.FormatBool(hasBPF),
		"has_perfmon":  strconv.FormatBool(hasPerfmon),
		"has_sysadmin": strconv.FormatBool(hasSysAdmin),
	}

	// Optionally check for bpftrace
	if bp, err := exec.LookPath("bpftrace"); err == nil {
		details["bpftrace_path"] = bp
	}

	return models.DetectResult{Detected: true, Details: details}, nil
}

// Collect orchestrates on-CPU, off-CPU, and memory profiling based on the
// configuration provided in cfg.Extra.
//
// Supported cfg.Extra keys:
//   - "sampling_frequency" → default 99 Hz
//   - "duration_sec"       → default 30s, max 300s
//   - "target"             → "all" or "pid:12345"
//   - "profile_types"      → comma-separated: "cpu,offcpu,memory" (default all)
//   - "stack_depth"        → default 127
func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
		Metadata:         make(map[string]string),
	}

	// Parse configuration
	frequency := 99
	if v, ok := cfg.Extra["sampling_frequency"]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 999 {
			frequency = n
		}
	}

	durationSec := 30
	if v, ok := cfg.Extra["duration_sec"]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 300 {
				result.Errors = append(result.Errors, models.CollectError{
					Code:       ErrDurationLimitExceeded,
					Message:    fmt.Sprintf("duration %ds exceeds maximum 300s, clamping", n),
					Suggestion: "set duration_sec <= 300",
				})
				n = 300
			}
			durationSec = n
		}
	}

	target := "all"
	if v, ok := cfg.Extra["target"]; ok && v != "" {
		target = v
	}

	stackDepth := 127
	if v, ok := cfg.Extra["stack_depth"]; ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 256 {
			stackDepth = n
		}
	}

	profileTypes := []string{"cpu", "offcpu", "memory"}
	if v, ok := cfg.Extra["profile_types"]; ok && v != "" {
		profileTypes = strings.Split(v, ",")
		for i := range profileTypes {
			profileTypes[i] = strings.TrimSpace(profileTypes[i])
		}
	}

	// Parse target PID if specified
	targetPID := 0
	if strings.HasPrefix(target, "pid:") {
		if n, err := strconv.Atoi(target[4:]); err == nil && n > 0 {
			targetPID = n
		}
	}

	opts := &profileOpts{
		frequency:  frequency,
		duration:   durationSec,
		targetPID:  targetPID,
		stackDepth: stackDepth,
	}

	result.Metadata["target"] = target
	result.Metadata["frequency"] = strconv.Itoa(frequency)
	result.Metadata["duration_sec"] = strconv.Itoa(durationSec)
	result.Metadata["profile_types"] = strings.Join(profileTypes, ",")

	// Collect each requested profile type
	for _, pt := range profileTypes {
		switch pt {
		case "cpu":
			data, err := collectOnCPU(ctx, opts)
			if err != nil {
				result.Errors = append(result.Errors, models.CollectError{
					Code:    models.ErrParseError,
					Message: fmt.Sprintf("on-CPU profiling failed: %v", err),
				})
				continue
			}
			if err := ValidateFoldedStack(data); err == nil {
				compressed, _ := CompressFoldedStack(data)
				result.Items = append(result.Items, models.CollectedItem{
					SchemaName:    "profiling.perf_oncpu.v1",
					SchemaVersion: "1.0.0",
					MetricType:    "profile",
					Category:      "it",
					Data: map[string]interface{}{
						"folded_stack_gz": compressed,
						"sample_count":   countSamples(data),
						"profile_type":   "cpu",
					},
				})
			}

		case "offcpu":
			data, err := collectOffCPU(ctx, opts)
			if err != nil {
				result.Errors = append(result.Errors, models.CollectError{
					Code:    models.ErrParseError,
					Message: fmt.Sprintf("off-CPU profiling failed: %v", err),
				})
				continue
			}
			if err := ValidateFoldedStack(data); err == nil {
				compressed, _ := CompressFoldedStack(data)
				result.Items = append(result.Items, models.CollectedItem{
					SchemaName:    "profiling.perf_offcpu.v1",
					SchemaVersion: "1.0.0",
					MetricType:    "profile",
					Category:      "it",
					Data: map[string]interface{}{
						"folded_stack_gz": compressed,
						"sample_count":   countSamples(data),
						"profile_type":   "offcpu",
					},
				})
			}

		case "memory":
			data, err := collectMemory(ctx, opts)
			if err != nil {
				result.Errors = append(result.Errors, models.CollectError{
					Code:    models.ErrParseError,
					Message: fmt.Sprintf("memory profiling failed: %v", err),
				})
				continue
			}
			if err := ValidateFoldedStack(data); err == nil {
				compressed, _ := CompressFoldedStack(data)
				result.Items = append(result.Items, models.CollectedItem{
					SchemaName:    "profiling.perf_memory.v1",
					SchemaVersion: "1.0.0",
					MetricType:    "profile",
					Category:      "it",
					Data: map[string]interface{}{
						"folded_stack_gz": compressed,
						"sample_count":   countSamples(data),
						"profile_type":   "memory",
					},
				})
			}
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

// profileOpts holds parsed profiling parameters.
type profileOpts struct {
	frequency  int
	duration   int
	targetPID  int
	stackDepth int
}

// countSamples counts total samples in folded stack data.
func countSamples(data []byte) int64 {
	var total int64
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.LastIndex(line, " ")
		if idx < 0 {
			continue
		}
		if n, err := strconv.ParseInt(strings.TrimSpace(line[idx+1:]), 10, 64); err == nil {
			total += n
		}
	}
	return total
}
