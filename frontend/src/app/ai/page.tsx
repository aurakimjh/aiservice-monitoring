'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, SearchInput, Select, Badge, DataSourceBadge, Button, Modal } from '@/components/ui';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { AISubNav } from '@/components/ai';
import { useProjectStore } from '@/stores/project-store';
import { getProjectAIServices } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { formatDuration, formatCost } from '@/lib/utils';
import type { AIService } from '@/types/monitoring';
import { Bot, Brain, Database, Cpu, MessageSquare, Layers, Plus, ArrowRight } from 'lucide-react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  llm: <Brain size={12} />,
  rag: <MessageSquare size={12} />,
  agent: <Bot size={12} />,
  embedding: <Database size={12} />,
};

const TYPE_COLORS: Record<string, string> = {
  llm: 'bg-[#F778BA]/15 text-[#F778BA]',
  rag: 'bg-[#58A6FF]/15 text-[#58A6FF]',
  agent: 'bg-[#BC8CFF]/15 text-[#BC8CFF]',
  embedding: 'bg-[#3FB950]/15 text-[#3FB950]',
};

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
];

const TYPE_OPTIONS = [
  { label: 'All Types', value: 'all' },
  { label: 'LLM', value: 'llm' },
  { label: 'RAG', value: 'rag' },
  { label: 'Agent', value: 'agent' },
  { label: 'Embedding', value: 'embedding' },
];

export default function AIServicesPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const demoFallback = useCallback(
    () => getProjectAIServices(currentProjectId ?? 'proj-ai-prod'),
    [currentProjectId],
  );
  const aiApiPath = currentProjectId
    ? `/ai/services?project_id=${currentProjectId}`
    : '/ai/services';

  const { data: aiServicesData, source } = useDataSource<AIService[]>(
    aiApiPath,
    demoFallback,
    { refreshInterval: 30_000, transform: (raw) => (raw as { items?: AIService[] }).items ?? raw as AIService[] },
  );
  const aiServices = aiServicesData ?? [];

  // ── Service Groups (AI Pipelines) ──
  interface PipelineGroup {
    id: string; name: string; type: string; service_ids: string[];
    service_count: number; total_rpm: number; max_p95: number; error_rate: number;
  }
  const [pipelines, setPipelines] = useState<PipelineGroup[]>([]);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineType, setNewPipelineType] = useState('rag');

  const API_BASE = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
    : 'http://localhost:8080/api/v1';

  useEffect(() => {
    const fetchPipelines = async () => {
      try {
        const params = currentProjectId ? `?project_id=${currentProjectId}` : '';
        const res = await fetch(`${API_BASE}/service-groups${params}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          setPipelines(data.items ?? []);
        }
      } catch { /* ignore */ }
    };
    fetchPipelines();
    const interval = setInterval(fetchPipelines, 30_000);
    return () => clearInterval(interval);
  }, [currentProjectId]);

  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim()) return;
    try {
      await fetch(`${API_BASE}/service-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPipelineName.trim(),
          type: newPipelineType,
          project_id: currentProjectId ?? '',
          service_ids: [],
        }),
      });
      setNewPipelineName('');
      setShowCreatePipeline(false);
      // Refresh
      const res = await fetch(`${API_BASE}/service-groups`);
      if (res.ok) { const d = await res.json(); setPipelines(d.items ?? []); }
    } catch { /* ignore */ }
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    return aiServices.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      return true;
    });
  }, [aiServices, search, statusFilter, typeFilter]);

  // Executive KPIs
  const kpis = useMemo(() => {
    const count = aiServices.length;
    const avgTTFT = count > 0 ? Math.round(aiServices.reduce((s, a) => s + (a.ttftP95 ?? 0), 0) / count) : 0;
    const avgTPS = count > 0 ? Math.round(aiServices.reduce((s, a) => s + (a.tpsP50 ?? 0), 0) / count) : 0;
    const gpuServices = aiServices.filter((a) => a.gpuVramPercent != null);
    const avgGPU = gpuServices.length > 0 ? Math.round(gpuServices.reduce((s, a) => s + (a.gpuVramPercent ?? 0), 0) / gpuServices.length) : 0;
    const totalCost = aiServices.reduce((s, a) => s + (a.costPerHour ?? 0), 0);
    const avgBlockRate = count > 0 ? aiServices.reduce((s, a) => s + (a.guardrailBlockRate ?? 0), 0) / count : 0;
    return { avgTTFT, avgTPS, avgGPU, totalCost, avgBlockRate };
  }, [aiServices]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', icon: <Bot size={14} /> },
      ]} />

      <AISubNav />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">AI Services</h1>
          <DataSourceBadge source={source} />
        </div>
        <Link href="/ai/gpu" className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1">
          <Cpu size={12} /> GPU Cluster View
        </Link>
      </div>

      {/* Executive KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          title="TTFT P95"
          value={formatDuration(kpis.avgTTFT)}
          subtitle="SLO: < 2s"
          status={kpis.avgTTFT > 2000 ? 'critical' : kpis.avgTTFT > 1500 ? 'warning' : 'healthy'}
          sparkData={[1100, 1150, 1200, 1180, 1220, 1190, 1250, 1200, 1230, kpis.avgTTFT / 10]}
        />
        <KPICard
          title="TPS P50"
          value={kpis.avgTPS}
          unit="tok/s"
          subtitle="SLO: > 30"
          trend={{ direction: 'up', value: '+8%', positive: true }}
          status={kpis.avgTPS < 30 ? 'warning' : 'healthy'}
          sparkData={[35, 38, 40, 42, 39, 41, 43, 40, 42, kpis.avgTPS]}
        />
        <KPICard
          title="GPU Avg"
          value={kpis.avgGPU}
          unit="%"
          subtitle="Threshold: 90%"
          status={kpis.avgGPU > 90 ? 'critical' : kpis.avgGPU > 75 ? 'warning' : 'healthy'}
          sparkData={[65, 68, 70, 72, 75, 73, 76, 74, 75, kpis.avgGPU]}
        />
        <KPICard
          title="Token Cost"
          value={formatCost(kpis.totalCost)}
          unit="/h"
          subtitle={`Budget: $15/h`}
          trend={{ direction: 'down', value: '-3%', positive: true }}
          status={kpis.totalCost > 15 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Block Rate"
          value={kpis.avgBlockRate.toFixed(1)}
          unit="%"
          subtitle="Threshold: 5%"
          status={kpis.avgBlockRate > 5 ? 'critical' : kpis.avgBlockRate > 3 ? 'warning' : 'healthy'}
          sparkData={[1.8, 2.0, 1.9, 2.1, 2.0, 1.8, 2.2, 2.1, 2.0, kpis.avgBlockRate]}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput placeholder="Search AI services..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select options={TYPE_OPTIONS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
        <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
      </div>

      {/* Service Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2.5 font-medium">Service</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium text-right">TTFT P95</th>
                <th className="px-4 py-2.5 font-medium text-right">TPS P50</th>
                <th className="px-4 py-2.5 font-medium text-right">Cost/h</th>
                <th className="px-4 py-2.5 font-medium text-right">GPU VRAM</th>
                <th className="px-4 py-2.5 font-medium text-right">Block Rate</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((svc) => (
                <tr key={svc.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/ai/${svc.id}`} className="font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-1.5">
                      <Bot size={12} className="text-[var(--text-muted)]" />
                      {svc.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded', TYPE_COLORS[svc.type])}>
                      {TYPE_ICONS[svc.type]}
                      {svc.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{svc.model ?? '—'}</td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', (svc.ttftP95 ?? 0) > 2000 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]')}>
                    {svc.ttftP95 ? formatDuration(svc.ttftP95) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {svc.tpsP50 ? `${svc.tpsP50} tok/s` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {svc.costPerHour != null ? formatCost(svc.costPerHour) : '—'}
                  </td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', (svc.gpuVramPercent ?? 0) > 85 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]')}>
                    {svc.gpuVramPercent != null ? `${svc.gpuVramPercent}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {svc.guardrailBlockRate != null ? `${svc.guardrailBlockRate}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5"><StatusIndicator status={svc.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="text-center py-12 text-sm text-[var(--text-muted)]">No AI services match your filters.</div>}
      </Card>

      {/* ── AI Pipelines (Service Groups) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[var(--text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">AI Pipelines</h2>
            <Badge>{pipelines.length}</Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowCreatePipeline(true)}>
            <Plus size={12} /> New Pipeline
          </Button>
        </div>

        {pipelines.length === 0 ? (
          <Card>
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
              No AI pipelines defined. Create one to group related AI services (e.g., RAG = Embedding + VectorDB + LLM + Guardrail).
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pipelines.map((pipeline) => {
              const typeColor = pipeline.type === 'rag' ? '#58A6FF' : pipeline.type === 'agent' ? '#BC8CFF' : pipeline.type === 'training' ? '#D29922' : '#3FB950';
              return (
                <Card key={pipeline.id}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: typeColor }} />
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{pipeline.name}</span>
                        <Badge>{pipeline.type.toUpperCase()}</Badge>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {pipeline.service_count} services
                      </div>
                    </div>
                  </div>

                  {/* Pipeline Stage Flow */}
                  {(pipeline.service_ids ?? []).length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap mb-3">
                      {(pipeline.service_ids ?? []).map((svcName, i) => (
                        <div key={svcName} className="flex items-center gap-1">
                          <span className="px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[10px] font-mono text-[var(--text-secondary)]">
                            {svcName}
                          </span>
                          {i < (pipeline.service_ids ?? []).length - 1 && (
                            <ArrowRight size={10} className="text-[var(--text-muted)]" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--text-muted)] mb-3">No services assigned — edit to add services</div>
                  )}

                  {/* Pipeline Metrics */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Total RPM</div>
                      <div className="font-semibold text-[var(--text-primary)] tabular-nums">{(pipeline.total_rpm ?? 0) > 0 ? (pipeline.total_rpm ?? 0).toFixed(1) : '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Max P95</div>
                      <div className="font-semibold text-[var(--text-primary)] tabular-nums">{(pipeline.max_p95 ?? 0) > 0 ? `${(pipeline.max_p95 ?? 0).toFixed(0)}ms` : '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Error Rate</div>
                      <div className="font-semibold text-[var(--text-primary)] tabular-nums">{(pipeline.error_rate ?? 0) > 0 ? `${(pipeline.error_rate ?? 0).toFixed(2)}%` : '-'}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Pipeline Modal */}
      <Modal open={showCreatePipeline} onClose={() => setShowCreatePipeline(false)} title="Create AI Pipeline" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-[var(--text-muted)] mb-1">Pipeline Name</label>
            <input type="text" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder="e.g., RAG Pipeline"
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]" />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--text-muted)] mb-1">Type</label>
            <select value={newPipelineType} onChange={(e) => setNewPipelineType(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-sm text-[var(--text-primary)]">
              <option value="rag">RAG (Retrieval-Augmented Generation)</option>
              <option value="agent">Agent (Multi-step AI Agent)</option>
              <option value="training">Training (ML Training Pipeline)</option>
              <option value="inference">Inference (Model Serving)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="md" onClick={() => setShowCreatePipeline(false)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleCreatePipeline} disabled={!newPipelineName.trim()}>
              Create Pipeline
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
