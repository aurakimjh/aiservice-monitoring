package batchanalyzer

import (
	"math"
	"time"
)

// ── WS-3.3: 회귀 분석 + SLA 예측 ────────────────────────────────────────────

// ExecutionHistory is a single historical execution for trend analysis.
type ExecutionHistory struct {
	Timestamp  time.Time `json:"timestamp"`
	DurationMS float64   `json:"durationMs"`
	DataCount  int64     `json:"dataCount"`  // rows/records processed
	State      string    `json:"state"`       // COMPLETED, FAILED
}

// TrendAnalysisResult holds regression and SLA prediction findings.
type TrendAnalysisResult struct {
	JobName string `json:"jobName"`
	// 39-3-1: Duration trend analysis.
	DurationTrend TrendLine `json:"durationTrend"`
	TrendDirection string  `json:"trendDirection"` // increasing, decreasing, stable
	// 39-3-2: Data count ↔ duration correlation.
	Correlation   float64    `json:"correlation"` // -1 to 1
	CorrelationDesc string   `json:"correlationDesc"` // strong_positive, weak, none
	// 39-3-3: Inflection point detection.
	Inflections []InflectionPoint `json:"inflections"`
	// 39-3-4: SLA violation prediction.
	SLAPrediction *SLAPrediction `json:"slaPrediction,omitempty"`
}

// TrendLine represents a linear regression result.
type TrendLine struct {
	Slope     float64 `json:"slope"`     // ms per day increase
	Intercept float64 `json:"intercept"` // baseline ms
	R2        float64 `json:"r2"`        // goodness of fit (0-1)
	// Projected values.
	DaysToDouble float64 `json:"daysToDouble,omitempty"` // days until duration doubles
}

// InflectionPoint is a sudden change in execution behavior.
type InflectionPoint struct {
	Timestamp   time.Time `json:"timestamp"`
	BeforeAvgMS float64   `json:"beforeAvgMs"`
	AfterAvgMS  float64   `json:"afterAvgMs"`
	ChangeRatio float64   `json:"changeRatio"` // e.g. 1.5 = 50% increase
	PossibleCause string  `json:"possibleCause"` // deployment, db_migration, data_growth
}

// SLAPrediction predicts when SLA will be violated.
type SLAPrediction struct {
	SLAThresholdMS float64   `json:"slaThresholdMs"`
	CurrentAvgMS   float64   `json:"currentAvgMs"`
	PredictedBreachDate *time.Time `json:"predictedBreachDate,omitempty"`
	DaysUntilBreach int       `json:"daysUntilBreach"`
	Risk           string    `json:"risk"` // low, medium, high, critical
	Recommendation string    `json:"recommendation"`
}

// AnalyzeTrend performs regression and SLA prediction on execution history.
func AnalyzeTrend(jobName string, history []ExecutionHistory, slaThresholdMS float64) *TrendAnalysisResult {
	result := &TrendAnalysisResult{
		JobName: jobName,
	}

	if len(history) < 3 {
		result.TrendDirection = "insufficient_data"
		return result
	}

	// Extract duration series.
	n := len(history)
	durations := make([]float64, n)
	dayOffsets := make([]float64, n)
	dataCounts := make([]float64, n)
	baseTime := history[0].Timestamp

	for i, h := range history {
		durations[i] = h.DurationMS
		dayOffsets[i] = h.Timestamp.Sub(baseTime).Hours() / 24
		dataCounts[i] = float64(h.DataCount)
	}

	// 39-3-1: Linear regression (duration vs time).
	slope, intercept, r2 := linearRegression(dayOffsets, durations)
	result.DurationTrend = TrendLine{
		Slope:     math.Round(slope*100) / 100,
		Intercept: math.Round(intercept*10) / 10,
		R2:        math.Round(r2*1000) / 1000,
	}

	if slope > 10 {
		result.TrendDirection = "increasing"
		if intercept > 0 {
			result.DurationTrend.DaysToDouble = intercept / slope
		}
	} else if slope < -10 {
		result.TrendDirection = "decreasing"
	} else {
		result.TrendDirection = "stable"
	}

	// 39-3-2: Data count ↔ duration correlation.
	hasDataCounts := false
	for _, dc := range dataCounts {
		if dc > 0 {
			hasDataCounts = true
			break
		}
	}
	if hasDataCounts {
		result.Correlation = pearsonCorrelation(dataCounts, durations)
		if result.Correlation > 0.7 {
			result.CorrelationDesc = "strong_positive"
		} else if result.Correlation > 0.3 {
			result.CorrelationDesc = "moderate_positive"
		} else if result.Correlation < -0.3 {
			result.CorrelationDesc = "negative"
		} else {
			result.CorrelationDesc = "weak"
		}
	}

	// 39-3-3: Inflection point detection (significant changes).
	windowSize := 5
	if windowSize > n/3 {
		windowSize = n / 3
	}
	if windowSize < 2 {
		windowSize = 2
	}

	for i := windowSize; i < n-windowSize; i++ {
		beforeAvg := avg(durations[i-windowSize : i])
		afterAvg := avg(durations[i : i+windowSize])

		if beforeAvg > 0 {
			ratio := afterAvg / beforeAvg
			if ratio > 1.5 || ratio < 0.6 {
				cause := "unknown"
				if ratio > 1.5 {
					cause = "성능 저하 감지 (배포/DB 변경 가능성)"
				} else {
					cause = "성능 개선 감지 (최적화 적용 가능성)"
				}
				result.Inflections = append(result.Inflections, InflectionPoint{
					Timestamp:     history[i].Timestamp,
					BeforeAvgMS:   math.Round(beforeAvg*10) / 10,
					AfterAvgMS:    math.Round(afterAvg*10) / 10,
					ChangeRatio:   math.Round(ratio*100) / 100,
					PossibleCause: cause,
				})
			}
		}
	}

	// 39-3-4: SLA violation prediction.
	if slaThresholdMS > 0 {
		currentAvg := avg(durations[n-min(5, n):])
		pred := &SLAPrediction{
			SLAThresholdMS: slaThresholdMS,
			CurrentAvgMS:   math.Round(currentAvg*10) / 10,
		}

		if currentAvg >= slaThresholdMS {
			pred.Risk = "critical"
			pred.DaysUntilBreach = 0
			pred.Recommendation = "SLA를 이미 초과하고 있습니다. 즉시 최적화가 필요합니다."
		} else if slope > 0 && currentAvg > 0 {
			daysLeft := (slaThresholdMS - currentAvg) / slope
			if daysLeft > 0 && daysLeft < 365 {
				breachDate := time.Now().AddDate(0, 0, int(daysLeft))
				pred.PredictedBreachDate = &breachDate
				pred.DaysUntilBreach = int(daysLeft)
			}

			if daysLeft < 7 {
				pred.Risk = "critical"
				pred.Recommendation = "약 " + formatInt(int(daysLeft)) + "일 후 SLA 위반이 예상됩니다. 긴급 최적화가 필요합니다."
			} else if daysLeft < 30 {
				pred.Risk = "high"
				pred.Recommendation = "약 " + formatInt(int(daysLeft)) + "일 후 SLA 위반이 예상됩니다. 최적화 계획을 수립하세요."
			} else if daysLeft < 90 {
				pred.Risk = "medium"
				pred.Recommendation = "현재 추세가 지속되면 " + formatInt(int(daysLeft)) + "일 후 SLA에 도달합니다. 모니터링을 강화하세요."
			} else {
				pred.Risk = "low"
				pred.Recommendation = "현재 추세로는 SLA 여유가 충분합니다."
			}
		} else {
			pred.Risk = "low"
			pred.DaysUntilBreach = -1
			pred.Recommendation = "실행 시간이 안정적이거나 감소 추세입니다."
		}
		result.SLAPrediction = pred
	}

	return result
}

// ── math helpers ─────────────────────────────────────────────────────────────

func linearRegression(x, y []float64) (slope, intercept, r2 float64) {
	n := float64(len(x))
	if n < 2 {
		return 0, avg(y), 0
	}

	var sumX, sumY, sumXY, sumX2 float64
	for i := range x {
		sumX += x[i]
		sumY += y[i]
		sumXY += x[i] * y[i]
		sumX2 += x[i] * x[i]
	}

	denom := n*sumX2 - sumX*sumX
	if denom == 0 {
		return 0, sumY / n, 0
	}

	slope = (n*sumXY - sumX*sumY) / denom
	intercept = (sumY - slope*sumX) / n

	// R² calculation.
	meanY := sumY / n
	var ssTot, ssRes float64
	for i := range x {
		predicted := slope*x[i] + intercept
		ssRes += (y[i] - predicted) * (y[i] - predicted)
		ssTot += (y[i] - meanY) * (y[i] - meanY)
	}
	if ssTot > 0 {
		r2 = 1 - ssRes/ssTot
	}
	return
}

func pearsonCorrelation(x, y []float64) float64 {
	n := len(x)
	if n < 3 || len(y) != n {
		return 0
	}

	meanX, meanY := avg(x), avg(y)
	var sumXY, sumX2, sumY2 float64
	for i := range x {
		dx := x[i] - meanX
		dy := y[i] - meanY
		sumXY += dx * dy
		sumX2 += dx * dx
		sumY2 += dy * dy
	}
	denom := math.Sqrt(sumX2 * sumY2)
	if denom == 0 {
		return 0
	}
	return sumXY / denom
}

func avg(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	var s float64
	for _, v := range vals {
		s += v
	}
	return s / float64(len(vals))
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
