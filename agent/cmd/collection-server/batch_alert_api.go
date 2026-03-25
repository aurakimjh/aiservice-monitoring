package main

// Phase 38: Batch Alert Rules API
//
// Endpoints:
//   GET    /api/v1/batch/alerts/rules       — list alert rules
//   POST   /api/v1/batch/alerts/rules       — create alert rule
//   PUT    /api/v1/batch/alerts/rules/{id}  — update alert rule
//   DELETE /api/v1/batch/alerts/rules/{id}  — delete alert rule
//   GET    /api/v1/batch/alerts/history      — alert history
//   POST   /api/v1/batch/alerts/evaluate     — trigger evaluation (internal)

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── batch alert types ──────────────────────────────────────────────────────

type batchAlertConditions struct {
	DurationThresholdMin *int    `json:"duration_threshold_min,omitempty"`
	FailureThreshold     *int    `json:"failure_threshold,omitempty"`
	SLADeadline          string  `json:"sla_deadline,omitempty"`
	CPUThreshold         *int    `json:"cpu_threshold,omitempty"`
}

type batchAlertChannels struct {
	SlackWebhook string   `json:"slack_webhook,omitempty"`
	Email        []string `json:"email,omitempty"`
	PagerDutyKey string   `json:"pagerduty_key,omitempty"`
	WebhookURL   string   `json:"webhook_url,omitempty"`
}

type batchAlertRule struct {
	ID              string               `json:"id"`
	Name            string               `json:"name"`
	TargetJob       string               `json:"target_job"`
	Enabled         bool                 `json:"enabled"`
	Conditions      batchAlertConditions `json:"conditions"`
	Channels        batchAlertChannels   `json:"channels"`
	CooldownMin     int                  `json:"cooldown_min"`
	LastTriggeredAt string               `json:"last_triggered_at,omitempty"`
	CreatedAt       string               `json:"created_at"`
}

type batchAlertHistoryEntry struct {
	AlertID          string   `json:"alert_id"`
	RuleID           string   `json:"rule_id"`
	RuleName         string   `json:"rule_name"`
	JobName          string   `json:"job_name"`
	ExecutionID      string   `json:"execution_id,omitempty"`
	Message          string   `json:"message"`
	Severity         string   `json:"severity"`
	ChannelsNotified []string `json:"channels_notified"`
	TriggeredAt      string   `json:"triggered_at"`
	ResolvedAt       string   `json:"resolved_at,omitempty"`
}

// ─── batch alert registry ───────────────────────────────────────────────────

type batchAlertRegistry struct {
	mu      sync.RWMutex
	rules   []*batchAlertRule
	history []*batchAlertHistoryEntry
	seq     int
}

func newBatchAlertRegistry() *batchAlertRegistry {
	reg := &batchAlertRegistry{}
	reg.seedDemoData()
	return reg
}

func (r *batchAlertRegistry) nextRuleID() string {
	r.seq++
	return fmt.Sprintf("ba-rule-%03d", r.seq)
}

func (r *batchAlertRegistry) listRules() []*batchAlertRule {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*batchAlertRule, len(r.rules))
	copy(out, r.rules)
	return out
}

func (r *batchAlertRegistry) getRule(id string) (*batchAlertRule, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, rule := range r.rules {
		if rule.ID == id {
			return rule, true
		}
	}
	return nil, false
}

func (r *batchAlertRegistry) createRule(rule *batchAlertRule) *batchAlertRule {
	r.mu.Lock()
	defer r.mu.Unlock()
	rule.ID = r.nextRuleID()
	rule.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	r.rules = append(r.rules, rule)
	return rule
}

func (r *batchAlertRegistry) updateRule(id string, updated *batchAlertRule) (*batchAlertRule, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, rule := range r.rules {
		if rule.ID == id {
			updated.ID = id
			updated.CreatedAt = rule.CreatedAt
			if updated.LastTriggeredAt == "" {
				updated.LastTriggeredAt = rule.LastTriggeredAt
			}
			r.rules[i] = updated
			return updated, true
		}
	}
	return nil, false
}

func (r *batchAlertRegistry) deleteRule(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, rule := range r.rules {
		if rule.ID == id {
			r.rules = append(r.rules[:i], r.rules[i+1:]...)
			return true
		}
	}
	return false
}

func (r *batchAlertRegistry) listHistory() []*batchAlertHistoryEntry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*batchAlertHistoryEntry, len(r.history))
	copy(out, r.history)
	return out
}

// ─── demo data ──────────────────────────────────────────────────────────────

func (r *batchAlertRegistry) seedDemoData() {
	now := time.Now().UTC()
	tf := func(t time.Time) string { return t.Format(time.RFC3339) }

	intPtr := func(v int) *int { return &v }

	r.rules = []*batchAlertRule{
		{
			ID:         "ba-rule-001",
			Name:       "Order Settlement SLA",
			TargetJob:  "daily-order-settlement",
			Enabled:    true,
			Conditions: batchAlertConditions{DurationThresholdMin: intPtr(60), SLADeadline: "03:00"},
			Channels:   batchAlertChannels{SlackWebhook: "https://hooks.slack.com/services/T00/B00/xxx"},
			CooldownMin:     30,
			LastTriggeredAt: tf(now.Add(-3 * 24 * time.Hour)),
			CreatedAt:       tf(now.Add(-30 * 24 * time.Hour)),
		},
		{
			ID:         "ba-rule-002",
			Name:       "Batch Failure Alert",
			TargetJob:  "*",
			Enabled:    true,
			Conditions: batchAlertConditions{FailureThreshold: intPtr(1)},
			Channels:   batchAlertChannels{SlackWebhook: "https://hooks.slack.com/services/T00/B00/xxx", Email: []string{"ops-team@company.com", "batch-admin@company.com"}},
			CooldownMin:     15,
			LastTriggeredAt: tf(now.Add(-4 * time.Hour)),
			CreatedAt:       tf(now.Add(-60 * 24 * time.Hour)),
		},
		{
			ID:         "ba-rule-003",
			Name:       "ETL Slow Warning",
			TargetJob:  "data-warehouse-etl",
			Enabled:    true,
			Conditions: batchAlertConditions{DurationThresholdMin: intPtr(120)},
			Channels:   batchAlertChannels{PagerDutyKey: "pd-key-xxxx"},
			CooldownMin:     60,
			LastTriggeredAt: tf(now.Add(-10 * 24 * time.Hour)),
			CreatedAt:       tf(now.Add(-45 * 24 * time.Hour)),
		},
		{
			ID:         "ba-rule-004",
			Name:       "High CPU Usage",
			TargetJob:  "*",
			Enabled:    true,
			Conditions: batchAlertConditions{CPUThreshold: intPtr(90)},
			Channels:   batchAlertChannels{Email: []string{"ops-team@company.com"}},
			CooldownMin:     30,
			LastTriggeredAt: tf(now.Add(-70 * time.Hour)),
			CreatedAt:       tf(now.Add(-20 * 24 * time.Hour)),
		},
	}
	r.seq = 4

	r.history = []*batchAlertHistoryEntry{
		{
			AlertID:          "ba-hist-001",
			RuleID:           "ba-rule-002",
			RuleName:         "Batch Failure Alert",
			JobName:          "hourly-backup",
			ExecutionID:      "bexec-000014",
			Message:          "hourly-backup failed with exit code 2: disk full /data/backup",
			Severity:         "critical",
			ChannelsNotified: []string{"slack", "email"},
			TriggeredAt:      tf(now.Add(-4 * time.Hour)),
			ResolvedAt:       tf(now.Add(-3 * time.Hour)),
		},
		{
			AlertID:          "ba-hist-002",
			RuleID:           "ba-rule-002",
			RuleName:         "Batch Failure Alert",
			JobName:          "inventory-sync",
			ExecutionID:      "bexec-000020",
			Message:          "inventory-sync failed with exit code 1: DB connection pool exhausted",
			Severity:         "critical",
			ChannelsNotified: []string{"slack", "email"},
			TriggeredAt:      tf(now.Add(-2 * time.Hour)),
		},
		{
			AlertID:          "ba-hist-003",
			RuleID:           "ba-rule-004",
			RuleName:         "High CPU Usage",
			JobName:          "daily-order-settlement",
			ExecutionID:      "bexec-000003",
			Message:          "CPU max reached 90.3% during daily-order-settlement execution",
			Severity:         "warning",
			ChannelsNotified: []string{"email"},
			TriggeredAt:      tf(now.Add(-70 * time.Hour)),
			ResolvedAt:       tf(now.Add(-70*time.Hour + 5*time.Minute)),
		},
		{
			AlertID:          "ba-hist-004",
			RuleID:           "ba-rule-001",
			RuleName:         "Order Settlement SLA",
			JobName:          "daily-order-settlement",
			ExecutionID:      "bexec-000003",
			Message:          "daily-order-settlement SLA breach: failed before deadline 03:00",
			Severity:         "critical",
			ChannelsNotified: []string{"slack"},
			TriggeredAt:      tf(now.Add(-3 * 24 * time.Hour)),
			ResolvedAt:       tf(now.Add(-3*24*time.Hour + time.Hour)),
		},
		{
			AlertID:          "ba-hist-005",
			RuleID:           "ba-rule-003",
			RuleName:         "ETL Slow Warning",
			JobName:          "data-warehouse-etl",
			Message:          "data-warehouse-etl duration exceeded 120min threshold (actual: 135min)",
			Severity:         "warning",
			ChannelsNotified: []string{"pagerduty"},
			TriggeredAt:      tf(now.Add(-10 * 24 * time.Hour)),
			ResolvedAt:       tf(now.Add(-10*24*time.Hour + 15*time.Minute)),
		},
	}
}

// ─── route registration ─────────────────────────────────────────────────────

func registerBatchAlertRoutes(mux *http.ServeMux) {
	reg := newBatchAlertRegistry()

	// GET /api/v1/batch/alerts/rules — list alert rules
	mux.HandleFunc("GET /api/v1/batch/alerts/rules", func(w http.ResponseWriter, r *http.Request) {
		rules := reg.listRules()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": rules,
			"total": len(rules),
		})
	})

	// POST /api/v1/batch/alerts/rules — create alert rule
	mux.HandleFunc("POST /api/v1/batch/alerts/rules", func(w http.ResponseWriter, r *http.Request) {
		var rule batchAlertRule
		if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}
		if rule.Name == "" {
			http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
			return
		}
		created := reg.createRule(&rule)
		writeJSON(w, http.StatusCreated, created)
	})

	// PUT /api/v1/batch/alerts/rules/{id} — update alert rule
	mux.HandleFunc("PUT /api/v1/batch/alerts/rules/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/v1/batch/alerts/rules/")
		if id == "" {
			http.Error(w, `{"error":"rule id required"}`, http.StatusBadRequest)
			return
		}

		var rule batchAlertRule
		if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}

		updated, ok := reg.updateRule(id, &rule)
		if !ok {
			http.Error(w, `{"error":"rule not found"}`, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, updated)
	})

	// DELETE /api/v1/batch/alerts/rules/{id} — delete alert rule
	mux.HandleFunc("DELETE /api/v1/batch/alerts/rules/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/v1/batch/alerts/rules/")
		if id == "" {
			http.Error(w, `{"error":"rule id required"}`, http.StatusBadRequest)
			return
		}

		if !reg.deleteRule(id) {
			http.Error(w, `{"error":"rule not found"}`, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// GET /api/v1/batch/alerts/history — alert history
	mux.HandleFunc("GET /api/v1/batch/alerts/history", func(w http.ResponseWriter, r *http.Request) {
		history := reg.listHistory()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": history,
			"total": len(history),
		})
	})

	// POST /api/v1/batch/alerts/evaluate — trigger evaluation (internal)
	mux.HandleFunc("POST /api/v1/batch/alerts/evaluate", func(w http.ResponseWriter, r *http.Request) {
		rules := reg.listRules()
		enabledCount := 0
		for _, rule := range rules {
			if rule.Enabled {
				enabledCount++
			}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":         "evaluated",
			"rules_checked":  len(rules),
			"rules_enabled":  enabledCount,
			"alerts_fired":   0,
			"evaluated_at":   time.Now().UTC().Format(time.RFC3339),
		})
	})
}
