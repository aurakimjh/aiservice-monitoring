package symbol

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// JavaResolver resolves JIT-compiled Java function addresses using
// perf-map-agent (JVM Attach API → /tmp/perf-{pid}.map).
//
// It integrates with the Phase 34 Runtime Attach module when available:
// the JVM Attach API agent generates a mapping of compiled method addresses
// to fully-qualified class/method names.
type JavaResolver struct{}

func (r *JavaResolver) Language() string { return "java" }

// Available returns true if the process is a Java process and perf-map-agent
// (or an existing map file) is accessible.
func (r *JavaResolver) Available(pid int) bool {
	// Check if existing map file exists
	mapFile := perfMapPath(pid)
	if _, err := os.Stat(mapFile); err == nil {
		return true
	}

	// Check if the process is a Java process
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return false
	}
	cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")
	if !strings.Contains(cmd, "java") {
		return false
	}

	// Check for perf-map-agent
	if _, err := exec.LookPath("perf-map-agent"); err != nil {
		// Also check the common alternative: create-java-perf-map.sh
		if _, err := exec.LookPath("create-java-perf-map.sh"); err != nil {
			return false
		}
	}

	return true
}

// GenerateSymbolMap triggers perf-map-agent to generate /tmp/perf-{pid}.map
// via the JVM Attach API.
func (r *JavaResolver) GenerateSymbolMap(pid int) (string, error) {
	mapFile := perfMapPath(pid)

	// If the map file already exists and is recent, reuse it
	if info, err := os.Stat(mapFile); err == nil {
		if info.Size() > 0 {
			return mapFile, nil
		}
	}

	// Try perf-map-agent
	agentPath, err := exec.LookPath("perf-map-agent")
	if err != nil {
		// Try the shell script variant
		agentPath, err = exec.LookPath("create-java-perf-map.sh")
		if err != nil {
			return "", fmt.Errorf("perf-map-agent not found")
		}
	}

	cmd := exec.Command(agentPath, fmt.Sprintf("%d", pid))
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("perf-map-agent failed: %w (output: %s)", err, string(output))
	}

	// Verify the map was created
	if _, err := os.Stat(mapFile); err != nil {
		return "", fmt.Errorf("map file not created at %s", mapFile)
	}

	return mapFile, nil
}

// Cleanup removes the generated symbol map for the given PID.
func (r *JavaResolver) Cleanup(pid int) {
	os.Remove(perfMapPath(pid))
}
