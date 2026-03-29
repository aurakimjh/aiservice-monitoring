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

const DATA_MODES: { id: DataSourceMode; label: string; desc: string; detail: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'auto',
    label: 'Auto (Recommended)',
    desc: '실데이터를 먼저 시도하고, 연결이 안 되면 자동으로 데모 데이터를 보여줍니다.',
    detail: '처음 설치하거나 일부 서비스만 연결된 상태에서 가장 적합합니다. 예를 들어 Prometheus는 연결되어 있지만 Jaeger는 아직 설치 전이라면, 메트릭 위젯은 실데이터(초록 LIVE 배지)로, 트레이스 위젯은 샘플 데이터(노란 DEMO 배지)로 표시됩니다. 에이전트나 서비스를 추가 연결하면 해당 위젯이 자동으로 LIVE로 전환됩니다.',
    icon: <Wifi size={16} />,
    color: '#58A6FF',
  },
  {
    id: 'live',
    label: 'Live Only',
    desc: '실제 서버에서 수집한 데이터만 표시합니다. 연결이 안 되면 빈 화면이 나옵니다.',
    detail: '운영 환경에서 사용하세요. Collection Server, Agent, Prometheus, Jaeger 등이 모두 연결된 상태에서 정확한 실데이터만 보고 싶을 때 선택합니다. 데모 데이터가 절대 섞이지 않으므로 화면에 보이는 모든 수치가 실제 시스템 상태입니다. 연결이 끊기면 에러 메시지가 표시됩니다.',
    icon: <Radio size={16} />,
    color: '#3FB950',
  },
  {
    id: 'demo',
    label: 'Demo Mode',
    desc: '서버 연결 없이 내장된 샘플 데이터로 모든 화면을 바로 볼 수 있습니다.',
    detail: '영업 시연, UI 확인, 신규 사용자 교육에 적합합니다. 백엔드 서버가 실행되지 않아도 모든 대시보드, 차트, 테이블이 샘플 데이터로 채워집니다. 이 모드에서 보이는 데이터는 실제 시스템과 무관한 고정된 예시 데이터입니다.',
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
          대시보드에 표시되는 데이터를 어디에서 가져올지 선택합니다.
          각 위젯마다 데이터 출처가 <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-[#3FB950]/10 text-[#3FB950] text-[10px] font-medium"><span className="w-1 h-1 rounded-full bg-[#3FB950]" />LIVE</span> 또는 <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-[#D29922]/10 text-[#D29922] text-[10px] font-medium"><span className="w-1 h-1 rounded-full bg-[#D29922]" />DEMO</span> 배지로 표시됩니다.
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
                <div className="shrink-0" style={{ color: mode.color }}>{mode.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">{mode.label}</span>
                    {currentMode === mode.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-0.5">{mode.desc}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">{mode.detail}</p>
                </div>
                <div
                  className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
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
        <h2 className="text-sm font-medium text-[var(--text-primary)] mb-3">배지 읽는 법</h2>
        <div className="space-y-3 text-[12px]">
          <div className="flex items-start gap-3">
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3FB950]/10 text-[#3FB950] text-[10px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" /> LIVE
            </span>
            <span className="text-[var(--text-secondary)]">이 위젯은 실제 서버(Prometheus, Jaeger, Collection Server)에서 수집한 진짜 데이터를 보여주고 있습니다.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D29922]/10 text-[#D29922] text-[10px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D29922]" /> DEMO
            </span>
            <span className="text-[var(--text-secondary)]">이 위젯은 서버 연결이 안 되어 내장된 샘플 데이터를 보여주고 있습니다. 해당 서비스를 연결하면 자동으로 LIVE로 바뀝니다.</span>
          </div>
          <div className="mt-2 px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-default)]">
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              <strong>확인 방법:</strong> 각 카드, 차트, 테이블의 오른쪽 상단에 작은 배지가 붙어 있습니다.
              화면 맨 아래 상태바에서는 현재 페이지에서 LIVE 위젯과 DEMO 위젯이 각각 몇 개인지 숫자로 보여줍니다.
              모든 위젯이 LIVE가 되면 데모 데이터 없이 완전한 실데이터 모니터링 상태입니다.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
