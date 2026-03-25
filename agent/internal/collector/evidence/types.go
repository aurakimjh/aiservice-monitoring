// Package evidence provides the diagnostic evidence collection framework
// for Phase 31 (Agent Unification). Evidence collectors implement the
// EvidenceCollector interface and are invoked in --mode=diagnose.
//
// Collection mode legend:
//   - ModeBuiltin (🔧): Go code reads /proc, sysfs, or config files directly.
//   - ModeScript  (📜): Shell/Python/PowerShell scripts are executed by Script Executor.
//   - ModeManual  (🖐️): Requires explicit user/admin trigger; may have high system impact.
package evidence

import (
	"context"
	"time"
)

// CollectMode classifies how diagnostic evidence is gathered.
type CollectMode int

const (
	ModeBuiltin CollectMode = iota // 🔧 Go native collection
	ModeScript                     // 📜 external script execution
	ModeManual                     // 🖐️ admin-triggered, potentially impactful
)

func (m CollectMode) String() string {
	switch m {
	case ModeBuiltin:
		return "builtin"
	case ModeScript:
		return "script"
	case ModeManual:
		return "manual"
	default:
		return "unknown"
	}
}

// EvidenceConfig holds parameters for a single evidence collection run.
type EvidenceConfig struct {
	AgentID   string
	Hostname  string
	ProjectID string
	TenantID  string
	// ExtraPaths allows callers to override default search paths (for testing).
	ExtraPaths map[string]string
}

// EvidenceItem is a single piece of diagnostic evidence.
type EvidenceItem struct {
	// ItemID is the catalog identifier (e.g., "ITEM0009").
	ItemID string `json:"item_id"`
	// SchemaName is the evidence schema name.
	SchemaName string `json:"schema_name"`
	// FilePath is the source file or resource that was read (may be empty).
	FilePath string `json:"file_path,omitempty"`
	// Checksum is the SHA-256 hex of the content bytes (may be empty for structured data).
	Checksum string `json:"checksum,omitempty"`
	// Content holds the structured or raw evidence data.
	Content any `json:"content"`
	// CollectedAt is when the evidence was gathered (UTC).
	CollectedAt time.Time `json:"collected_at"`
}

// EvidenceError is a structured error from evidence collection.
type EvidenceError struct {
	ItemID  string `json:"item_id,omitempty"`
	Code    string `json:"code"`
	Message string `json:"message"`
	// Source is the file, command, or resource that caused the error.
	Source string `json:"source,omitempty"`
}

// EvidenceResult is the full output of an EvidenceCollector.Collect() call.
type EvidenceResult struct {
	CollectorID      string          `json:"collector_id"`
	CollectorVersion string          `json:"collector_version"`
	CollectMode      CollectMode     `json:"collect_mode"`
	AgentID          string          `json:"agent_id"`
	Hostname         string          `json:"hostname"`
	Timestamp        time.Time       `json:"timestamp"`
	Items            []EvidenceItem  `json:"items"`
	Errors           []EvidenceError `json:"errors"`
}

// EvidenceCollector is the interface all evidence collectors must implement.
type EvidenceCollector interface {
	// ID returns the unique identifier (e.g., "evidence-config").
	ID() string
	// Version returns the collector version string.
	Version() string
	// Category returns the evidence category (e.g., "config", "log", "eos").
	Category() string
	// Mode returns the collection mode (Builtin / Script / Manual).
	Mode() CollectMode
	// CoveredItems returns the catalog ITEM IDs this collector covers.
	CoveredItems() []string
	// Collect gathers evidence and returns the result.
	Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error)
}
