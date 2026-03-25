package storage

import (
	"path"
	"time"
)

// EvidenceKey generates a storage key for a collect result.
// Format: evidence/{agent_id}/{date}/{collector_id}/{result_id}.json.gz
func EvidenceKey(agentID, collectorID, resultID string, collectedAt time.Time) string {
	date := collectedAt.Format("2006-01-02")
	return path.Join("evidence", agentID, date, collectorID, resultID+".json.gz")
}

// TerminalLogKey generates a storage key for a terminal session log.
// Format: terminal-logs/{agent_id}/{date}/{session_id}.log.gz
func TerminalLogKey(agentID, sessionID string, startedAt time.Time) string {
	date := startedAt.Format("2006-01-02")
	return path.Join("terminal-logs", agentID, date, sessionID+".log.gz")
}

// DiagnosticKey generates a storage key for a diagnostic report.
// Format: diagnostics/{agent_id}/{date}/{diagnostic_id}.json.gz
func DiagnosticKey(agentID, diagnosticID string, createdAt time.Time) string {
	date := createdAt.Format("2006-01-02")
	return path.Join("diagnostics", agentID, date, diagnosticID+".json.gz")
}

// ProfileKey generates a storage key for a profiling snapshot.
// Format: profiles/{agent_id}/{date}/{service_name}/{profile_id}.pb.gz
func ProfileKey(agentID, serviceName, profileID string, startedAt time.Time) string {
	date := startedAt.Format("2006-01-02")
	return path.Join("profiles", agentID, date, serviceName, profileID+".pb.gz")
}

// PerfProfileKey generates a storage key for a perf/eBPF folded stack.
// Format: perf-profiles/{agent_id}/{date}/{profile_type}/{profile_id}.folded.gz
func PerfProfileKey(agentID, profileType, profileID string, capturedAt time.Time) string {
	date := capturedAt.Format("2006-01-02")
	return path.Join("perf-profiles", agentID, date, profileType, profileID+".folded.gz")
}

// PluginKey generates a storage key for a plugin archive.
// Format: plugins/{plugin_name}/{version}/{plugin_name}-{version}.zip
func PluginKey(pluginName, version string) string {
	return path.Join("plugins", pluginName, version, pluginName+"-"+version+".zip")
}
