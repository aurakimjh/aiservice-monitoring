'use client';

import { useState, useMemo, useCallback, Fragment } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { getAnomalies, getDynamicThresholds } from '@/lib/demo-data';
import { AnomalyChart } from '@/components/monitoring/anomaly-chart';
import { getRelativeTime } from '@/lib/utils';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const SEV_BADGE: Record<string, { status: 'critical' | 'warning' | 'healthy'; label: string }> = {
  critical: { status: 'critical', label: 'Critical' },
  warning: { status: 'warning', label: 'Warning' },
  info: { status: 'healthy', label: 'Info' },
};

const STATUS_BADGE: Record<string, { status: 'critical' | 'warning' | 'healthy'; label: string }> = {
  active: { status: 'critical', label: 'Active' },
  acknowledged: { status: 'warning', label: 'Acknowledged' },
  resolved: { status: 'healthy', label: 'Resolved' },
};

export default function AnomaliesPage() {
  const demoAnomalies = useCallback(() => getAnomalies(), []);
  const demoThresholds = useCallback(() => getDynamicThresholds(), []);
  const { data: anomaliesData, source } = useDataSource('/anomalies', demoAnomalies, { refreshInterval: 30_000 });
  const { data: thresholdsData } = useDataSource('/anomalies/thresholds', demoThresholds, { refreshInterval: 30_000 });
  const anomalies = anomaliesData ?? [];
  const thresholds = thresholdsData ?? [];
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const activeCount = anomalies.filter((a) => a.status === 'active').length;
  const resolvedCount = anomalies.filter((a) => a.status === 'resolved').length;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Anomaly Detection', icon: <AlertTriangle size={14} /> },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Anomaly Detection</h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          ML-based dynamic threshold monitoring
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Total Detected"
          value={anomalies.length}
          subtitle="anomalies detected"
          status="healthy"
        />
        <KPICard
          title="Active Anomalies"
          value={activeCount}
          status="critical"
        />
        <KPICard
          title="Avg Detection Time"
          value="2.3"
          unit="min"
          subtitle="mean detection latency"
          status="healthy"
        />
        <KPICard
          title="Auto-Resolved Rate"
          value={`${Math.round((resolvedCount / anomalies.length) * 100)}%`}
          subtitle={`${resolvedCount} of ${anomalies.length} resolved`}
          status="healthy"
        />
      </div>

      {/* Dynamic Threshold Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {thresholds[0] && (
          <Card>
            <CardHeader>
              <CardTitle>Dynamic Threshold &mdash; TTFT P95</CardTitle>
            </CardHeader>
            <AnomalyChart threshold={thresholds[0]} />
          </Card>
        )}
        {thresholds[1] && (
          <Card>
            <CardHeader>
              <CardTitle>Dynamic Threshold &mdash; Error Rate</CardTitle>
            </CardHeader>
            <AnomalyChart threshold={thresholds[1]} />
          </Card>
        )}
      </div>

      {/* Anomaly Events Table */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-[var(--border-default)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Anomaly Events</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2.5 font-medium w-6" />
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Metric</th>
                <th className="px-4 py-2.5 font-medium">Service</th>
                <th className="px-4 py-2.5 font-medium">Value (Expected)</th>
                <th className="px-4 py-2.5 font-medium">Deviation%</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Detected</th>
                <th className="px-4 py-2.5 font-medium">Root Cause</th>
                <th className="px-4 py-2.5 font-medium">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a) => {
                const isExpanded = expandedRow === a.id;
                const sevBadge = SEV_BADGE[a.severity] ?? SEV_BADGE.info;
                const statusBadge = STATUS_BADGE[a.status] ?? STATUS_BADGE.resolved;

                return (
                  <Fragment key={a.id}>
                    <tr
                      className={cn(
                        'border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer',
                        isExpanded && 'bg-[var(--bg-tertiary)]',
                      )}
                      onClick={() => setExpandedRow(isExpanded ? null : a.id)}
                    >
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="status" status={sevBadge.status}>
                          {sevBadge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{a.metric}</td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{a.service}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--text-primary)]">
                        {a.value}{' '}
                        <span className="text-[var(--text-muted)]">({a.expected})</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        <span
                          className={cn(
                            'font-medium',
                            a.deviation > 100
                              ? 'text-[var(--status-critical)]'
                              : a.deviation > 50
                                ? 'text-[var(--status-warning)]'
                                : 'text-[var(--text-secondary)]',
                          )}
                        >
                          {a.deviation > 0 ? '+' : ''}
                          {a.deviation}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="status" status={statusBadge.status}>
                          {statusBadge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">
                        {getRelativeTime(new Date(a.detectedAt))}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-[180px] truncate">
                        {a.rootCause ?? '---'}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)] max-w-[180px] truncate">
                        {a.recommendation ?? '---'}
                      </td>
                    </tr>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <tr className="bg-[var(--bg-tertiary)]">
                        <td colSpan={10} className="px-8 py-3">
                          <div className="space-y-2">
                            {a.rootCause && (
                              <div>
                                <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                                  Root Cause
                                </span>
                                <p className="text-xs text-[var(--text-primary)] mt-0.5 leading-relaxed">
                                  {a.rootCause}
                                </p>
                              </div>
                            )}
                            {a.recommendation && (
                              <div>
                                <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                                  Recommendation
                                </span>
                                <p className="text-xs text-[var(--text-primary)] mt-0.5 leading-relaxed">
                                  {a.recommendation}
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

