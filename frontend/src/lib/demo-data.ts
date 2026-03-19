import type { Project, Host, Service, AIService, AlertEvent, Status } from '@/types/monitoring';

// ═══════════════════════════════════════════════════════════════
// Demo Data — 백엔드 없이 프론트엔드 개발/데모용
// ═══════════════════════════════════════════════════════════════

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'proj-ai-prod',
    name: 'AI-Production',
    description: 'Production AI services including RAG chatbot, code assistant, and document summarizer',
    environment: 'production',
    tags: { team: 'ai-platform', region: 'ap-northeast-2' },
    hostCount: 12,
    serviceCount: 8,
    aiServiceCount: 3,
    alertCount: 1,
    errorRate: 0.12,
    p95Latency: 245,
    sloCompliance: 99.7,
    status: 'healthy',
    lastActivity: new Date(Date.now() - 2 * 60_000).toISOString(),
  },
  {
    id: 'proj-ecom-stg',
    name: 'E-Commerce-Staging',
    description: 'Staging environment for e-commerce platform with recommendation engine',
    environment: 'staging',
    tags: { team: 'commerce', region: 'ap-northeast-2' },
    hostCount: 6,
    serviceCount: 5,
    aiServiceCount: 0,
    alertCount: 2,
    errorRate: 0.85,
    p95Latency: 380,
    sloCompliance: 98.2,
    status: 'warning',
    lastActivity: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
  {
    id: 'proj-bank-core',
    name: 'Banking-Core',
    description: 'Core banking system with AI-powered fraud detection',
    environment: 'production',
    tags: { team: 'fintech', region: 'ap-northeast-2', compliance: 'pci-dss' },
    hostCount: 20,
    serviceCount: 15,
    aiServiceCount: 1,
    alertCount: 0,
    errorRate: 0.05,
    p95Latency: 120,
    sloCompliance: 99.95,
    status: 'healthy',
    lastActivity: new Date(Date.now() - 30_000).toISOString(),
  },
  {
    id: 'proj-ml-train',
    name: 'ML-Training',
    description: 'GPU cluster for model training and fine-tuning experiments',
    environment: 'development',
    tags: { team: 'ml-research', gpu: 'a100' },
    hostCount: 4,
    serviceCount: 2,
    aiServiceCount: 2,
    alertCount: 3,
    errorRate: 2.1,
    p95Latency: 1200,
    sloCompliance: 92.5,
    status: 'critical',
    lastActivity: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
];

export function getProjectHosts(projectId: string): Host[] {
  const hostSets: Record<string, Host[]> = {
    'proj-ai-prod': [
      { id: 'h-api-01', hostname: 'prod-api-01', os: 'Ubuntu 22.04', cpuCores: 16, memoryGB: 64, status: 'healthy', cpuPercent: 45, memPercent: 62, diskPercent: 38, netIO: '120MB/s', middlewares: [{ type: 'was', name: 'FastAPI', version: '0.104', port: 8000, status: 'running' }], agent: { id: 'a-01', hostId: 'h-api-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-api-02', hostname: 'prod-api-02', os: 'Ubuntu 22.04', cpuCores: 16, memoryGB: 64, status: 'healthy', cpuPercent: 52, memPercent: 58, diskPercent: 41, netIO: '95MB/s', middlewares: [{ type: 'was', name: 'FastAPI', version: '0.104', port: 8000, status: 'running' }], agent: { id: 'a-02', hostId: 'h-api-02', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-gpu-01', hostname: 'prod-gpu-01', os: 'Ubuntu 22.04', cpuCores: 32, memoryGB: 128, status: 'healthy', cpuPercent: 78, memPercent: 81, diskPercent: 55, netIO: '240MB/s', middlewares: [{ type: 'llm', name: 'vLLM', version: '0.4.2', port: 8000, status: 'running' }, { type: 'vectordb', name: 'Qdrant', version: '1.8.0', port: 6333, status: 'running' }], gpus: [{ index: 0, model: 'A100 80GB', vramTotal: 80, vramUsed: 57.6, vramPercent: 72, temperature: 62, powerDraw: 280, smOccupancy: 85 }, { index: 1, model: 'A100 80GB', vramTotal: 80, vramUsed: 54.4, vramPercent: 68, temperature: 58, powerDraw: 265, smOccupancy: 80 }], agent: { id: 'a-03', hostId: 'h-gpu-01', version: '1.2.0', status: 'healthy', plugins: [{ id: 'ai-gpu-serving', name: 'GPU/Serving', version: '1.0.0', status: 'active', itemsCovered: ['ITEM0207', 'ITEM0220'] }], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-gpu-02', hostname: 'prod-gpu-02', os: 'Ubuntu 22.04', cpuCores: 32, memoryGB: 128, status: 'warning', cpuPercent: 92, memPercent: 88, diskPercent: 60, netIO: '310MB/s', middlewares: [{ type: 'llm', name: 'vLLM', version: '0.4.2', port: 8000, status: 'running' }], gpus: [{ index: 0, model: 'A100 80GB', vramTotal: 80, vramUsed: 71.2, vramPercent: 89, temperature: 71, powerDraw: 310, smOccupancy: 92 }, { index: 1, model: 'A100 80GB', vramTotal: 80, vramUsed: 65.6, vramPercent: 82, temperature: 65, powerDraw: 290, smOccupancy: 88 }], agent: { id: 'a-04', hostId: 'h-gpu-02', version: '1.1.9', status: 'degraded', plugins: [{ id: 'ai-gpu-serving', name: 'GPU/Serving', version: '1.0.0', status: 'active', itemsCovered: ['ITEM0207', 'ITEM0220'] }], lastHeartbeat: new Date(Date.now() - 120_000).toISOString(), lastCollection: new Date(Date.now() - 120_000).toISOString(), mode: 'full' } },
      { id: 'h-db-01', hostname: 'prod-db-01', os: 'RHEL 9', cpuCores: 8, memoryGB: 32, status: 'healthy', cpuPercent: 35, memPercent: 75, diskPercent: 72, netIO: '80MB/s', middlewares: [{ type: 'db', name: 'PostgreSQL', version: '16.2', port: 5432, status: 'running' }], agent: { id: 'a-05', hostId: 'h-db-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-redis-01', hostname: 'prod-redis-01', os: 'Ubuntu 22.04', cpuCores: 4, memoryGB: 16, status: 'healthy', cpuPercent: 18, memPercent: 45, diskPercent: 22, netIO: '50MB/s', middlewares: [{ type: 'cache', name: 'Redis', version: '7.2', port: 6379, status: 'running' }], agent: { id: 'a-06', hostId: 'h-redis-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
    ],
  };
  return hostSets[projectId] ?? hostSets['proj-ai-prod'];
}

export function getProjectServices(projectId: string): Service[] {
  const sets: Record<string, Service[]> = {
    'proj-ai-prod': [
      { id: 's-apigw', name: 'api-gateway', framework: 'Express', language: 'Node.js', hostIds: ['h-api-01', 'h-api-02'], latencyP50: 85, latencyP95: 245, latencyP99: 420, rpm: 1200, errorRate: 0.12, status: 'healthy' },
      { id: 's-rag', name: 'rag-service', framework: 'FastAPI', language: 'Python', hostIds: ['h-gpu-01', 'h-gpu-02'], latencyP50: 820, latencyP95: 1800, latencyP99: 3200, rpm: 450, errorRate: 0.22, status: 'healthy' },
      { id: 's-embed', name: 'embedding-service', framework: 'FastAPI', language: 'Python', hostIds: ['h-gpu-01'], latencyP50: 45, latencyP95: 120, latencyP99: 200, rpm: 800, errorRate: 0.05, status: 'healthy' },
      { id: 's-auth', name: 'auth-service', framework: 'Spring Boot', language: 'Java', hostIds: ['h-api-01'], latencyP50: 25, latencyP95: 45, latencyP99: 80, rpm: 600, errorRate: 0.01, status: 'healthy' },
    ],
  };
  return sets[projectId] ?? sets['proj-ai-prod'];
}

export function getProjectAIServices(projectId: string): AIService[] {
  const sets: Record<string, AIService[]> = {
    'proj-ai-prod': [
      { id: 'ai-rag', name: 'rag-service', type: 'rag', model: 'GPT-4-Turbo', hostIds: ['h-gpu-01', 'h-gpu-02'], ttftP95: 1200, tpsP50: 42, gpuVramPercent: 72, errorRate: 0.22, costPerHour: 8.5, guardrailBlockRate: 2.1, status: 'healthy' },
      { id: 'ai-code', name: 'code-assistant', type: 'llm', model: 'Claude-3.5-Sonnet', hostIds: [], ttftP95: 800, tpsP50: 55, errorRate: 0.1, costPerHour: 3.2, guardrailBlockRate: 0.5, status: 'healthy' },
      { id: 'ai-doc', name: 'doc-summarizer', type: 'llm', model: 'Llama-3-70B', hostIds: ['h-gpu-02'], ttftP95: 2500, tpsP50: 28, gpuVramPercent: 89, errorRate: 0.8, costPerHour: 0.8, guardrailBlockRate: 1.2, status: 'warning' },
    ],
  };
  return sets[projectId] ?? sets['proj-ai-prod'];
}

export function getProjectAlerts(projectId: string): AlertEvent[] {
  const sets: Record<string, AlertEvent[]> = {
    'proj-ai-prod': [
      { id: 'al-1', severity: 'critical', ruleName: 'GPU_VRAM_Critical', target: 'prod-gpu-02', message: 'VRAM usage at 94%', value: '94%', timestamp: new Date(Date.now() - 3 * 60_000).toISOString(), status: 'firing' },
      { id: 'al-2', severity: 'warning', ruleName: 'LLM_TTFT_High', target: 'rag-service', message: 'TTFT P95 exceeds 2s', value: '2.8s', timestamp: new Date(Date.now() - 15 * 60_000).toISOString(), status: 'firing' },
      { id: 'al-3', severity: 'info', ruleName: 'DB_Connection_Pool', target: 'pg-master', message: 'Pool usage 95%', value: '95%', timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), status: 'resolved' },
    ],
  };
  return sets[projectId] ?? sets['proj-ai-prod'];
}

// 시계열 데모 데이터 생성 유틸
export function generateTimeSeries(base: number, variance: number, points: number): [number, number][] {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => [
    now - (points - i) * 60_000,
    Math.max(0, base + (Math.random() - 0.5) * variance * 2),
  ] as [number, number]);
}

export function getHealthCells(projectId: string): { id: string; label: string; status: Status; detail?: string }[] {
  const hosts = getProjectHosts(projectId);
  return hosts.map((h) => ({
    id: h.id,
    label: h.hostname,
    status: h.status,
    detail: h.gpus ? `GPU VRAM: ${h.gpus[0]?.vramPercent}%` : `CPU: ${h.cpuPercent}%`,
  }));
}
