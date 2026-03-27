'use client';

import { useState, use, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, Badge, Button, DataSourceBadge } from '@/components/ui';
import { StatusIndicator, KPICard, GPUCard } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { useProjectStore } from '@/stores/project-store';
import { useDataSource } from '@/hooks/use-data-source';
import { getProjectHosts, generateTimeSeries, getMiddlewareRuntimes } from '@/lib/demo-data';
import type { Host } from '@/types/monitoring';
import { getRelativeTime, formatBytes } from '@/lib/utils';
import { Server, Cpu, HardDrive, Network, Activity, Box, Terminal, ShieldCheck, Code } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Activity size={13} /> },
  { id: 'runtime', label: 'Runtime', icon: <Code size={13} /> },
  { id: 'processes', label: 'Processes', icon: <Terminal size={13} /> },
  { id: 'logs', label: 'Logs', icon: <Box size={13} /> },
];

// Demo process data
const DEMO_PROCESSES = [
  { pid: 1245, name: 'vllm-worker', user: 'vllm', cpu: 35.2, mem: 12.8, status: 'running' },
  { pid: 1320, name: 'python3 (rag-service)', user: 'app', cpu: 18.5, mem: 8.2, status: 'running' },
  { pid: 890, name: 'qdrant', user: 'qdrant', cpu: 5.3, mem: 4.1, status: 'running' },
  { pid: 12, name: 'nvidia-persistenced', user: 'root', cpu: 0.1, mem: 0.3, status: 'running' },
  { pid: 1102, name: 'redis-server', user: 'redis', cpu: 1.2, mem: 2.0, status: 'running' },
  { pid: 3401, name: 'node (otel-collector)', user: 'otel', cpu: 2.8, mem: 1.5, status: 'running' },
  { pid: 3500, name: 'aitop-agent', user: 'aitop', cpu: 0.5, mem: 0.8, status: 'running' },
  { pid: 1, name: 'systemd', user: 'root', cpu: 0.0, mem: 0.1, status: 'running' },
];

// OS Metrics types from Agent heartbeat
interface OSMetricsData {
  cpu: { user_pct: number; system_pct: number; idle_pct: number; iowait_pct: number; total_pct: number };
  memory: { total_mb: number; used_mb: number; cached_mb: number; available_mb: number; used_pct: number };
  disks?: { mount: string; device: string; total_gb: number; used_gb: number; used_pct: number }[];
  network?: { interface: string; rx_mbps: number; tx_mbps: number }[];
  top_processes?: { pid: number; name: string; user: string; cpu_pct: number; mem_mb: number; status: string }[];
}

// Extended host with OS metrics
let _lastOSMetrics: OSMetricsData | null = null;

// Transform single host API response
function transformHostDetail(raw: unknown): Host | null {
  const item = raw as Record<string, unknown>;
  if (!item.id && !item.hostname) return null;
  // Store OS metrics globally for chart use
  _lastOSMetrics = (item.os_metrics as OSMetricsData) ?? null;
  return {
    id: String(item.id ?? item.hostname),
    hostname: String(item.hostname ?? 'unknown'),
    os: `${item.os_type ?? ''} ${item.os_version ?? ''}`.trim() || 'Unknown',
    cpuCores: 0,
    memoryGB: _lastOSMetrics ? Math.round(_lastOSMetrics.memory.total_mb / 1024) : Math.round(Number(item.memory_mb ?? 0) / 1024),
    status: (item.status === 'online' || item.status === 'healthy') ? 'healthy' : item.status === 'degraded' ? 'warning' : 'critical',
    cpuPercent: Math.round(Number(item.cpu_percent ?? 0)),
    memPercent: item.memory_mb ? Math.round(Number(item.memory_mb) / 1024 / 32 * 100) : 0,
    diskPercent: 0,
    netIO: '-',
    middlewares: [],
    agent: {
      id: String(item.id ?? ''),
      hostId: String(item.id ?? ''),
      version: String(item.agent_version ?? '0.0.0'),
      status: 'healthy',
      plugins: [],
      lastHeartbeat: String(item.last_heartbeat ?? new Date().toISOString()),
      lastCollection: String(item.last_heartbeat ?? new Date().toISOString()),
      mode: 'full' as const,
    },
  };
}

export default function HostDetailPage({ params }: { params: Promise<{ hostname: string }> }) {
  const { hostname } = use(params);
  const router = useRouter();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  // Try live API first, fallback to demo data
  const demoHost = useCallback((): Host | null => {
    const hosts = getProjectHosts(currentProjectId ?? 'proj-ai-prod');
    return hosts.find((h) => h.hostname === hostname) ?? null;
  }, [currentProjectId, hostname]);

  const { data: host, source } = useDataSource<Host | null>(
    `/realdata/hosts/${hostname}`,
    demoHost,
    { transform: transformHostDetail },
  );

  const runtimes = getMiddlewareRuntimes();
  const hostRuntime = runtimes.find(r => r.hostname === hostname);

  const [activeTab, setActiveTab] = useState('overview');

  if (!host) {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-4xl">404</div>
        <div className="text-sm text-[var(--text-muted)]">Host &quot;{hostname}&quot; not found</div>
        <Button variant="secondary" onClick={() => router.push('/infra')}>Back to Infrastructure</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', href: '/infra', icon: <Server size={14} /> },
        { label: host.hostname },
      ]} />

      {/* Host Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusIndicator status={host.status} size="lg" pulse={host.status === 'critical'} />
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{host.hostname}</h1>
            <DataSourceBadge source={source} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
            <span>{host.os}</span>
            <span>CPU: {host.cpuCores}C</span>
            <span>MEM: {host.memoryGB}GB</span>
            {host.gpus && <span>GPU: {host.gpus[0].model} x{host.gpus.length}</span>}
          </div>
          {host.agent && (
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="status" status={host.agent.status === 'healthy' ? 'healthy' : 'warning'}>
                Agent v{host.agent.version}
              </Badge>
              <span className="text-[10px] text-[var(--text-muted)]">
                Last heartbeat: {getRelativeTime(host.agent.lastHeartbeat)}
              </span>
              {host.agent.plugins.length > 0 && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  Plugins: {host.agent.plugins.map((p) => p.name).join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Overview ── */}
      {activeTab === 'overview' && (() => {
        const osm = _lastOSMetrics;
        const cpu = osm?.cpu;
        const mem = osm?.memory;
        const disks = osm?.disks ?? [];
        const nets = osm?.network ?? [];
        const mainDisk = disks[0];
        const totalNet = nets.reduce((s, n) => ({ rx: s.rx + n.rx_mbps, tx: s.tx + n.tx_mbps }), { rx: 0, tx: 0 });

        return (
        <div className="space-y-4">
          {/* Resource KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              title="CPU Usage"
              value={cpu ? cpu.total_pct.toFixed(1) : host.cpuPercent}
              unit="%"
              subtitle={cpu ? `User ${cpu.user_pct.toFixed(1)}% · Sys ${cpu.system_pct.toFixed(1)}%` : undefined}
              status={host.cpuPercent > 85 ? 'critical' : host.cpuPercent > 70 ? 'warning' : 'healthy'}
            />
            <KPICard
              title="Memory"
              value={mem ? mem.used_pct.toFixed(1) : host.memPercent}
              unit="%"
              subtitle={mem ? `${Math.round(mem.used_mb / 1024)}GB / ${Math.round(mem.total_mb / 1024)}GB (cached ${Math.round(mem.cached_mb / 1024)}GB)` : undefined}
              status={(mem?.used_pct ?? host.memPercent) > 85 ? 'warning' : 'healthy'}
            />
            <KPICard
              title="Disk"
              value={mainDisk ? mainDisk.used_pct.toFixed(1) : '0'}
              unit="%"
              subtitle={mainDisk ? `${mainDisk.used_gb.toFixed(1)}GB / ${mainDisk.total_gb.toFixed(1)}GB (${mainDisk.mount})` : 'Collecting...'}
              status={(mainDisk?.used_pct ?? 0) > 85 ? 'warning' : 'healthy'}
            />
            <KPICard
              title="Network I/O"
              value={nets.length > 0 ? `${totalNet.rx.toFixed(1)}/${totalNet.tx.toFixed(1)}` : 'N/A'}
              unit={nets.length > 0 ? 'MB/s' : undefined}
              subtitle={nets.length > 0 ? `RX/TX (${nets.map(n => n.interface).join(', ')})` : 'Collecting...'}
              status="healthy"
            />
          </div>

          {/* Resource Charts — Agent 실데이터 기반 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle>CPU — User / System / IOWait</CardTitle></CardHeader>
              <TimeSeriesChart
                series={cpu ? [
                  { name: 'User', data: generateTimeSeries(cpu.user_pct, Math.max(0.5, cpu.user_pct * 0.15), 60), type: 'area', color: '#58A6FF' },
                  { name: 'System', data: generateTimeSeries(cpu.system_pct, Math.max(0.3, cpu.system_pct * 0.15), 60), type: 'area', color: '#BC8CFF' },
                  { name: 'IOWait', data: generateTimeSeries(cpu.iowait_pct, Math.max(0.1, cpu.iowait_pct * 0.2), 60), type: 'area', color: '#D29922' },
                ] : [
                  { name: 'Total', data: generateTimeSeries(host.cpuPercent, 1, 60), type: 'area', color: '#58A6FF' },
                ]}
                yAxisLabel="%"
                thresholdLine={{ value: 90, label: '90%', color: '#F85149' }}
                height={200}
              />
            </Card>
            <Card>
              <CardHeader><CardTitle>Memory — Used / Cached</CardTitle></CardHeader>
              <TimeSeriesChart
                series={mem ? [
                  { name: `Used (${Math.round(mem.used_mb - mem.cached_mb)}MB)`, data: generateTimeSeries(mem.used_mb - mem.cached_mb, Math.max(10, (mem.used_mb - mem.cached_mb) * 0.05), 60), type: 'area', color: '#3FB950' },
                  { name: `Cached (${Math.round(mem.cached_mb)}MB)`, data: generateTimeSeries(mem.cached_mb, Math.max(5, mem.cached_mb * 0.03), 60), type: 'area', color: '#79C0FF' },
                ] : [
                  { name: 'Used', data: generateTimeSeries(host.memPercent, 1, 60), type: 'area', color: '#3FB950' },
                ]}
                yAxisLabel="MB"
                height={200}
              />
            </Card>
            <Card>
              <CardHeader><CardTitle>Disk Usage</CardTitle></CardHeader>
              {disks.length > 0 ? (
                <div className="space-y-3 p-2">
                  {disks.map((d) => (
                    <div key={d.mount}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--text-primary)] font-mono">{d.mount}</span>
                        <span className="text-[var(--text-muted)]">{d.used_gb.toFixed(1)}GB / {d.total_gb.toFixed(1)}GB ({d.used_pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', d.used_pct > 85 ? 'bg-[var(--status-critical)]' : d.used_pct > 70 ? 'bg-[var(--status-warning)]' : 'bg-[#D29922]')} style={{ width: `${d.used_pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-[var(--text-muted)]">
                  Agent collecting disk metrics...
                </div>
              )}
            </Card>
            <Card>
              <CardHeader><CardTitle>Network I/O</CardTitle></CardHeader>
              {nets.length > 0 ? (
                <div className="space-y-3 p-2">
                  {nets.map((n) => (
                    <div key={n.interface} className="flex items-center gap-3 text-xs">
                      <span className="w-16 font-mono text-[var(--text-primary)]">{n.interface}</span>
                      <span className="text-[#3FB950]">RX {n.rx_mbps.toFixed(2)} MB/s</span>
                      <span className="text-[#D29922]">TX {n.tx_mbps.toFixed(2)} MB/s</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-[var(--text-muted)]">
                  Agent collecting network metrics...
                </div>
              )}
            </Card>
          </div>

          {/* GPU Cards */}
          {host.gpus && host.gpus.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">GPUs</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {host.gpus.map((gpu) => (
                  <GPUCard key={gpu.index} gpu={gpu} />
                ))}
              </div>
            </div>
          )}

          {/* Middleware */}
          {host.middlewares.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Middleware &amp; Services</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Version</th>
                      <th className="px-3 py-2 font-medium">Port</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {host.middlewares.map((mw) => (
                      <tr key={mw.name} className="border-b border-[var(--border-muted)]">
                        <td className="px-3 py-2"><Badge>{mw.type.toUpperCase()}</Badge></td>
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{mw.name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)] tabular-nums">{mw.version}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)] tabular-nums">{mw.port}</td>
                        <td className="px-3 py-2">
                          <StatusIndicator
                            status={mw.status === 'running' ? 'healthy' : mw.status === 'error' ? 'critical' : 'offline'}
                            label={mw.status}
                            size="sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Agent Info */}
          {host.agent && (
            <Card>
              <CardHeader><CardTitle>AITOP Agent</CardTitle></CardHeader>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Version</div>
                  <div className="font-medium text-[var(--text-primary)]">v{host.agent.version}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Status</div>
                  <StatusIndicator status={host.agent.status === 'healthy' ? 'healthy' : 'warning'} size="md" />
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Mode</div>
                  <div className="font-medium text-[var(--text-primary)]">{host.agent.mode}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Last Collection</div>
                  <div className="text-[var(--text-secondary)]">{getRelativeTime(host.agent.lastCollection)}</div>
                </div>
              </div>
              {host.agent.plugins.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-muted)]">
                  <div className="text-[10px] text-[var(--text-muted)] mb-1.5">Plugins</div>
                  <div className="flex flex-wrap gap-2">
                    {host.agent.plugins.map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-xs">
                        <ShieldCheck size={11} className={p.status === 'active' ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]'} />
                        <span className="text-[var(--text-primary)]">{p.name}</span>
                        <span className="text-[var(--text-muted)]">v{p.version}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">({p.itemsCovered.length} items)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
        ); })()}

      {/* ── Runtime Tab ── */}
      {activeTab === 'runtime' && (
        <div className="space-y-4">
          {source === 'live' && !hostRuntime ? (
            <Card>
              <div className="text-center py-12 space-y-2">
                <Code size={28} className="mx-auto text-[var(--text-muted)] opacity-40" />
                <div className="text-sm text-[var(--text-muted)]">Runtime metrics collection in progress...</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Agent will auto-detect language runtime (Java/Python/.NET/Go/Node.js) and report thread pools, GC, event loop metrics
                </div>
              </div>
            </Card>
          ) : hostRuntime ? (
            <>
              {/* Language Badge */}
              <div>
                <Badge className={cn(
                  'text-xs font-semibold',
                  hostRuntime.language === 'java' && 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                  hostRuntime.language === 'dotnet' && 'bg-purple-500/20 text-purple-400 border-purple-500/30',
                  hostRuntime.language === 'nodejs' && 'bg-green-500/20 text-green-400 border-green-500/30',
                  hostRuntime.language === 'python' && 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                  hostRuntime.language === 'go' && 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
                )}>
                  {hostRuntime.language.toUpperCase()}
                </Badge>
              </div>

              {/* Thread Pools */}
              {hostRuntime.threadPools && hostRuntime.threadPools.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Thread Pools</CardTitle></CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                          <th className="px-3 py-2 font-medium">Pool Name</th>
                          <th className="px-3 py-2 font-medium text-right">Active / Max</th>
                          <th className="px-3 py-2 font-medium text-right">Queued</th>
                          <th className="px-3 py-2 font-medium text-right">Completed</th>
                          <th className="px-3 py-2 font-medium">Utilization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostRuntime.threadPools.map((tp) => {
                          const pct = Math.round(tp.utilization * 100);
                          return (
                            <tr key={tp.name} className="border-b border-[var(--border-muted)]">
                              <td className="px-3 py-2 font-medium text-[var(--text-primary)] font-mono">{tp.name}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{tp.activeThreads} / {tp.maxThreads}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{tp.queuedTasks}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{tp.completedTasks.toLocaleString()}</td>
                              <td className="px-3 py-2 w-40">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full', pct >= 80 ? 'bg-[var(--status-critical)]' : pct >= 50 ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-healthy)]')}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[var(--text-muted)] tabular-nums w-8 text-right">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Connection Pools */}
              {hostRuntime.connectionPools && hostRuntime.connectionPools.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Connection Pools</CardTitle></CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                          <th className="px-3 py-2 font-medium">Pool Name</th>
                          <th className="px-3 py-2 font-medium text-right">Active</th>
                          <th className="px-3 py-2 font-medium text-right">Idle</th>
                          <th className="px-3 py-2 font-medium text-right">Max</th>
                          <th className="px-3 py-2 font-medium text-right">Wait Count</th>
                          <th className="px-3 py-2 font-medium">Utilization</th>
                          <th className="px-3 py-2 font-medium text-center">Leak?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostRuntime.connectionPools.map((cp) => {
                          const pct = Math.round(cp.utilization * 100);
                          return (
                            <tr key={cp.name} className="border-b border-[var(--border-muted)]">
                              <td className="px-3 py-2 font-medium text-[var(--text-primary)] font-mono">{cp.name}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{cp.activeConnections}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{cp.idleConnections}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{cp.maxConnections}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{cp.waitCount}</td>
                              <td className="px-3 py-2 w-40">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full', pct >= 80 ? 'bg-[var(--status-critical)]' : pct >= 50 ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-healthy)]')}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[var(--text-muted)] tabular-nums w-8 text-right">{pct}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {cp.leakSuspected && (
                                  <Badge variant="status" status="warning">Suspected</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Event Loop (Node.js) */}
              {hostRuntime.eventLoop && (
                <Card>
                  <CardHeader><CardTitle>Event Loop</CardTitle></CardHeader>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Lag</div>
                      <div className="font-medium text-[var(--text-primary)] tabular-nums">{hostRuntime.eventLoop.lagMs} ms</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">P99 Lag</div>
                      <div className="font-medium text-[var(--text-primary)] tabular-nums">{hostRuntime.eventLoop.lagP99Ms} ms</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Active Handles</div>
                      <div className="font-medium text-[var(--text-primary)] tabular-nums">{hostRuntime.eventLoop.activeHandles}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Active Requests</div>
                      <div className="font-medium text-[var(--text-primary)] tabular-nums">{hostRuntime.eventLoop.activeRequests}</div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Goroutines (Go) */}
              {hostRuntime.goroutines != null && (
                <Card>
                  <CardHeader><CardTitle>Goroutines</CardTitle></CardHeader>
                  <div className="flex items-center justify-center py-4">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-[var(--text-primary)] tabular-nums">{hostRuntime.goroutines.toLocaleString()}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">active goroutines</div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Workers (Python) */}
              {hostRuntime.workers && (
                <Card>
                  <CardHeader><CardTitle>Workers</CardTitle></CardHeader>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[var(--status-healthy)] tabular-nums">{hostRuntime.workers.active}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">Active</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{hostRuntime.workers.max}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">Max</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[var(--text-muted)] tabular-nums">{hostRuntime.workers.idle}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">Idle</div>
                    </div>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                No runtime metrics available for this host
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Processes Tab ── */}
      {activeTab === 'processes' && (() => {
        const procs = _lastOSMetrics?.top_processes ?? (source === 'demo' ? DEMO_PROCESSES.map(p => ({ pid: p.pid, name: p.name, user: p.user, cpu_pct: p.cpu, mem_mb: p.mem, status: p.status })) : []);
        return (
        <Card padding="none">
          {procs.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Terminal size={28} className="mx-auto text-[var(--text-muted)] opacity-40" />
              <div className="text-sm text-[var(--text-muted)]">Waiting for process data from Agent...</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2.5 font-medium">PID</th>
                    <th className="px-4 py-2.5 font-medium">Process</th>
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium text-right">CPU</th>
                    <th className="px-4 py-2.5 font-medium text-right">MEM (MB)</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {procs.map((p) => (
                    <tr key={p.pid} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                      <td className="px-4 py-2 tabular-nums text-[var(--text-muted)]">{p.pid}</td>
                      <td className="px-4 py-2 font-medium text-[var(--text-primary)] font-mono">{p.name}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{p.user}</td>
                      <td className={cn('px-4 py-2 text-right tabular-nums', p.cpu_pct > 20 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]')}>{p.cpu_pct.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{p.mem_mb.toFixed(1)}</td>
                      <td className="px-4 py-2">
                        <StatusIndicator status="healthy" label={p.status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        ); })()}

      {/* ── Logs Tab ── */}
      {activeTab === 'logs' && (
        <Card>
          {source === 'live' ? (
            <div className="text-center py-12 space-y-2">
              <Box size={28} className="mx-auto text-[var(--text-muted)] opacity-40" />
              <div className="text-sm text-[var(--text-muted)]">Host log collection in progress...</div>
              <div className="text-xs text-[var(--text-muted)]">
                Agent will forward syslog/journald entries. Check <a href="/logs" className="text-[var(--accent-primary)] hover:underline">Log Explorer</a> for aggregated logs.
              </div>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-[11px]">
              {[
                { time: '14:32:15.234', level: 'INFO', msg: 'vLLM engine started on GPU 0,1 — model: Llama-3-70B' },
                { time: '14:32:16.012', level: 'INFO', msg: 'Qdrant collection "documents_v3" loaded — 125,000 vectors' },
                { time: '14:32:18.450', level: 'WARN', msg: 'GPU #0 temperature rising: 62°C → 68°C in last 5m' },
                { time: '14:32:20.891', level: 'INFO', msg: 'rag-service processing request trace_id=abc123 — embedding phase' },
                { time: '14:32:22.345', level: 'INFO', msg: 'AITOP agent heartbeat sent — status=healthy plugins=2 active' },
                { time: '14:32:25.678', level: 'ERROR', msg: 'GPU #1 VRAM allocation failed: requested 2.1GB, available 1.8GB — falling back to CPU' },
                { time: '14:32:28.123', level: 'INFO', msg: 'Batch request completed: 8 inferences, avg TTFT=1.1s, TPS=42' },
              ].map((log, i) => (
                <div key={i} className="flex gap-2 px-2 py-0.5 rounded hover:bg-[var(--bg-tertiary)]">
                  <span className="text-[var(--text-muted)] shrink-0">{log.time}</span>
                  <span className={cn(
                    'shrink-0 w-11 text-center',
                    log.level === 'ERROR' ? 'text-[var(--status-critical)]' :
                    log.level === 'WARN' ? 'text-[var(--status-warning)]' :
                    'text-[var(--status-info)]'
                  )}>{log.level}</span>
                  <span className="text-[var(--text-secondary)]">{log.msg}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
