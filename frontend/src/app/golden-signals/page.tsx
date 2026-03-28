'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, SearchInput, Select, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import type { GoldenSignalService, GoldenSignalTimeSeries } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';
import {
  Activity,
  Gauge,
  AlertTriangle,
  Zap,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';

const EChartsWrapper = dynamic(
  () => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })),
  { ssr: false },
);

/* ─── helpers ─── */

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function fmtHour(h: number): string {
  const d = new Date();
  d.setHours(d.getHours() - (23 - h), 0, 0, 0);
  return d.toISOString();
}

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ─── status config ─── */

const STATUS_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  healthy:  { dot: '#3FB950', bg: 'rgba(63,185,80,0.12)',  text: '#3FB950', label: 'Healthy' },
  warning:  { dot: '#D29922', bg: 'rgba(210,153,34,0.12)', text: '#D29922', label: 'Warning' },
  critical: { dot: '#F85149', bg: 'rgba(248,81,73,0.12)',  text: '#F85149', label: 'Critical' },
};

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
];

/* ─── demo data ─── */

interface LatencyTimeSeries extends GoldenSignalTimeSeries {
  latency_p50: number;
  latency_p99: number;
  saturation_cpu: number;
  saturation_mem: number;
}

interface ServiceDemoData {
  service: GoldenSignalService;
  timeSeries: LatencyTimeSeries[];
}

function generateDemoData(): ServiceDemoData[] {
  const services: {
    name: string;
    baseLatP50: number; baseLatP95: number; baseLatP99: number;
    baseTraffic: number; baseError: number; baseCpu: number; baseMem: number;
    sloTarget: number; sloCurrent: number; errorBudget: number; burnRate: number;
    status: 'healthy' | 'warning' | 'critical';
  }[] = [
    {
      name: 'api-gateway', baseLatP50: 12, baseLatP95: 45, baseLatP99: 120,
      baseTraffic: 24500, baseError: 0.12, baseCpu: 42, baseMem: 58,
      sloTarget: 99.95, sloCurrent: 99.97, errorBudget: 72.5, burnRate: 0.38,
      status: 'healthy',
    },
    {
      name: 'auth-service', baseLatP50: 8, baseLatP95: 28, baseLatP99: 85,
      baseTraffic: 18200, baseError: 0.05, baseCpu: 35, baseMem: 44,
      sloTarget: 99.99, sloCurrent: 99.992, errorBudget: 85.0, burnRate: 0.21,
      status: 'healthy',
    },
    {
      name: 'payment-service', baseLatP50: 35, baseLatP95: 120, baseLatP99: 380,
      baseTraffic: 8700, baseError: 1.85, baseCpu: 67, baseMem: 72,
      sloTarget: 99.9, sloCurrent: 99.42, errorBudget: 12.3, burnRate: 1.42,
      status: 'critical',
    },
    {
      name: 'recommendation-engine', baseLatP50: 55, baseLatP95: 180, baseLatP99: 450,
      baseTraffic: 12300, baseError: 0.72, baseCpu: 78, baseMem: 82,
      sloTarget: 99.5, sloCurrent: 99.38, errorBudget: 35.6, burnRate: 0.78,
      status: 'warning',
    },
    {
      name: 'search-service', baseLatP50: 18, baseLatP95: 65, baseLatP99: 195,
      baseTraffic: 31200, baseError: 0.08, baseCpu: 55, baseMem: 61,
      sloTarget: 99.9, sloCurrent: 99.94, errorBudget: 68.2, burnRate: 0.42,
      status: 'healthy',
    },
    {
      name: 'notification-service', baseLatP50: 22, baseLatP95: 78, baseLatP99: 240,
      baseTraffic: 5400, baseError: 0.95, baseCpu: 48, baseMem: 53,
      sloTarget: 99.5, sloCurrent: 99.15, errorBudget: 18.4, burnRate: 0.92,
      status: 'warning',
    },
  ];

  return services.map((svc, si) => {
    const rng = seededRandom(si * 1000 + 42);
    const ts: LatencyTimeSeries[] = [];

    for (let h = 0; h < 24; h++) {
      const peakFactor = h >= 9 && h <= 17 ? 1.0 + 0.3 * Math.sin(((h - 9) / 8) * Math.PI) : 0.7 + 0.3 * rng();
      const jitter = () => 0.85 + 0.3 * rng();

      ts.push({
        timestamp: fmtHour(h),
        latency_p50: Math.round(svc.baseLatP50 * peakFactor * jitter()),
        latency_p95: Math.round(svc.baseLatP95 * peakFactor * jitter()),
        latency_p99: Math.round(svc.baseLatP99 * peakFactor * jitter()),
        traffic_rpm: Math.round(svc.baseTraffic * peakFactor * jitter()),
        error_rate: parseFloat((svc.baseError * peakFactor * jitter()).toFixed(3)),
        saturation: Math.round((svc.baseCpu + svc.baseMem) / 2 * peakFactor * jitter()),
        saturation_cpu: Math.round(svc.baseCpu * peakFactor * jitter()),
        saturation_mem: Math.round(svc.baseMem * peakFactor * jitter()),
      });
    }

    const service: GoldenSignalService = {
      service_name: svc.name,
      latency_p50_ms: ts[ts.length - 1].latency_p50,
      latency_p95_ms: ts[ts.length - 1].latency_p95,
      latency_p99_ms: ts[ts.length - 1].latency_p99,
      traffic_rpm: ts[ts.length - 1].traffic_rpm,
      error_rate_pct: ts[ts.length - 1].error_rate,
      saturation_cpu_pct: ts[ts.length - 1].saturation_cpu,
      saturation_mem_pct: ts[ts.length - 1].saturation_mem,
      slo_target: svc.sloTarget,
      slo_current: svc.sloCurrent,
      error_budget_remaining_pct: svc.errorBudget,
      burn_rate: svc.burnRate,
      status: svc.status,
    };

    return { service, timeSeries: ts };
  });
}

/* ─── chart builders ─── */

function buildLatencyChart(data: LatencyTimeSeries[]): EChartsOption {
  const labels = data.map(d => hourLabel(d.timestamp));
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['P50', 'P95', 'P99'], top: 0, right: 0, textStyle: { color: '#8B949E', fontSize: 11 } },
    grid: { left: 52, right: 16, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value', name: 'ms', nameTextStyle: { color: '#8B949E', fontSize: 10 } },
    series: [
      {
        name: 'P50', type: 'line', data: data.map(d => d.latency_p50),
        smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#3FB950' },
        itemStyle: { color: '#3FB950' },
      },
      {
        name: 'P95', type: 'line', data: data.map(d => d.latency_p95),
        smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#58A6FF' },
        itemStyle: { color: '#58A6FF' },
      },
      {
        name: 'P99', type: 'line', data: data.map(d => d.latency_p99),
        smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#F85149', type: 'dashed' },
        itemStyle: { color: '#F85149' },
      },
    ],
  };
}

function buildTrafficChart(data: LatencyTimeSeries[]): EChartsOption {
  const labels = data.map(d => hourLabel(d.timestamp));
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 58, right: 16, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: {
      type: 'value', name: 'rpm', nameTextStyle: { color: '#8B949E', fontSize: 10 },
      axisLabel: { formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) },
    },
    series: [
      {
        name: 'Traffic', type: 'line', data: data.map(d => d.traffic_rpm),
        smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#58A6FF' },
        itemStyle: { color: '#58A6FF' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(88,166,255,0.25)' }, { offset: 1, color: 'rgba(88,166,255,0.02)' }] } },
      },
    ],
  };
}

function buildErrorRateChart(data: LatencyTimeSeries[]): EChartsOption {
  const labels = data.map(d => hourLabel(d.timestamp));
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${v}%` },
    grid: { left: 48, right: 16, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value', name: '%', nameTextStyle: { color: '#8B949E', fontSize: 10 } },
    series: [
      {
        name: 'Error Rate', type: 'bar', data: data.map(d => d.error_rate),
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const v = data[params.dataIndex].error_rate;
            return v > 1.5 ? '#F85149' : v > 0.5 ? '#D29922' : '#3FB950';
          },
          borderRadius: [2, 2, 0, 0],
        },
        barMaxWidth: 16,
      },
    ],
  };
}

function buildSaturationChart(data: LatencyTimeSeries[]): EChartsOption {
  const labels = data.map(d => hourLabel(d.timestamp));
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${v}%` },
    legend: { data: ['CPU', 'Memory'], top: 0, right: 0, textStyle: { color: '#8B949E', fontSize: 11 } },
    grid: { left: 48, right: 16, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value', name: '%', max: 100, nameTextStyle: { color: '#8B949E', fontSize: 10 } },
    series: [
      {
        name: 'CPU', type: 'line', data: data.map(d => d.saturation_cpu),
        smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#D29922' },
        itemStyle: { color: '#D29922' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(210,153,34,0.2)' }, { offset: 1, color: 'rgba(210,153,34,0.02)' }] } },
        stack: 'saturation',
      },
      {
        name: 'Memory', type: 'line', data: data.map(d => d.saturation_mem),
        smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: '#A371F7' },
        itemStyle: { color: '#A371F7' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(163,113,247,0.2)' }, { offset: 1, color: 'rgba(163,113,247,0.02)' }] } },
        stack: 'saturation',
      },
    ],
  };
}

/* ─── page component ─── */

export default function GoldenSignalsPage() {
  const demoFallback = useCallback(() => generateDemoData(), []);
  const { data: rawData, source } = useDataSource('/golden-signals', demoFallback, { refreshInterval: 30_000 });
  const demoData: ServiceDemoData[] = Array.isArray(rawData) ? rawData : (rawData as any)?.items ?? [];
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* filtered services */
  const filtered = useMemo(() => {
    return demoData.filter(({ service }) => {
      if (search && !service.service_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && service.status !== statusFilter) return false;
      return true;
    });
  }, [demoData, search, statusFilter]);

  /* aggregate KPI values */
  const kpi = useMemo(() => {
    const svcs = demoData.map(d => d.service);
    const avgP95 = svcs.reduce((s, v) => s + v.latency_p95_ms, 0) / svcs.length;
    const totalTraffic = svcs.reduce((s, v) => s + v.traffic_rpm, 0);
    const avgError = svcs.reduce((s, v) => s + v.error_rate_pct, 0) / svcs.length;
    const avgSat = svcs.reduce((s, v) => s + (v.saturation_cpu_pct + v.saturation_mem_pct) / 2, 0) / svcs.length;
    return { avgP95, totalTraffic, avgError, avgSat };
  }, [demoData]);

  /* aggregate time-series (average across all services) for the 4 charts */
  const aggregatedTS = useMemo(() => {
    const allTS = (filtered.length > 0 ? filtered : demoData).map(d => d.timeSeries);
    const n = allTS.length;
    if (n === 0) return [] as LatencyTimeSeries[];
    return allTS[0].map((_, i) => ({
      timestamp: allTS[0][i].timestamp,
      latency_p50: Math.round(allTS.reduce((s, ts) => s + ts[i].latency_p50, 0) / n),
      latency_p95: Math.round(allTS.reduce((s, ts) => s + ts[i].latency_p95, 0) / n),
      latency_p99: Math.round(allTS.reduce((s, ts) => s + ts[i].latency_p99, 0) / n),
      traffic_rpm: Math.round(allTS.reduce((s, ts) => s + ts[i].traffic_rpm, 0)),
      error_rate: parseFloat((allTS.reduce((s, ts) => s + ts[i].error_rate, 0) / n).toFixed(3)),
      saturation: Math.round(allTS.reduce((s, ts) => s + ts[i].saturation, 0) / n),
      saturation_cpu: Math.round(allTS.reduce((s, ts) => s + ts[i].saturation_cpu, 0) / n),
      saturation_mem: Math.round(allTS.reduce((s, ts) => s + ts[i].saturation_mem, 0) / n),
    }));
  }, [filtered, demoData]);

  /* chart options */
  const latencyOpt = useMemo(() => buildLatencyChart(aggregatedTS), [aggregatedTS]);
  const trafficOpt = useMemo(() => buildTrafficChart(aggregatedTS), [aggregatedTS]);
  const errorOpt = useMemo(() => buildErrorRateChart(aggregatedTS), [aggregatedTS]);
  const satOpt = useMemo(() => buildSaturationChart(aggregatedTS), [aggregatedTS]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Golden Signals', icon: <Activity size={14} /> },
      ]} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">SRE Golden Signals</h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Real-time overview of Latency, Traffic, Errors, and Saturation across all services
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Avg Latency P95"
          value={kpi.avgP95.toFixed(1)}
          unit="ms"
          status={kpi.avgP95 > 200 ? 'critical' : kpi.avgP95 > 100 ? 'warning' : 'healthy'}
          trend={{ direction: 'down', value: '-3.2%', positive: true }}
          sparkData={aggregatedTS.map(d => d.latency_p95)}
        />
        <KPICard
          title="Total Traffic"
          value={kpi.totalTraffic >= 1000 ? `${(kpi.totalTraffic / 1000).toFixed(1)}k` : String(kpi.totalTraffic)}
          unit="rpm"
          status="healthy"
          trend={{ direction: 'up', value: '+12.5%', positive: true }}
          sparkData={aggregatedTS.map(d => d.traffic_rpm)}
        />
        <KPICard
          title="Avg Error Rate"
          value={kpi.avgError.toFixed(2)}
          unit="%"
          status={kpi.avgError > 1.0 ? 'critical' : kpi.avgError > 0.5 ? 'warning' : 'healthy'}
          trend={{ direction: 'up', value: '+0.08%', positive: false }}
          sparkData={aggregatedTS.map(d => d.error_rate)}
        />
        <KPICard
          title="Avg Saturation"
          value={kpi.avgSat.toFixed(1)}
          unit="%"
          status={kpi.avgSat > 80 ? 'critical' : kpi.avgSat > 60 ? 'warning' : 'healthy'}
          trend={{ direction: 'flat', value: '+0.5%' }}
          sparkData={aggregatedTS.map(d => d.saturation)}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter services..."
          className="w-64"
        />
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        />
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          {filtered.length} of {demoData.length} services
        </span>
      </div>

      {/* Charts 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-1.5">
                <Gauge size={14} className="text-[#58A6FF]" /> Latency
              </span>
            </CardTitle>
            <span className="text-[10px] text-[var(--text-muted)]">P50 / P95 / P99 (ms)</span>
          </CardHeader>
          <EChartsWrapper option={latencyOpt} height={260} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp size={14} className="text-[#58A6FF]" /> Traffic
              </span>
            </CardTitle>
            <span className="text-[10px] text-[var(--text-muted)]">Requests per minute</span>
          </CardHeader>
          <EChartsWrapper option={trafficOpt} height={260} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-[#F85149]" /> Error Rate
              </span>
            </CardTitle>
            <span className="text-[10px] text-[var(--text-muted)]">Percentage of failed requests</span>
          </CardHeader>
          <EChartsWrapper option={errorOpt} height={260} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-1.5">
                <Zap size={14} className="text-[#D29922]" /> Saturation
              </span>
            </CardTitle>
            <span className="text-[10px] text-[var(--text-muted)]">CPU + Memory utilization</span>
          </CardHeader>
          <EChartsWrapper option={satOpt} height={260} />
        </Card>
      </div>

      {/* Service Table */}
      <Card padding="none">
        <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center gap-2">
          <ArrowUpRight size={14} className="text-[var(--accent-primary)]" />
          <span className="text-xs font-medium text-[var(--text-primary)]">Service Detail</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 font-medium text-right">Latency P95</th>
                <th className="px-4 py-2 font-medium text-right">Traffic</th>
                <th className="px-4 py-2 font-medium text-right">Error Rate</th>
                <th className="px-4 py-2 font-medium text-right">CPU%</th>
                <th className="px-4 py-2 font-medium text-right">Mem%</th>
                <th className="px-4 py-2 font-medium text-right">SLO Target</th>
                <th className="px-4 py-2 font-medium text-right">SLO Current</th>
                <th className="px-4 py-2 font-medium text-right">Error Budget</th>
                <th className="px-4 py-2 font-medium text-right">Burn Rate</th>
                <th className="px-4 py-2 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ service: svc }) => {
                const burnColor = svc.burn_rate > 1.0 ? '#F85149' : svc.burn_rate > 0.5 ? '#D29922' : 'var(--text-secondary)';
                const budgetColor = svc.error_budget_remaining_pct < 20 ? '#F85149' : svc.error_budget_remaining_pct < 40 ? '#D29922' : 'var(--text-secondary)';
                const statusCfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.healthy;

                return (
                  <tr key={svc.service_name} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)] font-mono text-[11px]">{svc.service_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.latency_p95_ms} ms</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {svc.traffic_rpm >= 1000 ? `${(svc.traffic_rpm / 1000).toFixed(1)}k` : svc.traffic_rpm}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: svc.error_rate_pct > 1.0 ? '#F85149' : 'var(--text-secondary)' }}>
                      {svc.error_rate_pct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: svc.saturation_cpu_pct > 75 ? '#D29922' : 'var(--text-secondary)' }}>
                      {svc.saturation_cpu_pct}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: svc.saturation_mem_pct > 75 ? '#D29922' : 'var(--text-secondary)' }}>
                      {svc.saturation_mem_pct}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.slo_target}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: svc.slo_current >= svc.slo_target ? '#3FB950' : '#F85149' }}>
                      {svc.slo_current}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: budgetColor }}>
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(svc.error_budget_remaining_pct, 100)}%`,
                              backgroundColor: svc.error_budget_remaining_pct < 20 ? '#F85149' : svc.error_budget_remaining_pct < 40 ? '#D29922' : '#3FB950',
                            }}
                          />
                        </div>
                        {svc.error_budget_remaining_pct.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: burnColor }}>
                      {svc.burn_rate.toFixed(2)}x
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full"
                        style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
                        {statusCfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
