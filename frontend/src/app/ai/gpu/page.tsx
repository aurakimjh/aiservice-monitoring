'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard, GPUCard, StatusIndicator } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { useProjectStore } from '@/stores/project-store';
import { getProjectHosts, generateTimeSeries } from '@/lib/demo-data';
import { Bot, Cpu, Thermometer, Zap, AlertTriangle } from 'lucide-react';

export default function GPUClusterPage() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const hosts = getProjectHosts(currentProjectId ?? 'proj-ai-prod');

  const gpuHosts = useMemo(() => hosts.filter((h) => h.gpus && h.gpus.length > 0), [hosts]);
  const allGPUs = useMemo(() => gpuHosts.flatMap((h) => h.gpus ?? []), [gpuHosts]);

  const stats = useMemo(() => {
    const count = allGPUs.length;
    const avgVRAM = count > 0 ? Math.round(allGPUs.reduce((s, g) => s + g.vramPercent, 0) / count) : 0;
    const avgTemp = count > 0 ? Math.round(allGPUs.reduce((s, g) => s + g.temperature, 0) / count) : 0;
    const totalPower = allGPUs.reduce((s, g) => s + g.powerDraw, 0);
    const critical = allGPUs.filter((g) => g.vramPercent >= 90).length;
    return { count, avgVRAM, avgTemp, totalPower, critical };
  }, [allGPUs]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'GPU Cluster', icon: <Cpu size={14} /> },
      ]} />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">GPU Cluster</h1>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard title="Total GPUs" value={stats.count} subtitle={`${gpuHosts.length} hosts`} status="healthy" />
        <KPICard title="Avg VRAM" value={stats.avgVRAM} unit="%" status={stats.avgVRAM > 90 ? 'critical' : stats.avgVRAM > 75 ? 'warning' : 'healthy'} sparkData={[68, 70, 72, 75, 73, 76, 74, 75, 77, stats.avgVRAM]} />
        <KPICard title="Avg Temperature" value={stats.avgTemp} unit="°C" status={stats.avgTemp > 80 ? 'critical' : stats.avgTemp > 70 ? 'warning' : 'healthy'} sparkData={[58, 60, 62, 61, 63, 62, 64, 63, 62, stats.avgTemp]} />
        <KPICard title="Total Power" value={stats.totalPower} unit="W" status="healthy" />
        <KPICard title="Critical GPUs" value={stats.critical} subtitle="VRAM >= 90%" status={stats.critical > 0 ? 'critical' : 'healthy'} />
      </div>

      {/* OOM Warning */}
      {stats.critical > 0 && (
        <Card className="border-l-2 border-l-[var(--status-critical)]">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="text-[var(--status-critical)]" />
            <span className="font-medium text-[var(--status-critical)]">OOM Risk</span>
            <span className="text-[var(--text-secondary)]">
              {stats.critical} GPU{stats.critical > 1 && 's'} at &ge;90% VRAM — potential OOM within minutes at current allocation rate
            </span>
          </div>
        </Card>
      )}

      {/* GPU Grid by Host */}
      {gpuHosts.map((host) => (
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle>VRAM Usage Trend</CardTitle></CardHeader>
          <TimeSeriesChart
            series={gpuHosts.flatMap((h) =>
              (h.gpus ?? []).map((g, i) => ({
                name: `${h.hostname} GPU#${g.index}`,
                data: generateTimeSeries(g.vramPercent, 8, 60),
                color: ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'][
                  gpuHosts.indexOf(h) * 2 + i
                ] ?? '#8B949E',
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
            series={gpuHosts.flatMap((h) =>
              (h.gpus ?? []).map((g, i) => ({
                name: `${h.hostname} GPU#${g.index}`,
                data: generateTimeSeries(g.temperature, 5, 60),
                color: ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'][
                  gpuHosts.indexOf(h) * 2 + i
                ] ?? '#8B949E',
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
            series={gpuHosts.flatMap((h) =>
              (h.gpus ?? []).map((g, i) => ({
                name: `${h.hostname} GPU#${g.index}`,
                data: generateTimeSeries(g.powerDraw, 30, 60),
                color: ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'][
                  gpuHosts.indexOf(h) * 2 + i
                ] ?? '#8B949E',
              })),
            )}
            yAxisLabel="W"
            height={240}
          />
        </Card>
        <Card>
          <CardHeader><CardTitle>SM Occupancy Trend</CardTitle></CardHeader>
          <TimeSeriesChart
            series={gpuHosts.flatMap((h) =>
              (h.gpus ?? []).map((g, i) => ({
                name: `${h.hostname} GPU#${g.index}`,
                data: generateTimeSeries(g.smOccupancy, 8, 60),
                color: ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'][
                  gpuHosts.indexOf(h) * 2 + i
                ] ?? '#8B949E',
              })),
            )}
            yAxisLabel="%"
            height={240}
          />
        </Card>
      </div>

      {gpuHosts.length === 0 && (
        <Card>
          <div className="text-center py-16 text-sm text-[var(--text-muted)]">No GPU hosts found in this project.</div>
        </Card>
      )}
    </div>
  );
}
