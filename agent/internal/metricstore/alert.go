package metricstore

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// ── Alert Rule Evaluation Engine (S3-6) ──────────────────────────────────────
//
// Replaces Prometheus alert rules with a built-in evaluation loop.
// Each rule is periodically evaluated against the hot-tier data.
// When a condition fires, the engine publishes an event via the provided callback.

const (
	// DefaultEvalInterval is how often alert rules are evaluated.
	DefaultEvalInterval = 15 * time.Second
)

// AlertCallback is invoked when an alert fires or resolves.
type AlertCallback func(rule AlertRule, state AlertState)

// AlertEngine evaluates metric alert rules against the store.
type AlertEngine struct {
	mu       sync.RWMutex
	rules    map[string]AlertRule  // ruleID → rule
	states   map[string]*alertEval // ruleID → evaluation state
	hot      *HotStore
	callback AlertCallback
	logger   *slog.Logger
	interval time.Duration
}

// alertEval tracks the pending/firing state for one rule.
type alertEval struct {
	pendingSince time.Time // when the condition first became true
	firing       bool      // currently firing
	lastValue    float64
	lastEval     time.Time
}

// NewAlertEngine creates an alert engine backed by the hot store.
func NewAlertEngine(hot *HotStore, callback AlertCallback, logger *slog.Logger) *AlertEngine {
	return &AlertEngine{
		rules:    make(map[string]AlertRule),
		states:   make(map[string]*alertEval),
		hot:      hot,
		callback: callback,
		logger:   logger,
		interval: DefaultEvalInterval,
	}
}

// AddRule registers (or updates) an alert rule.
func (e *AlertEngine) AddRule(rule AlertRule) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.rules[rule.ID] = rule
	if _, ok := e.states[rule.ID]; !ok {
		e.states[rule.ID] = &alertEval{}
	}
}

// RemoveRule deletes an alert rule.
func (e *AlertEngine) RemoveRule(id string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	delete(e.rules, id)
	delete(e.states, id)
}

// Rules returns all registered rules.
func (e *AlertEngine) Rules() []AlertRule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]AlertRule, 0, len(e.rules))
	for _, r := range e.rules {
		out = append(out, r)
	}
	return out
}

// States returns the current evaluation state for all rules.
func (e *AlertEngine) States() []AlertState {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]AlertState, 0, len(e.states))
	for id, st := range e.states {
		out = append(out, AlertState{
			RuleID:   id,
			Firing:   st.firing,
			Value:    st.lastValue,
			Since:    st.pendingSince,
			LastEval: st.lastEval,
		})
	}
	return out
}

// FiringCount returns the number of currently firing alerts.
func (e *AlertEngine) FiringCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	count := 0
	for _, st := range e.states {
		if st.firing {
			count++
		}
	}
	return count
}

// Run starts the evaluation loop. Blocks until ctx is cancelled.
func (e *AlertEngine) Run(ctx context.Context) {
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	e.logger.Info("alert engine started", "interval", e.interval)

	for {
		select {
		case <-ctx.Done():
			e.logger.Info("alert engine stopped")
			return
		case <-ticker.C:
			e.evalAll()
		}
	}
}

func (e *AlertEngine) evalAll() {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now().UTC()
	from := now.Add(-5 * time.Minute) // look back 5 min for evaluation

	for id, rule := range e.rules {
		if !rule.Enabled {
			continue
		}

		st := e.states[id]
		st.lastEval = now

		// Query current value from hot store.
		results := e.hot.Query(rule.Metric, rule.Labels, from, now)

		// Evaluate: take the latest value across matching series.
		var currentValue float64
		var found bool
		for _, qr := range results {
			if len(qr.Samples) > 0 {
				v := qr.Samples[len(qr.Samples)-1].V
				if !found || v > currentValue {
					currentValue = v
					found = true
				}
			}
		}
		st.lastValue = currentValue

		if !found {
			// No data — clear pending state.
			if st.firing {
				st.firing = false
				st.pendingSince = time.Time{}
				e.fireCallback(rule, st.toAlertState(rule.ID))
			}
			continue
		}

		condMet := evalCondition(currentValue, rule.Condition, rule.Threshold)

		if condMet {
			if st.pendingSince.IsZero() {
				st.pendingSince = now
			}
			// Check if duration threshold exceeded.
			if !st.firing && now.Sub(st.pendingSince) >= rule.Duration {
				st.firing = true
				e.fireCallback(rule, st.toAlertState(rule.ID))
				e.logger.Warn("alert firing",
					"rule", rule.Name, "value", currentValue, "threshold", rule.Threshold)
			}
		} else {
			if st.firing {
				st.firing = false
				st.pendingSince = time.Time{}
				e.fireCallback(rule, st.toAlertState(rule.ID))
				e.logger.Info("alert resolved", "rule", rule.Name)
			} else {
				st.pendingSince = time.Time{}
			}
		}
	}
}

func (st *alertEval) toAlertState(ruleID string) AlertState {
	return AlertState{
		RuleID:   ruleID,
		Firing:   st.firing,
		Value:    st.lastValue,
		Since:    st.pendingSince,
		LastEval: st.lastEval,
	}
}

func (e *AlertEngine) fireCallback(rule AlertRule, state AlertState) {
	if e.callback == nil {
		return
	}
	e.callback(rule, state)
}

// evalCondition checks if value matches the threshold condition.
func evalCondition(value float64, cond AlertCondition, threshold float64) bool {
	switch cond {
	case CondGT:
		return value > threshold
	case CondGE:
		return value >= threshold
	case CondLT:
		return value < threshold
	case CondLE:
		return value <= threshold
	case CondEQ:
		return value == threshold
	case CondNE:
		return value != threshold
	default:
		return false
	}
}
