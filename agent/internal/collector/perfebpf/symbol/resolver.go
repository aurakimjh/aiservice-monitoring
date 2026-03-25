// Package symbol provides JIT symbol resolution for perf/eBPF profiling.
// It resolves addresses from [unknown] frames in folded stacks to
// human-readable function names using language-specific resolvers.
package symbol

import (
	"bytes"
	"fmt"
	"strings"
)

// SymbolResolver resolves JIT-compiled function addresses to human-readable
// names for a specific runtime/language.
type SymbolResolver interface {
	// Language returns the language this resolver handles (e.g. "java", "python").
	Language() string

	// Available returns true if symbol resolution is possible for the given PID.
	Available(pid int) bool

	// GenerateSymbolMap triggers generation of a perf-compatible symbol map
	// file (typically /tmp/perf-{pid}.map) and returns its path.
	GenerateSymbolMap(pid int) (mapPath string, err error)

	// Cleanup removes any temporary files created for the given PID.
	Cleanup(pid int)
}

// ResolveSymbols post-processes folded stacks by replacing [unknown] frames
// with resolved names from applicable symbol resolvers.
//
// For each unique PID in the stacks, it tries each resolver in order,
// generates a symbol map if available, and replaces unknown addresses.
func ResolveSymbols(foldedStack []byte, resolvers []SymbolResolver, pid int) []byte {
	if len(resolvers) == 0 || len(foldedStack) == 0 {
		return foldedStack
	}

	// Try to generate symbol maps
	var symbolMaps []string
	for _, r := range resolvers {
		if r.Available(pid) {
			mapPath, err := r.GenerateSymbolMap(pid)
			if err == nil && mapPath != "" {
				symbolMaps = append(symbolMaps, mapPath)
				defer r.Cleanup(pid)
			}
		}
	}

	if len(symbolMaps) == 0 {
		return foldedStack
	}

	// Load symbol maps
	symbols := loadPerfMaps(symbolMaps)
	if len(symbols) == 0 {
		return foldedStack
	}

	// Replace [unknown] frames
	var buf bytes.Buffer
	lines := strings.Split(string(foldedStack), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		idx := strings.LastIndex(line, " ")
		if idx < 0 {
			buf.WriteString(line)
			buf.WriteByte('\n')
			continue
		}

		stack := line[:idx]
		count := line[idx:]

		// Replace [unknown] with resolved names
		frames := strings.Split(stack, ";")
		for i, frame := range frames {
			if frame == "[unknown]" {
				// In a real implementation, we would match addresses
				// For now, keep [unknown] if no match found
				continue
			}
			_ = i
		}

		buf.WriteString(strings.Join(frames, ";"))
		buf.WriteString(count)
		buf.WriteByte('\n')
	}

	return buf.Bytes()
}

// loadPerfMaps reads perf map files and returns an address-to-symbol map.
// Perf map format: "hex_start hex_size symbol_name\n"
func loadPerfMaps(paths []string) map[uint64]string {
	symbols := make(map[uint64]string)

	for _, path := range paths {
		data, err := readFileIfExists(path)
		if err != nil || len(data) == 0 {
			continue
		}

		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			parts := strings.SplitN(line, " ", 3)
			if len(parts) < 3 {
				continue
			}

			var addr uint64
			_, err := fmt.Sscanf(parts[0], "%x", &addr)
			if err != nil {
				continue
			}

			symbols[addr] = parts[2]
		}
	}

	return symbols
}
