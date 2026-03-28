'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, DataSourceBadge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/monitoring';
import { DeployStrategyModal } from '@/components/monitoring/deploy-strategy-modal';
import { getPluginRegistry, getPluginAgentStatus } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import type { PluginRegistryItem, PluginAgentStatus } from '@/types/monitoring';
import {
  Package,
  Rocket,
  RotateCcw,
  Ban,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Tag,
  User,
  FileText,
  Monitor,
} from 'lucide-react';

const STATUS_STYLE: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  installed: { label: 'Installed', color: 'var(--status-healthy)', icon: CheckCircle2 },
  failed:    { label: 'Failed',    color: 'var(--status-critical)', icon: XCircle },
  pending:   { label: 'Pending',   color: 'var(--status-warning)', icon: Clock },
  rollback:  { label: 'Rollback',  color: 'var(--status-warning)', icon: RotateCcw },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(iso: string | undefined): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PluginDetailPage() {
  const params = useParams();
  const pluginName = params.name as string;

  const demoPlugin = useCallback(() => {
    const all = getPluginRegistry();
    return all.find(p => p.name === pluginName) ?? null;
  }, [pluginName]);
  const { data: pluginData, source } = useDataSource<PluginRegistryItem | null>(
    `/fleet/plugins/${pluginName}`,
    demoPlugin,
    { refreshInterval: 30_000 },
  );
  const plugin = pluginData ?? getPluginRegistry().find(p => p.name === pluginName) ?? null;

  const demoStatuses = useCallback(() => getPluginAgentStatus(pluginName), [pluginName]);
  const { data: statusData } = useDataSource<PluginAgentStatus[]>(
    `/fleet/plugins/${pluginName}/agents`,
    demoStatuses,
    {
      refreshInterval: 30_000,
      transform: (raw) => (raw as { items?: PluginAgentStatus[] }).items ?? raw as PluginAgentStatus[],
    },
  );
  const agentStatuses: PluginAgentStatus[] = statusData ?? getPluginAgentStatus(pluginName);

  const [showDeploy, setShowDeploy] = useState(false);

  if (!plugin) {
    return (
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Fleet', href: '/agents' },
          { label: 'Plugins', href: '/agents/plugins' },
          { label: pluginName },
        ]} />
        <Card>
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            Plugin &quot;{pluginName}&quot; not found
          </div>
        </Card>
      </div>
    );
  }

  const successRate = plugin.agent_summary.total > 0
    ? ((plugin.agent_summary.installed / plugin.agent_summary.total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Fleet', href: '/agents' },
        { label: 'Plugins', href: '/agents/plugins' },
        { label: plugin.name },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Package size={18} style={{ color: 'var(--accent-primary)' }} />
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {plugin.name}
            </h1>
            <DataSourceBadge source={source} />
            <span
              className="px-2 py-0.5 rounded text-[10px] font-mono"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              v{plugin.version}
            </span>
            {plugin.disabled && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ background: 'var(--status-critical)', color: '#fff' }}
              >
                DISABLED
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {plugin.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowDeploy(true)} disabled={plugin.disabled}>
            <Rocket size={14} className="mr-1.5" />
            Deploy
          </Button>
          <Button variant="ghost" size="sm">
            <RotateCcw size={14} className="mr-1.5" />
            Rollback
          </Button>
          <Button variant="ghost" size="sm">
            <Ban size={14} className="mr-1.5" />
            Disable
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          helpId="plugin-detail-total-agents"
          title="Total Agents"
          value={plugin.agent_summary.total}
          subtitle="targeted"
        />
        <KPICard
          helpId="plugin-detail-installed"
          title="Installed"
          value={plugin.agent_summary.installed}
          subtitle={`${successRate}% success`}
          status="healthy"
        />
        <KPICard
          helpId="plugin-detail-failed"
          title="Failed"
          value={plugin.agent_summary.failed}
          subtitle="require attention"
          status={plugin.agent_summary.failed > 0 ? 'critical' : undefined}
        />
        <KPICard
          helpId="plugin-detail-pending"
          title="Pending"
          value={plugin.agent_summary.pending}
          subtitle="awaiting install"
          status={plugin.agent_summary.pending > 0 ? 'warning' : undefined}
        />
      </div>

      {/* Plugin Info Card */}
      <Card>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Plugin Details
          </h2>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Author:</span>
              <span style={{ color: 'var(--text-primary)' }}>{plugin.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tag size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Categories:</span>
              <div className="flex gap-1">
                {plugin.categories.map(c => (
                  <span
                    key={c}
                    className="px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Monitor size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Platforms:</span>
              <span style={{ color: 'var(--text-primary)' }}>{plugin.platforms.join(', ')}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Size:</span>
              <span style={{ color: 'var(--text-primary)' }}>{formatBytes(plugin.size_bytes)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Checksum:</span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {plugin.checksum.substring(0, 16)}...
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={12} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Uploaded:</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {new Date(plugin.uploaded_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Per-Agent Installation Status */}
      <Card>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Agent Installation Status
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {agentStatuses.length} agents
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Agent</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Hostname</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Version</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Installed</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {agentStatuses.map((a) => {
                const style = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
                const IconComponent = style.icon;
                return (
                  <tr
                    key={a.agent_id}
                    className="hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ borderBottom: '1px solid var(--border-secondary)' }}
                  >
                    <td className="p-3 font-mono" style={{ color: 'var(--text-primary)' }}>
                      {a.agent_id}
                    </td>
                    <td className="p-3" style={{ color: 'var(--text-primary)' }}>
                      {a.hostname}
                    </td>
                    <td className="p-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {a.version}
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1">
                        <IconComponent size={12} style={{ color: style.color }} />
                        <span style={{ color: style.color }}>{style.label}</span>
                      </span>
                    </td>
                    <td className="p-3" style={{ color: 'var(--text-muted)' }}>
                      {a.installed_at ? formatTimeAgo(a.installed_at) : '-'}
                    </td>
                    <td className="p-3" style={{ color: 'var(--status-critical)' }}>
                      {a.error ? (
                        <span className="flex items-center gap-1">
                          <AlertTriangle size={11} />
                          <span className="truncate max-w-[300px]">{a.error}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Deploy Strategy Modal */}
      {showDeploy && (
        <DeployStrategyModal
          open={showDeploy}
          pluginName={plugin.name}
          onClose={() => setShowDeploy(false)}
          onDeploy={(req) => {
            console.log('Deploy request:', req);
            setShowDeploy(false);
          }}
        />
      )}
    </div>
  );
}
