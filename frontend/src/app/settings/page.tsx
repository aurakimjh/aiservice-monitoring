'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, Button } from '@/components/ui';
import { RequireRole } from '@/components/auth';
import { Settings, Building, Users, Database, KeyRound, Archive } from 'lucide-react';

const SETTINGS_TABS = [
  { id: 'org', label: 'Organization', icon: <Building size={14} /> },
  { id: 'users', label: 'Users', icon: <Users size={14} /> },
  { id: 'datasources', label: 'Data Sources', icon: <Database size={14} /> },
  { id: 'apikeys', label: 'API Keys', icon: <KeyRound size={14} /> },
  { id: 'retention', label: 'Retention', icon: <Archive size={14} /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('org');

  return (
    <RequireRole minRole="sre">
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Settings', icon: <Settings size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h1>
      </div>

      <Tabs tabs={SETTINGS_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'org' && (
        <Card padding="lg">
          <div className="space-y-4 max-w-lg">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Organization Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Organization Name</label>
                <div className="h-8 px-3 flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)]">
                  AITOP Corp
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Plan</label>
                <div className="h-8 px-3 flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)]">
                  Enterprise
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'users' && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Team Members</h2>
            <Button variant="primary" size="sm">Invite User</Button>
          </div>
          <div className="space-y-2">
            {['admin@aitop.io (Owner)', 'ops@aitop.io (Admin)', 'dev@aitop.io (Editor)', 'viewer@aitop.io (Viewer)'].map((user) => (
              <div
                key={user}
                className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] text-[13px]"
              >
                <span className="text-[var(--text-primary)]">{user}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'datasources' && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Connected Data Sources</h2>
            <Button variant="primary" size="sm">Add Source</Button>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Prometheus', type: 'Metrics', status: 'Connected' },
              { name: 'Loki', type: 'Logs', status: 'Connected' },
              { name: 'Tempo', type: 'Traces', status: 'Connected' },
              { name: 'NVIDIA DCGM', type: 'GPU Metrics', status: 'Pending' },
            ].map((ds) => (
              <div
                key={ds.name}
                className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] text-[13px]"
              >
                <div>
                  <span className="text-[var(--text-primary)] font-medium">{ds.name}</span>
                  <span className="text-[var(--text-muted)] ml-2">{ds.type}</span>
                </div>
                <span className={ds.status === 'Connected' ? 'text-[var(--status-healthy)]' : 'text-[var(--status-warning)]'}>
                  {ds.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'apikeys' && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">API Keys</h2>
            <Button variant="primary" size="sm">Generate Key</Button>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Production Agent Key', prefix: 'aitop_prod_****', created: '2026-01-15' },
              { name: 'CI/CD Pipeline', prefix: 'aitop_ci_****', created: '2026-02-20' },
              { name: 'Grafana Integration', prefix: 'aitop_graf_****', created: '2026-03-01' },
            ].map((key) => (
              <div
                key={key.name}
                className="flex items-center justify-between px-3 py-2 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] text-[13px]"
              >
                <div>
                  <span className="text-[var(--text-primary)] font-medium">{key.name}</span>
                  <span className="text-[var(--text-muted)] ml-2 font-mono">{key.prefix}</span>
                </div>
                <span className="text-[var(--text-muted)]">Created {key.created}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'retention' && (
        <Card padding="lg">
          <div className="space-y-4 max-w-lg">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Data Retention Policies</h2>
            <div className="space-y-3">
              {[
                { label: 'Metrics', value: '90 days' },
                { label: 'Traces', value: '30 days' },
                { label: 'Logs', value: '15 days' },
                { label: 'Alert History', value: '365 days' },
                { label: 'Diagnostic Reports', value: '180 days' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-secondary)]">{item.label}</span>
                  <div className="h-8 px-3 flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] min-w-[100px] justify-center">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
    </RequireRole>
  );
}
