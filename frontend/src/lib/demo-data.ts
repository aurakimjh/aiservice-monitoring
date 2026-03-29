import type { Project, Host, Service, AIService, AlertEvent, Endpoint, DeploymentEvent, ServiceDependency, Transaction, TransactionSpan, TransactionStatus, Trace, TraceSpan, LogEntry, LogLevel, LogPattern, MetricDefinition, RAGPipelineData, AgentExecution, GuardrailData, CollectionJob, AgentPlugin, DiagnosticRun, DiagnosticItem, AlertPolicy, IncidentDetail, NotificationChannel, SLODefinition, CostBreakdown, ExecutiveSummary, DashboardConfig, Notebook, Tenant, Status, AgentGroup, UpdateStatus, CollectionSchedule, EvalJob, EvalSample, ABTestComparison, PromptEntry, ModelCostProfile, CacheAnalysis, CostRecommendation, BudgetAlert, Anomaly, DynamicThreshold, ReportTemplate, GeneratedReport, SyntheticProbe, MethodProfile, AgentConfig, ConfigRevision, SDKDetection, GroupDashboard, MiddlewareRuntime, RedisMetrics, MessageQueueMetrics, PluginRegistryItem, PluginDeployHistory, PluginAgentStatus, BatchJob, BatchExecution, BatchExecutionDetail, BatchSQLProfile, BatchMethodProfile, BatchAlertRule, BatchAlertHistory, BatchXLogPoint } from '@/types/monitoring';

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
      { id: 'h-gpu-01', hostname: 'prod-gpu-01', os: 'Ubuntu 22.04', cpuCores: 32, memoryGB: 128, status: 'healthy', cpuPercent: 78, memPercent: 81, diskPercent: 55, netIO: '240MB/s', middlewares: [{ type: 'llm', name: 'vLLM', version: '0.4.2', port: 8000, status: 'running' }, { type: 'vectordb', name: 'Qdrant', version: '1.8.0', port: 6333, status: 'running' }], gpus: [{ index: 0, model: 'A100 80GB', vendor: 'nvidia' as const, vramTotal: 80, vramUsed: 57.6, vramPercent: 72, temperature: 62, powerDraw: 280, smOccupancy: 85, driverVersion: '535.161.07' }, { index: 1, model: 'A100 80GB', vendor: 'nvidia' as const, vramTotal: 80, vramUsed: 54.4, vramPercent: 68, temperature: 58, powerDraw: 265, smOccupancy: 80, driverVersion: '535.161.07', migEnabled: true, migInstance: '(MIG 3g.40gb)' }], agent: { id: 'a-03', hostId: 'h-gpu-01', version: '1.2.0', status: 'healthy', plugins: [{ id: 'ai-gpu-serving', name: 'GPU/Serving', version: '1.0.0', status: 'active', itemsCovered: ['ITEM0207', 'ITEM0220'] }], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-gpu-02', hostname: 'prod-gpu-02', os: 'Ubuntu 22.04', cpuCores: 32, memoryGB: 128, status: 'warning', cpuPercent: 92, memPercent: 88, diskPercent: 60, netIO: '310MB/s', middlewares: [{ type: 'llm', name: 'vLLM', version: '0.4.2', port: 8000, status: 'running' }], gpus: [{ index: 0, model: 'A100 80GB', vendor: 'nvidia' as const, vramTotal: 80, vramUsed: 71.2, vramPercent: 89, temperature: 71, powerDraw: 310, smOccupancy: 92, isVirtual: true }, { index: 1, model: 'A100 80GB', vendor: 'nvidia' as const, vramTotal: 80, vramUsed: 65.6, vramPercent: 82, temperature: 65, powerDraw: 290, smOccupancy: 88 }], agent: { id: 'a-04', hostId: 'h-gpu-02', version: '1.1.9', status: 'degraded', plugins: [{ id: 'ai-gpu-serving', name: 'GPU/Serving', version: '1.0.0', status: 'active', itemsCovered: ['ITEM0207', 'ITEM0220'] }], lastHeartbeat: new Date(Date.now() - 120_000).toISOString(), lastCollection: new Date(Date.now() - 120_000).toISOString(), mode: 'full' } },
      { id: 'h-gpu-03', hostname: 'prod-gpu-03', os: 'Ubuntu 22.04', cpuCores: 64, memoryGB: 256, status: 'healthy', cpuPercent: 55, memPercent: 62, diskPercent: 48, netIO: '180MB/s', middlewares: [{ type: 'llm', name: 'vLLM', version: '0.4.2', port: 8000, status: 'running' }], gpus: [{ index: 0, model: 'AMD Instinct MI250X', vendor: 'amd' as const, vramTotal: 128, vramUsed: 76.8, vramPercent: 60, temperature: 55, powerDraw: 420, smOccupancy: 72 }, { index: 1, model: 'AMD Instinct MI250X', vendor: 'amd' as const, vramTotal: 128, vramUsed: 89.6, vramPercent: 70, temperature: 58, powerDraw: 450, smOccupancy: 78 }], agent: { id: 'a-07', hostId: 'h-gpu-03', version: '1.2.0', status: 'healthy', plugins: [{ id: 'ai-gpu-serving', name: 'GPU/Serving', version: '2.0.0', status: 'active', itemsCovered: ['ITEM0207', 'ITEM0220'] }], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-gpu-04', hostname: 'dev-gpu-04', os: 'Ubuntu 22.04', cpuCores: 16, memoryGB: 64, status: 'healthy', cpuPercent: 32, memPercent: 44, diskPercent: 38, netIO: '60MB/s', middlewares: [{ type: 'llm', name: 'Ollama', version: '0.1.30', port: 11434, status: 'running' }], gpus: [{ index: 0, model: 'Intel Arc A770', vendor: 'intel' as const, vramTotal: 16, vramUsed: 6.4, vramPercent: 40, temperature: 48, powerDraw: 120, smOccupancy: 35, coreFreqMHz: 2100 }], agent: { id: 'a-08', hostId: 'h-gpu-04', version: '1.2.0', status: 'healthy', plugins: [{ id: 'ai-gpu-serving', name: 'GPU/Serving', version: '2.0.0', status: 'active', itemsCovered: ['ITEM0207'] }], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-java-01', hostname: 'demo-java-app', os: 'Ubuntu 22.04 (JDK 21)', cpuCores: 4, memoryGB: 2, status: 'healthy', cpuPercent: 28, memPercent: 41, diskPercent: 25, netIO: '12MB/s', middlewares: [{ type: 'was', name: 'Spring Boot', version: '3.3.6', port: 8081, status: 'running' }], agent: { id: 'a-java-01', hostId: 'h-java-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-dotnet-01', hostname: 'demo-dotnet-app', os: 'Ubuntu 22.04 (.NET 8)', cpuCores: 4, memoryGB: 2, status: 'healthy', cpuPercent: 22, memPercent: 35, diskPercent: 20, netIO: '10MB/s', middlewares: [{ type: 'was', name: 'ASP.NET Core', version: '8.0', port: 8082, status: 'running' }], agent: { id: 'a-dotnet-01', hostId: 'h-dotnet-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-go-01', hostname: 'demo-go-app', os: 'Ubuntu 22.04', cpuCores: 4, memoryGB: 1, status: 'healthy', cpuPercent: 12, memPercent: 15, diskPercent: 18, netIO: '8MB/s', middlewares: [{ type: 'was', name: 'Gin', version: '1.10.0', port: 8083, status: 'running' }], agent: { id: 'a-go-01', hostId: 'h-go-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-python-01', hostname: 'demo-python-app', os: 'Ubuntu 22.04 (Python 3.10)', cpuCores: 4, memoryGB: 2, status: 'healthy', cpuPercent: 32, memPercent: 38, diskPercent: 22, netIO: '11MB/s', middlewares: [{ type: 'was', name: 'FastAPI', version: '0.104', port: 8084, status: 'running' }], agent: { id: 'a-python-01', hostId: 'h-python-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-node-01', hostname: 'demo-node-app', os: 'Ubuntu 22.04 (Node 20)', cpuCores: 4, memoryGB: 1, status: 'healthy', cpuPercent: 18, memPercent: 28, diskPercent: 15, netIO: '9MB/s', middlewares: [{ type: 'was', name: 'Express', version: '4.19.0', port: 8085, status: 'running' }], agent: { id: 'a-node-01', hostId: 'h-node-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-db-01', hostname: 'prod-db-01', os: 'RHEL 9', cpuCores: 8, memoryGB: 32, status: 'healthy', cpuPercent: 35, memPercent: 75, diskPercent: 72, netIO: '80MB/s', middlewares: [{ type: 'db', name: 'PostgreSQL', version: '16.2', port: 5432, status: 'running' }], agent: { id: 'a-05', hostId: 'h-db-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
      { id: 'h-redis-01', hostname: 'prod-redis-01', os: 'Ubuntu 22.04', cpuCores: 4, memoryGB: 16, status: 'healthy', cpuPercent: 18, memPercent: 45, diskPercent: 22, netIO: '50MB/s', middlewares: [{ type: 'cache', name: 'Redis', version: '7.2', port: 6379, status: 'running' }], agent: { id: 'a-06', hostId: 'h-redis-01', version: '1.2.0', status: 'healthy', plugins: [], lastHeartbeat: new Date().toISOString(), lastCollection: new Date().toISOString(), mode: 'full' } },
    ],
  };
  return hostSets[projectId] ?? hostSets['proj-ai-prod'];
}

export function getProjectServices(projectId: string): Service[] {
  const sets: Record<string, Service[]> = {
    'proj-ai-prod': [
      // demo-site 5개 런타임 앱 (OTel 계측 → Jaeger/Prometheus 연동)
      { id: 's-java', name: 'java-demo-app', framework: 'Spring Boot 3.3', language: 'Java', hostIds: ['h-java-01'], latencyP50: 25, latencyP95: 85, latencyP99: 180, rpm: 850, errorRate: 0.08, status: 'healthy' },
      { id: 's-dotnet', name: 'dotnet-demo-app', framework: 'ASP.NET Core 8', language: '.NET', hostIds: ['h-dotnet-01'], latencyP50: 30, latencyP95: 95, latencyP99: 210, rpm: 720, errorRate: 0.05, status: 'healthy' },
      { id: 's-go', name: 'go-demo-app', framework: 'Gin 1.10', language: 'Go', hostIds: ['h-go-01'], latencyP50: 12, latencyP95: 45, latencyP99: 110, rpm: 1500, errorRate: 0.03, status: 'healthy' },
      { id: 's-python', name: 'python-demo-app', framework: 'FastAPI 0.104', language: 'Python', hostIds: ['h-python-01'], latencyP50: 42, latencyP95: 150, latencyP99: 380, rpm: 620, errorRate: 0.15, status: 'healthy' },
      { id: 's-node', name: 'nodejs-demo-app', framework: 'Express 4.19', language: 'Node.js', hostIds: ['h-node-01'], latencyP50: 35, latencyP95: 120, latencyP99: 290, rpm: 980, errorRate: 0.10, status: 'healthy' },
      // AI 서비스 (RAG + 가드레일)
      { id: 's-rag', name: 'rag-service', framework: 'FastAPI', language: 'Python', hostIds: ['h-gpu-01', 'h-gpu-02'], latencyP50: 820, latencyP95: 1800, latencyP99: 3200, rpm: 450, errorRate: 0.22, status: 'healthy' },
      { id: 's-guardrail', name: 'guardrail-service', framework: 'FastAPI', language: 'Python', hostIds: ['h-gpu-01'], latencyP50: 15, latencyP95: 45, latencyP99: 120, rpm: 450, errorRate: 0.01, status: 'healthy' },
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
  // demo-site 5개 런타임 앱 + AI 서비스 + 인프라 토폴로지
  const nodes: TopologyNode[] = [
    { id: 'client', name: 'Client (Browser)', layer: 'ui', status: 'healthy', rpm: 4670, errorRate: 0, p95: 0, framework: 'Browser' },
    // 5개 언어 데모 앱
    { id: 'java-app', name: 'java-demo-app', layer: 'ui', status: 'healthy', rpm: 850, errorRate: 0.08, p95: 85, framework: 'Spring Boot 3.3' },
    { id: 'dotnet-app', name: 'dotnet-demo-app', layer: 'ui', status: 'healthy', rpm: 720, errorRate: 0.05, p95: 95, framework: 'ASP.NET Core 8' },
    { id: 'go-app', name: 'go-demo-app', layer: 'ui', status: 'healthy', rpm: 1500, errorRate: 0.03, p95: 45, framework: 'Gin 1.10' },
    { id: 'python-app', name: 'python-demo-app', layer: 'ui', status: 'healthy', rpm: 620, errorRate: 0.15, p95: 150, framework: 'FastAPI 0.104' },
    { id: 'node-app', name: 'nodejs-demo-app', layer: 'ui', status: 'healthy', rpm: 980, errorRate: 0.10, p95: 120, framework: 'Express 4.19' },
    // AI 서비스
    { id: 'rag-svc', name: 'rag-service', layer: 'agent', status: 'healthy', rpm: 450, errorRate: 0.22, p95: 1800, framework: 'FastAPI' },
    { id: 'guardrail', name: 'guardrail-service', layer: 'agent', status: 'healthy', rpm: 450, errorRate: 0.01, p95: 45, framework: 'FastAPI' },
    // 인프라
    { id: 'qdrant', name: 'Qdrant', layer: 'data', status: 'healthy', rpm: 800, errorRate: 0.02, p95: 120, framework: 'Qdrant' },
    { id: 'postgres', name: 'PostgreSQL', layer: 'data', status: 'healthy', rpm: 3200, errorRate: 0.01, p95: 15, framework: 'PostgreSQL 16' },
    { id: 'redis', name: 'Redis Cache', layer: 'data', status: 'healthy', rpm: 4500, errorRate: 0, p95: 3, framework: 'Redis 7.2' },
  ];

  const edges: TopologyEdge[] = [
    // Client → 5개 앱
    { source: 'client', target: 'java-app', rpm: 850, errorRate: 0.08, p95: 85 },
    { source: 'client', target: 'dotnet-app', rpm: 720, errorRate: 0.05, p95: 95 },
    { source: 'client', target: 'go-app', rpm: 1500, errorRate: 0.03, p95: 45 },
    { source: 'client', target: 'python-app', rpm: 620, errorRate: 0.15, p95: 150 },
    { source: 'client', target: 'node-app', rpm: 980, errorRate: 0.10, p95: 120 },
    // 모든 앱 → PostgreSQL + Redis
    { source: 'java-app', target: 'postgres', rpm: 650, errorRate: 0.01, p95: 12 },
    { source: 'java-app', target: 'redis', rpm: 850, errorRate: 0, p95: 2 },
    { source: 'dotnet-app', target: 'postgres', rpm: 550, errorRate: 0.01, p95: 14 },
    { source: 'go-app', target: 'postgres', rpm: 1200, errorRate: 0.01, p95: 8 },
    { source: 'go-app', target: 'redis', rpm: 1500, errorRate: 0, p95: 2 },
    { source: 'python-app', target: 'postgres', rpm: 480, errorRate: 0.02, p95: 18 },
    { source: 'python-app', target: 'redis', rpm: 620, errorRate: 0, p95: 3 },
    { source: 'node-app', target: 'postgres', rpm: 750, errorRate: 0.01, p95: 10 },
    { source: 'node-app', target: 'redis', rpm: 980, errorRate: 0, p95: 2 },
    // Python → RAG/Guardrail → Qdrant
    { source: 'python-app', target: 'rag-svc', rpm: 200, errorRate: 0.1, p95: 1800 },
    { source: 'rag-svc', target: 'guardrail', rpm: 200, errorRate: 0.01, p95: 45 },
    { source: 'rag-svc', target: 'qdrant', rpm: 450, errorRate: 0.02, p95: 120 },
  ];

  return { nodes, edges };
}

// ═══════════════════════════════════════════════════════════════
// Service Detail — 서비스 상세 대시보드용 데이터
// ═══════════════════════════════════════════════════════════════

export function getServiceEndpoints(serviceId: string): Endpoint[] {
  // 공통 엔드포인트 (demo-site 모든 앱이 동일 패턴)
  const commonEndpoints = (prefix: string, base: { rpm: number; lat: number }): Endpoint[] => [
    { id: `${prefix}-1`, method: 'GET', path: '/api/health', rpm: Math.round(base.rpm * 0.1), latencyP50: 3, latencyP95: 8, latencyP99: 15, errorRate: 0, contribution: 10 },
    { id: `${prefix}-2`, method: 'GET', path: '/api/products', rpm: Math.round(base.rpm * 0.25), latencyP50: base.lat, latencyP95: base.lat * 2.5, latencyP99: base.lat * 5, errorRate: 0.02, contribution: 25 },
    { id: `${prefix}-3`, method: 'GET', path: '/api/users', rpm: Math.round(base.rpm * 0.2), latencyP50: base.lat * 1.2, latencyP95: base.lat * 3, latencyP99: base.lat * 6, errorRate: 0.03, contribution: 20 },
    { id: `${prefix}-4`, method: 'POST', path: '/api/users', rpm: Math.round(base.rpm * 0.1), latencyP50: base.lat * 1.5, latencyP95: base.lat * 4, latencyP99: base.lat * 8, errorRate: 0.05, contribution: 10 },
    { id: `${prefix}-5`, method: 'GET', path: '/api/orders', rpm: Math.round(base.rpm * 0.2), latencyP50: base.lat * 1.3, latencyP95: base.lat * 3, latencyP99: base.lat * 6, errorRate: 0.04, contribution: 20 },
    { id: `${prefix}-6`, method: 'POST', path: '/api/orders', rpm: Math.round(base.rpm * 0.1), latencyP50: base.lat * 2, latencyP95: base.lat * 5, latencyP99: base.lat * 10, errorRate: 0.08, contribution: 10 },
    { id: `${prefix}-7`, method: 'GET', path: '/api/slow', rpm: Math.round(base.rpm * 0.05), latencyP50: 1200, latencyP95: 3000, latencyP99: 5000, errorRate: 0, contribution: 5 },
  ];

  const sets: Record<string, Endpoint[]> = {
    's-java': commonEndpoints('java', { rpm: 850, lat: 20 }),
    's-dotnet': commonEndpoints('dotnet', { rpm: 720, lat: 25 }),
    's-go': commonEndpoints('go', { rpm: 1500, lat: 10 }),
    's-python': commonEndpoints('python', { rpm: 620, lat: 35 }),
    's-node': commonEndpoints('node', { rpm: 980, lat: 28 }),
    's-rag': [
      { id: 'ep-10', method: 'POST', path: '/api/chat', rpm: 200, latencyP50: 820, latencyP95: 1800, latencyP99: 3200, errorRate: 0.3, contribution: 44.4 },
      { id: 'ep-11', method: 'POST', path: '/api/search', rpm: 150, latencyP50: 350, latencyP95: 700, latencyP99: 1200, errorRate: 0.1, contribution: 33.3 },
      { id: 'ep-12', method: 'POST', path: '/api/embed', rpm: 60, latencyP50: 120, latencyP95: 280, latencyP99: 450, errorRate: 0.05, contribution: 13.3 },
      { id: 'ep-13', method: 'GET', path: '/api/health', rpm: 40, latencyP50: 3, latencyP95: 8, latencyP99: 15, errorRate: 0, contribution: 8.9 },
    ],
    's-guardrail': [
      { id: 'ep-40', method: 'POST', path: '/api/guardrail/check', rpm: 400, latencyP50: 12, latencyP95: 35, latencyP99: 80, errorRate: 0.01, contribution: 88.9 },
      { id: 'ep-41', method: 'GET', path: '/api/health', rpm: 50, latencyP50: 2, latencyP95: 5, latencyP99: 10, errorRate: 0, contribution: 11.1 },
    ],
  };
  return sets[serviceId] ?? sets['s-java'];
}

export function getServiceDeployments(serviceId: string): DeploymentEvent[] {
  const now = Date.now();
  const sets: Record<string, DeploymentEvent[]> = {
    's-java': [
      { id: 'd-1', version: 'v1.3.0', timestamp: new Date(now - 2 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'a3f8c2d', description: 'Add OTel Java Agent auto-instrumentation', duration: 45 },
      { id: 'd-2', version: 'v1.2.0', timestamp: new Date(now - 48 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'b7e1f90', description: 'Spring Boot 3.3.6 upgrade + Hikari pool tuning', duration: 62 },
    ],
    's-dotnet': [
      { id: 'd-10', version: 'v2.1.0', timestamp: new Date(now - 5 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'f1a2b3c', description: 'Add EF Core OTel instrumentation', duration: 55 },
      { id: 'd-11', version: 'v2.0.0', timestamp: new Date(now - 72 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'g4h5i6j', description: '.NET 8 migration + EventPipe diagnostics', duration: 95 },
    ],
    's-go': [
      { id: 'd-20', version: 'v1.5.0', timestamp: new Date(now - 3 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'o1p2q3r', description: 'Add pprof endpoint + otelgin middleware', duration: 30 },
      { id: 'd-21', version: 'v1.4.0', timestamp: new Date(now - 96 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 's4t5u6v', description: 'pgx + redisotel instrumentation', duration: 42 },
    ],
    's-python': [
      { id: 'd-30', version: 'v1.4.0', timestamp: new Date(now - 8 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'a1b2c3d', description: 'FastAPI + psycopg + Redis OTel auto-instrumentation', duration: 40 },
      { id: 'd-31', version: 'v1.3.0', timestamp: new Date(now - 120 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'e4f5g6h', description: 'Add RAG service integration', duration: 65 },
    ],
    's-node': [
      { id: 'd-40', version: 'v1.2.0', timestamp: new Date(now - 6 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'i7j8k9l', description: 'OTel auto-instrumentations-node setup', duration: 35 },
      { id: 'd-41', version: 'v1.1.0', timestamp: new Date(now - 168 * 3600_000).toISOString(), status: 'failed', deployer: 'park.js', commitHash: 'x9y0z1a', description: 'WebSocket upgrade (rolled back)', duration: 120 },
    ],
    's-rag': [
      { id: 'd-50', version: 'v1.8.0', timestamp: new Date(now - 5 * 3600_000).toISOString(), status: 'success', deployer: 'kim.aura', commitHash: 'f1a2b3c', description: 'Upgrade to GPT-4-Turbo with streaming', duration: 180 },
      { id: 'd-51', version: 'v1.7.5', timestamp: new Date(now - 48 * 3600_000).toISOString(), status: 'success', deployer: 'ci-bot', commitHash: 'g4h5i6j', description: 'Add context window overflow handling', duration: 95 },
    ],
  };
  return sets[serviceId] ?? sets['s-java'];
}

export function getServiceDependencies(serviceId: string): ServiceDependency[] {
  const topology = getServiceTopology('proj-ai-prod');
  const deps: ServiceDependency[] = [];

  // Find edges where this service is source (downstream deps)
  // or target (upstream callers) using topology node names
  const nodeMap: Record<string, string> = {
    's-java': 'java-app',
    's-dotnet': 'dotnet-app',
    's-go': 'go-app',
    's-python': 'python-app',
    's-node': 'node-app',
    's-rag': 'rag-svc',
    's-guardrail': 'guardrail',
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

// ═══════════════════════════════════════════════════════════════
// Phase 12: AI Native — AI 서비스 상세 데이터
// ═══════════════════════════════════════════════════════════════

export function getTTFTHistogram(): { bucket: string; count: number }[] {
  return [
    { bucket: '0-200', count: 45 },
    { bucket: '200-400', count: 120 },
    { bucket: '400-600', count: 280 },
    { bucket: '600-800', count: 350 },
    { bucket: '800-1000', count: 420 },
    { bucket: '1000-1200', count: 380 },
    { bucket: '1200-1500', count: 220 },
    { bucket: '1500-2000', count: 95 },
    { bucket: '2000-2500', count: 35 },
    { bucket: '2500-3000', count: 12 },
    { bucket: '3000+', count: 5 },
  ];
}

export function getRAGPipelineData(): RAGPipelineData {
  return {
    stages: [
      { name: 'Input Validation', avgDuration: 50, p95Duration: 80, percentage: 3, color: '#9B59B6' },
      { name: 'Embedding', avgDuration: 120, p95Duration: 200, percentage: 7, color: '#3498DB' },
      { name: 'Vector Search', avgDuration: 85, p95Duration: 150, percentage: 5, color: '#2ECC71' },
      { name: 'Reranking', avgDuration: 60, p95Duration: 100, percentage: 4, color: '#1ABC9C' },
      { name: 'LLM Inference', avgDuration: 1250, p95Duration: 1800, percentage: 76, color: '#E67E22' },
      { name: 'Output Validation', avgDuration: 80, p95Duration: 120, percentage: 5, color: '#9B59B6' },
    ],
    totalDuration: 1645,
    searchQuality: { relevancyScore: 0.82, topKHitRate: 94, emptyResultRate: 1.2, faithfulness: 0.89, answerRelevancy: 0.85 },
    embeddingPerf: { model: 'text-embedding-3-large', dimensions: 3072, batchSize: 32, p95Latency: 120, throughput: 850, cacheHitRate: 94 },
    vectorDB: { engine: 'Qdrant', collection: 'documents_v3', vectorCount: 125000, segments: 8, indexType: 'HNSW (m=16, ef=100)', diskUsage: '2.3GB', searchP99: 120, insertP99: 45, availability: 99.99 },
  };
}

export function getAgentExecutions(): AgentExecution[] {
  const now = Date.now();
  return [
    { id: 'exec-4521', startTime: now - 120_000, duration: 8200, steps: 5, toolCalls: 3, cost: 0.15, status: 'success', iterationsUsed: 5, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4520', startTime: now - 300_000, duration: 4500, steps: 3, toolCalls: 2, cost: 0.08, status: 'success', iterationsUsed: 3, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4519', startTime: now - 480_000, duration: 25300, steps: 12, toolCalls: 8, cost: 0.45, status: 'warning', iterationsUsed: 12, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4518', startTime: now - 720_000, duration: 3200, steps: 4, toolCalls: 2, cost: 0.10, status: 'success', iterationsUsed: 4, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4517', startTime: now - 900_000, duration: 45000, steps: 15, toolCalls: 11, cost: 0.82, status: 'error', iterationsUsed: 15, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4516', startTime: now - 1200_000, duration: 6800, steps: 6, toolCalls: 4, cost: 0.18, status: 'success', iterationsUsed: 6, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4515', startTime: now - 1500_000, duration: 5100, steps: 4, toolCalls: 3, cost: 0.12, status: 'success', iterationsUsed: 4, maxIterations: 15, traceId: randomHex(32) },
    { id: 'exec-4514', startTime: now - 1800_000, duration: 9500, steps: 7, toolCalls: 5, cost: 0.22, status: 'success', iterationsUsed: 7, maxIterations: 15, traceId: randomHex(32) },
  ];
}

export function getGuardrailData(): GuardrailData {
  return {
    totalChecks: 2000,
    blockCount: 42,
    blockRate: 2.1,
    violations: [
      { type: 'pii_detection', label: 'PII Detection', count: 15 },
      { type: 'harmful_content', label: 'Harmful Content', count: 12 },
      { type: 'sql_injection', label: 'SQL Injection', count: 8 },
      { type: 'prompt_injection', label: 'Prompt Injection', count: 5 },
      { type: 'other', label: 'Other', count: 2 },
    ],
    latencyContribution: 8.5,
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 13: 에이전트 통합 + 알림 데이터
// ═══════════════════════════════════════════════════════════════

export function getCollectionJobs(): CollectionJob[] {
  const now = Date.now();
  return [
    { id: 'JOB-0145', type: 'scheduled', target: 'All Hosts (48)', targetCount: 48, items: 86, progress: 92, status: 'running', startTime: now - 180_000 },
    { id: 'JOB-0144', type: 'ai_diagnostic', target: 'GPU Group (4)', targetCount: 4, items: 31, progress: 100, status: 'completed', startTime: now - 900_000 },
    { id: 'JOB-0143', type: 'emergency', target: 'prod-gpu-03', targetCount: 1, items: 86, progress: 100, status: 'completed', startTime: now - 3600_000 },
    { id: 'JOB-0142', type: 'scheduled', target: 'All Hosts (48)', targetCount: 48, items: 86, progress: 100, status: 'completed', startTime: now - 7200_000 },
  ];
}

export function getAgentPlugins(): AgentPlugin[] {
  return [
    { name: 'IT - OS Plugin', version: '1.2.0', activeAgents: 48, totalAgents: 48, collectItems: 'OS Metrics', status: 'healthy' },
    { name: 'IT - MW Plugin', version: '1.2.0', activeAgents: 35, totalAgents: 48, collectItems: 'WEB/WAS/DB', status: 'healthy' },
    { name: 'AI - GPU/Serving', version: '1.0.0', activeAgents: 4, totalAgents: 48, collectItems: 'ITEM0207~0220', status: 'healthy' },
    { name: 'AI - LLM/Agent', version: '1.0.0', activeAgents: 6, totalAgents: 48, collectItems: 'ITEM0200~0204', status: 'healthy' },
    { name: 'AI - VectorDB', version: '1.0.0', activeAgents: 3, totalAgents: 48, collectItems: 'ITEM0205~0206', status: 'healthy' },
    { name: 'Diagnostic (py-spy)', version: '0.9.0', activeAgents: 2, totalAgents: 48, collectItems: 'Flamegraph', status: 'warning' },
  ];
}

export function getDiagnosticRuns(): DiagnosticRun[] {
  const now = Date.now();
  return [
    { id: 'run-001', scope: 'full', items: 86, passed: 78, warned: 4, failed: 4, status: 'warning', timestamp: now - 3600_000, duration: 245 },
    { id: 'run-002', scope: 'ai', items: 31, passed: 29, warned: 2, failed: 0, status: 'healthy', timestamp: now - 7200_000, duration: 120 },
    { id: 'run-003', scope: 'infra', items: 55, passed: 47, warned: 3, failed: 5, status: 'critical', timestamp: now - 21600_000, duration: 180 },
    { id: 'run-004', scope: 'full', items: 86, passed: 82, warned: 2, failed: 2, status: 'warning', timestamp: now - 86400_000, duration: 260 },
  ];
}

export function getDiagnosticItems(runId: string): DiagnosticItem[] {
  return [
    { id: 'ITEM0001', category: 'os', name: 'CPU Usage Optimization', result: 'pass', value: '45%', threshold: '<85%' },
    { id: 'ITEM0010', category: 'middleware', name: 'WAS Thread Pool', result: 'pass', value: '62/200', threshold: '<90%' },
    { id: 'ITEM0015', category: 'middleware', name: 'DB Connection Pool', result: 'warn', value: '92/100', threshold: '<85%', recommendation: 'Increase pool size to 150 or optimize query latency' },
    { id: 'ITEM0020', category: 'middleware', name: 'Redis Memory Usage', result: 'pass', value: '2.1GB/4GB', threshold: '<75%' },
    { id: 'ITEM0200', category: 'llm', name: 'LLM Inference Latency (TTFT)', result: 'pass', value: 'P95: 1.2s', threshold: '<2s' },
    { id: 'ITEM0202', category: 'llm', name: 'Token Throughput (TPS)', result: 'pass', value: 'P50: 42 tok/s', threshold: '>30' },
    { id: 'ITEM0204', category: 'llm', name: 'LLM Error Rate', result: 'pass', value: '0.22%', threshold: '<1%' },
    { id: 'ITEM0205', category: 'vectordb', name: 'Vector Search Latency', result: 'pass', value: 'P99: 120ms', threshold: '<500ms' },
    { id: 'ITEM0206', category: 'vectordb', name: 'Vector Index Health', result: 'pass', value: '125K vectors, 8 segments', threshold: 'N/A' },
    { id: 'ITEM0207', category: 'gpu', name: 'GPU VRAM Usage', result: 'warn', value: '89%', threshold: '<85%', recommendation: 'Consider int8 quantization or reduce batch size' },
    { id: 'ITEM0208', category: 'gpu', name: 'GPU OOM Prevention', result: 'fail', value: 'max_batch_tokens not set', threshold: 'configured', recommendation: 'Set --max-batch-tokens in vLLM config to prevent OOM' },
    { id: 'ITEM0212', category: 'gpu', name: 'GPU Temperature', result: 'pass', value: '62°C', threshold: '<85°C' },
    { id: 'ITEM0218', category: 'gpu', name: 'Quantization Adequacy', result: 'fail', value: 'fp16 (no quantization)', threshold: 'int8 recommended for 70B', recommendation: 'Apply GPTQ int8 quantization — saves ~40% VRAM' },
    { id: 'ITEM0220', category: 'gpu', name: 'Continuous Batching', result: 'warn', value: 'disabled', threshold: 'enabled', recommendation: 'Enable --enable-continuous-batching for 2x throughput' },
    { id: 'ITEM0300', category: 'guardrail', name: 'Guardrail Block Rate', result: 'pass', value: '2.1%', threshold: '<5%' },
    { id: 'ITEM0301', category: 'guardrail', name: 'Guardrail Latency', result: 'warn', value: 'P95: 130ms', threshold: '<100ms', recommendation: 'Optimize content_safety policy regex patterns' },
  ];
}

export function getAlertPolicies(): AlertPolicy[] {
  const now = Date.now();
  return [
    { id: 'ap-1', name: 'GPU VRAM Critical', severity: 'critical', target: 'GPU Hosts', conditionType: 'metric', condition: 'gpu_vram_used_bytes / gpu_vram_total_bytes > 0.9', thresholdType: 'static', channels: ['slack-alerts', 'pagerduty'], enabled: true, lastTriggered: now - 10800_000 },
    { id: 'ap-2', name: 'LLM TTFT High', severity: 'warning', target: 'AI Services', conditionType: 'metric', condition: 'histogram_quantile(0.95, llm_ttft_seconds) > 2', thresholdType: 'static', channels: ['slack-alerts'], enabled: true, lastTriggered: now - 3600_000 },
    { id: 'ap-3', name: 'Error Rate Spike', severity: 'warning', target: 'All Services', conditionType: 'metric', condition: 'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01', thresholdType: 'dynamic', channels: ['slack-alerts', 'email-oncall'], enabled: true, lastTriggered: now - 7200_000 },
    { id: 'ap-4', name: 'Host CPU Critical', severity: 'critical', target: 'All Hosts', conditionType: 'metric', condition: 'node_cpu_seconds_total{mode="idle"} < 10', thresholdType: 'static', channels: ['slack-alerts', 'pagerduty'], enabled: true },
    { id: 'ap-5', name: 'Disk Space Low', severity: 'warning', target: 'prod-db-*', conditionType: 'metric', condition: 'node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15', thresholdType: 'forecast', channels: ['slack-infra'], enabled: true },
    { id: 'ap-6', name: 'Guardrail Block Spike', severity: 'warning', target: 'RAG Services', conditionType: 'metric', condition: 'rate(llm_guardrail_checks_total{action="BLOCK"}[5m]) > 0.05', thresholdType: 'dynamic', channels: ['slack-alerts'], enabled: true },
    { id: 'ap-7', name: 'GPU Temperature High', severity: 'info', target: 'GPU Hosts', conditionType: 'metric', condition: 'gpu_temperature_celsius > 80', thresholdType: 'static', channels: ['slack-infra'], enabled: false },
    { id: 'ap-8', name: 'Log Error Burst', severity: 'warning', target: 'All Services', conditionType: 'log', condition: 'count(level="ERROR") > 50 in 5m', thresholdType: 'static', channels: ['slack-alerts'], enabled: true },
  ];
}

export function getIncidents(): IncidentDetail[] {
  const now = Date.now();
  return [
    {
      id: 'INC-2026-0312', title: 'GPU VRAM Critical — prod-gpu-03', severity: 'critical', status: 'resolved', assignee: 'kim.sre',
      createdAt: now - 7200_000, resolvedAt: now - 5400_000, duration: 1800,
      relatedAlertPolicy: 'GPU VRAM Critical',
      timeline: [
        { timestamp: now - 7200_000, type: 'alert', icon: '🟡', message: 'GPU VRAM 85% exceeded (86%)', actor: 'system' },
        { timestamp: now - 7080_000, type: 'alert', icon: '🔴', message: 'GPU VRAM 90% exceeded (92%)', actor: 'system' },
        { timestamp: now - 7080_000, type: 'notification', icon: '📧', message: 'Alert sent: Slack #alerts, @oncall', actor: 'system' },
        { timestamp: now - 6900_000, type: 'ack', icon: '👤', message: 'Acknowledged', actor: 'kim.sre' },
        { timestamp: now - 6600_000, type: 'action', icon: '🔧', message: 'Reducing batch size: 32 → 16', actor: 'kim.sre' },
        { timestamp: now - 6000_000, type: 'action', icon: '📉', message: 'VRAM dropping: 88% — stabilizing', actor: 'system' },
        { timestamp: now - 5400_000, type: 'resolve', icon: '✅', message: 'VRAM 82% — back to normal range', actor: 'kim.sre' },
      ],
      rca: 'New model (Llama-3-70B-fp16) deployed at 14:25 uses 15% more VRAM than previous. Batch size 32 caused VRAM to exceed limit. Related: ITEM0218 (quantization) and ITEM0208 (OOM prevention).',
    },
    {
      id: 'INC-2026-0311', title: 'LLM TTFT degradation — rag-service', severity: 'warning', status: 'resolved', assignee: 'park.ai',
      createdAt: now - 43200_000, resolvedAt: now - 39600_000, duration: 3600,
      relatedAlertPolicy: 'LLM TTFT High',
      timeline: [
        { timestamp: now - 43200_000, type: 'alert', icon: '🟡', message: 'TTFT P95 exceeded 2s (2.8s)', actor: 'system' },
        { timestamp: now - 43200_000, type: 'notification', icon: '📧', message: 'Alert sent: Slack #alerts', actor: 'system' },
        { timestamp: now - 42000_000, type: 'ack', icon: '👤', message: 'Acknowledged', actor: 'park.ai' },
        { timestamp: now - 40800_000, type: 'action', icon: '🔧', message: 'Scaled GPU replicas 2 → 3', actor: 'park.ai' },
        { timestamp: now - 39600_000, type: 'resolve', icon: '✅', message: 'TTFT P95 back to 1.3s', actor: 'park.ai' },
      ],
      rca: 'Traffic spike from marketing campaign caused queue saturation. Resolved by horizontal scaling.',
    },
    {
      id: 'INC-2026-0310', title: 'Error rate spike — api-gateway', severity: 'warning', status: 'open', assignee: 'lee.ops',
      createdAt: now - 1800_000,
      relatedAlertPolicy: 'Error Rate Spike',
      timeline: [
        { timestamp: now - 1800_000, type: 'alert', icon: '🟡', message: 'Error rate 4.2% (threshold 1%)', actor: 'system' },
        { timestamp: now - 1800_000, type: 'notification', icon: '📧', message: 'Alert sent: Slack #alerts, email-oncall', actor: 'system' },
        { timestamp: now - 1500_000, type: 'ack', icon: '👤', message: 'Acknowledged', actor: 'lee.ops' },
        { timestamp: now - 1200_000, type: 'action', icon: '🔧', message: 'Investigating upstream rag-service 502 errors', actor: 'lee.ops' },
      ],
    },
  ];
}

export function getNotificationChannels(): NotificationChannel[] {
  return [
    { id: 'nc-1', name: 'slack-alerts', type: 'slack', config: '#monitoring-alerts', enabled: true },
    { id: 'nc-2', name: 'slack-infra', type: 'slack', config: '#infra-alerts', enabled: true },
    { id: 'nc-3', name: 'email-oncall', type: 'email', config: 'oncall@example.com', enabled: true },
    { id: 'nc-4', name: 'pagerduty', type: 'pagerduty', config: 'Service: AI-Production', enabled: true },
    { id: 'nc-5', name: 'webhook-ci', type: 'webhook', config: 'https://ci.example.com/hooks/alert', enabled: false },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Phase 14: SLO, Cost, Executive 데이터
// ═══════════════════════════════════════════════════════════════

export function getSLODefinitions(): SLODefinition[] {
  return [
    { id: 'slo-1', name: 'API Availability', service: 'api-gateway', sli: 'success_rate(http_requests_total)', target: 99.9, window: '30d', current: 99.92, errorBudgetRemaining: 78, status: 'met', burnRate: 0.8 },
    { id: 'slo-2', name: 'API Latency P95', service: 'api-gateway', sli: 'histogram_quantile(0.95, http_request_duration_seconds)', target: 99.5, window: '30d', current: 99.3, errorBudgetRemaining: 42, status: 'at_risk', burnRate: 1.8 },
    { id: 'slo-3', name: 'RAG TTFT P95', service: 'rag-service', sli: 'histogram_quantile(0.95, llm_ttft_seconds) < 2s', target: 99.0, window: '30d', current: 98.2, errorBudgetRemaining: 18, status: 'at_risk', burnRate: 2.5 },
    { id: 'slo-4', name: 'RAG Error Rate', service: 'rag-service', sli: 'error_rate(http_requests_total{service="rag"})', target: 99.5, window: '30d', current: 99.78, errorBudgetRemaining: 85, status: 'met', burnRate: 0.5 },
    { id: 'slo-5', name: 'Embedding Latency', service: 'embedding-service', sli: 'histogram_quantile(0.99, embedding_duration_seconds) < 500ms', target: 99.9, window: '7d', current: 99.95, errorBudgetRemaining: 92, status: 'met', burnRate: 0.3 },
    { id: 'slo-6', name: 'GPU VRAM Availability', service: 'gpu-cluster', sli: 'avg(gpu_vram_used_bytes/gpu_vram_total_bytes) < 0.9', target: 99.0, window: '7d', current: 97.5, errorBudgetRemaining: 5, status: 'breached', burnRate: 4.2 },
  ];
}

export function getCostBreakdowns(): CostBreakdown[] {
  return [
    { category: 'LLM API', subcategory: 'GPT-4o (rag-service)', amount: 204, trend: 12, unit: '$/day' },
    { category: 'LLM API', subcategory: 'GPT-4o (code-assistant)', amount: 76.8, trend: -3, unit: '$/day' },
    { category: 'LLM API', subcategory: 'Llama-3-70B (doc-summarizer)', amount: 19.2, trend: 5, unit: '$/day' },
    { category: 'GPU Compute', subcategory: 'prod-gpu-01 (2x A100)', amount: 48, trend: 0, unit: '$/day' },
    { category: 'GPU Compute', subcategory: 'prod-gpu-02 (2x A100)', amount: 48, trend: 0, unit: '$/day' },
    { category: 'Infrastructure', subcategory: 'API Servers (2x)', amount: 12, trend: 0, unit: '$/day' },
    { category: 'Infrastructure', subcategory: 'Database (PostgreSQL)', amount: 8, trend: 0, unit: '$/day' },
    { category: 'Infrastructure', subcategory: 'Cache (Redis)', amount: 4, trend: 0, unit: '$/day' },
    { category: 'Storage', subcategory: 'Prometheus (metrics)', amount: 3.5, trend: 8, unit: '$/day' },
    { category: 'Storage', subcategory: 'Tempo (traces)', amount: 2.1, trend: 15, unit: '$/day' },
    { category: 'Storage', subcategory: 'Loki (logs)', amount: 1.8, trend: 10, unit: '$/day' },
    { category: 'Storage', subcategory: 'Qdrant (vectors)', amount: 1.5, trend: 2, unit: '$/day' },
    { category: 'External API', subcategory: 'OpenAI Embedding API', amount: 5.2, trend: -8, unit: '$/day' },
  ];
}

export function getExecutiveSummary(): ExecutiveSummary {
  return {
    overallHealth: 'healthy',
    sloCompliance: 99.7,
    totalServices: 8,
    activeIncidents: 1,
    mttr: 30,
    totalCostPerDay: 433.1,
    costTrend: 4.2,
    topIssues: [
      { title: 'GPU VRAM SLO breached — prod-gpu-03', severity: 'critical', age: '2h' },
      { title: 'RAG TTFT P95 approaching SLO threshold', severity: 'warning', age: '6h' },
      { title: 'API latency P95 error budget at 42%', severity: 'warning', age: '1d' },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 14-1: 커스텀 대시보드 템플릿
// ═══════════════════════════════════════════════════════════════

export function getDashboardTemplates(): DashboardConfig[] {
  const now = Date.now();
  return [
    {
      id: 'tpl-ai', name: 'AI Service Overview', description: 'LLM performance, GPU status, guardrail metrics', template: 'ai',
      widgets: [
        { id: 'w1', type: 'kpi', title: 'TTFT P95', size: '1x1', metric: 'llm_ttft_seconds' },
        { id: 'w2', type: 'kpi', title: 'TPS P50', size: '1x1', metric: 'llm_tokens_per_second' },
        { id: 'w3', type: 'kpi', title: 'GPU VRAM', size: '1x1', metric: 'gpu_vram_used_bytes' },
        { id: 'w4', type: 'kpi', title: 'Block Rate', size: '1x1', metric: 'llm_guardrail_checks_total' },
        { id: 'w5', type: 'timeseries', title: 'TTFT Trend', size: '2x1', metric: 'llm_ttft_seconds' },
        { id: 'w6', type: 'timeseries', title: 'TPS Trend', size: '2x1', metric: 'llm_tokens_per_second' },
        { id: 'w7', type: 'bar', title: 'Token Cost by Model', size: '2x1', metric: 'llm_cost_dollars_total' },
        { id: 'w8', type: 'timeseries', title: 'GPU Temperature', size: '2x1', metric: 'gpu_temperature_celsius' },
      ],
      createdAt: now - 86400_000 * 7, updatedAt: now - 3600_000,
    },
    {
      id: 'tpl-infra', name: 'Infrastructure', description: 'Host resources, network, disk usage', template: 'infra',
      widgets: [
        { id: 'w1', type: 'kpi', title: 'CPU Usage', size: '1x1', metric: 'node_cpu_seconds_total' },
        { id: 'w2', type: 'kpi', title: 'Memory', size: '1x1', metric: 'node_memory_MemAvailable_bytes' },
        { id: 'w3', type: 'kpi', title: 'Disk I/O', size: '1x1', metric: 'node_disk_io_time_seconds_total' },
        { id: 'w4', type: 'kpi', title: 'Network', size: '1x1', metric: 'node_network_receive_bytes_total' },
        { id: 'w5', type: 'timeseries', title: 'CPU Trend', size: '2x1', metric: 'node_cpu_seconds_total' },
        { id: 'w6', type: 'timeseries', title: 'Memory Trend', size: '2x1', metric: 'node_memory_MemAvailable_bytes' },
        { id: 'w7', type: 'timeseries', title: 'Disk Usage', size: '2x1', metric: 'node_filesystem_avail_bytes' },
        { id: 'w8', type: 'timeseries', title: 'Network I/O', size: '2x1', metric: 'node_network_receive_bytes_total' },
      ],
      createdAt: now - 86400_000 * 7, updatedAt: now - 7200_000,
    },
    {
      id: 'tpl-exec', name: 'Executive Summary', description: 'High-level KPIs, SLO compliance, cost overview', template: 'executive',
      widgets: [
        { id: 'w1', type: 'kpi', title: 'SLO Compliance', size: '1x1', metric: 'slo_compliance' },
        { id: 'w2', type: 'kpi', title: 'Active Incidents', size: '1x1', metric: 'incidents_active' },
        { id: 'w3', type: 'kpi', title: 'Daily Cost', size: '1x1', metric: 'cost_total' },
        { id: 'w4', type: 'kpi', title: 'MTTR', size: '1x1', metric: 'mttr' },
        { id: 'w5', type: 'pie', title: 'Cost Breakdown', size: '2x2', metric: 'cost_breakdown' },
        { id: 'w6', type: 'timeseries', title: 'Error Rate Trend', size: '2x1', metric: 'http_requests_total' },
        { id: 'w7', type: 'text', title: 'Notes', size: '2x1', content: 'Weekly review: GPU costs trending up 4%. Consider int8 quantization for Llama-3-70B.' },
      ],
      createdAt: now - 86400_000 * 3, updatedAt: now - 1800_000,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Phase 14-4: Investigation Notebook
// ═══════════════════════════════════════════════════════════════

export function getSampleNotebooks(): Notebook[] {
  const now = Date.now();
  return [
    {
      id: 'nb-1',
      title: 'INC-0312: GPU VRAM Critical Investigation',
      description: 'Root cause analysis for prod-gpu-03 VRAM critical alert on 2026-03-20',
      author: 'kim.sre',
      relatedIncident: 'INC-2026-0312',
      tags: ['incident', 'gpu', 'vram', 'postmortem'],
      cells: [
        { id: 'c1', type: 'markdown', content: '## Incident Summary\n\nAt 14:30 UTC, GPU VRAM on **prod-gpu-03** exceeded 90% threshold, triggering a critical alert. The issue was caused by deploying Llama-3-70B in fp16 without adjusting the batch size.\n\n### Timeline\n- 14:25 — New model deployed (Llama-3-70B-fp16)\n- 14:30 — VRAM alert fired (86%)\n- 14:32 — VRAM critical (92%)\n- 14:36 — Batch size reduced 32→16\n- 14:45 — VRAM stabilized at 82%' },
        { id: 'c2', type: 'query', content: 'gpu_vram_used_bytes{instance="prod-gpu-03"}' },
        { id: 'c3', type: 'chart', content: 'gpu_vram_used_bytes' },
        { id: 'c4', type: 'markdown', content: '### Analysis\n\nThe fp16 model requires ~15% more VRAM than the previous int8 quantized version. With batch size 32, total allocation exceeded GPU capacity.\n\n**AITOP Diagnostic cross-reference:**\n- ITEM0218 (Quantization Adequacy) — fp16 → int8 recommended\n- ITEM0208 (OOM Prevention) — `max_batch_tokens` not configured' },
        { id: 'c5', type: 'query', content: 'gpu_temperature_celsius{instance="prod-gpu-03"}' },
        { id: 'c6', type: 'chart', content: 'gpu_temperature_celsius' },
        { id: 'c7', type: 'markdown', content: '### Resolution\n\n1. Immediate: Reduced batch size 32→16\n2. Short-term: Set `--max-batch-tokens 8192` in vLLM config\n3. Long-term: Apply GPTQ int8 quantization (saves ~40% VRAM)\n\n### Action Items\n- [ ] Apply int8 quantization to Llama-3-70B\n- [ ] Add `max_batch_tokens` to all GPU service configs\n- [ ] Update deployment checklist to include VRAM impact assessment' },
      ],
      createdAt: now - 7200_000,
      updatedAt: now - 3600_000,
    },
    {
      id: 'nb-2',
      title: 'RAG TTFT Performance Analysis',
      description: 'Investigating TTFT P95 increase from 1.2s to 2.8s during traffic spike',
      author: 'park.ai',
      relatedIncident: 'INC-2026-0311',
      tags: ['performance', 'rag', 'ttft', 'scaling'],
      cells: [
        { id: 'c1', type: 'markdown', content: '## Context\n\nDuring a marketing campaign, RAG service TTFT P95 spiked from 1.2s to 2.8s, exceeding the 2s SLO threshold.' },
        { id: 'c2', type: 'query', content: 'histogram_quantile(0.95, rate(llm_ttft_seconds_bucket[5m]))' },
        { id: 'c3', type: 'chart', content: 'llm_ttft_seconds' },
        { id: 'c4', type: 'markdown', content: '### Findings\n\n1. Traffic increased 3x during campaign window\n2. GPU queue depth maxed out → queuing delay dominated TTFT\n3. Horizontal scaling from 2→3 replicas resolved the issue\n\n### Recommendation\n- Configure HPA based on `llm_requests_in_flight` metric\n- Set target: scale up when concurrent requests > 15' },
      ],
      createdAt: now - 43200_000,
      updatedAt: now - 39600_000,
    },
    {
      id: 'nb-3',
      title: 'Weekly Cost Review — Week 12',
      description: 'Regular cost review and optimization opportunities',
      author: 'kim.aura',
      tags: ['cost', 'review', 'weekly'],
      cells: [
        { id: 'c1', type: 'markdown', content: '## Cost Summary (Week 12)\n\n| Category | Amount | Trend |\n|----------|--------|-------|\n| LLM API | $2,100/week | +12% |\n| GPU Compute | $672/week | flat |\n| Infrastructure | $168/week | flat |\n| Storage | $62/week | +10% |\n\n**Total: $3,002/week** ($12,900/month)' },
        { id: 'c2', type: 'chart', content: 'llm_cost_dollars_total' },
        { id: 'c3', type: 'markdown', content: '### Optimization Opportunities\n\n1. **Embedding cache**: Hit rate 94% → increasing to 97% could save ~$150/week\n2. **Prompt compression**: Average input tokens 1,240 → target 800 with summarization\n3. **Model tiering**: Route simple queries to GPT-3.5-Turbo instead of GPT-4o\n\n### Decisions\n- Approved: Implement prompt compression (ETA: next sprint)\n- Deferred: Model tiering (needs quality evaluation first)' },
      ],
      createdAt: now - 172800_000,
      updatedAt: now - 86400_000,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Phase 14-6: Multi-tenant
// ═══════════════════════════════════════════════════════════════

export function getTenants(): Tenant[] {
  const now = Date.now();
  return [
    { id: 't-aitop', name: 'AITOP Corp', slug: 'aitop', plan: 'enterprise', status: 'active', primaryColor: '#58A6FF', projectCount: 4, userCount: 25, hostCount: 48, monthlyUsage: 12900, monthlyLimit: 20000, dataRetentionDays: 90, createdAt: now - 86400_000 * 180, contactEmail: 'admin@aitop.io' },
    { id: 't-acme', name: 'Acme AI Labs', slug: 'acme', plan: 'pro', status: 'active', primaryColor: '#3FB950', projectCount: 2, userCount: 12, hostCount: 16, monthlyUsage: 4200, monthlyLimit: 8000, dataRetentionDays: 30, createdAt: now - 86400_000 * 90, contactEmail: 'ops@acme-ai.com' },
    { id: 't-fintech', name: 'FinTech Solutions', slug: 'fintech', plan: 'enterprise', status: 'active', primaryColor: '#D29922', projectCount: 3, userCount: 18, hostCount: 32, monthlyUsage: 8500, monthlyLimit: 15000, dataRetentionDays: 180, createdAt: now - 86400_000 * 120, contactEmail: 'infra@fintech-sol.kr' },
    { id: 't-startup', name: 'ML Startup Inc', slug: 'mlstartup', plan: 'free', status: 'trial', primaryColor: '#BC8CFF', projectCount: 1, userCount: 3, hostCount: 4, monthlyUsage: 280, monthlyLimit: 500, dataRetentionDays: 7, createdAt: now - 86400_000 * 14, contactEmail: 'dev@mlstartup.io' },
    { id: 't-health', name: 'HealthAI Corp', slug: 'healthai', plan: 'enterprise', status: 'active', primaryColor: '#F778BA', projectCount: 2, userCount: 15, hostCount: 24, monthlyUsage: 6800, monthlyLimit: 12000, dataRetentionDays: 365, createdAt: now - 86400_000 * 60, contactEmail: 'platform@healthai.co.kr' },
    { id: 't-suspended', name: 'OldTech LLC', slug: 'oldtech', plan: 'pro', status: 'suspended', projectCount: 1, userCount: 5, hostCount: 8, monthlyUsage: 0, monthlyLimit: 8000, dataRetentionDays: 30, createdAt: now - 86400_000 * 200, contactEmail: 'admin@oldtech.com' },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Phase 16-4-4: Fleet 관리 콘솔 완성
// ═══════════════════════════════════════════════════════════════

export function getAgentGroups(): AgentGroup[] {
  return [
    { id: 'grp-gpu', name: 'GPU Servers', description: 'AI/LLM serving GPU nodes', agentIds: ['a-03', 'a-04'], tags: ['ai', 'gpu', 'production'], createdAt: new Date(Date.now() - 86400_000 * 30).toISOString() },
    { id: 'grp-api', name: 'API Servers', description: 'Backend API nodes', agentIds: ['a-01', 'a-02'], tags: ['api', 'production'], createdAt: new Date(Date.now() - 86400_000 * 28).toISOString() },
    { id: 'grp-db', name: 'Database Servers', description: 'PostgreSQL & Redis nodes', agentIds: ['a-05', 'a-06'], tags: ['db', 'production'], createdAt: new Date(Date.now() - 86400_000 * 25).toISOString() },
    { id: 'grp-legacy', name: 'Legacy Hosts', description: 'AIX / old OS nodes', agentIds: [], tags: ['legacy', 'offline'], createdAt: new Date(Date.now() - 86400_000 * 10).toISOString() },
  ];
}

export function getUpdateStatuses(): UpdateStatus[] {
  const now = new Date().toISOString();
  return [
    { agentId: 'a-01', hostname: 'prod-api-01', currentVersion: '1.2.0', targetVersion: '1.2.0', phase: 'completed', progress: 100, startedAt: new Date(Date.now() - 3600_000).toISOString(), completedAt: new Date(Date.now() - 3540_000).toISOString() },
    { agentId: 'a-02', hostname: 'prod-api-02', currentVersion: '1.2.0', targetVersion: '1.2.0', phase: 'completed', progress: 100, startedAt: new Date(Date.now() - 3600_000).toISOString(), completedAt: new Date(Date.now() - 3530_000).toISOString() },
    { agentId: 'a-03', hostname: 'prod-gpu-01', currentVersion: '1.2.0', targetVersion: '1.2.0', phase: 'completed', progress: 100, startedAt: new Date(Date.now() - 3600_000).toISOString(), completedAt: new Date(Date.now() - 3510_000).toISOString() },
    { agentId: 'a-04', hostname: 'prod-gpu-02', currentVersion: '1.1.9', targetVersion: '1.2.0', phase: 'pending', progress: 0 },
    { agentId: 'a-05', hostname: 'prod-db-01', currentVersion: '1.2.0', targetVersion: '1.2.0', phase: 'completed', progress: 100, startedAt: new Date(Date.now() - 3600_000).toISOString(), completedAt: new Date(Date.now() - 3520_000).toISOString() },
    { agentId: 'a-06', hostname: 'prod-redis-01', currentVersion: '1.1.9', targetVersion: '1.2.0', phase: 'downloading', progress: 42, startedAt: now },
  ];
}

export function getCollectionSchedules(): CollectionSchedule[] {
  return [
    { id: 'sched-01', name: '전체 정기 수집', targetType: 'all', cron: '*/30 * * * *', enabled: true, lastRun: new Date(Date.now() - 180_000).toISOString(), nextRun: new Date(Date.now() + 1620_000).toISOString() },
    { id: 'sched-02', name: 'GPU 그룹 집중 수집', targetType: 'group', targetId: 'grp-gpu', cron: '*/5 * * * *', enabled: true, lastRun: new Date(Date.now() - 60_000).toISOString(), nextRun: new Date(Date.now() + 240_000).toISOString() },
    { id: 'sched-03', name: 'DB 야간 수집', targetType: 'group', targetId: 'grp-db', cron: '0 2 * * *', enabled: false, lastRun: new Date(Date.now() - 86400_000).toISOString(), nextRun: new Date(Date.now() + 72000_000).toISOString() },
  ];
}

// ══ Phase 19: AI Value Enhancement — Mock Data ══════════════════════════

const now = Date.now();

export function getEvalJobs(): EvalJob[] {
  return [
    { id: 'eval-01', name: 'RAG Quality Benchmark v3', status: 'completed', model: 'gpt-4o', judgeModel: 'claude-3.5-sonnet', datasetName: 'qa-finance-500', datasetSize: 500, metrics: ['relevancy', 'faithfulness', 'coherence'], aggregateScores: [{ metric: 'relevancy', score: 0.87, threshold: 0.8 }, { metric: 'faithfulness', score: 0.92, threshold: 0.85 }, { metric: 'coherence', score: 0.84, threshold: 0.8 }], samplesProcessed: 500, createdAt: now - 86400_000, completedAt: now - 82800_000, duration: 3600 },
    { id: 'eval-02', name: 'Code Assistant Eval', status: 'completed', model: 'claude-3.5-sonnet', judgeModel: 'gpt-4o', datasetName: 'code-review-200', datasetSize: 200, metrics: ['relevancy', 'coherence'], aggregateScores: [{ metric: 'relevancy', score: 0.91 }, { metric: 'coherence', score: 0.88 }], samplesProcessed: 200, createdAt: now - 172800_000, completedAt: now - 169200_000, duration: 2400 },
    { id: 'eval-03', name: 'Summarizer Toxicity Check', status: 'running', model: 'llama-3-70b', judgeModel: 'gpt-4o', datasetName: 'news-articles-300', datasetSize: 300, metrics: ['toxicity', 'coherence'], aggregateScores: [{ metric: 'toxicity', score: 0.03 }, { metric: 'coherence', score: 0.79 }], samplesProcessed: 187, createdAt: now - 1800_000 },
    { id: 'eval-04', name: 'Customer Support v2', status: 'completed', model: 'gpt-4o-mini', judgeModel: 'claude-3.5-sonnet', datasetName: 'support-tickets-150', datasetSize: 150, metrics: ['relevancy', 'faithfulness'], aggregateScores: [{ metric: 'relevancy', score: 0.78, threshold: 0.8 }, { metric: 'faithfulness', score: 0.85, threshold: 0.85 }], samplesProcessed: 150, createdAt: now - 259200_000, completedAt: now - 255600_000, duration: 1800 },
    { id: 'eval-05', name: 'Translation Quality', status: 'pending', model: 'gpt-4o', judgeModel: 'claude-3.5-sonnet', datasetName: 'ko-en-translation-100', datasetSize: 100, metrics: ['relevancy', 'coherence', 'faithfulness'], aggregateScores: [], samplesProcessed: 0, createdAt: now - 300_000 },
  ];
}

export function getEvalSamples(jobId: string): EvalSample[] {
  const samples: EvalSample[] = [];
  const prompts = [
    'What are the key factors affecting GDP growth in 2024?',
    'Explain the difference between supervised and unsupervised learning.',
    'Summarize the quarterly earnings report for Q3.',
    'What security measures should be implemented for API endpoints?',
    'How does transformer attention mechanism work?',
    'Describe the impact of climate change on agriculture.',
    'What are the best practices for database indexing?',
    'Explain the concept of microservices architecture.',
  ];
  for (let i = 0; i < prompts.length; i++) {
    const rel = 0.7 + Math.random() * 0.25;
    const faith = 0.75 + Math.random() * 0.2;
    const coh = 0.72 + Math.random() * 0.22;
    samples.push({
      id: `${jobId}-s${i + 1}`,
      prompt: prompts[i],
      response: `This is the model response for sample ${i + 1}. The answer covers the key aspects of the question with supporting details and references.`,
      reference: i % 2 === 0 ? `Reference answer for sample ${i + 1} with expected content.` : undefined,
      scores: [{ metric: 'relevancy', score: +rel.toFixed(2) }, { metric: 'faithfulness', score: +faith.toFixed(2) }, { metric: 'coherence', score: +coh.toFixed(2) }],
      latencyMs: 800 + Math.floor(Math.random() * 2000),
      tokenCount: 150 + Math.floor(Math.random() * 400),
      judgeModel: 'claude-3.5-sonnet',
      pass: rel > 0.8 && faith > 0.8,
    });
  }
  return samples;
}

export function getABTests(): ABTestComparison[] {
  return [
    { id: 'ab-01', name: 'GPT-4o vs Claude-3.5 on QA', modelA: 'gpt-4o', modelB: 'claude-3.5-sonnet', datasetName: 'qa-finance-500', sampleCount: 200, status: 'completed', metricsA: [{ metric: 'relevancy', score: 0.87 }, { metric: 'faithfulness', score: 0.92 }, { metric: 'coherence', score: 0.84 }, { metric: 'latency', score: 0.75 }, { metric: 'cost', score: 0.60 }], metricsB: [{ metric: 'relevancy', score: 0.89 }, { metric: 'faithfulness', score: 0.90 }, { metric: 'coherence', score: 0.86 }, { metric: 'latency', score: 0.82 }, { metric: 'cost', score: 0.72 }], winRateA: 42, winRateB: 58, createdAt: now - 86400_000 },
    { id: 'ab-02', name: 'Llama-3 vs GPT-4o-mini on Support', modelA: 'llama-3-70b', modelB: 'gpt-4o-mini', datasetName: 'support-tickets-150', sampleCount: 150, status: 'completed', metricsA: [{ metric: 'relevancy', score: 0.76 }, { metric: 'faithfulness', score: 0.81 }, { metric: 'coherence', score: 0.79 }, { metric: 'latency', score: 0.90 }, { metric: 'cost', score: 0.95 }], metricsB: [{ metric: 'relevancy', score: 0.78 }, { metric: 'faithfulness', score: 0.85 }, { metric: 'coherence', score: 0.82 }, { metric: 'latency', score: 0.70 }, { metric: 'cost', score: 0.65 }], winRateA: 55, winRateB: 45, createdAt: now - 172800_000 },
  ];
}

export function getPromptEntries(): PromptEntry[] {
  return [
    { id: 'pr-01', name: 'RAG QA System Prompt', description: 'Main system prompt for RAG-based question answering with citations', tags: ['rag', 'qa', 'production'], model: 'gpt-4o', currentVersion: 5, versions: [
      { version: 5, systemPrompt: 'You are a helpful assistant that answers questions based on the provided context. Always cite sources using [Source N] format. If the context does not contain the answer, say "I don\'t have enough information."', userTemplate: 'Context: {{context}}\n\nQuestion: {{question}}', variables: ['context', 'question'], author: 'admin', createdAt: now - 86400_000, commitMessage: 'Add citation format requirement', performance: { avgLatencyMs: 1200, avgQualityScore: 0.87, avgTokens: 320, usageCount: 2400 } },
      { version: 4, systemPrompt: 'You are a helpful assistant that answers questions based on the provided context. If the context does not contain the answer, say "I don\'t have enough information."', userTemplate: 'Context: {{context}}\n\nQuestion: {{question}}', variables: ['context', 'question'], author: 'admin', createdAt: now - 604800_000, commitMessage: 'Add fallback instruction', performance: { avgLatencyMs: 1150, avgQualityScore: 0.82, avgTokens: 290, usageCount: 8500 } },
      { version: 3, systemPrompt: 'You are a helpful assistant. Answer based on context only.', userTemplate: 'Context: {{context}}\n\nQuestion: {{question}}', variables: ['context', 'question'], author: 'sre', createdAt: now - 1209600_000, commitMessage: 'Simplify system prompt', performance: { avgLatencyMs: 980, avgQualityScore: 0.75, avgTokens: 250, usageCount: 12000 } },
    ], totalUsage: 22900, avgQualityScore: 0.87, isPublic: true, owner: 'admin', createdAt: now - 2592000_000, updatedAt: now - 86400_000 },
    { id: 'pr-02', name: 'Code Review Assistant', description: 'Reviews code changes and provides improvement suggestions', tags: ['code', 'review', 'dev'], model: 'claude-3.5-sonnet', currentVersion: 3, versions: [
      { version: 3, systemPrompt: 'You are an expert code reviewer. Analyze the code diff and provide: 1) Security issues 2) Performance concerns 3) Code style suggestions. Be concise and actionable.', userTemplate: 'Language: {{language}}\nDiff:\n```\n{{diff}}\n```', variables: ['language', 'diff'], author: 'ai_engineer', createdAt: now - 172800_000, commitMessage: 'Add structured output format', performance: { avgLatencyMs: 2100, avgQualityScore: 0.91, avgTokens: 450, usageCount: 890 } },
      { version: 2, systemPrompt: 'You are a code reviewer. Analyze the given code diff and suggest improvements.', userTemplate: 'Language: {{language}}\nDiff:\n{{diff}}', variables: ['language', 'diff'], author: 'ai_engineer', createdAt: now - 604800_000, commitMessage: 'Add language parameter', performance: { avgLatencyMs: 1900, avgQualityScore: 0.85, avgTokens: 380, usageCount: 3200 } },
    ], totalUsage: 4090, avgQualityScore: 0.91, isPublic: false, owner: 'ai_engineer', createdAt: now - 1296000_000, updatedAt: now - 172800_000 },
    { id: 'pr-03', name: 'Document Summarizer', description: 'Summarizes long documents into concise bullet points', tags: ['summary', 'production'], model: 'gpt-4o-mini', currentVersion: 2, versions: [
      { version: 2, systemPrompt: 'Summarize the document into 5-7 key bullet points. Focus on actionable insights and data points. Use clear, professional language.', userTemplate: 'Document:\n{{document}}\n\nMax length: {{max_words}} words', variables: ['document', 'max_words'], author: 'admin', createdAt: now - 259200_000, commitMessage: 'Add max length control', performance: { avgLatencyMs: 950, avgQualityScore: 0.83, avgTokens: 200, usageCount: 5600 } },
    ], totalUsage: 5600, avgQualityScore: 0.83, isPublic: true, owner: 'admin', createdAt: now - 864000_000, updatedAt: now - 259200_000 },
    { id: 'pr-04', name: 'SQL Query Generator', description: 'Generates SQL queries from natural language questions', tags: ['sql', 'database', 'dev'], model: 'gpt-4o', currentVersion: 4, versions: [
      { version: 4, systemPrompt: 'You are an SQL expert. Generate a valid SQL query for the given schema and question. Use proper JOIN syntax, avoid subqueries when possible, and add comments.', userTemplate: 'Schema:\n{{schema}}\n\nQuestion: {{question}}\nDialect: {{dialect}}', variables: ['schema', 'question', 'dialect'], author: 'sre', createdAt: now - 432000_000, commitMessage: 'Add dialect support (PostgreSQL/MySQL)', performance: { avgLatencyMs: 1400, avgQualityScore: 0.88, avgTokens: 280, usageCount: 1200 } },
    ], totalUsage: 1200, avgQualityScore: 0.88, isPublic: false, owner: 'sre', createdAt: now - 1728000_000, updatedAt: now - 432000_000 },
    { id: 'pr-05', name: 'Incident RCA Analyzer', description: 'Analyzes monitoring data to identify root causes of incidents', tags: ['incident', 'rca', 'ops'], model: 'claude-3.5-sonnet', currentVersion: 2, versions: [
      { version: 2, systemPrompt: 'You are an SRE expert. Analyze the incident data (metrics, logs, traces) and provide: 1) Root cause analysis 2) Impact assessment 3) Recommended remediation steps. Use the 5-Why framework.', userTemplate: 'Incident: {{incident_summary}}\nMetrics: {{metrics}}\nLogs: {{logs}}\nTime window: {{time_window}}', variables: ['incident_summary', 'metrics', 'logs', 'time_window'], author: 'sre', createdAt: now - 604800_000, commitMessage: 'Add 5-Why framework', performance: { avgLatencyMs: 2800, avgQualityScore: 0.86, avgTokens: 520, usageCount: 340 } },
    ], totalUsage: 340, avgQualityScore: 0.86, isPublic: true, owner: 'sre', createdAt: now - 1296000_000, updatedAt: now - 604800_000 },
  ];
}

export function getModelCostProfiles(): ModelCostProfile[] {
  return [
    { model: 'gpt-4o', provider: 'OpenAI', inputCostPer1k: 2.50, outputCostPer1k: 10.00, avgLatencyMs: 1200, qualityScore: 0.89, dailyTokens: 2_400_000, dailyCost: 18.60, costEfficiency: 0.048 },
    { model: 'gpt-4o-mini', provider: 'OpenAI', inputCostPer1k: 0.15, outputCostPer1k: 0.60, avgLatencyMs: 650, qualityScore: 0.78, dailyTokens: 5_200_000, dailyCost: 2.34, costEfficiency: 0.333 },
    { model: 'claude-3.5-sonnet', provider: 'Anthropic', inputCostPer1k: 3.00, outputCostPer1k: 15.00, avgLatencyMs: 1400, qualityScore: 0.91, dailyTokens: 1_800_000, dailyCost: 19.80, costEfficiency: 0.046 },
    { model: 'claude-3.5-haiku', provider: 'Anthropic', inputCostPer1k: 0.80, outputCostPer1k: 4.00, avgLatencyMs: 420, qualityScore: 0.76, dailyTokens: 3_100_000, dailyCost: 8.88, costEfficiency: 0.086 },
    { model: 'llama-3-70b', provider: 'Self-hosted', inputCostPer1k: 0.05, outputCostPer1k: 0.05, avgLatencyMs: 1800, qualityScore: 0.74, dailyTokens: 1_500_000, dailyCost: 0.15, costEfficiency: 4.933 },
    { model: 'mixtral-8x7b', provider: 'Self-hosted', inputCostPer1k: 0.03, outputCostPer1k: 0.03, avgLatencyMs: 900, qualityScore: 0.71, dailyTokens: 800_000, dailyCost: 0.05, costEfficiency: 14.200 },
  ];
}

export function getCacheAnalysis(): CacheAnalysis {
  return { totalRequests: 48_500, cacheHits: 18_430, cacheMisses: 30_070, hitRate: 0.38, estimatedSavings: 12.50, potentialSavings: 28.40, topCacheablePatternsCount: 15 };
}

export function getCostRecommendations(): CostRecommendation[] {
  return [
    { id: 'rec-01', priority: 'high', category: 'model_switch', title: 'Switch FAQ queries to GPT-4o-mini', description: 'Simple FAQ queries currently use GPT-4o. Switching to GPT-4o-mini would reduce cost by 94% with only 5% quality drop for this use case.', currentCost: 8.20, estimatedSaving: 7.71, effort: 'low', implemented: false },
    { id: 'rec-02', priority: 'high', category: 'cache', title: 'Enable semantic cache for RAG queries', description: 'Repeated similar queries could be served from cache. Current hit rate is 38%; enabling semantic matching could reach 65%.', currentCost: 18.60, estimatedSaving: 5.02, effort: 'medium', implemented: false },
    { id: 'rec-03', priority: 'medium', category: 'token_reduction', title: 'Compress context window for summarization', description: 'Document summarizer sends full documents (avg 4K tokens). Pre-extracting key sections could reduce input by 40%.', currentCost: 2.34, estimatedSaving: 0.94, effort: 'medium', implemented: false },
    { id: 'rec-04', priority: 'medium', category: 'batch', title: 'Batch code review requests', description: 'Code reviews are processed one-by-one. Batching up to 5 diffs per request would reduce API calls by 60%.', currentCost: 4.50, estimatedSaving: 1.80, effort: 'low', implemented: true },
    { id: 'rec-05', priority: 'low', category: 'routing', title: 'Route simple queries to local LLM', description: 'Classification shows 30% of queries are simple lookups that Llama-3 can handle. Routing these locally saves API costs.', currentCost: 6.00, estimatedSaving: 1.50, effort: 'high', implemented: false },
  ];
}

export function getBudgetAlerts(): BudgetAlert[] {
  return [
    { id: 'ba-01', name: 'Daily AI API Budget', threshold: 60, currentSpend: 49.77, period: 'daily', enabled: true, lastTriggered: now - 259200_000 },
    { id: 'ba-02', name: 'Weekly GPU Compute', threshold: 350, currentSpend: 280, period: 'weekly', enabled: true },
    { id: 'ba-03', name: 'Monthly Total AI Cost', threshold: 2000, currentSpend: 1420, period: 'monthly', enabled: true },
    { id: 'ba-04', name: 'Per-Service Alert (RAG)', threshold: 25, currentSpend: 18.60, period: 'daily', enabled: false },
  ];
}

// ══ Phase 20: 운영 고도화 — Mock Data ═══════════════════════════════

export function getAnomalies(): Anomaly[] {
  return [
    { id: 'ano-01', metric: 'TTFT P95', service: 'rag-service', severity: 'critical', status: 'active', detectedAt: now - 1800_000, value: 4200, expected: 1800, deviation: 133, rootCause: 'GPU VRAM 92% — 모델 스왑 발생으로 첫 토큰 지연 급증', recommendation: 'GPU VRAM 확보: 불필요한 모델 언로드 또는 GPU 추가 할당' },
    { id: 'ano-02', metric: 'Error Rate', service: 'api-gateway', severity: 'warning', status: 'active', detectedAt: now - 3600_000, value: 2.8, expected: 0.5, deviation: 460, rootCause: 'Upstream rag-service 타임아웃 증가 → 502 게이트웨이 에러', recommendation: 'rag-service TTFT 이상 해결 시 자동 복구 예상' },
    { id: 'ano-03', metric: 'Token Cost/h', service: 'code-assistant', severity: 'warning', status: 'acknowledged', detectedAt: now - 7200_000, value: 28.5, expected: 15.0, deviation: 90, rootCause: '프롬프트 길이 증가 — 새 버전 배포 후 context window 확대', recommendation: '프롬프트 최적화 또는 GPT-4o-mini로 경량 쿼리 라우팅' },
    { id: 'ano-04', metric: 'CPU Usage', service: 'prod-gpu-01', severity: 'info', status: 'resolved', detectedAt: now - 86400_000, resolvedAt: now - 82800_000, value: 92, expected: 45, deviation: 104, rootCause: '배치 학습 작업 실행 중 일시적 CPU 스파이크', recommendation: '배치 작업 스케줄을 비피크 시간대로 이동' },
    { id: 'ano-05', metric: 'Cache Hit Rate', service: 'rag-service', severity: 'info', status: 'resolved', detectedAt: now - 172800_000, resolvedAt: now - 169200_000, value: 12, expected: 38, deviation: -68, rootCause: '캐시 서버 재시작 후 웜업 미완료', recommendation: '캐시 프리워밍 스크립트 배포 파이프라인에 추가' },
  ];
}

export function getDynamicThresholds(): DynamicThreshold[] {
  const points = 48;
  const baseTime = now - points * 1800_000;
  const timestamps = Array.from({ length: points }, (_, i) => baseTime + i * 1800_000);

  return [
    {
      metric: 'TTFT P95 (ms)',
      timestamps,
      values: timestamps.map((_, i) => i < 40 ? 1600 + Math.sin(i / 5) * 200 + Math.random() * 100 : 2800 + Math.random() * 1500),
      upperBand: timestamps.map(() => 2400),
      lowerBand: timestamps.map(() => 800),
      baseline: timestamps.map(() => 1600),
      anomalyRanges: [{ start: baseTime + 40 * 1800_000, end: now }],
    },
    {
      metric: 'Error Rate (%)',
      timestamps,
      values: timestamps.map((_, i) => i < 38 ? 0.3 + Math.random() * 0.3 : 1.5 + Math.random() * 2),
      upperBand: timestamps.map(() => 1.0),
      lowerBand: timestamps.map(() => 0),
      baseline: timestamps.map(() => 0.4),
      anomalyRanges: [{ start: baseTime + 38 * 1800_000, end: now }],
    },
  ];
}

export function getReportTemplates(): ReportTemplate[] {
  return [
    { id: 'tpl-01', name: 'Weekly Operations Report', description: 'SLO compliance, incident summary, resource utilization trends', type: 'weekly', sections: ['Executive Summary', 'SLO Compliance', 'Incident Timeline', 'Resource Trends', 'Recommendations'], estimatedPages: 12 },
    { id: 'tpl-02', name: 'Monthly SLO Report', description: 'Monthly SLO target achievement, error budget burn-down, trend analysis', type: 'monthly', sections: ['SLO Overview', 'Error Budget', 'Service Breakdown', 'Trend Analysis', 'Action Items'], estimatedPages: 18 },
    { id: 'tpl-03', name: 'AI Performance Diagnostic', description: 'LLM TTFT/TPS analysis, GPU utilization, cost efficiency, RAG pipeline health', type: 'diagnostic', sections: ['AI Service Health', 'LLM Performance', 'GPU Cluster', 'RAG Pipeline', 'Cost Analysis', 'Recommendations'], estimatedPages: 24 },
    { id: 'tpl-04', name: 'Incident Post-Mortem', description: 'Root cause analysis, timeline, impact assessment, corrective actions', type: 'custom', sections: ['Incident Summary', 'Timeline', 'Root Cause', 'Impact', 'Corrective Actions', 'Prevention Plan'], estimatedPages: 8 },
  ];
}

export function getGeneratedReports(): GeneratedReport[] {
  return [
    { id: 'rpt-01', templateId: 'tpl-01', templateName: 'Weekly Operations Report', generatedAt: now - 86400_000, period: '2026-03-10 ~ 2026-03-16', pages: 12, format: 'pdf', status: 'completed', sizeKB: 2840 },
    { id: 'rpt-02', templateId: 'tpl-03', templateName: 'AI Performance Diagnostic', generatedAt: now - 172800_000, period: '2026-03-01 ~ 2026-03-15', pages: 24, format: 'pdf', status: 'completed', sizeKB: 5120 },
    { id: 'rpt-03', templateId: 'tpl-02', templateName: 'Monthly SLO Report', generatedAt: now - 259200_000, period: '2026-02', pages: 18, format: 'pdf', status: 'completed', sizeKB: 3650 },
    { id: 'rpt-04', templateId: 'tpl-01', templateName: 'Weekly Operations Report', generatedAt: now - 600_000, period: '2026-03-17 ~ 2026-03-23', pages: 0, format: 'pdf', status: 'generating', sizeKB: 0 },
  ];
}

export function getSyntheticProbes(): SyntheticProbe[] {
  return [
    { id: 'sp-01', name: 'RAG QA Endpoint', type: 'llm', target: 'https://api.aitop.io/v1/rag/query', interval: '5m', status: 'healthy', uptime: 99.7, avgLatencyMs: 1450, lastCheck: now - 120_000, qualityScore: 0.87 },
    { id: 'sp-02', name: 'Code Assistant API', type: 'llm', target: 'https://api.aitop.io/v1/code/review', interval: '10m', status: 'degraded', uptime: 97.2, avgLatencyMs: 3200, lastCheck: now - 300_000, qualityScore: 0.91, lastError: 'Response time exceeded 3s threshold' },
    { id: 'sp-03', name: 'API Gateway Health', type: 'http', target: 'https://api.aitop.io/health', interval: '1m', status: 'healthy', uptime: 99.99, avgLatencyMs: 45, lastCheck: now - 30_000 },
    { id: 'sp-04', name: 'RAG Search Quality', type: 'rag', target: 'https://api.aitop.io/v1/rag/search', interval: '15m', status: 'healthy', uptime: 99.5, avgLatencyMs: 820, lastCheck: now - 600_000, qualityScore: 0.82 },
    { id: 'sp-05', name: 'Summarizer Endpoint', type: 'llm', target: 'https://api.aitop.io/v1/summarize', interval: '10m', status: 'down', uptime: 85.3, avgLatencyMs: 0, lastCheck: now - 180_000, lastError: 'Connection refused — service restarting' },
  ];
}

// ══ Phase 24: Method Profiling — Mock Data ══════════════════════════

export function getMethodProfile(): MethodProfile {
  return {
    traceId: 'trace-java-001',
    language: 'java',
    serviceName: 'api-gateway',
    totalMethods: 28,
    slowQueries: 2,
    totalDurationMs: 342,
    rootNode: {
      id: 'mp-01', name: 'handleRequest()', className: 'com.aitop.api.QueryController', durationMs: 342, selfTimeMs: 5, slow: false, children: [
        { id: 'mp-02', name: 'authenticate()', className: 'com.aitop.auth.JwtFilter', durationMs: 8, selfTimeMs: 8, slow: false, children: [] },
        { id: 'mp-03', name: 'processQuery()', className: 'com.aitop.service.QueryService', durationMs: 325, selfTimeMs: 12, slow: false, children: [
          { id: 'mp-04', name: 'findUser()', className: 'com.aitop.repository.UserRepository', durationMs: 15, selfTimeMs: 2, slow: false, children: [
            { id: 'mp-05', name: 'executeQuery()', className: 'org.springframework.jdbc.core.JdbcTemplate', durationMs: 13, selfTimeMs: 13, slow: false, children: [],
              sql: { query: 'SELECT id, name, role FROM users WHERE id = ?', bindings: [42], executionMs: 13, rowCount: 1, slow: false } },
          ]},
          { id: 'mp-06', name: 'searchDocuments()', className: 'com.aitop.service.RAGService', durationMs: 180, selfTimeMs: 8, slow: true, children: [
            { id: 'mp-07', name: 'generateEmbedding()', className: 'com.aitop.client.EmbeddingClient', durationMs: 45, selfTimeMs: 5, slow: false, children: [
              { id: 'mp-08', name: 'callLLM()', className: 'com.aitop.client.HttpLLMClient', durationMs: 40, selfTimeMs: 40, slow: false, children: [],
                http: { method: 'POST', url: 'http://embedding-service:8000/embed', statusCode: 200, durationMs: 40 } },
            ]},
            { id: 'mp-09', name: 'vectorSearch()', className: 'com.aitop.repository.VectorRepository', durationMs: 120, selfTimeMs: 5, slow: true, children: [
              { id: 'mp-10', name: 'executeQuery()', className: 'org.springframework.jdbc.core.JdbcTemplate', durationMs: 115, selfTimeMs: 115, slow: true, children: [],
                sql: { query: 'SELECT d.id, d.content, d.embedding <=> ? AS distance FROM documents d WHERE d.project_id = ? ORDER BY distance LIMIT ?', bindings: ['[0.12, 0.85, ...]', 'proj-ai-prod', 10], executionMs: 115, rowCount: 10, slow: true } },
            ]},
          ]},
          { id: 'mp-11', name: 'callLLMInference()', className: 'com.aitop.client.LLMClient', durationMs: 110, selfTimeMs: 5, slow: true, children: [
            { id: 'mp-12', name: 'httpPost()', className: 'com.aitop.client.HttpLLMClient', durationMs: 105, selfTimeMs: 105, slow: true, children: [],
              http: { method: 'POST', url: 'http://rag-service:8000/v1/chat/completions', statusCode: 200, durationMs: 105 } },
          ]},
        ]},
        { id: 'mp-13', name: 'saveAuditLog()', className: 'com.aitop.audit.AuditService', durationMs: 4, selfTimeMs: 1, slow: false, children: [
          { id: 'mp-14', name: 'insert()', className: 'com.aitop.repository.AuditRepository', durationMs: 3, selfTimeMs: 3, slow: false, children: [],
            sql: { query: 'INSERT INTO audit_log (user_id, action, resource, timestamp) VALUES (?, ?, ?, ?)', bindings: [42, 'QUERY', '/api/v1/rag/query', '2026-03-23T10:30:00Z'], executionMs: 3, rowCount: 1, slow: false } },
        ]},
      ],
    },
  };
}

// ══ Phase 25: Server Groups + SDK + Config — Mock Data ══════════════

export function getAgentConfig(): AgentConfig {
  return {
    agentId: 'a-01', version: 8, updatedAt: now - 3600_000, updatedBy: 'admin',
    sections: [
      { name: 'server', label: 'Server Connection', fields: [
        { key: 'server.url', label: 'Server URL', type: 'string', value: 'https://collect.aitop.io:8080', defaultValue: 'http://localhost:8080', reflectionLevel: 'restart', description: 'Collection Server URL' },
        { key: 'server.token', label: 'Project Token', type: 'string', value: 'proj-ai-prod-****', defaultValue: '', reflectionLevel: 'restart', description: 'Project authentication token' },
        { key: 'server.tls', label: 'TLS Enabled', type: 'boolean', value: true, defaultValue: false, reflectionLevel: 'restart', description: 'Enable mTLS connection' },
      ]},
      { name: 'agent', label: 'Agent Settings', fields: [
        { key: 'agent.mode', label: 'Mode', type: 'select', value: 'full', defaultValue: 'full', reflectionLevel: 'app', description: 'Agent operating mode', options: ['full', 'collect-only', 'collect-export', 'lite'] },
        { key: 'agent.tags', label: 'Tags', type: 'string', value: 'env:prod,team:ai,region:kr', defaultValue: '', reflectionLevel: 'hot', description: 'Agent tags (comma-separated)' },
        { key: 'agent.log_level', label: 'Log Level', type: 'select', value: 'info', defaultValue: 'info', reflectionLevel: 'hot', description: 'Logging verbosity', options: ['debug', 'info', 'warn', 'error'] },
      ]},
      { name: 'collectors', label: 'Collectors', fields: [
        { key: 'collectors.it_os', label: 'IT OS Collector', type: 'boolean', value: true, defaultValue: true, reflectionLevel: 'restart', description: 'OS metrics (CPU, Memory, Disk, Network)' },
        { key: 'collectors.it_web', label: 'IT Web Collector', type: 'boolean', value: true, defaultValue: false, reflectionLevel: 'restart', description: 'Web server (Nginx, Apache) metrics' },
        { key: 'collectors.ai_gpu', label: 'AI GPU Collector', type: 'boolean', value: true, defaultValue: false, reflectionLevel: 'restart', description: 'GPU utilization (NVIDIA DCGM)' },
        { key: 'collectors.ai_llm', label: 'AI LLM Collector', type: 'boolean', value: true, defaultValue: false, reflectionLevel: 'restart', description: 'LLM performance (TTFT, TPS)' },
        { key: 'collectors.interval', label: 'Collection Interval', type: 'string', value: '30s', defaultValue: '30s', reflectionLevel: 'hot', description: 'Data collection interval' },
      ]},
      { name: 'buffer', label: 'Buffer Settings', fields: [
        { key: 'buffer.max_size_mb', label: 'Max Buffer Size', type: 'number', value: 100, defaultValue: 50, reflectionLevel: 'restart', description: 'Maximum buffer size in MB' },
        { key: 'buffer.flush_interval', label: 'Flush Interval', type: 'string', value: '10s', defaultValue: '10s', reflectionLevel: 'hot', description: 'Buffer flush interval' },
      ]},
    ],
  };
}

export function getConfigHistory(): ConfigRevision[] {
  return [
    { version: 8, author: 'admin', timestamp: now - 3600_000, changes: [{ field: 'collectors.ai_llm', oldValue: 'false', newValue: 'true' }], message: 'Enable LLM collector for AI monitoring' },
    { version: 7, author: 'sre', timestamp: now - 86400_000, changes: [{ field: 'agent.tags', oldValue: 'env:prod,team:ai', newValue: 'env:prod,team:ai,region:kr' }], message: 'Add region tag' },
    { version: 6, author: 'admin', timestamp: now - 172800_000, changes: [{ field: 'buffer.max_size_mb', oldValue: '50', newValue: '100' }, { field: 'collectors.interval', oldValue: '60s', newValue: '30s' }], message: 'Increase buffer and reduce interval for better resolution' },
    { version: 5, author: 'admin', timestamp: now - 604800_000, changes: [{ field: 'server.tls', oldValue: 'false', newValue: 'true' }], message: 'Enable mTLS for production' },
  ];
}

export function getSDKDetections(): SDKDetection[] {
  return [
    { id: 'sdk-01', agentId: 'a-01', hostname: 'prod-api-01', language: 'java', framework: 'Spring Boot', frameworkVersion: '3.2.4', detectedAt: now - 86400_000, autoInstrumented: true },
    { id: 'sdk-02', agentId: 'a-01', hostname: 'prod-api-01', language: 'python', framework: 'FastAPI', frameworkVersion: '0.115.0', detectedAt: now - 86400_000, autoInstrumented: true },
    { id: 'sdk-03', agentId: 'a-02', hostname: 'prod-api-02', language: 'java', framework: 'Spring Boot', frameworkVersion: '3.2.4', detectedAt: now - 172800_000, autoInstrumented: true },
    { id: 'sdk-04', agentId: 'a-03', hostname: 'prod-gpu-01', language: 'python', framework: 'vLLM', frameworkVersion: '0.4.0', detectedAt: now - 259200_000, autoInstrumented: true },
    { id: 'sdk-05', agentId: 'a-05', hostname: 'prod-db-01', language: 'dotnet', framework: 'ASP.NET Core', frameworkVersion: '8.0', detectedAt: now - 3600_000, autoInstrumented: false },
  ];
}

export function getGroupDashboard(groupId: string): GroupDashboard {
  const groups: Record<string, GroupDashboard> = {
    'grp-gpu': { groupId: 'grp-gpu', groupName: 'GPU Servers', agentCount: 2, healthyCount: 2, avgCpu: 68, avgMemory: 72, agents: [
      { id: 'a-03', hostname: 'prod-gpu-01', status: 'healthy', version: '1.2.0', cpu: 72, memory: 85, lastHeartbeat: now - 30_000 },
      { id: 'a-04', hostname: 'prod-gpu-02', status: 'healthy', version: '1.2.0', cpu: 64, memory: 59, lastHeartbeat: now - 25_000 },
    ]},
    'grp-api': { groupId: 'grp-api', groupName: 'API Servers', agentCount: 2, healthyCount: 1, avgCpu: 45, avgMemory: 62, agents: [
      { id: 'a-01', hostname: 'prod-api-01', status: 'healthy', version: '1.2.0', cpu: 38, memory: 55, lastHeartbeat: now - 15_000 },
      { id: 'a-02', hostname: 'prod-api-02', status: 'degraded', version: '1.1.9', cpu: 52, memory: 69, lastHeartbeat: now - 120_000 },
    ]},
    'grp-db': { groupId: 'grp-db', groupName: 'Database Servers', agentCount: 2, healthyCount: 2, avgCpu: 35, avgMemory: 70, agents: [
      { id: 'a-05', hostname: 'prod-db-01', status: 'healthy', version: '1.2.0', cpu: 30, memory: 65, lastHeartbeat: now - 20_000 },
      { id: 'a-06', hostname: 'prod-db-02', status: 'healthy', version: '1.2.0', cpu: 40, memory: 75, lastHeartbeat: now - 35_000 },
    ]},
  };
  return groups[groupId] || { groupId, groupName: 'Unknown', agentCount: 0, healthyCount: 0, avgCpu: 0, avgMemory: 0, agents: [] };
}

// ══ Phase 26: Middleware Runtime + Redis/Cache + MQ — Mock Data ═════

export function getMiddlewareRuntimes(): MiddlewareRuntime[] {
  return [
    { hostId: 'h-api-01', hostname: 'prod-api-01', language: 'java',
      jdkVersion: '21.0.2',
      threadPools: [
        { name: 'tomcat-exec', activeThreads: 45, maxThreads: 200, queuedTasks: 3, completedTasks: 128400, utilization: 0.225 },
        { name: 'async-pool', activeThreads: 8, maxThreads: 50, queuedTasks: 0, completedTasks: 45200, utilization: 0.16 },
      ],
      connectionPools: [
        { name: 'HikariCP-primary', activeConnections: 12, idleConnections: 8, maxConnections: 20, waitCount: 0, utilization: 0.6, leakSuspected: false },
        { name: 'HikariCP-readonly', activeConnections: 5, idleConnections: 10, maxConnections: 15, waitCount: 0, utilization: 0.33, leakSuspected: false },
      ],
      virtualThreads: {
        activeCount: 1284, waitingCount: 342, mountedCount: 8, createdPerMin: 4500,
        submitFailedRate: 1.2, pinnedCount: 7, pinnedP99Ms: 145.3,
        carrierPool: { parallelism: 16, activeCount: 12, queuedTasks: 24, utilization: 0.75 },
        submitFailedHistory: [0,0,1,0,0,2,1,0,0,1,0,0,1,2,0,0,1,0,0,0,1,0,2,1,0,0,1,0,0,1],
        activeHistory: [800,820,850,890,920,870,910,960,1100,1200,1284,1310,1280,1250,1230,1200,1180,1220,1260,1284,1300,1320,1284,1260,1240,1280,1284,1300,1284,1284],
        collectedAt: new Date().toISOString(),
      },
      vtAlerts: [
        { alertId: 'vt-alert-000001', severity: 'warning' as const, rule: 'vt.pinned.rate',
          message: 'Virtual Thread pinning rate too high: 7 events/min (threshold: 10)',
          value: 7, threshold: 10, firedAt: new Date(Date.now() - 5*60000).toISOString(), acked: false },
      ],
      vtPinnedStacks: [
        { id: 'pin-001', durationMs: 245.8, topMethod: 'com.example.LegacySync.doWork',
          stackTrace: 'java.lang.Object.wait(Object.java)\n  com.example.LegacySync.doWork(LegacySync.java:42)\n  java.lang.Thread.run(Thread.java:833)',
          capturedAt: new Date(Date.now() - 3*60000).toISOString() },
        { id: 'pin-002', durationMs: 189.2, topMethod: 'com.example.FileService.readSync',
          stackTrace: 'sun.nio.fs.UnixNativeDispatcher.read()\n  com.example.FileService.readSync(FileService.java:88)\n  java.lang.Thread.run(Thread.java:833)',
          capturedAt: new Date(Date.now() - 2*60000).toISOString() },
        { id: 'pin-003', durationMs: 124.5, topMethod: 'com.example.ReflectionUtil.call',
          stackTrace: 'jdk.internal.reflect.NativeMethodAccessorImpl.invoke()\n  com.example.ReflectionUtil.call(ReflectionUtil.java:15)\n  java.lang.Thread.run(Thread.java:833)',
          capturedAt: new Date(Date.now() - 60000).toISOString() },
      ],
    },
    { hostId: 'h-api-02', hostname: 'prod-api-02', language: 'nodejs',
      eventLoop: { lagMs: 2.4, lagP99Ms: 12.8, activeHandles: 42, activeRequests: 8 },
      connectionPools: [
        { name: 'pg-pool', activeConnections: 6, idleConnections: 4, maxConnections: 10, waitCount: 1, utilization: 0.6, leakSuspected: false },
      ],
    },
    { hostId: 'h-gpu-01', hostname: 'prod-gpu-01', language: 'python',
      workers: { active: 4, max: 8, idle: 4 },
      connectionPools: [
        { name: 'SQLAlchemy-pool', activeConnections: 3, idleConnections: 2, maxConnections: 5, waitCount: 0, utilization: 0.6, leakSuspected: false },
      ],
    },
    { hostId: 'h-api-03', hostname: 'prod-api-03', language: 'go',
      goroutines: 1284,
      connectionPools: [
        { name: 'sql.DB', activeConnections: 8, idleConnections: 12, maxConnections: 25, waitCount: 0, utilization: 0.32, leakSuspected: false },
      ],
    },
    { hostId: 'h-api-04', hostname: 'prod-api-04', language: 'dotnet',
      threadPools: [
        { name: 'CLR-ThreadPool', activeThreads: 24, maxThreads: 100, queuedTasks: 0, completedTasks: 89200, utilization: 0.24 },
      ],
      connectionPools: [
        { name: 'EF-Core-Pool', activeConnections: 7, idleConnections: 3, maxConnections: 10, waitCount: 0, utilization: 0.7, leakSuspected: false },
      ],
    },
  ];
}

export function getRedisMetrics(): RedisMetrics[] {
  return [
    { id: 'redis-01', name: 'prod-redis-main', engine: 'redis', version: '7.2.4', host: 'prod-redis-01', port: 6379, status: 'healthy', memoryUsedMB: 1840, memoryMaxMB: 4096, memoryPercent: 44.9, hitRate: 94.2, evictions: 0, connectedClients: 42, opsPerSec: 12500, slowlogCount: 3, role: 'master', uptimeHours: 720 },
    { id: 'redis-02', name: 'prod-redis-replica', engine: 'redis', version: '7.2.4', host: 'prod-redis-02', port: 6379, status: 'healthy', memoryUsedMB: 1820, memoryMaxMB: 4096, memoryPercent: 44.4, hitRate: 94.0, evictions: 0, connectedClients: 18, opsPerSec: 8200, slowlogCount: 1, replicationLag: 0.2, role: 'replica', uptimeHours: 720 },
    { id: 'redis-03', name: 'session-cache', engine: 'keydb', version: '6.3.4', host: 'prod-cache-01', port: 6380, status: 'warning', memoryUsedMB: 3200, memoryMaxMB: 4096, memoryPercent: 78.1, hitRate: 87.5, evictions: 245, connectedClients: 65, opsPerSec: 18400, slowlogCount: 12, role: 'standalone', uptimeHours: 168 },
  ];
}

export function getMessageQueues(): MessageQueueMetrics[] {
  return [
    { id: 'mq-01', name: 'prod-kafka', type: 'kafka', status: 'healthy', brokers: 3, topics: 24, totalMessages: 4_500_000, messagesPerSec: 8500, consumerGroups: 12, consumerLag: 150, partitions: 72, replicationFactor: 3 },
    { id: 'mq-02', name: 'event-rabbitmq', type: 'rabbitmq', status: 'warning', brokers: 2, topics: 8, totalMessages: 125_000, messagesPerSec: 420, consumerGroups: 5, consumerLag: 3200 },
  ];
}

// ── Redis Cluster (Phase 26-5-6) ────────────────────────────────────────

export function getRedisClusterMetrics(): import('@/types/monitoring').RedisClusterMetrics[] {
  return [
    {
      engine: 'redis', host: 'prod-redis-cluster-01', port: 6379,
      clusterEnabled: true, clusterState: 'ok',
      clusterSize: 6, slotsAssigned: 16384, slotsOK: 16384,
      slotsPfail: 0, slotsFail: 0,
      knownNodes: 6, connectedSlaves: 3,
    },
    {
      engine: 'redis', host: 'prod-redis-cluster-02', port: 6379,
      clusterEnabled: true, clusterState: 'fail',
      clusterSize: 3, slotsAssigned: 16384, slotsOK: 14892,
      slotsPfail: 1024, slotsFail: 468,
      knownNodes: 3, connectedSlaves: 1,
      migrationStatus: 'migrating',
    },
  ];
}

// ── Cache Alert Rules (Phase 26-5-7) ─────────────────────────────────────

export function getCacheAlertRules(): import('@/types/monitoring').CacheAlertRule[] {
  return [
    { name: 'cache_low_hit_rate', description: 'Cache hit rate < 80% — possible cache churn or cold start', condition: 'hit_rate < 0.80', threshold: 0.80, severity: 'warning', actions: ['slack'] },
    { name: 'cache_critical_hit_rate', description: 'Cache hit rate < 60% — severe cache inefficiency', condition: 'hit_rate < 0.60', threshold: 0.60, severity: 'critical', actions: ['pagerduty', 'slack'] },
    { name: 'cache_high_memory', description: 'Cache memory usage > 80% of maxmemory', condition: 'used_memory/maxmemory > 0.80', threshold: 0.80, severity: 'warning', actions: ['slack'] },
    { name: 'cache_critical_memory', description: 'Cache memory usage > 95% of maxmemory — eviction risk', condition: 'used_memory/maxmemory > 0.95', threshold: 0.95, severity: 'critical', actions: ['pagerduty'] },
    { name: 'cache_replication_lag', description: 'Replication lag > 1MB — replica falling behind master', condition: 'replication_lag_bytes > 1048576', threshold: 1048576, severity: 'warning', actions: ['pagerduty', 'slack'] },
    { name: 'cache_evictions_spike', description: 'Evicted keys > 1000 — memory pressure causing data loss', condition: 'evicted_keys > 1000', threshold: 1000, severity: 'critical', actions: ['pagerduty'] },
    { name: 'cache_cluster_degraded', description: 'Redis Cluster has failed or pfail slots', condition: 'cluster_slots_fail > 0 OR cluster_slots_pfail > 0', threshold: 0, severity: 'critical', actions: ['pagerduty'] },
  ];
}

export function getCacheAlertEvents(): import('@/types/monitoring').CacheAlertEvent[] {
  const now = new Date().toISOString();
  return [
    { alertId: 'cache_prod-cache-01:6380_cache_high_memory', ruleName: 'cache_high_memory', instanceId: 'prod-cache-01:6380', host: 'prod-cache-01', port: 6380, engine: 'keydb', severity: 'warning', value: 0.781, threshold: 0.80, message: '[warning] keydb (prod-cache-01:6380) — Cache memory usage > 80% of maxmemory', triggeredAt: now, actions: ['slack'] },
    { alertId: 'cache_prod-cache-01:6380_cache_evictions_spike', ruleName: 'cache_evictions_spike', instanceId: 'prod-cache-01:6380', host: 'prod-cache-01', port: 6380, engine: 'keydb', severity: 'critical', value: 245, threshold: 1000, message: '[warning] keydb (prod-cache-01:6380) — Evicted keys present', triggeredAt: now, actions: ['pagerduty'] },
  ];
}

// ── Connection Pool Alerts (Phase 26-2-2) ────────────────────────────────

export function getConnPoolAlertEvents(): import('@/types/monitoring').ConnPoolAlertEvent[] {
  const now = new Date().toISOString();
  return [
    { alertId: 'conn_pool_HikariCP-primary_conn_pool_high_utilization', poolName: 'HikariCP-primary', vendor: 'hikaricp', severity: 'warning', condition: 'active/max >= 0.90', value: 0.94, threshold: 0.90, message: '[warning] HikariCP-primary: Connection pool utilization >= 90%', triggeredAt: now, action: 'pagerduty,slack' },
    { alertId: 'conn_pool_EF-Core-Pool_conn_pool_pending_waits', poolName: 'EF-Core-Pool', vendor: 'ef_core', severity: 'warning', condition: 'wait_count > 0', value: 3, threshold: 0, message: '[warning] EF-Core-Pool: Connection pool has pending wait requests', triggeredAt: now, action: 'pagerduty' },
  ];
}

// ── Profiling (Phase 21-1) ──────────────────────────────────────────────

export function getProfilingProfiles(): import('@/types/monitoring').ProfileMetadata[] {
  const now = Date.now();
  return [
    { profile_id: 'prof-001', agent_id: 'agent-01', service_name: 'api-gateway', language: 'go', profile_type: 'cpu', format: 'pprof', duration_sec: 30, sample_count: 15420, size_bytes: 245760, started_at: new Date(now - 7200000).toISOString() },
    { profile_id: 'prof-002', agent_id: 'agent-01', service_name: 'api-gateway', language: 'go', profile_type: 'memory', format: 'pprof', duration_sec: 0, sample_count: 8230, size_bytes: 189440, started_at: new Date(now - 7200000).toISOString() },
    { profile_id: 'prof-003', agent_id: 'agent-02', service_name: 'rag-service', language: 'python', profile_type: 'cpu', format: 'collapsed', duration_sec: 30, sample_count: 22100, size_bytes: 312000, started_at: new Date(now - 3600000).toISOString() },
    { profile_id: 'prof-004', agent_id: 'agent-02', service_name: 'rag-service', language: 'python', profile_type: 'memory', format: 'collapsed', duration_sec: 0, sample_count: 5600, size_bytes: 98000, started_at: new Date(now - 3600000).toISOString() },
    { profile_id: 'prof-005', agent_id: 'agent-03', service_name: 'payment-api', language: 'java', profile_type: 'cpu', format: 'jfr', duration_sec: 60, sample_count: 45000, size_bytes: 524288, started_at: new Date(now - 1800000).toISOString() },
    { profile_id: 'prof-006', agent_id: 'agent-03', service_name: 'payment-api', language: 'java', profile_type: 'memory', format: 'jfr', duration_sec: 60, sample_count: 18000, size_bytes: 312000, started_at: new Date(now - 1800000).toISOString() },
    { profile_id: 'prof-007', agent_id: 'agent-04', service_name: 'auth-service', language: 'go', profile_type: 'goroutine', format: 'pprof', duration_sec: 0, sample_count: 342, size_bytes: 45000, started_at: new Date(now - 900000).toISOString() },
    { profile_id: 'prof-008', agent_id: 'agent-05', service_name: 'ml-inference', language: 'python', profile_type: 'cpu', format: 'collapsed', duration_sec: 30, sample_count: 31000, size_bytes: 420000, started_at: new Date(now - 600000).toISOString() },
    { profile_id: 'prof-009', agent_id: 'agent-03', service_name: 'order-service', language: 'java', profile_type: 'thread', format: 'jfr', duration_sec: 30, sample_count: 12500, size_bytes: 198000, started_at: new Date(now - 300000).toISOString() },
    { profile_id: 'prof-010', agent_id: 'agent-01', service_name: 'api-gateway', language: 'go', profile_type: 'cpu', format: 'pprof', duration_sec: 30, sample_count: 16200, size_bytes: 256000, trace_id: 'abc123def456', started_at: new Date(now - 180000).toISOString() },
  ];
}

export function getFlameGraphData(profileId: string): import('@/types/monitoring').FlameGraphData {
  return {
    profileId,
    profileType: 'cpu',
    language: 'go',
    serviceName: 'api-gateway',
    totalSamples: 15420,
    durationSec: 30,
    root: {
      name: 'root', fullName: 'root', value: 15420, selfValue: 0,
      children: [
        { name: 'main.main', fullName: 'main.main', value: 12000, selfValue: 200, children: [
          { name: 'net/http.(*Server).Serve', fullName: 'net/http.(*Server).Serve', value: 9800, selfValue: 150, children: [
            { name: 'net/http.(*conn).serve', fullName: 'net/http.(*conn).serve', value: 9000, selfValue: 800, children: [
              { name: 'main.handleRequest', fullName: 'main.handleRequest', value: 5200, selfValue: 1200, children: [
                { name: 'main.processPayload', fullName: 'main.processPayload', value: 2500, selfValue: 1500, children: [
                  { name: 'encoding/json.Unmarshal', fullName: 'encoding/json.Unmarshal', value: 1000, selfValue: 1000, children: [] },
                ] },
                { name: 'main.validateAuth', fullName: 'main.validateAuth', value: 1500, selfValue: 800, children: [
                  { name: 'crypto/hmac.Equal', fullName: 'crypto/hmac.Equal', value: 700, selfValue: 700, children: [] },
                ] },
              ] },
              { name: 'encoding/json.Marshal', fullName: 'encoding/json.Marshal', value: 2000, selfValue: 2000, children: [] },
              { name: 'database/sql.(*DB).Query', fullName: 'database/sql.(*DB).Query', value: 1000, selfValue: 600, children: [
                { name: 'net.(*conn).Read', fullName: 'net.(*conn).Read', value: 400, selfValue: 400, children: [] },
              ] },
            ] },
          ] },
          { name: 'main.backgroundSync', fullName: 'main.backgroundSync', value: 1800, selfValue: 300, children: [
            { name: 'net/http.(*Client).Do', fullName: 'net/http.(*Client).Do', value: 1500, selfValue: 1500, children: [] },
          ] },
        ] },
        { name: 'runtime.gcBgMarkWorker', fullName: 'runtime.gcBgMarkWorker', value: 2420, selfValue: 2420, children: [] },
        { name: 'runtime.mcall', fullName: 'runtime.mcall', value: 1000, selfValue: 1000, children: [] },
      ],
    },
  };
}

export function getFlameGraphDiffData(): import('@/types/monitoring').FlameGraphDiff {
  return {
    base_profile_id: 'prof-001',
    target_profile_id: 'prof-010',
    root: {
      name: 'root', fullName: 'root', baseValue: 15420, targetValue: 16200, delta: 780, children: [
        { name: 'main.main', fullName: 'main.main', baseValue: 12000, targetValue: 13200, delta: 1200, children: [
          { name: 'net/http.(*Server).Serve', fullName: 'net/http.(*Server).Serve', baseValue: 9800, targetValue: 11000, delta: 1200, children: [
            { name: 'main.handleRequest', fullName: 'main.handleRequest', baseValue: 5200, targetValue: 6800, delta: 1600, children: [] },
            { name: 'encoding/json.Marshal', fullName: 'encoding/json.Marshal', baseValue: 2000, targetValue: 1800, delta: -200, children: [] },
          ] },
        ] },
        { name: 'runtime.gcBgMarkWorker', fullName: 'runtime.gcBgMarkWorker', baseValue: 2420, targetValue: 2000, delta: -420, children: [] },
        { name: 'runtime.mcall', fullName: 'runtime.mcall', baseValue: 1000, targetValue: 1000, delta: 0, children: [] },
      ],
    },
  };
}

// ── SSO Demo Data (Phase 21-3) ────────────────────────────────────────────

export function getSSOProviders(): { id: string; name: string; protocol: string; enabled: boolean; buttonLabel?: string }[] {
  return [
    { id: 'sso-okta', name: 'Okta', protocol: 'oidc', enabled: true, buttonLabel: 'Sign in with Okta' },
    { id: 'sso-azure', name: 'Azure AD', protocol: 'oidc', enabled: true, buttonLabel: 'Sign in with Microsoft' },
    { id: 'sso-google', name: 'Google Workspace', protocol: 'oidc', enabled: false, buttonLabel: 'Sign in with Google' },
  ];
}

// ── AI Copilot (Phase 22-1) ─────────────────────────────────────────────

export function getCopilotSuggestions(): import('@/types/monitoring').CopilotSuggestion[] {
  return [
    { id: 'cs-1', text: 'TTFT가 높은 서비스는?', category: 'performance' },
    { id: 'cs-2', text: 'GPU 사용률 추이를 보여줘', category: 'gpu' },
    { id: 'cs-3', text: '에러율이 가장 높은 엔드포인트', category: 'reliability' },
    { id: 'cs-4', text: '지난 1시간 비용 분석', category: 'cost' },
    { id: 'cs-5', text: 'RAG 파이프라인 지연 원인', category: 'performance' },
    { id: 'cs-6', text: '현재 활성 알림 요약', category: 'reliability' },
    { id: 'cs-7', text: '벡터DB 검색 지연 추이', category: 'performance' },
    { id: 'cs-8', text: '가드레일 차단률 분석', category: 'reliability' },
  ];
}

// ── Topology Auto-Discovery (Phase 22-2) ────────────────────────────────

export function getDiscoveredTopology(): import('@/types/monitoring').DiscoveredTopology {
  const now = Date.now();
  return {
    nodes: [
      { id: 'client', name: 'client', layer: 'ui', status: 'healthy', rpm: 1200, errorRate: 0.1, p95: 45, framework: 'React' },
      { id: 'api-gateway', name: 'api-gateway', layer: 'ui', status: 'healthy', rpm: 3200, errorRate: 0.3, p95: 120, framework: 'Go/net-http' },
      { id: 'auth-service', name: 'auth-service', layer: 'ui', status: 'healthy', rpm: 800, errorRate: 0.05, p95: 25, framework: 'Go/gin' },
      { id: 'rag-service', name: 'rag-service', layer: 'agent', status: 'warning', rpm: 450, errorRate: 1.2, p95: 1800, framework: 'Python/FastAPI' },
      { id: 'embedding-svc', name: 'embedding-svc', layer: 'agent', status: 'healthy', rpm: 600, errorRate: 0.1, p95: 85, framework: 'Python/FastAPI' },
      { id: 'guardrail', name: 'guardrail', layer: 'agent', status: 'healthy', rpm: 450, errorRate: 0.0, p95: 30, framework: 'Python/NeMo' },
      { id: 'vllm', name: 'vLLM Inference', layer: 'llm', status: 'healthy', rpm: 200, errorRate: 0.5, p95: 1200, framework: 'vLLM' },
      { id: 'qdrant', name: 'Qdrant', layer: 'data', status: 'healthy', rpm: 600, errorRate: 0.0, p95: 12, framework: 'Qdrant' },
      { id: 'postgres', name: 'PostgreSQL', layer: 'data', status: 'healthy', rpm: 1500, errorRate: 0.0, p95: 5, framework: 'PostgreSQL' },
      { id: 'redis', name: 'Redis', layer: 'data', status: 'healthy', rpm: 4000, errorRate: 0.0, p95: 1, framework: 'Redis 7' },
    ],
    edges: [
      { source: 'client', target: 'api-gateway', rpm: 1200, errorRate: 0.1, p95: 45, protocol: 'http', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'api-gateway', target: 'auth-service', rpm: 800, errorRate: 0.05, p95: 25, protocol: 'grpc', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'api-gateway', target: 'rag-service', rpm: 450, errorRate: 1.2, p95: 1800, protocol: 'http', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'rag-service', target: 'embedding-svc', rpm: 600, errorRate: 0.1, p95: 85, protocol: 'grpc', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'rag-service', target: 'guardrail', rpm: 450, errorRate: 0.0, p95: 30, protocol: 'grpc', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'rag-service', target: 'vllm', rpm: 200, errorRate: 0.5, p95: 1200, protocol: 'http', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'rag-service', target: 'qdrant', rpm: 600, errorRate: 0.0, p95: 12, protocol: 'http', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'api-gateway', target: 'postgres', rpm: 1500, errorRate: 0.0, p95: 5, protocol: 'sql', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      { source: 'auth-service', target: 'redis', rpm: 4000, errorRate: 0.0, p95: 1, protocol: 'redis', firstSeen: now - 86400000 * 30, isNew: false, isRemoved: false },
      // New: recently discovered
      { source: 'rag-service', target: 'redis', rpm: 120, errorRate: 0.0, p95: 2, protocol: 'redis', firstSeen: now - 3600000, isNew: true, isRemoved: false },
      { source: 'api-gateway', target: 'embedding-svc', rpm: 50, errorRate: 0.0, p95: 90, protocol: 'grpc', firstSeen: now - 7200000, isNew: true, isRemoved: false },
      // Removed: no longer active
      { source: 'guardrail', target: 'postgres', rpm: 0, errorRate: 0, p95: 0, protocol: 'sql', firstSeen: now - 86400000 * 7, isNew: false, isRemoved: true },
    ],
    lastScanAt: now,
    totalConnections: 11,
  };
}

export function getTopologyChanges(): import('@/types/monitoring').TopologyChange[] {
  const now = Date.now();
  return [
    { id: 'tc-1', timestamp: now - 3600000, type: 'connection_added', sourceService: 'rag-service', targetService: 'redis', protocol: 'redis', description: 'New Redis cache connection detected from rag-service' },
    { id: 'tc-2', timestamp: now - 7200000, type: 'connection_added', sourceService: 'api-gateway', targetService: 'embedding-svc', protocol: 'grpc', description: 'Direct gRPC connection from api-gateway to embedding-svc' },
    { id: 'tc-3', timestamp: now - 86400000, type: 'connection_removed', sourceService: 'guardrail', targetService: 'postgres', protocol: 'sql', description: 'SQL connection from guardrail to PostgreSQL no longer active' },
    { id: 'tc-4', timestamp: now - 86400000 * 2, type: 'service_added', sourceService: 'embedding-svc', description: 'New service embedding-svc discovered on port 8090' },
    { id: 'tc-5', timestamp: now - 86400000 * 3, type: 'connection_added', sourceService: 'rag-service', targetService: 'guardrail', protocol: 'grpc', description: 'gRPC connection established between rag-service and guardrail' },
  ];
}

// ── Fine-tuning Monitoring (Phase 22-3) ─────────────────────────────────

export function getTrainingJobs(): import('@/types/monitoring').TrainingJob[] {
  const now = Date.now();
  return [
    { id: 'train-001', name: 'chatbot-finetune-v2', model: 'chatbot-v2', baseModel: 'GPT-4-Turbo', dataset: 'customer-support-50k', status: 'running', startedAt: now - 14400000, currentEpoch: 7, totalEpochs: 10, currentStep: 3500, totalSteps: 5000, learningRate: 0.0001, batchSize: 32, gpuIds: ['gpu-01','gpu-02'], trainLoss: 0.42, valLoss: 0.48, trainAccuracy: 88.5, valAccuracy: 86.2, gpuUtilization: 94, gpuMemoryUsed: 72, tokensPerSecond: 2800, estimatedTimeRemaining: 5400 },
    { id: 'train-002', name: 'rag-embedding-retrain', model: 'embed-v3', baseModel: 'text-embedding-3-large', dataset: 'docs-120k', status: 'completed', startedAt: now - 86400000, completedAt: now - 72000000, currentEpoch: 5, totalEpochs: 5, currentStep: 12000, totalSteps: 12000, learningRate: 0.00005, batchSize: 64, gpuIds: ['gpu-03'], trainLoss: 0.18, valLoss: 0.22, trainAccuracy: 94.1, valAccuracy: 92.8, gpuUtilization: 89, gpuMemoryUsed: 58, tokensPerSecond: 4200 },
    { id: 'train-003', name: 'guardrail-classifier-v3', model: 'guard-v3', baseModel: 'DeBERTa-v3', dataset: 'safety-labels-30k', status: 'queued', startedAt: 0, currentEpoch: 0, totalEpochs: 8, currentStep: 0, totalSteps: 6000, learningRate: 0.0002, batchSize: 16, gpuIds: [], trainLoss: 0, valLoss: 0, trainAccuracy: 0, valAccuracy: 0, gpuUtilization: 0, gpuMemoryUsed: 0, tokensPerSecond: 0 },
    { id: 'train-004', name: 'code-assistant-lora', model: 'code-lora-v1', baseModel: 'CodeLlama-34B', dataset: 'code-review-80k', status: 'failed', startedAt: now - 172800000, currentEpoch: 3, totalEpochs: 8, currentStep: 1800, totalSteps: 4800, learningRate: 0.0003, batchSize: 8, gpuIds: ['gpu-01','gpu-02','gpu-03','gpu-04'], trainLoss: 1.85, valLoss: 2.41, trainAccuracy: 45.2, valAccuracy: 38.9, gpuUtilization: 0, gpuMemoryUsed: 0, tokensPerSecond: 0 },
  ];
}

export function getTrainingLossCurve(jobId: string): [number, number][] {
  const points: [number, number][] = [];
  const steps = jobId === 'train-002' ? 12000 : jobId === 'train-004' ? 1800 : 3500;
  for (let i = 0; i <= steps; i += Math.max(1, Math.floor(steps / 60))) {
    const t = i / steps;
    const loss = 2.5 * Math.exp(-3 * t) + 0.2 + (Math.random() - 0.5) * 0.1;
    points.push([i, Math.max(0.1, loss)]);
  }
  return points;
}

export function getTrainingAccuracyCurve(jobId: string): [number, number][] {
  const points: [number, number][] = [];
  const steps = jobId === 'train-002' ? 12000 : jobId === 'train-004' ? 1800 : 3500;
  for (let i = 0; i <= steps; i += Math.max(1, Math.floor(steps / 60))) {
    const t = i / steps;
    const acc = 95 / (1 + Math.exp(-8 * (t - 0.3))) + (Math.random() - 0.5) * 2;
    points.push([i, Math.min(99, Math.max(0, acc))]);
  }
  return points;
}

export function getTrainingCheckpoints(jobId: string): import('@/types/monitoring').TrainingCheckpoint[] {
  const now = Date.now();
  const epochs = jobId === 'train-002' ? 5 : jobId === 'train-004' ? 3 : 7;
  return Array.from({ length: epochs }, (_, i) => ({
    id: `cp-${jobId}-${i + 1}`,
    jobId,
    epoch: i + 1,
    step: (i + 1) * 500,
    trainLoss: 2.5 * Math.exp(-3 * ((i + 1) / 10)) + 0.2,
    valLoss: 2.5 * Math.exp(-2.8 * ((i + 1) / 10)) + 0.25,
    valAccuracy: 95 / (1 + Math.exp(-8 * ((i + 1) / 10 - 0.3))),
    sizeBytes: 2_500_000_000 + i * 100_000_000,
    createdAt: now - (epochs - i) * 1800000,
    deployed: i === epochs - 1 && jobId === 'train-002',
  }));
}

export function getTrainVsInference(): import('@/types/monitoring').TrainVsInference[] {
  return [
    { metric: 'Latency P95', trainValue: 0, inferenceValue: 1200, unit: 'ms', delta: 0 },
    { metric: 'Throughput', trainValue: 2800, inferenceValue: 42, unit: 'tok/s', delta: -98.5 },
    { metric: 'GPU Utilization', trainValue: 94, inferenceValue: 72, unit: '%', delta: -23.4 },
    { metric: 'Memory Usage', trainValue: 76, inferenceValue: 58, unit: 'GB', delta: -23.7 },
    { metric: 'Accuracy', trainValue: 91.5, inferenceValue: 89.2, unit: '%', delta: -2.5 },
    { metric: 'Batch Size', trainValue: 32, inferenceValue: 1, unit: '', delta: -96.9 },
  ];
}

// ── Multi-Cloud (Phase 23-1) ────────────────────────────────────────────

export function getCloudCostSummaries(): import('@/types/monitoring').CloudCostSummary[] {
  return [
    { provider: 'aws', totalCost: 12450, computeCost: 8200, storageCost: 2800, networkCost: 1450, trend: 3.2 },
    { provider: 'gcp', totalCost: 8320, computeCost: 5100, storageCost: 1900, networkCost: 1320, trend: -1.5 },
    { provider: 'azure', totalCost: 5680, computeCost: 3400, storageCost: 1200, networkCost: 1080, trend: 8.4 },
  ];
}

export function getCloudResources(): import('@/types/monitoring').CloudResource[] {
  return [
    { id: 'cr-01', provider: 'aws', type: 'EC2 (g5.2xlarge)', name: 'gpu-inference-01', region: 'us-east-1', status: 'running', monthlyCost: 2400, cpuUsage: 72, memoryUsage: 85 },
    { id: 'cr-02', provider: 'aws', type: 'EC2 (m6i.xlarge)', name: 'api-gateway-01', region: 'us-east-1', status: 'running', monthlyCost: 280, cpuUsage: 45, memoryUsage: 62 },
    { id: 'cr-03', provider: 'aws', type: 'RDS (r6g.large)', name: 'prod-postgres', region: 'us-east-1', status: 'running', monthlyCost: 520, cpuUsage: 38, memoryUsage: 71 },
    { id: 'cr-04', provider: 'gcp', type: 'GCE (a2-highgpu-1g)', name: 'training-node-01', region: 'us-central1', status: 'running', monthlyCost: 3200, cpuUsage: 94, memoryUsage: 88 },
    { id: 'cr-05', provider: 'gcp', type: 'GKE Cluster', name: 'ml-pipeline-cluster', region: 'us-central1', status: 'running', monthlyCost: 1800, cpuUsage: 65, memoryUsage: 58 },
    { id: 'cr-06', provider: 'azure', type: 'VM (NC6s_v3)', name: 'finetune-worker-01', region: 'eastus', status: 'running', monthlyCost: 1900, cpuUsage: 88, memoryUsage: 76 },
    { id: 'cr-07', provider: 'azure', type: 'AKS Cluster', name: 'rag-cluster', region: 'eastus', status: 'running', monthlyCost: 1400, cpuUsage: 52, memoryUsage: 64 },
    { id: 'cr-08', provider: 'aws', type: 'S3 Bucket', name: 'aitop-evidence', region: 'us-east-1', status: 'running', monthlyCost: 180, cpuUsage: 0, memoryUsage: 0 },
    { id: 'cr-09', provider: 'gcp', type: 'Cloud SQL', name: 'analytics-db', region: 'us-central1', status: 'running', monthlyCost: 450, cpuUsage: 28, memoryUsage: 55 },
    { id: 'cr-10', provider: 'aws', type: 'EC2 (t3.medium)', name: 'dev-server', region: 'ap-northeast-2', status: 'stopped', monthlyCost: 0, cpuUsage: 0, memoryUsage: 0 },
  ];
}

// ── Data Pipeline (Phase 23-3) ──────────────────────────────────────────

export function getPipelines(): import('@/types/monitoring').Pipeline[] {
  const now = Date.now();
  return [
    { id: 'pipe-01', name: 'daily-embedding-refresh', orchestrator: 'airflow', status: 'running', totalTasks: 6, completedTasks: 4, durationMs: 1200000, lastRunAt: now - 600000, schedule: '0 2 * * *', successRate: 96.5,
      tasks: [
        { id: 't1', name: 'extract_documents', status: 'success', durationMs: 120000, startedAt: now - 1200000 },
        { id: 't2', name: 'chunk_text', status: 'success', durationMs: 180000, startedAt: now - 1080000 },
        { id: 't3', name: 'generate_embeddings', status: 'success', durationMs: 420000, startedAt: now - 900000 },
        { id: 't4', name: 'upsert_vectordb', status: 'success', durationMs: 240000, startedAt: now - 480000 },
        { id: 't5', name: 'validate_quality', status: 'running', durationMs: 0, startedAt: now - 240000 },
        { id: 't6', name: 'notify_completion', status: 'pending', durationMs: 0, startedAt: 0 },
      ] },
    { id: 'pipe-02', name: 'model-evaluation-suite', orchestrator: 'prefect', status: 'success', totalTasks: 4, completedTasks: 4, durationMs: 900000, lastRunAt: now - 3600000, schedule: '0 */6 * * *', successRate: 100,
      tasks: [
        { id: 't1', name: 'load_test_dataset', status: 'success', durationMs: 60000, startedAt: now - 3600000 },
        { id: 't2', name: 'run_inference', status: 'success', durationMs: 540000, startedAt: now - 3540000 },
        { id: 't3', name: 'compute_metrics', status: 'success', durationMs: 180000, startedAt: now - 3000000 },
        { id: 't4', name: 'publish_report', status: 'success', durationMs: 120000, startedAt: now - 2820000 },
      ] },
    { id: 'pipe-03', name: 'guardrail-dataset-update', orchestrator: 'dagster', status: 'failed', totalTasks: 5, completedTasks: 3, durationMs: 450000, lastRunAt: now - 7200000, schedule: '0 0 * * 1', successRate: 87.3,
      tasks: [
        { id: 't1', name: 'fetch_labels', status: 'success', durationMs: 60000, startedAt: now - 7200000 },
        { id: 't2', name: 'preprocess', status: 'success', durationMs: 120000, startedAt: now - 7140000 },
        { id: 't3', name: 'train_classifier', status: 'success', durationMs: 240000, startedAt: now - 7020000 },
        { id: 't4', name: 'evaluate', status: 'failed', durationMs: 30000, startedAt: now - 6780000 },
        { id: 't5', name: 'deploy', status: 'skipped', durationMs: 0, startedAt: 0 },
      ] },
    { id: 'pipe-04', name: 'weekly-cost-report', orchestrator: 'airflow', status: 'queued', totalTasks: 3, completedTasks: 0, durationMs: 0, lastRunAt: now - 86400000 * 7, schedule: '0 9 * * 1', successRate: 100,
      tasks: [
        { id: 't1', name: 'aggregate_costs', status: 'pending', durationMs: 0, startedAt: 0 },
        { id: 't2', name: 'generate_report', status: 'pending', durationMs: 0, startedAt: 0 },
        { id: 't3', name: 'send_email', status: 'pending', durationMs: 0, startedAt: 0 },
      ] },
  ];
}

// ── Business KPI (Phase 23-4) ───────────────────────────────────────────

export function getBusinessKPIs(): import('@/types/monitoring').BusinessKPI[] {
  return [
    { id: 'bk-01', name: 'Revenue Impact', value: 285000, unit: '$/month', trend: 12.5, category: 'revenue' },
    { id: 'bk-02', name: 'Conversion Rate', value: 4.2, unit: '%', trend: 0.8, category: 'conversion' },
    { id: 'bk-03', name: 'AI ROI', value: 340, unit: '%', trend: 25, category: 'efficiency' },
    { id: 'bk-04', name: 'Cost per Transaction', value: 0.023, unit: '$', trend: -8.5, category: 'efficiency' },
    { id: 'bk-05', name: 'Customer Retention', value: 94.2, unit: '%', trend: 1.2, category: 'retention' },
    { id: 'bk-06', name: 'Support Deflection', value: 68, unit: '%', trend: 15, category: 'efficiency' },
  ];
}

export function getCorrelationData(): import('@/types/monitoring').CorrelationPoint[] {
  return [
    { aiMetric: 0.8, bizMetric: 4.5, label: 'rag-service (Low TTFT → High Conversion)' },
    { aiMetric: 1.2, bizMetric: 4.2, label: 'chatbot-v2 (Med TTFT → Med Conversion)' },
    { aiMetric: 2.5, bizMetric: 2.8, label: 'code-assistant (High TTFT → Low Conversion)' },
    { aiMetric: 0.5, bizMetric: 4.8, label: 'embedding-svc (Very Low TTFT → Very High)' },
    { aiMetric: 1.8, bizMetric: 3.5, label: 'guardrail (Med-High TTFT → Med Conversion)' },
    { aiMetric: 3.0, bizMetric: 2.2, label: 'legacy-model (Very High TTFT → Low)' },
  ];
}

export function getROIData(): import('@/types/monitoring').ROIEntry[] {
  return [
    { category: 'RAG Service', investment: 8500, revenue: 42000, savings: 12000, roi: 535 },
    { category: 'Chatbot v2', investment: 5200, revenue: 28000, savings: 8500, roi: 601 },
    { category: 'Code Assistant', investment: 3800, revenue: 15000, savings: 6200, roi: 457 },
    { category: 'Guardrail', investment: 2100, revenue: 0, savings: 18000, roi: 757 },
    { category: 'Embedding', investment: 1800, revenue: 8000, savings: 4500, roi: 594 },
  ];
}

// ── Marketplace (Phase 23-5) ────────────────────────────────────────────

export function getMarketplaceItems(): import('@/types/monitoring').MarketplaceItem[] {
  const now = Date.now();
  return [
    { id: 'mp-01', name: 'GPU Cluster Dashboard', description: 'Comprehensive GPU monitoring with VRAM, temperature, and utilization charts', type: 'dashboard', author: 'AITOP Team', downloads: 1240, rating: 4.8, tags: ['gpu', 'monitoring', 'official'], createdAt: now - 86400000 * 30, featured: true },
    { id: 'mp-02', name: 'RAG Quality Prompts', description: 'Evaluation prompts for RAG pipeline quality assessment', type: 'prompt', author: 'AI Lab', downloads: 890, rating: 4.6, tags: ['rag', 'evaluation', 'quality'], createdAt: now - 86400000 * 20, featured: true },
    { id: 'mp-03', name: 'Cost Anomaly Detector', description: 'Plugin that detects unusual cost spikes across cloud providers', type: 'plugin', author: 'CloudOps', downloads: 560, rating: 4.3, tags: ['cost', 'anomaly', 'cloud'], createdAt: now - 86400000 * 15, featured: false },
    { id: 'mp-04', name: 'Incident Runbook', description: 'Notebook template for structured incident response and post-mortem', type: 'notebook', author: 'SRE Guild', downloads: 720, rating: 4.7, tags: ['incident', 'runbook', 'sre'], createdAt: now - 86400000 * 10, featured: true },
    { id: 'mp-05', name: 'LLM Performance Suite', description: 'Dashboard with TTFT, TPS, token cost tracking per model', type: 'dashboard', author: 'AI Lab', downloads: 1050, rating: 4.9, tags: ['llm', 'performance', 'cost'], createdAt: now - 86400000 * 25, featured: true },
    { id: 'mp-06', name: 'Security Guardrail Pack', description: 'Pre-configured prompts for PII, injection, and toxicity detection', type: 'prompt', author: 'Security Team', downloads: 430, rating: 4.4, tags: ['security', 'guardrail', 'compliance'], createdAt: now - 86400000 * 8, featured: false },
    { id: 'mp-07', name: 'Slack Alert Router', description: 'Plugin for intelligent alert routing to Slack channels by severity', type: 'plugin', author: 'DevOps Pro', downloads: 380, rating: 4.1, tags: ['slack', 'alerts', 'routing'], createdAt: now - 86400000 * 5, featured: false },
    { id: 'mp-08', name: 'Training Monitor Notebook', description: 'Interactive notebook for tracking fine-tuning jobs with loss curves', type: 'notebook', author: 'ML Team', downloads: 290, rating: 4.5, tags: ['training', 'fine-tuning', 'notebook'], createdAt: now - 86400000 * 3, featured: false },
  ];
}

// ── System Profiling (Phase 35 — perf/eBPF) ─────────────────────────────

export function getSystemProfilingProfiles(): import('@/types/monitoring').SystemProfile[] {
  const now = Date.now();
  return [
    { profile_id: 'sys-prof-001', agent_id: 'agent-01', hostname: 'prod-api-01', profile_type: 'cpu', target: 'all', sampling_frequency: 99, duration_sec: 30, total_samples: 29700, stack_depth: 127, size_bytes: 384000, captured_at: new Date(now - 7200000).toISOString(), symbol_stats: { resolved: 4250, unknown: 180, jit: 0 } },
    { profile_id: 'sys-prof-002', agent_id: 'agent-01', hostname: 'prod-api-01', profile_type: 'offcpu', target: 'all', sampling_frequency: 0, duration_sec: 30, total_samples: 15800, stack_depth: 127, size_bytes: 256000, captured_at: new Date(now - 7200000).toISOString(), symbol_stats: { resolved: 2100, unknown: 320, jit: 0 } },
    { profile_id: 'sys-prof-003', agent_id: 'agent-02', hostname: 'prod-gpu-01', profile_type: 'cpu', target: 'pid:12345', sampling_frequency: 99, duration_sec: 60, total_samples: 59400, stack_depth: 127, size_bytes: 720000, captured_at: new Date(now - 3600000).toISOString(), symbol_stats: { resolved: 8900, unknown: 420, jit: 1200 } },
    { profile_id: 'sys-prof-004', agent_id: 'agent-03', hostname: 'prod-gpu-02', profile_type: 'memory', target: 'pid:54321', sampling_frequency: 0, duration_sec: 30, total_samples: 8200, stack_depth: 64, size_bytes: 128000, captured_at: new Date(now - 1800000).toISOString(), symbol_stats: { resolved: 1500, unknown: 90, jit: 350 } },
    { profile_id: 'sys-prof-005', agent_id: 'agent-01', hostname: 'prod-api-01', profile_type: 'cpu', target: 'all', sampling_frequency: 99, duration_sec: 30, total_samples: 31200, stack_depth: 127, size_bytes: 398000, captured_at: new Date(now - 900000).toISOString(), symbol_stats: { resolved: 4400, unknown: 150, jit: 0 } },
    { profile_id: 'sys-prof-006', agent_id: 'agent-02', hostname: 'prod-gpu-01', profile_type: 'offcpu', target: 'all', sampling_frequency: 0, duration_sec: 60, total_samples: 42000, stack_depth: 127, size_bytes: 512000, captured_at: new Date(now - 600000).toISOString(), symbol_stats: { resolved: 5200, unknown: 800, jit: 600 } },
  ];
}

export function getSystemFlamegraphData(profileId: string, type: string = 'cpu'): import('@/types/monitoring').SystemFlamegraphData {
  const now = Date.now();
  const buildTree = (pt: string): import('@/types/monitoring').FlameGraphNode => {
    if (pt === 'offcpu') {
      return {
        name: 'root', fullName: 'root', value: 102300, selfValue: 0, children: [
          { name: 'java', fullName: 'java', value: 69300, selfValue: 0, children: [
            { name: 'java_start', fullName: 'java;java_start', value: 69300, selfValue: 0, children: [
              { name: 'main', fullName: 'java;java_start;main', value: 69300, selfValue: 0, children: [
                { name: 'HttpServer.handle', fullName: 'java;...;HttpServer.handle', value: 60500, selfValue: 0, children: [
                  { name: 'OrderService.createOrder', fullName: 'java;...;OrderService.createOrder', value: 42000, selfValue: 0, children: [
                    { name: 'DB.query', fullName: 'java;...;DB.query', value: 42000, selfValue: 0, children: [
                      { name: 'io_schedule', fullName: 'java;...;io_schedule', value: 42000, selfValue: 42000, children: [] },
                    ] },
                  ] },
                  { name: 'UserService.authenticate', fullName: 'java;...;UserService.authenticate', value: 18500, selfValue: 0, children: [
                    { name: 'Redis.get', fullName: 'java;...;Redis.get', value: 18500, selfValue: 0, children: [
                      { name: 'io_schedule', fullName: 'java;...;io_schedule', value: 18500, selfValue: 18500, children: [] },
                    ] },
                  ] },
                ] },
                { name: 'GCThread.run', fullName: 'java;...;GCThread.run', value: 8800, selfValue: 0, children: [
                  { name: 'futex_wait', fullName: 'java;...;futex_wait', value: 8800, selfValue: 8800, children: [] },
                ] },
              ] },
            ] },
          ] },
          { name: 'python', fullName: 'python', value: 12400, selfValue: 0, children: [
            { name: 'app.main', fullName: 'python;...;app.main', value: 12400, selfValue: 0, children: [
              { name: 'handler.process', fullName: 'python;...;handler.process', value: 12400, selfValue: 0, children: [
                { name: 'db.query', fullName: 'python;...;db.query', value: 12400, selfValue: 0, children: [
                  { name: 'io_schedule', fullName: 'python;...;io_schedule', value: 12400, selfValue: 12400, children: [] },
                ] },
              ] },
            ] },
          ] },
          { name: 'go', fullName: 'go', value: 9800, selfValue: 0, children: [
            { name: 'net/http.(*Server).Serve', fullName: 'go;...;net/http.(*Server).Serve', value: 9800, selfValue: 0, children: [
              { name: 'database/sql.(*DB).QueryContext', fullName: 'go;...;database/sql.(*DB).QueryContext', value: 9800, selfValue: 0, children: [
                { name: 'io_schedule', fullName: 'go;...;io_schedule', value: 9800, selfValue: 9800, children: [] },
              ] },
            ] },
          ] },
          { name: 'node', fullName: 'node', value: 7600, selfValue: 0, children: [
            { name: 'requestHandler', fullName: 'node;...;requestHandler', value: 7600, selfValue: 0, children: [
              { name: 'pool.query', fullName: 'node;...;pool.query', value: 7600, selfValue: 0, children: [
                { name: 'io_schedule', fullName: 'node;...;io_schedule', value: 7600, selfValue: 7600, children: [] },
              ] },
            ] },
          ] },
          { name: 'kthread', fullName: 'kthread', value: 3200, selfValue: 0, children: [
            { name: 'io_schedule', fullName: 'kthread;...;io_schedule', value: 3200, selfValue: 3200, children: [] },
          ] },
        ],
      };
    }
    if (pt === 'memory') {
      return {
        name: 'root', fullName: 'root', value: 33554432, selfValue: 0, children: [
          { name: 'java', fullName: 'java', value: 3670016, selfValue: 0, children: [
            { name: 'HttpServer.handle', fullName: 'java;...;HttpServer.handle', value: 3670016, selfValue: 0, children: [
              { name: 'OrderService.createOrder', fullName: 'java;...;OrderService.createOrder', value: 2621440, selfValue: 0, children: [
                { name: 'ByteBuffer.allocate', fullName: 'java;...;ByteBuffer.allocate', value: 2097152, selfValue: 2097152, children: [] },
                { name: 'Unsafe.allocateMemory', fullName: 'java;...;Unsafe.allocateMemory', value: 524288, selfValue: 524288, children: [] },
              ] },
              { name: 'ResponseBuilder.toJSON', fullName: 'java;...;ResponseBuilder.toJSON', value: 1048576, selfValue: 1048576, children: [] },
            ] },
          ] },
          { name: 'python', fullName: 'python', value: 12582912, selfValue: 0, children: [
            { name: 'handler.process', fullName: 'python;...;handler.process', value: 12582912, selfValue: 0, children: [
              { name: 'pandas.DataFrame.from_records', fullName: 'python;...;pandas.DataFrame.from_records', value: 8388608, selfValue: 8388608, children: [] },
              { name: 'numpy.array', fullName: 'python;...;numpy.array', value: 4194304, selfValue: 4194304, children: [] },
            ] },
          ] },
          { name: 'go', fullName: 'go', value: 393216, selfValue: 0, children: [
            { name: 'net/http.(*conn).serve', fullName: 'go;...;net/http.(*conn).serve', value: 393216, selfValue: 0, children: [
              { name: 'encoding/json.Marshal', fullName: 'go;...;encoding/json.Marshal', value: 262144, selfValue: 262144, children: [] },
              { name: 'bytes.(*Buffer).grow', fullName: 'go;...;bytes.(*Buffer).grow', value: 131072, selfValue: 131072, children: [] },
            ] },
          ] },
          { name: 'node', fullName: 'node', value: 1048576, selfValue: 0, children: [
            { name: 'Buffer.alloc', fullName: 'node;...;Buffer.alloc', value: 1048576, selfValue: 1048576, children: [] },
          ] },
          { name: 'kthread', fullName: 'kthread', value: 16777216, selfValue: 0, children: [
            { name: 'alloc_pages', fullName: 'kthread;alloc_pages', value: 16777216, selfValue: 16777216, children: [] },
          ] },
        ],
      };
    }
    // default: cpu
    return {
      name: 'root', fullName: 'root', value: 534, selfValue: 0, children: [
        { name: 'java', fullName: 'java', value: 218, selfValue: 0, children: [
          { name: 'HttpServer.handle', fullName: 'java;...;HttpServer.handle', value: 196, selfValue: 0, children: [
            { name: 'UserService.authenticate', fullName: 'java;...;UserService.authenticate', value: 73, selfValue: 0, children: [
              { name: 'BCrypt.hashpw', fullName: 'java;...;BCrypt.hashpw', value: 65, selfValue: 65, children: [] },
              { name: 'Redis.get', fullName: 'java;...;Redis.get', value: 8, selfValue: 8, children: [] },
            ] },
            { name: 'OrderService.createOrder', fullName: 'java;...;OrderService.createOrder', value: 85, selfValue: 0, children: [
              { name: 'DB.query', fullName: 'java;...;DB.query', value: 70, selfValue: 0, children: [
                { name: 'SocketInputStream.read', fullName: 'java;...;SocketInputStream.read', value: 42, selfValue: 42, children: [] },
                { name: 'ResultSetParser.parse', fullName: 'java;...;ResultSetParser.parse', value: 28, selfValue: 28, children: [] },
              ] },
              { name: 'Validator.validate', fullName: 'java;...;Validator.validate', value: 15, selfValue: 15, children: [] },
            ] },
            { name: 'ResponseBuilder.toJSON', fullName: 'java;...;ResponseBuilder.toJSON', value: 38, selfValue: 0, children: [
              { name: 'Jackson.serialize', fullName: 'java;...;Jackson.serialize', value: 38, selfValue: 38, children: [] },
            ] },
          ] },
          { name: 'GCThread.run', fullName: 'java;GCThread.run', value: 22, selfValue: 0, children: [
            { name: 'PSPromotionManager.drain', fullName: 'java;...;PSPromotionManager.drain', value: 22, selfValue: 22, children: [] },
          ] },
        ] },
        { name: 'python', fullName: 'python', value: 85, selfValue: 0, children: [
          { name: 'httpserver.serve', fullName: 'python;...;httpserver.serve', value: 73, selfValue: 0, children: [
            { name: 'handler.process', fullName: 'python;...;handler.process', value: 73, selfValue: 0, children: [
              { name: 'transformer.predict', fullName: 'python;...;transformer.predict', value: 55, selfValue: 55, children: [] },
              { name: 'db.query', fullName: 'python;...;db.query', value: 18, selfValue: 18, children: [] },
            ] },
          ] },
          { name: 'gc.collect', fullName: 'python;...;gc.collect', value: 12, selfValue: 12, children: [] },
        ] },
        { name: 'go', fullName: 'go', value: 93, selfValue: 0, children: [
          { name: 'net/http.(*Server).Serve', fullName: 'go;...;net/http.(*Server).Serve', value: 67, selfValue: 0, children: [
            { name: 'main.handleAPI', fullName: 'go;...;main.handleAPI', value: 67, selfValue: 0, children: [
              { name: 'encoding/json.Unmarshal', fullName: 'go;...;encoding/json.Unmarshal', value: 35, selfValue: 35, children: [] },
              { name: 'database/sql.(*DB).QueryContext', fullName: 'go;...;database/sql.(*DB).QueryContext', value: 20, selfValue: 20, children: [] },
              { name: 'crypto/hmac.Equal', fullName: 'go;...;crypto/hmac.Equal', value: 12, selfValue: 12, children: [] },
            ] },
          ] },
          { name: 'runtime.gcBgMarkWorker', fullName: 'go;runtime.gcBgMarkWorker', value: 18, selfValue: 18, children: [] },
          { name: 'runtime.mcall', fullName: 'go;runtime.mcall', value: 8, selfValue: 8, children: [] },
        ] },
        { name: 'node', fullName: 'node', value: 50, selfValue: 0, children: [
          { name: 'requestHandler', fullName: 'node;...;requestHandler', value: 40, selfValue: 0, children: [
            { name: 'JSON.parse', fullName: 'node;...;JSON.parse', value: 25, selfValue: 25, children: [] },
            { name: 'pool.query', fullName: 'node;...;pool.query', value: 15, selfValue: 15, children: [] },
          ] },
          { name: 'epoll_wait', fullName: 'node;...;epoll_wait', value: 10, selfValue: 10, children: [] },
        ] },
        { name: 'swapper', fullName: 'swapper', value: 45, selfValue: 0, children: [
          { name: 'do_idle', fullName: 'swapper;...;do_idle', value: 45, selfValue: 0, children: [
            { name: 'intel_idle', fullName: 'swapper;...;intel_idle', value: 45, selfValue: 45, children: [] },
          ] },
        ] },
        { name: 'kthread', fullName: 'kthread', value: 43, selfValue: 0, children: [
          { name: 'worker_thread', fullName: 'kthread;worker_thread', value: 43, selfValue: 0, children: [
            { name: 'io_schedule', fullName: 'kthread;...;io_schedule', value: 3, selfValue: 3, children: [] },
            { name: 'flush_to_ldisc', fullName: 'kthread;...;flush_to_ldisc', value: 40, selfValue: 40, children: [] },
          ] },
        ] },
      ],
    };
  };

  return {
    profileId,
    profileType: type as 'cpu' | 'offcpu' | 'memory' | 'mixed',
    agentId: 'agent-01',
    hostname: 'prod-api-01',
    totalSamples: type === 'memory' ? 33554432 : type === 'offcpu' ? 102300 : 534,
    durationSec: 30,
    capturedAt: new Date(now - 3600000).toISOString(),
    root: buildTree(type),
  };
}

export function getSystemFlamegraphDiffData(): import('@/types/monitoring').FlameGraphDiff {
  return {
    base_profile_id: 'sys-prof-001',
    target_profile_id: 'sys-prof-005',
    root: {
      name: 'root', fullName: 'root', baseValue: 534, targetValue: 580, delta: 46, children: [
        { name: 'java', fullName: 'java', baseValue: 218, targetValue: 252, delta: 34, children: [
          { name: 'HttpServer.handle', fullName: 'java;...;HttpServer.handle', baseValue: 196, targetValue: 235, delta: 39, children: [
            { name: 'UserService.authenticate', fullName: 'java;...;UserService.authenticate', baseValue: 73, targetValue: 60, delta: -13, children: [] },
            { name: 'OrderService.createOrder', fullName: 'java;...;OrderService.createOrder', baseValue: 85, targetValue: 120, delta: 35, children: [
              { name: 'CacheManager.invalidate', fullName: 'java;...;CacheManager.invalidate', baseValue: 0, targetValue: 18, delta: 18, children: [] },
            ] },
            { name: 'ResponseBuilder.toJSON', fullName: 'java;...;ResponseBuilder.toJSON', baseValue: 38, targetValue: 55, delta: 17, children: [] },
          ] },
          { name: 'GCThread.run', fullName: 'java;GCThread.run', baseValue: 22, targetValue: 17, delta: -5, children: [] },
        ] },
        { name: 'python', fullName: 'python', baseValue: 85, targetValue: 92, delta: 7, children: [
          { name: 'transformer.predict', fullName: 'python;...;transformer.predict', baseValue: 55, targetValue: 62, delta: 7, children: [] },
          { name: 'db.query', fullName: 'python;...;db.query', baseValue: 18, targetValue: 22, delta: 4, children: [] },
        ] },
        { name: 'go', fullName: 'go', baseValue: 93, targetValue: 88, delta: -5, children: [
          { name: 'encoding/json.Unmarshal', fullName: 'go;...;encoding/json.Unmarshal', baseValue: 35, targetValue: 28, delta: -7, children: [] },
          { name: 'database/sql.(*DB).QueryContext', fullName: 'go;...;database/sql.(*DB).QueryContext', baseValue: 20, targetValue: 25, delta: 5, children: [] },
        ] },
        { name: 'swapper', fullName: 'swapper', baseValue: 45, targetValue: 38, delta: -7, children: [] },
        { name: 'kthread', fullName: 'kthread', baseValue: 43, targetValue: 48, delta: 5, children: [] },
        { name: 'node', fullName: 'node', baseValue: 50, targetValue: 62, delta: 12, children: [] },
      ],
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 33: Central Plugin Deployment Demo Data
// ═══════════════════════════════════════════════════════════════

export function getPluginRegistry(): PluginRegistryItem[] {
  return [
    {
      name: 'evidence-weblogic-jndi',
      version: '2.1.0',
      description: 'WebLogic JNDI tree and DataSource evidence collector for J2EE monitoring',
      author: 'aitop-core',
      categories: ['it', 'middleware'],
      platforms: ['linux', 'windows'],
      uploaded_at: new Date(Date.now() - 14 * 86400_000).toISOString(),
      size_bytes: 245_760,
      checksum: 'a3f8c1d2e4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1',
      deploy_count: 3,
      disabled: false,
      agent_summary: { total: 8, installed: 6, failed: 1, pending: 1 },
    },
    {
      name: 'gpu-amd-instinct',
      version: '1.3.2',
      description: 'AMD Instinct MI300X GPU metrics via ROCm SMI — VRAM, temperature, power, compute utilization',
      author: 'aitop-core',
      categories: ['ai', 'gpu'],
      platforms: ['linux'],
      uploaded_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
      size_bytes: 512_000,
      checksum: 'b4f9d2e3c5a6b7d8e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
      deploy_count: 2,
      disabled: false,
      agent_summary: { total: 4, installed: 4, failed: 0, pending: 0 },
    },
    {
      name: 'hotfix-nginx-parser',
      version: '1.0.1',
      description: 'Emergency hotfix for Nginx log parser — resolves CVE-2026-1234 header injection detection',
      author: 'security-team',
      categories: ['it', 'security'],
      platforms: ['linux'],
      uploaded_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
      size_bytes: 89_600,
      checksum: 'c5a0e3f4d6b7c8d9e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
      deploy_count: 5,
      disabled: false,
      agent_summary: { total: 12, installed: 10, failed: 0, pending: 2 },
    },
    {
      name: 'custom-oracle-rac',
      version: '3.0.0',
      description: 'Oracle RAC cluster health, ASM diskgroup, GI stack monitoring with SQL-based evidence',
      author: 'db-team',
      categories: ['it', 'database'],
      platforms: ['linux', 'windows'],
      uploaded_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
      size_bytes: 1_024_000,
      checksum: 'd6b1f4a5e7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4',
      deploy_count: 1,
      disabled: false,
      agent_summary: { total: 6, installed: 5, failed: 1, pending: 0 },
    },
    {
      name: 'llm-token-audit',
      version: '1.2.0',
      description: 'LLM token usage auditing — tracks input/output tokens, cost attribution per API key',
      author: 'ai-platform',
      categories: ['ai', 'audit'],
      platforms: ['linux', 'windows'],
      uploaded_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
      size_bytes: 156_000,
      checksum: 'e7c2a5b6f8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5',
      deploy_count: 4,
      disabled: false,
      agent_summary: { total: 10, installed: 8, failed: 1, pending: 1 },
    },
    {
      name: 'k8s-gpu-scheduler',
      version: '0.9.0',
      description: 'Kubernetes GPU scheduler metrics — pending pods, allocation efficiency, fragmentation',
      author: 'infra-team',
      categories: ['ai', 'kubernetes'],
      platforms: ['linux'],
      uploaded_at: new Date(Date.now() - 1 * 86400_000).toISOString(),
      size_bytes: 320_000,
      checksum: 'f8d3b6c7a9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6',
      deploy_count: 0,
      disabled: true,
      agent_summary: { total: 0, installed: 0, failed: 0, pending: 0 },
    },
  ];
}

export function getPluginDeployHistory(): PluginDeployHistory[] {
  return [
    {
      deploy_id: 'deploy-000001',
      plugin_name: 'hotfix-nginx-parser',
      version: '1.0.1',
      strategy: 'immediate',
      status: 'completed',
      started_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 2 * 86400_000 + 180_000).toISOString(),
      total_agents: 12,
      success_count: 10,
      fail_count: 0,
    },
    {
      deploy_id: 'deploy-000002',
      plugin_name: 'evidence-weblogic-jndi',
      version: '2.1.0',
      strategy: 'staged',
      status: 'in_progress',
      started_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
      total_agents: 8,
      success_count: 6,
      fail_count: 1,
    },
    {
      deploy_id: 'deploy-000003',
      plugin_name: 'gpu-amd-instinct',
      version: '1.3.2',
      strategy: 'immediate',
      status: 'completed',
      started_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 7 * 86400_000 + 120_000).toISOString(),
      total_agents: 4,
      success_count: 4,
      fail_count: 0,
    },
    {
      deploy_id: 'deploy-000004',
      plugin_name: 'custom-oracle-rac',
      version: '2.9.0',
      strategy: 'staged',
      status: 'rolled_back',
      started_at: new Date(Date.now() - 35 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 35 * 86400_000 + 600_000).toISOString(),
      total_agents: 6,
      success_count: 2,
      fail_count: 4,
    },
    {
      deploy_id: 'deploy-000005',
      plugin_name: 'llm-token-audit',
      version: '1.2.0',
      strategy: 'scheduled',
      status: 'completed',
      started_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 5 * 86400_000 + 300_000).toISOString(),
      total_agents: 10,
      success_count: 8,
      fail_count: 1,
    },
    {
      deploy_id: 'deploy-000006',
      plugin_name: 'custom-oracle-rac',
      version: '3.0.0',
      strategy: 'immediate',
      status: 'completed',
      started_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 30 * 86400_000 + 240_000).toISOString(),
      total_agents: 6,
      success_count: 5,
      fail_count: 1,
    },
    {
      deploy_id: 'deploy-000007',
      plugin_name: 'hotfix-nginx-parser',
      version: '1.0.0',
      strategy: 'immediate',
      status: 'failed',
      started_at: new Date(Date.now() - 10 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 10 * 86400_000 + 60_000).toISOString(),
      total_agents: 12,
      success_count: 3,
      fail_count: 9,
    },
    {
      deploy_id: 'deploy-000008',
      plugin_name: 'evidence-weblogic-jndi',
      version: '2.0.0',
      strategy: 'staged',
      status: 'completed',
      started_at: new Date(Date.now() - 21 * 86400_000).toISOString(),
      completed_at: new Date(Date.now() - 21 * 86400_000 + 900_000).toISOString(),
      total_agents: 8,
      success_count: 8,
      fail_count: 0,
    },
  ];
}

export function getPluginAgentStatus(pluginName: string): PluginAgentStatus[] {
  const statusSets: Record<string, PluginAgentStatus[]> = {
    'evidence-weblogic-jndi': [
      { agent_id: 'agent-01', hostname: 'prod-was-01', version: '2.1.0', status: 'installed', installed_at: new Date(Date.now() - 6 * 3600_000).toISOString() },
      { agent_id: 'agent-02', hostname: 'prod-was-02', version: '2.1.0', status: 'installed', installed_at: new Date(Date.now() - 6 * 3600_000).toISOString() },
      { agent_id: 'agent-03', hostname: 'prod-was-03', version: '2.1.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 3600_000).toISOString() },
      { agent_id: 'agent-04', hostname: 'stg-was-01', version: '2.1.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 3600_000).toISOString() },
      { agent_id: 'agent-05', hostname: 'stg-was-02', version: '2.1.0', status: 'installed', installed_at: new Date(Date.now() - 4 * 3600_000).toISOString() },
      { agent_id: 'agent-06', hostname: 'stg-was-03', version: '2.1.0', status: 'installed', installed_at: new Date(Date.now() - 4 * 3600_000).toISOString() },
      { agent_id: 'agent-07', hostname: 'dev-was-01', version: '2.1.0', status: 'failed', error: 'checksum mismatch after download — network corruption suspected' },
      { agent_id: 'agent-08', hostname: 'dev-was-02', version: '2.1.0', status: 'pending' },
    ],
    'gpu-amd-instinct': [
      { agent_id: 'agent-10', hostname: 'gpu-mi300x-01', version: '1.3.2', status: 'installed', installed_at: new Date(Date.now() - 7 * 86400_000).toISOString() },
      { agent_id: 'agent-11', hostname: 'gpu-mi300x-02', version: '1.3.2', status: 'installed', installed_at: new Date(Date.now() - 7 * 86400_000).toISOString() },
      { agent_id: 'agent-12', hostname: 'gpu-mi300x-03', version: '1.3.2', status: 'installed', installed_at: new Date(Date.now() - 7 * 86400_000).toISOString() },
      { agent_id: 'agent-13', hostname: 'gpu-mi300x-04', version: '1.3.2', status: 'installed', installed_at: new Date(Date.now() - 7 * 86400_000).toISOString() },
    ],
    'hotfix-nginx-parser': [
      { agent_id: 'agent-01', hostname: 'prod-web-01', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-02', hostname: 'prod-web-02', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-03', hostname: 'prod-web-03', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-04', hostname: 'prod-api-01', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-05', hostname: 'prod-api-02', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-06', hostname: 'prod-api-03', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-07', hostname: 'stg-web-01', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-08', hostname: 'stg-web-02', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-09', hostname: 'stg-api-01', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-14', hostname: 'stg-api-02', version: '1.0.1', status: 'installed', installed_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      { agent_id: 'agent-15', hostname: 'dev-web-01', version: '1.0.1', status: 'pending' },
      { agent_id: 'agent-16', hostname: 'dev-api-01', version: '1.0.1', status: 'pending' },
    ],
    'custom-oracle-rac': [
      { agent_id: 'agent-20', hostname: 'db-rac-01', version: '3.0.0', status: 'installed', installed_at: new Date(Date.now() - 30 * 86400_000).toISOString() },
      { agent_id: 'agent-21', hostname: 'db-rac-02', version: '3.0.0', status: 'installed', installed_at: new Date(Date.now() - 30 * 86400_000).toISOString() },
      { agent_id: 'agent-22', hostname: 'db-rac-03', version: '3.0.0', status: 'installed', installed_at: new Date(Date.now() - 30 * 86400_000).toISOString() },
      { agent_id: 'agent-23', hostname: 'db-rac-04', version: '3.0.0', status: 'installed', installed_at: new Date(Date.now() - 30 * 86400_000).toISOString() },
      { agent_id: 'agent-24', hostname: 'db-rac-05', version: '3.0.0', status: 'installed', installed_at: new Date(Date.now() - 30 * 86400_000).toISOString() },
      { agent_id: 'agent-25', hostname: 'db-stby-01', version: '3.0.0', status: 'failed', error: 'Oracle client 19c not found — requires ORACLE_HOME environment' },
    ],
    'llm-token-audit': [
      { agent_id: 'agent-30', hostname: 'llm-gw-01', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-31', hostname: 'llm-gw-02', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-32', hostname: 'llm-inference-01', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-33', hostname: 'llm-inference-02', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-34', hostname: 'llm-inference-03', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-35', hostname: 'llm-inference-04', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-36', hostname: 'rag-service-01', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-37', hostname: 'rag-service-02', version: '1.2.0', status: 'installed', installed_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
      { agent_id: 'agent-38', hostname: 'embedding-01', version: '1.2.0', status: 'failed', error: 'Python 3.11+ required — detected Python 3.9.7' },
      { agent_id: 'agent-39', hostname: 'embedding-02', version: '1.2.0', status: 'pending' },
    ],
  };
  return statusSets[pluginName] || [
    { agent_id: 'agent-01', hostname: 'host-01', version: '1.0.0', status: 'installed', installed_at: new Date(Date.now() - 86400_000).toISOString() },
    { agent_id: 'agent-02', hostname: 'host-02', version: '1.0.0', status: 'pending' },
  ];
}

// ═══════════════════════════════════════════════════════════════
// Phase 38: Batch Monitoring Demo Data
// ═══════════════════════════════════════════════════════════════

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function getBatchJobs(): BatchJob[] {
  const now = Date.now();
  return [
    {
      name: 'daily-order-settlement',
      schedule: '0 2 * * *',
      schedule_human: '매일 02:00',
      language: 'java',
      scheduler: 'cron',
      hostname: 'batch-prod-01',
      status: 'completed',
      last_execution_at: new Date(now - 22 * HOUR).toISOString(),
      next_execution_at: new Date(now + 2 * HOUR).toISOString(),
      avg_duration_ms: 900_000,
      success_rate: 92.3,
      total_executions: 26,
      failed_count_24h: 0,
    },
    {
      name: 'customer-email-campaign',
      schedule: '0 9 * * *',
      schedule_human: '매일 09:00',
      language: 'python',
      scheduler: 'celery',
      hostname: 'batch-prod-02',
      status: 'completed',
      last_execution_at: new Date(now - 15 * HOUR).toISOString(),
      next_execution_at: new Date(now + 9 * HOUR).toISOString(),
      avg_duration_ms: 2_700_000,
      success_rate: 100.0,
      total_executions: 18,
      failed_count_24h: 0,
    },
    {
      name: 'data-warehouse-etl',
      schedule: '0 4 * * *',
      schedule_human: '매일 04:00',
      language: 'python',
      scheduler: 'airflow',
      hostname: 'etl-prod-01',
      status: 'completed',
      last_execution_at: new Date(now - 20 * HOUR).toISOString(),
      next_execution_at: new Date(now + 4 * HOUR).toISOString(),
      avg_duration_ms: 2_400_000,
      success_rate: 90.0,
      total_executions: 30,
      failed_count_24h: 0,
    },
    {
      name: 'hourly-backup',
      schedule: '0 * * * *',
      schedule_human: '매시 정각',
      language: 'shell',
      scheduler: 'cron',
      hostname: 'batch-prod-01',
      status: 'running',
      last_execution_at: new Date(now - 30_000).toISOString(),
      next_execution_at: new Date(now + HOUR).toISOString(),
      avg_duration_ms: 180_000,
      success_rate: 96.0,
      total_executions: 120,
      failed_count_24h: 1,
    },
    {
      name: 'monthly-report-gen',
      schedule: '0 3 1 * *',
      schedule_human: '매월 1일 03:00',
      language: 'go',
      scheduler: 'systemd',
      hostname: 'report-prod-01',
      status: 'idle',
      last_execution_at: new Date(now - 24 * DAY).toISOString(),
      next_execution_at: new Date(now + 6 * DAY).toISOString(),
      avg_duration_ms: 480_000,
      success_rate: 100.0,
      total_executions: 6,
      failed_count_24h: 0,
    },
    {
      name: 'inventory-sync',
      schedule: '*/30 * * * *',
      schedule_human: '30분 마다',
      language: 'java',
      scheduler: 'quartz',
      hostname: 'batch-prod-01',
      status: 'running',
      last_execution_at: new Date(now - 60_000).toISOString(),
      next_execution_at: new Date(now + 29 * 60_000).toISOString(),
      avg_duration_ms: 120_000,
      success_rate: 93.3,
      total_executions: 45,
      failed_count_24h: 1,
    },
    {
      name: 'ml-model-retrain',
      schedule: '0 0 * * 0',
      schedule_human: '매주 일요일 00:00',
      language: 'python',
      scheduler: 'airflow',
      hostname: 'gpu-train-01',
      status: 'completed',
      last_execution_at: new Date(now - 5 * DAY).toISOString(),
      next_execution_at: new Date(now + 2 * DAY).toISOString(),
      avg_duration_ms: 9_000_000,
      success_rate: 100.0,
      total_executions: 8,
      failed_count_24h: 0,
    },
  ];
}

export function getBatchExecutions(jobName?: string): BatchExecution[] {
  const now = Date.now();
  const all: BatchExecution[] = [
    // daily-order-settlement
    { execution_id: 'bexec-000001', job_name: 'daily-order-settlement', pid: 15001, language: 'java', scheduler: 'cron', command: 'java -jar order-batch.jar --spring.batch.job.names=orderSettlement', state: 'COMPLETED', started_at: new Date(now - 22 * HOUR).toISOString(), ended_at: new Date(now - 22 * HOUR + 900_000).toISOString(), exit_code: 0, duration_ms: 900_000, cpu_avg: 45.2, cpu_max: 82.5, memory_avg: 536_870_912, memory_max: 805_306_368, io_read_total: 2_147_483_648, io_write_total: 524_288_000, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000002', job_name: 'daily-order-settlement', pid: 14890, language: 'java', scheduler: 'cron', command: 'java -jar order-batch.jar --spring.batch.job.names=orderSettlement', state: 'COMPLETED', started_at: new Date(now - 46 * HOUR).toISOString(), ended_at: new Date(now - 46 * HOUR + 840_000).toISOString(), exit_code: 0, duration_ms: 840_000, cpu_avg: 42.8, cpu_max: 79.1, memory_avg: 524_288_000, memory_max: 754_974_720, io_read_total: 1_992_294_400, io_write_total: 503_316_480, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000003', job_name: 'daily-order-settlement', pid: 14702, language: 'java', scheduler: 'cron', command: 'java -jar order-batch.jar --spring.batch.job.names=orderSettlement', state: 'FAILED', started_at: new Date(now - 70 * HOUR).toISOString(), ended_at: new Date(now - 70 * HOUR + 300_000).toISOString(), exit_code: 1, duration_ms: 300_000, cpu_avg: 55.0, cpu_max: 90.3, memory_avg: 629_145_600, memory_max: 996_147_200, io_read_total: 838_860_800, io_write_total: 52_428_800, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000004', job_name: 'daily-order-settlement', pid: 14501, language: 'java', scheduler: 'cron', command: 'java -jar order-batch.jar --spring.batch.job.names=orderSettlement', state: 'COMPLETED', started_at: new Date(now - 94 * HOUR).toISOString(), ended_at: new Date(now - 94 * HOUR + 960_000).toISOString(), exit_code: 0, duration_ms: 960_000, cpu_avg: 44.0, cpu_max: 80.0, memory_avg: 534_773_760, memory_max: 786_432_000, io_read_total: 2_202_009_600, io_write_total: 545_259_520, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    // customer-email-campaign
    { execution_id: 'bexec-000005', job_name: 'customer-email-campaign', pid: 22001, language: 'python', scheduler: 'celery', command: 'celery worker -A campaign.tasks --concurrency=4', state: 'COMPLETED', started_at: new Date(now - 15 * HOUR).toISOString(), ended_at: new Date(now - 15 * HOUR + 2_700_000).toISOString(), exit_code: 0, duration_ms: 2_700_000, cpu_avg: 25.3, cpu_max: 60.1, memory_avg: 268_435_456, memory_max: 402_653_184, io_read_total: 104_857_600, io_write_total: 52_428_800, detected_via: 'framework_pattern', hostname: 'batch-prod-02' },
    { execution_id: 'bexec-000006', job_name: 'customer-email-campaign', pid: 21800, language: 'python', scheduler: 'celery', command: 'celery worker -A campaign.tasks --concurrency=4', state: 'COMPLETED', started_at: new Date(now - 39 * HOUR).toISOString(), ended_at: new Date(now - 39 * HOUR + 2_520_000).toISOString(), exit_code: 0, duration_ms: 2_520_000, cpu_avg: 24.1, cpu_max: 58.5, memory_avg: 260_046_848, memory_max: 387_973_120, io_read_total: 99_614_720, io_write_total: 50_331_648, detected_via: 'framework_pattern', hostname: 'batch-prod-02' },
    { execution_id: 'bexec-000007', job_name: 'customer-email-campaign', pid: 21600, language: 'python', scheduler: 'celery', command: 'celery worker -A campaign.tasks --concurrency=4', state: 'COMPLETED', started_at: new Date(now - 63 * HOUR).toISOString(), ended_at: new Date(now - 63 * HOUR + 3_000_000).toISOString(), exit_code: 0, duration_ms: 3_000_000, cpu_avg: 26.5, cpu_max: 62.0, memory_avg: 272_629_760, memory_max: 408_944_640, io_read_total: 115_343_360, io_write_total: 57_671_680, detected_via: 'framework_pattern', hostname: 'batch-prod-02' },
    // data-warehouse-etl
    { execution_id: 'bexec-000008', job_name: 'data-warehouse-etl', pid: 33001, language: 'python', scheduler: 'airflow', command: 'airflow tasks run data_warehouse_etl extract 2026-03-25', state: 'COMPLETED', started_at: new Date(now - 20 * HOUR).toISOString(), ended_at: new Date(now - 20 * HOUR + 2_700_000).toISOString(), exit_code: 0, duration_ms: 2_700_000, cpu_avg: 35.4, cpu_max: 72.1, memory_avg: 1_073_741_824, memory_max: 1_610_612_736, io_read_total: 5_368_709_120, io_write_total: 3_221_225_472, detected_via: 'framework_pattern', hostname: 'etl-prod-01' },
    { execution_id: 'bexec-000009', job_name: 'data-warehouse-etl', pid: 32800, language: 'python', scheduler: 'airflow', command: 'airflow tasks run data_warehouse_etl extract 2026-03-24', state: 'COMPLETED', started_at: new Date(now - 44 * HOUR).toISOString(), ended_at: new Date(now - 44 * HOUR + 2_400_000).toISOString(), exit_code: 0, duration_ms: 2_400_000, cpu_avg: 33.2, cpu_max: 70.5, memory_avg: 1_027_604_480, memory_max: 1_468_006_400, io_read_total: 5_033_164_800, io_write_total: 3_040_870_400, detected_via: 'framework_pattern', hostname: 'etl-prod-01' },
    { execution_id: 'bexec-000010', job_name: 'data-warehouse-etl', pid: 32600, language: 'python', scheduler: 'airflow', command: 'airflow tasks run data_warehouse_etl extract 2026-03-23', state: 'FAILED', started_at: new Date(now - 68 * HOUR).toISOString(), ended_at: new Date(now - 68 * HOUR + 180_000).toISOString(), exit_code: 1, duration_ms: 180_000, cpu_avg: 15.0, cpu_max: 40.0, memory_avg: 419_430_400, memory_max: 629_145_600, io_read_total: 209_715_200, io_write_total: 10_485_760, detected_via: 'framework_pattern', hostname: 'etl-prod-01' },
    // hourly-backup
    { execution_id: 'bexec-000011', job_name: 'hourly-backup', pid: 44001, language: 'shell', scheduler: 'cron', command: '/opt/scripts/backup.sh --target /data/backup --compress', state: 'COMPLETED', started_at: new Date(now - 1 * HOUR).toISOString(), ended_at: new Date(now - 1 * HOUR + 180_000).toISOString(), exit_code: 0, duration_ms: 180_000, cpu_avg: 12.5, cpu_max: 30.2, memory_avg: 67_108_864, memory_max: 134_217_728, io_read_total: 524_288_000, io_write_total: 524_288_000, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000012', job_name: 'hourly-backup', pid: 43900, language: 'shell', scheduler: 'cron', command: '/opt/scripts/backup.sh --target /data/backup --compress', state: 'COMPLETED', started_at: new Date(now - 2 * HOUR).toISOString(), ended_at: new Date(now - 2 * HOUR + 190_000).toISOString(), exit_code: 0, duration_ms: 190_000, cpu_avg: 13.1, cpu_max: 31.5, memory_avg: 69_206_016, memory_max: 136_314_880, io_read_total: 534_773_760, io_write_total: 534_773_760, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000013', job_name: 'hourly-backup', pid: 43800, language: 'shell', scheduler: 'cron', command: '/opt/scripts/backup.sh --target /data/backup --compress', state: 'COMPLETED', started_at: new Date(now - 3 * HOUR).toISOString(), ended_at: new Date(now - 3 * HOUR + 175_000).toISOString(), exit_code: 0, duration_ms: 175_000, cpu_avg: 11.8, cpu_max: 28.9, memory_avg: 65_011_712, memory_max: 131_072_000, io_read_total: 513_802_240, io_write_total: 513_802_240, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000014', job_name: 'hourly-backup', pid: 43700, language: 'shell', scheduler: 'cron', command: '/opt/scripts/backup.sh --target /data/backup --compress', state: 'FAILED', started_at: new Date(now - 4 * HOUR).toISOString(), ended_at: new Date(now - 4 * HOUR + 10_000).toISOString(), exit_code: 2, duration_ms: 10_000, cpu_avg: 5.0, cpu_max: 10.0, memory_avg: 33_554_432, memory_max: 50_331_648, io_read_total: 1_048_576, io_write_total: 0, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
    // monthly-report-gen
    { execution_id: 'bexec-000015', job_name: 'monthly-report-gen', pid: 55001, language: 'go', scheduler: 'systemd', command: '/usr/local/bin/report-gen --month 2026-03 --output /reports/', state: 'COMPLETED', started_at: new Date(now - 24 * DAY).toISOString(), ended_at: new Date(now - 24 * DAY + 480_000).toISOString(), exit_code: 0, duration_ms: 480_000, cpu_avg: 30.0, cpu_max: 55.0, memory_avg: 209_715_200, memory_max: 367_001_600, io_read_total: 314_572_800, io_write_total: 157_286_400, detected_via: 'scheduler_child', hostname: 'report-prod-01' },
    { execution_id: 'bexec-000016', job_name: 'monthly-report-gen', pid: 54800, language: 'go', scheduler: 'systemd', command: '/usr/local/bin/report-gen --month 2026-02 --output /reports/', state: 'COMPLETED', started_at: new Date(now - 54 * DAY).toISOString(), ended_at: new Date(now - 54 * DAY + 450_000).toISOString(), exit_code: 0, duration_ms: 450_000, cpu_avg: 28.5, cpu_max: 52.0, memory_avg: 199_229_440, memory_max: 346_030_080, io_read_total: 293_601_280, io_write_total: 146_800_640, detected_via: 'scheduler_child', hostname: 'report-prod-01' },
    // inventory-sync
    { execution_id: 'bexec-000017', job_name: 'inventory-sync', pid: 66001, language: 'java', scheduler: 'quartz', command: 'java -cp inventory-service.jar com.example.InventorySyncJob', state: 'COMPLETED', started_at: new Date(now - 30 * 60_000).toISOString(), ended_at: new Date(now - 30 * 60_000 + 120_000).toISOString(), exit_code: 0, duration_ms: 120_000, cpu_avg: 20.0, cpu_max: 45.0, memory_avg: 268_435_456, memory_max: 402_653_184, io_read_total: 52_428_800, io_write_total: 31_457_280, detected_via: 'framework_pattern', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000018', job_name: 'inventory-sync', pid: 65900, language: 'java', scheduler: 'quartz', command: 'java -cp inventory-service.jar com.example.InventorySyncJob', state: 'COMPLETED', started_at: new Date(now - 60 * 60_000).toISOString(), ended_at: new Date(now - 60 * 60_000 + 135_000).toISOString(), exit_code: 0, duration_ms: 135_000, cpu_avg: 21.5, cpu_max: 47.0, memory_avg: 272_629_760, memory_max: 408_944_640, io_read_total: 54_525_952, io_write_total: 33_554_432, detected_via: 'framework_pattern', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000019', job_name: 'inventory-sync', pid: 65800, language: 'java', scheduler: 'quartz', command: 'java -cp inventory-service.jar com.example.InventorySyncJob', state: 'COMPLETED', started_at: new Date(now - 90 * 60_000).toISOString(), ended_at: new Date(now - 90 * 60_000 + 110_000).toISOString(), exit_code: 0, duration_ms: 110_000, cpu_avg: 19.0, cpu_max: 42.0, memory_avg: 262_144_000, memory_max: 393_216_000, io_read_total: 50_331_648, io_write_total: 29_360_128, detected_via: 'framework_pattern', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000020', job_name: 'inventory-sync', pid: 65700, language: 'java', scheduler: 'quartz', command: 'java -cp inventory-service.jar com.example.InventorySyncJob', state: 'FAILED', started_at: new Date(now - 120 * 60_000).toISOString(), ended_at: new Date(now - 120 * 60_000 + 30_000).toISOString(), exit_code: 1, duration_ms: 30_000, cpu_avg: 10.0, cpu_max: 25.0, memory_avg: 209_715_200, memory_max: 314_572_800, io_read_total: 5_242_880, io_write_total: 1_048_576, detected_via: 'framework_pattern', hostname: 'batch-prod-01' },
    // ml-model-retrain
    { execution_id: 'bexec-000021', job_name: 'ml-model-retrain', pid: 77001, language: 'python', scheduler: 'airflow', command: 'python /opt/ml/retrain_pipeline.py --model recommendation-v3 --epochs 50', state: 'COMPLETED', started_at: new Date(now - 5 * DAY).toISOString(), ended_at: new Date(now - 5 * DAY + 9_000_000).toISOString(), exit_code: 0, duration_ms: 9_000_000, cpu_avg: 75.2, cpu_max: 98.5, memory_avg: 4_294_967_296, memory_max: 6_442_450_944, io_read_total: 10_737_418_240, io_write_total: 2_147_483_648, detected_via: 'framework_pattern', hostname: 'gpu-train-01' },
    { execution_id: 'bexec-000022', job_name: 'ml-model-retrain', pid: 76800, language: 'python', scheduler: 'airflow', command: 'python /opt/ml/retrain_pipeline.py --model recommendation-v3 --epochs 50', state: 'COMPLETED', started_at: new Date(now - 12 * DAY).toISOString(), ended_at: new Date(now - 12 * DAY + 9_900_000).toISOString(), exit_code: 0, duration_ms: 9_900_000, cpu_avg: 73.8, cpu_max: 97.2, memory_avg: 3_984_588_800, memory_max: 6_081_740_800, io_read_total: 9_961_472_000, io_write_total: 1_992_294_400, detected_via: 'framework_pattern', hostname: 'gpu-train-01' },
    // Currently running
    { execution_id: 'bexec-000023', job_name: 'inventory-sync', pid: 66100, language: 'java', scheduler: 'quartz', command: 'java -cp inventory-service.jar com.example.InventorySyncJob', state: 'RUNNING', started_at: new Date(now - 60_000).toISOString(), exit_code: 0, duration_ms: 60_000, cpu_avg: 18.0, cpu_max: 35.0, memory_avg: 251_658_240, memory_max: 314_572_800, io_read_total: 10_485_760, io_write_total: 5_242_880, detected_via: 'framework_pattern', hostname: 'batch-prod-01' },
    { execution_id: 'bexec-000024', job_name: 'hourly-backup', pid: 44100, language: 'shell', scheduler: 'cron', command: '/opt/scripts/backup.sh --target /data/backup --compress', state: 'RUNNING', started_at: new Date(now - 30_000).toISOString(), exit_code: 0, duration_ms: 30_000, cpu_avg: 8.0, cpu_max: 15.0, memory_avg: 50_331_648, memory_max: 67_108_864, io_read_total: 104_857_600, io_write_total: 52_428_800, detected_via: 'scheduler_child', hostname: 'batch-prod-01' },
  ];

  if (jobName) {
    return all.filter((e) => e.job_name === jobName);
  }
  return all;
}

export function getBatchExecutionDetail(id: string): BatchExecutionDetail | null {
  const execs = getBatchExecutions();
  const exec = execs.find((e) => e.execution_id === id);
  if (!exec) return null;

  const startTime = new Date(exec.started_at).getTime();
  const duration = exec.duration_ms;
  const points = 30;
  const interval = Math.max(duration / points, 1000);

  const cpuTimeline: [number, number][] = Array.from({ length: points }, (_, i) => [
    startTime + i * interval,
    Math.max(0, exec.cpu_avg + (Math.random() - 0.5) * 30),
  ]);

  const memoryTimeline: [number, number][] = Array.from({ length: points }, (_, i) => [
    startTime + i * interval,
    Math.max(0, exec.memory_avg + (Math.random() - 0.3) * exec.memory_avg * 0.3),
  ]);

  const ioTimeline: [number, number][] = Array.from({ length: points }, (_, i) => [
    startTime + i * interval,
    Math.max(0, (exec.io_read_total + exec.io_write_total) / points * (0.5 + Math.random())),
  ]);

  const detail: BatchExecutionDetail = {
    ...exec,
    cpu_timeline: cpuTimeline,
    memory_timeline: memoryTimeline,
    io_timeline: ioTimeline,
  };

  if (exec.language === 'java') {
    detail.jvm_metrics = {
      gc_count: 142,
      gc_time_ms: 3200,
      heap_used_bytes: exec.memory_max * 0.85,
      heap_max_bytes: exec.memory_max * 1.2,
      thread_count: 48,
      class_loaded: 12450,
    };
  }

  return detail;
}

export function getBatchSQLProfile(executionId: string): BatchSQLProfile[] {
  void executionId;
  return [
    { sql: 'SELECT o.order_id, o.customer_id, o.total_amount, oi.product_id FROM orders o JOIN order_items oi ON o.order_id = oi.order_id WHERE o.status = ? AND o.created_at >= ?', execution_count: 15420, total_time_ms: 45200, avg_time_ms: 2.93, max_time_ms: 125, min_time_ms: 0.8 },
    { sql: 'UPDATE settlement_log SET status = ?, settled_amount = ?, settled_at = NOW() WHERE batch_id = ? AND order_id = ?', execution_count: 15420, total_time_ms: 32100, avg_time_ms: 2.08, max_time_ms: 89, min_time_ms: 0.5 },
    { sql: 'INSERT INTO settlement_summary (batch_date, total_orders, total_amount, fee_amount, net_amount) VALUES (?, ?, ?, ?, ?)', execution_count: 1, total_time_ms: 15, avg_time_ms: 15, max_time_ms: 15, min_time_ms: 15 },
    { sql: 'SELECT c.customer_id, c.name, c.email, c.tier FROM customers c WHERE c.customer_id IN (?, ?, ?, ...)', execution_count: 3200, total_time_ms: 12800, avg_time_ms: 4.0, max_time_ms: 210, min_time_ms: 1.2 },
    { sql: 'SELECT p.payment_id, p.method, p.amount FROM payments p WHERE p.order_id = ? AND p.status = ?', execution_count: 15420, total_time_ms: 28500, avg_time_ms: 1.85, max_time_ms: 78, min_time_ms: 0.4 },
    { sql: 'INSERT INTO audit_log (action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, NOW())', execution_count: 30840, total_time_ms: 18200, avg_time_ms: 0.59, max_time_ms: 45, min_time_ms: 0.2 },
    { sql: 'SELECT SUM(amount) as total, COUNT(*) as cnt FROM refunds WHERE order_id = ? AND status = ?', execution_count: 1200, total_time_ms: 4800, avg_time_ms: 4.0, max_time_ms: 95, min_time_ms: 1.0 },
    { sql: 'UPDATE orders SET settlement_status = ?, settlement_batch_id = ? WHERE order_id = ?', execution_count: 15420, total_time_ms: 22100, avg_time_ms: 1.43, max_time_ms: 65, min_time_ms: 0.3 },
  ];
}

export function getBatchMethodProfile(executionId: string): BatchMethodProfile[] {
  void executionId;
  return [
    { class_name: 'com.example.batch.OrderSettlementTasklet', method_name: 'execute', full_name: 'com.example.batch.OrderSettlementTasklet.execute', call_count: 1, total_time_ms: 890000, avg_time_ms: 890000, self_time_ms: 2500 },
    { class_name: 'com.example.batch.OrderSettlementTasklet', method_name: 'processChunk', full_name: 'com.example.batch.OrderSettlementTasklet.processChunk', call_count: 155, total_time_ms: 850000, avg_time_ms: 5484, self_time_ms: 45000 },
    { class_name: 'com.example.repository.OrderRepository', method_name: 'findPendingOrders', full_name: 'com.example.repository.OrderRepository.findPendingOrders', call_count: 155, total_time_ms: 185000, avg_time_ms: 1194, self_time_ms: 185000 },
    { class_name: 'com.example.service.PaymentService', method_name: 'settlePayment', full_name: 'com.example.service.PaymentService.settlePayment', call_count: 15420, total_time_ms: 320000, avg_time_ms: 20.75, self_time_ms: 120000 },
    { class_name: 'com.example.service.AuditService', method_name: 'logSettlement', full_name: 'com.example.service.AuditService.logSettlement', call_count: 15420, total_time_ms: 95000, avg_time_ms: 6.16, self_time_ms: 95000 },
    { class_name: 'org.springframework.batch.core.step.tasklet.TaskletStep', method_name: 'doExecute', full_name: 'org.springframework.batch.core.step.tasklet.TaskletStep.doExecute', call_count: 1, total_time_ms: 892000, avg_time_ms: 892000, self_time_ms: 1200 },
    { class_name: 'com.example.batch.SettlementWriter', method_name: 'write', full_name: 'com.example.batch.SettlementWriter.write', call_count: 155, total_time_ms: 210000, avg_time_ms: 1355, self_time_ms: 25000 },
    { class_name: 'com.zaxxer.hikari.HikariDataSource', method_name: 'getConnection', full_name: 'com.zaxxer.hikari.HikariDataSource.getConnection', call_count: 31000, total_time_ms: 15500, avg_time_ms: 0.5, self_time_ms: 15500 },
  ];
}

export function getBatchXLogData(): BatchXLogPoint[] {
  const now = Date.now();
  const points: BatchXLogPoint[] = [];
  const jobs = ['daily-order-settlement', 'customer-email-campaign', 'data-warehouse-etl', 'hourly-backup', 'inventory-sync', 'ml-model-retrain', 'monthly-report-gen'];

  // Generate 30 days of scatter data
  for (let day = 0; day < 30; day++) {
    const dayOffset = day * DAY;

    // daily-order-settlement: ~15min, occasional failure
    if (day < 28) {
      const dur = 12 + Math.random() * 8;
      const failed = day === 5 || day === 18;
      points.push({
        execution_id: `xlog-dos-${day}`,
        job_name: 'daily-order-settlement',
        started_at: new Date(now - dayOffset - 22 * HOUR).toISOString(),
        duration_min: failed ? 5 : dur,
        status: failed ? 'failed' : (dur > 18 ? 'slow' : 'success'),
        io_total: 2_000_000_000 + Math.random() * 500_000_000,
      });
    }

    // customer-email-campaign: ~45min
    if (day < 25) {
      const dur = 38 + Math.random() * 15;
      points.push({
        execution_id: `xlog-cec-${day}`,
        job_name: 'customer-email-campaign',
        started_at: new Date(now - dayOffset - 15 * HOUR).toISOString(),
        duration_min: dur,
        status: dur > 50 ? 'slow' : 'success',
        io_total: 100_000_000 + Math.random() * 50_000_000,
      });
    }

    // data-warehouse-etl: ~45min, occasional failure
    if (day < 28) {
      const dur = 35 + Math.random() * 20;
      const failed = day === 8;
      points.push({
        execution_id: `xlog-etl-${day}`,
        job_name: 'data-warehouse-etl',
        started_at: new Date(now - dayOffset - 20 * HOUR).toISOString(),
        duration_min: failed ? 3 : dur,
        status: failed ? 'failed' : (dur > 50 ? 'slow' : 'success'),
        io_total: 5_000_000_000 + Math.random() * 2_000_000_000,
      });
    }

    // hourly-backup: ~3min, many per day
    for (let h = 0; h < 24; h++) {
      if (day > 7) continue; // only recent 7 days
      const dur = 2.5 + Math.random() * 1.5;
      const failed = day === 0 && h === 20;
      points.push({
        execution_id: `xlog-hb-${day}-${h}`,
        job_name: 'hourly-backup',
        started_at: new Date(now - dayOffset - h * HOUR).toISOString(),
        duration_min: failed ? 0.17 : dur,
        status: failed ? 'failed' : 'success',
        io_total: 500_000_000 + Math.random() * 100_000_000,
      });
    }

    // inventory-sync: ~2min, many per day
    for (let slot = 0; slot < 48; slot++) {
      if (day > 3) continue; // only recent 3 days
      const dur = 1.5 + Math.random() * 1.0;
      const failed = day === 0 && slot === 44;
      points.push({
        execution_id: `xlog-is-${day}-${slot}`,
        job_name: 'inventory-sync',
        started_at: new Date(now - dayOffset - slot * 30 * 60_000).toISOString(),
        duration_min: failed ? 0.5 : dur,
        status: failed ? 'failed' : 'success',
        io_total: 50_000_000 + Math.random() * 20_000_000,
      });
    }

    // ml-model-retrain: ~150min, weekly
    if (day % 7 === 0 && day < 28) {
      const dur = 140 + Math.random() * 25;
      points.push({
        execution_id: `xlog-ml-${day}`,
        job_name: 'ml-model-retrain',
        started_at: new Date(now - dayOffset - 5 * DAY).toISOString(),
        duration_min: dur,
        status: dur > 160 ? 'slow' : 'success',
        io_total: 10_000_000_000 + Math.random() * 2_000_000_000,
      });
    }
  }

  return points;
}

export function getBatchAlertRules(): BatchAlertRule[] {
  const now = Date.now();
  return [
    {
      id: 'ba-rule-001',
      name: 'Order Settlement SLA',
      target_job: 'daily-order-settlement',
      enabled: true,
      conditions: { duration_threshold_min: 60, sla_deadline: '03:00' },
      channels: { slack_webhook: 'https://hooks.slack.com/services/T00/B00/xxx' },
      cooldown_min: 30,
      last_triggered_at: new Date(now - 3 * DAY).toISOString(),
      created_at: new Date(now - 30 * DAY).toISOString(),
    },
    {
      id: 'ba-rule-002',
      name: 'Batch Failure Alert',
      target_job: '*',
      enabled: true,
      conditions: { failure_threshold: 1 },
      channels: { slack_webhook: 'https://hooks.slack.com/services/T00/B00/xxx', email: ['ops-team@company.com', 'batch-admin@company.com'] },
      cooldown_min: 15,
      last_triggered_at: new Date(now - 4 * HOUR).toISOString(),
      created_at: new Date(now - 60 * DAY).toISOString(),
    },
    {
      id: 'ba-rule-003',
      name: 'ETL Slow Warning',
      target_job: 'data-warehouse-etl',
      enabled: true,
      conditions: { duration_threshold_min: 120 },
      channels: { pagerduty_key: 'pd-key-xxxx' },
      cooldown_min: 60,
      last_triggered_at: new Date(now - 10 * DAY).toISOString(),
      created_at: new Date(now - 45 * DAY).toISOString(),
    },
    {
      id: 'ba-rule-004',
      name: 'High CPU Usage',
      target_job: '*',
      enabled: true,
      conditions: { cpu_threshold: 90 },
      channels: { email: ['ops-team@company.com'] },
      cooldown_min: 30,
      last_triggered_at: new Date(now - 70 * HOUR).toISOString(),
      created_at: new Date(now - 20 * DAY).toISOString(),
    },
    {
      id: 'ba-rule-005',
      name: 'ML Training Timeout',
      target_job: 'ml-model-retrain',
      enabled: false,
      conditions: { duration_threshold_min: 180 },
      channels: { slack_webhook: 'https://hooks.slack.com/services/T00/B00/yyy', email: ['ml-team@company.com'] },
      cooldown_min: 120,
      created_at: new Date(now - 15 * DAY).toISOString(),
    },
    {
      id: 'ba-rule-006',
      name: 'Backup Failure',
      target_job: 'hourly-backup',
      enabled: true,
      conditions: { failure_threshold: 2 },
      channels: { webhook_url: 'https://internal.company.com/hooks/batch-alerts' },
      cooldown_min: 60,
      last_triggered_at: new Date(now - 2 * DAY).toISOString(),
      created_at: new Date(now - 25 * DAY).toISOString(),
    },
  ];
}

export function getBatchAlertHistory(): BatchAlertHistory[] {
  const now = Date.now();
  return [
    {
      alert_id: 'ba-hist-001',
      rule_id: 'ba-rule-002',
      rule_name: 'Batch Failure Alert',
      job_name: 'hourly-backup',
      execution_id: 'bexec-000014',
      message: 'hourly-backup failed with exit code 2: disk full /data/backup',
      severity: 'critical',
      channels_notified: ['slack', 'email'],
      triggered_at: new Date(now - 4 * HOUR).toISOString(),
      resolved_at: new Date(now - 3 * HOUR).toISOString(),
    },
    {
      alert_id: 'ba-hist-002',
      rule_id: 'ba-rule-002',
      rule_name: 'Batch Failure Alert',
      job_name: 'inventory-sync',
      execution_id: 'bexec-000020',
      message: 'inventory-sync failed with exit code 1: DB connection pool exhausted',
      severity: 'critical',
      channels_notified: ['slack', 'email'],
      triggered_at: new Date(now - 2 * HOUR).toISOString(),
    },
    {
      alert_id: 'ba-hist-003',
      rule_id: 'ba-rule-004',
      rule_name: 'High CPU Usage',
      job_name: 'daily-order-settlement',
      execution_id: 'bexec-000003',
      message: 'CPU max reached 90.3% during daily-order-settlement execution',
      severity: 'warning',
      channels_notified: ['email'],
      triggered_at: new Date(now - 70 * HOUR).toISOString(),
      resolved_at: new Date(now - 70 * HOUR + 300_000).toISOString(),
    },
    {
      alert_id: 'ba-hist-004',
      rule_id: 'ba-rule-001',
      rule_name: 'Order Settlement SLA',
      job_name: 'daily-order-settlement',
      execution_id: 'bexec-000003',
      message: 'daily-order-settlement SLA breach: failed before deadline 03:00',
      severity: 'critical',
      channels_notified: ['slack'],
      triggered_at: new Date(now - 3 * DAY).toISOString(),
      resolved_at: new Date(now - 3 * DAY + HOUR).toISOString(),
    },
    {
      alert_id: 'ba-hist-005',
      rule_id: 'ba-rule-003',
      rule_name: 'ETL Slow Warning',
      job_name: 'data-warehouse-etl',
      message: 'data-warehouse-etl duration exceeded 120min threshold (actual: 135min)',
      severity: 'warning',
      channels_notified: ['pagerduty'],
      triggered_at: new Date(now - 10 * DAY).toISOString(),
      resolved_at: new Date(now - 10 * DAY + 15 * 60_000).toISOString(),
    },
    {
      alert_id: 'ba-hist-006',
      rule_id: 'ba-rule-006',
      rule_name: 'Backup Failure',
      job_name: 'hourly-backup',
      message: 'hourly-backup has 2+ consecutive failures',
      severity: 'critical',
      channels_notified: ['webhook'],
      triggered_at: new Date(now - 2 * DAY).toISOString(),
      resolved_at: new Date(now - 2 * DAY + 30 * 60_000).toISOString(),
    },
  ];
}
