# XLog/HeatMap 통합 대시보드 재설계 문서

> Scouter XLog / Whatap Transaction Map & HeatMap 패턴을 참조한 통합 모니터링 대시보드

---

## 1. 현재 문제점

| # | 문제 | 원인 |
|---|------|------|
| 1 | **UI 분산** | XLog와 HeatMap이 좌우 분할로 동시 표시되어 어느 쪽에도 집중 불가 |
| 2 | **개별 스팬이 독립 트랜잭션으로 표시** | RAG 파이프라인의 하위 스팬(guardrail, embedding, vector_search, llm_inference)이 각각 별도 점으로 표시되어 하나의 요청으로 인식 불가 |
| 3 | **드래그 선택 후 동작 없음** | 영역 선택은 구현되었으나 트랜잭션 리스트 연동 미구현 |
| 4 | **상세 정보 부족** | 점 클릭 시 기본 정보만 표시. 하위 스팬 워터폴 타임라인 없음 |
| 5 | **HeatMap → 드릴다운 불가** | 셀 클릭 시 해당 구간의 트랜잭션 목록을 볼 수 없음 |

---

## 2. 설계 목표

1. **단일 통합 대시보드** — XLog와 HeatMap을 좌측 메뉴로 전환하며, 하나의 화면에 집중
2. **트랜잭션 단위 표시** — RAG 서비스의 루트 스팬(`rag.pipeline`)만 점으로 표시, 하위 스팬은 상세에서 확인
3. **3단계 드릴다운** — 차트 → 트랜잭션 리스트 → 스팬 상세 (Scouter/Whatap 패턴)
4. **드래그 선택** — 마우스로 영역 선택 시 해당 범위의 트랜잭션 리스트가 즉시 표시
5. **워터폴 타임라인** — 트랜잭션 선택 시 하위 스팬을 시간 순서대로 바 차트로 표시

---

## 3. 레이아웃 설계

### 3-1. 전체 구조

```
+------+------------------------------------------------------+
| SIDE | TOP BAR: 서비스 필터 | 시간 범위 | 데이터소스 | 통계   |
| BAR  +------------------------------------------------------+
|      |                                                      |
| XLog | CHART PANEL (상단 50%)                                |
|      |  XLog 모드: 산점도 (X=시간, Y=응답시간)               |
| Heat |  HeatMap 모드: 밀도 히트맵                             |
| Map  |  → 마우스 드래그로 영역 선택                            |
|      |                                                      |
|      +------------------------------------------------------+
|      |                                                      |
|      | TRANSACTION LIST (하단 25%)                           |
|      |  드래그 선택 결과 테이블                                |
|      |  컬럼: 상태 | 엔드포인트 | 응답시간 | 시각 | TTFT | TPS |
|      |                                                      |
|      +------------------------------------------------------+
|      |                                                      |
|      | DETAIL PANEL (하단 25%)                               |
|      |  선택된 트랜잭션의 워터폴 타임라인                      |
|      |  하위 스팬 바 차트 + 속성 테이블                        |
|      |                                                      |
+------+------------------------------------------------------+
```

### 3-2. 좌측 사이드바 (48px 고정)

```
+------+
| LOGO |   AI 로고 아이콘
+------+
| XLog |   산점도 뷰 (기본)
+------+
| Heat |   히트맵 뷰
+------+
|      |
| (여백)|
|      |
+------+
| 설정 |   임계값/테마 설정
+------+
```

- 아이콘 + 툴팁 방식 (텍스트 없이 아이콘만)
- 활성 메뉴에 좌측 accent 색상 바 표시
- XLog과 HeatMap은 같은 위치에서 전환 (동시 표시 아님)

### 3-3. 패널 크기 조절

- Chart Panel과 Transaction List 사이에 **드래그 가능한 리사이즈 바** 배치
- 기본 비율: Chart 50% / List 25% / Detail 25%
- Detail Panel은 트랜잭션 미선택 시 축소(0%) → List가 50%로 확장
- 상태 전이:
  ```
  초기 상태:     Chart 60% | List 40%  | Detail 0%
  드래그 선택 후: Chart 50% | List 25% | Detail 25%
  트랜잭션 클릭: Chart 40% | List 20% | Detail 40%
  ```

---

## 4. 데이터 모델 재설계

### 4-1. 트랜잭션 (Transaction) — 점 하나의 단위

현재는 모든 스팬이 개별 점으로 표시됩니다. 이를 **루트 스팬(트랜잭션) 단위**로 변경합니다.

```javascript
// 현재: 모든 스팬이 점
point = { traceId, spanId, elapsed, service, ... }

// 변경: 트랜잭션(루트 스팬)만 점, 하위 스팬은 children에 포함
transaction = {
  traceId:    "a1b2c3d4...",           // Trace ID
  rootSpanId: "0123456789ab",          // 루트 스팬 ID
  timestamp:  1711234567890,           // 시작 시각 (ms)
  elapsed:    1247,                    // 전체 소요시간 (ms)
  service:    "rag-demo-service",      // 서비스명
  endpoint:   "POST /api/chat",        // 엔드포인트
  status:     "normal",                // normal | slow | very_slow | error
  statusCode: 200,                     // HTTP 상태 코드

  // RAG 전용 메트릭
  metrics: {
    ttft_ms:          399.8,           // Time To First Token
    tps:              26.01,           // Tokens Per Second
    tokens_generated: 42,              // 생성된 토큰 수
    guardrail_action: "PASS",          // PASS | BLOCK
  },

  // 하위 스팬 (드릴다운 시 사용)
  spans: [
    {
      spanId:    "span-001",
      parentId:  "0123456789ab",
      name:      "rag.guardrail_input_check",
      startOffset: 0,                 // 루트 대비 오프셋 (ms)
      duration:    50,                 // 소요시간 (ms)
      status:    "ok",
      attributes: { "guardrail.action": "PASS", "guardrail.policy": "content_safety" }
    },
    {
      spanId:    "span-002",
      name:      "rag.embedding",
      startOffset: 52,
      duration:    30,
      status:    "ok",
      attributes: { "embedding.model": "text-embedding-ada-002" }
    },
    {
      spanId:    "span-003",
      name:      "rag.vector_search",
      startOffset: 85,
      duration:    40,
      status:    "ok",
      attributes: { "vectordb.results_count": 3 }
    },
    {
      spanId:    "span-004",
      name:      "rag.llm_inference",
      startOffset: 130,
      duration:    1000,
      status:    "ok",
      attributes: { "llm.model": "gpt-4o", "llm.ttft_ms": 399 }
    },
    {
      spanId:    "span-005",
      name:      "rag.guardrail_output_check",
      startOffset: 1135,
      duration:    20,
      status:    "ok",
      attributes: { "guardrail.action": "PASS" }
    }
  ]
}
```

### 4-2. 데이터소스별 트랜잭션 구성

| 데이터소스 | 루트 스팬 판별 기준 | 하위 스팬 |
|-----------|-------------------|-----------|
| **Demo** | `name = "rag.pipeline"` 생성 | 5개 하위 스팬 자동 생성 |
| **Tempo** | `span.kind = server` AND `parentSpanId = ""` | TraceQL로 해당 traceId의 전체 스팬 조회 |
| **Prometheus** | histogram에서 역산 (기존 방식) | 없음 (합성 데이터) |

### 4-3. 상태 분류 기준

| 상태 | 조건 | 색상 | 용도 |
|------|------|------|------|
| `normal` | elapsed < 1000ms AND no error | `#4A90D9` (파랑) | 정상 |
| `slow` | 1000ms ≤ elapsed < 3000ms | `#F5A623` (노랑) | 주의 |
| `very_slow` | elapsed ≥ 3000ms | `#E8601C` (주황) | 경고 |
| `error` | HTTP 5xx OR guardrail BLOCK | `#D0021B` (빨강) | 에러 |

---

## 5. XLog 뷰 상세 설계

### 5-1. 차트 영역

```
 응답시간(ms)
 10000 ┤
       │                                    ● (very_slow)
  3000 ┤ - - - - - - - - - - - - - - - - - - -  ← 경고 임계선 (빨강 점선)
       │        ●
  1000 ┤ - - - - - - - - - - - - - - - - - - -  ← 주의 임계선 (노랑 점선)
       │  ●  ● ● ●●  ●  ● ●●● ●●  ● ● ● ● ●
   500 ┤  ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
       │  ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
   100 ┤  ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
     0 ┤──────────────────────────────────────→ 시간
       16:00     16:05     16:10     16:15
```

- **한 점 = 한 트랜잭션** (RAG pipeline 루트 스팬)
- Y축: 로그 스케일 토글 지원
- 임계선: 1s (노랑 점선), 3s (빨강 점선), 사용자 설정 가능
- 실시간: 새 점이 우측에서 나타나며 좌측으로 흐름

### 5-2. 드래그 선택 인터랙션

```
  사용자 동작                    시스템 반응
  ─────────────                ─────────────────
  1. 차트 위에서 마우스 다운    → 선택 시작점 기록
  2. 마우스 드래그              → 반투명 파랑 사각형 오버레이
  3. 마우스 업                  → 영역 내 트랜잭션 필터링
                               → Transaction List 패널에 결과 표시
                               → 선택 영역 하이라이트 유지
  4. 차트 빈 공간 클릭          → 선택 해제, 리스트 초기화
```

- 선택 최소 크기: 가로 10px, 세로 10px (미만은 단일 점 클릭으로 처리)
- 선택 영역: `rgba(74, 144, 217, 0.15)` 배경 + `rgba(74, 144, 217, 0.5)` 테두리
- 선택 후 차트 상단에 "**32건 선택됨** (1,200ms ~ 3,500ms, 16:05:00 ~ 16:07:30)" 표시

### 5-3. 단일 점 인터랙션

| 동작 | 결과 |
|------|------|
| 호버 | 툴팁: 엔드포인트, 응답시간, 시각, 상태 |
| 클릭 | Transaction List에서 해당 행 하이라이트 + Detail Panel 열림 |
| 우클릭 | 컨텍스트 메뉴: Jaeger에서 보기, Grafana에서 보기, Trace ID 복사 |

---

## 6. HeatMap 뷰 상세 설계

### 6-1. 차트 영역

```
 응답시간
  3s+   ┤  ░░  ░░                    ░░░░
  2-3s  ┤  ░░  ▒▒  ░░              ░░▒▒░░
  1-2s  ┤  ▒▒  ▓▓  ▒▒  ░░      ░░  ▒▒▓▓▒▒
  0.5-1 ┤  ▓▓  ██  ▓▓  ▒▒  ░░  ▒▒  ▓▓██▓▓
  300ms ┤  ██  ██  ██  ▓▓  ▒▒  ▓▓  ██████
  100ms ┤  ██  ██  ██  ██  ▓▓  ██  ██████
  0ms   ┤  ██  ██  ██  ██  ██  ██  ██████
        └──────────────────────────────────→ 시간
         16:00    16:05    16:10    16:15

  범례: ░ 1-5건  ▒ 5-20건  ▓ 20-50건  █ 50+건
```

- **한 셀 = 시간 버킷 × 응답시간 버킷의 트랜잭션 수**
- 색상 농도 = 트랜잭션 밀도 (Whatap 스타일)
- 별도 에러 오버레이: 에러 비율이 높은 셀에 빨강 테두리

### 6-2. 드래그 선택 인터랙션

XLog와 동일한 패턴:
1. 마우스 드래그로 셀 영역 선택
2. 선택된 셀들의 시간 범위 + 응답시간 범위에 해당하는 트랜잭션을 리스트에 표시
3. 선택 해제 시 리스트 초기화

### 6-3. 셀 클릭 인터랙션

| 동작 | 결과 |
|------|------|
| 호버 | 툴팁: 시간 구간, 응답시간 범위, 요청 수 |
| 클릭 | 해당 셀의 트랜잭션을 Transaction List에 표시 |

---

## 7. Transaction List 패널 설계

### 7-1. 테이블 컬럼

| 컬럼 | 너비 | 설명 | 정렬 |
|------|------|------|------|
| 상태 | 32px | 색상 점 (normal/slow/error) | - |
| 엔드포인트 | flex | `POST /api/chat` | 좌 |
| 응답시간 | 90px | `1,247ms` (색상 코딩) | 우 |
| TTFT | 70px | `399ms` | 우 |
| TPS | 70px | `26.0 tok/s` | 우 |
| 시각 | 100px | `16:05:23.123` | 좌 |
| 가드레일 | 60px | `PASS` / `BLOCK` (빨강) | 중앙 |
| Trace ID | 80px | `a1b2...` (클릭 시 복사) | 좌 |

### 7-2. 헤더 영역

```
┌──────────────────────────────────────────────────────┐
│ 📋 32건 선택됨  │ 정렬: 응답시간 ▼ │ [전체] [Slow] [Error] │
├──────────────────────────────────────────────────────┤
│ ● POST /api/chat          1,247ms  399ms  26.0  ... │  ← 클릭 시 Detail 열림
│ ● POST /api/chat            832ms  301ms  31.2  ... │
│ ● POST /api/chat          3,502ms  890ms  12.1  ... │  ← 주황색 (very_slow)
│ ● POST /api/chat            124ms    0ms   0.0  ... │  ← 빨강 (BLOCK)
│ ...                                                  │
└──────────────────────────────────────────────────────┘
```

- 컬럼 헤더 클릭: 오름차순/내림차순 토글
- 상태 필터 버튼: 전체 / Slow만 / Error만
- 가상 스크롤: 1000건 이상도 버벅임 없이 표시
- 행 호버: 차트에서 해당 점 하이라이트 (양방향 연동)

---

## 8. Detail Panel 설계 (워터폴 타임라인)

### 8-1. 레이아웃

```
┌──────────────────────────────────────────────────────┐
│ Transaction Detail                           [✕ 닫기]│
├──────────────────────────────────────────────────────┤
│ POST /api/chat  │ 1,247ms │ 16:05:23 │ 200 OK       │
│ Trace: a1b2c3d4  │ TTFT: 399ms  │ TPS: 26.0 tok/s  │
├──────────────────────────────────────────────────────┤
│ 0ms    200ms    400ms    600ms    800ms   1000ms 1200│
│ ├──────────────────────────────────────────────────┤ │
│ │ rag.pipeline                          1,247ms    │ │
│ │  ├─ ██ guardrail_input    50ms                   │ │
│ │  ├─ ██ embedding          30ms                   │ │
│ │  ├─ ███ vector_search     40ms                   │ │
│ │  ├─ ████████████████████ llm_inference 1,000ms   │ │
│ │  └─ █ guardrail_output    20ms                   │ │
│ ├──────────────────────────────────────────────────┤ │
├──────────────────────────────────────────────────────┤
│ Span: rag.llm_inference (클릭 시 속성 표시)          │
│  llm.model: gpt-4o  │  llm.ttft_ms: 399             │
│  llm.tokens: 42     │  llm.tps: 26.0                │
└──────────────────────────────────────────────────────┘
```

### 8-2. 워터폴 바 색상

| 스팬 유형 | 색상 | 설명 |
|----------|------|------|
| `rag.guardrail_*` | `#9B59B6` (보라) | 안전 검사 |
| `rag.embedding` | `#3498DB` (파랑) | 벡터 변환 |
| `rag.vector_search` | `#2ECC71` (초록) | DB 검색 |
| `rag.llm_inference` | `#E67E22` (주황) | LLM 추론 (핵심 구간) |
| 기타 | `#95A5A6` (회색) | 기타 스팬 |
| 에러 스팬 | `#E74C3C` (빨강) | 에러 발생 |

### 8-3. 스팬 바 인터랙션

| 동작 | 결과 |
|------|------|
| 호버 | 바 밝아짐 + 툴팁 (스팬명, 소요시간, 시작 오프셋) |
| 클릭 | 하단에 해당 스팬의 속성(attributes) 테이블 표시 |
| 더블클릭 | Jaeger에서 해당 트레이스 열기 |

---

## 9. 인터랙션 흐름 (State Machine)

```
                    ┌─────────────────┐
                    │   IDLE          │
                    │  차트만 표시     │
                    └───────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              │ 드래그 선택  │ 점 클릭      │
              ▼             │             ▼
    ┌─────────────────┐     │    ┌─────────────────┐
    │  LIST_SHOWN     │     │    │  DETAIL_SHOWN   │
    │  차트 + 리스트   │     │    │  차트 + 리스트   │
    │  Detail 숨김     │     │    │  + Detail 표시   │
    └───────┬─────────┘     │    └───────┬─────────┘
            │               │            │
            │ 행 클릭       │            │ 닫기 클릭
            ▼               │            ▼
    ┌─────────────────┐     │    ┌─────────────────┐
    │  DETAIL_SHOWN   │     │    │  LIST_SHOWN     │
    │  차트 + 리스트   │◄────┘    │  Detail 숨김     │
    │  + Detail 표시   │          └─────────────────┘
    └───────┬─────────┘
            │ 빈 공간 클릭 / ESC
            ▼
    ┌─────────────────┐
    │   IDLE          │
    └─────────────────┘
```

---

## 10. 데이터소스 변경사항

### 10-1. Demo 모드 변경

```javascript
// 현재: 개별 스팬 생성
generatePoint() → { traceId, elapsed, service, ... }

// 변경: 트랜잭션 + 하위 스팬 생성
generateTransaction() → {
  traceId, elapsed, service, endpoint,
  metrics: { ttft_ms, tps, tokens_generated, guardrail_action },
  spans: [
    { name: "rag.guardrail_input_check", duration: random(10-100), ... },
    { name: "rag.embedding",             duration: random(20-80),  ... },
    { name: "rag.vector_search",         duration: random(30-120), ... },
    { name: "rag.llm_inference",         duration: random(200-3000), ... },
    { name: "rag.guardrail_output_check", duration: random(10-50),  ... },
  ]
}
```

- 서비스는 `rag-demo-service` 고정 (RAG 서비스만 표시하는 것이 목표)
- 하위 스팬의 `startOffset`은 이전 스팬의 `startOffset + duration`으로 순차 배치
- 에러 시나리오: 3%는 guardrail BLOCK (하위 스팬 1개만), 2%는 LLM 타임아웃

### 10-2. Tempo 모드 변경

```
현재:  { span.kind = server } → 모든 서버 스팬
변경:  { name = "rag.pipeline" } → RAG 파이프라인 루트만 조회
       → 트랜잭션 클릭 시: { traceID = "xxx" } 로 전체 스팬 lazy 로딩
```

- 초기 로딩: 루트 스팬만 조회 (가벼움)
- 드릴다운 시: 해당 Trace의 전체 스팬을 Tempo에서 추가 조회 (lazy loading)
- 호출: `GET /api/traces/{traceId}` → 스팬 트리 구성

---

## 11. 파일 구조 변경

### 현재 (1,444 lines, 6 files)

```
dashboards/xlog-heatmap/
├── index.html              (109 lines)
├── css/dashboard.css        (290 lines)
└── js/
    ├── app.js               (278 lines)
    ├── data-source.js       (185 lines)
    ├── xlog-chart.js        (340 lines)
    └── heatmap-chart.js     (242 lines)
```

### 변경 후 (예상 ~3,000 lines, 9 files)

```
dashboards/xlog-heatmap/
├── index.html                (150 lines)  — 3-panel 레이아웃
├── css/dashboard.css          (400 lines)  — 사이드바, 리사이즈, 워터폴 스타일
└── js/
    ├── app.js                 (350 lines)  — 상태 관리, 패널 전환, 이벤트 조율
    ├── data-source.js         (250 lines)  — 트랜잭션 단위 데이터 + lazy span 로딩
    ├── xlog-chart.js          (380 lines)  — 드래그 선택 → 트랜잭션 필터링 연동
    ├── heatmap-chart.js       (280 lines)  — 셀 선택 → 트랜잭션 필터링 연동
    ├── transaction-list.js    (350 lines)  — 신규: 가상 스크롤 테이블, 정렬/필터
    ├── waterfall-detail.js    (400 lines)  — 신규: 워터폴 타임라인 Canvas 렌더링
    └── resize-manager.js      (100 lines)  — 신규: 패널 리사이즈 핸들러
```

---

## 12. 기술 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 렌더링 | Canvas 유지 | 기존 코드 재활용, 대량 점 렌더링 성능 |
| 프레임워크 | 순수 JS 유지 | 외부 의존성 없이 가볍게 유지 |
| 트랜잭션 리스트 | DOM 기반 가상 스크롤 | 테이블 기능(정렬, 필터)은 DOM이 적합 |
| 워터폴 타임라인 | Canvas 렌더링 | 스팬 바의 정밀한 위치/크기 제어 |
| 패널 리사이즈 | CSS flex + JS drag | 간단하고 반응형 |
| 스팬 로딩 | Lazy loading | 초기 성능: 루트만 로딩, 클릭 시 상세 로딩 |

---

## 13. 마이그레이션 전략

### Phase A: 레이아웃 변경 (영향도: 중)
1. `index.html` — 3-panel 수직 레이아웃으로 재구성
2. `dashboard.css` — 사이드바, 리사이즈바, 패널 스타일
3. `app.js` — 사이드바 메뉴 전환 로직

### Phase B: 데이터 모델 변경 (영향도: 높)
1. `data-source.js` — 트랜잭션 단위 생성, lazy span 로딩
2. `xlog-chart.js` — 트랜잭션만 렌더링, 드래그 선택 → 콜백 연동
3. `heatmap-chart.js` — 트랜잭션 기반 집계, 셀 선택 → 콜백 연동

### Phase C: 신규 패널 구현 (영향도: 높)
1. `transaction-list.js` — 가상 스크롤 테이블, 차트 양방향 연동
2. `waterfall-detail.js` — 워터폴 타임라인 Canvas 렌더링
3. `resize-manager.js` — 패널 드래그 리사이즈

### Phase D: 통합 테스트 (영향도: 저)
1. Demo 모드 동작 확인
2. Tempo/Prometheus 연동 확인
3. 성능 테스트 (1000+ 트랜잭션)

---

## 14. 참조 UI

| 도구 | 화면 | 참조 포인트 |
|------|------|-------------|
| **Scouter XLog** | 실시간 산점도 | 점 = 트랜잭션, 드래그 선택 → 리스트, 하단 프로파일 |
| **Whatap Transaction Map** | 트랜잭션 맵 | 필터링, 서비스 선택, 실시간 갱신 |
| **Whatap HeatMap** | 히트맵 분석 | 밀도 시각화, 영역 선택 → 트랜잭션 리스트 → 상세 |
| **Jaeger UI** | 트레이스 상세 | 워터폴 타임라인 레이아웃, 스팬 트리 구조 |

---

## 15. 성공 기준

| # | 기준 | 측정 방법 |
|---|------|-----------|
| 1 | RAG 파이프라인이 하나의 점으로 표시됨 | XLog에서 점 하나 = `rag.pipeline` 루트 스팬 |
| 2 | 드래그 선택 시 3초 이내에 리스트 표시 | 1000건 트랜잭션 기준 |
| 3 | 트랜잭션 클릭 시 워터폴에 5개 하위 스팬 표시 | guardrail → embedding → vector → llm → guardrail |
| 4 | XLog ↔ HeatMap 전환이 즉시 반영 | 사이드바 클릭 후 100ms 이내 |
| 5 | 성능 저하 구간이 시각적으로 식별 가능 | slow/very_slow 점이 색상으로 즉시 구분 |
