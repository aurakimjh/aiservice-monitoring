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
	// Detailed OS metrics (Phase 47+)
	OSMetrics         *OSMetrics       `json:"os_metrics,omitempty"`
}

// OSMetrics contains detailed system-level metrics.
type OSMetrics struct {
	CPU     CPUMetrics     `json:"cpu"`
	Memory  MemoryMetrics  `json:"memory"`
	Disks   []DiskMetrics  `json:"disks,omitempty"`
	Network []NetMetrics   `json:"network,omitempty"`
	TopProc []ProcessInfo  `json:"top_processes,omitempty"`
}

// CPUMetrics — user/system/idle/iowait breakdown.
type CPUMetrics struct {
	UserPct   float64 `json:"user_pct"`
	SystemPct float64 `json:"system_pct"`
	IdlePct   float64 `json:"idle_pct"`
	IOWaitPct float64 `json:"iowait_pct"`
	TotalPct  float64 `json:"total_pct"` // user + system + iowait
}

// MemoryMetrics — used/cached/available/total.
type MemoryMetrics struct {
	TotalMB     float64 `json:"total_mb"`
	UsedMB      float64 `json:"used_mb"`
	CachedMB    float64 `json:"cached_mb"`
	AvailableMB float64 `json:"available_mb"`
	UsedPct     float64 `json:"used_pct"`
}

// DiskMetrics per mount point.
type DiskMetrics struct {
	Mount    string  `json:"mount"`
	Device   string  `json:"device"`
	TotalGB  float64 `json:"total_gb"`
	UsedGB   float64 `json:"used_gb"`
	UsedPct  float64 `json:"used_pct"`
}

// NetMetrics per interface.
type NetMetrics struct {
	Interface string  `json:"interface"`
	RxMBps    float64 `json:"rx_mbps"`
	TxMBps    float64 `json:"tx_mbps"`
	RxBytes   uint64  `json:"rx_bytes"`
	TxBytes   uint64  `json:"tx_bytes"`
}

// ProcessInfo for top-N process list.
type ProcessInfo struct {
	PID     int     `json:"pid"`
	Name    string  `json:"name"`
	User    string  `json:"user"`
	CPUPct  float64 `json:"cpu_pct"`
	MemMB   float64 `json:"mem_mb"`
	Status  string  `json:"status"`
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
