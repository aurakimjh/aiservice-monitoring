// Package profiler provides batch-targeted runtime profiling by integrating
// Phase 34 (Runtime Attach) and Phase 35 (perf/eBPF) profilers into the
// Phase 36 batch monitoring pipeline.
//
// The orchestrator selects profiling strategies based on the detected batch
// language (Java, Python, Go, .NET) and coordinates parallel collection of
// SQL, method, stack, and flamegraph profiles.
package profiler

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// BatchTarget represents the minimum information needed to profile a batch
// process. This is a standalone type to avoid import cycles with the parent
// batch package.
type BatchTarget struct {
	ExecutionID string
	PID         int
	Language    string // java, python, go, dotnet
	Command     string
}

// BatchProfileResult holds the output of a single profiling operation for a
// batch execution.
type BatchProfileResult struct {
	ExecutionID string      `json:"execution_id"`
	PID         int         `json:"pid"`
	Language    string      `json:"language"`
	ProfileType string      `json:"profile_type"` // sql, method, stack, cpu, offcpu, memory, gc, flamegraph
	Data        interface{} `json:"data"`
	DurationMs  int64       `json:"duration_ms"`
	CapturedAt  time.Time   `json:"captured_at"`
	Error       string      `json:"error,omitempty"`
}

// BatchProfileConfig controls which profiling facets to collect.
type BatchProfileConfig struct {
	EnableSQL        bool `json:"enable_sql" yaml:"enable_sql"`
	EnableMethod     bool `json:"enable_method" yaml:"enable_method"`
	EnableStack      bool `json:"enable_stack" yaml:"enable_stack"`
	EnableFlamegraph bool `json:"enable_flamegraph" yaml:"enable_flamegraph"`
	Duration         int  `json:"duration" yaml:"duration"`   // seconds, default 30
	TopN             int  `json:"top_n" yaml:"top_n"`         // top-N results, default 10
}

// DefaultProfileConfig returns sensible defaults.
func DefaultProfileConfig() BatchProfileConfig {
	return BatchProfileConfig{
		EnableSQL:        true,
		EnableMethod:     true,
		EnableStack:      true,
		EnableFlamegraph: true,
		Duration:         30,
		TopN:             10,
	}
}

// ProfileBatch orchestrates profiling for a running batch process.
// It selects profilers based on the target's language and the config,
// runs them concurrently where possible, and returns all collected results.
func ProfileBatch(ctx context.Context, target *BatchTarget, cfg BatchProfileConfig) []BatchProfileResult {
	logger := slog.Default().With(
		"component", "batch-profiler",
		"execution_id", target.ExecutionID,
		"pid", target.PID,
		"language", target.Language,
	)

	if cfg.Duration <= 0 {
		cfg.Duration = 30
	}
	if cfg.TopN <= 0 {
		cfg.TopN = 10
	}

	logger.Info("starting batch profiling",
		"duration_sec", cfg.Duration,
		"enable_sql", cfg.EnableSQL,
		"enable_method", cfg.EnableMethod,
		"enable_stack", cfg.EnableStack,
		"enable_flamegraph", cfg.EnableFlamegraph,
	)

	var (
		mu      sync.Mutex
		results []BatchProfileResult
		wg      sync.WaitGroup
	)

	// collect gathers one profiling result safely.
	collect := func(fn func() BatchProfileResult) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := fn()
			mu.Lock()
			results = append(results, r)
			mu.Unlock()
		}()
	}

	// Dispatch language-specific profilers.
	switch target.Language {
	case "java":
		if cfg.EnableSQL {
			collect(func() BatchProfileResult {
				return profileJavaSQL(ctx, target, cfg)
			})
		}
		if cfg.EnableMethod {
			collect(func() BatchProfileResult {
				return profileJavaMethods(ctx, target, cfg)
			})
		}
		if cfg.EnableStack {
			collect(func() BatchProfileResult {
				return profileJavaJVM(ctx, target, cfg)
			})
		}

	case "python":
		if cfg.EnableMethod {
			collect(func() BatchProfileResult {
				return profilePythonFunctions(ctx, target, cfg)
			})
		}
		if cfg.EnableStack {
			collect(func() BatchProfileResult {
				return profilePythonStack(ctx, target, cfg)
			})
		}

	case "dotnet":
		if cfg.EnableSQL {
			collect(func() BatchProfileResult {
				return profileDotNetEFCore(ctx, target, cfg)
			})
		}
		if cfg.EnableMethod {
			collect(func() BatchProfileResult {
				return profileDotNetRuntime(ctx, target, cfg)
			})
		}

	case "go":
		if cfg.EnableMethod {
			collect(func() BatchProfileResult {
				return profileGoCPU(ctx, target, cfg)
			})
		}
		if cfg.EnableStack {
			collect(func() BatchProfileResult {
				return profileGoHeap(ctx, target, cfg)
			})
			collect(func() BatchProfileResult {
				return profileGoGoroutines(ctx, target, cfg)
			})
		}

	default:
		logger.Warn("unsupported language for application-level profiling, attempting system-level only")
	}

	// Flamegraph collection via perf/eBPF — works for any language.
	if cfg.EnableFlamegraph {
		collect(func() BatchProfileResult {
			return profileBatchFlamegraphCPU(ctx, target, cfg)
		})
		collect(func() BatchProfileResult {
			return profileBatchFlamegraphOffCPU(ctx, target, cfg)
		})
	}

	wg.Wait()

	logger.Info("batch profiling complete",
		"result_count", len(results),
	)

	return results
}

// makeResult is a convenience constructor for BatchProfileResult.
func makeResult(target *BatchTarget, profileType string, data interface{}, start time.Time, err error) BatchProfileResult {
	r := BatchProfileResult{
		ExecutionID: target.ExecutionID,
		PID:         target.PID,
		Language:    target.Language,
		ProfileType: profileType,
		Data:        data,
		DurationMs:  time.Since(start).Milliseconds(),
		CapturedAt:  time.Now().UTC(),
	}
	if err != nil {
		r.Error = err.Error()
	}
	return r
}

// makeErrorResult creates a result representing a profiling failure.
func makeErrorResult(target *BatchTarget, profileType string, err error) BatchProfileResult {
	return BatchProfileResult{
		ExecutionID: target.ExecutionID,
		PID:         target.PID,
		Language:    target.Language,
		ProfileType: profileType,
		DurationMs:  0,
		CapturedAt:  time.Now().UTC(),
		Error:       fmt.Sprintf("%v", err),
	}
}
