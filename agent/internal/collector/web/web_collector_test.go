package web

import (
	"bufio"
	"context"
	"strings"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestWebCollectorInterface(t *testing.T) {
	c := New()
	if c.ID() != "web" {
		t.Errorf("expected ID 'web', got %q", c.ID())
	}
	if c.Version() == "" {
		t.Error("Version() must not be empty")
	}
	if len(c.SupportedPlatforms()) == 0 {
		t.Error("SupportedPlatforms() must not be empty")
	}
	if len(c.OutputSchemas()) == 0 {
		t.Error("OutputSchemas() must not be empty")
	}
}

func TestAutoDetect_NoWebServer(t *testing.T) {
	c := New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	_ = result.Detected
}

func TestCollect_NoWebServer(t *testing.T) {
	c := New()
	result, err := c.Collect(context.Background(), models.CollectConfig{Hostname: "test"})
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if result.CollectorID != "web" {
		t.Errorf("expected CollectorID 'web', got %q", result.CollectorID)
	}
}

func TestParseNginxConfigLogic(t *testing.T) {
	content := `
# nginx.conf
worker_processes  4;

events {
    worker_connections  1024;
}

http {
    keepalive_timeout  65;

    server {
        listen       80;
        server_name  example.com www.example.com;
    }

    server {
        listen       443 ssl;
        server_name  secure.example.com;
    }
}
`
	data := map[string]interface{}{}
	scanner := bufio.NewScanner(strings.NewReader(content))
	var workerProcesses, workerConnections, keepaliveTimeout string
	var serverNames, listenPorts []string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := fields[0]
		switch key {
		case "worker_processes":
			workerProcesses = strings.TrimSuffix(fields[1], ";")
		case "worker_connections":
			workerConnections = strings.TrimSuffix(fields[1], ";")
		case "keepalive_timeout":
			keepaliveTimeout = strings.TrimSuffix(fields[1], ";")
		case "server_name":
			for _, sn := range fields[1:] {
				sn = strings.TrimSuffix(sn, ";")
				if sn != "_" && sn != "" {
					serverNames = append(serverNames, sn)
				}
			}
		case "listen":
			port := strings.TrimSuffix(fields[1], ";")
			port = strings.Fields(port)[0]
			listenPorts = append(listenPorts, port)
		}
	}

	data["worker_processes"] = workerProcesses
	data["worker_connections"] = workerConnections
	data["keepalive_timeout"] = keepaliveTimeout
	data["server_names"] = unique(serverNames)
	data["listen_ports"] = unique(listenPorts)

	if data["worker_processes"] != "4" {
		t.Errorf("expected worker_processes=4, got %v", data["worker_processes"])
	}
	if data["worker_connections"] != "1024" {
		t.Errorf("expected worker_connections=1024, got %v", data["worker_connections"])
	}
	if data["keepalive_timeout"] != "65" {
		t.Errorf("expected keepalive_timeout=65, got %v", data["keepalive_timeout"])
	}
}

func TestUnique(t *testing.T) {
	in := []string{"a", "b", "a", "c", "b"}
	out := unique(in)
	if len(out) != 3 {
		t.Errorf("expected 3 unique values, got %d: %v", len(out), out)
	}
}

func TestExtractPort(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"443", "443"},
		{"0.0.0.0:443", "443"},
		{"[::]:8443", "8443"},
	}
	for _, tc := range cases {
		got := extractPort(tc.input)
		if got != tc.expected {
			t.Errorf("extractPort(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}
