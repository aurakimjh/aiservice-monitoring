package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/storage"
)

// startPurgeScheduler runs a background goroutine that periodically purges
// old evidence files from the storage backend.
func startPurgeScheduler(ctx context.Context, store storage.StorageBackend, retentionDays int, logger *slog.Logger) {
	if retentionDays <= 0 {
		logger.Info("purge scheduler disabled (retention-days <= 0)")
		return
	}

	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	logger.Info("purge scheduler started", "retention_days", retentionDays, "interval", "6h")

	for {
		select {
		case <-ctx.Done():
			logger.Info("purge scheduler stopped")
			return
		case <-ticker.C:
			cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)
			count, err := store.Purge(ctx, "", cutoff)
			if err != nil {
				logger.Error("purge failed", "error", err)
			} else if count > 0 {
				logger.Info("purge completed", "deleted", count, "cutoff", cutoff.Format(time.RFC3339))
			}
		}
	}
}
