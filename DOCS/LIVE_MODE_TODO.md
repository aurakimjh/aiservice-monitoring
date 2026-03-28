# Live 모드 전수 점검 — 개선 TODO

> **작성일**: 2026-03-28 / **업데이트**: 2026-03-28
> **목적**: 모든 페이지가 Live 모드에서 실데이터로 동작하도록 개선
> **현황**: 67개 페이지 중 57개 Live 지원 (85%) — Phase L1+L2 완료

---

## 1. 현황 요약

```
Live 지원:   57개  █████████████████████░  85%  ← Phase L1+L2 완료
정적/설정:   10개  █████░░░░░░░░░░░░░░░░░  15%  (settings, runtime hub 등)
```

**Phase L1 (핵심 16페이지)**: ✅ 완료 — 배치/트레이스/AI/인프라/Agent
**Phase L2 (상세 16페이지)**: ✅ 완료 — 프로파일링/런타임/Training/Golden Signals/RUM/DB/Executive

---

## 2. 우선순위별 TODO

### P0 — 데모 시나리오 핵심 (즉시 필요)

| # | 페이지 | 현재 | 필요 API | 작업 |
|---|--------|------|---------|------|
| L-01 | /batch/[name] | Demo Only | `/batch/{name}/executions` | 배치 작업 상세 실데이터 (Celery task 이력) |
| L-02 | /batch/executions/[id] | Demo Only | `/batch/executions/{id}` | 배치 실행 상세 (SQL/Method 프로파일) |
| L-03 | /batch/xlog | Demo Only | `/batch/xlog/data` | 배치 XLog 산점도 (30일 실행 이력) |
| L-04 | /batch/alerts | Demo Only | `/batch/alerts/rules` | 배치 알림 규칙 + 이력 |
| L-05 | /traces/[traceId] | Demo Only | Jaeger `/traces/{traceId}` | 트레이스 상세 워터폴 (Jaeger 프록시) |
| L-06 | /ai/[id] | Demo Only | `/ai/services/{id}` | AI 서비스 상세 (LLM 메트릭 + RAG 단계) |
| L-07 | /ai/evaluation | Demo Only | `/genai/evals`, `/genai/eval-summary` | 품질 평가 대시보드 (API 이미 존재) |
| L-08 | /ai/gpu | Demo Only | Agent GPU 메트릭 | GPU 클러스터 뷰 실데이터 |

### P1 — 인프라/에이전트 상세 (운영 필수)

| # | 페이지 | 현재 | 필요 API | 작업 |
|---|--------|------|---------|------|
| L-09 | /infra/cache | Demo Only | Agent Redis Collector | Redis 메트릭 실데이터 |
| L-10 | /infra/middleware | Demo Only | Agent WAS Collector | 미들웨어 런타임 실데이터 |
| L-11 | /infra/middleware/connection-pool | Demo Only | Agent DB Collector | 커넥션 풀 실데이터 |
| L-12 | /infra/queues | Demo Only | Agent MQ Collector | 메시지 큐 실데이터 |
| L-13 | /agents/plugins | Demo Only | `/fleet/plugins` | 플러그인 목록 실데이터 |
| L-14 | /agents/plugins/[name] | Demo Only | `/fleet/plugins/{name}` | 플러그인 상세 + 에이전트 상태 |
| L-15 | /agents/groups/[id] | Demo Only | `/fleet/groups/{id}` | 에이전트 그룹 대시보드 |

### P2 — AI 고도화 (v1.3 완성)

| # | 페이지 | 현재 | 필요 API | 작업 |
|---|--------|------|---------|------|
| L-16 | /ai/prompts | Demo Only | `/genai/prompt-versions` (API 이미 존재) | 프롬프트 허브 실데이터 |
| L-17 | /ai/training | Demo Only | `/genai/training/jobs` | ML 학습 작업 실데이터 |
| L-18 | /ai/training/[id] | Demo Only | `/genai/training/{id}` | 학습 상세 (loss curve 등) |

### P3 — 프로파일링/런타임 (전문 분석)

| # | 페이지 | 현재 | 필요 API | 작업 |
|---|--------|------|---------|------|
| L-19 | /profiling/[profileId] | Demo Only | StorageBackend API | 프로파일 상세 (FlameGraph SVG) |
| L-20 | /profiling/system | Demo Only | Agent perf/eBPF | 시스템 프로파일링 실데이터 |
| L-21 | /runtime/python | Demo Only | Agent Python Collector | Python GIL/Worker 실데이터 |
| L-22 | /runtime/go | Demo Only | Agent Go Collector | Go Goroutine/GC 실데이터 |
| L-23 | /runtime/dotnet | Demo Only | Agent .NET Collector | .NET AOT/GC 실데이터 |

### P4 — 기타 (낮은 우선순위)

| # | 페이지 | 현재 | 필요 API | 작업 |
|---|--------|------|---------|------|
| L-24 | /golden-signals | Demo Only | Prometheus 집계 | Golden Signals 실데이터 |
| L-25 | /rum | Demo Only | RUM Collector | Real User Monitoring 실데이터 |
| L-26 | /database | Demo Only | Agent DB Collector | DB 쿼리 모니터링 실데이터 |
| L-27 | /executive | Demo Only | 집계 API | 경영 요약 대시보드 |
| L-28 | /costs | Demo Only | `/genai/cost-summary` 확장 | IT+AI 통합 비용 |
| L-29 | /notebooks | Demo Only | Notebook API | 조사 노트북 |
| L-30 | /tenants | Demo Only | Tenant CRUD API | 멀티 테넌시 관리 |
| L-31 | /dashboards | 부분 지원 | PromQL 실행 | 커스텀 대시보드 PromQL → Live |

---

## 3. 데모 사이트 추가 필요

### 3.1 Java Batch 빌드 에러 수정

| # | 작업 | 상세 |
|---|------|------|
| D-22 | Java Batch 빌드 에러 | `BatchApplication.java:54` — `Entity` 참조 모호. import 명시 필요 |
| D-23 | Java Batch OTel 계측 | start-otel.sh로 javaagent 연동 + Spring Batch Job 트레이싱 |

### 3.2 배치 프로세스 기동 모드 테스트

| # | 작업 | 상세 |
|---|------|------|
| B-01 | 쓰레드 기반 배치 | Celery Worker (현재 `--pool=solo`) — 쓰레드 풀 모드 테스트 |
| B-02 | 프로세스 기반 배치 | Celery Worker `--pool=prefork` — 멀티 프로세스 기동 테스트 |
| B-03 | 외부 프로세스 배치 | subprocess로 별도 프로세스 기동하는 Job 시뮬레이션 |
| B-04 | Spring Batch Job | Java Batch — Step/Chunk/Tasklet 기반 Job 실행 + OTel 트레이싱 |
| B-05 | 배치 스케줄러 연동 | Celery Beat 5분 주기 + 수동 트리거 API |

### 3.3 배치 모니터링 Collection Server API

| # | API | 상세 |
|---|-----|------|
| BA-01 | `GET /api/v1/batch/jobs` | 배치 Job 목록 (Celery/Spring Batch 통합) |
| BA-02 | `GET /api/v1/batch/jobs/{id}/executions` | Job 실행 이력 |
| BA-03 | `GET /api/v1/batch/executions/{id}` | 실행 상세 (step별 시간, 에러) |
| BA-04 | `POST /api/v1/batch/jobs/{id}/trigger` | 수동 Job 트리거 |
| BA-05 | `GET /api/v1/batch/xlog` | 배치 XLog 데이터 (30일 산점도) |

---

## 4. 실행 순서 제안

```
Phase 1: 배치 인프라 (P0 즉시)
  D-22  Java Batch 빌드 수정
  BA-01~BA-05  배치 API 구현
  L-01~L-04  배치 프론트엔드 실데이터
  B-01~B-05  배치 기동 모드 테스트

Phase 2: 트레이스/AI 상세 (P0)
  L-05  트레이스 상세 Jaeger 연동
  L-06~L-08  AI 서비스 상세 + 평가 + GPU

Phase 3: 인프라 상세 (P1)
  L-09~L-15  Cache/Middleware/Queue/Plugin 실데이터

Phase 4: AI 고도화 (P2)
  L-16~L-18  Prompt Hub/Training 실데이터

Phase 5: 프로파일링/런타임 (P3)
  L-19~L-23  FlameGraph/Runtime 실데이터

Phase 6: 나머지 (P4)
  L-24~L-31  Golden Signals/RUM/DB/Executive 등
```

---

## 5. 완료 기준

- [ ] Live 모드에서 모든 메뉴 클릭 시 에러 없음
- [ ] 실데이터가 있는 페이지: 실제 값 표시
- [ ] 실데이터가 없는 페이지: "데이터 수집 중" 안내 (빈 화면 아님)
- [ ] 배치: Thread + Process 모드 모두 모니터링 가능
- [ ] Java Batch + Python Celery 양쪽 실행 확인
- [ ] 5개 언어 데모 앱 전부 OTel 트레이스 Jaeger 확인
