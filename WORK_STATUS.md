# WORK_STATUS.md — 작업 진행 현황 및 TO-DO 마스터 문서

> **프로젝트**: OpenTelemetry 기반 AI 서비스 성능 모니터링 솔루션
> **경로**: `C:\workspace\aiservice-monitoring`
> **Git 사용자**: Aura Kim `<aura.kimjh@gmail.com>`
> **최종 업데이트**: 2025-03-01 (Session 2 완료 기준)
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

---

## 전체 진행률

```
Phase 1: 기반 설계 문서     [██████████] 100%  ✅
Phase 2: 인프라 설정 파일   [████████░░]  80%  🔄
Phase 3: SDK 계측 코드      [████░░░░░░]  40%  🔄
Phase 4: Grafana 대시보드   [░░░░░░░░░░]   0%  📋
Phase 5: 통합 테스트 & 검증  [░░░░░░░░░░]   0%  📋
Phase 6: 운영 자동화        [░░░░░░░░░░]   0%  📋
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

## 미완료 항목 — Phase 3: SDK 계측 코드

### 3-1. Python Agent 계측 (`sdk-instrumentation/python/agents/`) 📋

#### `langchain_tracer.py` — LangChain/LangGraph OTel 콜백 핸들러
```
파일 위치: sdk-instrumentation/python/agents/langchain_tracer.py
```
- [ ] `OtelCallbackHandler(BaseCallbackHandler)` 클래스 구현
  - `on_chain_start/end` — 체인 단계 Span 생성/종료
  - `on_tool_start/end/error` — 도구 호출 Span (성공/실패 분기)
  - `on_agent_action` — 에이전트 액션 선택 이벤트
  - `on_llm_start/end` — LLM 호출 구간 (LangChain 내부 LLM 직접 사용 시)
- [ ] LangGraph 전용 확장
  - `on_graph_node_start/end` — 노드별 Span 생성
  - `graph.state_transition` — 상태 전환 Counter
  - `agent.recursion_depth` — 재귀 깊이 Histogram (무한 루프 탐지)
- [ ] 수집 메트릭
  - `agent.chain.step.duration_ms` (Histogram, `chain`, `step` 레이블)
  - `agent.tool.call.total` (Counter, `tool`, `success` 레이블)
  - `agent.graph.node.duration_ms` (Histogram, `node_name`)
  - `agent.graph.state_transitions.total` (Counter, `from_node`, `to_node`)
  - `agent.graph.recursion_depth` (Histogram)

#### `external_api_tracer.py` — 외부 API 계측 클라이언트
```
파일 위치: sdk-instrumentation/python/agents/external_api_tracer.py
```
- [ ] `InstrumentedHTTPClient` 클래스 완성본 (METRICS_DESIGN.md 코드를 실제 파일로 분리)
  - `get/post/put/delete` 메서드 전부 구현
  - W3C TraceContext 헤더 자동 주입 (`propagate.inject`)
  - 타임아웃/네트워크 에러 분기 처리
- [ ] Circuit Breaker 연동 (선택)
  - 연속 실패 임계치 초과 시 `circuit_breaker.open` Span 이벤트
- [ ] 수집 메트릭
  - `external_api.request.duration` (Histogram, `service`, `method`, `status_class`)
  - `external_api.error.total` (Counter, `service`, `error_type`)
  - `external_api.timeout.total` (Counter, `service`)

#### `fastapi_streaming.py` — FastAPI SSE/스트리밍 계측
```
파일 위치: sdk-instrumentation/python/agents/fastapi_streaming.py
```
- [ ] `stream_llm_response()` 비동기 제너레이터 (METRICS_DESIGN.md 코드를 실제 파일로 분리)
  - 청크별 inter-chunk 지연 측정
  - 첫 청크 이벤트 (`first_token_received`) 기록
- [ ] SSE(Server-Sent Events) 전용 Span 구조 설계
- [ ] 스트리밍 중단/재연결 이벤트 추적

### 3-2. Python 벡터 DB 계측 (`sdk-instrumentation/python/vector_db/`) 📋

#### `vectordb_instrumentation.py` — 벡터 DB 계측
```
파일 위치: sdk-instrumentation/python/vector_db/vectordb_instrumentation.py
```
- [ ] `InstrumentedVectorDB` 클래스 완성본 (METRICS_DESIGN.md 코드를 실제 파일로 분리)
  - `search()` — 유사도 검색 Span
  - `upsert()` — 인덱싱 Span
  - `delete()` — 삭제 Span
  - `describe_index_stats()` — 인덱스 상태 조회
- [ ] Pinecone / Milvus / Qdrant / ChromaDB 별 어댑터 구현
  - 공통 인터페이스: `InstrumentedVectorDB`
  - 드라이버별 메서드 시그니처 차이 처리
- [ ] Redis Semantic Cache 계측
  - `cached_embed_search()` 함수 (METRICS_DESIGN.md 코드를 실제 파일로 분리)
  - `vectordb.cache.hit.total` / `vectordb.cache.miss.total`
- [ ] 수집 메트릭
  - `vectordb.search.duration` (Histogram, `db`, `index`, `filtered`)
  - `vectordb.search.result_count` (Histogram, `db`, `top_k`)
  - `vectordb.upsert.duration` (Histogram, `db`)
  - `vectordb.cache.hit_rate` (Gauge)

### 3-3. Python 임베딩 계측 📋

#### `embedding_instrumentation.py` 완성본
```
파일 위치: sdk-instrumentation/python/llm/embedding_instrumentation.py
```
- [ ] `@instrument_embedding()` 데코레이터 완성본 (METRICS_DESIGN.md 코드를 실제 파일로 분리)
  - HuggingFace Sentence Transformers 계측
  - OpenAI Embedding API 계측 (httpx auto-instrumentation 보완)
  - 배치 처리 throughput 측정 (tok/s)
- [ ] 수집 메트릭
  - `embedding.request.duration` (Histogram, `model`, `device`)
  - `embedding.batch_size` (Histogram)
  - `embedding.tokens.total` (Counter)
  - `embedding.throughput_tok_per_s` (Gauge)

### 3-4. Node.js 스트리밍 계측 📋

#### `frontend-streaming.js`
```
파일 위치: sdk-instrumentation/nodejs/frontend-streaming.js
```
- [ ] `trackStreamingChunks()` 함수 (METRICS_DESIGN.md 코드를 실제 파일로 분리)
  - inter-chunk 지연 500ms 초과 시 경고 이벤트
  - 총 청크 수, 스트리밍 총 소요 시간 기록
- [ ] Browser RUM(Real User Monitoring) 연동 방안
  - Largest Contentful Paint (LCP) 측정
  - Web Vitals → OTel Metric 변환

---

## 미완료 항목 — Phase 4: Grafana 대시보드

> 우선순위: `Critical` 대시보드부터 순서대로 작성

### 4-1. AI Service Overview Dashboard 📋
```
파일 위치: dashboards/grafana/ai-service-overview.json
```
- [ ] 패널 설계
  - **Row 1 — 시스템 건강도**: E2E 레이턴시 P95, 에러율, 처리량(RPS)
  - **Row 2 — LLM 성능**: TTFT P50/P95/P99 게이지, TPS 시계열
  - **Row 3 — 레이어별 레이턴시 기여도**: 가드레일/에이전트/벡터DB/LLM 스택 차트
  - **Row 4 — 알람 현황**: Alerting 상태 패널
- [ ] SLO 목표선 표시 (Threshold 라인)
- [ ] 시간 범위 변수 (`$__range`)
- [ ] 서비스명 변수 (`$service`) — 다중 서비스 전환

### 4-2. LLM Performance Dashboard 📋
```
파일 위치: dashboards/grafana/llm-performance.json
```
- [ ] 패널 설계
  - **TTFT 분포**: Heatmap (시간 × TTFT 분포)
  - **TPS 추세**: 모델별 시계열 (P50/P95)
  - **ms/token 분포**: Histogram panel
  - **큐 대기 시간**: 시계열 + 색상 임계치
  - **토큰 비용**: prompt_tokens + completion_tokens 누적 영역 차트
  - **동시 요청 수**: 시계열 (vLLM 포화 판단)
- [ ] 모델별 필터 변수 (`$model`)
- [ ] Exemplar 활성화 — 고TTFT 포인트 클릭 → Tempo 트레이스 바로 이동

### 4-3. GPU-LLM Correlation Dashboard 📋
```
파일 위치: dashboards/grafana/gpu-correlation.json
```
- [ ] 패널 설계 (핵심 대시보드 — 장애 예방의 핵심)
  - **VRAM 사용률 vs LLM 큐 대기 (이중 Y축)**: 상관관계 시각화
  - **GPU 가동률 vs TPS**: GPU 효율성 측정
  - **GPU 온도 추세**: 스로틀링 예측선 표시 (85°C)
  - **VRAM OOM 예측 카운트다운**: $T_{OOM}$ 수식 기반 Stat 패널
  - **GPU 전력 소비**: 절전 vs 최대 성능 모드 식별
  - **멀티 GPU 노드 비교**: GPU 인덱스별 열지도
- [ ] GPU 인덱스 변수 (`$gpu`)
- [ ] OOM 예측 임계치 알람 시각화

### 4-4. Guardrail Analysis Dashboard 📋
```
파일 위치: dashboards/grafana/guardrail-analysis.json
```
- [ ] 패널 설계
  - **차단율 시계열**: 정책별 분리 (스택 차트)
  - **위반 유형 분포**: 파이 차트 (jailbreak/pii/toxic/custom)
  - **가드레일 레이턴시 분포**: Histogram (P50/P95/P99)
  - **Re-ask 발생 빈도**: 시계열 (프롬프트 품질 지표)
  - **가드레일 레이턴시 기여도**: E2E 대비 % 단일 스탯
  - **정책별 차단 Top N**: Bar chart (어떤 규칙이 가장 많이 트리거되는지)
- [ ] 정책명 변수 (`$policy`)
- [ ] Loki 연동 — 차단 이벤트 로그 테이블 패널

### 4-5. Agent & External API Dashboard 📋
```
파일 위치: dashboards/grafana/agent-external-api.json
```
- [ ] 패널 설계
  - **외부 API 레이턴시 P99**: 서비스별 Bar gauge
  - **타임아웃 발생 빈도**: 히트맵 (서비스 × 시간대)
  - **에러율 by 서비스**: 시계열
  - **LangChain 체인 단계별 레이턴시**: 워터폴 근사 Bar chart
  - **Tool 호출 성공/실패 비율**: Stat 패널
  - **Agent 재귀 깊이 분포**: Histogram

### 4-6. Service Map (선택) 📋
```
도구: Tempo Service Map (내장) + Grafana Node Graph
```
- [ ] Tempo metrics-generator 설정으로 자동 서비스 맵 생성
- [ ] 서비스 간 레이턴시/에러율 엣지 가중치 표시
- [ ] 클릭 → 해당 서비스 대시보드 이동 링크

---

## 미완료 항목 — Phase 5: 통합 테스트 및 검증

### 5-1. Context Propagation 검증 스크립트 📋
```
파일 위치: scripts/validate-traces.py
```
- [ ] Grafana Tempo API 쿼리로 단절 트레이스 탐색
  - TraceQL: `{span.guardrail.action != ""} && !{span.llm.provider != ""}`
  - 가드레일 Span은 있지만 LLM Span이 없는 트레이스 = 전파 단절
- [ ] 단절 발생 시 CLI 리포트 출력
- [ ] CI 파이프라인 통합 (GitHub Actions 선택)

### 5-2. E2E 부하 테스트 시나리오 📋
```
파일 위치: scripts/load-test.py
```
- [ ] Locust 기반 시나리오 작성
  - 정상 트래픽: 10 RPS 기준선
  - 가드레일 부하: 악의적 입력 20% 혼합
  - LLM 과부하: 동시 100 요청 (GPU 포화 시뮬레이션)
  - 외부 API 지연: Serper API Mock 5초 지연 주입
- [ ] 부하 테스트 중 Prometheus 지표 자동 캡처
- [ ] 테스트 결과 리포트 자동 생성

### 5-3. Sampling 비율 시뮬레이션 📋
```
파일 위치: scripts/benchmark-sampling.py
```
- [ ] 실제 트래픽 분포 기반 Tail Sampling 정책 시뮬레이션
- [ ] 정책별 보존율 계산 및 비용 추정
- [ ] 최적 `decision_wait` 값 도출

### 5-4. Alert Rule 검증 📋
```
파일 위치: scripts/test-alerts.sh
```
- [ ] `promtool test rules` 를 활용한 Alert Rule 단위 테스트
  - TTFT_High: 5분 고지연 시나리오
  - GPU_VRAM_Critical: VRAM 92% 도달 시나리오
  - Guardrail_Block_Rate_High: 차단율 10% 초과 시나리오
- [ ] 알람 채널 연동 테스트 (Slack Webhook 또는 Email)

---

## 미완료 항목 — Phase 6: 운영 자동화

### 6-1. Kubernetes 프로덕션 배포 완성 📋

#### `infra/kubernetes/namespace-rbac.yaml`
- [ ] Namespace `monitoring` 생성
- [ ] OTel Collector ServiceAccount + ClusterRole + ClusterRoleBinding
- [ ] AI Inference 네임스페이스 접근 권한

#### `infra/kubernetes/otelcol-agent-daemonset.yaml`
- [ ] Agent DaemonSet 완성본 (ARCHITECTURE.md 코드를 실제 파일로 분리)
  - GPU 노드 Toleration 설정
  - `KUBE_NODE_NAME` 환경변수 주입 (FieldRef)
  - 리소스 requests/limits (cpu: 100m/500m, memory: 256Mi/512Mi)
  - LivenessProbe + ReadinessProbe

#### `infra/kubernetes/otelcol-gateway-deployment.yaml`
- [ ] Gateway Deployment 완성본 (ARCHITECTURE.md 코드를 실제 파일로 분리)
  - PodAntiAffinity (다중 노드 분산)
  - HPA (min: 3, max: 10, CPU 70% + Memory 75% 트리거)

#### `infra/kubernetes/prometheus-servicemonitor.yaml`
- [ ] Prometheus Operator ServiceMonitor 정의
  - OTel Collector (Agent + Gateway) 메트릭 자동 스크레이프
  - DCGM Exporter 스크레이프
  - vLLM Pod 애노테이션 기반 스크레이프

### 6-2. Helm Chart 패키징 (선택) 💡
```
파일 위치: helm/aiservice-monitoring/
```
- [ ] `Chart.yaml`, `values.yaml` 작성
- [ ] 서브차트: otel-collector, prometheus, grafana, tempo, loki
- [ ] Values 오버라이드로 환경별 배포 (dev/staging/prod)

### 6-3. GitHub Actions CI/CD 파이프라인 (선택) 💡
```
파일 위치: .github/workflows/
```
- [ ] `lint.yaml` — YAML 검증 (yamllint), Python 린트 (ruff)
- [ ] `validate-collector.yaml` — otelcol validate 명령 실행
- [ ] `test-alerts.yaml` — promtool test rules 실행
- [ ] `validate-traces.yaml` — Context Propagation 단절 탐지

---

## 미완료 항목 — Phase 2 잔여: 인프라 설정 보완

### 2-1. Kubernetes 추가 매니페스트 📋

#### `infra/kubernetes/otelcol-agent-daemonset.yaml` (독립 파일)
- [ ] 현재 `otelcol-configmap.yaml` 내 인라인으로 작성된 내용을 독립 파일로 분리
- [ ] 실제 배포 가능한 완성 YAML (이미지 태그 고정, 리소스 설정 포함)

#### `infra/kubernetes/otelcol-gateway-deployment.yaml` (독립 파일)
- [ ] Deployment + HPA YAML 독립 파일 분리

### 2-2. Collector Pipelines 문서화 📋
```
파일 위치: collector/pipelines/traces-pipeline.md, metrics-pipeline.md
```
- [ ] 각 파이프라인의 데이터 흐름을 ASCII 다이어그램으로 문서화
- [ ] Processor 적용 순서와 이유 설명 (교육용)

---

## 파일 현황 요약

| 파일 경로 | 상태 | 라인 수 | 비고 |
|-----------|------|---------|------|
| `DOCS/METRICS_DESIGN.md` | ✅ | 1,369 | 지표 정의 전체 완성 |
| `DOCS/ARCHITECTURE.md` | ✅ | 1,429 | 아키텍처 설계 전체 완성 |
| `README.md` | ✅ | 218 | 프로젝트 진입점 |
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
| `infra/kubernetes/namespace-rbac.yaml` | 📋 | — | **미작성** |
| `infra/kubernetes/otelcol-agent-daemonset.yaml` | 📋 | — | **미작성** |
| `infra/kubernetes/otelcol-gateway-deployment.yaml` | 📋 | — | **미작성** |
| `infra/kubernetes/prometheus-servicemonitor.yaml` | 📋 | — | **미작성** |
| `sdk-instrumentation/python/otel_setup.py` | ✅ | 127 | 공통 초기화 |
| `sdk-instrumentation/python/guardrails/nemo_instrumentation.py` | ✅ | 129 | 가드레일 데코레이터 |
| `sdk-instrumentation/python/llm/vllm_instrumentation.py` | ✅ | 152 | TTFT/TPS 계측 |
| `sdk-instrumentation/python/llm/embedding_instrumentation.py` | 📋 | — | **미작성** |
| `sdk-instrumentation/python/agents/langchain_tracer.py` | 📋 | — | **미작성** |
| `sdk-instrumentation/python/agents/external_api_tracer.py` | 📋 | — | **미작성** |
| `sdk-instrumentation/python/agents/fastapi_streaming.py` | 📋 | — | **미작성** |
| `sdk-instrumentation/python/vector_db/vectordb_instrumentation.py` | 📋 | — | **미작성** |
| `sdk-instrumentation/nodejs/otel-setup.js` | ✅ | 71 | Node.js 초기화 |
| `sdk-instrumentation/nodejs/frontend-streaming.js` | 📋 | — | **미작성** |
| `sdk-instrumentation/go/otel_setup.go` | ✅ | 119 | Go 초기화 |
| `dashboards/grafana/ai-service-overview.json` | 📋 | — | **미작성** |
| `dashboards/grafana/llm-performance.json` | 📋 | — | **미작성** |
| `dashboards/grafana/gpu-correlation.json` | 📋 | — | **미작성** |
| `dashboards/grafana/guardrail-analysis.json` | 📋 | — | **미작성** |
| `dashboards/grafana/agent-external-api.json` | 📋 | — | **미작성** |
| `scripts/validate-traces.py` | 📋 | — | **미작성** |
| `scripts/load-test.py` | 📋 | — | **미작성** |
| `scripts/benchmark-sampling.py` | 📋 | — | **미작성** |
| `scripts/test-alerts.sh` | 📋 | — | **미작성** |

---

## 권장 작업 순서 (Next Session 기준)

```
Session 3 권장 작업 (Python 에이전트 계측 완성):
  1. sdk-instrumentation/python/agents/langchain_tracer.py
  2. sdk-instrumentation/python/agents/external_api_tracer.py
  3. sdk-instrumentation/python/agents/fastapi_streaming.py
  4. sdk-instrumentation/python/llm/embedding_instrumentation.py
  5. sdk-instrumentation/python/vector_db/vectordb_instrumentation.py

Session 4 권장 작업 (Grafana 대시보드):
  1. dashboards/grafana/gpu-correlation.json          ← 가장 임팩트 큼
  2. dashboards/grafana/llm-performance.json
  3. dashboards/grafana/guardrail-analysis.json
  4. dashboards/grafana/ai-service-overview.json
  5. dashboards/grafana/agent-external-api.json

Session 5 권장 작업 (K8s 프로덕션 + 검증):
  1. infra/kubernetes/namespace-rbac.yaml
  2. infra/kubernetes/otelcol-agent-daemonset.yaml
  3. infra/kubernetes/otelcol-gateway-deployment.yaml
  4. infra/kubernetes/prometheus-servicemonitor.yaml
  5. scripts/validate-traces.py
  6. scripts/test-alerts.sh
```

---

## Git 히스토리

| 커밋 해시 | 메시지 | 포함 파일 수 |
|-----------|--------|------------|
| `2aa54f4` | feat: initialize AI service monitoring project structure | 24 |
| `54bd888` | feat: add OTel architecture, collector configs, infra, and SDK instrumentation | 18 |

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
