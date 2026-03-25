// Package attach provides Runtime Attach profiling for running processes.
//
// Each language runtime has a dedicated Attacher implementation:
//   - Java:   JVM Attach API (VirtualMachine.attach → loadAgent)
//   - Python: py-spy (PID-based external stack sampling)
//   - .NET:   EventPipe / DiagnosticsClient IPC
//   - Node.js: Chrome DevTools Protocol (SIGUSR1 → V8 Inspector)
//   - Go:     net/http/pprof HTTP polling
//
// All implementations satisfy the Attacher interface.
package attach

import (
	"context"
	"fmt"
	"time"
)

// ─── Error codes ──────────────────────────────────────────────────────────────

const (
	ErrPermissionDenied       = "ATTACH_PERMISSION_DENIED"
	ErrJDKRequired            = "ATTACH_JDK_REQUIRED"
	ErrPortUnavailable        = "ATTACH_PORT_UNAVAILABLE"
	ErrEventPipeUnsupported   = "ATTACH_EVENTPIPE_UNSUPPORTED"
	ErrAlreadyActive          = "ATTACH_ALREADY_ACTIVE"
	ErrProcessNotFound        = "ATTACH_PROCESS_NOT_FOUND"
	ErrBinaryNotFound         = "ATTACH_BINARY_NOT_FOUND"
	ErrTimeout                = "ATTACH_TIMEOUT"
)

// ─── Core types ───────────────────────────────────────────────────────────────

// Runtime identifies the language runtime of a process.
type Runtime string

const (
	RuntimeJava   Runtime = "java"
	RuntimePython Runtime = "python"
	RuntimeDotNet Runtime = "dotnet"
	RuntimeNode   Runtime = "nodejs"
	RuntimeGo     Runtime = "go"
)

// Process is a detected process that can be profiled via Runtime Attach.
type Process struct {
	PID         int     `json:"pid"`
	Runtime     Runtime `json:"runtime"`
	Name        string  `json:"name"`         // human-readable service/process name
	CmdLine     string  `json:"cmdline"`      // full command line
	Version     string  `json:"version"`      // runtime version (e.g. "17.0.9", "3.11.5")
	Extra       map[string]string `json:"extra"` // runtime-specific hints (endpoint, socket, …)
}

// ProfileType selects what kind of profile to capture.
type ProfileType string

const (
	ProfileCPU    ProfileType = "cpu"
	ProfileMemory ProfileType = "memory"
	ProfileThread ProfileType = "thread"
	ProfileLock   ProfileType = "lock"
)

// ProfileData is the raw result returned by CollectProfile.
type ProfileData struct {
	PID         int         `json:"pid"`
	Runtime     Runtime     `json:"runtime"`
	ServiceName string      `json:"service_name"`
	ProfileType ProfileType `json:"profile_type"`
	Format      string      `json:"format"`       // "collapsed", "pprof", "jfr", "nettrace", "cpuprofile"
	DurationSec int         `json:"duration_sec"`
	CapturedAt  time.Time   `json:"captured_at"`
	SizeBytes   int         `json:"size_bytes"`
	Data        []byte      `json:"-"`            // raw binary / text profile data
}

// AttachError is a structured error with an error code understood by the UI.
type AttachError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *AttachError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func attachErr(code, format string, args ...any) *AttachError {
	return &AttachError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// ─── Attacher interface ───────────────────────────────────────────────────────

// Attacher is the common interface every language-runtime attacher implements.
type Attacher interface {
	// Runtime returns the language runtime this attacher handles.
	Runtime() Runtime

	// Detect scans running processes and returns those this attacher can handle.
	Detect() ([]Process, error)

	// Attach starts a profiling session for the process with the given PID.
	// It is idempotent: calling Attach on an already-attached PID returns
	// ErrAlreadyActive.
	Attach(ctx context.Context, pid int) error

	// Detach stops the profiling session for the given PID.
	Detach(ctx context.Context, pid int) error

	// CollectProfile captures a profile snapshot for the given PID.
	// The caller must call Attach first; otherwise an error is returned.
	CollectProfile(ctx context.Context, pid int, pt ProfileType, durationSec int) (*ProfileData, error)
}

// ─── Manager ─────────────────────────────────────────────────────────────────

// Manager aggregates all registered Attacher implementations and provides a
// unified entry point for detection, attach, detach and profile collection.
type Manager struct {
	attachers []Attacher
}

// NewManager creates a Manager pre-populated with all built-in attachers.
func NewManager() *Manager {
	m := &Manager{}
	m.attachers = []Attacher{
		NewJavaAttacher(),
		NewPythonAttacher(),
		NewDotNetAttacher(),
		NewNodeAttacher(),
		NewGoAttacher(),
	}
	return m
}

// DetectAll returns all processes discovered by every registered attacher.
func (m *Manager) DetectAll() ([]Process, error) {
	var all []Process
	for _, a := range m.attachers {
		procs, err := a.Detect()
		if err != nil {
			continue // best-effort — log elsewhere
		}
		all = append(all, procs...)
	}
	return all, nil
}

// Attach delegates to the attacher that owns the given runtime.
func (m *Manager) Attach(ctx context.Context, runtime Runtime, pid int) error {
	a, err := m.find(runtime)
	if err != nil {
		return err
	}
	return a.Attach(ctx, pid)
}

// Detach delegates to the attacher that owns the given runtime.
func (m *Manager) Detach(ctx context.Context, runtime Runtime, pid int) error {
	a, err := m.find(runtime)
	if err != nil {
		return err
	}
	return a.Detach(ctx, pid)
}

// CollectProfile delegates to the attacher that owns the given runtime.
func (m *Manager) CollectProfile(ctx context.Context, runtime Runtime, pid int, pt ProfileType, durationSec int) (*ProfileData, error) {
	a, err := m.find(runtime)
	if err != nil {
		return nil, err
	}
	return a.CollectProfile(ctx, pid, pt, durationSec)
}

func (m *Manager) find(rt Runtime) (Attacher, error) {
	for _, a := range m.attachers {
		if a.Runtime() == rt {
			return a, nil
		}
	}
	return nil, fmt.Errorf("no attacher registered for runtime %q", rt)
}
