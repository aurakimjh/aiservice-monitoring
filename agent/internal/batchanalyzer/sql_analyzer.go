// Package batchanalyzer implements batch performance analysis engines (WS-3).
//
// Components:
//   - SQLAnalyzer     (WS-3.1): SQL bottleneck detection, N+1, EXPLAIN, index
//   - ChunkAnalyzer   (WS-3.2): Chunk/parallelization optimization
//   - TrendAnalyzer   (WS-3.3): Regression analysis + SLA prediction
//   - ResourceAnalyzer (WS-3.4): CPU/IO/GC analysis + auto-report
//   - LiveView        (WS-3.5): Real-time batch progress tracking
package batchanalyzer

import (
	"math"
	"sort"
	"time"
)

// ── WS-3.1: SQL 병목 자동 분석 ───────────────────────────────────────────────

// SQLProfile represents a collected SQL execution profile for a batch.
type SQLProfile struct {
	Statement    string  `json:"statement"`
	Fingerprint  string  `json:"fingerprint"`  // normalized (params removed)
	ExecCount    int     `json:"execCount"`
	TotalTimeMS  float64 `json:"totalTimeMs"`
	AvgTimeMS    float64 `json:"avgTimeMs"`
	MaxTimeMS    float64 `json:"maxTimeMs"`
	MinTimeMS    float64 `json:"minTimeMs"`
	RowsAffected int64   `json:"rowsAffected"`
}

// SQLAnalysisResult holds all SQL analysis findings for a batch execution.
type SQLAnalysisResult struct {
	ExecutionID   string            `json:"executionId"`
	AnalyzedAt    time.Time         `json:"analyzedAt"`
	TotalSQLTime  float64           `json:"totalSqlTimeMs"`
	TotalSQLCount int               `json:"totalSqlCount"`
	Pareto        []ParetoItem      `json:"pareto"`        // 39-1-1
	NPlus1        []NPlus1Finding   `json:"nPlus1"`        // 39-1-3
	IndexMissing  []IndexFinding    `json:"indexMissing"`  // 39-1-4
	UnusedQueries []UnusedQuery     `json:"unusedQueries"` // 39-1-5
	ExplainPlans  []ExplainResult   `json:"explainPlans"`  // 39-1-2
}

// 39-1-1: Pareto analysis — SQL ranked by total time contribution.
type ParetoItem struct {
	Rank        int     `json:"rank"`
	Fingerprint string  `json:"fingerprint"`
	Statement   string  `json:"statement"`
	TotalTimeMS float64 `json:"totalTimeMs"`
	Percentage  float64 `json:"percentage"`  // % of total SQL time
	CumPct      float64 `json:"cumPct"`      // cumulative %
	ExecCount   int     `json:"execCount"`
	AvgTimeMS   float64 `json:"avgTimeMs"`
}

// 39-1-2: EXPLAIN plan result.
type ExplainResult struct {
	Statement string `json:"statement"`
	Plan      string `json:"plan"`       // EXPLAIN output text
	HasSeqScan bool  `json:"hasSeqScan"` // 39-1-4: Seq Scan detected
	EstRows   int64  `json:"estRows"`
	EstCost   float64 `json:"estCost"`
}

// 39-1-3: N+1 query pattern detection.
type NPlus1Finding struct {
	Fingerprint string `json:"fingerprint"`
	Statement   string `json:"statement"`
	ExecCount   int    `json:"execCount"`     // e.g. 1000 (matches loop iteration count)
	Severity    string `json:"severity"`      // critical, warning
	Suggestion  string `json:"suggestion"`
}

// 39-1-4: Missing index finding.
type IndexFinding struct {
	Table      string `json:"table"`
	Column     string `json:"column"`
	Statement  string `json:"statement"`
	SeqScanCost float64 `json:"seqScanCost"`
	Suggestion string `json:"suggestion"` // "CREATE INDEX idx_... ON table(column)"
}

// 39-1-5: Unused query (SELECT results not consumed).
type UnusedQuery struct {
	Fingerprint string `json:"fingerprint"`
	Statement   string `json:"statement"`
	ExecCount   int    `json:"execCount"`
	WastedTimeMS float64 `json:"wastedTimeMs"`
	Suggestion  string  `json:"suggestion"`
}

// AnalyzeSQL performs all SQL analysis on a batch execution's SQL profiles.
func AnalyzeSQL(executionID string, profiles []SQLProfile) *SQLAnalysisResult {
	result := &SQLAnalysisResult{
		ExecutionID: executionID,
		AnalyzedAt:  time.Now().UTC(),
	}

	if len(profiles) == 0 {
		return result
	}

	// Total SQL metrics.
	for _, p := range profiles {
		result.TotalSQLTime += p.TotalTimeMS
		result.TotalSQLCount += p.ExecCount
	}

	// 39-1-1: Pareto analysis (rank by total time).
	sorted := make([]SQLProfile, len(profiles))
	copy(sorted, profiles)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].TotalTimeMS > sorted[j].TotalTimeMS })

	cumPct := 0.0
	for i, p := range sorted {
		pct := 0.0
		if result.TotalSQLTime > 0 {
			pct = p.TotalTimeMS / result.TotalSQLTime * 100
		}
		cumPct += pct
		result.Pareto = append(result.Pareto, ParetoItem{
			Rank:        i + 1,
			Fingerprint: p.Fingerprint,
			Statement:   truncateSQL(p.Statement, 200),
			TotalTimeMS: p.TotalTimeMS,
			Percentage:  math.Round(pct*10) / 10,
			CumPct:      math.Round(cumPct*10) / 10,
			ExecCount:   p.ExecCount,
			AvgTimeMS:   p.AvgTimeMS,
		})
		if i >= 19 { // top 20
			break
		}
	}

	// 39-1-3: N+1 detection — same SQL executed many times (>= 10).
	for _, p := range profiles {
		if p.ExecCount >= 10 && p.AvgTimeMS > 1 {
			severity := "warning"
			if p.ExecCount >= 100 {
				severity = "critical"
			}
			result.NPlus1 = append(result.NPlus1, NPlus1Finding{
				Fingerprint: p.Fingerprint,
				Statement:   truncateSQL(p.Statement, 200),
				ExecCount:   p.ExecCount,
				Severity:    severity,
				Suggestion:  "배치 쿼리(IN 절) 또는 JOIN으로 통합하여 호출 횟수를 줄이세요.",
			})
		}
	}

	// 39-1-5: Unused queries — SELECT with 0 rows affected (heuristic).
	for _, p := range profiles {
		if p.RowsAffected == 0 && p.ExecCount > 5 &&
			(len(p.Statement) > 6 && p.Statement[:6] == "SELECT") {
			result.UnusedQueries = append(result.UnusedQueries, UnusedQuery{
				Fingerprint:  p.Fingerprint,
				Statement:    truncateSQL(p.Statement, 200),
				ExecCount:    p.ExecCount,
				WastedTimeMS: p.TotalTimeMS,
				Suggestion:   "결과를 사용하지 않는 조회입니다. 제거하거나 EXISTS로 변경하세요.",
			})
		}
	}

	return result
}

func truncateSQL(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
