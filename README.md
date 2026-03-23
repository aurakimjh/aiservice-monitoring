# AITOP — AI Service Monitoring Platform

> **OpenTelemetry + AITOP Agent 기반 통합 AI 서비스 성능 모니터링 솔루션**
>
> **대상 독자**: SRE, Platform Engineer, MLOps Engineer, AI Engineer
> **기반 표준**: OpenTelemetry Specification v1.31 | OTel Collector v0.104+
> **최종 업데이트**: 2026-03-22 (Phase 16 Agent GA 완료)

---

## 개요

AI 에이전트 및 LLM 서비스의 복잡한 레이어(가드레일 → 에이전트 → 외부 API → 벡터 DB → LLM 추론)에 대한 **엔드-투-엔드 가시성**을 확보하고, TTFT·TPS·GPU VRAM 등 AI 특화 지표를 통해 성능 최적화 및 장애를 선제 방어하는 **상용 수준의 통합 모니터링 플랫폼**입니다.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **통합 모니터링 UI** | Next.js 기반 26개 화면 — APM + AI + 인프라 + 에이전트 관리를 단일 대시보드에서 통합 |
| **AITOP Agent** | Go 기반 경량 에이전트 — IT(OS/WEB/WAS/DB) + AI(GPU/LLM/VectorDB/Serving) 수집 |
| **분산 추적** | 사용자 요청이 모든 레이어를 통과하는 동안 Trace ID 연속성 보장 (W3C TraceContext) |
| **AI 특화 메트릭** | TTFT, TPS, ms/token, GPU VRAM 포화 예측, 가드레일 차단율 등 LLM 전용 지표 |
| **지능형 샘플링** | Head-based + Tail-based Sampling으로 저장 비용 80% 절감 |
| **Fleet 관리** | 에이전트 중앙 관리, OTA 업데이트, 원격 CLI, 수집 스케줄링 |
| **진단 보고서** | IT 55항목 + AI 31항목 = 86개 자동 진단 및 교차 분석 |
| **가드레일 가시성** | 차단율, 위반 유형, 레이턴시 기여도 실시간 측정 |
| **멀티테넌트** | 프로젝트 기반 리소스 격리, White-label, RBAC |
| **국제화** | 한국어/영어/일본어 3개 언어 지원 |

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AITOP Monitoring Platform                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─── Frontend (Next.js) ──────────────────────────────────────────┐   │
│  │  Dashboard · Service Map · XLog/HeatMap · AI Analytics          │   │
│  │  Fleet Console · Remote CLI · Diagnostics · Alert/Incident      │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                              │ REST API                                 │
│  ┌─── Collection Server ────┴──────────────────────────────────────┐   │
│  │  gRPC Receiver · Validation Gateway · Fleet Controller           │   │
│  │  PostgreSQL · S3/MinIO · Event Bus                               │   │
│  └──────────────┬─────────────────────────┬────────────────────────┘   │
│                  │ gRPC/HTTPS               │ Prometheus Remote Write   │
│  ┌─── AITOP Agent (Go) ──┐   ┌─── OTel Collector ─────────────────┐   │
│  │  OS · WEB · WAS · DB  │   │  Agent (DaemonSet)                  │   │
│  │  GPU · LLM · VectorDB │   │  Gateway (Deployment + HPA)         │   │
│  │  Serving · OTel        │   │  Tail Sampling · Transform · Export │   │
│  └────────────────────────┘   └─────────────────────────────────────┘   │
│                                            │                            │
│  ┌─── Storage Layer ──────────────────────┴────────────────────────┐   │
│  │  Prometheus (Metrics) · Tempo (Traces) · Loki (Logs)            │   │
│  │  S3/MinIO (Evidence) · PostgreSQL (State)                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 모니터링 대상 레이어

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: UI/App                                         │
│  FastAPI · Next.js · Flask · NeMo Guardrails            │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Agent                                          │
│  LangChain · LangGraph · LlamaIndex · External APIs     │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Model                                          │
│  vLLM · NVIDIA Triton · Ollama · TGI                    │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Data                                           │
│  Pinecone · Milvus · Qdrant · Chroma · Redis Cache      │
├─────────────────────────────────────────────────────────┤
│  Layer 5: Infra                                          │
│  Kubernetes · NVIDIA DCGM (GPU) · Docker                │
└─────────────────────────────────────────────────────────┘
```

---

## 프로젝트 구조

```
aiservice-monitoring/
│
├── DOCS/                                  # 설계 문서
│   ├── ARCHITECTURE.md                   # OTel + Agent 통합 아키텍처 설계
│   ├── METRICS_DESIGN.md                 # 지표 정의 및 수집 방안
│   ├── UI_DESIGN.md                      # 통합 모니터링 대시보드 UI 설계
│   ├── AGENT_DESIGN.md                   # AITOP Agent 상세 설계 (Go)
│   ├── XLOG_DASHBOARD_REDESIGN.md        # XLog/HeatMap 대시보드 상세 설계
│   ├── AI_SERVICE_FLOW.md                # AI 서비스 처리 흐름 (입문자용)
│   ├── LOCAL_SETUP.md                    # 로컬 개발 환경 구성 가이드
│   ├── TEST_GUIDE.md                     # 테스트 & 운영 검증 가이드
│   └── MANUAL_TESTING_GUIDE.md           # 수동 테스트 절차
│
├── agent/                                 # AITOP Agent (Go)
│   ├── cmd/
│   │   ├── aitop-agent/main.go           # 에이전트 바이너리 엔트리포인트
│   │   └── collection-server/main.go     # Collection Server 엔트리포인트
│   ├── internal/
│   │   ├── collector/
│   │   │   ├── it/                       # IT Collectors (OS/WEB/WAS/DB)
│   │   │   └── ai/                       # AI Collectors (GPU/LLM/VectorDB/Serving/OTel)
│   │   ├── core/                         # Collector Registry
│   │   ├── config/                       # 설정 관리자
│   │   ├── scheduler/                    # 수집 스케줄러
│   │   ├── health/                       # 자체 헬스 모니터
│   │   ├── privilege/                    # 권한 사전 검증
│   │   ├── sanitizer/                    # PII/API Key 마스킹
│   │   ├── buffer/                       # SQLite 로컬 버퍼 (오프라인 지원)
│   │   ├── shell/                        # 원격 CLI (PTY)
│   │   ├── statemachine/                 # 에이전트 상태 머신
│   │   ├── transport/                    # gRPC + HTTPS 전송
│   │   └── updater/                      # OTA 업데이트 관리자
│   ├── pkg/models/                       # 공유 데이터 모델
│   └── configs/agent.yaml                # 에이전트 설정 파일
│
├── frontend/                              # 통합 모니터링 UI (Next.js)
│   └── src/
│       ├── app/                          # 26개 라우트 (App Router)
│       │   ├── services/                 # 서비스 맵 + 서비스 상세
│       │   ├── traces/                   # XLog/HeatMap + 트레이스 워터폴
│       │   ├── logs/                     # 로그 탐색기
│       │   ├── metrics/                  # 메트릭 탐색기 (PromQL)
│       │   ├── ai/                       # AI 서비스 (LLM/GPU/RAG/Guardrail)
│       │   ├── agents/                   # Agent Fleet Console
│       │   ├── diagnostics/              # AITOP 진단 보고서
│       │   ├── alerts/                   # 알림 정책 + 인시던트 관리
│       │   ├── dashboards/               # 커스텀 대시보드 빌더
│       │   ├── notebooks/                # Investigation Notebook
│       │   ├── slo/                      # SLO 관리
│       │   ├── costs/                    # 비용 분석
│       │   ├── executive/                # Executive 대시보드
│       │   └── tenants/                  # 멀티테넌트 관리
│       ├── components/                   # UI/차트/모니터링/레이아웃 컴포넌트
│       ├── stores/                       # Zustand 상태 관리
│       ├── hooks/                        # useFleet, useI18n 등
│       └── lib/                          # 유틸리티, i18n, API 클라이언트
│
├── collector/                             # OpenTelemetry Collector 설정
│   ├── config/
│   │   ├── otelcol-agent.yaml            # Agent Collector (DaemonSet)
│   │   └── otelcol-gateway.yaml          # Gateway Collector (Tail Sampling)
│   └── pipelines/                        # 트레이스/메트릭 파이프라인 문서
│
├── sdk-instrumentation/                   # 언어별 계측 코드
│   ├── python/                           # FastAPI, vLLM, LangChain, Guardrail 등
│   ├── nodejs/                           # Next.js, SSE 스트리밍, Web Vitals
│   └── go/                              # Go 서비스 OTel 초기화
│
├── dashboards/                            # 대시보드
│   ├── grafana/                          # Grafana JSON (5개)
│   └── xlog-heatmap/                     # Canvas 기반 XLog/HeatMap
│
├── demo/rag-service/                      # RAG 데모 서비스 (FastAPI)
│
├── infra/                                 # 인프라 설정
│   ├── kubernetes/                       # K8s 매니페스트 (DaemonSet, Deployment, RBAC)
│   └── docker/                           # Docker Compose 로컬 개발 스택
│
├── helm/aiservice-monitoring/             # Helm Chart (dev/prod)
├── scripts/                               # 검증/부하 테스트 스크립트
└── .github/workflows/                     # CI/CD (lint, validate, test-alerts)
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

## 빠른 시작

### 사전 요구사항

- Docker & Docker Compose
- Go 1.25+ (에이전트 빌드)
- Node.js 20+ (프론트엔드)
- Python 3.11+ (SDK 계측)

### 1. 모니터링 인프라 실행

```bash
git clone https://github.com/aura-kimjh/aiservice-monitoring.git
cd aiservice-monitoring

# 개발/테스트 — 전체 스택 (Grafana/Tempo/Loki 포함)
docker compose -f infra/docker/docker-compose.yaml up -d

# 상용 배포 — AGPL-free 스택 (Jaeger/Prometheus/PostgreSQL)
docker compose -f infra/docker/docker-compose.commercial.yaml up -d
```

> **라이선스 안내**: 상용 배포 시 AGPL 컴포넌트(Grafana/Tempo/Loki/MinIO)를 포함하지 않는
> `docker-compose.commercial.yaml`을 사용하세요. 상세: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
# 데모 계정: admin@aitop.io / demo (Admin 역할)
```

### 3. AITOP Agent 빌드 및 실행

```bash
cd agent
go build -o aitop-agent ./cmd/aitop-agent
./aitop-agent --config configs/agent.yaml
```

### 4. Python 서비스 계측

```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation-fastapi

opentelemetry-instrument \
  --traces_exporter otlp \
  --metrics_exporter otlp \
  --exporter_otlp_endpoint http://localhost:4317 \
  --service_name my-ai-service \
  uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 개발 진행 현황

```
Phase 1~6:   OTel 인프라 + SDK + 대시보드 + Helm + CI/CD    ████████████ 100% ✅
Phase 10~14: 상용 솔루션 UI (26개 화면)                       ████████████ 100% ✅
Phase 15~16: AITOP Agent (IT/AI Collector + Fleet + CLI)     ████████████ 100% ✅
Phase 17:    UI 통합 테스트 (에이전트 실데이터 연동)              ░░░░░░░░░░░░   0% 📋
```

상세 현황은 [WORK_STATUS.md](WORK_STATUS.md) 참조.

---

## 문서

| 문서 | 설명 | 상태 |
|------|------|------|
| [ARCHITECTURE.md](DOCS/ARCHITECTURE.md) | OTel + Agent 통합 아키텍처, Context Propagation, HA 패턴 | ✅ |
| [METRICS_DESIGN.md](DOCS/METRICS_DESIGN.md) | 레이어별 지표 정의, 수식, Agent 수집 메트릭 매핑 | ✅ |
| [UI_DESIGN.md](DOCS/UI_DESIGN.md) | 통합 모니터링 대시보드 UI/UX 설계 (26개 화면) | ✅ |
| [AGENT_DESIGN.md](DOCS/AGENT_DESIGN.md) | AITOP Agent 상세 설계 — Collector, Fleet, CLI, OTA | ✅ |
| [AI_SERVICE_FLOW.md](DOCS/AI_SERVICE_FLOW.md) | AI 서비스 처리 흐름 상세 설명 (입문자용) | ✅ |
| [XLOG_DASHBOARD_REDESIGN.md](DOCS/XLOG_DASHBOARD_REDESIGN.md) | XLog/HeatMap 통합 대시보드 상세 설계 | ✅ |
| [LOCAL_SETUP.md](DOCS/LOCAL_SETUP.md) | 로컬 개발 환경 구성 가이드 | ✅ |
| [TEST_GUIDE.md](DOCS/TEST_GUIDE.md) | 테스트 & 운영 검증 가이드 (9단계) | ✅ |
| [MANUAL_TESTING_GUIDE.md](DOCS/MANUAL_TESTING_GUIDE.md) | 수동 테스트 절차 | ✅ |
| [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) | 솔루션 방향성 — 경쟁 분석, 완성도 평가, 로드맵 | ✅ |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, ECharts 6, D3.js 7 |
| **Agent** | Go 1.25, gRPC, SQLite, mTLS |
| **Backend** | OTel Collector, Prometheus, Tempo, Loki, PostgreSQL |
| **SDK** | Python (FastAPI, vLLM, LangChain), Node.js, Go |
| **Infra** | Docker Compose, Kubernetes, Helm, GitHub Actions |
| **보안** | RBAC, JWT, mTLS, PII Sanitizer, 코드 서명 |

---

## 기여 가이드

```bash
# 브랜치 전략
git checkout -b feature/add-triton-instrumentation
git checkout -b fix/guardrail-latency-metric
git checkout -b docs/update-architecture

# 커밋 컨벤션
git commit -m "feat(agent): add Oracle DB collector"
git commit -m "fix(frontend): correct GPU VRAM gauge rendering"
git commit -m "docs: update architecture with fleet management"
```

---

## 라이선스

Apache License 2.0

---

*Maintained by Aura Kim (aura.kimjh@gmail.com)*
