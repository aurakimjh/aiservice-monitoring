# AITOP 아키텍처 검토 — Prometheus/Jaeger 제거 및 자체 스토리지 전환 검토

> **문서 유형**: 아키텍처 검토서 (Architecture Decision Review)
> **작성일**: 2026-03-29
> **작성자**: Architecture Review
> **기밀 등급**: Internal
> **관련 문서**: [ARCHITECTURE.md](./ARCHITECTURE.md), [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md), [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md)

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

### 1.2 검토 질문

> **"Prometheus와 Jaeger 없이, OTel 수집은 유지하되 저장·조회를 자체 구현할 수 있는가?"**

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

### 3.1 목표 아키텍처

```
╔══════════════════════════════════════════════════════════════════════╗
║                    AITOP v2.0 — Self-Contained Architecture         ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─── 계측 레이어 (변경 없음) ──────────────────────────────────┐   ║
║  │  [Python] [Node.js] [Go] [Java] [.NET]                        │   ║
║  │  OTel SDK → OTLP (gRPC :4317 / HTTP :4318)                   │   ║
║  └────────────────────────┬──────────────────────────────────────┘   ║
║                           │                                           ║
║  ┌────────────────────────▼──────────────────────────────────────┐   ║
║  │              AITOP Collection Server v2.0                      │   ║
║  │                                                                │   ║
║  │  ┌──────────────────────────────────────────────────────────┐ │   ║
║  │  │  OTLP Receiver (내장)                                     │ │   ║
║  │  │  gRPC :4317 + HTTP :4318 직접 수신                        │ │   ║
║  │  │  → OTel Collector 제거, Collection Server가 직접 수신     │ │   ║
║  │  └────────────────┬─────────────────┬───────────────────────┘ │   ║
║  │                   │                 │                          │   ║
║  │  ┌────────────────▼──┐  ┌──────────▼──────────┐              │   ║
║  │  │ Metric Engine     │  │ Trace Engine         │              │   ║
║  │  │                   │  │                      │              │   ║
║  │  │ • 인메모리 링버퍼  │  │ • 인메모리 링버퍼     │              │   ║
║  │  │   (최근 1시간)    │  │   (최근 10,000건)    │              │   ║
║  │  │ • SQLite WAL      │  │ • SQLite FTS5        │              │   ║
║  │  │   (7일 보관)      │  │   (7일 보관)         │              │   ║
║  │  │ • 다운샘플링       │  │ • Bloom 인덱스       │              │   ║
║  │  │   (30일+)        │  │   (서비스별)         │              │   ║
║  │  │ • 자체 쿼리 엔진   │  │ • 자체 검색 엔진     │              │   ║
║  │  └───────────────────┘  └─────────────────────┘              │   ║
║  │                                                                │   ║
║  │  ┌──────────────────────────────────────────────────────────┐ │   ║
║  │  │ 기존 기능 유지                                            │ │   ║
║  │  │ Fleet, Agent, Evidence, Batch, Profiling, Diagnostics    │ │   ║
║  │  └──────────────────────────────────────────────────────────┘ │   ║
║  │                                                                │   ║
║  │  REST API (:8080)  ← Frontend 직접 호출 (프록시 불필요)       │   ║
║  └──────────────────────────────┬────────────────────────────────┘   ║
║                                 │                                     ║
║  ┌──────────────────────────────▼────────────────────────────────┐   ║
║  │              AITOP Frontend (Next.js)                          │   ║
║  │  Collection Server API만 호출 — 단일 백엔드                    │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
║                                                                      ║
║  [선택] 외부 연동 (필요 시에만)                                       ║
║  • Prometheus Remote Write 수신 → 기존 Prometheus 데이터 통합       ║
║  • OTLP Export → 기존 Jaeger/Grafana에 데이터 복제                  ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
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

### 4.1 Metric Engine (Prometheus 대체)

**저장 전략**: 3단계 계층 스토리지

```
┌─────────────────────────────────────────────────────────┐
│ Hot Tier (인메모리 링버퍼)                                │
│ • 최근 1시간 데이터                                       │
│ • 원본 해상도 (1초~15초 간격)                              │
│ • 대시보드 실시간 조회용                                    │
│ • Go map + sync.RWMutex                                   │
│ • 메모리 사용량: ~500MB (메트릭 10,000개 기준)              │
├─────────────────────────────────────────────────────────┤
│ Warm Tier (SQLite WAL)                                    │
│ • 7일 보관                                                │
│ • 5분 다운샘플링 (avg/min/max/count)                       │
│ • 히스토리 조회, 알림 평가용                                │
│ • SQLite FTS5 인덱스 (라벨 검색)                           │
│ • 디스크 사용량: ~2GB (7일 기준)                            │
├─────────────────────────────────────────────────────────┤
│ Cold Tier (S3/Local 아카이브) — 선택                       │
│ • 30일+ 보관                                              │
│ • 1시간 다운샘플링                                         │
│ • 규정 준수, 장기 트렌드 분석용                             │
│ • Parquet 포맷으로 압축 저장                               │
└─────────────────────────────────────────────────────────┘
```

**쿼리 엔진**: PromQL 호환이 아닌 **자체 쿼리 API**

```
기존 PromQL:
  rate(http_requests_total{service="java-demo-app"}[5m])

제안 자체 API:
  GET /api/v2/metrics/query
  {
    "metric": "http_requests_total",
    "filters": { "service": "java-demo-app" },
    "aggregation": "rate",
    "window": "5m",
    "range": { "from": "-1h", "to": "now" }
  }
```

**장점**: 프론트엔드가 PromQL을 알 필요 없음. JSON API로 직관적 조회.
**PromQL 호환 레이어**: 커스텀 대시보드에서 PromQL 입력을 허용하는 경우를 위해 기본 PromQL 파서를 내장 (rate, sum, avg, histogram_quantile 등 핵심 함수만 지원).

### 4.2 Trace Engine (Jaeger 대체)

**저장 전략**: 서비스별 인덱스 + 링버퍼

```
┌─────────────────────────────────────────────────────────┐
│ 인메모리 (최근 10,000건 트레이스)                          │
│ • 서비스별 역인덱스 (service → traceID 매핑)               │
│ • 트레이스 ID → Span 목록 (HashMap)                       │
│ • XLog 산점도용 (timestamp, duration, status) 별도 캐시    │
│ • 메모리: ~1GB (span 평균 500B × 10,000 traces × 10 spans) │
├─────────────────────────────────────────────────────────┤
│ SQLite (7일 보관)                                         │
│ • traces 테이블 (trace_id, service, root_span, duration)  │
│ • spans 테이블 (span_id, trace_id, parent_id, attrs JSON) │
│ • FTS5 인덱스 (서비스명, 엔드포인트, 상태)                  │
│ • 디스크: ~5GB (7일, 일 100만 트레이스 기준)               │
└─────────────────────────────────────────────────────────┘
```

**검색 API**:

```
GET /api/v2/traces
{
  "service": "java-demo-app",
  "operation": "/api/users",
  "status": "error",
  "min_duration": "500ms",
  "max_duration": "5s",
  "range": { "from": "-1h", "to": "now" },
  "limit": 50
}
```

### 4.3 OTLP Receiver (OTel Collector 대체)

Collection Server에 OTLP gRPC/HTTP 리시버를 내장합니다.

```go
// 핵심 구현 — Go의 OTel SDK를 활용한 OTLP 수신
import (
    "go.opentelemetry.io/collector/receiver/otlpreceiver"
    // 또는 직접 protobuf 디코딩:
    "go.opentelemetry.io/proto/otlp/collector/trace/v1"
    "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
)
```

**두 가지 구현 옵션**:

| 옵션 | 장점 | 단점 |
|------|------|------|
| **A. OTel Collector SDK 임베딩** | 검증된 코드, 프로세서 재사용 가능 | 의존성 크기 증가 (~50MB) |
| **B. OTLP protobuf 직접 디코딩** | 경량, 완전 제어 | gRPC 서버 직접 구현 필요 |

**권장: 옵션 B** — AITOP은 커스텀 솔루션이므로, OTel Collector의 범용 기능(tail sampling, transform 등)은 필요하지 않습니다. OTLP protobuf만 디코딩하여 자체 엔진에 저장하면 됩니다.

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

---

## 7. 리스크 분석

### 7.1 기술 리스크

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| SQLite 동시성 한계 (단일 writer) | 고부하 시 쓰기 병목 | 중 | WAL 모드 + 배치 쓰기 + 인메모리 버퍼 선행 |
| 대규모 메트릭 (10만+ 시계열) | 메모리 부족 | 중 | 카디널리티 제한 + 다운샘플링 정책 |
| PromQL 완전 호환 불가 | 커스텀 대시보드 기능 제한 | 낮 | 핵심 함수 20개만 지원, 나머지는 자체 API |
| 트레이스 대량 유입 (초당 10,000+) | 인메모리 부족 | 낮 | 링버퍼 크기 조절 + 샘플링 적용 |

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

### 8.3 정량적 개선

| 지표 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| 설치 시간 | 30분+ | 5분 | **6x** |
| 컨테이너 수 | 8개 | 3개 | **63% 감소** |
| 데이터 지연 (수집→표시) | 15-30초 | 1-3초 | **10x** |
| 메모리 사용량 | 4GB+ | 1.5GB | **63% 감소** |
| 환경변수 설정 | 5개 서비스 x 3개 | 1개 (AITOP_ENDPOINT) | **93% 감소** |
| 장애점 | 5개 (Collector, Prom, Jaeger, Proxy, Network) | 1개 (CS) | **80% 감소** |

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

| 영역 | 현재 (v1.x) | 제안 (v2.0) |
|------|------------|-------------|
| OTLP 수신 | OTel Collector (별도 컨테이너) | Collection Server 내장 |
| 메트릭 저장 | Prometheus (별도 컨테이너) | 인메모리 링버퍼 + SQLite |
| 트레이스 저장 | Jaeger (별도 컨테이너) | 인메모리 링버퍼 + SQLite |
| 로그 저장 | Loki (AGPL, 별도 컨테이너) | SQLite + 파일 로테이션 |
| 메타데이터 | SQLite (Collection Server 내장) | SQLite (변경 없음) |
| 에비던스 | S3/Local (기존) | S3/Local (변경 없음) |
| 프론트엔드 | Next.js (기존) | Next.js (API 호출 대상만 변경) |
| 쿼리 언어 | PromQL (Prometheus 의존) | 자체 JSON API + PromQL 기본 호환 |

## 부록 B: SQLite 성능 근거

| 시나리오 | SQLite WAL 성능 | 요구 성능 | 여유율 |
|---------|----------------|----------|--------|
| INSERT (메트릭 포인트) | 50,000 rows/sec | 10,000 points/sec | 5x |
| INSERT (스팬) | 30,000 rows/sec | 5,000 spans/sec | 6x |
| SELECT (시계열 범위) | 100,000 rows/sec | 10,000 points/query | 10x |
| FTS5 검색 (트레이스) | 10,000 queries/sec | 100 queries/sec | 100x |

> SQLite는 단일 서버 환경에서 놀라운 성능을 제공합니다.
> AITOP의 목표 규모(호스트 100대, 서비스 50개)에서 충분합니다.
> 1,000대 이상 규모에서는 PostgreSQL 또는 ClickHouse로 전환하는 마이그레이션 경로를 제공합니다.

---

> **이 문서는 아키텍처 검토 결과이며, 최종 결정은 프로덕트 로드맵과 리소스 상황을 고려하여 결정합니다.**
