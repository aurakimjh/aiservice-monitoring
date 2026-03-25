package models

import "time"

// AgentMode represents the operating mode of the agent.
type AgentMode string

const (
	ModeFull          AgentMode = "full"
	ModeCollectOnly   AgentMode = "collect-only"
	ModeCollectExport AgentMode = "collect-export"
	ModeLite          AgentMode = "lite"
	// ModeDiagnose runs evidence collection once then exits (Phase 31).
	ModeDiagnose AgentMode = "diagnose"
)

// AgentStatus represents the lifecycle status of the agent.
type AgentStatus string

const (
	AgentRegistered        AgentStatus = "registered"
	AgentApproved          AgentStatus = "approved"
	AgentHealthy           AgentStatus = "healthy"
	AgentDegraded          AgentStatus = "degraded"
	AgentOffline           AgentStatus = "offline"
	AgentUpgradeAvailable  AgentStatus = "upgrade-available"
	AgentUpgradeInProgress AgentStatus = "upgrade-in-progress"
	AgentQuarantined       AgentStatus = "quarantined"
	AgentRetired           AgentStatus = "retired"
)

// PluginStatus represents the state of a collector plugin.
type PluginStatus struct {
	PluginID     string    `json:"plugin_id"`
	Version      string    `json:"version"`
	Status       string    `json:"status"` // active, inactive, error
	ItemsCovered []string  `json:"items_covered,omitempty"`
	AutoDetected bool      `json:"auto_detected"`
	LastCollect  time.Time `json:"last_collect,omitempty"`
}

// PrivilegeCheck is the result of checking a single privilege.
type PrivilegeCheck struct {
	Collector     string   `json:"collector"`
	Privilege     string   `json:"privilege"`
	Status        string   `json:"status"` // GRANTED, DENIED, PARTIAL
	Detail        string   `json:"detail"`
	AffectedItems []string `json:"affected_items,omitempty"`
}

// PrivilegeReport is the full privilege report for the agent.
type PrivilegeReport struct {
	AgentID     string           `json:"agent_id"`
	Timestamp   time.Time        `json:"timestamp"`
	RunAsUser   string           `json:"run_as_user"`
	RunAsGroups []string         `json:"run_as_groups,omitempty"`
	Checks      []PrivilegeCheck `json:"checks"`
}

// DiagnosticStatus summarises the last diagnostic run for Fleet display (Phase 31-2f).
type DiagnosticStatus struct {
	LastRunID   string    `json:"last_run_id,omitempty"`
	LastRunAt   time.Time `json:"last_run_at,omitempty"`
	ItemCount   int       `json:"item_count,omitempty"`
	ErrorCount  int       `json:"error_count,omitempty"`
	Uploaded    bool      `json:"uploaded,omitempty"`
	NextRunAt   time.Time `json:"next_run_at,omitempty"`
}

// Heartbeat is sent periodically from agent to collection server.
type Heartbeat struct {
	AgentID           string         `json:"agent_id"`
	Hostname          string         `json:"hostname"`
	Timestamp         time.Time      `json:"timestamp"`
	Status            AgentStatus    `json:"status"`
	AgentVersion      string         `json:"agent_version"`
	OSType            string         `json:"os_type"`
	OSVersion         string         `json:"os_version"`
	CPUPercent        float64        `json:"cpu_percent"`
	MemoryMB          float64        `json:"memory_mb"`
	Plugins           []PluginStatus   `json:"plugins"`
	PrivilegeReport   *PrivilegeReport `json:"privilege_report,omitempty"`
	AIDetected        bool             `json:"ai_detected,omitempty"`
	SDKLangs          []string         `json:"sdk_langs,omitempty"`
	Diagnostic        *DiagnosticStatus `json:"diagnostic,omitempty"`
}

// HeartbeatResponse is the server's reply to a heartbeat.
type HeartbeatResponse struct {
	Commands      []RemoteCommand `json:"commands,omitempty"`
	ConfigUpdate  *ConfigUpdate   `json:"config_update,omitempty"`
	UpdateAvail   *UpdateInfo     `json:"update_available,omitempty"`
}

// RemoteCommand is a command the server asks the agent to execute.
type RemoteCommand struct {
	ID      string `json:"id"`
	Type    string `json:"type"` // collect, restart, update, shell
	Payload string `json:"payload,omitempty"`
}

// ConfigUpdate contains configuration changes pushed from the server.
type ConfigUpdate struct {
	Version   int               `json:"version"`
	Schedule  map[string]string `json:"schedule,omitempty"`
	Collectors map[string]bool  `json:"collectors,omitempty"`
}

// UpdateInfo describes an available agent or plugin update.
type UpdateInfo struct {
	Version     string `json:"version"`
	URL         string `json:"url"`
	Checksum    string `json:"checksum"`
	Signature   string `json:"signature"`
	ReleaseNote string `json:"release_note,omitempty"`
}
