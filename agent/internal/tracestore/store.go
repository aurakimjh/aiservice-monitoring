package tracestore

import (
	"context"
	"log/slog"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// Config holds all tunable parameters for the Trace Engine.
type Config struct {
	// DataDir is the root directory for warm-tier SQLite files and archives.
	// Default: "./data/traces"
	DataDir string `yaml:"data_dir"`

	// WarmRetainDays is how many days of warm-tier data to keep.
	// Default: 30
	WarmRetainDays int `yaml:"warm_retain_days"`

	// S3 archive configuration (S2-7 cold tier).
	S3 S3Config `yaml:"s3"`

	// ArchiveCron is the cron expression for the cold-tier archive job.
	// Default: "0 2 * * *" (2 AM daily)
	ArchiveCron string `yaml:"archive_cron"`
}

// DefaultConfig returns a Config with sensible defaults.
func DefaultConfig() Config {
	return Config{
		DataDir:        "./data/traces",
		WarmRetainDays: 30,
		ArchiveCron:    "0 2 * * *",
	}
}

// Store is the central coordinator for the Trace Engine.
// It implements otlp.SpanSink so it can be registered with the FanOut.
//
// Architecture:
//
//	OTLP Receiver → FanOut.DispatchSpans → Store.Ingest
//	                                              ↓
//	                              ┌───────────────┴───────────────┐
//	                         RingBuffer                       WarmStore
//	                         (hot tier)                     (SQLite, warm)
//	                                                               ↓
//	                                                      Archiver (S3/Parquet)
//	                                                           (cold tier)
type Store struct {
	cfg     Config
	ring    *RingBuffer
	warm    *WarmStore
	svcIdx  *ServiceIndex
	archive *Archiver
	logger  *slog.Logger
}

// New creates and initialises a Store.  Call Start to begin background jobs.
func New(cfg Config, logger *slog.Logger) (*Store, error) {
	if cfg.DataDir == "" {
		cfg.DataDir = "./data/traces"
	}
	if cfg.WarmRetainDays <= 0 {
		cfg.WarmRetainDays = 30
	}

	warm, err := NewWarmStore(cfg.DataDir+"/warm", logger)
	if err != nil {
		return nil, err
	}

	archiver := NewArchiver(cfg.DataDir+"/cold", cfg.S3, logger)

	return &Store{
		cfg:     cfg,
		ring:    NewRingBuffer(),
		warm:    warm,
		svcIdx:  NewServiceIndex(),
		archive: archiver,
		logger:  logger,
	}, nil
}

// Ingest implements otlp.SpanSink.  Called by FanOut with every span batch.
func (s *Store) Ingest(spans []*otlp.Span) {
	if len(spans) == 0 {
		return
	}

	// Hot tier: always write to ring buffer first (non-blocking).
	s.ring.Write(spans)

	// Service index: extract services and dependency edges.
	s.svcIdx.Ingest(spans)

	// Warm tier: persist to SQLite (best-effort; log errors but don't block).
	if err := s.warm.Write(spans); err != nil {
		s.logger.Warn("tracestore warm write error", "error", err, "spans", len(spans))
	}
}

// Start launches background maintenance goroutines (warm pruning, cold archive).
func (s *Store) Start(ctx context.Context) {
	go s.runPruner(ctx)
	go s.archive.Run(ctx, s.cfg.ArchiveCron, s.warm)
}

// Close shuts down the store gracefully.
func (s *Store) Close() {
	s.warm.Close()
}

// ── Query methods ─────────────────────────────────────────────────────────────

// Search returns traces matching req.  It queries the hot tier first, then
// falls back to the warm tier for older data.
func (s *Store) Search(req QueryRequest) ([]*TraceRow, error) {
	hotCutoff := time.Now().Add(-HotRetention)
	var results []*TraceRow

	// Build service name match set (XL-1: multi-service support).
	svcMatch := make(map[string]bool)
	if len(req.ServiceNames) > 1 {
		for _, sn := range req.ServiceNames {
			svcMatch[sn] = true
		}
	} else if req.ServiceName != "" {
		svcMatch[req.ServiceName] = true
	}

	// Hot tier: serve from ring buffer when the time window overlaps.
	if req.To.After(hotCutoff) {
		hotSpans := s.ring.Snapshot(hotCutoff, 0, func(sp *otlp.Span) bool {
			if len(svcMatch) > 0 && !svcMatch[sp.ServiceName] {
				return false
			}
			if req.StatusCode != 0 && sp.StatusCode != req.StatusCode {
				return false
			}
			if !sp.IsRoot() {
				return false // deduplicate: only root spans become trace rows
			}
			return sp.StartTime.After(req.From) && sp.StartTime.Before(req.To)
		})

		seen := make(map[string]bool)
		for _, sp := range hotSpans {
			if seen[sp.TraceID] {
				continue
			}
			seen[sp.TraceID] = true
			results = append(results, spanToRow(sp, "hot"))
		}
	}

	// Warm tier: fill remainder from SQLite.
	if req.From.Before(hotCutoff) || len(results) < req.Limit {
		warmReq := req
		if len(results) > 0 && req.Limit > 0 {
			warmReq.Limit = req.Limit - len(results)
		}
		warmRows, err := s.warm.QueryTraces(warmReq)
		if err != nil {
			return results, err
		}
		for _, r := range warmRows {
			r.Source = "warm"
		}
		results = append(results, warmRows...)
	}

	if req.Limit > 0 && len(results) > req.Limit {
		results = results[:req.Limit]
	}
	return results, nil
}

// GetTrace returns all spans for traceID, looking in the hot tier first.
func (s *Store) GetTrace(traceID string, from, to time.Time) (*otlp.Trace, error) {
	// Try hot tier.
	hotSpans := s.ring.QueryByTrace(traceID)
	if len(hotSpans) > 0 {
		return buildTrace(hotSpans), nil
	}

	// Fall back to warm tier.
	spans, err := s.warm.GetTrace(traceID, from, to)
	if err != nil {
		return nil, err
	}
	if len(spans) == 0 {
		return nil, nil
	}
	return buildTrace(spans), nil
}

// XLogPoints returns scatter-plot data points for the given service + window.
func (s *Store) XLogPoints(serviceName string, from, to time.Time, limit int) ([]XLogPoint, error) {
	hotCutoff := time.Now().Add(-HotRetention)
	var out []XLogPoint

	// Hot tier.
	if to.After(hotCutoff) {
		hotSpans := s.ring.Snapshot(hotCutoff, limit, func(sp *otlp.Span) bool {
			return sp.ServiceName == serviceName && sp.IsRoot() &&
				sp.StartTime.After(from) && sp.StartTime.Before(to)
		})
		for _, sp := range hotSpans {
			out = append(out, XLogPoint{
				Timestamp:  sp.StartTime,
				DurationMS: sp.DurationMS(),
				StatusCode: sp.StatusCode,
				TraceID:    sp.TraceID,
			})
		}
	}

	// Warm tier.
	remaining := limit - len(out)
	if remaining != 0 && from.Before(hotCutoff) {
		pts, err := s.warm.XLogPoints(serviceName, from, to, remaining)
		if err != nil {
			return out, err
		}
		out = append(out, pts...)
	}

	return out, nil
}

// Services returns the list of known services from the in-memory index.
func (s *Store) Services() []*ServiceInfo { return s.svcIdx.Services() }

// DependencyGraph returns the service dependency graph.
func (s *Store) DependencyGraph() []DependencyEdge { return s.svcIdx.DependencyGraph() }

// RingStats returns hot-tier buffer statistics.
func (s *Store) RingStats() RingStats { return s.ring.Stats() }

// ── helpers ───────────────────────────────────────────────────────────────────

func spanToRow(sp *otlp.Span, source string) *TraceRow {
	return &TraceRow{
		TraceID:     sp.TraceID,
		ServiceName: sp.ServiceName,
		RootName:    sp.Name,
		StartTime:   sp.StartTime,
		EndTime:     sp.EndTime,
		DurationMS:  sp.DurationMS(),
		StatusCode:  sp.StatusCode,
		SpanCount:   1,
		Source:      source,
	}
}

func buildTrace(spans []*otlp.Span) *otlp.Trace {
	if len(spans) == 0 {
		return nil
	}
	t := &otlp.Trace{
		TraceID:    spans[0].TraceID,
		SpanCount:  len(spans),
		Spans:      spans,
		StartTime:  spans[0].StartTime,
		EndTime:    spans[0].EndTime,
		StatusCode: otlp.StatusUnset,
	}
	for _, sp := range spans {
		if sp.IsRoot() {
			t.ServiceName = sp.ServiceName
			t.RootName = sp.Name
		}
		if sp.StartTime.Before(t.StartTime) {
			t.StartTime = sp.StartTime
		}
		if sp.EndTime.After(t.EndTime) {
			t.EndTime = sp.EndTime
		}
		if sp.StatusCode > t.StatusCode {
			t.StatusCode = sp.StatusCode
		}
	}
	t.DurationMS = float64(t.EndTime.Sub(t.StartTime).Milliseconds())
	return t
}

// runPruner periodically removes warm-tier files older than WarmRetainDays.
func (s *Store) runPruner(ctx context.Context) {
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.warm.Prune(s.cfg.WarmRetainDays); err != nil {
				s.logger.Warn("tracestore warm prune error", "error", err)
			}
		}
	}
}
