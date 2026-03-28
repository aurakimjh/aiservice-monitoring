'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, SearchInput, Select, Button, Badge, DataSourceBadge, Modal } from '@/components/ui';
import { StatusIndicator, KPICard, HexagonMap, type HexCell } from '@/components/monitoring';
import { useProjectStore } from '@/stores/project-store';
import { getProjectHosts } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import type { Host, Status } from '@/types/monitoring';
import { Server, Table2, Hexagon, Plus, Check, AlertCircle, FolderPlus } from 'lucide-react';

const VIEW_TABS = [
  { id: 'table', label: 'Table', icon: <Table2 size={13} /> },
  { id: 'hexagon', label: 'Host Map', icon: <Hexagon size={13} /> },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
  { label: 'Offline', value: 'offline' },
];

const SIZE_METRIC_OPTIONS = [
  { label: 'CPU %', value: 'cpu' },
  { label: 'Memory %', value: 'mem' },
  { label: 'Disk %', value: 'disk' },
];

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
  : 'http://localhost:8080/api/v1';

// Transform API → Host[]
function transformHosts(raw: unknown): Host[] {
  const resp = raw as { items?: Array<Record<string, unknown>> };
  if (!resp.items?.length) return [];
  return resp.items.map((item) => ({
    id: String(item.id ?? item.hostname),
    hostname: String(item.hostname ?? 'unknown'),
    os: `${item.os_type ?? 'Linux'} ${item.os_version ?? ''}`.trim(),
    cpuCores: 0,
    memoryGB: Math.round(Number(item.memory_mb ?? 0) / 1024),
    status: mapAgentStatus(String(item.status ?? 'offline')),
    cpuPercent: Math.round(Number(item.cpu_percent ?? 0)),
    memPercent: item.memory_mb ? Math.round(Number(item.memory_mb) / 1024 / 32 * 100) : 0,
    diskPercent: 0,
    netIO: '-',
    middlewares: [],
    agent: {
      id: String(item.id),
      hostId: String(item.id),
      version: String(item.agent_version ?? '0.0.0'),
      status: mapAgentStatus(String(item.status ?? 'offline')) === 'healthy' ? 'healthy' : 'degraded',
      plugins: Array.isArray(item.collectors)
        ? (item.collectors as Array<Record<string, string>>).map((c) => ({
            id: c.plugin_id, name: c.plugin_id, version: c.version ?? '1.0.0',
            status: c.status === 'active' ? 'active' as const : 'inactive' as const,
            itemsCovered: [],
          }))
        : [],
      lastHeartbeat: String(item.last_heartbeat ?? new Date().toISOString()),
      lastCollection: String(item.last_heartbeat ?? new Date().toISOString()),
      mode: 'full' as const,
    },
  }));
}

function mapAgentStatus(s: string): Status {
  if (s === 'online' || s === 'healthy' || s === 'approved') return 'healthy';
  if (s === 'degraded') return 'warning';
  return 'critical';
}

// Pending agent type
interface PendingAgent {
  id: string;
  hostname: string;
  os_type: string;
  os_version: string;
  agent_version: string;
  status: string;
  cpu_percent: number;
  memory_mb: number;
  last_heartbeat: string;
  ai_detected: boolean;
  sdk_langs?: string[];
}

export default function InfraPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const demoFallback = useCallback(
    () => getProjectHosts(currentProjectId ?? 'proj-ai-prod'),
    [currentProjectId],
  );

  const hostsApiPath = currentProjectId
    ? `/realdata/hosts?project_id=${currentProjectId}`
    : '/realdata/hosts';

  const { data: hosts, source, refetch } = useDataSource<Host[]>(
    hostsApiPath,
    demoFallback,
    { refreshInterval: 15_000, transform: transformHosts },
  );

  const hostList = hosts ?? [];

  // ── Projects (프로젝트 목록) ──
  interface ProjectItem { id: string; name: string; environment: string }
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);

  // ── Pending agents (미승인) ──
  const [pendingAgents, setPendingAgents] = useState<PendingAgent[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  // Poll pending agents + projects
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pendingRes, projRes] = await Promise.all([
          fetch(`${API_BASE}/realdata/pending-agents`, { signal: AbortSignal.timeout(5000) }),
          fetch(`${API_BASE}/projects`, { signal: AbortSignal.timeout(5000) }),
        ]);
        if (pendingRes.ok) {
          const data = await pendingRes.json();
          setPendingAgents(data.items ?? []);
        }
        if (projRes.ok) {
          const data = await projRes.json();
          setProjects(data.items ?? []);
          if (!selectedProjectId && data.items?.length > 0) {
            setSelectedProjectId(data.items[0].id);
          }
        }
      } catch { /* ignore */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Create new project inline
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), environment: 'production' }),
      });
      if (res.ok) {
        const proj = await res.json();
        setProjects((prev) => [proj, ...prev]);
        setSelectedProjectId(proj.id);
        setNewProjectName('');
        setShowNewProject(false);
      }
    } catch { /* ignore */ }
  };

  // Approve selected agents + assign to project
  const handleApprove = async () => {
    if (selectedPending.size === 0) return;
    setApproving(true);
    try {
      const agentIds = Array.from(selectedPending);
      // 1. Approve agents
      await fetch(`${API_BASE}/realdata/approve-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_ids: agentIds }),
      });
      // 2. Assign to project (if selected)
      if (selectedProjectId) {
        await fetch(`${API_BASE}/projects/${selectedProjectId}/hosts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_ids: agentIds }),
        });
      }
      setSelectedPending(new Set());
      setShowAddModal(false);
      // Refresh
      refetch();
      const res = await fetch(`${API_BASE}/realdata/pending-agents`);
      if (res.ok) {
        const data = await res.json();
        setPendingAgents(data.items ?? []);
      }
    } catch { /* ignore */ }
    setApproving(false);
  };

  const togglePending = (id: string) => {
    setSelectedPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllPending = () => {
    if (selectedPending.size === pendingAgents.length) {
      setSelectedPending(new Set());
    } else {
      setSelectedPending(new Set(pendingAgents.map((a) => a.id)));
    }
  };

  const hasPending = pendingAgents.length > 0;

  // ── Table state ──
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sizeMetric, setSizeMetric] = useState('cpu');
  const [sortBy, setSortBy] = useState<'hostname' | 'cpu' | 'mem' | 'disk'>('hostname');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    const result = hostList.filter((h) => {
      if (search && !h.hostname.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && h.status !== statusFilter) return false;
      return true;
    });
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'hostname') cmp = a.hostname.localeCompare(b.hostname);
      else if (sortBy === 'cpu') cmp = a.cpuPercent - b.cpuPercent;
      else if (sortBy === 'mem') cmp = a.memPercent - b.memPercent;
      else if (sortBy === 'disk') cmp = a.diskPercent - b.diskPercent;
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [hostList, search, statusFilter, sortBy, sortDir]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  };
  const sortIcon = (col: typeof sortBy) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // KPI
  const total = hostList.length;
  const healthy = hostList.filter((h) => h.status === 'healthy').length;
  const warning = hostList.filter((h) => h.status === 'warning').length;
  const critical = hostList.filter((h) => h.status === 'critical' || h.status === 'offline').length;
  const avgCpu = total > 0 ? Math.round(hostList.reduce((s, h) => s + h.cpuPercent, 0) / total) : 0;
  const gpuCount = hostList.reduce((s, h) => s + (h.gpus?.length ?? 0), 0);

  // Hexagon data
  const hexCells = useMemo<HexCell[]>(() => {
    return filtered.map((h) => ({
      id: h.hostname,
      label: h.hostname,
      status: h.status,
      value: sizeMetric === 'cpu' ? h.cpuPercent : sizeMetric === 'mem' ? h.memPercent : h.diskPercent,
      detail: h.gpus ? `GPU x${h.gpus.length} | VRAM: ${h.gpus[0]?.vramPercent}%` : h.os,
      group: h.gpus ? 'GPU Servers' : h.middlewares.some((m) => m.type === 'db') ? 'Database Servers' : 'Application Servers',
    }));
  }, [filtered, sizeMetric]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', icon: <Server size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Infrastructure</h1>
          <DataSourceBadge source={source} />
        </div>
        <Button
          variant={hasPending ? 'primary' : 'secondary'}
          size="md"
          onClick={() => setShowAddModal(true)}
          className={cn(hasPending && 'animate-pulse')}
        >
          {hasPending ? (
            <>
              <AlertCircle size={14} />
              {pendingAgents.length} New Agent{pendingAgents.length > 1 ? 's' : ''} Detected
            </>
          ) : (
            <><Plus size={14} /> Add Host</>
          )}
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Total Hosts" helpId="total-hosts" value={total} status="healthy" />
        <KPICard title="Healthy" helpId="healthy-hosts" value={healthy} status="healthy" />
        <KPICard title="Warning" helpId="warning-hosts" value={warning} status={warning > 0 ? 'warning' : 'healthy'} />
        <KPICard title="Critical / Offline" helpId="critical-hosts" value={critical} status={critical > 0 ? 'critical' : 'healthy'} />
        <KPICard title="Avg CPU" helpId="cpu-usage" value={avgCpu} unit="%" status={avgCpu > 80 ? 'warning' : 'healthy'} />
        <KPICard helpId="infra-pending-agents" title="Pending" value={pendingAgents.length} status={hasPending ? 'warning' : 'healthy'} subtitle={hasPending ? 'Needs approval' : 'None'} />
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput placeholder="Search hosts..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
        {view === 'hexagon' && (
          <Select options={SIZE_METRIC_OPTIONS} value={sizeMetric} onChange={(e) => setSizeMetric(e.target.value)} />
        )}
        <div className="ml-auto">
          <Tabs tabs={VIEW_TABS} activeTab={view} onChange={setView} variant="pill" />
        </div>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('hostname')}>Hostname{sortIcon('hostname')}</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">OS</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('cpu')}>CPU{sortIcon('cpu')}</th>
                  <th className="px-4 py-2.5 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleSort('mem')}>Memory{sortIcon('mem')}</th>
                  <th className="px-4 py-2.5 font-medium">Middleware</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/infra/${h.hostname}`} className="font-medium text-[var(--accent-primary)] hover:underline">{h.hostname}</Link>
                    </td>
                    <td className="px-4 py-2.5"><StatusIndicator status={h.status} size="sm" /></td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{h.os}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums', h.cpuPercent > 85 ? 'text-[var(--status-critical)] font-medium' : h.cpuPercent > 70 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>{h.cpuPercent}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{h.memoryGB > 0 ? `${h.memoryGB} GB` : '-'}</td>
                    <td className="px-4 py-2.5"><div className="flex gap-1 flex-wrap">{h.middlewares.map((mw) => <Badge key={mw.name}>{mw.name}</Badge>)}</div></td>
                    <td className="px-4 py-2.5">
                      {h.agent
                        ? <StatusIndicator status={h.agent.status === 'healthy' ? 'healthy' : 'warning'} label={`v${h.agent.version}`} size="sm" />
                        : <span className="text-[var(--text-muted)]">-</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              {hasPending
                ? <>{pendingAgents.length} agent(s) detected — click <strong>"Add Host"</strong> to approve</>
                : 'No hosts registered. Waiting for agents to connect...'}
            </div>
          )}
        </Card>
      )}

      {/* Hexagon Map View */}
      {view === 'hexagon' && (
        <Card>
          <HexagonMap
            cells={hexCells}
            sizeMetric={SIZE_METRIC_OPTIONS.find((o) => o.value === sizeMetric)?.label ?? 'CPU %'}
            colorMetric="Status"
            onCellClick={(hostname) => { window.location.href = `/infra/${hostname}`; }}
          />
        </Card>
      )}

      {/* ── Add Host Modal (Pending Agents) ── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Hosts — Detected Agents" size="lg">
          {pendingAgents.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
              No pending agents detected. Install and start AITOP Agent on target hosts.
            </div>
          ) : (
            <>
              <div className="mb-3 text-xs text-[var(--text-secondary)]">
                {pendingAgents.length} agent(s) connected but not yet approved. Select and approve to add them to the infrastructure view.
              </div>
              <Card padding="none">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]">
                      <th className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedPending.size === pendingAgents.length && pendingAgents.length > 0}
                          onChange={selectAllPending}
                          className="accent-[var(--accent-primary)]"
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Hostname</th>
                      <th className="px-3 py-2 text-left font-medium">Agent ID</th>
                      <th className="px-3 py-2 text-left font-medium">OS</th>
                      <th className="px-3 py-2 text-left font-medium">Version</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">AI Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map((a) => (
                      <tr
                        key={a.id}
                        className={cn(
                          'border-b border-[var(--border-muted)] cursor-pointer transition-colors',
                          selectedPending.has(a.id) ? 'bg-[var(--accent-primary)]/5' : 'hover:bg-[var(--bg-tertiary)]',
                        )}
                        onClick={() => togglePending(a.id)}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedPending.has(a.id)}
                            onChange={() => togglePending(a.id)}
                            className="accent-[var(--accent-primary)]"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{a.hostname}</td>
                        <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{a.id}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{a.os_type} {a.os_version}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{a.agent_version}</td>
                        <td className="px-3 py-2">
                          <span className={cn('inline-flex items-center gap-1',
                            a.status === 'online' ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full',
                              a.status === 'online' ? 'bg-[var(--status-healthy)]' : 'bg-[var(--text-muted)]')} />
                            {a.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {a.ai_detected ? <Badge>AI</Badge> : <span className="text-[var(--text-muted)]">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              {/* Project 선택 */}
              <div className="mt-4 p-3 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] space-y-2">
                <div className="text-[11px] font-medium text-[var(--text-secondary)]">Assign to Project</div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    <option value="">— No project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.environment})</option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewProject(!showNewProject)}>
                    <FolderPlus size={13} />
                  </Button>
                </div>
                {showNewProject && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New project name..."
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                      className="flex-1 px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                    <Button variant="primary" size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()}>Create</Button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-[var(--text-muted)]">
                  {selectedPending.size} of {pendingAgents.length} selected
                  {selectedProjectId && ` → ${projects.find((p) => p.id === selectedProjectId)?.name ?? ''}`}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="md" onClick={() => setShowAddModal(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleApprove}
                    disabled={selectedPending.size === 0 || approving}
                  >
                    <Check size={14} />
                    {approving ? 'Approving...' : `Approve ${selectedPending.size} Host${selectedPending.size > 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Modal>
    </div>
  );
}
