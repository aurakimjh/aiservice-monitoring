'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs } from '@/components/ui';
import { StatusIndicator } from '@/components/monitoring';
import { Network, List, Share2 } from 'lucide-react';
import type { Status } from '@/types/monitoring';

const DEMO_SERVICES: {
  name: string; framework: string; p95: number; rpm: number;
  errorRate: number; status: Status;
}[] = [
  { name: 'api-gateway', framework: 'Spring Boot', p95: 120, rpm: 4520, errorRate: 0.08, status: 'healthy' },
  { name: 'user-service', framework: 'Express.js', p95: 85, rpm: 2310, errorRate: 0.12, status: 'healthy' },
  { name: 'payment-service', framework: 'FastAPI', p95: 340, rpm: 890, errorRate: 1.45, status: 'warning' },
  { name: 'inventory-service', framework: 'Go Fiber', p95: 45, rpm: 3100, errorRate: 0.03, status: 'healthy' },
  { name: 'notification-service', framework: 'NestJS', p95: 1200, rpm: 670, errorRate: 4.2, status: 'critical' },
];

const SERVICE_TABS = [
  { id: 'list', label: 'List', icon: <List size={14} /> },
  { id: 'service-map', label: 'Service Map', icon: <Share2 size={14} /> },
];

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState('list');

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Services', icon: <Network size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Services</h1>
      </div>

      <Tabs tabs={SERVICE_TABS} activeTab={activeTab} onChange={setActiveTab} variant="pill" />

      {activeTab === 'list' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                  <th className="text-left font-medium px-4 py-2.5">Service Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Framework</th>
                  <th className="text-right font-medium px-4 py-2.5">P95</th>
                  <th className="text-right font-medium px-4 py-2.5">RPM</th>
                  <th className="text-right font-medium px-4 py-2.5">Error Rate</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_SERVICES.map((svc) => (
                  <tr
                    key={svc.name}
                    className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-primary)]">{svc.name}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{svc.framework}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.p95} ms</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.rpm.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.errorRate}%</td>
                    <td className="px-4 py-2.5"><StatusIndicator status={svc.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'service-map' && (
        <Card padding="lg">
          <div className="flex items-center justify-center h-64 text-[var(--text-muted)] text-sm">
            <div className="text-center space-y-2">
              <Share2 size={32} className="mx-auto opacity-40" />
              <p>Service dependency map coming soon</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
