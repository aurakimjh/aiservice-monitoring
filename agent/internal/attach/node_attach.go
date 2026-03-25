package attach

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// NodeAttacher implements Runtime Attach for Node.js processes via the
// Chrome DevTools Protocol (CDP).
//
// Mechanism:
//  1. Send SIGUSR1 to the target Node.js process to activate the V8 Inspector
//     on localhost:9229 (if not already listening).
//  2. Fetch ws://127.0.0.1:9229/json to discover the WebSocket debugger URL.
//  3. Open a WebSocket connection and invoke:
//       Profiler.enable  → Profiler.start
//       (wait N seconds)
//       Profiler.stop    → returns CPU Profile JSON
//
// Requires: Node.js 6.3+ (--inspect / SIGUSR1 support)
// Security: Inspector binds to 127.0.0.1 only; never expose to external network.
type NodeAttacher struct {
	mu       sync.Mutex
	sessions map[int]*nodeSession
}

type nodeSession struct {
	PID        int
	InspectPort int
	AttachedAt time.Time
}

// NewNodeAttacher creates a NodeAttacher.
func NewNodeAttacher() *NodeAttacher {
	return &NodeAttacher{sessions: make(map[int]*nodeSession)}
}

func (a *NodeAttacher) Runtime() Runtime { return RuntimeNode }

// Detect scans for Node.js processes.
func (a *NodeAttacher) Detect() ([]Process, error) {
	if runtime.GOOS == "windows" {
		return detectNodeWindows()
	}
	return detectNodeUnix()
}

func detectNodeUnix() ([]Process, error) {
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
		if !isNodeProcess(cmdline) {
			continue
		}

		port := detectInspectPort(cmdline)
		extra := map[string]string{}
		if port > 0 {
			extra["inspect_port"] = strconv.Itoa(port)
		}

		procs = append(procs, Process{
			PID:     pid,
			Runtime: RuntimeNode,
			Name:    nodeServiceName(cmdline),
			CmdLine: cmdline,
			Extra:   extra,
		})
	}
	return procs, nil
}

func detectNodeWindows() ([]Process, error) {
	out, err := exec.Command("wmic", "process", "where",
		"Name='node.exe'",
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
			Runtime: RuntimeNode,
			Name:    nodeServiceName(cmdline),
			CmdLine: cmdline,
		})
	}
	return procs, nil
}

// Attach sends SIGUSR1 to activate the V8 Inspector if not already active.
func (a *NodeAttacher) Attach(ctx context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, active := a.sessions[pid]; active {
		return attachErr(ErrAlreadyActive, "Node.js Inspector session already active for PID %d", pid)
	}

	// Send SIGUSR1 to activate the inspector (no-op if already active)
	if err := sendSIGUSR1(pid); err != nil {
		return attachErr(ErrPermissionDenied,
			"PID %d: cannot send SIGUSR1 — %v", pid, err)
	}

	// Wait briefly for the inspector to open
	port, err := waitForInspector(pid, 3*time.Second)
	if err != nil {
		return attachErr(ErrPortUnavailable,
			"PID %d: V8 Inspector did not start — %v", pid, err)
	}

	a.sessions[pid] = &nodeSession{
		PID:         pid,
		InspectPort: port,
		AttachedAt:  time.Now(),
	}
	return nil
}

// Detach removes the session.  The V8 Inspector keeps running — it
// cannot be stopped remotely without restarting the process.
func (a *NodeAttacher) Detach(_ context.Context, pid int) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.sessions, pid)
	return nil
}

// CollectProfile uses CDP Profiler.enable / Profiler.start / Profiler.stop
// to collect a CPU profile and returns it as a Chrome CPU Profile JSON blob.
func (a *NodeAttacher) CollectProfile(ctx context.Context, pid int, pt ProfileType, durationSec int) (*ProfileData, error) {
	a.mu.Lock()
	sess, active := a.sessions[pid]
	a.mu.Unlock()

	port := 9229 // default
	if active {
		port = sess.InspectPort
	}

	// Discover WebSocket URL via /json endpoint
	wsURL, err := discoverCDPWebSocket(port, 5*time.Second)
	if err != nil {
		return nil, attachErr(ErrPortUnavailable,
			"PID %d: CDP /json endpoint unreachable on port %d: %v", pid, port, err)
	}

	// Run profile via CDP over WebSocket (minimalist text-frame client)
	data, err := runCDPProfile(ctx, wsURL, durationSec)
	if err != nil {
		return nil, fmt.Errorf("PID %d: CDP profile: %w", pid, err)
	}

	return &ProfileData{
		PID:         pid,
		Runtime:     RuntimeNode,
		ProfileType: pt,
		Format:      "cpuprofile",
		DurationSec: durationSec,
		CapturedAt:  time.Now(),
		SizeBytes:   len(data),
		Data:        data,
	}, nil
}

// ─── CDP helpers ─────────────────────────────────────────────────────────────

// cdpTarget is returned by /json endpoint.
type cdpTarget struct {
	WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	Type                 string `json:"type"`
}

func discoverCDPWebSocket(port int, timeout time.Duration) (string, error) {
	url := fmt.Sprintf("http://127.0.0.1:%d/json", port)
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url) //nolint:noctx
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var targets []cdpTarget
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return "", fmt.Errorf("decode /json: %w", err)
	}
	for _, t := range targets {
		if t.Type == "node" && t.WebSocketDebuggerURL != "" {
			return t.WebSocketDebuggerURL, nil
		}
	}
	if len(targets) > 0 && targets[0].WebSocketDebuggerURL != "" {
		return targets[0].WebSocketDebuggerURL, nil
	}
	return "", fmt.Errorf("no debuggable targets on port %d", port)
}

// runCDPProfile opens a minimal WebSocket connection (RFC 6455 text frames),
// sends CDP Profiler.enable + start, waits durationSec, then calls stop.
func runCDPProfile(ctx context.Context, wsURL string, durationSec int) ([]byte, error) {
	// Parse host/path from ws:// URL
	host, path := parseCDPURL(wsURL)
	if host == "" {
		return nil, fmt.Errorf("invalid CDP URL: %s", wsURL)
	}

	conn, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("dial CDP: %w", err)
	}
	defer conn.Close()

	// HTTP upgrade handshake
	upgrade := fmt.Sprintf(
		"GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"+
			"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
		path, host)
	if _, err := io.WriteString(conn, upgrade); err != nil {
		return nil, err
	}
	// Read upgrade response
	br := bufio.NewReader(conn)
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("read upgrade response: %w", err)
		}
		if strings.TrimSpace(line) == "" {
			break
		}
	}

	send := func(id int, method string, params map[string]interface{}) error {
		msg, _ := json.Marshal(map[string]interface{}{
			"id":     id,
			"method": method,
			"params": params,
		})
		return wsSendText(conn, msg)
	}

	// 1. Enable profiler
	if err := send(1, "Profiler.enable", nil); err != nil {
		return nil, err
	}
	if _, err := wsReadText(br); err != nil {
		return nil, err
	}

	// 2. Start profiling (1ms sampling interval)
	if err := send(2, "Profiler.start", map[string]interface{}{"interval": 1000}); err != nil {
		return nil, err
	}
	if _, err := wsReadText(br); err != nil {
		return nil, err
	}

	// 3. Wait for durationSec
	select {
	case <-time.After(time.Duration(durationSec) * time.Second):
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	// 4. Stop profiling and read profile
	if err := send(3, "Profiler.stop", nil); err != nil {
		return nil, err
	}
	resp, err := wsReadText(br)
	if err != nil {
		return nil, err
	}

	// Extract "result.profile" from the CDP response
	var cdpResp struct {
		Result struct {
			Profile json.RawMessage `json:"profile"`
		} `json:"result"`
	}
	if err := json.Unmarshal(resp, &cdpResp); err != nil {
		return resp, nil // return raw if parse fails
	}
	if len(cdpResp.Result.Profile) > 0 {
		return cdpResp.Result.Profile, nil
	}
	return resp, nil
}

// wsSendText sends a single unmasked WebSocket text frame.
func wsSendText(conn net.Conn, payload []byte) error {
	n := len(payload)
	var header []byte
	header = append(header, 0x81) // FIN + text opcode
	if n < 126 {
		header = append(header, byte(n))
	} else if n < 65536 {
		header = append(header, 126, byte(n>>8), byte(n))
	} else {
		header = append(header, 127,
			byte(n>>56), byte(n>>48), byte(n>>40), byte(n>>32),
			byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
	_, err := conn.Write(append(header, payload...))
	return err
}

// wsReadText reads a single WebSocket frame and returns the payload.
func wsReadText(r *bufio.Reader) ([]byte, error) {
	b0, err := r.ReadByte()
	if err != nil {
		return nil, err
	}
	b1, err := r.ReadByte()
	if err != nil {
		return nil, err
	}

	payloadLen := int64(b1 & 0x7f)
	switch payloadLen {
	case 126:
		var ext [2]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return nil, err
		}
		payloadLen = int64(ext[0])<<8 | int64(ext[1])
	case 127:
		var ext [8]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return nil, err
		}
		for i, v := range ext {
			payloadLen |= int64(v) << (56 - 8*i)
		}
	}
	_ = b0 // opcode / FIN not checked for brevity

	data := make([]byte, payloadLen)
	_, err = io.ReadFull(r, data)
	return data, err
}

func parseCDPURL(wsURL string) (host, path string) {
	// ws://127.0.0.1:9229/devtools/page/...
	s := strings.TrimPrefix(wsURL, "ws://")
	s = strings.TrimPrefix(s, "wss://")
	idx := strings.Index(s, "/")
	if idx < 0 {
		return s, "/"
	}
	return s[:idx], s[idx:]
}

// ─── process helpers ─────────────────────────────────────────────────────────

func isNodeProcess(cmdline string) bool {
	lower := strings.ToLower(cmdline)
	return strings.Contains(lower, "node ") ||
		strings.HasPrefix(lower, "node\x00") ||
		strings.Contains(lower, "/node ")
}

func nodeServiceName(cmdline string) string {
	parts := strings.Fields(cmdline)
	for _, p := range parts {
		if strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".mjs") {
			return strings.TrimSuffix(strings.TrimSuffix(p, ".mjs"), ".js")
		}
	}
	if len(parts) > 1 {
		return parts[1]
	}
	return "node-service"
}

func detectInspectPort(cmdline string) int {
	// --inspect=9229 or --inspect-brk=9229
	parts := strings.Fields(cmdline)
	for _, p := range parts {
		for _, flag := range []string{"--inspect=", "--inspect-brk="} {
			if strings.HasPrefix(p, flag) {
				portStr := strings.TrimPrefix(p, flag)
				if port, err := strconv.Atoi(portStr); err == nil {
					return port
				}
			}
		}
	}
	return 0
}

func waitForInspector(pid int, timeout time.Duration) (int, error) {
	ports := []int{9229, 9230, 9231}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, port := range ports {
			conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 200*time.Millisecond)
			if err == nil {
				conn.Close()
				return port, nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return 0, fmt.Errorf("V8 Inspector not reachable on ports %v within %s", ports, timeout)
}
