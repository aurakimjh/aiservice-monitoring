# 로컬 개발 환경 구성 가이드 (LOCAL_SETUP.md)

> **프로젝트**: OpenTelemetry 기반 AI 서비스 성능 모니터링 솔루션
> **대상 독자**: aiservice-monitoring 프로젝트에 처음 합류하는 개발자
> **최종 업데이트**: 2026-03-02
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`

이 문서를 순서대로 따라 하면, **환경 설정에 소요되는 시간 없이** 첫날부터 코드를 작성하고 로컬에서 메트릭·트레이스를 확인할 수 있습니다.

---

## 목차

1. [사전 요구사항 체크리스트](#1-사전-요구사항-체크리스트)
2. [공통 런타임 설치](#2-공통-런타임-설치)
   - [2-1. Python 3.10+ 및 가상환경(venv)](#2-1-python-310-및-가상환경venv)
   - [2-2. Node.js (nvm 방식)](#2-2-nodejs-nvm-방식)
   - [2-3. Go SDK](#2-3-go-sdk)
3. [로컬 인프라 (Docker Compose)](#3-로컬-인프라-docker-compose)
4. [환경 변수 관리 (.env)](#4-환경-변수-관리-env)
5. [VS Code 설정](#5-vs-code-설정)
   - [5-1. 필수 확장(Extensions)](#5-1-필수-확장extensions)
   - [5-2. settings.json](#5-2-settingsjson)
   - [5-3. launch.json (디버그 구성)](#5-3-launchjson-디버그-구성)
6. [JetBrains IDE 설정](#6-jetbrains-ide-설정)
   - [6-1. 플러그인 설치](#6-1-플러그인-설치)
   - [6-2. 프로젝트 SDK 및 모듈 구성](#6-2-프로젝트-sdk-및-모듈-구성)
   - [6-3. Run/Debug Configurations](#6-3-rundebug-configurations)
7. [Git 및 GitHub 연동](#7-git-및-github-연동)
8. [첫 실행 검증 체크리스트](#8-첫-실행-검증-체크리스트)
9. [자주 발생하는 문제 (Troubleshooting)](#9-자주-발생하는-문제-troubleshooting)

---

## 1. 사전 요구사항 체크리스트

시작 전, 아래 항목이 모두 설치되어 있는지 확인합니다.

| 도구 | 최소 버전 | 확인 명령어 | 설치 링크 |
|------|-----------|------------|-----------|
| Git | 2.40+ | `git --version` | https://git-scm.com/downloads |
| Python | 3.10+ | `python --version` | https://www.python.org/downloads/ |
| Node.js | 20 LTS | `node --version` | nvm으로 설치 (§2-2 참고) |
| Go | 1.22+ | `go version` | https://go.dev/dl/ |
| Docker Desktop | 4.30+ | `docker --version` | https://www.docker.com/products/docker-desktop/ |
| Docker Compose | v2.x | `docker compose version` | Docker Desktop에 포함 |

> **Windows 사용자 주의**: 이 프로젝트의 모든 명령어는 **Git Bash** 또는 **WSL2** 터미널 기준입니다.
> PowerShell에서 실행하면 경로 구분자(`\`/`/`) 문제가 발생할 수 있습니다.

---

## 2. 공통 런타임 설치

### 2-1. Python 3.10+ 및 가상환경(venv)

#### 설치 확인

```bash
python --version
# Python 3.10.x 이상이어야 함
# Windows에서 python3로 호출해야 하는 경우:
python3 --version
```

#### 프로젝트 가상환경 생성

**모든 Python 서비스는 반드시 독립된 가상환경에서 실행합니다.** 전역 Python 환경을 오염시키지 않기 위함입니다.

```bash
# 프로젝트 루트로 이동
cd /c/workspace/aiservice-monitoring

# Python SDK 계측 코드용 가상환경 생성
cd sdk-instrumentation/python
python -m venv .venv

# 가상환경 활성화
# (Git Bash / Linux / macOS)
source .venv/bin/activate
# (Windows PowerShell)
# .venv\Scripts\Activate.ps1

# 활성화 확인 (프롬프트 앞에 (.venv)가 표시되어야 함)
which python
# /c/workspace/aiservice-monitoring/sdk-instrumentation/python/.venv/Scripts/python

# OpenTelemetry SDK 의존성 설치
pip install --upgrade pip
pip install \
  opentelemetry-sdk \
  opentelemetry-api \
  opentelemetry-exporter-otlp-proto-grpc \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-httpx \
  opentelemetry-instrumentation-redis \
  opentelemetry-instrumentation-pymongo \
  fastapi \
  uvicorn[standard] \
  httpx \
  langchain \
  langchain-openai \
  sentence-transformers

# 설치 목록을 requirements.txt로 저장 (팀원과 공유)
pip freeze > requirements.txt
```

> **팁**: 이미 `requirements.txt`가 있다면 `pip install -r requirements.txt` 한 줄로 해결됩니다.

#### 환경 변수로 가상환경 자동 활성화 (.bashrc / .zshrc)

매번 `source .venv/bin/activate`를 입력하기 번거롭다면, VS Code의 자동 활성화 기능을 활용하세요 (§5-2 참고).

---

### 2-2. Node.js (nvm 방식)

Node.js는 **nvm(Node Version Manager)** 으로 설치하면 프로젝트별 버전 전환이 쉽습니다.

#### nvm 설치 (Windows: nvm-windows)

1. https://github.com/coreybutler/nvm-windows/releases 에서 `nvm-setup.exe` 다운로드
2. 설치 후 터미널 재시작
3. 설치 확인:

```bash
nvm --version
# 1.1.x
```

#### Node.js LTS 버전 설치

```bash
# Node.js 20 LTS 설치
nvm install 20
nvm use 20
nvm alias default 20

# 설치 확인
node --version   # v20.x.x
npm --version    # 10.x.x
```

#### Node.js 의존성 설치

```bash
cd /c/workspace/aiservice-monitoring/sdk-instrumentation/nodejs

# package.json이 있는 경우
npm install

# 없는 경우 직접 설치 (최초 1회)
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/core
```

---

### 2-3. Go SDK

#### Go 설치 확인

```bash
go version
# go version go1.22.x windows/amd64
```

#### GOPATH 및 환경 변수 설정

Go 설치 후 아래 환경 변수가 올바른지 확인합니다.

```bash
# 현재 설정 확인
go env GOPATH
go env GOROOT

# Windows 기준 기본값 (자동 설정됨):
# GOROOT = C:\Program Files\Go
# GOPATH = C:\Users\aurak\go
```

Git Bash `~/.bashrc` 또는 `~/.zshrc`에 추가 (없는 경우):

```bash
# Go 환경 변수
export GOPATH="$HOME/go"
export PATH="$GOPATH/bin:$PATH"
```

#### Go 모듈 및 의존성 설치

```bash
cd /c/workspace/aiservice-monitoring/sdk-instrumentation/go

# go.mod 파일 초기화 (없는 경우)
go mod init github.com/your-org/aiservice-monitoring/sdk-instrumentation/go

# OTel Go SDK 의존성 추가
go get go.opentelemetry.io/otel@latest
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc@latest
go get go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc@latest
go get go.opentelemetry.io/otel/sdk/trace@latest
go get go.opentelemetry.io/otel/sdk/metric@latest
go get go.opentelemetry.io/otel/sdk/resource@latest
go get go.opentelemetry.io/otel/semconv/v1.26.0@latest
go get google.golang.org/grpc@latest

# 의존성 정리
go mod tidy
```

---

## 3. 로컬 인프라 (Docker Compose)

개발 중에는 로컬에 경량 모니터링 스택을 띄워서 **실시간으로 메트릭과 트레이스를 확인**합니다.

### 구성 요소

| 서비스 | 역할 | 로컬 접속 주소 | 포트 |
|--------|------|--------------|------|
| **OTel Collector** | 텔레메트리 수집·변환·라우팅 허브 | http://localhost:13133/health | 4317(gRPC), 4318(HTTP) |
| **Prometheus** | 메트릭 저장 및 Alert 평가 | http://localhost:9090 | 9090 |
| **Grafana Tempo** | 트레이스(분산 추적) 백엔드 | http://localhost:3200 | 3200 |
| **Grafana Loki** | 로그 저장소 | http://localhost:3100 | 3100 |
| **Grafana** | 통합 시각화 대시보드 | http://localhost:3000 (admin/admin) | 3000 |
| **Jaeger UI** | 트레이스 빠른 확인용 (개발·디버깅) | http://localhost:16686 | 16686 |

### 스택 시작

```bash
# 프로젝트 루트에서 실행
cd /c/workspace/aiservice-monitoring

# 백그라운드로 전체 스택 시작
docker compose -f infra/docker/docker-compose.yaml up -d

# 시작 상태 확인 (모든 서비스가 "healthy" 또는 "running"이어야 함)
docker compose -f infra/docker/docker-compose.yaml ps
```

기대 출력:
```
NAME              IMAGE                                      STATUS          PORTS
otel-collector    otel/opentelemetry-collector-contrib:...   Up (healthy)    0.0.0.0:4317->4317/tcp, ...
prometheus        prom/prometheus:v2.53.0                    Up              0.0.0.0:9090->9090/tcp
tempo             grafana/tempo:2.5.0                        Up              0.0.0.0:3200->3200/tcp
loki              grafana/loki:3.1.0                         Up              0.0.0.0:3100->3100/tcp
grafana           grafana/grafana:11.1.0                     Up              0.0.0.0:3000->3000/tcp
jaeger            jaegertracing/all-in-one:1.58              Up              0.0.0.0:16686->16686/tcp
```

### Collector 동작 확인

```bash
# 헬스체크 (200 OK이면 정상)
curl http://localhost:13133/health

# zpages 디버깅 UI (파이프라인 상태 시각 확인)
# 브라우저에서 열기: http://localhost:55679/debug/tracez
```

### 스택 중지 및 데이터 초기화

```bash
# 컨테이너 중지 (데이터 볼륨 유지)
docker compose -f infra/docker/docker-compose.yaml down

# 컨테이너 + 데이터 볼륨 완전 삭제 (깨끗한 상태로 재시작)
docker compose -f infra/docker/docker-compose.yaml down -v
```

### Grafana 대시보드 즉시 확인

1. 브라우저에서 http://localhost:3000 접속
2. ID: `admin`, PW: `admin` 으로 로그인
3. 좌측 메뉴 → **Dashboards** 클릭
4. `AI Service Overview` 대시보드 선택

> 로컬에서 SDK를 통해 텔레메트리를 발생시키면 수 초 내에 대시보드에 반영됩니다.

---

## 4. 환경 변수 관리 (.env)

### 핵심 원칙

- **`.env` 파일은 절대 Git에 커밋하지 않습니다** (`.gitignore`에 이미 포함됨)
- API 키, 토큰 등 비밀 값은 `.env`에만 저장하고 코드에 하드코딩 금지
- 팀원에게는 `.env.example`을 통해 필요한 변수 목록만 공유

### .env.example 파일 (Git에 포함)

프로젝트 루트에 아래 파일을 만들어 팀원과 공유합니다:

```bash
# .env.example
# ────────────────────────────────────────────────────────────────
# 이 파일을 복사하여 .env로 저장 후 실제 값을 채워 넣으세요:
#   cp .env.example .env
# ────────────────────────────────────────────────────────────────

# ── OTel Collector 엔드포인트 ──────────────────────────────────
# 로컬 개발: Docker Compose로 띄운 Collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
# K8s 개발 클러스터: Agent DaemonSet 사용
# OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector-agent:4317

# ── 서비스 식별 정보 ─────────────────────────────────────────
DEPLOYMENT_ENV=development
SERVICE_NAME=my-service
SERVICE_VERSION=0.1.0
AI_SERVICE_LAYER=app  # app | guardrails | llm | vector_db | infra

# ── LLM API 키 (개발용) ──────────────────────────────────────
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# ── 벡터 DB ──────────────────────────────────────────────────
PINECONE_API_KEY=...
QDRANT_URL=http://localhost:6333

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── K8s Pod 정보 (로컬에서는 기본값 사용) ─────────────────────
POD_NAME=local-dev
POD_NAMESPACE=default
KUBE_NODE_NAME=local
```

### 실제 .env 파일 생성

```bash
cd /c/workspace/aiservice-monitoring

# 예시 파일을 복사하여 실제 .env 생성
cp .env.example .env

# 에디터로 열어 실제 값 입력
code .env          # VS Code
# 또는
idea .env          # IntelliJ
```

### Python에서 .env 로드

```python
# 서비스 엔트리포인트 최상단에 추가
from dotenv import load_dotenv
load_dotenv()  # .env 파일을 자동으로 읽어 os.environ에 등록

# 이후 os.getenv()로 사용
import os
endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
```

```bash
# python-dotenv 설치
pip install python-dotenv
```

### Node.js에서 .env 로드

```bash
npm install dotenv
```

```javascript
// 서비스 엔트리포인트 최상단
require('dotenv').config();
```

### .gitignore 확인

프로젝트 루트의 `.gitignore`에 아래 항목이 포함되어 있는지 확인합니다:

```gitignore
# 환경 변수 파일 (절대 커밋 금지)
.env
.env.local
.env.*.local
*.secret
```

---

## 5. VS Code 설정

### 5-1. 필수 확장(Extensions)

VS Code에서 `Ctrl+Shift+X`로 확장 패널을 열고 아래 확장을 설치합니다.

#### 언어 및 런타임 지원

| 확장명 | ID | 용도 |
|--------|-----|------|
| **Python** | `ms-python.python` | Python 언어 지원, IntelliSense, 디버거 |
| **Pylance** | `ms-python.vscode-pylance` | 고속 Python 타입 검사 및 자동완성 |
| **Go** | `golang.go` | Go 언어 지원, 디버거(Delve), 린터 |
| **ESLint** | `dbaeumer.vscode-eslint` | JavaScript/Node.js 코드 품질 검사 |
| **Prettier** | `esbenp.prettier-vscode` | 코드 자동 포맷팅 (JS/TS/YAML/JSON) |

#### 인프라 및 OTel 지원

| 확장명 | ID | 용도 |
|--------|-----|------|
| **Docker** | `ms-azuretools.vscode-docker` | Dockerfile, Compose 편집 및 컨테이너 관리 |
| **YAML** | `redhat.vscode-yaml` | OTel Collector 설정 파일 편집 |
| **Thunder Client** | `rangav.vscode-thunder-client` | API 테스트 (Postman 대안, 로컬 실행) |
| **Remote - Containers** | `ms-vscode-remote.remote-containers` | 컨테이너 안에서 개발할 때 사용 |
| **DotENV** | `mikestead.dotenv` | `.env` 파일 문법 강조 |

#### 생산성 향상

| 확장명 | ID | 용도 |
|--------|-----|------|
| **GitLens** | `eamodio.gitlens` | Git 히스토리 인라인 표시, blame |
| **Error Lens** | `usernamehw.errorlens` | 에러/경고를 코드 줄에 인라인 표시 |
| **indent-rainbow** | `oderwat.indent-rainbow` | YAML 들여쓰기 시각화 |

**일괄 설치 (터미널에서)**:

```bash
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension golang.go
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ms-azuretools.vscode-docker
code --install-extension redhat.vscode-yaml
code --install-extension rangav.vscode-thunder-client
code --install-extension mikestead.dotenv
code --install-extension eamodio.gitlens
code --install-extension usernamehw.errorlens
code --install-extension oderwat.indent-rainbow
```

---

### 5-2. settings.json

프로젝트 전용 설정을 `.vscode/settings.json`에 저장합니다. (이 파일은 팀 공유를 권장합니다)

```bash
# .vscode 폴더 생성
mkdir -p /c/workspace/aiservice-monitoring/.vscode
```

`.vscode/settings.json` 내용:

```jsonc
{
  // ── Python 설정 ────────────────────────────────────────────────
  "python.defaultInterpreterPath": "${workspaceFolder}/sdk-instrumentation/python/.venv/Scripts/python.exe",
  "python.terminal.activateEnvironment": true,
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  },

  // 유닛 테스트 자동 발견
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": [
    "sdk-instrumentation/python",
    "-v",
    "--tb=short"
  ],
  "python.testing.autoTestDiscoverOnSaveEnabled": true,

  // ── Go 설정 ───────────────────────────────────────────────────
  "go.gopath": "${env:GOPATH}",
  "go.toolsManagement.autoUpdate": true,
  "[go]": {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  },
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "package",
  "gopls": {
    "ui.semanticTokens": true
  },

  // ── JavaScript / Node.js 설정 ─────────────────────────────────
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "eslint.validate": ["javascript", "typescript"],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },

  // ── YAML 설정 (OTel Collector 설정 파일) ──────────────────────
  "[yaml]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.tabSize": 2
  },
  "yaml.schemas": {
    "https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/main/confmap/provider/yamlprovider/testdata/schema.json": [
      "collector/config/*.yaml",
      "infra/docker/otelcol-*.yaml"
    ]
  },

  // ── 에디터 공통 ───────────────────────────────────────────────
  "editor.rulers": [88, 120],
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,

  // ── 파일 제외 (탐색기에서 숨기기) ────────────────────────────
  "files.exclude": {
    "**/__pycache__": true,
    "**/*.pyc": true,
    "**/.venv": true,
    "**/node_modules": true,
    "**/.pytest_cache": true
  },

  // ── Docker ────────────────────────────────────────────────────
  "docker.defaultRegistryPath": "docker.io",

  // ── 터미널 ───────────────────────────────────────────────────
  "terminal.integrated.defaultProfile.windows": "Git Bash"
}
```

---

### 5-3. launch.json (디버그 구성)

`Ctrl+Shift+D`로 Run and Debug 패널을 열고, `.vscode/launch.json`을 생성합니다.

`.vscode/launch.json` 내용:

```json
{
  "version": "0.2.0",
  "configurations": [

    // ── (1) FastAPI 서비스 디버그 (Python) ──────────────────────
    {
      "name": "FastAPI: Debug (Python)",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload"
      ],
      "cwd": "${workspaceFolder}/sdk-instrumentation/python",
      "python": "${workspaceFolder}/sdk-instrumentation/python/.venv/Scripts/python.exe",
      "envFile": "${workspaceFolder}/.env",
      "env": {
        "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
        "DEPLOYMENT_ENV": "development",
        "SERVICE_NAME": "fastapi-debug",
        "AI_SERVICE_LAYER": "app",
        "POD_NAME": "local-dev",
        "POD_NAMESPACE": "default",
        "KUBE_NODE_NAME": "local"
      },
      "justMyCode": false,
      "console": "integratedTerminal"
    },

    // ── (2) Python 단독 스크립트 디버그 ─────────────────────────
    {
      "name": "Python: Current File",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "python": "${workspaceFolder}/sdk-instrumentation/python/.venv/Scripts/python.exe",
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal",
      "justMyCode": false
    },

    // ── (3) Python unittest 디버그 ───────────────────────────────
    {
      "name": "Python: pytest (현재 파일)",
      "type": "debugpy",
      "request": "launch",
      "module": "pytest",
      "args": [
        "${file}",
        "-v",
        "--tb=short",
        "-s"
      ],
      "python": "${workspaceFolder}/sdk-instrumentation/python/.venv/Scripts/python.exe",
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal",
      "justMyCode": false
    },

    // ── (4) Go 서비스 디버그 ────────────────────────────────────
    {
      "name": "Go: Debug Service",
      "type": "go",
      "request": "launch",
      "mode": "auto",
      "program": "${workspaceFolder}/sdk-instrumentation/go",
      "envFile": "${workspaceFolder}/.env",
      "env": {
        "OTEL_EXPORTER_OTLP_ENDPOINT": "localhost:4317",
        "DEPLOYMENT_ENV": "development",
        "SERVICE_NAME": "go-service-debug"
      },
      "args": [],
      "showLog": true
    },

    // ── (5) Go 테스트 디버그 ────────────────────────────────────
    {
      "name": "Go: Test Current Package",
      "type": "go",
      "request": "launch",
      "mode": "test",
      "program": "${workspaceFolder}/sdk-instrumentation/go",
      "args": ["-v", "-run", "."],
      "envFile": "${workspaceFolder}/.env",
      "showLog": true
    },

    // ── (6) Node.js 서비스 디버그 ───────────────────────────────
    {
      "name": "Node.js: Debug with OTel",
      "type": "node",
      "request": "launch",
      "runtimeArgs": [
        "-r",
        "${workspaceFolder}/sdk-instrumentation/nodejs/otel-setup.js"
      ],
      "program": "${workspaceFolder}/sdk-instrumentation/nodejs/server.js",
      "cwd": "${workspaceFolder}/sdk-instrumentation/nodejs",
      "envFile": "${workspaceFolder}/.env",
      "env": {
        "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
        "SERVICE_NAME": "nodejs-debug",
        "NODE_ENV": "development"
      },
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    },

    // ── (7) validate-traces.py 스크립트 실행 ─────────────────────
    {
      "name": "Script: validate-traces",
      "type": "debugpy",
      "request": "launch",
      "program": "${workspaceFolder}/scripts/validate-traces.py",
      "python": "${workspaceFolder}/sdk-instrumentation/python/.venv/Scripts/python.exe",
      "args": ["--fail-on-broken"],
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal"
    }
  ],

  // ── 복합 실행 구성 (전체 스택 동시 디버그) ────────────────────
  "compounds": [
    {
      "name": "Full Stack: FastAPI + Node.js",
      "configurations": [
        "FastAPI: Debug (Python)",
        "Node.js: Debug with OTel"
      ],
      "stopAll": true
    }
  ]
}
```

> **디버그 시작 방법**: `F5` 키를 누르거나, 상단 드롭다운에서 구성을 선택 후 재생(▷) 버튼 클릭.

---

## 6. JetBrains IDE 설정

IntelliJ IDEA / PyCharm / GoLand 사용자를 위한 설정입니다. 프로젝트 성격에 따라 IDE를 선택합니다:

- **PyCharm Professional**: Python 전담 개발 시 권장
- **GoLand**: Go 서비스 전담 개발 시 권장
- **IntelliJ IDEA Ultimate**: Python + Go 동시 개발 시 권장 (플러그인 필요)

### 6-1. 플러그인 설치

`File → Settings → Plugins` (`Ctrl+Alt+S`) 에서 아래 플러그인을 설치합니다.

#### IntelliJ IDEA Ultimate 사용자 (필수)

| 플러그인 | 용도 |
|---------|------|
| **Python** | Python 언어 지원, 가상환경 인식 |
| **Go** | Go 언어 지원, Delve 디버거 |

#### 공통 필수 플러그인

| 플러그인 | 용도 |
|---------|------|
| **Docker** | Docker Compose 파일 편집, 컨테이너 관리 GUI |
| **Protocol Buffers** | gRPC/OTLP `.proto` 파일 문법 강조 및 자동완성 |
| **EnvFile** | Run Configuration에서 `.env` 파일 자동 로드 |
| **.ignore** | `.gitignore` 파일 편집 지원 |
| **YAML/Ansible** | OTel Collector YAML 구성 파일 지원 |

#### 설치 방법

1. `File` → `Settings` → `Plugins` → `Marketplace` 탭
2. 플러그인 이름 검색 후 `Install` 클릭
3. IDE 재시작

---

### 6-2. 프로젝트 SDK 및 모듈 구성

#### Python 인터프리터 설정 (PyCharm / IntelliJ)

1. `File` → `Settings` → `Project: aiservice-monitoring` → `Python Interpreter`
2. 우측 톱니바퀴(⚙) 아이콘 → `Add Interpreter...`
3. `Existing environment` 선택
4. 경로 입력:
   ```
   C:\workspace\aiservice-monitoring\sdk-instrumentation\python\.venv\Scripts\python.exe
   ```
5. `OK` 클릭 → 패키지 목록이 표시되면 성공

#### Go SDK 설정 (GoLand / IntelliJ)

1. `File` → `Settings` → `Go` → `GOROOT`
2. Go 설치 경로 지정:
   ```
   C:\Program Files\Go
   ```
3. `Go Modules` 탭에서 `Enable Go Modules integration` 체크

#### 다중 언어 모듈 구조 설정 (IntelliJ IDEA Ultimate)

IntelliJ에서 Python과 Go를 동시에 인식시키려면 각 언어 디렉토리를 별도 모듈로 등록합니다:

1. `File` → `Project Structure` (`Ctrl+Alt+Shift+S`)
2. 좌측 `Modules` 탭 선택
3. `+` 버튼 → `Import Module`
4. `sdk-instrumentation/python` 폴더 선택 → `Python` 모듈 유형 선택
5. 다시 `+` 버튼 → `sdk-instrumentation/go` 폴더 선택 → `Go` 모듈 유형 선택
6. `Apply` → `OK`

> 이후 Python 파일을 열면 `.venv` 인터프리터가, Go 파일을 열면 Go SDK가 자동으로 연결됩니다.

---

### 6-3. Run/Debug Configurations

`Run` → `Edit Configurations...` (`Shift+Alt+F10`) 에서 아래 구성을 추가합니다.

#### (1) FastAPI 서비스 디버그

`+` 버튼 → `Python` 선택:

| 항목 | 값 |
|-----|-----|
| **Name** | `FastAPI: Debug` |
| **Script path** | `-m uvicorn` 또는 Module 필드에 `uvicorn` |
| **Parameters** | `main:app --host 0.0.0.0 --port 8000 --reload` |
| **Python interpreter** | 프로젝트 venv 인터프리터 선택 |
| **Working directory** | `C:\workspace\aiservice-monitoring\sdk-instrumentation\python` |

**Environment variables 탭** 에서 아래 값 입력 (또는 EnvFile 플러그인으로 `.env` 지정):

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
DEPLOYMENT_ENV=development
SERVICE_NAME=fastapi-debug
AI_SERVICE_LAYER=app
POD_NAME=local-dev
POD_NAMESPACE=default
KUBE_NODE_NAME=local
```

> **EnvFile 플러그인 사용 시**: `EnvFile` 탭에서 `Enable EnvFile` 체크 후, `.env` 파일 경로를 `C:\workspace\aiservice-monitoring\.env`로 지정하면 환경 변수를 일일이 입력할 필요가 없습니다.

#### (2) Go 서비스 디버그 (GoLand 기준)

`+` 버튼 → `Go Build` 선택:

| 항목 | 값 |
|-----|-----|
| **Name** | `Go: Debug Service` |
| **Run kind** | `Package` |
| **Package path** | `github.com/your-org/aiservice-monitoring/sdk-instrumentation/go` |
| **Working directory** | `C:\workspace\aiservice-monitoring\sdk-instrumentation\go` |

**Environment variables**:

```
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317
DEPLOYMENT_ENV=development
SERVICE_NAME=go-service-debug
```

#### (3) Go 테스트 실행

`+` 버튼 → `Go Test` 선택:

| 항목 | 값 |
|-----|-----|
| **Name** | `Go: Tests` |
| **Test kind** | `Package` |
| **Package path** | `./...` (전체 패키지) |
| **Go tool arguments** | `-v -count=1` |

#### (4) Node.js OTel 디버그

`+` 버튼 → `Node.js` 선택:

| 항목 | 값 |
|-----|-----|
| **Name** | `Node.js: Debug with OTel` |
| **Node interpreter** | 시스템 Node.js (`node`) |
| **Node parameters** | `-r ./otel-setup.js` |
| **JavaScript file** | `server.js` |
| **Working directory** | `C:\workspace\aiservice-monitoring\sdk-instrumentation\nodejs` |

**Environment variables**:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
SERVICE_NAME=nodejs-debug
NODE_ENV=development
```

#### (5) Docker Compose 빠른 실행

`+` 버튼 → `Docker` → `Docker Compose` 선택:

| 항목 | 값 |
|-----|-----|
| **Name** | `Local Stack: Start` |
| **Compose file(s)** | `C:\workspace\aiservice-monitoring\infra\docker\docker-compose.yaml` |
| **Command** | `up -d` |

이 구성을 저장하면 IDE 내 Run 버튼 한 번으로 로컬 모니터링 스택을 시작할 수 있습니다.

---

## 7. Git 및 GitHub 연동

### 7-1. 로컬 Git Config 설정

```bash
# 사용자 정보 설정 (전역)
git config --global user.name "Aura Kim"
git config --global user.email "aura.kimjh@gmail.com"

# 기본 브랜치명을 main으로 설정
git config --global init.defaultBranch main

# 줄바꿈 문자 처리 (Windows에서 CRLF → LF 자동 변환)
git config --global core.autocrlf input

# Pull 전략 설정 (rebase 권장)
git config --global pull.rebase true

# 설정 확인
git config --global --list
```

### 7-2. SSH 키 생성 및 GitHub 등록

패스워드 입력 없이 GitHub과 안전하게 통신하기 위해 SSH 키를 사용합니다.

#### SSH 키 생성

```bash
# Ed25519 알고리즘으로 SSH 키 생성 (RSA보다 보안성 높음)
ssh-keygen -t ed25519 -C "aura.kimjh@gmail.com"

# 저장 경로: 기본값(~/.ssh/id_ed25519) 사용 권장 — Enter 입력
# 패스프레이즈: 빈 값(Enter) 또는 보안을 위해 입력
```

#### SSH Agent에 키 등록

```bash
# SSH Agent 시작
eval "$(ssh-agent -s)"

# 키 등록
ssh-add ~/.ssh/id_ed25519

# 등록 확인
ssh-add -l
```

#### GitHub에 공개 키 등록

```bash
# 공개 키 내용 출력 (이 내용 전체를 복사)
cat ~/.ssh/id_ed25519.pub
```

1. 브라우저에서 GitHub → 우측 상단 프로필 클릭 → **Settings**
2. 좌측 메뉴 → **SSH and GPG keys**
3. **New SSH key** 클릭
4. Title: `aiservice-monitoring-dev` (임의 이름)
5. Key type: `Authentication Key`
6. Key: 위에서 복사한 공개 키 붙여넣기
7. **Add SSH key** 클릭

#### 연결 테스트

```bash
ssh -T git@github.com
# Hi Aura Kim! You've successfully authenticated, but GitHub does not provide shell access.
# 위 메시지가 출력되면 성공
```

### 7-3. 저장소 클론 (신규 팀원)

```bash
# SSH 방식으로 클론 (HTTPS보다 권장)
git clone git@github.com:your-org/aiservice-monitoring.git /c/workspace/aiservice-monitoring

cd /c/workspace/aiservice-monitoring

# 로컬 Git 사용자 확인
git config user.email
# aura.kimjh@gmail.com
```

### 7-4. 프로젝트 레이아웃과 Git 브랜치 전략

```
aiservice-monitoring/               ← 단일 저장소 (Monorepo)
├── sdk-instrumentation/
│   ├── python/                     ← Python 에이전트·LLM 계측
│   ├── nodejs/                     ← Next.js 프론트엔드 계측
│   └── go/                         ← Go 수집기·프록시 계측
├── collector/config/               ← OTel Collector 설정
├── infra/
│   ├── docker/                     ← 로컬 개발 Docker Compose
│   └── kubernetes/                 ← K8s 프로덕션 매니페스트
├── dashboards/grafana/             ← Grafana 대시보드 JSON
├── scripts/                        ← 검증·부하 테스트 스크립트
└── helm/                           ← Helm 패키지 (운영 배포)
```

#### 권장 브랜치 전략

```
main              ← 항상 배포 가능 상태 유지
├── feat/XXX      ← 기능 개발 (예: feat/langchain-tracer)
├── fix/XXX       ← 버그 수정 (예: fix/ttft-calculation)
└── docs/XXX      ← 문서 작업 (예: docs/local-setup)
```

```bash
# 새 기능 개발 시작
git checkout -b feat/my-new-feature

# 작업 후 커밋
git add sdk-instrumentation/python/my_new_file.py
git commit -m "feat: add my-new-feature instrumentation"

# PR 생성 전 main 브랜치 변경사항 반영
git fetch origin
git rebase origin/main

# GitHub에 푸시
git push -u origin feat/my-new-feature
```

---

## 8. 첫 실행 검증 체크리스트

모든 설정을 완료한 후, 아래 순서로 검증합니다.

```bash
# ── Step 1: 로컬 인프라 시작 ───────────────────────────────────
cd /c/workspace/aiservice-monitoring
docker compose -f infra/docker/docker-compose.yaml up -d

# 30초 대기 후 헬스체크
sleep 30
curl -s http://localhost:13133/health | grep -q "Server available" && echo "✅ OTel Collector 정상" || echo "❌ OTel Collector 비정상"
curl -s http://localhost:9090/-/ready | grep -q "Prometheus" && echo "✅ Prometheus 정상" || echo "❌ Prometheus 비정상"
curl -s http://localhost:3000/api/health | python -c "import sys,json; d=json.load(sys.stdin); print('✅ Grafana 정상' if d.get('database')=='ok' else '❌ Grafana 비정상')"
```

```bash
# ── Step 2: Python SDK 동작 확인 ──────────────────────────────
cd sdk-instrumentation/python
source .venv/bin/activate
python -c "
import os; os.environ['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://localhost:4317'
from otel_setup import setup_otel
tracer, meter = setup_otel('test-service')
with tracer.start_as_current_span('test-span') as span:
    span.set_attribute('test.key', 'hello')
    print('✅ Python OTel SDK 정상 동작')
"
```

```bash
# ── Step 3: Jaeger에서 트레이스 확인 ─────────────────────────
# 브라우저에서 http://localhost:16686 접속
# Service 드롭다운에서 "test-service" 선택
# "Find Traces" 클릭 → 트레이스 1개가 표시되면 성공 ✅
```

```bash
# ── Step 4: Alert Rule 검증 스크립트 실행 ─────────────────────
bash scripts/test-alerts.sh
```

```bash
# ── Step 5: Context Propagation 단절 탐지 ─────────────────────
python scripts/validate-traces.py
```

모든 항목에서 ✅가 표시되면 **로컬 환경 설정 완료**입니다.

---

## 9. 자주 발생하는 문제 (Troubleshooting)

### OTel Collector가 시작되지 않는 경우

```bash
# 로그 확인
docker compose -f infra/docker/docker-compose.yaml logs otel-collector --tail=50

# 포트 충돌 확인 (4317, 4318이 다른 프로세스에 점유된 경우)
# Windows
netstat -ano | findstr :4317
# Git Bash
ss -tlnp | grep 4317
```

**해결**: 포트를 점유 중인 프로세스를 종료하거나, `docker-compose.yaml`에서 호스트 포트를 변경합니다.

### Python 가상환경 인터프리터를 VS Code가 인식 못 하는 경우

1. `Ctrl+Shift+P` → `Python: Select Interpreter`
2. `Enter interpreter path...` → `.venv/Scripts/python.exe` 직접 입력

또는 터미널에서:

```bash
# 인터프리터 경로 확인
which python
# 출력에 .venv가 포함되어 있어야 함
```

### Go 모듈 의존성 오류 (`go: module not found`)

```bash
cd sdk-instrumentation/go

# 모듈 캐시 정리 후 재다운로드
go clean -modcache
go mod download
go mod tidy
```

### Grafana에 대시보드가 표시되지 않는 경우

```bash
# Grafana 로그 확인
docker compose -f infra/docker/docker-compose.yaml logs grafana --tail=30

# 대시보드 파일 경로 확인 (docker-compose.yaml의 volume 마운트와 일치해야 함)
ls dashboards/grafana/*.json
```

대시보드 JSON 파일이 있는데도 표시되지 않으면, Grafana 컨테이너를 재시작합니다:

```bash
docker compose -f infra/docker/docker-compose.yaml restart grafana
```

### Windows에서 SSH 키가 동작하지 않는 경우

```bash
# SSH Agent 서비스 상태 확인 (PowerShell 관리자 권한)
Get-Service ssh-agent

# 자동 시작으로 설정
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service ssh-agent

# Git Bash에서 키 재등록
ssh-add ~/.ssh/id_ed25519
```

### `docker compose` 명령어를 찾을 수 없는 경우

Docker Desktop이 최신 버전인지 확인합니다. 구버전은 `docker-compose`(하이픈 포함)를 사용합니다:

```bash
# 버전 확인
docker compose version  # v2.x → 공백 방식
docker-compose --version  # 1.x → 하이픈 방식 (구버전, 권장하지 않음)
```

---

## 부록: 유용한 명령어 모음

```bash
# 로컬 스택 전체 재시작
docker compose -f infra/docker/docker-compose.yaml restart

# 특정 서비스 로그 실시간 확인
docker compose -f infra/docker/docker-compose.yaml logs -f otel-collector

# Prometheus 메트릭 직접 쿼리 (예: TTFT P95)
curl -s 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,rate(llm_ttft_seconds_bucket[5m]))' | python -m json.tool

# Grafana 대시보드 목록 API
curl -s http://admin:admin@localhost:3000/api/search | python -m json.tool

# OTel Collector zpages (파이프라인 상태 시각화)
# 브라우저: http://localhost:55679/debug/tracez

# 부하 테스트 실행
python scripts/load-test.py --users 10 --spawn-rate 2 --run-time 60s

# Alert Rule 유효성 검증
bash scripts/test-alerts.sh

# Context Propagation 단절 탐지
python scripts/validate-traces.py --fail-on-broken
```

---

*문서 관련 문의: Aura Kim `<aura.kimjh@gmail.com>`*
*이 문서는 프로젝트 환경이 변경될 때마다 업데이트합니다.*
