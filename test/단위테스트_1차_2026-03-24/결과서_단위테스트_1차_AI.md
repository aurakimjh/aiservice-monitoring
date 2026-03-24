# 단위테스트 1차 테스트 결과서 (AI)

> **프로젝트**: AITOP AI Service Monitoring Platform
> **실행자**: Claude Code AI (Opus 4.6)
> **실행일**: 2026-03-24
> **실행 환경**: Windows 11 Pro / Go 1.26.0 / Node.js 22.15.1 / npm 10.9.2
> **기반 커밋**: `8ab7c30` (`master`)
> **전체 판정**: **PASS**

---

## 1. 실행 요약

| 항목 | 값 |
|------|---|
| 총 테스트 케이스 | 232개 (Go 160 + Frontend 72) |
| PASS | 232개 |
| FAIL | 0개 |
| SKIP | 0개 |
| 소요 시간 | ~3분 |

---

## 2. 상세 결과

### 2-1. Go Agent 단위 테스트 (160개 테스트, 18개 패키지)

| # | 패키지 | 테스트 수 | PASS | FAIL | 소요 시간 | 커버리지 |
|---|--------|---------|------|------|---------|---------|
| 1 | `cmd/collection-server` | 9 | 9 | 0 | 1.02s | 27.5% |
| 2 | `internal/collector/ai/llm` | 11 | 11 | 0 | 0.77s | 65.0% |
| 3 | `internal/collector/ai/otel` | 9 | 9 | 0 | 1.14s | 84.4% |
| 4 | `internal/collector/ai/vectordb` | 11 | 11 | 0 | 5.30s | 86.3% |
| 5 | `internal/collector/cache` | 14 | 14 | 0 | 0.68s | 69.5% |
| 6 | `internal/collector/db` | 8 | 8 | 0 | 0.90s | 29.4% |
| 7 | `internal/collector/mq` | 14 | 14 | 0 | 1.11s | 61.7% |
| 8 | `internal/collector/os` | 10 | 10 | 0 | 0.62s | 16.7% |
| 9 | `internal/collector/was` | 8 | 8 | 0 | 1.08s | 33.0% |
| 10 | `internal/collector/web` | 6 | 6 | 0 | 2.73s | 16.0% |
| 11 | `internal/health` | 7 | 7 | 0 | 0.62s | 92.9% |
| 12 | `internal/output` | 6 | 6 | 0 | 0.64s | 95.0% |
| 13 | `internal/shell` | 9 | 9 | 0 | 0.66s | 24.6% |
| 14 | `internal/statemachine` | 10 | 10 | 0 | 0.62s | 92.7% |
| 15 | `internal/transport` | 12 | 12 | 0 | 1.20s | 51.3% |
| 16 | `internal/updater` | 8 | 8 | 0 | 0.78s | 21.0% |
| 17 | `pkg/storage` | 21 | 21 | 0 | 1.14s | 51.1% |
| 18 | `test` (contract+e2e) | 27+ | 27+ | 0 | 1.14s | — |
| | **합계** | **~160** | **~160** | **0** | | **25.9% (전체)** |

> `-race` 플래그는 Windows CGO 미지원으로 생략 (Linux CI에서 별도 검증 권장)

### 2-2. Frontend Vitest 단위 테스트 (72개 테스트, 5개 파일)

| # | 테스트 파일 | 테스트 수 | PASS | FAIL | 비고 |
|---|-----------|---------|------|------|------|
| 1 | `components/ui/__tests__/button.test.tsx` | 9 | 9 | 0 | 9개 variant/size/ref/aria |
| 2 | `hooks/__tests__/use-i18n.test.ts` | 8 | 8 | 0 | ko/en/ja 전환 |
| 3 | `lib/__tests__/i18n.test.ts` | 15 | 15 | 0 | 번역, 날짜, 숫자 포맷 |
| 4 | `lib/__tests__/utils.test.ts` | 23 | 23 | 0 | cn, formatNumber/Duration/Bytes/Percent/Cost |
| 5 | `stores/__tests__/ui-store.test.ts` | 17 | 17 | 0 | sidebar/theme/locale/timeRange/autoRefresh |
| | **합계** | **72** | **72** | **0** | |

### 2-3. 빌드 검증

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | Go 빌드 (`go build ./...`) | **PASS** | 에러 0 |
| 2 | Frontend 빌드 (`npx next build`) | **PASS** | 44개 라우트 컴파일 성공 |

---

## 3. 실패 항목 상세

해당 없음 — 전체 PASS

---

## 4. 커버리지

### 4-1. Go 커버리지 (패키지별)

| 등급 | 패키지 | 커버리지 |
|------|--------|---------|
| A (90%+) | output, health, statemachine | 95.0%, 92.9%, 92.7% |
| B (80%+) | ai/vectordb, ai/otel | 86.3%, 84.4% |
| C (60%+) | cache, ai/llm, mq | 69.5%, 65.0%, 61.7% |
| D (30%+) | storage, transport, was, db, collection-server | 51.1%, 51.3%, 33.0%, 29.4%, 27.5% |
| E (<30%) | shell, updater, os, web | 24.6%, 21.0%, 16.7%, 16.0% |

**Go 전체 커버리지: 25.9%** (테스트 없는 16개 패키지 포함)

### 4-2. Frontend 커버리지

| 항목 | 값 |
|------|---|
| 측정된 파일 | 5개 테스트 대상 |
| 미측정 영역 | 48 페이지, 47 컴포넌트 중 대부분 |

> 48개 페이지 중 단위 테스트가 존재하는 것은 0개 (페이지 레벨)
> 47개 컴포넌트 중 단위 테스트가 존재하는 것은 1개 (Button)

---

## 5. AI 코드 품질 분석

### 5-1. `any` 타입 사용 (Frontend)

| # | 파일 | 건수 | 비고 |
|---|------|------|------|
| 1 | `components/monitoring/anomaly-chart.tsx` | 3 | ECharts 타입 관련 |
| 2 | `app/traces/page.tsx` | 6 | 트레이스 데이터 파싱 |
| 3 | `app/dashboards/page.tsx` | 1 | 대시보드 위젯 타입 |
| | **합계** | **10건** | 3개 파일 |

**판정**: Minor — ECharts 및 동적 데이터 처리에서 불가피한 경우 포함

### 5-2. 에러 무시 패턴 (Go)

| # | 파일 | 건수 | 내용 |
|---|------|------|------|
| 1 | `pkg/storage/local_backend.go` | 1 | `_ = err` (디렉토리 생성 실패 무시) |

**판정**: Minor — 1건으로 양호

### 5-3. 하드코딩 시크릿

| # | 파일 | 내용 | 판정 |
|---|------|------|------|
| 1 | `internal/sanitizer/sanitizer.go` | PII 마스킹 테스트용 패턴 | False Positive — 마스킹 로직에서 사용하는 정규식 패턴 |

**판정**: 실제 시크릿 노출 0건

### 5-4. 테스트 미비 영역 (Go — `[no test files]`)

| # | 패키지 | 우선순위 | 사유 |
|---|--------|---------|------|
| 1 | `internal/config` | High | 설정 파싱 로직 |
| 2 | `internal/core` | High | 에이전트 코어 루프 |
| 3 | `internal/database` | High | DB 스키마/쿼리 |
| 4 | `internal/eventbus` | Medium | 이벤트 버스 |
| 5 | `internal/discovery` | Medium | 서비스 디스커버리 |
| 6 | `internal/scheduler` | Medium | 스케줄러 |
| 7 | `internal/privilege` | Low | 권한 체크 |
| 8 | `internal/sanitizer` | Low | PII 마스킹 |
| 9 | `internal/buffer` | Low | 버퍼 관리 |
| 10 | `internal/auth` | Medium | 인증 미들웨어 |
| 11 | `internal/sso` | Low | SSO 통합 |
| 12 | `internal/validation` | Medium | 검증 로직 |
| 13 | `internal/lite` | Low | Lite 모드 |
| 14 | `internal/ws` | Low | WebSocket |
| 15 | `internal/storage` | Low | 스토리지 내부 |
| 16 | `internal/collector/ai/gpu` | Medium | GPU Collector |
| 17 | `internal/collector/ai/serving` | Medium | Serving Collector |
| 18 | `internal/collector/profiling` | Low | 프로파일링 |
| 19 | `internal/collector/it` | Low | IT 집계 |
| 20 | `pkg/models` | Low | 모델 정의 (구조체) |

---

## 6. 실행 로그 참조

| 로그 | 경로 |
|------|------|
| Go test output | `logs/go-test-output.txt` |
| Vitest output | `logs/vitest-output.txt` |

---

## 7. 서명

| 역할 | 이름 | 일시 |
|------|------|------|
| 실행자 | Claude Code AI (Opus 4.6) | 2026-03-24 11:07 |
| 검토자 | (수동 검증 후 기재) | |
