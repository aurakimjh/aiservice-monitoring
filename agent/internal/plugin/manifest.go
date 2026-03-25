// Package plugin implements the central plugin deployment system for AITOP agents.
// Plugins are self-contained collector extensions distributed as ZIP archives with
// a manifest.yaml describing metadata, entrypoint, scheduling, and output schema.
package plugin

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// PluginManifest describes a collector plugin package.
type PluginManifest struct {
	Name            string           `yaml:"name"`
	Version         string           `yaml:"version"`
	Description     string           `yaml:"description"`
	Author          string           `yaml:"author"`
	MinAgentVersion string           `yaml:"min_agent_version"`
	Platforms       []string         `yaml:"platforms"`
	Categories      []string         `yaml:"categories"`
	Collector       CollectorConfig  `yaml:"collector"`
	Items           []string         `yaml:"items"`
	Privileges      []PrivilegeConfig `yaml:"privileges"`
	Output          OutputConfig     `yaml:"output"`
	Checksum        ChecksumConfig   `yaml:"checksum"`
}

// CollectorConfig describes how the plugin collects data.
type CollectorConfig struct {
	Type              string `yaml:"type"`               // script | binary | http
	Entrypoint        string `yaml:"entrypoint"`         // Linux entrypoint
	EntrypointWindows string `yaml:"entrypoint_windows"` // Windows entrypoint
	Timeout           string `yaml:"timeout"`            // e.g. "60s"
	Schedule          string `yaml:"schedule"`           // cron expression
	OnDemand          bool   `yaml:"on_demand"`
}

// PrivilegeConfig describes a required privilege for plugin execution.
type PrivilegeConfig struct {
	Type   string `yaml:"type"`
	Target string `yaml:"target"`
}

// OutputConfig describes the plugin's output schema and format.
type OutputConfig struct {
	Schema string `yaml:"schema"`
	Format string `yaml:"format"` // json | text
}

// ChecksumConfig holds integrity verification data for the plugin package.
type ChecksumConfig struct {
	Algorithm string `yaml:"algorithm"` // sha256
	Value     string `yaml:"value"`
}

// ParseManifest reads and parses a manifest.yaml at the given path.
func ParseManifest(path string) (*PluginManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest %s: %w", path, err)
	}

	var m PluginManifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest %s: %w", path, err)
	}
	return &m, nil
}

// ValidateManifest checks that a PluginManifest has all required fields and is
// compatible with the current platform.
func ValidateManifest(m *PluginManifest) error {
	if m.Name == "" {
		return fmt.Errorf("manifest: name is required")
	}
	if m.Version == "" {
		return fmt.Errorf("manifest: version is required")
	}
	if m.Collector.Type == "" {
		return fmt.Errorf("manifest: collector.type is required")
	}
	validTypes := map[string]bool{"script": true, "binary": true, "http": true}
	if !validTypes[m.Collector.Type] {
		return fmt.Errorf("manifest: unsupported collector.type %q (expected script|binary|http)", m.Collector.Type)
	}

	// Verify entrypoint is specified for the current platform.
	ep := resolveEntrypoint(m)
	if ep == "" {
		return fmt.Errorf("manifest: no entrypoint for platform %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	// Parse timeout to make sure it's valid.
	if m.Collector.Timeout != "" {
		if _, err := time.ParseDuration(m.Collector.Timeout); err != nil {
			return fmt.Errorf("manifest: invalid timeout %q: %w", m.Collector.Timeout, err)
		}
	}

	// Check platform compatibility.
	if len(m.Platforms) > 0 && !isPlatformSupported(m.Platforms) {
		return fmt.Errorf("manifest: plugin %s does not support platform %s", m.Name, runtime.GOOS)
	}

	// Output format validation.
	if m.Output.Format != "" && m.Output.Format != "json" && m.Output.Format != "text" {
		return fmt.Errorf("manifest: unsupported output format %q", m.Output.Format)
	}

	return nil
}

// VerifyChecksum verifies the SHA-256 checksum of a file against the expected value.
func VerifyChecksum(path, expectedHex string) error {
	if expectedHex == "" {
		return nil // no checksum to verify
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read for checksum: %w", err)
	}
	actual := fmt.Sprintf("%x", sha256.Sum256(data))
	if !strings.EqualFold(actual, expectedHex) {
		return fmt.Errorf("checksum mismatch: got %s, expected %s", actual, expectedHex)
	}
	return nil
}

// VerifyChecksumBytes computes SHA-256 over raw bytes and compares to expected.
func VerifyChecksumBytes(data []byte, expectedHex string) error {
	if expectedHex == "" {
		return nil
	}
	actual := fmt.Sprintf("%x", sha256.Sum256(data))
	if !strings.EqualFold(actual, expectedHex) {
		return fmt.Errorf("checksum mismatch: got %s, expected %s", actual, expectedHex)
	}
	return nil
}

// ComputeChecksum returns the hex-encoded SHA-256 digest of the given data.
func ComputeChecksum(data []byte) string {
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

// resolveEntrypoint returns the entrypoint path appropriate for the current OS.
func resolveEntrypoint(m *PluginManifest) string {
	if runtime.GOOS == "windows" && m.Collector.EntrypointWindows != "" {
		return m.Collector.EntrypointWindows
	}
	return m.Collector.Entrypoint
}

// ResolveEntrypointPath returns the absolute entrypoint path given the plugin directory.
func ResolveEntrypointPath(m *PluginManifest, pluginDir string) string {
	ep := resolveEntrypoint(m)
	if ep == "" {
		return ""
	}
	return filepath.Join(pluginDir, ep)
}

// isPlatformSupported checks if the current GOOS is in the supported list.
func isPlatformSupported(platforms []string) bool {
	for _, p := range platforms {
		if strings.EqualFold(p, runtime.GOOS) || strings.EqualFold(p, "all") {
			return true
		}
	}
	return false
}
