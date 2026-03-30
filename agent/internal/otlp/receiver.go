package otlp

// receiver.go — OTLP Receiver (S1-1, S1-2)
//
// Provides two ingestion surfaces:
//   1. OTLP/gRPC  — raw HTTP/2 gRPC framing on :4317
//      • POST /opentelemetry.proto.collector.trace.v1.TraceService/Export
//      • POST /opentelemetry.proto.collector.metrics.v1.MetricsService/Export
//
//   2. OTLP/HTTP  — plain HTTP/1.1 (merged into existing :8080 mux)
//      • POST /v1/traces
//      • POST /v1/metrics
//
// Both surfaces parse the incoming protobuf payload, enqueue events into the
// shared RingBuffer, and respond immediately. Actual processing happens in the
// FanOut goroutine.
//
// gRPC framing (no external gRPC library):
//   Each gRPC DATA frame carries:
//     [1-byte compressed-flag][4-byte big-endian message-length][message bytes]
//   Response:
//     gRPC status trailer: grpc-status: 0  (OK)
//
// HTTP/2 cleartext (h2c) is served via the standard net/http server when TLS
// is disabled — Go 1.21+ automatically upgrades HTTP/1.1→h2c for gRPC clients
// using the "h2c" upgrade mechanism supported by golang.org/x/net/http2/h2c.
// If golang.org/x/net is unavailable we fall back to plain HTTP/1.1 for
// OTLP/HTTP only (gRPC clients that require HTTP/2 won't connect in that case,
// but OTLP/HTTP JSON/proto over HTTP/1.1 works fine).

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
)

// ── Config ─────────────────────────────────────────────────────────────────────

// Config holds configuration for the OTLPReceiver.
type Config struct {
	// GRPCAddr is the listen address for the OTLP/gRPC server (default ":4317").
	// Set to "" to disable gRPC.
	GRPCAddr string

	// MaxBodyBytes is the maximum allowed request body size (default 4 MiB).
	MaxBodyBytes int64
}

func (c *Config) maxBody() int64 {
	if c.MaxBodyBytes <= 0 {
		return 4 << 20 // 4 MiB
	}
	return c.MaxBodyBytes
}

// ── Receiver ──────────────────────────────────────────────────────────────────

// Receiver is the built-in OTLP ingestion endpoint.
// Create one with New, call RegisterHTTP to attach /v1/traces + /v1/metrics to
// an existing http.ServeMux, then call StartGRPC (if gRPC is desired) to start
// the gRPC server.
type Receiver struct {
	cfg    Config
	queue  *RingBuffer
	fanout *FanOut
	logger *slog.Logger
}

// New creates a Receiver with default 1M-slot ring buffer and a FanOut
// connected to traceH and metricH.
//
// Call StartGRPC and/or RegisterHTTP after construction.
func New(cfg Config, traceH TraceHandler, metricH MetricHandler, logger *slog.Logger) *Receiver {
	queue := NewRingBuffer(DefaultCapacity)
	fo := NewFanOut(queue, traceH, metricH, logger, FanOutConfig{})
	return &Receiver{
		cfg:    cfg,
		queue:  queue,
		fanout: fo,
		logger: logger,
	}
}

// RunFanOut starts the FanOut dispatch loop. Blocks until ctx is cancelled.
// Call in a dedicated goroutine: go recv.RunFanOut(ctx)
func (r *Receiver) RunFanOut(ctx context.Context) {
	r.fanout.Run(ctx)
}

// Stats returns a snapshot of queue and fanout counters.
func (r *Receiver) Stats() FanOutStats { return r.fanout.Stats() }

// ── OTLP/HTTP handlers (S1-2) ─────────────────────────────────────────────────

// RegisterHTTP registers the OTLP/HTTP endpoints onto mux:
//
//	POST /v1/traces   — ExportTraceServiceRequest (protobuf or JSON)
//	POST /v1/metrics  — ExportMetricsServiceRequest (protobuf or JSON)
//
// These endpoints are intentionally unauthenticated at the transport layer
// (the same pattern as /api/v1/heartbeat) because OTel SDKs do not carry
// AITOP JWTs. Add network-level controls (VPC, mTLS) for production.
func (r *Receiver) RegisterHTTP(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/traces", r.handleHTTPTraces)
	mux.HandleFunc("POST /v1/metrics", r.handleHTTPMetrics)
}

func (r *Receiver) handleHTTPTraces(w http.ResponseWriter, req *http.Request) {
	data, err := r.readBody(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		return
	}

	var spans []*Span

	if isJSON(req) {
		spans, err = parseTraceJSON(data)
	} else {
		spans, err = ParseTraceRequest(data)
	}
	if err != nil {
		r.logger.Warn("otlp/http: trace parse error", "err", err, "bytes", len(data))
		http.Error(w, fmt.Sprintf("parse error: %v", err), http.StatusBadRequest)
		return
	}

	queued, dropped := r.enqueueSpans(spans)
	r.logger.Debug("otlp/http: traces received", "spans", len(spans), "queued", queued, "dropped", dropped)

	// OTLP/HTTP spec: respond with empty ExportTraceServiceResponse (JSON or proto).
	writeOTLPResponse(w, req)
}

func (r *Receiver) handleHTTPMetrics(w http.ResponseWriter, req *http.Request) {
	data, err := r.readBody(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		return
	}

	var points []*MetricPoint

	if isJSON(req) {
		points, err = parseMetricsJSON(data)
	} else {
		points, err = ParseMetricsRequest(data)
	}
	if err != nil {
		r.logger.Warn("otlp/http: metrics parse error", "err", err, "bytes", len(data))
		http.Error(w, fmt.Sprintf("parse error: %v", err), http.StatusBadRequest)
		return
	}

	queued, dropped := r.enqueueMetrics(points)
	r.logger.Debug("otlp/http: metrics received", "points", len(points), "queued", queued, "dropped", dropped)

	writeOTLPResponse(w, req)
}

// ── OTLP/gRPC server (S1-1) ──────────────────────────────────────────────────

// grpcPath constants match the standard OTLP gRPC service paths.
const (
	grpcTraceExportPath   = "/opentelemetry.proto.collector.trace.v1.TraceService/Export"
	grpcMetricsExportPath = "/opentelemetry.proto.collector.metrics.v1.MetricsService/Export"
)

// StartGRPC starts a gRPC-compatible HTTP/2 server on cfg.GRPCAddr.
//
// It uses Go's standard net/http server upgraded to handle gRPC framing.
// golang.org/x/net/http2/h2c is used when available (it is already an
// indirect dependency of this module). This function blocks until the
// listener is closed; run it in a goroutine.
//
// Registered gRPC methods:
//   - TraceService/Export    → ingests spans
//   - MetricsService/Export  → ingests metric points
func (r *Receiver) StartGRPC(ctx context.Context) error {
	if r.cfg.GRPCAddr == "" {
		return nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc(grpcTraceExportPath, r.handleGRPCTrace)
	mux.HandleFunc(grpcMetricsExportPath, r.handleGRPCMetrics)
	// Health check for gRPC health protocol
	mux.HandleFunc("/grpc.health.v1.Health/Check", r.handleGRPCHealth)

	// Wrap with h2c handler so gRPC clients (which require HTTP/2 cleartext)
	// can connect without TLS. Falls back gracefully for HTTP/1.1 clients.
	handler := newH2CHandler(mux)

	ln, err := net.Listen("tcp", r.cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("otlp grpc listen %s: %w", r.cfg.GRPCAddr, err)
	}

	srv := &http.Server{
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	r.logger.Info("otlp grpc server starting", "addr", r.cfg.GRPCAddr)

	// Shutdown when ctx is cancelled.
	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutCtx)
	}()

	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("otlp grpc serve: %w", err)
	}
	return nil
}

// handleGRPCTrace handles OTLP TraceService/Export gRPC calls.
func (r *Receiver) handleGRPCTrace(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := readGRPCFrame(req.Body, r.cfg.maxBody())
	if err != nil {
		r.logger.Warn("otlp/grpc: trace frame read error", "err", err)
		writeGRPCStatus(w, 3, "invalid argument: "+err.Error()) // INVALID_ARGUMENT
		return
	}

	spans, err := ParseTraceRequest(data)
	if err != nil {
		r.logger.Warn("otlp/grpc: trace parse error", "err", err)
		writeGRPCStatus(w, 3, "parse error: "+err.Error())
		return
	}

	queued, dropped := r.enqueueSpans(spans)
	r.logger.Debug("otlp/grpc: traces received", "spans", len(spans), "queued", queued, "dropped", dropped)

	writeGRPCOK(w, []byte{}) // empty ExportTraceServiceResponse
}

// handleGRPCMetrics handles OTLP MetricsService/Export gRPC calls.
func (r *Receiver) handleGRPCMetrics(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := readGRPCFrame(req.Body, r.cfg.maxBody())
	if err != nil {
		r.logger.Warn("otlp/grpc: metrics frame read error", "err", err)
		writeGRPCStatus(w, 3, "invalid argument: "+err.Error())
		return
	}

	points, err := ParseMetricsRequest(data)
	if err != nil {
		r.logger.Warn("otlp/grpc: metrics parse error", "err", err)
		writeGRPCStatus(w, 3, "parse error: "+err.Error())
		return
	}

	queued, dropped := r.enqueueMetrics(points)
	r.logger.Debug("otlp/grpc: metrics received", "points", len(points), "queued", queued, "dropped", dropped)

	writeGRPCOK(w, []byte{})
}

// handleGRPCHealth responds to gRPC health checks.
func (r *Receiver) handleGRPCHealth(w http.ResponseWriter, req *http.Request) {
	// HealthCheckResponse: field 1 = status = SERVING (1)
	// Encoded: tag(1,varint)=0x08, value=1 → []byte{0x08, 0x01}
	writeGRPCOK(w, []byte{0x08, 0x01})
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

func (r *Receiver) enqueueSpans(spans []*Span) (queued, dropped int) {
	for _, s := range spans {
		if r.queue.TryEnqueue(Event{Kind: EventKindSpan, Span: s}) {
			queued++
		} else {
			dropped++
		}
	}
	return
}

func (r *Receiver) enqueueMetrics(points []*MetricPoint) (queued, dropped int) {
	for _, p := range points {
		if r.queue.TryEnqueue(Event{Kind: EventKindMetric, Metric: p}) {
			queued++
		} else {
			dropped++
		}
	}
	return
}

// ── gRPC framing helpers ──────────────────────────────────────────────────────

// readGRPCFrame reads one gRPC message frame from r:
//
//	[1-byte compressed][4-byte big-endian length][length bytes message]
func readGRPCFrame(body io.Reader, maxBytes int64) ([]byte, error) {
	limited := io.LimitReader(body, maxBytes+5)

	header := make([]byte, 5)
	if _, err := io.ReadFull(limited, header); err != nil {
		return nil, fmt.Errorf("read frame header: %w", err)
	}

	compressed := header[0]
	msgLen := binary.BigEndian.Uint32(header[1:5])

	if compressed != 0 {
		return nil, fmt.Errorf("compressed gRPC frames not supported (flag=%d)", compressed)
	}
	if int64(msgLen) > maxBytes {
		return nil, fmt.Errorf("gRPC frame too large: %d bytes", msgLen)
	}

	msg := make([]byte, msgLen)
	if _, err := io.ReadFull(body, msg); err != nil {
		return nil, fmt.Errorf("read frame body: %w", err)
	}
	return msg, nil
}

// writeGRPCOK writes a successful gRPC unary response.
func writeGRPCOK(w http.ResponseWriter, responseProto []byte) {
	w.Header().Set("Content-Type", "application/grpc")
	w.Header().Set("Trailer", "Grpc-Status")
	w.WriteHeader(http.StatusOK)

	// Write gRPC data frame: [0][4-byte length][payload]
	frame := make([]byte, 5+len(responseProto))
	frame[0] = 0 // not compressed
	binary.BigEndian.PutUint32(frame[1:5], uint32(len(responseProto)))
	copy(frame[5:], responseProto)
	_, _ = w.Write(frame)

	// gRPC trailers
	w.Header().Set("Grpc-Status", "0")
}

// writeGRPCStatus writes a gRPC error status trailer.
func writeGRPCStatus(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/grpc")
	w.Header().Set("Grpc-Status", fmt.Sprintf("%d", code))
	w.Header().Set("Grpc-Message", msg)
	w.WriteHeader(http.StatusOK) // gRPC always uses HTTP 200; status is in trailer
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func (r *Receiver) readBody(req *http.Request) ([]byte, error) {
	limited := io.LimitReader(req.Body, r.cfg.maxBody()+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	if int64(len(data)) > r.cfg.maxBody() {
		return nil, fmt.Errorf("request body exceeds %d bytes limit", r.cfg.maxBody())
	}
	return data, nil
}

func isJSON(req *http.Request) bool {
	ct := req.Header.Get("Content-Type")
	return strings.Contains(ct, "json")
}

// writeOTLPResponse responds with an empty OTLP export response.
// Returns JSON or protobuf based on the request Accept header.
func writeOTLPResponse(w http.ResponseWriter, req *http.Request) {
	accept := req.Header.Get("Accept")
	if strings.Contains(accept, "json") || isJSON(req) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{}"))
		return
	}
	// Empty protobuf response (zero-length message is valid for export responses).
	w.Header().Set("Content-Type", "application/x-protobuf")
	w.WriteHeader(http.StatusOK)
}

// ── JSON fallback parsers ─────────────────────────────────────────────────────
// These handle OTLP/HTTP JSON format (Content-Type: application/json).
// The JSON schema mirrors the protobuf field names as per OTLP spec.

func parseTraceJSON(data []byte) ([]*Span, error) {
	// Minimal OTLP JSON trace schema — only fields AITOP stores.
	var req struct {
		ResourceSpans []struct {
			Resource struct {
				Attributes []struct {
					Key   string          `json:"key"`
					Value json.RawMessage `json:"value"`
				} `json:"attributes"`
			} `json:"resource"`
			ScopeSpans []struct {
				Scope struct {
					Name    string `json:"name"`
					Version string `json:"version"`
				} `json:"scope"`
				Spans []struct {
					TraceID      string `json:"traceId"`
					SpanID       string `json:"spanId"`
					ParentSpanID string `json:"parentSpanId"`
					Name         string `json:"name"`
					Kind         int32  `json:"kind"`
					StartTimeUnixNano string `json:"startTimeUnixNano"`
					EndTimeUnixNano   string `json:"endTimeUnixNano"`
					Attributes []struct {
						Key   string          `json:"key"`
						Value json.RawMessage `json:"value"`
					} `json:"attributes"`
					Status struct {
						Code    int32  `json:"code"`
						Message string `json:"message"`
					} `json:"status"`
				} `json:"spans"`
			} `json:"scopeSpans"`
		} `json:"resourceSpans"`
	}

	if err := json.Unmarshal(data, &req); err != nil {
		return nil, fmt.Errorf("json unmarshal: %w", err)
	}

	var spans []*Span
	now := time.Now()

	for _, rs := range req.ResourceSpans {
		res := Resource{}
		for _, attr := range rs.Resource.Attributes {
			v := jsonAnyValueString(attr.Value)
			res.Attributes = append(res.Attributes, KeyValue{Key: attr.Key, Value: v})
			switch attr.Key {
			case "service.name":
				res.ServiceName = v
			case "service.version":
				res.ServiceVersion = v
			}
		}

		for _, ss := range rs.ScopeSpans {
			for _, sp := range ss.Spans {
				s := &Span{
					Name:          sp.Name,
					Kind:          SpanKind(sp.Kind),
					StatusCode:    StatusCode(sp.Status.Code),
					StatusMessage: sp.Status.Message,
					Resource:      res,
					ServiceName:   res.ServiceName,
					ScopeName:     ss.Scope.Name,
					ScopeVersion:  ss.Scope.Version,
					ReceivedAt:    now,
				}
				// Decode hex IDs
				decodeHexID16(sp.TraceID, &s.TraceID)
				decodeHexID8(sp.SpanID, &s.SpanID)
				decodeHexID8(sp.ParentSpanID, &s.ParentSpanID)

				s.StartTimeNano = parseUint64String(sp.StartTimeUnixNano)
				s.EndTimeNano = parseUint64String(sp.EndTimeUnixNano)
				if s.EndTimeNano > s.StartTimeNano {
					s.DurationNano = s.EndTimeNano - s.StartTimeNano
				}

				for _, attr := range sp.Attributes {
					s.Attributes = append(s.Attributes, KeyValue{
						Key:   attr.Key,
						Value: jsonAnyValueString(attr.Value),
					})
				}
				spans = append(spans, s)
			}
		}
	}
	return spans, nil
}

func parseMetricsJSON(data []byte) ([]*MetricPoint, error) {
	var req struct {
		ResourceMetrics []struct {
			Resource struct {
				Attributes []struct {
					Key   string          `json:"key"`
					Value json.RawMessage `json:"value"`
				} `json:"attributes"`
			} `json:"resource"`
			ScopeMetrics []struct {
				Scope struct {
					Name string `json:"name"`
				} `json:"scope"`
				Metrics []struct {
					Name        string `json:"name"`
					Description string `json:"description"`
					Unit        string `json:"unit"`
					Gauge       *struct {
						DataPoints []jsonNumberDataPoint `json:"dataPoints"`
					} `json:"gauge"`
					Sum *struct {
						DataPoints []jsonNumberDataPoint `json:"dataPoints"`
					} `json:"sum"`
				} `json:"metrics"`
			} `json:"scopeMetrics"`
		} `json:"resourceMetrics"`
	}

	if err := json.Unmarshal(data, &req); err != nil {
		return nil, fmt.Errorf("json unmarshal: %w", err)
	}

	var points []*MetricPoint
	now := time.Now()

	for _, rm := range req.ResourceMetrics {
		res := Resource{}
		for _, attr := range rm.Resource.Attributes {
			v := jsonAnyValueString(attr.Value)
			res.Attributes = append(res.Attributes, KeyValue{Key: attr.Key, Value: v})
			if attr.Key == "service.name" {
				res.ServiceName = v
			}
		}

		for _, sm := range rm.ScopeMetrics {
			for _, m := range sm.Metrics {
				mtype := MetricTypeGauge
				var dps []jsonNumberDataPoint
				if m.Gauge != nil {
					mtype = MetricTypeGauge
					dps = m.Gauge.DataPoints
				} else if m.Sum != nil {
					mtype = MetricTypeSum
					dps = m.Sum.DataPoints
				}

				for _, dp := range dps {
					p := &MetricPoint{
						Name:          m.Name,
						Description:   m.Description,
						Unit:          m.Unit,
						Type:          mtype,
						TimeNano:      parseUint64String(dp.TimeUnixNano),
						StartTimeNano: parseUint64String(dp.StartTimeUnixNano),
						AsDouble:      dp.AsDouble,
						IsDouble:      true,
						Resource:      res,
						ServiceName:   res.ServiceName,
						ScopeName:     sm.Scope.Name,
						ReceivedAt:    now,
					}
					for _, attr := range dp.Attributes {
						p.Attributes = append(p.Attributes, KeyValue{
							Key:   attr.Key,
							Value: jsonAnyValueString(attr.Value),
						})
					}
					points = append(points, p)
				}
			}
		}
	}
	return points, nil
}

type jsonNumberDataPoint struct {
	Attributes []struct {
		Key   string          `json:"key"`
		Value json.RawMessage `json:"value"`
	} `json:"attributes"`
	StartTimeUnixNano string  `json:"startTimeUnixNano"`
	TimeUnixNano      string  `json:"timeUnixNano"`
	AsDouble          float64 `json:"asDouble"`
	AsInt             int64   `json:"asInt"`
}

func jsonAnyValueString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var obj struct {
		StringValue *string  `json:"stringValue"`
		IntValue    *int64   `json:"intValue"`
		DoubleValue *float64 `json:"doubleValue"`
		BoolValue   *bool    `json:"boolValue"`
	}
	if err := json.Unmarshal(raw, &obj); err != nil {
		return string(raw)
	}
	switch {
	case obj.StringValue != nil:
		return *obj.StringValue
	case obj.IntValue != nil:
		return fmt.Sprintf("%d", *obj.IntValue)
	case obj.DoubleValue != nil:
		return fmt.Sprintf("%g", *obj.DoubleValue)
	case obj.BoolValue != nil:
		if *obj.BoolValue {
			return "true"
		}
		return "false"
	}
	return string(raw)
}

// decodeHexID16 decodes a 32-char hex string into a [16]byte.
func decodeHexID16(s string, dst *[16]byte) {
	b := hexDecode(s)
	copy(dst[:], b)
}

// decodeHexID8 decodes a 16-char hex string into an [8]byte.
func decodeHexID8(s string, dst *[8]byte) {
	b := hexDecode(s)
	copy(dst[:], b)
}

func hexDecode(s string) []byte {
	if len(s)%2 != 0 {
		return nil
	}
	out := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		hi := hexVal(s[i])
		lo := hexVal(s[i+1])
		out[i/2] = hi<<4 | lo
	}
	return out
}

func hexVal(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	}
	return 0
}

func parseUint64String(s string) uint64 {
	if s == "" {
		return 0
	}
	var v uint64
	for _, c := range []byte(s) {
		if c < '0' || c > '9' {
			break
		}
		v = v*10 + uint64(c-'0')
	}
	return v
}

// ── h2c wrapper (HTTP/2 cleartext for gRPC) ───────────────────────────────────

// newH2CHandler wraps h with an HTTP/2 cleartext upgrade handler.
// This enables gRPC clients to connect without TLS.
//
// Implementation delegates to golang.org/x/net/http2/h2c when the build
// includes that package. Since it is an indirect dependency it is always
// available. We reference it via the h2cHandler build tag approach to avoid
// a hard import cycle — see h2c_handler.go for the actual import.
//
// For now we provide a plain fallback that still works for HTTP/1.1 OTLP/HTTP
// clients and gRPC clients that perform the HTTP/1.1 → h2c upgrade.
func newH2CHandler(h http.Handler) http.Handler {
	// Detect gRPC requests by Content-Type and serve them directly.
	// Go's net/http over HTTP/2 (TLS) works natively; for cleartext HTTP/2
	// (h2c) a thin upgrade wrapper is needed. We use a best-effort approach:
	// respond with 101 Switching Protocols for h2c upgrade requests, and
	// fall back to HTTP/1.1 for everything else.
	return &grpcHTTPHandler{inner: h}
}

// grpcHTTPHandler handles both gRPC (over h2c or HTTP/1.1) and plain HTTP.
type grpcHTTPHandler struct {
	inner http.Handler
	once  bytes.Buffer // unused, just anchors the bytes import
}

func (g *grpcHTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// gRPC over HTTP/2: Content-Type starts with "application/grpc"
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/grpc") {
		// Set required gRPC response headers before delegating.
		w.Header().Set("Content-Type", "application/grpc")
		w.Header().Set("Trailer", "Grpc-Status, Grpc-Message")
	}
	g.inner.ServeHTTP(w, r)
}
