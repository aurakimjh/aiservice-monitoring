/**
 * App — XLog + HeatMap 대시보드 오케스트레이터
 *
 * Scouter XLog와 Whatap HeatMap을 통합 제어합니다.
 * - 실시간 데이터 수집 & 렌더링 루프
 * - 툴팁, 컨텍스트 메뉴, 상세 패널
 * - 서비스 필터, 시간 범위 전환
 */
(function () {
  'use strict';

  /* ── 인스턴스 생성 ────────────────────────────────────────── */
  const ds      = new DataSource();
  const xlog    = new XLogChart('xlogCanvas', 'xlogWrap');
  const heatmap = new HeatMapChart('heatmapCanvas', 'heatmapWrap');

  /* ── DOM 참조 ─────────────────────────────────────────────── */
  const $serviceFilter  = document.getElementById('serviceFilter');
  const $timeRange      = document.getElementById('timeRange');
  const $dataSource     = document.getElementById('dataSource');
  const $btnAutoRefresh = document.getElementById('btnAutoRefresh');
  const $btnClear       = document.getElementById('btnClear');
  const $statsInfo      = document.getElementById('statsInfo');
  const $tooltip        = document.getElementById('tooltip');
  const $contextMenu    = document.getElementById('contextMenu');
  const $detailPanel    = document.getElementById('detailPanel');
  const $detailContent  = document.getElementById('detailContent');
  const $btnCloseDetail = document.getElementById('btnCloseDetail');
  const $logScale       = document.getElementById('logScale');

  /* ── 상태 ─────────────────────────────────────────────────── */
  let autoRefresh   = true;
  let refreshTimer  = null;
  let rafId         = null;
  let selectedTrace = null;

  /* ═══════════════════════════════════════════════════════════
   *  초기화
   * ═══════════════════════════════════════════════════════════ */
  async function init() {
    // 서비스 목록 로드
    const services = await ds.getServices();
    for (const svc of services) {
      const opt = document.createElement('option');
      opt.value = svc;
      opt.textContent = svc;
      $serviceFilter.appendChild(opt);
    }

    // 이벤트 바인딩
    bindControls();
    bindChartCallbacks();

    // 렌더링 루프 시작
    startRenderLoop();
    startDataFetch();
  }

  /* ── 컨트롤 이벤트 ────────────────────────────────────────── */
  function bindControls() {
    $timeRange.addEventListener('change', () => {
      const sec = parseInt($timeRange.value);
      xlog.setTimeWindow(sec);
      heatmap.setTimeWindow(sec);
    });

    $dataSource.addEventListener('change', () => {
      ds.setMode($dataSource.value);
      xlog.clear();
    });

    $serviceFilter.addEventListener('change', () => {
      // 서비스 변경 시 데이터 필터링은 다음 fetch에서 적용
    });

    $btnAutoRefresh.addEventListener('click', () => {
      autoRefresh = !autoRefresh;
      $btnAutoRefresh.classList.toggle('active', autoRefresh);
      if (autoRefresh) startDataFetch();
      else stopDataFetch();
    });

    $btnClear.addEventListener('click', () => {
      xlog.clear();
    });

    $logScale.addEventListener('change', () => {
      xlog.setLogScale($logScale.checked);
    });

    $btnCloseDetail.addEventListener('click', () => {
      $detailPanel.classList.remove('expanded');
      $detailPanel.classList.add('collapsed');
    });

    $detailPanel.querySelector('.detail-header').addEventListener('click', (e) => {
      if (e.target === $btnCloseDetail) return;
      $detailPanel.classList.toggle('expanded');
      $detailPanel.classList.toggle('collapsed');
    });

    // 클릭 시 컨텍스트 메뉴 닫기
    document.addEventListener('click', () => hideContextMenu());

    // 컨텍스트 메뉴 항목
    document.getElementById('ctxJaeger').addEventListener('click', () => {
      if (selectedTrace) window.open(`http://localhost:16686/trace/${selectedTrace.traceId}`, '_blank');
    });
    document.getElementById('ctxGrafana').addEventListener('click', () => {
      if (selectedTrace) window.open(`http://localhost:3000/explore?left=["now-1h","now","Tempo",{"query":"${selectedTrace.traceId}"}]`, '_blank');
    });
    document.getElementById('ctxCopyTraceId').addEventListener('click', () => {
      if (selectedTrace) navigator.clipboard.writeText(selectedTrace.traceId);
    });
  }

  /* ── 차트 콜백 ────────────────────────────────────────────── */
  function bindChartCallbacks() {
    // XLog — 포인트 호버
    xlog.onPointHover = (pt, cx, cy) => {
      showTooltip(cx, cy, `
        <div class="tt-title">${pt.service}</div>
        <div class="tt-row"><span class="tt-label">Path</span><span class="tt-value">${pt.method} ${pt.path}</span></div>
        <div class="tt-row"><span class="tt-label">Duration</span><span class="tt-value">${pt.elapsed.toFixed(1)}ms</span></div>
        <div class="tt-row"><span class="tt-label">Status</span><span class="tt-value">${pt.statusCode}</span></div>
        <div class="tt-row"><span class="tt-label">Trace</span><span class="tt-value">${pt.traceId.substring(0, 16)}...</span></div>
      `);
    };

    xlog.onHoverLeave = () => hideTooltip();

    // XLog — 포인트 클릭 → 상세 패널
    xlog.onPointClick = (pt) => {
      selectedTrace = pt;
      showDetailPanel(pt);
    };

    // XLog — 우클릭 → 컨텍스트 메뉴
    xlog.onContextMenu = (pt, cx, cy) => {
      selectedTrace = pt;
      showContextMenu(cx, cy);
    };

    // HeatMap — 셀 호버
    heatmap.onCellHover = (info, cx, cy) => {
      const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
      showTooltip(cx, cy, `
        <div class="tt-title">${info.band.label}</div>
        <div class="tt-row"><span class="tt-label">Time</span><span class="tt-value">${fmt(info.timeStart)} ~ ${fmt(info.timeEnd)}</span></div>
        <div class="tt-row"><span class="tt-label">Count</span><span class="tt-value">${info.count} requests</span></div>
      `);
    };

    heatmap.onHoverLeave = () => hideTooltip();

    // HeatMap — 셀 클릭 (해당 시간대 XLog 필터링은 향후 구현)
    heatmap.onCellClick = (band, tStart, tEnd, count) => {
      console.log(`[HeatMap] Click: ${band.label}, ${new Date(tStart).toISOString()} ~ ${new Date(tEnd).toISOString()}, ${count} req`);
    };
  }

  /* ═══════════════════════════════════════════════════════════
   *  데이터 수집 & 렌더 루프
   * ═══════════════════════════════════════════════════════════ */
  function startDataFetch() {
    stopDataFetch();
    fetchData();
    refreshTimer = setInterval(fetchData, 5000);  // 5초 간격
  }

  function stopDataFetch() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  async function fetchData() {
    const svc = $serviceFilter.value;
    const sec = parseInt($timeRange.value);
    try {
      const points = await ds.fetchPoints(sec, svc);
      xlog.addPoints(points);
      heatmap.buildFromPoints(xlog.points);
      updateStats();
    } catch (e) {
      console.warn('[App] fetchData error:', e);
    }
  }

  function updateStats() {
    const s = xlog.getStats();
    $statsInfo.textContent = `Dots: ${s.count.toLocaleString()} | Avg: ${s.avg}ms | P95: ${s.p95}ms | Err: ${s.errorRate}%`;
  }

  function startRenderLoop() {
    function frame() {
      xlog.render();
      heatmap.render();
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
  }

  /* ═══════════════════════════════════════════════════════════
   *  UI 헬퍼
   * ═══════════════════════════════════════════════════════════ */
  function showTooltip(cx, cy, html) {
    $tooltip.innerHTML = html;
    $tooltip.classList.remove('hidden');
    // 화면 밖 방지
    const tw = $tooltip.offsetWidth;
    const th = $tooltip.offsetHeight;
    let x = cx + 12, y = cy + 12;
    if (x + tw > window.innerWidth) x = cx - tw - 8;
    if (y + th > window.innerHeight) y = cy - th - 8;
    $tooltip.style.left = x + 'px';
    $tooltip.style.top  = y + 'px';
  }

  function hideTooltip() {
    $tooltip.classList.add('hidden');
  }

  function showContextMenu(cx, cy) {
    $contextMenu.classList.remove('hidden');
    $contextMenu.style.left = cx + 'px';
    $contextMenu.style.top  = cy + 'px';
  }

  function hideContextMenu() {
    $contextMenu.classList.add('hidden');
  }

  function showDetailPanel(pt) {
    $detailPanel.classList.remove('collapsed');
    $detailPanel.classList.add('expanded');

    const statusColor = {
      normal: '#4A90D9', slow: '#F5A623', very_slow: '#E8601C', error: '#D0021B'
    }[pt.status] || '#4A90D9';

    const attrs = pt.attributes || {};
    const attrHtml = Object.entries(attrs).map(([k, v]) =>
      `<div class="info-item"><div class="label">${k}</div><div class="value">${v}</div></div>`
    ).join('');

    $detailContent.innerHTML = `
      <div class="trace-info">
        <div class="info-item" style="border-color:${statusColor}">
          <div class="label">Trace ID</div>
          <div class="value">${pt.traceId}</div>
        </div>
        <div class="info-item" style="border-color:${statusColor}">
          <div class="label">Service</div>
          <div class="value">${pt.service}</div>
        </div>
        <div class="info-item" style="border-color:${statusColor}">
          <div class="label">Duration</div>
          <div class="value">${pt.elapsed.toFixed(2)} ms</div>
        </div>
        <div class="info-item" style="border-color:${statusColor}">
          <div class="label">Endpoint</div>
          <div class="value">${pt.method} ${pt.path}</div>
        </div>
        <div class="info-item" style="border-color:${statusColor}">
          <div class="label">Status</div>
          <div class="value">${pt.statusCode} (${pt.status})</div>
        </div>
        <div class="info-item" style="border-color:${statusColor}">
          <div class="label">Time</div>
          <div class="value">${new Date(pt.timestamp).toLocaleTimeString('ko-KR')}</div>
        </div>
        ${attrHtml}
      </div>
    `;
  }

  /* ── 시작 ─────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);
})();
