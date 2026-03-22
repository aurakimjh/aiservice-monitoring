// Package statemachine implements the AITOP Agent lifecycle state machine.
//
// States (in order of the happy path):
//
//	registered → approved → healthy → degraded → offline
//
// Additional states: upgrade-available, upgrade-in-progress, quarantined, retired.
package statemachine

import (
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Transition describes a valid state transition.
type Transition struct {
	From  models.AgentStatus
	To    models.AgentStatus
	Event string
}

// allowed is the complete set of permitted transitions.
var allowed = []Transition{
	{models.AgentRegistered, models.AgentApproved, "approve"},
	{models.AgentApproved, models.AgentHealthy, "checkin_ok"},
	{models.AgentHealthy, models.AgentDegraded, "degraded"},
	{models.AgentDegraded, models.AgentHealthy, "recovered"},
	{models.AgentHealthy, models.AgentOffline, "missed_heartbeat"},
	{models.AgentDegraded, models.AgentOffline, "missed_heartbeat"},
	{models.AgentApproved, models.AgentOffline, "missed_heartbeat"},
	{models.AgentOffline, models.AgentHealthy, "checkin_ok"},
	{models.AgentOffline, models.AgentApproved, "checkin_ok_new"},
	// Upgrade lifecycle
	{models.AgentHealthy, models.AgentUpgradeAvailable, "update_available"},
	{models.AgentDegraded, models.AgentUpgradeAvailable, "update_available"},
	{models.AgentUpgradeAvailable, models.AgentUpgradeInProgress, "upgrade_start"},
	{models.AgentUpgradeInProgress, models.AgentHealthy, "upgrade_ok"},
	{models.AgentUpgradeInProgress, models.AgentDegraded, "upgrade_failed"},
	// Quarantine / retire
	{models.AgentHealthy, models.AgentQuarantined, "quarantine"},
	{models.AgentDegraded, models.AgentQuarantined, "quarantine"},
	{models.AgentOffline, models.AgentQuarantined, "quarantine"},
	{models.AgentQuarantined, models.AgentApproved, "release"},
	{models.AgentHealthy, models.AgentRetired, "retire"},
	{models.AgentOffline, models.AgentRetired, "retire"},
}

// StateChangeHandler is called synchronously after every successful transition.
type StateChangeHandler func(from, to models.AgentStatus, event string, at time.Time)

// Machine is the agent lifecycle state machine.
type Machine struct {
	mu        sync.RWMutex
	current   models.AgentStatus
	enteredAt time.Time
	history   []StateRecord
	handlers  []StateChangeHandler
	logger    *slog.Logger

	// MissedBeats tracks consecutive missed heartbeat acknowledgements.
	MissedBeats    int
	MaxMissedBeats int // transitions to offline when reached
}

// StateRecord is a single entry in the transition history.
type StateRecord struct {
	From  models.AgentStatus `json:"from"`
	To    models.AgentStatus `json:"to"`
	Event string             `json:"event"`
	At    time.Time          `json:"at"`
}

// New creates a Machine starting in the registered state.
func New(logger *slog.Logger) *Machine {
	return &Machine{
		current:        models.AgentRegistered,
		enteredAt:      time.Now().UTC(),
		history:        make([]StateRecord, 0, 32),
		logger:         logger,
		MaxMissedBeats: 3,
	}
}

// State returns the current agent status.
func (m *Machine) State() models.AgentStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

// EnteredAt returns when the current state was entered.
func (m *Machine) EnteredAt() time.Time {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enteredAt
}

// OnChange registers a state-change handler.
func (m *Machine) OnChange(h StateChangeHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handlers = append(m.handlers, h)
}

// Transition attempts to move to a new state via the named event.
// Returns an error if the transition is not permitted.
func (m *Machine) Transition(event string) error {
	m.mu.Lock()
	from := m.current
	to, ok := m.lookupTarget(from, event)
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("statemachine: no transition %q from state %q", event, from)
	}

	now := time.Now().UTC()
	m.history = append(m.history, StateRecord{From: from, To: to, Event: event, At: now})
	m.current = to
	m.enteredAt = now

	// Copy handlers before releasing the lock.
	handlers := make([]StateChangeHandler, len(m.handlers))
	copy(handlers, m.handlers)
	m.mu.Unlock()

	m.logger.Info("agent state transition",
		"from", from,
		"to", to,
		"event", event,
	)

	for _, h := range handlers {
		h(from, to, event, now)
	}
	return nil
}

// HeartbeatAck processes a heartbeat acknowledgement from the server.
// It advances the state machine and resets the missed-beat counter.
func (m *Machine) HeartbeatAck() error {
	m.mu.Lock()
	m.MissedBeats = 0
	cur := m.current
	m.mu.Unlock()

	switch cur {
	case models.AgentApproved:
		return m.Transition("checkin_ok")
	case models.AgentOffline:
		return m.Transition("checkin_ok")
	default:
		return nil // healthy / degraded / etc. — no state change needed
	}
}

// HeartbeatMissed increments the missed-beat counter and, once
// MaxMissedBeats is reached, transitions to offline.
func (m *Machine) HeartbeatMissed() error {
	m.mu.Lock()
	m.MissedBeats++
	missed := m.MissedBeats
	max := m.MaxMissedBeats
	m.mu.Unlock()

	m.logger.Warn("heartbeat acknowledgement missed", "missed", missed, "max", max)

	if missed >= max {
		return m.Transition("missed_heartbeat")
	}
	return nil
}

// MarkDegraded transitions a healthy agent to degraded.
func (m *Machine) MarkDegraded() error {
	return m.Transition("degraded")
}

// MarkRecovered transitions a degraded agent back to healthy.
func (m *Machine) MarkRecovered() error {
	return m.Transition("recovered")
}

// History returns a snapshot of all recorded state transitions.
func (m *Machine) History() []StateRecord {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]StateRecord, len(m.history))
	copy(out, m.history)
	return out
}

// lookupTarget finds the target state for a given (from, event) pair.
// Must be called with m.mu held.
func (m *Machine) lookupTarget(from models.AgentStatus, event string) (models.AgentStatus, bool) {
	for _, t := range allowed {
		if t.From == from && t.Event == event {
			return t.To, true
		}
	}
	return "", false
}
