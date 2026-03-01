"""
NeMo Guardrails / Guardrails AI — OTel 계측 모듈

가드레일 검증 레이턴시, 차단율, 정책 위반 유형을 추적합니다.
병목 탐지를 위해 가드레일이 E2E 레이턴시에 기여하는 비율을 측정합니다.

사용법:
    @instrument_guardrail(policy_name="input_safety")
    async def validate_input(user_input: str) -> dict:
        return await nemo_rails.generate(user_input)
"""

import time
from functools import wraps

from opentelemetry import trace, metrics
from opentelemetry.trace import SpanKind, StatusCode

tracer = trace.get_tracer("ai.guardrails", "1.0.0")
meter = metrics.get_meter("ai.guardrails", "1.0.0")

# ── 메트릭 정의 ─────────────────────────────────────────────────────

guardrail_latency = meter.create_histogram(
    name="guardrail.validation.duration",
    description="가드레일 검증 처리 시간",
    unit="ms",
)
guardrail_block_counter = meter.create_counter(
    name="guardrail.block.total",
    description="가드레일 차단 누적 횟수",
    unit="1",
)
guardrail_reask_counter = meter.create_counter(
    name="guardrail.reask.total",
    description="Guardrails AI re-ask 발생 횟수",
    unit="1",
)
policy_violation_counter = meter.create_counter(
    name="guardrail.policy_violation.total",
    description="정책 유형별 위반 횟수",
    unit="1",
)
guardrail_request_counter = meter.create_counter(
    name="guardrail.request.total",
    description="가드레일 검증 요청 총 횟수 (차단율 분모)",
    unit="1",
)


def instrument_guardrail(policy_name: str, engine: str = "nemo"):
    """
    가드레일 함수에 OTel 계측을 주입하는 데코레이터.

    Args:
        policy_name: 정책 식별자 (예: "input_safety", "pii_detection")
        engine: 가드레일 엔진 ("nemo" | "guardrails_ai")
    """
    def decorator(fn):
        @wraps(fn)
        async def wrapper(user_input: str, *args, **kwargs):
            start = time.perf_counter()

            with tracer.start_as_current_span(
                f"guardrail.validate.{policy_name}",
                kind=SpanKind.INTERNAL,
                attributes={
                    "guardrail.policy": policy_name,
                    "guardrail.engine": engine,
                    "input.char_length": len(user_input),
                    "input.token_estimate": len(user_input.split()),
                }
            ) as span:
                guardrail_request_counter.add(1, {"policy": policy_name})

                try:
                    result = await fn(user_input, *args, **kwargs)
                    elapsed_ms = (time.perf_counter() - start) * 1000

                    action = result.get("action", "PASS")
                    violation_type = result.get("violation_type", "none")
                    labels = {
                        "policy": policy_name,
                        "action": action,
                        "violation_type": violation_type,
                    }

                    span.set_attributes({
                        "guardrail.action": action,
                        "guardrail.violation_type": violation_type,
                        "guardrail.duration_ms": elapsed_ms,
                        "guardrail.confidence_score": result.get("confidence", 1.0),
                    })

                    guardrail_latency.record(elapsed_ms, labels)

                    if action == "BLOCK":
                        guardrail_block_counter.add(1, labels)
                        policy_violation_counter.add(1, {
                            "policy": policy_name,
                            "type": violation_type,
                        })
                        # tail sampling이 이 span을 선별하도록 이벤트 기록
                        span.add_event("guardrail.block.detail", {
                            "input.snippet": user_input[:100],
                            "matched_rule": result.get("matched_rule", "unknown"),
                        })

                    elif action == "REASK":
                        guardrail_reask_counter.add(1, labels)
                        span.add_event("guardrail.reask.issued", {
                            "reask_count": result.get("reask_count", 1),
                        })

                    return result

                except Exception as e:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    guardrail_latency.record(elapsed_ms, {
                        "policy": policy_name,
                        "action": "ERROR",
                        "violation_type": "exception",
                    })
                    raise

        return wrapper
    return decorator
