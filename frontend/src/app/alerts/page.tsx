'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, Badge, Button, DataSourceBadge } from '@/components/ui';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { getAlertPolicies, getIncidents, getNotificationChannels } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { formatDuration, getRelativeTime } from '@/lib/utils';
import type { Severity, IncidentDetail, AlertPolicy, NotificationChannel } from '@/types/monitoring';
import {
  Bell,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  Wrench,
  CheckCircle2,
  XCircle,
  Mail,
  Webhook,
  Hash,
} from 'lucide-react';

const VIEW_TABS = [
  { id: 'policies', label: 'Alert Policies', icon: <ShieldCheck size={13} /> },
  { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={13} /> },
  { id: 'channels', label: 'Channels', icon: <MessageSquare size={13} /> },
];

const SEV_COLOR: Record<Severity, string> = {
  critical: 'text-[var(--status-critical)]',
  warning: 'text-[var(--status-warning)]',
  info: 'text-[var(--status-info)]',
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  slack: <Hash size={12} />,
  email: <Mail size={12} />,
  pagerduty: <Bell size={12} />,
  webhook: <Webhook size={12} />,
  teams: <MessageSquare size={12} />,
};

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState('policies');

  // Real-data hooks with demo fallback
  const demoPolicies = useCallback(() => getAlertPolicies(), []);
  const demoIncidents = useCallback(() => getIncidents(), []);
  const demoChannels = useCallback(() => getNotificationChannels(), []);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const { data: policiesData, source } = useDataSource<AlertPolicy[]>(
    '/alerts/policies',
    demoPolicies,
    { refreshInterval: 30_000, transform: (raw) => (raw as { items?: AlertPolicy[] }).items ?? raw as AlertPolicy[] },
  );
  const { data: incidentsData } = useDataSource<IncidentDetail[]>(
    '/alerts/incidents',
    demoIncidents,
    { refreshInterval: 15_000, transform: (raw) => (raw as { items?: IncidentDetail[] }).items ?? raw as IncidentDetail[] },
  );
  const { data: channelsData } = useDataSource<NotificationChannel[]>(
    '/alerts/channels',
    demoChannels,
    { refreshInterval: 60_000, transform: (raw) => (raw as { items?: NotificationChannel[] }).items ?? raw as NotificationChannel[] },
  );

  const policies = policiesData ?? [];
  const incidents = incidentsData ?? [];
  const channels = channelsData ?? [];

  const openIncidents = incidents.filter((i) => i.status !== 'resolved').length;
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Alerts', icon: <Bell size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Alerts & Incidents</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Alert Policies" value={policies.length} subtitle={`${policies.filter((p) => p.enabled).length} enabled`} status="healthy" />
        <KPICard title="Open Incidents" value={openIncidents} status={openIncidents > 0 ? 'critical' : 'healthy'} />
        <KPICard title="MTTR" value="30m" subtitle="mean time to resolve" status="healthy" />
        <KPICard title="Channels" value={channels.length} subtitle={`${channels.filter((c) => c.enabled).length} active`} />
      </div>

      <Tabs
        tabs={VIEW_TABS.map((t) => ({
          ...t,
          count: t.id === 'incidents' ? openIncidents : t.id === 'policies' ? policies.length : channels.length,
        }))}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Policies Tab ── */}
      {activeTab === 'policies' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Severity</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Condition</th>
                  <th className="px-4 py-2.5 font-medium">Threshold</th>
                  <th className="px-4 py-2.5 font-medium">Channels</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Last Triggered</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{p.name}</td>
                    <td className={cn('px-4 py-2.5 capitalize font-medium', SEV_COLOR[p.severity])}>{p.severity}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.target}</td>
                    <td className="px-4 py-2.5"><Badge>{p.conditionType}</Badge></td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--text-muted)] max-w-[200px] truncate">{p.condition}</td>
                    <td className="px-4 py-2.5"><Badge>{p.thresholdType}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {p.channels.map((ch) => (
                          <span key={ch} className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[10px] text-[var(--text-secondary)]">{ch}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs font-medium', p.enabled ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]')}>
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">
                      {p.lastTriggered ? getRelativeTime(new Date(p.lastTriggered)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Incidents Tab ── */}
      {activeTab === 'incidents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Incident List */}
          <div className="lg:col-span-1 space-y-2">
            {incidents.map((inc) => (
              <Card
                key={inc.id}
                className={cn('cursor-pointer transition-colors', selectedIncidentId === inc.id ? 'border-[var(--accent-primary)]' : '')}
                onClick={() => setSelectedIncidentId(inc.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-bold', SEV_COLOR[inc.severity])}>{inc.severity.toUpperCase()}</span>
                      <Badge variant="status" status={inc.status === 'open' ? 'critical' : inc.status === 'acknowledged' ? 'warning' : 'healthy'}>
                        {inc.status}
                      </Badge>
                    </div>
                    <div className="text-xs font-medium text-[var(--text-primary)] mt-1">{inc.title}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {inc.id} &middot; {getRelativeTime(new Date(inc.createdAt))}
                      {inc.assignee && <> &middot; @{inc.assignee}</>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Incident Detail */}
          <div className="lg:col-span-2">
            {selectedIncident ? (
              <IncidentTimeline incident={selectedIncident} onClose={() => setSelectedIncidentId(null)} />
            ) : (
              <Card>
                <div className="text-center py-16 text-sm text-[var(--text-muted)]">Select an incident to view details</div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── Channels Tab ── */}
      {activeTab === 'channels' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Configuration</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{ch.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[10px] font-medium text-[var(--text-secondary)]">
                        {CHANNEL_ICONS[ch.type]}
                        {ch.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{ch.config}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs font-medium', ch.enabled ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]')}>
                        {ch.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
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

// ── Incident Timeline Component ──

function IncidentTimeline({ incident, onClose }: { incident: IncidentDetail; onClose: () => void }) {
  return (
    <Card>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-bold', SEV_COLOR[incident.severity])}>{incident.severity.toUpperCase()}</span>
            <Badge variant="status" status={incident.status === 'open' ? 'critical' : incident.status === 'acknowledged' ? 'warning' : 'healthy'}>
              {incident.status}
            </Badge>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{incident.id}</span>
          </div>
          <div className="text-xs text-[var(--text-primary)] mt-1">{incident.title}</div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
            <span>Policy: {incident.relatedAlertPolicy}</span>
            {incident.assignee && <span>Assignee: @{incident.assignee}</span>}
            {incident.duration && <span>Duration: {formatDuration(incident.duration * 1000)}</span>}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[var(--bg-tertiary)] rounded">
          <X size={14} className="text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Timeline */}
      <div className="space-y-0 mb-4">
        {incident.timeline.map((event, idx) => (
          <div key={idx} className="flex items-start gap-3 py-2">
            <div className="flex flex-col items-center">
              <span className="text-sm">{event.icon}</span>
              {idx < incident.timeline.length - 1 && (
                <div className="w-px h-full min-h-[16px] bg-[var(--border-muted)] mt-1" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[var(--text-primary)]">{event.message}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {new Date(event.timestamp).toLocaleTimeString()}
                {event.actor && event.actor !== 'system' && <> &middot; @{event.actor}</>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* RCA */}
      {incident.rca && (
        <div className="border-t border-[var(--border-muted)] pt-3">
          <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Root Cause Analysis</div>
          <div className="px-3 py-2 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] leading-relaxed">
            {incident.rca}
          </div>
        </div>
      )}

      {/* Actions */}
      {incident.status !== 'resolved' && (
        <div className="border-t border-[var(--border-muted)] pt-3 mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm">Acknowledge</Button>
          <Button variant="secondary" size="sm">Resolve</Button>
          <Button variant="secondary" size="sm">Escalate</Button>
        </div>
      )}
    </Card>
  );
}
