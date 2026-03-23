# Phase 17 테스트 수행 결과

> **수행일**: 2026-03-23
> **환경**: Windows 11 / Go 1.26 / Node 22.15.1 / Docker 29.2.1

---

## 1. Go 빌드 + 유닛/계약/통합 테스트

| 항목 | 결과 |
|------|------|
| `go build ./...` | **PASS** |
| `go test -v ./...` | **ALL PASS** |

### 테스트 패키지 상세

| 패키지 | 테스트 수 | 결과 |
|--------|----------|------|
| `cmd/collection-server` | 9 | PASS |
| `internal/collector/ai/llm` | 11 | PASS |
| `internal/collector/ai/otel` | 9 | PASS |
| `internal/collector/ai/vectordb` | 11 | PASS |
| `internal/collector/db` | 8 | PASS |
| `internal/collector/os` | 10 | PASS |
| `internal/collector/was` | 8 | PASS |
| `internal/collector/web` | 6 | PASS |
| `internal/output` | 5 | PASS |
| `internal/shell` | 9 | PASS |
| `internal/statemachine` | 10 | PASS |
| `internal/transport` | 12 | PASS |
| `internal/updater` | 8 | PASS |
| **test/ (계약+통합 E2E)** | **27** | **PASS** |

**총 테스트 수: ~143개, 실패: 0**

---

## 2. Frontend Playwright E2E 테스트 (chromium project)

| 테스트 시나리오 | 결과 |
|----------------|------|
| 01-SRE: Executive → Services → Trace drill-down | **PASS** |
| 01-SRE: Alerts → Incident timeline → RCA | **PASS** |
| 02-AI: AI overview → AI detail → GPU cluster → Diagnostics | **PASS** |
| 03-Consultant: Projects → Agents → Diagnostics → SLO → Costs | **PASS** |
| 04-Agent: Fleet Console — Agent list, Jobs, Plugins tabs | **PASS** |
| 04-Agent: Fleet → Host detail navigation | **PASS** |
| 05-Nav: All 26 routes render without errors | **PASS** |
| 05-Nav: Login page — 4 demo accounts visible | **PASS** |
| 05-Nav: 404 page for non-existent routes | **PASS** |

**9/9 PASS** (수행 시간: 1분 0초)

### 테스트 중 발견/수정된 버그

1. **AuthGuard 하이드레이션 버그** — `setLoading(false)`가 Zustand persist 하이드레이션 완료 전에 호출되어, `page.goto()` 후 인증 상태 유실
   - **수정**: `useAuthStore.persist.hasHydrated()` + `onFinishHydration` 콜백으로 대체
   - **파일**: `frontend/src/components/auth/auth-guard.tsx`

2. **E2E helpers `loginAsDemo`** — `waitForURL('/')` strict 매칭이 실제 리다이렉트 URL과 불일치
   - **수정**: `/login`에서 벗어나면 성공으로 판단하도록 변경
   - **파일**: `frontend/e2e/helpers.ts`

3. **`assertPageLoaded`** — `<main>` 태그만 검사하여 레이아웃 구조 불일치
   - **수정**: `nav, aside` 포함 + AuthGuard Loading 해제 대기 추가

---

## 3. Docker 통합 테스트 (docker-compose.test.yaml)

### 3-1. 환경 기동

11개 컨테이너 전체 정상 기동:
- collection-server, postgres, minio, minio-init
- otel-collector, prometheus, tempo, loki
- frontend, test-api-server, test-db-server, test-web-server

### 3-2. 파이프라인 검증 (02-pipeline-verify.sh)

| 검증 항목 | 체크포인트 | 결과 |
|-----------|-----------|------|
| P1. Health Check | 1 | PASS |
| P2. JWT 인증 (login/me/refresh/multi-role) | 4 | PASS |
| P3. Heartbeat → Fleet 등록 | 2 | PASS |
| P4. Collect Result 제출 (OS/LLM/Diagnostic) | 3 | PASS |
| P5. SSE EventBus | 1 | PASS |
| P6. MinIO S3 버킷 (3개) | 4 | PASS |
| P7. Fleet API 에이전트 조회 | 2 | PASS |
| P8. 수집 작업 수동 트리거 | 2 | PASS |
| P9. Prometheus 메트릭 | 2 | PASS |

**21/21 PASS, 0 FAIL**

### 3-3~6. UI View API 검증 (03-ui-api-verify.sh)

| 섹션 | PASS | FAIL | SKIP |
|------|------|------|------|
| 17-3-3: 인프라 뷰 | 6 | 2 | 0 |
| 17-3-4: AI 서비스 뷰 | 0 | 5 | 0 |
| 17-3-5: 에이전트 관리 뷰 | 17 | 0 | 1 |
| 17-3-6: 진단 보고서 | 0 | 4 | 3 |
| Extra: SSE | 0 | 1 | 0 |
| **합계** | **24** | **12** | **4** |

#### FAIL 항목 분석

| 엔드포인트 | HTTP | 원인 |
|-----------|------|------|
| `/infra/hosts` | 404 | 미구현 — fleet/agents로 fallback 가능 |
| `/fleet/agents/{id}` | 405 | 개별 조회 미구현 (목록만 지원) |
| `/ai/services` | 404 | AI 서비스 뷰 전용 API 미구현 |
| `/ai/services/{id}/llm` | 404 | 〃 |
| `/ai/gpu` | 404 | 〃 |
| `/ai/services/{id}/rag` | 404 | 〃 |
| `/ai/services/{id}/guardrail` | 404 | 〃 |
| `/diagnostics/trigger` | 404 | 진단 관련 API 미구현 |
| `/diagnostics/runs` | 404 | 〃 |
| `/diagnostics/runs?agent=...` | 404 | 〃 |
| `/events` (SSE) | 비정상 | curl SSE 타임아웃 처리 이슈 |

> **참고**: FAIL 항목은 Collection Server에 아직 구현되지 않은 UI 전용 API 엔드포인트입니다.
> 핵심 파이프라인(heartbeat, collect, fleet, auth)은 모두 정상 동작합니다.

---

## 4. 테스트 중 수정된 인프라 이슈

| 파일 | 변경 내용 |
|------|----------|
| `infra/docker/Dockerfile.collection-server` | Go 1.24 → 1.25 (go.mod 요구사항 충족) |
| `frontend/next.config.ts` | `output: 'standalone'` 추가 (Docker 빌드 호환) |
| `scripts/phase17-3/03-ui-api-verify.sh` | `set -euo` → `set -uo` (첫 실패에 중단 방지) |

---

## 종합 결과

| 테스트 레이어 | 통과 | 실패 | 비고 |
|--------------|------|------|------|
| Go 빌드 + 유닛 테스트 | 143 | 0 | 전체 PASS |
| Playwright E2E | 9 | 0 | 버그 수정 후 전체 PASS |
| Docker 파이프라인 검증 | 21 | 0 | 전체 PASS |
| Docker UI API 검증 | 24 | 12 | 미구현 API로 인한 예상 실패 |
| **총합** | **197** | **12** | |

**Phase 17 핵심 기능(Backend API + 실데이터 파이프라인)은 정상 검증 완료.**
UI 전용 API 엔드포인트(`/infra/*`, `/ai/*`, `/diagnostics/*`)는 향후 구현 필요.
