package metricstore

import (
	"math"
	"sort"
	"time"
)

// ── Aggregation engine (S3-4) ────────────────────────────────────────────────

// Aggregate applies the requested aggregation function over raw samples,
// producing one output sample per step bucket.
func Aggregate(samples []Sample, from, to time.Time, step time.Duration, fn AggFunc) []Sample {
	if len(samples) == 0 || step <= 0 {
		return nil
	}

	// Build time buckets.
	bucketStart := from.Truncate(step)
	if bucketStart.Before(from) {
		bucketStart = bucketStart.Add(step)
	}
	numBuckets := int(to.Sub(bucketStart)/step) + 1
	if numBuckets <= 0 {
		numBuckets = 1
	}
	if numBuckets > 10_000 {
		numBuckets = 10_000 // safety cap
	}

	// Group samples into buckets.
	buckets := make([][]float64, numBuckets)
	for _, s := range samples {
		idx := int(s.T.Sub(bucketStart) / step)
		if idx < 0 {
			idx = 0
		}
		if idx >= numBuckets {
			idx = numBuckets - 1
		}
		buckets[idx] = append(buckets[idx], s.V)
	}

	out := make([]Sample, 0, numBuckets)
	for i, vals := range buckets {
		t := bucketStart.Add(time.Duration(i) * step)
		if len(vals) == 0 {
			continue // no data in this bucket; skip (NaN-free output)
		}
		v := applyAggFunc(fn, vals, step)
		out = append(out, Sample{T: t, V: v})
	}

	return out
}

// AggregateRate computes per-second rate over consecutive raw samples.
// This is needed for counter-type metrics where rate = delta(value)/delta(time).
func AggregateRate(samples []Sample, from, to time.Time, step time.Duration) []Sample {
	if len(samples) < 2 || step <= 0 {
		return nil
	}

	bucketStart := from.Truncate(step)
	if bucketStart.Before(from) {
		bucketStart = bucketStart.Add(step)
	}

	// Compute instantaneous rates between consecutive samples.
	type ratePoint struct {
		t time.Time
		v float64
	}
	rates := make([]ratePoint, 0, len(samples)-1)
	for i := 1; i < len(samples); i++ {
		dt := samples[i].T.Sub(samples[i-1].T).Seconds()
		if dt <= 0 {
			continue
		}
		dv := samples[i].V - samples[i-1].V
		if dv < 0 {
			dv = samples[i].V // counter reset: use current value
		}
		rates = append(rates, ratePoint{t: samples[i].T, v: dv / dt})
	}

	// Bucket the rates.
	numBuckets := int(to.Sub(bucketStart)/step) + 1
	if numBuckets <= 0 {
		numBuckets = 1
	}
	if numBuckets > 10_000 {
		numBuckets = 10_000
	}
	buckets := make([][]float64, numBuckets)
	for _, r := range rates {
		idx := int(r.t.Sub(bucketStart) / step)
		if idx < 0 {
			idx = 0
		}
		if idx >= numBuckets {
			idx = numBuckets - 1
		}
		buckets[idx] = append(buckets[idx], r.v)
	}

	out := make([]Sample, 0, numBuckets)
	for i, vals := range buckets {
		if len(vals) == 0 {
			continue
		}
		t := bucketStart.Add(time.Duration(i) * step)
		out = append(out, Sample{T: t, V: avg(vals)})
	}
	return out
}

// IRate computes the instantaneous rate: delta between the last two samples
// in each step bucket, divided by their time difference.
func IRate(samples []Sample, from, to time.Time, step time.Duration) []Sample {
	if len(samples) < 2 || step <= 0 {
		return nil
	}

	bucketStart := from.Truncate(step)
	if bucketStart.Before(from) {
		bucketStart = bucketStart.Add(step)
	}
	numBuckets := int(to.Sub(bucketStart)/step) + 1
	if numBuckets <= 0 || numBuckets > 10_000 {
		numBuckets = 1
	}

	// Collect last two samples per bucket.
	type pair struct{ prev, last *Sample }
	buckets := make([]pair, numBuckets)
	for i := range samples {
		idx := int(samples[i].T.Sub(bucketStart) / step)
		if idx < 0 || idx >= numBuckets {
			continue
		}
		if buckets[idx].last != nil {
			buckets[idx].prev = buckets[idx].last
		}
		s := samples[i]
		buckets[idx].last = &s
	}

	out := make([]Sample, 0, numBuckets)
	for i, p := range buckets {
		if p.prev == nil || p.last == nil {
			continue
		}
		dt := p.last.T.Sub(p.prev.T).Seconds()
		if dt <= 0 {
			continue
		}
		dv := p.last.V - p.prev.V
		if dv < 0 {
			dv = p.last.V
		}
		t := bucketStart.Add(time.Duration(i) * step)
		out = append(out, Sample{T: t, V: dv / dt})
	}
	return out
}

// applyAggFunc applies a simple aggregation function to a bucket of values.
func applyAggFunc(fn AggFunc, vals []float64, step time.Duration) float64 {
	switch fn {
	case AggAvg:
		return avg(vals)
	case AggSum:
		return sum(vals)
	case AggMin:
		return minVal(vals)
	case AggMax:
		return maxVal(vals)
	case AggCount:
		return float64(len(vals))
	case AggLast:
		return vals[len(vals)-1]
	case AggP50:
		return percentile(vals, 0.50)
	case AggP90:
		return percentile(vals, 0.90)
	case AggP95:
		return percentile(vals, 0.95)
	case AggP99:
		return percentile(vals, 0.99)
	case AggIncrease:
		if len(vals) < 2 {
			return 0
		}
		d := vals[len(vals)-1] - vals[0]
		if d < 0 {
			return vals[len(vals)-1] // counter reset
		}
		return d
	default:
		return avg(vals)
	}
}

// ── math helpers ─────────────────────────────────────────────────────────────

func avg(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	return sum(vals) / float64(len(vals))
}

func sum(vals []float64) float64 {
	var s float64
	for _, v := range vals {
		s += v
	}
	return s
}

func minVal(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	m := vals[0]
	for _, v := range vals[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

func maxVal(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	m := vals[0]
	for _, v := range vals[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

// percentile computes the p-th percentile (0–1) using linear interpolation.
func percentile(vals []float64, p float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	sorted := make([]float64, len(vals))
	copy(sorted, vals)
	sort.Float64s(sorted)

	if len(sorted) == 1 {
		return sorted[0]
	}

	rank := p * float64(len(sorted)-1)
	lower := int(math.Floor(rank))
	upper := lower + 1
	if upper >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := rank - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}
