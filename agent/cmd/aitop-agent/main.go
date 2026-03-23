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
	aicol "github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/ai"
	itcol "github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/it"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/config"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/core"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/health"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/privilege"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/sanitizer"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/scheduler"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/shell"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/statemachine"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/lite"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/transport"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/updater"
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

	// ── agent ID ──────────────────────────────────────────────────────────────
	agentID := cfg.Agent.ID
	if agentID == "" {
		hostname, _ := os.Hostname()
		agentID = "agent-" + hostname
	}

	// ── collector registry ────────────────────────────────────────────────────
	registry := core.NewRegistry(logger)

	// Register IT collectors (OS, WEB, WAS, DB)
	itcol.RegisterAll(registry)

	// Register AI collectors (LLM, VectorDB, Serving, OTel, GPU)
	aicol.RegisterAll(registry)

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
	healthMon := health.NewMonitor(agentID)

	// ── state machine ─────────────────────────────────────────────────────────
	sm := statemachine.New(logger)
	// Automatically advance to approved when the server URL is configured.
	if cfg.Server.URL != "" {
		_ = sm.Transition("approve")
	}

	// ── sanitizer ────────────────────────────────────────────────────────────
	san := sanitizer.New()

	// ── remote shell manager ──────────────────────────────────────────────────
	var shellMgr *shell.Manager
	if cfg.RemoteShell.Enabled {
		shellMgr = shell.NewManager(agentID, cfg.RemoteShell, logger)
		logger.Info("remote shell service enabled",
			"max_sessions", cfg.RemoteShell.MaxSessions,
			"audit", cfg.RemoteShell.AuditEnabled,
		)
	}

	// ── OTA updater ───────────────────────────────────────────────────────────
	var otaUpdater *updater.Manager
	if cfg.Server.URL != "" && cfg.Agent.Mode == models.ModeFull {
		otaCfg := updater.Config{
			ServerURL:  cfg.Server.URL,
			AgentToken: cfg.Server.ProjectToken,
			AgentID:    agentID,
			HealthFn: func() bool {
				metrics := healthMon.GetSelfMetrics()
				return metrics.HeapAllocMB < 200 && sm.State() != "error"
			},
		}
		if mgr, err := updater.New(otaCfg, logger); err != nil {
			logger.Warn("OTA updater init failed", "error", err)
		} else {
			otaUpdater = mgr
			logger.Info("OTA updater initialised")
		}
	}

	// ── transport (heartbeat + HTTP collect) ───────────────────────────────────
	var heartbeatSender *transport.HeartbeatSender
	var httpClient *transport.HTTPClient
	if cfg.Server.URL != "" {
		heartbeatSender = transport.NewHeartbeatSender(cfg.Server.URL, cfg.Server.ProjectToken, logger)
		httpClient = transport.NewHTTPClient(cfg.Server.URL, cfg.Server.ProjectToken, logger)

		// Wire state machine to heartbeat acknowledgements/misses.
		go heartbeatSender.Run(ctx, func() *models.Heartbeat {
			plugins := buildPluginStatus(registry)
			hb := healthMon.BuildHeartbeat(plugins, privReport)
			hb.Status = sm.State()
			return hb
		})

		// Process remote commands from server.
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case cmd := <-heartbeatSender.CommandCh:
					handleRemoteCommand(ctx, cmd, registry, buf, san, shellMgr, logger)
				}
			}
		}()
	}

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
			if err := buf.Store(r.CollectorID, sanitized); err != nil {
				logger.Error("buffer store failed", "collector", r.CollectorID, "error", err)
			}
		}

		// Log self metrics alongside each collection run.
		smMetrics := healthMon.GetSelfMetrics()
		logger.Info("agent health",
			"heap_mb", smMetrics.HeapAllocMB,
			"goroutines", smMetrics.NumGoroutines,
			"uptime_s", smMetrics.UptimeSeconds,
			"agent_state", sm.State(),
		)

		if n, err := buf.PendingCount(); err == nil && n > 0 {
			logger.Info("buffer status", "pending_items", n)
		}
	}

	// ── collect-only / collect-export: run once then exit ─────────────────────
	if cfg.Agent.Mode == models.ModeCollectOnly || cfg.Agent.Mode == models.ModeCollectExport {
		logger.Info("running in one-shot mode", "mode", cfg.Agent.Mode)
		runCollect(ctx)

		if cfg.Agent.Mode == models.ModeCollectOnly && httpClient != nil {
			// Flush all buffered results to the server via HTTPS.
			logger.Info("flushing collected data to server", "url", cfg.Server.URL)
			_ = buf.Flush(ctx, func(collectorID string, data []byte) error {
				return httpClient.SendCollectResult(ctx, collectorID, data)
			})
		}

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

	// ── lite mode: local-only operation ──────────────────────────────────────
	if cfg.Agent.Mode == models.ModeLite {
		logger.Info("running in LITE mode — Fleet/OTA disabled, local storage only")

		// Start Lite HTTP server (status dashboard + report/cleanup API)
		litePort := os.Getenv("AITOP_LITE_PORT")
		if litePort == "" {
			litePort = "8080"
		}
		liteSrv := lite.NewServer(litePort, buf, logger)
		go liteSrv.Start(ctx)

		// Run collect on schedule, but no server flush
		sched := scheduler.New(logger)
		if err := sched.Register("collect", cfg.Schedule.Default, runCollect); err != nil {
			logger.Error("failed to register collect job", "error", err)
			os.Exit(1)
		}
		// Local buffer prune (7-day retention)
		pruneJob := func(ctx context.Context) {
			if err := buf.Prune(7 * 24 * time.Hour); err != nil {
				logger.Warn("buffer prune failed", "error", err)
			}
		}
		if err := sched.Register("prune", "0 */6 * * *", pruneJob); err != nil {
			logger.Warn("failed to register prune job", "error", err)
		}
		sched.Start(ctx)
		logger.Info("lite scheduler started", "jobs", sched.Jobs())

		<-ctx.Done()
		logger.Info("shutdown signal received, stopping lite agent…")
		sched.Stop()
		logger.Info("aitop-agent (lite) stopped")
		return
	}

	// ── scheduler ─────────────────────────────────────────────────────────────
	sched := scheduler.New(logger)

	if err := sched.Register("collect", cfg.Schedule.Default, runCollect); err != nil {
		logger.Error("failed to register collect job", "error", err)
		os.Exit(1)
	}

	if cfg.Agent.Mode == models.ModeFull {
		// Periodic buffer flush
		flushJob := func(ctx context.Context) {
			var sendFn func(collectorID string, data []byte) error
			if httpClient != nil {
				sendFn = func(collectorID string, data []byte) error {
					return httpClient.SendCollectResult(ctx, collectorID, data)
				}
			} else {
				sendFn = func(_ string, _ []byte) error {
					return fmt.Errorf("transport not available")
				}
			}
			_ = buf.Flush(ctx, sendFn)
			// Prune items sent more than 7 days ago.
			if err := buf.Prune(7 * 24 * time.Hour); err != nil {
				logger.Warn("buffer prune failed", "error", err)
			}
		}
		if err := sched.Register("flush", cfg.Schedule.Metrics, flushJob); err != nil {
			logger.Error("failed to register flush job", "error", err)
			os.Exit(1)
		}

		// OTA update check — daily at 03:00
		if otaUpdater != nil {
			otaJob := func(ctx context.Context) {
				if err := otaUpdater.CheckAndUpdate(ctx); err != nil {
					logger.Error("OTA update check failed", "error", err)
				}
			}
			if err := sched.Register("ota", "0 3 * * *", otaJob); err != nil {
				logger.Warn("failed to register OTA update job", "error", err)
			}
		}
	}

	// ── start scheduler (full / resident mode) ────────────────────────────────
	sched.Start(ctx)
	logger.Info("scheduler started", "jobs", sched.Jobs())

	// Wait for shutdown signal.
	<-ctx.Done()
	logger.Info("shutdown signal received, stopping agent…")
	sched.Stop()

	// Gracefully close shell sessions
	if shellMgr != nil {
		for _, si := range shellMgr.ListSessions() {
			shellMgr.CloseSession(si.ID)
		}
	}

	logger.Info("aitop-agent stopped")
}

// buildPluginStatus builds a snapshot of registered collector statuses.
func buildPluginStatus(registry *core.Registry) []models.PluginStatus {
	ids := registry.List()
	plugins := make([]models.PluginStatus, 0, len(ids))
	for _, id := range ids {
		if c, ok := registry.Get(id); ok {
			plugins = append(plugins, models.PluginStatus{
				PluginID: id,
				Version:  c.Version(),
				Status:   "active",
			})
		}
	}
	return plugins
}

// handleRemoteCommand dispatches a RemoteCommand from the collection server.
func handleRemoteCommand(
	ctx context.Context,
	cmd models.RemoteCommand,
	registry *core.Registry,
	buf *buffer.Buffer,
	san *sanitizer.Sanitizer,
	shellMgr *shell.Manager,
	logger *slog.Logger,
) {
	logger.Info("executing remote command", "id", cmd.ID, "type", cmd.Type)
	switch cmd.Type {
	case "collect":
		collectCfg := models.CollectConfig{
			Hostname: func() string { h, _ := os.Hostname(); return h }(),
		}
		results := registry.CollectAll(ctx, collectCfg)
		for _, r := range results {
			if r.Status == models.StatusSkipped {
				continue
			}
			raw, err := json.Marshal(r)
			if err != nil {
				continue
			}
			sanitized, _ := san.SanitizeJSON(raw)
			if sanitized == nil {
				sanitized = raw
			}
			_ = buf.Store(r.CollectorID, sanitized)
		}

	case "terminal.open":
		if shellMgr == nil {
			logger.Warn("remote shell not enabled, ignoring terminal.open")
			return
		}
		sessionID := shell.SessionID(cmd.ID)
		// Payload JSON: {"user_id":"alice","role":"sre"}
		var params map[string]string
		if cmd.Payload != "" {
			_ = json.Unmarshal([]byte(cmd.Payload), &params)
		}
		if params == nil {
			params = map[string]string{}
		}
		userID := params["user_id"]
		role := params["role"]
		if role == "" {
			role = "sre"
		}
		sess, outCh, err := shellMgr.OpenSession(ctx, sessionID, userID, role)
		if err != nil {
			logger.Error("failed to open terminal session", "error", err)
			return
		}
		_ = sess
		// Drain output (in real deployment: forward via gRPC/WebSocket to backend)
		go func() {
			for ev := range outCh {
				logger.Debug("terminal output", "session", ev.SessionID, "bytes", len(ev.Data))
			}
		}()

	case "terminal.input":
		if shellMgr == nil {
			return
		}
		sessionID := shell.SessionID(cmd.ID)
		// Payload is raw input data (base64 or plaintext)
		if err := shellMgr.SendInput(shell.InputEvent{SessionID: sessionID, Data: []byte(cmd.Payload)}); err != nil {
			logger.Warn("terminal input failed", "session", sessionID, "error", err)
		}

	case "terminal.close":
		if shellMgr != nil {
			shellMgr.CloseSession(shell.SessionID(cmd.ID))
		}

	default:
		logger.Warn("unknown remote command type", "type", cmd.Type)
	}
}

// defaultConfig returns a minimal Config with sensible defaults.
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
		RemoteShell: config.RemoteShellConfig{
			Enabled:      false,
			MaxSessions:  3,
			IdleTimeout:  600,
			MaxDuration:  3600,
			AuditEnabled: true,
		},
	}
}
