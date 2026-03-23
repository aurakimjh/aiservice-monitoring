package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LocalBackend stores evidence files on the local filesystem.
// Writes are atomic (temp file + rename) to prevent partial reads.
// Metadata is stored in sidecar .meta files alongside data files.
type LocalBackend struct {
	basePath string
	tmpDir   string
}

// NewLocalBackend creates a local filesystem storage backend.
// It creates the base directory and a .tmp subdirectory if they don't exist.
func NewLocalBackend(cfg LocalConfig) (*LocalBackend, error) {
	if cfg.BasePath == "" {
		return nil, fmt.Errorf("local storage base-path is required")
	}

	abs, err := filepath.Abs(cfg.BasePath)
	if err != nil {
		return nil, fmt.Errorf("resolve base-path: %w", err)
	}

	tmpDir := filepath.Join(abs, ".tmp")
	if err := os.MkdirAll(tmpDir, 0750); err != nil {
		return nil, fmt.Errorf("create tmp dir: %w", err)
	}

	return &LocalBackend{basePath: abs, tmpDir: tmpDir}, nil
}

func (b *LocalBackend) Type() string { return "local" }

func (b *LocalBackend) Put(ctx context.Context, key string, data []byte, metadata map[string]string) (string, error) {
	absPath := b.keyPath(key)

	if err := os.MkdirAll(filepath.Dir(absPath), 0750); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}

	// Atomic write: temp file → rename
	tmp, err := os.CreateTemp(b.tmpDir, "put-*")
	if err != nil {
		return "", fmt.Errorf("create temp: %w", err)
	}
	tmpName := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return "", fmt.Errorf("write temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return "", fmt.Errorf("close temp: %w", err)
	}
	if err := os.Rename(tmpName, absPath); err != nil {
		os.Remove(tmpName)
		return "", fmt.Errorf("rename: %w", err)
	}

	// Write sidecar metadata
	if len(metadata) > 0 {
		if err := b.writeMeta(absPath, metadata); err != nil {
			// Non-fatal: data is stored, metadata write failed
			_ = err
		}
	}

	return "file://" + filepath.ToSlash(absPath), nil
}

func (b *LocalBackend) PutStream(ctx context.Context, key string, r io.Reader, size int64, metadata map[string]string) (string, error) {
	data, err := io.ReadAll(io.LimitReader(r, size+1))
	if err != nil {
		return "", fmt.Errorf("read stream: %w", err)
	}
	return b.Put(ctx, key, data, metadata)
}

func (b *LocalBackend) Get(ctx context.Context, key string) ([]byte, error) {
	data, err := os.ReadFile(b.keyPath(key))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("object not found: %s", key)
		}
		return nil, fmt.Errorf("read: %w", err)
	}
	return data, nil
}

func (b *LocalBackend) List(ctx context.Context, prefix string) ([]StorageEntry, error) {
	searchDir := b.keyPath(prefix)
	var entries []StorageEntry

	err := filepath.WalkDir(searchDir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip inaccessible
		}
		if d.IsDir() || strings.HasSuffix(p, ".meta") {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		rel, _ := filepath.Rel(b.basePath, p)
		entry := StorageEntry{
			Key:          filepath.ToSlash(rel),
			Size:         info.Size(),
			LastModified: info.ModTime(),
		}

		// Try to read sidecar metadata
		if meta, err := b.readMeta(p); err == nil {
			entry.Metadata = meta
		}

		entries = append(entries, entry)
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("walk: %w", err)
	}

	return entries, nil
}

func (b *LocalBackend) Delete(ctx context.Context, key string) error {
	absPath := b.keyPath(key)
	os.Remove(absPath + ".meta") // remove sidecar if exists
	if err := os.Remove(absPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete: %w", err)
	}
	return nil
}

func (b *LocalBackend) Purge(ctx context.Context, prefix string, olderThan time.Time) (int, error) {
	searchDir := b.basePath
	if prefix != "" {
		searchDir = b.keyPath(prefix)
	}

	deleted := 0
	err := filepath.WalkDir(searchDir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		// Skip .tmp directory
		if strings.Contains(p, string(filepath.Separator)+".tmp"+string(filepath.Separator)) {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		if info.ModTime().Before(olderThan) {
			if os.Remove(p) == nil {
				deleted++
			}
			// Also remove sidecar
			os.Remove(p + ".meta")
		}
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return deleted, fmt.Errorf("purge walk: %w", err)
	}

	// Clean up empty directories (bottom-up)
	b.removeEmptyDirs(searchDir)

	return deleted, nil
}

func (b *LocalBackend) Health(ctx context.Context) error {
	probe := filepath.Join(b.tmpDir, ".health-probe")
	if err := os.WriteFile(probe, []byte("ok"), 0640); err != nil {
		return fmt.Errorf("local storage not writable: %w", err)
	}
	os.Remove(probe)
	return nil
}

// ── helpers ──

func (b *LocalBackend) keyPath(key string) string {
	return filepath.Join(b.basePath, filepath.FromSlash(key))
}

func (b *LocalBackend) writeMeta(dataPath string, metadata map[string]string) error {
	data, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	return os.WriteFile(dataPath+".meta", data, 0640)
}

func (b *LocalBackend) readMeta(dataPath string) (map[string]string, error) {
	data, err := os.ReadFile(dataPath + ".meta")
	if err != nil {
		return nil, err
	}
	var meta map[string]string
	return meta, json.Unmarshal(data, &meta)
}

func (b *LocalBackend) removeEmptyDirs(root string) {
	// Walk bottom-up: collect dirs, then try removing from deepest first
	var dirs []string
	filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && p != b.basePath && p != b.tmpDir {
			dirs = append(dirs, p)
		}
		return nil
	})
	// Remove in reverse order (deepest first)
	for i := len(dirs) - 1; i >= 0; i-- {
		os.Remove(dirs[i]) // fails silently if not empty
	}
}
