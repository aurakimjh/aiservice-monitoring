package storage

import (
	"context"
	"log/slog"
	"os"
	"testing"
)

func newTestDual(t *testing.T) (*DualBackend, *LocalBackend, *LocalBackend) {
	t.Helper()
	primary, err := NewLocalBackend(LocalConfig{BasePath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	secondary, err := NewLocalBackend(LocalConfig{BasePath: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	return NewDualBackend(primary, secondary, logger), primary, secondary
}

func TestDualBackend_PutSucceedsBoth(t *testing.T) {
	dual, primary, secondary := newTestDual(t)
	ctx := context.Background()

	ref, err := dual.Put(ctx, "test/dual.json", []byte("data"), nil)
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	// Ref should come from primary (local)
	if ref == "" {
		t.Error("expected non-empty ref")
	}

	// Both should have the data
	d1, _ := primary.Get(ctx, "test/dual.json")
	d2, _ := secondary.Get(ctx, "test/dual.json")
	if string(d1) != "data" || string(d2) != "data" {
		t.Error("expected data in both backends")
	}
}

func TestDualBackend_GetFallback(t *testing.T) {
	dual, _, secondary := newTestDual(t)
	ctx := context.Background()

	// Write only to secondary (simulate primary missing the object)
	secondary.Put(ctx, "fallback/file.json", []byte("secondary-data"), nil)

	data, err := dual.Get(ctx, "fallback/file.json")
	if err != nil {
		t.Fatalf("Get fallback: %v", err)
	}
	if string(data) != "secondary-data" {
		t.Errorf("expected secondary-data, got %s", data)
	}
}

func TestDualBackend_DeleteBoth(t *testing.T) {
	dual, primary, secondary := newTestDual(t)
	ctx := context.Background()

	dual.Put(ctx, "del/file.json", []byte("data"), nil)
	if err := dual.Delete(ctx, "del/file.json"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := primary.Get(ctx, "del/file.json"); err == nil {
		t.Error("expected primary delete")
	}
	if _, err := secondary.Get(ctx, "del/file.json"); err == nil {
		t.Error("expected secondary delete")
	}
}

func TestDualBackend_Type(t *testing.T) {
	dual, _, _ := newTestDual(t)
	if dual.Type() != "dual" {
		t.Errorf("expected 'dual', got %q", dual.Type())
	}
}

func TestDualBackend_Health(t *testing.T) {
	dual, _, _ := newTestDual(t)
	if err := dual.Health(context.Background()); err != nil {
		t.Errorf("Health: %v", err)
	}
}
