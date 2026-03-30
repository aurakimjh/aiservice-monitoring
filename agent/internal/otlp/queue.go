package otlp

// queue.go — Backpressure Ring Buffer (S1-4)
//
// Design:
//   - Fixed-capacity lock-free ring buffer backed by a pre-allocated []Event slice.
//   - Producers write via TryEnqueue (non-blocking, returns false on full).
//   - Consumers drain batches via Drain (non-blocking, returns up to maxBatch events).
//   - When full, new events are sampled using a 1-in-N strategy so the buffer
//     never blocks the gRPC/HTTP handler goroutine.
//
// Capacity: 1,048,576 events (1M, must be power of 2 for bitmask optimisation).

import (
	"sync/atomic"
)

const (
	// DefaultCapacity is 1M slots (2^20), power-of-2 required for mask optimisation.
	DefaultCapacity = 1 << 20 // 1,048,576

	// overflowSampleRate controls how many overflow events are sampled.
	// 1-in-10 are accepted when the buffer is full.
	overflowSampleRate = 10
)

// RingBuffer is a thread-safe, fixed-capacity MPSC ring buffer for Event values.
//
// Multiple producers (gRPC/HTTP handler goroutines) write via TryEnqueue.
// A single consumer goroutine (FanOut) reads via Drain.
//
// The ring uses two uint64 counters — writeSeq and readSeq — each advancing
// monotonically. The actual slot index is seq & mask. Because capacity is a
// power of 2 the modulo becomes a cheap bitwise AND.
type RingBuffer struct {
	slots    []atomic.Value // pre-allocated, each holds *Event or nil
	mask     uint64
	capacity uint64

	writeSeq atomic.Uint64 // next slot to claim for writing
	readSeq  atomic.Uint64 // next slot to read

	// overflow counter for observability
	overflowTotal atomic.Uint64
	overflowCycle atomic.Uint64 // cycles mod overflowSampleRate
}

// NewRingBuffer creates a RingBuffer with the given capacity.
// capacity must be a power of 2; if not it is rounded up to the next power of 2.
func NewRingBuffer(capacity int) *RingBuffer {
	cap2 := nextPow2(uint64(capacity))
	rb := &RingBuffer{
		slots:    make([]atomic.Value, cap2),
		mask:     cap2 - 1,
		capacity: cap2,
	}
	return rb
}

// TryEnqueue attempts to add one event to the ring buffer.
//
// Returns true if the event was accepted, false if the buffer is full and
// the overflow sampler decided to drop this particular event.
// This function is safe to call from multiple goroutines concurrently.
func (rb *RingBuffer) TryEnqueue(e Event) bool {
	for {
		write := rb.writeSeq.Load()
		read := rb.readSeq.Load()

		if write-read >= rb.capacity {
			// Buffer is full — apply 1-in-N sampling.
			rb.overflowTotal.Add(1)
			cycle := rb.overflowCycle.Add(1)
			if cycle%overflowSampleRate != 0 {
				return false // drop
			}
			// Sample: fall through and overwrite oldest slot.
			// Advance readSeq to make room (lossy — oldest data is discarded).
			rb.readSeq.CompareAndSwap(read, read+1)
			continue
		}

		// Claim the slot with a CAS on writeSeq.
		if rb.writeSeq.CompareAndSwap(write, write+1) {
			idx := write & rb.mask
			rb.slots[idx].Store(&e)
			return true
		}
		// Another producer raced us; retry.
	}
}

// Drain returns up to maxBatch events from the buffer without blocking.
// It advances readSeq for each event successfully consumed.
// Returns nil if the buffer is empty.
func (rb *RingBuffer) Drain(maxBatch int) []Event {
	var out []Event
	for len(out) < maxBatch {
		read := rb.readSeq.Load()
		write := rb.writeSeq.Load()
		if read >= write {
			break // empty
		}
		idx := read & rb.mask
		raw := rb.slots[idx].Load()
		if raw == nil {
			// Slot not yet written by a concurrent producer; stop here.
			break
		}
		// Advance readSeq only if it hasn't moved.
		if rb.readSeq.CompareAndSwap(read, read+1) {
			ev := *raw.(*Event)
			rb.slots[idx].Store((*Event)(nil)) // clear for GC
			out = append(out, ev)
		}
	}
	return out
}

// Len returns the approximate number of unread events.
func (rb *RingBuffer) Len() int {
	write := rb.writeSeq.Load()
	read := rb.readSeq.Load()
	if write <= read {
		return 0
	}
	n := write - read
	if n > rb.capacity {
		return int(rb.capacity)
	}
	return int(n)
}

// Cap returns the fixed capacity of the buffer.
func (rb *RingBuffer) Cap() int { return int(rb.capacity) }

// OverflowTotal returns the total number of events that were dropped or sampled
// due to backpressure since the buffer was created.
func (rb *RingBuffer) OverflowTotal() uint64 { return rb.overflowTotal.Load() }

// nextPow2 rounds n up to the next power of 2.
func nextPow2(n uint64) uint64 {
	if n == 0 {
		return 1
	}
	n--
	n |= n >> 1
	n |= n >> 2
	n |= n >> 4
	n |= n >> 8
	n |= n >> 16
	n |= n >> 32
	return n + 1
}
