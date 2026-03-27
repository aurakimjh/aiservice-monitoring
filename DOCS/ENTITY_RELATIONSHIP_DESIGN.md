# AITOP 엔티티 관계 설계

> **버전**: v1.1 (구현 완료)
> **작성일**: 2026-03-27 / **구현 완료**: 2026-03-28
> **목적**: 프로젝트 → 서버(호스트) → 서비스 → 인스턴스 간 관계 모델 정의
> **구현 상태**: Phase A (Backend 5건) + Phase B (Frontend 5건) 전체 완료

---

## 1. 문제 인식

현재 AITOP은 다음 한계가 있다:

- **프로젝트**: 데모용 하드코딩 4개. 실제 CRUD 없음
- **서버(호스트)**: Agent Heartbeat 기반이나 어떤 프로젝트에 속하는지 모름
- **서비스**: Jaeger 서비스명만 수집. 어떤 서버에서 실행 중인지 모름
- **인스턴스**: 동일 서비스의 복수 인스턴스(Pod, 프로세스) 구분 불가
- **AI 서비스 그룹**: RAG = Embedding + VectorDB + LLM + Guardrail 묶음 표현 불가

이로 인해:
- 대시보드에서 프로젝트별 필터링 불가능
- 서비스 토폴로지에서 서버↔서비스 매핑 불가능
- AI 파이프라인(RAG, Agent) 전체 현황을 한 화면에 볼 수 없음

---

## 2. 엔티티 관계 모델

```
┌─────────────────────────────────────────────────────────────┐
│                        Project                               │
│  "AI-Production", "E-Commerce-Staging" 등                    │
│  (팀/환경 단위 최상위 논리 그룹)                               │
└──────────┬──────────────────────────────────────────────────┘
           │ 1:N
           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Host (Server)                            │
│  물리/VM/컨테이너 호스트. Agent가 설치된 단위                   │
│  hostname, OS, CPU, Memory, Disk, Network                    │
│  agent_id로 식별                                             │
└──────────┬──────────────────────────────────────────────────┘
           │ 1:N (하나의 호스트에 여러 서비스 실행)
           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Service                                  │
│  논리적 서비스 단위. 이름으로 식별                              │
│  "api-gateway", "rag-service", "auth-service" 등              │
│  framework, language, owner, project_id                      │
└──────────┬──────────────────────────────────────────────────┘
           │ 1:N (하나의 서비스가 여러 인스턴스로 실행)
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Instance                                   │
│  서비스의 실행 단위 (프로세스, Pod, 컨테이너)                    │
│  host_id + service_name + PID/port로 식별                     │
│  개별 메트릭: CPU, Memory, TPS, Latency, Error Rate           │
└─────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │          Service Group (AI)              │
         │  여러 서비스를 묶는 상위 개념              │
         │  "RAG Pipeline" = embedding + vectordb   │
         │                   + llm + guardrail      │
         │  "ML Training" = trainer + evaluator     │
         │                   + model-server         │
         └─────────────────────────────────────────┘
```

---

## 3. 엔티티 상세 정의

### 3.1 Project

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 고유 ID (auto-generate) |
| name | string | 프로젝트 이름 ("AI-Production") |
| description | string | 설명 |
| environment | enum | production / staging / development |
| tags | map | 자유 태그 (team, department 등) |
| created_at | timestamp | 생성 시간 |

**관계**: Project 1 → N Host, Project 1 → N Service

### 3.2 Host (Server)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | Agent ID (agent가 생성) |
| hostname | string | OS hostname |
| project_id | string | 소속 프로젝트 (Admin이 할당) |
| os_type | string | linux / windows / darwin |
| os_metrics | object | CPU/Memory/Disk/Network/Process 상세 |
| agent_version | string | Agent 버전 |
| status | enum | online / offline / degraded |
| approved | bool | 관리자 승인 여부 |

**관계**: Host 1 → N Instance (호스트 위에 여러 서비스 인스턴스 실행)

### 3.3 Service

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 고유 ID |
| name | string | 서비스 이름 (OTel service.name과 매핑) |
| project_id | string | 소속 프로젝트 |
| service_group_id | string | AI 서비스 그룹 (nullable) |
| type | enum | web / api / worker / llm / embedding / vectordb / guardrail / batch |
| framework | string | Spring Boot / FastAPI / Express 등 |
| language | string | Java / Python / Go / Node.js / .NET |
| owner | string | 담당 팀/개인 |

**메트릭** (Prometheus 집계):
- `rpm` — 분당 요청 수
- `latency_p50`, `latency_p95`, `latency_p99` — 응답시간
- `error_rate` — 에러율 (%)
- `active_instances` — 활성 인스턴스 수

**관계**: Service 1 → N Instance

### 3.4 Instance

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 고유 ID |
| service_id | string | 소속 서비스 |
| host_id | string | 실행 중인 호스트 |
| endpoint | string | host:port |
| pid | int | 프로세스 ID (nullable) |
| status | enum | running / stopped / error |
| started_at | timestamp | 시작 시간 |

**메트릭** (개별):
- 인스턴스별 CPU, Memory, TPS, Latency, Error Rate
- 대시보드에서 SUM(모아보기) vs Individual(개별보기) 전환

### 3.5 Service Group (AI Pipeline)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 고유 ID |
| name | string | "RAG Pipeline", "ML Training Pipeline" |
| project_id | string | 소속 프로젝트 |
| type | enum | rag / agent / training / inference |
| services | string[] | 구성 서비스 ID 목록 |
| description | string | 파이프라인 설명 |

---

## 4. 데이터 흐름

### 4.1 자동 감지 (Auto-Discovery)

```
Agent 기동
  │
  ├─ Heartbeat → Collection Server
  │   (hostname, OS, CPU, Memory, installed processes)
  │
  ├─ Process 스캔 → 서비스 자동 감지
  │   (java -jar api-gateway.jar → service_name="api-gateway", framework="Spring Boot")
  │   (python uvicorn main:app → service_name="rag-service", framework="FastAPI")
  │   (node app.js → service_name="nodejs-demo-app", framework="Express")
  │
  └─ OTel Trace → Jaeger → service.name 자동 등록
      (OTel SDK가 service.name을 설정하면 자동으로 서비스 목록에 추가)
```

### 4.2 수동 구성 (Admin)

```
Admin UI:
  1. 프로젝트 생성 → "AI-Production"
  2. Agent 승인 시 프로젝트 할당 → Host ← Project
  3. 서비스 등록 (자동 감지 서비스에 메타데이터 추가)
     - owner, type, service_group 설정
  4. AI 서비스 그룹 구성
     - "RAG Pipeline" = [embedding-service, qdrant-proxy, llm-service, guardrail]
```

### 4.3 대시보드 표현

```
프로젝트 대시보드 (Project-level)
  ├─ 서버 현황: 호스트 N대, 상태 요약
  ├─ 서비스 현황: 서비스 M개, Golden Signals
  ├─ AI 파이프라인: 그룹별 TTFT, TPS, Cost
  └─ 알림 요약: 프로젝트 내 알림

서비스 대시보드 (Service-level)
  ├─ 인스턴스 목록: 호스트별 인스턴스 상태
  ├─ Golden Signals: RPM, Latency, Error Rate (SUM / Individual)
  ├─ 엔드포인트별: /api/users, /api/products 등 분류
  └─ 의존성: 이 서비스가 호출하는/받는 서비스

AI 파이프라인 대시보드 (ServiceGroup-level)
  ├─ 파이프라인 스테이지: Embedding → Vector Search → LLM → Guardrail
  ├─ 전체 TTFT, 스테이지별 Latency 워터폴
  ├─ GPU 사용률 (LLM 서비스)
  ├─ 가드레일 차단율
  └─ 토큰 비용 집계
```

---

## 5. API 설계

### 5.1 Project CRUD

```
POST   /api/v1/projects                    # 프로젝트 생성
GET    /api/v1/projects                    # 프로젝트 목록
GET    /api/v1/projects/{id}               # 프로젝트 상세
PUT    /api/v1/projects/{id}               # 프로젝트 수정
DELETE /api/v1/projects/{id}               # 프로젝트 삭제
```

### 5.2 Host → Project 할당

```
POST   /api/v1/projects/{id}/hosts         # 호스트를 프로젝트에 할당
DELETE /api/v1/projects/{id}/hosts/{hostId} # 호스트 프로젝트에서 제거
GET    /api/v1/projects/{id}/hosts         # 프로젝트의 호스트 목록
```

### 5.3 Service 관리

```
POST   /api/v1/services                    # 서비스 등록 (수동)
GET    /api/v1/services                    # 서비스 목록 (auto-discovered + manual)
GET    /api/v1/services/{id}               # 서비스 상세 + 인스턴스 목록
PUT    /api/v1/services/{id}               # 서비스 메타데이터 수정
GET    /api/v1/services/{id}/instances     # 인스턴스 목록
GET    /api/v1/services/{id}/metrics       # 서비스 메트릭 (Prometheus 집계)
```

### 5.4 Service Group (AI Pipeline)

```
POST   /api/v1/service-groups              # AI 파이프라인 그룹 생성
GET    /api/v1/service-groups              # 그룹 목록
GET    /api/v1/service-groups/{id}         # 그룹 상세 + 구성 서비스
PUT    /api/v1/service-groups/{id}         # 그룹 수정
GET    /api/v1/service-groups/{id}/metrics # 그룹 전체 메트릭
```

### 5.5 Instance

```
GET    /api/v1/instances                   # 전체 인스턴스 목록
GET    /api/v1/instances/{id}              # 인스턴스 상세
GET    /api/v1/instances/{id}/metrics      # 인스턴스 개별 메트릭
```

---

## 6. OTel 레이블 매핑

OTel SDK에서 보내는 Resource Attributes → AITOP 엔티티 매핑:

| OTel Attribute | AITOP 엔티티 | 예시 |
|----------------|-------------|------|
| `service.name` | Service.name | "api-gateway" |
| `service.namespace` | Project.name | "ai-production" |
| `service.instance.id` | Instance.id | "api-gw-pod-abc123" |
| `host.name` | Host.hostname | "prod-api-01" |
| `host.id` | Host.id | "agent-42" |
| `deployment.environment` | Project.environment | "production" |
| `service.version` | Instance.version | "1.2.0" |
| `telemetry.sdk.language` | Service.language | "python" |

Agent가 프로세스 스캔으로 감지한 서비스와 OTel trace의 `service.name`을 매칭하여 자동 연결.

---

## 7. 마이그레이션 계획

### Phase A: 엔티티 모델 구현 (Backend) ✅ 완료

| # | 작업 | 설명 | 커밋 |
|---|------|------|------|
| A-1 | Project CRUD API | Collection Server에 프로젝트 관리 API + SQLite 저장 | `6d79f24` |
| A-2 | Host → Project 할당 | Agent 승인 시 프로젝트 선택 UI, API | `90e362e` |
| A-3 | Service 자동 감지 | Jaeger sync + OTel service.name 매핑 + CRUD | `873a527` |
| A-4 | Instance 모델 | 서비스의 host:port 인스턴스 목록 관리 | `fcf1714` |
| A-5 | Service Group API | AI 파이프라인 그룹 CRUD + 메트릭 집계 | `43ea386` |

### Phase B: 프론트엔드 연동 ✅ 완료

| # | 작업 | 설명 | 커밋 |
|---|------|------|------|
| B-1 | 프로젝트 셀렉터 실데이터 | fetchProjects(mode) → API/Demo 전환 | `dc504dc` |
| B-2 | 프로젝트별 필터링 | 전 페이지 ?project_id= 전달 | `b70dcdc` |
| B-3 | 서비스 페이지 고도화 | Instances 탭 + 호스트 매핑 + DataSourceBadge | `ece8966` |
| B-4 | AI 파이프라인 대시보드 | Service Group 카드 + 생성 모달 + 메트릭 | `9c381b0` |
| B-5 | 토폴로지 드릴다운 | 3레벨 탭 (Services/Hosts/Instances) | `f2d7261` |

### Phase C: 대시보드 통합 ✅ 완료

| # | 작업 | 설명 | 커밋 |
|---|------|------|------|
| C-1 | 프로젝트 대시보드 | 프로젝트별 KPI + 실데이터 (hosts/services/AI) | `9ed6429` |
| C-2 | 서비스 대시보드 위젯 | 인스턴스 SUM/Individual Prometheus 연동 | `3a70670` |
| C-3 | AI 파이프라인 위젯 | Waterfall + TTFT Trend + Token Cost 3종 | `6b0b215` |
| C-4 | 커스텀 대시보드 필터 | 프로젝트/서비스/호스트 필터 + topbar 상속 | `f1eb8dc` |

---

## 8. 데이터 예시

### 프로젝트 "AI-Production"

```json
{
  "id": "proj-ai-prod",
  "name": "AI-Production",
  "environment": "production",
  "hosts": [
    { "id": "agent-01", "hostname": "prod-api-01" },
    { "id": "agent-02", "hostname": "prod-gpu-01" }
  ],
  "services": [
    {
      "name": "api-gateway",
      "type": "api",
      "instances": [
        { "host": "prod-api-01", "port": 8080, "status": "running" },
        { "host": "prod-api-02", "port": 8080, "status": "running" }
      ]
    },
    {
      "name": "rag-service",
      "type": "llm",
      "instances": [
        { "host": "prod-gpu-01", "port": 8084, "status": "running" }
      ]
    }
  ],
  "service_groups": [
    {
      "name": "RAG Pipeline",
      "type": "rag",
      "services": ["embedding-service", "qdrant-proxy", "rag-service", "guardrail"]
    }
  ]
}
```
