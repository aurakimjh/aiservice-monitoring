# AITOP 초보자용 매뉴얼 테스트 절차서 (MANUAL_TESTING_GUIDE.md)

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **대상 독자**: 이 프로젝트를 처음 접하는 초보자 (코딩 경험 불필요)
> **최종 업데이트**: 2026-03-26 (Phase 1~40 + Phase 7'~9' 전체 완료, v1.0.0 릴리스 — RUM·Golden Signals·런타임·DB 모니터링·K8s 배포·SLO 튜닝 포함)
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`
>
> **관련 문서**:
> - [TEST_GUIDE.md](./TEST_GUIDE.md) — 통합 테스트 전략 가이드 (상위 문서)
> - [LOCAL_SETUP.md](./LOCAL_SETUP.md) — 로컬 개발 환경 구성

이 문서는 **컴퓨터에 명령어를 입력하는 방법부터** 시작하는 완전 초보자용 테스트 절차서입니다.
각 단계마다 **정확히 무엇을 입력하고, 무엇이 화면에 나타나야 하는지** 설명합니다.

---

## 목차

1. [시작하기 전에 — 필요 소프트웨어 설치](#1-시작하기-전에--필요-소프트웨어-설치)
2. [Step 1: 소스코드 준비](#2-step-1-소스코드-준비)
3. [Step 2: Go 백엔드 빌드 테스트](#3-step-2-go-백엔드-빌드-테스트)
4. [Step 3: Go 유닛 테스트](#4-step-3-go-유닛-테스트)
5. [Step 4: Frontend 빌드 테스트](#5-step-4-frontend-빌드-테스트)
6. [Step 5: Frontend 데모 모드 확인](#6-step-5-frontend-데모-모드-확인)
7. [Step 6: Collection Server 실행 테스트](#7-step-6-collection-server-실행-테스트)
8. [Step 7: Docker 통합 테스트](#8-step-7-docker-통합-테스트)
9. [Step 8: 결과 기록](#9-step-8-결과-기록)
10. [Step 9: Phase 31-38 신규 기능 테스트](#10-step-9-phase-31-38-신규-기능-테스트)

---

## 1. 시작하기 전에 — 필요 소프트웨어 설치

테스트를 시작하기 전에 아래 소프트웨어가 설치되어 있어야 합니다.
각 항목을 하나씩 확인하세요.

### 1-1. Git (소스코드 다운로드용)

**설치 확인 방법**:
1. 키보드에서 `Windows 키 + R`을 누릅니다
2. `cmd`를 입력하고 엔터를 누릅니다 (명령 프롬프트가 열립니다)
3. 아래 명령어를 입력하고 엔터를 누릅니다:

```
git --version
```

**정상 결과**: `git version 2.x.x.windows.x` 같은 메시지가 나옵니다.

**설치가 안 되어 있다면**: https://git-scm.com/downloads 에서 다운로드하여 설치합니다. 설치 시 모든 옵션을 기본값으로 유지합니다.

### 1-2. Git Bash (명령어 실행 환경)

Git을 설치하면 **Git Bash**도 함께 설치됩니다.
이 문서의 모든 명령어는 **Git Bash**에서 실행합니다 (일반 CMD나 PowerShell이 아닙니다).

**Git Bash 여는 방법**:
1. Windows 시작 메뉴에서 `Git Bash`를 검색합니다
2. 클릭하여 실행합니다
3. 검은 배경의 터미널 창이 열립니다

> 앞으로 "터미널을 여세요" 라고 하면, 항상 **Git Bash**를 의미합니다.

### 1-3. Go (백엔드 컴파일용)

**설치 확인** (Git Bash에서):

```bash
go version
```

**정상 결과**: `go version go1.25.x windows/amd64` (버전이 1.25 이상이어야 합니다)

**설치가 안 되어 있다면**: https://go.dev/dl/ 에서 `go1.25.x.windows-amd64.msi`를 다운로드하여 설치합니다. 설치 후 Git Bash를 **닫았다가 다시 열어야** PATH가 적용됩니다.

### 1-4. Node.js (프론트엔드 빌드용)

**설치 확인** (Git Bash에서):

```bash
node --version
npm --version
```

**정상 결과**:
- `node`: `v22.x.x` 이상
- `npm`: `10.x.x` 이상

**설치가 안 되어 있다면**: https://nodejs.org 에서 LTS 버전을 다운로드하여 설치합니다. 설치 후 Git Bash를 **닫았다가 다시 열어야** PATH가 적용됩니다.

### 1-5. Docker Desktop (컨테이너 실행용)

**설치 확인** (Git Bash에서):

```bash
docker --version
docker compose version
```

**정상 결과**:
- `docker`: `Docker version 27.x.x` 이상
- `docker compose`: `Docker Compose version v2.x.x` 이상

**설치가 안 되어 있다면**: https://www.docker.com/products/docker-desktop/ 에서 다운로드하여 설치합니다.

> Docker Desktop은 설치 후 **반드시 실행** 해야 합니다. 시스템 트레이(화면 오른쪽 아래)에 고래 아이콘이 있으면 실행 중입니다.

### 1-6. 전체 확인 스크립트

Git Bash에서 아래 명령어를 한 번에 실행하여 모든 도구가 설치되었는지 확인합니다:

```bash
echo "=== 환경 확인 ==="
echo "Git:    $(git --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "Go:     $(go version 2>/dev/null || echo 'NOT INSTALLED')"
echo "Node:   $(node --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "npm:    $(npm --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "Docker: $(docker --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "Compose: $(docker compose version 2>/dev/null || echo 'NOT INSTALLED')"
echo "=== 확인 완료 ==="
```

모든 항목에 버전 번호가 표시되면 준비 완료입니다. `NOT INSTALLED`이 있으면 해당 도구를 설치하세요.

---

## 2. Step 1: 소스코드 준비

### 2-1. 소스코드 다운로드 (처음인 경우)

이미 소스코드가 있다면 2-2로 건너뛰세요.

Git Bash에서:

```bash
# 작업 디렉토리로 이동
cd /c/workspace

# 소스코드 다운로드 (시간이 걸릴 수 있습니다)
git clone https://github.com/aura-kimjh/aiservice-monitoring.git

# 다운로드된 디렉토리로 이동
cd aiservice-monitoring
```

**정상 결과**: `Cloning into 'aiservice-monitoring'...` 메시지가 나오고, 다운로드가 완료됩니다.

### 2-2. 소스코드 최신화 (이미 있는 경우)

```bash
cd /c/workspace/aiservice-monitoring
git pull origin master
```

**정상 결과**: `Already up to date.` 또는 업데이트된 파일 목록이 표시됩니다.

### 2-3. 디렉토리 구조 확인

현재 디렉토리가 맞는지 확인합니다:

```bash
ls -la
```

**반드시 보여야 하는 항목들**:

| 항목 | 유형 | 설명 |
|------|------|------|
| `agent/` | 폴더 | Go 백엔드 (Collection Server + Agent) |
| `frontend/` | 폴더 | Next.js 프론트엔드 |
| `DOCS/` | 폴더 | 문서 |
| `docker-compose.e2e.yaml` | 파일 | E2E 통합 테스트 설정 |
| `locust/` | 폴더 | 부하 테스트 설정 |
| `helm/` | 폴더 | Kubernetes 배포 설정 |

위 항목이 보이면 올바른 디렉토리에 있는 것입니다.

---

## 3. Step 2: Go 백엔드 빌드 테스트

### 이 단계의 목적

Go로 작성된 백엔드 코드(Collection Server와 Agent)가 문법 오류 없이 **컴파일**되는지 확인합니다. 빌드가 실패하면 서버를 실행할 수 없으므로, 이 단계가 가장 먼저 통과해야 합니다.

### 3-1. 명령어 실행

Git Bash에서:

```bash
cd /c/workspace/aiservice-monitoring/agent
go build ./...
```

> `./...`는 "현재 디렉토리와 모든 하위 디렉토리의 Go 패키지를 빌드하라"는 의미입니다.

### 3-2. 결과 판단

**성공인 경우**: 아무 메시지도 나오지 않고 다음 명령 프롬프트가 바로 나타납니다.

```
$ go build ./...
$                   <-- 이렇게 아무 출력 없이 프롬프트가 돌아오면 성공!
```

> Go에서는 "출력 없음 = 성공"입니다. 아무 메시지 없이 끝나면 빌드에 성공한 것입니다.

**실패인 경우**: 빨간색 에러 메시지가 나타납니다.

```
# github.com/aurakimjh/aiservice-monitoring/agent/internal/...
./somefile.go:42:15: undefined: someFunction
```

### 3-3. 에러가 발생했을 때 대응

1. **에러 메시지 읽는 법**:
   - `./somefile.go:42:15` → `somefile.go` 파일의 42번째 줄, 15번째 글자에서 오류
   - `undefined: someFunction` → `someFunction`이라는 이름을 찾을 수 없음

2. **흔한 해결 방법**:

```bash
# 모듈 의존성 정리
cd /c/workspace/aiservice-monitoring/agent
go mod tidy

# 다시 빌드
go build ./...
```

3. **그래도 안 되면**: 에러 메시지를 복사하여 프로젝트 관리자에게 공유하세요.

### 3-4. 이 단계의 체크리스트

```
[ ] cd /c/workspace/aiservice-monitoring/agent 로 이동했다
[ ] go build ./... 을 실행했다
[ ] 에러 메시지 없이 프롬프트가 돌아왔다 → PASS
```

---

## 4. Step 3: Go 유닛 테스트

### 이 단계의 목적

Go 코드의 개별 기능이 올바르게 동작하는지 확인합니다. 현재 30개의 테스트 파일이 있으며, 각각 특정 모듈의 기능을 검증합니다.

### 4-1. 명령어 실행

```bash
cd /c/workspace/aiservice-monitoring/agent
go test ./... -v
```

> `-v`는 "verbose" (상세 출력)의 약자입니다. 각 테스트의 결과를 하나씩 보여줍니다.

### 4-2. 결과 읽는 법

출력이 상당히 길 수 있습니다. 핵심은 각 줄의 시작 부분입니다:

**PASS (성공)**:

```
--- PASS: TestOSCollector (0.15s)
ok      github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/os   0.150s
```

- `--- PASS:` → 이 테스트는 통과
- `ok` → 이 패키지의 모든 테스트가 통과

**FAIL (실패)**:

```
--- FAIL: TestSomeFunction (0.01s)
    somefile_test.go:25: expected 42, got 0
FAIL    github.com/aurakimjh/aiservice-monitoring/agent/internal/some   0.010s
```

- `--- FAIL:` → 이 테스트는 실패
- `expected 42, got 0` → 42를 기대했는데 0이 나옴

**SKIP (건너뜀)**:

```
--- SKIP: TestS3Backend (0.00s)
    s3_backend_test.go:15: S3 endpoint not configured, skipping
```

- `--- SKIP:` → 환경이 갖추어지지 않아 건너뜀 (정상)

### 4-3. 최종 결과 확인

출력의 맨 마지막 부분을 확인합니다:

```
ok      github.com/aurakimjh/aiservice-monitoring/agent/internal/collector/os       0.150s
ok      github.com/aurakimjh/aiservice-monitoring/agent/internal/output             0.120s
ok      github.com/aurakimjh/aiservice-monitoring/agent/internal/statemachine       0.080s
...
```

**모든 줄이 `ok`로 시작**하면 전체 통과입니다.
**하나라도 `FAIL`**이 있으면 실패입니다.

### 4-4. 에러가 발생했을 때 대응

1. `FAIL` 줄에 표시된 패키지명과 에러 메시지를 기록합니다
2. 해당 테스트만 다시 실행하여 재현 여부를 확인합니다:

```bash
# 특정 패키지만 테스트 (예시)
go test ./internal/collector/os -v
```

3. 일시적 오류(타이밍, 네트워크)일 수 있으므로 한 번 더 실행합니다
4. 반복적으로 실패하면 에러 메시지를 기록하고 다음 단계로 진행합니다

### 4-5. 이 단계의 체크리스트

```
[ ] go test ./... -v 를 실행했다
[ ] 결과에서 FAIL이 0개인지 확인했다
[ ] SKIP은 괜찮다 (환경 의존 테스트)
[ ] 전체 결과: __개 PASS / __개 FAIL / __개 SKIP
```

---

## 5. Step 4: Frontend 빌드 테스트

### 이 단계의 목적

Next.js 16 프론트엔드가 TypeScript 오류 없이 빌드되는지 확인합니다. 44개 이상의 페이지가 있으며, 빌드 과정에서 모든 페이지의 타입 검사와 최적화가 수행됩니다.

### 5-1. 의존성 설치

프론트엔드 디렉토리로 이동하여 필요한 패키지를 설치합니다:

```bash
cd /c/workspace/aiservice-monitoring/frontend
npm install
```

**정상 결과**: `added XXX packages in Xs` 메시지가 나타납니다. 경고(WARN)는 무시해도 됩니다.

> 이 작업은 처음 한 번만 필요합니다. 이미 설치했다면 매우 빠르게 끝납니다.
> 시간이 오래 걸릴 수 있습니다 (1-5분). 인터넷 연결이 필요합니다.

**에러가 발생하면**:

```bash
# node_modules 삭제 후 재설치
rm -rf node_modules
npm install
```

### 5-2. 빌드 실행

```bash
npx next build
```

> `npx`는 로컬에 설치된 패키지의 명령어를 실행하는 도구입니다.
> `npx next build`는 프로젝트에 설치된 Next.js를 사용하여 빌드합니다.

### 5-3. 결과 읽는 법

빌드에 시간이 걸립니다 (1-3분). 진행 상황이 표시됩니다.

**성공인 경우**: 마지막에 라우트 테이블이 표시됩니다:

```
Route (app)                              Size     First Load JS
+ /                                      5.2 kB         145 kB
+ /agents                                3.1 kB         143 kB
+ /ai                                    4.5 kB         144 kB
+ /alerts                                2.8 kB         142 kB
...
+ First Load JS shared by all            140 kB

Build completed successfully
```

이 테이블이 표시되면 **빌드 성공**입니다.

**실패인 경우**: TypeScript 오류가 표시됩니다:

```
Type error: Property 'xyz' does not exist on type 'ABC'.

  14 |   return (
  15 |     <div>
> 16 |       {data.xyz}
     |             ^
  17 |     </div>
```

### 5-4. TypeScript 에러 읽는 법 (초보자 가이드)

TypeScript 에러 메시지가 어렵게 느껴질 수 있습니다. 핵심만 보면 됩니다:

1. **파일 경로**: 에러가 발생한 파일 위치
2. **줄 번호**: `> 16 |` → 16번째 줄
3. **에러 메시지**: `Property 'xyz' does not exist on type 'ABC'`
   - 해석: `ABC`라는 타입에 `xyz`라는 속성이 없다

에러를 수정할 필요는 없습니다. **에러가 있다는 사실만 기록**하면 됩니다.

### 5-5. Frontend 유닛 테스트 (추가)

빌드와 별도로, 컴포넌트 단위 테스트도 실행합니다:

```bash
cd /c/workspace/aiservice-monitoring/frontend
npx vitest run
```

**정상 결과**: 각 테스트 파일에 대해 PASS 표시:

```
 ✓ src/components/ui/__tests__/button.test.tsx (3 tests)
 ✓ src/hooks/__tests__/use-i18n.test.ts (2 tests)
 ✓ src/lib/__tests__/i18n.test.ts (4 tests)
 ✓ src/lib/__tests__/utils.test.ts (5 tests)
 ✓ src/stores/__tests__/ui-store.test.ts (3 tests)

 Test Files  5 passed (5)
 Tests       17 passed (17)
```

### 5-6. 이 단계의 체크리스트

```
[ ] npm install 을 실행하여 의존성을 설치했다
[ ] npx next build 를 실행했다
[ ] 라우트 테이블이 표시되었다 (빌드 성공) → PASS
[ ] TypeScript 에러가 있다면 에러 메시지를 기록했다 → FAIL (기록: ________)
[ ] npx vitest run 을 실행했다
[ ] 테스트 결과: __개 PASS / __개 FAIL
```

---

## 6. Step 5: Frontend 데모 모드 확인

### 이 단계의 목적

프론트엔드가 **백엔드 없이도** 동작하는지 확인합니다. AITOP 프론트엔드는 백엔드에 연결할 수 없을 때 `demo-data.ts`의 정적 데이터를 사용하여 화면을 렌더링합니다. 이것을 "데모 모드"라고 합니다.

### 6-1. 개발 서버 실행

```bash
cd /c/workspace/aiservice-monitoring/frontend
npm run dev
```

**정상 결과**:

```
  - Local:        http://localhost:3000
  - Environments: .env

 Ready in 2.5s
```

> 이 터미널은 **닫지 마세요**. 서버가 실행 중이어야 합니다.
> 서버를 중지하려면 `Ctrl + C`를 누르세요.

### 6-2. 브라우저에서 접속

1. 웹 브라우저(Chrome 추천)를 엽니다
2. 주소창에 `http://localhost:3000` 을 입력하고 엔터를 누릅니다
3. AITOP 메인 대시보드가 표시되어야 합니다

### 6-3. 로그인 (필요한 경우)

로그인 화면이 나타나면:

| 항목 | 입력값 |
|------|--------|
| 이메일 | `admin@aitop.io` |
| 비밀번호 | `admin` |

### 6-4. 44개 페이지 순회 확인

아래 표의 URL을 하나씩 브라우저에 입력하여 각 페이지가 정상 렌더링되는지 확인합니다.

**확인 방법**:
- 브라우저 주소창에 URL을 입력하고 엔터
- 페이지가 로딩되면 **에러 없이 내용이 표시되는지** 확인
- 빈 흰 화면이거나 에러 메시지가 보이면 FAIL

> 키보드 `F12`를 누르면 "개발자 도구"가 열립니다.
> **Console** 탭에서 빨간색 에러가 있는지 확인하세요.
> 빨간색 에러가 있으면 해당 에러 메시지를 기록하세요.

| # | URL | 페이지 | 확인 사항 | 결과 |
|---|-----|--------|----------|------|
| 1 | http://localhost:3000/ | 메인 대시보드 | KPI 카드가 보이는가 | [ ] |
| 2 | http://localhost:3000/login | 로그인 | 로그인 폼이 보이는가 | [ ] |
| 3 | http://localhost:3000/agents | 에이전트 목록 | 테이블이 보이는가 | [ ] |
| 4 | http://localhost:3000/ai | AI 서비스 | 서비스 목록이 보이는가 | [ ] |
| 5 | http://localhost:3000/ai/costs | AI 비용 | 비용 차트가 보이는가 | [ ] |
| 6 | http://localhost:3000/ai/evaluation | AI 평가 | 평가 데이터가 보이는가 | [ ] |
| 7 | http://localhost:3000/ai/gpu | GPU 모니터링 | GPU 정보가 보이는가 | [ ] |
| 8 | http://localhost:3000/ai/prompts | 프롬프트 관리 | 프롬프트 목록이 보이는가 | [ ] |
| 9 | http://localhost:3000/ai/training | 학습 관리 | 학습 작업 목록이 보이는가 | [ ] |
| 10 | http://localhost:3000/alerts | 알림 | 알림 목록이 보이는가 | [ ] |
| 11 | http://localhost:3000/anomalies | 이상 탐지 | 이상 징후가 보이는가 | [ ] |
| 12 | http://localhost:3000/business | 비즈니스 | KPI가 보이는가 | [ ] |
| 13 | http://localhost:3000/cloud | 클라우드 | 클라우드 리소스가 보이는가 | [ ] |
| 14 | http://localhost:3000/copilot | 코파일럿 | 채팅 인터페이스가 보이는가 | [ ] |
| 15 | http://localhost:3000/costs | 비용 관리 | 비용 정보가 보이는가 | [ ] |
| 16 | http://localhost:3000/dashboards | 대시보드 빌더 | 대시보드 목록이 보이는가 | [ ] |
| 17 | http://localhost:3000/diagnostics | 진단 보고서 | 보고서 목록이 보이는가 | [ ] |
| 18 | http://localhost:3000/executive | 경영진 | Executive KPI가 보이는가 | [ ] |
| 19 | http://localhost:3000/infra | 인프라 | 서버 목록이 보이는가 | [ ] |
| 20 | http://localhost:3000/infra/cache | 캐시 | Redis/캐시 상태가 보이는가 | [ ] |
| 21 | http://localhost:3000/infra/queues | 메시지 큐 | 큐 상태가 보이는가 | [ ] |
| 22 | http://localhost:3000/logs | 로그 뷰어 | 로그 목록이 보이는가 | [ ] |
| 23 | http://localhost:3000/marketplace | 마켓플레이스 | 플러그인 목록이 보이는가 | [ ] |
| 24 | http://localhost:3000/metrics | 메트릭 탐색기 | 메트릭 차트가 보이는가 | [ ] |
| 25 | http://localhost:3000/mobile | 모바일 | 반응형 화면이 보이는가 | [ ] |
| 26 | http://localhost:3000/notebooks | 노트북 | 노트북 목록이 보이는가 | [ ] |
| 27 | http://localhost:3000/pipelines | 파이프라인 | 파이프라인 목록이 보이는가 | [ ] |
| 28 | http://localhost:3000/profiling | 프로파일링 | 프로파일 목록이 보이는가 | [ ] |
| 29 | http://localhost:3000/projects | 프로젝트 | 프로젝트 목록이 보이는가 | [ ] |
| 30 | http://localhost:3000/projects/new | 프로젝트 생성 | 생성 폼이 보이는가 | [ ] |
| 31 | http://localhost:3000/services | 서비스 | 서비스 목록이 보이는가 | [ ] |
| 32 | http://localhost:3000/settings | 설정 | 설정 폼이 보이는가 | [ ] |
| 33 | http://localhost:3000/slo | SLO | SLO 목록이 보이는가 | [ ] |
| 34 | http://localhost:3000/tenants | 테넌트 | 테넌트 목록이 보이는가 | [ ] |
| 35 | http://localhost:3000/topology | 토폴로지 | 토폴로지 그래프가 보이는가 | [ ] |
| 36 | http://localhost:3000/traces | 트레이스 | 트레이스 목록이 보이는가 | [ ] |

> 동적 경로 페이지(`/ai/{id}`, `/traces/{traceId}` 등)는 유효한 ID가 필요하므로, 위 목록의 기본 경로에서 접근 가능한 경우에만 확인합니다.

### 6-5. 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| 페이지가 전혀 열리지 않음 | 개발 서버 미실행 | `npm run dev`가 실행 중인지 확인 |
| 흰 화면만 보임 | JavaScript 오류 | F12 → Console 탭에서 에러 확인 |
| `500 Internal Server Error` | 서버 컴포넌트 오류 | `npm run dev`를 실행 중인 터미널에서 에러 확인 |
| 포트 3000이 이미 사용 중 | 다른 프로그램이 3000번 포트 사용 | `npm run dev -- -p 3001` 로 다른 포트 사용 |

### 6-6. 개발 서버 종료

테스트가 끝나면 개발 서버를 실행 중인 터미널에서 `Ctrl + C`를 누릅니다.

### 6-7. 이 단계의 체크리스트

```
[ ] npm run dev 로 개발 서버를 시작했다
[ ] http://localhost:3000 에 접속하여 메인 페이지를 확인했다
[ ] 로그인 (admin@aitop.io / admin) 에 성공했다
[ ] 36개 기본 페이지를 순회하여 렌더링을 확인했다
[ ] 정상 렌더링 페이지: __개 / 36개
[ ] 실패 페이지 목록: ________
[ ] Ctrl + C 로 개발 서버를 종료했다
```

---

## 7. Step 6: Collection Server 실행 테스트

### 이 단계의 목적

Go로 작성된 Collection Server(백엔드)를 실행하고, REST API가 정상 응답하는지 확인합니다. 프론트엔드는 이 서버의 API를 호출하여 데이터를 가져옵니다.

### 7-1. Collection Server 실행

Git Bash 터미널을 **새로** 엽니다 (이전 터미널과 별도):

```bash
cd /c/workspace/aiservice-monitoring/agent
go run ./cmd/collection-server
```

**정상 결과**: 서버 시작 로그가 출력됩니다:

```
{"time":"...","level":"INFO","msg":"starting collection server",...}
{"time":"...","level":"INFO","msg":"listening","addr":":8080"}
```

> 이 터미널도 **닫지 마세요**. 서버가 실행 중이어야 합니다.
> 서버를 중지하려면 `Ctrl + C`를 누르세요.

### 7-2. 헬스체크

Git Bash 터미널을 **또 하나** 엽니다 (세 번째 터미널):

```bash
curl -s http://localhost:8080/health
```

**정상 결과**: JSON 응답이 나타납니다:

```json
{"status":"ok","version":"...","uptime":"..."}
```

> `status`가 `"ok"`이면 서버가 정상 동작하는 것입니다.

### 7-3. 로그인 API 테스트

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**정상 결과**: JWT 토큰이 포함된 응답:

```json
{"token":"eyJhbGciOiJIUzI1NiIs..."}
```

> `token` 필드에 긴 문자열이 있으면 성공입니다.

### 7-4. 인증된 API 테스트

로그인에서 받은 토큰을 사용하여 보호된 API를 호출합니다:

```bash
# 토큰 가져오기 (한 줄로)
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# 토큰이 잘 가져와졌는지 확인
echo "Token: ${TOKEN:0:20}..."

# 에이전트 목록 조회
curl -s http://localhost:8080/api/v1/agents \
  -H "Authorization: Bearer $TOKEN"
```

**정상 결과**: 에이전트 목록 (처음에는 빈 배열):

```json
{"agents":[],"total":0}
```

> Python이 설치되어 있지 않다면, 로그인 응답에서 `token` 값을 직접 복사하여 사용하세요:
> ```bash
> TOKEN="여기에_토큰_값_붙여넣기"
> ```

### 7-5. 주요 API 엔드포인트 테스트

아래 명령어를 하나씩 실행하여 각 API가 응답하는지 확인합니다:

```bash
# 에이전트 목록
curl -s -o /dev/null -w "GET /api/v1/agents → HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/agents

# 수집 작업 목록
curl -s -o /dev/null -w "GET /api/v1/collect/jobs → HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/collect/jobs

# Fleet KPI
curl -s -o /dev/null -w "GET /api/v1/fleet/kpi → HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/fleet/kpi

# 진단 보고서 목록
curl -s -o /dev/null -w "GET /api/v1/diagnostics → HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/diagnostics
```

**결과 읽는 법**:
- `HTTP 200` → 성공
- `HTTP 401` → 인증 실패 (토큰을 다시 확인하세요)
- `HTTP 404` → 경로가 잘못됨
- `HTTP 500` → 서버 내부 오류

### 7-6. 인증 없이 접근 테스트 (보안 확인)

```bash
# 인증 없이 보호된 API 접근 시도
curl -s -o /dev/null -w "인증 없이 → HTTP %{http_code} (401이어야 함)\n" \
  http://localhost:8080/api/v1/agents
```

**기대 결과**: `HTTP 401` (인증이 필요하다는 뜻)

> 만약 `HTTP 200`이 나오면 보안에 문제가 있는 것이므로 기록하세요.

### 7-7. Collection Server 종료

테스트가 끝나면 Collection Server를 실행 중인 터미널에서 `Ctrl + C`를 누릅니다.

### 7-8. 이 단계의 체크리스트

```
[ ] go run ./cmd/collection-server 로 서버를 시작했다
[ ] curl http://localhost:8080/health → "ok" 확인
[ ] 로그인 API → 토큰 발급 확인
[ ] 에이전트 목록 API → 200 응답 확인
[ ] 수집 작업 목록 API → 200 응답 확인
[ ] 인증 없이 접근 → 401 응답 확인
[ ] Ctrl + C 로 서버를 종료했다
```

---

## 8. Step 7: Docker 통합 테스트

### 이 단계의 목적

Docker Compose를 사용하여 전체 시스템(프론트엔드 + 백엔드 + 데이터베이스 + 모니터링 스택)을 한 번에 실행하고, 서비스 간 연동이 올바른지 확인합니다.

> 이 단계는 Docker Desktop이 **반드시 실행 중**이어야 합니다.
> 시스템 트레이에 Docker 고래 아이콘이 있는지 확인하세요.

### 8-1. Docker 리소스 확인

Docker Desktop에서 충분한 리소스를 할당했는지 확인합니다:

1. Docker Desktop을 엽니다
2. 오른쪽 위 톱니바퀴 (Settings) 클릭
3. **Resources** 메뉴 클릭
4. 다음 값 이상을 권장합니다:

| 항목 | 최소 권장값 |
|------|------------|
| CPU | 4 cores |
| Memory | 8 GB |
| Disk | 20 GB |

### 8-2. E2E 스택 실행

```bash
cd /c/workspace/aiservice-monitoring

# E2E 스택 빌드 및 실행 (시간이 걸립니다)
docker compose -f docker-compose.e2e.yaml up -d --build
```

> `--build`는 Docker 이미지를 새로 빌드하라는 의미입니다.
> 처음 실행 시 5-15분이 걸릴 수 있습니다.
> `-d`는 백그라운드 실행(터미널을 차지하지 않음)입니다.

**정상 결과**: 각 서비스가 `Started` 또는 `Running` 상태로 표시됩니다.

### 8-3. 서비스 상태 확인

빌드가 완료되면 30초 정도 기다린 후:

```bash
docker compose -f docker-compose.e2e.yaml ps
```

**정상 결과**: 모든 서비스가 `Up` 또는 `Up (healthy)` 상태:

```
NAME                      STATUS           PORTS
aitop-collection-server   Up (healthy)     0.0.0.0:8080->8080/tcp, 0.0.0.0:50051->50051/tcp
aitop-frontend            Up (healthy)     0.0.0.0:3000->3000/tcp
aitop-postgres-e2e        Up (healthy)     0.0.0.0:5432->5432/tcp
aitop-minio-e2e           Up (healthy)     0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
aitop-otel-collector-e2e  Up (healthy)     0.0.0.0:4317->4317/tcp, ...
aitop-prometheus-e2e      Up (healthy)     0.0.0.0:9090->9090/tcp
aitop-tempo-e2e           Up (healthy)     0.0.0.0:3200->3200/tcp
aitop-loki-e2e            Up (healthy)     0.0.0.0:3100->3100/tcp
aitop-demo-rag            Up (healthy)     0.0.0.0:8000->8000/tcp
aitop-demo-db             Up               0.0.0.0:5433->5432/tcp
aitop-demo-web            Up               0.0.0.0:8081->80/tcp
```

> 일부 서비스가 `starting` 상태이면 30초 더 기다린 후 다시 확인하세요.
> `Exit` 또는 `Restarting` 상태이면 문제가 있는 것입니다.

### 8-4. 개별 헬스체크

각 서비스에 직접 접속하여 확인합니다:

```bash
echo "=== 서비스 헬스체크 ==="

# Collection Server
echo -n "Collection Server: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health
echo ""

# Frontend
echo -n "Frontend: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
echo ""

# Prometheus
echo -n "Prometheus: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/-/ready
echo ""

# Jaeger
echo -n "Jaeger: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:16686/api/services
echo ""

# OTel Collector
echo -n "OTel Collector: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:13133/
echo ""

# Demo RAG Service
echo -n "Demo RAG Service: "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health
echo ""

echo "=== 확인 완료 ==="
```

**모든 항목이 `200`이면 PASS**입니다.

### 8-5. 브라우저에서 확인

| 서비스 | URL | 확인 사항 |
|--------|-----|----------|
| Frontend | http://localhost:3000 | 메인 대시보드 표시 |
| Prometheus | http://localhost:9090 | Prometheus UI 표시 |
| Jaeger UI | http://localhost:16686 | 트레이스 목록 화면 표시 |
| Demo RAG API | http://localhost:8000/docs | Swagger UI 표시 |

### 8-6. 문제가 발생했을 때

특정 서비스가 비정상이면 로그를 확인합니다:

```bash
# 특정 서비스 로그 확인 (예: collection-server)
docker compose -f docker-compose.e2e.yaml logs collection-server --tail=50

# 모든 서비스 로그 (매우 길 수 있음)
docker compose -f docker-compose.e2e.yaml logs --tail=20
```

흔한 문제와 해결:

| 문제 | 해결 |
|------|------|
| 포트 충돌 (bind: address already in use) | 해당 포트를 사용하는 다른 프로그램 종료 |
| 이미지 빌드 실패 | Dockerfile 오류 — 로그에서 원인 확인 |
| DB 연결 실패 | PostgreSQL 컨테이너가 아직 시작되지 않음 — 30초 대기 |
| 메모리 부족 | Docker Desktop 메모리 할당 증가 |

### 8-7. E2E 스택 종료

테스트가 끝나면:

```bash
# 스택 종료 (데이터 보존)
docker compose -f docker-compose.e2e.yaml down

# 스택 종료 + 데이터 완전 삭제 (깨끗한 상태로 복원)
docker compose -f docker-compose.e2e.yaml down -v
```

> `-v` 옵션은 볼륨(데이터)까지 삭제합니다. 다음에 다시 실행하면 깨끗한 상태에서 시작합니다.

### 8-8. 이 단계의 체크리스트

```
[ ] Docker Desktop이 실행 중이다
[ ] docker compose -f docker-compose.e2e.yaml up -d --build 를 실행했다
[ ] docker compose ps 로 모든 서비스가 Up/healthy 상태인지 확인했다
[ ] 개별 헬스체크에서 모든 서비스가 200을 반환했다
[ ] 브라우저에서 Frontend (http://localhost:3000) 접속 확인
[ ] 브라우저에서 Prometheus (http://localhost:9090) 접속 확인
[ ] 비정상 서비스: ________ (없으면 "없음")
[ ] docker compose down -v 로 스택을 종료했다
```

---

## 9. Step 8: 결과 기록

모든 테스트가 끝나면 아래 양식을 복사하여 결과를 기록합니다. 이 기록은 [TEST_GUIDE.md](./TEST_GUIDE.md)의 종합 보고서와 함께 관리합니다.

### 9-1. 최종 체크리스트

```
=============================================================
  AITOP 매뉴얼 테스트 결과
=============================================================

테스트 일자:    ____년 __월 __일
테스트 담당자:  ____________
테스트 환경:
  OS:           Windows 11 / macOS __ / Linux __
  Go:           v____
  Node.js:      v____
  npm:          v____
  Docker:       v____
  브라우저:      Chrome v____ / Firefox v____ / 기타: ____

─────────────────────────────────────────────────────────────

Step 2: Go 백엔드 빌드
  [ ] PASS  [ ] FAIL
  비고: ________________________________________

Step 3: Go 유닛 테스트
  [ ] PASS  [ ] FAIL
  통과: __개 / 실패: __개 / 건너뜀: __개
  실패 테스트: ________________________________________

Step 4: Frontend 빌드
  [ ] PASS  [ ] FAIL
  비고: ________________________________________

  Frontend 유닛 테스트 (Vitest):
  [ ] PASS  [ ] FAIL
  통과: __개 / 실패: __개

Step 5: Frontend 데모 모드
  [ ] PASS  [ ] FAIL
  정상 페이지: __개 / 36개
  실패 페이지: ________________________________________

Step 6: Collection Server API
  [ ] PASS  [ ] FAIL
  헬스체크:    [ ] 200  [ ] 에러
  로그인 API:  [ ] 토큰 발급  [ ] 에러
  에이전트 API: [ ] 200  [ ] 에러
  보안 테스트:  [ ] 401 (정상)  [ ] 200 (보안 문제!)

Step 7: Docker 통합 테스트
  [ ] PASS  [ ] FAIL  [ ] SKIP (Docker 미설치)
  정상 서비스: __개 / 전체 __개
  비정상 서비스: ________________________________________

─────────────────────────────────────────────────────────────

전체 결과: [ ] PASS  [ ] CONDITIONAL PASS  [ ] FAIL
  PASS 항목:  __개
  FAIL 항목:  __개
  SKIP 항목:  __개

특이사항 / 발견된 이슈:
________________________________________________________
________________________________________________________
________________________________________________________

테스트 담당자 서명: ____________ 일자: ____-__-__

=============================================================
```

### 9-2. 결과 판정 기준

| 판정 | 조건 |
|------|------|
| **PASS** | 모든 Step이 PASS |
| **CONDITIONAL PASS** | Step 2-6이 PASS이고 Step 7만 SKIP 또는 일부 FAIL |
| **FAIL** | Step 2-4 중 하나라도 FAIL (빌드/테스트 실패는 치명적) |

### 9-3. FAIL 발생 시 다음 조치

1. **이 문서의 트러블슈팅** 섹션을 먼저 확인합니다
2. 해결되지 않으면 **에러 메시지 전문**을 복사합니다
3. 다음 정보와 함께 프로젝트 관리자에게 공유합니다:
   - 실행한 명령어
   - 에러 메시지 전문
   - 운영체제 및 도구 버전
   - 실행 시점의 git commit hash (`git rev-parse --short HEAD`)

---

## 10. AI 테스트 결과 확인법

> **2026-03-24 추가** — AI 교차검증 체계 도입에 따른 안내

### 10-1. AI 결과서 위치

AI(Claude Code)가 실행한 테스트 결과는 아래 경로에 저장됩니다:

```
test/{테스트유형}_{차수}_{날짜}/결과서_{유형}_{차수}_AI.md
```

예시: `test/단위테스트_1차_2026-03-24/결과서_단위테스트_1차_AI.md`

### 10-2. 수동 검증 절차

1. AI 결과서의 **"1. 실행 요약"** 에서 전체 PASS/FAIL 건수를 확인합니다
2. 같은 폴더의 `결과서_{유형}_{차수}_수동.md`를 열어 빈 칸을 채웁니다
3. 절차서의 **"5. 수동 검증 절차"** Step M-1 ~ M-6을 순서대로 수행합니다
4. 완료 후 `교차검증_{유형}_{차수}.md`의 대조표를 채웁니다

### 10-3. 원본 로그 확인

AI가 실행한 명령어의 원본 출력은 `logs/` 폴더에 있습니다:

```
test/{유형}_{차수}_{날짜}/logs/
├── go-test-output.txt      ← Go 테스트 전체 출력
├── vitest-output.txt        ← Frontend Vitest 전체 출력
└── coverage-summary.txt     ← 커버리지 요약
```

### 10-4. 표준 템플릿

새 테스트 라운드를 시작할 때는 `test/templates/`의 템플릿을 복사하세요.
자세한 폴더 구조는 [TEST_GUIDE.md 섹션 9](./TEST_GUIDE.md#9-test-디렉토리-구조-안내)를 참조하세요.

---

## 10. Step 9: Phase 31-38 신규 기능 테스트

> **추가**: 2026-03-26 — Phase 31~38에서 추가된 신규 기능의 수동 테스트 절차

---

### 9-1. 진단 모드 테스트 (Phase 31: Evidence 수집)

**목적**: `--mode=diagnose` 실행 시 Evidence 데이터 수집 및 감사 로그 생성을 확인합니다.

**사전 조건**: Level 1 (Go 빌드 성공)

**테스트 절차**:

```bash
cd /c/workspace/aiservice-monitoring/agent

# 1. diagnose 모드로 Agent 실행
go run ./cmd/agent --mode=diagnose

# 2. 출력에서 Evidence 수집 항목 확인
# 기대: "evidence: collecting..." 또는 유사 수집 로그

# 3. 수집된 Evidence 파일 확인 (기본 저장 경로)
ls -la /tmp/aitop-evidence/  # Linux/Mac
ls -la /c/Users/$USER/AppData/Local/Temp/aitop-evidence/  # Windows Git Bash
```

**체크리스트**:

```
[ ] go run ./cmd/agent --mode=diagnose 실행 성공 (exit 0)
[ ] Evidence 수집 로그 출력 확인
[ ] 감사 로그(audit.log) 파일 생성 확인
[ ] Evidence JSON 파일에 OS/프로세스/네트워크 정보 포함 확인
```

**단위 테스트 확인**:

```bash
cd /c/workspace/aiservice-monitoring/agent
go test ./internal/collector/evidence/... -v  # equivalence 테스트
go test ./internal/script/... -v              # 스크립트 실행기 테스트
```

**PASS 조건**: diagnose 모드 실행 후 Evidence JSON 생성, 감사 로그 파일 존재

---

### 9-2. Runtime Attach 테스트 (Phase 34)

**목적**: 실행 중인 Java/Python 프로세스에 동적으로 Attach하여 프로파일 데이터를 수집하는지 확인합니다.

**사전 조건**: Java 또는 Python 프로세스가 실행 중이어야 함

**테스트 절차**:

```bash
cd /c/workspace/aiservice-monitoring/agent

# Java 프로세스 PID 확인
jps -l  # 또는 ps aux | grep java

# Runtime Attach 실행 (PID 교체)
go run ./cmd/agent --mode=attach --pid=<PID> --runtime=java

# Python 프로세스 Attach
go run ./cmd/agent --mode=attach --pid=<PID> --runtime=python
```

**Collection Server API에서 프로파일 확인**:

```bash
# 서버 실행 (별도 터미널)
cd /c/workspace/aiservice-monitoring/agent
go run ./cmd/collection-server

# 프로파일 목록 조회
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

curl -s http://localhost:8080/api/v1/profiling \
  -H "Authorization: Bearer $TOKEN"
```

**브라우저에서 확인**:

1. http://localhost:3000/profiling 접속
2. Attach로 수집된 프로파일 목록 표시 확인
3. 프로파일 상세 클릭 → 플레임그래프 렌더링 확인

**체크리스트**:

```
[ ] go test ./internal/attach/... -v PASS
[ ] Java 프로세스 Attach 실행 성공
[ ] Python 프로세스 Attach 실행 성공
[ ] API /api/v1/profiling 에 프로파일 데이터 존재
[ ] /profiling 페이지에 데이터 표시
[ ] /profiling/{profileId} 플레임그래프 렌더링
```

**PASS 조건**: 단위 테스트 PASS + 수집된 프로파일이 API/UI에서 확인됨

---

### 9-3. GPU 멀티벤더 테스트 (Phase 32)

**목적**: NVIDIA/AMD/Intel/Apple/Cloud GPU 메트릭 수집 및 대시보드 표시 확인합니다.

**사전 조건**: 단위 테스트는 mock으로 실행 가능, 실제 GPU 메트릭은 GPU 탑재 환경 필요

**단위 테스트**:

```bash
cd /c/workspace/aiservice-monitoring/agent
go test ./internal/collector/ai/gpu/... -v
```

**브라우저에서 확인**:

1. http://localhost:3000/ai/gpu 접속
2. GPU 카드 렌더링 확인 (데모 데이터)
3. 벤더별 GPU 항목 (NVIDIA/AMD/Intel/Cloud) 표시 확인

**체크리스트**:

```
[ ] go test ./internal/collector/ai/gpu/... -v PASS
[ ] /ai/gpu 페이지 렌더링 성공 (빈 화면 아님)
[ ] GPU 메트릭 카드 (utilizaton, memory, temp) 표시
[ ] 벤더별 섹션 구분 표시
```

**PASS 조건**: 단위 테스트 PASS + /ai/gpu 페이지 정상 렌더링

---

### 9-4. 플러그인 배포 테스트 (Phase 33)

**목적**: 중앙 플러그인 배포 시스템의 설치/업데이트/롤백 흐름을 검증합니다.

**브라우저에서 확인**:

1. http://localhost:3000/marketplace 접속
2. 플러그인 목록 표시 확인
3. 플러그인 설치 버튼 클릭 → 설치 시뮬레이션 확인

**체크리스트**:

```
[ ] /marketplace 페이지 렌더링 성공
[ ] 플러그인 목록 카드 표시 (이름, 버전, 설명)
[ ] 설치/업데이트 버튼 동작 확인
```

> **주의**: Phase 33 단위 테스트 (`internal/plugin`)는 아직 작성되지 않았습니다. 다음 테스트 차수에서 보강 예정.

---

### 9-5. 배치 모니터링 테스트 (Phase 36-38)

**목적**: 배치 프로세스 자동 감지부터 대시보드 표시까지의 전체 흐름을 검증합니다.

**브라우저 페이지 체크 (Phase 38 대시보드)**:

| # | URL | 확인 사항 | 결과 |
|---|-----|----------|------|
| 1 | http://localhost:3000/batch | 배치 대시보드 메인 | [ ] |
| 2 | http://localhost:3000/batch/{name} | 배치 작업 상세 | [ ] |
| 3 | http://localhost:3000/batch/executions/{id} | 실행 이력 상세 | [ ] |
| 4 | http://localhost:3000/batch/alerts | 배치 알림 규칙 | [ ] |
| 5 | http://localhost:3000/batch/xlog | XLog 조회 | [ ] |

**배치 프로세스 자동 감지 수동 테스트 (Phase 36)**:

```bash
# Spring Batch 또는 Python Celery 등 배치 프로세스 실행 후
# Collection Server에서 배치 프로세스 감지 확인

TOKEN=<발급된_JWT_토큰>

# 배치 작업 목록 조회
curl -s http://localhost:8080/api/v1/batch \
  -H "Authorization: Bearer $TOKEN"

# 배치 실행 이력 조회
curl -s http://localhost:8080/api/v1/batch/executions \
  -H "Authorization: Bearer $TOKEN"
```

**배치 런타임 프로파일링 수동 테스트 (Phase 37)**:

```bash
cd /c/workspace/aiservice-monitoring/agent

# 실행 중 배치 프로세스의 PID 확인
ps aux | grep -E 'spring|celery|batch'

# 배치 프로세스에 Attach하여 런타임 프로파일 수집
go run ./cmd/agent --mode=attach --pid=<BATCH_PID> --runtime=java
```

**체크리스트**:

```
[ ] /batch 페이지 렌더링 성공 (빈 화면 아님)
[ ] /batch/{name} 배치 상세 렌더링
[ ] /batch/executions/{id} 실행 이력 렌더링
[ ] /batch/alerts 알림 규칙 목록 렌더링
[ ] /batch/xlog XLog 조회 렌더링
[ ] API /api/v1/batch → 배치 작업 목록 응답 확인
[ ] 배치 프로세스 자동 감지 확인 (실행 환경에서)
[ ] 배치 런타임 프로파일 수집 확인 (실행 환경에서)
```

**PASS 조건**: 5개 페이지 정상 렌더링 + API 응답 200

---

### 9-6. perf/eBPF 플레임그래프 테스트 (Phase 35)

**목적**: perf 또는 eBPF 기반 시스템 프로파일링 및 플레임그래프 생성을 확인합니다.

> **주의**: perf/eBPF는 **Linux 전용**입니다. Windows에서는 빌드는 가능하지만 실행은 Linux 환경이 필요합니다.

**Linux 환경에서 테스트**:

```bash
# Linux에서 perf 권한 확인
sudo sysctl -w kernel.perf_event_paranoid=0

# On-CPU 프로파일링 (30초)
cd /c/workspace/aiservice-monitoring/agent
go run ./cmd/agent --mode=profile --type=oncpu --duration=30s

# Off-CPU 프로파일링
go run ./cmd/agent --mode=profile --type=offcpu --duration=30s

# 플레임그래프 SVG 생성 확인
ls -la /tmp/aitop-profiles/*.svg
```

**브라우저에서 확인**:

```
[ ] /profiling 페이지에 perf 프로파일 목록 표시
[ ] 프로파일 상세 클릭 → 플레임그래프 SVG 렌더링
[ ] On-CPU / Off-CPU / Memory 탭 전환 동작
[ ] 심볼 리졸버 결과 (Java/Python/Go 함수명 표시)
```

**체크리스트**:

```
[ ] go build ./internal/collector/perfebpf/... PASS (Windows에서도 빌드 확인)
[ ] Linux 환경에서 On-CPU 프로파일링 실행 성공 (선택)
[ ] Linux 환경에서 Off-CPU 프로파일링 실행 성공 (선택)
[ ] /profiling 페이지에서 플레임그래프 SVG 렌더링 확인 (선택)
```

**PASS 조건**: Go 빌드 성공 (필수) + Linux 실행 확인 (선택)

---

### 9-7. Step 9 종합 체크리스트

```
=============================================================
  Phase 31-38 신규 기능 테스트 결과
  테스트 일자:    ____년 __월 __일
  테스트 담당자:  ____________
=============================================================

9-1. 진단 모드 (Phase 31)
  [ ] PASS  [ ] FAIL  [ ] SKIP
  비고: ________________________________________

9-2. Runtime Attach (Phase 34)
  [ ] PASS  [ ] FAIL  [ ] SKIP
  단위 테스트: [ ] PASS  [ ] FAIL
  Java Attach: [ ] 성공  [ ] 실패  [ ] SKIP (JVM 없음)
  Python Attach: [ ] 성공  [ ] 실패  [ ] SKIP (Python 없음)

9-3. GPU 멀티벤더 (Phase 32)
  [ ] PASS  [ ] FAIL  [ ] SKIP
  단위 테스트: [ ] PASS  [ ] FAIL
  /ai/gpu 페이지: [ ] 정상  [ ] 오류

9-4. 플러그인 배포 (Phase 33)
  [ ] PASS  [ ] FAIL  [ ] SKIP
  /marketplace 페이지: [ ] 정상  [ ] 오류

9-5. 배치 모니터링 (Phase 36-38)
  /batch:           [ ] 정상  [ ] 오류
  /batch/{name}:    [ ] 정상  [ ] 오류
  /batch/executions/{id}: [ ] 정상  [ ] 오류
  /batch/alerts:    [ ] 정상  [ ] 오류
  /batch/xlog:      [ ] 정상  [ ] 오류
  전체: [ ] PASS  [ ] FAIL

9-6. perf/eBPF (Phase 35)
  [ ] PASS (Linux)  [ ] 빌드만 확인 (Windows)  [ ] SKIP
  비고: ________________________________________

─────────────────────────────────────────────────────────────
전체 결과: [ ] PASS  [ ] CONDITIONAL PASS  [ ] FAIL
=============================================================
```

---

*문서 관련 문의: Aura Kim `<aura.kimjh@gmail.com>`*
*이 문서는 프로젝트 환경이 변경될 때마다 업데이트합니다.*
