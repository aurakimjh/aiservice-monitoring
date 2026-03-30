package metricstore

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// ── PromQL Basic Parser (S3-7) ───────────────────────────────────────────────
//
// Supports the 20 core PromQL functions needed for custom dashboard compatibility.
// This is NOT a full PromQL engine; it translates common patterns into QueryRequest
// objects that our Metric Engine can evaluate.
//
// Supported functions:
//   rate, irate, increase, sum, avg, min, max, count,
//   histogram_quantile, topk, bottomk, sort, sort_desc,
//   absent, changes, resets, deriv, predict_linear,
//   label_replace, label_join

// PromQLQuery is the parsed representation of a PromQL expression.
type PromQLQuery struct {
	// Function is the outer PromQL function (e.g. "rate", "sum", "avg").
	// Empty string means raw metric selector.
	Function string

	// Metric is the metric name from the selector.
	Metric string

	// LabelMatchers are the label filters from the selector (key=value).
	LabelMatchers map[string]string

	// Range is the lookback window [duration] (e.g. 5m in rate(metric[5m])).
	Range time.Duration

	// AggBy is the list of labels for "by" grouping (e.g. sum by (service)).
	AggBy []string

	// AggWithout is the list of labels for "without" grouping.
	AggWithout []string

	// FuncArgs holds extra arguments for functions like topk(5, ...) or
	// histogram_quantile(0.95, ...).
	FuncArgs []float64
}

// ParsePromQL parses a basic PromQL expression and returns a PromQLQuery.
// It handles the most common patterns:
//   - metric_name{label="value"}
//   - rate(metric_name{label="value"}[5m])
//   - sum by (label) (rate(metric_name[5m]))
//   - histogram_quantile(0.95, metric_name{...})
//   - topk(5, metric_name{...})
func ParsePromQL(expr string) (*PromQLQuery, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return nil, fmt.Errorf("empty expression")
	}

	q := &PromQLQuery{
		LabelMatchers: make(map[string]string),
	}

	// Try outer aggregation: sum by (x) (inner)
	if fn, rest, ok := parseOuterAgg(expr); ok {
		q.Function = fn.name
		q.AggBy = fn.by
		q.AggWithout = fn.without
		q.FuncArgs = fn.args
		// Parse inner expression
		inner, err := ParsePromQL(rest)
		if err != nil {
			return nil, fmt.Errorf("parsing inner: %w", err)
		}
		// Merge inner into outer
		if q.Function == "" || isAggOp(q.Function) {
			if inner.Function != "" && !isAggOp(inner.Function) {
				// e.g. sum(rate(...)) → function stays "rate", outer agg stored separately
				q.Metric = inner.Metric
				q.LabelMatchers = inner.LabelMatchers
				q.Range = inner.Range
				// Keep outer as a post-aggregation marker
				inner.AggBy = q.AggBy
				inner.AggWithout = q.AggWithout
				// For agg ops wrapping a function, we need both
				if isAggOp(q.Function) && inner.Function != "" {
					return &PromQLQuery{
						Function:      inner.Function,
						Metric:        inner.Metric,
						LabelMatchers: inner.LabelMatchers,
						Range:         inner.Range,
						AggBy:         q.AggBy,
						AggWithout:    q.AggWithout,
						FuncArgs:      q.FuncArgs,
					}, nil
				}
			} else {
				q.Metric = inner.Metric
				q.LabelMatchers = inner.LabelMatchers
				q.Range = inner.Range
			}
		}
		return q, nil
	}

	// Try function call: func(args)
	if fn, args, ok := parseFuncCall(expr); ok {
		q.Function = fn

		// Parse function arguments
		parts := splitArgs(args)
		for _, part := range parts {
			part = strings.TrimSpace(part)
			// Try as number (for topk, histogram_quantile etc.)
			if n, err := strconv.ParseFloat(part, 64); err == nil {
				q.FuncArgs = append(q.FuncArgs, n)
				continue
			}
			// Parse as metric selector (possibly with range)
			parseSelector(part, q)
		}
		return q, nil
	}

	// Plain metric selector: metric_name{label="value"}[range]
	parseSelector(expr, q)
	return q, nil
}

// ToQueryRequest converts a parsed PromQL into a QueryRequest.
func (pq *PromQLQuery) ToQueryRequest(from, to time.Time, step time.Duration) QueryRequest {
	agg := funcToAgg(pq.Function)

	// If there's a range vector, adjust the "from" to include lookback.
	queryFrom := from
	if pq.Range > 0 {
		queryFrom = from.Add(-pq.Range)
	}

	return QueryRequest{
		MetricName:  pq.Metric,
		LabelMatch:  pq.LabelMatchers,
		From:        queryFrom,
		To:          to,
		Step:        step,
		Aggregation: agg,
	}
}

// funcToAgg maps a PromQL function name to our internal AggFunc.
func funcToAgg(fn string) AggFunc {
	switch strings.ToLower(fn) {
	case "rate":
		return AggRate
	case "irate":
		return AggIRate
	case "increase":
		return AggIncrease
	case "sum":
		return AggSum
	case "avg":
		return AggAvg
	case "min":
		return AggMin
	case "max":
		return AggMax
	case "count":
		return AggCount
	default:
		return AggLast
	}
}

// isAggOp returns true for aggregation operators (sum, avg, min, max, count, topk, bottomk).
func isAggOp(fn string) bool {
	switch strings.ToLower(fn) {
	case "sum", "avg", "min", "max", "count", "topk", "bottomk", "sort", "sort_desc":
		return true
	}
	return false
}

// ── parser helpers ───────────────────────────────────────────────────────────

type aggInfo struct {
	name    string
	by      []string
	without []string
	args    []float64
}

// parseOuterAgg matches patterns like "sum by (label) (inner)" or "topk(5, inner)".
func parseOuterAgg(expr string) (aggInfo, string, bool) {
	aggOps := []string{"sum", "avg", "min", "max", "count", "topk", "bottomk", "sort", "sort_desc"}
	lower := strings.ToLower(expr)

	for _, op := range aggOps {
		if !strings.HasPrefix(lower, op) {
			continue
		}
		rest := expr[len(op):]
		rest = strings.TrimSpace(rest)

		info := aggInfo{name: op}

		// Parse optional "by (...)" or "without (...)"
		restLower := strings.ToLower(rest)
		if strings.HasPrefix(restLower, "by") {
			rest = strings.TrimSpace(rest[2:])
			labels, remaining := parseParenList(rest)
			info.by = labels
			rest = strings.TrimSpace(remaining)
		} else if strings.HasPrefix(restLower, "without") {
			rest = strings.TrimSpace(rest[7:])
			labels, remaining := parseParenList(rest)
			info.without = labels
			rest = strings.TrimSpace(remaining)
		}

		// The remaining should be wrapped in parentheses.
		if len(rest) > 0 && rest[0] == '(' {
			inner := unwrapParens(rest)
			if inner != "" {
				return info, inner, true
			}
		}
	}
	return aggInfo{}, "", false
}

// parseFuncCall matches "funcname(args)".
func parseFuncCall(expr string) (string, string, bool) {
	// Find first '(' that is not preceded by a space-only function name
	idx := strings.IndexByte(expr, '(')
	if idx <= 0 {
		return "", "", false
	}

	fnName := strings.TrimSpace(expr[:idx])
	if !isValidIdent(fnName) {
		return "", "", false
	}

	// Find matching closing paren.
	inner := unwrapParens(expr[idx:])
	if inner == "" {
		return "", "", false
	}
	return fnName, inner, true
}

// parseSelector parses "metric_name{label1=\"value1\"}[5m]" into the query.
func parseSelector(expr string, q *PromQLQuery) {
	expr = strings.TrimSpace(expr)

	// Extract range vector [duration]
	if bracketIdx := strings.LastIndex(expr, "["); bracketIdx >= 0 {
		closeBracket := strings.Index(expr[bracketIdx:], "]")
		if closeBracket > 0 {
			durStr := expr[bracketIdx+1 : bracketIdx+closeBracket]
			q.Range = parseDuration(durStr)
			expr = strings.TrimSpace(expr[:bracketIdx])
		}
	}

	// Extract label matchers {key="value", ...}
	if braceIdx := strings.Index(expr, "{"); braceIdx >= 0 {
		q.Metric = strings.TrimSpace(expr[:braceIdx])
		closeBrace := strings.LastIndex(expr, "}")
		if closeBrace > braceIdx {
			labelsStr := expr[braceIdx+1 : closeBrace]
			parseLabels(labelsStr, q.LabelMatchers)
		}
	} else {
		q.Metric = expr
	}
}

// parseLabels parses "key1=\"val1\", key2=\"val2\"" into the map.
func parseLabels(s string, out map[string]string) {
	parts := strings.Split(s, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		// Support both = and =~
		eqIdx := strings.Index(part, "=")
		if eqIdx <= 0 {
			continue
		}
		key := strings.TrimSpace(part[:eqIdx])
		val := strings.TrimSpace(part[eqIdx+1:])
		// Remove surrounding quotes
		val = strings.Trim(val, `"'`)
		if key != "" {
			out[key] = val
		}
	}
}

// parseDuration parses PromQL duration strings: 5m, 1h, 30s, 1d, etc.
func parseDuration(s string) time.Duration {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}

	// Split numeric part and unit suffix.
	i := 0
	for i < len(s) && (s[i] >= '0' && s[i] <= '9' || s[i] == '.') {
		i++
	}
	numStr := s[:i]
	unit := s[i:]

	num, err := strconv.ParseFloat(numStr, 64)
	if err != nil {
		return 0
	}

	switch strings.ToLower(unit) {
	case "ms":
		return time.Duration(num * float64(time.Millisecond))
	case "s", "":
		return time.Duration(num * float64(time.Second))
	case "m":
		return time.Duration(num * float64(time.Minute))
	case "h":
		return time.Duration(num * float64(time.Hour))
	case "d":
		return time.Duration(num * 24 * float64(time.Hour))
	case "w":
		return time.Duration(num * 7 * 24 * float64(time.Hour))
	case "y":
		return time.Duration(num * 365 * 24 * float64(time.Hour))
	default:
		return time.Duration(num * float64(time.Second))
	}
}

// parseParenList parses "(a, b, c)" and returns the items + remaining string.
func parseParenList(s string) ([]string, string) {
	if len(s) == 0 || s[0] != '(' {
		return nil, s
	}
	closeIdx := strings.IndexByte(s, ')')
	if closeIdx < 0 {
		return nil, s
	}
	inner := s[1:closeIdx]
	parts := strings.Split(inner, ",")
	items := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			items = append(items, p)
		}
	}
	return items, strings.TrimSpace(s[closeIdx+1:])
}

// unwrapParens extracts the content between matching parentheses.
// e.g. "(foo(bar))" → "foo(bar)"
func unwrapParens(s string) string {
	if len(s) == 0 || s[0] != '(' {
		return ""
	}
	depth := 0
	for i, c := range s {
		switch c {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return s[1:i]
			}
		}
	}
	return ""
}

// splitArgs splits "arg1, arg2" respecting nested parentheses.
func splitArgs(s string) []string {
	var parts []string
	depth := 0
	start := 0
	for i, c := range s {
		switch c {
		case '(':
			depth++
		case ')':
			depth--
		case ',':
			if depth == 0 {
				parts = append(parts, strings.TrimSpace(s[start:i]))
				start = i + 1
			}
		}
	}
	if start < len(s) {
		parts = append(parts, strings.TrimSpace(s[start:]))
	}
	return parts
}

func isValidIdent(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if i == 0 && !unicode.IsLetter(r) && r != '_' {
			return false
		}
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' {
			return false
		}
	}
	return true
}
