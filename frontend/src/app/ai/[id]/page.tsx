'use client';

import { useState, use, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, Badge, Button, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { StatusIndicator, KPICard, GPUCard } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { useProjectStore } from '@/stores/project-store';
import {
  getProjectAIServices,
  getProjectHosts,
  generateTimeSeries,
  getTTFTHistogram,
  getRAGPipelineData,
  getAgentExecutions,
  getGuardrailData,
} from '@/lib/demo-data';
import { formatDuration, formatCost, getRelativeTime } from '@/lib/utils';
import {
  Bot,
  Brain,
  Activity,
  Shield,
  Database,
  Cpu,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  DollarSign,
} from 'lucide-react';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  llm: <Brain size={13} />,
  rag: <MessageSquare size={13} />,
  agent: <Bot size={13} />,
  embedding: <Database size={13} />,
};

export default function AIServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectId = currentProjectId ?? 'proj-ai-prod';

  // Live: API / Demo: fallback
  const demoSvc = useCallback(() => {
    const all = getProjectAIServices(projectId);
    return all.find((s) => s.id === id) ?? null;
  }, [projectId, id]);
  const { data: liveSvc, source } = useDataSource(`/ai/services/${id}`, demoSvc);
  const svc = liveSvc ?? getProjectAIServices(projectId).find((s) => s.id === id) ?? null;

  const [activeTab, setActiveTab] = useState('overview');

  const hosts = getProjectHosts(projectId);
  const svcHosts = useMemo(() => svc ? hosts.filter((h) => (svc.hostIds ?? []).includes(h.id)) : [], [svc, hosts]);
  const gpus = useMemo(() => svcHosts.flatMap((h) => h.gpus ?? []), [svcHosts]);

  const tabs = useMemo(() => {
    const base = [
      { id: 'overview', label: 'Overview', icon: <Activity size={13} /> },
      { id: 'llm', label: 'LLM Performance', icon: <Brain size={13} /> },
    ];
    if (svc?.type === 'rag') base.push({ id: 'rag', label: 'RAG Pipeline', icon: <Database size={13} /> });
    base.push({ id: 'guardrail', label: 'Guardrail', icon: <Shield size={13} /> });
    if (gpus.length > 0) base.push({ id: 'gpu', label: 'GPU', icon: <Cpu size={13} /> });
    return base;
  }, [svc?.type, gpus.length]);

  if (!svc) {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-4xl">404</div>
        <div className="text-sm text-[var(--text-muted)]">AI Service &quot;{id}&quot; not found</div>
        <Button variant="secondary" onClick={() => router.push('/ai')}>Back to AI Services</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: svc.name },
      ]} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <StatusIndicator status={svc.status} size="lg" pulse={svc.status === 'critical'} />
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{svc.name}</h1>
          <DataSourceBadge source={source} />
          <Badge variant="status" status={svc.status}>{svc.status}</Badge>
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded',
            svc.type === 'rag' ? 'bg-[#58A6FF]/15 text-[#58A6FF]' :
            svc.type === 'llm' ? 'bg-[#F778BA]/15 text-[#F778BA]' :
            svc.type === 'agent' ? 'bg-[#BC8CFF]/15 text-[#BC8CFF]' :
            'bg-[#3FB950]/15 text-[#3FB950]'
          )}>
            {TYPE_ICONS[svc.type]}
            {svc.type.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
          {svc.model && <span>Model: {svc.model}</span>}
          <span>{svcHosts.length} host{svcHosts.length !== 1 && 's'}</span>
          {gpus.length > 0 && <span>{gpus.length} GPU{gpus.length !== 1 && 's'}</span>}
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard helpId="ai-svc-ttft-p95" title="TTFT P95" value={svc.ttftP95 ? formatDuration(svc.ttftP95) : '—'} subtitle="SLO: < 2s" status={((svc.ttftP95 ?? 0) > 2000) ? 'critical' : ((svc.ttftP95 ?? 0) > 1500) ? 'warning' : 'healthy'} sparkData={[800, 900, 1000, 1100, 1200, 1100, 1300, 1200, 1250, (svc.ttftP95 ?? 0) / 10]} />
            <KPICard helpId="ai-svc-tps-p50" title="TPS P50" value={svc.tpsP50 ?? '—'} unit="tok/s" subtitle="SLO: > 30" status={((svc.tpsP50 ?? 0) < 30) ? 'warning' : 'healthy'} trend={{ direction: 'up', value: '+8%', positive: true }} sparkData={[35, 38, 40, 42, 39, 41, 43, 40, 42, svc.tpsP50 ?? 0]} />
            <KPICard helpId="ai-svc-cost" title="Cost" value={svc.costPerHour != null ? formatCost(svc.costPerHour) : '—'} unit="/h" status="healthy" trend={{ direction: 'down', value: '-3%', positive: true }} />
            <KPICard helpId="ai-svc-error-rate" title="Error Rate" value={svc.errorRate != null ? `${svc.errorRate}%` : '—'} status={((svc.errorRate ?? 0) > 1) ? 'critical' : ((svc.errorRate ?? 0) > 0.5) ? 'warning' : 'healthy'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle helpId="chart-ttft-trend">TTFT Trend</CardTitle></CardHeader>
              <TimeSeriesChart series={[
                { name: 'P50', data: generateTimeSeries((svc.ttftP95 ?? 1000) * 0.6, 200, 60), color: '#3FB950' },
                { name: 'P95', data: generateTimeSeries(svc.ttftP95 ?? 1000, 300, 60), color: '#D29922' },
              ]} yAxisLabel="ms" thresholdLine={{ value: 2000, label: 'SLO 2s', color: '#F85149' }} height={200} />
            </Card>
            <Card>
              <CardHeader><CardTitle helpId="chart-tps-trend">TPS Trend</CardTitle></CardHeader>
              <TimeSeriesChart series={[
                { name: 'TPS', data: generateTimeSeries(svc.tpsP50 ?? 40, 8, 60), type: 'area', color: '#58A6FF' },
              ]} yAxisLabel="tok/s" thresholdLine={{ value: 30, label: 'SLO 30', color: '#D29922' }} height={200} />
            </Card>
          </div>
        </div>
      )}

      {/* ── LLM Performance ── */}
      {activeTab === 'llm' && <LLMTab svc={svc} />}

      {/* ── RAG Pipeline ── */}
      {activeTab === 'rag' && <RAGTab />}

      {/* ── Guardrail ── */}
      {activeTab === 'guardrail' && <GuardrailTab />}

      {/* ── GPU ── */}
      {activeTab === 'gpu' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {gpus.map((gpu, i) => <GPUCard key={i} gpu={gpu} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle helpId="chart-vram-usage">VRAM Usage Trend</CardTitle></CardHeader>
              <TimeSeriesChart series={gpus.map((g, i) => ({
                name: `GPU #${g.index}`,
                data: generateTimeSeries(g.vramPercent, 8, 60),
                color: ['#58A6FF', '#3FB950', '#D29922', '#F85149'][i % 4],
              }))} yAxisLabel="%" thresholdLine={{ value: 90, label: '90%', color: '#F85149' }} height={200} />
            </Card>
            <Card>
              <CardHeader><CardTitle helpId="chart-gpu-temperature">Temperature Trend</CardTitle></CardHeader>
              <TimeSeriesChart series={gpus.map((g, i) => ({
                name: `GPU #${g.index}`,
                data: generateTimeSeries(g.temperature, 5, 60),
                color: ['#58A6FF', '#3FB950', '#D29922', '#F85149'][i % 4],
              }))} yAxisLabel="°C" thresholdLine={{ value: 85, label: '85°C', color: '#F85149' }} height={200} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LLM Performance Tab ──

function LLMTab({ svc }: { svc: { ttftP95?: number; tpsP50?: number; costPerHour?: number } }) {
  const histogram = useMemo(() => getTTFTHistogram(), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histOption = useMemo<any>(() => ({
    animation: false,
    xAxis: { type: 'category', data: histogram.map((h) => h.bucket), axisLabel: { fontSize: 10, rotate: 30 } },
    yAxis: { type: 'value', name: 'count' },
    series: [{ type: 'bar', data: histogram.map((h) => h.count), itemStyle: { color: '#58A6FF' }, barWidth: '70%' }],
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 24, bottom: 48 },
    markLine: { silent: true, symbol: 'none', data: [
      { xAxis: '1000-1200', lineStyle: { color: '#D29922', type: 'dashed' }, label: { formatter: 'P50', color: '#D29922', fontSize: 10 } },
      { xAxis: '1500-2000', lineStyle: { color: '#F85149', type: 'dashed' }, label: { formatter: 'P95', color: '#F85149', fontSize: 10 } },
    ] },
  }), [histogram]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle helpId="chart-ttft-distribution">TTFT Distribution</CardTitle></CardHeader>
          <EChartsWrapper option={histOption} height={240} />
          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
            <span>P50: {formatDuration((svc.ttftP95 ?? 1200) * 0.6)}</span>
            <span>P95: {formatDuration(svc.ttftP95 ?? 1200)}</span>
            <span>P99: {formatDuration((svc.ttftP95 ?? 1200) * 1.8)}</span>
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle helpId="chart-token-throughput">Token Throughput (TPS)</CardTitle></CardHeader>
          <TimeSeriesChart series={[
            { name: 'P50', data: generateTimeSeries(svc.tpsP50 ?? 42, 8, 60), color: '#58A6FF' },
            { name: 'P95', data: generateTimeSeries((svc.tpsP50 ?? 42) * 1.4, 12, 60), color: '#D29922' },
          ]} yAxisLabel="tok/s" thresholdLine={{ value: 30, label: 'Target 30', color: '#3FB950' }} height={240} />
        </Card>
        <Card>
          <CardHeader><CardTitle helpId="chart-token-usage-cost">Token Usage &amp; Cost</CardTitle></CardHeader>
          <TimeSeriesChart series={[
            { name: 'Input tok/min', data: generateTimeSeries(45200, 5000, 60), type: 'area', color: '#58A6FF' },
            { name: 'Output tok/min', data: generateTimeSeries(12800, 2000, 60), type: 'area', color: '#3FB950' },
          ]} yAxisLabel="tok/min" height={240} />
          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
            <span>Input: ~45K tok/min ($2.71/min)</span>
            <span>Output: ~12.8K tok/min ($5.12/min)</span>
            <span className="font-medium text-[var(--text-primary)]">Total: {formatCost(svc.costPerHour ?? 8.5)}/h</span>
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle helpId="chart-concurrent-requests">Concurrent Requests</CardTitle></CardHeader>
          <TimeSeriesChart series={[
            { name: 'Concurrent', data: generateTimeSeries(8, 4, 60), type: 'area', color: '#BC8CFF' },
          ]} yAxisLabel="requests" thresholdLine={{ value: 20, label: 'Limit 20', color: '#F85149' }} height={240} />
          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
            <span>Current: ~8</span>
            <span>Peak: ~12</span>
            <span>Limit: 20</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── RAG Pipeline Tab ──

function RAGTab() {
  const data = useMemo(() => getRAGPipelineData(), []);

  return (
    <div className="space-y-4">
      {/* Pipeline Flow */}
      <Card>
        <CardHeader><CardTitle helpId="chart-pipeline-stages">Pipeline Stages (avg latency)</CardTitle></CardHeader>
        <div className="flex items-center gap-1 h-10 rounded-[var(--radius-md)] overflow-hidden">
          {data.stages.map((stage) => (
            <div
              key={stage.name}
              className="h-full flex items-center justify-center text-[10px] font-medium text-white relative group"
              style={{ width: `${stage.percentage}%`, backgroundColor: stage.color, minWidth: stage.percentage < 5 ? '40px' : undefined }}
            >
              {stage.percentage > 8 && <span className="truncate px-1">{stage.name}</span>}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {data.stages.map((stage) => (
            <span key={stage.name} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: stage.color }} />
              {stage.name}: {stage.avgDuration}ms ({stage.percentage}%)
            </span>
          ))}
        </div>
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Total: {formatDuration(data.totalDuration)} &middot; LLM: {data.stages.find((s) => s.name === 'LLM Inference')?.percentage}%
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Search Quality */}
        <Card>
          <CardHeader><CardTitle helpId="chart-search-quality">Search Quality</CardTitle></CardHeader>
          <div className="space-y-2.5">
            {[
              { label: 'Relevancy Score', value: data.searchQuality.relevancyScore, max: 1, fmt: (v: number) => v.toFixed(2) },
              { label: 'Top-K Hit Rate', value: data.searchQuality.topKHitRate, max: 100, fmt: (v: number) => `${v}%` },
              { label: 'Faithfulness', value: data.searchQuality.faithfulness, max: 1, fmt: (v: number) => v.toFixed(2) },
              { label: 'Answer Relevancy', value: data.searchQuality.answerRelevancy, max: 1, fmt: (v: number) => v.toFixed(2) },
            ].map((m) => (
              <div key={m.label}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="text-[var(--text-secondary)]">{m.label}</span>
                  <span className="font-medium text-[var(--text-primary)] tabular-nums">{m.fmt(m.value)}</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--accent-primary)]" style={{ width: `${(m.value / m.max) * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="text-[10px] text-[var(--text-muted)]">Empty Result Rate: {data.searchQuality.emptyResultRate}%</div>
          </div>
        </Card>

        {/* Embedding Performance */}
        <Card>
          <CardHeader><CardTitle helpId="chart-embedding-performance">Embedding Performance</CardTitle></CardHeader>
          <div className="space-y-2 text-xs">
            {[
              { label: 'Model', value: data.embeddingPerf.model },
              { label: 'Dimensions', value: data.embeddingPerf.dimensions.toLocaleString() },
              { label: 'Batch Size', value: data.embeddingPerf.batchSize },
              { label: 'P95 Latency', value: `${data.embeddingPerf.p95Latency}ms` },
              { label: 'Throughput', value: `${data.embeddingPerf.throughput} doc/s` },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-[var(--text-muted)]">{item.label}</span>
                <span className="font-medium text-[var(--text-primary)]">{item.value}</span>
              </div>
            ))}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="text-[var(--text-secondary)]">Cache Hit Rate</span>
                <span className="font-medium text-[var(--text-primary)]">{data.embeddingPerf.cacheHitRate}%</span>
              </div>
              <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[var(--status-healthy)]" style={{ width: `${data.embeddingPerf.cacheHitRate}%` }} />
              </div>
            </div>
          </div>
        </Card>

        {/* VectorDB Status */}
        <Card>
          <CardHeader><CardTitle helpId="chart-vector-db">Vector DB ({data.vectorDB.engine})</CardTitle></CardHeader>
          <div className="space-y-2 text-xs">
            {[
              { label: 'Collection', value: data.vectorDB.collection },
              { label: 'Vectors', value: data.vectorDB.vectorCount.toLocaleString() },
              { label: 'Segments', value: data.vectorDB.segments },
              { label: 'Index', value: data.vectorDB.indexType },
              { label: 'Disk', value: data.vectorDB.diskUsage },
              { label: 'Search P99', value: `${data.vectorDB.searchP99}ms` },
              { label: 'Insert P99', value: `${data.vectorDB.insertP99}ms` },
              { label: 'Availability', value: `${data.vectorDB.availability}%` },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-[var(--text-muted)]">{item.label}</span>
                <span className="font-medium text-[var(--text-primary)]">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Guardrail Tab ──

function GuardrailTab() {
  const data = useMemo(() => getGuardrailData(), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const violationOption = useMemo<any>(() => ({
    animation: false,
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.violations.map((v) => v.label).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: [...data.violations].reverse().map((v) => v.count), itemStyle: { color: '#F85149' }, barWidth: '50%' }],
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 24, top: 8, bottom: 8 },
  }), [data.violations]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard helpId="guardrail-total-checks" title="Total Checks" value={data.totalChecks.toLocaleString()} status="healthy" />
        <KPICard helpId="guardrail-blocked" title="Blocked" value={data.blockCount} status={data.blockRate > 5 ? 'critical' : data.blockRate > 3 ? 'warning' : 'healthy'} />
        <KPICard helpId="guardrail-block-rate" title="Block Rate" value={`${data.blockRate}%`} subtitle="Threshold: 5%" status={data.blockRate > 5 ? 'critical' : 'healthy'} sparkData={[1.8, 2.0, 1.9, 2.2, 2.1, 2.0, 2.3, 2.1, 2.0, data.blockRate]} />
        <KPICard helpId="guardrail-latency-contrib" title="Latency Contrib" value={`${data.latencyContribution}%`} subtitle="of total response time" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle helpId="chart-block-rate-trend">Block Rate Trend</CardTitle></CardHeader>
          <TimeSeriesChart series={[
            { name: 'Block Rate', data: generateTimeSeries(data.blockRate, 0.8, 60), type: 'area', color: '#F85149' },
          ]} yAxisLabel="%" thresholdLine={{ value: 5, label: '5%', color: '#D29922' }} height={220} />
        </Card>
        <Card>
          <CardHeader><CardTitle helpId="chart-violation-types">Violation Types</CardTitle></CardHeader>
          <EChartsWrapper option={violationOption} height={220} />
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle helpId="chart-guardrail-latency">Guardrail Latency</CardTitle></CardHeader>
        <TimeSeriesChart series={[
          { name: 'Input Check', data: generateTimeSeries(50, 15, 60), color: '#9B59B6' },
          { name: 'Output Check', data: generateTimeSeries(80, 20, 60), color: '#BC8CFF' },
        ]} yAxisLabel="ms" height={180} />
      </Card>
    </div>
  );
}
