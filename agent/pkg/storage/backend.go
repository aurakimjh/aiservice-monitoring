// Package storage defines the StorageBackend interface and implementations
// for persisting evidence files (collect results, terminal logs, diagnostics).
//
// Supported backends:
//   - "local"  — filesystem-based storage (dev/test/Lite mode)
//   - "s3"     — S3-compatible object storage (AWS S3, MinIO)
//   - "both"   — DualBackend: primary S3 + secondary local cache
package storage

import (
	"context"
	"io"
	"time"
)

// StorageBackend is the interface for evidence file storage.
// Implementations must be safe for concurrent use.
type StorageBackend interface {
	// Put stores data under the given key with optional metadata.
	// Returns a reference URL (e.g., "s3://bucket/key" or "file:///path/key").
	Put(ctx context.Context, key string, data []byte, metadata map[string]string) (ref string, err error)

	// PutStream stores data from a reader. Use this for large payloads.
	PutStream(ctx context.Context, key string, r io.Reader, size int64, metadata map[string]string) (ref string, err error)

	// Get retrieves the data stored under the given key.
	Get(ctx context.Context, key string) ([]byte, error)

	// List returns entries matching the given key prefix.
	List(ctx context.Context, prefix string) ([]StorageEntry, error)

	// Delete removes the object at the given key.
	Delete(ctx context.Context, key string) error

	// Purge removes objects under prefix older than the given time.
	// Returns the number of deleted objects.
	Purge(ctx context.Context, prefix string, olderThan time.Time) (deletedCount int, err error)

	// Type returns the backend type identifier ("s3", "local", or "dual").
	Type() string

	// Health checks whether the backend is operational.
	Health(ctx context.Context) error
}

// StorageEntry represents a single stored object's metadata.
type StorageEntry struct {
	Key          string
	Size         int64
	LastModified time.Time
	Metadata     map[string]string
}
