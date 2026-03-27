package health

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// systemMetrics returns system-wide CPU usage % and used memory in MB.
func systemMetrics() (cpuPct float64, usedMemMB float64) {
	cpuPct = syswideCPUPercent()
	usedMemMB = syswideUsedMemMB()
	return
}

// ── CPU ────────────────────────────────────────────────────────────

var (
	prevIdleTime  uint64
	prevTotalTime uint64
	cpuMu         sync.Mutex
)

func syswideCPUPercent() float64 {
	if runtime.GOOS == "linux" {
		return linuxCPUPercent()
	}
	// Windows / other: use Go runtime approximation (NumCPU * process CPU)
	// This is a rough estimate; for production use WMI or PDH.
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return float64(runtime.NumGoroutine()) * 0.5 // rough estimate
}

func linuxCPUPercent() float64 {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	lines := strings.Split(string(data), "\n")
	if len(lines) == 0 {
		return 0
	}
	// First line: "cpu  user nice system idle iowait irq softirq steal"
	fields := strings.Fields(lines[0])
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0
	}

	var idle, total uint64
	for i := 1; i < len(fields); i++ {
		val, _ := strconv.ParseUint(fields[i], 10, 64)
		total += val
		if i == 4 { // idle is 4th value (index 4 in fields, 0-based from fields[1])
			idle = val
		}
	}

	cpuMu.Lock()
	defer cpuMu.Unlock()

	idleDelta := idle - prevIdleTime
	totalDelta := total - prevTotalTime
	prevIdleTime = idle
	prevTotalTime = total

	if totalDelta == 0 {
		return 0
	}
	return float64(totalDelta-idleDelta) / float64(totalDelta) * 100
}

// ── Memory ─────────────────────────────────────────────────────────

func syswideUsedMemMB() float64 {
	if runtime.GOOS == "linux" {
		return linuxUsedMemMB()
	}
	// Windows fallback: report Go Sys memory * rough multiplier
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return float64(m.Sys) / 1024 / 1024
}

func linuxUsedMemMB() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	var totalKB, availKB uint64
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		switch fields[0] {
		case "MemTotal:":
			totalKB = val
		case "MemAvailable:":
			availKB = val
		}
	}
	usedKB := totalKB - availKB
	return float64(usedKB) / 1024
}

// init starts periodic CPU sampling for first-call accuracy.
func init() {
	// Pre-warm CPU counters on Linux
	if runtime.GOOS == "linux" {
		_ = linuxCPUPercent()
		time.Sleep(100 * time.Millisecond)
	}
}
