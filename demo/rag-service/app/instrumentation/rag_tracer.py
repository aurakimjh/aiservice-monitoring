"""RAG Demo Service — Custom Span Decorators"""

import functools
import time
from opentelemetry import trace

from app.instrumentation.otel_setup import get_tracer

_tracer = get_tracer("rag-pipeline")


def trace_rag_step(step_name: str, attributes: dict = None):
    """RAG 파이프라인 단계별 Span을 자동 생성하는 데코레이터"""

    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            with _tracer.start_as_current_span(
                f"rag.{step_name}",
                attributes={"rag.step": step_name, **(attributes or {})},
            ) as span:
                start = time.perf_counter()
                try:
                    result = await func(*args, **kwargs)
                    span.set_attribute("rag.step.success", True)
                    return result
                except Exception as e:
                    span.set_attribute("rag.step.success", False)
                    span.set_attribute("rag.step.error", str(e))
                    span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
                    raise
                finally:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    span.set_attribute("rag.step.duration_ms", round(elapsed_ms, 2))

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            with _tracer.start_as_current_span(
                f"rag.{step_name}",
                attributes={"rag.step": step_name, **(attributes or {})},
            ) as span:
                start = time.perf_counter()
                try:
                    result = func(*args, **kwargs)
                    span.set_attribute("rag.step.success", True)
                    return result
                except Exception as e:
                    span.set_attribute("rag.step.success", False)
                    span.set_attribute("rag.step.error", str(e))
                    span.set_status(trace.Status(trace.StatusCode.ERROR, str(e)))
                    raise
                finally:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    span.set_attribute("rag.step.duration_ms", round(elapsed_ms, 2))

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
