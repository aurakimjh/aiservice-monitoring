package main

// Phase 37: Batch Runtime Profiling API
//
// Endpoints:
//   GET  /api/v1/batch/executions/{id}/profile            — get all profiles for an execution
//   GET  /api/v1/batch/executions/{id}/profile/sql        — SQL Top-N
//   GET  /api/v1/batch/executions/{id}/profile/methods    — Method Top-N
//   GET  /api/v1/batch/executions/{id}/profile/flamegraph — flamegraph for execution
//   POST /api/v1/batch/executions/{id}/profile/trigger    — trigger profiling for running batch
//   POST /api/v1/batch/profile/upload                     — agent uploads profile data

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── batch profiling types ──────────────────────────────────────────────────

type batchSQLProfile struct {
	SQL            string  `json:"sql"`
	ExecutionCount int     `json:"execution_count"`
	TotalTimeMs    int64   `json:"total_time_ms"`
	AvgTimeMs      float64 `json:"avg_time_ms"`
	MaxTimeMs      int64   `json:"max_time_ms"`
	MinTimeMs      int64   `json:"min_time_ms"`
}

type batchMethodProfile struct {
	ClassName   string  `json:"class_name"`
	MethodName  string  `json:"method_name"`
	FullName    string  `json:"full_name"`
	CallCount   int     `json:"call_count"`
	TotalTimeMs int64   `json:"total_time_ms"`
	AvgTimeMs   float64 `json:"avg_time_ms"`
	SelfTimeMs  int64   `json:"self_time_ms"`
}

type batchPythonFunctionProfile struct {
	Function     string  `json:"function"`
	FileLine     string  `json:"file_line"`
	SelfPercent  float64 `json:"self_percent"`
	TotalPercent float64 `json:"total_percent"`
	SampleCount  int     `json:"sample_count"`
}

type batchJVMMetrics struct {
	GCCount       int64 `json:"gc_count"`
	GCTimeMs      int64 `json:"gc_time_ms"`
	HeapUsedBytes int64 `json:"heap_used_bytes"`
	HeapMaxBytes  int64 `json:"heap_max_bytes"`
	ThreadCount   int   `json:"thread_count"`
	ClassLoaded   int   `json:"class_loaded"`
}

type batchGoFunctionProfile struct {
	Function string  `json:"function"`
	FileLine string  `json:"file_line"`
	Flat     int64   `json:"flat"`
	FlatPct  float64 `json:"flat_pct"`
	Cum      int64   `json:"cum"`
	CumPct   float64 `json:"cum_pct"`
}

type batchFlamegraphData struct {
	ProfileType  string `json:"profile_type"` // cpu, offcpu
	FoldedStack  string `json:"folded_stack"`
	TotalSamples int64  `json:"total_samples"`
	DurationSec  int    `json:"duration_sec"`
}

type batchProfileRecord struct {
	ExecutionID string      `json:"execution_id"`
	ProfileType string      `json:"profile_type"` // sql, method, stack, cpu, offcpu, memory, gc, flamegraph
	Language    string      `json:"language"`
	PID         int         `json:"pid"`
	Data        interface{} `json:"data"`
	DurationMs  int64       `json:"duration_ms"`
	CapturedAt  string      `json:"captured_at"`
	Error       string      `json:"error,omitempty"`
}

type batchProfileTriggerRequest struct {
	EnableSQL        bool `json:"enable_sql"`
	EnableMethod     bool `json:"enable_method"`
	EnableStack      bool `json:"enable_stack"`
	EnableFlamegraph bool `json:"enable_flamegraph"`
	Duration         int  `json:"duration"`
	TopN             int  `json:"top_n"`
}

type batchProfileUploadRequest struct {
	ExecutionID string                `json:"execution_id"`
	Profiles    []batchProfileRecord  `json:"profiles"`
}

// ─── batch profile registry ─────────────────────────────────────────────────

type batchProfileRegistry struct {
	mu       sync.RWMutex
	profiles map[string][]batchProfileRecord // execution_id → profiles
}

func newBatchProfileRegistry() *batchProfileRegistry {
	reg := &batchProfileRegistry{
		profiles: make(map[string][]batchProfileRecord),
	}
	reg.seedDemoProfiles()
	return reg
}

func (r *batchProfileRegistry) addProfile(executionID string, profile batchProfileRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.profiles[executionID] = append(r.profiles[executionID], profile)
}

func (r *batchProfileRegistry) addProfiles(executionID string, profiles []batchProfileRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.profiles[executionID] = append(r.profiles[executionID], profiles...)
}

func (r *batchProfileRegistry) getProfiles(executionID string) []batchProfileRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.profiles[executionID]
}

func (r *batchProfileRegistry) getProfilesByType(executionID, profileType string) []batchProfileRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var filtered []batchProfileRecord
	for _, p := range r.profiles[executionID] {
		if p.ProfileType == profileType {
			filtered = append(filtered, p)
		}
	}
	return filtered
}

// ─── demo profile data ──────────────────────────────────────────────────────

func (r *batchProfileRegistry) seedDemoProfiles() {
	now := time.Now().UTC()
	tf := func(t time.Time) string { return t.Format(time.RFC3339) }

	// ── Java batch: daily-order-settlement (bexec-000001) ────────────────
	javaExecID := "bexec-000001"

	// SQL Top-N profiles — realistic INSERT/UPDATE/SELECT with timing
	r.profiles[javaExecID] = append(r.profiles[javaExecID], batchProfileRecord{
		ExecutionID: javaExecID,
		ProfileType: "sql",
		Language:    "java",
		PID:         15001,
		DurationMs:  30120,
		CapturedAt:  tf(now.Add(-22*time.Hour + 5*time.Minute)),
		Data: map[string]interface{}{
			"top_n":       10,
			"total_sql":   42,
			"total_calls": int64(142580),
			"profiles": []batchSQLProfile{
				{
					SQL:            "INSERT INTO order_items (order_id, product_id, qty, unit_price, created_at) VALUES (?, ?, ?, ?, ?)",
					ExecutionCount: 45280,
					TotalTimeMs:    104144,
					AvgTimeMs:      2.3,
					MaxTimeMs:      185,
					MinTimeMs:      1,
				},
				{
					SQL:            "UPDATE orders SET status = 'SETTLED', settled_at = NOW(), amount = ? WHERE id = ? AND status = 'PENDING'",
					ExecutionCount: 12500,
					TotalTimeMs:    63750,
					AvgTimeMs:      5.1,
					MaxTimeMs:      320,
					MinTimeMs:      2,
				},
				{
					SQL:            "SELECT o.id, o.customer_id, o.total_amount, o.status, c.name, c.email FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.created_at > ? AND o.status = 'PENDING' ORDER BY o.created_at",
					ExecutionCount: 800,
					TotalTimeMs:    33600,
					AvgTimeMs:      42.0,
					MaxTimeMs:      1250,
					MinTimeMs:      8,
				},
				{
					SQL:            "INSERT INTO settlement_log (order_id, amount, fee, net_amount, settled_at) VALUES (?, ?, ?, ?, ?)",
					ExecutionCount: 12500,
					TotalTimeMs:    27500,
					AvgTimeMs:      2.2,
					MaxTimeMs:      95,
					MinTimeMs:      1,
				},
				{
					SQL:            "UPDATE inventory SET quantity = quantity - ? WHERE product_id = ? AND quantity >= ?",
					ExecutionCount: 45280,
					TotalTimeMs:    22640,
					AvgTimeMs:      0.5,
					MaxTimeMs:      45,
					MinTimeMs:      0,
				},
				{
					SQL:            "SELECT p.id, p.sku, p.name, p.price, i.quantity FROM products p JOIN inventory i ON p.id = i.product_id WHERE p.id IN (?, ?, ?, ...)",
					ExecutionCount: 9056,
					TotalTimeMs:    18112,
					AvgTimeMs:      2.0,
					MaxTimeMs:      110,
					MinTimeMs:      1,
				},
				{
					SQL:            "INSERT INTO audit_log (entity_type, entity_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)",
					ExecutionCount: 12500,
					TotalTimeMs:    6250,
					AvgTimeMs:      0.5,
					MaxTimeMs:      25,
					MinTimeMs:      0,
				},
				{
					SQL:            "SELECT COUNT(*) FROM orders WHERE status = 'SETTLED' AND settled_at >= ?",
					ExecutionCount: 250,
					TotalTimeMs:    5000,
					AvgTimeMs:      20.0,
					MaxTimeMs:      180,
					MinTimeMs:      5,
				},
				{
					SQL:            "DELETE FROM temp_settlement_batch WHERE batch_id = ? AND processed = true",
					ExecutionCount: 50,
					TotalTimeMs:    2500,
					AvgTimeMs:      50.0,
					MaxTimeMs:      350,
					MinTimeMs:      10,
				},
				{
					SQL:            "COMMIT",
					ExecutionCount: 4364,
					TotalTimeMs:    1745,
					AvgTimeMs:      0.4,
					MaxTimeMs:      15,
					MinTimeMs:      0,
				},
			},
		},
	})

	// Method Top-N profiles — Spring Batch Processor/Reader/Writer hotspots
	r.profiles[javaExecID] = append(r.profiles[javaExecID], batchProfileRecord{
		ExecutionID: javaExecID,
		ProfileType: "method",
		Language:    "java",
		PID:         15001,
		DurationMs:  30250,
		CapturedAt:  tf(now.Add(-22*time.Hour + 5*time.Minute)),
		Data: map[string]interface{}{
			"top_n":         10,
			"total_methods": 284,
			"profiles": []batchMethodProfile{
				{ClassName: "com.company.batch", MethodName: "process", FullName: "com.company.batch.OrderSettlementProcessor.process", CallCount: 45280, TotalTimeMs: 48200, AvgTimeMs: 1.06, SelfTimeMs: 12500},
				{ClassName: "org.springframework.batch.item.database", MethodName: "write", FullName: "org.springframework.batch.item.database.JdbcBatchItemWriter.write", CallCount: 9056, TotalTimeMs: 32100, AvgTimeMs: 3.54, SelfTimeMs: 8200},
				{ClassName: "com.company.batch", MethodName: "read", FullName: "com.company.batch.OrderItemReader.read", CallCount: 45280, TotalTimeMs: 15400, AvgTimeMs: 0.34, SelfTimeMs: 4800},
				{ClassName: "com.zaxxer.hikari", MethodName: "getConnection", FullName: "com.zaxxer.hikari.HikariDataSource.getConnection", CallCount: 66836, TotalTimeMs: 12050, AvgTimeMs: 0.18, SelfTimeMs: 6200},
				{ClassName: "org.springframework.batch.core.step.item", MethodName: "doProcess", FullName: "org.springframework.batch.core.step.item.SimpleChunkProcessor.doProcess", CallCount: 45280, TotalTimeMs: 9800, AvgTimeMs: 0.22, SelfTimeMs: 1200},
				{ClassName: "com.company.batch", MethodName: "calculateSettlement", FullName: "com.company.batch.SettlementCalculator.calculateSettlement", CallCount: 12500, TotalTimeMs: 8750, AvgTimeMs: 0.70, SelfTimeMs: 5400},
				{ClassName: "org.springframework.transaction.support", MethodName: "execute", FullName: "org.springframework.transaction.support.TransactionTemplate.execute", CallCount: 4364, TotalTimeMs: 7200, AvgTimeMs: 1.65, SelfTimeMs: 600},
				{ClassName: "com.company.batch.validation", MethodName: "validate", FullName: "com.company.batch.validation.OrderValidator.validate", CallCount: 45280, TotalTimeMs: 5400, AvgTimeMs: 0.12, SelfTimeMs: 3200},
				{ClassName: "com.fasterxml.jackson.databind", MethodName: "writeValueAsString", FullName: "com.fasterxml.jackson.databind.ObjectMapper.writeValueAsString", CallCount: 12500, TotalTimeMs: 3750, AvgTimeMs: 0.30, SelfTimeMs: 2100},
				{ClassName: "org.springframework.batch.core.step.tasklet", MethodName: "execute", FullName: "org.springframework.batch.core.step.tasklet.TaskletStep.execute", CallCount: 10, TotalTimeMs: 2800, AvgTimeMs: 280.0, SelfTimeMs: 150},
			},
		},
	})

	// JVM GC metrics
	r.profiles[javaExecID] = append(r.profiles[javaExecID], batchProfileRecord{
		ExecutionID: javaExecID,
		ProfileType: "gc",
		Language:    "java",
		PID:         15001,
		DurationMs:  5120,
		CapturedAt:  tf(now.Add(-22*time.Hour + 5*time.Minute)),
		Data: batchJVMMetrics{
			GCCount:       142,
			GCTimeMs:      3420,
			HeapUsedBytes: 512 * 1024 * 1024,
			HeapMaxBytes:  1024 * 1024 * 1024,
			ThreadCount:   48,
			ClassLoaded:   12450,
		},
	})

	// CPU flamegraph (folded stack data)
	javaCPUFolded := buildJavaCPUFoldedDemo()
	r.profiles[javaExecID] = append(r.profiles[javaExecID], batchProfileRecord{
		ExecutionID: javaExecID,
		ProfileType: "flamegraph",
		Language:    "java",
		PID:         15001,
		DurationMs:  30500,
		CapturedAt:  tf(now.Add(-22*time.Hour + 6*time.Minute)),
		Data: batchFlamegraphData{
			ProfileType:  "cpu",
			FoldedStack:  javaCPUFolded,
			TotalSamples: 2970,
			DurationSec:  30,
		},
	})

	// ── Python batch: customer-email-campaign (bexec-000005) ─────────────
	pythonExecID := "bexec-000005"

	r.profiles[pythonExecID] = append(r.profiles[pythonExecID], batchProfileRecord{
		ExecutionID: pythonExecID,
		ProfileType: "method",
		Language:    "python",
		PID:         22001,
		DurationMs:  30080,
		CapturedAt:  tf(now.Add(-15*time.Hour + 10*time.Minute)),
		Data: map[string]interface{}{
			"top_n":           10,
			"total_samples":   int64(29700),
			"total_functions": 156,
			"duration_sec":    30,
			"profiles": []batchPythonFunctionProfile{
				{Function: "pandas.core.reshape.merge.merge", FileLine: "pandas/core/reshape/merge.py:120", SelfPercent: 12.4, TotalPercent: 28.1, SampleCount: 3683},
				{Function: "numpy.core._methods._mean", FileLine: "numpy/core/_methods.py:162", SelfPercent: 8.2, TotalPercent: 8.2, SampleCount: 2435},
				{Function: "sqlalchemy.engine.base.Connection._execute_clauseelement", FileLine: "sqlalchemy/engine/base.py:1380", SelfPercent: 6.8, TotalPercent: 15.3, SampleCount: 2020},
				{Function: "campaign.tasks.render_email_template", FileLine: "campaign/tasks.py:89", SelfPercent: 5.9, TotalPercent: 22.4, SampleCount: 1752},
				{Function: "jinja2.environment.Environment._render", FileLine: "jinja2/environment.py:1024", SelfPercent: 5.1, TotalPercent: 5.8, SampleCount: 1515},
				{Function: "pandas.io.sql.read_sql", FileLine: "pandas/io/sql.py:590", SelfPercent: 4.5, TotalPercent: 18.7, SampleCount: 1337},
				{Function: "campaign.tasks.filter_recipients", FileLine: "campaign/tasks.py:145", SelfPercent: 3.8, TotalPercent: 9.2, SampleCount: 1129},
				{Function: "smtplib.SMTP.sendmail", FileLine: "smtplib.py:867", SelfPercent: 3.2, TotalPercent: 3.4, SampleCount: 950},
				{Function: "pandas.core.frame.DataFrame.apply", FileLine: "pandas/core/frame.py:8740", SelfPercent: 2.9, TotalPercent: 14.6, SampleCount: 861},
				{Function: "json.encoder.JSONEncoder.encode", FileLine: "json/encoder.py:198", SelfPercent: 2.1, TotalPercent: 2.3, SampleCount: 624},
			},
		},
	})

	// Python flamegraph
	pythonFolded := buildPythonFoldedDemo()
	r.profiles[pythonExecID] = append(r.profiles[pythonExecID], batchProfileRecord{
		ExecutionID: pythonExecID,
		ProfileType: "flamegraph",
		Language:    "python",
		PID:         22001,
		DurationMs:  30200,
		CapturedAt:  tf(now.Add(-15*time.Hour + 11*time.Minute)),
		Data: batchFlamegraphData{
			ProfileType:  "cpu",
			FoldedStack:  pythonFolded,
			TotalSamples: 2970,
			DurationSec:  30,
		},
	})

	// ── Python batch: data-warehouse-etl (bexec-000008) ──────────────────
	etlExecID := "bexec-000008"

	r.profiles[etlExecID] = append(r.profiles[etlExecID], batchProfileRecord{
		ExecutionID: etlExecID,
		ProfileType: "method",
		Language:    "python",
		PID:         33001,
		DurationMs:  30150,
		CapturedAt:  tf(now.Add(-20*time.Hour + 10*time.Minute)),
		Data: map[string]interface{}{
			"top_n":           10,
			"total_samples":   int64(29700),
			"total_functions": 203,
			"duration_sec":    30,
			"profiles": []batchPythonFunctionProfile{
				{Function: "pandas.core.frame.DataFrame.merge", FileLine: "pandas/core/frame.py:9190", SelfPercent: 15.2, TotalPercent: 32.1, SampleCount: 4514},
				{Function: "numpy.linalg.solve", FileLine: "numpy/linalg/linalg.py:393", SelfPercent: 9.8, TotalPercent: 9.8, SampleCount: 2911},
				{Function: "sqlalchemy.engine.Engine.execute", FileLine: "sqlalchemy/engine/base.py:1234", SelfPercent: 7.5, TotalPercent: 19.2, SampleCount: 2228},
				{Function: "pyarrow.parquet.write_table", FileLine: "pyarrow/parquet.py:1890", SelfPercent: 6.3, TotalPercent: 8.1, SampleCount: 1871},
				{Function: "pandas.core.groupby.GroupBy.aggregate", FileLine: "pandas/core/groupby/groupby.py:1650", SelfPercent: 5.1, TotalPercent: 12.4, SampleCount: 1515},
				{Function: "etl.transformers.normalize_addresses", FileLine: "etl/transformers.py:234", SelfPercent: 4.2, TotalPercent: 7.8, SampleCount: 1247},
				{Function: "pandas.io.sql.to_sql", FileLine: "pandas/io/sql.py:697", SelfPercent: 3.6, TotalPercent: 14.5, SampleCount: 1069},
				{Function: "hashlib.sha256", FileLine: "hashlib.py:120", SelfPercent: 2.8, TotalPercent: 2.8, SampleCount: 832},
				{Function: "etl.validators.validate_schema", FileLine: "etl/validators.py:78", SelfPercent: 2.1, TotalPercent: 3.5, SampleCount: 624},
				{Function: "gzip.compress", FileLine: "gzip.py:315", SelfPercent: 1.9, TotalPercent: 1.9, SampleCount: 564},
			},
		},
	})

	// ── Java batch: inventory-sync (bexec-000017) ────────────────────────
	inventoryExecID := "bexec-000017"

	r.profiles[inventoryExecID] = append(r.profiles[inventoryExecID], batchProfileRecord{
		ExecutionID: inventoryExecID,
		ProfileType: "sql",
		Language:    "java",
		PID:         66001,
		DurationMs:  30050,
		CapturedAt:  tf(now.Add(-30*time.Minute + 1*time.Minute)),
		Data: map[string]interface{}{
			"top_n":       10,
			"total_sql":   18,
			"total_calls": int64(8520),
			"profiles": []batchSQLProfile{
				{SQL: "SELECT i.product_id, i.quantity, i.warehouse_id FROM inventory i WHERE i.last_sync < ? ORDER BY i.product_id", ExecutionCount: 2000, TotalTimeMs: 8000, AvgTimeMs: 4.0, MaxTimeMs: 85, MinTimeMs: 1},
				{SQL: "UPDATE inventory SET quantity = ?, last_sync = NOW() WHERE product_id = ? AND warehouse_id = ?", ExecutionCount: 3200, TotalTimeMs: 6400, AvgTimeMs: 2.0, MaxTimeMs: 45, MinTimeMs: 1},
				{SQL: "INSERT INTO sync_log (product_id, old_qty, new_qty, synced_at) VALUES (?, ?, ?, ?)", ExecutionCount: 3200, TotalTimeMs: 3200, AvgTimeMs: 1.0, MaxTimeMs: 20, MinTimeMs: 0},
				{SQL: "SELECT w.id, w.name, w.region FROM warehouses w WHERE w.active = true", ExecutionCount: 10, TotalTimeMs: 50, AvgTimeMs: 5.0, MaxTimeMs: 15, MinTimeMs: 2},
				{SQL: "COMMIT", ExecutionCount: 110, TotalTimeMs: 44, AvgTimeMs: 0.4, MaxTimeMs: 5, MinTimeMs: 0},
			},
		},
	})

	r.profiles[inventoryExecID] = append(r.profiles[inventoryExecID], batchProfileRecord{
		ExecutionID: inventoryExecID,
		ProfileType: "method",
		Language:    "java",
		PID:         66001,
		DurationMs:  30100,
		CapturedAt:  tf(now.Add(-30*time.Minute + 1*time.Minute)),
		Data: map[string]interface{}{
			"top_n":         10,
			"total_methods": 95,
			"profiles": []batchMethodProfile{
				{ClassName: "com.example", MethodName: "syncInventory", FullName: "com.example.InventorySyncJob.syncInventory", CallCount: 3200, TotalTimeMs: 18500, AvgTimeMs: 5.78, SelfTimeMs: 4200},
				{ClassName: "com.example", MethodName: "fetchRemoteInventory", FullName: "com.example.RemoteInventoryClient.fetchRemoteInventory", CallCount: 10, TotalTimeMs: 12000, AvgTimeMs: 1200.0, SelfTimeMs: 8500},
				{ClassName: "org.springframework.batch.item.database", MethodName: "write", FullName: "org.springframework.batch.item.database.JdbcBatchItemWriter.write", CallCount: 64, TotalTimeMs: 5800, AvgTimeMs: 90.6, SelfTimeMs: 1200},
				{ClassName: "com.example", MethodName: "validateQuantity", FullName: "com.example.InventoryValidator.validateQuantity", CallCount: 3200, TotalTimeMs: 1600, AvgTimeMs: 0.5, SelfTimeMs: 1200},
				{ClassName: "com.zaxxer.hikari", MethodName: "getConnection", FullName: "com.zaxxer.hikari.HikariDataSource.getConnection", CallCount: 6420, TotalTimeMs: 1284, AvgTimeMs: 0.2, SelfTimeMs: 800},
			},
		},
	})

	// ── Go batch: monthly-report-gen (bexec-000015) ──────────────────────
	goExecID := "bexec-000015"

	r.profiles[goExecID] = append(r.profiles[goExecID], batchProfileRecord{
		ExecutionID: goExecID,
		ProfileType: "method",
		Language:    "go",
		PID:         55001,
		DurationMs:  30200,
		CapturedAt:  tf(now.Add(-24*24*time.Hour + 3*time.Minute)),
		Data: map[string]interface{}{
			"endpoint": "http://localhost:6060/debug/pprof",
			"profile": map[string]interface{}{
				"profile_type": "cpu",
				"format":       "pprof",
				"size_bytes":   245760,
				"top_functions": []batchGoFunctionProfile{
					{Function: "report.(*Generator).generatePDF", FileLine: "/app/report/generator.go:145", Flat: 850, FlatPct: 28.3, Cum: 1200, CumPct: 40.0},
					{Function: "database/sql.(*DB).Query", FileLine: "/usr/local/go/src/database/sql/sql.go:1726", Flat: 420, FlatPct: 14.0, Cum: 520, CumPct: 17.3},
					{Function: "report.(*Aggregator).summarize", FileLine: "/app/report/aggregator.go:89", Flat: 380, FlatPct: 12.7, Cum: 680, CumPct: 22.7},
					{Function: "encoding/json.(*Encoder).Encode", FileLine: "/usr/local/go/src/encoding/json/stream.go:218", Flat: 250, FlatPct: 8.3, Cum: 250, CumPct: 8.3},
					{Function: "compress/gzip.(*Writer).Write", FileLine: "/usr/local/go/src/compress/gzip/gzip.go:192", Flat: 180, FlatPct: 6.0, Cum: 180, CumPct: 6.0},
					{Function: "report.(*Formatter).formatTable", FileLine: "/app/report/formatter.go:234", Flat: 150, FlatPct: 5.0, Cum: 280, CumPct: 9.3},
					{Function: "runtime.mallocgc", FileLine: "/usr/local/go/src/runtime/malloc.go:1029", Flat: 120, FlatPct: 4.0, Cum: 120, CumPct: 4.0},
					{Function: "os.(*File).Write", FileLine: "/usr/local/go/src/os/file.go:181", Flat: 95, FlatPct: 3.2, Cum: 95, CumPct: 3.2},
				},
			},
		},
	})

	r.profiles[goExecID] = append(r.profiles[goExecID], batchProfileRecord{
		ExecutionID: goExecID,
		ProfileType: "stack",
		Language:    "go",
		PID:         55001,
		DurationMs:  2050,
		CapturedAt:  tf(now.Add(-24*24*time.Hour + 3*time.Minute)),
		Data: map[string]interface{}{
			"endpoint": "http://localhost:6060/debug/pprof",
			"profile": map[string]interface{}{
				"profile_type": "heap",
				"format":       "pprof",
				"size_bytes":   128400,
				"top_functions": []batchGoFunctionProfile{
					{Function: "report.(*Generator).generatePDF", FileLine: "/app/report/generator.go:180", Flat: 52428800, FlatPct: 25.0, Cum: 83886080, CumPct: 40.0},
					{Function: "report.(*Aggregator).loadData", FileLine: "/app/report/aggregator.go:42", Flat: 41943040, FlatPct: 20.0, Cum: 41943040, CumPct: 20.0},
					{Function: "encoding/json.(*Decoder).Decode", FileLine: "/usr/local/go/src/encoding/json/stream.go:46", Flat: 20971520, FlatPct: 10.0, Cum: 20971520, CumPct: 10.0},
					{Function: "bytes.(*Buffer).grow", FileLine: "/usr/local/go/src/bytes/buffer.go:160", Flat: 15728640, FlatPct: 7.5, Cum: 15728640, CumPct: 7.5},
				},
			},
		},
	})

	// ── Python batch: ml-model-retrain (bexec-000021) ────────────────────
	mlExecID := "bexec-000021"

	r.profiles[mlExecID] = append(r.profiles[mlExecID], batchProfileRecord{
		ExecutionID: mlExecID,
		ProfileType: "method",
		Language:    "python",
		PID:         77001,
		DurationMs:  30300,
		CapturedAt:  tf(now.Add(-5*24*time.Hour + 30*time.Minute)),
		Data: map[string]interface{}{
			"top_n":           10,
			"total_samples":   int64(29700),
			"total_functions": 312,
			"duration_sec":    30,
			"profiles": []batchPythonFunctionProfile{
				{Function: "torch.nn.functional.linear", FileLine: "torch/nn/functional.py:1848", SelfPercent: 22.5, TotalPercent: 22.5, SampleCount: 6683},
				{Function: "torch.autograd.backward", FileLine: "torch/autograd/__init__.py:197", SelfPercent: 18.3, TotalPercent: 45.8, SampleCount: 5435},
				{Function: "numpy.dot", FileLine: "numpy/core/multiarray.py:752", SelfPercent: 8.2, TotalPercent: 8.2, SampleCount: 2435},
				{Function: "torch.utils.data.DataLoader.__next__", FileLine: "torch/utils/data/dataloader.py:628", SelfPercent: 6.1, TotalPercent: 12.4, SampleCount: 1812},
				{Function: "pandas.core.frame.DataFrame.merge", FileLine: "pandas/core/frame.py:9190", SelfPercent: 4.5, TotalPercent: 7.2, SampleCount: 1337},
				{Function: "sklearn.preprocessing.StandardScaler.transform", FileLine: "sklearn/preprocessing/_data.py:980", SelfPercent: 3.2, TotalPercent: 3.2, SampleCount: 950},
				{Function: "retrain.features.compute_embeddings", FileLine: "retrain/features.py:156", SelfPercent: 2.8, TotalPercent: 35.2, SampleCount: 832},
				{Function: "torch.cuda.synchronize", FileLine: "torch/cuda/__init__.py:565", SelfPercent: 2.4, TotalPercent: 2.4, SampleCount: 713},
				{Function: "retrain.evaluation.compute_metrics", FileLine: "retrain/evaluation.py:89", SelfPercent: 1.9, TotalPercent: 5.1, SampleCount: 564},
				{Function: "pickle.dumps", FileLine: "pickle.py:67", SelfPercent: 1.5, TotalPercent: 1.5, SampleCount: 446},
			},
		},
	})

	// ── Off-CPU flamegraph for Java batch ────────────────────────────────
	javaOffCPUFolded := buildJavaOffCPUFoldedDemo()
	r.profiles[javaExecID] = append(r.profiles[javaExecID], batchProfileRecord{
		ExecutionID: javaExecID,
		ProfileType: "offcpu",
		Language:    "java",
		PID:         15001,
		DurationMs:  30400,
		CapturedAt:  tf(now.Add(-22*time.Hour + 7*time.Minute)),
		Data: batchFlamegraphData{
			ProfileType:  "offcpu",
			FoldedStack:  javaOffCPUFolded,
			TotalSamples: 1850,
			DurationSec:  30,
		},
	})
}

// ─── folded stack demo data builders ────────────────────────────────────────

func buildJavaCPUFoldedDemo() string {
	lines := []string{
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;SimpleChunkProcessor.process;OrderSettlementProcessor.process 850",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;JdbcBatchItemWriter.write;JdbcTemplate.batchUpdate;HikariDataSource.getConnection 520",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;OrderItemReader.read;JdbcTemplate.queryForObject;HikariDataSource.getConnection 380",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;SimpleChunkProcessor.process;SettlementCalculator.calculateSettlement 280",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;SimpleChunkProcessor.process;OrderValidator.validate 200",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;TransactionTemplate.execute;PlatformTransactionManager.commit 180",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;JdbcBatchItemWriter.write;JdbcTemplate.batchUpdate;PreparedStatement.executeBatch 250",
		"java;main;SpringApplication.run;JobLauncherApplicationRunner.run;SimpleJobLauncher.run;SimpleStepHandler.handleStep;TaskletStep.execute;ChunkOrientedTasklet.execute;SimpleChunkProcessor.process;ObjectMapper.writeValueAsString 150",
		"java;GC;G1YoungGeneration;G1CollectForAllocation 120",
		"java;GC;G1MixedGeneration;G1Cleanup 40",
	}
	return strings.Join(lines, "\n")
}

func buildJavaOffCPUFoldedDemo() string {
	lines := []string{
		"java;main;SpringApplication.run;TaskletStep.execute;ChunkOrientedTasklet.execute;JdbcBatchItemWriter.write;HikariPool.getConnection;Thread.sleep 450",
		"java;main;SpringApplication.run;TaskletStep.execute;ChunkOrientedTasklet.execute;OrderItemReader.read;JdbcTemplate.queryForObject;socketRead0 380",
		"java;main;SpringApplication.run;TaskletStep.execute;TransactionTemplate.execute;DataSourceTransactionManager.doCommit;Connection.commit;socketWrite0 280",
		"java;main;SpringApplication.run;TaskletStep.execute;ChunkOrientedTasklet.execute;JdbcBatchItemWriter.write;PreparedStatement.executeBatch;socketWrite0 320",
		"java;Thread-pool-1;AuditLogWriter.flush;FileOutputStream.write;write 180",
		"java;Thread-pool-2;SettlementNotifier.sendNotification;HttpClient.send;socketConnect0 240",
	}
	return strings.Join(lines, "\n")
}

func buildPythonFoldedDemo() string {
	lines := []string{
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.filter_recipients;pandas.io.sql.read_sql;sqlalchemy.engine.Engine.execute 420",
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.filter_recipients;pandas.core.frame.DataFrame.merge;pandas.core.reshape.merge.merge 380",
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.render_email_template;jinja2.environment.Environment._render 350",
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.render_email_template;campaign.tasks.load_customer_data;pandas.io.sql.read_sql 280",
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.send_emails;smtplib.SMTP.sendmail 320",
		"python;campaign.main;campaign.tasks.run_campaign;pandas.core.frame.DataFrame.apply;numpy.core._methods._mean 250",
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.filter_recipients;pandas.core.frame.DataFrame.apply;campaign.tasks.score_recipient 200",
		"python;campaign.main;campaign.tasks.run_campaign;json.encoder.JSONEncoder.encode 180",
		"python;campaign.main;campaign.tasks.run_campaign;campaign.tasks.generate_report;pandas.core.frame.DataFrame.to_csv 150",
		"python;celery.app.trace.trace_task;campaign.tasks.run_campaign;campaign.tasks.update_status;sqlalchemy.engine.Engine.execute 140",
	}
	return strings.Join(lines, "\n")
}

// ─── route registration ─────────────────────────────────────────────────────

// registerBatchProfilingRoutes registers batch profiling API routes.
func registerBatchProfilingRoutes(mux *http.ServeMux) {
	reg := newBatchProfileRegistry()

	// POST /api/v1/batch/profile/upload — agent uploads profile data
	mux.HandleFunc("POST /api/v1/batch/profile/upload", func(w http.ResponseWriter, r *http.Request) {
		var req batchProfileUploadRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}
		if req.ExecutionID == "" {
			http.Error(w, `{"error":"execution_id is required"}`, http.StatusBadRequest)
			return
		}
		if len(req.Profiles) == 0 {
			http.Error(w, `{"error":"profiles array is required"}`, http.StatusBadRequest)
			return
		}

		for i := range req.Profiles {
			req.Profiles[i].ExecutionID = req.ExecutionID
		}
		reg.addProfiles(req.ExecutionID, req.Profiles)

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"execution_id":    req.ExecutionID,
			"profiles_stored": len(req.Profiles),
		})
	})

	// All other batch profiling routes use the catch-all under /api/v1/batch/executions/
	// with sub-path routing for profile endpoints.
	mux.HandleFunc("GET /api/v1/batch/profiling/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/batch/profiling/")
		parts := strings.SplitN(path, "/", 3)

		// Expecting: executions/{id}/profile[/subtype]
		if len(parts) < 3 || parts[0] != "executions" {
			http.NotFound(w, r)
			return
		}

		execID := parts[1]
		remainder := parts[2] // "profile" or "profile/sql" etc.

		profileParts := strings.SplitN(remainder, "/", 2)
		if profileParts[0] != "profile" {
			http.NotFound(w, r)
			return
		}

		profiles := reg.getProfiles(execID)
		if profiles == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"items":        []interface{}{},
				"total":        0,
				"message":      "no profiles found for this execution",
			})
			return
		}

		// If no sub-type, return all profiles
		if len(profileParts) == 1 || profileParts[1] == "" {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"items":        profiles,
				"total":        len(profiles),
			})
			return
		}

		// Sub-type filtering
		subType := profileParts[1]
		switch subType {
		case "sql":
			filtered := reg.getProfilesByType(execID, "sql")
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"type":         "sql",
				"items":        filtered,
				"total":        len(filtered),
			})

		case "methods":
			filtered := reg.getProfilesByType(execID, "method")
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"type":         "method",
				"items":        filtered,
				"total":        len(filtered),
			})

		case "flamegraph":
			var filtered []batchProfileRecord
			for _, p := range profiles {
				if p.ProfileType == "flamegraph" || p.ProfileType == "offcpu" {
					filtered = append(filtered, p)
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"type":         "flamegraph",
				"items":        filtered,
				"total":        len(filtered),
			})

		case "gc":
			filtered := reg.getProfilesByType(execID, "gc")
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"type":         "gc",
				"items":        filtered,
				"total":        len(filtered),
			})

		case "stack":
			filtered := reg.getProfilesByType(execID, "stack")
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"execution_id": execID,
				"type":         "stack",
				"items":        filtered,
				"total":        len(filtered),
			})

		default:
			http.NotFound(w, r)
		}
	})

	// POST /api/v1/batch/profiling/executions/{id}/profile/trigger
	mux.HandleFunc("POST /api/v1/batch/profiling/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/v1/batch/profiling/")
		parts := strings.SplitN(path, "/", 4)

		// Expecting: executions/{id}/profile/trigger
		if len(parts) < 4 || parts[0] != "executions" || parts[2] != "profile" || parts[3] != "trigger" {
			http.NotFound(w, r)
			return
		}

		execID := parts[1]

		var triggerReq batchProfileTriggerRequest
		if err := json.NewDecoder(r.Body).Decode(&triggerReq); err != nil {
			// Use defaults
			triggerReq = batchProfileTriggerRequest{
				EnableSQL:        true,
				EnableMethod:     true,
				EnableStack:      true,
				EnableFlamegraph: true,
				Duration:         30,
				TopN:             10,
			}
		}

		if triggerReq.Duration <= 0 {
			triggerReq.Duration = 30
		}
		if triggerReq.Duration > 300 {
			triggerReq.Duration = 300
		}
		if triggerReq.TopN <= 0 {
			triggerReq.TopN = 10
		}

		// In production, this would dispatch to the agent.
		// For the MVP, return an accepted response.
		writeJSON(w, http.StatusAccepted, map[string]interface{}{
			"execution_id": execID,
			"status":       "profiling_triggered",
			"config": map[string]interface{}{
				"enable_sql":        triggerReq.EnableSQL,
				"enable_method":     triggerReq.EnableMethod,
				"enable_stack":      triggerReq.EnableStack,
				"enable_flamegraph": triggerReq.EnableFlamegraph,
				"duration_sec":      triggerReq.Duration,
				"top_n":             triggerReq.TopN,
			},
			"message": fmt.Sprintf("profiling request queued for execution %s (duration: %ds)", execID, triggerReq.Duration),
		})
	})
}

// Ensure math import is used
var _ = math.Round
