'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import type { TopologyNode, TopologyEdge, ServiceLayer } from '@/lib/demo-data';
import { LAYER_CONFIG } from '@/lib/demo-data';
import type { Status } from '@/types/monitoring';

interface ServiceMapProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  layerFilter?: ServiceLayer[];
  className?: string;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (source: string, target: string) => void; // E3-3
}

const STATUS_COLORS: Record<Status, string> = {
  healthy: '#3FB950',
  warning: '#D29922',
  critical: '#F85149',
  offline: '#484F58',
  unknown: '#484F58',
};

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  layer: ServiceLayer;
  status: Status;
  rpm: number;
  errorRate: number;
  p95: number;
  framework?: string;
  radius: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  rpm: number;
  errorRate: number;
  p95: number;
}

export function ServiceMap({ nodes, edges, layerFilter, className, onNodeClick, onEdgeClick }: ServiceMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node?: SimNode; edge?: SimEdge } | null>(null);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = 500;

    // Filter nodes/edges by layer
    const filteredNodes = layerFilter && layerFilter.length > 0
      ? nodes.filter((n) => layerFilter.includes(n.layer))
      : nodes;
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    // Create sim nodes with radius based on RPM
    const maxRpm = Math.max(...filteredNodes.map((n) => n.rpm), 1);
    const simNodes: SimNode[] = filteredNodes.map((n) => ({
      ...n,
      radius: 18 + (n.rpm / maxRpm) * 22,
    }));

    const simEdges: SimEdge[] = filteredEdges.map((e) => ({
      source: e.source,
      target: e.target,
      rpm: e.rpm,
      errorRate: e.errorRate,
      p95: e.p95,
    }));

    // Clear
    const sel = d3.select(svg);
    sel.selectAll('*').remove();
    sel.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);

    // Defs: arrow marker
    const defs = sel.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#484F58');

    defs.append('marker')
      .attr('id', 'arrow-error')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#F85149');

    const g = sel.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    sel.call(zoom);

    // Layer bands
    const layerHeight = H / 5;
    const layerEntries = Object.entries(LAYER_CONFIG) as [ServiceLayer, typeof LAYER_CONFIG[ServiceLayer]][];
    for (const [, config] of layerEntries) {
      g.append('rect')
        .attr('x', 0).attr('y', config.y * layerHeight)
        .attr('width', W).attr('height', layerHeight)
        .attr('fill', config.color).attr('opacity', 0.03);

      g.append('text')
        .attr('x', 8).attr('y', config.y * layerHeight + 14)
        .attr('fill', config.color).attr('opacity', 0.5)
        .attr('font-size', 10).attr('font-family', 'Inter, sans-serif')
        .text(config.label);
    }

    // Force simulation
    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges).id((d) => d.id).distance(120).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('y', d3.forceY<SimNode>((d) => LAYER_CONFIG[d.layer].y * layerHeight + layerHeight / 2).strength(0.6))
      .force('x', d3.forceX(W / 2).strength(0.05))
      .force('collision', d3.forceCollide<SimNode>((d) => d.radius + 8));

    // Edges
    const maxEdgeRpm = Math.max(...simEdges.map((e) => e.rpm), 1);
    const linkGroup = g.append('g').attr('class', 'links');
    const links = linkGroup.selectAll('line')
      .data(simEdges)
      .join('line')
      .attr('stroke', (d) => d.errorRate > 0.5 ? '#F85149' : '#30363D')
      .attr('stroke-width', (d) => 1 + (d.rpm / maxEdgeRpm) * 3)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', (d) => d.errorRate > 0.5 ? 'url(#arrow-error)' : 'url(#arrow)')
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setTooltip({ x: event.clientX, y: event.clientY, edge: d });
      })
      .on('mouseleave', () => setTooltip(null))
      // E3-3: Edge click → show traces between two services
      .on('click', (_, d) => {
        const src = typeof d.source === 'object' ? (d.source as SimNode).id : d.source;
        const tgt = typeof d.target === 'object' ? (d.target as SimNode).id : d.target;
        onEdgeClick?.(src as string, tgt as string);
      });

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodeGs = nodeGroup.selectAll('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setTooltip({ x: event.clientX, y: event.clientY, node: d });
      })
      .on('mouseleave', () => setTooltip(null))
      .on('click', (_, d) => onNodeClick?.(d.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(d3.drag<any, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }),
      );

    // Node circle
    nodeGs.append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => {
        const color = STATUS_COLORS[d.status];
        return color + '20'; // alpha
      })
      .attr('stroke', (d) => STATUS_COLORS[d.status])
      .attr('stroke-width', 2);

    // Node inner dot
    nodeGs.append('circle')
      .attr('r', 4)
      .attr('fill', (d) => STATUS_COLORS[d.status]);

    // Node label
    nodeGs.append('text')
      .text((d) => d.name.length > 16 ? d.name.slice(0, 15) + '…' : d.name)
      .attr('dy', (d) => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8B949E')
      .attr('font-size', 11)
      .attr('font-family', 'Inter, sans-serif');

    // RPM label
    nodeGs.append('text')
      .text((d) => d.rpm > 0 ? `${d.rpm} rpm` : '')
      .attr('dy', 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#E6EDF3')
      .attr('font-size', 9)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', 500);

    // Tick
    simulation.on('tick', () => {
      links
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      nodeGs.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => simulation.stop();
  }, [nodes, edges, layerFilter, onNodeClick, onEdgeClick]);

  useEffect(() => {
    const cleanup = draw();
    const obs = new ResizeObserver(() => draw());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => { cleanup?.(); obs.disconnect(); };
  }, [draw]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <svg ref={svgRef} className="w-full" style={{ height: 500 }} />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 bg-[var(--bg-overlay)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] pointer-events-none text-xs max-w-xs"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          {tooltip.node && (
            <>
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[tooltip.node.status] }} />
                {tooltip.node.name}
              </div>
              <div className="text-[var(--text-muted)] mt-0.5">{tooltip.node.framework} &middot; {LAYER_CONFIG[tooltip.node.layer].label}</div>
              <div className="grid grid-cols-3 gap-2 mt-1.5 text-[var(--text-secondary)]">
                <div><div className="text-[9px] text-[var(--text-muted)]">RPM</div><div className="font-medium tabular-nums">{tooltip.node.rpm}</div></div>
                <div><div className="text-[9px] text-[var(--text-muted)]">P95</div><div className="font-medium tabular-nums">{formatDuration(tooltip.node.p95)}</div></div>
                <div><div className="text-[9px] text-[var(--text-muted)]">Error</div><div className={cn('font-medium tabular-nums', tooltip.node.errorRate > 0.5 ? 'text-[var(--status-critical)]' : '')}>{tooltip.node.errorRate}%</div></div>
              </div>
            </>
          )}
          {tooltip.edge && (
            <>
              <div className="font-semibold text-[var(--text-primary)]">
                {(tooltip.edge.source as SimNode).name ?? tooltip.edge.source} → {(tooltip.edge.target as SimNode).name ?? tooltip.edge.target}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-1.5 text-[var(--text-secondary)]">
                <div><div className="text-[9px] text-[var(--text-muted)]">RPM</div><div className="font-medium tabular-nums">{tooltip.edge.rpm}</div></div>
                <div><div className="text-[9px] text-[var(--text-muted)]">P95</div><div className="font-medium tabular-nums">{formatDuration(tooltip.edge.p95)}</div></div>
                <div><div className="text-[9px] text-[var(--text-muted)]">Error</div><div className={cn('font-medium tabular-nums', tooltip.edge.errorRate > 0.5 ? 'text-[var(--status-critical)]' : '')}>{tooltip.edge.errorRate}%</div></div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
