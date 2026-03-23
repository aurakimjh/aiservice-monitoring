# AI 서비스 성능 모니터링 — 지표 정의 및 수집 방안 설계

> **문서 버전**: v2.0.0
> **작성 기준**: OpenTelemetry Specification v1.31 / Semantic Conventions v1.26
> **관점**: SRE (Site Reliability Engineer) — 프로덕션 즉시 적용 가능 수준
> **최종 업데이트**: 2026-03-22 (Phase 16 Agent GA 반영)
>
> **관련 문서**:
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — OTel + Agent 통합 아키텍처
> - [UI_DESIGN.md](./UI_DESIGN.md) — 통합 모니터링 대시보드 UI 설계 (26개 화면)
> - [AGENT_DESIGN.md](./AGENT_DESIGN.md) — AITOP Agent 상세 설계 (Collector, Fleet, CLI)
> - [TEST_GUIDE.md](./TEST_GUIDE.md) — 테스트 & 운영 검증 가이드
> - [LOCAL_SETUP.md](./LOCAL_SETUP.md) — 로컬 개발 환경 구성
> - [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md) — 솔루션 방향성, 경쟁 분석

---

## AI 서비스 성능 지표란? — 초보자 가이드

> 이 섹션은 AI 서비스 모니터링을 처음 접하는 분을 위한 쉬운 설명입니다.
> 핵심 용어만 이해하면 이 문서의 나머지 내용을 훨씬 쉽게 읽을 수 있습니다.

### TTFT (Time To First Token) — 첫 글자가 나올 때까지의 시간

ChatGPT에 질문을 보내고 **첫 글자가 화면에 나타나기까지** 기다리는 시간입니다.

**비유**: 식당에서 주문 후 **첫 번째 요리가 나올 때까지** 기다리는 시간.
- 1초 이내: "빠르네!" (좋은 경험)
- 3초 이상: "고장났나?" (사용자 이탈 시작)
- 5초 이상: "다른 서비스 써야지" (사용자 이탈)

### TPS (Tokens Per Second) — AI의 타이핑 속도

AI가 **1초에 몇 글자(토큰)를 생성하는가**를 나타냅니다.
사람의 타이핑 속도가 분당 300타라면, AI는 초당 30-100개 토큰을 생성합니다.

**비유**: 글을 쓰는 속도.
- 30+ tok/s: 자연스럽게 읽히는 속도 (자막 보는 느낌)
- 10 tok/s 미만: 한 글자씩 느리게 나옴 (답답함)

### GPU VRAM — AI의 작업 책상

GPU VRAM은 AI 모델이 올라가는 **작업 책상의 크기**입니다.
책상이 크면 큰 모델도 올릴 수 있고, 여러 작업을 동시에 할 수 있습니다.

- VRAM 사용률 80% 이하: 여유 있음 (정상)
- VRAM 사용률 90% 초과: 위험! (새 요청 처리 불가능할 수 있음)
- VRAM 100%: **OOM(Out of Memory) 오류** — 서비스 중단

### 가드레일 — AI의 안전벨트

가드레일은 AI가 **위험하거나 부적절한 답변을 하지 못하게** 막는 안전 장치입니다.

**비유**: 고속도로의 가드레일. 차가 도로를 벗어나지 않도록 보호합니다.
- 차단율(Block Rate): AI가 차단한 요청의 비율 (보통 1-5%가 정상)
- 검사 시간: 가드레일 검사에 걸리는 시간 (빠를수록 좋음)

### 벡터 DB — AI의 기억 도서관

벡터 DB는 AI가 참고할 문서를 **빠르게 검색**할 수 있는 특수 도서관입니다.
일반 검색은 "키워드 일치"를 찾지만, 벡터 DB는 **"의미가 비슷한"** 것을 찾습니다.

- "휴가 정책" 검색 → "연차 사용 규정" 문서도 찾아줌 (의미 유사)
- 검색 시간이 500ms 이상이면 전체 응답이 느려지므로 모니터링이 중요

> 더 자세한 AI 서비스 처리 흐름은 [AI_SERVICE_FLOW.md](./AI_SERVICE_FLOW.md)를 참고하세요.

---

## 목차

1. [설계 원칙](#1-설계-원칙)
2. [지표 수집 전략: Auto vs Manual Instrumentation](#2-지표-수집-전략-auto-vs-manual-instrumentation)
3. [Sampling 전략](#3-sampling-전략)
4. [레이어별 상세 지표 설계](#4-레이어별-상세-지표-설계)
   - [Layer 1: UI / App](#layer-1-uiapp)
   - [Layer 2: Agent (오케스트레이션 & 외부 도구)](#layer-2-agent-오케스트레이션--외부-도구)
   - [Layer 3: Model (추론 엔진 & 임베딩)](#layer-3-model-추론-엔진--임베딩)
   - [Layer 4: Data (벡터 DB & 캐시)](#layer-4-data-벡터-db--캐시)
   - [Layer 5: Infra (K8s & GPU)](#layer-5-infra-k8s--gpu)
5. [AI 특화 핵심 성능 수식](#5-ai-특화-핵심-성능-수식)
6. [병목 구간별 시각화 전략](#6-병목-구간별-시각화-전략)
7. [장애 예방 Alert 임계치 정의](#7-장애-예방-alert-임계치-정의)
8. [Context Propagation 설계](#8-context-propagation-설계)
12. [Java / .NET 전용 메트릭 (Phase 24 예정)](#12-java--net-전용-메트릭-phase-24-예정)

---

## 1. 설계 원칙

### 1.1 Three Pillars + AI 확장

```
┌─────────────────────────────────────────────────────────────────┐
│              AI 서비스 Observability 4 Pillars                   │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│   Traces     │   Metrics    │    Logs      │   AI-Specific      │
│              │              │              │                    │
│ 요청 경로    │ 집계 수치    │ 이벤트 기록  │ TTFT / TPS         │
│ 레이턴시     │ 처리량       │ 에러 컨텍스트 │ Token Economics    │
│ 인과관계     │ 리소스 사용  │ 정책 위반    │ GPU Correlation    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

### 1.2 수집 우선순위 분류

| 우선순위 | 레이블 | 기준 | 대상 |
|---------|--------|------|------|
| **P0** | `Critical` | SLO 직결, 장애 탐지 필수 | vLLM TTFT, Guardrail 차단율, GPU VRAM |
| **P1** | `High` | 성능 최적화 핵심 | Agent 체인 레이턴시, 벡터 검색 시간 |
| **P2** | `Medium` | 트렌드 분석, 용량 계획 | 문서 파싱 시간, Streamlit 세션 |
| **P3** | `Low` | 감사/디버그 목적 | 전체 LLM 프롬프트 로그 |

---

## 2. 지표 수집 전략: Auto vs Manual Instrumentation

### 2.1 전략 매트릭스

```
                        자동 계측 가능도
                   LOW ◄────────────────► HIGH
              ┌────────────┬─────────────┬──────────────┐
HIGH  수동    │ vLLM TTFT  │  LangChain  │  FastAPI     │
      계측    │ GPU DCGM   │  Guardrails │  HTTP Client │
      필요도  ├────────────┼─────────────┼──────────────┤
              │ Triton Inf │  LlamaIndex │  Redis       │
              │ 커스텀Tool  │  Embedding  │  Postgres    │
LOW           └────────────┴─────────────┴──────────────┘
```

### 2.2 Auto-Instrumentation 적용 대상 (즉시 적용)

```python
# opentelemetry-bootstrap 로 자동 탐지 및 계측 가능한 라이브러리
AUTO_INSTRUMENT_PACKAGES = [
    "opentelemetry-instrumentation-fastapi",    # FastAPI HTTP spans
    "opentelemetry-instrumentation-flask",      # Flask HTTP spans
    "opentelemetry-instrumentation-django",     # Django + DB query spans
    "opentelemetry-instrumentation-httpx",      # 외부 HTTP 호출 (Serper, API)
    "opentelemetry-instrumentation-redis",      # Redis 캐시 히트/미스
    "opentelemetry-instrumentation-pymongo",    # MongoDB chat history
    "opentelemetry-instrumentation-grpc",       # gRPC (Triton 등)
    "opentelemetry-instrumentation-requests",   # requests 라이브러리
    "opentelemetry-instrumentation-aiohttp",    # aiohttp 비동기 HTTP
]
```

### 2.3 Manual Instrumentation 필수 대상 (커스텀 계측)

```python
# AI 도메인 전용 — 자동 계측으로 절대 포착 불가
MANUAL_INSTRUMENT_REQUIRED = {
    "llm.ttft":          "첫 스트리밍 청크 수신 시각 - 요청 시각",
    "llm.tps":           "완료 토큰 수 / 총 생성 시간(초)",
    "llm.token_count":   "prompt_tokens + completion_tokens",
    "guardrail.blocked": "정책 위반 탐지 및 차단 이벤트",
    "agent.tool_calls":  "각 Tool 호출 성공/실패/레이턴시",
    "embedding.dims":    "임베딩 벡터 차원수 및 배치 크기",
    "gpu.vram_pressure": "VRAM 사용률과 OOM 예측 지표",
    "vector.recall":     "Top-K 검색 결과 품질 지표",
}
```

### 2.4 계측 비율 가이드

| 계층 | Auto 비율 | Manual 비율 | 핵심 이유 |
|------|-----------|-------------|-----------|
| HTTP/API 레이어 | **85%** | 15% | 표준 HTTP 시맨틱 활용 |
| Agent 오케스트레이션 | 40% | **60%** | 비즈니스 로직 커스텀 스팬 필수 |
| LLM 추론 엔진 | 10% | **90%** | 스트리밍, TTFT 등 AI 전용 |
| 벡터 DB | 50% | 50% | gRPC 자동 + 쿼리 파라미터 수동 |
| GPU/HW 지표 | 5% | **95%** | DCGM exporter 별도 파이프라인 |

---

## 3. Sampling 전략

### 3.1 Head-based Sampling (수집 입구 단계)

```yaml
# collector/config/head-sampling.yaml
# 목적: 전체 트래픽 부하를 줄이되, 중요 샘플은 반드시 포착
sampler:
  type: parentbased_traceidratio
  ratio: 0.05          # 일반 트래픽: 5% 샘플링

  # 강제 포함 규칙 (Override — 항상 수집)
  force_sample_rules:
    - attribute: "http.status_code"
      op: "gte"
      value: 500        # 5xx 에러: 100% 수집
    - attribute: "user.tier"
      op: "eq"
      value: "enterprise" # 엔터프라이즈 사용자: 100% 수집
    - attribute: "llm.provider"
      op: "eq"
      value: "internal"  # 내부 vLLM 호출: 20% 수집 (ratio override)
      override_ratio: 0.2
```

### 3.2 Tail-based Sampling (Collector 집계 단계)

```yaml
# collector/config/tail-sampling.yaml
# 목적: 트레이스 완료 후, 전체 그림을 보고 중요 트레이스를 선별
processors:
  tail_sampling:
    decision_wait: 10s     # 트레이스 완료 대기 시간
    num_traces: 50000      # 메모리 내 보관 트레이스 수
    expected_new_traces_per_sec: 1000

    policies:
      # 1. 고레이턴시 트레이스 — LLM 병목 탐지
      - name: high-latency-llm
        type: latency
        latency:
          threshold_ms: 5000      # 5초 초과 전체 요청

      # 2. LLM 추론 단계 고레이턴시
      - name: high-ttft
        type: span_attribute
        span_attribute:
          key: "llm.ttft_ms"
          values: ["*"]
          # 후처리: TTFT > 2000ms 필터
        and:
          - type: latency
            latency:
              threshold_ms: 2000

      # 3. 에러 포함 트레이스 — 항상 보존
      - name: error-traces
        type: status_code
        status_code:
          status_codes: [ERROR]

      # 4. 가드레일 차단 이벤트
      - name: guardrail-blocked
        type: span_attribute
        span_attribute:
          key: "guardrail.action"
          values: ["BLOCK", "REASK"]

      # 5. GPU VRAM 임계치 초과
      - name: gpu-pressure
        type: span_attribute
        span_attribute:
          key: "gpu.vram_utilization_pct"
          values: ["*"]
          # 후처리: > 90% 필터

      # 6. 외부 API 타임아웃
      - name: external-api-timeout
        type: span_attribute
        span_attribute:
          key: "http.status_code"
          values: ["408", "504", "524"]

    # Composite: 위 정책 중 하나라도 해당하면 보존
    decision_type: OR
```

### 3.3 샘플링 결과 예측 비용 절감

$$
C_{saved} = C_{total} \times \left(1 - r_{head} - r_{tail} \cdot (1 - r_{head})\right)
$$

여기서:
- $C_{total}$: 샘플링 없는 전체 수집 비용
- $r_{head}$: Head-based 샘플링 비율 (예: 0.05)
- $r_{tail}$: Tail-based에서 선별 후 보존 비율 (예: 0.15)

예시 계산 (100만 요청/일 기준):

$$
C_{saved} = 100\% \times \left(1 - 0.05 - 0.15 \times (1 - 0.05)\right) = 100\% - 0.05 - 0.1425 = 80.75\%\ 절감
$$

---

## 4. 레이어별 상세 지표 설계

---

### Layer 1: UI/App

#### 1-A. FastAPI (Python) — `Critical`

**Auto-instrumentation으로 커버:**

| OTel 지표명 | OTel 타입 | 단위 | 설명 |
|------------|-----------|------|------|
| `http.server.request.duration` | Histogram | ms | 요청 처리 전체 시간 |
| `http.server.active_requests` | UpDownCounter | count | 현재 처리 중인 요청 수 |
| `http.server.request.body.size` | Histogram | bytes | 요청 본문 크기 (프롬프트 크기 추정) |
| `http.server.response.body.size` | Histogram | bytes | 응답 크기 |

**Manual Instrumentation — Streaming 응답 전용:**

```python
# sdk-instrumentation/python/agents/fastapi_streaming.py
from opentelemetry import trace
from opentelemetry.trace import SpanKind
import time

tracer = trace.get_tracer("ai.service.api", "1.0.0")

async def stream_llm_response(request_id: str, prompt: str):
    with tracer.start_as_current_span(
        "api.streaming.response",
        kind=SpanKind.SERVER,
        attributes={
            "request.id": request_id,
            "http.route": "/v1/chat/completions",
            "streaming": True,
        }
    ) as span:
        first_chunk_time = None
        chunk_count = 0
        request_start = time.time()

        async for chunk in llm_backend.stream(prompt):
            if first_chunk_time is None:
                first_chunk_time = time.time()
                ttft_ms = (first_chunk_time - request_start) * 1000
                # TTFT를 Span 이벤트로 기록
                span.add_event("first_token_received", {
                    "llm.ttft_ms": ttft_ms,
                    "streaming.chunk_index": 0,
                })
                # Metric으로도 기록 (히스토그램)
                ttft_histogram.record(
                    ttft_ms,
                    {"model": span.attributes.get("llm.model", "unknown")}
                )
            chunk_count += 1
            yield chunk

        total_ms = (time.time() - request_start) * 1000
        span.set_attributes({
            "llm.ttft_ms": (first_chunk_time - request_start) * 1000 if first_chunk_time else -1,
            "streaming.total_chunks": chunk_count,
            "http.response.duration_ms": total_ms,
        })
```

**핵심 Span 속성:**

```
ai.service.api spans:
  ├── http.method: "POST"
  ├── http.route: "/v1/chat/completions"
  ├── http.status_code: 200
  ├── llm.ttft_ms: 342.5          ← AI 전용
  ├── streaming.enabled: true
  └── user.tier: "enterprise"
```

---

#### 1-B. Next.js / React (TS/JS) — `Critical` (스트리밍 청크 지연)

```javascript
// sdk-instrumentation/nodejs/frontend-streaming.js
import { trace, context } from '@opentelemetry/api';

const tracer = trace.getTracer('ai.service.frontend', '1.0.0');

async function* trackStreamingChunks(responseStream, parentSpan) {
  const streamSpan = tracer.startSpan('frontend.streaming.receive', {
    attributes: {
      'streaming.source': 'server-sent-events',
    }
  }, trace.setSpan(context.active(), parentSpan));

  let prevChunkTime = Date.now();
  let chunkIndex = 0;

  try {
    for await (const chunk of responseStream) {
      const now = Date.now();
      const interChunkDelay = now - prevChunkTime;

      // 청크 간 지연이 500ms 초과 시 이벤트 기록 (사용자 체감 끊김)
      if (interChunkDelay > 500) {
        streamSpan.addEvent('streaming.chunk.delay_detected', {
          'streaming.chunk_index': chunkIndex,
          'streaming.inter_chunk_delay_ms': interChunkDelay,
          'streaming.delay_threshold_exceeded': true,
        });
      }

      prevChunkTime = now;
      chunkIndex++;
      yield chunk;
    }
  } finally {
    streamSpan.setAttribute('streaming.total_chunks', chunkIndex);
    streamSpan.end();
  }
}
```

**수집 지표:**

| 지표명 | 타입 | 핵심 속성 | 임계치 |
|--------|------|-----------|--------|
| `frontend.streaming.chunk_delay_ms` | Histogram | `chunk_index` | P99 > 500ms → Alert |
| `frontend.lcp_ms` | Histogram | `page_route` | > 2500ms → 경고 |
| `frontend.streaming.total_chunks` | Histogram | `model` | 모델별 응답 길이 트렌드 |

---

#### 1-C. NeMo Guardrails / Guardrails AI — `Critical` (병목 핵심)

> **병목 시나리오**: 가드레일은 LLM 앞단에서 모든 입력을 검증하므로, 레이턴시가 높으면 전체 P99 레이턴시를 지배합니다.

**Manual Instrumentation — 가드레일 전/후 분리 계측:**

```python
# sdk-instrumentation/python/guardrails/nemo_instrumentation.py
from opentelemetry import trace, metrics
from opentelemetry.trace import SpanKind, StatusCode
import time
from functools import wraps

tracer = trace.get_tracer("ai.guardrails.nemo", "1.0.0")
meter = metrics.get_meter("ai.guardrails.nemo", "1.0.0")

# Metrics 정의
guardrail_latency = meter.create_histogram(
    name="guardrail.validation.duration",
    description="가드레일 검증 처리 시간",
    unit="ms",
)
guardrail_block_counter = meter.create_counter(
    name="guardrail.block.total",
    description="가드레일 차단 누적 횟수",
    unit="1",
)
guardrail_reask_counter = meter.create_counter(
    name="guardrail.reask.total",
    description="Guardrails AI re-ask 발생 횟수",
    unit="1",
)
policy_violation_counter = meter.create_counter(
    name="guardrail.policy_violation.total",
    description="정책 유형별 위반 횟수",
    unit="1",
)


def instrument_guardrail(policy_name: str):
    """가드레일 함수에 OTel 계측을 자동 주입하는 데코레이터"""
    def decorator(fn):
        @wraps(fn)
        async def wrapper(user_input: str, *args, **kwargs):
            start = time.perf_counter()

            with tracer.start_as_current_span(
                f"guardrail.validate.{policy_name}",
                kind=SpanKind.INTERNAL,
                attributes={
                    "guardrail.policy": policy_name,
                    "guardrail.engine": "nemo",  # or "guardrails_ai"
                    "input.char_length": len(user_input),
                    "input.token_estimate": len(user_input.split()),
                }
            ) as span:
                try:
                    result = await fn(user_input, *args, **kwargs)
                    elapsed_ms = (time.perf_counter() - start) * 1000

                    action = result.get("action", "PASS")
                    violation_type = result.get("violation_type", "none")

                    span.set_attributes({
                        "guardrail.action": action,          # PASS / BLOCK / REASK
                        "guardrail.violation_type": violation_type,  # jailbreak/pii/toxic
                        "guardrail.duration_ms": elapsed_ms,
                        "guardrail.confidence_score": result.get("confidence", 1.0),
                    })

                    # 메트릭 기록
                    labels = {
                        "policy": policy_name,
                        "action": action,
                        "violation_type": violation_type,
                    }
                    guardrail_latency.record(elapsed_ms, labels)

                    if action == "BLOCK":
                        guardrail_block_counter.add(1, labels)
                        policy_violation_counter.add(1, {"policy": policy_name, "type": violation_type})
                        span.set_status(StatusCode.OK, "Blocked by policy")
                        # 이벤트로 상세 기록 (tail sampling이 이 span을 선별)
                        span.add_event("guardrail.block.detail", {
                            "input.snippet": user_input[:100] + "...",  # 최초 100자만
                            "matched_rule": result.get("matched_rule", "unknown"),
                        })

                    elif action == "REASK":
                        guardrail_reask_counter.add(1, labels)
                        span.add_event("guardrail.reask.issued", {
                            "reask_count": result.get("reask_count", 1),
                            "reask_prompt": result.get("reask_prompt", "")[:200],
                        })

                    return result

                except Exception as e:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    guardrail_latency.record(elapsed_ms, {"policy": policy_name, "action": "ERROR"})
                    raise

        return wrapper
    return decorator
```

**핵심 수집 지표 정의:**

| 지표명 | 타입 | 레이블 | P0 임계치 | 의미 |
|--------|------|--------|-----------|------|
| `guardrail.validation.duration` | Histogram | `policy`, `action` | P99 > 800ms | 전체 레이턴시 기여도 |
| `guardrail.block.total` | Counter | `policy`, `violation_type` | Rate > 5%/min | 이상 공격 트래픽 탐지 |
| `guardrail.reask.total` | Counter | `policy` | Rate > 10%/min | 프롬프트 품질 저하 |
| `guardrail.policy_violation.total` | Counter | `type` | 급등 시 Alert | 보안 이벤트 |

---

### Layer 2: Agent (오케스트레이션 & 외부 도구)

#### 2-A. LangChain / LangGraph — `Critical`

**핵심 계측 포인트: Chain Step 단위 분리**

```python
# sdk-instrumentation/python/agents/langchain_tracer.py
from opentelemetry import trace
from langchain.callbacks.base import BaseCallbackHandler
from typing import Any, Dict, List, Union
import time

tracer = trace.get_tracer("ai.agent.langchain", "1.0.0")


class OtelCallbackHandler(BaseCallbackHandler):
    """LangChain 콜백을 OTel Span으로 변환하는 핸들러"""

    def __init__(self):
        self._span_stack: Dict[str, Any] = {}
        self._step_timings: Dict[str, float] = {}

    def on_chain_start(self, serialized, inputs, run_id, **kwargs):
        chain_name = serialized.get("name", "unknown_chain")
        span = tracer.start_span(
            f"agent.chain.{chain_name}",
            attributes={
                "agent.chain.name": chain_name,
                "agent.chain.run_id": str(run_id),
                "agent.input.char_length": len(str(inputs)),
            }
        )
        self._span_stack[str(run_id)] = span
        self._step_timings[str(run_id)] = time.perf_counter()

    def on_chain_end(self, outputs, run_id, **kwargs):
        run_id_str = str(run_id)
        span = self._span_stack.pop(run_id_str, None)
        if span:
            elapsed = (time.perf_counter() - self._step_timings.pop(run_id_str)) * 1000
            span.set_attributes({
                "agent.chain.duration_ms": elapsed,
                "agent.output.char_length": len(str(outputs)),
            })
            span.end()

    def on_tool_start(self, serialized, input_str, run_id, **kwargs):
        tool_name = serialized.get("name", "unknown_tool")
        parent_span = trace.get_current_span()
        span = tracer.start_span(
            f"agent.tool.{tool_name}",
            attributes={
                "agent.tool.name": tool_name,
                "agent.tool.run_id": str(run_id),
                "agent.tool.input_length": len(input_str),
            }
        )
        self._span_stack[f"tool_{run_id}"] = span
        self._step_timings[f"tool_{run_id}"] = time.perf_counter()

    def on_tool_end(self, output, run_id, **kwargs):
        key = f"tool_{run_id}"
        span = self._span_stack.pop(key, None)
        if span:
            elapsed = (time.perf_counter() - self._step_timings.pop(key)) * 1000
            span.set_attributes({
                "agent.tool.duration_ms": elapsed,
                "agent.tool.success": True,
                "agent.tool.output_length": len(str(output)),
            })
            span.end()

    def on_tool_error(self, error, run_id, **kwargs):
        key = f"tool_{run_id}"
        span = self._span_stack.pop(key, None)
        if span:
            elapsed = (time.perf_counter() - self._step_timings.pop(key, time.perf_counter())) * 1000
            span.record_exception(error)
            span.set_attributes({
                "agent.tool.duration_ms": elapsed,
                "agent.tool.success": False,
                "agent.tool.error": str(error),
            })
            span.end()

    def on_agent_action(self, action, run_id, **kwargs):
        span = trace.get_current_span()
        span.add_event("agent.action.selected", {
            "agent.action.tool": action.tool,
            "agent.action.input": str(action.tool_input)[:500],
        })

    # LangGraph 전용: 상태 전환 추적
    def on_graph_node_start(self, node_name, state, run_id, **kwargs):
        span = tracer.start_span(
            f"langgraph.node.{node_name}",
            attributes={
                "graph.node.name": node_name,
                "graph.state.keys": str(list(state.keys())),
                "graph.run_id": str(run_id),
            }
        )
        self._span_stack[f"graph_{run_id}_{node_name}"] = span
```

**LangGraph 상태 전환 지표:**

| 지표명 | 타입 | 레이블 | 설명 |
|--------|------|--------|------|
| `agent.graph.node.duration_ms` | Histogram | `node_name`, `graph_id` | 노드별 처리 시간 |
| `agent.graph.state_transitions.total` | Counter | `from_node`, `to_node` | 상태 전환 빈도 |
| `agent.graph.recursion_depth` | Histogram | `graph_id` | 재귀 깊이 (무한루프 탐지) |
| `agent.chain.step.duration_ms` | Histogram | `chain`, `step` | 체인 단계별 시간 |

---

#### 2-B. 외부 API 호출 (Serper, Custom Tools) — `Critical` (병목 핵심)

> **병목 시나리오**: 외부 API 타임아웃은 전체 Agent 체인을 블록킹합니다. 네트워크 레이턴시와 외부 서비스 SLA를 독립적으로 측정해야 합니다.

```python
# sdk-instrumentation/python/agents/external_api_tracer.py
import httpx
from opentelemetry import trace, metrics, propagate
from opentelemetry.trace import SpanKind, StatusCode
from opentelemetry.semconv.trace import SpanAttributes
import time

tracer = trace.get_tracer("ai.agent.external_api", "1.0.0")
meter = metrics.get_meter("ai.agent.external_api", "1.0.0")

external_api_latency = meter.create_histogram(
    "external_api.request.duration",
    unit="ms",
    description="외부 API 요청 레이턴시 (네트워크 포함)",
)
external_api_errors = meter.create_counter(
    "external_api.error.total",
    unit="1",
    description="외부 API 에러 횟수 (4xx/5xx/timeout)",
)
external_api_timeout = meter.create_counter(
    "external_api.timeout.total",
    unit="1",
    description="외부 API 타임아웃 발생 횟수",
)


class InstrumentedHTTPClient:
    """외부 API 호출에 OTel Context Propagation을 자동 주입하는 HTTP 클라이언트"""

    def __init__(self, service_name: str, base_url: str, timeout: float = 10.0):
        self.service_name = service_name
        self.base_url = base_url
        self.timeout = timeout
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def post(self, path: str, **kwargs) -> httpx.Response:
        url = f"{self.base_url}{path}"
        headers = kwargs.pop("headers", {})

        # W3C TraceContext 헤더 주입 — 외부 서비스까지 Trace ID 전파
        propagate.inject(headers)

        with tracer.start_as_current_span(
            f"external_api.{self.service_name}.request",
            kind=SpanKind.CLIENT,
            attributes={
                SpanAttributes.HTTP_METHOD: "POST",
                SpanAttributes.HTTP_URL: url,
                SpanAttributes.NET_PEER_NAME: self.service_name,
                "external_api.service": self.service_name,
                "external_api.timeout_configured_s": self.timeout,
            }
        ) as span:
            start = time.perf_counter()
            labels = {"service": self.service_name, "method": "POST"}

            try:
                response = await self._client.post(path, headers=headers, **kwargs)
                elapsed_ms = (time.perf_counter() - start) * 1000

                span.set_attributes({
                    SpanAttributes.HTTP_STATUS_CODE: response.status_code,
                    "external_api.response_time_ms": elapsed_ms,
                    "external_api.response_size_bytes": len(response.content),
                })

                labels["status_code"] = str(response.status_code)
                labels["status_class"] = f"{response.status_code // 100}xx"
                external_api_latency.record(elapsed_ms, labels)

                if response.status_code >= 400:
                    external_api_errors.add(1, {
                        **labels,
                        "error_type": "http_error",
                    })
                    if response.status_code >= 500:
                        span.set_status(StatusCode.ERROR, f"HTTP {response.status_code}")

                return response

            except httpx.TimeoutException as e:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(e)
                span.set_status(StatusCode.ERROR, "Request timeout")
                span.set_attribute("external_api.timeout_occurred", True)
                external_api_timeout.add(1, {**labels, "error_type": "timeout"})
                external_api_latency.record(elapsed_ms, {**labels, "status_code": "timeout"})
                raise

            except httpx.NetworkError as e:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(e)
                span.set_status(StatusCode.ERROR, "Network error")
                external_api_errors.add(1, {**labels, "error_type": "network_error"})
                raise
```

**외부 API 병목 시각화 전략:**

```
[Grafana 대시보드 패널 구성]

패널 1: 서비스별 외부 API 레이턴시 (P50/P95/P99)
  → histogram_quantile(0.99, external_api.request.duration{service="serper"})

패널 2: 외부 API 에러율 (5분 이동평균)
  → rate(external_api.error.total[5m]) / rate(external_api.request.total[5m]) * 100

패널 3: 타임아웃 발생 빈도 (히트맵)
  → 서비스별 × 시간대별 타임아웃 발생 패턴 → 외부 서비스 SLA 문제 탐지

패널 4: Trace 워터폴 (병목 구간 시각화)
  → Jaeger/Tempo에서 agent.chain → external_api.serper.request Span 계층 표시
```

---

### Layer 3: Model (추론 엔진 & 임베딩)

#### 3-A. vLLM — `Critical` (가장 중요한 AI 특화 계측)

**vLLM 내부 메트릭 수집 (Prometheus Exporter 활용 + OTel 브릿지):**

```python
# sdk-instrumentation/python/llm/vllm_instrumentation.py
from opentelemetry import trace, metrics
from opentelemetry.trace import SpanKind, StatusCode
import time
import asyncio
from typing import AsyncGenerator, Optional

tracer = trace.get_tracer("ai.model.vllm", "1.0.0")
meter = metrics.get_meter("ai.model.vllm", "1.0.0")

# AI 핵심 지표 정의
ttft_histogram = meter.create_histogram(
    name="llm.time_to_first_token",
    description="Time To First Token — 스트리밍 응답에서 첫 토큰 수신까지의 시간",
    unit="ms",
)
tps_histogram = meter.create_histogram(
    name="llm.tokens_per_second",
    description="Token Per Second — 초당 토큰 생성 속도",
    unit="tok/s",
)
token_latency_histogram = meter.create_histogram(
    name="llm.ms_per_token",
    description="토큰당 생성 시간 (TPS의 역수, 지연 분석용)",
    unit="ms/tok",
)
queue_time_histogram = meter.create_histogram(
    name="llm.queue_wait_time",
    description="vLLM 내부 요청 큐 대기 시간 (GPU 포화 지표)",
    unit="ms",
)
prompt_tokens_counter = meter.create_counter(
    name="llm.prompt_tokens.total",
    description="처리된 프롬프트 토큰 누적 수",
    unit="tok",
)
completion_tokens_counter = meter.create_counter(
    name="llm.completion_tokens.total",
    description="생성된 완료 토큰 누적 수",
    unit="tok",
)
concurrent_requests_gauge = meter.create_up_down_counter(
    name="llm.concurrent_requests",
    description="vLLM 현재 처리 중인 동시 요청 수",
    unit="1",
)


async def instrument_vllm_generate(
    engine,
    prompt: str,
    model: str,
    sampling_params,
    request_id: str,
) -> AsyncGenerator:
    """vLLM generate() 호출을 OTel로 감싸는 계측 함수"""

    prompt_tokens = len(prompt.split())  # 실제는 tokenizer 사용

    with tracer.start_as_current_span(
        "llm.vllm.generate",
        kind=SpanKind.INTERNAL,
        attributes={
            "llm.model": model,
            "llm.provider": "vllm",
            "llm.request_id": request_id,
            "llm.prompt_tokens": prompt_tokens,
            "llm.max_tokens": sampling_params.max_tokens,
            "llm.temperature": sampling_params.temperature,
        }
    ) as span:
        request_start = time.perf_counter()
        concurrent_requests_gauge.add(1, {"model": model})

        try:
            # vLLM 큐 진입 전 대기 시간 측정
            queue_enter_time = time.perf_counter()

            first_token_received = False
            completion_tokens = 0
            output_text = ""

            async for output in engine.generate(prompt, sampling_params, request_id):
                if not first_token_received and output.outputs:
                    # TTFT 계산
                    ttft_ms = (time.perf_counter() - request_start) * 1000
                    first_token_received = True

                    span.add_event("llm.first_token", {
                        "llm.ttft_ms": ttft_ms,
                        "llm.queue_position": output.metrics.get("queue_position", -1),
                    })

                    # 큐 대기 시간 (vLLM metrics에서 추출)
                    if hasattr(output, 'metrics') and output.metrics:
                        queue_wait_ms = output.metrics.get("scheduler_wait_ms", 0)
                        queue_time_histogram.record(queue_wait_ms, {"model": model})
                        span.set_attribute("llm.queue_wait_ms", queue_wait_ms)

                    ttft_histogram.record(ttft_ms, {
                        "model": model,
                        "temperature": str(sampling_params.temperature),
                    })

                if output.outputs:
                    completion_tokens = len(output.outputs[0].token_ids)
                    output_text = output.outputs[0].text

                yield output

            # 완료 후 TPS 및 전체 지표 기록
            total_time_s = time.perf_counter() - request_start
            if completion_tokens > 0 and total_time_s > 0:
                # 생성 구간만의 TPS (TTFT 이후부터)
                generation_time_s = total_time_s - (ttft_ms / 1000 if first_token_received else 0)
                tps = completion_tokens / generation_time_s if generation_time_s > 0 else 0
                ms_per_token = (generation_time_s * 1000) / completion_tokens

                tps_histogram.record(tps, {"model": model})
                token_latency_histogram.record(ms_per_token, {"model": model})

                span.set_attributes({
                    "llm.completion_tokens": completion_tokens,
                    "llm.total_tokens": prompt_tokens + completion_tokens,
                    "llm.tps": round(tps, 2),
                    "llm.ms_per_token": round(ms_per_token, 2),
                    "llm.total_duration_ms": total_time_s * 1000,
                    "llm.finish_reason": "stop",
                })

                prompt_tokens_counter.add(prompt_tokens, {"model": model})
                completion_tokens_counter.add(completion_tokens, {"model": model})

        except Exception as e:
            span.record_exception(e)
            span.set_status(StatusCode.ERROR, str(e))
            raise
        finally:
            concurrent_requests_gauge.add(-1, {"model": model})
```

**vLLM 핵심 지표 요약:**

| 지표명 | 타입 | 핵심 레이블 | SLO 기준 |
|--------|------|------------|---------|
| `llm.time_to_first_token` | Histogram | `model` | P95 < 2,000ms |
| `llm.tokens_per_second` | Histogram | `model` | P50 > 30 tok/s |
| `llm.ms_per_token` | Histogram | `model` | P99 < 100 ms/tok |
| `llm.queue_wait_time` | Histogram | `model` | P95 < 1,000ms |
| `llm.concurrent_requests` | UpDownCounter | `model` | < Max Batch |
| `llm.prompt_tokens.total` | Counter | `model` | 비용 추적 |
| `llm.completion_tokens.total` | Counter | `model` | 비용 추적 |

---

#### 3-B. HuggingFace Embedding (로컬 GPU) — `Critical`

```python
# sdk-instrumentation/python/llm/embedding_instrumentation.py
from opentelemetry import trace, metrics
import time
import numpy as np

tracer = trace.get_tracer("ai.model.embedding", "1.0.0")
meter = metrics.get_meter("ai.model.embedding", "1.0.0")

embedding_latency = meter.create_histogram(
    "embedding.request.duration", unit="ms"
)
embedding_batch_size = meter.create_histogram(
    "embedding.batch_size", unit="1"
)
embedding_tokens = meter.create_counter(
    "embedding.tokens.total", unit="tok"
)


def instrument_embedding(model_name: str, device: str = "cuda"):
    def decorator(embed_fn):
        def wrapper(texts: list[str], **kwargs):
            batch_size = len(texts)
            total_tokens = sum(len(t.split()) for t in texts)

            with tracer.start_as_current_span(
                "embedding.encode",
                attributes={
                    "embedding.model": model_name,
                    "embedding.device": device,
                    "embedding.batch_size": batch_size,
                    "embedding.total_tokens": total_tokens,
                }
            ) as span:
                start = time.perf_counter()
                result = embed_fn(texts, **kwargs)
                elapsed_ms = (time.perf_counter() - start) * 1000

                dims = result.shape[-1] if hasattr(result, 'shape') else -1
                span.set_attributes({
                    "embedding.duration_ms": elapsed_ms,
                    "embedding.dimensions": dims,
                    "embedding.throughput_tok_per_s": total_tokens / (elapsed_ms / 1000),
                })

                embedding_latency.record(elapsed_ms, {
                    "model": model_name, "device": device
                })
                embedding_batch_size.record(batch_size, {"model": model_name})
                embedding_tokens.add(total_tokens, {"model": model_name})
                return result
        return wrapper
    return decorator
```

---

### Layer 4: Data (벡터 DB & 캐시)

#### 4-A. Pinecone / Milvus / Qdrant — `Critical`

```python
# sdk-instrumentation/python/vector_db/vectordb_instrumentation.py
from opentelemetry import trace, metrics
from opentelemetry.trace import SpanKind
import time

tracer = trace.get_tracer("ai.data.vectordb", "1.0.0")
meter = metrics.get_meter("ai.data.vectordb", "1.0.0")

vector_search_latency = meter.create_histogram(
    "vectordb.search.duration", unit="ms",
    description="벡터 유사도 검색 레이턴시",
)
vector_search_results = meter.create_histogram(
    "vectordb.search.result_count", unit="1",
    description="검색 결과 수 (Top-K 실제 반환 수)",
)
vector_cache_hit = meter.create_counter(
    "vectordb.cache.hit.total", unit="1",
)
vector_cache_miss = meter.create_counter(
    "vectordb.cache.miss.total", unit="1",
)


class InstrumentedVectorDB:
    def __init__(self, client, db_name: str, index_name: str):
        self.client = client
        self.db_name = db_name
        self.index_name = index_name

    async def search(
        self,
        query_vector: list[float],
        top_k: int,
        filters: dict = None,
        namespace: str = "default",
    ):
        dims = len(query_vector)

        with tracer.start_as_current_span(
            f"vectordb.{self.db_name}.search",
            kind=SpanKind.CLIENT,
            attributes={
                "db.system": self.db_name,       # OTel Semantic Convention
                "db.name": self.index_name,
                "db.operation": "vector_search",
                "vectordb.query.dimensions": dims,
                "vectordb.query.top_k": top_k,
                "vectordb.namespace": namespace,
                "vectordb.filter_applied": bool(filters),
            }
        ) as span:
            start = time.perf_counter()

            try:
                results = await self.client.search(
                    vector=query_vector,
                    top_k=top_k,
                    filter=filters,
                    namespace=namespace,
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                result_count = len(results.get("matches", []))

                # Recall 품질 추적: 최고 점수 vs 최저 점수
                if results.get("matches"):
                    scores = [m["score"] for m in results["matches"]]
                    span.set_attributes({
                        "vectordb.result.count": result_count,
                        "vectordb.result.top_score": scores[0],
                        "vectordb.result.min_score": scores[-1],
                        "vectordb.result.score_spread": scores[0] - scores[-1],
                        "vectordb.search.duration_ms": elapsed_ms,
                    })

                vector_search_latency.record(elapsed_ms, {
                    "db": self.db_name,
                    "index": self.index_name,
                    "filtered": str(bool(filters)),
                })
                vector_search_results.record(result_count, {
                    "db": self.db_name,
                    "top_k": str(top_k),
                })

                return results

            except Exception as e:
                span.record_exception(e)
                raise
```

**Redis Semantic Cache 계측:**

```python
# Redis 캐시 히트/미스 추적 — 임베딩 비용 절감 지표
async def cached_embed_search(query: str, redis_client, embed_fn, vector_db):
    cache_key = f"sem_cache:{hash(query)}"

    with tracer.start_as_current_span("cache.semantic.lookup") as span:
        cached = await redis_client.get(cache_key)
        span.set_attribute("cache.key", cache_key[:50])

        if cached:
            vector_cache_hit.add(1, {"cache": "redis_semantic"})
            span.set_attribute("cache.hit", True)
            return cached

        vector_cache_miss.add(1, {"cache": "redis_semantic"})
        span.set_attribute("cache.hit", False)

        # 캐시 미스: 임베딩 + 검색 수행
        embedding = await embed_fn(query)
        results = await vector_db.search(embedding, top_k=5)
        await redis_client.setex(cache_key, 3600, str(results))  # 1시간 TTL
        return results
```

**수집 지표:**

| 지표명 | 타입 | 레이블 | 임계치 |
|--------|------|--------|--------|
| `vectordb.search.duration` | Histogram | `db`, `index`, `filtered` | P99 > 500ms |
| `vectordb.search.result_count` | Histogram | `db`, `top_k` | 결과 0개 → Alert |
| `vectordb.cache.hit.total` | Counter | `cache` | Hit Rate < 20% → 리뷰 |
| `redis.semantic_cache.hit_rate` | Gauge | — | < 30% → 비용 증가 |

---

### Layer 5: Infra (K8s & GPU)

#### 5-A. NVIDIA DCGM — `Critical` (GPU 상관관계 분석 핵심)

```yaml
# infra/kubernetes/dcgm-exporter.yaml
# DCGM Exporter를 통해 GPU 지표를 Prometheus에 노출 후 OTel로 브릿지

apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: dcgm-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: dcgm-exporter
  template:
    spec:
      containers:
      - name: dcgm-exporter
        image: nvcr.io/nvidia/k8s/dcgm-exporter:3.3.5-3.4.0-ubuntu22.04
        env:
        - name: DCGM_EXPORTER_LISTEN
          value: ":9400"
        - name: DCGM_EXPORTER_KUBERNETES
          value: "true"
        ports:
        - containerPort: 9400
          name: metrics
```

**수집 GPU 지표 (DCGM Field IDs):**

| 지표명 (OTel 변환 후) | DCGM 원본 필드 | 단위 | 임계치 | 설명 |
|----------------------|--------------|------|--------|------|
| `gpu.utilization_pct` | `DCGM_FI_DEV_GPU_UTIL` | % | > 95% → Alert | SM 코어 가동률 |
| `gpu.vram.used_bytes` | `DCGM_FI_DEV_FB_USED` | bytes | > 90% capacity | VRAM 사용량 |
| `gpu.vram.free_bytes` | `DCGM_FI_DEV_FB_FREE` | bytes | < 2GB → Alert | 가용 VRAM |
| `gpu.power.draw_watts` | `DCGM_FI_DEV_POWER_USAGE` | W | > TDP 90% | 전력 소비 |
| `gpu.temperature_c` | `DCGM_FI_DEV_GPU_TEMP` | °C | > 85°C → Alert | 온도 (스로틀링 전조) |
| `gpu.sm_clock_hz` | `DCGM_FI_DEV_SM_CLOCK` | MHz | 급격한 감소 → 스로틀링 | SM 클록 속도 |
| `gpu.memory_bandwidth_pct` | `DCGM_FI_DEV_MEM_COPY_UTIL` | % | > 90% → 병목 | 메모리 대역폭 |
| `gpu.nvlink_bandwidth_bytes` | `DCGM_FI_DEV_NVLINK_BANDWIDTH_TOTAL` | bytes/s | — | NVLink 전송량 |

**GPU-LLM 상관관계 분석 쿼리 (Prometheus):**

```promql
# GPU VRAM 사용률과 LLM 큐 대기 시간 상관관계
# 두 지표를 시계열로 오버레이하여 VRAM 포화 → 큐 증가 패턴 탐지

# VRAM 사용률 (%) — DCGM 지표 사용
(aiservice_gpu_memory_used / (aiservice_gpu_memory_used + aiservice_gpu_memory_free)) * 100

# LLM 큐 대기 시간 P95 (ms) — 같은 시간축에 오버레이
histogram_quantile(0.95,
  rate(aiservice_llm_queue_wait_time_bucket[5m])
)

# 상관관계 경보: VRAM > 85% AND 큐 대기 > 2000ms 동시 발생
(job:gpu_vram_utilization:avg > 85)
  and
(histogram_quantile(0.95, rate(aiservice_llm_queue_wait_time_bucket[5m])) > 2000)
```

---

## 5. AI 특화 핵심 성능 수식

### 5.1 TTFT (Time to First Token)

$$
\text{TTFT} = T_{\text{first\_chunk}} - T_{\text{request\_start}}
$$

여기서 스트리밍 지연 구성요소 분해:

$$
\text{TTFT}_{total} = \underbrace{T_{guardrail}}_{\text{가드레일 검증}} + \underbrace{T_{queue}}_{\text{vLLM 큐 대기}} + \underbrace{T_{prefill}}_{\text{프롬프트 프리필}} + \underbrace{T_{network}}_{\text{네트워크 전송}}
$$

**SLO 목표:** $\text{TTFT}_{P95} \leq 2{,}000\ \text{ms}$

---

### 5.2 TPS (Tokens Per Second)

$$
\text{TPS} = \frac{N_{completion\_tokens}}{T_{total} - \text{TTFT}}
$$

배치 처리 시 유효 TPS:

$$
\text{TPS}_{effective} = \text{TPS}_{single} \times B_{size} \times \eta_{gpu}
$$

여기서:
- $B_{size}$: 배치 크기
- $\eta_{gpu}$: GPU 병렬 처리 효율 (0 ~ 1)

**SLO 목표:** $\text{TPS}_{P50} \geq 30\ \text{tok/s}$

---

### 5.3 ms/token (토큰당 생성 시간)

$$
\text{ms/token} = \frac{(T_{total} - \text{TTFT}) \times 1000}{N_{completion\_tokens}}
$$

**해석:**
- $\text{ms/token} < 33\ \text{ms}$: TPS > 30 (정상)
- $\text{ms/token} > 100\ \text{ms}$: TPS < 10 (심각한 병목)

---

### 5.4 GPU VRAM 포화 예측 (선형 회귀 기반)

$$
T_{OOM} = \frac{V_{total} - V_{used}(t)}{\dot{V}_{used}}
$$

여기서 $\dot{V}_{used}$는 VRAM 증가 속도 (bytes/s):

$$
\dot{V}_{used} = \frac{V_{used}(t) - V_{used}(t - \Delta t)}{\Delta t}
$$

**경보 조건:** $T_{OOM} < 300\ \text{s}$ (5분 이내 OOM 예상) → `CRITICAL` 알람

---

### 5.5 가드레일 레이턴시 기여도

$$
\text{Guardrail Contribution} = \frac{\overline{T_{guardrail}}}{\overline{T_{e2e}}} \times 100\%
$$

**목표:** 가드레일이 전체 레이턴시의 20% 이하를 차지해야 함.

---

### 5.6 벡터 검색 품질 지표 (Recall@K)

$$
\text{Recall@K} = \frac{|R_{relevant} \cap R_{retrieved}|}{|R_{relevant}|}
$$

OTel에서는 최고 스코어 / 최저 스코어 분포로 간접 추적:

$$
\text{Score Spread} = \text{score}_{rank=1} - \text{score}_{rank=K}
$$

높은 Score Spread → 검색 품질 양호 (상위 결과와 하위 결과 명확히 구분됨)

---

## 6. 병목 구간별 시각화 전략

### 6.1 전체 요청 흐름 워터폴 (Trace 뷰)

```
사용자 요청 E2E 트레이스 (Jaeger/Grafana Tempo)

[0ms]     ├── api.http.request (FastAPI)
[10ms]    │   ├── guardrail.validate.input (NeMo)          ← 20ms (정상)
[30ms]    │   │   └── guardrail.llm_call (내부 LLM 호출)  ← 경우에 따라 느림!
[50ms]    │   ├── agent.chain.main
[55ms]    │   │   ├── agent.tool.search (Serper API)       ← 외부 API (변동 큼)
[200ms]   │   │   │   └── external_api.serper.request      ← 150ms (네트워크)
[210ms]   │   │   ├── vectordb.pinecone.search             ← 30ms (정상)
[240ms]   │   │   └── llm.vllm.generate                   ← 병목 구간
[240ms]   │   │       ├── llm.queue_wait                   ← 큐 대기 (GPU 부하 반영)
[500ms]   │   │       ├── llm.prefill                      ← 프롬프트 처리
[502ms]   │   │       └── ★ first_token_event (TTFT=262ms)
[3000ms]  │   │           └── streaming.generate...
[3010ms]  └── api.http.response
```

### 6.2 Grafana 대시보드 구성 권고

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Service Performance Dashboard                                 │
├────────────────────┬────────────────────┬───────────────────────┤
│ [1] E2E P95 레이턴시│ [2] TTFT 분포      │ [3] TPS 히트맵         │
│ 목표선: 5000ms     │ P95 목표: 2000ms   │ 모델별 × 시간대별      │
├────────────────────┼────────────────────┼───────────────────────┤
│ [4] 가드레일 차단율 │ [5] 외부 API 레이턴시│ [6] GPU VRAM vs 큐대기│
│ Alert: >5%/5min    │ 서비스별 P99       │ 상관관계 이중축 차트   │
├────────────────────┼────────────────────┼───────────────────────┤
│ [7] 벡터DB 검색시간 │ [8] 캐시 히트율    │ [9] 에러율 by 레이어   │
│ Index별 분포       │ Semantic Cache %   │ 스택 차트 (레이어별)   │
└────────────────────┴────────────────────┴───────────────────────┘
```

---

## 7. 장애 예방 Alert 임계치 정의

| Alert 이름 | 조건 | 심각도 | 액션 |
|-----------|------|--------|------|
| `LLM_TTFT_HIGH` | P95 TTFT > 3,000ms (5분 지속) | `CRITICAL` | vLLM 재시작 / GPU 증설 트리거 |
| `LLM_TPS_LOW` | P50 TPS < 15 tok/s (5분 지속) | `WARNING` | GPU 스로틀링 / 메모리 단편화 조사 |
| `GPU_VRAM_CRITICAL` | VRAM 사용률 > 92% | `CRITICAL` | 신규 요청 큐잉 / Scale-out |
| `GPU_OOM_PREDICTED` | $T_{OOM}$ < 5분 예측 | `CRITICAL` | 즉시 로드 쉐딩 |
| `GUARDRAIL_BLOCK_SPIKE` | 차단율 > 10%/min (3분 지속) | `WARNING` | 보안팀 알림 / 트래픽 패턴 조사 |
| `GUARDRAIL_LATENCY_HIGH` | P99 > 1,500ms (3분 지속) | `WARNING` | 가드레일 정책 최적화 검토 |
| `EXTERNAL_API_TIMEOUT` | 타임아웃률 > 5%/5min | `WARNING` | Circuit Breaker 동작 / Fallback |
| `VECTOR_SEARCH_SLOW` | P99 > 800ms (5분 지속) | `WARNING` | 인덱스 재구성 / 샤드 리밸런싱 |
| `CACHE_HIT_RATE_LOW` | Semantic Cache < 20% (30분) | `INFO` | TTL 조정 / 캐시 전략 재검토 |
| `AGENT_RECURSION_DEEP` | 재귀 깊이 > 20 | `WARNING` | Agent 루프 탐지 / 강제 종료 |
| `LLM_QUEUE_BACKLOG` | 큐 대기 P95 > 5,000ms | `CRITICAL` | 추가 vLLM 인스턴스 기동 |

---

## 8. Context Propagation 설계

### 8.1 W3C TraceContext 전파 경로

```
클라이언트 (Next.js)
  │  traceparent: 00-{trace_id}-{parent_span_id}-01
  ▼
FastAPI (Python)                    ← OTel SDK: 헤더 자동 파싱
  │  [guardrail.validate span]
  │  traceparent 유지
  ▼
NeMo Guardrails (Python)            ← 동일 Trace ID 유지
  │
  ▼
LangChain Agent (Python)
  │  [agent.tool span 생성]
  │  traceparent 업데이트 (새 span_id)
  │
  ├──► Serper API (HTTP)           ← httpx: traceparent 자동 주입
  │      외부 서비스에서도 Trace ID 연속
  │
  ├──► Pinecone (HTTP/gRPC)        ← grpc metadata에 traceparent 주입
  │
  └──► vLLM (HTTP)                 ← traceparent 헤더로 전파
         │
         └── GPU 추론 (내부 span)
```

### 8.2 언어 간 컨텍스트 전파 구현

```python
# Python → 외부 서비스 전파 (자동)
from opentelemetry.propagate import inject
headers = {}
inject(headers)  # traceparent, tracestate 자동 삽입
response = httpx.post(url, headers=headers)

# Python → Go 서비스 (gRPC) 전파
from opentelemetry.instrumentation.grpc import GrpcInstrumentorClient
GrpcInstrumentorClient().instrument()  # 자동 메타데이터 주입
```

```javascript
// Node.js (Next.js) → Python 백엔드 전파
import { propagation, context } from '@opentelemetry/api';
const headers = {};
propagation.inject(context.active(), headers);
// headers에 자동으로 traceparent 추가됨
fetch('/api/chat', { headers });
```

```go
// Go 서비스에서 컨텍스트 추출 및 전파
import "go.opentelemetry.io/otel/propagation"

// 수신 측: 헤더에서 컨텍스트 추출
prop := propagation.NewCompositeTextMapPropagator(
    propagation.TraceContext{},
    propagation.Baggage{},
)
ctx := prop.Extract(r.Context(), propagation.HeaderCarrier(r.Header))

// 발신 측: 다음 서비스로 전파
prop.Inject(ctx, propagation.HeaderCarrier(outgoingHeaders))
```

### 8.3 Trace ID 연속성 검증 방법

```promql
# Trace 단절 탐지: root span은 있는데 child span이 없는 트레이스
# (Jaeger 쿼리 / Tempo에서 직접 확인)

# Prometheus에서 간접 탐지:
# 각 레이어의 요청 수가 일치해야 함
# (가드레일 요청 수 ≈ LLM 요청 수, 큰 차이 → 전파 단절 가능성)
abs(
  rate(aiservice_guardrail_request_total[5m]) -
  rate(aiservice_llm_concurrent_requests[5m])
) > 0.1 * rate(aiservice_guardrail_request_total[5m])
```

---

---

## 9. 지표명 네이밍 컨벤션

이 프로젝트의 모든 커스텀 메트릭은 `aiservice_` 접두사를 사용합니다. Prometheus exporter를 통해 내보낼 때 OTel SDK 메트릭명이 자동 변환됩니다.

| OTel SDK 메트릭명 | Prometheus 노출명 | 비고 |
|-------------------|-------------------|------|
| `llm.time_to_first_token` | `aiservice_llm_time_to_first_token` | Histogram |
| `llm.tokens_per_second` | `aiservice_llm_tokens_per_second` | Histogram |
| `llm.queue_wait_time` | `aiservice_llm_queue_wait_time` | Histogram |
| `guardrail.validation.duration` | `aiservice_guardrail_validation_duration` | Histogram |
| `guardrail.block.total` | `aiservice_guardrail_block_total` | Counter |
| `external_api.request.duration` | `aiservice_external_api_request_duration` | Histogram |
| `vectordb.search.duration` | `aiservice_vectordb_search_duration` | Histogram |
| `embedding.request.duration` | `aiservice_embedding_duration` | Histogram |

> **참고**: Prometheus exporter의 `namespace: "aiservice"` 설정에 의해 접두사가 자동 추가됩니다.
> Alert Rule과 Recording Rule에서는 `aiservice_` 접두사가 포함된 이름을 사용합니다.

---

## 10. 실제 구현 파일 매핑

이 문서에서 정의한 지표가 실제로 구현된 파일 위치:

| 섹션 | 구현 파일 | 줄 수 |
|------|----------|------|
| Layer 1: FastAPI 스트리밍 | `sdk-instrumentation/python/agents/fastapi_streaming.py` | 145줄 |
| Layer 1: Frontend SSE | `sdk-instrumentation/nodejs/frontend-streaming.js` | 160줄 |
| Layer 1: 가드레일 | `sdk-instrumentation/python/guardrails/nemo_instrumentation.py` | 129줄 |
| Layer 2: LangChain Agent | `sdk-instrumentation/python/agents/langchain_tracer.py` | 295줄 |
| Layer 2: 외부 API | `sdk-instrumentation/python/agents/external_api_tracer.py` | 220줄 |
| Layer 3: vLLM TTFT/TPS | `sdk-instrumentation/python/llm/vllm_instrumentation.py` | 152줄 |
| Layer 3: Embedding | `sdk-instrumentation/python/llm/embedding_instrumentation.py` | 210줄 |
| Layer 4: 벡터 DB | `sdk-instrumentation/python/vector_db/vectordb_instrumentation.py` | 280줄 |
| Layer 5: GPU (DCGM) | `infra/kubernetes/dcgm-exporter.yaml` | 120줄 |
| Alert Rules | `infra/docker/prometheus-rules.yaml` | 152줄 |
| Recording Rules | `infra/kubernetes/prometheus-servicemonitor.yaml` | 150줄 |
| Grafana 대시보드 | `dashboards/grafana/*.json` | 5개 |

---

## 11. AITOP Agent 수집 메트릭 매핑 (Phase 15~16)

> AITOP Agent는 OTel SDK 계측과 별도로, 인프라/AI 시스템의 **설정 및 상태를 진단 수집**합니다.
> 수집된 데이터는 Evidence로 저장되며, 진단 엔진이 86개 항목(IT 55 + AI 31)으로 자동 판정합니다.
> 상세 설계는 [AGENT_DESIGN.md](./AGENT_DESIGN.md)를 참조하세요.

### 11.1 IT Collector 수집 항목

| Collector | 수집 데이터 | 저장소 | UI 화면 |
|-----------|-----------|--------|---------|
| **OS Collector** | CPU 사용률, 메모리, 디스크 I/O, 네트워크 I/O, 프로세스 목록, 커널 파라미터 | Prometheus (시계열), S3 (스냅샷) | `/infra/[hostname]` |
| **WEB Collector** | Nginx/Apache 설정 파싱, 상태 페이지, SSL 인증서 만료일, worker 설정 | S3 (Evidence) | `/infra/[hostname]` 미들웨어 탭 |
| **WAS Collector** | Tomcat/Spring Boot JVM 설정, GC 로그 분석, Thread Dump (jcmd), 히프 사용량 | S3 (Evidence) | `/infra/[hostname]` 미들웨어 탭 |
| **DB Collector** | PostgreSQL/MySQL/Oracle 파라미터, 커넥션 풀 상태, 슬로우 쿼리 Top-N | S3 (Evidence) | `/infra/[hostname]` 미들웨어 탭 |

### 11.2 AI Collector 수집 항목

| Collector | 수집 데이터 | AITOP 진단 항목 | 저장소 |
|-----------|-----------|----------------|--------|
| **GPU Collector** | nvidia-smi VRAM, 온도, 전력, SM%, ECC 에러, PCIe 대역폭 | ITEM0207~0208 (TA) | Prometheus, S3 |
| **LLM Collector** | 모델 설정, Rate Limit, 토큰 사용량, 프롬프트 버전, 가드레일 설정 | ITEM0200~0204, 0209~0212 (AA) | S3 |
| **VectorDB Collector** | Qdrant/Milvus/Chroma 헬스, 인덱스 상태, 임베딩/청킹 설정, PII 탐지 | ITEM0221~0223 (AA) | S3 |
| **Serving Collector** | vLLM/Ollama/Triton 헬스, 배칭/양자화 설정, KV Cache, K8s GPU 리소스 | ITEM0217~0220, 0227~0229 (TA) | S3 |
| **OTel Metrics Collector** | Prometheus에서 11개 AI 메트릭 스냅샷 (TTFT, TPS, 가드레일 등) | ITEM0230 (AA) | S3 |

### 11.3 OTel 실시간 메트릭 vs Agent 진단 메트릭 비교

| 관점 | OTel SDK 계측 (실시간) | AITOP Agent 수집 (진단) |
|------|---------------------|----------------------|
| **수집 대상** | 애플리케이션 런타임 메트릭 | 시스템 설정 및 상태 |
| **수집 주기** | 15초 (Prometheus scrape) | 5분 (정기) 또는 온디맨드 |
| **데이터 형태** | 시계열 (time series) | 스냅샷 (Evidence JSON) |
| **저장소** | Prometheus → Thanos | S3/MinIO + PostgreSQL |
| **용도** | 실시간 대시보드, 알림 | 진단 보고서, 교차 분석 |
| **예시** | `llm.time_to_first_token` P95 = 1.2s | "vLLM max_num_seqs=256 설정" |

### 11.4 진단 항목 구조 (86개)

| 카테고리 | 항목 수 | 주요 내용 |
|---------|--------|----------|
| OS (IT) | 15 | CPU/메모리/디스크/네트워크 임계치, 커널 파라미터 |
| WEB (IT) | 10 | Nginx worker, SSL 만료, 응답 코드 분포 |
| WAS (IT) | 15 | JVM 히프, GC 패턴, Thread Pool, 커넥션 풀 |
| DB (IT) | 15 | 슬로우 쿼리, 커넥션 사용률, 파라미터 최적화 |
| GPU (AI) | 8 | VRAM 사용률, 온도, ECC 에러, SM Occupancy |
| LLM (AI) | 10 | TTFT/TPS SLO 위반, Rate Limit, 프롬프트 관리 |
| VectorDB (AI) | 7 | 인덱스 상태, 검색 품질, PII 노출 |
| Guardrail (AI) | 6 | 차단율, 정책 커버리지, 레이턴시 기여도 |

---

---

## 12. Java / .NET 전용 메트릭 (Phase 24 예정)

> **상세 설계**: [JAVA_DOTNET_SDK_DESIGN.md](./JAVA_DOTNET_SDK_DESIGN.md) §7 참조
> **배경**: Java/Spring Boot 및 .NET/ASP.NET Core는 AI 서비스를 호출하는 엔터프라이즈 게이트웨이로 가장 흔히 사용된다.
> 이 레이어의 병목(GC, 커넥션 풀, 스레드 경합)을 관찰해야 전체 레이턴시 원인을 정확히 파악할 수 있다.

### 12.1 JVM 메트릭 (Java)

> **수집 방법**: OTel Java Agent + AITOP Java Extension 자동 수집 (코드 변경 없음)
> **수집 주기**: 15초 (Prometheus scrape)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `jvm.heap.used` | Gauge | bytes | `service` | Heap 사용량 |
| `jvm.heap.max` | Gauge | bytes | `service` | Heap 최대 용량 |
| `jvm.heap.usage_ratio` | Gauge | 1 (0~1) | `service` | Heap 사용률 (used/max) |
| `jvm.gc.pause.time` | Counter | ms | `gc.name`, `service` | GC 일시정지 누적 시간 |
| `jvm.gc.collections` | Counter | 1 | `generation`, `service` | GC 수집 횟수 |
| `jvm.threads.live` | Gauge | 1 | `service` | 활성 스레드 수 |
| `jvm.threads.deadlocked` | Gauge | 1 | `service` | 데드락 스레드 수 |
| `jvm.threads.peak` | Gauge | 1 | `service` | 최대 동시 스레드 수 |
| `jvm.classes.loaded` | Gauge | 1 | `service` | 로드된 클래스 수 |
| `jvm.compilation.time` | Counter | ms | `service` | JIT 컴파일 누적 시간 |
| `jdbc.connections.active` | Gauge | 1 | `pool`, `service` | 활성 DB 커넥션 수 |
| `jdbc.connections.max` | Gauge | 1 | `pool`, `service` | 커넥션 풀 최대 크기 |
| `jdbc.slow_query.count` | Counter | 1 | `service` | 슬로우 쿼리 발생 횟수 |

**SLO 기준값 (Java):**

| 메트릭 | 경고 | 위험 | 알림 채널 |
|--------|------|------|---------|
| `jvm.heap.usage_ratio` | > 0.75 | > 0.90 | Slack #oncall |
| `jvm.gc.pause.time` rate/5m | > 500ms | > 2s | PagerDuty |
| `jvm.threads.deadlocked` | > 0 | > 0 | PagerDuty (즉시) |
| `jdbc.connections.active / max` | > 0.80 | > 0.95 | Slack #oncall |

### 12.2 CLR 메트릭 (.NET)

> **수집 방법**: OTel .NET Auto-Instrumentation + AITOP CLR Profiler 자동 수집
> **수집 주기**: 15초 (Prometheus scrape)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `clr.gc.heap.size` | Gauge | bytes | `service` | GC 힙 전체 크기 |
| `clr.gc.collections` | Counter | 1 | `generation`, `service` | GC 세대별 수집 횟수 |
| `clr.gc.pause.duration` | Histogram | ms | `generation`, `service` | GC 일시정지 시간 |
| `clr.threadpool.threads` | Gauge | 1 | `service` | 활성 스레드 풀 스레드 수 |
| `clr.threadpool.queue.length` | Gauge | 1 | `service` | 스레드 풀 대기 작업 수 |
| `clr.threadpool.completed` | Counter | 1 | `service` | 완료된 스레드 풀 작업 수 |
| `clr.exceptions.thrown` | Counter | 1 | `exception.type`, `service` | 예외 발생 수 |
| `clr.assemblies.loaded` | Gauge | 1 | `service` | 로드된 어셈블리 수 |
| `aspnetcore.requests.active` | Gauge | 1 | `service` | 처리 중인 HTTP 요청 수 |
| `aspnetcore.request.duration` | Histogram | ms | `method`, `route`, `service` | 요청 처리 시간 |
| `efcore.query.duration` | Histogram | ms | `table`, `service` | EF Core 쿼리 실행 시간 |

**SLO 기준값 (.NET):**

| 메트릭 | 경고 | 위험 | 알림 채널 |
|--------|------|------|---------|
| `clr.gc.pause.duration` P95 | > 200ms | > 500ms | Slack #oncall |
| `clr.threadpool.queue.length` | > 100 | > 500 | PagerDuty |
| `aspnetcore.requests.active` | > 200 | > 500 | PagerDuty |

### 12.3 메소드 프로파일링 메트릭 (Java/.NET 공통)

> **수집 방법**: ByteBuddy(Java) / CLR Profiler(.NET) — 임계치(기본 5ms) 이상 메소드만 수집
> **데이터 모델**: 메소드 콜 트리 JSON → OTel Span 이벤트로 기록

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `method.duration` | Histogram | ms | `language`, `class`, `method` | 메소드 실행 시간 분포 |
| `method.calls.total` | Counter | 1 | `language`, `class`, `method` | 메소드 호출 횟수 |
| `method.errors.total` | Counter | 1 | `language`, `class`, `method`, `error_type` | 메소드 예외 발생 수 |
| `method.sql.count` | Counter | 1 | `language`, `method` | 메소드당 SQL 호출 수 |
| `method.sql.duration` | Histogram | ms | `language`, `method` | 메소드 내 SQL 총 소요 시간 |

### 12.3-A 파일 I/O 메트릭 (Java/.NET 공통)

> **수집 방법**: ByteBuddy(Java) / CLR Profiler(.NET) — `java.io` / `java.nio`(Java), `System.IO`(.NET) 계열 클래스 후킹
> **슬로우 감지 임계치**: 50ms 초과 시 `file.io.slow.count` 증가 (설정: `aitop.fileio.slow-call.threshold-ms`)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `file.io.duration` | Histogram | ms | `language`, `operation`, `path_pattern` | 파일 I/O 소요 시간 분포 (open/read/write/close) |
| `file.io.bytes` | Counter | bytes | `language`, `operation` | 파일 읽기/쓰기 누적 바이트 수 |
| `file.io.operations` | Counter | 1 | `language`, `operation` (open/read/write/close) | 파일 I/O 작업 유형별 호출 횟수 |
| `file.io.slow.count` | Counter | 1 | `language`, `operation`, `path_pattern` | 슬로우 파일 I/O 발생 횟수 (50ms 초과) |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 | 알림 채널 |
|--------|------|------|----------|
| `file.io.duration` P95 | > 50ms | > 200ms | Slack #oncall |
| `file.io.slow.count` rate/5m | > 10 | > 50 | PagerDuty |
| `file.io.bytes` rate/1m | > 100MB | > 500MB | Slack #oncall |

### 12.4 Agent 진단 항목 확장 (Java/.NET)

기존 WAS(IT) 진단 항목(15개)에 Java/.NET 특화 항목을 추가합니다:

| 카테고리 | 항목 | 수집 항목 | 저장소 |
|---------|------|----------|--------|
| **JVM (IT)** | ITEM0300~0309 (신규 10개) | Heap 사용률, GC 패턴, Full GC 주기, Thread Dump, 커넥션 풀 상태, 클래스 로딩, JIT 컴파일률, 메모리 누수 징후, 데드락 감지, 힙 덤프 분석 | S3 |
| **CLR (IT)** | ITEM0310~0319 (신규 10개) | GC 힙 크기, 세대별 GC 주기, 스레드 풀 포화도, 예외 발생률, 어셈블리 로딩, LOH(Large Object Heap) 단편화, 비동기 대기 시간, TaskScheduler 큐 길이, CLR 버전, 환경 설정 | S3 |

## 13. 미들웨어 메트릭 (Phase 26 예정)

> **목표**: 언어 런타임별 미들웨어 상태(스레드/이벤트 루프/워커/고루틴, 커넥션 풀, 요청 큐)를 표준 네임스페이스로 수집하여 대시보드 및 알림에 활용한다.

### 13.1 공통 HTTP 요청 메트릭

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.http.request.duration` | Histogram | ms | `language`, `framework`, `method`, `status_code` | HTTP 요청 처리 시간 분포 |
| `middleware.http.request.count` | Counter | 1 | `language`, `framework`, `method`, `status_code` | HTTP 요청 수 (상태코드별) |
| `middleware.http.request.tps` | Gauge | req/s | `language`, `framework` | 초당 처리 요청 수 (TPS) |
| `middleware.http.request.error_rate` | Gauge | % | `language`, `framework` | HTTP 에러율 (4xx+5xx / 전체) |
| `middleware.http.request.active` | Gauge | 1 | `language`, `framework` | 현재 처리 중인 동시 요청 수 |
| `middleware.request_queue.depth` | Gauge | 1 | `language`, `framework` | 처리 대기 중인 요청 큐 깊이 |

### 13.2 Thread Pool 메트릭 (Java / .NET)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.thread_pool.active` | Gauge | 1 | `language`, `framework`, `pool_name` | 현재 활성(요청 처리 중) 스레드 수 |
| `middleware.thread_pool.idle` | Gauge | 1 | `language`, `framework`, `pool_name` | 현재 유휴 스레드 수 |
| `middleware.thread_pool.max` | Gauge | 1 | `language`, `framework`, `pool_name` | 설정된 최대 스레드 수 |
| `middleware.thread_pool.queue_length` | Gauge | 1 | `language`, `framework`, `pool_name` | 스레드 풀 대기 큐 길이 (.NET) |
| `middleware.thread_pool.completed_items` | Counter | 1 | `language`, `framework` | 완료된 작업 항목 수 (.NET) |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 |
|--------|------|------|
| `middleware.thread_pool.active / max` | > 80% | > 95% |
| `middleware.thread_pool.queue_length` | > 50 | > 200 |

### 13.3 Connection Pool 메트릭 (공통)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.connection_pool.active` | Gauge | 1 | `language`, `pool_impl` | 현재 사용 중인 커넥션 수 |
| `middleware.connection_pool.idle` | Gauge | 1 | `language`, `pool_impl` | 유휴 커넥션 수 |
| `middleware.connection_pool.max` | Gauge | 1 | `language`, `pool_impl` | 최대 커넥션 수 (설정값) |
| `middleware.connection_pool.pending` | Gauge | 1 | `language`, `pool_impl` | 커넥션 획득 대기 중인 요청 수 |
| `middleware.connection_pool.wait_time` | Histogram | ms | `language`, `pool_impl` | 커넥션 대기 시간 분포 (P50/P95/P99) |
| `middleware.connection_pool.overflow` | Gauge | 1 | `language`, `pool_impl` | overflow 커넥션 수 (Python SQLAlchemy) |
| `middleware.connection_pool.wait_count` | Counter | 1 | `language`, `pool_impl` | 누적 대기 횟수 (Go database/sql) |
| `middleware.connection_pool.wait_duration` | Counter | ms | `language`, `pool_impl` | 누적 대기 시간 (Go database/sql) |

**pool_impl 레이블 값**: `hikaricp`, `dbcp2`, `c3p0`, `ef_core`, `pg_pool`, `mongoose`, `sqlalchemy`, `database_sql`

**SLO 기준값:**

| 메트릭 | 경고 | 위험 | 알림 채널 |
|--------|------|------|----------|
| `connection_pool.active / max` | > 80% | > 90% | Slack #oncall |
| `connection_pool.pending` > 0 지속 | 30초 | 60초 | PagerDuty |
| `connection_pool.wait_time` P99 | > 100ms | > 500ms | Slack #oncall |

### 13.4 Event Loop 메트릭 (Node.js)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.event_loop.lag` | Gauge | ms | `framework` | 이벤트 루프 지연 시간 |
| `middleware.event_loop.utilization` | Gauge | ratio | `framework` | 이벤트 루프 사용률 (0~1) |
| `middleware.active_connections` | Gauge | 1 | `framework` | 현재 활성 HTTP 연결 수 |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 |
|--------|------|------|
| `event_loop.lag` | > 100ms | > 500ms |
| `event_loop.utilization` | > 0.8 | > 0.95 |

### 13.5 Worker 메트릭 (Python)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.worker.active` | Gauge | 1 | `framework`, `server` | 현재 요청 처리 중인 워커 수 |
| `middleware.worker.idle` | Gauge | 1 | `framework`, `server` | 현재 유휴 워커 수 |
| `middleware.worker.restarts` | Counter | 1 | `framework`, `server` | 워커 재시작 누적 횟수 |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 |
|--------|------|------|
| `worker.active / (active+idle)` | > 90% | > 100% (모든 워커 포화) |
| `worker.restarts` rate/5m | > 3 | > 10 |

### 13.6 Goroutine 메트릭 (Go)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.goroutine.count` | Gauge | 1 | `framework` | 현재 고루틴 수 |
| `middleware.goroutine.created` | Counter | 1 | `framework` | 누적 생성된 고루틴 수 |

**누수 감지 기준**: `goroutine.count` 가 기준값(배포 직후 P50) 대비 2배 이상 증가 시 경고, 5배 이상 시 위험 알림 발송.

### 13.7 Session 메트릭 (Java WAS)

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.session.active` | Gauge | 1 | `framework`, `context` | 현재 활성 세션 수 |
| `middleware.session.created` | Counter | 1 | `framework`, `context` | 누적 생성된 세션 수 |
| `middleware.session.expired` | Counter | 1 | `framework`, `context` | 누적 만료된 세션 수 |

### 13.8 메시지 큐 메트릭

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|-------|------|
| `middleware.kafka.consumer.lag` | Gauge | 1 | `group_id`, `topic`, `partition` | Kafka Consumer Group 파티션별 Lag |
| `middleware.kafka.consumer.lag_max` | Gauge | 1 | `group_id`, `topic` | Consumer Group 내 최대 Lag |
| `middleware.kafka.producer.sent_rate` | Gauge | msg/s | `topic` | 초당 Kafka 전송 메시지 수 |
| `middleware.rabbitmq.queue.depth` | Gauge | 1 | `queue`, `vhost` | RabbitMQ 큐 메시지 수 |
| `middleware.rabbitmq.queue.consumers` | Gauge | 1 | `queue`, `vhost` | RabbitMQ 큐 소비자 수 |
| `middleware.rabbitmq.queue.publish_rate` | Gauge | msg/s | `queue`, `vhost` | 초당 RabbitMQ Publish 수 |
| `middleware.activemq.queue.depth` | Gauge | 1 | `queue`, `broker` | ActiveMQ 큐 메시지 수 |
| `middleware.activemq.queue.enqueue_count` | Counter | 1 | `queue`, `broker` | ActiveMQ 누적 Enqueue 수 |
| `middleware.activemq.queue.consumer_count` | Gauge | 1 | `queue`, `broker` | ActiveMQ 소비자 수 |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 | 알림 채널 |
|--------|------|------|----------|
| `kafka.consumer.lag_max` | > 1,000 | > 10,000 | Slack #oncall |
| `rabbitmq.queue.depth` | > 500 | > 5,000 | PagerDuty |
| `activemq.queue.depth` | > 500 | > 5,000 | Slack #oncall |

---

*이 문서는 지표 정의가 변경될 때 업데이트합니다.*
*관련 문서: [ARCHITECTURE.md](./ARCHITECTURE.md) | [AGENT_DESIGN.md](./AGENT_DESIGN.md) | [UI_DESIGN.md](./UI_DESIGN.md) | [TEST_GUIDE.md](./TEST_GUIDE.md) | [JAVA_DOTNET_SDK_DESIGN.md](./JAVA_DOTNET_SDK_DESIGN.md)*
