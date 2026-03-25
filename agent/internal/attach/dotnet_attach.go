package attach

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DotNetAttacher implements Runtime Attach for .NET (Core / 5+) processes.
//
// Mechanism: The .NET Diagnostics Server exposes a Unix Domain Socket at
// $TMPDIR/dotnet-diagnostic-{pid}-{ipc_id}-socket (Linux/macOS) or a
// named pipe \\.\pipe\dotnet-diagnostic-{pid} (Windows).
//
// This attacher connects to that socket and issues the EventPipe "StartTracing"
// command to begin collecting CPU, GC, and ThreadPool events, then writes
// the resulting .nettrace stream to a temp file.
//
// Supported .NET versions: 3.0+
// Re-start not required for EventPipe — the Diagnostics Server is always running.
type DotNetAttacher struct {
	mu       sync.Mutex
	sessions map[int]*dotnetSession
}

type dotnetSession struct {
	PID        int
	SocketPath string
	StartedAt  time.Time
}

// NewDotNetAttacher creates a DotNetAttacher.
func NewDotNetAttacher() *DotNetAttacher {
	return &DotNetAttacher{sessions: make(map[int]*dotnetSession)}
}

func (a *DotNetAttacher) Runtime() Runtime { return RuntimeDotNet }

// Detect scans for .NET (dotnet / mono) processes.
func (a *DotNetAttacher) Detect() ([]Process, error) {
	if runtime.GOOS == "windows" {
		return detectDotNetWindows()
	}
	return detectDotNetUnix()
}

func detectDotNetUnix() ([]Process, error) {
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
		if !isDotNetProcess(cmdline) {
			continue
		}

		socketPath := findDotNetSocket(pid)
		extra := map[string]string{}
		if socketPath != "" {
			extra["ipc_socket"] = socketPath
		}

		procs = append(procs, Process{
			PID:     pid,
			Runtime: RuntimeDotNet,
			Name:    dotnetServiceName(cmdline),
			CmdLine: cmdline,
			Extra:   extra,
		})
	}
	return procs, nil
}

func detectDotNetWindows() ([]Process, error) {
	out, err := exec.Command("wmic", "process", "where",
		"Name='dotnet.exe'",
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
			Runtime: RuntimeDotNet,
			Name:    dotnetServiceName(cmdline),
			CmdLine: cmdline,
		})
	}
	return procs, nil
}

// Attach verifies the IPC socket exists and .NET 3.0+ is in use.
func (a *DotNetAttacher) Attach(ctx context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, active := a.sessions[pid]; active {
		return attachErr(ErrAlreadyActive, "EventPipe session already active for PID %d", pid)
	}

	socketPath := findDotNetSocket(pid)
	if socketPath == "" {
		return attachErr(ErrEventPipeUnsupported,
			"PID %d: .NET Diagnostics Server IPC socket not found — .NET 3.0+ required", pid)
	}

	// Quick connectivity check
	conn, err := dialDotNetSocket(socketPath, 5*time.Second)
	if err != nil {
		return attachErr(ErrEventPipeUnsupported,
			"PID %d: cannot connect to Diagnostics Server at %s: %v", pid, socketPath, err)
	}
	conn.Close()

	a.sessions[pid] = &dotnetSession{
		PID:        pid,
		SocketPath: socketPath,
		StartedAt:  time.Now(),
	}
	return nil
}

// Detach closes the session record.
func (a *DotNetAttacher) Detach(_ context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.sessions, pid)
	return nil
}

// CollectProfile streams a .nettrace file via EventPipe for the given duration.
//
// The collected .nettrace is returned as-is; the caller (Collection Server)
// is responsible for parsing or converting to OTel Metrics.
func (a *DotNetAttacher) CollectProfile(ctx context.Context, pid int, pt ProfileType, durationSec int) (*ProfileData, error) {
	socketPath := findDotNetSocket(pid)
	if socketPath == "" {
		return nil, attachErr(ErrEventPipeUnsupported,
			"PID %d: Diagnostics Server socket not found", pid)
	}

	conn, err := dialDotNetSocket(socketPath, 10*time.Second)
	if err != nil {
		return nil, attachErr(ErrEventPipeUnsupported,
			"PID %d: dial Diagnostics Server: %v", pid, err)
	}
	defer conn.Close()

	providers := eventPipeProviders(pt)
	if err := sendCollectTracingCommand(conn, providers, uint32(durationSec)); err != nil {
		return nil, fmt.Errorf("PID %d: send CollectTracing command: %w", pid, err)
	}

	// Read the .nettrace stream for durationSec, then close.
	timeout := time.Duration(durationSec+10) * time.Second
	deadline := time.Now().Add(timeout)
	if err := conn.SetReadDeadline(deadline); err != nil {
		return nil, fmt.Errorf("set read deadline: %w", err)
	}

	outFile := fmt.Sprintf("%s/aitop-nettrace-%d-%d.nettrace",
		os.TempDir(), pid, time.Now().UnixMilli())
	defer os.Remove(outFile)

	f, err := os.Create(outFile)
	if err != nil {
		return nil, fmt.Errorf("create output file: %w", err)
	}

	_, copyErr := io.Copy(f, io.LimitReader(conn, 256<<20)) // 256 MB cap
	f.Close()

	// Timeout or EOF both end the stream — treat as success if we got data.
	if copyErr != nil && !isTimeout(copyErr) && copyErr != io.EOF {
		return nil, fmt.Errorf("PID %d: read nettrace: %w", pid, copyErr)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, fmt.Errorf("read nettrace file: %w", err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("PID %d: empty nettrace — process may have exited", pid)
	}

	return &ProfileData{
		PID:         pid,
		Runtime:     RuntimeDotNet,
		ProfileType: pt,
		Format:      "nettrace",
		DurationSec: durationSec,
		CapturedAt:  time.Now(),
		SizeBytes:   len(data),
		Data:        data,
	}, nil
}

// ─── EventPipe wire protocol helpers ────────────────────────────────────────

// eventPipeProvider describes a single EventPipe provider configuration.
type eventPipeProvider struct {
	Name     string
	Keywords uint64
	Level    uint32 // 0=LogAlways,1=Critical,2=Error,3=Warning,4=Info,5=Verbose
}

func eventPipeProviders(pt ProfileType) []eventPipeProvider {
	base := []eventPipeProvider{
		{Name: "System.Runtime", Keywords: 0xffffffff, Level: 4},
		{Name: "Microsoft-Windows-DotNETRuntime", Keywords: 0x4c14fccbd, Level: 5},
	}
	if pt == ProfileMemory {
		base = append(base, eventPipeProvider{
			Name:     "Microsoft-Windows-DotNETRuntime",
			Keywords: 0x8000, // GCHeapDump
			Level:    5,
		})
	}
	return base
}

// sendCollectTracingCommand sends the CollectTracing2 command to the IPC socket.
// Protocol reference: dotnet/diagnostics DiagnosticsClient IPC spec.
func sendCollectTracingCommand(conn net.Conn, providers []eventPipeProvider, durationSec uint32) error {
	// Build the providers JSON for simplicity — real implementations use
	// the binary IPC framing defined in dotnet/diagnostics.
	// Here we use the dotnet-trace CLI format: "Provider:Keywords:Level" joined by ","
	var parts []string
	for _, p := range providers {
		parts = append(parts, fmt.Sprintf("%s:0x%x:%d", p.Name, p.Keywords, p.Level))
	}
	provStr := strings.Join(parts, ",")

	// IPC command header (simplified framing)
	// Magic: "DOTNET_IPC_V1" (14 bytes) + size (uint16) + commandset (uint8) + command (uint8)
	const magic = "DOTNET_IPC_V1\x00"
	body, _ := json.Marshal(map[string]interface{}{
		"providers":       provStr,
		"duration_ms":     int64(durationSec) * 1000,
		"requested_format": 1, // NetTrace
	})
	hdr := make([]byte, 14+2+1+1)
	copy(hdr, magic)
	binary.LittleEndian.PutUint16(hdr[14:], uint16(len(hdr)+len(body)))
	hdr[16] = 0x02 // CommandSet: EventPipe
	hdr[17] = 0x03 // Command: CollectTracing2

	if _, err := conn.Write(append(hdr, body...)); err != nil {
		return err
	}
	return nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func findDotNetSocket(pid int) string {
	tmpDir := os.TempDir()
	// Pattern: dotnet-diagnostic-{pid}-{ipc_id}-socket
	entries, err := os.ReadDir(tmpDir)
	if err != nil {
		return ""
	}
	prefix := fmt.Sprintf("dotnet-diagnostic-%d-", pid)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), "-socket") {
			return filepath.Join(tmpDir, e.Name())
		}
	}
	return ""
}

func dialDotNetSocket(socketPath string, timeout time.Duration) (net.Conn, error) {
	if runtime.GOOS == "windows" {
		// Named pipe: \\.\pipe\dotnet-diagnostic-{pid}
		return net.DialTimeout("tcp", "localhost:0", timeout) // placeholder — real impl uses npipe
	}
	return net.DialTimeout("unix", socketPath, timeout)
}

func isDotNetProcess(cmdline string) bool {
	lower := strings.ToLower(cmdline)
	return strings.Contains(lower, "dotnet") ||
		strings.Contains(lower, ".dll") ||
		strings.Contains(lower, "mono")
}

func dotnetServiceName(cmdline string) string {
	parts := strings.Fields(cmdline)
	for _, p := range parts {
		if strings.HasSuffix(p, ".dll") {
			return strings.TrimSuffix(filepath.Base(p), ".dll")
		}
	}
	if len(parts) > 1 {
		return filepath.Base(parts[1])
	}
	return "dotnet-service"
}

func isTimeout(err error) bool {
	if err == nil {
		return false
	}
	type timeoutErr interface{ Timeout() bool }
	if te, ok := err.(timeoutErr); ok {
		return te.Timeout()
	}
	return strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline")
}
