# Phase 7': E2E 통합 검증 재설계

> **버전**: v1.0.0
> **날짜**: 2026-03-23
> **대상**: AITOP AI Service Monitoring Platform

---

## 1. 재설계 배경

### 1.1 기존 Phase 7 (Grafana 기반) 한계

| 항목 | 기존 Phase 7 | 현황 |
|------|-------------|------|
| UI | Grafana 대시보드 | **폐기** — Next.js로 교체 |
| 수집 경로 | OTel Collector → Prometheus | **확장** — Agent + Collection Server 추가 |
| 인증 | 없음 | **신규** — JWT RBAC 4역할 |
| 데이터 영속성 | 없음 | **신규** — PostgreSQL + MinIO |
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
│  │  JWT Auth + RBAC  │◄──►│  Tempo (Traces) + Loki (Logs)  │  │
│  │  PostgreSQL + MinIO│    │  Tail Sampling (81% 절감)       │  │
│  └───────────────────┘    └─────────────────────────────────┘  │
│             │                            │                       │
│             │ SSE EventBus               │ PromQL / Tempo API    │
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
□ 9개 서비스 기동 확인 (frontend, collection-server, postgres, minio,
                         otel-collector, prometheus, tempo, loki, test-api-server)
□ 각 서비스 healthcheck 통과
□ Agent 등록 → Fleet에 표시
□ Heartbeat 5회 수신
□ Collect 트리거 → MinIO 버킷에 JSON 저장
□ OTel Collector → Prometheus scrape 확인
□ Tempo trace 수신 확인
□ Loki 로그 수신 확인
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
Layer 3: OTel Collector → Tempo (Trace Storage)
Layer 4: Agent → Collection Server (Heartbeat/Collect)
Layer 5: Demo RAG Service → OTel Collector (OTLP)

검증 항목:
□ W3C TraceContext 헤더 전파 (traceparent/tracestate)
□ Baggage 항목 전달 (user.id, session.id, service.tier)
□ Metric↔Log 상관관계 (exemplar traceId 매핑)
□ 동일 traceId로 Tempo 조회 성공
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
□ MinIO 저장 데이터 PII 필드 마스킹
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
| MinIO S3 | 9000 | Evidence 저장 |
| MinIO Console | 9001 | 관리 UI |
| OTel Collector gRPC | 4317 | OTLP 수신 |
| OTel Collector HTTP | 4318 | OTLP HTTP 수신 |
| OTel Collector Health | 13133 | 헬스체크 |
| Prometheus | 9090 | 메트릭 조회 |
| Tempo | 3200 | Trace 조회 |
| Loki | 3100 | 로그 조회 |
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
| 서비스 기동 | 9개 서비스 모두 healthy | docker compose ps |
| 헬스체크 | 전체 PASS | healthcheck.sh 종료코드 0 |
| Trace 연속성 | 5레이어 traceId 동일 | trace-continuity.sh |
| Tail Sampling 보존율 | 에러 트레이스 > 80% | Tempo 쿼리 |
| 비용 절감 | 정상 트레이스 샘플링 < 5% | Prometheus 메트릭 |
| p95 응답시간 | < 2000ms | Locust 리포트 |
| OWASP 항목 | Critical 0건 | security-audit.sh |
| PII 마스킹 | 민감정보 0건 노출 | 로그 스캔 |

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

*이 문서는 Phase 7' E2E 검증 실행의 기준 문서다.*
*Phase 8' (Kubernetes 배포) 진행 전 이 검증을 통과해야 한다.*
