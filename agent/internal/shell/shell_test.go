package shell

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/config"
)

func testConfig(maxSessions int) config.RemoteShellConfig {
	return config.RemoteShellConfig{
		Enabled:         true,
		AllowedRoles:    []string{"admin", "sre"},
		MaxSessions:     maxSessions,
		IdleTimeout:     600,
		MaxDuration:     3600,
		BlockedCommands: []string{"custom-block"},
		AuditEnabled:    false,
	}
}

func testManager(maxSessions int) *Manager {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	return NewManager("agent-test", testConfig(maxSessions), logger)
}

func TestRBACFilter_DefaultBlocked(t *testing.T) {
	filter := NewRBACFilter("sre", nil)
	cases := []struct {
		input   string
		blocked bool
	}{
		{"rm -rf /\n", true},
		{"ls -la\n", false},
		{"shutdown now\n", true},
		{"cat /etc/passwd\n", false},
		{":(){:|:&};:\n", true},
		{"reboot\n", true},
	}
	for _, tc := range cases {
		blocked, _ := filter.IsBlocked(tc.input)
		if blocked != tc.blocked {
			t.Errorf("IsBlocked(%q) = %v, want %v", tc.input, blocked, tc.blocked)
		}
	}
}

func TestRBACFilter_CustomBlocked(t *testing.T) {
	filter := NewRBACFilter("sre", []string{"custom-block"})
	blocked, reason := filter.IsBlocked("custom-block\n")
	if !blocked {
		t.Error("expected custom command to be blocked")
	}
	if reason == "" {
		t.Error("expected non-empty reason")
	}
}

func TestManagerRoleCheck(t *testing.T) {
	m := testManager(3)
	_, _, err := m.OpenSession(context.Background(), "sess-1", "alice", "viewer")
	if err == nil {
		t.Error("expected error for role 'viewer', got nil")
	}
}

func TestManagerMaxSessions(t *testing.T) {
	m := testManager(3)
	m.cfg.MaxSessions = 0 // override to 0 to test limit

	_, _, err := m.OpenSession(context.Background(), "sess-limit", "bob", "admin")
	if err == nil {
		t.Error("expected error when max sessions is 0, got nil")
	}
}

func TestAuditLogger(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "audit-*.log")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	audit := NewAuditLogger(f.Name(), logger)
	if audit == nil {
		t.Fatal("NewAuditLogger returned nil")
	}

	audit.LogEvent(AuditEvent{
		SessionID: "test-session",
		UserID:    "alice",
		AgentID:   "agent-1",
		EventType: "SESSION_OPEN",
	})
	audit.LogEvent(AuditEvent{
		SessionID: "test-session",
		UserID:    "alice",
		AgentID:   "agent-1",
		EventType: "INPUT",
		Data:      "ls -la",
	})
	audit.LogEvent(AuditEvent{
		SessionID: "test-session",
		UserID:    "alice",
		AgentID:   "agent-1",
		EventType: "SESSION_CLOSE",
	})
	audit.Close()

	data, err := os.ReadFile(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Error("audit log should not be empty")
	}
	content := string(data)
	for _, needle := range []string{"SESSION_OPEN", "INPUT", "SESSION_CLOSE", "ls -la"} {
		if !strings.Contains(content, needle) {
			t.Errorf("audit log missing %q: %s", needle, content)
		}
	}
}

func TestDetectShell(t *testing.T) {
	shell := detectShell()
	if shell == "" {
		t.Error("detectShell() returned empty string")
	}
}

func TestSanitizeAuditData(t *testing.T) {
	input := []byte("hello\x00\x01\x1b[31mworld\r\n")
	got := sanitizeAuditData(input)
	if got == "" {
		t.Error("sanitizeAuditData returned empty string for printable input")
	}
	for _, b := range []byte(got) {
		if b < 32 {
			t.Errorf("sanitizeAuditData: control char 0x%02x found in %q", b, got)
		}
	}
}

func TestManagerListSessions(t *testing.T) {
	m := testManager(5)
	sessions := m.ListSessions()
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestIsRoleAllowed(t *testing.T) {
	m := testManager(3)
	cases := []struct {
		role    string
		allowed bool
	}{
		{"admin", true},
		{"sre", true},
		{"viewer", false},
		{"", false},
		{"ADMIN", false}, // case-sensitive
	}
	for _, tc := range cases {
		got := m.isRoleAllowed(tc.role)
		if got != tc.allowed {
			t.Errorf("isRoleAllowed(%q) = %v, want %v", tc.role, got, tc.allowed)
		}
	}
}
