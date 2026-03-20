package models

import (
	"context"
	"time"
)

// ErrorCode represents the type of collection error.
type ErrorCode string

const (
	ErrPermissionDenied  ErrorCode = "PERMISSION_DENIED"
	ErrNotInstalled      ErrorCode = "NOT_INSTALLED"
	ErrTimeout           ErrorCode = "TIMEOUT"
	ErrConnectionRefused ErrorCode = "CONNECTION_REFUSED"
	ErrAuthFailed        ErrorCode = "AUTH_FAILED"
	ErrParseError        ErrorCode = "PARSE_ERROR"
	ErrEnvNotDetected    ErrorCode = "ENV_NOT_DETECTED"
	ErrPartialSuccess    ErrorCode = "PARTIAL_SUCCESS"
	ErrQuarantined       ErrorCode = "QUARANTINED"
)

// CollectStatus represents the overall result of a collection run.
type CollectStatus string

const (
	StatusSuccess CollectStatus = "SUCCESS"
	StatusPartial CollectStatus = "PARTIAL"
	StatusFailed  CollectStatus = "FAILED"
	StatusSkipped CollectStatus = "SKIPPED"
)

// Privilege represents a required permission for a collector.
type Privilege struct {
	Type        string `json:"type"`        // read, write, exec, net, root, docker, k8s
	Target      string `json:"target"`      // path, command, host:port, resource
	Description string `json:"description"` // human-readable description
}

// DetectResult holds the outcome of environment auto-detection.
type DetectResult struct {
	Detected bool              `json:"detected"`
	Details  map[string]string `json:"details,omitempty"` // e.g., {"process": "vllm", "port": "8000"}
}

// CollectConfig holds parameters for a single collection run.
type CollectConfig struct {
	ProjectID string            `json:"project_id"`
	TenantID  string            `json:"tenant_id"`
	Hostname  string            `json:"hostname"`
	Part      string            `json:"part,omitempty"` // aa, da, ta, all
	Extra     map[string]string `json:"extra,omitempty"`
}

// CollectedItem represents a single piece of collected data.
type CollectedItem struct {
	SchemaName    string      `json:"schema_name"`
	SchemaVersion string      `json:"schema_version"`
	MetricType    string      `json:"metric_type"`
	Category      string      `json:"category"` // "it" or "ai"
	Data          interface{} `json:"data"`
}

// CollectError represents a structured error from collection.
type CollectError struct {
	Code       ErrorCode `json:"code"`
	Message    string    `json:"message"`
	Command    string    `json:"command,omitempty"`
	Required   string    `json:"required,omitempty"`
	Current    string    `json:"current,omitempty"`
	Suggestion string    `json:"suggestion,omitempty"`
}

// CollectResult is the complete output of a Collector.Collect() call.
type CollectResult struct {
	CollectorID      string            `json:"collector_id"`
	CollectorVersion string            `json:"collector_version"`
	Timestamp        time.Time         `json:"timestamp"`
	Status           CollectStatus     `json:"collect_status"`
	Items            []CollectedItem   `json:"items"`
	Errors           []CollectError    `json:"errors"`
	Duration         time.Duration     `json:"duration"`
	Metadata         map[string]string `json:"metadata,omitempty"`
}

// Collector is the interface that all IT and AI collectors must implement.
type Collector interface {
	// ID returns the unique identifier for this collector (e.g., "os", "ai-gpu").
	ID() string

	// Version returns the collector plugin version.
	Version() string

	// SupportedPlatforms returns the list of supported OS platforms.
	SupportedPlatforms() []string

	// RequiredPrivileges returns the list of permissions needed to run this collector.
	RequiredPrivileges() []Privilege

	// OutputSchemas returns the list of evidence schema names this collector produces.
	OutputSchemas() []string

	// AutoDetect checks whether this collector should be activated on the current host.
	AutoDetect(ctx context.Context) (DetectResult, error)

	// Collect runs the data collection and returns structured results with errors.
	Collect(ctx context.Context, cfg CollectConfig) (*CollectResult, error)
}
