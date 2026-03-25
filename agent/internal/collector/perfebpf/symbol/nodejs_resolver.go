package symbol

import (
	"fmt"
	"os"
	"strings"
	"syscall"
)

// NodeJSResolver resolves V8 JIT-compiled JavaScript function addresses.
//
// Node.js generates /tmp/perf-{pid}.map when started with --perf-basic-prof
// or --perf-prof flags.  For running processes without these flags, sending
// SIGUSR2 triggers map generation on Node.js 12+.
type NodeJSResolver struct{}

func (r *NodeJSResolver) Language() string { return "nodejs" }

// Available returns true if the process is a Node.js process with a perf map
// file available or generatable.
func (r *NodeJSResolver) Available(pid int) bool {
	// Check for existing V8 perf map
	mapFile := perfMapPath(pid)
	if _, err := os.Stat(mapFile); err == nil {
		return true
	}

	// Check if the process is Node.js
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return false
	}
	cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")
	return strings.Contains(cmd, "node") || strings.Contains(cmd, "nodejs")
}

// GenerateSymbolMap reads or triggers generation of the V8 JIT symbol map.
//
// If --perf-basic-prof was used, /tmp/perf-{pid}.map already exists.
// Otherwise, SIGUSR2 is sent to the Node.js process to trigger map
// generation (supported in Node.js 12+).
func (r *NodeJSResolver) GenerateSymbolMap(pid int) (string, error) {
	mapFile := perfMapPath(pid)

	// Check if map already exists
	if info, err := os.Stat(mapFile); err == nil && info.Size() > 0 {
		return mapFile, nil
	}

	// Check if --perf-basic-prof was used
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return "", fmt.Errorf("cannot read cmdline for pid %d: %w", pid, err)
	}
	cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")

	if strings.Contains(cmd, "--perf-basic-prof") || strings.Contains(cmd, "--perf-prof") {
		// Map should exist or will be created shortly
		if _, err := os.Stat(mapFile); err == nil {
			return mapFile, nil
		}
		return "", fmt.Errorf("--perf-basic-prof set but map file not found at %s", mapFile)
	}

	// Send SIGUSR2 to trigger map generation (Node.js 12+)
	proc, err := os.FindProcess(pid)
	if err != nil {
		return "", fmt.Errorf("cannot find process %d: %w", pid, err)
	}

	if err := proc.Signal(syscall.Signal(0x0c)); err != nil { // SIGUSR2 = 12
		return "", fmt.Errorf("failed to send SIGUSR2 to pid %d: %w", pid, err)
	}

	// Check if map was created
	if _, err := os.Stat(mapFile); err != nil {
		return "", fmt.Errorf("SIGUSR2 sent but map file not created at %s", mapFile)
	}

	return mapFile, nil
}

// Cleanup removes the generated symbol map for the given PID.
func (r *NodeJSResolver) Cleanup(pid int) {
	// Don't remove Node.js perf maps — they may be continuously updated
	// by the --perf-basic-prof flag.
}
