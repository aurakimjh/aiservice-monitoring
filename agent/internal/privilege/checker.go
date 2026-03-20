package privilege

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"os/user"
	"runtime"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Checker verifies that the agent has the required privileges for each collector.
type Checker struct {
	logger *slog.Logger
}

// NewChecker creates a new privilege checker.
func NewChecker(logger *slog.Logger) *Checker {
	return &Checker{logger: logger}
}

// CheckAll verifies all privileges for a list of collectors and returns a report.
func (c *Checker) CheckAll(collectors []models.Collector) *models.PrivilegeReport {
	report := &models.PrivilegeReport{
		Timestamp: time.Now().UTC(),
	}

	// Identify current user
	if u, err := user.Current(); err == nil {
		report.RunAsUser = u.Username
		if gids, err := u.GroupIds(); err == nil {
			report.RunAsGroups = gids
		}
	}

	for _, col := range collectors {
		for _, priv := range col.RequiredPrivileges() {
			check := c.checkSingle(priv)
			check.Collector = col.ID()
			report.Checks = append(report.Checks, check)
		}
	}

	return report
}

// CheckCollector checks all privileges for a single collector.
func (c *Checker) CheckCollector(col models.Collector) []models.PrivilegeCheck {
	var checks []models.PrivilegeCheck
	for _, priv := range col.RequiredPrivileges() {
		check := c.checkSingle(priv)
		check.Collector = col.ID()
		checks = append(checks, check)
	}
	return checks
}

func (c *Checker) checkSingle(priv models.Privilege) models.PrivilegeCheck {
	check := models.PrivilegeCheck{
		Privilege: fmt.Sprintf("%s:%s", priv.Type, priv.Target),
	}

	switch priv.Type {
	case "read":
		check = c.checkRead(priv, check)
	case "exec":
		check = c.checkExec(priv, check)
	case "net":
		// Network checks are deferred to actual connection attempt
		check.Status = "GRANTED"
		check.Detail = "network access will be verified at connection time"
	case "root":
		check = c.checkRoot(check)
	case "docker":
		check = c.checkDocker(check)
	default:
		check.Status = "GRANTED"
		check.Detail = fmt.Sprintf("privilege type %q not pre-checked", priv.Type)
	}

	return check
}

func (c *Checker) checkRead(priv models.Privilege, check models.PrivilegeCheck) models.PrivilegeCheck {
	info, err := os.Stat(priv.Target)
	if os.IsNotExist(err) {
		check.Status = "DENIED"
		check.Detail = fmt.Sprintf("path does not exist: %s", priv.Target)
		return check
	}
	if os.IsPermission(err) {
		check.Status = "DENIED"
		check.Detail = fmt.Sprintf("permission denied for path: %s", priv.Target)
		return check
	}
	if err != nil {
		check.Status = "DENIED"
		check.Detail = fmt.Sprintf("cannot access path: %v", err)
		return check
	}

	// Try opening the file/dir to verify actual read access
	if info.IsDir() {
		f, err := os.Open(priv.Target)
		if err != nil {
			check.Status = "DENIED"
			check.Detail = fmt.Sprintf("cannot open directory: %v", err)
			return check
		}
		f.Close()
	} else {
		f, err := os.Open(priv.Target)
		if err != nil {
			check.Status = "DENIED"
			check.Detail = fmt.Sprintf("cannot open file: %v", err)
			return check
		}
		f.Close()
	}

	check.Status = "GRANTED"
	check.Detail = fmt.Sprintf("readable: %s", priv.Target)
	return check
}

func (c *Checker) checkExec(priv models.Privilege, check models.PrivilegeCheck) models.PrivilegeCheck {
	path, err := exec.LookPath(priv.Target)
	if err != nil {
		check.Status = "DENIED"
		check.Detail = fmt.Sprintf("%s not found in PATH", priv.Target)
		return check
	}

	check.Status = "GRANTED"
	check.Detail = fmt.Sprintf("found at %s", path)
	return check
}

func (c *Checker) checkRoot(check models.PrivilegeCheck) models.PrivilegeCheck {
	if runtime.GOOS == "windows" {
		// On Windows, check if running as Administrator (simplified)
		check.Status = "GRANTED"
		check.Detail = "Windows admin check deferred"
		return check
	}

	if os.Geteuid() == 0 {
		check.Status = "GRANTED"
		check.Detail = "running as root (euid=0)"
	} else {
		check.Status = "DENIED"
		check.Detail = fmt.Sprintf("not running as root (euid=%d)", os.Geteuid())
	}
	return check
}

func (c *Checker) checkDocker(check models.PrivilegeCheck) models.PrivilegeCheck {
	socketPath := "/var/run/docker.sock"
	if runtime.GOOS == "windows" {
		socketPath = `\\.\pipe\docker_engine`
	}

	if _, err := os.Stat(socketPath); err != nil {
		check.Status = "DENIED"
		check.Detail = fmt.Sprintf("docker socket not accessible: %s", socketPath)
		return check
	}

	check.Status = "GRANTED"
	check.Detail = "docker socket accessible"
	return check
}

// HasDenied returns true if any checks in the report are DENIED.
func HasDenied(checks []models.PrivilegeCheck) bool {
	for _, c := range checks {
		if strings.EqualFold(c.Status, "DENIED") {
			return true
		}
	}
	return false
}
