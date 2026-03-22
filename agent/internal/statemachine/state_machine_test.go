package statemachine

import (
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func newMachine() *Machine {
	return New(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})))
}

func TestInitialState(t *testing.T) {
	m := newMachine()
	if m.State() != models.AgentRegistered {
		t.Fatalf("expected registered, got %q", m.State())
	}
}

func TestHappyPath(t *testing.T) {
	m := newMachine()

	steps := []struct {
		event string
		want  models.AgentStatus
	}{
		{"approve", models.AgentApproved},
		{"checkin_ok", models.AgentHealthy},
		{"degraded", models.AgentDegraded},
		{"recovered", models.AgentHealthy},
		{"missed_heartbeat", models.AgentOffline},
		{"checkin_ok", models.AgentHealthy},
	}

	for _, s := range steps {
		if err := m.Transition(s.event); err != nil {
			t.Fatalf("event %q: %v", s.event, err)
		}
		if m.State() != s.want {
			t.Fatalf("after %q: expected %q, got %q", s.event, s.want, m.State())
		}
	}
}

func TestInvalidTransition(t *testing.T) {
	m := newMachine()
	if err := m.Transition("checkin_ok"); err == nil {
		t.Fatal("expected error for invalid transition registered→checkin_ok")
	}
}

func TestHeartbeatAck_ApprovedBecomesHealthy(t *testing.T) {
	m := newMachine()
	_ = m.Transition("approve")
	if err := m.HeartbeatAck(); err != nil {
		t.Fatal(err)
	}
	if m.State() != models.AgentHealthy {
		t.Fatalf("expected healthy, got %q", m.State())
	}
}

func TestHeartbeatMissed_OfflineAfterMax(t *testing.T) {
	m := newMachine()
	_ = m.Transition("approve")
	_ = m.HeartbeatAck() // → healthy
	m.MaxMissedBeats = 2

	_ = m.HeartbeatMissed()
	if m.State() != models.AgentHealthy {
		t.Fatalf("expected still healthy after 1 miss, got %q", m.State())
	}
	_ = m.HeartbeatMissed()
	if m.State() != models.AgentOffline {
		t.Fatalf("expected offline after %d misses, got %q", m.MaxMissedBeats, m.State())
	}
}

func TestHeartbeatMissed_ResetsOnAck(t *testing.T) {
	m := newMachine()
	_ = m.Transition("approve")
	_ = m.HeartbeatAck() // → healthy
	m.MaxMissedBeats = 3

	_ = m.HeartbeatMissed()
	_ = m.HeartbeatAck() // should reset counter

	m.mu.RLock()
	missed := m.MissedBeats
	m.mu.RUnlock()

	if missed != 0 {
		t.Fatalf("expected MissedBeats=0 after ack, got %d", missed)
	}
}

func TestOnChangeHandler(t *testing.T) {
	m := newMachine()

	var events []string
	m.OnChange(func(_ models.AgentStatus, _ models.AgentStatus, event string, _ time.Time) {
		events = append(events, event)
	})

	_ = m.Transition("approve")
	_ = m.Transition("checkin_ok")

	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d: %v", len(events), events)
	}
}

func TestHistory(t *testing.T) {
	m := newMachine()
	_ = m.Transition("approve")
	_ = m.Transition("checkin_ok")

	h := m.History()
	if len(h) != 2 {
		t.Fatalf("expected 2 history entries, got %d", len(h))
	}
	if h[0].Event != "approve" || h[1].Event != "checkin_ok" {
		t.Fatalf("unexpected history: %+v", h)
	}
}

func TestQuarantineAndRelease(t *testing.T) {
	m := newMachine()
	_ = m.Transition("approve")
	_ = m.Transition("checkin_ok") // → healthy
	_ = m.Transition("quarantine")
	if m.State() != models.AgentQuarantined {
		t.Fatalf("expected quarantined, got %q", m.State())
	}
	_ = m.Transition("release")
	if m.State() != models.AgentApproved {
		t.Fatalf("expected approved after release, got %q", m.State())
	}
}

func TestMarkDegradedAndRecovered(t *testing.T) {
	m := newMachine()
	_ = m.Transition("approve")
	_ = m.HeartbeatAck()
	if err := m.MarkDegraded(); err != nil {
		t.Fatal(err)
	}
	if m.State() != models.AgentDegraded {
		t.Fatalf("expected degraded, got %q", m.State())
	}
	if err := m.MarkRecovered(); err != nil {
		t.Fatal(err)
	}
	if m.State() != models.AgentHealthy {
		t.Fatalf("expected healthy, got %q", m.State())
	}
}
