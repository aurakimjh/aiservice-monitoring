package profiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"


)

// ── Python function profiling types ─────────────────────────────────────────

// PythonFunctionProfile represents a single function's profiling aggregation
// from py-spy sampling output.
type PythonFunctionProfile struct {
	Function     string  `json:"function"`      // module.function
	FileLine     string  `json:"file_line"`      // file.py:123
	SelfPercent  float64 `json:"self_percent"`
	TotalPercent float64 `json:"total_percent"`
	SampleCount  int     `json:"sample_count"`
}

// PythonProfileResult is the collection of Python function profiles.
type PythonProfileResult struct {
	TopN          int                     `json:"top_n"`
	TotalSamples  int64                   `json:"total_samples"`
	TotalFuncs    int                     `json:"total_functions"`
	DurationSec   int                     `json:"duration_sec"`
	Profiles      []PythonFunctionProfile `json:"profiles"`
	FoldedStack   []byte                  `json:"folded_stack,omitempty"` // raw folded data for flamegraph
}

// ── Python batch profiling functions ────────────────────────────────────────

// profilePythonFunctions uses py-spy to sample a running Python batch process
// and extracts top functions by self-time.
func profilePythonFunctions(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	data, err := capturePythonFunctionProfile(ctx, exec.PID, cfg.Duration, cfg.TopN)
	return makeResult(exec, "method", data, start, err)
}

func capturePythonFunctionProfile(ctx context.Context, pid int, durationSec int, topN int) (*PythonProfileResult, error) {
	pyspyPath, err := exec.LookPath("py-spy")
	if err != nil {
		return nil, fmt.Errorf("py-spy not found: install via 'pip install py-spy' (MIT license): %w", err)
	}

	outFile := fmt.Sprintf("/tmp/aitop-batchpy-%d-%d.folded", pid, time.Now().UnixMilli())
	defer os.Remove(outFile)

	timeout := time.Duration(durationSec+10) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// py-spy record in folded format for easy aggregation
	cmd := exec.CommandContext(cmdCtx, pyspyPath,
		"record",
		"--format", "raw",
		"--output", outFile,
		"--pid", strconv.Itoa(pid),
		"--duration", strconv.Itoa(durationSec),
		"--nonblocking",
	)
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("py-spy record pid=%d: %w", pid, err)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, fmt.Errorf("read py-spy output: %w", err)
	}

	return parsePythonProfile(data, durationSec, topN), nil
}

// parsePythonProfile parses folded stack output from py-spy into function
// profiles sorted by self-time percentage.
func parsePythonProfile(data []byte, durationSec int, topN int) *PythonProfileResult {
	type funcStats struct {
		function    string
		fileLine    string
		selfSamples int64
		totalSamples int64
	}

	funcMap := make(map[string]*funcStats)
	var totalSamples int64

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		idx := strings.LastIndex(line, " ")
		if idx < 0 {
			continue
		}

		stack := line[:idx]
		countStr := strings.TrimSpace(line[idx+1:])
		count, err := strconv.ParseInt(countStr, 10, 64)
		if err != nil || count <= 0 {
			continue
		}

		totalSamples += count

		frames := strings.Split(stack, ";")
		if len(frames) == 0 {
			continue
		}

		// Self time: leaf frame
		leaf := strings.TrimSpace(frames[len(frames)-1])
		funcName, fileLine := parsePythonFrame(leaf)
		key := leaf

		if fs, ok := funcMap[key]; ok {
			fs.selfSamples += count
		} else {
			funcMap[key] = &funcStats{
				function:    funcName,
				fileLine:    fileLine,
				selfSamples: count,
			}
		}

		// Total time: all frames in the stack
		seen := make(map[string]bool)
		for _, frame := range frames {
			frame = strings.TrimSpace(frame)
			if frame == "" || seen[frame] {
				continue
			}
			seen[frame] = true

			fn, fl := parsePythonFrame(frame)
			if fs, ok := funcMap[frame]; ok {
				fs.totalSamples += count
			} else {
				funcMap[frame] = &funcStats{
					function:     fn,
					fileLine:     fl,
					totalSamples: count,
				}
			}
		}
	}

	var profiles []PythonFunctionProfile
	for _, fs := range funcMap {
		selfPct := 0.0
		totalPct := 0.0
		if totalSamples > 0 {
			selfPct = float64(fs.selfSamples) / float64(totalSamples) * 100.0
			totalPct = float64(fs.totalSamples) / float64(totalSamples) * 100.0
		}
		profiles = append(profiles, PythonFunctionProfile{
			Function:     fs.function,
			FileLine:     fs.fileLine,
			SelfPercent:  selfPct,
			TotalPercent: totalPct,
			SampleCount:  int(fs.selfSamples),
		})
	}

	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].SelfPercent > profiles[j].SelfPercent
	})

	if topN > 0 && len(profiles) > topN {
		profiles = profiles[:topN]
	}

	return &PythonProfileResult{
		TopN:         topN,
		TotalSamples: totalSamples,
		TotalFuncs:   len(funcMap),
		DurationSec:  durationSec,
		Profiles:     profiles,
		FoldedStack:  data,
	}
}

// parsePythonFrame extracts function name and file:line from a Python frame.
// Example input: "module.function (file.py:123)" → ("module.function", "file.py:123")
func parsePythonFrame(frame string) (string, string) {
	frame = strings.TrimSpace(frame)

	// Check for "(file:line)" suffix
	if idx := strings.LastIndex(frame, "("); idx > 0 {
		funcName := strings.TrimSpace(frame[:idx])
		filePart := strings.TrimSuffix(strings.TrimSpace(frame[idx+1:]), ")")
		return funcName, filePart
	}

	// No file info — return the frame as function name
	return frame, ""
}

// profilePythonStack captures a full stack sample (without aggregation)
// for immediate visibility into what a Python batch is doing right now.
func profilePythonStack(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	data, err := capturePythonStackDump(ctx, exec.PID)
	return makeResult(exec, "stack", data, start, err)
}

func capturePythonStackDump(ctx context.Context, pid int) (interface{}, error) {
	pyspyPath, err := exec.LookPath("py-spy")
	if err != nil {
		return nil, fmt.Errorf("py-spy not found: %w", err)
	}

	cmdCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// py-spy dump for instant thread snapshot
	cmd := exec.CommandContext(cmdCtx, pyspyPath,
		"dump",
		"--pid", strconv.Itoa(pid),
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("py-spy dump pid=%d: %w", pid, err)
	}

	return map[string]interface{}{
		"pid":   pid,
		"dump":  string(output),
		"type":  "python_thread_dump",
	}, nil
}
