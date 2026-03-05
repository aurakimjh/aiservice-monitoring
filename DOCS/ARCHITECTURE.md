# OpenTelemetry 아키텍처 설계

> **문서 버전**: v1.1.0
> **기반 스펙**: OTel Collector Contrib v0.91.0+ | OpenTelemetry Specification v1.31
> **관점**: SRE — 프로덕션 즉시 적용 가능 수준
> **최종 업데이트**: 2026-03-05
>
> **관련 문서**:
> - [METRICS_DESIGN.md](./METRICS_DESIGN.md) — 레이어별 지표 정의, 수식, 계측 코드
> - [LOCAL_SETUP.md](./LOCAL_SETUP.md) — 로컬 개발 환경 구성 가이드
> - [TEST_GUIDE.md](./TEST_GUIDE.md) — 테스트 & 운영 검증 가이드

---

## 목차

1. [전체 아키텍처 개요](#1-전체-아키텍처-개요)
2. [데이터 흐름 설계 (폴리글랏 환경)](#2-데이터-흐름-설계-폴리글랏-환경)
3. [OTel Collector 파이프라인 설계](#3-otel-collector-파이프라인-설계)
   - [Receivers](#31-receivers)
   - [Processors](#32-processors)
   - [Exporters](#33-exporters)
4. [Tail-based Sampling 파이프라인](#4-tail-based-sampling-파이프라인)
5. [Context Propagation 상세 설계](#5-context-propagation-상세-설계)
6. [고가용성 Collector 배포 패턴](#6-고가용성-collector-배포-패턴)
7. [로컬 개발 환경 (Docker Compose)](#7-로컬-개발-환경-docker-compose)
8. [프로덕션 배포 (Kubernetes)](#8-프로덕션-배포-kubernetes)
9. [데이터 보존 및 비용 전략](#9-데이터-보존-및-비용-전략)

---

## 1. 전체 아키텍처 개요

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     AI Service Observability Platform                         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ┌─────────────────── 계측 레이어 (Instrumentation) ─────────────────────┐  ║
║  │                                                                         │  ║
║  │  [Python Services]          [Node.js Services]       [Go Services]     │  ║
║  │  FastAPI + OTel SDK         Next.js + OTel SDK       Ollama / Weaviate │  ║
║  │  LangChain / vLLM           Frontend Streaming        OTel Go SDK      │  ║
║  │  Guardrails / Embeddings    Browser RUM               gRPC Interceptor │  ║
║  │        │                          │                         │           │  ║
║  │        └──────────────────────────┴─────────────────────────┘           │  ║
║  │                          OTLP (gRPC :4317 / HTTP :4318)                 │  ║
║  └─────────────────────────────────┬───────────────────────────────────────┘  ║
║                                    │                                           ║
║  ┌─────────────────── 수집 레이어 (Collection) ───────────────────────────┐  ║
║  │                                                                         │  ║
║  │   ┌──────────────────────────────────────────────────────────────┐     │  ║
║  │   │            OTel Collector — Agent Mode (DaemonSet)            │     │  ║
║  │   │                                                               │     │  ║
║  │   │  Receivers:  OTLP │ Prometheus │ hostmetrics │ k8sattributes │     │  ║
║  │   │  Processors: batch │ memorylimiter │ resourcedetection        │     │  ║
║  │   │  Exporters:  OTLP → Gateway Collector                         │     │  ║
║  │   └──────────────────────────┬───────────────────────────────────┘     │  ║
║  │                              │  OTLP (gRPC, compressed)                │  ║
║  │   ┌──────────────────────────▼───────────────────────────────────┐     │  ║
║  │   │          OTel Collector — Gateway Mode (Deployment)           │     │  ║
║  │   │                                                               │     │  ║
║  │   │  Processors: tail_sampling │ batch │ attributes │ transform   │     │  ║
║  │   │  Exporters:  Prometheus │ Jaeger │ Tempo │ Loki │ S3(archive) │     │  ║
║  │   └──────────────────────────────────────────────────────────────┘     │  ║
║  │                                                                         │  ║
║  │   ┌────────────┐   ┌─────────────┐                                     │  ║
║  │   │DCGM Exporter│   │Node Exporter│  ← GPU / 호스트 메트릭 전용         │  ║
║  │   └──────┬─────┘   └──────┬──────┘                                     │  ║
║  └──────────┼────────────────┼─────────────────────────────────────────────┘  ║
║             │                │                                                 ║
║  ┌──────────▼────────────────▼────── 저장/분석 레이어 (Storage) ───────┐     ║
║  │                                                                       │     ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │     ║
║  │  │ Prometheus │  │Grafana Tempo│  │   Loki     │  │ S3 / MinIO    │  │     ║
║  │  │ (Metrics)  │  │ (Traces)   │  │  (Logs)    │  │ (Cold Archive)│  │     ║
║  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └───────────────┘  │     ║
║  │        └───────────────┴───────────────┘                               │     ║
║  │                         │ Unified Query                                 │     ║
║  │                   ┌─────▼──────┐                                       │     ║
║  │                   │  Grafana   │  ← 단일 통합 대시보드                  │     ║
║  │                   └────────────┘                                       │     ║
║  └───────────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 설계 원칙

| 원칙 | 구현 방식 |
|------|----------|
| **데이터 유실 방지** | Agent→Gateway 이중 Collector, 재시도 + 영구 큐(WAL) |
| **성능 격리** | Agent(수집)와 Gateway(처리/샘플링) 역할 분리 |
| **비용 최적화** | Tail Sampling으로 85% 트레이스 폐기, Cold Archive로 30일+ 보관 |
| **단일 Trace ID** | W3C TraceContext 헤더로 모든 언어·서비스 관통 |
| **AI 도메인 우선** | TTFT·TPS·GPU 지표를 Standard Metric보다 높은 보존 우선순위 배정 |

---

## 2. 데이터 흐름 설계 (폴리글랏 환경)

### 2.1 언어별 SDK 초기화 패턴

#### Python (FastAPI / LangChain / vLLM)

```python
# sdk-instrumentation/python/otel_setup.py
"""
Python 서비스 공통 OTel 초기화 모듈
모든 Python 서비스는 이 모듈을 import 하여 일관된 계측 환경을 구성한다.
"""
import os
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.propagate import set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator

# Auto-instrumentation 라이브러리
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.pymongo import PymongoInstrumentor


def setup_otel(
    service_name: str,
    service_version: str = "1.0.0",
    deployment_env: str = None,
    collector_endpoint: str = None,
) -> tuple[trace.Tracer, metrics.Meter]:
    """
    OTel SDK 초기화 — 모든 Python 서비스의 진입점

    Args:
        service_name: 서비스 식별자 (예: "guardrails-service", "vllm-inference")
        service_version: 서비스 버전 (SemVer)
        deployment_env: 배포 환경 ("production" | "staging" | "development")
        collector_endpoint: OTel Collector gRPC 엔드포인트

    Returns:
        (tracer, meter) 튜플 — 서비스 전역에서 사용
    """
    env = deployment_env or os.getenv("DEPLOYMENT_ENV", "development")
    endpoint = collector_endpoint or os.getenv(
        "OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317"
    )

    # 리소스 속성 — 모든 텔레메트리에 자동 태깅
    resource = Resource.create({
        SERVICE_NAME: service_name,
        SERVICE_VERSION: service_version,
        "deployment.environment": env,
        "telemetry.sdk.language": "python",
        # AI 서비스 전용 속성
        "ai.service.layer": os.getenv("AI_SERVICE_LAYER", "unknown"),  # app|agent|model|data
        "ai.service.region": os.getenv("POD_NODE_NAME", "unknown"),
        "k8s.pod.name": os.getenv("POD_NAME", "unknown"),
        "k8s.namespace.name": os.getenv("POD_NAMESPACE", "default"),
    })

    # ── Trace Provider ──────────────────────────────────────────────
    tracer_provider = TracerProvider(resource=resource)
    otlp_span_exporter = OTLPSpanExporter(
        endpoint=endpoint,
        insecure=env != "production",
        # 재시도 설정: 네트워크 불안정 대비
        timeout=10,
    )
    tracer_provider.add_span_processor(
        BatchSpanProcessor(
            otlp_span_exporter,
            max_queue_size=2048,
            max_export_batch_size=512,
            export_timeout_millis=30_000,
            schedule_delay_millis=5_000,
        )
    )
    trace.set_tracer_provider(tracer_provider)

    # ── Metric Provider ─────────────────────────────────────────────
    otlp_metric_exporter = OTLPMetricExporter(
        endpoint=endpoint,
        insecure=env != "production",
    )
    metric_reader = PeriodicExportingMetricReader(
        exporter=otlp_metric_exporter,
        export_interval_millis=15_000,   # 15초 간격 (Prometheus scrape와 동기화)
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    # ── Context Propagator — W3C TraceContext + Baggage ─────────────
    set_global_textmap(CompositePropagator([
        TraceContextTextMapPropagator(),   # traceparent / tracestate
        W3CBaggagePropagator(),            # baggage (user.tier, request.id 전달)
    ]))

    # ── Auto-instrumentation 활성화 ──────────────────────────────────
    HTTPXClientInstrumentor().instrument()   # 외부 API 호출 자동 계측
    RedisInstrumentor().instrument()         # Redis 캐시 자동 계측
    PymongoInstrumentor().instrument()       # MongoDB 자동 계측

    tracer = trace.get_tracer(service_name, service_version)
    meter = metrics.get_meter(service_name, service_version)

    return tracer, meter


def instrument_fastapi(app, service_name: str):
    """FastAPI 앱에 OTel 미들웨어 주입"""
    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="/health,/metrics,/readyz",  # 헬스체크 제외
        server_request_hook=_enrich_server_span,
    )


def _enrich_server_span(span, scope):
    """FastAPI span에 AI 서비스 전용 속성 추가"""
    if scope.get("type") == "http":
        headers = dict(scope.get("headers", []))
        # 사용자 티어 정보를 Span 속성으로 승격 (tail sampling 판단 기준)
        user_tier = headers.get(b"x-user-tier", b"standard").decode()
        span.set_attribute("user.tier", user_tier)
        span.set_attribute("request.id", headers.get(b"x-request-id", b"").decode())
```

---

#### Node.js (Next.js / Frontend)

```javascript
// sdk-instrumentation/nodejs/otel-setup.js
'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');
const { CompositePropagator, W3CBaggagePropagator } = require('@opentelemetry/core');

const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4317';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || 'ai-frontend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
    'telemetry.sdk.language': 'nodejs',
    'ai.service.layer': 'app',
  }),

  traceExporter: new OTLPTraceExporter({
    url: `${collectorEndpoint}`,
    // gRPC 압축으로 네트워크 비용 절감
    compression: 'gzip',
  }),

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: collectorEndpoint }),
    exportIntervalMillis: 15_000,
  }),

  // W3C TraceContext + Baggage 전파
  textMapPropagator: new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
    ],
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreOutgoingRequestHook: (req) => {
          // 헬스체크·메트릭 요청 제외
          return req.path?.includes('/health') || req.path?.includes('/metrics');
        },
        requestHook: (span, request) => {
          // AI 서비스 전용 속성 주입
          span.setAttribute('http.user_tier', request.headers['x-user-tier'] || 'standard');
        },
      },
      '@opentelemetry/instrumentation-fetch': { enabled: true },
    }),
  ],
});

sdk.start();

// 정상 종료 시 Span flush 보장
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
process.on('SIGINT',  () => sdk.shutdown().finally(() => process.exit(0)));

module.exports = sdk;
```

---

#### Go (Ollama / Weaviate / 커스텀 서비스)

```go
// sdk-instrumentation/go/otel_setup.go
package otelsetup

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// OtelConfig holds the configuration for OTel SDK initialization.
type OtelConfig struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	CollectorAddr  string
}

// Setup initializes OTel SDK for a Go service.
// Returns a shutdown function that must be called on service exit.
func Setup(ctx context.Context, cfg OtelConfig) (shutdown func(context.Context) error, err error) {
	endpoint := cfg.CollectorAddr
	if endpoint == "" {
		endpoint = os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
		if endpoint == "" {
			endpoint = "otel-collector:4317"
		}
	}

	conn, err := grpc.NewClient(endpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	// 참고: grpc.DialContext는 gRPC-Go v1.63+에서 deprecated.
	// grpc.NewClient는 non-blocking이며 lazy connection을 사용합니다.
	if err != nil {
		return nil, fmt.Errorf("failed to connect to OTel Collector: %w", err)
	}

	// ── Resource ────────────────────────────────────────────────────
	res, err := sdkresource.Merge(
		sdkresource.Default(),
		sdkresource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
			semconv.DeploymentEnvironment(cfg.Environment),
		),
	)
	if err != nil {
		return nil, err
	}

	// ── Trace Provider ───────────────────────────────────────────────
	traceExporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		return nil, err
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter,
			sdktrace.WithMaxQueueSize(2048),
			sdktrace.WithBatchTimeout(5*time.Second),
		),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	// ── Metric Provider ──────────────────────────────────────────────
	metricExporter, err := otlpmetricgrpc.New(ctx, otlpmetricgrpc.WithGRPCConn(conn))
	if err != nil {
		return nil, err
	}
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter,
			sdkmetric.WithInterval(15*time.Second),
		)),
		sdkmetric.WithResource(res),
	)
	otel.SetMeterProvider(mp)

	// ── Context Propagator — W3C TraceContext + Baggage ─────────────
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	shutdown = func(ctx context.Context) error {
		_ = tp.Shutdown(ctx)
		_ = mp.Shutdown(ctx)
		return conn.Close()
	}
	return shutdown, nil
}
```

---

### 2.2 서비스 간 데이터 흐름 시퀀스

```
사용자 브라우저
    │  HTTP POST /chat  (traceparent: 00-aabbcc...-01)
    ▼
Next.js (Node.js) ──────────────────────────────────────────────┐
    │  traceparent 수신 → Span 생성 → 자식 Span 추가            │ OTLP gRPC
    │  fetch('/api/chat', headers: {traceparent: ...})           │ :4317
    ▼                                                            ▼
FastAPI (Python)                                        [OTel Collector]
    │  traceparent 헤더 파싱 → 동일 Trace ID 연결               │ Agent
    │  ├─ Span: guardrail.validate                               │
    │  │    └─ httpx.post (내부 LLM)     → traceparent 자동주입 │
    │  ├─ Span: agent.chain.main                                 │
    │  │    ├─ Span: agent.tool.search                           │
    │  │    │    └─ httpx.post(Serper)   → traceparent 자동주입 │
    │  │    ├─ Span: vectordb.pinecone   → HTTP traceparent 전파 │
    │  │    └─ Span: llm.vllm.generate                           │
    │  │         └─ HTTP to vLLM         → traceparent 자동주입 │
    ▼  ▼                                                         │
vLLM (Python/C++)                                               │
    │  traceparent 수신 → 내부 Span 생성                         │
    │  GPU 추론 실행                                              │
    └─ Streaming chunks → FastAPI → Next.js → 브라우저          │
                                                                 ▼
                                                        [OTel Collector]
                                                         Gateway
                                                            │
                                          ┌─────────────────┼──────────────┐
                                          ▼                 ▼              ▼
                                      Prometheus       Grafana Tempo     Loki
                                      (Metrics)         (Traces)        (Logs)
```

---

## 3. OTel Collector 파이프라인 설계

### 3.1 Receivers

```yaml
# collector/config/otelcol-gateway.yaml (또는 otelcol-agent.yaml) (receivers 섹션)
receivers:

  # ── OTLP: 모든 SDK에서 텔레메트리 수신 ─────────────────────────
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        max_recv_msg_size_mib: 32
        keepalive:
          server_parameters:
            max_connection_idle: 300s
            max_connection_age: 600s
            time: 60s
            timeout: 20s
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins: ["*"]   # 프로덕션에서는 도메인 제한

  # ── Prometheus Pull: DCGM Exporter, Node Exporter 스크레이프 ────
  prometheus:
    config:
      scrape_configs:

        # GPU 메트릭 (DCGM)
        - job_name: 'dcgm-exporter'
          scrape_interval: 15s
          static_configs:
            - targets: ['dcgm-exporter:9400']
          metric_relabel_configs:
            # GPU 인덱스를 모델 서비스 이름으로 매핑
            - source_labels: [gpu]
              target_label: ai_model_instance

        # 노드 메트릭
        - job_name: 'node-exporter'
          scrape_interval: 30s
          kubernetes_sd_configs:
            - role: node
          relabel_configs:
            - action: labelmap
              regex: __meta_kubernetes_node_label_(.+)

        # vLLM 내장 Prometheus 엔드포인트
        - job_name: 'vllm-inference'
          scrape_interval: 10s   # 추론 엔진은 더 자주 수집
          kubernetes_sd_configs:
            - role: pod
          relabel_configs:
            - source_labels: [__meta_kubernetes_pod_label_app]
              action: keep
              regex: vllm-.*
            - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
              action: replace
              target_label: __address__
              replacement: $1:8000

  # ── Kubernetes 속성 수집 ─────────────────────────────────────────
  k8s_cluster:
    auth_type: serviceAccount
    node_conditions_to_report: [Ready, MemoryPressure, DiskPressure]
    allocatable_types_to_report: [cpu, memory, ephemeral-storage]
    metadata_exporters: [signalfx]

  # ── 호스트 메트릭 (Agent 모드에서만) ────────────────────────────
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu:
        metrics:
          system.cpu.utilization:
            enabled: true
      memory:
        metrics:
          system.memory.utilization:
            enabled: true
      network:
        include:
          interfaces: ["eth0", "ens.*"]
      disk: {}
      filesystem:
        exclude_mount_points:
          mount_points: ["/dev", "/sys", "/proc", "/var/lib/kubelet/pods"]
          match_type: strict

  # ── Jaeger 수신 (레거시 서비스 마이그레이션 지원) ───────────────
  jaeger:
    protocols:
      thrift_http:
        endpoint: 0.0.0.0:14268
      grpc:
        endpoint: 0.0.0.0:14250
```

---

### 3.2 Processors

```yaml
# collector/config/otelcol-gateway.yaml (또는 otelcol-agent.yaml) (processors 섹션)
processors:

  # ── 메모리 안전장치 — 가장 먼저 적용 ────────────────────────────
  memory_limiter:
    check_interval: 5s
    limit_percentage: 75      # 전체 메모리의 75% 초과 시 데이터 드롭
    spike_limit_percentage: 15  # 급격한 스파이크 버퍼

  # ── 배치 처리 — 네트워크 효율 최적화 ────────────────────────────
  batch:
    send_batch_size: 512
    send_batch_max_size: 1024
    timeout: 5s

  # ── 리소스 감지 — 클라우드/K8s 환경 자동 태깅 ──────────────────
  resourcedetection:
    detectors: [env, k8s_node, docker, gcp, aws]
    timeout: 10s
    override: false

  # ── K8s 메타데이터 속성 추가 ─────────────────────────────────────
  k8sattributes:
    auth_type: serviceAccount
    passthrough: false
    filter:
      node_from_env_var: KUBE_NODE_NAME
    extract:
      metadata:
        - k8s.namespace.name
        - k8s.deployment.name
        - k8s.statefulset.name
        - k8s.daemonset.name
        - k8s.pod.name
        - k8s.pod.uid
        - k8s.node.name
        - container.id
        - container.image.name
        - container.image.tag
      labels:
        - tag_name: ai.service.layer
          key: ai-layer
          from: pod
        - tag_name: ai.model.name
          key: model
          from: pod

  # ── 속성 가공 — AI 도메인 전용 ───────────────────────────────────
  attributes/ai_enrich:
    actions:
      # llm.provider 표준화
      - key: llm.provider
        action: insert
        value: "unknown"
      # 민감 정보 마스킹 (프롬프트 내용 일부 마스킹)
      - key: llm.prompt.full_text
        action: delete
      # 환경 태그 추가
      - key: deployment.environment
        action: upsert
        from_attribute: DEPLOYMENT_ENV

  # ── Transform — OTTL로 고급 변환 ─────────────────────────────────
  transform/compute_metrics:
    error_mode: ignore
    metric_statements:
      # vLLM Prometheus 지표명을 OTel 시맨틱 컨벤션으로 변환
      - context: metric
        statements:
          - set(name, "llm.time_to_first_token") where name == "vllm:time_to_first_token_seconds"
          - set(name, "llm.tokens_per_second") where name == "vllm:generation_tokens_per_second"
          - set(unit, "ms") where name == "llm.time_to_first_token"
          - set(unit, "tok/s") where name == "llm.tokens_per_second"

  # ── 필터 — 노이즈 제거 ───────────────────────────────────────────
  filter/drop_health_checks:
    error_mode: ignore
    traces:
      span:
        - 'attributes["http.route"] == "/health"'
        - 'attributes["http.route"] == "/metrics"'
        - 'attributes["http.route"] == "/readyz"'
    metrics:
      metric:
        # 테스트 환경 메트릭 제외 (프로덕션 Collector만 적용)
        - 'resource.attributes["deployment.environment"] == "test"'

  # ── Tail Sampling — Gateway Collector 전용 ───────────────────────
  # (별도 파일 참조: tail-sampling.yaml)
  tail_sampling:
    decision_wait: 10s
    num_traces: 50000
    expected_new_traces_per_sec: 1000
    policies:
      - name: policy-error
        type: status_code
        status_code:
          status_codes: [ERROR]

      - name: policy-high-latency
        type: latency
        latency:
          threshold_ms: 5000

      - name: policy-llm-ttft-high
        type: and
        and:
          and_sub_policy:
            - name: has-ttft-attribute
              type: span_attribute
              span_attribute:
                key: llm.ttft_ms
                values: ["*"]
                enabled_regex_matching: false
            - name: ttft-threshold
              type: latency
              latency:
                threshold_ms: 2000

      - name: policy-guardrail-block
        type: span_attribute
        span_attribute:
          key: guardrail.action
          values: [BLOCK, REASK]
          enabled_regex_matching: false

      - name: policy-gpu-pressure
        type: span_attribute
        span_attribute:
          key: gpu.vram_utilization_pct
          values: ["*"]
          enabled_regex_matching: false
        # 후처리: vram > 90은 Alert 대시보드에서 필터

      - name: policy-external-timeout
        type: span_attribute
        span_attribute:
          key: external_api.timeout_occurred
          values: ["true"]
          enabled_regex_matching: false

      - name: policy-enterprise-user
        type: span_attribute
        span_attribute:
          key: user.tier
          values: [enterprise, premium]
          enabled_regex_matching: false

      - name: policy-probabilistic-baseline
        type: probabilistic
        probabilistic:
          sampling_percentage: 5    # 나머지 5% 무작위 보존 (기준선 유지)
```

---

### 3.3 Exporters

```yaml
# collector/config/otelcol-gateway.yaml (또는 otelcol-agent.yaml) (exporters 섹션)
exporters:

  # ── Prometheus — 메트릭 저장소 ───────────────────────────────────
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: "aiservice"
    const_labels:
      collector_version: "0.104.0"
    enable_open_metrics: true    # OpenMetrics 형식 (exemplar 지원)
    resource_to_telemetry_conversion:
      enabled: true              # Resource 속성을 Prometheus 레이블로 변환

  # ── Grafana Tempo — 트레이스 저장소 ─────────────────────────────
  otlp/tempo:
    endpoint: "tempo:4317"
    tls:
      insecure: true
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s
    sending_queue:
      enabled: true
      num_consumers: 10
      queue_size: 1000
      storage:
        type: file_storage        # 로컬 WAL — Collector 재시작 시 유실 방지
        directory: /var/otelcol/traces

  # ── Loki — 로그 저장소 ──────────────────────────────────────────
  loki:
    endpoint: "http://loki:3100/loki/api/v1/push"
    labels:
      resource:
        service.name: "service_name"
        deployment.environment: "env"
        k8s.namespace.name: "namespace"
      attributes:
        guardrail.action: "guardrail_action"
        llm.model: "model"

  # ── OTLP → 상위 Gateway Collector (Agent 모드에서 사용) ──────────
  otlp/gateway:
    endpoint: "otel-collector-gateway:4317"
    tls:
      insecure: false
      cert_file: /etc/otel/certs/collector.crt
      key_file: /etc/otel/certs/collector.key
    compression: gzip
    retry_on_failure:
      enabled: true
      initial_interval: 1s
      max_interval: 10s
    sending_queue:
      enabled: true
      storage:
        type: file_storage
        directory: /var/otelcol/queue

  # ── S3/MinIO — 장기 Cold Archive (30일+) ───────────────────────
  awss3:
    s3uploader:
      region: ap-northeast-2
      s3_bucket: "aiservice-telemetry-archive"
      s3_prefix: "otel"
      s3_partition: "minute"
      file_prefix: "traces"
      compression: gzip

  # ── 디버그 출력 (개발 환경 전용) ─────────────────────────────────
  debug:
    verbosity: detailed
    sampling_initial: 5
    sampling_thereafter: 200
```

---

### 3.4 Pipeline 조합 (Service 섹션)

```yaml
# collector/config/otelcol-gateway.yaml (또는 otelcol-agent.yaml) (service 섹션)
service:
  telemetry:
    logs:
      level: warn
      encoding: json
    metrics:
      level: detailed
      address: 0.0.0.0:8888   # Collector 자체 메트릭 (자기 참조 모니터링)

  extensions: [health_check, pprof, zpages, file_storage]

  pipelines:

    # ── 트레이스 파이프라인 (Agent 모드) ────────────────────────────
    traces/agent:
      receivers:  [otlp, jaeger]
      processors: [memory_limiter, k8sattributes, resourcedetection,
                   attributes/ai_enrich, filter/drop_health_checks, batch]
      exporters:  [otlp/gateway]

    # ── 트레이스 파이프라인 (Gateway 모드 — Tail Sampling 적용) ─────
    traces/gateway:
      receivers:  [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters:  [otlp/tempo, awss3]

    # ── 메트릭 파이프라인 ─────────────────────────────────────────
    metrics/main:
      receivers:  [otlp, prometheus, hostmetrics, k8s_cluster]
      processors: [memory_limiter, resourcedetection, k8sattributes,
                   transform/compute_metrics, filter/drop_health_checks, batch]
      exporters:  [prometheus]

    # ── 로그 파이프라인 ───────────────────────────────────────────
    logs/main:
      receivers:  [otlp]
      processors: [memory_limiter, k8sattributes, resourcedetection,
                   attributes/ai_enrich, batch]
      exporters:  [loki]

extensions:
  health_check:
    endpoint: 0.0.0.0:13133
    path: /health

  pprof:
    endpoint: 0.0.0.0:1777    # Go pprof — Collector 성능 프로파일링

  zpages:
    endpoint: 0.0.0.0:55679   # TraceZ, PipelineZ 실시간 디버깅

  file_storage:
    directory: /var/otelcol/storage
    timeout: 10s
    compaction:
      on_rebound: true
      rebound_needed_threshold_mib: 100
```

---

## 4. Tail-based Sampling 파이프라인

### 4.1 의사결정 흐름

```
모든 트레이스 수신 (100%)
         │
         ▼
┌────────────────────┐
│  decision_wait: 10s │  ← 트레이스 완료 대기 (루트 Span 종료 확인)
│  메모리 버퍼 유지   │
└────────┬───────────┘
         │
         ▼  정책 평가 (OR 조건)
┌────────────────────────────────────────────────────────────────┐
│  ① status_code == ERROR                        → SAMPLE (100%) │
│  ② 전체 레이턴시 > 5,000ms                     → SAMPLE (100%) │
│  ③ llm.ttft_ms > 2,000ms                       → SAMPLE (100%) │
│  ④ guardrail.action IN [BLOCK, REASK]          → SAMPLE (100%) │
│  ⑤ external_api.timeout_occurred == true       → SAMPLE (100%) │
│  ⑥ user.tier IN [enterprise, premium]          → SAMPLE (100%) │
│  ⑦ gpu.vram_utilization_pct 속성 보유 트레이스 → SAMPLE (50%)  │
│  ⑧ 확률적 기준선                               → SAMPLE (5%)   │
└────────────────────────────────────────────────────────────────┘
         │                          │
    SAMPLE 결정               DROP 결정
         │                          │
         ▼                          ▼
   Tempo / S3 전송              메모리에서 삭제
  (영구 보존)                (추적 불가, 비용 없음)
```

### 4.2 예상 샘플링 비율

$$
r_{final} = r_{error} + r_{latency} + r_{ttft} + r_{guardrail} + r_{timeout} + r_{enterprise} + r_{baseline}
$$

일반 프로덕션 트래픽 기준 추정치:

| 정책 | 해당 비율 | 보존율 |
|------|---------|--------|
| 에러 트레이스 | ~2% | 100% |
| 고레이턴시 (>5s) | ~3% | 100% |
| 고TTFT (>2s) | ~5% | 100% |
| 가드레일 차단 | ~3% | 100% |
| 외부 API 타임아웃 | ~1% | 100% |
| 엔터프라이즈 사용자 | ~10% | 100% |
| 확률적 기준선 | 나머지 76% | 5% |
| **합계** | **100%** | **~18.8%** |

**비용 절감 효과**: 전체 트레이스의 ~81% 폐기 → 저장 비용 대폭 절감

---

## 5. Context Propagation 상세 설계

### 5.1 W3C TraceContext 헤더 구조

```
traceparent: 00-{trace-id}-{parent-id}-{flags}
             ↑   ↑           ↑           ↑
          version 128bit    64bit      sampling flag
                  trace_id  span_id    (01=sampled)

tracestate: vendor1=value1,vendor2=value2
            (벤더별 추가 컨텍스트 — 옵션)

baggage: user.tier=enterprise,request.priority=high
         (비즈니스 컨텍스트 전파 — 하위 서비스에서도 접근 가능)
```

### 5.2 레이어 간 전파 매트릭스

```
                 Next.js  FastAPI  LangChain  vLLM  Pinecone  Redis
                 (Node)   (Python) (Python)  (HTTP)  (HTTP)   (TCP)
                 ───────  ───────  ─────────  ────  ────────  ─────
traceparent 전파    ✅       ✅        ✅        ✅      ✅       ✗ (*)
tracestate 전파     ✅       ✅        ✅        ✅      ✅       ✗
baggage 전파        ✅       ✅        ✅        ✅      ✗        ✗
gRPC metadata       N/A      ✅        ✅        ✅      ✅       ✗

(*) Redis: TCP 프로토콜 — OTel Semantic Conventions에서 전파 불지원.
    Redis span은 부모 span의 자식으로 생성되지만, Redis 서버 내부는 추적 불가.
```

### 5.3 Baggage 활용 전략

```python
# Baggage를 사용하여 하위 서비스까지 비즈니스 컨텍스트 전달
from opentelemetry.baggage import set_baggage, get_baggage
from opentelemetry import context

# FastAPI 미들웨어에서 Baggage 설정
async def ai_context_middleware(request: Request, call_next):
    ctx = context.get_current()

    # 사용자 정보를 Baggage에 삽입 → LangChain, vLLM까지 자동 전달
    ctx = set_baggage("user.tier", request.headers.get("x-user-tier", "standard"), ctx)
    ctx = set_baggage("request.id", request.headers.get("x-request-id", ""), ctx)
    ctx = set_baggage("session.id", request.headers.get("x-session-id", ""), ctx)

    token = context.attach(ctx)
    try:
        response = await call_next(request)
        return response
    finally:
        context.detach(token)

# 하위 서비스(vLLM 계측)에서 Baggage 읽기
def get_user_context():
    return {
        "user_tier": get_baggage("user.tier"),
        "request_id": get_baggage("request.id"),
        "session_id": get_baggage("session.id"),
    }
```

### 5.4 Trace ID 연속성 검증 쿼리

```python
# scripts/validate-traces.py
"""
Grafana Tempo API를 통해 Trace ID 단절 여부를 검증하는 스크립트
단절 기준: root span은 존재하나 vLLM span이 없는 트레이스
"""
import httpx
import json

TEMPO_URL = "http://localhost:3200"

async def find_broken_traces(start_time: str, end_time: str):
    """
    가드레일 span은 있는데 llm span이 없는 트레이스 = Context Propagation 단절
    """
    async with httpx.AsyncClient() as client:
        # TraceQL로 단절 트레이스 탐색
        response = await client.get(
            f"{TEMPO_URL}/api/search",
            params={
                "q": '{span.guardrail.action != ""} && !{span.llm.provider != ""}',
                "start": start_time,
                "end": end_time,
                "limit": 100,
            }
        )
        broken = response.json().get("traces", [])
        if broken:
            print(f"[WARN] Context Propagation 단절 트레이스 {len(broken)}개 발견!")
            for t in broken:
                print(f"  - TraceID: {t['traceID']}, Duration: {t['durationMs']}ms")
        else:
            print("[OK] 모든 트레이스의 Context Propagation 정상")
        return broken
```

---

## 6. 고가용성 Collector 배포 패턴

### 6.1 이중 Collector 아키텍처

```
Pod (AI Service)
    │
    │ OTLP gRPC
    ▼
┌─────────────────────────┐
│   Agent Collector        │  ← DaemonSet: 노드당 1개
│   (수집 전담)             │  CPU: 0.1 core, Mem: 256Mi
│                          │
│  - 빠른 수신              │
│  - 최소한의 처리          │
│  - 로컬 WAL 버퍼          │
└────────────┬────────────┘
             │ OTLP + gzip + TLS
             ▼
┌─────────────────────────┐
│   Gateway Collector      │  ← Deployment: 3+ replicas (HPA)
│   (처리/샘플링 전담)      │  CPU: 1 core, Mem: 2Gi
│                          │
│  - Tail Sampling         │
│  - 변환/강화             │
│  - 다중 Backend 팬아웃    │
└────────────┬────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
Prometheus        Grafana Tempo
(Metrics)          (Traces)
```

### 6.2 부하 분산 전략

```yaml
# Gateway Collector — LoadBalancing Exporter (Agent → Gateway 분산)
exporters:
  loadbalancing:
    protocol:
      otlp:
        tls:
          insecure: false
        timeout: 10s
    resolver:
      k8s:
        service: otel-collector-gateway
        ports: [4317]
        # 동일 Trace ID는 반드시 동일 Gateway로 → Tail Sampling 정확도 보장
```

---

## 7. 로컬 개발 환경 (Docker Compose)

```yaml
# infra/docker/docker-compose.yaml
version: "3.9"

networks:
  monitoring:
    driver: bridge

volumes:
  prometheus_data: {}
  grafana_data: {}
  tempo_data: {}
  loki_data: {}
  otelcol_storage: {}

services:

  # ── OTel Collector ───────────────────────────────────────────────
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.91.0
    command: ["--config=/etc/otelcol/otelcol-config.yaml"]
    volumes:
      - ../../collector/config/otelcol-gateway.yaml (또는 otelcol-agent.yaml):/etc/otelcol/otelcol-config.yaml:ro
      - otelcol_storage:/var/otelcol/storage
    ports:
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
      - "8888:8888"    # Collector 자체 메트릭
      - "8889:8889"    # Prometheus exporter
      - "13133:13133"  # Health check
      - "55679:55679"  # zpages (디버깅)
    environment:
      - GOGC=80
    networks: [monitoring]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:13133/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Prometheus ───────────────────────────────────────────────────
  prometheus:
    image: prom/prometheus:v2.53.0
    command:
      - "--config.file=/etc/prometheus/prometheus.yaml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=15d"
      - "--web.enable-remote-write-receiver"
      - "--enable-feature=exemplar-storage"  # Trace-Metric 연동
    volumes:
      - ../../infra/docker/prometheus.yaml:/etc/prometheus/prometheus.yaml:ro
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    networks: [monitoring]

  # ── Grafana Tempo (트레이스 저장소) ─────────────────────────────
  tempo:
    image: grafana/tempo:2.5.0
    command: ["-config.file=/etc/tempo/tempo.yaml"]
    volumes:
      - ../../infra/docker/tempo.yaml:/etc/tempo/tempo.yaml:ro
      - tempo_data:/var/tempo
    ports:
      - "3200:3200"    # Tempo HTTP API
      - "9095:9095"    # Tempo gRPC
      - "4319:4317"    # OTLP gRPC (Collector → Tempo)
    networks: [monitoring]

  # ── Grafana Loki (로그 저장소) ───────────────────────────────────
  loki:
    image: grafana/loki:3.1.0
    command: ["-config.file=/etc/loki/loki.yaml"]
    volumes:
      - ../../infra/docker/loki.yaml:/etc/loki/loki.yaml:ro
      - loki_data:/loki
    ports:
      - "3100:3100"
    networks: [monitoring]

  # ── Grafana (시각화) ─────────────────────────────────────────────
  grafana:
    image: grafana/grafana:11.1.0
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_FEATURE_TOGGLES_ENABLE=traceqlEditor,metricsSummary
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
    volumes:
      - grafana_data:/var/lib/grafana
      - ../../infra/docker/grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml:ro
      - ../../dashboards/grafana:/etc/grafana/provisioning/dashboards:ro
    ports:
      - "3000:3000"
    depends_on: [prometheus, tempo, loki]
    networks: [monitoring]
```

---

## 8. 프로덕션 배포 (Kubernetes)

### 8.1 네임스페이스 및 RBAC

```yaml
# infra/kubernetes/namespace-rbac.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    app.kubernetes.io/managed-by: aiservice-monitoring
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: otel-collector
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: otel-collector
rules:
  - apiGroups: [""]
    resources: [nodes, nodes/proxy, nodes/metrics, services, endpoints, pods]
    verbs: [get, list, watch]
  - apiGroups: [extensions, networking.k8s.io]
    resources: [ingresses]
    verbs: [get, list, watch]
  - nonResourceURLs: [/metrics, /metrics/cadvisor]
    verbs: [get]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: otel-collector
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: otel-collector
subjects:
  - kind: ServiceAccount
    name: otel-collector
    namespace: monitoring
```

### 8.2 Agent DaemonSet (노드당 1개)

```yaml
# infra/kubernetes/otelcol-agent-daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: otel-collector-agent
  namespace: monitoring
  labels:
    app: otel-collector
    role: agent
spec:
  selector:
    matchLabels:
      app: otel-collector
      role: agent
  template:
    metadata:
      labels:
        app: otel-collector
        role: agent
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8888"
    spec:
      serviceAccountName: otel-collector
      hostNetwork: false
      tolerations:
        - effect: NoSchedule
          operator: Exists
        - effect: NoExecute
          operator: Exists
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.91.0
          args: ["--config=/conf/otelcol-agent.yaml"]
          env:
            - name: KUBE_NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: GOGC
              value: "80"
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          ports:
            - containerPort: 4317   # OTLP gRPC
            - containerPort: 4318   # OTLP HTTP
            - containerPort: 8888   # 자체 메트릭
            - containerPort: 13133  # Health check
          livenessProbe:
            httpGet:
              path: /health
              port: 13133
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 13133
            initialDelaySeconds: 5
            periodSeconds: 5
          volumeMounts:
            - name: otelcol-config
              mountPath: /conf
            - name: otelcol-storage
              mountPath: /var/otelcol/storage
      volumes:
        - name: otelcol-config
          configMap:
            name: otel-collector-agent-config
        - name: otelcol-storage
          hostPath:
            path: /var/otelcol/storage
            type: DirectoryOrCreate
```

### 8.3 Gateway Deployment (HPA 적용)

```yaml
# infra/kubernetes/otelcol-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector-gateway
  namespace: monitoring
spec:
  replicas: 3
  selector:
    matchLabels:
      app: otel-collector
      role: gateway
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: otel-collector
        role: gateway
    spec:
      serviceAccountName: otel-collector
      affinity:
        # Gateway 인스턴스를 서로 다른 노드에 분산
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: otel-collector
                    role: gateway
                topologyKey: kubernetes.io/hostname
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.91.0
          args: ["--config=/conf/otelcol-gateway.yaml"]
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 4Gi     # Tail Sampling 버퍼 (50k traces × ~80KB)
          volumeMounts:
            - name: otelcol-config
              mountPath: /conf
            - name: otelcol-storage
              mountPath: /var/otelcol
      volumes:
        - name: otelcol-config
          configMap:
            name: otel-collector-gateway-config
        - name: otelcol-storage
          emptyDir: {}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: otel-collector-gateway-hpa
  namespace: monitoring
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: otel-collector-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
```

---

## 9. 데이터 보존 및 비용 전략

### 9.1 계층별 데이터 보존 정책

| 데이터 유형 | Hot Storage | Warm Storage | Cold Archive |
|-----------|------------|-------------|-------------|
| **트레이스** (Sampled) | Tempo 7일 | — | S3/MinIO 90일 |
| **메트릭** | Prometheus 15일 | Thanos 90일 | Parquet/S3 1년 |
| **로그** | Loki 7일 | — | S3 30일 |
| **AI 핵심 메트릭** (TTFT/TPS/GPU) | Prometheus 30일 | Thanos 1년 | 영구 보존 |

### 9.2 저장 비용 추정

$$
C_{storage} = V_{traces} \times r_{sample} \times P_{trace} + V_{metrics} \times P_{metric}
$$

예시 (1,000 RPS 기준):

| 항목 | 수치 | 월간 비용 (S3 기준) |
|------|------|-------------------|
| 전체 트레이스 (샘플링 전) | ~86.4억 span/일 | —— |
| 샘플링 후 트레이스 (~19%) | ~16억 span/일 | ~$120/월 |
| 메트릭 시계열 (15초 간격) | ~50,000 series | ~$80/월 |
| 로그 (에러/경보만) | ~500MB/일 | ~$15/월 |
| **합계** | | **~$215/월** |

---

---

## 10. 주요 버전 호환성 참고

| 컴포넌트 | 이 프로젝트 사용 버전 | 비고 |
|---------|---------------------|------|
| OTel Collector Contrib | v0.91.0 | Helm values.yaml, Docker Compose |
| OTel Specification | v1.31 | Semantic Conventions v1.26 |
| Prometheus | v2.53.0 | docker-compose.yaml |
| Grafana | v11.1.0 | docker-compose.yaml |
| Grafana Tempo | v2.5.0 | docker-compose.yaml |
| Grafana Loki | v3.1.0 | docker-compose.yaml |
| DCGM Exporter | v3.3.5-3.4.0 | K8s DaemonSet |
| Python OTel SDK | >=1.24.0 | opentelemetry-sdk |
| Node.js OTel SDK | >=1.22.0 | @opentelemetry/sdk-node |
| Go OTel SDK | >=1.26.0 | go.opentelemetry.io/otel |

> **참고**: OTel Collector 버전은 v0.91.0을 기준으로 하지만, 설정 파일은 v0.104+ Collector에서도 호환됩니다.
> Collector 업그레이드 시 `otelcol validate --config` 명령으로 설정 호환성을 확인하세요.

---

*이 문서는 프로젝트 아키텍처 변경 시 업데이트합니다.*
*관련 문서: [METRICS_DESIGN.md](./METRICS_DESIGN.md) | [TEST_GUIDE.md](./TEST_GUIDE.md) | [LOCAL_SETUP.md](./LOCAL_SETUP.md)*
