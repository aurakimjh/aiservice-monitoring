// Package gpu provides a multi-vendor GPU metrics collector supporting
// NVIDIA, AMD, Intel, Apple Silicon, and cloud/K8s GPU environments.
package gpu

import "context"

// Vendor identifies the GPU vendor.
type Vendor string

const (
	VendorNVIDIA  Vendor = "nvidia"
	VendorAMD     Vendor = "amd"
	VendorIntel   Vendor = "intel"
	VendorApple   Vendor = "apple"
	VendorVirtual Vendor = "virtual"
	VendorUnknown Vendor = "unknown"
)

// GPUMetric is the unified v2 schema for all GPU vendors.
// Schema name: ai.gpu_metrics.v2
type GPUMetric struct {
	Index         int               `json:"index"`
	Name          string            `json:"name"`
	Vendor        Vendor            `json:"vendor"`
	VRAMUsedMB    int64             `json:"vram_used_mb"`
	VRAMTotalMB   int64             `json:"vram_total_mb"`
	VRAMPercent   float64           `json:"vram_percent"`
	TemperatureC  float64           `json:"temperature_c"`
	PowerDrawW    float64           `json:"power_draw_w"`
	CoreUtilPct   float64           `json:"core_util_percent"`
	MemUtilPct    float64           `json:"mem_util_percent"`
	CoreFreqMHz   int64             `json:"core_freq_mhz,omitempty"`
	IsVirtual     bool              `json:"is_virtual"`
	MIGEnabled    bool              `json:"mig_enabled"`
	MIGInstance   string            `json:"mig_instance,omitempty"`
	PCIID         string            `json:"pci_id,omitempty"`
	DriverVersion string            `json:"driver_version,omitempty"`
	Extra         map[string]string `json:"extra,omitempty"`
}

// Driver is the interface all GPU vendor drivers must implement.
type Driver interface {
	// Vendor returns the GPU vendor this driver handles.
	Vendor() Vendor

	// Detect returns true if this vendor's GPUs are present on the current host.
	Detect(ctx context.Context) bool

	// Collect returns GPU metrics for all GPUs of this vendor.
	Collect(ctx context.Context) ([]GPUMetric, error)
}
