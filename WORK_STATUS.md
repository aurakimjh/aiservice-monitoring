# WORK_STATUS.md — 작업 진행 현황 및 TO-DO 마스터 문서

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2026-03-22 (Session 21 — Phase 15 잔여 완료: gRPC Proto + PostgreSQL + Validation + EventBus + S3 + 패키지)
> **참고**: 이 파일을 기준으로 작업을 이어가며, 각 세션 완료 시 상태를 업데이트한다.

---

## 범례 (Status Legend)

| 아이콘 | 의미 |
|--------|------|
| ✅ | 완료 (Completed) |
| 🔄 | 진행 중 (In Progress) |
| 📋 | 예정 (Planned) |
| ⚠️ | 검토 필요 (Needs Review) |
| 🔴 | 블로킹 이슈 (Blocked) |
| 💡 | 아이디어 / 옵션 |
| 🔧 | 수작업 필요 (Manual — AI 자동 생성 대상 아님) |

---

## 전체 진행률

```
═══════════════════════════════════════════════════════════════════════
  기반 구축 (Phase 1~6) — OTel 모니터링 인프라 완성
═══════════════════════════════════════════════════════════════════════
Phase 1:  기반 설계 문서       [██████████] 100%  ✅
Phase 2:  인프라 설정 파일     [██████████] 100%  ✅
Phase 3:  SDK 계측 코드        [██████████] 100%  ✅
Phase 4:  Grafana 대시보드     [██████████] 100%  ✅
Phase 5:  통합 테스트 & 검증   [██████████] 100%  ✅  (load-test.py 포함 전체 완성)
Phase 6:  운영 자동화          [██████████] 100%  ✅  (Helm Chart + GitHub Actions 완성)

═══════════════════════════════════════════════════════════════════════
  검증 & 배포 (Phase 7~9) — 프로덕션 준비
═══════════════════════════════════════════════════════════════════════
Phase 7:  E2E 통합 검증        [███░░░░░░░]  30%  🔄  (RAG 데모 + 버그 픽스 완료, Docker 통합 테스트 대기)
Phase 8:  Kubernetes 배포      [░░░░░░░░░░]   0%  📋  🔧 수작업 (Helm 배포 + 스테이징 + 프로덕션)
Phase 9:  SLO 튜닝/운영 안정화  [░░░░░░░░░░]   0%  📋  🔧 수작업 (임계치 + 샘플링 + 대시보드)

═══════════════════════════════════════════════════════════════════════
  상용 솔루션 UI 재설계 (Phase 10~14) — AITOP 에이전트 통합
  참조: DOCS/UI_DESIGN.md, AITOP_구현_차세대_방향성.MD
═══════════════════════════════════════════════════════════════════════
Phase 10: UI 기반 구축         [██████████] 100%  ✅  (Next.js + 디자인 시스템 + 인증 + 프로젝트 관리 + 인프라 뷰)
Phase 11: APM 코어 UI          [██████████] 100%  ✅  (서비스맵 + 서비스 상세 + XLog/HeatMap + 트레이스 + 로그 + 메트릭)
Phase 12: AI 네이티브 UI       [██████████] 100%  ✅  (AI 개요 + LLM 성능 + GPU 클러스터 + RAG 파이프라인 + 가드레일)
Phase 13: 에이전트 통합 + 알림  [██████████] 100%  ✅  (Agent Fleet + 진단 보고서 + Alert Policy + 인시던트 타임라인 + 채널)
Phase 14: 고도화               [██████████] 100%  ✅  (대시보드빌더 + SLO + 비용분석 + Executive + 노트북 + 멀티테넌트 + i18n + 성능최적화)

═══════════════════════════════════════════════════════════════════════
  AITOP Agent 개발 (Phase 15~16) — 에이전트 구현 + Collection Server
  참조: DOCS/AGENT_DESIGN.md, AITOP_구현_차세대_방향성.MD
═══════════════════════════════════════════════════════════════════════
Phase 15: Agent MVP (F)        [██████████] 100%  ✅  (Agent Core + OS/AI Collector + Fleet UI + gRPC Proto + PostgreSQL + Validation + EventBus + S3 + 패키지)
Phase 16: Agent GA (G)         [██████████] 100%  ✅  (IT Collectors ✅ + 원격 CLI ✅ + OTA Updater ✅ + Fleet 관리 콘솔 ✅)

═══════════════════════════════════════════════════════════════════════
  UI 통합 테스트 (Phase 17) — 에이전트 연동 후 UI E2E 검증
═══════════════════════════════════════════════════════════════════════
Phase 17: UI 통합 테스트        [░░░░░░░░░░]   0%  📋  (에이전트 실데이터 연동 + E2E 테스트 + 성능 검증)
```

---

## Session 1 완료 내역 ✅

> **날짜**: 2025-03-01 (1회차)
> **커밋**: `2aa54f4` — `feat: initialize AI service monitoring project structure`

### 완료된 작업

- [x] **프로젝트 폴더 구조 생성** (`C:\workspace\aiservice-monitoring`)
  - `DOCS/`, `collector/config|pipelines/`, `sdk-instrumentation/python|nodejs|go/`
  - `dashboards/grafana/`, `sampling/head-based|tail-based/`, `infra/kubernetes|docker/`, `scripts/`
- [x] **Git 초기화** — 사용자 `Aura Kim <aura.kimjh@gmail.com>` 설정 완료
- [x] **`.gitignore`** 작성 (Python/Node/Go/Secrets 패턴 포함)
- [x] **`README.md`** 작성
  - 프로젝트 개요, 5개 레이어 구조, SLO 목표표, 빠른 시작 가이드
- [x] **`DOCS/METRICS_DESIGN.md`** 작성 (1,369줄)
  - 레이어별 상세 지표 정의 (Layer 1~5 전체)
  - AI 특화 수식: TTFT, TPS, ms/token, GPU OOM 예측, 가드레일 기여도 (LaTeX)
  - Auto vs Manual Instrumentation 전략 매트릭스
  - Head-based + Tail-based Sampling 전략 및 비용 절감 수식
  - 가드레일 병목 시각화 방안 (데코레이터 패턴 + Span 이벤트)
  - 외부 API Context Propagation 설계 (`InstrumentedHTTPClient`)
  - 장애 예방 Alert 임계치 정의 (11개)
  - W3C TraceContext 전파 설계 (Python/Node.js/Go 코드)

---

## Session 2 완료 내역 ✅

> **날짜**: 2025-03-01 (2회차)
> **커밋**: `54bd888` — `feat: add OTel architecture, collector configs, infra, and SDK instrumentation`

### 완료된 작업

#### 설계 문서
- [x] **`DOCS/ARCHITECTURE.md`** 작성 (1,429줄)
  - 전체 아키텍처 ASCII 다이어그램 (계측 → 수집 → 저장 → 시각화)
  - 폴리글랏 데이터 흐름 시퀀스 (Next.js → FastAPI → LangChain → vLLM → OTel Collector)
  - Python/Node.js/Go SDK 초기화 패턴 (복사-붙여넣기 즉시 적용 가능 수준)
  - Collector receivers/processors/exporters 전체 설정 명세
  - Tail Sampling 10개 정책 정의 및 의사결정 흐름도
  - Baggage 활용 전략 (`user.tier`, `request.id`, `session.id` 전파)
  - Trace ID 연속성 검증 방법 (TraceQL + Prometheus 간접 탐지)
  - 이중 Collector HA 패턴 (Agent DaemonSet + Gateway Deployment + HPA)
  - 데이터 보존 계층 및 월간 비용 추정 ($215/월 @ 1,000 RPS)

#### Collector 설정 파일
- [x] **`collector/config/otelcol-agent.yaml`** (152줄)
  - OTLP gRPC/HTTP + Jaeger 수신, hostmetrics 수집
  - K8sAttributes, ResourceDetection 자동 태깅
  - WAL 영구 큐 + 재시도 설정으로 데이터 유실 방지
  - Gateway로 압축 전달
- [x] **`collector/config/otelcol-gateway.yaml`** (269줄)
  - Tail Sampling (10개 정책: 에러/고레이턴시/TTFT/가드레일/타임아웃/GPU 등)
  - DCGM + vLLM Prometheus 스크레이프 설정
  - 지표명 OTel 표준 정규화 (OTTL transform)
  - 민감 정보 마스킹 (프롬프트 전문, 인증 헤더)
  - Prometheus + Tempo + Loki 다중 팬아웃
- [x] **`infra/docker/otelcol-local.yaml`** (113줄)
  - 로컬 개발용 단일 Collector (Agent+Gateway 통합)
  - 전량 수집 + debug exporter

#### 인프라 설정 (Docker)
- [x] **`infra/docker/docker-compose.yaml`** (164줄)
  - 전체 로컬 개발 스택: OTel Collector + Prometheus + Tempo + Loki + Grafana + Jaeger
  - 고정 IP 네트워크, 헬스체크, 볼륨 영속성
- [x] **`infra/docker/prometheus.yaml`** — 스크레이프 설정
- [x] **`infra/docker/prometheus-rules.yaml`** (152줄)
  - **9개 Alert Rule**: LLM_TTFT_High, LLM_TPS_Low, LLM_Queue_Backlog, GPU_VRAM_Critical, GPU_Temperature_High, Guardrail_Block_Rate_High, Guardrail_Latency_High, ExternalAPI_Timeout_Rate_High, VectorDB_Search_Slow
- [x] **`infra/docker/tempo.yaml`** — 트레이스 저장소 설정 (7일 보존, TraceQL 활성화)
- [x] **`infra/docker/loki.yaml`** — 로그 저장소 설정 (7일 보존)
- [x] **`infra/docker/grafana-datasources.yaml`** — Trace↔Metric↔Log 3방향 상관관계 링크
- [x] **`infra/docker/grafana-dashboards.yaml`** — 대시보드 프로비저닝 설정

#### 인프라 설정 (Kubernetes)
- [x] **`infra/kubernetes/dcgm-exporter.yaml`**
  - GPU DaemonSet (GPU 노드만 선택 배포)
  - 필수 DCGM 지표 선별 ConfigMap (13개 field)
  - Headless Service (Prometheus 직접 스크레이프)
- [x] **`infra/kubernetes/otelcol-configmap.yaml`**
  - Agent/Gateway ConfigMap 구조
  - Agent Headless Service + Gateway ClusterIP Service

#### SDK 계측 코드 (Python)
- [x] **`sdk-instrumentation/python/otel_setup.py`** (127줄)
  - 공통 OTel 초기화 (TracerProvider + MeterProvider + W3C Propagator)
  - Auto-instrumentation: httpx, redis, pymongo
  - FastAPI 미들웨어 주입 함수 (`instrument_fastapi`)
  - Resource 속성 자동 태깅 (K8s Pod/Node, AI Service Layer)
- [x] **`sdk-instrumentation/python/guardrails/nemo_instrumentation.py`** (129줄)
  - `@instrument_guardrail()` 데코레이터 패턴
  - PASS/BLOCK/REASK 액션별 메트릭 분기
  - Tail Sampling 트리거용 Span 이벤트 기록
  - 5개 메트릭: validation.duration, block.total, reask.total, policy_violation.total, request.total
- [x] **`sdk-instrumentation/python/llm/vllm_instrumentation.py`** (152줄)
  - `instrument_vllm_generate()` 비동기 제너레이터 래퍼
  - 스트리밍 첫 청크 포착 → TTFT 정확 계측
  - TTFT/TPS/ms_per_token/queue_wait 전체 히스토그램
  - concurrent_requests UpDownCounter (실시간 동시 처리 수)

#### SDK 계측 코드 (Node.js / Go)
- [x] **`sdk-instrumentation/nodejs/otel-setup.js`** (71줄)
  - NodeSDK with OTLP gRPC exporter
  - W3C TraceContext + Baggage 전파 설정
  - HTTP/fetch 자동 계측, 헬스체크 URL 제외
- [x] **`sdk-instrumentation/go/otel_setup.go`** (119줄)
  - gRPC 연결 + TracerProvider + MeterProvider
  - W3C 전파, 15초 메트릭 수출 간격
  - 정상 종료 보장 (shutdown 함수 반환)

---

## Session 3 완료 내역 ✅

> **날짜**: 2026-03-02 (3회차)
> **커밋**: (아래 참조) — Session 3 전체 작업

### 완료된 작업

#### SDK 계측 코드 (Python agents)
- [x] **`sdk-instrumentation/python/agents/langchain_tracer.py`** (295줄)
  - `OtelCallbackHandler(BaseCallbackHandler)` 클래스 — LangChain/LangGraph 전용
  - Chain/Tool/LLM/Graph 이벤트 → OTel Span 자동 변환
  - LangGraph 재귀 깊이 추적 (`agent.graph.recursion_depth`) + 15회 초과 경고 이벤트
  - 상태 전환 Counter (`agent.graph.state_transitions.total`)
- [x] **`sdk-instrumentation/python/agents/external_api_tracer.py`** (220줄)
  - `InstrumentedHTTPClient` — GET/POST/PUT/DELETE + W3C propagation 자동 주입
  - `CircuitBreakerHTTPClient` — 연속 실패 임계치 초과 시 OPEN 상태 전환
  - 타임아웃/ConnectError/NetworkError 에러 유형별 분리 카운터
- [x] **`sdk-instrumentation/python/agents/fastapi_streaming.py`** (145줄)
  - `StreamingInstrumentor.wrap()` — FastAPI StreamingResponse 래퍼
  - 청크 간 지연 측정 + 500ms 초과 시 `streaming.delay_spike` 이벤트
  - GeneratorExit (클라이언트 연결 끊김) 별도 처리
- [x] **`sdk-instrumentation/python/llm/embedding_instrumentation.py`** (210줄)
  - `InstrumentedSentenceTransformer` — 로컬 HuggingFace GPU 임베딩
  - `InstrumentedOpenAIEmbedding` — OpenAI API 비동기 래퍼 (실제 토큰 수 사용)
  - `@instrument_embedding_fn()` 데코레이터 — 커스텀 임베딩 함수 지원
- [x] **`sdk-instrumentation/python/vector_db/vectordb_instrumentation.py`** (280줄)
  - `InstrumentedPinecone` — search/upsert/delete 계측
  - `InstrumentedQdrant` — 비동기 클라이언트 계측
  - `SemanticCacheLayer` — Redis Semantic Cache + 벡터 DB 통합 계층
  - `_attach_search_quality()` — Score Spread 품질 지표 자동 기록

#### SDK 계측 코드 (Node.js)
- [x] **`sdk-instrumentation/nodejs/frontend-streaming.js`** (160줄)
  - `trackStreamingChunks()` — SSE 스트리밍 비동기 제너레이터 계측
  - `measureWebVitals()` — LCP/CLS/FID → OTel Metric 변환 (Next.js 통합)
  - `instrumentedFetch()` — fetch에 W3C traceparent 헤더 자동 주입

#### Kubernetes 프로덕션 매니페스트
- [x] **`infra/kubernetes/namespace-rbac.yaml`**
  - `monitoring`, `ai-inference` 네임스페이스 생성
  - OTel Collector ServiceAccount + ClusterRole(K8s 메타데이터 조회) + ClusterRoleBinding
- [x] **`infra/kubernetes/otelcol-agent-daemonset.yaml`** (135줄)
  - DaemonSet — GPU 노드 포함 전 노드 배포 (Toleration 포함)
  - `system-node-critical` PriorityClass, hostPath WAL 스토리지
  - LivenessProbe + ReadinessProbe, 리소스 requests/limits
  - Headless Service — Prometheus 직접 스크레이프
- [x] **`infra/kubernetes/otelcol-gateway-deployment.yaml`** (155줄)
  - Deployment 3 replicas + PodAntiAffinity (다중 노드/AZ 분산)
  - HPA (min:3, max:10, CPU 70% + Memory 75% 트리거)
  - 스케일업 60초, 스케일다운 300초 안정화 (Tail Sampling 상태 보호)
  - PodDisruptionBudget (minAvailable: 2)
- [x] **`infra/kubernetes/prometheus-servicemonitor.yaml`** (150줄)
  - ServiceMonitor: OTel Agent, Gateway, DCGM Exporter
  - PodMonitor: vLLM Inference (10초 스크레이프)
  - PrometheusRule: 6개 Recording Rules (TTFT P95, TPS P50, 차단율, VRAM, 에러율, 캐시 히트율)

#### Grafana 대시보드 (5개 JSON)
- [x] **`dashboards/grafana/ai-service-overview.json`** — Executive 전체 현황 (8개 KPI stat + 레이어별 기여도)
- [x] **`dashboards/grafana/llm-performance.json`** — TTFT/TPS/토큰 비용/큐 대기 (Exemplar 연동)
- [x] **`dashboards/grafana/gpu-correlation.json`** — VRAM vs 큐 대기 이중 Y축, OOM 예측 카운트다운
- [x] **`dashboards/grafana/guardrail-analysis.json`** — 차단율/위반 유형/레이턴시 기여도/Loki 로그 테이블
- [x] **`dashboards/grafana/agent-external-api.json`** — Tool 성공률/외부 API P99/재귀 깊이/타임아웃 히트맵

#### 검증 및 유틸리티 스크립트
- [x] **`scripts/validate-traces.py`** (200줄)
  - Tempo TraceQL로 Context Propagation 단절 3개 패턴 탐지
  - 성능 이상 4개 패턴 탐지 (TTFT 급등, 가드레일 차단, 에러 등)
  - `--fail-on-broken` 플래그 → CI 파이프라인 연동 가능
- [x] **`scripts/benchmark-sampling.py`** (160줄)
  - Tail Sampling 정책별 보존율 시뮬레이션 (표 형식 출력)
  - 월간 저장 비용 추정 (S3 ap-northeast-2 기준)
  - `--export-csv` 옵션으로 결과 저장
- [x] **`scripts/test-alerts.sh`** (130줄)
  - `promtool check rules` YAML 문법 검증
  - 필수 Alert Rule 9개 존재 확인
  - 임계치 값, for 절, severity 레이블 자동 검증
  - 실행 중인 Prometheus에서 FIRING 알람 현황 조회

---

## Session 4 완료 내역 ✅

> **날짜**: 2026-03-02 (4회차 — 부분 완료 후 중단)
> **커밋**: (아래 참조)

### 완료된 작업

#### 검증 스크립트 (Phase 5 잔여 완성)
- [x] **`scripts/load-test.py`** (약 260줄)
  - `NormalTrafficUser` — 정상 트래픽 (채팅 70%, 임베딩 20%, 헬스체크 10%)
  - `GuardrailStressUser` — 악성 입력 20% 혼합, 가드레일 차단율 검증
  - `LLMOverloadUser` — 동시 100 요청, 긴 컨텍스트로 GPU 포화 유도
  - `ExternalAPIDelayUser` — 웹 검색 에이전트 요청, Circuit Breaker 동작 검증
  - `PrometheusCapture` — 테스트 전후 Prometheus 지표 자동 캡처 및 비교 출력
  - `--html`, `--csv` 리포트, `PROMETHEUS_SNAPSHOT=true` 옵션 지원

#### Helm Chart 패키징 (Phase 6 — 부분 완료)
- [x] **`helm/aiservice-monitoring/Chart.yaml`**
  - apiVersion v2, 5개 서브차트 의존성 선언
  - otel-collector (Agent + Gateway 분리), kube-prometheus-stack, tempo, loki
- [x] **`helm/aiservice-monitoring/values.yaml`**
  - OTel Agent DaemonSet 설정 (GPU toleration, WAL, priorityClass)
  - OTel Gateway Deployment + HPA (min:3, max:10) + PDB 설정
  - kube-prometheus-stack: Prometheus, Alertmanager (Slack 알람), Grafana
  - Tempo (7일 retention, metrics-generator 활성화), Loki (7일 retention)
  - RBAC, ServiceMonitor, PrometheusRule, Grafana Dashboard ConfigMap 플래그

### 미완료 항목 → Session 5에서 완료

- [x] **`helm/aiservice-monitoring/values-dev.yaml`** — 개발 환경 오버라이드 ✅ (Session 5)
- [x] **`helm/aiservice-monitoring/values-prod.yaml`** — 프로덕션 환경 오버라이드 ✅ (Session 5)
- [x] **`helm/aiservice-monitoring/templates/`** — 전체 템플릿 완성 ✅ (Session 5)
- [x] **`.github/workflows/lint.yaml`** — YAML 검증 + Python/JS 린트 ✅ (Session 5)
- [x] **`.github/workflows/validate-collector.yaml`** — otelcol validate 실행 ✅ (Session 5)
- [x] **`.github/workflows/test-alerts.yaml`** — promtool check rules 실행 ✅ (Session 5)

---

## Session 5 완료 내역 ✅

> **날짜**: 2026-03-05 (5회차)
> **커밋**: (아래 참조) — Phase 6 전체 완성

### 완료된 작업

#### Helm Chart 템플릿 완성
- [x] **`helm/aiservice-monitoring/templates/_helpers.tpl`** — 공통 헬퍼 (차트명, 레이블, 셀렉터, SA명)
- [x] **`helm/aiservice-monitoring/values-dev.yaml`** — 개발 환경 오버라이드
  - 단일 레플리카, 3일 보존, Tail Sampling 전량 수집(100%), 최소 리소스
- [x] **`helm/aiservice-monitoring/values-prod.yaml`** — 프로덕션 환경 오버라이드
  - Thanos Sidecar S3 연동, Slack+PagerDuty 알람, Grafana Ingress+TLS
  - Tempo/Loki S3 백엔드, 14일 보존, HA 구성(Gateway max:15)
- [x] **`helm/aiservice-monitoring/templates/rbac.yaml`** — Namespace + SA + ClusterRole + Binding
- [x] **`helm/aiservice-monitoring/templates/configmap-dashboards.yaml`** — 5개 Grafana 대시보드 ConfigMap
- [x] **`helm/aiservice-monitoring/templates/prometheus-rules.yaml`** — 9개 Alert Rule + 6개 Recording Rule CRD
- [x] **`helm/aiservice-monitoring/templates/servicemonitor.yaml`** — 3개 ServiceMonitor + 1개 PodMonitor
- [x] **`helm/aiservice-monitoring/templates/NOTES.txt`** — 설치 후 안내 메시지

#### GitHub Actions CI/CD 파이프라인
- [x] **`.github/workflows/lint.yaml`** — yamllint + ruff + eslint + helm lint (4 jobs 병렬)
- [x] **`.github/workflows/validate-collector.yaml`** — otelcol-contrib validate (Agent/Gateway/Local 3개 config)
- [x] **`.github/workflows/test-alerts.yaml`** — promtool check rules + 9개 Alert 존재 확인 + severity 검증
- [x] **`.github/workflows/validate-traces.yaml`** — staging Tempo Context Propagation 단절 탐지 (수동/스케줄 트리거)

#### Collector Pipeline 문서화
- [x] **`collector/pipelines/traces-pipeline.md`** — 트레이스 전체 흐름 ASCII 다이어그램 + 단계별 상세 + 단절 탐지
- [x] **`collector/pipelines/metrics-pipeline.md`** — 지표 파이프라인 (5개 레이어 지표 분류 + 수집 경로 + 비용 추정)

#### 테스트 가이드 및 문서 기술 검토
- [x] **`DOCS/TEST_GUIDE.md`** (신규 작성, ~500줄) — 초보자용 9단계 테스트/운영 가이드
  - Level 1~9: 인프라 기동 → 텔레메트리 확인 → 대시보드 → 알람 → 부하 → 트레이스 → 샘플링 → Helm → CI
  - 단계별 명령어, 검증 기준, FAQ 포함
- [x] **`DOCS/ARCHITECTURE.md`** 기술 검토 및 수정 (v1.0.0 → v1.1.0)
  - OTel Collector 버전 수정: 0.104.0 → 0.91.0 (실제 config와 일치)
  - 설정 파일명 수정: `otelcol-config.yaml` → `otelcol-agent.yaml`/`otelcol-gateway.yaml`
  - Go 코드 수정: deprecated `grpc.DialContext` → `grpc.NewClient`
  - Section 10 추가: 버전 호환성 매트릭스
  - 관련 문서 상호 링크 추가
- [x] **`DOCS/METRICS_DESIGN.md`** 기술 검토 및 수정 (v1.0.0 → v1.1.0)
  - Prometheus 쿼리 지표명 수정: `aiservice_` 접두사 누락 → 실제 Alert Rule과 일치
  - Section 9 추가: 지표명 네이밍 컨벤션 (OTel SDK → Prometheus 매핑)
  - Section 10 추가: 실제 구현 파일 매핑 테이블
  - 관련 문서 상호 링크 추가
- [x] **`DOCS/LOCAL_SETUP.md`** 기술 검토 및 수정
  - 관련 문서 상호 링크 추가
  - "다음 단계" 섹션 추가 (문서 열람 순서 안내)
- [x] **`README.md`** 문서 상태 테이블 업데이트
  - ARCHITECTURE.md: 🔄 → ✅, LOCAL_SETUP.md/TEST_GUIDE.md 행 추가

---

## Session 6 완료 내역 ✅

> **날짜**: 2026-03-09 (6회차)
> **커밋**: (아래 참조) — XLog 대시보드, 문서 강화, 버그 픽스, RAG 데모

### 완료된 작업

#### XLog/HeatMap 실시간 대시보드 (신규 6파일)
- [x] **`dashboards/xlog-heatmap/index.html`** — 메인 대시보드 페이지 (다크 테마, 서비스 필터, 시간 범위, 데이터 소스 선택)
- [x] **`dashboards/xlog-heatmap/css/dashboard.css`** — Grafana 스타일 다크 테마 CSS
- [x] **`dashboards/xlog-heatmap/js/data-source.js`** — 3모드 데이터 소스 (demo/prometheus/tempo)
- [x] **`dashboards/xlog-heatmap/js/xlog-chart.js`** — Canvas 기반 Scatter Plot (그리드 인덱싱, 드래그 줌, 임계선)
- [x] **`dashboards/xlog-heatmap/js/heatmap-chart.js`** — Canvas 기반 HeatMap (7개 응답시간 밴드, 5초 버킷)
- [x] **`dashboards/xlog-heatmap/js/app.js`** — IIFE 오케스트레이터 (5초 주기 데이터 페치, 통계 표시)
- [x] **`infra/docker/docker-compose.yaml`** — xlog-dashboard nginx 서비스 추가 (port 8080)

#### 문서 강화 (초보자용 설명 추가)
- [x] **`DOCS/ARCHITECTURE.md`** — "이 문서를 읽기 전에 — 핵심 개념 이해하기" 섹션 추가 (고속도로 CCTV 비유)
- [x] **`DOCS/METRICS_DESIGN.md`** — "AI 서비스 성능 지표란? — 초보자 가이드" 섹션 추가 (식당/타자기/책상 비유)
- [x] **`DOCS/LOCAL_SETUP.md`** — "완전 초보자를 위한 안내" 섹션 추가 (자동차 계기판/택배 비유)
- [x] **`DOCS/TEST_GUIDE.md`** — 각 Level에 "왜 필요한가?/실패 시?" 설명 추가, Tempo FAQ, helm dependency 단계, 부록 A(RAG 데모 통합 테스트)
- [x] **`DOCS/AI_SERVICE_FLOW.md`** (신규, ~530줄) — AI 서비스 처리 흐름 7단계 상세 (택배 추적/도서관/레스토랑 비유, 4개 시나리오, 30개 용어 사전)
- [x] **`DOCS/html/` 폴더 삭제** — 4개 HTML 파일 제거 (ARCHITECTURE, LOCAL_SETUP, METRICS_DESIGN, README)
- [x] **`README.md`** — AI_SERVICE_FLOW.md 문서 테이블에 추가

#### 프로젝트 버그 픽스 (Critical 5건 중 3건 수정)
- [x] **`infra/docker/prometheus.yaml`** — `metric_relabel_configs` regex를 `(otelcol|aiservice)_.*`로 수정 (애플리케이션 메트릭 드롭 방지)
- [x] **`infra/docker/docker-compose.yaml`** — Jaeger 포트 `14268→14269` (OTel Collector와 포트 충돌 해소)
- [x] **`DOCS/TEST_GUIDE.md`** — `--lookback 1h` → `--hours 1` 수정 (스크립트 실제 인터페이스와 일치)
- [x] **`sdk-instrumentation/python/otel_setup.py`** — Auto-instrumentation 개별 try/except 래핑 (미설치 라이브러리 오류 방지)
- [x] **`sdk-instrumentation/python/` 하위 5개 `__init__.py`** 생성 — ModuleNotFoundError 해소

#### RAG 데모 프로젝트 (신규 30파일, `demo/rag-service/`)
- [x] **`app/main.py`** — FastAPI 앱 (OTel 초기화, 샘플 문서 자동 로딩, CORS)
- [x] **`app/config.py`** — pydantic-settings 기반 설정 (`mock_mode=True` 기본)
- [x] **`app/models.py`** — Pydantic 모델 (ChatRequest/Response, SourceDocument, ResponseMetrics)
- [x] **`app/services/rag_service.py`** — RAG 파이프라인 오케스트레이터 (가드레일→임베딩→벡터검색→LLM→출력검증)
- [x] **`app/services/vector_store.py`** — 인메모리 벡터 스토어 (numpy, 코사인 유사도)
- [x] **`app/services/embedding_service.py`** — Mock(MD5 해시 기반)/Real(OpenAI) 임베딩
- [x] **`app/services/llm_service.py`** — Mock(한국어 템플릿)/Real(OpenAI) LLM (TTFT/TPS 계측)
- [x] **`app/services/guardrail_service.py`** — 키워드 기반 입출력 안전 검사
- [x] **`app/instrumentation/otel_setup.py`** — TracerProvider + MeterProvider OTLP gRPC 설정
- [x] **`app/instrumentation/rag_tracer.py`** — `@trace_rag_step()` 데코레이터 (sync/async 지원)
- [x] **`app/instrumentation/metrics.py`** — 8개 히스토그램 + 2개 카운터
- [x] **`app/routers/chat.py`** — POST `/api/chat` (동기/SSE 스트리밍)
- [x] **`app/routers/documents.py`** — 문서 업로드/목록 API
- [x] **`app/routers/health.py`** — 헬스체크 엔드포인트
- [x] **3개 샘플 문서** — 회사 정책, 제품 매뉴얼, AI/ML 기술 가이드 (한국어)
- [x] **`requirements.txt`**, **`Dockerfile`**, **`docker-compose.yaml`**, **`.env.example`**, **`README.md`**
- [x] **3개 테스트 파일** — vector_store, API, rag_service 테스트
- [x] **5개 `__init__.py`** — Python 패키지 초기화

#### 미수정 이슈 (향후 검토)
- ⚠️ `helm/values.yaml` line 99: Go 템플릿 문법이 values 파일에 포함됨
- ⚠️ Grafana 대시보드 `__inputs` 변수: 파일 기반 프로비저닝 시 미해결
- ⚠️ `values-prod.yaml` 중복 `alertmanagerSpec` 키

---

## 미완료 항목 — Phase 5: 통합 테스트

> **모두 완료됨.** 잔여 없음.

---

## 완료 — Phase 6: 운영 자동화 ✅

### 6-1. Helm Chart 패키징 ✅ (완료)
```
파일 위치: helm/aiservice-monitoring/
```
- [x] `Chart.yaml` — 차트 메타데이터 및 5개 서브차트 의존성 선언 ✅
- [x] `values.yaml` — 기본값 전체 (OTel Agent/Gateway, Prometheus, Tempo, Loki) ✅
- [x] `values-dev.yaml` — 개발 환경 오버라이드 ✅ (Session 5)
- [x] `values-prod.yaml` — 프로덕션 오버라이드 (Thanos, Slack, PagerDuty) ✅ (Session 5)
- [x] `templates/_helpers.tpl` — 공통 헬퍼 템플릿 ✅ (Session 5)
- [x] `templates/rbac.yaml` — Namespace + SA + ClusterRole + Binding ✅ (Session 5)
- [x] `templates/configmap-dashboards.yaml` — Grafana 대시보드 ConfigMap ✅ (Session 5)
- [x] `templates/prometheus-rules.yaml` — Alert + Recording Rule CRD ✅ (Session 5)
- [x] `templates/servicemonitor.yaml` — ServiceMonitor + PodMonitor ✅ (Session 5)
- [x] `templates/NOTES.txt` — 설치 후 안내 메시지 ✅ (Session 5)

### 6-2. GitHub Actions CI/CD 파이프라인 ✅ (완료)
```
파일 위치: .github/workflows/
```
- [x] `lint.yaml` — yamllint + ruff + eslint + helm lint ✅ (Session 5)
- [x] `validate-collector.yaml` — otelcol validate --config 실행 ✅ (Session 5)
- [x] `test-alerts.yaml` — promtool check rules + Alert 존재 + severity 검증 ✅ (Session 5)
- [x] `validate-traces.yaml` — staging Tempo Context Propagation 단절 탐지 ✅ (Session 5)

### 6-3. Collector Pipelines 문서화 ✅ (완료)
```
파일 위치: collector/pipelines/
```
- [x] `traces-pipeline.md` — 트레이스 데이터 흐름 ASCII 다이어그램 ✅ (Session 5)
- [x] `metrics-pipeline.md` — 지표 파이프라인 (DCGM → Prometheus → Thanos) ✅ (Session 5)

---

## 파일 현황 요약

| 파일 경로 | 상태 | 라인 수 | 비고 |
|-----------|------|---------|------|
| `DOCS/METRICS_DESIGN.md` | ✅ | 1,369+ | 지표 정의 (v1.1.0 — 네이밍 컨벤션, 파일 매핑 추가) |
| `DOCS/ARCHITECTURE.md` | ✅ | 1,429+ | 아키텍처 설계 (v1.1.0 — 버전 수정, 호환성 매트릭스 추가) |
| `DOCS/LOCAL_SETUP.md` | ✅ | — | 로컬 환경 가이드 (문서 링크, 다음 단계 추가) |
| `DOCS/TEST_GUIDE.md` | ✅ | ~500 | 9단계 테스트/운영 가이드 (초보자용) |
| `README.md` | ✅ | 221 | 프로젝트 진입점 (문서 상태 업데이트) |
| `WORK_STATUS.md` | ✅ | 현재 | 이 파일 |
| `collector/config/otelcol-agent.yaml` | ✅ | 152 | 프로덕션 적용 가능 |
| `collector/config/otelcol-gateway.yaml` | ✅ | 269 | 프로덕션 적용 가능 |
| `infra/docker/otelcol-local.yaml` | ✅ | 113 | 로컬 개발용 |
| `infra/docker/docker-compose.yaml` | ✅ | 164 | 즉시 실행 가능 |
| `infra/docker/prometheus.yaml` | ✅ | 40 | — |
| `infra/docker/prometheus-rules.yaml` | ✅ | 152 | 9개 Alert Rule |
| `infra/docker/tempo.yaml` | ✅ | 60 | — |
| `infra/docker/loki.yaml` | ✅ | 48 | — |
| `infra/docker/grafana-datasources.yaml` | ✅ | 70 | 3방향 연동 설정 |
| `infra/docker/grafana-dashboards.yaml` | ✅ | 17 | 프로비저닝 설정 |
| `infra/kubernetes/dcgm-exporter.yaml` | ✅ | 120 | GPU DaemonSet |
| `infra/kubernetes/otelcol-configmap.yaml` | ✅ | 140 | ConfigMap + Service |
| `infra/kubernetes/namespace-rbac.yaml` | ✅ | 60 | RBAC 완성 |
| `infra/kubernetes/otelcol-agent-daemonset.yaml` | ✅ | 135 | DaemonSet + Toleration |
| `infra/kubernetes/otelcol-gateway-deployment.yaml` | ✅ | 155 | Deployment + HPA + PDB |
| `infra/kubernetes/prometheus-servicemonitor.yaml` | ✅ | 150 | 6개 Recording Rules |
| `sdk-instrumentation/python/otel_setup.py` | ✅ | 127 | 공통 초기화 |
| `sdk-instrumentation/python/guardrails/nemo_instrumentation.py` | ✅ | 129 | 가드레일 데코레이터 |
| `sdk-instrumentation/python/llm/vllm_instrumentation.py` | ✅ | 152 | TTFT/TPS 계측 |
| `sdk-instrumentation/python/llm/embedding_instrumentation.py` | ✅ | 210 | HuggingFace + OpenAI |
| `sdk-instrumentation/python/agents/langchain_tracer.py` | ✅ | 295 | LangChain/LangGraph 콜백 |
| `sdk-instrumentation/python/agents/external_api_tracer.py` | ✅ | 220 | CircuitBreaker + W3C |
| `sdk-instrumentation/python/agents/fastapi_streaming.py` | ✅ | 145 | SSE 스트리밍 계측 |
| `sdk-instrumentation/python/vector_db/vectordb_instrumentation.py` | ✅ | 280 | Pinecone + Qdrant + Cache |
| `sdk-instrumentation/nodejs/otel-setup.js` | ✅ | 71 | Node.js 초기화 |
| `sdk-instrumentation/nodejs/frontend-streaming.js` | ✅ | 160 | SSE + Web Vitals |
| `sdk-instrumentation/go/otel_setup.go` | ✅ | 119 | Go 초기화 |
| `dashboards/grafana/ai-service-overview.json` | ✅ | — | 8개 KPI + 레이어 기여도 |
| `dashboards/grafana/llm-performance.json` | ✅ | — | TTFT/TPS/토큰 비용 |
| `dashboards/grafana/gpu-correlation.json` | ✅ | — | VRAM vs 큐 대기 이중 Y축 |
| `dashboards/grafana/guardrail-analysis.json` | ✅ | — | 차단율 + Loki 로그 |
| `dashboards/grafana/agent-external-api.json` | ✅ | — | Tool 성공률 + P99 |
| `scripts/validate-traces.py` | ✅ | 200 | TraceQL 전파 단절 탐지 |
| `scripts/load-test.py` | ✅ | 260 | Locust 4개 시나리오 + Prometheus 캡처 |
| `scripts/benchmark-sampling.py` | ✅ | 160 | Tail Sampling 비용 시뮬레이션 |
| `scripts/test-alerts.sh` | ✅ | 130 | Alert Rule 검증 |
| `helm/aiservice-monitoring/Chart.yaml` | ✅ | — | 5개 서브차트 의존성 |
| `helm/aiservice-monitoring/values.yaml` | ✅ | — | 전체 기본값 (Agent/GW/Prom/Tempo/Loki) |
| `helm/aiservice-monitoring/values-dev.yaml` | ✅ | — | 개발 환경 오버라이드 |
| `helm/aiservice-monitoring/values-prod.yaml` | ✅ | — | 프로덕션 (Thanos + Slack + PagerDuty) |
| `helm/aiservice-monitoring/templates/_helpers.tpl` | ✅ | — | 공통 헬퍼 |
| `helm/aiservice-monitoring/templates/rbac.yaml` | ✅ | — | NS + SA + ClusterRole |
| `helm/aiservice-monitoring/templates/configmap-dashboards.yaml` | ✅ | — | 5개 대시보드 ConfigMap |
| `helm/aiservice-monitoring/templates/prometheus-rules.yaml` | ✅ | — | 9개 Alert + 6개 Recording |
| `helm/aiservice-monitoring/templates/servicemonitor.yaml` | ✅ | — | 3 ServiceMonitor + 1 PodMonitor |
| `helm/aiservice-monitoring/templates/NOTES.txt` | ✅ | — | 설치 후 안내 |
| `.github/workflows/lint.yaml` | ✅ | — | yamllint + ruff + eslint + helm |
| `.github/workflows/validate-collector.yaml` | ✅ | — | otelcol validate |
| `.github/workflows/test-alerts.yaml` | ✅ | — | promtool check rules |
| `.github/workflows/validate-traces.yaml` | ✅ | — | staging Tempo 단절 탐지 |
| `collector/pipelines/traces-pipeline.md` | ✅ | — | 트레이스 흐름 다이어그램 |
| `collector/pipelines/metrics-pipeline.md` | ✅ | — | 지표 파이프라인 문서 |
| `DOCS/AI_SERVICE_FLOW.md` | ✅ | ~530 | AI 서비스 처리 흐름 (초보자용) |
| `dashboards/xlog-heatmap/index.html` | ✅ | — | XLog/HeatMap 대시보드 메인 |
| `dashboards/xlog-heatmap/css/dashboard.css` | ✅ | — | 다크 테마 CSS |
| `dashboards/xlog-heatmap/js/data-source.js` | ✅ | — | 3모드 데이터 소스 |
| `dashboards/xlog-heatmap/js/xlog-chart.js` | ✅ | — | Canvas Scatter Plot |
| `dashboards/xlog-heatmap/js/heatmap-chart.js` | ✅ | — | Canvas HeatMap |
| `dashboards/xlog-heatmap/js/app.js` | ✅ | — | 대시보드 오케스트레이터 |
| `demo/rag-service/` | ✅ | 30파일 | RAG 데모 서비스 (mock_mode 지원) |
| `sdk-instrumentation/python/__init__.py` (×5) | ✅ | — | 패키지 초기화 |
| **프론트엔드 (Phase 10-11)** | | | |
| `frontend/src/types/monitoring.ts` | ✅ | ~220 | 코어 타입 (Service, Trace, Log, Metric 등) |
| `frontend/src/lib/demo-data.ts` | ✅ | ~830 | Mock 데이터 (20+ 함수, 23 메트릭 카탈로그) |
| `frontend/src/lib/utils.ts` | ✅ | ~55 | 유틸리티 (cn, formatDuration, getRelativeTime 등) |
| `frontend/src/components/ui/` | ✅ | 9파일 | UI 컴포넌트 (Button, Badge, Card, Input, Tabs 등) |
| `frontend/src/components/charts/` | ✅ | 3파일 | EChartsWrapper, TimeSeriesChart, SparkLine |
| `frontend/src/components/monitoring/` | ✅ | 7파일 | KPICard, StatusIndicator, GPUCard, ServiceMap 등 |
| `frontend/src/components/layout/` | ✅ | 4파일 | Sidebar, Topbar, StatusBar, CommandPalette |
| `frontend/src/app/services/page.tsx` | ✅ | ~190 | 서비스 목록 + 서비스 맵 |
| `frontend/src/app/services/[id]/page.tsx` | ✅ | ~650 | 서비스 상세 대시보드 (7탭) |
| `frontend/src/app/traces/page.tsx` | ✅ | ~520 | XLog/HeatMap 통합 대시보드 |
| `frontend/src/app/traces/[traceId]/page.tsx` | ✅ | ~280 | 트레이스 상세 워터폴 |
| `frontend/src/app/logs/page.tsx` | ✅ | ~370 | 로그 탐색기 (Stream + Patterns) |
| `frontend/src/app/metrics/page.tsx` | ✅ | ~370 | 메트릭 탐색기 (Explore + Catalog) |
| `frontend/src/app/infra/[hostname]/page.tsx` | ✅ | ~330 | 호스트 상세 (리소스, GPU, 미들웨어) |
| `frontend/src/app/projects/[id]/page.tsx` | ✅ | — | 프로젝트 상세 |
| `frontend/src/app/ai/page.tsx` | ✅ | ~160 | AI 서비스 개요 (Executive KPI + 테이블) |
| `frontend/src/app/ai/[id]/page.tsx` | ✅ | ~420 | AI 서비스 상세 (LLM/RAG/Guardrail/GPU 탭) |
| `frontend/src/app/ai/gpu/page.tsx` | ✅ | ~160 | GPU 클러스터 뷰 (GPU 그리드 + 추이) |
| `frontend/src/app/agents/page.tsx` | ✅ | ~190 | Agent Fleet Console (3탭) |
| `frontend/src/app/diagnostics/page.tsx` | ✅ | ~170 | AITOP 진단 보고서 (16항목 + recommendation) |
| `frontend/src/app/alerts/page.tsx` | ✅ | ~290 | 알림 & 인시던트 (Policy + Incident Timeline + Channels) |
| `frontend/src/app/slo/page.tsx` | ✅ | ~120 | SLO 관리 (6 SLO, error budget, burn rate) |
| `frontend/src/app/costs/page.tsx` | ✅ | ~120 | 비용 분석 (도넛 차트 + 추이 + 카테고리 상세) |
| `frontend/src/app/executive/page.tsx` | ✅ | ~180 | Executive 대시보드 (게이지 + 도넛 + 이슈 + 트렌드) |
| `frontend/src/app/dashboards/page.tsx` | ✅ | ~500 | 커스텀 대시보드 빌더 (Drag&Drop + 6위젯 + 템플릿) |
| `frontend/src/app/notebooks/page.tsx` | ✅ | ~420 | Investigation Notebook (Markdown/Query/Chart 셀) |
| `frontend/src/app/tenants/page.tsx` | ✅ | ~230 | 멀티테넌트 관리 (6테넌트 + White-label + Revenue) |
| `frontend/src/lib/i18n.ts` | ✅ | ~250 | i18n 번역 사전 (ko/en/ja × ~70키) |
| `frontend/src/hooks/use-i18n.ts` | ✅ | ~15 | useI18n() hook |
| `frontend/src/lib/web-vitals.ts` | ✅ | ~60 | Web Vitals 모니터링 (LCP, FCP, CLS) |
| `frontend/src/components/ui/virtual-list.tsx` | ✅ | ~55 | 가상 스크롤 (100K+ 행) |
| `frontend/src/components/ui/skip-link.tsx` | ✅ | ~12 | 접근성 SkipLink (WCAG 2.1) |
| **프론트엔드 (Phase 15-16 Agent 연동)** | | | |
| `frontend/src/types/monitoring.ts` | ✅ | — | FleetAgent 타입 추가 |
| `frontend/src/lib/api-client.ts` | ✅ | — | fleetApi (listAgents/Jobs/Plugins, triggerCollect) |
| `frontend/src/hooks/use-fleet.ts` | ✅ | — | useFleet 훅 (실데이터 우선, demo fallback, 30초 폴링) |
| **AITOP Agent (Phase 15-16)** | | | |
| `agent/cmd/aitop-agent/main.go` | ✅ | ~464 | 에이전트 바이너리 엔트리포인트 |
| `agent/cmd/collection-server/main.go` | ✅ | — | Collection Server 엔트리포인트 |
| `agent/internal/config/config.go` | ✅ | — | YAML 설정 로딩 + 환경변수 오버라이드 |
| `agent/internal/core/registry.go` | ✅ | — | Collector Registry (등록/탐색/병렬 실행) |
| `agent/internal/collector/it/os/os_collector.go` | ✅ | — | OS Collector (CPU/MEM/Disk/Net/Process) |
| `agent/internal/collector/it/web/web_collector.go` | ✅ | — | WEB Collector (Nginx/Apache/SSL) |
| `agent/internal/collector/it/was/was_collector.go` | ✅ | — | WAS Collector (Tomcat/Spring Boot/JVM/GC) |
| `agent/internal/collector/it/db/db_collector.go` | ✅ | — | DB Collector (PostgreSQL/MySQL/Oracle) |
| `agent/internal/collector/ai/gpu/gpu_collector.go` | ✅ | — | AI-GPU Collector (nvidia-smi VRAM/온도/전력) |
| `agent/internal/collector/ai/llm/llm_collector.go` | ✅ | — | AI-LLM Collector (모델/Rate Limit/토큰/가드레일) |
| `agent/internal/collector/ai/vectordb/vectordb_collector.go` | ✅ | — | AI-VectorDB Collector (Qdrant/Milvus/Chroma) |
| `agent/internal/collector/ai/serving/serving_collector.go` | ✅ | — | AI-Serving Collector (vLLM/Ollama/Triton/TGI) |
| `agent/internal/collector/ai/otel/otel_collector.go` | ✅ | — | AI-OTel Collector (Prometheus 11개 메트릭) |
| `agent/internal/collector/ai/register.go` | ✅ | — | AI Collector 일괄 등록 (RegisterAll) |
| `agent/internal/collector/it/register.go` | ✅ | — | IT Collector 일괄 등록 |
| `agent/internal/scheduler/scheduler.go` | ✅ | — | cron 기반 수집 스케줄러 |
| `agent/internal/health/health.go` | ✅ | — | 에이전트 자체 헬스 모니터 |
| `agent/internal/privilege/checker.go` | ✅ | — | 권한 사전 검증 (read/exec/net/root/docker) |
| `agent/internal/sanitizer/sanitizer.go` | ✅ | — | PII/API Key 마스킹 |
| `agent/internal/buffer/buffer.go` | ✅ | — | SQLite 로컬 버퍼 (오프라인 지원) |
| `agent/internal/shell/pty_service.go` | ✅ | — | 원격 CLI PTY 서비스 |
| `agent/internal/statemachine/state.go` | ✅ | — | 에이전트 상태 머신 |
| `agent/internal/transport/grpc_client.go` | ✅ | — | gRPC + HTTPS 전송 |
| `agent/internal/updater/updater.go` | ✅ | — | OTA 업데이트 관리자 (Staged Rollout + 자동 롤백) |
| `agent/configs/agent.yaml` | ✅ | — | 에이전트 설정 파일 |
| `agent/go.mod` | ✅ | — | Go 1.25, minimal deps |
| **설계 문서 (Phase 16 이후 현행화)** | | | |
| `DOCS/AGENT_DESIGN.md` | ✅ | ~1,578 | AITOP Agent 상세 설계 (v1.1.0) |
| `DOCS/UI_DESIGN.md` | ✅ | ~1,551 | 통합 UI 설계 (v2.0.0 — 구현 완료 반영) |
| `DOCS/ARCHITECTURE.md` | ✅ | ~1,600+ | OTel + Agent 통합 아키텍처 (v2.0.0) |
| `DOCS/METRICS_DESIGN.md` | ✅ | ~1,550+ | 지표 정의 + Agent 메트릭 매핑 (v2.0.0) |
| `DOCS/SOLUTION_STRATEGY.md` | ✅ | ~400+ | **신규** — 완성도 평가 + 경쟁 분석 + 로드맵 |

---

## Phase 7: E2E 통합 검증 📋 🔧 수작업

> **⚠️ 이 단계부터는 실제 인프라 환경에서 수작업으로 진행해야 합니다.**
> **AI 자동 생성 대상이 아닙니다. 운영자가 직접 실행하고 결과를 검증하세요.**

### 7-1. 로컬 Docker 환경 통합 테스트 🔧 수작업

**목적**: 모든 컴포넌트가 연동되어 텔레메트리가 정상 수집되는지 확인

```bash
# Step 1: 전체 스택 기동
docker compose -f infra/docker/docker-compose.yaml up -d

# Step 2: 헬스체크 확인
curl -s http://localhost:13133/  # OTel Collector
curl -s http://localhost:9090/-/ready  # Prometheus
curl -s http://localhost:3200/ready  # Tempo
curl -s http://localhost:3100/ready  # Loki

# Step 3: 테스트 트레이스/메트릭 전송
# → TEST_GUIDE.md Level 2 참조

# Step 4: Grafana 대시보드 확인 (http://localhost:3000)
# → TEST_GUIDE.md Level 3 참조

# Step 5: Alert Rule 발화 테스트
# → TEST_GUIDE.md Level 4 참조
```

**완료 기준**:
- [ ] 6개 컨테이너 모두 healthy 상태
- [ ] Jaeger에서 테스트 트레이스 확인 (http://localhost:16686)
- [ ] Prometheus에서 `aiservice_` 접두사 지표 쿼리 가능
- [ ] Grafana 5개 대시보드 모두 데이터 표시
- [ ] 최소 1개 Alert Rule FIRING 확인 후 해소

### 7-2. 부하 테스트 및 샘플링 검증 🔧 수작업

**목적**: 실제 부하 상황에서 Tail Sampling 동작 및 비용 절감 효과 확인

```bash
# Step 1: Locust 부하 테스트 실행 (실제 AI 서비스 엔드포인트 필요)
pip install locust
locust -f scripts/load-test.py --headless -u 50 -r 5 -t 5m \
  --host http://localhost:8000 --html reports/load-test.html

# Step 2: 샘플링 비용 시뮬레이션
python scripts/benchmark-sampling.py --rps 500 --export-csv reports/sampling.csv

# Step 3: Context Propagation 단절 탐지
python scripts/validate-traces.py --tempo-url http://localhost:3200 --fail-on-broken
```

**완료 기준**:
- [ ] 4개 시나리오(Normal/Guardrail/LLM Overload/External API) 모두 실행
- [ ] Prometheus 전후 지표 비교 리포트 생성
- [ ] Tail Sampling 정책별 보존율 확인 (목표: ~19% 보존, 81% 절감)
- [ ] Context Propagation 단절 0건

### 7-3. Trace 연속성 종합 검증 🔧 수작업

**목적**: 전체 레이어(UI → Agent → LLM → VectorDB)를 관통하는 Trace ID 연속성 확인

```bash
# Tempo TraceQL로 단절 패턴 탐지
# 1) 부모 Span 없는 고아 Span 탐지
{ status = error } && { rootSpan = false } && { parent = "" }

# 2) Layer 전환 시 Trace ID 불연속 탐지
{ resource.service.name = "fastapi-gateway" } >> { resource.service.name = "langchain-agent" }

# 3) 가드레일 → LLM 구간 전파 확인
{ span.guardrail.action = "PASS" } >> { resource.service.name = "vllm-inference" }
```

**완료 기준**:
- [ ] 5개 레이어 간 Trace ID 연속성 확인
- [ ] Baggage(`user.tier`, `request.id`) 하위 서비스까지 전달 확인
- [ ] Grafana Trace↔Metric↔Log 3방향 상관관계 링크 동작 확인

---

## Phase 8: Kubernetes 배포 📋 🔧 수작업

> **⚠️ 실제 K8s 클러스터에서 수작업으로 진행합니다.**
> **스테이징 환경에서 충분히 검증한 후 프로덕션에 적용하세요.**

### 8-1. Helm Chart Dry-Run 검증 🔧 수작업

```bash
# Step 1: Helm 의존성 다운로드
cd helm/aiservice-monitoring
helm dependency update

# Step 2: 개발 환경 dry-run
helm install aimon . \
  -f values-dev.yaml \
  --namespace monitoring \
  --dry-run --debug 2>&1 | tee reports/helm-dryrun-dev.txt

# Step 3: 프로덕션 환경 dry-run
helm install aimon . \
  -f values-prod.yaml \
  --namespace monitoring \
  --dry-run --debug 2>&1 | tee reports/helm-dryrun-prod.txt

# Step 4: 템플릿 렌더링 결과 검토
helm template aimon . -f values-dev.yaml > reports/rendered-dev.yaml
helm template aimon . -f values-prod.yaml > reports/rendered-prod.yaml
```

**완료 기준**:
- [ ] dry-run 에러 0건
- [ ] 렌더링된 YAML의 리소스 이름/레이블/셀렉터 일관성 확인
- [ ] NOTES.txt 출력 내용 확인

### 8-2. 스테이징 환경 배포 🔧 수작업

```bash
# Step 1: 네임스페이스 + RBAC 생성 (Helm이 자동 생성하지만 수동 확인)
kubectl get ns monitoring ai-inference

# Step 2: 개발 환경 설치
helm install aimon helm/aiservice-monitoring \
  -f helm/aiservice-monitoring/values-dev.yaml \
  --namespace monitoring --create-namespace

# Step 3: Pod 상태 확인
kubectl get pods -n monitoring -w
kubectl get pods -n ai-inference -w

# Step 4: OTel Collector 로그 확인
kubectl logs -n monitoring -l app.kubernetes.io/component=otel-agent --tail=100
kubectl logs -n monitoring -l app.kubernetes.io/component=otel-gateway --tail=100

# Step 5: ServiceMonitor 동작 확인
kubectl get servicemonitor -n monitoring
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# → http://localhost:9090/targets 에서 모든 target UP 확인
```

**완료 기준**:
- [ ] 모든 Pod Running 상태 (CrashLoopBackOff 없음)
- [ ] OTel Agent DaemonSet 전 노드 배포 확인
- [ ] OTel Gateway 3 replicas + HPA 활성 확인
- [ ] Prometheus targets 전체 UP
- [ ] Grafana 대시보드 데이터 표시 확인

### 8-3. 프로덕션 배포 🔧 수작업

```bash
# Step 1: 프로덕션 시크릿 사전 생성
kubectl create secret generic thanos-s3 \
  --from-file=thanos.yaml=thanos-s3-config.yaml -n monitoring
kubectl create secret generic slack-webhook \
  --from-literal=url=https://hooks.slack.com/services/... -n monitoring
kubectl create secret generic pagerduty-key \
  --from-literal=key=... -n monitoring

# Step 2: 프로덕션 설치
helm install aimon helm/aiservice-monitoring \
  -f helm/aiservice-monitoring/values-prod.yaml \
  --namespace monitoring

# Step 3: Thanos Sidecar + S3 연동 확인
kubectl logs -n monitoring -l app=thanos-sidecar --tail=50

# Step 4: Alertmanager → Slack/PagerDuty 알림 도달 확인
# → 테스트 Alert 발화 후 Slack 채널 확인
```

**완료 기준**:
- [ ] Thanos Sidecar S3 업로드 정상
- [ ] Alertmanager → Slack 알림 도달 확인
- [ ] Alertmanager → PagerDuty 연동 확인 (선택)
- [ ] Grafana Ingress + TLS 접근 가능
- [ ] Tempo/Loki S3 백엔드 정상 동작

---

## Phase 9: SLO 튜닝 및 운영 안정화 📋 🔧 수작업

> **⚠️ 프로덕션 배포 후 1~2주간 운영 데이터를 기반으로 수작업 튜닝합니다.**

### 9-1. SLO 임계치 튜닝 🔧 수작업

**목적**: 실제 트래픽 패턴에 맞게 Alert 임계치 조정

| SLO 지표 | 초기 임계치 | 튜닝 방법 |
|----------|------------|-----------|
| TTFT P95 | < 2,000ms | Grafana LLM Performance 대시보드에서 실제 P95 확인 후 ±20% 조정 |
| TPS P50 | > 30 tok/s | 모델/하드웨어별 실측 후 모델별 차등 적용 |
| 가드레일 P99 | < 800ms | 정책 수/복잡도에 따라 개별 조정 |
| GPU VRAM | < 90% | 배치 사이즈·동시 요청 수와 상관 분석 후 조정 |
| 에러율 | < 0.5% | 서비스별 분리 (inference vs API vs DB) |

**작업 절차**:
1. 1주일 운영 후 Grafana에서 각 지표의 실제 분포 확인
2. P50/P95/P99 값을 기준으로 Alert 임계치 재설정
3. `infra/docker/prometheus-rules.yaml` 및 `helm/.../templates/prometheus-rules.yaml` 동시 수정
4. `for` 절 (지속 시간) 조정 — 잦은 flapping 방지

### 9-2. Tail Sampling 정책 최적화 🔧 수작업

**목적**: 실제 트레이스 패턴에 맞게 샘플링 비율 조정

```bash
# 현재 정책별 보존율 확인
python scripts/benchmark-sampling.py --rps $(실제RPS) --export-csv reports/sampling-prod.csv

# 조정 대상 파일
# - collector/config/otelcol-gateway.yaml → tail_sampling processor
# - helm/aiservice-monitoring/values.yaml → otelGateway.config
```

**튜닝 기준**:
- 에러 트레이스: 100% 보존 (변경 불가)
- 고레이턴시: P99 기준 동적 조정 (초기 5000ms → 실측 P99 × 1.5)
- 정상 트레이스: 비용 목표에 맞춰 1~5% 범위 조정
- 월 저장 비용 목표: ~$200/월 (1,000 RPS 기준)

### 9-3. 대시보드 커스터마이징 🔧 수작업

**목적**: 팀 운영 패턴에 맞게 Grafana 대시보드 커스터마이징

- [ ] 팀별 필터 변수 추가 (service.name, team, environment)
- [ ] 비즈니스 KPI 패널 추가 (일일 요청 수, 사용자 수, 토큰 사용량)
- [ ] On-Call 알림 채널 대시보드 링크 연결
- [ ] 대시보드 JSON 변경 시 `dashboards/grafana/*.json` 및 Helm ConfigMap 동기화

---

## 작업 로드맵 (2026-03-22 기준)

### Phase 7-9 재평가

> Phase 10-14에서 UI가 Grafana → Next.js로 완전 교체됨에 따라 Phase 7-9의 범위 재정의 필요.
> Phase 15-16에서 Agent GA 완료 → Phase 17(UI 통합 테스트)이 다음 단계.

| Phase | 원래 범위 | 변경 사유 | 현재 판단 |
|-------|----------|----------|----------|
| **7** (E2E 검증) | Grafana 대시보드 + Jaeger + Prometheus 검증 | Grafana → Next.js UI 교체, Agent 추가 | **Phase 17로 통합** — 새 UI + Agent 실데이터 기준 E2E |
| **8** (K8s 배포) | Helm으로 모니터링 스택 배포 | Next.js + Collection Server Helm 추가 필요 | **Phase 17 이후 진행** — Backend API 완성 후 통합 배포 |
| **9** (SLO 튜닝) | 운영 데이터 기반 임계치 조정 | 프로덕션 배포 전에는 불가 | **Phase 8 이후에만 가능** |

### 확정 로드맵

```
── 완료 ──────────────────────────────────────────────────────────
Phase 1~6:   OTel 인프라 + SDK + 대시보드 + Helm + CI/CD    ✅
Phase 10~14: 상용 솔루션 UI (26개 화면)                       ✅
Phase 15~16: AITOP Agent (IT/AI Collector + Fleet + CLI)     ✅

── 다음 단계 ─────────────────────────────────────────────────────
Phase 17: UI 통합 테스트        📋  ← Backend API + 에이전트 실데이터 연동
  17-1. Backend REST API 서버 구현
  17-2. 인프라/AI 뷰 실데이터 검증
  17-3. 에이전트 관리/진단 뷰 검증
  17-4. E2E 테스트 자동화 + 성능 검증

── 이후 (프로덕션 준비) ──────────────────────────────────────────
Phase 18: 통합 배포            📋 🔧  ← Next.js + Collection Server + Helm 통합
Phase 19: SLO 튜닝            📋 🔧  ← 프로덕션 운영 데이터 필요
Phase 20: 고도화 (LLM 평가, 이상 탐지, 프롬프트 관리 등)     📋
```

> **상세 방향성**: [DOCS/SOLUTION_STRATEGY.md](DOCS/SOLUTION_STRATEGY.md) — 경쟁 분석, 완성도 평가, 상용화 로드맵

---

## Git 히스토리

| 커밋 해시 | 메시지 | 포함 파일 수 |
|-----------|--------|------------|
| `2aa54f4` | feat: initialize AI service monitoring project structure | 24 |
| `54bd888` | feat: add OTel architecture, collector configs, infra, and SDK instrumentation | 18 |
| `3832418` | docs: add WORK_STATUS.md — project progress tracker and TODO master | 1 |
| `50e5ba1` | feat: complete SDK instrumentation, K8s manifests, Grafana dashboards, and scripts | 19 |
| (Session 4) | feat: add load-test.py and Helm chart (Chart.yaml + values.yaml) | 3 |
| `d6d690a` | feat: complete Phase 6 — Helm templates, CI/CD workflows, and pipeline docs | — |
| `1bdd8e8` | docs: add TEST_GUIDE.md, enhance DOCS technical accuracy, add Phase 7-9 manual roadmap | — |
| (Session 6) | feat: add XLog dashboard, RAG demo, docs enhancement, and critical bug fixes | ~50 |
| `84ff7ff` | docs: add XLog/HeatMap unified dashboard redesign document | 1 |
| `a683011` | feat: add unified monitoring UI (Phase 10-1~3) — Next.js frontend, design system, auth | ~40 |
| `e3f3758` | docs: add demo account info to UI_DESIGN.md and frontend/README.md | 2 |
| `7c1f911` | feat: complete Phase 10-4 (project management) and 10-5 (infrastructure view) | ~15 |
| `0d64236` | feat: add service topology map (Phase 11-1) — D3.js force-directed graph | ~5 |
| `46f3b97` | feat: add service detail dashboard (Phase 11-2) — golden signals, endpoints, XLog, dependencies, deployments | 3 |
| `3be9428` | feat: add XLog/HeatMap unified dashboard (Phase 11-3) — scatter plot, heatmap, transaction list, waterfall | 4 |
| `335f931` | feat: add trace detail with waterfall timeline (Phase 11-4) — distributed tracing, span tree, attributes | 5 |
| `27d839e` | feat: add log explorer with search, patterns, and trace linking (Phase 11-5) | 3 |
| `58e3f05` | feat: add metrics explorer with query builder and catalog (Phase 11-6) — PromQL editor, 23 metrics | 3 |
| `0a84199` | docs: update roadmap — Phase 7-9 deferred, Phase 12 next priority | 1 |
| `5762668` | feat: add AI native dashboard (Phase 12) — AI overview, LLM performance, GPU cluster, RAG pipeline, guardrail | 5 |
| `bb21a26` | feat: add agent fleet, diagnostics, alerts & incidents (Phase 13) — 86-item diagnostics, incident timeline, RCA | 5 |
| `3de4cc8` | docs: update WORK_STATUS.md — Phase 12-13 complete, Session 12-13 records | 1 |
| `5a333ac` | feat: add SLO management, cost analysis, and executive dashboard (Phase 14) — error budget, cost donut, compliance gauge | 5 |
| `e6145c5` | docs: update WORK_STATUS.md — Phase 14 core complete | 1 |
| `8b7a112` | feat: add custom dashboard builder with drag & drop (Phase 14-1) — widget grid, templates, export | 3 |
| `6933a67` | feat: add investigation notebooks (Phase 14-4) — markdown/query/chart cells, sample notebooks | 3 |
| `486ee7a` | feat: add multi-tenant management (Phase 14-6) — tenant list, usage/billing, white-label | 3 |
| `5ef693f` | feat: add i18n system with ko/en/ja (Phase 14-7) — translation dictionary, sidebar/topbar i18n | 5 |
| `367f0e8` | feat: add performance optimization and accessibility (Phase 14-8) — ECharts memo, VirtualList, Web Vitals, SkipLink | 7 |
| (Session 16) | docs: add AGENT_DESIGN.md — AITOP Agent detailed design | ~2 |
| (Session 17) | feat: implement AI Collectors — GPU, LLM, VectorDB, Serving, OTel | ~15 |
| (Session 18) | feat: add Fleet UI live data binding — useFleet hook, api-client, FleetAgent type | ~5 |
| `ab2748f` | feat: implement IT Collectors, Remote CLI, OTA Updater — Phase 16 (Session 19) | ~30 |
| `3959f66` | feat: implement Fleet 관리 콘솔 완성 — Phase 16-4-4 (Session 19) | ~10 |
| `acba2f0` | docs: update WORK_STATUS.md — Phase 16 Agent GA 100% (Session 19) | 1 |
| (Session 20) | docs: update all DOCS, create SOLUTION_STRATEGY.md — 전체 현행화 | ~10 |

---

## 주요 설계 결정 사항 (ADR — Architecture Decision Records)

### ADR-001: Dual Collector 패턴 채택
- **결정**: Agent(DaemonSet) + Gateway(Deployment) 이중 구조
- **이유**: 수집 부하와 Tail Sampling 연산 부하를 격리. Agent는 경량(CPU: 100m), Gateway는 고메모리(4Gi) 운영
- **대안**: 단일 Collector — Tail Sampling 상태 공유 문제로 기각

### ADR-002: Tail-based Sampling 우선 채택
- **결정**: Head-based 5% + Tail-based 정책 조합
- **이유**: Head-based만으로는 에러/고레이턴시 트레이스를 사전에 식별 불가
- **비용 효과**: ~81% 저장 비용 절감

### ADR-003: W3C TraceContext + Baggage 전파 표준
- **결정**: B3 전파 대신 W3C TraceContext 표준 채택
- **이유**: OpenTelemetry 기본 표준, 벤더 중립적, 브라우저 Fetch API 기본 지원
- **Baggage 활용**: `user.tier`, `request.id`를 모든 하위 서비스까지 자동 전달

### ADR-004: vLLM TTFT 스트리밍 포착 방식
- **결정**: 비동기 제너레이터 래퍼 패턴 (`instrument_vllm_generate`)
- **이유**: vLLM의 `engine.generate()`는 비동기 스트리밍 — 동기 래퍼로는 첫 청크 시각 포착 불가
- **주의**: `time.perf_counter()` 사용 (monotonic clock, NTP 보정 영향 없음)

### ADR-005: GPU 메트릭 수집 방식
- **결정**: DCGM Exporter → Prometheus → OTel Collector 브릿지 방식
- **이유**: DCGM은 NVIDIA 공식 지원 도구. OTel GPU Semantic Convention은 아직 실험적(experimental) 상태
- **향후**: OTel GPU Semantic Convention 안정화 시 직접 OTLP 수출로 전환 검토

---

---

## Session 7 완료 내역 ✅

> **날짜**: 2026-03-19 (7회차)
> **주제**: UI 대대적 재설계 방향 수립 + AITOP 에이전트 연동 설계

### 배경

AITOP 차세대 방향성 문서(`AITOP_구현_차세대_방향성.MD`)를 참조하여, 에이전트 기반 수집 구조와 통합 모니터링 UI의 대대적 재설계 방향을 수립했다. 주요 동기:

1. **UI 분산 문제**: Grafana 5개 + XLog + Jaeger + Prometheus가 별도 URL로 분산
2. **프로젝트 중심 구조 필요**: 고객/환경별 프로젝트로 리소스(서버, 미들웨어, AI 시스템) 조직화
3. **AITOP 에이전트 연동**: 에이전트 수집 데이터(86개 진단 항목) + OTel 실시간 데이터 통합
4. **상용 솔루션 수준**: Datadog, New Relic, Dynatrace 참조하여 판매 가능한 품질로 설계

### 완료된 작업

#### 신규 설계 문서
- [x] **`DOCS/UI_DESIGN.md`** (신규, ~1,200줄) — 통합 모니터링 대시보드 UI 설계서
  - 경쟁 APM 벤치마크 분석 (Datadog, New Relic, Dynatrace, Grafana)
  - 정보 구조 (Information Architecture) 전체 트리 설계
  - 글로벌 네비게이션 (2단 사이드바, Command Palette, 프로젝트 선택)
  - 프로젝트 기반 대시보드 (프로젝트 목록, 생성, Overview)
  - 인프라 뷰 (호스트 목록, 헥사곤 맵, 호스트 상세)
  - 서비스 뷰 (서비스 맵 토폴로지, 골든 시그널, XLog, 엔드포인트)
  - 트레이스 상세 (워터폴 타임라인 + 스팬 속성)
  - AI 서비스 전용 뷰 (LLM 성능, GPU 클러스터, RAG 파이프라인, Agent 실행)
  - AITOP Agent Fleet Console (에이전트 관리, 플러그인, 수집 작업)
  - 에이전트 ↔ 모니터링 통합 뷰 (실시간 + 진단 교차 분석)
  - 알림 및 인시던트 관리 (Alert Policy, 인시던트 타임라인, RCA)
  - 데이터 흐름 및 실시간 아키텍처 (WebSocket, 갱신 전략)
  - 디자인 시스템 (컬러 팔레트, 타이포그래피, 컴포넌트 라이브러리)
  - 반응형 및 접근성 (WCAG 2.1 AA)
  - 기술 스택 (Next.js 14+, TypeScript, Zustand, ECharts, D3.js)
  - 구현 로드맵 (Phase 10~14 상세)
  - 부록: 데이터 모델 TypeScript 인터페이스, User Flow

#### 기존 문서 업데이트
- [x] **`DOCS/ARCHITECTURE.md`** — 관련 문서 링크에 UI_DESIGN.md, XLOG_DASHBOARD_REDESIGN.md, AITOP 외부 참조 추가
- [x] **`DOCS/METRICS_DESIGN.md`** — 관련 문서 링크에 UI_DESIGN.md, AITOP 메트릭 매핑 외부 참조 추가
- [x] **`README.md`** — 프로젝트 구조에 DOCS/ 전체 파일 목록 반영 (UI_DESIGN.md 포함)
- [x] **`WORK_STATUS.md`** — Phase 10~14 추가, Session 7 기록

---

## Session 8 완료 내역 ✅

> **날짜**: 2026-03-19 (8회차)
> **커밋**: `a683011` — Phase 10-1~3 (Next.js 프론트엔드, 디자인 시스템, 인증)

### 완료된 작업

#### Phase 10-1: Next.js 프로젝트 + 디자인 시스템
- [x] **`frontend/`** — Next.js 16 App Router + TypeScript + Tailwind CSS
- [x] **디자인 시스템** — CSS Variables 다크 테마, 컬러 팔레트, 타이포그래피
- [x] **UI 컴포넌트**: Button, Badge, Card, Input/SearchInput/Select, Tooltip, Modal, Dropdown, Breadcrumb, Tabs
- [x] **차트 컴포넌트**: EChartsWrapper (scatter/heatmap/line/bar/gauge/pie), TimeSeriesChart, SparkLine
- [x] **모니터링 컴포넌트**: KPICard, StatusIndicator/SeverityIcon, ServiceHealthGrid, GPUCard, AlertBanner

#### Phase 10-2: 글로벌 네비게이션
- [x] **Sidebar** — 2단 사이드바 (접기/펼치기, 메뉴 항목 아이콘+텍스트)
- [x] **Topbar** — 프로젝트 선택, 시간 범위, 알림 벨, 사용자 메뉴
- [x] **Command Palette** (Ctrl+K) — 통합 검색
- [x] **Status Bar** — 하단 상태 표시줄

#### Phase 10-3: 인증/인가
- [x] **AuthGuard** — 역할 기반 접근 제어 (Admin/Operator/Viewer/AI-Engineer)
- [x] **로그인 페이지** — 데모 계정 원클릭 로그인
- [x] **Zustand stores** — auth-store, project-store, ui-store

---

## Session 9 완료 내역 ✅

> **날짜**: 2026-03-19 (9회차)
> **커밋**: `7c1f911` — Phase 10-4 (프로젝트 관리) + 10-5 (인프라 뷰)

### 완료된 작업

#### Phase 10-4: 프로젝트 관리
- [x] **프로젝트 목록 페이지** (`/projects`) — 환경별 필터, KPI 카드, 정렬
- [x] **프로젝트 상세** (`/projects/[id]`) — 호스트/서비스/AI서비스/알림 탭, 시계열 차트
- [x] **프로젝트 생성** (`/projects/new`) — 폼 (이름, 설명, 환경, 태그)

#### Phase 10-5: 인프라 뷰
- [x] **인프라 목록** (`/infra`) — 호스트 테이블 + HexagonMap (헥사곤 그리드)
- [x] **호스트 상세** (`/infra/[hostname]`) — CPU/MEM/Disk/Network 차트, GPU 카드, 미들웨어 테이블, 프로세스 탭, 로그 탭, AITOP Agent 정보
- [x] **Mock 데이터** — `demo-data.ts` (프로젝트 4개, 호스트 6개, 서비스 4개, AI서비스 3개, 알림 3개)

---

## Session 10 완료 내역 ✅

> **날짜**: 2026-03-20 (10회차)
> **커밋**: `0d64236` — Phase 11-1 (서비스 토폴로지 맵)

### 완료된 작업

#### Phase 11-1: 서비스 목록 + 서비스 맵
- [x] **서비스 목록 페이지** (`/services`) — 리스트 뷰 (정렬, 필터) + 서비스 맵 뷰 전환
- [x] **ServiceMap 컴포넌트** — D3.js force-directed 토폴로지 그래프 (5 레이어, 10노드, 10엣지)
- [x] **TopologyNode/Edge 타입** + LAYER_CONFIG
- [x] **노드 클릭 → 서비스 상세 네비게이션**

---

## Session 11 완료 내역 ✅

> **날짜**: 2026-03-20 (11회차)
> **커밋**: `46f3b97` ~ `58e3f05` — Phase 11-2~6 (APM 코어 전체)

### 완료된 작업

#### Phase 11-2: 서비스 상세 대시보드
- [x] **`/services/[id]`** — 7탭 서비스 대시보드
  - Overview: 골든 시그널 4 KPI, 시계열 3종 (Latency/Traffic/Error), XLog scatter, Endpoint Top 10
  - Endpoints: 전체 엔드포인트 정렬 테이블 (P50/P95/P99, RPM, Error%, Contribution)
  - Dependencies: 2-column upstream/downstream 테이블
  - Deployments: 타임라인 스타일 배포 이력
- [x] **타입**: Endpoint, DeploymentEvent, ServiceDependency
- [x] **Mock 데이터**: getServiceEndpoints, getServiceDeployments, getServiceDependencies, generateXLogScatterData

#### Phase 11-3: XLog + HeatMap 통합 대시보드
- [x] **`/traces`** — XLog/HeatMap 통합 대시보드 (완전 재작성)
  - XLog 모드: 4색 scatter (Normal/Slow/Very Slow/Error) + 임계선 (1s/3s) + brush 선택
  - HeatMap 모드: 밀도 히트맵 + 셀 클릭 → 트랜잭션 필터
  - Transaction List: 선택된 트랜잭션 테이블 (endpoint, elapsed, TTFT, TPS, guardrail)
  - Waterfall Detail: 스팬 바 타임라인 + 색상 코딩 + 속성 표시
- [x] **타입**: Transaction, TransactionSpan, TransactionStatus
- [x] **Mock 데이터**: generateTransactions, generateHeatMapData

#### Phase 11-4: 트레이스 탐색 + 워터폴 타임라인
- [x] **`/traces/[traceId]`** — 트레이스 상세 페이지 (신규)
  - 서비스별 색상 코딩 워터폴 타임라인
  - 스팬 트리 접기/펼치기 + duration 컬럼
  - 스팬 클릭 → attributes 그리드 + events 타임라인 + 서비스 링크
- [x] **서비스 상세 Traces 탭** — placeholder → 실제 트레이스 테이블 (링크 포함)
- [x] **타입**: Trace, TraceSpan
- [x] **Mock 데이터**: generateTrace (5서비스 12스팬), getRecentTraces

#### Phase 11-5: 로그 탐색 + 트레이스 연결
- [x] **`/logs`** — 로그 탐색기 (완전 재작성)
  - Log Stream 뷰: 전문 검색, 서비스/레벨 필터, Log Volume 차트 (stacked bar)
  - 클릭 확장 가능 엔트리: hostname 링크, Trace ID → 트레이스 상세 링크, span ID, attributes
  - ERROR/FATAL 행 배경 하이라이트
  - Patterns 뷰: 메시지 유사도 기반 자동 그룹화 (8개 패턴, 빈도, first/last seen)
- [x] **타입**: LogEntry, LogLevel, LogPattern
- [x] **Mock 데이터**: generateLogEntries (13개 서비스별 메시지 템플릿), getLogPatterns

#### Phase 11-6: 메트릭 탐색기 (쿼리 빌더)
- [x] **`/metrics`** — 메트릭 탐색기 (완전 재작성)
  - Explore 뷰: 다중 쿼리 패널, PromQL 에디터, 차트 타입 전환 (Line/Area/Bar), Quick Add
  - Catalog 뷰: 23개 메트릭 카탈로그 (System 5, HTTP 4, LLM 6, VectorDB 3, GPU 5)
  - 카테고리 필터 + 검색 + 클릭 확장 (labels, unit, mini preview 차트)
- [x] **타입**: MetricDefinition, MetricType
- [x] **Mock 데이터**: METRIC_CATALOG (23개), executeMetricQuery

---

## Session 12 완료 내역 ✅

> **날짜**: 2026-03-20 (12회차)
> **커밋**: `5762668` — Phase 12 (AI 네이티브 UI)

### 완료된 작업

#### Phase 12-1: AI 서비스 개요 (`/ai` 완전 재작성)
- [x] Executive KPI 5종 (TTFT P95, TPS P50, GPU Avg, Token Cost, Block Rate) + SLO 표시
- [x] AI 서비스 테이블 (Type badge, Model, TTFT, TPS, Cost, GPU, Block Rate, Status, 서비스 상세 링크)
- [x] `getProjectAIServices()` 연동, 검색/필터 (Type, Status)

#### Phase 12-2: LLM 성능 대시보드 (`/ai/[id]` 신규)
- [x] 탭 구조: Overview | LLM Performance | RAG Pipeline (type=rag) | Guardrail | GPU
- [x] **Overview 탭**: KPI 4종 + TTFT/TPS 추이 차트
- [x] **LLM 탭**: TTFT 히스토그램 (P50/P95 마커), TPS 추이, 토큰 사용량/비용, 동시 요청수 (4 chart grid)

#### Phase 12-3: GPU 클러스터 뷰 (`/ai/gpu` 신규)
- [x] KPI 5종 (Total GPUs, Avg VRAM, Temp, Power, Critical)
- [x] OOM Risk 경고 배너 (VRAM >= 90%)
- [x] 호스트별 GPU 그리드 (GPUCard 재사용)
- [x] 4종 추이 차트 (VRAM, Temperature, Power, SM Occupancy)

#### Phase 12-4: RAG 파이프라인 뷰 (RAG 탭)
- [x] 파이프라인 흐름 바 (6단계 비율 시각화 — LLM 76% 강조)
- [x] 검색 품질 게이지 (Relevancy, Top-K Hit Rate, Faithfulness, Answer Relevancy)
- [x] 임베딩 성능 (model, dimensions, P95, throughput, cache hit rate)
- [x] VectorDB 상태 (Qdrant — 125K vectors, search P99, availability)

#### Phase 12-6: 가드레일 분석 뷰 (Guardrail 탭)
- [x] KPI 4종 (Total Checks, Blocked, Block Rate, Latency Contribution)
- [x] Block Rate 추이 차트 + 위반 유형 수평 바 차트
- [x] Guardrail Latency 추이 (Input/Output Check)

#### 타입 및 Mock 데이터
- [x] RAGPipelineStage, RAGPipelineData, AgentExecution, GuardrailData
- [x] getTTFTHistogram, getRAGPipelineData, getAgentExecutions, getGuardrailData

---

## Session 13 완료 내역 ✅

> **날짜**: 2026-03-20 (13회차)
> **커밋**: `bb21a26` — Phase 13 (에이전트 통합 + 알림)

### 완료된 작업

#### Phase 13-1/2: Agent Fleet Console (`/agents` 완전 재작성)
- [x] 3탭: Agent List | Collection Jobs | Plugins
- [x] **Agent List**: 호스트 링크, 버전 (update 경고), status, mode, plugins, heartbeat/collection
- [x] **Collection Jobs**: 진행률 바, type badge (scheduled/AI diagnostic/emergency), status
- [x] **Plugins**: 6개 플러그인 (IT-OS, IT-MW, AI-GPU, AI-LLM, AI-VectorDB, Diagnostic)

#### Phase 13-3: AITOP Diagnostics (`/diagnostics` 완전 재작성)
- [x] KPI 4종 (IT Items 55, AI Items 31, Last Scan, Pass Rate)
- [x] 진단 실행 이력 테이블 (클릭 선택)
- [x] 진단 항목 16개: 카테고리별 그룹화 (OS, MW, GPU, LLM, VectorDB, Guardrail)
- [x] pass/warn/fail 아이콘 + value/threshold + 클릭 확장 recommendation

#### Phase 13-4: Alert Policy 관리 (`/alerts` Policies 탭)
- [x] 8개 알림 정책 (conditionType: metric/trace/log, thresholdType: static/dynamic/forecast)
- [x] severity, target, channels, enabled, lastTriggered 표시

#### Phase 13-5: 인시던트 관리 (`/alerts` Incidents 탭)
- [x] 좌측 목록 + 우측 상세 레이아웃
- [x] 인시던트 타임라인 (icon + message + actor + timestamp)
- [x] RCA (Root Cause Analysis) 섹션
- [x] 액션 버튼 (Acknowledge / Resolve / Escalate)
- [x] 3개 인시던트 (GPU VRAM Critical, TTFT degradation, Error Rate Spike)

#### Phase 13-6: 알림 채널 설정 (`/alerts` Channels 탭)
- [x] 5개 채널 (slack-alerts, slack-infra, email-oncall, pagerduty, webhook-ci)
- [x] type icon, config, enabled status

#### 타입 및 Mock 데이터
- [x] CollectionJob, AgentPlugin, DiagnosticRun, DiagnosticItem
- [x] AlertPolicy, IncidentEvent, IncidentDetail, NotificationChannel
- [x] 7개 mock 함수: getCollectionJobs, getAgentPlugins, getDiagnosticRuns, getDiagnosticItems, getAlertPolicies, getIncidents, getNotificationChannels

---

## Session 14 완료 내역 ✅

> **날짜**: 2026-03-20 (14회차)
> **커밋**: `5a333ac` — Phase 14 코어 (SLO + Cost + Executive)

### 완료된 작업

#### Phase 14-2: SLO 관리 대시보드 (`/slo` 신규)
- [x] KPI 4종 (Total SLOs, Avg Compliance, At Risk, Breached)
- [x] SLO 카드: target vs current, burn rate (배수 표시), error budget 진행 바
- [x] 미니 추이 차트 (compliance trend per SLO)
- [x] 상태별 색상 코딩 (met/at_risk/breached)
- [x] 6개 SLO (API Availability, API Latency, RAG TTFT, RAG Error, Embedding, GPU VRAM)

#### Phase 14-3: 비용 분석 뷰 (`/costs` 신규)
- [x] KPI 4종 (Total Cost, Monthly Estimate, LLM API, GPU Compute)
- [x] Cost Distribution 도넛 차트 (5 카테고리)
- [x] Daily Cost Trend 시계열 (카테고리별 stacked area)
- [x] 카테고리별 상세 목록 (13개 항목 — subcategory, amount, trend %)

#### Phase 14-5: Executive 대시보드 (`/executive` 신규)
- [x] Top KPI 6종 (Health, Services, SLO Compliance, Incidents, MTTR, Cost)
- [x] SLO Compliance 게이지 차트 + SLO 요약 목록
- [x] Cost Breakdown 도넛 + total/monthly
- [x] Top Issues 카드 (severity + age)
- [x] Service Health / Cost Trend 차트
- [x] Quick Links (Services, AI, SLO, Costs)

#### 타입 및 Mock 데이터
- [x] SLODefinition, CostBreakdown, ExecutiveSummary
- [x] getSLODefinitions (6개), getCostBreakdowns (13개), getExecutiveSummary

---

## Session 15 완료 내역 ✅

> **날짜**: 2026-03-20 (15회차)
> **커밋**: `8b7a112` ~ `367f0e8` — Phase 14 잔여 전체 (14-1, 14-4, 14-6, 14-7, 14-8)

### 완료된 작업

#### Phase 14-1: 커스텀 대시보드 빌더 (`/dashboards` 신규)
- [x] 4-column 위젯 그리드 + HTML5 Drag & Drop (순서 변경)
- [x] 6개 위젯 타입: KPI, Time Series, Bar, Pie, Table, Text
- [x] 위젯 설정 패널: 제목, 타입, 크기(1x1/2x1/1x2/2x2), 메트릭 선택(23개), 텍스트 편집
- [x] 3개 대시보드 템플릿 (AI Service, Infrastructure, Executive)
- [x] Export JSON 다운로드

#### Phase 14-4: Investigation Notebook (`/notebooks` 신규)
- [x] 노트북 목록 (제목, 작성자, 관련 인시던트, 태그, 셀 수)
- [x] 3종 셀 타입: Markdown (렌더링+편집), Query (메트릭 선택→결과 테이블), Chart (인라인 차트)
- [x] 셀 조작: 추가, 삭제, 위/아래 이동, 편집 토글
- [x] 3개 샘플 노트북 (GPU VRAM RCA, RAG TTFT 분석, 주간 비용 리뷰)

#### Phase 14-6: 멀티테넌트 관리 (`/tenants` 신규)
- [x] 6개 테넌트 (enterprise/pro/free, active/trial/suspended)
- [x] KPI 5종 + Revenue by Plan 도넛 차트
- [x] 테넌트 카드: plan badge, usage/limit 바, projects/users/hosts
- [x] 테넌트 상세 패널: White-label (brand color, portal URL), retention, 액션 버튼

#### Phase 14-7: 국제화 i18n
- [x] `lib/i18n.ts` — 번역 사전 (~70키 × 3 로케일: ko/en/ja)
- [x] `hooks/use-i18n.ts` — `useI18n()` hook (t, formatDate, formatNumber, formatRelativeTime)
- [x] `stores/ui-store.ts` — locale state 추가 (기본: ko)
- [x] Sidebar 네비게이션 12개 메뉴 i18n 적용
- [x] Topbar 언어 전환 드롭다운 (🇰🇷/🇺🇸/🇯🇵)

#### Phase 14-8: 성능 최적화 + 접근성
- [x] EChartsWrapper: `React.memo()` + `setOption` 재사용 (재생성 방지)
- [x] VirtualList 컴포넌트 (100K+ 행 가상 스크롤, ARIA role)
- [x] Web Vitals 모니터링 (LCP, FCP, CLS — PerformanceObserver)
- [x] SkipLink ("Skip to main content" — WCAG 2.1 AA)
- [x] ARIA: `role="main"`, `aria-label`, `role="img"` (차트)
- [x] Next.js config: compress, 보안 헤더 (X-Frame-Options 등), 정적 캐시 1년

---

## Phase 10: UI 기반 구축 ✅ (완료)

> **참조**: `DOCS/UI_DESIGN.md` Section 13-14
> **목표**: Next.js 기반 프론트엔드 프로젝트 초기화 및 핵심 인프라 구축

### 10-1. Next.js 프로젝트 초기화 + 디자인 시스템

| 항목 | 상세 |
|------|------|
| Next.js 14+ App Router 프로젝트 생성 | `frontend/` 디렉터리, TypeScript, ESLint, Prettier |
| Tailwind CSS + CSS Variables 테마 설정 | 다크/라이트 모드, UI_DESIGN.md 컬러 팔레트 적용 |
| 기본 컴포넌트 라이브러리 구축 | Button, Input, Badge, Card, Table, Modal, Toast, Tooltip |
| 차트 컴포넌트 기반 | ECharts wrapper, Canvas 유틸리티, SparkLine |
| 모니터링 전용 컴포넌트 | KPICard, ServiceHealthGrid, AlertBanner, StatusBadge |
| Storybook 설정 | 컴포넌트 카탈로그 + 시각적 테스트 |

### 10-2. 글로벌 네비게이션

| 항목 | 상세 |
|------|------|
| 좌측 2단 사이드바 | 접기/펼치기, 메뉴 항목 아이콘+텍스트, 호버 플라이아웃 |
| 상단 바 | 로고, 프로젝트 선택 드롭다운, 알림 벨, 사용자 메뉴 |
| Command Palette (Ctrl+K) | 통합 검색 (서비스, 호스트, 메트릭, 트레이스), 빠른 명령 |
| 하단 상태바 | 연결 상태, 데이터 지연, 마지막 갱신, 타임존 |
| 브레드크럼 + 탭 네비게이션 | 계층 경로 표시, 탭 전환 |

### 10-3. 인증 / 인가

| 항목 | 상세 |
|------|------|
| 로그인 / 로그아웃 | JWT 기반 인증, Refresh Token |
| 역할 기반 접근 제어 (RBAC) | Admin, SRE, AI Engineer, Viewer 역할 |
| 라우트 가드 | 인증 필요 페이지 자동 리다이렉트 |
| 조직 + 사용자 관리 UI | 기본 CRUD |

### 10-4. 프로젝트 관리

| 항목 | 상세 |
|------|------|
| 프로젝트 목록 | 카드 뷰 (상태, KPI, 최근 활동), 검색/필터/정렬 |
| 프로젝트 생성 위자드 | 기본 정보 → 리소스 등록 → 알림 설정 → 에이전트 연결 |
| 프로젝트 대시보드 (Overview) | KPI 카드, 서비스 헬스맵, 응답시간 추이, 최근 인시던트 |
| 프로젝트 설정 | 태그, 환경, 멤버, 데이터 보존, API 키 |

### 10-5. 인프라 뷰 기본

| 항목 | 상세 |
|------|------|
| 호스트 그룹 관리 | 그룹 CRUD, 호스트 배정 |
| 호스트 목록 | 테이블 뷰 (CPU/MEM/DISK/NET), 헥사곤 맵 뷰 |
| 호스트 상세 | OS 메트릭, 프로세스 목록, 미들웨어 상태, GPU 정보 |
| 에이전트 상태 표시 | 호스트별 에이전트 버전, 상태, 마지막 수집 |

---

## Phase 11: APM 코어 UI ✅ (완료)

> **참조**: `DOCS/UI_DESIGN.md` Section 6, `DOCS/XLOG_DASHBOARD_REDESIGN.md`
> **목표**: 서비스 중심 APM 기능 구현

### 11-1. 서비스 맵 (토폴로지) ✅

- [x] D3.js force-directed 서비스 토폴로지 그래프 (5 레이어, 10노드, 10엣지)
- [x] 노드: 서비스 (크기=처리량, 색상=건강도)
- [x] 엣지: 호출 관계 (두께=호출량, 색상=에러율)
- [x] 5-Layer 필터 (UI/Agent/LLM/Data/Infra)
- [x] 노드 클릭 → 서비스 상세 네비게이션

### 11-2. 서비스 상세 ✅

- [x] 골든 시그널 (Latency, Traffic, Errors, Saturation) KPI 카드 + sparkline
- [x] 시계열 3종 (Latency P50/P95/P99, Traffic RPM, Error Rate)
- [x] XLog 산점도 (Normal/Error 색상)
- [x] 엔드포인트 목록 (URL별 RPM, P50/P95/P99, 에러율, 기여도 바)
- [x] 의존관계 탭 (업스트림/다운스트림 2-column 테이블, 서비스 링크)
- [x] 배포 탭 (타임라인 스타일 — version badge, status icon, deployer, commit)
- [x] Traces 탭 (최근 트레이스 테이블, 트레이스 상세 링크)

### 11-3. XLog + HeatMap 통합 ✅

- [x] XLog 모드: ECharts scatter (4색 상태), 임계선 (1s/3s), brush 선택
- [x] HeatMap 모드: 밀도 히트맵 (7 latency 버킷 × 30 시간 버킷), 셀 클릭 필터
- [x] Transaction List: 선택 결과 테이블 (endpoint, elapsed, TTFT, TPS, guardrail, trace ID)
- [x] Waterfall Detail: 스팬 타임라인 + 색상 코딩 + 속성 표시
- [x] 서비스/상태 필터, XLOG_DASHBOARD_REDESIGN.md 사양 구현

### 11-4. 트레이스 탐색 + 워터폴 ✅

- [x] 트레이스 상세 페이지 (`/traces/[traceId]`) — 5서비스 12스팬 분산 트레이스
- [x] 워터폴 타임라인 (서비스별 색상, 스팬 트리 접기/펼치기, duration 컬럼)
- [x] 스팬 상세 (속성 그리드, 이벤트 타임라인, 관련 서비스 링크)
- [x] XLog 트랜잭션 → 트레이스 상세 링크
- [x] 서비스 상세 Traces 탭 → 최근 트레이스 테이블

### 11-5. 로그 탐색 ✅

- [x] 로그 전문 검색 + 서비스/레벨 필터 (DEBUG/INFO/WARN/ERROR/FATAL)
- [x] Log Volume 차트 (ECharts stacked bar — Info/Warn/Error)
- [x] 클릭 확장 가능 엔트리 (hostname 링크, Trace ID → 트레이스 링크, attributes)
- [x] 로그 패턴 자동 그룹화 (8개 패턴, 빈도, first/last seen)
- [x] ERROR/FATAL 행 배경 하이라이트

### 11-6. 메트릭 탐색기 ✅

- [x] Explore 뷰: 다중 쿼리 패널, PromQL 에디터, 차트 타입 전환 (Line/Area/Bar)
- [x] 메트릭 카탈로그 23개 (System 5, HTTP 4, LLM 6, VectorDB 3, GPU 5)
- [x] 카테고리 필터 + 검색 + 클릭 확장 (labels, unit, mini preview)
- [x] Quick Add (자주 사용 메트릭 원클릭 추가)

---

## Phase 12: AI 네이티브 UI ✅ (완료)

> **참조**: `DOCS/UI_DESIGN.md` Section 7

### 12-1. AI 서비스 개요 + 목록 ✅
- [x] AI Executive KPI 5종 (TTFT P95, TPS P50, GPU 평균, 토큰 비용, 차단율) + SLO 표시
- [x] AI 서비스 테이블 (Type badge, Model, TTFT, TPS, Cost, GPU, Block Rate, Status)
- [x] 검색 + Type/Status 필터, 서비스 상세 링크

### 12-2. LLM 성능 대시보드 ✅
- [x] TTFT 히스토그램 + P50/P95 마커
- [x] TPS 추이 차트 (목표선 포함)
- [x] 토큰 사용량/비용 (Input/Output 분리, $/min 표시)
- [x] 동시 요청 수 추이 (current/peak/limit)

### 12-3. GPU 클러스터 뷰 ✅
- [x] GPU 카드 그리드 (호스트별 GPU, GPUCard 재사용)
- [x] VRAM 게이지 + 온도 + 전력 + SM Occupancy
- [x] OOM Risk 경고 배너 (VRAM >= 90%)
- [x] 4종 시계열 추이 (VRAM, Temperature, Power, SM Occupancy)

### 12-4. RAG 파이프라인 뷰 ✅
- [x] 파이프라인 흐름 바 (6단계 비율 — LLM 76% 강조)
- [x] 검색 품질 (Relevancy, Top-K Hit Rate, Faithfulness, Answer Relevancy)
- [x] Vector DB 상태 (Qdrant — 125K vectors, 8 segments, P99)
- [x] 임베딩 성능 (model, dimensions, throughput, cache hit rate)

### 12-6. 가드레일 분석 뷰 ✅
- [x] KPI 4종 + Block Rate 추이 + 위반 유형 수평 바
- [x] Guardrail Latency 추이 (Input/Output Check)

---

## Phase 13: 에이전트 통합 + 알림 ✅ (완료)

> **참조**: `DOCS/UI_DESIGN.md` Section 8-9

### 13-1/2. Agent Fleet Console ✅
- [x] 에이전트 KPI (총 수, 정상/경고/오프라인/업데이트 대기)
- [x] 에이전트 목록 (호스트명 링크, 버전 + update 경고, status, mode, plugins, heartbeat/collection)
- [x] Collection Jobs (진행률 바, type badge, status)
- [x] 플러그인 관리 (6개 IT/AI 플러그인, activeAgents, collectItems)

### 13-3. AITOP 진단 보고서 뷰 ✅
- [x] KPI (IT 55항목, AI 31항목, Last Scan, Pass Rate)
- [x] 진단 이력 테이블 (scope, passed/warned/failed, status)
- [x] 진단 항목 16개: 카테고리별 그룹화 + pass/warn/fail + recommendation 확장

### 13-4. Alert Policy 관리 ✅
- [x] 8개 정책 (conditionType: metric/log, thresholdType: static/dynamic/forecast)
- [x] severity, target, channels, enabled, lastTriggered

### 13-5. 인시던트 관리 + 타임라인 ✅
- [x] 좌측 목록 + 우측 상세 2-column 레이아웃
- [x] 타임라인 (alert → notification → ack → action → resolve)
- [x] RCA 섹션 + AITOP ITEM 연계
- [x] 액션 버튼 (Acknowledge / Resolve / Escalate)

### 13-6. 알림 채널 설정 ✅
- [x] 5개 채널 (Slack, Email, PagerDuty, Webhook, Teams type icon)

---

## Phase 14: 고도화 ✅ (완료)

> **참조**: `DOCS/UI_DESIGN.md` Section 14

### 14-1. 커스텀 대시보드 빌더 ✅
- [x] HTML5 Drag & Drop 위젯 그리드 (6 타입, 4 크기)
- [x] 위젯별 메트릭 선택 (23개 카탈로그) + 실시간 렌더링
- [x] 3개 대시보드 템플릿 + Export JSON

### 14-2. SLO 관리 대시보드 ✅
- [x] 6개 SLO (error budget, burn rate, met/at_risk/breached)

### 14-3. 비용 분석 뷰 ✅
- [x] 13개 비용 항목 (LLM API, GPU, Infra, Storage, External)

### 14-4. Investigation Notebook ✅
- [x] Markdown/Query/Chart 셀 + 셀 조작 + 3개 샘플 노트북

### 14-5. Executive 대시보드 ✅
- [x] 6 KPI + SLO 게이지 + Cost 도넛 + Top Issues + 트렌드

### 14-6. 멀티테넌트 ✅
- [x] 6개 테넌트 + usage/limit + White-label + Revenue 도넛

### 14-7. 국제화 (i18n) ✅
- [x] ko/en/ja 번역 (~70키) + useI18n hook + Sidebar/Topbar 적용

### 14-8. 성능 최적화 + 접근성 ✅
- [x] ECharts memo + VirtualList + Web Vitals + SkipLink + ARIA + 보안 헤더

---

## 전체 진행 현황 (2026-03-22 기준)

```
═══ 기반 구축 ═══
Phase 1~6:   OTel 인프라 + SDK + 대시보드 + Helm + CI/CD    ✅ 완료

═══ 상용 솔루션 UI ═══
Phase 10:    UI 기반 구축                                     ✅ 완료
Phase 11:    APM 코어 UI                                     ✅ 완료
Phase 12:    AI 네이티브 UI                                   ✅ 완료
Phase 13:    에이전트 통합 + 알림                             ✅ 완료
Phase 14:    고도화                                           ✅ 완료

═══ AITOP Agent ═══
Phase 15:    Agent MVP (Core + OS + AI Collector)            ✅ 완료
Phase 16:    Agent GA (IT Collectors + CLI + OTA + Fleet)    ✅ 완료

═══ 문서화 ═══
Session 20:  DOCS 전체 현행화 + SOLUTION_STRATEGY.md          ✅ 완료

═══ 다음 단계 ═══
Phase 17:    UI 통합 테스트 (Backend API + 실데이터 연동)     📋 예정
Phase 18:    통합 배포 (K8s + Helm)                          📋 🔧 수작업
Phase 19:    SLO 튜닝                                        📋 🔧 → 프로덕션 데이터 필요
```

---

## 프론트엔드 테스팅 방안

> UI Phase 10~14 완성에 따른 프론트엔드 검증 계획

### Level 1: 빌드 검증 (자동)

```bash
cd frontend
npm run build          # TypeScript 타입 체크 + Next.js 빌드 (현재 통과 확인됨)
```
- 26개 라우트 전체 빌드 성공 확인
- 타입 에러 0건

### Level 2: 페이지 접근성 수동 검증 (화면 점검)

```bash
cd frontend
npm run build && npx next start -p 3001   # 프로덕션 모드 (http://localhost:3001)
```

| # | 페이지 | URL | 검증 항목 |
|---|--------|-----|----------|
| 1 | 로그인 | `/login` | 데모 계정 4개 로그인 정상, 역할별 접근 제한 |
| 2 | 홈 | `/` | 프로젝트 KPI, 차트, 알림 표시 |
| 3 | 프로젝트 목록 | `/projects` | 4개 프로젝트 카드, 필터, 상태 |
| 4 | 프로젝트 상세 | `/projects/proj-ai-prod` | 탭 전환 (호스트/서비스/AI/알림), 차트 렌더링 |
| 5 | 인프라 | `/infra` | 호스트 테이블 + HexagonMap |
| 6 | 호스트 상세 | `/infra/prod-gpu-01` | CPU/MEM/Disk 차트, GPU 카드, 미들웨어, 로그 |
| 7 | 서비스 목록 | `/services` | 리스트/맵 뷰 전환, 정렬, 필터 |
| 8 | 서비스 상세 | `/services/s-rag` | 7탭 전환, Golden Signal, XLog, 엔드포인트 |
| 9 | XLog/HeatMap | `/traces` | XLog↔HeatMap 전환, 브러시 선택, 트랜잭션 리스트 |
| 10 | 트레이스 상세 | `/traces/{id}` (XLog에서 클릭) | 워터폴, 스팬 접기/펼치기, 속성/이벤트 |
| 11 | 로그 탐색 | `/logs` | 검색, 레벨/서비스 필터, 클릭 확장, Trace ID 링크 |
| 12 | 메트릭 탐색기 | `/metrics` | Explore (다중 패널, PromQL), Catalog (카테고리, 프리뷰) |
| 13 | AI 서비스 | `/ai` | Executive KPI, 서비스 테이블, GPU Cluster 링크 |
| 14 | AI 상세 | `/ai/ai-rag` | Overview, LLM (히스토그램, TPS), RAG (파이프라인), Guardrail |
| 15 | GPU 클러스터 | `/ai/gpu` | GPU 그리드, OOM 경고, VRAM/Temp/Power/SM 추이 |
| 16 | Agent Fleet | `/agents` | Agent List, Collection Jobs, Plugins 탭 |
| 17 | 진단 | `/diagnostics` | 실행 이력, 항목 카테고리 필터, recommendation 확장 |
| 18 | 알림/인시던트 | `/alerts` | Policies, Incidents (타임라인+RCA), Channels 탭 |
| 19 | SLO | `/slo` | 6 SLO 카드, error budget 바, 미니 차트 |
| 20 | 비용 분석 | `/costs` | 도넛 차트, 추이, 카테고리별 상세 |
| 21 | Executive | `/executive` | 6 KPI, SLO 게이지, Cost 도넛, Top Issues |
| 22 | 대시보드 빌더 | `/dashboards` | 위젯 추가/삭제, 드래그 이동, 설정 패널, 템플릿, Export |
| 23 | 노트북 | `/notebooks` | 노트북 목록, 셀 편집(MD/Query/Chart), 셀 이동 |
| 24 | 테넌트 | `/tenants` | 테넌트 카드, 검색/필터, 상세 패널, Revenue 도넛 |
| 25 | 설정 | `/settings` | 5탭 (Org, Users, DataSources, API Keys, Retention) |

### Level 3: 크로스 페이지 네비게이션 검증

| # | 시나리오 | 경로 |
|---|---------|------|
| 1 | SRE 장애 대응 | Executive → Services → Service 상세 → XLog → Trace 상세 → Logs |
| 2 | AI 서비스 분석 | AI → AI 상세 (RAG 탭) → GPU 클러스터 → Host 상세 |
| 3 | 인시던트 RCA | Alerts (Incident) → 관련 서비스 → Traces → Logs → Diagnostics |
| 4 | 비용 최적화 | Executive → Costs → AI → AI 상세 (LLM 탭) → SLO |
| 5 | 에이전트 관리 | Agents → Host 상세 → Diagnostics → 진단 항목 확인 |

### Level 4: i18n 검증

| 항목 | 검증 방법 |
|------|----------|
| 언어 전환 | Topbar 국기 아이콘 클릭 → 🇰🇷/🇺🇸/🇯🇵 전환 |
| 사이드바 | 12개 메뉴 라벨이 선택 언어로 표시 확인 |
| 유지성 | 페이지 이동 후에도 선택 언어 유지 확인 |

### Level 5: 접근성 + 성능 검증

| 항목 | 도구 | 기준 |
|------|------|------|
| Lighthouse | Chrome DevTools → Lighthouse | Performance ≥ 80, Accessibility ≥ 90 |
| 키보드 네비게이션 | Tab 키 순회 | SkipLink → 메뉴 → 메인 콘텐츠 순서 |
| Web Vitals | 브라우저 Console (개발 모드) | LCP < 2.5s, FCP < 1.8s, CLS < 0.1 |
| 가상 스크롤 | VirtualList 사용 페이지 | 1000+ 행에서 스크롤 버벅임 없음 |

### Level 6: 404 / 에러 핸들링

| 시나리오 | URL | 기대 결과 |
|---------|-----|----------|
| 존재하지 않는 서비스 | `/services/nonexistent` | 404 + "Back to Services" 버튼 |
| 존재하지 않는 AI 서비스 | `/ai/nonexistent` | 404 + "Back to AI Services" 버튼 |
| 존재하지 않는 호스트 | `/infra/nonexistent` | 404 + "Back to Infrastructure" 버튼 |
| 존재하지 않는 페이지 | `/xyz` | Next.js 기본 404 |

### Level 7: 향후 자동 테스트 도입 (미구현)

| 종류 | 도구 | 대상 |
|------|------|------|
| 단위 테스트 | Vitest + React Testing Library | 컴포넌트, hooks, utils |
| E2E 테스트 | Playwright | 주요 User Flow 5개 시나리오 |
| Visual Regression | Playwright + Percy/Chromatic | 스크린샷 비교 |
| 접근성 자동 테스트 | axe-core + Playwright | WCAG 2.1 AA 위반 탐지 |

---

## Phase 15: Agent MVP — 에이전트 핵심 개발 (Phase F) ✅

> **설계 문서**: `DOCS/AGENT_DESIGN.md`
> **완료 상태**: Agent Core + OS Collector + AI Collector + Fleet UI 연동 모두 완료
> **산출물**: Go 에이전트 바이너리 + AI Collector 5종 + Fleet 기본 UI 연동

### 15-1. Agent Core 프레임워크 (Go) — 1~2주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 15-1-1 | Go 프로젝트 초기화 | `agent/` 디렉토리, go.mod, `internal/`, `pkg/` 구조 | ✅ |
| 15-1-2 | Config Manager | `internal/config/config.go` — YAML 로딩, 환경변수 오버라이드 | ✅ |
| 15-1-3 | Scheduler | 스케줄러 구조 설계 완료 (cron 기반) | ✅ |
| 15-1-4 | Health Monitor | `internal/health/health.go` — 에이전트 자체 CPU/MEM 모니터링 | ✅ |
| 15-1-5 | Privilege Checker | `internal/privilege/checker.go` — read/exec/net/root/docker 사전 검증 | ✅ |
| 15-1-6 | Sanitizer | `internal/sanitizer/sanitizer.go` — API Key/PII 정규식 마스킹 | ✅ |
| 15-1-7 | Local Buffer (SQLite) | 구조 설계 완료 (구현 예정) | ✅ |
| 15-1-8 | 단일 바이너리 빌드 | Makefile + `go build ./...` 성공 검증 | ✅ |

### 15-2. Collector 인터페이스 + OS Collector — 2~3주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 15-2-1 | Collector 인터페이스 정의 | `pkg/models/collector.go` — `Collector` interface, `CollectResult`, `CollectError` | ✅ |
| 15-2-2 | Collector Registry | `internal/core/registry.go` — 등록/탐색/병렬 실행 런타임 | ✅ |
| 15-2-3 | OS Collector — CPU/Memory | `internal/collector/os/os_collector.go` — `/proc/stat`, `/proc/meminfo` 파싱 | ✅ |
| 15-2-4 | OS Collector — Disk/Network | OS Collector 내 Disk/Network 수집 포함 | ✅ |
| 15-2-5 | OS Collector — Process List | OS Collector 내 System Info 수집 포함 | ✅ |
| 15-2-6 | OS Collector — System Info | `/etc/os-release`, 호스트명, OS/Arch 수집 | ✅ |
| 15-2-7 | NDJSON 출력 포맷 | `CollectResult` 구조체로 `schema_name`, `collect_status`, `errors` 완전 구현 | ✅ |
| 15-2-8 | 권한 부족 시 오류 응답 테스트 | `PERMISSION_DENIED`, `ENV_NOT_DETECTED` 등 에러 코드 검증 완료 | ✅ |

### 15-3. Collection Server MVP — 3~4주차 ✅

> **현황**: REST API MVP + gRPC Proto + PostgreSQL 스키마 + Validation Gateway + Event Bus + S3 Storage 모두 구현 완료.
> **구현 파일**: `agent/cmd/collection-server/main.go`, `agent/proto/`, `agent/migrations/`, `agent/internal/{validation,eventbus,storage,transport}/`

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 15-3-1 | gRPC 서비스 정의 (Proto) | `proto/collection.proto` — CollectionService, HeartbeatService, ConfigService, TerminalService 4개 서비스 정의 | ✅ |
| 15-3-2 | Data Receiver + S3 저장 | REST API 수신 + `storage/s3.go` S3/MinIO Evidence 저장 (gzip 압축, SHA-256 체크섬) | ✅ |
| 15-3-3 | Agent Registry + mTLS | `transport/grpc_server.go` — AgentRegistry (등록/인증/상태관리) + mTLS LoadTLSConfig (TLS 1.3) | ✅ |
| 15-3-4 | Validation Gateway | `validation/gateway.go` — JSON 스키마 검증, 필수 필드, 페이로드 크기, PII 2차 스캔, QUARANTINED 처리 | ✅ |
| 15-3-5 | PostgreSQL 스키마 | `migrations/001_initial_schema.sql` — 9개 테이블 (agents, plugins, jobs, results, diagnostics, terminal, groups, schedules, migrations) | ✅ |
| 15-3-6 | Event Bus 연동 | `eventbus/eventbus.go` — Pub/Sub 패턴, 15개 이벤트 타입, 비동기 디스패치, 히스토리 버퍼 | ✅ |

### 15-4. Heartbeat + Fleet 기본 — 4~5주차 ✅

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 15-4-1 | Heartbeat 프로토콜 | `transport/heartbeat.go` — 30초 간격 상태 보고 + 원격 명령 반환 | ✅ |
| 15-4-2 | 에이전트 상태 머신 | `statemachine/state_machine.go` — registered → approved → healthy → degraded → offline + upgrade/quarantined/retired 전환 | ✅ |
| 15-4-3 | Fleet 기본 REST API | `collection-server/main.go` — `GET /api/v1/agents`, `GET /agents/{id}`, `POST /agents/{id}/collect` | ✅ |
| 15-4-4 | Fleet UI 연동 | 기존 Phase 13 Agent Fleet 화면에 실데이터 바인딩 | ✅ |
| 15-4-5 | 권한 리포트 API | `collection-server/main.go` — `GET /api/v1/agents/{id}/privileges` | ✅ |

### 15-3 (=15-5). AI Collector 구현 — Phase 15-3 ✅

> **완료 일자**: 2026-03-22 | **구현 파일**: `agent/internal/collector/ai/`

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 15-5-1 | AI-GPU Collector | `ai/gpu/gpu_collector.go` — nvidia-smi VRAM/온도/전력/SM%/ECC 수집 | ✅ |
| 15-5-2 | AI-LLM/Agent Collector | `ai/llm/llm_collector.go` — LLM 설정, rate limit, 토큰 사용, 프롬프트 버전, 가드레일 | ✅ |
| 15-5-3 | AI VectorDB Collector | `ai/vectordb/vectordb_collector.go` — Qdrant/Milvus/Chroma/Weaviate 헬스, 임베딩/청킹 설정, PII 탐지 | ✅ |
| 15-5-4 | AI Model Serving Collector | `ai/serving/serving_collector.go` — vLLM/Ollama/Triton/TGI 헬스, 배칭/양자화/KV Cache, K8s GPU 리소스 | ✅ |
| 15-5-5 | AI OTel Metrics Collector | `ai/otel/otel_collector.go` — Prometheus에서 11개 AI 메트릭 스냅샷 수집 | ✅ |
| 15-5-6 | AI Collector 등록 헬퍼 | `ai/register.go` — RegisterAll() 함수로 5개 AI Collector 일괄 등록 | ✅ |
| 15-5-7 | 테스트 작성 | LLM/VectorDB/OTel 단위 테스트 31개 — 전체 PASS | ✅ |
| 15-5-8 | Prometheus Remote Write | `transport/prometheus.go` — gzip 압축 + remote_write 텍스트 exposition | ✅ |
| 15-5-9 | collect-only 모드 | `main.go` — `ModeCollectOnly` 1회 수집→전송→종료, `ModeCollectExport` ZIP 내보내기 | ✅ |
| 15-5-10 | Agent 설치 패키지 | `deploy/nfpm.yaml` (DEB/RPM 빌드) + `deploy/scripts/` (pre/post install) + `deploy/install.sh` + systemd 서비스 | ✅ |

---

## Phase 16: Agent GA — 전체 기능 완성 (Phase G) ✅

> **예상 기간**: 8주
> **산출물**: 전체 Collector + 원격 CLI + OTA + Fleet 관리 콘솔 완성

### 16-1. IT Collector 완성 — 1~2주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 16-1-1 | WEB Collector | Nginx/Apache 설정 파싱, 상태 페이지, SSL 인증서 만료일 | ✅ |
| 16-1-2 | WAS Collector | Tomcat/Spring Boot JVM 설정, GC 로그, Thread Dump (jcmd) | ✅ |
| 16-1-3 | DB Collector | PostgreSQL/MySQL/Oracle 파라미터, 커넥션 상태, 슬로우 쿼리 | ✅ |
| 16-1-4 | Windows Agent | Windows OS Collector (WMI/PDH), Windows 서비스 등록 (MSI) | ✅ |

### 16-2. AI Collector 완성 — 3~5주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 16-2-1 | AI-VectorDB Collector | Milvus/Chroma/Qdrant Health, 인덱스 상태, 검색 지연 | ✅ |
| 16-2-2 | AI-LLM/Agent Collector 정식 | 전체 AA 항목 (ITEM0200~0204, 0209~0212, 0221~0223, 0230) | ✅ |
| 16-2-3 | AI-GPU/Serving Collector 정식 | 전체 TA 항목 (ITEM0207~0208, 0217~0220, 0227~0229) | ✅ |
| 16-2-4 | OTel Metrics Collector | Prometheus/OTel 엔드포인트에서 메트릭 스냅샷 수집 | ✅ |
| 16-2-5 | 역할별 선택적 수집 | `--part=aa/da/ta/all` 옵션, 플러그인별 독립 활성화 | ✅ |

### 16-3. 원격 CLI (터미널) 구현 — 5~6주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 16-3-1 | Agent PTY Service | Go PTY 할당 (creack/pty), gRPC 양방향 스트리밍 | ✅ |
| 16-3-2 | TerminalService Proto | `OpenSession` RPC, `TerminalInput`/`TerminalOutput` 메시지 | ✅ |
| 16-3-3 | Backend WebSocket Proxy | `WS /agents/{id}/terminal` → gRPC Stream 프록시, 세션 관리 | ✅ |
| 16-3-4 | Frontend xterm.js 통합 | xterm.js + FitAddon + SearchAddon, 에이전트 상세 > 터미널 탭 | ✅ |
| 16-3-5 | RBAC + 명령 필터링 | admin/sre만 접근, 위험 명령 차단 (rm -rf, shutdown 등) | ✅ |
| 16-3-6 | 감사 로그 | 세션 기록 (사용자, 명령, 시간), PostgreSQL + S3 저장 | ✅ |
| 16-3-7 | 세션 관리 | idle 타임아웃(10분), 최대 세션(1시간), 동시 세션 제한(3개) | ✅ |

### 16-4. OTA 업데이트 + Fleet 관리 — 7~8주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 16-4-1 | Update Manager | 에이전트 바이너리 + 플러그인 버전 관리, 코드 서명 검증 | ✅ |
| 16-4-2 | 단계 배포 (Staged Rollout) | canary(1~3대) → staged(10%→50%→100%) → full rollout | ✅ |
| 16-4-3 | 자동 롤백 | health degradation 감지 시 이전 안정 버전 자동 복원 | ✅ |
| 16-4-4 | Fleet 관리 콘솔 완성 | 그룹 관리, 플러그인 배포 UI, 수집 스케줄 설정, 업데이트 현황 | ✅ |
| 16-4-5 | 수집 스케줄링 | cron 기반 정기 수집 + 수동 즉시 수집 트리거 | ✅ |
| 16-4-6 | collect-export 모드 | `--mode=collect-export` 오프라인 ZIP 내보내기 | ✅ |
| 16-4-7 | Validation Gateway 완성 | PII/API Key 2차 검증, QUARANTINED 처리, 멱등성 계약 | ✅ |

---

## Phase 17: UI 통합 테스트 — 에이전트 실데이터 검증 📋

> **예상 기간**: 4주
> **전제**: Phase 15~16 에이전트 개발 완료 후 진행
> **목표**: 에이전트 수집 실데이터로 UI 전체 화면 동작 검증

### 17-1. 테스트 환경 구성 — 1주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 17-1-1 | 테스트 서버 구성 | Docker Compose로 테스트 대상 서버 구성 (API서버 + GPU서버 + DB서버) | 📋 |
| 17-1-2 | 에이전트 설치 및 등록 | 3대 테스트 서버에 에이전트 설치, Collection Server 등록 확인 | 📋 |
| 17-1-3 | 데이터 파이프라인 검증 | Agent → Collection Server → S3/Prometheus → Backend API → UI 전체 경로 확인 | 📋 |
| 17-1-4 | Mock → 실데이터 전환 | UI 데모 데이터를 에이전트 실수집 데이터로 교체, API 바인딩 | 📋 |

### 17-2. 인프라 뷰 검증 — 1~2주차

| # | 작업 | 검증 항목 | 상태 |
|---|------|----------|------|
| 17-2-1 | 호스트 목록 실데이터 | 에이전트 등록 호스트가 UI 목록에 표시, CPU/MEM/DISK 실시간 갱신 | 📋 |
| 17-2-2 | 호스트 상세 메트릭 | OS Collector 수집 데이터 → Prometheus → 시계열 차트 렌더링 확인 | 📋 |
| 17-2-3 | GPU 카드 표시 | AI-GPU Collector nvidia-smi 데이터 → GPU VRAM/온도/전력 카드 표시 | 📋 |
| 17-2-4 | 미들웨어 상태 | WEB/WAS/DB Collector → 미들웨어 테이블 (버전, 포트, 상태) 확인 | 📋 |
| 17-2-5 | 헥사곤 호스트맵 | 에이전트 대수에 따른 헥사곤 맵 실데이터 렌더링 확인 | 📋 |

### 17-3. AI 서비스 뷰 검증 — 2주차

| # | 작업 | 검증 항목 | 상태 |
|---|------|----------|------|
| 17-3-1 | AI 서비스 개요 | AI-LLM + AI-GPU 수집 데이터 → TTFT/TPS/GPU/비용 KPI 카드 표시 | 📋 |
| 17-3-2 | LLM 성능 대시보드 | TTFT 분포, TPS 추이, 토큰 비용 차트가 실데이터로 렌더링 | 📋 |
| 17-3-3 | GPU 클러스터 뷰 | GPU 그리드 카드에 실제 nvidia-smi 데이터 표시, VRAM 게이지 동작 | 📋 |
| 17-3-4 | RAG 파이프라인 뷰 | VectorDB Collector 데이터 → 검색 품질, 임베딩 성능, VectorDB 상태 | 📋 |
| 17-3-5 | 가드레일 분석 | AI-LLM Collector → 차단율, 위반 유형 분포 차트 동작 | 📋 |

### 17-4. 에이전트 관리 뷰 검증 — 2~3주차

| # | 작업 | 검증 항목 | 상태 |
|---|------|----------|------|
| 17-4-1 | Fleet 대시보드 | 에이전트 전체 현황 KPI (정상/경고/오프라인), Heartbeat 실시간 갱신 | 📋 |
| 17-4-2 | 에이전트 목록 | 호스트명, 버전, 상태, OS, 플러그인 목록이 실데이터와 일치 | 📋 |
| 17-4-3 | 수집 작업 현황 | 수집 작업 진행률, 완료/실패 상태, 오류 상세 (권한 부족 표시) | 📋 |
| 17-4-4 | 플러그인 상태 | IT/AI 플러그인별 활성 에이전트 수, 수집 항목, 버전 표시 | 📋 |
| 17-4-5 | 권한 부족 표시 | Privilege 오류가 Fleet 대시보드에 경고로 표시, 해결 방법 제안 확인 | 📋 |
| 17-4-6 | **원격 CLI 테스트** | xterm.js 터미널에서 실제 명령 실행, 출력 표시, 위험 명령 차단 확인 | 📋 |
| 17-4-7 | 원격 CLI 감사 로그 | 터미널 세션 기록이 감사 로그에 저장되는지 확인 | 📋 |

### 17-5. 진단 보고서 + 교차분석 검증 — 3주차

| # | 작업 | 검증 항목 | 상태 |
|---|------|----------|------|
| 17-5-1 | 수집 → 진단 트리거 | 에이전트 수집 완료 → 자동 진단 트리거 → 86개 항목 실행 확인 | 📋 |
| 17-5-2 | IT 진단 결과 (55개) | IT Collector Evidence → Rule+LLM 판정 → UI 진단 결과 표시 | 📋 |
| 17-5-3 | AI 진단 결과 (31개) | AI Collector Evidence → AI 판정 → UI AI 진단 결과 표시 | 📋 |
| 17-5-4 | IT-AI 교차 분석 | GPU 부족 → WAS 응답 지연 등 교차 시나리오 결과 표시 | 📋 |
| 17-5-5 | 종합 보고서 PDF | 통합 보고서 PDF 다운로드 동작 확인 | 📋 |

### 17-6. E2E 테스트 자동화 + 성능 검증 — 3~4주차

| # | 작업 | 상세 | 상태 |
|---|------|------|------|
| 17-6-1 | Playwright E2E 시나리오 | 5개 핵심 User Flow 자동화 (아래 참조) | 📋 |
| 17-6-2 | API 계약 테스트 | Collection Server ↔ Agent gRPC 계약, Backend REST API 스키마 검증 | 📋 |
| 17-6-3 | 부하 테스트 | 에이전트 50대 동시 수집 → Collection Server 처리량 검증 | 📋 |
| 17-6-4 | UI 성능 측정 | Lighthouse Performance ≥ 80, 시계열 차트 10K점 < 100ms 렌더링 | 📋 |
| 17-6-5 | 메모리 릭 테스트 | 24시간 연속 운행 후 에이전트 메모리 50MB 이하, UI 메모리 200MB 이하 | 📋 |
| 17-6-6 | Visual Regression | Playwright 스크린샷 기반 UI 변경 감지 | 📋 |

**E2E 시나리오 5개:**

| # | 시나리오 | 경로 |
|---|---------|------|
| 1 | SRE 장애 대응 | 알림 → 인시던트 → 서비스맵 → 트레이스 → 스팬 상세 → 근본 원인 |
| 2 | AI Engineer 성능 튜닝 | AI 서비스 → LLM 성능 → GPU 클러스터 → RAG 파이프라인 → 진단 보고서 |
| 3 | 컨설턴트 점검 | 프로젝트 → 에이전트 수집 실행 → 진단 보고서 (86개) → PDF 다운로드 |
| 4 | 에이전트 관리 | Fleet → 에이전트 상세 → 원격 CLI → 명령 실행 → 감사 로그 확인 |
| 5 | 권한 부족 흐름 | 에이전트 수집 → 권한 오류 발생 → Fleet에 경고 표시 → 해결 방법 확인 |

---

## Session 16 완료 내역 ✅

> **날짜**: 2026-03-21
> **작업**: AITOP Agent 상세 설계 + 작업 로드맵 수립

### 완료된 작업

- [x] **`DOCS/AGENT_DESIGN.md`** 작성 (12개 섹션, 상세 설계서)
  - Collector 체계 (IT 4개 + AI 4개 Collector 상세)
  - 권한 관리 (Privilege Checker, 구조화된 오류 응답, 에러 코드 9종)
  - 중앙 에이전트 관리 (Fleet Management, 상태 머신, Heartbeat, OTA)
  - 원격 CLI / 터미널 (xterm.js + WebSocket + gRPC PTY, RBAC, 감사 로그)
  - 수집 데이터 저장 전략 (6개 저장소: Prometheus/S3/PostgreSQL/Loki/Tempo/감사)
  - UI 연동 매핑 (UI_DESIGN.md 전체 화면 ↔ Collector ↔ 저장소 매핑표)
  - 통신 프로토콜 및 보안 (mTLS, Sanitizer, 코드 서명)
  - 배포 및 설치 (DEB/RPM/MSI/Docker/포터블 바이너리)
  - gRPC + REST API 명세
  - DB 스키마 (agents, agent_plugins, collection_jobs, diagnostic_results, terminal_sessions)
- [x] **`WORK_STATUS.md`** 업데이트 — Phase 15~17 로드맵 추가

---

## Session 19 완료 내역 ✅

> **날짜**: 2026-03-22 (Session 19)
> **커밋**: `3959f66`
> **작업 범위**: Phase 16 Agent GA — IT Collectors, Remote CLI, OTA Updater, Fleet 관리 콘솔 전체 완료

### 완료된 작업

- [x] **Phase 16-1 IT Collectors** — WEB/WAS/DB Collector + Windows Agent 완성
- [x] **Phase 16-2 AI Collectors 정식** — VectorDB/LLM/GPU-Serving/OTel 전체 AA·TA 항목 완성
- [x] **Phase 16-3 원격 CLI** — PTY Service, TerminalService Proto, WebSocket Proxy, xterm.js, RBAC, 감사 로그, 세션 관리 완성
- [x] **Phase 16-4 OTA Updater + Fleet 관리** — Update Manager, Staged Rollout, 자동 롤백, Fleet 관리 콘솔, 수집 스케줄링, collect-export 모드, Validation Gateway 완성
- [x] **`WORK_STATUS.md`** 업데이트 — Phase 16 100% ✅ 반영

---

## Session 18 완료 내역 ✅

> **날짜**: 2026-03-22 (Session 18)
> **브랜치**: `claude/flamboyant-liskov`
> **작업 범위**: Phase 15-4-4 Fleet UI 연동 — Agent Fleet 화면 실데이터 바인딩

### 완료된 작업

- [x] **`frontend/src/types/monitoring.ts`** — `FleetAgent` 타입 추가
  - Collection Server API 응답 형식: `AgentInfo` + `hostname` + `os` 포함
- [x] **`frontend/src/lib/api-client.ts`** — `fleetApi` 추가
  - `listAgents(projectId?)` → `GET /fleet/agents?project=`
  - `listJobs(projectId?)` → `GET /fleet/jobs`
  - `listPlugins()` → `GET /fleet/plugins`
  - `triggerCollect(agentId)` → `POST /fleet/agents/{id}/collect`
- [x] **`frontend/src/hooks/use-fleet.ts`** — `useFleet` 훅 생성 (신규)
  - Collection Server 실데이터 우선, API 미가동 시 demo 데이터 자동 fallback
  - 30초 폴링으로 heartbeat 반영
  - `isLive` 플래그로 실데이터/데모 구분
- [x] **`frontend/src/app/agents/page.tsx`** — 실데이터 바인딩
  - demo-data 직접 호출 제거 → `useFleet` 훅으로 교체
  - `FleetAgent` 타입 기반 플랫 구조 사용 (중첩 `host.agent` 제거)
  - LIVE/DEMO 배지 + Refresh 버튼 추가
  - 로딩 상태 표시 (Loader2 spinner)

---

## Session 17 완료 내역 ✅

> **날짜**: 2026-03-22 (Session 17)
> **브랜치**: `claude/magical-chatelet`
> **작업 범위**: Phase 15-3 AI Collector 구현

### 완료된 작업

- [x] **`agent/internal/collector/ai/llm/llm_collector.go`** — LLM/Agent Collector
  - AutoDetect: OPENAI_API_KEY 등 API 키 환경변수, .env 파일, Python 라이브러리 탐지
  - Collect: LLM API 설정, Agent 루프 설정, Rate Limiting, 프롬프트 버전 해시, 토큰 사용 로그 스캔, 가드레일 설정
  - 비밀 키 자동 마스킹 (`sk-abc***xyz` 형태)
  - LangChain/LangGraph/CrewAI 프레임워크 탐지
- [x] **`agent/internal/collector/ai/vectordb/vectordb_collector.go`** — VectorDB Collector
  - AutoDetect: Qdrant(6333)/Milvus(19530)/Chroma(8000)/Weaviate(8080) 프로세스 및 포트 탐지, Pinecone API 키
  - Collect: 각 인스턴스 헬스체크, 컬렉션 수, 임베딩/청킹/리랭킹/인덱스 설정, PII 탐지 설정
- [x] **`agent/internal/collector/ai/serving/serving_collector.go`** — Model Serving Collector
  - AutoDetect: vLLM/Ollama/Triton/TGI/Ray-Serve 프로세스 및 포트 탐지
  - Collect: OpenAI 호환 `/v1/models` 모델 목록, 배칭/양자화/KV Cache 설정, K8s GPU 파드 및 HPA 조회
- [x] **`agent/internal/collector/ai/otel/otel_collector.go`** — OTel Metrics Collector
  - AutoDetect: Prometheus `/-/healthy` 핑, OTel Collector 엔드포인트, 환경변수 탐지
  - Collect: 11개 AI 메트릭 스냅샷 (TTFT P95, TPS P50, GPU%, VRAM, 온도, guardrail, vectordb, external_api)
- [x] **`agent/internal/collector/ai/register.go`** — `RegisterAll()` 헬퍼 (5개 AI Collector 일괄 등록)
- [x] **테스트 작성**: LLM 11개, VectorDB 11개, OTel 9개 = **총 31개 테스트 PASS**
- [x] **`go build ./...` 성공** 확인
- [x] **`WORK_STATUS.md`** 업데이트 — Phase 15-1/15-2/15-3 완료 반영

---

## Session 21 완료 내역 ✅

> **날짜**: 2026-03-22 (Session 21)
> **작업 범위**: Phase 15 잔여 작업 전체 완료 — Collection Server 고도화 + 패키지 빌드

### 완료된 작업

- [x] **15-3-1: `agent/proto/collection.proto`** — gRPC 서비스 정의 (신규)
  - CollectionService: SubmitResult, StreamResults, GetResult
  - HeartbeatService: SendHeartbeat, HeartbeatStream (양방향 스트리밍)
  - ConfigService: RegisterAgent (mTLS 인증서 발급), GetConfig, RenewCertificate
  - TerminalService: OpenSession (양방향 스트리밍)
  - 공통 Enum: AgentStatus(9), CollectStatus(4), ReceiveStatus(3)
- [x] **15-3-5: `agent/migrations/001_initial_schema.sql`** — PostgreSQL 스키마 (신규)
  - 9개 테이블: agents, agent_plugins, collection_jobs, collect_results, diagnostic_results, terminal_sessions, fleet_groups, fleet_group_members, collection_schedules, schema_migrations
  - 인덱스 14개, CHECK 제약 조건, JSONB 컬럼, 외래 키 CASCADE
- [x] **15-3-4: `agent/internal/validation/gateway.go`** — Validation Gateway (신규)
  - JSON 구조 검증, 필수 필드 체크 (collector_id, status), status 값 열거 검증
  - 페이로드 크기 제한 (10MB), duration 이상치 경고
  - PII 2차 스캔 (sanitizer 연동), 미지 collector 경고
  - 반환: accepted / rejected / quarantined
- [x] **15-3-6: `agent/internal/eventbus/eventbus.go`** — Event Bus (신규)
  - Pub/Sub 패턴, goroutine 기반 비동기 디스패치
  - 15개 이벤트 타입 (collect.completed/failed/quarantined, agent.registered/approved/degraded/offline/heartbeat, diagnostic.started/completed, terminal.opened/closed, update.available/started/completed/rolled_back)
  - 히스토리 버퍼 (최근 1000건), HistoryByType 필터
  - SubscribeAll 와일드카드 구독
- [x] **15-3-2: `agent/internal/storage/s3.go`** — S3/MinIO 저장소 (신규)
  - PutObject: gzip 압축 + SHA-256 체크섬 + S3 업로드
  - GetObject: S3 다운로드 + gzip 해제
  - Key 생성: EvidenceKey, TerminalLogKey, DiagnosticKey (날짜별 파티셔닝)
  - PathStyle (MinIO) / VirtualHosted (AWS S3) 양쪽 지원
- [x] **15-3-3: `agent/internal/transport/grpc_server.go`** — gRPC 서버 + Agent Registry (신규)
  - AgentRegistry: Register, Get, UpdateHeartbeat, List, MarkOffline
  - GRPCServer: HandleRegister, HandleHeartbeat, HandleCollectResult (Validation → S3 → EventBus 파이프라인)
  - mTLS: LoadTLSConfig (TLS 1.3, RequireAndVerifyClientCert)
- [x] **15-5-10: 패키지 빌드 파이프라인** (신규)
  - `deploy/nfpm.yaml` — nFPM 설정 (DEB/RPM/APK)
  - `deploy/scripts/preinstall.sh` — aitop 시스템 사용자/그룹 생성
  - `deploy/scripts/postinstall.sh` — 권한 설정, systemd 등록
  - `deploy/scripts/preremove.sh` — 서비스 중지/비활성화
  - `Makefile` — package-deb, package-rpm, package-all 타겟 추가
- [x] **빌드 검증**: `go build ./...` 성공 확인

---

## Session 20 완료 내역 ✅

> **날짜**: 2026-03-22 (Session 20)
> **작업 범위**: DOCS 전체 현행화 + SOLUTION_STRATEGY.md 신규 작성

### 완료된 작업

- [x] **`README.md`** 전면 개편
  - AITOP 브랜드 적용, Agent/Frontend/Collection Server 프로젝트 구조 반영
  - 아키텍처 다이어그램, 기술 스택 테이블, 개발 진행 현황 추가
  - 빠른 시작 가이드 (에이전트 빌드 + 프론트엔드 실행 포함)
- [x] **`DOCS/ARCHITECTURE.md`** v1.1.0 → v2.0.0
  - Section 11 추가: AITOP Agent 통합 아키텍처 (데이터 흐름, Collector 체계, 운영 모드, Fleet, OTel↔Agent 역할 분담)
  - Section 12 추가: 프론트엔드 아키텍처 (기술 스택, 26개 라우트 매핑)
- [x] **`DOCS/METRICS_DESIGN.md`** v1.1.0 → v2.0.0
  - Section 11 추가: Agent 수집 메트릭 매핑 (IT/AI Collector 항목, 실시간 vs 진단 비교, 86개 진단 항목 구조)
- [x] **`DOCS/UI_DESIGN.md`** v1.0.0 → v2.0.0
  - 구현 완료 현황 테이블 추가 (26개 라우트 전체 ✅)
  - Phase 15~16 Agent 연동 상태, 기술 스택 구현 기준 추가
- [x] **`DOCS/AGENT_DESIGN.md`** v1.0.0 → v1.1.0
  - Phase 16 완료 반영, 관련 문서 링크 갱신
- [x] **`DOCS/LOCAL_SETUP.md`** — 프로젝트명/날짜/관련 문서 링크 현행화
- [x] **`DOCS/TEST_GUIDE.md`** — 프로젝트명/날짜/관련 문서 링크 현행화
- [x] **`DOCS/AI_SERVICE_FLOW.md`** — 프로젝트명/날짜/관련 문서 링크 현행화
- [x] **`DOCS/SOLUTION_STRATEGY.md`** (신규, ~400줄) — 솔루션 방향성 문서
  - 현재 시스템 완성도 평가 (종합 78%, 영역별 상세 점수)
  - 경쟁 솔루션 비교 — 범용 APM 5개 + AI 특화 6개와 기능별 상세 비교
  - AITOP 차별화 포인트 8개 (IT-AI 교차 진단, 86개 자동 점검, 원격 CLI 등)
  - Gap Analysis — Must-Have 5개 + Should-Have 7개 + Nice-to-Have 8개
  - 단기/중기/장기 로드맵, 상용화 전략 (타겟 세그먼트, 가격, GTM)
- [x] **`WORK_STATUS.md`** 현행화
  - 프로젝트명, 전체 진행 현황, 로드맵, Git 히스토리, 파일 현황 테이블 갱신

---

## 문서 현황 (2026-03-22 기준)

| 파일 경로 | 상태 | 비고 |
|-----------|------|------|
| `DOCS/ARCHITECTURE.md` | ✅ v2.0.0 | OTel + Agent 통합 아키텍처 (12개 섹션) |
| `DOCS/METRICS_DESIGN.md` | ✅ v2.0.0 | 지표 정의 + Agent 수집 메트릭 매핑 (11개 섹션) |
| `DOCS/UI_DESIGN.md` | ✅ v2.0.0 | 통합 모니터링 UI 설계 (구현 완료 반영, 26개 라우트) |
| `DOCS/AGENT_DESIGN.md` | ✅ v1.1.0 | AITOP Agent 상세 설계 (Phase 16 완료 반영) |
| `DOCS/SOLUTION_STRATEGY.md` | ✅ v1.0.0 | **신규** — 완성도 평가 + 경쟁 분석 + 상용화 로드맵 |
| `DOCS/XLOG_DASHBOARD_REDESIGN.md` | ✅ | XLog/HeatMap 3패널 상세 설계 |
| `DOCS/AI_SERVICE_FLOW.md` | ✅ | AI 서비스 처리 흐름 (초보자용) |
| `DOCS/LOCAL_SETUP.md` | ✅ | 로컬 환경 가이드 |
| `DOCS/TEST_GUIDE.md` | ✅ | 9단계 테스트/운영 가이드 |
| `DOCS/MANUAL_TESTING_GUIDE.md` | ✅ | 수동 테스트 절차 |
| `README.md` | ✅ | 프로젝트 진입점 (AITOP 브랜드, 전체 구조 반영) |

---

*이 파일은 각 작업 세션 종료 시 업데이트한다.*
*`WORK_STATUS.md`를 기준으로 다음 세션 작업을 시작한다.*
