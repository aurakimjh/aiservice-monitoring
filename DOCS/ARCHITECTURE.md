# OpenTelemetry 아키텍처 설계

> **문서 버전**: v3.5.0
> **기반 스펙**: OTel Collector Contrib v0.91.0+ | OpenTelemetry Specification v1.31
> **관점**: SRE — 프로덕션 즉시 적용 가능 수준
> **최종 업데이트**: 2026-03-25 (Phase 32 완료 — GPU 멀티벤더 지원 / Phase 30 AGPL-free 인프라 전환 / Phase 29 Enterprise·Lite 모드 / Phase 27 StorageBackend / Phase 26 미들웨어·Redis / Phase 25 서버 그룹·중앙 설정 / Phase 24 Java·.NET SDK)
>
> **관련 문서**:
> - [METRICS_DESIGN.md](./METRICS_DESIGN.md) — 레이어별 지표 정의, 수식, 계측 코드
> - [UI_DESIGN.md](./UI_DESIGN.md) — 통합 모니터링 대시보드 UI 설계 (44개 화면)
> - [AGENT_DESIGN.md](./AGENT_DESIGN.md) — AITOP Agent 상세 설계 (Go, 12개 Collector, Fleet, CLI)
> - [LOCAL_SETUP.md](./LOCAL_SETUP.md) — 로컬 개발 환경 구성 가이드
> - [TEST_GUIDE.md](./TEST_GUIDE.md) — 통합 테스트 전략 (매뉴얼 + AI 교차검증)
> - [XLOG_DASHBOARD_REDESIGN.md](./XLOG_DASHBOARD_REDESIGN.md) — XLog/HeatMap 대시보드 상세 설계
> - [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md) — 솔루션 방향성, 경쟁 분석, 완성도 평가, 로드맵
> - [JAVA_DOTNET_SDK_DESIGN.md](./JAVA_DOTNET_SDK_DESIGN.md) — Java/.NET SDK 및 메소드 프로파일링 설계 (Phase 24 완료)
> - [E2E_REDESIGN.md](./E2E_REDESIGN.md) — E2E 테스트 시나리오 재설계

---

## 이 문서를 읽기 전에 — 핵심 개념 이해하기

> 이 섹션은 OpenTelemetry나 모니터링에 익숙하지 않은 분을 위한 안내입니다.
> 이미 알고 계신다면 [목차](#목차)로 바로 이동하세요.

### OpenTelemetry란?

**고속도로 CCTV 시스템**이라고 생각하면 됩니다.

고속도로에 CCTV가 없으면 어디서 사고가 났는지, 어디가 정체되는지 알 수 없습니다.
마찬가지로 AI 서비스에 OpenTelemetry가 없으면 "어디서 느려지는지" 알 수 없습니다.

OpenTelemetry(줄여서 OTel)는 소프트웨어의 성능을 측정하고 기록하는 **국제 표준 도구**입니다.
Google, Microsoft, Amazon 등이 함께 만들었으며, 무료 오픈소스입니다.

### Trace / Span / Metric이란?

**택배 추적 시스템**에 비유하면 이해하기 쉽습니다:

- **Trace (트레이스)** = **택배 추적번호**. 하나의 사용자 요청이 시스템을 통과하는 전체 여정입니다. 추적번호 하나로 "주문 → 물류센터 → 배송 → 도착"까지 추적하듯, Trace ID 하나로 요청의 전체 경로를 추적합니다.

- **Span (스팬)** = **구간별 기록**. "물류센터에서 3시간 소요", "배송에 2시간 소요"처럼 각 구간의 시작/종료 시간과 상태를 기록합니다.

- **Metric (메트릭)** = **통계 수치**. "오늘 택배 1000건 처리", "평균 배송 시간 4시간"처럼 집계된 수치입니다. TTFT(첫 토큰 시간), TPS(초당 토큰 수) 등이 AI 서비스의 핵심 Metric입니다.

### Collector란?

OTel Collector는 **중앙 우체국**과 같습니다.

각 서비스(택배 지점)에서 보내는 성능 데이터(편지)를 **한곳에서 수집**하고,
필요한 곳(Prometheus, Jaeger, 자체 UI)으로 **분류 배달**합니다.

```
[서비스 A] ──┐                    ┌──▶ Prometheus (숫자 저장)
[서비스 B] ──┼──▶ [OTel Collector] ──┼──▶ Jaeger (추적 저장)
[서비스 C] ──┘    (중앙 우체국)      └──▶ 자체 UI (시각화)
```

### 왜 AI 서비스에 모니터링이 필요한가?

일반 웹 서비스와 달리 AI 서비스는 **어디서 느려지는지 찾기가 매우 어렵습니다**:
- 가드레일이 느린 건지? → 안전 검사에서 병목
- 벡터 검색이 느린 건지? → 문서 DB에서 병목
- LLM 추론이 느린 건지? → GPU 부족에서 병목
- 외부 API가 응답이 없는 건지? → 네트워크에서 병목

이 프로젝트는 각 단계별 소요 시간을 **자동으로 측정**하여,
"문제의 원인"을 빠르게 찾을 수 있게 해줍니다.

> 더 자세한 AI 서비스 처리 흐름은 [AI_SERVICE_FLOW.md](./AI_SERVICE_FLOW.md)를 참고하세요.

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

> **📌 이 섹션에서 배울 내용**
> - 시스템의 전체 지도 — 세 개의 레이어(계측 → 수집 → 저장/시각화)가 어떻게 연결되는지
> - 어떤 컴포넌트가 어떤 역할을 하는지
> - 데이터가 발생해서 대시보드에 표시되기까지의 전체 흐름
>
> **💡 한 줄 요약**: "AI 서비스 코드에 탐지기를 달고(계측) → 중앙 허브에서 수집/변환하고(Collector) → 전용 DB에 저장 후 자체 Next.js UI로 시각화한다"

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     AI Service Observability Platform                         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ┌─────────────────── 계측 레이어 (Instrumentation) ─────────────────────┐  ║
║  │                                                                         │  ║
║  │  [Python Services]    [Node.js Services]  [Go Services]  [Java/.NET] ▶  │  ║
║  │  FastAPI + OTel SDK   Next.js + OTel SDK  Ollama/Weaviate Spring Boot  │  ║
║  │  LangChain / vLLM     Frontend Streaming   OTel Go SDK   ASP.NET Core  │  ║
║  │  Guardrails/Embeddings Browser RUM         gRPC          ByteBuddy/CLR │  ║
║  │        │                    │                   │               │       │  ║
║  │        └────────────────────┴───────────────────┴───────────────┘       │  ║
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
║  │   │  Exporters:  Prometheus │ Jaeger │ awss3(archive) │ debug/file  │     │  ║
║  │   └──────────────────────────────────────────────────────────────┘     │  ║
║  │                                                                         │  ║
║  │   ┌──────────────────┐   ┌─────────────┐                               │  ║
║  │   │ GPU Collector    │   │Node Exporter│  ← GPU / 호스트 메트릭 전용    │  ║
║  │   │NVIDIA/AMD/Intel  │   └──────┬──────┘                               │  ║
║  │   │Apple/Cloud GPU   │          │                                       │  ║
║  │   └──────┬───────────┘          │                                       │  ║
║  └──────────┼────────────────┼─────────────────────────────────────────────┘  ║
║             │                │                                                 ║
║  ┌──────────▼────────────────▼────── 저장/분석 레이어 (Storage) ───────┐     ║
║  │                                                                       │     ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │     ║
║  │  │ Prometheus │  │   Jaeger   │  │stdout/file │  │StorageBackend │  │     ║
║  │  │ (Metrics)  │  │ (Traces)   │  │  (Logs)    │  │S3/Local/Dual  │  │     ║
║  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └───────────────┘  │     ║
║  │        └───────────────┴───────────────┘                               │     ║
║  │                         │ Unified Query                                 │     ║
║  │               ┌─────────▼──────────┐                                   │     ║
║  │               │  자체 Next.js UI   │  ← 단일 통합 대시보드 (AGPL-free)  │     ║
║  │               └────────────────────┘                                   │     ║
║  └───────────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 레이어 설명 (그림 이해 가이드)

```
┌──────────────────────────────────────────────────────────────┐
│ 레이어 1: 계측 (Instrumentation)                              │
│  — AI 서비스 코드에 "측정 장치"를 심는 단계                     │
│  — Python, Node.js, Go 각 언어의 SDK가 Span/Metric을 생성     │
│  — 비유: 자동차에 각종 센서 장착                               │
└──────────────────────┬───────────────────────────────────────┘
                       │ OTLP (텔레메트리 전송 프로토콜)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ 레이어 2: 수집 (Collection)                                   │
│  — OTel Collector가 데이터를 받아 처리하는 단계                 │
│  — Agent(수집 전담) → Gateway(처리/샘플링 전담) 이중 구조       │
│  — 비유: 중앙 우체국 — 편지를 모아서 분류·배송                  │
└──────────────────────┬───────────────────────────────────────┘
                       │ Prometheus/OTLP/stdout 프로토콜
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ 레이어 3: 저장/시각화 (Storage & Visualization)               │
│  — 각 데이터 유형별 전문 저장소 + 자체 Next.js UI 단일 대시보드  │
│  — Prometheus(숫자), Jaeger(추적), stdout/file(로그)          │
│  — StorageBackend: Evidence 파일 저장 (S3/Local/Dual 전환 가능) │
│  — 비유: 도서관 — 자료를 분류·보관하고 열람 제공                │
└──────────────────────────────────────────────────────────────┘
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

> **📌 이 섹션에서 배울 내용**
> - 폴리글랏(Polyglot) 환경 — Python, Node.js, Go 여러 언어가 공존하는 시스템에서 OTel SDK를 초기화하는 방법
> - 언어가 달라도 동일한 Trace ID로 연결되는 원리 (W3C TraceContext 헤더)
> - 각 언어별 SDK 초기화 코드 패턴 및 중요 설정값
>
> **💡 왜 여러 언어를 지원해야 하나요?**
>
> 실제 AI 서비스는 한 가지 언어로만 만들어지지 않습니다:
> - **Python** — AI/ML 생태계의 표준 (LangChain, vLLM, PyTorch 등)
> - **Node.js** — 빠른 I/O, 웹 프론트엔드 (Next.js, React)
> - **Go** — 고성능 인프라 서비스 (Ollama, 커스텀 프록시)
> - **Java** — 엔터프라이즈 백엔드의 표준 (Spring Boot, Tomcat); AI 서비스를 호출하는 게이트웨이 역할이 흔함. OTel Java Agent + ByteBuddy 바이트코드 계측으로 코드 변경 없이 메소드 수준 프로파일링 지원 (✅ Phase 24 완료)
> - **.NET (C#)** — 엔터프라이즈 Windows/Azure 환경 (ASP.NET Core); CLR Profiling API 기반 메소드 계측 지원 (✅ Phase 24 완료)
>
> → 상세 설계: [JAVA_DOTNET_SDK_DESIGN.md](./JAVA_DOTNET_SDK_DESIGN.md)
>
> 각 언어의 OTel SDK 설정이 달라도 **동일한 traceparent 헤더**를 HTTP 요청에 실어 보내면,
> 서로 다른 서비스의 처리 과정이 하나의 Trace로 합쳐집니다.
>
> ```
> [브라우저] → [Next.js] → [FastAPI] → [vLLM]
>     같은 trace_id: aabbccdd...  ←── 헤더 하나로 모두 연결
> ```

### 2.1 언어별 SDK 초기화 패턴

#### Python (FastAPI / LangChain / vLLM)

> **이 코드가 하는 일**: Python 서비스가 시작될 때 딱 한 번 호출하는 초기화 함수입니다.
> 이 함수를 호출하면 이후 FastAPI, httpx, Redis 등의 모든 요청이 **자동으로** 계측됩니다.
> `setup_otel("guardrails-service")` 처럼 서비스 이름만 넘기면 됩니다.

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

> **이 코드가 하는 일**: Node.js 서비스 실행 시 가장 먼저 로드하는 OTel 설정 파일입니다.
> `-r ./otel-setup.js` 플래그로 서비스 코드보다 먼저 실행하면,
> HTTP 요청/응답, fetch 호출 등이 **코드 수정 없이** 자동으로 계측됩니다.

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

> **이 코드가 하는 일**: Go 서비스의 `main()` 함수에서 한 번 호출하는 OTel 초기화 코드입니다.
> Python/Node.js와 달리 Go는 자동 계측이 제한적이라 직접 코드에 Span을 추가해야 합니다.
> `shutdown` 함수는 서비스 종료 시 반드시 호출해야 수집 중인 데이터가 유실되지 않습니다.

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

> **초보자 가이드**: 아래 그림에서 각 화살표는 HTTP 요청입니다.
> 모든 요청 헤더에는 `traceparent: 00-{동일한 trace_id}-{span_id}-01` 값이 붙습니다.
> 이 값 덕분에 "브라우저에서 vLLM까지" 하나의 Trace로 연결됩니다.
> 오른쪽의 `[OTel Collector]`는 각 서비스에서 보내는 Span 데이터를 실시간 수신합니다.

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
                                      Prometheus         Jaeger       stdout/file
                                      (Metrics)         (Traces)        (Logs)
```

---

## 3. OTel Collector 파이프라인 설계

> **📌 이 섹션에서 배울 내용**
> - OTel Collector의 내부 구조 — Receiver(수신) → Processor(처리) → Exporter(배송) 3단 파이프라인
> - 각 컴포넌트의 역할과 설정 방법
> - 실제 YAML 설정 파일의 의미
>
> **💡 왜 Receiver → Processor → Exporter 구조인가요?**
>
> 이 구조는 공항의 **보안 검색대**에 비유할 수 있습니다:
>
> ```
> 승객 탑승      →   보안 검색     →   탑승구 배정
> (Receiver)        (Processor)       (Exporter)
>
> 데이터 수신    →   변환/필터링   →   저장소로 전달
> ┌───────────┐     ┌───────────┐     ┌───────────┐
> │ OTLP 수신 │ ──▶ │ 배치 처리 │ ──▶ │Prometheus │
> │ Prometheus│     │ K8s 태그  │     │Jaeger     │
> │ hostmetrics│    │ 샘플링    │     │stdout/file│
> └───────────┘     └───────────┘     └───────────┘
> ```
>
> 이 분리 구조의 장점:
> - **확장성**: Receiver/Exporter를 각각 교체해도 Processor는 재사용
> - **유연성**: 동일 데이터를 여러 Exporter로 동시에 전송 가능
> - **안정성**: Processor에서 문제가 생겨도 수신은 계속됨

### 3.1 Receivers

> **Receiver란?** 외부에서 데이터를 **받아들이는** 입구입니다.
> 각 서비스의 OTel SDK, Prometheus Exporter, 호스트 시스템 등 다양한 소스에서 데이터를 수집합니다.
>
> 아래 설정에서 핵심:
> - `otlp`: SDK에서 직접 보내는 트레이스/메트릭/로그 수신 (가장 중요)
> - `prometheus`: GPU Collector(NVIDIA/AMD/Intel/Apple), Node Exporter 같이 Prometheus 형식으로 노출된 메트릭 수집
> - `hostmetrics`: CPU, 메모리, 디스크 등 서버 자원 자동 수집
> - `jaeger`: 기존 Jaeger 계측 코드를 마이그레이션 없이 수용 (호환성)

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

  # ── Prometheus Pull: GPU Collector(멀티벤더), Node Exporter 스크레이프 ──
  prometheus:
    config:
      scrape_configs:

        # GPU 메트릭 (GPU Collector — NVIDIA/AMD/Intel/Apple/Cloud)
        - job_name: 'gpu-collector'
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

> **Processor란?** 수신한 데이터를 **변환/필터링/강화**하는 중간 단계입니다.
> 여러 Processor를 순서대로 연결해서 파이프라인을 구성합니다.
>
> 아래 설정에서 중요한 Processor들:
> - `memory_limiter` — **가장 먼저** 적용. 메모리가 임계치를 넘으면 데이터를 버려서 Collector OOM(메모리 초과) 방지
> - `batch` — 네트워크 요청을 묶어서 전송. 512개 Span을 모아서 한 번에 전송 = 네트워크 비용 절감
> - `k8sattributes` — Pod 이름, 네임스페이스 등 K8s 메타데이터를 Span에 자동 태깅
> - `tail_sampling` — 섹션 4에서 자세히 설명. 비용 절감을 위한 지능형 샘플링

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

> **Exporter란?** 처리된 데이터를 **최종 목적지로 배송**하는 출구입니다.
> 하나의 데이터를 여러 Exporter로 동시에 보낼 수 있습니다 (섹션 3.4의 pipeline 설정 참고).
>
> 각 Exporter가 어떤 저장소로 데이터를 보내는지:
>
> ```
> ┌────────────────────────────────────────────────────┐
> │            Exporter 목적지 매핑                     │
> ├─────────────────┬──────────────────────────────────┤
> │ prometheus      │ → Prometheus (메트릭 숫자 저장)        │
> │ otlp/jaeger     │ → Jaeger (트레이스 저장, Apache 2.0) │
> │ debug/file      │ → stdout/파일 (로그, 자체 뷰어)      │
> │ awss3           │ → AWS S3 / LocalBackend (장기 아카이브) │
> │ debug           │ → 터미널 출력 (개발 환경만)            │
> └─────────────────┴──────────────────────────────────┘
> ```
>
> **WAL(Write-Ahead Log)이란?** `file_storage` 타입의 큐를 설정하면, Collector가 재시작되어도 전송되지 않은 데이터가 디스크에 남아 다시 전송됩니다. 데이터 유실 방지의 핵심입니다.

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

  # ── Jaeger — 트레이스 저장소 (Apache 2.0, Phase 30 Tempo 대체) ──
  otlp/jaeger:
    endpoint: "jaeger:4317"
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

  # ── 로그: debug exporter → stdout / 파일 ─────────────────────────
  # Phase 30: Grafana Loki(AGPL) → OTel debug exporter + 자체 로그 뷰어로 대체
  debug/logs:
    verbosity: normal
    sampling_initial: 10
    sampling_thereafter: 100
  file/logs:
    path: /var/log/otelcol/app.log
    rotation:
      max_megabytes: 100
      max_days: 7

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

  # ── AWS S3 — 장기 Cold Archive (30일+) ─────────────────────────
  # Phase 30: MinIO 서버(AGPL) 제거 → AWS S3 또는 LocalBackend 사용
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

> **Pipeline이란?** Receiver + Processor + Exporter를 **연결하는 배선**입니다.
> `traces/agent`, `metrics/main` 같이 이름을 붙여 여러 파이프라인을 독립적으로 운영합니다.
>
> 아래 설정을 읽는 방법:
> ```yaml
> traces/agent:            # 파이프라인 이름 (데이터타입/용도)
>   receivers:  [otlp]     # 이 Receiver에서 데이터를 받아
>   processors: [batch]    # 이 Processor들을 순서대로 거쳐
>   exporters:  [otlp/gateway]  # 이 Exporter로 내보낸다
> ```

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

> **📌 이 섹션에서 배울 내용**
> - Sampling(샘플링)이란 무엇인지, 왜 필요한지
> - Head-based vs Tail-based 차이
> - AITOP의 샘플링 정책 10가지와 예상 비용 절감 효과
>
> **💡 배경 지식: Sampling이란?**
>
> 1,000 TPS(초당 요청)의 AI 서비스에서 모든 트레이스를 저장하면 하루에 수백 GB가 쌓입니다.
> 그 중 대부분은 "정상 동작" — 저장해봐야 볼 일이 없습니다.
>
> **Sampling = "중요한 것만 골라서 저장"**
>
> ```
> 전체 트레이스 100% 수신
>      │
>      ├── 에러 발생?  → 무조건 저장 (100%)  ← 문제 원인 파악에 필수
>      ├── 응답이 느림? → 무조건 저장 (100%)  ← 성능 문제 분석에 필수
>      ├── 엔터프라이즈 고객? → 저장 (100%)   ← SLA(서비스 수준 계약) 준수
>      └── 정상 요청?  → 5%만 저장            ← 통계 기준선 유지용
> ```
>
> **💡 왜 Head-based가 아닌 Tail-based인가요?**
>
> - **Head-based** (앞에서 결정): 요청 시작 시점에 "저장할지 말지" 결정. 빠르지만 "나중에 에러가 날지" 알 수 없어서 에러 트레이스를 놓칠 수 있음
> - **Tail-based** (끝에서 결정): 요청이 완전히 끝난 후 "에러였나? 느렸나?" 확인 후 결정. 느리지만 **중요한 트레이스를 하나도 놓치지 않음**
>
> 이 프로젝트는 `decision_wait: 10s` — 요청 완료 후 10초 대기하며 모든 Span을 모은 다음 판단합니다.

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

> **📌 이 섹션에서 배울 내용**
> - Context Propagation(컨텍스트 전파)이란 무엇인지
> - W3C TraceContext 헤더 형식과 의미
> - Baggage를 통해 비즈니스 정보를 하위 서비스까지 전달하는 방법
>
> **💡 왜 Context Propagation이 필요한가요?**
>
> 사용자 요청 하나가 여러 서비스를 거칩니다:
> ```
> [브라우저] → [Next.js] → [FastAPI] → [LangChain] → [vLLM]
> ```
>
> 각 서비스는 독립된 프로세스라서, 아무 설정 없이는 서로 다른 Trace를 만듭니다.
> Context Propagation은 **"이 요청이 연결되어 있다"는 정보를 HTTP 헤더에 담아 전달**하는 기법입니다.
>
> ```
> [Next.js]                              [FastAPI]
>  traceparent:                           traceparent 헤더 읽음
>  "00-aabb...-0011...-01"  ──HTTP──▶    → 동일 Trace ID 사용
>                                        → 새 child Span 생성
> ```
>
> 결과: Grafana에서 "이 사용자 요청의 전체 여정"을 한 화면에서 볼 수 있음

### 5.1 W3C TraceContext 헤더 구조

```
traceparent: 00-{trace-id}-{parent-id}-{flags}
             ↑   ↑           ↑           ↑
          version 128bit    64bit      sampling flag
          (항상 00)trace_id  span_id    (01=저장함)

실제 예시:
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                └─────────────────────────────┘ └──────────────┘ └┘
                         Trace ID (전체 여정)    현재 Span ID     저장

tracestate: vendor1=value1,vendor2=value2
            (벤더별 추가 컨텍스트 — 옵션)

baggage: user.tier=enterprise,request.priority=high
         (비즈니스 컨텍스트 전파 — 하위 서비스에서도 접근 가능)
         ← 이 값은 LangChain, vLLM 등 모든 하위 서비스에서 읽을 수 있음
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

> **📌 이 섹션에서 배울 내용**
> - 왜 Collector를 두 계층(Agent + Gateway)으로 분리하는지
> - DaemonSet(노드당 1개)과 Deployment(중앙 복수 인스턴스)의 차이
> - 부하 분산과 데이터 유실 방지 전략
>
> **💡 왜 Agent와 Gateway를 분리하나요?**
>
> 하나의 Collector에 모든 기능을 넣으면 어떤 문제가 생길까요?
>
> ```
> 문제 시나리오:
> AI 서비스 → Collector(모든 역할) → 저장소
>
> Tail Sampling이 트레이스 50,000개를 10초간 메모리에 보관 중...
> → 갑자기 트래픽 급증 → Collector 메모리 부족 → OOM 강제 종료
> → 그동안 받은 텔레메트리 데이터 전부 유실 ❌
> ```
>
> **분리 해결책:**
> ```
> AI 서비스 → Agent Collector (경량, 수집 전담)
>                │  데이터 전달
>                ▼
>         Gateway Collector (고사양, 샘플링/변환 전담)
>
> Agent가 죽어도 Gateway가, Gateway가 죽어도 Agent가 버퍼링
> → 이중 안전망
> ```

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

> **📌 이 섹션에서 배울 내용**
> - 로컬에서 전체 모니터링 스택을 Docker로 띄우는 방법
> - 각 서비스의 역할과 접속 주소
> - Docker Compose 설정 파일 읽는 방법
>
> **💡 왜 이렇게 많은 서비스가 필요한가요?**
>
> 각 서비스는 한 가지 일에 특화되어 있습니다:
>
> ```
> ┌────────────────────────────────────────────────────────────────┐
> │  서비스          │  역할              │  비유                   │
> ├─────────────────┼──────────────────┼─────────────────────────┤
> │  otel-collector  │  데이터 수집/라우팅 │  중앙 우체국            │
> │  prometheus      │  숫자(메트릭) 저장 │  엑셀 스프레드시트      │
> │  grafana tempo   │  추적(트레이스) 저장│  GPS 경로 기록         │
> │  grafana loki    │  로그 저장        │  일기장                 │
> │  grafana         │  통합 시각화      │  계기판                 │
> │  jaeger          │  트레이스 빠른 확인 │  간이 조회 도구        │
> └─────────────────┴──────────────────┴─────────────────────────┘
> ```
>
> 프로덕션에서는 이 서비스들이 각각 별도 서버에서 클러스터로 운영됩니다.
> 로컬에서는 Docker Compose로 한 머신에서 모두 실행합니다.
>
> **Docker Compose 설정 파일 읽는 방법:**
> ```yaml
> services:
>   otel-collector:          # 서비스 이름 (컨테이너 내부 호스트명으로도 사용)
>     image: otel/...        # 사용할 Docker 이미지
>     volumes:               # 로컬 파일 ↔ 컨테이너 내부 파일 연결
>     ports:                 # 로컬 포트 : 컨테이너 포트 매핑
>     healthcheck:           # 서비스 정상 여부 자동 확인
>     networks: [monitoring] # 서비스 간 통신용 내부 네트워크
> ```

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

  # ── Jaeger (트레이스 저장소, Apache 2.0) ──────────────────────────
  # Phase 30: Grafana Tempo(AGPL) → Jaeger 대체 완료
  jaeger:
    image: jaegertracing/all-in-one:1.58
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"  # Jaeger UI
      - "4317:4317"    # OTLP gRPC (Collector → Jaeger)
      - "4318:4318"    # OTLP HTTP
    networks: [monitoring]

  # ── 로그: OTel debug exporter + 자체 로그 뷰어 ───────────────────
  # Phase 30: Grafana Loki(AGPL) 제거 → stdout/file exporter + 자체 UI
  # 로그는 OTel Collector의 debug/file exporter를 통해 처리됨

  # ── 자체 Next.js UI (시각화) ─────────────────────────────────────
  # Phase 30: Grafana(AGPL) → 자체 Next.js 대시보드로 완전 대체
  # 상용 배포: docker-compose.commercial.yaml 사용
  aitop-ui:
    image: aitop/ui:latest
    ports:
      - "3000:3000"
    depends_on: [prometheus, jaeger]
    networks: [monitoring]
```

---

## 8. 프로덕션 배포 (Kubernetes)

> **📌 이 섹션에서 배울 내용**
> - Kubernetes(K8s) 환경에서 OTel Collector를 배포하는 방법
> - DaemonSet vs Deployment 배포 전략 차이
> - RBAC(접근 권한) 설정이 필요한 이유
>
> **💡 Kubernetes(K8s)란? (완전 초보자 안내)**
>
> K8s는 **여러 서버(노드)에서 컨테이너를 자동 관리**하는 시스템입니다.
> Docker Compose가 한 대 서버에서 쓴다면, K8s는 수십~수백 대에서 씁니다.
>
> 이 섹션에서 나오는 K8s 개념:
>
> | 용어 | 의미 | 비유 |
> |------|------|------|
> | **Namespace** | 리소스의 논리적 격리 공간 | 회사 내 부서 |
> | **DaemonSet** | 모든 노드에 하나씩 자동 배포 | 각 층마다 화재 감지기 |
> | **Deployment** | 지정한 수의 복제본 유지 | N명 교대 근무 |
> | **HPA** | 부하에 따라 Pod 수 자동 조절 | 수요에 맞춰 직원 자동 채용/해고 |
> | **RBAC** | 역할 기반 접근 권한 | 직원 보안 등급 |
> | **ConfigMap** | 설정 파일을 K8s에 저장 | 환경 변수 관리 |
>
> **왜 Agent Collector를 DaemonSet으로 배포하나요?**
>
> OTel Agent Collector는 각 노드(서버)의 로컬 데이터(hostmetrics, 로컬 Pod 텔레메트리)를 수집합니다.
> DaemonSet은 "새 노드가 추가되면 자동으로 Agent가 배포"됩니다 — 수동 설치 불필요.

### 8.1 네임스페이스 및 RBAC

> **왜 RBAC가 필요한가요?**
> OTel Collector Agent는 K8s API에서 Pod 이름, 네임스페이스 등 메타데이터를 읽어야 합니다.
> 하지만 아무 Pod나 K8s API를 읽으면 보안 문제가 됩니다.
> RBAC로 "OTel Collector ServiceAccount에게만 필요한 권한(노드/Pod 조회)을 부여"합니다.

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

> **📌 이 섹션에서 배울 내용**
> - Hot/Warm/Cold 3계층 스토리지 전략
> - 데이터 유형별 보존 기간 정책
> - 실제 비용 추정치 (1,000 RPS 기준)
>
> **💡 왜 데이터를 다 저장하지 않나요?**
>
> 1,000 RPS AI 서비스에서 샘플링 없이 모든 트레이스를 저장하면:
> - 하루 트레이스 데이터 ≈ 수백 GB
> - 월 저장 비용 ≈ 수천 달러
>
> Hot → Warm → Cold 계층 전략:
> ```
> Hot Storage (빠른 SSD, 비쌈)    →  최근 7~30일  →  실시간 조회용
> Warm Storage (적당한 비용)       →  30~90일     →  중기 분석용
> Cold Archive (S3, 저렴함)        →  90일~1년+   →  감사/규제 대응용
> ```
>
> AI 핵심 메트릭(TTFT/TPS/GPU)은 **서비스 품질 추이 분석**을 위해 영구 보존합니다.

### 9.1 계층별 데이터 보존 정책

| 데이터 유형 | Hot Storage | Warm Storage | Cold Archive |
|-----------|------------|-------------|-------------|
| **트레이스** (Sampled) | Jaeger 7일 | — | S3 90일 |
| **메트릭** | Prometheus 15일 | Thanos 90일 | Parquet/S3 1년 |
| **로그** | stdout/file 7일 | — | S3 30일 |
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
| OTel Collector Contrib | v0.104.0+ | Helm values.yaml, Docker Compose |
| OTel Specification | v1.31 | Semantic Conventions v1.26 |
| Prometheus | v2.53.0 | docker-compose.yaml |
| Jaeger | v1.58 | Apache 2.0 — 트레이스 저장소 (Phase 30 Tempo 대체) |
| ~~Grafana~~ | ~~v11.1.0~~ | **AGPL-3.0 — Phase 30 제거**, 자체 Next.js UI로 대체 |
| ~~Grafana Tempo~~ | ~~v2.5.0~~ | **AGPL-3.0 — Phase 30 제거**, Jaeger로 대체 완료 |
| ~~Grafana Loki~~ | ~~v3.1.0~~ | **AGPL-3.0 — Phase 30 제거**, stdout/file로 대체 완료 |
| GPU Collector | v1.0 (자체) | NVIDIA/AMD/Intel/Apple/Cloud 멀티벤더 (Phase 32) |
| Python OTel SDK | >=1.24.0 | opentelemetry-sdk |
| Node.js OTel SDK | >=1.22.0 | @opentelemetry/sdk-node |
| Go OTel SDK | >=1.26.0 | go.opentelemetry.io/otel |
| Java OTel Agent | >=2.4.0 | OTel Java Agent + ByteBuddy (Phase 24 완료) |
| .NET OTel SDK | >=1.9.0 | OpenTelemetry.NET + CLR Profiling (Phase 24 완료) |

> **참고**: OTel Collector 버전은 v0.91.0을 기준으로 하지만, 설정 파일은 v0.104+ Collector에서도 호환됩니다.
> Collector 업그레이드 시 `otelcol validate --config` 명령으로 설정 호환성을 확인하세요.

---

## 11. AITOP Agent 통합 아키텍처 (Phase 15~16)

> 이 섹션은 Phase 15~16에서 추가된 AITOP Agent 기반 수집 구조를 설명합니다.
> 상세 설계는 [AGENT_DESIGN.md](./AGENT_DESIGN.md)를 참조하세요.

### 11.1 전체 데이터 흐름

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          모니터링 대상 서버                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  AITOP Agent (Go 단일 바이너리)                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │ IT Collectors │  │ AI Collectors │  │ 공통 모듈             │  │    │
│  │  │ ├─ OS        │  │ ├─ GPU       │  │ ├─ Config Manager    │  │    │
│  │  │ ├─ WEB       │  │ ├─ LLM      │  │ ├─ Scheduler        │  │    │
│  │  │ ├─ WAS       │  │ ├─ VectorDB │  │ ├─ Health Monitor   │  │    │
│  │  │ └─ DB        │  │ ├─ Serving  │  │ ├─ Privilege Check  │  │    │
│  │  │              │  │ └─ OTel     │  │ ├─ Sanitizer        │  │    │
│  │  └──────────────┘  └──────────────┘  │ ├─ Local Buffer     │  │    │
│  │                                       │ ├─ PTY Shell        │  │    │
│  │                                       │ └─ OTA Updater      │  │    │
│  │                                       └──────────────────────┘  │    │
│  └────────────────────────┬────────────────────────────────────────┘    │
│                           │ gRPC/HTTPS (mTLS)                          │
│  ┌────────────────────────┴────────────────────────────────────────┐    │
│  │  OTel Collector Agent (DaemonSet) — 실시간 메트릭/트레이스 수집    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬──────────────────┬──────────────────────┘
                               │                  │
                  gRPC Stream  │                  │ OTLP
                               ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       AITOP Collection Server                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ gRPC Receiver │  │  Validation  │  │    Fleet     │  │  Event    │  │
│  │ (Data 수신)   │  │   Gateway    │  │  Controller  │  │   Bus     │  │
│  │              │  │ (PII 2차검증) │  │ (상태/OTA)    │  │ (진단트리) │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  └───────────┘  │
│         │                                                              │
│  ┌──────┴──────────────────────────────────────────────────────────┐   │
│  │  저장소 계층                                                      │   │
│  │  Prometheus (시계열) · PostgreSQL (메타·상태·결과)                │   │
│  │  StorageBackend (Evidence 파일):                                  │   │
│  │    — S3Backend [storage.type: "s3"]   AWS S3 프로덕션 권장       │   │
│  │    — LocalBackend [storage.type: "local"]  개발/테스트 환경      │   │
│  │    — DualBackend [storage.type: "both"]  S3 + 로컬 동시 저장     │   │
│  │  stdout/file (로그) · Jaeger (트레이스) · 감사 로그 (터미널 세션)  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ REST API
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                               │
│  26개 화면: Dashboard · Service Map · XLog · AI Analytics              │
│  Fleet Console · Remote CLI (xterm.js) · Diagnostics · Incidents       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.1.1 Collection Server — Evidence 저장 백엔드 옵션

Collection Server의 진단 Evidence(설정 파일·스냅샷·스크립트 출력) 파일 저장은 **StorageBackend 인터페이스**를 통해 추상화되어 있으며, `server.yaml`의 `storage.type` 값으로 백엔드를 선택한다.

| `storage.type` | 구현체 | 권장 환경 | 비고 |
|---------------|--------|---------|------|
| `"local"` | `LocalBackend` | 로컬 개발, 테스트, CI | S3 컨테이너 불필요 |
| `"s3"` | `S3Backend` | 프로덕션, 멀티 서버 | AWS S3 (MinIO 서버 대체 완료) |
| `"both"` | `DualBackend` | 프로덕션 + 로컬 캐시 | S3 기본 + 로컬 fallback |

**데이터 흐름 (Evidence 저장 경로)**:

```
[AITOP Agent]
  │  gRPC Push (Evidence bytes)
  ▼
[Collection Server — gRPC Receiver]
  │
  ├─ storage.type: "s3"   ──▶ S3Backend ──▶ s3://aitop-evidence/{tenant}/{job}/{file}
  ├─ storage.type: "local" ──▶ LocalBackend ──▶ /var/aitop/data/{tenant}/{job}/{file}
  └─ storage.type: "both"  ──▶ DualBackend ──▶ S3 (primary) + Local (secondary)
  │
  ▼
[PostgreSQL]
  collection_jobs.evidence_storage_path = "s3://.." | "file://.."
```

> **Prometheus 시계열·Jaeger 트레이스·stdout/file 로그**는 StorageBackend와 독립적으로 각 전문 저장소로 직접 전송된다. StorageBackend는 Evidence 파일(NDJSON 스냅샷, 설정 파일, CLI 감사 로그 등)에만 적용된다.

---

### 11.2 AITOP Agent 수집 체계

| 분류 | Collector | 수집 항목 | 수집 주기 |
|------|-----------|----------|----------|
| **IT** | OS Collector | CPU, Memory, Disk, Network, Process | 30초 |
| **IT** | WEB Collector | Nginx/Apache 설정, 상태, SSL 만료일 | 5분 |
| **IT** | WAS Collector | Tomcat/Spring Boot JVM, GC, Thread Dump | 5분 |
| **IT** | DB Collector | PostgreSQL/MySQL/Oracle 파라미터, 커넥션, 슬로우 쿼리 | 5분 |
| **AI** | GPU Collector | NVIDIA(nvml)/AMD(ROCm)/Intel(XPU)/Apple(Metal)/Cloud GPU — VRAM/온도/전력/SM%/ECC | 30초 |
| **AI** | LLM Collector | 모델 설정, Rate Limit, 토큰 사용량, 가드레일 | 5분 |
| **AI** | VectorDB Collector | Qdrant/Milvus/Chroma 헬스, 인덱스, PII 탐지 | 5분 |
| **AI** | Serving Collector | vLLM/Ollama/Triton 헬스, 배칭, KV Cache | 5분 |
| **AI** | OTel Collector | Prometheus에서 11개 AI 메트릭 스냅샷 | 1분 |

### 11.3 에이전트 운영 모드

| 모드 | 설명 | 용도 |
|------|------|------|
| `full` | 상주 데몬 — 스케줄 수집 + Heartbeat + 원격 CLI | 프로덕션 상시 운영 |
| `collect-only` | 1회 수집 → HTTPS 전송 → 종료 | 컨설턴트 점검, CI/CD |
| `collect-export` | 1회 수집 → ZIP 파일 내보내기 | 오프라인/에어갭 환경 |

### 11.4 Fleet Management

- **Heartbeat**: 30초 간격 상태 보고 + 원격 명령 수신
- **상태 머신**: `REGISTERED → APPROVED → HEALTHY → DEGRADED → OFFLINE`
- **OTA 업데이트**: Canary(1~3대) → Staged(10%→50%→100%) → Full Rollout
- **자동 롤백**: Health degradation 감지 시 이전 안정 버전 복원
- **원격 CLI**: xterm.js + WebSocket → gRPC PTY 스트리밍, RBAC + 감사 로그

### 11.5 OTel Collector ↔ AITOP Agent 역할 분담

| 역할 | OTel Collector | AITOP Agent |
|------|---------------|-------------|
| **실시간 메트릭** | ✅ (Prometheus scrape/OTLP) | ❌ |
| **분산 트레이스** | ✅ (OTLP 수신 + Tail Sampling) | ❌ |
| **로그 수집** | ✅ (filelog receiver → debug/file exporter → 자체 로그 뷰어) | ❌ |
| **인프라 진단** | ❌ | ✅ (설정 파싱, 상태 점검) |
| **AI 시스템 진단** | ❌ | ✅ (모델/VectorDB/GPU 설정) |
| **원격 CLI** | ❌ | ✅ (PTY 할당, 명령 실행) |
| **OTA 업데이트** | ❌ | ✅ (자체 바이너리 교체) |

---

## 12. 프론트엔드 아키텍처 (Phase 10~14)

> 상세 UI 설계는 [UI_DESIGN.md](./UI_DESIGN.md)를 참조하세요.

### 12.1 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js | 16.2 | App Router, SSR, 정적 최적화 |
| React | 19.2 | UI 렌더링 |
| TypeScript | 5.x | 타입 안전성 |
| Tailwind CSS | 4.x | 스타일링 (CSS Variables 다크 테마) |
| ECharts | 6.0 | 시계열 차트, 게이지, 히트맵, 도넛 |
| D3.js | 7.9 | 서비스 맵 토폴로지 (force-directed) |
| Zustand | 5.0 | 상태 관리 (auth, project, ui stores) |
| xterm.js | — | 원격 CLI 터미널 |

### 12.2 화면 구성 (26개 라우트)

| 카테고리 | 화면 | 경로 |
|---------|------|------|
| **APM 코어** | 서비스 맵/목록 | `/services` |
| | 서비스 상세 (7탭) | `/services/[id]` |
| | XLog/HeatMap | `/traces` |
| | 트레이스 워터폴 | `/traces/[traceId]` |
| | 로그 탐색기 | `/logs` |
| | 메트릭 탐색기 | `/metrics` |
| **AI 네이티브** | AI 서비스 개요 | `/ai` |
| | AI 서비스 상세 (LLM/RAG/Guardrail/GPU) | `/ai/[id]` |
| | GPU 클러스터 뷰 | `/ai/gpu` |
| **에이전트** | Fleet Console | `/agents` |
| | 진단 보고서 (86개 항목) | `/diagnostics` |
| **운영** | 알림 정책 + 인시던트 | `/alerts` |
| | SLO 관리 | `/slo` |
| | 비용 분석 | `/costs` |
| **고도화** | 커스텀 대시보드 빌더 | `/dashboards` |
| | Investigation Notebook | `/notebooks` |
| | Executive 대시보드 | `/executive` |
| | 멀티테넌트 관리 | `/tenants` |

---

## 13. 배포 모드 아키텍처 — Enterprise vs Lite

> AITOP은 두 가지 배포 모드를 지원합니다.
> **Enterprise**는 상시 운영 모니터링, **Lite**는 단기 성능 진단 컨설팅 시나리오에 최적화되어 있습니다.
> 상세 에이전트 동작은 [AGENT_DESIGN.md §2.3~2.4](./AGENT_DESIGN.md#23-동작-모드)를 참조하세요.

### 13.1 Enterprise 모드 아키텍처 (상시 운영)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     AITOP Enterprise — 상시 운영 아키텍처                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  모니터링 대상 서버 (N대)                                                  │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  AITOP Agent (systemd / Windows Service — 상주)                    │   │
│  │  ├─ IT Collectors (OS/WEB/WAS/DB)                                  │   │
│  │  ├─ AI Collectors (GPU/LLM/VectorDB/Serving)                       │   │
│  │  ├─ Fleet 관리 (OTA 업데이트, 원격 CLI, 그룹 관리)                   │   │
│  │  └─ Transport: gRPC 스트리밍 + WebSocket                            │   │
│  └──────────────────────────┬────────────────────────────────────────┘   │
│                             │ gRPC/HTTPS (mTLS)                          │
│  ┌──────────────────────────▼────────────────────────────────────────┐   │
│  │  Collection Server (Go)                                            │   │
│  │  ├─ PostgreSQL (TimescaleDB) — 메트릭/이벤트/에이전트 메타          │   │
│  │  ├─ S3 / LocalStorage — Evidence 파일 (Hot/Warm/Cold 계층)         │   │
│  │  ├─ SSE 실시간 브로드캐스트                                         │   │
│  │  └─ REST API + JWT RBAC                                            │   │
│  └──────────────────────────┬────────────────────────────────────────┘   │
│                             │                                             │
│  ┌──────────────────────────▼────────────────────────────────────────┐   │
│  │  OTel Stack (Prometheus / Jaeger / stdout·file / 자체 Next.js UI)  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                             │                                             │
│  ┌──────────────────────────▼────────────────────────────────────────┐   │
│  │  Frontend UI (Next.js) — 26개 화면                                  │   │
│  │  알림 · 대시보드 · Fleet Console · SLO · 비용 분석 · 멀티테넌트    │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  배포: Helm / Kubernetes  |  데이터 보존: Hot 30d / Warm 90d / Cold 2y   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Lite 모드 아키텍처 (단기 성능 진단)

```
┌──────────────────────────────────────────────────────────────────────────┐
│               AITOP Lite — 단기 성능 진단 아키텍처 (Docker only)            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  docker-compose -f docker-compose.lite.yaml up  ←── 원클릭 설치          │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  aitop-agent (--mode=lite, Foreground 프로세스)                  │     │
│  │  ├─ IT Collectors (OS/WEB/WAS/DB) — 자동 탐지                   │     │
│  │  ├─ AI Collectors (GPU/LLM) — 자동 탐지                          │     │
│  │  ├─ XLog / HeatMap / 프로파일링 집중 수집                        │     │
│  │  └─ systemd 미등록 — 컨테이너 종료 시 함께 종료                  │     │
│  └──────────────────────────┬──────────────────────────────────────┘     │
│                             │ HTTP (localhost only)                       │
│  ┌──────────────────────────▼──────────────────────────────────────┐     │
│  │  aitop-server (--mode=lite)                                      │     │
│  │  ├─ SQLite (WAL 모드) — 메트릭/트레이스/로그                     │     │
│  │  ├─ 로컬 파일시스템 ./data/ — Evidence 파일                      │     │
│  │  ├─ 데이터 보존 7일 (자동 정리)                                  │     │
│  │  └─ 내장 HTTP UI (localhost:8080)                               │     │
│  └──────────────────────────┬──────────────────────────────────────┘     │
│                             │                                             │
│  ┌──────────────────────────▼──────────────────────────────────────┐     │
│  │  보고서 내보내기 (진단 완료 후)                                    │     │
│  │  aitop-lite report --format=pdf → ./reports/진단결과.pdf         │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                           │
│  docker-compose down -v  ←── 원클릭 제거 (볼륨 포함)                     │
│  aitop-lite cleanup      ←── 로컬 파일 완전 삭제 (흔적 없음)              │
│                                                                           │
│  설치 요건: Docker만 있으면 됨 (PostgreSQL / S3 / Helm 불필요)             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 13.3 두 모드 비교 요약

| 항목 | Enterprise | Lite |
|------|-----------|------|
| **목적** | 상시 운영 모니터링 | 단기 성능 진단 (1주일 투입) |
| **설치 요건** | Helm/K8s or OS 패키지 | Docker만 필요 |
| **설치 방법** | `helm install` / DEB/RPM/MSI | `docker-compose up` |
| **에이전트 실행** | systemd/Windows Service (상주) | Foreground (컨테이너) |
| **DB** | PostgreSQL (TimescaleDB) | SQLite (WAL) |
| **오브젝트 스토리지** | S3 / LocalStorage | 로컬 파일시스템 (`./data/`) |
| **데이터 보존** | Hot 30d / Warm 90d / Cold 2y | 7일 자동 정리 |
| **알림** | ✅ 전체 알림 정책 + 인시던트 | ✗ (수동 확인) |
| **Fleet 관리** | ✅ 대규모 에이전트 중앙 관리 | ✗ (단일 로컬 에이전트) |
| **SSE 실시간** | ✅ 다수 클라이언트 브로드캐스트 | ✗ (단일 세션) |
| **그룹 관리** | ✅ 서버 그룹 + 멀티테넌트 | ✗ |
| **OTA 업데이트** | ✅ 원격 자동 업데이트 | ✗ |
| **보고서** | 웹 UI 대시보드 | PDF/HTML 로컬 파일 내보내기 |
| **제거** | `systemctl disable` + MSI 제거 | `docker-compose down -v` + `cleanup` |

---

## 14. AGPL-3.0 컴포넌트 대체 현황 (Phase 30 완료)

> **정책**: 아래 컴포넌트는 AGPL-3.0 라이선스이며, 상용 제품에 번들·배포·SaaS 운영 시 전체 소스코드 공개 의무가 발생합니다.
> **Phase 30에서 상용 배포 환경의 모든 AGPL 컴포넌트 대체 완료.**
> 개발/테스트 환경의 `docker-compose.yaml`에만 레거시 참조가 남아 있습니다.

### 14.1 대체 완료 목록

| 컴포넌트 | Docker 이미지 | 라이선스 | 상용 대체 솔루션 | 대체 라이선스 | 상태 |
|---------|--------------|---------|----------------|-------------|------|
| **Grafana** | `grafana/grafana` | AGPL-3.0 | 자체 Next.js UI (26개 화면) | 자체 코드 | ✅ Phase 30 완료 |
| **Grafana Tempo** | `grafana/tempo` | AGPL-3.0 | Jaeger (`jaegertracing/all-in-one`) | Apache 2.0 | ✅ Phase 30 완료 |
| **Grafana Loki** | `grafana/loki` | AGPL-3.0 | OTel debug/file exporter + 자체 로그 뷰어 | Apache 2.0 / 자체 코드 | ✅ Phase 30 완료 |
| **MinIO Server** | `minio/minio` | AGPL-3.0 | LocalBackend (`pkg/storage`) / AWS S3 | 자체 코드 / 상용 | ✅ Phase 30 완료 |

### 14.2 안전한 컴포넌트 (상용 배포 허용)

| 컴포넌트 | Docker 이미지 | 라이선스 |
|---------|--------------|---------|
| OTel Collector | `otel/opentelemetry-collector-contrib` | Apache 2.0 |
| Prometheus | `prom/prometheus` | Apache 2.0 |
| Jaeger | `jaegertracing/all-in-one` | Apache 2.0 |
| PostgreSQL | `postgres:16-alpine` | PostgreSQL License |
| Nginx | `nginx:alpine` | BSD 2-Clause |

### 14.3 Docker Compose 사용 가이드

| 파일 | 용도 | AGPL 포함 |
|------|------|----------|
| `docker-compose.yaml` | 개발/테스트 (전체 스택, 레거시) | Yes — Grafana, Tempo, Loki (개발 참조용) |
| `docker-compose.commercial.yaml` | **상용 배포** | **No** — Jaeger, Prometheus, PostgreSQL |
| `docker-compose.lite.yaml` | **Lite 진단 배포** | **No** — Jaeger, Prometheus |
| `docker-compose.test.yaml` | CI/E2E 테스트 | **No** — LocalBackend, Jaeger |

### 14.4 주의 사항

- `minio-go/v7` SDK (Go 클라이언트 라이브러리)는 **Apache 2.0**이므로 코드에서 사용 가능합니다. MinIO **서버**만 AGPL이며 Phase 30에서 상용 스택에서 제거되었습니다.
- Phase 30 이후 상용 배포(`docker-compose.commercial.yaml`)에는 AGPL 컴포넌트가 포함되지 않습니다.
- 새로운 인프라 컴포넌트 도입 시 반드시 라이선스를 확인하고 AGPL/GPL/SSPL 라이선스가 아닌지 검증하세요.
- 라이선스 전체 목록: [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md)
- 라이선스 분석 상세: [SOLUTION_STRATEGY.md §8](./SOLUTION_STRATEGY.md)

---

*이 문서는 프로젝트 아키텍처 변경 시 업데이트합니다. (v3.5.0 — Phase 24~32 반영)*
*관련 문서: [METRICS_DESIGN.md](./METRICS_DESIGN.md) | [AGENT_DESIGN.md](./AGENT_DESIGN.md) | [UI_DESIGN.md](./UI_DESIGN.md) | [TEST_GUIDE.md](./TEST_GUIDE.md) | [LOCAL_SETUP.md](./LOCAL_SETUP.md) | [JAVA_DOTNET_SDK_DESIGN.md](./JAVA_DOTNET_SDK_DESIGN.md)*
