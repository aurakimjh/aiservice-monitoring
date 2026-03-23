'use client';

import { useMemo } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { ServiceMap } from '@/components/monitoring/service-map';
import { ProtocolBadge } from '@/components/topology';
import { getDiscoveredTopology, getTopologyChanges } from '@/lib/demo-data';
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

export default function TopologyPage() {
  const topology = useMemo(() => getDiscoveredTopology(), []);
  const changes = useMemo(() => getTopologyChanges(), []);

  // Map discovered topology nodes/edges to ServiceMap-compatible types
  const nodes: TopologyNode[] = useMemo(
    () =>
      topology.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        layer: n.layer as TopologyNode['layer'],
        status: n.status,
        rpm: n.rpm,
        errorRate: n.errorRate,
        p95: n.p95,
        framework: n.framework,
      })),
    [topology.nodes],
  );

  const edges: TopologyEdge[] = useMemo(
    () =>
      topology.edges.map((e) => ({
        source: e.source,
        target: e.target,
        rpm: e.rpm,
        errorRate: e.errorRate,
        p95: e.p95,
      })),
    [topology.edges],
  );

  // KPI computations
  const totalServices = topology.nodes.length;
  const activeConnections = topology.edges.filter((e) => !e.isRemoved).length;
  const newIn24h = topology.edges.filter((e) => e.isNew).length;
  const removedIn24h = topology.edges.filter((e) => e.isRemoved).length;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Topology', icon: <Network size={14} /> },
        ]}
      />

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          Topology Auto-Discovery
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Automatic service dependency mapping via eBPF and traffic analysis
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Total Services"
          value={totalServices}
          subtitle="discovered services"
          status="healthy"
        />
        <KPICard
          title="Active Connections"
          value={activeConnections}
          subtitle="live connections"
          status="healthy"
        />
        <KPICard
          title="New (24h)"
          value={newIn24h}
          subtitle="recently discovered"
          status={newIn24h > 0 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Removed (24h)"
          value={removedIn24h}
          subtitle="no longer active"
          status={removedIn24h > 0 ? 'critical' : 'healthy'}
        />
      </div>

      {/* Service Map */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <GitFork size={16} className="inline mr-1.5 -mt-0.5" />
              Service Topology Map
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
        <ServiceMap nodes={nodes} edges={edges} />
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
          {changes.map((change) => {
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

          {changes.length === 0 && (
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
