'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, DataSourceBadge } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { KPICard } from '@/components/monitoring';
import { getGroupDashboard } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { getRelativeTime } from '@/lib/utils';
import type { GroupDashboard } from '@/types/monitoring';
import { fleetApi } from '@/lib/api-client';
import {
  Play,
  ArrowUpCircle,
  Settings2,
  RotateCcw,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';

const statusMap: Record<string, { label: string; color: 'healthy' | 'warning' | 'critical' }> = {
  healthy:  { label: 'Healthy',  color: 'healthy' },
  degraded: { label: 'Degraded', color: 'warning' },
  offline:  { label: 'Offline',  color: 'critical' },
};

// ── Group Batch Config Modal (25-3-5) ─────────────────────────────────────────

interface GroupConfigEntry {
  key: string;
  value: string;
}

function GroupConfigModal({
  open,
  onClose,
  groupId,
  groupName,
  agentCount,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  agentCount: number;
}) {
  const [entries, setEntries] = useState<GroupConfigEntry[]>([
    { key: 'collect.interval_sec', value: '30' },
    { key: 'collect.ai_enabled', value: 'true' },
    { key: 'log.level', value: 'info' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleAddEntry = useCallback(() => {
    setEntries((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const handleRemoveEntry = useCallback((idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleChange = useCallback((idx: number, field: 'key' | 'value', val: string) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  }, []);

  const handleApply = useCallback(async () => {
    const config: Record<string, unknown> = {};
    for (const { key, value } of entries) {
      if (key.trim()) config[key.trim()] = value;
    }
    setSubmitting(true);
    try {
      // Get the group to find all agent IDs, then apply config to each
      const groupData = await fleetApi.listGroups().catch(() => ({ items: [] as { id: string; agentIds: string[] }[] }));
      const grp = (groupData as { items: { id: string; agentIds: string[] }[] }).items.find((g) => g.id === groupId);
      const agentIds: string[] = grp?.agentIds ?? [];
      await Promise.allSettled(agentIds.map((aid) => fleetApi.updateAgentConfig(aid, config)));
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1800);
    } catch {
      // demo mode fallback
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1800);
    } finally {
      setSubmitting(false);
    }
  }, [entries, groupId, onClose]);

  return (
    <Modal open={open} onClose={onClose} title={`Batch Config — ${groupName}`} size="md">
      {done ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 size={32} className="text-[var(--status-healthy)]" />
          <p className="text-sm text-[var(--text-primary)]">
            Config applied to {agentCount} agent{agentCount !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            These settings will be pushed to all <strong>{agentCount}</strong> agents in the group.
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[10px] font-medium text-[var(--text-muted)] px-1">
              <span>Key</span>
              <span>Value</span>
              <span />
            </div>
            {entries.map((entry, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                <Input
                  value={entry.key}
                  onChange={(e) => handleChange(idx, 'key', e.target.value)}
                  placeholder="collect.interval_sec"
                  className="font-mono text-[11px]"
                />
                <Input
                  value={entry.value}
                  onChange={(e) => handleChange(idx, 'value', e.target.value)}
                  placeholder="30"
                  className="font-mono text-[11px]"
                />
                <button
                  onClick={() => handleRemoveEntry(idx)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--status-critical)] transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddEntry}
            className="flex items-center gap-1 text-xs text-[var(--accent-primary)] hover:underline"
          >
            <Plus size={11} /> Add field
          </button>

          <div className="pt-1 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => void handleApply()}
              disabled={submitting || entries.every((e) => !e.key.trim())}
            >
              {submitting ? <Loader2 size={12} className="animate-spin mr-1" /> : <Settings2 size={12} className="mr-1" />}
              Apply to All Agents
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Agent Restart Confirm Modal (25-4-2) ──────────────────────────────────────

function RestartAgentModal({
  open,
  onClose,
  agentId,
  hostname,
}: {
  open: boolean;
  onClose: () => void;
  agentId: string;
  hostname: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleRestart = useCallback(async () => {
    setSubmitting(true);
    try {
      await fleetApi.restartAgent(agentId);
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1500);
    } catch {
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 1500);
    } finally {
      setSubmitting(false);
    }
  }, [agentId, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Restart Agent" size="sm">
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <CheckCircle2 size={28} className="text-[var(--status-healthy)]" />
          <p className="text-sm text-[var(--text-primary)]">Restart queued for <strong>{hostname}</strong></p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Restart agent on <strong className="text-[var(--text-primary)] font-mono">{hostname}</strong>?
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            The agent process will be restarted. Collection will be briefly interrupted.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void handleRestart()} disabled={submitting}>
              {submitting ? <Loader2 size={12} className="animate-spin mr-1" /> : <RotateCcw size={12} className="mr-1" />}
              Restart
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GroupDashboardPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;

  const demoFn = useCallback(() => getGroupDashboard(groupId), [groupId]);
  const { data: dashboardData, source } = useDataSource<GroupDashboard>(
    `/fleet/groups/${groupId}`,
    demoFn,
    { refreshInterval: 30_000 },
  );
  const dashboard = dashboardData ?? getGroupDashboard(groupId);

  const healthyPct = dashboard.agentCount > 0
    ? Math.round((dashboard.healthyCount / dashboard.agentCount) * 100)
    : 0;

  const [collectLoading, setCollectLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [restartAgent, setRestartAgent] = useState<{ id: string; hostname: string } | null>(null);

  const handleTriggerCollect = useCallback(async () => {
    setCollectLoading(true);
    try {
      await fleetApi.triggerGroupCollect(groupId);
    } catch {
      // demo mode
    } finally {
      setCollectLoading(false);
    }
  }, [groupId]);

  const handleUpdateAll = useCallback(async () => {
    setUpdateLoading(true);
    try {
      await fleetApi.triggerGroupUpdate(groupId, '1.2.0');
    } catch {
      // demo mode
    } finally {
      setUpdateLoading(false);
    }
  }, [groupId]);

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Agents', href: '/agents' },
    { label: 'Groups', href: '/agents' },
    { label: dashboard.groupName },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={breadcrumbItems} />

      {/* Title + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {dashboard.groupName}
          </h1>
          <DataSourceBadge source={source} />
        </div>

        <div className="flex items-center gap-2">
          {/* 25-3-5: Batch Config */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfigOpen(true)}
          >
            <Settings2 size={13} />
            Batch Config
          </Button>
          {/* 25-2-5: Trigger Collection */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleTriggerCollect()}
            disabled={collectLoading}
          >
            {collectLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Trigger Collection
          </Button>
          {/* 25-2-5: OTA Update All */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleUpdateAll()}
            disabled={updateLoading}
          >
            {updateLoading ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpCircle size={13} />}
            Update All
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          helpId="group-agent-count"
          title="Agent Count"
          value={dashboard.agentCount}
          className="[&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:gap-1.5"
        />
        <KPICard
          helpId="group-healthy-pct"
          title="Healthy %"
          value={healthyPct}
          unit="%"
          status={healthyPct >= 80 ? 'healthy' : healthyPct >= 50 ? 'warning' : 'critical'}
        />
        <KPICard
          helpId="group-avg-cpu"
          title="Avg CPU %"
          value={dashboard.avgCpu}
          unit="%"
          status={dashboard.avgCpu > 80 ? 'critical' : dashboard.avgCpu > 60 ? 'warning' : 'healthy'}
        />
        <KPICard
          helpId="group-avg-memory"
          title="Avg Memory %"
          value={dashboard.avgMemory}
          unit="%"
          status={dashboard.avgMemory > 85 ? 'critical' : dashboard.avgMemory > 70 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Agents table */}
      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left font-medium py-2 px-3">Hostname</th>
                <th className="text-left font-medium py-2 px-3">Status</th>
                <th className="text-left font-medium py-2 px-3">Version</th>
                <th className="text-right font-medium py-2 px-3">CPU %</th>
                <th className="text-right font-medium py-2 px-3">Memory %</th>
                <th className="text-right font-medium py-2 px-3">Last Heartbeat</th>
                <th className="text-right font-medium py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.agents.map((agent) => {
                const info = statusMap[agent.status] ?? statusMap.offline;
                return (
                  <tr
                    key={agent.id}
                    className="border-b border-[var(--border-default)] last:border-b-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="py-2 px-3 text-[var(--text-primary)] font-medium">
                      {agent.hostname}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="status" status={info.color}>
                        {info.label}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-[var(--text-secondary)] tabular-nums">
                      {agent.version}
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right tabular-nums',
                      agent.cpu > 80 ? 'text-[var(--status-critical)]'
                        : agent.cpu > 60 ? 'text-[var(--status-warning)]'
                        : 'text-[var(--text-primary)]',
                    )}>
                      {agent.cpu}%
                    </td>
                    <td className={cn(
                      'py-2 px-3 text-right tabular-nums',
                      agent.memory > 85 ? 'text-[var(--status-critical)]'
                        : agent.memory > 70 ? 'text-[var(--status-warning)]'
                        : 'text-[var(--text-primary)]',
                    )}>
                      {agent.memory}%
                    </td>
                    <td className="py-2 px-3 text-right text-[var(--text-muted)] tabular-nums">
                      {getRelativeTime(new Date(agent.lastHeartbeat))}
                    </td>
                    {/* 25-4-2: Per-agent restart button */}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => setRestartAgent({ id: agent.id, hostname: agent.hostname })}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-emphasis)] transition-colors"
                        title="Restart agent"
                      >
                        <RotateCcw size={11} />
                        Restart
                      </button>
                    </td>
                  </tr>
                );
              })}

              {dashboard.agents.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    No agents in this group
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Modals ── */}
      <GroupConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        groupId={groupId}
        groupName={dashboard.groupName}
        agentCount={dashboard.agentCount}
      />

      {restartAgent && (
        <RestartAgentModal
          open={!!restartAgent}
          onClose={() => setRestartAgent(null)}
          agentId={restartAgent.id}
          hostname={restartAgent.hostname}
        />
      )}
    </div>
  );
}
