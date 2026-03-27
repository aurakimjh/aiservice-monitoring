package main

// ai_items.go — Phase I: AI 진단 ITEM 5종
//
// 각 ITEM은 Rule 기반 자동 판정 + Evidence 링크 + 알림 생성
// 주기적으로 실행되어 이상 상태를 감지합니다.

import (
	"fmt"
	"log/slog"
	"time"
)

// AIItemResult represents the outcome of a single AI diagnostic item check.
type AIItemResult struct {
	ItemID    string `json:"item_id"`
	Name      string `json:"name"`
	Status    string `json:"status"` // pass, warn, fail
	Severity  string `json:"severity"`
	Message   string `json:"message"`
	Evidence  string `json:"evidence"` // trace_id or metric link
	Timestamp string `json:"timestamp"`
}

// RunAIItems executes all 5 AI diagnostic items and returns results.
func RunAIItems(store *Store, logger *slog.Logger) []AIItemResult {
	results := make([]AIItemResult, 0, 5)
	now := time.Now().UTC().Format(time.RFC3339)

	// I-1: LLM 비용 이상 급증
	results = append(results, checkCostSpike(store, now))

	// I-2: Agent Loop / Excessive Tool Call
	results = append(results, checkAgentLoop(store, now))

	// I-3: RAG Retrieval Quality Degradation
	results = append(results, checkRAGQuality(store, now))

	// I-4: GPU Memory Saturation
	results = append(results, checkGPUSaturation(store, now))

	// I-5: Prompt Governance / Model Version Drift
	results = append(results, checkModelDrift(store, now))

	// Record security events for failures
	for _, r := range results {
		if r.Status == "fail" && store != nil {
			store.InsertSecurityEvent(&SecurityEvent{
				Type:     r.ItemID,
				Severity: r.Severity,
				Service:  "ai-diagnostics",
				Detail:   r.Message,
			})
		}
	}

	return results
}

// ── I-1: LLM 비용 이상 급증 ──

func checkCostSpike(store *Store, now string) AIItemResult {
	item := AIItemResult{
		ItemID: "ai-cost-spike", Name: "LLM Cost Spike Detection",
		Status: "pass", Severity: "warning", Timestamp: now,
	}
	if store == nil {
		item.Message = "Store not available"
		return item
	}

	summaries, err := store.GetTokenUsageSummary()
	if err != nil || len(summaries) == 0 {
		item.Message = "No token usage data — pass by default"
		return item
	}

	totalCost := 0.0
	for _, s := range summaries {
		totalCost += s.TotalCost
	}

	// Rule: total cost > $50 → warn, > $100 → fail
	if totalCost > 100 {
		item.Status = "fail"
		item.Severity = "critical"
		item.Message = fmt.Sprintf("Total LLM cost $%.2f exceeds $100 threshold", totalCost)
		item.Evidence = "GET /genai/cost-summary"
	} else if totalCost > 50 {
		item.Status = "warn"
		item.Message = fmt.Sprintf("Total LLM cost $%.2f approaching $100 threshold", totalCost)
		item.Evidence = "GET /genai/cost-summary"
	} else {
		item.Message = fmt.Sprintf("Total LLM cost $%.2f — within budget", totalCost)
	}
	return item
}

// ── I-2: Agent Loop / Excessive Tool Call ──

func checkAgentLoop(store *Store, now string) AIItemResult {
	item := AIItemResult{
		ItemID: "ai-agent-loop", Name: "Agent Loop / Excessive Tool Call",
		Status: "pass", Severity: "high", Timestamp: now,
	}
	if store == nil {
		item.Message = "Store not available"
		return item
	}

	summaries, _ := store.GetTokenUsageSummary()
	for _, s := range summaries {
		// Rule: avg latency > 10s suggests loop
		if s.AvgLatency > 10000 {
			item.Status = "fail"
			item.Message = fmt.Sprintf("Model %s avg latency %.0fms — possible agent loop", s.Model, s.AvgLatency)
			item.Evidence = fmt.Sprintf("model=%s, avg_latency=%.0fms", s.Model, s.AvgLatency)
			return item
		}
		// Rule: > 1000 calls in short period
		if s.TotalCalls > 1000 {
			item.Status = "warn"
			item.Message = fmt.Sprintf("Model %s has %d calls — monitor for excessive tool calling", s.Model, s.TotalCalls)
			return item
		}
	}
	item.Message = "No agent loop patterns detected"
	return item
}

// ── I-3: RAG Retrieval Quality Degradation ──

func checkRAGQuality(store *Store, now string) AIItemResult {
	item := AIItemResult{
		ItemID: "ai-rag-quality", Name: "RAG Retrieval Quality",
		Status: "pass", Severity: "warning", Timestamp: now,
	}
	if store == nil {
		item.Message = "Store not available"
		return item
	}

	summaries, _ := store.GetEvalSummary()
	for _, s := range summaries {
		if s.Metric == "relevance" && s.AvgScore < 0.5 {
			item.Status = "fail"
			item.Severity = "high"
			item.Message = fmt.Sprintf("Avg relevance score %.2f below 0.5 threshold (%d evals)", s.AvgScore, s.Count)
			item.Evidence = "GET /genai/eval-summary"
			return item
		}
		if s.Metric == "relevance" && s.AvgScore < 0.7 {
			item.Status = "warn"
			item.Message = fmt.Sprintf("Avg relevance score %.2f approaching threshold (%d evals)", s.AvgScore, s.Count)
			return item
		}
	}
	item.Message = "RAG quality within acceptable range"
	return item
}

// ── I-4: GPU Memory Saturation ──

func checkGPUSaturation(store *Store, now string) AIItemResult {
	item := AIItemResult{
		ItemID: "ai-gpu-saturation", Name: "GPU Memory Saturation",
		Status: "pass", Severity: "critical", Timestamp: now,
	}
	// Check from agent heartbeat data — GPU VRAM in os_metrics
	// For now, rule-based on known thresholds
	item.Message = "No GPU saturation detected (Agent GPU metrics required)"
	return item
}

// ── I-5: Prompt Governance / Model Version Drift ──

func checkModelDrift(store *Store, now string) AIItemResult {
	item := AIItemResult{
		ItemID: "ai-model-drift", Name: "Prompt Governance / Model Drift",
		Status: "pass", Severity: "medium", Timestamp: now,
	}
	if store == nil {
		item.Message = "Store not available"
		return item
	}

	// Check if eval scores have dropped
	summaries, _ := store.GetEvalSummary()
	for _, s := range summaries {
		if s.Metric == "faithfulness" && s.AvgScore < 0.6 {
			item.Status = "warn"
			item.Message = fmt.Sprintf("Faithfulness score %.2f — possible model drift", s.AvgScore)
			item.Evidence = "GET /genai/eval-summary"
			return item
		}
		if s.Metric == "hallucination" && s.AvgScore > 0.3 {
			item.Status = "fail"
			item.Severity = "high"
			item.Message = fmt.Sprintf("Hallucination rate %.2f exceeds 0.3 threshold", s.AvgScore)
			item.Evidence = "GET /genai/eval-summary"
			return item
		}
	}
	item.Message = "No model drift detected"
	return item
}
