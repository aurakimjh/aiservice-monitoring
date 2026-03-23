'use client';

import { useState, useMemo, useCallback } from 'react';
import type { FlameGraphNode } from '@/types/monitoring';

interface FlameGraphProps {
  root: FlameGraphNode;
  height?: number;
  profileType?: string;
  onNodeClick?: (node: FlameGraphNode) => void;
}

const COLORS = [
  '#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF',
  '#F778BA', '#79C0FF', '#56D364', '#FFD700', '#FF6B6B',
];

function getColor(name: string, selfPercent: number): string {
  if (selfPercent > 20) return '#F85149';
  if (selfPercent > 10) return '#D29922';
  // Hash-based color by package
  let hash = 0;
  const pkg = name.split('.')[0] || name.split('/')[0] || name;
  for (let i = 0; i < pkg.length; i++) {
    hash = ((hash << 5) - hash + pkg.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface FlatFrame {
  node: FlameGraphNode;
  depth: number;
  x: number;
  width: number;
}

function flattenTree(node: FlameGraphNode, depth: number, x: number, totalValue: number): FlatFrame[] {
  const frames: FlatFrame[] = [];
  const width = totalValue > 0 ? node.value / totalValue : 1;

  if (depth > 0) {
    frames.push({ node, depth, x, width });
  }

  let childX = x;
  for (const child of node.children) {
    const childFrames = flattenTree(child, depth + 1, childX, totalValue);
    frames.push(...childFrames);
    childX += totalValue > 0 ? child.value / totalValue : 0;
  }
  return frames;
}

export function FlameGraph({ root, height = 500, profileType = 'cpu', onNodeClick }: FlameGraphProps) {
  const [zoomNode, setZoomNode] = useState<FlameGraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FlameGraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<FlameGraphNode[]>([]);

  const activeRoot = zoomNode || root;
  const totalValue = activeRoot.value || 1;

  const frames = useMemo(() => flattenTree(activeRoot, 0, 0, totalValue), [activeRoot, totalValue]);
  const maxDepth = useMemo(() => frames.reduce((max, f) => Math.max(max, f.depth), 0), [frames]);

  const frameHeight = 20;
  const chartHeight = Math.max(height, (maxDepth + 1) * frameHeight + 60);

  const handleZoom = useCallback((node: FlameGraphNode) => {
    setZoomNode(node);
    setBreadcrumbs(prev => [...prev, node]);
    onNodeClick?.(node);
  }, [onNodeClick]);

  const handleBreadcrumb = useCallback((idx: number) => {
    if (idx < 0) {
      setZoomNode(null);
      setBreadcrumbs([]);
    } else {
      setZoomNode(breadcrumbs[idx]);
      setBreadcrumbs(prev => prev.slice(0, idx + 1));
    }
  }, [breadcrumbs]);

  return (
    <div className="w-full">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-2 text-xs text-[var(--text-secondary)]">
        <button
          onClick={() => handleBreadcrumb(-1)}
          className="hover:text-[var(--text-primary)] transition-colors"
        >
          root
        </button>
        {breadcrumbs.map((bc, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <button
              onClick={() => handleBreadcrumb(i)}
              className="hover:text-[var(--text-primary)] transition-colors truncate max-w-[200px]"
            >
              {bc.name}
            </button>
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div className="mb-2 p-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded text-xs">
          <div className="font-mono font-medium">{hoveredNode.fullName || hoveredNode.name}</div>
          <div className="flex gap-4 mt-1 text-[var(--text-secondary)]">
            <span>Total: {hoveredNode.value.toLocaleString()} ({((hoveredNode.value / totalValue) * 100).toFixed(1)}%)</span>
            <span>Self: {hoveredNode.selfValue.toLocaleString()} ({((hoveredNode.selfValue / totalValue) * 100).toFixed(1)}%)</span>
          </div>
        </div>
      )}

      {/* Flame Graph */}
      <div className="relative overflow-x-auto border border-[var(--border-default)] rounded bg-[var(--bg-primary)]">
        <svg width="100%" height={chartHeight} viewBox={`0 0 1000 ${chartHeight}`} preserveAspectRatio="none">
          {frames.map((frame, i) => {
            const y = (frame.depth - 1) * frameHeight + 4;
            const x = frame.x * 1000;
            const w = Math.max(frame.width * 1000 - 1, 1);
            const selfPercent = totalValue > 0 ? (frame.node.selfValue / totalValue) * 100 : 0;
            const color = getColor(frame.node.name, selfPercent);

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredNode(frame.node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleZoom(frame.node)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={frameHeight - 2}
                  fill={color}
                  opacity={hoveredNode === frame.node ? 1 : 0.85}
                  rx={2}
                />
                {w > 40 && (
                  <text
                    x={x + 3}
                    y={y + frameHeight / 2 + 1}
                    fontSize="10"
                    fill="white"
                    dominantBaseline="middle"
                    className="pointer-events-none select-none"
                  >
                    {frame.node.name.length > Math.floor(w / 6)
                      ? frame.node.name.slice(0, Math.floor(w / 6)) + '…'
                      : frame.node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-secondary)]">
        <span>Type: <strong className="text-[var(--text-primary)]">{profileType.toUpperCase()}</strong></span>
        <span>Total: <strong className="text-[var(--text-primary)]">{totalValue.toLocaleString()}</strong> samples</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ background: '#F85149' }} /> &gt;20% self
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ background: '#D29922' }} /> &gt;10% self
        </span>
      </div>
    </div>
  );
}
