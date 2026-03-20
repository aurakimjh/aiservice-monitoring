'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, Badge, Select, Button } from '@/components/ui';
import { EChartsWrapper } from '@/components/charts';
import { generateTransactions, generateHeatMapData } from '@/lib/demo-data';
import { formatDuration } from '@/lib/utils';
import type { Transaction, TransactionStatus } from '@/types/monitoring';
import {
  Route,
  Activity,
  Grid3x3,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';

// ── Constants ──

const VIEW_TABS = [
  { id: 'xlog', label: 'XLog', icon: <Activity size={13} /> },
  { id: 'heatmap', label: 'HeatMap', icon: <Grid3x3 size={13} /> },
];

const SERVICE_OPTIONS = [
  { label: 'All Services', value: 'all' },
  { label: 'rag-service', value: 'rag-service' },
  { label: 'api-gateway', value: 'api-gateway' },
  { label: 'embedding-service', value: 'embedding-service' },
  { label: 'auth-service', value: 'auth-service' },
];

const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'normal', label: 'Normal' },
  { id: 'slow', label: 'Slow' },
  { id: 'very_slow', label: 'Very Slow' },
  { id: 'error', label: 'Error' },
];

const STATUS_DOT_COLOR: Record<TransactionStatus, string> = {
  normal: '#58A6FF',
  slow: '#D29922',
  very_slow: '#E8601C',
  error: '#F85149',
};

const SPAN_COLORS: Record<string, string> = {
  'rag.guardrail_input_check': '#9B59B6',
  'rag.guardrail_output_check': '#9B59B6',
  'rag.embedding': '#3498DB',
  'rag.vector_search': '#2ECC71',
  'rag.llm_inference': '#E67E22',
};

const LATENCY_BUCKETS = ['0-100', '100-300', '300-500', '500-1K', '1K-2K', '2K-3K', '3K+'];

// ── Page ──

export default function TracesPage() {
  const [viewMode, setViewMode] = useState('xlog');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTxns, setSelectedTxns] = useState<Transaction[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<Transaction | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listSortBy, setListSortBy] = useState<'elapsed' | 'timestamp'>('elapsed');
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('desc');

  // Generate transactions
  const allTransactions = useMemo(
    () => generateTransactions(300, serviceFilter !== 'all' ? serviceFilter : undefined),
    [serviceFilter],
  );

  const filteredTransactions = useMemo(() => {
    if (statusFilter === 'all') return allTransactions;
    return allTransactions.filter((t) => t.status === statusFilter);
  }, [allTransactions, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredTransactions.length;
    const errors = filteredTransactions.filter((t) => t.status === 'error').length;
    const slow = filteredTransactions.filter((t) => t.status === 'slow' || t.status === 'very_slow').length;
    const avgElapsed = total > 0 ? Math.round(filteredTransactions.reduce((s, t) => s + t.elapsed, 0) / total) : 0;
    return { total, errors, slow, avgElapsed };
  }, [filteredTransactions]);

  // ── XLog Chart Option ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xlogOption = useMemo<any>(() => {
    const groups: Record<TransactionStatus, number[][]> = { normal: [], slow: [], very_slow: [], error: [] };
    for (const txn of filteredTransactions) {
      groups[txn.status].push([txn.timestamp, txn.elapsed]);
    }
    return {
      animation: false,
      xAxis: { type: 'time' },
      yAxis: {
        type: 'value',
        name: 'ms',
        nameTextStyle: { color: '#8B949E', fontSize: 10, padding: [0, 0, 0, -30] },
      },
      series: [
        { name: 'Normal', type: 'scatter', data: groups.normal, symbolSize: 4, itemStyle: { color: '#58A6FF', opacity: 0.6 } },
        { name: 'Slow', type: 'scatter', data: groups.slow, symbolSize: 5, itemStyle: { color: '#D29922', opacity: 0.7 } },
        { name: 'Very Slow', type: 'scatter', data: groups.very_slow, symbolSize: 6, itemStyle: { color: '#E8601C', opacity: 0.8 } },
        { name: 'Error', type: 'scatter', data: groups.error, symbolSize: 6, itemStyle: { color: '#F85149', opacity: 0.9 } },
      ],
      tooltip: {
        trigger: 'item',
        formatter: (p: { seriesName: string; data: number[] }) => {
          const time = new Date(p.data[0]).toLocaleTimeString();
          return `${p.seriesName}<br/>Response: ${Math.round(p.data[1])}ms<br/>Time: ${time}`;
        },
      },
      legend: { show: true, bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
      grid: { left: 52, right: 16, top: 32, bottom: 36 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 52 }],
      toolbox: {
        feature: {
          brush: { title: { rect: 'Box Select', clear: 'Clear' } },
        },
        right: 16,
        top: 0,
      },
      brush: {
        toolbox: ['rect', 'clear'],
        xAxisIndex: 0,
        brushStyle: { borderWidth: 1, color: 'rgba(74,144,217,0.15)', borderColor: 'rgba(74,144,217,0.5)' },
      },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          { yAxis: 1000, lineStyle: { color: '#D29922', type: 'dashed', width: 1 }, label: { formatter: '1s', color: '#D29922', fontSize: 10 } },
          { yAxis: 3000, lineStyle: { color: '#F85149', type: 'dashed', width: 1 }, label: { formatter: '3s', color: '#F85149', fontSize: 10 } },
        ],
      },
    };
  }, [filteredTransactions]);

  // ── HeatMap Chart Option ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapOption = useMemo<any>(() => {
    const hmData = generateHeatMapData(filteredTransactions, 30, LATENCY_BUCKETS);
    const maxVal = Math.max(...hmData.map((d) => d[2]), 1);
    return {
      animation: false,
      xAxis: {
        type: 'category',
        data: Array.from({ length: 30 }, (_, i) => {
          if (filteredTransactions.length === 0) return '';
          const minT = Math.min(...filteredTransactions.map((t) => t.timestamp));
          const maxT = Math.max(...filteredTransactions.map((t) => t.timestamp));
          const t = minT + ((maxT - minT) / 30) * i;
          return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }),
        axisLabel: { interval: 4, fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: LATENCY_BUCKETS,
        axisLabel: { fontSize: 10 },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 100,
        textStyle: { color: '#8B949E', fontSize: 10 },
        inRange: { color: ['#0D1117', '#1F3A5F', '#58A6FF', '#D29922', '#F85149'] },
      },
      series: [{
        name: 'Transactions',
        type: 'heatmap',
        data: hmData,
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        itemStyle: { borderColor: '#0D1117', borderWidth: 1 },
      }],
      tooltip: {
        formatter: (p: { data: number[] }) => {
          const bucket = LATENCY_BUCKETS[p.data[1]] ?? '';
          return `${bucket}ms<br/>${p.data[2]} transactions`;
        },
      },
      grid: { left: 60, right: 16, top: 16, bottom: 60 },
    };
  }, [filteredTransactions]);

  // ── Brush selection handler ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartInit = useCallback((chart: any) => {
    chart.on('brushSelected', (params: { batch?: { selected?: { dataIndex?: number[] }[] }[] }) => {
      const batch = params.batch;
      if (!batch || batch.length === 0) return;
      const allIndices = new Set<number>();
      for (const b of batch) {
        if (!b.selected) continue;
        for (const sel of b.selected) {
          if (sel.dataIndex) {
            for (const idx of sel.dataIndex) allIndices.add(idx);
          }
        }
      }
      if (allIndices.size === 0) return;
      // Map indices back to transactions (indices span across all 4 series in order)
      const groups: Transaction[][] = [[], [], [], []];
      for (const txn of filteredTransactions) {
        const idx = txn.status === 'normal' ? 0 : txn.status === 'slow' ? 1 : txn.status === 'very_slow' ? 2 : 3;
        groups[idx].push(txn);
      }
      const selected: Transaction[] = [];
      for (const b of batch) {
        if (!b.selected) continue;
        b.selected.forEach((sel, seriesIdx) => {
          if (sel.dataIndex && seriesIdx < groups.length) {
            for (const idx of sel.dataIndex) {
              if (groups[seriesIdx][idx]) selected.push(groups[seriesIdx][idx]);
            }
          }
        });
      }
      if (selected.length > 0) {
        setSelectedTxns(selected);
        setSelectedDetail(null);
      }
    });

    chart.on('click', (params: { data?: number[] }) => {
      if (!params.data) return;
      const [ts, elapsed] = params.data;
      const match = filteredTransactions.find(
        (t) => Math.abs(t.timestamp - ts) < 100 && Math.abs(t.elapsed - elapsed) < 5,
      );
      if (match) {
        setSelectedTxns([match]);
        setSelectedDetail(match);
      }
    });
  }, [filteredTransactions]);

  // HeatMap click handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHeatmapInit = useCallback((chart: any) => {
    chart.on('click', (params: { data?: number[] }) => {
      if (!params.data) return;
      const [tIdx, lIdx] = params.data;
      if (filteredTransactions.length === 0) return;
      const minT = Math.min(...filteredTransactions.map((t) => t.timestamp));
      const maxT = Math.max(...filteredTransactions.map((t) => t.timestamp));
      const bucketWidth = (maxT - minT) / 30 || 1;
      const tStart = minT + tIdx * bucketWidth;
      const tEnd = tStart + bucketWidth;
      const lRanges = [
        [0, 100], [100, 300], [300, 500], [500, 1000], [1000, 2000], [2000, 3000], [3000, Infinity],
      ];
      const [lMin, lMax] = lRanges[lIdx] ?? [0, Infinity];
      const matches = filteredTransactions.filter(
        (t) => t.timestamp >= tStart && t.timestamp < tEnd && t.elapsed >= lMin && t.elapsed < lMax,
      );
      if (matches.length > 0) {
        setSelectedTxns(matches);
        setSelectedDetail(null);
      }
    });
  }, [filteredTransactions]);

  // Sort transaction list
  const sortedSelected = useMemo(() => {
    const sorted = [...selectedTxns];
    sorted.sort((a, b) => {
      const cmp = listSortBy === 'elapsed' ? a.elapsed - b.elapsed : a.timestamp - b.timestamp;
      return listSortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [selectedTxns, listSortBy, listSortDir]);

  const handleListSort = (col: typeof listSortBy) => {
    if (listSortBy === col) setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setListSortBy(col); setListSortDir('desc'); }
  };
  const listSortIcon = (col: typeof listSortBy) => listSortBy === col ? (listSortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />) : null;

  const copyTraceId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const clearSelection = () => {
    setSelectedTxns([]);
    setSelectedDetail(null);
    setSelectedSpanId(null);
  };

  const selectedSpan = selectedDetail?.spans.find((s) => s.spanId === selectedSpanId) ?? null;

  return (
    <div className="space-y-3">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Traces', icon: <Route size={14} /> },
      ]} />

      {/* Header + Filters */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">XLog / HeatMap</h1>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>Total: <strong className="text-[var(--text-primary)]">{stats.total}</strong></span>
          <span>Avg: <strong className="text-[var(--text-primary)]">{formatDuration(stats.avgElapsed)}</strong></span>
          <span>Slow: <strong className="text-[var(--status-warning)]">{stats.slow}</strong></span>
          <span>Error: <strong className="text-[var(--status-critical)]">{stats.errors}</strong></span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          options={SERVICE_OPTIONS}
          value={serviceFilter}
          onChange={(e) => { setServiceFilter(e.target.value); clearSelection(); }}
        />
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-[var(--text-muted)]" />
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { setStatusFilter(opt.id); clearSelection(); }}
              className={cn(
                'px-2 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] transition-colors',
                statusFilter === opt.id
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Tabs tabs={VIEW_TABS} activeTab={viewMode} onChange={(v) => { setViewMode(v); clearSelection(); }} variant="pill" />
        </div>
      </div>

      {/* Chart Panel */}
      <Card>
        <CardHeader>
          <CardTitle>{viewMode === 'xlog' ? 'XLog Scatter Plot' : 'Response Time HeatMap'}</CardTitle>
          {viewMode === 'xlog' && (
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
              {Object.entries(STATUS_DOT_COLOR).map(([status, color]) => (
                <span key={status} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  {status}
                </span>
              ))}
              <span className="ml-2">Use brush tool to select area</span>
            </div>
          )}
        </CardHeader>
        {viewMode === 'xlog' ? (
          <EChartsWrapper
            option={xlogOption}
            height={selectedTxns.length > 0 ? 280 : 380}
            onInit={handleChartInit}
          />
        ) : (
          <EChartsWrapper
            option={heatmapOption}
            height={selectedTxns.length > 0 ? 280 : 380}
            onInit={handleHeatmapInit}
          />
        )}
      </Card>

      {/* Transaction List Panel */}
      {selectedTxns.length > 0 && (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-[var(--text-primary)]">
                {selectedTxns.length} transaction{selectedTxns.length !== 1 && 's'} selected
              </span>
              {selectedTxns.length > 1 && (
                <span className="text-[var(--text-muted)]">
                  {formatDuration(Math.min(...selectedTxns.map((t) => t.elapsed)))} ~ {formatDuration(Math.max(...selectedTxns.map((t) => t.elapsed)))}
                </span>
              )}
            </div>
            <button onClick={clearSelection} className="p-1 hover:bg-[var(--bg-tertiary)] rounded">
              <X size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>
          <div className="overflow-x-auto max-h-[240px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-3 py-2 font-medium w-8"></th>
                  <th className="px-3 py-2 font-medium">Endpoint</th>
                  <th className="px-3 py-2 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleListSort('elapsed')}>
                    Response {listSortIcon('elapsed')}
                  </th>
                  <th className="px-3 py-2 font-medium text-right">TTFT</th>
                  <th className="px-3 py-2 font-medium text-right">TPS</th>
                  <th className="px-3 py-2 font-medium cursor-pointer select-none hover:text-[var(--text-secondary)]" onClick={() => handleListSort('timestamp')}>
                    Time {listSortIcon('timestamp')}
                  </th>
                  <th className="px-3 py-2 font-medium text-center">Guard</th>
                  <th className="px-3 py-2 font-medium">Trace ID</th>
                </tr>
              </thead>
              <tbody>
                {sortedSelected.map((txn) => (
                  <tr
                    key={txn.traceId}
                    onClick={() => { setSelectedDetail(txn); setSelectedSpanId(null); }}
                    className={cn(
                      'border-b border-[var(--border-muted)] cursor-pointer transition-colors',
                      selectedDetail?.traceId === txn.traceId
                        ? 'bg-[var(--accent-primary)]/10'
                        : 'hover:bg-[var(--bg-tertiary)]',
                    )}
                  >
                    <td className="px-3 py-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: STATUS_DOT_COLOR[txn.status] }}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--text-primary)]">{txn.endpoint}</td>
                    <td className={cn(
                      'px-3 py-2 text-right tabular-nums font-medium',
                      txn.status === 'error' ? 'text-[var(--status-critical)]' :
                      txn.status === 'very_slow' ? 'text-[#E8601C]' :
                      txn.status === 'slow' ? 'text-[var(--status-warning)]' :
                      'text-[var(--text-secondary)]',
                    )}>
                      {formatDuration(txn.elapsed)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {txn.metrics.ttft_ms > 0 ? `${txn.metrics.ttft_ms}ms` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {txn.metrics.tps > 0 ? `${txn.metrics.tps}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">
                      {new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {txn.metrics.guardrail_action === 'BLOCK' ? (
                        <span className="text-[var(--status-critical)] font-bold">BLOCK</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">PASS</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <Link
                          href={`/traces/${txn.traceId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-[var(--accent-primary)] hover:underline"
                        >
                          {txn.traceId.slice(0, 8)}...
                        </Link>
                        <button onClick={(e) => { e.stopPropagation(); copyTraceId(txn.traceId); }} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                          {copiedId === txn.traceId ? <Check size={11} className="text-[var(--status-healthy)]" /> : <Copy size={11} className="text-[var(--text-muted)]" />}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail Panel — Waterfall */}
      {selectedDetail && (
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_DOT_COLOR[selectedDetail.status] }}
                />
                <span className="font-mono text-sm font-medium text-[var(--text-primary)]">{selectedDetail.endpoint}</span>
                <Badge variant="tag">{selectedDetail.statusCode}</Badge>
                <Badge variant="status" status={selectedDetail.status === 'error' ? 'critical' : selectedDetail.status === 'normal' ? 'healthy' : 'warning'}>
                  {selectedDetail.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                <span>Service: {selectedDetail.service}</span>
                <span>Duration: {formatDuration(selectedDetail.elapsed)}</span>
                <span>Trace: {selectedDetail.traceId.slice(0, 16)}...</span>
                {selectedDetail.metrics.ttft_ms > 0 && <span>TTFT: {selectedDetail.metrics.ttft_ms}ms</span>}
                {selectedDetail.metrics.tps > 0 && <span>TPS: {selectedDetail.metrics.tps} tok/s</span>}
                {selectedDetail.metrics.tokens_generated > 0 && <span>Tokens: {selectedDetail.metrics.tokens_generated}</span>}
              </div>
            </div>
            <button onClick={() => { setSelectedDetail(null); setSelectedSpanId(null); }} className="p-1 hover:bg-[var(--bg-tertiary)] rounded">
              <X size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Waterfall Timeline */}
          <div className="border border-[var(--border-default)] rounded-[var(--radius-md)] overflow-hidden">
            {/* Time axis header */}
            <div className="flex items-center h-6 px-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-muted)] text-[10px] text-[var(--text-muted)]">
              <span className="w-[180px] shrink-0">Span</span>
              <div className="flex-1 flex justify-between">
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                  <span key={pct}>{formatDuration(Math.round(selectedDetail.elapsed * pct))}</span>
                ))}
              </div>
            </div>

            {/* Root span */}
            <div
              className={cn(
                'flex items-center h-8 px-3 border-b border-[var(--border-muted)] cursor-pointer transition-colors',
                'hover:bg-[var(--bg-tertiary)]',
              )}
            >
              <span className="w-[180px] shrink-0 text-[11px] font-medium text-[var(--text-primary)] truncate">
                {selectedDetail.service}.pipeline
              </span>
              <div className="flex-1 relative h-4">
                <div
                  className="absolute h-full rounded-sm opacity-30"
                  style={{ left: 0, width: '100%', backgroundColor: '#8B949E' }}
                />
              </div>
            </div>

            {/* Child spans */}
            {selectedDetail.spans.map((span) => {
              const leftPct = (span.startOffset / selectedDetail.elapsed) * 100;
              const widthPct = Math.max((span.duration / selectedDetail.elapsed) * 100, 0.5);
              const color = span.status === 'error' ? '#E74C3C' : (SPAN_COLORS[span.name] ?? '#95A5A6');
              const isSelected = selectedSpanId === span.spanId;

              return (
                <div
                  key={span.spanId}
                  onClick={() => setSelectedSpanId(isSelected ? null : span.spanId)}
                  className={cn(
                    'flex items-center h-8 px-3 border-b border-[var(--border-muted)] cursor-pointer transition-colors',
                    isSelected ? 'bg-[var(--accent-primary)]/10' : 'hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  <span className="w-[180px] shrink-0 text-[11px] text-[var(--text-secondary)] truncate pl-4">
                    {span.name.replace('rag.', '')}
                    <span className="ml-1 text-[var(--text-muted)]">{formatDuration(span.duration)}</span>
                  </span>
                  <div className="flex-1 relative h-4">
                    <div
                      className="absolute h-full rounded-sm transition-opacity hover:opacity-100"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        opacity: isSelected ? 1 : 0.8,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Span attributes */}
          {selectedSpan && (
            <div className="mt-3 pt-3 border-t border-[var(--border-muted)]">
              <div className="text-[10px] text-[var(--text-muted)] mb-2">
                Span: <strong className="text-[var(--text-primary)]">{selectedSpan.name}</strong>
                <span className="ml-2">Duration: {formatDuration(selectedSpan.duration)}</span>
                <span className="ml-2">Offset: +{formatDuration(selectedSpan.startOffset)}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                  <div key={key} className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                    <div className="text-[10px] text-[var(--text-muted)]">{key}</div>
                    <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
