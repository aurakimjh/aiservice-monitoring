'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs } from '@/components/ui';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { SystemFlamegraph } from '@/components/charts/system-flamegraph';
import { getBatchExecutionDetail, getBatchSQLProfile, getBatchMethodProfile } from '@/lib/demo-data';
import { formatDuration, formatBytes } from '@/lib/utils';
import type { FlameGraphNode, BatchSQLProfile, BatchMethodProfile } from '@/types/monitoring';
import {
  Timer,
  Cpu,
  MemoryStick,
  HardDrive,
  Terminal,
  Database,
  Code,
  Flame,
  Activity,
} from 'lucide-react';

const EXEC_STATE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  COMPLETED: { dot: '#3FB950', bg: 'rgba(63,185,80,0.12)', text: '#3FB950' },
  FAILED:    { dot: '#F85149', bg: 'rgba(248,81,73,0.12)', text: '#F85149' },
  RUNNING:   { dot: '#58A6FF', bg: 'rgba(88,166,255,0.12)', text: '#58A6FF' },
  DETECTED:  { dot: '#D29922', bg: 'rgba(210,153,34,0.12)', text: '#D29922' },
};

const LANG_BADGE: Record<string, { color: string; label: string }> = {
  java:   { color: '#ED8B00', label: 'Java' },
  python: { color: '#3776AB', label: 'Python' },
  go:     { color: '#00ADD8', label: 'Go' },
  dotnet: { color: '#512BD4', label: '.NET' },
  shell:  { color: '#4EAA25', label: 'Shell' },
};

type SQLSortField = 'execution_count' | 'total_time_ms' | 'avg_time_ms' | 'max_time_ms';
type MethodSortField = 'call_count' | 'total_time_ms' | 'avg_time_ms' | 'self_time_ms';

// Generate a demo flamegraph for batch execution
function generateBatchFlameGraph(language: string): FlameGraphNode {
  if (language === 'java') {
    return {
      name: 'root',
      fullName: 'root',
      value: 10000,
      selfValue: 0,
      children: [
        {
          name: 'TaskletStep.doExecute', fullName: 'org.springframework.batch.core.step.tasklet.TaskletStep.doExecute', value: 9500, selfValue: 200,
          children: [
            {
              name: 'OrderSettlementTasklet.execute', fullName: 'com.example.batch.OrderSettlementTasklet.execute', value: 8800, selfValue: 300,
              children: [
                {
                  name: 'processChunk', fullName: 'com.example.batch.OrderSettlementTasklet.processChunk', value: 5000, selfValue: 800,
                  children: [
                    { name: 'findPendingOrders', fullName: 'com.example.repository.OrderRepository.findPendingOrders', value: 2000, selfValue: 1800, children: [
                      { name: 'HikariPool.getConnection', fullName: 'com.zaxxer.hikari.HikariPool.getConnection', value: 200, selfValue: 200, children: [] },
                    ] },
                    { name: 'settlePayment', fullName: 'com.example.service.PaymentService.settlePayment', value: 1500, selfValue: 1200, children: [
                      { name: 'executeUpdate', fullName: 'java.sql.PreparedStatement.executeUpdate', value: 300, selfValue: 300, children: [] },
                    ] },
                    { name: 'logSettlement', fullName: 'com.example.service.AuditService.logSettlement', value: 500, selfValue: 500, children: [] },
                  ],
                },
                {
                  name: 'SettlementWriter.write', fullName: 'com.example.batch.SettlementWriter.write', value: 3000, selfValue: 500,
                  children: [
                    { name: 'JdbcTemplate.batchUpdate', fullName: 'org.springframework.jdbc.core.JdbcTemplate.batchUpdate', value: 2500, selfValue: 2500, children: [] },
                  ],
                },
              ],
            },
            {
              name: 'GC_ParallelOld', fullName: 'GC.ParallelOld', value: 500, selfValue: 500, children: [],
            },
          ],
        },
      ],
    };
  }

  // Python / generic flamegraph
  return {
    name: 'root',
    fullName: 'root',
    value: 10000,
    selfValue: 0,
    children: [
      {
        name: 'main', fullName: '__main__.main', value: 9500, selfValue: 100,
        children: [
          {
            name: 'run_pipeline', fullName: 'pipeline.run_pipeline', value: 5000, selfValue: 200,
            children: [
              { name: 'extract_data', fullName: 'pipeline.extract_data', value: 2500, selfValue: 1500, children: [
                { name: 'pd.read_sql', fullName: 'pandas.read_sql', value: 1000, selfValue: 1000, children: [] },
              ] },
              { name: 'transform', fullName: 'pipeline.transform', value: 1800, selfValue: 1200, children: [
                { name: 'apply', fullName: 'pandas.DataFrame.apply', value: 600, selfValue: 600, children: [] },
              ] },
              { name: 'load_data', fullName: 'pipeline.load_data', value: 500, selfValue: 500, children: [] },
            ],
          },
          {
            name: 'send_report', fullName: 'reporting.send_report', value: 2500, selfValue: 500,
            children: [
              { name: 'generate_html', fullName: 'reporting.generate_html', value: 1200, selfValue: 1200, children: [] },
              { name: 'smtp_send', fullName: 'smtplib.SMTP.send_message', value: 800, selfValue: 800, children: [] },
            ],
          },
          {
            name: 'cleanup', fullName: 'pipeline.cleanup', value: 2000, selfValue: 2000, children: [],
          },
        ],
      },
    ],
  };
}

export default function BatchExecutionDetailPage() {
  const params = useParams();
  const executionId = params.id as string;

  const detail = useMemo(() => getBatchExecutionDetail(executionId), [executionId]);
  const sqlProfiles = useMemo(() => getBatchSQLProfile(executionId), [executionId]);
  const methodProfiles = useMemo(() => getBatchMethodProfile(executionId), [executionId]);

  const [activeTab, setActiveTab] = useState('overview');
  const [sqlSort, setSqlSort] = useState<{ field: SQLSortField; dir: 'asc' | 'desc' }>({ field: 'total_time_ms', dir: 'desc' });
  const [methodSort, setMethodSort] = useState<{ field: MethodSortField; dir: 'asc' | 'desc' }>({ field: 'total_time_ms', dir: 'desc' });

  const flameRoot = useMemo(() => detail ? generateBatchFlameGraph(detail.language) : null, [detail]);

  const sortedSQL = useMemo(() => {
    const arr = [...sqlProfiles];
    arr.sort((a, b) => {
      const va = a[sqlSort.field] as number;
      const vb = b[sqlSort.field] as number;
      return sqlSort.dir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [sqlProfiles, sqlSort]);

  const sortedMethods = useMemo(() => {
    const arr = [...methodProfiles];
    arr.sort((a, b) => {
      const va = a[methodSort.field] as number;
      const vb = b[methodSort.field] as number;
      return methodSort.dir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [methodProfiles, methodSort]);

  const handleSQLSort = (field: SQLSortField) => {
    setSqlSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' });
  };

  const handleMethodSort = (field: MethodSortField) => {
    setMethodSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' });
  };

  const sqlSortIndicator = (field: SQLSortField) => sqlSort.field === field ? (sqlSort.dir === 'asc' ? ' \u2191' : ' \u2193') : '';
  const methodSortIndicator = (field: MethodSortField) => methodSort.field === field ? (methodSort.dir === 'asc' ? ' \u2191' : ' \u2193') : '';

  if (!detail) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[
          { label: 'Home', href: '/' },
          { label: 'Batch Monitoring', href: '/batch', icon: <Timer size={14} /> },
          { label: executionId },
        ]} />
        <Card>
          <div className="py-12 text-center text-[var(--text-muted)]">
            Execution &quot;{executionId}&quot; not found
          </div>
        </Card>
      </div>
    );
  }

  const stateCfg = EXEC_STATE_COLORS[detail.state] || EXEC_STATE_COLORS.DETECTED;
  const langCfg = LANG_BADGE[detail.language];
  const hasSQL = detail.language === 'java' || detail.language === 'python' || detail.language === 'dotnet';
  const hasJVM = detail.language === 'java' && detail.jvm_metrics;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <Activity size={13} /> },
    ...(hasSQL ? [{ id: 'sql', label: 'SQL', icon: <Database size={13} /> }] : []),
    { id: 'methods', label: 'Methods', icon: <Code size={13} /> },
    { id: 'flamegraph', label: 'Flamegraph', icon: <Flame size={13} /> },
    ...(hasJVM ? [{ id: 'runtime', label: 'Runtime', icon: <Terminal size={13} /> }] : []),
  ];

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Batch Monitoring', href: '/batch', icon: <Timer size={14} /> },
        { label: detail.job_name, href: `/batch/${encodeURIComponent(detail.job_name)}` },
        { label: executionId },
      ]} />

      {/* Summary Card */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">{detail.job_name}</h1>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: stateCfg.bg, color: stateCfg.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: stateCfg.dot }} />
                {detail.state}
              </span>
              {langCfg && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: langCfg.color + '20', color: langCfg.color }}
                >
                  {langCfg.label}
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono">{detail.execution_id}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--text-muted)]">Exit Code</div>
            <div className="text-2xl font-bold tabular-nums" style={{
              color: detail.exit_code === 0 ? '#3FB950' : '#F85149',
            }}>
              {detail.exit_code}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-4 mt-4 pt-4 border-t border-[var(--border-muted)]">
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">PID</div>
            <div className="text-sm font-mono text-[var(--text-primary)] mt-0.5">{detail.pid}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Host</div>
            <div className="text-sm text-[var(--text-primary)] mt-0.5">{detail.hostname}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Started</div>
            <div className="text-sm text-[var(--text-primary)] mt-0.5">{new Date(detail.started_at).toLocaleString('ko-KR')}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Ended</div>
            <div className="text-sm text-[var(--text-primary)] mt-0.5">
              {detail.ended_at ? new Date(detail.ended_at).toLocaleString('ko-KR') : 'In progress'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Duration</div>
            <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{formatDuration(detail.duration_ms)}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Scheduler</div>
            <div className="text-sm text-[var(--text-primary)] mt-0.5">{detail.scheduler}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Detected Via</div>
            <div className="text-sm text-[var(--text-primary)] mt-0.5">{detail.detected_via}</div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--border-muted)]">
          <div className="text-[11px] text-[var(--text-muted)] mb-1">Command</div>
          <div className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-primary)] p-2 rounded overflow-x-auto">
            {detail.command}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={14} className="text-[#58A6FF]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">CPU Usage (%)</h3>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                  avg {detail.cpu_avg.toFixed(1)}% / max {detail.cpu_max.toFixed(1)}%
                </span>
              </div>
              <TimeSeriesChart
                series={[{ name: 'CPU %', data: detail.cpu_timeline, type: 'area', color: '#58A6FF' }]}
                height={180}
                yAxisLabel="%"
                thresholdLine={{ value: 90, label: '90%', color: '#F85149' }}
              />
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <MemoryStick size={14} className="text-[#3FB950]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Memory RSS</h3>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                  max {formatBytes(detail.memory_max)}
                </span>
              </div>
              <TimeSeriesChart
                series={[{
                  name: 'Memory',
                  data: detail.memory_timeline.map(([t, v]) => [t, v / (1024 * 1024)] as [number, number]),
                  type: 'area',
                  color: '#3FB950',
                }]}
                height={180}
                yAxisLabel="MB"
              />
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <HardDrive size={14} className="text-[#D29922]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Disk I/O</h3>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                  total {formatBytes(detail.io_read_total + detail.io_write_total)}
                </span>
              </div>
              <TimeSeriesChart
                series={[{
                  name: 'I/O',
                  data: detail.io_timeline.map(([t, v]) => [t, v / (1024 * 1024)] as [number, number]),
                  type: 'area',
                  color: '#D29922',
                }]}
                height={180}
                yAxisLabel="MB"
              />
            </Card>
          </div>
        </div>
      )}

      {/* SQL Tab */}
      {activeTab === 'sql' && hasSQL && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-[var(--border-default)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">SQL Top-N</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium w-[40%]">SQL</th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSQLSort('execution_count')}>
                    Count{sqlSortIndicator('execution_count')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSQLSort('total_time_ms')}>
                    Total Time{sqlSortIndicator('total_time_ms')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSQLSort('avg_time_ms')}>
                    Avg Time{sqlSortIndicator('avg_time_ms')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleSQLSort('max_time_ms')}>
                    Max Time{sqlSortIndicator('max_time_ms')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSQL.map((sql, i) => (
                  <tr key={i} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-[var(--text-primary)] truncate max-w-[400px]" title={sql.sql}>
                        {sql.sql}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {sql.execution_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)] font-medium">
                      {formatDuration(sql.total_time_ms)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {sql.avg_time_ms.toFixed(2)}ms
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums" style={{
                      color: sql.max_time_ms > 100 ? '#F85149' : sql.max_time_ms > 50 ? '#D29922' : 'var(--text-secondary)',
                    }}>
                      {sql.max_time_ms.toFixed(1)}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Methods Tab */}
      {activeTab === 'methods' && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-[var(--border-default)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Method / Function Top-N</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium w-[40%]">Method</th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleMethodSort('call_count')}>
                    Calls{methodSortIndicator('call_count')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleMethodSort('total_time_ms')}>
                    Total Time{methodSortIndicator('total_time_ms')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleMethodSort('avg_time_ms')}>
                    Avg Time{methodSortIndicator('avg_time_ms')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]" onClick={() => handleMethodSort('self_time_ms')}>
                    Self Time{methodSortIndicator('self_time_ms')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMethods.map((m, i) => (
                  <tr key={i} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-[var(--text-primary)] truncate max-w-[400px]" title={m.full_name}>
                        {m.full_name}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {m.call_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)] font-medium">
                      {formatDuration(m.total_time_ms)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {formatDuration(m.avg_time_ms)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {formatDuration(m.self_time_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Flamegraph Tab */}
      {activeTab === 'flamegraph' && flameRoot && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Flame size={14} className="text-[#ED8B00]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">CPU Flamegraph</h2>
            <span className="ml-2 text-[11px] text-[var(--text-muted)]">
              Time range: {new Date(detail.started_at).toLocaleString('ko-KR')} -
              {detail.ended_at ? new Date(detail.ended_at).toLocaleString('ko-KR') : ' In progress'}
            </span>
          </div>
          <SystemFlamegraph
            root={flameRoot}
            height={500}
            profileType="cpu"
          />
        </Card>
      )}

      {/* Runtime Tab (JVM/.NET) */}
      {activeTab === 'runtime' && hasJVM && detail.jvm_metrics && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={14} className="text-[#BC8CFF]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">JVM Metrics</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg p-4">
              <div className="text-xs text-[var(--text-muted)] mb-1">GC Count</div>
              <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{detail.jvm_metrics.gc_count}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">Total GC time: {formatDuration(detail.jvm_metrics.gc_time_ms)}</div>
            </div>
            <div className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg p-4">
              <div className="text-xs text-[var(--text-muted)] mb-1">Heap Size</div>
              <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {formatBytes(detail.jvm_metrics.heap_used_bytes)}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                Max: {formatBytes(detail.jvm_metrics.heap_max_bytes)}
              </div>
              <div className="mt-2 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(detail.jvm_metrics.heap_used_bytes / detail.jvm_metrics.heap_max_bytes * 100).toFixed(0)}%`,
                    backgroundColor: detail.jvm_metrics.heap_used_bytes / detail.jvm_metrics.heap_max_bytes > 0.85 ? '#F85149' : '#3FB950',
                  }}
                />
              </div>
            </div>
            <div className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg p-4">
              <div className="text-xs text-[var(--text-muted)] mb-1">Threads</div>
              <div className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{detail.jvm_metrics.thread_count}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">Classes loaded: {detail.jvm_metrics.class_loaded.toLocaleString()}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
