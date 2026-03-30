// Package metricstore implements the Metric Engine (WS-1.3).
// It provides a three-tier storage architecture:
//   - Hot tier  : sharded in-memory time-series ring (last 4 h)
//   - Warm tier : SQLite with label index (7–90 day rolling window)
//   - Cold tier : S3 NDJSON.gz archives (1 year+)
package metricstore

import (
	"sort"
	"strings"
	"time"
)

// ── Series / Sample ──────────────────────────────────────────────────────────

// Sample is a single (timestamp, value) pair in a time series.
type Sample struct {
	T time.Time `json:"t"`
	V float64   `json:"v"`
}

// Series represents a unique time series identified by metric name + label set.
type Series struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels"`
	Key    string            `json:"-"` // canonical key: name{k1="v1",k2="v2"}
}

// SeriesKey builds a canonical, deterministic key for a (name, labels) pair.
// Format: metricName{key1="val1",key2="val2"} — keys sorted alphabetically.
func SeriesKey(name string, labels map[string]string) string {
	if len(labels) == 0 {
		return name + "{}"
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString(name)
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(k)
		b.WriteString(`="`)
		b.WriteString(labels[k])
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}

// ── Query types ──────────────────────────────────────────────────────────────

// QueryRequest encapsulates a metric query.
type QueryRequest struct {
	MetricName    string            `json:"metric"`              // required
	LabelMatch   map[string]string `json:"labels,omitempty"`    // exact match filters
	From         time.Time         `json:"from"`
	To           time.Time         `json:"to"`
	Step         time.Duration     `json:"step"`                // aggregation step (e.g. 15s, 1m)
	Aggregation  AggFunc           `json:"aggregation"`         // rate, sum, avg, max, min, p50, p95, p99
	Limit        int               `json:"limit,omitempty"`     // max series returned (0 = unlimited)
}

// AggFunc is the aggregation function applied over each step window.
type AggFunc string

const (
	AggLast       AggFunc = "last"
	AggAvg        AggFunc = "avg"
	AggSum        AggFunc = "sum"
	AggMin        AggFunc = "min"
	AggMax        AggFunc = "max"
	AggCount      AggFunc = "count"
	AggRate       AggFunc = "rate"
	AggIRate      AggFunc = "irate"
	AggIncrease   AggFunc = "increase"
	AggP50        AggFunc = "p50"
	AggP90        AggFunc = "p90"
	AggP95        AggFunc = "p95"
	AggP99        AggFunc = "p99"
)

// QueryResult is one series in the response.
type QueryResult struct {
	Series  Series   `json:"series"`
	Samples []Sample `json:"samples"`
}

// ── Alert types ──────────────────────────────────────────────────────────────

// AlertRule defines a metric threshold alert.
type AlertRule struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Metric      string        `json:"metric"`       // metric name
	Labels      map[string]string `json:"labels,omitempty"`
	Condition   AlertCondition `json:"condition"`
	Threshold   float64       `json:"threshold"`
	Duration    time.Duration `json:"duration"`      // how long condition must hold
	Severity    string        `json:"severity"`      // critical, warning, info
	Annotations map[string]string `json:"annotations,omitempty"`
	Enabled     bool          `json:"enabled"`
}

// AlertCondition is the comparison operator.
type AlertCondition string

const (
	CondGT AlertCondition = ">"
	CondGE AlertCondition = ">="
	CondLT AlertCondition = "<"
	CondLE AlertCondition = "<="
	CondEQ AlertCondition = "=="
	CondNE AlertCondition = "!="
)

// AlertState tracks the current firing state of a rule.
type AlertState struct {
	RuleID     string    `json:"ruleId"`
	Firing     bool      `json:"firing"`
	Value      float64   `json:"value"`
	Since      time.Time `json:"since,omitempty"`
	LastEval   time.Time `json:"lastEval"`
}

// ── Stats ────────────────────────────────────────────────────────────────────

// StoreStats holds runtime statistics.
type StoreStats struct {
	HotSeriesCount  int    `json:"hotSeriesCount"`
	HotSampleCount  int64  `json:"hotSampleCount"`
	TotalIngested   uint64 `json:"totalIngested"`
	WarmDayFiles    int    `json:"warmDayFiles"`
	AlertRuleCount  int    `json:"alertRuleCount"`
	AlertFiringCount int   `json:"alertFiringCount"`
}
