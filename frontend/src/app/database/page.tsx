'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, SearchInput, Select, Tabs, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import type { DBInstance, DBSlowQuery, DBLock, DBWaitEvent } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';
import {
  Database,
  Clock,
  Lock,
  AlertTriangle,
  Search,
  Server,
  Activity,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

// ─── Engine badge config ───────────────────────────────────────
const ENGINE_CONFIG: Record<string, { color: string; label: string }> = {
  postgresql: { color: '#58A6FF', label: 'PostgreSQL' },
  mysql:      { color: '#ED8B00', label: 'MySQL' },
};

// ─── Status badge config ───────────────────────────────────────
const STATUS_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  healthy:  { dot: '#3FB950', bg: 'rgba(63,185,80,0.12)',  text: '#3FB950', label: 'Healthy' },
  warning:  { dot: '#D29922', bg: 'rgba(210,153,34,0.12)', text: '#D29922', label: 'Warning' },
  critical: { dot: '#F85149', bg: 'rgba(248,81,73,0.12)',  text: '#F85149', label: 'Critical' },
  offline:  { dot: '#8B949E', bg: 'rgba(139,148,158,0.12)', text: '#8B949E', label: 'Offline' },
};

// ─── Filter options ────────────────────────────────────────────
const ENGINE_OPTIONS = [
  { label: 'All Engines', value: '' },
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'MySQL', value: 'mysql' },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
];

// ─── Demo data ─────────────────────────────────────────────────
function generateDemoData() {
    const instances: DBInstance[] = [
      {
        id: 'db-pg-01',
        engine: 'postgresql',
        hostname: 'pg-primary-01.prod.internal',
        port: 5432,
        version: '16.2',
        status: 'healthy',
        connections_active: 87,
        connections_max: 200,
        qps: 3421,
        avg_query_time_ms: 4.2,
        cache_hit_ratio: 99.4,
        replication_lag_ms: 12,
        disk_usage_pct: 62.3,
        collected_at: '2026-03-26T09:15:00Z',
      },
      {
        id: 'db-pg-02',
        engine: 'postgresql',
        hostname: 'pg-replica-01.prod.internal',
        port: 5432,
        version: '16.2',
        status: 'healthy',
        connections_active: 42,
        connections_max: 200,
        qps: 1856,
        avg_query_time_ms: 3.1,
        cache_hit_ratio: 99.7,
        replication_lag_ms: 48,
        disk_usage_pct: 61.8,
        collected_at: '2026-03-26T09:15:00Z',
      },
      {
        id: 'db-my-01',
        engine: 'mysql',
        hostname: 'mysql-primary-01.prod.internal',
        port: 3306,
        version: '8.4.3',
        status: 'warning',
        connections_active: 145,
        connections_max: 300,
        qps: 5120,
        avg_query_time_ms: 8.7,
        cache_hit_ratio: 97.2,
        replication_lag_ms: 230,
        disk_usage_pct: 78.5,
        collected_at: '2026-03-26T09:15:00Z',
      },
      {
        id: 'db-my-02',
        engine: 'mysql',
        hostname: 'mysql-replica-01.prod.internal',
        port: 3306,
        version: '8.4.1',
        status: 'healthy',
        connections_active: 63,
        connections_max: 300,
        qps: 2980,
        avg_query_time_ms: 5.4,
        cache_hit_ratio: 98.1,
        replication_lag_ms: 85,
        disk_usage_pct: 72.1,
        collected_at: '2026-03-26T09:15:00Z',
      },
    ];

    const slowQueries: DBSlowQuery[] = [
      {
        id: 'sq-001',
        db_instance_id: 'db-pg-01',
        query_text: 'SELECT o.id, o.total_amount, c.name, c.email FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items oi ON oi.order_id = o.id WHERE o.created_at > NOW() - INTERVAL \'30 days\' AND o.status = \'pending\' ORDER BY o.created_at DESC LIMIT 500',
        query_hash: 'a3f8c2d1',
        calls: 12480,
        avg_time_ms: 245.3,
        max_time_ms: 1820.0,
        total_time_ms: 3061344.0,
        rows_examined: 892000,
        rows_returned: 4200,
        wait_event_type: 'IO',
        wait_event: 'DataFileRead',
        first_seen: '2026-03-20T08:00:00Z',
        last_seen: '2026-03-26T09:10:00Z',
      },
      {
        id: 'sq-002',
        db_instance_id: 'db-pg-01',
        query_text: 'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3 AND quantity >= $1',
        query_hash: 'b7e4f190',
        calls: 8940,
        avg_time_ms: 182.7,
        max_time_ms: 3200.0,
        total_time_ms: 1633338.0,
        rows_examined: 45000,
        rows_returned: 8940,
        wait_event_type: 'Lock',
        wait_event: 'relation',
        first_seen: '2026-03-18T12:00:00Z',
        last_seen: '2026-03-26T09:12:00Z',
      },
      {
        id: 'sq-003',
        db_instance_id: 'db-my-01',
        query_text: 'SELECT p.*, AVG(r.rating) as avg_rating, COUNT(r.id) as review_count FROM products p LEFT JOIN reviews r ON r.product_id = p.id LEFT JOIN categories cat ON cat.id = p.category_id WHERE cat.slug IN (?, ?, ?) GROUP BY p.id HAVING avg_rating >= ? ORDER BY avg_rating DESC, review_count DESC',
        query_hash: 'c9d2e3f4',
        calls: 6720,
        avg_time_ms: 312.5,
        max_time_ms: 4500.0,
        total_time_ms: 2100000.0,
        rows_examined: 1250000,
        rows_returned: 3200,
        wait_event_type: 'IO',
        wait_event: 'DataFileRead',
        first_seen: '2026-03-22T06:00:00Z',
        last_seen: '2026-03-26T09:05:00Z',
      },
      {
        id: 'sq-004',
        db_instance_id: 'db-pg-02',
        query_text: 'SELECT u.id, u.email, COUNT(s.id) as session_count, MAX(s.last_active) as last_activity FROM users u LEFT JOIN sessions s ON s.user_id = u.id WHERE u.created_at > NOW() - INTERVAL \'90 days\' GROUP BY u.id, u.email HAVING session_count > 10',
        query_hash: 'd5a1b2c3',
        calls: 4560,
        avg_time_ms: 156.8,
        max_time_ms: 980.0,
        total_time_ms: 715008.0,
        rows_examined: 320000,
        rows_returned: 1800,
        wait_event_type: 'LWLock',
        wait_event: 'buffer_mapping',
        first_seen: '2026-03-24T10:00:00Z',
        last_seen: '2026-03-26T08:55:00Z',
      },
      {
        id: 'sq-005',
        db_instance_id: 'db-my-01',
        query_text: 'INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address, details, created_at) SELECT ?, ?, ?, ?, ?, ?, NOW() FROM dual WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE user_id = ? AND action = ? AND created_at > NOW() - INTERVAL 1 SECOND)',
        query_hash: 'e8f7a6b5',
        calls: 34200,
        avg_time_ms: 42.1,
        max_time_ms: 620.0,
        total_time_ms: 1439820.0,
        rows_examined: 68400,
        rows_returned: 34200,
        wait_event_type: 'IO',
        wait_event: 'log_write',
        first_seen: '2026-03-15T00:00:00Z',
        last_seen: '2026-03-26T09:14:00Z',
      },
      {
        id: 'sq-006',
        db_instance_id: 'db-pg-01',
        query_text: 'WITH daily_stats AS (SELECT date_trunc(\'day\', created_at) AS day, COUNT(*) AS cnt, SUM(amount) AS total FROM transactions WHERE created_at BETWEEN $1 AND $2 GROUP BY 1) SELECT day, cnt, total, SUM(total) OVER (ORDER BY day) as running_total FROM daily_stats ORDER BY day',
        query_hash: 'f1c2d3e4',
        calls: 2340,
        avg_time_ms: 520.4,
        max_time_ms: 2800.0,
        total_time_ms: 1217736.0,
        rows_examined: 4500000,
        rows_returned: 90,
        wait_event_type: 'IO',
        wait_event: 'DataFileRead',
        first_seen: '2026-03-25T06:00:00Z',
        last_seen: '2026-03-26T09:08:00Z',
      },
      {
        id: 'sq-007',
        db_instance_id: 'db-my-02',
        query_text: 'DELETE FROM expired_sessions WHERE last_active < NOW() - INTERVAL 7 DAY AND user_id NOT IN (SELECT id FROM users WHERE is_premium = 1)',
        query_hash: 'a2b3c4d5',
        calls: 48,
        avg_time_ms: 1850.2,
        max_time_ms: 8400.0,
        total_time_ms: 88809.6,
        rows_examined: 12000000,
        rows_returned: 250000,
        wait_event_type: 'IO',
        wait_event: 'DataFileRead',
        first_seen: '2026-03-26T02:00:00Z',
        last_seen: '2026-03-26T08:00:00Z',
      },
      {
        id: 'sq-008',
        db_instance_id: 'db-pg-02',
        query_text: 'SELECT t.id, t.name, json_agg(json_build_object(\'member_id\', tm.user_id, \'role\', tm.role, \'joined_at\', tm.joined_at)) AS members FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.org_id = $1 GROUP BY t.id, t.name ORDER BY t.name',
        query_hash: 'b4c5d6e7',
        calls: 8100,
        avg_time_ms: 98.6,
        max_time_ms: 450.0,
        total_time_ms: 798660.0,
        rows_examined: 162000,
        rows_returned: 8100,
        wait_event_type: 'Client',
        wait_event: 'ClientRead',
        first_seen: '2026-03-21T14:00:00Z',
        last_seen: '2026-03-26T09:13:00Z',
      },
    ];

    const locks: DBLock[] = [
      {
        id: 'lk-001',
        db_instance_id: 'db-pg-01',
        lock_type: 'RowExclusiveLock',
        blocking_pid: 14523,
        blocked_pid: 14891,
        blocking_query: 'UPDATE orders SET status = \'shipped\', shipped_at = NOW() WHERE id = 982341 AND status = \'processing\'',
        blocked_query: 'UPDATE orders SET status = \'cancelled\' WHERE id = 982341 AND status = \'processing\'',
        duration_ms: 8420,
        table_name: 'public.orders',
        detected_at: '2026-03-26T09:12:34Z',
      },
      {
        id: 'lk-002',
        db_instance_id: 'db-my-01',
        lock_type: 'RECORD',
        blocking_pid: 2847,
        blocked_pid: 2901,
        blocking_query: 'INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES (1042, 3, 500) ON DUPLICATE KEY UPDATE quantity = quantity + 500',
        blocked_query: 'UPDATE inventory SET quantity = quantity - 10 WHERE product_id = 1042 AND warehouse_id = 3',
        duration_ms: 3200,
        table_name: 'inventory',
        detected_at: '2026-03-26T09:13:10Z',
      },
      {
        id: 'lk-003',
        db_instance_id: 'db-pg-01',
        lock_type: 'AccessExclusiveLock',
        blocking_pid: 14200,
        blocked_pid: 14523,
        blocking_query: 'ALTER TABLE analytics_events ADD COLUMN source_ip inet',
        blocked_query: 'INSERT INTO analytics_events (event_type, user_id, payload) VALUES ($1, $2, $3)',
        duration_ms: 15340,
        table_name: 'public.analytics_events',
        detected_at: '2026-03-26T09:10:05Z',
      },
    ];

    const waitEvents: DBWaitEvent[] = [
      { event_type: 'IO',     event_name: 'DataFileRead',     count: 48200, total_time_ms: 9820450, avg_time_ms: 203.7 },
      { event_type: 'LWLock', event_name: 'buffer_mapping',   count: 12400, total_time_ms: 3240000, avg_time_ms: 261.3 },
      { event_type: 'Lock',   event_name: 'relation',         count: 5600,  total_time_ms: 2180000, avg_time_ms: 389.3 },
      { event_type: 'Client', event_name: 'ClientRead',       count: 32100, total_time_ms: 1560000, avg_time_ms: 48.6 },
      { event_type: 'IO',     event_name: 'WALWrite',         count: 18900, total_time_ms: 945000,  avg_time_ms: 50.0 },
      { event_type: 'LWLock', event_name: 'WALInsertLock',    count: 8200,  total_time_ms: 410000,  avg_time_ms: 50.0 },
    ];

    return { instances, slowQueries, locks, waitEvents };
}

// ─── Helpers ───────────────────────────────────────────────────
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatMs(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  return ms.toFixed(1) + 'ms';
}

function truncateQuery(q: string, maxLen = 80): string {
  return q.length > maxLen ? q.slice(0, maxLen) + '...' : q;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Tab definitions ───────────────────────────────────────────
const TAB_DEFS = [
  { id: 'instances',    label: 'Instances',    icon: <Server size={14} /> },
  { id: 'slow-queries', label: 'Slow Queries', icon: <Clock size={14} /> },
  { id: 'locks',        label: 'Locks',        icon: <Lock size={14} /> },
  { id: 'wait-events',  label: 'Wait Events',  icon: <Activity size={14} /> },
];

// ═══════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════
export default function DatabasePage() {
  const demoFallback = useCallback(() => generateDemoData(), []);
  const { data: rawData, source } = useDataSource('/database/instances', demoFallback, { refreshInterval: 30_000 });
  const parsed = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData as any : { instances: [], slowQueries: [], locks: [], waitEvents: [] };
  const instances: DBInstance[] = parsed.instances ?? (Array.isArray(rawData) ? rawData : (rawData as any)?.items ?? []);
  const slowQueries: DBSlowQuery[] = parsed.slowQueries ?? [];
  const locks: DBLock[] = parsed.locks ?? [];
  const waitEvents: DBWaitEvent[] = parsed.waitEvents ?? [];
  const [activeTab, setActiveTab] = useState('instances');
  const [search, setSearch] = useState('');
  const [engineFilter, setEngineFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null);

  // ─── KPI values ────────────────────────────────────────────
  const totalInstances = instances.length;
  const avgQps = Math.round(instances.reduce((s, i) => s + i.qps, 0) / instances.length);
  const slowQueryCount = slowQueries.length;
  const activeLocks = locks.length;

  // ─── Filtered instances ────────────────────────────────────
  const filteredInstances = useMemo(() => {
    return instances.filter(inst => {
      if (search && !inst.hostname.toLowerCase().includes(search.toLowerCase())) return false;
      if (engineFilter && inst.engine !== engineFilter) return false;
      if (statusFilter && inst.status !== statusFilter) return false;
      return true;
    });
  }, [instances, search, engineFilter, statusFilter]);

  // ─── Filtered slow queries ─────────────────────────────────
  const filteredSlowQueries = useMemo(() => {
    if (!search) return slowQueries;
    const q = search.toLowerCase();
    return slowQueries.filter(sq =>
      sq.query_text.toLowerCase().includes(q) || sq.db_instance_id.toLowerCase().includes(q),
    );
  }, [slowQueries, search]);

  // ─── Connection pool gauge chart ───────────────────────────
  const gaugeChartOption = useMemo<EChartsOption>(() => {
    return {
      animation: false,
      series: instances.map((inst, idx) => {
        const ratio = inst.connections_active / inst.connections_max;
        const color = ratio > 0.8 ? '#F85149' : ratio > 0.6 ? '#D29922' : '#3FB950';
        return {
          type: 'gauge' as const,
          center: [`${(idx * 25) + 12.5}%`, '55%'],
          radius: '80%',
          startAngle: 220,
          endAngle: -40,
          min: 0,
          max: inst.connections_max,
          pointer: { show: false },
          progress: {
            show: true,
            width: 12,
            roundCap: true,
            itemStyle: { color },
          },
          axisLine: {
            lineStyle: { width: 12, color: [[1, 'rgba(139,148,158,0.2)']] },
            roundCap: true,
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: {
            fontSize: 11,
            color: '#8B949E',
            offsetCenter: [0, '70%'],
          },
          detail: {
            fontSize: 16,
            fontWeight: 600,
            color: '#E6EDF3',
            offsetCenter: [0, '25%'],
            formatter: `${inst.connections_active}/{max}`,
          },
          data: [{
            value: inst.connections_active,
            name: inst.hostname.split('.')[0],
          }],
        };
      }),
    };
  }, [instances]);

  // ─── Wait events horizontal bar chart ──────────────────────
  const waitEventsChartOption = useMemo<EChartsOption>(() => {
    const sorted = [...waitEvents].sort((a, b) => a.total_time_ms - b.total_time_ms);
    const barColors = ['#58A6FF', '#3FB950', '#F85149', '#D29922', '#A371F7', '#58A6FF'];

    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,27,34,0.95)',
        borderColor: 'rgba(139,148,158,0.2)',
        textStyle: { color: '#E6EDF3', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = (params as Array<{ name: string; value: number }>)[0];
          const evt = sorted.find(e => `${e.event_type}/${e.event_name}` === p.name);
          if (!evt) return '';
          return `<div style="font-size:12px">
            <strong>${evt.event_type}/${evt.event_name}</strong><br/>
            Total time: ${formatMs(evt.total_time_ms)}<br/>
            Count: ${formatNumber(evt.count)}<br/>
            Avg time: ${formatMs(evt.avg_time_ms)}
          </div>`;
        },
      },
      grid: { left: 180, right: 40, top: 12, bottom: 20 },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: '#8B949E',
          fontSize: 11,
          formatter: (v: number) => formatMs(v),
        },
        splitLine: { lineStyle: { color: 'rgba(139,148,158,0.1)' } },
      },
      yAxis: {
        type: 'category',
        data: sorted.map(e => `${e.event_type}/${e.event_name}`),
        axisLabel: { color: '#8B949E', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar',
        data: sorted.map((e, i) => ({
          value: e.total_time_ms,
          itemStyle: { color: barColors[i % barColors.length], borderRadius: [0, 3, 3, 0] },
        })),
        barWidth: 18,
      }],
    };
  }, [waitEvents]);

  // ─── Tab content renderers ─────────────────────────────────
  const renderInstances = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search hostname..."
          className="w-64"
        />
        <Select
          options={ENGINE_OPTIONS}
          value={engineFilter}
          onChange={e => setEngineFilter(e.target.value)}
          aria-label="Engine filter"
        />
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Status filter"
        />
      </div>

      {/* Instance table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Engine</th>
                <th className="text-left px-4 py-2.5 font-medium">Host</th>
                <th className="text-left px-4 py-2.5 font-medium">Version</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Connections</th>
                <th className="text-right px-4 py-2.5 font-medium">QPS</th>
                <th className="text-right px-4 py-2.5 font-medium">Avg Query</th>
                <th className="text-right px-4 py-2.5 font-medium">Cache Hit</th>
                <th className="text-right px-4 py-2.5 font-medium">Repl. Lag</th>
                <th className="text-right px-4 py-2.5 font-medium">Disk</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstances.map(inst => {
                const engineCfg = ENGINE_CONFIG[inst.engine];
                const statusCfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.healthy;
                const connRatio = inst.connections_active / inst.connections_max;
                const connColor = connRatio > 0.8 ? '#F85149' : connRatio > 0.6 ? '#D29922' : '#3FB950';

                return (
                  <tr
                    key={inst.id}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    {/* Engine badge */}
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: engineCfg.color + '20', color: engineCfg.color }}
                      >
                        {engineCfg.label}
                      </span>
                    </td>

                    {/* Host */}
                    <td className="px-4 py-2.5">
                      <span className="text-[var(--text-primary)] font-medium text-xs">
                        {inst.hostname}:{inst.port}
                      </span>
                    </td>

                    {/* Version */}
                    <td className="px-4 py-2.5 text-[var(--text-secondary)] text-xs">
                      {inst.version}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: statusCfg.dot }}
                        />
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Connections with mini gauge */}
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[rgba(139,148,158,0.2)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${connRatio * 100}%`,
                              backgroundColor: connColor,
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums" style={{ color: connColor }}>
                          {inst.connections_active}/{inst.connections_max}
                        </span>
                      </div>
                    </td>

                    {/* QPS */}
                    <td className="px-4 py-2.5 text-right text-[var(--text-primary)] text-xs tabular-nums">
                      {formatNumber(inst.qps)}
                    </td>

                    {/* Avg query time */}
                    <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] text-xs tabular-nums">
                      {inst.avg_query_time_ms.toFixed(1)}ms
                    </td>

                    {/* Cache hit ratio */}
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      <span style={{ color: inst.cache_hit_ratio >= 99 ? '#3FB950' : inst.cache_hit_ratio >= 95 ? '#D29922' : '#F85149' }}>
                        {inst.cache_hit_ratio.toFixed(1)}%
                      </span>
                    </td>

                    {/* Replication lag */}
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      <span style={{ color: inst.replication_lag_ms > 100 ? '#D29922' : '#8B949E' }}>
                        {inst.replication_lag_ms}ms
                      </span>
                    </td>

                    {/* Disk */}
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      <span style={{ color: inst.disk_usage_pct > 80 ? '#F85149' : inst.disk_usage_pct > 70 ? '#D29922' : '#8B949E' }}>
                        {inst.disk_usage_pct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Connection Pool Gauges */}
      <Card>
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Connection Pool Utilization</h3>
        <EChartsWrapper option={gaugeChartOption} style={{ height: 200 }} />
      </Card>
    </div>
  );

  const renderSlowQueries = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search queries..."
          className="w-64"
        />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="w-8 px-2 py-2.5" />
                <th className="text-left px-4 py-2.5 font-medium">Query</th>
                <th className="text-right px-4 py-2.5 font-medium">Calls</th>
                <th className="text-right px-4 py-2.5 font-medium">Avg Time</th>
                <th className="text-right px-4 py-2.5 font-medium">Max Time</th>
                <th className="text-right px-4 py-2.5 font-medium">Total Time</th>
                <th className="text-right px-4 py-2.5 font-medium">Rows Exam.</th>
                <th className="text-right px-4 py-2.5 font-medium">Rows Ret.</th>
                <th className="text-left px-4 py-2.5 font-medium">Wait Event</th>
                <th className="text-left px-4 py-2.5 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filteredSlowQueries.map(sq => {
                const isExpanded = expandedQueryId === sq.id;
                return (
                  <tr key={sq.id} className="group">
                    <td
                      colSpan={10}
                      className="p-0"
                      style={{ border: 'none' }}
                    >
                      {/* Main row */}
                      <div
                        className="flex items-center border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                        onClick={() => setExpandedQueryId(isExpanded ? null : sq.id)}
                      >
                        <div className="w-8 px-2 py-2.5 flex items-center justify-center text-[var(--text-muted)]">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                        <div className="flex-1 px-4 py-2.5 min-w-0">
                          <span className="font-mono text-[12px] text-[var(--text-primary)] truncate block">
                            {truncateQuery(sq.query_text)}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">{sq.db_instance_id}</span>
                        </div>
                        <div className="px-4 py-2.5 text-right text-xs text-[var(--text-primary)] tabular-nums w-20 shrink-0">
                          {formatNumber(sq.calls)}
                        </div>
                        <div className="px-4 py-2.5 text-right text-xs text-[var(--text-secondary)] tabular-nums w-24 shrink-0">
                          {formatMs(sq.avg_time_ms)}
                        </div>
                        <div className="px-4 py-2.5 text-right text-xs tabular-nums w-24 shrink-0">
                          <span style={{ color: sq.max_time_ms > 3000 ? '#F85149' : sq.max_time_ms > 1000 ? '#D29922' : '#8B949E' }}>
                            {formatMs(sq.max_time_ms)}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 text-right text-xs text-[var(--text-secondary)] tabular-nums w-24 shrink-0">
                          {formatMs(sq.total_time_ms)}
                        </div>
                        <div className="px-4 py-2.5 text-right text-xs text-[var(--text-secondary)] tabular-nums w-24 shrink-0">
                          {formatNumber(sq.rows_examined)}
                        </div>
                        <div className="px-4 py-2.5 text-right text-xs text-[var(--text-secondary)] tabular-nums w-24 shrink-0">
                          {formatNumber(sq.rows_returned)}
                        </div>
                        <div className="px-4 py-2.5 text-left text-xs w-32 shrink-0">
                          <span className="text-[var(--text-muted)]">{sq.wait_event_type}/</span>
                          <span className="text-[var(--text-secondary)]">{sq.wait_event}</span>
                        </div>
                        <div className="px-4 py-2.5 text-left text-xs text-[var(--text-muted)] w-24 shrink-0">
                          {relativeTime(sq.last_seen)}
                        </div>
                      </div>

                      {/* Expanded query text */}
                      {isExpanded && (
                        <div className="bg-[var(--bg-tertiary)] border-b border-[var(--border-muted)] px-4 py-3">
                          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1.5 font-medium">
                            Full Query Text
                          </div>
                          <pre className="font-mono text-[12px] text-[var(--text-primary)] whitespace-pre-wrap break-all leading-relaxed p-3 rounded-[var(--radius-md)] bg-[var(--bg-secondary)] border border-[var(--border-muted)]">
                            {sq.query_text}
                          </pre>
                          <div className="flex gap-6 mt-2 text-[11px] text-[var(--text-muted)]">
                            <span>Hash: <span className="font-mono text-[var(--text-secondary)]">{sq.query_hash}</span></span>
                            <span>First seen: {relativeTime(sq.first_seen)}</span>
                            <span>Instance: <span className="text-[var(--text-secondary)]">{sq.db_instance_id}</span></span>
                          </div>
                        </div>
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

  const renderLocks = () => (
    <div className="space-y-4">
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Lock Type</th>
                <th className="text-left px-4 py-2.5 font-medium">PIDs</th>
                <th className="text-left px-4 py-2.5 font-medium">Blocking Query</th>
                <th className="text-left px-4 py-2.5 font-medium">Blocked Query</th>
                <th className="text-right px-4 py-2.5 font-medium">Duration</th>
                <th className="text-left px-4 py-2.5 font-medium">Table</th>
                <th className="text-left px-4 py-2.5 font-medium">Detected</th>
              </tr>
            </thead>
            <tbody>
              {locks.map(lk => {
                const isLong = lk.duration_ms > 5000;
                return (
                  <tr
                    key={lk.id}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    style={isLong ? { backgroundColor: 'rgba(248,81,73,0.06)' } : undefined}
                  >
                    {/* Lock type */}
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                        style={{
                          backgroundColor: isLong ? 'rgba(248,81,73,0.15)' : 'rgba(139,148,158,0.15)',
                          color: isLong ? '#F85149' : '#8B949E',
                        }}
                      >
                        {lk.lock_type}
                      </span>
                    </td>

                    {/* PIDs */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono">
                        <span className="text-[#F85149]">{lk.blocking_pid}</span>
                        <span className="text-[var(--text-muted)] mx-1">&rarr;</span>
                        <span className="text-[#D29922]">{lk.blocked_pid}</span>
                      </span>
                    </td>

                    {/* Blocking query */}
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate block" title={lk.blocking_query}>
                        {truncateQuery(lk.blocking_query, 60)}
                      </span>
                    </td>

                    {/* Blocked query */}
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate block" title={lk.blocked_query}>
                        {truncateQuery(lk.blocked_query, 60)}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className="text-xs font-medium tabular-nums"
                        style={{ color: isLong ? '#F85149' : '#D29922' }}
                      >
                        {formatMs(lk.duration_ms)}
                      </span>
                    </td>

                    {/* Table */}
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-[var(--text-primary)]">
                        {lk.table_name}
                      </span>
                    </td>

                    {/* Detected */}
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                      {relativeTime(lk.detected_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {locks.some(l => l.duration_ms > 5000) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs"
          style={{ backgroundColor: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)' }}
        >
          <AlertTriangle size={14} className="text-[#F85149] shrink-0" />
          <span className="text-[#F85149]">
            {locks.filter(l => l.duration_ms > 5000).length} lock(s) exceeding 5 seconds detected. Consider investigating blocking sessions.
          </span>
        </div>
      )}
    </div>
  );

  const renderWaitEvents = () => (
    <div className="space-y-4">
      {/* Chart */}
      <Card>
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Top Wait Events by Total Time</h3>
        <EChartsWrapper option={waitEventsChartOption} style={{ height: 260 }} />
      </Card>

      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Event Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Event Name</th>
                <th className="text-right px-4 py-2.5 font-medium">Count</th>
                <th className="text-right px-4 py-2.5 font-medium">Total Time</th>
                <th className="text-right px-4 py-2.5 font-medium">Avg Time</th>
                <th className="text-left px-4 py-2.5 font-medium">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {[...waitEvents]
                .sort((a, b) => b.total_time_ms - a.total_time_ms)
                .map((evt, idx) => {
                  const maxTotal = Math.max(...waitEvents.map(e => e.total_time_ms));
                  const pct = (evt.total_time_ms / maxTotal) * 100;
                  const barColors = ['#58A6FF', '#3FB950', '#F85149', '#D29922', '#A371F7', '#58A6FF'];
                  const barColor = barColors[idx % barColors.length];

                  return (
                    <tr
                      key={`${evt.event_type}-${evt.event_name}`}
                      className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{ backgroundColor: barColor + '20', color: barColor }}
                        >
                          {evt.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-primary)] text-xs font-mono">
                        {evt.event_name}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-primary)] text-xs tabular-nums">
                        {formatNumber(evt.count)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-primary)] text-xs tabular-nums font-medium">
                        {formatMs(evt.total_time_ms)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] text-xs tabular-nums">
                        {formatMs(evt.avg_time_ms)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-[rgba(139,148,158,0.15)] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
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

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Database Monitoring', icon: <Database size={14} /> },
        ]}
      />

      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Database Monitoring</h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Query-level performance analysis, lock detection, and connection pool monitoring across all database instances
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          helpId="db-total-instances"
          title="Total Instances"
          value={totalInstances}
          subtitle="Active database instances"
          sparkData={[3, 3, 4, 4, 4, 4, 4]}
          status="healthy"
        />
        <KPICard
          helpId="db-avg-qps"
          title="Avg QPS"
          value={formatNumber(avgQps)}
          subtitle="Queries per second"
          sparkData={[2800, 3100, 3200, 3400, 3300, 3500, avgQps]}
        />
        <KPICard
          helpId="db-slow-queries"
          title="Slow Queries (24h)"
          value={slowQueryCount}
          status={slowQueryCount > 5 ? 'warning' : 'healthy'}
          subtitle="Detected slow queries"
          sparkData={[3, 5, 4, 6, 7, 8, slowQueryCount]}
        />
        <KPICard
          helpId="db-active-locks"
          title="Active Locks"
          value={activeLocks}
          status={activeLocks > 2 ? 'critical' : activeLocks > 0 ? 'warning' : 'healthy'}
          subtitle="Currently blocking"
          sparkData={[0, 1, 0, 2, 1, 3, activeLocks]}
        />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={TAB_DEFS.map(t => ({
          ...t,
          count: t.id === 'instances' ? instances.length
            : t.id === 'slow-queries' ? slowQueries.length
            : t.id === 'locks' ? locks.length
            : t.id === 'wait-events' ? waitEvents.length
            : undefined,
        }))}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === 'instances' && renderInstances()}
      {activeTab === 'slow-queries' && renderSlowQueries()}
      {activeTab === 'locks' && renderLocks()}
      {activeTab === 'wait-events' && renderWaitEvents()}
    </div>
  );
}
