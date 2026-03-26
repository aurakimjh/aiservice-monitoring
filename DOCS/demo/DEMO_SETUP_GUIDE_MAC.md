# AITOP 시연 환경 구성 가이드 — macOS M5 Max (128GB RAM)

> **대상 독자**: 처음 시연 환경을 구성하는 누구나 (초보자도 OK)
> **환경**: macOS (Apple Silicon M5 Max, 18코어 CPU, 40코어 GPU, 128GB RAM)
> **최종 업데이트**: 2026-03-26
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`

---

## 목차

1. [사전 요구사항 및 설치](#1-사전-요구사항-및-설치)
2. [AITOP 전체 스택 구성](#2-aitop-전체-스택-구성)
3. [언어별 데모 앱 구성](#3-언어별-데모-앱-구성)
4. [AI 서비스 구성 (Ollama + RAG)](#4-ai-서비스-구성)
5. [배치 사이트 구성](#5-배치-사이트-구성)
6. [부하 테스트 구성](#6-부하-테스트-구성)
7. [전체 기동 순서](#7-전체-기동-순서)
8. [동작 확인 체크리스트](#8-동작-확인-체크리스트)
9. [트러블슈팅 가이드](#9-트러블슈팅-가이드)

---

## 1. 사전 요구사항 및 설치

### 1.1 필수 소프트웨어 목록

| 소프트웨어 | 버전 | 역할 |
|---|---|---|
| Homebrew | 최신 | macOS 패키지 매니저 |
| Docker Desktop | 4.x 이상 | 컨테이너 실행 환경 |
| Java (Temurin) | 21 LTS | Spring Boot 데모 앱 |
| .NET SDK | 8.0 | ASP.NET 데모 앱 |
| Go | 1.22+ | Gin/Echo 데모 앱 |
| Python | 3.12+ | FastAPI/Celery 데모 |
| Node.js | 20 LTS | Express 데모 앱 |
| Ollama | 최신 | 로컬 LLM 구동 |
| k6 | 최신 | 부하 테스트 |

---

### 1.2 Homebrew 설치

> Homebrew는 macOS용 패키지 매니저입니다. apt(Ubuntu)와 동일한 역할.

```bash
# 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Apple Silicon용 PATH 설정 (설치 후 출력되는 안내 그대로 따라하세요)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc
```

**확인 방법:**
```bash
brew --version
# Homebrew 4.x.x 가 출력되면 성공
```

---

### 1.3 Docker Desktop 설치

```bash
brew install --cask docker
```

설치 후 Applications 폴더에서 **Docker** 앱을 실행하고,
메뉴바에 고래 아이콘 🐳 이 나타날 때까지 기다립니다.

**리소스 설정 (중요):**
Docker Desktop → Settings → Resources:
- Memory: **64GB** (시연 전체 구동 시)
- CPUs: **12**
- Swap: **4GB**
- Disk image size: **100GB**

**확인 방법:**
```bash
docker version
docker compose version
# 두 명령 모두 버전 정보가 출력되면 성공
```

---

### 1.4 Java (Temurin 21) 설치

```bash
brew install --cask temurin@21

# JAVA_HOME 설정
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 21)' >> ~/.zshrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

**확인 방법:**
```bash
java -version
# openjdk version "21..." 출력되면 성공
```

---

### 1.5 .NET SDK 8 설치

```bash
brew install --cask dotnet-sdk
```

**확인 방법:**
```bash
dotnet --version
# 8.0.x 출력되면 성공
```

---

### 1.6 Go 설치

```bash
brew install go

echo 'export GOPATH=$HOME/go' >> ~/.zshrc
echo 'export PATH=$GOPATH/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

**확인 방법:**
```bash
go version
# go version go1.22.x darwin/arm64 출력되면 성공
```

---

### 1.7 Python 3.12 설치

```bash
brew install python@3.12

# pip 별칭 설정
echo 'alias python=python3.12' >> ~/.zshrc
echo 'alias pip=pip3.12' >> ~/.zshrc
source ~/.zshrc
```

**확인 방법:**
```bash
python --version
# Python 3.12.x 출력되면 성공
```

---

### 1.8 Node.js 20 LTS 설치

```bash
brew install node@20
echo 'export PATH=/opt/homebrew/opt/node@20/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

**확인 방법:**
```bash
node --version   # v20.x.x
npm --version    # 10.x.x
```

---

### 1.9 Ollama 설치

```bash
brew install ollama

# 서비스로 등록 (부팅 시 자동 시작)
brew services start ollama
```

**LLM 모델 다운로드:**
> 참고: 모델 파일이 크므로 Wi-Fi 환경에서 미리 받아 두세요.

```bash
# 경량 모델 (시연 권장)
ollama pull llama3.2:3b        # 2.0GB — 빠른 응답용
ollama pull mistral:7b          # 4.1GB — 품질 균형용
ollama pull nomic-embed-text    # 274MB — 임베딩용 (RAG 필수)

# 고성능 모델 (M5 Max + 128GB에서 쾌적하게 구동 가능)
ollama pull llama3.1:8b         # 4.7GB — 고품질 시연용
```

**확인 방법:**
```bash
ollama list
# 다운로드된 모델 목록 출력되면 성공

curl http://localhost:11434/api/tags
# JSON 응답 오면 Ollama 서버 정상 가동 중
```

---

### 1.10 k6 설치 (부하 테스트)

```bash
brew install k6
```

**확인 방법:**
```bash
k6 version
# k6 v0.5x.x 출력되면 성공
```

---

## 2. AITOP 전체 스택 구성

### 2.1 레포지토리 클론

```bash
cd ~/workspace
git clone https://github.com/your-org/aiservice-monitoring.git
cd aiservice-monitoring
```

---

### 2.2 docker-compose.demo.yaml 파일 생성

> 이 파일은 AITOP 핵심 인프라를 한 번에 띄웁니다.

`docker-compose.demo.yaml` 파일을 프로젝트 루트에 다음과 같이 작성합니다:

```yaml
# AITOP Demo Stack — macOS M5 Max 전용
# 기동: docker compose -f docker-compose.demo.yaml up -d
# 종료: docker compose -f docker-compose.demo.yaml down -v

services:

  # ── PostgreSQL — 메타데이터·설정 저장 ───────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: aitop-demo-postgres
    environment:
      POSTGRES_DB: aitop
      POSTGRES_USER: aitop
      POSTGRES_PASSWORD: aitop_demo_2026
    ports:
      - "5432:5432"
    volumes:
      - demo_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aitop"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Prometheus — 메트릭 수집·저장 ───────────────────────────────────
  prometheus:
    image: prom/prometheus:v2.53.0
    container_name: aitop-demo-prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=7d"
    volumes:
      - ./infra/docker/prometheus.demo.yml:/etc/prometheus/prometheus.yml:ro
      - demo_prometheus_data:/prometheus
    ports:
      - "9090:9090"

  # ── Jaeger — 분산 트레이싱 ──────────────────────────────────────────
  jaeger:
    image: jaegertracing/all-in-one:1.58
    container_name: aitop-demo-jaeger
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"   # Jaeger UI
      - "14268:14268"   # HTTP 수집
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP

  # ── AITOP Collection Server ──────────────────────────────────────────
  aitop-server:
    build:
      context: ./collector
      dockerfile: ../infra/docker/Dockerfile.collection-server
    container_name: aitop-demo-server
    ports:
      - "8080:8080"
    environment:
      - AITOP_DB_URL=postgres://aitop:aitop_demo_2026@postgres:5432/aitop
      - AITOP_JAEGER_URL=http://jaeger:14268/api/traces
      - AITOP_PROMETHEUS_URL=http://prometheus:9090
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── AITOP Frontend ───────────────────────────────────────────────────
  aitop-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: aitop-demo-frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_BASE_URL=http://localhost:8080
    depends_on:
      - aitop-server

  # ── Qdrant (VectorDB — RAG용) ────────────────────────────────────────
  qdrant:
    image: qdrant/qdrant:v1.9.0
    container_name: aitop-demo-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - demo_qdrant_data:/qdrant/storage

volumes:
  demo_postgres_data:
  demo_prometheus_data:
  demo_qdrant_data:
```

---

### 2.3 Prometheus 설정 파일 생성

`infra/docker/prometheus.demo.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aitop-server'
    static_configs:
      - targets: ['aitop-server:8080']

  - job_name: 'demo-java'
    static_configs:
      - targets: ['host.docker.internal:8081']

  - job_name: 'demo-dotnet'
    static_configs:
      - targets: ['host.docker.internal:8082']

  - job_name: 'demo-go'
    static_configs:
      - targets: ['host.docker.internal:8083']

  - job_name: 'demo-python'
    static_configs:
      - targets: ['host.docker.internal:8084']

  - job_name: 'demo-nodejs'
    static_configs:
      - targets: ['host.docker.internal:8085']

  - job_name: 'demo-batch-java'
    static_configs:
      - targets: ['host.docker.internal:8091']

  - job_name: 'demo-batch-python'
    static_configs:
      - targets: ['host.docker.internal:8092']

  - job_name: 'demo-rag'
    static_configs:
      - targets: ['host.docker.internal:8093']
```

---

### 2.4 스택 기동

```bash
# 이미지 빌드 + 전체 기동
docker compose -f docker-compose.demo.yaml up -d --build

# 기동 상태 확인
docker compose -f docker-compose.demo.yaml ps
```

**확인 방법:**
```bash
# 모든 서비스가 "Up (healthy)" 상태여야 합니다
curl http://localhost:8080/health      # AITOP 서버
curl http://localhost:3000             # AITOP 프론트엔드
curl http://localhost:9090/-/healthy   # Prometheus
curl http://localhost:16686            # Jaeger UI
curl http://localhost:6333/health      # Qdrant
```

---

## 3. 언어별 데모 앱 구성

> 각 데모 앱은 네이티브(macOS)에서 직접 실행합니다.
> AITOP Agent가 자동으로 메트릭/트레이스를 수집합니다.

### 3.1 Java — Spring Boot 데모

**프로젝트 생성:**
```bash
mkdir -p ~/demo/java-demo && cd ~/demo/java-demo

# Spring Initializr로 프로젝트 생성
curl -o demo.zip "https://start.spring.io/starter.zip?type=maven-project&language=java&bootVersion=3.3.0&baseDir=java-demo&groupId=com.aitop&artifactId=java-demo&dependencies=web,actuator,opentelemetry"
unzip demo.zip && rm demo.zip && cd java-demo
```

**`src/main/java/com/aitop/javademo/DemoController.java` 작성:**
```java
@RestController
public class DemoController {

    @GetMapping("/api/hello")
    public Map<String, String> hello() {
        simulateWork(50, 200);  // 50~200ms 랜덤 응답 시간
        return Map.of("message", "Hello from Java!", "lang", "java");
    }

    @GetMapping("/api/slow")
    public Map<String, String> slow() throws InterruptedException {
        Thread.sleep(1500 + (long)(Math.random() * 1000));  // 1.5~2.5s 느린 응답
        return Map.of("message", "Slow endpoint", "lang", "java");
    }

    @GetMapping("/api/error")
    public ResponseEntity<?> error() {
        if (Math.random() < 0.3) {  // 30% 확률로 에러
            throw new RuntimeException("Simulated error for demo");
        }
        return ResponseEntity.ok(Map.of("message", "OK"));
    }

    private void simulateWork(int minMs, int maxMs) {
        try { Thread.sleep(minMs + (long)(Math.random() * (maxMs - minMs))); }
        catch (InterruptedException ignored) {}
    }
}
```

**`src/main/resources/application.yaml` 설정:**
```yaml
server:
  port: 8081

spring:
  application:
    name: demo-java-springboot

management:
  endpoints:
    web:
      exposure:
        include: health,metrics,prometheus
  metrics:
    export:
      prometheus:
        enabled: true

otel:
  exporter:
    otlp:
      endpoint: http://localhost:4318
  resource:
    attributes:
      service.name: demo-java-springboot
      service.version: 1.0.0
```

**실행:**
```bash
./mvnw spring-boot:run -Dspring-boot.run.jvmArguments="-javaagent:$HOME/.aitop/agent/aitop-agent-java.jar"
```

**확인 방법:**
```bash
curl http://localhost:8081/api/hello
curl http://localhost:8081/actuator/prometheus | head -20
```

---

### 3.2 .NET — ASP.NET Core 데모

```bash
mkdir -p ~/demo/dotnet-demo && cd ~/demo/dotnet-demo
dotnet new webapi -n DotNetDemo --framework net8.0
cd DotNetDemo
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
dotnet add package OpenTelemetry.Instrumentation.AspNetCore
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package prometheus-net.AspNetCore
```

**`Program.cs` 핵심 설정:**
```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter(o => o.Endpoint = new Uri("http://localhost:4318")));

// 포트 8082 사용
app.Urls.Add("http://+:8082");
```

**실행:**
```bash
dotnet run --urls "http://0.0.0.0:8082"
```

**확인 방법:**
```bash
curl http://localhost:8082/weatherforecast
```

---

### 3.3 Go — Gin 데모

```bash
mkdir -p ~/demo/go-demo && cd ~/demo/go-demo
go mod init demo-go

go get github.com/gin-gonic/gin
go get go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp
```

**`main.go` 작성:**
```go
package main

import (
    "math/rand"
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

func main() {
    initOtel("demo-go-gin", "http://localhost:4318")

    r := gin.Default()
    r.Use(otelgin.Middleware("demo-go-gin"))

    r.GET("/api/hello", func(c *gin.Context) {
        time.Sleep(time.Duration(50+rand.Intn(150)) * time.Millisecond)
        c.JSON(http.StatusOK, gin.H{"message": "Hello from Go!", "lang": "go"})
    })

    r.GET("/api/slow", func(c *gin.Context) {
        time.Sleep(time.Duration(1500+rand.Intn(1000)) * time.Millisecond)
        c.JSON(http.StatusOK, gin.H{"message": "Slow endpoint", "lang": "go"})
    })

    r.Run(":8083")
}
```

**실행:**
```bash
go run main.go
```

**확인 방법:**
```bash
curl http://localhost:8083/api/hello
```

---

### 3.4 Python — FastAPI 데모

```bash
mkdir -p ~/demo/python-demo && cd ~/demo/python-demo
python -m venv .venv
source .venv/bin/activate

pip install fastapi uvicorn opentelemetry-api opentelemetry-sdk \
    opentelemetry-exporter-otlp opentelemetry-instrumentation-fastapi \
    prometheus-fastapi-instrumentator
```

**`main.py` 작성:**
```python
import asyncio, random
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_fastapi_instrumentator import Instrumentator

# OTel 초기화
provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(
    OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
))
trace.set_tracer_provider(provider)

app = FastAPI(title="AITOP Demo - Python FastAPI")
FastAPIInstrumentor.instrument_app(app)
Instrumentator().instrument(app).expose(app)

@app.get("/api/hello")
async def hello():
    await asyncio.sleep(random.uniform(0.05, 0.2))
    return {"message": "Hello from Python!", "lang": "python"}

@app.get("/api/llm-simulate")
async def llm_simulate():
    """LLM 호출 시뮬레이션 — AI 서비스 모니터링 데모용"""
    ttft = random.uniform(0.3, 0.8)  # Time to First Token
    await asyncio.sleep(ttft)
    tokens = random.randint(50, 300)
    await asyncio.sleep(tokens * 0.02)  # 토큰 생성 시간
    return {
        "response": "AI 응답 텍스트 시뮬레이션",
        "ttft_ms": int(ttft * 1000),
        "total_tokens": tokens
    }
```

**실행:**
```bash
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8084 --reload
```

**확인 방법:**
```bash
curl http://localhost:8084/api/hello
curl http://localhost:8084/metrics | head -20
```

---

### 3.5 Node.js — Express 데모

```bash
mkdir -p ~/demo/nodejs-demo && cd ~/demo/nodejs-demo
npm init -y

npm install express \
    @opentelemetry/sdk-node \
    @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-http \
    prom-client
```

**`tracing.js` (OTel 초기화):**
```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
    serviceName: 'demo-nodejs-express',
    traceExporter: new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
    instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

**`app.js`:**
```javascript
require('./tracing');
const express = require('express');
const client = require('prom-client');

const app = express();
client.collectDefaultMetrics();

const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

app.get('/api/hello', (req, res) => {
    const delay = 50 + Math.random() * 150;
    setTimeout(() => res.json({ message: 'Hello from Node.js!', lang: 'nodejs' }), delay);
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
});

app.listen(8085, () => console.log('Node.js demo running on :8085'));
```

**실행:**
```bash
node app.js
```

**확인 방법:**
```bash
curl http://localhost:8085/api/hello
curl http://localhost:8085/metrics | head -20
```

---

## 4. AI 서비스 구성

### 4.1 Ollama LLM 서비스 (이미 1.9에서 설치 완료)

Ollama는 `brew services start ollama`로 백그라운드 실행 중입니다.

**LLM 동작 확인:**
```bash
# 모델 목록 확인
ollama list

# 직접 호출 테스트
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2:3b",
  "prompt": "AITOP AI 모니터링 솔루션을 한 줄로 설명해줘.",
  "stream": false
}'
```

---

### 4.2 RAG 서비스 데모

> RAG(Retrieval-Augmented Generation): 문서를 임베딩→벡터DB 저장→유사 문서 검색→LLM 응답 생성

```bash
mkdir -p ~/demo/rag-demo && cd ~/demo/rag-demo
python -m venv .venv
source .venv/bin/activate

pip install fastapi uvicorn qdrant-client ollama \
    opentelemetry-api opentelemetry-sdk \
    opentelemetry-exporter-otlp \
    opentelemetry-instrumentation-fastapi
```

**`rag_service.py` 작성:**
```python
import uuid, time
from fastapi import FastAPI
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
import ollama

app = FastAPI(title="AITOP RAG Demo Service")
qdrant = QdrantClient(host="localhost", port=6333)
COLLECTION = "aitop_docs"

# 컬렉션 초기화 (최초 1회)
def init_collection():
    try:
        qdrant.get_collection(COLLECTION)
    except Exception:
        qdrant.create_collection(COLLECTION, vectors_config=VectorParams(size=768, distance=Distance.COSINE))
        # 샘플 문서 임베딩 & 저장
        docs = [
            "AITOP은 AI 서비스의 응답 속도, GPU 사용률, 토큰 처리량을 실시간으로 모니터링합니다.",
            "XLog는 각 요청의 응답 시간을 점으로 표시하여 이상 패턴을 시각적으로 파악할 수 있습니다.",
            "플레임그래프는 메서드 수준의 CPU 사용 시간을 계층적으로 보여줍니다.",
        ]
        for doc in docs:
            emb = ollama.embeddings(model="nomic-embed-text", prompt=doc)
            qdrant.upsert(COLLECTION, [PointStruct(id=str(uuid.uuid4()), vector=emb.embedding, payload={"text": doc})])

class QueryRequest(BaseModel):
    question: str

@app.post("/api/rag/query")
async def rag_query(req: QueryRequest):
    start = time.time()

    # 1. 임베딩
    emb_start = time.time()
    emb = ollama.embeddings(model="nomic-embed-text", prompt=req.question)
    embed_time = time.time() - emb_start

    # 2. 벡터 검색
    search_start = time.time()
    results = qdrant.search(COLLECTION, query_vector=emb.embedding, limit=3)
    search_time = time.time() - search_start

    # 3. LLM 응답 생성
    context = "\n".join([r.payload["text"] for r in results])
    gen_start = time.time()
    response = ollama.generate(
        model="llama3.2:3b",
        prompt=f"컨텍스트:\n{context}\n\n질문: {req.question}\n\n답변:"
    )
    gen_time = time.time() - gen_start

    return {
        "answer": response.response,
        "metrics": {
            "embed_ms": int(embed_time * 1000),
            "search_ms": int(search_time * 1000),
            "generate_ms": int(gen_time * 1000),
            "total_ms": int((time.time() - start) * 1000),
        }
    }

@app.on_event("startup")
async def startup():
    init_collection()
```

**실행:**
```bash
source .venv/bin/activate
uvicorn rag_service:app --host 0.0.0.0 --port 8093 --reload
```

**확인 방법:**
```bash
curl -X POST http://localhost:8093/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "XLog가 뭔가요?"}'
# answer 필드와 metrics(embed_ms, search_ms, generate_ms) 가 출력되면 성공
```

---

### 4.3 AI 가드레일 데모

```bash
mkdir -p ~/demo/guardrail-demo && cd ~/demo/guardrail-demo
source ~/demo/python-demo/.venv/bin/activate  # 또는 새 venv 생성

pip install fastapi uvicorn pydantic
```

**`guardrail_service.py`:**
```python
from fastapi import FastAPI
from pydantic import BaseModel
import re, time

app = FastAPI(title="AITOP AI Guardrail Demo")

BLOCKED_PATTERNS = [
    r"개인정보\s*유출", r"비밀번호\s*알려", r"카드번호",
    r"주민등록번호", r"해킹", r"공격"
]

class GuardrailRequest(BaseModel):
    prompt: str
    user_id: str = "anonymous"

@app.post("/api/guardrail/check")
async def check_guardrail(req: GuardrailRequest):
    start = time.time()

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, req.prompt):
            return {
                "allowed": False,
                "reason": "안전 정책에 위반되는 요청입니다.",
                "pattern_matched": pattern,
                "check_ms": int((time.time() - start) * 1000)
            }

    return {
        "allowed": True,
        "reason": "정상 요청",
        "check_ms": int((time.time() - start) * 1000)
    }
```

**실행:**
```bash
uvicorn guardrail_service:app --host 0.0.0.0 --port 8094 --reload
```

**확인 방법:**
```bash
# 정상 요청
curl -X POST http://localhost:8094/api/guardrail/check \
  -H "Content-Type: application/json" \
  -d '{"prompt": "AITOP 사용법을 알려줘"}'

# 차단 요청 테스트
curl -X POST http://localhost:8094/api/guardrail/check \
  -H "Content-Type: application/json" \
  -d '{"prompt": "카드번호 알려줘"}'
# allowed: false 가 반환되면 성공
```

---

## 5. 배치 사이트 구성

### 5.1 Java Spring Batch 데모

```bash
mkdir -p ~/demo/batch-java && cd ~/demo/batch-java
# Spring Initializr
curl -o batch.zip "https://start.spring.io/starter.zip?dependencies=batch,data-jpa,postgresql,actuator&name=batch-java-demo"
unzip batch.zip && rm batch.zip
```

**배치 잡 예시 (`ReportJob.java`):**
```java
@Configuration
public class ReportJobConfig {

    @Bean
    public Job reportJob(JobRepository jobRepository, Step reportStep) {
        return new JobBuilder("reportJob", jobRepository)
            .start(reportStep)
            .build();
    }

    @Bean
    public Step reportStep(JobRepository jobRepository,
                           PlatformTransactionManager txManager,
                           ItemReader<LogEntry> reader,
                           ItemProcessor<LogEntry, Report> processor,
                           ItemWriter<Report> writer) {
        return new StepBuilder("reportStep", jobRepository)
            .<LogEntry, Report>chunk(100, txManager)
            .reader(reader)
            .processor(processor)
            .writer(writer)
            .build();
    }
}
```

**실행 (스케줄 포함):**
```bash
./mvnw spring-boot:run \
  -Dspring-boot.run.arguments="--server.port=8091" \
  -Dspring-boot.run.jvmArguments="-javaagent:$HOME/.aitop/agent/aitop-agent-java.jar"
```

---

### 5.2 Python Celery 배치 데모

```bash
mkdir -p ~/demo/batch-python && cd ~/demo/batch-python
python -m venv .venv && source .venv/bin/activate

pip install celery redis fastapi uvicorn flower
```

**Redis 실행 (Docker):**
```bash
docker run -d --name demo-redis -p 6379:6379 redis:7-alpine
```

**`tasks.py`:**
```python
from celery import Celery
import time, random

app = Celery('demo_batch', broker='redis://localhost:6379/0',
             backend='redis://localhost:6379/1')

@app.task(name='process_ai_logs')
def process_ai_logs(batch_size: int = 1000):
    """AI 로그 배치 처리 시뮬레이션"""
    processed = 0
    for i in range(batch_size):
        time.sleep(random.uniform(0.001, 0.005))  # 실제 처리 시뮬레이션
        processed += 1
    return {"processed": processed, "status": "done"}

@app.task(name='generate_daily_report')
def generate_daily_report():
    """일별 AI 성능 리포트 생성"""
    time.sleep(random.uniform(2, 5))
    return {"report_date": "2026-03-26", "total_requests": 45231, "avg_ttft_ms": 312}
```

**실행:**
```bash
# Worker 실행
source .venv/bin/activate
celery -A tasks worker --loglevel=info --port=8092 &

# Flower (배치 모니터링 UI)
celery -A tasks flower --port=5555 &
```

**확인 방법:**
```bash
# Flower UI 접속
open http://localhost:5555

# 직접 배치 실행
python -c "from tasks import process_ai_logs; result = process_ai_logs.delay(500); print(result.get(timeout=60))"
```

---

## 6. 부하 테스트 구성

### 6.1 k6 부하 스크립트

`~/demo/load/k6-demo.js`:

```javascript
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

export const options = {
    stages: [
        { duration: '30s', target: 10 },   // 워밍업: 10 VU까지 증가
        { duration: '1m',  target: 50 },   // 정상 부하: 50 VU 유지
        { duration: '30s', target: 100 },  // 피크 부하: 100 VU
        { duration: '30s', target: 200 },  // 과부하: 200 VU
        { duration: '30s', target: 0 },    // 종료
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],  // 95%가 2초 이내
        errors: ['rate<0.1'],               // 에러율 10% 미만
    },
};

const BASE_URLS = {
    java:   'http://localhost:8081',
    dotnet: 'http://localhost:8082',
    go:     'http://localhost:8083',
    python: 'http://localhost:8084',
    nodejs: 'http://localhost:8085',
};

export default function () {
    const langs = Object.keys(BASE_URLS);
    const lang = langs[Math.floor(Math.random() * langs.length)];
    const base = BASE_URLS[lang];

    const endpoints = ['/api/hello', '/api/hello', '/api/hello', '/api/slow'];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const res = http.get(`${base}${endpoint}`);

    const ok = check(res, {
        'status is 200': (r) => r.status === 200,
        'duration < 3000ms': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!ok);
    apiDuration.add(res.timings.duration, { lang, endpoint });

    sleep(Math.random() * 0.5);
}
```

**실행:**
```bash
mkdir -p ~/demo/load
# 위 스크립트 저장 후
k6 run ~/demo/load/k6-demo.js
```

---

### 6.2 RAG 부하 스크립트

`~/demo/load/k6-rag.js`:

```javascript
import http from 'k6/http';
import { sleep } from 'k6';

const QUESTIONS = [
    'XLog가 뭔가요?',
    'AITOP에서 GPU 사용률을 어떻게 보나요?',
    '플레임그래프는 어떻게 사용하나요?',
    'AI 서비스 모니터링이란?',
];

export const options = {
    vus: 5,
    duration: '2m',
};

export default function () {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

    http.post('http://localhost:8093/api/rag/query',
        JSON.stringify({ question }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    sleep(2 + Math.random() * 3);  // LLM은 처리 시간이 길므로 간격을 넓게
}
```

---

## 7. 전체 기동 순서

> 순서가 중요합니다. 단계별로 진행하세요.

### Step 1: 인프라 기동 (Docker 스택)

```bash
cd ~/workspace/aiservice-monitoring
docker compose -f docker-compose.demo.yaml up -d

# 모든 서비스 healthy 확인 (최대 2분 소요)
docker compose -f docker-compose.demo.yaml ps
```

### Step 2: AI 서비스 기동

```bash
# 터미널 1: Ollama (이미 brew service로 실행 중 — 확인만)
curl http://localhost:11434/api/tags

# 터미널 2: RAG 서비스
cd ~/demo/rag-demo && source .venv/bin/activate
uvicorn rag_service:app --host 0.0.0.0 --port 8093

# 터미널 3: 가드레일 서비스
cd ~/demo/guardrail-demo && source ~/demo/python-demo/.venv/bin/activate
uvicorn guardrail_service:app --host 0.0.0.0 --port 8094
```

### Step 3: 언어별 데모 앱 기동

```bash
# 터미널 4: Java
cd ~/demo/java-demo && ./mvnw spring-boot:run

# 터미널 5: .NET
cd ~/demo/dotnet-demo && dotnet run

# 터미널 6: Go
cd ~/demo/go-demo && go run main.go

# 터미널 7: Python FastAPI
cd ~/demo/python-demo && source .venv/bin/activate && uvicorn main:app --port 8084

# 터미널 8: Node.js
cd ~/demo/nodejs-demo && node app.js
```

### Step 4: 배치 사이트 기동

```bash
# 터미널 9: Redis (이미 Docker로 실행 중 확인)
docker ps | grep demo-redis

# 터미널 10: Celery Worker
cd ~/demo/batch-python && source .venv/bin/activate
celery -A tasks worker --loglevel=info

# 터미널 11: Flower (배치 모니터링)
celery -A tasks flower --port=5555
```

### Step 5: 부하 발생 (시연 직전)

```bash
# 5개 언어 동시 부하
k6 run ~/demo/load/k6-demo.js &

# RAG 부하 (별도 터미널)
k6 run ~/demo/load/k6-rag.js &
```

### Step 6: 브라우저 탭 미리 열기

```
http://localhost:3000          — AITOP 대시보드 (메인)
http://localhost:16686         — Jaeger 트레이싱 UI
http://localhost:9090          — Prometheus
http://localhost:5555          — Flower (Celery 배치 모니터링)
http://localhost:8093/docs     — RAG 서비스 API 문서
```

---

## 8. 동작 확인 체크리스트

시연 시작 전 아래 항목을 모두 확인합니다:

```
[ ] docker compose ps — 모든 서비스 Up (healthy)
[ ] curl http://localhost:8080/health — AITOP 서버 OK
[ ] curl http://localhost:3000 — 프론트엔드 접속 OK
[ ] curl http://localhost:8081/api/hello — Java 앱 응답 OK
[ ] curl http://localhost:8082/weatherforecast — .NET 앱 응답 OK
[ ] curl http://localhost:8083/api/hello — Go 앱 응답 OK
[ ] curl http://localhost:8084/api/hello — Python 앱 응답 OK
[ ] curl http://localhost:8085/api/hello — Node.js 앱 응답 OK
[ ] curl http://localhost:11434/api/tags — Ollama 모델 목록 OK
[ ] RAG 서비스 응답 확인 (포트 8093)
[ ] Flower UI http://localhost:5555 접속 OK
[ ] AITOP 대시보드에서 5개 앱 메트릭 수신 확인
[ ] k6 부하 발생 → XLog에 점 찍히는지 확인
```

---

## 9. 트러블슈팅 가이드

### 문제 1: Docker Desktop 메모리 부족

**증상**: 컨테이너가 OOMKilled 상태
**해결**: Docker Desktop → Settings → Resources → Memory를 64GB로 증가

```bash
# 메모리 사용량 확인
docker stats --no-stream
```

### 문제 2: Ollama 모델 로딩 느림

**증상**: LLM 첫 응답에 10초 이상 소요
**해결**: 모델을 미리 워밍업

```bash
# 시연 30분 전에 실행
curl http://localhost:11434/api/generate -d '{"model":"llama3.2:3b","prompt":"안녕","stream":false}'
```

### 문제 3: AITOP Agent 연결 안 됨

**증상**: 대시보드에 앱 메트릭 미수신
**해결**:
```bash
# OTel Collector 포트 확인
nc -zv localhost 4317
nc -zv localhost 4318

# Jaeger 수신 확인
curl http://localhost:16686/api/services
```

### 문제 4: 포트 충돌

```bash
# 사용 중인 포트 확인
lsof -i :8081 -i :8082 -i :8083 -i :8084 -i :8085
# 해당 프로세스 종료
kill -9 <PID>
```

### 문제 5: k6 실행 오류

```bash
# k6 재설치
brew reinstall k6

# 권한 오류 시
sudo k6 run ~/demo/load/k6-demo.js
```

### 문제 6: Qdrant 연결 오류 (RAG)

```bash
# Qdrant 상태 확인
curl http://localhost:6333/health

# 컨테이너 재시작
docker compose -f docker-compose.demo.yaml restart qdrant
```

### 긴급 상황: 전체 재시작

```bash
# 모든 종료
docker compose -f docker-compose.demo.yaml down
pkill -f "uvicorn\|go run\|node app\|mvnw\|celery"

# 재기동 (7. 전체 기동 순서 반복)
docker compose -f docker-compose.demo.yaml up -d
```

---

> **팁**: 시연 전날 전체 기동 리허설을 한 번 해두면 당일 당황하지 않습니다.
> 각 터미널에 iTerm2 프로파일 이름을 붙여두면 시연 중 빠르게 전환할 수 있습니다.
