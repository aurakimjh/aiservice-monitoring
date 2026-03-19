'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Status } from '@/types/monitoring';

export interface HexCell {
  id: string;
  label: string;
  status: Status;
  value: number;      // determines size (0-100)
  detail?: string;
  group?: string;
}

interface HexagonMapProps {
  cells: HexCell[];
  sizeMetric?: string;   // label for the metric controlling size
  colorMetric?: string;  // label for the metric controlling color
  className?: string;
  onCellClick?: (id: string) => void;
}

const STATUS_COLORS: Record<Status, string> = {
  healthy: '#3FB950',
  warning: '#D29922',
  critical: '#F85149',
  offline: '#484F58',
  unknown: '#484F58',
};

const STATUS_COLORS_DIM: Record<Status, string> = {
  healthy: 'rgba(63, 185, 80, 0.5)',
  warning: 'rgba(210, 153, 34, 0.5)',
  critical: 'rgba(248, 81, 73, 0.7)',
  offline: 'rgba(72, 79, 88, 0.4)',
  unknown: 'rgba(72, 79, 88, 0.4)',
};

export function HexagonMap({ cells, sizeMetric = 'CPU %', colorMetric = 'Status', className, onCellClick }: HexagonMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HexCell | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cellPositionsRef = useRef<{ cell: HexCell; cx: number; cy: number; r: number }[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = Math.max(200, Math.min(400, cells.length * 8 + 80));

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // Group cells
    const groups = new Map<string, HexCell[]>();
    for (const cell of cells) {
      const g = cell.group ?? 'default';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(cell);
    }

    // Layout: pack hexagons in rows per group
    const minR = 16;
    const maxR = 32;
    const padding = 4;
    const positions: typeof cellPositionsRef.current = [];

    let cursorY = 20;

    for (const [groupName, groupCells] of groups) {
      // Group label
      if (groupName !== 'default') {
        ctx.fillStyle = '#8B949E';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(groupName, 12, cursorY);
        cursorY += 16;
      }

      let cursorX = 12;
      let rowMaxH = 0;

      for (const cell of groupCells) {
        const r = minR + ((cell.value / 100) * (maxR - minR));
        const hexW = r * 2 + padding;

        if (cursorX + hexW > W - 12) {
          cursorX = 12;
          cursorY += rowMaxH + padding;
          rowMaxH = 0;
        }

        const cx = cursorX + r;
        const cy = cursorY + r;
        rowMaxH = Math.max(rowMaxH, r * 2);

        // Draw hexagon
        const isHovered = hovered?.id === cell.id;
        drawHexagon(ctx, cx, cy, r, {
          fill: isHovered ? STATUS_COLORS[cell.status] : STATUS_COLORS_DIM[cell.status],
          stroke: isHovered ? STATUS_COLORS[cell.status] : 'transparent',
          lineWidth: isHovered ? 2 : 0,
        });

        // Label inside if large enough
        if (r >= 22) {
          ctx.fillStyle = '#E6EDF3';
          ctx.font = `${Math.max(8, r * 0.35)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const shortName = cell.label.length > 10 ? cell.label.slice(0, 9) + '…' : cell.label;
          ctx.fillText(shortName, cx, cy - 3);

          ctx.fillStyle = '#8B949E';
          ctx.font = `${Math.max(7, r * 0.28)}px Inter, sans-serif`;
          ctx.fillText(`${cell.value}%`, cx, cy + r * 0.35);
        }

        positions.push({ cell, cx, cy, r });
        cursorX += hexW + padding;
      }

      cursorY += rowMaxH + padding + 8;
    }

    cellPositionsRef.current = positions;

    // Resize canvas height to content
    canvas.style.height = `${cursorY + 10}px`;
    canvas.height = (cursorY + 10) * dpr;
  }, [cells, hovered]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(draw);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [draw]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });

    const hit = cellPositionsRef.current.find((p) => {
      const dx = x - p.cx;
      const dy = y - p.cy;
      return Math.sqrt(dx * dx + dy * dy) <= p.r;
    });
    setHovered(hit?.cell ?? null);
  };

  const handleClick = () => {
    if (hovered && onCellClick) onCellClick(hovered.id);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <canvas
        ref={canvasRef}
        className={cn('w-full', hovered ? 'cursor-pointer' : 'cursor-default')}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        onClick={handleClick}
      />

      {/* Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] pointer-events-none text-xs"
          style={{ left: mousePos.x + 12, top: mousePos.y - 8 }}
        >
          <div className="font-medium text-[var(--text-primary)]">{hovered.label}</div>
          <div className="flex items-center gap-1.5 mt-1 text-[var(--text-secondary)]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[hovered.status] }}
            />
            {hovered.status} &middot; {sizeMetric}: {hovered.value}%
          </div>
          {hovered.detail && (
            <div className="text-[var(--text-muted)] mt-0.5">{hovered.detail}</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--text-muted)]">
        <span>Size: {sizeMetric}</span>
        <span>Color: {colorMetric}</span>
        <span className="flex items-center gap-3 ml-auto">
          {(['healthy', 'warning', 'critical', 'offline'] as Status[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
              {s}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// ── Hexagon draw helper ──
function drawHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  opts: { fill: string; stroke: string; lineWidth: number },
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = opts.fill;
  ctx.fill();
  if (opts.lineWidth > 0) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.lineWidth;
    ctx.stroke();
  }
}
