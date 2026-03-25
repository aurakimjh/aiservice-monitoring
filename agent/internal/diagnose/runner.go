// Package diagnose implements the Phase 31 diagnostic runner that orchestrates
// evidence collection, script execution, scheduling, and upload.
package diagnose

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/evidence"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/script"
)

// Mode controls which collectors run.
type Mode int

const (
	// ModeAuto runs all ModeBuiltin evidence collectors.
	ModeAuto Mode = iota
	// ModeScript runs ModeBuiltin + ModeScript (external scripts) collectors.
	ModeScript
	// ModeFull runs everything including ModeManual collectors.
	ModeFull
)

// Config configures the diagnostic runner.
type Config struct {
	// AgentID is the unique agent identifier included in every evidence bundle.
	AgentID string
	// Hostname is the host name included in every evidence bundle.
	Hostname string
	// ProjectID / TenantID for multi-tenant deployments.
	ProjectID string
	TenantID  string
	// ScriptMappings maps ITEM IDs to script file paths (Phase 31-2c).
	ScriptMappings []ScriptMapping
	// ScriptBaseDir is the directory where script files are stored.
	ScriptBaseDir string
	// UploadURL is the collection-server evidence upload endpoint.
	// If empty, the evidence bundle is only kept in-memory / returned.
	UploadURL string
	// ProjectToken for Bearer auth.
	ProjectToken string
	// Interval is the cron expression for scheduled runs ("0 0 * * *" = daily).
	// Used by the Scheduler wrapper.
	Interval string
	// RunMode selects which collectors participate.
	RunMode Mode
}

// ScriptMapping links a catalog ITEM ID to an external script file.
type ScriptMapping struct {
	ItemID     string `yaml:"item_id"`
	ScriptPath string `yaml:"script_path"`
	Timeout    string `yaml:"timeout,omitempty"` // e.g. "2m"
}

// RunResult is the result of a single diagnostic run.
type RunResult struct {
	RunID     string                   `json:"run_id"`
	StartedAt time.Time                `json:"started_at"`
	Duration  time.Duration            `json:"duration_ms"`
	Results   []*evidence.EvidenceResult `json:"results,omitempty"`
	ZipBytes  int                      `json:"zip_bytes,omitempty"`
	Uploaded  bool                     `json:"uploaded"`
	Errors    []string                 `json:"errors,omitempty"`
}

// Runner orchestrates evidence collection and optional upload.
type Runner struct {
	cfg      Config
	registry *evidence.Registry
	executor *script.Executor
	logger   *slog.Logger
	mu       sync.Mutex
	lastRun  *RunResult
}

// New creates a diagnostic Runner.
func New(cfg Config, reg *evidence.Registry, logger *slog.Logger) *Runner {
	execCfg := script.Config{
		WorkDir: cfg.ScriptBaseDir,
	}
	return &Runner{
		cfg:      cfg,
		registry: reg,
		executor: script.New(execCfg),
		logger:   logger,
	}
}

// Run performs a full diagnostic collection pass and optionally uploads the bundle.
func (r *Runner) Run(ctx context.Context) *RunResult {
	runID := fmt.Sprintf("diag-%d", time.Now().UnixMilli())
	start := time.Now()
	result := &RunResult{
		RunID:     runID,
		StartedAt: start,
	}

	r.logger.Info("diagnostic run started", "run_id", runID, "mode", r.cfg.RunMode)

	cfg := evidence.EvidenceConfig{
		AgentID:   r.cfg.AgentID,
		Hostname:  r.cfg.Hostname,
		ProjectID: r.cfg.ProjectID,
		TenantID:  r.cfg.TenantID,
	}

	// ── builtin collectors ────────────────────────────────────────────────────
	for _, c := range r.registry.ByMode(evidence.ModeBuiltin) {
		select {
		case <-ctx.Done():
			result.Errors = append(result.Errors, "context cancelled during builtin collection")
			goto done
		default:
		}
		res, err := c.Collect(ctx, cfg)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", c.ID(), err))
			continue
		}
		result.Results = append(result.Results, res)
		r.logger.Info("evidence collected",
			"collector", c.ID(),
			"items", len(res.Items),
			"errors", len(res.Errors),
		)
	}

	// ── script-based collectors (Mode >= ModeScript) ──────────────────────────
	if r.cfg.RunMode >= ModeScript {
		for _, mapping := range r.cfg.ScriptMappings {
			select {
			case <-ctx.Done():
				result.Errors = append(result.Errors, "context cancelled during script collection")
				goto done
			default:
			}
			res := r.runScriptMapping(ctx, mapping, cfg)
			if res != nil {
				result.Results = append(result.Results, res)
			}
		}
	}

	// ── manual collectors (Mode >= ModeFull) ──────────────────────────────────
	if r.cfg.RunMode >= ModeFull {
		for _, c := range r.registry.ByMode(evidence.ModeManual) {
			select {
			case <-ctx.Done():
				result.Errors = append(result.Errors, "context cancelled during manual collection")
				goto done
			default:
			}
			res, err := c.Collect(ctx, cfg)
			if err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", c.ID(), err))
				continue
			}
			result.Results = append(result.Results, res)
		}
	}

done:
	// ── build ZIP ─────────────────────────────────────────────────────────────
	zb := evidence.NewZipBuilder()
	zipData, err := zb.Build(r.cfg.AgentID, result.Results)
	if err != nil {
		result.Errors = append(result.Errors, "zip: "+err.Error())
	} else {
		result.ZipBytes = len(zipData)

		// ── upload ────────────────────────────────────────────────────────────
		if r.cfg.UploadURL != "" {
			uploader := evidence.NewEvidenceUploader(r.cfg.UploadURL, r.cfg.ProjectToken)
			if err := uploader.Upload(ctx, r.cfg.AgentID, zipData); err != nil {
				result.Errors = append(result.Errors, "upload: "+err.Error())
				r.logger.Warn("evidence upload failed", "error", err)
			} else {
				result.Uploaded = true
				r.logger.Info("evidence uploaded", "run_id", runID, "bytes", result.ZipBytes)
			}
		}
	}

	result.Duration = time.Since(start)
	r.mu.Lock()
	r.lastRun = result
	r.mu.Unlock()

	r.logger.Info("diagnostic run finished",
		"run_id", runID,
		"items_total", countItems(result.Results),
		"errors", len(result.Errors),
		"uploaded", result.Uploaded,
		"duration_ms", result.Duration.Milliseconds(),
	)
	return result
}

// LastRun returns the most recent run result (nil if never run).
func (r *Runner) LastRun() *RunResult {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.lastRun
}

// runScriptMapping executes an external script and wraps the output as an EvidenceResult.
func (r *Runner) runScriptMapping(ctx context.Context, m ScriptMapping, cfg evidence.EvidenceConfig) *evidence.EvidenceResult {
	execResult := r.executor.Execute(ctx, m.ScriptPath)

	res := &evidence.EvidenceResult{
		CollectorID:      "script-" + m.ItemID,
		CollectorVersion: "1.0.0",
		CollectMode:      evidence.ModeScript,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        time.Now().UTC(),
	}

	if execResult.Error != "" || execResult.ExitCode != 0 {
		res.Errors = append(res.Errors, evidence.EvidenceError{
			ItemID:  m.ItemID,
			Code:    "SCRIPT_ERROR",
			Message: execResult.Error,
			Source:  m.ScriptPath,
		})
		return res
	}

	res.Items = append(res.Items, evidence.EvidenceItem{
		ItemID:     m.ItemID,
		SchemaName: "evidence.script." + sanitize(m.ItemID) + ".v1",
		FilePath:   m.ScriptPath,
		Content: map[string]interface{}{
			"stdout":      execResult.Stdout,
			"exit_code":   execResult.ExitCode,
			"duration_ms": execResult.Duration.Milliseconds(),
		},
		CollectedAt: time.Now().UTC(),
	})
	return res
}

func sanitize(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' {
			out = append(out, c)
		} else {
			out = append(out, '_')
		}
	}
	return string(out)
}

func countItems(results []*evidence.EvidenceResult) int {
	n := 0
	for _, r := range results {
		n += len(r.Items)
	}
	return n
}
