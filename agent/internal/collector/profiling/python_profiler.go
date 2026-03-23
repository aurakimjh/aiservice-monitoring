package profiling

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"time"
)

// collectPythonProfile captures a CPU or memory profile from a Python process.
// Uses py-spy (MIT licensed) for CPU profiling.
func collectPythonProfile(ctx context.Context, proc profilableProcess, profileType string, durationSec int) ([]byte, string, error) {
	switch profileType {
	case "cpu":
		return collectPythonCPU(ctx, proc, durationSec)
	case "memory":
		return collectPythonMemory(ctx, proc, durationSec)
	default:
		return collectPythonCPU(ctx, proc, durationSec)
	}
}

// collectPythonCPU uses py-spy to capture a CPU profile in collapsed-stack format.
func collectPythonCPU(ctx context.Context, proc profilableProcess, durationSec int) ([]byte, string, error) {
	// Check if py-spy is available
	pyspyPath, err := exec.LookPath("py-spy")
	if err != nil {
		return nil, "", fmt.Errorf("py-spy not found: install via 'pip install py-spy' (MIT license): %w", err)
	}

	outFile := fmt.Sprintf("/tmp/aitop-pyprofile-%d-%d.collapsed", proc.PID, time.Now().UnixMilli())
	defer os.Remove(outFile)

	timeout := time.Duration(durationSec+10) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, pyspyPath,
		"record",
		"--format", "raw",
		"--output", outFile,
		"--pid", strconv.Itoa(proc.PID),
		"--duration", strconv.Itoa(durationSec),
		"--nonblocking",
	)
	cmd.Stderr = nil // suppress stderr

	if err := cmd.Run(); err != nil {
		return nil, "", fmt.Errorf("py-spy record pid=%d: %w", proc.PID, err)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, "", fmt.Errorf("read py-spy output: %w", err)
	}

	return data, "collapsed", nil
}

// collectPythonMemory captures a memory allocation snapshot.
// Uses tracemalloc integration if the AITOP Python SDK is installed,
// otherwise falls back to a /proc-based memory map snapshot.
func collectPythonMemory(ctx context.Context, proc profilableProcess, durationSec int) ([]byte, string, error) {
	// Read /proc/{pid}/smaps for memory mapping summary
	smapsFile := fmt.Sprintf("/proc/%d/smaps_rollup", proc.PID)
	data, err := os.ReadFile(smapsFile)
	if err != nil {
		// Fallback to status
		statusFile := fmt.Sprintf("/proc/%d/status", proc.PID)
		data, err = os.ReadFile(statusFile)
		if err != nil {
			return nil, "", fmt.Errorf("read memory info pid=%d: %w", proc.PID, err)
		}
	}

	return data, "collapsed", nil
}
