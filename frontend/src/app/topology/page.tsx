'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge, Tabs } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { ServiceMap } from '@/components/monitoring/service-map';
import { ProtocolBadge } from '@/components/topology';
import { getDiscoveredTopology, getTopologyChanges } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { useProjectStore } from '@/stores/project-store';
import { getRelativeTime } from '@/lib/utils';
import type { TopologyNode, TopologyEdge } from '@/lib/demo-data';
import {
  GitFork,
  Plus,
  Minus,
  Network,
  Globe,
  Zap,
  Database,
  Box,
  Radio,
  Server,
  Layers,
  FolderOpen,
} from 'lucide-react';

const CHANGE_TYPE_CONFIG: Record<
  string,
  { icon: typeof Plus; color: string; bgColor: string; label: string }
> = {
  connection_added: {
    icon: Plus,
    color: 'text-[#3FB950]',
    bgColor: 'bg-[#3FB950]/10',
    label: 'Connection Added',
  },
  connection_removed: {
    icon: Minus,
    color: 'text-[#F85149]',
    bgColor: 'bg-[#F85149]/10',
    label: 'Connection Removed',
  },
  service_added: {
    icon: Box,
    color: 'text-[#58A6FF]',
    bgColor: 'bg-[#58A6FF]/10',
    label: 'Service Added',
  },
  service_removed: {
    icon: Minus,
    color: 'text-[#F85149]',
    bgColor: 'bg-[#F85149]/10',
    label: 'Service Removed',
  },
};

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
  : 'http://localhost:8080/api/v1';

type DrillLevel = 'service' | 'host' | 'instance';

const DRILL_TABS = [
  { id: 'service', label: 'Services', icon: <Layers size={13} /> },
  { id: 'host', label: 'Hosts', icon: <Server size={13} /> },
  { id: 'instance', label: 'Instances', icon: <Box size={13} /> },
];

export default function TopologyPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('service');

  const demoTopology = useCallback(() => getDiscoveredTopology(), []);
  const demoChanges = useCallback(() => getTopologyChanges(), []);

  const { data: topology, source } = useDataSource(
    '/api/v2/services/deps',
    demoTopology,
    { refreshInterval: 60_000 },
  );
  const { data: changes } = useDataSource(
    '/topology/changes',
    demoChanges,
    { refreshInterval: 60_000 },
  );

  // Map discovered topology nodes/edges to ServiceMap-compatible types
  const topoData = topology ?? { nodes: [], edges: [] };
  const nodes: TopologyNode[] = useMemo(
    () =>
      (topoData.nodes ?? []).map((n: TopologyNode) => ({
        id: n.id,
        name: n.name,
        layer: n.layer as TopologyNode['layer'],
        status: n.status,
        rpm: n.rpm,
        errorRate: n.errorRate,
        p95: n.p95,
        framework: n.framework,
      })),
    [topoData.nodes],
  );

  const edges: TopologyEdge[] = useMemo(
    () =>
      (topoData.edges ?? []).map((e: TopologyEdge) => ({
        source: e.source,
        target: e.target,
        rpm: e.rpm,
        errorRate: e.errorRate,
        p95: e.p95,
      })),
    [topoData.edges],
  );

  // ── Drill-down: Host-level and Instance-level topology ──
  interface HostNode { id: string; hostname: string; os_type: string; cpu_percent: number; status: string }
  interface InstanceNode { id: string; service_id: string; hostname: string; endpoint: string; status: string }

  const [hostNodes, setHostNodes] = useState<HostNode[]>([]);
  const [instanceNodes, setInstanceNodes] = useState<InstanceNode[]>([]);

  useEffect(() => {
    if (drillLevel === 'host') {
      fetch(`${API_BASE}/realdata/hosts`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.items) setHostNodes(d.items); })
        .catch(() => {});
    } else if (drillLevel === 'instance') {
      fetch(`${API_BASE}/instances`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.items) setInstanceNodes(d.items); })
        .catch(() => {});
    }
  }, [drillLevel]);

  // Build drill-level nodes for ServiceMap
  const drillNodes: TopologyNode[] = useMemo(() => {
    if (drillLevel === 'service') return nodes;
    if (drillLevel === 'host') {
      return hostNodes.map(h => ({
        id: h.id,
        name: h.hostname,
        layer: 'infra' as TopologyNode['layer'],
        status: h.status === 'online' ? 'healthy' : 'critical',
        rpm: 0,
        errorRate: 0,
        p95: 0,
        framework: h.os_type,
      }));
    }
    // instance level
    return instanceNodes.map(inst => ({
      id: inst.id,
      name: `${inst.hostname}:${inst.endpoint.split(':').pop() ?? '*'}`,
      layer: 'agent' as TopologyNode['layer'],
      status: inst.status === 'running' ? 'healthy' : 'critical',
      rpm: 0,
      errorRate: 0,
      p95: 0,
      framework: inst.service_id,
    }));
  }, [drillLevel, nodes, hostNodes, instanceNodes]);

  const drillEdges: TopologyEdge[] = useMemo(() => {
    if (drillLevel === 'service') return edges;
    // Host/Instance levels: generate edges from instances → services
    if (drillLevel === 'host') {
      // Connect hosts that share services
      const hostEdges: TopologyEdge[] = [];
      for (let i = 0; i < hostNodes.length; i++) {
        for (let j = i + 1; j < hostNodes.length; j++) {
          hostEdges.push({ source: hostNodes[i].id, target: hostNodes[j].id, rpm: 0, errorRate: 0, p95: 0 });
        }
      }
      return hostEdges;
    }
    // Instance: connect instances of same service
    const byService: Record<string, string[]> = {};
    instanceNodes.forEach(inst => {
      if (!byService[inst.service_id]) byService[inst.service_id] = [];
      byService[inst.service_id].push(inst.id);
    });
    const instEdges: TopologyEdge[] = [];
    Object.values(byService).forEach(ids => {
      for (let i = 0; i < ids.length - 1; i++) {
        instEdges.push({ source: ids[i], target: ids[i + 1], rpm: 0, errorRate: 0, p95: 0 });
      }
    });
    return instEdges;
  }, [drillLevel, edges, hostNodes, instanceNodes]);

  // KPI computations
  const changesData = changes ?? [];
  const totalServices = (topoData.nodes ?? []).length;
  const activeConnections = (topoData.edges ?? []).filter((e: TopologyEdge & { isRemoved?: boolean }) => !e.isRemoved).length;
  const newIn24h = (topoData.edges ?? []).filter((e: TopologyEdge & { isNew?: boolean }) => e.isNew).length;
  const removedIn24h = (topoData.edges ?? []).filter((e: TopologyEdge & { isRemoved?: boolean }) => e.isRemoved).length;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Topology', icon: <Network size={14} /> },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Topology Auto-Discovery
          </h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Automatic service dependency mapping via eBPF and traffic analysis
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          helpId="topo-total-services"
          title="Total Services"
          value={totalServices}
          subtitle="discovered services"
          status="healthy"
        />
        <KPICard
          helpId="topo-active-connections"
          title="Active Connections"
          value={activeConnections}
          subtitle="live connections"
          status="healthy"
        />
        <KPICard
          helpId="topo-new-24h"
          title="New (24h)"
          value={newIn24h}
          subtitle="recently discovered"
          status={newIn24h > 0 ? 'warning' : 'healthy'}
        />
        <KPICard
          helpId="topo-removed-24h"
          title="Removed (24h)"
          value={removedIn24h}
          subtitle="no longer active"
          status={removedIn24h > 0 ? 'critical' : 'healthy'}
        />
      </div>

      {/* Drill-Down Level Selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-muted)]">View Level:</span>
        <Tabs tabs={DRILL_TABS} activeTab={drillLevel} onChange={(v) => setDrillLevel(v as DrillLevel)} variant="pill" />
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          {drillLevel === 'service' && `${drillNodes.length} services`}
          {drillLevel === 'host' && `${drillNodes.length} hosts`}
          {drillLevel === 'instance' && `${drillNodes.length} instances`}
        </span>
      </div>

      {/* Topology Map */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle helpId="map-topology">
              <GitFork size={16} className="inline mr-1.5 -mt-0.5" />
              {drillLevel === 'service' && 'Service Topology'}
              {drillLevel === 'host' && 'Host Topology'}
              {drillLevel === 'instance' && 'Instance Topology'}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)]">Protocols:</span>
              <div className="flex items-center gap-1.5">
                <ProtocolBadge protocol="http" />
                <ProtocolBadge protocol="grpc" />
                <ProtocolBadge protocol="sql" />
                <ProtocolBadge protocol="redis" />
                <ProtocolBadge protocol="kafka" />
              </div>
            </div>
          </div>
        </CardHeader>
        <ServiceMap nodes={drillNodes} edges={drillEdges} />
        <div className="mt-2 pt-2 border-t border-[var(--border-muted)] text-[10px] text-[var(--text-muted)] px-4 pb-2">
          {drillLevel === 'service' && 'Node = Service · Edge = API call dependency · Size = throughput'}
          {drillLevel === 'host' && 'Node = Host (Agent) · Edge = network connection · Color = health status'}
          {drillLevel === 'instance' && 'Node = Service instance (host:port) · Edge = same-service instances'}
        </div>
      </Card>

      {/* Topology Changes Panel */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Radio size={16} className="inline mr-1.5 -mt-0.5" />
            Topology Changes
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 space-y-2">
          {changesData.map((change: { id: string; type: string; protocol?: string; timestamp: string; description: string; sourceService: string; targetService?: string }) => {
            const config = CHANGE_TYPE_CONFIG[change.type] ?? CHANGE_TYPE_CONFIG.service_added;
            const Icon = config.icon;

            return (
              <div
                key={change.id}
                className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-muted)]"
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.bgColor}`}
                >
                  <Icon size={14} className={config.color} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="status" status={
                      change.type === 'connection_added' || change.type === 'service_added'
                        ? 'healthy'
                        : 'critical'
                    }>
                      {config.label}
                    </Badge>
                    {change.protocol && (
                      <ProtocolBadge protocol={change.protocol} />
                    )}
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums ml-auto">
                      {getRelativeTime(new Date(change.timestamp))}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                    {change.description}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[var(--text-muted)]">
                    <Globe size={10} />
                    <span>{change.sourceService}</span>
                    {change.targetService && (
                      <>
                        <Zap size={10} />
                        <span>{change.targetService}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {changesData.length === 0 && (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              <Database size={20} className="mx-auto mb-2 opacity-40" />
              No topology changes detected
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
