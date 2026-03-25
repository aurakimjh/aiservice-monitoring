'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/monitoring';
import { DeployStrategyModal } from '@/components/monitoring/deploy-strategy-modal';
import { getPluginRegistry, getPluginDeployHistory } from '@/lib/demo-data';
import type { PluginRegistryItem, PluginDeployHistory } from '@/types/monitoring';
import {
  Package,
  Upload,
  Rocket,
  RotateCcw,
  Ban,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  History,
} from 'lucide-react';

const STRATEGY_LABEL: Record<string, { label: string; color: string }> = {
  immediate: { label: 'Immediate', color: 'var(--accent-primary)' },
  staged:    { label: 'Staged',    color: 'var(--status-warning)' },
  scheduled: { label: 'Scheduled', color: 'var(--text-muted)' },
};

const DEPLOY_STATUS_STYLE: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'var(--text-muted)' },
  in_progress: { label: 'In Progress', color: 'var(--accent-primary)' },
  completed:   { label: 'Completed',   color: 'var(--status-healthy)' },
  failed:      { label: 'Failed',      color: 'var(--status-critical)' },
  rolled_back: { label: 'Rolled Back', color: 'var(--status-warning)' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FleetPluginsPage() {
  const plugins = useMemo(() => getPluginRegistry(), []);
  const history = useMemo(() => getPluginDeployHistory(), []);

  const [deployTarget, setDeployTarget] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // KPI calculations
  const totalPlugins = plugins.length;
  const activePlugins = plugins.filter(p => !p.disabled).length;
  const totalDeployedAgents = plugins.reduce((sum, p) => sum + p.agent_summary.installed, 0);
  const totalAgents = plugins.reduce((sum, p) => sum + p.agent_summary.total, 0);
  const successRate = totalAgents > 0
    ? ((totalDeployedAgents / totalAgents) * 100).toFixed(1)
    : '0.0';
  const pendingDeploys = plugins.reduce((sum, p) => sum + p.agent_summary.pending, 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Fleet', href: '/agents' },
        { label: 'Plugins' },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Plugin Registry
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Central plugin deployment and lifecycle management
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowUpload(true)}
        >
          <Upload size={14} className="mr-1.5" />
          Upload Plugin
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="Total Plugins"
          value={totalPlugins}
          subtitle={`${activePlugins} active`}
        />
        <KPICard
          title="Deployed Agents"
          value={totalDeployedAgents}
          subtitle={`across ${activePlugins} plugins`}
        />
        <KPICard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${totalAgents} total targets`}
          status={Number(successRate) >= 90 ? 'healthy' : Number(successRate) >= 70 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Pending Deploys"
          value={pendingDeploys}
          subtitle="awaiting install"
          status={pendingDeploys > 0 ? 'warning' : undefined}
        />
      </div>

      {/* Plugin Registry Table */}
      <Card>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Registered Plugins
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Plugin</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Version</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Categories</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Size</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Deploys</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Installed</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Failed</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Pending</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Uploaded</th>
                <th className="text-right p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr
                  key={p.name}
                  className="hover:bg-[var(--bg-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--border-secondary)' }}
                >
                  <td className="p-3">
                    <Link
                      href={`/agents/plugins/${p.name}`}
                      className="font-medium hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {p.name}
                    </Link>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {p.author}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{p.version}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {p.categories.map(c => (
                        <span
                          key={c}
                          className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3" style={{ color: 'var(--text-secondary)' }}>
                    {formatBytes(p.size_bytes)}
                  </td>
                  <td className="p-3 text-center" style={{ color: 'var(--text-primary)' }}>
                    {p.deploy_count}
                  </td>
                  <td className="p-3 text-center">
                    <span style={{ color: 'var(--status-healthy)' }}>
                      {p.agent_summary.installed}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span style={{ color: p.agent_summary.failed > 0 ? 'var(--status-critical)' : 'var(--text-muted)' }}>
                      {p.agent_summary.failed}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span style={{ color: p.agent_summary.pending > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}>
                      {p.agent_summary.pending}
                    </span>
                  </td>
                  <td className="p-3" style={{ color: 'var(--text-muted)' }}>
                    {formatTimeAgo(p.uploaded_at)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1 rounded hover:bg-[var(--bg-hover)]"
                        title="Deploy"
                        onClick={() => setDeployTarget(p.name)}
                        disabled={p.disabled}
                      >
                        <Rocket size={13} style={{ color: p.disabled ? 'var(--text-muted)' : 'var(--accent-primary)' }} />
                      </button>
                      <button className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Rollback">
                        <RotateCcw size={13} style={{ color: 'var(--status-warning)' }} />
                      </button>
                      <button className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Disable">
                        <Ban size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Delete">
                        <Trash2 size={13} style={{ color: 'var(--status-critical)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Deploy History Timeline */}
      <Card>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <History size={14} style={{ color: 'var(--text-secondary)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Deploy History
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Deploy ID</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Plugin</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Version</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Strategy</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Agents</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Success</th>
                <th className="text-center p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Failed</th>
                <th className="text-left p-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const statusStyle = DEPLOY_STATUS_STYLE[h.status] || DEPLOY_STATUS_STYLE.pending;
                const strategyStyle = STRATEGY_LABEL[h.strategy] || STRATEGY_LABEL.immediate;
                return (
                  <tr
                    key={h.deploy_id}
                    className="hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ borderBottom: '1px solid var(--border-secondary)' }}
                  >
                    <td className="p-3 font-mono" style={{ color: 'var(--text-muted)' }}>
                      {h.deploy_id}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/agents/plugins/${h.plugin_name}`}
                        className="hover:underline"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {h.plugin_name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono" style={{ color: 'var(--text-primary)' }}>
                      {h.version}
                    </td>
                    <td className="p-3">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          color: strategyStyle.color,
                          background: 'var(--bg-tertiary)',
                        }}
                      >
                        {strategyStyle.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1">
                        {h.status === 'completed' && <CheckCircle2 size={12} style={{ color: statusStyle.color }} />}
                        {h.status === 'failed' && <XCircle size={12} style={{ color: statusStyle.color }} />}
                        {h.status === 'in_progress' && <Clock size={12} style={{ color: statusStyle.color }} />}
                        {h.status === 'rolled_back' && <RotateCcw size={12} style={{ color: statusStyle.color }} />}
                        {h.status === 'pending' && <Clock size={12} style={{ color: statusStyle.color }} />}
                        <span style={{ color: statusStyle.color }}>{statusStyle.label}</span>
                      </span>
                    </td>
                    <td className="p-3 text-center" style={{ color: 'var(--text-primary)' }}>
                      {h.total_agents}
                    </td>
                    <td className="p-3 text-center" style={{ color: 'var(--status-healthy)' }}>
                      {h.success_count}
                    </td>
                    <td className="p-3 text-center" style={{ color: h.fail_count > 0 ? 'var(--status-critical)' : 'var(--text-muted)' }}>
                      {h.fail_count}
                    </td>
                    <td className="p-3" style={{ color: 'var(--text-muted)' }}>
                      {formatTimeAgo(h.started_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upload Modal (simple placeholder) */}
      {showUpload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowUpload(false)}
        >
          <div
            className="rounded-lg p-6 max-w-md w-full"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Upload Plugin
            </h3>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center mb-4"
              style={{ borderColor: 'var(--border-secondary)' }}
            >
              <Upload size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Drag & drop a plugin ZIP or click to browse
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Must contain manifest.yaml at root level
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled>
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Strategy Modal */}
      {deployTarget && (
        <DeployStrategyModal
          open={!!deployTarget}
          pluginName={deployTarget}
          onClose={() => setDeployTarget(null)}
          onDeploy={(req) => {
            // In production, this would call the API.
            console.log('Deploy request:', req);
            setDeployTarget(null);
          }}
        />
      )}
    </div>
  );
}
