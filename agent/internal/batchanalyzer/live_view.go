package batchanalyzer

import (
	"sync"
	"time"
)

// ── WS-3.5: 장시간 배치 실시간 뷰 ───────────────────────────────────────────

// LiveBatchState tracks the real-time progress of a running batch job.
type LiveBatchState struct {
	ExecutionID string    `json:"executionId"`
	JobName     string    `json:"jobName"`
	StartedAt   time.Time `json:"startedAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	// 39-6-1: Progress tracking.
	TotalItems     int64   `json:"totalItems"`
	ProcessedItems int64   `json:"processedItems"`
	ProgressPct    float64 `json:"progressPct"` // 0-100
	EstimatedETA   string  `json:"estimatedEta,omitempty"` // "HH:MM:SS remaining"

	// 39-6-2: Step-level status.
	Steps []LiveStepState `json:"steps"`

	// 39-6-3: Throughput trend.
	ThroughputHistory []ThroughputPoint `json:"throughputHistory"` // last 60 data points

	// 39-6-4: Real-time SQL Top-N.
	SQLTopN []LiveSQLStat `json:"sqlTopN"`
}

// LiveStepState tracks a single batch step.
type LiveStepState struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"` // pending, running, completed, failed
	Progress    float64 `json:"progress"` // 0-100
	DurationMS  float64 `json:"durationMs"`
	ItemCount   int64   `json:"itemCount"`
}

// ThroughputPoint is a single throughput measurement.
type ThroughputPoint struct {
	Timestamp time.Time `json:"timestamp"`
	ItemsSec  float64   `json:"itemsSec"` // items/second
}

// LiveSQLStat tracks a real-time SQL execution stat.
type LiveSQLStat struct {
	Fingerprint string  `json:"fingerprint"`
	Statement   string  `json:"statement"`
	ExecCount   int     `json:"execCount"`
	TotalTimeMS float64 `json:"totalTimeMs"`
	AvgTimeMS   float64 `json:"avgTimeMs"`
	IsAnomaly   bool    `json:"isAnomaly"` // sudden spike detected
}

// LiveViewStore manages real-time states of running batch jobs.
type LiveViewStore struct {
	mu     sync.RWMutex
	states map[string]*LiveBatchState // executionID → state
}

// NewLiveViewStore creates a live view store.
func NewLiveViewStore() *LiveViewStore {
	return &LiveViewStore{
		states: make(map[string]*LiveBatchState),
	}
}

// 39-6-1: Update progress for a running batch.
func (lv *LiveViewStore) UpdateProgress(execID, jobName string, processed, total int64) {
	lv.mu.Lock()
	defer lv.mu.Unlock()

	state, ok := lv.states[execID]
	if !ok {
		state = &LiveBatchState{
			ExecutionID: execID,
			JobName:     jobName,
			StartedAt:   time.Now().UTC(),
		}
		lv.states[execID] = state
	}

	state.ProcessedItems = processed
	state.TotalItems = total
	state.UpdatedAt = time.Now().UTC()

	if total > 0 {
		state.ProgressPct = float64(processed) / float64(total) * 100

		// ETA calculation.
		elapsed := state.UpdatedAt.Sub(state.StartedAt)
		if processed > 0 {
			remaining := float64(total-processed) * elapsed.Seconds() / float64(processed)
			hours := int(remaining) / 3600
			minutes := (int(remaining) % 3600) / 60
			seconds := int(remaining) % 60
			state.EstimatedETA = formatTime(hours, minutes, seconds)
		}
	}
}

// 39-6-2: Update step status.
func (lv *LiveViewStore) UpdateStep(execID string, step LiveStepState) {
	lv.mu.Lock()
	defer lv.mu.Unlock()

	state, ok := lv.states[execID]
	if !ok {
		return
	}

	// Find or append step.
	found := false
	for i, s := range state.Steps {
		if s.Name == step.Name {
			state.Steps[i] = step
			found = true
			break
		}
	}
	if !found {
		state.Steps = append(state.Steps, step)
	}
}

// 39-6-3: Record throughput data point.
func (lv *LiveViewStore) RecordThroughput(execID string, itemsSec float64) {
	lv.mu.Lock()
	defer lv.mu.Unlock()

	state, ok := lv.states[execID]
	if !ok {
		return
	}

	pt := ThroughputPoint{
		Timestamp: time.Now().UTC(),
		ItemsSec:  itemsSec,
	}
	state.ThroughputHistory = append(state.ThroughputHistory, pt)

	// Keep last 60 points.
	if len(state.ThroughputHistory) > 60 {
		state.ThroughputHistory = state.ThroughputHistory[len(state.ThroughputHistory)-60:]
	}
}

// 39-6-4: Update SQL Top-N with anomaly detection.
func (lv *LiveViewStore) UpdateSQLTopN(execID string, sqlStats []LiveSQLStat) {
	lv.mu.Lock()
	defer lv.mu.Unlock()

	state, ok := lv.states[execID]
	if !ok {
		return
	}

	// Detect anomalies: avg time > 2x previous avg.
	prevAvg := make(map[string]float64)
	for _, s := range state.SQLTopN {
		prevAvg[s.Fingerprint] = s.AvgTimeMS
	}
	for i := range sqlStats {
		if prev, ok := prevAvg[sqlStats[i].Fingerprint]; ok && prev > 0 {
			if sqlStats[i].AvgTimeMS > prev*2 {
				sqlStats[i].IsAnomaly = true
			}
		}
	}

	state.SQLTopN = sqlStats
}

// Complete marks a batch as finished and removes it from live view.
func (lv *LiveViewStore) Complete(execID string) {
	lv.mu.Lock()
	defer lv.mu.Unlock()
	delete(lv.states, execID)
}

// ── Query methods ────────────────────────────────────────────────────────────

// GetState returns the live state of a running batch.
func (lv *LiveViewStore) GetState(execID string) *LiveBatchState {
	lv.mu.RLock()
	defer lv.mu.RUnlock()
	if s, ok := lv.states[execID]; ok {
		cp := *s
		return &cp
	}
	return nil
}

// ListRunning returns all currently running batch states.
func (lv *LiveViewStore) ListRunning() []*LiveBatchState {
	lv.mu.RLock()
	defer lv.mu.RUnlock()
	out := make([]*LiveBatchState, 0, len(lv.states))
	for _, s := range lv.states {
		cp := *s
		out = append(out, &cp)
	}
	return out
}

func formatTime(h, m, s int) string {
	return padInt(h) + ":" + padInt(m) + ":" + padInt(s) + " remaining"
}

func padInt(n int) string {
	if n < 10 {
		return "0" + formatInt(n)
	}
	return formatInt(n)
}
