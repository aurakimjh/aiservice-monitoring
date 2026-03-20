'use client';

import { useState, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { generateTrace } from '@/lib/demo-data';
import { formatDuration } from '@/lib/utils';
import type { TraceSpan } from '@/types/monitoring';
import {
  Route,
  Copy,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Clock,
  Layers,
  Server,
  Zap,
} from 'lucide-react';

// Service colors for waterfall bars
const SERVICE_COLORS: Record<string, string> = {
  'api-gateway': '#58A6FF',
  'auth-service': '#BC8CFF',
  'rag-service': '#F778BA',
  'embedding-service': '#3FB950',
  'qdrant': '#D29922',
};

const SPAN_NAME_COLORS: Record<string, string> = {
  'rag.guardrail_input_check': '#9B59B6',
  'rag.guardrail_output_check': '#9B59B6',
  'rag.embedding': '#3498DB',
  'embedding.encode': '#3498DB',
  'rag.vector_search': '#2ECC71',
  'qdrant.search': '#2ECC71',
  'rag.llm_inference': '#E67E22',
};

const KIND_LABELS: Record<string, string> = {
  server: 'Server',
  client: 'Client',
  internal: 'Internal',
  producer: 'Producer',
  consumer: 'Consumer',
};

// Build a tree structure from flat spans
interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
  depth: number;
}

function buildSpanTree(spans: TraceSpan[]): SpanNode[] {
  const map = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  for (const span of spans) {
    map.set(span.spanId, { span, children: [], depth: 0 });
  }

  for (const span of spans) {
    const node = map.get(span.spanId)!;
    if (span.parentSpanId && map.has(span.parentSpanId)) {
      const parent = map.get(span.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by startTime
  const sortChildren = (node: SpanNode) => {
    node.children.sort((a, b) => a.span.startTime - b.span.startTime);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
}

function flattenTree(nodes: SpanNode[]): SpanNode[] {
  const result: SpanNode[] = [];
  const walk = (node: SpanNode) => {
    result.push(node);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
}

export default function TraceDetailPage({ params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = use(params);
  const router = useRouter();
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());

  const trace = useMemo(() => generateTrace(traceId), [traceId]);

  const spanTree = useMemo(() => buildSpanTree(trace.spans), [trace.spans]);
  const flatSpans = useMemo(() => {
    // Filter out collapsed children
    const result: SpanNode[] = [];
    const walk = (node: SpanNode) => {
      result.push(node);
      if (!collapsedSpans.has(node.span.spanId)) {
        node.children.forEach(walk);
      }
    };
    spanTree.forEach(walk);
    return result;
  }, [spanTree, collapsedSpans]);

  const selectedSpan = trace.spans.find((s) => s.spanId === selectedSpanId) ?? null;

  const services = useMemo(() => {
    const svcSet = new Set<string>();
    trace.spans.forEach((s) => svcSet.add(s.service));
    return Array.from(svcSet);
  }, [trace.spans]);

  const toggleCollapse = (spanId: string) => {
    setCollapsedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  const copyTrace = () => {
    navigator.clipboard.writeText(trace.traceId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Traces', href: '/traces', icon: <Route size={14} /> },
        { label: trace.traceId.slice(0, 12) + '...' },
      ]} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{trace.rootEndpoint}</h1>
          {trace.errorCount > 0 && (
            <Badge variant="status" status="critical">{trace.errorCount} error{trace.errorCount > 1 && 's'}</Badge>
          )}
          {trace.errorCount === 0 && (
            <Badge variant="status" status="healthy">OK</Badge>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatDuration(trace.duration)}
          </span>
          <span className="flex items-center gap-1">
            <Layers size={11} />
            {trace.spanCount} spans
          </span>
          <span className="flex items-center gap-1">
            <Server size={11} />
            {trace.serviceCount} services
          </span>
          <button onClick={copyTrace} className="flex items-center gap-1 text-[var(--accent-primary)] hover:underline">
            Trace: {trace.traceId.slice(0, 16)}...
            {copiedId ? <Check size={11} className="text-[var(--status-healthy)]" /> : <Copy size={11} />}
          </button>
          <span>{new Date(trace.startTime).toLocaleString()}</span>
        </div>
      </div>

      {/* Service Legend */}
      <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
        {services.map((svc) => (
          <span key={svc} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SERVICE_COLORS[svc] ?? '#8B949E' }} />
            {svc}
          </span>
        ))}
      </div>

      {/* Waterfall Timeline */}
      <Card padding="none">
        {/* Time axis */}
        <div className="flex items-center h-7 px-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-default)] text-[10px] text-[var(--text-muted)]">
          <div className="w-[280px] shrink-0 font-medium">Service / Operation</div>
          <div className="flex-1 flex justify-between px-1">
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
              <span key={pct} className="tabular-nums">{formatDuration(Math.round(trace.duration * pct))}</span>
            ))}
          </div>
          <div className="w-[70px] shrink-0 text-right font-medium">Duration</div>
        </div>

        {/* Span rows */}
        <div className="divide-y divide-[var(--border-muted)]">
          {flatSpans.map((node) => {
            const { span } = node;
            const leftPct = ((span.startTime - trace.startTime) / trace.duration) * 100;
            const widthPct = Math.max((span.duration / trace.duration) * 100, 0.3);
            const barColor = span.status === 'error'
              ? '#E74C3C'
              : SPAN_NAME_COLORS[span.name] ?? SERVICE_COLORS[span.service] ?? '#8B949E';
            const isSelected = selectedSpanId === span.spanId;
            const hasChildren = node.children.length > 0;
            const isCollapsed = collapsedSpans.has(span.spanId);

            return (
              <div
                key={span.spanId}
                onClick={() => setSelectedSpanId(isSelected ? null : span.spanId)}
                className={cn(
                  'flex items-center h-9 px-3 cursor-pointer transition-colors',
                  isSelected ? 'bg-[var(--accent-primary)]/10' : 'hover:bg-[var(--bg-tertiary)]',
                )}
              >
                {/* Name column */}
                <div className="w-[280px] shrink-0 flex items-center gap-1 min-w-0" style={{ paddingLeft: `${node.depth * 16}px` }}>
                  {hasChildren ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(span.spanId); }}
                      className="p-0.5 hover:bg-[var(--bg-overlay)] rounded shrink-0"
                    >
                      {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: SERVICE_COLORS[span.service] ?? '#8B949E' }}
                  />
                  {span.status === 'error' && <AlertCircle size={11} className="text-[var(--status-critical)] shrink-0" />}
                  <span className="text-[11px] text-[var(--text-secondary)] truncate">{span.service}</span>
                  <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{span.name}</span>
                </div>

                {/* Bar column */}
                <div className="flex-1 relative h-5 mx-1">
                  <div
                    className={cn(
                      'absolute h-full rounded-sm transition-opacity',
                      isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100',
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: barColor,
                      minWidth: '2px',
                    }}
                  />
                </div>

                {/* Duration column */}
                <div className={cn(
                  'w-[70px] shrink-0 text-right text-[11px] tabular-nums',
                  span.status === 'error' ? 'text-[var(--status-critical)] font-medium' :
                  span.duration > 1000 ? 'text-[var(--status-warning)]' :
                  'text-[var(--text-secondary)]',
                )}>
                  {formatDuration(span.duration)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Span Detail Panel */}
      {selectedSpan && (
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: SERVICE_COLORS[selectedSpan.service] ?? '#8B949E' }}
                />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{selectedSpan.name}</span>
                <Badge variant="tag">{KIND_LABELS[selectedSpan.kind]}</Badge>
                {selectedSpan.status === 'error' ? (
                  <Badge variant="status" status="critical">Error</Badge>
                ) : (
                  <Badge variant="status" status="healthy">OK</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                <span>Service: {selectedSpan.service}</span>
                <span>Duration: {formatDuration(selectedSpan.duration)}</span>
                <span>Start: +{formatDuration(selectedSpan.startTime - trace.startTime)}</span>
                <span>Span ID: {selectedSpan.spanId.slice(0, 12)}</span>
              </div>
              {selectedSpan.statusMessage && (
                <div className="mt-1 text-xs text-[var(--status-critical)]">{selectedSpan.statusMessage}</div>
              )}
            </div>
            <button onClick={() => setSelectedSpanId(null)} className="p-1 hover:bg-[var(--bg-tertiary)] rounded">
              <X size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Attributes */}
          <div className="mb-3">
            <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Attributes</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(selectedSpan.attributes).map(([key, value]) => (
                <div key={key} className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                  <div className="text-[10px] text-[var(--text-muted)] truncate">{key}</div>
                  <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">{String(value)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Events */}
          {selectedSpan.events.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Events</div>
              <div className="space-y-1">
                {selectedSpan.events.map((evt, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-1 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] text-xs">
                    <Zap size={11} className="text-[var(--accent-primary)] shrink-0" />
                    <span className="text-[var(--text-primary)] font-medium">{evt.name}</span>
                    <span className="text-[var(--text-muted)] tabular-nums">
                      +{formatDuration(evt.timestamp - trace.startTime)}
                    </span>
                    {evt.attributes && Object.entries(evt.attributes).map(([k, v]) => (
                      <span key={k} className="text-[var(--text-muted)]">{k}={String(v)}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related links */}
          <div className="mt-3 pt-3 border-t border-[var(--border-muted)] flex items-center gap-3 text-xs">
            {selectedSpan.service.startsWith('rag') && (
              <Link href="/services/s-rag" className="text-[var(--accent-primary)] hover:underline">View rag-service</Link>
            )}
            {selectedSpan.service === 'api-gateway' && (
              <Link href="/services/s-apigw" className="text-[var(--accent-primary)] hover:underline">View api-gateway</Link>
            )}
            {selectedSpan.service === 'auth-service' && (
              <Link href="/services/s-auth" className="text-[var(--accent-primary)] hover:underline">View auth-service</Link>
            )}
            {selectedSpan.service === 'embedding-service' && (
              <Link href="/services/s-embed" className="text-[var(--accent-primary)] hover:underline">View embedding-service</Link>
            )}
            <Link href="/traces" className="text-[var(--accent-primary)] hover:underline">Back to XLog</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
