'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, SearchInput, Select, Badge, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { generateLogEntries, getLogPatterns } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { formatDuration, getRelativeTime } from '@/lib/utils';
import type { LogEntry, LogLevel, LogPattern } from '@/types/monitoring';
import {
  FileText,
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Filter,
} from 'lucide-react';

const VIEW_TABS = [
  { id: 'stream', label: 'Log Stream', icon: <FileText size={13} /> },
  { id: 'patterns', label: 'Patterns', icon: <Layers size={13} /> },
];

const SERVICE_OPTIONS = [
  { label: 'All Services', value: 'all' },
  { label: 'api-gateway', value: 'api-gateway' },
  { label: 'rag-service', value: 'rag-service' },
  { label: 'embedding-service', value: 'embedding-service' },
  { label: 'auth-service', value: 'auth-service' },
  { label: 'qdrant', value: 'qdrant' },
];

const LEVEL_OPTIONS: { id: string; label: string; color: string }[] = [
  { id: 'all', label: 'All', color: '' },
  { id: 'DEBUG', label: 'DEBUG', color: 'text-[var(--text-muted)]' },
  { id: 'INFO', label: 'INFO', color: 'text-[var(--status-info)]' },
  { id: 'WARN', label: 'WARN', color: 'text-[var(--status-warning)]' },
  { id: 'ERROR', label: 'ERROR', color: 'text-[var(--status-critical)]' },
  { id: 'FATAL', label: 'FATAL', color: 'text-[#FF0000]' },
];

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: 'text-[var(--text-muted)]',
  INFO: 'text-[var(--status-info)]',
  WARN: 'text-[var(--status-warning)]',
  ERROR: 'text-[var(--status-critical)]',
  FATAL: 'text-[#FF0000]',
};

const LEVEL_BG: Record<LogLevel, string> = {
  DEBUG: '',
  INFO: '',
  WARN: 'bg-[var(--status-warning)]/5',
  ERROR: 'bg-[var(--status-critical)]/5',
  FATAL: 'bg-[#FF0000]/10',
};

export default function LogsPage() {
  const [viewMode, setViewMode] = useState('stream');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Build API query path with filters
  const logApiPath = useMemo(() => {
    const params = new URLSearchParams({ limit: '300' });
    if (serviceFilter !== 'all') params.set('service', serviceFilter);
    if (levelFilter !== 'all') params.set('level', levelFilter);
    if (searchQuery) params.set('query', searchQuery);
    return `/logs?${params.toString()}`;
  }, [serviceFilter, levelFilter, searchQuery]);

  const demoLogsFallback = useCallback(
    () => generateLogEntries(300, {
      service: serviceFilter !== 'all' ? serviceFilter : undefined,
      level: levelFilter !== 'all' ? levelFilter : undefined,
      search: searchQuery || undefined,
    }),
    [serviceFilter, levelFilter, searchQuery],
  );

  const { data: logs, source } = useDataSource<LogEntry[]>(
    logApiPath,
    demoLogsFallback,
    { refreshInterval: 15_000, transform: (raw) => (raw as { items?: LogEntry[] }).items ?? raw as LogEntry[] },
  );

  const logList = logs ?? [];

  const sortedLogs = useMemo(() => {
    if (sortDir === 'asc') return [...logList].reverse();
    return logList;
  }, [logList, sortDir]);

  const demoPatterns = useCallback(() => getLogPatterns(), []);
  const { data: patterns } = useDataSource<LogPattern[]>(
    '/logs/patterns',
    demoPatterns,
    { refreshInterval: 60_000, transform: (raw) => (raw as { items?: LogPattern[] }).items ?? raw as LogPattern[] },
  );
  const patternList = patterns ?? [];

  // Stats
  const stats = useMemo(() => {
    const total = logList.length;
    const errors = logList.filter((l) => l.level === 'ERROR' || l.level === 'FATAL').length;
    const warns = logList.filter((l) => l.level === 'WARN').length;
    const withTrace = logList.filter((l) => l.traceId).length;
    return { total, errors, warns, withTrace };
  }, [logList]);

  // Volume chart — log count per time bucket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeOption = useMemo<any>(() => {
    if (logList.length === 0) return { series: [] };
    const minT = Math.min(...logList.map((l) => l.timestamp));
    const maxT = Math.max(...logList.map((l) => l.timestamp));
    const buckets = 40;
    const width = (maxT - minT) / buckets || 1;

    const infoCounts: [number, number][] = [];
    const warnCounts: [number, number][] = [];
    const errorCounts: [number, number][] = [];

    for (let i = 0; i < buckets; i++) {
      const t = minT + i * width;
      const tEnd = t + width;
      const inBucket = logList.filter((l) => l.timestamp >= t && l.timestamp < tEnd);
      infoCounts.push([t, inBucket.filter((l) => l.level === 'INFO' || l.level === 'DEBUG').length]);
      warnCounts.push([t, inBucket.filter((l) => l.level === 'WARN').length]);
      errorCounts.push([t, inBucket.filter((l) => l.level === 'ERROR' || l.level === 'FATAL').length]);
    }

    return {
      animation: false,
      xAxis: { type: 'time' },
      yAxis: { type: 'value', name: 'count', nameTextStyle: { color: '#8B949E', fontSize: 10 } },
      series: [
        { name: 'Info', type: 'bar', stack: 'total', data: infoCounts, itemStyle: { color: '#58A6FF' }, barWidth: '80%' },
        { name: 'Warn', type: 'bar', stack: 'total', data: warnCounts, itemStyle: { color: '#D29922' }, barWidth: '80%' },
        { name: 'Error', type: 'bar', stack: 'total', data: errorCounts, itemStyle: { color: '#F85149' }, barWidth: '80%' },
      ],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { show: true, bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 10 } },
      grid: { left: 48, right: 16, top: 16, bottom: 36 },
    };
  }, [logList]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions);
  };

  return (
    <div className="space-y-3">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Logs', icon: <FileText size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Log Explorer</h1>
          <DataSourceBadge source={source} />
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>Total: <strong className="text-[var(--text-primary)]">{stats.total}</strong></span>
          <span>Errors: <strong className="text-[var(--status-critical)]">{stats.errors}</strong></span>
          <span>Warnings: <strong className="text-[var(--status-warning)]">{stats.warns}</strong></span>
          <span>With Trace: <strong className="text-[var(--accent-primary)]">{stats.withTrace}</strong></span>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            placeholder='Search logs... (e.g. "error" or "trace_id=abc")'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <Select
          options={SERVICE_OPTIONS}
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-[var(--text-muted)]" />
          {LEVEL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setLevelFilter(opt.id)}
              className={cn(
                'px-2 py-1 text-[11px] font-medium rounded-[var(--radius-sm)] transition-colors',
                levelFilter === opt.id
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  : cn('hover:bg-[var(--bg-tertiary)]', opt.color || 'text-[var(--text-secondary)]'),
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Tabs tabs={VIEW_TABS} activeTab={viewMode} onChange={setViewMode} variant="pill" />
        </div>
      </div>

      {/* Volume Chart */}
      <Card>
        <CardHeader><CardTitle>Log Volume</CardTitle></CardHeader>
        <EChartsWrapper option={volumeOption} height={120} />
      </Card>

      {/* ── Stream View ── */}
      {viewMode === 'stream' && (
        <Card padding="none">
          {/* Sort control */}
          <div className="px-4 py-2 border-b border-[var(--border-default)] flex items-center justify-between">
            <button
              onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Timestamp {sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
            <span className="text-[10px] text-[var(--text-muted)]">
              Showing {sortedLogs.length} entries
            </span>
          </div>

          {/* Log entries */}
          <div className="divide-y divide-[var(--border-muted)] max-h-[600px] overflow-y-auto">
            {sortedLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className={cn(LEVEL_BG[log.level])}>
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="px-4 py-2 hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors flex items-start gap-2"
                  >
                    <ChevronRight
                      size={12}
                      className={cn(
                        'mt-1 shrink-0 text-[var(--text-muted)] transition-transform',
                        isExpanded && 'rotate-90',
                      )}
                    />
                    <span className="font-mono text-[12px] leading-relaxed flex-1 min-w-0">
                      <span className="text-[var(--text-muted)]">{formatTimestamp(log.timestamp)}</span>
                      {' '}
                      <span className={cn('font-semibold', LEVEL_COLORS[log.level])}>{log.level.padEnd(5)}</span>
                      {' '}
                      <span className="text-[var(--accent-primary)]">[{log.service}]</span>
                      {' '}
                      <span className="text-[var(--text-primary)]">{log.message}</span>
                    </span>
                    {log.traceId && (
                      <Link
                        href={`/traces/${log.traceId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 flex items-center gap-0.5 text-[10px] text-[var(--accent-primary)] hover:underline mt-0.5"
                      >
                        <ExternalLink size={9} />
                        trace
                      </Link>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 ml-6 space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                          <div className="text-[10px] text-[var(--text-muted)]">Service</div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">{log.service}</div>
                        </div>
                        <div className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                          <div className="text-[10px] text-[var(--text-muted)]">Hostname</div>
                          <Link href={`/infra/${log.hostname}`} className="text-xs font-medium text-[var(--accent-primary)] hover:underline">
                            {log.hostname}
                          </Link>
                        </div>
                        <div className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                          <div className="text-[10px] text-[var(--text-muted)]">Level</div>
                          <div className={cn('text-xs font-semibold', LEVEL_COLORS[log.level])}>{log.level}</div>
                        </div>
                        <div className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                          <div className="text-[10px] text-[var(--text-muted)]">Timestamp</div>
                          <div className="text-xs font-mono text-[var(--text-primary)]">{new Date(log.timestamp).toISOString()}</div>
                        </div>
                      </div>

                      {log.traceId && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-[var(--text-muted)]">Trace ID:</span>
                            <Link href={`/traces/${log.traceId}`} className="font-mono text-[var(--accent-primary)] hover:underline">
                              {log.traceId}
                            </Link>
                            <button onClick={() => copyId(log.traceId!)} className="p-0.5 hover:bg-[var(--bg-overlay)] rounded">
                              {copiedId === log.traceId ? <Check size={11} className="text-[var(--status-healthy)]" /> : <Copy size={11} className="text-[var(--text-muted)]" />}
                            </button>
                          </div>
                          {log.spanId && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-[var(--text-muted)]">Span ID:</span>
                              <span className="font-mono text-[var(--text-secondary)]">{log.spanId}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {Object.keys(log.attributes).length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {Object.entries(log.attributes).map(([key, value]) => (
                            <span key={key} className="px-1.5 py-0.5 bg-[var(--bg-overlay)] rounded text-[10px] font-mono text-[var(--text-secondary)]">
                              {key}={String(value)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-xs">
                        <span className="text-[var(--text-muted)]">Full message:</span>
                        <pre className="mt-1 p-2 bg-[var(--bg-primary)] rounded-[var(--radius-sm)] font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-all">
                          {log.message}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {sortedLogs.length === 0 && (
            <div className="text-center py-16 text-sm text-[var(--text-muted)]">No logs match your filters.</div>
          )}
        </Card>
      )}

      {/* ── Patterns View ── */}
      {viewMode === 'patterns' && (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
            <span className="text-xs font-medium text-[var(--text-primary)]">
              Log Patterns ({patternList.length} patterns detected)
            </span>
            <span className="ml-2 text-[10px] text-[var(--text-muted)]">
              Auto-grouped by message similarity
            </span>
          </div>
          <div className="divide-y divide-[var(--border-muted)]">
            {patternList.map((p) => (
              <div key={p.id} className="px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-[10px] font-bold', LEVEL_COLORS[p.level])}>{p.level}</span>
                      <span className="font-mono text-xs text-[var(--text-primary)]">{p.pattern}</span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-muted)] truncate">{p.sample}</div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                      <span>Services: {p.services.join(', ')}</span>
                      <span>First: {getRelativeTime(new Date(p.firstSeen))}</span>
                      <span>Last: {getRelativeTime(new Date(p.lastSeen))}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">{p.count.toLocaleString()}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">occurrences</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
