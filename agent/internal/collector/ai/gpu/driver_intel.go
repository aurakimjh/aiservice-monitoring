package gpu

// intelDriver implements GPU metrics collection for Intel Arc, Flex, and Max GPUs.
// Primary: /sys/class/drm/cardX/device sysfs (i915/xe kernel driver).
// Fallback: intel_gpu_top -J (if igt-gpu-tools installed).
// SR-IOV VF (Flex/Max virtualization) support via sysfs detection.

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

type intelDriver struct{}

func newIntelDriver() Driver { return &intelDriver{} }

func (d *intelDriver) Vendor() Vendor { return VendorIntel }

func (d *intelDriver) Detect(_ context.Context) bool {
	if runtime.GOOS != "linux" {
		return false
	}
	entries, _ := os.ReadDir("/sys/class/drm")
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "card") || strings.Contains(e.Name(), "-") {
			continue
		}
		target, err := os.Readlink("/sys/class/drm/" + e.Name() + "/device/driver")
		if err != nil {
			continue
		}
		drv := filepath.Base(target)
		if drv == "i915" || drv == "xe" {
			return true
		}
	}
	return false
}

func (d *intelDriver) Collect(ctx context.Context) ([]GPUMetric, error) {
	metrics, err := d.collectViaSysfs()
	if err == nil && len(metrics) > 0 {
		return metrics, nil
	}
	return d.collectViaIntelGPUTop(ctx)
}

func (d *intelDriver) collectViaSysfs() ([]GPUMetric, error) {
	entries, err := os.ReadDir("/sys/class/drm")
	if err != nil {
		return nil, fmt.Errorf("cannot read /sys/class/drm: %w", err)
	}
	var metrics []GPUMetric
	idx := 0
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "card") || strings.Contains(e.Name(), "-") {
			continue
		}
		devPath := filepath.Join("/sys/class/drm", e.Name(), "device")
		target, err := os.Readlink(filepath.Join(devPath, "driver"))
		if err != nil {
			continue
		}
		drv := filepath.Base(target)
		if drv != "i915" && drv != "xe" {
			continue
		}

		m := GPUMetric{
			Index:  idx,
			Vendor: VendorIntel,
			Name:   intelReadName(devPath, e.Name()),
			Extra:  map[string]string{"driver": drv},
		}
		idx++

		// Current render frequency (i915: gt/gt0/rps_cur_freq_mhz)
		if v := intelSysfsInt(filepath.Join(devPath, "gt/gt0/rps_cur_freq_mhz")); v >= 0 {
			m.CoreFreqMHz = int64(v)
		}
		m.TemperatureC = hwmonTemp(devPath)
		m.PowerDrawW = hwmonPower(devPath)

		// SR-IOV VF detection (Flex/Max virtualization)
		if _, err := os.Stat(filepath.Join(devPath, "physfn")); err == nil {
			m.IsVirtual = true
			m.Extra["sr_iov"] = "vf"
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}

func (d *intelDriver) collectViaIntelGPUTop(ctx context.Context) ([]GPUMetric, error) {
	out, err := exec.CommandContext(ctx, "intel_gpu_top", "-J", "-s", "100").Output()
	if err != nil {
		return nil, fmt.Errorf("intel_gpu_top failed: %w", err)
	}
	return parseIntelGPUTopJSON(string(out))
}

func parseIntelGPUTopJSON(text string) ([]GPUMetric, error) {
	m := GPUMetric{Index: 0, Vendor: VendorIntel, Name: "Intel GPU"}
	if v := intelJSONFloat(text, "busy"); v >= 0 {
		m.CoreUtilPct = v
	}
	if v := intelJSONFloat(text, "actual"); v >= 0 {
		m.CoreFreqMHz = int64(v)
	}
	if m.CoreUtilPct == 0 && m.CoreFreqMHz == 0 {
		return nil, fmt.Errorf("no usable data from intel_gpu_top")
	}
	return []GPUMetric{m}, nil
}

func intelSysfsInt(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return -1
	}
	token := strings.Fields(strings.TrimSpace(string(data)))
	if len(token) == 0 {
		return -1
	}
	v, err := strconv.Atoi(token[0])
	if err != nil {
		return -1
	}
	return v
}

func intelReadName(devPath, cardName string) string {
	if data, err := os.ReadFile(filepath.Join(devPath, "product_name")); err == nil {
		if name := strings.TrimSpace(string(data)); name != "" {
			return name
		}
	}
	if data, err := os.ReadFile(filepath.Join(devPath, "subsystem_device")); err == nil {
		return "Intel GPU " + strings.TrimSpace(string(data))
	}
	return "Intel GPU (" + cardName + ")"
}

func intelJSONFloat(text, key string) float64 {
	marker := `"` + key + `"`
	idx := strings.Index(text, marker)
	if idx < 0 {
		return -1
	}
	rest := text[idx+len(marker):]
	colon := strings.Index(rest, ":")
	if colon < 0 {
		return -1
	}
	rest = strings.TrimSpace(rest[colon+1:])
	end := strings.IndexAny(rest, ",\n}")
	if end >= 0 {
		rest = strings.TrimSpace(rest[:end])
	}
	v, err := strconv.ParseFloat(rest, 64)
	if err != nil {
		return -1
	}
	return v
}
