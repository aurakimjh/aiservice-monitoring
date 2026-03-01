"""
vLLM 추론 엔진 — OTel 계측 모듈

TTFT(첫 토큰 시간), TPS(초당 토큰), 큐 대기 시간을 추적합니다.
스트리밍 응답에서 첫 청크 수신 시각을 포착하여 TTFT를 정확히 측정합니다.

사용법:
    async for output in instrument_vllm_generate(engine, prompt, model, params, req_id):
        yield output
"""

import time
from typing import AsyncGenerator, Any

from opentelemetry import trace, metrics
from opentelemetry.trace import SpanKind, StatusCode

tracer = trace.get_tracer("ai.model.vllm", "1.0.0")
meter = metrics.get_meter("ai.model.vllm", "1.0.0")

# ── AI 핵심 메트릭 정의 ──────────────────────────────────────────────

ttft_histogram = meter.create_histogram(
    name="llm.time_to_first_token",
    description="Time To First Token — 스트리밍 첫 청크까지의 시간",
    unit="ms",
)
tps_histogram = meter.create_histogram(
    name="llm.tokens_per_second",
    description="Token Per Second — 초당 토큰 생성 속도",
    unit="tok/s",
)
ms_per_token_histogram = meter.create_histogram(
    name="llm.ms_per_token",
    description="토큰당 생성 시간 (지연 분석, TPS의 역수)",
    unit="ms",
)
queue_time_histogram = meter.create_histogram(
    name="llm.queue_wait_time",
    description="vLLM 내부 큐 대기 시간 (GPU 포화 지표)",
    unit="ms",
)
prompt_tokens_counter = meter.create_counter(
    name="llm.prompt_tokens.total",
    description="처리된 프롬프트 토큰 누적 수",
    unit="tok",
)
completion_tokens_counter = meter.create_counter(
    name="llm.completion_tokens.total",
    description="생성된 완료 토큰 누적 수",
    unit="tok",
)
concurrent_requests = meter.create_up_down_counter(
    name="llm.concurrent_requests",
    description="vLLM 현재 처리 중인 동시 요청 수",
    unit="1",
)


async def instrument_vllm_generate(
    engine: Any,
    prompt: str,
    model: str,
    sampling_params: Any,
    request_id: str,
) -> AsyncGenerator:
    """
    vLLM generate()를 OTel로 감싸는 비동기 제너레이터.

    TTFT = 요청 시작 ~ 첫 청크 도착 시간
    TPS  = 완료 토큰 수 / (총 시간 - TTFT)
    """
    prompt_tokens = len(prompt.split())  # 실제 환경에서는 tokenizer 사용

    with tracer.start_as_current_span(
        "llm.vllm.generate",
        kind=SpanKind.INTERNAL,
        attributes={
            "llm.model": model,
            "llm.provider": "vllm",
            "llm.request_id": request_id,
            "llm.prompt_tokens": prompt_tokens,
            "llm.max_tokens": getattr(sampling_params, "max_tokens", -1),
            "llm.temperature": getattr(sampling_params, "temperature", 1.0),
        }
    ) as span:
        request_start = time.perf_counter()
        concurrent_requests.add(1, {"model": model})

        first_token_received = False
        ttft_ms = -1.0
        completion_tokens = 0

        try:
            async for output in engine.generate(prompt, sampling_params, request_id):
                # 첫 청크 도착 시 TTFT 기록
                if not first_token_received and output.outputs:
                    ttft_ms = (time.perf_counter() - request_start) * 1000
                    first_token_received = True

                    span.add_event("llm.first_token_received", {
                        "llm.ttft_ms": ttft_ms,
                    })
                    ttft_histogram.record(ttft_ms, {
                        "model": model,
                        "temperature": str(getattr(sampling_params, "temperature", 1.0)),
                    })

                    # 큐 대기 시간 추출 (vLLM metrics 객체에서)
                    if hasattr(output, "metrics") and output.metrics:
                        queue_wait_ms = output.metrics.get("scheduler_wait_ms", 0)
                        if queue_wait_ms > 0:
                            queue_time_histogram.record(queue_wait_ms, {"model": model})
                            span.set_attribute("llm.queue_wait_ms", queue_wait_ms)

                if output.outputs:
                    completion_tokens = len(output.outputs[0].token_ids)

                yield output

            # 완료 후 TPS 계산
            total_s = time.perf_counter() - request_start
            if completion_tokens > 0 and ttft_ms >= 0:
                generation_s = total_s - (ttft_ms / 1000)
                if generation_s > 0:
                    tps = completion_tokens / generation_s
                    mpt = (generation_s * 1000) / completion_tokens

                    tps_histogram.record(tps, {"model": model})
                    ms_per_token_histogram.record(mpt, {"model": model})

                    span.set_attributes({
                        "llm.tps": round(tps, 2),
                        "llm.ms_per_token": round(mpt, 2),
                    })

            span.set_attributes({
                "llm.ttft_ms": ttft_ms,
                "llm.completion_tokens": completion_tokens,
                "llm.total_tokens": prompt_tokens + completion_tokens,
                "llm.total_duration_ms": total_s * 1000,
            })

            prompt_tokens_counter.add(prompt_tokens, {"model": model})
            completion_tokens_counter.add(completion_tokens, {"model": model})

        except Exception as e:
            span.record_exception(e)
            span.set_status(StatusCode.ERROR, str(e))
            raise
        finally:
            concurrent_requests.add(-1, {"model": model})
