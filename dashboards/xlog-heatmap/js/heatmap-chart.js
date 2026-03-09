/**
 * HeatMapChart — Whatap 스타일 요청 밀도 히트맵 (Canvas)
 *
 * X축: 시간 (5초 단위 버킷)
 * Y축: 응답시간 구간
 * 색상 강도: 해당 버킷의 요청 수
 */
class HeatMapChart {
  constructor(canvasId, wrapId) {
    this.canvas = document.getElementById(canvasId);
    this.wrap   = document.getElementById(wrapId);
    this.ctx    = this.canvas.getContext('2d');

    // 시간 설정
    this.timeWindow  = 900;       // seconds (기본 15분)
    this.bucketSec   = 5;         // 5초 버킷

    // Y축 구간 정의 (ms)
    this.BANDS = [
      { min: 0,    max: 100,   label: '0-100ms' },
      { min: 100,  max: 300,   label: '100-300ms' },
      { min: 300,  max: 500,   label: '300-500ms' },
      { min: 500,  max: 1000,  label: '0.5-1s' },
      { min: 1000, max: 2000,  label: '1-2s' },
      { min: 2000, max: 3000,  label: '2-3s' },
      { min: 3000, max: Infinity, label: '3s+' },
    ];

    // 색상 그래디언트 (요청 수 → 색)
    this.COLOR_STOPS = [
      { threshold: 0,   color: [16, 24, 48] },     // 빈 셀 — 거의 투명
      { threshold: 1,   color: [26, 58, 100] },     // 1-2개
      { threshold: 3,   color: [42, 90, 158] },     // 3-4개
      { threshold: 5,   color: [74, 144, 217] },    // 5-9개
      { threshold: 10,  color: [100, 180, 80] },    // 10-19개
      { threshold: 20,  color: [245, 166, 35] },    // 20-49개
      { threshold: 50,  color: [232, 96, 28] },     // 50-99개
      { threshold: 100, color: [208, 2, 27] },      // 100+
    ];

    // 레이아웃
    this.PADDING = { top: 10, right: 40, bottom: 32, left: 72 };

    // 상호작용
    this._hoveredCell = null;     // { col, row, count }
    this.onCellClick  = null;     // (band, timeStart, timeEnd, count) => void
    this.onCellHover  = null;     // (info, clientX, clientY) => void
    this.onHoverLeave = null;

    // 데이터 (2D 배열)
    this._grid = [];              // [col][row] = count

    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /* ── 설정 ─────────────────────────────────────────────────── */
  setTimeWindow(sec) { this.timeWindow = sec; }

  /* ── 데이터 빌드 (포인트 배열 → 히트맵 그리드) ──────────── */
  buildFromPoints(points) {
    const now    = Date.now();
    const tStart = now - this.timeWindow * 1000;
    const cols   = Math.ceil(this.timeWindow / this.bucketSec);
    const rows   = this.BANDS.length;

    // 그리드 초기화
    this._grid = Array.from({ length: cols }, () => new Array(rows).fill(0));
    this._tStart = tStart;
    this._tEnd   = now;
    this._cols   = cols;
    this._rows   = rows;

    for (const pt of points) {
      if (pt.timestamp < tStart) continue;
      const col = Math.min(Math.floor((pt.timestamp - tStart) / (this.bucketSec * 1000)), cols - 1);
      const row = this.BANDS.findIndex(b => pt.elapsed >= b.min && pt.elapsed < b.max);
      if (col >= 0 && row >= 0) {
        this._grid[col][row]++;
      }
    }
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

    if (plotW <= 0 || plotH <= 0 || this._cols === 0) return;

    const cellW = plotW / this._cols;
    const cellH = plotH / this._rows;

    // ── 셀 렌더링 ─────────────────────────────────────────────
    for (let col = 0; col < this._cols; col++) {
      for (let row = 0; row < this._rows; row++) {
        const count = this._grid[col]?.[row] || 0;
        const x = P.left + col * cellW;
        // Y축: 아래가 빠른 응답, 위가 느린 응답
        const y = P.top + (this._rows - 1 - row) * cellH;

        ctx.fillStyle = this._countToColor(count);
        ctx.fillRect(x, y, Math.max(cellW - 0.5, 1), Math.max(cellH - 0.5, 1));

        // 호버 강조
        if (this._hoveredCell && this._hoveredCell.col === col && this._hoveredCell.row === row) {
          ctx.strokeStyle = '#ffffff88';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, cellW, cellH);
        }
      }
    }

    // ── 축 경계 ───────────────────────────────────────────────
    ctx.strokeStyle = '#2a3040';
    ctx.lineWidth   = 1;
    ctx.strokeRect(P.left, P.top, plotW, plotH);

    // ── Y축 레이블 ────────────────────────────────────────────
    ctx.font      = '10px Consolas, monospace';
    ctx.fillStyle = '#5a6578';
    ctx.textAlign = 'right';
    for (let row = 0; row < this._rows; row++) {
      const y = P.top + (this._rows - 1 - row) * cellH + cellH / 2 + 3;
      ctx.fillText(this.BANDS[row].label, P.left - 6, y);
    }

    // ── X축 시간 레이블 ───────────────────────────────────────
    ctx.textAlign = 'center';
    const labelInterval = Math.max(1, Math.floor(this._cols / 8));
    for (let col = 0; col < this._cols; col += labelInterval) {
      const t = this._tStart + col * this.bucketSec * 1000;
      const d = new Date(t);
      const lbl = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      const x = P.left + col * cellW + cellW / 2;
      ctx.fillText(lbl, x, h - 6);
    }
    ctx.textAlign = 'left';
  }

  /* ── 색상 변환 ────────────────────────────────────────────── */
  _countToColor(count) {
    if (count === 0) return 'rgba(16, 24, 48, 0.5)';

    let lower = this.COLOR_STOPS[0];
    let upper = this.COLOR_STOPS[this.COLOR_STOPS.length - 1];

    for (let i = 0; i < this.COLOR_STOPS.length - 1; i++) {
      if (count >= this.COLOR_STOPS[i].threshold && count < this.COLOR_STOPS[i + 1].threshold) {
        lower = this.COLOR_STOPS[i];
        upper = this.COLOR_STOPS[i + 1];
        break;
      }
    }
    if (count >= upper.threshold) {
      return `rgb(${upper.color.join(',')})`;
    }

    const range = upper.threshold - lower.threshold;
    const t = range > 0 ? (count - lower.threshold) / range : 1;
    const r = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * t);
    const g = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * t);
    const b = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * t);
    return `rgb(${r},${g},${b})`;
  }

  /* ── 셀 히트테스트 ────────────────────────────────────────── */
  _cellAt(mx, my) {
    const P = this.PADDING;
    const plotW = this.canvas.width - P.left - P.right;
    const plotH = this.canvas.height - P.top - P.bottom;
    if (mx < P.left || mx > P.left + plotW || my < P.top || my > P.top + plotH) return null;

    const cellW = plotW / this._cols;
    const cellH = plotH / this._rows;
    const col   = Math.floor((mx - P.left) / cellW);
    const row   = this._rows - 1 - Math.floor((my - P.top) / cellH);

    if (col < 0 || col >= this._cols || row < 0 || row >= this._rows) return null;
    return { col, row, count: this._grid[col]?.[row] || 0 };
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

  /* ── 이벤트 ───────────────────────────────────────────────── */
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      const cell = this._cellAt(e.clientX - rect.left, e.clientY - rect.top);
      this._hoveredCell = cell;
      c.style.cursor = cell && cell.count > 0 ? 'pointer' : 'default';

      if (cell && cell.count > 0 && this.onCellHover) {
        const tStart = this._tStart + cell.col * this.bucketSec * 1000;
        const tEnd   = tStart + this.bucketSec * 1000;
        this.onCellHover({
          band:    this.BANDS[cell.row],
          count:   cell.count,
          timeStart: new Date(tStart),
          timeEnd:   new Date(tEnd),
        }, e.clientX, e.clientY);
      } else if (this.onHoverLeave) {
        this.onHoverLeave();
      }
    });

    c.addEventListener('mouseleave', () => {
      this._hoveredCell = null;
      if (this.onHoverLeave) this.onHoverLeave();
    });

    c.addEventListener('click', (e) => {
      const rect = c.getBoundingClientRect();
      const cell = this._cellAt(e.clientX - rect.left, e.clientY - rect.top);
      if (cell && cell.count > 0 && this.onCellClick) {
        const tStart = this._tStart + cell.col * this.bucketSec * 1000;
        const tEnd   = tStart + this.bucketSec * 1000;
        this.onCellClick(this.BANDS[cell.row], tStart, tEnd, cell.count);
      }
    });
  }
}
