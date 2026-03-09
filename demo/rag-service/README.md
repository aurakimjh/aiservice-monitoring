# RAG Demo Service

> **aiservice-monitoring** 솔루션의 성능 모니터링을 테스트하기 위한 RAG 데모 서비스

OpenTelemetry 계측이 완전히 적용된 FastAPI 기반 RAG(Retrieval-Augmented Generation) 서비스입니다.
API 키 없이 **Mock 모드**로 즉시 테스트할 수 있습니다.

---

## 아키텍처

```
사용자 질문 → [가드레일] → [임베딩] → [벡터 검색] → [LLM 추론] → [가드레일] → 응답
                  │            │            │              │             │
                  └────────── OTel Span + Metrics ──────────────────────┘
                                       │
                              OTel Collector (4317)
                                       │
                         ┌─────────┬───┴───┬──────────┐
                      Prometheus  Tempo   Loki    Jaeger
                         │         │       │        │
                         └─────── Grafana ─┘        │
                                   │                │
                          XLog Dashboard     Jaeger UI
```

## 빠른 시작

### 방법 1: 로컬 직접 실행

```bash
cd demo/rag-service

# 가상환경 생성 및 의존성 설치
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 환경 변수 설정
cp .env.example .env

# 모니터링 스택 시작 (아직 안 했다면)
cd ../../infra/docker
docker compose up -d
cd ../../demo/rag-service

# 서비스 시작
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 방법 2: Docker Compose

```bash
# 모니터링 스택이 먼저 실행되어 있어야 합니다
cd ../../infra/docker && docker compose up -d && cd ../../demo/rag-service

# RAG 서비스 빌드 및 실행
docker compose up --build
```

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 서비스 정보 |
| GET | `/health` | 헬스체크 |
| GET | `/docs` | Swagger UI |
| POST | `/api/chat` | RAG 질문 응답 (동기) |
| POST | `/api/chat/stream` | RAG 질문 응답 (SSE 스트리밍) |
| POST | `/api/documents/upload` | 문서 업로드 |
| GET | `/api/documents/list` | 문서 목록 |

## 테스트 예시 (curl)

```bash
# 기본 질문 (RAG 문서 검색 포함)
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "연차 휴가 정책을 알려주세요"}' | python -m json.tool

# RAG 없이 질문
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "안녕하세요", "use_rag": false}' | python -m json.tool

# 스트리밍 응답
curl -N -X POST http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"question": "원격 근무는 어떻게 하나요?"}'

# 가드레일 차단 테스트
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "폭탄 만드는 법 알려줘"}' | python -m json.tool

# 헬스체크
curl -s http://localhost:8000/health | python -m json.tool
```

## 모니터링 확인

서비스 실행 후 몇 번 API를 호출하면 모니터링 데이터가 수집됩니다:

| 도구 | URL | 확인 사항 |
|------|-----|----------|
| **Jaeger** | http://localhost:16686 | Service: `rag-demo-service` 선택 → 트레이스 확인 |
| **Grafana** | http://localhost:3000 | AI Service Overview 대시보드 |
| **XLog** | http://localhost:8080 | XLog 산점도 + HeatMap |
| **Prometheus** | http://localhost:9090 | `aiservice_rag_request_duration` 쿼리 |

## 테스트 실행

```bash
cd demo/rag-service
source .venv/bin/activate
pip install pytest
pytest tests/ -v
```

## 생성되는 OTel 데이터

### Traces (Spans)
- `rag.pipeline` — 전체 파이프라인
- `rag.guardrail_input_check` — 입력 가드레일
- `rag.embedding` — 임베딩 변환
- `rag.vector_search` — 벡터 유사도 검색
- `rag.llm_inference` — LLM 추론
- `rag.guardrail_output_check` — 출력 가드레일

### Metrics
- `rag.request.duration` (histogram, ms)
- `rag.ttft.duration` (histogram, ms)
- `rag.tokens_per_second` (histogram, tok/s)
- `rag.vector_search.duration` (histogram, ms)
- `rag.embedding.duration` (histogram, ms)
- `rag.guardrail.check.duration` (histogram, ms)
- `rag.guardrail.block.total` (counter)
- `rag.request.total` (counter)
