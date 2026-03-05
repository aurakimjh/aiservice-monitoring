# WORK_STATUS.md — 작업 진행 현황 및 TO-DO 마스터 문서

> **프로젝트**: OpenTelemetry 기반 AI 서비스 성능 모니터링 솔루션
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2026-03-05 (Session 5 완료 기준)
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
Phase 1: 기반 설계 문서     [██████████] 100%  ✅
Phase 2: 인프라 설정 파일   [██████████] 100%  ✅
Phase 3: SDK 계측 코드      [██████████] 100%  ✅
Phase 4: Grafana 대시보드   [██████████] 100%  ✅
Phase 5: 통합 테스트 & 검증  [██████████] 100%  ✅  (load-test.py 포함 전체 완성)
Phase 6: 운영 자동화        [██████████] 100%  ✅  (Helm Chart + GitHub Actions 완성)
Phase 7: E2E 통합 검증      [░░░░░░░░░░]   0%  📋  🔧 수작업 (로컬 Docker + 부하 + Trace 검증)
Phase 8: Kubernetes 배포    [░░░░░░░░░░]   0%  📋  🔧 수작업 (Helm 배포 + 스테이징 + 프로덕션)
Phase 9: SLO 튜닝/운영 안정화 [░░░░░░░░░░]   0%  📋  🔧 수작업 (임계치 + 샘플링 + 대시보드)
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

*이 파일은 각 작업 세션 종료 시 업데이트한다.*
*`WORK_STATUS.md`를 기준으로 다음 세션 작업을 시작한다.*
