package evidence

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ZipBuilder packs one or more EvidenceResults into a single ZIP archive.
type ZipBuilder struct{}

// NewZipBuilder creates a ZipBuilder.
func NewZipBuilder() *ZipBuilder { return &ZipBuilder{} }

// Build creates a ZIP containing one JSON file per EvidenceResult.
// The archive layout:
//
//	evidence-<agentID>-<timestamp>/
//	  <collectorID>.json
func (zb *ZipBuilder) Build(agentID string, results []*EvidenceResult) ([]byte, error) {
	if len(results) == 0 {
		return nil, fmt.Errorf("zip: no evidence results to pack")
	}

	ts := time.Now().UTC().Format("20060102T150405Z")
	dir := fmt.Sprintf("evidence-%s-%s", agentID, ts)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, r := range results {
		if r == nil {
			continue
		}
		data, err := json.Marshal(r)
		if err != nil {
			return nil, fmt.Errorf("zip: marshal %s: %w", r.CollectorID, err)
		}
		name := fmt.Sprintf("%s/%s.json", dir, r.CollectorID)
		f, err := zw.Create(name)
		if err != nil {
			return nil, fmt.Errorf("zip: create entry %s: %w", name, err)
		}
		if _, err := f.Write(data); err != nil {
			return nil, fmt.Errorf("zip: write entry %s: %w", name, err)
		}
	}

	// Write a manifest file.
	manifest := map[string]interface{}{
		"agent_id":   agentID,
		"created_at": ts,
		"collectors": func() []string {
			ids := make([]string, 0, len(results))
			for _, r := range results {
				if r != nil {
					ids = append(ids, r.CollectorID)
				}
			}
			return ids
		}(),
	}
	manifestData, _ := json.Marshal(manifest)
	mf, err := zw.Create(dir + "/manifest.json")
	if err != nil {
		return nil, fmt.Errorf("zip: create manifest: %w", err)
	}
	if _, err := mf.Write(manifestData); err != nil {
		return nil, fmt.Errorf("zip: write manifest: %w", err)
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("zip: close: %w", err)
	}
	return buf.Bytes(), nil
}

// EvidenceUploader uploads a ZIP archive to the collection server's
// POST /api/v1/evidence/upload endpoint.
type EvidenceUploader struct {
	serverURL    string
	projectToken string
	httpClient   *http.Client
}

// NewEvidenceUploader creates an EvidenceUploader.
func NewEvidenceUploader(serverURL, projectToken string) *EvidenceUploader {
	return &EvidenceUploader{
		serverURL:    serverURL,
		projectToken: projectToken,
		httpClient:   &http.Client{Timeout: 120 * time.Second},
	}
}

// Upload POSTs the ZIP payload to the evidence upload endpoint.
func (u *EvidenceUploader) Upload(ctx context.Context, agentID string, zipData []byte) error {
	url := u.serverURL + "/api/v1/evidence/upload"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(zipData))
	if err != nil {
		return fmt.Errorf("evidence upload: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-Agent-ID", agentID)
	if u.projectToken != "" {
		req.Header.Set("Authorization", "Bearer "+u.projectToken)
	}

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("evidence upload: http: %w", err)
	}
	defer resp.Body.Close()
	// Drain response body.
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("evidence upload: server returned %d", resp.StatusCode)
	}
	return nil
}
