/**
 * DataSource — Prometheus / Tempo / Demo 데이터 소스 통합 모듈
 *
 * Scouter XLog 스타일 산점도와 Whatap HeatMap에 필요한
 * 개별 트랜잭션 데이터를 각 백엔드에서 가져옵니다.
 */
class DataSource {
  constructor() {
    this.prometheusUrl = 'http://localhost:9090';
    this.tempoUrl      = 'http://localhost:3200';
    this.mode          = 'demo';          // demo | prometheus | tempo
    this._demoSeqId    = 0;
    this._services     = [
      'rag-demo-service', 'fastapi-gateway', 'langchain-agent',
      'vllm-inference', 'embedding-service', 'guardrail-service'
    ];
  }

  /* ── 모드 전환 ────────────────────────────────────────────── */
  setMode(mode) { this.mode = mode; }

  /* ── 서비스 목록 ──────────────────────────────────────────── */
  async getServices() {
    if (this.mode === 'demo') return this._services;
    try {
      const r = await fetch(`${this.prometheusUrl}/api/v1/label/service_name/values`);
      const j = await r.json();
      return j.data || this._services;
    } catch { return this._services; }
  }

  /* ── 데이터 Fetch (주기적 호출) ───────────────────────────── */
  async fetchPoints(timeRangeSec, serviceFilter) {
    switch (this.mode) {
      case 'prometheus': return this._fetchPrometheus(timeRangeSec, serviceFilter);
      case 'tempo':      return this._fetchTempo(timeRangeSec, serviceFilter);
      default:           return this._generateDemoPoints();
    }
  }

  /* ═══════════════════════════════════════════════════════════
   *  Demo Mode — 시뮬레이션 데이터 생성
   * ═══════════════════════════════════════════════════════════ */
  _generateDemoPoints() {
    const now = Date.now();
    const points = [];
    const count  = 8 + Math.floor(Math.random() * 15);   // 8-22 points per tick

    for (let i = 0; i < count; i++) {
      const svc = this._services[Math.floor(Math.random() * this._services.length)];

      // 응답시간 분포: 대부분 빠름, 가끔 느림, 드물게 에러
      let elapsed;
      const r = Math.random();
      if (r < 0.60)      elapsed = 50 + Math.random() * 400;        // Fast  (< 500ms)
      else if (r < 0.82) elapsed = 400 + Math.random() * 600;       // Normal (400-1000ms)
      else if (r < 0.92) elapsed = 1000 + Math.random() * 2000;     // Slow
      else if (r < 0.97) elapsed = 3000 + Math.random() * 5000;     // Very slow
      else                elapsed = 100 + Math.random() * 800;       // Error

      const isError = r >= 0.97;
      const status  = isError ? 'error' : (elapsed > 3000 ? 'very_slow' : (elapsed > 1000 ? 'slow' : 'normal'));

      points.push({
        id:        `demo-${++this._demoSeqId}`,
        timestamp: now - Math.random() * 4000,       // last 4 seconds spread
        elapsed:   Math.round(elapsed * 100) / 100,
        service:   svc,
        status,
        traceId:   this._randomHex(32),
        spanId:    this._randomHex(16),
        method:    isError ? 'POST' : (['GET','POST','PUT'][Math.floor(Math.random()*3)]),
        path:      ['/api/chat','/api/embed','/api/search','/health','/api/rag/query'][Math.floor(Math.random()*5)],
        statusCode: isError ? [500,502,503][Math.floor(Math.random()*3)] : 200,
        attributes: {
          'llm.model':  ['gpt-4o','claude-3','vllm-llama3'][Math.floor(Math.random()*3)],
          'llm.ttft_ms': Math.round(80 + Math.random() * 400),
          'llm.tokens':  Math.round(50 + Math.random() * 500),
        }
      });
    }
    return points;
  }

  /* ═══════════════════════════════════════════════════════════
   *  Prometheus Mode — 히스토그램 데이터를 산점도용으로 변환
   * ═══════════════════════════════════════════════════════════ */
  async _fetchPrometheus(timeRangeSec, serviceFilter) {
    const svcClause = serviceFilter && serviceFilter !== '__all__'
      ? `,service_name="${serviceFilter}"` : '';

    // 최근 interval 동안의 요청 수를 버킷별로 쿼리
    const query = `increase(http_server_request_duration_seconds_bucket{${svcClause}}[15s])`;
    try {
      const r = await fetch(
        `${this.prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`
      );
      const j = await r.json();
      if (j.status !== 'success') return [];

      const points = [];
      const now = Date.now();
      for (const series of (j.data.result || [])) {
        const le    = parseFloat(series.metric.le);
        const count = parseFloat(series.value[1]);
        if (isNaN(le) || le === Infinity || count < 1) continue;

        // 버킷당 synthetic 포인트 생성 (최대 5개)
        const n = Math.min(Math.round(count), 5);
        for (let i = 0; i < n; i++) {
          const elapsed = le * 1000 * (0.5 + Math.random() * 0.5);
          points.push({
            id:        `prom-${++this._demoSeqId}`,
            timestamp: now - Math.random() * 14000,
            elapsed:   Math.round(elapsed * 100) / 100,
            service:   series.metric.service_name || 'unknown',
            status:    elapsed > 3000 ? 'very_slow' : (elapsed > 1000 ? 'slow' : 'normal'),
            traceId:   this._randomHex(32),
            spanId:    this._randomHex(16),
            method:    series.metric.http_method || 'GET',
            path:      series.metric.http_route  || '/',
            statusCode: parseInt(series.metric.http_status_code) || 200,
            attributes: {}
          });
        }
      }
      return points;
    } catch (e) {
      console.warn('[DataSource] Prometheus fetch error:', e);
      return [];
    }
  }

  /* ═══════════════════════════════════════════════════════════
   *  Tempo Mode — TraceQL로 실제 트레이스 조회
   * ═══════════════════════════════════════════════════════════ */
  async _fetchTempo(timeRangeSec, serviceFilter) {
    const svcFilter = serviceFilter && serviceFilter !== '__all__'
      ? `{ resource.service.name = "${serviceFilter}" && span.kind = server }`
      : '{ span.kind = server }';

    const end   = Math.floor(Date.now() / 1000);
    const start = end - 30;   // last 30 seconds

    try {
      const url = `${this.tempoUrl}/api/search?q=${encodeURIComponent(svcFilter)}&start=${start}&end=${end}&limit=50`;
      const r = await fetch(url);
      const j = await r.json();

      const points = [];
      for (const trace of (j.traces || [])) {
        const span = trace.rootSpan || trace.spanSet?.spans?.[0];
        if (!span) continue;

        const elapsed = (span.durationMs || span.durationNanos / 1e6 || 0);
        const isError = span.statusCode === 'STATUS_CODE_ERROR';
        points.push({
          id:        `tempo-${++this._demoSeqId}`,
          timestamp: new Date(span.startTimeUnixNano / 1e6 || Date.now()).getTime(),
          elapsed,
          service:   trace.rootServiceName || 'unknown',
          status:    isError ? 'error' : (elapsed > 3000 ? 'very_slow' : (elapsed > 1000 ? 'slow' : 'normal')),
          traceId:   trace.traceID,
          spanId:    span.spanID || '',
          method:    '',
          path:      span.rootSpanName || '',
          statusCode: isError ? 500 : 200,
          attributes: {}
        });
      }
      return points;
    } catch (e) {
      console.warn('[DataSource] Tempo fetch error:', e);
      return [];
    }
  }

  /* ── 유틸 ─────────────────────────────────────────────────── */
  _randomHex(len) {
    const chars = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }
}
