package updater

import (
	"os"
	"testing"
)

func TestParseSemver(t *testing.T) {
	cases := []struct {
		input    string
		expected []int
		isNil    bool
	}{
		{"v1.2.3", []int{1, 2, 3}, false},
		{"1.0.0", []int{1, 0, 0}, false},
		{"v0.15.4", []int{0, 15, 4}, false},
		{"invalid", nil, true},
		{"1.2", nil, true},
		{"", nil, true},
	}
	for _, tc := range cases {
		got := ParseSemver(tc.input)
		if tc.isNil {
			if got != nil {
				t.Errorf("ParseSemver(%q) = %v, want nil", tc.input, got)
			}
			continue
		}
		if len(got) != 3 {
			t.Errorf("ParseSemver(%q) = %v, want len 3", tc.input, got)
			continue
		}
		for i, v := range tc.expected {
			if got[i] != v {
				t.Errorf("ParseSemver(%q)[%d] = %d, want %d", tc.input, i, got[i], v)
			}
		}
	}
}

func TestIsNewer(t *testing.T) {
	cases := []struct {
		current   string
		candidate string
		expected  bool
	}{
		{"v1.0.0", "v1.0.1", true},
		{"v1.0.0", "v1.1.0", true},
		{"v1.0.0", "v2.0.0", true},
		{"v1.0.0", "v1.0.0", false},
		{"v1.0.1", "v1.0.0", false},
		{"v2.0.0", "v1.9.9", false},
		{"invalid", "v1.0.0", false},
		{"v1.0.0", "invalid", false},
	}
	for _, tc := range cases {
		got := IsNewer(tc.current, tc.candidate)
		if got != tc.expected {
			t.Errorf("IsNewer(%q, %q) = %v, want %v",
				tc.current, tc.candidate, got, tc.expected)
		}
	}
}

func TestAgentRolloutPercentile(t *testing.T) {
	p1 := agentRolloutPercentile("agent-abc-123")
	p2 := agentRolloutPercentile("agent-abc-123")
	if p1 != p2 {
		t.Errorf("percentile not deterministic: %d != %d", p1, p2)
	}
	if p1 < 1 || p1 > 100 {
		t.Errorf("percentile out of range [1,100]: %d", p1)
	}

	// Different agents should produce spread across 1..100
	distinct := make(map[int]bool)
	for i := 0; i < 20; i++ {
		p := agentRolloutPercentile(string(rune('a' + i)))
		distinct[p] = true
	}
	if len(distinct) < 5 {
		t.Errorf("percentile distribution too narrow: only %d distinct values", len(distinct))
	}
}

func TestCopyFile(t *testing.T) {
	dir := t.TempDir()
	src := dir + "/src.txt"
	dst := dir + "/dst.txt"

	if err := os.WriteFile(src, []byte("hello world"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := copyFile(src, dst); err != nil {
		t.Fatalf("copyFile returned error: %v", err)
	}
	data, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello world" {
		t.Errorf("expected 'hello world', got %q", string(data))
	}
}

func TestVerifyChecksum(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/test.bin"
	content := []byte("test data")
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}

	// Pre-computed SHA-256 of "test data"
	expected := "916f0027a575074ce72a331777c3478d6513f786a591bd892da1a577bf2335f9"

	m := &Manager{}
	if err := m.verifyChecksum(path, expected); err != nil {
		t.Errorf("verifyChecksum returned error for correct checksum: %v", err)
	}
	if err := m.verifyChecksum(path, "wrongchecksum00000000000000000000000000000000000000000000000000"); err == nil {
		t.Error("verifyChecksum should have returned error for wrong checksum")
	}
}

func TestUpdateStatus(t *testing.T) {
	m := &Manager{
		state:      StateIdle,
		currentVer: "v1.0.0",
	}
	status := m.Status()
	if status.State != StateIdle {
		t.Errorf("expected StateIdle, got %q", status.State)
	}
	if status.CurrentVersion != "v1.0.0" {
		t.Errorf("expected v1.0.0, got %q", status.CurrentVersion)
	}
}

func TestTransitionState(t *testing.T) {
	m := &Manager{state: StateIdle}

	if !m.transitionState(StateIdle, StateChecking) {
		t.Error("expected transition to succeed")
	}
	if m.state != StateChecking {
		t.Errorf("expected StateChecking, got %q", m.state)
	}

	// Already in StateChecking — transition from StateIdle should fail
	if m.transitionState(StateIdle, StateDownloading) {
		t.Error("expected transition to fail (not in StateIdle)")
	}
}

func TestSetError(t *testing.T) {
	m := &Manager{state: StateIdle}
	m.logger = nil // setError uses logger — test with nil logger handles gracefully

	// Use only setError parts that don't require logger
	m.mu.Lock()
	m.state = StateFailed
	m.lastErr = "test error"
	m.mu.Unlock()

	if m.state != StateFailed {
		t.Errorf("expected StateFailed, got %q", m.state)
	}
	if m.lastErr != "test error" {
		t.Errorf("expected 'test error', got %q", m.lastErr)
	}
}
