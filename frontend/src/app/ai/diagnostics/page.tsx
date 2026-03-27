'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { AISubNav } from '@/components/ai';
import { useDataSource } from '@/hooks/use-data-source';
import { Bot, Stethoscope, CheckCircle2, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';

interface AIItemResult {
  item_id: string;
  name: string;
  status: string; // pass, warn, fail
  severity: string;
  message: string;
  evidence: string;
  timestamp: string;
}

interface DiagResult {
  items: AIItemResult[];
  total: number;
  passed: number;
  warned: number;
  failed: number;
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle2, color: 'text-[var(--status-healthy)]', bg: 'bg-[var(--status-healthy)]/10', label: 'PASS' },
  warn: { icon: AlertTriangle, color: 'text-[var(--status-warning)]', bg: 'bg-[var(--status-warning)]/10', label: 'WARN' },
  fail: { icon: XCircle, color: 'text-[var(--status-critical)]', bg: 'bg-[var(--status-critical)]/10', label: 'FAIL' },
};

export default function AIDiagnosticsPage() {
  const demoFallback = useCallback((): DiagResult => ({
    items: [], total: 0, passed: 0, warned: 0, failed: 0,
  }), []);

  const { data, source } = useDataSource<DiagResult>(
    '/genai/diagnostics',
    demoFallback,
    { refreshInterval: 60_000 },
  );

  const result = data ?? { items: [], total: 0, passed: 0, warned: 0, failed: 0 };

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'AI Diagnostics', icon: <Stethoscope size={14} /> },
      ]} />
      <AISubNav />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">AI Diagnostic Items</h1>
        <DataSourceBadge source={source} />
        <Badge>{result.total} items</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Items" value={result.total} status="healthy" />
        <KPICard title="Passed" value={result.passed} status="healthy" />
        <KPICard title="Warned" value={result.warned} status={result.warned > 0 ? 'warning' : 'healthy'} />
        <KPICard title="Failed" value={result.failed} status={result.failed > 0 ? 'critical' : 'healthy'} />
      </div>

      {/* Item Cards */}
      <div className="space-y-3">
        {result.items.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              No AI diagnostic results. Connect to Collection Server to run diagnostics.
            </div>
          </Card>
        ) : (
          result.items.map((item) => {
            const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pass;
            const Icon = cfg.icon;
            return (
              <Card key={item.item_id}>
                <div className="flex items-start gap-4">
                  {/* Status icon */}
                  <div className={cn('shrink-0 w-10 h-10 rounded-full flex items-center justify-center', cfg.bg)}>
                    <Icon size={20} className={cfg.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{item.name}</span>
                      <Badge variant="status" status={item.status === 'pass' ? 'healthy' : item.status === 'warn' ? 'warning' : 'critical'}>
                        {cfg.label}
                      </Badge>
                      <Badge>{item.severity}</Badge>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">{item.item_id}</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{item.message}</p>
                    {item.evidence && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-[var(--accent-primary)]">
                        <ExternalLink size={10} />
                        <span className="font-mono">{item.evidence}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
