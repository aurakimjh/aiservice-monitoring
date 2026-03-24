import { useAuthStore } from '@/stores/auth-store';
import type { LoginRequest, LoginResponse, User } from '@/types/auth';
import type { FleetAgent, CollectionJob, AgentPlugin, AgentGroup, UpdateStatus, CollectionSchedule } from '@/types/monitoring';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

// ── Generic fetch wrapper with auth ──
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { tokens, logout, updateTokens } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    // Check expiry (refresh if < 60s remaining)
    if (tokens.expiresAt - Date.now() < 60_000 && tokens.refreshToken) {
      try {
        const refreshed = await refreshTokens(tokens.refreshToken);
        updateTokens(refreshed);
        headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      } catch {
        logout();
        throw new Error('Session expired');
      }
    } else {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

// ── Token refresh ──
async function refreshTokens(refreshToken: string) {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Refresh failed');
  return res.json() as Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>;
}

// ── Auth API ──
export const authApi = {
  login: (data: LoginRequest) =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => apiFetch<User>('/auth/me'),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }).catch(() => {}),
};

// ── Demo/Mock login (개발용 — 백엔드 없이 동작) ──
const DEMO_USERS: Record<string, { password: string; user: User }> = {
  'admin@aitop.io': {
    password: 'admin',
    user: {
      id: 'u-001',
      email: 'admin@aitop.io',
      name: 'Admin',
      role: 'admin',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
  'sre@aitop.io': {
    password: 'sre',
    user: {
      id: 'u-002',
      email: 'sre@aitop.io',
      name: 'SRE Kim',
      role: 'sre',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
  'ai@aitop.io': {
    password: 'ai',
    user: {
      id: 'u-003',
      email: 'ai@aitop.io',
      name: 'AI Engineer Park',
      role: 'ai_engineer',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
  'viewer@aitop.io': {
    password: 'viewer',
    user: {
      id: 'u-004',
      email: 'viewer@aitop.io',
      name: 'Viewer Lee',
      role: 'viewer',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
};

export async function demoLogin(email: string, password: string): Promise<LoginResponse> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 500));

  const entry = DEMO_USERS[email];
  if (!entry || entry.password !== password) {
    throw new Error('Invalid email or password');
  }

  return {
    user: entry.user,
    tokens: {
      accessToken: `demo-token-${entry.user.id}-${Date.now()}`,
      refreshToken: `demo-refresh-${entry.user.id}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    },
  };
}

// ── Fleet API (Collection Server — /api/v1/fleet) ──
export const fleetApi = {
  listAgents: (projectId?: string) =>
    apiFetch<{ items: FleetAgent[]; total: number }>(
      `/fleet/agents${projectId ? `?project=${projectId}` : ''}`,
    ),

  listJobs: (projectId?: string) =>
    apiFetch<{ items: CollectionJob[] }>(
      `/fleet/jobs${projectId ? `?project=${projectId}` : ''}`,
    ),

  listPlugins: () =>
    apiFetch<{ items: AgentPlugin[] }>('/fleet/plugins'),

  triggerCollect: (agentId: string) =>
    apiFetch<void>(`/fleet/agents/${agentId}/collect`, { method: 'POST' }),

  // Group management
  listGroups: () =>
    apiFetch<{ items: AgentGroup[] }>('/fleet/groups'),

  createGroup: (data: Omit<AgentGroup, 'id' | 'createdAt'>) =>
    apiFetch<AgentGroup>('/fleet/groups', { method: 'POST', body: JSON.stringify(data) }),

  updateGroup: (id: string, data: Partial<Omit<AgentGroup, 'id' | 'createdAt'>>) =>
    apiFetch<AgentGroup>(`/fleet/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteGroup: (id: string) =>
    apiFetch<void>(`/fleet/groups/${id}`, { method: 'DELETE' }),

  // OTA Update management
  listUpdates: () =>
    apiFetch<{ items: UpdateStatus[] }>('/fleet/updates'),

  triggerUpdate: (agentIds: string[], targetVersion: string) =>
    apiFetch<{ queued: number }>('/fleet/updates', {
      method: 'POST',
      body: JSON.stringify({ agentIds, targetVersion }),
    }),

  // Collection schedule management
  listSchedules: () =>
    apiFetch<{ items: CollectionSchedule[] }>('/fleet/schedules'),

  saveSchedule: (data: Omit<CollectionSchedule, 'id'>) =>
    apiFetch<CollectionSchedule>('/fleet/schedules', { method: 'POST', body: JSON.stringify(data) }),

  updateSchedule: (id: string, data: Partial<CollectionSchedule>) =>
    apiFetch<CollectionSchedule>(`/fleet/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Plugin deployment
  deployPlugin: (pluginName: string, targetType: 'all' | 'group' | 'agents', targetId?: string, agentIds?: string[]) =>
    apiFetch<{ queued: number }>('/fleet/plugins/deploy', {
      method: 'POST',
      body: JSON.stringify({ pluginName, targetType, targetId, agentIds }),
    }),

  // 25-2-2: Group agent assignment
  assignAgentsToGroup: (groupId: string, agentIds: string[]) =>
    apiFetch<{ id: string; agentIds: string[] }>(`/fleet/groups/${groupId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ agentIds }),
    }),

  removeAgentFromGroup: (groupId: string, agentId: string) =>
    apiFetch<void>(`/fleet/groups/${groupId}/agents/${agentId}`, { method: 'DELETE' }),

  // 25-2-5: Group-level collect / OTA trigger
  triggerGroupCollect: (groupId: string) =>
    apiFetch<{ status: string; agentCount: number }>(`/fleet/groups/${groupId}/collect`, { method: 'POST' }),

  triggerGroupUpdate: (groupId: string, targetVersion: string) =>
    apiFetch<{ status: string; queued: number }>(`/fleet/groups/${groupId}/update`, {
      method: 'POST',
      body: JSON.stringify({ targetVersion }),
    }),

  // 25-1-3: SDK alerts
  listSDKAlerts: () =>
    apiFetch<{ items: import('@/types/monitoring').SDKAlert[]; total: number }>('/fleet/sdk-alerts'),

  createSDKAlert: (data: { agentId: string; hostname: string; language: string; sdkName: string; sdkVersion: string; otelEnabled: boolean }) =>
    apiFetch<import('@/types/monitoring').SDKAlert>('/fleet/sdk-alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  acknowledgeSDKAlert: (alertId: string) =>
    apiFetch<{ status: string }>(`/fleet/sdk-alerts/${alertId}/acknowledge`, { method: 'POST' }),

  // 25-3-2: Agent config CRUD
  getAgentConfig: (agentId: string) =>
    apiFetch<import('@/types/monitoring').AgentConfigRecord>(`/agents/${agentId}/config`),

  updateAgentConfig: (agentId: string, config: Record<string, unknown>) =>
    apiFetch<import('@/types/monitoring').AgentConfigRecord>(`/agents/${agentId}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getAgentConfigHistory: (agentId: string) =>
    apiFetch<{ history: import('@/types/monitoring').ConfigHistoryEntry[] }>(`/agents/${agentId}/config/history`),

  // 25-3-3: Config hot reload
  reloadAgentConfig: (agentId: string) =>
    apiFetch<{ status: string; queued_at: string }>(`/agents/${agentId}/config/reload`, { method: 'POST' }),

  // 25-4-1: Agent restart
  restartAgent: (agentId: string) =>
    apiFetch<{ status: string; queued_at: string }>(`/agents/${agentId}/restart`, { method: 'POST' }),
};

// ── Infrastructure API ──
export const infraApi = {
  listHosts: (projectId?: string) =>
    apiFetch<{ items: Record<string, unknown>[]; total: number }>(
      `/infra/hosts${projectId ? `?project=${projectId}` : ''}`,
    ),

  getHost: (hostname: string) =>
    apiFetch<Record<string, unknown>>(`/infra/hosts/${hostname}`),

  getHostMetrics: (hostname: string, range?: string) =>
    apiFetch<{ metrics: Record<string, unknown>[] }>(
      `/infra/hosts/${hostname}/metrics${range ? `?range=${range}` : ''}`,
    ),
};

// ── Services API (APM) ──
export const servicesApi = {
  listServices: (projectId?: string) =>
    apiFetch<{ items: Record<string, unknown>[]; total: number }>(
      `/services${projectId ? `?project=${projectId}` : ''}`,
    ),

  getService: (serviceId: string) =>
    apiFetch<Record<string, unknown>>(`/services/${serviceId}`),

  getServiceEndpoints: (serviceId: string) =>
    apiFetch<{ items: Record<string, unknown>[] }>(`/services/${serviceId}/endpoints`),

  getServiceDependencies: (serviceId: string) =>
    apiFetch<{ upstream: Record<string, unknown>[]; downstream: Record<string, unknown>[] }>(
      `/services/${serviceId}/dependencies`,
    ),

  getTopology: (projectId?: string) =>
    apiFetch<{ nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }>(
      `/services/topology${projectId ? `?project=${projectId}` : ''}`,
    ),
};

// ── Traces API ──
export const tracesApi = {
  listTraces: (params?: { service?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.service) qs.set('service', params.service);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiFetch<{ items: Record<string, unknown>[] }>(`/traces${q ? `?${q}` : ''}`);
  },

  getTrace: (traceId: string) =>
    apiFetch<Record<string, unknown>>(`/traces/${traceId}`),

  getXLogData: (params?: { service?: string; range?: string }) => {
    const qs = new URLSearchParams();
    if (params?.service) qs.set('service', params.service);
    if (params?.range) qs.set('range', params.range);
    const q = qs.toString();
    return apiFetch<{ points: Record<string, unknown>[] }>(`/traces/xlog${q ? `?${q}` : ''}`);
  },

  getHeatMapData: (params?: { service?: string; range?: string }) => {
    const qs = new URLSearchParams();
    if (params?.service) qs.set('service', params.service);
    if (params?.range) qs.set('range', params.range);
    const q = qs.toString();
    return apiFetch<{ buckets: Record<string, unknown>[][] }>(`/traces/heatmap${q ? `?${q}` : ''}`);
  },
};

// ── AI Service API ──
export const aiApi = {
  listAIServices: (projectId?: string) =>
    apiFetch<{ items: Record<string, unknown>[]; total: number }>(
      `/ai/services${projectId ? `?project=${projectId}` : ''}`,
    ),

  getAIService: (serviceId: string) =>
    apiFetch<Record<string, unknown>>(`/ai/services/${serviceId}`),

  getGPUCluster: (projectId?: string) =>
    apiFetch<{ gpus: Record<string, unknown>[] }>(
      `/ai/gpu${projectId ? `?project=${projectId}` : ''}`,
    ),

  getLLMPerformance: (serviceId: string, range?: string) =>
    apiFetch<Record<string, unknown>>(
      `/ai/services/${serviceId}/llm${range ? `?range=${range}` : ''}`,
    ),

  getRAGPipeline: (serviceId: string) =>
    apiFetch<Record<string, unknown>>(`/ai/services/${serviceId}/rag`),

  getGuardrailData: (serviceId: string) =>
    apiFetch<Record<string, unknown>>(`/ai/services/${serviceId}/guardrail`),
};

// ── Diagnostics API ──
export const diagnosticsApi = {
  listRuns: (agentId?: string) =>
    apiFetch<{ items: Record<string, unknown>[] }>(
      `/diagnostics/runs${agentId ? `?agent=${agentId}` : ''}`,
    ),

  getRun: (diagnosticId: string) =>
    apiFetch<Record<string, unknown>>(`/diagnostics/runs/${diagnosticId}`),

  getItems: (diagnosticId: string) =>
    apiFetch<{ items: Record<string, unknown>[] }>(`/diagnostics/runs/${diagnosticId}/items`),

  triggerDiagnostic: (agentId: string, scope?: string) =>
    apiFetch<{ diagnostic_id: string }>('/diagnostics/trigger', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, scope: scope ?? 'full' }),
    }),
};

// ── Alerts & Incidents API ──
export const alertsApi = {
  listPolicies: () =>
    apiFetch<{ items: Record<string, unknown>[] }>('/alerts/policies'),

  listIncidents: (status?: string) =>
    apiFetch<{ items: Record<string, unknown>[] }>(
      `/alerts/incidents${status ? `?status=${status}` : ''}`,
    ),

  getIncident: (incidentId: string) =>
    apiFetch<Record<string, unknown>>(`/alerts/incidents/${incidentId}`),

  acknowledgeIncident: (incidentId: string) =>
    apiFetch<void>(`/alerts/incidents/${incidentId}/acknowledge`, { method: 'POST' }),

  resolveIncident: (incidentId: string) =>
    apiFetch<void>(`/alerts/incidents/${incidentId}/resolve`, { method: 'POST' }),

  listChannels: () =>
    apiFetch<{ items: Record<string, unknown>[] }>('/alerts/channels'),
};

// ── Metrics API ──
export const metricsApi = {
  query: (promql: string, range?: string) =>
    apiFetch<{ data: Record<string, unknown> }>(
      `/metrics/query?query=${encodeURIComponent(promql)}${range ? `&range=${range}` : ''}`,
    ),

  catalog: () =>
    apiFetch<{ items: Record<string, unknown>[] }>('/metrics/catalog'),
};

// ── Logs API ──
export const logsApi = {
  search: (params: { query?: string; service?: string; level?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.query) qs.set('query', params.query);
    if (params.service) qs.set('service', params.service);
    if (params.level) qs.set('level', params.level);
    if (params.limit) qs.set('limit', String(params.limit));
    return apiFetch<{ items: Record<string, unknown>[] }>(`/logs?${qs.toString()}`);
  },

  patterns: () =>
    apiFetch<{ items: Record<string, unknown>[] }>('/logs/patterns'),
};

// ── SLO API ──
export const sloApi = {
  list: () =>
    apiFetch<{ items: Record<string, unknown>[] }>('/slo'),
};

// ── Cost API ──
export const costApi = {
  getBreakdown: (range?: string) =>
    apiFetch<Record<string, unknown>>(`/costs/breakdown${range ? `?range=${range}` : ''}`),
};

// ── Profiling API (Phase 21-1) ─────────────────────────────────────────────

export const profilingApi = {
  list: (params?: { service?: string; language?: string; type?: string; from?: string; to?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.service) qs.set('service', params.service);
    if (params?.language) qs.set('language', params.language);
    if (params?.type) qs.set('type', params.type);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiFetch<{ items: import('@/types/monitoring').ProfileMetadata[]; total: number }>(`/profiles${q ? `?${q}` : ''}`);
  },
  get: (id: string) =>
    apiFetch<import('@/types/monitoring').ProfileMetadata>(`/profiles/${id}`),
  getFlameGraph: (id: string) =>
    apiFetch<import('@/types/monitoring').FlameGraphData>(`/profiles/${id}/flamegraph`),
  getRaw: (id: string) =>
    apiFetch<Blob>(`/profiles/${id}/raw`),
  compare: (baseId: string, targetId: string) =>
    apiFetch<import('@/types/monitoring').FlameGraphDiff>(`/profiles/compare?base=${baseId}&target=${targetId}`),
  getForTrace: (traceId: string) =>
    apiFetch<{ items: import('@/types/monitoring').ProfileMetadata[] }>(`/traces/${traceId}/profiles`),
};

// ── SSO API (Phase 21-3) ──────────────────────────────────────────────────

export const ssoApi = {
  listProviders: () =>
    apiFetch<{ items: { id: string; name: string; protocol: string; enabled: boolean; buttonLabel?: string }[] }>('/auth/sso/providers'),
  listConfigs: () =>
    apiFetch<{ items: Record<string, unknown>[] }>('/settings/sso'),
  createConfig: (data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/settings/sso', { method: 'POST', body: JSON.stringify(data) }),
  updateConfig: (id: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/settings/sso/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteConfig: (id: string) =>
    apiFetch<void>(`/settings/sso/${id}`, { method: 'DELETE' }),
  testConnection: (id: string) =>
    apiFetch<{ status: string; message: string }>(`/settings/sso/${id}/test`, { method: 'POST' }),
};

// ── AI Copilot API (Phase 22-1) ────────────────────────────────────────

export const copilotApi = {
  chat: (message: string) =>
    apiFetch<{ response: import('@/types/monitoring').CopilotMessage }>('/copilot/chat', {
      method: 'POST', body: JSON.stringify({ message }),
    }),
  suggestions: () =>
    apiFetch<{ items: import('@/types/monitoring').CopilotSuggestion[] }>('/copilot/suggestions'),
  query: (query: string) =>
    apiFetch<{ promql: string; data: Record<string, unknown> }>('/copilot/query', {
      method: 'POST', body: JSON.stringify({ query }),
    }),
};

// ── Topology API (Phase 22-2) ──────────────────────────────────────────

export const topologyApi = {
  getTopology: () =>
    apiFetch<import('@/types/monitoring').DiscoveredTopology>('/topology'),
  getChanges: (since?: number) =>
    apiFetch<{ items: import('@/types/monitoring').TopologyChange[] }>(
      `/topology/changes${since ? `?since=${since}` : ''}`,
    ),
};

// ── Training API (Phase 22-3) ──────────────────────────────────────────

export const trainingApi = {
  listJobs: (status?: string) =>
    apiFetch<{ items: import('@/types/monitoring').TrainingJob[] }>(
      `/training/jobs${status ? `?status=${status}` : ''}`,
    ),
  getJob: (jobId: string) =>
    apiFetch<import('@/types/monitoring').TrainingJob>(`/training/jobs/${jobId}`),
  listCheckpoints: (jobId: string) =>
    apiFetch<{ items: import('@/types/monitoring').TrainingCheckpoint[] }>(`/training/jobs/${jobId}/checkpoints`),
  deployCheckpoint: (jobId: string, checkpointId: string) =>
    apiFetch<{ status: string }>(`/training/jobs/${jobId}/checkpoints/${checkpointId}/deploy`, {
      method: 'POST',
    }),
};

// ── Cloud API (Phase 23-1) ─────────────────────────────────────────────

export const cloudApi = {
  getCostSummaries: () =>
    apiFetch<{ items: import('@/types/monitoring').CloudCostSummary[] }>('/cloud/costs'),
  getResources: (provider?: string) =>
    apiFetch<{ items: import('@/types/monitoring').CloudResource[] }>(`/cloud/resources${provider ? `?provider=${provider}` : ''}`),
};

// ── Pipeline API (Phase 23-3) ──────────────────────────────────────────

export const pipelineApi = {
  list: () =>
    apiFetch<{ items: import('@/types/monitoring').Pipeline[] }>('/pipelines'),
  get: (id: string) =>
    apiFetch<import('@/types/monitoring').Pipeline>(`/pipelines/${id}`),
};

// ── Business KPI API (Phase 23-4) ──────────────────────────────────────

export const businessApi = {
  getKPIs: () =>
    apiFetch<{ items: import('@/types/monitoring').BusinessKPI[] }>('/business/kpis'),
  getCorrelation: () =>
    apiFetch<{ items: import('@/types/monitoring').CorrelationPoint[] }>('/business/correlation'),
  getROI: () =>
    apiFetch<{ items: import('@/types/monitoring').ROIEntry[] }>('/business/roi'),
};

// ── Marketplace API (Phase 23-5) ───────────────────────────────────────

export const marketplaceApi = {
  list: (type?: string) =>
    apiFetch<{ items: import('@/types/monitoring').MarketplaceItem[] }>(`/marketplace${type ? `?type=${type}` : ''}`),
  get: (id: string) =>
    apiFetch<import('@/types/monitoring').MarketplaceItem>(`/marketplace/${id}`),
  publish: (data: Record<string, unknown>) =>
    apiFetch<{ id: string }>('/marketplace', { method: 'POST', body: JSON.stringify(data) }),
};

export { apiFetch };
