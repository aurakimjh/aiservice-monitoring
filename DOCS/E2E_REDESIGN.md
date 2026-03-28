# Phase 7': E2E 통합 검증 재설계

> **버전**: v1.3.0
> **날짜**: 2026-03-28 (v1.2 엔티티 모델 + v1.3 AI Observability 시나리오 추가)
> **대상**: AITOP AI Service Monitoring Platform

---

## 1. 재설계 배경

### 1.1 기존 Phase 7 (Grafana 기반) 한계

| 항목 | 기존 Phase 7 | 현황 |
|------|-------------|------|
| UI | Grafana 대시보드 | **폐기** — Next.js로 교체 |
| 수집 경로 | OTel Collector → Prometheus | **확장** — Agent + Collection Server 추가 |
| 인증 | 없음 | **신규** — JWT RBAC 4역할 |
| 데이터 영속성 | 없음 | **신규** — PostgreSQL + StorageBackend (S3/Local) |
| 실시간 갱신 | Polling | **신규** — SSE EventBus |

### 1.2 새 아키텍처 (Phase 17~18 완료 기준)

```
┌─────────────────────────────────────────────────────────────────┐
│  모니터링 대상 서버                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ RAG Service  │  │  DB Server  │  │  Web Server │            │
│  │  (FastAPI)   │  │ (Postgres)  │  │   (Nginx)   │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                │                 │                    │
│  ┌──────▼──────────────────────────────────▼──────┐            │
│  │              AITOP Agent (Go binary)            │            │
│  │  IT Collector + AI Collector + Fleet Manager    │            │
│  └──────────────────────┬──────────────────────────┘            │
└─────────────────────────│────────────────────────────────────────┘
                          │ Heartbeat + Collect (HTTP)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  AITOP 플랫폼                                                   │
│                                                                  │
│  ┌───────────────────┐    ┌─────────────────────────────────┐  │
│  │  Collection Server │    │  OTel Observability Stack       │  │
│  │  (Go — Port 8080) │    │  OTel Collector → Prometheus    │  │
│  │  JWT Auth + RBAC  │◄──►│  Jaeger (Traces) + stdout/file  │  │
│  │  PostgreSQL+Storage│    │  Tail Sampling (81% 절감)        │  │
│  └───────────────────┘    └─────────────────────────────────┘  │
│             │                            │                       │
│             │ SSE EventBus               │ PromQL / Jaeger API   │
│             ▼                            ▼                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │          Next.js Frontend (Port 3000)                      │  │
│  │  26개 화면: 인프라 뷰 + AI 서비스 뷰 + 에이전트 관리 뷰   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 7' 검증 범위

### 7'-1: 로컬 Docker 통합 테스트

**목표**: 전체 스택 기동 → 헬스체크 → 텔레메트리 수집 확인

```
검증 체크리스트:
□ 7개 서비스 기동 확인 (frontend, collection-server, postgres,
                         otel-collector, prometheus, jaeger, test-api-server)
□ 각 서비스 healthcheck 통과
□ Agent 등록 → Fleet에 표시
□ Heartbeat 5회 수신
□ Collect 트리거 → StorageBackend(로컬/S3)에 JSON 저장
□ OTel Collector → Prometheus scrape 확인
□ Jaeger trace 수신 확인
□ stdout/file 로그 exporter 동작 확인
□ Frontend → Collection Server API 연결
□ SSE EventBus 이벤트 수신
```

**Docker Compose**: `docker-compose.e2e.yaml`
**검증 스크립트**: `scripts/e2e/healthcheck.sh`

### 7'-2: 부하 테스트 + 샘플링

**목표**: 실제 부하 상황에서 Tail Sampling 성능 검증

```
Locust 4개 시나리오:
1. API Query Flow     — 대시보드 조회 (60% 비중)
2. Agent Registration — 에이전트 등록 (10% 비중)
3. Heartbeat Storm    — 다수 에이전트 Heartbeat (20% 비중)
4. Collection Trigger — 수집 작업 트리거 (10% 비중)

목표 지표:
- 200 concurrent users @ 1K RPS
- p95 응답시간 < 2000ms (API Query)
- Tail Sampling 보존율 > 19% (에러/고레이턴시 트레이스)
- 정상 트레이스 샘플링률 < 5% (비용 절감)
- 비용 절감 효과 ~81% 달성 목표
```

**도구**: Locust (Python) — `locust/locustfile.py`
**설정**: `locust/locust.conf`

### 7'-3: Trace 연속성 검증

**목표**: 5레이어 Trace ID 연속성 + Baggage 전달 확인

```
검증 레이어:
Layer 1: Frontend (Next.js) → Collection Server API
Layer 2: Collection Server → OTel Collector (OTLP)
Layer 3: OTel Collector → Jaeger (Trace Storage)
Layer 4: Agent → Collection Server (Heartbeat/Collect)
Layer 5: Demo RAG Service → OTel Collector (OTLP)

검증 항목:
□ W3C TraceContext 헤더 전파 (traceparent/tracestate)
□ Baggage 항목 전달 (user.id, session.id, service.tier)
□ Metric↔Log 상관관계 (exemplar traceId 매핑)
□ 동일 traceId로 Jaeger 조회 성공
□ Span 계층 구조 완전성 (parent/child 관계)
```

**검증 스크립트**: `scripts/e2e/trace-continuity.sh`

### 7'-4: 보안 감사

**목표**: OWASP Top 10 + PII 마스킹 + mTLS 검증

```
OWASP Top 10 체크:
A01 Broken Access Control    — JWT 만료/위조/역할 초과 검증
A02 Cryptographic Failures   — HTTPS/TLS 1.2+, 취약 알고리즘 금지
A03 Injection                — SQL/Command Injection 방어 확인
A04 Insecure Design          — 인증 없는 민감 엔드포인트 차단
A05 Security Misconfiguration — 불필요한 포트/서비스 노출 확인
A06 Vulnerable Components    — Go/Node 의존성 CVE 스캔
A07 Auth Failures            — Brute Force 방어 (rate limit)
A08 Integrity Failures       — 업로드 파일 검증
A09 Logging Failures         — 감사 로그 완전성
A10 SSRF                     — 외부 URL 요청 차단

PII 마스킹:
□ 로그에 API 키/비밀번호 미노출
□ JWT payload PII 최소화 (sub/role만 포함)
□ StorageBackend 저장 데이터 PII 필드 마스킹
□ Prometheus 레이블에 개인정보 미포함

mTLS 검증:
□ Collection Server ↔ Agent 간 TLS 통신
□ 인증서 만료/자서명 인증서 거부
□ OTel Collector TLS 엔드포인트 (4317 gRPC)
```

**검증 스크립트**: `scripts/e2e/security-audit.sh`

---

## 3. 실행 환경

### 3.1 사전 요건

| 항목 | 버전 | 비고 |
|------|------|------|
| Docker Engine | 24.x+ | Linux 컨테이너 지원 |
| Docker Compose | v2.x+ | Compose V2 문법 사용 |
| curl | 7.x+ | HTTP 헬스체크 |
| jq | 1.6+ | JSON 파싱 |
| Python | 3.10+ | Locust 실행 |
| Locust | 2.x+ | 부하 테스트 |
| openssl | 1.1+ | 인증서 검증 |

### 3.2 포트 매핑

| 서비스 | 포트 | 용도 |
|--------|------|------|
| Frontend (Next.js) | 3000 | UI 접근 |
| Collection Server | 8080 | REST API + Fleet |
| PostgreSQL | 5432 | 에이전트/진단 DB |
| OTel Collector gRPC | 4317 | OTLP 수신 |
| OTel Collector HTTP | 4318 | OTLP HTTP 수신 |
| OTel Collector Health | 13133 | 헬스체크 |
| Prometheus | 9090 | 메트릭 조회 |
| Jaeger UI | 16686 | Trace 조회 (Apache 2.0) |
| Demo RAG Service | 8000 | 테스트 대상 AI 서비스 |

---

## 4. 전체 실행 순서

```bash
# 1단계: E2E 스택 기동
make e2e-up

# 2단계: 헬스체크 (30~60초 대기 후)
make e2e-health

# 3단계: Trace 연속성 검증
make e2e-trace

# 4단계: 부하 테스트 (10분)
make e2e-load

# 5단계: 보안 감사
make e2e-security

# 전체 실행 (순서 자동 제어)
make e2e-all

# 정리
make e2e-down
```

---

## 5. 성공 기준

| 검증 항목 | 성공 기준 | 측정 방법 |
|-----------|----------|----------|
| 서비스 기동 | 7개 서비스 모두 healthy | docker compose ps |
| 헬스체크 | 전체 PASS | healthcheck.sh 종료코드 0 |
| Trace 연속성 | 5레이어 traceId 동일 | trace-continuity.sh |
| Tail Sampling 보존율 | 에러 트레이스 > 80% | Jaeger 쿼리 |
| 비용 절감 | 정상 트레이스 샘플링 < 5% | Prometheus 메트릭 |
| p95 응답시간 | < 2000ms | Locust 리포트 |
| OWASP 항목 | Critical 0건 | security-audit.sh |
| PII 마스킹 | 민감정보 0건 노출 | 로그 스캔 |

---

## 5-1. Phase 31-38 신규 E2E 시나리오

> **추가**: 2026-03-26 — Phase 31~38 신규 기능 E2E 검증

### 7'-5: 진단 모드 E2E (Phase 31)

**목표**: `--mode=diagnose` 실행 → Evidence 수집 → Collection Server 전송 → API 조회 전체 흐름 검증

```
검증 체크리스트:
□ Agent를 --mode=diagnose로 실행
□ Evidence JSON이 로컬 스토리지에 저장됨
□ Collection Server에 Evidence 업로드 (POST /api/v1/evidence 또는 동등 엔드포인트)
□ GET /api/v1/diagnostics 에서 Evidence 기반 진단 보고서 조회
□ /diagnostics 페이지에서 보고서 렌더링
□ 감사 로그(audit.log)에 진단 작업 기록
```

**실행 명령어**:

```bash
# Agent diagnose 모드
cd /c/workspace/aiservice-monitoring/agent
go run ./cmd/agent --mode=diagnose \
  --server=http://localhost:8080 \
  --token=$TOKEN

# Collection Server에서 결과 확인
curl -s http://localhost:8080/api/v1/diagnostics \
  -H "Authorization: Bearer $TOKEN"
```

### 7'-6: Attach 프로파일링 E2E (Phase 34)

**목표**: 실행 중 프로세스에 Attach → 프로파일 수집 → API 저장 → UI 플레임그래프 표시 전체 흐름 검증

```
검증 체크리스트:
□ 대상 프로세스(Java/Python/Go) 실행 중
□ Agent --mode=attach --pid=<PID> 실행
□ 프로파일 데이터 수집 (folded stack 형식)
□ POST /api/v1/profiling 에 프로파일 업로드
□ GET /api/v1/profiling 에서 프로파일 목록 조회 (방금 수집한 항목 포함)
□ /profiling 페이지에서 목록 표시
□ /profiling/{profileId} 에서 플레임그래프 SVG 렌더링
```

**실행 명령어**:

```bash
# 대상 프로세스 PID 확인
PID=$(pgrep -f "java -jar" | head -1)

# Attach 프로파일링
cd /c/workspace/aiservice-monitoring/agent
go run ./cmd/agent --mode=attach \
  --pid=$PID \
  --runtime=java \
  --server=http://localhost:8080 \
  --token=$TOKEN

# 프로파일 목록 확인
curl -s http://localhost:8080/api/v1/profiling \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

### 7'-7: 배치 모니터링 E2E (Phase 36-38)

**목표**: 배치 프로세스 자동 감지 → 런타임 프로파일링 → 대시보드 실시간 표시 전체 흐름 검증

```
검증 체크리스트:
□ Spring Batch 또는 Airflow 배치 작업 실행
□ Agent 배치 감지기(detector)가 프로세스 자동 식별
□ 배치 메트릭 수집 (start time, step count, exit status)
□ Collection Server API에 배치 데이터 전송
□ GET /api/v1/batch 에서 배치 작업 목록 조회
□ /batch 대시보드 페이지 — 실행 중 배치 카드 표시
□ /batch/{name} 상세 페이지 — 스텝별 진행 상태
□ /batch/executions/{id} — 실행 이력 상세
□ /batch/alerts — 설정된 알림 규칙 목록
□ /batch/xlog — XLog 조회
□ 배치 런타임 Attach 후 프로파일 → /profiling 에 표시
```

**실행 명령어**:

```bash
# Docker E2E 스택 실행 후
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# 배치 작업 목록 확인
curl -s http://localhost:8080/api/v1/batch \
  -H "Authorization: Bearer $TOKEN"

# 배치 실행 이력 확인
curl -s http://localhost:8080/api/v1/batch/executions \
  -H "Authorization: Bearer $TOKEN"
```

**성공 기준**:

| 검증 항목 | 성공 기준 |
|---------|---------|
| 배치 감지 | 실행 중 배치 프로세스가 API에서 조회됨 |
| 대시보드 | /batch 5개 페이지 오류 없이 렌더링 |
| 알림 규칙 | /batch/alerts 에서 규칙 목록 표시 |
| 프로파일링 | Attach 후 /profiling 에 배치 프로파일 등록 |

---

## 6. 연관 파일

| 파일 | 용도 |
|------|------|
| `docker-compose.e2e.yaml` | E2E 전체 스택 |
| `scripts/e2e/healthcheck.sh` | 서비스 헬스체크 |
| `scripts/e2e/trace-continuity.sh` | Trace 연속성 |
| `scripts/e2e/security-audit.sh` | 보안 감사 |
| `locust/locustfile.py` | 부하 테스트 시나리오 |
| `locust/locust.conf` | Locust 설정 |
| `infra/docker/docker-compose.test.yaml` | Phase 17 기반 (참고) |

---

## 7. Phase 31-38 E2E 성공 기준

| 시나리오 | 성공 기준 | 측정 방법 |
|---------|---------|---------|
| 7'-5: 진단 모드 | Evidence JSON 생성 + API 조회 성공 | curl + 파일 확인 |
| 7'-6: Attach 프로파일링 | 플레임그래프 SVG 렌더링 | /profiling/{id} 브라우저 확인 |
| 7'-7: 배치 모니터링 | 5개 배치 페이지 렌더링 + API 200 | 브라우저 + curl |

---

---

## 8. Phase 7' 최종 실행 결과 ✅

> **실행일**: 2026-03-26
> **전체 판정**: **PASS**

| 구분 | 수 | 비고 |
|------|---:|------|
| PASS | 34 | 핵심 시나리오 전체 통과 |
| WARN | 13 | 비기능 항목 (성능 임계치 근접·SKIP) — 기능 결함 아님 |
| 버그 수정 | 7 | 실행 중 발견 즉시 수정 완료 |

→ Phase 8' (Kubernetes 통합 배포) 착수 가능.

*이 문서는 Phase 7' E2E 검증 실행의 기준 문서다.*
*Phase 8' (Kubernetes 배포) 진행 전 이 검증을 통과해야 한다. → ✅ 통과 완료 (2026-03-26)*
