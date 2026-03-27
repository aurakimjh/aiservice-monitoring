'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import type { RUMSession, RUMPageMetrics, RUMGeoMetrics } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';
import {
  Activity,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  BarChart3,
  FileText,
  Play,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

const TABS = [
  { id: 'vitals', label: 'Core Web Vitals', icon: <Activity size={14} /> },
  { id: 'pages', label: 'Page Performance', icon: <FileText size={14} /> },
  { id: 'geo', label: 'Geography', icon: <Globe size={14} /> },
] as const;

type TabId = (typeof TABS)[number]['id'];

const DEVICE_BADGE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  desktop: { color: '#58A6FF', bg: 'rgba(88,166,255,0.12)', icon: <Monitor size={11} />, label: 'Desktop' },
  mobile:  { color: '#3FB950', bg: 'rgba(63,185,80,0.12)',  icon: <Smartphone size={11} />, label: 'Mobile' },
  tablet:  { color: '#D29922', bg: 'rgba(210,153,34,0.12)', icon: <Tablet size={11} />, label: 'Tablet' },
};

function getCWVStatus(metric: 'lcp' | 'fid' | 'cls' | 'inp', value: number): 'good' | 'needs-improvement' | 'poor' {
  switch (metric) {
    case 'lcp':
      return value < 2500 ? 'good' : value > 4000 ? 'poor' : 'needs-improvement';
    case 'fid':
      return value < 100 ? 'good' : value > 300 ? 'poor' : 'needs-improvement';
    case 'cls':
      return value < 0.1 ? 'good' : value > 0.25 ? 'poor' : 'needs-improvement';
    case 'inp':
      return value < 200 ? 'good' : value > 500 ? 'poor' : 'needs-improvement';
  }
}

function cwvColor(status: 'good' | 'needs-improvement' | 'poor'): string {
  switch (status) {
    case 'good': return '#3FB950';
    case 'needs-improvement': return '#D29922';
    case 'poor': return '#F85149';
  }
}

export default function RUMPage() {
  const [activeTab, setActiveTab] = useState<TabId>('vitals');

  const sessions = useMemo<RUMSession[]>(() => [
    { id: 'rum-s01', user_id: 'usr_8a3f21', page_url: '/dashboard', device: 'desktop', browser: 'Chrome 122', country: 'KR', lcp_ms: 1820, fid_ms: 45, cls: 0.04, inp_ms: 120, ttfb_ms: 280, fcp_ms: 950, session_duration_ms: 342000, page_views: 8, error_count: 0, started_at: '2026-03-26T09:14:00Z' },
    { id: 'rum-s02', user_id: 'usr_c5d912', page_url: '/services', device: 'mobile', browser: 'Safari 17', country: 'JP', lcp_ms: 3200, fid_ms: 120, cls: 0.18, inp_ms: 280, ttfb_ms: 450, fcp_ms: 1400, session_duration_ms: 128000, page_views: 3, error_count: 1, started_at: '2026-03-26T09:22:00Z' },
    { id: 'rum-s03', user_id: 'usr_7ef4b0', page_url: '/traces', device: 'desktop', browser: 'Firefox 124', country: 'US', lcp_ms: 2100, fid_ms: 62, cls: 0.06, inp_ms: 150, ttfb_ms: 320, fcp_ms: 1050, session_duration_ms: 520000, page_views: 14, error_count: 0, started_at: '2026-03-26T08:45:00Z' },
    { id: 'rum-s04', user_id: 'usr_2b8e19', page_url: '/metrics', device: 'tablet', browser: 'Chrome 122', country: 'SG', lcp_ms: 2800, fid_ms: 88, cls: 0.12, inp_ms: 210, ttfb_ms: 380, fcp_ms: 1200, session_duration_ms: 215000, page_views: 6, error_count: 0, started_at: '2026-03-26T09:05:00Z' },
    { id: 'rum-s05', user_id: 'usr_f1a730', page_url: '/alerts', device: 'desktop', browser: 'Edge 122', country: 'DE', lcp_ms: 1650, fid_ms: 38, cls: 0.03, inp_ms: 95, ttfb_ms: 260, fcp_ms: 880, session_duration_ms: 680000, page_views: 22, error_count: 0, started_at: '2026-03-26T07:30:00Z' },
    { id: 'rum-s06', user_id: 'usr_d4c682', page_url: '/logs', device: 'mobile', browser: 'Chrome 122', country: 'KR', lcp_ms: 4200, fid_ms: 210, cls: 0.28, inp_ms: 520, ttfb_ms: 620, fcp_ms: 1800, session_duration_ms: 92000, page_views: 2, error_count: 3, started_at: '2026-03-26T09:31:00Z' },
    { id: 'rum-s07', user_id: 'usr_93e5a1', page_url: '/topology', device: 'desktop', browser: 'Chrome 122', country: 'US', lcp_ms: 1950, fid_ms: 55, cls: 0.05, inp_ms: 135, ttfb_ms: 300, fcp_ms: 980, session_duration_ms: 410000, page_views: 11, error_count: 0, started_at: '2026-03-26T08:20:00Z' },
    { id: 'rum-s08', user_id: 'usr_0b6f48', page_url: '/copilot', device: 'mobile', browser: 'Safari 17', country: 'JP', lcp_ms: 3500, fid_ms: 145, cls: 0.15, inp_ms: 310, ttfb_ms: 490, fcp_ms: 1550, session_duration_ms: 165000, page_views: 5, error_count: 1, started_at: '2026-03-26T09:18:00Z' },
  ], []);

  const pageMetrics = useMemo<RUMPageMetrics[]>(() => [
    { page_url: '/dashboard', avg_lcp_ms: 1780, avg_fid_ms: 42, avg_cls: 0.03, avg_inp_ms: 110, sample_count: 2450, good_pct: 82, needs_improvement_pct: 14, poor_pct: 4 },
    { page_url: '/services', avg_lcp_ms: 2640, avg_fid_ms: 95, avg_cls: 0.14, avg_inp_ms: 220, sample_count: 1820, good_pct: 58, needs_improvement_pct: 28, poor_pct: 14 },
    { page_url: '/traces', avg_lcp_ms: 2100, avg_fid_ms: 60, avg_cls: 0.06, avg_inp_ms: 145, sample_count: 1560, good_pct: 74, needs_improvement_pct: 20, poor_pct: 6 },
    { page_url: '/metrics', avg_lcp_ms: 2350, avg_fid_ms: 78, avg_cls: 0.09, avg_inp_ms: 185, sample_count: 1340, good_pct: 66, needs_improvement_pct: 24, poor_pct: 10 },
    { page_url: '/alerts', avg_lcp_ms: 1620, avg_fid_ms: 35, avg_cls: 0.02, avg_inp_ms: 88, sample_count: 980, good_pct: 88, needs_improvement_pct: 9, poor_pct: 3 },
    { page_url: '/logs', avg_lcp_ms: 3180, avg_fid_ms: 130, avg_cls: 0.19, avg_inp_ms: 340, sample_count: 870, good_pct: 42, needs_improvement_pct: 32, poor_pct: 26 },
  ], []);

  const geoMetrics = useMemo<RUMGeoMetrics[]>(() => [
    { region: 'Seoul (KR)', latency_ms: 28, sessions: 12400, error_rate: 0.8 },
    { region: 'Tokyo (JP)', latency_ms: 45, sessions: 8600, error_rate: 1.2 },
    { region: 'Singapore (SG)', latency_ms: 82, sessions: 4200, error_rate: 1.5 },
    { region: 'US-West (OR)', latency_ms: 148, sessions: 6800, error_rate: 2.1 },
    { region: 'EU-Frankfurt (DE)', latency_ms: 165, sessions: 5400, error_rate: 1.8 },
  ], []);

  // KPI aggregations
  const kpis = useMemo(() => {
    const avgLcp = Math.round(sessions.reduce((s, r) => s + r.lcp_ms, 0) / sessions.length);
    const avgFid = Math.round(sessions.reduce((s, r) => s + r.fid_ms, 0) / sessions.length);
    const avgCls = +(sessions.reduce((s, r) => s + r.cls, 0) / sessions.length).toFixed(2);
    const totalSessions = geoMetrics.reduce((s, g) => s + g.sessions, 0);
    return { avgLcp, avgFid, avgCls, totalSessions };
  }, [sessions, geoMetrics]);

  // Core Web Vitals distribution chart
  const vitalsChartOption = useMemo<EChartsOption>(() => {
    const metrics = ['LCP', 'FID', 'CLS', 'INP'];
    const goodData = [
      pageMetrics.filter(p => getCWVStatus('lcp', p.avg_lcp_ms) === 'good').length,
      pageMetrics.filter(p => getCWVStatus('fid', p.avg_fid_ms) === 'good').length,
      pageMetrics.filter(p => getCWVStatus('cls', p.avg_cls) === 'good').length,
      pageMetrics.filter(p => getCWVStatus('inp', p.avg_inp_ms) === 'good').length,
    ].map(v => Math.round((v / pageMetrics.length) * 100));
    const needsImpData = [
      pageMetrics.filter(p => getCWVStatus('lcp', p.avg_lcp_ms) === 'needs-improvement').length,
      pageMetrics.filter(p => getCWVStatus('fid', p.avg_fid_ms) === 'needs-improvement').length,
      pageMetrics.filter(p => getCWVStatus('cls', p.avg_cls) === 'needs-improvement').length,
      pageMetrics.filter(p => getCWVStatus('inp', p.avg_inp_ms) === 'needs-improvement').length,
    ].map(v => Math.round((v / pageMetrics.length) * 100));
    const poorData = [
      pageMetrics.filter(p => getCWVStatus('lcp', p.avg_lcp_ms) === 'poor').length,
      pageMetrics.filter(p => getCWVStatus('fid', p.avg_fid_ms) === 'poor').length,
      pageMetrics.filter(p => getCWVStatus('cls', p.avg_cls) === 'poor').length,
      pageMetrics.filter(p => getCWVStatus('inp', p.avg_inp_ms) === 'poor').length,
    ].map(v => Math.round((v / pageMetrics.length) * 100));

    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'var(--bg-tertiary)',
        borderColor: 'var(--border-default)',
        textStyle: { color: 'var(--text-primary)', fontSize: 12 },
      },
      legend: {
        data: ['Good', 'Needs Improvement', 'Poor'],
        top: 0,
        textStyle: { color: 'var(--text-muted)', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: { left: 48, right: 16, top: 40, bottom: 32 },
      xAxis: {
        type: 'category',
        data: metrics,
        axisLine: { lineStyle: { color: 'var(--border-default)' } },
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLabel: { color: 'var(--text-muted)', fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'var(--border-muted)', type: 'dashed' } },
      },
      series: [
        {
          name: 'Good',
          type: 'bar',
          stack: 'total',
          data: goodData,
          itemStyle: { color: '#3FB950', borderRadius: [0, 0, 0, 0] },
          barWidth: '40%',
        },
        {
          name: 'Needs Improvement',
          type: 'bar',
          stack: 'total',
          data: needsImpData,
          itemStyle: { color: '#D29922' },
        },
        {
          name: 'Poor',
          type: 'bar',
          stack: 'total',
          data: poorData,
          itemStyle: { color: '#F85149', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [pageMetrics]);

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min}m ${remSec}s`;
  };

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'RUM', icon: <Activity size={14} /> },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Real User Monitoring</h1>
          <DataSourceBadge source="demo" />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Core Web Vitals, page performance, and user experience metrics from real browser sessions
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Avg LCP"
          value={kpis.avgLcp}
          unit="ms"
          status={getCWVStatus('lcp', kpis.avgLcp) === 'good' ? 'healthy' : getCWVStatus('lcp', kpis.avgLcp) === 'poor' ? 'critical' : 'warning'}
          subtitle="Largest Contentful Paint"
        />
        <KPICard
          title="Avg FID"
          value={kpis.avgFid}
          unit="ms"
          status={getCWVStatus('fid', kpis.avgFid) === 'good' ? 'healthy' : getCWVStatus('fid', kpis.avgFid) === 'poor' ? 'critical' : 'warning'}
          subtitle="First Input Delay"
        />
        <KPICard
          title="Avg CLS"
          value={kpis.avgCls}
          status={getCWVStatus('cls', kpis.avgCls) === 'good' ? 'healthy' : getCWVStatus('cls', kpis.avgCls) === 'poor' ? 'critical' : 'warning'}
          subtitle="Cumulative Layout Shift"
        />
        <KPICard
          title="Total Sessions"
          value={kpis.totalSessions.toLocaleString()}
          subtitle="Across all regions"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-default)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-[1px]',
              activeTab === tab.id
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Core Web Vitals */}
      {activeTab === 'vitals' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <BarChart3 size={14} />
                  CWV Distribution by Pages
                </span>
              </CardTitle>
            </CardHeader>
            <div style={{ height: 320 }}>
              <EChartsWrapper option={vitalsChartOption} height={320} />
            </div>
          </Card>

          {/* Thresholds reference */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Activity size={14} />
                  Threshold Reference
                </span>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-4 py-2 font-medium text-center">Good</th>
                    <th className="px-4 py-2 font-medium text-center">Needs Improvement</th>
                    <th className="px-4 py-2 font-medium text-center">Poor</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { metric: 'LCP', good: '< 2,500ms', mid: '2,500 - 4,000ms', poor: '> 4,000ms' },
                    { metric: 'FID', good: '< 100ms', mid: '100 - 300ms', poor: '> 300ms' },
                    { metric: 'CLS', good: '< 0.1', mid: '0.1 - 0.25', poor: '> 0.25' },
                    { metric: 'INP', good: '< 200ms', mid: '200 - 500ms', poor: '> 500ms' },
                  ].map((row) => (
                    <tr key={row.metric} className="border-b border-[var(--border-muted)]">
                      <td className="px-4 py-2 text-[var(--text-primary)] font-medium">{row.metric}</td>
                      <td className="px-4 py-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(63,185,80,0.12)', color: '#3FB950' }}>{row.good}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(210,153,34,0.12)', color: '#D29922' }}>{row.mid}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(248,81,73,0.12)', color: '#F85149' }}>{row.poor}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Page Performance */}
      {activeTab === 'pages' && (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
            <span className="text-xs font-medium text-[var(--text-primary)]">Page-Level Metrics</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2 font-medium">URL</th>
                  <th className="px-4 py-2 font-medium text-right">LCP (ms)</th>
                  <th className="px-4 py-2 font-medium text-right">FID (ms)</th>
                  <th className="px-4 py-2 font-medium text-right">CLS</th>
                  <th className="px-4 py-2 font-medium text-right">INP (ms)</th>
                  <th className="px-4 py-2 font-medium text-right">Samples</th>
                  <th className="px-4 py-2 font-medium text-right">Good %</th>
                </tr>
              </thead>
              <tbody>
                {pageMetrics.map((page) => {
                  const lcpStatus = getCWVStatus('lcp', page.avg_lcp_ms);
                  const fidStatus = getCWVStatus('fid', page.avg_fid_ms);
                  const clsStatus = getCWVStatus('cls', page.avg_cls);
                  const inpStatus = getCWVStatus('inp', page.avg_inp_ms);
                  return (
                    <tr key={page.page_url} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium">{page.page_url}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cwvColor(lcpStatus) }}>{page.avg_lcp_ms.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cwvColor(fidStatus) }}>{page.avg_fid_ms}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cwvColor(clsStatus) }}>{page.avg_cls.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cwvColor(inpStatus) }}>{page.avg_inp_ms}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{page.sample_count.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${page.good_pct}%`,
                                backgroundColor: page.good_pct >= 75 ? '#3FB950' : page.good_pct >= 50 ? '#D29922' : '#F85149',
                              }}
                            />
                          </div>
                          <span className="tabular-nums text-[var(--text-primary)]" style={{ minWidth: 32, textAlign: 'right' }}>{page.good_pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Geography */}
      {activeTab === 'geo' && (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
            <span className="text-xs font-medium text-[var(--text-primary)]">PoP Region Performance</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2 font-medium">Region</th>
                  <th className="px-4 py-2 font-medium text-right">Latency (ms)</th>
                  <th className="px-4 py-2 font-medium text-right">Sessions</th>
                  <th className="px-4 py-2 font-medium text-right">Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {geoMetrics.map((geo) => {
                  const latencyColor = geo.latency_ms < 50 ? '#3FB950' : geo.latency_ms < 100 ? '#58A6FF' : geo.latency_ms < 150 ? '#D29922' : '#F85149';
                  const errorColor = geo.error_rate < 1.0 ? '#3FB950' : geo.error_rate < 2.0 ? '#D29922' : '#F85149';
                  return (
                    <tr key={geo.region} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Globe size={13} className="text-[var(--text-muted)]" />
                          <span className="text-[var(--text-primary)] font-medium">{geo.region}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: latencyColor }}>{geo.latency_ms}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{geo.sessions.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: errorColor }}>{geo.error_rate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Session Replay */}
      <Card padding="none">
        <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Play size={13} />
            Recent Sessions
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">{sessions.length} sessions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Page</th>
                <th className="px-4 py-2 font-medium">Device</th>
                <th className="px-4 py-2 font-medium">Browser</th>
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 font-medium text-right">Duration</th>
                <th className="px-4 py-2 font-medium text-right">LCP</th>
                <th className="px-4 py-2 font-medium text-right">CLS</th>
                <th className="px-4 py-2 font-medium text-right">Errors</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const deviceCfg = DEVICE_BADGE[s.device];
                const lcpStatus = getCWVStatus('lcp', s.lcp_ms);
                const clsStatus = getCWVStatus('cls', s.cls);
                return (
                  <tr key={s.id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium font-mono text-[11px]">{s.user_id}</td>
                    <td className="px-4 py-2.5 text-[var(--accent-primary)]">{s.page_url}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: deviceCfg.bg, color: deviceCfg.color }}
                      >
                        {deviceCfg.icon}
                        {deviceCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.browser}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.country}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{formatDuration(s.session_duration_ms)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cwvColor(lcpStatus) }}>{s.lcp_ms.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cwvColor(clsStatus) }}>{s.cls.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {s.error_count > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(248,81,73,0.12)', color: '#F85149' }}>
                          {s.error_count}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">0</span>
                      )}
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
