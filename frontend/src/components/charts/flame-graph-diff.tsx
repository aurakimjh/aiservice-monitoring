'use client';

import { useMemo, useState } from 'react';
import type { FlameGraphDiffNode } from '@/types/monitoring';

interface FlameGraphDiffProps {
  root: FlameGraphDiffNode;
  height?: number;
}

function getDiffColor(delta: number, maxDelta: number): string {
  if (maxDelta === 0) return '#58A6FF';
  const ratio = delta / maxDelta;
  if (ratio > 0.1) return `rgba(248, 81, 73, ${Math.min(Math.abs(ratio), 1)})`;  // red = regression
  if (ratio < -0.1) return `rgba(63, 185, 80, ${Math.min(Math.abs(ratio), 1)})`; // green = improvement
  return '#58A6FF'; // neutral
}

interface FlatDiffFrame {
  node: FlameGraphDiffNode;
  depth: number;
  x: number;
  width: number;
}

function flattenDiffTree(node: FlameGraphDiffNode, depth: number, x: number, totalValue: number): FlatDiffFrame[] {
  const frames: FlatDiffFrame[] = [];
  const maxVal = Math.max(node.baseValue, node.targetValue);
  const width = totalValue > 0 ? maxVal / totalValue : 1;

  if (depth > 0) {
    frames.push({ node, depth, x, width });
  }

  let childX = x;
  for (const child of node.children) {
    const childFrames = flattenDiffTree(child, depth + 1, childX, totalValue);
    frames.push(...childFrames);
    const childMax = Math.max(child.baseValue, child.targetValue);
    childX += totalValue > 0 ? childMax / totalValue : 0;
  }
  return frames;
}

export function FlameGraphDiff({ root, height = 500 }: FlameGraphDiffProps) {
  const [hoveredNode, setHoveredNode] = useState<FlameGraphDiffNode | null>(null);

  const totalValue = Math.max(root.baseValue, root.targetValue) || 1;
  const frames = useMemo(() => flattenDiffTree(root, 0, 0, totalValue), [root, totalValue]);
  const maxDelta = useMemo(() => frames.reduce((max, f) => Math.max(max, Math.abs(f.node.delta)), 0), [frames]);
  const maxDepth = useMemo(() => frames.reduce((max, f) => Math.max(max, f.depth), 0), [frames]);

  const frameHeight = 20;
  const chartHeight = Math.max(height, (maxDepth + 1) * frameHeight + 60);

  return (
    <div className="w-full">
      {hoveredNode && (
        <div className="mb-2 p-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded text-xs">
          <div className="font-mono font-medium">{hoveredNode.fullName || hoveredNode.name}</div>
          <div className="flex gap-4 mt-1 text-[var(--text-secondary)]">
            <span>Base: {hoveredNode.baseValue.toLocaleString()}</span>
            <span>Target: {hoveredNode.targetValue.toLocaleString()}</span>
            <span className={hoveredNode.delta > 0 ? 'text-red-400' : hoveredNode.delta < 0 ? 'text-green-400' : ''}>
              Delta: {hoveredNode.delta > 0 ? '+' : ''}{hoveredNode.delta.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <div className="relative overflow-x-auto border border-[var(--border-default)] rounded bg-[var(--bg-primary)]">
        <svg width="100%" height={chartHeight} viewBox={`0 0 1000 ${chartHeight}`} preserveAspectRatio="none">
          {frames.map((frame, i) => {
            const y = (frame.depth - 1) * frameHeight + 4;
            const x = frame.x * 1000;
            const w = Math.max(frame.width * 1000 - 1, 1);
            const color = getDiffColor(frame.node.delta, maxDelta);

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredNode(frame.node)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect x={x} y={y} width={w} height={frameHeight - 2} fill={color} opacity={0.85} rx={2} />
                {w > 40 && (
                  <text x={x + 3} y={y + frameHeight / 2 + 1} fontSize="10" fill="white" dominantBaseline="middle" className="pointer-events-none select-none">
                    {frame.node.name.length > Math.floor(w / 6) ? frame.node.name.slice(0, Math.floor(w / 6)) + '…' : frame.node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" /> Regression</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400" /> Improvement</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400" /> Unchanged</span>
      </div>
    </div>
  );
}
