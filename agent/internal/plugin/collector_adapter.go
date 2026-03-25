package plugin

import (
	"context"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// PluginCollector wraps a LoadedPlugin to implement the models.Collector interface,
// allowing plugins to be used alongside built-in collectors.
type PluginCollector struct {
	plugin  *LoadedPlugin
	manager *PluginManager
}

// NewPluginCollector creates a Collector adapter for the given plugin.
func NewPluginCollector(p *LoadedPlugin, mgr *PluginManager) *PluginCollector {
	return &PluginCollector{plugin: p, manager: mgr}
}

// ID returns the unique identifier for this plugin collector.
func (pc *PluginCollector) ID() string {
	return "plugin:" + pc.plugin.Manifest.Name
}

// Version returns the plugin version.
func (pc *PluginCollector) Version() string {
	return pc.plugin.Manifest.Version
}

// SupportedPlatforms returns the platforms this plugin supports.
func (pc *PluginCollector) SupportedPlatforms() []string {
	return pc.plugin.Manifest.Platforms
}

// RequiredPrivileges returns the privileges this plugin requires.
func (pc *PluginCollector) RequiredPrivileges() []models.Privilege {
	privs := make([]models.Privilege, len(pc.plugin.Manifest.Privileges))
	for i, p := range pc.plugin.Manifest.Privileges {
		privs[i] = models.Privilege{
			Type:   p.Type,
			Target: p.Target,
		}
	}
	return privs
}

// OutputSchemas returns the list of schema names this plugin produces.
func (pc *PluginCollector) OutputSchemas() []string {
	if pc.plugin.Manifest.Output.Schema != "" {
		return []string{pc.plugin.Manifest.Output.Schema}
	}
	return nil
}

// AutoDetect always returns detected=true for plugins — they are explicitly installed.
func (pc *PluginCollector) AutoDetect(_ context.Context) (models.DetectResult, error) {
	return models.DetectResult{
		Detected: true,
		Details: map[string]string{
			"plugin":  pc.plugin.Manifest.Name,
			"version": pc.plugin.Manifest.Version,
		},
	}, nil
}

// Collect delegates to the PluginManager's ExecutePlugin method.
func (pc *PluginCollector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	return pc.manager.ExecutePlugin(ctx, pc.plugin.Manifest.Name)
}

// Verify interface compliance at compile time.
var _ models.Collector = (*PluginCollector)(nil)
