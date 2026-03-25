'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { FlameGraphNode } from '@/types/monitoring';

interface SystemFlamegraphProps {
  root: FlameGraphNode;
  height?: number;
  profileType?: 'cpu' | 'offcpu' | 'memory' | 'mixed' | 'diff';
  onNodeClick?: (node: FlameGraphNode) => void;
}

// Color schemes per profile type
function getColor(name: string, selfPercent: number, profileType: string): string {
  // Kernel frames
  if (name.includes('kthread') || name.includes('entry_SYSCALL') ||
      name.includes('do_syscall') || name.includes('io_schedule') ||
      name.includes('swapper') || name.includes('cpuidle') ||
      name.includes('do_idle') || name.includes('intel_idle') ||
      name.includes('epoll_wait') || name.includes('futex_wait')) {
    return '#4a5568';
  }

  switch (profileType) {
    case 'offcpu': {
      // Cool blue gradient
      const intensity = Math.min(selfPercent / 20, 1);
      const r = Math.round(30 + 60 * intensity);
      const g = Math.round(100 + 80 * (1 - intensity));
      const b = Math.round(180 + 75 * intensity);
      return `rgb(${r},${g},${b})`;
    }
    case 'memory': {
      // Green gradient
      const intensity = Math.min(selfPercent / 20, 1);
      const r = Math.round(40 + 60 * intensity);
      const g = Math.round(160 + 80 * (1 - intensity));
      const b = Math.round(60 + 40 * intensity);
      return `rgb(${r},${g},${b})`;
    }
    default: {
      // CPU: warm orange/yellow gradient
      const intensity = Math.min(selfPercent / 20, 1);
      const r = Math.round(200 + 55 * intensity);
      const g = Math.round(120 + 80 * (1 - intensity));
      const b = Math.round(30 + 50 * (1 - intensity));
      return `rgb(${r},${g},${b})`;
    }
  }
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

const TYPE_LABELS: Record<string, { label: string; colorLabel: string }> = {
  cpu: { label: 'On-CPU', colorLabel: 'Warm (orange)' },
  offcpu: { label: 'Off-CPU', colorLabel: 'Cool (blue)' },
  memory: { label: 'Memory', colorLabel: 'Green' },
  mixed: { label: 'Mixed', colorLabel: 'Mixed' },
};

export function SystemFlamegraph({ root, height = 500, profileType = 'cpu', onNodeClick }: SystemFlamegraphProps) {
  const [zoomNode, setZoomNode] = useState<FlameGraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FlameGraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<FlameGraphNode[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FlameGraphNode } | null>(null);

  const activeRoot = zoomNode || root;
  const totalValue = activeRoot.value || 1;

  const frames = useMemo(() => flattenTree(activeRoot, 0, 0, totalValue), [activeRoot, totalValue]);
  const maxDepth = useMemo(() => frames.reduce((max, f) => Math.max(max, f.depth), 0), [frames]);

  const frameHeight = 18;
  const chartHeight = Math.max(height, (maxDepth + 1) * frameHeight + 60);

  const handleZoom = useCallback((node: FlameGraphNode) => {
    setZoomNode(node);
    setBreadcrumbs(prev => [...prev, node]);
    onNodeClick?.(node);
    setContextMenu(null);
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

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FlameGraphNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleCopyName = useCallback(() => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.node.fullName || contextMenu.node.name);
      setContextMenu(null);
    }
  }, [contextMenu]);

  const handleFocusSubtree = useCallback(() => {
    if (contextMenu) {
      handleZoom(contextMenu.node);
    }
  }, [contextMenu, handleZoom]);

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => !prev);
    if (!showSearch) {
      setTimeout(() => searchRef.current?.focus(), 100);
    } else {
      setSearchTerm('');
    }
  }, [showSearch]);

  const isSearchMatch = useCallback((name: string) => {
    if (!searchTerm) return true;
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  }, [searchTerm]);

  const typeInfo = TYPE_LABELS[profileType] || TYPE_LABELS.cpu;

  return (
    <div className="w-full" onClick={() => setContextMenu(null)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          <button
            onClick={() => handleBreadcrumb(-1)}
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            root
          </button>
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-[var(--text-muted)]">/</span>
              <button
                onClick={() => handleBreadcrumb(i)}
                className="hover:text-[var(--text-primary)] transition-colors truncate max-w-[200px]"
              >
                {bc.name}
              </button>
            </span>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {showSearch && (
            <input
              ref={searchRef}
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search function..."
              className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1 w-40 text-[var(--text-primary)]"
            />
          )}
          <button
            onClick={toggleSearch}
            className="text-xs px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {showSearch ? 'Close' : 'Search'}
          </button>
          <button
            onClick={() => { setZoomNode(null); setBreadcrumbs([]); }}
            className="text-xs px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredNode && (
        <div className="mb-2 p-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded text-xs">
          <div className="font-mono font-medium text-[var(--text-primary)]">{hoveredNode.fullName || hoveredNode.name}</div>
          <div className="flex gap-4 mt-1 text-[var(--text-secondary)]">
            <span>Total: {hoveredNode.value.toLocaleString()} ({((hoveredNode.value / totalValue) * 100).toFixed(1)}%)</span>
            <span>Self: {hoveredNode.selfValue.toLocaleString()} ({((hoveredNode.selfValue / totalValue) * 100).toFixed(1)}%)</span>
            <span>Samples: {hoveredNode.value.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Flamegraph SVG */}
      <div className="relative overflow-x-auto border border-[var(--border-default)] rounded bg-[var(--bg-primary)]">
        <svg width="100%" height={chartHeight} viewBox={`0 0 1000 ${chartHeight}`} preserveAspectRatio="none">
          {frames.map((frame, i) => {
            const y = (frame.depth - 1) * frameHeight + 4;
            const x = frame.x * 1000;
            const w = Math.max(frame.width * 1000 - 1, 1);
            const selfPercent = totalValue > 0 ? (frame.node.selfValue / totalValue) * 100 : 0;
            const color = getColor(frame.node.name, selfPercent, profileType);
            const matchesSearch = isSearchMatch(frame.node.fullName || frame.node.name);

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredNode(frame.node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleZoom(frame.node)}
                onContextMenu={(e) => handleContextMenu(e, frame.node)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={frameHeight - 2}
                  fill={color}
                  opacity={searchTerm ? (matchesSearch ? 1 : 0.3) : (hoveredNode === frame.node ? 1 : 0.85)}
                  rx={1}
                  stroke={matchesSearch && searchTerm ? '#ffff00' : 'none'}
                  strokeWidth={matchesSearch && searchTerm ? 1 : 0}
                />
                {w > 40 && (
                  <text
                    x={x + 3}
                    y={y + frameHeight / 2}
                    fontSize="10"
                    fill="white"
                    dominantBaseline="middle"
                    className="pointer-events-none select-none"
                  >
                    {frame.node.name.length > Math.floor(w / 6)
                      ? frame.node.name.slice(0, Math.floor(w / 6)) + '...'
                      : frame.node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Mini-map */}
        {zoomNode && (
          <div className="absolute top-1 right-1 w-32 h-16 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded opacity-70 p-0.5">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              {flattenTree(root, 0, 0, root.value || 1).slice(0, 50).map((f, i) => (
                <rect
                  key={i}
                  x={f.x * 100}
                  y={f.depth * 8}
                  width={Math.max(f.width * 100, 0.5)}
                  height={6}
                  fill={f.node === zoomNode ? '#fff' : '#555'}
                  opacity={0.6}
                />
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded shadow-lg py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleFocusSubtree}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
          >
            Focus on subtree
          </button>
          <button
            onClick={handleCopyName}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
          >
            Copy function name
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-secondary)]">
        <span>Type: <strong className="text-[var(--text-primary)]">{typeInfo.label}</strong></span>
        <span>Total: <strong className="text-[var(--text-primary)]">{totalValue.toLocaleString()}</strong> {profileType === 'memory' ? 'bytes' : 'samples'}</span>
        <span>Color: {typeInfo.colorLabel}</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ background: '#4a5568' }} /> Kernel
        </span>
      </div>
    </div>
  );
}
