# AITOP AI Observability 설계 — 경쟁사 분석 기반

> **버전**: v2.0 (전체 구현 완료)
> **작성일**: 2026-03-27 / **구현 완료**: 2026-03-28
> **참조**: `AITOP_구현_차세대_방향성.MD` 13장 경쟁사 참고 소스 분석
> **구현 상태**: Phase D~I 전체 완료 (20/20건) — LLM 트레이싱, 토큰 비용, RAG 파이프라인, AI 대시보드, 품질 평가, 보안 모니터링, AI 진단 ITEM 5종

---

## 1. 경쟁사 AI Observability 기능 갭 분석

### 1.1 경쟁사 vs AITOP 기능 대조표

| 기능 | Datadog | Dynatrace | Splunk | Instana | Grafana | **AITOP** |
|------|---------|-----------|--------|---------|---------|-----------|
| LLM 호출 트레이싱 (prompt/response/latency) | YES | YES | YES | YES | YES | **NO** |
| 토큰 사용량 + 비용 추적 | YES | YES | YES | YES | - | **NO** |
| 품질 평가 (Hallucination/Relevance/Toxicity) | YES | - | - | - | - | **NO** |
| Agent Step / Workflow 트레이싱 | YES | YES | YES | YES | YES | **NO** |
| Prompt/Response 캡처 + 클러스터링 | YES | - | - | - | - | **NO** |
| AI 보안 스캐닝 (Prompt Injection/Data Leak) | YES | - | YES | - | - | **NO** |
| 모델 비교 / 벤치마킹 | YES | - | - | - | - | **NO** |
| OTel GenAI Semantic Conventions | YES | YES | YES | YES | YES | **NO** |
| ML 기반 이상 탐지 | - | YES | - | YES | YES | **NO** |
| 프리빌트 AI 대시보드 | YES | YES | YES | YES | YES | **NO** |
| APM / 분산 추적 | YES | YES | YES | YES | YES | **YES** |
| Prometheus 메트릭 | YES | YES | YES | - | YES | **YES** |
| 커스텀 대시보드 | YES | YES | YES | YES | YES | **YES** |
| OS / 인프라 메트릭 | YES | YES | YES | YES | YES | **YES** |

### 1.2 경쟁사 핵심 기능 Top 5 (AITOP에 없는 것)

| 우선순위 | 기능 | 필요성 | 경쟁사 채택률 |
|---------|------|--------|-------------|
| **P0** | LLM 호출 트레이싱 | 모든 경쟁사가 보유. AI Observability의 테이블 스테이크 | 5/5 |
| **P0** | 토큰 + 비용 추적 | AI 운영팀 #1 관심사. FinOps 연계 | 4/5 |
| **P1** | Agent/Workflow Step 트레이싱 | Agentic AI 확산에 따라 필수화 | 5/5 |
| **P1** | 프리빌트 AI 대시보드 | 즉시 가치 제공. OTel GenAI 기반 | 5/5 |
| **P2** | 품질 평가 (Eval) | Datadog 선도. 차별화 요소 | 2/5 |

---

## 2. 설계: AITOP AI Observability 아키텍처

### 2.1 데이터 모델

```
┌──────────────────────────────────────────────────────────┐
│                    AI Trace (확장)                         │
│  기존 OTel Trace + LLM/Agent/Tool 전용 Span 추가          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [Workflow Span] ── 전체 AI 요청 (e.g. RAG query)        │
│    ├─ [Agent Span] ── Agent 판단/루프                     │
│    │    ├─ [Tool Span] ── tool_call (search, API 등)     │
│    │    └─ [LLM Span] ── LLM API 호출                    │
│    │         ├── model: "gpt-4o"                         │
│    │         ├── prompt_tokens: 1,250                    │
│    │         ├── completion_tokens: 380                  │
│    │         ├── total_tokens: 1,630                     │
│    │         ├── cost_usd: 0.0245                        │
│    │         ├── ttft_ms: 180                            │
│    │         ├── latency_ms: 1,250                       │
│    │         ├── prompt_text: "..." (옵션, 마스킹)        │
│    │         └── completion_text: "..." (옵션, 마스킹)    │
│    ├─ [Retrieval Span] ── Vector Search                  │
│    │    ├── collection: "documents_v3"                   │
│    │    ├── query_vector_dim: 768                        │
│    │    ├── top_k: 10                                    │
│    │    ├── results_count: 8                             │
│    │    └── latency_ms: 45                               │
│    └─ [Guardrail Span] ── 입출력 검증                     │
│         ├── action: "PASS" | "BLOCK"                     │
│         ├── violations: [...]                            │
│         └── latency_ms: 12                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 2.2 토큰 + 비용 모델

```
┌─────────────────────────────────────────┐
│           Token & Cost Tracking          │
├─────────────────────────────────────────┤
│ Per-Request:                             │
│   request_id, trace_id, service_name     │
│   model, provider (openai/anthropic/...) │
│   prompt_tokens, completion_tokens       │
│   cost_usd (자동 계산: model pricing)    │
│   latency_ms, ttft_ms                    │
│   status (success/error/timeout)         │
│                                          │
│ Aggregation:                             │
│   hourly/daily cost by model             │
│   hourly/daily cost by service           │
│   hourly/daily cost by project           │
│   budget alert threshold                 │
│   cost anomaly detection                 │
└─────────────────────────────────────────┘
```

**모델별 가격 테이블** (자동 비용 계산용):

| Provider | Model | Input $/1M tokens | Output $/1M tokens |
|----------|-------|-------------------|-------------------|
| OpenAI | gpt-4o | $2.50 | $10.00 |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 |
| Anthropic | claude-sonnet-4 | $3.00 | $15.00 |
| Anthropic | claude-haiku-4 | $0.25 | $1.25 |
| Local | llama3.2:3b | $0.00 | $0.00 |

### 2.3 품질 평가 (Eval) 모델

```
┌─────────────────────────────────────────┐
│          Quality Evaluation              │
├─────────────────────────────────────────┤
│ Per-Response Eval:                       │
│   eval_id, trace_id, request_id          │
│   evaluators: [                          │
│     { name: "relevance", score: 0.85 }   │
│     { name: "faithfulness", score: 0.92 }│
│     { name: "toxicity", score: 0.01 }    │
│     { name: "hallucination", score: 0.05}│
│   ]                                      │
│   human_feedback: "thumbs_up" | null     │
│                                          │
│ Aggregation:                             │
│   avg score by model/service/prompt ver  │
│   score trend over time                  │
│   regression detection (score drop)      │
│   A/B test between prompt versions       │
└─────────────────────────────────────────┘
```

### 2.4 AI 보안 모니터링

| 위협 | 탐지 방법 | 심각도 |
|------|----------|--------|
| Prompt Injection | 패턴 매칭 + Guardrail span 분석 | Critical |
| PII Leak (응답에 개인정보) | 정규식 + NER | High |
| Excessive Token Usage | 임계치 기반 이상 탐지 | Medium |
| Agent Loop (무한 루프) | Tool call 횟수 > N | High |
| Model Version Drift | 응답 품질 score 급락 | Medium |

### 2.5 프리빌트 AI 대시보드

3종 프리빌트 대시보드:

**1. AI Overview Dashboard**
- 전체 AI 서비스 수, 활성 모델 수, 일일 요청 수
- 총 토큰 사용량 / 비용 (일간/주간)
- P95 TTFT, 평균 TPS, 에러율
- 모델별 요청 분포 (pie)
- 비용 추이 (area)

**2. LLM Performance Dashboard**
- 모델별: Latency P50/P95, TTFT, Error Rate
- 서비스별: RPM, Token/Request, Cost/Request
- Agent Step 분석: 평균 Step 수, Tool Call 분포
- Retrieval 품질: Relevance Score 추이

**3. AI Cost & Governance Dashboard**
- 프로젝트별/팀별 비용 breakdown
- 모델별 비용 효율 (cost per quality score)
- Budget vs Actual 바 차트
- 보안 이벤트: Prompt Injection 탐지 건수
- Eval Score 추이 + Regression 알림

---

## 3. OTel GenAI Semantic Conventions 채택

### 3.1 OTel GenAI Span Attributes

[OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) 기반:

| Attribute | 설명 | 예시 |
|-----------|------|------|
| `gen_ai.system` | AI 제공자 | "openai", "anthropic" |
| `gen_ai.request.model` | 요청 모델 | "gpt-4o" |
| `gen_ai.request.max_tokens` | 최대 토큰 | 4096 |
| `gen_ai.request.temperature` | Temperature | 0.7 |
| `gen_ai.usage.input_tokens` | 입력 토큰 수 | 1250 |
| `gen_ai.usage.output_tokens` | 출력 토큰 수 | 380 |
| `gen_ai.response.finish_reason` | 완료 사유 | "stop", "length" |

### 3.2 수집 방법

| 방법 | 대상 | 구현 |
|------|------|------|
| **OTel SDK 자동 계측** | Python (openai, anthropic, langchain) | opentelemetry-instrumentation-openai 등 |
| **OpenLLMetry** | 다양한 LLM 프레임워크 | Traceloop SDK |
| **AITOP SDK** | 커스텀 LLM 호출 | AITOP Python/Java/Go SDK에 GenAI span helper |
| **Agent Heartbeat** | GPU/vLLM/inference 상태 | 기존 OS Collector 확장 |

---

## 4. AITOP 차별화 포인트 (경쟁사에 없는 것)

경쟁사를 단순 복제하지 않는다. AITOP 고유 강점을 AI Observability에 결합:

| AITOP 고유 | AI Observability 결합 |
|-----------|---------------------|
| 진단 항목 기반 판정 | AI ITEM: "LLM 비용 이상 급증", "Agent Loop", "RAG 품질 저하" → 자동 판정 + 근거 |
| 보고서 자동화 | AI 운영 보고서: 일일 비용/품질/보안 이슈 Canonical JSON 자동 생성 |
| 온프레미스/폐쇄망 | 로컬 LLM (Ollama) + 로컬 Eval + 프라이빗 데이터 — 클라우드 전송 없음 |
| Evidence 기반 | 모든 AI 진단 결과에 trace_id, span_id, prompt 근거 링크 |
| Rule + LLM 하이브리드 | 비용 임계치: Rule / 품질 분석: LLM — 재현성 + 깊이 동시 확보 |
