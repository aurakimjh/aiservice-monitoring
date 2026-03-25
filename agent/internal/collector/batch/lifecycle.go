package batch

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// BatchState represents the lifecycle state of a batch execution.
type BatchState string

const (
	StateDetected  BatchState = "DETECTED"
	StateRunning   BatchState = "RUNNING"
	StateCompleted BatchState = "COMPLETED"
	StateFailed    BatchState = "FAILED"
)

// BatchExecution tracks the full lifecycle of a batch process execution.
type BatchExecution struct {
	ExecutionID  string           `json:"execution_id"`
	JobName      string           `json:"job_name"`
	PID          int              `json:"pid"`
	Language     string           `json:"language"`
	Scheduler    string           `json:"scheduler"`
	Command      string           `json:"command"`
	State        BatchState       `json:"state"`
	StartedAt    time.Time        `json:"started_at"`
	EndedAt      time.Time        `json:"ended_at,omitempty"`
	ExitCode     int              `json:"exit_code"`
	DurationMs   int64            `json:"duration_ms"`
	CPUAvg       float64          `json:"cpu_avg"`
	CPUMax       float64          `json:"cpu_max"`
	MemoryAvg    int64            `json:"memory_avg"`
	MemoryMax    int64            `json:"memory_max"`
	IOReadTotal  int64            `json:"io_read_total"`
	IOWriteTotal int64            `json:"io_write_total"`
	Metrics      []ProcessMetrics `json:"metrics,omitempty"` // time series during execution
	DetectedVia  string           `json:"detected_via"`
}

// LifecycleManager tracks batch process lifecycles, accumulating metrics
// and managing state transitions.
type LifecycleManager struct {
	mu         sync.RWMutex
	executions map[int]*BatchExecution // PID → active execution
	completed  []*BatchExecution       // completed/failed history
	seq        int
	logger     *slog.Logger
}

// NewLifecycleManager creates a new lifecycle manager.
func NewLifecycleManager(logger *slog.Logger) *LifecycleManager {
	return &LifecycleManager{
		executions: make(map[int]*BatchExecution),
		logger:     logger,
	}
}

// TrackProcess starts tracking a newly detected batch process.
// If the PID is already tracked, this is a no-op.
func (lm *LifecycleManager) TrackProcess(bp BatchProcess) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if _, exists := lm.executions[bp.PID]; exists {
		return // already tracking
	}

	lm.seq++
	exec := &BatchExecution{
		ExecutionID: fmt.Sprintf("bexec-%06d", lm.seq),
		JobName:     bp.Name,
		PID:         bp.PID,
		Language:    bp.Language,
		Scheduler:   bp.Scheduler,
		Command:     bp.Command,
		State:       StateDetected,
		StartedAt:   bp.StartedAt,
		DetectedVia: bp.DetectedVia,
	}

	lm.executions[bp.PID] = exec
	lm.logger.Info("batch process tracked",
		"execution_id", exec.ExecutionID,
		"job", exec.JobName,
		"pid", exec.PID,
		"scheduler", exec.Scheduler,
	)
}

// UpdateMetrics appends a metrics snapshot to the running execution and
// transitions the state from DETECTED to RUNNING on first metric.
func (lm *LifecycleManager) UpdateMetrics(pid int, m ProcessMetrics) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	exec, ok := lm.executions[pid]
	if !ok {
		return
	}

	// Transition DETECTED → RUNNING on first metric update
	if exec.State == StateDetected {
		exec.State = StateRunning
	}

	exec.Metrics = append(exec.Metrics, m)

	// Update max values
	if m.CPUPercent > exec.CPUMax {
		exec.CPUMax = m.CPUPercent
	}
	if m.MemoryRSS > exec.MemoryMax {
		exec.MemoryMax = m.MemoryRSS
	}
}

// CompleteProcess marks a process as completed or failed and moves it
// to the completed history.
func (lm *LifecycleManager) CompleteProcess(pid int, exitCode int) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	exec, ok := lm.executions[pid]
	if !ok {
		return
	}

	now := time.Now()
	exec.EndedAt = now
	exec.ExitCode = exitCode
	exec.DurationMs = now.Sub(exec.StartedAt).Milliseconds()

	if exitCode == 0 {
		exec.State = StateCompleted
	} else {
		exec.State = StateFailed
	}

	// Calculate averages from collected metrics
	lm.calculateAggregates(exec)

	lm.completed = append(lm.completed, exec)
	delete(lm.executions, pid)

	lm.logger.Info("batch process completed",
		"execution_id", exec.ExecutionID,
		"job", exec.JobName,
		"pid", exec.PID,
		"state", exec.State,
		"exit_code", exitCode,
		"duration_ms", exec.DurationMs,
	)
}

// GetRunning returns a copy of all currently running batch executions.
func (lm *LifecycleManager) GetRunning() []*BatchExecution {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	out := make([]*BatchExecution, 0, len(lm.executions))
	for _, exec := range lm.executions {
		out = append(out, exec)
	}
	return out
}

// GetCompleted returns the most recent completed executions, up to limit.
func (lm *LifecycleManager) GetCompleted(limit int) []*BatchExecution {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	total := len(lm.completed)
	if limit <= 0 || limit > total {
		limit = total
	}

	// Return most recent first
	out := make([]*BatchExecution, limit)
	for i := 0; i < limit; i++ {
		out[i] = lm.completed[total-1-i]
	}
	return out
}

// GetExecution looks up an execution by ID in both running and completed pools.
func (lm *LifecycleManager) GetExecution(executionID string) *BatchExecution {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	for _, exec := range lm.executions {
		if exec.ExecutionID == executionID {
			return exec
		}
	}
	for _, exec := range lm.completed {
		if exec.ExecutionID == executionID {
			return exec
		}
	}
	return nil
}

// TrackedPIDs returns a set of currently-tracked PIDs.
func (lm *LifecycleManager) TrackedPIDs() map[int]bool {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	pids := make(map[int]bool, len(lm.executions))
	for pid := range lm.executions {
		pids[pid] = true
	}
	return pids
}

// calculateAggregates computes CPU/memory averages and I/O totals from metrics.
func (lm *LifecycleManager) calculateAggregates(exec *BatchExecution) {
	if len(exec.Metrics) == 0 {
		return
	}

	var cpuSum float64
	var memSum int64
	var maxReadBytes, maxWriteBytes int64

	for _, m := range exec.Metrics {
		cpuSum += m.CPUPercent
		memSum += m.MemoryRSS

		if m.IOReadBytes > maxReadBytes {
			maxReadBytes = m.IOReadBytes
		}
		if m.IOWriteBytes > maxWriteBytes {
			maxWriteBytes = m.IOWriteBytes
		}
	}

	n := int64(len(exec.Metrics))
	exec.CPUAvg = cpuSum / float64(n)
	exec.MemoryAvg = memSum / n
	exec.IOReadTotal = maxReadBytes
	exec.IOWriteTotal = maxWriteBytes
}
