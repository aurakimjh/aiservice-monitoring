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

// ── .NET profiling types ────────────────────────────────────────────────────

// DotNetMetrics represents .NET runtime diagnostic counters obtained via
// the EventPipe diagnostic protocol (dotnet-counters / dotnet-trace).
type DotNetMetrics struct {
	GCCount           int64 `json:"gc_count"`
	GCTimeMs          int64 `json:"gc_time_ms"`
	Gen0Collections   int   `json:"gen0_collections"`
	Gen1Collections   int   `json:"gen1_collections"`
	Gen2Collections   int   `json:"gen2_collections"`
	HeapSizeBytes     int64 `json:"heap_size_bytes"`
	ThreadPoolQueue   int   `json:"thread_pool_queue"`
	ThreadPoolThreads int   `json:"thread_pool_threads"`
	ExceptionCount    int   `json:"exception_count"`
}

// EFCoreQueryProfile represents an Entity Framework Core query execution
// profile collected via EventPipe Microsoft.EntityFrameworkCore events.
type EFCoreQueryProfile struct {
	Query          string  `json:"query"`
	ExecutionCount int     `json:"execution_count"`
	TotalTimeMs    int64   `json:"total_time_ms"`
	AvgTimeMs      float64 `json:"avg_time_ms"`
}

// DotNetEFCoreResult is the collection of EF Core query profiles.
type DotNetEFCoreResult struct {
	TopN       int                  `json:"top_n"`
	TotalSQL   int                  `json:"total_sql"`
	Metrics    *DotNetMetrics       `json:"runtime_metrics,omitempty"`
	Profiles   []EFCoreQueryProfile `json:"profiles"`
}

// DotNetRuntimeResult wraps .NET runtime metrics.
type DotNetRuntimeResult struct {
	Metrics *DotNetMetrics `json:"metrics"`
}

// ── .NET batch profiling functions ──────────────────────────────────────────

// profileDotNetEFCore connects via EventPipe to capture EF Core query stats
// and GC metrics from a running .NET batch process.
//
// EventPipe providers:
//   - Microsoft.EntityFrameworkCore → query events
//   - System.Runtime → GC, ThreadPool, Exception counters
func profileDotNetEFCore(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	data, err := captureDotNetEFCore(ctx, exec.PID, cfg.Duration, cfg.TopN)
	return makeResult(exec, "sql", data, start, err)
}

func captureDotNetEFCore(ctx context.Context, pid int, durationSec int, topN int) (*DotNetEFCoreResult, error) {
	// Try dotnet-trace first
	tracePath, err := exec.LookPath("dotnet-trace")
	if err != nil {
		return nil, fmt.Errorf("dotnet-trace not found (install via: dotnet tool install -g dotnet-trace): %w", err)
	}

	outFile := fmt.Sprintf("/tmp/aitop-dotnet-%d-%d.nettrace", pid, time.Now().UnixMilli())
	defer os.Remove(outFile)

	timeout := time.Duration(durationSec+15) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Collect EventPipe trace with EF Core and System.Runtime providers
	cmd := exec.CommandContext(cmdCtx, tracePath,
		"collect",
		"--process-id", strconv.Itoa(pid),
		"--duration", fmt.Sprintf("00:00:%02d", durationSec),
		"--output", outFile,
		"--providers", "Microsoft.EntityFrameworkCore,System.Runtime",
	)
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("dotnet-trace collect pid=%d: %w", pid, err)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, fmt.Errorf("read dotnet-trace output: %w", err)
	}

	return parseDotNetTrace(data, topN)
}

// parseDotNetTrace parses nettrace format to extract EF Core queries and
// runtime metrics. Since nettrace is a binary format, we use a simplified
// parser that looks for known event patterns.
func parseDotNetTrace(data []byte, topN int) (*DotNetEFCoreResult, error) {
	// The nettrace binary format is complex; in production, this would use
	// Microsoft.Diagnostics.NETCore.Client or a Go port.
	// For the MVP, we extract what we can from string patterns in the trace.

	content := string(data)
	result := &DotNetEFCoreResult{
		TopN: topN,
		Metrics: &DotNetMetrics{},
	}

	// Extract query patterns from EF Core events embedded in the trace
	queryCounts := make(map[string]*EFCoreQueryProfile)
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		if strings.Contains(line, "CommandExecuting") || strings.Contains(line, "QueryExecuting") {
			// Heuristic: look for SQL-like patterns
			sqlStart := strings.Index(line, "SELECT")
			if sqlStart < 0 {
				sqlStart = strings.Index(line, "INSERT")
			}
			if sqlStart < 0 {
				sqlStart = strings.Index(line, "UPDATE")
			}
			if sqlStart < 0 {
				sqlStart = strings.Index(line, "DELETE")
			}
			if sqlStart >= 0 {
				sql := line[sqlStart:]
				if len(sql) > 200 {
					sql = sql[:200] + "..."
				}
				if q, ok := queryCounts[sql]; ok {
					q.ExecutionCount++
				} else {
					queryCounts[sql] = &EFCoreQueryProfile{
						Query:          sql,
						ExecutionCount: 1,
					}
				}
			}
		}

		// Extract GC counters
		if strings.Contains(line, "gc-count") || strings.Contains(line, "GCCount") {
			fields := strings.Fields(line)
			for _, f := range fields {
				if v, err := strconv.ParseInt(f, 10, 64); err == nil && v > 0 {
					result.Metrics.GCCount = v
					break
				}
			}
		}
	}

	var profiles []EFCoreQueryProfile
	for _, q := range queryCounts {
		profiles = append(profiles, *q)
	}

	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].ExecutionCount > profiles[j].ExecutionCount
	})

	if topN > 0 && len(profiles) > topN {
		profiles = profiles[:topN]
	}

	result.Profiles = profiles
	result.TotalSQL = len(queryCounts)
	return result, nil
}

// profileDotNetRuntime collects .NET runtime counters (GC, ThreadPool,
// Exception) via dotnet-counters.
func profileDotNetRuntime(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	data, err := captureDotNetCounters(ctx, exec.PID, cfg.Duration)
	return makeResult(exec, "gc", data, start, err)
}

func captureDotNetCounters(ctx context.Context, pid int, durationSec int) (*DotNetRuntimeResult, error) {
	counterPath, err := exec.LookPath("dotnet-counters")
	if err != nil {
		return nil, fmt.Errorf("dotnet-counters not found (install via: dotnet tool install -g dotnet-counters): %w", err)
	}

	timeout := time.Duration(durationSec+10) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, counterPath,
		"collect",
		"--process-id", strconv.Itoa(pid),
		"--duration", fmt.Sprintf("00:00:%02d", durationSec),
		"--format", "csv",
		"--counters", "System.Runtime",
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("dotnet-counters collect pid=%d: %w", pid, err)
	}

	metrics := parseDotNetCountersCSV(string(output))
	return &DotNetRuntimeResult{Metrics: metrics}, nil
}

// parseDotNetCountersCSV parses dotnet-counters CSV output.
func parseDotNetCountersCSV(csv string) *DotNetMetrics {
	m := &DotNetMetrics{}
	lines := strings.Split(csv, "\n")

	for _, line := range lines {
		fields := strings.Split(line, ",")
		if len(fields) < 4 {
			continue
		}

		counterName := strings.TrimSpace(fields[1])
		valueStr := strings.TrimSpace(fields[3])
		value, err := strconv.ParseFloat(valueStr, 64)
		if err != nil {
			continue
		}

		switch counterName {
		case "gc-heap-size":
			m.HeapSizeBytes = int64(value * 1024 * 1024)
		case "gen-0-gc-count":
			m.Gen0Collections = int(value)
		case "gen-1-gc-count":
			m.Gen1Collections = int(value)
		case "gen-2-gc-count":
			m.Gen2Collections = int(value)
		case "threadpool-queue-length":
			m.ThreadPoolQueue = int(value)
		case "threadpool-thread-count":
			m.ThreadPoolThreads = int(value)
		case "exception-count":
			m.ExceptionCount = int(value)
		case "time-in-gc":
			m.GCTimeMs = int64(value)
		}
	}

	m.GCCount = int64(m.Gen0Collections + m.Gen1Collections + m.Gen2Collections)
	return m
}
