// Package updater implements OTA (Over-The-Air) binary update management
// for the AITOP agent. It supports staged rollout with automatic rollback
// on health degradation.
//
// Flow:
//   1. Check for new version via collection server HTTP API
//   2. Download binary to temp location
//   3. Verify SHA-256 checksum (and code signature if available)
//   4. Execute staged rollout (canary → 10% → 50% → 100%)
//   5. On health degradation: automatic rollback to previous stable binary
package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/version"
)

// ---- public types ----------------------------------------------------------------

// UpdateState represents the current OTA update lifecycle state.
type UpdateState string

const (
	StateIdle       UpdateState = "IDLE"
	StateChecking   UpdateState = "CHECKING"
	StateDownloading UpdateState = "DOWNLOADING"
	StateVerifying  UpdateState = "VERIFYING"
	StateStaging    UpdateState = "STAGING"
	StateApplied    UpdateState = "APPLIED"
	StateRollingBack UpdateState = "ROLLING_BACK"
	StateFailed     UpdateState = "FAILED"
)

// RolloutStage represents a single phase of staged rollout.
type RolloutStage struct {
	Name       string        // "canary", "10pct", "50pct", "full"
	Percentage int           // 1, 10, 50, 100
	WaitTime   time.Duration // how long to observe before advancing
}

// defaultStages is the canonical staged rollout progression.
var defaultStages = []RolloutStage{
	{Name: "canary", Percentage: 1, WaitTime: 10 * time.Minute},
	{Name: "10pct", Percentage: 10, WaitTime: 30 * time.Minute},
	{Name: "50pct", Percentage: 50, WaitTime: 60 * time.Minute},
	{Name: "full", Percentage: 100, WaitTime: 0},
}

// UpdateInfo describes an available update published by the collection server.
type UpdateInfo struct {
	Version    string `json:"version"`
	DownloadURL string `json:"download_url"`
	Checksum   string `json:"checksum_sha256"`
	ReleaseNote string `json:"release_notes,omitempty"`
	Mandatory  bool   `json:"mandatory"`
}

// UpdateStatus is a snapshot of the updater's current state.
type UpdateStatus struct {
	State          UpdateState `json:"state"`
	CurrentVersion string      `json:"current_version"`
	TargetVersion  string      `json:"target_version,omitempty"`
	Stage          string      `json:"rollout_stage,omitempty"`
	LastCheckAt    *time.Time  `json:"last_check_at,omitempty"`
	LastAppliedAt  *time.Time  `json:"last_applied_at,omitempty"`
	LastError      string      `json:"last_error,omitempty"`
}

// HealthFunc is a callback the updater invokes to assess agent health.
// Returns true if the agent is healthy enough to proceed with rollout.
type HealthFunc func() bool

// ---- manager --------------------------------------------------------------------

// Manager orchestrates OTA updates.
type Manager struct {
	mu          sync.RWMutex
	state       UpdateState
	currentVer  string
	targetVer   string
	stage       string
	lastCheckAt *time.Time
	lastApplied *time.Time
	lastErr     string

	serverURL   string
	agentToken  string
	agentID     string
	binaryPath  string // path to the current running binary
	backupPath  string // path to the previous stable binary
	dataDir     string // directory for downloads and rollback backup
	stages      []RolloutStage
	healthFn    HealthFunc
	httpClient  *http.Client
	logger      *slog.Logger
}

// Config holds configuration for the updater.
type Config struct {
	ServerURL  string
	AgentToken string
	AgentID    string
	DataDir    string
	HealthFn   HealthFunc
}

// New creates a new OTA update manager.
func New(cfg Config, logger *slog.Logger) (*Manager, error) {
	execPath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("get executable path: %w", err)
	}
	// Resolve symlinks for accurate path
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		execPath, _ = os.Executable()
	}

	dataDir := cfg.DataDir
	if dataDir == "" {
		dataDir = filepath.Join(filepath.Dir(execPath), ".ota")
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("create OTA data dir %s: %w", dataDir, err)
	}

	healthFn := cfg.HealthFn
	if healthFn == nil {
		healthFn = func() bool { return true }
	}

	return &Manager{
		state:      StateIdle,
		currentVer: version.Version,
		serverURL:  cfg.ServerURL,
		agentToken: cfg.AgentToken,
		agentID:    cfg.AgentID,
		binaryPath: execPath,
		backupPath: filepath.Join(dataDir, "aitop-agent.prev"),
		dataDir:    dataDir,
		stages:     defaultStages,
		healthFn:   healthFn,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		logger:     logger,
	}, nil
}

// Status returns the current update manager state.
func (m *Manager) Status() UpdateStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return UpdateStatus{
		State:          m.state,
		CurrentVersion: m.currentVer,
		TargetVersion:  m.targetVer,
		Stage:          m.stage,
		LastCheckAt:    m.lastCheckAt,
		LastAppliedAt:  m.lastApplied,
		LastError:      m.lastErr,
	}
}

// CheckAndUpdate checks for a new version and applies it through staged rollout.
// This is safe to call concurrently; a second call returns immediately if an
// update is already in progress.
func (m *Manager) CheckAndUpdate(ctx context.Context) error {
	if !m.transitionState(StateIdle, StateChecking) &&
		!m.transitionState(StateFailed, StateChecking) {
		m.logger.Info("update already in progress, skipping check")
		return nil
	}

	info, err := m.checkForUpdate(ctx)
	if err != nil {
		m.setError(fmt.Sprintf("check failed: %v", err))
		return err
	}
	if info == nil {
		m.setState(StateIdle)
		m.logger.Info("agent is up-to-date", "version", m.currentVer)
		return nil
	}

	m.logger.Info("update available", "current", m.currentVer, "target", info.Version)
	return m.applyUpdate(ctx, info)
}

// Rollback restores the previous stable binary.
func (m *Manager) Rollback(ctx context.Context) error {
	m.mu.Lock()
	m.state = StateRollingBack
	m.mu.Unlock()

	m.logger.Warn("initiating rollback", "current_version", m.currentVer)
	return m.doRollback()
}

// ---- private methods ------------------------------------------------------------

func (m *Manager) checkForUpdate(ctx context.Context) (*UpdateInfo, error) {
	now := time.Now().UTC()
	m.mu.Lock()
	m.lastCheckAt = &now
	m.mu.Unlock()

	if m.serverURL == "" {
		return nil, nil
	}

	url := fmt.Sprintf("%s/api/v1/agents/%s/update", m.serverURL, m.agentID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+m.agentToken)
	req.Header.Set("X-Agent-Version", m.currentVer)
	req.Header.Set("X-Agent-OS", runtime.GOOS)
	req.Header.Set("X-Agent-Arch", runtime.GOARCH)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("update check request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		return nil, nil // up-to-date
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update check: HTTP %d", resp.StatusCode)
	}

	var info UpdateInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode update info: %w", err)
	}

	// Already at target version?
	if info.Version == m.currentVer {
		return nil, nil
	}
	return &info, nil
}

func (m *Manager) applyUpdate(ctx context.Context, info *UpdateInfo) error {
	m.mu.Lock()
	m.state = StateDownloading
	m.targetVer = info.Version
	m.mu.Unlock()

	// Download binary
	tmpPath := filepath.Join(m.dataDir, fmt.Sprintf("aitop-agent-%s.tmp", info.Version))
	if err := m.downloadBinary(ctx, info.DownloadURL, tmpPath); err != nil {
		m.setError(fmt.Sprintf("download failed: %v", err))
		return err
	}
	defer os.Remove(tmpPath) // cleanup on failure

	// Verify checksum
	m.setState(StateVerifying)
	if info.Checksum != "" {
		if err := m.verifyChecksum(tmpPath, info.Checksum); err != nil {
			m.setError(fmt.Sprintf("checksum mismatch: %v", err))
			return err
		}
	}

	// Make executable
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		m.setError(fmt.Sprintf("chmod failed: %v", err))
		return err
	}

	// Determine rollout position for this agent
	m.setState(StateStaging)
	if err := m.stagedRollout(ctx, tmpPath, info); err != nil {
		return err
	}

	return nil
}

func (m *Manager) downloadBinary(ctx context.Context, url, dest string) error {
	m.logger.Info("downloading update", "url", url, "dest", dest)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.agentToken)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download: HTTP %d", resp.StatusCode)
	}

	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("write binary: %w", err)
	}
	return nil
}

func (m *Manager) verifyChecksum(path, expected string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	actual := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(actual, expected) {
		return fmt.Errorf("expected %s, got %s", expected, actual)
	}
	return nil
}

// stagedRollout applies the binary through the configured rollout stages.
// Each stage waits for the configured duration and checks agent health before advancing.
func (m *Manager) stagedRollout(ctx context.Context, newBinaryPath string, info *UpdateInfo) error {
	// Determine if this agent is included in the current stage
	// (based on a stable hash of agentID modulo 100)
	agentPercentile := agentRolloutPercentile(m.agentID)
	m.logger.Info("agent rollout percentile", "percentile", agentPercentile)

	for _, stage := range m.stages {
		m.mu.Lock()
		m.stage = stage.Name
		m.mu.Unlock()

		m.logger.Info("rollout stage", "stage", stage.Name, "percentage", stage.Percentage)

		// Should this agent be in the current stage?
		if agentPercentile > stage.Percentage {
			m.logger.Info("agent not in this stage, waiting", "stage", stage.Name,
				"percentile", agentPercentile)
			// Wait for the stage to complete and check context
			if stage.WaitTime > 0 {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(stage.WaitTime):
				}
			}
			continue
		}

		// Apply the binary atomically
		if err := m.atomicReplace(newBinaryPath); err != nil {
			m.setError(fmt.Sprintf("binary replace at stage %s: %v", stage.Name, err))
			return err
		}

		m.logger.Info("binary applied at stage", "stage", stage.Name, "version", info.Version)

		// Observe health for the stage wait period
		if stage.WaitTime > 0 {
			if err := m.observeHealth(ctx, stage); err != nil {
				m.logger.Error("health check failed, rolling back", "stage", stage.Name, "error", err)
				_ = m.doRollback()
				return fmt.Errorf("rollback triggered at stage %s: %w", stage.Name, err)
			}
		}
	}

	// All stages passed
	now := time.Now().UTC()
	m.mu.Lock()
	m.state = StateApplied
	m.currentVer = info.Version
	m.targetVer = ""
	m.stage = ""
	m.lastApplied = &now
	m.lastErr = ""
	m.mu.Unlock()

	m.logger.Info("update applied successfully", "version", info.Version)
	return nil
}

// atomicReplace replaces the running binary atomically:
//  1. Backup current binary to .prev
//  2. Copy new binary to a temp file alongside the current binary
//  3. Rename (atomic on most filesystems) new binary over current binary
func (m *Manager) atomicReplace(newPath string) error {
	// Backup current binary
	if err := copyFile(m.binaryPath, m.backupPath); err != nil {
		m.logger.Warn("failed to backup current binary", "error", err)
		// Non-fatal — rollback may not be available
	}

	// Temp path in same directory for atomic rename
	dir := filepath.Dir(m.binaryPath)
	tmpDest := filepath.Join(dir, ".aitop-agent-new")

	if err := copyFile(newPath, tmpDest); err != nil {
		return fmt.Errorf("copy new binary: %w", err)
	}
	if err := os.Chmod(tmpDest, 0o755); err != nil {
		_ = os.Remove(tmpDest)
		return fmt.Errorf("chmod new binary: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tmpDest, m.binaryPath); err != nil {
		_ = os.Remove(tmpDest)
		return fmt.Errorf("rename binary: %w", err)
	}

	m.logger.Info("binary replaced atomically", "path", m.binaryPath)
	return nil
}

// doRollback restores the previous stable binary.
func (m *Manager) doRollback() error {
	if _, err := os.Stat(m.backupPath); err != nil {
		return fmt.Errorf("no backup binary available at %s", m.backupPath)
	}

	m.logger.Warn("restoring previous binary", "backup", m.backupPath, "dest", m.binaryPath)

	if err := copyFile(m.backupPath, m.binaryPath); err != nil {
		return fmt.Errorf("rollback copy: %w", err)
	}
	if err := os.Chmod(m.binaryPath, 0o755); err != nil {
		return fmt.Errorf("rollback chmod: %w", err)
	}

	m.mu.Lock()
	m.state = StateIdle
	m.currentVer = "unknown" // agent should restart to confirm version
	m.targetVer = ""
	m.stage = ""
	m.mu.Unlock()

	m.logger.Info("rollback complete; agent should restart to apply previous version")
	return nil
}

// observeHealth polls health for the stage wait duration.
// Returns an error if health degrades below threshold.
func (m *Manager) observeHealth(ctx context.Context, stage RolloutStage) error {
	deadline := time.Now().Add(stage.WaitTime)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	failCount := 0
	const maxFails = 3

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				m.logger.Info("stage observation complete", "stage", stage.Name)
				return nil
			}
			if !m.healthFn() {
				failCount++
				m.logger.Warn("health check failed", "stage", stage.Name, "fail_count", failCount)
				if failCount >= maxFails {
					return fmt.Errorf("health degraded: %d consecutive failures during %s", failCount, stage.Name)
				}
			} else {
				failCount = 0
			}
		}
	}
}

// agentRolloutPercentile returns a deterministic 1-100 value based on agentID.
// This ensures the same agent always lands in the same rollout bucket.
func agentRolloutPercentile(agentID string) int {
	if agentID == "" {
		return rand.Intn(100) + 1 //nolint:gosec — not crypto
	}
	h := sha256.Sum256([]byte(agentID))
	// Use first 4 bytes as uint32, mod 100 → 0-99, +1 → 1-100
	val := int(h[0])<<24 | int(h[1])<<16 | int(h[2])<<8 | int(h[3])
	if val < 0 {
		val = -val
	}
	return (val % 100) + 1
}

// copyFile copies src to dst, creating dst if necessary.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o700); err != nil {
		return err
	}

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func (m *Manager) setState(s UpdateState) {
	m.mu.Lock()
	m.state = s
	m.mu.Unlock()
}

func (m *Manager) setError(msg string) {
	m.mu.Lock()
	m.state = StateFailed
	m.lastErr = msg
	m.mu.Unlock()
	m.logger.Error("update failed", "error", msg)
}

// transitionState atomically moves from `from` to `to`.
// Returns false if the current state is not `from`.
func (m *Manager) transitionState(from, to UpdateState) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.state != from {
		return false
	}
	m.state = to
	return true
}

// ---- version helpers (re-exported for tests) ------------------------------------

// ParseSemver splits "v1.2.3" into [1, 2, 3]. Returns nil on error.
func ParseSemver(v string) []int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	if len(parts) != 3 {
		return nil
	}
	nums := make([]int, 3)
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return nil
		}
		nums[i] = n
	}
	return nums
}

// IsNewer returns true if candidate is strictly newer than current (semver).
func IsNewer(current, candidate string) bool {
	c := ParseSemver(current)
	n := ParseSemver(candidate)
	if c == nil || n == nil {
		return false
	}
	for i := 0; i < 3; i++ {
		if n[i] > c[i] {
			return true
		}
		if n[i] < c[i] {
			return false
		}
	}
	return false
}
