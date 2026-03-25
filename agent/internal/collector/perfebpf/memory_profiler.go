package perfebpf

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// collectMemory runs memory allocation profiling using perf probes or bpftrace
// uprobe on libc malloc.  The returned folded stacks use bytes allocated as
// the weight, producing memory flamegraphs.
//
// Preferred: perf record -e syscalls:sys_enter_mmap with call-graph.
// Fallback 1: bpftrace uprobe:libc:malloc.
// Fallback 2: /proc/{pid}/smaps parsing for per-mapping memory info.
func collectMemory(ctx context.Context, opts *profileOpts) ([]byte, error) {
	// Try perf with mmap tracepoint
	data, err := collectMemoryPerf(ctx, opts)
	if err == nil && len(data) > 0 {
		return data, nil
	}

	// Fallback: bpftrace malloc uprobe
	data, err = collectMemoryBpftrace(ctx, opts)
	if err == nil && len(data) > 0 {
		return data, nil
	}

	// Final fallback: smaps-based summary (only for specific PID)
	if opts.targetPID > 0 {
		data, err = collectMemorySmaps(opts.targetPID)
		if err == nil && len(data) > 0 {
			return data, nil
		}
	}

	return nil, fmt.Errorf("memory profiling unavailable: all methods failed")
}

// collectMemoryPerf uses perf record with mmap syscall tracepoint.
func collectMemoryPerf(ctx context.Context, opts *profileOpts) ([]byte, error) {
	id := uuid.New().String()[:8]
	dataFile := fmt.Sprintf("/tmp/aitop-mem-%s.data", id)
	defer os.Remove(dataFile)

	args := []string{
		"record",
		"-e", "syscalls:sys_enter_mmap",
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
		return nil, fmt.Errorf("perf record mmap tracepoint failed: %w", err)
	}

	scriptCmd := exec.CommandContext(ctx, "perf", "script", "-i", dataFile)
	scriptOutput, err := scriptCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("perf script failed: %w", err)
	}

	folded := perfScriptToFolded(scriptOutput)
	return folded, nil
}

// collectMemoryBpftrace uses bpftrace uprobe on libc malloc to capture
// allocation stacks with byte counts.
func collectMemoryBpftrace(ctx context.Context, opts *profileOpts) ([]byte, error) {
	bpftracePath, err := exec.LookPath("bpftrace")
	if err != nil {
		return nil, fmt.Errorf("bpftrace not found: %w", err)
	}

	// Trace malloc and aggregate by ustack with allocation size
	script := `uprobe:/lib/x86_64-linux-gnu/libc.so.6:malloc { @bytes[ustack] = sum(arg0); }`

	args := []string{"-e", script}
	if opts.targetPID > 0 {
		args = append([]string{"-p", fmt.Sprintf("%d", opts.targetPID)}, args...)
	}

	timeoutCmd := exec.CommandContext(ctx, "timeout", fmt.Sprintf("%d", opts.duration), bpftracePath)
	timeoutCmd.Args = append(timeoutCmd.Args, args...)

	output, err := timeoutCmd.CombinedOutput()
	if err != nil {
		if !strings.Contains(err.Error(), "exit status 124") {
			return nil, fmt.Errorf("bpftrace malloc failed: %w", err)
		}
	}

	folded := parseBpftraceOutput(output)
	return folded, nil
}

// collectMemorySmaps parses /proc/{pid}/smaps to produce a basic memory
// breakdown in folded-stack format.  This is the final fallback when
// perf/bpftrace are unavailable.
func collectMemorySmaps(pid int) ([]byte, error) {
	smapsPath := fmt.Sprintf("/proc/%d/smaps", pid)
	data, err := os.ReadFile(smapsPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %w", smapsPath, err)
	}

	// Parse smaps: extract mapping names and their RSS
	type mapping struct {
		name string
		rss  int64 // in KB
	}

	var mappings []mapping
	lines := strings.Split(string(data), "\n")

	var currentName string
	for _, line := range lines {
		// Header line: address perms offset dev inode pathname
		if len(line) > 0 && !strings.HasPrefix(line, " ") && !strings.Contains(line, ":") {
			parts := strings.Fields(line)
			if len(parts) >= 6 {
				currentName = parts[5]
			} else {
				currentName = "[anon]"
			}
		}

		// RSS line: "Rss:               1234 kB"
		if strings.HasPrefix(strings.TrimSpace(line), "Rss:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, err := strconv.ParseInt(fields[1], 10, 64)
				if err == nil && kb > 0 {
					name := currentName
					if name == "" {
						name = "[anon]"
					}
					mappings = append(mappings, mapping{name: name, rss: kb})
				}
			}
		}
	}

	// Aggregate by name
	agg := make(map[string]int64)
	for _, m := range mappings {
		agg[m.name] += m.rss
	}

	// Convert to folded format with bytes (KB → bytes) as weight
	var buf bytes.Buffer
	processName := fmt.Sprintf("pid:%d", pid)
	for name, kb := range agg {
		// Clean up mapping name for stack display
		cleanName := strings.TrimSpace(name)
		if cleanName == "" {
			cleanName = "[anon]"
		}
		bytesVal := kb * 1024
		fmt.Fprintf(&buf, "%s;%s %d\n", processName, cleanName, bytesVal)
	}

	return buf.Bytes(), nil
}
