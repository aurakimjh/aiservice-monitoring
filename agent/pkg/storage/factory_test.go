package storage

import (
	"testing"
)

func TestNewFromConfig_Local(t *testing.T) {
	cfg := StorageConfig{
		Type:  "local",
		Local: LocalConfig{BasePath: t.TempDir()},
	}
	b, err := NewFromConfig(cfg, nil)
	if err != nil {
		t.Fatalf("NewFromConfig local: %v", err)
	}
	if b.Type() != "local" {
		t.Errorf("expected local, got %s", b.Type())
	}
}

func TestNewFromConfig_UnknownType(t *testing.T) {
	cfg := StorageConfig{Type: "redis"}
	_, err := NewFromConfig(cfg, nil)
	if err == nil {
		t.Error("expected error for unknown type")
	}
}

func TestNewFromConfig_EmptyType(t *testing.T) {
	cfg := StorageConfig{}
	_, err := NewFromConfig(cfg, nil)
	if err == nil {
		t.Error("expected error for empty type")
	}
}

func TestNewFromConfig_LocalMissingPath(t *testing.T) {
	cfg := StorageConfig{Type: "local", Local: LocalConfig{}}
	_, err := NewFromConfig(cfg, nil)
	if err == nil {
		t.Error("expected error for missing base-path")
	}
}
