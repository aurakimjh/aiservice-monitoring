'use strict';

/**
 * Node.js (Next.js / API Routes) OTel 초기화 모듈
 *
 * 사용법:
 *   require('./otel-setup')  ← package.json의 -r 플래그로 최우선 로드
 *   또는 node -r ./otel-setup server.js
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { W3CTraceContextPropagator, W3CBaggagePropagator, CompositePropagator } = require('@opentelemetry/core');

const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4317';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || 'ai-frontend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
    'telemetry.sdk.language': 'nodejs',
    'ai.service.layer': 'app',
  }),

  traceExporter: new OTLPTraceExporter({
    url: collectorEndpoint,
    compression: 'gzip',
  }),

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: collectorEndpoint }),
    exportIntervalMillis: 15_000,
  }),

  // W3C TraceContext + Baggage 전파
  textMapPropagator: new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
    ],
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreOutgoingRequestHook: (req) =>
          req.path?.includes('/health') || req.path?.includes('/metrics'),
        requestHook: (span, request) => {
          const tier = (request.headers && request.headers['x-user-tier']) || 'standard';
          span.setAttribute('user.tier', tier);
        },
      },
      '@opentelemetry/instrumentation-fetch': { enabled: true },
      '@opentelemetry/instrumentation-fs': { enabled: false },   // 파일 I/O 노이즈 제거
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
process.on('SIGINT',  () => sdk.shutdown().finally(() => process.exit(0)));

module.exports = sdk;
