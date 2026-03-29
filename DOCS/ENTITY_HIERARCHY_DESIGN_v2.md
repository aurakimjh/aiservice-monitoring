# AITOP 모니터링 계층 구조 설계 v2

> **문서 유형**: 엔티티 계층 모델 + 대시보드 배치 설계
> **작성일**: 2026-03-29
> **기반 문서**: [ENTITY_RELATIONSHIP_DESIGN.md](./ENTITY_RELATIONSHIP_DESIGN.md) (v1.1, Phase A~C 구현 완료)
> **목표**: 인프라 ~ AI 서비스까지 6개 레이어로 모든 모니터링 대상을 계층화하고, Kubernetes 환경을 포함한 대시보드 배치를 정의

---

## 1. 현재 상태 (v1.1) 와 한계

### 1.1 구현 완료된 엔티티

```
Project → Host → Service → Instance
                 Service Group (AI Pipeline)
```

### 1.2 부족한 점

| 영역 | 현재 | 필요 |
|------|------|------|
| **Kubernetes** | 미지원 | Cluster → Namespace → Deployment → Pod 계층 필요 |
| **Database** | Host에 미들웨어로 포함 | 독립 엔티티 (Connection Pool, Slow Query, Lock) |
| **메시지 큐** | 미지원 | Kafka, Redis Pub/Sub, RabbitMQ |
| **AI 서비스 흐름** | Service Group으로 묶기만 | Trace ID 기반 전역 트랜잭션 + 스테이지 워터폴 |
| **서비스 간 관계** | Jaeger 의존성 | 자체 Dependency Graph (트레이스 기반 자동 생성) |
| **비즈니스 트랜잭션** | 미지원 | 사용자 정의 트랜잭션 그룹 (결제 플로우, 주문 처리) |

---

## 2. 6-Layer 모니터링 모델

### 2.1 계층 구조 전체도

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║  Layer 6 ─ Business / AI Service                                        ║
║  ┌─────────────────────────────────────────────────────────────────────┐║
║  │  비즈니스 트랜잭션, AI 파이프라인(RAG, Agent)                        │║
║  │  전역 Trace ID 기반 End-to-End 흐름                                 │║
║  │  KPI: 전체 성공률, E2E 응답시간, TTFT, 비용                         │║
║  └─────────────────────────────────────────────────────────────────────┘║
║                                                                          ║
║  Layer 5 ─ Topology / Dependency                                        ║
║  ┌─────────────────────────────────────────────────────────────────────┐║
║  │  서비스 간 호출 관계(방향, 트래픽, 에러 전파)                         │║
║  │  자동 생성: Trace span의 parent-child 관계에서 추출                  │║
║  │  KPI: 호출 빈도, 에러 전파율, 서비스 간 P95                          │║
║  └─────────────────────────────────────────────────────────────────────┘║
║                                                                          ║
║  Layer 4 ─ Application / Service                                        ║
║  ┌─────────────────────────────────────────────────────────────────────┐║
║  │  논리적 서비스 단위 (service.name)                                   │║
║  │  하나의 서비스 = 여러 인스턴스 (Pod, 프로세스)                        │║
║  │  KPI: RPM, P95, Error Rate, Active Instances (Golden Signals)       │║
║  └─────────────────────────────────────────────────────────────────────┘║
║                                                                          ║
║  Layer 3 ─ Database / Data Store                                        ║
║  ┌─────────────────────────────────────────────────────────────────────┐║
║  │  PostgreSQL, MySQL, Redis, Qdrant, Kafka                            │║
║  │  서비스와의 연결 관계 (Connection Pool, 호출 빈도)                    │║
║  │  KPI: Query Latency, Connection Pool, Slow Queries, Lock Wait       │║
║  └─────────────────────────────────────────────────────────────────────┘║
║                                                                          ║
║  Layer 2 ─ Container / Kubernetes                                       ║
║  ┌─────────────────────────────────────────────────────────────────────┐║
║  │  Cluster → Namespace → Deployment/StatefulSet → Pod → Container     │║
║  │  HPA 상태, ReplicaSet 변경, Pod Restart, OOMKill                   │║
║  │  KPI: Pod Ready %, Restart Count, Resource Utilization vs Limit     │║
║  └─────────────────────────────────────────────────────────────────────┘║
║                                                                          ║
║  Layer 1 ─ Infrastructure / Host                                        ║
║  ┌─────────────────────────────────────────────────────────────────────┐║
║  │  물리서버, VM, K8s Node                                             │║
║  │  Agent가 설치된 단위                                                 │║
║  │  KPI: CPU, Memory, Disk I/O, Network, GPU                          │║
║  └─────────────────────────────────────────────────────────────────────┘║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 2.2 계층 간 관계 (Entity Relationship)

```
Project (팀/환경 단위 최상위 그룹)
 ├── 1:N → K8s Cluster (L2)
 │         ├── 1:N → Namespace
 │         │         ├── 1:N → Deployment / StatefulSet / DaemonSet
 │         │         │         ├── 1:N → Pod
 │         │         │         │         ├── 1:N → Container
 │         │         │         │         └── M:1 → Service (OTel service.name으로 매핑)
 │         │         │         └── spec → HPA, Resource Limits
 │         │         └── 공유 자원 → ConfigMap, Secret, PVC
 │         └── Node ←→ Host (L1, 동일 물리 장비)
 │
 ├── 1:N → Host (L1, non-K8s 환경)
 │         ├── OS 메트릭 (CPU, Memory, Disk, Network)
 │         ├── GPU 메트릭 (Utilization, VRAM, Power)
 │         └── 1:N → Instance (프로세스 수준)
 │
 ├── 1:N → Service (L4)
 │         ├── 1:N → Instance (Pod 또는 프로세스)
 │         ├── 1:N → Endpoint (/api/users, /api/orders)
 │         ├── N:M → Database (L3, 연결 관계)
 │         └── Golden Signals (RPM, P95, Error Rate)
 │
 ├── 1:N → Database (L3)
 │         ├── type: postgresql / mysql / redis / qdrant / kafka
 │         ├── 1:N → 연결된 Service (역참조)
 │         └── Query Stats, Connection Pool, Slow Queries
 │
 ├── 1:N → Service Group (L6, AI Pipeline / Business Flow)
 │         ├── 1:N → 구성 Service
 │         ├── Trace ID 기반 E2E 추적
 │         └── 전체 KPI (성공률, E2E P95, TTFT, Cost)
 │
 └── auto → Dependency Graph (L5)
           ├── 트레이스 parent-child에서 자동 추출
           ├── Service A → Service B (방향, 트래픽, 에러율)
           └── Service → Database (쿼리 빈도, 레이턴시)
```

---

## 3. Kubernetes 계층 상세

### 3.1 K8s 엔티티 모델

```
┌──────────────────────────────────────────────────────────────────┐
│ K8s Cluster                                                       │
│ ├── cluster_id: "prod-k8s-01"                                    │
│ ├── api_server: "https://k8s-api.internal:6443"                  │
│ ├── version: "1.29.3"                                            │
│ ├── nodes: 50                                                    │
│ └── project_id: "proj-ai-prod"                                   │
│                                                                   │
│ └── Namespace                                                     │
│     ├── name: "ai-services"                                      │
│     ├── labels: { team: "ml-platform" }                          │
│     │                                                            │
│     └── Workload (Deployment / StatefulSet / DaemonSet / Job)    │
│         ├── name: "rag-service"                                  │
│         ├── kind: "Deployment"                                   │
│         ├── replicas: desired=3, ready=3, available=3            │
│         ├── strategy: "RollingUpdate"                            │
│         ├── hpa: { min=2, max=10, cpu_target=70% }              │
│         │                                                        │
│         └── Pod                                                  │
│             ├── name: "rag-service-7d8f9c-abc12"                │
│             ├── node: "node-gpu-03" → Host(L1) 매핑             │
│             ├── phase: Running                                   │
│             ├── restart_count: 0                                 │
│             ├── started_at: "2026-03-29T10:00:00Z"              │
│             │                                                    │
│             └── Container                                        │
│                 ├── name: "rag-service"                          │
│                 ├── image: "aitop/rag-service:1.8.0"            │
│                 ├── resources:                                   │
│                 │   requests: { cpu: "500m", memory: "1Gi" }    │
│                 │   limits: { cpu: "2", memory: "4Gi", gpu: "1"}│
│                 ├── actual: { cpu: "1.2", memory: "2.8Gi" }    │
│                 └── → Instance(L4) 매핑 (OTel service.instance.id) │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 K8s ↔ AITOP 엔티티 매핑

| K8s 리소스 | AITOP 엔티티 | 매핑 키 | 비고 |
|-----------|-------------|---------|------|
| Node | Host (L1) | `hostname` | AITOP Agent가 Node에 DaemonSet으로 배포 |
| Pod | Instance (L4) | `service.instance.id` = pod name | OTel resource attribute로 자동 매핑 |
| Deployment.metadata.labels["app"] | Service (L4) | `service.name` | OTel `service.name`과 일치시킴 |
| Namespace | Project 또는 하위 그룹 | `service.namespace` | 네임스페이스별 자동 프로젝트 분류 가능 |
| Container | Instance 하위 상세 | container name | 사이드카(envoy, istio-proxy) 구분 |

### 3.3 K8s 데이터 수집 방식

```
방법 1: AITOP Agent DaemonSet (권장)
  각 Node에 Agent Pod → kubelet API + cAdvisor 메트릭 수집
  + Node 레벨 OS 메트릭 (기존 Agent 기능 그대로)

방법 2: K8s API Watcher (Collection Server)
  Collection Server가 K8s API Server에 Watch 연결
  → Deployment, Pod, Event 변경 실시간 감지
  → Pod Restart, OOMKill, HPA Scale 이벤트 수집

방법 3: OTel Collector K8s Attributes Processor (기존 OTel 활용)
  OTel Collector가 K8s API에서 메타데이터를 추가
  → span에 k8s.pod.name, k8s.deployment.name 자동 첨부
  → v2.0에서는 AITOP OTLP Receiver가 이 역할을 직접 수행
```

---

## 4. Database 레이어 상세

### 4.1 DB 엔티티 모델

```
Database
 ├── id: "db-pg-prod-01"
 ├── type: postgresql | mysql | redis | mongodb | qdrant | kafka
 ├── host: "prod-db-01:5432"
 ├── host_id → Host(L1) 연결
 ├── project_id → Project 소속
 │
 ├── Metrics (실시간)
 │   ├── connections_active / connections_idle / connections_max
 │   ├── queries_per_second
 │   ├── avg_query_latency_ms
 │   ├── slow_query_count (> 1초)
 │   ├── lock_wait_count
 │   ├── replication_lag_ms (HA 환경)
 │   └── disk_usage_bytes
 │
 ├── Slow Queries (보관)
 │   ├── query_hash, query_text (정규화)
 │   ├── avg_duration, max_duration, call_count
 │   ├── 연관 서비스 (어떤 Service에서 호출?)
 │   └── 실행 계획 (EXPLAIN)
 │
 └── Service 연결 (N:M)
     ├── service_id: "rag-service" → connection_pool_size: 20
     ├── service_id: "api-gateway" → connection_pool_size: 50
     └── 자동 감지: Trace span의 db.system + db.name 속성에서 추출
```

### 4.2 서비스 ↔ DB 관계 자동 감지

```
OTel Trace Span:
  service.name = "api-gateway"
  span.kind = CLIENT
  db.system = "postgresql"
  db.name = "demodb"
  db.statement = "SELECT * FROM users WHERE id = $1"
  server.address = "prod-db-01"

→ AITOP 자동 매핑:
  Service("api-gateway") --uses--> Database("prod-db-01:5432/demodb")
  트래픽: 850 queries/sec, P95: 12ms
```

---

## 5. 대시보드 배치 설계

### 5.1 대시보드 계층 구조

```
┌──────────────────────────────────────────────────────────────────────┐
│ Level 0: Executive Overview (임원/CTO용)                              │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ 프로젝트 전체 건강 상태 | 서비스 가용률 SLA | 비용 트렌드         ││
│ │ 핵심 알림 요약 | AI 서비스 성공률 | 장애 MTTR                    ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│ Level 1: AI Service Dashboard (AI/비즈니스 담당자용)                   │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ AI 파이프라인 전체 성공률, E2E 응답시간 (P95)                     ││
│ │ 스테이지별 워터폴: Embedding → VectorDB → LLM → Guardrail       ││
│ │ TTFT 트렌드 | TPS | 토큰 비용 | 가드레일 차단율                  ││
│ │ → 각 스테이지 클릭 시 해당 Service(L4)로 드릴다운                 ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│ Level 2: Service Map (MSA 토폴로지 — 아키텍트/SRE용)                  │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ 서비스 간 호출 화살표, 에러 전파 경로, 트래픽 두께                 ││
│ │ 노드 색상: 초록(정상) → 노랑(경고) → 빨강(장애)                  ││
│ │ → 노드 클릭 → Service Detail                                    ││
│ │ → 화살표 클릭 → 두 서비스 간 트레이스 목록                       ││
│ │ → DB/Cache 노드 포함 (하단 별도 레이어로 구분)                    ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│ Level 3: Service Detail (개발자/SRE용)                                │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Tabs: Overview | Instances | Endpoints | Traces | DB | Runtime   ││
│ │                                                                  ││
│ │ [Overview] Golden Signals (RPM, P95, Error Rate) 시계열 차트      ││
│ │ [Instances] 인스턴스(Pod)별 CPU/Memory/TPS 비교 테이블            ││
│ │ [Endpoints] /api/users (P95: 45ms, 850rpm), /api/orders (...)   ││
│ │ [Traces] XLog 산점도 + 트레이스 검색 (에러, 느린 요청 필터)       ││
│ │ [DB] 이 서비스가 사용하는 DB의 Connection Pool, Slow Queries      ││
│ │ [Runtime] JVM Heap, GC, Thread | Go Goroutine | .NET GC          ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│ Level 4: Database Detail (DBA용)                                      │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Connection Pool 게이지 (사용/유휴/대기)                           ││
│ │ Query Latency 히트맵 (시간 × 레이턴시)                            ││
│ │ Top Slow Queries 테이블 (쿼리, 평균, 호출 수, 연관 서비스)        ││
│ │ Lock Wait 이벤트 타임라인                                        ││
│ │ → Slow Query 클릭 → 해당 쿼리를 호출한 서비스의 Trace로 이동      ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│ Level 5: K8s Cluster Dashboard (인프라 엔지니어용)                     │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Tabs: Cluster | Namespaces | Workloads | Pods | Nodes | Events  ││
│ │                                                                  ││
│ │ [Cluster] Node 수, Pod Ready %, CPU/Memory 전체 사용률           ││
│ │ [Namespaces] 네임스페이스별 Pod 수, 리소스 사용량 비교           ││
│ │ [Workloads] Deployment 목록 — Replicas, HPA, Rollout 상태       ││
│ │ [Pods] Pod 목록 — Status, Restarts, CPU/Mem, Container Logs     ││
│ │ [Nodes] Node별 CPU/Memory/Disk + Pod 배치 현황                  ││
│ │ [Events] OOMKill, CrashLoopBackoff, HPA Scale, ImagePullErr     ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────────┤
│ Level 6: Host Detail (시스템 엔지니어용)                               │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ CPU (코어별), Memory (Used/Cache/Available)                      ││
│ │ Disk I/O (Read/Write IOPS), Network (RX/TX)                     ││
│ │ GPU (Utilization, VRAM, Temp, Power) — AI 서버                  ││
│ │ Top Processes 테이블                                            ││
│ │ → 프로세스 클릭 → 해당 Service Instance로 연결                   ││
│ └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 드릴다운 동선

사용자가 문제를 발견하고 원인까지 도달하는 **클릭 경로**:

```
시나리오 A: AI 서비스 응답이 느려졌다
────────────────────────────────────────────
L1 AI Service → "RAG Pipeline P95: 3.2초 (SLO 2초 초과)"
  │ 워터폴 확인 → "LLM 스테이지 2.1초 (병목)"
  │ LLM 서비스 클릭 ↓
L3 Service Detail → "llm-service P95: 2.1초, Error Rate: 5%"
  │ Instances 탭 → "Pod-3: CPU 98%, 나머지 정상"
  │ Pod-3 클릭 ↓
L5 K8s Pod → "OOMKill 2회, Restart 3회, Memory Limit 4Gi 도달"
  │ Node 클릭 ↓
L6 Host → "GPU Memory 79.5/80GB, 거의 포화"
  │
  └─ 결론: GPU 메모리 부족으로 Pod OOMKill → LLM 레이턴시 급등

시나리오 B: 에러율이 갑자기 올라갔다
────────────────────────────────────────────
L2 Service Map → "api-gateway → payment-service 화살표 빨간색 (에러율 12%)"
  │ 화살표 클릭 ↓
L3 Service Detail (payment-service) → "Error Rate 12%, P95: 800ms"
  │ Traces 탭 → XLog에 빨간 점 집중 구간 확인
  │ 에러 트레이스 클릭 ↓
  │ Trace View → "payment-service → DB span: connection timeout"
  │ DB span 클릭 ↓
L4 Database Detail (payment-db) → "Connection Pool: 50/50 (100% 사용)"
  │ Slow Queries → "UPDATE payments ... Lock Wait 3.2초"
  │
  └─ 결론: DB Lock으로 Connection Pool 고갈 → payment-service 에러 급등

시나리오 C: K8s 배포 후 트래픽 이상
────────────────────────────────────────────
L5 K8s Cluster → Events 탭: "Deployment rag-service RollingUpdate 시작"
  │ Workloads → "rag-service: 3/5 Ready (2개 Pod Pending)"
  │ Pending Pod 클릭 ↓
L5 Pod Detail → "Insufficient GPU resources on any node"
  │ Nodes 탭 ↓
L6 Host (Node) → "Node-GPU-03: GPU 4/4 할당됨 (여유 없음)"
  │
  └─ 결론: GPU 리소스 부족으로 신규 Pod 스케줄링 실패
```

---

## 6. 경쟁사 UI 비교 참고

### 6.1 Datadog

**엔티티 계층**: Infrastructure → APM Services → Traces
**특징**:
- **Service Map**: 서비스 간 호출 관계를 원형 노드 + 화살표로 시각화. 노드 크기 = 트래픽, 색상 = 건강 상태.
- **Service Catalog**: 서비스 메타데이터(오너, 리포, 온콜, SLO) 중앙 관리. 개발팀이 직접 등록.
- **K8s Dashboard**: Cluster → Namespace → Deployment → Pod 계층. 오케스트레이터 탭으로 Pod 이벤트 추적.
- **APM Trace**: Flame graph + Waterfall. 각 span 클릭 시 해당 서비스/호스트로 이동.
- **Database Monitoring (DBM)**: 쿼리 정규화 → Top Slow Queries 테이블. 쿼리 → 호출한 서비스의 Trace 역추적 가능.

**AITOP이 배울 점**:
- Service Catalog (메타데이터 + 오너십 관리)
- DB → Trace 역추적 UX ("이 쿼리를 호출한 서비스는?")
- K8s Pod Events 타임라인

**AITOP 차별화 가능 영역**:
- Datadog은 AI 파이프라인 전용 워터폴 뷰가 없음
- Datadog DBM은 별도 과금 (AITOP은 통합)
- Datadog은 온프레미스 불가

### 6.2 Dynatrace

**엔티티 계층**: Smartscape (자동 탐색 3D 맵)
**특징**:
- **Smartscape**: 수직 3개 레이어 (Host → Process → Service)를 3D 맵으로 자동 시각화. 설정 없이 모든 관계 자동 감지.
- **PurePath**: 단일 요청의 코드 레벨 분산 추적. 메서드 호출까지 자동 계측.
- **Davis AI**: 이상 감지 → 자동 근본 원인 분석. "CPU 증가 → GC 빈번 → 메모리 누수 의심" 수준의 인과 관계 추론.
- **K8s Full-Stack**: Pod → Container → Process → Service 자동 매핑. 코드 변경 없이 OneAgent DaemonSet만 배포.

**AITOP이 배울 점**:
- Smartscape의 **자동 엔티티 탐색** (Agent가 프로세스 + 네트워크 + 서비스를 자동으로 매핑)
- 수직 계층 (Host → Process → Service) 시각화
- K8s Pod → Service 자동 매핑

**AITOP 차별화 가능 영역**:
- Dynatrace는 AI 파이프라인 워터폴 없음
- Davis AI는 실시간 이상 탐지이지 정기 진단/보고서가 아님
- Dynatrace는 비용이 매우 높음 (Host Unit 기반)

### 6.3 New Relic

**엔티티 계층**: Entity Platform (모든 것이 Entity)
**특징**:
- **Entity-centric**: 호스트, 서비스, DB, 브라우저, 모바일, Synthetic, K8s Pod 모두 "Entity"로 통합. 엔티티 간 관계를 그래프로 연결.
- **Automap**: 선택한 엔티티에서 연결된 엔티티를 자동 확장. "이 서비스와 관련된 모든 것"을 한 화면에 펼침.
- **NRQL**: 모든 데이터를 하나의 쿼리 언어로 탐색. `FROM Transaction SELECT average(duration) WHERE appName = 'api-gateway'`.
- **AI Monitoring**: LLM API 호출 추적, 토큰 사용량, 응답 품질 점수.

**AITOP이 배울 점**:
- "모든 것이 Entity" 통합 모델 (호스트, 서비스, DB, K8s를 동일 프레임워크로)
- Automap (엔티티 중심 탐색)
- 단일 쿼리 언어로 모든 데이터 조회

**AITOP 차별화 가능 영역**:
- New Relic은 GPU, VectorDB, Guardrail 모니터링 없음
- New Relic은 온프레미스 불가
- AI Monitoring이 LLM API 호출에 한정

### 6.4 WhaTap

**엔티티 계층**: Project → Agent → Transaction
**특징**:
- **XLog (트랜잭션 산점도)**: X축 시간, Y축 응답시간. 점 하나가 트랜잭션 하나. 빨간 점 = 에러. WhaTap(Scouter) 원조 기능으로 APM 시장에서 독보적.
- **히트맵**: 시간 × 응답시간 밀도 맵. XLog의 밀집 버전.
- **멀티 트랜잭션 추적**: 서비스 간 호출을 Trace ID로 연결.
- **컨테이너 맵**: K8s Pod를 타일 형태로 시각화. 색상 = CPU/Memory 사용률.

**AITOP이 배울 점**:
- XLog/히트맵 UX (이미 구현 — 지속 고도화)
- 컨테이너 맵 (Pod를 타일로 시각화하는 직관적 뷰)
- 빠른 설치 경험 (5분 내 에이전트 + 데이터)

**AITOP 차별화 가능 영역**:
- WhaTap은 AI 인프라 모니터링 미지원 (GPU, LLM, VectorDB)
- 진단/판정/보고서 자동화 없음
- 온프레미스 배포 가능 (WhaTap은 SaaS Only)

### 6.5 Pinpoint

**엔티티 계층**: Application → Server Map
**특징**:
- **Server Map**: 서비스 간 호출 관계를 상세한 토폴로지 맵으로 시각화. 화살표에 TPS, 에러 수 표시. 가장 디테일한 서비스 맵.
- **트랜잭션 목록**: CallTree 형태로 메서드 레벨까지 추적.
- **Inspector**: 시계열 차트 (Heap, CPU, TPS, Response Time) 시간대별 변화.

**AITOP이 배울 점**:
- Server Map의 상세한 호출 관계 표현 (TPS, Error Count를 화살표 위에 직접 표시)
- CallTree (메서드 레벨 드릴다운)

---

## 7. 엔티티 모델 v2 상세

### 7.1 신규 엔티티 정의

기존 v1.1 엔티티에 아래를 추가합니다:

#### K8sCluster

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 클러스터 ID |
| name | string | "prod-k8s-01" |
| project_id | string | 소속 프로젝트 |
| api_server | string | K8s API 서버 주소 |
| version | string | K8s 버전 |
| node_count | int | 노드 수 |
| pod_total / pod_ready | int | Pod 총수 / Ready 수 |
| cpu_usage / cpu_capacity | float | 전체 CPU 사용량/용량 |
| memory_usage / memory_capacity | int64 | 전체 메모리 |

#### K8sWorkload

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 워크로드 ID |
| cluster_id | string | 소속 클러스터 |
| namespace | string | K8s 네임스페이스 |
| name | string | "rag-service" |
| kind | enum | Deployment / StatefulSet / DaemonSet / Job / CronJob |
| replicas_desired / ready / available | int | 레플리카 상태 |
| service_id | string | 매핑된 AITOP Service (nullable) |
| hpa_min / hpa_max / hpa_current | int | HPA 설정 |
| resource_requests / limits | object | CPU/Memory/GPU 리소스 |

#### Database

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | DB ID |
| type | enum | postgresql / mysql / redis / mongodb / qdrant / kafka |
| host_id | string | 실행 중인 호스트 |
| project_id | string | 소속 프로젝트 |
| endpoint | string | "prod-db-01:5432/demodb" |
| version | string | "PostgreSQL 16.2" |
| connected_services | string[] | 연결된 서비스 ID 목록 (자동 감지) |

#### BusinessTransaction (비즈니스 트랜잭션 그룹)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 트랜잭션 그룹 ID |
| name | string | "주문 처리 플로우", "결제 파이프라인" |
| project_id | string | 소속 프로젝트 |
| entry_service | string | 진입 서비스 (api-gateway) |
| entry_operation | string | 진입 엔드포인트 ("/api/orders") |
| participating_services | string[] | 관여하는 서비스 목록 |
| slo_p95_ms | int | SLO 기준 (예: 2000ms) |

### 7.2 OTel 속성 매핑 확장

| OTel Attribute | AITOP 엔티티 | 예시 |
|----------------|-------------|------|
| `k8s.cluster.name` | K8sCluster.name | "prod-k8s-01" |
| `k8s.namespace.name` | K8sWorkload.namespace | "ai-services" |
| `k8s.deployment.name` | K8sWorkload.name | "rag-service" |
| `k8s.pod.name` | Instance.id | "rag-service-7d8f9c-abc12" |
| `k8s.node.name` | Host.hostname | "node-gpu-03" |
| `container.id` | Container ID | "sha256:abc..." |
| `db.system` | Database.type | "postgresql" |
| `db.name` | Database.endpoint (DB명) | "demodb" |
| `server.address` | Database.endpoint (호스트) | "prod-db-01" |
| `db.statement` | Slow Query 수집 | "SELECT * FROM..." |
| `ai.pipeline.name` | ServiceGroup.name | "RAG Pipeline" |
| `ai.pipeline.stage` | 워터폴 스테이지 | "embedding" |

---

## 8. 구현 로드맵

### Phase E1: Database 엔티티 (2주)

```
• Database 엔티티 모델 + API (/api/v1/databases)
• Trace span의 db.system/db.name에서 자동 감지 + Service 연결
• DB Detail 대시보드 (Connection Pool, Slow Queries, Lock)
• Service Detail에 DB 탭 추가 (이 서비스가 사용하는 DB)
• Dependency Graph에 DB 노드 추가
```

### Phase E2: K8s 통합 (3주)

```
• K8sCluster, K8sWorkload 엔티티 모델 + API
• Agent DaemonSet으로 Node+Pod 메트릭 수집 (kubelet/cAdvisor)
• Collection Server K8s API Watcher (Pod Event, Deployment Status)
• K8s Dashboard (Cluster/Namespace/Workload/Pod/Node/Events 탭)
• Pod → Instance 자동 매핑 (OTel k8s.pod.name)
• Node → Host 자동 매핑 (hostname 일치)
```

### Phase E3: Topology 고도화 (2주)

```
• 자체 Dependency Graph 엔진 (Trace span parent-child에서 추출)
• Service Map 시각화 고도화 (트래픽 두께, 에러율 색상, DB 노드 포함)
• 화살표 클릭 → 두 서비스 간 트레이스 목록
• DB 노드 클릭 → DB Detail 드릴다운
• 시간 범위 변경 시 토폴로지 변화 애니메이션
```

### Phase E4: Business Transaction (1주)

```
• BusinessTransaction 엔티티 + 관리 UI
• 사용자 정의: "entry_service + entry_operation"으로 트랜잭션 그룹 생성
• 자동 집계: 해당 entry로 시작하는 모든 Trace의 E2E 통계
• SLO 연동: 트랜잭션 그룹별 SLO 설정/추적
```

### Phase E5: 드릴다운 동선 통합 (1주)

```
• 모든 대시보드 레벨 간 클릭 이동 구현
• Service → DB, Service → K8s Pod, K8s Pod → Host 연결
• 빵크럼(breadcrumb) 통합: Project > Service > Instance > Host
• Global Search: 서비스명/호스트명/DB명/Pod명으로 어디서든 검색
```

---

## 9. 요약 — 전체 대시보드 매핑

| 대시보드 레벨 | 대상 사용자 | 주요 KPI | 데이터 소스 | 드릴다운 |
|-------------|-----------|---------|-----------|---------|
| **Executive** | CTO, 임원 | SLA, 비용, 장애 MTTR | 모든 레이어 집계 | → 각 레이어 |
| **AI Service** (L6) | AI 팀 리드 | 성공률, TTFT, TPS, 비용 | Trace + Metric 집계 (ai.pipeline 태그) | → Service Detail |
| **Service Map** (L5) | 아키텍트, SRE | 호출 관계, 에러 전파 | Trace parent-child 자동 생성 | → Service/DB Detail |
| **Service Detail** (L4) | 개발자, SRE | RPM, P95, Error Rate | Golden Signals (Metric Engine) | → Instance, Trace, DB |
| **Database** (L3) | DBA | Query Latency, Pool, Lock | DB 메트릭 + Trace db.* span | → Slow Query → Trace |
| **K8s Cluster** (L2) | 인프라 엔지니어 | Pod Ready %, Resource % | K8s API + Agent (kubelet) | → Pod → Service, Node → Host |
| **Host** (L1) | 시스템 엔지니어 | CPU, Mem, Disk, GPU | Agent OS 수집 | → Process → Service Instance |

---

> **이 문서는 엔티티 계층 모델 v2 설계서이며, 검토 후 구현 우선순위를 결정합니다.**
