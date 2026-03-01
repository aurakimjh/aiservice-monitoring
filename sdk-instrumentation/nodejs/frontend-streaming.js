'use strict';

/**
 * Next.js / React 프론트엔드 스트리밍 계측 모듈
 *
 * SSE(Server-Sent Events) 스트림에서 청크 간 지연을 측정하고
 * 사용자 체감 끊김 현상을 OTel 이벤트로 기록합니다.
 *
 * 사용법:
 *   import { trackStreamingChunks, measureWebVitals } from './frontend-streaming';
 *
 *   const stream = await fetch('/v1/chat/completions', { ... });
 *   for await (const chunk of trackStreamingChunks(stream, { model: 'llama-3' })) {
 *     renderChunk(chunk);
 *   }
 */

const { trace, metrics, context, propagation } = require('@opentelemetry/api');

const tracer = trace.getTracer('ai.service.frontend', '1.0.0');
const meter  = metrics.getMeter('ai.service.frontend', '1.0.0');

// ── 메트릭 정의 ─────────────────────────────────────────────────────

const ttftHistogram = meter.createHistogram('frontend.streaming.ttft', {
  description: '프론트엔드 관점 TTFT — fetch 요청 후 첫 텍스트 청크 수신까지',
  unit: 'ms',
});
const interChunkDelay = meter.createHistogram('frontend.streaming.inter_chunk_delay', {
  description: '연속 청크 간 전송 지연',
  unit: 'ms',
});
const totalChunks = meter.createHistogram('frontend.streaming.chunk_count', {
  description: '스트리밍 응답의 총 청크 수',
  unit: '1',
});
const streamDuration = meter.createHistogram('frontend.streaming.duration', {
  description: '첫 청크부터 스트리밍 완료까지 소요 시간',
  unit: 'ms',
});
const delaySpikes = meter.createCounter('frontend.streaming.delay_spike.total', {
  description: '청크 간 지연이 임계치(500ms)를 초과한 횟수',
  unit: '1',
});
const lcpHistogram = meter.createHistogram('frontend.lcp', {
  description: 'Largest Contentful Paint (사용자 체감 초기 로딩 속도)',
  unit: 'ms',
});
const clsGauge = meter.createHistogram('frontend.cls', {
  description: 'Cumulative Layout Shift (레이아웃 불안정성)',
  unit: '1',
});
const fidHistogram = meter.createHistogram('frontend.fid', {
  description: 'First Input Delay (첫 인터랙션 응답성)',
  unit: 'ms',
});


/**
 * SSE/스트리밍 응답을 계측하는 비동기 제너레이터.
 *
 * @param {Response} fetchResponse - fetch()로 받은 스트리밍 Response
 * @param {object} options - 계측 옵션
 * @param {string} options.model - LLM 모델 이름
 * @param {string} options.requestId - 요청 고유 ID
 * @param {number} options.spikeThresholdMs - 지연 경고 임계치 (기본 500ms)
 * @yields {string} 스트리밍 텍스트 청크
 */
async function* trackStreamingChunks(fetchResponse, options = {}) {
  const {
    model = 'unknown',
    requestId = '',
    spikeThresholdMs = 500,
  } = options;

  const span = tracer.startSpan('frontend.streaming.receive', {
    attributes: {
      'streaming.model': model,
      'streaming.request_id': requestId,
      'streaming.spike_threshold_ms': spikeThresholdMs,
      'http.status_code': fetchResponse.status,
    },
  });

  const ctx = trace.setSpan(context.active(), span);

  try {
    await context.with(ctx, async () => {
      const reader = fetchResponse.body.getReader();
      const decoder = new TextDecoder('utf-8');

      const requestStart = performance.now();
      let firstChunkTime = null;
      let prevChunkTime  = requestStart;
      let chunkIndex     = 0;
      let totalCharsCount = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const now  = performance.now();
          const text = decoder.decode(value, { stream: true });

          // 첫 청크: TTFT 계산
          if (firstChunkTime === null) {
            firstChunkTime = now;
            const ttftMs   = firstChunkTime - requestStart;

            span.addEvent('streaming.first_chunk', {
              'streaming.ttft_ms': ttftMs,
              'streaming.chunk_index': 0,
            });
            ttftHistogram.record(ttftMs, { model });
          } else {
            // 이후 청크: 청크 간 지연 측정
            const gapMs = now - prevChunkTime;
            interChunkDelay.record(gapMs, { model });

            if (gapMs > spikeThresholdMs) {
              delaySpikes.add(1, { model });
              span.addEvent('streaming.delay_spike', {
                'streaming.chunk_index': chunkIndex,
                'streaming.gap_ms': gapMs,
                'streaming.threshold_ms': spikeThresholdMs,
              });
            }
          }

          prevChunkTime = now;
          chunkIndex++;
          totalCharsCount += text.length;

          // SSE "data: ..." 파싱
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              yield line.slice(6); // "data: " 제거
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 스트리밍 완료 후 최종 집계
      const endTime = performance.now();
      const streamTotalMs = firstChunkTime ? endTime - firstChunkTime : 0;

      span.setAttributes({
        'streaming.total_chunks': chunkIndex,
        'streaming.total_chars': totalCharsCount,
        'streaming.total_duration_ms': streamTotalMs,
        'streaming.e2e_duration_ms': endTime - requestStart,
      });

      totalChunks.record(chunkIndex, { model });
      streamDuration.record(streamTotalMs, { model });
    });
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: 2, message: err.message }); // ERROR
    throw err;
  } finally {
    span.end();
  }
}


/**
 * Web Vitals(LCP, CLS, FID)를 OTel Metric으로 전송합니다.
 * Next.js의 reportWebVitals 함수와 연결하여 사용합니다.
 *
 * 사용법 (pages/_app.js):
 *   import { measureWebVitals } from '../sdk-instrumentation/nodejs/frontend-streaming';
 *   export function reportWebVitals(metric) { measureWebVitals(metric); }
 *
 * @param {{ name: string, value: number, id: string }} metric - Web Vitals 지표
 */
function measureWebVitals(metric) {
  const { name, value, id } = metric;
  const labels = { metric_id: id };

  switch (name) {
    case 'LCP':
      lcpHistogram.record(value, labels);
      break;
    case 'CLS':
      clsGauge.record(value * 1000, labels); // CLS는 무차원 수치 → 1000배 스케일
      break;
    case 'FID':
    case 'INP': // Interaction to Next Paint (FID 대체)
      fidHistogram.record(value, labels);
      break;
    default:
      break;
  }

  // Web Vitals 이벤트를 현재 Span에도 기록
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(`web_vital.${name.toLowerCase()}`, {
      [`web_vital.${name.toLowerCase()}_ms`]: value,
      'web_vital.metric_id': id,
    });
  }
}


/**
 * fetch() 요청에 OTel Context를 주입하는 헬퍼.
 * W3C traceparent 헤더를 자동으로 추가합니다.
 *
 * @param {string} url - 요청 URL
 * @param {RequestInit} options - fetch 옵션
 * @returns {Promise<Response>}
 */
async function instrumentedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});

  // W3C TraceContext 헤더 주입
  propagation.inject(context.active(), headers, {
    set: (carrier, key, value) => carrier.set(key, value),
  });

  return fetch(url, { ...options, headers });
}


module.exports = {
  trackStreamingChunks,
  measureWebVitals,
  instrumentedFetch,
};
