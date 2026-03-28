'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import {
  Smartphone,
  Bell,
  BellOff,
  Shield,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

interface ChannelToggle {
  id: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

interface SeverityFilter {
  id: string;
  label: string;
  enabled: boolean;
}

const INITIAL_CHANNELS: ChannelToggle[] = [
  { id: 'slack', label: 'Slack', icon: <Bell size={12} />, enabled: true },
  { id: 'email', label: 'Email', icon: <Bell size={12} />, enabled: true },
  { id: 'push', label: 'Push Notification', icon: <Bell size={12} />, enabled: true },
  { id: 'pagerduty', label: 'PagerDuty', icon: <BellOff size={12} />, enabled: false },
  { id: 'teams', label: 'Teams', icon: <BellOff size={12} />, enabled: false },
];

const INITIAL_SEVERITIES: SeverityFilter[] = [
  { id: 'critical', label: 'Critical', enabled: true },
  { id: 'warning', label: 'Warning', enabled: true },
  { id: 'info', label: 'Info', enabled: false },
];

const MOCK_SERVICES = [
  { name: 'rag-service', status: 'healthy' as const },
  { name: 'embedding-api', status: 'healthy' as const },
  { name: 'guardrail-proxy', status: 'warning' as const },
  { name: 'vector-db', status: 'healthy' as const },
  { name: 'gpu-scheduler', status: 'critical' as const },
];

const MOCK_ALERTS = [
  { id: 'a1', message: 'GPU utilization exceeded 95% on gpu-node-03', severity: 'critical' as const, time: '2m ago' },
  { id: 'a2', message: 'Guardrail latency p99 above 500ms threshold', severity: 'warning' as const, time: '12m ago' },
  { id: 'a3', message: 'Model endpoint cold start detected', severity: 'warning' as const, time: '28m ago' },
];

export default function MobilePage() {
  const [channels, setChannels] = useState(INITIAL_CHANNELS);
  const [severities, setSeverities] = useState(INITIAL_SEVERITIES);

  const toggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const toggleSeverity = (id: string) => {
    setSeverities((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Mobile Dashboard', icon: <Smartphone size={14} /> },
        ]}
      />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">
        Mobile Dashboard Preview
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Mobile preview frame */}
        <div className="flex justify-center">
          <div
            className="w-full max-w-[375px] border-2 border-[var(--border-emphasis)] rounded-[24px] overflow-hidden bg-[var(--bg-primary)]"
            style={{ minHeight: 680 }}
          >
            {/* Phone notch */}
            <div className="flex justify-center pt-2 pb-3">
              <div className="w-28 h-1.5 rounded-full bg-[var(--border-default)]" />
            </div>

            <div className="px-4 pb-4 space-y-4">
              {/* Header inside phone */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  AITOP Dashboard
                </span>
                <Bell size={16} className="text-[var(--text-muted)]" />
              </div>

              {/* KPI cards 2x2 grid */}
              <div className="grid grid-cols-2 gap-2">
                <KPICard helpId="mobile-critical-alerts" title="Critical Alerts" value="3" status="critical" />
                <KPICard helpId="mobile-service-health" title="Service Health" value="92%" status="healthy" />
                <KPICard helpId="mobile-ttft-p95" title="TTFT P95" value="1.2s" status="warning" />
                <KPICard helpId="mobile-gpu-avg" title="GPU Avg" value="72%" />
              </div>

              {/* Service status list */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  Service Status
                </span>
                <div className="mt-1.5 space-y-0 divide-y divide-[var(--border-muted)]">
                  {MOCK_SERVICES.map((svc) => (
                    <div
                      key={svc.name}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-xs text-[var(--text-primary)]">
                        {svc.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor:
                              svc.status === 'healthy'
                                ? 'var(--status-healthy)'
                                : svc.status === 'warning'
                                  ? 'var(--status-warning)'
                                  : 'var(--status-critical)',
                          }}
                        />
                        <span className="text-[10px] text-[var(--text-muted)] capitalize">
                          {svc.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent alerts list */}
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  Recent Alerts
                </span>
                <div className="mt-1.5 space-y-2">
                  {MOCK_ALERTS.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-muted)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          {alert.severity === 'critical' ? (
                            <AlertTriangle
                              size={12}
                              className="text-[var(--status-critical)] mt-0.5 shrink-0"
                            />
                          ) : (
                            <Shield
                              size={12}
                              className="text-[var(--status-warning)] mt-0.5 shrink-0"
                            />
                          )}
                          <span className="text-[11px] text-[var(--text-primary)] leading-tight">
                            {alert.message}
                          </span>
                        </div>
                        <Badge variant="severity" severity={alert.severity}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] mt-1 block pl-[18px]">
                        {alert.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Push notification settings */}
        <div className="space-y-4">
          {/* Notification channels */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Bell size={14} />
                  Notification Channels
                </span>
              </CardTitle>
            </CardHeader>
            <div className="space-y-0 divide-y divide-[var(--border-muted)]">
              {channels.map((ch) => (
                <label
                  key={ch.id}
                  className="flex items-center justify-between py-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {ch.enabled ? (
                      <Bell size={14} className="text-[var(--accent-primary)]" />
                    ) : (
                      <BellOff size={14} className="text-[var(--text-muted)]" />
                    )}
                    <span className="text-xs text-[var(--text-primary)]">
                      {ch.label}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={ch.enabled}
                    onChange={() => toggleChannel(ch.id)}
                    className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </Card>

          {/* Severity filter */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Shield size={14} />
                  Severity Filter
                </span>
              </CardTitle>
            </CardHeader>
            <div className="space-y-0 divide-y divide-[var(--border-muted)]">
              {severities.map((sev) => (
                <label
                  key={sev.id}
                  className="flex items-center justify-between py-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {sev.id === 'critical' && (
                      <AlertTriangle size={14} className="text-[var(--status-critical)]" />
                    )}
                    {sev.id === 'warning' && (
                      <AlertTriangle size={14} className="text-[var(--status-warning)]" />
                    )}
                    {sev.id === 'info' && (
                      <CheckCircle size={14} className="text-[var(--status-info)]" />
                    )}
                    <span className="text-xs text-[var(--text-primary)] capitalize">
                      {sev.label}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={sev.enabled}
                    onChange={() => toggleSeverity(sev.id)}
                    className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </Card>

          {/* Quiet hours */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <BellOff size={14} />
                  Quiet Hours
                </span>
              </CardTitle>
            </CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">
                Notifications are muted during quiet hours
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)] tabular-nums">
                22:00 - 08:00
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
