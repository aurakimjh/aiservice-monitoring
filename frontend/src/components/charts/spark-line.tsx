'use client';

import { useRef, useEffect } from 'react';

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  className?: string;
}

export function SparkLine({
  data,
  width = 80,
  height = 24,
  color = 'var(--accent-primary)',
  fillOpacity = 0.1,
  className,
}: SparkLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;

    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: padding + ((max - v) / range) * (height - padding * 2),
    }));

    // Fill area
    const resolvedColor = getComputedStyle(canvas).getPropertyValue('color') || color;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.lineTo(points[0].x, height);
    ctx.closePath();
    ctx.fillStyle =
      resolvedColor.startsWith('var')
        ? `rgba(88, 166, 255, ${fillOpacity})`
        : resolvedColor.replace(')', `, ${fillOpacity})`).replace('rgb', 'rgba');
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = resolvedColor.startsWith('var') ? '#58A6FF' : resolvedColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, width, height, color, fillOpacity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width, height, display: 'block' }}
    />
  );
}
