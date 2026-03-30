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

// SpanEvent is one event/log annotation attached to a span.
type SpanEvent struct {
	Name       string            `json:"name"`
	TimeNano   uint64            `json:"-"`
	Time       time.Time         `json:"time,omitempty"`
	Attributes map[string]string `json:"attributes,omitempty"`
}

// Trace is a collection of related spans sharing the same trace ID.
type Trace struct {
	TraceID     string
	ServiceName string
	RootName    string
	StartTime   time.Time
	EndTime     time.Time
	DurationMS  float64
	StatusCode  StatusCode
	SpanCount   int
	Spans       []*Span
}

// Span is the internal representation of an OpenTelemetry span.
// Field names and semantics mirror opentelemetry.proto.trace.v1.Span.
//
// Raw proto fields (populated by the protobuf decoder):
//
//	TraceID, SpanID, ParentSpanID     — byte arrays
//	StartTimeNano, EndTimeNano        — uint64 nanoseconds
//	Attributes                        — []KeyValue
//	Resource                          — Resource struct
//
// Derived fields (populated by Resolve() after decoding):
//
//	TraceID, SpanID, ParentID         — hex strings
//	StartTime, EndTime                — time.Time
//	Attributes, Resource, Events      — maps/slices
type Span struct {
	// ── Raw proto fields (written by proto.go decoder) ────────────────────
	TraceIDBytes      [16]byte   `json:"-"`
	SpanIDBytes       [8]byte    `json:"-"`
	ParentSpanIDBytes [8]byte    `json:"-"` // zero if root span
	TraceState        string     `json:"-"`
	Name              string
	Kind              SpanKind
	StartTimeNano     uint64     `json:"-"`
	EndTimeNano       uint64     `json:"-"`
	RawAttributes     []KeyValue `json:"-"`
	StatusCode        StatusCode
	StatusMessage     string
	RawResource       Resource   `json:"-"`
	ScopeName         string     `json:"-"`
	ScopeVersion      string     `json:"-"`

	// ── Derived fields (populated by Resolve) ────────────────────────────
	TraceID      string            `json:"traceId"`
	SpanID       string            `json:"spanId"`
	ParentID     string            `json:"parentId,omitempty"`
	ServiceName  string            `json:"serviceName"`
	StartTime    time.Time         `json:"startTime"`
	EndTime      time.Time         `json:"endTime"`
	DurationNano uint64            `json:"-"`
	ReceivedAt   time.Time         `json:"-"`
	Attributes   map[string]string `json:"attributes,omitempty"`
	Resource     map[string]string `json:"resource,omitempty"`
	Events       []SpanEvent       `json:"events,omitempty"`
}

// Resolve populates derived fields from raw proto fields.
// Called automatically by the OTLP receiver after protobuf decoding.
func (s *Span) Resolve() {
	s.TraceID = hexBytes(s.TraceIDBytes[:])
	s.SpanID = hexBytes(s.SpanIDBytes[:])
	var zeroParent [8]byte
	if s.ParentSpanIDBytes != zeroParent {
		s.ParentID = hexBytes(s.ParentSpanIDBytes[:])
	}
	s.StartTime = time.Unix(0, int64(s.StartTimeNano)).UTC()
	s.EndTime = time.Unix(0, int64(s.EndTimeNano)).UTC()
	if s.EndTimeNano > s.StartTimeNano {
		s.DurationNano = s.EndTimeNano - s.StartTimeNano
	}
	s.ServiceName = s.RawResource.ServiceName
	s.ReceivedAt = time.Now()

	// Flatten raw attributes to map.
	if len(s.RawAttributes) > 0 {
		s.Attributes = make(map[string]string, len(s.RawAttributes))
		for _, kv := range s.RawAttributes {
			s.Attributes[kv.Key] = kv.Value
		}
	}
	// Flatten resource attributes to map.
	if len(s.RawResource.Attributes) > 0 {
		s.Resource = make(map[string]string, len(s.RawResource.Attributes)+2)
		for _, kv := range s.RawResource.Attributes {
			s.Resource[kv.Key] = kv.Value
		}
		if s.RawResource.ServiceName != "" {
			s.Resource["service.name"] = s.RawResource.ServiceName
		}
		if s.RawResource.ServiceVersion != "" {
			s.Resource["service.version"] = s.RawResource.ServiceVersion
		}
	}
}

// IsRoot returns true if this is a root span (no parent).
func (s *Span) IsRoot() bool { return s.ParentID == "" }

// IsError returns true when the span has an error status.
func (s *Span) IsError() bool { return s.StatusCode == StatusError }

// DurationMS returns the span duration in milliseconds.
func (s *Span) DurationMS() float64 {
	return float64(s.DurationNano) / 1e6
}

// Duration returns the span duration.
func (s *Span) Duration() time.Duration {
	return time.Duration(s.DurationNano)
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
