import type { Project, Host, Service, AIService, AlertEvent, Endpoint, DeploymentEvent, ServiceDependency, Transaction, TransactionSpan, TransactionStatus, Trace, TraceSpan, LogEntry, LogLevel, LogPattern, MetricDefinition, Status } from '@/types/monitoring';

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

// ═══════════════════════════════════════════════════════════════
// Service Topology — 서비스 맵용 노드/엣지 데이터
// ═══════════════════════════════════════════════════════════════

export type ServiceLayer = 'ui' | 'agent' | 'llm' | 'data' | 'infra';

export interface TopologyNode {
  id: string;
  name: string;
  layer: ServiceLayer;
  status: Status;
  rpm: number;
  errorRate: number;
  p95: number;
  framework?: string;
}

export interface TopologyEdge {
  source: string;
  target: string;
  rpm: number;
  errorRate: number;
  p95: number;
}

export const LAYER_CONFIG: Record<ServiceLayer, { label: string; color: string; y: number }> = {
  ui: { label: 'Layer 1: UI/App', color: '#58A6FF', y: 0 },
  agent: { label: 'Layer 2: Agent', color: '#BC8CFF', y: 1 },
  llm: { label: 'Layer 3: LLM', color: '#F778BA', y: 2 },
  data: { label: 'Layer 4: Data', color: '#3FB950', y: 3 },
  infra: { label: 'Layer 5: Infra', color: '#D29922', y: 4 },
};

export function getServiceTopology(projectId: string): { nodes: TopologyNode[]; edges: TopologyEdge[] } {
  // Default: AI-Production topology
  const nodes: TopologyNode[] = [
    { id: 'client', name: 'Client (Browser)', layer: 'ui', status: 'healthy', rpm: 1200, errorRate: 0, p95: 0, framework: 'Browser' },
    { id: 'api-gw', name: 'api-gateway', layer: 'ui', status: 'healthy', rpm: 1200, errorRate: 0.12, p95: 245, framework: 'Express' },
    { id: 'rag-svc', name: 'rag-service', layer: 'agent', status: 'healthy', rpm: 450, errorRate: 0.22, p95: 1800, framework: 'FastAPI' },
    { id: 'auth-svc', name: 'auth-service', layer: 'ui', status: 'healthy', rpm: 600, errorRate: 0.01, p95: 45, framework: 'Spring Boot' },
    { id: 'embed-svc', name: 'embedding-service', layer: 'agent', status: 'healthy', rpm: 800, errorRate: 0.05, p95: 120, framework: 'FastAPI' },
    { id: 'vllm', name: 'vLLM Inference', layer: 'llm', status: 'healthy', rpm: 450, errorRate: 0.1, p95: 1200, framework: 'vLLM' },
    { id: 'guardrail', name: 'Guardrail', layer: 'agent', status: 'healthy', rpm: 900, errorRate: 0.05, p95: 80, framework: 'NeMo' },
    { id: 'qdrant', name: 'Qdrant', layer: 'data', status: 'healthy', rpm: 800, errorRate: 0.02, p95: 120, framework: 'Qdrant' },
    { id: 'postgres', name: 'PostgreSQL', layer: 'data', status: 'healthy', rpm: 600, errorRate: 0.01, p95: 15, framework: 'PostgreSQL 16' },
    { id: 'redis', name: 'Redis Cache', layer: 'data', status: 'healthy', rpm: 2000, errorRate: 0, p95: 3, framework: 'Redis 7.2' },
  ];

  const edges: TopologyEdge[] = [
    { source: 'client', target: 'api-gw', rpm: 1200, errorRate: 0, p95: 245 },
    { source: 'api-gw', target: 'rag-svc', rpm: 450, errorRate: 0.1, p95: 1800 },
    { source: 'api-gw', target: 'auth-svc', rpm: 600, errorRate: 0.01, p95: 45 },
    { source: 'rag-svc', target: 'guardrail', rpm: 900, errorRate: 0.02, p95: 80 },
    { source: 'rag-svc', target: 'embed-svc', rpm: 450, errorRate: 0.03, p95: 120 },
    { source: 'rag-svc', target: 'vllm', rpm: 450, errorRate: 0.1, p95: 1200 },
    { source: 'embed-svc', target: 'qdrant', rpm: 800, errorRate: 0.02, p95: 120 },
    { source: 'rag-svc', target: 'redis', rpm: 1200, errorRate: 0, p95: 3 },
    { source: 'auth-svc', target: 'postgres', rpm: 600, errorRate: 0.01, p95: 15 },
    { source: 'auth-svc', target: 'redis', rpm: 400, errorRate: 0, p95: 2 },
  ];

  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════
// Service Detail — 서비스 상세 대시보드용 데이터
// ═══════════════════════════════════════════════════════════════

export function getServiceEndpoints(serviceId: string): Endpoint[] {
  const sets: Record<string, Endpoint[]> = {
    's-apigw': [
      { id: 'ep-1', method: 'GET', path: '/api/health', rpm: 120, latencyP50: 5, latencyP95: 12, latencyP99: 25, errorRate: 0, contribution: 10 },
      { id: 'ep-2', method: 'POST', path: '/api/chat', rpm: 450, latencyP50: 120, latencyP95: 340, latencyP99: 580, errorRate: 0.15, contribution: 37.5 },
      { id: 'ep-3', method: 'GET', path: '/api/conversations', rpm: 280, latencyP50: 45, latencyP95: 95, latencyP99: 180, errorRate: 0.05, contribution: 23.3 },
      { id: 'ep-4', method: 'POST', path: '/api/auth/token', rpm: 200, latencyP50: 30, latencyP95: 55, latencyP99: 90, errorRate: 0.02, contribution: 16.7 },
      { id: 'ep-5', method: 'GET', path: '/api/models', rpm: 80, latencyP50: 15, latencyP95: 28, latencyP99: 45, errorRate: 0, contribution: 6.7 },
      { id: 'ep-6', method: 'DELETE', path: '/api/conversations/:id', rpm: 70, latencyP50: 35, latencyP95: 70, latencyP99: 120, errorRate: 0.01, contribution: 5.8 },
    ],
    's-rag': [
      { id: 'ep-10', method: 'POST', path: '/api/chat', rpm: 200, latencyP50: 820, latencyP95: 1800, latencyP99: 3200, errorRate: 0.3, contribution: 44.4 },
      { id: 'ep-11', method: 'POST', path: '/api/search', rpm: 150, latencyP50: 350, latencyP95: 700, latencyP99: 1200, errorRate: 0.1, contribution: 33.3 },
      { id: 'ep-12', method: 'POST', path: '/api/embed', rpm: 60, latencyP50: 120, latencyP95: 280, latencyP99: 450, errorRate: 0.05, contribution: 13.3 },
      { id: 'ep-13', method: 'GET', path: '/api/health', rpm: 40, latencyP50: 3, latencyP95: 8, latencyP99: 15, errorRate: 0, contribution: 8.9 },
    ],
    's-embed': [
      { id: 'ep-20', method: 'POST', path: '/api/embed', rpm: 500, latencyP50: 42, latencyP95: 110, latencyP99: 190, errorRate: 0.03, contribution: 62.5 },
      { id: 'ep-21', method: 'POST', path: '/api/embed/batch', rpm: 200, latencyP50: 180, latencyP95: 350, latencyP99: 500, errorRate: 0.08, contribution: 25 },
      { id: 'ep-22', method: 'GET', path: '/api/health', rpm: 60, latencyP50: 2, latencyP95: 5, latencyP99: 10, errorRate: 0, contribution: 7.5 },
      { id: 'ep-23', method: 'GET', path: '/api/models', rpm: 40, latencyP50: 8, latencyP95: 18, latencyP99: 30, errorRate: 0, contribution: 5 },
    ],
    's-auth': [
      { id: 'ep-30', method: 'POST', path: '/api/auth/login', rpm: 180, latencyP50: 25, latencyP95: 45, latencyP99: 80, errorRate: 0.02, contribution: 30 },
      { id: 'ep-31', method: 'POST', path: '/api/auth/token', rpm: 250, latencyP50: 15, latencyP95: 30, latencyP99: 55, errorRate: 0.01, contribution: 41.7 },
      { id: 'ep-32', method: 'GET', path: '/api/auth/verify', rpm: 120, latencyP50: 10, latencyP95: 22, latencyP99: 40, errorRate: 0, contribution: 20 },
      { id: 'ep-33', method: 'POST', path: '/api/auth/logout', rpm: 50, latencyP50: 8, latencyP95: 18, latencyP99: 30, errorRate: 0, contribution: 8.3 },
    ],
  };
  return sets[serviceId] ?? sets['s-apigw'];
}

export function getServiceDeployments(serviceId: string): DeploymentEvent[] {
  const now = Date.now();
  const sets: Record<string, DeploymentEvent[]> = {
    's-apigw': [
      { id: 'd-1', version: 'v2.4.1', timestamp: new Date(now - 2 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'a3f8c2d', description: 'Fix CORS headers for new client SDK', duration: 45 },
      { id: 'd-2', version: 'v2.4.0', timestamp: new Date(now - 26 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'b7e1f90', description: 'Add rate limiting per API key', duration: 62 },
      { id: 'd-3', version: 'v2.3.9', timestamp: new Date(now - 72 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'c4d2a11', description: 'Upgrade Express to 4.19', duration: 38 },
      { id: 'd-4', version: 'v2.3.8', timestamp: new Date(now - 168 * 3600_000).toISOString(), status: 'failed', deployer: 'park.js', commitHash: 'e9f0b33', description: 'WebSocket connection pooling (rolled back)', duration: 120 },
    ],
    's-rag': [
      { id: 'd-10', version: 'v1.8.0', timestamp: new Date(now - 5 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'f1a2b3c', description: 'Upgrade to GPT-4-Turbo with streaming', duration: 180 },
      { id: 'd-11', version: 'v1.7.5', timestamp: new Date(now - 48 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'g4h5i6j', description: 'Add context window overflow handling', duration: 95 },
      { id: 'd-12', version: 'v1.7.4', timestamp: new Date(now - 120 * 3600_000).toISOString(), status: 'rolling-back', deployer: 'lee.ml', commitHash: 'k7l8m9n', description: 'Qdrant index migration (partial rollback)', duration: 300 },
    ],
    's-embed': [
      { id: 'd-20', version: 'v3.1.0', timestamp: new Date(now - 8 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'o1p2q3r', description: 'Switch to text-embedding-3-large', duration: 55 },
      { id: 'd-21', version: 'v3.0.9', timestamp: new Date(now - 96 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 's4t5u6v', description: 'Batch embedding optimization', duration: 42 },
      { id: 'd-22', version: 'v3.0.8', timestamp: new Date(now - 240 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'w7x8y9z', description: 'Add embedding cache layer', duration: 68 },
    ],
    's-auth': [
      { id: 'd-30', version: 'v5.2.0', timestamp: new Date(now - 12 * 3600_000).toISOString(), status: 'success', deployer: 'park.js', commitHash: 'a1b2c3d', description: 'Add MFA support for admin accounts', duration: 75 },
      { id: 'd-31', version: 'v5.1.9', timestamp: new Date(now - 72 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'e4f5g6h', description: 'JWT rotation key update', duration: 30 },
      { id: 'd-32', version: 'v5.1.8', timestamp: new Date(now - 168 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'i7j8k9l', description: 'Spring Boot 3.2 upgrade', duration: 90 },
    ],
  };
  return sets[serviceId] ?? sets['s-apigw'];
}

export function getServiceDependencies(serviceId: string): ServiceDependency[] {
  const topology = getServiceTopology('proj-ai-prod');
  const deps: ServiceDependency[] = [];

  // Find edges where this service is source (downstream deps)
  // or target (upstream callers) using topology node names
  const nodeMap: Record<string, string> = {
    's-apigw': 'api-gw',
    's-rag': 'rag-svc',
    's-embed': 'embed-svc',
    's-auth': 'auth-svc',
  };
  const reverseNodeMap: Record<string, string> = {};
  for (const [svcId, nodeId] of Object.entries(nodeMap)) {
    reverseNodeMap[nodeId] = svcId;
  }

  const topoNodeId = nodeMap[serviceId];
  if (!topoNodeId) return deps;

  for (const edge of topology.edges) {
    if (edge.source === topoNodeId) {
      const targetNode = topology.nodes.find((n) => n.id === edge.target);
      if (targetNode) {
        deps.push({
          serviceId: reverseNodeMap[edge.target] ?? edge.target,
          serviceName: targetNode.name,
          direction: 'downstream',
          rpm: edge.rpm,
          errorRate: edge.errorRate,
          latencyP95: edge.p95,
          status: targetNode.status,
        });
      }
    }
    if (edge.target === topoNodeId) {
      const sourceNode = topology.nodes.find((n) => n.id === edge.source);
      if (sourceNode) {
        deps.push({
          serviceId: reverseNodeMap[edge.source] ?? edge.source,
          serviceName: sourceNode.name,
          direction: 'upstream',
          rpm: edge.rpm,
          errorRate: edge.errorRate,
          latencyP95: edge.p95,
          status: sourceNode.status,
        });
      }
    }
  }

  return deps;
}

export function generateXLogScatterData(
  service: { latencyP50: number; latencyP95: number; errorRate: number },
  points = 500,
): [number, number, boolean][] {
  const now = Date.now();
  const data: [number, number, boolean][] = [];
  for (let i = 0; i < points; i++) {
    const timestamp = now - (points - i) * 6000 + Math.random() * 3000;
    const isError = Math.random() * 100 < service.errorRate;
    // Log-normal-ish distribution centered around P50
    const base = service.latencyP50;
    const jitter = Math.random();
    let responseTime: number;
    if (jitter < 0.5) {
      responseTime = base * (0.3 + Math.random() * 1.0);
    } else if (jitter < 0.9) {
      responseTime = base + (service.latencyP95 - base) * Math.random();
    } else {
      responseTime = service.latencyP95 + (service.latencyP95 * 0.5) * Math.random();
    }
    if (isError) {
      responseTime *= 1.5 + Math.random() * 2;
    }
    data.push([timestamp, Math.round(responseTime), isError]);
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════
// Transactions — XLog/HeatMap 통합 대시보드용 트랜잭션 데이터
// ═══════════════════════════════════════════════════════════════

const ENDPOINTS = [
  'POST /api/chat',
  'POST /api/chat/stream',
  'POST /api/search',
  'POST /api/documents',
  'GET /api/health',
  'POST /api/embed',
];

const SERVICES = ['rag-service', 'api-gateway', 'embedding-service', 'auth-service'];

function randomHex(len: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * 16)];
  return result;
}

function classifyStatus(elapsed: number, isError: boolean): TransactionStatus {
  if (isError) return 'error';
  if (elapsed >= 3000) return 'very_slow';
  if (elapsed >= 1000) return 'slow';
  return 'normal';
}

export function generateTransactions(count = 200, serviceFilter?: string): Transaction[] {
  const now = Date.now();
  const txns: Transaction[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i) * 3000 + Math.random() * 2000;
    const service = serviceFilter ?? SERVICES[Math.floor(Math.random() * SERVICES.length)];
    const isRag = service === 'rag-service';
    const endpoint = isRag
      ? ENDPOINTS[Math.floor(Math.random() * 3)] // chat, stream, search
      : ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];

    // Elapsed time distribution
    const base = isRag ? 800 : 120;
    const jitter = Math.random();
    let elapsed: number;
    if (jitter < 0.6) elapsed = base * (0.3 + Math.random() * 1.2);
    else if (jitter < 0.92) elapsed = base + (base * 2) * Math.random();
    else elapsed = base * 3 + base * 2 * Math.random();
    elapsed = Math.round(elapsed);

    const isError = Math.random() < 0.04;
    const isBlock = !isError && Math.random() < 0.02;
    const status = classifyStatus(elapsed, isError || isBlock);
    const statusCode = isError ? (Math.random() < 0.5 ? 500 : 502) : 200;

    const traceId = randomHex(32);
    const rootSpanId = randomHex(12);

    // RAG pipeline spans
    const guardrailIn = Math.round(20 + Math.random() * 40);
    const embedding = Math.round(20 + Math.random() * 30);
    const vectorSearch = Math.round(30 + Math.random() * 50);
    const llmInference = Math.max(100, elapsed - guardrailIn - embedding - vectorSearch - 30);
    const guardrailOut = Math.round(10 + Math.random() * 20);

    const ttft = isRag ? Math.round(llmInference * 0.3 + Math.random() * 100) : 0;
    const tps = isRag ? Math.round(20 + Math.random() * 40 * 10) / 10 : 0;
    const tokens = isRag ? Math.round(tps * (llmInference / 1000)) : 0;

    const spans: TransactionSpan[] = isRag ? [
      { spanId: randomHex(12), parentId: rootSpanId, name: 'rag.guardrail_input_check', startOffset: 0, duration: guardrailIn, status: 'ok' as const, attributes: { 'guardrail.action': isBlock ? 'BLOCK' : 'PASS', 'guardrail.policy': 'content_safety' } },
      { spanId: randomHex(12), parentId: rootSpanId, name: 'rag.embedding', startOffset: guardrailIn + 2, duration: embedding, status: 'ok' as const, attributes: { 'embedding.model': 'text-embedding-3-large', 'embedding.dimensions': 1536 } },
      { spanId: randomHex(12), parentId: rootSpanId, name: 'rag.vector_search', startOffset: guardrailIn + embedding + 5, duration: vectorSearch, status: 'ok' as const, attributes: { 'vectordb.engine': 'qdrant', 'vectordb.results_count': Math.floor(3 + Math.random() * 5) } },
      { spanId: randomHex(12), parentId: rootSpanId, name: 'rag.llm_inference', startOffset: guardrailIn + embedding + vectorSearch + 8, duration: llmInference, status: isError ? 'error' as const : 'ok' as const, attributes: { 'llm.model': 'gpt-4o', 'llm.ttft_ms': ttft, 'llm.tokens': tokens, 'llm.tps': tps } },
      { spanId: randomHex(12), parentId: rootSpanId, name: 'rag.guardrail_output_check', startOffset: elapsed - guardrailOut, duration: guardrailOut, status: 'ok' as const, attributes: { 'guardrail.action': 'PASS' } },
    ] : [
      { spanId: randomHex(12), parentId: rootSpanId, name: `${service}.handler`, startOffset: 0, duration: elapsed, status: isError ? 'error' as const : 'ok' as const, attributes: { 'http.method': endpoint.split(' ')[0], 'http.target': endpoint.split(' ')[1] } },
    ];

    txns.push({
      traceId,
      rootSpanId,
      timestamp,
      elapsed,
      service,
      endpoint,
      status,
      statusCode,
      metrics: {
        ttft_ms: ttft,
        tps,
        tokens_generated: tokens,
        guardrail_action: isBlock ? 'BLOCK' : 'PASS',
      },
      spans,
    });
  }

  return txns;
}

// HeatMap 데이터 생성: [시간 버킷, 응답시간 버킷, 트랜잭션 수]
export function generateHeatMapData(
  transactions: Transaction[],
  timeBuckets = 30,
  latencyBuckets = ['0-100', '100-300', '300-500', '500-1000', '1000-2000', '2000-3000', '3000+'],
): [number, number, number][] {
  if (transactions.length === 0) return [];
  const minT = Math.min(...transactions.map((t) => t.timestamp));
  const maxT = Math.max(...transactions.map((t) => t.timestamp));
  const bucketWidth = (maxT - minT) / timeBuckets || 1;

  const grid: number[][] = Array.from({ length: timeBuckets }, () =>
    new Array(latencyBuckets.length).fill(0),
  );

  for (const txn of transactions) {
    const tIdx = Math.min(Math.floor((txn.timestamp - minT) / bucketWidth), timeBuckets - 1);
    let lIdx: number;
    if (txn.elapsed < 100) lIdx = 0;
    else if (txn.elapsed < 300) lIdx = 1;
    else if (txn.elapsed < 500) lIdx = 2;
    else if (txn.elapsed < 1000) lIdx = 3;
    else if (txn.elapsed < 2000) lIdx = 4;
    else if (txn.elapsed < 3000) lIdx = 5;
    else lIdx = 6;
    grid[tIdx][lIdx]++;
  }

  const data: [number, number, number][] = [];
  for (let t = 0; t < timeBuckets; t++) {
    for (let l = 0; l < latencyBuckets.length; l++) {
      data.push([t, l, grid[t][l]]);
    }
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════
// Distributed Traces — 트레이스 상세 워터폴용 데이터
// ═══════════════════════════════════════════════════════════════

function generateTraceSpans(traceId: string, startTime: number): TraceSpan[] {
  const rootId = randomHex(16);
  const spans: TraceSpan[] = [];

  // api-gateway root span
  const gwDur = 1800 + Math.round(Math.random() * 400);
  spans.push({
    spanId: rootId, parentSpanId: '', traceId, service: 'api-gateway', name: 'POST /api/chat',
    kind: 'server', startTime, duration: gwDur, status: 'ok', attributes: { 'http.method': 'POST', 'http.target': '/api/chat', 'http.status_code': 200 }, events: [],
  });

  // auth check
  const authId = randomHex(16);
  const authStart = startTime + 5;
  const authDur = 15 + Math.round(Math.random() * 10);
  spans.push({
    spanId: authId, parentSpanId: rootId, traceId, service: 'auth-service', name: 'auth.verify_token',
    kind: 'server', startTime: authStart, duration: authDur, status: 'ok', attributes: { 'auth.method': 'JWT', 'auth.user_id': 'user_29384' }, events: [],
  });

  // redis cache check from auth
  spans.push({
    spanId: randomHex(16), parentSpanId: authId, traceId, service: 'auth-service', name: 'redis.get',
    kind: 'client', startTime: authStart + 2, duration: 3, status: 'ok', attributes: { 'db.system': 'redis', 'db.operation': 'GET', 'db.key': 'session:user_29384' }, events: [],
  });

  // rag-service
  const ragId = randomHex(16);
  const ragStart = startTime + authDur + 10;
  const ragDur = gwDur - authDur - 30;
  spans.push({
    spanId: ragId, parentSpanId: rootId, traceId, service: 'rag-service', name: 'rag.pipeline',
    kind: 'server', startTime: ragStart, duration: ragDur, status: 'ok', attributes: { 'rag.pipeline_id': 'chat_v2', 'rag.model': 'gpt-4o' }, events: [],
  });

  // guardrail input
  const gInId = randomHex(16);
  const gInDur = 30 + Math.round(Math.random() * 25);
  spans.push({
    spanId: gInId, parentSpanId: ragId, traceId, service: 'rag-service', name: 'rag.guardrail_input_check',
    kind: 'internal', startTime: ragStart + 2, duration: gInDur, status: 'ok', attributes: { 'guardrail.action': 'PASS', 'guardrail.policy': 'content_safety', 'guardrail.score': 0.12 },
    events: [{ name: 'policy_evaluation_complete', timestamp: ragStart + 2 + gInDur - 5 }],
  });

  // embedding
  const embedStart = ragStart + gInDur + 5;
  const embedDur = 25 + Math.round(Math.random() * 20);
  spans.push({
    spanId: randomHex(16), parentSpanId: ragId, traceId, service: 'embedding-service', name: 'embedding.encode',
    kind: 'server', startTime: embedStart, duration: embedDur, status: 'ok', attributes: { 'embedding.model': 'text-embedding-3-large', 'embedding.dimensions': 1536, 'embedding.tokens': 128 }, events: [],
  });

  // vector search
  const vsId = randomHex(16);
  const vsStart = embedStart + embedDur + 3;
  const vsDur = 35 + Math.round(Math.random() * 30);
  spans.push({
    spanId: vsId, parentSpanId: ragId, traceId, service: 'rag-service', name: 'rag.vector_search',
    kind: 'client', startTime: vsStart, duration: vsDur, status: 'ok', attributes: { 'vectordb.engine': 'qdrant', 'vectordb.collection': 'documents_v3', 'vectordb.results_count': 3 + Math.floor(Math.random() * 5), 'vectordb.score_threshold': 0.75 }, events: [],
  });

  // qdrant query
  spans.push({
    spanId: randomHex(16), parentSpanId: vsId, traceId, service: 'qdrant', name: 'qdrant.search',
    kind: 'server', startTime: vsStart + 2, duration: vsDur - 5, status: 'ok', attributes: { 'db.system': 'qdrant', 'db.operation': 'search' }, events: [],
  });

  // redis cache (context)
  const cacheStart = vsStart + vsDur + 2;
  spans.push({
    spanId: randomHex(16), parentSpanId: ragId, traceId, service: 'rag-service', name: 'redis.set',
    kind: 'client', startTime: cacheStart, duration: 4, status: 'ok', attributes: { 'db.system': 'redis', 'db.operation': 'SET' }, events: [],
  });

  // llm inference
  const llmId = randomHex(16);
  const llmStart = cacheStart + 8;
  const llmDur = ragDur - (llmStart - ragStart) - 30;
  const ttft = Math.round(llmDur * 0.3 + Math.random() * 100);
  const tps = Math.round((20 + Math.random() * 35) * 10) / 10;
  const tokens = Math.round(tps * (llmDur / 1000));
  spans.push({
    spanId: llmId, parentSpanId: ragId, traceId, service: 'rag-service', name: 'rag.llm_inference',
    kind: 'internal', startTime: llmStart, duration: llmDur, status: 'ok',
    attributes: { 'llm.model': 'gpt-4o', 'llm.input_tokens': 1240, 'llm.output_tokens': tokens, 'llm.ttft_ms': ttft, 'llm.tps': tps, 'llm.cost': Math.round(tokens * 0.00006 * 1000) / 1000 },
    events: [
      { name: 'first_token_received', timestamp: llmStart + ttft },
      { name: 'generation_complete', timestamp: llmStart + llmDur - 5, attributes: { 'tokens_generated': tokens } },
    ],
  });

  // guardrail output
  const gOutStart = llmStart + llmDur + 3;
  const gOutDur = 15 + Math.round(Math.random() * 15);
  spans.push({
    spanId: randomHex(16), parentSpanId: ragId, traceId, service: 'rag-service', name: 'rag.guardrail_output_check',
    kind: 'internal', startTime: gOutStart, duration: gOutDur, status: 'ok', attributes: { 'guardrail.action': 'PASS', 'guardrail.policy': 'output_safety' },
    events: [{ name: 'policy_evaluation_complete', timestamp: gOutStart + gOutDur - 3 }],
  });

  return spans;
}

export function generateTrace(traceId?: string): Trace {
  const id = traceId ?? randomHex(32);
  const startTime = Date.now() - Math.round(Math.random() * 3600_000);
  const spans = generateTraceSpans(id, startTime);
  const services = new Set(spans.map((s) => s.service));
  const duration = Math.max(...spans.map((s) => (s.startTime - startTime) + s.duration));
  const errorCount = spans.filter((s) => s.status === 'error').length;

  return {
    traceId: id,
    rootService: 'api-gateway',
    rootEndpoint: 'POST /api/chat',
    startTime,
    duration,
    spanCount: spans.length,
    serviceCount: services.size,
    errorCount,
    spans,
  };
}

export function getRecentTraces(count = 20, serviceFilter?: string): Trace[] {
  const traces: Trace[] = [];
  for (let i = 0; i < count; i++) {
    const trace = generateTrace();
    if (Math.random() < 0.08) {
      const errSpan = trace.spans[Math.floor(Math.random() * trace.spans.length)];
      errSpan.status = 'error';
      errSpan.statusMessage = 'Internal server error';
      trace.errorCount = 1;
    }
    if (Math.random() < 0.3) {
      trace.rootEndpoint = 'POST /api/search';
      trace.spans[0].name = 'POST /api/search';
    }
    if (serviceFilter && !trace.spans.some((s) => s.service === serviceFilter)) continue;
    traces.push(trace);
  }
  return traces.sort((a, b) => b.startTime - a.startTime);
}

// ═══════════════════════════════════════════════════════════════
// Log Entries — 로그 탐색 대시보드용 데이터
// ═══════════════════════════════════════════════════════════════

const LOG_SERVICES = ['api-gateway', 'rag-service', 'embedding-service', 'auth-service', 'qdrant'];
const LOG_HOSTS = ['prod-api-01', 'prod-api-02', 'prod-gpu-01', 'prod-gpu-02', 'prod-db-01', 'prod-redis-01'];

const LOG_TEMPLATES: { level: LogLevel; service: string; messages: string[] }[] = [
  { level: 'INFO', service: 'api-gateway', messages: [
    'Request completed: POST /api/chat 200 ({elapsed}ms)',
    'Request completed: GET /api/conversations 200 ({elapsed}ms)',
    'Rate limiter: key=api_key_{id} remaining={remaining}',
    'WebSocket connection established: client_id={id}',
    'Health check passed: uptime={uptime}s',
  ]},
  { level: 'INFO', service: 'rag-service', messages: [
    'Pipeline completed: trace_id={traceId} elapsed={elapsed}ms tokens={tokens}',
    'Vector search: collection=documents_v3 results={results} score_avg={score}',
    'LLM inference started: model=gpt-4o input_tokens={tokens}',
    'Guardrail check passed: policy=content_safety score={score}',
    'Cache hit: key=embed_{id} ttl=3600s',
  ]},
  { level: 'INFO', service: 'embedding-service', messages: [
    'Embedding completed: model=text-embedding-3-large tokens={tokens} elapsed={elapsed}ms',
    'Batch processed: count={count} total_tokens={tokens}',
  ]},
  { level: 'INFO', service: 'auth-service', messages: [
    'Token verified: user_id=user_{id} session_id=sess_{id}',
    'Login successful: user_id=user_{id} method=SSO',
    'Token refreshed: user_id=user_{id}',
  ]},
  { level: 'WARN', service: 'api-gateway', messages: [
    'Slow request: POST /api/chat elapsed={elapsed}ms threshold=2000ms',
    'Rate limit approaching: key=api_key_{id} usage=85%',
    'Connection pool near capacity: used=95/100',
  ]},
  { level: 'WARN', service: 'rag-service', messages: [
    'LLM response slow: TTFT={elapsed}ms threshold=1500ms',
    'Vector search latency high: {elapsed}ms threshold=200ms',
    'Context window near limit: tokens={tokens}/128000',
    'GPU memory pressure: vram_used=87% threshold=85%',
  ]},
  { level: 'WARN', service: 'embedding-service', messages: [
    'Batch queue depth high: pending={count} threshold=100',
  ]},
  { level: 'ERROR', service: 'api-gateway', messages: [
    'Request failed: POST /api/chat 502 Bad Gateway — upstream timeout',
    'WebSocket disconnected unexpectedly: client_id={id} reason=timeout',
  ]},
  { level: 'ERROR', service: 'rag-service', messages: [
    'LLM inference failed: model=gpt-4o error="rate_limit_exceeded" retry_after=30s',
    'Vector search failed: connection to qdrant timed out after 5000ms',
    'Guardrail BLOCKED: policy=content_safety input_score=0.92 threshold=0.85',
    'Pipeline error: trace_id={traceId} stage=llm_inference error="context_length_exceeded"',
  ]},
  { level: 'ERROR', service: 'auth-service', messages: [
    'Authentication failed: invalid_token user_id=user_{id}',
    'Redis connection lost: reconnecting in 5s',
  ]},
  { level: 'DEBUG', service: 'rag-service', messages: [
    'Prompt assembled: system_tokens=850 context_tokens={tokens} user_tokens=120',
    'Chunk reranking: input={count} output=3 model=cross-encoder',
    'Streaming response: chunk_idx={count} tokens={tokens}',
  ]},
  { level: 'DEBUG', service: 'api-gateway', messages: [
    'CORS preflight: origin=https://app.example.com allowed=true',
    'Request middleware chain: auth→rate_limit→proxy elapsed={elapsed}ms',
  ]},
  { level: 'FATAL', service: 'rag-service', messages: [
    'GPU CUDA error: out of memory — cannot allocate 2.1GB on device 0',
  ]},
];

function fillTemplate(template: string): string {
  return template
    .replace(/\{elapsed\}/g, String(Math.round(50 + Math.random() * 3000)))
    .replace(/\{tokens\}/g, String(Math.round(100 + Math.random() * 2000)))
    .replace(/\{id\}/g, randomHex(6))
    .replace(/\{traceId\}/g, randomHex(32))
    .replace(/\{remaining\}/g, String(Math.round(Math.random() * 1000)))
    .replace(/\{uptime\}/g, String(Math.round(Math.random() * 86400)))
    .replace(/\{results\}/g, String(Math.round(2 + Math.random() * 8)))
    .replace(/\{score\}/g, (Math.random() * 0.5 + 0.5).toFixed(3))
    .replace(/\{count\}/g, String(Math.round(5 + Math.random() * 50)));
}

export function generateLogEntries(count = 200, opts?: { service?: string; level?: string; search?: string }): LogEntry[] {
  const now = Date.now();
  const entries: LogEntry[] = [];

  for (let i = 0; i < count * 2 && entries.length < count; i++) {
    const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
    if (opts?.service && opts.service !== 'all' && template.service !== opts.service) continue;
    if (opts?.level && opts.level !== 'all' && template.level !== opts.level) continue;

    const msg = fillTemplate(template.messages[Math.floor(Math.random() * template.messages.length)]);
    if (opts?.search && !msg.toLowerCase().includes(opts.search.toLowerCase())) continue;

    const timestamp = now - (count * 2 - i) * 500 + Math.random() * 300;
    const hasTrace = Math.random() < 0.6;

    entries.push({
      id: randomHex(16),
      timestamp,
      level: template.level,
      service: template.service,
      hostname: LOG_HOSTS[Math.floor(Math.random() * LOG_HOSTS.length)],
      message: msg,
      traceId: hasTrace ? randomHex(32) : undefined,
      spanId: hasTrace ? randomHex(16) : undefined,
      attributes: {
        'process.pid': Math.round(1000 + Math.random() * 5000),
        'thread.name': template.service === 'rag-service' ? 'asyncio-worker' : 'http-handler',
      },
    });
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

export function getLogPatterns(): LogPattern[] {
  const now = Date.now();
  return [
    { id: 'lp-1', pattern: 'Request completed: * 200 (*ms)', count: 12450, level: 'INFO', services: ['api-gateway'], sample: 'Request completed: POST /api/chat 200 (245ms)', firstSeen: now - 86400_000, lastSeen: now - 30_000 },
    { id: 'lp-2', pattern: 'Pipeline completed: trace_id=* elapsed=*ms tokens=*', count: 4320, level: 'INFO', services: ['rag-service'], sample: 'Pipeline completed: trace_id=a1b2c3 elapsed=1247ms tokens=380', firstSeen: now - 86400_000, lastSeen: now - 45_000 },
    { id: 'lp-3', pattern: 'Slow request: * elapsed=*ms threshold=*ms', count: 234, level: 'WARN', services: ['api-gateway'], sample: 'Slow request: POST /api/chat elapsed=2850ms threshold=2000ms', firstSeen: now - 43200_000, lastSeen: now - 120_000 },
    { id: 'lp-4', pattern: 'LLM inference failed: * error="*"', count: 47, level: 'ERROR', services: ['rag-service'], sample: 'LLM inference failed: model=gpt-4o error="rate_limit_exceeded" retry_after=30s', firstSeen: now - 21600_000, lastSeen: now - 600_000 },
    { id: 'lp-5', pattern: 'Guardrail BLOCKED: policy=* input_score=* threshold=*', count: 18, level: 'ERROR', services: ['rag-service'], sample: 'Guardrail BLOCKED: policy=content_safety input_score=0.92 threshold=0.85', firstSeen: now - 14400_000, lastSeen: now - 1800_000 },
    { id: 'lp-6', pattern: 'Token verified: user_id=* session_id=*', count: 8900, level: 'INFO', services: ['auth-service'], sample: 'Token verified: user_id=user_29384 session_id=sess_ab12cd', firstSeen: now - 86400_000, lastSeen: now - 15_000 },
    { id: 'lp-7', pattern: 'GPU memory pressure: vram_used=*% threshold=*%', count: 56, level: 'WARN', services: ['rag-service'], sample: 'GPU memory pressure: vram_used=87% threshold=85%', firstSeen: now - 7200_000, lastSeen: now - 300_000 },
    { id: 'lp-8', pattern: 'Embedding completed: * tokens=* elapsed=*ms', count: 6780, level: 'INFO', services: ['embedding-service'], sample: 'Embedding completed: model=text-embedding-3-large tokens=128 elapsed=42ms', firstSeen: now - 86400_000, lastSeen: now - 20_000 },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Metrics Explorer — 메트릭 카탈로그 및 쿼리 데이터
// ═══════════════════════════════════════════════════════════════

export const METRIC_CATALOG: MetricDefinition[] = [
  // System
  { name: 'node_cpu_seconds_total', type: 'counter', description: 'Total CPU time spent per mode', unit: 'seconds', labels: ['cpu', 'mode', 'instance'], category: 'system' },
  { name: 'node_memory_MemAvailable_bytes', type: 'gauge', description: 'Available memory in bytes', unit: 'bytes', labels: ['instance'], category: 'system' },
  { name: 'node_disk_io_time_seconds_total', type: 'counter', description: 'Total disk I/O time', unit: 'seconds', labels: ['device', 'instance'], category: 'system' },
  { name: 'node_network_receive_bytes_total', type: 'counter', description: 'Total network bytes received', unit: 'bytes', labels: ['device', 'instance'], category: 'system' },
  { name: 'node_filesystem_avail_bytes', type: 'gauge', description: 'Available filesystem space', unit: 'bytes', labels: ['mountpoint', 'instance'], category: 'system' },
  // HTTP
  { name: 'http_requests_total', type: 'counter', description: 'Total HTTP requests processed', unit: 'requests', labels: ['method', 'path', 'status', 'service'], category: 'http' },
  { name: 'http_request_duration_seconds', type: 'histogram', description: 'HTTP request latency', unit: 'seconds', labels: ['method', 'path', 'service', 'le'], category: 'http' },
  { name: 'http_requests_in_flight', type: 'gauge', description: 'Current in-flight HTTP requests', unit: 'requests', labels: ['service'], category: 'http' },
  { name: 'http_response_size_bytes', type: 'histogram', description: 'HTTP response body size', unit: 'bytes', labels: ['method', 'path', 'service', 'le'], category: 'http' },
  // LLM
  { name: 'llm_request_duration_seconds', type: 'histogram', description: 'LLM inference request duration', unit: 'seconds', labels: ['model', 'service', 'le'], category: 'llm' },
  { name: 'llm_ttft_seconds', type: 'histogram', description: 'Time to First Token', unit: 'seconds', labels: ['model', 'service', 'le'], category: 'llm' },
  { name: 'llm_tokens_per_second', type: 'gauge', description: 'Token generation throughput', unit: 'tokens/s', labels: ['model', 'service'], category: 'llm' },
  { name: 'llm_tokens_total', type: 'counter', description: 'Total tokens generated', unit: 'tokens', labels: ['model', 'service', 'type'], category: 'llm' },
  { name: 'llm_cost_dollars_total', type: 'counter', description: 'Cumulative LLM API cost', unit: 'dollars', labels: ['model', 'service'], category: 'llm' },
  { name: 'llm_guardrail_checks_total', type: 'counter', description: 'Total guardrail checks', unit: 'checks', labels: ['policy', 'action', 'service'], category: 'llm' },
  // VectorDB
  { name: 'vectordb_query_duration_seconds', type: 'histogram', description: 'Vector search query latency', unit: 'seconds', labels: ['collection', 'service', 'le'], category: 'vectordb' },
  { name: 'vectordb_vectors_total', type: 'gauge', description: 'Total vectors stored', unit: 'vectors', labels: ['collection'], category: 'vectordb' },
  { name: 'vectordb_queries_total', type: 'counter', description: 'Total vector queries', unit: 'queries', labels: ['collection', 'service'], category: 'vectordb' },
  // GPU
  { name: 'gpu_vram_used_bytes', type: 'gauge', description: 'GPU VRAM used', unit: 'bytes', labels: ['gpu', 'instance'], category: 'gpu' },
  { name: 'gpu_temperature_celsius', type: 'gauge', description: 'GPU temperature', unit: 'celsius', labels: ['gpu', 'instance'], category: 'gpu' },
  { name: 'gpu_power_draw_watts', type: 'gauge', description: 'GPU power consumption', unit: 'watts', labels: ['gpu', 'instance'], category: 'gpu' },
  { name: 'gpu_sm_occupancy_percent', type: 'gauge', description: 'GPU SM occupancy', unit: 'percent', labels: ['gpu', 'instance'], category: 'gpu' },
  { name: 'gpu_utilization_percent', type: 'gauge', description: 'GPU utilization', unit: 'percent', labels: ['gpu', 'instance'], category: 'gpu' },
];

// Simulate query execution → time series
export function executeMetricQuery(
  metricName: string,
  points = 60,
): { label: string; data: [number, number][] }[] {
  const now = Date.now();
  const metric = METRIC_CATALOG.find((m) => m.name === metricName);
  if (!metric) return [];

  // Generate realistic series based on metric type
  const baselines: Record<string, { base: number; variance: number; labels: string[][] }> = {
    'node_cpu_seconds_total': { base: 45, variance: 15, labels: [['user'], ['system'], ['iowait']] },
    'node_memory_MemAvailable_bytes': { base: 42, variance: 8, labels: [['prod-api-01'], ['prod-gpu-01']] },
    'http_requests_total': { base: 1200, variance: 200, labels: [['200'], ['404'], ['500']] },
    'http_request_duration_seconds': { base: 0.245, variance: 0.08, labels: [['p50'], ['p95'], ['p99']] },
    'http_requests_in_flight': { base: 25, variance: 10, labels: [['api-gateway'], ['rag-service']] },
    'llm_request_duration_seconds': { base: 1.8, variance: 0.5, labels: [['p50'], ['p95'], ['p99']] },
    'llm_ttft_seconds': { base: 0.95, variance: 0.3, labels: [['gpt-4o'], ['llama-3-70b']] },
    'llm_tokens_per_second': { base: 42, variance: 8, labels: [['gpt-4o'], ['llama-3-70b']] },
    'llm_tokens_total': { base: 5000, variance: 1000, labels: [['input'], ['output']] },
    'llm_cost_dollars_total': { base: 8.5, variance: 2, labels: [['gpt-4o'], ['llama-3-70b']] },
    'llm_guardrail_checks_total': { base: 900, variance: 100, labels: [['PASS'], ['BLOCK']] },
    'vectordb_query_duration_seconds': { base: 0.12, variance: 0.04, labels: [['p50'], ['p95']] },
    'vectordb_vectors_total': { base: 125000, variance: 500, labels: [['documents_v3']] },
    'vectordb_queries_total': { base: 800, variance: 120, labels: [['documents_v3']] },
    'gpu_vram_used_bytes': { base: 72, variance: 8, labels: [['gpu0'], ['gpu1']] },
    'gpu_temperature_celsius': { base: 62, variance: 6, labels: [['gpu0'], ['gpu1']] },
    'gpu_power_draw_watts': { base: 280, variance: 30, labels: [['gpu0'], ['gpu1']] },
    'gpu_sm_occupancy_percent': { base: 85, variance: 8, labels: [['gpu0'], ['gpu1']] },
    'gpu_utilization_percent': { base: 78, variance: 12, labels: [['gpu0'], ['gpu1']] },
  };

  const config = baselines[metricName] ?? { base: 50, variance: 10, labels: [['default']] };

  return config.labels.map((labelSet, idx) => {
    const label = labelSet.join(', ');
    const baseVal = config.base * (1 + idx * 0.3);
    const data: [number, number][] = Array.from({ length: points }, (_, i) => [
      now - (points - i) * 60_000,
      Math.max(0, baseVal + (Math.random() - 0.5) * config.variance * 2),
    ]);
    return { label, data };
  });
}
