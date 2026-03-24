# 통합테스트 1차 테스트 결과서 (AI)

> **프로젝트**: AITOP AI Service Monitoring Platform
> **실행자**: Claude Code AI (Opus 4.6)
> **실행일**: 2026-03-24
> **실행 환경**: Windows 11 Pro / Go 1.26.0 / Node.js 22.15.1 / Docker 29.2.1
> **기반 커밋**: `a100fbb` (`master`)
> **전체 판정**: **CONDITIONAL PASS**

---

## 1. 실행 요약

| 항목 | 값 |
|------|---|
| 총 체크포인트 | 88개 (계약 27 + 파이프라인 21 + UI API 40) |
| PASS | 72개 |
| FAIL | 12개 (전부 Known FAIL — 미구현 API) |
| SKIP | 4개 |
| 소요 시간 | ~5분 |

---

## 2. 상세 결과

### 2-1. Go 계약 테스트 (Step A-1) — 27/27 PASS

| # | 테스트 카테고리 | 테스트 수 | PASS | FAIL | 비고 |
|---|---------------|---------|------|------|------|
| 1 | Validation Gateway | 9 | 9 | 0 | Accept/Reject/Sanitize/Mismatch |
| 2 | EventBus | 4 | 4 | 0 | Publish/Subscribe/SubscribeAll/History |
| 3 | Fleet Registry | 5 | 5 | 0 | Register/Update/MarkOffline/List |
| 4 | Storage Keys | 2 | 2 | 0 | EvidenceKey/TerminalLogKey |
| 5 | Heartbeat JSON | 1 | 1 | 0 | 직렬화 검증 |
| 6 | Phase 17-3 Pipeline | 3 | 3 | 0 | Registration/DataPipeline/Validation |
| 7 | Auth Flow (4 roles) | 4 | 4 | 0 | admin/sre/ai_engineer/viewer |
| 8 | Fleet Management | 5 | 5 | 0 | List/Group/Schedule/Deploy/Updates |
| 9 | Diagnostic Report | 4 | 4 | 0 | Trigger/ListRuns/ByAgent/NoAgentID |
| | **합계** | **27** | **27** | **0** | |

### 2-2. Docker 헬스체크 (Step A-2, A-3) — 11/11 서비스 기동

| # | 서비스 | 포트 | 상태 | 비고 |
|---|--------|------|:----:|------|
| 1 | Collection Server | 8080 | **Healthy** | Go 바이너리, JWT 인증 |
| 2 | Frontend | 3000 | **Healthy** | Next.js standalone |
| 3 | PostgreSQL | 5432 | **Healthy** | 메인 DB |
| 4 | MinIO | 9000 | **Healthy** | S3 호환 오브젝트 스토리지 |
| 5 | OTel Collector | 4317/13133 | **Running** | healthcheck disabled (scratch 이미지) |
| 6 | Prometheus | 9090 | **Healthy** | 메트릭 저장/쿼리 |
| 7 | Tempo | 3200 | **Healthy** | 트레이스 저장 |
| 8 | Loki | 3100 | **Healthy** | 로그 저장 |
| 9 | Demo RAG | 8000 | **Healthy** | FastAPI + OTel 계측 |
| 10 | Demo DB | 5433 | **Running** | 데모용 PostgreSQL |
| 11 | Demo Web | 8081 | **Running** | Nginx 모니터링 대상 |

### 2-3. 파이프라인 검증 (Step A-4) — 21/21 PASS

| # | 체크포인트 | 상세 | 결과 |
|---|-----------|------|:----:|
| P1 | Health Check | 서버 기동 | **PASS** |
| P2 | JWT Login | admin 토큰 발급 | **PASS** |
| P3 | JWT Me | 토큰 검증 | **PASS** |
| P4 | JWT Refresh | 토큰 갱신 | **PASS** |
| P5 | JWT Multi-role | sre 역할 로그인 | **PASS** |
| P6 | Heartbeat 전송 | Agent 등록 | **PASS** |
| P7 | Heartbeat 확인 | Fleet 반영 | **PASS** |
| P8 | Collect OS | OS 메트릭 제출 | **PASS** |
| P9 | Collect LLM | LLM 메트릭 제출 | **PASS** |
| P10 | Collect Diagnostic | 진단 데이터 제출 | **PASS** |
| P11 | SSE EventBus | 이벤트 스트리밍 | **PASS** |
| P12 | MinIO 버킷 (evidence) | 존재 확인 | **PASS** |
| P13 | MinIO 버킷 (terminal-logs) | 존재 확인 | **PASS** |
| P14 | MinIO 버킷 (diagnostics) | 존재 확인 | **PASS** |
| P15 | MinIO 객체 | 저장 확인 | **PASS** |
| P16 | Fleet 목록 조회 | 에이전트 리스트 | **PASS** |
| P17 | Fleet 상세 조회 | 에이전트 검색 | **PASS** |
| P18 | 수집 트리거 | 수동 수집 명령 | **PASS** |
| P19 | Fleet Jobs | 작업 목록 | **PASS** |
| P20 | Prometheus 메트릭 | Ready 확인 | **PASS** |
| P21 | Prometheus 쿼리 | API 응답 | **PASS** |

### 2-4. UI API 검증 (Step A-5) — 24 PASS / 12 FAIL / 4 SKIP

| 섹션 | PASS | FAIL | SKIP | Phase 17 대비 변동 |
|------|:----:|:----:|:----:|:----------------:|
| 인프라 뷰 (17-3-3) | 6 | 2 | 0 | 변동 없음 |
| AI 서비스 뷰 (17-3-4) | 0 | 5 | 0 | 변동 없음 |
| 에이전트 관리 뷰 (17-3-5) | 17 | 0 | 1 | 변동 없음 |
| 진단 보고서 (17-3-6) | 0 | 4 | 3 | 변동 없음 |
| SSE | 0 | 1 | 0 | 변동 없음 |
| **합계** | **24** | **12** | **4** | **Phase 17과 동일** |

---

## 3. 실패 항목 상세

> 전부 **Known FAIL** — Phase 17에서 식별된 미구현 UI 전용 API

| # | 엔드포인트 | HTTP 코드 | 심각도 | 상태 |
|---|-----------|:---------:|:------:|------|
| 1 | `GET /infra/hosts` | 404 | Major | 미구현 — `/fleet/agents`로 fallback 가능 |
| 2 | `GET /fleet/agents/{id}` | 405 | Major | 개별 조회 미구현 (목록만 지원) |
| 3 | `GET /ai/services` | 404 | Major | AI 서비스 뷰 전용 API 미구현 |
| 4 | `GET /ai/services/{id}/llm` | 404 | Major | AI LLM 상세 미구현 |
| 5 | `GET /ai/gpu` | 404 | Major | GPU 클러스터 API 미구현 |
| 6 | `GET /ai/services/{id}/rag` | 404 | Major | RAG 파이프라인 API 미구현 |
| 7 | `GET /ai/services/{id}/guardrail` | 404 | Major | 가드레일 API 미구현 |
| 8 | `POST /diagnostics/trigger` | 404 | Major | 진단 트리거 API 미구현 |
| 9 | `GET /diagnostics/runs` | 404 | Major | 진단 실행 목록 미구현 |
| 10 | `GET /diagnostics/runs?agent=...` | 404 | Major | 에이전트별 진단 미구현 |
| 11 | `GET /diagnostics/runs` (items) | 404 | Major | 응답 필드 부재 |
| 12 | `GET /events` (SSE) | timeout | Minor | curl SSE 타임아웃 처리 이슈 |

**조치 방안**: Phase 7' To-Do #1로 등록됨 — UI 전용 API 12개 엔드포인트 구현 필요

---

## 4. 테스트 중 발견 · 수정된 이슈

### CHG-001: OTel Collector healthcheck 실패 (scratch 이미지)

| 항목 | 내용 |
|------|------|
| 유형 | 설정 변경 |
| 심각도 | Major (Docker 스택 기동 차단) |
| 발견 단계 | Step A-2 |
| 원인 | OTel Collector 0.91.0 이미지가 scratch 기반이라 curl/wget/sh 없음 |
| 변경 파일 | `docker-compose.e2e.yaml` |
| 변경 내용 | `healthcheck: test: ["CMD", "curl", ...]` → `healthcheck: disable: true` + depends_on `service_started` |
| 재검증 | **PASS** — 11개 컨테이너 전체 기동 성공 |

---

## 5. 실행 로그 참조

| 로그 | 경로 |
|------|------|
| 계약 테스트 | `logs/contract-test-output.txt` |
| Docker compose up | `logs/docker-compose-up.txt` |
| 파이프라인 검증 | `logs/pipeline-verify-output.txt` |
| UI API 검증 | `logs/ui-api-verify-output.txt` |

---

## 6. 서명

| 역할 | 이름 | 일시 |
|------|------|------|
| 실행자 | Claude Code AI (Opus 4.6) | 2026-03-24 16:58 |
| 검토자 | (수동 검증 후 기재) | |
