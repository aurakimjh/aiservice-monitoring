# AITOP v0.9.0-rc.1 실검증 가이드 — macOS (Apple Silicon)

> **문서 버전**: v0.9.0-rc.1
> **목적**: 실데이터 기반 정교한 검증 → 릴리스 판정
> **환경**: macOS (Apple Silicon M-시리즈, 16GB+ RAM)
> **최종 업데이트**: 2026-03-28

---

## 개요

이 문서는 AITOP v0.9.0-rc.1의 **릴리스 판정**을 위한 실데이터 검증 가이드입니다.
수동 테스트 전 항목을 모두 통과해야 v1.0.0 정식 릴리스로 판정됩니다.

```
검증 범위:
├── 1단계: 환경 설치 + 인프라 기동
├── 2단계: AITOP 플랫폼 기동 (Collection Server + Frontend + Agent)
├── 3단계: 데모 앱 5종 + 배치 2종 + AI(RAG/가드레일) 기동
├── 4단계: 실데이터 수신 확인 (Prometheus + Jaeger + Agent)
├── 5단계: 부하 발생 + 67개 페이지 전수 검증
└── 6단계: 릴리스 판정 체크리스트
```

---

## 디렉토리 구조

```
~/workspace/
├── aiservice-monitoring/         ← AITOP 플랫폼 (이 저장소)
│   ├── agent/                    ← Collection Server + Agent (Go)
│   ├── frontend/                 ← Next.js 16 UI (67개 페이지)
│   ├── infra/docker/             ← OTel/Prometheus/Jaeger 설정
│   ├── docker-compose.production.yaml  ← 상용 스택
│   └── helm/                     ← Kubernetes Helm chart
│
└── demo-site/                    ← 데모 앱 (별도 저장소)
    ├── java-app/                 ← Spring Boot (port 8081)
    ├── python-app/               ← FastAPI + RAG + 가드레일 (port 8082)
    ├── go-app/                   ← Gin (port 8083)
    ├── dotnet-app/               ← ASP.NET Core (port 8084)
    ├── nodejs-app/               ← Express (port 8085)
    ├── java-batch/               ← Spring Batch (port 8091)
    ├── python-batch/             ← Celery + Redis (port 8092)
    ├── k6/                       ← 부하 테스트 스크립트
    ├── monitoring/               ← Agent 설정 + OTel Collector 설정
    ├── docker-compose.yaml       ← 데모 인프라 (PostgreSQL, Redis, MinIO, Qdrant)
    └── docker-compose.monitoring.yaml ← 모니터링 스택 (OTel, Prometheus, Jaeger)
```

---

## 포트 맵

| 포트 | 서비스 | 비고 |
|------|--------|------|
| 3000 | **AITOP Frontend** | 메인 UI |
| 8080 | **AITOP Collection Server** | REST API + Agent 수신 |
| 9090 | Prometheus | 메트릭 저장 |
| 16686 | Jaeger | 트레이스 UI |
| 4317 | OTel Collector (gRPC) | 트레이스/메트릭 수신 |
| 4318 | OTel Collector (HTTP) | 트레이스/메트릭 수신 |
| 5432 | PostgreSQL | 데모 앱 DB |
| 6379 | Redis | Celery broker + 캐시 |
| 6333 | Qdrant | 벡터 DB (RAG) |
| 11434 | Ollama | 로컬 LLM |
| 8081 | Java Spring Boot | 데모 앱 |
| 8082 | Python FastAPI | 데모 앱 + RAG + 가드레일 |
| 8083 | Go Gin | 데모 앱 |
| 8084 | .NET ASP.NET Core | 데모 앱 |
| 8085 | Node.js Express | 데모 앱 |
| 8091 | Java Spring Batch | 배치 |
| 8092 | Python Celery Worker | 배치 |

---

## 1단계: 환경 설치

### 1.1 필수 소프트웨어

```bash
# Homebrew (없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc && source ~/.zshrc

# Docker Desktop
brew install --cask docker
# → Applications에서 Docker 실행 → 고래 아이콘 확인
# → Settings > Resources: Memory 8GB+, CPUs 6+, Disk 60GB+

# 언어 런타임
brew install --cask temurin@21          # Java 21
brew install --cask dotnet-sdk          # .NET 8
brew install go                         # Go 1.22+
brew install python@3.12                # Python 3.12
brew install node@20                    # Node.js 20 LTS

# AI + 도구
brew install ollama                     # 로컬 LLM
brew install k6                         # 부하 테스트
```

### 1.2 환경 변수 설정

```bash
# ~/.zshrc에 추가
cat >> ~/.zshrc << 'EOF'
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export GOPATH=$HOME/go
export PATH=$JAVA_HOME/bin:$GOPATH/bin:/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/python@3.12/bin:$PATH
alias python=python3.12
alias pip=pip3.12
EOF
source ~/.zshrc
```

### 1.3 설치 확인

```bash
docker version && docker compose version
java -version        # openjdk 21
dotnet --version     # 8.0.x
go version           # go1.22+ darwin/arm64
python --version     # Python 3.12.x
node --version       # v20.x.x
ollama --version     # ollama version x.x.x
k6 version           # k6 v0.5x.x
```

> 모든 버전이 정상 출력되면 1단계 완료.

### 1.4 Ollama 모델 다운로드

```bash
brew services start ollama
sleep 5

# 시연 필수 모델 (사전 다운로드 권장 — 총 ~7GB)
ollama pull llama3.2:3b          # 2.0GB — 빠른 응답용
ollama pull nomic-embed-text     # 274MB — RAG 임베딩 필수

# 고성능 (선택 — RAM 32GB 이상 권장)
ollama pull llama3.1:8b          # 4.7GB — 고품질 시연용

# 확인
ollama list
curl -s http://localhost:11434/api/tags | python -m json.tool
```

---

## 2단계: AITOP 플랫폼 기동

### 2.1 저장소 클론

```bash
mkdir -p ~/workspace && cd ~/workspace

# AITOP 메인 저장소
git clone https://github.com/aurakimjh/aiservice-monitoring.git
cd aiservice-monitoring
git checkout master && git pull

# 데모 사이트 (별도 저장소)
cd ~/workspace
git clone https://github.com/aurakimjh/demo-site.git
```

### 2.2 데모 인프라 기동 (PostgreSQL + Redis + Qdrant + OTel + Prometheus + Jaeger)

```bash
cd ~/workspace/demo-site

# 인프라 + 모니터링 스택 동시 기동
docker compose -f docker-compose.yaml -f docker-compose.monitoring.yaml up -d

# 기동 확인 (모든 서비스 Up 확인, 최대 60초 대기)
docker compose -f docker-compose.yaml -f docker-compose.monitoring.yaml ps
```

**헬스체크:**
```bash
curl -sf http://localhost:9090/-/healthy && echo " Prometheus OK"
curl -sf http://localhost:16686/api/services && echo " Jaeger OK"
curl -sf http://localhost:13133/ && echo " OTel Collector OK"
curl -sf http://localhost:6333/healthz && echo " Qdrant OK"
docker exec demo-postgres pg_isready -U demo && echo " PostgreSQL OK"
docker exec demo-redis redis-cli ping && echo " Redis OK"
```

### 2.3 AITOP Collection Server 빌드 + 기동

```bash
cd ~/workspace/aiservice-monitoring/agent

# Go 빌드
go build -o bin/collection-server ./cmd/collection-server

# 기동 (백그라운드)
AITOP_LISTEN_ADDR=:8080 \
AITOP_PROMETHEUS_URL=http://localhost:9090 \
AITOP_JAEGER_URL=http://localhost:16686 \
AITOP_LOG_LEVEL=info \
./bin/collection-server &

# 확인
sleep 3
curl -s http://localhost:8080/health
# {"status":"ok"} 출력 확인
```

### 2.4 AITOP Frontend 빌드 + 기동

```bash
cd ~/workspace/aiservice-monitoring/frontend

# 의존성 설치 + 빌드
npm ci
npm run build

# 기동 (standalone 모드)
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1 \
PORT=3000 \
node .next/standalone/server.js &

# 확인 (약 5초 대기)
sleep 5
curl -sf http://localhost:3000 > /dev/null && echo "Frontend OK"
```

> 브라우저에서 http://localhost:3000 접속하여 대시보드 표시 확인.

### 2.5 AITOP Agent 빌드 + 기동

```bash
cd ~/workspace/aiservice-monitoring/agent

# Agent 빌드
go build -o bin/aitop-agent ./cmd/aitop-agent

# Agent 설정 파일 (데모 사이트 설정 사용)
AITOP_AGENT_CONFIG=~/workspace/demo-site/monitoring/agent.yaml \
./bin/aitop-agent --config=~/workspace/demo-site/monitoring/agent.yaml &

# 확인 — Collection Server에 Agent 등록 여부
sleep 15
curl -s http://localhost:8080/api/v1/agents | python -m json.tool
# agents 배열에 1건 이상 표시되면 성공
```

---

## 3단계: 데모 앱 기동

### 3.1 Java Spring Boot (port 8081)

```bash
cd ~/workspace/demo-site/java-app

# 빌드 + 기동
./mvnw clean package -DskipTests
java -jar target/*.jar \
  --server.port=8081 \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/demodb \
  --spring.datasource.username=demo \
  --spring.datasource.password=demo1234 &

# OTel 자동 계측 (javaagent 방식이 있는 경우)
# bash start-otel.sh

# 확인
sleep 10
curl -s http://localhost:8081/health && echo " Java OK"
curl -s http://localhost:8081/actuator/prometheus | head -5
```

### 3.2 Python FastAPI (port 8082)

```bash
cd ~/workspace/demo-site/python-app
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# OTel 환경변수 설정
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=python-demo-app
export DEMO_DB_PASSWORD=demo1234

uvicorn main:app --host 0.0.0.0 --port 8082 &

# 확인
sleep 3
curl -s http://localhost:8082/health && echo " Python OK"
```

### 3.3 Go Gin (port 8083)

```bash
cd ~/workspace/demo-site/go-app

export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_SERVICE_NAME=go-demo-app
export DB_URL=postgres://demo:demo1234@localhost:5432/demodb

go run . &

# 확인
sleep 3
curl -s http://localhost:8083/health && echo " Go OK"
```

### 3.4 .NET ASP.NET Core (port 8084)

```bash
cd ~/workspace/demo-site/dotnet-app

export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_SERVICE_NAME=dotnet-demo-app

dotnet run --urls "http://0.0.0.0:8084" &

# 확인
sleep 5
curl -s http://localhost:8084/health && echo " .NET OK"
```

### 3.5 Node.js Express (port 8085)

```bash
cd ~/workspace/demo-site/nodejs-app
npm install

export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=nodejs-demo-app

node app.js &

# 확인
sleep 3
curl -s http://localhost:8085/health && echo " Node.js OK"
```

### 3.6 Java Spring Batch (port 8091)

```bash
cd ~/workspace/demo-site/java-batch

./mvnw clean package -DskipTests
java -jar target/*.jar \
  --server.port=8091 \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/demodb \
  --spring.datasource.username=demo \
  --spring.datasource.password=demo1234 &

# 확인
sleep 10
curl -s http://localhost:8091/actuator/health && echo " Java Batch OK"
```

### 3.7 Python Celery 배치 (port 8092)

```bash
cd ~/workspace/demo-site/python-batch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Celery Worker 기동
celery -A tasks worker --loglevel=info --pool=solo &

# 확인
sleep 5
celery -A tasks inspect ping
```

### 3.8 RAG 서비스 (Python 앱 내장)

```bash
# RAG는 python-app/rag/ 모듈로 내장되어 있음
# python-app이 이미 실행 중이면 자동 활성화

# RAG 동작 확인
curl -X POST http://localhost:8082/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "AITOP이란?"}'
# answer + metrics(embed_ms, search_ms, generate_ms) 출력 확인
```

### 3.9 가드레일 서비스 (Python 앱 내장)

```bash
# 가드레일도 python-app/guardrail/ 모듈로 내장

# 정상 요청
curl -X POST http://localhost:8082/api/guardrail/check \
  -H "Content-Type: application/json" \
  -d '{"prompt": "AITOP 사용법 알려줘"}'
# → allowed: true

# 차단 요청
curl -X POST http://localhost:8082/api/guardrail/check \
  -H "Content-Type: application/json" \
  -d '{"prompt": "카드번호 알려줘"}'
# → allowed: false
```

---

## 4단계: 실데이터 수신 확인

### 4.1 Prometheus 메트릭 확인

```bash
# Prometheus targets 상태 (모든 앱이 UP이어야 함)
open http://localhost:9090/targets

# 쿼리 확인 — 각 앱의 HTTP 요청 카운터가 0 이상
curl -s "http://localhost:9090/api/v1/query?query=up" | python -m json.tool
```

### 4.2 Jaeger 트레이스 확인

```bash
# 등록된 서비스 목록 확인
curl -s http://localhost:16686/api/services | python -m json.tool
# → python-demo-app, go-demo-app, nodejs-demo-app 등이 보여야 함

# 브라우저에서 Jaeger UI 접속
open http://localhost:16686
```

### 4.3 AITOP Agent 데이터 확인

```bash
# 등록된 Agent 목록
curl -s http://localhost:8080/api/v1/agents | python -m json.tool

# 호스트 메트릭 (CPU, 메모리, 디스크, 네트워크)
curl -s http://localhost:8080/api/v1/realdata/host/metrics | python -m json.tool

# 서비스 목록
curl -s http://localhost:8080/api/v1/services | python -m json.tool
```

### 4.4 AITOP UI Live 모드 확인

```bash
open http://localhost:3000
```

1. 우측 상단 데이터 소스 토글에서 **Live** 선택
2. Overview 대시보드에서 실데이터 수치 확인:
   - Services: 실제 Agent로부터 수신된 서비스 수
   - Avg CPU: 현재 호스트의 실제 CPU 사용률
   - Backends: Prometheus `connected`, Jaeger `connected`
3. Infrastructure 메뉴: 호스트 목록에 현재 Mac이 표시되는지 확인
4. Services (APM) 메뉴: 등록된 서비스 목록 확인

---

## 5단계: 부하 발생 + 전수 검증

### 5.1 부하 발생

```bash
cd ~/workspace/demo-site

# 메인 부하 (5개 언어 앱 동시, 7분)
k6 run k6/load-test.js &

# RAG 부하 (LLM 호출, 별도 터미널)
k6 run k6/rag-load-test.js &

# 에러 주입 부하 (에러율 테스트)
k6 run k6/error-injection.js &

# 경량 부하 (장시간 유지용)
# k6 run k6/light-load.js &
```

> 부하가 발생하면 AITOP 대시보드에서 실시간으로 메트릭이 변화합니다.

### 5.2 배치 실행 (수동 트리거)

```bash
# Python Celery 배치 실행
cd ~/workspace/demo-site/python-batch
source .venv/bin/activate
python -c "
from tasks import process_ai_logs, generate_daily_report
r1 = process_ai_logs.delay(500)
r2 = generate_daily_report.delay()
print('Batch 1:', r1.get(timeout=120))
print('Batch 2:', r2.get(timeout=120))
"

# Java Spring Batch — Actuator로 트리거
curl -X POST http://localhost:8091/actuator/batch/trigger \
  -H "Content-Type: application/json" \
  -d '{"jobName": "reportJob"}'
```

---

## 6단계: 67개 페이지 전수 검증 체크리스트

> 각 페이지에 접속하여 Live 모드에서 실데이터가 표시되는지 확인합니다.
> `[P]` = Pass, `[F]` = Fail, `[D]` = Demo 모드만 동작

### 6.1 메인 (2페이지)

```
[ ] /                        — Overview KPI (Services, Error Rate, P95, CPU, Backends)
[ ] /login                   — 로그인 페이지 렌더링
```

### 6.2 Services — APM (5페이지)

```
[ ] /services                — 서비스 목록 (Live 데이터 표시, 검색/필터)
[ ] /services/[id]           — 서비스 상세 (Overview + XLog + 히트맵)
[ ] /services/[id]           — 트레이스 탭 (Jaeger 연동)
[ ] /traces                  — 트레이스 목록
[ ] /traces/[traceId]        — 트레이스 상세 (워터폴)
```

### 6.3 Infrastructure (8페이지)

```
[ ] /infra                   — 호스트 목록 (Live CPU/Mem/Disk)
[ ] /infra/[hostname]        — 호스트 상세 (Overview 그래프)
[ ] /infra/[hostname]        — 프로세스 탭
[ ] /infra/[hostname]        — 네트워크 탭
[ ] /infra/cache             — Cache (Redis) 모니터링
[ ] /infra/middleware         — 미들웨어 모니터링
[ ] /infra/middleware/connection-pool — 커넥션 풀
[ ] /infra/queues            — 메시지 큐 모니터링
```

### 6.4 AI Services (10페이지)

```
[ ] /ai                      — AI 서비스 목록 (TTFT, TPS, GPU, Token Cost, Block Rate)
[ ] /ai/overview             — AI Overview 대시보드
[ ] /ai/[id]                 — AI 서비스 상세
[ ] /ai/llm-traces           — LLM 트레이스 목록
[ ] /ai/diagnostics          — AI 진단 (5항목: cost spike, agent loop, RAG, GPU, drift)
[ ] /ai/evaluation           — 평가 프레임워크
[ ] /ai/gpu                  — GPU 모니터링
[ ] /ai/costs                — 토큰 비용 분석
[ ] /ai/training             — 학습 모니터링
[ ] /ai/prompts              — 프롬프트 관리
```

### 6.5 Batch (3페이지)

```
[ ] /batch                   — 배치 목록 (Celery + Spring Batch)
[ ] /batch (XLog 탭)         — 배치 XLog 산점도
[ ] /batch (상세)            — 배치 실행 상세
```

### 6.6 Dashboards (1페이지)

```
[ ] /dashboards              — 커스텀 대시보드
    [ ] 위젯 추가 (11종 APM/AI 위젯)
    [ ] 드래그앤드롭 정렬
    [ ] 위젯 도움말 (?) 팝오버 — 한국어/영어/일본어 전환
    [ ] 템플릿 저장/불러오기
```

### 6.7 Agents (5페이지)

```
[ ] /agents                  — Agent 목록 (등록된 Agent 표시)
[ ] /agents/[id]             — Agent 상세
[ ] /agents/[id]/profiling   — Agent 프로파일링
[ ] /agents/plugins          — 플러그인 목록
[ ] /agents/groups           — 그룹 관리
```

### 6.8 공통 기능 (5페이지)

```
[ ] /alerts                  — 알림 규칙/이력
[ ] /topology                — 서비스 토폴로지 맵
[ ] /logs                    — 로그 뷰어
[ ] /slo                     — SLO 대시보드
[ ] /settings                — 설정
```

### 6.9 분석/리포트 (10페이지)

```
[ ] /golden-signals           — SRE Golden Signals
[ ] /rum                      — Real User Monitoring
[ ] /profiling                — 프로파일링
[ ] /profiling/system         — 시스템 프로파일링
[ ] /diagnostics              — IT 진단
[ ] /anomalies                — 이상 탐지
[ ] /executive                — Executive 리포트
[ ] /costs                    — 비용 분석
[ ] /database                 — DB 모니터링
[ ] /metrics                  — 메트릭 탐색기
```

### 6.10 런타임/프로젝트/기타 (18페이지)

```
[ ] /runtime/python           — Python 런타임
[ ] /runtime/go               — Go 런타임
[ ] /runtime/dotnet           — .NET 런타임
[ ] /projects                 — 프로젝트 목록
[ ] /projects/[id]            — 프로젝트 상세
[ ] /projects/new             — 프로젝트 생성
[ ] /tenants                  — 멀티테넌트
[ ] /marketplace              — 마켓플레이스
[ ] /business                 — 비즈니스 KPI
[ ] /pipelines                — 데이터 파이프라인
[ ] /cloud                    — 클라우드 모니터링
[ ] /mobile                   — 모바일 대시보드
[ ] /notebooks                — 노트북
[ ] /copilot                  — AI Copilot
[ ] /ai/training/[id]         — 학습 상세
[ ] /agents/plugins/[name]    — 플러그인 상세
[ ] /agents/groups/[id]       — 그룹 상세
[ ] /profiling/[profileId]    — 프로파일 상세
```

---

## 7. 크로스 기능 검증

### 7.1 데이터 소스 모드 전환

```
[ ] Auto 모드: Live 데이터 있으면 Live, 없으면 Demo 자동 전환
[ ] Live 모드: 실데이터만 표시 (데이터 없는 페이지는 빈 상태 UI)
[ ] Demo 모드: 모든 페이지에서 데모 데이터 표시
```

### 7.2 다국어 (i18n)

```
[ ] 한국어 → 영어 전환: KPI 타이틀, 위젯 도움말 영어 표시
[ ] 영어 → 일본어 전환: KPI 타이틀, 위젯 도움말 일본어 표시
[ ] 일본어 → 한국어 복귀
```

### 7.3 위젯 도움말

```
[ ] KPICard의 ? 아이콘 클릭 → 팝오버 표시
[ ] 대시보드 위젯의 ? 아이콘 클릭 → 팝오버 표시
[ ] 8초 후 자동 닫힘
[ ] 외부 클릭 시 닫힘
[ ] 언어 전환 시 도움말 내용도 전환
```

### 7.4 에러 내성

```
[ ] Collection Server 중지 → UI에 에러 표시 (크래시 없음)
[ ] 존재하지 않는 URL → 404 페이지 (not-found.tsx)
[ ] 데이터 없는 위젯 → 빈 상태 UI (null crash 없음)
```

---

## 8. 릴리스 판정 기준

### MUST PASS (필수)

| # | 항목 | 기준 |
|---|------|------|
| 1 | Frontend 빌드 | `npm run build` 오류 없이 완료 |
| 2 | Go 빌드 | `go build ./...` 오류 없이 완료 |
| 3 | 인프라 기동 | Docker 6개 서비스 모두 healthy |
| 4 | 5개 앱 기동 | 모든 `/health` 200 OK |
| 5 | Agent 등록 | Collection Server에 Agent 1건 이상 등록 |
| 6 | Live 모드 KPI | Overview에서 실데이터 수치 표시 |
| 7 | 트레이스 수신 | Jaeger에 서비스 3개 이상 표시 |
| 8 | 67페이지 접속 | 모든 페이지 크래시 없이 렌더링 |
| 9 | XLog 동작 | 부하 발생 시 점 찍힘 + brush 선택 동작 |
| 10 | 토폴로지 | 서비스 맵 노드/엣지 표시 |

### SHOULD PASS (권장)

| # | 항목 | 기준 |
|---|------|------|
| 11 | RAG 파이프라인 | RAG 쿼리 → 워터폴 차트에 단계별 시간 표시 |
| 12 | 가드레일 | 차단 요청 → 차단률 위젯에 반영 |
| 13 | 배치 모니터링 | 배치 목록에 Celery/Spring Batch 잡 표시 |
| 14 | 다국어 | 3개 언어 전환 시 UI 깨지지 않음 |
| 15 | 커스텀 대시보드 | 위젯 추가/삭제/정렬 정상 동작 |

### 판정

```
MUST PASS: 10/10 → v1.0.0 릴리스 승인
MUST PASS: 9/10 이하 → 이슈 수정 후 재검증 (v0.9.0-rc.2)
```

---

## 9. 트러블슈팅

### Docker 메모리 부족 (OOMKilled)

```bash
docker stats --no-stream                    # 메모리 사용량 확인
# Docker Desktop → Settings → Resources → Memory 증가 (최소 8GB)
```

### OTel Collector 연결 안 됨

```bash
nc -zv localhost 4317 && echo "gRPC OK"
nc -zv localhost 4318 && echo "HTTP OK"
docker logs demo-otel-collector --tail 20   # 에러 로그 확인
```

### Jaeger에 서비스 미표시

```bash
curl -s http://localhost:16686/api/services | python -m json.tool
# 비어있으면 → 앱에서 OTel endpoint 확인
# OTEL_EXPORTER_OTLP_ENDPOINT가 올바른지 확인
```

### Prometheus targets DOWN

```bash
open http://localhost:9090/targets
# DOWN인 target → 해당 앱이 실행 중인지, 포트가 맞는지 확인
```

### Agent가 등록되지 않음

```bash
curl -s http://localhost:8080/api/v1/agents
# 빈 배열이면 → Agent 로그 확인
# Agent의 server.url이 http://localhost:8080인지 확인
```

### 포트 충돌

```bash
lsof -i :8080 -i :8081 -i :8082 -i :8083 -i :8084 -i :8085 -i :3000
# 충돌 PID 확인 후 kill
```

### 전체 종료 + 재시작

```bash
# 1. 네이티브 앱 종료
pkill -f "collection-server|aitop-agent|uvicorn|node app|dotnet run|java -jar|celery|go run|server.js"

# 2. Docker 종료
cd ~/workspace/demo-site
docker compose -f docker-compose.yaml -f docker-compose.monitoring.yaml down

# 3. 재기동 (2단계부터 반복)
```

---

## 10. 검증 완료 후

### 릴리스 판정서 작성

```markdown
## AITOP v0.9.0-rc.1 릴리스 판정

- 검증 일자: 2026-0X-XX
- 검증 환경: macOS Apple Silicon, Docker Desktop X.X
- 검증자: ____________

### MUST PASS (10항목)
1. Frontend 빌드: [P/F]
2. Go 빌드: [P/F]
3. 인프라 기동: [P/F]
4. 5개 앱 기동: [P/F]
5. Agent 등록: [P/F]
6. Live 모드 KPI: [P/F]
7. 트레이스 수신: [P/F]
8. 67페이지 접속: [P/F]
9. XLog 동작: [P/F]
10. 토폴로지: [P/F]

### SHOULD PASS (5항목)
11. RAG 파이프라인: [P/F]
12. 가드레일: [P/F]
13. 배치 모니터링: [P/F]
14. 다국어: [P/F]
15. 커스텀 대시보드: [P/F]

### 판정: [ ] v1.0.0 승인 / [ ] rc.2 재검증
### 비고:
```

### v1.0.0 태그 (승인 시)

```bash
cd ~/workspace/aiservice-monitoring
git tag -a v1.0.0 -m "v1.0.0 정식 릴리스 — 수동 검증 통과"
git push origin v1.0.0
```
