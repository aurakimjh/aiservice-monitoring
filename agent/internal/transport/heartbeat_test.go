package transport

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func newLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestHeartbeatSender_Send(t *testing.T) {
	received := make(chan *models.Heartbeat, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/heartbeat" || r.Method != http.MethodPost {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		var hb models.Heartbeat
		if err := json.NewDecoder(r.Body).Decode(&hb); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		received <- &hb
		resp := models.HeartbeatResponse{
			Commands: []models.RemoteCommand{{ID: "cmd-1", Type: "collect"}},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	sender := NewHeartbeatSender(srv.URL, "token-abc", newLogger())
	hb := &models.Heartbeat{AgentID: "agent-1", Status: models.AgentHealthy}

	resp, err := sender.Send(context.Background(), hb)
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	if len(resp.Commands) != 1 || resp.Commands[0].ID != "cmd-1" {
		t.Fatalf("unexpected commands: %+v", resp.Commands)
	}

	select {
	case got := <-received:
		if got.AgentID != "agent-1" {
			t.Fatalf("expected agent-1, got %q", got.AgentID)
		}
	default:
		t.Fatal("server did not receive heartbeat")
	}
}

func TestHeartbeatSender_CommandDispatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := models.HeartbeatResponse{
			Commands: []models.RemoteCommand{
				{ID: "c1", Type: "collect"},
				{ID: "c2", Type: "restart"},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	sender := NewHeartbeatSender(srv.URL, "", newLogger())
	_, err := sender.Send(context.Background(), &models.Heartbeat{AgentID: "x"})
	if err != nil {
		t.Fatal(err)
	}
	// Drain command channel.
	var ids []string
	for len(sender.CommandCh) > 0 {
		cmd := <-sender.CommandCh
		ids = append(ids, cmd.ID)
	}
	if len(ids) != 2 {
		t.Fatalf("expected 2 commands, got %d: %v", len(ids), ids)
	}
}

func TestHeartbeatSender_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal", http.StatusInternalServerError)
	}))
	defer srv.Close()

	sender := NewHeartbeatSender(srv.URL, "", newLogger())
	_, err := sender.Send(context.Background(), &models.Heartbeat{AgentID: "y"})
	if err == nil {
		t.Fatal("expected error on 500 response")
	}
}

func TestHeartbeatSender_Run(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(models.HeartbeatResponse{})
	}))
	defer srv.Close()

	sender := NewHeartbeatSender(srv.URL, "", newLogger(),
		WithInterval(20*time.Millisecond),
	)
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()

	hbFn := func() *models.Heartbeat { return &models.Heartbeat{AgentID: "run-test"} }
	sender.Run(ctx, hbFn)

	if calls < 2 {
		t.Fatalf("expected at least 2 heartbeats, got %d", calls)
	}
}

func TestHTTPClient_SendCollectResult(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := NewHTTPClient(srv.URL, "tok", newLogger())
	err := client.SendCollectResult(context.Background(), "os", []byte(`{"collector_id":"os"}`))
	if err != nil {
		t.Fatalf("SendCollectResult: %v", err)
	}
}
