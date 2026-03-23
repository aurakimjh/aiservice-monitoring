package storage

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"
)

// DualBackend writes to both a primary (S3) and secondary (Local) backend.
// Primary Put must succeed; secondary failure is logged as a warning.
// Get falls back to secondary if primary fails.
type DualBackend struct {
	primary   StorageBackend
	secondary StorageBackend
	logger    *slog.Logger
}

// NewDualBackend creates a dual-write storage backend.
func NewDualBackend(primary, secondary StorageBackend, logger *slog.Logger) *DualBackend {
	return &DualBackend{
		primary:   primary,
		secondary: secondary,
		logger:    logger,
	}
}

func (b *DualBackend) Type() string { return "dual" }

func (b *DualBackend) Put(ctx context.Context, key string, data []byte, metadata map[string]string) (string, error) {
	ref, err := b.primary.Put(ctx, key, data, metadata)
	if err != nil {
		return "", fmt.Errorf("primary put: %w", err)
	}

	if _, err := b.secondary.Put(ctx, key, data, metadata); err != nil {
		b.logger.Warn("secondary put failed", "key", key, "error", err)
	}

	return ref, nil
}

func (b *DualBackend) PutStream(ctx context.Context, key string, r io.Reader, size int64, metadata map[string]string) (string, error) {
	// Buffer the stream so both backends can read it
	data, err := io.ReadAll(io.LimitReader(r, size+1))
	if err != nil {
		return "", fmt.Errorf("read stream: %w", err)
	}
	return b.Put(ctx, key, data, metadata)
}

func (b *DualBackend) Get(ctx context.Context, key string) ([]byte, error) {
	data, err := b.primary.Get(ctx, key)
	if err == nil {
		return data, nil
	}

	b.logger.Warn("primary get failed, falling back to secondary", "key", key, "error", err)
	return b.secondary.Get(ctx, key)
}

func (b *DualBackend) List(ctx context.Context, prefix string) ([]StorageEntry, error) {
	return b.primary.List(ctx, prefix)
}

func (b *DualBackend) Delete(ctx context.Context, key string) error {
	err := b.primary.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("primary delete: %w", err)
	}

	if err := b.secondary.Delete(ctx, key); err != nil {
		b.logger.Warn("secondary delete failed", "key", key, "error", err)
	}

	return nil
}

func (b *DualBackend) Purge(ctx context.Context, prefix string, olderThan time.Time) (int, error) {
	count1, err := b.primary.Purge(ctx, prefix, olderThan)
	if err != nil {
		return count1, fmt.Errorf("primary purge: %w", err)
	}

	count2, err := b.secondary.Purge(ctx, prefix, olderThan)
	if err != nil {
		b.logger.Warn("secondary purge failed", "error", err)
	}

	return count1 + count2, nil
}

func (b *DualBackend) Health(ctx context.Context) error {
	if err := b.primary.Health(ctx); err != nil {
		return fmt.Errorf("primary health: %w", err)
	}

	if err := b.secondary.Health(ctx); err != nil {
		b.logger.Warn("secondary health check failed", "error", err)
	}

	return nil
}
