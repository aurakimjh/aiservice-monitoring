# Traces Pipeline — 데이터 흐름 설계

> 트레이스 데이터가 생성되어 최종 저장소에 도달하기까지의 전체 파이프라인을 정의합니다.

---

## 전체 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                            │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Next.js  │  │ FastAPI  │  │ LangChain│  │ vLLM Inference   │   │
│  │ Frontend │  │ Backend  │  │ Agent    │  │ Engine           │   │
│  │          │  │          │  │          │  │                  │   │
│  │ OTel SDK │  │ OTel SDK │  │ OTel SDK │  │ OTel SDK         │   │
│  │ (JS)     │  │ (Python) │  │ (Python) │  │ (Python)         │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘   │
│       │              │              │              │                 │
│       │   W3C TraceContext + Baggage (user.tier, request.id)        │
│       └──────────────┼──────────────┼──────────────┘                │
│                      │              │                                │
└──────────────────────┼──────────────┼────────────────────────────────┘
                       │              │
                       ▼              ▼
              ┌─────────────────────────────┐
              │   OTel Collector Agent      │
              │   (DaemonSet — 각 노드)      │
              │                             │
              │  Receivers:                 │
              │   ├─ otlp/grpc (:4317)     │
              │   └─ otlp/http (:4318)     │
              │                             │
              │  Processors:                │
              │   ├─ memory_limiter (75%)   │
              │   ├─ k8sattributes          │
              │   │   ├─ pod.name           │
              │   │   ├─ namespace          │
              │   │   ├─ node.name          │
              │   │   └─ ai.service.layer   │
              │   └─ batch (1000/5s)        │
              │                             │
              │  Exporter:                  │
              │   └─ otlp/gateway (gzip)   │
              │       ├─ WAL 영구 큐        │
              │       └─ 재시도 (5s→30s)    │
              └─────────────┬───────────────┘
                            │
                            │ gRPC + gzip (otlp/gateway:4317)
                            │
                            ▼
              ┌─────────────────────────────┐
              │   OTel Collector Gateway    │
              │   (Deployment × 3~15)       │
              │                             │
              │  Receivers:                 │
              │   └─ otlp/grpc (:4317)     │
              │                             │
              │  Processors:                │
              │   ├─ memory_limiter (80%)   │
              │   ├─ tail_sampling           │
              │   │   ├─ 에러 트레이스 100%  │
              │   │   ├─ TTFT >2s   100%    │
              │   │   ├─ 고레이턴시 >3s 100%│
              │   │   ├─ 가드레일 차단 100%  │
              │   │   ├─ 외부 API 타임아웃   │
              │   │   ├─ GPU OOM 이벤트      │
              │   │   └─ 기본 샘플링 5%      │
              │   ├─ transform (OTTL)       │
              │   │   └─ 지표명 정규화      │
              │   ├─ attributes/redact      │
              │   │   ├─ 프롬프트 전문 마스킹│
              │   │   └─ 인증 헤더 제거     │
              │   └─ batch (2000/10s)       │
              │                             │
              │  Exporters:                 │
              │   ├─ otlp/tempo             │
              │   ├─ prometheus (→ Remote)  │
              │   └─ loki (→ Logs 상관)     │
              └────┬──────────┬─────────┬───┘
                   │          │         │
                   ▼          ▼         ▼
           ┌───────────┐ ┌────────┐ ┌──────┐
           │   Tempo   │ │Prometh.│ │ Loki │
           │  (Traces) │ │(Metric)│ │(Logs)│
           │           │ │        │ │      │
           │  7~14일   │ │ 15~30d │ │ 7~14d│
           │  보존     │ │ 보존   │ │ 보존 │
           └─────┬─────┘ └───┬────┘ └──┬───┘
                 │           │         │
                 └───────────┼─────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Grafana     │
                    │                 │
                    │  Trace ↔ Metric │
                    │  ↔ Log 3방향   │
                    │  상관관계 링크  │
                    │                 │
                    │  5개 대시보드   │
                    └─────────────────┘
```

---

## 단계별 상세

### 1단계: 계측 (Instrumentation)

| 서비스 | SDK | 계측 방식 | 주요 Span Attribute |
|--------|-----|-----------|---------------------|
| Next.js Frontend | `@opentelemetry/sdk-node` | Auto (HTTP/fetch) + Manual (SSE streaming) | `http.method`, `http.url`, `web_vitals.*` |
| FastAPI Backend | `opentelemetry-sdk` | Auto (httpx, redis) + Manual (streaming) | `http.route`, `streaming.chunk_count` |
| LangChain Agent | `opentelemetry-sdk` | Manual (`OtelCallbackHandler`) | `agent.graph.recursion_depth`, `tool.name` |
| vLLM Inference | `opentelemetry-sdk` | Manual (`instrument_vllm_generate`) | `llm.ttft`, `llm.tps`, `llm.model` |
| Guardrails | `opentelemetry-sdk` | Manual (`@instrument_guardrail`) | `guardrail.action`, `guardrail.policy` |
| External APIs | `opentelemetry-sdk` | Manual (`InstrumentedHTTPClient`) | `http.method`, `peer.service`, `circuit_breaker.state` |
| Vector DB | `opentelemetry-sdk` | Manual (`InstrumentedPinecone/Qdrant`) | `db.operation`, `vectordb.score_spread` |

### 2단계: Agent 수집

- **배포**: DaemonSet (GPU 노드 포함 전 노드)
- **역할**: 로컬 Pod에서 OTLP 수신 → K8s 메타데이터 부착 → Gateway 전달
- **내결함성**: WAL 기반 영구 큐 (hostPath `/var/otelcol/agent/storage`)
- **재시도**: 초기 5s → 최대 30s → 최대 300s 경과 시 drop

### 3단계: Gateway 처리

- **배포**: Deployment 3~15 replicas (HPA CPU 70% / Memory 75%)
- **Tail Sampling**: 10개 정책 조합 → ~81% 저장 비용 절감
- **민감 정보 보호**: OTTL transform으로 프롬프트 전문/인증 헤더 마스킹
- **안정화**: PDB minAvailable:2, 스케일다운 300초 안정화

### 4단계: 저장

| 백엔드 | 데이터 | 보존 (dev) | 보존 (prod) | 저장소 |
|--------|--------|-----------|------------|--------|
| Tempo | Traces | 3일 | 14일 | Local / S3 |
| Prometheus | Metrics | 3일 | 30일 | PVC / Thanos S3 |
| Loki | Logs | 3일 | 14일 | Local / S3 |

### 5단계: 시각화

Grafana에서 Trace ID 기반 3방향 상관관계:
- **Trace → Metric**: Exemplar 클릭 → Prometheus 지표와 연결
- **Trace → Log**: Trace ID로 Loki 로그 필터링
- **Metric → Trace**: Grafana Explore에서 TraceQL 쿼리

---

## Context Propagation 경로

```
Browser (Next.js)
  │ traceparent: 00-{traceId}-{spanId}-01
  │ baggage: user.tier=premium,request.id=abc123
  ▼
FastAPI Gateway
  │ W3CTraceContextPropagator → 동일 traceId 유지
  │ baggage 전파 → 하위 서비스까지 자동 전달
  ▼
LangChain Agent
  │ OtelCallbackHandler → Chain/Tool/LLM Span 자동 생성
  │ W3C inject → 외부 API 호출 시 traceparent 헤더 주입
  ├─▶ External API (traceparent 주입)
  └─▶ Vector DB (Span 기록)
  ▼
vLLM Inference
  │ instrument_vllm_generate → TTFT/TPS Span 기록
  │ 동일 traceId 아래 마지막 Span
  ▼
OTel Collector → Tempo (전체 트레이스 조립)
```

---

## 단절 탐지 방법

`scripts/validate-traces.py`가 아래 3가지 패턴을 TraceQL로 탐지:

1. **Orphan Span**: `parentSpanId`가 존재하지 않는 Span (Root가 아닌데 부모 없음)
2. **Missing Layer**: 하나의 Trace에 예상 레이어(frontend → backend → agent → inference)가 누락
3. **Baggage Loss**: 상위에서 설정한 `user.tier` baggage가 하위 Span에 누락
