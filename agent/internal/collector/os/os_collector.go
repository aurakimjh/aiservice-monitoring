package os

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers OS-level metrics (CPU, Memory, Disk, Network, Process).
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
			{Type: "read", Target: "/proc", Description: "read /proc for CPU, memory, disk, network, process info"},
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
		"os.process_list.v1",
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

	// Disk metrics
	if diskItem, err := c.collectDisk(); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("disk metrics collection failed: %v", err),
			Command: "read /proc/diskstats",
		})
	} else {
		result.Items = append(result.Items, *diskItem)
	}

	// Network metrics
	if netItem, err := c.collectNetwork(); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("network metrics collection failed: %v", err),
			Command: "read /proc/net/dev",
		})
	} else {
		result.Items = append(result.Items, *netItem)
	}

	// Process list
	if procItem, err := c.collectProcessList(); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("process list collection failed: %v", err),
			Command: "read /proc/[pid]/stat",
		})
	} else {
		result.Items = append(result.Items, *procItem)
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

// DiskStat holds I/O statistics for a single block device.
type DiskStat struct {
	Device          string `json:"device"`
	ReadsCompleted  uint64 `json:"reads_completed"`
	SectorsRead     uint64 `json:"sectors_read"`
	ReadMs          uint64 `json:"read_ms"`
	WritesCompleted uint64 `json:"writes_completed"`
	SectorsWritten  uint64 `json:"sectors_written"`
	WriteMs         uint64 `json:"write_ms"`
	IOsInProgress   uint64 `json:"ios_in_progress"`
	IOMs            uint64 `json:"io_ms"`
}

func (c *Collector) collectDisk() (*models.CollectedItem, error) {
	if runtime.GOOS != "linux" {
		return &models.CollectedItem{
			SchemaName:    "os.disk_metrics",
			SchemaVersion: "1.0.0",
			MetricType:    "os_disk",
			Category:      "it",
			Data:          map[string]interface{}{"note": "non-linux: use platform-specific collection"},
		}, nil
	}

	f, err := os.Open("/proc/diskstats")
	if err != nil {
		return nil, fmt.Errorf("open /proc/diskstats: %w", err)
	}
	defer f.Close()

	var disks []DiskStat
	scanner := bufio.NewScanner(f)

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		// /proc/diskstats has at least 14 fields
		if len(fields) < 14 {
			continue
		}

		device := fields[2]
		// Skip loop, ram, and partition devices (e.g., sda1, nvme0n1p1)
		if strings.HasPrefix(device, "loop") || strings.HasPrefix(device, "ram") {
			continue
		}
		// Skip partitions: devices ending with a digit that are sub-devices
		// (e.g., sda1, nvme0n1p1) — keep only whole disks
		if isPartition(device) {
			continue
		}

		disk := DiskStat{Device: device}
		disk.ReadsCompleted, _ = strconv.ParseUint(fields[3], 10, 64)
		// fields[4] = reads merged
		disk.SectorsRead, _ = strconv.ParseUint(fields[5], 10, 64)
		disk.ReadMs, _ = strconv.ParseUint(fields[6], 10, 64)
		disk.WritesCompleted, _ = strconv.ParseUint(fields[7], 10, 64)
		// fields[8] = writes merged
		disk.SectorsWritten, _ = strconv.ParseUint(fields[9], 10, 64)
		disk.WriteMs, _ = strconv.ParseUint(fields[10], 10, 64)
		disk.IOsInProgress, _ = strconv.ParseUint(fields[11], 10, 64)
		disk.IOMs, _ = strconv.ParseUint(fields[12], 10, 64)

		disks = append(disks, disk)
	}

	return &models.CollectedItem{
		SchemaName:    "os.disk_metrics",
		SchemaVersion: "1.0.0",
		MetricType:    "os_disk",
		Category:      "it",
		Data: map[string]interface{}{
			"disk_count": len(disks),
			"disks":      disks,
		},
	}, nil
}

// isPartition returns true if the device name looks like a partition
// (e.g., sda1, nvme0n1p2) rather than a whole disk.
func isPartition(device string) bool {
	if len(device) == 0 {
		return false
	}
	// nvme devices: nvme0n1 is a disk, nvme0n1p1 is a partition
	if strings.Contains(device, "nvme") {
		return strings.Contains(device, "p") && device[len(device)-1] >= '0' && device[len(device)-1] <= '9'
	}
	// sd/hd/vd devices: sda is a disk, sda1 is a partition
	return device[len(device)-1] >= '1' && device[len(device)-1] <= '9' &&
		!strings.HasPrefix(device, "nvme")
}

// NetDevStat holds receive/transmit statistics for a network interface.
type NetDevStat struct {
	Interface string `json:"interface"`
	RxBytes   uint64 `json:"rx_bytes"`
	RxPackets uint64 `json:"rx_packets"`
	RxErrors  uint64 `json:"rx_errors"`
	RxDrop    uint64 `json:"rx_drop"`
	TxBytes   uint64 `json:"tx_bytes"`
	TxPackets uint64 `json:"tx_packets"`
	TxErrors  uint64 `json:"tx_errors"`
	TxDrop    uint64 `json:"tx_drop"`
}

func (c *Collector) collectNetwork() (*models.CollectedItem, error) {
	if runtime.GOOS != "linux" {
		return &models.CollectedItem{
			SchemaName:    "os.network_metrics",
			SchemaVersion: "1.0.0",
			MetricType:    "os_network",
			Category:      "it",
			Data:          map[string]interface{}{"note": "non-linux: use platform-specific collection"},
		}, nil
	}

	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return nil, fmt.Errorf("open /proc/net/dev: %w", err)
	}
	defer f.Close()

	var interfaces []NetDevStat
	scanner := bufio.NewScanner(f)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		// Skip the two header lines
		if lineNum <= 2 {
			continue
		}

		line := scanner.Text()
		// Format: "  eth0: rx_bytes rx_packets rx_errs rx_drop ... tx_bytes tx_packets ..."
		colonIdx := strings.Index(line, ":")
		if colonIdx == -1 {
			continue
		}

		iface := strings.TrimSpace(line[:colonIdx])
		fields := strings.Fields(line[colonIdx+1:])
		if len(fields) < 16 {
			continue
		}

		stat := NetDevStat{Interface: iface}
		stat.RxBytes, _ = strconv.ParseUint(fields[0], 10, 64)
		stat.RxPackets, _ = strconv.ParseUint(fields[1], 10, 64)
		stat.RxErrors, _ = strconv.ParseUint(fields[2], 10, 64)
		stat.RxDrop, _ = strconv.ParseUint(fields[3], 10, 64)
		stat.TxBytes, _ = strconv.ParseUint(fields[8], 10, 64)
		stat.TxPackets, _ = strconv.ParseUint(fields[9], 10, 64)
		stat.TxErrors, _ = strconv.ParseUint(fields[10], 10, 64)
		stat.TxDrop, _ = strconv.ParseUint(fields[11], 10, 64)

		interfaces = append(interfaces, stat)
	}

	return &models.CollectedItem{
		SchemaName:    "os.network_metrics",
		SchemaVersion: "1.0.0",
		MetricType:    "os_network",
		Category:      "it",
		Data: map[string]interface{}{
			"interface_count": len(interfaces),
			"interfaces":      interfaces,
		},
	}, nil
}

// ProcessInfo holds basic information about a single OS process.
type ProcessInfo struct {
	PID   int    `json:"pid"`
	Name  string `json:"name"`
	State string `json:"state"`
	PPID  int    `json:"ppid"`
	// CPU time in jiffies (user + kernel)
	CPUTime uint64 `json:"cpu_time_jiffies"`
	// Virtual memory size in bytes
	VSize uint64 `json:"vsize_bytes"`
	// Resident set size in pages
	RSS int64 `json:"rss_pages"`
}

const maxProcesses = 256

func (c *Collector) collectProcessList() (*models.CollectedItem, error) {
	if runtime.GOOS != "linux" {
		return &models.CollectedItem{
			SchemaName:    "os.process_list",
			SchemaVersion: "1.0.0",
			MetricType:    "os_process_list",
			Category:      "it",
			Data:          map[string]interface{}{"note": "non-linux: use platform-specific collection"},
		}, nil
	}

	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, fmt.Errorf("read /proc directory: %w", err)
	}

	var processes []ProcessInfo
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Only process numeric directories (PIDs)
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}

		proc, err := readProcStat(pid)
		if err != nil {
			// Process may have exited; skip silently
			continue
		}
		processes = append(processes, proc)

		if len(processes) >= maxProcesses {
			break
		}
	}

	return &models.CollectedItem{
		SchemaName:    "os.process_list",
		SchemaVersion: "1.0.0",
		MetricType:    "os_process_list",
		Category:      "it",
		Data: map[string]interface{}{
			"process_count": len(processes),
			"processes":     processes,
		},
	}, nil
}

// readProcStat parses /proc/[pid]/stat for a single process.
// The format is: pid (comm) state ppid ... utime stime ... vsize rss ...
func readProcStat(pid int) (ProcessInfo, error) {
	path := filepath.Join("/proc", strconv.Itoa(pid), "stat")
	data, err := os.ReadFile(path)
	if err != nil {
		return ProcessInfo{}, err
	}

	line := strings.TrimSpace(string(data))

	// Find the process name enclosed in parentheses.
	// The name can contain spaces and parens, so we find the LAST ')'.
	firstParen := strings.Index(line, "(")
	lastParen := strings.LastIndex(line, ")")
	if firstParen == -1 || lastParen == -1 || lastParen <= firstParen {
		return ProcessInfo{}, fmt.Errorf("malformed /proc/%d/stat", pid)
	}

	comm := line[firstParen+1 : lastParen]
	rest := strings.Fields(line[lastParen+1:])
	// rest[0] = state, rest[1] = ppid, ... rest[11] = utime, rest[12] = stime
	// rest[20] = vsize, rest[21] = rss
	if len(rest) < 22 {
		return ProcessInfo{}, fmt.Errorf("too few fields in /proc/%d/stat", pid)
	}

	proc := ProcessInfo{
		PID:  pid,
		Name: comm,
	}
	proc.State = rest[0]
	proc.PPID, _ = strconv.Atoi(rest[1])

	utime, _ := strconv.ParseUint(rest[11], 10, 64)
	stime, _ := strconv.ParseUint(rest[12], 10, 64)
	proc.CPUTime = utime + stime

	proc.VSize, _ = strconv.ParseUint(rest[20], 10, 64)
	proc.RSS, _ = strconv.ParseInt(rest[21], 10, 64)

	return proc, nil
}

func (c *Collector) collectSystemInfo() (*models.CollectedItem, error) {
	info := map[string]interface{}{
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
		"num_cpu": runtime.NumCPU(),
	}

	if h, err := os.Hostname(); err == nil {
		info["hostname"] = h
	}

	// Linux: read /etc/os-release for distro info
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

		// Read kernel version from /proc/version
		if data, err := os.ReadFile("/proc/version"); err == nil {
			versionLine := strings.TrimSpace(string(data))
			// Format: "Linux version 5.15.0-91-generic (builder@...) ..."
			fields := strings.Fields(versionLine)
			if len(fields) >= 3 {
				info["kernel_version"] = fields[2]
			}
			info["kernel_version_full"] = versionLine
		}

		// Collect network interface names from /proc/net/dev
		if f, err := os.Open("/proc/net/dev"); err == nil {
			defer f.Close()
			var ifaces []string
			scanner := bufio.NewScanner(f)
			lineNum := 0
			for scanner.Scan() {
				lineNum++
				if lineNum <= 2 {
					continue
				}
				line := scanner.Text()
				colonIdx := strings.Index(line, ":")
				if colonIdx == -1 {
					continue
				}
				iface := strings.TrimSpace(line[:colonIdx])
				ifaces = append(ifaces, iface)
			}
			info["network_interfaces"] = ifaces
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
