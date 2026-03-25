package attach

import (
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

// PythonAttacher implements Runtime Attach for CPython / PyPy processes.
//
// Mechanism: py-spy is an external binary that reads the target process's
// memory via /proc/{pid}/mem (or ptrace on macOS/Windows).  No agent is
// injected into the target process, so the app does not need to restart.
//
// Requires:
//   - root  OR  SYS_PTRACE capability (Linux)
//   - py-spy binary on PATH or in AITOP_PLUGINS_DIR
type PythonAttacher struct {
	mu       sync.Mutex
	sessions map[int]struct{} // active PIDs
}

// NewPythonAttacher creates a PythonAttacher.
func NewPythonAttacher() *PythonAttacher {
	return &PythonAttacher{sessions: make(map[int]struct{})}
}

func (a *PythonAttacher) Runtime() Runtime { return RuntimePython }

// Detect scans for Python processes.
func (a *PythonAttacher) Detect() ([]Process, error) {
	if runtime.GOOS == "windows" {
		return detectPythonWindows()
	}
	return detectPythonUnix()
}

func detectPythonUnix() ([]Process, error) {
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
		if !isPythonProcess(cmdline) {
			continue
		}

		version := detectPythonVersion(cmdline)
		procs = append(procs, Process{
			PID:     pid,
			Runtime: RuntimePython,
			Name:    pythonServiceName(cmdline),
			CmdLine: cmdline,
			Version: version,
			Extra: map[string]string{
				"py_spy": defaultPySpyPath(),
			},
		})
	}
	return procs, nil
}

func detectPythonWindows() ([]Process, error) {
	out, err := exec.Command("wmic", "process", "where",
		"Name='python.exe' or Name='python3.exe'",
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
			Runtime: RuntimePython,
			Name:    pythonServiceName(cmdline),
			CmdLine: cmdline,
		})
	}
	return procs, nil
}

// Attach verifies that py-spy is available and SYS_PTRACE is accessible.
// py-spy is a non-intrusive sampler so "attach" only validates prerequisites.
func (a *PythonAttacher) Attach(ctx context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, active := a.sessions[pid]; active {
		return attachErr(ErrAlreadyActive, "py-spy session already active for PID %d", pid)
	}

	if err := checkPySpy(); err != nil {
		return err
	}

	if err := checkPtraceCapability(pid); err != nil {
		return err
	}

	a.sessions[pid] = struct{}{}
	return nil
}

// Detach removes the session record. py-spy processes are not persistent,
// so there is nothing to terminate.
func (a *PythonAttacher) Detach(_ context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.sessions, pid)
	return nil
}

// CollectProfile runs py-spy record for the requested duration and returns
// the raw collapsed-stack output (Brendan Gregg format).
func (a *PythonAttacher) CollectProfile(ctx context.Context, pid int, pt ProfileType, durationSec int) (*ProfileData, error) {
	pyspyPath, err := pySpyBin()
	if err != nil {
		return nil, attachErr(ErrBinaryNotFound, "py-spy not found: %v", err)
	}

	outFile := fmt.Sprintf("%s/aitop-pyspy-%d-%d.collapsed",
		os.TempDir(), pid, time.Now().UnixMilli())
	defer os.Remove(outFile)

	timeout := time.Duration(durationSec+15) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	args := []string{
		"record",
		"--format", "raw",
		"--output", outFile,
		"--pid", strconv.Itoa(pid),
		"--duration", strconv.Itoa(durationSec),
		"--nonblocking",
	}

	if pt == ProfileThread {
		// wall-clock (thread-aware) instead of only on-CPU
		args = append(args, "--threads")
	}

	cmd := exec.CommandContext(cmdCtx, pyspyPath, args...)
	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		return nil, mapPySpyError(msg, pid)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, fmt.Errorf("read py-spy output: %w", err)
	}

	return &ProfileData{
		PID:         pid,
		Runtime:     RuntimePython,
		ProfileType: pt,
		Format:      "collapsed",
		DurationSec: durationSec,
		CapturedAt:  time.Now(),
		SizeBytes:   len(data),
		Data:        data,
	}, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func isPythonProcess(cmdline string) bool {
	lower := strings.ToLower(cmdline)
	return strings.Contains(lower, "python") || strings.Contains(lower, "pypy")
}

func pythonServiceName(cmdline string) string {
	parts := strings.Fields(cmdline)
	if len(parts) == 0 {
		return "python-service"
	}
	for _, p := range parts[1:] {
		if strings.HasSuffix(p, ".py") {
			return filepath.Base(p)
		}
		if p == "-m" {
			continue
		}
		if !strings.HasPrefix(p, "-") {
			return filepath.Base(p)
		}
	}
	return filepath.Base(parts[0])
}

func detectPythonVersion(cmdline string) string {
	// e.g. "python3.11 app.py" → "3.11"
	parts := strings.Fields(cmdline)
	if len(parts) == 0 {
		return ""
	}
	base := filepath.Base(parts[0])
	if idx := strings.Index(base, "python"); idx >= 0 {
		v := base[idx+len("python"):]
		if strings.HasPrefix(v, "3") || strings.HasPrefix(v, "2") {
			return v
		}
	}
	return ""
}

func defaultPySpyPath() string {
	base := os.Getenv("AITOP_PLUGINS_DIR")
	if base == "" {
		base = "/opt/aitop/plugins"
	}
	return filepath.Join(base, "py-spy")
}

func pySpyBin() (string, error) {
	// Check plugin dir first, then PATH
	pluginBin := defaultPySpyPath()
	if _, err := os.Stat(pluginBin); err == nil {
		return pluginBin, nil
	}
	return exec.LookPath("py-spy")
}

func checkPySpy() error {
	if _, err := pySpyBin(); err != nil {
		return attachErr(ErrBinaryNotFound,
			"py-spy not found — deploy via Plugin Registry or install: pip install py-spy")
	}
	return nil
}

func checkPtraceCapability(pid int) error {
	// On Linux, try reading /proc/{pid}/mem — permission error indicates
	// we lack SYS_PTRACE or are not the process owner / root.
	if runtime.GOOS != "linux" {
		return nil
	}
	f, err := os.OpenFile(fmt.Sprintf("/proc/%d/mem", pid), os.O_RDONLY, 0)
	if err != nil {
		if os.IsPermission(err) {
			return attachErr(ErrPermissionDenied,
				"PID %d: SYS_PTRACE capability or root required for py-spy", pid)
		}
		// Process may have exited between detect and attach — that's OK.
		return nil
	}
	f.Close()
	return nil
}

func mapPySpyError(stderr string, pid int) error {
	lower := strings.ToLower(stderr)
	switch {
	case strings.Contains(lower, "permission") || strings.Contains(lower, "ptrace"):
		return attachErr(ErrPermissionDenied,
			"PID %d: SYS_PTRACE or root required for py-spy", pid)
	case strings.Contains(lower, "not found") || strings.Contains(lower, "no such process"):
		return attachErr(ErrProcessNotFound, "PID %d not found", pid)
	default:
		return fmt.Errorf("py-spy PID %d: %s", pid, stderr)
	}
}
