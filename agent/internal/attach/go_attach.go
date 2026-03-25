package attach

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GoAttacher implements Runtime Attach for Go processes via the
// net/http/pprof HTTP endpoint exposed at /debug/pprof/.
//
// Mechanism: If the target Go process imports net/http/pprof and starts
// an HTTP server, the endpoint is reachable at a well-known port.  No
// signal or agent injection is needed — Go's Attach mode equals Full mode.
//
// Common pprof ports probed: 6060, 8080, 9090
// Custom port: discoverable via AITOP_GO_PPROF_PORT environment variable
// or via /proc/{pid}/net/tcp6 scan (Linux).
type GoAttacher struct {
	mu       sync.Mutex
	sessions map[int]*goSession
}

type goSession struct {
	PID      int
	Endpoint string // http://host:port/debug/pprof
	AttachedAt time.Time
}

// NewGoAttacher creates a GoAttacher.
func NewGoAttacher() *GoAttacher {
	return &GoAttacher{sessions: make(map[int]*goSession)}
}

func (a *GoAttacher) Runtime() Runtime { return RuntimeGo }

// Detect scans for Go processes that expose a pprof endpoint.
func (a *GoAttacher) Detect() ([]Process, error) {
	if runtime.GOOS == "windows" {
		return detectGoWindows()
	}
	return detectGoUnix()
}

func detectGoUnix() ([]Process, error) {
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

		exePath, err := os.Readlink(fmt.Sprintf("/proc/%d/exe", pid))
		if err != nil {
			continue
		}
		cmdlineBytes, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err != nil {
			continue
		}
		cmdline := strings.ReplaceAll(string(cmdlineBytes), "\x00", " ")

		if !isGoExecutable(exePath) {
			continue
		}

		endpoint := probePprofEndpoint(pid)
		extra := map[string]string{}
		if endpoint != "" {
			extra["pprof_endpoint"] = endpoint
		}

		procs = append(procs, Process{
			PID:     pid,
			Runtime: RuntimeGo,
			Name:    goServiceName(exePath, cmdline),
			CmdLine: cmdline,
			Extra:   extra,
		})
	}
	return procs, nil
}

func detectGoWindows() ([]Process, error) {
	// Probe well-known pprof ports; Windows-specific process list omitted for brevity.
	ports := []int{6060, 8080, 9090}
	var procs []Process
	for _, port := range ports {
		ep := fmt.Sprintf("http://localhost:%d/debug/pprof/", port)
		if pprofReachable(ep, 1*time.Second) {
			procs = append(procs, Process{
				PID:     0, // unknown without WMI correlation
				Runtime: RuntimeGo,
				Name:    fmt.Sprintf("go-service-:%d", port),
				Extra:   map[string]string{"pprof_endpoint": ep},
			})
		}
	}
	return procs, nil
}

// Attach verifies that the pprof endpoint is reachable.
func (a *GoAttacher) Attach(ctx context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, active := a.sessions[pid]; active {
		return attachErr(ErrAlreadyActive, "Go pprof session already active for PID %d", pid)
	}

	endpoint := probePprofEndpoint(pid)
	if endpoint == "" {
		return attachErr(ErrPortUnavailable,
			"PID %d: pprof endpoint not found — ensure the app imports net/http/pprof and starts an HTTP listener", pid)
	}

	a.sessions[pid] = &goSession{
		PID:        pid,
		Endpoint:   endpoint,
		AttachedAt: time.Now(),
	}
	return nil
}

// Detach removes the session record.
func (a *GoAttacher) Detach(_ context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.sessions, pid)
	return nil
}

// CollectProfile fetches a pprof profile from the /debug/pprof/ endpoint.
//
// Profile types:
//   cpu     → GET /debug/pprof/profile?seconds=N
//   memory  → GET /debug/pprof/heap
//   goroutine → GET /debug/pprof/goroutine?debug=0
//   lock    → GET /debug/pprof/mutex
func (a *GoAttacher) CollectProfile(ctx context.Context, pid int, pt ProfileType, durationSec int) (*ProfileData, error) {
	a.mu.Lock()
	sess, active := a.sessions[pid]
	a.mu.Unlock()

	endpoint := "http://localhost:6060/debug/pprof"
	if active {
		endpoint = strings.TrimSuffix(sess.Endpoint, "/")
	} else {
		// Try to find endpoint on the fly
		if ep := probePprofEndpoint(pid); ep != "" {
			endpoint = strings.TrimSuffix(ep, "/")
		}
	}

	profileURL := buildPprofURL(endpoint, pt, durationSec)
	timeout := time.Duration(durationSec+15) * time.Second
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, profileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build pprof request: %w", err)
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, attachErr(ErrPortUnavailable,
			"PID %d: pprof request failed: %v", pid, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("PID %d: pprof returned HTTP %d", pid, resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20)) // 64 MB cap
	if err != nil {
		return nil, fmt.Errorf("PID %d: read pprof response: %w", pid, err)
	}

	return &ProfileData{
		PID:         pid,
		Runtime:     RuntimeGo,
		ProfileType: pt,
		Format:      "pprof",
		DurationSec: durationSec,
		CapturedAt:  time.Now(),
		SizeBytes:   len(data),
		Data:        data,
	}, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

var wellKnownPprofPorts = []int{6060, 8080, 9090, 9091, 2112}

func probePprofEndpoint(pid int) string {
	// Check env override first
	if envPort := os.Getenv("AITOP_GO_PPROF_PORT"); envPort != "" {
		if port, err := strconv.Atoi(envPort); err == nil {
			ep := fmt.Sprintf("http://localhost:%d/debug/pprof/", port)
			if pprofReachable(ep, 500*time.Millisecond) {
				return ep
			}
		}
	}

	// Try well-known ports
	for _, port := range wellKnownPprofPorts {
		ep := fmt.Sprintf("http://localhost:%d/debug/pprof/", port)
		if pprofReachable(ep, 300*time.Millisecond) {
			return ep
		}
	}

	// On Linux scan /proc/{pid}/net/tcp and tcp6 for listening ports
	if runtime.GOOS == "linux" {
		return findPprofViaProc(pid)
	}

	return ""
}

func pprofReachable(endpoint string, timeout time.Duration) bool {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(endpoint) //nolint:noctx
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// findPprofViaProc reads /proc/{pid}/net/tcp6 (or tcp) and probes each
// listening port for a pprof endpoint.
func findPprofViaProc(pid int) string {
	netFiles := []string{
		fmt.Sprintf("/proc/%d/net/tcp6", pid),
		fmt.Sprintf("/proc/%d/net/tcp", pid),
	}
	for _, f := range netFiles {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n")[1:] {
			fields := strings.Fields(line)
			if len(fields) < 4 || fields[3] != "0A" { // 0A = LISTEN
				continue
			}
			// local_address: 00000000:178C (hex port)
			addrParts := strings.Split(fields[1], ":")
			if len(addrParts) < 2 {
				continue
			}
			portHex := addrParts[len(addrParts)-1]
			port64, err := strconv.ParseInt(portHex, 16, 32)
			if err != nil {
				continue
			}
			ep := fmt.Sprintf("http://localhost:%d/debug/pprof/", port64)
			if pprofReachable(ep, 200*time.Millisecond) {
				return ep
			}
		}
	}
	return ""
}

func buildPprofURL(base string, pt ProfileType, durationSec int) string {
	switch pt {
	case ProfileCPU:
		return fmt.Sprintf("%s/profile?seconds=%d", base, durationSec)
	case ProfileMemory:
		return base + "/heap"
	case ProfileThread:
		return base + "/goroutine?debug=0"
	case ProfileLock:
		return base + "/mutex"
	default:
		return fmt.Sprintf("%s/profile?seconds=%d", base, durationSec)
	}
}

func isGoExecutable(exePath string) bool {
	data, err := os.ReadFile(exePath)
	if err != nil {
		return false
	}
	limit := 1 << 20 // 1 MB header scan
	if len(data) < limit {
		limit = len(data)
	}
	return strings.Contains(string(data[:limit]), "runtime.main")
}

func goServiceName(exePath, cmdline string) string {
	if exePath != "" {
		return exePath[strings.LastIndex(exePath, "/")+1:]
	}
	parts := strings.Fields(cmdline)
	if len(parts) > 0 {
		return parts[0][strings.LastIndex(parts[0], "/")+1:]
	}
	return "go-service"
}
