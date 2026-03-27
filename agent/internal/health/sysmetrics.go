package health

import (
	"fmt"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// systemMetrics returns system-wide CPU usage % and used memory in MB.
func systemMetrics() (cpuPct float64, usedMemMB float64) {
	cpuPct = syswideCPUPercent()
	usedMemMB = syswideUsedMemMB()
	return
}

// CollectOSMetrics gathers detailed OS metrics for heartbeat.
func CollectOSMetrics() *models.OSMetrics {
	m := &models.OSMetrics{}
	m.CPU = collectCPUBreakdown()
	m.Memory = collectMemoryBreakdown()
	m.Disks = collectDiskMetrics()
	m.Network = collectNetMetrics()
	m.TopProc = collectTopProcesses()
	return m
}

// ── CPU ────────────────────────────────────────────────────

var (
	prevIdle, prevTotal uint64
	prevUser, prevSys   uint64
	prevIOWait          uint64
	cpuMu               sync.Mutex
)

func syswideCPUPercent() float64 {
	b := collectCPUBreakdown()
	return b.TotalPct
}

func collectCPUBreakdown() models.CPUMetrics {
	if runtime.GOOS == "windows" {
		return collectCPUBreakdownWindows()
	}
	if runtime.GOOS != "linux" {
		pct := float64(runtime.NumGoroutine()) * 0.3
		return models.CPUMetrics{UserPct: pct * 0.7, SystemPct: pct * 0.3, IdlePct: 100 - pct, TotalPct: pct}
	}
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return models.CPUMetrics{IdlePct: 100}
	}
	fields := strings.Fields(strings.Split(string(data), "\n")[0])
	if len(fields) < 8 || fields[0] != "cpu" {
		return models.CPUMetrics{IdlePct: 100}
	}
	parse := func(i int) uint64 { v, _ := strconv.ParseUint(fields[i], 10, 64); return v }
	user := parse(1) + parse(2) // user + nice
	sys := parse(3)
	idle := parse(4)
	iowait := parse(5)
	total := user + sys + idle + iowait + parse(6) + parse(7)
	if len(fields) > 8 {
		total += parse(8)
	}

	cpuMu.Lock()
	dUser := user - prevUser
	dSys := sys - prevSys
	dIdle := idle - prevIdle
	dIOWait := iowait - prevIOWait
	dTotal := total - prevTotal
	prevUser, prevSys, prevIdle, prevIOWait, prevTotal = user, sys, idle, iowait, total
	cpuMu.Unlock()

	if dTotal == 0 {
		return models.CPUMetrics{IdlePct: 100}
	}
	return models.CPUMetrics{
		UserPct:   float64(dUser) / float64(dTotal) * 100,
		SystemPct: float64(dSys) / float64(dTotal) * 100,
		IdlePct:   float64(dIdle) / float64(dTotal) * 100,
		IOWaitPct: float64(dIOWait) / float64(dTotal) * 100,
		TotalPct:  float64(dTotal-dIdle) / float64(dTotal) * 100,
	}
}

// ── Memory ─────────────────────────────────────────────────

func syswideUsedMemMB() float64 {
	m := collectMemoryBreakdown()
	return m.UsedMB
}

func collectMemoryBreakdown() models.MemoryMetrics {
	if runtime.GOOS == "windows" {
		return collectMemoryBreakdownWindows()
	}
	if runtime.GOOS != "linux" {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		sysMB := float64(m.Sys) / 1024 / 1024
		return models.MemoryMetrics{TotalMB: sysMB * 2, UsedMB: sysMB, CachedMB: 0, AvailableMB: sysMB, UsedPct: 50}
	}
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return models.MemoryMetrics{}
	}
	vals := map[string]float64{}
	for _, line := range strings.Split(string(data), "\n") {
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		v, _ := strconv.ParseFloat(f[1], 64)
		vals[strings.TrimSuffix(f[0], ":")] = v / 1024 // kB → MB
	}
	total := vals["MemTotal"]
	avail := vals["MemAvailable"]
	cached := vals["Cached"] + vals["Buffers"]
	used := total - avail
	pct := 0.0
	if total > 0 {
		pct = used / total * 100
	}
	return models.MemoryMetrics{
		TotalMB: total, UsedMB: used, CachedMB: cached, AvailableMB: avail, UsedPct: pct,
	}
}

// ── Disk ───────────────────────────────────────────────────

func collectDiskMetrics() []models.DiskMetrics {
	if runtime.GOOS == "windows" {
		return collectDiskMetricsWindows()
	}
	data, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return nil
	}
	var disks []models.DiskMetrics
	seen := map[string]bool{}
	for _, line := range strings.Split(string(data), "\n") {
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		mount := f[1]
		dev := f[0]
		// Only real filesystems
		if !strings.HasPrefix(dev, "/dev/") {
			continue
		}
		if seen[mount] {
			continue
		}
		seen[mount] = true

		// Use syscall.Statfs via os
		var totalGB, usedGB, usedPct float64
		if info, err := os.Stat(mount); err == nil && info.IsDir() {
			// Read from /proc/self/mountinfo or use simple df-style
			totalGB, usedGB, usedPct = readDiskUsage(mount)
		}
		if totalGB > 0 {
			disks = append(disks, models.DiskMetrics{
				Mount: mount, Device: dev, TotalGB: totalGB, UsedGB: usedGB, UsedPct: usedPct,
			})
		}
	}
	return disks
}

func readDiskUsage(path string) (totalGB, usedGB, usedPct float64) {
	// Use statfs syscall via /proc/self/mountstats or shell
	// Simple approach: read from statvfs
	out, err := os.ReadFile(fmt.Sprintf("/sys/fs/cgroup/memory.max"))
	_ = out
	_ = err
	// Fallback: parse from df if available, or estimate from /proc
	// For containers, this gives container-visible disk
	data, err := os.ReadFile("/proc/self/mounts")
	if err != nil {
		return 0, 0, 0
	}
	_ = data
	// Use Go's syscall
	return diskStatfs(path)
}

// ── Network ────────────────────────────────────────────────

var (
	prevNetRx  = map[string]uint64{}
	prevNetTx  = map[string]uint64{}
	prevNetAt  time.Time
	netMu      sync.Mutex
)

func collectNetMetrics() []models.NetMetrics {
	if runtime.GOOS == "windows" {
		return collectNetMetricsWindows()
	}
	data, err := os.ReadFile("/proc/net/dev")
	if err != nil {
		return nil
	}
	netMu.Lock()
	defer netMu.Unlock()
	now := time.Now()
	elapsed := now.Sub(prevNetAt).Seconds()
	if elapsed <= 0 {
		elapsed = 1
	}
	prevNetAt = now

	var nets []models.NetMetrics
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, ":") || strings.HasPrefix(line, "Inter") || strings.HasPrefix(line, "face") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		iface := strings.TrimSpace(parts[0])
		if iface == "lo" {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) < 10 {
			continue
		}
		rx, _ := strconv.ParseUint(fields[0], 10, 64)
		tx, _ := strconv.ParseUint(fields[8], 10, 64)

		var rxMBps, txMBps float64
		if prevRx, ok := prevNetRx[iface]; ok && elapsed > 0 {
			rxMBps = float64(rx-prevRx) / elapsed / 1024 / 1024
			txMBps = float64(tx-prevNetTx[iface]) / elapsed / 1024 / 1024
		}
		prevNetRx[iface] = rx
		prevNetTx[iface] = tx

		nets = append(nets, models.NetMetrics{
			Interface: iface, RxMBps: rxMBps, TxMBps: txMBps, RxBytes: rx, TxBytes: tx,
		})
	}
	return nets
}

// ── Top Processes ──────────────────────────────────────────

func collectTopProcesses() []models.ProcessInfo {
	if runtime.GOOS == "windows" {
		return collectTopProcessesWindows()
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	type procStat struct {
		pid  int
		name string
		utime, stime uint64
		rss  int64 // pages
	}
	var procs []procStat
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		stat, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
		if err != nil {
			continue
		}
		// Parse: pid (comm) state ... utime stime ... rss ...
		s := string(stat)
		// Find comm end
		commEnd := strings.LastIndex(s, ")")
		if commEnd < 0 {
			continue
		}
		commStart := strings.Index(s, "(")
		name := s[commStart+1 : commEnd]
		rest := strings.Fields(s[commEnd+2:])
		if len(rest) < 22 {
			continue
		}
		utime, _ := strconv.ParseUint(rest[11], 10, 64)
		stime, _ := strconv.ParseUint(rest[12], 10, 64)
		rss, _ := strconv.ParseInt(rest[21], 10, 64)
		procs = append(procs, procStat{pid: pid, name: name, utime: utime, stime: stime, rss: rss})
	}

	// Sort by CPU time (utime + stime) descending
	sort.Slice(procs, func(i, j int) bool {
		return (procs[i].utime + procs[i].stime) > (procs[j].utime + procs[j].stime)
	})

	pageSize := float64(os.Getpagesize())
	top := make([]models.ProcessInfo, 0, 10)
	for i, p := range procs {
		if i >= 10 {
			break
		}
		top = append(top, models.ProcessInfo{
			PID:    p.pid,
			Name:   p.name,
			User:   "-",
			CPUPct: float64(p.utime+p.stime) / 100.0, // rough
			MemMB:  float64(p.rss) * pageSize / 1024 / 1024,
			Status: "running",
		})
	}
	return top
}

// init pre-warms CPU counters
func init() {
	if runtime.GOOS == "linux" {
		_ = collectCPUBreakdown()
		time.Sleep(100 * time.Millisecond)
	}
}
