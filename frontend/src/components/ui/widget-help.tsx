'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import type { Locale } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════════
// WidgetHelp — 가젯 도움말 팝오버
//
// 사용법:
//   <WidgetHelp widgetId="tps" />
//   <WidgetHelp widgetId="cpu-usage" />
// ═══════════════════════════════════════════════════════════════

// 다국어 가젯 설명 사전
const WIDGET_DESCRIPTIONS: Record<string, Record<Locale, { title: string; description: string }>> = {
  // ── KPI / General ──
  'services': {
    ko: { title: '서비스', description: '현재 모니터링 중인 전체 서비스 수와 정상 서비스 수를 표시합니다.' },
    en: { title: 'Services', description: 'Shows the total number of monitored services and how many are healthy.' },
    ja: { title: 'サービス', description: '監視中のサービス総数と正常なサービス数を表示します。' },
  },
  'error-rate': {
    ko: { title: '에러율', description: '전체 요청 중 HTTP 5xx 에러 응답의 비율(%)입니다. 0.5% 이상이면 주의가 필요합니다.' },
    en: { title: 'Error Rate', description: 'Percentage of HTTP 5xx error responses out of total requests. Above 0.5% requires attention.' },
    ja: { title: 'エラー率', description: 'リクエスト全体に対するHTTP 5xxエラーの割合(%)です。' },
  },
  'p95-latency': {
    ko: { title: 'P95 응답시간', description: '전체 요청 중 95%가 이 시간 내에 응답합니다. SLO 기준선으로 사용됩니다.' },
    en: { title: 'P95 Latency', description: '95% of all requests respond within this time. Used as an SLO baseline.' },
    ja: { title: 'P95レイテンシ', description: '全リクエストの95%がこの時間内に応答します。' },
  },
  'throughput': {
    ko: { title: '처리량', description: '초당 처리되는 요청 수(TPS) 또는 분당 요청 수(RPM)입니다.' },
    en: { title: 'Throughput', description: 'Number of requests processed per second (TPS) or per minute (RPM).' },
    ja: { title: 'スループット', description: '毎秒(TPS)または毎分(RPM)の処理リクエスト数です。' },
  },
  'cpu-usage': {
    ko: { title: 'CPU 사용률', description: '호스트의 CPU 사용률(%)입니다. User/System/IOWait로 분류됩니다. 85% 이상이면 경고입니다.' },
    en: { title: 'CPU Usage', description: 'Host CPU utilization (%). Broken down by User/System/IOWait. Warning above 85%.' },
    ja: { title: 'CPU使用率', description: 'ホストのCPU使用率(%)です。User/System/IOWaitに分類されます。' },
  },
  'memory': {
    ko: { title: '메모리', description: '호스트의 메모리 사용률(%)입니다. Used와 Cached 영역으로 구분됩니다.' },
    en: { title: 'Memory', description: 'Host memory utilization (%). Divided into Used and Cached regions.' },
    ja: { title: 'メモリ', description: 'ホストのメモリ使用率(%)です。UsedとCachedに区分されます。' },
  },
  'disk': {
    ko: { title: '디스크', description: '마운트 포인트별 디스크 사용량입니다. 85% 이상이면 경고, 95% 이상이면 위험입니다.' },
    en: { title: 'Disk', description: 'Disk usage per mount point. Warning above 85%, critical above 95%.' },
    ja: { title: 'ディスク', description: 'マウントポイントごとのディスク使用量です。' },
  },
  'network-io': {
    ko: { title: '네트워크 I/O', description: '인터페이스별 수신(RX)과 송신(TX) 트래픽(MB/s)입니다.' },
    en: { title: 'Network I/O', description: 'Receive (RX) and transmit (TX) traffic per interface in MB/s.' },
    ja: { title: 'ネットワークI/O', description: 'インターフェースごとの受信(RX)と送信(TX)トラフィック(MB/s)です。' },
  },
  // ── APM Widgets ──
  'apm-tps': {
    ko: { title: 'TPS (초당 트랜잭션)', description: '5초 간격으로 집계한 초당 트랜잭션 처리량입니다. 실시간 서비스 부하를 나타냅니다.' },
    en: { title: 'TPS (Transactions/sec)', description: 'Transactions per second aggregated at 5-second intervals. Indicates real-time service load.' },
    ja: { title: 'TPS (秒間トランザクション)', description: '5秒間隔で集計した秒間トランザクション処理量です。' },
  },
  'apm-tps-daily': {
    ko: { title: '금일 TPS', description: '오늘의 TPS 추이를 어제와 비교합니다. 파란선이 오늘, 회색이 어제입니다.' },
    en: { title: 'Today TPS', description: 'Compares today\'s TPS trend with yesterday. Blue = today, gray = yesterday.' },
    ja: { title: '本日TPS', description: '本日のTPS推移を昨日と比較します。青=今日、灰=昨日。' },
  },
  'apm-response-time': {
    ko: { title: '평균 응답시간', description: '5초 간격 평균 응답시간(ms)입니다. 노란 점선은 Warning(500ms), 빨간 점선은 Critical(1s)입니다.' },
    en: { title: 'Avg Response Time', description: 'Average response time in ms at 5-second intervals. Yellow dashed = Warning(500ms), red = Critical(1s).' },
    ja: { title: '平均応答時間', description: '5秒間隔の平均応答時間(ms)です。黄点線=Warning(500ms)、赤=Critical(1s)。' },
  },
  'apm-active-txn': {
    ko: { title: '액티브 트랜잭션', description: '현재 처리 중인 트랜잭션 수입니다. 급증 시 파랑→노랑→빨강으로 색상이 변합니다.' },
    en: { title: 'Active Transactions', description: 'Currently processing transaction count. Color escalates blue→yellow→red on surge.' },
    ja: { title: 'アクティブトランザクション', description: '現在処理中のトランザクション数です。急増時に青→黄→赤に変化します。' },
  },
  'apm-active-status': {
    ko: { title: '액티브 스테이터스', description: '처리 중 트랜잭션의 상태 분류입니다. METHOD(일반), SQL(DB), HTTPC(외부호출), DBC/SOCKET(커넥션)으로 나뉩니다. DBC/SOCKET이 1 이상이면 커넥션 풀 고갈 의심.' },
    en: { title: 'Active Status', description: 'Status breakdown of active transactions: METHOD, SQL, HTTPC, DBC, SOCKET. DBC/SOCKET ≥ 1 indicates connection pool exhaustion risk.' },
    ja: { title: 'アクティブステータス', description: 'アクティブトランザクションの状態分類です。DBC/SOCKETが1以上はコネクションプール枯渇の疑い。' },
  },
  'apm-txn-speed': {
    ko: { title: '트랜잭션 스피드', description: 'RPS(유입) → 처리중 → TPS(처리완료)의 3단계 플로우입니다. RPS > TPS가 지속되면 적체(Backlog)가 발생하고 빨간색으로 표시됩니다.' },
    en: { title: 'Transaction Speed', description: '3-stage flow: RPS(in) → Processing → TPS(out). Sustained RPS > TPS indicates backlog (shown in red).' },
    ja: { title: 'トランザクションスピード', description: 'RPS(流入)→処理中→TPS(処理完了)の3段階フローです。' },
  },
  'apm-concurrent-users': {
    ko: { title: '동시접속 사용자', description: '최근 5분 이내 활동한 고유 사용자 수입니다. IP 기반으로 카운팅합니다.' },
    en: { title: 'Concurrent Users', description: 'Unique users active within the last 5 minutes. Counted by IP address.' },
    ja: { title: '同時接続ユーザー', description: '直近5分以内にアクティブなユニークユーザー数です。' },
  },
  // ── AI Widgets ──
  'ai-pipeline-waterfall': {
    ko: { title: 'AI 파이프라인 워터폴', description: 'RAG 파이프라인의 각 단계별 소요 시간입니다. Guardrail → Embedding → Vector Search → LLM Inference 순서로 표시됩니다.' },
    en: { title: 'AI Pipeline Waterfall', description: 'Per-stage latency of the RAG pipeline: Guardrail → Embedding → Vector Search → LLM Inference.' },
    ja: { title: 'AIパイプラインウォーターフォール', description: 'RAGパイプラインの各ステージの所要時間です。' },
  },
  'ai-ttft-trend': {
    ko: { title: 'TTFT 추이', description: 'Time To First Token — LLM이 첫 번째 토큰을 생성하기까지의 시간(ms)입니다. SLO 기준 2초 이하가 권장됩니다.' },
    en: { title: 'TTFT Trend', description: 'Time To First Token — time until the LLM generates its first token (ms). SLO recommends under 2 seconds.' },
    ja: { title: 'TTFT推移', description: 'LLMが最初のトークンを生成するまでの時間(ms)です。SLO基準2秒以下推奨。' },
  },
  'ai-token-cost': {
    ko: { title: '토큰 비용', description: '시간당 LLM 토큰 사용 비용($)입니다. 모델별 input/output 토큰 단가로 자동 계산됩니다. Budget 초과 시 알림이 발생합니다.' },
    en: { title: 'Token Cost', description: 'Hourly LLM token cost ($). Auto-calculated from per-model input/output token pricing. Alerts on budget exceed.' },
    ja: { title: 'トークンコスト', description: '時間あたりのLLMトークン使用コスト($)です。モデルごとの単価で自動計算。' },
  },
  'slo-compliance': {
    ko: { title: 'SLO 준수율', description: 'Service Level Objective 달성률(%)입니다. 목표치 대비 실제 성능을 측정합니다. 99.5% 이상이 권장됩니다.' },
    en: { title: 'SLO Compliance', description: 'Service Level Objective achievement rate (%). Measures actual performance against target. 99.5%+ recommended.' },
    ja: { title: 'SLO準拠率', description: 'Service Level Objectiveの達成率(%)です。目標値に対する実際のパフォーマンスを測定。' },
  },
  // ── Infrastructure ──
  'total-hosts': {
    ko: { title: '전체 호스트', description: '모니터링 대상 전체 호스트(서버) 수입니다.' },
    en: { title: 'Total Hosts', description: 'Total number of monitored hosts (servers).' },
    ja: { title: '全ホスト', description: '監視対象の全ホスト(サーバー)数です。' },
  },
  'healthy-hosts': {
    ko: { title: '정상 호스트', description: '현재 정상적으로 동작 중인 호스트 수입니다.' },
    en: { title: 'Healthy Hosts', description: 'Number of hosts currently operating normally.' },
    ja: { title: '正常ホスト', description: '現在正常に動作中のホスト数です。' },
  },
  'warning-hosts': {
    ko: { title: '경고 호스트', description: 'CPU, 메모리 또는 디스크 사용률이 임계치를 초과한 호스트입니다.' },
    en: { title: 'Warning Hosts', description: 'Hosts with CPU, memory or disk usage exceeding thresholds.' },
    ja: { title: '警告ホスト', description: 'CPU、メモリ、ディスク使用率が閾値を超えたホストです。' },
  },
  'critical-hosts': {
    ko: { title: '위험/오프라인', description: '위험 상태이거나 오프라인인 호스트입니다. 즉시 확인이 필요합니다.' },
    en: { title: 'Critical / Offline', description: 'Hosts in critical state or offline. Immediate attention required.' },
    ja: { title: '危険/オフライン', description: '危険状態またはオフラインのホストです。即時確認が必要です。' },
  },
  'backends': {
    ko: { title: '백엔드 연결', description: 'Prometheus, Jaeger 등 모니터링 백엔드의 연결 상태입니다.' },
    en: { title: 'Backends', description: 'Connection status of monitoring backends like Prometheus and Jaeger.' },
    ja: { title: 'バックエンド接続', description: 'Prometheus、Jaegerなど監視バックエンドの接続状態です。' },
  },
  // ── AI Service ──
  'ai-ttft': {
    ko: { title: 'TTFT P95', description: 'Time To First Token의 95 퍼센타일입니다. LLM이 첫 토큰을 생성하기까지의 시간으로, SLO 기준 2초 이하가 권장됩니다.' },
    en: { title: 'TTFT P95', description: '95th percentile Time To First Token. Time until the LLM generates its first token. SLO recommends under 2 seconds.' },
    ja: { title: 'TTFT P95', description: 'LLMが最初のトークンを生成するまでの95パーセンタイル時間です。SLO基準2秒以下推奨。' },
  },
  'ai-tps': {
    ko: { title: 'TPS P50', description: '초당 토큰 생성 속도의 중간값입니다. SLO 기준 30 tok/s 이상이 권장됩니다.' },
    en: { title: 'TPS P50', description: 'Median tokens per second generation speed. SLO recommends above 30 tok/s.' },
    ja: { title: 'TPS P50', description: '秒間トークン生成速度の中央値です。SLO基準30 tok/s以上推奨。' },
  },
  'ai-gpu': {
    ko: { title: 'GPU 평균', description: 'GPU 사용률 평균(%)입니다. 90% 이상이면 위험, 75% 이상이면 경고입니다.' },
    en: { title: 'GPU Avg', description: 'Average GPU utilization (%). Critical above 90%, warning above 75%.' },
    ja: { title: 'GPU平均', description: 'GPU使用率の平均(%)です。90%以上で危険、75%以上で警告。' },
  },
  'ai-block-rate': {
    ko: { title: '차단률', description: 'Guardrail에 의해 차단된 요청 비율(%)입니다. 5% 이상이면 위험, 3% 이상이면 경고입니다.' },
    en: { title: 'Block Rate', description: 'Percentage of requests blocked by guardrail. Critical above 5%, warning above 3%.' },
    ja: { title: 'ブロック率', description: 'ガードレールによってブロックされたリクエストの割合(%)です。' },
  },
  // ── Service ──
  'total-services': {
    ko: { title: '전체 서비스', description: '모니터링 중인 전체 서비스(애플리케이션) 수입니다.' },
    en: { title: 'Total Services', description: 'Total number of monitored services (applications).' },
    ja: { title: '全サービス', description: '監視中の全サービス(アプリケーション)数です。' },
  },
  'avg-p95': {
    ko: { title: '평균 P95 응답시간', description: '전체 서비스의 P95 응답시간 평균입니다. 1초 이상이면 주의가 필요합니다.' },
    en: { title: 'Avg P95 Latency', description: 'Average P95 response time across all services. Above 1s requires attention.' },
    ja: { title: '平均P95レイテンシ', description: '全サービスのP95応答時間の平均です。' },
  },
  'total-throughput': {
    ko: { title: '총 처리량', description: '전체 서비스의 분당 요청 수(RPM) 합계입니다.' },
    en: { title: 'Total Throughput', description: 'Total requests per minute (RPM) across all services.' },
    ja: { title: '総スループット', description: '全サービスの分間リクエスト数(RPM)の合計です。' },
  },
  'avg-error-rate': {
    ko: { title: '평균 에러율', description: '전체 서비스의 평균 에러 응답 비율(%)입니다. 0.5% 이상이면 주의가 필요합니다.' },
    en: { title: 'Avg Error Rate', description: 'Average error response rate across all services (%). Above 0.5% requires attention.' },
    ja: { title: '平均エラー率', description: '全サービスの平均エラー応答率(%)です。' },
  },
  'dependencies': {
    ko: { title: '의존성', description: '서비스 간 호출 관계(의존성) 수입니다. 토폴로지 맵에서 시각적으로 확인할 수 있습니다.' },
    en: { title: 'Dependencies', description: 'Number of service call relationships (dependencies). Viewable on the topology map.' },
    ja: { title: '依存関係', description: 'サービス間の呼び出し関係(依存関係)数です。' },
  },
};

// Fallback for unknown widgets
const DEFAULT_DESC: Record<Locale, { title: string; description: string }> = {
  ko: { title: '가젯', description: '이 가젯에 대한 설명이 아직 등록되지 않았습니다.' },
  en: { title: 'Widget', description: 'No description available for this widget yet.' },
  ja: { title: 'ウィジェット', description: 'このウィジェットの説明はまだ登録されていません。' },
};

interface WidgetHelpProps {
  widgetId: string;
  className?: string;
}

export function WidgetHelp({ widgetId, className }: WidgetHelpProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const locale = useUIStore((s) => s.locale);

  const desc = WIDGET_DESCRIPTIONS[widgetId]?.[locale] ?? DEFAULT_DESC[locale];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto close after 8 seconds
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 8000);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors rounded"
        title={desc.title}
      >
        <HelpCircle size={12} />
      </button>

      {open && (
        <div className="absolute z-50 top-6 left-0 w-64 bg-[var(--bg-overlay)] border border-[var(--border-emphasis)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--text-primary)]">{desc.title}</span>
            <button onClick={() => setOpen(false)} className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              <X size={11} />
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{desc.description}</p>
        </div>
      )}
    </div>
  );
}

// Export descriptions for external use
export { WIDGET_DESCRIPTIONS };
