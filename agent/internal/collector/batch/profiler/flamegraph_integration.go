package profiler

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"


)

// ── Flamegraph result types ─────────────────────────────────────────────────

// BatchFlamegraphResult holds perf/eBPF flamegraph data targeted at a specific
// batch PID.
type BatchFlamegraphResult struct {
	ExecutionID  string `json:"execution_id"`
	PID          int    `json:"pid"`
	ProfileType  string `json:"profile_type"` // cpu, offcpu, memory
	FoldedStack  []byte `json:"folded_stack"`  // raw folded stack data
	TotalSamples int64  `json:"total_samples"`
	DurationSec  int    `json:"duration_sec"`
	CapturedAt   time.Time `json:"captured_at"`
}

// ── Flamegraph profiling functions ──────────────────────────────────────────

// profileBatchFlamegraphCPU triggers on-CPU profiling for a specific batch PID
// using the perf record pipeline from Phase 35.
func profileBatchFlamegraphCPU(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	if runtime.GOOS != "linux" {
		return makeErrorResult(exec, "flamegraph", fmt.Errorf("perf flamegraph profiling requires Linux"))
	}

	result, err := capturePerfFlamegraph(ctx, exec.ExecutionID, exec.PID, "cpu", cfg.Duration)
	return makeResult(exec, "flamegraph", result, start, err)
}

// profileBatchFlamegraphOffCPU triggers off-CPU profiling for a specific batch PID.
func profileBatchFlamegraphOffCPU(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	if runtime.GOOS != "linux" {
		return makeErrorResult(exec, "offcpu", fmt.Errorf("off-CPU profiling requires Linux"))
	}

	result, err := capturePerfFlamegraph(ctx, exec.ExecutionID, exec.PID, "offcpu", cfg.Duration)
	return makeResult(exec, "offcpu", result, start, err)
}

// capturePerfFlamegraph runs perf/eBPF profiling targeted at a specific PID.
func capturePerfFlamegraph(ctx context.Context, executionID string, pid int, profileType string, durationSec int) (*BatchFlamegraphResult, error) {
	// Check if perf is available
	perfPath, err := exec.LookPath("perf")
	if err != nil {
		return nil, fmt.Errorf("perf binary not found: %w", err)
	}

	// Check capabilities
	if !checkPerfCapabilities() {
		return nil, fmt.Errorf("insufficient capabilities for perf profiling (need CAP_PERFMON or CAP_SYS_ADMIN)")
	}

	var folded []byte
	switch profileType {
	case "cpu":
		folded, err = perfRecordOnCPU(ctx, perfPath, pid, durationSec)
	case "offcpu":
		folded, err = perfRecordOffCPU(ctx, perfPath, pid, durationSec)
	default:
		return nil, fmt.Errorf("unsupported flamegraph profile type: %s", profileType)
	}

	if err != nil {
		return nil, err
	}

	totalSamples := countFoldedSamples(folded)

	return &BatchFlamegraphResult{
		ExecutionID:  executionID,
		PID:          pid,
		ProfileType:  profileType,
		FoldedStack:  folded,
		TotalSamples: totalSamples,
		DurationSec:  durationSec,
		CapturedAt:   time.Now().UTC(),
	}, nil
}

// perfRecordOnCPU runs perf record -p {PID} for on-CPU profiling and converts
// to folded stack format.
func perfRecordOnCPU(ctx context.Context, perfPath string, pid int, durationSec int) ([]byte, error) {
	dataFile := fmt.Sprintf("/tmp/aitop-batchperf-cpu-%d-%d.data", pid, time.Now().UnixMilli())
	defer os.Remove(dataFile)

	timeout := time.Duration(durationSec+15) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// perf record -F 99 -g -p PID -- sleep duration
	args := []string{
		"record",
		"-F", "99",
		"-g",
		"--call-graph", "dwarf",
		"-o", dataFile,
		"-p", fmt.Sprintf("%d", pid),
		"--", "sleep", fmt.Sprintf("%d", durationSec),
	}

	cmd := exec.CommandContext(cmdCtx, perfPath, args...)
	cmd.Stderr = &bytes.Buffer{}
	if err := cmd.Run(); err != nil {
		stderr := cmd.Stderr.(*bytes.Buffer).String()
		return nil, fmt.Errorf("perf record (on-CPU) pid=%d: %w (stderr: %s)", pid, err, stderr)
	}

	return perfDataToFolded(ctx, perfPath, dataFile)
}

// perfRecordOffCPU runs perf record with sched:sched_switch for off-CPU
// profiling targeted at a specific PID.
func perfRecordOffCPU(ctx context.Context, perfPath string, pid int, durationSec int) ([]byte, error) {
	dataFile := fmt.Sprintf("/tmp/aitop-batchperf-offcpu-%d-%d.data", pid, time.Now().UnixMilli())
	defer os.Remove(dataFile)

	timeout := time.Duration(durationSec+15) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// perf record -e sched:sched_switch -g -p PID -- sleep duration
	args := []string{
		"record",
		"-e", "sched:sched_switch",
		"-g",
		"--call-graph", "dwarf",
		"-o", dataFile,
		"-p", fmt.Sprintf("%d", pid),
		"--", "sleep", fmt.Sprintf("%d", durationSec),
	}

	cmd := exec.CommandContext(cmdCtx, perfPath, args...)
	cmd.Stderr = &bytes.Buffer{}
	if err := cmd.Run(); err != nil {
		// off-CPU may fail if sched tracepoint is not available — this is non-fatal
		stderr := cmd.Stderr.(*bytes.Buffer).String()
		return nil, fmt.Errorf("perf record (off-CPU) pid=%d: %w (stderr: %s)", pid, err, stderr)
	}

	return perfDataToFolded(ctx, perfPath, dataFile)
}

// perfDataToFolded converts a perf.data file to folded stack format using
// `perf script` and then parsing.
func perfDataToFolded(ctx context.Context, perfPath string, dataFile string) ([]byte, error) {
	scriptCmd := exec.CommandContext(ctx, perfPath, "script", "-i", dataFile)
	scriptOutput, err := scriptCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("perf script failed: %w", err)
	}

	folded := perfScriptToFolded(scriptOutput)
	if len(folded) == 0 {
		return nil, fmt.Errorf("no stack samples captured from perf data")
	}

	return folded, nil
}

// perfScriptToFolded converts raw `perf script` output to Brendan Gregg's
// folded stack format. This mirrors the Phase 35 oncpu_profiler.go implementation.
func perfScriptToFolded(output []byte) []byte {
	counts := make(map[string]int64)
	lines := strings.Split(string(output), "\n")

	var currentStack []string
	inStack := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if trimmed == "" {
			if len(currentStack) > 0 {
				reversed := make([]string, len(currentStack))
				for i, frame := range currentStack {
					reversed[len(currentStack)-1-i] = frame
				}
				key := strings.Join(reversed, ";")
				counts[key]++
				currentStack = nil
			}
			inStack = false
			continue
		}

		if strings.HasPrefix(line, "\t") || strings.HasPrefix(line, " ") {
			inStack = true
			frame := parsePerfFrameName(trimmed)
			if frame != "" {
				currentStack = append(currentStack, frame)
			}
		} else if !inStack {
			continue
		}
	}

	if len(currentStack) > 0 {
		reversed := make([]string, len(currentStack))
		for i, frame := range currentStack {
			reversed[len(currentStack)-1-i] = frame
		}
		key := strings.Join(reversed, ";")
		counts[key]++
	}

	var buf bytes.Buffer
	for stack, count := range counts {
		fmt.Fprintf(&buf, "%s %d\n", stack, count)
	}

	return buf.Bytes()
}

// parsePerfFrameName extracts the function name from a perf script frame line.
func parsePerfFrameName(line string) string {
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return "[unknown]"
	}

	funcField := parts[1]
	if idx := strings.Index(funcField, "+"); idx > 0 {
		funcField = funcField[:idx]
	}

	if funcField == "[unknown]" || funcField == "0x0" {
		return "[unknown]"
	}

	return funcField
}

// checkPerfCapabilities verifies that we have sufficient privileges for perf
// profiling (CAP_PERFMON or CAP_SYS_ADMIN or root).
func checkPerfCapabilities() bool {
	if os.Getuid() == 0 {
		return true
	}

	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return false
	}

	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "CapEff:") {
			hex := strings.TrimSpace(strings.TrimPrefix(line, "CapEff:"))
			capEff, err := parseHexUint64(hex)
			if err != nil {
				return false
			}
			const capSysAdmin = 21
			const capPerfmon = 38
			hasSysAdmin := capEff&(1<<capSysAdmin) != 0
			hasPerfmon := capEff&(1<<capPerfmon) != 0
			return hasSysAdmin || hasPerfmon
		}
	}
	return false
}

// parseHexUint64 parses a hexadecimal string (with or without 0x prefix).
func parseHexUint64(s string) (uint64, error) {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "0x")
	var result uint64
	for _, c := range s {
		result <<= 4
		switch {
		case c >= '0' && c <= '9':
			result |= uint64(c - '0')
		case c >= 'a' && c <= 'f':
			result |= uint64(c-'a') + 10
		case c >= 'A' && c <= 'F':
			result |= uint64(c-'A') + 10
		default:
			return 0, fmt.Errorf("invalid hex character: %c", c)
		}
	}
	return result, nil
}

// countFoldedSamples counts total samples in folded stack data.
func countFoldedSamples(data []byte) int64 {
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
		if n, err := fmt.Sscanf(strings.TrimSpace(line[idx+1:]), "%d", new(int64)); n == 1 && err == nil {
			val := int64(0)
			fmt.Sscanf(strings.TrimSpace(line[idx+1:]), "%d", &val)
			total += val
		}
	}
	return total
}
