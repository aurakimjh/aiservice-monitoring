'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { useDataSource } from '@/hooks/use-data-source';
import { Bot, Brain, Zap, Clock, DollarSign, ChevronDown, ChevronUp, Hash, Layers } from 'lucide-react';

interface PipelineTrace {
  trace_id: string;
  total_ms: number;
  stages: { name: string; offset_ms: number; duration_ms: number; attributes: Record<string, unknown> }[];
}

const STAGE_COLORS: Record<string, string> = {
  'rag.workflow': '#58A6FF',
  'rag.embedding': '#3498DB',
  'rag.vector_search': '#2ECC71',
  'gen_ai.chat': '#E67E22',
  'rag.guardrail_input': '#9B59B6',
  'rag.guardrail_output': '#9B59B6',
};

interface LLMSpan {
  trace_id: string;
  span_id: string;
  operation: string;
  service: string;
  start_time: number;
  duration_ms: number;
  model: string | null;
  system: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  finish_reason: string | null;
  cost_usd: number | null;
  latency_ms: number | null;
  attributes: Record<string, unknown>;
}

const SYSTEM_COLORS: Record<string, string> = {
  openai: 'bg-[#10A37F]/15 text-[#10A37F]',
  anthropic: 'bg-[#D97706]/15 text-[#D97706]',
  ollama: 'bg-[#3B82F6]/15 text-[#3B82F6]',
};

export default function LLMTracesPage() {
  const demoFallback = useCallback(() => [] as LLMSpan[], []);
  const { data, source } = useDataSource<LLMSpan[]>(
    '/genai/spans?limit=100',
    demoFallback,
    { refreshInterval: 10_000, transform: (raw) => (raw as { items?: LLMSpan[] }).items ?? [] },
  );

  const spans = data ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // KPIs
  const totalCalls = spans.length;
  const totalTokens = spans.reduce((s, sp) => s + (sp.total_tokens ?? 0), 0);
  const totalCost = spans.reduce((s, sp) => s + (sp.cost_usd ?? 0), 0);
  const avgLatency = totalCalls > 0
    ? Math.round(spans.reduce((s, sp) => s + (sp.duration_ms ?? 0), 0) / totalCalls)
    : 0;
  const models = [...new Set(spans.map((s) => s.model).filter(Boolean))];

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'LLM Traces', icon: <Brain size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">LLM Call Traces</h1>
          <DataSourceBadge source={source} />
          <Badge>{totalCalls} calls</Badge>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard helpId="llm-total-calls" title="Total LLM Calls" value={totalCalls} status="healthy" />
        <KPICard helpId="llm-total-tokens" title="Total Tokens" value={totalTokens.toLocaleString()} status="healthy" />
        <KPICard
          helpId="llm-total-cost"
          title="Total Cost"
          value={`$${totalCost.toFixed(4)}`}
          subtitle={totalCost === 0 ? 'Local LLM ($0)' : undefined}
          status={totalCost > 10 ? 'warning' : 'healthy'}
        />
        <KPICard
          helpId="llm-avg-latency"
          title="Avg Latency"
          value={avgLatency}
          unit="ms"
          status={avgLatency > 2000 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Models summary */}
      {models.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">Models:</span>
          {models.map((m) => (
            <Badge key={m}>{m}</Badge>
          ))}
        </div>
      )}

      {/* Pipeline Waterfall */}
      <PipelineWaterfall />

      {/* LLM Span List */}
      <Card padding="none">
        {spans.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Brain size={32} className="mx-auto text-[var(--text-muted)] opacity-30" />
            <div className="text-sm text-[var(--text-muted)]">No LLM calls detected</div>
            <div className="text-xs text-[var(--text-muted)]">
              Instrument your LLM calls with OTel GenAI semantic conventions to see traces here
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-muted)]">
            {spans.map((span) => {
              const isExpanded = expandedId === span.span_id;
              const systemColor = SYSTEM_COLORS[span.system ?? ''] ?? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]';
              return (
                <div key={span.span_id}>
                  <div
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : span.span_id)}
                  >
                    {/* System badge */}
                    <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', systemColor)}>
                      {(span.system ?? 'llm').toUpperCase()}
                    </span>

                    {/* Model + operation */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{span.model ?? span.operation}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{span.service}</span>
                      </div>
                    </div>

                    {/* Tokens */}
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                      <Hash size={10} />
                      <span className="tabular-nums">{span.total_tokens ?? '-'} tok</span>
                    </div>

                    {/* Cost */}
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                      <DollarSign size={10} />
                      <span className="tabular-nums">{span.cost_usd != null ? `$${span.cost_usd.toFixed(4)}` : '-'}</span>
                    </div>

                    {/* Latency */}
                    <div className={cn('text-xs tabular-nums font-medium w-16 text-right',
                      (span.duration_ms ?? 0) > 2000 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>
                      {span.duration_ms ?? 0}ms
                    </div>

                    {/* Time */}
                    <span className="text-[10px] text-[var(--text-muted)] w-20 text-right">
                      {span.start_time ? new Date(span.start_time).toLocaleTimeString() : '-'}
                    </span>

                    {/* Expand */}
                    {isExpanded ? <ChevronUp size={12} className="text-[var(--text-muted)]" /> : <ChevronDown size={12} className="text-[var(--text-muted)]" />}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-muted)]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 text-xs">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">Trace ID</div>
                          <div className="font-mono text-[var(--text-primary)] truncate">{span.trace_id}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">Input Tokens</div>
                          <div className="font-medium text-[var(--text-primary)] tabular-nums">{span.input_tokens ?? '-'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">Output Tokens</div>
                          <div className="font-medium text-[var(--text-primary)] tabular-nums">{span.output_tokens ?? '-'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)]">Finish Reason</div>
                          <div className="text-[var(--text-primary)]">{span.finish_reason ?? '-'}</div>
                        </div>
                      </div>
                      {/* All GenAI attributes */}
                      {Object.keys(span.attributes).length > 0 && (
                        <div className="pt-2 border-t border-[var(--border-muted)]">
                          <div className="text-[10px] text-[var(--text-muted)] mb-1">GenAI Attributes</div>
                          <div className="grid grid-cols-2 gap-1">
                            {Object.entries(span.attributes).map(([k, v]) => (
                              <div key={k} className="text-[10px]">
                                <span className="text-[var(--text-muted)] font-mono">{k}: </span>
                                <span className="text-[var(--text-secondary)]">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Pipeline Waterfall Component ──

function PipelineWaterfall() {
  const API_BASE = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
    : 'http://localhost:8080/api/v1';

  const demoPipelines = useCallback(() => [] as PipelineTrace[], []);
  const { data } = useDataSource<PipelineTrace[]>(
    '/genai/pipeline-traces?limit=5',
    demoPipelines,
    { refreshInterval: 15_000, transform: (raw) => (raw as { items?: PipelineTrace[] }).items ?? [] },
  );
  const pipelines = data ?? [];

  if (pipelines.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[var(--text-muted)]" />
          <CardTitle>Pipeline Waterfall (Recent)</CardTitle>
        </div>
      </CardHeader>
      <div className="space-y-3">
        {pipelines.slice(0, 3).map((p) => (
          <div key={p.trace_id} className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono text-[var(--text-muted)]">{p.trace_id.slice(0, 16)}...</span>
              <span className="font-medium text-[var(--text-primary)] tabular-nums">{p.total_ms}ms total</span>
            </div>
            <div className="relative h-6 bg-[var(--bg-tertiary)] rounded overflow-hidden">
              {p.stages.map((stage, i) => {
                const left = p.total_ms > 0 ? (stage.offset_ms / p.total_ms) * 100 : 0;
                const width = p.total_ms > 0 ? Math.max((stage.duration_ms / p.total_ms) * 100, 2) : 0;
                const color = STAGE_COLORS[stage.name] ?? '#8B949E';
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full rounded-sm flex items-center px-1 overflow-hidden"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                    title={`${stage.name}: ${stage.duration_ms}ms`}
                  >
                    <span className="text-[7px] text-white font-bold truncate">
                      {stage.name.replace('rag.', '').replace('gen_ai.', '')} {stage.duration_ms}ms
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)] pt-1">
          {Object.entries(STAGE_COLORS).map(([name, color]) => (
            <span key={name} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
              {name.replace('rag.', '').replace('gen_ai.', '')}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
