// Package storage implements the evidence storage layer for the Collection Server.
// It stores collect results (evidence) in S3-compatible object storage (AWS S3, MinIO).
// Metadata is stored in PostgreSQL; raw evidence bytes go to S3.
package storage

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path"
	"time"
)

// S3Config holds S3/MinIO connection parameters.
type S3Config struct {
	Endpoint        string `yaml:"endpoint"`          // e.g., "s3.amazonaws.com" or "minio:9000"
	Bucket          string `yaml:"bucket"`            // e.g., "aitop-evidence"
	Region          string `yaml:"region"`            // e.g., "ap-northeast-2"
	AccessKeyID     string `yaml:"access_key_id"`
	SecretAccessKey string `yaml:"secret_access_key"`
	UseSSL          bool   `yaml:"use_ssl"`
	PathStyle       bool   `yaml:"path_style"`        // true for MinIO
}

// S3Client provides methods to store and retrieve evidence from S3.
type S3Client struct {
	config     S3Config
	httpClient *http.Client
}

// NewS3Client creates a new S3 storage client.
func NewS3Client(cfg S3Config) *S3Client {
	return &S3Client{
		config: cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// EvidenceKey generates an S3 object key for a collect result.
// Format: evidence/{agent_id}/{date}/{collector_id}/{result_id}.json.gz
func EvidenceKey(agentID, collectorID, resultID string, collectedAt time.Time) string {
	date := collectedAt.Format("2006-01-02")
	return path.Join("evidence", agentID, date, collectorID, resultID+".json.gz")
}

// TerminalLogKey generates an S3 object key for a terminal session log.
// Format: terminal-logs/{agent_id}/{date}/{session_id}.log.gz
func TerminalLogKey(agentID, sessionID string, startedAt time.Time) string {
	date := startedAt.Format("2006-01-02")
	return path.Join("terminal-logs", agentID, date, sessionID+".log.gz")
}

// DiagnosticKey generates an S3 object key for a diagnostic report.
// Format: diagnostics/{agent_id}/{date}/{diagnostic_id}.json.gz
func DiagnosticKey(agentID, diagnosticID string, createdAt time.Time) string {
	date := createdAt.Format("2006-01-02")
	return path.Join("diagnostics", agentID, date, diagnosticID+".json.gz")
}

// PutObject uploads data to S3 with gzip compression.
// Returns the S3 key, SHA-256 checksum, and compressed size.
func (c *S3Client) PutObject(key string, data []byte) (checksum string, compressedSize int, err error) {
	// Compute checksum on original data
	hash := sha256.Sum256(data)
	checksum = hex.EncodeToString(hash[:])

	// Gzip compress
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err = gz.Write(data); err != nil {
		return "", 0, fmt.Errorf("gzip write: %w", err)
	}
	if err = gz.Close(); err != nil {
		return "", 0, fmt.Errorf("gzip close: %w", err)
	}
	compressedSize = buf.Len()

	// Build S3 PUT request
	url := c.objectURL(key)
	req, err := http.NewRequest(http.MethodPut, url, &buf)
	if err != nil {
		return "", 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/gzip")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("X-Amz-Content-Sha256", checksum)
	c.signRequest(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("s3 put: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", 0, fmt.Errorf("s3 put failed: %d %s", resp.StatusCode, string(body))
	}

	return checksum, compressedSize, nil
}

// GetObject retrieves and decompresses an object from S3.
func (c *S3Client) GetObject(key string) ([]byte, error) {
	url := c.objectURL(key)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	c.signRequest(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("s3 get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("object not found: %s", key)
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("s3 get failed: %d %s", resp.StatusCode, string(body))
	}

	// Decompress gzip
	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		// Maybe not gzipped, read raw
		return io.ReadAll(resp.Body)
	}
	defer gz.Close()

	return io.ReadAll(gz)
}

// DeleteObject removes an object from S3.
func (c *S3Client) DeleteObject(key string) error {
	url := c.objectURL(key)
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	c.signRequest(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("s3 delete: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

// objectURL builds the full URL for an S3 object.
func (c *S3Client) objectURL(key string) string {
	scheme := "https"
	if !c.config.UseSSL {
		scheme = "http"
	}
	if c.config.PathStyle {
		// MinIO style: http://minio:9000/bucket/key
		return fmt.Sprintf("%s://%s/%s/%s", scheme, c.config.Endpoint, c.config.Bucket, key)
	}
	// Virtual-hosted style: https://bucket.s3.region.amazonaws.com/key
	return fmt.Sprintf("%s://%s.%s/%s", scheme, c.config.Bucket, c.config.Endpoint, key)
}

// signRequest adds authentication headers. For production, use AWS SDK v2 Signer.
// This implementation uses a simplified approach suitable for MinIO with static credentials.
func (c *S3Client) signRequest(req *http.Request) {
	if c.config.AccessKeyID != "" {
		// Simplified auth header for MinIO compatibility
		req.SetBasicAuth(c.config.AccessKeyID, c.config.SecretAccessKey)
	}
}
