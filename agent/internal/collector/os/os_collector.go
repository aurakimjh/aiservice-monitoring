package os

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers OS-level metrics (CPU, Memory, Disk, Network).
type Collector struct{}

func New() *Collector {
	return &Collector{}
}

func (c *Collector) ID() string      { return "os" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "windows", "darwin"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	if runtime.GOOS == "linux" {
		return []models.Privilege{
			{Type: "read", Target: "/proc", Description: "read /proc for CPU, memory, process info"},
			{Type: "read", Target: "/sys", Description: "read /sys for device info"},
		}
	}
	return nil
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"os.cpu_metrics.v1",
		"os.memory_metrics.v1",
		"os.disk_metrics.v1",
		"os.network_metrics.v1",
		"os.system_info.v1",
	}
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	// OS collector is always active
	return models.DetectResult{
		Detected: true,
		Details:  map[string]string{"os": runtime.GOOS, "arch": runtime.GOARCH},
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

	var errs []models.CollectError

	// CPU metrics
	if cpuItem, err := c.collectCPU(); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("CPU metrics collection failed: %v", err),
			Command: "read /proc/stat",
		})
	} else {
		result.Items = append(result.Items, *cpuItem)
	}

	// Memory metrics
	if memItem, err := c.collectMemory(); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("memory metrics collection failed: %v", err),
			Command: "read /proc/meminfo",
		})
	} else {
		result.Items = append(result.Items, *memItem)
	}

	// System info
	if sysItem, err := c.collectSystemInfo(); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("system info collection failed: %v", err),
		})
	} else {
		result.Items = append(result.Items, *sysItem)
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(errs) > 0 && len(result.Items) == 0 {
		result.Status = models.StatusFailed
	} else if len(errs) > 0 {
		result.Status = models.StatusPartial
	}

	return result, nil
}

// --- Linux-specific collection ---

func (c *Collector) collectCPU() (*models.CollectedItem, error) {
	if runtime.GOOS != "linux" {
		return &models.CollectedItem{
			SchemaName:    "os.cpu_metrics",
			SchemaVersion: "1.0.0",
			MetricType:    "os_cpu",
			Category:      "it",
			Data:          map[string]interface{}{"note": "non-linux: use platform-specific collection"},
		}, nil
	}

	f, err := os.Open("/proc/stat")
	if err != nil {
		return nil, fmt.Errorf("open /proc/stat: %w", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	cpuData := make(map[string]interface{})

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			if len(fields) >= 5 {
				user, _ := strconv.ParseUint(fields[1], 10, 64)
				nice, _ := strconv.ParseUint(fields[2], 10, 64)
				system, _ := strconv.ParseUint(fields[3], 10, 64)
				idle, _ := strconv.ParseUint(fields[4], 10, 64)
				total := user + nice + system + idle
				if total > 0 {
					cpuData["user"] = user
					cpuData["nice"] = nice
					cpuData["system"] = system
					cpuData["idle"] = idle
					cpuData["total"] = total
					used := total - idle
					cpuData["usage_percent"] = float64(used) / float64(total) * 100
				}
			}
		}
	}

	cpuData["num_cpu"] = runtime.NumCPU()

	return &models.CollectedItem{
		SchemaName:    "os.cpu_metrics",
		SchemaVersion: "1.0.0",
		MetricType:    "os_cpu",
		Category:      "it",
		Data:          cpuData,
	}, nil
}

func (c *Collector) collectMemory() (*models.CollectedItem, error) {
	if runtime.GOOS != "linux" {
		return &models.CollectedItem{
			SchemaName:    "os.memory_metrics",
			SchemaVersion: "1.0.0",
			MetricType:    "os_memory",
			Category:      "it",
			Data:          map[string]interface{}{"note": "non-linux: use platform-specific collection"},
		}, nil
	}

	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return nil, fmt.Errorf("open /proc/meminfo: %w", err)
	}
	defer f.Close()

	memData := make(map[string]interface{})
	scanner := bufio.NewScanner(f)

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		valStr := strings.TrimSpace(parts[1])
		valStr = strings.TrimSuffix(valStr, " kB")
		valStr = strings.TrimSpace(valStr)

		if val, err := strconv.ParseUint(valStr, 10, 64); err == nil {
			switch key {
			case "MemTotal":
				memData["total_kb"] = val
			case "MemFree":
				memData["free_kb"] = val
			case "MemAvailable":
				memData["available_kb"] = val
			case "Buffers":
				memData["buffers_kb"] = val
			case "Cached":
				memData["cached_kb"] = val
			case "SwapTotal":
				memData["swap_total_kb"] = val
			case "SwapFree":
				memData["swap_free_kb"] = val
			}
		}
	}

	// Calculate usage percent
	if total, ok := memData["total_kb"].(uint64); ok && total > 0 {
		if avail, ok := memData["available_kb"].(uint64); ok {
			memData["usage_percent"] = float64(total-avail) / float64(total) * 100
		}
	}

	return &models.CollectedItem{
		SchemaName:    "os.memory_metrics",
		SchemaVersion: "1.0.0",
		MetricType:    "os_memory",
		Category:      "it",
		Data:          memData,
	}, nil
}

func (c *Collector) collectSystemInfo() (*models.CollectedItem, error) {
	info := map[string]interface{}{
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"num_cpu":  runtime.NumCPU(),
		"hostname": "",
	}

	if h, err := os.Hostname(); err == nil {
		info["hostname"] = h
	}

	// Linux: read /etc/os-release
	if runtime.GOOS == "linux" {
		if data, err := os.ReadFile("/etc/os-release"); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					key := parts[0]
					val := strings.Trim(parts[1], `"`)
					switch key {
					case "ID":
						info["os_id"] = val
					case "VERSION_ID":
						info["os_version_id"] = val
					case "PRETTY_NAME":
						info["os_pretty_name"] = val
					}
				}
			}
		}
	}

	return &models.CollectedItem{
		SchemaName:    "os.system_info",
		SchemaVersion: "1.0.0",
		MetricType:    "os_system_info",
		Category:      "it",
		Data:          info,
	}, nil
}
