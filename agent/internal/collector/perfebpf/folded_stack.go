package perfebpf

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"strconv"
	"strings"
)

// MergeFoldedStacks merges multiple folded stack byte slices by summing
// sample counts for identical stack traces.
func MergeFoldedStacks(stacks ...[]byte) []byte {
	counts := make(map[string]int64)

	for _, stack := range stacks {
		lines := strings.Split(string(stack), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			idx := strings.LastIndex(line, " ")
			if idx < 0 {
				continue
			}
			key := line[:idx]
			countStr := strings.TrimSpace(line[idx+1:])
			n, err := strconv.ParseInt(countStr, 10, 64)
			if err != nil || n <= 0 {
				continue
			}
			counts[key] += n
		}
	}

	var buf bytes.Buffer
	for stack, count := range counts {
		fmt.Fprintf(&buf, "%s %d\n", stack, count)
	}
	return buf.Bytes()
}

// CompressFoldedStack compresses folded stack data with gzip.
func CompressFoldedStack(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write(data); err != nil {
		return nil, fmt.Errorf("gzip write: %w", err)
	}
	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("gzip close: %w", err)
	}
	return buf.Bytes(), nil
}

// DecompressFoldedStack decompresses gzip-compressed folded stack data.
func DecompressFoldedStack(data []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer r.Close()

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(r); err != nil {
		return nil, fmt.Errorf("gzip read: %w", err)
	}
	return buf.Bytes(), nil
}

// ValidateFoldedStack validates that data is properly formatted as folded stacks.
// Each non-empty, non-comment line must be: "stack_frames count"
// where stack_frames is semicolon-separated and count is a positive integer.
func ValidateFoldedStack(data []byte) error {
	if len(data) == 0 {
		return fmt.Errorf("empty folded stack data")
	}

	lines := strings.Split(string(data), "\n")
	validLines := 0

	for lineNum, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		idx := strings.LastIndex(line, " ")
		if idx < 0 {
			return fmt.Errorf("line %d: missing count separator (expected 'stack count')", lineNum+1)
		}

		stack := strings.TrimSpace(line[:idx])
		if stack == "" {
			return fmt.Errorf("line %d: empty stack", lineNum+1)
		}

		countStr := strings.TrimSpace(line[idx+1:])
		n, err := strconv.ParseInt(countStr, 10, 64)
		if err != nil {
			return fmt.Errorf("line %d: invalid count %q: %w", lineNum+1, countStr, err)
		}
		if n <= 0 {
			return fmt.Errorf("line %d: count must be positive, got %d", lineNum+1, n)
		}

		validLines++
	}

	if validLines == 0 {
		return fmt.Errorf("no valid folded stack lines found")
	}

	return nil
}

// FilterByPID filters folded stack data to keep only stacks that originate
// from the specified PID.  This assumes stacks may be prefixed with the
// process name (e.g., "java;main;..." or "pid:12345;...").
// If pid <= 0, the data is returned unchanged.
func FilterByPID(data []byte, pid int) []byte {
	if pid <= 0 {
		return data
	}

	pidPrefix := fmt.Sprintf("pid:%d;", pid)
	var buf bytes.Buffer
	lines := strings.Split(string(data), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, pidPrefix) {
			buf.WriteString(line)
			buf.WriteByte('\n')
		}
	}

	return buf.Bytes()
}
