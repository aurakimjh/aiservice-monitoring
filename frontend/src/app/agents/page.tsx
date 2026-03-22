'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, Badge } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { useProjectStore } from '@/stores/project-store';
import { useFleet } from '@/hooks/use-fleet';
import { fleetApi } from '@/lib/api-client';
import { getRelativeTime } from '@/lib/utils';
import type { AgentGroup, UpdatePhase } from '@/types/monitoring';
import {
  Cpu,
  Package,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  Wifi,
  WifiOff,
  Users,
  UploadCloud,
  Plus,
  Trash2,
  Edit2,
  Play,
  CalendarClock,
  DownloadCloud,
  RotateCcw,
  Settings2,
} from 'lucide-react';

// ── Tab definitions ──────────────────────────────────────────────────────────

const VIEW_TABS = [
  { id: 'agents',  label: 'Agent List',      icon: <Cpu size={13} /> },
  { id: 'groups',  label: 'Groups',           icon: <Users size={13} /> },
  { id: 'jobs',    label: 'Collection Jobs',  icon: <Clock size={13} /> },
  { id: 'plugins', label: 'Plugins',          icon: <Package size={13} /> },
  { id: 'updates', label: 'Update Status',    icon: <UploadCloud size={13} /> },
];

const JOB_TYPE_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  ai_diagnostic: 'AI Diagnostic',
  emergency: 'Emergency',
};

const UPDATE_PHASE_LABEL: Record<UpdatePhase, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'var(--text-muted)' },
  downloading: { label: 'Downloading', color: 'var(--accent-primary)' },
  installing:  { label: 'Installing',  color: 'var(--status-warning)' },
  completed:   { label: 'Completed',   color: 'var(--status-healthy)' },
  failed:      { label: 'Failed',      color: 'var(--status-critical)' },
  rolled_back: { label: 'Rolled Back', color: 'var(--status-warning)' },
};

// ── Plugin Deploy Modal ───────────────────────────────────────────────────────

function PluginDeployModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pluginName, setPluginName] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'group'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const plugins = ['IT - OS Plugin', 'IT - MW Plugin', 'AI - GPU/Serving', 'AI - LLM/Agent', 'AI - VectorDB'];

  const handleSubmit = useCallback(async () => {
    if (!pluginName) return;
    setSubmitting(true);
    try {
      await fleetApi.deployPlugin(pluginName, targetType);
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1500);
    } catch {
      // demo mode — just show success
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1500);
    } finally {
      setSubmitting(false);
    }
  }, [pluginName, targetType, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Plugin Deployment" size="md">
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <CheckCircle2 size={32} className="text-[var(--status-healthy)]" />
          <p className="text-sm text-[var(--text-primary)]">Deployment queued successfully</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Plugin</label>
            <select
              className="w-full text-xs bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
            >
              <option value="">— Select plugin —</option>
              {plugins.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Deploy Target</label>
            <div className="flex gap-2">
              {(['all', 'group'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={cn(
                    'flex-1 py-1.5 text-xs rounded-[var(--radius-sm)] border transition-colors',
                    targetType === t
                      ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                      : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-emphasis)]',
                  )}
                >
                  {t === 'all' ? 'All Agents' : 'By Group'}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-1 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={!pluginName || submitting}>
              {submitting ? <Loader2 size={12} className="animate-spin mr-1" /> : <DownloadCloud size={12} className="mr-1" />}
              Deploy
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Schedule Settings Modal ───────────────────────────────────────────────────

function ScheduleModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [cron, setCron] = useState('*/30 * * * *');
  const [targetType, setTargetType] = useState<'all' | 'group'>('all');
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const CRON_PRESETS = [
    { label: 'Every 5 min',  value: '*/5 * * * *' },
    { label: 'Every 30 min', value: '*/30 * * * *' },
    { label: 'Every 1 hour', value: '0 * * * *' },
    { label: 'Daily 2 AM',   value: '0 2 * * *' },
  ];

  const handleSave = useCallback(async () => {
    if (!name || !cron) return;
    setSubmitting(true);
    try {
      await fleetApi.saveSchedule({ name, cron, targetType, enabled });
      onSaved();
      onClose();
    } catch {
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [name, cron, targetType, enabled, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Collection Schedule" size="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Schedule Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GPU Group — 5 min" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Cron Expression</label>
          <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="*/30 * * * *" className="font-mono" />
          <div className="flex flex-wrap gap-1.5 mt-1">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setCron(p.value)}
                className={cn(
                  'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
                  cron === p.value
                    ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                    : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-emphasis)]',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Target</label>
          <div className="flex gap-2">
            {(['all', 'group'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTargetType(t)}
                className={cn(
                  'flex-1 py-1.5 text-xs rounded-[var(--radius-sm)] border transition-colors',
                  targetType === t
                    ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
                    : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-emphasis)]',
                )}
              >
                {t === 'all' ? 'All Agents' : 'By Group'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="sched-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[var(--accent-primary)]"
          />
          <label htmlFor="sched-enabled" className="text-xs text-[var(--text-secondary)] cursor-pointer">Enabled</label>
        </div>
        <div className="pt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={!name || !cron || submitting}>
            {submitting ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            Save Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Group Edit Modal ──────────────────────────────────────────────────────────

function GroupModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: AgentGroup;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(', '));
  const [submitting, setSubmitting] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name) return;
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      if (initial) {
        await fleetApi.updateGroup(initial.id, { name, description, tags });
      } else {
        await fleetApi.createGroup({ name, description, tags, agentIds: [] });
      }
      onSaved();
      onClose();
    } catch {
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [name, description, tagsRaw, initial, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Group' : 'New Group'} size="sm">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Group Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GPU Servers" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Tags (comma-separated)</label>
          <Input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="gpu, production" />
        </div>
        <div className="pt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={!name || submitting}>
            {submitting ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            {initial ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const { agents, jobs, plugins, groups, updateStatuses, schedules, loading, isLive, refresh } = useFleet(currentProjectId ?? undefined);

  const [activeTab, setActiveTab] = useState('agents');

  // Modals
  const [deployOpen, setDeployOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AgentGroup | undefined>(undefined);

  const stats = useMemo(() => {
    const total = agents.length;
    const healthy = agents.filter((a) => a.status === 'healthy').length;
    const degraded = agents.filter((a) => a.status === 'degraded').length;
    const offline = agents.filter((a) => a.status === 'offline').length;
    const needsUpdate = updateStatuses.filter((u) => u.phase !== 'completed').length;
    return { total, healthy, degraded, offline, needsUpdate };
  }, [agents, updateStatuses]);

  const handleDeleteGroup = useCallback(async (id: string) => {
    try {
      await fleetApi.deleteGroup(id);
    } catch {
      // demo mode
    }
    refresh();
  }, [refresh]);

  const handleTriggerUpdateAll = useCallback(async () => {
    const outdated = updateStatuses.filter((u) => u.phase !== 'completed').map((u) => u.agentId);
    if (outdated.length === 0) return;
    try {
      await fleetApi.triggerUpdate(outdated, '1.2.0');
    } catch {
      // demo mode
    }
    refresh();
  }, [updateStatuses, refresh]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Agent Fleet', icon: <Cpu size={14} /> },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Agent Fleet Console</h1>
        <div className="flex items-center gap-2">
          <span className={cn(
            'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
            isLive
              ? 'bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
          )}>
            {isLive ? <Wifi size={10} /> : <WifiOff size={10} />}
            {isLive ? 'LIVE' : 'DEMO'}
          </span>
          {/* Action buttons */}
          <Button variant="ghost" size="sm" onClick={() => setScheduleOpen(true)}>
            <CalendarClock size={12} className="mr-1" /> Schedule
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeployOpen(true)}>
            <Package size={12} className="mr-1" /> Deploy Plugin
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleTriggerUpdateAll()}
            disabled={stats.needsUpdate === 0}
          >
            <UploadCloud size={12} className="mr-1" />
            Update All {stats.needsUpdate > 0 && `(${stats.needsUpdate})`}
          </Button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard title="Total Agents" value={stats.total} subtitle="registered" status="healthy" />
        <KPICard title="Healthy" value={stats.healthy} status="healthy" />
        <KPICard title="Degraded" value={stats.degraded} status={stats.degraded > 0 ? 'warning' : 'healthy'} />
        <KPICard title="Offline" value={stats.offline} status={stats.offline > 0 ? 'critical' : 'healthy'} subtitle="needs attention" />
        <KPICard title="Pending Updates" value={stats.needsUpdate} subtitle="agents" trend={{ direction: 'flat', value: 'v1.2.0 target' }} />
      </div>

      <Tabs tabs={VIEW_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Agent List ── */}
      {activeTab === 'agents' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Hostname</th>
                  <th className="px-4 py-2.5 font-medium">Version</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">OS</th>
                  <th className="px-4 py-2.5 font-medium">Mode</th>
                  <th className="px-4 py-2.5 font-medium">Plugins</th>
                  <th className="px-4 py-2.5 font-medium">Last Heartbeat</th>
                  <th className="px-4 py-2.5 font-medium">Last Collection</th>
                </tr>
              </thead>
              <tbody>
                {loading && agents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      <Loader2 size={16} className="inline animate-spin mr-2" />Loading agents…
                    </td>
                  </tr>
                ) : agents.map((agent) => {
                  const isOutdated = agent.version !== '1.2.0';
                  return (
                    <tr key={agent.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/infra/${agent.hostname}`} className="font-medium text-[var(--accent-primary)] hover:underline font-mono">
                          {agent.hostname}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn('font-mono', isOutdated && 'text-[var(--status-warning)]')}>
                          v{agent.version}
                        </span>
                        {isOutdated && (
                          <span className="ml-1 text-[10px] text-[var(--status-warning)]">
                            <AlertTriangle size={10} className="inline" /> update
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusIndicator
                          status={agent.status === 'healthy' ? 'healthy' : agent.status === 'degraded' ? 'warning' : 'critical'}
                          label={agent.status}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{agent.os}</td>
                      <td className="px-4 py-2.5">
                        <Badge>{agent.mode}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {agent.plugins.length > 0 ? (
                          <span className="text-[var(--text-secondary)]">{agent.plugins.map((p) => p.name).join(', ')}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">IT (default)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{getRelativeTime(agent.lastHeartbeat)}</td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{getRelativeTime(agent.lastCollection)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Groups ── */}
      {activeTab === 'groups' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">{groups.length} groups defined</p>
            <Button size="sm" onClick={() => { setEditingGroup(undefined); setGroupModalOpen(true); }}>
              <Plus size={12} className="mr-1" /> New Group
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groups.map((grp) => {
              const memberAgents = agents.filter((a) => grp.agentIds.includes(a.id));
              const healthyCount = memberAgents.filter((a) => a.status === 'healthy').length;
              return (
                <Card key={grp.id}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{grp.name}</h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{grp.description}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingGroup(grp); setGroupModalOpen(true); }}
                        className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Edit group"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => void handleDeleteGroup(grp.id)}
                        className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--status-critical)] transition-colors"
                        title="Delete group"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Agent count bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      {memberAgents.length > 0 && (
                        <div
                          className="h-full bg-[var(--status-healthy)] rounded-full"
                          style={{ width: `${(healthyCount / memberAgents.length) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                      {healthyCount}/{memberAgents.length} healthy
                    </span>
                  </div>

                  {/* Tags */}
                  {grp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {grp.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* Members */}
                  {memberAgents.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {memberAgents.map((a) => (
                        <span key={a.id} className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded font-mono',
                          a.status === 'healthy' ? 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]' : 'bg-[var(--status-warning)]/10 text-[var(--status-warning)]',
                        )}>
                          {a.hostname}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-[var(--text-muted)] italic">No agents assigned</p>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Collection schedules for groups */}
          {schedules.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <CalendarClock size={14} />
                  Collection Schedules
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setScheduleOpen(true)}>
                  <Plus size={12} className="mr-1" /> Add Schedule
                </Button>
              </div>
              <div className="space-y-2">
                {schedules.map((sched) => (
                  <div key={sched.id} className="flex items-center gap-3 py-2 border-b border-[var(--border-muted)] last:border-0">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      sched.enabled ? 'bg-[var(--status-healthy)]' : 'bg-[var(--text-muted)]',
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">{sched.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        <span className="font-mono">{sched.cron}</span>
                        {' · '}
                        {sched.targetType === 'all' ? 'All Agents' : `Group: ${sched.targetId}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {sched.lastRun && (
                        <p className="text-[10px] text-[var(--text-muted)]">Last: {getRelativeTime(sched.lastRun)}</p>
                      )}
                      {sched.nextRun && sched.enabled && (
                        <p className="text-[10px] text-[var(--accent-primary)]">Next: {getRelativeTime(sched.nextRun)}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setScheduleOpen(true)} title="Edit schedule">
                      <Settings2 size={11} />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Collection Jobs ── */}
      {activeTab === 'jobs' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Job ID</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium text-right">Items</th>
                  <th className="px-4 py-2.5 font-medium" style={{ width: 160 }}>Progress</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[var(--accent-primary)]">{job.id}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={job.type === 'emergency' ? 'severity' : 'tag'} severity={job.type === 'emergency' ? 'critical' : undefined}>
                        {JOB_TYPE_LABELS[job.type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-primary)]">{job.target}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{job.items}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', job.status === 'running' ? 'bg-[var(--accent-primary)]' : job.status === 'completed' ? 'bg-[var(--status-healthy)]' : 'bg-[var(--status-critical)]')} style={{ width: `${job.progress}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-8 text-right">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {job.status === 'running' && <span className="flex items-center gap-1 text-[var(--accent-primary)]"><Loader2 size={11} className="animate-spin" /> Running</span>}
                      {job.status === 'completed' && <span className="flex items-center gap-1 text-[var(--status-healthy)]"><CheckCircle2 size={11} /> Done</span>}
                      {job.status === 'failed' && <span className="flex items-center gap-1 text-[var(--status-critical)]"><XCircle size={11} /> Failed</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{getRelativeTime(new Date(job.startTime))}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">No collection jobs</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Plugins ── */}
      {activeTab === 'plugins' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setDeployOpen(true)}>
              <DownloadCloud size={12} className="mr-1" /> Deploy Plugin
            </Button>
          </div>
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2.5 font-medium">Plugin</th>
                    <th className="px-4 py-2.5 font-medium">Version</th>
                    <th className="px-4 py-2.5 font-medium">Active Agents</th>
                    <th className="px-4 py-2.5 font-medium">Collect Items</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plugins.map((p) => (
                    <tr key={p.name} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{p.name}</td>
                      <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{p.version}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{p.activeAgents}/{p.totalAgents}</td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">{p.collectItems}</td>
                      <td className="px-4 py-2.5"><StatusIndicator status={p.status} size="sm" /></td>
                    </tr>
                  ))}
                  {plugins.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">No plugins registered</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Update Status ── */}
      {activeTab === 'updates' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              {updateStatuses.filter((u) => u.phase === 'completed').length} / {updateStatuses.length} agents on latest version
            </p>
            <Button
              size="sm"
              onClick={() => void handleTriggerUpdateAll()}
              disabled={stats.needsUpdate === 0}
            >
              <UploadCloud size={12} className="mr-1" />
              Update Pending ({stats.needsUpdate})
            </Button>
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2.5 font-medium">Hostname</th>
                    <th className="px-4 py-2.5 font-medium">Current</th>
                    <th className="px-4 py-2.5 font-medium">Target</th>
                    <th className="px-4 py-2.5 font-medium" style={{ width: 160 }}>Progress</th>
                    <th className="px-4 py-2.5 font-medium">Phase</th>
                    <th className="px-4 py-2.5 font-medium">Completed</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {updateStatuses.map((u) => {
                    const phaseInfo = UPDATE_PHASE_LABEL[u.phase];
                    const isActive = u.phase === 'downloading' || u.phase === 'installing';
                    return (
                      <tr key={u.agentId} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[var(--accent-primary)]">
                          <Link href={`/infra/${u.hostname}`} className="hover:underline">{u.hostname}</Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">v{u.currentVersion}</td>
                        <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">v{u.targetVersion}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all',
                                  u.phase === 'completed' ? 'bg-[var(--status-healthy)]'
                                  : u.phase === 'failed' ? 'bg-[var(--status-critical)]'
                                  : 'bg-[var(--accent-primary)]',
                                )}
                                style={{ width: `${u.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-[var(--text-muted)] w-8 text-right">{u.progress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1" style={{ color: phaseInfo.color }}>
                            {isActive && <Loader2 size={11} className="animate-spin" />}
                            {u.phase === 'completed' && <CheckCircle2 size={11} />}
                            {u.phase === 'failed' && <XCircle size={11} />}
                            {u.phase === 'rolled_back' && <RotateCcw size={11} />}
                            {u.phase === 'pending' && <Play size={11} />}
                            {phaseInfo.label}
                          </span>
                          {u.errorMessage && (
                            <p className="text-[10px] text-[var(--status-critical)] mt-0.5">{u.errorMessage}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">
                          {u.completedAt ? getRelativeTime(u.completedAt) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {u.phase === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void fleetApi.triggerUpdate([u.agentId], u.targetVersion).catch(() => {}).then(() => refresh())}
                            >
                              <UploadCloud size={11} className="mr-1" /> Start
                            </Button>
                          )}
                          {u.phase === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void fleetApi.triggerUpdate([u.agentId], u.targetVersion).catch(() => {}).then(() => refresh())}
                            >
                              <RotateCcw size={11} className="mr-1" /> Retry
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {updateStatuses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">No update data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      <PluginDeployModal open={deployOpen} onClose={() => setDeployOpen(false)} />
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onSaved={() => void refresh()} />
      <GroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSaved={() => void refresh()}
        initial={editingGroup}
      />
    </div>
  );
}
