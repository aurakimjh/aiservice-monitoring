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

// collectOnCPU runs on-CPU profiling using the `perf record` + `perf script`
// pipeline and converts the output to Brendan Gregg folded-stack format.
//
// Steps:
//  1. Build perf record command with configured frequency, call-graph mode, and target.
//  2. Execute perf record → writes a perf.data file.
//  3. Run perf script to convert the binary perf.data to human-readable output.
//  4. Parse the perf script output into folded stack format.
//  5. Clean up temporary files.
func collectOnCPU(ctx context.Context, opts *profileOpts) ([]byte, error) {
	id := uuid.New().String()[:8]
	dataFile := fmt.Sprintf("/tmp/aitop-perf-%s.data", id)
	defer os.Remove(dataFile)

	// Build perf record command
	args := []string{
		"record",
		"-F", fmt.Sprintf("%d", opts.frequency),
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

	// Run perf record
	cmd := exec.CommandContext(ctx, "perf", args...)
	cmd.Stderr = &bytes.Buffer{}
	if err := cmd.Run(); err != nil {
		stderr := cmd.Stderr.(*bytes.Buffer).String()
		return nil, fmt.Errorf("perf record failed: %w (stderr: %s)", err, stderr)
	}

	// Run perf script
	scriptCmd := exec.CommandContext(ctx, "perf", "script", "-i", dataFile)
	scriptOutput, err := scriptCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("perf script failed: %w", err)
	}

	// Convert to folded format
	folded := perfScriptToFolded(scriptOutput)
	if len(folded) == 0 {
		return nil, fmt.Errorf("no stack samples captured")
	}

	return folded, nil
}

// perfScriptToFolded converts raw `perf script` output to Brendan Gregg's
// folded stack format.
//
// perf script output format:
//
//	process-name PID CPU timestamp: event:
//	    address function+offset (library)
//	    address function+offset (library)
//	    ...
//	                              ← blank line separating traces
//
// Output (folded format):
//
//	frame1;frame2;frame3 count
func perfScriptToFolded(output []byte) []byte {
	counts := make(map[string]int64)
	lines := strings.Split(string(output), "\n")

	var currentStack []string
	inStack := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if trimmed == "" {
			// End of a stack trace
			if len(currentStack) > 0 {
				// Reverse stack (perf outputs callee-first, we want caller-first)
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

		// Stack frame lines are indented (start with whitespace in original)
		if strings.HasPrefix(line, "\t") || strings.HasPrefix(line, " ") {
			inStack = true
			frame := parseFrameName(trimmed)
			if frame != "" {
				currentStack = append(currentStack, frame)
			}
		} else if !inStack {
			// Header line (process name, PID, etc.) — skip
			continue
		}
	}

	// Handle last stack if file doesn't end with blank line
	if len(currentStack) > 0 {
		reversed := make([]string, len(currentStack))
		for i, frame := range currentStack {
			reversed[len(currentStack)-1-i] = frame
		}
		key := strings.Join(reversed, ";")
		counts[key]++
	}

	// Build folded output
	var buf bytes.Buffer
	for stack, count := range counts {
		fmt.Fprintf(&buf, "%s %d\n", stack, count)
	}

	return buf.Bytes()
}

// parseFrameName extracts the function name from a perf script stack frame line.
// Input example: "ffffffff81234567 do_syscall_64+0x5b (/lib/modules/...)"
// Output: "do_syscall_64"
func parseFrameName(line string) string {
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return "[unknown]"
	}

	// Second field is typically the function name
	funcField := parts[1]

	// Remove offset (e.g., "+0x5b")
	if idx := strings.Index(funcField, "+"); idx > 0 {
		funcField = funcField[:idx]
	}

	// Clean up common kernel/unknown markers
	if funcField == "[unknown]" || funcField == "0x0" {
		return "[unknown]"
	}

	return funcField
}
