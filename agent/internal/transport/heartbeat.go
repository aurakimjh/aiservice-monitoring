// Package transport handles all outbound HTTP communication for the AITOP Agent.
package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

const (
	defaultHeartbeatInterval = 30 * time.Second
	defaultHTTPTimeout       = 10 * time.Second
)

// HeartbeatSender periodically POSTs heartbeat messages to the collection
// server and processes any commands returned in the response.
type HeartbeatSender struct {
	serverURL    string
	projectToken string
	interval     time.Duration
	httpClient   *http.Client
	logger       *slog.Logger

	// CommandCh receives remote commands returned by the server.
	CommandCh chan models.RemoteCommand
}

// HeartbeatSenderOption configures a HeartbeatSender.
type HeartbeatSenderOption func(*HeartbeatSender)

// WithInterval overrides the default 30 s heartbeat interval.
func WithInterval(d time.Duration) HeartbeatSenderOption {
	return func(s *HeartbeatSender) { s.interval = d }
}

// WithHTTPClient replaces the default HTTP client (useful in tests).
func WithHTTPClient(c *http.Client) HeartbeatSenderOption {
	return func(s *HeartbeatSender) { s.httpClient = c }
}

// NewHeartbeatSender creates a HeartbeatSender.
func NewHeartbeatSender(serverURL, projectToken string, logger *slog.Logger, opts ...HeartbeatSenderOption) *HeartbeatSender {
	s := &HeartbeatSender{
		serverURL:    serverURL,
		projectToken: projectToken,
		interval:     defaultHeartbeatInterval,
		httpClient:   &http.Client{Timeout: defaultHTTPTimeout},
		logger:       logger,
		CommandCh:    make(chan models.RemoteCommand, 16),
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Run starts the heartbeat loop. It blocks until ctx is cancelled.
// heartbeatFn is called each tick to build the current heartbeat payload.
func (s *HeartbeatSender) Run(ctx context.Context, heartbeatFn func() *models.Heartbeat) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			hb := heartbeatFn()
			resp, err := s.Send(ctx, hb)
			if err != nil {
				s.logger.Warn("heartbeat send failed", "error", err)
				continue
			}
			s.handleResponse(resp)
		}
	}
}

// Send posts a single heartbeat to the server and returns the response.
func (s *HeartbeatSender) Send(ctx context.Context, hb *models.Heartbeat) (*models.HeartbeatResponse, error) {
	body, err := json.Marshal(hb)
	if err != nil {
		return nil, fmt.Errorf("heartbeat: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.serverURL+"/api/v1/heartbeat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("heartbeat: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if s.projectToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.projectToken)
	}

	httpResp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("heartbeat: http: %w", err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return nil, fmt.Errorf("heartbeat: server returned %d", httpResp.StatusCode)
	}

	var resp models.HeartbeatResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&resp); err != nil {
		return nil, fmt.Errorf("heartbeat: decode response: %w", err)
	}
	// Dispatch remote commands immediately so callers draining CommandCh
	// see them whether they use Send or Run.
	s.handleResponse(&resp)
	return &resp, nil
}

// handleResponse dispatches commands from the server response.
func (s *HeartbeatSender) handleResponse(resp *models.HeartbeatResponse) {
	if resp == nil {
		return
	}
	for _, cmd := range resp.Commands {
		select {
		case s.CommandCh <- cmd:
			s.logger.Info("remote command received", "id", cmd.ID, "type", cmd.Type)
		default:
			s.logger.Warn("command channel full, dropping command", "id", cmd.ID)
		}
	}
}

// HTTPClient is a general-purpose HTTPS client for sending collected data
// to the collection server (used in collect-only mode).
type HTTPClient struct {
	serverURL    string
	projectToken string
	httpClient   *http.Client
	logger       *slog.Logger
}

// NewHTTPClient creates an HTTPClient for talking to the collection server.
func NewHTTPClient(serverURL, projectToken string, logger *slog.Logger) *HTTPClient {
	return &HTTPClient{
		serverURL:    serverURL,
		projectToken: projectToken,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
		logger:       logger,
	}
}

// SendCollectResult POSTs a single serialised CollectResult to the server.
func (c *HTTPClient) SendCollectResult(ctx context.Context, collectorID string, data []byte) error {
	url := fmt.Sprintf("%s/api/v1/collect/%s", c.serverURL, collectorID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("httpclient: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.projectToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.projectToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("httpclient: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("httpclient: server returned %d for collector %s", resp.StatusCode, collectorID)
	}
	c.logger.Info("collect result sent", "collector", collectorID, "status", resp.StatusCode)
	return nil
}
