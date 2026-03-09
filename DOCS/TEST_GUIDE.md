# 테스트 & 운영 검증 가이드 (TEST_GUIDE.md)

> **프로젝트**: OpenTelemetry 기반 AI 서비스 성능 모니터링 솔루션
> **대상 독자**: 처음 이 프로젝트를 검증하는 초보자, QA, SRE
> **최종 업데이트**: 2026-03-05
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`

이 문서는 **모니터링 솔루션 자체가 올바르게 동작하는지** 검증하는 가이드입니다.
AI 서비스 코드가 없어도, 이 문서만 따라 하면 전체 파이프라인을 테스트할 수 있습니다.

---

## 목차

1. [테스트 전 준비사항](#1-테스트-전-준비사항)
2. [Level 1: 로컬 인프라 기동 테스트](#2-level-1-로컬-인프라-기동-테스트)
3. [Level 2: 텔레메트리 발생 & 수신 확인](#3-level-2-텔레메트리-발생--수신-확인)
4. [Level 3: Grafana 대시보드 표시 확인](#4-level-3-grafana-대시보드-표시-확인)
5. [Level 4: Alert Rule 검증](#5-level-4-alert-rule-검증)
6. [Level 5: 부하 테스트 (Load Test)](#6-level-5-부하-테스트-load-test)
7. [Level 6: Context Propagation 단절 탐지](#7-level-6-context-propagation-단절-탐지)
8. [Level 7: Sampling 비용 시뮬레이션](#8-level-7-sampling-비용-시뮬레이션)
9. [Level 8: Helm Chart Dry-Run 검증](#9-level-8-helm-chart-dry-run-검증)
10. [Level 9: CI/CD 파이프라인 로컬 실행](#10-level-9-cicd-파이프라인-로컬-실행)
11. [테스트 체크리스트 (종합)](#11-테스트-체크리스트-종합)
12. [자주 발생하는 문제 (FAQ)](#12-자주-발생하는-문제-faq)

---

## 1. 테스트 전 준비사항

### 1-1. 필수 소프트웨어

아래 도구가 설치되어 있어야 합니다. **설치 방법은 `DOCS/LOCAL_SETUP.md`를 참고**하세요.

| 도구 | 최소 버전 | 확인 명령어 | 용도 |
|------|-----------|------------|------|
| Docker Desktop | 4.30+ | `docker --version` | 로컬 인프라 스택 |
| Docker Compose | v2.x | `docker compose version` | 서비스 오케스트레이션 |
| Python | 3.10+ | `python --version` | 테스트 스크립트 실행 |
| pip | 최신 | `pip --version` | Python 패키지 설치 |
| curl | 기본 | `curl --version` | API 호출 테스트 |
| Git Bash (Windows) | — | — | 쉘 환경 |

> **Windows 사용자**: 모든 명령어는 **Git Bash** 기준입니다.
> PowerShell에서 실행하면 경로 문제가 발생할 수 있습니다.

### 1-2. Python 의존성 설치

```bash
cd /c/workspace/aiservice-monitoring

# 가상환경 생성 (최초 1회)
python -m venv .venv

# 활성화
source .venv/bin/activate      # Git Bash / Linux / macOS
# .venv\Scripts\activate       # Windows CMD
# .venv\Scripts\Activate.ps1   # PowerShell

# 테스트에 필요한 패키지 설치
pip install --upgrade pip
pip install \
  opentelemetry-sdk \
  opentelemetry-api \
  opentelemetry-exporter-otlp-proto-grpc \
  opentelemetry-instrumentation-fastapi \
  httpx \
  locust \
  tabulate
```

### 1-3. 프로젝트 클론 (처음인 경우)

```bash
git clone https://github.com/aura-kimjh/aiservice-monitoring.git /c/workspace/aiservice-monitoring
cd /c/workspace/aiservice-monitoring
```

### 1-4. 테스트 레벨 안내

테스트는 **Level 1부터 순서대로** 진행합니다. 이전 Level이 통과해야 다음 Level을 테스트할 수 있습니다.

```
Level 1: 인프라 기동           ← Docker만 있으면 가능 (5분)
Level 2: 텔레메트리 수신       ← Python SDK 필요 (10분)
Level 3: 대시보드 표시         ← 브라우저만 필요 (5분)
Level 4: Alert Rule 검증       ← bash + promtool (5분)
Level 5: 부하 테스트           ← Python + locust (15분)
Level 6: 트레이스 단절 탐지    ← Python + httpx (10분)
Level 7: 비용 시뮬레이션       ← Python + tabulate (5분)
Level 8: Helm Dry-Run          ← helm CLI 필요 (10분)
Level 9: CI 로컬 실행          ← act CLI 선택 (15분)
```

---

## 2. Level 1: 로컬 인프라 기동 테스트

> **목표**: Docker Compose로 모니터링 스택 6개 서비스가 정상 기동되는지 확인

### 왜 이 테스트가 필요한가?

모니터링의 가장 기본은 **모니터링 도구 자체가 동작하는 것**입니다.
건물의 화재 경보기가 고장나 있으면 화재를 감지할 수 없듯이,
모니터링 스택이 가동되지 않으면 어떤 성능 문제도 발견할 수 없습니다.
이 테스트는 6개 핵심 서비스가 모두 정상 동작하는지 확인하는 기초 체크입니다.

### 이 테스트가 실패하면?

- **포트 충돌**: 이미 다른 프로그램이 같은 포트를 사용 중일 수 있습니다.
  `netstat -ano | findstr :4317` 명령으로 점유 프로세스를 확인하세요.
- **Docker 미실행**: Docker Desktop이 실행 중인지 확인하세요.
- **메모리 부족**: 6개 서비스를 동시에 띄우려면 최소 4GB 여유 메모리가 필요합니다.
  Docker Desktop → Settings → Resources에서 메모리 할당을 확인하세요.

### Step 1: 스택 시작

```bash
cd /c/workspace/aiservice-monitoring

# 전체 스택 백그라운드 실행
docker compose -f infra/docker/docker-compose.yaml up -d
```

### Step 2: 기동 상태 확인 (30초 대기 후)

```bash
# 모든 컨테이너가 "Up" 또는 "healthy" 상태인지 확인
docker compose -f infra/docker/docker-compose.yaml ps
```

**기대 출력**:
```
NAME              STATUS          PORTS
otel-collector    Up (healthy)    0.0.0.0:4317->4317/tcp, 0.0.0.0:4318->4318/tcp
prometheus        Up              0.0.0.0:9090->9090/tcp
tempo             Up              0.0.0.0:3200->3200/tcp
loki              Up              0.0.0.0:3100->3100/tcp
grafana           Up              0.0.0.0:3000->3000/tcp
jaeger            Up              0.0.0.0:16686->16686/tcp
```

> **6개 서비스가 모두 `Up`이면 PASS**입니다.

### Step 3: 개별 헬스체크

```bash
# OTel Collector 헬스
curl -s http://localhost:13133/health
# 기대: {"status":"Server available","..."}

# Prometheus 준비 상태
curl -s http://localhost:9090/-/ready
# 기대: "Prometheus Server is Ready."

# Grafana 헬스
curl -s http://localhost:3000/api/health
# 기대: {"commit":"...","database":"ok","version":"..."}

# Tempo 준비 상태
curl -s http://localhost:3200/ready
# 기대: "ready" 또는 HTTP 200

# Loki 준비 상태
curl -s http://localhost:3100/ready
# 기대: "ready" 또는 HTTP 200

# Jaeger 헬스
curl -s http://localhost:16686/
# 기대: HTML 페이지 (Jaeger UI)
```

### Step 4: 결과 판정

| 항목 | 확인 방법 | PASS 조건 |
|------|-----------|----------|
| OTel Collector | `curl localhost:13133/health` | `Server available` |
| Prometheus | `curl localhost:9090/-/ready` | `Ready` |
| Grafana | `curl localhost:3000/api/health` | `database: ok` |
| Tempo | `curl localhost:3200/ready` | HTTP 200 |
| Loki | `curl localhost:3100/ready` | HTTP 200 |
| Jaeger | 브라우저 `localhost:16686` | UI 표시 |

**모든 항목 PASS → Level 1 완료**

### 문제 발생 시

```bash
# 특정 서비스 로그 확인
docker compose -f infra/docker/docker-compose.yaml logs otel-collector --tail=50
docker compose -f infra/docker/docker-compose.yaml logs prometheus --tail=50

# 포트 충돌 확인 (Windows)
netstat -ano | findstr :4317
# Git Bash
ss -tlnp 2>/dev/null | grep 4317 || netstat -tlnp 2>/dev/null | grep 4317

# 완전 재시작 (데이터 초기화)
docker compose -f infra/docker/docker-compose.yaml down -v
docker compose -f infra/docker/docker-compose.yaml up -d
```

---

## 3. Level 2: 텔레메트리 발생 & 수신 확인

> **목표**: Python SDK로 테스트 Span/Metric을 생성하고, Collector가 수신하는지 확인
> **전제 조건**: Level 1 완료 (인프라 스택 가동 중)

### 왜 이 테스트가 필요한가?

인프라 서비스가 떠 있어도, 실제 데이터가 **수집되는지**는 별개의 문제입니다.
도로가 깔려 있어도 차가 실제로 달릴 수 있는지 테스트하는 것과 같습니다.
SDK → Collector → 저장소(Jaeger/Prometheus)까지 데이터가 흘러가는지 확인합니다.

### 이 테스트가 실패하면?

- **트레이스가 전송되지 않음**: OTel Collector의 gRPC 엔드포인트(4317)에 접근 가능한지 확인하세요.
- **Jaeger에 서비스가 안 보임**: Collector 로그에서 exporter 오류를 확인하세요. 전송 후 10-30초 대기가 필요합니다(batch processor 버퍼).
- **Prometheus 메트릭이 0**: Collector의 Prometheus exporter(8889 포트)가 정상 동작하는지 확인하세요.

### Step 1: 테스트 트레이스 발생

```bash
cd /c/workspace/aiservice-monitoring
source .venv/bin/activate

python -c "
import time, os
os.environ['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://localhost:4317'
os.environ['OTEL_EXPORTER_OTLP_INSECURE'] = 'true'

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource

# Provider 설정
resource = Resource.create({
    'service.name': 'test-guide-service',
    'deployment.environment': 'test'
})
provider = TracerProvider(resource=resource)
exporter = OTLPSpanExporter(endpoint='http://localhost:4317', insecure=True)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer('test-guide')

# 테스트 Span 생성 (부모-자식 관계)
with tracer.start_as_current_span('test-request') as parent:
    parent.set_attribute('http.method', 'GET')
    parent.set_attribute('http.url', '/api/test')

    with tracer.start_as_current_span('test-llm-call') as child:
        child.set_attribute('llm.model', 'test-model')
        child.set_attribute('llm.ttft_ms', 150)
        time.sleep(0.1)  # 100ms 시뮬레이션

    with tracer.start_as_current_span('test-guardrail') as child:
        child.set_attribute('guardrail.action', 'PASS')
        child.set_attribute('guardrail.policy', 'input_safety')
        time.sleep(0.05)

# Flush (전송 보장)
provider.force_flush()
provider.shutdown()
print('✅ 테스트 트레이스 전송 완료')
"
```

### Step 2: Jaeger에서 트레이스 확인

1. 브라우저에서 **http://localhost:16686** 접속
2. 좌측 **Service** 드롭다운에서 `test-guide-service` 선택
3. **Find Traces** 클릭
4. 트레이스 1개가 표시되면 클릭

**확인 사항**:
- [x] `test-request` 부모 Span이 보이는가?
- [x] `test-llm-call`, `test-guardrail` 자식 Span이 보이는가?
- [x] 각 Span에 설정한 Attribute가 표시되는가? (`llm.model`, `guardrail.action` 등)

### Step 3: Prometheus에서 Collector 내부 메트릭 확인

```bash
# OTel Collector가 수신한 Span 수 확인
curl -s 'http://localhost:9090/api/v1/query?query=otelcol_receiver_accepted_spans_total' | \
  python -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('data', {}).get('result', [])
if results:
    for r in results:
        print(f'  수신 Span 수: {r[\"value\"][1]}  (receiver: {r[\"metric\"].get(\"receiver\", \"unknown\")})')
    print('✅ Collector가 Span을 수신하고 있습니다')
else:
    print('⚠️  아직 메트릭이 수집되지 않았습니다. 1분 후 재시도하세요.')
"
```

### Step 4: 결과 판정

| 항목 | PASS 조건 |
|------|----------|
| 스크립트 실행 | `✅ 테스트 트레이스 전송 완료` 출력 |
| Jaeger | `test-guide-service` 트레이스가 Span 3개와 함께 표시 |
| Prometheus | `otelcol_receiver_accepted_spans_total` > 0 |

**모든 항목 PASS → Level 2 완료**

---

## 4. Level 3: Grafana 대시보드 표시 확인

> **목표**: Grafana에 5개 대시보드가 프로비저닝되어 있는지 확인
> **전제 조건**: Level 1 완료

### 왜 이 테스트가 필요한가?

대시보드는 수집된 데이터를 **눈으로 볼 수 있게** 해주는 핵심 UI입니다.
데이터가 수집되어도 대시보드가 없으면 활용할 수 없습니다.
5개 대시보드와 3개 데이터소스가 올바르게 연결되었는지 확인합니다.

### 이 테스트가 실패하면?

- **대시보드가 안 보임**: Grafana 컨테이너가 dashboard JSON 파일을 올바르게 마운트했는지 확인하세요. `docker compose logs grafana --tail=30`으로 프로비저닝 오류를 확인할 수 있습니다.
- **데이터소스 연결 실패**: Grafana 내 Data sources에서 각 소스의 URL이 올바른지 확인하세요 (Prometheus: `http://prometheus:9090`, Tempo: `http://tempo:3200`, Loki: `http://loki:3100`).
- **대시보드에 "No Data" 표시**: 정상입니다. 아직 실제 AI 서비스가 연결되지 않았기 때문입니다. 데이터소스 연결만 정상이면 PASS입니다.

### Step 1: Grafana 접속

1. 브라우저에서 **http://localhost:3000** 접속
2. 로그인: ID `admin`, PW `admin`
3. (첫 접속 시 비밀번호 변경 요청 → Skip 가능)

### Step 2: 대시보드 존재 확인

좌측 메뉴 → **Dashboards** 클릭

아래 5개 대시보드가 보여야 합니다:

| # | 대시보드 이름 | 설명 |
|---|-------------|------|
| 1 | AI Service Overview | Executive KPI 8개 + 레이어별 기여도 |
| 2 | LLM Performance | TTFT/TPS/토큰 비용/큐 대기 |
| 3 | GPU Correlation | VRAM vs 큐 대기 이중 Y축, OOM 예측 |
| 4 | Guardrail Analysis | 차단율/위반 유형/레이턴시/Loki 로그 |
| 5 | Agent & External API | Tool 성공률/P99/재귀 깊이 |

### Step 3: 데이터소스 연결 확인

좌측 메뉴 → **Connections** → **Data sources**

| 데이터소스 | Type | 상태 |
|-----------|------|------|
| Prometheus | Prometheus | `Data source is working` |
| Tempo | Tempo | `Data source is working` |
| Loki | Loki | `Data source is working` |

각 데이터소스의 **Test** 버튼을 클릭하여 연결 상태를 확인합니다.

### Step 4: API로 확인 (CLI 선호 시)

```bash
# 대시보드 목록 API
curl -s http://admin:admin@localhost:3000/api/search | \
  python -c "
import sys, json
dashboards = json.load(sys.stdin)
print(f'등록된 대시보드 수: {len(dashboards)}')
for d in dashboards:
    print(f'  - {d[\"title\"]}  (uid: {d.get(\"uid\", \"N/A\")})')
if len(dashboards) >= 5:
    print('✅ 대시보드 5개 이상 등록됨')
else:
    print('⚠️  대시보드가 부족합니다. Grafana 프로비저닝 로그를 확인하세요.')
"

# 데이터소스 확인
curl -s http://admin:admin@localhost:3000/api/datasources | \
  python -c "
import sys, json
ds_list = json.load(sys.stdin)
print(f'등록된 데이터소스 수: {len(ds_list)}')
for ds in ds_list:
    print(f'  - {ds[\"name\"]} ({ds[\"type\"]})')
"
```

### Step 5: 결과 판정

| 항목 | PASS 조건 |
|------|----------|
| 대시보드 수 | 5개 이상 |
| 데이터소스 | Prometheus, Tempo, Loki 모두 `working` |

**모든 항목 PASS → Level 3 완료**

---

## 5. Level 4: Alert Rule 검증

> **목표**: Prometheus Alert Rule 9개가 올바르게 정의되어 있는지 검증
> **전제 조건**: Level 1 완료

### 방법 A: test-alerts.sh 스크립트 실행 (권장)

```bash
cd /c/workspace/aiservice-monitoring

# 실행 권한 부여
chmod +x scripts/test-alerts.sh

# 실행
bash scripts/test-alerts.sh
```

**기대 출력**:
```
========================================================
  AI Service Alert Rule 검증
  Rules: .../infra/docker/prometheus-rules.yaml
========================================================

── 1. YAML 문법 검증 ───────────────────────────────────
  ✅ PASS: prometheus-rules.yaml 문법 정상

── 2. 필수 Alert Rule 존재 확인 ────────────────────────
  ✅ PASS: Alert 존재: LLM_TTFT_High
  ✅ PASS: Alert 존재: LLM_TPS_Low
  ... (9개 모두 PASS)

── 3. 임계치 값 검증 ───────────────────────────────────
  ✅ PASS: TTFT 임계치 3000ms
  ... (6개 모두 PASS)

── 4. for 절 (알람 지속 시간) 검증 ────────────────────
  ... (3개 모두 PASS)

── 5. severity 레이블 검증 ─────────────────────────────
  ... (9개 모두 PASS)

========================================================
  검증 결과
  PASS: 27  FAIL: 0
  상태: PASS
========================================================
```

> **FAIL: 0이면 Level 4 PASS**입니다.

### 방법 B: promtool로 직접 검증 (promtool 설치된 경우)

```bash
# promtool 설치 확인
promtool --version

# YAML 문법 검증
promtool check rules infra/docker/prometheus-rules.yaml
```

### 방법 C: 수동 확인 (도구 없는 경우)

`infra/docker/prometheus-rules.yaml` 파일을 열어 아래 9개 Alert가 존재하는지 확인합니다:

1. `LLM_TTFT_High` (severity: critical, > 3000, for: 5m)
2. `LLM_TPS_Low` (severity: warning, < 15, for: 5m)
3. `LLM_Queue_Backlog` (severity: critical, > 5000, for: 3m)
4. `GPU_VRAM_Critical` (severity: critical, > 90, for: 2m)
5. `GPU_Temperature_High` (severity: warning, > 85, for: 5m)
6. `Guardrail_Block_Rate_High` (severity: warning, > 10, for: 3m)
7. `Guardrail_Latency_High` (severity: warning, > 1500, for: 3m)
8. `ExternalAPI_Timeout_Rate_High` (severity: warning, > 5, for: 5m)
9. `VectorDB_Search_Slow` (severity: warning, > 800, for: 5m)

---

## 6. Level 5: 부하 테스트 (Load Test)

> **목표**: Locust 기반 부하 테스트 스크립트가 정상 실행되는지 확인
> **전제 조건**: Level 1 완료 + Python 환경 + locust 설치
> **주의**: 이 테스트는 **실제 AI 서비스가 실행 중일 때** 의미 있습니다.
> 서비스가 없으면 스크립트 구문 검증만 수행합니다.

### Step 1: Locust 설치 확인

```bash
source .venv/bin/activate
pip install locust
locust --version
# 기대: locust 2.x.x
```

### Step 2: 스크립트 구문 검증 (서비스 없이)

```bash
# Python 구문 오류 확인
python -c "import ast; ast.parse(open('scripts/load-test.py').read()); print('✅ 구문 검증 PASS')"
```

### Step 3: Locust Web UI로 테스트 (서비스 있을 때)

```bash
# Locust Web UI 실행
locust -f scripts/load-test.py --host http://localhost:8000

# 브라우저에서 http://localhost:8089 접속
# Users: 10, Spawn rate: 2 입력 후 Start 클릭
```

> **서비스가 없는 경우**: Step 2의 구문 검증만 PASS이면 Level 5 통과로 간주합니다.

### Step 4: 부하 테스트 시나리오 설명

| 시나리오 | 클래스명 | 설명 |
|---------|---------|------|
| 정상 트래픽 | `NormalTrafficUser` | 채팅 70%, 임베딩 20%, 헬스체크 10% |
| 가드레일 스트레스 | `GuardrailStressUser` | 악성 입력 20% 혼합 |
| LLM 과부하 | `LLMOverloadUser` | 동시 100 요청, 긴 컨텍스트 |
| 외부 API 지연 | `ExternalAPIDelayUser` | Circuit Breaker 동작 검증 |

---

## 7. Level 6: Context Propagation 단절 탐지

> **목표**: validate-traces.py 스크립트가 정상 동작하는지 확인
> **전제 조건**: Level 1 완료 + Level 2 완료 (트레이스 데이터 존재)

### Step 1: 스크립트 구문 검증

```bash
python -c "import ast; ast.parse(open('scripts/validate-traces.py').read()); print('✅ 구문 검증 PASS')"
```

### Step 2: 실행 (Tempo 연동)

```bash
python scripts/validate-traces.py \
  --tempo-url http://localhost:3200 \
  --hours 1
```

> **참고**: Level 2에서 전송한 테스트 트레이스가 있어야 결과가 나옵니다.
> 트레이스가 없으면 "0개 트레이스 분석됨"으로 표시될 수 있습니다 — 이것은 정상입니다.

### Step 3: CI용 실행 (실패 시 exit 1)

```bash
python scripts/validate-traces.py \
  --tempo-url http://localhost:3200 \
  --hours 1 \
  --fail-on-broken
```

---

## 8. Level 7: Sampling 비용 시뮬레이션

> **목표**: Tail Sampling 정책별 비용 시뮬레이션 스크립트 실행
> **전제 조건**: Python 환경 + tabulate 설치

### Step 1: 실행

```bash
pip install tabulate

python scripts/benchmark-sampling.py
```

**기대 출력 (예시)**:
```
┌──────────────────────┬──────────────┬──────────────┬──────────────┐
│ 정책                  │ 보존율 (%)   │ 월간 트레이스 │ 월간 비용 ($) │
├──────────────────────┼──────────────┼──────────────┼──────────────┤
│ 전량 수집 (100%)      │ 100.0        │ 2,592,000    │ $415.00      │
│ Head-based 5%         │ 5.0          │ 129,600      │ $20.75       │
│ Tail Sampling (추천)  │ 19.3         │ 500,256      │ $80.04       │
│ ...                   │              │              │              │
└──────────────────────┴──────────────┴──────────────┴──────────────┘
```

### Step 2: CSV 내보내기

```bash
python scripts/benchmark-sampling.py --export-csv sampling-results.csv
cat sampling-results.csv
```

---

## 9. Level 8: Helm Chart Dry-Run 검증

> **목표**: Helm Chart 템플릿이 유효한 YAML을 렌더링하는지 확인
> **전제 조건**: helm CLI 설치

### Step 1: Helm 설치 확인

```bash
helm version
# 기대: version.BuildInfo{Version:"v3.x.x", ...}
```

설치가 안 되어 있다면:
```bash
# Windows (Chocolatey)
choco install kubernetes-helm

# macOS (Homebrew)
brew install helm

# Linux (snap)
snap install helm --classic
```

### Step 2: 서브차트 의존성 다운로드 (최초 1회)

```bash
# Helm 서브차트 다운로드 (인터넷 연결 필요)
helm dependency update helm/aiservice-monitoring/
```

> 이 단계를 건너뛰면 Step 3~4에서 의존성 오류가 발생합니다.

### Step 3: Chart Lint (문법 검증)

```bash
helm lint helm/aiservice-monitoring/
```

**기대 출력**:
```
==> Linting helm/aiservice-monitoring/
[INFO] Chart.yaml: icon is recommended
1 chart(s) linted, 0 chart(s) failed
```

> `0 chart(s) failed`이면 PASS

### Step 3: Template Dry-Run (렌더링 검증)

```bash
# 기본값으로 렌더링
helm template test-release helm/aiservice-monitoring/ \
  --debug 2>&1 | head -100

# dev 환경으로 렌더링
helm template test-release helm/aiservice-monitoring/ \
  -f helm/aiservice-monitoring/values-dev.yaml \
  --debug 2>&1 | head -100

# prod 환경으로 렌더링
helm template test-release helm/aiservice-monitoring/ \
  -f helm/aiservice-monitoring/values-prod.yaml \
  --debug 2>&1 | head -100
```

> 렌더링 오류 없이 YAML이 출력되면 PASS

### Step 4: 특정 템플릿만 렌더링

```bash
# RBAC 템플릿만
helm template test-release helm/aiservice-monitoring/ \
  -s templates/rbac.yaml

# ServiceMonitor만
helm template test-release helm/aiservice-monitoring/ \
  -s templates/servicemonitor.yaml

# PrometheusRule만
helm template test-release helm/aiservice-monitoring/ \
  -s templates/prometheus-rules.yaml
```

### Step 5: 결과 판정

| 항목 | PASS 조건 |
|------|----------|
| `helm lint` | `0 chart(s) failed` |
| 기본 렌더링 | YAML 에러 없음 |
| dev 렌더링 | YAML 에러 없음 |
| prod 렌더링 | YAML 에러 없음 |

---

## 10. Level 9: CI/CD 파이프라인 로컬 실행

> **목표**: GitHub Actions 워크플로우를 로컬에서 실행하여 검증
> **전제 조건**: `act` CLI 설치 (선택) 또는 수동 실행

### 방법 A: act CLI로 로컬 실행 (선택)

[act](https://github.com/nektos/act)를 사용하면 GitHub Actions를 로컬에서 실행할 수 있습니다.

```bash
# act 설치
# Windows (Chocolatey)
choco install act-cli

# macOS (Homebrew)
brew install act

# 워크플로우 실행
cd /c/workspace/aiservice-monitoring

# lint 워크플로우
act -W .github/workflows/lint.yaml --job yamllint

# test-alerts 워크플로우
act -W .github/workflows/test-alerts.yaml
```

### 방법 B: 수동으로 CI 단계 실행 (act 없이)

#### YAML Lint

```bash
pip install yamllint

yamllint -d relaxed collector/config/
yamllint -d relaxed infra/kubernetes/
yamllint -d relaxed infra/docker/
yamllint -d relaxed helm/aiservice-monitoring/values.yaml
yamllint -d relaxed helm/aiservice-monitoring/values-dev.yaml
yamllint -d relaxed helm/aiservice-monitoring/values-prod.yaml
```

#### Python Lint

```bash
pip install ruff

ruff check sdk-instrumentation/python/
ruff check scripts/*.py
```

#### Helm Lint

```bash
helm lint helm/aiservice-monitoring/
```

---

## 11. 테스트 체크리스트 (종합)

아래 체크리스트를 복사하여 테스트 결과를 기록하세요.

```
테스트 일자: ____-__-__
테스트 담당자: ____________
테스트 환경: Docker Desktop v____  /  Python v____

[ ] Level 1: 로컬 인프라 기동
    [ ] OTel Collector healthy
    [ ] Prometheus ready
    [ ] Grafana healthy
    [ ] Tempo ready
    [ ] Loki ready
    [ ] Jaeger UI 접속

[ ] Level 2: 텔레메트리 수신
    [ ] 테스트 트레이스 전송 완료
    [ ] Jaeger에서 test-guide-service 트레이스 확인
    [ ] Prometheus otelcol_receiver_accepted_spans_total > 0

[ ] Level 3: Grafana 대시보드
    [ ] 5개 대시보드 존재
    [ ] 3개 데이터소스 연결 정상 (Prometheus, Tempo, Loki)

[ ] Level 4: Alert Rule 검증
    [ ] test-alerts.sh PASS: __ / FAIL: 0

[ ] Level 5: 부하 테스트
    [ ] load-test.py 구문 검증 PASS
    [ ] (선택) Locust 실행 정상

[ ] Level 6: 트레이스 단절 탐지
    [ ] validate-traces.py 구문 검증 PASS
    [ ] (선택) Tempo 연동 실행 정상

[ ] Level 7: 비용 시뮬레이션
    [ ] benchmark-sampling.py 실행 정상
    [ ] 비용 표 출력 확인

[ ] Level 8: Helm Chart
    [ ] helm lint PASS
    [ ] 기본 렌더링 정상
    [ ] dev 렌더링 정상
    [ ] prod 렌더링 정상

[ ] Level 9: CI 로컬 실행
    [ ] yamllint PASS
    [ ] ruff check PASS
    [ ] helm lint PASS

총 결과: PASS __ / FAIL __
비고: ____________________________________________
```

---

## 12. 자주 발생하는 문제 (FAQ)

### Q1: `docker compose` 명령어를 찾을 수 없습니다

Docker Desktop 버전을 확인하세요. 구버전은 `docker-compose` (하이픈 포함)를 사용합니다:
```bash
docker compose version   # v2 (권장)
docker-compose --version  # v1 (구버전)
```
Docker Desktop을 최신 버전으로 업데이트하세요.

### Q2: Collector가 기동되지 않습니다

```bash
# 포트 충돌 확인
netstat -ano | findstr :4317

# Collector 로그 확인
docker compose -f infra/docker/docker-compose.yaml logs otel-collector --tail=50

# 설정 파일 문법 확인 (otelcol-contrib 바이너리 필요)
# otelcol-contrib validate --config infra/docker/otelcol-local.yaml
```

### Q3: Jaeger에서 서비스가 보이지 않습니다

- OTel Collector가 healthy인지 확인 (Level 1 Step 3)
- Collector 로그에서 `exporter/jaeger`가 에러 없는지 확인
- 트레이스 전송 후 10~30초 대기 필요 (batch processor 버퍼)

### Q4: Grafana 대시보드가 비어 있습니다 (No Data)

대시보드가 데이터를 표시하려면 실제 AI 서비스에서 메트릭이 발생해야 합니다.
Level 2의 테스트 트레이스로는 대시보드 패널을 채울 수 없습니다 (대시보드는 특정 메트릭명을 쿼리함).

이것은 **정상**입니다. 실제 서비스를 연결하면 데이터가 표시됩니다.

### Q5: `pip install` 중 빌드 오류가 발생합니다

```bash
# pip 업그레이드
pip install --upgrade pip setuptools wheel

# 특정 패키지 문제 시 바이너리 설치 강제
pip install --only-binary :all: <패키지명>
```

### Q6: Windows에서 `scripts/test-alerts.sh`가 실행되지 않습니다

Git Bash에서 실행해야 합니다:
```bash
# Git Bash 터미널에서
bash scripts/test-alerts.sh

# 또는 WSL2에서
wsl bash scripts/test-alerts.sh
```

### Q7: Tempo에서 트레이스가 검색되지 않습니다

Tempo는 트레이스를 수신한 후 인덱싱하는 데 약간의 시간이 걸립니다:
```bash
# Tempo 상태 확인
curl -s http://localhost:3200/ready
# "ready"가 아니면 아직 초기화 중

# Tempo에 직접 트레이스 검색 (TraceQL)
curl -s 'http://localhost:3200/api/search?q={}&limit=5' | python -m json.tool
```
트레이스 전송 후 30초~1분 정도 기다린 후 다시 시도하세요.

### Q8: Helm template 실행 시 서브차트 의존성 오류

```bash
# 서브차트 의존성 다운로드
helm dependency update helm/aiservice-monitoring/

# 다시 시도
helm template test-release helm/aiservice-monitoring/
```

> 서브차트 다운로드에는 인터넷 연결이 필요합니다.

---

## 부록 A: RAG 데모 서비스로 통합 테스트

> Level 1~3 완료 후, RAG 데모 서비스를 이용하면 실제 AI 서비스에서
> 생성되는 트레이스와 메트릭을 확인할 수 있습니다.

### Step 1: RAG 데모 서비스 실행

```bash
cd /c/workspace/aiservice-monitoring/demo/rag-service

# 가상환경 설정
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 서비스 시작
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
MOCK_MODE=true \
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Step 2: API 호출로 트레이스 생성

```bash
# RAG 질문 (문서 검색 + LLM 추론)
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "연차 휴가 정책을 알려주세요"}' | python -m json.tool

# 여러 번 호출하여 다양한 트레이스 생성
for i in {1..10}; do
  curl -s -X POST http://localhost:8000/api/chat \
    -H "Content-Type: application/json" \
    -d '{"question": "원격 근무 정책은?"}'
done
```

### Step 3: 모니터링 확인

1. **Jaeger** (http://localhost:16686): Service `rag-demo-service` 선택 → 트레이스 확인
   - `rag.pipeline` 부모 Span 아래에 `rag.guardrail_input_check`, `rag.embedding`, `rag.vector_search`, `rag.llm_inference` 등의 자식 Span이 보여야 합니다.

2. **Grafana** (http://localhost:3000): AI Service Overview 대시보드에서 요청 수 확인

3. **XLog Dashboard** (http://localhost:8080): 실시간 산점도에서 요청 포인트 확인

---

## 부록 B: 테스트 완료 후 정리

```bash
# 로컬 스택 중지 (데이터 보존)
docker compose -f infra/docker/docker-compose.yaml down

# 로컬 스택 중지 + 데이터 삭제 (깨끗한 상태)
docker compose -f infra/docker/docker-compose.yaml down -v

# Python 가상환경 비활성화
deactivate
```

---

*문서 관련 문의: Aura Kim `<aura.kimjh@gmail.com>`*
*이 문서는 프로젝트 환경이 변경될 때마다 업데이트합니다.*
