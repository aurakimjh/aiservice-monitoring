# AITOP 시연 환경 구성 가이드 — Windows 11 (64GB RAM)

> **대상 독자**: Windows 환경에서 시연 환경을 구성하는 누구나 (초보자도 OK)
> **환경**: Windows 11 Pro, 64GB RAM (macOS 대비 메모리 절반 — 경량 구성 필요)
> **macOS 가이드와의 차이점**: WSL2 + Docker Desktop 기반, 메모리 최적화 구성
> **최종 업데이트**: 2026-03-28
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`
>
> **macOS 가이드 참고**: [DEMO_SETUP_GUIDE_MAC.md](./DEMO_SETUP_GUIDE_MAC.md)
> — 이 문서는 macOS 가이드와의 **차이점 중심**으로 작성되었습니다.
> 앱 코드(데모 앱 내용, k6 스크립트 등)는 macOS 가이드와 동일합니다.

---

## 목차

1. [macOS와의 핵심 차이점 요약](#1-macos와의-핵심-차이점-요약)
2. [WSL2 설치 및 구성](#2-wsl2-설치-및-구성)
3. [Docker Desktop 설치 및 WSL2 연동](#3-docker-desktop-설치-및-wsl2-연동)
4. [개발 도구 설치 (Windows 네이티브)](#4-개발-도구-설치-windows-네이티브)
5. [64GB 메모리 최적화 구성](#5-64gb-메모리-최적화-구성)
6. [경량 docker-compose.demo-win.yaml](#6-경량-docker-composedemowinyaml)
7. [Ollama 설치 및 경량 LLM 구성](#7-ollama-설치-및-경량-llm-구성)
8. [언어별 데모 앱 구성 (Windows 차이점)](#8-언어별-데모-앱-구성-windows-차이점)
9. [전체 기동 순서 (Windows)](#9-전체-기동-순서-windows)
10. [동작 확인 체크리스트](#10-동작-확인-체크리스트)
11. [Windows 전용 트러블슈팅](#11-windows-전용-트러블슈팅)

---

## 1. macOS와의 핵심 차이점 요약

| 항목 | macOS M5 Max (128GB) | Windows 11 (64GB) |
|------|---------------------|------------------|
| 실행 방식 | 네이티브 | WSL2 + Docker Desktop |
| 메모리 할당 | Docker 64GB 자유 | WSL2 16GB, Docker 24GB (최적화 필요) |
| LLM 모델 | llama3.1:8b 가능 | llama3.2:3b 권장 (메모리 절약) |
| 터미널 | Terminal / iTerm2 | Windows Terminal + PowerShell / WSL2 bash |
| 파일 경로 | `/Users/...` | `C:\...` (Windows) / `/home/...` (WSL2) |
| Homebrew | 사용 | 사용 안 함 (winget / Chocolatey 사용) |
| 네트워크 | `localhost` 직접 | WSL2 IP 주의 (보통 `localhost`로 포워딩됨) |
| GPU | Apple GPU (Metal) | NVIDIA GPU 또는 CPU 추론 |
| 동시 실행 앱 수 | 10개 이상 가능 | 메모리 절약을 위해 7~8개로 제한 |

---

## 2. WSL2 설치 및 구성

> WSL2(Windows Subsystem for Linux 2)는 Windows에서 Linux를 실행하는 가상화 기술입니다.
> Docker Desktop이 WSL2를 백엔드로 사용합니다.

### 2.1 WSL2 설치

PowerShell을 **관리자 권한**으로 열고 실행:

```powershell
# WSL2 설치 (Ubuntu 22.04 기본 포함)
wsl --install

# 설치 후 재부팅 필요
Restart-Computer
```

재부팅 후 Ubuntu 창이 자동으로 열리면:
```bash
# Ubuntu 사용자 이름 / 비밀번호 설정
# (영문 소문자 권장, 기억하기 쉬운 비밀번호 설정)
```

**확인 방법 (PowerShell):**
```powershell
wsl --list --verbose
# Ubuntu   Running   2   ← 버전 2 인지 확인
```

---

### 2.2 WSL2 메모리 제한 설정 (중요!)

> Windows 64GB 환경에서 WSL2가 메모리를 무제한으로 가져가면
> Windows 자체가 불안정해집니다. 반드시 제한을 설정하세요.

`C:\Users\[사용자명]\.wslconfig` 파일 생성:

```ini
[wsl2]
memory=20GB          # WSL2에 최대 20GB 할당
processors=10        # 물리 코어 수의 60% 정도
swap=4GB
localhostForwarding=true
nestedVirtualization=false
```

설정 적용:
```powershell
wsl --shutdown
wsl -d Ubuntu
```

**확인 방법 (WSL2 내부 bash):**
```bash
free -h
# total이 약 20GB로 보이면 성공
```

---

### 2.3 WSL2 Ubuntu 기본 설정

WSL2 Ubuntu 터미널에서:

```bash
# 패키지 목록 업데이트
sudo apt update && sudo apt upgrade -y

# 기본 빌드 도구
sudo apt install -y build-essential curl git wget unzip

# 작업 디렉토리 생성
mkdir -p ~/workspace ~/demo
```

---

## 3. Docker Desktop 설치 및 WSL2 연동

### 3.1 Docker Desktop 설치

Windows에서 브라우저를 열고 Docker Desktop 공식 사이트에서 다운로드 후 설치.

설치 옵션:
- ✅ "Use WSL 2 instead of Hyper-V" 선택
- ✅ "Add shortcut to desktop" 선택

### 3.2 Docker Desktop 설정

Docker Desktop 아이콘 → Settings:

**General 탭:**
- ✅ "Use the WSL 2 based engine" 체크

**Resources > WSL Integration 탭:**
- ✅ Ubuntu 활성화

**Resources > Advanced 탭:**
```
Memory:  24 GB   (Windows에서 24GB 할당)
CPUs:    8
Swap:    2 GB
```

> **주의**: macOS의 64GB보다 적습니다.
> 이 제한이 이 가이드에서 경량 구성을 쓰는 이유입니다.

**확인 방법:**
```bash
# WSL2 내부에서
docker version
docker compose version
# 두 명령 모두 버전 출력되면 성공
```

---

## 4. 개발 도구 설치 (Windows 네이티브)

> Windows에서는 winget(Windows 패키지 매니저)을 사용합니다.
> PowerShell에서 실행하세요.

### 4.1 Java (Temurin 21)

```powershell
winget install --id EclipseAdoptium.Temurin.21.JDK -e
```

환경 변수 설정 (PowerShell):
```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-21.0.0.37-hotspot", "Machine")
[Environment]::SetEnvironmentVariable("PATH", $env:PATH + ";$env:JAVA_HOME\bin", "Machine")
```

새 PowerShell 창을 열고 확인:
```powershell
java -version
# openjdk version "21..." 출력되면 성공
```

---

### 4.2 .NET SDK 8

```powershell
winget install --id Microsoft.DotNet.SDK.8 -e
```

**확인 방법:**
```powershell
dotnet --version
# 8.0.x 출력되면 성공
```

---

### 4.3 Go

```powershell
winget install --id GoLang.Go -e
```

**확인 방법:**
```powershell
go version
# go version go1.22.x windows/amd64 출력되면 성공
```

---

### 4.4 Python 3.12

```powershell
winget install --id Python.Python.3.12 -e
```

**확인 방법:**
```powershell
python --version
# Python 3.12.x 출력되면 성공

pip --version
# pip 24.x.x 출력되면 성공
```

---

### 4.5 Node.js 20 LTS

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

**확인 방법:**
```powershell
node --version   # v20.x.x
npm --version    # 10.x.x
```

---

### 4.6 Git (이미 있으면 생략)

```powershell
winget install --id Git.Git -e
```

설치 후 Git Bash를 기본 터미널로 사용하거나 **Windows Terminal + PowerShell** 사용.

---

### 4.7 k6

```powershell
winget install --id k6.k6 -e
```

**확인 방법:**
```powershell
k6 version
# k6 v0.5x.x 출력되면 성공
```

---

### 4.8 Windows Terminal 설치 (권장)

```powershell
winget install --id Microsoft.WindowsTerminal -e
```

Windows Terminal에서 탭을 여러 개 열어 각 서비스를 분리해서 관리합니다.

---

## 5. 64GB 메모리 최적화 구성

### 5.1 메모리 배분 계획

| 구성요소 | 메모리 | 비고 |
|---------|--------|------|
| Windows OS | ~8GB | 기본 사용량 |
| WSL2 커널 | ~1GB | |
| Docker Desktop | ~1GB | |
| Docker 컨테이너들 | ~20GB | PostgreSQL, Prometheus, Jaeger, AITOP, Qdrant |
| Ollama LLM (llama3.2:3b) | ~4GB | 경량 모델 사용 |
| Java 앱 | ~1GB | |
| .NET 앱 | ~0.5GB | |
| Go 앱 | ~0.2GB | |
| Python 앱 (FastAPI) | ~0.5GB | |
| Node.js 앱 | ~0.3GB | |
| Python Celery | ~0.5GB | |
| RAG 서비스 | ~0.5GB | |
| 여유 | ~6.5GB | |
| **합계** | **~44GB** | 64GB 중 44GB 사용 |

---

### 5.2 macOS 대비 비활성화할 서비스

64GB 환경에서는 다음 서비스를 선택적으로 비활성화합니다:

- **Flower (Celery 모니터링 UI)**: 시연 필요 시에만 실행
- **AI 가드레일 서비스**: 배치 시연과 동시에 실행하지 않음
- **llama3.1:8b 모델**: llama3.2:3b로 대체
- **k6 RAG 부하**: 일반 앱 부하와 동시에 실행하지 않음

---

## 6. 경량 docker-compose.demo-win.yaml

> macOS 버전에서 Qdrant 외 서비스 메모리를 줄인 버전입니다.

`docker-compose.demo-win.yaml`:

```yaml
# AITOP Demo Stack — Windows 11 64GB 최적화 버전
# macOS 버전과 비교: 메모리 제한 추가, 리소스 최소화

services:

  postgres:
    image: postgres:16-alpine
    container_name: aitop-win-postgres
    environment:
      POSTGRES_DB: aitop
      POSTGRES_USER: aitop
      POSTGRES_PASSWORD: aitop_demo_2026
    ports:
      - "5432:5432"
    volumes:
      - win_postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 1G       # macOS는 제한 없음, Win은 1GB로 제한
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aitop"]
      interval: 10s
      timeout: 5s
      retries: 5

  prometheus:
    image: prom/prometheus:v2.53.0
    container_name: aitop-win-prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=3d"    # macOS 7일 → 3일로 단축
    volumes:
      - ./infra/docker/prometheus.demo.yml:/etc/prometheus/prometheus.yml:ro
      - win_prometheus_data:/prometheus
    ports:
      - "9090:9090"
    deploy:
      resources:
        limits:
          memory: 2G

  jaeger:
    image: jaegertracing/all-in-one:1.58
    container_name: aitop-win-jaeger
    environment:
      - COLLECTOR_OTLP_ENABLED=true
      - SPAN_STORAGE_TYPE=memory
      - "MEMORY_MAX_TRACES=5000"    # 메모리 트레이스 수 제한
    ports:
      - "16686:16686"
      - "14268:14268"
      - "4317:4317"
      - "4318:4318"
    deploy:
      resources:
        limits:
          memory: 2G

  aitop-server:
    build:
      context: ./collector
      dockerfile: ../infra/docker/Dockerfile.collection-server
    container_name: aitop-win-server
    ports:
      - "8080:8080"
    environment:
      - AITOP_DB_URL=postgres://aitop:aitop_demo_2026@postgres:5432/aitop
      - AITOP_JAEGER_URL=http://jaeger:14268/api/traces
      - AITOP_PROMETHEUS_URL=http://prometheus:9090
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  aitop-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: aitop-win-frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_BASE_URL=http://localhost:8080
    depends_on:
      - aitop-server
    deploy:
      resources:
        limits:
          memory: 1G

  qdrant:
    image: qdrant/qdrant:v1.9.0
    container_name: aitop-win-qdrant
    ports:
      - "6333:6333"
    volumes:
      - win_qdrant_data:/qdrant/storage
    deploy:
      resources:
        limits:
          memory: 2G

volumes:
  win_postgres_data:
  win_prometheus_data:
  win_qdrant_data:
```

**기동:**
```powershell
# Windows PowerShell에서
cd C:\workspace\aiservice-monitoring
docker compose -f docker-compose.demo-win.yaml up -d --build

# 또는 WSL2 bash에서
docker compose -f docker-compose.demo-win.yaml up -d --build
```

**확인 방법:**
```bash
docker compose -f docker-compose.demo-win.yaml ps
# 모든 서비스가 Up (healthy) 상태여야 함
```

---

## 7. Ollama 설치 및 경량 LLM 구성

### 7.1 Ollama 설치 (Windows 네이티브)

PowerShell:
```powershell
winget install --id Ollama.Ollama -e
```

또는 공식 사이트에서 `.exe` 다운로드 후 설치.

설치 후 시스템 트레이에 Ollama 아이콘이 생깁니다.

---

### 7.2 NVIDIA GPU가 있는 경우 (선택)

> NVIDIA GPU가 있으면 CUDA를 통해 GPU 추론이 가능합니다.
> GPU가 없으면 CPU 추론 — 속도가 느리지만 시연은 가능합니다.

```powershell
# CUDA 지원 확인
nvidia-smi
# CUDA Version이 출력되면 GPU 추론 사용 가능
```

Ollama는 CUDA를 자동으로 감지하여 사용합니다.

---

### 7.3 경량 모델 다운로드 (64GB 환경)

```powershell
# PowerShell 또는 명령 프롬프트에서

# 필수 (시연 필수)
ollama pull llama3.2:3b         # 2.0GB — 기본 LLM
ollama pull nomic-embed-text    # 274MB — RAG 임베딩

# 선택 (메모리 여유 시)
# ollama pull mistral:7b        # 4.1GB — macOS는 가능, Win은 주의
```

> **주의**: Windows 64GB 환경에서 `llama3.1:8b`(4.7GB) 이상 모델은
> 다른 서비스와 동시 실행 시 메모리 부족이 발생할 수 있습니다.
> `llama3.2:3b`(2.0GB)를 강력 권장합니다.

**확인 방법:**
```powershell
ollama list
# 모델 목록 출력

curl http://localhost:11434/api/tags
# JSON 응답 확인
```

---

## 8. 언어별 데모 앱 구성 (Windows 차이점)

> **앱 코드 자체는 macOS 가이드와 동일**합니다.
> Windows에서의 차이점(경로, 명령어, 환경변수)만 기술합니다.

### 8.1 디렉토리 구성 (Windows)

```powershell
# PowerShell에서
mkdir C:\demo\java-demo
mkdir C:\demo\dotnet-demo
mkdir C:\demo\go-demo
mkdir C:\demo\python-demo
mkdir C:\demo\nodejs-demo
mkdir C:\demo\rag-demo
mkdir C:\demo\guardrail-demo
mkdir C:\demo\batch-python
mkdir C:\demo\load
```

---

### 8.2 Java — Spring Boot (Windows 차이점)

**`JAVA_HOME` 확인:**
```powershell
$env:JAVA_HOME
# C:\Program Files\Eclipse Adoptium\jdk-21.0.0.37-hotspot 출력
```

**실행 (PowerShell):**
```powershell
cd C:\demo\java-demo\java-demo
.\mvnw.cmd spring-boot:run -Dspring-boot.run.jvmArguments="-javaagent:C:\Users\$env:USERNAME\.aitop\agent\aitop-agent-java.jar"
```

> **macOS 차이**: `./mvnw` → `.\mvnw.cmd`

---

### 8.3 Python — FastAPI / RAG / 가드레일 (Windows 차이점)

**가상환경 활성화 (Windows):**
```powershell
# PowerShell에서 실행 정책 변경 (최초 1회)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 가상환경 활성화
cd C:\demo\python-demo
python -m venv .venv
.\.venv\Scripts\activate  # macOS: source .venv/bin/activate

pip install fastapi uvicorn opentelemetry-api ...
```

**실행:**
```powershell
# 활성화된 상태에서
uvicorn main:app --host 0.0.0.0 --port 8084 --reload
```

---

### 8.4 Node.js (Windows 차이점)

```powershell
cd C:\demo\nodejs-demo
npm install
node app.js
```

> Windows에서는 Ctrl+C로 종료 시 "Terminate batch job? (Y/N)" 물음에 Y를 입력합니다.

---

### 8.5 Go (Windows 차이점)

```powershell
cd C:\demo\go-demo
go run main.go
```

> Windows에서 `go run`이 방화벽 접근 요청을 할 수 있습니다. "허용"을 클릭하세요.

---

### 8.6 Celery — Windows 제약사항 (중요!)

> **Windows에서 Celery는 네이티브 실행이 제한됩니다.**
> `--pool=solo` 옵션을 사용하거나, WSL2 내부에서 실행하세요.

**방법 1 — Windows에서 `--pool=solo` (단순 시연용):**
```powershell
cd C:\demo\batch-python
.\.venv\Scripts\activate
celery -A tasks worker --loglevel=info --pool=solo
```

**방법 2 — WSL2 내부에서 실행 (권장):**
```bash
# WSL2 Ubuntu bash에서
cd /mnt/c/demo/batch-python
source .venv/bin/activate
pip install celery redis
celery -A tasks worker --loglevel=info
```

> Flower도 WSL2 내부에서 실행:
```bash
celery -A tasks flower --port=5555
```
브라우저에서 `http://localhost:5555` 접속 가능 (WSL2의 localhost는 Windows에서도 접근됨)

---

## 9. 전체 기동 순서 (Windows)

> Windows Terminal의 탭 기능을 적극 활용하세요.
> 탭마다 역할 이름을 붙여두면 시연 중 빠르게 전환됩니다.

### Step 1: Docker 스택 기동 (PowerShell 탭 1)

```powershell
cd C:\workspace\aiservice-monitoring
docker compose -f docker-compose.demo-win.yaml up -d --build

# 상태 확인 (모두 Up healthy가 될 때까지 대기, 약 2~3분)
docker compose -f docker-compose.demo-win.yaml ps
```

### Step 2: Ollama 확인 (시스템 트레이)

Ollama가 시스템 트레이에서 실행 중인지 확인.
```powershell
curl http://localhost:11434/api/tags
```

### Step 3: AI 서비스 기동 (PowerShell 탭 2, 3)

```powershell
# 탭 2 — RAG 서비스
cd C:\demo\rag-demo
.\.venv\Scripts\activate
uvicorn rag_service:app --host 0.0.0.0 --port 8093

# 탭 3 — 가드레일 (메모리 여유 있을 때)
cd C:\demo\guardrail-demo
.\.venv\Scripts\activate
uvicorn guardrail_service:app --host 0.0.0.0 --port 8094
```

### Step 4: 언어별 데모 앱 (탭 4~8) — OTel 계측 포함

> **v1.1 업데이트**: `C:\workspace\demo-site`에 5개 언어 OTel 계측이 내장되어 있습니다.
> `OTEL_EXPORTER_OTLP_ENDPOINT` 환경변수를 설정하면 자동으로 트레이스/메트릭이 수집됩니다.
> 환경변수를 설정하지 않으면 OTel 없이 앱만 실행됩니다.

```powershell
# 탭 4 — Java (OTel javaagent 자동 계측)
cd C:\workspace\demo-site\java-app
.\start-otel.bat
# 또는 기존 방식: cd C:\demo\java-demo\java-demo && .\mvnw.cmd spring-boot:run

# 탭 5 — .NET (OTel SDK 내장)
cd C:\workspace\demo-site\dotnet-app
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
dotnet run
# 또는 기존 방식: cd C:\demo\dotnet-demo\DotNetDemo && dotnet run

# 탭 6 — Go (OTel SDK — otelgin + otelpgx + redisotel)
cd C:\workspace\demo-site\go-app
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
$env:OTEL_SERVICE_NAME = "go-demo-app"
go run .
# 또는 기존 방식: cd C:\demo\go-demo && go run main.go

# 탭 7 — Python FastAPI (OTel SDK — FastAPI + psycopg + Redis + httpx)
cd C:\workspace\demo-site\python-app
pip install -r requirements.txt
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318"
$env:OTEL_SERVICE_NAME = "python-demo-app"
uvicorn main:app --port 8084
# 또는 기존 방식: cd C:\demo\python-demo && uvicorn main:app --port 8084

# 탭 8 — Node.js (OTel SDK — Express + pg + ioredis)
cd C:\workspace\demo-site\nodejs-app
npm install
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318"
$env:OTEL_SERVICE_NAME = "nodejs-demo-app"
node app.js
# 또는 기존 방식: cd C:\demo\nodejs-demo && node app.js
```

> **v1.3 참고**: RAG 서비스(`C:\demo\rag-demo`)를 실행하면 OTel GenAI span이 자동 생성됩니다.
> LLM 호출(Ollama), 임베딩, 벡터 검색 단계가 각각 span으로 기록되어
> AITOP AI 대시보드에서 확인할 수 있습니다.
>
> **AI 대시보드 접속 경로**:
> - AI Overview: `http://localhost:3000/ai/overview` — LLM 호출 현황, 토큰 비용, 모델 성능
> - LLM Traces: `http://localhost:3000/ai/llm-traces` — 개별 LLM 호출 트레이스 조회
> - AI Diagnostics: `http://localhost:3000/ai/diagnostics` — AI 서비스 자동 진단 결과

### Step 5: 배치 서비스 (WSL2 bash 탭)

```bash
# Windows Terminal에서 Ubuntu(WSL) 탭 열기
cd /mnt/c/demo/batch-python
source .venv/bin/activate
celery -A tasks worker --loglevel=info &
celery -A tasks flower --port=5555 &
```

### Step 6: 부하 발생 (시연 직전)

```powershell
# PowerShell 탭에서
k6 run C:\demo\load\k6-demo.js
```

### Step 7: 브라우저 탭 준비

```
http://localhost:3000          — AITOP 대시보드
http://localhost:16686         — Jaeger
http://localhost:9090          — Prometheus
http://localhost:5555          — Flower
```

---

## 10. 동작 확인 체크리스트

```
[ ] docker compose -f docker-compose.demo-win.yaml ps — 모두 Up(healthy)
[ ] curl http://localhost:8080/health — AITOP 서버 OK
[ ] curl http://localhost:3000 — 프론트엔드 OK
[ ] curl http://localhost:8081/api/hello — Java OK
[ ] curl http://localhost:8082/weatherforecast — .NET OK
[ ] curl http://localhost:8083/api/hello — Go OK
[ ] curl http://localhost:8084/api/hello — Python OK
[ ] curl http://localhost:8085/api/hello — Node.js OK
[ ] curl http://localhost:11434/api/tags — Ollama OK
[ ] curl http://localhost:8093/docs — RAG 서비스 OK
[ ] http://localhost:5555 — Flower UI OK
[ ] AITOP 대시보드에서 5개 앱 메트릭 확인
[ ] k6 실행 → XLog에 데이터 수신 확인
[ ] 작업 관리자에서 메모리 총 사용량 확인 (50GB 이하 권장)
```

---

## 11. Windows 전용 트러블슈팅

### 문제 1: WSL2 메모리 부족 / Windows 멈춤

**증상**: 서비스 기동 후 Windows 전체가 느려짐
**해결**:
```powershell
# WSL2 강제 종료 후 .wslconfig 메모리 제한 확인
wsl --shutdown

# 메모리 사용량 확인 후 재기동
# 작업 관리자 → 성능 탭에서 현재 사용량 확인
wsl -d Ubuntu
```

---

### 문제 2: Docker Desktop "WSL integration" 오류

**증상**: `docker: command not found` (WSL2 내부)
**해결**:
1. Docker Desktop → Settings → Resources → WSL Integration
2. Ubuntu 토글 활성화
3. "Apply & Restart" 클릭
4. WSL2 재시작: `wsl --shutdown && wsl -d Ubuntu`

---

### 문제 3: PowerShell 스크립트 실행 정책 오류

**증상**: `cannot be loaded because running scripts is disabled`
**해결**:
```powershell
# 관리자 PowerShell에서
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
```

---

### 문제 4: Celery가 Windows에서 실행 안 됨

**증상**: `ValueError: not enough values to unpack` 또는 즉시 종료
**해결**: WSL2에서 실행하거나 `--pool=solo` 옵션 사용

```powershell
celery -A tasks worker --loglevel=info --pool=solo
```

---

### 문제 5: 포트 충돌 (Windows)

**증상**: `bind: address already in use`
**해결**:
```powershell
# 포트 사용 확인
netstat -ano | findstr :8081
netstat -ano | findstr :8084

# PID로 프로세스 종료
taskkill /PID <PID> /F
```

---

### 문제 6: WSL2에서 Windows 앱 포트 접근 안 됨

**증상**: WSL2 내부에서 `curl http://localhost:8081` 실패
**해결**: Windows IP 사용

```bash
# WSL2 내부에서 Windows IP 확인
cat /etc/resolv.conf | grep nameserver
# 출력된 IP가 Windows 게이트웨이 IP

# 해당 IP로 접근
curl http://172.17.x.x:8081/api/hello
```

또는 `.wslconfig`에 `localhostForwarding=true` 설정 확인 (2.1에서 설정함).

---

### 문제 7: Java mvnw.cmd 실행 권한 오류

**증상**: `.\mvnw.cmd : 이 시스템에서 스크립트를 실행할 수 없습니다`
**해결**:
```powershell
# 실행 정책 변경
Set-ExecutionPolicy RemoteSigned -Scope Process

# 또는 직접 실행
cmd /c mvnw.cmd spring-boot:run
```

---

### 문제 8: Ollama GPU 미사용 (NVIDIA GPU 있는 경우)

**증상**: LLM 응답이 매우 느림 (1분 이상)
**해결**:
```powershell
# CUDA 설치 확인
nvidia-smi

# Ollama 재시작
# 시스템 트레이 Ollama 아이콘 우클릭 → Quit
# 다시 시작
ollama serve
```

---

### 긴급 상황: 전체 재시작 (Windows)

```powershell
# Docker 스택 종료
docker compose -f docker-compose.demo-win.yaml down

# Windows 앱 종료 (PowerShell)
Get-Process -Name "java","dotnet","go","node","python","uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force

# WSL2 종료 (Celery 등)
wsl --shutdown

# 3분 후 재기동 (9. 전체 기동 순서 반복)
```

---

> **팁**: Windows Terminal 설정에서 프로파일별 색상과 이름을 지정해두면
> 10개 탭을 열어도 한 번에 찾을 수 있습니다.
> 예: "Docker" 탭은 파란색, "Java" 탭은 빨간색, "Python" 탭은 초록색.
>
> 시연 전날 전체 기동 리허설을 반드시 해두세요.
> Windows 환경은 macOS보다 재시작 시간이 더 걸립니다.
