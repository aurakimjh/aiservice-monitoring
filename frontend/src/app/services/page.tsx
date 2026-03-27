'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, SearchInput, Select, Button, Badge, DataSourceBadge } from '@/components/ui';
import { StatusIndicator, KPICard, ServiceMap } from '@/components/monitoring';
import { useProjectStore } from '@/stores/project-store';
import { getProjectServices, getServiceTopology, LAYER_CONFIG, type ServiceLayer } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { formatDuration } from '@/lib/utils';
import type { Service } from '@/types/monitoring';
import { Network, List, GitBranch, Plus } from 'lucide-react';

const VIEW_TABS = [
  { id: 'list', label: 'List', icon: <List size={13} /> },
  { id: 'map', label: 'Service Map', icon: <GitBranch size={13} /> },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
];

const LAYER_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Layers', value: 'all' },
  ...Object.entries(LAYER_CONFIG).map(([k, v]) => ({ label: v.label, value: k })),
];

// Transform /services API → Service[]
function transformServices(raw: unknown): Service[] {
  const resp = raw as { items?: Array<Record<string, unknown>> };
  if (!resp.items?.length) return [];
  return resp.items.map((item) => ({
    id: String(item.id ?? item.name),
    name: String(item.name ?? ''),
    framework: String(item.framework || '-'),
    language: String(item.language || '-'),
    hostIds: Array.isArray(item.host_ids) ? item.host_ids as string[] : [],
    latencyP50: Math.round(Number(item.latency_p50 ?? 0)),
    latencyP95: Math.round(Number(item.latency_p95 ?? 0)),
    latencyP99: Math.round(Number(item.latency_p99 ?? 0)),
    rpm: Math.round(Number(item.rpm ?? 0)),
    errorRate: Math.round(Number(item.error_rate ?? 0) * 100) / 100,
    status: (item.status === 'critical' ? 'critical' : item.status === 'warning' ? 'warning' : 'healthy') as 'healthy' | 'warning' | 'critical',
  }));
}

export default function ServicesPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const demoServices = useCallback(
    () => getProjectServices(currentProjectId ?? 'proj-ai-prod'),
    [currentProjectId],
  );
  const demoTopology = useCallback(
    () => getServiceTopology(currentProjectId ?? 'proj-ai-prod'),
    [currentProjectId],
  );

  const servicesApiPath = currentProjectId
    ? `/services?project_id=${currentProjectId}`
    : '/services';

  const { data: services, source } = useDataSource<Service[]>(
    servicesApiPath,
    demoServices,
    { refreshInterval: 30_000, transform: transformServices },
  );
  const { data: topology } = useDataSource(
    '/proxy/jaeger/dependencies',
    demoTopology,
    { refreshInterval: 60_000 },
  );

  const serviceList = services ?? [];
  const topoData = topology ?? { nodes: [], edges: [] };

  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [layerFilter, setLayerFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'p95' | 'rpm' | 'error'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    const result = serviceList.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'p95') cmp = a.latencyP95 - b.latencyP95;
      else if (sortBy === 'rpm') cmp = a.rpm - b.rpm;
      else if (sortBy === 'error') cmp = a.errorRate - b.errorRate;
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [serviceList, search, statusFilter, sortBy, sortDir]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  };
  const sortIcon = (col: typeof sortBy) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const activeLayerFilter: ServiceLayer[] | undefined =
    layerFilter === 'all' ? undefined : [layerFilter as ServiceLayer];

  // KPI
  const total = serviceList.length;
  const healthy = serviceList.filter((s) => s.status === 'healthy').length;
  const avgP95 = total > 0 ? Math.round(serviceList.reduce((s, sv) => s + sv.latencyP95, 0) / total) : 0;
  const totalRpm = serviceList.reduce((s, sv) => s + sv.rpm, 0);
  const avgError = total > 0 ? (serviceList.reduce((s, sv) => s + sv.errorRate, 0) / total) : 0;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Services (APM)', icon: <Network size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Services</h1>
          <DataSourceBadge source={source} />
        </div>
        <Button variant="secondary" size="md"><Plus size={14} /> Register Service</Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard title="Total Services" value={total} subtitle={`${healthy} healthy`} status="healthy" />
        <KPICard title="Avg P95 Latency" value={avgP95} unit="ms" status={avgP95 > 1000 ? 'warning' : 'healthy'} />
        <KPICard title="Total Throughput" value={totalRpm.toLocaleString()} unit="rpm" status="healthy" />
        <KPICard title="Avg Error Rate" value={avgError.toFixed(2)} unit="%" status={avgError > 0.5 ? 'warning' : 'healthy'} />
        <KPICard title="Dependencies" value={topoData.edges?.length ?? 0} subtitle="call relationships" />
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput placeholder="Search services..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
        {view === 'map' && (
          <Select options={LAYER_OPTIONS} value={layerFilter} onChange={(e) => setLayerFilter(e.target.value)} />
        )}
        <div className="ml-auto">
          <Tabs tabs={VIEW_TABS} activeTab={view} onChange={setView} variant="pill" />
        </div>
      </div>

      {/* List View */}
      {view === 'list' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('name')}>Service{sortIcon('name')}</th>
                  <th className="px-4 py-2.5 font-medium">Framework</th>
                  <th className="px-4 py-2.5 font-medium text-right">P50</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('p95')}>P95{sortIcon('p95')}</th>
                  <th className="px-4 py-2.5 font-medium text-right">P99</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('rpm')}>RPM{sortIcon('rpm')}</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('error')}>Error Rate{sortIcon('error')}</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/services/${s.id}`} className="font-medium text-[var(--accent-primary)] hover:underline">
                        <Network size={12} className="inline mr-1.5 text-[var(--text-muted)]" />
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {s.framework} <span className="text-[var(--text-muted)]">({s.language})</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(s.latencyP50)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', s.latencyP95 > 2000 ? 'text-[var(--status-critical)]' : s.latencyP95 > 500 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>
                      {formatDuration(s.latencyP95)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(s.latencyP99)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{s.rpm.toLocaleString()}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', s.errorRate > 0.5 ? 'text-[var(--status-critical)] font-medium' : s.errorRate > 0.1 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>
                      {s.errorRate}%
                    </td>
                    <td className="px-4 py-2.5"><StatusIndicator status={s.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-sm text-[var(--text-muted)]">No services match your filters.</div>}
        </Card>
      )}

      {/* Service Map View */}
      {view === 'map' && (
        <Card>
          <CardHeader>
            <CardTitle>Service Topology</CardTitle>
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              {Object.entries(LAYER_CONFIG).map(([key, config]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                  {config.label.split(': ')[1]}
                </span>
              ))}
            </div>
          </CardHeader>
          <ServiceMap
            nodes={topoData.nodes ?? []}
            edges={topoData.edges ?? []}
            layerFilter={activeLayerFilter}
            onNodeClick={(id) => {
              const svc = serviceList.find((s) => s.id === id || s.name === (topoData.nodes ?? []).find((n: { id: string; name?: string }) => n.id === id)?.name);
              if (svc) window.location.href = `/services/${svc.id}`;
            }}
          />
          <div className="mt-3 pt-3 border-t border-[var(--border-muted)] text-[10px] text-[var(--text-muted)]">
            Node size = throughput (RPM) &middot; Node color = health status &middot; Edge thickness = call volume &middot; Drag nodes to rearrange &middot; Scroll to zoom
          </div>
        </Card>
      )}
    </div>
  );
}
