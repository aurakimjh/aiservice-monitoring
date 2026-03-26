package middleware

// java_virtual_thread_collector.go — Phase 39-2
//
// Collects JDK 21 Virtual Thread + Carrier Pool metrics via jcmd.
// Emits OTel-compatible gauge items into CollectResult.

import (
	"bufio"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// VirtualThreadMetrics is the Phase 39 data payload.
type VirtualThreadMetrics struct {
	PID              int              `json:"pid"`
	JavaVersion      string           `json:"java_version"`
	JDK21Plus        bool             `json:"jdk21_plus"`
	CollectedAt      string           `json:"collected_at"`
	ActiveCount      int64            `json:"active_count"`
	MountedCount     int64            `json:"mounted_count"`
	WaitingCount     int64            `json:"waiting_count"`
	CreatedPerMin    int64            `json:"created_per_min"`
	CarrierPool      CarrierPoolStats `json:"carrier_pool"`
	PinnedCount      int64            `json:"pinned_count"`
	PinnedDurationP99Ms float64       `json:"pinned_duration_p99_ms"`
	SubmitFailedPerMin  int64         `json:"submit_failed_per_min"`
}

// CarrierPoolStats holds ForkJoinPool (Carrier Thread) scheduler statistics.
type CarrierPoolStats struct {
	Parallelism int     `json:"parallelism"`
	ActiveCount int     `json:"active_count"`
	QueuedTasks int64   `json:"queued_tasks"`
	StolenTasks int64   `json:"stolen_tasks"`
	Utilization float64 `json:"utilization"` // active / parallelism
}

// collectJavaVirtualThreads attempts to collect Virtual Thread metrics for the
// given JVM PID.  It is called from collectJava() after version detection.
func collectJavaVirtualThreads(pid int, javaVersion string) *VirtualThreadMetrics {
	major := parseJavaMajorVersion(javaVersion)
	m := &VirtualThreadMetrics{
		PID:         pid,
		JavaVersion: javaVersion,
		JDK21Plus:   major >= 21,
		CollectedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if !m.JDK21Plus {
		return m
	}

	m.CarrierPool = collectCarrierPool(pid)

	// ThreadMXBean via jcmd: count virtual threads in Thread.print output
	vtActive, vtWaiting, vtMounted := countVirtualThreads(pid)
	m.ActiveCount = vtActive
	m.WaitingCount = vtWaiting
	m.MountedCount = vtMounted

	return m
}

// collectCarrierPool reads ForkJoinPool scheduler stats from jcmd VM.info.
func collectCarrierPool(pid int) CarrierPoolStats {
	out, err := exec.Command("jcmd", strconv.Itoa(pid), "VM.info").Output()
	s := CarrierPoolStats{Parallelism: defaultParallelism()}
	if err != nil {
		s.Utilization = 0
		return s
	}

	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		switch {
		case strings.HasPrefix(line, "parallelism:"):
			v, _ := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "parallelism:")))
			if v > 0 {
				s.Parallelism = v
			}
		case strings.HasPrefix(line, "activeCount:"):
			v, _ := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "activeCount:")))
			s.ActiveCount = v
		case strings.HasPrefix(line, "queuedTaskCount:"):
			v, _ := strconv.ParseInt(strings.TrimSpace(strings.TrimPrefix(line, "queuedTaskCount:")), 10, 64)
			s.QueuedTasks = v
		case strings.HasPrefix(line, "stealCount:"):
			v, _ := strconv.ParseInt(strings.TrimSpace(strings.TrimPrefix(line, "stealCount:")), 10, 64)
			s.StolenTasks = v
		}
	}
	if s.Parallelism > 0 {
		s.Utilization = float64(s.ActiveCount) / float64(s.Parallelism)
	}
	return s
}

// countVirtualThreads uses jcmd Thread.print to distinguish VirtualThread lines.
// Virtual Threads appear as "#<N> <vthread> ..." in JDK 21 output.
func countVirtualThreads(pid int) (active, waiting, mounted int64) {
	out, err := exec.Command("jcmd", strconv.Itoa(pid), "Thread.print").Output()
	if err != nil {
		return 0, 0, 0
	}
	sc := bufio.NewScanner(strings.NewReader(string(out)))
	for sc.Scan() {
		line := sc.Text()
		// VirtualThread markers from JDK 21 Thread.print
		if !strings.Contains(line, "VirtualThread") && !strings.Contains(line, "vthread") {
			continue
		}
		switch {
		case strings.Contains(line, "RUNNABLE"):
			active++
		case strings.Contains(line, "WAITING") || strings.Contains(line, "TIMED_WAITING"):
			waiting++
		case strings.Contains(line, "carrier"):
			mounted++
		default:
			waiting++ // count unknown states as waiting
		}
	}
	return active, waiting, mounted
}

// parseJavaMajorVersion extracts the JDK major version number.
func parseJavaMajorVersion(ver string) int {
	if ver == "" {
		return 0
	}
	parts := strings.Split(ver, ".")
	if len(parts) >= 2 && parts[0] == "1" {
		v, _ := strconv.Atoi(parts[1])
		return v
	}
	v, _ := strconv.Atoi(strings.Split(parts[0], "-")[0])
	return v
}

// defaultParallelism returns the number of available CPUs.
func defaultParallelism() int {
	out, err := exec.Command("nproc").Output()
	if err != nil {
		return 4
	}
	v, _ := strconv.Atoi(strings.TrimSpace(string(out)))
	if v <= 0 {
		return 4
	}
	return v
}

// emitVirtualThreadItems adds VirtualThread OTel gauge items to the result.
func emitVirtualThreadItems(m *VirtualThreadMetrics, result *models.CollectResult) {
	if m == nil || !m.JDK21Plus {
		return
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "middleware.java.virtual_thread.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          m,
	})

	// Emit flat OTel-style gauges for VictoriaMetrics ingestion
	gauges := map[string]float64{
		"jvm.virtual_thread.count.active":      float64(m.ActiveCount),
		"jvm.virtual_thread.count.waiting":     float64(m.WaitingCount),
		"jvm.virtual_thread.count.mounted":     float64(m.MountedCount),
		"jvm.carrier_pool.parallelism":          float64(m.CarrierPool.Parallelism),
		"jvm.carrier_pool.active_count":         float64(m.CarrierPool.ActiveCount),
		"jvm.carrier_pool.queued_tasks":         float64(m.CarrierPool.QueuedTasks),
		"jvm.carrier_pool.utilization":          m.CarrierPool.Utilization,
		"jvm.virtual_thread.pinned.count":       float64(m.PinnedCount),
		"jvm.virtual_thread.pinned.p99_ms":      m.PinnedDurationP99Ms,
		"jvm.virtual_thread.submit_failed.rate": float64(m.SubmitFailedPerMin),
	}

	for name, val := range gauges {
		result.Items = append(result.Items, models.CollectedItem{
			SchemaName:    "otel.gauge.v1",
			SchemaVersion: "1.0.0",
			MetricType:    "gauge",
			Category:      "it",
			Data: map[string]interface{}{
				"metric_name": name,
				"value":       val,
				"labels": map[string]string{
					"pid":     fmt.Sprintf("%d", m.PID),
					"runtime": "java",
					"jdk":     m.JavaVersion,
				},
				"collected_at": m.CollectedAt,
			},
		})
	}
}
