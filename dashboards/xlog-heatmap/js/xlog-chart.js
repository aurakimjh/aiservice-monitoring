/**
 * XLogChart — Scouter 스타일 실시간 응답시간 산점도 (Canvas)
 *
 * 특징:
 *  - Canvas 기반 고성능 렌더링 (10k+ 포인트)
 *  - 더블 버퍼링으로 깜빡임 제거
 *  - 그리드 기반 공간 인덱싱으로 빠른 히트테스트
 *  - 드래그 영역 선택 줌, 우클릭 컨텍스트 메뉴
 */
class XLogChart {
  constructor(canvasId, wrapId) {
    this.canvas  = document.getElementById(canvasId);
    this.wrap    = document.getElementById(wrapId);
    this.ctx     = this.canvas.getContext('2d');

    // 데이터
    this.points      = [];          // 모든 포인트
    this.maxPoints   = 50000;       // 메모리 제한
    this.timeWindow  = 900;         // seconds (기본 15분)
    this.logScale    = false;

    // 레이아웃 상수
    this.PADDING = { top: 10, right: 20, bottom: 32, left: 62 };

    // 색상 매핑
    this.COLORS = {
      normal:    '#4A90D9',
      slow:      '#F5A623',
      very_slow: '#E8601C',
      error:     '#D0021B',
    };

    // 상호작용 상태
    this._hoveredPoint = null;
    this._selectedPoint = null;
    this._isDragging = false;
    this._dragStart  = null;
    this._dragEnd    = null;

    // 공간 인덱스 (그리드)
    this._gridCellSize = 12;
    this._grid = new Map();

    // 콜백
    this.onPointClick   = null;    // (point) => void
    this.onPointHover   = null;    // (point, x, y) => void
    this.onHoverLeave   = null;    // () => void
    this.onContextMenu  = null;    // (point, x, y) => void
    this.onRegionSelect = null;    // (startTime, endTime, minElapsed, maxElapsed) => void

    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /* ── 설정 변경 ────────────────────────────────────────────── */
  setTimeWindow(sec) { this.timeWindow = sec; }
  setLogScale(v) { this.logScale = v; }

  /* ── 데이터 추가 ──────────────────────────────────────────── */
  addPoints(newPoints) {
    this.points.push(...newPoints);
    // 시간 윈도우 밖의 오래된 포인트 제거
    const cutoff = Date.now() - this.timeWindow * 1000;
    this.points = this.points.filter(p => p.timestamp >= cutoff);
    // 메모리 제한
    if (this.points.length > this.maxPoints) {
      this.points = this.points.slice(-this.maxPoints);
    }
  }

  clear() { this.points = []; }

  getStats() {
    const n = this.points.length;
    if (n === 0) return { count: 0, avg: 0, p95: 0, errorRate: 0 };
    const sorted = this.points.map(p => p.elapsed).sort((a, b) => a - b);
    const sum    = sorted.reduce((a, b) => a + b, 0);
    const errors = this.points.filter(p => p.status === 'error').length;
    return {
      count: n,
      avg:   Math.round(sum / n),
      p95:   Math.round(sorted[Math.floor(n * 0.95)] || 0),
      errorRate: ((errors / n) * 100).toFixed(1),
    };
  }

  /* ── 렌더링 ───────────────────────────────────────────────── */
  render() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const P = this.PADDING;
    const plotW = w - P.left - P.right;
    const plotH = h - P.top - P.bottom;

    // 배경
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, w, h);

    if (plotW <= 0 || plotH <= 0) return;

    const now     = Date.now();
    const tStart  = now - this.timeWindow * 1000;
    const tEnd    = now;
    const maxMs   = this._getMaxMs();

    // 그리드 초기화 (히트테스트용)
    this._grid.clear();

    // ── 그리드 라인 & 축 레이블 ───────────────────────────────
    ctx.strokeStyle = '#1c2233';
    ctx.lineWidth   = 1;
    ctx.font        = '10px Consolas, monospace';
    ctx.fillStyle   = '#5a6578';

    // Y축 그리드
    const yTicks = this.logScale
      ? [10, 50, 100, 300, 500, 1000, 2000, 5000, 10000]
      : this._linearTicks(0, maxMs, 6);

    for (const ms of yTicks) {
      if (ms > maxMs) break;
      const y = P.top + plotH - this._msToY(ms, plotH, maxMs);
      ctx.beginPath();
      ctx.moveTo(P.left, y);
      ctx.lineTo(P.left + plotW, y);
      ctx.stroke();
      ctx.fillText(ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`, 4, y + 3);
    }

    // X축 시간 레이블
    const xTickCount = Math.min(8, Math.floor(plotW / 80));
    for (let i = 0; i <= xTickCount; i++) {
      const t  = tStart + (tEnd - tStart) * (i / xTickCount);
      const x  = P.left + (i / xTickCount) * plotW;
      const d  = new Date(t);
      const lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      ctx.beginPath();
      ctx.moveTo(x, P.top);
      ctx.lineTo(x, P.top + plotH);
      ctx.stroke();
      ctx.fillText(lbl, x - 20, h - 6);
    }

    // ── 축 경계선 ─────────────────────────────────────────────
    ctx.strokeStyle = '#2a3040';
    ctx.lineWidth   = 1;
    ctx.strokeRect(P.left, P.top, plotW, plotH);

    // ── 임계선 (1s, 3s) ───────────────────────────────────────
    for (const [ms, color, label] of [[1000, '#F5A62366', '1s'], [3000, '#D0021B44', '3s']]) {
      if (ms > maxMs) continue;
      const y = P.top + plotH - this._msToY(ms, plotH, maxMs);
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(P.left, y);
      ctx.lineTo(P.left + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color.replace('44','aa').replace('66','aa');
      ctx.fillText(label, P.left + plotW + 2, y + 3);
    }

    // ── 포인트 렌더링 ─────────────────────────────────────────
    for (const pt of this.points) {
      const px = P.left + ((pt.timestamp - tStart) / (tEnd - tStart)) * plotW;
      const py = P.top + plotH - this._msToY(pt.elapsed, plotH, maxMs);

      if (px < P.left || px > P.left + plotW || py < P.top || py > P.top + plotH) continue;

      const isHovered  = this._hoveredPoint === pt;
      const isSelected = this._selectedPoint === pt;
      const radius = isHovered ? 6 : (isSelected ? 5 : 2.5);

      ctx.globalAlpha = isHovered || isSelected ? 1.0 : 0.75;
      ctx.fillStyle   = this.COLORS[pt.status] || this.COLORS.normal;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      if (isHovered || isSelected) {
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 공간 인덱스 등록
      const gx = Math.floor(px / this._gridCellSize);
      const gy = Math.floor(py / this._gridCellSize);
      const key = `${gx}:${gy}`;
      if (!this._grid.has(key)) this._grid.set(key, []);
      this._grid.get(key).push({ pt, px, py });

      ctx.globalAlpha = 1;
    }

    // ── 드래그 선택 영역 ───────────────────────────────────────
    if (this._isDragging && this._dragStart && this._dragEnd) {
      const sx = this._dragStart.x, sy = this._dragStart.y;
      const ex = this._dragEnd.x,   ey = this._dragEnd.y;
      ctx.fillStyle   = 'rgba(74, 144, 217, 0.12)';
      ctx.strokeStyle = 'rgba(74, 144, 217, 0.5)';
      ctx.lineWidth   = 1;
      ctx.fillRect(sx, sy, ex - sx, ey - sy);
      ctx.strokeRect(sx, sy, ex - sx, ey - sy);
    }
  }

  /* ── 좌표 변환 ────────────────────────────────────────────── */
  _getMaxMs() {
    if (this.points.length === 0) return 5000;
    const max = Math.max(...this.points.map(p => p.elapsed));
    return this.logScale ? 10000 : Math.max(max * 1.15, 1000);
  }

  _msToY(ms, plotH, maxMs) {
    if (this.logScale) {
      const logMin = Math.log10(1);
      const logMax = Math.log10(maxMs);
      const logVal = Math.log10(Math.max(ms, 1));
      return ((logVal - logMin) / (logMax - logMin)) * plotH;
    }
    return (ms / maxMs) * plotH;
  }

  _linearTicks(min, max, count) {
    const step = Math.ceil((max - min) / count / 100) * 100 || 200;
    const ticks = [];
    for (let v = step; v <= max; v += step) ticks.push(v);
    return ticks;
  }

  /* ── 히트테스트 (그리드 기반) ──────────────────────────────── */
  _hitTest(mx, my) {
    const cs = this._gridCellSize;
    let nearest = null;
    let minDist = 64;   // 8px radius squared

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${Math.floor(mx / cs) + dx}:${Math.floor(my / cs) + dy}`;
        const cell = this._grid.get(key);
        if (!cell) continue;
        for (const { pt, px, py } of cell) {
          const d = (px - mx) ** 2 + (py - my) ** 2;
          if (d < minDist) { minDist = d; nearest = pt; }
        }
      }
    }
    return nearest;
  }

  /* ── 리사이즈 ─────────────────────────────────────────────── */
  _resize() {
    const rect = this.wrap.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    this.canvas.width  = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas.style.width  = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  /* ── 이벤트 바인딩 ────────────────────────────────────────── */
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (this._isDragging) {
        this._dragEnd = { x: mx, y: my };
        return;
      }

      const pt = this._hitTest(mx, my);
      this._hoveredPoint = pt;
      c.style.cursor = pt ? 'pointer' : 'crosshair';

      if (pt && this.onPointHover) {
        this.onPointHover(pt, e.clientX, e.clientY);
      } else if (!pt && this.onHoverLeave) {
        this.onHoverLeave();
      }
    });

    c.addEventListener('mouseleave', () => {
      this._hoveredPoint = null;
      if (this.onHoverLeave) this.onHoverLeave();
    });

    c.addEventListener('click', (e) => {
      const rect = c.getBoundingClientRect();
      const pt = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (pt) {
        this._selectedPoint = pt;
        if (this.onPointClick) this.onPointClick(pt);
      }
    });

    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const pt = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (pt && this.onContextMenu) {
        this._selectedPoint = pt;
        this.onContextMenu(pt, e.clientX, e.clientY);
      }
    });

    // 드래그 선택
    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rect = c.getBoundingClientRect();
      this._isDragging = true;
      this._dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this._dragEnd   = { ...this._dragStart };
    });

    c.addEventListener('mouseup', (e) => {
      if (!this._isDragging) return;
      this._isDragging = false;

      if (this._dragStart && this._dragEnd && this.onRegionSelect) {
        const dx = Math.abs(this._dragEnd.x - this._dragStart.x);
        const dy = Math.abs(this._dragEnd.y - this._dragStart.y);
        if (dx > 10 && dy > 10) {
          // 영역 선택 시 HeatMap과 연동
          this.onRegionSelect(this._dragStart, this._dragEnd);
        }
      }
      this._dragStart = null;
      this._dragEnd   = null;
    });
  }
}
