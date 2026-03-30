package otlp

// fanout.go — Fan-out dispatcher (S1-5)
//
// FanOut reads batches from the RingBuffer and delivers them to two
// registered sinks in parallel:
//   - TraceHandler: receives TraceBatch (slices of *Span)
//   - MetricHandler: receives MetricBatch (slices of *MetricPoint)
//
// Design:
//   - Single background goroutine polls the ring buffer every pollInterval.
//   - When a batch is ready, Spans and MetricPoints are separated and dispatched
//     to the respective handlers concurrently via goroutines.
//   - Handlers must not block; expensive work (e.g., SQLite writes) should be
//     done asynchronously inside the handler.

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

const (
	// defaultPollInterval is how often FanOut polls the ring buffer when idle.
	defaultPollInterval = 5 * time.Millisecond

	// defaultBatchSize is the maximum number of events drained per poll cycle.
	defaultBatchSize = 4096
)

// TraceHandler is the callback invoked for each batch of spans.
// Implementations must be safe for concurrent calls.
type TraceHandler func(batch TraceBatch)

// MetricHandler is the callback invoked for each batch of metric points.
// Implementations must be safe for concurrent calls.
type MetricHandler func(batch MetricBatch)

// FanOut drains the RingBuffer and delivers events to registered handlers.
type FanOut struct {
	queue   *RingBuffer
	trace   TraceHandler
	metric  MetricHandler
	logger  *slog.Logger
	poll    time.Duration
	batch   int

	// stats (atomic via single writer)
	totalSpans   uint64
	totalMetrics uint64
	totalBatches uint64
}

// FanOutConfig holds FanOut constructor options.
type FanOutConfig struct {
	// PollInterval overrides defaultPollInterval if non-zero.
	PollInterval time.Duration
	// BatchSize overrides defaultBatchSize if positive.
	BatchSize int
}

// NewFanOut creates a FanOut attached to the given RingBuffer.
// traceH and metricH may be nil (events of that type are silently discarded).
func NewFanOut(queue *RingBuffer, traceH TraceHandler, metricH MetricHandler, logger *slog.Logger, cfg FanOutConfig) *FanOut {
	poll := defaultPollInterval
	if cfg.PollInterval > 0 {
		poll = cfg.PollInterval
	}
	batchSz := defaultBatchSize
	if cfg.BatchSize > 0 {
		batchSz = cfg.BatchSize
	}
	return &FanOut{
		queue:  queue,
		trace:  traceH,
		metric: metricH,
		logger: logger,
		poll:   poll,
		batch:  batchSz,
	}
}

// Run starts the fan-out loop. It blocks until ctx is cancelled.
// Call this in a dedicated goroutine.
func (f *FanOut) Run(ctx context.Context) {
	ticker := time.NewTicker(f.poll)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Drain remaining events before exit.
			f.flush()
			return
		case <-ticker.C:
			f.flush()
		}
	}
}

// flush drains one batch from the ring buffer and dispatches to handlers.
func (f *FanOut) flush() {
	events := f.queue.Drain(f.batch)
	if len(events) == 0 {
		return
	}

	// Separate spans and metric points.
	var spans []*Span
	var metrics []*MetricPoint

	for i := range events {
		switch events[i].Kind {
		case EventKindSpan:
			spans = append(spans, events[i].Span)
		case EventKindMetric:
			metrics = append(metrics, events[i].Metric)
		}
	}

	f.totalBatches++

	// Dispatch both kinds in parallel.
	var wg sync.WaitGroup

	if len(spans) > 0 && f.trace != nil {
		f.totalSpans += uint64(len(spans))
		wg.Add(1)
		go func(ss []*Span) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					f.logger.Error("otlp: trace handler panic", "recover", r)
				}
			}()
			f.trace(TraceBatch{Spans: ss, ReceivedAt: time.Now()})
		}(spans)
	}

	if len(metrics) > 0 && f.metric != nil {
		f.totalMetrics += uint64(len(metrics))
		wg.Add(1)
		go func(ms []*MetricPoint) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					f.logger.Error("otlp: metric handler panic", "recover", r)
				}
			}()
			f.metric(MetricBatch{Points: ms, ReceivedAt: time.Now()})
		}(metrics)
	}

	wg.Wait()
}

// Stats returns cumulative counters for observability.
func (f *FanOut) Stats() FanOutStats {
	return FanOutStats{
		TotalSpans:    f.totalSpans,
		TotalMetrics:  f.totalMetrics,
		TotalBatches:  f.totalBatches,
		QueueLen:      f.queue.Len(),
		QueueCap:      f.queue.Cap(),
		QueueOverflow: f.queue.OverflowTotal(),
	}
}

// FanOutStats is a snapshot of FanOut counters.
type FanOutStats struct {
	TotalSpans    uint64
	TotalMetrics  uint64
	TotalBatches  uint64
	QueueLen      int
	QueueCap      int
	QueueOverflow uint64
}
