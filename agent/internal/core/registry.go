package core

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Registry manages all registered collectors and orchestrates collection runs.
type Registry struct {
	mu         sync.RWMutex
	collectors map[string]models.Collector
	logger     *slog.Logger
}

// NewRegistry creates a new collector registry.
func NewRegistry(logger *slog.Logger) *Registry {
	return &Registry{
		collectors: make(map[string]models.Collector),
		logger:     logger,
	}
}

// Register adds a collector to the registry.
func (r *Registry) Register(c models.Collector) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.collectors[c.ID()] = c
	r.logger.Info("collector registered", "id", c.ID(), "version", c.Version())
}

// Get returns a collector by ID.
func (r *Registry) Get(id string) (models.Collector, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.collectors[id]
	return c, ok
}

// List returns all registered collector IDs.
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.collectors))
	for id := range r.collectors {
		ids = append(ids, id)
	}
	return ids
}

// CollectAll runs all enabled collectors and returns aggregated results.
func (r *Registry) CollectAll(ctx context.Context, cfg models.CollectConfig) []*models.CollectResult {
	r.mu.RLock()
	collectors := make([]models.Collector, 0, len(r.collectors))
	for _, c := range r.collectors {
		collectors = append(collectors, c)
	}
	r.mu.RUnlock()

	results := make([]*models.CollectResult, 0, len(collectors))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, c := range collectors {
		wg.Add(1)
		go func(col models.Collector) {
			defer wg.Done()
			result := r.runCollector(ctx, col, cfg)
			mu.Lock()
			results = append(results, result)
			mu.Unlock()
		}(c)
	}

	wg.Wait()
	return results
}

func (r *Registry) runCollector(ctx context.Context, c models.Collector, cfg models.CollectConfig) *models.CollectResult {
	logger := r.logger.With("collector", c.ID())

	// Step 1: Auto-detect
	detectResult, err := c.AutoDetect(ctx)
	if err != nil {
		logger.Warn("auto-detect failed", "error", err)
		return &models.CollectResult{
			CollectorID:      c.ID(),
			CollectorVersion: c.Version(),
			Timestamp:        time.Now().UTC(),
			Status:           models.StatusFailed,
			Errors: []models.CollectError{{
				Code:    models.ErrParseError,
				Message: fmt.Sprintf("auto-detect failed: %v", err),
			}},
		}
	}

	if !detectResult.Detected {
		logger.Debug("environment not detected, skipping")
		return &models.CollectResult{
			CollectorID:      c.ID(),
			CollectorVersion: c.Version(),
			Timestamp:        time.Now().UTC(),
			Status:           models.StatusSkipped,
			Errors: []models.CollectError{{
				Code:    models.ErrEnvNotDetected,
				Message: fmt.Sprintf("collector %s: target environment not detected on this host", c.ID()),
			}},
		}
	}

	// Step 2: Collect
	logger.Info("starting collection")
	start := time.Now()

	result, err := c.Collect(ctx, cfg)
	if err != nil {
		logger.Error("collection failed", "error", err, "duration", time.Since(start))
		return &models.CollectResult{
			CollectorID:      c.ID(),
			CollectorVersion: c.Version(),
			Timestamp:        time.Now().UTC(),
			Status:           models.StatusFailed,
			Duration:         time.Since(start),
			Errors: []models.CollectError{{
				Code:    models.ErrParseError,
				Message: fmt.Sprintf("collection error: %v", err),
			}},
		}
	}

	logger.Info("collection completed",
		"status", result.Status,
		"items", len(result.Items),
		"errors", len(result.Errors),
		"duration", result.Duration,
	)
	return result
}
