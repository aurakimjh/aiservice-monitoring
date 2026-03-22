'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, Badge } from '@/components/ui';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { useProjectStore } from '@/stores/project-store';
import { useFleet } from '@/hooks/use-fleet';
import { getRelativeTime } from '@/lib/utils';
import {
  Cpu,
  Package,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';

const VIEW_TABS = [
  { id: 'agents', label: 'Agent List', icon: <Cpu size={13} /> },
  { id: 'jobs', label: 'Collection Jobs', icon: <Clock size={13} /> },
  { id: 'plugins', label: 'Plugins', icon: <Package size={13} /> },
];

const JOB_TYPE_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  ai_diagnostic: 'AI Diagnostic',
  emergency: 'Emergency',
};

export default function AgentsPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const { agents, jobs, plugins, loading, isLive, refresh } = useFleet(currentProjectId ?? undefined);

  const [activeTab, setActiveTab] = useState('agents');

  const stats = useMemo(() => {
    const total = agents.length;
    const healthy = agents.filter((a) => a.status === 'healthy').length;
    const degraded = agents.filter((a) => a.status === 'degraded').length;
    const offline = agents.filter((a) => a.status === 'offline').length;
    const needsUpdate = agents.filter((a) => a.version !== '1.2.0').length;
    return { total, healthy, degraded, offline, needsUpdate };
  }, [agents]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Agent Fleet', icon: <Cpu size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Agent Fleet Console</h1>
        <div className="flex items-center gap-2">
          {/* Live / Demo 표시 */}
          <span className={cn(
            'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
            isLive
              ? 'bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
          )}>
            {isLive ? <Wifi size={10} /> : <WifiOff size={10} />}
            {isLive ? 'LIVE' : 'DEMO'}
          </span>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard title="Total Agents" value={stats.total} subtitle="registered" status="healthy" />
        <KPICard title="Healthy" value={stats.healthy} status="healthy" />
        <KPICard title="Degraded" value={stats.degraded} status={stats.degraded > 0 ? 'warning' : 'healthy'} />
        <KPICard title="Offline" value={stats.offline} status={stats.offline > 0 ? 'critical' : 'healthy'} subtitle="needs attention" />
        <KPICard title="Updates" value={stats.needsUpdate} subtitle="agents need update" trend={{ direction: 'flat', value: 'v1.2.0 latest' }} />
      </div>

      <Tabs tabs={VIEW_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Agent List ── */}
      {activeTab === 'agents' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Hostname</th>
                  <th className="px-4 py-2.5 font-medium">Version</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">OS</th>
                  <th className="px-4 py-2.5 font-medium">Mode</th>
                  <th className="px-4 py-2.5 font-medium">Plugins</th>
                  <th className="px-4 py-2.5 font-medium">Last Heartbeat</th>
                  <th className="px-4 py-2.5 font-medium">Last Collection</th>
                </tr>
              </thead>
              <tbody>
                {loading && agents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      <Loader2 size={16} className="inline animate-spin mr-2" />Loading agents…
                    </td>
                  </tr>
                ) : agents.map((agent) => {
                  const isOutdated = agent.version !== '1.2.0';
                  return (
                    <tr key={agent.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/infra/${agent.hostname}`} className="font-medium text-[var(--accent-primary)] hover:underline font-mono">
                          {agent.hostname}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn('font-mono', isOutdated && 'text-[var(--status-warning)]')}>
                          v{agent.version}
                        </span>
                        {isOutdated && (
                          <span className="ml-1 text-[10px] text-[var(--status-warning)]">
                            <AlertTriangle size={10} className="inline" /> update
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusIndicator
                          status={agent.status === 'healthy' ? 'healthy' : agent.status === 'degraded' ? 'warning' : 'critical'}
                          label={agent.status}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{agent.os}</td>
                      <td className="px-4 py-2.5">
                        <Badge>{agent.mode}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {agent.plugins.length > 0 ? (
                          <span className="text-[var(--text-secondary)]">{agent.plugins.map((p) => p.name).join(', ')}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">IT (default)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{getRelativeTime(agent.lastHeartbeat)}</td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{getRelativeTime(agent.lastCollection)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Collection Jobs ── */}
      {activeTab === 'jobs' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Job ID</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium text-right">Items</th>
                  <th className="px-4 py-2.5 font-medium" style={{ width: 160 }}>Progress</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[var(--accent-primary)]">{job.id}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={job.type === 'emergency' ? 'severity' : 'tag'} severity={job.type === 'emergency' ? 'critical' : undefined}>
                        {JOB_TYPE_LABELS[job.type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-primary)]">{job.target}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{job.items}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', job.status === 'running' ? 'bg-[var(--accent-primary)]' : job.status === 'completed' ? 'bg-[var(--status-healthy)]' : 'bg-[var(--status-critical)]')} style={{ width: `${job.progress}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-8 text-right">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {job.status === 'running' && <span className="flex items-center gap-1 text-[var(--accent-primary)]"><Loader2 size={11} className="animate-spin" /> Running</span>}
                      {job.status === 'completed' && <span className="flex items-center gap-1 text-[var(--status-healthy)]"><CheckCircle2 size={11} /> Done</span>}
                      {job.status === 'failed' && <span className="flex items-center gap-1 text-[var(--status-critical)]"><XCircle size={11} /> Failed</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{getRelativeTime(new Date(job.startTime))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Plugins ── */}
      {activeTab === 'plugins' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Plugin</th>
                  <th className="px-4 py-2.5 font-medium">Version</th>
                  <th className="px-4 py-2.5 font-medium">Active Agents</th>
                  <th className="px-4 py-2.5 font-medium">Collect Items</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {plugins.map((p) => (
                  <tr key={p.name} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{p.version}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{p.activeAgents}/{p.totalAgents}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{p.collectItems}</td>
                    <td className="px-4 py-2.5"><StatusIndicator status={p.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
