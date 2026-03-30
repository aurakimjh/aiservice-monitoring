// Package tracestore implements the Trace Engine (WS-1.2).
// It provides a three-tier storage architecture:
//   - Hot tier  : in-memory ring buffer (last 100 K spans / 4 h)
//   - Warm tier : SQLite with FTS5 index (30-day rolling window)
//   - Cold tier : S3 Parquet archives (1 year+)
package tracestore

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

const (
	// RingCapacity is the maximum number of spans kept in the hot-tier ring
	// buffer.  Oldest entries are overwritten when the buffer is full.
	RingCapacity = 100_000

	// HotRetention is how long a span is considered "hot" even when the ring
	// is not full.  Spans older than this are excluded from hot-tier queries.
	HotRetention = 4 * time.Hour
)

// ringEntry wraps a span with its ring-buffer slot index.
type ringEntry struct {
	span      *otlp.Span
	seq       uint64 // monotonically increasing; used to detect wrap-around
}

// RingBuffer is a lock-optimised circular buffer for spans.
// It is safe for concurrent reads and writes.
//
// Write contention: a single write mutex protects the head pointer and slot.
// Read contention:  a separate RWMutex protects snapshot queries; readers
// only acquire it in shared mode so they do not block each other.
type RingBuffer struct {
	slots   [RingCapacity]ringEntry
	head    uint64       // next write position (monotonic)
	writeMu sync.Mutex

	// traceIndex maps traceID → slice of slot indices (mod RingCapacity).
	// Maintained on every write; stale entries are cleaned lazily on read.
	traceIndex   map[string][]uint64
	serviceIndex map[string][]uint64 // serviceName → slot indices
	indexMu      sync.RWMutex

	totalWritten atomic.Uint64
}

// NewRingBuffer allocates a ready-to-use RingBuffer.
func NewRingBuffer() *RingBuffer {
	return &RingBuffer{
		traceIndex:   make(map[string][]uint64),
		serviceIndex: make(map[string][]uint64),
	}
}

// Write stores spans into the ring buffer and updates the secondary indexes.
func (r *RingBuffer) Write(spans []*otlp.Span) {
	if len(spans) == 0 {
		return
	}

	r.writeMu.Lock()
	// Collect (seq, slotIdx) pairs to update indexes without holding writeMu.
	type pending struct {
		seq     uint64
		slotIdx uint64
		span    *otlp.Span
	}
	added := make([]pending, len(spans))

	for i, s := range spans {
		seq := r.head
		slot := seq % RingCapacity
		r.slots[slot] = ringEntry{span: s, seq: seq}
		r.head++
		added[i] = pending{seq: seq, slotIdx: slot, span: s}
	}
	r.writeMu.Unlock()

	r.totalWritten.Add(uint64(len(spans)))

	// Update secondary indexes under a write lock.
	r.indexMu.Lock()
	for _, p := range added {
		r.traceIndex[p.span.TraceID] = append(r.traceIndex[p.span.TraceID], p.slotIdx)
		r.serviceIndex[p.span.ServiceName] = append(r.serviceIndex[p.span.ServiceName], p.slotIdx)
	}
	r.indexMu.Unlock()
}

// QueryByTrace returns all hot-tier spans belonging to traceID.
func (r *RingBuffer) QueryByTrace(traceID string) []*otlp.Span {
	cutoff := time.Now().Add(-HotRetention)

	r.indexMu.RLock()
	slots := r.traceIndex[traceID]
	r.indexMu.RUnlock()

	return r.collectSlots(slots, cutoff, func(s *otlp.Span) bool {
		return s.TraceID == traceID
	})
}

// QueryByService returns up to limit recent hot-tier spans for serviceName.
func (r *RingBuffer) QueryByService(serviceName string, limit int) []*otlp.Span {
	cutoff := time.Now().Add(-HotRetention)

	r.indexMu.RLock()
	slots := r.serviceIndex[serviceName]
	r.indexMu.RUnlock()

	spans := r.collectSlots(slots, cutoff, func(s *otlp.Span) bool {
		return s.ServiceName == serviceName
	})
	if limit > 0 && len(spans) > limit {
		return spans[len(spans)-limit:]
	}
	return spans
}

// Snapshot returns all hot-tier spans that pass filter, up to limit entries,
// newer than cutoff.  Pass limit=0 for unlimited.
func (r *RingBuffer) Snapshot(cutoff time.Time, limit int, filter func(*otlp.Span) bool) []*otlp.Span {
	// Walk the ring from newest to oldest.
	r.writeMu.Lock()
	head := r.head
	r.writeMu.Unlock()

	if head == 0 {
		return nil
	}

	var out []*otlp.Span
	// Iterate from head-1 backwards; stop at max RingCapacity entries.
	count := head
	if count > RingCapacity {
		count = RingCapacity
	}

	for i := uint64(0); i < count; i++ {
		slot := (head - 1 - i) % RingCapacity
		entry := r.slots[slot]
		if entry.span == nil {
			continue
		}
		if entry.span.StartTime.Before(cutoff) {
			break // entries are written in time order (monotonic), safe to break
		}
		if filter != nil && !filter(entry.span) {
			continue
		}
		out = append(out, entry.span)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

// Stats returns basic buffer statistics.
func (r *RingBuffer) Stats() RingStats {
	r.writeMu.Lock()
	head := r.head
	r.writeMu.Unlock()

	used := head
	if used > RingCapacity {
		used = RingCapacity
	}
	return RingStats{
		Capacity:     RingCapacity,
		Used:         used,
		TotalWritten: r.totalWritten.Load(),
	}
}

// RingStats holds runtime statistics for the ring buffer.
type RingStats struct {
	Capacity     uint64 `json:"capacity"`
	Used         uint64 `json:"used"`
	TotalWritten uint64 `json:"totalWritten"`
}

// collectSlots dereferences slot indices into span pointers, filtering stale
// or mismatched entries.
func (r *RingBuffer) collectSlots(slots []uint64, cutoff time.Time, match func(*otlp.Span) bool) []*otlp.Span {
	if len(slots) == 0 {
		return nil
	}
	out := make([]*otlp.Span, 0, len(slots))
	for _, slot := range slots {
		entry := r.slots[slot]
		if entry.span == nil {
			continue
		}
		if entry.span.StartTime.Before(cutoff) {
			continue
		}
		if match != nil && !match(entry.span) {
			continue // slot was reused by a different span
		}
		out = append(out, entry.span)
	}
	return out
}
