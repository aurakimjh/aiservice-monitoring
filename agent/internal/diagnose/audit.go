package diagnose

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

// TriggerRole defines who is allowed to trigger a diagnostic run.
type TriggerRole string

const (
	RoleAdmin TriggerRole = "admin"
	RoleSRE   TriggerRole = "sre"
	RoleViewer TriggerRole = "viewer" // read-only; cannot trigger manual items
)

// AuditEntry is a single audit log record for a diagnostic trigger.
type AuditEntry struct {
	Timestamp  time.Time   `json:"timestamp"`
	RunID      string      `json:"run_id"`
	TriggeredBy string     `json:"triggered_by"`
	Role       TriggerRole `json:"role"`
	Mode       string      `json:"mode"`
	Items      []string    `json:"items,omitempty"`
	Approved   bool        `json:"approved"`
	DenyReason string      `json:"deny_reason,omitempty"`
}

// AuditLog records diagnostic trigger events to an append-only log file.
type AuditLog struct {
	mu     sync.Mutex
	path   string
	logger *slog.Logger
}

// NewAuditLog creates an AuditLog writing to path.
func NewAuditLog(path string, logger *slog.Logger) *AuditLog {
	return &AuditLog{path: path, logger: logger}
}

// Record writes an AuditEntry to the log file.
func (al *AuditLog) Record(entry AuditEntry) error {
	if al.path == "" {
		// No file configured — log only to slog.
		al.logger.Info("audit",
			"run_id", entry.RunID,
			"triggered_by", entry.TriggeredBy,
			"role", entry.Role,
			"approved", entry.Approved,
		)
		return nil
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("audit: marshal: %w", err)
	}

	al.mu.Lock()
	defer al.mu.Unlock()

	f, err := os.OpenFile(al.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("audit: open %s: %w", al.path, err)
	}
	defer f.Close()

	if _, err := f.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("audit: write: %w", err)
	}
	al.logger.Info("audit entry recorded", "run_id", entry.RunID, "approved", entry.Approved)
	return nil
}

// AccessController enforces role-based access for diagnostic triggers.
type AccessController struct {
	// AllowedRoles lists roles permitted to trigger diagnostic runs.
	AllowedRoles []TriggerRole
	// ManualAllowedRoles lists roles permitted to trigger 🖐️ manual items.
	ManualAllowedRoles []TriggerRole
}

// DefaultAccessController returns an AccessController with sane defaults.
func DefaultAccessController() *AccessController {
	return &AccessController{
		AllowedRoles:       []TriggerRole{RoleAdmin, RoleSRE},
		ManualAllowedRoles: []TriggerRole{RoleAdmin, RoleSRE},
	}
}

// CanTrigger checks if role is allowed to trigger a run at the given mode.
func (ac *AccessController) CanTrigger(role TriggerRole, mode Mode) (bool, string) {
	if mode >= ModeFull {
		for _, r := range ac.ManualAllowedRoles {
			if r == role {
				return true, ""
			}
		}
		return false, fmt.Sprintf("role %q is not permitted to trigger manual (🖐️) diagnostic items", role)
	}
	for _, r := range ac.AllowedRoles {
		if r == role {
			return true, ""
		}
	}
	return false, fmt.Sprintf("role %q is not permitted to trigger diagnostic runs", role)
}
