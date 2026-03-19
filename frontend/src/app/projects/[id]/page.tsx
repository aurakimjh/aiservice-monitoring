'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Button, Tabs } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { KPICard, StatusIndicator, ServiceHealthGrid, AlertBanner } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { useProjectStore } from '@/stores/project-store';
import {
  getProjectHosts, getProjectServices, getProjectAIServices,
  getProjectAlerts, getHealthCells, generateTimeSeries,
} from '@/lib/demo-data';
import { getRelativeTime, formatDuration, formatCost } from '@/lib/utils';
import {
  FolderOpen, Server, Network, Bot, Settings, ExternalLink,
  AlertTriangle, Clock, TrendingUp, TrendingDown,
} from 'lucide-react';
import { ProjectSettings } from './settings';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'hosts', label: 'Hosts' },
  { id: 'services', label: 'Services' },
  { id: 'ai', label: 'AI Services' },
  { id: 'settings', label: 'Settings', icon: <Settings size={13} /> },
];

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const project = useProjectStore((s) => s.getProject(id));
  const [activeTab, setActiveTab] = useState('overview');

  if (!project) {
    return (
      <div className="text-center py-20 space-y-3">
        <div className="text-4xl">404</div>
        <div className="text-sm text-[var(--text-muted)]">Project not found</div>
        <Button variant="secondary" onClick={() => router.push('/projects')}>Back to Projects</Button>
      </div>
    );
  }

  const hosts = getProjectHosts(id);
  const services = getProjectServices(id);
  const aiServices = getProjectAIServices(id);
  const alerts = getProjectAlerts(id);
  const healthCells = getHealthCells(id);
  const firingAlerts = alerts.filter((a) => a.status === 'firing');

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Projects', href: '/projects', icon: <FolderOpen size={14} /> },
        { label: project.name },
      ]} />

      {/* Project Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusIndicator status={project.status} size="lg" />
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{project.name}</h1>
            <Badge variant="status" status={project.status}>{project.status}</Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">{project.description}</p>
          <div className="flex items-center gap-3 mt-2">
            {Object.entries(project.tags).map(([k, v]) => (
              <Badge key={k}>{k}: {v}</Badge>
            ))}
          </div>
        </div>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Firing Alerts */}
          {firingAlerts.map((alert) => (
            <AlertBanner
              key={alert.id}
              severity={alert.severity}
              title={alert.ruleName}
              message={`${alert.target} — ${alert.message}`}
              timestamp={getRelativeTime(alert.timestamp)}
            />
          ))}

          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPICard
              title="Services"
              value={services.length}
              subtitle={`${services.filter((s) => s.status === 'healthy').length} healthy`}
              status={services.every((s) => s.status === 'healthy') ? 'healthy' : 'warning'}
            />
            <KPICard
              title="Error Rate"
              value={project.errorRate.toFixed(2)}
              unit="%"
              trend={{ direction: 'down', value: '0.03%', positive: true }}
              status={project.errorRate < 0.5 ? 'healthy' : project.errorRate < 1 ? 'warning' : 'critical'}
            />
            <KPICard
              title="P95 Latency"
              value={project.p95Latency}
              unit="ms"
              trend={{ direction: 'down', value: '15ms', positive: true }}
              status={project.p95Latency < 500 ? 'healthy' : project.p95Latency < 2000 ? 'warning' : 'critical'}
              sparkData={[280, 265, 270, 255, 248, 260, 252, 245]}
            />
            <KPICard
              title="Throughput"
              value="1.2K"
              unit="/s"
              trend={{ direction: 'up', value: '200/s', positive: true }}
              status="healthy"
            />
            <KPICard
              title="SLO Compliance"
              value={project.sloCompliance.toFixed(1)}
              unit="%"
              subtitle="Target: 99.5%"
              status={project.sloCompliance >= 99.5 ? 'healthy' : project.sloCompliance >= 99 ? 'warning' : 'critical'}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle>Response Time (P50 / P95)</CardTitle></CardHeader>
              <TimeSeriesChart
                series={[
                  { name: 'P50', data: generateTimeSeries(180, 30, 60), type: 'area' },
                  { name: 'P95', data: generateTimeSeries(project.p95Latency, 50, 60), color: '#D29922' },
                ]}
                yAxisLabel="ms"
                thresholdLine={{ value: 500, label: 'SLO', color: '#F85149' }}
                height={200}
              />
            </Card>
            <Card>
              <CardHeader><CardTitle>Throughput (RPM)</CardTitle></CardHeader>
              <TimeSeriesChart
                series={[{ name: 'RPM', data: generateTimeSeries(1200, 200, 60), type: 'area', color: '#3FB950' }]}
                yAxisLabel="req/min"
                height={200}
              />
            </Card>
          </div>

          {/* Health Grid + AI Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle>Host Health Map</CardTitle></CardHeader>
              <ServiceHealthGrid title={`${hosts.length} hosts`} cells={healthCells} columns={Math.min(hosts.length, 6)} />
            </Card>

            {aiServices.length > 0 ? (
              <Card>
                <CardHeader><CardTitle>AI Services Summary</CardTitle></CardHeader>
                <div className="space-y-2.5">
                  {aiServices.map((ai) => (
                    <div key={ai.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <StatusIndicator status={ai.status} size="sm" />
                        <span className="text-[var(--text-primary)] font-medium">{ai.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{ai.model}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] tabular-nums">
                        {ai.ttftP95 != null && <span>TTFT: {formatDuration(ai.ttftP95)}</span>}
                        {ai.tpsP50 != null && <span>TPS: {ai.tpsP50}/s</span>}
                        {ai.costPerHour != null && <span>{formatCost(ai.costPerHour)}/h</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader><CardTitle>AI Services</CardTitle></CardHeader>
                <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                  <Bot size={32} className="mx-auto mb-2 opacity-30" />
                  No AI services in this project
                </div>
              </Card>
            )}
          </div>

          {/* Recent Alerts */}
          <Card>
            <CardHeader><CardTitle>Recent Alerts</CardTitle></CardHeader>
            {alerts.length === 0 ? (
              <div className="text-center py-4 text-xs text-[var(--text-muted)]">No recent alerts</div>
            ) : (
              <div className="space-y-1">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-center gap-3 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-tertiary)] text-xs">
                    <Badge variant="severity" severity={alert.severity}>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="font-medium text-[var(--text-primary)]">{alert.ruleName}</span>
                    <span className="text-[var(--text-muted)]">{alert.target}</span>
                    <span className="text-[var(--text-muted)]">{alert.message}</span>
                    <span className="ml-auto text-[var(--text-muted)] tabular-nums">{getRelativeTime(alert.timestamp)}</span>
                    <Badge variant="status" status={alert.status === 'resolved' ? 'healthy' : alert.status === 'firing' ? 'critical' : 'warning'}>
                      {alert.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Hosts Tab ── */}
      {activeTab === 'hosts' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Hostname</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">OS</th>
                  <th className="px-4 py-2.5 font-medium text-right">CPU</th>
                  <th className="px-4 py-2.5 font-medium text-right">MEM</th>
                  <th className="px-4 py-2.5 font-medium text-right">Disk</th>
                  <th className="px-4 py-2.5 font-medium">Middleware</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      {h.hostname}
                      {h.gpus && <span className="ml-1 text-[10px] text-[var(--text-muted)]">GPU x{h.gpus.length}</span>}
                    </td>
                    <td className="px-4 py-2.5"><StatusIndicator status={h.status} size="sm" /></td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{h.os}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', h.cpuPercent > 85 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>{h.cpuPercent}%</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', h.memPercent > 85 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>{h.memPercent}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{h.diskPercent}%</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {h.middlewares.map((mw) => (
                          <Badge key={mw.name}>{mw.name}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {h.agent ? (
                        <StatusIndicator status={h.agent.status === 'healthy' ? 'healthy' : h.agent.status === 'degraded' ? 'warning' : 'critical'} label={`v${h.agent.version}`} size="sm" />
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Services Tab ── */}
      {activeTab === 'services' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Service</th>
                  <th className="px-4 py-2.5 font-medium">Framework</th>
                  <th className="px-4 py-2.5 font-medium text-right">P95</th>
                  <th className="px-4 py-2.5 font-medium text-right">RPM</th>
                  <th className="px-4 py-2.5 font-medium text-right">Error Rate</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      <Network size={12} className="inline mr-1.5 text-[var(--text-muted)]" />
                      {s.name}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.framework} ({s.language})</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(s.latencyP95)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{s.rpm}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', s.errorRate > 0.5 ? 'text-[var(--status-critical)]' : 'text-[var(--text-secondary)]')}>{s.errorRate}%</td>
                    <td className="px-4 py-2.5"><StatusIndicator status={s.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── AI Services Tab ── */}
      {activeTab === 'ai' && (
        <Card padding="none">
          {aiServices.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              <Bot size={32} className="mx-auto mb-2 opacity-30" />
              No AI services registered in this project
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2.5 font-medium">Service</th>
                    <th className="px-4 py-2.5 font-medium">Model</th>
                    <th className="px-4 py-2.5 font-medium text-right">TTFT P95</th>
                    <th className="px-4 py-2.5 font-medium text-right">TPS</th>
                    <th className="px-4 py-2.5 font-medium text-right">GPU VRAM</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cost/h</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {aiServices.map((ai) => (
                    <tr key={ai.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                        <Bot size={12} className="inline mr-1.5 text-[var(--text-muted)]" />
                        {ai.name}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{ai.model ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{ai.ttftP95 != null ? formatDuration(ai.ttftP95) : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{ai.tpsP50 != null ? `${ai.tpsP50}/s` : '—'}</td>
                      <td className={cn('px-4 py-2.5 text-right tabular-nums', (ai.gpuVramPercent ?? 0) > 85 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>{ai.gpuVramPercent != null ? `${ai.gpuVramPercent}%` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{ai.costPerHour != null ? formatCost(ai.costPerHour) : '—'}</td>
                      <td className="px-4 py-2.5"><StatusIndicator status={ai.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Settings Tab ── */}
      {activeTab === 'settings' && <ProjectSettings project={project} />}
    </div>
  );
}
