# 통합테스트 1차 테스트 결과서 (AI)

> **프로젝트**: AITOP AI Service Monitoring Platform
> **실행자**: Claude Code AI (Opus 4.6)
> **실행일**: 2026-03-__
> **실행 환경**: Windows 11 Pro / Go _____ / Node.js _____ / Docker _____
> **기반 커밋**: `_______` (`master`)
> **전체 판정**: **{PASS | CONDITIONAL PASS | FAIL}**

---

## 1. 실행 요약

| 항목 | 값 |
|------|---|
| 총 체크포인트 | ___개 |
| PASS | ___개 |
| FAIL | ___개 |
| SKIP | ___개 |
| 소요 시간 | ___분 |

---

## 2. 상세 결과

### 2-1. Go 계약 테스트 (Step A-1)

| # | 테스트 카테고리 | 테스트 수 | PASS | FAIL | 비고 |
|---|---------------|---------|------|------|------|
| 1 | Validation Gateway | 9 | | | |
| 2 | EventBus | 4 | | | |
| 3 | Fleet Registry | 5 | | | |
| 4 | Storage Keys | 2 | | | |
| 5 | Auth Flow (4 roles) | 4+ | | | |
| 6 | Phase 17-3 Pipeline | 3+ | | | |

### 2-2. Docker 헬스체크 (Step A-3)

| # | 서비스 | 포트 | 상태 | 비고 |
|---|--------|------|------|------|
| 1 | Collection Server | 8080 | | |
| 2 | Frontend | 3000 | | |
| 3 | PostgreSQL | 5432 | | |
| 4 | MinIO | 9000 | | |
| 5 | OTel Collector | 13133 | | |
| 6 | Prometheus | 9090 | | |
| 7 | Tempo | 3200 | | |
| 8 | Loki | 3100 | | |

### 2-3. 파이프라인 검증 (Step A-4)

| # | 체크포인트 | 상세 | PASS | FAIL | 비고 |
|---|-----------|------|------|------|------|
| P1 | Health Check | 서버 기동 | | | |
| P2 | JWT Login | 토큰 발급 | | | |
| P3 | JWT Me | 토큰 검증 | | | |
| P4 | JWT Refresh | 토큰 갱신 | | | |
| P5 | JWT Multi-role | 역할별 권한 | | | |
| P6 | Heartbeat 전송 | Agent 등록 | | | |
| P7 | Heartbeat 확인 | Fleet 반영 | | | |
| P8 | Collect OS | OS 메트릭 제출 | | | |
| P9 | Collect LLM | LLM 메트릭 제출 | | | |
| P10 | Collect Diagnostic | 진단 데이터 제출 | | | |
| P11 | SSE EventBus | 이벤트 스트리밍 | | | |
| P12 | MinIO 버킷 확인 | 3개 버킷 존재 | | | |
| P13 | MinIO 객체 확인 (1) | evidence 저장 | | | |
| P14 | MinIO 객체 확인 (2) | terminal-log 저장 | | | |
| P15 | MinIO 객체 확인 (3) | diagnostic 저장 | | | |
| P16 | Fleet 목록 조회 | 에이전트 리스트 | | | |
| P17 | Fleet 상세 조회 | 에이전트 상태 | | | |
| P18 | 수집 트리거 (1) | 수동 수집 명령 | | | |
| P19 | 수집 트리거 (2) | 수집 확인 | | | |
| P20 | Prometheus 메트릭 | 메트릭 존재 | | | |
| P21 | Prometheus 쿼리 | PromQL 응답 | | | |

### 2-4. UI API 검증 (Step A-5)

| 섹션 | PASS | FAIL | SKIP | Known FAIL 변동 |
|------|------|------|------|----------------|
| 인프라 뷰 | | | | |
| AI 서비스 뷰 | | | | |
| 에이전트 관리 뷰 | | | | |
| 진단 보고서 | | | | |
| **합계** | | | | |

### 2-5. AI-L3 API 호환성 분석 (Step A-6)

| # | Frontend 경로 | Backend 경로 | 일치 | 비고 |
|---|-------------|-------------|------|------|
| 1 | | | | |

---

## 3. 실패 항목 상세

### FAIL-001: {실패 항목명}

| 항목 | 내용 |
|------|------|
| 위치 | |
| 심각도 | {Critical / Major / Minor} |
| 에러 메시지 | |
| 원인 분석 | |
| 조치 방안 | |
| Known Issue 여부 | {Yes — Phase 17 미구현 / No — 신규 발견} |

---

## 4. 실행 로그 참조

| 로그 | 경로 |
|------|------|
| 계약 테스트 | `logs/contract-test-output.txt` |
| Docker compose up | `logs/docker-compose-up.txt` |
| 헬스체크 | `logs/healthcheck-output.txt` |
| 파이프라인 검증 | `logs/pipeline-verify-output.txt` |
| UI API 검증 | `logs/ui-api-verify-output.txt` |

---

## 5. 서명

| 역할 | 이름 | 일시 |
|------|------|------|
| 실행자 | Claude Code AI (Opus 4.6) | 2026-03-__ |
| 검토자 | (수동 검증 후 기재) | |
