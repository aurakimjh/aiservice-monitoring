'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard, GPUCard, StatusIndicator } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { useProjectStore } from '@/stores/project-store';
import { getProjectHosts, generateTimeSeries } from '@/lib/demo-data';
import { Bot, Cpu, Thermometer, Zap, AlertTriangle, Filter } from 'lucide-react';
import type { GPUVendor } from '@/types/monitoring';

const VENDOR_COLORS: Record<string, string> = {
  nvidia:  '#76B900',
  amd:     '#ED1C24',
  intel:   '#0071C5',
  apple:   '#A2AAAD',
  virtual: '#8B5CF6',
};

const VENDOR_LABELS: Record<string, string> = {
  nvidia:  'NVIDIA',
  amd:     'AMD',
  intel:   'Intel',
  apple:   'Apple',
  virtual: 'vGPU / Cloud',
  all:     'All Vendors',
};

const CHART_COLORS = ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA', '#79C0FF', '#56D364'];

// Transform GPU API response
function transformGPU(raw: unknown) {
  const resp = raw as { items?: Array<Record<string, unknown>> };
  if (!resp.items?.length) return [];
  return resp.items;
}

export default function GPUClusterPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const demoHosts = useCallback(() => getProjectHosts(currentProjectId ?? 'proj-ai-prod'), [currentProjectId]);
  const { data: hostsData, source } = useDataSource('/ai/gpu', demoHosts, {
    refreshInterval: 30_000,
    transform: (raw) => {
      // API may return GPU-specific format; fallback to host format
      const resp = raw as { items?: unknown[] };
      return resp?.items ?? raw;
    },
  });
  const hosts = (Array.isArray(hostsData) ? hostsData : []) as ReturnType<typeof getProjectHosts>;
  const [vendorFilter, setVendorFilter] = useState<GPUVendor | 'all'>('all');

  const gpuHosts = useMemo(() => hosts.filter((h) => h.gpus && h.gpus.length > 0), [hosts]);
  const allGPUs = useMemo(() => gpuHosts.flatMap((h) => h.gpus ?? []), [gpuHosts]);

  // Vendor breakdown
  const vendorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of allGPUs) {
      const v = g.vendor ?? 'nvidia';
      counts[v] = (counts[v] ?? 0) + 1;
    }
    return counts;
  }, [allGPUs]);

  const detectedVendors = useMemo(() => Object.keys(vendorCounts), [vendorCounts]);

  // Filtered GPU hosts
  const filteredHosts = useMemo(() => {
    if (vendorFilter === 'all') return gpuHosts;
    return gpuHosts
      .map((h) => ({
        ...h,
        gpus: (h.gpus ?? []).filter((g) => (g.vendor ?? 'nvidia') === vendorFilter),
      }))
      .filter((h) => h.gpus.length > 0);
  }, [gpuHosts, vendorFilter]);

  const filteredGPUs = useMemo(() => filteredHosts.flatMap((h) => h.gpus ?? []), [filteredHosts]);

  const stats = useMemo(() => {
    const count = filteredGPUs.length;
    const avgVRAM = count > 0 ? Math.round(filteredGPUs.reduce((s, g) => s + g.vramPercent, 0) / count) : 0;
    const avgTemp = count > 0 ? Math.round(filteredGPUs.reduce((s, g) => s + g.temperature, 0) / count) : 0;
    const totalPower = filteredGPUs.reduce((s, g) => s + g.powerDraw, 0);
    const critical = filteredGPUs.filter((g) => g.vramPercent >= 90).length;
    const virtual = filteredGPUs.filter((g) => g.isVirtual).length;
    const mig = filteredGPUs.filter((g) => g.migEnabled).length;
    return { count, avgVRAM, avgTemp, totalPower, critical, virtual, mig };
  }, [filteredGPUs]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'GPU Cluster', icon: <Cpu size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">GPU Cluster</h1>
          <DataSourceBadge source={source} />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <Filter size={12} />
          <span>Vendor</span>
        </div>
      </div>

      {/* Vendor filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', ...detectedVendors] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVendorFilter(v as GPUVendor | 'all')}
            className={cn(
              'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
              vendorFilter === v
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)]',
            )}
            style={vendorFilter === v && v !== 'all' ? {
              borderColor: VENDOR_COLORS[v] ?? undefined,
              backgroundColor: (VENDOR_COLORS[v] ?? '#fff') + '22',
              color: VENDOR_COLORS[v] ?? undefined,
            } : undefined}
          >
            {VENDOR_LABELS[v] ?? v}
            {v !== 'all' && (
              <span className="ml-1 opacity-70">({vendorCounts[v] ?? 0})</span>
            )}
            {v === 'all' && (
              <span className="ml-1 opacity-70">({allGPUs.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Vendor distribution bar */}
      {detectedVendors.length > 1 && vendorFilter === 'all' && allGPUs.length > 0 && (
        <Card>
          <div className="space-y-1.5">
            <div className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">
              Vendor Distribution
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {detectedVendors.map((v) => (
                <div
                  key={v}
                  title={`${VENDOR_LABELS[v] ?? v}: ${vendorCounts[v]}`}
                  style={{
                    width: `${(vendorCounts[v] / allGPUs.length) * 100}%`,
                    backgroundColor: VENDOR_COLORS[v] ?? '#6B7280',
                  }}
                />
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              {detectedVendors.map((v) => (
                <div key={v} className="flex items-center gap-1 text-[10px]">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: VENDOR_COLORS[v] ?? '#6B7280' }}
                  />
                  <span className="text-[var(--text-secondary)]">{VENDOR_LABELS[v] ?? v}</span>
                  <span className="text-[var(--text-muted)]">{vendorCounts[v]}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard helpId="gpu-count" title="GPUs" value={stats.count} subtitle={`${filteredHosts.length} hosts`} status="healthy" />
        <KPICard helpId="gpu-avg-vram" title="Avg VRAM" value={stats.avgVRAM} unit="%" status={stats.avgVRAM > 90 ? 'critical' : stats.avgVRAM > 75 ? 'warning' : 'healthy'} sparkData={[68, 70, 72, 75, 73, 76, 74, 75, 77, stats.avgVRAM]} />
        <KPICard helpId="gpu-avg-temp" title="Avg Temp" value={stats.avgTemp} unit="°C" status={stats.avgTemp > 80 ? 'critical' : stats.avgTemp > 70 ? 'warning' : 'healthy'} sparkData={[58, 60, 62, 61, 63, 62, 64, 63, 62, stats.avgTemp]} />
        <KPICard helpId="gpu-total-power" title="Total Power" value={Math.round(stats.totalPower)} unit="W" status="healthy" />
        <KPICard helpId="gpu-critical" title="Critical" value={stats.critical} subtitle="VRAM ≥ 90%" status={stats.critical > 0 ? 'critical' : 'healthy'} />
        <KPICard helpId="gpu-vgpu" title="vGPU" value={stats.virtual} subtitle="virtual instances" status="healthy" />
        <KPICard helpId="gpu-mig" title="MIG" value={stats.mig} subtitle="partitions" status="healthy" />
      </div>

      {/* OOM Warning */}
      {stats.critical > 0 && (
        <Card className="border-l-2 border-l-[var(--status-critical)]">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="text-[var(--status-critical)]" />
            <span className="font-medium text-[var(--status-critical)]">OOM Risk</span>
            <span className="text-[var(--text-secondary)]">
              {stats.critical} GPU{stats.critical > 1 && 's'} at ≥90% VRAM — potential OOM at current allocation rate
            </span>
          </div>
        </Card>
      )}

      {/* GPU Grid by Host */}
      {filteredHosts.map((host) => (
        <Card key={host.id}>
          <CardHeader>
            <CardTitle>
              <Link href={`/infra/${host.hostname}`} className="text-[var(--accent-primary)] hover:underline">
                {host.hostname}
              </Link>
            </CardTitle>
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <span>{host.os}</span>
              <span>CPU: {host.cpuPercent}%</span>
              <span>MEM: {host.memPercent}%</span>
              <StatusIndicator status={host.status} size="sm" />
            </div>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(host.gpus ?? []).map((gpu) => (
              <GPUCard key={gpu.index} gpu={gpu} />
            ))}
          </div>
        </Card>
      ))}

      {/* Trend Charts */}
      {filteredGPUs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardHeader><CardTitle>VRAM Usage Trend</CardTitle></CardHeader>
            <TimeSeriesChart
              series={filteredHosts.flatMap((h, hi) =>
                (h.gpus ?? []).map((g, gi) => ({
                  name: `${h.hostname} GPU#${g.index}`,
                  data: generateTimeSeries(g.vramPercent, 8, 60),
                  color: CHART_COLORS[(hi * 2 + gi) % CHART_COLORS.length],
                })),
              )}
              yAxisLabel="%"
              thresholdLine={{ value: 90, label: '90%', color: '#F85149' }}
              height={240}
            />
          </Card>
          <Card>
            <CardHeader><CardTitle>Temperature Trend</CardTitle></CardHeader>
            <TimeSeriesChart
              series={filteredHosts.flatMap((h, hi) =>
                (h.gpus ?? []).map((g, gi) => ({
                  name: `${h.hostname} GPU#${g.index}`,
                  data: generateTimeSeries(g.temperature, 5, 60),
                  color: CHART_COLORS[(hi * 2 + gi) % CHART_COLORS.length],
                })),
              )}
              yAxisLabel="°C"
              thresholdLine={{ value: 85, label: '85°C', color: '#F85149' }}
              height={240}
            />
          </Card>
          <Card>
            <CardHeader><CardTitle>Power Draw Trend</CardTitle></CardHeader>
            <TimeSeriesChart
              series={filteredHosts.flatMap((h, hi) =>
                (h.gpus ?? []).map((g, gi) => ({
                  name: `${h.hostname} GPU#${g.index}`,
                  data: generateTimeSeries(g.powerDraw, 30, 60),
                  color: CHART_COLORS[(hi * 2 + gi) % CHART_COLORS.length],
                })),
              )}
              yAxisLabel="W"
              height={240}
            />
          </Card>
          <Card>
            <CardHeader><CardTitle>SM / Core Occupancy Trend</CardTitle></CardHeader>
            <TimeSeriesChart
              series={filteredHosts.flatMap((h, hi) =>
                (h.gpus ?? []).map((g, gi) => ({
                  name: `${h.hostname} GPU#${g.index}`,
                  data: generateTimeSeries(g.smOccupancy, 8, 60),
                  color: CHART_COLORS[(hi * 2 + gi) % CHART_COLORS.length],
                })),
              )}
              yAxisLabel="%"
              height={240}
            />
          </Card>
        </div>
      )}

      {filteredHosts.length === 0 && (
        <Card>
          <div className="text-center py-16 text-sm text-[var(--text-muted)]">
            {gpuHosts.length === 0
              ? 'No GPU hosts found in this project.'
              : `No ${VENDOR_LABELS[vendorFilter] ?? vendorFilter} GPUs found.`}
          </div>
        </Card>
      )}
    </div>
  );
}
