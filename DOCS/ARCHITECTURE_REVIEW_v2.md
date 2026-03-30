# AITOP 아키텍처 검토 — 자체 스토리지 전환 및 대규모 사이트 지원 설계

> **문서 유형**: 아키텍처 검토서 (Architecture Decision Review)
> **작성일**: 2026-03-29 (Rev.2 대규모 지원 보강)
> **작성자**: Architecture Review
> **기밀 등급**: Internal
> **관련 문서**: [ARCHITECTURE.md](./ARCHITECTURE.md), [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md), [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md)

---

> **[중요] 본 문서는 권고안(Architecture Decision Review)이며, 현재 운영 구조가 아닙니다.**
>
> - **현재 운영 구조(As-Is)**: OTel Collector → Prometheus/Jaeger 경유 아키텍처 — [ARCHITECTURE.md](./ARCHITECTURE.md) 참조
> - **이 문서**: v1.0을 위한 자체 스토리지 전환 설계 검토서. WS-1~7 워크스트림 완료 후 실제 운영 구조로 전환 예정.
> - **독자 안내**: 프로덕션 운영 참조 시 ARCHITECTURE.md를 사용하세요. 이 문서는 향후 아키텍처 방향 이해를 위한 검토 자료입니다.

---

## 1. 검토 배경

### 1.1 현재 아키텍처의 문제

현재 AITOP은 데이터 수집부터 시각화까지 **6개 중간 레이어**를 거칩니다:

```
앱 → OTel SDK → OTel Collector → Prometheus/Jaeger → Collection Server(Proxy) → Frontend
      (1)         (2)              (3)                  (4)                       (5)
```

이 구조에서 발생하는 문제:

| 문제 | 영향 | 빈도 |
|------|------|------|
| OTel Collector ↔ Jaeger gRPC/HTTP 프로토콜 불일치 | 트레이스 유실, 서비스 미표시 | **높음** |
| Prometheus 스크래핑 지연 (15초 주기) | 실시간성 저하 | 상시 |
| Jaeger 인메모리 인덱스 갱신 지연 | 신규 서비스 표시 지연 | 기동 시 |
| Collection Server가 Prometheus/Jaeger를 프록시할 뿐 | 장애점 증가, 불필요한 hop | 상시 |
| 환경변수 설정 실수 (gRPC vs HTTP, 4317 vs 4318) | 데모 환경에서 반복적 연동 실패 | **매우 높음** |
| AGPL 라이선스 (Grafana Tempo, Loki) | 상용 배포 제한 | 라이선스 |

### 1.2 대규모 사이트 요구사항

현재 설계는 소규모(호스트 100대, 서비스 50개)만 가정하고 있습니다. 상용 제품이 되려면:

| 규모 등급 | 호스트 | 서비스 | 초당 스팬 | 시계열 수 | 트랜잭션 보관 | 고객 예시 |
|----------|--------|--------|----------|----------|-------------|----------|
| **Small** | ~100 | ~50 | ~5,000 | ~10,000 | 7일 | 스타트업, 중소기업 |
| **Medium** | ~1,000 | ~200 | ~50,000 | ~100,000 | 30일 | 중견기업, 금융사 |
| **Large** | ~5,000 | ~500 | ~200,000 | ~500,000 | 90일 | 대기업, 통신사 |
| **Enterprise** | 10,000+ | 1,000+ | 500,000+ | 1,000,000+ | 1년+ | 글로벌 기업, 공공기관 |

**트랜잭션(트레이스) 보관은 필수**: 장애 사후 분석, 규정 준수(금융감독원, ISMS-P), 성능 트렌드 분석에 최소 30일~1년 보관이 요구됩니다.

### 1.3 검토 질문

> **"Prometheus와 Jaeger 없이, OTel 수집은 유지하되 저장·조회를 자체 구현하고, 대규모 사이트에서도 안정적으로 동작할 수 있는가?"**

---

## 2. 현재 아키텍처 — 외부 의존성 분석

### 2.1 Prometheus가 하는 일

| 역할 | 사용 빈도 | 대체 난이도 |
|------|----------|------------|
| 시계열 메트릭 저장 (TSDB) | 모든 페이지 | **중** |
| PromQL 쿼리 엔진 | 대시보드, 알림, SLO | **상** |
| 스크래핑 (pull 방식) | 15초 주기 | OTel push로 대체 가능 |
| Alert Rule 평가 | 알림 시스템 | 자체 구현 필요 |
| Remote Write/Read API | 장기 보관 | 불필요 |

**핵심 가치**: PromQL 쿼리 엔진 + 시계열 저장

### 2.2 Jaeger가 하는 일

| 역할 | 사용 빈도 | 대체 난이도 |
|------|----------|------------|
| 트레이스 저장 (인메모리/Badger) | 트레이스 페이지 | **중** |
| 서비스 인덱스 | 서비스 목록 | **하** |
| 트레이스 검색 (서비스, 기간, 태그) | XLog, 트레이스 뷰 | **중** |
| 의존성 그래프 | 토폴로지 맵 | **하** |
| UI | 사용하지 않음 (자체 UI) | 불필요 |

**핵심 가치**: 트레이스 저장 + 검색. Jaeger UI는 이미 사용하지 않음.

### 2.3 Collection Server가 이미 하는 일

```
이미 자체 구현된 것:
  ✅ SQLite 영속 저장 (Project, Agent, Entity 관계)
  ✅ Agent Heartbeat 수신/처리
  ✅ 수집 결과(CollectResult) 수신/저장
  ✅ Evidence ZIP 업로드/관리
  ✅ Fleet 관리 (그룹, 플러그인, OTA)
  ✅ 배치 실행 이력/프로파일링
  ✅ 프록시 API (Prometheus/Jaeger 중계)
  ✅ AI 서비스 메트릭 집계

프록시에 의존하는 것 (Prometheus/Jaeger가 있어야 동작):
  ❌ /proxy/prometheus/* → PromQL 쿼리
  ❌ /proxy/jaeger/* → 트레이스 검색
  ❌ /realdata/overview → Prometheus 집계
  ❌ /realdata/hosts/*/metrics → Prometheus 시계열
```

---

## 3. 제안 아키텍처 — 자체 스토리지 엔진

### 3.1 목표 아키텍처 — 규모별 배포 모델

AITOP v2.0은 **동일한 코드베이스**로 Small부터 Enterprise까지 커버합니다. 규모에 따라 스토리지 백엔드와 배포 토폴로지만 달라집니다.

#### 3.1.1 Small/Medium (단일 노드)

```
╔═══════════════════════════════════════════════════════════════════╗
║  AITOP v2.0 — Single Node (호스트 ~1,000, 서비스 ~200)            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  ┌── 계측 레이어 (변경 없음) ──────────────────────────────────┐  ║
║  │  [Python] [Node.js] [Go] [Java] [.NET]                      │  ║
║  │  OTel SDK → OTLP (gRPC :4317 / HTTP :4318)                 │  ║
║  └───────────────────────┬─────────────────────────────────────┘  ║
║                          │                                         ║
║  ┌───────────────────────▼─────────────────────────────────────┐  ║
║  │        AITOP Collection Server v2.0 (단일 프로세스)           │  ║
║  │                                                              │  ║
║  │  ┌─────────────────────────────────────────────────────────┐│  ║
║  │  │ Ingestion Pipeline                                      ││  ║
║  │  │  OTLP Receiver → Backpressure Queue → Fan-out           ││  ║
║  │  │  (gRPC :4317 + HTTP :4318, 최대 100K spans/sec)         ││  ║
║  │  └────────────┬────────────────────┬───────────────────────┘│  ║
║  │               │                    │                         │  ║
║  │  ┌────────────▼───────┐ ┌─────────▼──────────┐             │  ║
║  │  │ Metric Engine      │ │ Trace Engine        │             │  ║
║  │  │ Hot: 인메모리 4h   │ │ Hot: 인메모리 100K건│             │  ║
║  │  │ Warm: PostgreSQL   │ │ Warm: PostgreSQL    │             │  ║
║  │  │ Cold: S3 Parquet   │ │ Cold: S3 Parquet    │             │  ║
║  │  │ 보관: 최대 1년     │ │ 보관: 최대 1년      │             │  ║
║  │  └────────────────────┘ └────────────────────┘             │  ║
║  │                                                              │  ║
║  │  ┌─────────────────────────────────────────────────────────┐│  ║
║  │  │ 기존 기능 유지                                           ││  ║
║  │  │ Fleet, Agent, Evidence, Batch, Profiling, Diagnostics   ││  ║
║  │  └─────────────────────────────────────────────────────────┘│  ║
║  │  REST API (:8080)  ← Frontend 직접 호출                     │  ║
║  └────────────────────────┬────────────────────────────────────┘  ║
║                           │                                        ║
║  ┌────────────────────────▼────────────────────────────────────┐  ║
║  │  AITOP Frontend (Next.js) — 단일 백엔드                      │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════════╝
```

#### 3.1.2 Large/Enterprise (클러스터)

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  AITOP v2.0 — Cluster Mode (호스트 10,000+, 서비스 1,000+)                ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  ┌── 수천 개 앱/호스트에서 OTLP 전송 ──────────────────────────────────┐  ║
║  │  OTel SDK → OTLP                                                    │  ║
║  └────────────────┬────────────────────────────────────────────────────┘  ║
║                   │                                                        ║
║  ┌────────────────▼────────────────────────────────────────────────────┐  ║
║  │  Load Balancer (L4/L7)                                               │  ║
║  │  DNS round-robin 또는 NGINX/HAProxy/K8s Service                      │  ║
║  └──┬──────────────┬──────────────┬──────────────┬─────────────────────┘  ║
║     │              │              │              │                          ║
║  ┌──▼───┐  ┌──────▼───┐  ┌──────▼───┐  ┌──────▼───┐                     ║
║  │ CS-1 │  │ CS-2     │  │ CS-3     │  │ CS-N     │  Ingestion Nodes    ║
║  │ OTLP │  │ OTLP     │  │ OTLP     │  │ OTLP     │  (Stateless)       ║
║  │ Recv  │  │ Recv     │  │ Recv     │  │ Recv     │  수평 확장 가능     ║
║  └──┬───┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                     ║
║     │           │              │              │                            ║
║     └─────┬─────┴──────┬───────┴──────┬───────┘                            ║
║           │            │              │                                     ║
║  ┌────────▼────┐ ┌─────▼──────┐ ┌────▼─────────┐                         ║
║  │ PostgreSQL  │ │ PostgreSQL │ │ Object Store │                         ║
║  │ (Metrics)   │ │ (Traces)   │ │ S3 / MinIO   │                         ║
║  │ TimescaleDB │ │ 파티션 테이블│ │ Cold Parquet │                         ║
║  │ 또는        │ │ 일별 파티션  │ │ 장기 보관     │                         ║
║  │ ClickHouse  │ │ 자동 Purge  │ │ 1년+         │                         ║
║  └─────────────┘ └────────────┘ └──────────────┘                         ║
║                                                                            ║
║  ┌──────────────────────────────────────────────────────────────────────┐  ║
║  │  Query Router — 분산 쿼리 통합                                        │  ║
║  │  Metric/Trace 쿼리를 파티션별로 분배, 결과 병합                        │  ║
║  └──────────────────────────┬───────────────────────────────────────────┘  ║
║                              │                                              ║
║  ┌──────────────────────────▼───────────────────────────────────────────┐  ║
║  │  AITOP Frontend (Next.js) — 단일 API 엔드포인트                       │  ║
║  └──────────────────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### 3.2 핵심 변경점

| 현재 (v1.x) | 제안 (v2.0) | 효과 |
|-------------|-------------|------|
| OTel Collector가 OTLP 수신 | Collection Server가 직접 OTLP 수신 | **컴포넌트 1개 제거** |
| Prometheus가 메트릭 저장 | Collection Server 내장 Metric Engine | **컴포넌트 1개 제거** |
| Jaeger가 트레이스 저장 | Collection Server 내장 Trace Engine | **컴포넌트 1개 제거** |
| Collection Server → Prometheus/Jaeger 프록시 | Collection Server가 직접 응답 | **프록시 제거, 지연 감소** |
| 앱 → Collector → Prometheus/Jaeger → Proxy → Frontend (5 hop) | 앱 → Collection Server → Frontend (2 hop) | **hop 60% 감소** |

### 3.3 레이어 비교

```
현재: App → OTel SDK → OTel Collector → Prometheus  → CS(Proxy) → Frontend
                                       → Jaeger     ↗
      총 5~6 컴포넌트, 4 hop

제안: App → OTel SDK → Collection Server v2 → Frontend
      총 3 컴포넌트, 2 hop
```

---

## 4. 자체 스토리지 엔진 설계

### 4.1 Ingestion Pipeline — 대량 데이터 수신

모든 데이터는 단일 수신 파이프라인을 거칩니다. 대규모 사이트에서 **초당 50만 스팬, 100만 메트릭 포인트** 수신을 목표로 합니다.

```
OTLP gRPC/HTTP → Decoder → Backpressure Queue → Fan-out → Metric Engine
     (:4317/4318)            (Ring Buffer)                  → Trace Engine
                                                             → Log Engine
```

**Backpressure Queue**: 수신 속도가 저장 속도를 초과하면 큐가 가득 차기 전에 **적응형 샘플링**을 적용합니다. 에러 트레이스는 100% 보존하고, 정상 트레이스만 샘플링합니다 (Head-based + Tail-based 혼합).

```
┌──────────────────────────────────────────────────────────────────┐
│ Ingestion Pipeline 설계                                          │
│                                                                   │
│  OTLP Receiver                                                    │
│  ├── gRPC server (:4317) — 동시 연결 10,000+                     │
│  ├── HTTP server (:4318) — Keep-Alive, 배치 수신                 │
│  └── Agent Heartbeat (:8080) — 기존 호환                         │
│                                                                   │
│  Decoder (protobuf → 내부 모델)                                   │
│  ├── 제로카피 디코딩 (protobuf arena allocation)                   │
│  ├── 리소스 속성 정규화 (service.name, host.name 인덱싱)           │
│  └── 스키마 버전 호환 (OTel Semantic Conventions v1.x)            │
│                                                                   │
│  Backpressure Queue (Go channel + Ring Buffer)                    │
│  ├── 용량: 1M 이벤트 (메모리 ~2GB)                                │
│  ├── Overflow 정책: 적응형 샘플링 (에러 100% 보존)                 │
│  ├── 배치 크기: 5,000 이벤트 또는 1초 주기                         │
│  └── 메트릭: queue_depth, drop_count, latency_p99 자체 모니터링   │
│                                                                   │
│  Fan-out (배치 단위 병렬 기록)                                     │
│  ├── → Metric Engine (카운터, 게이지, 히스토그램)                   │
│  ├── → Trace Engine (스팬 → 트레이스 조립)                         │
│  └── → Log Engine (로그 레코드)                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Metric Engine (Prometheus 대체)

**저장 전략**: 3단계 계층 스토리지 + 플러그형 백엔드

```
┌──────────────────────────────────────────────────────────────────┐
│ Hot Tier (인메모리)                                                │
│ • 보관: 최근 4시간 (설정 가능)                                     │
│ • 해상도: 원본 (1초~15초 간격)                                     │
│ • 용도: 실시간 대시보드, 현재 상태 조회                             │
│ • 구현: Go sync.Map + Sharded RWMutex (CPU 코어별 샤딩)           │
│ • 메모리: ~500MB (시계열 10K) ~ 8GB (시계열 100K)                  │
│ • 성능: 읽기 100K qps, 쓰기 500K points/sec                       │
├──────────────────────────────────────────────────────────────────┤
│ Warm Tier (RDBMS)                                                  │
│ • 보관: 7일 ~ 90일 (설정 가능)                                     │
│ • 해상도: 1분 다운샘플링 (avg/min/max/sum/count/p50/p95/p99)      │
│ • 용도: 히스토리 조회, 알림 평가, SLO 계산                         │
│ • 백엔드 (규모별 자동 선택):                                        │
│   S: SQLite WAL — 디스크 ~2GB/7일                                  │
│   M: PostgreSQL — 파티션 테이블, 일별 자동 파티션                   │
│   L: PostgreSQL + TimescaleDB — 하이퍼테이블, 압축, 연속 집계      │
│   XL: ClickHouse — 컬럼 스토어, 100억+ 행 지원                    │
│ • 인덱스: (metric_name, label_set_hash, timestamp) 복합 인덱스     │
├──────────────────────────────────────────────────────────────────┤
│ Cold Tier (Object Store)                                           │
│ • 보관: 90일 ~ 무제한 (규정 준수용)                                 │
│ • 해상도: 1시간 다운샘플링                                          │
│ • 용도: 장기 트렌드 분석, 규정 준수 (금감원, ISMS-P)               │
│ • 포맷: Apache Parquet (컬럼 압축, ~95% 공간 절약)                 │
│ • 백엔드: S3 / MinIO / Azure Blob / GCS                           │
│ • 조회: 날짜 범위 기반 Parquet scan, 필요 시 Warm으로 로딩          │
└──────────────────────────────────────────────────────────────────┘
```

**규모별 Warm Tier 용량 예측**:

| 규모 | 시계열 수 | 1분 다운샘플링 (행/일) | 30일 용량 | 90일 용량 | 1년 용량 |
|------|----------|---------------------|----------|----------|---------|
| Small (10K) | 10,000 | 14.4M | 1.2 GB | 3.5 GB | 14 GB |
| Medium (100K) | 100,000 | 144M | 12 GB | 35 GB | 140 GB |
| Large (500K) | 500,000 | 720M | 60 GB | 175 GB | 700 GB |
| Enterprise (1M+) | 1,000,000 | 1.44B | 120 GB | 350 GB | 1.4 TB |

> Large 이상에서는 ClickHouse 또는 TimescaleDB의 압축으로 실제 디스크 사용량은 위 수치의 **20~30%** 수준입니다.

**쿼리 엔진**: 자체 쿼리 API + PromQL 기본 호환

```
// 자체 API (기본, 프론트엔드 최적화)
GET /api/v2/metrics/query
{
  "metric": "http_requests_total",
  "filters": { "service": "java-demo-app" },
  "aggregation": "rate",
  "window": "5m",
  "range": { "from": "-1h", "to": "now" },
  "step": "15s"
}

// PromQL 호환 (커스텀 대시보드용)
GET /api/v2/metrics/promql
{
  "query": "rate(http_requests_total{service=\"java-demo-app\"}[5m])",
  "start": "2026-03-29T00:00:00Z",
  "end": "2026-03-29T01:00:00Z",
  "step": "15s"
}
```

**다운샘플링 정책** (크론 백그라운드):

| 작업 | 주기 | 입력 | 출력 |
|------|------|------|------|
| Hot → Warm | 5분 | 원본 포인트 | 1분 집계 (7종 통계) |
| Warm → Cold | 1시간 | 1분 집계 | 1시간 집계 Parquet |
| Warm Purge | 매일 자정 | retention 초과 | 삭제 |
| Cold Lifecycle | 매주 | retention 초과 | S3 Lifecycle 위임 |

### 4.3 Trace Engine (Jaeger 대체) — 트랜잭션 장기 보관

**트랜잭션 보관은 선택이 아닌 필수입니다.** 장애 사후 분석, 성능 트렌드, 규정 준수를 위해 최소 30일~1년 보관합니다.

```
┌──────────────────────────────────────────────────────────────────┐
│ Hot Tier (인메모리)                                                │
│ • 보관: 최근 100,000건 트레이스 (또는 최근 4시간)                   │
│ • 용도: 실시간 XLog, 현재 트레이스 검색                            │
│ • 구현:                                                           │
│   - 서비스별 역인덱스 (service → []traceID)                        │
│   - TraceID → []Span HashMap (O(1) 조회)                          │
│   - XLog 전용 캐시 (timestamp, duration, status, error 최소 필드) │
│ • 메모리: ~2GB (100K traces, span 평균 10개, 500B/span)           │
│ • 성능: 검색 10K qps, 삽입 200K spans/sec                         │
├──────────────────────────────────────────────────────────────────┤
│ Warm Tier (RDBMS) — 트랜잭션 상세 보관                             │
│ • 보관: 7일 ~ 90일 (설정 가능, 기본 30일)                          │
│ • 원본 스팬 전체 보관 (다운샘플링 없음)                              │
│ • 스키마:                                                          │
│                                                                    │
│   traces 테이블 (트레이스 헤더 — 빠른 검색용)                       │
│   ┌─────────────────────────────────────────────────┐             │
│   │ trace_id      VARCHAR(32) PK                     │             │
│   │ service       VARCHAR(128) — 루트 서비스          │             │
│   │ operation     VARCHAR(256) — 루트 오퍼레이션       │             │
│   │ status        SMALLINT (0=ok, 1=error)           │             │
│   │ duration_us   BIGINT — 전체 소요 시간 (µs)        │             │
│   │ span_count    SMALLINT — 스팬 개수                │             │
│   │ started_at    TIMESTAMP — 시작 시각               │             │
│   │ INDEX: (service, started_at)                     │             │
│   │ INDEX: (status, started_at)                      │             │
│   │ INDEX: (duration_us, started_at) — 느린 요청 검색 │             │
│   │ PARTITION: 일별 (started_at 기준)                 │             │
│   └─────────────────────────────────────────────────┘             │
│                                                                    │
│   spans 테이블 (스팬 상세 — 트레이스 드릴다운용)                     │
│   ┌─────────────────────────────────────────────────┐             │
│   │ span_id       VARCHAR(16) PK                     │             │
│   │ trace_id      VARCHAR(32) FK                     │             │
│   │ parent_id     VARCHAR(16)                        │             │
│   │ service       VARCHAR(128)                       │             │
│   │ operation     VARCHAR(256)                       │             │
│   │ kind          SMALLINT (client/server/internal)  │             │
│   │ status        SMALLINT                           │             │
│   │ duration_us   BIGINT                             │             │
│   │ started_at    TIMESTAMP                          │             │
│   │ attributes    JSONB — 태그, 리소스 속성 전체       │             │
│   │ events        JSONB — 로그, 예외 이벤트            │             │
│   │ INDEX: (trace_id)                                │             │
│   │ PARTITION: 일별 (started_at 기준)                 │             │
│   └─────────────────────────────────────────────────┘             │
│                                                                    │
│ • 일별 파티션: 보관 기간 초과 시 파티션 DROP (순간 삭제)              │
│ • 백엔드 (규모별):                                                  │
│   S: SQLite WAL + FTS5 — ~5GB/7일 (100만 트레이스/일)              │
│   M: PostgreSQL — 일별 파티션, JSONB GIN 인덱스                     │
│   L: PostgreSQL + BRIN 인덱스 — 시간 범위 최적화                    │
│   XL: ClickHouse — 컬럼 압축, 초당 100만 스팬 삽입                  │
├──────────────────────────────────────────────────────────────────┤
│ Cold Tier (Object Store) — 장기 트랜잭션 아카이브                    │
│ • 보관: 90일 ~ 무제한 (규정 준수용)                                  │
│ • 포맷: Parquet (서비스별 + 일별 파일)                               │
│ • 구조: s3://aitop-traces/{service}/{date}/traces.parquet          │
│ • 압축: Zstd — 원본 대비 ~85% 절약                                  │
│ • 조회: 서비스+날짜 범위 지정 시 Parquet scan                        │
│ • 용도: 장애 사후 분석, 감사, 규정 준수                              │
└──────────────────────────────────────────────────────────────────┘
```

**규모별 Trace Warm Tier 용량 예측**:

| 규모 | 일일 트레이스 | 일일 스팬 | 30일 용량 | 90일 용량 | 1년 용량 (Cold) |
|------|-------------|----------|----------|----------|----------------|
| Small | 100만 | 1,000만 | 5 GB | 15 GB | 20 GB (Parquet) |
| Medium | 1,000만 | 1억 | 50 GB | 150 GB | 200 GB |
| Large | 5,000만 | 5억 | 250 GB | 750 GB | 1 TB |
| Enterprise | 2억+ | 20억+ | 1 TB | 3 TB | 4 TB |

> Enterprise 규모에서 ClickHouse 사용 시 컬럼 압축으로 실제 디스크는 **15~25%** 수준입니다.

**트레이스 검색 API**:

```
// 기본 검색
GET /api/v2/traces?service=java-demo-app&status=error&from=-1h&limit=50

// 고급 검색 (느린 트랜잭션 찾기)
POST /api/v2/traces/search
{
  "service": "java-demo-app",
  "operation": "/api/orders",
  "status": "error",
  "min_duration": "500ms",
  "max_duration": "5s",
  "attributes": { "http.status_code": "500", "db.system": "postgresql" },
  "range": { "from": "2026-03-01", "to": "2026-03-29" },
  "order_by": "duration",
  "limit": 100
}

// Cold Tier 조회 (장기 보관 데이터)
POST /api/v2/traces/archive/search
{
  "service": "java-demo-app",
  "range": { "from": "2025-12-01", "to": "2025-12-31" },
  "status": "error",
  "limit": 50
}
```

**트랜잭션 통계 API** (XLog, 히트맵, 서비스맵용):

```
// XLog 산점도 데이터 (1시간, 최대 10,000건)
GET /api/v2/traces/xlog?service=java-demo-app&from=-1h

// 서비스별 응답시간 히스토그램
GET /api/v2/traces/histogram?service=java-demo-app&from=-1h&buckets=50

// 서비스 의존성 맵
GET /api/v2/traces/dependencies?from=-1h
```

### 4.4 OTLP Receiver (OTel Collector 대체)

Collection Server에 OTLP gRPC/HTTP 리시버를 내장합니다.

```go
// 핵심 구현 — OTLP protobuf 직접 디코딩
import (
    "go.opentelemetry.io/proto/otlp/collector/trace/v1"
    "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
    "go.opentelemetry.io/proto/otlp/collector/logs/v1"
)
```

**구현 옵션 비교**:

| 옵션 | 장점 | 단점 | 처리량 |
|------|------|------|--------|
| **A. OTel Collector SDK 임베딩** | 검증된 코드 | 의존성 ~50MB, 오버헤드 | ~200K spans/sec |
| **B. OTLP protobuf 직접 디코딩** | 경량, 완전 제어, 최적화 가능 | 직접 구현 | ~500K spans/sec |

**권장: 옵션 B** — 대규모 처리를 위해 불필요한 범용 레이어 없이 OTLP protobuf를 직접 디코딩합니다. gRPC/HTTP 서버는 이미 Collection Server에 내장되어 있으므로 추가 구현 부담이 적습니다.

**수신 성능 목표**:

| 지표 | Small | Medium | Large | Enterprise |
|------|-------|--------|-------|------------|
| 동시 gRPC 연결 | 100 | 1,000 | 5,000 | 10,000+ |
| 초당 스팬 수신 | 5,000 | 50,000 | 200,000 | 500,000+ |
| 초당 메트릭 포인트 | 10,000 | 100,000 | 500,000 | 1,000,000+ |
| 수신 → 조회 가능 지연 | <1초 | <2초 | <3초 | <5초 |

### 4.5 스토리지 백엔드 자동 선택

AITOP은 설치 시점에 규모를 감지하고 **적절한 백엔드를 자동 선택**합니다:

```yaml
# aitop-server.yaml — 스토리지 설정
storage:
  mode: auto          # auto | sqlite | postgres | clickhouse

  # auto 모드: 아래 임계값 기준 자동 전환
  auto_upgrade:
    postgres_threshold: 50000     # 시계열 > 50K → PostgreSQL 전환 권고
    clickhouse_threshold: 500000  # 시계열 > 500K → ClickHouse 전환 권고

  # 보관 정책
  retention:
    hot: 4h           # 인메모리
    warm: 30d          # RDBMS (7d ~ 365d 설정 가능)
    cold: 365d         # S3/Object Store (무제한 가능)

  # 트랜잭션(트레이스) 보관 — 별도 정책
  trace_retention:
    warm: 30d          # 전체 스팬 보관 (기본 30일)
    cold: 365d         # Parquet 아카이브 (기본 1년)
    error_extended: 90d # 에러 트레이스는 Warm에서 90일 보관

  # 다운샘플링
  downsample:
    hot_to_warm: 1m    # 원본 → 1분 집계
    warm_to_cold: 1h   # 1분 → 1시간 집계
```

### 4.6 수평 확장 (Cluster Mode)

Large/Enterprise 규모에서는 Collection Server를 **수평 확장**합니다:

```
┌─────────────────────────────────────────────────────────────────┐
│ Ingestion Node (N개, Stateless)                                  │
│ • OTLP 수신 + Decoder + Queue                                   │
│ • 배치 단위로 Storage에 기록                                      │
│ • 수평 확장: K8s Deployment replica 조절                         │
│ • 메모리: 2~4GB/노드                                             │
├─────────────────────────────────────────────────────────────────┤
│ Storage Layer (Shared)                                           │
│ • PostgreSQL/ClickHouse: 모든 노드가 공유                         │
│ • 파티셔닝: 시간 기반 (일별 파티션)                                │
│ • 샤딩: 서비스명 해시 기반 (ClickHouse에서 자동)                   │
├─────────────────────────────────────────────────────────────────┤
│ Query Router (1~2개, Stateless)                                  │
│ • 프론트엔드 API 요청 처리                                        │
│ • 시간 범위에 따라 Hot(Ingestion 노드) / Warm(DB) / Cold(S3) 분배│
│ • 결과 병합 + 정렬 + 페이지네이션                                 │
│ • 캐시: Redis 또는 인메모리 LRU (자주 조회되는 대시보드 쿼리)       │
└─────────────────────────────────────────────────────────────────┘
```

**확장 시나리오**:

| 규모 | Ingestion 노드 | DB | Query Router | 총 리소스 |
|------|---------------|-----|-------------|----------|
| Small | 1 (내장) | SQLite (내장) | 1 (내장) | 1 프로세스, 2GB |
| Medium | 1 (내장) | PostgreSQL 1대 | 1 (내장) | 2 프로세스, 8GB |
| Large | 3~5 | PostgreSQL HA | 2 | 7 프로세스, 32GB |
| Enterprise | 10+ | ClickHouse 3+ 노드 | 3+ | 16+ 프로세스, 128GB+ |

---

## 5. 경쟁사 분석 — 자체 스토리지 사례

### 5.1 자체 스토리지를 사용하는 경쟁사

| 솔루션 | 메트릭 저장 | 트레이스 저장 | 특징 |
|--------|-----------|-------------|------|
| **Datadog** | 자체 TSDB | 자체 엔진 | 완전 자체 스택 — 이것이 Datadog의 핵심 경쟁력 |
| **Dynatrace** | 자체 Grail | 자체 엔진 | Grail = 통합 데이터 레이크, PromQL 불필요 |
| **New Relic** | 자체 NRDB | 자체 엔진 | 모든 데이터를 하나의 DB에 통합 |
| **WhaTap** | 자체 엔진 | 자체 엔진 | Java 기반 커스텀 TSDB |
| **Scouter** | 자체 파일 DB | 자체 엔진 | XLog 원조 — 자체 저장/검색 |

### 5.2 오픈소스에 의존하는 솔루션

| 솔루션 | 메트릭 | 트레이스 | 문제 |
|--------|--------|---------|------|
| **Grafana Cloud** | Mimir (자체 포크) | Tempo | AGPL 라이선스 |
| **SigNoz** | ClickHouse | ClickHouse | 외부 DB 의존 |
| **AITOP v1 (현재)** | Prometheus | Jaeger | 프록시 오버헤드, 설정 복잡성 |

### 5.3 교훈

> **세계 최고 솔루션(Datadog, Dynatrace)은 모두 자체 스토리지 엔진을 보유한다.**
> 이것이 단순한 기술적 선택이 아니라 **제품 차별화의 핵심**이다.
>
> 자체 스토리지를 가지면:
> 1. **설치 간소화** — `docker run aitop` 하나로 끝
> 2. **성능 최적화** — AI 서비스에 특화된 쿼리 최적화 가능
> 3. **라이선스 자유** — AGPL 오염 없음
> 4. **데이터 제어** — 다운샘플링, 보존 정책을 자유롭게 설정
> 5. **장애점 감소** — 외부 시스템 장애가 AITOP에 전파되지 않음

---

## 6. 구현 로드맵

### Phase S1: OTLP Receiver 내장 (2주)

```
목표: Collection Server가 OTel Collector 없이 직접 OTLP를 수신
작업:
  • gRPC 서버에 OTLP Trace/Metrics Service 등록
  • HTTP 엔드포인트에 /v1/traces, /v1/metrics 추가
  • protobuf → 내부 모델 변환 레이어
  • 기존 OTel Collector 설정 마이그레이션 가이드
결과:
  OTel Collector 제거, 앱 → Collection Server 직접 연결
```

### Phase S2: Trace Engine (2주)

```
목표: Jaeger 없이 트레이스 저장/검색
작업:
  • 인메모리 트레이스 링버퍼 (최근 10,000건)
  • SQLite traces/spans 테이블 + FTS5 인덱스
  • /api/v2/traces 검색 API (서비스, 기간, 상태 필터)
  • /api/v2/traces/{traceId} 상세 조회
  • XLog 산점도 데이터 API
  • 서비스 목록 자동 인덱스
결과:
  Jaeger 제거, 프론트엔드 Jaeger 프록시 → 직접 API 호출
```

### Phase S3: Metric Engine (3주)

```
목표: Prometheus 없이 메트릭 저장/조회
작업:
  • 인메모리 링버퍼 (최근 1시간, 원본 해상도)
  • SQLite 시계열 테이블 + 라벨 인덱스
  • 자체 쿼리 API (/api/v2/metrics/query)
  • 기본 집계 함수 (rate, sum, avg, max, min, percentile)
  • 다운샘플링 크론 (5분 → Warm, 1시간 → Cold)
  • 알림 규칙 평가 엔진 (기존 Prometheus alert rules 대체)
  • [선택] PromQL 기본 파서 (커스텀 대시보드 호환)
결과:
  Prometheus 제거, 모든 메트릭 조회가 Collection Server에서 직접 응답
```

### Phase S4: Frontend 전환 (1주)

```
목표: 프론트엔드에서 Prometheus/Jaeger 프록시 API를 v2 API로 전환
작업:
  • /proxy/prometheus/* → /api/v2/metrics/* 전환
  • /proxy/jaeger/* → /api/v2/traces/* 전환
  • useDataSource 훅에서 v2 API 우선 호출
  • 기존 프록시 API를 deprecated로 유지 (하위 호환)
결과:
  Frontend → Collection Server 단일 백엔드
```

### Phase S5: 외부 연동 (선택, 1주)

```
목표: 기존 Prometheus/Jaeger 사용자를 위한 역방향 호환
작업:
  • Prometheus Remote Write 수신 엔드포인트 (기존 Prometheus 데이터 통합)
  • OTLP Export (수집한 데이터를 외부 Jaeger/Grafana로 복제)
  • Prometheus /metrics 엔드포인트 (Collection Server 자체 메트릭 노출)
결과:
  기존 인프라와 공존 가능, 점진적 마이그레이션 지원
```

### Phase S6: PostgreSQL 백엔드 + 트랜잭션 장기 보관 (2주)

```
목표: Medium 규모 지원, 트랜잭션 30일~1년 보관
작업:
  • PostgreSQL 스토리지 어댑터 (metrics_points, traces, spans 테이블)
  • 일별 파티셔닝 자동 생성 + 만료 파티션 자동 DROP
  • JSONB GIN 인덱스 (스팬 속성 검색)
  • 보관 정책 엔진 (Critical/Slow/Normal/Health 등급별)
  • Cold Tier: Warm → S3 Parquet 아카이브 크론
  • storage.mode: auto 감지 → PostgreSQL 전환 권고 알림
결과:
  호스트 1,000대, 서비스 200개, 트랜잭션 30일 완전 보관
```

### Phase S7: 수평 확장 + ClickHouse (3주)

```
목표: Large/Enterprise 규모 — 호스트 10,000+, 초당 50만 스팬
작업:
  • Ingestion Node 분리 (Stateless, K8s Deployment)
  • Load Balancer 연동 (gRPC L4, HTTP L7)
  • ClickHouse 스토리지 어댑터 (ReplicatedMergeTree)
  • Query Router (시간 범위별 Hot/Warm/Cold 자동 분배)
  • 분산 쿼리 결과 병합 (Scatter-Gather 패턴)
  • 무중단 백엔드 마이그레이션 (dual-write + 자동 검증)
  • Helm Chart 업데이트 (클러스터 모드 values)
결과:
  호스트 10,000대, 서비스 1,000개, 초당 50만 스팬, 1년 아카이브
```

### 전체 로드맵 요약

```
S1 (2주) OTLP Receiver      ── OTel Collector 제거
S2 (2주) Trace Engine        ── Jaeger 제거
S3 (3주) Metric Engine       ── Prometheus 제거
S4 (1주) Frontend 전환       ── 프록시 API 제거
S5 (1주) 외부 연동           ── 하위 호환
─── 여기까지 v2.0 (9주) ── Small/Medium 지원 ──
S6 (2주) PostgreSQL + 보관   ── 트랜잭션 장기 보관, Medium 완성
S7 (3주) 수평 확장 + CH      ── Enterprise 규모 지원
─── 여기까지 v2.1 (14주) ── Large/Enterprise 지원 ──
```

---

## 7. 리스크 분석

### 7.1 기술 리스크

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| SQLite 동시성 한계 (단일 writer) | Small 규모 초과 시 병목 | 중 | auto 모드에서 PostgreSQL 자동 전환 권고 |
| 대규모 메트릭 카디널리티 (100만+ 시계열) | 메모리/디스크 폭증 | 중 | 카디널리티 제한 + ClickHouse 컬럼 압축 + 적응형 다운샘플링 |
| PromQL 완전 호환 불가 | 커스텀 대시보드 기능 제한 | 낮 | 핵심 함수 20개 지원 + 자체 JSON API 병행 |
| 트레이스 대량 유입 (초당 500K+) | Ingestion 노드 과부하 | 중 | 수평 확장 (Stateless Ingestion) + 적응형 샘플링 |
| 장기 트랜잭션 보관 (1년+) 디스크 | TB급 스토리지 비용 | 중 | Cold Tier Parquet 압축 (85% 절약) + S3 Lifecycle |
| 분산 쿼리 일관성 | Cluster에서 시간 범위 걸침 | 낮 | Query Router가 Hot/Warm/Cold 자동 분배 + 결과 병합 |
| PostgreSQL → ClickHouse 마이그레이션 | 대규모 전환 시 다운타임 | 낮 | Dual-write 기간 운영 → 데이터 일치 검증 → 전환 |

### 7.2 비즈니스 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| "Prometheus 호환" 마케팅 포인트 상실 | 일부 고객 저항 | Prometheus Remote Write 수신으로 기존 데이터 통합 지원 |
| 개발 기간 증가 (8~9주) | 출시 지연 | Phase별 점진적 전환, 기존 프록시 유지하며 병행 |
| 자체 엔진 안정성 미검증 | 프로덕션 장애 | 기존 Prometheus/Jaeger를 백업으로 병행 운영 후 전환 |

### 7.3 리스크 대비 전략

```
Phase 1 (S1+S2): OTLP 수신 + 트레이스 자체 저장
  → Jaeger만 먼저 제거 (가장 문제가 많은 컴포넌트)
  → Prometheus는 유지하면서 병행 운영

Phase 2 (S3): 메트릭 자체 저장
  → Prometheus를 읽기 전용으로 유지하면서 자체 엔진과 결과 비교
  → 데이터 일치 검증 후 Prometheus 제거

Phase 3 (S4+S5): 프론트엔드 전환 + 외부 연동
  → 전체 전환 완료, 필요 시 외부 시스템에 데이터 복제
```

---

## 8. 기대 효과

### 8.1 설치 간소화

```
현재 (v1.x):
  docker compose up -d  (8개 컨테이너: CS, Frontend, Postgres, MinIO,
                          OTel Collector, Prometheus, Jaeger, Loki)
  + 5개 앱별 OTEL_EXPORTER_OTLP_ENDPOINT 환경변수 설정
  + Collector ↔ Jaeger 프로토콜 맞추기
  + Prometheus scrape config 작성

제안 (v2.0):
  docker compose up -d  (3개 컨테이너: AITOP Server, Frontend, Postgres)
  + 앱에 AITOP_ENDPOINT=http://aitop:8080 하나만 설정
```

### 8.2 경쟁 우위

| 항목 | Datadog | Dynatrace | Grafana | AITOP v1 | **AITOP v2** |
|------|---------|-----------|---------|----------|:------------:|
| 설치 복잡도 | SaaS (0) | SaaS (0) | 높음 (5+) | 높음 (8) | **낮음 (3)** |
| 외부 의존성 | 0 | 0 | 4+ (AGPL) | 3 (Prom+Jaeger+OTel) | **0** |
| 데이터 hop | 2 | 2 | 3-4 | 4-5 | **2** |
| 자체 스토리지 | ✅ | ✅ | ❌ | ❌ | **✅** |
| AGPL-free | N/A | N/A | ❌ | ⚠️ | **✅ 완전** |

### 8.3 정량적 개선 — 규모별

**Small (기존 비교)**:

| 지표 | 현재 (v1.x) | 목표 (v2.0) | 개선율 |
|------|------------|-------------|--------|
| 설치 시간 | 30분+ | 5분 | **6x** |
| 컨테이너 수 | 8개 | 3개 | **63% 감소** |
| 데이터 지연 (수집→표시) | 15-30초 | <1초 | **15x+** |
| 메모리 사용량 | 4GB+ | 2GB | **50% 감소** |
| 환경변수 설정 | 5개 서비스 x 3개 | 1개 (AITOP_ENDPOINT) | **93% 감소** |
| 장애점 | 5개 (Collector, Prom, Jaeger, Proxy, Network) | 1개 (CS) | **80% 감소** |
| 트랜잭션 보관 | 인메모리 (리부팅 시 유실) | 30일 + 1년 아카이브 | **∞ 개선** |

**Large/Enterprise (신규 지원)**:

| 지표 | 목표 | 비교 (Datadog) |
|------|------|---------------|
| 최대 호스트 | 10,000+ | 동등 |
| 최대 서비스 | 1,000+ | 동등 |
| 초당 스팬 수신 | 500,000+ | 동등 |
| 초당 메트릭 포인트 | 1,000,000+ | 동등 |
| 트랜잭션 보관 (Warm) | 90일 (전체 스팬) | 15일 (Datadog 기본) |
| 트랜잭션 보관 (Cold) | 1년+ (Parquet) | 15일 (추가 비용) |
| 에러 트랜잭션 보관 | 90일 (Warm 우선 보관) | 동일 |
| 수평 확장 | Stateless Ingestion + DB 분리 | SaaS |
| 온프레미스 배포 | 완전 지원 | 미지원 (SaaS Only) |

---

## 9. 결론 및 권고

### 9.1 핵심 결론

1. **Prometheus/Jaeger는 AITOP에게 더 이상 "무료 인프라"가 아니라 "비용"이다**
   - 설정 복잡성, 프로토콜 불일치, 프록시 오버헤드, AGPL 리스크

2. **세계 최고 솔루션(Datadog, Dynatrace, WhaTap)은 모두 자체 스토리지를 보유한다**
   - 이것이 제품 완성도와 사용자 경험의 결정적 차이

3. **AITOP Collection Server는 이미 자체 저장/조회 기반이 60% 갖춰져 있다**
   - SQLite, 인메모리 캐시, S3 백엔드, REST API — 나머지 40%만 추가하면 됨

4. **OTel 수집 표준은 유지한다**
   - 앱의 OTel SDK 계측은 변경 없음. OTLP 프로토콜만 Collection Server가 직접 수신

5. **대규모 사이트를 지원하지 않으면 엔터프라이즈 시장에 진입할 수 없다**
   - 호스트 10,000대, 서비스 1,000개, 초당 50만 스팬은 글로벌 기업의 기본 요구사항
   - 플러그형 스토리지 백엔드(SQLite → PostgreSQL → ClickHouse)로 동일 코드베이스 커버

6. **트랜잭션(트레이스) 장기 보관은 규정 준수와 장애 분석의 핵심이다**
   - 금융감독원 5년, ISMS-P 1년, SOC 2 1년 — 인메모리만으로는 불가
   - 3단계 계층 스토리지(Hot/Warm/Cold) + 스마트 보관 정책으로 비용 최적화

### 9.2 권고사항

```
★ 강력 권고: 자체 스토리지 엔진 개발 착수

이유:
  1. 현재 데모 환경의 연동 실패 대부분이 중간 레이어(OTel Collector, Jaeger)에서 발생
  2. 상용 솔루션과 동일한 수준의 "설치 한 줄, 설정 최소화" 경험 필요
  3. AGPL-free 완전 보장 (Tempo, Loki 의존 완전 제거)
  4. 데이터 흐름 단순화로 디버깅·유지보수 비용 대폭 절감

접근 방식:
  → Jaeger 먼저 제거 (트레이스 자체 저장 — 2주)
  → OTel Collector 제거 (OTLP 직접 수신 — 2주)
  → Prometheus 마지막 제거 (메트릭 자체 저장 — 3주)
  → 총 8~9주, 기존 시스템과 병행하며 점진적 전환
```

### 9.3 OTel 표준과의 관계

```
유지하는 것:
  ✅ OTel SDK (앱에서의 계측) — 변경 없음
  ✅ OTLP 프로토콜 (데이터 전송 포맷) — 변경 없음
  ✅ W3C TraceContext (분산 추적 컨텍스트) — 변경 없음
  ✅ OTel Semantic Conventions (속성 명명 규칙) — 변경 없음

제거하는 것:
  ❌ OTel Collector (중간 허브) → Collection Server가 직접 수신
  ❌ Prometheus (메트릭 저장) → 자체 Metric Engine
  ❌ Jaeger (트레이스 저장) → 자체 Trace Engine
  ❌ Tempo/Loki (AGPL 컴포넌트) → 완전 제거

결론: OTel "표준"은 100% 유지. OTel "인프라"만 자체 구현으로 교체.
```

---

## 부록 A: 기술 스택 비교

| 영역 | 현재 (v1.x) | 제안 v2.0 (Small) | 제안 v2.1 (Enterprise) |
|------|------------|-------------------|----------------------|
| OTLP 수신 | OTel Collector (별도) | CS 내장 | CS Ingestion Node (N대) |
| 메트릭 저장 | Prometheus (별도) | 인메모리 + SQLite | 인메모리 + ClickHouse |
| 트레이스 저장 | Jaeger (별도) | 인메모리 + SQLite | 인메모리 + ClickHouse |
| 트랜잭션 보관 | 인메모리 (유실) | 30일 SQLite + 1년 S3 | 90일 PostgreSQL/CH + 무제한 S3 |
| 로그 저장 | Loki (AGPL) | SQLite + 파일 | ClickHouse + S3 |
| 메타데이터 | SQLite (내장) | SQLite (변경 없음) | PostgreSQL |
| Cold 아카이브 | 없음 | S3 Parquet (1년) | S3 Parquet (5년+) |
| 쿼리 | PromQL (외부 의존) | 자체 JSON API + PromQL 기본 | 분산 Query Router |
| 수평 확장 | 불가 | 단일 노드 | Stateless Ingestion + DB 분리 |
| 최대 호스트 | ~100 (실질) | ~1,000 | 10,000+ |
| 최대 스팬/sec | ~5,000 | ~50,000 | 500,000+ |

## 부록 B: 스토리지 백엔드 성능 비교

### B.1 규모별 권장 백엔드

| 규모 | 백엔드 | 배포 복잡도 | 라이선스 |
|------|--------|-----------|---------|
| **Small** (~100 호스트) | SQLite WAL | 제로 (내장) | Public Domain |
| **Medium** (~1,000 호스트) | PostgreSQL 16 | 컨테이너 1개 추가 | PostgreSQL License |
| **Large** (~5,000 호스트) | PostgreSQL + TimescaleDB | 컨테이너 1개 (확장) | Apache 2.0 (Community) |
| **Enterprise** (10,000+ 호스트) | ClickHouse | 3+ 노드 클러스터 | Apache 2.0 |

### B.2 벤치마크 수치

**쓰기 (INSERT) 성능**:

| 백엔드 | 메트릭 포인트/sec | 스팬/sec | 비고 |
|--------|-----------------|---------|------|
| SQLite WAL | 50,000 | 30,000 | 단일 writer, 배치 1000건 |
| PostgreSQL (COPY) | 300,000 | 200,000 | COPY 배치, 비동기 커밋 |
| PostgreSQL + TimescaleDB | 500,000 | 350,000 | 하이퍼테이블, 압축 비동기 |
| ClickHouse | 2,000,000+ | 1,500,000+ | 컬럼 스토어, 배치 INSERT |

**읽기 (SELECT) 성능**:

| 백엔드 | 시계열 범위 조회 | 트레이스 검색 | 집계 쿼리 |
|--------|---------------|-------------|----------|
| SQLite | 100K rows/sec | 10K qps (FTS5) | 50K rows/sec |
| PostgreSQL | 500K rows/sec | 30K qps (GIN) | 200K rows/sec |
| TimescaleDB | 1M rows/sec | 30K qps | 500K rows/sec (연속 집계) |
| ClickHouse | 10M+ rows/sec | 100K+ qps | 5M+ rows/sec |

**디스크 사용량** (시계열 100K, 30일 기준):

| 백엔드 | Raw 크기 | 압축 후 | 압축률 |
|--------|---------|--------|--------|
| SQLite | 12 GB | 12 GB (압축 없음) | 0% |
| PostgreSQL | 12 GB | 8 GB (TOAST) | 33% |
| TimescaleDB | 12 GB | 3 GB (네이티브 압축) | 75% |
| ClickHouse | 12 GB | 1.5 GB (LZ4+Delta) | 87% |

### B.3 마이그레이션 경로

```
SQLite (시작) → PostgreSQL (성장) → ClickHouse (대규모)

마이그레이션 방법:
  1. 설정 파일에서 storage.mode 변경
  2. 새 백엔드에 스키마 자동 생성 (AITOP 내장 마이그레이터)
  3. dual-write 기간 (1~7일) — 양쪽에 동시 기록
  4. 데이터 일치 검증 자동 실행
  5. 이전 백엔드 읽기 전용 전환
  6. 보관 기간 경과 후 이전 백엔드 제거

다운타임: 0 (무중단 마이그레이션)
```

## 부록 C: 트랜잭션 보관 정책 상세

### C.1 보관 등급

| 등급 | 대상 | Warm 보관 | Cold 보관 | 근거 |
|------|------|----------|----------|------|
| **Critical** | 에러 트레이스 (status=ERROR) | 90일 | 1년 | 장애 사후 분석, SLA 검증 |
| **Slow** | 느린 트레이스 (P99 초과) | 60일 | 1년 | 성능 병목 추적 |
| **Normal** | 정상 트레이스 | 30일 | 180일 | 트렌드 분석, 베이스라인 |
| **Health** | 헬스체크, ping | 7일 | — | 노이즈, 장기 보관 불필요 |

### C.2 스마트 보관 (Intelligent Retention)

일반적인 TTL 삭제와 달리, AITOP은 **트랜잭션 가치 기반** 보관을 적용합니다:

```
보관 가치 점수 = 에러 여부(×10) + 느린 여부(×5) + 서비스 중요도(×3) + 스팬 수(×1)

점수 > 15 → Critical 등급 (90일 Warm)
점수 > 8  → Slow 등급 (60일 Warm)
점수 > 3  → Normal 등급 (30일 Warm)
점수 ≤ 3  → Health 등급 (7일 Warm)
```

이를 통해 **동일한 디스크 용량에서 중요한 트랜잭션을 더 오래 보관**합니다. Datadog은 모든 트레이스를 동일하게 15일 보관하지만, AITOP은 에러 트레이스를 6배(90일) 더 오래 보관합니다.

### C.3 규정 준수 매핑

| 규정 | 요구 보관 기간 | AITOP 대응 |
|------|-------------|-----------|
| 금융감독원 전자금융감독규정 | 거래 기록 5년 | Cold Tier S3 (Parquet, 5년 Lifecycle) |
| ISMS-P | 로그 최소 1년 | Cold Tier 기본 365일 |
| PCI DSS | 감사 추적 1년 | Cold Tier + Audit Trail |
| GDPR | 개인정보 최소 보관 | 속성 마스킹 + Selective Purge |
| SOC 2 | 모니터링 데이터 보관 | Warm 90일 + Cold 1년 |

---

> **이 문서는 아키텍처 검토 결과이며, 최종 결정은 프로덕트 로드맵과 리소스 상황을 고려하여 결정합니다.**
