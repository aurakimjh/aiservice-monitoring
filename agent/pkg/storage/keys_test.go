package storage

import (
	"testing"
	"time"
)

func TestEvidenceKey(t *testing.T) {
	ts := time.Date(2026, 3, 22, 10, 30, 0, 0, time.UTC)
	key := EvidenceKey("agent-001", "it-os", "cr-001", ts)
	expected := "evidence/agent-001/2026-03-22/it-os/cr-001.json.gz"
	if key != expected {
		t.Errorf("expected %s, got %s", expected, key)
	}
}

func TestTerminalLogKey(t *testing.T) {
	ts := time.Date(2026, 3, 22, 14, 0, 0, 0, time.UTC)
	key := TerminalLogKey("agent-001", "sess-001", ts)
	expected := "terminal-logs/agent-001/2026-03-22/sess-001.log.gz"
	if key != expected {
		t.Errorf("expected %s, got %s", expected, key)
	}
}

func TestDiagnosticKey(t *testing.T) {
	ts := time.Date(2026, 3, 22, 9, 0, 0, 0, time.UTC)
	key := DiagnosticKey("agent-001", "diag-001", ts)
	expected := "diagnostics/agent-001/2026-03-22/diag-001.json.gz"
	if key != expected {
		t.Errorf("expected %s, got %s", expected, key)
	}
}
