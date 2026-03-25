# WORK_STATUS.md — AITOP 작업 진행 현황 및 로드맵

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2026-03-25 (Session 45 — Phase 36~38 배치 모니터링 TO-DO Phase 추가: 프로세스 감지·수집, 런타임 프로파일링, 대시보드 뷰 설계 반영 + ADR-012)
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
Phase 30:    AGPL-free 인프라 스택 전환                       ████████████ 100% ✅
Phase 29:    Lite 모드 (docker-compose.lite + 보고서)         ████████████ 100% ✅
Phase 20:    운영 고도화 (이상 탐지·보고서·합성 모니터링)     ████████████ 100% ✅
Phase 24:    Java/.NET SDK + 메소드 프로파일링                ████████████ 100% ✅
Phase 25:    서버 그룹 + SDK 자동 인식 + 중앙 설정            ████████████ 100% ✅
Phase 26:    미들웨어 런타임 + Redis/Cache + MQ               ████████████ 100% ✅
Phase 21:    엔터프라이즈 (Profiling·Terraform·SSO)         ████████████ 100% ✅
Phase 22:    AI Copilot + 자동 탐색 + Fine-tuning         ████████████ 100% ✅
Phase 23:    멀티 클라우드 + 모바일 + 파이프라인           ████████████ 100% ✅

═══════════════════════════════════════════════════════════════════════
  TO-DO — 코드 작업 (최적화 순서, 의존성 다이어그램 참조)
═══════════════════════════════════════════════════════════════════════

── 즉시 실행 가능 (인프라 불필요, 순수 코드 작업) ────────────────────────
[00] Phase 28: XLog/HeatMap 트랜잭션 뷰 강화                   [██████████] 100%  ✅
[01] Phase 27: StorageBackend 구현 (S3/Local/Dual)            [██████████] 100%  ✅
[02] Phase 19: AI 가치 강화 (LLM 평가·Prompt Hub·비용 최적화)   [██████████] 100%  ✅
[03] Phase 20: 운영 고도화 (이상 탐지·PDF 보고서·합성 모니터링)  [██████████] 100%  ✅
[04] Phase 24: Java/.NET SDK + 메소드 프로파일링               [██████████] 100%  ✅
[05] Phase 25: 서버 그룹 + SDK 자동 인식 + 중앙 설정 편집      [██████████] 100%  ✅
[06] Phase 26: 미들웨어 런타임 모니터링 + Redis/Cache          [██████████] 100%  ✅
[07] Phase 21: 엔터프라이즈 기능 (Profiling·Terraform·SSO)    [██████████] 100%  ✅
[08] Phase 22: AI Copilot + 자동 탐색 + Fine-tuning           [██████████] 100%  ✅
[09] Phase 23: 멀티 클라우드 + 모바일 + 파이프라인 + KPI       [██████████] 100%  ✅
[13] Phase 29: Lite 모드 구현 (docker-compose.lite + SQLite)  [██████████] 100%  ✅
[14] Phase 30: AGPL-free 인프라 스택 전환                     [██████████] 100%  ✅

── 신규 — 에이전트 일원화 (ADR-001 결정, 코드 작업) ───────────────────────
[15] Phase 31-1: Go Agent 진단 모드 추가 (--mode=diagnose)    [░░░░░░░░░░]   0%  📋
[16] Phase 31-2: Evidence 플러그인 구현 (Config/Log/EOS)      [░░░░░░░░░░]   0%  📋
[17] Phase 31-3: Backend 연동 (Evidence 업로드·릴레이·자동진단) [░░░░░░░░░░]   0%  📋
[18] Phase 31-4: 고급 진단 (Security/APM/CrossAnalysis/Full)  [░░░░░░░░░░]   0%  📋
[19] Phase 31-5: Java Agent EOL (기능 동등성 검증·마이그레이션) [░░░░░░░░░░]   0%  📋

── GPU 멀티벤더 지원 (Phase 31과 병렬 진행 가능) ─────────────────────────
[20] Phase 32-1: GPU Collector 멀티벤더 리팩토링 (추상화)     [██████████] 100%  ✅
[21] Phase 32-2: NVIDIA go-nvml 전환 + vGPU/MIG              [██████████] 100%  ✅
[22] Phase 32-3: AMD Radeon/Instinct (sysfs + rocm-smi)      [██████████] 100%  ✅
[23] Phase 32-4: Intel Arc/Flex/Max (sysfs + Level Zero)      [██████████] 100%  ✅
[24] Phase 32-5: Apple Silicon M-series (ioreg + powermetrics) [██████████] 100%  ✅
[25] Phase 32-6: Cloud vGPU + K8s GPU 통합                    [██████████] 100%  ✅

── 중앙 플러그인 배포 (Phase 31/32와 병렬 진행 가능) ──────────────────────
[26] Phase 33-1: Plugin Manager + File Watcher (에이전트 측)   [░░░░░░░░░░]   0%  📋
[27] Phase 33-2: Plugin Registry + Deploy API (서버 측)        [░░░░░░░░░░]   0%  📋
[28] Phase 33-3: 배포 전략 (즉시/단계/예약) + 자동 롤백         [░░░░░░░░░░]   0%  📋
[29] Phase 33-4: Fleet Console Plugin UI + 배포 이력           [░░░░░░░░░░]   0%  📋

── perf/eBPF 시스템 프로파일링 (Phase 34/33과 병렬 진행 가능) ──────────────
[35] Phase 35-1: perf/eBPF Collector 모듈 — 에이전트 측        [░░░░░░░░░░]   0%  📋
     · perf record → perf script 커널+유저 통합 스택 트레이스 수집
     · eBPF on-CPU / off-CPU / memory 프로파일러 (cilium/ebpf Go)
     · 99Hz 샘플링, 30s 기본 수집, PID 또는 시스템 전체 대상
     · folded stack (gzip) → gRPC → Collection Server 전송
     · 권한 검증: CAP_BPF + CAP_PERFMON (또는 CAP_SYS_ADMIN)
[36] Phase 35-2: 언어별 JIT 심볼 해석 연동                     [░░░░░░░░░░]   0%  📋
     · Java: perf-map-agent (Runtime Attach §14 연계)
     · Python: py-spy 또는 perf + CPython frame pointer 패치
     · Node.js: --perf-basic-prof V8 JIT 심볼 맵
     · Go: DWARF 심볼 기본 포함 (추가 설정 불필요)
[37] Phase 35-3: Collection Server — 플레임그래프 생성 엔진      [░░░░░░░░░░]   0%  📋
     · folded stack → SVG / JSON 변환 (Brendan Gregg 알고리즘 Go 구현)
     · 타입별 렌더링: on-CPU(주황) / off-CPU(파랑) / memory(녹색) / mixed
     · diff 플레임그래프: 시간 범위 A vs B 비교 (before/after 검증)
     · API: GET /api/v1/profiling/flamegraph, POST /api/v1/profiling/trigger
     · 캐시 TTL 5분, StorageBackend에 folded stack 원본 저장
[38] Phase 35-4: 인터랙티브 플레임그래프 UI                     [░░░░░░░░░░]   0%  📋
     · /profiling 독립 뷰 — 에이전트/타입/시간 범위 선택 + diff 모드
     · /traces 히트맵 구간 클릭 → 인라인 플레임그래프 패널 (Phase 28 확장)
     · 확대/축소, 함수 검색, hover 시 비율·샘플수 표시
     · 색상: on-CPU(주황) / off-CPU(파랑) / memory(녹색) / diff(빨강·파랑)
     · SVG 다운로드, JSON 내보내기, folded stack 원본 다운로드

── 배치 모니터링 (Phase 34/35 완료 후 진행 가능) ────────────────────────────
[39] Phase 36: 배치 프로세스 자동 감지 + 프로세스 레벨 수집        [░░░░░░░░░░]   0%  📋
     · cron/systemd/WTS 자식 프로세스 자동 감지
     · /proc/{PID} 폴링 (stat/io/status) + Windows ETW/WMI
     · 실행 시간/CPU/Memory/I/O 수집, 종료 코드 추적
     · BatchExecution DB 모델 + Spring Batch/Airflow 연동
[40] Phase 37: 배치 런타임 프로파일링                              [░░░░░░░░░░]   0%  📋
     · Runtime Attach 연계 — Java SQL/메소드 프로파일링 (Phase 34)
     · Python py-spy 스택 샘플링 (Phase 34 연계)
     · .NET EventPipe 연동 (Phase 34 연계)
     · perf/eBPF 플레임그래프 연동 (Phase 35 연계)
[41] Phase 38: 배치 대시보드 뷰                                    [░░░░░░░░░░]   0%  📋
     · 배치 작업 목록 (상태 배지, 다음 실행 시간)
     · 실행 이력 타임라인 (달력형, 컬러 코딩)
     · 배치 상세 뷰 (SQL Top-N, 리소스 타임라인)
     · 배치 XLog, 배치 플레임그래프, 알림 규칙 CRUD

── Runtime Attach 프로파일링 (Phase 33 플러그인과 연계, 병렬 진행 가능) ────
[30] Phase 34-1: Runtime Attach 모듈 — Java JVM Attach API     [░░░░░░░░░░]   0%  📋
     · aitop-attach-helper.jar (VirtualMachine.attach + loadAgent)
     · Go Agent → Java 브릿지 프로세스 실행 + PID 탐지
     · Attach 성공/실패 에러 코드 처리 (ATTACH_PERMISSION_DENIED 등)
[31] Phase 34-2: Runtime Attach 모듈 — Python py-spy            [░░░░░░░░░░]   0%  📋
     · py-spy 바이너리 플러그인 배포 연계
     · PID 기반 외부 스택 샘플링 + FlameGraph SVG 생성
     · SYS_PTRACE capability 사전 검증
[32] Phase 34-3: Runtime Attach 모듈 — .NET EventPipe           [░░░░░░░░░░]   0%  📋
     · DiagnosticsClient IPC 소켓 연결 (Unix/Windows)
     · EventPipe Provider 설정 (System.Runtime, DotNETRuntime)
     · .nettrace → OTel Metric 변환
[33] Phase 34-4: Runtime Attach 모듈 — Node.js CDP / Go pprof   [░░░░░░░░░░]   0%  📋
     · Node.js: SIGUSR1 → V8 Inspector CDP WebSocket 연결
     · Go: /debug/pprof/profile HTTP 폴링
[34] Phase 34-5: 프로파일링 플러그인 배포 UI (Phase 33 연계)     [░░░░░░░░░░]   0%  📋
     · /agents/{id}/profiling 화면 — 모드 선택 (🟢 Attach / 🔴 Full Install)
     · "프로파일링 플러그인 배포" 원클릭 → 자동 Attach 워크플로
     · Attach 상태 실시간 표시 (활성/비활성/오류)

── 수작업 필요 (실제 인프라 환경, 코드 작업과 병렬/순차 진행) ───────────────
[10] Phase  7': E2E 통합 검증 (AI 실행 완료, 수동 검증 대기)   [████████░░]  80%  🔄 🔧
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
│                                                                             │
│  Phase 34 (Runtime Attach) ──┬─► [35] Phase 35-1 (perf/eBPF Collector)    │
│  Phase 27 (StorageBackend) ──┘   [36] Phase 35-2 (JIT 심볼 해석)           │
│                                  [37] Phase 35-3 (플레임그래프 생성 엔진)   │
│                                  [38] Phase 35-4 (플레임그래프 UI)          │
│                                                                             │
│  Phase 34 (Runtime Attach) ──┐                                             │
│  Phase 35 (perf/eBPF) ───────┼─► [39] Phase 36 (배치 프로세스 감지+수집)   │
│  AITOP Agent (Fleet) ────────┘        │                                    │
│                                       ▼                                    │
│                                  [40] Phase 37 (배치 런타임 프로파일링)     │
│                                       │                                    │
│                                       ▼                                    │
│                                  [41] Phase 38 (배치 대시보드 뷰)           │
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
> - Docker UI API 검증 (03-ui-api): 24 PASS, 12 FAIL → **Session 42에서 11건 구현 → 40 PASS, 0 FAIL**
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

## [03] Phase 20: 운영 고도화 ✅

> **목표**: 운영 효율성 + 자동화 수준 향상
> **완료일**: 2026-03-23

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 20-1 | 이상 탐지 | `/anomalies` — 동적 임계값 차트, 이상 이벤트 타임라인, ML 근본 원인 추천 | ✅ |
| 20-2 | 진단 보고서 | `/diagnostics` Reports 탭 — 보고서 템플릿 4종, 생성 이력, 다운로드 | ✅ |
| 20-3 | 합성 모니터링 | `/slo` Synthetic Probes 탭 — 프로브 5개, 상태/가동률/품질 점수 | ✅ |

**신규 파일:**
- `frontend/src/app/anomalies/page.tsx` — 이상 탐지 페이지 (KPI + 동적 임계값 차트 + 이벤트 테이블)
- `frontend/src/components/monitoring/anomaly-chart.tsx` — ECharts 이상 구간 시각화

---

## [04] Phase 24: Java/.NET SDK + 메소드 프로파일링 ✅

> **목표**: 엔터프라이즈 APM 시장(Java 45% / .NET 25%)으로 확장
> **완료일**: 2026-03-23
> **참조**: [DOCS/JAVA_DOTNET_SDK_DESIGN.md](DOCS/JAVA_DOTNET_SDK_DESIGN.md)

### 24-1~2. SDK 스캐폴딩

| # | 작업 | 상태 |
|---|------|------|
| 24-1 | Java SDK — build.gradle.kts, AitopAgent.java (ByteBuddy premain), README | ✅ |
| 24-2 | .NET SDK — Aitop.Profiler.csproj, README | ✅ |

### 24-3. XLog 통합 뷰

| # | 작업 | 상태 |
|---|------|------|
| 24-3-1 | 프로파일링 타입 (`MethodProfile`, `SqlBindingInfo`, `HttpCallInfo`) | ✅ |
| 24-3-2 | 메소드 콜트리 UI (`method-call-tree.tsx`) — 재귀 트리, SQL/HTTP 인라인, slow 배지 | ✅ |
| 24-3-3 | 트레이스 상세 Method Profile 탭 (`traces/[traceId]/page.tsx`) | ✅ |

**신규 파일:**
- `frontend/src/components/monitoring/method-call-tree.tsx` — 메소드 콜트리 컴포넌트
- `sdk-instrumentation/java/build.gradle.kts` — Java Agent Gradle 빌드
- `sdk-instrumentation/java/src/main/java/io/aitop/agent/AitopAgent.java` — ByteBuddy Agent
- `sdk-instrumentation/java/README.md` — Java Agent 설정 가이드
- `sdk-instrumentation/dotnet/Aitop.Profiler.csproj` — .NET 프로파일러
- `sdk-instrumentation/dotnet/README.md` — .NET 설정 가이드

---

## [05] Phase 25: 서버 그룹 관리 + SDK 자동 인식 + 중앙 설정 편집 ✅ (전 항목 완료)

> **목표**: 대규모 서버 환경에서 서버 그룹화 및 그룹 단위 관리, UI 기반 에이전트 설정 원격 편집, SDK/에이전트 자동 탐지 기능 구현
> **완료일**: 2026-03-23

**구현 완료 항목:**
- 25-1: SDK 자동 인식 — agents 탭 SDK Detection 테이블 (Java/Python/.NET/Go/Node.js 배지)
- 25-2-4: 그룹 대시보드 UI (`/agents/groups/{id}`) — KPI + 에이전트 테이블 + 일괄 액션
- 25-3-4: 설정 편집 UI (Config 탭) — 스키마 기반 폼 + 반영 수준 배지 (🟢🟡🔴) + 이력 테이블

**신규 파일:**
- `frontend/src/app/agents/groups/[id]/page.tsx` — 그룹 대시보드
- `frontend/src/components/agents/config-editor.tsx` — 스키마 기반 설정 폼
- `frontend/src/components/agents/reflection-badge.tsx` — 반영 수준 배지

### 25-1. SDK / 에이전트 자동 인식

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-1-1 | 에이전트 자동 감지 UI | Heartbeat 기반 신규 에이전트 탐지 → Fleet 콘솔에 상태 배지 표시 | 0.5주 | ✅ |
| 25-1-2 | SDK 언어 자동 판별 | agents 페이지 SDK Detection 테이블 — Java/Python/Node/.NET/Go 배지 | 0.5주 | ✅ |
| 25-1-3 | 신규 SDK 감지 알림 | 첫 OTel 데이터 수신 시 서비스 맵 자동 노드 추가 + 알림 발송 (설정 가능) | 0.5주 | ✅ `sdkAlertRegistry` + `GET/POST /fleet/sdk-alerts` + OTel eventbus 연동 |
| 25-1-4 | AI 환경 자동 탐지 | Heartbeat `ai_detected` 필드 → AI 탭 자동 활성화 | 0.5주 | ✅ `ai_detected`·`sdk_langs` Heartbeat/agentRecord 추가, snapshot 포함 |

### 25-2. 서버 그룹 관리

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-2-1 | 그룹 CRUD API | `POST/GET/PUT/DELETE /api/v1/fleet/groups` — 그룹 생성·조회·수정·삭제 | 1주 | ✅ |
| 25-2-2 | 에이전트 그룹 할당 API | `POST /api/v1/fleet/groups/{id}/agents` — 할당 즉시 에이전트 `host_group` 설정 반영 | 0.5주 | ✅ `POST/DELETE /fleet/groups/{id}/agents[/{agentId}]` 구현 |
| 25-2-3 | 그룹 관리 UI | 그룹 목록 + agents 탭 Groups 섹션 | 1.5주 | ✅ (DnD 미구현) |
| 25-2-4 | 그룹 대시보드 UI | 그룹별 KPI 요약 + 서버 목록 + 헬스 집계 (`/agents/groups/{id}`) | 1주 | ✅ |
| 25-2-5 | 그룹별 수집 작업 | 그룹 단위 즉시 수집 트리거, 그룹 단위 OTA 업데이트 | 0.5주 | ✅ `POST /fleet/groups/{id}/collect`, `POST /fleet/groups/{id}/update` + GroupDashboard 버튼 연동 |

### 25-3. 중앙 설정 관리 (UI에서 agent.yaml 원격 편집)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-3-1 | 설정 스키마 레지스트리 | 에이전트 버전별 `config-schema.json` 관리 — 기본값·타입·반영수준 포함 | 1주 | ✅ (config-editor 내장) |
| 25-3-2 | 설정 CRUD API | `GET/PUT /api/v1/agents/{id}/config` + 이력 관리 + 롤백 | 1주 | ✅ `configRegistry` + `GET/PUT /agents/{id}/config`, `GET /agents/{id}/config/history` |
| 25-3-3 | 설정 즉시 폴링 트리거 | `POST /api/v1/agents/{id}/config/reload` — Hot Reload 항목 즉시 적용 | 0.5주 | ✅ `POST /agents/{id}/config/reload` eventbus 연동 |
| 25-3-4 | 설정 편집 UI | 섹션별 폼 편집 + 반영수준 아이콘(🟢🟡🔴) + 유효성 검증 + 설정 이력 뷰 | 2주 | ✅ |
| 25-3-5 | 그룹 일괄 설정 편집 | 그룹 내 전체 에이전트에 동일 설정 일괄 적용 UI | 1주 | ✅ GroupDashboard `GroupConfigModal` — key/value 편집 + 전체 에이전트 일괄 적용 |

### 25-4. 에이전트 원격 재기동

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 25-4-1 | 재기동 API | `POST /api/v1/agents/{id}/restart` — HeartbeatResponse에 RESTART_COMMAND 삽입 | 0.5주 | ✅ `POST /agents/{id}/restart` + `POST /fleet/agents/{id}/restart` eventbus 연동 |
| 25-4-2 | 재기동 UI | [🔄 에이전트 재기동] 버튼 + 진행 상태 표시 + 완료 확인 | 0.5주 | ✅ AgentsPage + GroupDashboard `RestartAgentModal` 구현 |
| 25-4-3 | App Restart 안내 UI | 🔴 항목 변경 시 "수동 재기동 필요" 경고 모달 + 절차 안내 | 0.5주 | ✅ `ConfigEditor` `AppRestartModal` — reflectionLevel=app 필드 변경 감지 후 systemctl 안내 |

---

## [06] Phase 26: 미들웨어 런타임 모니터링 ✅ (전 항목 완료 — Session 43)

> **목표**: Java/..NET/Node.js/Python/Go 언어별 런타임 미들웨어(스레드 풀, 커넥션 풀, 이벤트 루프, 워커, 고루틴)를 실시간 수집·시각화하고, 메시지 큐(Kafka/RabbitMQ/ActiveMQ) 상태를 통합 모니터링한다.
> **선행 조건**: Phase 25 (에이전트 그룹 관리 + 중앙 설정) 완료 후 진행
> **참조**: [DOCS/AGENT_DESIGN.md §3.2.5](DOCS/AGENT_DESIGN.md) · [DOCS/UI_DESIGN.md §8.7](DOCS/UI_DESIGN.md) · [DOCS/METRICS_DESIGN.md §13](DOCS/METRICS_DESIGN.md)
> **배치 근거**: Phase 25의 서버 그룹 관리·중앙 설정·언어 자동 감지가 완성돼야 언어별 Collector 자동 활성화가 가능. Redis/Cache Collector(26-5) 포함으로 데이터베이스 계층까지 통합 가시성 확보.

### 26-1. 언어별 미들웨어 Collector 구현

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-1-1 | Java 미들웨어 Collector | JMX MBean (Thread Pool + HikariCP/DBCP/C3P0 + Session) + jcmd 통합 수집 | 1.5주 | ✅ (Session 43) |
| 26-1-2 | .NET 미들웨어 Collector | dotnet-counters / CLR EventSource (Kestrel + Thread Pool + GC + EF Core Pool) | 1.5주 | ✅ (Session 43) |
| 26-1-3 | Node.js 미들웨어 Collector | Event Loop Lag/Utilization (`perf_hooks`) + Active Connections + pg-pool/mongoose Pool | 1주 | ✅ (Session 43) |
| 26-1-4 | Python 미들웨어 Collector | Gunicorn stats socket + Worker Pool + SQLAlchemy Pool (`engine.pool.status()`) | 1주 | ✅ (Session 43) |
| 26-1-5 | Go 미들웨어 Collector | `runtime.NumGoroutine()` + `sql.DB.Stats()` + `/debug/vars` 수집 | 1주 | ✅ (Session 43) |
| 26-1-6 | 언어 자동 감지 로직 | Heartbeat `runtime_language` 필드 + 프로세스/패키지 탐지 → Collector 자동 활성화 | 0.5주 | ✅ (Session 43) |

### 26-2. Connection Pool 실시간 모니터링

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-2-1 | 커넥션 풀 메트릭 표준화 | `middleware.connection_pool.*` 네임스페이스 — 8개 구현체 통합 (HikariCP/DBCP/EF Core/pg-pool 등) | 1주 | ✅ (Session 43) |
| 26-2-2 | 누수 감지 알림 | active/max ≥ 90% 경고, pending > 0 이 30초 지속 시 PagerDuty | 0.5주 | ✅ (Session 43) |
| 26-2-3 | Connection Pool 대시보드 UI | Active/Idle 게이지 + 대기 시간 히스토그램(P50/P95/P99) + 누수 알림 패널 | 1.5주 | ✅ (Session 43) |

### 26-3. 메시지 큐 모니터링

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-3-1 | Kafka Collector | Kafka Metadata API v0 — 브로커/토픽/파티션 메타데이터 수집 | 1주 | ✅ (Session 42) |
| 26-3-2 | RabbitMQ Collector | Management HTTP API — overview/queues/connections/exchanges | 0.5주 | ✅ (Session 42) |
| 26-3-3 | ActiveMQ Collector | Jolokia REST API — 브로커 상태/큐/토픽/커넥션 | 0.5주 | ✅ (Session 42) |
| 26-3-4 | 메시지 큐 대시보드 UI | `/infra/queues` 페이지 — Kafka/RabbitMQ/ActiveMQ 모니터링 | 1주 | ✅ |

### 26-4. 미들웨어 전용 대시보드 UI

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-4-1 | 언어별 대시보드 자동 생성 | `runtime_language` 감지 후 해당 언어 미들웨어 패널 세트 자동 활성화 | 1주 | ✅ (Session 43) |
| 26-4-2 | Thread Pool 실시간 뷰 | Active/Idle/Max 게이지 + Queue 깊이 스파크라인 (Java/.NET) | 1주 | ✅ (Session 43) |
| 26-4-3 | Event Loop 실시간 뷰 | Lag 라인 차트 + Utilization 게이지 + 100ms 경고선 (Node.js) | 0.5주 | ✅ (Session 43) |
| 26-4-4 | Worker Pool 실시간 뷰 | Active/Idle 바 차트 + Restart 카운터 (Python) | 0.5주 | ✅ (Session 43) |
| 26-4-5 | Goroutine 누수 감지 뷰 | Count 라인 차트 + 기준값 × 2배 경계선 + pprof 딥링크 (Go) | 0.5주 | ✅ (Session 43) |

### 26-5. Redis/Cache Collector

> **목표**: Redis·Valkey·KeyDB·DragonflyDB·Memcached 캐시 계열 DB를 자동 탐지하고 메모리·성능·복제·영속성·클러스터 상태를 수집·시각화한다.
> **참조**: [DOCS/AGENT_DESIGN.md §3.2 Redis/Cache Collector](DOCS/AGENT_DESIGN.md) · [DOCS/METRICS_DESIGN.md §13.9](DOCS/METRICS_DESIGN.md) · [DOCS/UI_DESIGN.md §8.8](DOCS/UI_DESIGN.md)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 26-5-1 | Redis/Cache Collector 구현 | Redis INFO 파싱, SLOWLOG LEN, AUTH, RESP 프로토콜 | 1.5주 | ✅ (Session 42) |
| 26-5-2 | Memcached Collector 구현 | `stats` 명령 파싱 — get_hits/get_misses/evictions 등 12개 메트릭 | 0.5주 | ✅ (Session 42) |
| 26-5-3 | 엔진 자동 탐지 로직 | 포트 6379/11211 스캔 + defaultCandidates 자동 탐지 | 0.5주 | ✅ (Session 42) |
| 26-5-4 | 메트릭 표준화 | RedisMetrics/MemcachedMetrics 구조체 정의 + cache.info.v1 스키마 | 1주 | ✅ (Session 42) |
| 26-5-5 | Redis/Cache 대시보드 UI | Hit Rate 게이지 · 메모리 사용률 · Eviction 추세 + Slow Log 테이블 + Replication Lag 차트 + Keyspace 분포 파이 차트 | 1.5주 | ✅ (Session 43) |
| 26-5-6 | Redis Cluster 지원 | `CLUSTER INFO` 기반 cluster_state · 슬롯 배분(assigned/ok/pfail/fail) 수집 및 Cluster 전용 뷰 | 1주 | ✅ (Session 43) |
| 26-5-7 | 알림 규칙 등록 | Hit Rate < 80% · 메모리 > 80% · Replication Lag > 1MB · Evictions 급증 → Slack/PagerDuty 알림 | 0.5주 | ✅ (Session 43) |

---

## [07] Phase 21: 엔터프라이즈 기능 ✅

> **목표**: 대기업 고객 요구사항 충족
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.2 #4, §4.3 #6
> **배치 근거**: Phase 24/25 SDK 기반이 완성돼야 Continuous Profiling 구현 가능. Terraform Provider는 Phase 26 미들웨어 리소스까지 포함해야 완전함. SSO는 대기업 판매 시 필수 조건 — SDK·미들웨어 기능 완성 후 세일즈 가속에 활용.
> **완료일**: 2026-03-24 (Session 39)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 21-1 | Continuous Profiling | Go/Python/Java CPU/Memory Flame Graph → Trace 연결 | 3주 | ✅ |
| 21-2 | Terraform Provider | AITOP 리소스 (알림, SLO, 대시보드)를 IaC로 관리 | 3주 | ✅ |
| 21-3 | SSO (SAML/OIDC) | 엔터프라이즈 SSO 연동 (Okta, Azure AD, Google Workspace) | 2주 | ✅ |

### 21-1. Continuous Profiling ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 21-1-1 | DB Migration | `003_profiling.sql` — profiling_profiles 테이블 + 6개 인덱스 | ✅ |
| 21-1-2 | Storage Key | `pkg/storage/keys.go` — ProfileKey() 함수 | ✅ |
| 21-1-3 | DB CRUD | `database/profiling.go` — Insert/List/Get/Delete + filter | ✅ |
| 21-1-4 | Profiling Collector | Go pprof, Python py-spy(MIT), Java async-profiler(Apache 2.0)/JFR | ✅ |
| 21-1-5 | FlameGraph Parser | collapsed/pprof/JFR → 통합 JSON 트리 + diff 알고리즘 | ✅ |
| 21-1-6 | REST API | POST/GET profiles, flamegraph, compare, trace linkage (7개 엔드포인트) | ✅ |
| 21-1-7 | Frontend FlameGraph | SVG icicle chart, 줌/클릭/호버, CPU/Memory 토글, diff 모드 | ✅ |
| 21-1-8 | Profiling Page | `/profiling` — KPI 카드, 프로파일 목록+필터, FlameGraph 패널 | ✅ |
| 21-1-9 | Profile Detail | `/profiling/[profileId]` — 메타데이터, 전체폭 FlameGraph, 트레이스 링크 | ✅ |

### 21-2. Terraform Provider ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 21-2-1 | DB Migration | `004_terraform_resources.sql` — alert_policies, slo_definitions, dashboards, notification_channels, api_keys | ✅ |
| 21-2-2 | DB CRUD | `database/terraform_resources.go` — 5개 리소스 CRUD + API Key 해시 검증 | ✅ |
| 21-2-3 | REST API CRUD | alerts/policies, slo, dashboards, alerts/channels, settings/api-keys (25개 엔드포인트) | ✅ |
| 21-2-4 | API Key Auth | `auth/jwt.go` — ValidateAPIKey(), aitop_ 접두사 토큰 감지 | ✅ |
| 21-2-5 | Terraform Module | `terraform-provider-aitop/` — terraform-plugin-framework 기반 독립 Go 모듈 | ✅ |
| 21-2-6 | Resources | aitop_alert_policy, aitop_slo, aitop_dashboard, aitop_agent_group, aitop_notification_channel | ✅ |
| 21-2-7 | Data Sources | aitop_agents, aitop_services, aitop_projects | ✅ |
| 21-2-8 | Examples | `examples/basic/main.tf` — 전체 리소스 사용 예시 | ✅ |

### 21-3. SSO (SAML/OIDC) ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 21-3-1 | DB Migration | `005_sso.sql` — sso_providers, sso_identities, users 테이블 | ✅ |
| 21-3-2 | SSO Package | `internal/sso/` — Manager, OIDC(PKCE), SAML(SP-initiated), Identity 매핑 | ✅ |
| 21-3-3 | DB CRUD | `database/sso.go` + `database/users.go` — Provider/Identity/User CRUD | ✅ |
| 21-3-4 | REST API | SSO login/callback/acs/metadata + settings CRUD (11개 엔드포인트) | ✅ |
| 21-3-5 | Auth Middleware | SSO 경로 prefix 매칭 추가 (`/api/v1/auth/sso/`) | ✅ |
| 21-3-6 | Login Page | SSO 버튼 ("Sign in with Okta/Microsoft") + 콜백 핸들링 | ✅ |
| 21-3-7 | SSO Settings | `components/settings/sso-settings.tsx` — 제공자 CRUD 모달, 역할 매핑 | ✅ |
| 21-3-8 | Settings Tab | `/settings` → SSO / Identity 탭 추가 | ✅ |

**신규 파일:**
- `agent/migrations/003_profiling.sql` — 프로파일링 DB 스키마
- `agent/migrations/004_terraform_resources.sql` — Terraform 리소스 DB 스키마
- `agent/migrations/005_sso.sql` — SSO/Users DB 스키마
- `agent/internal/database/profiling.go` — 프로파일 CRUD
- `agent/internal/database/terraform_resources.go` — 리소스 + API Key CRUD
- `agent/internal/database/sso.go` — SSO Provider/Identity CRUD
- `agent/internal/database/users.go` — User CRUD
- `agent/internal/collector/profiling/` — 프로파일링 컬렉터 (6개 파일)
- `agent/internal/sso/` — SSO 패키지 (4개 파일: manager, oidc, saml, identity)
- `terraform-provider-aitop/` — Terraform Provider Go 모듈 (13개 파일)
- `frontend/src/components/charts/flame-graph.tsx` — FlameGraph SVG 컴포넌트
- `frontend/src/components/charts/flame-graph-diff.tsx` — FlameGraph 비교 컴포넌트
- `frontend/src/app/profiling/page.tsx` — 프로파일링 메인 페이지
- `frontend/src/app/profiling/[profileId]/page.tsx` — 프로파일 상세 페이지
- `frontend/src/components/settings/sso-settings.tsx` — SSO 설정 컴포넌트

---

## [08] Phase 22: AI Copilot + 자동 탐색 + Fine-tuning ✅

> **목표**: AI 기반 자동화로 사용자 경험 혁신
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.3 #1~2, #8
> **배치 근거**: Phase 19 LLM 평가·Prompt Hub와 Phase 20 이상 탐지 엔진이 갖춰진 후에 Copilot 구현 효과가 극대화됨.
> **완료일**: 2026-03-24 (Session 40)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 22-1 | AI Copilot | NL→PromQL 변환, 대화형 채팅 분석, 인라인 차트 | 4주 | ✅ |
| 22-2 | 토폴로지 자동 탐색 | /proc/net/tcp 스캔, D3 서비스맵, 프로토콜 탐지, 변경 이력 | 3주 | ✅ |
| 22-3 | Fine-tuning 모니터링 | Loss/Accuracy 차트, 체크포인트 관리, 학습-추론 비교 | 4주 | ✅ |

### 22-1. AI Copilot ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 22-1-1 | NL→PromQL 엔진 | `copilot-engine.ts` — 15개 인텐트, KO/EN 키워드 매핑, 한국어 조사 제거 | ✅ |
| 22-1-2 | Copilot Store | `copilot-store.ts` — Zustand, messages[], sendMessage(), 300ms UX 딜레이 | ✅ |
| 22-1-3 | Chat Page | `/copilot` — 75%채팅+25%컨텍스트, 메시지 버블, PromQL 블록, 인라인 차트 | ✅ |
| 22-1-4 | 추천 질문 | 8개 칩 (TTFT, GPU, 에러율, 비용, RAG, 알림, 벡터DB, 가드레일) | ✅ |
| 22-1-5 | Backend API | POST copilot/chat, GET suggestions, POST copilot/query (3개 엔드포인트) | ✅ |

### 22-2. Topology Auto-Discovery ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 22-2-1 | Network Scanner | `discovery/netscanner.go` — /proc/net/tcp 파싱, PID→서비스 매핑, 프로토콜 탐지 | ✅ |
| 22-2-2 | Topology Page | `/topology` — KPI + ServiceMap(D3) + 프로토콜 배지 + 변경 이력 패널 | ✅ |
| 22-2-3 | Protocol Badge | HTTP(blue)/gRPC(purple)/SQL(orange)/Redis(red)/Kafka(green) | ✅ |
| 22-2-4 | Backend API | GET topology, GET topology/changes (2개 엔드포인트) | ✅ |

### 22-3. Fine-tuning Monitoring ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 22-3-1 | Training Page | `/ai/training` — 작업 목록+체크포인트+비교 3탭, Loss/Accuracy 인라인 차트 | ✅ |
| 22-3-2 | Training Detail | `/ai/training/[id]` — 2x2 차트 그리드 (Loss, Accuracy, GPU, LR) | ✅ |
| 22-3-3 | Epoch Progress | 에포크 진행바 + ETA | ✅ |
| 22-3-4 | Demo Data | 4개 작업(running/completed/queued/failed), 지수감소 Loss, sigmoid Accuracy | ✅ |
| 22-3-5 | Backend API | GET training/jobs, GET jobs/{id}, GET checkpoints, POST deploy (4개 엔드포인트) | ✅ |

**신규 파일:**
- `frontend/src/lib/copilot-engine.ts` — NL→PromQL 규칙 기반 엔진
- `frontend/src/stores/copilot-store.ts` — Copilot Zustand 스토어
- `frontend/src/app/copilot/page.tsx` — AI Copilot 채팅 페이지
- `frontend/src/app/topology/page.tsx` — 토폴로지 자동 탐지 페이지
- `frontend/src/app/ai/training/page.tsx` — Fine-tuning 모니터링 페이지
- `frontend/src/app/ai/training/[id]/page.tsx` — 학습 작업 상세 페이지
- `frontend/src/components/copilot/index.ts` — Copilot 컴포넌트 barrel
- `frontend/src/components/topology/protocol-badge.tsx` — 프로토콜 배지
- `frontend/src/components/topology/index.ts` — Topology 컴포넌트 barrel
- `frontend/src/components/ai/epoch-progress.tsx` — 에포크 진행 바
- `agent/internal/discovery/netscanner.go` — TCP 연결 스캐너

---

## [09] Phase 23: 멀티 클라우드 + 모바일 + 파이프라인 + KPI + 마켓플레이스 ✅

> **목표**: 글로벌 시장 대응
> **참조**: [SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §4.3 #3~5, #7
> **완료일**: 2026-03-24 (Session 41)

| # | 작업 | 상세 | 예상 공수 | 상태 |
|---|------|------|----------|------|
| 23-1 | 멀티 클라우드 통합 | AWS/GCP/Azure 리소스 비용 + 성능 통합 뷰 | 4주 | ✅ |
| 23-2 | 모바일 대시보드 | 반응형 모바일 프리뷰 + Push 알림 설정 | 6주 | ✅ |
| 23-3 | Data Pipeline 모니터링 | Airflow/Prefect/Dagster ML 파이프라인 + DAG 뷰 | 3주 | ✅ |
| 23-4 | 비즈니스 KPI 연동 | AI 메트릭↔매출/전환율 Correlation + ROI 분석 | 3주 | ✅ |
| 23-5 | 글로벌 마켓플레이스 | Dashboard/Prompt/Plugin/Notebook 공유 + 게시 | 4주 | ✅ |

**신규 파일:**
- `frontend/src/app/cloud/page.tsx` — 멀티 클라우드 통합 (4탭: Overview/Resources/Recommendations)
- `frontend/src/app/pipelines/page.tsx` — ML 파이프라인 모니터링 (DAG 뷰 + 실행 이력)
- `frontend/src/app/business/page.tsx` — 비즈니스 KPI (Correlation/ROI/Metrics 3탭)
- `frontend/src/app/marketplace/page.tsx` — 글로벌 마켓플레이스 (Browse/Featured/Publish)
- `frontend/src/app/mobile/page.tsx` — 모바일 대시보드 프리뷰 + Push 알림 설정
- `frontend/src/components/pipelines/dag-view.tsx` — DAG 단계 수평 시각화
- `frontend/src/components/pipelines/index.ts` — barrel export

---

## [10] Phase 7': E2E 통합 검증 (재설계) 🔄 🔧

> **목표**: 전체 시스템 E2E 검증 — 매뉴얼 + AI 교차검증 체계
> **전제**: 모든 코드 Phase(1~30) 완료
> **참조**: [DOCS/TEST_GUIDE.md](DOCS/TEST_GUIDE.md) | [DOCS/MANUAL_TESTING_GUIDE.md](DOCS/MANUAL_TESTING_GUIDE.md) | [DOCS/E2E_REDESIGN.md](DOCS/E2E_REDESIGN.md)
> **테스트 결과**: [test/](test/) — 단위/통합/E2E 테스트 절차서·결과서·교차검증·변경이력

**Session 42 (2026-03-24) 수행 내역:**

| 작업 | 결과 | 비고 |
|------|:----:|------|
| Agent Collector 실구현 (Cache/MQ/Health) | ✅ | Redis INFO, Kafka Metadata, CPU 측정 |
| Agent Collector 유닛 테스트 35건 | ✅ | 목 서버 기반 테스트 |
| 테스트 체계 구축 (test/ 폴더, 템플릿, 절차서) | ✅ | 3종 템플릿 + OS별 명령어 참조 + UI 체크리스트 |
| 단위테스트 1차 AI 실행 | ✅ | Go 160 + Frontend 72 = **232개 ALL PASS** |
| UI 전용 API 11건 구현 | ✅ | infra/hosts, ai/services, gpu, diagnostics 등 |
| 통합테스트 1차 AI 실행 | ✅ | 계약 27 + 파이프라인 21 + UI API 40 = **88 PASS** |
| WCAG 2.1 AA 접근성 수정 | ✅ | aria-label 추가, accent 색상 분리 → a11y **14/14 PASS** |
| Playwright E2E 수정 | ✅ | AuthGuard 재로그인 + locator 수정 → **9/9 ALL PASS** |
| Locust 부하 테스트 수정 | ✅ | API 경로 + payload 수정 → **P95=43ms, 실패율 0%** |
| Visual Regression 기준선 | ✅ | 15개 스냅샷 생성 |
| DELETE /api/v1/agents/{id} 구현 | ✅ | fleet delete 메서드 추가 |

| # | 작업 | 검증 항목 | AI 실행 | 수동 검증 | 상태 |
|---|------|----------|:------:|:--------:|:----:|
| 7'-1 | Docker 통합 테스트 | 11컨테이너 기동 + 파이프라인 21체크 | ✅ PASS | 📋 대기 | 🔄 |
| 7'-2 | 부하 테스트 | Locust P95=43ms, 실패율 0% | ✅ PASS | 📋 대기 | 🔄 |
| 7'-3 | Trace 연속성 | Layer 1 PASS | ⚠️ 부분 | 📋 대기 | 🔄 |
| 7'-4 | 보안 감사 | A01 PASS | ⚠️ 부분 | 📋 대기 | 🔄 |

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

> **목표**: 전체 스택 Helm 통합 배포 (Frontend + Collection Server + Agent)
> **전제**: Phase 7' 교차검증 통과 (매뉴얼 + AI 결과 일치 확인)
> **참조**: [DOCS/TEST_GUIDE.md](DOCS/TEST_GUIDE.md) — 매뉴얼 Level 8 + AI-L4 교차검증

| # | 작업 | 상세 | 테스트 매핑 | 상태 |
|---|------|------|-----------|------|
| 8'-1 | Frontend Dockerfile + Helm | Next.js standalone 빌드 + Helm 서브차트 | 매뉴얼 L8 | 📋 🔧 |
| 8'-2 | Collection Server Helm | REST + PostgreSQL + S3 연동 Helm 차트 | 매뉴얼 L8 | 📋 🔧 |
| 8'-3 | Helm Dry-Run + 스테이징 | dev/prod dry-run, Pod 상태 확인 | 매뉴얼 L8 + AI-L4 | 📋 🔧 |
| 8'-4 | 프로덕션 배포 | Jaeger + Alertmanager + Ingress+TLS | 매뉴얼 L8 | 📋 🔧 |
| 8'-5 | DEB/RPM 패키지 실빌드 | nfpm → DEB/RPM 빌드 + 설치 검증 | 매뉴얼 L8 | 📋 🔧 |

---

## [12] Phase 9': SLO 튜닝 + 운영 안정화 📋 🔧

> **목표**: 프로덕션 운영 데이터 기반 임계치 튜닝 + 최종 품질 승인
> **전제**: Phase 8' 프로덕션 배포 후 1~2주 운영 데이터 확보
> **참조**: [DOCS/TEST_GUIDE.md](DOCS/TEST_GUIDE.md) — 매뉴얼 Level 9 + AI-L5 문서↔코드 일관성 교차검증

| # | 작업 | 상세 | 테스트 매핑 | 상태 |
|---|------|------|-----------|------|
| 9'-1 | SLO 임계치 튜닝 | TTFT/TPS/GPU/에러율 실측 ±20% 조정 | 매뉴얼 L9 | 📋 🔧 |
| 9'-2 | Tail Sampling 최적화 | 정책별 보존율, 비용 목표 달성 | 매뉴얼 L9 + AI-L4 | 📋 🔧 |
| 9'-3 | 교차검증 최종 보고서 | 매뉴얼+AI 결과 대조, 불일치 해결, 릴리스 승인 | 교차검증 프로토콜 | 📋 🔧 |

---

## [15~19] Phase 31: 에이전트 일원화 (ADR-011) 📋

> **목표**: Diagnostic(Java) + Monitoring(Go) 에이전트를 Go 단일 바이너리로 통합
> **전제**: Phase 7' AI 테스트 완료 (단위/통합/E2E PASS)
> **참조**: [DOCS/ADR-001_AGENT_UNIFICATION.md](DOCS/ADR-001_AGENT_UNIFICATION.md) — 결정 배경, 대안 분석, 로드맵

| # | 작업 | 상세 | 예상 기간 | 상태 |
|---|------|------|---------|:----:|
| **31-1** | **Go Agent 진단 모드** | `--mode=diagnose` CLI 추가, Evidence Collector 인터페이스 | 2~3주 | 📋 |
| 31-1a | Evidence Collector 인터페이스 | `agent/internal/collector/evidence/` 패키지 | | |
| 31-1b | ConfigEvidence 플러그인 | 설정 파일 수집 (nginx.conf, server.xml, my.cnf 등) | | |
| 31-1c | LogEvidence 플러그인 | 로그 패턴 분석 (에러, 슬로우 쿼리, 접근 로그) | | |
| 31-1d | EOSEvidence 플러그인 | eos-lifecycle-db.json 기반 버전 체크 (17개 제품군) | | |
| 31-1e | Evidence ZIP 생성 + 업로드 | 구조화 JSON → ZIP → HTTPS POST | | |
| 31-1f | 기존 Collector → Evidence 변환 어댑터 | 12종 Collector 출력을 Evidence JSON으로 변환 | | |
| **31-2** | **Backend 연동** | Collection Server ↔ aitop-backend 릴레이 | 2~3주 | 📋 |
| 31-2a | Evidence 수신 API | `POST /api/v1/evidence/upload` | | |
| 31-2b | Backend 릴레이 | Collection Server → aitop-backend 포워딩 | | |
| 31-2c | 진단 자동 트리거 | 수집 완료 → 자동 진단 실행 | | |
| 31-2d | Fleet에 진단 상태 표시 | 마지막 진단 시각, 결과 요약 | | |
| **31-3** | **고급 진단 플러그인** | Security/APM/CrossAnalysis + collect-only/full 모드 | 3~4주 | 📋 |
| 31-3a | SecurityEvidence 플러그인 | SSL/TLS, 패치, 계정 정책 | | |
| 31-3b | APMEvidence 플러그인 | 6종 APM SaaS 어댑터 Go 포팅 | | |
| 31-3c | CrossAnalysis 플러그인 | IT↔AI 교차 분석용 통합 스냅샷 | | |
| 31-3d | `--mode=collect-only` | 1회 수집 → HTTPS Push → 종료 (에어갭용) | | |
| 31-3e | `--mode=full` | 모니터링 상시 + 진단 스케줄/온디맨드 | | |
| **31-4** | **Java Agent EOL** | 기능 동등성 검증 + 마이그레이션 + 병행 운영 | 4~8주 | 📋 |
| 31-4a | 기능 동등성 테스트 | Java Agent 수집 항목 100% Go Agent 커버 확인 | | |
| 31-4b | 마이그레이션 가이드 | 기존 Java Agent 사용자용 전환 문서 | | |
| 31-4c | 병행 운영 (3개월) | 양쪽 지원, 신규 고객은 Go Agent만 | | |
| 31-4d | Java Agent EOL 선언 | 최종 버전 릴리스 후 유지보수만 | | |

**성공 지표**:
- 설치 크기 < 30MB (단일 바이너리)
- 상주 메모리 < 60MB (full 모드)
- 진단 항목 커버리지 86개 전체 (IT 55 + AI 31)
- Java Agent 대비 수집 동등성 100%

---

## [20~25] Phase 32: GPU Collector 멀티벤더 지원 ✅

> **목표**: NVIDIA 전용 GPU Collector를 멀티벤더(NVIDIA/AMD/Intel/Apple)로 확장
> **전제**: 현재 NVIDIA nvidia-smi 기반 → go-nvml + sysfs 기반으로 전환
> **참조**: [AGENT_DESIGN.md §3.3](DOCS/AGENT_DESIGN.md) — GPU Collector 멀티벤더 아키텍처

| # | 작업 | 상세 | 예상 기간 | 상태 |
|---|------|------|---------|:----:|
| **32-1** | **GPU Collector 추상화 리팩토링** | | **1~2주** | ✅ |
| 32-1a | GPUDriver 인터페이스 정의 | `Detect()`, `Collect()`, `Vendor()` | | |
| 32-1b | gpu_collector.go 리팩토링 | 벤더별 드라이버 자동 선택 | | |
| 32-1c | 공통 출력 스키마 `ai.gpu_metrics.v2` | vendor, is_virtual, mig_enabled 필드 추가 | | |
| 32-1d | 벤더 자동 탐지 (detect.go) | PCI vendor ID + /proc + sysfs + runtime.GOOS | | |
| **32-2** | **NVIDIA go-nvml + vGPU/MIG** | | **1~2주** | ✅ |
| 32-2a | go-nvml 드라이버 구현 | nvidia-smi exec 대체, NVML 직접 호출 | | |
| 32-2b | nvidia-smi 폴백 | go-nvml 사용 불가 시 기존 방식 유지 | | |
| 32-2c | vGPU 지원 | NVIDIA GRID — vGPU 인스턴스 목록/메트릭 | | |
| 32-2d | MIG 지원 | A100/H100 MIG 파티션별 메트릭 | | |
| 32-2e | DCGM Exporter 연동 | Prometheus 스크래핑 (데이터센터) | | |
| **32-3** | **AMD Radeon/Instinct** | | **1~2주** | ✅ |
| 32-3a | sysfs 드라이버 (amdgpu) | gpu_busy_percent, mem_info_vram, temp, power | | |
| 32-3b | rocm-smi 폴백 | ROCm 설치 환경에서 추가 메트릭 | | |
| 32-3c | MxGPU(SR-IOV) VF 지원 | Virtual Function별 메트릭 | | |
| 32-3d | Instinct MI 시리즈 검증 | MI250/MI300 데이터센터 GPU | | |
| **32-4** | **Intel Arc/Flex/Max** | | **1~2주** | ✅ |
| 32-4a | sysfs 드라이버 (i915/xe) | rps_cur_freq, energy, hwmon | | |
| 32-4b | intel_gpu_top 폴백 | JSON 출력 파싱 | | |
| 32-4c | XPU Manager 연동 | 데이터센터 Flex/Max 전용 | | |
| 32-4d | SR-IOV VF 지원 | Flex/Max 가상화 | | |
| **32-5** | **Apple Silicon M-series** | | **1주** | ✅ |
| 32-5a | ioreg 드라이버 | GPU 모델, 코어 수, 메모리 (sudo 불필요) | | |
| 32-5b | powermetrics 드라이버 | GPU 사용률, 주파수, 전력 (sudo 필요) | | |
| 32-5c | macOS 빌드 지원 | `//go:build darwin` 분리 | | |
| **32-6** | **Cloud vGPU + K8s GPU** | | **1~2주** | ✅ |
| 32-6a | Cloud VM 내부 GPU 탐지 | AWS p4d/g5, GCP a2/a3, Azure NC/ND | | |
| 32-6b | K8s GPU 리소스 탐지 | nvidia.com/gpu, amd.com/gpu, gpu.intel.com | | |
| 32-6c | K8s Device Plugin 연동 | GPU 할당 상태, 노드별 GPU 수 | | |
| 32-6d | MIG + K8s 통합 | MIG 파티션 → K8s 리소스 매핑 | | |

**성공 지표**:
- 지원 벤더: NVIDIA + AMD + Intel + Apple = 4개
- vGPU 지원: NVIDIA GRID + AMD MxGPU + Intel SR-IOV
- 기존 테스트 호환: NVIDIA 테스트 회귀 없음
- 벤더 자동 탐지: 설치 후 설정 없이 GPU 자동 인식

---

## [26~29] Phase 33: 중앙 플러그인 배포 시스템 📋

> **목표**: 에이전트 재설치 없이 수집 플러그인을 중앙에서 추가/교체/롤백
> **참조**: [AGENT_DESIGN.md §9.5](DOCS/AGENT_DESIGN.md) — 핫 플러그인 배포 설계

| # | 작업 | 상세 | 예상 기간 | 상태 |
|---|------|------|---------|:----:|
| **33-1** | **Plugin Manager (에이전트)** | | **2~3주** | 📋 |
| 33-1a | PluginManager 코어 | plugins/ 디렉토리 관리, 로딩/언로딩 | | |
| 33-1b | manifest.yaml 파서 | 매니페스트 검증, 호환성 체크 | | |
| 33-1c | File Watcher (fsnotify) | 디렉토리 변경 감시 → 자동 로딩 | | |
| 33-1d | Script Executor | exec.Command + 타임아웃 + 리소스 제한 | | |
| 33-1e | Collector 통합 | 플러그인 수집 결과를 표준 CollectResult로 변환 | | |
| 33-1f | Heartbeat에 플러그인 상태 포함 | 설치 버전, 상태, 마지막 수집 시각 | | |
| **33-2** | **Plugin Registry (서버)** | | **2~3주** | 📋 |
| 33-2a | Plugin Registry 저장소 | 플러그인 ZIP 업로드/저장/버전 관리 | | |
| 33-2b | Deploy API | POST /plugins/{name}/deploy (대상/전략 지정) | | |
| 33-2c | Heartbeat 응답에 배포 명령 | pending_plugins 필드 추가 | | |
| 33-2d | 에이전트 다운로드 API | GET /plugins/{name}/download (체크섬 포함) | | |
| 33-2e | 배포 상태 추적 | 에이전트별 설치 성공/실패/진행중 | | |
| **33-3** | **배포 전략 + 롤백** | | **1~2주** | 📋 |
| 33-3a | 즉시 배포 (immediate) | 긴급 패치용 | | |
| 33-3b | 단계 배포 (staged) | canary → 10% → 50% → 100% | | |
| 33-3c | 예약 배포 (scheduled) | cron 기반 시각 지정 | | |
| 33-3d | 자동 롤백 | 수집 실패율 > 50% 감지 시 자동 복원 | | |
| 33-3e | 수동 롤백 API | POST /plugins/{name}/rollback | | |
| **33-4** | **Fleet Console Plugin UI** | | **1~2주** | 📋 |
| 33-4a | Plugin Registry 화면 | 목록, 업로드, 버전 관리 | | |
| 33-4b | Deploy 화면 | 대상 선택 + 전략 선택 + 실행 | | |
| 33-4c | 설치 현황 대시보드 | 에이전트별 설치 상태, 성공/실패 | | |
| 33-4d | 배포 이력 타임라인 | 배포/롤백 이력 조회 | | |

---

## [39] Phase 36: 배치 프로세스 자동 감지 + 프로세스 레벨 수집 📋

> **목표**: 배치 프로세스를 설정 없이 자동 감지하고 프로세스 레벨 메트릭 수집 파이프라인 구축
> **의존성**: AITOP Agent 기본 구조 (완료), Phase 34 Runtime Attach (권장)
> **참조**: [DOCS/BATCH_MONITORING_ANALYSIS.md](DOCS/BATCH_MONITORING_ANALYSIS.md) §3.5 — Phase 36 설계

| # | 작업 | 상세 | 예상 기간 | 상태 |
|---|------|------|---------|:----:|
| **36-1** | **배치 프로세스 감지기** | | **3~5일** | 📋 |
| 36-1a | cron 자식 프로세스 감지 | cron 데몬 PID 탐지 → 자식 프로세스 그룹 추적 | | |
| 36-1b | systemd 유닛 감지 | `systemd-cgls` / D-Bus API — 서비스 유닛 실행 상태 | | |
| 36-1c | WTS(Windows Task Scheduler) 감지 | COM/WMI `Win32_ScheduledJob` + `ITaskService` | | |
| 36-1d | 배치 프로세스 식별 규칙 | 커맨드 패턴 / 환경변수 / 실행 경로 기반 화이트리스트 | | |
| **36-2** | **프로세스 레이어 Collector** | | **2~3일** | 📋 |
| 36-2a | Linux `/proc/{PID}` 폴링 | `stat`(CPU), `io`(I/O), `status`(Memory/스레드 수) 수집 | | |
| 36-2b | Windows ETW/WMI 수집 | `Win32_PerfFormattedData_PerfProc_Process` 폴링 | | |
| 36-2c | 수집 주기 설정 | 기본 5초, 설정 가능 (1s~60s) | | |
| **36-3** | **배치 생명주기 관리** | | **2일** | 📋 |
| 36-3a | 상태 머신 | 감지 → 실행중 → 완료/실패 전환 로직 | | |
| 36-3b | 종료 코드 추적 | `waitpid` / `ExitCode` 수집, 0 이외 = 실패 처리 | | |
| 36-3c | 실행 시간 측정 | 시작~종료 wall-clock 시간 기록 | | |
| **36-4** | **BatchExecution 데이터 모델** | | **1일** | 📋 |
| 36-4a | DB 스키마 설계 | `batch_executions` 테이블 (job_name, pid, started_at, ended_at, exit_code, cpu_avg, mem_peak, io_read, io_write) | | |
| 36-4b | gRPC 전송 스키마 | `BatchExecutionEvent` protobuf 메시지 정의 | | |
| **36-5** | **프레임워크 연동** | | **3~4일** | 📋 |
| 36-5a | Spring Batch 자동 수집 | `BATCH_JOB_EXECUTION` 테이블 폴링 → 실행 이력 자동 수집 | | |
| 36-5b | Airflow REST API 연동 | DAG/Task 실행 이력 수집 (`/api/v1/dags/{dag_id}/dagRuns`) | | |

**성공 지표**:
- Java/Python/Go 배치 프로세스가 설정 없이 자동 감지됨
- 프로세스 CPU/메모리/I/O/종료코드 수집 확인
- Spring Batch 실행 이력 자동 수집 확인

---

## [40] Phase 37: 배치 런타임 프로파일링 📋

> **목표**: 실행 중인 배치 프로세스에 Runtime Attach/perf/eBPF를 연계하여 SQL·메소드·스택 수준 프로파일링 제공
> **의존성**: Phase 36 완료, Phase 34 Runtime Attach, Phase 35 perf/eBPF
> **참조**: [DOCS/BATCH_MONITORING_ANALYSIS.md](DOCS/BATCH_MONITORING_ANALYSIS.md) §3.2 — 수집 방식

| # | 작업 | 상세 | 예상 기간 | 상태 |
|---|------|------|---------|:----:|
| **37-1** | **Java 배치 프로파일링** | | **2~3일** | 📋 |
| 37-1a | SQL 프로파일링 | Phase 34-1 Runtime Attach → JDBC 훅킹, 슬로우 쿼리 Top-N 수집 | | |
| 37-1b | 메소드 프로파일링 | javaagent 바이트코드 계측 → Processor/Step 실행 시간 측정 | | |
| 37-1c | 배치 ID 연관 | BatchExecution ID ↔ SQL/Method 트레이스 연결 | | |
| **37-2** | **Python 배치 프로파일링** | | **2일** | 📋 |
| 37-2a | py-spy 스택 샘플링 | Phase 34-2 연계 — 실행 중인 Python PID에 자동 Attach | | |
| 37-2b | 함수 레벨 Top-N | 샘플링 결과에서 핫 함수 추출 (Celery/Airflow Task 포함) | | |
| **37-3** | **.NET 배치 프로파일링** | | **2일** | 📋 |
| 37-3a | EventPipe 연동 | Phase 34-3 연계 — Hangfire/Quartz.NET 잡 실행 중 IPC 연결 | | |
| 37-3b | 메트릭 수집 | GC 횟수, ThreadPool 큐, 메모리 사용량 → 배치 실행 구간 슬라이스 | | |
| **37-4** | **perf/eBPF 플레임그래프 연동** | | **2~3일** | 📋 |
| 37-4a | 배치 PID 타겟 프로파일링 | Phase 35-1 연계 — 배치 실행 중 자동 perf/eBPF 트리거 | | |
| 37-4b | 배치 구간 플레임그래프 | 배치 시작~종료 구간 on-CPU/off-CPU 플레임그래프 자동 생성 | | |
| 37-4c | 배치 상세 뷰 연동 | 생성된 플레임그래프를 Phase 38 배치 상세 뷰에서 표시 | | |

**성공 지표**:
- Java 배치 실행 중 SQL Top-10 슬로우 쿼리 수집 확인
- Python 배치 py-spy 스택 샘플링 자동 실행 확인
- 배치 실행 구간 플레임그래프 자동 생성 확인

---

## [41] Phase 38: 배치 대시보드 뷰 📋

> **목표**: 배치 모니터링 전용 대시보드 UI 구현 (작업 목록, 이력 타임라인, 상세 뷰, XLog, 플레임그래프, 알림 규칙)
> **의존성**: Phase 36 완료, Phase 37 (플레임그래프 연동), Phase 35 (플레임그래프 UI)
> **참조**: [DOCS/BATCH_MONITORING_ANALYSIS.md](DOCS/BATCH_MONITORING_ANALYSIS.md) §3.3 — 배치 대시보드 뷰 설계

| # | 작업 | 상세 | 예상 기간 | 상태 |
|---|------|------|---------|:----:|
| **38-1** | **배치 작업 목록 뷰** | | **2일** | 📋 |
| 38-1a | 작업 목록 테이블 | job_name, 상태 배지(실행중/완료/실패/대기), 마지막 실행, 다음 실행 시간 | | |
| 38-1b | 실시간 갱신 | SSE 기반 실행 중인 배치 실시간 업데이트 | | |
| 38-1c | 필터/검색 | 언어별·상태별·서버별 필터링 | | |
| **38-2** | **실행 이력 타임라인** | | **3일** | 📋 |
| 38-2a | 달력형 타임라인 | 7일/30일 범위 — 성공(녹색)/실패(빨강)/실행중(파랑) 컬러 코딩 | | |
| 38-2b | 실행 시간 분포 | Gantt 바 형식 — 배치별 시작~종료 시각 표시 | | |
| 38-2c | 이력 상세 클릭 | 개별 실행 선택 → 38-3 배치 상세 뷰로 이동 | | |
| **38-3** | **배치 상세 뷰** | | **3~4일** | 📋 |
| 38-3a | 리소스 타임라인 | CPU/메모리/I/O 시계열 차트 (실행 구간 하이라이트) | | |
| 38-3b | SQL Top-N 테이블 | 슬로우 쿼리 상위 10건 (실행시간, 호출수, SQL 미리보기) | | |
| 38-3c | 메소드 Top-N | 핫 메소드/함수 Top-10 (Java/Python/Go) | | |
| **38-4** | **배치 XLog** | | **2~3일** | 📋 |
| 38-4a | XLog 산점도 (배치 전용) | X축 = 실행 순서/시각, Y축 = 실행 시간(분) — 배치 전용 스케일 | | |
| 38-4b | 에러 배치 하이라이트 | 실패 배치 빨간 점 + 종료 코드 툴팁 | | |
| 38-4c | 히트맵 연동 | Phase 28 히트맵과 배치 실행 구간 오버레이 표시 | | |
| **38-5** | **배치 플레임그래프** | | **2일** | 📋 |
| 38-5a | 플레임그래프 패널 | 배치 상세 뷰 하단 — Phase 35 플레임그래프 뷰어 재사용 | | |
| 38-5b | 실행 구간 자동 선택 | 배치 시작~종료 시각으로 플레임그래프 시간 범위 자동 설정 | | |
| **38-6** | **알림 규칙** | | **3~4일** | 📋 |
| 38-6a | 알림 규칙 엔진 | 실행 시간/실패/CPU 임계치 설정, SLA(시간 내 미완료) 감지 | | |
| 38-6b | 알림 채널 연동 | Slack / PagerDuty / 이메일 / Webhook | | |
| 38-6c | 알림 규칙 CRUD UI | 규칙 목록, 생성/수정/삭제, 알림 이력 조회 | | |
| 38-6d | 중복 알림 방지 | 동일 잡 재발 알림 쿨다운 (기본 30분) | | |

**성공 지표**:
- 배치 목록 화면에서 실행 중인 배치 실시간 확인 가능
- 배치 클릭 시 SQL Top-N, 리소스 타임라인 표시
- 배치 실행 구간 플레임그래프 표시 가능
- 배치 실패 시 30초 이내 Slack 알림 수신 확인

---

## 문서 현황

| 파일 경로 | 상태 | 비고 |
|-----------|------|------|
| `DOCS/ARCHITECTURE.md` | ✅ v2.0.2 | OTel + Agent 통합 아키텍처 — Collection Server StorageBackend 옵션(S3/Local/Dual) 추가 |
| `DOCS/METRICS_DESIGN.md` | ✅ v2.1.0 | 지표 정의 + Agent 수집 메트릭 매핑 (13개 섹션) — 미들웨어 런타임 메트릭 추가 (§13) |
| `DOCS/JAVA_DOTNET_SDK_DESIGN.md` | ✅ v1.1.0 | Java/.NET SDK 및 메소드 프로파일링 통합 설계 — 설정 항목별 반영 수준(🟢🟡🔴) 추가 |
| `DOCS/UI_DESIGN.md` | ✅ v2.2.0 | 통합 모니터링 UI 설계 — 미들웨어 전용 대시보드·Connection Pool·Thread Pool·Goroutine 뷰 추가 (§8.7) |
| `DOCS/AGENT_DESIGN.md` | ✅ v1.3.1 | AITOP Agent 상세 설계 — StorageBackend 인터페이스·S3/Local/Dual 구현체·설정 스키마 추가 (§7.6) |
| `DOCS/SOLUTION_STRATEGY.md` | ✅ v3.0.0 | 솔루션 전략 (비전/시장/GTM/혁신 로드맵) |
| `DOCS/COMPETITIVE_ANALYSIS.md` | ✅ v1.0.0 | 8개 모니터링·진단 솔루션 비교 분석 |
| `DOCS/ADR-001_AGENT_UNIFICATION.md` | ✅ v1.0.0 | 에이전트 일원화 ADR (Go 기반 Diagnostic+Monitoring 통합) |
| `DOCS/E2E_REDESIGN.md` | ✅ v1.0.0 | Phase 7' E2E 재설계 문서 (배경/범위/성공기준) |
| `DOCS/XLOG_DASHBOARD_REDESIGN.md` | ✅ | XLog/HeatMap 3패널 상세 설계 |
| `DOCS/AI_SERVICE_FLOW.md` | ✅ | AI 서비스 처리 흐름 (초보자용) |
| `DOCS/LOCAL_SETUP.md` | ✅ | 로컬 환경 가이드 — 수집 서버 스토리지 백엔드 설정 안내 추가 (§10) |
| `DOCS/TEST_GUIDE.md` | ✅ | 9단계 테스트/운영 가이드 |
| `DOCS/MANUAL_TESTING_GUIDE.md` | ✅ | 수동 테스트 절차 |
| `README.md` | ✅ | 프로젝트 진입점 (AITOP 브랜드, 전체 구조 반영) |
| `DOCS/BATCH_MONITORING_ANALYSIS.md` | ✅ v1.0.0 | Scouter 배치 모니터링 분석 + 멀티 언어 배치 프레임워크 분석 + AITOP 배치 모니터링 설계 제안 (Phase 36~38 로드맵 포함) |

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
| **ADR-011** | **에이전트 일원화 (Go 기반)** | **Diagnostic(Java) + Monitoring(Go) 에이전트를 Go 단일 바이너리로 통합 — 설치 95% 절감, 중복 수집 제거, Fleet 일원화 ([상세](DOCS/ADR-001_AGENT_UNIFICATION.md))** |
| **ADR-012** | **배치 모니터링 — 별도 에이전트 없이 AITOP Agent 통합** | **Scouter의 별도 배치 에이전트(batch agent) 방식 대신, 기존 AITOP Go Agent에 배치 감지·수집 모듈을 내장 — 설치 단순화, Fleet 일원화 유지, Runtime Attach/perf/eBPF 연계 재사용** |

---

## [13] Phase 29: Lite 모드 구현 ✅

> **목표**: `docker-compose up` 원클릭으로 설치·진단·보고서·제거가 가능한 Lite 배포 모드 구현
> **완료일**: 2026-03-23

### 29-1. 에이전트 Lite 모드

| # | 작업 | 상태 |
|---|------|------|
| 29-1-1 | `ModeLite = "lite"` 상수 + main.go Lite 분기 | ✅ |
| 29-1-2 | SQLite buffer 재사용 + 7일 retention prune | ✅ (기존 buffer.go + Purge 활용) |
| 29-1-3 | Fleet/OTA 비활성화 (Lite 분기에서 스킵) | ✅ |
| 29-1-4 | 내장 HTTP 서버 (`lite/server.go`) — 대시보드 + API | ✅ |

### 29-2. 보고서 생성

| # | 작업 | 상태 |
|---|------|------|
| 29-2-1 | 보고서 데이터 집계 | ✅ |
| 29-2-3 | HTML 보고서 (단일 파일, inline CSS) | ✅ |
| 29-2-2 | PDF 렌더링 (순수 Go minimal PDF/1.4 writer, `POST /api/report/pdf`) | ✅ |

### 29-3. 인프라

| # | 작업 | 상태 |
|---|------|------|
| 29-3-1 | `docker-compose.lite.yaml` (AGPL-free, 4 서비스) | ✅ |
| 29-3-2 | Cleanup API (`lite/cleanup.go`) | ✅ |
| 29-3-3 | E2E 시나리오 (`scripts/lite-e2e.sh`) | ✅ |

**신규 파일:**
- `agent/internal/lite/server.go` — Lite HTTP 서버 (대시보드, 상태 API, 보고서, 클린업)
- `agent/internal/lite/report.go` — HTML 보고서 생성
- `agent/internal/lite/cleanup.go` — 데이터 정리
- `docker-compose.lite.yaml` — Lite 원클릭 배포
- `scripts/lite-e2e.sh` — E2E 검증 스크립트

---

## [14] Phase 30: AGPL-free 인프라 스택 전환 ✅

> **목표**: 상용 배포 시 AGPL-3.0 라이선스 의무를 회피하기 위해 AGPL 컴포넌트를 Apache 2.0 / 자체 구현으로 대체
> **완료일**: 2026-03-23
> **참조**: [DOCS/SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) §8 라이선싱 & OSS 컴플라이언스 전략

### 30-1. AGPL 컴포넌트 대체

| # | 현재 (AGPL) | 대안 | 상태 |
|---|------------|------|------|
| 30-1-1 | Grafana | 자체 Next.js UI | ✅ 이미 완료 |
| 30-1-2 | MinIO | LocalBackend / AWS S3 | ✅ Phase 27 완료 |
| 30-1-3 | Tempo → Jaeger | `docker-compose.commercial.yaml` + `otelcol-commercial.yaml` | ✅ |
| 30-1-4 | Loki → stdout/file | OTel debug exporter로 대체, 향후 자체 로그 저장 구현 | ✅ |

### 30-2. 컴플라이언스 문서

| # | 작업 | 상태 |
|---|------|------|
| 30-2-1 | `THIRD_PARTY_LICENSES.md` — Go/NPM/인프라 전체 라이선스 고지 | ✅ |
| 30-2-2 | 기존 docker-compose에 AGPL 라이선스 경고 주석 추가 | ✅ |
| 30-2-3 | `docker-compose.commercial.yaml` — Jaeger + PostgreSQL + OTel (AGPL 없음) | ✅ |

**신규 파일:**
- `infra/docker/docker-compose.commercial.yaml` — AGPL-free 상용 스택
- `infra/docker/otelcol-commercial.yaml` — Jaeger 대상 OTel Collector 설정
- `THIRD_PARTY_LICENSES.md` — 전체 서드파티 라이선스 문서

---

*이 파일은 각 작업 세션 종료 시 업데이트한다.*
*상세 이전 이력은 [WORK_STATUS_OLD.md](WORK_STATUS_OLD.md)를 참조한다.*
*솔루션 방향성은 [DOCS/SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md)를 참조한다.*
