package gpu

import (
	"context"
	"fmt"
	"runtime"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers GPU metrics from all supported vendors using a driver registry.
// Schema: ai.gpu_metrics.v2 — adds vendor, is_virtual, mig_enabled fields.
type Collector struct {
	registry *Registry
}

// New creates a multi-vendor GPU Collector with all built-in drivers.
func New() *Collector {
	reg := NewRegistry(
		newNVIDIADriver(),
		newAMDDriver(),
		newIntelDriver(),
		newAppleDriver(),
		newCloudDriver(),
	)
	return &Collector{registry: reg}
}

func (c *Collector) ID() string      { return "ai-gpu" }
func (c *Collector) Version() string { return "2.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "exec", Target: "nvidia-smi", Description: "NVIDIA GPU metrics (optional)"},
		{Type: "read", Target: "/sys/class/drm", Description: "AMD/Intel GPU sysfs metrics (optional)"},
		{Type: "exec", Target: "rocm-smi", Description: "AMD ROCm GPU metrics fallback (optional)"},
		{Type: "exec", Target: "intel_gpu_top", Description: "Intel GPU metrics fallback (optional)"},
		{Type: "exec", Target: "ioreg", Description: "Apple Silicon GPU info (macOS, optional)"},
		{Type: "exec", Target: "powermetrics", Description: "Apple Silicon GPU power/util (macOS, sudo, optional)"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{"ai.gpu_metrics.v2"}
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	if runtime.GOOS == "windows" {
		return models.DetectResult{Detected: false}, nil
	}

	active := c.registry.ActiveDrivers(ctx)
	if len(active) == 0 {
		return models.DetectResult{
			Detected: false,
			Details:  map[string]string{"reason": "no GPU vendor detected"},
		}, nil
	}

	vendors := make([]string, 0, len(active))
	for _, d := range active {
		vendors = append(vendors, string(d.Vendor()))
	}
	return models.DetectResult{
		Detected: true,
		Details:  map[string]string{"vendors": fmt.Sprintf("%v", vendors)},
	}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	metrics, errs := c.registry.CollectAll(ctx)

	for _, err := range errs {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrPartialSuccess,
			Message: err.Error(),
		})
	}

	switch {
	case len(metrics) == 0 && len(errs) > 0:
		result.Status = models.StatusFailed
	case len(errs) > 0:
		result.Status = models.StatusPartial
	}

	// Build per-vendor summary
	vendorCounts := make(map[Vendor]int)
	for _, m := range metrics {
		vendorCounts[m.Vendor]++
	}
	vendorSummary := make(map[string]interface{})
	for v, count := range vendorCounts {
		vendorSummary[string(v)] = count
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "ai.gpu_metrics",
		SchemaVersion: "2.0.0",
		MetricType:    "ai_gpu_metrics",
		Category:      "ai",
		Data: map[string]interface{}{
			"gpu_count":      len(metrics),
			"vendor_summary": vendorSummary,
			"gpus":           metrics,
		},
	})

	result.Duration = time.Since(start)
	return result, nil
}
