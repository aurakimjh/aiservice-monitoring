# AITOP 엔티티 관계 설계

> **버전**: v1.2 (v2 계층 모델 반영)
> **작성일**: 2026-03-27 / **구현 완료**: 2026-03-28 / **v1.2 업데이트**: 2026-03-29
> **목적**: 프로젝트 → 서버(호스트) → 서비스 → 인스턴스 간 관계 모델 정의 + Kubernetes, Database, 비즈니스 트랜잭션 확장
> **구현 상태**: Phase A~C (Backend+Frontend+대시보드) 완료 / Phase E1~E5 (v2 확장) 계획
>
> **관련 문서**: [ENTITY_HIERARCHY_DESIGN_v2.md](./ENTITY_HIERARCHY_DESIGN_v2.md) — 6-Layer 모니터링 모델, 대시보드 배치, 경쟁사 참고

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

### 1.1 v1.1 구현 후 추가 식별된 한계 (v1.2)

| 영역 | v1.1 상태 | 필요 | 상세 설계 |
|------|----------|------|----------|
| **Kubernetes** | 미지원 | Cluster → Namespace → Deployment → Pod 계층 | [v2 §3](./ENTITY_HIERARCHY_DESIGN_v2.md#3-kubernetes-계층-상세) |
| **Database** | Host.middlewares에 포함 | 독립 엔티티 + Service↔DB 연결 + Slow Query | [v2 §4](./ENTITY_HIERARCHY_DESIGN_v2.md#4-database-레이어-상세) |
| **비즈니스 트랜잭션** | 미지원 | 사용자 정의 E2E 트랜잭션 그룹 (SLO 연동) | [v2 §7.1](./ENTITY_HIERARCHY_DESIGN_v2.md#71-신규-엔티티-정의) |
| **서비스 간 관계** | Jaeger 의존 | 자체 Trace 기반 Dependency Graph 자동 생성 | [v2 §5](./ENTITY_HIERARCHY_DESIGN_v2.md#5-대시보드-배치-설계) |
| **메시지 큐** | 미지원 | Kafka, RabbitMQ, Redis Pub/Sub | Database 엔티티 type으로 통합 |

> **v2 계층 모델의 전체 설계는 [ENTITY_HIERARCHY_DESIGN_v2.md](./ENTITY_HIERARCHY_DESIGN_v2.md)를 참조하세요.**

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

### 2.2 v1.2 확장 — Kubernetes, Database, 비즈니스 트랜잭션

```
Project
 ├── 1:N → K8s Cluster ─── (v1.2 신규)
 │         ├── 1:N → Namespace
 │         │         └── 1:N → Workload (Deployment/StatefulSet/Job)
 │         │                   └── 1:N → Pod → Instance(매핑)
 │         └── 1:N → Node → Host(매핑)
 │
 ├── 1:N → Host (기존)
 │         └── 1:N → Instance
 │
 ├── 1:N → Service (기존)
 │         ├── 1:N → Instance
 │         ├── 1:N → Endpoint
 │         └── N:M → Database ─── (v1.2 신규)
 │
 ├── 1:N → Database ─── (v1.2 신규)
 │         ├── type: postgresql / mysql / redis / qdrant / kafka
 │         ├── Connection Pool, Slow Query, Lock
 │         └── N:M → Service (자동 감지: trace span db.* 속성)
 │
 ├── 1:N → Service Group (기존, AI Pipeline)
 │
 └── 1:N → Business Transaction ─── (v1.2 신규)
           ├── entry_service + entry_operation
           ├── E2E SLO 추적
           └── Trace ID 기반 자동 집계
```

> 각 엔티티의 상세 필드 정의는 [ENTITY_HIERARCHY_DESIGN_v2.md §7](./ENTITY_HIERARCHY_DESIGN_v2.md#7-엔티티-모델-v2-상세)를 참조하세요.

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

**v1.2 추가 매핑** (Kubernetes, Database, AI Pipeline):

| OTel Attribute | AITOP 엔티티 | 예시 |
|----------------|-------------|------|
| `k8s.cluster.name` | K8sCluster.name | "prod-k8s-01" |
| `k8s.namespace.name` | K8sWorkload.namespace | "ai-services" |
| `k8s.deployment.name` | K8sWorkload.name | "rag-service" |
| `k8s.pod.name` | Instance.id (Pod 매핑) | "rag-service-7d8f9c-abc12" |
| `k8s.node.name` | Host.hostname (Node 매핑) | "node-gpu-03" |
| `db.system` | Database.type | "postgresql" |
| `db.name` | Database.endpoint (DB명) | "demodb" |
| `server.address` | Database.endpoint (호스트) | "prod-db-01" |
| `db.statement` | Slow Query 수집 | "SELECT * FROM users..." |
| `ai.pipeline.name` | ServiceGroup.name | "RAG Pipeline" |
| `ai.pipeline.stage` | 워터폴 스테이지 | "embedding" |

Agent가 프로세스 스캔으로 감지한 서비스와 OTel trace의 `service.name`을 매칭하여 자동 연결. K8s 환경에서는 `k8s.pod.name`으로 Instance를, `k8s.node.name`으로 Host를 자동 매핑합니다. Database는 trace span의 `db.system` + `server.address`에서 자동 감지합니다.

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

### Phase E: v2 확장 — Kubernetes, Database, 비즈니스 트랜잭션 (계획)

> 상세 설계: [ENTITY_HIERARCHY_DESIGN_v2.md §8](./ENTITY_HIERARCHY_DESIGN_v2.md#8-구현-로드맵)

| Phase | 작업 | 주요 엔티티 | 예상 |
|-------|------|-----------|------|
| **E1** | Database 엔티티 | Database, Service↔DB 관계 자동 감지 | 2주 |
| **E2** | Kubernetes 통합 | K8sCluster, K8sWorkload, Pod↔Instance 매핑 | 3주 |
| **E3** | Topology 고도화 | 자체 Dependency Graph (Trace 기반), DB 노드 포함 | 2주 |
| **E4** | Business Transaction | 사용자 정의 E2E 트랜잭션 그룹, SLO 연동 | 1주 |
| **E5** | 드릴다운 통합 | 전 레이어 간 클릭 이동, Global Search | 1주 |

### Phase E API 확장 (계획)

```
── Database (v1.2 신규) ──
GET    /api/v1/databases                   # DB 목록 (자동 감지 + 수동 등록)
GET    /api/v1/databases/{id}              # DB 상세 (Connection Pool, Slow Queries)
GET    /api/v1/databases/{id}/slow-queries # Slow Query 목록 + 연관 서비스
GET    /api/v1/databases/{id}/services     # 이 DB를 사용하는 서비스 목록

── Kubernetes (v1.2 신규) ──
GET    /api/v1/k8s/clusters                # 클러스터 목록
GET    /api/v1/k8s/clusters/{id}           # 클러스터 상세 (Node 수, Pod Ready %)
GET    /api/v1/k8s/clusters/{id}/namespaces # 네임스페이스 목록
GET    /api/v1/k8s/namespaces/{ns}/workloads # 워크로드 목록 (Deployment/StatefulSet)
GET    /api/v1/k8s/workloads/{id}/pods     # Pod 목록 + 상태/리소스
GET    /api/v1/k8s/pods/{id}               # Pod 상세 (Container, Events)
GET    /api/v1/k8s/events                  # 클러스터 이벤트 (OOMKill, CrashLoop 등)

── Business Transaction (v1.2 신규) ──
POST   /api/v1/business-transactions       # 트랜잭션 그룹 생성
GET    /api/v1/business-transactions       # 그룹 목록
GET    /api/v1/business-transactions/{id}  # 그룹 상세 + E2E 통계
GET    /api/v1/business-transactions/{id}/traces  # 해당 그룹의 트레이스 목록

── Dependency Graph (v1.2 신규) ──
GET    /api/v1/topology                    # 서비스 + DB 토폴로지 그래프
GET    /api/v1/topology/dependencies       # 서비스 간 의존성 목록 (방향, 트래픽, 에러율)
```

---

## 8. 데이터 예시

### 프로젝트 "AI-Production"

```json
{
  "id": "proj-ai-prod",
  "name": "AI-Production",
  "environment": "production",

  "k8s_clusters": [
    {
      "id": "k8s-prod-01",
      "name": "prod-k8s-01",
      "version": "1.29.3",
      "nodes": 50,
      "namespaces": ["ai-services", "batch", "infra"]
    }
  ],

  "hosts": [
    { "id": "agent-01", "hostname": "prod-api-01", "k8s_node": "node-app-01" },
    { "id": "agent-02", "hostname": "prod-gpu-01", "k8s_node": "node-gpu-01" }
  ],

  "services": [
    {
      "name": "api-gateway",
      "type": "api",
      "framework": "Spring Boot 3.3",
      "language": "Java",
      "k8s_workload": "ai-services/api-gateway (Deployment, 3 replicas)",
      "instances": [
        { "host": "prod-api-01", "port": 8080, "pod": "api-gateway-7d8f9c-abc12", "status": "running" },
        { "host": "prod-api-01", "port": 8080, "pod": "api-gateway-7d8f9c-def34", "status": "running" },
        { "host": "prod-api-02", "port": 8080, "pod": "api-gateway-7d8f9c-ghi56", "status": "running" }
      ],
      "databases": ["db-pg-prod-01", "db-redis-prod-01"]
    },
    {
      "name": "rag-service",
      "type": "llm",
      "framework": "FastAPI",
      "language": "Python",
      "k8s_workload": "ai-services/rag-service (Deployment, 2 replicas, GPU)",
      "instances": [
        { "host": "prod-gpu-01", "port": 8084, "pod": "rag-service-5c7a8b-xyz99", "status": "running" }
      ],
      "databases": ["db-qdrant-prod-01", "db-redis-prod-01"]
    }
  ],

  "databases": [
    {
      "id": "db-pg-prod-01",
      "type": "postgresql",
      "endpoint": "prod-db-01:5432/demodb",
      "version": "16.2",
      "connected_services": ["api-gateway", "auth-service", "payment-service"]
    },
    {
      "id": "db-qdrant-prod-01",
      "type": "qdrant",
      "endpoint": "prod-qdrant-01:6333",
      "version": "1.9.0",
      "connected_services": ["rag-service", "embedding-service"]
    },
    {
      "id": "db-redis-prod-01",
      "type": "redis",
      "endpoint": "prod-redis-01:6379",
      "version": "7.2",
      "connected_services": ["api-gateway", "rag-service", "auth-service"]
    }
  ],

  "service_groups": [
    {
      "name": "RAG Pipeline",
      "type": "rag",
      "services": ["embedding-service", "qdrant-proxy", "rag-service", "guardrail"]
    }
  ],

  "business_transactions": [
    {
      "name": "RAG 질의 응답",
      "entry_service": "api-gateway",
      "entry_operation": "POST /api/chat",
      "participating_services": ["api-gateway", "guardrail", "embedding-service", "rag-service"],
      "slo_p95_ms": 2000
    },
    {
      "name": "사용자 인증",
      "entry_service": "api-gateway",
      "entry_operation": "POST /api/auth/login",
      "participating_services": ["api-gateway", "auth-service"],
      "slo_p95_ms": 500
    }
  ]
}
```
