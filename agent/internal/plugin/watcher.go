package plugin

import (
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// WatchEventType classifies a file-system change detected by the Watcher.
type WatchEventType int

const (
	EventCreated  WatchEventType = iota // new directory appeared
	EventModified                       // manifest.yaml changed
	EventDeleted                        // directory removed
)

func (t WatchEventType) String() string {
	switch t {
	case EventCreated:
		return "created"
	case EventModified:
		return "modified"
	case EventDeleted:
		return "deleted"
	default:
		return "unknown"
	}
}

// WatchEvent describes a single change in the plugins directory.
type WatchEvent struct {
	Type WatchEventType
	Path string // directory path
	Name string // plugin directory name
}

// Watcher monitors the plugins/ directory for changes using a polling approach.
// This is cross-platform compatible and does not require fsnotify.
type Watcher struct {
	dir      string
	interval time.Duration
	onChange func(event WatchEvent)
	known    map[string]time.Time // path → last observed modtime of manifest.yaml
	mu       sync.Mutex
	stopCh   chan struct{}
	logger   *slog.Logger
}

// NewWatcher creates a polling-based directory watcher.
func NewWatcher(dir string, interval time.Duration, onChange func(WatchEvent), logger *slog.Logger) *Watcher {
	if interval <= 0 {
		interval = 5 * time.Second
	}
	return &Watcher{
		dir:      dir,
		interval: interval,
		onChange: onChange,
		known:    make(map[string]time.Time),
		stopCh:   make(chan struct{}),
		logger:   logger,
	}
}

// Start begins the polling loop. It first takes a snapshot of existing plugins
// (without firing events) then polls for changes.
func (w *Watcher) Start() {
	// Initial snapshot — learn what already exists.
	w.mu.Lock()
	w.snapshot()
	w.mu.Unlock()

	go w.loop()
}

// Stop terminates the polling loop.
func (w *Watcher) Stop() {
	select {
	case <-w.stopCh:
		// already stopped
	default:
		close(w.stopCh)
	}
}

func (w *Watcher) loop() {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.poll()
		}
	}
}

func (w *Watcher) poll() {
	w.mu.Lock()
	defer w.mu.Unlock()

	current := w.scanPluginDirs()

	// Detect new or modified.
	for dir, modTime := range current {
		prev, existed := w.known[dir]
		if !existed {
			name := filepath.Base(dir)
			w.logger.Info("plugin directory created", "dir", dir, "name", name)
			w.known[dir] = modTime
			if w.onChange != nil {
				w.onChange(WatchEvent{Type: EventCreated, Path: dir, Name: name})
			}
		} else if !modTime.Equal(prev) {
			name := filepath.Base(dir)
			w.logger.Info("plugin directory modified", "dir", dir, "name", name)
			w.known[dir] = modTime
			if w.onChange != nil {
				w.onChange(WatchEvent{Type: EventModified, Path: dir, Name: name})
			}
		}
	}

	// Detect deleted.
	for dir := range w.known {
		if _, ok := current[dir]; !ok {
			name := filepath.Base(dir)
			w.logger.Info("plugin directory deleted", "dir", dir, "name", name)
			delete(w.known, dir)
			if w.onChange != nil {
				w.onChange(WatchEvent{Type: EventDeleted, Path: dir, Name: name})
			}
		}
	}
}

// snapshot records the current state without firing events.
func (w *Watcher) snapshot() {
	w.known = w.scanPluginDirs()
}

// scanPluginDirs returns a map of plugin-dir → manifest modtime for all plugin
// subdirectories that contain a manifest.yaml.
func (w *Watcher) scanPluginDirs() map[string]time.Time {
	result := make(map[string]time.Time)

	entries, err := os.ReadDir(w.dir)
	if err != nil {
		w.logger.Warn("watcher: cannot read plugin directory", "dir", w.dir, "err", err)
		return result
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(w.dir, entry.Name())
		manifestPath := filepath.Join(dir, "manifest.yaml")
		info, err := os.Stat(manifestPath)
		if err != nil {
			// No manifest.yaml — skip.
			continue
		}
		result[dir] = info.ModTime()
	}

	return result
}
