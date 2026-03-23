package storage

import (
	"fmt"
	"log/slog"
)

// NewFromConfig creates a StorageBackend based on the given configuration.
// The logger is used by DualBackend for secondary-failure warnings; it may be nil
// for "s3" and "local" types.
func NewFromConfig(cfg StorageConfig, logger *slog.Logger) (StorageBackend, error) {
	switch cfg.Type {
	case "local":
		return NewLocalBackend(cfg.Local)
	case "s3":
		return NewS3Backend(cfg.S3)
	case "both":
		s3b, err := NewS3Backend(cfg.S3)
		if err != nil {
			return nil, fmt.Errorf("dual backend s3: %w", err)
		}
		local, err := NewLocalBackend(cfg.Local)
		if err != nil {
			return nil, fmt.Errorf("dual backend local: %w", err)
		}
		if logger == nil {
			logger = slog.Default()
		}
		return NewDualBackend(s3b, local, logger), nil
	case "":
		return nil, fmt.Errorf("storage.type is required (must be s3, local, or both)")
	default:
		return nil, fmt.Errorf("unknown storage type %q (must be s3, local, or both)", cfg.Type)
	}
}
