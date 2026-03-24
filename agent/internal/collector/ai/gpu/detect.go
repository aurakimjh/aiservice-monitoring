package gpu

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// DetectVendors scans the current system and returns detected GPU vendors.
func DetectVendors(ctx context.Context) []Vendor {
	if runtime.GOOS == "darwin" {
		return []Vendor{VendorApple}
	}

	var vendors []Vendor
	if detectNVIDIA(ctx) {
		vendors = append(vendors, VendorNVIDIA)
	}
	if detectAMDSysfs() {
		vendors = append(vendors, VendorAMD)
	}
	if detectIntelSysfs() {
		vendors = append(vendors, VendorIntel)
	}
	return vendors
}

func detectNVIDIA(ctx context.Context) bool {
	if _, err := os.Stat("/dev/nvidia0"); err == nil {
		return true
	}
	if _, err := os.Stat("/proc/driver/nvidia"); err == nil {
		return true
	}
	if _, err := exec.LookPath("nvidia-smi"); err == nil {
		out, err := exec.CommandContext(ctx, "nvidia-smi", "--query-gpu=name", "--format=csv,noheader").Output()
		return err == nil && len(strings.TrimSpace(string(out))) > 0
	}
	return false
}

func detectAMDSysfs() bool {
	if _, err := os.Stat("/dev/kfd"); err == nil {
		return true
	}
	entries, err := os.ReadDir("/sys/class/drm")
	if err != nil {
		return false
	}
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

func detectIntelSysfs() bool {
	entries, err := os.ReadDir("/sys/class/drm")
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "card") || strings.Contains(e.Name(), "-") {
			continue
		}
		target, err := os.Readlink("/sys/class/drm/" + e.Name() + "/device/driver")
		if err == nil && (strings.Contains(target, "i915") || strings.Contains(target, "/xe")) {
			return true
		}
	}
	return false
}
