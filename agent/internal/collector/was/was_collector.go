// Package was provides a Collector for Web Application Server (WAS) configurations.
// Supports Tomcat, Spring Boot, JBoss/WildFly, and generic Java application servers.
package was

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers WAS configuration, JVM settings, GC logs, and thread dumps.
type Collector struct{}

// New returns a new WAS Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "was" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "windows", "darwin"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "exec", Target: "jcmd", Description: "collect JVM thread dump via jcmd"},
		{Type: "read", Target: "/proc/[pid]/cmdline", Description: "read JVM startup arguments"},
		{Type: "exec", Target: "java -version", Description: "get JRE version"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"was.server_info.v1",
		"was.jvm_settings.v1",
		"was.gc_summary.v1",
		"was.thread_summary.v1",
	}
}

// wasProcess represents a detected WAS process.
type wasProcess struct {
	Name    string // "tomcat", "spring-boot", "jboss", "java"
	PID     int
	CmdLine []string
	HomeDir string
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	procs := detectWASProcesses()
	if len(procs) == 0 {
		return models.DetectResult{Detected: false}, nil
	}
	details := map[string]string{
		"server": procs[0].Name,
		"pid":    strconv.Itoa(procs[0].PID),
	}
	return models.DetectResult{Detected: true, Details: details}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	procs := detectWASProcesses()
	if len(procs) == 0 {
		result.Status = models.StatusSkipped
		result.Errors = []models.CollectError{{
			Code:    models.ErrEnvNotDetected,
			Message: "no supported WAS (Tomcat/Spring Boot/JBoss) detected",
		}}
		result.Duration = time.Since(start)
		return result, nil
	}

	var errs []models.CollectError
	proc := procs[0] // primary WAS process

	// Server info
	if item, err := c.collectServerInfo(proc); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("server info: %v", err),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// JVM settings
	if item, err := c.collectJVMSettings(proc); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("jvm settings: %v", err),
			Command: fmt.Sprintf("read /proc/%d/cmdline", proc.PID),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// GC summary
	if item, err := c.collectGCSummary(proc); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("gc summary: %v", err),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// Thread summary via jcmd
	if item, err := c.collectThreadSummary(proc); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("thread summary: %v", err),
			Command: fmt.Sprintf("jcmd %d Thread.print", proc.PID),
			Suggestion: "run agent as the same user as the JVM process or as root",
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(errs) > 0 && len(result.Items) == 0 {
		result.Status = models.StatusFailed
	} else if len(errs) > 0 {
		result.Status = models.StatusPartial
	}
	return result, nil
}

// detectWASProcesses scans running processes for known WAS signatures.
func detectWASProcesses() []wasProcess {
	var results []wasProcess

	if runtime.GOOS == "linux" {
		results = detectLinuxWAS()
	} else {
		results = detectWASViaJPS()
	}

	return results
}

// detectLinuxWAS uses /proc filesystem to find WAS processes.
func detectLinuxWAS() []wasProcess {
	var procs []wasProcess
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}

		cmdlineBytes, err := os.ReadFile(filepath.Join("/proc", e.Name(), "cmdline"))
		if err != nil {
			continue
		}

		// cmdline is NUL-separated
		parts := strings.Split(string(cmdlineBytes), "\x00")
		if len(parts) == 0 || parts[0] == "" {
			continue
		}

		name := classifyJavaProcess(parts)
		if name == "" {
			continue
		}

		proc := wasProcess{
			Name:    name,
			PID:     pid,
			CmdLine: parts,
		}

		// Try to find CATALINA_HOME or app home
		for _, part := range parts {
			if strings.Contains(part, "catalina.home=") {
				proc.HomeDir = strings.TrimPrefix(part, "-Dcatalina.home=")
			} else if strings.Contains(part, "spring.config.location=") {
				proc.HomeDir = filepath.Dir(strings.TrimPrefix(part, "--spring.config.location="))
			}
		}

		procs = append(procs, proc)
	}
	return procs
}

// detectWASViaJPS uses the 'jps' JDK tool as a fallback.
func detectWASViaJPS() []wasProcess {
	out, err := exec.Command("jps", "-l").Output()
	if err != nil {
		return nil
	}

	var procs []wasProcess
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		mainClass := fields[1]
		name := classifyByMainClass(mainClass)
		if name != "" {
			procs = append(procs, wasProcess{
				Name: name,
				PID:  pid,
				CmdLine: []string{mainClass},
			})
		}
	}
	return procs
}

// classifyJavaProcess identifies the WAS type from the cmdline parts.
func classifyJavaProcess(parts []string) string {
	cmdline := strings.Join(parts, " ")
	switch {
	case strings.Contains(cmdline, "catalina") || strings.Contains(cmdline, "Bootstrap"):
		return "tomcat"
	case strings.Contains(cmdline, "org.springframework.boot"):
		return "spring-boot"
	case strings.Contains(cmdline, "jboss") || strings.Contains(cmdline, "wildfly") ||
		strings.Contains(cmdline, "standalone.sh"):
		return "jboss"
	case strings.Contains(cmdline, "jetty"):
		return "jetty"
	case strings.Contains(parts[0], "java") || strings.Contains(parts[0], "java.exe"):
		// Generic java process — only include if it has some known WAS indicator
		for _, p := range parts {
			if strings.HasSuffix(p, ".jar") || strings.Contains(p, "server") {
				return "java"
			}
		}
	}
	return ""
}

func classifyByMainClass(mainClass string) string {
	switch {
	case strings.Contains(mainClass, "Bootstrap"):
		return "tomcat"
	case strings.Contains(mainClass, "springframework"):
		return "spring-boot"
	case strings.Contains(mainClass, "jboss") || strings.Contains(mainClass, "Main"):
		return "jboss"
	}
	return ""
}

// collectServerInfo collects WAS type, version, and Java version.
func (c *Collector) collectServerInfo(proc wasProcess) (*models.CollectedItem, error) {
	info := map[string]interface{}{
		"server_type": proc.Name,
		"pid":         proc.PID,
	}

	if proc.HomeDir != "" {
		info["home_dir"] = proc.HomeDir
	}

	// Get Java version
	if javaVer, err := getJavaVersion(); err == nil {
		info["java_version"] = javaVer
	}

	// For Tomcat: read server.xml for version info
	if proc.Name == "tomcat" && proc.HomeDir != "" {
		serverXML := filepath.Join(proc.HomeDir, "conf", "server.xml")
		if data, err := os.ReadFile(serverXML); err == nil {
			info["server_xml_size"] = len(data)
			// Extract port from <Connector port=...>
			for _, line := range strings.Split(string(data), "\n") {
				line = strings.TrimSpace(line)
				if strings.Contains(line, "Connector") && strings.Contains(line, "port=") {
					if idx := strings.Index(line, `port="`); idx != -1 {
						portStr := line[idx+6:]
						if end := strings.Index(portStr, `"`); end != -1 {
							info["http_port"] = portStr[:end]
						}
					}
				}
			}
		}
	}

	return &models.CollectedItem{
		SchemaName:    "was.server_info",
		SchemaVersion: "1.0.0",
		MetricType:    "was_server_info",
		Category:      "it",
		Data:          info,
	}, nil
}

func getJavaVersion() (string, error) {
	out, err := exec.Command("java", "-version").CombinedOutput()
	if err != nil {
		return "", err
	}
	// Format: java version "17.0.8" 2023-07-18
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "version") {
			return strings.TrimSpace(line), nil
		}
	}
	return strings.TrimSpace(string(out)), nil
}

// JVMSettings holds parsed JVM startup parameters.
type JVMSettings struct {
	HeapInitMB  int      `json:"heap_init_mb"`  // -Xms
	HeapMaxMB   int      `json:"heap_max_mb"`   // -Xmx
	StackSizeKB int      `json:"stack_size_kb"` // -Xss
	GCType      string   `json:"gc_type"`       // -XX:+UseG1GC etc.
	GCLogPath   string   `json:"gc_log_path,omitempty"`
	JMXEnabled  bool     `json:"jmx_enabled"`
	JMXPort     string   `json:"jmx_port,omitempty"`
	SysProps    []string `json:"sys_props,omitempty"` // -D flags
}

// collectJVMSettings parses JVM flags from the process cmdline.
func (c *Collector) collectJVMSettings(proc wasProcess) (*models.CollectedItem, error) {
	settings := JVMSettings{}

	for _, arg := range proc.CmdLine {
		switch {
		case strings.HasPrefix(arg, "-Xms"):
			settings.HeapInitMB = parseMemoryMB(arg[4:])
		case strings.HasPrefix(arg, "-Xmx"):
			settings.HeapMaxMB = parseMemoryMB(arg[4:])
		case strings.HasPrefix(arg, "-Xss"):
			settings.StackSizeKB = parseMemoryKB(arg[4:])
		case strings.Contains(arg, "UseG1GC"):
			settings.GCType = "G1GC"
		case strings.Contains(arg, "UseZGC"):
			settings.GCType = "ZGC"
		case strings.Contains(arg, "UseShenandoahGC"):
			settings.GCType = "ShenandoahGC"
		case strings.Contains(arg, "UseParallelGC"):
			settings.GCType = "ParallelGC"
		case strings.Contains(arg, "UseConcMarkSweepGC"):
			settings.GCType = "CMS"
		case strings.Contains(arg, "Xlog:gc") || strings.Contains(arg, "gc:file="):
			if idx := strings.Index(arg, "file="); idx != -1 {
				settings.GCLogPath = strings.Trim(arg[idx+5:], `"`)
			}
		case strings.Contains(arg, "jmxremote.port="):
			settings.JMXEnabled = true
			settings.JMXPort = strings.TrimPrefix(arg, "-Dcom.sun.management.jmxremote.port=")
		case strings.Contains(arg, "jmxremote") && !strings.Contains(arg, "port"):
			settings.JMXEnabled = true
		case strings.HasPrefix(arg, "-D") && !strings.Contains(arg, "password") && !strings.Contains(arg, "secret"):
			settings.SysProps = append(settings.SysProps, arg)
		}
	}

	// Cap sys_props to 20 to avoid payload bloat
	if len(settings.SysProps) > 20 {
		settings.SysProps = settings.SysProps[:20]
	}

	return &models.CollectedItem{
		SchemaName:    "was.jvm_settings",
		SchemaVersion: "1.0.0",
		MetricType:    "was_jvm_settings",
		Category:      "it",
		Data:          settings,
	}, nil
}

// parseMemoryMB converts JVM memory strings like "512m", "2g", "1024k" to MB.
func parseMemoryMB(s string) int {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return 0
	}
	suffix := s[len(s)-1]
	numStr := s[:len(s)-1]
	n, err := strconv.Atoi(numStr)
	if err != nil {
		if v, err := strconv.Atoi(s); err == nil {
			return v / (1024 * 1024)
		}
		return 0
	}
	switch suffix {
	case 'k':
		return n / 1024
	case 'm':
		return n
	case 'g':
		return n * 1024
	default:
		return n / (1024 * 1024)
	}
}

// parseMemoryKB converts JVM memory strings to KB.
func parseMemoryKB(s string) int {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return 0
	}
	suffix := s[len(s)-1]
	numStr := s[:len(s)-1]
	n, err := strconv.Atoi(numStr)
	if err != nil {
		return 0
	}
	switch suffix {
	case 'k':
		return n
	case 'm':
		return n * 1024
	case 'g':
		return n * 1024 * 1024
	default:
		return n / 1024
	}
}

// GCSummary holds aggregated GC log statistics.
type GCSummary struct {
	LogPath        string  `json:"log_path,omitempty"`
	TotalGCCount   int     `json:"total_gc_count"`
	TotalPauseMs   float64 `json:"total_pause_ms"`
	AvgPauseMs     float64 `json:"avg_pause_ms"`
	MaxPauseMs     float64 `json:"max_pause_ms"`
	FullGCCount    int     `json:"full_gc_count"`
	RecentLines    int     `json:"recent_lines_scanned"`
	Note           string  `json:"note,omitempty"`
}

// collectGCSummary parses recent GC log entries.
func (c *Collector) collectGCSummary(proc wasProcess) (*models.CollectedItem, error) {
	summary := GCSummary{Note: "gc log not configured or not found"}

	// Find GC log path from cmdline
	gcLogPath := ""
	for _, arg := range proc.CmdLine {
		if strings.Contains(arg, "Xlog:gc") {
			if idx := strings.Index(arg, "file="); idx != -1 {
				gcLogPath = strings.Trim(arg[idx+5:], `":`)
				if comma := strings.Index(gcLogPath, ":"); comma != -1 {
					gcLogPath = gcLogPath[:comma]
				}
			}
		} else if strings.Contains(arg, "-Xloggc:") {
			gcLogPath = strings.TrimPrefix(arg, "-Xloggc:")
		}
	}

	if gcLogPath == "" {
		// Try common default paths
		for _, candidate := range gcLogPaths(proc) {
			if _, err := os.Stat(candidate); err == nil {
				gcLogPath = candidate
				break
			}
		}
	}

	if gcLogPath == "" {
		return &models.CollectedItem{
			SchemaName:    "was.gc_summary",
			SchemaVersion: "1.0.0",
			MetricType:    "was_gc_summary",
			Category:      "it",
			Data:          summary,
		}, nil
	}

	summary.LogPath = gcLogPath
	summary.Note = ""

	f, err := os.Open(gcLogPath)
	if err != nil {
		summary.Note = fmt.Sprintf("cannot open gc log: %v", err)
		return &models.CollectedItem{
			SchemaName:    "was.gc_summary",
			SchemaVersion: "1.0.0",
			MetricType:    "was_gc_summary",
			Category:      "it",
			Data:          summary,
		}, nil
	}
	defer f.Close()

	// Read last 500 lines for recent GC activity
	lines := tailLines(f, 500)
	summary.RecentLines = len(lines)

	for _, line := range lines {
		// JDK 11+ unified GC log: [0.123s][info][gc] GC(42) Pause Young ...  1.234ms
		// JDK 8 log: 2024-01-01T00:00:00.000+0000: 42.123: [GC (Allocation Failure) ...  2.345 secs]
		if !strings.Contains(line, "GC") {
			continue
		}
		if strings.Contains(strings.ToLower(line), "full gc") {
			summary.FullGCCount++
		}
		summary.TotalGCCount++

		// Try to extract pause time (ms)
		pauseMs := extractPauseMs(line)
		if pauseMs > 0 {
			summary.TotalPauseMs += pauseMs
			if pauseMs > summary.MaxPauseMs {
				summary.MaxPauseMs = pauseMs
			}
		}
	}

	if summary.TotalGCCount > 0 {
		summary.AvgPauseMs = summary.TotalPauseMs / float64(summary.TotalGCCount)
	}

	return &models.CollectedItem{
		SchemaName:    "was.gc_summary",
		SchemaVersion: "1.0.0",
		MetricType:    "was_gc_summary",
		Category:      "it",
		Data:          summary,
	}, nil
}

func gcLogPaths(proc wasProcess) []string {
	candidates := []string{
		"/var/log/tomcat/gc.log",
		"/opt/tomcat/logs/gc.log",
	}
	if proc.HomeDir != "" {
		candidates = append(candidates,
			filepath.Join(proc.HomeDir, "logs", "gc.log"),
			filepath.Join(proc.HomeDir, "gc.log"),
		)
	}
	return candidates
}

// extractPauseMs tries to parse a GC pause time from a log line.
// extractPauseMs tries to parse a GC pause time from a log line.
// Handles JDK 11+ format "32.5ms" and JDK 8 format "0.002 secs]".
func extractPauseMs(line string) float64 {
	// Remove trailing ']' used in JDK 8 logs: "... 0.002 secs]"
	line = strings.TrimRight(strings.TrimSpace(line), "]")
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return 0
	}

	last := fields[len(fields)-1]

	// JDK 11+ unified log: "32.5ms"
	if strings.HasSuffix(last, "ms") {
		val, err := strconv.ParseFloat(strings.TrimSuffix(last, "ms"), 64)
		if err == nil {
			return val
		}
	}

	// JDK 8 log: "0.002 secs" — last token is "secs", number is second-to-last
	if last == "secs" && len(fields) >= 2 {
		val, err := strconv.ParseFloat(fields[len(fields)-2], 64)
		if err == nil {
			return val * 1000
		}
	}

	// JDK 8 without space: "0.002secs"
	if strings.HasSuffix(last, "secs") {
		val, err := strconv.ParseFloat(strings.TrimSuffix(last, "secs"), 64)
		if err == nil {
			return val * 1000
		}
	}

	return 0
}

// tailLines returns the last n lines from an open file.
func tailLines(f *os.File, n int) []string {
	var lines []string
	scanner := bufio.NewScanner(f)
	ring := make([]string, n)
	i := 0
	count := 0
	for scanner.Scan() {
		ring[i%n] = scanner.Text()
		i++
		count++
	}
	if count <= n {
		return ring[:count]
	}
	// Reconstruct in order
	start := i % n
	for j := 0; j < n; j++ {
		lines = append(lines, ring[(start+j)%n])
	}
	return lines
}

// ThreadSummary holds thread dump statistics.
type ThreadSummary struct {
	TotalThreads   int            `json:"total_threads"`
	ThreadsByState map[string]int `json:"threads_by_state"`
	Note           string         `json:"note,omitempty"`
}

// collectThreadSummary runs jcmd <pid> Thread.print and summarizes the output.
func (c *Collector) collectThreadSummary(proc wasProcess) (*models.CollectedItem, error) {
	summary := ThreadSummary{
		ThreadsByState: make(map[string]int),
	}

	// Try jcmd first, fall back to jstack
	var out []byte
	var err error

	out, err = exec.Command("jcmd", strconv.Itoa(proc.PID), "Thread.print").CombinedOutput()
	if err != nil {
		out, err = exec.Command("jstack", strconv.Itoa(proc.PID)).CombinedOutput()
	}
	if err != nil {
		summary.Note = fmt.Sprintf("jcmd/jstack failed: %v", err)
		return &models.CollectedItem{
			SchemaName:    "was.thread_summary",
			SchemaVersion: "1.0.0",
			MetricType:    "was_thread_summary",
			Category:      "it",
			Data:          summary,
		}, nil
	}

	// Parse thread states from jstack/jcmd output
	// Format: "  java.lang.Thread.State: RUNNABLE"
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "java.lang.Thread.State:") {
			state := strings.TrimSpace(strings.TrimPrefix(line, "java.lang.Thread.State:"))
			// Normalize: "TIMED_WAITING (sleeping)" → "TIMED_WAITING"
			if idx := strings.Index(state, " "); idx != -1 {
				state = state[:idx]
			}
			summary.ThreadsByState[state]++
			summary.TotalThreads++
		}
	}

	return &models.CollectedItem{
		SchemaName:    "was.thread_summary",
		SchemaVersion: "1.0.0",
		MetricType:    "was_thread_summary",
		Category:      "it",
		Data:          summary,
	}, nil
}
