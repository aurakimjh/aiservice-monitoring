// Package output provides writers for structured agent output formats.
package output

import (
	"encoding/json"
	"io"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Record represents a single line in NDJSON output.
// Each line is a self-contained JSON object containing both
// schema metadata and the collected data (or error details).
type Record struct {
	SchemaName      string               `json:"schema_name"`
	SchemaVersion   string               `json:"schema_version"`
	CollectorType   string               `json:"collector_type"`
	CollectorID     string               `json:"collector_id"`
	CollectorVersion string              `json:"collector_version"`
	AgentID         string               `json:"agent_id"`
	Hostname        string               `json:"hostname"`
	ProjectID       string               `json:"project_id,omitempty"`
	TenantID        string               `json:"tenant_id,omitempty"`
	Timestamp       time.Time            `json:"timestamp"`
	CollectStatus   models.CollectStatus `json:"collect_status"`
	Errors          []models.CollectError `json:"errors"`
	Data            interface{}          `json:"data"`
}

// Writer serialises CollectResult objects to NDJSON (one JSON object per line).
type Writer struct {
	enc *json.Encoder
}

// NewWriter creates a Writer that outputs to w.
func NewWriter(w io.Writer) *Writer {
	enc := json.NewEncoder(w)
	return &Writer{enc: enc}
}

// WriteResult converts every CollectedItem in result into a separate NDJSON line.
// If the collection failed entirely (no items), a single error record is emitted.
func (w *Writer) WriteResult(result *models.CollectResult, agentID, hostname, projectID, tenantID string) error {
	base := Record{
		CollectorType:    "agent-plugin",
		CollectorID:      result.CollectorID,
		CollectorVersion: result.CollectorVersion,
		AgentID:          agentID,
		Hostname:         hostname,
		ProjectID:        projectID,
		TenantID:         tenantID,
		Timestamp:        result.Timestamp,
		CollectStatus:    result.Status,
		Errors:           result.Errors,
	}
	if base.Errors == nil {
		base.Errors = []models.CollectError{}
	}

	// No items (FAILED / SKIPPED) → emit one sentinel error record
	if len(result.Items) == 0 {
		base.SchemaName = "agent.collection_error"
		base.SchemaVersion = "1.0.0"
		base.Data = nil
		return w.enc.Encode(base)
	}

	// One NDJSON line per collected item
	for _, item := range result.Items {
		rec := base
		rec.SchemaName = item.SchemaName
		rec.SchemaVersion = item.SchemaVersion
		rec.Data = item.Data
		if err := w.enc.Encode(rec); err != nil {
			return err
		}
	}
	return nil
}

// WriteError emits a single NDJSON error record directly without a CollectResult.
// Useful for top-level agent errors (e.g., config load failure).
func (w *Writer) WriteError(collectorID, schemaName, agentID, hostname string, code models.ErrorCode, message string) error {
	rec := Record{
		SchemaName:      schemaName,
		SchemaVersion:   "1.0.0",
		CollectorType:   "agent-plugin",
		CollectorID:     collectorID,
		CollectorVersion: "unknown",
		AgentID:         agentID,
		Hostname:        hostname,
		Timestamp:       time.Now().UTC(),
		CollectStatus:   models.StatusFailed,
		Errors: []models.CollectError{
			{Code: code, Message: message},
		},
		Data: nil,
	}
	return w.enc.Encode(rec)
}
