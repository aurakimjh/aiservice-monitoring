"""OTel initialization for RAG Demo Service"""

from opentelemetry import trace, metrics, baggage, context
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

from app.config import settings


def setup_otel():
    """OpenTelemetry TracerProvider + MeterProvider 초기화"""

    resource = Resource.create({
        ResourceAttributes.SERVICE_NAME: settings.service_name,
        ResourceAttributes.DEPLOYMENT_ENVIRONMENT: settings.deployment_env,
        "ai.service.layer": "app",
    })

    # ── Traces ─────────────────────────────────────────────────
    trace_exporter = OTLPSpanExporter(
        endpoint=settings.otel_exporter_otlp_endpoint,
        insecure=True,
    )
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
    trace.set_tracer_provider(tracer_provider)

    # ── Metrics ────────────────────────────────────────────────
    metric_exporter = OTLPMetricExporter(
        endpoint=settings.otel_exporter_otlp_endpoint,
        insecure=True,
    )
    reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=10000)
    meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(meter_provider)

    return tracer_provider


def get_tracer(name: str = "rag-demo"):
    return trace.get_tracer(name)


def get_meter(name: str = "rag-demo"):
    return metrics.get_meter(name)
