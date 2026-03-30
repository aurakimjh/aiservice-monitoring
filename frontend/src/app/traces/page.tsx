'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, DataSourceBadge } from '@/components/ui';
import { EChartsWrapper } from '@/components/charts';
import { generateTransactions } from '@/lib/demo-data';
import { useDataSource, type DataSource } from '@/hooks/use-data-source';
import { formatDuration } from '@/lib/utils';
import type { Transaction, TransactionStatus } from '@/types/monitoring';
import { TimeRangePicker } from '@/components/monitoring/time-range-picker';
import { TimeRangeArrows, type TimeRange } from '@/components/monitoring/time-range-arrows';
import { ServerMultiSelector, type ServerOption } from '@/components/monitoring/server-multi-selector';
import {
  Route,
  Activity,
  Grid3x3,
  LayoutPanelLeft,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  Settings2,
} from 'lucide-react';

// ── Constants ──

const SERVER_PALETTE = [
  '#4A90D9', '#2ECC71', '#9B59B6', '#E67E22',
  '#1ABC9C', '#E74C3C', '#3498DB', '#F39C12',
];

const DEMO_SERVERS: ServerOption[] = [
  { id: 'prod-api-01', label: 'prod-api-01' },
  { id: 'prod-api-02', label: 'prod-api-02' },
  { id: 'prod-gpu-01', label: 'prod-gpu-01' },
  { id: 'prod-gpu-02', label: 'prod-gpu-02' },
  { id: 'staging-api-01', label: 'staging-api-01' },
  { id: 'staging-gpu-01', label: 'staging-gpu-01' },
];

// ── Jaeger → Transaction transform ──

function classifyStatus(elapsed: number, statusCode: number): TransactionStatus {
  if (statusCode >= 500) return 'error';
  if (elapsed >= 3000) return 'very_slow';
  if (elapsed >= 1000) return 'slow';
  return 'normal';
}

// v2 API transform: /api/v2/services → ServerOption[]
function transformV2Services(raw: unknown): ServerOption[] {
  const resp = raw as { services?: Array<{ name: string }> };
  if (!resp.services?.length) return [];
  return resp.services.map((s) => ({ id: s.name, label: s.name }));
}

interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  startTime: number; // microseconds
  duration: number; // microseconds
  references?: Array<{ refType: string; traceID: string; spanID: string }>;
  tags?: Array<{ key: string; type: string; value: unknown }>;
  process?: { serviceName: string };
}

interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
}

// v2 API transform: /api/v2/traces → Transaction[]
interface V2Trace {
  traceId: string;
  serviceName: string;
  rootName: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  statusCode: number;
  spanCount: number;
  source: string;
}

function transformV2Traces(raw: unknown): Transaction[] {
  const resp = raw as { traces?: V2Trace[] };
  if (!resp.traces?.length) return [];

  return resp.traces.map((trace) => {
    const elapsed = Math.round(trace.durationMs);
    const timestamp = new Date(trace.startTime).getTime();
    const statusCode = trace.statusCode === 2 ? 500 : 200;

    return {
      traceId: trace.traceId,
      rootSpanId: trace.traceId.slice(0, 16),
      timestamp,
      elapsed,
      service: trace.serviceName ?? 'unknown',
      endpoint: trace.rootName ?? '',
      status: classifyStatus(elapsed, statusCode),
      statusCode,
      metrics: { ttft_ms: 0, tps: 0, tokens_generated: 0, guardrail_action: 'PASS' as const },
      spans: [],
    };
  });
}

const VIEW_TABS = [
  { id: 'xlog', label: 'XLog', icon: <Activity size={12} /> },
  { id: 'heatmap', label: 'HeatMap', icon: <Grid3x3 size={12} /> },
  { id: 'split', label: '분할', icon: <LayoutPanelLeft size={12} /> },
] as const;

type ViewMode = 'xlog' | 'heatmap' | 'split';

const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'normal', label: 'Normal' },
  { id: 'slow', label: 'Slow' },
  { id: 'very_slow', label: 'Very Slow' },
  { id: 'error', label: 'Error' },
];

const STATUS_DOT_COLOR: Record<TransactionStatus, string> = {
  normal: '#4A90D9',
  slow: '#F5A623',
  very_slow: '#E8601C',
  error: '#D0021B',
};

const SPAN_COLORS: Record<string, string> = {
  'rag.guardrail_input_check': '#9B59B6',
  'rag.guardrail_output_check': '#9B59B6',
  'rag.embedding': '#3498DB',
  'rag.vector_search': '#2ECC71',
  'rag.llm_inference': '#E67E22',
};

const LATENCY_BUCKETS = ['0-100', '100-300', '300-500', '500-1K', '1K-2K', '2K-3K', '3K+'];
const LATENCY_RANGES: [number, number][] = [
  [0, 100], [100, 300], [300, 500], [500, 1000],
  [1000, 2000], [2000, 3000], [3000, Infinity],
];

// ── Types ──

interface TxnWithServer extends Transaction {
  serverId: string;
}

// ── Page ──

export default function TracesPage() {
  // ── Time range ──
  const [range, setRange] = useState<TimeRange>(() => {
    const to = Date.now();
    return { from: to - 15 * 60_000, to };
  });
  const [isLive, setIsLive] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  // ── Services (v2 API — AITOP Trace Engine) ──
  const demoServicesFallback = useCallback(() => DEMO_SERVERS, []);
  const { data: jaegerServices, source: svcSource } = useDataSource<ServerOption[]>(
    '/api/v2/services',
    demoServicesFallback,
    { refreshInterval: 60_000, transform: transformV2Services },
  );
  const availableServers = jaegerServices ?? DEMO_SERVERS;
  const dataSource: DataSource = svcSource;

  // Auto-select first server when available
  useEffect(() => {
    if (selectedServers.length === 0 && availableServers.length > 0) {
      setSelectedServers([availableServers[0].id]);
    }
  }, [availableServers]);

  // ── Server selection (empty = use first from availableServers) ──
  const [selectedServers, setSelectedServers] = useState<string[]>([]);

  // ── View + filter state ──
  const [viewMode, setViewMode] = useState<ViewMode>('xlog');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTxns, setSelectedTxns] = useState<Transaction[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<Transaction | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listSortBy, setListSortBy] = useState<'elapsed' | 'timestamp'>('elapsed');
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('desc');

  // Refs for heatmap brush handler access
  const hmDataRef = useRef<[number, number, number][]>([]);
  const hmBoundsRef = useRef({ minT: 0, bucketWidth: 1 });

  // ── Live mode auto-advance ──
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      setRange((prev) => {
        const width = prev.to - prev.from;
        const to = Date.now();
        return { from: to - width, to };
      });
    }, 5_000);
    return () => clearInterval(id);
  }, [isLive]);

  const handleRangeChange = (r: TimeRange) => {
    setIsLive(false);
    setRange(r);
  };

  const handleToggleLive = () => {
    setIsLive((v) => {
      if (!v) {
        // Re-enable live: snap to now
        const to = Date.now();
        setRange((prev) => ({ from: to - (prev.to - prev.from), to }));
      }
      return !v;
    });
  };

  // ── Server color map ──
  const serverColors = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    availableServers.forEach((srv, idx) => {
      map[srv.id] = SERVER_PALETTE[idx % SERVER_PALETTE.length];
    });
    return map;
  }, [availableServers]);

  // ── Traces (v2 API — AITOP Trace Engine) ──
  const jaegerQuery = selectedServers.length > 0 ? selectedServers[0] : '';
  const v2TracesPath = jaegerQuery
    ? `/api/v2/traces?service=${encodeURIComponent(jaegerQuery)}&limit=200&from=${range.from}&to=${range.to}`
    : '';

  const demoTxnFallback = useCallback(() => [] as Transaction[], []);
  const { data: jaegerTxns, source: txnSource } = useDataSource<Transaction[]>(
    v2TracesPath || '/api/v2/traces?limit=0',
    demoTxnFallback,
    { transform: transformV2Traces },
  );

  // ── Transaction generation (real data or demo) ──
  const allTransactions = useMemo<TxnWithServer[]>(() => {
    // Use Jaeger real data if available and non-empty
    if (jaegerTxns && jaegerTxns.length > 0) {
      return jaegerTxns.map((t) => ({
        ...t,
        serverId: t.service,
      }));
    }

    // Demo fallback: always generate transactions when Jaeger has no data
    const rangeMs = range.to - range.from;
    const count = Math.max(100, Math.min(600, Math.round(rangeMs / 3_000)));
    const raw = generateTransactions(count);

    const minTs = Math.min(...raw.map((t) => t.timestamp));
    const maxTs = Math.max(...raw.map((t) => t.timestamp));
    const span = (maxTs - minTs) || 1;

    return raw.map((t, i) => ({
      ...t,
      timestamp: range.from + ((t.timestamp - minTs) / span) * rangeMs,
      serverId: selectedServers.length > 0
        ? selectedServers[i % selectedServers.length]
        : DEMO_SERVERS[i % DEMO_SERVERS.length].id,
    }));
  }, [range.from, range.to, selectedServers, jaegerTxns, txnSource]);

  const filteredTransactions = useMemo<TxnWithServer[]>(() => {
    if (statusFilter === 'all') return allTransactions;
    return allTransactions.filter((t) => t.status === statusFilter);
  }, [allTransactions, statusFilter]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = filteredTransactions.length;
    const errors = filteredTransactions.filter((t) => t.status === 'error').length;
    const slow = filteredTransactions.filter(
      (t) => t.status === 'slow' || t.status === 'very_slow',
    ).length;
    const avgElapsed =
      total > 0
        ? Math.round(filteredTransactions.reduce((s, t) => s + t.elapsed, 0) / total)
        : 0;
    return { total, errors, slow, avgElapsed };
  }, [filteredTransactions]);

  // ── Heatmap data computation ──
  const hmComputed = useMemo(() => {
    const TIME_BUCKETS = 30;
    if (filteredTransactions.length === 0) {
      return { hmData: [], errorDots: [], minT: range.from, bucketWidth: 1 };
    }
    const minT = Math.min(...filteredTransactions.map((t) => t.timestamp));
    const maxT = Math.max(...filteredTransactions.map((t) => t.timestamp));
    const bucketWidth = (maxT - minT) / TIME_BUCKETS || 1;

    const grid: number[][] = Array.from({ length: TIME_BUCKETS }, () =>
      new Array(LATENCY_BUCKETS.length).fill(0),
    );
    const errGrid: number[][] = Array.from({ length: TIME_BUCKETS }, () =>
      new Array(LATENCY_BUCKETS.length).fill(0),
    );

    for (const txn of filteredTransactions) {
      const tIdx = Math.min(
        Math.floor((txn.timestamp - minT) / bucketWidth),
        TIME_BUCKETS - 1,
      );
      let lIdx: number;
      if (txn.elapsed < 100) lIdx = 0;
      else if (txn.elapsed < 300) lIdx = 1;
      else if (txn.elapsed < 500) lIdx = 2;
      else if (txn.elapsed < 1000) lIdx = 3;
      else if (txn.elapsed < 2000) lIdx = 4;
      else if (txn.elapsed < 3000) lIdx = 5;
      else lIdx = 6;

      grid[tIdx][lIdx]++;
      if (txn.status === 'error') errGrid[tIdx][lIdx]++;
    }

    const hmData: [number, number, number][] = [];
    for (let t = 0; t < TIME_BUCKETS; t++) {
      for (let l = 0; l < LATENCY_BUCKETS.length; l++) {
        if (grid[t][l] > 0) hmData.push([t, l, grid[t][l]]);
      }
    }

    // Error dot cells: error ratio >= 10%
    const errorDots: [number, number][] = [];
    for (let t = 0; t < TIME_BUCKETS; t++) {
      for (let l = 0; l < LATENCY_BUCKETS.length; l++) {
        if (grid[t][l] > 0 && errGrid[t][l] / grid[t][l] >= 0.1) {
          errorDots.push([t, l]);
        }
      }
    }

    return { hmData, errorDots, minT, bucketWidth };
  }, [filteredTransactions, range.from]);

  // Sync heatmap data to refs for use in brush handler
  useEffect(() => {
    hmDataRef.current = hmComputed.hmData;
    hmBoundsRef.current = {
      minT: hmComputed.minT,
      bucketWidth: hmComputed.bucketWidth,
    };
  }, [hmComputed]);

  // ── Time axis labels for heatmap ──
  const hmTimeLabels = useMemo(() => {
    const TIME_BUCKETS = 30;
    const { minT, bucketWidth } = hmComputed;
    const p = (n: number) => String(n).padStart(2, '0');
    return Array.from({ length: TIME_BUCKETS }, (_, i) => {
      const d = new Date(minT + i * bucketWidth);
      return `${p(d.getHours())}:${p(d.getMinutes())}`;
    });
  }, [hmComputed]);

  // ── XLog chart option ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xlogOption = useMemo<any>(() => {
    const multiServer = selectedServers.length > 1;

    let series: object[];

    if (multiServer) {
      // One series per server
      const groups: Record<string, [number, number][]> = {};
      for (const id of selectedServers) groups[id] = [];
      for (const txn of filteredTransactions) {
        const sid = txn.serverId;
        if (groups[sid]) groups[sid].push([txn.timestamp, txn.elapsed]);
      }
      series = selectedServers.map((id) => ({
        name: id,
        type: 'scatter',
        data: groups[id],
        symbolSize: 5,
        itemStyle: { color: serverColors[id], opacity: 0.75 },
      }));
    } else {
      // Group by status
      const groups: Record<TransactionStatus, [number, number][]> = {
        normal: [], slow: [], very_slow: [], error: [],
      };
      for (const txn of filteredTransactions) {
        groups[txn.status].push([txn.timestamp, txn.elapsed]);
      }
      series = [
        { name: 'Normal', type: 'scatter', data: groups.normal, symbolSize: 4, itemStyle: { color: STATUS_DOT_COLOR.normal, opacity: 0.6 } },
        { name: 'Slow', type: 'scatter', data: groups.slow, symbolSize: 5, itemStyle: { color: STATUS_DOT_COLOR.slow, opacity: 0.75 } },
        { name: 'Very Slow', type: 'scatter', data: groups.very_slow, symbolSize: 6, itemStyle: { color: STATUS_DOT_COLOR.very_slow, opacity: 0.85 } },
        { name: 'Error', type: 'scatter', data: groups.error, symbolSize: 7, z: 10, itemStyle: { color: STATUS_DOT_COLOR.error, opacity: 0.95, borderColor: '#fff', borderWidth: 1 } },
      ];
    }

    return {
      animation: false,
      xAxis: { type: 'time' },
      yAxis: {
        type: 'value',
        name: 'ms',
        nameTextStyle: { color: '#8B949E', fontSize: 10, padding: [0, 0, 0, -30] },
      },
      series,
      tooltip: {
        trigger: 'item',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          const time = new Date(p.data[0]).toLocaleTimeString();
          return `${p.seriesName}<br/>Response: ${Math.round(p.data[1])}ms<br/>Time: ${time}`;
        },
      },
      legend: {
        show: true,
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 10, color: '#8B949E' },
      },
      grid: { left: 52, right: 16, top: 16, bottom: 48 },
      dataZoom: [{ type: 'slider', height: 14, bottom: 34 }],
      toolbox: {
        feature: { brush: { title: { rect: 'Box Select', clear: 'Clear' } } },
        right: 16,
        top: 0,
      },
      brush: {
        toolbox: ['rect', 'clear'],
        xAxisIndex: 0,
        brushType: 'rect',
        brushMode: 'single',
        brushStyle: {
          borderWidth: 1,
          color: 'rgba(74,144,217,0.15)',
          borderColor: 'rgba(74,144,217,0.5)',
        },
      },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          { yAxis: 1000, lineStyle: { color: STATUS_DOT_COLOR.slow, type: 'dashed', width: 1 }, label: { formatter: '1s', color: STATUS_DOT_COLOR.slow, fontSize: 10 } },
          { yAxis: 3000, lineStyle: { color: STATUS_DOT_COLOR.error, type: 'dashed', width: 1 }, label: { formatter: '3s', color: STATUS_DOT_COLOR.error, fontSize: 10 } },
        ],
      },
    };
  }, [filteredTransactions, selectedServers, serverColors]);

  // ── HeatMap chart option (WhaTap style) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapOption = useMemo<any>(() => {
    const { hmData, errorDots } = hmComputed;
    return {
      animation: false,
      xAxis: {
        type: 'category',
        data: hmTimeLabels,
        axisLabel: { interval: 4, fontSize: 10, color: '#8B949E' },
      },
      yAxis: {
        type: 'category',
        data: LATENCY_BUCKETS,
        axisLabel: { fontSize: 10, color: '#8B949E' },
      },
      // 4-stage WhaTap gradient (piecewise)
      visualMap: {
        type: 'piecewise',
        pieces: [
          { min: 1, max: 10, color: '#B3D9FF', label: '1~10' },
          { min: 11, max: 50, color: '#4A90D9', label: '11~50' },
          { min: 51, max: 200, color: '#F5A623', label: '51~200' },
          { min: 201, color: '#D0021B', label: '201+' },
        ],
        outOfRange: { color: 'transparent' },
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { color: '#8B949E', fontSize: 10 },
      },
      series: [
        // Main heatmap
        {
          name: 'Transactions',
          type: 'heatmap',
          data: hmData,
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' } },
          itemStyle: { borderColor: '#0D1117', borderWidth: 0.5 },
        },
        // Error dot overlay (red scatter on error cells)
        {
          name: 'Errors',
          type: 'scatter',
          data: errorDots,
          symbolSize: 6,
          z: 10,
          itemStyle: { color: '#D0021B', opacity: 0.9 },
          tooltip: {
            formatter: 'Error cluster',
          },
        },
      ],
      tooltip: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          if (p.seriesName === 'Errors') {
            return `<strong>에러 집중 구간</strong>`;
          }
          const bucket = LATENCY_BUCKETS[p.data[1]] ?? '';
          return `${hmTimeLabels[p.data[0]] ?? ''} | ${bucket}ms<br/>${p.data[2]} 트랜잭션`;
        },
      },
      grid: { left: 60, right: 16, top: 8, bottom: 64 },
      brush: {
        toolbox: ['rect', 'clear'],
        brushType: 'rect',
        brushMode: 'single',
        brushStyle: {
          borderWidth: 1,
          color: 'rgba(74,144,217,0.15)',
          borderColor: 'rgba(74,144,217,0.5)',
        },
      },
      toolbox: {
        feature: { brush: { title: { rect: 'Drag Select', clear: 'Clear' } } },
        right: 16,
        top: 0,
      },
    };
  }, [hmComputed, hmTimeLabels]);

  // ── Chart event handlers ──

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleXLogInit = useCallback((chart: any) => {
    chart.on(
      'brushSelected',
      (params: { batch?: { selected?: { dataIndex?: number[] }[] }[] }) => {
        const batch = params.batch;
        if (!batch || batch.length === 0) return;

        const groups: TxnWithServer[][] = [[], [], [], []];
        for (const txn of filteredTransactions) {
          const idx =
            txn.status === 'normal' ? 0
            : txn.status === 'slow' ? 1
            : txn.status === 'very_slow' ? 2
            : 3;
          groups[idx].push(txn);
        }

        const selected: TxnWithServer[] = [];
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
      },
    );

    // Activate brush tool by default
    chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.on('click', (params: { data?: any }) => {
      if (!params.data) return;
      const [ts, elapsed] = Array.isArray(params.data) ? params.data : [0, 0];
      const match = filteredTransactions.find(
        (t) => Math.abs(t.timestamp - ts) < 200 && Math.abs(t.elapsed - elapsed) < 5,
      );
      if (match) {
        setSelectedTxns([match]);
        setSelectedDetail(match);
      }
    });
  }, [filteredTransactions]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHeatmapInit = useCallback((chart: any) => {
    // Activate brush tool by default
    chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } });
    // Cell click → filter transactions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.on('click', (params: { seriesName?: string; data?: any }) => {
      if (params.seriesName === 'Errors') return; // skip error dot clicks
      if (!params.data) return;
      const [tIdx, lIdx] = Array.isArray(params.data) ? params.data : [0, 0];
      const { minT, bucketWidth } = hmBoundsRef.current;
      const tStart = minT + tIdx * bucketWidth;
      const tEnd = tStart + bucketWidth;
      const [lMin, lMax] = LATENCY_RANGES[lIdx] ?? [0, Infinity];
      const matches = filteredTransactions.filter(
        (t) =>
          t.timestamp >= tStart &&
          t.timestamp < tEnd &&
          t.elapsed >= lMin &&
          t.elapsed < lMax,
      );
      if (matches.length > 0) {
        setSelectedTxns(matches);
        setSelectedDetail(null);
      }
    });

    // Brush drag → filter transactions
    chart.on(
      'brushSelected',
      (params: { batch?: { selected?: { dataIndex?: number[] }[] }[] }) => {
        const batch = params.batch;
        if (!batch || batch.length === 0) return;
        const { minT, bucketWidth } = hmBoundsRef.current;
        const currentHmData = hmDataRef.current;

        const selectedIndices = new Set<number>();
        for (const b of batch) {
          if (!b.selected || b.selected.length === 0) continue;
          // Series 0 = heatmap data
          const mainSel = b.selected[0];
          if (mainSel?.dataIndex) {
            for (const idx of mainSel.dataIndex) selectedIndices.add(idx);
          }
        }
        if (selectedIndices.size === 0) return;

        const cells = [...selectedIndices].map((i) => currentHmData[i]).filter(Boolean);
        if (cells.length === 0) return;

        const tIdxMin = Math.min(...cells.map((c) => c[0]));
        const tIdxMax = Math.max(...cells.map((c) => c[0]));
        const lIdxMin = Math.min(...cells.map((c) => c[1]));
        const lIdxMax = Math.max(...cells.map((c) => c[1]));

        const tStart = minT + tIdxMin * bucketWidth;
        const tEnd = minT + (tIdxMax + 1) * bucketWidth;
        const [lMin] = LATENCY_RANGES[lIdxMin] ?? [0, Infinity];
        const [, lMax] = LATENCY_RANGES[lIdxMax] ?? [0, Infinity];

        const matches = filteredTransactions.filter(
          (t) =>
            t.timestamp >= tStart &&
            t.timestamp < tEnd &&
            t.elapsed >= lMin &&
            t.elapsed < lMax,
        );
        if (matches.length > 0) {
          setSelectedTxns(matches);
          setSelectedDetail(null);
        }
      },
    );
  }, [filteredTransactions]);

  // ── Sort + helpers ──

  const sortedSelected = useMemo(() => {
    const sorted = [...selectedTxns];
    sorted.sort((a, b) => {
      const cmp =
        listSortBy === 'elapsed'
          ? a.elapsed - b.elapsed
          : a.timestamp - b.timestamp;
      return listSortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [selectedTxns, listSortBy, listSortDir]);

  const handleListSort = (col: typeof listSortBy) => {
    if (listSortBy === col) setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setListSortBy(col); setListSortDir('desc'); }
  };

  const sortIcon = (col: typeof listSortBy) =>
    listSortBy === col
      ? listSortDir === 'asc'
        ? <ChevronUp size={11} className="inline" />
        : <ChevronDown size={11} className="inline" />
      : null;

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

  // Chart height based on layout
  const chartH = selectedTxns.length > 0 ? 260 : 340;

  return (
    <div className="space-y-3">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Traces', icon: <Route size={14} /> },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">XLog / HeatMap</h1>
          <DataSourceBadge source={dataSource} />
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>Total: <strong className="text-[var(--text-primary)]">{stats.total}</strong></span>
          <span>Avg: <strong className="text-[var(--text-primary)]">{formatDuration(stats.avgElapsed)}</strong></span>
          <span>Slow: <strong className="text-[var(--status-warning)]">{stats.slow}</strong></span>
          <span>Error: <strong className="text-[var(--status-critical)]">{stats.errors}</strong></span>
        </div>
      </div>

      {/* Time range + server toolbar */}
      <Card padding="sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Server multi-selector */}
          <ServerMultiSelector
            servers={availableServers}
            selected={selectedServers}
            serverColors={serverColors}
            onChange={(s) => { setSelectedServers(s); clearSelection(); }}
          />

          <div className="w-px h-5 bg-[var(--border-default)] mx-1 shrink-0" />

          {/* Compact time range arrows */}
          <TimeRangeArrows
            range={range}
            isLive={isLive}
            onRangeChange={handleRangeChange}
            onToggleLive={handleToggleLive}
          />

          {/* Expand picker toggle */}
          <button
            onClick={() => setShowPicker((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded transition-colors',
              showPicker
                ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]',
            )}
            title="상세 시간 범위 설정"
          >
            <Settings2 size={11} />
            상세
          </button>
        </div>

        {/* Expanded picker */}
        {showPicker && (
          <div className="mt-2 pt-2 border-t border-[var(--border-muted)]">
            <TimeRangePicker
              range={range}
              isLive={isLive}
              onRangeChange={handleRangeChange}
              onToggleLive={handleToggleLive}
            />
          </div>
        )}
      </Card>

      {/* Filter + view mode toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
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

        <div className="ml-auto flex items-center gap-0.5 p-0.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)]">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setViewMode(tab.id); clearSelection(); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all',
                viewMode === tab.id
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart Panel ── */}
      {viewMode === 'split' ? (
        /* Split view: XLog + HeatMap side by side */
        <div className="grid grid-cols-2 gap-3">
          <Card padding="none">
            <CardHeader className="px-4 pt-3 pb-0">
              <CardTitle className="text-xs" helpId="chart-xlog-scatter">XLog 산점도</CardTitle>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span className="text-[10px]">시간 동기화 ON</span>
              </div>
            </CardHeader>
            <EChartsWrapper
              option={xlogOption}
              height={chartH}
              onInit={handleXLogInit}
            />
          </Card>
          <Card padding="none">
            <CardHeader className="px-4 pt-3 pb-0">
              <CardTitle className="text-xs" helpId="chart-heatmap">응답시간 HeatMap</CardTitle>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-0.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D0021B' }} />
                  에러 구간
                </span>
              </div>
            </CardHeader>
            <EChartsWrapper
              option={heatmapOption}
              height={chartH}
              onInit={handleHeatmapInit}
            />
          </Card>
        </div>
      ) : (
        /* Single view: XLog or HeatMap */
        <Card padding="none">
          <CardHeader className="px-4 pt-3 pb-0">
            <CardTitle helpId={viewMode === 'xlog' ? 'chart-xlog-scatter' : 'chart-heatmap'}>
              {viewMode === 'xlog' ? 'XLog 산점도' : '응답시간 HeatMap (WhaTap 스타일)'}
            </CardTitle>
            {viewMode === 'xlog' ? (
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                {selectedServers.length > 1
                  ? selectedServers.map((id) => (
                      <span key={id} className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: serverColors[id] }}
                        />
                        {id}
                      </span>
                    ))
                  : Object.entries(STATUS_DOT_COLOR).map(([status, color]) => (
                      <span key={status} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        {status}
                      </span>
                    ))}
                <span className="ml-2 text-[var(--text-muted)]">브러쉬 도구로 영역 선택</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                {[
                  { color: '#B3D9FF', label: '1~10' },
                  { color: '#4A90D9', label: '11~50' },
                  { color: '#F5A623', label: '51~200' },
                  { color: '#D0021B', label: '201+' },
                ].map((item) => (
                  <span key={item.label} className="flex items-center gap-1">
                    <span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    {item.label}건
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D0021B' }} />
                  에러 점
                </span>
                <span className="ml-1">드래그로 범위 선택</span>
              </div>
            )}
          </CardHeader>
          {viewMode === 'xlog' ? (
            <EChartsWrapper
              option={xlogOption}
              height={selectedTxns.length > 0 ? 280 : 380}
              onInit={handleXLogInit}
            />
          ) : (
            <EChartsWrapper
              option={heatmapOption}
              height={selectedTxns.length > 0 ? 280 : 380}
              onInit={handleHeatmapInit}
            />
          )}
        </Card>
      )}

      {/* ── Transaction List Panel ── */}
      {selectedTxns.length > 0 && (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-[var(--text-primary)]">
                {selectedTxns.length}건 선택됨
              </span>
              {selectedTxns.length > 1 && (
                <span className="text-[var(--text-muted)]">
                  {formatDuration(Math.min(...selectedTxns.map((t) => t.elapsed)))} ~{' '}
                  {formatDuration(Math.max(...selectedTxns.map((t) => t.elapsed)))}
                </span>
              )}
            </div>
            <button
              onClick={clearSelection}
              className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
            >
              <X size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>
          <div className="overflow-x-auto max-h-[240px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-3 py-2 font-medium w-6" />
                  <th className="px-3 py-2 font-medium">Endpoint</th>
                  <th
                    className="px-3 py-2 font-medium text-right cursor-pointer select-none hover:text-[var(--text-secondary)]"
                    onClick={() => handleListSort('elapsed')}
                  >
                    Response {sortIcon('elapsed')}
                  </th>
                  <th className="px-3 py-2 font-medium text-right">TTFT</th>
                  <th className="px-3 py-2 font-medium text-right">TPS</th>
                  <th
                    className="px-3 py-2 font-medium cursor-pointer select-none hover:text-[var(--text-secondary)]"
                    onClick={() => handleListSort('timestamp')}
                  >
                    Time {sortIcon('timestamp')}
                  </th>
                  <th className="px-3 py-2 font-medium text-center">Guard</th>
                  {selectedServers.length > 1 && (
                    <th className="px-3 py-2 font-medium">Server</th>
                  )}
                  <th className="px-3 py-2 font-medium">Trace ID</th>
                </tr>
              </thead>
              <tbody>
                {sortedSelected.map((txn) => {
                  const t = txn as TxnWithServer;
                  return (
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
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: STATUS_DOT_COLOR[txn.status] }}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-[var(--text-primary)]">{txn.endpoint}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums font-medium',
                          txn.status === 'error'
                            ? 'text-[var(--status-critical)]'
                            : txn.status === 'very_slow'
                              ? 'text-[#E8601C]'
                              : txn.status === 'slow'
                                ? 'text-[var(--status-warning)]'
                                : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {formatDuration(txn.elapsed)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                        {txn.metrics.ttft_ms > 0 ? `${txn.metrics.ttft_ms}ms` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                        {txn.metrics.tps > 0 ? txn.metrics.tps : '-'}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                        {new Date(txn.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } as any)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {txn.metrics.guardrail_action === 'BLOCK' ? (
                          <span className="text-[var(--status-critical)] font-bold">BLOCK</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">PASS</span>
                        )}
                      </td>
                      {selectedServers.length > 1 && (
                        <td className="px-3 py-2">
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: serverColors[t.serverId] ?? '#8B949E' }}
                          >
                            {t.serverId}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1">
                          <Link
                            href={`/traces/${txn.traceId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[var(--accent-primary)] hover:underline"
                          >
                            {txn.traceId.slice(0, 8)}...
                          </Link>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyTraceId(txn.traceId); }}
                            className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                          >
                            {copiedId === txn.traceId
                              ? <Check size={11} className="text-[var(--status-healthy)]" />
                              : <Copy size={11} className="text-[var(--text-muted)]" />}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Detail Panel — Waterfall ── */}
      {selectedDetail && (
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_DOT_COLOR[selectedDetail.status] }}
                />
                <span className="font-mono text-sm font-medium text-[var(--text-primary)]">
                  {selectedDetail.endpoint}
                </span>
                <Badge variant="tag">{selectedDetail.statusCode}</Badge>
                <Badge
                  variant="status"
                  status={
                    selectedDetail.status === 'error'
                      ? 'critical'
                      : selectedDetail.status === 'normal'
                        ? 'healthy'
                        : 'warning'
                  }
                >
                  {selectedDetail.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                <span>Service: {selectedDetail.service}</span>
                <span>Duration: {formatDuration(selectedDetail.elapsed)}</span>
                <span>Trace: {selectedDetail.traceId.slice(0, 16)}...</span>
                {selectedDetail.metrics.ttft_ms > 0 && (
                  <span>TTFT: {selectedDetail.metrics.ttft_ms}ms</span>
                )}
                {selectedDetail.metrics.tps > 0 && (
                  <span>TPS: {selectedDetail.metrics.tps} tok/s</span>
                )}
                {selectedDetail.metrics.tokens_generated > 0 && (
                  <span>Tokens: {selectedDetail.metrics.tokens_generated}</span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setSelectedDetail(null); setSelectedSpanId(null); }}
            >
              <X size={14} />
            </Button>
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
            <div className="flex items-center h-8 px-3 border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
              <span className="w-[180px] shrink-0 text-[11px] font-medium text-[var(--text-primary)] truncate">
                {selectedDetail.service}.pipeline
              </span>
              <div className="flex-1 relative h-4">
                <div
                  className="absolute h-full rounded-sm"
                  style={{ left: 0, width: '100%', backgroundColor: '#8B949E', opacity: 0.3 }}
                />
              </div>
            </div>

            {/* Child spans */}
            {selectedDetail.spans.map((span) => {
              const leftPct = (span.startOffset / selectedDetail.elapsed) * 100;
              const widthPct = Math.max((span.duration / selectedDetail.elapsed) * 100, 0.5);
              const color =
                span.status === 'error'
                  ? '#E74C3C'
                  : (SPAN_COLORS[span.name] ?? '#95A5A6');
              const isSelected = selectedSpanId === span.spanId;

              return (
                <div
                  key={span.spanId}
                  onClick={() => setSelectedSpanId(isSelected ? null : span.spanId)}
                  className={cn(
                    'flex items-center h-8 px-3 border-b border-[var(--border-muted)] cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-[var(--accent-primary)]/10'
                      : 'hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  <span className="w-[180px] shrink-0 text-[11px] text-[var(--text-secondary)] truncate pl-4">
                    {span.name.replace('rag.', '')}
                    <span className="ml-1 text-[var(--text-muted)]">
                      {formatDuration(span.duration)}
                    </span>
                  </span>
                  <div className="flex-1 relative h-4">
                    <div
                      className="absolute h-full rounded-sm transition-opacity"
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
                Span:{' '}
                <strong className="text-[var(--text-primary)]">{selectedSpan.name}</strong>
                <span className="ml-2">Duration: {formatDuration(selectedSpan.duration)}</span>
                <span className="ml-2">Offset: +{formatDuration(selectedSpan.startOffset)}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                  <div
                    key={key}
                    className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]"
                  >
                    <div className="text-[10px] text-[var(--text-muted)]">{key}</div>
                    <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
                      {String(value)}
                    </div>
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
