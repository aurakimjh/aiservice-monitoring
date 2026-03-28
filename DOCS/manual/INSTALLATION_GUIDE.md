# AITOP 설치 가이드

> **문서 버전**: v1.3.0
> **최종 업데이트**: 2026-03-28
> **대상 독자**: 시스템 관리자, DevOps 엔지니어, SRE
> **관련 문서**: OPERATIONS_GUIDE.md, DEVELOPER_GUIDE.md

---

## 목차

1. [개요 및 아키텍처](#1-개요-및-아키텍처)
2. [시스템 요구사항](#2-시스템-요구사항)
3. [설치 전 준비사항](#3-설치-전-준비사항)
4. [Collection Server 설치](#4-collection-server-설치)
   - 4.1 [Docker Compose 설치](#41-docker-compose-설치)
   - 4.2 [Kubernetes 설치](#42-kubernetes-설치)
   - 4.3 [설치 확인](#43-설치-확인)
5. [Frontend 설치](#5-frontend-설치)
   - 5.1 [소스 빌드 후 배포](#51-소스-빌드-후-배포)
   - 5.2 [Docker 이미지 배포](#52-docker-이미지-배포)
   - 5.3 [설치 확인](#53-설치-확인)
6. [AITOP Agent 설치](#6-aitop-agent-설치)
   - 6.1 [Linux 설치 (패키지)](#61-linux-설치-패키지)
   - 6.2 [Linux 설치 (바이너리)](#62-linux-설치-바이너리)
   - 6.3 [Windows 설치](#63-windows-설치)
   - 6.4 [Docker 컨테이너 설치](#64-docker-컨테이너-설치)
   - 6.5 [Kubernetes DaemonSet 설치](#65-kubernetes-daemonset-설치)
   - 6.6 [Lite 모드 (단일 컨테이너)](#66-lite-모드-단일-컨테이너)
   - 6.7 [설치 확인](#67-설치-확인)
7. [agent.yaml 전체 설정 항목](#7-agentyaml-전체-설정-항목)
   - 7.1 [agent 섹션](#71-agent-섹션)
   - 7.2 [server 섹션](#72-server-섹션)
   - 7.3 [schedule 섹션](#73-schedule-섹션)
   - 7.4 [collectors 섹션](#74-collectors-섹션)
   - 7.5 [remote_shell 섹션](#75-remote_shell-섹션)
   - 7.6 [buffer 섹션](#76-buffer-섹션)
   - 7.7 [logging 섹션](#77-logging-섹션)
8. [모드별 설정 가이드](#8-모드별-설정-가이드)
   - 8.1 [Full 모드](#81-full-모드)
   - 8.2 [Collect-Only 모드](#82-collect-only-모드)
   - 8.3 [Collect-Export 모드](#83-collect-export-모드)
   - 8.4 [Lite 모드](#84-lite-모드)
9. [SDK 계측 설정](#9-sdk-계측-설정)
   - 9.1 [Python 계측](#91-python-계측)
   - 9.2 [Java 계측](#92-java-계측)
   - 9.3 [Node.js 계측](#93-nodejs-계측)
   - 9.4 [Go 계측](#94-go-계측)
   - 9.5 [.NET 계측](#95-net-계측)
10. [네트워크 요구사항](#10-네트워크-요구사항)
11. [TLS/인증서 설정](#11-tls인증서-설정)
12. [SSO 연동 설정](#12-sso-연동-설정)
13. [트러블슈팅](#13-트러블슈팅)
    - 13.1 [Agent 연결 실패](#131-agent-연결-실패)
    - 13.2 [메트릭 수집 안됨](#132-메트릭-수집-안됨)
    - 13.3 [GPU 수집 오류](#133-gpu-수집-오류)
    - 13.4 [프로파일링 실패](#134-프로파일링-실패)
    - 13.5 [로그 및 진단 명령](#135-로그-및-진단-명령)
14. [v1.2 엔티티 모델 + v1.3 AI 구성](#14-v12-엔티티-모델--v13-ai-구성)
    - 14.1 [SQLite DB 자동 생성](#141-sqlite-db-자동-생성)
    - 14.2 [모델 가격 테이블 설정](#142-모델-가격-테이블-설정)

---

## 1. 개요 및 아키텍처

AITOP은 세 가지 주요 구성 요소로 이루어집니다.

```
┌────────────────────────────────────────────────────────────┐
│                    AITOP 플랫폼 구성 요소                    │
├──────────────────┬───────────────────┬─────────────────────┤
│  Collection      │  Frontend         │  AITOP Agent        │
│  Server          │  (Next.js UI)     │  (Go 바이너리)       │
│                  │                   │                     │
│  - gRPC 수신     │  - 44개 화면 UI   │  - 12개 Collector   │
│  - REST API      │  - 대시보드       │  - OS/WEB/WAS/DB    │
│  - Fleet 관리    │  - AI 분석        │  - GPU/LLM/VectorDB │
│  - PostgreSQL    │  - 알림           │  - 프로파일링       │
│  - Prometheus    │  - SLO            │  - gRPC 전송        │
│  - Jaeger        │                   │                     │
│  포트: 50051     │  포트: 3000        │  설치 대상 서버마다  │
│  포트: 8080      │                   │  하나씩 설치        │
└──────────────────┴───────────────────┴─────────────────────┘
```

### 설치 순서

```
1단계: Collection Server 설치  →  2단계: Frontend 설치  →  3단계: Agent 설치 (각 서버)
```

---

## 2. 시스템 요구사항

### Collection Server

| 항목 | 최소 사양 | 권장 사양 |
|------|-----------|-----------|
| CPU | 4 vCPU | 8 vCPU |
| 메모리 | 8 GB | 16 GB |
| 디스크 | 100 GB SSD | 500 GB SSD |
| OS | Ubuntu 22.04 / RHEL 9 | Ubuntu 22.04 LTS |
| Docker | 24.0+ | 최신 stable |
| Kubernetes | 1.28+ | 1.30+ |
| PostgreSQL | 15+ | 16+ |

### Frontend

| 항목 | 최소 사양 | 권장 사양 |
|------|-----------|-----------|
| CPU | 2 vCPU | 4 vCPU |
| 메모리 | 4 GB | 8 GB |
| Node.js | 20 LTS | 22 LTS |
| 브라우저 | Chrome 120+ / Firefox 120+ | 최신 버전 |

### AITOP Agent (모니터링 대상 서버)

| 항목 | 최소 사양 | 권장 사양 |
|------|-----------|-----------|
| CPU | 0.5 vCPU (유휴 시 <1%) | 1 vCPU |
| 메모리 | 256 MB | 512 MB |
| 디스크 | 1 GB | 5 GB (버퍼 포함) |
| OS | Linux (kernel 4.18+) / Windows Server 2019+ | Linux kernel 5.15+ |
| Go 런타임 | 불필요 (정적 바이너리) | — |

### GPU 프로파일링 추가 요구사항

| 항목 | 요구사항 |
|------|----------|
| GPU | NVIDIA (CUDA 11.8+) / AMD (ROCm 5.7+) / Intel Arc |
| 드라이버 | NVIDIA 525.0+ |
| DCGM | NVIDIA DCGM 3.1+ (선택) |

### perf/eBPF 프로파일링 추가 요구사항

| 항목 | 요구사항 |
|------|----------|
| OS | Linux kernel 5.8+ |
| perf | linux-tools 설치 |
| 권한 | `CAP_PERFMON` 또는 root |
| eBPF | kernel 5.8+ (선택적 가속) |

---

## 3. 설치 전 준비사항

### 3.1 프로젝트 토큰 발급

Collection Server 설치 후 UI에서 프로젝트를 생성하면 토큰이 발급됩니다. Agent 설치 시 이 토큰이 필요합니다.

### 3.2 방화벽 규칙 확인

Agent → Collection Server 방향으로 아래 포트가 열려 있어야 합니다.

```
Collection Server 수신 포트:
  - 50051/TCP   gRPC (Agent → Collection Server)
  - 8080/TCP    REST API (Frontend → Collection Server)
  - 9090/TCP    Prometheus (내부 메트릭 스크레이핑, 선택)

Frontend 수신 포트:
  - 3000/TCP    Web UI (사용자 브라우저)
```

### 3.3 소프트웨어 사전 설치

```bash
# Docker 설치 (Ubuntu 기준)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose v2 확인
docker compose version  # 2.20.0 이상

# kubectl (Kubernetes 설치 시)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/

# Helm (Kubernetes 설치 시)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

---

## 4. Collection Server 설치

### 4.1 Docker Compose 설치

프로덕션 환경에 권장되는 설치 방법입니다.

```bash
# 1. 저장소 클론
git clone https://github.com/your-org/aiservice-monitoring.git
cd aiservice-monitoring

# 2. 환경 변수 파일 생성
cp infra/docker/.env.example infra/docker/.env
vi infra/docker/.env
```

`.env` 필수 설정:

```dotenv
# Collection Server
AITOP_SERVER_PORT=8080
AITOP_GRPC_PORT=50051
AITOP_SECRET_KEY=your-secret-key-min-32-chars      # 반드시 변경

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=aitop
POSTGRES_USER=aitop
POSTGRES_PASSWORD=your-secure-password              # 반드시 변경

# Prometheus
PROMETHEUS_RETENTION=30d
PROMETHEUS_STORAGE_PATH=/data/prometheus

# Jaeger
JAEGER_STORAGE_TYPE=badger
JAEGER_BADGER_DIRECTORY=/data/jaeger

# Storage (증거 파일)
EVIDENCE_STORAGE_TYPE=local                          # local 또는 s3
EVIDENCE_STORAGE_PATH=/data/evidence
# S3 사용 시:
# EVIDENCE_STORAGE_TYPE=s3
# AWS_S3_BUCKET=aitop-evidence
# AWS_REGION=ap-northeast-2
```

```bash
# 3. Collection Server 기동
docker compose -f infra/docker/docker-compose.yaml up -d

# 서비스 목록: collection-server, postgres, prometheus, jaeger
docker compose -f infra/docker/docker-compose.yaml ps
```

### 4.2 Kubernetes 설치

```bash
# 1. 네임스페이스 및 RBAC 생성
kubectl apply -f infra/kubernetes/namespace-rbac.yaml

# 2. 시크릿 생성
kubectl create secret generic aitop-secrets \
  --namespace=aitop-monitoring \
  --from-literal=secret-key='your-secret-key' \
  --from-literal=postgres-password='your-postgres-password'

# 3. Helm 차트 설치
helm install aitop ./helm/aiservice-monitoring \
  --namespace aitop-monitoring \
  --set collectionServer.replicaCount=2 \
  --set collectionServer.resources.requests.memory=4Gi \
  --set postgres.persistence.size=100Gi \
  --set prometheus.retention=30d

# 4. 설치 확인
kubectl get pods -n aitop-monitoring
kubectl get svc -n aitop-monitoring
```

### 4.3 설치 확인

```bash
# Health check
curl http://localhost:8080/health
# 예상 응답: {"status":"ok","version":"1.0.0","uptime":...}

# gRPC 연결 확인
grpcurl -plaintext localhost:50051 list
# 예상 응답: aitop.AgentService, grpc.health.v1.Health

# Prometheus 확인
curl http://localhost:9090/-/healthy
# 예상 응답: Prometheus Server is Healthy.

# Jaeger UI 접속
# 브라우저: http://localhost:16686
```

---

## 5. Frontend 설치

### 5.1 소스 빌드 후 배포

```bash
cd frontend

# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env.local
vi .env.local
```

`.env.local` 필수 설정:

```dotenv
NEXT_PUBLIC_API_URL=http://your-collection-server:8080
NEXT_PUBLIC_APP_NAME=AITOP
NEXT_PUBLIC_DEFAULT_LOCALE=ko             # ko, en, ja
NODE_ENV=production
```

```bash
# 3. 프로덕션 빌드
npm run build

# 4. 서버 시작
npm run start
# 기본 포트: 3000

# 또는 PM2로 관리
npm install -g pm2
pm2 start npm --name "aitop-frontend" -- start
pm2 save
pm2 startup
```

### 5.2 Docker 이미지 배포

```bash
# 이미지 빌드
docker build -t aitop-frontend:latest ./frontend

# 컨테이너 실행
docker run -d \
  --name aitop-frontend \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://collection-server:8080 \
  -e NEXT_PUBLIC_DEFAULT_LOCALE=ko \
  aitop-frontend:latest
```

### 5.3 설치 확인

```bash
# 응답 확인
curl -I http://localhost:3000
# 예상: HTTP/1.1 200 OK

# 브라우저 접속
# http://your-server:3000
# 로그인 화면이 표시되면 정상
```

---

## 6. AITOP Agent 설치

Agent는 모니터링할 서버마다 하나씩 설치합니다.

### 6.1 Linux 설치 (패키지)

**Ubuntu / Debian:**

```bash
# 1. APT 저장소 추가
curl -fsSL https://pkg.aitop.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/aitop.gpg
echo "deb [signed-by=/usr/share/keyrings/aitop.gpg] https://pkg.aitop.io/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/aitop.list

# 2. 설치
sudo apt-get update
sudo apt-get install -y aitop-agent

# 3. 서비스 등록 및 시작
sudo systemctl enable aitop-agent
sudo systemctl start aitop-agent
```

**RHEL / CentOS / Rocky Linux:**

```bash
# 1. YUM 저장소 추가
sudo tee /etc/yum.repos.d/aitop.repo << 'EOF'
[aitop]
name=AITOP Repository
baseurl=https://pkg.aitop.io/yum/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://pkg.aitop.io/gpg
EOF

# 2. 설치
sudo dnf install -y aitop-agent

# 3. 서비스 등록 및 시작
sudo systemctl enable aitop-agent
sudo systemctl start aitop-agent
```

설치 후 설정 파일 위치:

```
/etc/aitop-agent/agent.yaml        # 메인 설정 파일
/var/lib/aitop-agent/              # 데이터 디렉토리
/var/log/aitop-agent/              # 로그 디렉토리
/usr/bin/aitop-agent               # 실행 바이너리
```

### 6.2 Linux 설치 (바이너리)

패키지 관리자 없이 직접 설치하는 방법입니다.

```bash
# 1. 바이너리 다운로드
AITOP_VERSION="1.0.0"
ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
curl -LO "https://releases.aitop.io/agent/v${AITOP_VERSION}/aitop-agent-linux-${ARCH}.tar.gz"

# 2. 압축 해제 및 설치
tar -xzf aitop-agent-linux-${ARCH}.tar.gz
sudo mv aitop-agent /usr/local/bin/
sudo chmod +x /usr/local/bin/aitop-agent

# 3. 디렉토리 생성
sudo mkdir -p /etc/aitop-agent
sudo mkdir -p /var/lib/aitop-agent
sudo mkdir -p /var/log/aitop-agent

# 4. 설정 파일 복사 및 편집
sudo cp agent.yaml.example /etc/aitop-agent/agent.yaml
sudo vi /etc/aitop-agent/agent.yaml

# 5. systemd 유닛 생성
sudo tee /etc/systemd/system/aitop-agent.service << 'EOF'
[Unit]
Description=AITOP Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/aitop-agent --config /etc/aitop-agent/agent.yaml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aitop-agent

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable aitop-agent
sudo systemctl start aitop-agent
```

### 6.3 Windows 설치

Windows Server 2019 이상에서 지원됩니다.

```powershell
# 1. PowerShell을 관리자 권한으로 실행

# 2. 바이너리 다운로드
$version = "1.0.0"
Invoke-WebRequest -Uri "https://releases.aitop.io/agent/v$version/aitop-agent-windows-amd64.zip" `
  -OutFile "aitop-agent.zip"
Expand-Archive -Path "aitop-agent.zip" -DestinationPath "C:\Program Files\AITOP Agent"

# 3. 디렉토리 생성
New-Item -ItemType Directory -Force -Path "C:\ProgramData\AITOP Agent\config"
New-Item -ItemType Directory -Force -Path "C:\ProgramData\AITOP Agent\data"
New-Item -ItemType Directory -Force -Path "C:\ProgramData\AITOP Agent\logs"

# 4. 설정 파일 복사
Copy-Item "C:\Program Files\AITOP Agent\agent.yaml.example" `
  "C:\ProgramData\AITOP Agent\config\agent.yaml"

# 5. 설정 파일 편집 (메모장 또는 VS Code로)
notepad "C:\ProgramData\AITOP Agent\config\agent.yaml"
```

`agent.yaml` Windows 경로 설정 변경:

```yaml
buffer:
  path: "C:/ProgramData/AITOP Agent/data/buffer.db"

logging:
  path: "C:/ProgramData/AITOP Agent/logs/agent.log"

remote_shell:
  audit_log_path: "C:/ProgramData/AITOP Agent/logs/terminal-audit.log"
```

```powershell
# 6. Windows 서비스 등록
& "C:\Program Files\AITOP Agent\aitop-agent.exe" install `
  --config "C:\ProgramData\AITOP Agent\config\agent.yaml"

# 7. 서비스 시작
Start-Service -Name "AITOP Agent"

# 서비스 상태 확인
Get-Service -Name "AITOP Agent"
```

### 6.4 Docker 컨테이너 설치

컨테이너 환경(Docker/Kubernetes)에서 실행 중인 애플리케이션 모니터링 시 사용합니다.

```bash
# agent.yaml 준비
mkdir -p /etc/aitop-agent
cat > /etc/aitop-agent/agent.yaml << 'EOF'
agent:
  mode: "full"

server:
  url: "https://collection-server:50051"
  project_token: "your-project-token"

collectors:
  os:
    enabled: "true"
  # ... 이하 생략 (7장 참조)
EOF

# Docker 실행
docker run -d \
  --name aitop-agent \
  --pid=host \
  --network=host \
  --privileged \
  -v /etc/aitop-agent:/etc/aitop-agent:ro \
  -v /var/lib/aitop-agent:/var/lib/aitop-agent \
  -v /var/log/aitop-agent:/var/log/aitop-agent \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  aitop/agent:latest \
  --config /etc/aitop-agent/agent.yaml
```

> **주의**: `--privileged` 또는 `CAP_SYS_PTRACE`, `CAP_PERFMON` 권한이 필요합니다.
> 프로파일링을 사용하지 않는 경우 `--privileged` 없이 실행 가능하지만 일부 기능이 제한됩니다.

### 6.5 Kubernetes DaemonSet 설치

모든 노드에 Agent를 자동 배포하는 방법입니다.

```bash
# 1. ConfigMap 생성 (agent.yaml)
kubectl create configmap aitop-agent-config \
  --namespace aitop-monitoring \
  --from-file=agent.yaml=/etc/aitop-agent/agent.yaml

# 2. Secret 생성 (project token)
kubectl create secret generic aitop-agent-secrets \
  --namespace aitop-monitoring \
  --from-literal=project-token='your-project-token'

# 3. DaemonSet 배포
kubectl apply -f infra/kubernetes/aitop-agent-daemonset.yaml

# 4. 배포 확인
kubectl get daemonset -n aitop-monitoring
kubectl get pods -n aitop-monitoring -l app=aitop-agent
```

GPU 노드에만 배포 시:

```yaml
# aitop-agent-daemonset.yaml 수정
spec:
  template:
    spec:
      nodeSelector:
        nvidia.com/gpu: "true"
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
```

### 6.6 Lite 모드 (단일 컨테이너)

평가 또는 소규모 환경용입니다. Collection Server + Agent가 단일 컨테이너로 실행됩니다.

```bash
# docker-compose.lite.yaml 기동
docker compose -f docker-compose.lite.yaml up -d

# 서비스 확인
docker compose -f docker-compose.lite.yaml ps

# UI 접속: http://localhost:3000
# 기본 계정: admin / admin (최초 로그인 시 비밀번호 변경 필수)
```

Lite 모드 제한사항:
- 단일 프로젝트만 지원
- 멀티테넌트 불가
- Fleet 관리 기능 제한
- 권장 모니터링 대상: 10대 이하

### 6.7 설치 확인

```bash
# Agent 상태 확인
sudo systemctl status aitop-agent

# 연결 상태 확인
aitop-agent status
# 예상 출력:
# Agent ID: agt-xxx-yyy
# Status: connected
# Collection Server: https://collection-server:50051 ✓
# Collectors: os=active, web=active, was=active, db=active, ai_llm=auto

# 로그 확인
sudo journalctl -u aitop-agent -f --no-hostname

# Collection Server에서 Agent 등록 확인
# UI → Fleet → Agents 메뉴에서 해당 서버가 표시되면 정상
```

---

## 7. agent.yaml 전체 설정 항목

설정 파일 위치: `/etc/aitop-agent/agent.yaml`

### 7.1 agent 섹션

```yaml
agent:
  id: ""
  # Agent 고유 ID. 빈 값이면 최초 등록 시 자동 생성되어 파일에 저장됩니다.
  # 수동 지정 시: "agt-prod-web-01" 형식 권장

  mode: "full"
  # 동작 모드:
  #   full          - 데이터 수집 + Collection Server 전송 (기본값)
  #   collect-only  - 데이터 수집만, 전송 안 함 (오프라인 환경)
  #   collect-export - 수집 + OTel Collector로 내보내기 (Collection Server 없이 사용)
```

### 7.2 server 섹션

```yaml
server:
  url: "https://collection-server:50051"
  # Collection Server gRPC 주소. 반드시 https:// 스킴 사용 (TLS 필수)
  # 내부 네트워크: "https://10.0.0.10:50051"

  project_token: ""
  # Collection Server UI에서 발급받은 프로젝트 등록 토큰
  # 환경 변수로 설정 가능: AITOP_PROJECT_TOKEN

  tls:
    cert: ""
    # mTLS 사용 시 Agent 클라이언트 인증서 경로
    # 예: "/etc/aitop-agent/certs/agent.crt"

    key: ""
    # mTLS 사용 시 Agent 클라이언트 키 경로
    # 예: "/etc/aitop-agent/certs/agent.key"

    ca: ""
    # 서버 인증서 검증용 CA 인증서 경로
    # 공인 CA 사용 시 빈 값 (시스템 CA 사용)
    # 사설 CA 사용 시: "/etc/aitop-agent/certs/ca.crt"
    # TLS 검증 비활성화(개발 전용): "insecure"
```

### 7.3 schedule 섹션

```yaml
schedule:
  default: "0 */6 * * *"
  # cron 표현식. 증거(Evidence) 수집 주기.
  # 기본값: 매 6시간마다
  # 예시:
  #   "0 * * * *"     - 매 1시간
  #   "0 0 * * *"     - 매일 자정
  #   "0 */4 * * *"   - 매 4시간

  metrics: "*/60 * * * * *"
  # 초 단위 cron 표현식. 메트릭 전송 주기.
  # 기본값: 매 60초 (1분)
  # 예시:
  #   "*/30 * * * * *"  - 매 30초 (고해상도, 트래픽 증가)
  #   "*/120 * * * * *" - 매 2분 (저부하)
```

### 7.4 collectors 섹션

```yaml
collectors:
  # ─── IT 인프라 Collector ───────────────────────────────────

  os:
    enabled: "true"
    # OS 메트릭 수집 (CPU, 메모리, 디스크, 네트워크, 프로세스 목록)
    # 값: "true" | "false"

  web:
    enabled: "true"
    # 웹 서버(nginx/Apache/httpd) 설정 및 상태 수집
    config_paths:
      - "/etc/nginx"
      - "/etc/httpd"
      - "/etc/apache2"
      # 웹 서버 설정 파일 탐색 경로 목록

  was:
    enabled: "true"
    # WAS(Tomcat/Spring Boot/Gunicorn/Uvicorn) 프로세스 자동 감지 및 수집

  db:
    enabled: "true"
    # 데이터베이스 성능 지표 수집
    connections: []
    # DB 연결 정보 목록. 비어있으면 자동 감지 시도.
    # 명시 설정 예시:
    # - type: "postgresql"          # postgresql | mysql | mariadb | oracle | mssql | mongodb | redis
    #   host: "localhost"
    #   port: 5432
    #   user: "aitop_readonly"      # 읽기 전용 계정 권장
    #   password_env: "AITOP_DB_PASSWORD"  # 환경 변수명으로 비밀번호 참조
    #   database: "myapp"           # 선택적
    #   ssl_mode: "require"         # disable | require | verify-ca | verify-full

  # ─── AI 특화 Collector ────────────────────────────────────

  ai_llm:
    enabled: "auto"
    # LLM/Agent 프레임워크 자동 감지 및 계측
    # "auto": LangChain, LangGraph, LlamaIndex, vLLM, Ollama 등 자동 탐지
    # "true": 강제 활성화
    # "false": 비활성화

  ai_gpu:
    enabled: "auto"
    # NVIDIA/AMD/Intel GPU 메트릭 수집
    # 자동 감지: NVIDIA DCGM, nvidia-smi, AMD ROCm, Intel XPU
    # DCGM 설정 (NVIDIA 권장):
    # dcgm_url: "http://localhost:9400"  # DCGM Exporter URL

  ai_vectordb:
    enabled: "auto"
    # 벡터 DB(Pinecone/Milvus/Qdrant/Chroma/Weaviate) 자동 감지 및 수집

  otel_metrics:
    enabled: "false"
    # 기존 Prometheus/OTel 메트릭을 Collection Server로 프록시 전송
    prometheus_url: "http://localhost:9090"
    # Prometheus 서버 URL (스크레이핑 대상)

  # ─── 배치 프로세스 Collector ─────────────────────────────

  batch:
    enabled: "auto"
    # 배치 프로세스 모니터링
    # 자동 감지: Spring Batch, Airflow, 일반 JVM/Python/Go 프로세스

    poll_interval: 5s
    # 배치 프로세스 상태 조회 주기

    batch_processes: []
    # 명시적 배치 프로세스 지정 (자동 감지 보완)
    # - name: "daily-order-batch"
    #   pattern: "OrderBatchJob"      # 프로세스 이름 패턴 (정규식)
    #   language: "java"              # java | python | go | dotnet
    #   alert_on_failure: true

    spring_batch:
      enabled: "auto"
      # Spring Batch Job 메타데이터 수집
      # db_url: "postgresql://localhost:5432/appdb?sslmode=disable"
      # DB 연결 없으면 JMX로 자동 수집 시도

    airflow:
      enabled: "auto"
      # Apache Airflow DAG/Task 상태 수집
      # base_url: "http://localhost:8080"
      # token: ""                     # Airflow API 토큰 (2.0+)
      # username: "airflow"           # Basic Auth (구버전)
      # password_env: "AIRFLOW_PASSWORD"

  # ─── 프로파일링 Collector ─────────────────────────────────

  profiling:
    perf_ebpf:
      enabled: "auto"
      # Linux perf + eBPF 기반 시스템 프로파일링
      # 요구사항: Linux kernel 5.8+, CAP_PERFMON 또는 root

      sampling_frequency: 99
      # CPU 샘플링 주파수 (Hz). 2의 거듭제곱 값 피할 것 (커널 타이머 간섭)
      # 권장: 97 또는 99
      # 고해상도: 499 (CPU 부하 증가)

      duration: 30
      # 프로파일링 실행 시간 (초). 기본 30초.
      # 짧게: 10 (빠른 스냅샷), 길게: 60 (정밀 분석)

      target: "all"
      # 프로파일링 대상
      # "all"        - 모든 프로세스
      # "pid:12345"  - 특정 프로세스 PID
      # "comm:java"  - 특정 프로그램명

      profile_types:
        - cpu       # CPU 샘플 (온-CPU 시간)
        - offcpu    # 블록 대기 시간 (I/O, 락, 슬립)
        - memory    # 메모리 할당 추적
      # 선택 가능: cpu, offcpu, memory, lock, io

      stack_depth: 127
      # 스택 트레이스 최대 깊이. 127이 perf 기본 최대값.

      symbol_resolvers:
        java: "perf-map-agent"
        # Java 심볼 분석 도구. perf-map-agent 설치 필요.
        python: "py-spy"
        # Python 심볼 분석. py-spy 설치 필요.
        nodejs: "perf-basic-prof"
        # Node.js --perf-basic-prof 플래그 필요.
        go: "dwarf"
        # Go는 DWARF 디버그 정보 내장. 별도 도구 불필요.
        dotnet: "perf-map"
        # .NET CLR 심볼 분석.
```

### 7.5 remote_shell 섹션

```yaml
remote_shell:
  enabled: true
  # 원격 CLI(Remote Shell) 기능 활성화
  # UI의 Fleet → Remote CLI에서 브라우저 기반 터미널 제공

  allowed_roles:
    - "admin"
    - "sre"
    # Remote CLI 접근 허용 역할 목록
    # AITOP RBAC 역할: admin, sre, dev, viewer

  max_sessions: 3
  # 동시 접속 가능한 최대 세션 수

  idle_timeout: 600
  # 비활성 세션 자동 종료 시간 (초). 기본 10분.

  max_session_duration: 3600
  # 단일 세션 최대 허용 시간 (초). 기본 1시간.

  blocked_commands:
    - "rm -rf /"
    - "mkfs"
    - "dd if=/dev/zero"
    - "shutdown"
    - "reboot"
    - "halt"
    - "init 0"
    # 실행 금지 명령어 목록 (부분 문자열 매칭)
    # 추가 차단 예: "passwd", "visudo", "iptables -F"

  audit_enabled: true
  # 세션 감사 로그 기록 여부 (누가 언제 어떤 명령 실행했는지)

  audit_log_path: "/var/log/aitop-agent/terminal-audit.log"
  # 감사 로그 파일 경로
```

### 7.6 buffer 섹션

```yaml
buffer:
  path: "/var/lib/aitop-agent/buffer.db"
  # SQLite 로컬 버퍼 DB 파일 경로
  # Collection Server 연결 끊김 시 메트릭을 로컬에 임시 저장

  max_size_mb: 500
  # 버퍼 최대 크기 (MB). 초과 시 오래된 데이터부터 삭제.
  # 권장: Collection Server 최대 장애 예상 시간 × 메트릭 발생량
```

### 7.7 logging 섹션

```yaml
logging:
  level: "info"
  # 로그 레벨: debug | info | warn | error
  # debug: 매우 상세 (개발/트러블슈팅용, 성능 영향)
  # info:  일반 운영 (기본값)
  # warn:  경고 이상만
  # error: 오류만

  path: "/var/log/aitop-agent/agent.log"
  # 로그 파일 경로

  max_size_mb: 100
  # 단일 로그 파일 최대 크기 (MB). 초과 시 rotation.

  max_backups: 5
  # 보관할 이전 로그 파일 수. 총 (max_backups+1) × max_size_mb 용량 사용.
```

---

## 8. 모드별 설정 가이드

### 8.1 Full 모드

가장 일반적인 설정입니다. Agent가 데이터를 수집하고 Collection Server로 직접 전송합니다.

```yaml
agent:
  mode: "full"

server:
  url: "https://collection-server.internal:50051"
  project_token: "${AITOP_PROJECT_TOKEN}"
  tls:
    ca: "/etc/aitop-agent/certs/ca.crt"
```

### 8.2 Collect-Only 모드

인터넷 비연결 환경 또는 오프라인 감사용입니다. 수집된 데이터는 로컬에 저장됩니다.

```yaml
agent:
  mode: "collect-only"

# server 섹션 불필요

buffer:
  path: "/var/lib/aitop-agent/offline-buffer.db"
  max_size_mb: 5000
```

수동으로 데이터 추출:

```bash
aitop-agent export --output /tmp/evidence-$(date +%Y%m%d).tar.gz
```

### 8.3 Collect-Export 모드

Collection Server 없이 기존 OpenTelemetry Collector 인프라에 데이터를 전송합니다.

```yaml
agent:
  mode: "collect-export"

export:
  otlp:
    endpoint: "http://otel-collector.monitoring:4317"
    protocol: "grpc"           # grpc | http/protobuf
    headers:
      Authorization: "Bearer ${OTEL_AUTH_TOKEN}"
```

### 8.4 Lite 모드

`docker-compose.lite.yaml` 사용 시 자동으로 Lite 모드로 설정됩니다. 별도 agent.yaml 설정 불필요.

---

## 9. SDK 계측 설정

애플리케이션 코드에 OpenTelemetry SDK를 추가하면 LLM 호출, API 요청 등의 분산 추적이 가능합니다.

### 9.1 Python 계측

```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-grpc
```

```python
# sdk-instrumentation/python/otel_setup.py
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(
        OTLPSpanExporter(
            endpoint="http://otel-collector:4317",
        )
    )
)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("my-ai-service")

# LangChain 자동 계측
from opentelemetry.instrumentation.langchain import LangchainInstrumentor
LangchainInstrumentor().instrument()
```

LLM 호출 수동 계측:

```python
with tracer.start_as_current_span("llm.invoke") as span:
    span.set_attribute("llm.model", "gpt-4o")
    span.set_attribute("llm.input_tokens", prompt_tokens)
    response = llm.invoke(prompt)
    span.set_attribute("llm.output_tokens", response_tokens)
    span.set_attribute("llm.ttft_ms", ttft_ms)
```

### 9.2 Java 계측

Java 에이전트를 JVM 기동 시 `-javaagent` 옵션으로 추가합니다.

```bash
# 다운로드
curl -LO https://releases.aitop.io/sdk/java/aitop-agent-java-1.0.0.jar

# JVM 기동 옵션 추가
java -javaagent:/path/to/aitop-agent-java-1.0.0.jar \
     -Dotel.service.name=my-service \
     -Dotel.exporter.otlp.endpoint=http://otel-collector:4317 \
     -Dotel.traces.exporter=otlp \
     -jar myapp.jar
```

Spring Boot `application.properties`:

```properties
otel.service.name=my-spring-service
otel.exporter.otlp.endpoint=http://otel-collector:4317
otel.traces.exporter=otlp
otel.metrics.exporter=otlp
```

### 9.3 Node.js 계측

```bash
npm install @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-grpc
```

```javascript
// tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');

const sdk = new NodeSDK({
  serviceName: 'my-node-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector:4317',
  }),
});
sdk.start();
```

```bash
# 기동 시 require
node -r ./tracing.js app.js
```

### 9.4 Go 계측

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func initTracer() func(context.Context) error {
    exporter, _ := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint("otel-collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("my-go-service"),
        )),
    )
    otel.SetTracerProvider(tp)
    return tp.Shutdown
}
```

### 9.5 .NET 계측

```bash
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
dotnet add package OpenTelemetry.Extensions.Hosting
```

```csharp
// Program.cs
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter(otlp => {
            otlp.Endpoint = new Uri("http://otel-collector:4317");
        }))
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddOtlpExporter(otlp => {
            otlp.Endpoint = new Uri("http://otel-collector:4317");
        }));
```

---

## 10. 네트워크 요구사항

### 포트 요약

| 방향 | 출발지 | 목적지 | 포트 | 프로토콜 | 설명 |
|------|--------|--------|------|----------|------|
| Agent → Collection Server | 모든 Agent 서버 | Collection Server | 50051 | TCP (gRPC/TLS) | 메트릭/이벤트 전송 |
| Agent → OTel Collector | 모든 Agent 서버 | OTel Collector | 4317 | TCP (gRPC) | OTLP 트레이스 전송 |
| Agent → OTel Collector | 모든 Agent 서버 | OTel Collector | 4318 | TCP (HTTP) | OTLP HTTP 전송 |
| Frontend → Collection Server | 사용자 브라우저 | Collection Server | 8080 | TCP (HTTPS) | REST API |
| 브라우저 → Frontend | 사용자 | Frontend Server | 3000 | TCP (HTTPS) | Web UI |
| Collection Server → Prometheus | Collection Server | Prometheus | 9090 | TCP | 메트릭 쿼리 |
| Collection Server → Jaeger | Collection Server | Jaeger | 16686 | TCP | 트레이스 쿼리 |

### 대역폭 예상치

| 환경 | Agent 수 | 예상 대역폭 (평균) |
|------|----------|------------------|
| 소규모 | ~10대 | < 1 Mbps |
| 중규모 | ~50대 | ~5 Mbps |
| 대규모 | ~200대 | ~20 Mbps |

> **참고**: 배치 처리 기간이나 고부하 시 피크 대역폭은 평균의 3~5배에 달할 수 있습니다.

---

## 11. TLS/인증서 설정

### 자체 서명 인증서 생성 (개발/테스트 전용)

```bash
# CA 키 및 인증서 생성
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -out ca.crt -subj "/C=KR/O=AITOP/CN=AITOP-CA"

# Collection Server 서버 인증서
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/C=KR/O=AITOP/CN=collection-server"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt -days 365 -sha256

# Agent 클라이언트 인증서 (mTLS)
openssl genrsa -out agent.key 2048
openssl req -new -key agent.key -out agent.csr \
  -subj "/C=KR/O=AITOP/CN=aitop-agent"
openssl x509 -req -in agent.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out agent.crt -days 365 -sha256

# 배포
sudo cp ca.crt /etc/aitop-agent/certs/
sudo cp agent.crt /etc/aitop-agent/certs/
sudo cp agent.key /etc/aitop-agent/certs/
```

### Let's Encrypt 사용 (공인 도메인 환경)

```bash
certbot certonly --standalone -d aitop.yourdomain.com

# Collection Server에 인증서 경로 지정
# .env 파일:
TLS_CERT_PATH=/etc/letsencrypt/live/aitop.yourdomain.com/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/aitop.yourdomain.com/privkey.pem
```

---

## 12. SSO 연동 설정

Collection Server `.env` 파일에 아래를 추가합니다.

### OIDC (Okta / Google Workspace / Azure AD)

```dotenv
SSO_ENABLED=true
SSO_TYPE=oidc
OIDC_ISSUER_URL=https://your-tenant.okta.com/oauth2/default
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URL=https://aitop.yourdomain.com/auth/callback
```

### SAML (엔터프라이즈 IdP)

```dotenv
SSO_ENABLED=true
SSO_TYPE=saml
SAML_IDP_METADATA_URL=https://your-idp.com/metadata
SAML_SP_ENTITY_ID=https://aitop.yourdomain.com
SAML_SP_ACS_URL=https://aitop.yourdomain.com/auth/saml/acs
```

---

## 13. 트러블슈팅

### 13.1 Agent 연결 실패

**증상**: `aitop-agent status`에서 `disconnected` 또는 UI에서 Agent가 나타나지 않음

```bash
# 1. Collection Server 포트 연결 테스트
nc -zv collection-server 50051
# 또는
curl -k https://collection-server:50051

# 2. TLS 인증서 확인
openssl s_client -connect collection-server:50051 -CAfile /etc/aitop-agent/certs/ca.crt

# 3. Project Token 확인
grep project_token /etc/aitop-agent/agent.yaml

# 4. 방화벽 확인
sudo iptables -L -n | grep 50051
sudo firewall-cmd --list-all   # RHEL 계열

# 5. Agent 상세 로그
sudo journalctl -u aitop-agent -n 100 --no-hostname
```

### 13.2 메트릭 수집 안됨

**증상**: UI 대시보드에서 특정 Collector 메트릭 미표시

```bash
# Collector 상태 상세 확인
aitop-agent collectors status

# 특정 Collector 디버그
aitop-agent collectors test --collector=db

# 데이터베이스 연결 수동 테스트
psql -h localhost -U aitop_readonly -d myapp -c "SELECT 1;"

# 로그 레벨을 debug로 임시 변경
sudo sed -i 's/level: "info"/level: "debug"/' /etc/aitop-agent/agent.yaml
sudo systemctl restart aitop-agent
sudo journalctl -u aitop-agent -f | grep "collector=db"
```

### 13.3 GPU 수집 오류

**증상**: GPU 메트릭 미표시, `ai_gpu collector failed` 로그

```bash
# NVIDIA GPU 감지 확인
nvidia-smi
nvcc --version

# DCGM 상태 확인 (사용 시)
dcgmi status

# nvidia-smi 권한 확인
ls -la /dev/nvidia*
# Agent 프로세스가 nvidia 그룹에 포함되었는지 확인
sudo usermod -aG video aitop-agent-user

# DCGM Exporter 동작 확인
curl http://localhost:9400/metrics | head -20
```

### 13.4 프로파일링 실패

**증상**: FlameGraph 화면에서 데이터 없음, `perf_ebpf collector: permission denied`

```bash
# 커널 버전 확인 (5.8+ 필요)
uname -r

# perf 설치 확인
which perf
perf --version

# 권한 확인
sudo getcap /usr/bin/perf
# cap_perfmon+ep 이 있어야 함

# 권한 부여
sudo setcap cap_perfmon,cap_bpf+ep /usr/bin/perf

# perf 이벤트 접근 허용 (시스템 전역)
echo 1 | sudo tee /proc/sys/kernel/perf_event_paranoid

# Java 심볼 분석 도구 확인
which perf-map-agent || echo "perf-map-agent 설치 필요"
```

### 13.5 로그 및 진단 명령

```bash
# Agent 전체 상태 덤프
aitop-agent diagnose > /tmp/aitop-diagnose-$(date +%Y%m%d-%H%M%S).txt

# 실시간 로그
sudo tail -f /var/log/aitop-agent/agent.log

# 버퍼 상태 확인
aitop-agent buffer status
# 출력: Buffer: 2.3 MB / 500 MB, Pending: 1,234 records

# 네트워크 연결 상태
aitop-agent network test

# 설정 파일 유효성 검사
aitop-agent config validate --config /etc/aitop-agent/agent.yaml

# 강제 재연결
aitop-agent reconnect

# Agent 재시작
sudo systemctl restart aitop-agent
```

**Collection Server 로그 확인**:

```bash
# Docker Compose 환경
docker compose -f infra/docker/docker-compose.yaml logs -f collection-server

# Kubernetes 환경
kubectl logs -n aitop-monitoring -l app=collection-server -f --tail=100
```

---

## 14. v1.2 엔티티 모델 + v1.3 AI 구성

> v1.2에서 Project → Host → Service → Instance 엔티티 모델이 도입되었고,
> v1.3에서 LLM 토큰 비용 추적을 위한 모델 가격 테이블이 추가되었습니다.

### 14.1 SQLite DB 자동 생성

v1.2부터 Collection Server는 엔티티 메타데이터를 SQLite에 저장합니다.
서버 최초 기동 시 SQLite 파일이 자동으로 생성됩니다.

**환경변수 설정**:

```bash
# Collection Server 환경변수
AITOP_DB_PATH=/var/lib/aitop/aitop.db    # SQLite 파일 경로 (기본값)
```

**Docker Compose 설정**:
```yaml
aitop-server:
  environment:
    - AITOP_DB_PATH=/data/aitop.db
  volumes:
    - aitop_data:/data    # 영속성을 위해 볼륨 마운트 필수
```

**Kubernetes 설정**:
```yaml
env:
  - name: AITOP_DB_PATH
    value: /data/aitop.db
volumeMounts:
  - name: aitop-data
    mountPath: /data
```

**주의사항**:
- SQLite 파일이 위치하는 디렉토리에 **쓰기 권한**이 필요합니다
- Docker/K8s 환경에서는 반드시 **영속 볼륨**에 마운트하세요 (컨테이너 재시작 시 데이터 유실 방지)
- 기본 경로를 변경하려면 `AITOP_DB_PATH` 환경변수를 설정합니다
- 서버 기동 시 DB 파일이 없으면 자동으로 생성되며, 스키마 마이그레이션도 자동 실행됩니다

**확인 방법**:
```bash
# SQLite 파일 존재 확인
ls -la /var/lib/aitop/aitop.db

# 테이블 확인 (sqlite3 설치 필요)
sqlite3 /var/lib/aitop/aitop.db ".tables"
# 출력 예: projects  hosts  services  instances  host_approvals  ...
```

### 14.2 모델 가격 테이블 설정

v1.3에서 LLM 토큰 비용을 계산하려면 모델별 가격 정보를 등록해야 합니다.

**API 엔드포인트**: `PUT /genai/model-prices`

**모델 가격 등록**:
```bash
curl -X PUT http://localhost:8080/genai/model-prices \
  -H "Content-Type: application/json" \
  -d '{
    "prices": [
      {
        "model": "gpt-4o",
        "provider": "openai",
        "input_cost_per_1k_tokens": 0.0025,
        "output_cost_per_1k_tokens": 0.01,
        "effective_date": "2026-03-01"
      },
      {
        "model": "gpt-4o-mini",
        "provider": "openai",
        "input_cost_per_1k_tokens": 0.00015,
        "output_cost_per_1k_tokens": 0.0006,
        "effective_date": "2026-03-01"
      },
      {
        "model": "claude-3.5-sonnet",
        "provider": "anthropic",
        "input_cost_per_1k_tokens": 0.003,
        "output_cost_per_1k_tokens": 0.015,
        "effective_date": "2026-03-01"
      },
      {
        "model": "llama3.2:3b",
        "provider": "ollama",
        "input_cost_per_1k_tokens": 0,
        "output_cost_per_1k_tokens": 0,
        "effective_date": "2026-03-01"
      }
    ]
  }'
```

**가격 조회**:
```bash
curl -s http://localhost:8080/genai/model-prices | jq '.'
```

**주의사항**:
- 가격 정보가 등록되지 않은 모델의 비용은 0으로 계산됩니다
- `effective_date`를 활용하여 가격 변경 이력을 관리할 수 있습니다
- 로컬 모델(Ollama 등)은 비용을 0으로 설정합니다
