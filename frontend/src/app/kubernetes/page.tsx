'use client';

import { useState, useMemo, useCallback } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Tabs, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { useDataSource } from '@/hooks/use-data-source';
import {
  Box,
  Server,
  Layers,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  HardDrive,
  Container,
} from 'lucide-react';

// ── Types ──

interface K8sCluster {
  id: string;
  name: string;
  status: string;
  nodeCount: number;
  podCount: number;
}

interface K8sNamespace { name: string; clusterId: string; status: string; podCount: number; workloadCount: number }
interface K8sWorkload { id: string; name: string; namespace: string; kind: string; replicas: number; readyReplicas: number; status: string }
interface K8sPod { id: string; name: string; namespace: string; nodeName: string; workloadName: string; status: string; restartCount: number; cpuUsage: number; memUsageMB: number; mappedServiceId: string }
interface K8sNode { id: string; name: string; status: string; roles: string[]; kubeletVersion: string; cpuCapacity: number; memCapacityMB: number; cpuUsagePct: number; memUsagePct: number; podCount: number }
interface K8sEvent { id: string; namespace: string; kind: string; name: string; type: string; reason: string; message: string; count: number; lastSeen: string }

// ── Tabs ──

const K8S_TABS = [
  { id: 'overview', label: 'Overview', icon: <Activity size={13} /> },
  { id: 'namespaces', label: 'Namespaces', icon: <Layers size={13} /> },
  { id: 'workloads', label: 'Workloads', icon: <Box size={13} /> },
  { id: 'pods', label: 'Pods', icon: <Container size={13} /> },
  { id: 'nodes', label: 'Nodes', icon: <Server size={13} /> },
  { id: 'events', label: 'Events', icon: <AlertTriangle size={13} /> },
];

// ── Status helpers ──

const statusIcon = (s: string) => {
  switch (s) {
    case 'healthy': case 'Ready': case 'Running': case 'Active':
      return <CheckCircle2 size={12} className="text-[var(--status-healthy)]" />;
    case 'degraded': case 'NotReady': case 'Pending':
      return <Clock size={12} className="text-[var(--status-warning)]" />;
    case 'failed': case 'Failed': case 'Unknown':
      return <XCircle size={12} className="text-[var(--status-critical)]" />;
    default:
      return <Activity size={12} className="text-[var(--text-muted)]" />;
  }
};

// ── Demo data ──

function demoCluster(): K8sCluster[] {
  return [{ id: 'cluster-prod', name: 'prod', status: 'healthy', nodeCount: 5, podCount: 42 }];
}

function demoNamespaces(): K8sNamespace[] {
  return [
    { name: 'default', clusterId: 'cluster-prod', status: 'Active', podCount: 8, workloadCount: 4 },
    { name: 'aitop', clusterId: 'cluster-prod', status: 'Active', podCount: 12, workloadCount: 6 },
    { name: 'ai-services', clusterId: 'cluster-prod', status: 'Active', podCount: 15, workloadCount: 5 },
    { name: 'monitoring', clusterId: 'cluster-prod', status: 'Active', podCount: 7, workloadCount: 3 },
  ];
}

function demoWorkloads(): K8sWorkload[] {
  return [
    { id: 'wl-1', name: 'api-gateway', namespace: 'aitop', kind: 'Deployment', replicas: 3, readyReplicas: 3, status: 'healthy' },
    { id: 'wl-2', name: 'rag-service', namespace: 'ai-services', kind: 'Deployment', replicas: 2, readyReplicas: 2, status: 'healthy' },
    { id: 'wl-3', name: 'vllm-inference', namespace: 'ai-services', kind: 'StatefulSet', replicas: 2, readyReplicas: 1, status: 'degraded' },
    { id: 'wl-4', name: 'collection-server', namespace: 'aitop', kind: 'Deployment', replicas: 2, readyReplicas: 2, status: 'healthy' },
    { id: 'wl-5', name: 'aitop-agent', namespace: 'aitop', kind: 'DaemonSet', replicas: 5, readyReplicas: 5, status: 'healthy' },
    { id: 'wl-6', name: 'embedding-svc', namespace: 'ai-services', kind: 'Deployment', replicas: 3, readyReplicas: 3, status: 'healthy' },
  ];
}

function demoPods(): K8sPod[] {
  const pods: K8sPod[] = [];
  const workloads = ['api-gateway', 'rag-service', 'vllm-inference', 'collection-server', 'embedding-svc'];
  const nodes = ['node-01', 'node-02', 'node-03', 'node-04', 'node-05'];
  workloads.forEach((wl, wi) => {
    for (let i = 0; i < 2 + (wi % 2); i++) {
      pods.push({
        id: `pod-${wl}-${i}`, name: `${wl}-${String.fromCharCode(97 + i)}${Math.floor(Math.random() * 900 + 100)}`,
        namespace: wi < 2 ? 'aitop' : 'ai-services', nodeName: nodes[(wi + i) % nodes.length],
        workloadName: wl, status: wi === 2 && i === 1 ? 'Pending' : 'Running',
        restartCount: Math.floor(Math.random() * 3), cpuUsage: Math.round(Math.random() * 800),
        memUsageMB: Math.round(Math.random() * 2048), mappedServiceId: wl,
      });
    }
  });
  return pods;
}

function demoNodes(): K8sNode[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `node-0${i + 1}`, name: `node-0${i + 1}`, status: 'Ready',
    roles: i === 0 ? ['control-plane'] : ['worker'],
    kubeletVersion: 'v1.29.3', cpuCapacity: i < 3 ? 16 : 8,
    memCapacityMB: i < 3 ? 65536 : 32768,
    cpuUsagePct: Math.round(30 + Math.random() * 50), memUsagePct: Math.round(40 + Math.random() * 40),
    podCount: 7 + Math.floor(Math.random() * 5),
  }));
}

function demoEvents(): K8sEvent[] {
  const now = Date.now();
  return [
    { id: 'ev-1', namespace: 'ai-services', kind: 'Pod', name: 'vllm-inference-b412', type: 'Warning', reason: 'OOMKilled', message: 'Container vllm exceeded memory limit', count: 3, lastSeen: new Date(now - 300000).toISOString() },
    { id: 'ev-2', namespace: 'aitop', kind: 'Pod', name: 'api-gateway-a201', type: 'Normal', reason: 'Pulled', message: 'Successfully pulled image api-gateway:v0.9.1', count: 1, lastSeen: new Date(now - 600000).toISOString() },
    { id: 'ev-3', namespace: 'ai-services', kind: 'Deployment', name: 'rag-service', type: 'Normal', reason: 'ScalingReplicaSet', message: 'Scaled up replica set rag-service to 2', count: 1, lastSeen: new Date(now - 1800000).toISOString() },
    { id: 'ev-4', namespace: 'monitoring', kind: 'Pod', name: 'prometheus-0', type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', count: 5, lastSeen: new Date(now - 3600000).toISOString() },
  ];
}

// ── Page ──

export default function KubernetesPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const clusterFallback = useCallback(() => demoCluster(), []);
  const nsFallback = useCallback(() => demoNamespaces(), []);
  const wlFallback = useCallback(() => demoWorkloads(), []);
  const podFallback = useCallback(() => demoPods(), []);
  const nodeFallback = useCallback(() => demoNodes(), []);
  const eventFallback = useCallback(() => demoEvents(), []);

  const { data: clusters, source } = useDataSource('/api/v2/k8s/clusters', clusterFallback, {
    refreshInterval: 30_000,
    transform: (raw: unknown) => (raw as { clusters?: K8sCluster[] })?.clusters ?? [],
  });
  const { data: namespaces } = useDataSource('/api/v2/k8s/clusters/cluster-prod/namespaces', nsFallback, {
    refreshInterval: 30_000,
    transform: (raw: unknown) => (raw as { namespaces?: K8sNamespace[] })?.namespaces ?? [],
  });
  const { data: workloads } = useDataSource('/api/v2/k8s/clusters/cluster-prod/workloads', wlFallback, {
    refreshInterval: 30_000,
    transform: (raw: unknown) => (raw as { workloads?: K8sWorkload[] })?.workloads ?? [],
  });
  const { data: pods } = useDataSource('/api/v2/k8s/pods', podFallback, {
    refreshInterval: 15_000,
    transform: (raw: unknown) => (raw as { pods?: K8sPod[] })?.pods ?? [],
  });
  const { data: nodes } = useDataSource('/api/v2/k8s/nodes', nodeFallback, {
    refreshInterval: 30_000,
    transform: (raw: unknown) => (raw as { nodes?: K8sNode[] })?.nodes ?? [],
  });
  const { data: events } = useDataSource('/api/v2/k8s/clusters/cluster-prod/events', eventFallback, {
    refreshInterval: 15_000,
    transform: (raw: unknown) => (raw as { events?: K8sEvent[] })?.events ?? [],
  });

  const cluster = clusters?.[0];
  const podList = pods ?? [];
  const nodeList = nodes ?? [];
  const wlList = workloads ?? [];
  const nsList = namespaces ?? [];
  const eventList = events ?? [];

  const runningPods = podList.filter(p => p.status === 'Running').length;
  const readyNodes = nodeList.filter(n => n.status === 'Ready').length;
  const warningEvents = eventList.filter(e => e.type === 'Warning').length;
  const degradedWl = wlList.filter(w => w.status === 'degraded' || w.readyReplicas < w.replicas).length;

  return (
    <div className="space-y-3">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Kubernetes', icon: <Box size={14} /> }]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Kubernetes Dashboard</h1>
          <DataSourceBadge source={source} />
          {cluster && <Badge variant="tag">{cluster.name}</Badge>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard label="Nodes" value={`${readyNodes}/${nodeList.length}`} icon={<Server size={14} />} status={readyNodes === nodeList.length ? 'healthy' : 'warning'} />
        <KPICard label="Pods" value={`${runningPods}/${podList.length}`} icon={<Container size={14} />} status={runningPods === podList.length ? 'healthy' : 'warning'} />
        <KPICard label="Workloads" value={String(wlList.length)} icon={<Box size={14} />} status={degradedWl === 0 ? 'healthy' : 'warning'} />
        <KPICard label="Namespaces" value={String(nsList.length)} icon={<Layers size={14} />} status="healthy" />
        <KPICard label="Degraded" value={String(degradedWl)} icon={<AlertTriangle size={14} />} status={degradedWl > 0 ? 'critical' : 'healthy'} />
        <KPICard label="Warnings" value={String(warningEvents)} icon={<AlertTriangle size={14} />} status={warningEvents > 0 ? 'warning' : 'healthy'} />
      </div>

      {/* Tabs */}
      <Tabs tabs={K8S_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Node Resource Usage</CardTitle></CardHeader>
            <div className="space-y-2 px-4 pb-4">
              {nodeList.map(n => (
                <div key={n.id} className="flex items-center gap-3 text-xs">
                  <span className="w-20 font-mono text-[var(--text-secondary)] truncate">{n.name}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Cpu size={10} className="text-[var(--text-muted)]" />
                      <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${n.cpuUsagePct}%`, backgroundColor: n.cpuUsagePct > 80 ? 'var(--status-critical)' : 'var(--accent-primary)' }} />
                      </div>
                      <span className="w-10 text-right tabular-nums">{n.cpuUsagePct}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive size={10} className="text-[var(--text-muted)]" />
                      <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${n.memUsagePct}%`, backgroundColor: n.memUsagePct > 80 ? 'var(--status-critical)' : 'var(--status-healthy)' }} />
                      </div>
                      <span className="w-10 text-right tabular-nums">{n.memUsagePct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent Events</CardTitle></CardHeader>
            <div className="space-y-1.5 px-4 pb-4 max-h-[200px] overflow-y-auto">
              {eventList.slice(0, 8).map(e => (
                <div key={e.id} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${e.type === 'Warning' ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-healthy)]'}`} />
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">{e.reason}</span>
                    <span className="text-[var(--text-muted)]"> — {e.name}</span>
                    <p className="text-[var(--text-muted)] mt-0.5">{e.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Namespaces ── */}
      {activeTab === 'namespaces' && (
        <Card padding="none">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
              <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Pods</th><th className="px-4 py-2 font-medium text-right">Workloads</th>
            </tr></thead>
            <tbody>{nsList.map(ns => (
              <tr key={ns.name} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                <td className="px-4 py-2 font-mono font-medium text-[var(--text-primary)]">{ns.name}</td>
                <td className="px-4 py-2">{statusIcon(ns.status)} <span className="ml-1">{ns.status}</span></td>
                <td className="px-4 py-2 text-right tabular-nums">{ns.podCount}</td>
                <td className="px-4 py-2 text-right tabular-nums">{ns.workloadCount}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      {/* ── Workloads ── */}
      {activeTab === 'workloads' && (
        <Card padding="none">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
              <th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Namespace</th>
              <th className="px-4 py-2 font-medium">Kind</th><th className="px-4 py-2 font-medium text-right">Ready</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr></thead>
            <tbody>{wlList.map(w => (
              <tr key={w.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                <td className="px-4 py-2 font-mono font-medium text-[var(--text-primary)]">{w.name}</td>
                <td className="px-4 py-2 text-[var(--text-muted)]">{w.namespace}</td>
                <td className="px-4 py-2"><Badge variant="tag">{w.kind}</Badge></td>
                <td className="px-4 py-2 text-right tabular-nums">{w.readyReplicas}/{w.replicas}</td>
                <td className="px-4 py-2">{statusIcon(w.status)} <span className="ml-1">{w.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      {/* ── Pods ── */}
      {activeTab === 'pods' && (
        <Card padding="none">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10"><tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2 font-medium">Pod</th><th className="px-4 py-2 font-medium">Namespace</th>
                <th className="px-4 py-2 font-medium">Node</th><th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Restarts</th>
                <th className="px-4 py-2 font-medium text-right">CPU (m)</th><th className="px-4 py-2 font-medium text-right">Mem (MB)</th>
                <th className="px-4 py-2 font-medium">Service</th>
              </tr></thead>
              <tbody>{podList.map(p => (
                <tr key={p.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                  <td className="px-4 py-2 font-mono text-[var(--text-primary)]">{p.name}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{p.namespace}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{p.nodeName}</td>
                  <td className="px-4 py-2">{statusIcon(p.status)} <span className="ml-1">{p.status}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.restartCount > 0 ? <span className="text-[var(--status-warning)]">{p.restartCount}</span> : '0'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.cpuUsage}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.memUsageMB}</td>
                  <td className="px-4 py-2 text-[var(--accent-primary)]">{p.mappedServiceId || '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Nodes ── */}
      {activeTab === 'nodes' && (
        <Card padding="none">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
              <th className="px-4 py-2 font-medium">Node</th><th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Roles</th><th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium text-right">CPU</th><th className="px-4 py-2 font-medium text-right">Memory</th>
              <th className="px-4 py-2 font-medium text-right">Pods</th>
            </tr></thead>
            <tbody>{nodeList.map(n => (
              <tr key={n.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                <td className="px-4 py-2 font-mono font-medium text-[var(--text-primary)]">{n.name}</td>
                <td className="px-4 py-2">{statusIcon(n.status)} <span className="ml-1">{n.status}</span></td>
                <td className="px-4 py-2">{n.roles?.map(r => <Badge key={r} variant="tag">{r}</Badge>)}</td>
                <td className="px-4 py-2 text-[var(--text-muted)]">{n.kubeletVersion}</td>
                <td className="px-4 py-2 text-right tabular-nums">{n.cpuUsagePct}% <span className="text-[var(--text-muted)]">/ {n.cpuCapacity}c</span></td>
                <td className="px-4 py-2 text-right tabular-nums">{n.memUsagePct}% <span className="text-[var(--text-muted)]">/ {Math.round(n.memCapacityMB / 1024)}G</span></td>
                <td className="px-4 py-2 text-right tabular-nums">{n.podCount}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      {/* ── Events ── */}
      {activeTab === 'events' && (
        <Card padding="none">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10"><tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2 font-medium w-6"></th><th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Object</th><th className="px-4 py-2 font-medium">Namespace</th>
                <th className="px-4 py-2 font-medium">Message</th>
                <th className="px-4 py-2 font-medium text-right">Count</th><th className="px-4 py-2 font-medium">Last Seen</th>
              </tr></thead>
              <tbody>{eventList.map(e => (
                <tr key={e.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                  <td className="px-4 py-2"><span className={`w-2 h-2 rounded-full inline-block ${e.type === 'Warning' ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-healthy)]'}`} /></td>
                  <td className="px-4 py-2 font-medium text-[var(--text-primary)]">{e.reason}</td>
                  <td className="px-4 py-2 font-mono text-[var(--text-secondary)]">{e.kind}/{e.name}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{e.namespace}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)] max-w-[300px] truncate">{e.message}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{e.count}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{e.lastSeen ? new Date(e.lastSeen).toLocaleTimeString() : '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
