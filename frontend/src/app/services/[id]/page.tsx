'use client';

import { useState, use, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, Badge, Button, DataSourceBadge } from '@/components/ui';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { useProjectStore } from '@/stores/project-store';
import { useDataSource } from '@/hooks/use-data-source';
import {
  getProjectServices,
  getProjectHosts,
  getServiceEndpoints,
  getServiceDeployments,
  getServiceDependencies,
  generateXLogScatterData,
  generateTimeSeries,
  getRecentTraces,
} from '@/lib/demo-data';
import { formatDuration } from '@/lib/utils';
import {
  Network,
  Activity,
  Globe,
  GitBranch,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Rocket,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Search,
} from 'lucide-react';

import { Server, Layers, Database } from 'lucide-react';

// Instance type from API
interface InstanceItem {
  id: string;
  service_id: string;
  host_id: string;
  hostname: string;
  endpoint: string;
  pid: number;
  status: string;
  cpu_pct: number;
  mem_mb: number;
  updated_at: string;
}

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
  : 'http://localhost:8080/api/v1';

const SERVICE_TABS = [
  { id: 'overview', label: 'Overview', icon: <Activity size={13} /> },
  { id: 'instances', label: 'Instances', icon: <Server size={13} /> },
  { id: 'endpoints', label: 'Endpoints', icon: <Globe size={13} /> },
  { id: 'xlog', label: 'XLog', icon: <Search size={13} /> },
  { id: 'traces', label: 'Traces', icon: <GitBranch size={13} /> },
  { id: 'errors', label: 'Errors', icon: <AlertTriangle size={13} /> },
  { id: 'databases', label: 'Databases', icon: <Database size={13} /> },
  { id: 'dependencies', label: 'Dependencies', icon: <Network size={13} /> },
  { id: 'deployments', label: 'Deployments', icon: <Rocket size={13} /> },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-[#1F6FEB]/20 text-[#58A6FF]',
  POST: 'bg-[#238636]/20 text-[#3FB950]',
  PUT: 'bg-[#9E6A03]/20 text-[#D29922]',
  DELETE: 'bg-[#DA3633]/20 text-[#F85149]',
  PATCH: 'bg-[#8B5CF6]/20 text-[#BC8CFF]',
};

const DEPLOY_STATUS_ICON = {
  'success': <CheckCircle2 size={14} className="text-[var(--status-healthy)]" />,
  'failed': <XCircle size={14} className="text-[var(--status-critical)]" />,
  'rolling-back': <RotateCcw size={14} className="text-[var(--status-warning)]" />,
  'in-progress': <Loader2 size={14} className="text-[var(--accent-primary)] animate-spin" />,
};

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectId = currentProjectId ?? 'proj-ai-prod';

  // Try live API first, fallback to demo
  const demoService = useCallback(() => {
    const services = getProjectServices(projectId);
    return services.find((s) => s.id === id || s.name === id) ?? null;
  }, [projectId, id]);

  const { data: liveService, source } = useDataSource(
    `/services/${id}`,
    demoService,
  );

  // Map API response to Service type
  const service = liveService ? (typeof liveService === 'object' && 'latencyP50' in liveService
    ? liveService
    : {
        id: String((liveService as Record<string, unknown>).id ?? id),
        name: String((liveService as Record<string, unknown>).name ?? id),
        framework: String((liveService as Record<string, unknown>).framework ?? '-'),
        language: String((liveService as Record<string, unknown>).language ?? '-'),
        hostIds: ((liveService as Record<string, unknown>).host_ids as string[] | undefined) ?? [],
        latencyP50: 0, latencyP95: 0, latencyP99: 0, rpm: 0, errorRate: 0,
        status: 'healthy' as const,
      }
  ) : null;

  // Instances from API
  const [instances, setInstances] = useState<InstanceItem[]>([]);
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/instances?service_id=${id}`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) setInstances(d.items); })
      .catch(() => {});
  }, [id]);

  const [activeTab, setActiveTab] = useState('overview');
  const [epSortBy, setEpSortBy] = useState<'rpm' | 'p95' | 'error'>('rpm');
  const [epSortDir, setEpSortDir] = useState<'asc' | 'desc'>('desc');

  // Data hooks (always called, even if service is null)
  const endpoints = useMemo(() => service ? getServiceEndpoints(id) : [], [id, service]);
  const deployments = useMemo(() => service ? getServiceDeployments(id) : [], [id, service]);
  const dependencies = useMemo(() => service ? getServiceDependencies(id) : [], [id, service]);
  const xlogData = useMemo(() => service ? generateXLogScatterData(service, 500) : [], [service]);

  const hosts = getProjectHosts(projectId);
  const serviceHosts = useMemo(
    () => service ? hosts.filter((h) => (service.hostIds ?? []).includes(h.id)) : [],
    [service, hosts],
  );

  // Saturation: avg CPU/MEM across service hosts
  const saturation = useMemo(() => {
    if (serviceHosts.length === 0) return { cpu: 0, mem: 0, gpu: null as number | null };
    const avgCpu = serviceHosts.reduce((s, h) => s + h.cpuPercent, 0) / serviceHosts.length;
    const avgMem = serviceHosts.reduce((s, h) => s + h.memPercent, 0) / serviceHosts.length;
    const gpuHosts = serviceHosts.filter((h) => h.gpus && h.gpus.length > 0);
    const avgGpu = gpuHosts.length > 0
      ? gpuHosts.reduce((s, h) => s + (h.gpus?.[0]?.vramPercent ?? 0), 0) / gpuHosts.length
      : null;
    return { cpu: Math.round(avgCpu), mem: Math.round(avgMem), gpu: avgGpu ? Math.round(avgGpu) : null };
  }, [serviceHosts]);

  // Sorted endpoints for Endpoints tab
  const sortedEndpoints = useMemo(() => {
    const sorted = [...endpoints];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (epSortBy === 'rpm') cmp = a.rpm - b.rpm;
      else if (epSortBy === 'p95') cmp = a.latencyP95 - b.latencyP95;
      else if (epSortBy === 'error') cmp = a.errorRate - b.errorRate;
      return epSortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [endpoints, epSortBy, epSortDir]);

  // XLog ECharts option
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xlogOption = useMemo<any>(() => {
    const normal = xlogData.filter((d) => !d[2]).map((d) => [d[0], d[1]]);
    const errors = xlogData.filter((d) => d[2]).map((d) => [d[0], d[1]]);
    return {
      animation: false,
      xAxis: { type: 'time' as const },
      yAxis: {
        type: 'value' as const,
        name: 'ms',
        nameTextStyle: { color: '#8B949E', fontSize: 10, padding: [0, 0, 0, -30] },
      },
      series: [
        {
          name: 'Normal',
          type: 'scatter' as const,
          data: normal,
          symbolSize: 3,
          itemStyle: { color: '#58A6FF', opacity: 0.6 },
        },
        {
          name: 'Error',
          type: 'scatter' as const,
          data: errors,
          symbolSize: 4,
          itemStyle: { color: '#F85149', opacity: 0.8 },
        },
      ],
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: { seriesName: string; data: number[] }) =>
          `${p.seriesName}<br/>Response: ${Math.round(p.data[1])}ms`,
      },
      legend: {
        show: true,
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 52, right: 16, top: 24, bottom: 36 },
      dataZoom: [{ type: 'inside' as const }, { type: 'slider' as const, height: 16, bottom: 52 }],
    };
  }, [xlogData]);

  const upstream = dependencies.filter((d) => d.direction === 'upstream');
  const downstream = dependencies.filter((d) => d.direction === 'downstream');

  if (!service) {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-4xl">404</div>
        <div className="text-sm text-[var(--text-muted)]">Service &quot;{id}&quot; not found</div>
        <Button variant="secondary" onClick={() => router.push('/services')}>Back to Services</Button>
      </div>
    );
  }

  const handleEpSort = (col: typeof epSortBy) => {
    if (epSortBy === col) setEpSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setEpSortBy(col); setEpSortDir('desc'); }
  };
  const epSortIcon = (col: typeof epSortBy) => epSortBy === col ? (epSortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Services', href: '/services', icon: <Network size={14} /> },
        { label: service.name },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusIndicator status={service.status} size="lg" pulse={service.status === 'critical'} />
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{service.name}</h1>
            <DataSourceBadge source={source} />
            {instances.length > 0 && (
              <Badge>{instances.length} instance{instances.length > 1 ? 's' : ''}</Badge>
            )}
            <Badge variant="status" status={service.status}>{service.status}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
            <span>{service.framework}</span>
            <span>{service.language}</span>
            <span className="flex items-center gap-1">
              {serviceHosts.length} host{serviceHosts.length !== 1 && 's'}
              {serviceHosts.map((h) => (
                <Link
                  key={h.id}
                  href={`/infra/${h.hostname}`}
                  className="text-[var(--accent-primary)] hover:underline"
                >
                  {h.hostname}
                </Link>
              ))}
            </span>
          </div>
        </div>
      </div>

      <Tabs tabs={SERVICE_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Golden Signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              helpId="svc-latency-p95"
              title="Latency (P95)"
              value={formatDuration(service.latencyP95)}
              subtitle={`P50: ${formatDuration(service.latencyP50)} / P99: ${formatDuration(service.latencyP99)}`}
              status={service.latencyP95 > 2000 ? 'critical' : service.latencyP95 > 500 ? 'warning' : 'healthy'}
              sparkData={[180, 210, 195, 230, 245, 220, 260, 240, 250, service.latencyP95 / 10]}
            />
            <KPICard
              helpId="svc-traffic"
              title="Traffic"
              value={(service.rpm ?? 0).toLocaleString()}
              unit="rpm"
              trend={{ direction: 'up', value: '+12%', positive: true }}
              status="healthy"
              sparkData={[900, 950, 1020, 980, 1050, 1100, 1080, 1120, 1150, service.rpm]}
            />
            <KPICard
              helpId="svc-error-rate"
              title="Error Rate"
              value={(service.errorRate ?? 0).toFixed(2)}
              unit="%"
              status={service.errorRate > 1 ? 'critical' : service.errorRate > 0.1 ? 'warning' : 'healthy'}
              sparkData={[0.1, 0.12, 0.08, 0.15, 0.11, 0.09, 0.13, 0.1, 0.12, service.errorRate]}
            />
            <KPICard
              helpId="svc-saturation"
              title="Saturation"
              value={`${saturation.cpu}%`}
              subtitle={`MEM ${saturation.mem}%${saturation.gpu !== null ? ` / GPU ${saturation.gpu}%` : ''}`}
              status={saturation.cpu > 85 ? 'critical' : saturation.cpu > 70 ? 'warning' : 'healthy'}
              sparkData={[40, 45, 48, 52, 55, 50, 58, 55, 52, saturation.cpu]}
            />
          </div>

          {/* Time Series Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card>
              <CardHeader><CardTitle helpId="chart-svc-latency">Latency</CardTitle></CardHeader>
              <TimeSeriesChart
                series={[
                  { name: 'P50', data: generateTimeSeries(service.latencyP50, service.latencyP50 * 0.2, 60), color: '#3FB950' },
                  { name: 'P95', data: generateTimeSeries(service.latencyP95, service.latencyP95 * 0.15, 60), color: '#D29922' },
                  { name: 'P99', data: generateTimeSeries(service.latencyP99, service.latencyP99 * 0.1, 60), color: '#F85149', dashStyle: true },
                ]}
                yAxisLabel="ms"
                height={200}
              />
            </Card>
            <Card>
              <CardHeader><CardTitle helpId="chart-svc-traffic">Traffic (RPM)</CardTitle></CardHeader>
              <TimeSeriesChart
                series={[
                  { name: 'RPM', data: generateTimeSeries(service.rpm, service.rpm * 0.15, 60), type: 'area', color: '#58A6FF' },
                ]}
                yAxisLabel="rpm"
                height={200}
              />
            </Card>
            <Card>
              <CardHeader><CardTitle helpId="chart-svc-error-rate">Error Rate</CardTitle></CardHeader>
              <TimeSeriesChart
                series={[
                  { name: 'Error Rate', data: generateTimeSeries(service.errorRate, service.errorRate * 0.3, 60), type: 'area', color: '#F85149' },
                ]}
                yAxisLabel="%"
                thresholdLine={{ value: 1, label: 'SLO 1%', color: '#F85149' }}
                height={200}
              />
            </Card>
          </div>

          {/* XLog Scatter */}
          <Card>
            <CardHeader>
              <CardTitle helpId="chart-xlog-scatter">XLog (Response Distribution)</CardTitle>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#58A6FF]" /> Normal</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#F85149]" /> Error</span>
              </div>
            </CardHeader>
            <EChartsWrapper option={xlogOption} height={280} />
          </Card>

          {/* Endpoint Top 10 */}
          <Card padding="none">
            <div className="px-4 pt-3 pb-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Endpoints by RPM</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2 font-medium">Endpoint</th>
                    <th className="px-4 py-2 font-medium text-right">RPM</th>
                    <th className="px-4 py-2 font-medium text-right">P95</th>
                    <th className="px-4 py-2 font-medium text-right">Error %</th>
                    <th className="px-4 py-2 font-medium" style={{ width: 120 }}>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.slice(0, 10).map((ep) => (
                    <tr key={ep.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                      <td className="px-4 py-2">
                        <span className={cn('inline-block px-1.5 py-0.5 text-[10px] font-bold rounded mr-2', METHOD_COLORS[ep.method])}>
                          {ep.method}
                        </span>
                        <span className="font-mono text-[var(--text-primary)]">{ep.path}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{ep.rpm.toLocaleString()}</td>
                      <td className={cn('px-4 py-2 text-right tabular-nums', ep.latencyP95 > 1000 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]')}>
                        {formatDuration(ep.latencyP95)}
                      </td>
                      <td className={cn('px-4 py-2 text-right tabular-nums', ep.errorRate > 0.2 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>
                        {ep.errorRate}%
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--accent-primary)] rounded-full" style={{ width: `${ep.contribution}%` }} />
                          </div>
                          <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-8 text-right">{ep.contribution}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Endpoints Tab ── */}
      {activeTab === 'endpoints' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Endpoint</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleEpSort('rpm')}>RPM{epSortIcon('rpm')}</th>
                  <th className="px-4 py-2.5 font-medium text-right">P50</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleEpSort('p95')}>P95{epSortIcon('p95')}</th>
                  <th className="px-4 py-2.5 font-medium text-right">P99</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleEpSort('error')}>Error %{epSortIcon('error')}</th>
                  <th className="px-4 py-2.5 font-medium" style={{ width: 120 }}>Contribution</th>
                </tr>
              </thead>
              <tbody>
                {sortedEndpoints.map((ep) => (
                  <tr key={ep.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                    <td className="px-4 py-2.5">
                      <span className={cn('inline-block px-1.5 py-0.5 text-[10px] font-bold rounded mr-2', METHOD_COLORS[ep.method])}>
                        {ep.method}
                      </span>
                      <span className="font-mono text-[var(--text-primary)]">{ep.path}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{ep.rpm.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(ep.latencyP50)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', ep.latencyP95 > 1000 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>
                      {formatDuration(ep.latencyP95)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(ep.latencyP99)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', ep.errorRate > 0.2 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>
                      {ep.errorRate}%
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent-primary)] rounded-full" style={{ width: `${ep.contribution}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-8 text-right">{ep.contribution}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {endpoints.length === 0 && <div className="text-center py-12 text-sm text-[var(--text-muted)]">No endpoints found.</div>}
        </Card>
      )}

      {/* ── XLog Tab ── */}
      {activeTab === 'xlog' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle helpId="chart-xlog-scatter">XLog Scatter Plot</CardTitle>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#58A6FF]" /> Normal</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#F85149]" /> Error</span>
              </div>
            </CardHeader>
            <EChartsWrapper option={xlogOption} height={400} />
          </Card>
          <div className="text-center">
            <Link href="/traces" className="text-xs text-[var(--accent-primary)] hover:underline">
              Open full XLog / HeatMap dashboard &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* ── Traces Tab (Placeholder) ── */}
      {activeTab === 'traces' && (
        <TracesTab serviceName={service.name} />
      )}

      {/* ── Errors Tab (Placeholder) ── */}
      {activeTab === 'errors' && (
        <Card>
          <div className="text-center py-16 space-y-3">
            <AlertTriangle size={32} className="mx-auto text-[var(--text-muted)]" />
            <div className="text-sm font-medium text-[var(--text-secondary)]">Error Tracking</div>
            <div className="text-xs text-[var(--text-muted)]">Coming in Phase 11-4 &mdash; Error grouping and stack traces</div>
          </div>
        </Card>
      )}

      {/* ── E1-4: Databases Tab ── */}
      {activeTab === 'databases' && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Database size={14} className="inline mr-1 text-[var(--accent-primary)]" />
              연결된 데이터베이스
            </CardTitle>
          </CardHeader>
          <div className="text-xs text-[var(--text-muted)] px-4 pb-2">
            이 서비스의 트레이스에서 자동 감지된 데이터베이스 연결입니다.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2 font-medium">System</th>
                  <th className="px-4 py-2 font-medium">Database</th>
                  <th className="px-4 py-2 font-medium">Endpoint</th>
                  <th className="px-4 py-2 font-medium text-right">Queries</th>
                  <th className="px-4 py-2 font-medium text-right">Avg Latency</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Demo: placeholder database rows */}
                {[
                  { system: 'PostgreSQL', name: 'main_db', endpoint: 'prod-db-01:5432', queries: 15420, avgMs: 12.3, status: 'online' },
                  { system: 'Redis', name: 'cache', endpoint: 'prod-cache-01:6379', queries: 48200, avgMs: 0.8, status: 'online' },
                  { system: 'Qdrant', name: 'vectors', endpoint: 'prod-qdrant-01:6333', queries: 3200, avgMs: 45.6, status: 'online' },
                ].map((db) => (
                  <tr key={db.endpoint} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                    <td className="px-4 py-2 font-medium text-[var(--text-primary)]">{db.system}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{db.name}</td>
                    <td className="px-4 py-2 font-mono text-[var(--text-muted)]">{db.endpoint}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{db.queries.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{db.avgMs}ms</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 text-[var(--status-healthy)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {db.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Dependencies Tab ── */}
      {activeTab === 'dependencies' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upstream */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ArrowDownRight size={14} className="inline mr-1 text-[var(--accent-primary)]" />
                Upstream (Callers)
              </CardTitle>
            </CardHeader>
            {upstream.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium text-right">RPM</th>
                      <th className="px-3 py-2 font-medium text-right">Error %</th>
                      <th className="px-3 py-2 font-medium text-right">P95</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upstream.map((dep) => (
                      <tr key={dep.serviceId} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                        <td className="px-3 py-2">
                          {dep.serviceId.startsWith('s-') ? (
                            <Link href={`/services/${dep.serviceId}`} className="text-[var(--accent-primary)] hover:underline font-medium">
                              {dep.serviceName}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-primary)] font-medium">{dep.serviceName}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{dep.rpm.toLocaleString()}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', dep.errorRate > 0.5 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>
                          {dep.errorRate}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(dep.latencyP95)}</td>
                        <td className="px-3 py-2"><StatusIndicator status={dep.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-[var(--text-muted)]">No upstream callers</div>
            )}
          </Card>

          {/* Downstream */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ArrowUpRight size={14} className="inline mr-1 text-[var(--status-warning)]" />
                Downstream (Dependencies)
              </CardTitle>
            </CardHeader>
            {downstream.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                      <th className="px-3 py-2 font-medium">Service</th>
                      <th className="px-3 py-2 font-medium text-right">RPM</th>
                      <th className="px-3 py-2 font-medium text-right">Error %</th>
                      <th className="px-3 py-2 font-medium text-right">P95</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downstream.map((dep) => (
                      <tr key={dep.serviceId} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                        <td className="px-3 py-2">
                          {dep.serviceId.startsWith('s-') ? (
                            <Link href={`/services/${dep.serviceId}`} className="text-[var(--accent-primary)] hover:underline font-medium">
                              {dep.serviceName}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-primary)] font-medium">{dep.serviceName}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{dep.rpm.toLocaleString()}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', dep.errorRate > 0.5 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>
                          {dep.errorRate}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(dep.latencyP95)}</td>
                        <td className="px-3 py-2"><StatusIndicator status={dep.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-[var(--text-muted)]">No downstream dependencies</div>
            )}
          </Card>
        </div>
      )}

      {/* ── Instances Tab ── */}
      {activeTab === 'instances' && (
        <Card padding="none">
          {instances.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Server size={28} className="mx-auto text-[var(--text-muted)] opacity-40" />
              <div className="text-sm text-[var(--text-muted)]">
                {source === 'live' ? 'No instances detected yet — Agent sync in progress' : 'Instance data available in Live mode'}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2.5 font-medium">Host</th>
                    <th className="px-4 py-2.5 font-medium">Endpoint</th>
                    <th className="px-4 py-2.5 font-medium">PID</th>
                    <th className="px-4 py-2.5 font-medium text-right">CPU %</th>
                    <th className="px-4 py-2.5 font-medium text-right">MEM (MB)</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((inst) => (
                    <tr key={inst.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                      <td className="px-4 py-2.5">
                        <Link href={`/infra/${inst.hostname}`} className="text-[var(--accent-primary)] hover:underline font-medium">
                          {inst.hostname}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{inst.endpoint}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--text-muted)]">{inst.pid || '-'}</td>
                      <td className={cn('px-4 py-2.5 text-right tabular-nums', inst.cpu_pct > 80 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>
                        {inst.cpu_pct > 0 ? inst.cpu_pct.toFixed(1) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                        {inst.mem_mb > 0 ? inst.mem_mb.toFixed(1) : '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusIndicator
                          status={inst.status === 'running' ? 'healthy' : inst.status === 'error' ? 'critical' : 'offline'}
                          label={inst.status}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">
                        {inst.updated_at ? new Date(inst.updated_at).toLocaleTimeString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Deployments Tab ── */}
      {activeTab === 'deployments' && (
        <Card>
          <CardHeader><CardTitle>Recent Deployments</CardTitle></CardHeader>
          <div className="space-y-0">
            {deployments.map((deploy, idx) => (
              <div
                key={deploy.id}
                className={cn(
                  'flex items-start gap-4 py-3 px-2',
                  idx < deployments.length - 1 && 'border-b border-[var(--border-muted)]',
                )}
              >
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center pt-0.5">
                  {DEPLOY_STATUS_ICON[deploy.status]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="tag" className="font-mono text-[10px]">{deploy.version}</Badge>
                    <Badge
                      variant="status"
                      status={deploy.status === 'success' ? 'healthy' : deploy.status === 'failed' ? 'critical' : 'warning'}
                    >
                      {deploy.status}
                    </Badge>
                    <span className="text-[10px] text-[var(--text-muted)]">{deploy.duration}s</span>
                  </div>
                  <div className="text-xs text-[var(--text-primary)] mt-1">{deploy.description}</div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                    <span>{deploy.deployer}</span>
                    <span className="font-mono">{deploy.commitHash}</span>
                    <span>{new Date(deploy.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
            {deployments.length === 0 && (
              <div className="text-center py-8 text-xs text-[var(--text-muted)]">No deployment history</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── TracesTab component ──

function TracesTab({ serviceName }: { serviceName: string }) {
  const traces = useMemo(() => getRecentTraces(15, serviceName), [serviceName]);

  return (
    <div className="space-y-3">
      <Card padding="none">
        <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            Recent Traces ({traces.length})
          </span>
          <Link href="/traces" className="text-xs text-[var(--accent-primary)] hover:underline">
            Open full XLog dashboard &rarr;
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2 font-medium">Trace ID</th>
                <th className="px-4 py-2 font-medium">Endpoint</th>
                <th className="px-4 py-2 font-medium text-right">Duration</th>
                <th className="px-4 py-2 font-medium text-right">Spans</th>
                <th className="px-4 py-2 font-medium text-right">Services</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr key={trace.traceId} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <td className="px-4 py-2">
                    <Link href={`/traces/${trace.traceId}`} className="font-mono text-[var(--accent-primary)] hover:underline">
                      {trace.traceId.slice(0, 12)}...
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-[var(--text-primary)]">{trace.rootEndpoint}</td>
                  <td className={cn(
                    'px-4 py-2 text-right tabular-nums',
                    trace.duration > 2000 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]',
                  )}>
                    {formatDuration(trace.duration)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{trace.spanCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{trace.serviceCount}</td>
                  <td className="px-4 py-2">
                    {trace.errorCount > 0 ? (
                      <span className="text-[var(--status-critical)] font-medium">Error</span>
                    ) : (
                      <span className="text-[var(--status-healthy)]">OK</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[var(--text-muted)] tabular-nums">
                    {new Date(trace.startTime).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {traces.length === 0 && (
          <div className="text-center py-12 text-sm text-[var(--text-muted)]">No traces found for this service.</div>
        )}
      </Card>
    </div>
  );
}
