# WORK_STATUS.md — 작업 진행 현황 및 TO-DO 마스터 문서

> **프로젝트**: OpenTelemetry 기반 AI 서비스 성능 모니터링 솔루션
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2026-03-19 (Session 7 — UI 대대적 재설계 방향 수립)
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
Phase 10: UI 기반 구축         [░░░░░░░░░░]   0%  📋  (Next.js + 디자인 시스템 + 네비게이션 + 프로젝트 관리)
Phase 11: APM 코어 UI          [░░░░░░░░░░]   0%  📋  (서비스맵 + XLog + 트레이스 + 로그 탐색)
Phase 12: AI 네이티브 UI       [░░░░░░░░░░]   0%  📋  (LLM 대시보드 + GPU 클러스터 + RAG + Agent 뷰)
Phase 13: 에이전트 통합 + 알림  [░░░░░░░░░░]   0%  📋  (AITOP Agent Fleet + 진단 보고서 + 인시던트)
Phase 14: 고도화               [░░░░░░░░░░]   0%  📋  (커스텀 대시보드 + SLO + 비용분석 + 멀티테넌트)
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

## 권장 작업 순서 (후속 수작업)

```
Phase 7: E2E 통합 검증         📋 🔧 수작업
  7-1. 로컬 Docker 통합 테스트    → TEST_GUIDE.md Level 1~5 참조
  7-2. 부하 테스트 및 샘플링 검증  → TEST_GUIDE.md Level 5~7 참조
  7-3. Trace 연속성 종합 검증     → TEST_GUIDE.md Level 6 참조

Phase 8: Kubernetes 배포       📋 🔧 수작업
  8-1. Helm Chart Dry-Run 검증   → TEST_GUIDE.md Level 8 참조
  8-2. 스테이징 환경 배포         → 실제 K8s 클러스터 필요
  8-3. 프로덕션 배포             → 시크릿 사전 생성 필요

Phase 9: SLO 튜닝 및 운영 안정화  📋 🔧 수작업
  9-1. SLO 임계치 튜닝           → 1~2주 운영 데이터 필요
  9-2. Tail Sampling 정책 최적화  → 실제 RPS 측정 필요
  9-3. 대시보드 커스터마이징       → 팀 요구사항 반영
```

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

## Phase 10: UI 기반 구축 📋 (4주)

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

## Phase 11: APM 코어 UI 📋 (4주)

> **참조**: `DOCS/UI_DESIGN.md` Section 6, `DOCS/XLOG_DASHBOARD_REDESIGN.md`
> **목표**: 서비스 중심 APM 기능 구현

### 11-1. 서비스 맵 (토폴로지)

- [ ] D3.js + React Flow 기반 서비스 의존관계 맵
- [ ] 노드: 서비스 (크기=처리량, 색상=건강도)
- [ ] 엣지: 호출 관계 (두께=호출량, 색상=에러율)
- [ ] 5-Layer 필터 (UI/Agent/LLM/Data/Infra)
- [ ] 노드 클릭 → 서비스 상세 네비게이션

### 11-2. 서비스 상세

- [ ] 골든 시그널 (Latency, Traffic, Errors, Saturation) KPI 카드
- [ ] 엔드포인트 목록 (URL별 RPM, P95, 에러율, 기여도)
- [ ] 의존관계 (업스트림/다운스트림 서비스)
- [ ] 배포 마커 (배포 시점 타임라인 표시)

### 11-3. XLog + HeatMap 통합

- [ ] 기존 `dashboards/xlog-heatmap/` Canvas 코드를 React 컴포넌트로 통합
- [ ] 3패널 레이아웃: XLog/HeatMap (40%) + 트랜잭션 목록 (25%) + 상세 (35%)
- [ ] 드래그 선택 → 트랜잭션 필터링
- [ ] XLOG_DASHBOARD_REDESIGN.md 사양 구현

### 11-4. 트레이스 탐색 + 워터폴

- [ ] 트레이스 검색 (서비스, 상태, 지속시간, 태그 필터)
- [ ] 워터폴 타임라인 (스팬 계층 표시, 시간 바)
- [ ] 스팬 상세 (속성, 이벤트, 로그 연결)
- [ ] 트레이스 비교 (두 트레이스 나란히)

### 11-5. 로그 탐색

- [ ] 로그 전문 검색 + 필드 필터
- [ ] 로그 패턴 자동 그룹화
- [ ] 로그 ↔ 트레이스 상호 링크 (Trace ID 기반)
- [ ] 실시간 로그 스트리밍 (WebSocket)

### 11-6. 메트릭 탐색기

- [ ] 시각적 쿼리 빌더 (PromQL 자동 생성)
- [ ] 메트릭 카탈로그 (자동 완성, 설명)
- [ ] 커스텀 차트 생성 + 저장
- [ ] Explore 뷰 (Grafana Explore 유사)

---

## Phase 12: AI 네이티브 UI 📋 (3주)

> **참조**: `DOCS/UI_DESIGN.md` Section 7
> **목표**: AI/LLM 서비스 모니터링을 1등 시민으로 구현

### 12-1. AI 서비스 개요 + 목록

- [ ] AI Executive KPI (TTFT P95, TPS P50, GPU 평균, 토큰 비용, 차단율)
- [ ] AI 서비스 목록 (서비스명, 모델, 성능 지표, 상태)
- [ ] SLO 준수 여부 시각화 (게이지, 트렌드)

### 12-2. LLM 성능 대시보드

- [ ] TTFT 분포 히스토그램 + P50/P95/P99 마커
- [ ] TPS 추이 차트 (목표선 포함)
- [ ] 토큰 사용량 / 비용 추적 (Input/Output 분리)
- [ ] 동시 요청 수 추이
- [ ] Exemplar 연동 (메트릭 → 트레이스 직접 이동)

### 12-3. GPU 클러스터 뷰

- [ ] GPU 카드 그리드 (호스트별 GPU 현황)
- [ ] VRAM 게이지 + 온도 + 전력
- [ ] OOM 카운트다운 예측
- [ ] VRAM 사용률 vs 큐 대기시간 상관분석 (이중 Y축)
- [ ] GPU 시계열 추이 (호스트/GPU별)

### 12-4. RAG 파이프라인 뷰

- [ ] 파이프라인 흐름도 (단계별 지연 시간 비율)
- [ ] 검색 품질 메트릭 (Relevancy, Faithfulness, Top-K 히트율)
- [ ] Vector DB 상태 (컬렉션, 벡터 수, 인덱스, 검색 P99)
- [ ] 임베딩 성능 (모델, 배치 크기, P95, 캐시 적중률)

### 12-5. Agent 실행 모니터링

- [ ] 실행 통계 (실행 횟수, 평균 스텝, 성공률, 평균 비용)
- [ ] 실행 이력 테이블 (Trace 기반)
- [ ] 실행 상세 (스텝별 LLM Call / Tool Call 시각화)
- [ ] 루프 감지 경고 (max_iterations 근접/도달)
- [ ] 재귀 깊이 추적

### 12-6. 가드레일 분석 뷰

- [ ] 차단율 추이 + 위반 유형 분포
- [ ] 레이턴시 기여도 (가드레일이 전체 응답시간에서 차지하는 비율)
- [ ] 위반 상세 로그 (Loki 연동)

---

## Phase 13: 에이전트 통합 + 알림 📋 (3주)

> **참조**: `DOCS/UI_DESIGN.md` Section 8-9, `AITOP_구현_차세대_방향성.MD` Section 5
> **목표**: AITOP 에이전트 Fleet 관리 + 진단 데이터 통합 + 알림 체계

### 13-1. AITOP Agent Fleet Console

- [ ] 에이전트 전체 현황 (총 수, 정상/경고/오프라인/업데이트 대기)
- [ ] 에이전트 목록 (호스트명, 버전, 상태, OS, 플러그인, 마지막 수집)
- [ ] 플러그인 관리 (IT/AI 플러그인 목록, 활성화 상태, 커버 항목)
- [ ] 배포 관리 (OTA 업데이트, canary/staged rollout)
- [ ] 수집 작업 현황 (정기/긴급 수집 진행률)

### 13-2. 에이전트 ↔ 모니터링 통합 뷰

- [ ] 호스트별 실시간 메트릭 + AITOP 진단 결과 나란히 표시
- [ ] 교차 분석 인사이트 (GPU VRAM 추세 + ITEM0220 진단 결합)
- [ ] OTel 메트릭명 ↔ AITOP ITEM 자동 매핑 표시

### 13-3. AITOP 진단 보고서 뷰

- [ ] 진단 이력 목록 (날짜, 대상 호스트, 항목 수, 결과 요약)
- [ ] IT 진단 결과 (55개 항목) + AI 진단 결과 (31개 항목) 분리 표시
- [ ] IT-AI 교차 분석 결과 (10개 교차 시나리오)
- [ ] 종합 보고서 미리보기 + PDF/Word 다운로드
- [ ] 진단 수동 실행 트리거

### 13-4. Alert Policy 관리

- [ ] Alert Policy CRUD (메트릭 조건, 임계값, 지속 시간)
- [ ] Static / Dynamic / Forecast 임계값 유형
- [ ] Alert 이력 + 상태 변화 로그

### 13-5. 인시던트 관리 + 타임라인

- [ ] 인시던트 목록 (심각도, 상태, 담당자, 소요시간)
- [ ] 인시던트 타임라인 (시간순 이벤트 스트림)
- [ ] 근본 원인 분석 (RCA) 섹션 + AITOP 진단 연계
- [ ] 포스트모템 작성

### 13-6. 알림 채널 설정

- [ ] Slack / Teams / Discord 연동
- [ ] Email / SMS (긴급) 알림
- [ ] PagerDuty / OpsGenie 연동
- [ ] Webhook (커스텀)
- [ ] 온콜 스케줄 관리

---

## Phase 14: 고도화 📋 (4주)

> **참조**: `DOCS/UI_DESIGN.md` Section 14
> **목표**: 상용 솔루션 수준의 고급 기능 완성

### 14-1. 커스텀 대시보드 빌더

- [ ] 위젯 드래그 & 드롭 (차트, 테이블, KPI, 토폴로지, 텍스트)
- [ ] 위젯별 데이터 소스 + 쿼리 설정
- [ ] 변수 시스템 (서비스, 환경, 시간 범위)
- [ ] 대시보드 템플릿 (AI 서비스, 인프라, Executive)
- [ ] 대시보드 공유 + 임포트/익스포트

### 14-2. SLO 관리 대시보드

- [ ] SLO 정의 (서비스별 TTFT, 에러율, 가용성)
- [ ] 에러 버짓 번다운 차트
- [ ] SLO 준수율 추이 + 위반 이력
- [ ] SLI 자동 계산 (OTel 메트릭 기반)

### 14-3. 비용 분석 뷰

- [ ] 토큰 비용 추적 (모델별, 서비스별, 일별)
- [ ] 인프라 비용 (GPU, 서버, 스토리지)
- [ ] API 호출 비용 (외부 LLM API, 벡터 DB)
- [ ] 비용 예측 + 예산 알림

### 14-4. Investigation Notebook

- [ ] 마크다운 + 차트 + 쿼리 결과 혼합 문서
- [ ] 조사 과정 기록 (장애 분석 시)
- [ ] 팀 공유 + 댓글
- [ ] 저장된 쿼리 라이브러리

### 14-5. Executive 대시보드

- [ ] 경영진용 요약 (전체 시스템 건강도, SLO 준수, 비용)
- [ ] 트렌드 리포트 (주간/월간)
- [ ] PDF 보고서 자동 생성 + 이메일 스케줄 발송

### 14-6. 멀티테넌트 + 고객 포털

- [ ] 테넌트 격리 (데이터, UI, 설정)
- [ ] 고객 전용 포털 (자기 프로젝트만 조회)
- [ ] 테넌트별 과금 데이터
- [ ] White-label 지원 (로고, 색상 커스텀)

### 14-7. 국제화 (i18n)

- [ ] 한국어 / 영어 / 일본어
- [ ] 날짜/시간/숫자 로케일
- [ ] RTL 레이아웃 대비 구조

### 14-8. 성능 최적화 + 접근성 감사

- [ ] Lighthouse 90+ (Performance, Accessibility, Best Practices)
- [ ] Core Web Vitals 최적화 (FCP < 1.5s, LCP < 2.5s)
- [ ] 가상 스크롤 (100K+ 행 테이블)
- [ ] 메모리 릭 감사 + Canvas 최적화
- [ ] WCAG 2.1 AA 준수 감사

---

## 권장 작업 순서 (전체)

```
═══ 기반 구축 (완료) ═══
Phase 1~6: OTel 인프라 + SDK + 대시보드 + Helm + CI/CD  ✅

═══ 검증 & 배포 (수작업) ═══
Phase 7:  E2E 통합 검증         🔧 → TEST_GUIDE.md Level 1~7 참조
Phase 8:  Kubernetes 배포       🔧 → TEST_GUIDE.md Level 8 참조
Phase 9:  SLO 튜닝              🔧 → 1~2주 운영 데이터 필요

═══ 상용 솔루션 UI 재설계 ═══
Phase 10: UI 기반 구축 (4주)     → Next.js, 디자인 시스템, 네비게이션, 프로젝트
Phase 11: APM 코어 UI (4주)     → 서비스맵, XLog, 트레이스, 로그, 메트릭
Phase 12: AI 네이티브 UI (3주)   → LLM, GPU, RAG, Agent, 가드레일
Phase 13: 에이전트 통합 (3주)    → AITOP Agent, 진단 보고서, 인시던트
Phase 14: 고도화 (4주)          → 커스텀 대시보드, SLO, 비용, 멀티테넌트

총 예상 기간: Phase 10~14 = 약 18주 (4.5개월)
```

---

## 문서 현황

| 파일 경로 | 상태 | 비고 |
|-----------|------|------|
| `DOCS/METRICS_DESIGN.md` | ✅ v1.1.0 | 지표 정의 + AITOP 메트릭 매핑 참조 추가 |
| `DOCS/ARCHITECTURE.md` | ✅ v1.1.0 | OTel 아키텍처 + UI/AITOP 참조 추가 |
| `DOCS/UI_DESIGN.md` | ✅ v1.0.0 | **신규** — 통합 모니터링 UI 설계 (상용 솔루션 수준) |
| `DOCS/XLOG_DASHBOARD_REDESIGN.md` | ✅ | XLog/HeatMap 3패널 상세 설계 |
| `DOCS/AI_SERVICE_FLOW.md` | ✅ | AI 서비스 처리 흐름 (초보자용) |
| `DOCS/LOCAL_SETUP.md` | ✅ | 로컬 환경 가이드 |
| `DOCS/TEST_GUIDE.md` | ✅ | 9단계 테스트/운영 가이드 |
| `DOCS/MANUAL_TESTING_GUIDE.md` | ✅ | 수동 테스트 절차 |
| `README.md` | ✅ | 프로젝트 진입점 (DOCS 전체 목록 반영) |

---

*이 파일은 각 작업 세션 종료 시 업데이트한다.*
*`WORK_STATUS.md`를 기준으로 다음 세션 작업을 시작한다.*
