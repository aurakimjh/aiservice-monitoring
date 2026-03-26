package attach

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// JavaAttacher implements Runtime Attach for JVM processes.
//
// Mechanism: aitop-attach-helper.jar wraps JDK tools.jar
// VirtualMachine.attach(pid) + vm.loadAgent(agentJar, args).
// The helper is invoked as a child process so that Go does not need to
// link against JNI or any Java tooling at compile time.
type JavaAttacher struct {
	mu       sync.Mutex
	sessions map[int]*javaSession // pid → active session
}

type javaSession struct {
	PID              int
	AgentJar         string
	AttachedAt       time.Time
	VirtualThreadInfo *VirtualThreadInfo // non-nil if JDK 21+
}

// NewJavaAttacher creates a JavaAttacher.
func NewJavaAttacher() *JavaAttacher {
	return &JavaAttacher{sessions: make(map[int]*javaSession)}
}

func (a *JavaAttacher) Runtime() Runtime { return RuntimeJava }

// Detect scans /proc (Linux/macOS) for JVM processes.
func (a *JavaAttacher) Detect() ([]Process, error) {
	if runtime.GOOS == "windows" {
		return detectJavaWindows()
	}
	return detectJavaUnix()
}

func detectJavaUnix() ([]Process, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, fmt.Errorf("read /proc: %w", err)
	}

	var procs []Process
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil || pid <= 1 {
			continue
		}

		cmdlineBytes, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err != nil {
			continue
		}
		cmdline := strings.ReplaceAll(string(cmdlineBytes), "\x00", " ")
		if !isJVMProcess(cmdline) {
			continue
		}

		version := detectJavaVersion(pid)
		procs = append(procs, Process{
			PID:     pid,
			Runtime: RuntimeJava,
			Name:    javaServiceName(cmdline),
			CmdLine: cmdline,
			Version: version,
			Extra:   map[string]string{"attach_helper": defaultAttachHelperPath()},
		})
	}
	return procs, nil
}

func detectJavaWindows() ([]Process, error) {
	// Use WMIC to list java.exe processes
	out, err := exec.Command("wmic", "process", "where", "Name='java.exe'",
		"get", "ProcessId,CommandLine", "/format:csv").Output()
	if err != nil {
		return nil, fmt.Errorf("wmic: %w", err)
	}

	var procs []Process
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Node") {
			continue
		}
		parts := strings.SplitN(line, ",", 3)
		if len(parts) < 3 {
			continue
		}
		pid, err := strconv.Atoi(strings.TrimSpace(parts[2]))
		if err != nil {
			continue
		}
		cmdline := strings.TrimSpace(parts[1])
		procs = append(procs, Process{
			PID:     pid,
			Runtime: RuntimeJava,
			Name:    javaServiceName(cmdline),
			CmdLine: cmdline,
			Extra:   map[string]string{"attach_helper": defaultAttachHelperPath()},
		})
	}
	return procs, nil
}

// Attach invokes the aitop-attach-helper to perform JVM Attach.
//
// The helper runs:
//   java -jar aitop-attach-helper.jar --pid <pid> --agent <agentJar>
//
// Exit codes from the helper map to ATTACH_* error codes.
func (a *JavaAttacher) Attach(ctx context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, active := a.sessions[pid]; active {
		return attachErr(ErrAlreadyActive, "JVM attach session already active for PID %d", pid)
	}

	helperJar := defaultAttachHelperPath()
	if _, err := os.Stat(helperJar); err != nil {
		return attachErr(ErrBinaryNotFound, "aitop-attach-helper.jar not found at %s", helperJar)
	}

	agentJar := defaultAgentJarPath()
	if _, err := os.Stat(agentJar); err != nil {
		return attachErr(ErrBinaryNotFound, "aitop-java-agent.jar not found at %s", agentJar)
	}

	javaExe, err := findJavaExecutable()
	if err != nil {
		return attachErr(ErrJDKRequired, "java executable not found: %v", err)
	}

	args := []string{
		"-jar", helperJar,
		"--pid", strconv.Itoa(pid),
		"--agent", agentJar,
		"--action", "attach",
	}

	cmdCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, javaExe, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		return mapJavaHelperError(msg, pid)
	}

	// Probe JDK version to enable Virtual Thread monitoring on JDK 21+
	vtInfo, _ := DetectVirtualThreadSupport(pid)
	if vtInfo != nil && vtInfo.VirtualThreadEnabled {
		// Activate JFR Virtual Thread event subscription via helper
		vtArgs := []string{
			"-jar", helperJar,
			"--pid", strconv.Itoa(pid),
			"--action", "vt-subscribe",
		}
		vtCmd := exec.Command(javaExe, vtArgs...)
		_ = vtCmd.Run() // best-effort; helper may not support vt-subscribe yet
	}

	a.sessions[pid] = &javaSession{
		PID:               pid,
		AgentJar:          agentJar,
		AttachedAt:        time.Now(),
		VirtualThreadInfo: vtInfo,
	}
	return nil
}

// Detach unloads the agent from the target JVM.
func (a *JavaAttacher) Detach(ctx context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	delete(a.sessions, pid)

	helperJar := defaultAttachHelperPath()
	if _, err := os.Stat(helperJar); err != nil {
		return nil // best-effort: helper gone, just remove session
	}

	javaExe, err := findJavaExecutable()
	if err != nil {
		return nil // best-effort
	}

	agentJar := defaultAgentJarPath()
	args := []string{
		"-jar", helperJar,
		"--pid", strconv.Itoa(pid),
		"--agent", agentJar,
		"--action", "detach",
	}

	cmdCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, javaExe, args...)
	_ = cmd.Run() // best-effort
	return nil
}

// IsVirtualThreadEnabled returns true if the session for pid has JDK 21+
// Virtual Thread monitoring active.
func (a *JavaAttacher) IsVirtualThreadEnabled(pid int) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	s, ok := a.sessions[pid]
	return ok && s.VirtualThreadInfo != nil && s.VirtualThreadInfo.VirtualThreadEnabled
}

// CollectProfile uses async-profiler via the helper for a live snapshot,
// or falls back to JFR if async-profiler is unavailable.
func (a *JavaAttacher) CollectProfile(ctx context.Context, pid int, pt ProfileType, durationSec int) (*ProfileData, error) {
	javaExe, err := findJavaExecutable()
	if err != nil {
		return nil, attachErr(ErrJDKRequired, "java not found: %v", err)
	}

	outFile := fmt.Sprintf("%s/aitop-jattach-%d-%d.jfr",
		os.TempDir(), pid, time.Now().UnixMilli())
	defer os.Remove(outFile)

	helperJar := defaultAttachHelperPath()

	event := jfrEvent(pt)
	args := []string{
		"-jar", helperJar,
		"--pid", strconv.Itoa(pid),
		"--action", "profile",
		"--event", event,
		"--duration", strconv.Itoa(durationSec),
		"--output", outFile,
	}

	timeout := time.Duration(durationSec+15) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, javaExe, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		return nil, mapJavaHelperError(msg, pid)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, fmt.Errorf("read JFR output: %w", err)
	}

	return &ProfileData{
		PID:         pid,
		Runtime:     RuntimeJava,
		ProfileType: pt,
		Format:      "jfr",
		DurationSec: durationSec,
		CapturedAt:  time.Now(),
		SizeBytes:   len(data),
		Data:        data,
	}, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func isJVMProcess(cmdline string) bool {
	return strings.Contains(cmdline, "java") &&
		(strings.Contains(cmdline, "-cp") ||
			strings.Contains(cmdline, "-jar") ||
			strings.Contains(cmdline, ".jar") ||
			strings.Contains(cmdline, "java.class.path"))
}

func javaServiceName(cmdline string) string {
	parts := strings.Fields(cmdline)
	for i, p := range parts {
		if p == "-jar" && i+1 < len(parts) {
			return filepath.Base(parts[i+1])
		}
	}
	for _, p := range parts {
		if strings.HasSuffix(p, ".jar") {
			return filepath.Base(p)
		}
		if strings.Contains(p, ".") && !strings.HasPrefix(p, "-") &&
			!strings.HasSuffix(p, ".java") {
			// Main class like com.example.App
			idx := strings.LastIndex(p, ".")
			if idx >= 0 {
				return p[idx+1:]
			}
			return p
		}
	}
	return "java-service"
}

func detectJavaVersion(pid int) string {
	// Try reading /proc/{pid}/environ for JAVA_VERSION
	envBytes, err := os.ReadFile(fmt.Sprintf("/proc/%d/environ", pid))
	if err != nil {
		return ""
	}
	for _, kv := range strings.Split(string(envBytes), "\x00") {
		if strings.HasPrefix(kv, "JAVA_VERSION=") {
			return strings.TrimPrefix(kv, "JAVA_VERSION=")
		}
	}
	return ""
}

func findJavaExecutable() (string, error) {
	// Prefer JAVA_HOME/bin/java
	if jh := os.Getenv("JAVA_HOME"); jh != "" {
		exe := filepath.Join(jh, "bin", "java")
		if runtime.GOOS == "windows" {
			exe += ".exe"
		}
		if _, err := os.Stat(exe); err == nil {
			return exe, nil
		}
	}
	return exec.LookPath("java")
}

func defaultAttachHelperPath() string {
	base := os.Getenv("AITOP_PLUGINS_DIR")
	if base == "" {
		base = "/opt/aitop/plugins"
	}
	return filepath.Join(base, "aitop-attach-helper.jar")
}

func defaultAgentJarPath() string {
	base := os.Getenv("AITOP_PLUGINS_DIR")
	if base == "" {
		base = "/opt/aitop/plugins"
	}
	return filepath.Join(base, "aitop-java-agent.jar")
}

func jfrEvent(pt ProfileType) string {
	switch pt {
	case ProfileMemory:
		return "alloc"
	case ProfileLock:
		return "lock"
	case ProfileThread:
		return "wall"
	default:
		return "cpu"
	}
}

func mapJavaHelperError(stderr string, pid int) error {
	lower := strings.ToLower(stderr)
	switch {
	case strings.Contains(lower, "permission denied") || strings.Contains(lower, "access denied"):
		return attachErr(ErrPermissionDenied,
			"PID %d: process owner mismatch — run AITOP Agent as root or same user", pid)
	case strings.Contains(lower, "tools.jar") || strings.Contains(lower, "jdk required") ||
		strings.Contains(lower, "attach not supported"):
		return attachErr(ErrJDKRequired,
			"PID %d: JDK not found — JRE only installations cannot Attach", pid)
	case strings.Contains(lower, "already"):
		return attachErr(ErrAlreadyActive, "PID %d: profiling session already active", pid)
	default:
		return fmt.Errorf("JVM attach helper PID %d: %s", pid, stderr)
	}
}
