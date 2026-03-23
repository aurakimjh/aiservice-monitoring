# 로컬 개발 환경 구성 가이드 (LOCAL_SETUP.md)

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **대상 독자**: aiservice-monitoring 프로젝트에 처음 합류하는 개발자
> **최종 업데이트**: 2026-03-23 (Session 37 — Lite 모드 빠른 시작 가이드 추가: Docker 원클릭 설치·진단·보고서·제거)
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`
>
> **관련 문서**:
> - [TEST_GUIDE.md](./TEST_GUIDE.md) — 환경 설정 후 테스트 검증 가이드 (이 문서 다음에 참고)
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — OTel + Agent 통합 아키텍처 설계
> - [AGENT_DESIGN.md](./AGENT_DESIGN.md) — AITOP Agent 상세 설계 (Go)
> - [METRICS_DESIGN.md](./METRICS_DESIGN.md) — 지표 정의 및 수집 방안
> - [UI_DESIGN.md](./UI_DESIGN.md) — 통합 모니터링 대시보드 UI 설계 (26개 화면)

이 문서를 순서대로 따라 하면, **환경 설정에 소요되는 시간 없이** 첫날부터 코드를 작성하고 로컬에서 메트릭·트레이스를 확인할 수 있습니다.

---

## 완전 초보자를 위한 안내

> 개발 환경 구성이 처음이신 분을 위한 기본 개념 설명입니다.
> 이미 익숙하신 분은 [목차](#목차)로 바로 이동하세요.

### 이 프로젝트는 무엇을 하는 건가요?

AI 서비스(예: ChatGPT 같은 대화형 AI)가 사용자의 질문을 처리할 때,
**각 단계에서 얼마나 시간이 걸리는지** 실시간으로 감시하는 도구입니다.

비유하면 **자동차 계기판**과 같습니다:
- 속도계 = AI 응답 속도 (TTFT, TPS)
- 엔진 온도계 = GPU 사용률
- 연료계 = 서버 리소스 사용량

계기판이 없으면 엔진이 과열되어도 모르고 달리다가 고장나는 것처럼,
모니터링이 없으면 AI 서비스가 느려지거나 멈춰도 원인을 찾기 어렵습니다.

### Docker란?

Docker는 소프트웨어를 **"상자(컨테이너)"에 담아** 어디서든 동일하게 실행하는 기술입니다.

**비유**: 이삿짐 포장.
- 집에서 물건을 하나하나 옮기면(직접 설치) 빠지는 것도 있고, 깨지는 것도 있습니다.
- 이삿짐 상자에 잘 포장해서 옮기면(Docker) 새 집에서도 그대로 사용할 수 있습니다.

이 프로젝트에서는 Docker로 6개의 서비스(Collector, Prometheus, Grafana 등)를
**명령어 한 줄**로 모두 설치하고 실행합니다.

### 터미널 / 명령 프롬프트란?

터미널은 **컴퓨터와 텍스트로 대화하는 창**입니다.
마우스로 클릭하는 대신, 키보드로 명령어를 입력합니다.

- Windows: Git Bash (이 프로젝트에서 사용하는 터미널)
- macOS: Terminal 앱
- Linux: Terminal

```bash
# 이것이 터미널에 입력하는 "명령어"입니다
docker compose up -d     # ← 6개 서비스를 한 번에 실행하는 명령
```

### 가상환경(venv)이란?

Python 가상환경은 **프로젝트별 독립된 작업 공간**입니다.

**비유**: 요리사가 한식, 양식, 중식을 각각 다른 주방에서 하는 것.
재료(라이브러리)가 섞이지 않고, 한 주방에서 문제가 생겨도 다른 주방에 영향을 주지 않습니다.

```bash
python -m venv .venv        # 독립된 주방(가상환경)을 만듭니다
source .venv/bin/activate   # 그 주방에 들어갑니다
pip install fastapi         # 그 주방에만 재료를 설치합니다
```

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
10. [수집 서버 스토리지 백엔드 설정](#10-수집-서버-스토리지-백엔드-설정)
11. [Lite 모드 빠른 시작 (단기 성능 진단)](#11-lite-모드-빠른-시작-단기-성능-진단)

---

## 1. 사전 요구사항 체크리스트

> **📌 이 섹션에서 배울 내용**
> - 이 프로젝트를 실행하기 위해 필요한 도구들
> - 각 도구가 왜 필요한지
> - 설치 여부 확인 방법
>
> **💡 왜 이렇게 많은 도구가 필요한가요?**
>
> 이 프로젝트는 3개 언어(Python, Node.js, Go)와 Docker 인프라로 구성됩니다:
> ```
> Git       → 코드 버전 관리 (필수 기본)
> Python    → AI/ML 서비스, 테스트 스크립트
> Node.js   → 프론트엔드 (Next.js)
> Go        → 고성능 수집기 (AITOP Agent)
> Docker    → 모니터링 인프라 (Prometheus, Grafana 등) 실행
> ```
>
> 한 번만 설치하면 이후 `docker compose up` 하나로 전체 환경이 올라옵니다.

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

> **📌 이 섹션에서 배울 내용**
> - Python, Node.js, Go 세 가지 런타임 설치 방법
> - 가상환경/버전 관리자를 사용하는 이유
> - 각 언어별 OTel SDK 의존성 설치

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

> **💡 왜 가상환경이 필요한가요?**
> 시스템 전체에 설치된 Python에 직접 패키지를 설치하면:
> - 프로젝트 A가 `fastapi==0.100`, 프로젝트 B가 `fastapi==0.95` 필요 → 충돌 ❌
> - 한 번 꼬이면 시스템 Python 환경 전체가 망가질 수 있음 ❌
>
> 가상환경을 사용하면 프로젝트마다 독립된 Python 환경 = 충돌 없음 ✅

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

> **💡 왜 직접 설치하지 않고 nvm을 쓰나요?**
> Node.js는 버전에 따라 API가 달라져 프로젝트 간 충돌이 자주 납니다.
> nvm은 Python의 venv처럼 **여러 Node.js 버전을 공존**시키고 프로젝트별로 전환합니다.
> ```bash
> nvm use 18   # 이 터미널에서만 Node.js 18 사용
> nvm use 20   # 이 터미널에서만 Node.js 20 사용
> ```

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

> **💡 Go는 왜 필요한가요?**
> AITOP Agent(모니터링 데이터 수집기)가 Go로 작성되어 있습니다.
> Go는 단일 바이너리로 컴파일되어 배포가 간편하고, C/C++ 수준의 성능을 냅니다.
> 에이전트 코드를 빌드하거나 Go SDK 계측 코드를 개발할 때 필요합니다.

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

> **📌 이 섹션에서 배울 내용**
> - Docker Compose로 모니터링 스택 6개 서비스를 한 번에 실행하는 방법
> - 각 서비스의 접속 주소와 역할
> - 스택 시작/중지/초기화 명령어
>
> **💡 왜 로컬에 모니터링 스택이 필요한가요?**
>
> SDK 코드를 작성하면서 "내가 만든 Span이 실제로 Grafana에 나타나는지" 바로 확인해야 합니다.
> 프로덕션 서버를 쓰면 다른 팀원의 작업과 섞이고, 인터넷 연결도 필요합니다.
> 로컬 Docker 스택은 **내 코드가 만든 텔레메트리만 혼자 확인**할 수 있는 격리된 환경입니다.
>
> ```
> 내 코드 → 로컬 OTel Collector → 로컬 Grafana
>           (localhost:4317)        (localhost:3000)
>           ← 인터넷 불필요, 혼자만의 모니터링 환경 →
> ```

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

> **📌 이 섹션에서 배울 내용**
> - 환경 변수란 무엇이고 왜 쓰는지
> - `.env` 파일을 Git에 올리면 안 되는 이유
> - `.env.example`로 팀원과 안전하게 공유하는 방법

### 핵심 원칙

- **`.env` 파일은 절대 Git에 커밋하지 않습니다** (`.gitignore`에 이미 포함됨)

> **💡 왜 `.env`를 Git에 올리면 절대 안 되나요?**
>
> `.env` 파일에는 API 키, 비밀번호 등 민감 정보가 들어 있습니다.
> Git에 한 번 올라가면 히스토리에 영원히 남고, 누군가 이 저장소를 보면 바로 탈취됩니다.
>
> 실제 사고 사례: GitHub에 AWS API 키가 실수로 올라간 후 5분 만에 자동 크롤러가 감지해
> 수십만 달러의 AWS 요금이 청구된 사례가 있습니다.
>
> **올바른 방법**:
> ```
> .env.example  → Git에 올림 (실제 값 없는 "샘플 양식")
> .env          → Git에 절대 올리지 않음 (실제 비밀 값)
> ```
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

> **📌 이 섹션에서 배울 내용**
> - 이 프로젝트에 최적화된 VS Code 확장(Extension) 목록
> - 자동 포맷팅, 린터, 디버거 설정
> - 원클릭 디버그 실행 구성 (launch.json)
>
> **💡 왜 IDE 설정이 중요한가요?**
>
> 설정 없이 코딩하면:
> - 코드 오타/에러를 저장할 때까지 모름
> - 팀원마다 코드 스타일이 달라서 PR 리뷰 때 불필요한 diff 발생
> - 디버거 없이 `print()`로만 디버깅 → 매우 비효율적
>
> 올바른 IDE 설정으로:
> - 입력 즉시 에러 표시 (Error Lens)
> - 저장 시 자동 포맷팅 (Black, Prettier)
> - `F5` 한 번으로 디버거 실행

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

> **📌 이 섹션에서 배울 내용**
> - IntelliJ/PyCharm/GoLand에서 Python, Go, Node.js를 동시에 사용하는 설정
> - Run/Debug Configuration으로 원클릭 실행 구성
> - EnvFile 플러그인으로 `.env` 자동 로드

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

> **📌 이 섹션에서 배울 내용**
> - Git 초기 설정 (이름, 이메일, 줄바꿈 문자)
> - SSH 키 생성 및 GitHub 등록 — 비밀번호 없이 안전하게 연결
> - 저장소 클론과 브랜치 전략
>
> **💡 SSH 키 방식 vs HTTPS 방식**
>
> ```
> HTTPS 방식: git push 할 때마다 비밀번호/토큰 입력 필요 (번거로움)
> SSH 방식:   SSH 키 한 번 등록 후 → 비밀번호 없이 자동 인증 (편리함 + 더 안전)
> ```
>
> 이 프로젝트는 SSH 방식을 권장합니다.

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

> **💡 Monorepo(모노레포)란?**
> 여러 서비스(Python, Node.js, Go)의 코드를 **하나의 저장소에** 관리하는 방식입니다.
> 각 서비스를 별도 저장소로 관리하면 서로 다른 저장소 간 의존성 변경 추적이 어려워집니다.
> 이 프로젝트는 모노레포로 "SDK 코드 변경 + Collector 설정 변경 + 대시보드 변경"을 하나의 PR로 관리합니다.

```
aiservice-monitoring/               ← 단일 저장소 (Monorepo)
├── sdk-instrumentation/
│   ├── python/                     ← Python 에이전트·LLM 계측
│   ├── nodejs/                     ← Next.js 프론트엔드 계측
│   └── go/                         ← Go 수집기·프록시 계측
├── collector/config/               ← OTel Collector 설정 YAML
├── infra/
│   ├── docker/                     ← 로컬 개발 Docker Compose
│   └── kubernetes/                 ← K8s 프로덕션 매니페스트
├── dashboards/grafana/             ← Grafana 대시보드 JSON
├── scripts/                        ← 검증·부하 테스트 스크립트
└── helm/                           ← Helm 패키지 (운영 배포)
```

> **각 디렉토리가 처음에는 낯설 수 있습니다. 처음 합류한다면 이 순서로 탐색하세요:**
> 1. `sdk-instrumentation/python/` — 가장 먼저. Python 계측 코드의 핵심
> 2. `collector/config/` — OTel Collector YAML 설정
> 3. `infra/docker/` — 로컬 실행 환경
> 4. `dashboards/grafana/` — 결과물 시각화

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

> **📌 이 섹션에서 배울 내용**
> - 설정 완료 후 5단계 검증 절차
> - 각 단계에서 기대하는 정상 출력
> - 모두 ✅가 뜨면 로컬 환경 설정 완료
>
> **💡 왜 이 순서로 검증하나요?**
>
> 의존 관계가 있기 때문에 순서가 중요합니다:
> ```
> Step 1: 인프라 스택 먼저 기동 (Collector가 없으면 SDK 데이터 받을 곳이 없음)
>   ↓
> Step 2: SDK로 테스트 Span 발생
>   ↓
> Step 3: Jaeger UI에서 트레이스 확인 (Grafana보다 빠른 확인)
>   ↓
> Step 4~5: 고급 검증 (Alert, Context Propagation)
> ```

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

> **📌 이 섹션에서 배울 내용**
> - 가장 자주 발생하는 4가지 문제와 해결법
> - 문제 원인을 파악하는 디버깅 순서
>
> **💡 문제 해결 기본 순서**
>
> 무엇이 잘못됐는지 모를 때:
> ```
> 1. docker compose ps          → 서비스 상태 확인
> 2. docker compose logs [서비스명]  → 에러 메시지 확인
> 3. 브라우저에서 직접 접속 시도   → 포트 충돌 여부 확인
> 4. 구글에 에러 메시지 검색       → 대부분 이미 해결책이 있음
> ```

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

---

## 10. 수집 서버 스토리지 백엔드 설정

> **요약**: 로컬 개발 환경에서는 S3/MinIO 없이 `storage.type: "local"`만으로 Collection Server를 완전히 구동할 수 있습니다.

Collection Server는 Evidence 파일(진단 스냅샷·설정 파일 등)을 저장할 때 **StorageBackend** 인터페이스를 사용합니다. `server.yaml`의 `storage.type` 값으로 백엔드를 선택합니다.

### 로컬 개발: `storage.type: "local"` (S3/MinIO 불필요)

```yaml
# collection-server/config/server.yaml (로컬 개발용)

storage:
  type: "local"           # S3 없이 로컬 디스크에 직접 저장

  local:
    base-path: "/var/aitop/data"   # 로컬 저장 루트 (없으면 자동 생성)
    retention-days: 30             # 30일 이상 파일 자동 정리 (0 = 비활성)
```

```bash
# Collection Server 실행 시 로컬 스토리지 확인
ls /var/aitop/data/tenants/

# 수집된 Evidence 파일 예시
/var/aitop/data/tenants/t1/jobs/job-abc123/nginx.conf.json
/var/aitop/data/tenants/t1/jobs/job-abc123/gpu-snapshot.json
```

> **Windows 개발 환경**: `base-path`를 Windows 경로로 변경하세요.
> ```yaml
> local:
>   base-path: "C:/aitop/data"
> ```

### 프로덕션: `storage.type: "s3"` (MinIO 또는 AWS S3)

```yaml
# collection-server/config/server.yaml (프로덕션용)

storage:
  type: "s3"

  s3:
    endpoint:   ""                  # AWS S3 기본값: 빈 문자열
    bucket:     "aitop-evidence"
    access-key: "${AWS_ACCESS_KEY}" # 환경 변수로 주입
    secret-key: "${AWS_SECRET_KEY}"
    region:     "ap-northeast-2"
    use-ssl:    true
    path-style: false               # AWS S3: false / MinIO: true
```

MinIO를 S3 대신 사용하는 경우 (Lite 모드 docker-compose):

```yaml
storage:
  type: "s3"

  s3:
    endpoint:   "http://minio:9000"
    bucket:     "aitop-evidence"
    access-key: "minioadmin"
    secret-key: "minioadmin"
    region:     "us-east-1"
    use-ssl:    false
    path-style: true
```

### 로컬 + S3 동시 저장: `storage.type: "both"`

```yaml
storage:
  type: "both"   # DualBackend — S3에 기본 저장, 로컬에도 복사

  s3:
    endpoint:   "http://minio:9000"
    bucket:     "aitop-evidence"
    access-key: "minioadmin"
    secret-key: "minioadmin"
    path-style: true

  local:
    base-path:      "/var/aitop/data"
    retention-days: 7   # 로컬 복사본은 7일만 보관
```

### 환경별 권장 설정 요약

| 환경 | `storage.type` | MinIO/S3 컨테이너 필요 |
|------|---------------|----------------------|
| 로컬 개발 | `"local"` | ❌ 불필요 |
| CI / E2E | `"local"` | ❌ 불필요 |
| Lite 운영 (단일 서버) | `"s3"` (MinIO) | ✅ MinIO |
| 프로덕션 | `"s3"` (AWS S3) | ✅ AWS S3 |
| 프로덕션 + 로컬 캐시 | `"both"` | ✅ S3 + 로컬 병행 |

> **참조**: StorageBackend 인터페이스 전체 설계는 [AGENT_DESIGN.md §7.6](./AGENT_DESIGN.md#76-storagebackend-인터페이스-설계)을 참고하세요.

---

---

## 11. Lite 모드 빠른 시작 (단기 성능 진단)

> **목적**: 성능 개선 컨설팅 시나리오에서 AITOP을 **1주일 단기 투입**으로 사용하는 가이드입니다.
> Docker만 있으면 됩니다. PostgreSQL, S3, Helm은 필요하지 않습니다.
>
> **상세 아키텍처**: [ARCHITECTURE.md §13](./ARCHITECTURE.md#13-배포-모드-아키텍처--enterprise-vs-lite)
> **에이전트 동작**: [AGENT_DESIGN.md §2.4](./AGENT_DESIGN.md#24-lite-모드-에이전트-상세-동작)

### 11.1 사전 요구사항

| 항목 | 요건 | 확인 명령어 |
|------|------|------------|
| Docker | 24.0+ | `docker --version` |
| Docker Compose | v2.x | `docker compose version` |

일반 개발 환경 설정(Python, Node.js, Go)은 Lite 모드에서 **불필요**합니다.

### 11.2 원클릭 설치 및 시작

```bash
# 1. 저장소 클론 (이미 있으면 생략)
git clone https://github.com/your-org/aiservice-monitoring.git
cd aiservice-monitoring

# 2. Lite 모드 시작 (단일 명령어)
docker-compose -f docker-compose.lite.yaml up -d

# 3. 로그 확인 (에이전트 수집 시작 확인)
docker-compose -f docker-compose.lite.yaml logs -f aitop-agent
# 출력 예: "Collector OS: started", "Collector AI-GPU: detected nvidia-smi"

# 4. 웹 UI 접속
# http://localhost:8080
# XLog, HeatMap, 프로파일링 대시보드 확인
```

### 11.3 진단 워크플로 (1주일 스프린트)

```
Day 1 — 설치 및 베이스라인 수집
  ├─ docker-compose up
  ├─ 에이전트 자동 탐지 확인 (OS/WEB/WAS/DB/GPU/LLM)
  └─ XLog 기준선 확인 (정상 응답시간 분포)

Day 2~3 — 부하 테스트
  ├─ 부하 도구로 AI 서비스에 트래픽 발생
  ├─ HeatMap에서 응답시간 분포 변화 관찰
  └─ XLog에서 느린 트랜잭션 (빨간 점) 식별

Day 4~5 — 프로파일링 드릴다운
  ├─ 느린 트랜잭션 클릭 → 트레이스 상세 보기
  ├─ LLM 체인 Span 확인: Guardrail / Embedding / LLM 각 구간 소요시간
  └─ 병목 구간 특정 (예: Embedding 320ms 이상)

Day 6~7 — 개선 검증
  ├─ 개선 사항 적용 (코드/설정 변경)
  ├─ 부하 테스트 재실행
  └─ HeatMap Before/After 비교

완료 — 보고서 생성 및 제거
  ├─ 진단 보고서 생성 (§11.4 참조)
  └─ 흔적 없는 제거 (§11.5 참조)
```

### 11.4 진단 보고서 생성

진단이 완료되면 PDF 또는 HTML 형식으로 결과를 내보낼 수 있습니다.

```bash
# PDF 보고서 생성
docker exec aitop-server aitop-lite report \
  --format=pdf \
  --output=/reports/ \
  --title="AI 서비스 성능 진단 보고서 — 2026-03-23"

# HTML 보고서 생성 (웹 브라우저에서 바로 열기 가능)
docker exec aitop-server aitop-lite report \
  --format=html \
  --output=/reports/

# 호스트 머신에서 보고서 확인
ls ./reports/
# → aitop-diagnosis-2026-03-23.pdf
# → aitop-diagnosis-2026-03-23.html
```

보고서 포함 내용:
- 진단 기간 및 대상 서버 목록
- XLog 응답시간 분포 (HeatMap 스냅샷)
- 상위 슬로우 트랜잭션 Top 20
- LLM 체인 구간별 소요시간 분석
- 병목 구간 및 개선 권고사항
- 부하 테스트 전후 성능 비교

### 11.5 흔적 없는 제거

진단이 끝나면 데이터와 컨테이너를 완전히 제거합니다.

```bash
# 1. 컨테이너 + 볼륨 제거 (SQLite DB, Evidence 파일 포함)
docker-compose -f docker-compose.lite.yaml down -v

# 2. 로컬 파일 완전 삭제
docker run --rm -v $(pwd)/data:/data alpine rm -rf /data/
# 또는 호스트에서 직접:
rm -rf ./data/

# 3. 이미지 제거 (선택)
docker rmi aitop/server:latest aitop/agent:latest

# 확인: 남은 파일 없음
ls ./data/ 2>/dev/null || echo "완전히 제거되었습니다"
```

> **Windows Git Bash 사용자**: `$(pwd)` 대신 절대 경로를 사용하세요.
> ```bash
> docker run --rm -v /c/workspace/aiservice-monitoring/data:/data alpine rm -rf /data/
> ```

### 11.6 Lite 모드 설정 커스터마이징

```yaml
# docker-compose.lite.yaml 환경 변수로 조정 가능

services:
  aitop-server:
    environment:
      AITOP_MODE: "lite"
      AITOP_RETENTION_DAYS: "7"      # 데이터 보존 기간 (기본 7일)
      AITOP_UI_PORT: "8080"          # 웹 UI 포트
      AITOP_COLLECT_PORT: "9090"     # 에이전트 수신 포트

  aitop-agent:
    environment:
      AITOP_SERVER: "http://aitop-server:9090"
      AITOP_COLLECT_INTERVAL: "30s"  # 수집 주기 (기본 30초)
      AITOP_XLOG_ENABLED: "true"     # XLog 수집 활성화
      AITOP_PROFILE_ENABLED: "true"  # 프로파일링 활성화
```

### 11.7 Lite 모드 vs 일반 로컬 개발 환경 비교

| 항목 | 일반 로컬 개발 (§1~9) | Lite 모드 (§11) |
|------|----------------------|----------------|
| **목적** | AITOP 코드 개발 및 기능 구현 | AI 서비스 성능 진단 |
| **설치 도구** | Python + Node.js + Go + Docker | Docker만 |
| **데이터베이스** | PostgreSQL (Docker) | SQLite (내장) |
| **스토리지** | MinIO S3 or 로컬 | 로컬 파일시스템 |
| **수정 가능** | 소스 코드 수정 가능 | 설정만 변경 가능 |
| **보고서** | 없음 (개발용) | PDF/HTML 진단 보고서 |

---

## 다음 단계

로컬 환경 설정이 완료되었으면, **[TEST_GUIDE.md](./TEST_GUIDE.md)** 를 참고하여 전체 모니터링 파이프라인을 검증하세요.

| 순서 | 문서 | 설명 |
|------|------|------|
| 1 | 이 문서 (LOCAL_SETUP.md) | 개발 환경 설치 및 구성 |
| 2 | **[TEST_GUIDE.md](./TEST_GUIDE.md)** | 9단계 테스트 검증 (Level 1~9) |
| 3 | [METRICS_DESIGN.md](./METRICS_DESIGN.md) | 지표 정의 이해 후 계측 코드 수정 |
| 4 | [ARCHITECTURE.md](./ARCHITECTURE.md) | 전체 아키텍처 이해 |

---

*문서 관련 문의: Aura Kim `<aura.kimjh@gmail.com>`*
*이 문서는 프로젝트 환경이 변경될 때마다 업데이트합니다.*
