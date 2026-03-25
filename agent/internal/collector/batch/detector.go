// Package batch provides auto-detection and monitoring of batch processes.
//
// It detects batch processes via four strategies:
//   - Scheduler child processes (cron, systemd timer, Windows Task Scheduler)
//   - Framework pattern detection (Spring Batch, Quartz, Airflow, Celery)
//   - Execution pattern analysis (short-lived, non-server processes)
//   - Manual tags from agent configuration
package batch

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// BatchProcess represents a detected batch process.
type BatchProcess struct {
	PID         int       `json:"pid"`
	PPID        int       `json:"ppid"`
	Name        string    `json:"name"`        // human-readable name
	Command     string    `json:"command"`      // full cmdline
	Language    string    `json:"language"`     // java, python, go, dotnet, nodejs, shell, unknown
	Scheduler   string    `json:"scheduler"`    // cron, systemd, wts, quartz, airflow, celery, manual, unknown
	StartedAt   time.Time `json:"started_at"`
	DetectedVia string    `json:"detected_via"` // scheduler_child, framework_pattern, manual_tag
}

// DetectorConfig controls batch process detection.
type DetectorConfig struct {
	ManualBatches []ManualBatchConfig `yaml:"batch_processes"`
	PollInterval  time.Duration       `yaml:"poll_interval"`
}

// ManualBatchConfig defines a manually-tagged batch process pattern.
type ManualBatchConfig struct {
	Name     string `yaml:"name"`
	Pattern  string `yaml:"pattern"`
	Language string `yaml:"language"`
}

// DetectBatchProcesses scans the system for batch processes using all four
// detection strategies: scheduler child, framework pattern, execution pattern,
// and manual tags.
func DetectBatchProcesses(cfg DetectorConfig) []BatchProcess {
	if runtime.GOOS == "windows" {
		// TODO: implement Windows batch detection via WMI
		return detectManualBatches(cfg.ManualBatches)
	}

	var results []BatchProcess

	// Read all /proc entries once
	entries, err := os.ReadDir("/proc")
	if err != nil {
		// Fall back to manual batches only
		return detectManualBatches(cfg.ManualBatches)
	}

	type procInfo struct {
		pid     int
		ppid    int
		cmdline string
		startAt time.Time
	}

	var procs []procInfo
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 1 {
			continue
		}

		cmdlineBytes, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err != nil {
			continue
		}
		cmdline := strings.ReplaceAll(string(cmdlineBytes), "\x00", " ")
		cmdline = strings.TrimSpace(cmdline)
		if cmdline == "" {
			continue
		}

		ppid := readPPID(pid)
		startAt := readStartTime(pid)

		procs = append(procs, procInfo{
			pid:     pid,
			ppid:    ppid,
			cmdline: cmdline,
			startAt: startAt,
		})
	}

	// Build PID → cmdline map for parent lookups
	pidCmd := make(map[int]string, len(procs))
	for _, p := range procs {
		pidCmd[p.pid] = p.cmdline
	}

	seen := make(map[int]bool)

	// Rule 1: Scheduler child processes
	for _, p := range procs {
		if bp, ok := detectSchedulerChild(p.pid, p.ppid, p.cmdline, p.startAt, pidCmd); ok {
			if !seen[p.pid] {
				results = append(results, bp)
				seen[p.pid] = true
			}
		}
	}

	// Rule 2: Framework pattern detection
	for _, p := range procs {
		if seen[p.pid] {
			continue
		}
		if bp, ok := detectFrameworkPattern(p.pid, p.ppid, p.cmdline, p.startAt); ok {
			results = append(results, bp)
			seen[p.pid] = true
		}
	}

	// Rule 3: Manual tags from config
	for _, p := range procs {
		if seen[p.pid] {
			continue
		}
		if bp, ok := matchManualTag(p.pid, p.ppid, p.cmdline, p.startAt, cfg.ManualBatches); ok {
			results = append(results, bp)
			seen[p.pid] = true
		}
	}

	return results
}

// detectSchedulerChild checks if a process is a child of a known scheduler.
func detectSchedulerChild(pid, ppid int, cmdline string, startAt time.Time, pidCmd map[int]string) (BatchProcess, bool) {
	parentCmd := pidCmd[ppid]

	bp := BatchProcess{
		PID:         pid,
		PPID:        ppid,
		Command:     cmdline,
		StartedAt:   startAt,
		DetectedVia: "scheduler_child",
	}

	// cron: parent is crond or cron
	if strings.Contains(parentCmd, "crond") || strings.Contains(parentCmd, "cron") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = detectLanguage(cmdline)
		bp.Scheduler = "cron"
		return bp, true
	}

	// systemd timer: check if this process's service unit is a timer
	if isSystemdTimerChild(pid) {
		bp.Name = extractBatchName(cmdline)
		bp.Language = detectLanguage(cmdline)
		bp.Scheduler = "systemd"
		return bp, true
	}

	// Windows Task Scheduler: parent is taskeng.exe or svchost Schedule
	if strings.Contains(parentCmd, "taskeng.exe") || strings.Contains(parentCmd, "svchost") && strings.Contains(parentCmd, "Schedule") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = detectLanguage(cmdline)
		bp.Scheduler = "wts"
		return bp, true
	}

	return BatchProcess{}, false
}

// detectFrameworkPattern checks cmdline for known batch framework patterns.
func detectFrameworkPattern(pid, ppid int, cmdline string, startAt time.Time) (BatchProcess, bool) {
	lower := strings.ToLower(cmdline)

	bp := BatchProcess{
		PID:         pid,
		PPID:        ppid,
		Command:     cmdline,
		StartedAt:   startAt,
		DetectedVia: "framework_pattern",
	}

	// Spring Batch
	if strings.Contains(lower, "spring-batch") || strings.Contains(lower, "spring.batch") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = "java"
		bp.Scheduler = "quartz" // Spring Batch typically uses Quartz or TaskScheduler
		return bp, true
	}

	// Quartz scheduler
	if strings.Contains(lower, "quartz") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = "java"
		bp.Scheduler = "quartz"
		return bp, true
	}

	// Airflow
	if strings.Contains(lower, "airflow") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = "python"
		bp.Scheduler = "airflow"
		if strings.Contains(lower, "scheduler") {
			bp.Name = "airflow-scheduler"
		} else if strings.Contains(lower, "worker") {
			bp.Name = "airflow-worker"
		}
		return bp, true
	}

	// Celery
	if strings.Contains(lower, "celery") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = "python"
		bp.Scheduler = "celery"
		if strings.Contains(lower, "worker") {
			bp.Name = "celery-worker"
		} else if strings.Contains(lower, "beat") {
			bp.Name = "celery-beat"
		}
		return bp, true
	}

	// .NET JobHost pattern
	if strings.Contains(lower, "dotnet") && strings.Contains(lower, "jobhost") {
		bp.Name = extractBatchName(cmdline)
		bp.Language = "dotnet"
		bp.Scheduler = "unknown"
		return bp, true
	}

	return BatchProcess{}, false
}

// matchManualTag checks if a process matches any manual batch configuration.
func matchManualTag(pid, ppid int, cmdline string, startAt time.Time, manuals []ManualBatchConfig) (BatchProcess, bool) {
	for _, m := range manuals {
		if m.Pattern == "" {
			continue
		}
		matched, err := regexp.MatchString(m.Pattern, cmdline)
		if err != nil {
			// Treat pattern as a literal substring match on regex error
			matched = strings.Contains(cmdline, m.Pattern)
		}
		if matched {
			lang := m.Language
			if lang == "" {
				lang = detectLanguage(cmdline)
			}
			return BatchProcess{
				PID:         pid,
				PPID:        ppid,
				Name:        m.Name,
				Command:     cmdline,
				Language:    lang,
				Scheduler:   "manual",
				StartedAt:   startAt,
				DetectedVia: "manual_tag",
			}, true
		}
	}
	return BatchProcess{}, false
}

// detectManualBatches is a fallback that returns an empty slice for platforms
// where /proc scanning is not available (Windows).
func detectManualBatches(manuals []ManualBatchConfig) []BatchProcess {
	// On non-Linux platforms, manual batch detection would query the OS
	// process list via platform-specific APIs. For now, return nil.
	// TODO: implement Windows WMI process scanning for manual pattern matching.
	return nil
}

// ── Helper functions ────────────────────────────────────────────────────────

// readPPID reads the parent PID from /proc/{pid}/stat.
func readPPID(pid int) int {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return 0
	}
	// Format: pid (comm) state ppid ...
	// Find closing paren to skip comm field which may contain spaces
	s := string(data)
	closeParen := strings.LastIndex(s, ")")
	if closeParen < 0 || closeParen+2 >= len(s) {
		return 0
	}
	fields := strings.Fields(s[closeParen+2:])
	if len(fields) < 2 {
		return 0
	}
	ppid, _ := strconv.Atoi(fields[1])
	return ppid
}

// readStartTime reads the process start time from /proc/{pid}/stat.
// Returns approximate start time based on system boot time and clock ticks.
func readStartTime(pid int) time.Time {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return time.Time{}
	}
	s := string(data)
	closeParen := strings.LastIndex(s, ")")
	if closeParen < 0 || closeParen+2 >= len(s) {
		return time.Time{}
	}
	fields := strings.Fields(s[closeParen+2:])
	// starttime is field 20 (0-indexed from after ")" → index 19)
	if len(fields) < 20 {
		return time.Time{}
	}
	startTicks, err := strconv.ParseInt(fields[19], 10, 64)
	if err != nil {
		return time.Time{}
	}

	// Read boot time from /proc/stat
	bootTime := readBootTime()
	if bootTime == 0 {
		return time.Time{}
	}

	// clock ticks per second (usually 100 on Linux)
	clkTck := int64(100) // sysconf(_SC_CLK_TCK) default
	startSec := bootTime + startTicks/clkTck
	return time.Unix(startSec, 0)
}

// readBootTime returns the system boot time in seconds since epoch.
func readBootTime() int64 {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "btime ") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				bt, _ := strconv.ParseInt(fields[1], 10, 64)
				return bt
			}
		}
	}
	return 0
}

// isSystemdTimerChild checks if a PID belongs to a systemd timer unit.
func isSystemdTimerChild(pid int) bool {
	cgroupPath := fmt.Sprintf("/proc/%d/cgroup", pid)
	data, err := os.ReadFile(cgroupPath)
	if err != nil {
		return false
	}
	// systemd timer services typically have .timer-related unit names
	content := string(data)
	return strings.Contains(content, ".timer") || strings.Contains(content, "timer-")
}

// detectLanguage heuristically identifies the programming language from a cmdline.
func detectLanguage(cmdline string) string {
	lower := strings.ToLower(cmdline)
	switch {
	case strings.Contains(lower, "java") || strings.Contains(lower, "jdk"):
		return "java"
	case strings.Contains(lower, "python") || strings.Contains(lower, "python3"):
		return "python"
	case strings.Contains(lower, "dotnet") || strings.Contains(lower, ".dll"):
		return "dotnet"
	case strings.Contains(lower, "node") || strings.Contains(lower, "npm"):
		return "nodejs"
	case strings.HasSuffix(lower, ".sh") || strings.Contains(lower, "bash") || strings.Contains(lower, "/bin/sh"):
		return "shell"
	}

	// Check for Go binaries: single binary without extension and no interpreter
	parts := strings.Fields(cmdline)
	if len(parts) > 0 {
		exe := filepath.Base(parts[0])
		if !strings.Contains(exe, ".") && !strings.HasPrefix(exe, "-") {
			// Could be a compiled Go/C/Rust binary — default to unknown
			return "unknown"
		}
	}

	return "unknown"
}

// extractBatchName extracts a human-readable batch name from a cmdline.
func extractBatchName(cmdline string) string {
	parts := strings.Fields(cmdline)
	if len(parts) == 0 {
		return "unknown-batch"
	}

	exe := filepath.Base(parts[0])

	// For interpreters (java, python, etc.), use the script/jar name
	switch {
	case exe == "java" || exe == "python" || exe == "python3" || exe == "dotnet" || exe == "node":
		for _, p := range parts[1:] {
			if strings.HasPrefix(p, "-") {
				continue
			}
			base := filepath.Base(p)
			// Remove common extensions
			base = strings.TrimSuffix(base, ".jar")
			base = strings.TrimSuffix(base, ".py")
			base = strings.TrimSuffix(base, ".js")
			base = strings.TrimSuffix(base, ".dll")
			if base != "" {
				return base
			}
		}
	case exe == "bash" || exe == "sh":
		for _, p := range parts[1:] {
			if strings.HasPrefix(p, "-") {
				continue
			}
			return filepath.Base(p)
		}
	}

	return exe
}
