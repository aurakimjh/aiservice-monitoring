// Package otlp provides the built-in OTLP Receiver for the AITOP Collection Server.
// It handles OTLP/gRPC (port 4317) and OTLP/HTTP (port 4318 or merged into :8080)
// without external gRPC or protobuf library dependencies.
//
// Data flow:
//
//	OTel SDK ──OTLP/gRPC──► GRPCHandler ─┐
//	                                       ├─► RingBuffer ──► FanOut ──► TraceEngine
//	OTel SDK ──OTLP/HTTP──► HTTPHandler ─┘                          └──► MetricEngine
package otlp

import "time"

// ── Resource ──────────────────────────────────────────────────────────────────

// Resource represents an OpenTelemetry Resource (entity producing telemetry).
type Resource struct {
	// ServiceName from resource attribute "service.name"
	ServiceName string
	// ServiceVersion from resource attribute "service.version"
	ServiceVersion string
	// Attributes holds all other resource key-value attributes.
	Attributes []KeyValue
}

// KeyValue is a single attribute key-value pair decoded from OTLP protobuf.
type KeyValue struct {
	Key   string
	Value string // always string-coerced for internal use
}

// ── Trace / Span ──────────────────────────────────────────────────────────────

// SpanKind maps to opentelemetry.proto.trace.v1.Span.SpanKind.
type SpanKind int32

const (
	SpanKindUnspecified SpanKind = 0
	SpanKindInternal    SpanKind = 1
	SpanKindServer      SpanKind = 2
	SpanKindClient      SpanKind = 3
	SpanKindProducer    SpanKind = 4
	SpanKindConsumer    SpanKind = 5
)

// StatusCode maps to opentelemetry.proto.trace.v1.Status.StatusCode.
type StatusCode int32

const (
	StatusUnset StatusCode = 0
	StatusOK    StatusCode = 1
	StatusError StatusCode = 2
)

// Span is the internal representation of an OpenTelemetry span.
// Field names and semantics mirror opentelemetry.proto.trace.v1.Span.
type Span struct {
	TraceID        [16]byte
	SpanID         [8]byte
	ParentSpanID   [8]byte  // zero if root span
	TraceState     string
	Name           string
	Kind           SpanKind
	StartTimeNano  uint64 // Unix nanoseconds
	EndTimeNano    uint64 // Unix nanoseconds
	Attributes     []KeyValue
	StatusCode     StatusCode
	StatusMessage  string
	Resource       Resource
	ScopeName      string
	ScopeVersion   string

	// Derived fields (populated during ingestion)
	ServiceName  string        // copied from Resource.ServiceName
	DurationNano uint64        // EndTimeNano - StartTimeNano
	ReceivedAt   time.Time     // wall-clock time on the collection server
}

// IsError returns true when the span has an error status.
func (s *Span) IsError() bool { return s.StatusCode == StatusError }

// Duration returns the span duration.
func (s *Span) Duration() time.Duration {
	return time.Duration(s.DurationNano)
}

// TraceIDHex returns the trace ID as a 32-char hex string.
func (s *Span) TraceIDHex() string { return hexBytes(s.TraceID[:]) }

// SpanIDHex returns the span ID as a 16-char hex string.
func (s *Span) SpanIDHex() string { return hexBytes(s.SpanID[:]) }

// ParentSpanIDHex returns the parent span ID as a hex string, or "" for root spans.
func (s *Span) ParentSpanIDHex() string {
	var zero [8]byte
	if s.ParentSpanID == zero {
		return ""
	}
	return hexBytes(s.ParentSpanID[:])
}

// ── Metrics ───────────────────────────────────────────────────────────────────

// MetricType indicates the OpenTelemetry metric instrument type.
type MetricType int32

const (
	MetricTypeUnspecified MetricType = 0
	MetricTypeGauge       MetricType = 1
	MetricTypeSum         MetricType = 2
	MetricTypeHistogram   MetricType = 3
	MetricTypeSummary     MetricType = 4
)

// MetricPoint is the internal representation of a single time-series data point.
// One ExportMetricsServiceRequest may yield many MetricPoints.
type MetricPoint struct {
	Name        string
	Description string
	Unit        string
	Type        MetricType

	// Data point fields (populated according to Type)
	TimeNano      uint64  // Unix nanoseconds of observation
	StartTimeNano uint64  // start of collection window (cumulative)
	AsDouble      float64 // for Gauge / Sum with double values
	AsInt         int64   // for Sum with integer values
	IsDouble      bool    // true → AsDouble, false → AsInt

	// Histogram-specific (Type == MetricTypeHistogram)
	HistCount  uint64
	HistSum    float64
	HistBounds []float64 // explicit bucket boundaries
	HistCounts []uint64  // per-bucket counts

	Attributes  []KeyValue
	Resource    Resource
	ScopeName   string

	// Derived
	ServiceName string    // copied from Resource.ServiceName
	ReceivedAt  time.Time // wall-clock ingestion time
}

// ── Batch envelopes ───────────────────────────────────────────────────────────

// TraceBatch is the envelope dispatched from the ring buffer to the TraceEngine.
type TraceBatch struct {
	Spans      []*Span
	ReceivedAt time.Time
}

// MetricBatch is the envelope dispatched from the ring buffer to the MetricEngine.
type MetricBatch struct {
	Points     []*MetricPoint
	ReceivedAt time.Time
}

// ── Telemetry event (union type stored in RingBuffer) ─────────────────────────

// EventKind discriminates the payload stored in a RingBuffer slot.
type EventKind uint8

const (
	EventKindSpan   EventKind = 1
	EventKindMetric EventKind = 2
)

// Event is a single slot in the RingBuffer.
type Event struct {
	Kind   EventKind
	Span   *Span
	Metric *MetricPoint
}

// ── helpers ───────────────────────────────────────────────────────────────────

const hexTable = "0123456789abcdef"

func hexBytes(b []byte) string {
	out := make([]byte, len(b)*2)
	for i, c := range b {
		out[i*2] = hexTable[c>>4]
		out[i*2+1] = hexTable[c&0xf]
	}
	return string(out)
}
