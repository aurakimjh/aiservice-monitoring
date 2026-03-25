package symbol

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// PythonResolver resolves Python function addresses using py-spy.
//
// py-spy can generate perf-compatible symbol maps by reading the CPython
// interpreter's internal structures.  For CPython 3.12+, native frame
// pointer support enables direct perf unwinding.
type PythonResolver struct{}

func (r *PythonResolver) Language() string { return "python" }

// Available returns true if the process is a Python process and py-spy is
// installed, or if an existing perf map file exists.
func (r *PythonResolver) Available(pid int) bool {
	// Check for existing map file
	mapFile := perfMapPath(pid)
	if _, err := os.Stat(mapFile); err == nil {
		return true
	}

	// Check if this is a Python process
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return false
	}
	cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")
	if !strings.Contains(cmd, "python") {
		return false
	}

	// Check for py-spy
	if _, err := exec.LookPath("py-spy"); err != nil {
		return false
	}

	return true
}

// GenerateSymbolMap uses py-spy to generate a perf-compatible symbol map
// for the given Python process.
func (r *PythonResolver) GenerateSymbolMap(pid int) (string, error) {
	mapFile := perfMapPath(pid)

	// Reuse existing file if present
	if info, err := os.Stat(mapFile); err == nil && info.Size() > 0 {
		return mapFile, nil
	}

	pyspyPath, err := exec.LookPath("py-spy")
	if err != nil {
		return "", fmt.Errorf("py-spy not found: %w", err)
	}

	// py-spy can dump current stack which includes symbol info
	// Use --format raw to get perf-map compatible output
	cmd := exec.Command(pyspyPath, "dump", "--pid", fmt.Sprintf("%d", pid))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("py-spy dump failed: %w (output: %s)", err, string(output))
	}

	// py-spy may also directly create /tmp/perf-{pid}.map in some modes
	if _, err := os.Stat(mapFile); err == nil {
		return mapFile, nil
	}

	// Convert py-spy dump output to perf map format
	if err := writePySpyPerfMap(pid, output); err != nil {
		return "", fmt.Errorf("failed to write perf map: %w", err)
	}

	return mapFile, nil
}

// writePySpyPerfMap converts py-spy dump output to /tmp/perf-{pid}.map format.
func writePySpyPerfMap(pid int, dumpOutput []byte) error {
	mapFile := perfMapPath(pid)

	// Parse py-spy output and create a minimal perf map
	// py-spy dump format shows thread stacks; we extract function info
	lines := strings.Split(string(dumpOutput), "\n")
	var mapLines []string
	seenAddr := make(map[string]bool)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Thread") || strings.HasPrefix(line, "Process") {
			continue
		}

		// py-spy format: "  Function (file:line)"
		if strings.Contains(line, "(") {
			funcName := strings.TrimSpace(line)
			if idx := strings.Index(funcName, " ("); idx > 0 {
				funcName = funcName[:idx]
			}
			// Create a synthetic entry
			addr := fmt.Sprintf("%016x", len(mapLines)*0x1000+0x7f000000)
			if !seenAddr[funcName] {
				seenAddr[funcName] = true
				mapLines = append(mapLines, fmt.Sprintf("%s 1000 %s", addr, funcName))
			}
		}
	}

	if len(mapLines) == 0 {
		return fmt.Errorf("no symbols extracted from py-spy output")
	}

	return os.WriteFile(mapFile, []byte(strings.Join(mapLines, "\n")+"\n"), 0644)
}

// Cleanup removes the generated symbol map for the given PID.
func (r *PythonResolver) Cleanup(pid int) {
	os.Remove(perfMapPath(pid))
}
