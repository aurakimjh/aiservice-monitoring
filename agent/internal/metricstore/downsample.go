package metricstore

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"time"
)

// ── Downsampling Cron (S3-5) ─────────────────────────────────────────────────
//
// Background job that compacts raw samples into 1-minute and 1-hour aggregates.
//
// Schedule:
//   - Every 6 hours: downsample yesterday's raw → 1m
//   - Every 6 hours: downsample 7-day-old 1m → 1h
//   - After 1m downsample: purge raw samples for that day (save disk)
//   - After 1h downsample: purge 1m samples for that day (optional, keep for now)

// Downsampler runs periodic downsampling on the warm store.
type Downsampler struct {
	warm   *WarmStore
	logger *slog.Logger
}

// NewDownsampler creates a downsampler.
func NewDownsampler(warm *WarmStore, logger *slog.Logger) *Downsampler {
	return &Downsampler{warm: warm, logger: logger}
}

// Run starts the downsampling loop. Blocks until ctx is cancelled.
func (d *Downsampler) Run(ctx context.Context) {
	// Run immediately on startup, then every 6 hours.
	d.runCycle()

	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			d.logger.Info("downsampler stopped")
			return
		case <-ticker.C:
			d.runCycle()
		}
	}
}

func (d *Downsampler) runCycle() {
	now := time.Now().UTC()

	// 1m downsample: process all day files older than 1 day.
	d.downsample1mAll(now.AddDate(0, 0, -1))

	// 1h downsample: process all day files older than 7 days.
	d.downsample1hAll(now.AddDate(0, 0, -7))
}

func (d *Downsampler) downsample1mAll(before time.Time) {
	entries, err := os.ReadDir(d.warm.dir)
	if err != nil {
		d.logger.Warn("downsample: readdir", "error", err)
		return
	}

	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		day := strings.TrimSuffix(e.Name(), ".db")
		t, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		if t.After(before) {
			continue // too recent
		}

		if err := d.warm.Downsample1m(day); err != nil {
			d.logger.Warn("downsample 1m failed", "day", day, "error", err)
			continue
		}

		// Purge raw samples after successful 1m downsample.
		if err := d.warm.PurgeRawAfterDownsample(day); err != nil {
			d.logger.Warn("purge raw after downsample failed", "day", day, "error", err)
		} else {
			d.logger.Debug("downsample 1m complete + raw purged", "day", day)
		}
	}
}

func (d *Downsampler) downsample1hAll(before time.Time) {
	entries, err := os.ReadDir(d.warm.dir)
	if err != nil {
		return
	}

	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		day := strings.TrimSuffix(e.Name(), ".db")
		t, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		if t.After(before) {
			continue
		}

		if err := d.warm.Downsample1h(day); err != nil {
			d.logger.Warn("downsample 1h failed", "day", day, "error", err)
		} else {
			d.logger.Debug("downsample 1h complete", "day", day)
		}
	}
}
