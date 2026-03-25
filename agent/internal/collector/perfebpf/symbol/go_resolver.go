package symbol

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// GoResolver handles Go process symbol resolution.
//
// Go binaries include DWARF debug symbols by default, so perf can resolve
// Go function names natively without any special agent.  This resolver
// simply checks that the binary has debug info and reports availability.
//
// If the binary was built with -trimpath, symbol quality may be reduced
// (source file paths are stripped but function names remain).
type GoResolver struct{}

func (r *GoResolver) Language() string { return "go" }

// Available returns true for any Go process — DWARF symbols are generally
// available.
func (r *GoResolver) Available(pid int) bool {
	// Check if this is a Go process by looking at /proc/{pid}/exe
	exePath := fmt.Sprintf("/proc/%d/exe", pid)
	target, err := os.Readlink(exePath)
	if err != nil {
		return false
	}

	// Quick check: Go binaries contain "runtime.main" in their symbol table.
	// Use `nm` or `file` to detect.
	cmd := exec.Command("file", target)
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	outputStr := string(output)
	// Go binaries are typically "ELF ... Go ..." or "ELF ... not stripped"
	if strings.Contains(outputStr, "Go ") || strings.Contains(outputStr, "not stripped") {
		return true
	}

	// Additional check: look for Go-specific sections
	nmCmd := exec.Command("nm", target)
	nmOutput, err := nmCmd.Output()
	if err != nil {
		return false
	}

	return strings.Contains(string(nmOutput), "runtime.main")
}

// GenerateSymbolMap for Go is a no-op — DWARF symbols are embedded in the
// binary and perf resolves them directly.
func (r *GoResolver) GenerateSymbolMap(pid int) (string, error) {
	// No map generation needed for Go
	return "", nil
}

// Cleanup is a no-op for Go since no temporary files are created.
func (r *GoResolver) Cleanup(pid int) {}

// HasTrimpath checks whether the Go binary for the given PID was built with
// the -trimpath flag, which may reduce source path quality in stack traces
// (though function names remain intact).
func (r *GoResolver) HasTrimpath(pid int) bool {
	exePath := fmt.Sprintf("/proc/%d/exe", pid)
	target, err := os.Readlink(exePath)
	if err != nil {
		return false
	}

	cmd := exec.Command("go", "version", "-m", target)
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	return strings.Contains(string(output), "-trimpath")
}
