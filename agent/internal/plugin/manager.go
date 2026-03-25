package plugin

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// PluginStatus represents the lifecycle state of a loaded plugin.
type PluginStatus string

const (
	StatusActive   PluginStatus = "ACTIVE"
	StatusDisabled PluginStatus = "DISABLED"
	StatusError    PluginStatus = "ERROR"
	StatusUpdating PluginStatus = "UPDATING"
	StatusPending  PluginStatus = "PENDING"
)

// LoadedPlugin holds the runtime state of a registered plugin.
type LoadedPlugin struct {
	Manifest     PluginManifest `json:"manifest"`
	Dir          string         `json:"dir"`
	Status       PluginStatus   `json:"status"`
	LoadedAt     time.Time      `json:"loaded_at"`
	LastCollect  time.Time      `json:"last_collect,omitempty"`
	LastError    string         `json:"last_error,omitempty"`
	PrevVersion  string         `json:"prev_version,omitempty"` // for rollback
	CollectCount int64          `json:"collect_count"`
	ErrorCount   int64          `json:"error_count"`
}

// PluginManager manages the lifecycle of collector plugins on an agent.
type PluginManager struct {
	pluginDir   string
	rollbackDir string
	plugins     map[string]*LoadedPlugin
	watcher     *Watcher
	mu          sync.RWMutex
	logger      *slog.Logger
}

// NewPluginManager creates a new PluginManager. It ensures the plugin and
// rollback directories exist.
func NewPluginManager(pluginDir string, logger *slog.Logger) *PluginManager {
	if logger == nil {
		logger = slog.Default()
	}
	rollbackDir := filepath.Join(pluginDir, ".rollback")

	pm := &PluginManager{
		pluginDir:   pluginDir,
		rollbackDir: rollbackDir,
		plugins:     make(map[string]*LoadedPlugin),
		logger:      logger,
	}
	return pm
}

// Start initialises the plugin manager: creates directories, loads existing
// plugins, and starts the file-system watcher.
func (pm *PluginManager) Start(ctx context.Context) error {
	// Ensure directories exist.
	for _, dir := range []string{pm.pluginDir, pm.rollbackDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create dir %s: %w", dir, err)
		}
	}

	// Load all existing plugins.
	entries, err := os.ReadDir(pm.pluginDir)
	if err != nil {
		return fmt.Errorf("read plugin dir: %w", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == ".rollback" {
			continue
		}
		dir := filepath.Join(pm.pluginDir, entry.Name())
		if err := pm.LoadPlugin(dir); err != nil {
			pm.logger.Warn("skip plugin on startup", "dir", dir, "err", err)
		}
	}

	// Start file-system watcher.
	pm.watcher = NewWatcher(pm.pluginDir, 5*time.Second, pm.handleWatchEvent, pm.logger)
	pm.watcher.Start()

	pm.logger.Info("plugin manager started",
		"plugin_dir", pm.pluginDir,
		"loaded", len(pm.plugins),
	)
	return nil
}

// Stop shuts down the file-system watcher and cleans up.
func (pm *PluginManager) Stop() error {
	if pm.watcher != nil {
		pm.watcher.Stop()
	}
	pm.logger.Info("plugin manager stopped")
	return nil
}

// LoadPlugin reads a manifest.yaml from the given directory, validates it,
// and registers the plugin.
func (pm *PluginManager) LoadPlugin(dir string) error {
	manifestPath := filepath.Join(dir, "manifest.yaml")
	m, err := ParseManifest(manifestPath)
	if err != nil {
		return fmt.Errorf("parse manifest: %w", err)
	}
	if err := ValidateManifest(m); err != nil {
		return fmt.Errorf("validate manifest: %w", err)
	}

	pm.mu.Lock()
	defer pm.mu.Unlock()

	// If there is an existing version, record it for rollback.
	var prevVersion string
	if existing, ok := pm.plugins[m.Name]; ok {
		prevVersion = existing.Manifest.Version
	}

	pm.plugins[m.Name] = &LoadedPlugin{
		Manifest:    *m,
		Dir:         dir,
		Status:      StatusActive,
		LoadedAt:    time.Now().UTC(),
		PrevVersion: prevVersion,
	}

	pm.logger.Info("plugin loaded",
		"name", m.Name,
		"version", m.Version,
		"dir", dir,
	)
	return nil
}

// UnloadPlugin removes a plugin from the registry.
func (pm *PluginManager) UnloadPlugin(name string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if _, ok := pm.plugins[name]; !ok {
		return fmt.Errorf("plugin %q not found", name)
	}
	delete(pm.plugins, name)
	pm.logger.Info("plugin unloaded", "name", name)
	return nil
}

// ExecutePlugin runs the collection for the named plugin.
func (pm *PluginManager) ExecutePlugin(ctx context.Context, name string) (*models.CollectResult, error) {
	pm.mu.RLock()
	p, ok := pm.plugins[name]
	pm.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("plugin %q not found", name)
	}
	if p.Status == StatusDisabled {
		return nil, fmt.Errorf("plugin %q is disabled", name)
	}

	start := time.Now()
	entrypoint := ResolveEntrypointPath(&p.Manifest, p.Dir)

	timeout := defaultTimeout
	if p.Manifest.Collector.Timeout != "" {
		if d, err := time.ParseDuration(p.Manifest.Collector.Timeout); err == nil {
			timeout = d
		}
	}

	output, err := ExecuteScript(ctx, entrypoint, p.Dir, timeout, nil)
	elapsed := time.Since(start)

	result := &models.CollectResult{
		CollectorID:      "plugin:" + name,
		CollectorVersion: p.Manifest.Version,
		Timestamp:        time.Now().UTC(),
		Duration:         elapsed,
		Metadata: map[string]string{
			"plugin_name":    name,
			"plugin_version": p.Manifest.Version,
			"plugin_type":    p.Manifest.Collector.Type,
		},
	}

	if err != nil {
		atomic.AddInt64(&p.ErrorCount, 1)
		pm.mu.Lock()
		p.LastError = err.Error()
		p.Status = StatusError
		pm.mu.Unlock()

		result.Status = models.StatusFailed
		result.Errors = []models.CollectError{{
			Code:    models.ErrTimeout,
			Message: err.Error(),
		}}
		return result, err
	}

	// Parse JSON output if format is json.
	atomic.AddInt64(&p.CollectCount, 1)
	pm.mu.Lock()
	p.LastCollect = time.Now().UTC()
	p.LastError = ""
	if p.Status == StatusError {
		p.Status = StatusActive
	}
	pm.mu.Unlock()

	result.Status = models.StatusSuccess
	if p.Manifest.Output.Format == "json" {
		var data interface{}
		if err := json.Unmarshal(output, &data); err == nil {
			result.Items = []models.CollectedItem{{
				SchemaName:    p.Manifest.Output.Schema,
				SchemaVersion: p.Manifest.Version,
				MetricType:    "plugin",
				Category:      categoryFromManifest(&p.Manifest),
				Data:          data,
			}}
		} else {
			// JSON parse error but script succeeded — return raw text.
			result.Items = []models.CollectedItem{{
				SchemaName:    p.Manifest.Output.Schema,
				SchemaVersion: p.Manifest.Version,
				MetricType:    "plugin",
				Category:      categoryFromManifest(&p.Manifest),
				Data:          string(output),
			}}
		}
	} else {
		result.Items = []models.CollectedItem{{
			SchemaName:    p.Manifest.Output.Schema,
			SchemaVersion: p.Manifest.Version,
			MetricType:    "plugin",
			Category:      categoryFromManifest(&p.Manifest),
			Data:          string(output),
		}}
	}

	return result, nil
}

// Rollback restores the previous version of a plugin from .rollback/.
func (pm *PluginManager) Rollback(name string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	p, ok := pm.plugins[name]
	if !ok {
		return fmt.Errorf("plugin %q not found", name)
	}

	rollbackSrc := filepath.Join(pm.rollbackDir, name)
	if _, err := os.Stat(rollbackSrc); os.IsNotExist(err) {
		return fmt.Errorf("no rollback available for plugin %q", name)
	}

	activeDir := p.Dir
	tempDir := activeDir + ".rollback-swap"

	// Swap: active → temp, rollback → active, temp → rollback
	if err := os.Rename(activeDir, tempDir); err != nil {
		return fmt.Errorf("rollback step 1 (active→temp): %w", err)
	}
	if err := os.Rename(rollbackSrc, activeDir); err != nil {
		_ = os.Rename(tempDir, activeDir) // attempt recovery
		return fmt.Errorf("rollback step 2 (rollback→active): %w", err)
	}
	if err := os.Rename(tempDir, rollbackSrc); err != nil {
		pm.logger.Warn("rollback step 3 failed — old active version may be lost",
			"plugin", name, "err", err)
	}

	// Re-load the manifest from the restored directory.
	manifestPath := filepath.Join(activeDir, "manifest.yaml")
	m, err := ParseManifest(manifestPath)
	if err != nil {
		p.Status = StatusError
		p.LastError = "rollback manifest parse: " + err.Error()
		return fmt.Errorf("rollback parse manifest: %w", err)
	}

	p.PrevVersion = p.Manifest.Version
	p.Manifest = *m
	p.Status = StatusActive
	p.LoadedAt = time.Now().UTC()
	p.LastError = ""

	pm.logger.Info("plugin rolled back",
		"name", name,
		"version", m.Version,
		"prev_version", p.PrevVersion,
	)
	return nil
}

// List returns a copy of all loaded plugins.
func (pm *PluginManager) List() []LoadedPlugin {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	out := make([]LoadedPlugin, 0, len(pm.plugins))
	for _, p := range pm.plugins {
		out = append(out, *p)
	}
	return out
}

// Get returns a single plugin by name.
func (pm *PluginManager) Get(name string) (*LoadedPlugin, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	p, ok := pm.plugins[name]
	return p, ok
}

// InstallPlugin extracts a plugin ZIP archive into the plugins directory.
// It verifies the checksum, backs up any existing version to .rollback/,
// and loads the new plugin.
func (pm *PluginManager) InstallPlugin(name string, zipData []byte, checksum string) error {
	// Verify checksum.
	if checksum != "" {
		if err := VerifyChecksumBytes(zipData, checksum); err != nil {
			return fmt.Errorf("checksum verification failed: %w", err)
		}
	}

	targetDir := filepath.Join(pm.pluginDir, name)

	// Back up existing version to .rollback/ if it exists.
	if _, err := os.Stat(targetDir); err == nil {
		rollbackDst := filepath.Join(pm.rollbackDir, name)
		// Remove old rollback if any.
		_ = os.RemoveAll(rollbackDst)
		if err := os.Rename(targetDir, rollbackDst); err != nil {
			return fmt.Errorf("backup to rollback dir: %w", err)
		}
		pm.logger.Info("existing plugin backed up to rollback", "name", name)
	}

	// Extract ZIP.
	if err := extractZip(zipData, targetDir); err != nil {
		// Attempt to restore from rollback on failure.
		rollbackSrc := filepath.Join(pm.rollbackDir, name)
		if _, statErr := os.Stat(rollbackSrc); statErr == nil {
			_ = os.Rename(rollbackSrc, targetDir)
		}
		return fmt.Errorf("extract plugin zip: %w", err)
	}

	// Load the new plugin.
	if err := pm.LoadPlugin(targetDir); err != nil {
		return fmt.Errorf("load after install: %w", err)
	}

	pm.logger.Info("plugin installed", "name", name)
	return nil
}

// DisablePlugin marks a plugin as disabled so it won't be executed.
func (pm *PluginManager) DisablePlugin(name string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	p, ok := pm.plugins[name]
	if !ok {
		return fmt.Errorf("plugin %q not found", name)
	}
	p.Status = StatusDisabled
	pm.logger.Info("plugin disabled", "name", name)
	return nil
}

// EnablePlugin re-enables a disabled plugin.
func (pm *PluginManager) EnablePlugin(name string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	p, ok := pm.plugins[name]
	if !ok {
		return fmt.Errorf("plugin %q not found", name)
	}
	p.Status = StatusActive
	pm.logger.Info("plugin enabled", "name", name)
	return nil
}

// PluginStatuses returns the status of all loaded plugins in the models.PluginStatus
// format used in heartbeat reporting.
func (pm *PluginManager) PluginStatuses() []models.PluginStatus {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	out := make([]models.PluginStatus, 0, len(pm.plugins))
	for _, p := range pm.plugins {
		status := "active"
		switch p.Status {
		case StatusDisabled:
			status = "inactive"
		case StatusError:
			status = "error"
		case StatusUpdating, StatusPending:
			status = "inactive"
		}
		out = append(out, models.PluginStatus{
			PluginID:     p.Manifest.Name,
			Version:      p.Manifest.Version,
			Status:       status,
			ItemsCovered: p.Manifest.Items,
			AutoDetected: false,
			LastCollect:  p.LastCollect,
		})
	}
	return out
}

// handleWatchEvent reacts to file system changes in the plugins directory.
func (pm *PluginManager) handleWatchEvent(event WatchEvent) {
	switch event.Type {
	case EventCreated, EventModified:
		if err := pm.LoadPlugin(event.Path); err != nil {
			pm.logger.Warn("watch: failed to load plugin",
				"path", event.Path,
				"event", event.Type.String(),
				"err", err,
			)
		}
	case EventDeleted:
		if err := pm.UnloadPlugin(event.Name); err != nil {
			pm.logger.Warn("watch: failed to unload plugin",
				"name", event.Name,
				"err", err,
			)
		}
	}
}

// categoryFromManifest infers the evidence category from plugin categories.
func categoryFromManifest(m *PluginManifest) string {
	for _, c := range m.Categories {
		if c == "ai" || c == "AI" {
			return "ai"
		}
	}
	return "it"
}

// extractZip extracts a ZIP archive from bytes into the target directory.
func extractZip(data []byte, targetDir string) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}

	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return fmt.Errorf("create target dir: %w", err)
	}

	for _, f := range reader.File {
		destPath := filepath.Join(targetDir, f.Name)

		// Security: prevent zip-slip.
		if !isSubpath(targetDir, destPath) {
			return fmt.Errorf("zip-slip detected: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0o755); err != nil {
				return err
			}
			continue
		}

		// Ensure parent directory exists.
		if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("open zip entry %s: %w", f.Name, err)
		}

		outFile, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return fmt.Errorf("create file %s: %w", destPath, err)
		}

		_, err = io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()
		if err != nil {
			return fmt.Errorf("write file %s: %w", destPath, err)
		}
	}

	return nil
}

// isSubpath checks that candidate is under baseDir (prevents zip-slip attacks).
func isSubpath(baseDir, candidate string) bool {
	absBase, err := filepath.Abs(baseDir)
	if err != nil {
		return false
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return false
	}
	return len(absCandidate) >= len(absBase) &&
		absCandidate[:len(absBase)] == absBase
}
