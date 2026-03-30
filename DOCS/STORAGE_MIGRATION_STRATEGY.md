# AITOP 스토리지 전환 전략 (Storage Migration Strategy)

> **문서 유형**: 기술 전환 전략서 (Technical Migration Strategy)
> **작성일**: 2026-03-30
> **버전**: v1.0-draft
> **관련 문서**: [ARCHITECTURE_REVIEW_v2.md](./ARCHITECTURE_REVIEW_v2.md), [WORK_STATUS.md](../WORK_STATUS.md), [V1_RELEASE_CRITERIA.md](./V1_RELEASE_CRITERIA.md)
>
> **목적**: Prometheus/Jaeger 의존 구조에서 AITOP 자체 스토리지 엔진으로의 안전한 전환 전략 정의.
> WS-1 코드 작업 착수 전 이 문서를 확정하여 전환 리스크를 사전 통제한다.
>
> **근거**: WS-8.5 (REVIEW_OPINIONS §4.1) — "전환 실패 시 제품 신뢰도 전체가 흔들리는 가장 큰 기술 전환 리스크"

---

## 1. 전환 개요

### 1.1 전환 배경

현재 AITOP v0.9는 다음 외부 시스템에 의존한다.

```
[현재 구조 — As-Is]
Agent → OTel Collector → Prometheus (메트릭)
                       → Jaeger     (트레이스)
                       → AITOP API  (집계/시각화)

문제점:
- 8개 컨테이너 → 설치 복잡도 증가
- 데이터 지연 15~30초 (Prom 스크래핑 주기)
- 외부 AGPL 라이선스 의존 (Jaeger)
- 자체 알림/보관 정책 제어 불가
```

```
[목표 구조 — To-Be]
Agent → AITOP Collection Server (OTLP gRPC/HTTP 직접 수신)
                               ├── 자체 Trace Engine (SQLite/Hot Memory)
                               └── 자체 Metric Engine (SQLite/Hot Memory)
                                        ↓
                               AITOP API (집계/시각화/알림)

개선 효과:
- 3개 컨테이너로 단순화
- 데이터 지연 < 1초 (직접 수신)
- 완전 자체 스택 (AGPL-free)
- 보관 정책/샘플링/알림 완전 제어
```

### 1.2 전환 범위

| 구성요소 | 현재 | 전환 후 | 전환 방식 |
|---------|------|--------|---------|
| 트레이스 저장소 | Jaeger (Badger/ES) | AITOP Trace Engine (SQLite) | Dual-write → 切替 |
| 메트릭 저장소 | Prometheus (TSDB) | AITOP Metric Engine (SQLite) | Dual-write → 切替 |
| 수집 파이프라인 | OTel Collector | AITOP OTLP Receiver | 병렬 운영 → 切替 |
| 쿼리 API | `/proxy/jaeger/*`, `/proxy/prometheus/*` | `/api/v2/traces/*`, `/api/v2/metrics/*` | 점진적 전환 |
| 알림 엔진 | Prometheus Alert Rules | AITOP Alert Engine | 병렬 검증 → 切替 |

### 1.3 전환 불변 원칙 (Non-Negotiables)

1. **데이터 손실 0**: 전환 과정에서 수집 데이터가 소실되어서는 안 된다.
2. **무중단 전환**: 고객 환경에서 모니터링 공백 없이 전환해야 한다.
3. **즉시 롤백 가능**: 문제 발생 시 10분 내 기존 구조로 복귀할 수 있어야 한다.
4. **수치 검증 선행**: 자체 스토리지의 수치가 Prom/Jaeger와 ±5% 이내 일치한 후 切替한다.

---

## 2. Dual-Write 전략 (R-19)

### 2.1 Dual-Write 단계 정의

```
Phase A — 병렬 수집 (기존 유지 + 자체 엔진 수신 시작)
┌─────────────────────────────────────────────────────┐
│  Agent ──→ OTel Collector ──→ Prometheus (기존 유지) │
│         └──→ AITOP OTLP Receiver ──→ 자체 Engine    │ ← 신규 추가
│                                                      │
│  UI: 기존 /proxy/prometheus, /proxy/jaeger 사용 유지 │
└─────────────────────────────────────────────────────┘
목적: 자체 엔진 안정성 검증, 수치 일치율 확인
기간: WS-1.1~1.3 완료 후 최소 2주

Phase B — 쿼리 병행 (UI가 양쪽 소스 모두 조회)
┌─────────────────────────────────────────────────────┐
│  기존 파이프라인 유지                                  │
│  자체 엔진도 수신 중                                   │
│  UI: /api/v2/* 우선 호출, 실패 시 /proxy/* 폴백        │ ← WS-1.4
└─────────────────────────────────────────────────────┘
목적: UI 기능 호환성 검증 + 수치 diff 실시간 확인
기간: 2주 이상 (수치 안정 확인 후 Phase C 진입)

Phase C — 切替 (자체 엔진 단독 운영)
┌─────────────────────────────────────────────────────┐
│  OTel Collector / Prometheus / Jaeger 비활성화         │
│  AITOP OTLP Receiver 단독 수신                        │
│  UI: /api/v2/* 단독 사용                               │
└─────────────────────────────────────────────────────┘
목적: 외부 의존성 완전 제거
조건: 수치 diff 기준 충족 + 2주 무장애 운영 확인 후
```

### 2.2 Dual-Write 운영 기준

| 항목 | 기준 | 비고 |
|------|------|------|
| Dual-Write 최소 운영 기간 | Phase A: 2주 이상 | 짧으면 데이터 패턴 미검증 |
| Phase B 진입 조건 | 수치 diff < ±5% (7일 연속) | 섹션 3 참조 |
| Phase C 진입 조건 | 수치 diff < ±5% (14일 연속) + UI 기능 100% 검증 | |
| 야간/주말 切替 금지 | 모니터링 인원 배치 필수 | |
| 切替 공지 | 고객 환경 최소 72시간 전 공지 | Enterprise 계약 기준 |

### 2.3 Fallback 전략

| 상황 | Fallback 조치 | 소요 시간 |
|------|-------------|---------|
| Phase A: 자체 엔진 수신 실패 | 자체 엔진 비활성화, 기존 유지 | 즉시 (설정 플래그) |
| Phase B: /api/v2 쿼리 실패 | UI 자동 폴백 → /proxy/* | 자동 (useFallback 훅) |
| Phase C 切替 후 이상 탐지 | Phase B로 즉시 복귀 (OTel Collector 재기동) | < 10분 |
| Phase C 切替 후 데이터 이상 | Phase A로 복귀 + 원인 분석 | < 30분 |

### 2.4 Rollback 조건 및 절차

**자동 롤백 트리거** (시스템이 자동 감지):
- API P95 응답시간 > 기준치 200% 초과 (1분 지속)
- 오류율 > 5% (5분 지속)
- 메모리 사용량 > 설정 임계값 90%

**수동 롤백 절차**:
```bash
# Phase C → Phase B 롤백 (OTel Collector 재활성화)
kubectl set env deployment/aitop-server STORAGE_MODE=dual-write
kubectl rollout restart deployment/otel-collector
kubectl rollout restart deployment/prometheus

# 확인: 기존 /proxy/prometheus 응답 확인
curl -s http://aitop-server/proxy/prometheus/api/v1/query?query=up

# Phase B → Phase A 롤백 (자체 엔진 수신 비활성화)
kubectl set env deployment/aitop-server OTLP_RECEIVER_ENABLED=false
```

---

## 3. 데이터 정합성 검증 (R-20)

### 3.1 검증 항목

| 검증 항목 | 비교 방법 | 허용 오차 | 검증 주기 |
|---------|---------|:--------:|---------|
| **메트릭 값 일치율** | 동일 타임스탬프 + 레이블 기준 Prom vs. 자체 | ±5% | 1시간마다 자동 |
| **트레이스 건수** | 동일 시간대 서비스별 span count | ±1% | 1시간마다 자동 |
| **에러율 수치** | 동일 쿼리 기준 에러율 | ±3%p | 실시간 비교 |
| **P95 응답시간** | 동일 서비스 + 동일 시간대 | ±10% | 1시간마다 자동 |
| **알림 발생 시점** | Prom vs. 자체 알림 엔진 트리거 시간 | ±30초 | 알림 발생 시마다 |
| **레이블/태그 일치** | 필수 레이블 누락 여부 | 누락 0건 | 수집 시마다 샘플링 |

### 3.2 쿼리 결과 Diff 허용 범위

> 허용 범위는 "전환 진행 가능" 기준이며, 범위 초과 시 원인 분석 후 切替 결정.

```
메트릭 수치 diff 허용 범위:
───────────────────────────────────────────────
  즉각 수치 (rate, gauge):     ±5%
  누적 수치 (counter sum):     ±2%
  히스토그램 버킷 분포:         ±10%
  P95/P99 레이턴시:            ±10%

트레이스 수치 diff 허용 범위:
───────────────────────────────────────────────
  건수 (span count):           ±1%
  에러율:                       ±3%p
  평균 응답시간:                ±10%

허용 범위 초과 시 처리:
  1. 원인 분류 (수집 경로 차이 / 집계 로직 차이 / 타임스탬프 오차)
  2. 수집 경로 차이: Agent 설정 검토
  3. 집계 로직 차이: 쿼리 엔진 버그 수정
  4. 해소 불가 시: Phase C 진입 차단, 분석 지속
```

### 3.3 검증 자동화 도구

| 도구 | 역할 | 구현 방식 |
|------|------|---------|
| `cmd/diff-checker` | Prom vs. 자체 메트릭 수치 비교 배치 | Go CLI, 1시간 주기 크론 |
| `cmd/trace-counter` | Jaeger vs. 자체 트레이스 건수 비교 | Go CLI, 1시간 주기 크론 |
| Diff 대시보드 | `/internal/migration-status` 페이지 | 관리자 전용 UI |
| Slack/알림 | diff 기준 초과 시 자동 알림 | 기존 알림 엔진 활용 |

---

## 4. 고객 환경별 Migration Playbook (R-21)

### 4.1 환경 분류

| 환경 유형 | 특징 | 전환 전략 | 예상 기간 |
|---------|------|---------|---------|
| **Lite (단일 서버, Docker Compose)** | 소규모, 1~10개 서비스 | 점검 시간에 일괄 전환 | 1시간 내 |
| **Standard (단일 서버, Helm)** | 중소규모, 10~100개 서비스 | Dual-write 2주 후 切替 | 2~3주 |
| **Enterprise (멀티 노드, K8s)** | 대규모, 100개+ 서비스 | Dual-write 4주 + 단계적 切替 | 4~6주 |
| **Air-gap (폐쇄망)** | 인터넷 미연결 | 오프라인 패키지 + 수동 절차 | 별도 협의 |

### 4.2 Lite 환경 Playbook (Docker Compose)

```bash
# Step 1: 백업 (5분)
docker exec aitop-server sqlite3 /data/aitop.db ".backup /backup/aitop-$(date +%Y%m%d).db"

# Step 2: v1.0 이미지로 업데이트 (2분)
docker-compose pull
docker-compose up -d aitop-server

# Step 3: 자체 엔진 활성화 확인 (1분)
curl http://localhost:8080/health/ready
curl http://localhost:8080/api/v2/metrics/query?metric=up

# Step 4: 기존 OTel Collector/Prometheus 비활성화 (1분)
docker-compose stop otel-collector prometheus jaeger

# Step 5: 데이터 확인 (10분)
# UI에서 최근 1시간 데이터 표시 확인

# 롤백 (필요 시)
docker-compose start otel-collector prometheus jaeger
docker-compose restart aitop-server  # 이전 이미지로 재기동
```

**Lite 체크리스트**:
- [ ] 전환 전 SQLite DB 백업 완료
- [ ] v1.0 이미지 pull 완료
- [ ] `/health/ready` 정상 응답 확인
- [ ] `/api/v2/metrics` 데이터 조회 확인
- [ ] 실시간 대시보드 정상 표시 확인
- [ ] 구 컨테이너 비활성화 완료

### 4.3 Standard 환경 Playbook (Helm + K8s)

```yaml
# values-migration.yaml — Phase A: Dual-write 활성화
aitop:
  storage:
    mode: dual-write          # "legacy" | "dual-write" | "native"
    legacy:
      prometheus:
        enabled: true
        endpoint: http://prometheus:9090
      jaeger:
        enabled: true
        endpoint: http://jaeger:16686
    native:
      enabled: true
      traceEngine:
        hot:  100000          # 인메모리 트레이스 건수
        warm: 30              # SQLite Warm 보관 일수
      metricEngine:
        hot:  4h              # 인메모리 시계열 보관 시간
        warm: 90              # SQLite Warm 보관 일수
```

```bash
# Phase A 활성화
helm upgrade aitop ./charts/aitop -f values-migration.yaml

# 2주 후 수치 diff 확인
kubectl exec -it aitop-server-xxx -- /app/diff-checker --days 14

# Phase B: UI 전환 (폴백 포함)
# values 수정: ui.apiVersion: v2 + ui.fallbackToLegacy: true
helm upgrade aitop ./charts/aitop -f values-phase-b.yaml

# Phase C: 切替 (14일 연속 기준 충족 후)
# values 수정: storage.mode: native + legacy.enabled: false
helm upgrade aitop ./charts/aitop -f values-phase-c.yaml

# 기존 컴포넌트 제거
helm uninstall prometheus jaeger otel-collector
```

**Standard 체크리스트**:
- [ ] Phase A: Dual-write 활성화 + 2주 수치 모니터링
- [ ] Phase A 종료 기준: diff < ±5% (7일 연속) 확인
- [ ] Phase B: UI 전환 + /api/v2 기능 전체 검증
- [ ] Phase C 진입 기준: diff < ±5% (14일 연속) 확인
- [ ] Phase C: 切替 완료 + 구 컴포넌트 제거
- [ ] 전환 완료 보고서 작성

### 4.4 Enterprise 환경 추가 고려사항

| 항목 | 권고사항 |
|------|---------|
| 롤아웃 순서 | 스테이징 → 일부 프로덕션 네임스페이스 → 전체 |
| 알림 규칙 마이그레이션 | Prometheus Alert Rules → AITOP Alert Engine 동등 검증 필수 |
| 장기 보관 데이터 | Prometheus TSDB 히스토리 → AITOP Cold Tier 아카이브 마이그레이션 툴 필요 |
| Grafana 대시보드 | PromQL → AITOP Query API 변환 레이어 제공 (WS-1.3 S3-7) |
| SLA 협의 | 전환 기간 SLA 유예 조건 계약에 명시 |
| 전환 승인 | 고객사 기술 책임자 서면 승인 후 Phase C 진입 |

---

## 5. 성능 테스트 시나리오 (R-22)

### 5.1 전환 전 성능 베이스라인 측정

> WS-1 착수 전 현재 구조(Prom/Jaeger 기반)의 성능 베이스라인을 측정해 두어야 한다.
> 전환 후 수치와 비교하여 성능 개선 여부를 검증한다.

| 측정 항목 | 현재 구조 (베이스라인) | 자체 엔진 (목표) | 측정 도구 |
|---------|:------------------:|:--------------:|---------|
| 수집→표시 지연 | ~15~30초 | < 1초 | E2E 타임스탬프 비교 |
| Ingest Throughput | 미측정 | ≥ 10,000 spans/sec | k6 |
| API P95 응답시간 | 미측정 | < 500ms | k6 |
| 전체 컨테이너 메모리 | ~4~6GB (8컨테이너) | < 2GB (3컨테이너) | docker stats |

### 5.2 부하 테스트 시나리오

**시나리오 1: 정상 부하 지속 (기준 검증)**
```
목적: 기준 부하에서 성능 기준 충족 여부 확인
설정: 50개 서비스 × 4개 인스턴스 = 200 에이전트
부하: 5,000 spans/sec + 20,000 metrics/sec
지속: 30분
확인: P95 응답시간, CPU/메모리, 데이터 완전성
```

**시나리오 2: 피크 부하 (최대 처리량 검증)**
```
목적: 최대 처리량 한계 확인
설정: 단계적 부하 증가 (1,000 → 5,000 → 10,000 → 20,000 spans/sec)
지속: 각 단계 10분
확인: 처리량 한계, 오버플로우 샘플링 동작, 에러율
```

**시나리오 3: 급격한 부하 스파이크**
```
목적: 스파이크 시 안정성 확인
설정: 정상 부하(5,000) → 순간 스파이크(50,000) → 정상 복귀
지속: 스파이크 1분
확인: 버퍼 오버플로우 처리, 복귀 후 정상 수집 재개
```

**시나리오 4: 72시간 연속 운전 (안정성 검증)**
```
목적: 메모리 누수, 파일 디스크립터 누수, 성능 저하 확인
설정: 정상 부하 × 72시간 지속
확인: 12시간마다 pprof heap snapshot 비교, API 응답시간 추이
합격 기준: 메모리 증가 < 10MB/day, P95 ±10% 이내 유지
```

**시나리오 5: 재시작/페일오버 (복구 검증)**
```
목적: 재시작 후 수집 복귀 및 데이터 손실 검증
설정: 정상 부하 중 서버 재시작 (SIGTERM → 30초 후 SIGKILL)
확인: 재시작 후 30초 내 수집 재개, 재시작 전후 데이터 연속성
합격 기준: 손실 건수 < 전체의 0.1%
```

### 5.3 장애 시 복구 절차

#### 장애 유형별 대응 매트릭스

| 장애 유형 | 감지 방법 | 즉시 조치 | 복구 절차 |
|---------|---------|---------|---------|
| **Collection Server OOM** | k8s OOMKilled 이벤트 | 자동 재시작 (k8s restartPolicy) | 인메모리 데이터 손실 허용, SQLite 데이터는 보존 |
| **SQLite 파일 손상** | 쓰기 에러 로그 | 수신 일시 정지 | 최신 백업으로 복원 → 재시작 |
| **디스크 풀** | `/health/ready` FAIL | 수신 거부 응답 | 오래된 데이터 아카이브 → 공간 확보 → 재시작 |
| **Agent 연결 폭주** | 연결 수 임계값 초과 | Rate Limiting 자동 적용 | 설정 파일 max-connections 조정 |
| **메모리 링버퍼 오버플로우** | 샘플링률 지표 급등 | 샘플링 정책 자동 조임 | 부하 원인 파악 → 서비스 스케일 아웃 |
| **데이터 수치 급격한 차이** | diff-checker 알림 | Dual-write 모드 유지 | 원인 분석 → 수정 → 재검증 |

#### 복구 우선순위 (장애 등급별)

```
P0 — 수집 완전 중단 (목표 복구 시간: 5분 이내)
  1. 서버 프로세스 상태 확인 (kubectl get pods)
  2. 최근 로그 확인 (kubectl logs --tail=100)
  3. 재시작 시도 (kubectl rollout restart)
  4. 미해결 → 롤백 (이전 이미지 버전으로)

P1 — 수집 부분 중단 또는 데이터 이상 (목표 복구 시간: 30분 이내)
  1. 이상 서비스 범위 파악
  2. 해당 에이전트 재시작
  3. Dual-write로 전환하여 기존 파이프라인 보완
  4. 원인 분석 후 핫픽스 배포

P2 — 성능 저하 (목표 복구 시간: 2시간 이내)
  1. 부하 패턴 분석 (수집량 급증 여부)
  2. 샘플링 정책 조정
  3. 리소스 한도 상향 또는 서버 스케일 업
```

---

## 6. 전환 리스크 관리

### 6.1 주요 리스크 목록

| 리스크 | 발생 확률 | 영향도 | 대응 방안 |
|------|:--------:|:------:|---------|
| 자체 쿼리 API와 PromQL 의미론 차이 | 높음 | 높음 | WS-1.3 S3-7 PromQL 호환 레이어 구현 + diff 검증 |
| SQLite 동시 쓰기 잠금 성능 한계 | 중간 | 높음 | WAL 모드 + Sharded RWMutex 설계 선행 |
| 알림 규칙 누락/오작동 | 중간 | 높음 | Phase B에서 Prom vs. AITOP 알림 병렬 검증 2주 |
| 인메모리 버퍼 사이즈 과소 설정 | 낮음 | 중간 | 부하 테스트 시나리오 2~3번 사전 검증 |
| Agent 재연결 폭풍 (thundering herd) | 낮음 | 중간 | Jitter + Exponential Backoff 재연결 구현 |
| Helm 업그레이드 실패 (PVC 재생성) | 낮음 | 높음 | PersistentVolume 분리 설계, in-place 업그레이드 |

### 6.2 Go/No-Go 체크리스트 (Phase C 切替 전)

Phase C(단독 운영)로 전환하기 전 아래 모든 항목을 확인해야 한다.

**성능 검증**:
- [ ] 메트릭 수치 diff < ±5% (14일 연속) ← `diff-checker` 보고서
- [ ] 트레이스 건수 diff < ±1% (14일 연속)
- [ ] API P95 < 500ms (부하 테스트 결과)
- [ ] 72시간 메모리 누수 테스트 통과

**기능 검증**:
- [ ] 모든 대시보드 페이지 /api/v2 기반으로 정상 표시
- [ ] 알림 규칙 동등 작동 확인 (Prom vs. AITOP)
- [ ] 에이전트 재연결 시나리오 통과
- [ ] 롤백 절차 사전 테스트 완료 (스테이징)

**운영 준비**:
- [ ] 롤백 대기 인원 배치 (切替 당일)
- [ ] 고객 공지 완료 (72시간 전)
- [ ] 백업 확인 (SQLite 최신 스냅샷)
- [ ] 모니터링 대시보드 준비 (切替 전후 수치 실시간 비교 뷰)

---

## 문서 이력

| 날짜 | 작성자 | 내용 |
|------|--------|------|
| 2026-03-30 | Aura Kim | 초안 작성 — WS-8.5 (R-18~R-22): dual-write 전략, 데이터 정합성, 환경별 playbook, 성능 테스트 시나리오, 장애 복구 절차 |
