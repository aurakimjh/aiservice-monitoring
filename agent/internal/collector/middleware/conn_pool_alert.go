package middleware

// conn_pool_alert.go: Connection pool leak detection + standardized alert rule definitions.
// Alert rules are evaluated at collection time and emitted as alert_rule.v1 items.

import (
	"fmt"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// AlertSeverity represents the urgency of a generated alert.
type AlertSeverity string

const (
	SeverityWarning  AlertSeverity = "warning"
	SeverityCritical AlertSeverity = "critical"
)

// ConnPoolAlert represents a triggered connection pool alert.
type ConnPoolAlert struct {
	AlertID    string        `json:"alert_id"`
	PoolName   string        `json:"pool_name"`
	Vendor     string        `json:"vendor"`
	Severity   AlertSeverity `json:"severity"`
	Condition  string        `json:"condition"`
	Value      float64       `json:"value"`
	Threshold  float64       `json:"threshold"`
	Message    string        `json:"message"`
	TriggeredAt string       `json:"triggered_at"`
	Action     string        `json:"action"` // "pagerduty","slack","log"
}

// ConnPoolAlertRule defines a threshold-based alert rule for connection pools.
type ConnPoolAlertRule struct {
	Name          string        `json:"name"`
	Description   string        `json:"description"`
	Condition     string        `json:"condition"` // expression key
	Threshold     float64       `json:"threshold"`
	Duration      string        `json:"duration,omitempty"` // e.g. "30s"
	Severity      AlertSeverity `json:"severity"`
	Actions       []string      `json:"actions"`
}

// DefaultConnPoolAlertRules returns the standard connection pool alert rules.
// Rule 26-2-2: active/max >= 90% warning, pending > 0 for 30s → PagerDuty.
var DefaultConnPoolAlertRules = []ConnPoolAlertRule{
	{
		Name:        "conn_pool_high_utilization",
		Description: "Connection pool utilization >= 90% - risk of exhaustion",
		Condition:   "active/max >= 0.90",
		Threshold:   0.90,
		Severity:    SeverityWarning,
		Actions:     []string{"pagerduty", "slack"},
	},
	{
		Name:        "conn_pool_critical_utilization",
		Description: "Connection pool utilization >= 98% - near exhaustion",
		Condition:   "active/max >= 0.98",
		Threshold:   0.98,
		Severity:    SeverityCritical,
		Actions:     []string{"pagerduty"},
	},
	{
		Name:        "conn_pool_pending_waits",
		Description: "Connection pool has pending wait requests > 0 for > 30s",
		Condition:   "wait_count > 0",
		Threshold:   0,
		Duration:    "30s",
		Severity:    SeverityWarning,
		Actions:     []string{"pagerduty"},
	},
	{
		Name:        "conn_pool_leak_suspected",
		Description: "Connection pool leak suspected: active connections not being released",
		Condition:   "leak_suspected == true",
		Threshold:   0,
		Severity:    SeverityCritical,
		Actions:     []string{"pagerduty", "slack"},
	},
}

// EvaluateConnPoolAlerts checks a list of connection pools against the default alert rules
// and returns any triggered alerts.
func EvaluateConnPoolAlerts(pools []ConnPoolData) []ConnPoolAlert {
	var alerts []ConnPoolAlert
	now := time.Now().UTC().Format(time.RFC3339)

	for _, cp := range pools {
		for _, rule := range DefaultConnPoolAlertRules {
			alert := evaluateRule(cp, rule, now)
			if alert != nil {
				alerts = append(alerts, *alert)
			}
		}
	}
	return alerts
}

func evaluateRule(cp ConnPoolData, rule ConnPoolAlertRule, now string) *ConnPoolAlert {
	var triggered bool
	var value float64

	switch rule.Condition {
	case "active/max >= 0.90":
		value = cp.Utilization
		triggered = cp.MaxConns > 0 && cp.Utilization >= 0.90
	case "active/max >= 0.98":
		value = cp.Utilization
		triggered = cp.MaxConns > 0 && cp.Utilization >= 0.98
	case "wait_count > 0":
		value = float64(cp.WaitCount)
		triggered = cp.WaitCount > 0
	case "leak_suspected == true":
		value = 0
		if cp.LeakSuspected {
			value = 1
		}
		triggered = cp.LeakSuspected
	}

	if !triggered {
		return nil
	}

	return &ConnPoolAlert{
		AlertID:     fmt.Sprintf("conn_pool_%s_%s", cp.Name, rule.Name),
		PoolName:    cp.Name,
		Vendor:      cp.Vendor,
		Severity:    rule.Severity,
		Condition:   rule.Condition,
		Value:       value,
		Threshold:   rule.Threshold,
		Message:     fmt.Sprintf("[%s] %s: %s (value=%.3f, threshold=%.3f)", rule.Severity, cp.Name, rule.Description, value, rule.Threshold),
		TriggeredAt: now,
		Action:      joinActions(rule.Actions),
	}
}

// EmitConnPoolAlerts appends alert items to the collect result.
func EmitConnPoolAlerts(pools []ConnPoolData, result *models.CollectResult) {
	alerts := EvaluateConnPoolAlerts(pools)
	for _, alert := range alerts {
		result.Items = append(result.Items, models.CollectedItem{
			SchemaName:    "middleware.conn_pool_alert.v1",
			SchemaVersion: "1.0.0",
			MetricType:    "alert",
			Category:      "it",
			Data:          alert,
		})
	}
}

func joinActions(actions []string) string {
	if len(actions) == 0 {
		return ""
	}
	result := actions[0]
	for _, a := range actions[1:] {
		result += "," + a
	}
	return result
}
