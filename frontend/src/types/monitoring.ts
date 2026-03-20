// ═══════════════════════════════════════════════════════════════
// Core Monitoring Types
// Reference: DOCS/UI_DESIGN.md Appendix A
// ═══════════════════════════════════════════════════════════════

export type Status = 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown';
export type Severity = 'critical' | 'warning' | 'info';
export type Environment = 'production' | 'staging' | 'development';

export interface Project {
  id: string;
  name: string;
  description: string;
  environment: Environment;
  tags: Record<string, string>;
  hostCount: number;
  serviceCount: number;
  aiServiceCount: number;
  alertCount: number;
  errorRate: number;
  p95Latency: number;
  sloCompliance: number;
  status: Status;
  lastActivity: string;
}

export interface Host {
  id: string;
  hostname: string;
  os: string;
  cpuCores: number;
  memoryGB: number;
  status: Status;
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
  netIO: string;
  agent?: AgentInfo;
  middlewares: Middleware[];
  gpus?: GPUInfo[];
}

export interface Middleware {
  type: 'web' | 'was' | 'db' | 'cache' | 'mq' | 'llm' | 'vectordb';
  name: string;
  version: string;
  port: number;
  status: 'running' | 'stopped' | 'error';
}

export interface GPUInfo {
  index: number;
  model: string;
  vramTotal: number;
  vramUsed: number;
  vramPercent: number;
  temperature: number;
  powerDraw: number;
  smOccupancy: number;
}

export interface Service {
  id: string;
  name: string;
  framework: string;
  language: string;
  hostIds: string[];
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  rpm: number;
  errorRate: number;
  status: Status;
}

export interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  rpm: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  errorRate: number;
  contribution: number; // 0-100%
}

export interface DeploymentEvent {
  id: string;
  version: string;
  timestamp: string;
  status: 'success' | 'failed' | 'rolling-back' | 'in-progress';
  deployer: string;
  commitHash: string;
  description: string;
  duration: number; // seconds
}

export interface ServiceDependency {
  serviceId: string;
  serviceName: string;
  direction: 'upstream' | 'downstream';
  rpm: number;
  errorRate: number;
  latencyP95: number;
  status: Status;
}

export type TransactionStatus = 'normal' | 'slow' | 'very_slow' | 'error';

export interface TransactionSpan {
  spanId: string;
  parentId: string;
  name: string;
  startOffset: number; // ms from root
  duration: number; // ms
  status: 'ok' | 'error';
  attributes: Record<string, string | number>;
}

export interface Transaction {
  traceId: string;
  rootSpanId: string;
  timestamp: number; // epoch ms
  elapsed: number; // ms
  service: string;
  endpoint: string;
  status: TransactionStatus;
  statusCode: number;
  metrics: {
    ttft_ms: number;
    tps: number;
    tokens_generated: number;
    guardrail_action: 'PASS' | 'BLOCK';
  };
  spans: TransactionSpan[];
}

export interface TraceSpan {
  spanId: string;
  parentSpanId: string;
  traceId: string;
  service: string;
  name: string;
  kind: 'server' | 'client' | 'internal' | 'producer' | 'consumer';
  startTime: number; // epoch ms
  duration: number; // ms
  status: 'ok' | 'error' | 'unset';
  statusMessage?: string;
  attributes: Record<string, string | number>;
  events: { name: string; timestamp: number; attributes?: Record<string, string | number> }[];
}

export interface Trace {
  traceId: string;
  rootService: string;
  rootEndpoint: string;
  startTime: number; // epoch ms
  duration: number; // ms
  spanCount: number;
  serviceCount: number;
  errorCount: number;
  spans: TraceSpan[];
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  id: string;
  timestamp: number; // epoch ms
  level: LogLevel;
  service: string;
  hostname: string;
  message: string;
  traceId?: string;
  spanId?: string;
  attributes: Record<string, string | number>;
}

export interface LogPattern {
  id: string;
  pattern: string;
  count: number;
  level: LogLevel;
  services: string[];
  sample: string;
  firstSeen: number;
  lastSeen: number;
}

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit: string;
  labels: string[];
  category: 'system' | 'http' | 'llm' | 'vectordb' | 'gpu' | 'custom';
}

export interface AIService {
  id: string;
  name: string;
  type: 'llm' | 'rag' | 'agent' | 'embedding';
  model?: string;
  hostIds: string[];
  ttftP95?: number;
  tpsP50?: number;
  gpuVramPercent?: number;
  errorRate?: number;
  costPerHour?: number;
  guardrailBlockRate?: number;
  status: Status;
}

export interface AgentInfo {
  id: string;
  hostId: string;
  version: string;
  status: 'healthy' | 'degraded' | 'offline' | 'upgrading';
  plugins: PluginInfo[];
  lastHeartbeat: string;
  lastCollection: string;
  mode: 'full' | 'collect-only' | 'collect-export';
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'inactive' | 'error';
  itemsCovered: string[];
}

export interface AlertEvent {
  id: string;
  severity: Severity;
  ruleName: string;
  target: string;
  message: string;
  value: string;
  timestamp: string;
  status: 'firing' | 'resolved' | 'acknowledged';
}

export interface Incident {
  id: string;
  title: string;
  severity: Severity;
  status: 'open' | 'acknowledged' | 'resolved';
  assignee?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface TimeRange {
  label: string;
  value: string;
  seconds: number;
}

export const TIME_RANGES: TimeRange[] = [
  { label: 'Last 5m', value: '5m', seconds: 300 },
  { label: 'Last 15m', value: '15m', seconds: 900 },
  { label: 'Last 1h', value: '1h', seconds: 3600 },
  { label: 'Last 6h', value: '6h', seconds: 21600 },
  { label: 'Last 24h', value: '24h', seconds: 86400 },
  { label: 'Last 7d', value: '7d', seconds: 604800 },
];
