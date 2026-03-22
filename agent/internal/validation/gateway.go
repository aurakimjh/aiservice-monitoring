// Package validation implements the Validation Gateway for incoming collect results.
// It performs schema validation, required field checks, PII secondary scanning,
// and determines whether data should be accepted, rejected, or quarantined.
package validation

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/sanitizer"
)

// Status represents the validation outcome.
type Status string

const (
	StatusAccepted    Status = "accepted"
	StatusRejected    Status = "rejected"
	StatusQuarantined Status = "quarantined"
)

// Result holds the outcome of validating a single collect result.
type Result struct {
	Status   Status   `json:"status"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
	Sanitized bool    `json:"sanitized"`
}

// Gateway validates incoming collect results before storage.
type Gateway struct {
	sanitizer        *sanitizer.Sanitizer
	maxPayloadBytes  int
	requiredFields   []string
	knownCollectors  map[string]bool
}

// NewGateway creates a validation gateway with default settings.
func NewGateway() *Gateway {
	return &Gateway{
		sanitizer:       sanitizer.New(),
		maxPayloadBytes: 10 * 1024 * 1024, // 10 MB
		requiredFields:  []string{"collector_id", "status"},
		knownCollectors: map[string]bool{
			"it-os": true, "it-web": true, "it-was": true, "it-db": true,
			"ai-gpu": true, "ai-llm": true, "ai-vectordb": true,
			"ai-serving": true, "ai-otel": true,
		},
	}
}

// CollectPayload is the expected structure of incoming collect data.
type CollectPayload struct {
	CollectorID string          `json:"collector_id"`
	SchemaName  string          `json:"schema_name"`
	Status      string          `json:"status"`
	Items       json.RawMessage `json:"items"`
	Errors      json.RawMessage `json:"errors,omitempty"`
	DurationMS  int64           `json:"duration_ms"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	CollectedAt *time.Time      `json:"collected_at,omitempty"`
}

// Validate checks the incoming payload and returns a validation result.
// If the data contains unsanitized PII, it is quarantined.
// If required fields are missing or the payload is malformed, it is rejected.
func (g *Gateway) Validate(data []byte) (*Result, []byte) {
	result := &Result{Status: StatusAccepted}

	// 1. Size check
	if len(data) > g.maxPayloadBytes {
		result.Status = StatusRejected
		result.Errors = append(result.Errors, fmt.Sprintf(
			"payload exceeds max size: %d > %d bytes", len(data), g.maxPayloadBytes,
		))
		return result, nil
	}

	// 2. JSON parse check
	var payload CollectPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		result.Status = StatusRejected
		result.Errors = append(result.Errors, "invalid JSON: "+err.Error())
		return result, nil
	}

	// 3. Required fields
	if payload.CollectorID == "" {
		result.Errors = append(result.Errors, "missing required field: collector_id")
	}
	if payload.Status == "" {
		result.Errors = append(result.Errors, "missing required field: status")
	}
	if len(result.Errors) > 0 {
		result.Status = StatusRejected
		return result, nil
	}

	// 4. Status value validation
	validStatuses := map[string]bool{
		"success": true, "partial": true, "failed": true, "skipped": true,
	}
	if !validStatuses[payload.Status] {
		result.Errors = append(result.Errors, fmt.Sprintf(
			"invalid status value: %q (expected: success, partial, failed, skipped)", payload.Status,
		))
		result.Status = StatusRejected
		return result, nil
	}

	// 5. Known collector check
	if !g.knownCollectors[payload.CollectorID] {
		result.Warnings = append(result.Warnings, fmt.Sprintf(
			"unknown collector_id: %q", payload.CollectorID,
		))
	}

	// 6. Duration sanity check
	if payload.DurationMS < 0 {
		result.Warnings = append(result.Warnings, "negative duration_ms")
	}
	if payload.DurationMS > 600000 { // 10 minutes
		result.Warnings = append(result.Warnings, fmt.Sprintf(
			"unusually long duration: %dms", payload.DurationMS,
		))
	}

	// 7. PII secondary scan — quarantine if detected
	if g.sanitizer.ContainsSensitive(string(data)) {
		sanitized, err := g.sanitizer.SanitizeJSON(data)
		if err == nil {
			data = sanitized
		}
		result.Sanitized = true
		result.Warnings = append(result.Warnings,
			"PII/secrets detected and sanitized before storage",
		)
	}

	// 8. Items structure validation (if present)
	if len(payload.Items) > 0 {
		if !isValidJSONArrayOrObject(payload.Items) {
			result.Warnings = append(result.Warnings,
				"items field is not a valid JSON array or object",
			)
		}
	}

	return result, data
}

// ValidateCollectorID checks if the collector ID matches the URL path.
func (g *Gateway) ValidateCollectorID(urlCollectorID, bodyCollectorID string) error {
	if urlCollectorID != "" && bodyCollectorID != "" {
		if !strings.EqualFold(urlCollectorID, bodyCollectorID) {
			return fmt.Errorf(
				"collector_id mismatch: URL=%q body=%q", urlCollectorID, bodyCollectorID,
			)
		}
	}
	return nil
}

// isValidJSONArrayOrObject checks if raw JSON is an array or object.
func isValidJSONArrayOrObject(data json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(data))
	if len(trimmed) == 0 {
		return false
	}
	return (trimmed[0] == '[' || trimmed[0] == '{') && json.Valid(data)
}
