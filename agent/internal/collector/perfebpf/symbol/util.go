package symbol

import (
	"fmt"
	"os"
	"strings"
)

// readFileIfExists reads a file, returning empty bytes and nil error if it
// doesn't exist.
func readFileIfExists(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	return data, err
}

// perfMapPath returns the conventional perf map path for a PID.
func perfMapPath(pid int) string {
	return fmt.Sprintf("/tmp/perf-%d.map", pid)
}

// detectProcessRuntime reads /proc/{pid}/cmdline and maps to detect the
// runtime language.
func detectProcessRuntime(pid int) string {
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return ""
	}
	cmd := string(cmdline)

	// Replace null bytes with spaces
	cmd = strings.ReplaceAll(cmd, "\x00", " ")
	cmd = strings.TrimSpace(cmd)

	switch {
	case strings.Contains(cmd, "java") || strings.Contains(cmd, "jvm"):
		return "java"
	case strings.Contains(cmd, "python") || strings.Contains(cmd, "py-spy"):
		return "python"
	case strings.Contains(cmd, "node") || strings.Contains(cmd, "nodejs"):
		return "nodejs"
	case strings.Contains(cmd, "dotnet") || strings.Contains(cmd, "CoreCLR"):
		return "dotnet"
	default:
		// Check if the binary is a Go binary (has runtime.go entries in ELF)
		exePath := fmt.Sprintf("/proc/%d/exe", pid)
		target, err := os.Readlink(exePath)
		if err == nil && target != "" {
			// Go binaries contain DWARF by default
			return "go"
		}
		return ""
	}
}
