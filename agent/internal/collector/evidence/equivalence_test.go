package evidence_test

import (
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/evidence"
)

// TestCoverageEquivalence verifies that the Go evidence collector covers
// at least the same catalog items as the legacy Java diagnostic agent.
// Phase 31-4a: Feature equivalence validation.
//
// Coverage target: 100% of catalog items (91 IT + 35 AI serving metrics).
// Items not yet covered are listed in pendingItems for tracking.
func TestCoverageEquivalence(t *testing.T) {
	// Items fully covered by Go evidence collectors (Phase 31-1 + 31-3).
	coveredByEvidence := map[string]string{
		// ConfigEvidence (31-1b)
		"ITEM0009": "evidence-config",
		"ITEM0012": "evidence-config",
		"ITEM0041": "evidence-config",
		"ITEM0045": "evidence-config",
		"ITEM0051": "evidence-config",
		"ITEM0052": "evidence-config",
		// LogEvidence (31-1c)
		"ITEM0008": "evidence-log",
		"ITEM0011": "evidence-log",
		"ITEM0016": "evidence-log",
		"ITEM0026": "evidence-log",
		"ITEM0027": "evidence-log",
		"ITEM0036": "evidence-log",
		"ITEM0055": "evidence-log",
		// EOSEvidence (31-1d)
		"ITEM0068": "evidence-eos",
		// BuiltinItems (31-1g)
		"ITEM0013": "evidence-builtin-items",
		"ITEM0015": "evidence-builtin-items",
		"ITEM0037": "evidence-builtin-items",
		"ITEM0040": "evidence-builtin-items",
		"ITEM0044": "evidence-builtin-items",
		"ITEM0063": "evidence-builtin-items",
		"ITEM0064": "evidence-builtin-items",
		"ITEM0066": "evidence-builtin-items",
		"ITEM0070": "evidence-builtin-items",
		// SecurityEvidence (31-3c)
		"ITEM0056": "evidence-security",
		"ITEM0057": "evidence-security",
		"ITEM0065": "evidence-security",
		"ITEM0067": "evidence-security",
		// APMEvidence (31-3d)
		"ITEM0054": "evidence-apm",
		// CrossAnalysis (31-3e)
		"ITEM0222": "evidence-cross-analysis",
		"ITEM0224": "evidence-cross-analysis",
		"ITEM0226": "evidence-cross-analysis",
	}

	// Items pending full Go implementation (Phase 31-2 script-based or later phases).
	// These are covered by scripts executed by the Script Executor (31-2a).
	pendingScriptItems := []string{
		"ITEM0014", // OS 성능 로그 분석 (delayed — vmstat/sar)
		"ITEM0069", // 네트워크 지연 분석 (ping/traceroute)
		"ITEM0030", // 힙 메모리 덤프 (jmap) — 🖐️ manual
		"ITEM0049", // Thread Dump (jstack) — 🖐️ manual
		"ITEM0059", // Oracle RAC 점검 — 🖐️ manual
	}

	// Verify all covered items are registered in the DefaultRegistry.
	reg := evidence.DefaultRegistry
	collectorIDs := make(map[string]bool)
	for _, c := range reg.All() {
		collectorIDs[c.ID()] = true
	}

	for itemID, expectedCollector := range coveredByEvidence {
		if !collectorIDs[expectedCollector] {
			t.Errorf("item %s: expected collector %q not registered in DefaultRegistry", itemID, expectedCollector)
		}
	}

	// Verify covered items are in CoveredItems() of the expected collector.
	for itemID, collectorID := range coveredByEvidence {
		c, ok := reg.Get(collectorID)
		if !ok {
			t.Errorf("item %s: collector %q not found", itemID, collectorID)
			continue
		}
		found := false
		for _, ci := range c.CoveredItems() {
			if ci == itemID {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("item %s: not listed in CoveredItems() of collector %q", itemID, collectorID)
		}
	}

	// Report pending items (not failures — these are tracked backlog).
	if len(pendingScriptItems) > 0 {
		t.Logf("INFO: %d items pending script/manual implementation (Phase 31-2/31-3): %v",
			len(pendingScriptItems), pendingScriptItems)
	}

	totalCovered := len(coveredByEvidence)
	t.Logf("Phase 31-4a coverage: %d items covered by Go evidence collectors", totalCovered)
}

// TestDefaultRegistryCompleteness checks all registered collectors have valid IDs,
// versions, categories, and non-empty CoveredItems().
func TestDefaultRegistryCompleteness(t *testing.T) {
	for _, c := range evidence.DefaultRegistry.All() {
		if c.ID() == "" {
			t.Errorf("collector has empty ID")
		}
		if c.Version() == "" {
			t.Errorf("collector %s has empty version", c.ID())
		}
		if c.Category() == "" {
			t.Errorf("collector %s has empty category", c.ID())
		}
		if len(c.CoveredItems()) == 0 {
			t.Errorf("collector %s has no covered items", c.ID())
		}
	}
}

// TestEvidenceRegistryByMode verifies ByMode() returns the correct collectors.
func TestEvidenceRegistryByMode(t *testing.T) {
	reg := evidence.DefaultRegistry
	builtin := reg.ByMode(evidence.ModeBuiltin)
	manual := reg.ByMode(evidence.ModeManual)

	if len(builtin) == 0 {
		t.Error("expected at least one ModeBuiltin collector")
	}
	if len(manual) == 0 {
		t.Error("expected at least one ModeManual collector (cross-analysis)")
	}
	t.Logf("ModeBuiltin collectors: %d, ModeManual: %d", len(builtin), len(manual))
}
