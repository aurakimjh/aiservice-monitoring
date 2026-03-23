# WORK_STATUS.md — AITOP 작업 진행 현황 및 로드맵

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2026-03-23 (Session 38 — Phase 28 완료: XLog/HeatMap 트랜잭션 뷰 강화 — TimeRangeArrows/TimeRangePicker/ServerMultiSelector 공통 컴포넌트, WhaTap 스타일 히트맵 4단계 그라디언트+에러 점 오버레이, 드래그 선택→트랜잭션 필터링, XLog↔HeatMap 분할 화면+시간 동기화)
> **이전 이력**: [WORK_STATUS_OLD.md](WORK_STATUS_OLD.md) — Phase 1~22 세션별 상세 기록
> **참고**: 이 파일을 기준으로 작업을 이어가며, 각 세션 완료 시 상태를 업데이트한다.

---

## 범례 (Status Legend)

| 아이콘 | 의미 |
|--------|------|
| ✅ | 완료 (Completed) |
| 🔄 | 진행 중 (In Progress) |
| 📋 | 예정 (Planned) |
| ⚠️ | 검토 필요 (Needs Review) |
| 🔧 | 수작업 필요 (Manual — 실제 인프라 환경 필요) |

---

## 전체 진행률

```
═══════════════════════════════════════════════════════════════════════
  완료된 작업 (Phase 1~6, 10~18)
═══════════════════════════════════════════════════════════════════════
Phase 1~6:   OTel 인프라 + SDK + 대시보드 + Helm + CI/CD    ████████████ 100% ✅
Phase 10~14: 상용 솔루션 UI (26개 화면)                       ████████████ 100% ✅
Phase 15:    Agent MVP (Core+Collector+Fleet+gRPC+DB+S3)     ████████████ 100% ✅
Phase 16:    Agent GA (IT/AI Collector+CLI+OTA+Fleet 콘솔)   ████████████ 100% ✅
Phase 17:    Backend API + 실데이터 통합                       ████████████ 100% ✅
Phase 18:    프론트엔드 품질 + 자동 테스트                     ████████████ 100% ✅
Phase 27:    StorageBackend (S3/Local/Dual)                    ████████████ 100% ✅
Phase 19:    AI 가치 강화 (LLM 평가·Prompt Hub·비용 최적화)   ████████████ 100% ✅

═══════════════════════════════════════════════════════════════════════
  TO-DO — 코드 작업 (최적화 순서, 의존성 다이어그램 참조)
═══════════════════════════════════════════════════════════════════════

── 즉시 실행 가능 (인프라 불필요, 순수 코드 작업) ────────────────────────
[00] Phase 28: XLog/HeatMap 트랜잭션 뷰 강화                   [██████████] 100%  ✅
[01] Phase 27: StorageBackend 구현 (S3/Local/Dual)            [██████████] 100%  ✅
[02] Phase 19: AI 가치 강화 (LLM 평가·Prompt Hub·비용 최적화)   [██████████] 100%  ✅
[03] Phase 20: 운영 고도화 (이상 탐지·PDF 보고서·합성 모니터링)  [░░░░░░░░░░]   0%  📋
[04] Phase 24: Java/.NET SDK + 메소드 프로파일링               [░░░░░░░░░░]   0%  📋
[05] Phase 25: 서버 그룹 + SDK 자동 인식 + 중앙 설정 편집      [░░░░░░░░░░]   0%  📋
[06] Phase 26: 미들웨어 런타임 모니터링 + Redis/Cache          [░░░░░░░░░░]   0%  📋
[07] Phase 21: 엔터프라이즈 기능 (Profiling·Terraform·SSO)    [░░░░░░░░░░]   0%  📋
[08] Phase 22: AI Copilot + 자동 탐색                         [░░░░░░░░░░]   0%  📋
[09] Phase 23: 멀티 클라우드 + 모바일                          [░░░░░░░░░░]   0%  📋
[13] Phase 29: Lite 모드 구현 (docker-compose.lite + SQLite)  [░░░░░░░░░░]   0%  📋
[14] Phase 30: AGPL-free 인프라 스택 전환                     [░░░░░░░░░░]   0%  📋

── 수작업 필요 (실제 인프라 환경, 코드 작업과 병렬/순차 진행) ───────────────
[10] Phase  7': E2E 통합 검증 (병렬 진행 중)                   [███░░░░░░░]  30%  🔄 🔧
[11] Phase  8': Kubernetes 통합 배포 (Phase 7' 완료 후)        [░░░░░░░░░░]   0%  📋 🔧
[12] Phase  9': SLO 튜닝 + 운영 안정화 (Phase 8' 후 1~2주)    [░░░░░░░░░░]   0%  📋 🔧
```

---

## Phase 의존성 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [완료 베이스]  →  [코드 TO-DO 순서]                    [수작업 TO-DO 🔧]       │
│                                                                             │
│  Phase 17 ✅ ──────────────────────► [01] Phase 27 (StorageBackend)         │
│                                                                             │
│  Phase 17 ✅ ─► [10] Phase 7' (🔧 30%) ──► [11] Phase 8' ──► [12] Phase 9' │
│                                                                             │
│  Phase 18 ✅ ──┬─► [02] Phase 19 (AI 가치) ─────────────────────────────┐  │
│               │                                                          │  │
│               └─► [03] Phase 20 (운영 고도화) ──────────────────────────┤  │
│                                                                          ▼  │
│                                                            [08] Phase 22    │
│                                                                   │         │
│                                                                   ▼         │
│                                                            [09] Phase 23    │
│                                                                             │
│  (독립) ─► [04] Phase 24 (Java/.NET SDK) ──► [05] Phase 25 ──► [06] Phase 26│
│                                                    │                        │
│                                                    └──────► [07] Phase 21   │
│                                                                             │
│  (독립) ─► [13] Phase 29 (Lite 모드) ── Phase 27 StorageBackend와 병행 가능 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**순서 최적화 근거:**

| 순번 | Phase | 배치 근거 |
|------|-------|----------|
| [01] | Phase 27 | Phase 17(✅) 기반 순수 Go 코드 — 즉시 시작 가능. K8s 배포(Phase 8') 전 스토리지 추상화 완성 필요. 가장 낮은 의존성·높은 즉시 가치 |
| [02] | Phase 19 | 상용화 핵심 AI 차별화 — Arize/LangSmith 대비 경쟁 우위. Phase 22 Copilot의 LLM 평가·Prompt Hub 기반 선행 필요 |
| [03] | Phase 20 | 이상 탐지 엔진이 Phase 22 Copilot 자연어 분석의 기반. PDF 보고서·합성 모니터링은 초기 고객 유지에 직결 |
| [04] | Phase 24 | 엔터프라이즈 APM 시장(Java 45%+.NET 25%) 진입 — Phase 25 SDK 자동 인식의 선행 조건. 독립 레이어라 병행 가능 |
| [05] | Phase 25 | Phase 24 SDK 언어 탐지 기반 — 서버 그룹 관리는 Phase 26 미들웨어 Collector 언어별 활성화의 선행 조건 |
| [06] | Phase 26 | Phase 25 에이전트 그룹 + 중앙 설정 완료 후 언어별 Collector 자동 활성화 가능. Redis/Cache 포함 |
| [07] | Phase 21 | Phase 24/25 SDK 기반 Profiling 구현 가능. SSO는 대기업 판매 필수 조건 — 앞선 SDK 기능 완성 후 세일즈 가속 |
| [08] | Phase 22 | Phase 19 AI 가치 + Phase 20 이상 탐지 기반이 갖춰진 후 Copilot 구현 효과 극대화 |
| [09] | Phase 23 | 글로벌 확장은 국내 상용화 안정 후 진행. Phase 22 Copilot 완성 후 차별화 강화 상태에서 진행 적합 |
| [10] | Phase 7' | 인프라 필요(🔧) — 코드 작업과 병렬 진행 가능. E2E 스크립트 완성(30%), 실제 Docker 환경에서 실행만 대기 |
| [11] | Phase 8' | Phase 7' E2E 검증 통과 후 K8s 배포. 수작업 특성상 코드 기능 완성 후 배포해야 재배포 최소화 |
| [12] | Phase 9' | Phase 8' 프로덕션 배포 + 1~2주 운영 데이터 확보 후에만 SLO 임계치 튜닝 가능 — 항상 마지막 |
| [13] | Phase 29 | Phase 27 StorageBackend와 독립 병행 가능. 컨설팅 세일즈 가속 + 진단 시나리오 검증용. Docker만으로 즉시 시작 가능 |

---

## Phase 17: Backend API + 실데이터 통합 ✅

> **목표**: Collection Server를 본격 Backend API로 발전시키고, Frontend 전체 화면을 실데이터로 검증
> **현재**: 전체 테스트 수행 완료 — Go 143 PASS / Playwright 9 PASS / Docker 파이프라인 21 PASS
> **테스트 수행일**: 2026-03-23 (결과: `reports/PHASE17_TEST_REPORT.md`)
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.1 #1~2

### 17-1. Backend API 서버 구현

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 17-1-1 | Collection Server 리팩터링 | JWT 인증 + CORS + Validation + EventBus 통합, Auth 엔드포인트 (login/refresh/me/logout) | 2주 | ✅ |
| 17-1-2 | PostgreSQL DB 레이어 | `database/database.go` — Agent/Job/Result/Diagnostic CRUD, 인메모리 fallback 지원 | 1주 | ✅ |
| 17-1-3 | JWT 인증/인가 Backend | `auth/jwt.go` — HMAC-SHA256 JWT 발급/검증, RBAC 4역할, CORS, 데모 계정 동기화 | 2주 | ✅ |
| 17-1-4 | Frontend REST API 바인딩 | 10개 API 모듈(api-client.ts) → 전체 화면 실데이터 연동 + use-api.ts 범용 훅 | 1주 | ✅ |
| 17-1-5 | SSE 실시간 갱신 | `ws/hub.go` EventBus→SSE 브로드캐스트 + `use-realtime.ts` 프론트엔드 훅 (자동 재연결) | 1주 | ✅ |

### 17-2. 테스트 인프라 (완료)

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 17-2-1 | 테스트 환경 Docker Compose | `docker-compose.test.yaml` — Collection Server + PostgreSQL + MinIO + OTel + 테스트 서버 3대 | ✅ |
| 17-2-2 | API 서비스 훅 확장 | `api-client.ts` 10개 API 모듈 + `use-api.ts` 범용 훅 (실데이터/demo 자동 전환) | ✅ |
| 17-2-3 | Playwright E2E 시나리오 | 5개 시나리오 (SRE 장애대응, AI 튜닝, 컨설턴트 점검, 에이전트 관리, 네비게이션) | ✅ |
| 17-2-4 | API 계약 테스트 | 20개 Go 테스트 PASS (Validation 9 + EventBus 4 + Registry 5 + S3 2) | ✅ |

### 17-3. 실데이터 통합 검증 ✅ 테스트 수행 완료

> Docker 테스트 환경에서 에이전트를 설치하고 실데이터로 UI를 검증.
> 스크립트 자동화 (Session 25) → **실제 테스트 수행 완료 (2026-03-23)**.
>
> **수행 결과 요약:**
> - Go 빌드+유닛/계약/통합 테스트: **143 PASS, 0 FAIL**
> - Playwright E2E (chromium 9 시나리오): **9 PASS, 0 FAIL**
> - Docker 파이프라인 검증 (02-pipeline): **21 PASS, 0 FAIL**
> - Docker UI API 검증 (03-ui-api): 24 PASS, 12 FAIL (미구현 API — `/infra/*`, `/ai/*`, `/diagnostics/*`)
>
> **테스트 중 수정된 버그:**
> - AuthGuard 하이드레이션 버그 (zustand persist 완료 전 loading 해제)
> - Dockerfile Go 버전 불일치 (1.24→1.25)
> - next.config.ts `output: 'standalone'` 누락

| # | 작업 | 검증 항목 | 상태 |
|---|------|----------|------|
| 17-3-1 | 에이전트 설치 + 등록 | `scripts/phase17-3/01-agent-install.sh` — Linux 바이너리 빌드, Docker 컨테이너 3대 설치, Collection Server 등록 확인 | ✅ |
| 17-3-2 | 데이터 파이프라인 | `scripts/phase17-3/02-pipeline-verify.sh` — Heartbeat→Fleet 등록, Collect 제출, SSE EventBus, MinIO 버킷, Prometheus, 수동 트리거 (9개 체크포인트) | ✅ |
| 17-3-3 | 인프라 뷰 검증 (5항목) | `scripts/phase17-3/03-ui-api-verify.sh` — 호스트 목록/상세/GPU/미들웨어/헥사곤맵 API 응답 확인 | ✅ |
| 17-3-4 | AI 서비스 뷰 검증 (5항목) | 동일 스크립트 — AI 개요/LLM 성능/GPU 클러스터/RAG/가드레일 엔드포인트 확인 | ✅ |
| 17-3-5 | 에이전트 관리 뷰 검증 (9항목) | 동일 스크립트 — Fleet KPI/에이전트 목록/수집 작업/플러그인/권한/원격 CLI/OTA/스케줄/그룹 | ✅ |
| 17-3-6 | 진단 보고서 검증 (5항목) | 동일 스크립트 — 수집→진단 트리거/목록/에이전트별 필터/항목 상세/실행 상세 | ✅ |

**신규 파일:**
- `infra/docker/Dockerfile.collection-server` — Collection Server 멀티스테이지 Docker 빌드
- `frontend/Dockerfile` — Next.js 16 standalone 프로덕션 빌드
- `scripts/phase17-3/01-agent-install.sh` — 에이전트 자동 빌드 + 등록
- `scripts/phase17-3/02-pipeline-verify.sh` — 데이터 파이프라인 9개 체크포인트
- `scripts/phase17-3/03-ui-api-verify.sh` — UI 뷰 API 30+ 체크포인트
- `scripts/phase17-3/run-all.sh` — 전체 오케스트레이션 마스터
- `agent/test/integration_e2e_test.go` — Go 통합 E2E 테스트 (6개 Test 함수, 전체 PASS)
- `agent/Makefile` — Phase 17-3 타겟 추가 (`verify-all`, `verify-pipeline`, `verify-ui` 등)

---

## Phase 18: 프론트엔드 품질 + 자동 테스트 ✅

> **목표**: 상용 출시 전 프론트엔드 품질 확보
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.1 #4

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 18-1 | Vitest + React Testing Library | vitest.config.ts + setup.ts + 5개 테스트 파일 (utils/i18n/useI18n/Button/UIStore) — 28개 케이스 | 2주 | ✅ |
| 18-2 | Playwright E2E 실행 검증 | playwright.config.ts 업데이트 — chromium/visual/a11y 3개 프로젝트, JSON 리포터 추가 | 1주 | ✅ |
| 18-3 | Visual Regression | `e2e/visual-regression.spec.ts` — 12개 페이지 스냅샷 + 다크테마/사이드바/모바일 | 1주 | ✅ |
| 18-4 | 접근성 자동 테스트 | `e2e/a11y.spec.ts` — WCAG 2.1 AA, 8개 페이지 + 키보드/포커스/alt/색상대비/ARIA | 0.5주 | ✅ |
| 18-5 | UI 성능 측정 | `scripts/lighthouse.js` — perf≥80/a11y≥90/best-practices≥85/seo≥80, JSON 리포트 | 0.5주 | ✅ |
| 18-6 | 메모리 릭 테스트 | `scripts/memory-leak-test.js` — N회 순환 탐색, heap 200MB 이하, 5MB/iter 성장 감지 | 0.5주 | ✅ |
| 18-7 | i18n 완성도 | `scripts/i18n-audit.js` — 하드코딩 한글 탐지 + 3개 로케일 키 커버리지 100% 검증 | 1주 | ✅ |

**신규 파일 (npm install 후 사용 가능):**
- `frontend/package.json` — devDependencies: vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, @vitejs/plugin-react, @vitest/coverage-v8, jsdom, @playwright/test, axe-core, @axe-core/playwright, lighthouse
- `frontend/vitest.config.ts` — Vitest 설정 (jsdom, path alias, coverage thresholds 60%)
- `frontend/src/test/setup.ts` — jest-dom matchers + cleanup + Next.js router mock
- `frontend/src/lib/__tests__/utils.test.ts` — formatNumber/Duration/Bytes/Percent/Cost/StatusColor/RelativeTime
- `frontend/src/lib/__tests__/i18n.test.ts` — t() 번역 함수 + formatDate/Number/RelativeTime
- `frontend/src/hooks/__tests__/use-i18n.test.ts` — useI18n 훅 locale 전환 + 포맷 함수
- `frontend/src/components/ui/__tests__/button.test.tsx` — Button 컴포넌트 (변형/크기/ref/aria)
- `frontend/src/stores/__tests__/ui-store.test.ts` — UIStore 상태 (sidebar/theme/locale/timeRange)
- `frontend/e2e/visual-regression.spec.ts` — 12페이지 스냅샷 비교 (maxDiffPixels 100)
- `frontend/e2e/a11y.spec.ts` — WCAG 2.1 AA, axe-core critical+serious 0건 목표
- `frontend/scripts/lighthouse.js` — Lighthouse 멀티페이지 성능 감사 + JSON 리포트
- `frontend/scripts/memory-leak-test.js` — Playwright CDP 기반 힙 메모리 추적
- `frontend/scripts/i18n-audit.js` — 로케일 키 커버리지 + 하드코딩 한글 탐지

**테스트 실행 (npm install 후):**
```bash
npm test              # Vitest 단위 테스트 (watch 모드)
npm run test:run      # Vitest 단위 테스트 (single run)
npm run test:coverage # 커버리지 포함 실행 → reports/coverage/
npm run test:e2e      # Playwright 전체 E2E
npm run test:e2e:visual # Visual regression (첫 실행 = baseline 생성)
npm run test:a11y     # 접근성 테스트
npm run test:perf     # Lighthouse → reports/lighthouse/
npm run test:memory   # 메모리 릭 테스트 → reports/memory/
npm run test:i18n     # i18n 커버리지 감사
```

---

## [00] Phase 28: XLog/HeatMap 트랜잭션 뷰 강화 ✅

> **목표**: XLog 트랜잭션 뷰와 히트맵을 Scouter/Jennifer/WhaTap 수준으로 강화
> **참조**: [DOCS/XLOG_DASHBOARD_REDESIGN.md](DOCS/XLOG_DASHBOARD_REDESIGN.md) §16~19, [DOCS/UI_DESIGN.md](DOCS/UI_DESIGN.md) §6.4
> **배치 근거**: 기존 Phase 11-3(XLog/HeatMap) 구현 위에 순수 프론트엔드 작업으로 즉시 시작 가능. 인프라 불필요. 상용 APM 수준 차별화 UX — 데모 시 임팩트가 가장 큰 항목.

### 28-1. 시간 범위 컨트롤 공통 컴포넌트

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 28-1-1 | `TimeRangeArrows` 컴포넌트 | 화살표 ←→↑↓ 4개 버튼 + 현재 범위 라벨 + LIVE/PAUSED 상태 표시. ← → : 범위 너비만큼 시간 이동. ↑ ↓ : 범위 절반/2배 줌 (중앙 고정). Alt+화살표 키보드 단축키 지원 | 0.5주 | ✅ |
| 28-1-2 | `TimeRangePicker` 컴포넌트 | 날짜 피커 + 시간 입력 + 기간 프리셋 (5분/15분/1시간/6시간/1일/커스텀) + 화살표 통합. 상세 뷰 전용 풀 UI | 1주 | ✅ |
| 28-1-3 | `ServerMultiSelector` 컴포넌트 | 드롭다운 체크박스 다중 선택 (최대 10개). 선택 서버 태그 표시 + 개별 해제. 검색 필터 지원 | 0.5주 | ✅ |

### 28-2. XLog 트랜잭션 뷰 강화

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 28-2-1 | 대시보드 임베드 뷰 분리 | 서비스 상세 탭의 XLog 미니 뷰: TimeRangeArrows만 표시 (날짜 입력 없음). 상위 컨텍스트 서버 상속 | 0.5주 | ✅ |
| 28-2-2 | 상세 뷰 (전체 화면) 강화 | `/traces` 화면에 TimeRangePicker + ServerMultiSelector 통합. 날짜/기간 직접 입력으로 과거 구간 조회 가능 | 1주 | ✅ |
| 28-2-3 | 복수 서버 색상 구분 | 서버별 다른 색상 점 렌더링. 범례 자동 생성. 범례 클릭으로 서버 토글. 최대 10색 팔레트 | 0.5주 | ✅ |
| 28-2-4 | 에러 트랜잭션 시각화 강화 | 에러 점 z-index 최상위 렌더링 (정상 점에 가려지지 않음). 에러 점 호버 툴팁에 에러 코드/메시지 표시 | 0.5주 | ✅ |

### 28-3. 히트맵 분리 및 강화 (WhaTap 스타일)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 28-3-1 | 히트맵 WhaTap 스타일 색상 | 멀티 톤 그라디언트 적용: 연파랑(저밀도) → 파랑 → 노랑 → 빨강(고밀도). 기존 단색 → 4단계 그라디언트 | 0.5주 | ✅ |
| 28-3-2 | 에러 오버레이 | 에러 비율 ≥ 10% 셀에 빨간 점 `●` 자동 렌더링. 셀 호버 시 에러 건수/비율 툴팁 표시 | 0.5주 | ✅ |
| 28-3-3 | 히트맵 드래그 선택 강화 | 마우스 드래그로 셀 범위 선택 → 선택 범위 내 트랜잭션 목록 필터링. 선택 요약 표시 ("32건 선택됨") | 0.5주 | ✅ |
| 28-3-4 | 히트맵 시간 범위 화살표 | 히트맵 뷰에도 TimeRangeArrows 적용. ←→ 시간 이동 / ↑↓ 줌 인/아웃 | 0.5주 | ✅ |
| 28-3-5 | XLog/HeatMap 분할 화면 | 상세 뷰에서 [XLog] [HeatMap] [분할 화면] 탭 추가. 분할 시 양쪽 시간 범위 동기화. XLog 선택 ↔ HeatMap 하이라이트 상호 연동 | 1주 | ✅ |

### 28-4. 신규 파일

| 파일 | 설명 |
|------|------|
| `dashboards/xlog-heatmap/js/time-range-control.js` | TimeRangeArrows + TimeRangePicker 통합 컨트롤 |
| `dashboards/xlog-heatmap/js/server-selector.js` | ServerMultiSelector 드롭다운 컴포넌트 |
| `dashboards/xlog-heatmap/js/split-view-manager.js` | XLog/HeatMap 분할 화면 + 시간 동기화 매니저 |
| (프론트) `frontend/src/components/xlog/TimeRangeArrows.tsx` | React 버전 TimeRangeArrows |
| (프론트) `frontend/src/components/xlog/TimeRangePicker.tsx` | React 버전 TimeRangePicker (풀 UI) |
| (프론트) `frontend/src/components/xlog/ServerMultiSelector.tsx` | React 버전 ServerMultiSelector |

---

## [01] Phase 27: Collection Server 저장 계층 구현 ✅

> **목표**: StorageBackend 인터페이스를 실제 Go 코드로 구현하고 Collection Server에 통합
> **완료일**: 2026-03-23
> **의존성**: Phase 17 (Collection Server 기반) 완료 상태
> **테스트**: Go 빌드 PASS, 유닛 테스트 21 PASS, 기존 전체 테스트 회귀 없음

### 27-1. StorageBackend 인터페이스 구현

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 27-1-1 | StorageBackend 인터페이스 + 팩토리 | `pkg/storage/backend.go`, `config.go`, `keys.go`, `factory.go` | ✅ |
| 27-1-2 | LocalBackend 구현 | `pkg/storage/local_backend.go` — atomic write, sidecar metadata, retention purge | ✅ |
| 27-1-3 | S3Backend 구현 | `pkg/storage/s3_backend.go` — minio-go/v7 SDK, AWS Signature V4 | ✅ |
| 27-1-4 | DualBackend 구현 | `pkg/storage/dual_backend.go` — primary(S3) + secondary(Local) fallback | ✅ |
| 27-1-5 | 단위 테스트 | 5개 테스트 파일, 21 PASS (Local 8 + Dual 5 + Factory 4 + Keys 3 + S3 integration) | ✅ |

### 27-2. Collection Server 통합

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 27-2-1 | 환경변수 기반 StorageConfig | `AITOP_STORAGE_TYPE` / `AITOP_STORAGE_PATH` / `AITOP_S3_*` | ✅ |
| 27-2-2 | Collect 핸들러 연동 | `POST /api/v1/collect/` → `StorageBackend.Put()` + health 엔드포인트 통합 | ✅ |
| 27-2-3 | DB 마이그레이션 | `migrations/002_storage_path_migration.sql` — `s3_key` → `evidence_storage_path` | ✅ |
| 27-2-4 | Purge 스케줄러 | `purge.go` — 6시간 주기 백그라운드 고루틴 | ✅ |

### 27-3. 테스트 환경 반영

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 27-3-1 | docker-compose.test.yaml | `AITOP_STORAGE_TYPE=local` 환경변수 추가 | ✅ |
| 27-3-2 | 계약 테스트 import 갱신 | `test/api_contract_test.go` — `internal/storage` → `pkg/storage` | ✅ |

**신규 파일:**
- `agent/pkg/storage/backend.go` — StorageBackend 인터페이스 + StorageEntry
- `agent/pkg/storage/config.go` — StorageConfig, S3Config, LocalConfig
- `agent/pkg/storage/keys.go` — EvidenceKey, TerminalLogKey, DiagnosticKey
- `agent/pkg/storage/factory.go` — NewFromConfig() 팩토리
- `agent/pkg/storage/local_backend.go` — LocalBackend (filesystem)
- `agent/pkg/storage/s3_backend.go` — S3Backend (minio-go v7)
- `agent/pkg/storage/dual_backend.go` — DualBackend (primary+secondary)
- `agent/cmd/collection-server/purge.go` — Purge 스케줄러
- `agent/migrations/002_storage_path_migration.sql` — DB 마이그레이션

---

## [02] Phase 19: AI 가치 강화 ✅

> **목표**: 경쟁 솔루션(Arize, LangSmith) 대비 AI 기능 차별화 강화
> **완료일**: 2026-03-23
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #1~2, #7

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 19-1 | LLM 평가 (Evaluation) | `/ai/evaluation` — 평가 작업 목록, 샘플 상세, A/B 테스트 radar chart, 생성 모달 | ✅ |
| 19-2 | 프롬프트 관리 Hub | `/ai/prompts` — 프롬프트 라이브러리, 에디터, 버전 히스토리/비교, 성능 추적, 테스트 실행 | ✅ |
| 19-3 | AI 비용 최적화 제안 | `/ai/costs` — 모델 비교 scatter chart, 캐시 분석, 절감 제안, 예산 알림 관리 | ✅ |

**신규 파일 (13개):**
- `frontend/src/components/ai/ai-sub-nav.tsx` — AI 페이지 공통 서브 내비게이션
- `frontend/src/app/ai/evaluation/page.tsx` — LLM 평가 페이지
- `frontend/src/components/ai/eval-job-table.tsx`, `eval-sample-detail.tsx`, `ab-comparison.tsx`
- `frontend/src/app/ai/prompts/page.tsx` — 프롬프트 Hub 페이지
- `frontend/src/components/ai/prompt-editor.tsx`, `version-diff.tsx`
- `frontend/src/app/ai/costs/page.tsx` — 비용 최적화 페이지
- `frontend/src/components/ai/cost-recommendation-card.tsx`

---

## [03] Phase 20: 운영 고도화 📋

> **목표**: 운영 효율성 + 자동화 수준 향상
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #3, #5~6
> **배치 근거**: 이상 탐지 엔진(20-1)이 Phase 22 AI Copilot 자연어 분석의 핵심 기반. PDF 보고서(20-2)는 초기 고객 유지 및 계약 갱신에 직결. 합성 모니터링(20-3)은 SLO 프로브로 Phase 9' 튜닝에도 활용.

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 20-1 | 이상 탐지 (Anomaly Detection) | 시계열 이상 탐지, 동적 임계치, ML 근본 원인 추천 | 4주 | 📋 |
| 20-2 | 진단 보고서 PDF 자동 생성 | 86개 항목 PDF, 주간/월간 리포트, 고객 브랜딩 | 2주 | 📋 |
| 20-3 | 합성 모니터링 (Synthetic) | LLM 엔드포인트 주기 호출 + 응답 품질 확인, SLO 프로브 | 2주 | 📋 |

---

## [04] Phase 24: Java/.NET SDK + 메소드 프로파일링 📋

> **목표**: 엔터프라이즈 APM 시장(Java 45% / .NET 25%)으로 확장, 기존 APM 대비 AI 통합 모니터링 차별화
> **전제**: Phase 21~23 이후 진행 또는 병렬 진행 가능 (독립적인 SDK 레이어)
> **참조**: [DOCS/JAVA_DOTNET_SDK_DESIGN.md](DOCS/JAVA_DOTNET_SDK_DESIGN.md) — 상세 설계 문서
> **배치 근거**: 독립 SDK 레이어로 다른 Phase와 병렬 가능. Phase 25 SDK 자동 인식·언어 탐지의 선행 조건. 엔터프라이즈 고객 확보를 위한 Java/Spring → Python LLM 통합 트레이스는 업계 차별화 포인트.

### 24-1. Java SDK MVP

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 24-1-1 | OTel Java Agent 통합 | `opentelemetry-javaagent.jar` 기반 자동 계측 (Spring Boot, JDBC, HttpClient) — JVM 옵션 1줄 추가로 활성화 | 2주 | 📋 |
| 24-1-2 | AITOP Java Extension | ByteBuddy 기반 메소드 프로파일링 확장 (임계치 5ms 필터링, ThreadLocal 콜 스택, 비동기 배치 전송) | 2주 | 📋 |
| 24-1-3 | SQL 바인딩 캡처 | PreparedStatement 바인딩 파라미터 캡처 + PII 컬럼 자동 마스킹 (password/token/email 등) | 1주 | 📋 |
| 24-1-4 | JVM 메트릭 수집 | Heap/GC/Thread/커넥션 풀 15개 메트릭 + SLO 알림 (Heap>90%, 데드락, 커넥션>95%) | 1주 | 📋 |

### 24-2. .NET SDK MVP

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 24-2-1 | OTel .NET 자동 계측 | ASP.NET Core / HttpClient / EF Core / gRPC 자동 계측 패키지 통합 | 2주 | 📋 |
| 24-2-2 | CLR Profiler 통합 | `ICorProfilerCallback` 기반 메소드 JIT Hook — 환경변수로 활성화, 코드 변경 없음 | 3주 | 📋 |
| 24-2-3 | CLR 메트릭 수집 | GC/ThreadPool/예외 11개 메트릭 + `System.Diagnostics.Metrics` 통합 | 1주 | 📋 |

### 24-3. XLog 통합 뷰 (메소드 콜 트리 + LLM 체인 통합)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 24-3-1 | 언어 감지 로직 | `telemetry.sdk.language` Span 속성 기반 자동 감지 → Java/Python/Go 뷰 자동 선택 | 0.5주 | 📋 |
| 24-3-2 | 메소드 콜 트리 UI | 접기/펼치기 가능한 트리 컴포넌트 (Scouter 스타일), SQL 바인딩 인라인 표시 | 2주 | 📋 |
| 24-3-3 | 통합 Trace 뷰 | Java→Python 부모-자식 Trace 연결 시각화: 공통 스팬 타임라인 + 언어별 확장 패널 | 1.5주 | 📋 |

### 24-4. K8s 자동 주입

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 24-4-1 | AITOP K8s Operator | Admission Webhook으로 Java/CLR 에이전트 자동 주입 (Pod 어노테이션만 추가) | 2주 | 📋 |
| 24-4-2 | Helm 차트 업데이트 | Java/CLR 에이전트 이미지 + ConfigMap + Secret 관리 | 1주 | 📋 |

**기대 효과**:
- 엔터프라이즈 APM 시장(Java 45% + .NET 25%) 접근 가능
- Scouter/Pinpoint 대비 차별화: Python AI 체인과 Java 메소드 트리 **통합 뷰** (업계 최초)
- "Java Spring → Python LLM" 엔드투엔드 병목 추적 — 기존 APM으로는 불가능

---

## [05] Phase 25: 서버 그룹 관리 + SDK 자동 인식 + 중앙 설정 편집 📋

> **목표**: 대규모 서버 환경에서 서버 그룹화 및 그룹 단위 관리, UI 기반 에이전트 설정 원격 편집, SDK/에이전트 자동 탐지 기능 구현
> **선행 조건**: Phase 24 (Java/.NET SDK) 완료 또는 병행 가능 (독립 기능)
> **참조**: [DOCS/AGENT_DESIGN.md §5.5~5.8](DOCS/AGENT_DESIGN.md) · [DOCS/UI_DESIGN.md §8.3~8.6](DOCS/UI_DESIGN.md)
> **배치 근거**: Phase 24 SDK 언어 탐지(telemetry.sdk.language)를 기반으로 SDK 자동 인식이 완성됨. 서버 그룹 관리는 Phase 26 미들웨어 Collector 언어별 자동 활성화의 선행 조건.

### 25-1. SDK / 에이전트 자동 인식

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-1-1 | 에이전트 자동 감지 UI | Heartbeat 기반 신규 에이전트 탐지 → Fleet 콘솔에 "🆕 NEW" 배지 표시, 24시간 유지 | 0.5주 | 📋 |
| 25-1-2 | SDK 언어 자동 판별 | OTel `telemetry.sdk.language` 속성 기반 — Java/Python/Node/.NET/Go 아이콘 자동 표시 | 0.5주 | 📋 |
| 25-1-3 | 신규 SDK 감지 알림 | 첫 OTel 데이터 수신 시 서비스 맵 자동 노드 추가 + 알림 발송 (설정 가능) | 0.5주 | 📋 |
| 25-1-4 | AI 환경 자동 탐지 | Heartbeat `ai_detected` 필드 → AI 탭 자동 활성화, AI 메트릭 수집 시작 | 0.5주 | 📋 |

### 25-2. 서버 그룹 관리

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-2-1 | 그룹 CRUD API | `POST/GET/PUT/DELETE /api/v1/fleet/groups` — 그룹 생성·조회·수정·삭제 | 1주 | 📋 |
| 25-2-2 | 에이전트 그룹 할당 API | `POST /api/v1/fleet/groups/{id}/agents` — 할당 즉시 에이전트 `host_group` 설정 반영 (🟢 Hot Reload) | 0.5주 | 📋 |
| 25-2-3 | 그룹 관리 UI | 그룹 목록 + 드래그&드롭 할당 + 체크박스 선택 일괄 할당 (`/agents/groups`) | 1.5주 | 📋 |
| 25-2-4 | 그룹 대시보드 UI | 그룹별 KPI 요약 + 서버 목록 + 헬스 집계 + 트렌드 (`/agents/groups/{id}`) | 1주 | 📋 |
| 25-2-5 | 그룹별 수집 작업 | 그룹 단위 즉시 수집 트리거, 그룹 단위 OTA 업데이트 | 0.5주 | 📋 |

### 25-3. 중앙 설정 관리 (UI에서 agent.yaml 원격 편집)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-3-1 | 설정 스키마 레지스트리 | 에이전트 버전별 `config-schema.json` 관리 — 기본값·타입·반영수준 포함 | 1주 | 📋 |
| 25-3-2 | 설정 CRUD API | `GET/PUT /api/v1/agents/{id}/config` + 이력 관리 + 롤백 | 1주 | 📋 |
| 25-3-3 | 설정 즉시 폴링 트리거 | `POST /api/v1/agents/{id}/config/reload` — Hot Reload 항목 즉시 적용 | 0.5주 | 📋 |
| 25-3-4 | 설정 편집 UI | 섹션별 폼 편집 + 반영수준 아이콘(🟢🟡🔴) + 유효성 검증 + 설정 이력 뷰 | 2주 | 📋 |
| 25-3-5 | 그룹 일괄 설정 편집 | 그룹 내 전체 에이전트에 동일 설정 일괄 적용 UI | 1주 | 📋 |

### 25-4. 에이전트 원격 재기동

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-4-1 | 재기동 API | `POST /api/v1/agents/{id}/restart` — HeartbeatResponse에 RESTART_COMMAND 삽입 | 0.5주 | 📋 |
| 25-4-2 | 재기동 UI | [🔄 에이전트 재기동] 버튼 + 진행 상태 표시 + 완료 확인 | 0.5주 | 📋 |
| 25-4-3 | App Restart 안내 UI | 🔴 항목 변경 시 "수동 재기동 필요" 경고 모달 + 절차 안내 + [📋 설정 복사] | 0.5주 | 📋 |

---

## [06] Phase 26: 미들웨어 런타임 모니터링 📋

> **목표**: Java/..NET/Node.js/Python/Go 언어별 런타임 미들웨어(스레드 풀, 커넥션 풀, 이벤트 루프, 워커, 고루틴)를 실시간 수집·시각화하고, 메시지 큐(Kafka/RabbitMQ/ActiveMQ) 상태를 통합 모니터링한다.
> **선행 조건**: Phase 25 (에이전트 그룹 관리 + 중앙 설정) 완료 후 진행
> **참조**: [DOCS/AGENT_DESIGN.md §3.2.5](DOCS/AGENT_DESIGN.md) · [DOCS/UI_DESIGN.md §8.7](DOCS/UI_DESIGN.md) · [DOCS/METRICS_DESIGN.md §13](DOCS/METRICS_DESIGN.md)
> **배치 근거**: Phase 25의 서버 그룹 관리·중앙 설정·언어 자동 감지가 완성돼야 언어별 Collector 자동 활성화가 가능. Redis/Cache Collector(26-5) 포함으로 데이터베이스 계층까지 통합 가시성 확보.

### 26-1. 언어별 미들웨어 Collector 구현

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-1-1 | Java 미들웨어 Collector | JMX MBean (Thread Pool + HikariCP/DBCP/C3P0 + Session) + jcmd 통합 수집 | 1.5주 | 📋 |
| 26-1-2 | .NET 미들웨어 Collector | dotnet-counters / CLR EventSource (Kestrel + Thread Pool + GC + EF Core Pool) | 1.5주 | 📋 |
| 26-1-3 | Node.js 미들웨어 Collector | Event Loop Lag/Utilization (`perf_hooks`) + Active Connections + pg-pool/mongoose Pool | 1주 | 📋 |
| 26-1-4 | Python 미들웨어 Collector | Gunicorn stats socket + Worker Pool + SQLAlchemy Pool (`engine.pool.status()`) | 1주 | 📋 |
| 26-1-5 | Go 미들웨어 Collector | `runtime.NumGoroutine()` + `sql.DB.Stats()` + `/debug/vars` 수집 | 1주 | 📋 |
| 26-1-6 | 언어 자동 감지 로직 | Heartbeat `runtime_language` 필드 + 프로세스/패키지 탐지 → Collector 자동 활성화 | 0.5주 | 📋 |

### 26-2. Connection Pool 실시간 모니터링

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-2-1 | 커넥션 풀 메트릭 표준화 | `middleware.connection_pool.*` 네임스페이스 — 8개 구현체 통합 (HikariCP/DBCP/EF Core/pg-pool 등) | 1주 | 📋 |
| 26-2-2 | 누수 감지 알림 | active/max ≥ 90% 경고, pending > 0 이 30초 지속 시 PagerDuty | 0.5주 | 📋 |
| 26-2-3 | Connection Pool 대시보드 UI | Active/Idle 게이지 + 대기 시간 히스토그램(P50/P95/P99) + 누수 알림 패널 | 1.5주 | 📋 |

### 26-3. 메시지 큐 모니터링

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-3-1 | Kafka Collector | Consumer Group Lag (파티션별), Producer sent rate, Topic offset — kafka-consumer-groups.sh + JMX | 1주 | 📋 |
| 26-3-2 | RabbitMQ Collector | Queue Depth + Consumer 수 + Publish/Deliver rate — Management HTTP API (`/api/queues`) | 0.5주 | 📋 |
| 26-3-3 | ActiveMQ Collector | Queue Depth + Enqueue/Dequeue count + Consumer count — JMX + Jolokia REST | 0.5주 | 📋 |
| 26-3-4 | 메시지 큐 대시보드 UI | Kafka Lag 차트 + RabbitMQ Queue Depth 스파크라인 + 지연 경보 패널 | 1주 | 📋 |

### 26-4. 미들웨어 전용 대시보드 UI

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-4-1 | 언어별 대시보드 자동 생성 | `runtime_language` 감지 후 해당 언어 미들웨어 패널 세트 자동 활성화 | 1주 | 📋 |
| 26-4-2 | Thread Pool 실시간 뷰 | Active/Idle/Max 게이지 + Queue 깊이 스파크라인 (Java/.NET) | 1주 | 📋 |
| 26-4-3 | Event Loop 실시간 뷰 | Lag 라인 차트 + Utilization 게이지 + 100ms 경고선 (Node.js) | 0.5주 | 📋 |
| 26-4-4 | Worker Pool 실시간 뷰 | Active/Idle 바 차트 + Restart 카운터 (Python) | 0.5주 | 📋 |
| 26-4-5 | Goroutine 누수 감지 뷰 | Count 라인 차트 + 기준값 × 2배 경계선 + pprof 딥링크 (Go) | 0.5주 | 📋 |

### 26-5. Redis/Cache Collector

> **목표**: Redis·Valkey·KeyDB·DragonflyDB·Memcached 캐시 계열 DB를 자동 탐지하고 메모리·성능·복제·영속성·클러스터 상태를 수집·시각화한다.
> **참조**: [DOCS/AGENT_DESIGN.md §3.2 Redis/Cache Collector](DOCS/AGENT_DESIGN.md) · [DOCS/METRICS_DESIGN.md §13.9](DOCS/METRICS_DESIGN.md) · [DOCS/UI_DESIGN.md §8.8](DOCS/UI_DESIGN.md)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-5-1 | Redis/Cache Collector 구현 | `INFO all` · `SLOWLOG GET` · `CONFIG GET` · `CLUSTER INFO` 수집 — Redis/Valkey/KeyDB/DragonflyDB 공통 | 1.5주 | 📋 |
| 26-5-2 | Memcached Collector 구현 | `stats` 명령으로 get_hits/get_misses · curr_connections · bytes · evictions 수집 | 0.5주 | 📋 |
| 26-5-3 | 엔진 자동 탐지 로직 | 포트 6379/11211 스캔 + INFO 응답의 `redis_version` / `keydb_version` / `dragonfly_version` 구분 | 0.5주 | 📋 |
| 26-5-4 | 메트릭 표준화 | `cache.*` 네임스페이스 — 메모리/성능/커넥션/Persistence/Replication/Keyspace 전 항목 Prometheus 노출 | 1주 | 📋 |
| 26-5-5 | Redis/Cache 대시보드 UI | Hit Rate 게이지 · 메모리 사용률 · Eviction 추세 + Slow Log 테이블 + Replication Lag 차트 + Keyspace 분포 파이 차트 | 1.5주 | 📋 |
| 26-5-6 | Redis Cluster 지원 | `CLUSTER INFO` 기반 cluster_state · 슬롯 배분(assigned/ok/pfail/fail) 수집 및 Cluster 전용 뷰 | 1주 | 📋 |
| 26-5-7 | 알림 규칙 등록 | Hit Rate < 80% · 메모리 > 80% · Replication Lag > 1MB · Evictions 급증 → Slack/PagerDuty 알림 | 0.5주 | 📋 |

---

## [07] Phase 21: 엔터프라이즈 기능 📋

> **목표**: 대기업 고객 요구사항 충족
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #4, §4.3 #6
> **배치 근거**: Phase 24/25 SDK 기반이 완성돼야 Continuous Profiling 구현 가능. Terraform Provider는 Phase 26 미들웨어 리소스까지 포함해야 완전함. SSO는 대기업 판매 시 필수 조건 — SDK·미들웨어 기능 완성 후 세일즈 가속에 활용.

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 21-1 | Continuous Profiling | Go/Python/Java CPU/Memory Flame Graph → Trace 연결 | 3주 | 📋 |
| 21-2 | Terraform Provider | AITOP 리소스 (알림, SLO, 대시보드)를 IaC로 관리 | 3주 | 📋 |
| 21-3 | SSO (SAML/OIDC) | 엔터프라이즈 SSO 연동 (Okta, Azure AD, Google Workspace) | 2주 | 📋 |

---

## [08] Phase 22: AI Copilot + 자동 탐색 📋

> **목표**: AI 기반 자동화로 사용자 경험 혁신
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.3 #1~2, #8
> **배치 근거**: Phase 19 LLM 평가·Prompt Hub와 Phase 20 이상 탐지 엔진이 갖춰진 후에 Copilot 구현 효과가 극대화됨. 자연어 → PromQL 변환의 정확도는 Phase 19 기반 품질 데이터에 의존.

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 22-1 | AI Copilot | "TTFT가 높은 서비스?" 자연어 → PromQL 변환, 대화형 분석 | 4주 | 📋 |
| 22-2 | 토폴로지 자동 탐색 | 에이전트가 네트워크 연결 기반 서비스 의존관계 자동 발견 | 3주 | 📋 |
| 22-3 | Fine-tuning 모니터링 | 학습 loss/accuracy 추적, 체크포인트 관리, 학습-추론 비교 | 4주 | 📋 |

---

## [09] Phase 23: 멀티 클라우드 + 모바일 📋

> **목표**: 글로벌 시장 대응
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.3 #3~5, #7
> **배치 근거**: 글로벌 확장은 국내 상용화 안정 이후 진행. Phase 22 Copilot·토폴로지 탐색이 완성된 상태에서 멀티 클라우드 통합의 차별화 가치가 극대화됨.

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 23-1 | 멀티 클라우드 통합 | AWS/GCP/Azure 리소스 비용 + 성능 통합 뷰 | 4주 | 📋 |
| 23-2 | 모바일 앱 | iOS/Android 알림 + 기본 대시보드 | 6주 | 📋 |
| 23-3 | Data Pipeline 모니터링 | Airflow, Prefect, Dagster ML 파이프라인 추적 | 3주 | 📋 |
| 23-4 | 비즈니스 KPI 연동 | AI 메트릭 → 매출/전환율 상관관계 | 3주 | 📋 |
| 23-5 | 글로벌 마켓플레이스 | 플러그인/대시보드/프롬프트 공유 | 4주 | 📋 |

---

## [10] Phase 7': E2E 통합 검증 (재설계) 🔄 🔧

> **목표**: 새 UI + Agent 기준으로 전체 시스템 E2E 검증
> **전제**: Phase 17 Backend API 완성 후 진행
> **원래**: Phase 7 (Grafana 기반) → Next.js UI로 교체됨에 따라 재설계
> **참조**: [DOCS/E2E_REDESIGN.md](DOCS/E2E_REDESIGN.md) — 재설계 배경 + 검증 범위 + 성공 기준
> **배치 근거**: 인프라 필요(🔧)로 코드 작업과 병렬 진행 가능. E2E 스크립트는 이미 완성(30%)되어 실제 Docker 환경 실행만 대기 중. 코드 작업 블로커가 아니므로 수작업 영역으로 분리.

| # | 작업 | 검증 항목 | 상태 |
|---|------|----------|------|
| 7'-1 | 로컬 Docker 통합 테스트 | 전체 스택 기동, 헬스체크, 텔레메트리 수집 확인 | ⚠️ 🔧 |
| 7'-2 | 부하 테스트 + 샘플링 | Locust 4 시나리오, Tail Sampling 보존율, 비용 절감 효과 | ⚠️ 🔧 |
| 7'-3 | Trace 연속성 검증 | 5 레이어 Trace ID 연속, Baggage 전달, Metric↔Log 상관관계 | ⚠️ 🔧 |
| 7'-4 | 보안 감사 | OWASP Top 10, PII 마스킹 검증, mTLS 인증서 검증 | ⚠️ 🔧 |

**신규 파일 (Session 27 — 파일 생성 완료, 실행은 실제 인프라 필요):**
- `DOCS/E2E_REDESIGN.md` — Phase 7' 재설계 문서 (배경/범위/성공기준/연관파일)
- `docker-compose.e2e.yaml` — 전체 스택 E2E 환경 (10개 서비스: Frontend + Collection Server + PostgreSQL + MinIO + OTel + Prometheus + Tempo + Loki + Demo RAG + Locust)
- `infra/docker/otelcol-e2e.yaml` — OTel Collector E2E 설정 (Tail Sampling 5정책 포함)
- `scripts/e2e/healthcheck.sh` — 9개 서비스 헬스체크 + OTel OTLP Span 전송 + MinIO 버킷 + PostgreSQL DB 확인
- `scripts/e2e/trace-continuity.sh` — 5레이어 Trace 연속성 + W3C traceparent/Baggage + Tempo TraceQL + Metric↔Log 상관관계
- `scripts/e2e/security-audit.sh` — OWASP A01~A10 체크리스트 + PII 마스킹 + mTLS + SQL/XSS/Command Injection
- `locust/locustfile.py` — 4개 시나리오 (APIQueryUser 60% / AgentRegUser 10% / HeartbeatUser 20% / CollectTrigUser 10%)
- `locust/locust.conf` — Locust 설정 (200 users, 10 spawn-rate, 10분 run-time)
- `agent/Makefile` — e2e 타겟 8개 추가 (e2e-up/down/logs/ps/health/trace/security/load/load-ui/all)

**실행 방법 (Docker 환경 필요):**
```bash
# 전체 스택 기동
make -C agent e2e-up

# 헬스체크 (서비스 기동 후 60초 대기)
make -C agent e2e-health

# Trace 연속성 검증
make -C agent e2e-trace

# 보안 감사
make -C agent e2e-security

# 부하 테스트 (locust 설치 필요: pip install locust)
make -C agent e2e-load

# 전체 순서 실행
make -C agent e2e-all
```

---

## [11] Phase 8': Kubernetes 통합 배포 📋 🔧

> **목표**: Next.js Frontend + Collection Server + Agent를 Helm으로 통합 배포
> **전제**: Phase 7' 검증 통과 후 진행
> **배치 근거**: Phase 7' E2E 검증 통과가 필수 선행 조건. 수작업 특성상 코드 기능(Phase 27·19~26)이 완성된 후 배포해야 재배포 횟수 최소화. Phase 27 StorageBackend 구현 완료 후 배포해야 S3/Local 선택이 가능.

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 8'-1 | Frontend Dockerfile + Helm | Next.js 프로덕션 빌드 + Helm 서브차트 추가 | 📋 🔧 |
| 8'-2 | Collection Server Helm | gRPC + REST + PostgreSQL + MinIO 연동 Helm 차트 | 📋 🔧 |
| 8'-3 | Helm Dry-Run + 스테이징 | dev/prod dry-run, 스테이징 배포, Pod 상태 확인 | 📋 🔧 |
| 8'-4 | 프로덕션 배포 | Thanos S3, Alertmanager → Slack/PagerDuty, Grafana Ingress+TLS | 📋 🔧 |
| 8'-5 | DEB/RPM 패키지 실빌드 | nfpm → DEB/RPM 실제 빌드 + 설치 검증 | 📋 🔧 |

---

## [12] Phase 9': SLO 튜닝 + 운영 안정화 📋 🔧

> **목표**: 프로덕션 운영 데이터 기반 임계치 튜닝
> **전제**: Phase 8' 프로덕션 배포 후 1~2주 운영 데이터 확보
> **배치 근거**: Phase 8' 프로덕션 배포 + 실제 트래픽 1~2주 관측 후에만 SLO 임계치 실측 가능. Phase 20-3 합성 모니터링이 SLO 프로브로 활용됨. 항상 수작업 영역의 마지막 단계.

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 9'-1 | SLO 임계치 튜닝 | TTFT/TPS/가드레일/GPU/에러율 실측 후 ±20% 조정 | 📋 🔧 |
| 9'-2 | Tail Sampling 최적화 | 정책별 보존율 확인, 비용 목표 달성 (~$200/월 @1K RPS) | 📋 🔧 |
| 9'-3 | 대시보드 커스터마이징 | 팀별 필터, 비즈니스 KPI, On-Call 링크 | 📋 🔧 |

---

## 문서 현황

| 파일 경로 | 상태 | 비고 |
|-----------|------|------|
| `DOCS/ARCHITECTURE.md` | ✅ v2.0.2 | OTel + Agent 통합 아키텍처 — Collection Server StorageBackend 옵션(S3/Local/Dual) 추가 |
| `DOCS/METRICS_DESIGN.md` | ✅ v2.1.0 | 지표 정의 + Agent 수집 메트릭 매핑 (13개 섹션) — 미들웨어 런타임 메트릭 추가 (§13) |
| `DOCS/JAVA_DOTNET_SDK_DESIGN.md` | ✅ v1.1.0 | Java/.NET SDK 및 메소드 프로파일링 통합 설계 — 설정 항목별 반영 수준(🟢🟡🔴) 추가 |
| `DOCS/UI_DESIGN.md` | ✅ v2.2.0 | 통합 모니터링 UI 설계 — 미들웨어 전용 대시보드·Connection Pool·Thread Pool·Goroutine 뷰 추가 (§8.7) |
| `DOCS/AGENT_DESIGN.md` | ✅ v1.3.1 | AITOP Agent 상세 설계 — StorageBackend 인터페이스·S3/Local/Dual 구현체·설정 스키마 추가 (§7.6) |
| `DOCS/SOLUTION_STRATEGY.md` | ✅ v1.0.0 | 완성도 평가 + 경쟁 분석 + 상용화 로드맵 |
| `DOCS/E2E_REDESIGN.md` | ✅ v1.0.0 | Phase 7' E2E 재설계 문서 (배경/범위/성공기준) |
| `DOCS/XLOG_DASHBOARD_REDESIGN.md` | ✅ | XLog/HeatMap 3패널 상세 설계 |
| `DOCS/AI_SERVICE_FLOW.md` | ✅ | AI 서비스 처리 흐름 (초보자용) |
| `DOCS/LOCAL_SETUP.md` | ✅ | 로컬 환경 가이드 — 수집 서버 스토리지 백엔드 설정 안내 추가 (§10) |
| `DOCS/TEST_GUIDE.md` | ✅ | 9단계 테스트/운영 가이드 |
| `DOCS/MANUAL_TESTING_GUIDE.md` | ✅ | 수동 테스트 절차 |
| `README.md` | ✅ | 프로젝트 진입점 (AITOP 브랜드, 전체 구조 반영) |

---

## 주요 설계 결정 사항 (ADR)

| ADR | 결정 | 이유 |
|-----|------|------|
| ADR-001 | Dual Collector (Agent+Gateway) | 수집 부하와 Tail Sampling 격리 |
| ADR-002 | Tail-based Sampling 우선 | 에러/고레이턴시 트레이스 사전 식별 불가 → ~81% 비용 절감 |
| ADR-003 | W3C TraceContext + Baggage | OTel 기본 표준, 벤더 중립 |
| ADR-004 | vLLM 비동기 제너레이터 래퍼 | 스트리밍 TTFT 포착을 위한 필수 패턴 |
| ADR-005 | DCGM → Prometheus 브릿지 | OTel GPU Convention이 아직 실험적 |
| ADR-006 | REST MVP → gRPC 전환 | Phase 15 MVP에서 REST, Phase 17에서 gRPC 정식 전환 |
| ADR-007 | 인메모리 → PostgreSQL | Phase 15 MVP에서 인메모리, Phase 17에서 PostgreSQL 전환 |
| ADR-008 | StorageBackend 인터페이스 패턴 | Evidence 파일 저장을 S3/Local/Dual로 추상화 — 테스트 환경에서 S3 의존성 제거, 프로덕션 전환 용이 |
| ADR-009 | Enterprise/Lite 두 배포 모드 분리 | 상시 운영(PostgreSQL+S3)과 단기 진단(SQLite+로컬)을 별도 모드로 설계 — 컨설팅 시나리오 지원 및 설치 장벽 최소화 |
| ADR-010 | AGPL-free 인프라 스택 전략 | Grafana/Tempo/Loki/MinIO(AGPL-3.0)를 자체 UI/Jaeger/자체 로그/LocalBackend로 대체 — 상용 배포 시 소스 공개 의무 회피 |

---

## [13] Phase 29: Lite 모드 구현 📋

> **목표**: `docker-compose up` 원클릭으로 설치·진단·보고서·제거가 가능한 Lite 배포 모드 구현
> **배경**: AGENT_DESIGN.md §2.3~2.4, ARCHITECTURE.md §13, LOCAL_SETUP.md §11 설계 완료 (Session 37). 이제 구현 차례.
> **의존성**: Phase 27 StorageBackend 구현과 병행 가능 (독립 레이어)
> **비즈니스 가치**: 성능 진단 컨설팅 시나리오 지원 — Docker만 있으면 1주일 투입 후 흔적 없이 제거

### 29-1. 에이전트 Lite 모드 (`--mode=lite`)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 29-1-1 | `--mode=lite` 플래그 구현 | agent/cmd/root.go — mode 파싱, Lite 전용 설정 로더 | 0.5주 | 📋 |
| 29-1-2 | SQLite 스토리지 통합 | agent/storage/lite_sqlite.go — WAL 모드, 7일 자동 정리, retention cron | 1주 | 📋 |
| 29-1-3 | Fleet/OTA 기능 비활성화 | Lite 모드에서 FleetManager/OTAUpdater 미초기화, gRPC 연결 생략 | 0.5주 | 📋 |
| 29-1-4 | 내장 HTTP UI 서버 | agent/lite/ui_server.go — XLog/HeatMap 전용 경량 UI (localhost:8080) | 1주 | 📋 |

### 29-2. 보고서 생성 (`aitop-lite report`)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 29-2-1 | 보고서 데이터 집계 | SQLite에서 XLog 분포·슬로우 트랜잭션·LLM 체인 구간별 집계 | 1주 | 📋 |
| 29-2-2 | PDF 렌더링 | Go PDF 라이브러리 (wkhtmltopdf or chromedp) — HeatMap 스냅샷 포함 | 1주 | 📋 |
| 29-2-3 | HTML 보고서 | 단일 HTML 파일 (인라인 CSS/JS) — 외부 의존 없이 브라우저에서 열기 | 0.5주 | 📋 |

### 29-3. docker-compose.lite.yaml

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 29-3-1 | `docker-compose.lite.yaml` 작성 | aitop-server + aitop-agent 최소 구성, volumes: data + reports | 0.5주 | 📋 |
| 29-3-2 | `aitop-lite cleanup` 명령 | SQLite DB, 로컬 캐시, 임시 파일 완전 삭제 커맨드 구현 | 0.5주 | 📋 |
| 29-3-3 | Lite 모드 E2E 시나리오 | `scripts/lite-e2e.sh` — up → 수집 확인 → 보고서 생성 → cleanup 검증 | 1주 | 📋 |

---

## [14] Phase 30: AGPL-free 인프라 스택 전환 📋

> **목표**: 상용 배포 시 AGPL-3.0 라이선스 의무를 회피하기 위해 AGPL 컴포넌트를 Apache 2.0 / 자체 구현으로 대체
> **배경**: 라이선스 분석 결과 Grafana/Tempo/Loki/MinIO가 AGPL-3.0 — 번들 배포 또는 SaaS 시 소스 공개 의무 발생
> **참조**: [DOCS/SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §8 라이선싱 & OSS 컴플라이언스 전략
> **의존성**: 독립 작업 — 다른 Phase와 병행 가능

### 30-1. AGPL 컴포넌트 대체

| # | 현재 (AGPL) | 대안 | 대안 라이선스 | 상태 |
|---|------------|------|-------------|------|
| 30-1-1 | Grafana | 자체 Next.js UI | 자체 코드 | ✅ 이미 완료 |
| 30-1-2 | MinIO | LocalBackend / AWS S3 | 자체 코드 / 상용 | ✅ Phase 27 완료 |
| 30-1-3 | Tempo → Jaeger | Jaeger (Apache 2.0) docker-compose 전환 + OTel exporter 설정 변경 | 1주 | 📋 |
| 30-1-4 | Loki → 자체 로그 | Collection Server 내장 로그 저장 + 프론트엔드 로그 뷰어 활용 | 2주 | 📋 |

### 30-2. 컴플라이언스 문서

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 30-2-1 | `THIRD_PARTY_LICENSES.md` 생성 | Go/NPM 전체 의존성 라이선스 목록 + 인프라 컴포넌트 고지 | 📋 |
| 30-2-2 | docker-compose 라이선스 주석 | AGPL 컴포넌트에 라이선스 경고 주석 추가 | 📋 |
| 30-2-3 | AGPL-free docker-compose 제공 | `docker-compose.commercial.yaml` — Jaeger + PostgreSQL + OTel (AGPL 없음) | 📋 |

---

*이 파일은 각 작업 세션 종료 시 업데이트한다.*
*상세 이전 이력은 [WORK_STATUS_OLD.md](WORK_STATUS_OLD.md)를 참조한다.*
*솔루션 방향성은 [DOCS/SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md)를 참조한다.*
