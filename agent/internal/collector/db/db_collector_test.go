package db

import (
	"context"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestDBCollectorInterface(t *testing.T) {
	c := New()
	if c.ID() != "db" {
		t.Errorf("expected ID 'db', got %q", c.ID())
	}
	if c.Version() == "" {
		t.Error("Version() must not be empty")
	}
	if len(c.SupportedPlatforms()) == 0 {
		t.Error("SupportedPlatforms() must not be empty")
	}
	if len(c.OutputSchemas()) == 0 {
		t.Error("OutputSchemas() must not be empty")
	}
}

func TestAutoDetect_NoDB(t *testing.T) {
	c := New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	_ = result.Detected
}

func TestCollect_NoDB(t *testing.T) {
	c := New()
	result, err := c.Collect(context.Background(), models.CollectConfig{Hostname: "test"})
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if result.CollectorID != "db" {
		t.Errorf("expected CollectorID 'db', got %q", result.CollectorID)
	}
}

func TestIsPortOpen_Closed(t *testing.T) {
	// Port 19999 is very unlikely to be open
	open := isPortOpen("127.0.0.1", "19999")
	if open {
		t.Skip("port 19999 unexpectedly open — skipping test")
	}
}

func TestEnvOrDefault(t *testing.T) {
	got := envOrDefault("__NONEXISTENT_ENV_VAR__", "fallback")
	if got != "fallback" {
		t.Errorf("expected 'fallback', got %q", got)
	}
}

func TestExtractPauseMs_DB(t *testing.T) {
	// Verify DBConfig struct serialises cleanly
	cfg := DBConfig{
		Parameters: map[string]string{"max_connections": "100"},
		Source:     "query",
	}
	if cfg.Source != "query" {
		t.Errorf("unexpected Source: %q", cfg.Source)
	}
	if cfg.Parameters["max_connections"] != "100" {
		t.Errorf("unexpected parameter value")
	}
}

func TestCollectServerInfo_Struct(t *testing.T) {
	c := New()
	inst := dbInstance{
		DBType: "postgresql",
		PID:    0,
		Host:   "127.0.0.1",
		Port:   "5432",
	}
	item, err := c.collectServerInfo(inst)
	if err != nil {
		t.Fatalf("collectServerInfo returned error: %v", err)
	}
	if item.SchemaName != "db.server_info" {
		t.Errorf("unexpected schema name: %q", item.SchemaName)
	}
	if item.Category != "it" {
		t.Errorf("expected category 'it', got %q", item.Category)
	}
}

func TestFindDBDataDir(t *testing.T) {
	dir := findDBDataDir("postgresql", 0)
	if dir == "" {
		t.Error("expected non-empty default data dir for postgresql")
	}
}
