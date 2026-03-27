'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, SearchInput, Select, Button, Badge, DataSourceBadge } from '@/components/ui';
import { StatusIndicator, KPICard, HexagonMap, type HexCell } from '@/components/monitoring';
import { useProjectStore } from '@/stores/project-store';
import { getProjectHosts } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import type { Host, Status } from '@/types/monitoring';
import { Server, Table2, Hexagon, Plus } from 'lucide-react';

const VIEW_TABS = [
  { id: 'table', label: 'Table', icon: <Table2 size={13} /> },
  { id: 'hexagon', label: 'Host Map', icon: <Hexagon size={13} /> },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
  { label: 'Offline', value: 'offline' },
];

const SIZE_METRIC_OPTIONS = [
  { label: 'CPU %', value: 'cpu' },
  { label: 'Memory %', value: 'mem' },
  { label: 'Disk %', value: 'disk' },
];

// Transform API /realdata/hosts response → Host[]
function transformHosts(raw: unknown): Host[] {
  const resp = raw as { items?: Array<Record<string, unknown>> };
  if (!resp.items?.length) return [];
  return resp.items.map((item) => ({
    id: String(item.id ?? item.hostname),
    hostname: String(item.hostname ?? 'unknown'),
    os: `${item.os_type ?? 'Linux'} ${item.os_version ?? ''}`.trim(),
    cpuCores: 0,
    memoryGB: 0,
    status: mapAgentStatus(String(item.status ?? 'offline')),
    cpuPercent: Math.round(Number(item.cpu_percent ?? 0)),
    memPercent: item.memory_mb ? Math.round(Number(item.memory_mb) / 1024 / 32 * 100) : 0,
    diskPercent: 0,
    netIO: '-',
    middlewares: [],
    agent: {
      id: String(item.id),
      hostId: String(item.id),
      version: String(item.agent_version ?? '0.0.0'),
      status: mapAgentStatus(String(item.status ?? 'offline')) === 'healthy' ? 'healthy' : 'degraded',
      plugins: Array.isArray(item.collectors)
        ? (item.collectors as Array<Record<string, string>>).map((c) => ({
            id: c.plugin_id, name: c.plugin_id, version: c.version ?? '1.0.0',
            status: c.status === 'active' ? 'active' as const : 'inactive' as const,
            itemsCovered: [],
          }))
        : [],
      lastHeartbeat: String(item.last_heartbeat ?? new Date().toISOString()),
      lastCollection: String(item.last_heartbeat ?? new Date().toISOString()),
      mode: 'full' as const,
    },
  }));
}

function mapAgentStatus(s: string): Status {
  if (s === 'online' || s === 'healthy' || s === 'approved') return 'healthy';
  if (s === 'degraded') return 'warning';
  return 'critical';
}

export default function InfraPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const demoFallback = useCallback(
    () => getProjectHosts(currentProjectId ?? 'proj-ai-prod'),
    [currentProjectId],
  );

  const { data: hosts, source } = useDataSource<Host[]>(
    '/realdata/hosts',
    demoFallback,
    { refreshInterval: 30_000, transform: transformHosts },
  );

  const hostList = hosts ?? [];

  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sizeMetric, setSizeMetric] = useState('cpu');
  const [sortBy, setSortBy] = useState<'hostname' | 'cpu' | 'mem' | 'disk'>('hostname');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    const result = hostList.filter((h) => {
      if (search && !h.hostname.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && h.status !== statusFilter) return false;
      return true;
    });
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'hostname') cmp = a.hostname.localeCompare(b.hostname);
      else if (sortBy === 'cpu') cmp = a.cpuPercent - b.cpuPercent;
      else if (sortBy === 'mem') cmp = a.memPercent - b.memPercent;
      else if (sortBy === 'disk') cmp = a.diskPercent - b.diskPercent;
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [hostList, search, statusFilter, sortBy, sortDir]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  };

  const sortIcon = (col: typeof sortBy) =>
    sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // KPI
  const total = hostList.length;
  const healthy = hostList.filter((h) => h.status === 'healthy').length;
  const warning = hostList.filter((h) => h.status === 'warning').length;
  const critical = hostList.filter((h) => h.status === 'critical' || h.status === 'offline').length;
  const avgCpu = total > 0 ? Math.round(hostList.reduce((s, h) => s + h.cpuPercent, 0) / total) : 0;
  const gpuCount = hostList.reduce((s, h) => s + (h.gpus?.length ?? 0), 0);

  // Hexagon data
  const hexCells = useMemo<HexCell[]>(() => {
    return filtered.map((h) => ({
      id: h.hostname,
      label: h.hostname,
      status: h.status,
      value: sizeMetric === 'cpu' ? h.cpuPercent : sizeMetric === 'mem' ? h.memPercent : h.diskPercent,
      detail: h.gpus ? `GPU x${h.gpus.length} | VRAM: ${h.gpus[0]?.vramPercent}%` : h.os,
      group: h.gpus ? 'GPU Servers' : h.middlewares.some((m) => m.type === 'db') ? 'Database Servers' : 'Application Servers',
    }));
  }, [filtered, sizeMetric]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', icon: <Server size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Infrastructure</h1>
          <DataSourceBadge source={source} />
        </div>
        <Button variant="secondary" size="md"><Plus size={14} /> Add Host</Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Total Hosts" value={total} status="healthy" />
        <KPICard title="Healthy" value={healthy} status="healthy" />
        <KPICard title="Warning" value={warning} status={warning > 0 ? 'warning' : 'healthy'} />
        <KPICard title="Critical / Offline" value={critical} status={critical > 0 ? 'critical' : 'healthy'} />
        <KPICard title="Avg CPU" value={avgCpu} unit="%" status={avgCpu > 80 ? 'warning' : 'healthy'} />
        <KPICard title="GPUs" value={gpuCount} subtitle={`${hostList.filter((h) => h.gpus).length} hosts`} />
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput placeholder="Search hosts..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
        {view === 'hexagon' && (
          <Select options={SIZE_METRIC_OPTIONS} value={sizeMetric} onChange={(e) => setSizeMetric(e.target.value)} />
        )}
        <div className="ml-auto">
          <Tabs tabs={VIEW_TABS} activeTab={view} onChange={setView} variant="pill" />
        </div>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('hostname')}>Hostname{sortIcon('hostname')}</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">OS</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('cpu')}>CPU{sortIcon('cpu')}</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('mem')}>MEM{sortIcon('mem')}</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('disk')}>Disk{sortIcon('disk')}</th>
                  <th className="px-4 py-2.5 font-medium">Net I/O</th>
                  <th className="px-4 py-2.5 font-medium">Middleware</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/infra/${h.hostname}`} className="font-medium text-[var(--accent-primary)] hover:underline">{h.hostname}</Link>
                      {h.gpus && <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">GPU x{h.gpus.length}</span>}
                    </td>
                    <td className="px-4 py-2.5"><StatusIndicator status={h.status} size="sm" /></td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{h.os}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', h.cpuPercent > 85 ? 'text-[var(--status-critical)] font-medium' : h.cpuPercent > 70 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>{h.cpuPercent}%</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', h.memPercent > 85 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>{h.memPercent}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{h.diskPercent}%</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{h.netIO}</td>
                    <td className="px-4 py-2.5"><div className="flex gap-1 flex-wrap">{h.middlewares.map((mw) => <Badge key={mw.name}>{mw.name}</Badge>)}</div></td>
                    <td className="px-4 py-2.5">
                      {h.agent
                        ? <StatusIndicator status={h.agent.status === 'healthy' ? 'healthy' : h.agent.status === 'degraded' ? 'warning' : 'critical'} label={`v${h.agent.version}`} size="sm" />
                        : <span className="text-[var(--text-muted)]">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-sm text-[var(--text-muted)]">No hosts match your filters.</div>}
        </Card>
      )}

      {/* Hexagon Map View */}
      {view === 'hexagon' && (
        <Card>
          <HexagonMap
            cells={hexCells}
            sizeMetric={SIZE_METRIC_OPTIONS.find((o) => o.value === sizeMetric)?.label ?? 'CPU %'}
            colorMetric="Status"
            onCellClick={(hostname) => { window.location.href = `/infra/${hostname}`; }}
          />
        </Card>
      )}
    </div>
  );
}
