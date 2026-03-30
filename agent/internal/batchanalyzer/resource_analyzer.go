package batchanalyzer

import (
	"fmt"
	"math"
	"time"
)

// ── WS-3.4: 리소스 효율 + 비교 + 리포트 ──────────────────────────────────────

// ResourceMetrics holds time-series resource metrics for a batch execution.
type ResourceMetrics struct {
	Timestamps []time.Time `json:"timestamps"`
	CPUPct     []float64   `json:"cpuPct"`
	MemoryMB   []float64   `json:"memoryMb"`
	IOReadMB   []float64   `json:"ioReadMb"`
	IOWriteMB  []float64   `json:"ioWriteMb"`
	GCPauseMS  []float64   `json:"gcPauseMs,omitempty"`
	ThreadCount []int      `json:"threadCount,omitempty"`
}

// ResourceAnalysisResult holds resource efficiency findings.
type ResourceAnalysisResult struct {
	ExecutionID string `json:"executionId"`
	// 39-4-1: CPU/IO bound classification.
	BoundType   string `json:"boundType"` // cpu_bound, io_bound, memory_bound, balanced
	BoundReason string `json:"boundReason"`
	ThreadRecommendation string `json:"threadRecommendation,omitempty"`
	// 39-4-2: DB connection pool analysis.
	PoolAnalysis *PoolAnalysis `json:"poolAnalysis,omitempty"`
	// 39-4-3: GC analysis.
	GCAnalysis *GCAnalysis `json:"gcAnalysis,omitempty"`
	// 39-5-3: Performance grade.
	Grade       string `json:"grade"` // A, B, C, D, E, F
	GradeReason string `json:"gradeReason"`
}

// 39-4-2: Connection pool analysis.
type PoolAnalysis struct {
	CurrentMax      int     `json:"currentMax"`
	AvgActive       float64 `json:"avgActive"`
	PeakActive      int     `json:"peakActive"`
	WaitCount       int     `json:"waitCount"`
	RecommendedMax  int     `json:"recommendedMax"`
	Recommendation  string  `json:"recommendation"`
}

// 39-4-3: GC analysis.
type GCAnalysis struct {
	TotalPauseMS    float64 `json:"totalPauseMs"`
	PauseRatio      float64 `json:"pauseRatio"` // GC pause / total duration (%)
	MaxPauseMS      float64 `json:"maxPauseMs"`
	GCCount         int     `json:"gcCount"`
	Excessive       bool    `json:"excessive"` // pauseRatio > 5%
	HeapRecommendation string `json:"heapRecommendation,omitempty"`
}

// 39-5-1/39-5-2: Comparison result.
type ComparisonResult struct {
	Label       string  `json:"label"` // "정상 vs 이상" or "배포 전 vs 후"
	BaselineAvg float64 `json:"baselineAvgMs"`
	CompareAvg  float64 `json:"compareAvgMs"`
	DiffPct     float64 `json:"diffPct"` // positive = slower
	BaselineCPU float64 `json:"baselineCpuPct"`
	CompareCPU  float64 `json:"compareCpuPct"`
	BaselineMem float64 `json:"baselineMemMb"`
	CompareMem  float64 `json:"compareMemMb"`
	Findings    []string `json:"findings"`
}

// 39-5-3: Auto-generated optimization report.
type OptimizationReport struct {
	GeneratedAt time.Time           `json:"generatedAt"`
	JobName     string              `json:"jobName"`
	Period      string              `json:"period"` // "최근 30일"
	Grade       string              `json:"grade"`  // A-F
	Summary     string              `json:"summary"`
	SQLFindings int                 `json:"sqlFindings"`
	Sections    []ReportSection     `json:"sections"`
}

// ReportSection is one section of the optimization report.
type ReportSection struct {
	Title       string   `json:"title"`
	Grade       string   `json:"grade"` // A-F
	Description string   `json:"description"`
	Items       []string `json:"items"` // bullet points
}

// AnalyzeResources performs CPU/IO/GC analysis on a batch execution.
func AnalyzeResources(executionID string, metrics ResourceMetrics, durationMS float64) *ResourceAnalysisResult {
	result := &ResourceAnalysisResult{ExecutionID: executionID}

	// 39-4-1: Determine bound type.
	avgCPU := avgF(metrics.CPUPct)
	avgIO := 0.0
	if len(metrics.IOReadMB) > 0 && len(metrics.IOWriteMB) > 0 {
		for i := range metrics.IOReadMB {
			avgIO += metrics.IOReadMB[i] + metrics.IOWriteMB[i]
		}
		avgIO /= float64(len(metrics.IOReadMB))
	}

	if avgCPU > 70 {
		result.BoundType = "cpu_bound"
		result.BoundReason = fmt.Sprintf("평균 CPU 사용률 %.0f%%로 CPU 바운드 배치입니다.", avgCPU)
		cores := int(math.Ceil(avgCPU / 100))
		result.ThreadRecommendation = fmt.Sprintf("CPU 코어 활용을 위해 %d개 스레드를 권장합니다.", cores)
	} else if avgIO > 50 {
		result.BoundType = "io_bound"
		result.BoundReason = fmt.Sprintf("평균 IO %.0f MB/s로 IO 바운드 배치입니다.", avgIO)
		result.ThreadRecommendation = "IO 대기를 숨기기 위해 CPU 코어 수의 2~4배 스레드를 권장합니다."
	} else {
		result.BoundType = "balanced"
		result.BoundReason = "CPU/IO 모두 여유가 있습니다. 데이터량이 적거나 대기 시간이 병목일 수 있습니다."
	}

	// 39-4-3: GC analysis.
	if len(metrics.GCPauseMS) > 0 {
		gc := &GCAnalysis{GCCount: len(metrics.GCPauseMS)}
		for _, p := range metrics.GCPauseMS {
			gc.TotalPauseMS += p
			if p > gc.MaxPauseMS {
				gc.MaxPauseMS = p
			}
		}
		if durationMS > 0 {
			gc.PauseRatio = gc.TotalPauseMS / durationMS * 100
		}
		gc.Excessive = gc.PauseRatio > 5
		if gc.Excessive {
			gc.HeapRecommendation = "GC 부하가 높습니다. 힙 크기를 50% 증가시키거나 객체 생성을 줄이세요."
		}
		result.GCAnalysis = gc
	}

	// 39-5-3: Performance grade.
	result.Grade, result.GradeReason = computeGrade(avgCPU, result.GCAnalysis, durationMS)

	return result
}

// CompareExecutions compares two sets of executions (39-5-1, 39-5-2).
func CompareExecutions(label string, baseline, compare []ExecutionHistory) *ComparisonResult {
	result := &ComparisonResult{Label: label}

	if len(baseline) == 0 || len(compare) == 0 {
		return result
	}

	bDurations := make([]float64, len(baseline))
	cDurations := make([]float64, len(compare))
	for i, h := range baseline {
		bDurations[i] = h.DurationMS
	}
	for i, h := range compare {
		cDurations[i] = h.DurationMS
	}

	result.BaselineAvg = math.Round(avgF(bDurations)*10) / 10
	result.CompareAvg = math.Round(avgF(cDurations)*10) / 10

	if result.BaselineAvg > 0 {
		result.DiffPct = math.Round((result.CompareAvg-result.BaselineAvg)/result.BaselineAvg*1000) / 10
	}

	if result.DiffPct > 20 {
		result.Findings = append(result.Findings,
			fmt.Sprintf("실행 시간이 %.1f%% 증가했습니다. 성능 저하 원인을 확인하세요.", result.DiffPct))
	} else if result.DiffPct < -20 {
		result.Findings = append(result.Findings,
			fmt.Sprintf("실행 시간이 %.1f%% 감소했습니다. 최적화 효과가 확인됩니다.", -result.DiffPct))
	} else {
		result.Findings = append(result.Findings, "실행 시간에 유의미한 변화가 없습니다.")
	}

	return result
}

// GenerateReport creates a comprehensive optimization report (39-5-3).
func GenerateReport(jobName string, sqlResult *SQLAnalysisResult, chunkResult *ChunkAnalysisResult,
	trendResult *TrendAnalysisResult, resourceResult *ResourceAnalysisResult) *OptimizationReport {

	report := &OptimizationReport{
		GeneratedAt: time.Now().UTC(),
		JobName:     jobName,
		Period:      "최근 30일",
	}

	var grades []string

	// SQL section.
	if sqlResult != nil {
		sqlGrade := "A"
		var items []string
		if len(sqlResult.NPlus1) > 0 {
			sqlGrade = "D"
			items = append(items, fmt.Sprintf("N+1 패턴 %d건 감지", len(sqlResult.NPlus1)))
		}
		if len(sqlResult.IndexMissing) > 0 {
			if sqlGrade > "C" {
				sqlGrade = "C"
			}
			items = append(items, fmt.Sprintf("인덱스 누락 %d건", len(sqlResult.IndexMissing)))
		}
		if len(sqlResult.Pareto) > 0 && sqlResult.Pareto[0].Percentage > 50 {
			items = append(items, fmt.Sprintf("상위 1개 SQL이 전체의 %.0f%% 차지", sqlResult.Pareto[0].Percentage))
		}
		if len(items) == 0 {
			items = append(items, "SQL 성능이 양호합니다.")
		}
		report.Sections = append(report.Sections, ReportSection{
			Title: "SQL 분석", Grade: sqlGrade,
			Description: "SQL 병목 자동 분석 결과", Items: items,
		})
		report.SQLFindings = len(sqlResult.NPlus1) + len(sqlResult.IndexMissing) + len(sqlResult.UnusedQueries)
		grades = append(grades, sqlGrade)
	}

	// Resource section.
	if resourceResult != nil {
		report.Sections = append(report.Sections, ReportSection{
			Title: "리소스 효율", Grade: resourceResult.Grade,
			Description: resourceResult.BoundReason,
			Items:       []string{resourceResult.ThreadRecommendation},
		})
		grades = append(grades, resourceResult.Grade)
	}

	// Trend section.
	if trendResult != nil {
		trendGrade := "A"
		var items []string
		if trendResult.TrendDirection == "increasing" {
			trendGrade = "C"
			items = append(items, fmt.Sprintf("실행 시간 증가 추세 (일 평균 +%.1fms)", trendResult.DurationTrend.Slope))
		}
		if trendResult.SLAPrediction != nil && trendResult.SLAPrediction.Risk == "critical" {
			trendGrade = "F"
			items = append(items, trendResult.SLAPrediction.Recommendation)
		} else if trendResult.SLAPrediction != nil && trendResult.SLAPrediction.Risk == "high" {
			trendGrade = "D"
			items = append(items, trendResult.SLAPrediction.Recommendation)
		}
		if len(items) == 0 {
			items = append(items, "실행 시간이 안정적입니다.")
		}
		report.Sections = append(report.Sections, ReportSection{
			Title: "트렌드 분석", Grade: trendGrade,
			Description: "실행 시간 변화 추세", Items: items,
		})
		grades = append(grades, trendGrade)
	}

	// Overall grade = worst section grade.
	report.Grade = "A"
	for _, g := range grades {
		if g > report.Grade {
			report.Grade = g
		}
	}

	report.Summary = fmt.Sprintf("배치 '%s' 종합 성능 등급: %s", jobName, report.Grade)

	return report
}

func computeGrade(avgCPU float64, gc *GCAnalysis, durationMS float64) (string, string) {
	if gc != nil && gc.Excessive {
		return "D", "GC 부하가 과도합니다 (전체 시간의 " + fmt.Sprintf("%.1f%%", gc.PauseRatio) + ")."
	}
	if avgCPU > 90 {
		return "C", "CPU 사용률이 매우 높습니다. 병렬화 또는 알고리즘 최적화를 검토하세요."
	}
	if avgCPU < 10 && durationMS > 60000 {
		return "C", "CPU 활용이 매우 낮으나 실행 시간이 깁니다. IO 대기 또는 외부 호출 병목을 확인하세요."
	}
	if avgCPU > 70 {
		return "B", "CPU 활용이 높으나 양호한 수준입니다."
	}
	return "A", "리소스 효율이 양호합니다."
}

func avgF(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	var s float64
	for _, v := range vals {
		s += v
	}
	return s / float64(len(vals))
}
