package gpu

// amdDriver implements GPU metrics collection for AMD Radeon and Instinct GPUs.
// Primary: /sys/class/drm/cardX/device sysfs (amdgpu kernel driver).
// Fallback: rocm-smi --showallinfo --json (ROCm environments).
// MxGPU (SR-IOV) virtual functions are detected via the amdgpu-pro/mxgpu driver.

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

type amdDriver struct{}

func newAMDDriver() Driver { return &amdDriver{} }

func (d *amdDriver) Vendor() Vendor { return VendorAMD }

func (d *amdDriver) Detect(_ context.Context) bool {
	if runtime.GOOS != "linux" {
		return false
	}
	if _, err := os.Stat("/dev/kfd"); err == nil {
		return true
	}
	entries, _ := os.ReadDir("/sys/class/drm")
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "card") || strings.Contains(e.Name(), "-") {
			continue
		}
		target, err := os.Readlink("/sys/class/drm/" + e.Name() + "/device/driver")
		if err == nil && strings.Contains(target, "amdgpu") {
			return true
		}
	}
	return false
}

func (d *amdDriver) Collect(ctx context.Context) ([]GPUMetric, error) {
	metrics, err := d.collectViaSysfs()
	if err == nil && len(metrics) > 0 {
		return metrics, nil
	}
	return d.collectViaRocmSMI(ctx)
}

func (d *amdDriver) collectViaSysfs() ([]GPUMetric, error) {
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
		if err != nil || !strings.Contains(target, "amdgpu") {
			continue
		}

		m := GPUMetric{
			Index:  idx,
			Vendor: VendorAMD,
			Name:   amdReadName(devPath, e.Name()),
		}
		idx++

		if v := sysfsInt(filepath.Join(devPath, "gpu_busy_percent")); v >= 0 {
			m.CoreUtilPct = float64(v)
		}
		if used := sysfsInt64(filepath.Join(devPath, "mem_info_vram_used")); used >= 0 {
			m.VRAMUsedMB = used / (1024 * 1024)
		}
		if total := sysfsInt64(filepath.Join(devPath, "mem_info_vram_total")); total >= 0 {
			m.VRAMTotalMB = total / (1024 * 1024)
		}
		if m.VRAMTotalMB > 0 {
			m.VRAMPercent = float64(m.VRAMUsedMB) / float64(m.VRAMTotalMB) * 100
		}
		m.TemperatureC = hwmonTemp(devPath)
		m.PowerDrawW = hwmonPower(devPath)

		// MxGPU SR-IOV VF detection
		if _, err := os.Stat(filepath.Join(devPath, "virtfn0")); err == nil {
			m.IsVirtual = true
			m.Extra = map[string]string{"sr_iov": "vf"}
		}
		metrics = append(metrics, m)
	}
	return metrics, nil
}

func (d *amdDriver) collectViaRocmSMI(ctx context.Context) ([]GPUMetric, error) {
	out, err := exec.CommandContext(ctx, "rocm-smi", "--showallinfo", "--json").Output()
	if err != nil {
		return nil, fmt.Errorf("rocm-smi failed: %w", err)
	}
	return parseRocmSMIJSON(string(out))
}

func parseRocmSMIJSON(text string) ([]GPUMetric, error) {
	var metrics []GPUMetric
	idx := 0
	for _, key := range jsonTopKeys(text) {
		if !strings.HasPrefix(key, "card") {
			continue
		}
		block := jsonBlock(text, key)
		if block == "" {
			continue
		}
		m := GPUMetric{Index: idx, Vendor: VendorAMD}
		idx++
		m.Name = jsonStr(block, "Card series")
		if m.Name == "" {
			m.Name = "AMD GPU " + key
		}
		if v, err := strconv.ParseFloat(jsonStr(block, "GPU use (%)"), 64); err == nil {
			m.CoreUtilPct = v
		}
		if v, err := strconv.ParseFloat(jsonStr(block, "GPU memory use (%)"), 64); err == nil {
			m.MemUtilPct = v
		}
		if v, err := strconv.ParseFloat(jsonStr(block, "Temperature (Sensor edge) (C)"), 64); err == nil {
			m.TemperatureC = v
		}
		if v, err := strconv.ParseFloat(jsonStr(block, "Average Graphics Package Power (W)"), 64); err == nil {
			m.PowerDrawW = v
		}
		metrics = append(metrics, m)
	}
	if len(metrics) == 0 {
		return nil, fmt.Errorf("no AMD GPU data in rocm-smi output")
	}
	return metrics, nil
}

// --- sysfs helpers ---

func sysfsInt(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return -1
	}
	v, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return -1
	}
	return v
}

func sysfsInt64(path string) int64 {
	data, err := os.ReadFile(path)
	if err != nil {
		return -1
	}
	v, err := strconv.ParseInt(strings.TrimSpace(string(data)), 10, 64)
	if err != nil {
		return -1
	}
	return v
}

func amdReadName(devPath, cardName string) string {
	if data, err := os.ReadFile(filepath.Join(devPath, "product_name")); err == nil {
		if name := strings.TrimSpace(string(data)); name != "" {
			return name
		}
	}
	hwmons, _ := filepath.Glob(filepath.Join(devPath, "hwmon", "hwmon*"))
	for _, h := range hwmons {
		if data, err := os.ReadFile(filepath.Join(h, "name")); err == nil {
			return "AMD " + strings.TrimSpace(string(data))
		}
	}
	return "AMD GPU (" + cardName + ")"
}

func hwmonTemp(devPath string) float64 {
	hwmons, _ := filepath.Glob(filepath.Join(devPath, "hwmon", "hwmon*"))
	for _, h := range hwmons {
		if data, err := os.ReadFile(filepath.Join(h, "temp1_input")); err == nil {
			if v, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64); err == nil {
				return v / 1000.0
			}
		}
	}
	return 0
}

func hwmonPower(devPath string) float64 {
	hwmons, _ := filepath.Glob(filepath.Join(devPath, "hwmon", "hwmon*"))
	for _, h := range hwmons {
		if data, err := os.ReadFile(filepath.Join(h, "power1_average")); err == nil {
			if v, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64); err == nil {
				return v / 1_000_000.0
			}
		}
	}
	return 0
}

// --- minimal JSON helpers for rocm-smi output ---

func jsonTopKeys(text string) []string {
	var keys []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, `"`) {
			continue
		}
		parts := strings.SplitN(line, `"`, 3)
		if len(parts) >= 2 && parts[1] != "" {
			keys = append(keys, parts[1])
		}
	}
	return keys
}

func jsonBlock(text, key string) string {
	marker := `"` + key + `"`
	start := strings.Index(text, marker)
	if start < 0 {
		return ""
	}
	sub := text[start+len(marker):]
	brace := strings.Index(sub, "{")
	if brace < 0 {
		return ""
	}
	abs := start + len(marker) + brace
	depth := 0
	for i, c := range text[abs:] {
		switch c {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return text[abs : abs+i+1]
			}
		}
	}
	return ""
}

func jsonStr(block, key string) string {
	marker := `"` + key + `"`
	idx := strings.Index(block, marker)
	if idx < 0 {
		return ""
	}
	rest := block[idx+len(marker):]
	colon := strings.Index(rest, ":")
	if colon < 0 {
		return ""
	}
	rest = strings.TrimSpace(rest[colon+1:])
	if strings.HasPrefix(rest, `"`) {
		end := strings.Index(rest[1:], `"`)
		if end >= 0 {
			return rest[1 : end+1]
		}
	}
	end := strings.IndexAny(rest, ",\n}")
	if end >= 0 {
		return strings.TrimSpace(rest[:end])
	}
	return strings.TrimSpace(rest)
}
