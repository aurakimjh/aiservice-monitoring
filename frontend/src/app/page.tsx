'use client';

import { useCallback } from 'react';
import { KPICard } from '@/components/monitoring';
import { ServiceHealthGrid } from '@/components/monitoring';
import { AlertBanner } from '@/components/monitoring';
import { Card, CardHeader, CardTitle, DataSourceBadge } from '@/components/ui';
import { TimeSeriesChart } from '@/components/charts';
import { useDataSource } from '@/hooks/use-data-source';
import { useProjectStore } from '@/stores/project-store';
import type { Status } from '@/types/monitoring';

// ── Demo fallback data ──

const DEMO_SPARKDATA = [45, 52, 48, 61, 55, 67, 62, 58, 71, 65, 60, 55];
const DEMO_HEALTH_CELLS: { id: string; label: string; status: Status; detail?: string }[] = [
  { id: '1', label: 'api-gw-01', status: 'healthy' },
  { id: '2', label: 'api-gw-02', status: 'healthy' },
  { id: '3', label: 'rag-svc-01', status: 'healthy' },
  { id: '4', label: 'rag-svc-02', status: 'warning', detail: 'High latency' },
  { id: '5', label: 'gpu-01', status: 'healthy' },
  { id: '6', label: 'gpu-02', status: 'critical', detail: 'VRAM 94%' },
  { id: '7', label: 'gpu-03', status: 'healthy' },
  { id: '8', label: 'db-master', status: 'healthy' },
  { id: '9', label: 'db-replica', status: 'healthy' },
  { id: '10', label: 'redis-01', status: 'healthy' },
  { id: '11', label: 'vector-db', status: 'healthy' },
  { id: '12', label: 'embed-svc', status: 'healthy' },
];

function generateTimeSeries(base: number, variance: number, points: number): [number, number][] {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => [
    now - (points - i) * 60_000,
    base + (Math.random() - 0.5) * variance * 2,
  ] as [number, number]);
}

interface OverviewData {
  agents: { total: number; online: number; offline: number };
  system: { avg_cpu_percent: string; total_memory_mb: string };
  backends: { prometheus: string; jaeger: string };
}

function demoOverview(): OverviewData {
  return {
    agents: { total: 12, online: 10, offline: 2 },
    system: { avg_cpu_percent: '42.3', total_memory_mb: '85120' },
    backends: { prometheus: 'demo', jaeger: 'demo' },
  };
}

export default function HomePage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const demoFallback = useCallback(() => demoOverview(), []);

  const overviewPath = currentProjectId
    ? `/realdata/overview?project_id=${currentProjectId}`
    : '/realdata/overview';

  const { data: overview, source, loading } = useDataSource<OverviewData>(
    overviewPath,
    demoFallback,
    { refreshInterval: 30_000 },
  );

  const totalAgents = overview?.agents.total ?? 12;
  const onlineAgents = overview?.agents.online ?? 10;
  const avgCpu = overview?.system.avg_cpu_percent ?? '42.3';
  const promStatus = overview?.backends.prometheus ?? 'demo';
  const jaegerStatus = overview?.backends.jaeger ?? 'demo';

  // Charts still use generated time series (Prometheus range queries will be added in Phase 43)
  const latencyData = generateTimeSeries(245, 50, 60);
  const rpmData = generateTimeSeries(1200, 200, 60);

  // Derive health cells: live → from agents, demo → hardcoded
  const healthCells = source === 'live'
    ? Array.from({ length: totalAgents }, (_, i) => ({
        id: String(i + 1),
        label: `agent-${i + 1}`,
        status: (i < onlineAgents ? 'healthy' : 'critical') as Status,
      }))
    : DEMO_HEALTH_CELLS;

  return (
    <div className="space-y-4">
      {/* Alert Banner */}
      <AlertBanner
        severity="critical"
        title="GPU_VRAM_Critical"
        message="prod-gpu-02 VRAM usage at 94% — OOM risk in ~5 minutes"
        timestamp="3 min ago"
        onDismiss={() => {}}
        onViewDetails={() => {}}
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          title="Services"
          helpId="services"
          value={totalAgents}
          subtitle={`${onlineAgents} online`}
          status={onlineAgents === totalAgents ? 'healthy' : 'warning'}
          sparkData={DEMO_SPARKDATA}
          badge={<DataSourceBadge source={source} />}
        />
        <KPICard
          title="Error Rate"
          helpId="error-rate"
          value="0.12"
          unit="%"
          trend={{ direction: 'down', value: '0.03%', positive: true }}
          status="healthy"
        />
        <KPICard
          title="P95 Latency"
          helpId="p95-latency"
          value="245"
          unit="ms"
          trend={{ direction: 'down', value: '15ms', positive: true }}
          status="healthy"
          sparkData={[280, 265, 270, 255, 248, 260, 252, 245]}
        />
        <KPICard
          title="Avg CPU"
          helpId="cpu-usage"
          value={avgCpu}
          unit="%"
          status={parseFloat(avgCpu) > 80 ? 'warning' : 'healthy'}
          badge={<DataSourceBadge source={source} />}
        />
        <KPICard
          title="Backends"
          helpId="backends"
          value={promStatus === 'connected' && jaegerStatus === 'connected' ? 'OK' : 'Partial'}
          subtitle={`Prom: ${promStatus} · Jaeger: ${jaegerStatus}`}
          status={promStatus === 'connected' ? 'healthy' : 'warning'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle>Response Time (P50 / P95)</CardTitle>
          </CardHeader>
          <TimeSeriesChart
            series={[
              { name: 'P50', data: generateTimeSeries(180, 30, 60), type: 'area' },
              { name: 'P95', data: latencyData, color: '#D29922' },
            ]}
            yAxisLabel="ms"
            thresholdLine={{ value: 300, label: 'SLO: 300ms', color: '#F85149' }}
            height={220}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Throughput (RPM)</CardTitle>
          </CardHeader>
          <TimeSeriesChart
            series={[
              { name: 'RPM', data: rpmData, type: 'area', color: '#3FB950' },
            ]}
            yAxisLabel="req/min"
            height={220}
          />
        </Card>
      </div>

      {/* Health Grid + AI Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Service Health Map</CardTitle>
              <DataSourceBadge source={source} />
            </div>
          </CardHeader>
          <ServiceHealthGrid
            title="All hosts"
            cells={healthCells}
            columns={6}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Services Summary</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)]">TTFT P95</span>
              <span className="font-medium tabular-nums">
                1.2s <span className="text-[var(--status-healthy)] text-xs">SLO OK</span>
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)]">TPS P50</span>
              <span className="font-medium tabular-nums">
                42/s <span className="text-[var(--status-healthy)] text-xs">Normal</span>
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)]">GPU VRAM Avg</span>
              <span className="font-medium tabular-nums">
                78% <span className="text-[var(--status-warning)] text-xs">Caution</span>
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)]">Token Cost</span>
              <span className="font-medium tabular-nums">
                $12.5/h <span className="text-[var(--text-muted)] text-xs">+15%</span>
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[var(--text-secondary)]">Guardrail Block Rate</span>
              <span className="font-medium tabular-nums">2.1%</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
