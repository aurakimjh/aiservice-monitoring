"""
Python 서비스 공통 OTel 초기화 모듈

모든 Python AI 서비스는 이 모듈을 import하여 일관된 계측 환경을 구성합니다.
사용법:
    from sdk_instrumentation.python.otel_setup import setup_otel, instrument_fastapi

    tracer, meter = setup_otel(
        service_name="guardrails-service",
        service_version="1.2.0",
    )
"""

import os
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.propagate import set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.pymongo import PymongoInstrumentor


def setup_otel(
    service_name: str,
    service_version: str = "1.0.0",
    deployment_env: str | None = None,
    collector_endpoint: str | None = None,
) -> tuple:
    """
    OTel SDK 초기화 — 모든 Python 서비스의 진입점

    Returns:
        (tracer, meter) 튜플
    """
    env = deployment_env or os.getenv("DEPLOYMENT_ENV", "development")
    endpoint = collector_endpoint or os.getenv(
        "OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317"
    )

    resource = Resource.create({
        SERVICE_NAME: service_name,
        SERVICE_VERSION: service_version,
        "deployment.environment": env,
        "telemetry.sdk.language": "python",
        "ai.service.layer": os.getenv("AI_SERVICE_LAYER", "unknown"),
        "k8s.pod.name": os.getenv("POD_NAME", "unknown"),
        "k8s.namespace.name": os.getenv("POD_NAMESPACE", "default"),
        "k8s.node.name": os.getenv("KUBE_NODE_NAME", "unknown"),
    })

    # Trace Provider
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=endpoint, insecure=(env != "production")),
            max_queue_size=2048,
            max_export_batch_size=512,
            export_timeout_millis=30_000,
            schedule_delay_millis=5_000,
        )
    )
    trace.set_tracer_provider(tracer_provider)

    # Metric Provider
    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[
            PeriodicExportingMetricReader(
                exporter=OTLPMetricExporter(
                    endpoint=endpoint, insecure=(env != "production")
                ),
                export_interval_millis=15_000,
            )
        ],
    )
    metrics.set_meter_provider(meter_provider)

    # W3C TraceContext + Baggage 전파
    set_global_textmap(
        CompositePropagator([
            TraceContextTextMapPropagator(),
            W3CBaggagePropagator(),
        ])
    )

    # Auto-instrumentation (설치되지 않은 라이브러리는 건너뜀)
    try:
        HTTPXClientInstrumentor().instrument()
    except Exception:
        pass
    try:
        RedisInstrumentor().instrument()
    except Exception:
        pass
    try:
        PymongoInstrumentor().instrument()
    except Exception:
        pass

    return (
        trace.get_tracer(service_name, service_version),
        metrics.get_meter(service_name, service_version),
    )


def instrument_fastapi(app, service_name: str):
    """FastAPI 앱에 OTel 미들웨어를 주입합니다."""
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="/health,/metrics,/readyz,/livez",
        server_request_hook=_enrich_server_span,
    )


def _enrich_server_span(span, scope):
    """FastAPI span에 AI 서비스 전용 속성을 추가합니다."""
    if scope.get("type") == "http":
        headers = dict(scope.get("headers", []))
        span.set_attribute(
            "user.tier",
            headers.get(b"x-user-tier", b"standard").decode()
        )
        span.set_attribute(
            "request.id",
            headers.get(b"x-request-id", b"").decode()
        )
