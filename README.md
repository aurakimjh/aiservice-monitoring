# AI Service Monitoring — OpenTelemetry 기반 성능 모니터링 솔루션

> **대상 독자**: SRE, Platform Engineer, MLOps Engineer
> **기반 표준**: OpenTelemetry Specification v1.31 | OTel Collector v0.104+

---

## 개요

AI 에이전트 및 LLM 서비스의 복잡한 레이어(가드레일 → 에이전트 → 외부 API → 벡터 DB → LLM 추론)에 대한 **엔드-투-엔드 가시성**을 확보하고, TTFT·TPS·GPU VRAM 등 AI 특화 지표를 통해 성능 최적화 및 장애를 선제 방어하는 통합 모니터링 시스템입니다.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **분산 추적 (Distributed Tracing)** | 사용자 요청이 모든 레이어를 통과하는 동안 Trace ID 연속성 보장 |
| **AI 특화 메트릭** | TTFT, TPS, ms/token, GPU VRAM 포화 예측 등 LLM 전용 지표 |
| **지능형 샘플링** | Head-based + Tail-based Sampling으로 비용 80% 절감 |
| **가드레일 가시성** | 차단율, 위반 유형, 레이턴시 기여도 실시간 측정 |
| **외부 API 추적** | Context Propagation으로 Serper·커스텀 도구까지 Trace 연속 |

---

## 프로젝트 구조

```
aiservice-monitoring/
│
├── DOCS/                                  # 설계 문서
│   ├── METRICS_DESIGN.md                 # 지표 정의 및 수집 방안 (현재 문서)
│   └── ARCHITECTURE.md                   # OTel 아키텍처 설계 (TODO)
│
├── collector/                             # OpenTelemetry Collector 설정
│   ├── config/
│   │   ├── otelcol-config.yaml           # 메인 Collector 설정
│   │   ├── head-sampling.yaml            # Head-based Sampling 정책
│   │   └── tail-sampling.yaml            # Tail-based Sampling 정책
│   └── pipelines/
│       ├── traces-pipeline.yaml          # 트레이스 파이프라인
│       └── metrics-pipeline.yaml        # 메트릭 파이프라인
│
├── sdk-instrumentation/                   # 언어별 계측 코드
│   ├── python/
│   │   ├── guardrails/                   # NeMo / Guardrails AI 계측
│   │   │   └── nemo_instrumentation.py
│   │   ├── agents/                       # LangChain / LangGraph 계측
│   │   │   ├── langchain_tracer.py
│   │   │   ├── external_api_tracer.py
│   │   │   └── fastapi_streaming.py
│   │   ├── llm/                          # vLLM / Embedding 계측
│   │   │   ├── vllm_instrumentation.py
│   │   │   └── embedding_instrumentation.py
│   │   └── vector_db/                   # 벡터 DB 계측
│   │       └── vectordb_instrumentation.py
│   ├── nodejs/                           # Next.js / Frontend 계측
│   │   └── frontend-streaming.js
│   └── go/                              # Go 서비스 계측 (예: Ollama, Weaviate)
│
├── dashboards/                           # Grafana 대시보드
│   └── grafana/
│       ├── ai-service-overview.json      # 전체 서비스 현황
│       ├── llm-performance.json          # LLM 성능 (TTFT/TPS)
│       ├── guardrail-analysis.json       # 가드레일 분석
│       └── gpu-correlation.json         # GPU-LLM 상관관계
│
├── sampling/                             # 샘플링 전략
│   ├── head-based/
│   │   └── sampler-config.yaml
│   └── tail-based/
│       └── tail-sampler-config.yaml
│
├── infra/                               # 인프라 설정
│   ├── kubernetes/
│   │   ├── otelcol-deployment.yaml      # OTel Collector K8s 배포
│   │   ├── dcgm-exporter.yaml          # NVIDIA GPU 메트릭 수집
│   │   └── prometheus-servicemonitor.yaml
│   └── docker/
│       └── docker-compose.yaml          # 로컬 개발 환경
│
└── scripts/                             # 유틸리티 스크립트
    ├── validate-traces.sh               # Trace 연속성 검증
    └── benchmark-sampling.py            # 샘플링 비율 시뮬레이션
```

---

## 모니터링 대상 레이어

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: UI/App                                         │
│  FastAPI · Next.js · Flask · NeMo Guardrails            │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Agent                                          │
│  LangChain · LangGraph · LlamaIndex · External APIs     │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Model                                          │
│  vLLM · NVIDIA Triton · HuggingFace Embedding           │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Data                                           │
│  Pinecone · Milvus · Qdrant · Redis Semantic Cache      │
├─────────────────────────────────────────────────────────┤
│  Layer 5: Infra                                          │
│  Kubernetes · NVIDIA DCGM (GPU)                         │
└─────────────────────────────────────────────────────────┘
```

---

## 핵심 SLO (Service Level Objectives)

| 지표 | SLO | 측정 방법 |
|------|-----|---------|
| E2E 요청 레이턴시 | P95 < 5,000ms | `http.server.request.duration` |
| TTFT (첫 토큰 시간) | P95 < 2,000ms | `llm.time_to_first_token` |
| TPS (토큰/초) | P50 > 30 tok/s | `llm.tokens_per_second` |
| 가드레일 레이턴시 | P99 < 800ms | `guardrail.validation.duration` |
| GPU VRAM 사용률 | < 90% | `gpu.vram.used_bytes` |
| 벡터 검색 레이턴시 | P99 < 500ms | `vectordb.search.duration` |
| 에러율 | < 0.5% | `http.server.request.duration{status=5xx}` |

---

## 빠른 시작 (로컬 개발 환경)

### 사전 요구사항

- Docker & Docker Compose
- Python 3.11+
- Node.js 20+

### 1. 환경 설정

```bash
# 저장소 클론
git clone https://github.com/aura-kimjh/aiservice-monitoring.git
cd aiservice-monitoring

# Python 의존성 설치
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation-fastapi

# Node.js 의존성 설치
cd sdk-instrumentation/nodejs
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

### 2. OTel Collector 실행

```bash
# Docker Compose로 Collector + Prometheus + Grafana + Jaeger 스택 실행
docker compose -f infra/docker/docker-compose.yaml up -d

# 확인
# Grafana:  http://localhost:3000  (admin/admin)
# Jaeger:   http://localhost:16686
# Prometheus: http://localhost:9090
# OTel Collector health: http://localhost:13133
```

### 3. Python 서비스에 계측 적용

```bash
# Auto-instrumentation 적용 (FastAPI 예시)
opentelemetry-instrument \
  --traces_exporter otlp \
  --metrics_exporter otlp \
  --exporter_otlp_endpoint http://localhost:4317 \
  --service_name my-ai-service \
  uvicorn main:app --host 0.0.0.0 --port 8000
```

### 4. 가드레일 수동 계측 적용

```python
from sdk_instrumentation.python.guardrails.nemo_instrumentation import instrument_guardrail

@instrument_guardrail(policy_name="input_safety")
async def validate_input(user_input: str) -> dict:
    # 기존 가드레일 로직
    return await nemo_rails.generate(user_input)
```

---

## 문서

| 문서 | 설명 | 상태 |
|------|------|------|
| [METRICS_DESIGN.md](DOCS/METRICS_DESIGN.md) | 레이어별 지표 정의, 수식, 계측 코드 | ✅ 완료 |
| [ARCHITECTURE.md](DOCS/ARCHITECTURE.md) | OTel Collector 아키텍처, Context Propagation | 🔄 작성 중 |

---

## 기여 가이드

```bash
# 브랜치 전략
git checkout -b feature/add-triton-instrumentation
git checkout -b fix/guardrail-latency-metric
git checkout -b docs/update-architecture

# 커밋 컨벤션
git commit -m "feat(python): add vLLM TTFT instrumentation"
git commit -m "fix(collector): correct tail sampling decision_wait"
git commit -m "docs: add GPU correlation analysis guide"
```

---

## 라이선스

Apache License 2.0

---

*Maintained by Aura Kim (aura.kimjh@gmail.com)*
