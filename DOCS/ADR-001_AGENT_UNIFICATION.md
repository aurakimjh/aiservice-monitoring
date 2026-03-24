# ADR-001: 에이전트 일원화 — Diagnostic + Monitoring 통합

> **상태**: Accepted
> **작성일**: 2026-03-24
> **결정자**: Aura Kim (Architect)
> **관련 문서**: [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [AGENT_DESIGN.md](./AGENT_DESIGN.md)

---

## 1. 컨텍스트

AITOP은 현재 2개의 에이전트를 별도로 개발하고 있다:

| 에이전트 | 프로젝트 | 언어 | 목적 |
|---------|---------|------|------|
| **AITOP Onsite Agent** | aitop-onsite | Java 17 | 정기/온디맨드 IT 진단 (55+31개 항목) |
| **AITOP Monitoring Agent** | aiservice-monitoring | Go | 24/7 실시간 AI 서비스 모니터링 |

두 에이전트는 **동일 서버에 설치**되어 **동일 데이터**(OS/WEB/WAS/DB)를 **각각 수집**한다.

### 문제점

1. **고객 혼란**: "왜 에이전트가 2개 필요한가?"
2. **중복 수집**: OS/WEB/WAS/DB 메트릭을 2번 수집 → 서버 부하 증가
3. **설치 부담**: Go 바이너리(20MB) + Java Agent(150MB) + JRE(300MB) = ~470MB
4. **운영 복잡도**: Fleet 관리 2중화, OTA 업데이트 2회, 보안 심사 2건
5. **데이터 불일치**: 수집 시점 차이로 동일 지표의 값이 다를 수 있음
6. **경쟁사 대비 열세**: Datadog/Dynatrace/WhaTap 모두 **에이전트 1개**

---

## 2. 결정

**Go Agent를 기반으로 단일 에이전트로 일원화한다.**

Java Agent(aitop-onsite)의 수집 기능을 Go Agent의 플러그인/모드로 흡수하고, Java Agent는 단계적으로 폐기(EOL)한다.

---

## 3. 통합 아키텍처

### 3.1 실행 모드

```
aitop-agent (Go 단일 바이너리, ~25MB)
│
├── --mode=monitor (기본값)
│   실시간 24/7 모니터링
│   OTel 스트리밍 (Metrics/Traces/Logs)
│   Heartbeat + Fleet 관리
│   12종 Collector 상시 수집
│
├── --mode=diagnose
│   온디맨드 진단 수집
│   86개 항목 Evidence 수집 → ZIP 생성 → 업로드
│   설정 파일·로그 심층 수집
│   수집 완료 후 결과 반환 (상주하지 않음)
│
├── --mode=collect-only
│   1회 수집 → HTTPS Push → 종료
│   에어갭 환경용 오프라인 ZIP 내보내기
│   프로젝트 토큰 기반 인증
│
└── --mode=full
    모니터링 상시 + 진단 스케줄/온디맨드
    가장 완전한 모드 (권장)
```

### 3.2 플러그인 통합

```
공유 플러그인 (모니터링 + 진단 양쪽 활용):
├── IT Plugins
│   ├── OS Collector      ← CPU/MEM/Disk/Net (모니터링: 실시간, 진단: 스냅샷)
│   ├── WEB Collector     ← Nginx/Apache/HAProxy
│   ├── WAS Collector     ← JVM/Node/.NET/Python
│   ├── DB Collector      ← PostgreSQL/MySQL/Oracle/MSSQL
│   ├── Cache Collector   ← Redis/Memcached
│   └── MQ Collector      ← Kafka/RabbitMQ/ActiveMQ
│
├── AI Plugins
│   ├── GPU Collector     ← DCGM/SMI (모니터링: 실시간, 진단: ITEM0208/0220/0228)
│   ├── LLM Collector     ← vLLM/Ollama/Triton (모니터링: TTFT/TPS, 진단: ITEM0200~0204)
│   ├── VectorDB Collector ← Qdrant/Milvus/Chroma (모니터링: 검색 지연, 진단: ITEM0205~0206)
│   ├── Serving Collector ← 배칭/KV Cache (모니터링: 큐 깊이, 진단: ITEM0217~0219)
│   ├── OTel Collector    ← OTLP Receiver
│   └── Profiling Collector ← pprof/async-profiler/CLR
│
진단 전용 플러그인 (--mode=diagnose/full 에서만 활성화):
├── Evidence Plugins
│   ├── ConfigEvidence    ← 설정 파일 수집 (nginx.conf, jvm options, my.cnf 등)
│   ├── LogEvidence       ← 로그 파일 분석 (에러 패턴, 슬로우 쿼리, 접근 로그)
│   ├── EOSEvidence       ← EOS(End of Support) 라이프사이클 체크 (17개 제품군)
│   ├── SecurityEvidence  ← 보안 설정 수집 (SSL/TLS, 패치, 계정 정책)
│   ├── CrossAnalysis     ← IT↔AI 교차 분석용 통합 스냅샷
│   └── APMEvidence       ← APM SaaS 어댑터 (WhaTap/Datadog/New Relic/Dynatrace/Scouter)
```

### 3.3 데이터 흐름

```
모니터링 모드:
  Collector → OTel Exporter → Collection Server → Prometheus/Tempo/Loki → Dashboard

진단 모드:
  Collector + Evidence Plugin → Evidence JSON → ZIP → aitop-backend → Rule+LLM 판정 → 보고서

풀 모드:
  Collector ──┬── OTel Exporter → Collection Server (실시간)
              └── Evidence Plugin → ZIP/Upload (온디맨드/스케줄)
```

### 3.4 리소스 비교

| 항목 | 현재 (2개) | 통합 후 (1개) | 절감 |
|------|----------|-------------|------|
| 설치 크기 | ~470MB (Go 20 + Java 150 + JRE 300) | ~25MB (Go 바이너리) | **95% 절감** |
| 상주 메모리 | ~300MB (Go 50 + Java 250) | ~50MB | **83% 절감** |
| CPU 오버헤드 | 중복 수집으로 2배 | 1회 수집 → 이중 활용 | **50% 절감** |
| 관리 포인트 | Fleet 2개, OTA 2회 | Fleet 1개, OTA 1회 | **50% 절감** |

---

## 4. 구현 로드맵

### Phase 1: 진단 모드 추가 (2~3주)

| # | 작업 | 상세 |
|---|------|------|
| 1-1 | `--mode=diagnose` CLI 플래그 추가 | agent/cmd/aitop-agent/main.go |
| 1-2 | Evidence Collector 인터페이스 정의 | `agent/internal/collector/evidence/` |
| 1-3 | ConfigEvidence 플러그인 구현 | 설정 파일 수집 (nginx.conf, server.xml 등) |
| 1-4 | LogEvidence 플러그인 구현 | 로그 패턴 분석 (에러, 슬로우 쿼리) |
| 1-5 | EOSEvidence 플러그인 구현 | eos-lifecycle-db.json 기반 버전 체크 |
| 1-6 | Evidence ZIP 생성 + 업로드 | 구조화 JSON → ZIP → HTTPS POST |
| 1-7 | 기존 12종 Collector 출력을 Evidence 형식으로 변환 | 어댑터 패턴 |

### Phase 2: Backend 연동 (2~3주)

| # | 작업 | 상세 |
|---|------|------|
| 2-1 | Collection Server에 Evidence 수신 API 추가 | `POST /api/v1/evidence/upload` |
| 2-2 | Evidence → aitop-backend 릴레이 | Collection Server → Backend 포워딩 |
| 2-3 | 진단 트리거 연동 | Agent에서 수집 완료 → Backend에서 자동 진단 실행 |
| 2-4 | Fleet 대시보드에 진단 상태 표시 | 마지막 진단 시각, 결과 요약 |

### Phase 3: 고급 진단 (3~4주)

| # | 작업 | 상세 |
|---|------|------|
| 3-1 | SecurityEvidence 플러그인 | SSL/TLS, 패치, 계정 정책 |
| 3-2 | APMEvidence 플러그인 | 6종 APM SaaS 어댑터 (Go 포팅) |
| 3-3 | CrossAnalysis 플러그인 | IT↔AI 교차 분석용 통합 스냅샷 |
| 3-4 | `--mode=collect-only` 구현 | 에어갭 환경용 1회 수집 + 오프라인 ZIP |
| 3-5 | `--mode=full` 구현 | 모니터링 상시 + 진단 스케줄/온디맨드 |

### Phase 4: Java Agent EOL (4~8주)

| # | 작업 | 상세 |
|---|------|------|
| 4-1 | 기능 동등성 검증 | Java Agent의 모든 수집 기능이 Go Agent에서 동작 확인 |
| 4-2 | 마이그레이션 가이드 작성 | 기존 Java Agent 사용자용 전환 문서 |
| 4-3 | 병행 운영 기간 (3개월) | 양쪽 지원, 신규 고객은 Go Agent만 |
| 4-4 | Java Agent EOL 선언 | 최종 버전 릴리스 후 유지보수만 |

---

## 5. 대안 검토

### 대안 A: 현재 유지 (에이전트 2개)

- 장점: 변경 없음, 각 팀 독립 개발
- 단점: 고객 혼란, 중복 수집, 설치 부담, 경쟁사 대비 열세
- **기각 사유**: 제품 관점에서 고객에게 설명할 수 없는 복잡도

### 대안 B: Java Agent 기반 일원화

- 장점: Diagnostic 팀의 기존 코드 재사용
- 단점: Java 17 + JRE 설치 필수 (300MB+), Go 대비 리소스 사용량 5~10배
- **기각 사유**: 에이전트는 경량이어야 함 — 모든 경쟁사가 Go/C++/Rust 사용

### 대안 C: Go Agent 기반 일원화 (채택)

- 장점: 단일 바이너리 25MB, 크로스 플랫폼, 저 리소스
- 단점: Java Agent의 수집 로직을 Go로 포팅해야 함
- **채택 사유**: 장기적으로 유일하게 지속 가능한 아키텍처

---

## 6. 리스크와 대응

| 리스크 | 수준 | 대응 |
|--------|:----:|------|
| Go 포팅 공수 | 중간 | Java 수집 스크립트는 shell 래퍼 → Go에서 exec 호출로 재사용 가능 |
| 기존 Java Agent 고객 이탈 | 낮음 | 3개월 병행 운영 + 마이그레이션 가이드 |
| 진단 품질 저하 | 낮음 | Evidence 스키마 동일하게 유지, 출력 검증 테스트 |
| 일정 지연 | 중간 | Phase 1(진단 모드)만으로도 가치 제공 가능, 점진적 확장 |

---

## 7. 성공 지표

| 지표 | 목표 |
|------|------|
| 설치 크기 | < 30MB (단일 바이너리) |
| 상주 메모리 | < 60MB (full 모드) |
| 수집 중복 | 0건 (동일 데이터 1회 수집) |
| 진단 항목 커버리지 | 86개 전체 (IT 55 + AI 31) |
| Java Agent 대비 수집 동등성 | 100% (Phase 4 기준) |
| 고객 설치 시간 | < 5분 (Lite 모드) |

---

> **결론**: Go Agent 기반 일원화는 고객 경험, 리소스 효율, 경쟁력 모든 면에서 올바른 결정이다. 점진적으로 진행하되, Phase 1(진단 모드 추가)은 최우선으로 착수한다.
