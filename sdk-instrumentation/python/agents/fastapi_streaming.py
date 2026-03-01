"""
FastAPI SSE / 스트리밍 응답 — OTel 계측 모듈

Server-Sent Events(SSE) 및 스트리밍 응답에서
TTFT(첫 토큰 시간)와 청크 간 지연(inter-chunk delay)을 추적합니다.
스트리밍 중단 및 재연결 이벤트도 기록하여 사용자 체감 품질을 측정합니다.

사용법:
    from sdk_instrumentation.python.agents.fastapi_streaming import (
        StreamingInstrumentor
    )

    @app.post("/v1/chat/completions")
    async def chat(request: ChatRequest):
        instr = StreamingInstrumentor(model="llama-3-8b", request_id=request.id)
        return StreamingResponse(
            instr.wrap(llm_stream_generator(request.prompt)),
            media_type="text/event-stream",
        )
"""

import time
from typing import AsyncGenerator, Optional

from opentelemetry import metrics, trace
from opentelemetry.trace import SpanKind, StatusCode

tracer = trace.get_tracer("ai.service.streaming", "1.0.0")
meter  = metrics.get_meter("ai.service.streaming", "1.0.0")

# ── 메트릭 정의 ─────────────────────────────────────────────────────

ttft_histogram = meter.create_histogram(
    name="streaming.time_to_first_chunk",
    description="스트리밍 응답에서 첫 청크 수신까지의 시간 (클라이언트 관점 TTFT)",
    unit="ms",
)
inter_chunk_delay = meter.create_histogram(
    name="streaming.inter_chunk_delay",
    description="연속된 두 청크 사이의 전송 지연",
    unit="ms",
)
chunk_count_histogram = meter.create_histogram(
    name="streaming.chunk_count",
    description="스트리밍 응답의 총 청크 수 (응답 길이 간접 지표)",
    unit="1",
)
streaming_duration = meter.create_histogram(
    name="streaming.total_duration",
    description="첫 청크부터 마지막 청크까지 전체 스트리밍 시간",
    unit="ms",
)
stream_error_counter = meter.create_counter(
    name="streaming.error.total",
    description="스트리밍 중 에러/중단 발생 횟수",
    unit="1",
)
delay_spike_counter = meter.create_counter(
    name="streaming.delay_spike.total",
    description="청크 간 지연이 임계치를 초과한 횟수 (사용자 체감 끊김)",
    unit="1",
)


class StreamingInstrumentor:
    """
    스트리밍 응답 전체 수명주기에 OTel 계측을 적용하는 래퍼.

    FastAPI StreamingResponse에 전달할 비동기 제너레이터를 래핑하여
    TTFT, 청크 간 지연, 총 스트리밍 시간을 측정합니다.

    Args:
        model: 사용 중인 LLM 모델 이름
        request_id: 요청 고유 ID (Trace ID와 별도 비즈니스 ID)
        delay_spike_threshold_ms: 이 값 초과 시 '사용자 체감 끊김' 이벤트 기록
        media_type: "text/event-stream" (SSE) 또는 "text/plain"
    """

    def __init__(
        self,
        model: str = "unknown",
        request_id: str = "",
        delay_spike_threshold_ms: float = 500.0,
        media_type: str = "text/event-stream",
    ):
        self.model = model
        self.request_id = request_id
        self.delay_spike_threshold_ms = delay_spike_threshold_ms
        self.media_type = media_type

    async def wrap(
        self,
        upstream: AsyncGenerator[str, None],
    ) -> AsyncGenerator[str, None]:
        """
        upstream 제너레이터를 계측하여 OTel Span/Metric을 기록하는
        비동기 제너레이터. FastAPI StreamingResponse에 직접 전달 가능.
        """
        with tracer.start_as_current_span(
            "streaming.response",
            kind=SpanKind.SERVER,
            attributes={
                "streaming.model": self.model,
                "streaming.request_id": self.request_id,
                "streaming.media_type": self.media_type,
                "streaming.spike_threshold_ms": self.delay_spike_threshold_ms,
            },
        ) as span:
            request_start = time.perf_counter()
            first_chunk_time: Optional[float] = None
            prev_chunk_time = request_start
            chunk_index = 0
            total_chars = 0

            try:
                async for chunk in upstream:
                    now = time.perf_counter()

                    # ── 첫 청크: TTFT 계산 ──────────────────────────
                    if first_chunk_time is None:
                        first_chunk_time = now
                        ttft_ms = (first_chunk_time - request_start) * 1000

                        span.add_event(
                            "streaming.first_chunk",
                            {
                                "streaming.ttft_ms": ttft_ms,
                                "streaming.chunk_index": 0,
                            },
                        )
                        ttft_histogram.record(ttft_ms, {"model": self.model})

                    # ── 이후 청크: 청크 간 지연 측정 ─────────────────
                    else:
                        gap_ms = (now - prev_chunk_time) * 1000
                        inter_chunk_delay.record(gap_ms, {"model": self.model})

                        if gap_ms > self.delay_spike_threshold_ms:
                            delay_spike_counter.add(1, {"model": self.model})
                            span.add_event(
                                "streaming.delay_spike",
                                {
                                    "streaming.chunk_index": chunk_index,
                                    "streaming.gap_ms": gap_ms,
                                    "streaming.threshold_ms": self.delay_spike_threshold_ms,
                                },
                            )

                    prev_chunk_time = now
                    chunk_index += 1
                    total_chars += len(chunk)
                    yield chunk

                # ── 스트리밍 완료 ────────────────────────────────────
                end_time = time.perf_counter()
                stream_total_ms = (
                    (end_time - first_chunk_time) * 1000
                    if first_chunk_time else 0.0
                )
                e2e_ms = (end_time - request_start) * 1000

                span.set_attributes({
                    "streaming.total_chunks": chunk_index,
                    "streaming.total_chars": total_chars,
                    "streaming.total_duration_ms": stream_total_ms,
                    "streaming.e2e_duration_ms": e2e_ms,
                    "streaming.ttft_ms": (
                        (first_chunk_time - request_start) * 1000
                        if first_chunk_time else -1
                    ),
                })

                chunk_count_histogram.record(chunk_index, {"model": self.model})
                streaming_duration.record(stream_total_ms, {"model": self.model})

            except GeneratorExit:
                # 클라이언트가 연결을 끊은 경우
                span.add_event("streaming.client_disconnected", {
                    "streaming.chunks_sent": chunk_index,
                    "streaming.chars_sent": total_chars,
                })
                span.set_status(StatusCode.OK, "Client disconnected")
                stream_error_counter.add(1, {"model": self.model, "reason": "client_disconnect"})

            except Exception as exc:
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, str(exc))
                span.set_attributes({
                    "streaming.error_at_chunk": chunk_index,
                    "streaming.error_type": type(exc).__name__,
                })
                stream_error_counter.add(1, {"model": self.model, "reason": type(exc).__name__})
                raise


def sse_format(data: str, event: str = "message", id: Optional[str] = None) -> str:
    """
    Server-Sent Events 형식으로 데이터를 포맷합니다.

    Args:
        data: 전송할 데이터 문자열
        event: SSE 이벤트 타입
        id: SSE 이벤트 ID (재연결 시 Last-Event-ID 헤더로 사용됨)

    Returns:
        SSE 형식 문자열 (double newline 종료)
    """
    lines = []
    if id:
        lines.append(f"id: {id}")
    lines.append(f"event: {event}")
    for line in data.splitlines():
        lines.append(f"data: {line}")
    lines.append("")
    lines.append("")
    return "\n".join(lines)
