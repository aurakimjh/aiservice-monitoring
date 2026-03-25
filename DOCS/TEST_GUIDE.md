# AITOP 통합 테스트 전략 가이드 (TEST_GUIDE.md)

> **프로젝트**: AITOP — AI Service Monitoring Platform
> **대상 독자**: QA 엔지니어, SRE, 개발자, 프로젝트 관리자
> **최종 업데이트**: 2026-03-25 (Phase 1-32 완료 / AGPL-free 인프라 전환 반영)
> **작성자**: Aura Kim `<aura.kimjh@gmail.com>`
>
> **관련 문서**:
> - [LOCAL_SETUP.md](./LOCAL_SETUP.md) — 로컬 개발 환경 구성
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — OTel + Agent 통합 아키텍처
> - [MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md) — 초보자용 매뉴얼 테스트 절차서

---

## 목차

1. [테스트 철학 — "모니터링 도구의 모니터링"](#1-테스트-철학--모니터링-도구의-모니터링)
2. [테스트 분류 체계](#2-테스트-분류-체계)
3. [Part A: 매뉴얼 테스트 절차 (Level 1-9)](#3-part-a-매뉴얼-테스트-절차-level-1-9)
4. [Part B: AI 테스트 절차 (AI-L1 ~ AI-L5)](#4-part-b-ai-테스트-절차-ai-l1--ai-l5)
5. [Part C: 교차검증 프로토콜](#5-part-c-교차검증-프로토콜)
6. [Phase 7'/8'/9' 테스트 로드맵](#6-phase-789-테스트-로드맵)
7. [테스트 보고서 템플릿](#7-테스트-보고서-템플릿)
8. [FAQ — 자주 발생하는 문제와 해결법](#8-faq--자주-발생하는-문제와-해결법)

---

## 1. 테스트 철학 — "모니터링 도구의 모니터링"

### 1-1. 핵심 원칙

AITOP은 AI 서비스를 모니터링하는 도구입니다. 이 도구 자체가 올바르게 동작하지 않으면 고객의 AI 서비스 장애를 감지할 수 없습니다. 따라서 **"모니터링하는 도구가 모니터링되는 것"** 이 테스트의 최우선 목표입니다.

```
일반적인 테스트:  내 코드가 올바른지?
AITOP의 테스트:   모니터링 파이프라인 자체가 올바른지?
```

비유하면 **소방서 정기 훈련**과 같습니다:

| 소방서 훈련              | AITOP 테스트                              |
|--------------------------|------------------------------------------|
| 소방서가 열려 있는가?    | Level 1: 빌드가 성공하는가?              |
| 경보가 울리는가?         | Level 2: 단위 테스트가 통과하는가?       |
| 지도에 표시되는가?       | Level 3: 35개 UI 페이지가 렌더링되는가?  |
| 출동 경로가 맞는가?      | Level 4: API 계약이 일치하는가?          |
| 동시에 여러 화재 처리?   | Level 5-6: Docker 통합 + 부하 테스트     |
| 방화 시설 점검           | Level 7: OWASP 보안 감사                 |
| 실전 배포 가능?          | Level 8-9: K8s 배포 + SLO 검증          |

### 1-2. 테스트 피라미드

```
                    /\
                   /  \         Level 8-9: K8s 배포 + SLO 검증
                  / E2E \       (가장 느리지만 가장 현실적)
                 /________\
                /          \    Level 5-7: Docker 통합 + 부하 + 보안
               / Integration\   (서비스간 연동 검증)
              /______________\
             /                \  Level 3-4: UI 접근성 + API 계약
            /   Component      \ (개별 컴포넌트 검증)
           /____________________\
          /                      \ Level 1-2: 빌드 + 단위 테스트
         /     Unit / Build       \ (가장 빠르고 가장 자주 실행)
        /__________________________\
```

### 1-3. 이중 검증 철학 — 사람 + AI

모든 테스트는 **두 가지 관점**에서 검증합니다:

- **Part A (매뉴얼)**: 사람이 직접 명령어를 실행하고 결과를 눈으로 확인
- **Part B (AI)**: Claude Code/GPT 등 AI 도구를 활용하여 코드 품질/일관성을 자동 검증
- **Part C (교차검증)**: Part A와 Part B의 결과를 비교하여 불일치를 찾아냄

이 이중 검증을 통해 사람이 놓치는 패턴 불일치를 AI가 잡고, AI가 놓치는 실제 동작 문제를 사람이 잡습니다.

---

## 2. 테스트 분류 체계

### 2-1. 전체 매핑

| Part | 분류 | 실행 주체 | 수준 | 소요 시간 |
|------|------|-----------|------|-----------|
| **A** | 매뉴얼 테스트 | 사람 (QA/개발자) | Level 1-9 | 총 2-4시간 |
| **B** | AI 테스트 | Claude Code / GPT | AI-L1 ~ AI-L5 | 총 1-2시간 |
| **C** | 교차검증 | 사람 + AI 협업 | 대조표 작성 | 총 30분 |

### 2-2. Part A — 매뉴얼 테스트 (9 레벨)

| Level | 이름 | 무엇을 검증하는가 | 필수 도구 | 소요 시간 |
|-------|------|-------------------|-----------|-----------|
| 1 | 빌드 검증 | Go/Frontend 코드가 컴파일되는가 | Go 1.25+, Node.js 22+ | 5분 |
| 2 | 단위 테스트 | 개별 함수/컴포넌트가 올바른가 | go test, vitest | 10분 |
| 3 | UI 접근성 검증 | 35개 페이지가 렌더링되는가 | 브라우저 | 20분 |
| 4 | API 계약 테스트 | 프론트엔드/백엔드 API가 일치하는가 | curl | 15분 |
| 5 | Docker 통합 테스트 | 전체 시스템이 연동되는가 | Docker Compose | 20분 |
| 6 | 부하 테스트 | 동시 200 사용자를 처리할 수 있는가 | Locust | 30분 |
| 7 | 보안 감사 | OWASP Top 10 취약점이 없는가 | curl + 수동 | 30분 |
| 8 | K8s 배포 검증 | Helm Chart가 유효한가 | helm CLI | 15분 |
| 9 | SLO 검증 | 성능 임계치를 충족하는가 | Prometheus + 계산 | 15분 |

### 2-3. Part B — AI 테스트 (5 레벨)

| Level | 이름 | 무엇을 검증하는가 | AI 도구 |
|-------|------|-------------------|---------|
| AI-L1 | 코드 품질 리뷰 | 타입 안전성, 데드 코드, 보안 취약점 | Claude Code |
| AI-L2 | 테스트 커버리지 분석 | 테스트가 부족한 영역 식별 및 보강 | Claude Code |
| AI-L3 | API 호환성 검증 | 프론트엔드/백엔드 인터페이스 일관성 | Claude Code |
| AI-L4 | 성능 프로파일링 분석 | 성능 병목 코드 식별 | Claude Code |
| AI-L5 | 문서/코드 일관성 검증 | 문서와 코드 간 불일치 탐지 | Claude Code |

### 2-4. Part C — 교차검증

Part A의 매뉴얼 결과와 Part B의 AI 결과를 대조하여, 양쪽 모두 PASS인 항목만 최종 PASS로 판정합니다. 불일치가 있으면 원인을 조사하고 해결합니다.

---

## 3. Part A: 매뉴얼 테스트 절차 (Level 1-9)

> 각 Level의 상세한 초보자용 절차는 [MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md) 를 참고하세요.
> 이 섹션은 각 Level의 목적, 사전 조건, 핵심 명령어, 예상 결과, 트러블슈팅을 요약합니다.

---

### Level 1: 빌드 검증

**목적**: Go 백엔드와 Next.js 프론트엔드가 오류 없이 컴파일되는지 확인합니다. 빌드가 실패하면 이후 모든 테스트가 불가능합니다.

**사전 조건**:
- Go 1.25 이상 설치 (`go version` 으로 확인)
- Node.js 22 이상 설치 (`node --version` 으로 확인)
- npm 10 이상 설치 (`npm --version` 으로 확인)

**핵심 명령어**:

```bash
# Go 빌드 (agent 디렉토리에서)
cd /c/workspace/aiservice-monitoring/agent
go build ./...

# Frontend 빌드 (frontend 디렉토리에서)
cd /c/workspace/aiservice-monitoring/frontend
npm install
npx next build
```

**예상 결과**:
- Go: 오류 메시지 없이 종료 (exit code 0)
- Frontend: `Route (app)` 테이블이 출력되고 `.next` 디렉토리가 생성됨

**PASS 조건**: 두 빌드 모두 오류 없이 완료

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| `go: module not found` | Go 모듈 캐시 문제 | `cd agent && go mod tidy` |
| `Type error` (Frontend) | TypeScript 타입 불일치 | 에러 메시지의 파일:라인 확인 |
| `npm ERR!` | node_modules 손상 | `rm -rf node_modules && npm install` |
| `next: command not found` | PATH 문제 | `npx next build` 사용 (npx 경유) |

---

### Level 2: 단위 테스트

**목적**: 개별 함수와 컴포넌트가 올바르게 동작하는지 확인합니다.

**사전 조건**: Level 1 통과 (빌드 성공)

**핵심 명령어**:

```bash
# Go 유닛 테스트 (21개 테스트 파일)
cd /c/workspace/aiservice-monitoring/agent
go test ./... -v

# Frontend 유닛 테스트 (Vitest, 5개 테스트 파일)
cd /c/workspace/aiservice-monitoring/frontend
npx vitest run
```

**예상 결과**:
- Go: 각 테스트 패키지마다 `ok` 또는 `PASS` 표시
- Frontend: `Tests passed` 메시지

**PASS 조건**: 모든 테스트가 PASS (FAIL 0개)

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| `FAIL` 표시 | 테스트 로직 오류 | 해당 `_test.go` 파일의 실패 함수 확인 |
| `timeout` | 네트워크 의존 테스트 | `-timeout 60s` 옵션 추가 |
| Frontend `SyntaxError` | jsdom 환경 이슈 | `node_modules` 재설치 |

---

### Level 3: UI 접근성 검증

**목적**: Next.js 프론트엔드의 35개 이상 페이지가 모두 정상 렌더링되는지 확인합니다. 데모 모드(백엔드 없이)에서 동작하는지 검증합니다.

**사전 조건**: Level 1 통과 (Frontend 빌드 성공)

**핵심 명령어**:

```bash
cd /c/workspace/aiservice-monitoring/frontend
npm run dev
# 브라우저에서 http://localhost:3000 접속
```

**35개 페이지 체크리스트**:

| # | 경로 | 페이지 이름 | 확인 포인트 |
|---|------|------------|-------------|
| 1 | `/` | 메인 대시보드 | KPI 카드 렌더링 |
| 2 | `/login` | 로그인 | 폼 표시 (admin@aitop.io / admin) |
| 3 | `/agents` | 에이전트 목록 | 테이블 렌더링 |
| 4 | `/agents/groups/{id}` | 에이전트 그룹 상세 | 그룹 정보 표시 |
| 5 | `/ai` | AI 서비스 목록 | 카드 렌더링 |
| 6 | `/ai/{id}` | AI 서비스 상세 | 상세 정보 표시 |
| 7 | `/ai/costs` | AI 비용 분석 | 차트 렌더링 |
| 8 | `/ai/evaluation` | AI 평가 | 평가 데이터 표시 |
| 9 | `/ai/gpu` | GPU 모니터링 | GPU 카드 렌더링 |
| 10 | `/ai/prompts` | 프롬프트 관리 | 프롬프트 목록 |
| 11 | `/ai/training` | 학습 관리 | 학습 작업 목록 |
| 12 | `/ai/training/{id}` | 학습 상세 | 상세 정보 표시 |
| 13 | `/alerts` | 알림 목록 | 알림 테이블 |
| 14 | `/anomalies` | 이상 탐지 | 이상 징후 목록 |
| 15 | `/business` | 비즈니스 대시보드 | KPI 표시 |
| 16 | `/cloud` | 클라우드 모니터링 | 클라우드 리소스 |
| 17 | `/copilot` | AI 코파일럿 | 채팅 인터페이스 |
| 18 | `/costs` | 비용 관리 | 비용 차트 |
| 19 | `/dashboards` | 대시보드 빌더 | 대시보드 목록 |
| 20 | `/diagnostics` | 진단 보고서 | 보고서 목록 |
| 21 | `/executive` | 경영진 대시보드 | Executive KPI |
| 22 | `/infra` | 인프라 목록 | 서버 테이블 |
| 23 | `/infra/{hostname}` | 인프라 상세 | 서버 상세 정보 |
| 24 | `/infra/cache` | 캐시 모니터링 | Redis/캐시 상태 |
| 25 | `/infra/queues` | 메시지 큐 | 큐 상태 표시 |
| 26 | `/logs` | 로그 뷰어 | 로그 테이블 |
| 27 | `/marketplace` | 마켓플레이스 | 플러그인 목록 |
| 28 | `/metrics` | 메트릭 탐색기 | 메트릭 차트 |
| 29 | `/mobile` | 모바일 뷰 | 반응형 UI |
| 30 | `/notebooks` | 노트북 | 노트북 목록 |
| 31 | `/pipelines` | 파이프라인 | 파이프라인 목록 |
| 32 | `/profiling` | 프로파일링 목록 | 프로파일 목록 |
| 33 | `/profiling/{profileId}` | 프로파일 상세 | 프로파일 데이터 |
| 34 | `/projects` | 프로젝트 관리 | 프로젝트 목록 |
| 35 | `/projects/new` | 프로젝트 생성 | 생성 폼 |
| 36 | `/projects/{id}` | 프로젝트 상세 | 프로젝트 정보 |
| 37 | `/services` | 서비스 목록 | 서비스 테이블 |
| 38 | `/services/{id}` | 서비스 상세 | 서비스 정보 |
| 39 | `/settings` | 설정 | 설정 폼 |
| 40 | `/slo` | SLO 관리 | SLO 목록 |
| 41 | `/tenants` | 테넌트 관리 | 테넌트 목록 |
| 42 | `/topology` | 토폴로지 맵 | 그래프 렌더링 |
| 43 | `/traces` | 트레이스 뷰어 | 트레이스 목록 |
| 44 | `/traces/{traceId}` | 트레이스 상세 | 스팬 트리 |

**PASS 조건**: 모든 페이지가 JavaScript 오류 없이 렌더링됨 (데모 데이터 기반)

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| 빈 페이지 | demo-data.ts 폴백 미작동 | 브라우저 콘솔에서 에러 확인 |
| 500 에러 | 서버 컴포넌트 오류 | `npm run dev` 터미널 로그 확인 |
| 스타일 깨짐 | Tailwind CSS 빌드 실패 | `npm run dev` 재시작 |

---

### Level 4: API 계약 테스트

**목적**: Collection Server의 REST API 엔드포인트가 프론트엔드의 기대와 일치하는지 확인합니다.

**사전 조건**: Go 빌드 성공 (Level 1)

**핵심 명령어**:

```bash
# Collection Server 실행
cd /c/workspace/aiservice-monitoring/agent
go run ./cmd/collection-server

# 별도 터미널에서 API 테스트
# 헬스체크
curl -s http://localhost:8080/health
# 기대: {"status":"ok",...}

# 로그인
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# 기대: {"token":"eyJ..."} (JWT 토큰)

# 에이전트 목록 (JWT 필요)
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

curl -s http://localhost:8080/api/v1/agents \
  -H "Authorization: Bearer $TOKEN"
# 기대: {"agents":[],...} (빈 배열 또는 에이전트 목록)
```

**필수 확인 엔드포인트**:

| 메서드 | 경로 | 기대 상태 코드 |
|--------|------|---------------|
| GET | `/health` | 200 |
| POST | `/api/v1/auth/login` | 200 |
| POST | `/api/v1/auth/refresh` | 200 |
| GET | `/api/v1/agents` | 200 |
| POST | `/api/v1/agents/register` | 200/201 |
| POST | `/api/v1/agents/heartbeat` | 200/204 |
| GET | `/api/v1/collect/jobs` | 200 |
| POST | `/api/v1/collect/trigger` | 200/201 |
| GET | `/api/v1/fleet/kpi` | 200 |
| GET | `/api/v1/diagnostics` | 200 |

**PASS 조건**: 모든 엔드포인트가 기대한 상태 코드를 반환

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| `connection refused` | 서버 미실행 | `go run ./cmd/collection-server` 재실행 |
| `401 Unauthorized` | 토큰 만료/없음 | 로그인 API로 새 토큰 발급 |
| `404 Not Found` | 잘못된 경로 | API 경로 확인 (`/api/v1/` 접두사) |

---

### Level 5: Docker 통합 테스트

**목적**: docker-compose.e2e.yaml을 사용하여 전체 시스템(Frontend + Collection Server + PostgreSQL + StorageBackend + OTel Collector + Prometheus + Jaeger + Demo 서비스)이 올바르게 연동되는지 확인합니다.

**사전 조건**:
- Docker Desktop 실행 중
- 최소 8GB 여유 메모리 (10개 이상 컨테이너 동시 실행)

**핵심 명령어**:

```bash
cd /c/workspace/aiservice-monitoring

# E2E 스택 실행
docker compose -f docker-compose.e2e.yaml up -d --build

# 상태 확인 (모든 서비스 healthy 대기)
docker compose -f docker-compose.e2e.yaml ps

# 개별 헬스체크
curl -s http://localhost:8080/health     # Collection Server
curl -s http://localhost:3000/api/health  # Frontend
curl -s http://localhost:9090/-/ready     # Prometheus
curl -s http://localhost:16686/api/services  # Jaeger

# 종료
docker compose -f docker-compose.e2e.yaml down -v
```

**서비스 체크리스트**:

| 서비스 | 포트 | 헬스체크 URL |
|--------|------|-------------|
| Collection Server | 8080 | http://localhost:8080/health |
| Frontend | 3000 | http://localhost:3000/api/health |
| PostgreSQL | 5432 | `docker exec aitop-postgres-e2e pg_isready` |
| OTel Collector | 4317/4318 | http://localhost:13133/ |
| Prometheus | 9090 | http://localhost:9090/-/ready |
| Jaeger | 16686 | http://localhost:16686/api/services |
| Demo RAG Service | 8000 | http://localhost:8000/health |

**PASS 조건**: 모든 서비스가 `healthy` 또는 `Up` 상태

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| 빌드 실패 | Dockerfile 오류 | `docker compose logs <서비스명>` 확인 |
| 포트 충돌 | 이미 점유된 포트 | `netstat -ano \| findstr :<포트>` 로 확인 |
| 메모리 부족 | 서비스가 너무 많음 | Docker Desktop 메모리 할당 증가 |
| DB 연결 실패 | PostgreSQL 미시작 | healthcheck 로그 확인, depends_on 대기 |

---

### Level 6: 부하 테스트

**목적**: Locust 기반으로 Collection Server에 동시 200명 사용자 부하를 가하여 성능 목표를 충족하는지 검증합니다.

**사전 조건**: Level 5 통과 (Docker E2E 스택 가동 중) 또는 Collection Server 단독 실행

**핵심 명령어**:

```bash
# Locust 설치 (Python 환경)
pip install locust

# Web UI 모드 실행
cd /c/workspace/aiservice-monitoring
locust -f locust/locustfile.py --host http://localhost:8080

# 브라우저에서 http://localhost:8089 접속
# Users: 200, Spawn rate: 10 설정 후 Start

# 헤드리스 모드 (CI/CD용, 10분 실행)
locust -f locust/locustfile.py --config locust/locust.conf --headless --run-time 10m
```

**4가지 부하 시나리오**:

| 시나리오 | 클래스 | 비중 | 설명 |
|---------|--------|------|------|
| 대시보드 조회 | `APIQueryUser` | 60% | 에이전트 목록, 상세, KPI 조회 |
| 에이전트 등록 | `AgentRegUser` | 10% | 신규 에이전트 등록/삭제 |
| Heartbeat Storm | `HeartbeatUser` | 20% | 다수 에이전트 주기적 Heartbeat |
| 수집 트리거 | `CollectTrigUser` | 10% | 수집 작업 트리거 + 진단 보고서 |

**성능 목표 (SLO)**:

| 메트릭 | 목표 | 판정 |
|--------|------|------|
| p50 응답시간 | < 500ms | 필수 |
| p95 응답시간 | < 2000ms | 필수 |
| p99 응답시간 | < 5000ms | 권장 |
| 실패율 | < 1% | 필수 |
| 목표 RPS | ~1000 req/s | 참고 |

**PASS 조건**: p95 < 2000ms 이고 실패율 < 1%

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| 대부분 401 응답 | 인증 실패 | 데모 계정 유효성 확인 |
| p95 > 2000ms | 서버 성능 부족 | DB 쿼리 최적화 필요, Docker 리소스 증가 |
| 연결 거부 다수 | 서버 과부하 | Users 수를 줄여서 재시도 |

---

### Level 7: 보안 감사 (OWASP Top 10)

**목적**: 주요 웹 보안 취약점이 없는지 확인합니다.

**사전 조건**: Level 4 통과 (API 접근 가능)

**검증 항목**:

| # | OWASP 항목 | 검증 방법 | 기대 결과 |
|---|-----------|-----------|-----------|
| 1 | 인젝션 | SQL Injection 패턴 입력 테스트 | 에러 메시지에 SQL 구문 미노출 |
| 2 | 인증 실패 | 잘못된 JWT로 API 호출 | 401 반환 |
| 3 | 민감 데이터 노출 | API 응답에 비밀번호/시크릿 포함 여부 | 민감 정보 미포함 |
| 4 | XXE | XML 페이로드 전송 | 거부 또는 무시 |
| 5 | 접근 제어 | 인증 없이 보호된 API 호출 | 401/403 반환 |
| 6 | 보안 설정 오류 | 불필요한 HTTP 헤더 노출 | Server 헤더 미노출 |
| 7 | XSS | 스크립트 태그 입력 | HTML 이스케이프 처리 |
| 8 | 역직렬화 | 악성 JSON 페이로드 | 400 또는 안전한 에러 |
| 9 | 알려진 취약점 | 의존성 버전 확인 | 알려진 CVE 없음 |
| 10 | 로깅/모니터링 | 실패한 로그인 기록 확인 | 로그에 기록됨 |

**핵심 테스트 명령어 예시**:

```bash
# 인증 없이 보호된 API 접근 시도
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/agents
# 기대: 401

# 잘못된 JWT로 접근 시도
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid-token-here" \
  http://localhost:8080/api/v1/agents
# 기대: 401

# SQL Injection 시도
curl -s http://localhost:8080/api/v1/agents?filter="1'+OR+'1'='1"
# 기대: 400 또는 빈 결과 (SQL 오류 미노출)

# XSS 시도 (에이전트 등록 시)
curl -s -X POST http://localhost:8080/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"agent_id":"<script>alert(1)</script>","hostname":"test"}'
# 기대: 400 (유효성 검증 실패) 또는 이스케이프 처리
```

**PASS 조건**: 10개 항목 모두 기대 결과와 일치

---

### Level 8: Kubernetes 배포 검증 (Helm Dry-Run)

**목적**: Helm Chart가 유효한 Kubernetes YAML을 생성하는지 확인합니다.

**사전 조건**: helm CLI 설치 (`helm version`)

**핵심 명령어**:

```bash
# 서브차트 의존성 다운로드
helm dependency update helm/aiservice-monitoring/

# Chart 문법 검증
helm lint helm/aiservice-monitoring/

# 기본값 렌더링
helm template test-release helm/aiservice-monitoring/ --debug 2>&1 | head -100

# dev 환경 렌더링
helm template test-release helm/aiservice-monitoring/ \
  -f helm/aiservice-monitoring/values-dev.yaml --debug 2>&1 | head -100

# prod 환경 렌더링
helm template test-release helm/aiservice-monitoring/ \
  -f helm/aiservice-monitoring/values-prod.yaml --debug 2>&1 | head -100

# 개별 템플릿 렌더링
helm template test-release helm/aiservice-monitoring/ -s templates/rbac.yaml
helm template test-release helm/aiservice-monitoring/ -s templates/servicemonitor.yaml
helm template test-release helm/aiservice-monitoring/ -s templates/prometheus-rules.yaml
```

**PASS 조건**:

| 항목 | PASS 조건 |
|------|----------|
| `helm lint` | `0 chart(s) failed` |
| 기본 렌더링 | YAML 에러 없음 |
| dev 렌더링 | YAML 에러 없음 |
| prod 렌더링 | YAML 에러 없음 |

**트러블슈팅**:

| 증상 | 원인 | 해결 |
|------|------|------|
| `dependencies not found` | 서브차트 미다운로드 | `helm dependency update` 실행 |
| `template rendering error` | 템플릿 문법 오류 | 에러 메시지의 파일:라인 확인 |
| `values not defined` | values.yaml 키 누락 | values.yaml과 templates 매핑 확인 |

---

### Level 9: SLO 검증

**목적**: 시스템이 정의된 Service Level Objectives를 충족하는지 확인합니다.

**사전 조건**: Level 5 + Level 6 통과 (E2E 스택 + 부하 테스트 데이터 존재)

**SLO 정의**:

| SLO 항목 | 목표 | 측정 방법 |
|---------|------|-----------|
| 가용성 | > 99.5% | `(전체 요청 - 5xx 오류) / 전체 요청 * 100` |
| API P95 레이턴시 | < 2000ms | Prometheus: `histogram_quantile(0.95, ...)` |
| TTFT P95 | < 3000ms | Prometheus 알림 규칙 확인 |
| Heartbeat 처리량 | > 50 에이전트/초 | 부하 테스트 결과에서 산출 |
| 에러율 | < 1% | `error_total / request_total * 100` |

**Prometheus 쿼리로 SLO 확인**:

```bash
# API P95 레이턴시 (E2E 스택 기동 후 부하 테스트 이후)
curl -s 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_server_duration_milliseconds_bucket[5m]))by(le))'

# 에러율
curl -s 'http://localhost:9090/api/v1/query?query=sum(rate(http_server_requests_total{code=~"5.."}[5m]))/sum(rate(http_server_requests_total[5m]))*100'

# Prometheus 알림 규칙 상태 확인
curl -s http://localhost:9090/api/v1/rules | python -m json.tool
```

**PASS 조건**: 5개 SLO 항목 모두 목표 충족

---

## 4. Part B: AI 테스트 절차 (AI-L1 ~ AI-L5)

AI 테스트는 Claude Code 또는 유사한 AI 코드 분석 도구를 활용하여, 사람이 놓칠 수 있는 패턴 불일치/보안 취약점/일관성 문제를 자동으로 탐지합니다.

---

### AI-L1: 코드 품질 리뷰

**목적**: 타입 안전성, 데드 코드, 보안 취약점을 AI가 분석합니다.

**Claude Code 프롬프트 예시**:

```
다음 항목을 분석해 주세요:
1. frontend/src/ 내 TypeScript 코드에서 `any` 타입 사용 현황
2. agent/ 내 Go 코드에서 error 반환값을 무시하는 곳 (unchecked errors)
3. 하드코딩된 시크릿/비밀번호가 소스코드에 포함되어 있는지
4. 사용되지 않는 import/변수/함수 (dead code)
5. SQL Injection에 취약한 문자열 연결 패턴
```

**확인 체크리스트**:

| 항목 | AI가 확인 | 기대 결과 |
|------|----------|-----------|
| `any` 타입 사용 | TypeScript 전체 스캔 | 최소화됨 (0개 권장) |
| unchecked errors | Go 전체 스캔 | `_` 무시 패턴 없음 |
| 하드코딩 시크릿 | 전체 소스 스캔 | 프로덕션 시크릿 없음 |
| 데드 코드 | import/변수/함수 스캔 | 사용되지 않는 코드 없음 |
| SQL Injection | 문자열 연결 패턴 | 파라미터화 쿼리 사용 |

**PASS 조건**: 심각한(critical) 이슈 0개, 경고(warning) 5개 미만

---

### AI-L2: 테스트 커버리지 분석 및 보강

**목적**: 테스트가 부족한 영역을 AI가 식별하고 보강 방안을 제시합니다.

**Claude Code 프롬프트 예시**:

```
AITOP 프로젝트의 테스트 커버리지를 분석해 주세요:

1. agent/ 디렉토리의 Go 테스트 현황:
   - 어떤 패키지에 테스트가 있고, 어떤 패키지에 없는지
   - 테스트되지 않은 주요 함수/메서드 식별

2. frontend/src/ 디렉토리의 Vitest 테스트 현황:
   - 어떤 컴포넌트/훅/유틸에 테스트가 있는지
   - 테스트가 부족한 핵심 영역 식별

3. E2E 테스트 (frontend/e2e/) 현황:
   - 7개 spec 파일이 어떤 시나리오를 커버하는지
   - 누락된 시나리오 식별

4. 커버리지 보강 우선순위 제안 (상/중/하)
```

**현재 테스트 현황 참조**:

| 영역 | 테스트 파일 수 | 위치 |
|------|---------------|------|
| Go 유닛 테스트 | 21개 | `agent/**/*_test.go` |
| Frontend Vitest | 5개 | `frontend/src/**/__tests__/*.test.{ts,tsx}` |
| Playwright E2E | 7개 | `frontend/e2e/*.spec.ts` |

**PASS 조건**: AI가 식별한 누락 영역 목록 + 보강 우선순위 수립

---

### AI-L3: API 호환성 검증

**목적**: 프론트엔드가 호출하는 API 경로/페이로드와 백엔드가 제공하는 API 경로/응답이 정확히 일치하는지 검증합니다.

**Claude Code 프롬프트 예시**:

```
다음을 비교 분석해 주세요:

1. frontend/src/lib/ 내 API 호출 코드에서 사용하는 엔드포인트 경로 목록
2. agent/cmd/collection-server/main.go 내 등록된 HTTP 핸들러 경로 목록
3. 양쪽의 Request/Response 구조체(타입)가 일치하는지
4. 프론트엔드에서 호출하지만 백엔드에 없는 엔드포인트 (잠재적 404)
5. 백엔드에 있지만 프론트엔드에서 사용하지 않는 엔드포인트 (미사용 API)
```

**확인 체크리스트**:

| 항목 | 기대 결과 |
|------|-----------|
| 경로 불일치 | 0개 |
| 요청 필드 불일치 | 0개 |
| 응답 필드 불일치 | 0개 |
| 미사용 백엔드 API | 목록화 (정리 대상) |
| 누락된 백엔드 API | 목록화 (구현 필요) |

**PASS 조건**: 경로/필드 불일치 0개

---

### AI-L4: 성능 프로파일링 분석

**목적**: 코드 레벨에서 성능 병목이 될 수 있는 패턴을 AI가 식별합니다.

**Claude Code 프롬프트 예시**:

```
성능 관점에서 다음을 분석해 주세요:

1. Go 코드에서 N+1 쿼리 패턴이 있는지
2. Go 코드에서 goroutine 누수 가능성 (context 미전파, channel 미닫힘)
3. Go 코드에서 mutex 경합(contention) 위험 지점
4. Frontend에서 불필요한 리렌더링을 유발하는 state 관리 패턴
5. Frontend에서 큰 번들을 유발하는 import 패턴
6. docker-compose.e2e.yaml에서 리소스 제한 미설정 서비스
```

**PASS 조건**: 심각한 성능 이슈 0개, 개선 권장 사항 문서화

---

### AI-L5: 문서/코드 일관성 검증

**목적**: DOCS/ 디렉토리의 문서와 실제 코드가 일치하는지 검증합니다.

**Claude Code 프롬프트 예시**:

```
DOCS/ 디렉토리의 문서와 실제 코드를 비교해 주세요:

1. ARCHITECTURE.md에 기술된 컴포넌트가 실제 코드에 존재하는지
2. AGENT_DESIGN.md에 기술된 API 스펙이 구현과 일치하는지
3. LOCAL_SETUP.md의 설치/실행 명령어가 현재 코드 구조와 맞는지
4. TEST_GUIDE.md의 명령어/경로가 실제 파일 시스템과 맞는지
5. docker-compose 파일명과 서비스명이 문서 기술과 일치하는지
```

**PASS 조건**: 불일치 0개 (또는 모든 불일치가 문서화되고 수정 계획 있음)

---

## 5. Part C: 교차검증 프로토콜

### 5-1. 교차검증 대조표

매뉴얼 테스트(Part A)와 AI 테스트(Part B)의 결과를 아래 표에 기록하여 비교합니다.

```
교차검증 대조표
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
검증 항목                 매뉴얼(A)  AI(B)    최종
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
빌드 성공 여부             [ ]       [ ]      [ ]
단위 테스트 통과           [ ]       [ ]      [ ]
UI 페이지 렌더링           [ ]       N/A      [ ]
API 계약 일치              [ ]       [ ]      [ ]
Docker 통합 정상           [ ]       N/A      [ ]
부하 테스트 SLO 충족       [ ]       [ ]      [ ]
보안 취약점 없음           [ ]       [ ]      [ ]
Helm Chart 유효            [ ]       N/A      [ ]
SLO 임계치 충족            [ ]       [ ]      [ ]
코드 품질 양호             N/A       [ ]      [ ]
테스트 커버리지 적정       N/A       [ ]      [ ]
문서/코드 일관성           N/A       [ ]      [ ]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5-2. 불일치 시 해결 절차

1. **불일치 발견**: 매뉴얼 결과와 AI 결과가 다른 항목 식별
2. **원인 분류**:
   - **매뉴얼 오판**: 사람이 절차를 잘못 따랐거나 결과를 잘못 판독
   - **AI 오판**: AI가 잘못된 분석을 수행 (false positive/negative)
   - **실제 이슈**: 양쪽 중 하나가 실제 문제를 발견
3. **조치**:
   - 매뉴얼 오판 → 절차서 보완
   - AI 오판 → 프롬프트 개선
   - 실제 이슈 → 버그 등록 및 수정
4. **재검증**: 수정 후 해당 항목만 재테스트

### 5-3. 최종 서명/승인 프로세스

```
최종 테스트 서명
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
테스트 일자: ____-__-__
테스트 버전: Phase ____ (commit: ________)
환경: Docker Desktop v____ / Go v____ / Node.js v____

Part A (매뉴얼) 수행자:  ____________  서명: ____
Part B (AI) 수행자:      ____________  서명: ____
Part C (교차검증) 승인자: ____________ 서명: ____

최종 판정: [ ] PASS  [ ] CONDITIONAL PASS  [ ] FAIL
미해결 이슈 수: ____
다음 조치: _________________________________________
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 6. Phase 7'/8'/9' 테스트 로드맵

> **최종 업데이트**: 2026-03-24 — Phase 17 테스트 결과 반영, 완료/미완료 현행화
> **테스트 결과 기록**: `test/` 디렉토리 ([섹션 9 참조](#9-test-디렉토리-구조-안내))

### 6-1. Phase 7' — E2E 통합 검증

**목표**: 전체 시스템이 end-to-end로 올바르게 연동되는지 검증

#### 완료 현황

| 단계 | 작업 | 상태 | 비고 |
|------|------|:----:|------|
| 7'-1 | Docker 11컨테이너 기동 + 헬스체크 | **완료** | Phase 17에서 전체 PASS (2026-03-23) |
| 7'-2 | 파이프라인 검증 (21개 체크포인트) | **완료** | 21/21 PASS — JWT, Heartbeat, Fleet, MinIO, Prometheus |
| 7'-3 | Playwright E2E 5개 시나리오 | **완료** | 9/9 PASS — SRE, AI, Consultant, Agent, Navigation |
| 7'-4 | a11y + Visual Regression | **완료** | a11y 13/14 PASS (Agents 페이지 1건 FAIL), Visual 15/15 기준선 생성 |

#### To-Do

| # | 작업 | 우선순위 | 상태 |
|---|------|:-------:|------|
| ~~1~~ | ~~UI 전용 API 12개 엔드포인트 구현~~ | ~~High~~ | **완료** (2026-03-24) |
| ~~2~~ | ~~Playwright a11y 테스트 실행~~ | ~~Medium~~ | **완료** — 13/14 PASS, Agents 페이지 button-name + color-contrast 수정 필요 |
| ~~3~~ | ~~Playwright visual-regression 기준 스냅샷 생성~~ | ~~Medium~~ | **완료** — 15개 기준 스냅샷 생성 |
| 4 | **Locust 부하 테스트** (200 users, 10분) | Medium | SKIP — `pip install locust` 후 재실행 |
| 5 | **보안 감사 완성** (A02~A10) | Medium | 부분 실행 — 스크립트 의존성 보완 필요 |
| 6 | **트레이스 연속성 완성** (Layer 2~5) | Medium | Layer 1 PASS, 나머지 Jaeger 조회 대기 |
| 7 | **Agents 페이지 a11y 수정** (button-name + color-contrast) | High | 미수정 — UI 컴포넌트 수정 필요 |
| 8 | **E2E spec locator 수정** (03, 04 시나리오) | Medium | 미수정 — 실제 UI 텍스트에 맞게 업데이트 |

**Playwright E2E 테스트 실행**:

```bash
cd /c/workspace/aiservice-monitoring/frontend

# 전체 E2E 테스트
npx playwright test

# 개별 시나리오 실행
npx playwright test e2e/01-sre-incident-response.spec.ts
npx playwright test e2e/02-ai-engineer-tuning.spec.ts
npx playwright test e2e/03-consultant-inspection.spec.ts
npx playwright test e2e/04-agent-management.spec.ts
npx playwright test e2e/05-navigation-and-i18n.spec.ts

# Visual Regression 테스트
npx playwright test e2e/visual-regression.spec.ts

# 접근성 테스트
npx playwright test e2e/a11y.spec.ts

# 리포트 확인
npx playwright show-report ../reports/playwright
```

**완료 조건**: 모든 E2E 테스트 통과 + UI API FAIL 0건 + 부하 테스트 SLO 충족

---

### 6-2. Phase 8' — Kubernetes 배포 검증

**목표**: Helm Chart로 K8s 클러스터에 배포 가능한 상태인지 검증

#### 완료 현황

| 단계 | 작업 | 상태 | 비고 |
|------|------|:----:|------|
| 8'-1 | Helm Chart 구조 생성 | **완료** | `helm/aiservice-monitoring/` (Chart.yaml, values, templates) |
| 8'-2 | values-dev.yaml / values-prod.yaml | **완료** | dev/prod 분리 완료 |
| 8'-3 | CI lint workflow | **완료** | `.github/workflows/lint.yaml`에 helm lint 포함 |
| 8'-4 | Helm dry-run 검증 | **미실행** | 실제 template 렌더링 테스트 미수행 |
| 8'-5 | K8s 실 배포 테스트 | **미실행** | 클러스터 환경 필요 |

#### To-Do

| # | 작업 | 우선순위 | 비고 |
|---|------|:-------:|------|
| 1 | **`helm lint helm/aiservice-monitoring/`** | High | 기본 검증 |
| 2 | **`helm template` dry-run** (기본/dev/prod 3종) | High | 렌더링 오류 확인 |
| 3 | **RBAC / ServiceMonitor / PrometheusRule 검증** | Medium | 개별 템플릿 확인 |
| 4 | **AI-L4**: Helm 보안 설정 분석 (리소스 제한, securityContext) | Medium | AI 코드 분석 |
| 5 | **AI-L4**: values.yaml dev↔prod 차이 분석 | Low | 설정 일관성 |
| 6 | **(선택) 실제 K8s 클러스터 배포** | Low | minikube/kind 환경 |

**교차검증**:
- Helm dry-run으로 발견한 문제와 AI 분석 결과 대조
- AI가 지적한 보안 설정 미비를 매뉴얼로 재확인

**완료 조건**: `helm lint` 통과 + 3개 환경 렌더링 성공 + 보안 이슈 0개

---

### 6-3. Phase 9' — SLO 튜닝

**목표**: 정의된 SLO를 충족하도록 시스템을 튜닝하고, 지속적으로 모니터링할 수 있는 체계를 구축

#### 완료 현황

| 단계 | 작업 | 상태 | 비고 |
|------|------|:----:|------|
| 9'-1 | Prometheus 알림 규칙 9개 정의 | **완료** | CI에서 `promtool` 검증 통과 |
| 9'-2 | SLO 페이지 (`/slo`) UI | **완료** | Phase 14에서 구현 |
| 9'-3 | Sampling 정책 (Tail-based, 10종) | **완료** | Phase 6에서 구현 |
| 9'-4 | SLO 실측치 측정 | **미실행** | 부하 테스트 후 측정 필요 |
| 9'-5 | 알림 규칙 ↔ SLO 정의 일관성 검증 | **미실행** | |

#### To-Do

| # | 작업 | 우선순위 | 비고 |
|---|------|:-------:|------|
| 1 | **알림 규칙 스크립트 실행** (`scripts/e2e/test-alerts.sh` 또는 CI) | High | 9개 규칙 검증 |
| 2 | **Locust 부하 테스트 후 SLO 실측** | High | Phase 7' 부하 테스트와 연계 |
| 3 | **SLO 대시보드에서 수치 확인** (`/slo` 페이지) | Medium | Prometheus 연동 확인 |
| 4 | **Sampling 비용 시뮬레이션** (100/1000 RPS) | Medium | `reports/sampling-*.csv` 참조 |
| 5 | **AI-L5**: 문서 SLO 정의 ↔ 코드 임계치 대조 | Medium | 불일치 여부 |
| 6 | **AI-L5**: 알림 규칙 ↔ SLO 정의 일관성 검증 | Medium | |
| 7 | **SLO 미달 항목 원인 분석 + 튜닝** | Low | 실측 후 수행 |

**교차검증**:
- 매뉴얼로 측정한 SLO 수치와 AI가 분석한 코드 성능 예측 대조
- 알림 규칙 임계치가 문서/코드에서 일관되는지 양방향 확인

**SLO 대시보드 (프론트엔드 `/slo` 페이지)**:

| SLO | 목표 | 현재치 | 상태 |
|-----|------|--------|------|
| 가용성 | > 99.5% | (부하 테스트 후 측정) | [ ] |
| API P95 레이턴시 | < 2000ms | (부하 테스트 후 측정) | [ ] |
| TTFT P95 | < 3000ms | (부하 테스트 후 측정) | [ ] |
| Heartbeat 처리량 | > 50/초 | (부하 테스트 후 측정) | [ ] |
| 에러율 | < 1% | (부하 테스트 후 측정) | [ ] |

**완료 조건**: 5개 SLO 모두 목표 충족 + 알림 규칙 검증 PASS + 문서/코드 일관성 확인

---

## 7. 테스트 보고서 템플릿

### 7-1. 종합 보고서

```
=============================================================
  AITOP 테스트 보고서
  일자: ____-__-__
  버전: Phase ____ (commit: ________)
  환경: Windows 11 / Docker Desktop v____ / Go v____ / Node.js v____
=============================================================

Part A: 매뉴얼 테스트 결과
─────────────────────────────────────────────────────────────
Level 1 — 빌드 검증:         [ ] PASS  [ ] FAIL
  Go build:                  [ ] 성공  [ ] 실패 → 원인: ________
  Frontend build:            [ ] 성공  [ ] 실패 → 원인: ________

Level 2 — 단위 테스트:       [ ] PASS  [ ] FAIL
  Go test:                   __개 PASS / __개 FAIL
  Frontend vitest:           __개 PASS / __개 FAIL

Level 3 — UI 접근성:         [ ] PASS  [ ] FAIL
  렌더링 성공 페이지:        __개 / 44개
  실패 페이지 목록:          ________

Level 4 — API 계약:          [ ] PASS  [ ] FAIL
  확인 엔드포인트:           __개 / 10개
  실패 엔드포인트:           ________

Level 5 — Docker 통합:       [ ] PASS  [ ] FAIL
  정상 서비스:               __개 / 9개
  비정상 서비스:             ________

Level 6 — 부하 테스트:       [ ] PASS  [ ] FAIL
  p95 응답시간:              ____ms (목표 < 2000ms)
  실패율:                    ____% (목표 < 1%)

Level 7 — 보안 감사:         [ ] PASS  [ ] FAIL
  OWASP 항목:               __개 PASS / __개 FAIL

Level 8 — K8s 배포:          [ ] PASS  [ ] FAIL
  helm lint:                 [ ] PASS  [ ] FAIL
  렌더링 환경:               __개 / 3개 성공

Level 9 — SLO 검증:          [ ] PASS  [ ] FAIL
  충족 SLO:                  __개 / 5개
  미달 SLO:                  ________

─────────────────────────────────────────────────────────────

Part B: AI 테스트 결과
─────────────────────────────────────────────────────────────
AI-L1 — 코드 품질:           [ ] PASS  [ ] FAIL
  Critical 이슈:             __개
  Warning 이슈:              __개

AI-L2 — 테스트 커버리지:     [ ] PASS  [ ] FAIL
  Go 커버리지 미달 패키지:   __개
  Frontend 미달 컴포넌트:    __개

AI-L3 — API 호환성:          [ ] PASS  [ ] FAIL
  경로 불일치:               __개
  타입 불일치:               __개

AI-L4 — 성능 분석:           [ ] PASS  [ ] FAIL
  성능 병목:                 __개
  개선 권장:                 __개

AI-L5 — 문서/코드 일관성:    [ ] PASS  [ ] FAIL
  불일치 항목:               __개

─────────────────────────────────────────────────────────────

Part C: 교차검증 결과
─────────────────────────────────────────────────────────────
일치 항목:                   __개
불일치 항목:                 __개
해결 완료:                   __개
미해결:                      __개

─────────────────────────────────────────────────────────────

최종 판정: [ ] PASS  [ ] CONDITIONAL PASS  [ ] FAIL
승인자: ____________ 서명: ____________ 일자: ____-__-__
비고: ______________________________________________

=============================================================
```

### 7-2. Level별 상세 보고서 (필요시 개별 작성)

각 Level에서 발견한 이슈는 다음 형식으로 기록합니다:

```
이슈 보고서
─────────────────────────────────
이슈 ID:     AITOP-TEST-____
Level:       Level __
심각도:      [ ] Critical  [ ] Major  [ ] Minor
제목:        ________________________________________
설명:        ________________________________________
재현 절차:   ________________________________________
기대 결과:   ________________________________________
실제 결과:   ________________________________________
스크린샷/로그: ________________________________________
해결 방안:   ________________________________________
상태:        [ ] Open  [ ] In Progress  [ ] Resolved
담당자:      ________________________________________
─────────────────────────────────
```

---

## 8. FAQ — 자주 발생하는 문제와 해결법

### Q1: `docker compose` 명령어를 찾을 수 없습니다

Docker Desktop 버전을 확인하세요. v2 이상이면 `docker compose` (공백), 구버전은 `docker-compose` (하이픈)입니다:
```bash
docker compose version   # v2 (권장)
docker-compose --version  # v1 (구버전)
```
Docker Desktop을 최신 버전으로 업데이트하세요.

### Q2: Go 빌드 시 `module not found` 오류

```bash
cd /c/workspace/aiservice-monitoring/agent
go mod tidy
go build ./...
```
인터넷 연결이 필요할 수 있습니다. 프록시 환경이라면 `GOPROXY` 환경 변수를 설정하세요.

### Q3: Frontend 빌드 시 TypeScript 오류

```bash
cd /c/workspace/aiservice-monitoring/frontend
rm -rf node_modules .next
npm install
npx next build
```
Next.js 16은 이전 버전과 API/규칙이 다를 수 있습니다. `frontend/AGENTS.md` 에 명시된 대로 `node_modules/next/dist/docs/` 내 관련 가이드를 참고하세요.

### Q4: Docker E2E 스택에서 특정 서비스가 계속 재시작됩니다

```bash
# 해당 서비스 로그 확인
docker compose -f docker-compose.e2e.yaml logs <서비스명> --tail=100

# 헬스체크 상태 확인
docker inspect aitop-<컨테이너명> --format='{{json .State.Health}}'

# 전체 재시작 (데이터 초기화)
docker compose -f docker-compose.e2e.yaml down -v
docker compose -f docker-compose.e2e.yaml up -d --build
```

### Q5: Locust 부하 테스트에서 대부분 401 응답

Collection Server의 데모 인증 계정이 활성화되어 있는지 확인하세요. 기본 자격증명은 `admin / admin123` 입니다. JWT 토큰 만료 시 Locust가 자동으로 재로그인합니다. Collection Server 로그에서 인증 관련 오류를 확인하세요.

### Q6: Helm template 실행 시 서브차트 의존성 오류

```bash
helm dependency update helm/aiservice-monitoring/
helm template test-release helm/aiservice-monitoring/
```
서브차트 다운로드에는 인터넷 연결이 필요합니다.

### Q7: Windows에서 셸 스크립트가 실행되지 않습니다

모든 명령어는 **Git Bash** 기준입니다. PowerShell이나 CMD에서는 경로 문제가 발생할 수 있습니다:
```bash
# Git Bash에서
bash scripts/test-alerts.sh

# 또는 WSL2에서
wsl bash scripts/test-alerts.sh
```

### Q8: 프론트엔드 데모 모드에서 데이터가 비어 있습니다

데모 모드는 `frontend/src/lib/demo-data.ts` 파일의 정적 데이터를 사용합니다. 백엔드 없이도 기본 렌더링은 되어야 합니다. 데이터가 전혀 보이지 않으면 브라우저 개발자 도구(F12) 콘솔에서 JavaScript 오류를 확인하세요.

### Q9: Claude Code로 AI 테스트를 수행하려면 어떻게 해야 하나요?

1. Claude Code CLI를 프로젝트 루트에서 실행합니다
2. Part B 섹션의 프롬프트 예시를 그대로 입력합니다
3. AI의 분석 결과를 테스트 보고서 템플릿에 기록합니다
4. 발견한 이슈는 이슈 보고서 형식으로 상세히 기록합니다

### Q10: 교차검증에서 불일치가 발생하면 어떻게 하나요?

1. 먼저 불일치의 원인을 파악합니다 (매뉴얼 오판인지, AI 오판인지, 실제 이슈인지)
2. 실제 이슈라면 버그로 등록합니다
3. 오판이라면 절차서 또는 프롬프트를 개선합니다
4. 수정 후 해당 항목만 재테스트합니다

---

## 9. test/ 디렉토리 구조 안내

> **2026-03-24 추가** — 체계적 테스트 관리를 위한 표준 디렉토리 구조

모든 테스트 라운드의 절차서, 결과서, 교차검증, 변경이력은 프로젝트 루트의 `test/` 디렉토리에서 관리합니다.

### 9.1 폴더 네이밍 규칙

```
test/{테스트유형}_{차수}_{YYYY-MM-DD}/
```

- **테스트유형**: `단위테스트` / `통합테스트` / `E2E테스트`
- **차수**: `1차`, `2차`, `3차`, ...
- **날짜**: 실행 시작일 (ISO 형식)

### 9.2 라운드 내부 파일 구성

| 파일 | 설명 |
|------|------|
| `절차서_{유형}_{N}차.md` | AI + 수동 실행 절차 |
| `결과서_{유형}_{N}차_AI.md` | Claude Code AI 실행 결과 |
| `결과서_{유형}_{N}차_수동.md` | 사용자 수동 검증 결과 |
| `교차검증_{유형}_{N}차.md` | AI vs 수동 결과 대조표 |
| `변경이력_{유형}_{N}차.md` | 테스트 중 발생한 코드/UI 변경 |
| `logs/` | 원본 명령어 출력 (txt, json) |

### 9.3 표준 템플릿

새 라운드 생성 시 `test/templates/`에서 템플릿을 복사하여 사용합니다:

- `test/templates/절차서_TEMPLATE.md`
- `test/templates/결과서_TEMPLATE.md`
- `test/templates/변경이력_TEMPLATE.md`

### 9.4 교차검증 프로세스

```
1. AI 테스트 실행 → 결과서_AI.md 작성
2. 사용자 수동 검증 → 결과서_수동.md 작성
3. 양쪽 결과 대조 → 교차검증.md 작성
4. 불일치 항목 → 원인 조사 후 최종 판정
5. 코드 수정 발생 시 → 변경이력.md에 커밋 해시와 함께 기록
```

### 9.5 참고

- `agent/test/` — Go 통합/계약 테스트 소스 코드 (변경하지 마세요)
- `reports/` — 도구 자동 생성 리포트 (Playwright HTML, Coverage HTML)
- `test/` — 사람이 읽는 구조화된 테스트 문서

---

*문서 관련 문의: Aura Kim `<aura.kimjh@gmail.com>`*
*이 문서는 프로젝트 환경이 변경될 때마다 업데이트합니다.*
