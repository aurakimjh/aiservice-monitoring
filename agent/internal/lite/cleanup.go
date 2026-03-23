package lite

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

// CleanupResult holds the result of a cleanup operation.
type CleanupResult struct {
	Message      string   `json:"message"`
	DeletedPaths []string `json:"deleted_paths"`
	Errors       []string `json:"errors,omitempty"`
}

// Cleanup removes all Lite mode data: SQLite DB, evidence files, and temp directories.
func Cleanup(dataDir string, logger *slog.Logger) CleanupResult {
	result := CleanupResult{
		DeletedPaths: []string{},
		Errors:       []string{},
	}

	targets := []string{
		dataDir,
		filepath.Join(dataDir, ".tmp"),
	}

	// Also clean common Lite data locations
	for _, pattern := range []string{"*.db", "*.db-wal", "*.db-shm"} {
		matches, _ := filepath.Glob(filepath.Join(dataDir, pattern))
		targets = append(targets, matches...)
	}

	for _, target := range targets {
		if _, err := os.Stat(target); os.IsNotExist(err) {
			continue
		}
		if err := os.RemoveAll(target); err != nil {
			errMsg := fmt.Sprintf("failed to remove %s: %v", target, err)
			result.Errors = append(result.Errors, errMsg)
			logger.Warn("cleanup failed", "path", target, "error", err)
		} else {
			result.DeletedPaths = append(result.DeletedPaths, target)
			logger.Info("cleanup removed", "path", target)
		}
	}

	if len(result.Errors) == 0 {
		result.Message = fmt.Sprintf("Cleanup complete — %d paths removed", len(result.DeletedPaths))
	} else {
		result.Message = fmt.Sprintf("Cleanup partial — %d removed, %d errors", len(result.DeletedPaths), len(result.Errors))
	}

	return result
}
