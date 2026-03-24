//go:build darwin

package gpu

// appleDriver implements Apple Silicon M-series GPU metrics collection.
// ioreg (no sudo): GPU model, core count, unified memory size.
// powermetrics (sudo): GPU utilization, frequency, power draw.

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
)

type appleDriver struct{}

func newAppleDriver() Driver { return &appleDriver{} }

func (d *appleDriver) Vendor() Vendor             { return VendorApple }
func (d *appleDriver) Detect(_ context.Context) bool { return true }

func (d *appleDriver) Collect(ctx context.Context) ([]GPUMetric, error) {
	m := GPUMetric{Index: 0, Vendor: VendorApple}
	appleEnrichIOReg(ctx, &m)
	appleEnrichPowerMetrics(ctx, &m)
	return []GPUMetric{m}, nil
}

func appleEnrichIOReg(ctx context.Context, m *GPUMetric) {
	out, err := exec.CommandContext(ctx, "ioreg", "-r", "-c", "IOAccelerator", "-d", "1").Output()
	if err != nil {
		m.Name = "Apple Silicon GPU"
		return
	}
	text := string(out)

	// GPU model name
	if idx := strings.Index(text, `"model" = `); idx >= 0 {
		rest := text[idx+len(`"model" = `):]
		if strings.HasPrefix(rest, `"`) {
			end := strings.Index(rest[1:], `"`)
			if end >= 0 {
				m.Name = rest[1 : end+1]
			}
		}
	}
	if m.Name == "" {
		m.Name = "Apple Silicon GPU"
	}

	// Unified memory size (VRAM,totalMB)
	if idx := strings.Index(text, `"VRAM,totalMB" = `); idx >= 0 {
		rest := strings.TrimSpace(text[idx+len(`"VRAM,totalMB" = `):])
		end := strings.IndexAny(rest, "\n\r,}")
		if end > 0 {
			if v, err := strconv.ParseInt(strings.TrimSpace(rest[:end]), 10, 64); err == nil {
				m.VRAMTotalMB = v
			}
		}
	}

	// GPU core count
	if idx := strings.Index(text, `"gpu-core-count" = `); idx >= 0 {
		rest := strings.TrimSpace(text[idx+len(`"gpu-core-count" = `):])
		end := strings.IndexAny(rest, "\n\r,}")
		if end > 0 {
			if v, err := strconv.Atoi(strings.TrimSpace(rest[:end])); err == nil {
				if m.Extra == nil {
					m.Extra = make(map[string]string)
				}
				m.Extra["gpu_cores"] = strconv.Itoa(v)
			}
		}
	}
}

// appleEnrichPowerMetrics reads GPU utilization, frequency, and power
// from powermetrics text output.  Requires sudo; silently skipped if unavailable.
func appleEnrichPowerMetrics(ctx context.Context, m *GPUMetric) {
	out, err := exec.CommandContext(ctx,
		"powermetrics", "--samplers", "gpu_power", "-n", "1", "-i", "100").Output()
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "GPU Active residency:"):
			if v := appleExtractPercent(line); v >= 0 {
				m.CoreUtilPct = v
			}
		case strings.HasPrefix(line, "GPU Frequency:"):
			if v := appleExtractNumber(line); v >= 0 {
				m.CoreFreqMHz = int64(v)
			}
		case strings.HasPrefix(line, "GPU Power:"):
			if v := appleExtractNumber(line); v >= 0 {
				if strings.Contains(line, "mW") {
					m.PowerDrawW = v / 1000.0
				} else {
					m.PowerDrawW = v
				}
			}
		}
	}
}

func appleExtractPercent(line string) float64 {
	idx := strings.LastIndex(line, " ")
	if idx < 0 {
		return -1
	}
	s := strings.TrimSuffix(strings.TrimSpace(line[idx:]), "%")
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return -1
	}
	return v
}

func appleExtractNumber(line string) float64 {
	for _, f := range strings.Fields(line) {
		f = strings.TrimSuffix(strings.TrimSuffix(f, "MHz"), "mW")
		if v, err := strconv.ParseFloat(f, 64); err == nil {
			return v
		}
	}
	return -1
}
