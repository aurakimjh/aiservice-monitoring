# AITOP 솔루션 완성도 로드맵

> **작성일**: 2026-03-28 / **업데이트**: 2026-03-28 (Phase P 완료 — v0.9.0-rc.1 패키징)
> **목적**: 솔루션 완성도 100%까지의 전체 작업량 산정 + 일정 추정
> **현재 완성도**: 약 98% (기능 95% / 실데이터 85% / 품질 80% / 테스트 100% / 패키징 100%)

---

## 1. 완성도 정의

| 수준 | 완성도 | 상태 |
|------|--------|------|
| **기능 구현** | 95% | v1.1~v1.3 코드 완료. UI 67개 페이지, API 50+ 엔드포인트 |
| **실데이터 연동** | 85% | 67개 페이지 중 57개 Live 모드 동작 (Phase L1+L2 완료) |
| **데모 품질** | 70% | 5개 언어 앱 + 배치 기동 + 상세 페이지 대부분 연동 |
| **운영 안정성** | 50% | auth 수정 완료, null safety 일부, 에러 핸들링 개선 필요 |
| **문서 완성도** | 90% | 17개 문서 현행화 + 로드맵 + 결함 추적 |

---

## 2. 100% 완성까지 남은 작업

### Phase L1: 핵심 페이지 Live 전환 (완성도 65% → 80%)

**예상 일정: 3~4일**

| # | 작업 | 페이지 수 | 난이도 | 예상 시간 |
|---|------|----------|--------|----------|
| L1-1 | 배치 상세 실데이터 | 4 (/batch/*) | 높음 | 8h |
| L1-2 | 트레이스 상세 Jaeger 연동 | 1 (/traces/[traceId]) | 중간 | 4h |
| L1-3 | AI 서비스 상세 | 3 (/ai/[id], evaluation, gpu) | 중간 | 6h |
| L1-4 | 인프라 상세 (Cache/MW/Queue) | 5 | 높음 | 8h |
| L1-5 | Agent Plugin/Group 상세 | 3 | 중간 | 4h |
| | **소계** | **16 페이지** | | **30h (4일)** |

### Phase L2: 상세 페이지 Live 전환 (완성도 80% → 90%)

**예상 일정: 3~4일**

| # | 작업 | 페이지 수 | 난이도 | 예상 시간 |
|---|------|----------|--------|----------|
| L2-1 | 프로파일링 상세 (FlameGraph) | 2 | 높음 | 6h |
| L2-2 | Runtime (Python/Go/.NET) | 3 | 중간 | 6h |
| L2-3 | AI Training/Prompts | 3 | 중간 | 4h |
| L2-4 | Golden Signals/RUM/Database | 3 | 중간 | 6h |
| L2-5 | Executive/Costs/Notebooks | 3 | 낮음 | 4h |
| L2-6 | Tenants/Settings 고도화 | 2 | 낮음 | 2h |
| | **소계** | **16 페이지** | | **28h (4일)** |

### Phase Q: 품질 안정화 (완성도 90% → 95%)

**예상 일정: 2~3일**

| # | 작업 | 난이도 | 예상 시간 |
|---|------|--------|----------|
| Q-1 | 전 페이지 null safety 전수 점검 + 수정 | 중간 | 4h |
| Q-2 | Live 모드에서 "데이터 없음" 빈 상태 UI 통일 | 중간 | 4h |
| Q-3 | API 에러 핸들링 (timeout, 5xx, network) | 중간 | 4h |
| Q-4 | useDataSource 무한 루프 추가 방어 | 낮음 | 2h |
| Q-5 | Auth middleware 전체 경로 정리 | 낮음 | 1h |
| Q-6 | ECharts resize/destroy 메모리 누수 점검 | 중간 | 3h |
| Q-7 | 로딩 스피너 + Skeleton UI 통일 | 중간 | 4h |
| | **소계** | | **22h (3일)** |

### Phase T: 통합 테스트 + 데모 리허설 (완성도 95% → 98%)

**예상 일정: 2일**

| # | 작업 | 난이도 | 예상 시간 |
|---|------|--------|----------|
| T-1 | 전체 환경 기동 + 10분 시나리오 리허설 | 중간 | 4h |
| T-2 | 전체 환경 기동 + 20분 시나리오 리허설 | 중간 | 4h |
| T-3 | 발견 이슈 수정 | 가변 | 4h |
| T-4 | 성능 테스트 (k6 부하 + 대시보드 반응) | 중간 | 4h |
| | **소계** | | **16h (2일)** |

### Phase P: 상용 패키징 (완성도 98% → 100%)

**예상 일정: 2~3일**

| # | 작업 | 난이도 | 예상 시간 |
|---|------|--------|----------|
| P-1 | Docker 이미지 빌드 (CS + Frontend + Agent) | 중간 | 4h |
| P-2 | docker-compose.production.yaml 완성 | 중간 | 4h |
| P-3 | Helm chart 업데이트 (v1.3) | 높음 | 6h |
| P-4 | 설치 가이드 최종 검증 (Win/Mac/K8s) | 중간 | 4h |
| P-5 | 릴리스 노트 작성 (v1.3.0) | 낮음 | 2h |
| P-6 | THIRD_PARTY_LICENSES 최종 검증 | 낮음 | 1h |
| | **소계** | | **21h (3일)** |

---

## 3. 전체 일정 추정

```
Phase P 완료 ── v0.9.0-rc.1
 98%

Phase L1+L2+Q+T+P 전체 완료

### Phase T 결과 (2026-03-28)
- **49/49 ALL PASS** — 인프라 5 + 앱 4 + API 9 + 관측 2 + Agent 1 + AI 2 + 배치 2 + 프론트 24

### Phase P 결과 (2026-03-28)
- v0.9.0-rc.1 패키징 완료
- docker-compose.production.yaml (AGPL-free 상용 스택)
- Helm chart v0.9.0 (appVersion 0.9.0-rc.1)
- CHANGELOG.md + RELEASE_NOTES 작성
- 남은 작업: 수동 테스트 통과 → v1.0.0 정식 릴리스
```

| Phase | 기간 | 누적 | 완성도 |
|-------|------|------|--------|
| 현재 | - | - | 65% |
| L1 (핵심 Live) | 4일 | 4일 | 80% |
| L2 (상세 Live) | 4일 | 8일 | 90% |
| Q (품질 안정화) | 3일 | 11일 | 95% |
| T (테스트 + 리허설) | 2일 | 13일 | 98% |
| P (상용 패키징) | 3일 | 16일 | 100% |

### 최소 MVP (데모 가능 수준)

**Phase L1 + Q만 진행하면 7일 (약 1.5주)** 에 80% + 안정화 → **데모 시나리오 무리 없이 진행 가능**

---

## 4. 배치 관련 상세 TODO

### 4.1 배치 XLog (L1-1a)

| 작업 | 상세 |
|------|------|
| API | `GET /batch/xlog?days=30` — 30일간 배치 실행 산점도 (x=시간, y=duration) |
| 데이터 소스 | Celery: Redis `celery-task-meta-*` 키 스캔 / Spring Batch: Actuator |
| 프론트엔드 | /batch/xlog → ECharts scatter + brush 선택 → 실행 상세 |

### 4.2 배치 실행 상세 (L1-1b)

| 작업 | 상세 |
|------|------|
| API | `GET /batch/executions/{id}` — Step별 시간, SQL, Method 프로파일 |
| 데이터 소스 | Celery: task result JSON / Spring Batch: JobExecution/StepExecution |
| 프론트엔드 | /batch/executions/[id] → Step 워터폴 + SQL 테이블 + FlameGraph 링크 |

### 4.3 배치 기동 모드

| 모드 | 구현 | 테스트 방법 |
|------|------|-----------|
| Thread (Celery solo) | 현재 `--pool=solo` | 단일 프로세스 내 순차 실행 |
| Thread Pool | `--pool=threads` | 멀티 쓰레드 병렬 실행 |
| Process (prefork) | `--pool=prefork` (Linux only) | 멀티 프로세스 fork |
| External Process | subprocess.Popen 호출 | Job이 별도 프로세스로 기동 |
| Spring Batch Chunk | Java Batch Step/Chunk | Reader → Processor → Writer |
| Spring Batch Tasklet | Java Batch Tasklet | 단순 스크립트 실행형 |

---

## 5. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Agent Collector 미구현 | 인프라 상세(Cache/MW/Queue) 실데이터 없음 | 데모에서 해당 메뉴 Demo 모드로 대응 |
| FlameGraph 실데이터 | perf/eBPF 실 환경 필요 | 데모에서 정적 FlameGraph SVG 사용 |
| GPU 실데이터 | NVIDIA GPU 없는 환경 | 데모에서 Mock GPU 메트릭 |
| Windows Celery prefork | Windows에서 prefork 불가 | WSL2 또는 Docker에서 테스트 |
| 일정 초과 | 예상 16일 → 실제 20일+ | L1+Q만 우선 (7일 MVP) |

---

## 6. 추천 진행 순서

```
[즉시] Phase L1-1: 배치 상세 (4일)
  → 배치 XLog + 실행 상세 + 알림 + Java Batch 연동
  → 데모에서 배치 모니터링 시연 가능

[다음] Phase L1-2~L1-5: 핵심 상세 (4일)
  → 트레이스 상세 + AI 상세 + 인프라 상세
  → 데모에서 드릴다운 시연 가능

[안정화] Phase Q: 품질 (3일)
  → null safety + 빈 상태 UI + 에러 핸들링
  → 데모에서 크래시 없음

[검증] Phase T: 리허설 (2일)
  → 10분/20분 시나리오 실행
  → 최종 이슈 수정

[출시] Phase P: 패키징 (3일)
  → Docker/Helm/릴리스
```
