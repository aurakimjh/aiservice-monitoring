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

export type GPUVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'virtual' | 'unknown';

export interface GPUInfo {
  index: number;
  model: string;
  vendor?: GPUVendor;
  vramTotal: number;
  vramUsed: number;
  vramPercent: number;
  temperature: number;
  powerDraw: number;
  smOccupancy: number;
  coreFreqMHz?: number;
  isVirtual?: boolean;
  migEnabled?: boolean;
  migInstance?: string;
  driverVersion?: string;
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

// AI Service detail data

export interface RAGPipelineStage {
  name: string;
  avgDuration: number;
  p95Duration: number;
  percentage: number;
  color: string;
}

export interface RAGPipelineData {
  stages: RAGPipelineStage[];
  totalDuration: number;
  searchQuality: { relevancyScore: number; topKHitRate: number; emptyResultRate: number; faithfulness: number; answerRelevancy: number };
  embeddingPerf: { model: string; dimensions: number; batchSize: number; p95Latency: number; throughput: number; cacheHitRate: number };
  vectorDB: { engine: string; collection: string; vectorCount: number; segments: number; indexType: string; diskUsage: string; searchP99: number; insertP99: number; availability: number };
}

export interface AgentExecution {
  id: string;
  startTime: number;
  duration: number;
  steps: number;
  toolCalls: number;
  cost: number;
  status: 'success' | 'warning' | 'error';
  iterationsUsed: number;
  maxIterations: number;
  traceId: string;
}

export type GuardrailViolationType = 'pii_detection' | 'harmful_content' | 'sql_injection' | 'prompt_injection' | 'copyright' | 'other';

export interface GuardrailData {
  totalChecks: number;
  blockCount: number;
  blockRate: number;
  violations: { type: GuardrailViolationType; label: string; count: number }[];
  latencyContribution: number;
}

// Agent Fleet types

export interface CollectionJob {
  id: string;
  type: 'scheduled' | 'ai_diagnostic' | 'emergency';
  target: string;
  targetCount: number;
  items: number;
  progress: number; // 0-100
  status: 'running' | 'completed' | 'failed';
  startTime: number;
}

export interface AgentPlugin {
  name: string;
  version: string;
  activeAgents: number;
  totalAgents: number;
  collectItems: string;
  status: Status;
}

// Diagnostic types

export interface DiagnosticRun {
  id: string;
  scope: 'full' | 'ai' | 'infra';
  items: number;
  passed: number;
  warned: number;
  failed: number;
  status: Status;
  timestamp: number;
  duration: number; // seconds
}

export interface DiagnosticItem {
  id: string;
  category: 'os' | 'middleware' | 'gpu' | 'llm' | 'vectordb' | 'guardrail' | 'agent';
  name: string;
  result: 'pass' | 'warn' | 'fail';
  value: string;
  threshold: string;
  recommendation?: string;
}

// Alert & Incident types

export interface AlertPolicy {
  id: string;
  name: string;
  severity: Severity;
  target: string;
  conditionType: 'metric' | 'trace' | 'log' | 'composite';
  condition: string;
  thresholdType: 'static' | 'dynamic' | 'forecast';
  channels: string[];
  enabled: boolean;
  lastTriggered?: number;
}

export interface IncidentEvent {
  timestamp: number;
  type: 'alert' | 'notification' | 'ack' | 'action' | 'resolve' | 'escalation';
  icon: string;
  message: string;
  actor?: string;
}

export interface IncidentDetail {
  id: string;
  title: string;
  severity: Severity;
  status: 'open' | 'acknowledged' | 'resolved';
  assignee?: string;
  createdAt: number;
  resolvedAt?: number;
  duration?: number;
  relatedAlertPolicy: string;
  timeline: IncidentEvent[];
  rca?: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'slack' | 'email' | 'pagerduty' | 'webhook' | 'teams';
  config: string;
  enabled: boolean;
}

// Phase 14: SLO, Cost, Executive

export interface SLODefinition {
  id: string;
  name: string;
  service: string;
  sli: string;
  target: number; // e.g., 99.9
  window: '7d' | '30d' | '90d';
  current: number;
  errorBudgetRemaining: number; // percentage
  status: 'met' | 'at_risk' | 'breached';
  burnRate: number;
}

export interface CostBreakdown {
  category: string;
  subcategory: string;
  amount: number;
  trend: number; // percent change
  unit: string;
}

export interface ExecutiveSummary {
  overallHealth: Status;
  sloCompliance: number;
  totalServices: number;
  activeIncidents: number;
  mttr: number; // minutes
  totalCostPerDay: number;
  costTrend: number;
  topIssues: { title: string; severity: Severity; age: string }[];
}

// Phase 14-1: Custom Dashboard Builder

export type WidgetType =
  | 'kpi' | 'timeseries' | 'bar' | 'pie' | 'gauge' | 'table' | 'text'
  | 'apm-tps' | 'apm-tps-daily' | 'apm-users-daily' | 'apm-response-time'
  | 'apm-active-txn' | 'apm-active-status' | 'apm-txn-speed' | 'apm-concurrent-users'
  | 'ai-pipeline-waterfall' | 'ai-ttft-trend' | 'ai-token-cost';
export type WidgetSize = '1x1' | '2x1' | '1x2' | '2x2';
export type WidgetViewMode = 'sum' | 'individual';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  metric?: string;
  query?: string;           // PromQL query (used when connecting to Prometheus)
  content?: string;         // for text widget
  viewMode?: WidgetViewMode; // SUM(모아보기) vs individual(인스턴스별)
  serviceId?: string;        // 서비스 ID (인스턴스별 메트릭 조회용)
  projectId?: string;        // 프로젝트 필터 (빈값 = topbar 상속)
  hostId?: string;           // 호스트 필터
  refreshInterval?: number;  // per-widget refresh (ms), 0 = use global
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  template?: string;
  widgets: WidgetConfig[];
  createdAt: number;
  updatedAt: number;
}

// Phase 14-4: Investigation Notebook

export type NotebookCellType = 'markdown' | 'query' | 'chart';

export interface NotebookCell {
  id: string;
  type: NotebookCellType;
  content: string; // markdown text, PromQL query, or metric name
  output?: string; // rendered output or query result
}

export interface Notebook {
  id: string;
  title: string;
  description: string;
  author: string;
  relatedIncident?: string;
  cells: NotebookCell[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// Phase 14-6: Multi-tenant

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  logo?: string;
  primaryColor?: string;
  projectCount: number;
  userCount: number;
  hostCount: number;
  monthlyUsage: number; // dollars
  monthlyLimit: number;
  dataRetentionDays: number;
  createdAt: number;
  contactEmail: string;
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

// Fleet Group Management
export interface AgentGroup {
  id: string;
  name: string;
  description: string;
  agentIds: string[];
  tags: string[];
  createdAt: string;
}

// 25-1-3: SDK Detection Alert
export interface SDKAlert {
  id: string;
  agentId: string;
  hostname: string;
  language: string;
  sdkName: string;
  sdkVersion: string;
  otelEnabled: boolean;
  acknowledged: boolean;
  detectedAt: string;
}

// 25-3-2: Agent Config Record
export interface ConfigHistoryEntry {
  version: number;
  config: Record<string, unknown>;
  changedAt: string;
  changedBy: string;
}

export interface AgentConfigRecord {
  agentId: string;
  version: number;
  config: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string;
  history: ConfigHistoryEntry[];
}

// OTA Update Status
export type UpdatePhase = 'pending' | 'downloading' | 'installing' | 'completed' | 'failed' | 'rolled_back';

export interface UpdateStatus {
  agentId: string;
  hostname: string;
  currentVersion: string;
  targetVersion: string;
  phase: UpdatePhase;
  progress: number; // 0–100
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

// Collection Schedule
export interface CollectionSchedule {
  id: string;
  name: string;
  targetType: 'all' | 'group' | 'agent';
  targetId?: string; // groupId or agentId when targetType != 'all'
  cron: string; // e.g. "*/30 * * * *"
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

// Fleet API response — AgentInfo + host context (returned by Collection Server)
export interface FleetAgent {
  id: string;
  hostId: string;
  hostname: string;
  os: string;
  version: string;
  status: 'healthy' | 'degraded' | 'offline' | 'upgrading';
  mode: 'full' | 'collect-only' | 'collect-export';
  plugins: PluginInfo[];
  lastHeartbeat: string; // ISO string
  lastCollection: string; // ISO string
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

// ── Phase 19: AI Value Enhancement ──────────────────────────────────────

// 19-1: LLM Evaluation
export type EvalMetricName = 'relevancy' | 'faithfulness' | 'coherence' | 'toxicity' | 'latency' | 'cost';
export type EvalJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface EvalMetricScore {
  metric: EvalMetricName;
  score: number;
  threshold?: number;
}

export interface EvalSample {
  id: string;
  prompt: string;
  response: string;
  reference?: string;
  scores: EvalMetricScore[];
  latencyMs: number;
  tokenCount: number;
  judgeModel: string;
  pass: boolean;
}

export interface EvalJob {
  id: string;
  name: string;
  status: EvalJobStatus;
  model: string;
  judgeModel: string;
  datasetName: string;
  datasetSize: number;
  metrics: EvalMetricName[];
  aggregateScores: EvalMetricScore[];
  samplesProcessed: number;
  createdAt: number;
  completedAt?: number;
  duration?: number;
}

export interface ABTestComparison {
  id: string;
  name: string;
  modelA: string;
  modelB: string;
  datasetName: string;
  sampleCount: number;
  status: EvalJobStatus;
  metricsA: EvalMetricScore[];
  metricsB: EvalMetricScore[];
  winRateA: number;
  winRateB: number;
  createdAt: number;
}

// 19-2: Prompt Hub
export interface PromptVersion {
  version: number;
  systemPrompt: string;
  userTemplate: string;
  variables: string[];
  author: string;
  createdAt: number;
  commitMessage: string;
  performance: {
    avgLatencyMs: number;
    avgQualityScore: number;
    avgTokens: number;
    usageCount: number;
  };
}

export interface PromptEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  model: string;
  currentVersion: number;
  versions: PromptVersion[];
  totalUsage: number;
  avgQualityScore: number;
  isPublic: boolean;
  owner: string;
  createdAt: number;
  updatedAt: number;
}

// 19-3: AI Cost Optimization
export interface ModelCostProfile {
  model: string;
  provider: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  avgLatencyMs: number;
  qualityScore: number;
  dailyTokens: number;
  dailyCost: number;
  costEfficiency: number;
}

export interface CacheAnalysis {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  estimatedSavings: number;
  potentialSavings: number;
  topCacheablePatternsCount: number;
}

export interface CostRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'model_switch' | 'cache' | 'token_reduction' | 'batch' | 'routing';
  title: string;
  description: string;
  currentCost: number;
  estimatedSaving: number;
  effort: 'low' | 'medium' | 'high';
  implemented: boolean;
}

export interface BudgetAlert {
  id: string;
  name: string;
  threshold: number;
  currentSpend: number;
  period: 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
  lastTriggered?: number;
}

// ── Phase 20: 운영 고도화 ───────────────────────────────────────────

// 20-1: Anomaly Detection
export type AnomalySeverity = 'critical' | 'warning' | 'info';
export type AnomalyStatus = 'active' | 'resolved' | 'acknowledged';

export interface Anomaly {
  id: string;
  metric: string;
  service: string;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  detectedAt: number;
  resolvedAt?: number;
  value: number;
  expected: number;
  deviation: number;
  rootCause?: string;
  recommendation?: string;
}

export interface DynamicThreshold {
  metric: string;
  timestamps: number[];
  values: number[];
  upperBand: number[];
  lowerBand: number[];
  baseline: number[];
  anomalyRanges: { start: number; end: number }[];
}

// 20-2: Report Generation
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: 'weekly' | 'monthly' | 'diagnostic' | 'custom';
  sections: string[];
  estimatedPages: number;
}

export interface GeneratedReport {
  id: string;
  templateId: string;
  templateName: string;
  generatedAt: number;
  period: string;
  pages: number;
  format: 'pdf' | 'html';
  status: 'completed' | 'generating' | 'failed';
  sizeKB: number;
}

// 20-3: Synthetic Monitoring
export type ProbeStatus = 'healthy' | 'degraded' | 'down';

export interface SyntheticProbe {
  id: string;
  name: string;
  type: 'http' | 'llm' | 'rag' | 'api';
  target: string;
  interval: string;
  status: ProbeStatus;
  uptime: number;
  avgLatencyMs: number;
  lastCheck: number;
  lastError?: string;
  qualityScore?: number;
}

export interface ProbeResult {
  probeId: string;
  timestamp: number;
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  qualityScore?: number;
  error?: string;
}

// ── Phase 24: Java/.NET SDK + Method Profiling ──────────────────────

export interface SqlBindingInfo {
  query: string;
  bindings: (string | number | null)[];
  executionMs: number;
  rowCount: number;
  slow: boolean;
}

export interface HttpCallInfo {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
}

export interface FileIoInfo {
  path: string;
  operation: 'read' | 'write';
  sizeBytes: number;
  durationMs: number;
}

export interface MethodProfileNode {
  id: string;
  name: string;
  className: string;
  durationMs: number;
  selfTimeMs: number;
  children: MethodProfileNode[];
  sql?: SqlBindingInfo;
  http?: HttpCallInfo;
  fileIo?: FileIoInfo;
  slow: boolean;
}

export interface MethodProfile {
  traceId: string;
  language: 'java' | 'dotnet' | 'python' | 'go' | 'nodejs';
  serviceName: string;
  rootNode: MethodProfileNode;
  totalMethods: number;
  slowQueries: number;
  totalDurationMs: number;
}

// ── Phase 25: Server Groups + SDK Detection + Central Config ────────

export type ReflectionLevel = 'hot' | 'restart' | 'app';

export interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  value: string | number | boolean;
  defaultValue: string | number | boolean;
  reflectionLevel: ReflectionLevel;
  description: string;
  options?: string[];
}

export interface ConfigSection {
  name: string;
  label: string;
  fields: ConfigField[];
}

export interface AgentConfig {
  agentId: string;
  version: number;
  sections: ConfigSection[];
  updatedAt: number;
  updatedBy: string;
}

export interface ConfigRevision {
  version: number;
  author: string;
  timestamp: number;
  changes: { field: string; oldValue: string; newValue: string }[];
  message: string;
}

export interface SDKDetection {
  id: string;
  agentId: string;
  hostname: string;
  language: 'java' | 'dotnet' | 'python' | 'go' | 'nodejs';
  framework: string;
  frameworkVersion: string;
  detectedAt: number;
  autoInstrumented: boolean;
}

export interface GroupDashboard {
  groupId: string;
  groupName: string;
  agentCount: number;
  healthyCount: number;
  avgCpu: number;
  avgMemory: number;
  agents: { id: string; hostname: string; status: string; version: string; cpu: number; memory: number; lastHeartbeat: number }[];
}

// ── Phase 26: Middleware Runtime + Redis/Cache + Message Queue ───────

export interface ThreadPoolMetrics {
  name: string;
  activeThreads: number;
  maxThreads: number;
  queuedTasks: number;
  completedTasks: number;
  utilization: number;
}

export interface ConnectionPoolMetrics {
  name: string;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  waitCount: number;
  utilization: number;
  leakSuspected: boolean;
}

export interface EventLoopMetrics {
  lagMs: number;
  lagP99Ms: number;
  activeHandles: number;
  activeRequests: number;
}

// Phase 39: JDK 21 Virtual Thread types
export interface CarrierPoolStats {
  parallelism: number;
  activeCount: number;
  queuedTasks: number;
  utilization: number; // 0-1
}

export interface VTPinnedStack {
  id: string;
  durationMs: number;
  stackTrace: string;
  topMethod: string;
  capturedAt: string;
}

export interface VTAlertRecord {
  alertId: string;
  severity: 'warning' | 'critical';
  rule: string;
  message: string;
  value: number;
  threshold: number;
  firedAt: string;
  acked: boolean;
}

export interface VirtualThreadSnapshot {
  activeCount: number;
  waitingCount: number;
  mountedCount: number;
  createdPerMin: number;
  submitFailedRate: number;
  pinnedCount: number;
  pinnedP99Ms: number;
  carrierPool: CarrierPoolStats;
  submitFailedHistory: number[]; // 30 × 1-min buckets
  activeHistory: number[];       // 30 × 1-min buckets
  collectedAt: string;
}

export interface MiddlewareRuntime {
  hostId: string;
  hostname: string;
  language: 'java' | 'dotnet' | 'nodejs' | 'python' | 'go';
  jdkVersion?: string;    // e.g. "21.0.2" — Phase 39 badge
  threadPools?: ThreadPoolMetrics[];
  connectionPools?: ConnectionPoolMetrics[];
  eventLoop?: EventLoopMetrics;
  goroutines?: number;
  workers?: { active: number; max: number; idle: number };
  virtualThreads?: VirtualThreadSnapshot; // Phase 39: JDK 21+ only
  vtAlerts?: VTAlertRecord[];             // Phase 39: active alerts
  vtPinnedStacks?: VTPinnedStack[];       // Phase 39: top pinning stacks
}

export interface RedisMetrics {
  id: string;
  name: string;
  engine: 'redis' | 'valkey' | 'keydb' | 'dragonfly' | 'memcached';
  version: string;
  host: string;
  port: number;
  status: 'healthy' | 'warning' | 'critical';
  memoryUsedMB: number;
  memoryMaxMB: number;
  memoryPercent: number;
  hitRate: number;
  evictions: number;
  connectedClients: number;
  opsPerSec: number;
  slowlogCount: number;
  replicationLag?: number;
  role: 'master' | 'replica' | 'standalone';
  uptimeHours: number;
}

export interface MessageQueueMetrics {
  id: string;
  name: string;
  type: 'kafka' | 'rabbitmq' | 'activemq';
  status: 'healthy' | 'warning' | 'critical';
  brokers: number;
  topics: number;
  totalMessages: number;
  messagesPerSec: number;
  consumerGroups: number;
  consumerLag: number;
  partitions?: number;
  replicationFactor?: number;
}

// ═══════════════════════════════════════════════════════════════
// Redis Cluster Types (Phase 26-5-6)
// ═══════════════════════════════════════════════════════════════

export interface RedisClusterMetrics {
  engine: string;
  host: string;
  port: number;
  clusterEnabled: boolean;
  clusterState: 'ok' | 'fail';
  clusterSize: number;
  slotsAssigned: number;
  slotsOK: number;
  slotsPfail: number;
  slotsFail: number;
  knownNodes: number;
  connectedSlaves: number;
  migrationStatus?: string;
}

// ═══════════════════════════════════════════════════════════════
// Cache Alert Rule Types (Phase 26-5-7)
// ═══════════════════════════════════════════════════════════════

export interface CacheAlertRule {
  name: string;
  description: string;
  condition: string;
  threshold: number;
  severity: 'warning' | 'critical';
  actions: string[];
}

export interface CacheAlertEvent {
  alertId: string;
  ruleName: string;
  instanceId: string;
  host: string;
  port: number;
  engine: string;
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  triggeredAt: string;
  actions: string[];
}

// ═══════════════════════════════════════════════════════════════
// Middleware Runtime Extended Types (Phase 26-4)
// ═══════════════════════════════════════════════════════════════

export interface GoroutineStats {
  current: number;
  baseline: number;
  leakThreshold: number;
  leakSuspected: boolean;
  pprofUrl?: string;
  warningLevel: 'ok' | 'warning' | 'critical';
}

export interface ConnPoolAlertEvent {
  alertId: string;
  poolName: string;
  vendor: string;
  severity: 'warning' | 'critical';
  condition: string;
  value: number;
  threshold: number;
  message: string;
  triggeredAt: string;
  action: string;
}

// ═══════════════════════════════════════════════════════════════
// Continuous Profiling Types (Phase 21-1)
// ═══════════════════════════════════════════════════════════════

export type ProfileLanguage = 'go' | 'python' | 'java' | 'dotnet' | 'nodejs';
export type ProfileType = 'cpu' | 'memory' | 'goroutine' | 'thread' | 'lock' | 'alloc';
export type ProfileFormat = 'pprof' | 'jfr' | 'collapsed';

export interface ProfileMetadata {
  profile_id: string;
  agent_id: string;
  service_name: string;
  language: ProfileLanguage;
  profile_type: ProfileType;
  format: ProfileFormat;
  duration_sec: number;
  sample_count: number;
  size_bytes: number;
  labels?: Record<string, string>;
  trace_id?: string;
  span_id?: string;
  started_at: string;
  ended_at?: string;
}

export interface FlameGraphNode {
  name: string;
  fullName: string;
  value: number;
  selfValue: number;
  children: FlameGraphNode[];
}

export interface FlameGraphData {
  profileId: string;
  profileType: string;
  language: string;
  serviceName: string;
  totalSamples: number;
  durationSec: number;
  root: FlameGraphNode;
}

export interface FlameGraphDiffNode {
  name: string;
  fullName: string;
  baseValue: number;
  targetValue: number;
  delta: number;
  children: FlameGraphDiffNode[];
}

export interface FlameGraphDiff {
  base_profile_id: string;
  target_profile_id: string;
  root: FlameGraphDiffNode;
}

// ═══════════════════════════════════════════════════════════════
// AI Copilot Types (Phase 22-1)
// ═══════════════════════════════════════════════════════════════

export type CopilotMessageRole = 'user' | 'assistant' | 'system';

export interface CopilotMessage {
  id: string;
  role: CopilotMessageRole;
  content: string;
  timestamp: number;
  promql?: string;
  chartData?: { label: string; data: [number, number][] }[];
  suggestions?: string[];
  metricRefs?: string[];
}

export interface CopilotSuggestion {
  id: string;
  text: string;
  category: 'performance' | 'cost' | 'reliability' | 'gpu';
}

// ═══════════════════════════════════════════════════════════════
// Topology Auto-Discovery Types (Phase 22-2)
// ═══════════════════════════════════════════════════════════════

export type DiscoveryProtocol = 'http' | 'grpc' | 'sql' | 'redis' | 'kafka' | 'unknown';

export interface TopologyChange {
  id: string;
  timestamp: number;
  type: 'connection_added' | 'connection_removed' | 'service_added' | 'service_removed';
  sourceService: string;
  targetService?: string;
  protocol?: DiscoveryProtocol;
  description: string;
}

export interface DiscoveredEdge {
  source: string;
  target: string;
  rpm: number;
  errorRate: number;
  p95: number;
  protocol: DiscoveryProtocol;
  firstSeen: number;
  isNew: boolean;
  isRemoved: boolean;
}

export interface DiscoveredTopology {
  nodes: { id: string; name: string; layer: string; status: Status; rpm: number; errorRate: number; p95: number; framework?: string }[];
  edges: DiscoveredEdge[];
  lastScanAt: number;
  totalConnections: number;
}

// ═══════════════════════════════════════════════════════════════
// Fine-tuning Monitoring Types (Phase 22-3)
// ═══════════════════════════════════════════════════════════════

export type TrainingJobStatus = 'running' | 'completed' | 'failed' | 'queued' | 'paused';

export interface TrainingJob {
  id: string;
  name: string;
  model: string;
  baseModel: string;
  dataset: string;
  status: TrainingJobStatus;
  startedAt: number;
  completedAt?: number;
  currentEpoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  learningRate: number;
  batchSize: number;
  gpuIds: string[];
  trainLoss: number;
  valLoss: number;
  trainAccuracy: number;
  valAccuracy: number;
  gpuUtilization: number;
  gpuMemoryUsed: number;
  tokensPerSecond: number;
  estimatedTimeRemaining?: number;
}

export interface TrainingCheckpoint {
  id: string;
  jobId: string;
  epoch: number;
  step: number;
  trainLoss: number;
  valLoss: number;
  valAccuracy: number;
  sizeBytes: number;
  createdAt: number;
  deployed: boolean;
}

export interface TrainVsInference {
  metric: string;
  trainValue: number;
  inferenceValue: number;
  unit: string;
  delta: number;
}

// ═══════════════════════════════════════════════════════════════
// Multi-Cloud Types (Phase 23-1)
// ═══════════════════════════════════════════════════════════════

export type CloudProvider = 'aws' | 'gcp' | 'azure';

export interface CloudResource {
  id: string;
  provider: CloudProvider;
  type: string;
  name: string;
  region: string;
  status: 'running' | 'stopped' | 'terminated';
  monthlyCost: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface CloudCostSummary {
  provider: CloudProvider;
  totalCost: number;
  computeCost: number;
  storageCost: number;
  networkCost: number;
  trend: number;
}

// ═══════════════════════════════════════════════════════════════
// Data Pipeline Types (Phase 23-3)
// ═══════════════════════════════════════════════════════════════

export type PipelineOrchestrator = 'airflow' | 'prefect' | 'dagster';
export type PipelineStatus = 'running' | 'success' | 'failed' | 'queued' | 'paused';
export type TaskStatus = 'running' | 'success' | 'failed' | 'pending' | 'skipped';

export interface PipelineTask {
  id: string;
  name: string;
  status: TaskStatus;
  durationMs: number;
  startedAt: number;
}

export interface Pipeline {
  id: string;
  name: string;
  orchestrator: PipelineOrchestrator;
  status: PipelineStatus;
  tasks: PipelineTask[];
  totalTasks: number;
  completedTasks: number;
  durationMs: number;
  lastRunAt: number;
  schedule: string;
  successRate: number;
}

// ═══════════════════════════════════════════════════════════════
// Business KPI Types (Phase 23-4)
// ═══════════════════════════════════════════════════════════════

export interface BusinessKPI {
  id: string;
  name: string;
  value: number;
  unit: string;
  trend: number;
  category: 'revenue' | 'conversion' | 'retention' | 'efficiency';
}

export interface CorrelationPoint {
  aiMetric: number;
  bizMetric: number;
  label: string;
}

export interface ROIEntry {
  category: string;
  investment: number;
  revenue: number;
  savings: number;
  roi: number;
}

// ═══════════════════════════════════════════════════════════════
// Marketplace Types (Phase 23-5)
// ═══════════════════════════════════════════════════════════════

export type MarketplaceItemType = 'dashboard' | 'prompt' | 'plugin' | 'notebook';

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  type: MarketplaceItemType;
  author: string;
  downloads: number;
  rating: number;
  tags: string[];
  createdAt: number;
  featured: boolean;
}

// ═══════════════════════════════════════════════════════════════
// System Profiling Types (Phase 35 — perf/eBPF)
// ═══════════════════════════════════════════════════════════════

export type SystemProfileType = 'cpu' | 'offcpu' | 'memory';

export interface SystemProfile {
  profile_id: string;
  agent_id: string;
  hostname: string;
  profile_type: SystemProfileType;
  target: string; // 'all' or 'pid:12345'
  sampling_frequency: number;
  duration_sec: number;
  total_samples: number;
  stack_depth: number;
  size_bytes: number;
  captured_at: string;
  symbol_stats: {
    resolved: number;
    unknown: number;
    jit: number;
  };
}

export interface SystemFlamegraphData {
  profileId: string;
  profileType: 'cpu' | 'offcpu' | 'memory' | 'mixed';
  agentId: string;
  hostname: string;
  totalSamples: number;
  durationSec: number;
  capturedAt: string;
  root: FlameGraphNode;
}

// ═══════════════════════════════════════════════════════════════
// Central Plugin Deployment Types (Phase 33)
// ═══════════════════════════════════════════════════════════════

export interface PluginRegistryItem {
  name: string;
  version: string;
  description: string;
  author: string;
  categories: string[];
  platforms: string[];
  uploaded_at: string;
  size_bytes: number;
  checksum: string;
  deploy_count: number;
  disabled: boolean;
  agent_summary: {
    total: number;
    installed: number;
    failed: number;
    pending: number;
  };
}

export interface PluginDeployHistory {
  deploy_id: string;
  plugin_name: string;
  version: string;
  strategy: 'immediate' | 'staged' | 'scheduled';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  started_at: string;
  completed_at?: string;
  total_agents: number;
  success_count: number;
  fail_count: number;
}

export interface PluginAgentStatus {
  agent_id: string;
  hostname: string;
  version: string;
  status: 'installed' | 'failed' | 'pending' | 'rollback';
  installed_at?: string;
  error?: string;
}

export type DeployStrategy = 'immediate' | 'staged' | 'scheduled';

export interface DeployRequest {
  target: {
    type: 'group' | 'tag' | 'agents';
    value: string | string[];
  };
  strategy: DeployStrategy;
  staged_config?: {
    canary_count: number;
    stages: number[];
  };
  scheduled_at?: string;
}

// ═══════════════════════════════════════════════════════════════
// Phase 38: Batch Monitoring Types
// ═══════════════════════════════════════════════════════════════

export interface BatchJob {
  name: string;
  schedule: string;
  schedule_human: string;
  language: string;
  scheduler: string;
  hostname: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  last_execution_at?: string;
  next_execution_at?: string;
  avg_duration_ms: number;
  success_rate: number;
  total_executions: number;
  failed_count_24h: number;
}

export interface BatchExecution {
  execution_id: string;
  job_name: string;
  pid: number;
  language: string;
  scheduler: string;
  command: string;
  state: 'DETECTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  started_at: string;
  ended_at?: string;
  exit_code: number;
  duration_ms: number;
  cpu_avg: number;
  cpu_max: number;
  memory_avg: number;
  memory_max: number;
  io_read_total: number;
  io_write_total: number;
  detected_via: string;
  hostname: string;
}

export interface BatchSQLProfile {
  sql: string;
  execution_count: number;
  total_time_ms: number;
  avg_time_ms: number;
  max_time_ms: number;
  min_time_ms: number;
}

export interface BatchMethodProfile {
  class_name: string;
  method_name: string;
  full_name: string;
  call_count: number;
  total_time_ms: number;
  avg_time_ms: number;
  self_time_ms: number;
}

export interface BatchAlertRule {
  id: string;
  name: string;
  target_job: string;
  enabled: boolean;
  conditions: {
    duration_threshold_min?: number;
    failure_threshold?: number;
    sla_deadline?: string;
    cpu_threshold?: number;
  };
  channels: {
    slack_webhook?: string;
    email?: string[];
    pagerduty_key?: string;
    webhook_url?: string;
  };
  cooldown_min: number;
  last_triggered_at?: string;
  created_at: string;
}

export interface BatchAlertHistory {
  alert_id: string;
  rule_id: string;
  rule_name: string;
  job_name: string;
  execution_id?: string;
  message: string;
  severity: 'warning' | 'critical';
  channels_notified: string[];
  triggered_at: string;
  resolved_at?: string;
}

export interface BatchExecutionDetail extends BatchExecution {
  cpu_timeline: [number, number][];
  memory_timeline: [number, number][];
  io_timeline: [number, number][];
  jvm_metrics?: {
    gc_count: number;
    gc_time_ms: number;
    heap_used_bytes: number;
    heap_max_bytes: number;
    thread_count: number;
    class_loaded: number;
  };
}

export interface BatchXLogPoint {
  execution_id: string;
  job_name: string;
  started_at: string;
  duration_min: number;
  status: 'success' | 'failed' | 'slow';
  io_total: number;
}

// ═══════════════════════════════════════════════════════════════
// Phase 40: 출시 전 Critical 기능 보완
// ═══════════════════════════════════════════════════════════════

// 40-1: RUM (Real User Monitoring)
export interface RUMSession {
  id: string;
  user_id: string;
  page_url: string;
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  country: string;
  lcp_ms: number;
  fid_ms: number;
  cls: number;
  inp_ms: number;
  ttfb_ms: number;
  fcp_ms: number;
  session_duration_ms: number;
  page_views: number;
  error_count: number;
  started_at: string;
}

export interface RUMPageMetrics {
  page_url: string;
  avg_lcp_ms: number;
  avg_fid_ms: number;
  avg_cls: number;
  avg_inp_ms: number;
  sample_count: number;
  good_pct: number;
  needs_improvement_pct: number;
  poor_pct: number;
}

export interface RUMGeoMetrics {
  region: string;
  latency_ms: number;
  sessions: number;
  error_rate: number;
}

// 40-2: SRE Golden Signals
export interface GoldenSignalService {
  service_name: string;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  traffic_rpm: number;
  error_rate_pct: number;
  saturation_cpu_pct: number;
  saturation_mem_pct: number;
  slo_target: number;
  slo_current: number;
  error_budget_remaining_pct: number;
  burn_rate: number;
  status: Status;
}

export interface GoldenSignalTimeSeries {
  timestamp: string;
  latency_p95: number;
  traffic_rpm: number;
  error_rate: number;
  saturation: number;
}

// 40-3: Python 3.13 Free-Threaded Monitoring
export interface PythonRuntimeMetrics {
  agent_id: string;
  hostname: string;
  python_version: string;
  is_free_threaded: boolean;
  gil_contention_pct: number;
  free_thread_utilization_pct: number;
  active_threads: number;
  asyncio_tasks_pending: number;
  asyncio_tasks_running: number;
  gc_gen0_collections: number;
  gc_gen1_collections: number;
  gc_gen2_collections: number;
  gc_gen0_time_ms: number;
  gc_gen1_time_ms: number;
  gc_gen2_time_ms: number;
  gc_total_pause_ms: number;
  memory_rss_mb: number;
  collected_at: string;
}

// 40-4: .NET AOT Monitoring
export interface DotNetAOTMetrics {
  agent_id: string;
  hostname: string;
  dotnet_version: string;
  is_native_aot: boolean;
  threadpool_threads: number;
  threadpool_queue_length: number;
  threadpool_completed: number;
  threadpool_starvation_count: number;
  gc_pause_time_ms: number;
  gc_suspension_time_ms: number;
  gc_heap_size_mb: number;
  gc_gen0_count: number;
  gc_gen1_count: number;
  gc_gen2_count: number;
  gc_fragmentation_pct: number;
  aot_reflection_warnings: number;
  aot_trimming_warnings: number;
  jit_compiled_methods: number;
  memory_working_set_mb: number;
  collected_at: string;
}

// 40-5: Go 1.24 Scheduler Latency
export interface GoSchedulerMetrics {
  agent_id: string;
  hostname: string;
  go_version: string;
  sched_latency_p50_us: number;
  sched_latency_p95_us: number;
  sched_latency_p99_us: number;
  gc_stw_pause_us: number;
  gc_stw_frequency: number;
  goroutines_total: number;
  goroutines_runnable: number;
  goroutines_waiting: number;
  gomaxprocs: number;
  cgo_calls: number;
  heap_alloc_mb: number;
  heap_sys_mb: number;
  stack_inuse_mb: number;
  collected_at: string;
}

export interface GoSchedHistogramBucket {
  le_us: number;
  count: number;
}

// 40-6: Database Monitoring
export interface DBInstance {
  id: string;
  engine: 'postgresql' | 'mysql';
  hostname: string;
  port: number;
  version: string;
  status: Status;
  connections_active: number;
  connections_max: number;
  qps: number;
  avg_query_time_ms: number;
  cache_hit_ratio: number;
  replication_lag_ms: number;
  disk_usage_pct: number;
  collected_at: string;
}

export interface DBSlowQuery {
  id: string;
  db_instance_id: string;
  query_text: string;
  query_hash: string;
  calls: number;
  avg_time_ms: number;
  max_time_ms: number;
  total_time_ms: number;
  rows_examined: number;
  rows_returned: number;
  wait_event_type: string;
  wait_event: string;
  first_seen: string;
  last_seen: string;
}

export interface DBLock {
  id: string;
  db_instance_id: string;
  lock_type: string;
  blocking_pid: number;
  blocked_pid: number;
  blocking_query: string;
  blocked_query: string;
  duration_ms: number;
  table_name: string;
  detected_at: string;
}

export interface DBWaitEvent {
  event_type: string;
  event_name: string;
  count: number;
  total_time_ms: number;
  avg_time_ms: number;
}
