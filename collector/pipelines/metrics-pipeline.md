# Metrics Pipeline — 지표 데이터 흐름 설계

> 애플리케이션 메트릭과 인프라 메트릭이 수집되어 Prometheus에 저장되고
> Thanos를 통해 장기 보존되기까지의 전체 파이프라인을 정의합니다.

---

## 전체 흐름 다이어그램

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Metric Sources                                  │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ App SDK     │  │ DCGM        │  │ vLLM         │  │ OTel         │  │
│  │ (OTel)      │  │ Exporter    │  │ /metrics     │  │ Collector    │  │
│  │             │  │             │  │              │  │ /metrics     │  │
│  │ Counter     │  │ GPU Gauge   │  │ Histogram    │  │ Internal     │  │
│  │ Histogram   │  │ 13 fields   │  │ 6 metrics    │  │ Metrics      │  │
│  │ UpDownCtr   │  │             │  │              │  │              │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                │                │                  │           │
└─────────┼────────────────┼────────────────┼──────────────────┼───────────┘
          │                │                │                  │
          │ OTLP           │ /metrics       │ /metrics         │ /metrics
          │ gRPC           │ (pull)         │ (pull)           │ (pull)
          ▼                │                │                  │
┌──────────────────┐       │                │                  │
│ OTel Collector   │       │                │                  │
│ Agent            │       │                │                  │
│                  │       │                │                  │
│ OTLP → batch    │       │                │                  │
│ → otlp/gateway  │       │                │                  │
└────────┬─────────┘       │                │                  │
         │                 │                │                  │
         ▼                 │                │                  │
┌──────────────────┐       │                │                  │
│ OTel Collector   │       │                │                  │
│ Gateway          │       │                │                  │
│                  │       │                │                  │
│ transform (OTTL) │       │                │                  │
│ → prometheusrw   │       │                │                  │
└────────┬─────────┘       │                │                  │
         │                 │                │                  │
         │ Remote Write    │                │                  │
         ▼                 ▼                ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Prometheus                                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Scrape Targets (ServiceMonitor / PodMonitor)                 │   │
│  │                                                              │   │
│  │  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │   │
│  │  │ OTel Agent      │  │ OTel Gateway │  │ DCGM Exporter  │ │   │
│  │  │ :8888/metrics   │  │ :8889/metrics│  │ :9400/metrics  │ │   │
│  │  │ interval: 30s   │  │ interval: 15s│  │ interval: 15s  │ │   │
│  │  └─────────────────┘  └──────────────┘  └────────────────┘ │   │
│  │                                                              │   │
│  │  ┌─────────────────┐                                        │   │
│  │  │ vLLM Inference  │                                        │   │
│  │  │ PodMonitor      │                                        │   │
│  │  │ interval: 10s   │                                        │   │
│  │  └─────────────────┘                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Recording Rules (30초 간격 사전 계산)                         │   │
│  │                                                              │   │
│  │  job:llm_ttft_p95:rate5m                                     │   │
│  │  job:llm_tps_p50:rate5m                                      │   │
│  │  job:guardrail_block_rate:rate5m                              │   │
│  │  job:gpu_vram_utilization:avg                                 │   │
│  │  job:external_api_error_rate:rate5m                           │   │
│  │  job:semantic_cache_hit_rate:rate5m                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Alert Rules (9개)                                             │   │
│  │                                                              │   │
│  │  CRITICAL: LLM_TTFT_High, GPU_VRAM_Critical,                │   │
│  │            LLM_Queue_Backlog                                  │   │
│  │  WARNING:  LLM_TPS_Low, GPU_Temperature_High,               │   │
│  │            Guardrail_Block_Rate_High, Guardrail_Latency_High,│   │
│  │            ExternalAPI_Timeout_Rate_High, VectorDB_Search_Slow│  │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Storage: PVC 50~200Gi  │  Retention: 15~30d                        │
└───────────────┬──────────┴───────────────┬───────────────────────────┘
                │                          │
                │ Thanos Sidecar           │ Alertmanager
                │ (prod only)              │
                ▼                          ▼
┌───────────────────────┐    ┌──────────────────────────────┐
│     Thanos             │    │      Alertmanager            │
│                        │    │                              │
│  Sidecar → S3 Upload  │    │  route:                      │
│  (ap-northeast-2)     │    │    severity=critical          │
│                        │    │      → Slack #critical       │
│  Store Gateway         │    │      → PagerDuty             │
│  → 장기 쿼리 가능     │    │    severity=warning           │
│                        │    │      → Slack #ai-alerts      │
│  Compactor             │    │                              │
│  → 다운샘플링 + 정리  │    │  group_wait: 30s             │
│                        │    │  repeat_interval: 4h (prod)  │
│  Retention: 1년        │    │                12h (dev)     │
└───────────────────────┘    └──────────────────────────────┘
```

---

## 지표 분류

### Layer 1: LLM 추론 엔진 (vLLM)

| 지표명 | 타입 | 단위 | 소스 |
|--------|------|------|------|
| `aiservice_llm_time_to_first_token` | Histogram | ms | SDK (Python) |
| `aiservice_llm_tokens_per_second` | Histogram | tok/s | SDK (Python) |
| `aiservice_llm_ms_per_token` | Histogram | ms/tok | SDK (Python) |
| `aiservice_llm_queue_wait_time` | Histogram | ms | SDK (Python) |
| `aiservice_llm_concurrent_requests` | UpDownCounter | count | SDK (Python) |
| `vllm_*` (6종) | Histogram/Gauge | — | vLLM /metrics (PodMonitor) |

### Layer 2: GPU 인프라 (DCGM)

| 지표명 | 타입 | 단위 | 소스 |
|--------|------|------|------|
| `DCGM_FI_DEV_GPU_UTIL` | Gauge | % | DCGM Exporter |
| `DCGM_FI_DEV_FB_USED` | Gauge | MiB | DCGM Exporter |
| `DCGM_FI_DEV_FB_FREE` | Gauge | MiB | DCGM Exporter |
| `DCGM_FI_DEV_GPU_TEMP` | Gauge | °C | DCGM Exporter |
| `DCGM_FI_DEV_POWER_USAGE` | Gauge | W | DCGM Exporter |
| `DCGM_FI_DEV_SM_CLOCK` | Gauge | MHz | DCGM Exporter |
| `DCGM_FI_DEV_MEM_COPY_UTIL` | Gauge | % | DCGM Exporter |
| `DCGM_FI_DEV_ECC_*` | Counter | count | DCGM Exporter |
| `DCGM_FI_DEV_XID_ERRORS` | Counter | count | DCGM Exporter |

### Layer 3: 가드레일

| 지표명 | 타입 | 단위 | 소스 |
|--------|------|------|------|
| `aiservice_guardrail_validation_duration` | Histogram | ms | SDK (Python) |
| `aiservice_guardrail_block_total` | Counter | count | SDK (Python) |
| `aiservice_guardrail_reask_total` | Counter | count | SDK (Python) |
| `aiservice_guardrail_policy_violation_total` | Counter | count | SDK (Python) |
| `aiservice_guardrail_request_total` | Counter | count | SDK (Python) |

### Layer 4: 에이전트 & 외부 API

| 지표명 | 타입 | 단위 | 소스 |
|--------|------|------|------|
| `aiservice_external_api_request_duration` | Histogram | ms | SDK (Python) |
| `aiservice_external_api_error_total` | Counter | count | SDK (Python) |
| `aiservice_external_api_timeout_total` | Counter | count | SDK (Python) |
| `aiservice_agent_graph_state_transitions_total` | Counter | count | SDK (Python) |

### Layer 5: 벡터 DB & 캐시

| 지표명 | 타입 | 단위 | 소스 |
|--------|------|------|------|
| `aiservice_vectordb_search_duration` | Histogram | ms | SDK (Python) |
| `aiservice_vectordb_upsert_duration` | Histogram | ms | SDK (Python) |
| `aiservice_vectordb_cache_hit_total` | Counter | count | SDK (Python) |
| `aiservice_vectordb_cache_miss_total` | Counter | count | SDK (Python) |
| `aiservice_embedding_duration` | Histogram | ms | SDK (Python) |
| `aiservice_embedding_tokens_total` | Counter | count | SDK (Python) |

---

## 수집 경로별 차이

```
경로 A: SDK → OTel Agent → Gateway → Prometheus Remote Write
  용도: 애플리케이션 자체 지표 (TTFT, TPS, 가드레일 등)
  장점: Tail Sampling과 동일 파이프라인, 민감정보 마스킹 가능
  지연: ~20초 (batch 5s Agent + batch 10s Gateway + scrape 15s)

경로 B: DCGM/vLLM /metrics → Prometheus 직접 Scrape
  용도: 인프라 지표 (GPU, vLLM 내부)
  장점: OTel Collector 장애 시에도 독립 수집
  지연: scrape interval (10~15초)

경로 C: OTel Collector /metrics → Prometheus 직접 Scrape
  용도: Collector 자체 건강 지표 (큐 크기, drop 수, 처리량)
  장점: 자기 관측 (self-observability)
  지연: scrape interval (30초)
```

---

## 비용 추정 (prod 기준, 1,000 RPS)

| 항목 | 수량 | 월간 비용 |
|------|------|-----------|
| Prometheus PVC (200Gi gp3) | 1 | ~$16 |
| Thanos S3 (다운샘플링 후 ~50GB/월) | 12개월 | ~$14/월 |
| DCGM Exporter (DaemonSet) | GPU 노드 수 | $0 (CPU/Mem만) |
| Recording Rules 연산 | 6 rules × 30s | 무시 가능 |
| **총 Metric 저장 비용** | | **~$30/월** |

> Trace 저장 비용은 `traces-pipeline.md` 참조. 전체 비용은 ARCHITECTURE.md의 $215/월 추정 참조.

---

## 장애 시나리오 대응

| 장애 | 영향 | 대응 |
|------|------|------|
| OTel Agent down | 경로 A 지표 유실 | WAL 재전송 (최대 5분 버퍼) |
| OTel Gateway down | 경로 A 지표 유실 | Agent WAL 큐잉, Gateway 복구 시 자동 재전송 |
| Prometheus down | 모든 지표 조회 불가 | PVC 데이터 보존, Alertmanager 독립 동작 |
| Thanos S3 장애 | 장기 보존 중단 | Sidecar 로컬 버퍼, S3 복구 시 자동 업로드 |
| DCGM Exporter down | GPU 지표 누락 | Alert: `absent(DCGM_FI_DEV_GPU_UTIL)` 감지 |
