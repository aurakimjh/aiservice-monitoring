package transport

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EvidenceRelayClient forwards received evidence ZIP bundles to the
// aitop-backend service (Phase 31-2e: Backend relay + auto-trigger).
type EvidenceRelayClient struct {
	backendURL   string
	projectToken string
	httpClient   *http.Client
}

// NewEvidenceRelayClient creates an EvidenceRelayClient.
func NewEvidenceRelayClient(backendURL, projectToken string) *EvidenceRelayClient {
	return &EvidenceRelayClient{
		backendURL:   backendURL,
		projectToken: projectToken,
		httpClient:   &http.Client{Timeout: 60 * time.Second},
	}
}

// Relay forwards a ZIP evidence bundle to the backend and returns a diagnosis
// trigger URL if the backend supports auto-diagnosis (Phase 31-2e).
func (c *EvidenceRelayClient) Relay(ctx context.Context, agentID, runID string, zipData []byte) (string, error) {
	url := fmt.Sprintf("%s/api/v1/evidence/ingest", c.backendURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(zipData))
	if err != nil {
		return "", fmt.Errorf("relay: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Run-ID", runID)
	if c.projectToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.projectToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("relay: http: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("relay: backend returned %d", resp.StatusCode)
	}

	// Auto-trigger diagnosis if supported (Location header contains the job URL).
	diagURL := resp.Header.Get("X-Diagnosis-Job-URL")
	return diagURL, nil
}

// TriggerDiagnosis sends a POST to the backend to start diagnosis on a run.
func (c *EvidenceRelayClient) TriggerDiagnosis(ctx context.Context, runID string) error {
	url := fmt.Sprintf("%s/api/v1/diagnosis/trigger", c.backendURL)
	body := []byte(fmt.Sprintf(`{"run_id":%q}`, runID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("trigger: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.projectToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.projectToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("trigger: http: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("trigger: backend returned %d", resp.StatusCode)
	}
	return nil
}
