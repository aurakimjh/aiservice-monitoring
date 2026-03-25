# AITOP — AI Service Monitoring Platform

> **OpenTelemetry + AITOP Agent 기반 통합 AI 서비스 성능 모니터링 솔루션**
>
> **대상 독자**: SRE, Platform Engineer, MLOps Engineer, AI Engineer
> **기반 표준**: OpenTelemetry Specification v1.31 | OTel Collector v0.104+
> **최종 업데이트**: 2026-03-25 (Phase 1-32 전체 완료 — GPU 멀티벤더 지원, AGPL-free 인프라 전환)

---

## 개요

AI 에이전트 및 LLM 서비스의 복잡한 레이어(가드레일 → 에이전트 → 외부 API → 벡터 DB → LLM 추론)에 대한 **엔드-투-엔드 가시성**을 확보하고, TTFT·TPS·GPU VRAM 등 AI 특화 지표를 통해 성능 최적화 및 장애를 선제 방어하는 **상용 수준의 통합 모니터링 플랫폼**입니다.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **통합 모니터링 UI** | Next.js 기반 44개 화면 — APM + AI + 인프라 + 에이전트 + 프로파일링 + 토폴로지를 단일 대시보드에서 통합 |
| **AITOP Agent** | Go 기반 경량 에이전트 — 12개 Collector (OS/WEB/WAS/DB/GPU/LLM/VectorDB/Serving/OTel/Cache/MQ/Profiling) |
| **AI Copilot** | 자연어 → PromQL 변환 (NL→PromQL), AI 기반 장애 분석 및 쿼리 자동 생성 |
| **Continuous Profiling** | FlameGraph 기반 CPU/메모리/Lock 프로파일링 — Go/Java/.NET 지원 |
| **Topology Auto-Discovery** | D3.js 기반 네트워크 토폴로지 자동 탐지 — 프로토콜 감지 및 의존성 시각화 |
| **분산 추적** | 사용자 요청이 모든 레이어를 통과하는 동안 Trace ID 연속성 보장 (W3C TraceContext) |
| **AI 특화 메트릭** | TTFT, TPS, ms/token, GPU VRAM 포화 예측, 가드레일 차단율, Fine-tuning 학습 모니터링 |
| **Multi-Cloud 모니터링** | AWS CloudWatch, GCP Monitoring, Azure Monitor 통합 — 비용 최적화 포함 |
| **Data Pipeline 모니터링** | Airflow, Prefect, Dagster 파이프라인 실행 상태 및 성능 추적 |
| **Business KPI** | 비즈니스 메트릭과 기술 메트릭 상관 분석 — 매출, 전환율, SLA 대시보드 |
| **Marketplace** | 대시보드 템플릿, 알림 정책, 커스텀 Collector 공유 마켓플레이스 |
| **Mobile Dashboard** | 반응형 모바일 대시보드 — 주요 지표 실시간 확인 및 알림 수신 |
| **SSO 인증** | OIDC/SAML 지원 — Okta, Azure AD, Google Workspace 통합 |
| **Terraform Provider** | IaC 기반 모니터링 설정 — 5개 리소스, 3개 데이터소스 |
| **지능형 샘플링** | Head-based + Tail-based Sampling으로 저장 비용 80% 절감 |
| **Fleet 관리** | 에이전트 중앙 관리, 서버 그룹, OTA 업데이트, 원격 CLI, 수집 스케줄링 |
| **이상 탐지** | 자동 이상 탐지 + 합성 모니터링(Synthetic Monitoring) + 정기 보고서 |
| **진단 보고서** | IT 55항목 + AI 31항목 = 86개 자동 진단 및 교차 분석 |
| **가드레일 가시성** | 차단율, 위반 유형, 레이턴시 기여도 실시간 측정 |
| **미들웨어 모니터링** | Redis/Memcached 캐시 + RabbitMQ/Kafka 메시지 큐 모니터링 |
| **멀티테넌트** | 프로젝트 기반 리소스 격리, White-label, RBAC |
| **국제화** | 한국어/영어/일본어 3개 언어 지원 |

---

## 아키텍처

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         AITOP Monitoring Platform                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─── Frontend (Next.js) ───────────────────────────────────────────────┐   │
│  │  Dashboard · Service Map · XLog/HeatMap · AI Analytics · Copilot     │   │
│  │  FlameGraph(Profiling) · Topology Map · Cloud · Pipelines · Mobile   │   │
│  │  Fleet Console · Remote CLI · Diagnostics · Alert/Incident           │   │
│  │  Business KPI · Marketplace · Training Monitor · Anomaly Detection   │   │
│  └──────────────────────────┬───────────────────────────────────────────┘   │
│                              │ REST API                                      │
│  ┌─── Collection Server ────┴───────────────────────────────────────────┐   │
│  │  gRPC Receiver · Validation Gateway · Fleet Controller                │   │
│  │  SSO (OIDC/SAML) · Copilot Engine (NL→PromQL) · Discovery Scanner    │   │
│  │  PostgreSQL · LocalStorage/S3 · Event Bus                              │   │
│  └───────────┬──────────────────────────────┬───────────────────────────┘   │
│               │ gRPC/HTTPS                    │ Prometheus Remote Write      │
│  ┌─── AITOP Agent (Go) ──────┐   ┌─── OTel Collector ──────────────────┐   │
│  │  OS · WEB · WAS · DB      │   │  Agent (DaemonSet)                   │   │
│  │  GPU · LLM · VectorDB     │   │  Gateway (Deployment + HPA)          │   │
│  │  Serving · OTel · Cache   │   │  Tail Sampling · Transform · Export  │   │
│  │  MQ · Profiling            │   │                                      │   │
│  │  Network Discovery         │   │                                      │   │
│  └────────────────────────────┘   └──────────────────────────────────────┘   │
│                                              │                               │
│  ┌─── External Integrations ────────────────┴───────────────────────────┐   │
│  │  AWS CloudWatch · GCP Monitoring · Azure Monitor                      │   │
│  │  Airflow · Prefect · Dagster (Data Pipelines)                         │   │
│  │  Okta · Azure AD · Google Workspace (SSO)                             │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─── Storage Layer ────────────────────────────────────────────────────┐   │
│  │  Prometheus (Metrics) · Jaeger (Traces)                               │   │
│  │  LocalStorage/S3 (Evidence) · PostgreSQL (State) · Profile Store      │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─── Terraform Provider ───────────────────────────────────────────────┐   │
│  │  Resources: alert_policy, dashboard, slo, notification_channel,       │   │
│  │             agent_group                                                │   │
│  │  DataSources: agents, projects, services                              │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
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
│  vLLM · NVIDIA Triton · Ollama · TGI · Fine-tuning     │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Data                                           │
│  Pinecone · Milvus · Qdrant · Chroma · Redis Cache      │
│  Airflow · Prefect · Dagster (Data Pipelines)            │
├─────────────────────────────────────────────────────────┤
│  Layer 5: Middleware                                     │
│  Redis · Memcached (Cache) · RabbitMQ · Kafka (MQ)      │
├─────────────────────────────────────────────────────────┤
│  Layer 6: Infra                                          │
│  Kubernetes · NVIDIA DCGM (GPU) · Docker                │
│  AWS · GCP · Azure (Multi-Cloud)                         │
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
│   ├── JAVA_DOTNET_SDK_DESIGN.md         # Java/.NET SDK 및 메소드 프로파일링 설계
│   ├── E2E_REDESIGN.md                   # E2E 재설계 문서
│   ├── LOCAL_SETUP.md                    # 로컬 개발 환경 구성 가이드
│   ├── TEST_GUIDE.md                     # 통합 테스트 전략 (매뉴얼 + AI 교차검증)
│   ├── MANUAL_TESTING_GUIDE.md           # 수동 테스트 절차
│   └── SOLUTION_STRATEGY.md              # 솔루션 방향성 — 경쟁 분석, 완성도 평가, 로드맵
│
├── agent/                                 # AITOP Agent (Go)
│   ├── cmd/
│   │   ├── aitop-agent/main.go           # 에이전트 바이너리 엔트리포인트
│   │   └── collection-server/main.go     # Collection Server 엔트리포인트
│   ├── internal/
│   │   ├── collector/
│   │   │   ├── it/                       # IT Collectors (OS/WEB/WAS/DB)
│   │   │   ├── ai/                       # AI Collectors (GPU/LLM/VectorDB/Serving/OTel)
│   │   │   ├── os/                       # OS 메트릭 수집 (CPU/Memory/Disk/Network)
│   │   │   ├── web/                      # WEB 서버 모니터링 (Nginx/Apache)
│   │   │   ├── was/                      # WAS 모니터링 (Tomcat/JBoss)
│   │   │   ├── db/                       # DB 모니터링 (PostgreSQL/MySQL/Oracle)
│   │   │   ├── cache/                    # 캐시 모니터링 (Redis/Memcached)
│   │   │   ├── mq/                       # 메시지 큐 모니터링 (RabbitMQ/Kafka)
│   │   │   └── profiling/               # Continuous Profiling (FlameGraph)
│   │   ├── core/                         # Collector Registry
│   │   ├── config/                       # 설정 관리자 + 중앙 설정
│   │   ├── discovery/                    # 네트워크 토폴로지 자동 탐지 (프로토콜 감지)
│   │   ├── sso/                          # SSO 인증 (OIDC/SAML — Okta, Azure AD, Google)
│   │   ├── auth/                         # 인증/인가
│   │   ├── scheduler/                    # 수집 스케줄러
│   │   ├── health/                       # 자체 헬스 모니터
│   │   ├── privilege/                    # 권한 사전 검증
│   │   ├── sanitizer/                    # PII/API Key 마스킹
│   │   ├── buffer/                       # SQLite 로컬 버퍼 (오프라인 지원)
│   │   ├── shell/                        # 원격 CLI (PTY)
│   │   ├── statemachine/                 # 에이전트 상태 머신
│   │   ├── transport/                    # gRPC + HTTPS 전송
│   │   ├── updater/                      # OTA 업데이트 관리자
│   │   ├── database/                     # 내부 DB 관리
│   │   ├── eventbus/                     # 이벤트 버스
│   │   ├── lite/                         # Lite 모드 (경량 배포)
│   │   ├── output/                       # 출력 핸들러
│   │   ├── storage/                      # 스토리지 관리
│   │   ├── validation/                   # 데이터 검증
│   │   └── ws/                           # WebSocket 핸들러
│   ├── pkg/models/                       # 공유 데이터 모델
│   └── configs/agent.yaml                # 에이전트 설정 파일
│
├── frontend/                              # 통합 모니터링 UI (Next.js)
│   └── src/
│       ├── app/                          # 44개 라우트 (App Router)
│       │   ├── services/                 # 서비스 맵 + 서비스 상세
│       │   ├── traces/                   # XLog/HeatMap + 트레이스 워터폴
│       │   ├── logs/                     # 로그 탐색기
│       │   ├── metrics/                  # 메트릭 탐색기 (PromQL)
│       │   ├── ai/                       # AI 서비스 (LLM/GPU/RAG/Guardrail/Training/Evaluation/Prompts)
│       │   ├── profiling/                # Continuous Profiling — FlameGraph 뷰어
│       │   ├── copilot/                  # AI Copilot — NL→PromQL 변환
│       │   ├── topology/                 # 네트워크 토폴로지 자동 탐지 (D3.js)
│       │   ├── cloud/                    # Multi-Cloud 모니터링 (AWS/GCP/Azure)
│       │   ├── pipelines/                # Data Pipeline 모니터링 (Airflow/Prefect/Dagster)
│       │   ├── business/                 # Business KPI 대시보드
│       │   ├── marketplace/              # 대시보드/알림 템플릿 마켓플레이스
│       │   ├── mobile/                   # 모바일 반응형 대시보드
│       │   ├── anomalies/                # 이상 탐지 대시보드
│       │   ├── infra/                    # 인프라 모니터링 (호스트/캐시/큐)
│       │   ├── agents/                   # Agent Fleet Console + 서버 그룹
│       │   ├── diagnostics/              # AITOP 진단 보고서
│       │   ├── alerts/                   # 알림 정책 + 인시던트 관리
│       │   ├── dashboards/               # 커스텀 대시보드 빌더
│       │   ├── notebooks/                # Investigation Notebook
│       │   ├── slo/                      # SLO 관리
│       │   ├── costs/                    # 비용 분석
│       │   ├── executive/                # Executive 대시보드
│       │   ├── projects/                 # 프로젝트 관리
│       │   ├── settings/                 # 시스템 설정
│       │   ├── login/                    # 로그인 (SSO 포함)
│       │   └── tenants/                  # 멀티테넌트 관리
│       ├── components/                   # UI/차트/모니터링/레이아웃 컴포넌트
│       ├── stores/                       # Zustand 상태 관리
│       ├── hooks/                        # useFleet, useI18n 등
│       └── lib/                          # 유틸리티, i18n, API 클라이언트, copilot-engine
│
├── terraform-provider-aitop/              # Terraform Provider (IaC)
│   ├── main.go                           # Provider 엔트리포인트
│   ├── internal/
│   │   ├── provider/                    # Provider 설정 및 초기화
│   │   ├── resources/                   # 5개 리소스 (alert_policy, dashboard, slo,
│   │   │                                #   notification_channel, agent_group)
│   │   ├── datasources/                 # 3개 데이터소스 (agents, projects, services)
│   │   └── client/                      # API 클라이언트
│   └── examples/                        # Terraform 사용 예제
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
│   ├── go/                              # Go 서비스 OTel 초기화
│   ├── java/                            # Java SDK (Spring Boot, JVM Profiling)
│   └── dotnet/                          # .NET SDK (ASP.NET Core, CLR Profiling)
│
├── dashboards/                            # 대시보드
│   ├── grafana/                          # Grafana JSON (레거시, 개발 참조용)
│   └── xlog-heatmap/                     # Canvas 기반 XLog/HeatMap
│
├── demo/rag-service/                      # RAG 데모 서비스 (FastAPI)
│
├── infra/                                 # 인프라 설정
│   ├── kubernetes/                       # K8s 매니페스트 (DaemonSet, Deployment, RBAC)
│   └── docker/                           # Docker Compose 로컬 개발 스택
│
├── helm/aiservice-monitoring/             # Helm Chart (dev/prod)
├── sampling/                              # 샘플링 전략 설정
├── locust/                                # 부하 테스트 (Locust)
├── reports/                               # 진단/성능 보고서 템플릿
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
- Terraform 1.5+ (IaC 설정, 선택사항)

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

## Terraform Provider

AITOP Terraform Provider를 사용하여 모니터링 리소스를 코드로 관리할 수 있습니다.

### 설치

```hcl
terraform {
  required_providers {
    aitop = {
      source  = "aura-kimjh/aitop"
      version = "~> 1.0"
    }
  }
}

provider "aitop" {
  endpoint = "https://aitop.example.com/api"
  api_key  = var.aitop_api_key
}
```

### 지원 리소스

| 유형 | 리소스/데이터소스 | 설명 |
|------|-----------------|------|
| **Resource** | `aitop_alert_policy` | 알림 정책 생성/관리 |
| **Resource** | `aitop_dashboard` | 대시보드 생성/관리 |
| **Resource** | `aitop_slo` | SLO 목표 생성/관리 |
| **Resource** | `aitop_notification_channel` | 알림 채널 (Slack, PagerDuty 등) |
| **Resource** | `aitop_agent_group` | 에이전트 서버 그룹 관리 |
| **DataSource** | `aitop_agents` | 에이전트 목록 조회 |
| **DataSource** | `aitop_projects` | 프로젝트 목록 조회 |
| **DataSource** | `aitop_services` | 서비스 목록 조회 |

### 사용 예제

```hcl
resource "aitop_alert_policy" "high_latency" {
  name        = "AI Service High Latency"
  description = "TTFT P95 > 3초 시 알림"
  severity    = "critical"

  condition {
    metric    = "llm.time_to_first_token"
    operator  = ">"
    threshold = 3000
    duration  = "5m"
  }

  notification_channels = [aitop_notification_channel.slack.id]
}

resource "aitop_slo" "availability" {
  name       = "AI Service Availability"
  target     = 99.9
  metric     = "http.server.request.duration"
  window     = "30d"
}
```

더 많은 예제는 [`terraform-provider-aitop/examples/`](terraform-provider-aitop/examples/)를 참조하세요.

---

## SSO 설정

AITOP는 OIDC 및 SAML 프로토콜을 통한 SSO(Single Sign-On)를 지원합니다.

### 지원 IdP (Identity Provider)

| IdP | 프로토콜 | 설정 파일 |
|-----|---------|---------|
| **Okta** | OIDC / SAML | `agent/internal/sso/oidc.go` |
| **Azure AD** | OIDC / SAML | `agent/internal/sso/saml.go` |
| **Google Workspace** | OIDC | `agent/internal/sso/oidc.go` |

### OIDC 설정 예시

```yaml
# agent/configs/agent.yaml
sso:
  enabled: true
  provider: oidc
  oidc:
    issuer_url: "https://your-org.okta.com/oauth2/default"
    client_id: "your-client-id"
    client_secret: "${AITOP_OIDC_CLIENT_SECRET}"
    redirect_url: "https://aitop.example.com/auth/callback"
    scopes: ["openid", "profile", "email", "groups"]
```

### SAML 설정 예시

```yaml
sso:
  enabled: true
  provider: saml
  saml:
    idp_metadata_url: "https://login.microsoftonline.com/{tenant}/federationmetadata/2007-06/federationmetadata.xml"
    sp_entity_id: "https://aitop.example.com"
    acs_url: "https://aitop.example.com/auth/saml/acs"
    attribute_mapping:
      email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
      name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname"
      groups: "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
```

---

## 개발 진행 현황

```
Phase 1~6:   OTel 인프라 + SDK + 대시보드 + Helm + CI/CD           ████████████ 100% ✅
Phase 10~14: 상용 솔루션 UI (26개 화면 기반)                         ████████████ 100% ✅
Phase 15~16: AITOP Agent (IT/AI Collector + Fleet + CLI)           ████████████ 100% ✅
Phase 17~18: UI 통합 테스트 + E2E 시나리오                            ████████████ 100% ✅
Phase 19:    보안 강화 + RBAC + 감사 로그                             ████████████ 100% ✅
Phase 20:    운영 고도화 (이상 탐지 · 보고서 · 합성 모니터링)            ████████████ 100% ✅
Phase 21:    Continuous Profiling + Terraform Provider + SSO       ████████████ 100% ✅
Phase 22:    AI Copilot + Topology Auto-Discovery + Fine-tuning    ████████████ 100% ✅
Phase 23:    Multi-Cloud + Data Pipeline + Business KPI + Mobile   ████████████ 100% ✅
Phase 24:    Java/.NET SDK + 메소드 프로파일링                        ████████████ 100% ✅
Phase 25:    서버 그룹 + SDK 자동 인식 + 중앙 설정                     ████████████ 100% ✅
Phase 26:    미들웨어 런타임 + Redis/Cache + 메시지 큐                  ████████████ 100% ✅
Phase 27~30: 고급 기능 완성 + Enterprise/Lite + AGPL-free 전환        ████████████ 100% ✅
Phase 31:    AGPL-free 인프라 안정화 (StorageBackend/Jaeger)          ████████████ 100% ✅
Phase 32:    GPU 멀티벤더 지원 (NVIDIA/AMD/Intel/Apple/Cloud)         ████████████ 100% ✅
─────────────────────────────────────────────────────────────────────────────────────
잔여:        인프라 Phase 7'/8'/9' (OTel Infra 고도화)               ░░░░░░░░░░░░   0% 📋
```

상세 현황은 [WORK_STATUS.md](WORK_STATUS.md) 참조.

---

## 문서

| 문서 | 설명 | 상태 |
|------|------|------|
| [ARCHITECTURE.md](DOCS/ARCHITECTURE.md) | OTel + Agent 통합 아키텍처, Context Propagation, HA 패턴 | ✅ |
| [METRICS_DESIGN.md](DOCS/METRICS_DESIGN.md) | 레이어별 지표 정의, 수식, Agent 수집 메트릭 매핑 | ✅ |
| [UI_DESIGN.md](DOCS/UI_DESIGN.md) | 통합 모니터링 대시보드 UI/UX 설계 (44개 화면) | ✅ |
| [AGENT_DESIGN.md](DOCS/AGENT_DESIGN.md) | AITOP Agent 상세 설계 — Collector, Fleet, CLI, OTA | ✅ |
| [AI_SERVICE_FLOW.md](DOCS/AI_SERVICE_FLOW.md) | AI 서비스 처리 흐름 상세 설명 (입문자용) | ✅ |
| [XLOG_DASHBOARD_REDESIGN.md](DOCS/XLOG_DASHBOARD_REDESIGN.md) | XLog/HeatMap 통합 대시보드 상세 설계 | ✅ |
| [JAVA_DOTNET_SDK_DESIGN.md](DOCS/JAVA_DOTNET_SDK_DESIGN.md) | Java/.NET SDK 및 메소드 프로파일링 설계 (Phase 24) | ✅ |
| [E2E_REDESIGN.md](DOCS/E2E_REDESIGN.md) | E2E 테스트 시나리오 재설계 | ✅ |
| [LOCAL_SETUP.md](DOCS/LOCAL_SETUP.md) | 로컬 개발 환경 구성 가이드 | ✅ |
| [TEST_GUIDE.md](DOCS/TEST_GUIDE.md) | 통합 테스트 전략 (매뉴얼 + AI 교차검증) | ✅ |
| [MANUAL_TESTING_GUIDE.md](DOCS/MANUAL_TESTING_GUIDE.md) | 수동 테스트 절차 | ✅ |
| [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) | 솔루션 방향성 — 경쟁 분석, 완성도 평가, 로드맵 | ✅ |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, ECharts 6, D3.js 7 |
| **Agent** | Go 1.25, gRPC, SQLite, mTLS, Network Scanner |
| **Backend** | OTel Collector, Prometheus, Jaeger, PostgreSQL |
| **SDK** | Python (FastAPI, vLLM, LangChain), Node.js, Go, Java (Spring Boot), .NET (ASP.NET Core) |
| **AI/ML** | NL→PromQL (Copilot Engine), 이상 탐지, FlameGraph Profiling |
| **IaC** | Terraform Provider (5 resources, 3 datasources) |
| **Cloud** | AWS CloudWatch, GCP Monitoring, Azure Monitor |
| **Pipeline** | Airflow, Prefect, Dagster 모니터링 |
| **SSO** | OIDC, SAML 2.0 (Okta, Azure AD, Google Workspace) |
| **Infra** | Docker Compose, Kubernetes, Helm, GitHub Actions |
| **보안** | RBAC, JWT, mTLS, PII Sanitizer, 코드 서명, SSO |

### 상용 배포 금지 라이브러리 (AGPL-3.0)

아래 라이브러리는 **AGPL-3.0** 라이선스로, 상용 제품에 번들/배포 시 전체 소스코드 공개 의무가 발생합니다.
**상용 배포 시 절대 포함하지 마세요.**

| 라이브러리 | 라이선스 | 용도 | 대체 솔루션 |
|-----------|---------|------|-----------|
| **Grafana** (`grafana/grafana`) | AGPL-3.0 | 시각화 대시보드 | 자체 Next.js UI (구현 완료) |
| **Grafana Tempo** (`grafana/tempo`) | AGPL-3.0 | 분산 트레이싱 저장 | Jaeger (Apache 2.0) |
| **Grafana Loki** (`grafana/loki`) | AGPL-3.0 | 로그 집계/저장 | 자체 로그 뷰어 + OTel debug exporter |
| **MinIO** (`minio/minio`) | AGPL-3.0 | S3 호환 오브젝트 스토리지 | LocalBackend (자체 구현) / AWS S3 |

> **참고**: `minio-go` SDK (Apache 2.0)는 안전합니다. MinIO **서버**만 AGPL-3.0입니다.
> 개발/테스트 환경에서는 `docker-compose.yaml`로 사용 가능하나, 상용 배포 시 반드시 `docker-compose.commercial.yaml` 또는 `docker-compose.lite.yaml`을 사용하세요.
> 상세: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) | [DOCS/SOLUTION_STRATEGY.md §8](DOCS/SOLUTION_STRATEGY.md)

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
