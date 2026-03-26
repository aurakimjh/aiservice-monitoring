package middleware

// virtual_thread_alert.go — Phase 39-3
//
// Pinning detection rules and alert generation for JDK 21 Virtual Threads.
//
// Alert rules:
//   WARNING  — pinned_count/1m > 10
//   CRITICAL — pinned_p99_ms > 1000
//   CRITICAL — submit_failed/1m > 5

import (
	"fmt"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// VTAlertSeverity mirrors the alert severity levels used across AITOP.
type VTAlertSeverity string

const (
	VTAlertWarning  VTAlertSeverity = "warning"
	VTAlertCritical VTAlertSeverity = "critical"
)

// VTAlert represents a single Virtual Thread alert event.
type VTAlert struct {
	AlertID    string          `json:"alert_id"`
	Severity   VTAlertSeverity `json:"severity"`
	Rule       string          `json:"rule"`
	Message    string          `json:"message"`
	Value      float64         `json:"value"`
	Threshold  float64         `json:"threshold"`
	PID        int             `json:"pid"`
	FiredAt    time.Time       `json:"fired_at"`
	StackTrace string          `json:"stack_trace,omitempty"` // for pinning alerts
}

// alertSeq is a monotonic counter for alert IDs within a process lifetime.
var alertSeq int

func nextAlertID() string {
	alertSeq++
	return fmt.Sprintf("vt-alert-%06d", alertSeq)
}

// EvaluateVirtualThreadAlerts checks the given VirtualThreadMetrics against
// all built-in alert rules and returns any triggered alerts.
func EvaluateVirtualThreadAlerts(m *VirtualThreadMetrics) []VTAlert {
	if m == nil || !m.JDK21Plus {
		return nil
	}

	var alerts []VTAlert
	now := time.Now().UTC()

	// Rule 1: WARNING — pinned_count/1m > 10
	if float64(m.PinnedCount) > 10 {
		alerts = append(alerts, VTAlert{
			AlertID:   nextAlertID(),
			Severity:  VTAlertWarning,
			Rule:      "vt.pinned.rate",
			Message:   fmt.Sprintf("Virtual Thread pinning rate too high: %d events/min (threshold: 10)", m.PinnedCount),
			Value:     float64(m.PinnedCount),
			Threshold: 10,
			PID:       m.PID,
			FiredAt:   now,
		})
	}

	// Rule 2: CRITICAL — pinned_p99_ms > 1000
	if m.PinnedDurationP99Ms > 1000 {
		alerts = append(alerts, VTAlert{
			AlertID:   nextAlertID(),
			Severity:  VTAlertCritical,
			Rule:      "vt.pinned.duration.p99",
			Message:   fmt.Sprintf("Virtual Thread pinning P99 duration critical: %.1f ms (threshold: 1000 ms)", m.PinnedDurationP99Ms),
			Value:     m.PinnedDurationP99Ms,
			Threshold: 1000,
			PID:       m.PID,
			FiredAt:   now,
		})
	}

	// Rule 3: CRITICAL — submit_failed/1m > 5
	if float64(m.SubmitFailedPerMin) > 5 {
		alerts = append(alerts, VTAlert{
			AlertID:   nextAlertID(),
			Severity:  VTAlertCritical,
			Rule:      "vt.submit_failed.rate",
			Message:   fmt.Sprintf("Virtual Thread submission failures: %d/min (threshold: 5)", m.SubmitFailedPerMin),
			Value:     float64(m.SubmitFailedPerMin),
			Threshold: 5,
			PID:       m.PID,
			FiredAt:   now,
		})
	}

	// Rule 4: WARNING — carrier pool utilization > 90%
	if m.CarrierPool.Utilization > 0.9 {
		alerts = append(alerts, VTAlert{
			AlertID:   nextAlertID(),
			Severity:  VTAlertCritical,
			Rule:      "vt.carrier_pool.saturation",
			Message:   fmt.Sprintf("Carrier thread pool saturated: %.0f%% utilization (threshold: 90%%)", m.CarrierPool.Utilization*100),
			Value:     m.CarrierPool.Utilization * 100,
			Threshold: 90,
			PID:       m.PID,
			FiredAt:   now,
		})
	}

	return alerts
}

// emitVirtualThreadAlerts adds alert items to the collect result.
func emitVirtualThreadAlerts(m *VirtualThreadMetrics, result *models.CollectResult) {
	alerts := EvaluateVirtualThreadAlerts(m)
	for _, a := range alerts {
		result.Items = append(result.Items, models.CollectedItem{
			SchemaName:    "alert.virtual_thread.v1",
			SchemaVersion: "1.0.0",
			MetricType:    "event",
			Category:      "it",
			Data:          a,
		})
	}
}

// PinnedStackRecord stores a pinning event's stack trace for drilldown.
type PinnedStackRecord struct {
	AlertID    string    `json:"alert_id"`
	PID        int       `json:"pid"`
	DurationMs float64   `json:"duration_ms"`
	StackTrace string    `json:"stack_trace"`
	TopMethod  string    `json:"top_method"`
	CapturedAt time.Time `json:"captured_at"`
}

// ExtractPinnedStacks extracts the top pinning stack traces from VT metrics
// for StorageBackend archival (drilldown panel).
func ExtractPinnedStacks(m *VirtualThreadMetrics, maxStacks int) []PinnedStackRecord {
	if m == nil {
		return nil
	}
	// In a real implementation, pinned events come from JFR recordings.
	// Here we generate representative records from the aggregate metrics.
	var records []PinnedStackRecord
	stackTemplates := []string{
		"java.lang.Object.wait(Object.java) <- com.example.SyncBlock.process(SyncBlock.java:42)",
		"sun.nio.fs.UnixNativeDispatcher.read(UnixNativeDispatcher.java) <- com.example.FileIO.read(FileIO.java:88)",
		"jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java) <- com.example.Reflection.call(Reflection.java:15)",
	}
	for i := 0; i < maxStacks && i < len(stackTemplates); i++ {
		records = append(records, PinnedStackRecord{
			AlertID:    fmt.Sprintf("pinned-stack-%d-%d", m.PID, i+1),
			PID:        m.PID,
			DurationMs: m.PinnedDurationP99Ms,
			StackTrace: stackTemplates[i],
			TopMethod:  stackTemplates[i][:min(40, len(stackTemplates[i]))],
			CapturedAt: time.Now().UTC(),
		})
	}
	return records
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
