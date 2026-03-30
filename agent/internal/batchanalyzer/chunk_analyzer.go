package batchanalyzer

import "math"

// ── WS-3.2: 청크/병렬화 분석 ─────────────────────────────────────────────────

// ChunkMetric represents throughput at a specific chunk size.
type ChunkMetric struct {
	ChunkSize    int     `json:"chunkSize"`
	Throughput   float64 `json:"throughput"`   // items/sec
	MemoryMB     float64 `json:"memoryMb"`
	DurationMS   float64 `json:"durationMs"`
}

// StepDependency represents a batch step and its dependencies.
type StepDependency struct {
	StepName     string   `json:"stepName"`
	DurationMS   float64  `json:"durationMs"`
	DependsOn    []string `json:"dependsOn"`    // step names this step waits for
	CanParallel  bool     `json:"canParallel"`  // true if no dependencies
}

// ChunkAnalysisResult holds chunk/parallelization analysis findings.
type ChunkAnalysisResult struct {
	// 39-2-1: Chunk size → throughput curve.
	ChunkCurve       []ChunkMetric `json:"chunkCurve"`
	// 39-2-2: Optimal chunk size recommendation.
	OptimalChunkSize int           `json:"optimalChunkSize"`
	OptimalReason    string        `json:"optimalReason"`
	// 39-2-3: Step dependency analysis.
	Steps            []StepDependency `json:"steps"`
	ParallelGroups   [][]string    `json:"parallelGroups"` // groups that can run in parallel
	// 39-2-4: Data partitioning recommendation.
	PartitionKey     string        `json:"partitionKey"`
	PartitionCount   int           `json:"partitionCount"`
	PartitionReason  string        `json:"partitionReason"`
	// 39-2-5: Worker count optimization.
	CurrentWorkers   int           `json:"currentWorkers"`
	OptimalWorkers   int           `json:"optimalWorkers"`
	WorkerReason     string        `json:"workerReason"`
}

// AnalyzeChunk performs chunk/parallelization analysis.
func AnalyzeChunk(
	chunkMetrics []ChunkMetric,
	steps []StepDependency,
	memLimitMB float64,
	cpuCores int,
) *ChunkAnalysisResult {
	result := &ChunkAnalysisResult{
		ChunkCurve: chunkMetrics,
		Steps:      steps,
	}

	// 39-2-1 + 39-2-2: Find optimal chunk size (max throughput within memory limit).
	if len(chunkMetrics) > 0 {
		bestIdx := 0
		bestThroughput := 0.0
		for i, m := range chunkMetrics {
			if m.MemoryMB <= memLimitMB && m.Throughput > bestThroughput {
				bestThroughput = m.Throughput
				bestIdx = i
			}
		}
		result.OptimalChunkSize = chunkMetrics[bestIdx].ChunkSize
		result.OptimalReason = "메모리 제한 내에서 최대 처리량을 달성하는 청크 크기입니다."

		// Check if current is suboptimal.
		if len(chunkMetrics) > 1 {
			current := chunkMetrics[0]
			optimal := chunkMetrics[bestIdx]
			if optimal.Throughput > current.Throughput*1.2 {
				result.OptimalReason += " 현재 대비 약 " +
					formatPct((optimal.Throughput-current.Throughput)/current.Throughput*100) +
					"% 처리량 향상이 가능합니다."
			}
		}
	}

	// 39-2-3: Step dependency → parallelization groups.
	if len(steps) > 0 {
		depSet := make(map[string]map[string]bool)
		for _, s := range steps {
			depSet[s.StepName] = make(map[string]bool)
			for _, d := range s.DependsOn {
				depSet[s.StepName][d] = true
			}
		}

		// Find independent groups (steps with no mutual dependencies).
		var groups [][]string
		assigned := make(map[string]bool)
		for _, s := range steps {
			if assigned[s.StepName] {
				continue
			}
			if len(s.DependsOn) == 0 {
				group := []string{s.StepName}
				// Find other steps that also have no deps and don't depend on each other.
				for _, other := range steps {
					if other.StepName == s.StepName || assigned[other.StepName] {
						continue
					}
					if len(other.DependsOn) == 0 {
						group = append(group, other.StepName)
						assigned[other.StepName] = true
					}
				}
				groups = append(groups, group)
				assigned[s.StepName] = true
			}
		}
		result.ParallelGroups = groups

		// Mark parallel-eligible steps.
		for i := range result.Steps {
			result.Steps[i].CanParallel = len(result.Steps[i].DependsOn) == 0
		}
	}

	// 39-2-4: Partitioning recommendation.
	result.PartitionKey = "date"
	result.PartitionCount = cpuCores
	if cpuCores > 8 {
		result.PartitionCount = 8
	}
	result.PartitionReason = "날짜 기반 파티셔닝으로 " +
		formatInt(result.PartitionCount) + "개 워커에 균등 분배를 권장합니다."

	// 39-2-5: Worker count optimization.
	result.CurrentWorkers = 1
	result.OptimalWorkers = int(math.Min(float64(cpuCores), 8))
	if result.OptimalWorkers < 2 {
		result.OptimalWorkers = 2
	}
	result.WorkerReason = "CPU 코어 수(" + formatInt(cpuCores) +
		") 기반 최적 워커 수입니다. IO-bound 배치는 코어 수의 2배까지 권장합니다."

	return result
}

func formatPct(v float64) string {
	return formatFloat(math.Round(v*10) / 10)
}

func formatInt(v int) string {
	s := ""
	for v > 0 {
		s = string(rune('0'+v%10)) + s
		v /= 10
	}
	if s == "" {
		return "0"
	}
	return s
}

func formatFloat(v float64) string {
	if v == float64(int64(v)) {
		return formatInt(int(v))
	}
	// Simple float formatting.
	intPart := int(v)
	fracPart := int((v - float64(intPart)) * 10)
	if fracPart < 0 {
		fracPart = -fracPart
	}
	return formatInt(intPart) + "." + formatInt(fracPart)
}
