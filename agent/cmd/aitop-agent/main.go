// Command aitop-agent is the AITOP monitoring agent binary.
// It collects system and AI-service metrics on a cron schedule,
// buffers data locally when the server is unreachable, and flushes
// the buffer automatically once connectivity is restored.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/buffer"
	gpucol "github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai/gpu"
	oscol "github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/os"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/config"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/core"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/health"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/privilege"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/sanitizer"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/scheduler"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/version"
)

func main() {
	// ── flags ─────────────────────────────────────────────────────────────────
	cfgPath := flag.String("config", "configs/agent.yaml", "path to agent configuration file")
	showVer := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVer {
		fmt.Println(version.Full())
		os.Exit(0)
	}

	// ── logger ────────────────────────────────────────────────────────────────
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// ── config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		logger.Warn("failed to load config, using built-in defaults", "path", *cfgPath, "error", err)
		cfg = defaultConfig()
	}

	// Adjust log level from config.
	var logLevel slog.Level
	switch cfg.Logging.Level {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}
	logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	logger.Info("starting aitop-agent",
		"version", version.Full(),
		"mode", cfg.Agent.Mode,
		"agent_id", cfg.Agent.ID,
	)

	// ── root context (cancelled on OS signal) ─────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── collector registry ────────────────────────────────────────────────────
	registry := core.NewRegistry(logger)
	registry.Register(oscol.New())
	registry.Register(gpucol.New())

	// ── privilege pre-flight check ────────────────────────────────────────────
	privChecker := privilege.NewChecker(logger)
	collectors := make([]models.Collector, 0)
	for _, id := range registry.List() {
		if c, ok := registry.Get(id); ok {
			collectors = append(collectors, c)
		}
	}
	privReport := privChecker.CheckAll(collectors)
	if privReport != nil {
		for _, chk := range privReport.Checks {
			if chk.Status == "DENIED" {
				logger.Warn("privilege denied",
					"collector", chk.Collector,
					"privilege", chk.Privilege,
					"detail", chk.Detail,
				)
			}
		}
	}

	// ── local buffer ──────────────────────────────────────────────────────────
	bufPath := cfg.Buffer.Path
	if bufPath == "" {
		bufPath = filepath.Join(os.TempDir(), "aitop-agent-buffer.db")
	}
	buf, err := buffer.Open(bufPath, logger)
	if err != nil {
		logger.Error("failed to open local buffer", "path", bufPath, "error", err)
		os.Exit(1)
	}
	defer buf.Close()

	// ── health monitor ────────────────────────────────────────────────────────
	agentID := cfg.Agent.ID
	if agentID == "" {
		hostname, _ := os.Hostname()
		agentID = "agent-" + hostname
	}
	healthMon := health.NewMonitor(agentID)

	// ── sanitizer ────────────────────────────────────────────────────────────
	san := sanitizer.New()

	// ── build collection job ──────────────────────────────────────────────────
	collectCfg := models.CollectConfig{
		Hostname: func() string { h, _ := os.Hostname(); return h }(),
	}

	runCollect := func(ctx context.Context) {
		results := registry.CollectAll(ctx, collectCfg)
		for _, r := range results {
			if r.Status == models.StatusSkipped {
				continue
			}
			raw, err := json.Marshal(r)
			if err != nil {
				logger.Error("marshal collect result", "collector", r.CollectorID, "error", err)
				continue
			}
			sanitized, err := san.SanitizeJSON(raw)
			if err != nil {
				logger.Warn("sanitize failed, using raw data", "collector", r.CollectorID, "error", err)
				sanitized = raw
			}
			// Transport is not yet implemented (Phase 15-4).
			// All results are buffered for now and will be flushed once
			// the transport layer is available.
			if err := buf.Store(r.CollectorID, sanitized); err != nil {
				logger.Error("buffer store failed", "collector", r.CollectorID, "error", err)
			}
		}

		// Log self metrics alongside each collection run.
		sm := healthMon.GetSelfMetrics()
		logger.Info("agent health",
			"heap_mb", sm.HeapAllocMB,
			"goroutines", sm.NumGoroutines,
			"uptime_s", sm.UptimeSeconds,
		)

		if n, err := buf.PendingCount(); err == nil && n > 0 {
			logger.Info("buffer status", "pending_items", n)
		}
	}

	// ── scheduler ─────────────────────────────────────────────────────────────
	sched := scheduler.New(logger)

	if err := sched.Register("collect", cfg.Schedule.Default, runCollect); err != nil {
		logger.Error("failed to register collect job", "error", err)
		os.Exit(1)
	}

	if cfg.Agent.Mode == models.ModeFull {
		// In full mode, also schedule a periodic buffer-flush attempt.
		// The flush no-ops while transport is not yet wired up (sendFn always errors).
		flushJob := func(ctx context.Context) {
			_ = buf.Flush(ctx, func(collectorID string, data []byte) error {
				// Stub: transport not yet implemented.
				return fmt.Errorf("transport not available")
			})
			// Prune items sent more than 7 days ago.
			if err := buf.Prune(7 * 24 * time.Hour); err != nil {
				logger.Warn("buffer prune failed", "error", err)
			}
		}
		if err := sched.Register("flush", cfg.Schedule.Metrics, flushJob); err != nil {
			logger.Error("failed to register flush job", "error", err)
			os.Exit(1)
		}
	}

	// ── collect-only / collect-export: run once then exit ─────────────────────
	if cfg.Agent.Mode == models.ModeCollectOnly || cfg.Agent.Mode == models.ModeCollectExport {
		logger.Info("running in one-shot mode", "mode", cfg.Agent.Mode)
		runCollect(ctx)
		if cfg.Agent.Mode == models.ModeCollectExport {
			// Export pending items to stdout as NDJSON.
			items, err := buf.Pending()
			if err != nil {
				logger.Error("export pending failed", "error", err)
				os.Exit(1)
			}
			enc := json.NewEncoder(os.Stdout)
			for _, it := range items {
				if err := enc.Encode(it); err != nil {
					logger.Error("export encode failed", "error", err)
				}
			}
		}
		return
	}

	// ── start scheduler (full / resident mode) ────────────────────────────────
	sched.Start(ctx)
	logger.Info("scheduler started", "jobs", sched.Jobs())

	// Wait for shutdown signal.
	<-ctx.Done()
	logger.Info("shutdown signal received, stopping agent…")
	sched.Stop()
	logger.Info("aitop-agent stopped")
}

// defaultConfig returns a minimal Config with sensible defaults for when the
// configuration file is missing or cannot be parsed.
func defaultConfig() *config.Config {
	return &config.Config{
		Agent: config.AgentConfig{
			Mode: models.ModeFull,
		},
		Schedule: config.ScheduleConfig{
			Default: "0 */6 * * *",
			Metrics: "*/60 * * * * *",
		},
		Buffer: config.BufferConfig{
			MaxSizeMB: 500,
		},
		Logging: config.LoggingConfig{
			Level: "info",
		},
	}
}
