// Package ws implements a WebSocket Hub for the Collection Server.
// It pushes real-time events (heartbeat, collect results, alerts, metrics)
// to connected frontend clients, replacing 30-second polling.
//
// Protocol: JSON messages over WebSocket.
//   - Server → Client: {"type":"...","data":{...}}
//   - Client → Server: {"type":"subscribe","channels":["fleet","alerts"]}
//
// The Hub integrates with the EventBus to relay events automatically.
package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/eventbus"
)

// Message is a JSON message sent over WebSocket.
type Message struct {
	Type      string      `json:"type"`
	Channel   string      `json:"channel,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

// Client represents a connected WebSocket client.
type Client struct {
	id         string
	hub        *Hub
	conn       wsConn
	channels   map[string]bool
	sendCh     chan []byte
	mu         sync.RWMutex
	closedOnce sync.Once
}

// wsConn abstracts a WebSocket connection for testability.
// In production this wraps net/http hijacked connection.
type wsConn interface {
	ReadMessage() ([]byte, error)
	WriteMessage(data []byte) error
	Close() error
}

// Hub manages all connected WebSocket clients and broadcasts messages.
type Hub struct {
	mu         sync.RWMutex
	clients    map[string]*Client
	logger     *slog.Logger
	seq        int64
	eventBus   *eventbus.Bus
	unsubFns   []func()
}

// NewHub creates a WebSocket hub and subscribes to EventBus events.
func NewHub(logger *slog.Logger, bus *eventbus.Bus) *Hub {
	h := &Hub{
		clients:  make(map[string]*Client),
		logger:   logger,
		eventBus: bus,
	}

	// Subscribe to relevant EventBus events and relay to WebSocket clients
	if bus != nil {
		h.subscribeEvents(bus)
	}

	return h
}

// subscribeEvents wires EventBus → WebSocket broadcast.
func (h *Hub) subscribeEvents(bus *eventbus.Bus) {
	// Fleet events → "fleet" channel
	fleetEvents := []eventbus.EventType{
		eventbus.EventAgentRegistered,
		eventbus.EventAgentApproved,
		eventbus.EventAgentDegraded,
		eventbus.EventAgentOffline,
		eventbus.EventAgentHeartbeat,
	}
	for _, et := range fleetEvents {
		et := et
		unsub := bus.Subscribe(et, func(e eventbus.Event) {
			h.Broadcast("fleet", Message{
				Type:      string(e.Type),
				Channel:   "fleet",
				Data:      e.Data,
				Timestamp: e.Timestamp,
			})
		})
		h.unsubFns = append(h.unsubFns, unsub)
	}

	// Collect events → "collect" channel
	collectEvents := []eventbus.EventType{
		eventbus.EventCollectCompleted,
		eventbus.EventCollectFailed,
		eventbus.EventCollectQuarantined,
	}
	for _, et := range collectEvents {
		et := et
		unsub := bus.Subscribe(et, func(e eventbus.Event) {
			h.Broadcast("collect", Message{
				Type:      string(e.Type),
				Channel:   "collect",
				Data:      e.Data,
				Timestamp: e.Timestamp,
			})
		})
		h.unsubFns = append(h.unsubFns, unsub)
	}

	// Diagnostic events → "diagnostics" channel
	diagEvents := []eventbus.EventType{
		eventbus.EventDiagnosticStarted,
		eventbus.EventDiagnosticCompleted,
	}
	for _, et := range diagEvents {
		et := et
		unsub := bus.Subscribe(et, func(e eventbus.Event) {
			h.Broadcast("diagnostics", Message{
				Type:      string(e.Type),
				Channel:   "diagnostics",
				Data:      e.Data,
				Timestamp: e.Timestamp,
			})
		})
		h.unsubFns = append(h.unsubFns, unsub)
	}

	// Update events → "updates" channel
	updateEvents := []eventbus.EventType{
		eventbus.EventUpdateAvailable,
		eventbus.EventUpdateStarted,
		eventbus.EventUpdateCompleted,
		eventbus.EventUpdateRolledBack,
	}
	for _, et := range updateEvents {
		et := et
		unsub := bus.Subscribe(et, func(e eventbus.Event) {
			h.Broadcast("updates", Message{
				Type:      string(e.Type),
				Channel:   "updates",
				Data:      e.Data,
				Timestamp: e.Timestamp,
			})
		})
		h.unsubFns = append(h.unsubFns, unsub)
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.id] = client
	h.logger.Info("ws client connected", "id", client.id, "total", len(h.clients))
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(clientID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c, ok := h.clients[clientID]; ok {
		c.closedOnce.Do(func() { close(c.sendCh) })
		delete(h.clients, clientID)
	}
	h.logger.Info("ws client disconnected", "id", clientID, "total", len(h.clients))
}

// Broadcast sends a message to all clients subscribed to the given channel.
// If channel is empty, sends to all clients.
func (h *Hub) Broadcast(channel string, msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, c := range h.clients {
		if channel == "" || c.IsSubscribed(channel) || c.IsSubscribed("*") {
			select {
			case c.sendCh <- data:
			default:
				// Client send buffer full, skip
			}
		}
	}
}

// BroadcastAll sends a message to all connected clients regardless of subscription.
func (h *Hub) BroadcastAll(msg Message) {
	h.Broadcast("", msg)
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Close cleans up the hub.
func (h *Hub) Close() {
	for _, unsub := range h.unsubFns {
		unsub()
	}
	h.mu.Lock()
	for id, c := range h.clients {
		c.closedOnce.Do(func() { close(c.sendCh) })
		delete(h.clients, id)
	}
	h.mu.Unlock()
}

// ── Client methods ──────────────────────────────────────────────────────────

// IsSubscribed checks if the client is subscribed to a channel.
func (c *Client) IsSubscribed(channel string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.channels[channel]
}

// Subscribe adds channels to the client's subscription list.
func (c *Client) Subscribe(channels ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, ch := range channels {
		c.channels[ch] = true
	}
}

// Unsubscribe removes channels from the client's subscription list.
func (c *Client) Unsubscribe(channels ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, ch := range channels {
		delete(c.channels, ch)
	}
}

// ── SSE (Server-Sent Events) fallback ───────────────────────────────────────
// For environments where WebSocket is blocked (corporate proxies),
// we provide an SSE endpoint as fallback.

// SSEHandler returns an HTTP handler that streams events via SSE.
func (h *Hub) SSEHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		// Parse channel subscriptions from query params
		channels := r.URL.Query()["channel"]
		if len(channels) == 0 {
			channels = []string{"*"} // all channels
		}

		h.mu.Lock()
		h.seq++
		clientID := "sse-" + r.RemoteAddr + "-" + time.Now().Format("150405")
		h.mu.Unlock()

		client := &Client{
			id:       clientID,
			hub:      h,
			channels: make(map[string]bool),
			sendCh:   make(chan []byte, 64),
		}
		for _, ch := range channels {
			client.channels[ch] = true
		}
		h.Register(client)
		defer h.Unregister(clientID)

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		flusher.Flush()

		// Send initial connection event
		connectMsg, _ := json.Marshal(Message{
			Type:      "connected",
			Channel:   "system",
			Data:      map[string]interface{}{"client_id": clientID, "channels": channels},
			Timestamp: time.Now(),
		})
		w.Write([]byte("data: "))
		w.Write(connectMsg)
		w.Write([]byte("\n\n"))
		flusher.Flush()

		// Stream events
		ctx := r.Context()
		for {
			select {
			case <-ctx.Done():
				return
			case data, ok := <-client.sendCh:
				if !ok {
					return
				}
				w.Write([]byte("data: "))
				w.Write(data)
				w.Write([]byte("\n\n"))
				flusher.Flush()
			}
		}
	}
}
