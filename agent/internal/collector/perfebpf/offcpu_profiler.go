package perfebpf

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/google/uuid"
)

// collectOffCPU runs off-CPU profiling to capture time spent in blocking
// operations such as I/O waits, lock contention, and sleep.
//
// Preferred method: perf record -e sched:sched_switch with call-graph.
// Fallback: bpftrace one-liner tracing sched_switch with stack aggregation.
// Final fallback: simulated data for environments without tracepoint access.
//
// The returned folded stacks use microseconds of wait time as the weight
// (rather than sample counts), enabling accurate off-CPU flamegraphs.
func collectOffCPU(ctx context.Context, opts *profileOpts) ([]byte, error) {
	// Try perf sched:sched_switch first
	data, err := collectOffCPUPerf(ctx, opts)
	if err == nil && len(data) > 0 {
		return data, nil
	}

	// Fallback: bpftrace
	data, err = collectOffCPUBpftrace(ctx, opts)
	if err == nil && len(data) > 0 {
		return data, nil
	}

	return nil, fmt.Errorf("off-CPU profiling unavailable: perf sched:sched_switch and bpftrace both failed")
}

// collectOffCPUPerf uses perf record with sched:sched_switch tracepoint.
func collectOffCPUPerf(ctx context.Context, opts *profileOpts) ([]byte, error) {
	id := uuid.New().String()[:8]
	dataFile := fmt.Sprintf("/tmp/aitop-offcpu-%s.data", id)
	defer os.Remove(dataFile)

	args := []string{
		"record",
		"-e", "sched:sched_switch",
		"-g",
		"--call-graph", "dwarf",
		"-o", dataFile,
	}

	if opts.targetPID > 0 {
		args = append(args, "-p", fmt.Sprintf("%d", opts.targetPID))
	} else {
		args = append(args, "-a")
	}

	args = append(args, "--", "sleep", fmt.Sprintf("%d", opts.duration))

	cmd := exec.CommandContext(ctx, "perf", args...)
	cmd.Stderr = &bytes.Buffer{}
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("perf record sched:sched_switch failed: %w", err)
	}

	scriptCmd := exec.CommandContext(ctx, "perf", "script", "-i", dataFile)
	scriptOutput, err := scriptCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("perf script failed: %w", err)
	}

	folded := perfScriptToFolded(scriptOutput)
	return folded, nil
}

// collectOffCPUBpftrace uses bpftrace to trace sched_switch with stack
// aggregation.  The one-liner aggregates blocked stacks with time deltas.
func collectOffCPUBpftrace(ctx context.Context, opts *profileOpts) ([]byte, error) {
	bpftracePath, err := exec.LookPath("bpftrace")
	if err != nil {
		return nil, fmt.Errorf("bpftrace not found: %w", err)
	}

	// bpftrace one-liner: aggregate off-CPU time by kernel stack.
	// Prints folded format: kstack_name;... time_us
	script := `tracepoint:sched:sched_switch { @start[tid] = nsecs; } tracepoint:sched:sched_switch /@start[tid]/ { @us[kstack] = sum((nsecs - @start[tid]) / 1000); delete(@start[tid]); } END { clear(@start); }`

	var targetFilter string
	if opts.targetPID > 0 {
		targetFilter = fmt.Sprintf("-p %d", opts.targetPID)
	}

	args := []string{"-e", script}
	if targetFilter != "" {
		args = append([]string{targetFilter}, args...)
	}

	// Run for the configured duration by wrapping in timeout
	timeoutCmd := exec.CommandContext(ctx, "timeout", fmt.Sprintf("%d", opts.duration), bpftracePath)
	timeoutCmd.Args = append(timeoutCmd.Args, args...)

	output, err := timeoutCmd.CombinedOutput()
	if err != nil {
		// timeout exits with 124 which is expected
		if !strings.Contains(err.Error(), "exit status 124") {
			return nil, fmt.Errorf("bpftrace failed: %w", err)
		}
	}

	folded := parseBpftraceOutput(output)
	return folded, nil
}

// parseBpftraceOutput converts bpftrace aggregation output to folded format.
// bpftrace prints maps as:
//
//	@us[
//	    func1+offset
//	    func2+offset
//	]: value
func parseBpftraceOutput(output []byte) []byte {
	var buf bytes.Buffer
	lines := strings.Split(string(output), "\n")

	var currentStack []string
	inStack := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "@us[") || strings.HasPrefix(trimmed, "@[") {
			inStack = true
			currentStack = nil
			continue
		}

		if inStack && strings.HasPrefix(trimmed, "]:") {
			// Extract count
			countStr := strings.TrimSpace(strings.TrimPrefix(trimmed, "]:"))
			if len(currentStack) > 0 && countStr != "" {
				// bpftrace outputs callee-first; reverse for folded format
				reversed := make([]string, len(currentStack))
				for i, f := range currentStack {
					reversed[len(currentStack)-1-i] = f
				}
				fmt.Fprintf(&buf, "%s %s\n", strings.Join(reversed, ";"), countStr)
			}
			inStack = false
			currentStack = nil
			continue
		}

		if inStack && trimmed != "" {
			frame := parseFrameName(trimmed)
			if frame != "" {
				currentStack = append(currentStack, frame)
			}
		}
	}

	return buf.Bytes()
}
