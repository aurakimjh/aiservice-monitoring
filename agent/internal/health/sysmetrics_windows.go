//go:build windows

package health

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	"golang.org/x/sys/windows"
)

// ── CPU (Windows via GetSystemTimes) ──

var (
	winPrevIdle, winPrevKernel, winPrevUser uint64
	winCPUMu                               sync.Mutex
)

func collectCPUBreakdownWindows() models.CPUMetrics {
	kernel32 := windows.NewLazyDLL("kernel32.dll")
	getSystemTimes := kernel32.NewProc("GetSystemTimes")
	var idle, kernel, user windows.Filetime
	ret, _, _ := getSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)),
	)
	if ret == 0 {
		return models.CPUMetrics{IdlePct: 100}
	}
	idleT := uint64(idle.HighDateTime)<<32 | uint64(idle.LowDateTime)
	kernelT := uint64(kernel.HighDateTime)<<32 | uint64(kernel.LowDateTime)
	userT := uint64(user.HighDateTime)<<32 | uint64(user.LowDateTime)

	winCPUMu.Lock()
	dIdle := idleT - winPrevIdle
	dKernel := kernelT - winPrevKernel
	dUser := userT - winPrevUser
	winPrevIdle, winPrevKernel, winPrevUser = idleT, kernelT, userT
	winCPUMu.Unlock()

	// kernel time includes idle time
	dSys := dKernel - dIdle
	dTotal := dUser + dKernel - dIdle // total busy = user + (kernel - idle)
	dAll := dUser + dKernel           // total time = user + kernel

	if dAll == 0 {
		return models.CPUMetrics{IdlePct: 100}
	}
	userPct := float64(dUser) / float64(dAll) * 100
	sysPct := float64(dSys) / float64(dAll) * 100
	idlePct := float64(dIdle) / float64(dAll) * 100
	totalPct := float64(dTotal) / float64(dAll) * 100

	return models.CPUMetrics{
		UserPct:   userPct,
		SystemPct: sysPct,
		IdlePct:   idlePct,
		IOWaitPct: 0,
		TotalPct:  totalPct,
	}
}

// ── Memory (Windows via GlobalMemoryStatusEx) ──

func collectMemoryBreakdownWindows() models.MemoryMetrics {
	kernel32 := windows.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")

	type memoryStatusEx struct {
		Length               uint32
		MemoryLoad           uint32
		TotalPhys            uint64
		AvailPhys            uint64
		TotalPageFile        uint64
		AvailPageFile        uint64
		TotalVirtual         uint64
		AvailVirtual         uint64
		AvailExtendedVirtual uint64
	}
	var status memoryStatusEx
	status.Length = uint32(unsafe.Sizeof(status))
	ret, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&status)))
	if ret == 0 {
		return models.MemoryMetrics{}
	}

	totalMB := float64(status.TotalPhys) / 1024 / 1024
	availMB := float64(status.AvailPhys) / 1024 / 1024
	usedMB := totalMB - availMB
	pct := 0.0
	if totalMB > 0 {
		pct = usedMB / totalMB * 100
	}
	return models.MemoryMetrics{
		TotalMB:     totalMB,
		UsedMB:      usedMB,
		CachedMB:    0, // Windows doesn't easily separate cached
		AvailableMB: availMB,
		UsedPct:     pct,
	}
}

// ── Disk (Windows — enumerate drives) ──

func collectDiskMetricsWindows() []models.DiskMetrics {
	var disks []models.DiskMetrics
	for _, letter := range "CDEFGHIJ" {
		path := string(letter) + ":\\"
		totalGB, usedGB, usedPct := diskStatfs(path)
		if totalGB > 0 {
			disks = append(disks, models.DiskMetrics{
				Mount: path, Device: string(letter) + ":", TotalGB: totalGB, UsedGB: usedGB, UsedPct: usedPct,
			})
		}
	}
	return disks
}

// ── Network (Windows via netstat -e) ──

var (
	winPrevRxBytes, winPrevTxBytes uint64
	winPrevNetAt                   time.Time
	winNetMu                       sync.Mutex
)

func collectNetMetricsWindows() []models.NetMetrics {
	out, err := exec.Command("netstat", "-e").Output()
	if err != nil {
		return nil
	}
	// Parse: Bytes    123456789    987654321
	var rxBytes, txBytes uint64
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Bytes") {
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				rxBytes, _ = strconv.ParseUint(fields[1], 10, 64)
				txBytes, _ = strconv.ParseUint(fields[2], 10, 64)
			}
		}
	}
	if rxBytes == 0 && txBytes == 0 {
		return nil
	}

	winNetMu.Lock()
	defer winNetMu.Unlock()
	now := time.Now()
	elapsed := now.Sub(winPrevNetAt).Seconds()
	if elapsed <= 0 {
		elapsed = 1
	}

	var rxMBps, txMBps float64
	if winPrevRxBytes > 0 {
		rxMBps = float64(rxBytes-winPrevRxBytes) / elapsed / 1024 / 1024
		txMBps = float64(txBytes-winPrevTxBytes) / elapsed / 1024 / 1024
	}
	winPrevRxBytes, winPrevTxBytes = rxBytes, txBytes
	winPrevNetAt = now

	return []models.NetMetrics{{
		Interface: "Total",
		RxMBps:    rxMBps,
		TxMBps:    txMBps,
		RxBytes:   rxBytes,
		TxBytes:   txBytes,
	}}
}

// ── Processes (Windows via tasklist) ──

func collectTopProcessesWindows() []models.ProcessInfo {
	out, err := exec.Command("tasklist", "/FO", "CSV", "/NH").Output()
	if err != nil {
		return nil
	}

	type proc struct {
		pid  int
		name string
		mem  float64 // KB → MB
	}
	var procs []proc
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// "name","pid","session","session#","mem"
		fields := parseCSVLine(line)
		if len(fields) < 5 {
			continue
		}
		pid, _ := strconv.Atoi(fields[1])
		memStr := strings.ReplaceAll(fields[4], ",", "")
		memStr = strings.ReplaceAll(memStr, " K", "")
		memStr = strings.TrimSpace(memStr)
		memKB, _ := strconv.ParseFloat(memStr, 64)
		procs = append(procs, proc{pid: pid, name: fields[0], mem: memKB / 1024})
	}

	// Sort by memory descending
	for i := 0; i < len(procs); i++ {
		for j := i + 1; j < len(procs); j++ {
			if procs[j].mem > procs[i].mem {
				procs[i], procs[j] = procs[j], procs[i]
			}
		}
	}

	top := make([]models.ProcessInfo, 0, 10)
	for i, p := range procs {
		if i >= 10 {
			break
		}
		top = append(top, models.ProcessInfo{
			PID: p.pid, Name: p.name, User: "-", CPUPct: 0, MemMB: p.mem, Status: "running",
		})
	}
	return top
}

func parseCSVLine(line string) []string {
	var fields []string
	inQuote := false
	current := ""
	for _, c := range line {
		if c == '"' {
			inQuote = !inQuote
		} else if c == ',' && !inQuote {
			fields = append(fields, current)
			current = ""
		} else {
			current += string(c)
		}
	}
	fields = append(fields, current)
	return fields
}

func init() {
	// Pre-warm CPU counters
	_ = collectCPUBreakdownWindows()
	time.Sleep(100 * time.Millisecond)
	fmt.Sprintf("") // prevent unused import
}
