# OS별 명령어 참조 (Windows PowerShell ↔ Linux/Mac Bash)

> 테스트 절차서의 명령어는 **Bash** 기준으로 작성되어 있습니다.
> Windows 환경에서는 아래 대응표를 참고하여 실행하세요.

---

## 0. 명령어 실행 위치 (중요)

> 프로젝트 루트: `C:\workspace\aiservice-monitoring\`

```
C:\workspace\aiservice-monitoring\          ← 프로젝트 루트
├── agent\                                  ← Go 명령 실행 위치
├── frontend\                               ← npm 명령 실행 위치 (package.json이 여기에 있음)
├── docker-compose.e2e.yaml                 ← Docker 명령 (루트에서 실행)
├── scripts\                                ← bash 스크립트 (루트에서 실행)
└── test\                                   ← 테스트 문서
```

| 작업 | Bash 이동 | PowerShell 이동 |
|------|----------|----------------|
| Go 빌드/테스트 | `cd /c/workspace/aiservice-monitoring/agent` | `cd C:\workspace\aiservice-monitoring\agent` |
| Frontend (npm) | `cd /c/workspace/aiservice-monitoring/frontend` | `cd C:\workspace\aiservice-monitoring\frontend` |
| Docker / 스크립트 | `cd /c/workspace/aiservice-monitoring` | `cd C:\workspace\aiservice-monitoring` |

> **주의**: `npm run dev`, `npx vitest run` 등 npm 명령은 반드시 `frontend\` 폴더에서 실행해야 합니다.
> 프로젝트 루트에는 `package.json`이 없으므로 루트에서 npm 명령을 실행하면 에러가 발생합니다.

---

## 1. 실행 환경 선택 가이드

| 환경 | 추천 상황 | 비고 |
|------|----------|------|
| **Git Bash** | Go/Node 테스트, 스크립트 실행 | Windows에서 Bash 명령 그대로 사용 가능 |
| **PowerShell** | Docker, npm, go 명령 | 경로 구분자 `\` 주의 |
| **WSL2** | 전체 테스트 스위트 | Linux 환경 그대로 사용 |

> **권장**: Git Bash 또는 WSL2 사용 시 절차서 명령어를 그대로 실행할 수 있습니다.

---

## 2. 핵심 명령어 대응표

### 환경 검증

| 목적 | Bash (Git Bash / WSL2) | PowerShell |
|------|----------------------|------------|
| Go 버전 | `go version` | `go version` |
| Node 버전 | `node --version` | `node --version` |
| npm 버전 | `npm --version` | `npm --version` |
| Docker 버전 | `docker version` | `docker version` |
| git 상태 | `git status` | `git status` |
| 현재 커밋 | `git rev-parse --short HEAD` | `git rev-parse --short HEAD` |

### 디렉토리 이동

| 목적 | Bash | PowerShell |
|------|------|------------|
| agent 이동 | `cd /c/workspace/aiservice-monitoring/agent` | `cd C:\workspace\aiservice-monitoring\agent` |
| frontend 이동 | `cd /c/workspace/aiservice-monitoring/frontend` | `cd C:\workspace\aiservice-monitoring\frontend` |
| 프로젝트 루트 | `cd /c/workspace/aiservice-monitoring` | `cd C:\workspace\aiservice-monitoring` |

### Go 테스트

| 목적 | Bash | PowerShell |
|------|------|------------|
| 빌드 | `go build ./...` | `go build ./...` |
| 테스트 실행 | `go test -v -count=1 ./...` | `go test -v -count=1 ./...` |
| 커버리지 | `go test -coverprofile=coverage.out ./...` | `go test -coverprofile=coverage.out ./...` |
| 커버리지 확인 | `go tool cover -func=coverage.out \| tail -1` | `go tool cover -func=coverage.out \| Select-Object -Last 1` |
| 로그 저장 | `go test ./... 2>&1 \| tee output.txt` | `go test ./... 2>&1 \| Tee-Object -FilePath output.txt` |

### Frontend 테스트

| 목적 | Bash | PowerShell |
|------|------|------------|
| 의존성 설치 | `npm install` | `npm install` |
| 빌드 | `npx next build` | `npx next build` |
| 개발 서버 | `npm run dev` | `npm run dev` |
| Vitest 실행 | `npx vitest run` | `npx vitest run` |
| 커버리지 | `npx vitest run --coverage` | `npx vitest run --coverage` |
| Playwright | `npx playwright test` | `npx playwright test` |
| Playwright 리포트 | `npx playwright show-report ../reports/playwright` | `npx playwright show-report ..\reports\playwright` |
| 로그 저장 | `npx vitest run 2>&1 \| tee output.txt` | `npx vitest run 2>&1 \| Tee-Object -FilePath output.txt` |

### Docker

| 목적 | Bash | PowerShell |
|------|------|------------|
| 스택 기동 | `docker compose -f docker-compose.e2e.yaml up -d --build` | `docker compose -f docker-compose.e2e.yaml up -d --build` |
| 상태 확인 | `docker compose -f docker-compose.e2e.yaml ps` | `docker compose -f docker-compose.e2e.yaml ps` |
| 로그 확인 | `docker compose -f docker-compose.e2e.yaml logs --tail=50` | `docker compose -f docker-compose.e2e.yaml logs --tail=50` |
| 스택 정리 | `docker compose -f docker-compose.e2e.yaml down -v` | `docker compose -f docker-compose.e2e.yaml down -v` |

### 스크립트 실행

| 목적 | Bash (Git Bash / WSL2) | PowerShell |
|------|----------------------|------------|
| 헬스체크 | `bash scripts/e2e/healthcheck.sh` | `wsl bash scripts/e2e/healthcheck.sh` 또는 Git Bash에서 실행 |
| 파이프라인 검증 | `bash scripts/phase17-3/02-pipeline-verify.sh` | `wsl bash scripts/phase17-3/02-pipeline-verify.sh` |
| 보안 감사 | `bash scripts/e2e/security-audit.sh` | `wsl bash scripts/e2e/security-audit.sh` |
| 트레이스 연속성 | `bash scripts/e2e/trace-continuity.sh` | `wsl bash scripts/e2e/trace-continuity.sh` |

> **중요**: `.sh` 스크립트는 PowerShell에서 직접 실행할 수 없습니다.
> Git Bash에서 실행하거나 `wsl bash` 접두어를 붙여야 합니다.

### API 호출 (curl)

| 목적 | Bash | PowerShell |
|------|------|------------|
| GET 요청 | `curl http://localhost:8080/health` | `Invoke-RestMethod http://localhost:8080/health` |
| POST + JSON | `curl -X POST -d '{"key":"val"}' url` | `Invoke-RestMethod -Method Post -Body '{"key":"val"}' -ContentType 'application/json' url` |
| 헤더 포함 | `curl -H "Authorization: Bearer $TOKEN" url` | `Invoke-RestMethod -Headers @{Authorization="Bearer $TOKEN"} url` |

---

## 3. 자주 발생하는 Windows 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| `npm: command not found` | fnm이 PowerShell에 PATH 설정 안 됨 | 시스템 환경변수에 추가: `C:\Users\{user}\AppData\Roaming\fnm\node-versions\v22.15.1\installation` |
| `bash: command not found` | Git Bash 미설치 또는 PATH 미등록 | Git for Windows 설치 후 `C:\Program Files\Git\bin` PATH 추가 |
| `go: -race requires cgo` | Windows에서 CGO 비활성화 | `-race` 플래그 생략 (Linux CI에서 별도 검증) |
| 경로에 한글 포함 시 에러 | 인코딩 문제 | `chcp 65001` 실행 후 재시도 (UTF-8 코드 페이지) |
| Docker `port already in use` | 다른 프로세스가 포트 점유 | `netstat -ano \| findstr :3000` → PID 확인 → `taskkill /PID {pid} /F` |
| `.sh` 스크립트 줄바꿈 에러 | CRLF vs LF | `git config core.autocrlf input` 설정 후 재체크아웃 |
