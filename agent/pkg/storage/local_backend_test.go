package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestLocal(t *testing.T) *LocalBackend {
	t.Helper()
	b, err := NewLocalBackend(LocalConfig{BasePath: t.TempDir()})
	if err != nil {
		t.Fatalf("NewLocalBackend: %v", err)
	}
	return b
}

func TestLocalBackend_PutAndGet(t *testing.T) {
	b := newTestLocal(t)
	ctx := context.Background()

	ref, err := b.Put(ctx, "test/file.json", []byte(`{"ok":true}`), map[string]string{"agent": "a1"})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if !strings.HasPrefix(ref, "file://") {
		t.Errorf("ref should start with file://, got %s", ref)
	}

	data, err := b.Get(ctx, "test/file.json")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(data) != `{"ok":true}` {
		t.Errorf("expected {\"ok\":true}, got %s", data)
	}
}

func TestLocalBackend_PutStream(t *testing.T) {
	b := newTestLocal(t)
	ctx := context.Background()

	content := "streaming data"
	ref, err := b.PutStream(ctx, "stream/data.bin", strings.NewReader(content), int64(len(content)), nil)
	if err != nil {
		t.Fatalf("PutStream: %v", err)
	}
	if ref == "" {
		t.Error("expected non-empty ref")
	}

	data, err := b.Get(ctx, "stream/data.bin")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(data) != content {
		t.Errorf("expected %q, got %q", content, data)
	}
}

func TestLocalBackend_List(t *testing.T) {
	b := newTestLocal(t)
	ctx := context.Background()

	b.Put(ctx, "evidence/a1/file1.json", []byte("1"), nil)
	b.Put(ctx, "evidence/a1/file2.json", []byte("2"), nil)
	b.Put(ctx, "logs/a1/log1.txt", []byte("3"), nil)

	entries, err := b.List(ctx, "evidence")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 2 {
		t.Errorf("expected 2 entries, got %d", len(entries))
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Key, "evidence/") {
			t.Errorf("unexpected key: %s", e.Key)
		}
	}
}

func TestLocalBackend_Delete(t *testing.T) {
	b := newTestLocal(t)
	ctx := context.Background()

	b.Put(ctx, "del/file.json", []byte("data"), map[string]string{"k": "v"})

	if err := b.Delete(ctx, "del/file.json"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err := b.Get(ctx, "del/file.json")
	if err == nil {
		t.Error("expected error after delete")
	}

	// Sidecar meta should also be deleted
	metaPath := filepath.Join(b.basePath, "del", "file.json.meta")
	if _, err := os.Stat(metaPath); !os.IsNotExist(err) {
		t.Error("expected meta file to be deleted")
	}
}

func TestLocalBackend_Purge(t *testing.T) {
	b := newTestLocal(t)
	ctx := context.Background()

	// Create files
	b.Put(ctx, "evidence/old.json", []byte("old"), nil)
	b.Put(ctx, "evidence/new.json", []byte("new"), nil)

	// Backdate the "old" file
	oldPath := filepath.Join(b.basePath, "evidence", "old.json")
	oldTime := time.Now().Add(-48 * time.Hour)
	os.Chtimes(oldPath, oldTime, oldTime)

	// Purge files older than 24 hours
	count, err := b.Purge(ctx, "evidence", time.Now().Add(-24*time.Hour))
	if err != nil {
		t.Fatalf("Purge: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 deleted, got %d", count)
	}

	// "new" should still exist
	if _, err := b.Get(ctx, "evidence/new.json"); err != nil {
		t.Error("new file should survive purge")
	}
}

func TestLocalBackend_Metadata(t *testing.T) {
	b := newTestLocal(t)
	ctx := context.Background()

	meta := map[string]string{"agent_id": "a1", "collector": "it-os"}
	b.Put(ctx, "meta/test.json", []byte("data"), meta)

	entries, err := b.List(ctx, "meta")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Metadata["agent_id"] != "a1" {
		t.Errorf("expected agent_id=a1, got %v", entries[0].Metadata)
	}
}

func TestLocalBackend_Health(t *testing.T) {
	b := newTestLocal(t)
	if err := b.Health(context.Background()); err != nil {
		t.Errorf("Health should pass: %v", err)
	}
}

func TestLocalBackend_GetNotFound(t *testing.T) {
	b := newTestLocal(t)
	_, err := b.Get(context.Background(), "nonexistent/file.json")
	if err == nil {
		t.Error("expected error for nonexistent key")
	}
}

func TestLocalBackend_Type(t *testing.T) {
	b := newTestLocal(t)
	if b.Type() != "local" {
		t.Errorf("expected 'local', got %q", b.Type())
	}
}
