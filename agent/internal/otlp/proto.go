package otlp

// proto.go — minimal protobuf wire-format decoder.
//
// Implements enough of the protobuf binary encoding (RFC-like spec at
// https://protobuf.dev/programming-guides/encoding/) to parse
// ExportTraceServiceRequest and ExportMetricsServiceRequest without
// importing google.golang.org/protobuf.
//
// Only the field numbers that AITOP needs are decoded; unknown fields are
// skipped transparently (forward-compatible with new OTLP versions).
//
// Wire types used by OTLP:
//   0 — Varint          (int32, int64, uint32, uint64, bool, enum)
//   1 — 64-bit fixed    (fixed64, sfixed64, double)
//   2 — Length-delimited (string, bytes, embedded message, packed repeated)
//   5 — 32-bit fixed    (fixed32, sfixed32, float)

import (
	"encoding/binary"
	"fmt"
	"math"
	"strconv"
	"time"
)

// ── Wire-type constants ───────────────────────────────────────────────────────

const (
	wireVarint    = 0
	wire64bit     = 1
	wireBytes     = 2
	wire32bit     = 5
)

// ── Reader ────────────────────────────────────────────────────────────────────

// protoReader is a cursor over a raw protobuf byte slice.
type protoReader struct {
	buf []byte
	pos int
}

func newReader(b []byte) *protoReader { return &protoReader{buf: b} }

func (r *protoReader) remaining() int { return len(r.buf) - r.pos }

func (r *protoReader) readByte() (byte, error) {
	if r.pos >= len(r.buf) {
		return 0, fmt.Errorf("proto: unexpected EOF at byte %d", r.pos)
	}
	b := r.buf[r.pos]
	r.pos++
	return b, nil
}

// readVarint decodes a base-128 varint.
func (r *protoReader) readVarint() (uint64, error) {
	var x uint64
	var s uint
	for i := 0; i < 10; i++ {
		b, err := r.readByte()
		if err != nil {
			return 0, err
		}
		if b < 0x80 {
			if i == 9 && b > 1 {
				return 0, fmt.Errorf("proto: varint overflow")
			}
			return x | uint64(b)<<s, nil
		}
		x |= uint64(b&0x7f) << s
		s += 7
	}
	return 0, fmt.Errorf("proto: varint too long")
}

// readFixed64 decodes a little-endian 64-bit value.
func (r *protoReader) readFixed64() (uint64, error) {
	if r.pos+8 > len(r.buf) {
		return 0, fmt.Errorf("proto: unexpected EOF reading fixed64")
	}
	v := binary.LittleEndian.Uint64(r.buf[r.pos:])
	r.pos += 8
	return v, nil
}

// readFixed32 decodes a little-endian 32-bit value.
func (r *protoReader) readFixed32() (uint32, error) {
	if r.pos+4 > len(r.buf) {
		return 0, fmt.Errorf("proto: unexpected EOF reading fixed32")
	}
	v := binary.LittleEndian.Uint32(r.buf[r.pos:])
	r.pos += 4
	return v, nil
}

// readBytes reads a length-delimited byte slice (string or embedded message).
func (r *protoReader) readBytes() ([]byte, error) {
	n, err := r.readVarint()
	if err != nil {
		return nil, err
	}
	end := r.pos + int(n)
	if end > len(r.buf) {
		return nil, fmt.Errorf("proto: bytes length %d exceeds buffer", n)
	}
	b := r.buf[r.pos:end]
	r.pos = end
	return b, nil
}

// readString reads a length-delimited UTF-8 string.
func (r *protoReader) readString() (string, error) {
	b, err := r.readBytes()
	return string(b), err
}

// readTag returns (fieldNumber, wireType) for the next field, or (0,0,EOF).
func (r *protoReader) readTag() (fieldNum uint32, wireType uint8, err error) {
	if r.remaining() == 0 {
		return 0, 0, nil // clean EOF
	}
	tag, err := r.readVarint()
	if err != nil {
		return 0, 0, err
	}
	return uint32(tag >> 3), uint8(tag & 0x7), nil
}

// skip skips one field value based on wire type.
func (r *protoReader) skip(wireType uint8) error {
	switch wireType {
	case wireVarint:
		_, err := r.readVarint()
		return err
	case wire64bit:
		_, err := r.readFixed64()
		return err
	case wireBytes:
		_, err := r.readBytes()
		return err
	case wire32bit:
		_, err := r.readFixed32()
		return err
	default:
		return fmt.Errorf("proto: unknown wire type %d", wireType)
	}
}

// sub returns a new reader scoped to the next length-delimited sub-message.
func (r *protoReader) sub() (*protoReader, error) {
	b, err := r.readBytes()
	if err != nil {
		return nil, err
	}
	return newReader(b), nil
}

// ── Top-level parse functions ─────────────────────────────────────────────────

// ParseTraceRequest decodes an OTLP ExportTraceServiceRequest binary payload
// into a flat slice of internal Span values.
func ParseTraceRequest(data []byte) ([]*Span, error) {
	r := newReader(data)
	var spans []*Span

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return spans, err
		}
		if fn == 0 {
			break
		}
		// ExportTraceServiceRequest.resource_spans = field 1
		if fn == 1 && wt == wireBytes {
			sub, err := r.sub()
			if err != nil {
				return spans, err
			}
			ss, err := parseResourceSpans(sub)
			if err != nil {
				return spans, err
			}
			spans = append(spans, ss...)
			continue
		}
		if err := r.skip(wt); err != nil {
			return spans, err
		}
	}
	return spans, nil
}

// ParseMetricsRequest decodes an OTLP ExportMetricsServiceRequest binary payload.
func ParseMetricsRequest(data []byte) ([]*MetricPoint, error) {
	r := newReader(data)
	var points []*MetricPoint

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return points, err
		}
		if fn == 0 {
			break
		}
		// ExportMetricsServiceRequest.resource_metrics = field 1
		if fn == 1 && wt == wireBytes {
			sub, err := r.sub()
			if err != nil {
				return points, err
			}
			pts, err := parseResourceMetrics(sub)
			if err != nil {
				return points, err
			}
			points = append(points, pts...)
			continue
		}
		if err := r.skip(wt); err != nil {
			return points, err
		}
	}
	return points, nil
}

// ── Trace parsing ─────────────────────────────────────────────────────────────

func parseResourceSpans(r *protoReader) ([]*Span, error) {
	var res Resource
	var scopeSpansList [][]*Span

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // resource
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			res, err = parseResource(sub)
			if err != nil {
				return nil, err
			}
		case 2: // scope_spans
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			ss, err := parseScopeSpans(sub)
			if err != nil {
				return nil, err
			}
			scopeSpansList = append(scopeSpansList, ss)
		default:
			if err := r.skip(wt); err != nil {
				return nil, err
			}
		}
	}

	// Flatten and attach resource
	var out []*Span
	for _, ss := range scopeSpansList {
		for _, s := range ss {
			s.RawResource = res
			s.Resolve()
			out = append(out, s)
		}
	}
	return out, nil
}

func parseScopeSpans(r *protoReader) ([]*Span, error) {
	var spans []*Span
	var scopeName, scopeVersion string

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // scope (InstrumentationScope)
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			scopeName, scopeVersion, err = parseInstrumentationScope(sub)
			if err != nil {
				return nil, err
			}
		case 2: // spans
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			span, err := parseSpan(sub)
			if err != nil {
				return nil, err
			}
			span.ScopeName = scopeName
			span.ScopeVersion = scopeVersion
			spans = append(spans, span)
		default:
			if err := r.skip(wt); err != nil {
				return nil, err
			}
		}
	}
	return spans, nil
}

func parseSpan(r *protoReader) (*Span, error) {
	s := &Span{}
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return s, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // trace_id (bytes, 16 bytes)
			b, err := r.readBytes()
			if err != nil {
				return s, err
			}
			copy(s.TraceIDBytes[:], b)
		case 2: // span_id (bytes, 8 bytes)
			b, err := r.readBytes()
			if err != nil {
				return s, err
			}
			copy(s.SpanIDBytes[:], b)
		case 3: // trace_state
			s.TraceState, err = r.readString()
			if err != nil {
				return s, err
			}
		case 4: // parent_span_id (bytes, 8 bytes)
			b, err := r.readBytes()
			if err != nil {
				return s, err
			}
			copy(s.ParentSpanIDBytes[:], b)
		case 5: // name
			s.Name, err = r.readString()
			if err != nil {
				return s, err
			}
		case 6: // kind (enum → varint)
			v, err := r.readVarint()
			if err != nil {
				return s, err
			}
			s.Kind = SpanKind(v)
		case 7: // start_time_unix_nano (fixed64)
			s.StartTimeNano, err = r.readFixed64()
			if err != nil {
				return s, err
			}
		case 8: // end_time_unix_nano (fixed64)
			s.EndTimeNano, err = r.readFixed64()
			if err != nil {
				return s, err
			}
		case 9: // attributes (repeated KeyValue)
			sub, err := r.sub()
			if err != nil {
				return s, err
			}
			kv, err := parseKeyValue(sub)
			if err != nil {
				return s, err
			}
			s.RawAttributes = append(s.RawAttributes, kv)
		case 15: // status
			sub, err := r.sub()
			if err != nil {
				return s, err
			}
			code, msg, err := parseStatus(sub)
			if err != nil {
				return s, err
			}
			s.StatusCode = code
			s.StatusMessage = msg
		default:
			if err := r.skip(wt); err != nil {
				return s, err
			}
		}
	}
	return s, nil
}

func parseStatus(r *protoReader) (StatusCode, string, error) {
	var code StatusCode
	var msg string
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return code, msg, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 2: // message
			msg, err = r.readString()
			if err != nil {
				return code, msg, err
			}
		case 3: // code (enum)
			v, err := r.readVarint()
			if err != nil {
				return code, msg, err
			}
			code = StatusCode(v)
		default:
			if err := r.skip(wt); err != nil {
				return code, msg, err
			}
		}
	}
	return code, msg, nil
}

// ── Metrics parsing ───────────────────────────────────────────────────────────

func parseResourceMetrics(r *protoReader) ([]*MetricPoint, error) {
	var res Resource
	var allPoints []*MetricPoint

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // resource
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			res, err = parseResource(sub)
			if err != nil {
				return nil, err
			}
		case 2: // scope_metrics
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			pts, err := parseScopeMetrics(sub)
			if err != nil {
				return nil, err
			}
			allPoints = append(allPoints, pts...)
		default:
			if err := r.skip(wt); err != nil {
				return nil, err
			}
		}
	}

	for _, p := range allPoints {
		p.Resource = res
		p.ServiceName = res.ServiceName
		p.ReceivedAt = time.Now()
	}
	return allPoints, nil
}

func parseScopeMetrics(r *protoReader) ([]*MetricPoint, error) {
	var scopeName string
	var allPoints []*MetricPoint

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // scope
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			scopeName, _, err = parseInstrumentationScope(sub)
			if err != nil {
				return nil, err
			}
		case 3: // metrics (field 3 in ScopeMetrics)
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			pts, err := parseMetric(sub, scopeName)
			if err != nil {
				return nil, err
			}
			allPoints = append(allPoints, pts...)
		default:
			if err := r.skip(wt); err != nil {
				return nil, err
			}
		}
	}
	return allPoints, nil
}

// parseMetric decodes a Metric message and returns one MetricPoint per data point.
func parseMetric(r *protoReader, scopeName string) ([]*MetricPoint, error) {
	tmpl := &MetricPoint{ScopeName: scopeName}
	var points []*MetricPoint
	var metricType MetricType

	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // name
			tmpl.Name, err = r.readString()
			if err != nil {
				return nil, err
			}
		case 2: // description
			tmpl.Description, err = r.readString()
			if err != nil {
				return nil, err
			}
		case 3: // unit
			tmpl.Unit, err = r.readString()
			if err != nil {
				return nil, err
			}
		case 5: // gauge
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			metricType = MetricTypeGauge
			pts, err := parseNumberDataPoints(sub, tmpl, metricType)
			if err != nil {
				return nil, err
			}
			points = append(points, pts...)
		case 7: // sum
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			metricType = MetricTypeSum
			pts, err := parseSumDataPoints(sub, tmpl)
			if err != nil {
				return nil, err
			}
			points = append(points, pts...)
		case 9: // histogram
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			metricType = MetricTypeHistogram
			pts, err := parseHistogramDataPoints(sub, tmpl)
			if err != nil {
				return nil, err
			}
			points = append(points, pts...)
		default:
			if err := r.skip(wt); err != nil {
				return nil, err
			}
		}
	}
	_ = metricType
	return points, nil
}

// parseNumberDataPoints decodes Gauge.data_points or helper for repeated NumberDataPoint.
func parseNumberDataPoints(r *protoReader, tmpl *MetricPoint, mtype MetricType) ([]*MetricPoint, error) {
	var pts []*MetricPoint
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		// Gauge.data_points = field 1
		if fn == 1 && wt == wireBytes {
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			pt, err := parseNumberDataPoint(sub, tmpl, mtype)
			if err != nil {
				return nil, err
			}
			pts = append(pts, pt)
			continue
		}
		if err := r.skip(wt); err != nil {
			return nil, err
		}
	}
	return pts, nil
}

// parseSumDataPoints decodes Sum message (data_points field 1, plus aggregation fields).
func parseSumDataPoints(r *protoReader, tmpl *MetricPoint) ([]*MetricPoint, error) {
	var pts []*MetricPoint
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		if fn == 1 && wt == wireBytes {
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			pt, err := parseNumberDataPoint(sub, tmpl, MetricTypeSum)
			if err != nil {
				return nil, err
			}
			pts = append(pts, pt)
			continue
		}
		if err := r.skip(wt); err != nil {
			return nil, err
		}
	}
	return pts, nil
}

func parseNumberDataPoint(r *protoReader, tmpl *MetricPoint, mtype MetricType) (*MetricPoint, error) {
	p := &MetricPoint{
		Name:        tmpl.Name,
		Description: tmpl.Description,
		Unit:        tmpl.Unit,
		Type:        mtype,
		ScopeName:   tmpl.ScopeName,
	}
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return p, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 7: // attributes (repeated KeyValue)
			sub, err := r.sub()
			if err != nil {
				return p, err
			}
			kv, err := parseKeyValue(sub)
			if err != nil {
				return p, err
			}
			p.Attributes = append(p.Attributes, kv)
		case 2: // start_time_unix_nano (fixed64)
			p.StartTimeNano, err = r.readFixed64()
			if err != nil {
				return p, err
			}
		case 3: // time_unix_nano (fixed64)
			p.TimeNano, err = r.readFixed64()
			if err != nil {
				return p, err
			}
		case 4: // as_double (double / wire64bit)
			v, err := r.readFixed64()
			if err != nil {
				return p, err
			}
			p.AsDouble = math.Float64frombits(v)
			p.IsDouble = true
		case 6: // as_int (sfixed64 / wire64bit)
			v, err := r.readFixed64()
			if err != nil {
				return p, err
			}
			p.AsInt = int64(v)
			p.IsDouble = false
		default:
			if err := r.skip(wt); err != nil {
				return p, err
			}
		}
	}
	return p, nil
}

func parseHistogramDataPoints(r *protoReader, tmpl *MetricPoint) ([]*MetricPoint, error) {
	var pts []*MetricPoint
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return nil, err
		}
		if fn == 0 {
			break
		}
		// HistogramDataPoint = field 1
		if fn == 1 && wt == wireBytes {
			sub, err := r.sub()
			if err != nil {
				return nil, err
			}
			pt, err := parseHistogramDataPoint(sub, tmpl)
			if err != nil {
				return nil, err
			}
			pts = append(pts, pt)
			continue
		}
		if err := r.skip(wt); err != nil {
			return nil, err
		}
	}
	return pts, nil
}

func parseHistogramDataPoint(r *protoReader, tmpl *MetricPoint) (*MetricPoint, error) {
	p := &MetricPoint{
		Name:        tmpl.Name,
		Description: tmpl.Description,
		Unit:        tmpl.Unit,
		Type:        MetricTypeHistogram,
		ScopeName:   tmpl.ScopeName,
	}
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return p, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 9: // attributes
			sub, err := r.sub()
			if err != nil {
				return p, err
			}
			kv, err := parseKeyValue(sub)
			if err != nil {
				return p, err
			}
			p.Attributes = append(p.Attributes, kv)
		case 2: // start_time_unix_nano
			p.StartTimeNano, err = r.readFixed64()
			if err != nil {
				return p, err
			}
		case 3: // time_unix_nano
			p.TimeNano, err = r.readFixed64()
			if err != nil {
				return p, err
			}
		case 4: // count (uint64, varint)
			p.HistCount, err = r.readVarint()
			if err != nil {
				return p, err
			}
		case 5: // sum (double)
			v, err := r.readFixed64()
			if err != nil {
				return p, err
			}
			p.HistSum = math.Float64frombits(v)
		case 6: // bucket_counts (packed uint64)
			b, err := r.readBytes()
			if err != nil {
				return p, err
			}
			p.HistCounts, err = unpackUint64(b)
			if err != nil {
				return p, err
			}
		case 7: // explicit_bounds (packed double)
			b, err := r.readBytes()
			if err != nil {
				return p, err
			}
			p.HistBounds, err = unpackDouble(b)
			if err != nil {
				return p, err
			}
		default:
			if err := r.skip(wt); err != nil {
				return p, err
			}
		}
	}
	return p, nil
}

// ── Shared helpers ────────────────────────────────────────────────────────────

func parseResource(r *protoReader) (Resource, error) {
	var res Resource
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return res, err
		}
		if fn == 0 {
			break
		}
		if fn == 1 && wt == wireBytes { // attributes
			sub, err := r.sub()
			if err != nil {
				return res, err
			}
			kv, err := parseKeyValue(sub)
			if err != nil {
				return res, err
			}
			res.Attributes = append(res.Attributes, kv)
			switch kv.Key {
			case "service.name":
				res.ServiceName = kv.Value
			case "service.version":
				res.ServiceVersion = kv.Value
			}
			continue
		}
		if err := r.skip(wt); err != nil {
			return res, err
		}
	}
	return res, nil
}

func parseInstrumentationScope(r *protoReader) (name, version string, err error) {
	for r.remaining() > 0 {
		fn, wt, e := r.readTag()
		if e != nil {
			return name, version, e
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // name
			name, err = r.readString()
			if err != nil {
				return
			}
		case 2: // version
			version, err = r.readString()
			if err != nil {
				return
			}
		default:
			if err = r.skip(wt); err != nil {
				return
			}
		}
	}
	return
}

// parseKeyValue decodes an opentelemetry.proto.common.v1.KeyValue message.
// AnyValue is coerced to string for internal storage simplicity.
func parseKeyValue(r *protoReader) (KeyValue, error) {
	var kv KeyValue
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return kv, err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // key
			kv.Key, err = r.readString()
			if err != nil {
				return kv, err
			}
		case 2: // value (AnyValue)
			sub, err := r.sub()
			if err != nil {
				return kv, err
			}
			kv.Value, err = parseAnyValue(sub)
			if err != nil {
				return kv, err
			}
		default:
			if err := r.skip(wt); err != nil {
				return kv, err
			}
		}
	}
	return kv, nil
}

// parseAnyValue coerces an AnyValue oneof to a string.
func parseAnyValue(r *protoReader) (string, error) {
	for r.remaining() > 0 {
		fn, wt, err := r.readTag()
		if err != nil {
			return "", err
		}
		if fn == 0 {
			break
		}
		switch fn {
		case 1: // string_value
			return r.readString()
		case 2: // bool_value (varint)
			v, err := r.readVarint()
			if err != nil {
				return "", err
			}
			if v != 0 {
				return "true", nil
			}
			return "false", nil
		case 3: // int_value (varint, interpreted as int64)
			v, err := r.readVarint()
			if err != nil {
				return "", err
			}
			return strconv.FormatInt(int64(v), 10), nil
		case 4: // double_value (fixed64)
			v, err := r.readFixed64()
			if err != nil {
				return "", err
			}
			return strconv.FormatFloat(math.Float64frombits(v), 'f', -1, 64), nil
		case 5: // array_value — just skip for now
			if err := r.skip(wt); err != nil {
				return "", err
			}
			return "<array>", nil
		case 6: // kvlist_value — skip
			if err := r.skip(wt); err != nil {
				return "", err
			}
			return "<kvlist>", nil
		case 7: // bytes_value
			b, err := r.readBytes()
			if err != nil {
				return "", err
			}
			return hexBytes(b), nil
		default:
			if err := r.skip(wt); err != nil {
				return "", err
			}
		}
	}
	return "", nil
}

// unpackUint64 decodes a packed repeated uint64 field (varint encoding).
func unpackUint64(b []byte) ([]uint64, error) {
	r := newReader(b)
	var out []uint64
	for r.remaining() > 0 {
		v, err := r.readVarint()
		if err != nil {
			return out, err
		}
		out = append(out, v)
	}
	return out, nil
}

// unpackDouble decodes a packed repeated double field (fixed64 encoding).
func unpackDouble(b []byte) ([]float64, error) {
	if len(b)%8 != 0 {
		return nil, fmt.Errorf("proto: packed double length %d not multiple of 8", len(b))
	}
	out := make([]float64, len(b)/8)
	for i := range out {
		bits := binary.LittleEndian.Uint64(b[i*8:])
		out[i] = math.Float64frombits(bits)
	}
	return out, nil
}
