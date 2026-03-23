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
