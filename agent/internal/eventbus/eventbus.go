// Package eventbus implements an in-process event bus for the Collection Server.
// It decouples producers (collect result receiver) from consumers (diagnostic trigger,
// notification sender, audit logger) using a publish-subscribe pattern.
package eventbus

import (
	"sync"
	"time"
)

// EventType identifies the kind of event.
type EventType string

const (
	// Collection events
	EventCollectCompleted  EventType = "collect.completed"
	EventCollectFailed     EventType = "collect.failed"
	EventCollectQuarantined EventType = "collect.quarantined"

	// Agent lifecycle events
	EventAgentRegistered   EventType = "agent.registered"
	EventAgentApproved     EventType = "agent.approved"
	EventAgentDegraded     EventType = "agent.degraded"
	EventAgentOffline      EventType = "agent.offline"
	EventAgentHeartbeat    EventType = "agent.heartbeat"

	// Diagnostic events
	EventDiagnosticStarted   EventType = "diagnostic.started"
	EventDiagnosticCompleted EventType = "diagnostic.completed"

	// Terminal events
	EventTerminalOpened  EventType = "terminal.opened"
	EventTerminalClosed  EventType = "terminal.closed"

	// Update events
	EventUpdateAvailable EventType = "update.available"
	EventUpdateStarted   EventType = "update.started"
	EventUpdateCompleted EventType = "update.completed"
	EventUpdateRolledBack EventType = "update.rolled_back"
)

// Event is a single occurrence in the system.
type Event struct {
	Type      EventType              `json:"type"`
	Timestamp time.Time              `json:"timestamp"`
	AgentID   string                 `json:"agent_id,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
}

// Handler is a function that processes an event.
type Handler func(event Event)

// Bus is the central event bus. It is safe for concurrent use.
type Bus struct {
	mu          sync.RWMutex
	subscribers map[EventType][]Handler
	history     []Event
	maxHistory  int
}

// New creates a new event bus with a rolling history buffer.
func New(maxHistory int) *Bus {
	if maxHistory <= 0 {
		maxHistory = 1000
	}
	return &Bus{
		subscribers: make(map[EventType][]Handler),
		history:     make([]Event, 0, maxHistory),
		maxHistory:  maxHistory,
	}
}

// Subscribe registers a handler for a specific event type.
// Returns an unsubscribe function.
func (b *Bus) Subscribe(eventType EventType, handler Handler) func() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.subscribers[eventType] = append(b.subscribers[eventType], handler)
	idx := len(b.subscribers[eventType]) - 1

	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		subs := b.subscribers[eventType]
		if idx < len(subs) {
			b.subscribers[eventType] = append(subs[:idx], subs[idx+1:]...)
		}
	}
}

// SubscribeAll registers a handler for all event types.
func (b *Bus) SubscribeAll(handler Handler) func() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.subscribers["*"] = append(b.subscribers["*"], handler)
	idx := len(b.subscribers["*"]) - 1

	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		subs := b.subscribers["*"]
		if idx < len(subs) {
			b.subscribers["*"] = append(subs[:idx], subs[idx+1:]...)
		}
	}
}

// Publish sends an event to all matching subscribers asynchronously.
func (b *Bus) Publish(event Event) {
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	// Store in history
	b.mu.Lock()
	if len(b.history) >= b.maxHistory {
		b.history = b.history[1:]
	}
	b.history = append(b.history, event)

	// Collect handlers to call
	var handlers []Handler
	handlers = append(handlers, b.subscribers[event.Type]...)
	handlers = append(handlers, b.subscribers["*"]...)
	b.mu.Unlock()

	// Dispatch asynchronously to avoid blocking the publisher
	for _, h := range handlers {
		go h(event)
	}
}

// PublishSync sends an event and waits for all handlers to complete.
func (b *Bus) PublishSync(event Event) {
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}

	b.mu.Lock()
	if len(b.history) >= b.maxHistory {
		b.history = b.history[1:]
	}
	b.history = append(b.history, event)

	var handlers []Handler
	handlers = append(handlers, b.subscribers[event.Type]...)
	handlers = append(handlers, b.subscribers["*"]...)
	b.mu.Unlock()

	var wg sync.WaitGroup
	for _, h := range handlers {
		wg.Add(1)
		h := h
		go func() {
			defer wg.Done()
			h(event)
		}()
	}
	wg.Wait()
}

// History returns the most recent events, up to n.
func (b *Bus) History(n int) []Event {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if n <= 0 || n > len(b.history) {
		n = len(b.history)
	}
	start := len(b.history) - n
	result := make([]Event, n)
	copy(result, b.history[start:])
	return result
}

// HistoryByType returns recent events of a specific type.
func (b *Bus) HistoryByType(eventType EventType, n int) []Event {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var result []Event
	for i := len(b.history) - 1; i >= 0 && len(result) < n; i-- {
		if b.history[i].Type == eventType {
			result = append(result, b.history[i])
		}
	}
	// Reverse to chronological order
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result
}
