'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs } from '@/components/ui';
import { StatusIndicator } from '@/components/monitoring';
import { Server, Table, Map, Hexagon } from 'lucide-react';
import type { Status } from '@/types/monitoring';

const DEMO_HOSTS: {
  hostname: string; status: Status; cpu: number; mem: number;
  disk: number; netIO: string; agent: string;
}[] = [
  { hostname: 'prod-web-01', status: 'healthy', cpu: 32, mem: 61, disk: 45, netIO: '1.2 GB/s', agent: 'v2.4.1' },
  { hostname: 'prod-web-02', status: 'healthy', cpu: 28, mem: 55, disk: 39, netIO: '980 MB/s', agent: 'v2.4.1' },
  { hostname: 'prod-db-01', status: 'warning', cpu: 78, mem: 82, disk: 71, netIO: '2.4 GB/s', agent: 'v2.4.0' },
  { hostname: 'prod-gpu-01', status: 'healthy', cpu: 45, mem: 70, disk: 52, netIO: '3.1 GB/s', agent: 'v2.4.1' },
  { hostname: 'staging-app-01', status: 'critical', cpu: 95, mem: 93, disk: 88, netIO: '450 MB/s', agent: 'v2.3.9' },
];

const INFRA_TABS = [
  { id: 'table', label: 'Table', icon: <Table size={14} /> },
  { id: 'map', label: 'Map', icon: <Map size={14} /> },
  { id: 'hexagon', label: 'Hexagon', icon: <Hexagon size={14} /> },
];

export default function InfraPage() {
  const [activeTab, setActiveTab] = useState('table');

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', icon: <Server size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Infrastructure</h1>
      </div>

      <Tabs tabs={INFRA_TABS} activeTab={activeTab} onChange={setActiveTab} variant="pill" />

      {activeTab === 'table' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                  <th className="text-left font-medium px-4 py-2.5">Hostname</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5">CPU%</th>
                  <th className="text-right font-medium px-4 py-2.5">MEM%</th>
                  <th className="text-right font-medium px-4 py-2.5">Disk%</th>
                  <th className="text-right font-medium px-4 py-2.5">Net I/O</th>
                  <th className="text-left font-medium px-4 py-2.5">Agent</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_HOSTS.map((host) => (
                  <tr
                    key={host.hostname}
                    className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-primary)]">{host.hostname}</td>
                    <td className="px-4 py-2.5"><StatusIndicator status={host.status} size="sm" /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{host.cpu}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{host.mem}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{host.disk}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{host.netIO}</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{host.agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'map' && (
        <Card padding="lg">
          <div className="flex items-center justify-center h-64 text-[var(--text-muted)] text-sm">
            <div className="text-center space-y-2">
              <Map size={32} className="mx-auto opacity-40" />
              <p>Infrastructure map view coming soon</p>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'hexagon' && (
        <Card padding="lg">
          <div className="flex items-center justify-center h-64 text-[var(--text-muted)] text-sm">
            <div className="text-center space-y-2">
              <Hexagon size={32} className="mx-auto opacity-40" />
              <p>Hexagonal heatmap view coming soon</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
