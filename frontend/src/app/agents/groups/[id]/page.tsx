'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { getGroupDashboard } from '@/lib/demo-data';
import { getRelativeTime } from '@/lib/utils';
import { Users, Heart, Cpu, MemoryStick, Play, ArrowUpCircle } from 'lucide-react';

const statusMap: Record<string, { label: string; color: 'healthy' | 'warning' | 'critical' }> = {
  healthy:  { label: 'Healthy',  color: 'healthy' },
  degraded: { label: 'Degraded', color: 'warning' },
  offline:  { label: 'Offline',  color: 'critical' },
};

export default function GroupDashboardPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  const dashboard = useMemo(() => getGroupDashboard(groupId), [groupId]);

  const healthyPct = dashboard.agentCount > 0
    ? Math.round((dashboard.healthyCount / dashboard.agentCount) * 100)
    : 0;

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Agents', href: '/agents' },
    { label: 'Groups', href: '/agents' },
    { label: dashboard.groupName },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Title + actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {dashboard.groupName}
        </h1>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => alert('Trigger Collection: dispatched to all agents in group.')}
          >
            <Play size={13} />
            Trigger Collection
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => alert('Update All: OTA update queued for all agents in group.')}
          >
            <ArrowUpCircle size={13} />
            Update All
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Agent Count"
          value={dashboard.agentCount}
          className="[&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:gap-1.5"
        />
        <KPICard
          title="Healthy %"
          value={healthyPct}
          unit="%"
          status={healthyPct >= 80 ? 'healthy' : healthyPct >= 50 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Avg CPU %"
          value={dashboard.avgCpu}
          unit="%"
          status={dashboard.avgCpu > 80 ? 'critical' : dashboard.avgCpu > 60 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Avg Memory %"
          value={dashboard.avgMemory}
          unit="%"
          status={dashboard.avgMemory > 85 ? 'critical' : dashboard.avgMemory > 70 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Agents table */}
      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left font-medium py-2 px-3">Hostname</th>
                <th className="text-left font-medium py-2 px-3">Status</th>
                <th className="text-left font-medium py-2 px-3">Version</th>
                <th className="text-right font-medium py-2 px-3">CPU %</th>
                <th className="text-right font-medium py-2 px-3">Memory %</th>
                <th className="text-right font-medium py-2 px-3">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.agents.map((agent) => {
                const info = statusMap[agent.status] ?? statusMap.offline;
                return (
                  <tr
                    key={agent.id}
                    className="border-b border-[var(--border-default)] last:border-b-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="py-2 px-3 text-[var(--text-primary)] font-medium">
                      {agent.hostname}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="status" status={info.color}>
                        {info.label}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-[var(--text-secondary)] tabular-nums">
                      {agent.version}
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right tabular-nums',
                      agent.cpu > 80 ? 'text-[var(--status-critical)]'
                        : agent.cpu > 60 ? 'text-[var(--status-warning)]'
                        : 'text-[var(--text-primary)]',
                    )}>
                      {agent.cpu}%
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right tabular-nums',
                      agent.memory > 85 ? 'text-[var(--status-critical)]'
                        : agent.memory > 70 ? 'text-[var(--status-warning)]'
                        : 'text-[var(--text-primary)]',
                    )}>
                      {agent.memory}%
                    </td>
                    <td className="py-2 px-3 text-right text-[var(--text-muted)] tabular-nums">
                      {getRelativeTime(new Date(agent.lastHeartbeat))}
                    </td>
                  </tr>
                );
              })}

              {dashboard.agents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                    No agents in this group
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
