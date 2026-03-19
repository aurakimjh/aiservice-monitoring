'use client';

import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui';
import { KPICard, StatusIndicator } from '@/components/monitoring';
import { Cpu } from 'lucide-react';
import type { Status } from '@/types/monitoring';

const DEMO_AGENTS: {
  hostname: string; version: string; status: Status;
  os: string; plugins: number; lastCollection: string;
}[] = [
  { hostname: 'prod-web-01', version: 'v2.4.1', status: 'healthy', os: 'Ubuntu 22.04', plugins: 6, lastCollection: '15s ago' },
  { hostname: 'prod-web-02', version: 'v2.4.1', status: 'healthy', os: 'Ubuntu 22.04', plugins: 6, lastCollection: '12s ago' },
  { hostname: 'prod-db-01', version: 'v2.4.0', status: 'warning', os: 'RHEL 9.2', plugins: 4, lastCollection: '45s ago' },
  { hostname: 'prod-gpu-01', version: 'v2.4.1', status: 'healthy', os: 'Ubuntu 22.04', plugins: 8, lastCollection: '10s ago' },
  { hostname: 'staging-app-01', version: 'v2.3.9', status: 'critical', os: 'Debian 12', plugins: 5, lastCollection: '5m ago' },
];

export default function AgentsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Agents', icon: <Cpu size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Agent Fleet Console</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard title="Total" value={5} subtitle="registered agents" />
        <KPICard title="Healthy" value={3} status="healthy" />
        <KPICard title="Warning" value={1} status="warning" />
        <KPICard title="Offline" value={1} status="critical" subtitle="needs attention" />
        <KPICard
          title="Updates"
          value={2}
          subtitle="agents need update"
          trend={{ direction: 'flat', value: 'v2.4.1 latest' }}
        />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left font-medium px-4 py-2.5">Hostname</th>
                <th className="text-left font-medium px-4 py-2.5">Version</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">OS</th>
                <th className="text-right font-medium px-4 py-2.5">Plugins</th>
                <th className="text-left font-medium px-4 py-2.5">Last Collection</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_AGENTS.map((agent) => (
                <tr
                  key={agent.hostname}
                  className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-primary)]">{agent.hostname}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-secondary)]">{agent.version}</td>
                  <td className="px-4 py-2.5"><StatusIndicator status={agent.status} size="sm" /></td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{agent.os}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{agent.plugins}</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{agent.lastCollection}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
