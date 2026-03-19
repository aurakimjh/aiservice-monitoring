'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs } from '@/components/ui';
import { StatusIndicator } from '@/components/monitoring';
import { Bell, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { Status, Severity } from '@/types/monitoring';

const DEMO_POLICIES: {
  name: string; severity: Severity; target: string;
  condition: string; status: 'enabled' | 'disabled';
}[] = [
  { name: 'High CPU Usage', severity: 'critical', target: 'All Hosts', condition: 'cpu_percent > 90% for 5m', status: 'enabled' },
  { name: 'Error Rate Spike', severity: 'warning', target: 'api-gateway', condition: 'error_rate > 1% for 3m', status: 'enabled' },
  { name: 'TTFT Degradation', severity: 'warning', target: 'AI Services', condition: 'ttft_p95 > 500ms for 10m', status: 'enabled' },
  { name: 'Disk Space Low', severity: 'critical', target: 'prod-db-*', condition: 'disk_percent > 85%', status: 'enabled' },
  { name: 'GPU Temperature', severity: 'info', target: 'GPU Hosts', condition: 'gpu_temp > 80°C for 15m', status: 'disabled' },
];

const DEMO_INCIDENTS: {
  id: string; title: string; severity: Severity;
  status: Status; timestamp: string;
}[] = [
  { id: 'INC-042', title: 'staging-app-01 CPU at 95%', severity: 'critical', status: 'critical', timestamp: '12m ago' },
  { id: 'INC-041', title: 'payment-service error rate 4.2%', severity: 'warning', status: 'warning', timestamp: '28m ago' },
  { id: 'INC-040', title: 'prod-db-01 disk at 71%', severity: 'warning', status: 'healthy', timestamp: '2h ago' },
];

const ALERT_TABS = [
  { id: 'policies', label: 'Policies', icon: <ShieldCheck size={14} />, count: DEMO_POLICIES.length },
  { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={14} />, count: DEMO_INCIDENTS.filter(i => i.status !== 'healthy').length },
];

const severityColor: Record<Severity, string> = {
  critical: 'text-[var(--status-critical)]',
  warning: 'text-[var(--status-warning)]',
  info: 'text-[var(--status-info)]',
};

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState('policies');

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Alerts', icon: <Bell size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Alert Policies & Incidents</h1>
      </div>

      <Tabs tabs={ALERT_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'policies' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                  <th className="text-left font-medium px-4 py-2.5">Rule Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Severity</th>
                  <th className="text-left font-medium px-4 py-2.5">Target</th>
                  <th className="text-left font-medium px-4 py-2.5">Condition</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_POLICIES.map((policy) => (
                  <tr
                    key={policy.name}
                    className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium">{policy.name}</td>
                    <td className={`px-4 py-2.5 capitalize ${severityColor[policy.severity]}`}>{policy.severity}</td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-secondary)]">{policy.target}</td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-muted)]">{policy.condition}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${policy.status === 'enabled' ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]'}`}>
                        {policy.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'incidents' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                  <th className="text-left font-medium px-4 py-2.5">ID</th>
                  <th className="text-left font-medium px-4 py-2.5">Title</th>
                  <th className="text-left font-medium px-4 py-2.5">Severity</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Time</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_INCIDENTS.map((inc) => (
                  <tr
                    key={inc.id}
                    className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--accent-primary)]">{inc.id}</td>
                    <td className="px-4 py-2.5 text-[var(--text-primary)]">{inc.title}</td>
                    <td className={`px-4 py-2.5 capitalize ${severityColor[inc.severity]}`}>{inc.severity}</td>
                    <td className="px-4 py-2.5"><StatusIndicator status={inc.status} size="sm" /></td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{inc.timestamp}</td>
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
