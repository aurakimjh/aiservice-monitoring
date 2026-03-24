package middleware

import (
	"context"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestCollectorInterface(t *testing.T) {
	c := New()

	if c.ID() != "middleware" {
		t.Errorf("expected ID='middleware', got %q", c.ID())
	}
	if c.Version() != "1.0.0" {
		t.Errorf("expected Version='1.0.0', got %q", c.Version())
	}
	platforms := c.SupportedPlatforms()
	if len(platforms) == 0 {
		t.Error("SupportedPlatforms should not be empty")
	}
	schemas := c.OutputSchemas()
	if len(schemas) == 0 {
		t.Error("OutputSchemas should not be empty")
	}
}

func TestAutoDetect(t *testing.T) {
	c := New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	// AutoDetect may or may not find a runtime; just ensure it doesn't panic.
	t.Logf("AutoDetect result: detected=%v details=%v", result.Detected, result.Details)
}

func TestCollect_NoEnv(t *testing.T) {
	c := New()
	cfg := models.CollectConfig{
		Hostname: "test-host",
		Extra:    map[string]string{"language": "go"},
	}
	result, err := c.Collect(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if result.CollectorID != "middleware" {
		t.Errorf("unexpected CollectorID: %q", result.CollectorID)
	}
	// Go self-collection should always produce at least one item.
	if len(result.Items) == 0 {
		t.Error("expected at least 1 item for Go self-collection")
	}
	t.Logf("Collect status=%s items=%d errors=%d", result.Status, len(result.Items), len(result.Errors))
}

func TestGoroutineStats(t *testing.T) {
	cfg := models.CollectConfig{}
	gs := collectGoroutineStats(cfg)
	if gs == nil {
		t.Fatal("collectGoroutineStats returned nil")
	}
	if gs.Current <= 0 {
		t.Errorf("goroutine count should be > 0, got %d", gs.Current)
	}
	if gs.LeakThreshold <= 0 {
		t.Error("leak threshold should be > 0")
	}
	t.Logf("goroutines: current=%d baseline=%d threshold=%d leak=%v",
		gs.Current, gs.Baseline, gs.LeakThreshold, gs.LeakSuspected)
}

func TestGoMemStats(t *testing.T) {
	ms := collectGoMemStats()
	if ms == nil {
		t.Fatal("collectGoMemStats returned nil")
	}
	if ms.AllocMB <= 0 {
		t.Error("AllocMB should be > 0")
	}
	if ms.SysMB <= 0 {
		t.Error("SysMB should be > 0")
	}
	t.Logf("mem: alloc=%.2fMB sys=%.2fMB numGC=%d", ms.AllocMB, ms.SysMB, ms.NumGC)
}

func TestEvaluateConnPoolLeak_NoLeak(t *testing.T) {
	cp := ConnPoolData{
		Name:        "test-pool",
		Vendor:      "hikaricp",
		ActiveConns: 5,
		IdleConns:   5,
		MaxConns:    20,
		WaitCount:   0,
	}
	evaluateConnPoolLeak(&cp)
	if cp.LeakSuspected {
		t.Error("expected no leak when utilization is 25%")
	}
}

func TestEvaluateConnPoolLeak_HighUtilization(t *testing.T) {
	cp := ConnPoolData{
		Name:        "test-pool",
		Vendor:      "hikaricp",
		ActiveConns: 19,
		IdleConns:   1,
		MaxConns:    20,
		WaitCount:   0,
	}
	evaluateConnPoolLeak(&cp)
	if !cp.LeakSuspected {
		t.Error("expected leak suspected at 95% utilization")
	}
}

func TestEvaluateConnPoolLeak_PendingWaits(t *testing.T) {
	cp := ConnPoolData{
		Name:        "test-pool",
		Vendor:      "hikaricp",
		ActiveConns: 10,
		IdleConns:   0,
		MaxConns:    20,
		WaitCount:   3,
	}
	evaluateConnPoolLeak(&cp)
	if !cp.LeakSuspected {
		t.Error("expected leak suspected when wait_count > 0")
	}
}

func TestEvaluateConnPoolAlerts_TriggerWarning(t *testing.T) {
	pools := []ConnPoolData{
		{
			Name:        "hikaricp-primary",
			Vendor:      "hikaricp",
			ActiveConns: 18,
			IdleConns:   2,
			MaxConns:    20,
			WaitCount:   0,
			Utilization: 0.90,
		},
	}
	alerts := EvaluateConnPoolAlerts(pools)
	if len(alerts) == 0 {
		t.Error("expected at least one alert for 90% utilization")
	}
	for _, a := range alerts {
		t.Logf("alert: id=%s severity=%s message=%s", a.AlertID, a.Severity, a.Message)
	}
}

func TestDefaultConnPoolAlertRules(t *testing.T) {
	if len(DefaultConnPoolAlertRules) == 0 {
		t.Error("DefaultConnPoolAlertRules should not be empty")
	}
	for _, r := range DefaultConnPoolAlertRules {
		if r.Name == "" {
			t.Error("rule name should not be empty")
		}
		if len(r.Actions) == 0 {
			t.Errorf("rule %q should have at least one action", r.Name)
		}
	}
}

func TestDetectLanguages(t *testing.T) {
	// DetectLanguages always returns at least Go self-detection.
	langs := DetectLanguages()
	if len(langs) == 0 {
		t.Error("DetectLanguages should return at least Go self-detection")
	}
	foundGo := false
	for _, l := range langs {
		if l.Language == "go" {
			foundGo = true
		}
	}
	if !foundGo {
		t.Error("expected go language in detected list")
	}
}
