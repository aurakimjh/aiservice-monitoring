// ═══════════════════════════════════════════════════════════════
// AI Copilot — Rule-based NL → PromQL Conversion Engine
// Phase 22-1
// ═══════════════════════════════════════════════════════════════

import { generateTimeSeries } from '@/lib/demo-data';

interface QueryResult {
  content: string;
  promql?: string;
  chartData?: { label: string; data: [number, number][] }[];
}

// Korean particles to strip during normalization
const KOREAN_PARTICLES = /[는은을를이가의에서으로]/g;

function normalize(input: string): string {
  return input.toLowerCase().replace(KOREAN_PARTICLES, ' ').replace(/\s+/g, ' ').trim();
}

function detectIntent(normalized: string): string {
  if (/ttft|지연/.test(normalized)) return 'ttft';
  if (/에러|error/.test(normalized)) return 'error';
  if (/gpu/.test(normalized)) return 'gpu';
  if (/비용|cost/.test(normalized)) return 'cost';
  if (/가드레일|guardrail|차단/.test(normalized)) return 'guardrail';
  if (/벡터|vector/.test(normalized)) return 'vector';
  if (/토큰|token|처리량|throughput/.test(normalized)) return 'token';
  if (/메모리|memory/.test(normalized)) return 'memory';
  if (/cpu/.test(normalized)) return 'cpu';
  if (/알림|alert/.test(normalized)) return 'alert';
  if ((/서비스|service/.test(normalized)) && (/상태|status/.test(normalized))) return 'service_status';
  return 'unknown';
}

export function processQuery(input: string): QueryResult {
  const normalized = normalize(input);
  const intent = detectIntent(normalized);

  switch (intent) {
    case 'ttft':
      return {
        content: 'TTFT(Time To First Token) P95 추이입니다. 현재 평균 245ms이며, vLLM 서비스에서 간헐적 스파이크가 관측됩니다.',
        promql: 'histogram_quantile(0.95, rate(llm_ttft_seconds_bucket{service=~".+"}[5m]))',
        chartData: [
          { label: 'vLLM TTFT P95', data: generateTimeSeries(245, 80, 30) },
          { label: 'RAG TTFT P95', data: generateTimeSeries(320, 100, 30) },
        ],
      };

    case 'error':
      return {
        content: '서비스별 에러율 추이입니다. rag-service가 1.2%로 가장 높으며, 최근 30분간 상승 추세를 보이고 있습니다.',
        promql: 'sum(rate(http_requests_total{status=~"5.."}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service) * 100',
        chartData: [
          { label: 'rag-service', data: generateTimeSeries(1.2, 0.5, 30) },
          { label: 'api-gateway', data: generateTimeSeries(0.3, 0.15, 30) },
          { label: 'auth-service', data: generateTimeSeries(0.05, 0.03, 30) },
        ],
      };

    case 'gpu':
      return {
        content: 'GPU 사용률 추이입니다. A100 GPU 4장 평균 78% 활용 중이며, GPU-2에서 VRAM 사용률이 92%로 높습니다.',
        promql: 'avg(gpu_utilization_percent{model="A100"}) by (gpu_index)',
        chartData: [
          { label: 'GPU-0 Utilization', data: generateTimeSeries(75, 15, 30) },
          { label: 'GPU-1 Utilization', data: generateTimeSeries(82, 10, 30) },
          { label: 'GPU-2 Utilization', data: generateTimeSeries(92, 5, 30) },
          { label: 'GPU-3 Utilization', data: generateTimeSeries(63, 20, 30) },
        ],
      };

    case 'cost':
      return {
        content: '시간당 AI 서비스 비용 추이입니다. 현재 시간당 $12.5이며, 일일 예산 $280 대비 87% 소진 중입니다. vLLM 추론 비용이 전체의 68%를 차지합니다.',
        promql: 'sum(rate(llm_cost_dollars_total[1h])) by (service)',
        chartData: [
          { label: 'vLLM Inference', data: generateTimeSeries(8.5, 2, 30) },
          { label: 'Embedding', data: generateTimeSeries(2.1, 0.5, 30) },
          { label: 'Guardrail', data: generateTimeSeries(1.9, 0.3, 30) },
        ],
      };

    case 'guardrail':
      return {
        content: '가드레일 차단률 추이입니다. 전체 요청 대비 2.8% 차단 중이며, PII 탐지가 가장 많은 비중(45%)을 차지합니다.',
        promql: 'sum(rate(guardrail_blocked_total[5m])) / sum(rate(guardrail_checks_total[5m])) * 100',
        chartData: [
          { label: 'Block Rate %', data: generateTimeSeries(2.8, 1.2, 30) },
          { label: 'PII Detection', data: generateTimeSeries(1.3, 0.5, 30) },
          { label: 'Harmful Content', data: generateTimeSeries(0.8, 0.4, 30) },
        ],
      };

    case 'vector':
      return {
        content: 'VectorDB(Qdrant) 검색 지연 추이입니다. P95 기준 12ms이며 안정적인 상태입니다. 인덱스 최적화 후 20% 개선되었습니다.',
        promql: 'histogram_quantile(0.95, rate(vectordb_search_duration_seconds_bucket{engine="qdrant"}[5m]))',
        chartData: [
          { label: 'Search P95 (ms)', data: generateTimeSeries(12, 4, 30) },
          { label: 'Insert P95 (ms)', data: generateTimeSeries(8, 3, 30) },
        ],
      };

    case 'token':
      return {
        content: '토큰 처리량(Tokens Per Second) 추이입니다. 현재 평균 85 TPS이며, 피크 시간대에 120 TPS까지 올라갑니다.',
        promql: 'sum(rate(llm_tokens_generated_total[5m])) by (service)',
        chartData: [
          { label: 'TPS (tokens/sec)', data: generateTimeSeries(85, 25, 30) },
        ],
      };

    case 'memory':
      return {
        content: '호스트별 메모리 사용률 추이입니다. gpu-node-01이 88%로 가장 높으며, 임계치(90%) 근접 알림이 설정되어 있습니다.',
        promql: 'node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100',
        chartData: [
          { label: 'gpu-node-01', data: generateTimeSeries(88, 5, 30) },
          { label: 'gpu-node-02', data: generateTimeSeries(72, 8, 30) },
          { label: 'app-server-01', data: generateTimeSeries(65, 10, 30) },
        ],
      };

    case 'cpu':
      return {
        content: '호스트별 CPU 사용률 추이입니다. app-server-01이 평균 68%이며, 전반적으로 안정적인 범위 내에 있습니다.',
        promql: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance) * 100)',
        chartData: [
          { label: 'app-server-01', data: generateTimeSeries(68, 15, 30) },
          { label: 'gpu-node-01', data: generateTimeSeries(45, 12, 30) },
          { label: 'gpu-node-02', data: generateTimeSeries(52, 10, 30) },
        ],
      };

    case 'alert':
      return {
        content: '현재 활성 알림 요약:\n\n' +
          '🔴 Critical (1건)\n' +
          '  • rag-service 에러율 1.2% — 임계치(1.0%) 초과, 15분 전 발생\n\n' +
          '🟡 Warning (2건)\n' +
          '  • GPU-2 VRAM 사용률 92% — 임계치(90%) 초과\n' +
          '  • api-gateway P95 지연 320ms — 임계치(300ms) 초과\n\n' +
          '총 3건의 활성 알림이 있으며, 1건이 Critical 등급입니다.',
      };

    case 'service_status':
      return {
        content: '서비스 상태 요약:\n\n' +
          '✅ Healthy (5개): api-gateway, auth-service, embedding-svc, guardrail, Qdrant\n' +
          '⚠️ Warning (1개): rag-service — 에러율 상승 (1.2%)\n' +
          '🔴 Critical (0개)\n\n' +
          '전체 6개 서비스 중 5개가 정상 운영 중입니다. rag-service의 에러율 추이를 주시하시기 바랍니다.',
      };

    default:
      return {
        content: 'AI 모니터링 메트릭, 알림, 서비스 분석을 도와드릴 수 있습니다.\n\n' +
          '다음과 같이 질문해 보세요:\n' +
          '  • "TTFT 추이 보여줘"\n' +
          '  • "GPU 사용률"\n' +
          '  • "에러율이 높은 서비스"\n' +
          '  • "현재 알림 요약"\n' +
          '  • "서비스 상태"',
      };
  }
}
