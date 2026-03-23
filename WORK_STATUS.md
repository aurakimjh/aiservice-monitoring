# WORK_STATUS.md — AITOP 작업 진행 현황 및 로드맵

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2026-03-23 (Session 28 — Java/.NET SDK 설계 문서 작성)
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
  완료된 작업 (Phase 1~16, Session 1~22)
═══════════════════════════════════════════════════════════════════════
Phase 1~6:   OTel 인프라 + SDK + 대시보드 + Helm + CI/CD    ████████████ 100% ✅
Phase 10~14: 상용 솔루션 UI (26개 화면)                       ████████████ 100% ✅
Phase 15:    Agent MVP (Core+Collector+Fleet+gRPC+DB+S3)     ████████████ 100% ✅
Phase 16:    Agent GA (IT/AI Collector+CLI+OTA+Fleet 콘솔)   ████████████ 100% ✅

═══════════════════════════════════════════════════════════════════════
  진행 중 / 예정 작업
═══════════════════════════════════════════════════════════════════════

── 단기 (1~3개월) — 상용화 기반 ─────────────────────────────────────
Phase 17: Backend API + 실데이터 통합    [██████████] 100%  ✅
Phase 18: 프론트엔드 품질 + 자동 테스트  [██████████] 100%  ✅
Phase 7': E2E 통합 검증 (재설계)         [███░░░░░░░]  30%  🔄 🔧
Phase 8': Kubernetes 통합 배포           [░░░░░░░░░░]   0%  📋 🔧
Phase 9': SLO 튜닝 + 운영 안정화        [░░░░░░░░░░]   0%  📋 🔧

── 중기 (3~6개월) — 경쟁력 강화 ──────────────────────────────────────
Phase 19: AI 가치 강화                   [░░░░░░░░░░]   0%  📋
Phase 20: 운영 고도화                    [░░░░░░░░░░]   0%  📋
Phase 21: 엔터프라이즈 기능              [░░░░░░░░░░]   0%  📋

── 장기 (6~12개월) — 시장 리더십 ─────────────────────────────────────
Phase 22: AI Copilot + 자동 탐색         [░░░░░░░░░░]   0%  📋
Phase 23: 멀티 클라우드 + 모바일          [░░░░░░░░░░]   0%  📋
Phase 24: Java/.NET SDK + 메소드 프로파일링[░░░░░░░░░░]   0%  📋
```

---

## Phase 17: Backend API + 실데이터 통합 🔄

> **목표**: Collection Server를 본격 Backend API로 발전시키고, Frontend 전체 화면을 실데이터로 검증
> **현재**: 테스트 환경 + API 훅 + E2E 시나리오 + 계약 테스트 완료 (40%)
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

### 17-3. 실데이터 통합 검증 ✅ 자동화 완료

> Docker 테스트 환경에서 에이전트를 설치하고 실데이터로 UI를 검증.
> 수작업 단계를 스크립트로 자동화 완료 (Session 25).

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

## Phase 7': E2E 통합 검증 (재설계) 🔄 🔧

> **목표**: 새 UI + Agent 기준으로 전체 시스템 E2E 검증
> **전제**: Phase 17 Backend API 완성 후 진행
> **원래**: Phase 7 (Grafana 기반) → Next.js UI로 교체됨에 따라 재설계
> **참조**: [DOCS/E2E_REDESIGN.md](DOCS/E2E_REDESIGN.md) — 재설계 배경 + 검증 범위 + 성공 기준

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

## Phase 8': Kubernetes 통합 배포 📋 🔧

> **목표**: Next.js Frontend + Collection Server + Agent를 Helm으로 통합 배포
> **전제**: Phase 7' 검증 통과 후 진행

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 8'-1 | Frontend Dockerfile + Helm | Next.js 프로덕션 빌드 + Helm 서브차트 추가 | 📋 🔧 |
| 8'-2 | Collection Server Helm | gRPC + REST + PostgreSQL + MinIO 연동 Helm 차트 | 📋 🔧 |
| 8'-3 | Helm Dry-Run + 스테이징 | dev/prod dry-run, 스테이징 배포, Pod 상태 확인 | 📋 🔧 |
| 8'-4 | 프로덕션 배포 | Thanos S3, Alertmanager → Slack/PagerDuty, Grafana Ingress+TLS | 📋 🔧 |
| 8'-5 | DEB/RPM 패키지 실빌드 | nfpm → DEB/RPM 실제 빌드 + 설치 검증 | 📋 🔧 |

---

## Phase 9': SLO 튜닝 + 운영 안정화 📋 🔧

> **목표**: 프로덕션 운영 데이터 기반 임계치 튜닝
> **전제**: Phase 8' 프로덕션 배포 후 1~2주 운영 데이터 확보

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 9'-1 | SLO 임계치 튜닝 | TTFT/TPS/가드레일/GPU/에러율 실측 후 ±20% 조정 | 📋 🔧 |
| 9'-2 | Tail Sampling 최적화 | 정책별 보존율 확인, 비용 목표 달성 (~$200/월 @1K RPS) | 📋 🔧 |
| 9'-3 | 대시보드 커스터마이징 | 팀별 필터, 비즈니스 KPI, On-Call 링크 | 📋 🔧 |

---

## Phase 19: AI 가치 강화 📋

> **목표**: 경쟁 솔루션(Arize, LangSmith) 대비 AI 기능 차별화 강화
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #1~2, #7

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 19-1 | LLM 평가 (Evaluation) | LLM-as-a-Judge 자동 평가, 응답 품질 점수, A/B 테스트 | 4주 | 📋 |
| 19-2 | 프롬프트 관리 Hub | 버전 관리, 성능 추적 (버전별 TTFT/TPS/품질), 팀 공유 | 3주 | 📋 |
| 19-3 | AI 비용 최적화 제안 | 모델별 비용 효율 비교, 캐시 활용도, 토큰 절감 추천 | 3주 | 📋 |

---

## Phase 20: 운영 고도화 📋

> **목표**: 운영 효율성 + 자동화 수준 향상
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #3, #5~6

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 20-1 | 이상 탐지 (Anomaly Detection) | 시계열 이상 탐지, 동적 임계치, ML 근본 원인 추천 | 4주 | 📋 |
| 20-2 | 진단 보고서 PDF 자동 생성 | 86개 항목 PDF, 주간/월간 리포트, 고객 브랜딩 | 2주 | 📋 |
| 20-3 | 합성 모니터링 (Synthetic) | LLM 엔드포인트 주기 호출 + 응답 품질 확인, SLO 프로브 | 2주 | 📋 |

---

## Phase 21: 엔터프라이즈 기능 📋

> **목표**: 대기업 고객 요구사항 충족
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #4, §4.3 #6

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 21-1 | Continuous Profiling | Go/Python/Java CPU/Memory Flame Graph → Trace 연결 | 3주 | 📋 |
| 21-2 | Terraform Provider | AITOP 리소스 (알림, SLO, 대시보드)를 IaC로 관리 | 3주 | 📋 |
| 21-3 | SSO (SAML/OIDC) | 엔터프라이즈 SSO 연동 (Okta, Azure AD, Google Workspace) | 2주 | 📋 |

---

## Phase 22: AI Copilot + 자동 탐색 📋

> **목표**: AI 기반 자동화로 사용자 경험 혁신
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.3 #1~2, #8

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 22-1 | AI Copilot | "TTFT가 높은 서비스?" 자연어 → PromQL 변환, 대화형 분석 | 4주 | 📋 |
| 22-2 | 토폴로지 자동 탐색 | 에이전트가 네트워크 연결 기반 서비스 의존관계 자동 발견 | 3주 | 📋 |
| 22-3 | Fine-tuning 모니터링 | 학습 loss/accuracy 추적, 체크포인트 관리, 학습-추론 비교 | 4주 | 📋 |

---

## Phase 23: 멀티 클라우드 + 모바일 📋

> **목표**: 글로벌 시장 대응
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.3 #3~5, #7

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 23-1 | 멀티 클라우드 통합 | AWS/GCP/Azure 리소스 비용 + 성능 통합 뷰 | 4주 | 📋 |
| 23-2 | 모바일 앱 | iOS/Android 알림 + 기본 대시보드 | 6주 | 📋 |
| 23-3 | Data Pipeline 모니터링 | Airflow, Prefect, Dagster ML 파이프라인 추적 | 3주 | 📋 |
| 23-4 | 비즈니스 KPI 연동 | AI 메트릭 → 매출/전환율 상관관계 | 3주 | 📋 |
| 23-5 | 글로벌 마켓플레이스 | 플러그인/대시보드/프롬프트 공유 | 4주 | 📋 |

---

## Phase 24: Java/.NET SDK + 메소드 프로파일링 📋

> **목표**: 엔터프라이즈 APM 시장(Java 45% / .NET 25%)으로 확장, 기존 APM 대비 AI 통합 모니터링 차별화
> **전제**: Phase 21~23 이후 진행 또는 병렬 진행 가능 (독립적인 SDK 레이어)
> **참조**: [DOCS/JAVA_DOTNET_SDK_DESIGN.md](DOCS/JAVA_DOTNET_SDK_DESIGN.md) — 상세 설계 문서

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

## 문서 현황

| 파일 경로 | 상태 | 비고 |
|-----------|------|------|
| `DOCS/ARCHITECTURE.md` | ✅ v2.0.1 | OTel + Agent 통합 아키텍처 (Java/.NET 언급 추가) |
| `DOCS/METRICS_DESIGN.md` | ✅ v2.0.1 | 지표 정의 + Agent 수집 메트릭 매핑 (12개 섹션, Java/.NET 추가) |
| `DOCS/JAVA_DOTNET_SDK_DESIGN.md` | ✅ v1.0.0 | Java/.NET SDK 및 메소드 프로파일링 통합 설계 (Phase 24) |
| `DOCS/UI_DESIGN.md` | ✅ v2.0.0 | 통합 모니터링 UI 설계 (구현 완료 반영, 26개 라우트) |
| `DOCS/AGENT_DESIGN.md` | ✅ v1.1.0 | AITOP Agent 상세 설계 (Phase 16 완료 반영) |
| `DOCS/SOLUTION_STRATEGY.md` | ✅ v1.0.0 | 완성도 평가 + 경쟁 분석 + 상용화 로드맵 |
| `DOCS/E2E_REDESIGN.md` | ✅ v1.0.0 | Phase 7' E2E 재설계 문서 (배경/범위/성공기준) |
| `DOCS/XLOG_DASHBOARD_REDESIGN.md` | ✅ | XLog/HeatMap 3패널 상세 설계 |
| `DOCS/AI_SERVICE_FLOW.md` | ✅ | AI 서비스 처리 흐름 (초보자용) |
| `DOCS/LOCAL_SETUP.md` | ✅ | 로컬 환경 가이드 |
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

---

*이 파일은 각 작업 세션 종료 시 업데이트한다.*
*상세 이전 이력은 [WORK_STATUS_OLD.md](WORK_STATUS_OLD.md)를 참조한다.*
*솔루션 방향성은 [DOCS/SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md)를 참조한다.*
