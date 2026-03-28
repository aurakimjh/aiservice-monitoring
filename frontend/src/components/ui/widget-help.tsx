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
  // ── Alerts ──
  'alert-policies': {
    ko: { title: '알림 정책', description: '등록된 알림 정책의 총 수와 활성화된 정책 수입니다.' },
    en: { title: 'Alert Policies', description: 'Total number of registered alert policies and how many are enabled.' },
    ja: { title: 'アラートポリシー', description: '登録されたアラートポリシーの総数と有効なポリシー数です。' },
  },
  'open-incidents': {
    ko: { title: '미해결 인시던트', description: '현재 해결되지 않은 인시던트 수입니다.' },
    en: { title: 'Open Incidents', description: 'Number of currently unresolved incidents.' },
    ja: { title: '未解決インシデント', description: '現在未解決のインシデント数です。' },
  },
  'mttr': {
    ko: { title: 'MTTR', description: '평균 복구 시간(Mean Time To Resolve)입니다.' },
    en: { title: 'MTTR', description: 'Mean Time To Resolve — average time to resolve incidents.' },
    ja: { title: 'MTTR', description: '平均復旧時間(Mean Time To Resolve)です。' },
  },
  'notification-channels': {
    ko: { title: '알림 채널', description: '설정된 알림 전송 채널 수와 활성 채널 수입니다.' },
    en: { title: 'Notification Channels', description: 'Number of configured notification channels and how many are active.' },
    ja: { title: '通知チャネル', description: '設定された通知チャネル数とアクティブなチャネル数です。' },
  },
  // ── Batch ──
  'total-batch-jobs': {
    ko: { title: '전체 배치 작업', description: '등록된 배치 작업의 총 수입니다.' },
    en: { title: 'Total Batch Jobs', description: 'Total number of registered batch jobs.' },
    ja: { title: '全バッチジョブ', description: '登録されたバッチジョブの総数です。' },
  },
  'batch-running': {
    ko: { title: '실행 중', description: '현재 실행 중인 배치 작업 수입니다.' },
    en: { title: 'Running Now', description: 'Number of batch jobs currently executing.' },
    ja: { title: '実行中', description: '現在実行中のバッチジョブ数です。' },
  },
  'batch-failed-24h': {
    ko: { title: '실패 (24h)', description: '최근 24시간 동안 실패한 배치 작업 수입니다.' },
    en: { title: 'Failed (24h)', description: 'Number of batch jobs that failed in the last 24 hours.' },
    ja: { title: '失敗 (24h)', description: '過去24時間に失敗したバッチジョブ数です。' },
  },
  'batch-success-rate': {
    ko: { title: '평균 성공률', description: '전체 배치 작업의 평균 성공률(%)입니다.' },
    en: { title: 'Avg Success Rate', description: 'Average success rate across all batch jobs (%).' },
    ja: { title: '平均成功率', description: '全バッチジョブの平均成功率(%)です。' },
  },
  // ── Agents ──
  'total-agents': {
    ko: { title: '전체 에이전트', description: '등록된 전체 모니터링 에이전트 수입니다.' },
    en: { title: 'Total Agents', description: 'Total number of registered monitoring agents.' },
    ja: { title: '全エージェント', description: '登録された全モニタリングエージェント数です。' },
  },
  'agents-healthy': {
    ko: { title: '정상 에이전트', description: '정상적으로 동작 중인 에이전트 수입니다.' },
    en: { title: 'Healthy Agents', description: 'Number of agents operating normally.' },
    ja: { title: '正常エージェント', description: '正常に動作中のエージェント数です。' },
  },
  'agents-degraded': {
    ko: { title: '성능 저하', description: '성능이 저하된 상태의 에이전트 수입니다.' },
    en: { title: 'Degraded Agents', description: 'Number of agents in degraded state.' },
    ja: { title: '性能低下', description: '性能が低下した状態のエージェント数です。' },
  },
  'agents-offline': {
    ko: { title: '오프라인', description: '오프라인 상태의 에이전트 수입니다. 확인이 필요합니다.' },
    en: { title: 'Offline Agents', description: 'Number of offline agents that need attention.' },
    ja: { title: 'オフライン', description: 'オフライン状態のエージェント数です。確認が必要です。' },
  },
  'agents-pending-updates': {
    ko: { title: '업데이트 대기', description: '최신 버전으로 업데이트가 필요한 에이전트 수입니다.' },
    en: { title: 'Pending Updates', description: 'Number of agents that need to be updated to the latest version.' },
    ja: { title: '更新待ち', description: '最新バージョンへの更新が必要なエージェント数です。' },
  },
  // ── AI Service Detail ──
  'ai-svc-ttft-p95': {
    ko: { title: 'TTFT P95', description: '이 AI 서비스의 Time To First Token 95 퍼센타일입니다.' },
    en: { title: 'TTFT P95', description: '95th percentile Time To First Token for this AI service.' },
    ja: { title: 'TTFT P95', description: 'このAIサービスのTime To First Tokenの95パーセンタイルです。' },
  },
  'ai-svc-tps-p50': {
    ko: { title: 'TPS P50', description: '이 AI 서비스의 초당 토큰 생성 속도 중간값입니다.' },
    en: { title: 'TPS P50', description: 'Median tokens per second for this AI service.' },
    ja: { title: 'TPS P50', description: 'このAIサービスの秒間トークン生成速度の中央値です。' },
  },
  'ai-svc-cost': {
    ko: { title: '시간당 비용', description: '이 AI 서비스의 시간당 토큰 사용 비용입니다.' },
    en: { title: 'Hourly Cost', description: 'Hourly token usage cost for this AI service.' },
    ja: { title: '時間あたりコスト', description: 'このAIサービスの時間あたりトークン使用コストです。' },
  },
  'ai-svc-error-rate': {
    ko: { title: '에러율', description: '이 AI 서비스의 에러 응답 비율(%)입니다.' },
    en: { title: 'Error Rate', description: 'Error response rate for this AI service (%).' },
    ja: { title: 'エラー率', description: 'このAIサービスのエラー応答率(%)です。' },
  },
  'guardrail-total-checks': {
    ko: { title: '전체 검사', description: 'Guardrail이 수행한 전체 검사 수입니다.' },
    en: { title: 'Total Checks', description: 'Total number of checks performed by the guardrail.' },
    ja: { title: '全検査', description: 'ガードレールが実行した全検査数です。' },
  },
  'guardrail-blocked': {
    ko: { title: '차단 수', description: 'Guardrail에 의해 차단된 요청 수입니다.' },
    en: { title: 'Blocked', description: 'Number of requests blocked by the guardrail.' },
    ja: { title: 'ブロック数', description: 'ガードレールによってブロックされたリクエスト数です。' },
  },
  'guardrail-block-rate': {
    ko: { title: '차단률', description: 'Guardrail에 의해 차단된 요청의 비율(%)입니다.' },
    en: { title: 'Block Rate', description: 'Percentage of requests blocked by the guardrail.' },
    ja: { title: 'ブロック率', description: 'ガードレールによってブロックされたリクエストの割合(%)です。' },
  },
  'guardrail-latency-contrib': {
    ko: { title: '지연 기여도', description: '전체 응답 시간 중 Guardrail이 차지하는 비율(%)입니다.' },
    en: { title: 'Latency Contribution', description: 'Percentage of total response time attributed to the guardrail.' },
    ja: { title: 'レイテンシ寄与', description: '全体応答時間に対するガードレールの割合(%)です。' },
  },
  // ── AI Diagnostics ──
  'ai-diag-total': {
    ko: { title: '전체 항목', description: 'AI 진단 항목의 총 수입니다.' },
    en: { title: 'Total Items', description: 'Total number of AI diagnostic items.' },
    ja: { title: '全項目', description: 'AI診断項目の総数です。' },
  },
  'ai-diag-passed': {
    ko: { title: '통과', description: '진단을 통과한 항목 수입니다.' },
    en: { title: 'Passed', description: 'Number of diagnostic items that passed.' },
    ja: { title: '合格', description: '診断に合格した項目数です。' },
  },
  'ai-diag-warned': {
    ko: { title: '경고', description: '경고 상태인 진단 항목 수입니다.' },
    en: { title: 'Warned', description: 'Number of diagnostic items in warning state.' },
    ja: { title: '警告', description: '警告状態の診断項目数です。' },
  },
  'ai-diag-failed': {
    ko: { title: '실패', description: '진단에 실패한 항목 수입니다.' },
    en: { title: 'Failed', description: 'Number of diagnostic items that failed.' },
    ja: { title: '失敗', description: '診断に失敗した項目数です。' },
  },
  // ── AI Evaluation ──
  'eval-total': {
    ko: { title: '전체 평가', description: 'LLM 평가 작업의 총 수입니다.' },
    en: { title: 'Total Evaluations', description: 'Total number of LLM evaluation jobs.' },
    ja: { title: '全評価', description: 'LLM評価ジョブの総数です。' },
  },
  'eval-avg-quality': {
    ko: { title: '평균 품질', description: '전체 평가의 평균 품질 점수입니다.' },
    en: { title: 'Avg Quality', description: 'Average quality score across all evaluations.' },
    ja: { title: '平均品質', description: '全評価の平均品質スコアです。' },
  },
  'eval-pass-rate': {
    ko: { title: '통과율', description: '임계값을 충족한 평가 메트릭의 비율(%)입니다.' },
    en: { title: 'Pass Rate', description: 'Percentage of evaluation metrics meeting their threshold.' },
    ja: { title: '合格率', description: '閾値を満たした評価メトリクスの割合(%)です。' },
  },
  'eval-running': {
    ko: { title: '실행 중', description: '현재 실행 중인 평가 작업 수입니다.' },
    en: { title: 'Running', description: 'Number of evaluation jobs currently running.' },
    ja: { title: '実行中', description: '現在実行中の評価ジョブ数です。' },
  },
  // ── AI Overview ──
  'ai-services-count': {
    ko: { title: 'AI 서비스', description: '활성 AI 서비스(모델) 수와 총 호출 수입니다.' },
    en: { title: 'AI Services', description: 'Number of active AI services (models) and total calls.' },
    ja: { title: 'AIサービス', description: 'アクティブなAIサービス(モデル)数と総呼び出し数です。' },
  },
  'ai-total-tokens': {
    ko: { title: '전체 토큰', description: '모든 AI 서비스에서 사용된 총 토큰 수입니다.' },
    en: { title: 'Total Tokens', description: 'Total tokens used across all AI services.' },
    ja: { title: '全トークン', description: '全AIサービスで使用された総トークン数です。' },
  },
  'ai-total-cost': {
    ko: { title: '전체 비용', description: '모든 AI 서비스의 총 비용입니다.' },
    en: { title: 'Total Cost', description: 'Total cost across all AI services.' },
    ja: { title: '全コスト', description: '全AIサービスの総コストです。' },
  },
  'ai-avg-latency': {
    ko: { title: '평균 지연시간', description: 'AI 서비스 호출의 평균 응답 시간(ms)입니다.' },
    en: { title: 'Avg Latency', description: 'Average response time for AI service calls (ms).' },
    ja: { title: '平均レイテンシ', description: 'AIサービス呼び出しの平均応答時間(ms)です。' },
  },
  'ai-models-count': {
    ko: { title: '모델 수', description: '사용 중인 AI 모델의 수입니다.' },
    en: { title: 'Models', description: 'Number of AI models in use.' },
    ja: { title: 'モデル数', description: '使用中のAIモデル数です。' },
  },
  // ── GPU Cluster ──
  'gpu-count': {
    ko: { title: 'GPU 수', description: '모니터링 중인 전체 GPU 수입니다.' },
    en: { title: 'GPU Count', description: 'Total number of monitored GPUs.' },
    ja: { title: 'GPU数', description: '監視中の全GPU数です。' },
  },
  'gpu-avg-vram': {
    ko: { title: '평균 VRAM', description: 'GPU VRAM 사용률 평균(%)입니다.' },
    en: { title: 'Avg VRAM', description: 'Average GPU VRAM utilization (%).' },
    ja: { title: '平均VRAM', description: 'GPU VRAM使用率の平均(%)です。' },
  },
  'gpu-avg-temp': {
    ko: { title: '평균 온도', description: 'GPU 평균 온도(°C)입니다.' },
    en: { title: 'Avg Temp', description: 'Average GPU temperature (°C).' },
    ja: { title: '平均温度', description: 'GPU平均温度(°C)です。' },
  },
  'gpu-total-power': {
    ko: { title: '전체 전력', description: '모든 GPU의 총 전력 소비(W)입니다.' },
    en: { title: 'Total Power', description: 'Total power consumption across all GPUs (W).' },
    ja: { title: '全消費電力', description: '全GPUの総消費電力(W)です。' },
  },
  'gpu-critical': {
    ko: { title: 'GPU 위험', description: 'VRAM 90% 이상인 GPU 수입니다. OOM 위험이 있습니다.' },
    en: { title: 'GPU Critical', description: 'Number of GPUs with VRAM >= 90%. OOM risk present.' },
    ja: { title: 'GPU危険', description: 'VRAM 90%以上のGPU数です。OOMリスクがあります。' },
  },
  'gpu-vgpu': {
    ko: { title: 'vGPU', description: '가상 GPU 인스턴스 수입니다.' },
    en: { title: 'vGPU', description: 'Number of virtual GPU instances.' },
    ja: { title: 'vGPU', description: '仮想GPUインスタンス数です。' },
  },
  'gpu-mig': {
    ko: { title: 'MIG', description: 'MIG(Multi-Instance GPU) 파티션 수입니다.' },
    en: { title: 'MIG', description: 'Number of MIG (Multi-Instance GPU) partitions.' },
    ja: { title: 'MIG', description: 'MIG(Multi-Instance GPU)パーティション数です。' },
  },
  // ── LLM Traces ──
  'llm-total-calls': {
    ko: { title: 'LLM 호출 수', description: 'LLM API 호출의 총 수입니다.' },
    en: { title: 'Total LLM Calls', description: 'Total number of LLM API calls.' },
    ja: { title: 'LLM呼び出し数', description: 'LLM API呼び出しの総数です。' },
  },
  'llm-total-tokens': {
    ko: { title: 'LLM 토큰', description: 'LLM 호출에서 사용된 총 토큰 수입니다.' },
    en: { title: 'LLM Tokens', description: 'Total tokens used in LLM calls.' },
    ja: { title: 'LLMトークン', description: 'LLM呼び出しで使用された総トークン数です。' },
  },
  'llm-total-cost': {
    ko: { title: 'LLM 비용', description: 'LLM 호출의 총 비용입니다.' },
    en: { title: 'LLM Cost', description: 'Total cost of LLM calls.' },
    ja: { title: 'LLMコスト', description: 'LLM呼び出しの総コストです。' },
  },
  'llm-avg-latency': {
    ko: { title: 'LLM 평균 지연', description: 'LLM 호출의 평균 응답 시간(ms)입니다.' },
    en: { title: 'LLM Avg Latency', description: 'Average response time for LLM calls (ms).' },
    ja: { title: 'LLM平均レイテンシ', description: 'LLM呼び出しの平均応答時間(ms)です。' },
  },
  // ── AI Costs ──
  'ai-total-daily-cost': {
    ko: { title: 'AI 일일 비용', description: 'AI 서비스의 일일 총 비용입니다.' },
    en: { title: 'Total AI Cost', description: 'Total daily cost of AI services.' },
    ja: { title: 'AI日次コスト', description: 'AIサービスの日次総コストです。' },
  },
  'ai-potential-savings': {
    ko: { title: '잠재 절감액', description: '최적화를 통해 절감 가능한 일일 비용입니다.' },
    en: { title: 'Potential Savings', description: 'Daily cost that could be saved through optimization.' },
    ja: { title: '潜在節約額', description: '最適化により節約可能な日次コストです。' },
  },
  'ai-cache-hit-rate': {
    ko: { title: '캐시 적중률', description: 'AI 요청의 캐시 적중률(%)입니다.' },
    en: { title: 'Cache Hit Rate', description: 'Cache hit rate for AI requests (%).' },
    ja: { title: 'キャッシュヒット率', description: 'AIリクエストのキャッシュヒット率(%)です。' },
  },
  'ai-budget-alerts': {
    ko: { title: '예산 알림', description: '활성화된 예산 알림 수입니다.' },
    en: { title: 'Budget Alerts', description: 'Number of active budget alerts.' },
    ja: { title: '予算アラート', description: '有効な予算アラート数です。' },
  },
  // ── Training ──
  'training-active-jobs': {
    ko: { title: '활성 작업', description: '현재 실행 중인 파인튜닝 작업 수입니다.' },
    en: { title: 'Active Jobs', description: 'Number of currently running fine-tuning jobs.' },
    ja: { title: 'アクティブジョブ', description: '現在実行中のファインチューニングジョブ数です。' },
  },
  'training-avg-gpu': {
    ko: { title: '평균 GPU 사용률', description: '학습 중인 GPU의 평균 사용률(%)입니다.' },
    en: { title: 'Avg GPU Utilization', description: 'Average GPU utilization during training (%).' },
    ja: { title: '平均GPU使用率', description: 'トレーニング中のGPUの平均使用率(%)です。' },
  },
  'training-best-loss': {
    ko: { title: '최저 손실값', description: '현재까지의 최저 검증 손실값입니다.' },
    en: { title: 'Best Loss', description: 'Current best validation loss value.' },
    ja: { title: '最低損失値', description: '現在までの最低検証損失値です。' },
  },
  'training-total-checkpoints': {
    ko: { title: '전체 체크포인트', description: '모든 학습 작업의 저장된 체크포인트 수입니다.' },
    en: { title: 'Total Checkpoints', description: 'Number of saved checkpoints across all training jobs.' },
    ja: { title: '全チェックポイント', description: '全トレーニングジョブの保存されたチェックポイント数です。' },
  },
  'training-val-loss': {
    ko: { title: '검증 손실', description: '현재 학습 작업의 검증 손실값입니다.' },
    en: { title: 'Val Loss', description: 'Validation loss for the current training job.' },
    ja: { title: '検証損失', description: '現在のトレーニングジョブの検証損失値です。' },
  },
  'training-val-accuracy': {
    ko: { title: '검증 정확도', description: '현재 학습 작업의 검증 정확도(%)입니다.' },
    en: { title: 'Val Accuracy', description: 'Validation accuracy for the current training job (%).' },
    ja: { title: '検証精度', description: '現在のトレーニングジョブの検証精度(%)です。' },
  },
  'training-gpu-util': {
    ko: { title: 'GPU 사용률', description: '이 학습 작업에 할당된 GPU의 사용률(%)입니다.' },
    en: { title: 'GPU Utilization', description: 'GPU utilization for this training job (%).' },
    ja: { title: 'GPU使用率', description: 'このトレーニングジョブに割り当てられたGPUの使用率(%)です。' },
  },
  'training-throughput': {
    ko: { title: '처리량', description: '초당 토큰 처리 속도(tok/s)입니다.' },
    en: { title: 'Throughput', description: 'Token processing speed (tok/s).' },
    ja: { title: 'スループット', description: 'トークン処理速度(tok/s)です。' },
  },
  // ── Prompts ──
  'prompt-total': {
    ko: { title: '전체 프롬프트', description: '등록된 프롬프트 템플릿의 총 수입니다.' },
    en: { title: 'Total Prompts', description: 'Total number of registered prompt templates.' },
    ja: { title: '全プロンプト', description: '登録されたプロンプトテンプレートの総数です。' },
  },
  'prompt-avg-quality': {
    ko: { title: '평균 품질', description: '전체 프롬프트의 평균 품질 점수입니다.' },
    en: { title: 'Avg Quality', description: 'Average quality score across all prompts.' },
    ja: { title: '平均品質', description: '全プロンプトの平均品質スコアです。' },
  },
  'prompt-24h-usage': {
    ko: { title: '24h 사용량', description: '최근 24시간 동안의 총 API 호출 수입니다.' },
    en: { title: '24h Usage', description: 'Total API calls in the last 24 hours.' },
    ja: { title: '24h使用量', description: '過去24時間の総API呼び出し数です。' },
  },
  'prompt-active-versions': {
    ko: { title: '활성 버전', description: '전체 프롬프트에 걸친 활성 버전 수입니다.' },
    en: { title: 'Active Versions', description: 'Number of active versions across all prompts.' },
    ja: { title: 'アクティブバージョン', description: '全プロンプトにわたるアクティブバージョン数です。' },
  },
  // ── Cost Analysis ──
  'total-daily-cost': {
    ko: { title: '일일 총 비용', description: '모든 카테고리의 일일 총 비용입니다.' },
    en: { title: 'Total Cost', description: 'Total daily cost across all categories.' },
    ja: { title: '日次総コスト', description: '全カテゴリの日次総コストです。' },
  },
  'monthly-estimate': {
    ko: { title: '월간 예상', description: '현재 사용량 기반 월간 예상 비용입니다.' },
    en: { title: 'Monthly Estimate', description: 'Projected monthly cost based on current usage.' },
    ja: { title: '月間予想', description: '現在の使用量に基づく月間予想コストです。' },
  },
  'llm-api-cost': {
    ko: { title: 'LLM API 비용', description: 'LLM API 호출의 일일 비용입니다.' },
    en: { title: 'LLM API Cost', description: 'Daily cost of LLM API calls.' },
    ja: { title: 'LLM APIコスト', description: 'LLM API呼び出しの日次コストです。' },
  },
  'gpu-compute-cost': {
    ko: { title: 'GPU 컴퓨트 비용', description: 'GPU 컴퓨트 리소스의 일일 비용입니다.' },
    en: { title: 'GPU Compute Cost', description: 'Daily cost of GPU compute resources.' },
    ja: { title: 'GPUコンピュートコスト', description: 'GPUコンピュートリソースの日次コストです。' },
  },
  // ── Cloud ──
  'total-cloud-cost': {
    ko: { title: '전체 클라우드 비용', description: '모든 클라우드 제공자의 월간 총 비용입니다.' },
    en: { title: 'Total Cloud Cost', description: 'Total monthly cost across all cloud providers.' },
    ja: { title: '全クラウドコスト', description: '全クラウドプロバイダーの月間総コストです。' },
  },
  'cloud-provider-cost': {
    ko: { title: '클라우드 제공자 비용', description: '개별 클라우드 제공자의 월간 비용입니다.' },
    en: { title: 'Cloud Provider Cost', description: 'Monthly cost for an individual cloud provider.' },
    ja: { title: 'クラウドプロバイダーコスト', description: '個別クラウドプロバイダーの月間コストです。' },
  },
  // ── Anomalies ──
  'anomaly-total-detected': {
    ko: { title: '탐지된 이상', description: 'ML 기반으로 탐지된 전체 이상 현상 수입니다.' },
    en: { title: 'Total Detected', description: 'Total anomalies detected by ML-based monitoring.' },
    ja: { title: '検出された異常', description: 'MLベースで検出された全異常数です。' },
  },
  'anomaly-active': {
    ko: { title: '활성 이상', description: '현재 활성 상태인 이상 현상 수입니다.' },
    en: { title: 'Active Anomalies', description: 'Number of currently active anomalies.' },
    ja: { title: 'アクティブ異常', description: '現在アクティブな異常数です。' },
  },
  'anomaly-detection-time': {
    ko: { title: '평균 탐지 시간', description: '이상 현상의 평균 탐지 소요 시간(분)입니다.' },
    en: { title: 'Avg Detection Time', description: 'Mean detection latency for anomalies (minutes).' },
    ja: { title: '平均検出時間', description: '異常の平均検出所要時間(分)です。' },
  },
  'anomaly-auto-resolved': {
    ko: { title: '자동 해결률', description: '자동으로 해결된 이상 현상의 비율(%)입니다.' },
    en: { title: 'Auto-Resolved Rate', description: 'Percentage of anomalies that were auto-resolved.' },
    ja: { title: '自動解決率', description: '自動的に解決された異常の割合(%)です。' },
  },
  // ── Agent Profiling ──
  'profiling-detected-processes': {
    ko: { title: '탐지된 프로세스', description: '어태치 가능한 탐지된 프로세스 수입니다.' },
    en: { title: 'Detected Processes', description: 'Number of detected attachable processes.' },
    ja: { title: '検出プロセス', description: 'アタッチ可能な検出されたプロセス数です。' },
  },
  'profiling-active-sessions': {
    ko: { title: '활성 세션', description: '현재 프로파일링 중인 활성 세션 수입니다.' },
    en: { title: 'Active Sessions', description: 'Number of active profiling sessions.' },
    ja: { title: 'アクティブセッション', description: '現在プロファイリング中のアクティブセッション数です。' },
  },
  'profiling-failed-sessions': {
    ko: { title: '실패 세션', description: '어태치에 실패한 세션 수입니다.' },
    en: { title: 'Failed Sessions', description: 'Number of sessions with attach errors.' },
    ja: { title: '失敗セッション', description: 'アタッチに失敗したセッション数です。' },
  },
  'profiling-total-sessions': {
    ko: { title: '전체 세션', description: '지금까지의 전체 프로파일링 세션 수입니다.' },
    en: { title: 'Total Sessions', description: 'Total number of profiling sessions to date.' },
    ja: { title: '全セッション', description: 'これまでの全プロファイリングセッション数です。' },
  },
  // ── Plugins ──
  'plugin-total': {
    ko: { title: '전체 플러그인', description: '등록된 플러그인의 총 수입니다.' },
    en: { title: 'Total Plugins', description: 'Total number of registered plugins.' },
    ja: { title: '全プラグイン', description: '登録されたプラグインの総数です。' },
  },
  'plugin-deployed-agents': {
    ko: { title: '배포된 에이전트', description: '플러그인이 설치된 에이전트 수입니다.' },
    en: { title: 'Deployed Agents', description: 'Number of agents with plugins installed.' },
    ja: { title: 'デプロイ済みエージェント', description: 'プラグインがインストールされたエージェント数です。' },
  },
  'plugin-success-rate': {
    ko: { title: '성공률', description: '플러그인 배포 성공률(%)입니다.' },
    en: { title: 'Success Rate', description: 'Plugin deployment success rate (%).' },
    ja: { title: '成功率', description: 'プラグインデプロイ成功率(%)です。' },
  },
  'plugin-pending-deploys': {
    ko: { title: '대기 중 배포', description: '설치 대기 중인 플러그인 배포 수입니다.' },
    en: { title: 'Pending Deploys', description: 'Number of plugin deploys awaiting installation.' },
    ja: { title: '保留中デプロイ', description: 'インストール待ちのプラグインデプロイ数です。' },
  },
  'plugin-detail-total-agents': {
    ko: { title: '대상 에이전트', description: '이 플러그인의 대상 에이전트 수입니다.' },
    en: { title: 'Target Agents', description: 'Number of agents targeted for this plugin.' },
    ja: { title: '対象エージェント', description: 'このプラグインの対象エージェント数です。' },
  },
  'plugin-detail-installed': {
    ko: { title: '설치됨', description: '플러그인이 성공적으로 설치된 에이전트 수입니다.' },
    en: { title: 'Installed', description: 'Number of agents with the plugin successfully installed.' },
    ja: { title: 'インストール済み', description: 'プラグインが正常にインストールされたエージェント数です。' },
  },
  'plugin-detail-failed': {
    ko: { title: '실패', description: '플러그인 설치에 실패한 에이전트 수입니다.' },
    en: { title: 'Failed', description: 'Number of agents where plugin installation failed.' },
    ja: { title: '失敗', description: 'プラグインのインストールに失敗したエージェント数です。' },
  },
  'plugin-detail-pending': {
    ko: { title: '대기 중', description: '플러그인 설치 대기 중인 에이전트 수입니다.' },
    en: { title: 'Pending', description: 'Number of agents awaiting plugin installation.' },
    ja: { title: '保留中', description: 'プラグインのインストール待ちのエージェント数です。' },
  },
  // ── Agent Groups ──
  'group-agent-count': {
    ko: { title: '에이전트 수', description: '이 그룹에 속한 에이전트 수입니다.' },
    en: { title: 'Agent Count', description: 'Number of agents in this group.' },
    ja: { title: 'エージェント数', description: 'このグループに属するエージェント数です。' },
  },
  'group-healthy-pct': {
    ko: { title: '정상 비율', description: '그룹 내 정상 에이전트의 비율(%)입니다.' },
    en: { title: 'Healthy %', description: 'Percentage of healthy agents in this group.' },
    ja: { title: '正常率', description: 'グループ内の正常エージェントの割合(%)です。' },
  },
  'group-avg-cpu': {
    ko: { title: '평균 CPU', description: '그룹 내 에이전트의 평균 CPU 사용률(%)입니다.' },
    en: { title: 'Avg CPU', description: 'Average CPU usage across agents in this group (%).' },
    ja: { title: '平均CPU', description: 'グループ内エージェントの平均CPU使用率(%)です。' },
  },
  'group-avg-memory': {
    ko: { title: '평균 메모리', description: '그룹 내 에이전트의 평균 메모리 사용률(%)입니다.' },
    en: { title: 'Avg Memory', description: 'Average memory usage across agents in this group (%).' },
    ja: { title: '平均メモリ', description: 'グループ内エージェントの平均メモリ使用率(%)です。' },
  },
  // ── Continuous Profiling ──
  'profiling-total-profiles': {
    ko: { title: '전체 프로파일', description: '캡처된 프로파일의 총 수입니다.' },
    en: { title: 'Total Profiles', description: 'Total number of captured profiles.' },
    ja: { title: '全プロファイル', description: 'キャプチャされたプロファイルの総数です。' },
  },
  'profiling-active-services': {
    ko: { title: '활성 서비스', description: '프로파일링 중인 서비스 수입니다.' },
    en: { title: 'Active Services', description: 'Number of services being profiled.' },
    ja: { title: 'アクティブサービス', description: 'プロファイリング中のサービス数です。' },
  },
  'profiling-avg-duration': {
    ko: { title: '평균 지속 시간', description: '프로파일의 평균 캡처 시간(초)입니다.' },
    en: { title: 'Avg Duration', description: 'Average profile capture duration (seconds).' },
    ja: { title: '平均期間', description: 'プロファイルの平均キャプチャ時間(秒)です。' },
  },
  'profiling-storage': {
    ko: { title: '스토리지 사용량', description: '프로파일 데이터의 스토리지 사용량입니다.' },
    en: { title: 'Storage Used', description: 'Storage used by profile data.' },
    ja: { title: 'ストレージ使用量', description: 'プロファイルデータのストレージ使用量です。' },
  },
  // ── System Profiling ──
  'sys-profiling-total': {
    ko: { title: '시스템 프로파일', description: 'perf/eBPF로 캡처된 시스템 프로파일 수입니다.' },
    en: { title: 'System Profiles', description: 'Number of system profiles captured via perf/eBPF.' },
    ja: { title: 'システムプロファイル', description: 'perf/eBPFでキャプチャされたシステムプロファイル数です。' },
  },
  'sys-profiling-active-agents': {
    ko: { title: '활성 에이전트', description: '프로파일을 보고하는 활성 에이전트 수입니다.' },
    en: { title: 'Active Agents', description: 'Number of agents actively reporting profiles.' },
    ja: { title: 'アクティブエージェント', description: 'プロファイルを報告しているアクティブエージェント数です。' },
  },
  'sys-profiling-avg-duration': {
    ko: { title: '평균 지속 시간', description: '시스템 프로파일의 평균 캡처 시간(초)입니다.' },
    en: { title: 'Avg Duration', description: 'Average system profile capture duration (seconds).' },
    ja: { title: '平均期間', description: 'システムプロファイルの平均キャプチャ時間(秒)です。' },
  },
  'sys-profiling-storage': {
    ko: { title: '스토리지 사용량', description: '시스템 프로파일 데이터의 스토리지 사용량입니다.' },
    en: { title: 'Storage Used', description: 'Storage used by system profile data.' },
    ja: { title: 'ストレージ使用量', description: 'システムプロファイルデータのストレージ使用量です。' },
  },
  // ── SLO ──
  'slo-total': {
    ko: { title: '전체 SLO', description: '정의된 SLO(Service Level Objective)의 총 수입니다.' },
    en: { title: 'Total SLOs', description: 'Total number of defined Service Level Objectives.' },
    ja: { title: '全SLO', description: '定義されたSLO(Service Level Objective)の総数です。' },
  },
  'slo-avg-compliance': {
    ko: { title: '평균 준수율', description: '전체 SLO의 평균 준수율(%)입니다.' },
    en: { title: 'Avg Compliance', description: 'Average compliance rate across all SLOs (%).' },
    ja: { title: '平均準拠率', description: '全SLOの平均準拠率(%)です。' },
  },
  'slo-at-risk': {
    ko: { title: '위험 SLO', description: '위험 상태에 있는 SLO 수입니다.' },
    en: { title: 'At Risk', description: 'Number of SLOs in at-risk state.' },
    ja: { title: 'リスクSLO', description: 'リスク状態にあるSLO数です。' },
  },
  'slo-breached': {
    ko: { title: '위반 SLO', description: '목표를 위반한 SLO 수입니다.' },
    en: { title: 'Breached', description: 'Number of SLOs that breached their target.' },
    ja: { title: '違反SLO', description: '目標を違反したSLO数です。' },
  },
  'probe-total': {
    ko: { title: '전체 프로브', description: '합성 모니터링 프로브의 총 수입니다.' },
    en: { title: 'Total Probes', description: 'Total number of synthetic monitoring probes.' },
    ja: { title: '全プローブ', description: '合成モニタリングプローブの総数です。' },
  },
  'probe-healthy': {
    ko: { title: '정상 프로브', description: '정상적으로 동작 중인 프로브 수입니다.' },
    en: { title: 'Healthy Probes', description: 'Number of probes operating normally.' },
    ja: { title: '正常プローブ', description: '正常に動作中のプローブ数です。' },
  },
  'probe-degraded': {
    ko: { title: '성능 저하 프로브', description: '성능 문제가 있는 프로브 수입니다.' },
    en: { title: 'Degraded Probes', description: 'Number of probes with performance issues.' },
    ja: { title: '性能低下プローブ', description: '性能問題のあるプローブ数です。' },
  },
  'probe-down': {
    ko: { title: '다운 프로브', description: '도달 불가능한 프로브 수입니다.' },
    en: { title: 'Down Probes', description: 'Number of unreachable probes.' },
    ja: { title: 'ダウンプローブ', description: '到達不可能なプローブ数です。' },
  },
  // ── Diagnostics ──
  'diag-it-items': {
    ko: { title: 'IT 항목', description: 'OS, 미들웨어, 네트워크 등 IT 진단 항목 수입니다.' },
    en: { title: 'IT Items', description: 'Number of IT diagnostic items (OS, Middleware, Network).' },
    ja: { title: 'IT項目', description: 'OS、ミドルウェア、ネットワーク等のIT診断項目数です。' },
  },
  'diag-ai-items': {
    ko: { title: 'AI 항목', description: 'LLM, GPU, VectorDB, Guardrail 등 AI 진단 항목 수입니다.' },
    en: { title: 'AI Items', description: 'Number of AI diagnostic items (LLM, GPU, VectorDB, Guardrail).' },
    ja: { title: 'AI項目', description: 'LLM、GPU、VectorDB、ガードレール等のAI診断項目数です。' },
  },
  'diag-last-scan': {
    ko: { title: '마지막 스캔', description: '마지막 진단 스캔이 실행된 시간입니다.' },
    en: { title: 'Last Scan', description: 'Time of the last diagnostic scan run.' },
    ja: { title: '最終スキャン', description: '最後の診断スキャンが実行された時間です。' },
  },
  'diag-pass-rate': {
    ko: { title: '통과율', description: '진단 항목 중 통과한 비율(%)입니다.' },
    en: { title: 'Pass Rate', description: 'Percentage of diagnostic items that passed.' },
    ja: { title: '合格率', description: '診断項目のうち合格した割合(%)です。' },
  },
  // ── Executive ──
  'exec-overall-health': {
    ko: { title: '전체 상태', description: '시스템의 전반적인 상태입니다.' },
    en: { title: 'Overall Health', description: 'Overall system health status.' },
    ja: { title: '全体状態', description: 'システムの全体的な状態です。' },
  },
  'exec-services': {
    ko: { title: '서비스', description: '전체 서비스 수(AI 서비스 포함)입니다.' },
    en: { title: 'Services', description: 'Total number of services including AI services.' },
    ja: { title: 'サービス', description: 'AIサービスを含む全サービス数です。' },
  },
  'exec-slo-compliance': {
    ko: { title: 'SLO 준수율', description: '전체 SLO의 준수율(%)입니다.' },
    en: { title: 'SLO Compliance', description: 'Overall SLO compliance rate (%).' },
    ja: { title: 'SLO準拠率', description: '全SLOの準拠率(%)です。' },
  },
  'exec-open-incidents': {
    ko: { title: '미해결 인시던트', description: '현재 미해결 상태의 인시던트 수입니다.' },
    en: { title: 'Open Incidents', description: 'Number of currently open incidents.' },
    ja: { title: '未解決インシデント', description: '現在未解決のインシデント数です。' },
  },
  'exec-mttr': {
    ko: { title: 'MTTR', description: '평균 복구 시간(분)입니다.' },
    en: { title: 'MTTR', description: 'Mean Time To Resolve (minutes).' },
    ja: { title: 'MTTR', description: '平均復旧時間(分)です。' },
  },
  'exec-daily-cost': {
    ko: { title: '일일 비용', description: '일일 총 운영 비용입니다.' },
    en: { title: 'Daily Cost', description: 'Total daily operational cost.' },
    ja: { title: '日次コスト', description: '日次総運用コストです。' },
  },
  // ── Tenants ──
  'tenant-total': {
    ko: { title: '전체 테넌트', description: '등록된 전체 테넌트 수입니다.' },
    en: { title: 'Total Tenants', description: 'Total number of registered tenants.' },
    ja: { title: '全テナント', description: '登録された全テナント数です。' },
  },
  'tenant-monthly-revenue': {
    ko: { title: '월 수익', description: '전체 테넌트의 월간 총 수익입니다.' },
    en: { title: 'Monthly Revenue', description: 'Total monthly revenue across all tenants.' },
    ja: { title: '月間収益', description: '全テナントの月間総収益です。' },
  },
  'tenant-total-users': {
    ko: { title: '전체 사용자', description: '모든 테넌트의 총 사용자 수입니다.' },
    en: { title: 'Total Users', description: 'Total number of users across all tenants.' },
    ja: { title: '全ユーザー', description: '全テナントの総ユーザー数です。' },
  },
  'tenant-total-hosts': {
    ko: { title: '전체 호스트', description: '모든 테넌트의 총 호스트 수입니다.' },
    en: { title: 'Total Hosts', description: 'Total number of hosts across all tenants.' },
    ja: { title: '全ホスト', description: '全テナントの総ホスト数です。' },
  },
  'tenant-avg-revenue': {
    ko: { title: '평균 수익', description: '테넌트당 평균 월간 수익입니다.' },
    en: { title: 'Avg Revenue', description: 'Average monthly revenue per tenant.' },
    ja: { title: '平均収益', description: 'テナントあたりの平均月間収益です。' },
  },
  // ── Marketplace ──
  'marketplace-total': {
    ko: { title: '전체 항목', description: '마켓플레이스에 등록된 전체 항목 수입니다.' },
    en: { title: 'Total Items', description: 'Total number of items in the marketplace.' },
    ja: { title: '全アイテム', description: 'マーケットプレイスに登録された全アイテム数です。' },
  },
  'marketplace-dashboards': {
    ko: { title: '대시보드', description: '마켓플레이스의 대시보드 항목 수입니다.' },
    en: { title: 'Dashboards', description: 'Number of dashboard items in the marketplace.' },
    ja: { title: 'ダッシュボード', description: 'マーケットプレイスのダッシュボードアイテム数です。' },
  },
  'marketplace-prompts': {
    ko: { title: '프롬프트', description: '마켓플레이스의 프롬프트 항목 수입니다.' },
    en: { title: 'Prompts', description: 'Number of prompt items in the marketplace.' },
    ja: { title: 'プロンプト', description: 'マーケットプレイスのプロンプトアイテム数です。' },
  },
  'marketplace-plugins': {
    ko: { title: '플러그인', description: '마켓플레이스의 플러그인 항목 수입니다.' },
    en: { title: 'Plugins', description: 'Number of plugin items in the marketplace.' },
    ja: { title: 'プラグイン', description: 'マーケットプレイスのプラグインアイテム数です。' },
  },
  // ── Mobile ──
  'mobile-critical-alerts': {
    ko: { title: '심각한 알림', description: '현재 활성화된 심각한 알림 수입니다.' },
    en: { title: 'Critical Alerts', description: 'Number of currently active critical alerts.' },
    ja: { title: '重大アラート', description: '現在アクティブな重大アラート数です。' },
  },
  'mobile-service-health': {
    ko: { title: '서비스 상태', description: '전체 서비스의 정상 동작 비율(%)입니다.' },
    en: { title: 'Service Health', description: 'Percentage of services operating normally.' },
    ja: { title: 'サービス状態', description: '正常に動作しているサービスの割合(%)です。' },
  },
  'mobile-ttft-p95': {
    ko: { title: 'TTFT P95', description: 'Time To First Token의 95 퍼센타일입니다.' },
    en: { title: 'TTFT P95', description: '95th percentile Time To First Token.' },
    ja: { title: 'TTFT P95', description: 'Time To First Tokenの95パーセンタイルです。' },
  },
  'mobile-gpu-avg': {
    ko: { title: 'GPU 평균', description: 'GPU 평균 사용률(%)입니다.' },
    en: { title: 'GPU Avg', description: 'Average GPU utilization (%).' },
    ja: { title: 'GPU平均', description: 'GPU平均使用率(%)です。' },
  },
  // ── Infrastructure ── (additional)
  'infra-pending-agents': {
    ko: { title: '대기 에이전트', description: '승인 대기 중인 에이전트 수입니다.' },
    en: { title: 'Pending Agents', description: 'Number of agents awaiting approval.' },
    ja: { title: '保留エージェント', description: '承認待ちのエージェント数です。' },
  },
  // ── Middleware ──
  'middleware-hosts': {
    ko: { title: '모니터링 호스트', description: '미들웨어 모니터링 대상 호스트 수입니다.' },
    en: { title: 'Monitored Hosts', description: 'Number of hosts monitored for middleware.' },
    ja: { title: '監視ホスト', description: 'ミドルウェア監視対象のホスト数です。' },
  },
  'middleware-languages': {
    ko: { title: '언어', description: '감지된 프로그래밍 언어/런타임 수입니다.' },
    en: { title: 'Languages', description: 'Number of detected programming languages/runtimes.' },
    ja: { title: '言語', description: '検出されたプログラミング言語/ランタイム数です。' },
  },
  'middleware-conn-pools': {
    ko: { title: '커넥션 풀', description: '모니터링 중인 커넥션 풀 수입니다.' },
    en: { title: 'Connection Pools', description: 'Number of monitored connection pools.' },
    ja: { title: 'コネクションプール', description: '監視中のコネクションプール数です。' },
  },
  'middleware-leak-alerts': {
    ko: { title: '누수 알림', description: '커넥션 누수가 감지된 알림 수입니다.' },
    en: { title: 'Leak Alerts', description: 'Number of connection leak alerts detected.' },
    ja: { title: 'リークアラート', description: 'コネクションリークが検出されたアラート数です。' },
  },
  'conn-pool-total': {
    ko: { title: '전체 풀', description: '모니터링 중인 전체 커넥션 풀 수입니다.' },
    en: { title: 'Total Pools', description: 'Total number of monitored connection pools.' },
    ja: { title: '全プール', description: '監視中の全コネクションプール数です。' },
  },
  // ── Thread Dump ──
  'thread-total': {
    ko: { title: '전체 스레드', description: '전체 스레드 수입니다.' },
    en: { title: 'Total Threads', description: 'Total number of threads.' },
    ja: { title: '全スレッド', description: '全スレッド数です。' },
  },
  'thread-virtual': {
    ko: { title: '가상 스레드', description: '가상 스레드(Virtual Thread) 수입니다.' },
    en: { title: 'Virtual Threads', description: 'Number of virtual threads.' },
    ja: { title: '仮想スレッド', description: '仮想スレッド数です。' },
  },
  'thread-vt-running': {
    ko: { title: 'VT 실행 중', description: '실행 중인 가상 스레드 수입니다.' },
    en: { title: 'VT Running', description: 'Number of running virtual threads.' },
    ja: { title: 'VT実行中', description: '実行中の仮想スレッド数です。' },
  },
  // ── Database ──
  'db-total-instances': {
    ko: { title: '전체 인스턴스', description: '활성 데이터베이스 인스턴스의 총 수입니다.' },
    en: { title: 'Total Instances', description: 'Total number of active database instances.' },
    ja: { title: '全インスタンス', description: 'アクティブなデータベースインスタンスの総数です。' },
  },
  'db-avg-qps': {
    ko: { title: '평균 QPS', description: '전체 데이터베이스의 초당 평균 쿼리 수입니다.' },
    en: { title: 'Avg QPS', description: 'Average queries per second across all databases.' },
    ja: { title: '平均QPS', description: '全データベースの秒間平均クエリ数です。' },
  },
  'db-slow-queries': {
    ko: { title: '슬로우 쿼리 (24h)', description: '최근 24시간 동안 감지된 슬로우 쿼리 수입니다.' },
    en: { title: 'Slow Queries (24h)', description: 'Number of slow queries detected in the last 24 hours.' },
    ja: { title: 'スロークエリ (24h)', description: '過去24時間に検出されたスロークエリ数です。' },
  },
  'db-active-locks': {
    ko: { title: '활성 락', description: '현재 블로킹 중인 데이터베이스 락 수입니다.' },
    en: { title: 'Active Locks', description: 'Number of database locks currently blocking.' },
    ja: { title: 'アクティブロック', description: '現在ブロッキング中のデータベースロック数です。' },
  },
  // ── Golden Signals ──
  'gs-avg-latency-p95': {
    ko: { title: '평균 지연시간 P95', description: '전체 서비스의 P95 응답시간 평균(ms)입니다.' },
    en: { title: 'Avg Latency P95', description: 'Average P95 response time across all services (ms).' },
    ja: { title: '平均レイテンシP95', description: '全サービスのP95応答時間の平均(ms)です。' },
  },
  'gs-total-traffic': {
    ko: { title: '총 트래픽', description: '전체 서비스의 분당 총 요청 수(RPM)입니다.' },
    en: { title: 'Total Traffic', description: 'Total requests per minute (RPM) across all services.' },
    ja: { title: '総トラフィック', description: '全サービスの分間総リクエスト数(RPM)です。' },
  },
  'gs-avg-error-rate': {
    ko: { title: '평균 에러율', description: '전체 서비스의 평균 에러 비율(%)입니다.' },
    en: { title: 'Avg Error Rate', description: 'Average error rate across all services (%).' },
    ja: { title: '平均エラー率', description: '全サービスの平均エラー率(%)です。' },
  },
  'gs-avg-saturation': {
    ko: { title: '평균 포화도', description: '전체 서비스의 평균 CPU/메모리 사용률(%)입니다.' },
    en: { title: 'Avg Saturation', description: 'Average CPU/memory utilization across all services (%).' },
    ja: { title: '平均飽和度', description: '全サービスの平均CPU/メモリ使用率(%)です。' },
  },
  // ── Cache ──
  'cache-total-instances': {
    ko: { title: '전체 인스턴스', description: 'Redis/캐시 인스턴스의 총 수입니다.' },
    en: { title: 'Total Instances', description: 'Total number of Redis/cache instances.' },
    ja: { title: '全インスタンス', description: 'Redis/キャッシュインスタンスの総数です。' },
  },
  'cache-avg-hit-rate': {
    ko: { title: '평균 적중률', description: '전체 캐시 인스턴스의 평균 적중률(%)입니다.' },
    en: { title: 'Avg Hit Rate', description: 'Average cache hit rate across all instances (%).' },
    ja: { title: '平均ヒット率', description: '全キャッシュインスタンスの平均ヒット率(%)です。' },
  },
  'cache-avg-memory': {
    ko: { title: '평균 메모리', description: '전체 캐시 인스턴스의 평균 메모리 사용률(%)입니다.' },
    en: { title: 'Avg Memory', description: 'Average memory usage across all cache instances (%).' },
    ja: { title: '平均メモリ', description: '全キャッシュインスタンスの平均メモリ使用率(%)です。' },
  },
  'cache-total-ops': {
    ko: { title: '총 Ops/sec', description: '전체 캐시 인스턴스의 초당 총 오퍼레이션 수입니다.' },
    en: { title: 'Total Ops/sec', description: 'Total operations per second across all cache instances.' },
    ja: { title: '総Ops/sec', description: '全キャッシュインスタンスの秒間総オペレーション数です。' },
  },
  // ── Connection Pool ──
  'conn-pool-avg-util': {
    ko: { title: '평균 사용률', description: '전체 커넥션 풀의 평균 사용률(%)입니다.' },
    en: { title: 'Avg Utilization', description: 'Average utilization across all connection pools (%).' },
    ja: { title: '平均使用率', description: '全コネクションプールの平均使用率(%)です。' },
  },
  'conn-pool-leak-suspects': {
    ko: { title: '누수 의심', description: '커넥션 누수가 의심되는 풀 수입니다.' },
    en: { title: 'Leak Suspects', description: 'Number of connection pools with suspected leaks.' },
    ja: { title: 'リーク疑い', description: 'コネクションリークが疑われるプール数です。' },
  },
  'conn-pool-waiting': {
    ko: { title: '대기 요청', description: '커넥션을 대기 중인 요청이 있는 풀 수입니다.' },
    en: { title: 'Waiting Requests', description: 'Number of pools with requests waiting for a connection.' },
    ja: { title: '待機リクエスト', description: 'コネクション待ちのリクエストがあるプール数です。' },
  },
  // ── Message Queues ──
  'queue-total': {
    ko: { title: '전체 큐', description: '모니터링 중인 메시지 큐의 총 수입니다.' },
    en: { title: 'Total Queues', description: 'Total number of monitored message queues.' },
    ja: { title: '全キュー', description: '監視中のメッセージキューの総数です。' },
  },
  'queue-total-messages': {
    ko: { title: '전체 메시지', description: '모든 큐의 총 메시지 수입니다.' },
    en: { title: 'Total Messages', description: 'Total message count across all queues.' },
    ja: { title: '全メッセージ', description: '全キューの総メッセージ数です。' },
  },
  'queue-throughput': {
    ko: { title: '처리량', description: '전체 큐의 초당 메시지 처리량입니다.' },
    en: { title: 'Throughput', description: 'Total messages per second across all queues.' },
    ja: { title: 'スループット', description: '全キューの秒間メッセージ処理量です。' },
  },
  'queue-consumer-lag': {
    ko: { title: '컨슈머 랙', description: '전체 큐의 컨슈머 처리 지연 수입니다.' },
    en: { title: 'Consumer Lag', description: 'Total consumer lag across all queues.' },
    ja: { title: 'コンシューマーラグ', description: '全キューのコンシューマー処理遅延数です。' },
  },
  // ── Pipelines ──
  'pipeline-active': {
    ko: { title: '활성 파이프라인', description: '현재 활성 상태인 데이터 파이프라인 수입니다.' },
    en: { title: 'Active Pipelines', description: 'Number of currently active data pipelines.' },
    ja: { title: 'アクティブパイプライン', description: '現在アクティブなデータパイプライン数です。' },
  },
  'pipeline-running-tasks': {
    ko: { title: '실행 중 작업', description: '현재 실행 중인 파이프라인 태스크 수입니다.' },
    en: { title: 'Running Tasks', description: 'Number of pipeline tasks currently running.' },
    ja: { title: '実行中タスク', description: '現在実行中のパイプラインタスク数です。' },
  },
  'pipeline-success-rate': {
    ko: { title: '성공률', description: '파이프라인의 평균 성공률(%)입니다.' },
    en: { title: 'Success Rate', description: 'Average pipeline success rate (%).' },
    ja: { title: '成功率', description: 'パイプラインの平均成功率(%)です。' },
  },
  'pipeline-avg-duration': {
    ko: { title: '평균 소요시간', description: '파이프라인의 평균 실행 소요시간입니다.' },
    en: { title: 'Avg Duration', description: 'Average pipeline execution duration.' },
    ja: { title: '平均所要時間', description: 'パイプラインの平均実行所要時間です。' },
  },
  // ── Projects ──
  'project-services': {
    ko: { title: '서비스', description: '이 프로젝트에 속한 서비스 수입니다.' },
    en: { title: 'Services', description: 'Number of services in this project.' },
    ja: { title: 'サービス', description: 'このプロジェクトに属するサービス数です。' },
  },
  'project-error-rate': {
    ko: { title: '에러율', description: '이 프로젝트의 평균 에러율(%)입니다.' },
    en: { title: 'Error Rate', description: 'Average error rate for this project (%).' },
    ja: { title: 'エラー率', description: 'このプロジェクトの平均エラー率(%)です。' },
  },
  'project-p95-latency': {
    ko: { title: 'P95 응답시간', description: '이 프로젝트의 P95 응답시간(ms)입니다.' },
    en: { title: 'P95 Latency', description: 'P95 response time for this project (ms).' },
    ja: { title: 'P95レイテンシ', description: 'このプロジェクトのP95応答時間(ms)です。' },
  },
  'project-throughput': {
    ko: { title: '처리량', description: '이 프로젝트의 초당 요청 처리량입니다.' },
    en: { title: 'Throughput', description: 'Request throughput for this project.' },
    ja: { title: 'スループット', description: 'このプロジェクトの秒間リクエスト処理量です。' },
  },
  'project-slo-compliance': {
    ko: { title: 'SLO 준수율', description: '이 프로젝트의 SLO 달성률(%)입니다. 목표 99.5% 이상.' },
    en: { title: 'SLO Compliance', description: 'SLO compliance rate for this project (%). Target: 99.5%+.' },
    ja: { title: 'SLO準拠率', description: 'このプロジェクトのSLO達成率(%)です。目標99.5%以上。' },
  },
  // ── RUM (Real User Monitoring) ──
  'rum-avg-lcp': {
    ko: { title: '평균 LCP', description: 'Largest Contentful Paint의 평균값(ms)입니다. 2500ms 이하가 양호합니다.' },
    en: { title: 'Avg LCP', description: 'Average Largest Contentful Paint (ms). Under 2500ms is good.' },
    ja: { title: '平均LCP', description: 'Largest Contentful Paintの平均値(ms)です。2500ms以下が良好。' },
  },
  'rum-avg-fid': {
    ko: { title: '평균 FID', description: 'First Input Delay의 평균값(ms)입니다. 100ms 이하가 양호합니다.' },
    en: { title: 'Avg FID', description: 'Average First Input Delay (ms). Under 100ms is good.' },
    ja: { title: '平均FID', description: 'First Input Delayの平均値(ms)です。100ms以下が良好。' },
  },
  'rum-avg-cls': {
    ko: { title: '평균 CLS', description: 'Cumulative Layout Shift의 평균값입니다. 0.1 이하가 양호합니다.' },
    en: { title: 'Avg CLS', description: 'Average Cumulative Layout Shift. Under 0.1 is good.' },
    ja: { title: '平均CLS', description: 'Cumulative Layout Shiftの平均値です。0.1以下が良好。' },
  },
  'rum-total-sessions': {
    ko: { title: '전체 세션', description: '모든 지역의 총 사용자 세션 수입니다.' },
    en: { title: 'Total Sessions', description: 'Total user sessions across all regions.' },
    ja: { title: '全セッション', description: '全リージョンの総ユーザーセッション数です。' },
  },
  // ── .NET Runtime ──
  'dotnet-threadpool-starvation': {
    ko: { title: 'ThreadPool 기아 이벤트', description: '.NET ThreadPool 기아(Starvation) 이벤트 수입니다. 스레드 풀 고갈을 나타냅니다.' },
    en: { title: 'ThreadPool Starvation Events', description: 'Number of .NET ThreadPool starvation events indicating thread pool exhaustion.' },
    ja: { title: 'ThreadPoolスターベーション', description: '.NET ThreadPoolスターベーション（飢餓）イベント数です。' },
  },
  'dotnet-gc-suspension': {
    ko: { title: 'GC 일시정지 시간', description: '.NET GC 일시정지(Suspension) 시간 평균(ms)입니다.' },
    en: { title: 'GC Suspension Time', description: 'Average .NET GC suspension time across agents (ms).' },
    ja: { title: 'GCサスペンション時間', description: '.NET GCサスペンション時間の平均(ms)です。' },
  },
  'dotnet-avg-heap': {
    ko: { title: '평균 힙 크기', description: '.NET 관리 힙의 평균 크기(MB)입니다.' },
    en: { title: 'Avg Heap Size', description: 'Average .NET managed heap size (MB).' },
    ja: { title: '平均ヒープサイズ', description: '.NET管理ヒープの平均サイズ(MB)です。' },
  },
  'dotnet-aot-warnings': {
    ko: { title: 'AOT 경고', description: 'Native AOT 리플렉션 및 트리밍 경고의 총 수입니다.' },
    en: { title: 'AOT Warnings', description: 'Total number of Native AOT reflection and trimming warnings.' },
    ja: { title: 'AOT警告', description: 'Native AOTリフレクションおよびトリミング警告の総数です。' },
  },
  // ── Go Runtime ──
  'go-sched-latency-p95': {
    ko: { title: '스케줄러 지연 P95', description: 'Go 스케줄러 지연의 최대 P95 값(us)입니다.' },
    en: { title: 'Sched Latency P95', description: 'Worst-case P95 Go scheduler latency across agents (us).' },
    ja: { title: 'スケジューラレイテンシP95', description: 'Goスケジューラレイテンシの最大P95値(us)です。' },
  },
  'go-gc-stw-pause': {
    ko: { title: 'GC STW 일시정지', description: 'Go GC Stop-the-World 일시정지 평균 시간(us)입니다.' },
    en: { title: 'GC STW Pause', description: 'Average Go GC Stop-the-World pause duration (us).' },
    ja: { title: 'GC STWポーズ', description: 'Go GC Stop-the-Worldポーズの平均時間(us)です。' },
  },
  'go-total-goroutines': {
    ko: { title: '전체 고루틴', description: '모든 에이전트의 총 고루틴 수입니다.' },
    en: { title: 'Total Goroutines', description: 'Total goroutine count across all agents.' },
    ja: { title: '全ゴルーチン', description: '全エージェントの総ゴルーチン数です。' },
  },
  'go-heap-alloc': {
    ko: { title: '힙 할당', description: '전체 에이전트의 총 힙 메모리 할당량입니다.' },
    en: { title: 'Heap Alloc', description: 'Total heap allocation across all agents.' },
    ja: { title: 'ヒープ割り当て', description: '全エージェントの総ヒープメモリ割り当て量です。' },
  },
  // ── Python Runtime ──
  'python-gil-contention': {
    ko: { title: 'GIL 경합 / FT 활용률', description: 'GIL 경합률 또는 Free-Threaded 모드 활용률(%)입니다.' },
    en: { title: 'GIL Contention / FT Utilization', description: 'GIL contention rate or Free-Threaded mode utilization (%).' },
    ja: { title: 'GIL競合 / FT活用率', description: 'GIL競合率またはFree-Threadedモード活用率(%)です。' },
  },
  'python-active-threads': {
    ko: { title: '활성 스레드', description: '전체 Python 에이전트의 활성 스레드 수입니다.' },
    en: { title: 'Active Threads', description: 'Total active threads across all Python agents.' },
    ja: { title: 'アクティブスレッド', description: '全Pythonエージェントのアクティブスレッド数です。' },
  },
  'python-asyncio-pending': {
    ko: { title: 'Asyncio 대기 태스크', description: '전체 에이전트의 asyncio 대기 중인 태스크 수입니다.' },
    en: { title: 'Asyncio Pending Tasks', description: 'Total asyncio pending tasks across all agents.' },
    ja: { title: 'Asyncio待機タスク', description: '全エージェントのasyncio待機中タスク数です。' },
  },
  'python-gc-pause': {
    ko: { title: 'GC 일시정지 (평균)', description: 'Python GC 총 일시정지 시간 평균(ms)입니다.' },
    en: { title: 'GC Total Pause (avg)', description: 'Average Python GC total pause time per agent (ms).' },
    ja: { title: 'GCポーズ(平均)', description: 'Python GC総ポーズ時間の平均(ms)です。' },
  },
  // ── Service Detail ──
  'svc-latency-p95': {
    ko: { title: '지연시간 (P95)', description: '이 서비스의 P95 응답시간입니다.' },
    en: { title: 'Latency (P95)', description: 'P95 response time for this service.' },
    ja: { title: 'レイテンシ(P95)', description: 'このサービスのP95応答時間です。' },
  },
  'svc-traffic': {
    ko: { title: '트래픽', description: '이 서비스의 분당 요청 수(RPM)입니다.' },
    en: { title: 'Traffic', description: 'Requests per minute (RPM) for this service.' },
    ja: { title: 'トラフィック', description: 'このサービスの分間リクエスト数(RPM)です。' },
  },
  'svc-error-rate': {
    ko: { title: '에러율', description: '이 서비스의 에러 응답 비율(%)입니다.' },
    en: { title: 'Error Rate', description: 'Error response rate for this service (%).' },
    ja: { title: 'エラー率', description: 'このサービスのエラー応答率(%)です。' },
  },
  'svc-saturation': {
    ko: { title: '포화도', description: '이 서비스의 CPU 사용률(%)입니다. 메모리와 GPU 정보도 포함됩니다.' },
    en: { title: 'Saturation', description: 'CPU utilization for this service (%). Includes memory and GPU info.' },
    ja: { title: '飽和度', description: 'このサービスのCPU使用率(%)です。メモリとGPU情報も含まれます。' },
  },
  // ── Topology ──
  'topo-total-services': {
    ko: { title: '전체 서비스', description: '자동 탐색된 전체 서비스 수입니다.' },
    en: { title: 'Total Services', description: 'Total number of auto-discovered services.' },
    ja: { title: '全サービス', description: '自動検出された全サービス数です。' },
  },
  'topo-active-connections': {
    ko: { title: '활성 연결', description: '현재 활성 상태인 서비스 간 연결 수입니다.' },
    en: { title: 'Active Connections', description: 'Number of currently active service-to-service connections.' },
    ja: { title: 'アクティブ接続', description: '現在アクティブなサービス間接続数です。' },
  },
  'topo-new-24h': {
    ko: { title: '신규 (24h)', description: '최근 24시간 내 새로 발견된 연결 수입니다.' },
    en: { title: 'New (24h)', description: 'Number of newly discovered connections in the last 24 hours.' },
    ja: { title: '新規(24h)', description: '過去24時間に新たに発見された接続数です。' },
  },
  'topo-removed-24h': {
    ko: { title: '제거됨 (24h)', description: '최근 24시간 내 비활성화된 연결 수입니다.' },
    en: { title: 'Removed (24h)', description: 'Number of connections no longer active in the last 24 hours.' },
    ja: { title: '削除(24h)', description: '過去24時間に非アクティブになった接続数です。' },
  },
  'thread-vt-blocked': {
    ko: { title: 'VT 블록', description: '블록된 가상 스레드 수입니다.' },
    en: { title: 'VT Blocked', description: 'Number of blocked virtual threads.' },
    ja: { title: 'VTブロック', description: 'ブロックされた仮想スレッド数です。' },
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
