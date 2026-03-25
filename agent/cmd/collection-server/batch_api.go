package main

// Phase 36: Batch Process Monitoring API
//
// Endpoints:
//   GET  /api/v1/batch/executions          — list batch executions (with filters)
//   GET  /api/v1/batch/executions/{id}     — get single execution detail
//   POST /api/v1/batch/executions          — agent uploads batch execution data
//   GET  /api/v1/batch/jobs                — list known batch jobs (aggregated)
//   GET  /api/v1/batch/jobs/{name}         — batch job detail (history, stats)
//   GET  /api/v1/batch/running             — currently running batch processes
//   GET  /api/v1/batch/stats               — batch monitoring KPI stats

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ─── batch execution types ──────────────────────────────────────────────────

type batchExecutionRecord struct {
	ExecutionID  string  `json:"execution_id"`
	JobName      string  `json:"job_name"`
	AgentID      string  `json:"agent_id"`
	PID          int     `json:"pid"`
	Language     string  `json:"language"`
	Scheduler    string  `json:"scheduler"`
	Command      string  `json:"command"`
	State        string  `json:"state"` // DETECTED, RUNNING, COMPLETED, FAILED
	StartedAt    string  `json:"started_at"`
	EndedAt      string  `json:"ended_at,omitempty"`
	ExitCode     int     `json:"exit_code"`
	DurationMs   int64   `json:"duration_ms"`
	CPUAvg       float64 `json:"cpu_avg"`
	CPUMax       float64 `json:"cpu_max"`
	MemoryAvg    int64   `json:"memory_avg"`
	MemoryMax    int64   `json:"memory_max"`
	IOReadTotal  int64   `json:"io_read_total"`
	IOWriteTotal int64   `json:"io_write_total"`
	DetectedVia  string  `json:"detected_via"`
}

type batchJobSummary struct {
	JobName         string  `json:"job_name"`
	Language        string  `json:"language"`
	Scheduler       string  `json:"scheduler"`
	Schedule        string  `json:"schedule"`
	TotalExecutions int     `json:"total_executions"`
	SuccessCount    int     `json:"success_count"`
	FailureCount    int     `json:"failure_count"`
	SuccessRate     float64 `json:"success_rate"`
	AvgDurationMs   int64   `json:"avg_duration_ms"`
	LastExecution   string  `json:"last_execution"`
	LastState       string  `json:"last_state"`
}

type batchStats struct {
	TotalJobs          int     `json:"total_jobs"`
	TotalExecutions    int     `json:"total_executions"`
	RunningNow         int     `json:"running_now"`
	CompletedToday     int     `json:"completed_today"`
	FailedToday        int     `json:"failed_today"`
	OverallSuccessRate float64 `json:"overall_success_rate"`
	AvgDurationMs      int64   `json:"avg_duration_ms"`
	TopFailingJob      string  `json:"top_failing_job"`
	LongestRunningJob  string  `json:"longest_running_job"`
}

// ─── batch registry ─────────────────────────────────────────────────────────

type batchRegistry struct {
	mu         sync.RWMutex
	executions []*batchExecutionRecord
	seq        int
}

func newBatchRegistry() *batchRegistry {
	reg := &batchRegistry{}
	reg.seedDemoData()
	return reg
}

func (r *batchRegistry) nextID() string {
	r.seq++
	return fmt.Sprintf("bexec-%06d", r.seq)
}

func (r *batchRegistry) addExecution(exec *batchExecutionRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if exec.ExecutionID == "" {
		exec.ExecutionID = r.nextID()
	}
	r.executions = append(r.executions, exec)
}

func (r *batchRegistry) listExecutions(jobName, state, scheduler string, limit int) []*batchExecutionRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var filtered []*batchExecutionRecord
	for _, e := range r.executions {
		if jobName != "" && e.JobName != jobName {
			continue
		}
		if state != "" && e.State != state {
			continue
		}
		if scheduler != "" && e.Scheduler != scheduler {
			continue
		}
		filtered = append(filtered, e)
	}

	// Sort by started_at descending
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].StartedAt > filtered[j].StartedAt
	})

	if limit > 0 && limit < len(filtered) {
		filtered = filtered[:limit]
	}
	return filtered
}

func (r *batchRegistry) getExecution(id string) (*batchExecutionRecord, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, e := range r.executions {
		if e.ExecutionID == id {
			return e, true
		}
	}
	return nil, false
}

func (r *batchRegistry) getRunning() []*batchExecutionRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var running []*batchExecutionRecord
	for _, e := range r.executions {
		if e.State == "RUNNING" || e.State == "DETECTED" {
			running = append(running, e)
		}
	}
	return running
}

func (r *batchRegistry) getJobSummaries() []batchJobSummary {
	r.mu.RLock()
	defer r.mu.RUnlock()

	type jobAcc struct {
		language    string
		scheduler   string
		schedule    string
		total       int
		success     int
		failed      int
		durationSum int64
		lastExec    string
		lastState   string
	}

	jobs := make(map[string]*jobAcc)
	for _, e := range r.executions {
		acc, ok := jobs[e.JobName]
		if !ok {
			acc = &jobAcc{
				language:  e.Language,
				scheduler: e.Scheduler,
			}
			jobs[e.JobName] = acc
		}
		acc.total++
		if e.State == "COMPLETED" {
			acc.success++
		} else if e.State == "FAILED" {
			acc.failed++
		}
		acc.durationSum += e.DurationMs

		if e.StartedAt > acc.lastExec {
			acc.lastExec = e.StartedAt
			acc.lastState = e.State
		}
	}

	// Assign known schedules
	schedules := map[string]string{
		"daily-order-settlement":  "0 2 * * * (Daily 02:00)",
		"customer-email-campaign": "0 9 * * * (Daily 09:00)",
		"data-warehouse-etl":      "0 4 * * * (Daily 04:00)",
		"hourly-backup":           "0 * * * * (Hourly)",
		"monthly-report-gen":      "0 3 1 * * (Monthly 1st 03:00)",
		"inventory-sync":          "*/30 * * * * (Every 30min)",
		"ml-model-retrain":        "0 0 * * 0 (Weekly Sunday)",
	}

	var summaries []batchJobSummary
	for name, acc := range jobs {
		successRate := 0.0
		if acc.total > 0 {
			successRate = math.Round(float64(acc.success)/float64(acc.total)*1000) / 10
		}
		avgDuration := int64(0)
		if acc.total > 0 {
			avgDuration = acc.durationSum / int64(acc.total)
		}
		sched := schedules[name]
		if sched == "" {
			sched = "unknown"
		}
		summaries = append(summaries, batchJobSummary{
			JobName:         name,
			Language:        acc.language,
			Scheduler:       acc.scheduler,
			Schedule:        sched,
			TotalExecutions: acc.total,
			SuccessCount:    acc.success,
			FailureCount:    acc.failed,
			SuccessRate:     successRate,
			AvgDurationMs:   avgDuration,
			LastExecution:   acc.lastExec,
			LastState:       acc.lastState,
		})
	}

	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].JobName < summaries[j].JobName
	})

	return summaries
}

func (r *batchRegistry) getJobDetail(name string) (batchJobSummary, []*batchExecutionRecord, bool) {
	summaries := r.getJobSummaries()
	var summary batchJobSummary
	found := false
	for _, s := range summaries {
		if s.JobName == name {
			summary = s
			found = true
			break
		}
	}
	if !found {
		return batchJobSummary{}, nil, false
	}

	history := r.listExecutions(name, "", "", 50)
	return summary, history, true
}

func (r *batchRegistry) computeStats() batchStats {
	r.mu.RLock()
	defer r.mu.RUnlock()

	today := time.Now().UTC().Format("2006-01-02")
	jobNames := make(map[string]bool)
	var totalExec, running, completedToday, failedToday int
	var durationSum int64
	var totalCompleted int
	failCounts := make(map[string]int)
	var longestRunning string
	var longestDuration int64

	for _, e := range r.executions {
		jobNames[e.JobName] = true
		totalExec++

		switch e.State {
		case "RUNNING", "DETECTED":
			running++
		case "COMPLETED":
			totalCompleted++
			durationSum += e.DurationMs
			if strings.HasPrefix(e.EndedAt, today) || strings.HasPrefix(e.StartedAt, today) {
				completedToday++
			}
		case "FAILED":
			failCounts[e.JobName]++
			if strings.HasPrefix(e.EndedAt, today) || strings.HasPrefix(e.StartedAt, today) {
				failedToday++
			}
		}

		if (e.State == "RUNNING" || e.State == "DETECTED") && e.DurationMs > longestDuration {
			longestDuration = e.DurationMs
			longestRunning = e.JobName
		}
	}

	successRate := 0.0
	if totalCompleted+len(failCounts) > 0 {
		totalFailed := 0
		for _, c := range failCounts {
			totalFailed += c
		}
		successRate = math.Round(float64(totalCompleted)/float64(totalCompleted+totalFailed)*1000) / 10
	}

	avgDuration := int64(0)
	if totalCompleted > 0 {
		avgDuration = durationSum / int64(totalCompleted)
	}

	topFailing := ""
	topFailCount := 0
	for job, cnt := range failCounts {
		if cnt > topFailCount {
			topFailCount = cnt
			topFailing = job
		}
	}

	return batchStats{
		TotalJobs:          len(jobNames),
		TotalExecutions:    totalExec,
		RunningNow:         running,
		CompletedToday:     completedToday,
		FailedToday:        failedToday,
		OverallSuccessRate: successRate,
		AvgDurationMs:      avgDuration,
		TopFailingJob:      topFailing,
		LongestRunningJob:  longestRunning,
	}
}

// ─── demo data ──────────────────────────────────────────────────────────────

func (r *batchRegistry) seedDemoData() {
	now := time.Now().UTC()

	// Helper to format times
	tf := func(t time.Time) string { return t.Format(time.RFC3339) }

	demos := []*batchExecutionRecord{
		// daily-order-settlement — Java/Spring Batch, cron 02:00
		{ExecutionID: "bexec-000001", JobName: "daily-order-settlement", AgentID: "agent-01", PID: 15001, Language: "java", Scheduler: "cron", Command: "java -jar order-batch.jar --spring.batch.job.names=orderSettlement", State: "COMPLETED", StartedAt: tf(now.Add(-22 * time.Hour)), EndedAt: tf(now.Add(-22*time.Hour + 15*time.Minute)), ExitCode: 0, DurationMs: 900000, CPUAvg: 45.2, CPUMax: 82.5, MemoryAvg: 512 * 1024 * 1024, MemoryMax: 768 * 1024 * 1024, IOReadTotal: 2 * 1024 * 1024 * 1024, IOWriteTotal: 500 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000002", JobName: "daily-order-settlement", AgentID: "agent-01", PID: 14890, Language: "java", Scheduler: "cron", Command: "java -jar order-batch.jar --spring.batch.job.names=orderSettlement", State: "COMPLETED", StartedAt: tf(now.Add(-46 * time.Hour)), EndedAt: tf(now.Add(-46*time.Hour + 14*time.Minute)), ExitCode: 0, DurationMs: 840000, CPUAvg: 42.8, CPUMax: 79.1, MemoryAvg: 500 * 1024 * 1024, MemoryMax: 720 * 1024 * 1024, IOReadTotal: 1900 * 1024 * 1024, IOWriteTotal: 480 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000003", JobName: "daily-order-settlement", AgentID: "agent-01", PID: 14702, Language: "java", Scheduler: "cron", Command: "java -jar order-batch.jar --spring.batch.job.names=orderSettlement", State: "FAILED", StartedAt: tf(now.Add(-70 * time.Hour)), EndedAt: tf(now.Add(-70*time.Hour + 5*time.Minute)), ExitCode: 1, DurationMs: 300000, CPUAvg: 55.0, CPUMax: 90.3, MemoryAvg: 600 * 1024 * 1024, MemoryMax: 950 * 1024 * 1024, IOReadTotal: 800 * 1024 * 1024, IOWriteTotal: 50 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000004", JobName: "daily-order-settlement", AgentID: "agent-01", PID: 14501, Language: "java", Scheduler: "cron", Command: "java -jar order-batch.jar --spring.batch.job.names=orderSettlement", State: "COMPLETED", StartedAt: tf(now.Add(-94 * time.Hour)), EndedAt: tf(now.Add(-94*time.Hour + 16*time.Minute)), ExitCode: 0, DurationMs: 960000, CPUAvg: 44.0, CPUMax: 80.0, MemoryAvg: 510 * 1024 * 1024, MemoryMax: 750 * 1024 * 1024, IOReadTotal: 2100 * 1024 * 1024, IOWriteTotal: 520 * 1024 * 1024, DetectedVia: "scheduler_child"},

		// customer-email-campaign — Python/Celery, cron 09:00
		{ExecutionID: "bexec-000005", JobName: "customer-email-campaign", AgentID: "agent-02", PID: 22001, Language: "python", Scheduler: "celery", Command: "celery worker -A campaign.tasks --concurrency=4", State: "COMPLETED", StartedAt: tf(now.Add(-15 * time.Hour)), EndedAt: tf(now.Add(-15*time.Hour + 45*time.Minute)), ExitCode: 0, DurationMs: 2700000, CPUAvg: 25.3, CPUMax: 60.1, MemoryAvg: 256 * 1024 * 1024, MemoryMax: 384 * 1024 * 1024, IOReadTotal: 100 * 1024 * 1024, IOWriteTotal: 50 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000006", JobName: "customer-email-campaign", AgentID: "agent-02", PID: 21800, Language: "python", Scheduler: "celery", Command: "celery worker -A campaign.tasks --concurrency=4", State: "COMPLETED", StartedAt: tf(now.Add(-39 * time.Hour)), EndedAt: tf(now.Add(-39*time.Hour + 42*time.Minute)), ExitCode: 0, DurationMs: 2520000, CPUAvg: 24.1, CPUMax: 58.5, MemoryAvg: 248 * 1024 * 1024, MemoryMax: 370 * 1024 * 1024, IOReadTotal: 95 * 1024 * 1024, IOWriteTotal: 48 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000007", JobName: "customer-email-campaign", AgentID: "agent-02", PID: 21600, Language: "python", Scheduler: "celery", Command: "celery worker -A campaign.tasks --concurrency=4", State: "COMPLETED", StartedAt: tf(now.Add(-63 * time.Hour)), EndedAt: tf(now.Add(-63*time.Hour + 50*time.Minute)), ExitCode: 0, DurationMs: 3000000, CPUAvg: 26.5, CPUMax: 62.0, MemoryAvg: 260 * 1024 * 1024, MemoryMax: 390 * 1024 * 1024, IOReadTotal: 110 * 1024 * 1024, IOWriteTotal: 55 * 1024 * 1024, DetectedVia: "framework_pattern"},

		// data-warehouse-etl — Python/Airflow, cron 04:00
		{ExecutionID: "bexec-000008", JobName: "data-warehouse-etl", AgentID: "agent-03", PID: 33001, Language: "python", Scheduler: "airflow", Command: "airflow tasks run data_warehouse_etl extract 2026-03-25", State: "COMPLETED", StartedAt: tf(now.Add(-20 * time.Hour)), EndedAt: tf(now.Add(-20*time.Hour + 45*time.Minute)), ExitCode: 0, DurationMs: 2700000, CPUAvg: 35.4, CPUMax: 72.1, MemoryAvg: 1024 * 1024 * 1024, MemoryMax: 1536 * 1024 * 1024, IOReadTotal: 5 * 1024 * 1024 * 1024, IOWriteTotal: 3 * 1024 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000009", JobName: "data-warehouse-etl", AgentID: "agent-03", PID: 32800, Language: "python", Scheduler: "airflow", Command: "airflow tasks run data_warehouse_etl extract 2026-03-24", State: "COMPLETED", StartedAt: tf(now.Add(-44 * time.Hour)), EndedAt: tf(now.Add(-44*time.Hour + 40*time.Minute)), ExitCode: 0, DurationMs: 2400000, CPUAvg: 33.2, CPUMax: 70.5, MemoryAvg: 980 * 1024 * 1024, MemoryMax: 1400 * 1024 * 1024, IOReadTotal: 4800 * 1024 * 1024, IOWriteTotal: 2900 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000010", JobName: "data-warehouse-etl", AgentID: "agent-03", PID: 32600, Language: "python", Scheduler: "airflow", Command: "airflow tasks run data_warehouse_etl extract 2026-03-23", State: "FAILED", StartedAt: tf(now.Add(-68 * time.Hour)), EndedAt: tf(now.Add(-68*time.Hour + 3*time.Minute)), ExitCode: 1, DurationMs: 180000, CPUAvg: 15.0, CPUMax: 40.0, MemoryAvg: 400 * 1024 * 1024, MemoryMax: 600 * 1024 * 1024, IOReadTotal: 200 * 1024 * 1024, IOWriteTotal: 10 * 1024 * 1024, DetectedVia: "framework_pattern"},

		// hourly-backup — Shell/cron, every hour
		{ExecutionID: "bexec-000011", JobName: "hourly-backup", AgentID: "agent-01", PID: 44001, Language: "shell", Scheduler: "cron", Command: "/opt/scripts/backup.sh --target /data/backup --compress", State: "COMPLETED", StartedAt: tf(now.Add(-1 * time.Hour)), EndedAt: tf(now.Add(-1*time.Hour + 3*time.Minute)), ExitCode: 0, DurationMs: 180000, CPUAvg: 12.5, CPUMax: 30.2, MemoryAvg: 64 * 1024 * 1024, MemoryMax: 128 * 1024 * 1024, IOReadTotal: 500 * 1024 * 1024, IOWriteTotal: 500 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000012", JobName: "hourly-backup", AgentID: "agent-01", PID: 43900, Language: "shell", Scheduler: "cron", Command: "/opt/scripts/backup.sh --target /data/backup --compress", State: "COMPLETED", StartedAt: tf(now.Add(-2 * time.Hour)), EndedAt: tf(now.Add(-2*time.Hour + 3*time.Minute + 10*time.Second)), ExitCode: 0, DurationMs: 190000, CPUAvg: 13.1, CPUMax: 31.5, MemoryAvg: 66 * 1024 * 1024, MemoryMax: 130 * 1024 * 1024, IOReadTotal: 510 * 1024 * 1024, IOWriteTotal: 510 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000013", JobName: "hourly-backup", AgentID: "agent-01", PID: 43800, Language: "shell", Scheduler: "cron", Command: "/opt/scripts/backup.sh --target /data/backup --compress", State: "COMPLETED", StartedAt: tf(now.Add(-3 * time.Hour)), EndedAt: tf(now.Add(-3*time.Hour + 2*time.Minute + 55*time.Second)), ExitCode: 0, DurationMs: 175000, CPUAvg: 11.8, CPUMax: 28.9, MemoryAvg: 62 * 1024 * 1024, MemoryMax: 125 * 1024 * 1024, IOReadTotal: 490 * 1024 * 1024, IOWriteTotal: 490 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000014", JobName: "hourly-backup", AgentID: "agent-01", PID: 43700, Language: "shell", Scheduler: "cron", Command: "/opt/scripts/backup.sh --target /data/backup --compress", State: "FAILED", StartedAt: tf(now.Add(-4 * time.Hour)), EndedAt: tf(now.Add(-4*time.Hour + 10*time.Second)), ExitCode: 2, DurationMs: 10000, CPUAvg: 5.0, CPUMax: 10.0, MemoryAvg: 32 * 1024 * 1024, MemoryMax: 48 * 1024 * 1024, IOReadTotal: 1024 * 1024, IOWriteTotal: 0, DetectedVia: "scheduler_child"},

		// monthly-report-gen — Go, systemd timer monthly
		{ExecutionID: "bexec-000015", JobName: "monthly-report-gen", AgentID: "agent-04", PID: 55001, Language: "go", Scheduler: "systemd", Command: "/usr/local/bin/report-gen --month 2026-03 --output /reports/", State: "COMPLETED", StartedAt: tf(now.Add(-24 * 24 * time.Hour)), EndedAt: tf(now.Add(-24*24*time.Hour + 8*time.Minute)), ExitCode: 0, DurationMs: 480000, CPUAvg: 30.0, CPUMax: 55.0, MemoryAvg: 200 * 1024 * 1024, MemoryMax: 350 * 1024 * 1024, IOReadTotal: 300 * 1024 * 1024, IOWriteTotal: 150 * 1024 * 1024, DetectedVia: "scheduler_child"},
		{ExecutionID: "bexec-000016", JobName: "monthly-report-gen", AgentID: "agent-04", PID: 54800, Language: "go", Scheduler: "systemd", Command: "/usr/local/bin/report-gen --month 2026-02 --output /reports/", State: "COMPLETED", StartedAt: tf(now.Add(-54 * 24 * time.Hour)), EndedAt: tf(now.Add(-54*24*time.Hour + 7*time.Minute + 30*time.Second)), ExitCode: 0, DurationMs: 450000, CPUAvg: 28.5, CPUMax: 52.0, MemoryAvg: 190 * 1024 * 1024, MemoryMax: 330 * 1024 * 1024, IOReadTotal: 280 * 1024 * 1024, IOWriteTotal: 140 * 1024 * 1024, DetectedVia: "scheduler_child"},

		// inventory-sync — Java/Quartz, every 30min
		{ExecutionID: "bexec-000017", JobName: "inventory-sync", AgentID: "agent-01", PID: 66001, Language: "java", Scheduler: "quartz", Command: "java -cp inventory-service.jar com.example.InventorySyncJob", State: "COMPLETED", StartedAt: tf(now.Add(-30 * time.Minute)), EndedAt: tf(now.Add(-30*time.Minute + 2*time.Minute)), ExitCode: 0, DurationMs: 120000, CPUAvg: 20.0, CPUMax: 45.0, MemoryAvg: 256 * 1024 * 1024, MemoryMax: 384 * 1024 * 1024, IOReadTotal: 50 * 1024 * 1024, IOWriteTotal: 30 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000018", JobName: "inventory-sync", AgentID: "agent-01", PID: 65900, Language: "java", Scheduler: "quartz", Command: "java -cp inventory-service.jar com.example.InventorySyncJob", State: "COMPLETED", StartedAt: tf(now.Add(-60 * time.Minute)), EndedAt: tf(now.Add(-60*time.Minute + 2*time.Minute + 15*time.Second)), ExitCode: 0, DurationMs: 135000, CPUAvg: 21.5, CPUMax: 47.0, MemoryAvg: 260 * 1024 * 1024, MemoryMax: 390 * 1024 * 1024, IOReadTotal: 52 * 1024 * 1024, IOWriteTotal: 32 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000019", JobName: "inventory-sync", AgentID: "agent-01", PID: 65800, Language: "java", Scheduler: "quartz", Command: "java -cp inventory-service.jar com.example.InventorySyncJob", State: "COMPLETED", StartedAt: tf(now.Add(-90 * time.Minute)), EndedAt: tf(now.Add(-90*time.Minute + 1*time.Minute + 50*time.Second)), ExitCode: 0, DurationMs: 110000, CPUAvg: 19.0, CPUMax: 42.0, MemoryAvg: 250 * 1024 * 1024, MemoryMax: 375 * 1024 * 1024, IOReadTotal: 48 * 1024 * 1024, IOWriteTotal: 28 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000020", JobName: "inventory-sync", AgentID: "agent-01", PID: 65700, Language: "java", Scheduler: "quartz", Command: "java -cp inventory-service.jar com.example.InventorySyncJob", State: "FAILED", StartedAt: tf(now.Add(-120 * time.Minute)), EndedAt: tf(now.Add(-120*time.Minute + 30*time.Second)), ExitCode: 1, DurationMs: 30000, CPUAvg: 10.0, CPUMax: 25.0, MemoryAvg: 200 * 1024 * 1024, MemoryMax: 300 * 1024 * 1024, IOReadTotal: 5 * 1024 * 1024, IOWriteTotal: 1024 * 1024, DetectedVia: "framework_pattern"},

		// ml-model-retrain — Python, Airflow weekly
		{ExecutionID: "bexec-000021", JobName: "ml-model-retrain", AgentID: "agent-05", PID: 77001, Language: "python", Scheduler: "airflow", Command: "python /opt/ml/retrain_pipeline.py --model recommendation-v3 --epochs 50", State: "COMPLETED", StartedAt: tf(now.Add(-5 * 24 * time.Hour)), EndedAt: tf(now.Add(-5*24*time.Hour + 2*time.Hour + 30*time.Minute)), ExitCode: 0, DurationMs: 9000000, CPUAvg: 75.2, CPUMax: 98.5, MemoryAvg: 4 * 1024 * 1024 * 1024, MemoryMax: 6 * 1024 * 1024 * 1024, IOReadTotal: 10 * 1024 * 1024 * 1024, IOWriteTotal: 2 * 1024 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000022", JobName: "ml-model-retrain", AgentID: "agent-05", PID: 76800, Language: "python", Scheduler: "airflow", Command: "python /opt/ml/retrain_pipeline.py --model recommendation-v3 --epochs 50", State: "COMPLETED", StartedAt: tf(now.Add(-12 * 24 * time.Hour)), EndedAt: tf(now.Add(-12*24*time.Hour + 2*time.Hour + 45*time.Minute)), ExitCode: 0, DurationMs: 9900000, CPUAvg: 73.8, CPUMax: 97.2, MemoryAvg: 3800 * 1024 * 1024, MemoryMax: 5800 * 1024 * 1024, IOReadTotal: 9500 * 1024 * 1024, IOWriteTotal: 1900 * 1024 * 1024, DetectedVia: "framework_pattern"},

		// Currently running processes
		{ExecutionID: "bexec-000023", JobName: "inventory-sync", AgentID: "agent-01", PID: 66100, Language: "java", Scheduler: "quartz", Command: "java -cp inventory-service.jar com.example.InventorySyncJob", State: "RUNNING", StartedAt: tf(now.Add(-1 * time.Minute)), DurationMs: 60000, CPUAvg: 18.0, CPUMax: 35.0, MemoryAvg: 240 * 1024 * 1024, MemoryMax: 300 * 1024 * 1024, DetectedVia: "framework_pattern"},
		{ExecutionID: "bexec-000024", JobName: "hourly-backup", AgentID: "agent-01", PID: 44100, Language: "shell", Scheduler: "cron", Command: "/opt/scripts/backup.sh --target /data/backup --compress", State: "RUNNING", StartedAt: tf(now.Add(-30 * time.Second)), DurationMs: 30000, CPUAvg: 8.0, CPUMax: 15.0, MemoryAvg: 48 * 1024 * 1024, MemoryMax: 64 * 1024 * 1024, DetectedVia: "scheduler_child"},
	}

	r.mu.Lock()
	r.executions = demos
	r.seq = 24
	r.mu.Unlock()
}

// ─── route registration ─────────────────────────────────────────────────────

// registerBatchRoutes registers batch monitoring API routes.
func registerBatchRoutes(mux *http.ServeMux) {
	reg := newBatchRegistry()

	// GET /api/v1/batch/executions — list batch executions (with filters)
	mux.HandleFunc("GET /api/v1/batch/executions", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		jobName := q.Get("job_name")
		state := q.Get("state")
		scheduler := q.Get("scheduler")
		limit := 100
		if l := q.Get("limit"); l != "" {
			if n, err := fmt.Sscanf(l, "%d", &limit); n == 1 && err == nil && limit > 0 {
				// ok
			}
		}

		executions := reg.listExecutions(jobName, state, scheduler, limit)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": executions,
			"total": len(executions),
		})
	})

	// POST /api/v1/batch/executions — agent uploads batch execution data
	mux.HandleFunc("POST /api/v1/batch/executions", func(w http.ResponseWriter, r *http.Request) {
		var exec batchExecutionRecord
		if err := json.NewDecoder(r.Body).Decode(&exec); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}
		if exec.JobName == "" {
			http.Error(w, `{"error":"job_name is required"}`, http.StatusBadRequest)
			return
		}
		reg.addExecution(&exec)
		writeJSON(w, http.StatusCreated, exec)
	})

	// GET /api/v1/batch/jobs — list known batch jobs (aggregated)
	mux.HandleFunc("GET /api/v1/batch/jobs", func(w http.ResponseWriter, r *http.Request) {
		summaries := reg.getJobSummaries()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": summaries,
			"total": len(summaries),
		})
	})

	// GET /api/v1/batch/running — currently running batch processes
	mux.HandleFunc("GET /api/v1/batch/running", func(w http.ResponseWriter, r *http.Request) {
		running := reg.getRunning()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": running,
			"total": len(running),
		})
	})

	// GET /api/v1/batch/stats — batch monitoring KPI stats
	mux.HandleFunc("GET /api/v1/batch/stats", func(w http.ResponseWriter, r *http.Request) {
		stats := reg.computeStats()
		writeJSON(w, http.StatusOK, stats)
	})

	// GET /api/v1/batch/executions/{id} — get single execution detail
	// GET /api/v1/batch/jobs/{name} — batch job detail (history, stats)
	// These use the catch-all pattern for sub-paths.
	mux.HandleFunc("GET /api/v1/batch/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/batch/")
		parts := strings.SplitN(path, "/", 2)

		if len(parts) < 2 {
			http.NotFound(w, r)
			return
		}

		resource := parts[0]
		id := parts[1]

		switch resource {
		case "executions":
			exec, ok := reg.getExecution(id)
			if !ok {
				http.NotFound(w, r)
				return
			}
			writeJSON(w, http.StatusOK, exec)

		case "jobs":
			summary, history, ok := reg.getJobDetail(id)
			if !ok {
				http.NotFound(w, r)
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"summary":   summary,
				"executions": history,
			})

		default:
			http.NotFound(w, r)
		}
	})
}
