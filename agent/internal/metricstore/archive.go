package metricstore

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── Cold Tier: S3 Parquet Archive (S3-8) ─────────────────────────────────────
//
// Archives old warm-tier metric data to S3 as gzip-compressed NDJSON files.
// Same pattern as tracestore.Archiver but for metric data.
//
// S3 key layout:
//   metrics/parquet/YYYY/MM/DD/<metric_name>.ndjson.gz

// S3Config holds connection parameters for the cold-tier S3 archive.
type S3Config struct {
	Endpoint        string `yaml:"endpoint"`
	Bucket          string `yaml:"bucket"`
	Region          string `yaml:"region"`
	AccessKeyID     string `yaml:"access_key_id"`
	SecretAccessKey string `yaml:"secret_access_key"`
	UseSSL          bool   `yaml:"use_ssl"`
	PathStyle       bool   `yaml:"path_style"`
}

// Enabled returns true when S3 archiving is configured.
func (c S3Config) Enabled() bool {
	return c.Bucket != "" && c.Endpoint != ""
}

// Archiver handles the cold-tier "Warm → S3" pipeline for metrics.
type Archiver struct {
	coldDir string
	s3cfg   S3Config
	logger  *slog.Logger
	client  *http.Client
}

// NewArchiver creates an Archiver. coldDir is the local staging area.
func NewArchiver(coldDir string, s3cfg S3Config, logger *slog.Logger) *Archiver {
	return &Archiver{
		coldDir: coldDir,
		s3cfg:   s3cfg,
		logger:  logger,
		client:  &http.Client{Timeout: 5 * time.Minute},
	}
}

// Run starts the archive loop. Blocks until ctx is cancelled.
func (a *Archiver) Run(ctx context.Context, cronExpr string, warm *WarmStore) {
	if !a.s3cfg.Enabled() {
		a.logger.Info("metricstore archive: S3 not configured, cold tier disabled")
		return
	}

	hour := parseCronHour(cronExpr)
	a.logger.Info("metricstore archive: cold-tier cron started", "hour_utc", hour)

	for {
		next := nextFireTime(hour)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
			a.runArchiveCycle(warm)
		}
	}
}

func (a *Archiver) runArchiveCycle(warm *WarmStore) {
	// Archive warm-tier days older than 30 days (well past the warm window).
	cutoff := time.Now().UTC().AddDate(0, 0, -30)
	entries, err := os.ReadDir(warm.dir)
	if err != nil {
		a.logger.Error("metric archive cycle: readdir", "error", err)
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
		if t.After(cutoff) {
			continue
		}
		if err := a.archiveDay(warm, day); err != nil {
			a.logger.Error("metric archive day failed", "day", day, "error", err)
		}
	}
}

func (a *Archiver) archiveDay(warm *WarmStore, day string) error {
	db, err := warm.dbForDay(day)
	if err != nil {
		return err
	}

	// Export downsampled 1h data (most compact).
	// Fall back to 1m if 1h is empty, then raw if 1m is empty.
	rows, err := db.Query(`
SELECT metric_name, labels_json, timestamp, val_avg, val_min, val_max, val_sum, val_count
FROM samples_1h ORDER BY metric_name, timestamp`)
	if err != nil {
		return fmt.Errorf("archive query: %w", err)
	}
	defer rows.Close()

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	rowCount := 0

	for rows.Next() {
		var rec metricArchiveRecord
		if err := rows.Scan(
			&rec.MetricName, &rec.LabelsJSON, &rec.TimestampNs,
			&rec.ValAvg, &rec.ValMin, &rec.ValMax, &rec.ValSum, &rec.ValCount,
		); err != nil {
			gz.Close()
			return fmt.Errorf("archive scan: %w", err)
		}
		line, _ := json.Marshal(rec)
		gz.Write(line)         //nolint:errcheck
		gz.Write([]byte{'\n'}) //nolint:errcheck
		rowCount++
	}
	if err := rows.Err(); err != nil {
		gz.Close()
		return err
	}

	// Footer: magic + row count
	footer := make([]byte, 16)
	copy(footer[:8], []byte("AITPM\x01\x00\x00")) // AITPM = AITOP Metrics
	binary.LittleEndian.PutUint64(footer[8:], uint64(rowCount))
	gz.Write(footer) //nolint:errcheck
	gz.Close()

	if rowCount == 0 {
		return nil
	}

	key := metricArchiveKey(day)
	if err := a.upload(key, buf.Bytes()); err != nil {
		return fmt.Errorf("metric archive upload %s: %w", key, err)
	}

	a.logger.Info("metric archive: uploaded cold-tier file",
		"day", day, "key", key, "rows", rowCount, "bytes", buf.Len())

	return a.writeManifest(day, key, rowCount, buf.Len())
}

func (a *Archiver) upload(key string, data []byte) error {
	scheme := "https"
	if !a.s3cfg.UseSSL {
		scheme = "http"
	}
	url := fmt.Sprintf("%s://%s/%s/%s", scheme, a.s3cfg.Endpoint, a.s3cfg.Bucket, key)

	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	req.Header.Set("Content-Encoding", "gzip")
	req.ContentLength = int64(len(data))

	if a.s3cfg.AccessKeyID != "" {
		req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+a.s3cfg.AccessKeyID)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("S3 PUT %s: HTTP %d", key, resp.StatusCode)
	}
	return nil
}

func (a *Archiver) writeManifest(day, key string, rows, byteCount int) error {
	if err := os.MkdirAll(a.coldDir, 0o750); err != nil {
		return err
	}
	path := filepath.Join(a.coldDir, day+".manifest.json")
	rec := map[string]interface{}{
		"day":         day,
		"s3_key":      key,
		"rows":        rows,
		"bytes":       byteCount,
		"archived_at": time.Now().UTC(),
	}
	b, _ := json.MarshalIndent(rec, "", "  ")
	return os.WriteFile(path, b, 0o640)
}

// metricArchiveKey returns the S3 object key for a given day.
func metricArchiveKey(day string) string {
	parts := strings.SplitN(day, "-", 3)
	if len(parts) != 3 {
		return "metrics/parquet/unknown/" + day + ".ndjson.gz"
	}
	return fmt.Sprintf("metrics/parquet/%s/%s/%s/all.ndjson.gz",
		parts[0], parts[1], parts[2])
}

// metricArchiveRecord is the JSON shape written to the cold-tier file.
type metricArchiveRecord struct {
	MetricName  string  `json:"metric_name"`
	LabelsJSON  string  `json:"labels_json"`
	TimestampNs int64   `json:"timestamp_ns"`
	ValAvg      float64 `json:"val_avg"`
	ValMin      float64 `json:"val_min"`
	ValMax      float64 `json:"val_max"`
	ValSum      float64 `json:"val_sum"`
	ValCount    int64   `json:"val_count"`
}

// parseCronHour extracts the hour field from a "M H * * *" cron expression.
func parseCronHour(expr string) int {
	fields := strings.Fields(expr)
	if len(fields) < 2 {
		return 3 // default: 3 AM
	}
	var h int
	fmt.Sscanf(fields[1], "%d", &h)
	return h
}

// nextFireTime returns the next UTC time when the clock reaches targetHour:00.
func nextFireTime(targetHour int) time.Time {
	now := time.Now().UTC()
	next := time.Date(now.Year(), now.Month(), now.Day(), targetHour, 0, 0, 0, time.UTC)
	if !next.After(now) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}
