'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import type { MethodProfile, MethodProfileNode } from '@/types/monitoring';
import {
  ChevronRight,
  ChevronDown,
  Database,
  Globe,
  HardDrive,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface MethodCallTreeProps {
  profile: MethodProfile;
  className?: string;
}

function formatBinding(b: string | number | null): string {
  if (b === null) return 'null';
  if (typeof b === 'string') return "'" + b + "'";
  return String(b);
}

function MethodRow({
  node,
  depth,
  totalDurationMs,
}: {
  node: MethodProfileNode;
  depth: number;
  totalDurationMs: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);

  const hasChildren = node.children.length > 0;
  const selfPct = totalDurationMs > 0 ? ((node.selfTimeMs / totalDurationMs) * 100).toFixed(1) : '0';
  const durationPct = totalDurationMs > 0 ? ((node.durationMs / totalDurationMs) * 100) : 0;
  const hasDetail = !!(node.sql || node.http || node.fileIo);

  return (
    <>
      <div
        className={cn(
          'flex items-center h-8 px-2 text-[11px] border-b border-[var(--border-muted)] cursor-pointer transition-colors',
          node.slow ? 'bg-[var(--status-warning)]/5' : 'hover:bg-[var(--bg-tertiary)]',
          detailOpen && 'bg-[var(--accent-primary)]/5',
        )}
        onClick={() => hasDetail && setDetailOpen(!detailOpen)}
      >
        <div
          className="flex items-center gap-0.5 shrink-0 min-w-0 flex-1"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-0.5 hover:bg-[var(--bg-overlay)] rounded shrink-0"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {node.sql && <Database size={11} className="text-[#3498DB] shrink-0 mr-0.5" />}
          {node.http && <Globe size={11} className="text-[#E67E22] shrink-0 mr-0.5" />}
          {node.fileIo && <HardDrive size={11} className="text-[#2ECC71] shrink-0 mr-0.5" />}
          {node.slow && <AlertTriangle size={11} className="text-[var(--status-warning)] shrink-0 mr-0.5" />}

          <span className="text-[var(--text-muted)] truncate mr-1">{node.className.split('.').pop()}</span>
          <span className={cn('font-medium truncate', node.slow ? 'text-[var(--status-warning)]' : 'text-[var(--text-primary)]')}>
            {node.name}
          </span>
        </div>

        <div className="w-24 flex items-center gap-2 mx-2 shrink-0">
          <div className="flex-1 h-3 bg-[var(--bg-tertiary)] rounded-sm overflow-hidden relative">
            <div
              className={cn(
                'h-full rounded-sm',
                node.slow ? 'bg-[var(--status-warning)]' : 'bg-[var(--accent-primary)]',
              )}
              style={{ width: `${Math.max(durationPct, 0.5)}%`, opacity: 0.7 }}
            />
          </div>
        </div>

        <div className={cn(
          'w-16 text-right tabular-nums shrink-0',
          node.slow ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]',
        )}>
          {node.durationMs}ms
        </div>

        <div className="w-20 text-right tabular-nums text-[var(--text-muted)] shrink-0">
          {node.selfTimeMs}ms ({selfPct}%)
        </div>
      </div>

      {detailOpen && hasDetail && (
        <div className="px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-muted)]" style={{ paddingLeft: `${depth * 16 + 32}px` }}>
          {node.sql && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-medium">
                <Database size={10} /> SQL Query
                {node.sql.slow && <Badge variant="status" status="warning">Slow</Badge>}
              </div>
              <pre className="text-[11px] text-[var(--text-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 rounded-[var(--radius-sm)] overflow-x-auto whitespace-pre-wrap font-mono">
                {node.sql.query}
              </pre>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span>Bindings: [{node.sql.bindings.map(formatBinding).join(', ')}]</span>
                <span>{node.sql.executionMs}ms</span>
                <span>{node.sql.rowCount} row{node.sql.rowCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}
          {node.http && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-medium">
                <Globe size={10} /> HTTP Call
              </div>
              <div className="text-[11px] text-[var(--text-primary)]">
                <Badge variant="tag">{node.http.method}</Badge>
                <span className="ml-1.5 font-mono">{node.http.url}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span>Status: {node.http.statusCode}</span>
                <span>{node.http.durationMs}ms</span>
              </div>
            </div>
          )}
          {node.fileIo && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-medium">
                <HardDrive size={10} /> File I/O
              </div>
              <div className="text-[11px] text-[var(--text-primary)] font-mono">{node.fileIo.path}</div>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span>{node.fileIo.operation}</span>
                <span>{(node.fileIo.sizeBytes / 1024).toFixed(1)} KB</span>
                <span>{node.fileIo.durationMs}ms</span>
              </div>
            </div>
          )}
        </div>
      )}

      {expanded && hasChildren && node.children.map((child) => (
        <MethodRow key={child.id} node={child} depth={depth + 1} totalDurationMs={totalDurationMs} />
      ))}
    </>
  );
}

export function MethodCallTree({ profile, className }: MethodCallTreeProps) {
  return (
    <div className={cn('', className)}>
      <div className="flex items-center gap-4 mb-3 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          Total: {profile.totalDurationMs}ms
        </span>
        <span>{profile.totalMethods} methods</span>
        {profile.slowQueries > 0 && (
          <span className="flex items-center gap-1 text-[var(--status-warning)]">
            <AlertTriangle size={12} />
            {profile.slowQueries} slow
          </span>
        )}
        <Badge variant="tag">{profile.language}</Badge>
        <span>{profile.serviceName}</span>
      </div>

      <div className="flex items-center h-7 px-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-default)] text-[10px] text-[var(--text-muted)] font-medium">
        <div className="flex-1">Method</div>
        <div className="w-24 text-center mx-2">Timeline</div>
        <div className="w-16 text-right">Duration</div>
        <div className="w-20 text-right">Self</div>
      </div>

      <div>
        <MethodRow node={profile.rootNode} depth={0} totalDurationMs={profile.totalDurationMs} />
      </div>
    </div>
  );
}
