'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, Button } from '@/components/ui';
import { RequireRole } from '@/components/auth';
import { Settings, Building, Users, Database, KeyRound, Archive, Shield, Radio, Wifi, AlertTriangle } from 'lucide-react';
import { SSOSettings } from '@/components/settings/sso-settings';
import { useUIStore } from '@/stores/ui-store';
import type { DataSourceMode } from '@/stores/ui-store';

const SETTINGS_TABS = [
  { id: 'org', label: 'Organization', icon: <Building size={14} /> },
  { id: 'users', label: 'Users', icon: <Users size={14} /> },
  { id: 'sso', label: 'SSO / Identity', icon: <Shield size={14} /> },
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
        <DataSourceSettings />
      )}

      {activeTab === 'datasources-legacy' && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Connected Data Sources</h2>
            <Button variant="primary" size="sm">Add Source</Button>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Prometheus', type: 'Metrics', status: 'Connected' },
              { name: 'Jaeger', type: 'Traces', status: 'Connected' },
              { name: 'AITOP Agent', type: 'System Metrics', status: 'Connected' },
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

      {activeTab === 'sso' && <SSOSettings />}

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

// ═══════════════════════════════════════════════════════════════
// Data Source Settings — 데이터 소스 모드 전환 UI
// ═══════════════════════════════════════════════════════════════

const DATA_MODES: { id: DataSourceMode; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'auto',
    label: 'Auto (Recommended)',
    desc: 'API 연결을 시도하고, 실패 시 자동으로 데모 데이터로 전환합니다. 에이전트가 설치되면 실데이터가 자동으로 표시됩니다.',
    icon: <Wifi size={16} />,
    color: '#58A6FF',
  },
  {
    id: 'live',
    label: 'Live Only',
    desc: 'Collection Server + Agent의 실데이터만 표시합니다. 연결이 없으면 에러를 표시합니다. 프로덕션 운영 환경에 적합합니다.',
    icon: <Radio size={16} />,
    color: '#3FB950',
  },
  {
    id: 'demo',
    label: 'Demo Mode',
    desc: '인프라 연동 없이 내장 샘플 데이터를 표시합니다. 영업 시연, UI 개발, 고객 교육에 적합합니다.',
    icon: <AlertTriangle size={16} />,
    color: '#D29922',
  },
];

function DataSourceSettings() {
  const currentMode = useUIStore((s) => s.dataSourceMode);
  const setMode = useUIStore((s) => s.setDataSourceMode);

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h2 className="text-sm font-medium text-[var(--text-primary)] mb-1">Data Source Mode</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          대시보드에 표시되는 데이터의 출처를 선택합니다. Auto 모드에서는 연결 가능한 소스는 실데이터를, 아닌 소스는 데모 데이터를 자동으로 혼합합니다.
        </p>

        <div className="space-y-2">
          {DATA_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setMode(mode.id)}
              className={`w-full text-left px-4 py-3 rounded-[var(--radius-md)] border transition-colors ${
                currentMode === mode.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                  : 'border-[var(--border-default)] bg-[var(--bg-tertiary)] hover:border-[var(--border-muted)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div style={{ color: mode.color }}>{mode.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">{mode.label}</span>
                    {currentMode === mode.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{mode.desc}</p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    currentMode === mode.id ? 'border-[var(--accent-primary)]' : 'border-[var(--border-default)]'
                  }`}
                >
                  {currentMode === mode.id && (
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">Data Source Indicators</h2>
        <div className="space-y-3 text-[12px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3FB950]/10 text-[#3FB950] text-[10px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" /> LIVE
            </span>
            <span className="text-[var(--text-secondary)]">Agent/Prometheus/Jaeger 연동 실데이터</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D29922]/10 text-[#D29922] text-[10px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D29922]" /> DEMO
            </span>
            <span className="text-[var(--text-secondary)]">내장 샘플 데이터 (연동 안 됨)</span>
          </div>
          <p className="text-[var(--text-muted)] mt-2">
            각 가젯, KPI 카드, 차트 우측 상단에 배지가 표시됩니다.
            하단 상태바에서 현재 페이지의 Live/Demo 데이터 카운트를 확인할 수 있습니다.
          </p>
        </div>
      </Card>
    </div>
  );
}
