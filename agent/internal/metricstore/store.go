package metricstore

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// Config holds all tunable parameters for the Metric Engine.
type Config struct {
	// DataDir is the root directory for warm-tier SQLite files and archives.
	// Default: "./data/metrics"
	DataDir string `yaml:"data_dir"`

	// WarmRetainDays is how many days of warm-tier data to keep.
	// Default: 90
	WarmRetainDays int `yaml:"warm_retain_days"`

	// S3 archive configuration (S3-8 cold tier).
	S3 S3Config `yaml:"s3"`

	// ArchiveCron is the cron expression for the cold-tier archive job.
	// Default: "0 3 * * *" (3 AM daily)
	ArchiveCron string `yaml:"archive_cron"`
}

// DefaultConfig returns a Config with sensible defaults.
func DefaultConfig() Config {
	return Config{
		DataDir:        "./data/metrics",
		WarmRetainDays: 90,
		ArchiveCron:    "0 3 * * *",
	}
}

// Store is the central coordinator for the Metric Engine.
//
// Architecture:
//
//	OTLP Receiver → FanOut.DispatchMetrics → Store.Ingest
//	                                               ↓
//	                               ┌───────────────┴───────────────┐
//	                          HotStore                         WarmStore
//	                     (sharded in-memory)              (SQLite, warm tier)
//	                                                              ↓
//	                                                   ┌──────────┴──────────┐
//	                                              Downsampler          Archiver
//	                                           (1m→1h compaction)   (S3/Parquet cold)
//	                                                   ↓
//	                                              AlertEngine
//	                                         (threshold evaluation)
type Store struct {
	cfg         Config
	hot         *HotStore
	warm        *WarmStore
	archive     *Archiver
	downsampler *Downsampler
	alerts      *AlertEngine
	logger      *slog.Logger
}

// New creates and initialises a Store. Call Start to begin background jobs.
func New(cfg Config, alertCb AlertCallback, logger *slog.Logger) (*Store, error) {
	if cfg.DataDir == "" {
		cfg.DataDir = "./data/metrics"
	}
	if cfg.WarmRetainDays <= 0 {
		cfg.WarmRetainDays = 90
	}

	warm, err := NewWarmStore(cfg.DataDir+"/warm", logger)
	if err != nil {
		return nil, err
	}

	hot := NewHotStore()
	archiver := NewArchiver(cfg.DataDir+"/cold", cfg.S3, logger)
	downsampler := NewDownsampler(warm, logger)
	alerts := NewAlertEngine(hot, alertCb, logger)

	return &Store{
		cfg:         cfg,
		hot:         hot,
		warm:        warm,
		archive:     archiver,
		downsampler: downsampler,
		alerts:      alerts,
		logger:      logger,
	}, nil
}

// Ingest receives a batch of MetricPoints from the OTLP fan-out and writes
// them to both the hot and warm tiers.
func (s *Store) Ingest(points []*otlp.MetricPoint) {
	if len(points) == 0 {
		return
	}

	batch := make([]ingestPoint, 0, len(points))

	for _, mp := range points {
		labels := metricLabels(mp)
		name := mp.Name
		key := SeriesKey(name, labels)

		var value float64
		if mp.IsDouble {
			value = mp.AsDouble
		} else {
			value = float64(mp.AsInt)
		}

		ts := time.Unix(0, int64(mp.TimeNano)).UTC()
		if ts.IsZero() {
			ts = mp.ReceivedAt.UTC()
		}

		batch = append(batch, ingestPoint{
			key: key,
			series: Series{
				Name:   name,
				Labels: labels,
				Key:    key,
			},
			sample: Sample{T: ts, V: value},
		})

		// For histograms, also ingest the count and sum as separate series.
		if mp.Type == otlp.MetricTypeHistogram && mp.HistCount > 0 {
			countLabels := copyLabels(labels)
			countKey := SeriesKey(name+"_count", countLabels)
			batch = append(batch, ingestPoint{
				key:    countKey,
				series: Series{Name: name + "_count", Labels: countLabels, Key: countKey},
				sample: Sample{T: ts, V: float64(mp.HistCount)},
			})

			sumLabels := copyLabels(labels)
			sumKey := SeriesKey(name+"_sum", sumLabels)
			batch = append(batch, ingestPoint{
				key:    sumKey,
				series: Series{Name: name + "_sum", Labels: sumLabels, Key: sumKey},
				sample: Sample{T: ts, V: mp.HistSum},
			})

			// Per-bucket counts as name_bucket{le="bound"}.
			for i, count := range mp.HistCounts {
				var le string
				if i < len(mp.HistBounds) {
					le = formatFloat(mp.HistBounds[i])
				} else {
					le = "+Inf"
				}
				bucketLabels := copyLabels(labels)
				bucketLabels["le"] = le
				bucketKey := SeriesKey(name+"_bucket", bucketLabels)
				batch = append(batch, ingestPoint{
					key:    bucketKey,
					series: Series{Name: name + "_bucket", Labels: bucketLabels, Key: bucketKey},
					sample: Sample{T: ts, V: float64(count)},
				})
			}
		}
	}

	// Hot tier: always write first (non-blocking).
	s.hot.Write(batch)

	// Warm tier: persist to SQLite (best-effort).
	if err := s.warm.Write(batch); err != nil {
		s.logger.Warn("metricstore warm write error", "error", err, "points", len(batch))
	}
}

// Start launches background goroutines (pruning, downsampling, archiving, alerts).
func (s *Store) Start(ctx context.Context) {
	go s.runHotPruner(ctx)
	go s.runWarmPruner(ctx)
	go s.downsampler.Run(ctx)
	go s.archive.Run(ctx, s.cfg.ArchiveCron, s.warm)
	go s.alerts.Run(ctx)
}

// Close shuts down the store gracefully.
func (s *Store) Close() {
	s.warm.Close()
}

// ── Query methods ────────────────────────────────────────────────────────────

// Query executes a metric query across hot and warm tiers with aggregation.
func (s *Store) Query(req QueryRequest) ([]QueryResult, error) {
	hotCutoff := time.Now().Add(-HotRetention)
	var allResults []QueryResult

	// Hot tier: serve from in-memory when the time window overlaps.
	if req.To.After(hotCutoff) {
		hotFrom := req.From
		if hotFrom.Before(hotCutoff) {
			hotFrom = hotCutoff
		}
		hotResults := s.hot.Query(req.MetricName, req.LabelMatch, hotFrom, req.To)
		allResults = append(allResults, hotResults...)
	}

	// Warm tier: fill remainder from SQLite.
	if req.From.Before(hotCutoff) {
		warmTo := req.To
		if warmTo.After(hotCutoff) {
			warmTo = hotCutoff
		}
		warmResults, err := s.warm.Query(req.MetricName, req.LabelMatch, req.From, warmTo, req.Limit)
		if err != nil {
			return allResults, err
		}
		allResults = mergeResults(allResults, warmResults)
	}

	// Apply aggregation.
	if req.Step > 0 && req.Aggregation != "" {
		for i := range allResults {
			switch req.Aggregation {
			case AggRate:
				allResults[i].Samples = AggregateRate(allResults[i].Samples, req.From, req.To, req.Step)
			case AggIRate:
				allResults[i].Samples = IRate(allResults[i].Samples, req.From, req.To, req.Step)
			default:
				allResults[i].Samples = Aggregate(allResults[i].Samples, req.From, req.To, req.Step, req.Aggregation)
			}
		}
	}

	// Apply limit.
	if req.Limit > 0 && len(allResults) > req.Limit {
		allResults = allResults[:req.Limit]
	}

	return allResults, nil
}

// QueryPromQL parses and executes a PromQL expression.
func (s *Store) QueryPromQL(expr string, from, to time.Time, step time.Duration) ([]QueryResult, error) {
	pq, err := ParsePromQL(expr)
	if err != nil {
		return nil, err
	}
	req := pq.ToQueryRequest(from, to, step)
	return s.Query(req)
}

// MetricNames returns all known metric names from both tiers.
func (s *Store) MetricNames() []string {
	// Merge hot and warm names.
	seen := make(map[string]struct{})
	for _, n := range s.hot.SeriesNames() {
		seen[n] = struct{}{}
	}
	for _, n := range s.warm.MetricNames() {
		seen[n] = struct{}{}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	return names
}

// Stats returns runtime statistics.
func (s *Store) Stats() StoreStats {
	seriesCount, sampleCount := s.hot.Stats()
	return StoreStats{
		HotSeriesCount:   seriesCount,
		HotSampleCount:   sampleCount,
		TotalIngested:    s.hot.totalWritten.Load(),
		WarmDayFiles:     s.warm.DayCount(),
		AlertRuleCount:   len(s.alerts.Rules()),
		AlertFiringCount: s.alerts.FiringCount(),
	}
}

// AlertEngine returns the alert engine for rule management.
func (s *Store) AlertEngine() *AlertEngine { return s.alerts }

// ── background maintenance ───────────────────────────────────────────────────

func (s *Store) runHotPruner(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cutoff := time.Now().Add(-HotRetention)
			pruned := s.hot.Prune(cutoff)
			if pruned > 0 {
				s.logger.Debug("hot prune", "pruned_series", pruned)
			}
		}
	}
}

func (s *Store) runWarmPruner(ctx context.Context) {
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.warm.Prune(s.cfg.WarmRetainDays); err != nil {
				s.logger.Warn("warm prune error", "error", err)
			}
		}
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

// metricLabels extracts a label map from a MetricPoint (service + attributes).
func metricLabels(mp *otlp.MetricPoint) map[string]string {
	labels := make(map[string]string, len(mp.Attributes)+1)
	if mp.ServiceName != "" {
		labels["service"] = mp.ServiceName
	}
	for _, kv := range mp.Attributes {
		labels[kv.Key] = kv.Value
	}
	return labels
}

func copyLabels(src map[string]string) map[string]string {
	dst := make(map[string]string, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func formatFloat(f float64) string {
	if f == float64(int64(f)) {
		return fmt.Sprintf("%d", int64(f))
	}
	return fmt.Sprintf("%g", f)
}

// mergeResults merges warm results into existing hot results.
// Series with the same key get their samples concatenated.
func mergeResults(hot, warm []QueryResult) []QueryResult {
	if len(hot) == 0 {
		return warm
	}
	if len(warm) == 0 {
		return hot
	}

	byKey := make(map[string]int, len(hot))
	for i := range hot {
		byKey[hot[i].Series.Key] = i
	}

	for _, wr := range warm {
		if idx, ok := byKey[wr.Series.Key]; ok {
			// Prepend warm samples (older) before hot samples (newer).
			merged := make([]Sample, 0, len(wr.Samples)+len(hot[idx].Samples))
			merged = append(merged, wr.Samples...)
			merged = append(merged, hot[idx].Samples...)
			hot[idx].Samples = merged
		} else {
			hot = append(hot, wr)
		}
	}
	return hot
}
