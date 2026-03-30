# AITOP v1.0 릴리스 TO-DO — 작업 현황판

> **목표**: v1.0 상용 릴리스 (엔터프라이즈 프로덕션 배포 가능 수준)
> **현재 버전**: v0.9.0-rc.1 (Phase 1~40 + L1+L2 완료)
> **작성일**: 2026-03-29 (2026-03-30 WS-8 추가 — 외부 검토의견 반영)
> **기준 문서**: ARCHITECTURE_REVIEW_v2, ENTITY_HIERARCHY_DESIGN_v2, BATCH_MONITORING_ANALYSIS, LIVE_MODE_TODO, COMPLETION_ROADMAP, DEFECT_TRACKER, REVIEW_OPINIONS_v1.0_READINESS

---

## 전체 진행 현황

```
v0.9.0-rc.1 (현재)                                        v1.0 릴리스
    │                                                          │
    ├── WS-8  문서 정합성 + v1.0 Readiness ★최우선★   ░░░░░░░░ │ ← Phase 0 (NEW)
    ├── WS-1  자체 스토리지 엔진 (Prom/Jaeger 제거)     ░░░░░░░░ │
    ├── WS-2  엔티티 계층 확장 (K8s/DB/BizTx)          ░░░░░░░░ │
    ├── WS-3  대규모 배치 성능 최적화                     ░░░░░░░░ │
    ├── WS-3A XLog/HeatMap 강화                         ░░░░░░░░ │
    ├── WS-4  Live 모드 잔여 페이지 전환                 ██████░░ │
    ├── WS-5  품질 안정화 + 결함 수정                     ██░░░░░░ │
    ├── WS-6  통합 테스트 + 데모 리허설                  ░░░░░░░░ │
    ├── WS-7  상용 패키징 + 문서 최종화                  ░░░░░░░░ │
    │                                                          │
    ▼──────────────────────────────────────────────────────────▼
```

---

## WS-1: 자체 스토리지 엔진 — Prometheus/Jaeger 제거

> **설계 문서**: [ARCHITECTURE_REVIEW_v2.md](./ARCHITECTURE_REVIEW_v2.md)
> **목표**: 외부 의존성 제거, 설치 간소화 (8 컨테이너 → 3), 데이터 지연 15초 → <3초

### WS-1.1 OTLP Receiver 내장 (Phase S1) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S1-1 | gRPC 서버에 OTLP TraceService / MetricsService 등록 | ☐ | protobuf 직접 디코딩 방식 |
| S1-2 | HTTP 엔드포인트 /v1/traces, /v1/metrics 추가 | ☐ | 기존 :8080 서버에 통합 |
| S1-3 | protobuf → 내부 모델 변환 레이어 | ☐ | Span, MetricPoint 구조체 |
| S1-4 | Backpressure Queue (Ring Buffer, 1M 이벤트) | ☐ | Go channel + overflow 샘플링 |
| S1-5 | Fan-out (Metric Engine / Trace Engine 분배) | ☐ | 배치 단위 병렬 기록 |
| S1-6 | 기존 OTel Collector 설정 → AITOP 마이그레이션 가이드 | ☐ | 문서 |

### WS-1.2 Trace Engine (Phase S2) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S2-1 | 인메모리 트레이스 링버퍼 (100K건, 4시간) | ☐ | 서비스별 역인덱스 포함 |
| S2-2 | SQLite traces/spans 테이블 + FTS5 인덱스 | ☐ | 일별 파티셔닝 (Warm 30일) |
| S2-3 | /api/v2/traces 검색 API (서비스, 기간, 상태, 태그) | ☐ | |
| S2-4 | /api/v2/traces/{traceId} 상세 조회 (스팬 트리) | ☐ | |
| S2-5 | XLog 산점도 데이터 API (/api/v2/traces/xlog) | ☐ | timestamp, duration, status 캐시 |
| S2-6 | 서비스 목록 자동 인덱스 + 의존성 그래프 자동 추출 | ☐ | trace parent-child에서 추출 |
| S2-7 | Cold Tier: Warm → S3 Parquet 아카이브 크론 | ☐ | 1년+ 보관 |

### WS-1.3 Metric Engine (Phase S3) — 3주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S3-1 | 인메모리 시계열 링버퍼 (4시간, Sharded RWMutex) | ☐ | |
| S3-2 | SQLite 시계열 테이블 + 라벨 인덱스 (Warm 7~90일) | ☐ | |
| S3-3 | 자체 쿼리 API (/api/v2/metrics/query) | ☐ | JSON 기반 |
| S3-4 | 집계 함수: rate, sum, avg, max, min, percentile | ☐ | |
| S3-5 | 다운샘플링 크론 (원본→1분→1시간) | ☐ | |
| S3-6 | 알림 규칙 평가 엔진 | ☐ | 기존 Prometheus alert rules 대체 |
| S3-7 | PromQL 기본 파서 (핵심 함수 20개) | ☐ | 커스텀 대시보드 호환 |
| S3-8 | Cold Tier: S3 Parquet 아카이브 | ☐ | |

### WS-1.4 Frontend 전환 (Phase S4) — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S4-1 | /proxy/prometheus/* → /api/v2/metrics/* 전환 | ☐ | |
| S4-2 | /proxy/jaeger/* → /api/v2/traces/* 전환 | ☐ | |
| S4-3 | useDataSource 훅에서 v2 API 우선 호출 | ☐ | |
| S4-4 | 기존 프록시 API deprecated 처리 | ☐ | |

### WS-1.5 외부 연동 호환 (Phase S5) — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S5-1 | Prometheus Remote Write 수신 엔드포인트 | ☐ | 기존 Prom 데이터 통합 |
| S5-2 | OTLP Export (외부 Jaeger/Grafana 복제) | ☐ | 선택 기능 |
| S5-3 | /metrics 엔드포인트 (자체 메트릭 노출) | ☐ | |

### WS-1.6 PostgreSQL 백엔드 (Phase S6) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S6-1 | PostgreSQL 스토리지 어댑터 (metrics/traces/spans) | ☐ | |
| S6-2 | 일별 파티셔닝 자동 생성 + 만료 DROP | ☐ | |
| S6-3 | 보관 정책 엔진 (Critical/Slow/Normal/Health 등급) | ☐ | 스마트 보관 점수 |
| S6-4 | storage.mode: auto 감지 → PostgreSQL 전환 권고 | ☐ | |

### WS-1.7 수평 확장 + ClickHouse (Phase S7) — 3주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| S7-1 | Ingestion Node 분리 (Stateless, K8s Deployment) | ☐ | |
| S7-2 | ClickHouse 스토리지 어댑터 | ☐ | ReplicatedMergeTree |
| S7-3 | Query Router (Hot/Warm/Cold 자동 분배) | ☐ | |
| S7-4 | 무중단 백엔드 마이그레이션 (dual-write) | ☐ | |
| S7-5 | Helm Chart 클러스터 모드 values | ☐ | |

---

## WS-2: 엔티티 계층 확장 — K8s, Database, 비즈니스 트랜잭션

> **설계 문서**: [ENTITY_HIERARCHY_DESIGN_v2.md](./ENTITY_HIERARCHY_DESIGN_v2.md), [ENTITY_RELATIONSHIP_DESIGN.md](./ENTITY_RELATIONSHIP_DESIGN.md)
> **목표**: 6-Layer 모니터링 모델 완성 (Infra ~ AI Service)

### WS-2.1 Database 엔티티 (Phase E1) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| E1-1 | Database 엔티티 모델 + /api/v1/databases API | ☐ | PG/MySQL/Redis/Qdrant/Kafka |
| E1-2 | Trace span db.*/server.address에서 자동 감지 | ☐ | Service↔DB N:M 관계 |
| E1-3 | DB Detail 대시보드 (Connection Pool, Slow Queries, Lock) | ☐ | |
| E1-4 | Service Detail에 DB 탭 추가 | ☐ | |
| E1-5 | Dependency Graph에 DB 노드 추가 | ☐ | |

### WS-2.2 Kubernetes 통합 (Phase E2) — 3주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| E2-1 | K8sCluster, K8sWorkload 엔티티 + API | ☐ | |
| E2-2 | Agent DaemonSet: Node+Pod 메트릭 수집 (kubelet/cAdvisor) | ☐ | |
| E2-3 | Collection Server K8s API Watcher | ☐ | Pod Event, Deployment Status |
| E2-4 | K8s Dashboard (Cluster/Namespace/Workload/Pod/Node/Events) | ☐ | 6개 탭 |
| E2-5 | Pod → Instance 자동 매핑 (k8s.pod.name) | ☐ | |
| E2-6 | Node → Host 자동 매핑 (hostname) | ☐ | |

### WS-2.3 Topology 고도화 (Phase E3) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| E3-1 | 자체 Dependency Graph 엔진 (Trace 기반) | ☐ | Jaeger 의존 제거 |
| E3-2 | Service Map 시각화 (트래픽 두께, 에러 색상, DB 노드) | ☐ | |
| E3-3 | 화살표 클릭 → 두 서비스 간 트레이스 목록 | ☐ | |
| E3-4 | 시간 범위 변경 시 토폴로지 변화 표시 | ☐ | |

### WS-2.4 Business Transaction (Phase E4) — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| E4-1 | BusinessTransaction 엔티티 + CRUD API | ☐ | |
| E4-2 | entry_service + entry_operation 기반 자동 집계 | ☐ | |
| E4-3 | SLO 연동 (트랜잭션 그룹별 SLO 추적) | ☐ | |

### WS-2.5 드릴다운 통합 (Phase E5) — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| E5-1 | 전 레이어 간 클릭 이동 구현 | ☐ | Service→DB, Pod→Host 등 |
| E5-2 | 빵크럼 통합 (Project > Service > Instance > Host) | ☐ | |
| E5-3 | Global Search (서비스/호스트/DB/Pod명 검색) | ☐ | |

---

## WS-3: 대규모 배치 성능 최적화

> **설계 문서**: [BATCH_MONITORING_ANALYSIS.md](./BATCH_MONITORING_ANALYSIS.md) §4
> **목표**: 배치 모니터링 + 성능 자동 분석 + 최적화 권고 (경쟁사 대비 유일 기능)

### WS-3.1 SQL 병목 자동 분석 (Phase 39-1) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| 39-1-1 | SQL Pareto 분석 (총 시간 비중 순위) | ☐ | |
| 39-1-2 | EXPLAIN 자동 수집 (PostgreSQL/MySQL) | ☐ | |
| 39-1-3 | N+1 패턴 자동 감지 | ☐ | 동일 SQL 건수만큼 반복 |
| 39-1-4 | 인덱스 누락 탐지 + 추가 권고 | ☐ | EXPLAIN의 Seq Scan 감지 |
| 39-1-5 | 불필요 조회 감지 (SELECT 결과 미사용) | ☐ | |

### WS-3.2 청크/병렬화 분석 (Phase 39-2) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| 39-2-1 | 청크 크기별 처리 속도 곡선 분석 | ☐ | |
| 39-2-2 | 최적 청크 크기 계산 (메모리 제한 내) | ☐ | |
| 39-2-3 | Step 간 의존성 분석 → 병렬화 기회 탐지 | ☐ | |
| 39-2-4 | 데이터 파티셔닝 분할 권고 | ☐ | 날짜/계좌 기반 |
| 39-2-5 | Worker 수 최적화 권고 | ☐ | |

### WS-3.3 회귀 분석 + SLA 예측 (Phase 39-3) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| 39-3-1 | 실행 시간 트렌드 분석 (30~90일) | ☐ | 선형/지수 회귀 |
| 39-3-2 | 데이터 건수 증가 ↔ 실행 시간 상관관계 | ☐ | |
| 39-3-3 | 변곡점 감지 (배포/DB 변경과 연관) | ☐ | |
| 39-3-4 | SLA 위반 예측 (N일 후 임계치 초과) | ☐ | |

### WS-3.4 리소스 효율 + 비교 + 리포트 (Phase 39-4~5) — 3주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| 39-4-1 | CPU/IO 바운드 판별 + 스레드 수 권고 | ☐ | |
| 39-4-2 | DB 커넥션 풀 사용률 분석 + 풀 크기 권고 | ☐ | |
| 39-4-3 | GC 과다 여부 + 힙 튜닝 권고 | ☐ | |
| 39-5-1 | 정상 vs 이상 실행 비교 분석 | ☐ | |
| 39-5-2 | 배포 전후 성능 비교 | ☐ | |
| 39-5-3 | 자동 최적화 리포트 생성 (성능 등급 A~F) | ☐ | |

### WS-3.5 장시간 배치 실시간 뷰 (Phase 39-6) — 2주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| 39-6-1 | 실시간 진행률 (처리건수/총건수, 예상 완료 시간) | ☐ | |
| 39-6-2 | Step별 현황 (진행/대기/완료 상태) | ☐ | |
| 39-6-3 | 실시간 처리 속도 트렌드 차트 | ☐ | |
| 39-6-4 | 실시간 SQL Top-N + 이상 감지 | ☐ | |

---

## WS-3A: XLog/HeatMap 강화

> **설계 문서**: [XLOG_DASHBOARD_REDESIGN.md](./XLOG_DASHBOARD_REDESIGN.md)
> **현황**: 기본 구현 완료, 실데이터 연동·드릴다운·실시간성에 문제 다수
> **의존성**: WS-1.2 (Trace Engine) 완료 후 v2 API로 최종 전환

### WS-3A.1 XLog 실데이터 정상화 — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| XL-1 | 복수 서비스 동시 트레이스 조회 | ☐ | 현재 1개만 쿼리 → 선택된 N개 서비스 병렬 fetch |
| XL-2 | Jaeger 응답 → 루트 스팬만 XLog 점으로 표시 (하위 스팬 제외) | ☐ | parent 없는 span만 필터 |
| XL-3 | Live 모드에서 Jaeger 데이터 없을 때 빈 상태 표시 (데모 폴백 방지) | ☐ | useDataSource 모드 존중 |
| XL-4 | 서버별 색상 분리 (멀티 서비스 선택 시 서비스별 컬러) | ☐ | 구현은 있으나 실데이터 미적용 |

### WS-3A.2 드래그 선택 + 드릴다운 — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| XL-5 | XLog 브러시 이벤트 → 트랜잭션 리스트 패널 연동 | ☐ | ECharts brushSelected 핸들러 구현 |
| XL-6 | HeatMap 셀 클릭 → 해당 시간+레이턴시 구간 트랜잭션 필터링 | ☐ | 셀 좌표 → 트랜잭션 범위 변환 |
| XL-7 | 선택 영역 표시: "N건 선택됨 (시간 범위, 레이턴시 범위)" | ☐ | |
| XL-8 | 트랜잭션 클릭 → 워터폴 타임라인 바 차트 (현재 테이블 → 바 차트) | ☐ | ECharts 가로 바 차트 |
| XL-9 | 워터폴에서 스팬 클릭 → 속성 상세 + 트레이스 상세 페이지 이동 | ☐ | |

### WS-3A.3 HeatMap 고도화 — 1주

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| XL-10 | HeatMap 에러 셀 시각 구분 (에러 비율 높은 셀에 ✕ 마커) | ☐ | 현재 errorDots 계산만 |
| XL-11 | HeatMap 드래그 선택 → XLog와 동일 트랜잭션 리스트 연동 | ☐ | |
| XL-12 | 시간대별 TPS 오버레이 바 차트 (HeatMap 상단) | ☐ | WhaTap 스타일 |
| XL-13 | 분할 뷰 (XLog + HeatMap 동시 표시) 동기화 | ☐ | 시간 범위 + 선택 영역 양방향 동기화 |

### WS-3A.4 v2 Trace Engine 전환 — WS-1.2 완료 후

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| XL-14 | /proxy/jaeger/* → /api/v2/traces/* API 전환 | ☐ | WS-1.2 의존 |
| XL-15 | /api/v2/traces/xlog 전용 API (경량 필드만 반환) | ☐ | timestamp, duration, status, service만 |
| XL-16 | 실시간 SSE/WebSocket 스트리밍 (5초 폴링 → 실시간 push) | ☐ | 대시보드 실시간성 대폭 향상 |
| XL-17 | 시간 범위 확대 시 다운샘플링 (1시간+ → 버킷 집계) | ☐ | 대량 트랜잭션 성능 보장 |

---

## WS-4: Live 모드 잔여 페이지 전환

> **설계 문서**: [LIVE_MODE_TODO.md](./LIVE_MODE_TODO.md)
> **현황**: 67개 중 57개 Live 완료 (85%). 나머지 10개 + Demo Only 31개 페이지 전환 필요

### WS-4.1 P0 — 핵심 데모 시나리오 (8개 페이지)

| # | 페이지 | 상태 | 필요 API |
|---|--------|:----:|---------|
| L-01 | /batch/[name] | ☐ | `/batch/{name}/executions` |
| L-02 | /batch/executions/[id] | ☐ | `/batch/executions/{id}` |
| L-03 | /batch/xlog | ☐ | `/batch/xlog/data` |
| L-04 | /batch/alerts | ☐ | `/batch/alerts/rules` |
| L-05 | /traces/[traceId] | ☐ | v2 Trace Engine 의존 |
| L-06 | /ai/[id] | ☐ | `/ai/services/{id}` |
| L-07 | /ai/evaluation | ☐ | `/genai/evals` |
| L-08 | /ai/gpu | ☐ | Agent GPU Collector |

### WS-4.2 P1 — 인프라/에이전트 (7개 페이지)

| # | 페이지 | 상태 |
|---|--------|:----:|
| L-09 | /infra/cache | ☐ |
| L-10 | /infra/middleware | ☐ |
| L-11 | /infra/middleware/connection-pool | ☐ |
| L-12 | /infra/queues | ☐ |
| L-13~15 | /agents/plugins, plugins/[name], groups/[id] | ☐ |

### WS-4.3 P2~P4 — 나머지 (16개 페이지)

| # | 페이지 | 상태 |
|---|--------|:----:|
| L-16~18 | /ai/prompts, training, training/[id] | ☐ |
| L-19~23 | /profiling/*, /runtime/* | ☐ |
| L-24~31 | /golden-signals, /rum, /database, /executive, /costs, /notebooks, /tenants, /dashboards | ☐ |

---

## WS-5: 품질 안정화 + 결함 수정

> **설계 문서**: [COMPLETION_ROADMAP.md](./COMPLETION_ROADMAP.md) Phase Q, [DEFECT_TRACKER.md](./DEFECT_TRACKER.md)

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| Q-1 | 전 페이지 null safety 전수 점검 + 수정 | ☐ | |
| Q-2 | Live 모드 "데이터 없음" 빈 상태 UI 통일 | ☐ | |
| Q-3 | API 에러 핸들링 (timeout, 5xx, network) | ☐ | |
| Q-4 | useDataSource 무한 루프 추가 방어 | ☐ | |
| Q-5 | Auth middleware 전체 경로 정리 | ☐ | |
| Q-6 | ECharts resize/destroy 메모리 누수 점검 | ☐ | |
| Q-7 | 로딩 스피너 + Skeleton UI 통일 | ☐ | |
| D-007 | Windows Agent Network I/O 첫 수집 0 | 🔧 | 설계상 정상, 문서화 |
| D-008 | Linux 컨테이너 Agent Disk/Process 제한 | ☐ | privileged 모드 가이드 |
| D-021 | Frontend dev 서버 포트 잔존 | 🔧 | 워크어라운드 문서화 |

---

## WS-6: 통합 테스트 + 데모 리허설

> **설계 문서**: [COMPLETION_ROADMAP.md](./COMPLETION_ROADMAP.md) Phase T

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| T-1 | 전체 환경 기동 + 10분 시나리오 리허설 | ☐ | demo-site 5개 앱 전체 |
| T-2 | 전체 환경 기동 + 20분 시나리오 리허설 | ☐ | |
| T-3 | 발견 이슈 수정 | ☐ | 리허설 후 |
| T-4 | 성능 테스트 (k6 부하 + 대시보드 반응) | ☐ | |
| T-5 | Go/Java OTel 트레이스 Jaeger 전송 검증 | ☐ | 현재 미해결 |
| T-6 | 전체 67개 페이지 스크린샷 검증 | ☐ | |

---

## WS-7: 상용 패키징 + 문서 최종화

> **설계 문서**: [COMPLETION_ROADMAP.md](./COMPLETION_ROADMAP.md) Phase P

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| P-1 | Docker 이미지 빌드 (CS + Frontend + Agent) | ☐ | |
| P-2 | docker-compose.production.yaml 완성 | ☐ | v2 아키텍처 반영 |
| P-3 | Helm Chart 업데이트 (v1.0) | ☐ | 클러스터 모드 포함 |
| P-4 | 설치 가이드 최종 검증 (Win/Mac/K8s) | ☐ | |
| P-5 | 릴리스 노트 v1.0 작성 | ☐ | |
| P-6 | THIRD_PARTY_LICENSES 최종 검증 | ☐ | AGPL-free 확인 |
| P-7 | API Reference 문서 생성 | ☐ | v2 API 포함 |
| P-8 | 운영 가이드 최종 검증 (백업, 복구, 업그레이드) | ☐ | |

---

## WS-8: 문서 정합성 + v1.0 Readiness 확보

> **근거 문서**: [REVIEW_OPINIONS_v1.0_READINESS.md](./DOCS/REVIEW_OPINIONS_v1.0_READINESS.md)
> **목표**: 문서-현실 일치성 확보, 릴리스 기준 명확화, 증빙 구조 구축
> **배경**: 외부 검토(GPT5.4)에서 문서 간 상태 표현 불일치, 증빙 부재, 릴리스 게이트 미정의 등이 지적됨

### WS-8.1 P0 — 문서 간 상태 표현 통일 (즉시)

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| R-01 | `SOLUTION_STRATEGY.md` "v1.0.0 릴리스 준비 완료" → "v1.0 설계 완료, 릴리스 실행 과제 진행 중"으로 수정 | ☐ | §3.1 — 가장 심각한 불일치 |
| R-02 | `README.md` Phase별 "100% 완료" 표현을 "설계/시연 완료"와 "상용 릴리스 완료"로 구분 | ☐ | §3.1 — 외부 신뢰도 직결 |
| R-03 | `ARCHITECTURE.md` 상단에 As-Is(현재 v0.9 구조) / To-Be(v1.0 목표) / Transition Plan 구분 섹션 추가 | ☐ | §3.2 — 현재/목표 혼재 해소 |
| R-04 | `ARCHITECTURE_REVIEW_v2.md` 상단에 "본 문서는 권고안이며, 현재 운영 구조가 아님" 명시 | ☐ | §3.2 — 독자 혼동 방지 |
| R-05 | 전 핵심 문서(README, ARCHITECTURE, SOLUTION_STRATEGY)에서 버전 표기를 `v0.9.0-rc.1`로 통일 | ☐ | 현재 상태 정확 반영 |

### WS-8.2 P0 — README 역할 재구성 (즉시)

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| R-06 | `README.md`를 "빠른 시작 + 현황 + 배포 기준" 중심으로 간소화 | ☐ | §3.4 — 비전/경쟁 우위 내용 분리 |
| R-07 | 비전/경쟁 우위/전략 내용을 `DOCS/PRODUCT_OVERVIEW.md`로 이동 | ☐ | §3.4 — 영업/기술 문서 역할 분리 |
| R-08 | README에 "현재 동작하는 것 / 실행 방법 / 권장 모드" 섹션 명확화 | ☐ | §3.4 — 신규 사용자 진입 장벽 감소 |

### WS-8.3 P1 — v1.0 릴리스 기준 정의

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| R-09 | `DOCS/V1_RELEASE_CRITERIA.md` 신규 작성 | ☐ | §3.5 — 릴리스 게이트 정의 |
| R-10 | ↳ 필수 완료 워크스트림 목록 (WS-1~7 중 v1.0 필수 범위) | ☐ | |
| R-11 | ↳ 성능 기준 (ingest throughput, UI P95, 에이전트 오버헤드) | ☐ | |
| R-12 | ↳ 안정성 기준 (장애 복구, 재기동, 데이터 정합성) | ☐ | |
| R-13 | ↳ 테스트 통과 기준 + Known Issues 허용 범위 | ☐ | |
| R-14 | ↳ 문서/배포 기준 (설치 가이드, API 문서, 라이선스) | ☐ | |

### WS-8.4 P1 — 수치 증빙 + 근거 태그 추가

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| R-15 | 전 문서의 성능 수치에 출처 태그 추가 (실측/PoC/추정/설계목표) | ☐ | §5.3 — 출처 없는 숫자 신뢰 하락 |
| R-16 | "Datadog 수준", "세계 최고", "글로벌 표준" 표현에 증빙 근거 연결 | ☐ | §3.3 — 근거 없는 선언 방지 |
| R-17 | 즉시 측정 가능한 벤치마크 항목 목록 정의 (ingest, UI P95, agent overhead) | ☐ | §3.3 — 증빙형 제품 전환 기반 |

### WS-8.5 P1 — 스토리지 전환 전략 문서화

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| R-18 | `DOCS/STORAGE_MIGRATION_STRATEGY.md` 신규 작성 | ☐ | §4.1 — 가장 큰 기술 전환 리스크 |
| R-19 | ↳ dual-write 기준 + fallback/rollback 전략 | ☐ | |
| R-20 | ↳ 데이터 정합성 검증 항목 + 쿼리 결과 diff 허용 범위 | ☐ | |
| R-21 | ↳ 고객 환경별 migration playbook | ☐ | |
| R-22 | ↳ 성능 테스트 시나리오 + 장애 시 복구 절차 | ☐ | |

### WS-8.6 P2 — 경쟁 분석 보강 + 엔터프라이즈 문서 (향후)

| # | 작업 | 상태 | 비고 |
|---|------|:----:|------|
| R-23 | `COMPETITIVE_ANALYSIS.md`에 TCO 비교, 전환 비용, 온프레미스 적합성 섹션 추가 | ☐ | §4.2 — 기존 시나리오 가이드는 양호, 보강만 |
| R-24 | `DOCS/ENTERPRISE_READINESS.md` 신규 작성 (HA/DR, backup, RBAC, audit, compliance) | ☐ | §4.5 — 대형 고객 신뢰 확보 |
| R-25 | `DOCS/PERFORMANCE_BENCHMARKS.md` 신규 작성 (실측 후) | ☐ | §6.3 — 증빙형 제품 전환 |
| R-26 | 핵심 차별화 메시지 3개 확정 + 전 문서 반영 | ☐ | §4.3, §6.1 — 전략 회의 후 확정 |

---

## 작업 순서 (의존성 기반)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          v1.0 릴리스 크리티컬 패스 (개정판 — 문서 정합성 반영)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 0 (Week 0~1):  ★★★ 문서 정합성 + 릴리스 기준 확립 (최우선)
─────────────────────────────────────────────
  WS-8.1 문서 간 상태 표현 통일 (1~2일)  ← P0: 즉시, 코드 작업 차단 없음
  WS-8.2 README 역할 재구성 (2~3일)      ← P0: 즉시, 외부 신뢰도 직결
  WS-8.3 V1_RELEASE_CRITERIA.md 작성 (2일) ← P1: 릴리스 게이트 없으면 완료 판단 불가
  WS-8.4 수치 증빙 + 근거 태그 추가 (2일)  ← P1: Phase 1 코드 작업과 병행

  ※ Phase 0은 코드 작업(Phase 1)과 병행 가능. 문서 담당자 별도 배정 권장.

Phase 1 (Week 1~4):  ★ 자체 스토리지 기반 구축
─────────────────────────────────────────────
  WS-8.5 STORAGE_MIGRATION_STRATEGY.md 작성  ← WS-1 착수 전 또는 동시 진행
  WS-1.1 OTLP Receiver (2주)     ← 최우선: OTel Collector 제거
  WS-1.2 Trace Engine (2주)      ← Jaeger 제거 (가장 문제 많음)
    ↓ (Trace Engine 완성 후)
  WS-4.1 L-05 traces/[traceId]   ← Trace Engine 의존

Phase 2 (Week 3~6):  ★ 메트릭 + 엔티티 + XLog 병행
─────────────────────────────────────────────
  WS-1.3 Metric Engine (3주)     ← Prometheus 제거
  WS-2.1 Database 엔티티 (2주)   ← 병행 가능
  WS-3A.1~3 XLog/HeatMap 강화 (3주) ← Trace Engine 이후 즉시 가능
    ↓
  WS-1.4 Frontend 전환 (1주)     ← Metric + Trace Engine 의존
  WS-3A.4 XLog v2 API 전환       ← Trace Engine 전환과 동시

Phase 3 (Week 7~9):  ★ K8s + Topology + 비즈니스 트랜잭션
─────────────────────────────────────────────
  WS-2.2 K8s 통합 (3주)
  WS-2.3 Topology 고도화 (2주)   ← Trace Engine 의존
  WS-2.4 Business Transaction (1주)

Phase 4 (Week 8~12): ★ 배치 최적화 (병행)
─────────────────────────────────────────────
  WS-3.1 SQL 병목 분석 (2주)
  WS-3.2 청크/병렬화 분석 (2주)
  WS-3.3 회귀 분석 + SLA 예측 (2주)
  WS-3.4 리소스 + 비교 + 리포트 (3주)
  WS-3.5 장시간 배치 실시간 뷰 (2주)

Phase 5 (Week 10~13): ★ Live 전환 + 대규모 지원
─────────────────────────────────────────────
  WS-4.1~4.3 Live 모드 잔여 31개 페이지
  WS-1.5 외부 연동 호환 (1주)
  WS-1.6 PostgreSQL 백엔드 (2주)
  WS-2.5 드릴다운 통합 (1주)

Phase 6 (Week 13~14): ★ 수평 확장 (Enterprise)
─────────────────────────────────────────────
  WS-1.7 수평 확장 + ClickHouse (3주)  ← v1.0에서 선택적

Phase 7 (Week 14~16): ★ 품질 + 테스트 + 릴리스
─────────────────────────────────────────────
  WS-5 품질 안정화 (2주)
  WS-6 통합 테스트 + 리허설 (1주)
  WS-7 상용 패키징 + 문서 (2주)
  WS-8.6 경쟁 분석 보강 + 엔터프라이즈 문서  ← WS-7과 병행, v1.0 GA 시점

─────────────────────────────────────────────
  ※ Phase 0(문서)은 Phase 1~2(코드)와 병행 가능 — 별도 트랙
  ※ WS-8.5(전환 전략)는 WS-1 착수 전 완료가 이상적
  ※ WS-8.6(P2 문서)은 구현 완료 후 작성해야 정확 — Phase 7에 배치
```

---

## 일정 요약

| Phase | 기간 | 핵심 산출물 | 마일스톤 |
|-------|------|-----------|---------|
| **Phase 0** | **Week 0~1** | **문서 정합성 + 릴리스 기준** | **문서-현실 정렬 완료** |
| Phase 1 | Week 1~4 | OTLP 수신 + Trace Engine + 전환 전략 | Jaeger 제거 완료 |
| Phase 2 | Week 3~6 | Metric Engine + DB 엔티티 | Prometheus 제거 완료 |
| Phase 3 | Week 7~9 | K8s + Topology + BizTx | 6-Layer 모델 완성 |
| Phase 4 | Week 8~12 | 배치 최적화 6종 | 배치 성능 자동 분석 |
| Phase 5 | Week 10~13 | Live 전환 + PostgreSQL | 전 페이지 실데이터 |
| Phase 6 | Week 13~14 | ClickHouse + 수평 확장 | Enterprise 대응 (선택) |
| Phase 7 | Week 14~16 | 품질 + 테스트 + 패키징 + 엔터프라이즈 문서 | **v1.0 릴리스** |

**총 예상 기간: 16주 (4개월)** — Phase 0은 Phase 1과 병행으로 추가 기간 없음
- **Phase 0 (문서 정합성)**: Week 0~1 — 코드 작업과 병행, 별도 트랙
- v1.0-rc.2 (Phase 1~5 완료): **Week 13 (3개월)**
- v1.0 GA (Phase 7 완료): **Week 16 (4개월)**
- Enterprise Edition (Phase 6 포함): **Week 16+ (병행)**

---

## 작업량 통계

| 워크스트림 | 작업 수 | 예상 기간 | 트랙 |
|----------|--------|----------|------|
| **WS-8 문서 정합성 + Readiness** | **26건** | **1주** | **문서 (병행)** |
| WS-1 자체 스토리지 | 30건 | 14주 | 코드 |
| WS-2 엔티티 확장 | 20건 | 9주 | 코드 |
| WS-3 배치 최적화 | 19건 | 11주 | 코드 |
| WS-3A XLog/HeatMap 강화 | 17건 | 3주 (+v2 전환 1주) | 코드 |
| WS-4 Live 전환 | 31건 | 4주 | 코드 |
| WS-5 품질 안정화 | 10건 | 2주 | 코드 |
| WS-6 통합 테스트 | 6건 | 1주 | 코드 |
| WS-7 상용 패키징 | 8건 | 2주 | 코드+문서 |
| **합계** | **167건** | **16주 (병행)** | |

---

> **이 문서는 v1.0 릴리스까지의 전체 작업 현황판이며, 진행 상황에 따라 지속 업데이트합니다.**
> **상태 표기**: ☐ 미착수 / 🔧 진행중 / ✅ 완료 / ⏸ 보류
> **2026-03-30 개정**: 외부 검토의견(REVIEW_OPINIONS_v1.0_READINESS.md) 반영하여 WS-8(문서 정합성) 추가, Phase 0 신설
