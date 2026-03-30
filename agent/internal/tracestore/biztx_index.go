package tracestore

import (
	"sort"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// ── E4-1/E4-2/E4-3: Business Transaction Auto-Aggregation ───────────────────
//
// A Business Transaction is a logical grouping of traces that share the same
// entry point: (entry_service, entry_operation).
//
// Examples:
//   - "api-gateway / POST /api/v1/chat"     → chat transaction
//   - "api-gateway / GET /api/v1/search"     → search transaction
//   - "batch-runner / nightly-reconcile"     → batch transaction
//
// The index automatically aggregates metrics per group from root spans:
//   - throughput (RPM), error rate, P50/P95/P99 latency
//   - SLO tracking (target latency, target error rate, compliance %)

// BizTxInfo represents a Business Transaction group.
type BizTxInfo struct {
	ID             string    `json:"id"`
	EntryService   string    `json:"entryService"`
	EntryOperation string    `json:"entryOperation"`
	DisplayName    string    `json:"displayName,omitempty"` // user-defined alias
	FirstSeen      time.Time `json:"firstSeen"`
	LastSeen       time.Time `json:"lastSeen"`

	// Aggregated metrics (rolling window).
	TotalCount int64   `json:"totalCount"`
	ErrorCount int64   `json:"errorCount"`
	ErrorRate  float64 `json:"errorRate"` // 0-100%

	// Latency stats (from recent samples).
	AvgLatencyMS float64 `json:"avgLatencyMs"`
	P50LatencyMS float64 `json:"p50LatencyMs"`
	P95LatencyMS float64 `json:"p95LatencyMs"`
	P99LatencyMS float64 `json:"p99LatencyMs"`

	// E4-3: SLO tracking.
	SLO *BizTxSLO `json:"slo,omitempty"`
}

// BizTxSLO defines the SLO target for a business transaction.
type BizTxSLO struct {
	TargetLatencyMS float64 `json:"targetLatencyMs"` // e.g. 500ms
	TargetErrorRate float64 `json:"targetErrorRate"` // e.g. 1.0 (%)
	WindowMinutes   int     `json:"windowMinutes"`   // evaluation window (e.g. 60)
	CompliancePct   float64 `json:"compliancePct"`   // current compliance 0-100%
	Breached        bool    `json:"breached"`
}

// BizTxIndex maintains a live catalogue of business transactions from trace root spans.
type BizTxIndex struct {
	mu sync.RWMutex

	txns map[string]*bizTxState // key: service/operation

	// User-defined SLO targets.
	sloTargets map[string]*BizTxSLO // key: biztx ID
}

type bizTxState struct {
	info    BizTxInfo
	// Ring buffer of recent latencies for percentile calculation.
	latencies []float64
	latIdx    int
	latFull   bool
}

const bizTxLatencyRingSize = 1000

// NewBizTxIndex creates a ready-to-use index.
func NewBizTxIndex() *BizTxIndex {
	return &BizTxIndex{
		txns:       make(map[string]*bizTxState),
		sloTargets: make(map[string]*BizTxSLO),
	}
}

// Ingest processes a batch of spans and extracts business transactions
// from root spans (spans with no parent).
func (bi *BizTxIndex) Ingest(spans []*otlp.Span) {
	if len(spans) == 0 {
		return
	}

	bi.mu.Lock()
	defer bi.mu.Unlock()

	now := time.Now().UTC()

	for _, sp := range spans {
		// Only process root spans (entry points).
		if sp.ParentID != "" {
			continue
		}

		service := sp.ServiceName
		operation := sp.Name
		if service == "" || operation == "" {
			continue
		}

		key := service + "/" + operation
		durationMS := float64(sp.DurationNano) / 1e6

		state, exists := bi.txns[key]
		if !exists {
			state = &bizTxState{
				info: BizTxInfo{
					ID:             "biztx-" + sanitizeBizTxID(key),
					EntryService:   service,
					EntryOperation: operation,
					FirstSeen:      now,
				},
				latencies: make([]float64, bizTxLatencyRingSize),
			}
			bi.txns[key] = state
		}

		state.info.LastSeen = now
		state.info.TotalCount++
		if sp.StatusCode == otlp.StatusError {
			state.info.ErrorCount++
		}

		// Update latency ring buffer.
		state.latencies[state.latIdx] = durationMS
		state.latIdx = (state.latIdx + 1) % bizTxLatencyRingSize
		if state.latIdx == 0 {
			state.latFull = true
		}

		// Recompute stats.
		bi.recomputeStats(state)

		// E4-3: Evaluate SLO if target is set.
		if slo, ok := bi.sloTargets[state.info.ID]; ok {
			state.info.SLO = bi.evaluateSLO(state, slo)
		}
	}
}

func (bi *BizTxIndex) recomputeStats(state *bizTxState) {
	n := bizTxLatencyRingSize
	if !state.latFull {
		n = state.latIdx
	}
	if n == 0 {
		return
	}

	// Copy and sort for percentile.
	sorted := make([]float64, n)
	if state.latFull {
		copy(sorted, state.latencies[:])
	} else {
		copy(sorted, state.latencies[:n])
	}
	sort.Float64s(sorted)

	// Avg.
	var sum float64
	for _, v := range sorted {
		sum += v
	}
	state.info.AvgLatencyMS = sum / float64(n)

	// Percentiles.
	state.info.P50LatencyMS = percentileOf(sorted, 0.50)
	state.info.P95LatencyMS = percentileOf(sorted, 0.95)
	state.info.P99LatencyMS = percentileOf(sorted, 0.99)

	// Error rate.
	if state.info.TotalCount > 0 {
		state.info.ErrorRate = float64(state.info.ErrorCount) / float64(state.info.TotalCount) * 100
	}
}

func (bi *BizTxIndex) evaluateSLO(state *bizTxState, target *BizTxSLO) *BizTxSLO {
	slo := &BizTxSLO{
		TargetLatencyMS: target.TargetLatencyMS,
		TargetErrorRate: target.TargetErrorRate,
		WindowMinutes:   target.WindowMinutes,
	}

	// Compliance: % of requests within target latency.
	n := bizTxLatencyRingSize
	if !state.latFull {
		n = state.latIdx
	}
	if n == 0 {
		slo.CompliancePct = 100
		return slo
	}

	withinTarget := 0
	for i := 0; i < n; i++ {
		if state.latencies[i] <= target.TargetLatencyMS {
			withinTarget++
		}
	}
	slo.CompliancePct = float64(withinTarget) / float64(n) * 100

	// Breach detection.
	slo.Breached = slo.CompliancePct < 99.0 || state.info.ErrorRate > target.TargetErrorRate

	return slo
}

// ── Query methods ────────────────────────────────────────────────────────────

// List returns all business transactions sorted by total count (desc).
func (bi *BizTxIndex) List() []*BizTxInfo {
	bi.mu.RLock()
	defer bi.mu.RUnlock()

	out := make([]*BizTxInfo, 0, len(bi.txns))
	for _, state := range bi.txns {
		cp := state.info
		if state.info.SLO != nil {
			sloCp := *state.info.SLO
			cp.SLO = &sloCp
		}
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TotalCount > out[j].TotalCount })
	return out
}

// Get returns a single business transaction by ID.
func (bi *BizTxIndex) Get(id string) *BizTxInfo {
	bi.mu.RLock()
	defer bi.mu.RUnlock()

	for _, state := range bi.txns {
		if state.info.ID == id {
			cp := state.info
			if state.info.SLO != nil {
				sloCp := *state.info.SLO
				cp.SLO = &sloCp
			}
			return &cp
		}
	}
	return nil
}

// SetSLO sets the SLO target for a business transaction.
func (bi *BizTxIndex) SetSLO(biztxID string, target BizTxSLO) {
	bi.mu.Lock()
	defer bi.mu.Unlock()
	bi.sloTargets[biztxID] = &target
}

// RemoveSLO removes the SLO target for a business transaction.
func (bi *BizTxIndex) RemoveSLO(biztxID string) {
	bi.mu.Lock()
	defer bi.mu.Unlock()
	delete(bi.sloTargets, biztxID)
}

// ── helpers ──────────────────────────────────────────────────────────────────

func percentileOf(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	rank := p * float64(len(sorted)-1)
	lower := int(rank)
	upper := lower + 1
	if upper >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := rank - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

func sanitizeBizTxID(s string) string {
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' {
			b = append(b, c)
		} else {
			b = append(b, '-')
		}
	}
	return string(b)
}
