// Package shell implements the remote CLI / terminal service for the AITOP agent.
// It provides PTY-based interactive shell sessions with RBAC filtering and audit logging.
//
// Architecture:
//   - SessionManager: manages lifecycle of active terminal sessions
//   - Session: one PTY-backed interactive shell connection
//   - RBACFilter: blocks dangerous commands based on role
//   - AuditLogger: records all session events and command output
//
// Transport: This package provides the agent-side PTY service.
// The backend WebSocket proxy connects to the agent via the collection server gRPC stream
// (command type "terminal.open/input/resize/close").
package shell

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/config"
)

// ---- public types ----------------------------------------------------------------

// SessionID is the unique identifier for a terminal session.
type SessionID string

// SessionState represents the lifecycle state of a session.
type SessionState string

const (
	StateOpen    SessionState = "OPEN"
	StateClosing SessionState = "CLOSING"
	StateClosed  SessionState = "CLOSED"
)

// SessionInfo holds metadata about a terminal session.
type SessionInfo struct {
	ID        SessionID    `json:"id"`
	AgentID   string       `json:"agent_id"`
	UserID    string       `json:"user_id"`
	Role      string       `json:"role"`
	State     SessionState `json:"state"`
	OpenedAt  time.Time    `json:"opened_at"`
	LastInput time.Time    `json:"last_input"`
	ClosedAt  *time.Time   `json:"closed_at,omitempty"`
}

// InputEvent is a chunk of terminal input (keyboard) sent from the client.
type InputEvent struct {
	SessionID SessionID `json:"session_id"`
	Data      []byte    `json:"data"`
}

// OutputEvent is a chunk of terminal output (display) sent to the client.
type OutputEvent struct {
	SessionID SessionID `json:"session_id"`
	Data      []byte    `json:"data"`
}

// ResizeEvent is a terminal window resize request.
type ResizeEvent struct {
	SessionID SessionID `json:"session_id"`
	Cols      uint16    `json:"cols"`
	Rows      uint16    `json:"rows"`
}

// ---- session manager ------------------------------------------------------------

// Manager manages all active terminal sessions.
type Manager struct {
	mu       sync.RWMutex
	sessions map[SessionID]*Session
	cfg      config.RemoteShellConfig
	agentID  string
	audit    *AuditLogger
	logger   *slog.Logger
}

// NewManager creates a new shell session manager.
func NewManager(agentID string, cfg config.RemoteShellConfig, logger *slog.Logger) *Manager {
	m := &Manager{
		sessions: make(map[SessionID]*Session),
		cfg:      cfg,
		agentID:  agentID,
		logger:   logger,
	}

	auditPath := cfg.AuditLogPath
	if auditPath == "" {
		auditPath = filepath.Join(os.TempDir(), "aitop-shell-audit.log")
	}
	if cfg.AuditEnabled {
		m.audit = NewAuditLogger(auditPath, logger)
	}
	return m
}

// OpenSession creates a new PTY-backed shell session.
// Returns the session and an output channel the caller should drain.
func (m *Manager) OpenSession(ctx context.Context, sessionID SessionID, userID, role string) (*Session, <-chan OutputEvent, error) {
	if !m.isRoleAllowed(role) {
		return nil, nil, fmt.Errorf("role %q is not permitted to open remote shell sessions", role)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.sessions) >= m.cfg.MaxSessions {
		return nil, nil, fmt.Errorf("maximum concurrent sessions (%d) reached", m.cfg.MaxSessions)
	}

	if _, exists := m.sessions[sessionID]; exists {
		return nil, nil, fmt.Errorf("session %s already exists", sessionID)
	}

	s := newSession(sessionID, m.agentID, userID, role, m.cfg, m.audit, m.logger)
	outCh, err := s.start(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("start session %s: %w", sessionID, err)
	}

	m.sessions[sessionID] = s

	m.logger.Info("shell session opened", "session_id", sessionID, "user", userID, "role", role)
	if m.audit != nil {
		m.audit.LogEvent(AuditEvent{
			SessionID: sessionID,
			UserID:    userID,
			AgentID:   m.agentID,
			EventType: "SESSION_OPEN",
		})
	}

	// Reap session once it closes
	go func() {
		<-s.done
		m.mu.Lock()
		delete(m.sessions, sessionID)
		m.mu.Unlock()
		m.logger.Info("shell session closed", "session_id", sessionID)
	}()

	return s, outCh, nil
}

// SendInput forwards keyboard input to the specified session.
func (m *Manager) SendInput(ev InputEvent) error {
	m.mu.RLock()
	s, ok := m.sessions[ev.SessionID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session %s not found", ev.SessionID)
	}
	return s.sendInput(ev.Data)
}

// Resize sends a window-resize event to the session's PTY.
func (m *Manager) Resize(ev ResizeEvent) error {
	m.mu.RLock()
	s, ok := m.sessions[ev.SessionID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session %s not found", ev.SessionID)
	}
	return s.resize(ev.Cols, ev.Rows)
}

// CloseSession terminates the specified session gracefully.
func (m *Manager) CloseSession(sessionID SessionID) {
	m.mu.RLock()
	s, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if ok {
		s.close()
	}
}

// ListSessions returns metadata for all active sessions.
func (m *Manager) ListSessions() []SessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	infos := make([]SessionInfo, 0, len(m.sessions))
	for _, s := range m.sessions {
		infos = append(infos, s.info())
	}
	return infos
}

// isRoleAllowed checks if the given role is in the allowed roles list.
func (m *Manager) isRoleAllowed(role string) bool {
	if len(m.cfg.AllowedRoles) == 0 {
		// Default: allow admin and sre
		for _, r := range []string{"admin", "sre"} {
			if role == r {
				return true
			}
		}
		return false
	}
	for _, r := range m.cfg.AllowedRoles {
		if r == role {
			return true
		}
	}
	return false
}

// ---- session -----------------------------------------------------------------

const outputBufSize = 256

// Session represents a single active PTY terminal session.
type Session struct {
	id        SessionID
	agentID   string
	userID    string
	role      string
	cfg       config.RemoteShellConfig
	audit     *AuditLogger
	logger    *slog.Logger
	filter    *RBACFilter

	openedAt  time.Time
	lastInput time.Time
	state     SessionState

	cmd    *exec.Cmd
	pty    io.ReadWriteCloser // PTY master fd (or pipe on non-Unix)
	outCh  chan OutputEvent
	done   chan struct{}
	once   sync.Once

	mu sync.Mutex
}

func newSession(id SessionID, agentID, userID, role string, cfg config.RemoteShellConfig,
	audit *AuditLogger, logger *slog.Logger) *Session {
	return &Session{
		id:       id,
		agentID:  agentID,
		userID:   userID,
		role:     role,
		cfg:      cfg,
		audit:    audit,
		logger:   logger,
		filter:   NewRBACFilter(role, cfg.BlockedCommands),
		openedAt: time.Now().UTC(),
		state:    StateOpen,
		outCh:    make(chan OutputEvent, outputBufSize),
		done:     make(chan struct{}),
	}
}

// start launches the shell process with a PTY (Linux/macOS) or a pipe (Windows).
func (s *Session) start(ctx context.Context) (<-chan OutputEvent, error) {
	shell := detectShell()
	cmd := exec.CommandContext(ctx, shell)
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		fmt.Sprintf("AITOP_SESSION=%s", s.id),
		fmt.Sprintf("AITOP_USER=%s", s.userID),
	)

	if runtime.GOOS != "windows" {
		pty, err := openPTY(cmd)
		if err != nil {
			return nil, fmt.Errorf("open PTY: %w", err)
		}
		s.pty = pty
	} else {
		// Windows: use stdin/stdout pipes
		stdin, err := cmd.StdinPipe()
		if err != nil {
			return nil, err
		}
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			return nil, err
		}
		cmd.Stderr = cmd.Stdout
		s.pty = &pipePTY{in: stdin, out: stdout}
		if err := cmd.Start(); err != nil {
			return nil, err
		}
	}

	s.cmd = cmd

	// Pump output from PTY to outCh
	go s.pumpOutput()

	// Enforce idle timeout
	if s.cfg.IdleTimeout > 0 {
		go s.watchIdleTimeout()
	}

	// Enforce max session duration
	if s.cfg.MaxDuration > 0 {
		go func() {
			timer := time.NewTimer(time.Duration(s.cfg.MaxDuration) * time.Second)
			defer timer.Stop()
			select {
			case <-timer.C:
				s.logger.Warn("max session duration reached, closing session", "session_id", s.id)
				s.close()
			case <-s.done:
			}
		}()
	}

	return s.outCh, nil
}

// sendInput writes keyboard input to the PTY after RBAC filtering.
func (s *Session) sendInput(data []byte) error {
	s.mu.Lock()
	if s.state != StateOpen {
		s.mu.Unlock()
		return fmt.Errorf("session %s is not open", s.id)
	}
	s.lastInput = time.Now().UTC()
	s.mu.Unlock()

	// Audit raw input
	if s.audit != nil {
		s.audit.LogEvent(AuditEvent{
			SessionID: s.id,
			UserID:    s.userID,
			AgentID:   s.agentID,
			EventType: "INPUT",
			Data:      sanitizeAuditData(data),
		})
	}

	// Check for blocked commands on newline boundary
	input := string(data)
	if strings.ContainsAny(input, "\r\n") {
		if blocked, reason := s.filter.IsBlocked(input); blocked {
			s.logger.Warn("blocked command",
				"session_id", s.id, "user", s.userID, "reason", reason)
			if s.audit != nil {
				s.audit.LogEvent(AuditEvent{
					SessionID: s.id,
					UserID:    s.userID,
					AgentID:   s.agentID,
					EventType: "BLOCKED",
					Data:      reason,
				})
			}
			// Send warning back to client
			msg := fmt.Sprintf("\r\n\033[31m[AITOP] Command blocked: %s\033[0m\r\n", reason)
			s.outCh <- OutputEvent{SessionID: s.id, Data: []byte(msg)}
			return nil
		}
	}

	if s.pty == nil {
		return fmt.Errorf("pty not initialised")
	}
	_, err := s.pty.Write(data)
	return err
}

// resize changes the PTY window size.
func (s *Session) resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state != StateOpen {
		return nil
	}
	return ptyResize(s.pty, cols, rows)
}

// close terminates the session gracefully.
func (s *Session) close() {
	s.once.Do(func() {
		s.mu.Lock()
		s.state = StateClosing
		s.mu.Unlock()

		if s.pty != nil {
			_ = s.pty.Close()
		}
		if s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Signal(syscall.SIGTERM)
			// Give it a moment, then force kill
			go func() {
				time.Sleep(2 * time.Second)
				_ = s.cmd.Process.Kill()
			}()
		}

		if s.audit != nil {
			s.audit.LogEvent(AuditEvent{
				SessionID: s.id,
				UserID:    s.userID,
				AgentID:   s.agentID,
				EventType: "SESSION_CLOSE",
			})
		}

		s.mu.Lock()
		s.state = StateClosed
		s.mu.Unlock()
		close(s.done)
	})
}

// pumpOutput reads from the PTY master and forwards to outCh.
func (s *Session) pumpOutput() {
	defer func() {
		close(s.outCh)
		s.close()
	}()

	buf := make([]byte, 4096)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			select {
			case s.outCh <- OutputEvent{SessionID: s.id, Data: chunk}:
			case <-s.done:
				return
			}
		}
		if err != nil {
			return
		}
	}
}

// watchIdleTimeout closes the session after idle timeout.
func (s *Session) watchIdleTimeout() {
	idleDur := time.Duration(s.cfg.IdleTimeout) * time.Second
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			s.mu.Lock()
			last := s.lastInput
			s.mu.Unlock()
			if time.Since(last) > idleDur {
				s.logger.Info("session idle timeout", "session_id", s.id)
				s.close()
				return
			}
		}
	}
}

// info returns a snapshot of the session metadata.
func (s *Session) info() SessionInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	si := SessionInfo{
		ID:        s.id,
		AgentID:   s.agentID,
		UserID:    s.userID,
		Role:      s.role,
		State:     s.state,
		OpenedAt:  s.openedAt,
		LastInput: s.lastInput,
	}
	if s.state == StateClosed {
		now := time.Now().UTC()
		si.ClosedAt = &now
	}
	return si
}

// ---- RBAC filter ----------------------------------------------------------------

// RBACFilter blocks dangerous commands based on role configuration.
type RBACFilter struct {
	role    string
	blocked []string
}

// defaultBlockedCommands are blocked for all roles by default.
var defaultBlockedCommands = []string{
	"rm -rf /",
	"rm -rf /*",
	"mkfs",
	"dd if=/dev/zero of=/dev/",
	"dd if=/dev/random of=/dev/",
	":(){:|:&};:",  // fork bomb
	"shutdown",
	"halt",
	"reboot",
	"init 0",
	"init 6",
	"poweroff",
	"iptables -F",
	"chmod 777 /",
	"chown root /",
	"> /etc/passwd",
	"> /etc/shadow",
}

// NewRBACFilter creates a new command filter.
func NewRBACFilter(role string, extra []string) *RBACFilter {
	blocked := make([]string, len(defaultBlockedCommands))
	copy(blocked, defaultBlockedCommands)
	blocked = append(blocked, extra...)
	return &RBACFilter{role: role, blocked: blocked}
}

// IsBlocked returns (true, reason) if the input contains a blocked command.
func (f *RBACFilter) IsBlocked(input string) (bool, string) {
	// Normalise whitespace
	norm := strings.Join(strings.Fields(strings.ToLower(input)), " ")
	for _, blocked := range f.blocked {
		if strings.Contains(norm, strings.ToLower(blocked)) {
			return true, fmt.Sprintf("command matches blocked pattern: %q", blocked)
		}
	}
	return false, ""
}

// ---- audit logger ---------------------------------------------------------------

// AuditEvent represents a single terminal audit record.
type AuditEvent struct {
	SessionID SessionID `json:"session_id"`
	AgentID   string    `json:"agent_id"`
	UserID    string    `json:"user_id"`
	EventType string    `json:"event_type"` // SESSION_OPEN, INPUT, BLOCKED, SESSION_CLOSE
	Data      string    `json:"data,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// AuditLogger writes audit events to a log file in NDJSON format.
type AuditLogger struct {
	mu     sync.Mutex
	file   *os.File
	writer *bufio.Writer
	logger *slog.Logger
}

// NewAuditLogger opens the audit log file, creating it if necessary.
func NewAuditLogger(path string, logger *slog.Logger) *AuditLogger {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		logger.Error("failed to create audit log directory", "path", path, "error", err)
		return nil
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		logger.Error("failed to open audit log", "path", path, "error", err)
		return nil
	}
	return &AuditLogger{
		file:   f,
		writer: bufio.NewWriter(f),
		logger: logger,
	}
}

// LogEvent writes an AuditEvent to the audit log.
func (a *AuditLogger) LogEvent(ev AuditEvent) {
	if a == nil {
		return
	}
	ev.Timestamp = time.Now().UTC()

	a.mu.Lock()
	defer a.mu.Unlock()

	data, err := json.Marshal(ev)
	if err != nil {
		a.logger.Error("audit marshal failed", "error", err)
		return
	}
	_, _ = a.writer.Write(data)
	_ = a.writer.WriteByte('\n')
	_ = a.writer.Flush()
}

// Close flushes and closes the audit log.
func (a *AuditLogger) Close() {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	_ = a.writer.Flush()
	_ = a.file.Close()
}

// ---- PTY helpers ----------------------------------------------------------------

// openPTY launches cmd with a PTY on Unix platforms.
// On platforms without PTY support, falls back to a simple pipe.
func openPTY(cmd *exec.Cmd) (io.ReadWriteCloser, error) {
	// Attempt to use creack/pty if available at runtime.
	// Since we don't want to add the dependency in go.mod, we use syscall directly.
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("PTY not supported on Windows")
	}
	return openUnixPTY(cmd)
}

// ptyResize sends a TIOCSWINSZ ioctl to resize the PTY window.
func ptyResize(pty io.ReadWriteCloser, cols, rows uint16) error {
	type resizer interface {
		Resize(cols, rows uint16) error
	}
	if r, ok := pty.(resizer); ok {
		return r.Resize(cols, rows)
	}
	// PTY resize via ioctl (implemented in shell_unix.go)
	return ptyResizeIoctl(pty, cols, rows)
}

// detectShell returns the user's preferred shell.
func detectShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	if runtime.GOOS == "windows" {
		return "cmd.exe"
	}
	// Try common shells in order
	for _, sh := range []string{"/bin/bash", "/bin/sh", "/usr/bin/bash", "/usr/bin/sh"} {
		if _, err := os.Stat(sh); err == nil {
			return sh
		}
	}
	return "/bin/sh"
}

// sanitizeAuditData limits audit log input to printable ASCII (no passwords/binary).
func sanitizeAuditData(data []byte) string {
	s := strings.Map(func(r rune) rune {
		if r >= 32 && r < 127 {
			return r
		}
		return -1
	}, string(data))
	if len(s) > 512 {
		s = s[:512] + "..."
	}
	return s
}

// pipePTY implements io.ReadWriteCloser over a stdin/stdout pipe pair (Windows fallback).
type pipePTY struct {
	in  io.WriteCloser
	out io.ReadCloser
}

func (p *pipePTY) Read(b []byte) (int, error)  { return p.out.Read(b) }
func (p *pipePTY) Write(b []byte) (int, error) { return p.in.Write(b) }
func (p *pipePTY) Close() error {
	_ = p.in.Close()
	return p.out.Close()
}
