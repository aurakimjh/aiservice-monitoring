package batch

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ProcessMetrics holds a point-in-time snapshot of process resource usage.
type ProcessMetrics struct {
	PID          int       `json:"pid"`
	Timestamp    time.Time `json:"timestamp"`
	CPUPercent   float64   `json:"cpu_percent"`    // CPU usage percentage
	MemoryRSS    int64     `json:"memory_rss"`     // bytes
	MemoryVMS    int64     `json:"memory_vms"`     // bytes
	MemoryPeak   int64     `json:"memory_peak"`    // bytes (VmPeak)
	ThreadCount  int       `json:"thread_count"`
	IOReadBytes  int64     `json:"io_read_bytes"`
	IOWriteBytes int64     `json:"io_write_bytes"`
	IOReadOps    int64     `json:"io_read_ops"`
	IOWriteOps   int64     `json:"io_write_ops"`
}

// ProcessCollector polls /proc/{PID} for live batch process metrics.
type ProcessCollector struct {
	mu       sync.Mutex
	prevCPU  map[int]cpuSample // PID → previous CPU sample for delta calculation
	numCPU   int
}

// cpuSample holds a point-in-time CPU reading for delta calculation.
type cpuSample struct {
	utime     uint64
	stime     uint64
	timestamp time.Time
}

// NewProcessCollector creates a new process metrics collector.
func NewProcessCollector() *ProcessCollector {
	return &ProcessCollector{
		prevCPU: make(map[int]cpuSample),
		numCPU:  runtime.NumCPU(),
	}
}

// CollectMetrics reads metrics for a given PID from /proc.
// On non-Linux platforms, returns a stub with TODO.
func (pc *ProcessCollector) CollectMetrics(pid int) (ProcessMetrics, error) {
	if runtime.GOOS == "windows" {
		return pc.collectMetricsWindows(pid)
	}
	return pc.collectMetricsLinux(pid)
}

// collectMetricsLinux reads process metrics from the Linux /proc filesystem.
func (pc *ProcessCollector) collectMetricsLinux(pid int) (ProcessMetrics, error) {
	now := time.Now()
	m := ProcessMetrics{
		PID:       pid,
		Timestamp: now,
	}

	// Check if process exists
	procDir := fmt.Sprintf("/proc/%d", pid)
	if _, err := os.Stat(procDir); err != nil {
		return m, fmt.Errorf("process %d not found: %w", pid, err)
	}

	// ── /proc/{pid}/stat → CPU ticks ────────────────────────────────────────
	statData, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err == nil {
		m.CPUPercent = pc.calculateCPUPercent(pid, string(statData), now)
	}

	// ── /proc/{pid}/status → VmRSS, VmSize, VmPeak, Threads ────────────────
	statusData, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err == nil {
		m.MemoryRSS, m.MemoryVMS, m.MemoryPeak, m.ThreadCount = parseStatus(string(statusData))
	}

	// ── /proc/{pid}/io → read_bytes, write_bytes, syscr, syscw ──────────────
	ioData, err := os.ReadFile(fmt.Sprintf("/proc/%d/io", pid))
	if err == nil {
		m.IOReadBytes, m.IOWriteBytes, m.IOReadOps, m.IOWriteOps = parseIO(string(ioData))
	}

	return m, nil
}

// calculateCPUPercent computes CPU usage percentage from /proc/{pid}/stat.
func (pc *ProcessCollector) calculateCPUPercent(pid int, stat string, now time.Time) float64 {
	closeParen := strings.LastIndex(stat, ")")
	if closeParen < 0 || closeParen+2 >= len(stat) {
		return 0
	}
	fields := strings.Fields(stat[closeParen+2:])
	// utime = field 11 (0-indexed from after ")")
	// stime = field 12
	if len(fields) < 13 {
		return 0
	}
	utime, _ := strconv.ParseUint(fields[11], 10, 64)
	stime, _ := strconv.ParseUint(fields[12], 10, 64)

	pc.mu.Lock()
	prev, hasPrev := pc.prevCPU[pid]
	pc.prevCPU[pid] = cpuSample{utime: utime, stime: stime, timestamp: now}
	pc.mu.Unlock()

	if !hasPrev {
		return 0
	}

	// Delta ticks
	dticks := float64((utime - prev.utime) + (stime - prev.stime))
	dt := now.Sub(prev.timestamp).Seconds()
	if dt <= 0 {
		return 0
	}

	// Convert ticks to seconds (100 ticks/sec on Linux default)
	clkTck := 100.0
	cpuSeconds := dticks / clkTck
	percent := (cpuSeconds / dt) * 100.0

	return percent
}

// parseStatus extracts VmRSS, VmSize, VmPeak, and Threads from /proc/{pid}/status.
func parseStatus(content string) (rss, vms, peak int64, threads int) {
	for _, line := range strings.Split(content, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "VmRSS:":
			v, _ := strconv.ParseInt(fields[1], 10, 64)
			rss = v * 1024 // kB → bytes
		case "VmSize:":
			v, _ := strconv.ParseInt(fields[1], 10, 64)
			vms = v * 1024
		case "VmPeak:":
			v, _ := strconv.ParseInt(fields[1], 10, 64)
			peak = v * 1024
		case "Threads:":
			threads, _ = strconv.Atoi(fields[1])
		}
	}
	return
}

// parseIO extracts I/O counters from /proc/{pid}/io.
func parseIO(content string) (readBytes, writeBytes, readOps, writeOps int64) {
	for _, line := range strings.Split(content, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "read_bytes:":
			readBytes, _ = strconv.ParseInt(fields[1], 10, 64)
		case "write_bytes:":
			writeBytes, _ = strconv.ParseInt(fields[1], 10, 64)
		case "syscr:":
			readOps, _ = strconv.ParseInt(fields[1], 10, 64)
		case "syscw:":
			writeOps, _ = strconv.ParseInt(fields[1], 10, 64)
		}
	}
	return
}

// CleanupPID removes the CPU sample history for a terminated process.
func (pc *ProcessCollector) CleanupPID(pid int) {
	pc.mu.Lock()
	delete(pc.prevCPU, pid)
	pc.mu.Unlock()
}

// collectMetricsWindows is a stub for Windows process metrics collection.
func (pc *ProcessCollector) collectMetricsWindows(pid int) (ProcessMetrics, error) {
	// TODO: implement Windows process metrics collection via WMI.
	// Win32_PerfFormattedData_PerfProc_Process for CPU, memory, I/O.
	return ProcessMetrics{
		PID:       pid,
		Timestamp: time.Now(),
	}, fmt.Errorf("windows process metrics collection not yet implemented")
}
