package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/auth"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/eventbus"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/validation"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func newTestServer(t *testing.T) (*httptest.Server, *fleet) {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	jwtMgr := auth.NewJWTManager(auth.JWTConfig{})
	bus := eventbus.New(100)
	validator := validation.NewGateway()
	f := newFleet()
	gr := newGroupRegistry()
	sr := newScheduleRegistry()
	srv := httptest.NewServer(buildMux(f, gr, sr, logger, jwtMgr, bus, validator))
	t.Cleanup(srv.Close)
	return srv, f
}

func postJSON(t *testing.T, srv *httptest.Server, path string, body interface{}) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	resp, err := http.Post(srv.URL+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	return resp
}

func TestHeartbeatEndpoint(t *testing.T) {
	srv, f := newTestServer(t)

	hb := models.Heartbeat{
		AgentID:      "agent-42",
		Hostname:     "host-a",
		Timestamp:    time.Now().UTC(),
		Status:       models.AgentHealthy,
		AgentVersion: "1.0.0",
	}
	resp := postJSON(t, srv, "/api/v1/heartbeat", hb)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	rec, ok := f.get("agent-42")
	if !ok {
		t.Fatal("agent-42 not registered after heartbeat")
	}
	if rec.Hostname != "host-a" {
		t.Fatalf("expected hostname host-a, got %q", rec.Hostname)
	}
}

func TestHeartbeatMissingAgentID(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/v1/heartbeat", models.Heartbeat{})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestListAgents(t *testing.T) {
	srv, _ := newTestServer(t)

	for _, id := range []string{"a1", "a2"} {
		resp := postJSON(t, srv, "/api/v1/heartbeat", models.Heartbeat{
			AgentID: id, Hostname: id + "-host", Status: models.AgentHealthy,
		})
		resp.Body.Close()
	}

	resp, err := http.Get(srv.URL + "/api/v1/agents")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var payload map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&payload)

	total, _ := payload["total"].(float64)
	if total < 2 {
		t.Fatalf("expected at least 2 agents, got %v", total)
	}
}

func TestGetAgent(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/v1/heartbeat", models.Heartbeat{
		AgentID: "x1", Hostname: "xhost", Status: models.AgentHealthy,
	})
	resp.Body.Close()

	resp2, err := http.Get(srv.URL + "/api/v1/agents/x1")
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}

	var a map[string]interface{}
	_ = json.NewDecoder(resp2.Body).Decode(&a)
	if a["id"] != "x1" {
		t.Fatalf("expected id x1, got %v", a["id"])
	}
}

func TestGetAgentNotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.URL + "/api/v1/agents/nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestPrivilegesEndpoint(t *testing.T) {
	srv, _ := newTestServer(t)
	priv := &models.PrivilegeReport{
		AgentID: "p1",
		Checks:  []models.PrivilegeCheck{{Collector: "os", Privilege: "read", Status: "GRANTED"}},
	}
	resp := postJSON(t, srv, "/api/v1/heartbeat", models.Heartbeat{
		AgentID:         "p1",
		Status:          models.AgentHealthy,
		PrivilegeReport: priv,
	})
	resp.Body.Close()

	resp2, err := http.Get(srv.URL + "/api/v1/agents/p1/privileges")
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
	var pr models.PrivilegeReport
	_ = json.NewDecoder(resp2.Body).Decode(&pr)
	if len(pr.Checks) != 1 || pr.Checks[0].Collector != "os" {
		t.Fatalf("unexpected privilege report: %+v", pr)
	}
}

func TestTriggerCollect(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := postJSON(t, srv, "/api/v1/heartbeat", models.Heartbeat{
		AgentID: "c1", Status: models.AgentHealthy,
	})
	resp.Body.Close()

	resp2 := postJSON(t, srv, "/api/v1/agents/c1/collect", nil)
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", resp2.StatusCode)
	}
}

func TestHealthz(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, _ := http.Get(srv.URL + "/healthz")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestFleetStateTransition(t *testing.T) {
	_, f := newTestServer(t)

	// First heartbeat → approved.
	f.upsert(&models.Heartbeat{AgentID: "sm1", Status: models.AgentHealthy})
	rec, _ := f.get("sm1")
	if rec.Status != models.AgentApproved {
		t.Fatalf("expected approved after first heartbeat, got %q", rec.Status)
	}

	// Second heartbeat → healthy.
	f.upsert(&models.Heartbeat{AgentID: "sm1", Status: models.AgentHealthy})
	if rec.Status != models.AgentHealthy {
		t.Fatalf("expected healthy after second heartbeat, got %q", rec.Status)
	}

	// Degraded signal from agent.
	f.upsert(&models.Heartbeat{AgentID: "sm1", Status: models.AgentDegraded})
	if rec.Status != models.AgentDegraded {
		t.Fatalf("expected degraded, got %q", rec.Status)
	}
}
