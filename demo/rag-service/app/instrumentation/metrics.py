"""RAG Demo Service — Custom OTel Metrics"""

from app.instrumentation.otel_setup import get_meter

_meter = get_meter("rag-demo-metrics")

# ── Histograms ─────────────────────────────────────────────────
request_duration = _meter.create_histogram(
    name="rag.request.duration",
    description="RAG 요청 전체 처리 시간",
    unit="ms",
)

ttft_duration = _meter.create_histogram(
    name="rag.ttft.duration",
    description="Time To First Token",
    unit="ms",
)

tokens_per_second = _meter.create_histogram(
    name="rag.tokens_per_second",
    description="토큰 생성 속도",
    unit="tok/s",
)

vector_search_duration = _meter.create_histogram(
    name="rag.vector_search.duration",
    description="벡터 검색 소요 시간",
    unit="ms",
)

embedding_duration = _meter.create_histogram(
    name="rag.embedding.duration",
    description="임베딩 변환 소요 시간",
    unit="ms",
)

guardrail_check_duration = _meter.create_histogram(
    name="rag.guardrail.check.duration",
    description="가드레일 검사 소요 시간",
    unit="ms",
)

documents_retrieved = _meter.create_histogram(
    name="rag.documents.retrieved",
    description="검색된 문서 수",
    unit="count",
)

# ── Counters ───────────────────────────────────────────────────
guardrail_block_total = _meter.create_counter(
    name="rag.guardrail.block.total",
    description="가드레일에 의해 차단된 요청 수",
)

request_total = _meter.create_counter(
    name="rag.request.total",
    description="전체 RAG 요청 수",
)
