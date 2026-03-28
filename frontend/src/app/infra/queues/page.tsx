'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getMessageQueues } from '@/lib/demo-data';
import type { MessageQueueMetrics } from '@/types/monitoring';
import { Server, MessageSquare, Layers, Activity, AlertTriangle } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  kafka: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  rabbitmq: 'bg-green-500/15 text-green-400 border-green-500/30',
  activemq: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function QueuesPage() {
  const demoFallback = useCallback(() => getMessageQueues(), []);
  const { data: queuesData, source } = useDataSource('/infra/queues', demoFallback, { refreshInterval: 30_000 });
  const queues: MessageQueueMetrics[] = Array.isArray(queuesData) ? queuesData : (queuesData as any)?.items ?? getMessageQueues();

  const totalQueues = queues.length;
  const totalMessages = queues.reduce((s, q) => s + q.totalMessages, 0);
  const totalThroughput = queues.reduce((s, q) => s + q.messagesPerSec, 0);
  const totalLag = queues.reduce((s, q) => s + q.consumerLag, 0);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', href: '/infra', icon: <Server size={14} /> },
        { label: 'Message Queues', icon: <MessageSquare size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Message Queue Monitoring</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Total Queues"
          value={totalQueues}
          status="healthy"
        />
        <KPICard
          title="Total Messages"
          value={formatNumber(totalMessages)}
          status="healthy"
        />
        <KPICard
          title="Throughput"
          value={totalThroughput.toLocaleString()}
          unit="/s"
          status="healthy"
        />
        <KPICard
          title="Consumer Lag"
          value={totalLag.toLocaleString()}
          status={totalLag > 5000 ? 'critical' : totalLag > 1000 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Queue Instance Cards */}
      <div className="space-y-3">
        {queues.map((q) => (
          <Card key={q.id}>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="status"
                    className={cn(
                      'text-[10px] uppercase font-bold',
                      TYPE_COLORS[q.type] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30',
                    )}
                  >
                    {q.type}
                  </Badge>
                  <CardTitle>{q.name}</CardTitle>
                </div>
                <Badge variant="status" status={q.status === 'healthy' ? 'healthy' : q.status === 'warning' ? 'warning' : 'critical'}>
                  {q.status}
                </Badge>
              </div>
            </CardHeader>
            <div className="px-4 pb-4">
              {/* Metrics Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                      <th className="px-3 py-2 font-medium">Brokers</th>
                      <th className="px-3 py-2 font-medium">Topics</th>
                      <th className="px-3 py-2 font-medium">Messages</th>
                      <th className="px-3 py-2 font-medium">Messages/sec</th>
                      <th className="px-3 py-2 font-medium">Consumer Groups</th>
                      <th className="px-3 py-2 font-medium">Consumer Lag</th>
                      {q.type === 'kafka' && (
                        <>
                          <th className="px-3 py-2 font-medium">Partitions</th>
                          <th className="px-3 py-2 font-medium">Replication Factor</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-[var(--text-secondary)]">
                      <td className="px-3 py-2 tabular-nums">{q.brokers}</td>
                      <td className="px-3 py-2 tabular-nums">{q.topics}</td>
                      <td className="px-3 py-2 tabular-nums">{formatNumber(q.totalMessages)}</td>
                      <td className="px-3 py-2 tabular-nums">{q.messagesPerSec.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums">{q.consumerGroups}</td>
                      <td className={cn(
                        'px-3 py-2 tabular-nums font-medium',
                        q.consumerLag > 1000 ? 'text-[var(--status-warning)]' : 'text-[var(--status-healthy)]'
                      )}>
                        {q.consumerLag.toLocaleString()}
                      </td>
                      {q.type === 'kafka' && (
                        <>
                          <td className="px-3 py-2 tabular-nums">{q.partitions}</td>
                          <td className="px-3 py-2 tabular-nums">{q.replicationFactor}</td>
                        </>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
