package metricstore

import (
	"hash/fnv"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

const (
	// ShardCount is the number of independent shards.
	// Must be a power of 2 for fast modulo via bitmask.
	ShardCount = 64

	// MaxSamplesPerSeries is the ring capacity per individual series.
	// At 15-second intervals: 960 samples = 4 hours.
	MaxSamplesPerSeries = 960

	// HotRetention is how long samples are kept in the hot tier.
	HotRetention = 4 * time.Hour
)

// ── shard ────────────────────────────────────────────────────────────────────

type shard struct {
	mu     sync.RWMutex
	series map[string]*hotSeries // seriesKey → time-series ring
}

type hotSeries struct {
	meta   Series
	ring   [MaxSamplesPerSeries]Sample
	head   int  // next write position
	count  int  // samples written (min(total, cap))
}

// write appends a sample to the series ring, overwriting the oldest if full.
func (hs *hotSeries) write(s Sample) {
	hs.ring[hs.head] = s
	hs.head = (hs.head + 1) % MaxSamplesPerSeries
	if hs.count < MaxSamplesPerSeries {
		hs.count++
	}
}

// samples returns all valid samples ordered by time ascending,
// filtered to [from, to].
func (hs *hotSeries) samples(from, to time.Time) []Sample {
	if hs.count == 0 {
		return nil
	}
	out := make([]Sample, 0, hs.count)
	start := hs.head - hs.count
	if start < 0 {
		start += MaxSamplesPerSeries
	}
	for i := 0; i < hs.count; i++ {
		idx := (start + i) % MaxSamplesPerSeries
		s := hs.ring[idx]
		if s.T.Before(from) {
			continue
		}
		if s.T.After(to) {
			break // ring is time-ordered, safe to stop
		}
		out = append(out, s)
	}
	return out
}

// lastValue returns the most recent sample value.
func (hs *hotSeries) lastValue() (float64, time.Time, bool) {
	if hs.count == 0 {
		return 0, time.Time{}, false
	}
	idx := hs.head - 1
	if idx < 0 {
		idx = MaxSamplesPerSeries - 1
	}
	s := hs.ring[idx]
	return s.V, s.T, true
}

// ── HotStore ─────────────────────────────────────────────────────────────────

// HotStore is a sharded, lock-optimised in-memory time-series store.
// Sharding reduces write contention: each series hashes to one shard,
// and only that shard's RWMutex is acquired.
type HotStore struct {
	shards       [ShardCount]shard
	totalWritten atomic.Uint64
}

// NewHotStore allocates a ready-to-use HotStore.
func NewHotStore() *HotStore {
	h := &HotStore{}
	for i := range h.shards {
		h.shards[i].series = make(map[string]*hotSeries)
	}
	return h
}

// Write stores a batch of (seriesKey, sample) pairs.
func (h *HotStore) Write(points []ingestPoint) {
	if len(points) == 0 {
		return
	}

	// Group by shard to minimise lock acquisitions.
	type shardBatch struct {
		idx    int
		points []ingestPoint
	}
	byS := make(map[int]*shardBatch, ShardCount)
	for i := range points {
		si := h.shardIndex(points[i].key)
		sb, ok := byS[si]
		if !ok {
			sb = &shardBatch{idx: si}
			byS[si] = sb
		}
		sb.points = append(sb.points, points[i])
	}

	for _, sb := range byS {
		sh := &h.shards[sb.idx]
		sh.mu.Lock()
		for _, p := range sb.points {
			hs, ok := sh.series[p.key]
			if !ok {
				hs = &hotSeries{meta: p.series}
				sh.series[p.key] = hs
			}
			hs.write(p.sample)
		}
		sh.mu.Unlock()
	}

	h.totalWritten.Add(uint64(len(points)))
}

// Query returns samples for all series matching (name, labelMatch) within [from,to].
func (h *HotStore) Query(name string, labelMatch map[string]string, from, to time.Time) []QueryResult {
	var results []QueryResult

	for i := range h.shards {
		sh := &h.shards[i]
		sh.mu.RLock()
		for _, hs := range sh.series {
			if hs.meta.Name != name {
				continue
			}
			if !labelsMatch(hs.meta.Labels, labelMatch) {
				continue
			}
			samples := hs.samples(from, to)
			if len(samples) > 0 {
				results = append(results, QueryResult{
					Series:  hs.meta,
					Samples: samples,
				})
			}
		}
		sh.mu.RUnlock()
	}

	return results
}

// SeriesNames returns a sorted list of unique metric names in the hot tier.
func (h *HotStore) SeriesNames() []string {
	seen := make(map[string]struct{})
	for i := range h.shards {
		sh := &h.shards[i]
		sh.mu.RLock()
		for _, hs := range sh.series {
			seen[hs.meta.Name] = struct{}{}
		}
		sh.mu.RUnlock()
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// LastValue returns the most recent value for a specific series key.
func (h *HotStore) LastValue(key string) (float64, time.Time, bool) {
	si := h.shardIndex(key)
	sh := &h.shards[si]
	sh.mu.RLock()
	defer sh.mu.RUnlock()
	hs, ok := sh.series[key]
	if !ok {
		return 0, time.Time{}, false
	}
	return hs.lastValue()
}

// Stats returns aggregate statistics.
func (h *HotStore) Stats() (seriesCount int, sampleCount int64) {
	for i := range h.shards {
		sh := &h.shards[i]
		sh.mu.RLock()
		seriesCount += len(sh.series)
		for _, hs := range sh.series {
			sampleCount += int64(hs.count)
		}
		sh.mu.RUnlock()
	}
	return
}

// Prune removes series that have no samples newer than cutoff.
func (h *HotStore) Prune(cutoff time.Time) int {
	pruned := 0
	for i := range h.shards {
		sh := &h.shards[i]
		sh.mu.Lock()
		for key, hs := range sh.series {
			_, t, ok := hs.lastValue()
			if !ok || t.Before(cutoff) {
				delete(sh.series, key)
				pruned++
			}
		}
		sh.mu.Unlock()
	}
	return pruned
}

func (h *HotStore) shardIndex(key string) int {
	hash := fnv.New32a()
	hash.Write([]byte(key)) //nolint:errcheck
	return int(hash.Sum32()) & (ShardCount - 1)
}

// ── ingest helper ────────────────────────────────────────────────────────────

// ingestPoint is the internal format passed from Store.Ingest to HotStore.Write.
type ingestPoint struct {
	key    string
	series Series
	sample Sample
}

// ── label matching ───────────────────────────────────────────────────────────

// labelsMatch returns true if all entries in match are present in labels.
func labelsMatch(labels, match map[string]string) bool {
	for k, v := range match {
		if labels[k] != v {
			return false
		}
	}
	return true
}
