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
    ko: { title: '서비스', description: '현재 AITOP이 감시하고 있는 애플리케이션(서비스)의 총 개수입니다. 전체 수와 정상 가동 중인 수가 함께 표시되며, 정상 수가 전체보다 적으면 일부 서비스에 문제가 있다는 뜻입니다.' },
    en: { title: 'Services', description: 'The total number of applications (services) that AITOP is currently monitoring. Both the total count and healthy count are shown — if the healthy count is lower than total, some services may have issues that need attention.' },
    ja: { title: 'サービス', description: 'AITOPが現在監視しているアプリケーション（サービス）の合計数です。全体数と正常稼働中の数が一緒に表示され、正常数が全体より少ない場合は一部のサービスに問題が発生している可能性があります。' },
  },
  'error-rate': {
    ko: { title: '에러율', description: '사용자 요청 중 서버 오류(5xx)가 발생한 비율입니다. 예를 들어 1%라면 100건 중 1건이 실패한 것입니다. 0.5% 이상이면 서비스에 문제가 생기기 시작한 신호이므로 원인 확인이 필요합니다.' },
    en: { title: 'Error Rate', description: 'The percentage of user requests that resulted in a server error (5xx). For example, 1% means 1 out of every 100 requests failed. If this exceeds 0.5%, it signals a problem is developing and the root cause should be investigated.' },
    ja: { title: 'エラー率', description: 'ユーザーリクエストのうちサーバーエラー（5xx）が発生した割合です。例えば1%なら100件中1件が失敗したことを意味します。0.5%を超えるとサービスに問題が発生し始めた兆候なので、原因の確認が必要です。' },
  },
  'p95-latency': {
    ko: { title: 'P95 응답시간', description: '요청 100건 중 95건이 이 시간 안에 응답을 완료한다는 의미입니다. 예를 들어 250ms이면 대부분의 사용자가 0.25초 이내에 응답을 받는 것입니다. 이 값이 갑자기 올라가면 서비스가 느려지고 있다는 신호입니다.' },
    en: { title: 'P95 Latency', description: 'This means 95 out of 100 requests complete within this time. For example, 250ms means most users get a response in under a quarter second. A sudden increase indicates the service is slowing down and may need investigation.' },
    ja: { title: 'P95レイテンシ', description: 'リクエスト100件のうち95件がこの時間内に応答を完了するという意味です。例えば250msなら、ほとんどのユーザーが0.25秒以内に応答を受け取ります。この値が急に上昇した場合、サービスが遅くなっているサインです。' },
  },
  'throughput': {
    ko: { title: '처리량', description: '서비스가 1초 또는 1분 동안 처리하는 요청 건수입니다. 이 숫자가 높을수록 서비스가 바쁘게 일하고 있다는 뜻이며, 평소 대비 급격히 변하면 트래픽 이상을 의심해 볼 수 있습니다.' },
    en: { title: 'Throughput', description: 'The number of requests the service handles per second (TPS) or per minute (RPM). A higher number means the service is busier. If this changes drastically compared to normal levels, it could indicate a traffic anomaly or an incident worth investigating.' },
    ja: { title: 'スループット', description: 'サービスが1秒または1分間に処理するリクエスト件数です。この数値が高いほどサービスが忙しい状態であり、普段と比べて急激に変動した場合はトラフィック異常を疑ってみてください。' },
  },
  'cpu-usage': {
    ko: { title: 'CPU 사용률', description: '서버가 연산에 사용하는 능력의 비율(%)입니다. 85%를 넘으면 서버가 과부하 상태에 가까워지고 있으므로, 서비스 응답이 느려질 수 있습니다. 원인별로 User, System, IOWait로 나뉘어 어디에 부하가 걸리는지 파악할 수 있습니다.' },
    en: { title: 'CPU Usage', description: 'The percentage of the server\'s processing power currently in use. It is broken down into User (application), System (OS), and IOWait (disk) so you can see where the load is coming from. If it exceeds 85%, the server is approaching overload and responses may slow down.' },
    ja: { title: 'CPU使用率', description: 'サーバーが演算に使用しているCPUの割合（%）です。85%を超えるとサーバーが過負荷に近づいており、応答が遅くなる可能性があります。User、System、IOWaitの内訳で、どこに負荷がかかっているか確認できます。' },
  },
  'memory': {
    ko: { title: '메모리', description: '서버의 메모리(RAM)를 얼마나 사용하고 있는지 비율로 보여줍니다. 실제 사용 중인 영역과 캐시 영역으로 나뉘며, 사용률이 90%를 넘으면 메모리 부족으로 서비스가 불안정해질 수 있어 확인이 필요합니다.' },
    en: { title: 'Memory', description: 'How much of the server\'s RAM is currently in use, shown as a percentage. It is split into Used (actively occupied) and Cached (available if needed). If usage exceeds 90%, memory pressure can cause instability, so you should investigate the cause.' },
    ja: { title: 'メモリ', description: 'サーバーのメモリ（RAM）使用率を割合で表示します。実際に使用中の領域とキャッシュ領域に分かれており、使用率が90%を超えるとメモリ不足でサービスが不安定になる恐れがあります。' },
  },
  'disk': {
    ko: { title: '디스크', description: '서버 저장 공간(디스크)의 사용 현황입니다. 85%를 넘으면 곧 공간이 부족해질 수 있고, 95% 이상이면 로그 기록이나 데이터 저장이 멈출 위험이 있어 즉시 정리가 필요합니다.' },
    en: { title: 'Disk', description: 'Shows how full each disk partition is on the server. Above 85% means the disk could run out of space soon, and above 95% means logging or data storage may stop entirely. Clean up files or expand capacity immediately if usage is high.' },
    ja: { title: 'ディスク', description: 'サーバーのディスク使用状況です。85%を超えると空き容量が不足し始め、95%以上になるとログ記録やデータ保存が停止する恐れがあるため、早めにディスクの整理が必要です。' },
  },
  'network-io': {
    ko: { title: '네트워크 I/O', description: '서버가 주고받는 네트워크 데이터의 양(MB/초)입니다. 수신(RX)은 외부에서 들어오는 데이터, 송신(TX)은 나가는 데이터를 뜻합니다. 평소보다 갑자기 급증하면 비정상 트래픽이나 공격을 의심할 수 있습니다.' },
    en: { title: 'Network I/O', description: 'The amount of network data the server is sending and receiving in MB/s. RX is incoming data from external sources and TX is outgoing data. A sudden spike compared to normal levels could indicate abnormal traffic or a potential attack.' },
    ja: { title: 'ネットワークI/O', description: 'サーバーが送受信しているネットワークデータ量（MB/秒）です。受信（RX）は外部からのデータ、送信（TX）は外部へのデータを表します。普段より急増した場合は、異常トラフィックや攻撃の可能性を疑ってください。' },
  },
  // ── APM Widgets ──
  'apm-tps': {
    ko: { title: 'TPS (초당 트랜잭션)', description: '서비스가 매 초 처리하는 요청 건수를 5초마다 측정한 값입니다. 숫자가 높을수록 서비스가 바쁜 상태이며, 평소 대비 크게 변동하면 트래픽 급증이나 장애의 신호일 수 있습니다.' },
    en: { title: 'TPS (Transactions/sec)', description: 'The number of requests the service processes every second, measured at 5-second intervals. A higher number means the service is under heavier load. If it fluctuates significantly compared to normal, it could signal a traffic surge or an emerging issue.' },
    ja: { title: 'TPS (秒間トランザクション)', description: 'サービスが毎秒処理するリクエスト件数を5秒ごとに測定した値です。数値が高いほどサービスが忙しい状態であり、普段と比べて大きく変動した場合はトラフィック急増や障害のサインかもしれません。' },
  },
  'apm-tps-daily': {
    ko: { title: '금일 TPS', description: '오늘 하루 동안의 처리량 변화를 어제와 나란히 비교하는 차트입니다. 파란선이 오늘, 회색선이 어제이며, 두 선이 크게 다르면 오늘 트래픽 패턴이 평소와 다르다는 뜻이므로 원인을 확인해 보세요.' },
    en: { title: 'Today TPS', description: 'A chart comparing today\'s throughput with yesterday\'s over the same time period. The blue line is today and the gray line is yesterday. If the two lines differ significantly, today\'s traffic pattern is unusual and the cause should be checked.' },
    ja: { title: '本日TPS', description: '本日のスループット推移を昨日と並べて比較するチャートです。青い線が今日、灰色の線が昨日で、2本の線が大きく異なる場合は今日のトラフィックパターンが普段と違うことを意味します。' },
  },
  'apm-response-time': {
    ko: { title: '평균 응답시간', description: '사용자 요청에 서버가 응답하기까지 걸리는 평균 시간(밀리초)입니다. 노란 점선(500ms)을 넘으면 사용자가 느리다고 느끼기 시작하고, 빨간 점선(1초)을 넘으면 심각한 지연이므로 즉시 원인을 확인해야 합니다.' },
    en: { title: 'Avg Response Time', description: 'The average time (in milliseconds) the server takes to respond to a request, measured every 5 seconds. If it crosses the yellow dashed line (500ms), users start feeling delays. If it hits the red line (1 second), the delay is severe and requires immediate investigation.' },
    ja: { title: '平均応答時間', description: 'ユーザーリクエストに対するサーバーの平均応答時間（ミリ秒）です。黄色の点線（500ms）を超えるとユーザーが遅いと感じ始め、赤い点線（1秒）を超えると深刻な遅延なので即座に原因を確認してください。' },
  },
  'apm-active-txn': {
    ko: { title: '액티브 트랜잭션', description: '지금 이 순간 서버가 처리하고 있는 요청 건수입니다. 숫자가 갑자기 늘어나면 파랑에서 노랑, 빨강으로 색이 바뀌며, 빨강이면 서버가 요청을 소화하지 못하고 있다는 뜻이므로 조치가 필요합니다.' },
    en: { title: 'Active Transactions', description: 'The number of requests the server is processing right now. When this number spikes, the color changes from blue to yellow to red. Red means the server cannot keep up with incoming requests and action is needed to restore performance.' },
    ja: { title: 'アクティブトランザクション', description: '今この瞬間にサーバーが処理しているリクエスト件数です。数が急増すると青から黄、赤に色が変わり、赤色の場合はサーバーがリクエストを処理しきれていないため対処が必要です。' },
  },
  'apm-active-status': {
    ko: { title: '액티브 스테이터스', description: '현재 처리 중인 요청이 어디에서 시간을 쓰고 있는지 보여줍니다. METHOD는 일반 처리, SQL은 데이터베이스 대기, HTTPC는 외부 서비스 호출 대기를 의미합니다. DBC나 SOCKET 항목이 1 이상이면 연결 자원이 부족해지고 있으므로 점검이 필요합니다.' },
    en: { title: 'Active Status', description: 'Shows where active requests are spending their time: METHOD (general processing), SQL (waiting on database), HTTPC (calling external services), DBC (database connection), and SOCKET. If DBC or SOCKET shows 1 or more, connection resources are running low and need attention.' },
    ja: { title: 'アクティブステータス', description: '処理中のリクエストがどこで時間を費やしているかを示します。METHODは通常処理、SQLはDB待ち、HTTPCは外部サービス呼び出し待ちです。DBCやSOCKETが1以上の場合、接続リソースが不足している可能性があるため確認してください。' },
  },
  'apm-txn-speed': {
    ko: { title: '트랜잭션 스피드', description: '요청이 들어오고(RPS), 처리 중이고, 완료(TPS)되는 흐름을 한눈에 보여줍니다. 들어오는 속도가 완료 속도보다 계속 빠르면 요청이 쌓이고 있다는 뜻이며, 빨간색으로 바뀌면 서버 증설이나 원인 분석이 필요합니다.' },
    en: { title: 'Transaction Speed', description: 'Visualizes the flow of requests: incoming (RPS), currently processing, and completed (TPS). If the incoming rate stays higher than the completion rate, requests are piling up. When this turns red, it means the server needs scaling or the bottleneck needs investigation.' },
    ja: { title: 'トランザクションスピード', description: 'リクエストの流入（RPS）、処理中、完了（TPS）の流れを一目で確認できます。流入速度が完了速度を上回り続ける場合はリクエストが滞留しているサインで、赤色に変わったらサーバー増設や原因分析が必要です。' },
  },
  'apm-concurrent-users': {
    ko: { title: '동시접속 사용자', description: '최근 5분 이내에 서비스를 이용한 사용자의 수입니다. 같은 사람이 여러 번 요청해도 1명으로 집계됩니다. 평소보다 사용자가 급증하면 서버 부하가 올라갈 수 있으므로 다른 지표도 함께 확인하세요.' },
    en: { title: 'Concurrent Users', description: 'The number of unique users who have used the service within the last 5 minutes. Even if the same person makes multiple requests, they count as one. A sudden surge in users may increase server load, so check other metrics alongside this one.' },
    ja: { title: '同時接続ユーザー', description: '直近5分以内にサービスを利用したユーザーの数です。同一ユーザーが複数回リクエストしても1人としてカウントされます。普段よりユーザーが急増した場合はサーバー負荷が上がる可能性があるため、他の指標も合わせて確認してください。' },
  },
  // ── AI Widgets ──
  'ai-pipeline-waterfall': {
    ko: { title: 'AI 파이프라인 워터폴', description: 'AI가 질문에 답하기까지 거치는 각 단계의 소요 시간을 보여줍니다. 안전 검사(Guardrail), 문장 변환(Embedding), 관련 문서 검색, AI 답변 생성 순서로 진행되며, 어느 단계가 느린지 한눈에 파악할 수 있습니다.' },
    en: { title: 'AI Pipeline Waterfall', description: 'Shows the time spent at each stage of the AI pipeline as it processes a question: safety check (Guardrail), text conversion (Embedding), document search (Vector Search), and answer generation (LLM). This helps you quickly identify which stage is the bottleneck.' },
    ja: { title: 'AIパイプラインウォーターフォール', description: 'AIが質問に回答するまでの各ステージの所要時間を表示します。安全検査（Guardrail）、文章変換（Embedding）、関連文書検索、AI回答生成の順に進み、どのステージが遅いか一目で把握できます。' },
  },
  'ai-ttft-trend': {
    ko: { title: 'TTFT 추이', description: 'AI에게 질문한 뒤 첫 번째 글자가 나타나기까지 걸리는 시간입니다. 2초 이내면 양호하며, 이 값이 커지면 사용자가 답변을 오래 기다려야 합니다. 갑자기 증가하면 AI 서버에 부하가 걸렸을 수 있습니다.' },
    en: { title: 'TTFT Trend', description: 'Time To First Token measures how long a user waits before the AI starts producing its answer. Under 2 seconds is considered good. If this value suddenly increases, the AI server may be overloaded or experiencing issues that need investigation.' },
    ja: { title: 'TTFT推移', description: 'AIに質問してから最初の文字が表示されるまでの時間です。2秒以内なら良好で、この値が大きくなるとユーザーの待ち時間が長くなります。急に増加した場合はAIサーバーに負荷がかかっている可能性があります。' },
  },
  'ai-token-cost': {
    ko: { title: '토큰 비용', description: 'AI 모델이 텍스트를 처리할 때마다 발생하는 사용료를 시간 단위로 보여줍니다. 입력과 출력 글자 수에 따라 자동 계산되며, 설정한 예산을 초과하면 알림이 발생합니다. 비용이 급증하면 비효율적인 호출이 있는지 확인하세요.' },
    en: { title: 'Token Cost', description: 'The cost of using AI models, shown per hour in dollars. It is automatically calculated based on how many input and output tokens each model processes. If costs spike unexpectedly, check for inefficient or repeated API calls that might be wasting budget.' },
    ja: { title: 'トークンコスト', description: 'AIモデルがテキストを処理するたびに発生する使用料を時間単位で表示します。入力・出力の文字数に応じて自動計算され、設定した予算を超えるとアラートが発生します。コストが急増した場合は非効率な呼び出しがないか確認してください。' },
  },
  'slo-compliance': {
    ko: { title: 'SLO 준수율', description: '미리 정한 서비스 품질 목표(예: 응답시간 1초 이내)를 얼마나 잘 지키고 있는지 보여줍니다. 99.5% 이상이면 양호하며, 이 수치가 떨어지면 사용자 경험이 나빠지고 있다는 의미이므로 개선 조치가 필요합니다.' },
    en: { title: 'SLO Compliance', description: 'Shows how well the service is meeting its quality targets (e.g., response time under 1 second). A rate of 99.5% or above is considered healthy. If this number drops, it means user experience is degrading and improvements are needed.' },
    ja: { title: 'SLO準拠率', description: '事前に定めたサービス品質目標（例：応答時間1秒以内）をどの程度達成しているかを示します。99.5%以上なら良好で、この数値が下がるとユーザー体験が悪化しているため改善が必要です。' },
  },
  // ── Infrastructure ──
  'total-hosts': {
    ko: { title: '전체 호스트', description: 'AITOP이 감시하고 있는 서버(호스트)의 총 개수입니다. 여기에 표시되지 않는 서버가 있다면 에이전트가 설치되지 않았거나 연결이 끊긴 것이므로 확인이 필요합니다.' },
    en: { title: 'Total Hosts', description: 'The total number of servers (hosts) that AITOP is monitoring. If a server you expect to see is missing from this count, the monitoring agent may not be installed or may have lost its connection.' },
    ja: { title: '全ホスト', description: 'AITOPが監視しているサーバー（ホスト）の総数です。ここに表示されていないサーバーがある場合は、エージェントが未インストールか接続が切れている可能性があるため確認してください。' },
  },
  'healthy-hosts': {
    ko: { title: '정상 호스트', description: '현재 문제없이 잘 작동하고 있는 서버의 수입니다. 전체 호스트 수와 비교해서 정상 수가 적다면 일부 서버에 장애나 성능 문제가 있다는 뜻이므로 경고/위험 호스트를 확인하세요.' },
    en: { title: 'Healthy Hosts', description: 'The number of servers that are running without any issues right now. Compare this to the total host count. If the healthy count is lower, some servers have performance problems or outages that should be investigated.' },
    ja: { title: '正常ホスト', description: '現在問題なく正常に稼働しているサーバーの数です。全ホスト数と比較して正常数が少ない場合は、一部のサーバーに障害や性能問題が発生しているため、警告・危険ホストを確認してください。' },
  },
  'warning-hosts': {
    ko: { title: '경고 호스트', description: 'CPU, 메모리, 디스크 중 하나라도 설정된 기준치를 넘은 서버의 수입니다. 아직 서비스에 큰 영향은 없지만, 방치하면 장애로 이어질 수 있으므로 해당 서버의 상세 지표를 확인하고 조치를 준비하세요.' },
    en: { title: 'Warning Hosts', description: 'The number of servers where CPU, memory, or disk usage has exceeded the configured threshold. While the service may not be affected yet, ignoring warnings can lead to outages. Check the details of these hosts and prepare corrective action.' },
    ja: { title: '警告ホスト', description: 'CPU、メモリ、ディスクのいずれかが設定した閾値を超えたサーバーの数です。まだサービスへの大きな影響はありませんが、放置すると障害につながる可能性があるため、該当サーバーの詳細を確認してください。' },
  },
  'critical-hosts': {
    ko: { title: '위험/오프라인', description: '심각한 문제가 있거나 완전히 연결이 끊긴 서버의 수입니다. 이 숫자가 0이 아니면 해당 서버에서 운영 중인 서비스에 즉시 영향을 줄 수 있으므로 최우선으로 확인하고 복구 조치를 취하세요.' },
    en: { title: 'Critical / Offline', description: 'The number of servers with severe issues or that have completely lost connection. If this is not zero, the services running on those servers may be directly impacted. These should be investigated and restored as the highest priority.' },
    ja: { title: '危険/オフライン', description: '深刻な問題がある、または完全に接続が切れたサーバーの数です。この数が0でなければ、該当サーバーで稼働中のサービスに即座に影響が出る可能性があるため、最優先で確認し復旧措置を取ってください。' },
  },
  'backends': {
    ko: { title: '백엔드 연결', description: '모니터링 데이터를 수집하는 시스템(Prometheus, Jaeger 등)과의 연결 상태입니다. 연결이 끊기면 대시보드에 데이터가 표시되지 않으므로, 비정상 상태가 있으면 네트워크나 해당 시스템을 점검하세요.' },
    en: { title: 'Backends', description: 'The connection status of data collection systems like Prometheus and Jaeger that supply monitoring data. If a backend goes offline, dashboards will stop showing data for those sources. Check the network or the backend service if any connections are down.' },
    ja: { title: 'バックエンド接続', description: '監視データを収集するシステム（Prometheus、Jaeger等）との接続状態です。接続が切れるとダッシュボードにデータが表示されなくなるため、異常がある場合はネットワークや該当システムを点検してください。' },
  },
  // ── AI Service ──
  'ai-ttft': {
    ko: { title: 'TTFT P95', description: 'AI에게 질문한 뒤 첫 글자가 나타나기까지 걸리는 시간의 상위 95% 기준값입니다. 100번 질문 중 95번은 이 시간 안에 첫 글자가 나온다는 의미이며, 2초를 넘으면 사용자 체감 속도가 느려지므로 개선이 필요합니다.' },
    en: { title: 'TTFT P95', description: 'The 95th percentile time until the AI produces its first character of output. This means 95 out of 100 requests start showing a response within this time. If it exceeds 2 seconds, users will perceive noticeable delay and the cause should be investigated.' },
    ja: { title: 'TTFT P95', description: 'AIに質問してから最初の文字が表示されるまでの時間（上位95%基準）です。100回の質問のうち95回がこの時間内に最初の応答を開始します。2秒を超えるとユーザーの体感速度が遅くなるため改善が必要です。' },
  },
  'ai-tps': {
    ko: { title: 'TPS P50', description: 'AI가 1초에 생성하는 글자(토큰) 수의 중간값입니다. 30 이상이면 사용자가 답변이 자연스럽게 흘러나온다고 느끼며, 이보다 낮으면 답변 출력이 뚝뚝 끊기는 느낌을 줄 수 있습니다.' },
    en: { title: 'TPS P50', description: 'The median number of text tokens the AI generates per second. Above 30 tokens/sec feels smooth and natural to users. Below that threshold, the AI response may appear to stutter or output text too slowly for a good user experience.' },
    ja: { title: 'TPS P50', description: 'AIが1秒間に生成する文字（トークン）数の中央値です。30以上であればユーザーが回答をスムーズに受け取れますが、これより低いと回答出力が途切れ途切れに感じられることがあります。' },
  },
  'ai-gpu': {
    ko: { title: 'GPU 평균', description: 'AI 연산에 사용되는 GPU의 평균 사용률입니다. 75%를 넘으면 여유가 줄어들고 있다는 경고이고, 90%를 넘으면 GPU 자원이 부족해 AI 응답이 느려질 수 있어 GPU 추가 또는 요청 분산이 필요합니다.' },
    en: { title: 'GPU Avg', description: 'The average utilization of GPUs used for AI computation. Above 75% means capacity is shrinking, and above 90% means GPU resources are nearly exhausted, which can slow AI responses. Consider adding GPUs or distributing the workload if utilization stays high.' },
    ja: { title: 'GPU平均', description: 'AI演算に使用されるGPUの平均使用率です。75%を超えると余裕が減り始め、90%を超えるとGPUリソース不足でAI応答が遅くなる可能性があるため、GPU追加やリクエスト分散を検討してください。' },
  },
  'ai-block-rate': {
    ko: { title: '차단률', description: 'AI 안전 필터(Guardrail)가 부적절하다고 판단해 차단한 요청의 비율입니다. 3%를 넘으면 악의적 요청이 많거나 필터가 너무 엄격할 수 있고, 5% 이상이면 필터 설정을 재점검해야 합니다.' },
    en: { title: 'Block Rate', description: 'The percentage of AI requests that the safety filter (Guardrail) blocked as inappropriate. Above 3% may mean malicious requests are increasing or the filter is too strict. Above 5%, the guardrail configuration should be reviewed and adjusted.' },
    ja: { title: 'ブロック率', description: 'AI安全フィルター（Guardrail）が不適切と判断してブロックしたリクエストの割合です。3%を超えると悪意のあるリクエストが多いか、フィルターが厳しすぎる可能性があります。5%以上の場合はフィルター設定の見直しが必要です。' },
  },
  // ── Service ──
  'total-services': {
    ko: { title: '전체 서비스', description: 'AITOP이 감시 중인 애플리케이션(서비스)의 총 개수입니다. 새로운 서비스를 배포했는데 여기에 나타나지 않으면 에이전트 설정을 확인하세요.' },
    en: { title: 'Total Services', description: 'The total number of applications (services) that AITOP is currently monitoring. If you have deployed a new service but it does not appear here, check the agent configuration to ensure the service is properly registered.' },
    ja: { title: '全サービス', description: 'AITOPが監視中のアプリケーション（サービス）の総数です。新しいサービスをデプロイしたのにここに表示されない場合は、エージェントの設定を確認してください。' },
  },
  'avg-p95': {
    ko: { title: '평균 P95 응답시간', description: '모든 서비스의 P95 응답시간을 평균 낸 값입니다. 대부분의 사용자가 이 시간 안에 응답을 받는다는 뜻이며, 1초를 넘으면 전반적으로 서비스가 느려지고 있어 병목 원인 파악이 필요합니다.' },
    en: { title: 'Avg P95 Latency', description: 'The average P95 response time calculated across all services, representing what most users experience. If this exceeds 1 second, services are generally running slow and the bottleneck should be identified and addressed.' },
    ja: { title: '平均P95レイテンシ', description: 'すべてのサービスのP95応答時間を平均した値です。ほとんどのユーザーがこの時間内に応答を受け取れるという意味で、1秒を超えると全体的にサービスが遅くなっているためボトルネックの特定が必要です。' },
  },
  'total-throughput': {
    ko: { title: '총 처리량', description: '모든 서비스가 1분 동안 처리하는 요청 건수의 합계입니다. 이 숫자가 평소보다 급격히 높아지면 트래픽 급증을, 급격히 낮아지면 서비스 장애 가능성을 의심해 볼 수 있습니다.' },
    en: { title: 'Total Throughput', description: 'The combined number of requests processed per minute across all services. A sharp increase may indicate a traffic surge, while a sharp decrease could suggest a service outage or connectivity problem worth investigating.' },
    ja: { title: '総スループット', description: 'すべてのサービスが1分間に処理するリクエスト件数の合計です。この数値が普段より急激に上がるとトラフィック急増、急激に下がるとサービス障害の可能性を疑うことができます。' },
  },
  'avg-error-rate': {
    ko: { title: '평균 에러율', description: '모든 서비스에서 발생하는 오류 응답의 평균 비율입니다. 0.5%를 넘으면 일부 서비스에 문제가 시작되고 있다는 신호이므로, 어떤 서비스에서 에러가 많은지 상세 페이지에서 확인하세요.' },
    en: { title: 'Avg Error Rate', description: 'The average percentage of failed responses across all services. If this exceeds 0.5%, some services are starting to have problems. Check the service detail pages to find which specific services are generating the most errors.' },
    ja: { title: '平均エラー率', description: 'すべてのサービスで発生するエラー応答の平均割合です。0.5%を超えると一部のサービスで問題が発生し始めているサインなので、どのサービスでエラーが多いか詳細ページで確認してください。' },
  },
  'dependencies': {
    ko: { title: '의존성', description: '서비스들이 서로 호출하는 연결 관계의 수입니다. 예를 들어 A서비스가 B, C를 호출하면 의존성은 2개입니다. 토폴로지 맵에서 어떤 서비스가 어디에 연결되어 있는지 그림으로 확인할 수 있습니다.' },
    en: { title: 'Dependencies', description: 'The number of call relationships between services. For example, if Service A calls Service B and C, that creates 2 dependencies. You can view these connections visually on the topology map to understand how services are interconnected.' },
    ja: { title: '依存関係', description: 'サービス同士が呼び出し合っている接続関係の数です。例えばサービスAがB、Cを呼び出している場合、依存関係は2つになります。トポロジーマップでどのサービスがどこに接続されているか視覚的に確認できます。' },
  },
  // ── Alerts ──
  'alert-policies': {
    ko: { title: '알림 정책', description: '특정 조건(예: 에러율 1% 초과)이 발생하면 알림을 보내도록 설정한 규칙의 수입니다. 전체 등록 수와 현재 활성화된 수가 함께 표시되며, 필요한 알림이 비활성화되어 있지 않은지 정기적으로 확인하세요.' },
    en: { title: 'Alert Policies', description: 'The number of alert rules configured to notify you when certain conditions occur (e.g., error rate above 1%). Both total and active policy counts are shown. Periodically review to ensure important alerts have not been accidentally disabled.' },
    ja: { title: 'アラートポリシー', description: '特定の条件（例：エラー率1%超過）が発生した際に通知を送るルールの数です。全登録数と現在有効な数が表示されます。必要な通知が無効になっていないか定期的に確認してください。' },
  },
  'open-incidents': {
    ko: { title: '미해결 인시던트', description: '아직 해결되지 않은 장애나 이상 상황의 건수입니다. 0이면 현재 알려진 문제가 없다는 뜻이고, 숫자가 있으면 담당자가 확인하고 조치를 진행해야 합니다.' },
    en: { title: 'Open Incidents', description: 'The number of ongoing incidents that have not yet been resolved. Zero means there are no known issues at this time. If the count is above zero, the responsible team should be investigating and working toward resolution.' },
    ja: { title: '未解決インシデント', description: 'まだ解決されていない障害や異常事象の件数です。0であれば現在確認済みの問題はなく、数値がある場合は担当者が確認して対処を進める必要があります。' },
  },
  'mttr': {
    ko: { title: 'MTTR', description: '장애가 발생한 후 정상으로 복구되기까지 걸리는 평균 시간입니다. 이 시간이 짧을수록 장애 대응이 빠르다는 뜻이며, 점점 길어진다면 장애 대응 프로세스를 개선할 필요가 있습니다.' },
    en: { title: 'MTTR', description: 'Mean Time To Resolve is the average time it takes to fix an incident after it is detected. A shorter MTTR means your team responds faster to outages. If this number is trending upward, consider improving your incident response processes and runbooks.' },
    ja: { title: 'MTTR', description: '障害発生から正常復旧までにかかる平均時間です。この時間が短いほど障害対応が迅速であることを意味します。徐々に長くなっている場合は、障害対応プロセスの改善を検討してください。' },
  },
  'notification-channels': {
    ko: { title: '알림 채널', description: '장애 알림을 받는 경로(이메일, 슬랙, SMS 등)의 설정 현황입니다. 전체 채널 수와 활성화된 채널 수가 표시되며, 중요 채널이 비활성 상태면 장애 발생 시 알림을 놓칠 수 있으니 확인하세요.' },
    en: { title: 'Notification Channels', description: 'The channels through which incident alerts are sent, such as email, Slack, or SMS. The total and active counts are displayed. If critical channels are inactive, you might miss important alerts during an outage, so review the settings regularly.' },
    ja: { title: '通知チャネル', description: '障害通知を受け取る経路（メール、Slack、SMS等）の設定状況です。全チャネル数と有効なチャネル数が表示され、重要なチャネルが無効状態だと障害発生時に通知を見逃す恐れがあるため確認してください。' },
  },
  // ── Batch ──
  'total-batch-jobs': {
    ko: { title: '전체 배치 작업', description: '시스템에 등록된 자동 처리 작업(배치)의 총 개수입니다. 배치 작업은 데이터 정리, 보고서 생성 등 정해진 시간에 자동 실행되는 작업을 말합니다.' },
    en: { title: 'Total Batch Jobs', description: 'The total number of automated processing tasks (batch jobs) registered in the system. Batch jobs handle tasks like data cleanup and report generation that run on a schedule. Make sure all expected jobs are registered here.' },
    ja: { title: '全バッチジョブ', description: 'システムに登録された自動処理ジョブ（バッチ）の総数です。バッチジョブとは、データ整理やレポート生成など、決められた時間に自動実行される処理のことです。' },
  },
  'batch-running': {
    ko: { title: '실행 중', description: '지금 이 순간 돌아가고 있는 배치 작업의 수입니다. 평소보다 오래 실행 중인 작업이 있다면 처리 지연이나 오류가 발생했을 수 있으므로 상세 로그를 확인하세요.' },
    en: { title: 'Running Now', description: 'The number of batch jobs currently in progress. If a job has been running longer than usual, it may have encountered errors or processing delays. Check the detailed logs to investigate any long-running tasks.' },
    ja: { title: '実行中', description: '今この瞬間に実行されているバッチジョブの数です。普段より長時間実行されているジョブがある場合は、処理遅延やエラーが発生している可能性があるため詳細ログを確認してください。' },
  },
  'batch-failed-24h': {
    ko: { title: '실패 (24h)', description: '지난 24시간 동안 실패한 배치 작업의 건수입니다. 0이 정상이며, 실패가 있다면 해당 작업의 로그를 확인하여 원인(데이터 오류, 리소스 부족 등)을 파악하고 재실행하세요.' },
    en: { title: 'Failed (24h)', description: 'The number of batch jobs that failed in the past 24 hours. Ideally this should be zero. If there are failures, check the job logs to identify the cause (data issues, resource limits, etc.) and re-run the affected jobs.' },
    ja: { title: '失敗 (24h)', description: '過去24時間に失敗したバッチジョブの件数です。0が正常であり、失敗がある場合は該当ジョブのログを確認して原因（データエラー、リソース不足等）を特定し再実行してください。' },
  },
  'batch-success-rate': {
    ko: { title: '평균 성공률', description: '모든 배치 작업이 성공적으로 완료된 비율입니다. 100%에 가까울수록 좋으며, 이 수치가 떨어지면 반복적으로 실패하는 작업이 있다는 뜻이므로 해당 작업을 찾아 수정하세요.' },
    en: { title: 'Avg Success Rate', description: 'The percentage of batch jobs that completed successfully. The closer to 100% the better. If this rate drops, it means some jobs are failing repeatedly. Identify the problematic jobs and fix the underlying issues.' },
    ja: { title: '平均成功率', description: 'すべてのバッチジョブが正常に完了した割合です。100%に近いほど良好で、この数値が下がっている場合は繰り返し失敗しているジョブがあるため、該当ジョブを特定して修正してください。' },
  },
  // ── Agents ──
  'total-agents': {
    ko: { title: '전체 에이전트', description: '각 서버에 설치되어 모니터링 데이터를 수집하는 프로그램(에이전트)의 총 수입니다. 서버 수와 에이전트 수가 다르면 일부 서버에 에이전트가 설치되지 않았을 수 있습니다.' },
    en: { title: 'Total Agents', description: 'The total number of monitoring programs (agents) installed on your servers to collect data. If this number differs from your server count, some servers may be missing agent installations that need to be set up.' },
    ja: { title: '全エージェント', description: '各サーバーにインストールされ、監視データを収集するプログラム（エージェント）の総数です。サーバー数とエージェント数が異なる場合は、一部のサーバーにエージェントが未インストールの可能性があります。' },
  },
  'agents-healthy': {
    ko: { title: '정상 에이전트', description: '현재 정상적으로 데이터를 보내고 있는 에이전트의 수입니다. 전체 에이전트 수와 비교하여 차이가 있다면 일부 에이전트에 문제가 있으므로 상태를 확인하세요.' },
    en: { title: 'Healthy Agents', description: 'The number of agents that are currently sending data without any problems. Compare this to the total agent count. If there is a gap, some agents have issues that should be investigated to avoid monitoring blind spots.' },
    ja: { title: '正常エージェント', description: '現在正常にデータを送信しているエージェントの数です。全エージェント数と比較して差がある場合は、一部のエージェントに問題が発生しているため状態を確認してください。' },
  },
  'agents-degraded': {
    ko: { title: '성능 저하', description: '동작은 하지만 응답이 느리거나 일부 데이터 수집에 문제가 있는 에이전트의 수입니다. 즉시 장애는 아니지만, 방치하면 모니터링 사각지대가 생길 수 있으므로 원인을 확인하세요.' },
    en: { title: 'Degraded Agents', description: 'The number of agents that are running but with slow responses or partial data collection problems. While not an immediate outage, leaving them unaddressed can create monitoring gaps. Check the cause and restore them to a healthy state.' },
    ja: { title: '性能低下', description: '動作はしているものの応答が遅い、または一部のデータ収集に問題があるエージェントの数です。すぐ障害ではありませんが、放置すると監視の死角が生じるため原因を確認してください。' },
  },
  'agents-offline': {
    ko: { title: '오프라인', description: '연결이 완전히 끊긴 에이전트의 수입니다. 해당 서버가 꺼졌거나 네트워크 문제가 있을 수 있으며, 오프라인 상태에서는 해당 서버의 모니터링이 불가하므로 즉시 확인이 필요합니다.' },
    en: { title: 'Offline Agents', description: 'The number of agents that have completely lost their connection. The server may be down or there could be network issues. While offline, monitoring is unavailable for those servers, so they should be investigated and restored immediately.' },
    ja: { title: 'オフライン', description: '接続が完全に切れたエージェントの数です。該当サーバーが停止しているかネットワーク問題の可能性があり、オフライン状態ではそのサーバーの監視ができないため即座に確認が必要です。' },
  },
  'agents-pending-updates': {
    ko: { title: '업데이트 대기', description: '새 버전의 에이전트가 출시되었지만 아직 업데이트하지 않은 에이전트의 수입니다. 오래된 버전은 보안 취약점이나 호환성 문제가 있을 수 있으므로 가능한 빨리 업데이트하세요.' },
    en: { title: 'Pending Updates', description: 'The number of agents running an older version that should be updated. Outdated versions may have security vulnerabilities or compatibility issues with the latest monitoring features. Update these agents as soon as practical.' },
    ja: { title: '更新待ち', description: '新バージョンのエージェントがリリースされたが、まだ更新していないエージェントの数です。古いバージョンはセキュリティ脆弱性や互換性の問題がある可能性があるため、できるだけ早く更新してください。' },
  },
  // ── AI Service Detail ──
  'ai-svc-ttft-p95': {
    ko: { title: 'TTFT P95', description: '이 AI 서비스에서 질문 후 첫 글자가 나타나기까지의 시간(상위 95% 기준)입니다. 요청 100건 중 95건이 이 시간 안에 첫 응답을 시작하며, 값이 커지면 사용자 대기 시간이 늘어나므로 원인을 점검하세요.' },
    en: { title: 'TTFT P95', description: 'The 95th percentile time until the first character appears after sending a query to this AI service. This means 95 out of 100 requests start receiving a response within this time. If it increases, users are waiting longer and the cause should be checked.' },
    ja: { title: 'TTFT P95', description: 'このAIサービスで質問後、最初の文字が表示されるまでの時間（上位95%基準）です。100回のリクエスト中95回がこの時間内に最初の応答を開始します。値が大きくなるとユーザーの待ち時間が増えるため原因を確認してください。' },
  },
  'ai-svc-tps-p50': {
    ko: { title: 'TPS P50', description: '이 AI 서비스가 1초에 만들어내는 글자(토큰) 수의 중간값입니다. 이 값이 낮으면 답변이 느리게 출력되어 사용자 체감 품질이 떨어지므로, 모델이나 서버 자원을 점검하세요.' },
    en: { title: 'TPS P50', description: 'The median number of tokens this AI service generates per second. A lower value means the AI outputs text more slowly, which degrades the user experience. If it drops, check the model server resources or GPU availability.' },
    ja: { title: 'TPS P50', description: 'このAIサービスが1秒間に生成するトークン数の中央値です。この値が低いと回答の出力が遅くなりユーザー体験が低下するため、モデルやサーバーリソースを確認してください。' },
  },
  'ai-svc-cost': {
    ko: { title: '시간당 비용', description: '이 AI 서비스가 한 시간 동안 사용한 토큰에 대한 비용입니다. 비용이 평소보다 급증했다면 비효율적인 반복 호출이나 입력 데이터 이상을 의심하고 호출 패턴을 확인하세요.' },
    en: { title: 'Hourly Cost', description: 'The cost incurred by this AI service for tokens processed in one hour. If the cost spikes compared to normal, look for inefficient repeated calls or unexpected input data issues by reviewing the call patterns.' },
    ja: { title: '時間あたりコスト', description: 'このAIサービスが1時間に使用したトークンに対するコストです。普段よりコストが急増した場合は、非効率な繰り返し呼び出しや入力データの異常を疑い、呼び出しパターンを確認してください。' },
  },
  'ai-svc-error-rate': {
    ko: { title: '에러율', description: '이 AI 서비스에서 오류가 발생한 요청의 비율입니다. 예를 들어 2%라면 50건 중 1건이 실패한 것입니다. 에러율이 올라가면 모델 서버 장애나 입력 데이터 문제일 수 있으므로 로그를 확인하세요.' },
    en: { title: 'Error Rate', description: 'The percentage of requests to this AI service that returned errors. For example, 2% means 1 out of 50 requests failed. If the error rate rises, it could indicate model server failures or input data problems, so check the logs.' },
    ja: { title: 'エラー率', description: 'このAIサービスでエラーが発生したリクエストの割合です。例えば2%なら50件中1件が失敗したことになります。エラー率が上昇した場合はモデルサーバーの障害や入力データの問題の可能性があるためログを確認してください。' },
  },
  'guardrail-total-checks': {
    ko: { title: '전체 검사', description: 'AI 안전 필터(Guardrail)가 수행한 검사의 총 건수입니다. 사용자의 입력과 AI의 출력 모두를 검사하며, 이 숫자를 통해 필터가 얼마나 활발히 작동하고 있는지 파악할 수 있습니다.' },
    en: { title: 'Total Checks', description: 'The total number of safety inspections the AI guardrail has performed. Both user inputs and AI outputs are checked. This number shows how actively the safety filter is working to protect against inappropriate content.' },
    ja: { title: '全検査', description: 'AI安全フィルター（Guardrail）が実行した検査の総件数です。ユーザーの入力とAIの出力の両方を検査しており、この数値からフィルターがどの程度活発に稼働しているか把握できます。' },
  },
  'guardrail-blocked': {
    ko: { title: '차단 수', description: 'AI 안전 필터가 부적절하다고 판단하여 차단한 요청의 건수입니다. 유해 콘텐츠나 정책 위반 요청이 차단된 것이며, 갑자기 늘어나면 악의적 사용 시도가 증가한 것일 수 있습니다.' },
    en: { title: 'Blocked', description: 'The number of requests that the safety filter flagged and blocked as inappropriate. These may include harmful content or policy violations. A sudden increase could indicate a rise in malicious usage attempts.' },
    ja: { title: 'ブロック数', description: 'AI安全フィルターが不適切と判断してブロックしたリクエストの件数です。有害コンテンツやポリシー違反のリクエストがブロックされたもので、急に増加した場合は悪意ある利用の増加を疑ってください。' },
  },
  'guardrail-block-rate': {
    ko: { title: '차단률', description: '전체 검사 중 안전 필터에 의해 차단된 비율입니다. 이 수치가 너무 높으면 필터 규칙이 지나치게 엄격하거나 악의적 요청이 많은 것이고, 너무 낮으면 필터가 제대로 작동하는지 확인이 필요합니다.' },
    en: { title: 'Block Rate', description: 'The percentage of all checked requests that were blocked by the safety filter. If too high, the filter rules may be overly strict or malicious requests are frequent. If too low, verify that the filter is functioning correctly.' },
    ja: { title: 'ブロック率', description: '全検査のうち安全フィルターによってブロックされた割合です。この値が高すぎるとフィルタールールが厳しすぎるか悪意あるリクエストが多く、低すぎるとフィルターが正しく機能しているか確認が必要です。' },
  },
  'guardrail-latency-contrib': {
    ko: { title: '지연 기여도', description: 'AI가 응답하는 전체 시간 중 안전 검사(Guardrail)에 소요되는 시간의 비율입니다. 이 비율이 높으면 안전 검사가 응답 속도를 느리게 만들고 있다는 뜻이므로, 검사 규칙 최적화를 검토하세요.' },
    en: { title: 'Latency Contribution', description: 'The portion of total AI response time spent on safety checks (Guardrail). If this percentage is high, the safety checks are noticeably slowing down responses. Consider optimizing the guardrail rules to reduce their impact on speed.' },
    ja: { title: 'レイテンシ寄与', description: 'AI応答の全体時間のうち、安全検査（Guardrail）に費やされる時間の割合です。この割合が高い場合は安全検査が応答速度を遅くしているため、検査ルールの最適化を検討してください。' },
  },
  // ── AI Diagnostics ──
  'ai-diag-total': {
    ko: { title: '전체 항목', description: 'AI 시스템의 상태를 점검하는 진단 항목의 총 개수입니다. GPU 상태, 모델 응답 품질, 메모리 등 다양한 항목을 자동으로 검사하여 문제를 조기에 발견합니다.' },
    en: { title: 'Total Items', description: 'The total number of diagnostic checks that assess AI system health, including GPU status, model response quality, and memory. These automated checks help catch problems early before they affect service quality.' },
    ja: { title: '全項目', description: 'AIシステムの状態を点検する診断項目の総数です。GPU状態、モデル応答品質、メモリなど様々な項目を自動的に検査して、問題を早期に発見します。' },
  },
  'ai-diag-passed': {
    ko: { title: '통과', description: '진단 검사를 문제없이 통과한 항목의 수입니다. 전체 항목 수와 같으면 모든 것이 정상이라는 뜻이며, 차이가 있으면 경고나 실패 항목을 확인하세요.' },
    en: { title: 'Passed', description: 'The number of diagnostic checks that completed without any issues. If this equals the total item count, everything is healthy. If there is a gap, review the warning or failed items to understand what needs attention.' },
    ja: { title: '合格', description: '診断検査を問題なく通過した項目の数です。全項目数と同じであればすべて正常という意味で、差がある場合は警告や失敗の項目を確認してください。' },
  },
  'ai-diag-warned': {
    ko: { title: '경고', description: '아직 심각하지는 않지만 주의가 필요한 진단 항목의 수입니다. 방치하면 실패로 이어질 수 있으므로 해당 항목의 상세 내용을 확인하고 미리 대응하세요.' },
    en: { title: 'Warned', description: 'The number of diagnostic checks that are not critical yet but need attention. Ignoring warnings can lead to failures over time. Review the specific items flagged and address them proactively before they escalate.' },
    ja: { title: '警告', description: 'まだ深刻ではないが注意が必要な診断項目の数です。放置すると失敗に進行する可能性があるため、該当項目の詳細を確認して事前に対応してください。' },
  },
  'ai-diag-failed': {
    ko: { title: '실패', description: '진단 검사에서 심각한 문제가 발견된 항목의 수입니다. 0이 아니면 해당 항목이 서비스 품질에 직접 영향을 줄 수 있으므로, 상세 내용을 확인하고 즉시 조치를 취하세요.' },
    en: { title: 'Failed', description: 'The number of diagnostic checks that found serious problems. If this is not zero, the affected items may be directly impacting service quality. Review the details and take corrective action immediately.' },
    ja: { title: '失敗', description: '診断検査で深刻な問題が見つかった項目の数です。0でなければ該当項目がサービス品質に直接影響を与える可能性があるため、詳細を確認して即座に対処してください。' },
  },
  // ── AI Evaluation ──
  'eval-total': {
    ko: { title: '전체 평가', description: 'AI 모델의 답변 품질을 측정하는 평가 작업의 총 개수입니다. 정기적으로 평가를 실행하면 모델 성능이 떨어지는 것을 조기에 발견할 수 있습니다.' },
    en: { title: 'Total Evaluations', description: 'The total number of evaluation jobs that test AI model answer quality. Running evaluations regularly helps detect performance degradation early, before it impacts end users.' },
    ja: { title: '全評価', description: 'AIモデルの回答品質を測定する評価ジョブの総数です。定期的に評価を実行することで、モデル性能の低下を早期に発見できます。' },
  },
  'eval-avg-quality': {
    ko: { title: '평균 품질', description: '모든 평가에서 AI 답변이 받은 품질 점수의 평균입니다. 점수가 높을수록 AI가 정확하고 유용한 답변을 하고 있다는 뜻이며, 점수가 떨어지면 모델 업데이트나 프롬프트 개선이 필요합니다.' },
    en: { title: 'Avg Quality', description: 'The average quality score the AI received across all evaluations. Higher scores mean the AI is providing accurate and useful answers. If the score drops, consider updating the model or improving the prompts.' },
    ja: { title: '平均品質', description: 'すべての評価でAI回答が受けた品質スコアの平均です。スコアが高いほどAIが正確で有用な回答をしていることを意味し、下がった場合はモデルの更新やプロンプトの改善が必要です。' },
  },
  'eval-pass-rate': {
    ko: { title: '통과율', description: '평가 항목 중 미리 정한 기준을 만족한 비율입니다. 100%에 가까울수록 AI가 기대 수준대로 작동하고 있다는 뜻이며, 낮아지면 어떤 항목이 미달인지 상세 결과를 확인하세요.' },
    en: { title: 'Pass Rate', description: 'The percentage of evaluation criteria that met their required thresholds. The closer to 100% the better, as it means the AI is performing as expected. If it drops, check which specific metrics fell short to guide your improvements.' },
    ja: { title: '合格率', description: '評価項目のうち、事前に設定した基準を満たした割合です。100%に近いほどAIが期待通りに動作していることを意味し、低下した場合はどの項目が基準未達かを詳細結果で確認してください。' },
  },
  'eval-running': {
    ko: { title: '실행 중', description: '지금 진행되고 있는 AI 평가 작업의 수입니다. 평가는 일정 시간이 걸리며, 오래 실행 중이라면 테스트 데이터가 많거나 처리에 문제가 있을 수 있습니다.' },
    en: { title: 'Running', description: 'The number of AI evaluation jobs currently in progress. Evaluations take time to complete. If a job has been running unusually long, it may have a large test set or there could be a processing issue.' },
    ja: { title: '実行中', description: '現在進行中のAI評価ジョブの数です。評価には一定の時間がかかりますが、長時間実行中の場合はテストデータが多いか処理に問題がある可能性があります。' },
  },
  // ── AI Overview ──
  'ai-services-count': {
    ko: { title: 'AI 서비스', description: '현재 운영 중인 AI 서비스(모델)의 개수와 전체 호출 건수입니다. 서비스 수가 줄었다면 일부 AI 서비스가 중단된 것이고, 호출 수가 급변하면 사용 패턴에 변화가 있다는 뜻입니다.' },
    en: { title: 'AI Services', description: 'The number of currently active AI services (models) along with total call volume. If the service count drops, some AI services may have stopped. If call volume changes sharply, usage patterns have shifted and should be reviewed.' },
    ja: { title: 'AIサービス', description: '現在稼働中のAIサービス（モデル）の数と全体の呼び出し件数です。サービス数が減った場合は一部のAIサービスが停止しており、呼び出し数が急変した場合は利用パターンに変化があったことを意味します。' },
  },
  'ai-total-tokens': {
    ko: { title: '전체 토큰', description: '모든 AI 서비스가 처리한 텍스트(토큰)의 총 개수입니다. 토큰은 AI가 처리하는 글자의 단위이며, 이 숫자가 클수록 AI를 많이 활용하고 있고 비용도 그에 비례하여 발생합니다.' },
    en: { title: 'Total Tokens', description: 'The total number of text units (tokens) processed across all AI services. Tokens are the units AI uses to read and write text. A larger number means heavier AI usage, and costs increase proportionally.' },
    ja: { title: '全トークン', description: 'すべてのAIサービスが処理したテキスト（トークン）の総数です。トークンはAIが処理する文字の単位で、この数値が大きいほどAIを活発に利用しており、コストもそれに比例して発生します。' },
  },
  'ai-total-cost': {
    ko: { title: '전체 비용', description: '모든 AI 서비스를 사용하면서 발생한 총 비용입니다. 예산 대비 실제 지출을 파악하는 데 활용하며, 예상보다 빠르게 증가하면 비효율적인 호출이 없는지 점검하세요.' },
    en: { title: 'Total Cost', description: 'The total amount spent on all AI services. Use this to compare actual spending against your budget. If costs are growing faster than expected, review usage patterns for inefficient calls that could be optimized.' },
    ja: { title: '全コスト', description: 'すべてのAIサービス利用で発生した総コストです。予算に対する実際の支出を把握するのに活用し、予想より速く増加している場合は非効率な呼び出しがないか確認してください。' },
  },
  'ai-avg-latency': {
    ko: { title: '평균 지연시간', description: 'AI 서비스에 요청을 보낸 뒤 응답을 받기까지 걸리는 평균 시간(밀리초)입니다. 이 값이 갑자기 커지면 AI 서버에 부하가 걸리거나 네트워크 문제가 있을 수 있으므로 확인이 필요합니다.' },
    en: { title: 'Avg Latency', description: 'The average time (in milliseconds) it takes to get a response from AI services. If this suddenly increases, the AI server may be under heavy load or experiencing network issues that need investigation.' },
    ja: { title: '平均レイテンシ', description: 'AIサービスにリクエストを送信してから応答を受け取るまでの平均時間（ミリ秒）です。この値が急に大きくなった場合は、AIサーバーに負荷がかかっているかネットワーク問題の可能性があるため確認が必要です。' },
  },
  'ai-models-count': {
    ko: { title: '모델 수', description: '현재 서비스에서 사용되고 있는 AI 모델의 종류 수입니다. 예를 들어 GPT-4와 Claude를 함께 쓰면 2개이며, 각 모델별 성능과 비용이 다르므로 용도에 맞게 배분되었는지 확인하세요.' },
    en: { title: 'Models', description: 'The number of different AI model types currently in use. For example, using both GPT-4 and Claude counts as two models. Each model has different performance characteristics and costs, so verify they are allocated appropriately for their use cases.' },
    ja: { title: 'モデル数', description: '現在サービスで使用されているAIモデルの種類数です。例えばGPT-4とClaudeを併用していれば2つです。各モデルの性能とコストが異なるため、用途に合わせて適切に配分されているか確認してください。' },
  },
  // ── GPU Cluster ──
  'gpu-count': {
    ko: { title: 'GPU 수', description: 'AITOP이 감시하고 있는 GPU(그래픽 처리 장치)의 총 개수입니다. AI 연산에 GPU가 필수적이므로, 감시 대상에서 빠진 GPU가 없는지 확인하세요.' },
    en: { title: 'GPU Count', description: 'The total number of GPUs being monitored by AITOP. GPUs are essential for AI computation, so make sure all GPUs in your infrastructure are included in the monitoring scope.' },
    ja: { title: 'GPU数', description: 'AITOPが監視しているGPU（グラフィック処理装置）の総数です。AI演算にGPUは不可欠なので、監視対象から漏れているGPUがないか確認してください。' },
  },
  'gpu-avg-vram': {
    ko: { title: '평균 VRAM', description: 'GPU 전용 메모리(VRAM)의 평균 사용률입니다. AI 모델이 VRAM에 올라가 동작하므로, 사용률이 높으면 더 큰 모델을 올리거나 동시 처리를 늘리기 어려울 수 있습니다.' },
    en: { title: 'Avg VRAM', description: 'The average utilization of GPU dedicated memory (VRAM). AI models are loaded into VRAM to run, so high usage means there may not be room for larger models or more simultaneous processing.' },
    ja: { title: '平均VRAM', description: 'GPU専用メモリ（VRAM）の平均使用率です。AIモデルはVRAM上で動作するため、使用率が高いとより大きなモデルの読み込みや同時処理の増加が難しくなる場合があります。' },
  },
  'gpu-avg-temp': {
    ko: { title: '평균 온도', description: 'GPU의 평균 온도(섭씨)입니다. GPU는 연산 시 열이 발생하며, 80°C를 넘으면 성능이 자동으로 낮아지고, 90°C 이상이면 하드웨어 수명에 영향을 줄 수 있어 냉각 시스템 점검이 필요합니다.' },
    en: { title: 'Avg Temp', description: 'The average temperature of GPUs in degrees Celsius. GPUs generate heat during computation. Above 80°C, performance is automatically throttled, and above 90°C, hardware lifespan may be affected. Check the cooling system if temperatures run high.' },
    ja: { title: '平均温度', description: 'GPUの平均温度（摂氏）です。80°Cを超えると性能が自動的に低下し、90°C以上になるとハードウェアの寿命に影響を与える可能性があるため、冷却システムの点検が必要です。' },
  },
  'gpu-total-power': {
    ko: { title: '전체 전력', description: '모든 GPU가 소비하고 있는 총 전력(와트)입니다. 전력 소비가 높으면 전기 비용이 증가하고 냉각 부담도 커집니다. 사용률 대비 전력이 과도하면 GPU 설정을 최적화할 필요가 있습니다.' },
    en: { title: 'Total Power', description: 'The total electricity (in watts) consumed by all GPUs combined. Higher power consumption increases electricity costs and cooling demands. If power usage is high relative to utilization, consider optimizing GPU power settings.' },
    ja: { title: '全消費電力', description: 'すべてのGPUが消費している総電力（ワット）です。電力消費が高いと電気代が増加し冷却負担も大きくなります。使用率に対して電力が過大な場合はGPU設定の最適化を検討してください。' },
  },
  'gpu-critical': {
    ko: { title: 'GPU 위험', description: '메모리(VRAM) 사용률이 90%를 넘은 GPU의 수입니다. 메모리가 가득 차면 AI 연산이 중단(OOM 에러)될 수 있으므로, 모델 크기를 줄이거나 요청을 다른 GPU로 분산하는 조치가 필요합니다.' },
    en: { title: 'GPU Critical', description: 'The number of GPUs with VRAM usage at 90% or above. When VRAM is nearly full, AI computations can crash with an out-of-memory (OOM) error. Reduce the model size or distribute requests to other GPUs to prevent failures.' },
    ja: { title: 'GPU危険', description: 'メモリ（VRAM）使用率が90%を超えたGPUの数です。メモリが満杯になるとAI演算が停止（OOMエラー）する可能性があるため、モデルサイズの縮小やリクエストの他GPUへの分散が必要です。' },
  },
  'gpu-vgpu': {
    ko: { title: 'vGPU', description: '하나의 물리 GPU를 여러 개로 나누어 사용하는 가상 GPU의 수입니다. 여러 서비스가 GPU를 공유할 수 있어 자원 활용도가 높아지지만, 너무 많이 나누면 개별 성능이 떨어질 수 있습니다.' },
    en: { title: 'vGPU', description: 'The number of virtual GPU instances created by splitting a physical GPU for sharing across multiple services. This improves resource utilization, but dividing too much can reduce performance for each individual service.' },
    ja: { title: 'vGPU', description: '1つの物理GPUを複数に分割して使用する仮想GPUの数です。複数のサービスがGPUを共有できるためリソース活用度が向上しますが、分割しすぎると個々の性能が低下する可能性があります。' },
  },
  'gpu-mig': {
    ko: { title: 'MIG', description: 'NVIDIA GPU를 하드웨어 수준에서 독립적인 파티션으로 나눈 수입니다. 각 파티션이 별도 GPU처럼 작동하여 서로 간섭 없이 안정적으로 AI 작업을 처리할 수 있습니다.' },
    en: { title: 'MIG', description: 'The number of hardware-level partitions on NVIDIA GPUs using Multi-Instance GPU technology. Each partition works like a separate GPU, allowing multiple AI workloads to run independently without interfering with each other.' },
    ja: { title: 'MIG', description: 'NVIDIA GPUをハードウェアレベルで独立したパーティションに分割した数です。各パーティションが別々のGPUのように動作し、互いに干渉なく安定的にAI処理を実行できます。' },
  },
  // ── LLM Traces ──
  'llm-total-calls': {
    ko: { title: 'LLM 호출 수', description: 'AI 언어 모델(LLM)에 요청을 보낸 총 건수입니다. 이 숫자가 급증하면 서비스 사용량이 늘었거나 불필요한 반복 호출이 있을 수 있으므로, 비용과 함께 확인하세요.' },
    en: { title: 'Total LLM Calls', description: 'The total number of requests sent to the AI language model (LLM). If this number surges, it could mean service usage is growing or there are unnecessary repeated calls. Review alongside cost metrics to maintain efficiency.' },
    ja: { title: 'LLM呼び出し数', description: 'AI言語モデル（LLM）にリクエストを送信した総件数です。この数値が急増した場合はサービス利用量が増えたか、不要な繰り返し呼び出しがある可能性があるためコストと合わせて確認してください。' },
  },
  'llm-total-tokens': {
    ko: { title: 'LLM 토큰', description: 'AI 언어 모델이 처리한 텍스트(토큰)의 총량입니다. 입력(질문)과 출력(답변) 토큰이 모두 포함되며, 토큰 수가 많을수록 비용이 증가하므로 프롬프트 길이 최적화를 고려하세요.' },
    en: { title: 'LLM Tokens', description: 'The total volume of text (tokens) processed by the AI language model, including both input (questions) and output (answers). More tokens means higher costs, so consider optimizing prompt lengths to reduce spending.' },
    ja: { title: 'LLMトークン', description: 'AI言語モデルが処理したテキスト（トークン）の総量です。入力（質問）と出力（回答）の両方が含まれ、トークン数が多いほどコストが増加するためプロンプト長の最適化を検討してください。' },
  },
  'llm-total-cost': {
    ko: { title: 'LLM 비용', description: 'AI 언어 모델 사용에 발생한 총 비용입니다. 모델 종류와 토큰 양에 따라 달라지며, 예산 대비 지출을 주기적으로 확인하여 비용이 예상 범위를 초과하지 않도록 관리하세요.' },
    en: { title: 'LLM Cost', description: 'The total amount spent on AI language model usage. Cost varies by model type and token volume. Regularly compare spending against your budget to ensure costs stay within the expected range.' },
    ja: { title: 'LLMコスト', description: 'AI言語モデルの利用で発生した総コストです。モデルの種類やトークン量によって異なります。予算に対する支出を定期的に確認し、コストが予想範囲を超えないよう管理してください。' },
  },
  'llm-avg-latency': {
    ko: { title: 'LLM 평균 지연', description: 'AI 언어 모델에 요청을 보낸 후 응답을 받기까지 걸리는 평균 시간(밀리초)입니다. 이 값이 커지면 사용자가 답변을 기다리는 시간이 길어지므로, 모델 서버 상태나 요청 큐를 확인하세요.' },
    en: { title: 'LLM Avg Latency', description: 'The average time (in milliseconds) from sending a request to the AI language model until receiving a response. If this increases, users will wait longer for answers. Check the model server status and request queue for bottlenecks.' },
    ja: { title: 'LLM平均レイテンシ', description: 'AI言語モデルにリクエストを送信してから応答を受け取るまでの平均時間（ミリ秒）です。この値が大きくなるとユーザーの回答待ち時間が長くなるため、モデルサーバーの状態やリクエストキューを確認してください。' },
  },
  // ── AI Costs ──
  'ai-total-daily-cost': {
    ko: { title: 'AI 일일 비용', description: '오늘 하루 동안 AI 서비스 사용에 발생한 총 비용입니다. 전일 대비 크게 늘었다면 특정 서비스의 호출량이 급증했거나 고비용 모델 사용이 늘었을 수 있으므로 세부 내역을 확인하세요.' },
    en: { title: 'Total AI Cost', description: 'The total cost of AI service usage for today. If it is significantly higher than yesterday, a particular service may have seen a spike in calls or a switch to a more expensive model. Check the cost breakdown for details.' },
    ja: { title: 'AI日次コスト', description: '本日AIサービスの利用で発生した総コストです。前日比で大幅に増加した場合は、特定サービスの呼び出し量が急増したか、高コストモデルの使用が増えた可能性があるため内訳を確認してください。' },
  },
  'ai-potential-savings': {
    ko: { title: '잠재 절감액', description: '캐싱, 프롬프트 최적화, 모델 변경 등을 통해 매일 절약할 수 있는 예상 금액입니다. 이 금액이 크다면 비용 절감 여지가 많다는 뜻이므로, 추천되는 최적화 방안을 검토해 보세요.' },
    en: { title: 'Potential Savings', description: 'The estimated daily amount that could be saved through caching, prompt optimization, or model changes. If this number is large, there is significant room for cost reduction. Review the recommended optimizations and apply them.' },
    ja: { title: '潜在節約額', description: 'キャッシング、プロンプト最適化、モデル変更などにより毎日節約できる見込み額です。この金額が大きければコスト削減の余地が多いことを意味するため、推奨される最適化方法を確認してください。' },
  },
  'ai-cache-hit-rate': {
    ko: { title: '캐시 적중률', description: '이전에 같은 질문이 들어왔을 때 저장된 답변을 재활용한 비율입니다. 적중률이 높을수록 AI를 다시 호출하지 않아 비용이 절약되고 응답도 빨라집니다. 낮다면 캐시 설정을 최적화해 보세요.' },
    en: { title: 'Cache Hit Rate', description: 'The percentage of AI requests that reused a previously stored answer instead of calling the AI model again. A higher hit rate saves both money and time. If it is low, consider adjusting the cache settings to capture more repeat questions.' },
    ja: { title: 'キャッシュヒット率', description: '以前と同じ質問が来た際に、保存済みの回答を再利用できた割合です。ヒット率が高いほどAIの再呼び出しが不要になりコスト節約と応答高速化につながります。低い場合はキャッシュ設定の最適化を検討してください。' },
  },
  'ai-budget-alerts': {
    ko: { title: '예산 알림', description: '비용이 설정된 예산 기준에 도달하면 알려주는 알림의 수입니다. 활성화된 알림이 없으면 예상치 못한 비용 초과를 놓칠 수 있으므로, 주요 예산 기준에 대해 알림을 설정해 두세요.' },
    en: { title: 'Budget Alerts', description: 'The number of alerts configured to notify you when spending reaches set budget thresholds. If no alerts are active, you may miss unexpected cost overruns. Set up alerts for key budget milestones to stay in control.' },
    ja: { title: '予算アラート', description: 'コストが設定した予算基準に達した際に通知するアラートの数です。有効なアラートがないと予想外のコスト超過を見逃す恐れがあるため、主要な予算基準にはアラートを設定しておいてください。' },
  },
  // ── Training ──
  'training-active-jobs': {
    ko: { title: '활성 작업', description: '현재 진행 중인 AI 모델 학습(파인튜닝) 작업의 수입니다. 학습은 GPU를 많이 사용하므로, 동시에 여러 작업이 돌면 자원 경합이 발생하여 각 작업이 느려질 수 있습니다.' },
    en: { title: 'Active Jobs', description: 'The number of AI model training (fine-tuning) jobs currently in progress. Training is GPU-intensive, so running multiple jobs simultaneously can cause resource contention and slow each job down.' },
    ja: { title: 'アクティブジョブ', description: '現在進行中のAIモデル学習（ファインチューニング）ジョブの数です。学習はGPUを大量に使用するため、同時に複数ジョブが動くとリソース競合が発生し各ジョブが遅くなる可能性があります。' },
  },
  'training-avg-gpu': {
    ko: { title: '평균 GPU 사용률', description: 'AI 모델 학습에 사용되는 GPU의 평균 사용률입니다. 너무 낮으면 GPU 자원이 낭비되고 있다는 뜻이고, 너무 높으면 다른 작업에 영향을 줄 수 있으므로 적절한 균형을 유지하세요.' },
    en: { title: 'Avg GPU Utilization', description: 'The average GPU usage during model training. Too low means GPU resources are being wasted, too high means other tasks may be affected. Aim for a balanced utilization that efficiently uses available resources.' },
    ja: { title: '平均GPU使用率', description: 'AIモデル学習に使用されるGPUの平均使用率です。低すぎるとGPUリソースが無駄になっており、高すぎると他の処理に影響する可能性があるため、適切なバランスを保ってください。' },
  },
  'training-best-loss': {
    ko: { title: '최저 손실값', description: '학습 과정에서 달성한 최저 손실(오차) 값입니다. 숫자가 작을수록 모델이 학습을 잘 하고 있다는 뜻입니다. 이 값이 더 이상 줄지 않으면 학습이 충분히 진행된 것이므로 학습을 종료해도 됩니다.' },
    en: { title: 'Best Loss', description: 'The lowest error (loss) value achieved during training. A smaller number means the model is learning well. If this value stops decreasing, training has likely converged and it may be time to finish the training run.' },
    ja: { title: '最低損失値', description: '学習過程で達成した最低の損失（誤差）値です。数値が小さいほどモデルの学習が順調であることを意味します。この値がそれ以上下がらなくなったら学習が十分に進んだ段階なので、学習を終了しても構いません。' },
  },
  'training-total-checkpoints': {
    ko: { title: '전체 체크포인트', description: '학습 도중 저장된 모델 스냅샷(체크포인트)의 총 수입니다. 체크포인트가 있으면 학습이 중단되어도 마지막 저장 시점부터 이어서 진행할 수 있어 안전합니다.' },
    en: { title: 'Total Checkpoints', description: 'The total number of model snapshots (checkpoints) saved during training. Checkpoints are safety nets: if training is interrupted, you can resume from the last saved point instead of starting over.' },
    ja: { title: '全チェックポイント', description: '学習途中に保存されたモデルスナップショット（チェックポイント）の総数です。チェックポイントがあれば学習が中断されても最後の保存時点から再開できるため安全です。' },
  },
  'training-val-loss': {
    ko: { title: '검증 손실', description: '학습에 사용하지 않은 별도 데이터로 측정한 현재 오차(손실)값입니다. 이 값이 학습 손실보다 크게 벌어지면 모델이 학습 데이터에만 맞춰져 실제 상황에서는 성능이 떨어질 수 있습니다.' },
    en: { title: 'Val Loss', description: 'The current error value measured on data the model has not seen during training. If this diverges significantly from training loss, the model may be overfitting, meaning it performs well on training data but poorly on real-world inputs.' },
    ja: { title: '検証損失', description: '学習に使用していない別データで測定した現在の誤差（損失）値です。この値が学習損失より大きく乖離すると、モデルが学習データにだけ適合し実際の状況では性能が低下する可能性があります。' },
  },
  'training-val-accuracy': {
    ko: { title: '검증 정확도', description: '학습에 사용하지 않은 데이터로 측정한 모델의 정답률입니다. 높을수록 모델이 다양한 상황에서 올바른 답을 내고 있다는 뜻이며, 학습이 진행될수록 이 값이 올라가는 것이 정상입니다.' },
    en: { title: 'Val Accuracy', description: 'The percentage of correct answers on unseen validation data. Higher is better, and it should generally improve as training progresses. If it starts to decline, the model may be overfitting and training should be stopped.' },
    ja: { title: '検証精度', description: '学習に使用していないデータで測定したモデルの正答率です。高いほどモデルが様々な状況で正しい回答を出していることを意味し、学習が進むにつれてこの値が上がるのが正常です。' },
  },
  'training-gpu-util': {
    ko: { title: 'GPU 사용률', description: '이 학습 작업이 사용하는 GPU의 사용률입니다. 50% 미만이면 배치 크기를 늘려 GPU를 더 효율적으로 활용할 수 있고, 100%에 가까우면 정상적으로 GPU를 충분히 활용하고 있다는 뜻입니다.' },
    en: { title: 'GPU Utilization', description: 'How much of the GPU this training job is using. Below 50% suggests you could increase the batch size to use the GPU more efficiently. Near 100% means the GPU is being fully utilized as intended.' },
    ja: { title: 'GPU使用率', description: 'この学習ジョブが使用しているGPUの使用率です。50%未満ならバッチサイズを増やしてGPUをより効率的に活用でき、100%に近ければGPUを十分に活用して正常に動作していることを意味します。' },
  },
  'training-throughput': {
    ko: { title: '처리량', description: '모델이 1초에 처리하는 토큰(글자 단위) 수입니다. 이 속도가 빠를수록 학습이 빨리 완료됩니다. 속도가 갑자기 떨어지면 GPU 문제나 데이터 로딩 병목을 의심해 보세요.' },
    en: { title: 'Throughput', description: 'The number of tokens (text units) the model processes per second during training. Faster speed means training completes sooner. If speed suddenly drops, suspect a GPU issue or data loading bottleneck.' },
    ja: { title: 'スループット', description: 'モデルが1秒間に処理するトークン（文字単位）の数です。この速度が速いほど学習が早く完了します。速度が急に低下した場合はGPU問題やデータ読み込みのボトルネックを疑ってください。' },
  },
  // ── Prompts ──
  'prompt-total': {
    ko: { title: '전체 프롬프트', description: 'AI에게 질문하는 방식을 정의한 프롬프트 템플릿의 총 개수입니다. 잘 관리된 프롬프트는 AI 답변의 품질을 높이므로, 주기적으로 성능을 평가하고 개선하세요.' },
    en: { title: 'Total Prompts', description: 'The total number of prompt templates that define how AI questions are structured. Well-managed prompts improve AI answer quality, so evaluate and refine them periodically for best results.' },
    ja: { title: '全プロンプト', description: 'AIへの質問方式を定義したプロンプトテンプレートの総数です。適切に管理されたプロンプトはAI回答の品質を高めるため、定期的に性能を評価して改善してください。' },
  },
  'prompt-avg-quality': {
    ko: { title: '평균 품질', description: '모든 프롬프트 템플릿의 답변 품질 평균 점수입니다. 점수가 높을수록 AI가 유용한 답변을 생성하고 있다는 뜻이며, 점수가 낮은 프롬프트를 찾아 개선하면 전체 서비스 품질을 올릴 수 있습니다.' },
    en: { title: 'Avg Quality', description: 'The average quality score across all prompt templates. Higher scores mean the AI is producing useful answers. Find and improve prompts with low scores to raise the overall service quality.' },
    ja: { title: '平均品質', description: 'すべてのプロンプトテンプレートの回答品質平均スコアです。スコアが高いほどAIが有用な回答を生成していることを意味し、スコアの低いプロンプトを改善すれば全体のサービス品質を向上できます。' },
  },
  'prompt-24h-usage': {
    ko: { title: '24h 사용량', description: '지난 24시간 동안 프롬프트를 통해 AI를 호출한 총 건수입니다. 어떤 프롬프트가 가장 많이 사용되는지 파악하여, 인기 프롬프트의 품질 관리에 우선 집중할 수 있습니다.' },
    en: { title: '24h Usage', description: 'The total number of AI calls made through prompts in the last 24 hours. By identifying which prompts are used most frequently, you can prioritize quality management efforts on the most impactful ones.' },
    ja: { title: '24h使用量', description: '過去24時間にプロンプトを通じてAIを呼び出した総件数です。どのプロンプトが最も多く使われているかを把握し、人気プロンプトの品質管理を優先的に行いましょう。' },
  },
  'prompt-active-versions': {
    ko: { title: '활성 버전', description: '현재 운영 환경에서 실제로 사용 중인 프롬프트 버전의 수입니다. 하나의 프롬프트도 여러 버전이 있을 수 있으며, 오래된 버전이 아직 활성 상태라면 최신 버전으로 교체를 검토하세요.' },
    en: { title: 'Active Versions', description: 'The number of prompt versions currently in use across all prompts. A single prompt can have multiple versions. If older versions are still active, consider migrating them to the latest version for consistency.' },
    ja: { title: 'アクティブバージョン', description: '現在本番環境で実際に使用されているプロンプトバージョンの数です。1つのプロンプトでも複数バージョンが存在でき、古いバージョンがまだ有効な場合は最新バージョンへの切り替えを検討してください。' },
  },
  // ── Cost Analysis ──
  'total-daily-cost': {
    ko: { title: '일일 총 비용', description: 'AI 서비스, GPU, 인프라 등 모든 항목을 합산한 하루 총 비용입니다. 전일 대비 변동이 크면 어떤 카테고리에서 비용이 증가했는지 하위 항목을 확인하세요.' },
    en: { title: 'Total Cost', description: 'The combined daily cost of AI services, GPU compute, and infrastructure. If there is a large change from the previous day, check which category drove the increase by looking at the subcategory breakdown.' },
    ja: { title: '日次総コスト', description: 'AIサービス、GPU、インフラなどすべての項目を合算した1日の総コストです。前日比で変動が大きい場合は、どのカテゴリでコストが増加したか下位項目を確認してください。' },
  },
  'monthly-estimate': {
    ko: { title: '월간 예상', description: '현재 사용 속도가 계속된다면 이번 달 말에 얼마가 될지 예측한 금액입니다. 예산을 초과할 것으로 보이면 미리 사용량을 줄이거나 최적화 방안을 적용하세요.' },
    en: { title: 'Monthly Estimate', description: 'A projection of what the total cost will be at the end of this month based on current usage trends. If the estimate exceeds your budget, take action now by reducing usage or applying optimizations before the month ends.' },
    ja: { title: '月間予想', description: '現在の利用ペースが続いた場合の月末時点の予測金額です。予算を超過する見込みであれば、事前に利用量を減らすか最適化策を適用してください。' },
  },
  'llm-api-cost': {
    ko: { title: 'LLM API 비용', description: 'AI 언어 모델 API를 호출하는 데 든 하루 비용입니다. 전체 비용에서 가장 큰 비중을 차지하는 경우가 많으므로, 불필요한 호출 줄이기나 저렴한 모델 활용을 통해 비용을 절감할 수 있습니다.' },
    en: { title: 'LLM API Cost', description: 'The daily cost of calling AI language model APIs. This is often the largest cost component. Reducing unnecessary calls or using cheaper models for simpler tasks can significantly lower this expense.' },
    ja: { title: 'LLM APIコスト', description: 'AI言語モデルAPI呼び出しにかかった1日のコストです。全体コストの中で最も大きな割合を占めることが多いため、不要な呼び出しの削減や低コストモデルの活用でコスト削減が可能です。' },
  },
  'gpu-compute-cost': {
    ko: { title: 'GPU 컴퓨트 비용', description: 'AI 연산을 위해 사용한 GPU 자원의 하루 비용입니다. 학습과 추론 모두 포함되며, GPU 사용률이 낮은데 비용이 높다면 유휴 GPU를 줄여 비용을 절감할 수 있습니다.' },
    en: { title: 'GPU Compute Cost', description: 'The daily cost of GPU resources used for AI computation, including both training and inference. If GPU utilization is low but costs are high, consider reducing idle GPUs to save money.' },
    ja: { title: 'GPUコンピュートコスト', description: 'AI演算に使用したGPUリソースの1日のコストです。学習と推論の両方が含まれ、GPU使用率が低いのにコストが高い場合は、遊休GPUを削減してコストを節約できます。' },
  },
  // ── Cloud ──
  'total-cloud-cost': {
    ko: { title: '전체 클라우드 비용', description: 'AWS, Azure, GCP 등 사용 중인 모든 클라우드 서비스의 이번 달 총 비용입니다. 여러 클라우드를 사용하는 경우 한눈에 합계를 파악할 수 있으며, 예산 초과 여부를 관리하세요.' },
    en: { title: 'Total Cloud Cost', description: 'The total monthly cost across all cloud services (AWS, Azure, GCP, etc.) you are using. This gives you a single view of cloud spending to track against your budget and identify where optimization is possible.' },
    ja: { title: '全クラウドコスト', description: 'AWS、Azure、GCPなど使用中のすべてのクラウドサービスの今月の総コストです。複数のクラウドを使用している場合に合計を一目で把握でき、予算超過の有無を管理できます。' },
  },
  'cloud-provider-cost': {
    ko: { title: '클라우드 제공자 비용', description: '개별 클라우드 서비스(예: AWS, Azure)의 이번 달 비용입니다. 제공자별 비용을 비교하면 어디에 가장 많은 비용이 발생하는지 파악하고 리소스 배치를 최적화할 수 있습니다.' },
    en: { title: 'Cloud Provider Cost', description: 'The monthly cost for a specific cloud provider (e.g., AWS or Azure). Comparing costs across providers helps identify where the most spending occurs and where resource allocation can be optimized.' },
    ja: { title: 'クラウドプロバイダーコスト', description: '個別クラウドサービス（例：AWS、Azure）の今月のコストです。プロバイダー別にコストを比較すれば、どこに最も費用がかかっているかを把握してリソース配置を最適化できます。' },
  },
  // ── Anomalies ──
  'anomaly-total-detected': {
    ko: { title: '탐지된 이상', description: '인공지능(ML)이 평소 패턴과 다르다고 판단하여 감지한 이상 현상의 총 건수입니다. 사람이 미처 발견하지 못한 문제를 자동으로 찾아내며, 건수가 많으면 시스템에 구조적인 변화가 있는지 확인하세요.' },
    en: { title: 'Total Detected', description: 'The total number of anomalies detected by machine learning when patterns deviate from normal behavior. ML can catch problems humans might miss. If the count is high, check if there are structural changes in the system.' },
    ja: { title: '検出された異常', description: 'AI（ML）が通常パターンと異なると判断して検出した異常現象の総件数です。人が見つけられなかった問題を自動的に発見し、件数が多い場合はシステムに構造的な変化がないか確認してください。' },
  },
  'anomaly-active': {
    ko: { title: '활성 이상', description: '현재 진행 중이거나 아직 해결되지 않은 이상 현상의 수입니다. 0이면 현재 시스템이 안정적이라는 뜻이고, 숫자가 있으면 해당 항목의 원인을 파악하고 해결해야 합니다.' },
    en: { title: 'Active Anomalies', description: 'The number of anomalies that are currently ongoing or unresolved. Zero means the system is stable right now. If there are active anomalies, investigate the affected areas and determine whether corrective action is needed.' },
    ja: { title: 'アクティブ異常', description: '現在進行中、またはまだ解決されていない異常現象の数です。0であればシステムは安定しており、数値がある場合は該当項目の原因を特定して解決する必要があります。' },
  },
  'anomaly-detection-time': {
    ko: { title: '평균 탐지 시간', description: '이상 현상이 실제로 발생한 시점부터 시스템이 이를 감지하기까지 걸리는 평균 시간(분)입니다. 짧을수록 빠르게 대응할 수 있으며, 이 시간이 길어지면 탐지 규칙 조정이 필요합니다.' },
    en: { title: 'Avg Detection Time', description: 'The average time (in minutes) between when an anomaly actually occurs and when the system detects it. Shorter is better because it allows faster response. If detection time is increasing, the detection rules may need tuning.' },
    ja: { title: '平均検出時間', description: '異常が実際に発生してからシステムがそれを検知するまでにかかる平均時間（分）です。短いほど迅速な対応が可能で、この時間が長くなっている場合は検知ルールの調整が必要です。' },
  },
  'anomaly-auto-resolved': {
    ko: { title: '자동 해결률', description: '감지된 이상 현상 중 사람의 개입 없이 자동으로 정상 복귀된 비율입니다. 이 비율이 높으면 일시적인 이상이 많다는 뜻이고, 낮으면 수동 조치가 자주 필요한 심각한 이상이 많다는 의미입니다.' },
    en: { title: 'Auto-Resolved Rate', description: 'The percentage of detected anomalies that returned to normal without human intervention. A high rate means most anomalies are temporary. A low rate means many anomalies are serious enough to require manual investigation and fixes.' },
    ja: { title: '自動解決率', description: '検出された異常のうち、人の介入なく自動的に正常復帰した割合です。この割合が高ければ一時的な異常が多いことを意味し、低ければ手動対応が頻繁に必要な深刻な異常が多いことを示します。' },
  },
  // ── Agent Profiling ──
  'profiling-detected-processes': {
    ko: { title: '탐지된 프로세스', description: '서버에서 실행 중이며 프로파일링(성능 분석)을 붙일 수 있는 프로세스의 수입니다. 예상보다 적다면 에이전트 권한이나 설정을 확인하세요.' },
    en: { title: 'Detected Processes', description: 'The number of running processes on the server that can be profiled for performance analysis. If this count is lower than expected, check the agent permissions or configuration settings.' },
    ja: { title: '検出プロセス', description: 'サーバー上で実行中で、プロファイリング（性能分析）を適用できるプロセスの数です。想定より少ない場合はエージェントの権限や設定を確認してください。' },
  },
  'profiling-active-sessions': {
    ko: { title: '활성 세션', description: '지금 성능 분석(프로파일링)이 진행 중인 세션의 수입니다. 프로파일링은 어떤 코드에서 시간이 많이 걸리는지 찾아주며, 세션이 너무 많으면 서버에 부하를 줄 수 있으니 적절히 관리하세요.' },
    en: { title: 'Active Sessions', description: 'The number of performance profiling sessions currently in progress. Profiling identifies which code paths consume the most time. Too many simultaneous sessions can add overhead to the server, so manage them carefully.' },
    ja: { title: 'アクティブセッション', description: '現在性能分析（プロファイリング）が進行中のセッション数です。プロファイリングはコードのどこで時間がかかっているか特定でき、セッションが多すぎるとサーバーに負荷がかかるため適切に管理してください。' },
  },
  'profiling-failed-sessions': {
    ko: { title: '실패 세션', description: '프로세스에 프로파일링을 연결하려다 실패한 세션의 수입니다. 권한 부족이나 프로세스 종료 등이 원인일 수 있으며, 실패가 반복되면 에이전트 설정을 점검하세요.' },
    en: { title: 'Failed Sessions', description: 'The number of profiling sessions that failed to attach to a process. Common causes include insufficient permissions or the process exiting before the attach completed. If failures repeat, review the agent configuration.' },
    ja: { title: '失敗セッション', description: 'プロセスへのプロファイリング接続に失敗したセッションの数です。権限不足やプロセス終了などが原因の可能性があり、失敗が繰り返される場合はエージェント設定を確認してください。' },
  },
  'profiling-total-sessions': {
    ko: { title: '전체 세션', description: '지금까지 진행된 모든 프로파일링 세션의 총 수입니다. 과거 세션 기록을 통해 어떤 프로세스의 성능을 얼마나 자주 분석했는지 이력을 확인할 수 있습니다.' },
    en: { title: 'Total Sessions', description: 'The total number of all profiling sessions that have been conducted to date. This history helps you understand how frequently performance analysis is being performed and for which processes.' },
    ja: { title: '全セッション', description: 'これまでに実行されたすべてのプロファイリングセッションの総数です。過去のセッション記録から、どのプロセスの性能をどれくらい頻繁に分析したかの履歴を確認できます。' },
  },
  // ── Plugins ──
  'plugin-total': {
    ko: { title: '전체 플러그인', description: '에이전트 기능을 확장하는 플러그인(추가 모듈)의 총 개수입니다. 플러그인을 통해 특정 모니터링 기능을 추가할 수 있으며, 필요한 플러그인이 모두 등록되어 있는지 확인하세요.' },
    en: { title: 'Total Plugins', description: 'The total number of extension plugins registered to add extra monitoring capabilities. Plugins let you customize monitoring for specific technologies or services. Make sure all the plugins you need are registered.' },
    ja: { title: '全プラグイン', description: 'エージェント機能を拡張するプラグイン（追加モジュール）の総数です。プラグインで特定の監視機能を追加でき、必要なプラグインがすべて登録されているか確認してください。' },
  },
  'plugin-deployed-agents': {
    ko: { title: '배포된 에이전트', description: '플러그인이 실제로 설치 완료된 에이전트의 수입니다. 전체 대상 에이전트 수와 비교하여 차이가 있으면 아직 배포가 완료되지 않은 에이전트가 있다는 뜻입니다.' },
    en: { title: 'Deployed Agents', description: 'The number of agents where plugins have been successfully installed. Compare this to the total target agent count. If there is a difference, some agents still need their plugin installations to be completed.' },
    ja: { title: 'デプロイ済みエージェント', description: 'プラグインのインストールが完了したエージェントの数です。全対象エージェント数と比較して差がある場合は、まだデプロイが完了していないエージェントがあることを意味します。' },
  },
  'plugin-success-rate': {
    ko: { title: '성공률', description: '플러그인 설치를 시도한 에이전트 중 성공적으로 설치된 비율입니다. 100%가 아니면 일부 에이전트에서 설치가 실패한 것이므로 실패 원인(호환성, 권한 등)을 확인하세요.' },
    en: { title: 'Success Rate', description: 'The percentage of plugin installations that completed successfully. If this is not 100%, some agents had installation failures. Investigate the causes (compatibility, permissions, etc.) and retry the failed deployments.' },
    ja: { title: '成功率', description: 'プラグインのインストールを試みたエージェントのうち成功した割合です。100%でない場合は一部のエージェントでインストールが失敗しているため、失敗原因（互換性、権限等）を確認してください。' },
  },
  'plugin-pending-deploys': {
    ko: { title: '대기 중 배포', description: '플러그인 설치가 예약되었지만 아직 시작되지 않은 건수입니다. 대기가 오래 지속되면 에이전트 연결 상태나 배포 스케줄을 확인해 보세요.' },
    en: { title: 'Pending Deploys', description: 'The number of plugin installations that are scheduled but have not started yet. If deploys remain pending for a long time, check the agent connection status or the deployment schedule configuration.' },
    ja: { title: '保留中デプロイ', description: 'プラグインのインストールが予約されたがまだ開始されていない件数です。長時間保留が続く場合はエージェントの接続状態やデプロイスケジュールを確認してください。' },
  },
  'plugin-detail-total-agents': {
    ko: { title: '대상 에이전트', description: '이 플러그인을 설치해야 하는 전체 에이전트의 수입니다. 설치 완료, 실패, 대기 중인 에이전트 수를 합하면 이 숫자와 같아야 합니다.' },
    en: { title: 'Target Agents', description: 'The total number of agents that should receive this plugin. The sum of installed, failed, and pending agents should equal this number. Use it to track overall deployment progress.' },
    ja: { title: '対象エージェント', description: 'このプラグインをインストールする必要がある全エージェントの数です。インストール完了、失敗、保留中のエージェント数を合計するとこの数字と一致するはずです。' },
  },
  'plugin-detail-installed': {
    ko: { title: '설치됨', description: '이 플러그인이 문제없이 설치 완료된 에이전트의 수입니다. 대상 에이전트 수와 같으면 모든 배포가 완료된 것이며, 적으면 실패나 대기 항목을 확인하세요.' },
    en: { title: 'Installed', description: 'The number of agents where this plugin was installed successfully. If this matches the target agent count, the deployment is complete. If it is lower, check for failed or pending agents that need attention.' },
    ja: { title: 'インストール済み', description: 'このプラグインが問題なくインストール完了したエージェントの数です。対象エージェント数と同じであればすべてのデプロイが完了しており、少ない場合は失敗や保留項目を確認してください。' },
  },
  'plugin-detail-failed': {
    ko: { title: '실패', description: '플러그인 설치가 실패한 에이전트의 수입니다. 0이 아니면 해당 에이전트의 로그를 확인하여 에이전트 버전 호환성, 디스크 공간, 네트워크 등의 원인을 파악하고 재설치하세요.' },
    en: { title: 'Failed', description: 'The number of agents where plugin installation failed. If not zero, check the agent logs to identify the cause (version compatibility, disk space, network issues, etc.) and attempt reinstallation.' },
    ja: { title: '失敗', description: 'プラグインのインストールに失敗したエージェントの数です。0でなければ該当エージェントのログを確認し、バージョン互換性やディスク容量、ネットワークなどの原因を特定して再インストールしてください。' },
  },
  'plugin-detail-pending': {
    ko: { title: '대기 중', description: '아직 플러그인 설치가 시작되지 않은 에이전트의 수입니다. 에이전트가 오프라인이거나 배포 순서를 기다리고 있을 수 있으며, 오래 대기하면 연결 상태를 확인하세요.' },
    en: { title: 'Pending', description: 'The number of agents where plugin installation has not started yet. The agent may be offline or waiting its turn in the deployment queue. If the wait is prolonged, check the agent connection status.' },
    ja: { title: '保留中', description: 'まだプラグインのインストールが開始されていないエージェントの数です。エージェントがオフラインかデプロイの順番待ちの可能性があり、長時間保留が続く場合は接続状態を確認してください。' },
  },
  // ── Agent Groups ──
  'group-agent-count': {
    ko: { title: '에이전트 수', description: '이 그룹에 포함된 에이전트(모니터링 프로그램)의 수입니다. 그룹별로 서버를 묶어 관리하면 역할이나 환경별로 상태를 한눈에 파악할 수 있습니다.' },
    en: { title: 'Agent Count', description: 'The number of monitoring agents in this group. Organizing servers into groups by role or environment makes it easier to monitor their status at a glance and manage them efficiently.' },
    ja: { title: 'エージェント数', description: 'このグループに含まれるエージェント（監視プログラム）の数です。グループごとにサーバーをまとめて管理すると、役割や環境別に状態を一目で把握できます。' },
  },
  'group-healthy-pct': {
    ko: { title: '정상 비율', description: '이 그룹의 에이전트 중 정상 작동하는 비율입니다. 100%이면 모든 에이전트가 문제없이 동작 중이며, 낮아지면 그룹 내 일부 서버에 문제가 있으므로 상세 상태를 확인하세요.' },
    en: { title: 'Healthy %', description: 'The percentage of agents in this group that are operating normally. If it is 100%, all agents are healthy. If it drops, some servers in the group have issues that need to be investigated in the detailed status view.' },
    ja: { title: '正常率', description: 'このグループのエージェントのうち正常稼働している割合です。100%ならすべてのエージェントが問題なく動作中で、低下している場合はグループ内の一部サーバーに問題があるため詳細を確認してください。' },
  },
  'group-avg-cpu': {
    ko: { title: '평균 CPU', description: '이 그룹에 속한 서버들의 평균 CPU 사용률입니다. 그룹 전체가 높으면 해당 역할의 서버가 전반적으로 과부하 상태이므로 서버 증설이나 부하 분산을 고려하세요.' },
    en: { title: 'Avg CPU', description: 'The average CPU usage across all servers in this group. If the entire group shows high CPU, the servers handling this role are generally overloaded and you should consider scaling out or load balancing.' },
    ja: { title: '平均CPU', description: 'このグループに属するサーバーの平均CPU使用率です。グループ全体が高い場合は、該当役割のサーバーが全般的に過負荷状態のためサーバー増設や負荷分散を検討してください。' },
  },
  'group-avg-memory': {
    ko: { title: '평균 메모리', description: '이 그룹에 속한 서버들의 평균 메모리 사용률입니다. 그룹 전체가 높으면 메모리 부족으로 서비스가 불안정해질 수 있으므로 메모리 증설이나 메모리 누수 점검이 필요합니다.' },
    en: { title: 'Avg Memory', description: 'The average memory usage across all servers in this group. If the entire group shows high memory, service instability may occur. Consider adding memory or checking for memory leaks in the applications.' },
    ja: { title: '平均メモリ', description: 'このグループに属するサーバーの平均メモリ使用率です。グループ全体が高い場合はメモリ不足でサービスが不安定になる可能性があるため、メモリ増設やメモリリーク点検が必要です。' },
  },
  // ── Continuous Profiling ──
  'profiling-total-profiles': {
    ko: { title: '전체 프로파일', description: '서비스의 성능을 분석하기 위해 수집된 프로파일(성능 스냅샷)의 총 수입니다. 프로파일을 통해 어떤 코드가 CPU나 메모리를 많이 사용하는지 파악할 수 있습니다.' },
    en: { title: 'Total Profiles', description: 'The total number of performance snapshots (profiles) collected for analyzing service performance. Profiles reveal which code paths are consuming the most CPU or memory, helping you target optimization efforts.' },
    ja: { title: '全プロファイル', description: 'サービスの性能を分析するために収集されたプロファイル（性能スナップショット）の総数です。プロファイルを通じてどのコードがCPUやメモリを多く使用しているか把握できます。' },
  },
  'profiling-active-services': {
    ko: { title: '활성 서비스', description: '현재 성능 프로파일링이 진행 중인 서비스의 수입니다. 성능 문제가 의심되는 서비스가 이 목록에 포함되어 있는지 확인하고, 필요하면 프로파일링을 추가하세요.' },
    en: { title: 'Active Services', description: 'The number of services currently being profiled. If you suspect performance issues in a service but it is not in this list, consider adding profiling to capture detailed performance data for that service.' },
    ja: { title: 'アクティブサービス', description: '現在性能プロファイリングが進行中のサービスの数です。性能問題が疑われるサービスがこのリストに含まれているか確認し、必要に応じてプロファイリングを追加してください。' },
  },
  'profiling-avg-duration': {
    ko: { title: '평균 지속 시간', description: '한 번의 프로파일링 세션이 진행되는 평균 시간(초)입니다. 너무 짧으면 충분한 데이터를 수집하지 못하고, 너무 길면 서버에 부담을 줄 수 있으므로 적절한 길이로 설정하세요.' },
    en: { title: 'Avg Duration', description: 'The average time (in seconds) for one profiling session. Too short may not capture enough data for meaningful analysis, while too long can add overhead to the server. Adjust the duration based on your analysis needs.' },
    ja: { title: '平均期間', description: '1回のプロファイリングセッションにかかる平均時間（秒）です。短すぎると十分なデータを収集できず、長すぎるとサーバーに負担がかかるため、適切な長さに設定してください。' },
  },
  'profiling-storage': {
    ko: { title: '스토리지 사용량', description: '프로파일 데이터가 차지하는 저장 공간의 크기입니다. 프로파일이 계속 쌓이면 저장 공간이 부족해질 수 있으므로, 오래된 데이터는 자동 삭제 정책을 설정하는 것이 좋습니다.' },
    en: { title: 'Storage Used', description: 'The amount of disk space consumed by collected profile data. Profiles accumulate over time and can fill up storage. Set up an automatic retention policy to delete old profiles and prevent storage issues.' },
    ja: { title: 'ストレージ使用量', description: 'プロファイルデータが占めるストレージの容量です。プロファイルが蓄積し続けるとストレージ不足になる可能性があるため、古いデータは自動削除ポリシーの設定をおすすめします。' },
  },
  // ── System Profiling ──
  'sys-profiling-total': {
    ko: { title: '시스템 프로파일', description: '운영체제 수준에서 수집된 시스템 성능 프로파일의 수입니다. 커널, 시스템 호출 등 저수준 성능 병목을 찾는 데 활용되며, 일반 프로파일로 원인을 못 찾을 때 유용합니다.' },
    en: { title: 'System Profiles', description: 'The number of system-level performance profiles captured using tools like perf or eBPF. These profiles help find low-level bottlenecks in the kernel and system calls that regular application profiling might miss.' },
    ja: { title: 'システムプロファイル', description: 'OS レベルで収集されたシステム性能プロファイルの数です。カーネルやシステムコールなど低レベルの性能ボトルネックを特定でき、通常のプロファイルで原因が見つからないときに有用です。' },
  },
  'sys-profiling-active-agents': {
    ko: { title: '활성 에이전트', description: '현재 시스템 프로파일 데이터를 수집하여 보내고 있는 에이전트의 수입니다. 이 수가 예상보다 적다면 일부 에이전트에서 시스템 프로파일링 기능이 비활성화되었을 수 있습니다.' },
    en: { title: 'Active Agents', description: 'The number of agents currently collecting and sending system profile data. If this count is lower than expected, some agents may have system profiling disabled. Check their configuration to enable it.' },
    ja: { title: 'アクティブエージェント', description: '現在システムプロファイルデータを収集して送信しているエージェントの数です。この数が想定より少ない場合は、一部のエージェントでシステムプロファイリング機能が無効になっている可能性があります。' },
  },
  'sys-profiling-avg-duration': {
    ko: { title: '평균 지속 시간', description: '시스템 프로파일 하나를 수집하는 데 걸리는 평균 시간(초)입니다. 분석 목적에 따라 적절한 수집 시간을 설정하며, 너무 길면 데이터 용량이 커질 수 있습니다.' },
    en: { title: 'Avg Duration', description: 'The average time (in seconds) to collect one system profile. Adjust the capture duration based on your analysis goals. Longer captures produce more detailed data but may increase storage requirements.' },
    ja: { title: '平均期間', description: 'システムプロファイル1件の収集にかかる平均時間（秒）です。分析目的に応じて適切な収集時間を設定し、長すぎるとデータ容量が大きくなる可能性があります。' },
  },
  'sys-profiling-storage': {
    ko: { title: '스토리지 사용량', description: '시스템 프로파일 데이터가 차지하는 저장 공간입니다. 시스템 프로파일은 데이터 양이 클 수 있으므로, 보존 기간을 설정하여 불필요한 공간 낭비를 방지하세요.' },
    en: { title: 'Storage Used', description: 'The disk space consumed by system profile data. System profiles can be large, so configure a retention period to automatically remove old data and prevent unnecessary storage waste.' },
    ja: { title: 'ストレージ使用量', description: 'システムプロファイルデータが占めるストレージ容量です。システムプロファイルはデータ量が大きくなりがちなので、保存期間を設定して不要な容量消費を防いでください。' },
  },
  // ── SLO ──
  'slo-total': {
    ko: { title: '전체 SLO', description: '서비스 품질 목표(SLO)로 설정된 항목의 총 수입니다. 예를 들어 "응답시간 1초 이내 99.5%"와 같은 목표가 하나의 SLO이며, 주요 서비스마다 SLO를 설정하는 것이 좋습니다.' },
    en: { title: 'Total SLOs', description: 'The total number of Service Level Objectives (quality targets) that have been set. For example, "99.5% of requests under 1 second" is one SLO. It is recommended to define SLOs for every critical service.' },
    ja: { title: '全SLO', description: 'サービス品質目標（SLO）として設定された項目の総数です。例えば「応答時間1秒以内を99.5%」のような目標が1つのSLOで、主要なサービスごとにSLOを設定することをおすすめします。' },
  },
  'slo-avg-compliance': {
    ko: { title: '평균 준수율', description: '모든 SLO 목표를 얼마나 잘 지키고 있는지의 평균 비율입니다. 99.5% 이상이면 양호하며, 이보다 낮으면 일부 서비스의 품질이 목표에 미달하고 있으므로 개별 SLO를 점검하세요.' },
    en: { title: 'Avg Compliance', description: 'The average rate at which all SLO targets are being met. Above 99.5% is considered healthy. Below that means some services are not meeting their quality goals, and you should review the individual SLOs to find the underperformers.' },
    ja: { title: '平均準拠率', description: 'すべてのSLO目標をどの程度達成しているかの平均割合です。99.5%以上なら良好で、それより低い場合は一部のサービス品質が目標に達していないため個別SLOを確認してください。' },
  },
  'slo-at-risk': {
    ko: { title: '위험 SLO', description: '목표 달성이 어려워지고 있는 SLO의 수입니다. 아직 목표를 위반하지는 않았지만 여유가 줄고 있으므로, 해당 서비스의 성능을 개선하지 않으면 곧 위반으로 이어질 수 있습니다.' },
    en: { title: 'At Risk', description: 'The number of SLOs that are approaching their limits but have not yet been breached. There is still time to act, but if the underlying performance does not improve, these SLOs will soon be violated.' },
    ja: { title: 'リスクSLO', description: '目標達成が厳しくなりつつあるSLOの数です。まだ目標を違反してはいませんが余裕が減っているため、該当サービスの性能を改善しなければまもなく違反につながる可能性があります。' },
  },
  'slo-breached': {
    ko: { title: '위반 SLO', description: '설정한 품질 목표를 달성하지 못한 SLO의 수입니다. 위반이 발생하면 사용자 경험에 직접 영향을 미치고 있다는 뜻이므로, 원인을 파악하고 즉시 개선 조치를 취해야 합니다.' },
    en: { title: 'Breached', description: 'The number of SLOs where the quality target was not met. A breached SLO means users are directly experiencing degraded service. Identify the cause and take corrective action as a top priority.' },
    ja: { title: '違反SLO', description: '設定した品質目標を達成できなかったSLOの数です。違反が発生するとユーザー体験に直接影響しているため、原因を特定し即座に改善措置を講じてください。' },
  },
  'probe-total': {
    ko: { title: '전체 프로브', description: '외부에서 서비스에 자동으로 접속하여 상태를 확인하는 합성 모니터링 프로브의 총 수입니다. 실제 사용자처럼 접속을 시도하여 서비스가 정상인지 주기적으로 검사합니다.' },
    en: { title: 'Total Probes', description: 'The total number of synthetic monitoring probes that automatically test service availability from the outside. Probes act like real users, periodically checking whether the service is accessible and responsive.' },
    ja: { title: '全プローブ', description: '外部からサービスに自動的にアクセスして状態を確認する合成モニタリングプローブの総数です。実際のユーザーのようにアクセスを試み、サービスが正常かどうか定期的に検査します。' },
  },
  'probe-healthy': {
    ko: { title: '정상 프로브', description: '서비스에 정상적으로 접속 가능한 프로브의 수입니다. 전체 프로브 수와 같으면 모든 접속 경로가 정상이며, 적으면 일부 경로에서 서비스 접근에 문제가 있다는 뜻입니다.' },
    en: { title: 'Healthy Probes', description: 'The number of probes that can reach the service without any problems. If this equals the total probe count, all access paths are working normally. If it is lower, some paths have issues that should be investigated.' },
    ja: { title: '正常プローブ', description: 'サービスに正常にアクセスできているプローブの数です。全プローブ数と同じであればすべてのアクセス経路が正常で、少ない場合は一部の経路でサービスへのアクセスに問題があることを意味します。' },
  },
  'probe-degraded': {
    ko: { title: '성능 저하 프로브', description: '접속은 되지만 응답이 느리거나 간헐적 오류가 있는 프로브의 수입니다. 해당 경로에서 사용자 체감 품질이 떨어지고 있을 수 있으므로 네트워크나 서비스 상태를 점검하세요.' },
    en: { title: 'Degraded Probes', description: 'The number of probes that can connect but are experiencing slow responses or intermittent errors. Users on those paths may be having a poor experience. Check the network and service status for those endpoints.' },
    ja: { title: '性能低下プローブ', description: 'アクセスはできるものの応答が遅い、または間欠的なエラーがあるプローブの数です。該当経路でユーザー体験が低下している可能性があるため、ネットワークやサービス状態を点検してください。' },
  },
  'probe-down': {
    ko: { title: '다운 프로브', description: '서비스에 전혀 접속할 수 없는 프로브의 수입니다. 해당 지역이나 네트워크에서 서비스가 완전히 중단된 것을 의미하므로 즉시 원인을 확인하고 복구해야 합니다.' },
    en: { title: 'Down Probes', description: 'The number of probes that cannot reach the service at all. This means the service is completely unavailable from those locations or network paths. Investigate the cause and restore access immediately.' },
    ja: { title: 'ダウンプローブ', description: 'サービスに全くアクセスできないプローブの数です。該当地域やネットワークでサービスが完全に停止していることを意味するため、即座に原因を確認し復旧してください。' },
  },
  // ── Diagnostics ──
  'diag-it-items': {
    ko: { title: 'IT 항목', description: '운영체제, 미들웨어, 네트워크 등 IT 인프라의 상태를 점검하는 진단 항목의 수입니다. 서버 기본 환경이 올바르게 구성되어 있는지 자동으로 확인합니다.' },
    en: { title: 'IT Items', description: 'The number of diagnostic checks covering IT infrastructure: operating systems, middleware, and network configurations. These checks automatically verify that the server environment is properly set up and functioning.' },
    ja: { title: 'IT項目', description: 'OS、ミドルウェア、ネットワークなどITインフラの状態を点検する診断項目の数です。サーバーの基本環境が正しく構成されているか自動的に確認します。' },
  },
  'diag-ai-items': {
    ko: { title: 'AI 항목', description: 'AI 모델, GPU, 벡터 데이터베이스, 안전 필터 등 AI 관련 시스템의 상태를 점검하는 진단 항목의 수입니다. AI 서비스가 올바르게 작동하는 데 필요한 모든 구성 요소를 검사합니다.' },
    en: { title: 'AI Items', description: 'The number of diagnostic checks for AI-related systems: models, GPUs, vector databases, and safety filters. These checks verify that all the components needed for AI services to function correctly are working properly.' },
    ja: { title: 'AI項目', description: 'AIモデル、GPU、ベクターDB、安全フィルターなどAI関連システムの状態を点検する診断項目の数です。AIサービスが正しく動作するために必要なすべてのコンポーネントを検査します。' },
  },
  'diag-last-scan': {
    ko: { title: '마지막 스캔', description: '가장 최근에 진단 검사가 실행된 시각입니다. 너무 오래 전이라면 정기 검사가 중단되었을 수 있으므로, 진단 스케줄 설정을 확인하세요.' },
    en: { title: 'Last Scan', description: 'The time when the most recent diagnostic scan was run. If this was too long ago, the regular scan schedule may have been interrupted. Check the diagnostic schedule settings to ensure scans are running as expected.' },
    ja: { title: '最終スキャン', description: '最後に診断検査が実行された時刻です。あまりに前の時間であれば定期検査が停止している可能性があるため、診断スケジュールの設定を確認してください。' },
  },
  'diag-pass-rate': {
    ko: { title: '통과율', description: '전체 진단 항목 중 문제없이 통과한 비율입니다. 100%이면 모든 검사 항목이 정상이며, 낮아지면 경고나 실패 항목이 있으므로 상세 결과를 확인하고 조치하세요.' },
    en: { title: 'Pass Rate', description: 'The percentage of all diagnostic checks that passed without issues. If it is 100%, all checks are healthy. If it drops, there are warning or failed items that need attention. Review the detailed results and address them.' },
    ja: { title: '合格率', description: '全診断項目のうち問題なく通過した割合です。100%であればすべての検査項目が正常で、低下している場合は警告や失敗の項目があるため詳細結果を確認して対処してください。' },
  },
  // ── Executive ──
  'exec-overall-health': {
    ko: { title: '전체 상태', description: '모든 서비스, 서버, AI 시스템을 종합한 전체 건강 상태입니다. 정상/경고/위험 중 하나로 표시되며, 경고 이상이면 어떤 구성 요소에 문제가 있는지 세부 대시보드에서 확인하세요.' },
    en: { title: 'Overall Health', description: 'A combined health assessment of all services, servers, and AI systems, displayed as Healthy, Warning, or Critical. If it shows Warning or above, drill down into the detail dashboards to find which component has the problem.' },
    ja: { title: '全体状態', description: 'すべてのサービス、サーバー、AIシステムを総合した全体的な健全性です。正常/警告/危険のいずれかで表示され、警告以上の場合はどのコンポーネントに問題があるか詳細ダッシュボードで確認してください。' },
  },
  'exec-services': {
    ko: { title: '서비스', description: '일반 서비스와 AI 서비스를 포함한 전체 서비스 수입니다. 경영진이 운영 규모를 한눈에 파악할 수 있으며, 서비스 수의 변화를 통해 인프라 확장 추이를 확인할 수 있습니다.' },
    en: { title: 'Services', description: 'The total number of services in operation, including both standard and AI services. This provides an at-a-glance view of operational scale, and changes in the count reveal infrastructure growth or reduction trends.' },
    ja: { title: 'サービス', description: '一般サービスとAIサービスを含めた全サービス数です。経営層が運営規模を一目で把握でき、サービス数の変化からインフラ拡張の推移を確認できます。' },
  },
  'exec-slo-compliance': {
    ko: { title: 'SLO 준수율', description: '모든 서비스 품질 목표(SLO)를 얼마나 잘 지키고 있는지의 전체 비율입니다. 99.5% 이상이면 양호하며, 이보다 낮으면 사용자 경험에 영향이 있으므로 개선이 필요합니다.' },
    en: { title: 'SLO Compliance', description: 'The overall percentage of service quality targets (SLOs) being met across all services. Above 99.5% is healthy. Below that, user experience is being impacted and improvements should be prioritized.' },
    ja: { title: 'SLO準拠率', description: 'すべてのサービス品質目標（SLO）をどの程度達成しているかの全体割合です。99.5%以上なら良好で、それより低い場合はユーザー体験に影響があるため改善が必要です。' },
  },
  'exec-open-incidents': {
    ko: { title: '미해결 인시던트', description: '현재 진행 중이거나 아직 해결되지 않은 장애 건수입니다. 0이면 현재 알려진 문제가 없고, 숫자가 크면 운영팀의 대응 역량이나 프로세스 개선이 필요할 수 있습니다.' },
    en: { title: 'Open Incidents', description: 'The number of incidents currently ongoing or unresolved. Zero means no known issues. A high count may indicate the operations team needs additional capacity or improved incident response processes.' },
    ja: { title: '未解決インシデント', description: '現在進行中、またはまだ解決されていない障害件数です。0であれば既知の問題はなく、数が多い場合は運用チームの対応力やプロセスの改善が必要な可能性があります。' },
  },
  'exec-mttr': {
    ko: { title: 'MTTR', description: '장애 발생부터 해결까지 걸리는 평균 시간(분)입니다. 짧을수록 장애 대응이 빠르다는 뜻이며, 이 수치를 줄이기 위해 자동화된 대응 절차나 사전 대비 매뉴얼을 갖추는 것이 좋습니다.' },
    en: { title: 'MTTR', description: 'The average time (in minutes) from when an incident is detected to when it is fully resolved. Shorter is better. If this metric is trending upward, consider investing in automated responses and pre-built runbooks to speed up resolution.' },
    ja: { title: 'MTTR', description: '障害発生から解決までにかかる平均時間（分）です。短いほど障害対応が迅速であることを意味し、この数値を短縮するために自動化された対応手順や事前準備マニュアルを整備することをおすすめします。' },
  },
  'exec-daily-cost': {
    ko: { title: '일일 비용', description: '오늘 하루의 총 운영 비용(AI, GPU, 인프라 등 포함)입니다. 전일이나 주간 평균과 비교하여 이상 증가가 없는지 확인하고, 비용 추이를 통해 예산 계획에 활용하세요.' },
    en: { title: 'Daily Cost', description: 'The total operational cost for today (including AI, GPU, infrastructure, etc.). Compare it with the previous day or weekly averages to spot unusual increases and use cost trends for budget planning.' },
    ja: { title: '日次コスト', description: '本日の総運用コスト（AI、GPU、インフラ等すべて含む）です。前日や週間平均と比較して異常な増加がないか確認し、コスト推移を通じて予算計画に活用してください。' },
  },
  // ── Tenants ──
  'tenant-total': {
    ko: { title: '전체 테넌트', description: '서비스를 이용 중인 고객(테넌트)의 총 수입니다. 멀티테넌트 환경에서는 고객별로 자원과 비용을 분리하여 관리하므로, 테넌트 수 변화로 비즈니스 성장을 파악할 수 있습니다.' },
    en: { title: 'Total Tenants', description: 'The total number of customers (tenants) using the service. In a multi-tenant environment, resources and costs are tracked separately per customer. Changes in tenant count reflect business growth or churn.' },
    ja: { title: '全テナント', description: 'サービスを利用中の顧客（テナント）の総数です。マルチテナント環境ではテナントごとにリソースとコストを分離管理するため、テナント数の変化からビジネスの成長を把握できます。' },
  },
  'tenant-monthly-revenue': {
    ko: { title: '월 수익', description: '모든 고객(테넌트)으로부터 발생하는 이번 달 총 수익입니다. 인프라 운영 비용과 비교하여 수익성을 판단하고, 수익 감소가 있으면 이탈 고객이 없는지 확인하세요.' },
    en: { title: 'Monthly Revenue', description: 'The total revenue generated from all tenants this month. Compare this against infrastructure costs to gauge profitability. If revenue is declining, check for customer churn or plan downgrades.' },
    ja: { title: '月間収益', description: 'すべてのテナントから発生する今月の総収益です。インフラ運用コストと比較して収益性を判断し、収益の減少がある場合は離脱テナントがないか確認してください。' },
  },
  'tenant-total-users': {
    ko: { title: '전체 사용자', description: '모든 고객사에 속한 사용자의 총 수입니다. 사용자가 증가하면 시스템 부하도 함께 올라가므로, 인프라 용량 계획 시 이 수치의 증가 추세를 참고하세요.' },
    en: { title: 'Total Users', description: 'The total number of users across all customer organizations. As this number grows, system load increases accordingly. Factor this growth trend into your infrastructure capacity planning.' },
    ja: { title: '全ユーザー', description: 'すべてのテナントに属するユーザーの総数です。ユーザーが増加するとシステム負荷も上がるため、インフラ容量計画の際にこの数値の増加傾向を参考にしてください。' },
  },
  'tenant-total-hosts': {
    ko: { title: '전체 호스트', description: '모든 고객사에 할당된 서버(호스트)의 총 수입니다. 호스트 수가 많을수록 운영 비용이 커지므로, 테넌트별 자원 사용량을 모니터링하여 효율적으로 배분하세요.' },
    en: { title: 'Total Hosts', description: 'The total number of servers allocated to all tenants. More hosts means higher operational costs. Monitor resource usage per tenant to ensure efficient allocation and prevent overspending.' },
    ja: { title: '全ホスト', description: 'すべてのテナントに割り当てられたサーバー（ホスト）の総数です。ホスト数が多いほど運用コストが増えるため、テナント別のリソース使用量をモニタリングして効率的に配分してください。' },
  },
  'tenant-avg-revenue': {
    ko: { title: '평균 수익', description: '고객 한 곳당 발생하는 평균 월 수익입니다. 이 값이 올라가면 고객 가치가 높아지고 있다는 뜻이고, 낮아지면 고객 이탈이나 다운그레이드를 확인해 보세요.' },
    en: { title: 'Avg Revenue', description: 'The average monthly revenue generated by each tenant. An increase means customer value is growing. A decrease may signal customer churn or plan downgrades that should be investigated.' },
    ja: { title: '平均収益', description: 'テナント1社あたりの平均月間収益です。この値が上がれば顧客価値が高まっていることを意味し、下がっている場合は顧客離脱やダウングレードがないか確認してください。' },
  },
  // ── Marketplace ──
  'marketplace-total': {
    ko: { title: '전체 항목', description: '마켓플레이스에서 다운로드하거나 구매할 수 있는 항목(대시보드, 프롬프트, 플러그인)의 총 수입니다. 필요한 기능이 있는지 찾아보고 바로 활용할 수 있습니다.' },
    en: { title: 'Total Items', description: 'The total number of items (dashboards, prompts, plugins) available for download or purchase in the marketplace. Browse the marketplace to find ready-to-use tools that can enhance your monitoring setup.' },
    ja: { title: '全アイテム', description: 'マーケットプレイスでダウンロードまたは購入できるアイテム（ダッシュボード、プロンプト、プラグイン）の総数です。必要な機能を探してすぐに活用できます。' },
  },
  'marketplace-dashboards': {
    ko: { title: '대시보드', description: '마켓플레이스에서 바로 가져다 쓸 수 있는 대시보드 템플릿의 수입니다. 직접 만들지 않아도 검증된 대시보드를 설치하여 빠르게 모니터링을 시작할 수 있습니다.' },
    en: { title: 'Dashboards', description: 'The number of pre-built dashboard templates available in the marketplace. Instead of creating dashboards from scratch, you can install proven templates and start monitoring immediately.' },
    ja: { title: 'ダッシュボード', description: 'マーケットプレイスからすぐに利用できるダッシュボードテンプレートの数です。自分で作成しなくても検証済みのダッシュボードをインストールして、すぐにモニタリングを開始できます。' },
  },
  'marketplace-prompts': {
    ko: { title: '프롬프트', description: '마켓플레이스에서 공유되는 AI 프롬프트 템플릿의 수입니다. 다른 사용자가 만든 효과적인 프롬프트를 활용하면 AI 답변 품질을 빠르게 개선할 수 있습니다.' },
    en: { title: 'Prompts', description: 'The number of AI prompt templates shared in the marketplace. Using effective prompts created by other users can quickly improve your AI response quality without starting from zero.' },
    ja: { title: 'プロンプト', description: 'マーケットプレイスで共有されているAIプロンプトテンプレートの数です。他のユーザーが作成した効果的なプロンプトを活用すれば、AI回答品質を素早く改善できます。' },
  },
  'marketplace-plugins': {
    ko: { title: '플러그인', description: '마켓플레이스에서 설치할 수 있는 에이전트 확장 플러그인의 수입니다. 특정 기술이나 서비스에 맞는 플러그인을 설치하면 추가 모니터링 기능을 쉽게 확장할 수 있습니다.' },
    en: { title: 'Plugins', description: 'The number of agent extension plugins available in the marketplace. Install plugins tailored to specific technologies or services to easily expand your monitoring capabilities.' },
    ja: { title: 'プラグイン', description: 'マーケットプレイスからインストールできるエージェント拡張プラグインの数です。特定の技術やサービスに合ったプラグインをインストールすれば、追加の監視機能を簡単に拡張できます。' },
  },
  // ── Mobile ──
  'mobile-critical-alerts': {
    ko: { title: '심각한 알림', description: '즉시 대응이 필요한 심각한 알림의 수입니다. 0이면 현재 긴급 상황이 없고, 숫자가 있으면 서비스에 직접 영향을 주는 문제가 있으므로 바로 확인하세요.' },
    en: { title: 'Critical Alerts', description: 'The number of severe alerts that require immediate action. Zero means no emergencies right now. If there are any, the service is directly impacted and you should investigate immediately.' },
    ja: { title: '重大アラート', description: '即座に対応が必要な深刻なアラートの数です。0であれば現在緊急事態はなく、数値がある場合はサービスに直接影響する問題があるためすぐに確認してください。' },
  },
  'mobile-service-health': {
    ko: { title: '서비스 상태', description: '전체 서비스 중 정상적으로 작동하는 비율입니다. 100%이면 모든 서비스가 정상이며, 낮아지면 일부 서비스에 문제가 있으므로 상세 대시보드에서 어떤 서비스가 문제인지 확인하세요.' },
    en: { title: 'Service Health', description: 'The percentage of all services that are currently running without issues. If it is 100%, everything is healthy. If it drops, check the detailed dashboard to identify which specific services are experiencing problems.' },
    ja: { title: 'サービス状態', description: '全サービスのうち正常に稼働している割合です。100%ならすべてのサービスが正常で、低下している場合は一部のサービスに問題があるため詳細ダッシュボードで確認してください。' },
  },
  'mobile-ttft-p95': {
    ko: { title: 'TTFT P95', description: 'AI에게 질문한 뒤 첫 글자가 나타나기까지의 시간(상위 95% 기준)입니다. 모바일에서 빠르게 AI 서비스 응답 속도를 확인할 수 있으며, 2초를 넘으면 주의가 필요합니다.' },
    en: { title: 'TTFT P95', description: 'The 95th percentile time until the AI starts producing output. This lets you quickly check AI response speed from your mobile device. If it exceeds 2 seconds, the AI service may need attention.' },
    ja: { title: 'TTFT P95', description: 'AIに質問してから最初の文字が表示されるまでの時間（上位95%基準）です。モバイルからAIサービスの応答速度を素早く確認でき、2秒を超える場合は注意が必要です。' },
  },
  'mobile-gpu-avg': {
    ko: { title: 'GPU 평균', description: 'AI 연산에 사용되는 GPU의 평균 사용률입니다. 모바일에서 GPU 과부하 여부를 빠르게 확인할 수 있으며, 90%를 넘으면 AI 성능 저하 위험이 있으므로 확인하세요.' },
    en: { title: 'GPU Avg', description: 'The average GPU utilization for AI computation. A quick check from your mobile to see if GPUs are overloaded. Above 90%, AI performance may degrade, so further investigation is recommended.' },
    ja: { title: 'GPU平均', description: 'AI演算に使用されるGPUの平均使用率です。モバイルからGPU過負荷の有無を素早く確認でき、90%を超える場合はAI性能低下のリスクがあるため確認してください。' },
  },
  // ── Infrastructure ── (additional)
  'infra-pending-agents': {
    ko: { title: '대기 에이전트', description: '새로 설치되었지만 아직 관리자 승인을 받지 못한 에이전트의 수입니다. 승인을 해야 모니터링이 시작되므로, 대기 중인 에이전트가 있으면 확인 후 승인하세요.' },
    en: { title: 'Pending Agents', description: 'The number of newly installed agents waiting for administrator approval. Monitoring only starts after approval, so if agents are pending, review and approve them to begin collecting data.' },
    ja: { title: '保留エージェント', description: '新しくインストールされたがまだ管理者の承認を受けていないエージェントの数です。承認しないとモニタリングが開始されないため、保留中のエージェントがあれば確認の上承認してください。' },
  },
  // ── Middleware ──
  'middleware-hosts': {
    ko: { title: '모니터링 호스트', description: '웹 서버, 애플리케이션 서버 등 미들웨어가 설치된 서버의 수입니다. 미들웨어는 서비스 운영의 중간 계층이므로, 이 서버들의 상태가 곧 서비스 안정성에 직결됩니다.' },
    en: { title: 'Monitored Hosts', description: 'The number of servers running middleware (web servers, application servers, etc.) that are being monitored. Middleware is the middle layer of your service stack, so these servers\' health directly impacts service stability.' },
    ja: { title: '監視ホスト', description: 'Webサーバーやアプリケーションサーバーなどミドルウェアがインストールされたサーバーの数です。ミドルウェアはサービス運営の中間層なので、これらのサーバーの状態がサービスの安定性に直結します。' },
  },
  'middleware-languages': {
    ko: { title: '언어', description: '서비스에서 사용되고 있는 프로그래밍 언어나 런타임(Java, Python, Go 등)의 종류 수입니다. 각 언어별로 특화된 모니터링 지표를 제공하여 더 정확한 성능 분석이 가능합니다.' },
    en: { title: 'Languages', description: 'The number of programming languages or runtimes (Java, Python, Go, etc.) detected in your services. Each language has specialized monitoring metrics, enabling more accurate performance analysis for each technology.' },
    ja: { title: '言語', description: 'サービスで使用されているプログラミング言語やランタイム（Java、Python、Go等）の種類数です。各言語に特化した監視指標を提供し、より正確な性能分析が可能です。' },
  },
  'middleware-conn-pools': {
    ko: { title: '커넥션 풀', description: '데이터베이스 등 외부 시스템과의 연결을 관리하는 커넥션 풀의 수입니다. 커넥션 풀이 가득 차면 새 요청이 대기하게 되어 서비스가 느려지므로 사용률을 주시하세요.' },
    en: { title: 'Connection Pools', description: 'The number of connection pools managing links to databases and other external systems. When a pool is full, new requests must wait, slowing down the service. Keep an eye on utilization to prevent bottlenecks.' },
    ja: { title: 'コネクションプール', description: 'データベースなど外部システムとの接続を管理するコネクションプールの数です。コネクションプールが満杯になると新しいリクエストが待機状態となりサービスが遅くなるため、使用率を注視してください。' },
  },
  'middleware-leak-alerts': {
    ko: { title: '누수 알림', description: '사용 후 반환되지 않는 커넥션(누수)이 감지된 알림의 수입니다. 누수가 계속되면 사용 가능한 커넥션이 점점 줄어들어 서비스 장애로 이어지므로, 해당 코드를 찾아 수정해야 합니다.' },
    en: { title: 'Leak Alerts', description: 'The number of alerts triggered when connections are not properly returned after use (connection leaks). Ongoing leaks gradually reduce available connections and can eventually cause service outages. Find and fix the leaking code.' },
    ja: { title: 'リークアラート', description: '使用後に返却されないコネクション（リーク）が検出されたアラートの数です。リークが続くと利用可能なコネクションが減りサービス障害につながるため、該当コードを特定して修正してください。' },
  },
  'conn-pool-total': {
    ko: { title: '전체 풀', description: '현재 모니터링하고 있는 커넥션 풀의 총 개수입니다. 데이터베이스, 캐시, 외부 API 등에 대한 연결 풀이 포함되며, 모든 풀이 감시 대상에 포함되어 있는지 확인하세요.' },
    en: { title: 'Total Pools', description: 'The total number of connection pools currently being monitored, including pools for databases, caches, and external APIs. Ensure all important connection pools are included in the monitoring scope.' },
    ja: { title: '全プール', description: '現在モニタリングしているコネクションプールの総数です。データベース、キャッシュ、外部APIなどへの接続プールが含まれ、すべてのプールが監視対象に含まれているか確認してください。' },
  },
  // ── Thread Dump ──
  'thread-total': {
    ko: { title: '전체 스레드', description: '애플리케이션이 사용하고 있는 스레드(동시 작업 단위)의 총 수입니다. 스레드가 평소보다 급증하면 요청 폭주나 코드 문제일 수 있으므로 확인이 필요합니다.' },
    en: { title: 'Total Threads', description: 'The total number of threads (concurrent work units) the application is using. If the thread count spikes compared to normal, it may indicate a request flood or a code issue that needs investigation.' },
    ja: { title: '全スレッド', description: 'アプリケーションが使用しているスレッド（同時処理の単位）の総数です。スレッドが普段より急増した場合はリクエスト殺到やコードの問題の可能性があるため確認が必要です。' },
  },
  'thread-virtual': {
    ko: { title: '가상 스레드', description: 'Java 21+ 등에서 사용하는 가상 스레드의 수입니다. 기존 스레드보다 가볍게 많은 동시 작업을 처리할 수 있으며, 숫자가 매우 크더라도 정상적인 경우가 많습니다.' },
    en: { title: 'Virtual Threads', description: 'The number of virtual threads used in Java 21+ and similar runtimes. Virtual threads are lightweight and can handle many concurrent tasks. Even a very high count is often normal, unlike traditional threads.' },
    ja: { title: '仮想スレッド', description: 'Java 21以降などで使用する仮想スレッドの数です。従来のスレッドより軽量で多数の同時処理が可能であり、数が非常に多くても正常な場合がほとんどです。' },
  },
  'thread-vt-running': {
    ko: { title: 'VT 실행 중', description: '현재 실제로 작업을 수행 중인 가상 스레드의 수입니다. 이 숫자가 높으면 활발히 요청을 처리하고 있다는 뜻이며, CPU 코어 수보다 크게 높으면 대기 시간이 발생할 수 있습니다.' },
    en: { title: 'VT Running', description: 'The number of virtual threads currently doing active work. A high count means requests are being processed actively. If this significantly exceeds the CPU core count, some threads may experience scheduling delays.' },
    ja: { title: 'VT実行中', description: '現在実際に処理を実行中の仮想スレッドの数です。この数値が高ければ活発にリクエストを処理している状態で、CPUコア数よりかなり多い場合は待ち時間が発生する可能性があります。' },
  },
  // ── Database ──
  'db-total-instances': {
    ko: { title: '전체 인스턴스', description: '현재 운영 중인 데이터베이스 서버(인스턴스)의 총 수입니다. 서비스가 데이터를 저장하고 읽는 핵심 시스템이므로, 모든 인스턴스가 모니터링에 포함되어 있는지 확인하세요.' },
    en: { title: 'Total Instances', description: 'The total number of database servers (instances) currently running. Databases are the core systems where services store and retrieve data. Ensure all instances are included in your monitoring coverage.' },
    ja: { title: '全インスタンス', description: '現在稼働中のデータベースサーバー（インスタンス）の総数です。サービスがデータを保存・読み取る核心システムなので、すべてのインスタンスがモニタリングに含まれているか確認してください。' },
  },
  'db-avg-qps': {
    ko: { title: '평균 QPS', description: '모든 데이터베이스가 1초에 처리하는 평균 쿼리 건수입니다. 이 숫자가 급증하면 데이터베이스에 부하가 걸릴 수 있고, 급감하면 서비스에 장애가 생겼을 가능성이 있습니다.' },
    en: { title: 'Avg QPS', description: 'The average number of queries processed per second across all databases. A sudden surge can overload the database, while a sudden drop may indicate a service outage preventing queries from reaching the database.' },
    ja: { title: '平均QPS', description: 'すべてのデータベースが1秒間に処理する平均クエリ件数です。この数値が急増するとDBに負荷がかかり、急減するとサービス障害の可能性があります。' },
  },
  'db-slow-queries': {
    ko: { title: '슬로우 쿼리 (24h)', description: '지난 24시간 동안 실행 시간이 비정상적으로 오래 걸린 데이터베이스 쿼리의 수입니다. 슬로우 쿼리는 서비스 응답을 느리게 만드는 주범이므로, 해당 쿼리를 최적화하세요.' },
    en: { title: 'Slow Queries (24h)', description: 'The number of database queries that took abnormally long to execute in the past 24 hours. Slow queries are a leading cause of sluggish service responses. Optimize the flagged queries to improve overall performance.' },
    ja: { title: 'スロークエリ (24h)', description: '過去24時間に実行時間が異常に長かったデータベースクエリの数です。スロークエリはサービス応答を遅くする主な原因なので、該当クエリを特定して最適化してください。' },
  },
  'db-active-locks': {
    ko: { title: '활성 락', description: '현재 다른 작업을 멈추게 하고 있는 데이터베이스 잠금(Lock)의 수입니다. 이 숫자가 높으면 여러 작업이 서로 기다리면서 성능이 저하되므로, 잠금을 유발하는 쿼리나 트랜잭션을 확인하세요.' },
    en: { title: 'Active Locks', description: 'The number of database locks currently blocking other operations. When this is high, multiple queries are waiting on each other, degrading performance. Identify the queries or transactions causing the locks and resolve them.' },
    ja: { title: 'アクティブロック', description: '他の処理をブロックしているデータベースロックの数です。この数が多いと複数の処理が互いに待ち合って性能が低下するため、ロックを発生させているクエリやトランザクションを確認してください。' },
  },
  // ── Golden Signals ──
  'gs-avg-latency-p95': {
    ko: { title: '평균 지연시간 P95', description: '모든 서비스의 P95 응답시간 평균(밀리초)입니다. Google이 제안한 4가지 핵심 지표(골든 시그널) 중 하나로, 사용자가 체감하는 응답 속도를 대표합니다. 값이 올라가면 전반적인 서비스 속도 저하를 의미합니다.' },
    en: { title: 'Avg Latency P95', description: 'The average P95 response time (in ms) across all services. This is one of Google\'s four Golden Signals and represents the speed users actually experience. An increase means overall service performance is degrading.' },
    ja: { title: '平均レイテンシP95', description: 'すべてのサービスのP95応答時間の平均（ミリ秒）です。Googleが提唱する4つの重要指標（ゴールデンシグナル）の1つで、ユーザーが体感する応答速度を代表します。値が上がると全般的なサービス速度低下を意味します。' },
  },
  'gs-total-traffic': {
    ko: { title: '총 트래픽', description: '모든 서비스가 1분간 받는 요청의 합계입니다. 트래픽이 갑자기 늘면 이벤트나 공격 때문일 수 있고, 급감하면 서비스 접근 자체에 문제가 있을 수 있습니다.' },
    en: { title: 'Total Traffic', description: 'The total number of requests received per minute across all services. A sudden increase could be caused by an event or an attack. A sudden decrease could indicate that users cannot reach the service at all.' },
    ja: { title: '総トラフィック', description: 'すべてのサービスが1分間に受けるリクエストの合計です。トラフィックの急増はイベントや攻撃の可能性があり、急減はサービスアクセス自体に問題がある可能性があります。' },
  },
  'gs-avg-error-rate': {
    ko: { title: '평균 에러율', description: '모든 서비스에서 발생하는 오류의 평균 비율입니다. 골든 시그널 중 하나로, 시스템 전체의 안정성을 한눈에 파악할 수 있습니다. 0.5% 이상이면 어떤 서비스에서 오류가 집중되는지 확인하세요.' },
    en: { title: 'Avg Error Rate', description: 'The average error rate across all services, one of the Golden Signals for system health. It gives an instant view of overall system stability. If it exceeds 0.5%, check which services are generating the most errors.' },
    ja: { title: '平均エラー率', description: 'すべてのサービスで発生するエラーの平均割合です。ゴールデンシグナルの1つで、システム全体の安定性を一目で把握できます。0.5%以上の場合はどのサービスでエラーが集中しているか確認してください。' },
  },
  'gs-avg-saturation': {
    ko: { title: '평균 포화도', description: '모든 서비스의 CPU와 메모리를 얼마나 사용하고 있는지의 평균입니다. 포화도가 높으면 시스템이 한계에 가까워지고 있다는 뜻이며, 서버 증설이나 부하 최적화를 고려해야 합니다.' },
    en: { title: 'Avg Saturation', description: 'The average CPU and memory utilization across all services. High saturation means the system is approaching its capacity limits. If it keeps rising, consider adding servers or optimizing workloads before performance degrades.' },
    ja: { title: '平均飽和度', description: 'すべてのサービスのCPUとメモリの使用率の平均です。飽和度が高いとシステムが限界に近づいていることを意味し、サーバー増設や負荷最適化を検討する必要があります。' },
  },
  // ── Cache ──
  'cache-total-instances': {
    ko: { title: '전체 인스턴스', description: 'Redis 등 캐시 서버의 총 개수입니다. 캐시는 자주 사용되는 데이터를 빠르게 제공하여 서비스 속도를 높이는 역할을 하므로, 모든 인스턴스가 정상인지 확인하세요.' },
    en: { title: 'Total Instances', description: 'The total number of cache servers (such as Redis). Caches speed up your services by quickly serving frequently accessed data. Make sure all cache instances are healthy to maintain optimal performance.' },
    ja: { title: '全インスタンス', description: 'Redisなどキャッシュサーバーの総数です。キャッシュは頻繁に使用されるデータを高速に提供してサービスの速度を高める役割を持つため、すべてのインスタンスが正常か確認してください。' },
  },
  'cache-avg-hit-rate': {
    ko: { title: '평균 적중률', description: '캐시에서 데이터를 찾는 데 성공한 비율의 평균입니다. 높을수록(90% 이상) 좋으며, 낮으면 데이터베이스에 직접 접근하는 횟수가 많아져 서비스가 느려질 수 있습니다.' },
    en: { title: 'Avg Hit Rate', description: 'The average success rate for finding data in the cache. Above 90% is ideal. If it is low, more requests fall through to the database, which can slow down the service. Consider tuning your cache strategy.' },
    ja: { title: '平均ヒット率', description: 'キャッシュからデータの検索に成功した割合の平均です。高いほど良く（90%以上推奨）、低いとデータベースへの直接アクセスが増えてサービスが遅くなる可能性があります。' },
  },
  'cache-avg-memory': {
    ko: { title: '평균 메모리', description: '캐시 서버들의 평균 메모리 사용률입니다. 캐시 메모리가 가득 차면 오래된 데이터가 삭제되어 적중률이 떨어지므로, 사용률이 높아지면 메모리 증설이나 만료 정책 조정을 검토하세요.' },
    en: { title: 'Avg Memory', description: 'The average memory usage across cache servers. When cache memory fills up, older data is evicted and the hit rate drops. If usage is climbing, consider adding memory or adjusting the eviction policy.' },
    ja: { title: '平均メモリ', description: 'キャッシュサーバーの平均メモリ使用率です。キャッシュメモリが満杯になると古いデータが削除されヒット率が低下するため、使用率が高くなったらメモリ増設や有効期限設定の調整を検討してください。' },
  },
  'cache-total-ops': {
    ko: { title: '총 Ops/sec', description: '모든 캐시 서버가 1초에 처리하는 총 작업(읽기/쓰기) 건수입니다. 이 숫자가 급증하면 캐시에 부하가 걸릴 수 있고, 급감하면 서비스 트래픽 자체가 줄었거나 캐시 접속에 문제가 있을 수 있습니다.' },
    en: { title: 'Total Ops/sec', description: 'The total number of read/write operations handled by all cache servers per second. A surge may overload the cache, while a drop could mean service traffic has declined or there is a connectivity issue with the cache.' },
    ja: { title: '総Ops/sec', description: 'すべてのキャッシュサーバーが1秒間に処理する総操作（読み/書き）件数です。急増するとキャッシュに負荷がかかり、急減するとサービストラフィック減少やキャッシュ接続問題の可能性があります。' },
  },
  // ── Connection Pool ──
  'conn-pool-avg-util': {
    ko: { title: '평균 사용률', description: '모든 커넥션 풀이 사용하고 있는 연결의 평균 비율입니다. 80%를 넘으면 연결이 부족해질 수 있으므로 풀 크기를 늘리거나 연결 사용 패턴을 최적화하세요.' },
    en: { title: 'Avg Utilization', description: 'The average percentage of connections in use across all connection pools. Above 80%, connections may run out, causing requests to wait. Consider increasing pool sizes or optimizing how connections are used.' },
    ja: { title: '平均使用率', description: 'すべてのコネクションプールが使用している接続の平均割合です。80%を超えると接続不足になる可能性があるため、プールサイズの拡大や接続使用パターンの最適化を検討してください。' },
  },
  'conn-pool-leak-suspects': {
    ko: { title: '누수 의심', description: '사용 후 반환되지 않는 커넥션(누수)이 의심되는 풀의 수입니다. 시간이 지남에 따라 사용 가능한 연결이 줄어들면 누수일 가능성이 높으므로, 해당 애플리케이션 코드를 점검하세요.' },
    en: { title: 'Leak Suspects', description: 'The number of connection pools where connections may not be properly returned after use (suspected leaks). Over time, available connections decrease. If a leak is suspected, inspect the application code that uses those pools.' },
    ja: { title: 'リーク疑い', description: '使用後に返却されないコネクション（リーク）が疑われるプールの数です。時間の経過とともに利用可能な接続が減少している場合はリークの可能性が高いため、該当アプリケーションコードを確認してください。' },
  },
  'conn-pool-waiting': {
    ko: { title: '대기 요청', description: '사용 가능한 커넥션이 없어 요청이 줄 서서 기다리고 있는 풀의 수입니다. 대기가 발생하면 서비스 응답이 느려지므로, 풀 크기를 늘리거나 커넥션 사용 시간을 줄여야 합니다.' },
    en: { title: 'Waiting Requests', description: 'The number of connection pools where requests are queued because no connections are available. This waiting directly slows service responses. Increase pool sizes or reduce connection hold times to alleviate the problem.' },
    ja: { title: '待機リクエスト', description: '利用可能なコネクションがなくリクエストが待ち行列に並んでいるプールの数です。待機が発生するとサービス応答が遅くなるため、プールサイズの拡大やコネクション使用時間の短縮が必要です。' },
  },
  // ── Message Queues ──
  'queue-total': {
    ko: { title: '전체 큐', description: '모니터링하고 있는 메시지 큐(Kafka, RabbitMQ 등)의 총 수입니다. 메시지 큐는 서비스 간 데이터를 비동기로 전달하는 통로이며, 모든 큐가 감시 대상에 포함되어 있는지 확인하세요.' },
    en: { title: 'Total Queues', description: 'The total number of message queues (Kafka, RabbitMQ, etc.) being monitored. Message queues enable asynchronous data transfer between services. Ensure all important queues are included in the monitoring scope.' },
    ja: { title: '全キュー', description: 'モニタリングしているメッセージキュー（Kafka、RabbitMQ等）の総数です。メッセージキューはサービス間のデータを非同期で受け渡す経路であり、すべてのキューが監視対象に含まれているか確認してください。' },
  },
  'queue-total-messages': {
    ko: { title: '전체 메시지', description: '모든 큐에 쌓여 있는 메시지의 총 수입니다. 이 숫자가 계속 늘어나면 소비자(Consumer)가 메시지를 처리하는 속도가 생산 속도를 못 따라가고 있다는 뜻입니다.' },
    en: { title: 'Total Messages', description: 'The total number of messages currently sitting in all queues. If this number keeps growing, consumers are not keeping up with the rate of incoming messages, which can lead to processing delays.' },
    ja: { title: '全メッセージ', description: 'すべてのキューに滞留しているメッセージの総数です。この数値が増え続ける場合は、コンシューマー（処理側）がメッセージの処理速度を生産速度に追いつけていないことを意味します。' },
  },
  'queue-throughput': {
    ko: { title: '처리량', description: '모든 큐에서 1초에 처리되는 메시지의 수입니다. 처리량이 급감하면 소비자에 장애가 있을 수 있고, 급증하면 시스템 부하가 높아질 수 있으므로 관련 서비스를 확인하세요.' },
    en: { title: 'Throughput', description: 'The total number of messages processed per second across all queues. A sudden drop may indicate consumer failures, while a sudden spike could overload downstream services. Check related services if throughput changes unexpectedly.' },
    ja: { title: 'スループット', description: 'すべてのキューで1秒間に処理されるメッセージの数です。処理量が急減するとコンシューマーに障害がある可能性があり、急増するとシステム負荷が高まるため関連サービスを確認してください。' },
  },
  'queue-consumer-lag': {
    ko: { title: '컨슈머 랙', description: '메시지를 소비하는 속도가 생산 속도를 따라잡지 못해 밀린 메시지의 수입니다. 이 숫자가 계속 증가하면 처리 지연이 심해지므로, 소비자를 늘리거나 처리 로직을 최적화하세요.' },
    en: { title: 'Consumer Lag', description: 'The total number of messages that consumers have fallen behind on across all queues. If this keeps increasing, processing delays are worsening. Add more consumers or optimize the processing logic to catch up.' },
    ja: { title: 'コンシューマーラグ', description: 'メッセージの消費速度が生産速度に追いつけず溜まったメッセージの数です。この数値が増加し続けると処理遅延が深刻化するため、コンシューマーの増加や処理ロジックの最適化を検討してください。' },
  },
  // ── Pipelines ──
  'pipeline-active': {
    ko: { title: '활성 파이프라인', description: '현재 운영 중인 데이터 처리 파이프라인의 수입니다. 파이프라인은 데이터를 수집, 변환, 저장하는 자동화된 흐름이며, 비활성 상태가 되면 데이터 갱신이 중단됩니다.' },
    en: { title: 'Active Pipelines', description: 'The number of data processing pipelines currently running. Pipelines automate the flow of collecting, transforming, and storing data. If a pipeline becomes inactive, data updates will stop for that flow.' },
    ja: { title: 'アクティブパイプライン', description: '現在稼働中のデータ処理パイプラインの数です。パイプラインはデータの収集・変換・保存を自動化した処理フローで、非アクティブになるとデータ更新が停止します。' },
  },
  'pipeline-running-tasks': {
    ko: { title: '실행 중 작업', description: '지금 데이터를 처리하고 있는 파이프라인 작업(태스크)의 수입니다. 평소보다 많으면 데이터 처리가 밀리고 있을 수 있고, 0이면 현재 예정된 작업이 없거나 모두 완료된 상태입니다.' },
    en: { title: 'Running Tasks', description: 'The number of pipeline tasks actively processing data right now. If this is higher than normal, tasks may be backing up. If it is zero, either no tasks are scheduled or all tasks have completed.' },
    ja: { title: '実行中タスク', description: '現在データを処理しているパイプラインタスクの数です。普段より多ければデータ処理が滞っている可能性があり、0であれば現在予定されたタスクがないかすべて完了した状態です。' },
  },
  'pipeline-success-rate': {
    ko: { title: '성공률', description: '파이프라인 작업이 오류 없이 완료된 비율입니다. 100%에 가까울수록 좋으며, 성공률이 낮으면 데이터 품질 문제나 외부 시스템 연결 오류가 반복되고 있을 수 있습니다.' },
    en: { title: 'Success Rate', description: 'The percentage of pipeline tasks that completed without errors. The closer to 100% the better. A low success rate may indicate recurring data quality issues or external system connection problems.' },
    ja: { title: '成功率', description: 'パイプラインタスクがエラーなく完了した割合です。100%に近いほど良好で、成功率が低い場合はデータ品質の問題や外部システム接続エラーが繰り返されている可能性があります。' },
  },
  'pipeline-avg-duration': {
    ko: { title: '평균 소요시간', description: '파이프라인 작업 하나가 시작부터 완료까지 걸리는 평균 시간입니다. 이 시간이 점점 길어지면 데이터 양이 늘었거나 처리 효율이 떨어진 것이므로 최적화를 검토하세요.' },
    en: { title: 'Avg Duration', description: 'The average time for a pipeline task to run from start to completion. If this is gradually increasing, data volume may be growing or processing efficiency may be declining. Review the pipeline for optimization opportunities.' },
    ja: { title: '平均所要時間', description: 'パイプラインタスク1件の開始から完了までにかかる平均時間です。この時間が徐々に長くなっている場合はデータ量の増加や処理効率の低下が考えられるため最適化を検討してください。' },
  },
  // ── Projects ──
  'project-services': {
    ko: { title: '서비스', description: '이 프로젝트에 포함된 서비스(애플리케이션)의 수입니다. 프로젝트 단위로 서비스를 묶어 관리하면 팀별이나 기능별로 모니터링 상황을 분리하여 파악할 수 있습니다.' },
    en: { title: 'Services', description: 'The number of services (applications) that belong to this project. Organizing services by project helps teams monitor their specific area of responsibility without noise from other teams.' },
    ja: { title: 'サービス', description: 'このプロジェクトに含まれるサービス（アプリケーション）の数です。プロジェクト単位でサービスをまとめて管理すると、チーム別や機能別にモニタリング状況を分けて把握できます。' },
  },
  'project-error-rate': {
    ko: { title: '에러율', description: '이 프로젝트에 속한 서비스들의 평균 오류 발생 비율입니다. 프로젝트 전체의 안정성을 나타내며, 특정 서비스에서 에러가 집중되면 평균이 올라가므로 상세 페이지에서 원인을 확인하세요.' },
    en: { title: 'Error Rate', description: 'The average error rate across all services in this project. It reflects the overall stability of the project. If a particular service has a high error rate, it will pull up the project average, so check the detail page for the cause.' },
    ja: { title: 'エラー率', description: 'このプロジェクトに属するサービスの平均エラー発生率です。プロジェクト全体の安定性を表し、特定のサービスでエラーが集中すると平均が上がるため詳細ページで原因を確認してください。' },
  },
  'project-p95-latency': {
    ko: { title: 'P95 응답시간', description: '이 프로젝트 서비스들의 요청 100건 중 95건이 이 시간 안에 응답하는 기준값입니다. 값이 커지면 프로젝트 내 서비스 전반이 느려지고 있다는 의미이므로 병목을 찾아 개선하세요.' },
    en: { title: 'P95 Latency', description: 'The P95 response time for services in this project, meaning 95 out of 100 requests complete within this time. If it increases, services in the project are generally slowing down and the bottleneck should be identified.' },
    ja: { title: 'P95レイテンシ', description: 'このプロジェクトのサービスでリクエスト100件中95件がこの時間内に応答する基準値です。値が大きくなっている場合はプロジェクト内サービス全般が遅くなっているためボトルネックを特定して改善してください。' },
  },
  'project-throughput': {
    ko: { title: '처리량', description: '이 프로젝트의 서비스들이 1초에 처리하는 요청 건수입니다. 프로젝트의 부하 수준을 파악하는 데 활용하며, 급격한 변화가 있으면 트래픽 이상을 의심할 수 있습니다.' },
    en: { title: 'Throughput', description: 'The number of requests per second handled by services in this project. Use this to gauge the project\'s load level. Sudden changes may indicate traffic anomalies that should be investigated.' },
    ja: { title: 'スループット', description: 'このプロジェクトのサービスが1秒間に処理するリクエスト件数です。プロジェクトの負荷レベルを把握するのに活用し、急激な変化がある場合はトラフィック異常を疑ってください。' },
  },
  'project-slo-compliance': {
    ko: { title: 'SLO 준수율', description: '이 프로젝트의 서비스 품질 목표(SLO) 달성률입니다. 99.5% 이상이면 양호하며, 이보다 낮으면 프로젝트 내 서비스의 성능이나 안정성에 개선이 필요합니다.' },
    en: { title: 'SLO Compliance', description: 'The SLO achievement rate for this project. Above 99.5% is the recommended target. If it falls below that, the services in this project need performance or stability improvements to meet their quality goals.' },
    ja: { title: 'SLO準拠率', description: 'このプロジェクトのサービス品質目標（SLO）達成率です。99.5%以上なら良好で、それより低い場合はプロジェクト内サービスの性能や安定性に改善が必要です。' },
  },
  // ── RUM (Real User Monitoring) ──
  'rum-avg-lcp': {
    ko: { title: '평균 LCP', description: '웹 페이지에서 가장 큰 콘텐츠(이미지, 텍스트 등)가 화면에 나타나기까지 걸리는 평균 시간입니다. 2.5초 이내면 양호하며, 이보다 느리면 사용자가 페이지 로딩이 느리다고 느낍니다.' },
    en: { title: 'Avg LCP', description: 'The average time for the largest content element (image, text block, etc.) to appear on the page. Under 2.5 seconds is good. Slower than that means users perceive the page as loading slowly and optimizations are needed.' },
    ja: { title: '平均LCP', description: 'Webページで最も大きなコンテンツ（画像やテキスト等）が画面に表示されるまでの平均時間です。2.5秒以内なら良好で、それより遅いとユーザーがページの読み込みが遅いと感じます。' },
  },
  'rum-avg-fid': {
    ko: { title: '평균 FID', description: '사용자가 버튼 클릭 등 첫 번째 조작을 했을 때 브라우저가 반응하기까지의 지연 시간입니다. 100ms 이내면 즉각적으로 느껴지고, 이보다 길면 "클릭해도 반응이 없다"고 느낄 수 있습니다.' },
    en: { title: 'Avg FID', description: 'The average delay between a user\'s first interaction (like a button click) and the browser\'s response. Under 100ms feels instant. Longer delays make users feel like the page is unresponsive or broken.' },
    ja: { title: '平均FID', description: 'ユーザーがボタンクリックなど最初の操作を行った際に、ブラウザが反応するまでの遅延時間です。100ms以内なら即座に反応したと感じ、それより長いと「クリックしても反応しない」と思われる可能性があります。' },
  },
  'rum-avg-cls': {
    ko: { title: '평균 CLS', description: '페이지 로딩 중 화면 요소가 갑자기 이동하는(레이아웃 밀림) 정도를 나타내는 점수입니다. 0.1 이하면 안정적이고, 이보다 높으면 사용자가 의도치 않은 곳을 클릭하게 되는 불편함이 있습니다.' },
    en: { title: 'Avg CLS', description: 'A score measuring how much page elements shift unexpectedly during loading. Under 0.1 is stable. Higher values mean elements jump around, potentially causing users to click the wrong thing accidentally.' },
    ja: { title: '平均CLS', description: 'ページ読み込み中に画面要素が突然移動する（レイアウトのずれ）程度を示すスコアです。0.1以下なら安定的で、それより高いとユーザーが意図しない場所をクリックしてしまう不便さがあります。' },
  },
  'rum-total-sessions': {
    ko: { title: '전체 세션', description: '모든 지역에서 웹사이트를 방문한 사용자 세션의 총 수입니다. 세션 수가 많을수록 웹사이트 이용이 활발하며, 특정 지역에서 세션이 적으면 해당 지역의 접속 문제를 의심해 볼 수 있습니다.' },
    en: { title: 'Total Sessions', description: 'The total number of user visits (sessions) to the website across all regions. Higher numbers mean more active usage. If sessions are low in a specific region, there may be an access issue for users in that area.' },
    ja: { title: '全セッション', description: 'すべての地域からWebサイトを訪問したユーザーセッションの総数です。セッション数が多いほどWebサイトの利用が活発で、特定地域でセッションが少ない場合はその地域のアクセス問題を疑ってみてください。' },
  },
  // ── .NET Runtime ──
  'dotnet-threadpool-starvation': {
    ko: { title: 'ThreadPool 기아 이벤트', description: '.NET 애플리케이션에서 스레드가 부족하여 작업을 처리하지 못한 횟수입니다. 이 이벤트가 발생하면 요청 처리가 지연되므로, 비동기 코드 사용이나 스레드 풀 크기 조정을 검토하세요.' },
    en: { title: 'ThreadPool Starvation Events', description: 'The number of times the .NET ThreadPool ran out of available threads to process requests. When this happens, request processing is delayed. Review your code for blocking calls and convert them to async patterns.' },
    ja: { title: 'ThreadPoolスターベーション', description: '.NETアプリケーションでスレッドが不足してタスクを処理できなかった回数です。このイベントが発生するとリクエスト処理が遅延するため、非同期コードの活用やスレッドプールサイズの調整を検討してください。' },
  },
  'dotnet-gc-suspension': {
    ko: { title: 'GC 일시정지 시간', description: '.NET이 메모리를 정리(가비지 컬렉션)할 때 애플리케이션이 잠시 멈추는 평균 시간입니다. 이 시간이 길면 사용자가 순간적인 끊김을 느낄 수 있으므로, 메모리 사용 패턴 최적화가 필요합니다.' },
    en: { title: 'GC Suspension Time', description: 'The average time the .NET application pauses for garbage collection (memory cleanup). Long pauses can cause momentary freezes that users notice. Optimize memory allocation patterns to reduce GC impact.' },
    ja: { title: 'GCサスペンション時間', description: '.NETがメモリ整理（ガベージコレクション）時にアプリケーションが一時停止する平均時間です。この時間が長いとユーザーが瞬間的な途切れを感じる可能性があるため、メモリ使用パターンの最適化が必要です。' },
  },
  'dotnet-avg-heap': {
    ko: { title: '평균 힙 크기', description: '.NET 애플리케이션이 사용하는 메모리 영역(힙)의 평균 크기(MB)입니다. 계속 커지면 메모리 누수가 있을 수 있고, 서버 메모리 한계에 가까워지면 성능 저하나 충돌이 발생할 수 있습니다.' },
    en: { title: 'Avg Heap Size', description: 'The average size (in MB) of the memory area used by .NET applications. If this keeps growing over time, there may be a memory leak. Approaching the server\'s memory limit can cause performance degradation or crashes.' },
    ja: { title: '平均ヒープサイズ', description: '.NETアプリケーションが使用するメモリ領域（ヒープ）の平均サイズ（MB）です。増え続けるとメモリリークの可能性があり、サーバーメモリの限界に近づくと性能低下やクラッシュが発生する恐れがあります。' },
  },
  'dotnet-aot-warnings': {
    ko: { title: 'AOT 경고', description: '.NET Native AOT 컴파일 시 발생하는 호환성 경고의 수입니다. 리플렉션이나 동적 코드를 사용하는 부분에서 경고가 나오며, 무시하면 런타임에 오류가 발생할 수 있으므로 코드를 수정하세요.' },
    en: { title: 'AOT Warnings', description: 'The number of compatibility warnings for .NET Native AOT compilation. These typically involve reflection or dynamic code that may fail at runtime. Address these warnings in your code to prevent runtime errors.' },
    ja: { title: 'AOT警告', description: '.NET Native AOTコンパイル時に発生する互換性警告の数です。リフレクションや動的コードを使用する箇所で警告が出ており、無視するとランタイムエラーが発生する可能性があるためコードを修正してください。' },
  },
  // ── Go Runtime ──
  'go-sched-latency-p95': {
    ko: { title: '스케줄러 지연 P95', description: 'Go 언어의 작업 스케줄러가 고루틴을 실행하기까지 대기하는 시간의 상위 95% 값(마이크로초)입니다. 이 값이 크면 CPU가 바빠서 작업 시작이 지연되고 있다는 의미입니다.' },
    en: { title: 'Sched Latency P95', description: 'The 95th percentile wait time (in microseconds) before the Go scheduler runs a goroutine. A high value means the CPU is too busy and goroutines are waiting to start. This can lead to increased response times.' },
    ja: { title: 'スケジューラレイテンシP95', description: 'Go言語のスケジューラがゴルーチンを実行するまでの待ち時間の上位95%値（マイクロ秒）です。この値が大きいとCPUが忙しくてタスクの開始が遅延していることを意味します。' },
  },
  'go-gc-stw-pause': {
    ko: { title: 'GC STW 일시정지', description: 'Go가 메모리 정리(가비지 컬렉션) 시 모든 작업을 일시 멈추는 평균 시간(마이크로초)입니다. 일반적으로 매우 짧지만, 길어지면 순간적인 응답 지연이 발생할 수 있습니다.' },
    en: { title: 'GC STW Pause', description: 'The average time (in microseconds) that Go pauses all work during garbage collection. This is normally very short, but if it grows, it can cause momentary response delays. Optimize memory allocation patterns to keep pauses minimal.' },
    ja: { title: 'GC STWポーズ', description: 'Goがメモリ整理（GC）時にすべての処理を一時停止する平均時間（マイクロ秒）です。通常は非常に短いですが、長くなると瞬間的な応答遅延が発生する可能性があります。' },
  },
  'go-total-goroutines': {
    ko: { title: '전체 고루틴', description: 'Go 애플리케이션에서 동시에 실행되는 작업 단위(고루틴)의 총 수입니다. 고루틴은 가벼운 스레드로 많이 생성해도 되지만, 급격히 늘어나면 메모리 사용량 증가와 함께 리소스 누수를 의심하세요.' },
    en: { title: 'Total Goroutines', description: 'The total number of goroutines (lightweight concurrent workers) running across all Go applications. Goroutines are cheap to create, but a rapid increase may indicate resource leaks or unfinished work piling up.' },
    ja: { title: '全ゴルーチン', description: 'Goアプリケーションで同時に実行されているタスク単位（ゴルーチン）の総数です。ゴルーチンは軽量なスレッドで多数生成しても問題ありませんが、急増する場合はメモリ増加とリソースリークを疑ってください。' },
  },
  'go-heap-alloc': {
    ko: { title: '힙 할당', description: 'Go 애플리케이션이 사용하고 있는 힙 메모리의 총량입니다. 계속 증가하면 메모리 누수가 있을 수 있으며, 메모리가 부족해지면 성능 저하와 함께 서비스 불안정으로 이어질 수 있습니다.' },
    en: { title: 'Heap Alloc', description: 'The total heap memory used by all Go applications. If this keeps growing, there may be a memory leak. Running out of memory can cause performance degradation and service instability, so monitor the trend closely.' },
    ja: { title: 'ヒープ割り当て', description: 'Goアプリケーションが使用しているヒープメモリの総量です。増加し続けるとメモリリークの可能性があり、メモリ不足になると性能低下やサービス不安定につながります。' },
  },
  // ── Python Runtime ──
  'python-gil-contention': {
    ko: { title: 'GIL 경합 / FT 활용률', description: 'Python의 동시 실행 제한(GIL)으로 인해 스레드가 대기하는 비율, 또는 GIL 없는 Free-Threaded 모드의 활용률입니다. GIL 경합이 높으면 멀티스레드 성능이 저하되므로 비동기 처리를 고려하세요.' },
    en: { title: 'GIL Contention / FT Utilization', description: 'The rate at which Python threads wait due to the Global Interpreter Lock (GIL), or the utilization of Free-Threaded mode if GIL is disabled. High GIL contention limits multi-thread performance. Consider using async patterns or multiprocessing instead.' },
    ja: { title: 'GIL競合 / FT活用率', description: 'Pythonの同時実行制限（GIL）によりスレッドが待機する割合、またはGILなしのFree-Threadedモード活用率です。GIL競合が高いとマルチスレッド性能が低下するため非同期処理を検討してください。' },
  },
  'python-active-threads': {
    ko: { title: '활성 스레드', description: '모든 Python 애플리케이션에서 현재 작업을 수행 중인 스레드의 수입니다. GIL이 있는 Python에서는 스레드가 많아도 실제 동시 실행은 제한되므로, 스레드 수보다 비동기 처리가 효율적입니다.' },
    en: { title: 'Active Threads', description: 'The total number of active threads across all Python applications. Due to the GIL, having many threads does not guarantee parallel execution in Python. Async programming is often more efficient for concurrent workloads.' },
    ja: { title: 'アクティブスレッド', description: 'すべてのPythonアプリケーションで現在処理を実行中のスレッドの数です。GILがあるPythonではスレッドが多くても実際の同時実行は制限されるため、スレッド数より非同期処理の方が効率的です。' },
  },
  'python-asyncio-pending': {
    ko: { title: 'Asyncio 대기 태스크', description: 'Python 비동기 프레임워크(asyncio)에서 실행을 기다리고 있는 작업의 수입니다. 대기 태스크가 계속 쌓이면 이벤트 루프가 과부하 상태이므로, 처리 로직 최적화나 워커 추가를 검토하세요.' },
    en: { title: 'Asyncio Pending Tasks', description: 'The number of async tasks waiting to execute in Python\'s asyncio event loop. If pending tasks keep accumulating, the event loop is overloaded. Consider optimizing the processing logic or adding more workers.' },
    ja: { title: 'Asyncio待機タスク', description: 'Python非同期フレームワーク（asyncio）で実行を待っているタスクの数です。待機タスクが溜まり続ける場合はイベントループが過負荷状態のため、処理ロジックの最適化やワーカー追加を検討してください。' },
  },
  'python-gc-pause': {
    ko: { title: 'GC 일시정지 (평균)', description: 'Python이 메모리를 정리(가비지 컬렉션)할 때 발생하는 일시 정지의 평균 시간(밀리초)입니다. 이 시간이 길면 응답 지연의 원인이 될 수 있으며, 객체 생성을 줄이거나 GC 설정을 조정하세요.' },
    en: { title: 'GC Total Pause (avg)', description: 'The average time Python spends paused for garbage collection (memory cleanup) per agent. Long pauses can cause response delays. Reducing object creation or tuning GC settings can help minimize this overhead.' },
    ja: { title: 'GCポーズ(平均)', description: 'Pythonがメモリ整理（GC）時に発生する一時停止の平均時間（ミリ秒）です。この時間が長いと応答遅延の原因になる可能性があり、オブジェクト生成の削減やGC設定の調整を検討してください。' },
  },
  // ── Service Detail ──
  'svc-latency-p95': {
    ko: { title: '지연시간 (P95)', description: '이 서비스의 요청 100건 중 95건이 이 시간 안에 응답하는 값입니다. 값이 갑자기 커지면 서비스가 느려지고 있다는 신호이므로 원인(DB 쿼리, 외부 API 등)을 확인하세요.' },
    en: { title: 'Latency (P95)', description: 'The P95 response time for this specific service, meaning 95 out of 100 requests finish within this time. If it suddenly increases, the service is slowing down. Check common causes like database queries, external API calls, or resource limits.' },
    ja: { title: 'レイテンシ(P95)', description: 'このサービスのリクエスト100件中95件がこの時間内に応答する値です。値が急に大きくなった場合はサービスが遅くなっているサインなので、原因（DBクエリ、外部API等）を確認してください。' },
  },
  'svc-traffic': {
    ko: { title: '트래픽', description: '이 서비스가 1분 동안 받는 요청의 수입니다. 트래픽 변화를 통해 서비스 이용 패턴을 파악할 수 있으며, 급증 시 서버 자원이 충분한지 확인하세요.' },
    en: { title: 'Traffic', description: 'The number of requests this service receives per minute. Use this to understand usage patterns and detect traffic surges. If traffic spikes unexpectedly, verify the server has enough resources to handle the load.' },
    ja: { title: 'トラフィック', description: 'このサービスが1分間に受けるリクエストの数です。トラフィックの変化からサービス利用パターンを把握でき、急増時はサーバーリソースが十分か確認してください。' },
  },
  'svc-error-rate': {
    ko: { title: '에러율', description: '이 서비스에서 오류가 발생한 요청의 비율입니다. 0에 가까울수록 좋으며, 올라가기 시작하면 배포 직후 버그나 외부 의존성 장애일 수 있으므로 최근 변경 사항을 확인하세요.' },
    en: { title: 'Error Rate', description: 'The percentage of requests to this service that returned errors. The closer to zero the better. If it starts rising, it could be a recent deployment bug or a downstream dependency failure. Check recent changes first.' },
    ja: { title: 'エラー率', description: 'このサービスでエラーが発生したリクエストの割合です。0に近いほど良好で、上昇し始めたらデプロイ直後のバグや外部依存先の障害の可能性があるため最近の変更点を確認してください。' },
  },
  'svc-saturation': {
    ko: { title: '포화도', description: '이 서비스가 사용하는 CPU, 메모리, GPU 자원의 사용 정도입니다. 포화도가 높으면 추가 요청을 감당하기 어려운 상태이므로, 서버 자원을 늘리거나 부하를 분산해야 합니다.' },
    en: { title: 'Saturation', description: 'How much CPU, memory, and GPU capacity this service is consuming. High saturation means the service has little room for additional requests. Consider scaling resources or distributing the workload to prevent degradation.' },
    ja: { title: '飽和度', description: 'このサービスが使用するCPU、メモリ、GPUリソースの使用度合いです。飽和度が高いと追加リクエストを処理しきれない状態のため、サーバーリソースの増強や負荷分散が必要です。' },
  },
  // ── Topology ──
  'topo-total-services': {
    ko: { title: '전체 서비스', description: '네트워크 트래픽을 분석하여 자동으로 발견된 서비스의 총 수입니다. 수동 등록 없이도 새로운 서비스가 감지되며, 예상보다 많거나 적으면 네트워크 설정을 확인하세요.' },
    en: { title: 'Total Services', description: 'The total number of services discovered automatically by analyzing network traffic. New services are detected without manual registration. If the count is higher or lower than expected, review the network configuration.' },
    ja: { title: '全サービス', description: 'ネットワークトラフィックを分析して自動的に検出されたサービスの総数です。手動登録なしでも新しいサービスが検知され、予想より多いまたは少ない場合はネットワーク設定を確認してください。' },
  },
  'topo-active-connections': {
    ko: { title: '활성 연결', description: '현재 서비스들 사이에 실제로 통신이 오가고 있는 연결의 수입니다. 연결이 갑자기 줄어들면 일부 서비스가 중단되었을 수 있고, 새 연결이 늘면 서비스 구조가 변경된 것일 수 있습니다.' },
    en: { title: 'Active Connections', description: 'The number of connections currently carrying traffic between services. A sudden decrease may mean some services have stopped, while new connections appearing could indicate changes in the service architecture.' },
    ja: { title: 'アクティブ接続', description: '現在サービス間で実際に通信が行われている接続の数です。接続が急に減った場合は一部のサービスが停止した可能性があり、新しい接続が増えた場合はサービス構成が変更された可能性があります。' },
  },
  'topo-new-24h': {
    ko: { title: '신규 (24h)', description: '지난 24시간 동안 새로 발견된 서비스 간 연결의 수입니다. 새 서비스가 배포되었거나 기존 서비스의 호출 패턴이 변경된 것을 나타내며, 예상치 못한 연결이 있는지 확인하세요.' },
    en: { title: 'New (24h)', description: 'The number of new service-to-service connections discovered in the past 24 hours. This could mean a new service was deployed or existing call patterns changed. Verify any unexpected connections are intentional.' },
    ja: { title: '新規(24h)', description: '過去24時間に新たに発見されたサービス間接続の数です。新しいサービスがデプロイされたか、既存サービスの呼び出しパターンが変わったことを示し、想定外の接続がないか確認してください。' },
  },
  'topo-removed-24h': {
    ko: { title: '제거됨 (24h)', description: '지난 24시간 동안 더 이상 통신이 없어진 연결의 수입니다. 서비스가 종료되었거나 연결 구조가 변경된 것이며, 의도하지 않은 연결 끊김이 있으면 해당 서비스를 확인하세요.' },
    en: { title: 'Removed (24h)', description: 'The number of connections that went silent in the past 24 hours. A service may have been shut down or the connection pattern changed. If the removal was unintended, check the affected services for issues.' },
    ja: { title: '削除(24h)', description: '過去24時間に通信がなくなった接続の数です。サービスが終了したか接続構成が変更されたことを示し、意図しない接続断がある場合は該当サービスを確認してください。' },
  },
  'thread-vt-blocked': {
    ko: { title: 'VT 블록', description: '현재 다른 작업이 끝나기를 기다리며 멈춰 있는 가상 스레드의 수입니다. 블록된 스레드가 많으면 동기식 I/O나 잠금 경합이 원인일 수 있으므로 코드를 점검하세요.' },
    en: { title: 'VT Blocked', description: 'The number of virtual threads currently waiting for another operation to finish. High numbers of blocked threads can indicate synchronous I/O or lock contention in the code. Review the blocking paths and refactor to reduce waits.' },
    ja: { title: 'VTブロック', description: '他の処理の完了を待って停止している仮想スレッドの数です。ブロックされたスレッドが多い場合は同期式I/Oやロック競合が原因の可能性があるためコードを確認してください。' },
  },
  // ── Chart / Widget Help IDs ──
  'chart-response-time': {
    ko: { title: '응답 시간', description: '서비스 응답 시간의 변화를 시간대별로 보여주는 차트입니다. P50(중간값)과 P95(상위 5% 제외) 선이 함께 표시되어 일반 사용자와 느린 사용자의 경험을 동시에 파악할 수 있습니다.' },
    en: { title: 'Response Time', description: 'A trend chart showing P50 (median) and P95 response times over time. P50 represents the typical user experience, while P95 captures the slower requests. Together they help you understand both average and worst-case performance.' },
    ja: { title: '応答時間', description: 'サービス応答時間の変化を時間帯別に表示するチャートです。P50（中央値）とP95（上位5%を除く）の2本線で、一般ユーザーと遅いユーザーの体験を同時に把握できます。' },
  },
  'chart-throughput': {
    ko: { title: '처리량 (RPM)', description: '서비스가 1분마다 처리하는 요청 수의 변화를 보여주는 차트입니다. 피크 시간대의 처리량을 파악하고, 급격한 변화가 있으면 트래픽 이상이나 서비스 장애를 의심할 수 있습니다.' },
    en: { title: 'Throughput (RPM)', description: 'A chart showing how many requests per minute the service handles over time. Use it to identify peak traffic hours and spot sudden changes that could indicate a traffic anomaly or a service problem.' },
    ja: { title: 'スループット(RPM)', description: 'サービスが1分ごとに処理するリクエスト数の変化を表示するチャートです。ピーク時間帯の処理量を把握し、急激な変化がある場合はトラフィック異常やサービス障害を疑ってください。' },
  },
  'map-service-health': {
    ko: { title: '서비스 헬스 맵', description: '모든 서비스와 호스트의 상태를 격자 형태로 한눈에 보여주는 맵입니다. 초록은 정상, 노랑은 경고, 빨강은 위험을 의미하며, 빨간 영역이 있으면 즉시 해당 항목을 확인하세요.' },
    en: { title: 'Service Health Map', description: 'A grid-style map that shows the health status of all services and hosts at a glance. Green means healthy, yellow means warning, red means critical. If any red areas appear, investigate those items immediately.' },
    ja: { title: 'サービスヘルスマップ', description: 'すべてのサービスとホストの状態をグリッド形式で一目で表示するマップです。緑は正常、黄は警告、赤は危険を意味し、赤い領域がある場合は即座に該当項目を確認してください。' },
  },
  'chart-ai-services-summary': {
    ko: { title: 'AI 서비스 요약', description: 'AI 서비스의 핵심 지표 4가지를 한눈에 보여주는 요약 카드입니다. 첫 응답 시간(TTFT), 토큰 생성 속도(TPS), GPU 메모리(VRAM), 비용을 확인하여 AI 서비스의 전체 상태를 빠르게 파악하세요.' },
    en: { title: 'AI Services Summary', description: 'A summary card showing the four most important AI service metrics: first response time (TTFT), token generation speed (TPS), GPU memory (VRAM), and cost. Use it to quickly assess the overall state of AI services.' },
    ja: { title: 'AIサービスサマリー', description: 'AIサービスの重要指標4つを一目で確認できるサマリーカードです。初回応答時間（TTFT）、トークン生成速度（TPS）、GPUメモリ（VRAM）、コストを確認してAIサービスの全体状態を素早く把握してください。' },
  },
  'chart-svc-latency': {
    ko: { title: '지연시간', description: '이 서비스의 응답시간을 3가지 기준(P50, P95, P99)으로 보여주는 추이 차트입니다. P99은 가장 느린 1%의 요청을 나타내므로, P99이 급등하면 일부 사용자에게 심각한 지연이 발생하고 있는 것입니다.' },
    en: { title: 'Latency', description: 'A trend chart showing this service\'s response times at three levels: P50 (median), P95, and P99 (slowest 1%). If P99 spikes while P50 stays steady, a small subset of users is experiencing severe delays.' },
    ja: { title: 'レイテンシ', description: 'このサービスの応答時間をP50、P95、P99の3基準で表示する推移チャートです。P99は最も遅い1%のリクエストを示すため、P99が急上昇した場合は一部のユーザーに深刻な遅延が発生しています。' },
  },
  'chart-svc-traffic': {
    ko: { title: '트래픽 (RPM)', description: '이 서비스가 시간대별로 받는 요청 수(분당)의 변화 차트입니다. 트래픽 패턴을 통해 피크 시간대를 파악하고, 비정상적인 급증이나 급감을 조기에 발견할 수 있습니다.' },
    en: { title: 'Traffic (RPM)', description: 'A chart showing how this service\'s request volume (per minute) changes over time. Use it to identify peak hours and spot abnormal surges or drops that might signal issues early.' },
    ja: { title: 'トラフィック(RPM)', description: 'このサービスが時間帯別に受けるリクエスト数（分間）の変化チャートです。トラフィックパターンからピーク時間帯を把握し、異常な急増・急減を早期に発見できます。' },
  },
  'chart-svc-error-rate': {
    ko: { title: '에러율', description: '이 서비스에서 시간대별 오류 발생 비율의 변화를 보여주는 차트입니다. 특정 시점에 에러가 급증했다면 그 시간에 배포나 설정 변경이 있었는지 확인하여 원인을 파악하세요.' },
    en: { title: 'Error Rate', description: 'A chart showing how this service\'s error rate changes over time. If errors spike at a specific point, check what happened then (deployments, config changes, etc.) to pinpoint the root cause.' },
    ja: { title: 'エラー率', description: 'このサービスの時間帯別エラー発生率の変化を表示するチャートです。特定時点でエラーが急増した場合は、その時間にデプロイや設定変更があったか確認して原因を特定してください。' },
  },
  'chart-xlog-scatter': {
    ko: { title: 'XLog 산점도', description: '각 요청의 응답시간을 점으로 찍어 보여주는 차트입니다. 대부분의 점이 아래쪽에 모여 있으면 정상이고, 위쪽에 흩어진 점이 많으면 느린 요청이 많다는 뜻입니다. 점을 클릭하면 상세 정보를 볼 수 있습니다.' },
    en: { title: 'XLog Scatter', description: 'A scatter plot where each dot represents one request and its response time. Most dots near the bottom means performance is normal. Dots scattered high up indicate slow requests. Click a dot to see its detailed trace information.' },
    ja: { title: 'XLog散布図', description: '各リクエストの応答時間を点で表示するチャートです。ほとんどの点が下部に集中していれば正常で、上部に散らばった点が多い場合は遅いリクエストが多いことを意味します。点をクリックすると詳細情報を確認できます。' },
  },
  'chart-heatmap': {
    ko: { title: '응답시간 HeatMap', description: '시간대별 응답시간의 분포를 색상 농도로 보여주는 차트입니다. 색이 진할수록 해당 응답시간 구간에 요청이 많다는 뜻이며, 특정 시간대에 느린 구간이 진해지면 성능 문제를 의심하세요.' },
    en: { title: 'Response Time HeatMap', description: 'A heatmap showing response time distribution using color intensity. Darker areas mean more requests fell in that response time range. If slower ranges get darker at certain times, it signals a performance issue during those periods.' },
    ja: { title: '応答時間ヒートマップ', description: '時間帯別の応答時間分布を色の濃さで表示するチャートです。色が濃いほどその応答時間帯にリクエストが多いことを意味し、特定時間帯で遅い区間が濃くなった場合は性能問題を疑ってください。' },
  },
  'chart-cpu-usage': {
    ko: { title: 'CPU 사용률', description: 'CPU 사용률의 시간별 변화를 원인별로 구분하여 보여주는 차트입니다. User(애플리케이션), System(운영체제), IOWait(디스크 대기)로 나뉘어 어디서 부하가 발생하는지 파악할 수 있습니다.' },
    en: { title: 'CPU Usage', description: 'A trend chart showing CPU utilization over time, broken down by User (application), System (OS), and IOWait (disk). This breakdown helps you pinpoint whether the load is coming from application code, system overhead, or disk bottlenecks.' },
    ja: { title: 'CPU使用率', description: 'CPU使用率の時間別変化を原因別に区分して表示するチャートです。User（アプリケーション）、System（OS）、IOWait（ディスク待ち）に分かれ、どこで負荷が発生しているか把握できます。' },
  },
  'chart-memory-usage': {
    ko: { title: '메모리 사용률', description: '메모리 사용량의 시간별 변화를 보여주는 차트입니다. 실제 사용 중인 영역과 캐시 영역이 구분되며, 사용량이 꾸준히 올라가면 메모리 누수를 의심해 볼 수 있습니다.' },
    en: { title: 'Memory Usage', description: 'A trend chart showing memory usage over time, split into Used (actively occupied) and Cached regions. If the Used portion steadily climbs without dropping, it may indicate a memory leak that needs investigation.' },
    ja: { title: 'メモリ使用率', description: 'メモリ使用量の時間別変化を表示するチャートです。実際に使用中の領域とキャッシュ領域が区分され、使用量が着実に上昇し続ける場合はメモリリークを疑ってみてください。' },
  },
  'chart-disk-usage': {
    ko: { title: '디스크 사용량', description: '각 디스크(파티션)별 사용량을 보여줍니다. 어떤 디스크가 가득 차고 있는지 한눈에 확인할 수 있으며, 85%를 넘는 디스크가 있으면 파일 정리나 용량 확장을 계획하세요.' },
    en: { title: 'Disk Usage', description: 'Shows how much space each disk partition is using. This helps you see which disks are filling up. If any partition is above 85%, plan file cleanup or capacity expansion before it becomes critical.' },
    ja: { title: 'ディスク使用量', description: '各ディスク（パーティション）別の使用量を表示します。どのディスクが満杯に近づいているか一目で確認でき、85%を超えるディスクがある場合はファイル整理や容量拡張を計画してください。' },
  },
  'chart-network-io': {
    ko: { title: '네트워크 I/O', description: '서버가 주고받는 네트워크 데이터의 시간별 변화 차트입니다. 수신(RX)과 송신(TX)이 함께 표시되며, 갑작스러운 트래픽 증가가 있으면 비정상 접근이나 대량 데이터 전송을 확인하세요.' },
    en: { title: 'Network I/O', description: 'A trend chart showing incoming (RX) and outgoing (TX) network traffic over time. Use it to spot sudden traffic spikes that could indicate abnormal access patterns or large data transfers that need attention.' },
    ja: { title: 'ネットワークI/O', description: 'サーバーが送受信するネットワークデータの時間別変化チャートです。受信（RX）と送信（TX）が表示され、突然のトラフィック増加がある場合は不正アクセスや大量データ転送を確認してください。' },
  },
  'table-thread-pools': {
    ko: { title: '스레드 풀', description: '애플리케이션의 스레드 풀 상태를 보여주는 테이블입니다. 활성 스레드 수, 대기 중인 작업, 사용률을 확인하여 스레드가 부족하지 않은지, 대기열이 쌓이지 않는지 점검하세요.' },
    en: { title: 'Thread Pools', description: 'A table showing the state of application thread pools: active thread count, queued tasks, and utilization. Check that threads are not maxed out and that the task queue is not growing, which would indicate resource pressure.' },
    ja: { title: 'スレッドプール', description: 'アプリケーションのスレッドプール状態を表示するテーブルです。アクティブスレッド数、待機中のタスク、使用率を確認して、スレッド不足やキュー滞留がないか点検してください。' },
  },
  'table-connection-pools': {
    ko: { title: '커넥션 풀', description: '데이터베이스 연결 풀의 상태를 보여주는 테이블입니다. 사용 중인 연결, 유휴 연결, 누수 의심 여부를 확인할 수 있으며, 사용률이 높거나 누수가 감지되면 즉시 조치가 필요합니다.' },
    en: { title: 'Connection Pools', description: 'A table showing database connection pool status: active connections, idle connections, and leak detection. If utilization is high or leaks are detected, take immediate action to prevent service disruptions.' },
    ja: { title: 'コネクションプール', description: 'データベース接続プールの状態を表示するテーブルです。使用中の接続、アイドル接続、リーク疑いの有無を確認でき、使用率が高いかリークが検出された場合は即座に対処が必要です。' },
  },
  'chart-event-loop': {
    ko: { title: '이벤트 루프', description: 'Node.js의 이벤트 루프 지연 시간과 처리 중인 작업 수를 보여줍니다. 이벤트 루프가 밀리면 모든 요청이 느려지므로, 지연이 커지면 무거운 동기 작업이 루프를 막고 있는지 확인하세요.' },
    en: { title: 'Event Loop', description: 'Shows the Node.js event loop delay and the number of active handles and requests. If the event loop falls behind, all requests slow down. Check for heavy synchronous operations that may be blocking the loop.' },
    ja: { title: 'イベントループ', description: 'Node.jsのイベントループ遅延時間と処理中のタスク数を表示します。イベントループが詰まるとすべてのリクエストが遅くなるため、遅延が大きくなった場合は重い同期処理がループをブロックしていないか確認してください。' },
  },
  'chart-goroutines': {
    ko: { title: '고루틴', description: 'Go 애플리케이션에서 동시에 실행 중인 고루틴의 수를 시간별로 보여주는 차트입니다. 고루틴이 계속 늘어나기만 하면 완료되지 않는 작업이 쌓이고 있을 수 있으므로 점검하세요.' },
    en: { title: 'Goroutines', description: 'A chart showing the number of active goroutines in Go applications over time. If the count keeps rising without leveling off, tasks may be piling up without completing. Investigate for potential goroutine leaks.' },
    ja: { title: 'ゴルーチン', description: 'Goアプリケーションで同時実行中のゴルーチン数を時間別に表示するチャートです。ゴルーチンが増え続けるだけの場合は完了しないタスクが蓄積されている可能性があるため確認してください。' },
  },
  'chart-workers': {
    ko: { title: '워커', description: 'Python 웹 서버(Gunicorn 등)의 워커 프로세스 현황을 보여줍니다. 현재 활성 워커 수와 최대 수가 표시되며, 활성 수가 최대에 가까우면 요청을 더 받기 어려우므로 워커 수 증설을 검토하세요.' },
    en: { title: 'Workers', description: 'Shows the current and maximum worker process counts for Python web servers (Gunicorn, etc.). If active workers are near the maximum, the server cannot accept more requests. Consider increasing the worker count.' },
    ja: { title: 'ワーカー', description: 'Python Webサーバー（Gunicorn等）のワーカープロセス現況を表示します。現在のアクティブ数と最大数が表示され、アクティブ数が最大に近い場合はリクエストを追加で受け付けにくいためワーカー増設を検討してください。' },
  },
  'chart-ttft-trend': {
    ko: { title: 'TTFT 추이', description: 'AI의 첫 응답까지 걸리는 시간의 변화를 P50(중간값)과 P95(느린 쪽) 두 기준으로 보여주는 차트입니다. P95가 갑자기 올라가면 일부 사용자가 오래 기다리고 있다는 뜻입니다.' },
    en: { title: 'TTFT Trend', description: 'A trend chart showing the AI\'s time to first response at P50 (median) and P95 (slow end). If P95 suddenly rises, some users are experiencing long waits before the AI starts producing output.' },
    ja: { title: 'TTFT推移', description: 'AIの初回応答までの時間の変化をP50（中央値）とP95（遅い側）の2基準で表示するチャートです。P95が急上昇した場合は一部のユーザーが長く待たされていることを意味します。' },
  },
  'chart-tps-trend': {
    ko: { title: 'TPS 추이', description: 'AI가 1초에 생성하는 토큰 수의 시간별 변화를 보여주는 차트입니다. 속도가 떨어지면 GPU 부하가 높거나 모델 서버에 문제가 있을 수 있으므로 확인하세요.' },
    en: { title: 'TPS Trend', description: 'A chart showing how many tokens the AI generates per second over time. If the speed drops, the GPU may be under heavy load or the model server may have an issue that needs checking.' },
    ja: { title: 'TPS推移', description: 'AIが1秒間に生成するトークン数の時間別変化を表示するチャートです。速度が低下した場合はGPU負荷が高いかモデルサーバーに問題がある可能性があるため確認してください。' },
  },
  'chart-vram-usage': {
    ko: { title: 'VRAM 사용량 추이', description: 'GPU 전용 메모리(VRAM)의 사용률 변화를 시간대별로 보여주는 차트입니다. 사용률이 90%에 가까워지면 메모리 부족으로 AI 연산이 중단될 위험이 있습니다.' },
    en: { title: 'VRAM Usage Trend', description: 'A chart tracking GPU memory (VRAM) usage over time. If utilization approaches 90%, there is a risk of running out of memory and crashing AI computations. Plan capacity increases before it reaches critical levels.' },
    ja: { title: 'VRAM使用量推移', description: 'GPU専用メモリ（VRAM）の使用率変化を時間帯別に表示するチャートです。使用率が90%に近づくとメモリ不足でAI演算が中断される危険があります。' },
  },
  'chart-gpu-temperature': {
    ko: { title: '온도 추이', description: 'GPU 온도의 시간별 변화를 보여주는 차트입니다. 온도가 지속적으로 올라가면 냉각 시스템 문제를 의심하고, 80도를 넘으면 GPU가 자동으로 성능을 낮춰 AI 처리 속도가 떨어질 수 있습니다.' },
    en: { title: 'Temperature Trend', description: 'A chart showing GPU temperature changes over time. If temperatures keep climbing, suspect a cooling system issue. Above 80°C, GPUs automatically throttle performance, which can slow down AI processing.' },
    ja: { title: '温度推移', description: 'GPU温度の時間別変化を表示するチャートです。温度が持続的に上昇する場合は冷却システムの問題を疑い、80度を超えるとGPUが自動的に性能を下げるためAI処理速度が低下する可能性があります。' },
  },
  'chart-ttft-distribution': {
    ko: { title: 'TTFT 분포', description: 'AI 첫 응답 시간이 어떤 구간에 집중되어 있는지 보여주는 막대 차트입니다. 대부분이 빠른 구간에 몰려 있으면 양호하고, 느린 구간에도 많이 분포되어 있으면 성능 개선이 필요합니다.' },
    en: { title: 'TTFT Distribution', description: 'A histogram showing how AI first-response times are distributed across different time buckets. Ideally most requests fall in the fast buckets. If many land in slower buckets, performance optimization is needed.' },
    ja: { title: 'TTFT分布', description: 'AI初回応答時間がどの区間に集中しているかを表示する棒グラフです。ほとんどが速い区間に集中していれば良好で、遅い区間にも多く分布している場合は性能改善が必要です。' },
  },
  'chart-token-throughput': {
    ko: { title: '토큰 처리량 (TPS)', description: '1초에 처리하는 토큰 수의 중간값(P50)과 느린 쪽(P95) 변화를 보여주는 차트입니다. 두 선의 간격이 크면 일부 요청의 처리 속도가 크게 느린 것이므로 원인을 확인하세요.' },
    en: { title: 'Token Throughput (TPS)', description: 'A trend chart showing token generation speed at P50 (median) and P95 (slow end). If the gap between the two lines is large, some requests are being processed much more slowly than others, warranting investigation.' },
    ja: { title: 'トークンスループット(TPS)', description: '1秒間に処理するトークン数の中央値（P50）と遅い側（P95）の変化を表示するチャートです。2本線の間隔が大きい場合は一部リクエストの処理速度がかなり遅いため原因を確認してください。' },
  },
  'chart-token-usage-cost': {
    ko: { title: '토큰 사용량 및 비용', description: 'AI에 입력하는 텍스트(Input)와 출력되는 텍스트(Output)의 토큰 수, 그리고 비용의 시간별 변화를 보여줍니다. 비용이 급증하는 시점을 찾아 어떤 호출이 원인인지 분석하세요.' },
    en: { title: 'Token Usage & Cost', description: 'A chart showing input tokens, output tokens, and associated costs over time. Use it to identify when cost spikes occur and trace back which calls or usage patterns are responsible for the increase.' },
    ja: { title: 'トークン使用量&コスト', description: 'AIに入力するテキスト（Input）と出力されるテキスト（Output）のトークン数およびコストの時間別変化を表示します。コストが急増する時点を特定し、どの呼び出しが原因か分析してください。' },
  },
  'chart-concurrent-requests': {
    ko: { title: '동시 요청', description: 'AI 언어 모델에 동시에 처리되고 있는 요청 수의 변화를 보여주는 차트입니다. 동시 요청이 많아지면 GPU 부하가 올라가고 응답이 느려질 수 있으므로 적절한 동시성 제한을 설정하세요.' },
    en: { title: 'Concurrent Requests', description: 'A chart showing how many requests are being processed by the AI model simultaneously. More concurrent requests means higher GPU load and potentially slower responses. Set appropriate concurrency limits to maintain quality.' },
    ja: { title: '同時リクエスト', description: 'AI言語モデルに同時に処理されているリクエスト数の変化を表示するチャートです。同時リクエストが増えるとGPU負荷が上がり応答が遅くなる可能性があるため、適切な同時実行制限を設定してください。' },
  },
  'chart-pipeline-stages': {
    ko: { title: '파이프라인 단계', description: 'AI가 질문에 답하기까지의 각 단계별 평균 소요 시간을 보여줍니다. 가장 오래 걸리는 단계를 찾아 집중 최적화하면 전체 응답 속도를 효과적으로 개선할 수 있습니다.' },
    en: { title: 'Pipeline Stages', description: 'Shows the average time spent at each stage of the AI pipeline. By identifying the slowest stage and focusing optimization there, you can effectively improve overall response speed.' },
    ja: { title: 'パイプラインステージ', description: 'AIが質問に回答するまでの各ステージ別平均所要時間を表示します。最も時間がかかるステージを見つけて集中的に最適化すれば、全体の応答速度を効果的に改善できます。' },
  },
  'chart-search-quality': {
    ko: { title: '검색 품질', description: 'AI가 관련 문서를 얼마나 잘 찾아내는지를 나타내는 지표들입니다. 관련도(Relevancy), 상위 결과 적중률, 답변 충실도(Faithfulness) 등이 포함되며, 점수가 낮으면 검색 설정이나 데이터를 개선하세요.' },
    en: { title: 'Search Quality', description: 'Metrics showing how well the AI retrieves relevant documents: relevancy score, top-K hit rate, and answer faithfulness. If scores are low, consider improving the search index or the data used for AI responses.' },
    ja: { title: '検索品質', description: 'AIが関連文書をどれだけ正確に見つけ出せるかを示す指標です。関連度（Relevancy）、上位結果ヒット率、回答忠実度（Faithfulness）等が含まれ、スコアが低い場合は検索設定やデータの改善が必要です。' },
  },
  'chart-embedding-performance': {
    ko: { title: '임베딩 성능', description: '텍스트를 숫자 벡터로 변환하는 임베딩 모델의 성능 지표입니다. 변환 속도(P95 지연), 처리량, 캐시 적중률을 확인하여 검색 파이프라인의 이 단계가 병목이 되지 않는지 점검하세요.' },
    en: { title: 'Embedding Performance', description: 'Performance metrics for the embedding model that converts text into vectors: P95 latency, throughput, and cache hit rate. If any of these degrade, the search pipeline stage may become a bottleneck.' },
    ja: { title: 'エンベディング性能', description: 'テキストを数値ベクトルに変換するエンベディングモデルの性能指標です。変換速度（P95遅延）、処理量、キャッシュヒット率を確認し、検索パイプラインのこのステージがボトルネックになっていないか点検してください。' },
  },
  'chart-vector-db': {
    ko: { title: 'Vector DB', description: 'AI 검색에 사용되는 벡터 데이터베이스의 상태와 성능 정보입니다. 인덱스 크기, 검색 속도, 데이터 삽입 속도를 확인하여 검색 품질과 속도를 유지하세요.' },
    en: { title: 'Vector DB', description: 'Status and performance information for the vector database used in AI search: index size, search speed, and data insert speed. Monitor these to maintain search quality and response times.' },
    ja: { title: 'Vector DB', description: 'AI検索に使用されるベクターデータベースの状態と性能情報です。インデックスサイズ、検索速度、データ挿入速度を確認して検索品質と速度を維持してください。' },
  },
  'chart-block-rate-trend': {
    ko: { title: '차단율 추이', description: 'AI 안전 필터(Guardrail)가 차단한 요청 비율의 시간별 변화를 보여주는 차트입니다. 특정 시간대에 차단율이 급증하면 악의적 사용 시도가 있었거나 필터 규칙 변경의 영향일 수 있습니다.' },
    en: { title: 'Block Rate Trend', description: 'A chart showing how the AI safety filter\'s block rate changes over time. If the rate spikes at certain times, it could indicate a wave of malicious requests or the impact of a rule change.' },
    ja: { title: 'ブロック率推移', description: 'AI安全フィルター（Guardrail）がブロックしたリクエスト割合の時間別変化を表示するチャートです。特定時間帯にブロック率が急増した場合は、悪意ある利用の試みやフィルタールール変更の影響の可能性があります。' },
  },
  'chart-violation-types': {
    ko: { title: '위반 유형', description: 'AI 안전 필터가 차단한 이유를 유형별로 분류한 차트입니다. 어떤 종류의 위반이 가장 많은지 파악하면 필터 규칙을 효과적으로 조정하거나 사용자 안내를 개선할 수 있습니다.' },
    en: { title: 'Violation Types', description: 'A breakdown of the reasons why the AI safety filter blocked requests. Understanding which violation types are most common helps you tune filter rules effectively or improve user guidance.' },
    ja: { title: '違反タイプ', description: 'AI安全フィルターがブロックした理由をタイプ別に分類したチャートです。どの種類の違反が最も多いか把握すれば、フィルタールールの効果的な調整やユーザーガイダンスの改善に役立ちます。' },
  },
  'chart-guardrail-latency': {
    ko: { title: 'Guardrail 지연', description: 'AI 안전 검사(입력 검사, 출력 검사)에 소요되는 시간의 변화를 보여주는 차트입니다. 검사 시간이 길어지면 전체 AI 응답 속도에 영향을 주므로 규칙 최적화를 검토하세요.' },
    en: { title: 'Guardrail Latency', description: 'A chart tracking how long safety checks (both input and output) take over time. If check times increase, the overall AI response slows down. Consider optimizing the guardrail rules to reduce their processing time.' },
    ja: { title: 'ガードレールレイテンシ', description: 'AI安全検査（入力検査、出力検査）にかかる時間の変化を表示するチャートです。検査時間が長くなると全体のAI応答速度に影響するため、ルールの最適化を検討してください。' },
  },
  'chart-model-distribution': {
    ko: { title: '모델 분포', description: '각 AI 모델이 얼마나 많이 호출되었는지를 비율로 보여주는 차트입니다. 특정 모델에 호출이 집중되어 있으면 해당 모델 서버의 부하를 주의하고, 비용 대비 효율을 점검하세요.' },
    en: { title: 'Model Distribution', description: 'A chart showing what percentage of calls go to each AI model. If one model handles most traffic, monitor that model\'s server closely. Also review whether the cost-to-quality ratio is optimal for each model.' },
    ja: { title: 'モデル分布', description: '各AIモデルがどれだけ呼び出されたかを割合で表示するチャートです。特定モデルに呼び出しが集中している場合はそのモデルサーバーの負荷に注意し、コスト対効率を確認してください。' },
  },
  'chart-cost-trend': {
    ko: { title: '비용 추이', description: '시간대별 AI 서비스 사용 비용($/시간)의 변화를 보여주는 차트입니다. 피크 시간대에 비용이 집중되는 패턴을 파악하면 요청 스케줄링이나 캐싱으로 비용을 절감할 수 있습니다.' },
    en: { title: 'Cost Trend', description: 'A chart showing how AI service costs ($/hour) change over time. By identifying peak cost hours, you can reduce expenses through request scheduling, caching, or other optimization strategies.' },
    ja: { title: 'コスト推移', description: '時間帯別AIサービス利用コスト（$/時間）の変化を表示するチャートです。ピーク時間帯にコストが集中するパターンを把握すれば、リクエストスケジューリングやキャッシングでコストを削減できます。' },
  },
  'chart-gpu-vram-trend': {
    ko: { title: 'VRAM 사용량 추이', description: '각 서버별 GPU 메모리(VRAM) 사용률의 시간별 변화를 보여줍니다. 어떤 서버의 GPU 메모리가 부족해지고 있는지 서버별로 비교하며 확인할 수 있습니다.' },
    en: { title: 'VRAM Usage Trend', description: 'A chart showing GPU memory (VRAM) usage over time for each server. This lets you compare across servers and identify which specific host is running low on GPU memory.' },
    ja: { title: 'VRAM使用量推移', description: '各サーバー別のGPUメモリ（VRAM）使用率の時間別変化を表示します。どのサーバーのGPUメモリが不足しつつあるかサーバー別に比較しながら確認できます。' },
  },
  'chart-gpu-temp-trend': {
    ko: { title: '온도 추이', description: '각 서버별 GPU 온도의 시간별 변화를 보여줍니다. 특정 서버의 GPU 온도가 유독 높다면 해당 서버의 냉각 환경이나 GPU 부하를 점검하세요.' },
    en: { title: 'Temperature Trend', description: 'A chart showing GPU temperatures over time for each server. If one server\'s GPU is notably hotter than others, check that server\'s cooling environment or GPU workload.' },
    ja: { title: '温度推移', description: '各サーバー別のGPU温度の時間別変化を表示します。特定サーバーのGPU温度だけが高い場合は、そのサーバーの冷却環境やGPU負荷を確認してください。' },
  },
  'chart-gpu-power-trend': {
    ko: { title: '전력 소비 추이', description: '각 서버별 GPU가 소비하는 전력(와트)의 시간별 변화를 보여줍니다. 전력 소비가 높으면 비용과 냉각 부담이 커지므로, GPU 전력 제한(Power Limit) 설정을 활용하여 최적화할 수 있습니다.' },
    en: { title: 'Power Draw Trend', description: 'A chart showing GPU power consumption (watts) over time per server. High power consumption increases electricity costs and cooling demands. Use GPU power limit settings to optimize the balance between performance and energy use.' },
    ja: { title: '消費電力推移', description: '各サーバー別のGPU消費電力（ワット）の時間別変化を表示します。消費電力が高いとコストと冷却負担が増えるため、GPU Power Limit設定の活用で最適化できます。' },
  },
  'chart-gpu-sm-occupancy': {
    ko: { title: 'SM 점유율 추이', description: '각 서버별 GPU 연산 코어(SM)의 활용률 변화를 보여줍니다. SM 점유율이 높으면 GPU를 효율적으로 활용하고 있다는 뜻이고, 낮으면 GPU 자원이 낭비되고 있을 수 있습니다.' },
    en: { title: 'SM Occupancy Trend', description: 'A chart showing how well the GPU computing cores (SM) are utilized per server over time. High occupancy means the GPU is being used efficiently. Low occupancy suggests GPU resources may be underutilized and going to waste.' },
    ja: { title: 'SM占有率推移', description: '各サーバー別のGPU演算コア（SM）の活用率変化を表示します。SM占有率が高いとGPUを効率的に活用していることを意味し、低い場合はGPUリソースが無駄になっている可能性があります。' },
  },
  'chart-cost-vs-quality': {
    ko: { title: '비용 대 품질', description: '각 AI 모델의 비용과 답변 품질을 비교하는 버블 차트입니다. 비용 대비 품질이 높은 모델을 찾아 효율적으로 배분하면 비용을 줄이면서도 서비스 품질을 유지할 수 있습니다.' },
    en: { title: 'Cost vs Quality', description: 'A bubble chart comparing the cost and answer quality of each AI model. Finding models with high quality relative to their cost helps you optimize spending while maintaining service quality.' },
    ja: { title: 'コスト対品質', description: '各AIモデルのコストと回答品質を比較するバブルチャートです。コスト対比で品質が高いモデルを見つけて効率的に配分すれば、コストを抑えながらサービス品質を維持できます。' },
  },
  'chart-cache-hit-distribution': {
    ko: { title: '캐시 적중 분포', description: 'AI 요청 중 캐시에서 답을 찾은 비율(Hit)과 못 찾은 비율(Miss)을 도넛 차트로 보여줍니다. Hit 비율이 높을수록 비용을 절약하고 응답도 빨라지므로, 캐시 전략을 최적화하세요.' },
    en: { title: 'Cache Hit Distribution', description: 'A donut chart showing what percentage of AI requests were served from cache (hit) vs. required a fresh model call (miss). A higher hit ratio saves money and speeds up responses. Optimize your caching strategy to improve this ratio.' },
    ja: { title: 'キャッシュヒット分布', description: 'AIリクエストのうちキャッシュから回答を見つけた割合（Hit）と見つけられなかった割合（Miss）をドーナツチャートで表示します。Hit割合が高いほどコスト節約と高速応答につながるため、キャッシュ戦略を最適化してください。' },
  },
  'chart-potential-savings': {
    ko: { title: '잠재 절감액', description: '비슷한 질문에 대한 캐시 재활용(시맨틱 캐싱) 등으로 절약할 수 있는 비용 정보입니다. 절감 가능 금액이 크다면 캐싱 기능을 활성화하거나 설정을 최적화하는 것이 효과적입니다.' },
    en: { title: 'Potential Savings', description: 'Information about how much you could save through semantic caching (reusing answers for similar questions) and other optimizations. If the potential savings amount is large, enabling or tuning caching features would be highly effective.' },
    ja: { title: '潜在節約額', description: '類似質問に対するキャッシュ再利用（セマンティックキャッシング）などで節約可能なコスト情報です。削減可能額が大きい場合はキャッシング機能の有効化や設定の最適化が効果的です。' },
  },
  'chart-pipeline-waterfall': {
    ko: { title: '파이프라인 워터폴', description: '최근 AI 파이프라인 호출이 각 단계를 순서대로 거치는 모습을 타임라인으로 보여줍니다. 어떤 단계에서 시간이 많이 걸리는지 시각적으로 확인하여 병목을 찾을 수 있습니다.' },
    en: { title: 'Pipeline Waterfall', description: 'A waterfall-style timeline showing how recent AI pipeline calls progressed through each stage. This visual layout makes it easy to spot which stage consumed the most time and where to focus optimization.' },
    ja: { title: 'パイプラインウォーターフォール', description: '最近のAIパイプライン呼び出しが各ステージを順番に通過する様子をタイムラインで表示します。どのステージで時間がかかっているか視覚的に確認してボトルネックを特定できます。' },
  },
  'chart-quality-score-trend': {
    ko: { title: '품질 점수 추이', description: '프롬프트를 업데이트할 때마다 품질 점수가 어떻게 변했는지 보여주는 차트입니다. 새 버전에서 점수가 떨어졌다면 변경 내용을 되돌리거나 추가 개선이 필요합니다.' },
    en: { title: 'Quality Score Trend', description: 'A chart showing how quality scores changed with each prompt version update. If a new version caused scores to drop, the changes should be reverted or further refined to restore quality.' },
    ja: { title: '品質スコア推移', description: 'プロンプトを更新するたびに品質スコアがどう変化したかを表示するチャートです。新バージョンでスコアが下がった場合は変更内容を元に戻すか追加改善が必要です。' },
  },
  'chart-loss-curve': {
    ko: { title: '손실 곡선', description: 'AI 모델 학습의 진행 상황을 보여주는 핵심 차트입니다. 학습 손실(Train)과 검증 손실(Val)이 함께 내려가면 정상이고, 검증 손실만 올라가면 과적합(학습 데이터에만 맞춰지는 현상)이 발생한 것입니다.' },
    en: { title: 'Loss Curve', description: 'The key chart for tracking AI model training progress. If both training loss and validation loss decrease together, learning is healthy. If validation loss starts rising while training loss drops, the model is overfitting.' },
    ja: { title: '損失曲線', description: 'AIモデル学習の進捗を示す重要なチャートです。学習損失（Train）と検証損失（Val）が共に下がれば正常で、検証損失だけが上がり始めた場合は過学習（学習データだけに適合する現象）が発生しています。' },
  },
  'chart-accuracy-curve': {
    ko: { title: '정확도 곡선', description: '학습 중 모델의 정답률 변화를 보여주는 차트입니다. 학습 정확도(Train)와 검증 정확도(Val)가 함께 올라가면 좋고, 검증 정확도가 떨어지기 시작하면 학습을 중단할 시점입니다.' },
    en: { title: 'Accuracy Curve', description: 'A chart showing how model accuracy changes during training. Both training and validation accuracy should rise together. If validation accuracy begins to decline, it is time to stop training to avoid overfitting.' },
    ja: { title: '精度曲線', description: '学習中のモデル正答率の変化を表示するチャートです。学習精度（Train）と検証精度（Val）が共に上がれば良好で、検証精度が下がり始めたら学習を停止するタイミングです。' },
  },
  'chart-training-gpu-util': {
    ko: { title: 'GPU 사용률', description: '학습 작업이 GPU를 얼마나 활용하고 있는지 시간별로 보여주는 차트입니다. 사용률이 지속적으로 낮다면 배치 크기를 늘려 효율을 높이거나 더 작은 GPU로도 충분할 수 있습니다.' },
    en: { title: 'GPU Utilization', description: 'A chart showing how much of the GPU this training job uses over time. If utilization stays consistently low, consider increasing the batch size for better efficiency, or the job may not need such a powerful GPU.' },
    ja: { title: 'GPU使用率', description: '学習ジョブがGPUをどの程度活用しているかを時間別に表示するチャートです。使用率が継続的に低い場合はバッチサイズを増やして効率を高めるか、より小さいGPUでも十分かもしれません。' },
  },
  'chart-learning-rate': {
    ko: { title: '학습률 스케줄', description: '모델이 얼마나 빠르게 학습하는지를 조절하는 학습률(Learning Rate)의 변화를 보여주는 차트입니다. 보통 학습 초기에는 높고 점차 낮아지며, 이 스케줄이 올바르게 적용되고 있는지 확인할 수 있습니다.' },
    en: { title: 'Learning Rate Schedule', description: 'A chart showing the learning rate changes during training. Typically the learning rate starts high and gradually decreases. This chart lets you verify the schedule is being applied correctly and as intended.' },
    ja: { title: '学習率スケジュール', description: 'モデルがどれだけ速く学習するかを調整する学習率（Learning Rate）の変化を表示するチャートです。通常は学習初期に高く徐々に下がり、このスケジュールが正しく適用されているか確認できます。' },
  },
  'table-checkpoints': {
    ko: { title: '체크포인트', description: '학습 도중 주기적으로 저장된 모델 스냅샷의 목록입니다. 각 체크포인트의 손실값과 정확도를 비교하여 가장 성능이 좋은 시점의 모델을 선택할 수 있습니다.' },
    en: { title: 'Checkpoints', description: 'A list of model snapshots saved at intervals during training. Each checkpoint records the loss and accuracy at that point. Compare them to select the best-performing model version for deployment.' },
    ja: { title: 'チェックポイント', description: '学習途中に定期的に保存されたモデルスナップショットの一覧です。各チェックポイントの損失値と精度を比較して、最も性能が良い時点のモデルを選択できます。' },
  },
  'chart-gs-latency': {
    ko: { title: '지연시간', description: '모든 서비스의 응답시간을 3가지 기준(P50, P95, P99)으로 보여주는 추이 차트입니다. 세 선이 함께 올라가면 전반적 지연이고, P99만 올라가면 소수의 요청만 느린 것입니다.' },
    en: { title: 'Latency', description: 'A trend chart of P50, P95, and P99 response times across all services. If all three lines rise together, there is a system-wide slowdown. If only P99 rises, just a small fraction of requests are affected.' },
    ja: { title: 'レイテンシ', description: 'すべてのサービスの応答時間をP50、P95、P99の3基準で表示する推移チャートです。3本線が共に上がれば全般的な遅延、P99だけ上がれば少数のリクエストだけが遅いことを意味します。' },
  },
  'chart-gs-traffic': {
    ko: { title: '트래픽', description: '모든 서비스가 받는 요청 수(분당)의 시간별 변화를 보여주는 차트입니다. 일일 트래픽 패턴을 파악하고, 평소와 다른 변동이 있으면 원인을 확인하세요.' },
    en: { title: 'Traffic', description: 'A chart showing total requests per minute across all services over time. Use it to understand daily traffic patterns and to quickly spot any unusual changes that differ from the normal pattern.' },
    ja: { title: 'トラフィック', description: 'すべてのサービスが受けるリクエスト数（分間）の時間別変化を表示するチャートです。日々のトラフィックパターンを把握し、普段と異なる変動がある場合は原因を確認してください。' },
  },
  'chart-gs-error-rate': {
    ko: { title: '에러율', description: '모든 서비스의 에러 발생 비율 변화를 보여주는 차트입니다. 특정 시점에 에러가 급증했다면 그 시간에 배포, 설정 변경, 또는 외부 시스템 장애가 있었는지 확인하세요.' },
    en: { title: 'Error Rate', description: 'A chart showing how the error rate across all services changes over time. If errors spike at a specific time, investigate whether a deployment, configuration change, or external dependency failure occurred then.' },
    ja: { title: 'エラー率', description: 'すべてのサービスのエラー発生率の変化を表示するチャートです。特定時点でエラーが急増した場合は、その時間にデプロイ、設定変更、または外部システム障害があったか確認してください。' },
  },
  'chart-gs-saturation': {
    ko: { title: '포화도', description: '모든 서비스의 CPU와 메모리 사용률 변화를 보여주는 차트입니다. 사용률이 꾸준히 올라가면 용량 한계에 가까워지고 있으므로, 서버 증설 시점을 미리 계획하세요.' },
    en: { title: 'Saturation', description: 'A chart showing CPU and memory utilization trends across all services. If utilization steadily climbs, the system is approaching its capacity limit. Plan server additions or workload optimizations ahead of time.' },
    ja: { title: '飽和度', description: 'すべてのサービスのCPUとメモリ使用率の変化を表示するチャートです。使用率が着実に上がり続ける場合は容量限界に近づいているため、サーバー増設の時期を事前に計画してください。' },
  },
  'chart-cwv-distribution': {
    ko: { title: 'CWV 분포', description: '각 웹 페이지의 핵심 웹 성능 지표(LCP, FID, CLS) 분포를 보여주는 차트입니다. 빨간색으로 표시된 페이지는 사용자 경험이 나쁘다는 뜻이므로 해당 페이지의 최적화를 우선 진행하세요.' },
    en: { title: 'CWV Distribution', description: 'A chart showing Core Web Vitals (LCP, FID, CLS) distribution for each web page. Pages shown in red have poor user experience and should be prioritized for performance optimization.' },
    ja: { title: 'CWV分布', description: '各Webページのコアウェブバイタル指標（LCP、FID、CLS）の分布を表示するチャートです。赤色で表示されたページはユーザー体験が悪いため、そのページの最適化を優先して進めてください。' },
  },
  'map-topology': {
    ko: { title: '토폴로지 맵', description: '서비스, 호스트, 인스턴스가 서로 어떻게 연결되어 있는지를 네트워크 그림으로 보여줍니다. 장애 발생 시 영향 범위를 파악하거나, 서비스 구조를 이해하는 데 활용할 수 있습니다.' },
    en: { title: 'Topology Map', description: 'A network diagram showing how services, hosts, and instances are connected to each other. Use it to understand the service architecture and to trace the blast radius when an incident occurs.' },
    ja: { title: 'トポロジーマップ', description: 'サービス、ホスト、インスタンスがどのように接続されているかをネットワーク図で表示します。障害発生時の影響範囲の把握やサービス構造の理解に活用できます。' },
  },
  'chart-exec-slo': {
    ko: { title: 'SLO 준수율', description: '서비스 품질 목표(SLO) 달성률을 게이지와 개별 상태로 보여줍니다. 게이지가 녹색이면 전체적으로 양호하고, 개별 SLO 중 빨간색이 있으면 해당 목표를 달성하지 못하고 있는 것입니다.' },
    en: { title: 'SLO Compliance', description: 'A gauge chart showing overall SLO compliance with individual SLO statuses listed below. Green means the target is being met. If any SLO appears in red, that quality target is not being achieved and needs attention.' },
    ja: { title: 'SLO準拠率', description: 'SLO達成率をゲージと個別状態で表示します。ゲージが緑色なら全体的に良好で、個別SLOに赤色がある場合はその目標を達成できていないことを意味します。' },
  },
  'chart-exec-cost-breakdown': {
    ko: { title: '비용 구성', description: '하루 운영 비용이 어떤 항목(AI, GPU, 인프라 등)에 얼마씩 쓰이는지 도넛 차트로 보여줍니다. 가장 큰 비중을 차지하는 항목부터 비용 절감을 검토하면 효과적입니다.' },
    en: { title: 'Cost Breakdown', description: 'A donut chart showing how daily operational costs are distributed across categories (AI, GPU, infrastructure, etc.). Focus cost-reduction efforts on the largest category first for the biggest impact.' },
    ja: { title: 'コスト内訳', description: '1日の運用コストが各項目（AI、GPU、インフラ等）にいくらずつ使われているかをドーナツチャートで表示します。最も大きな割合を占める項目からコスト削減を検討すると効果的です。' },
  },
  'table-exec-top-issues': {
    ko: { title: '주요 이슈', description: '현재 가장 시급하게 해결해야 할 문제들의 목록입니다. 심각도 순으로 정렬되어 있으며, 상위 이슈부터 우선적으로 대응하면 서비스 영향을 최소화할 수 있습니다.' },
    en: { title: 'Top Issues', description: 'A prioritized list of the most urgent unresolved problems. Issues are sorted by severity, so addressing them from the top down minimizes service impact most effectively.' },
    ja: { title: '主要イシュー', description: '現在最も緊急に解決すべき問題のリストです。重要度順に並んでおり、上位のイシューから優先的に対応すればサービスへの影響を最小限に抑えられます。' },
  },
  'chart-exec-health-trend': {
    ko: { title: '서비스 상태 추이', description: '최근 30일간 서비스의 상태(정상/경고/위험) 비율이 어떻게 변했는지 보여주는 차트입니다. 경고나 위험 비율이 늘어나는 추세라면 시스템 전반의 안정성에 구조적인 개선이 필요합니다.' },
    en: { title: 'Service Health Trend', description: 'A chart showing how the proportion of healthy, warning, and critical services has changed over the last 30 days. If the warning or critical share is growing, the system needs structural improvements to its overall stability.' },
    ja: { title: 'サービス状態推移', description: '過去30日間のサービス状態（正常/警告/危険）の割合がどう変化したかを表示するチャートです。警告や危険の割合が増加傾向であれば、システム全般の安定性に構造的な改善が必要です。' },
  },
  'chart-exec-cost-trend': {
    ko: { title: '비용 추이 (30일)', description: '최근 30일간 하루 총 비용이 어떻게 변했는지 보여주는 차트입니다. 비용이 꾸준히 올라가는지, 특정 날에 급등했는지 파악하여 예산 관리와 비용 최적화에 활용하세요.' },
    en: { title: 'Cost Trend (30 days)', description: 'A chart showing daily total costs over the past 30 days. Use it to see whether costs are steadily rising, identify specific days with spikes, and plan budget management and cost optimization accordingly.' },
    ja: { title: 'コスト推移(30日)', description: '過去30日間の1日あたり総コストの変化を表示するチャートです。コストが着実に上がっているか、特定の日に急騰したかを把握して予算管理とコスト最適化に活用してください。' },
  },
  'chart-cost-distribution': {
    ko: { title: '비용 분포', description: '비용이 각 카테고리(AI, GPU, 인프라 등)에 어떤 비율로 분포되어 있는지 파이 차트로 보여줍니다. 비용 구조를 이해하고 가장 큰 비중을 차지하는 항목의 최적화를 우선 검토하세요.' },
    en: { title: 'Cost Distribution', description: 'A pie chart showing how costs are spread across categories (AI, GPU, infrastructure, etc.). Understanding the cost structure helps you prioritize optimization in the areas with the highest spending.' },
    ja: { title: 'コスト分布', description: 'コストが各カテゴリ（AI、GPU、インフラ等）にどのような割合で分布しているかをパイチャートで表示します。コスト構造を理解し、最も大きな割合を占める項目の最適化を優先的に検討してください。' },
  },
  'chart-daily-cost-trend': {
    ko: { title: '일일 비용 추이', description: '각 카테고리별 일일 비용이 시간에 따라 어떻게 변하는지 보여주는 차트입니다. 특정 카테고리의 비용이 급증하는 시점을 찾으면 그 원인(트래픽, 모델 변경 등)을 파악할 수 있습니다.' },
    en: { title: 'Daily Cost Trend', description: 'A chart showing daily costs broken down by category over time. By spotting when a specific category\'s cost surges, you can trace the cause (traffic spike, model change, etc.) and take targeted action.' },
    ja: { title: '日次コスト推移', description: '各カテゴリ別の日次コストが時間とともにどう変化しているかを表示するチャートです。特定カテゴリのコストが急増する時点を見つければ、その原因（トラフィック、モデル変更等）を把握できます。' },
  },
  'chart-anomaly-ttft': {
    ko: { title: 'TTFT P95 동적 임계값', description: '인공지능이 과거 데이터를 학습하여 자동으로 정상 범위를 설정하고, 이를 벗어난 이상 현상을 탐지하는 차트입니다. 고정 임계값보다 정교하게 이상을 감지할 수 있습니다.' },
    en: { title: 'Dynamic Threshold — TTFT P95', description: 'A chart where machine learning automatically sets a normal range based on historical data and flags anomalies that fall outside it. This provides more precise detection than fixed thresholds for the TTFT P95 metric.' },
    ja: { title: 'TTFT P95動的閾値', description: 'AIが過去データを学習して自動的に正常範囲を設定し、これを逸脱した異常を検知するチャートです。固定閾値よりも精緻に異常を検出でき、赤い点がある時点で異常が検知されたことを意味します。' },
  },
  'chart-anomaly-error-rate': {
    ko: { title: '에러율 동적 임계값', description: '인공지능이 에러율의 정상 패턴을 학습하여 동적으로 임계값을 설정하고, 비정상적인 에러 급증을 자동 탐지하는 차트입니다. 빨간 점이 표시되면 이상이 감지된 시점입니다.' },
    en: { title: 'Dynamic Threshold — Error Rate', description: 'A chart where ML learns normal error rate patterns and dynamically sets thresholds to detect abnormal spikes. Red dots mark the points where anomalies were detected, signaling potential issues to investigate.' },
    ja: { title: 'エラー率動的閾値', description: 'AIがエラー率の正常パターンを学習して動的に閾値を設定し、異常なエラー急増を自動検知するチャートです。赤い点が表示されている箇所が異常が検知された時点です。' },
  },
  'chart-cloud-cost-trend': {
    ko: { title: '30일 비용 추이', description: '각 클라우드 서비스(AWS, Azure 등)별 30일간 비용 변화를 보여주는 차트입니다. 어떤 클라우드에서 비용이 증가하고 있는지 추세를 파악하여 리소스 최적화를 계획하세요.' },
    en: { title: '30-Day Cost Trend', description: 'A chart showing the 30-day cost trend for each cloud provider (AWS, Azure, etc.). Identify which cloud is driving cost increases and plan resource optimization or migration strategies accordingly.' },
    ja: { title: '30日コスト推移', description: '各クラウドサービス（AWS、Azure等）別の30日間コスト変化を表示するチャートです。どのクラウドでコストが増加傾向にあるか把握してリソース最適化を計画してください。' },
  },
  'map-service-topology': {
    ko: { title: '서비스 토폴로지', description: '서비스들이 서로 어떻게 호출하는지를 네트워크 그림으로 보여줍니다. 화살표 방향이 호출 흐름이며, 빨간색 연결이 있으면 해당 경로에 문제가 있다는 뜻이므로 관련 서비스를 점검하세요.' },
    en: { title: 'Service Topology', description: 'A network diagram showing how services call each other. Arrows indicate the direction of calls. Red connections signal problems on those paths, so check the related services when you spot one.' },
    ja: { title: 'サービストポロジー', description: 'サービス同士がどのように呼び出し合っているかをネットワーク図で表示します。矢印の方向が呼び出しの流れで、赤い接続がある場合はその経路に問題があるため関連サービスを確認してください。' },
  },
  'map-host-health': {
    ko: { title: '호스트 헬스 맵', description: '프로젝트에 속한 서버들의 상태를 격자 형태로 한눈에 보여줍니다. 각 칸이 하나의 서버를 나타내며, 색상(초록/노랑/빨강)으로 상태를 빠르게 파악할 수 있습니다.' },
    en: { title: 'Host Health Map', description: 'A grid-style map showing the health status of servers in this project. Each cell represents one server, color-coded green (healthy), yellow (warning), or red (critical) for quick visual assessment.' },
    ja: { title: 'ホストヘルスマップ', description: 'プロジェクトに属するサーバーの状態をグリッド形式で一目で表示します。各マスが1つのサーバーを表し、色（緑/黄/赤）で状態を素早く把握できます。' },
  },
  'chart-ttft-vs-conversion': {
    ko: { title: 'TTFT 대 전환율', description: 'AI의 첫 응답 속도(TTFT)가 빨라질수록 사용자 전환율이 어떻게 변하는지 보여주는 차트입니다. 응답이 빠를수록 전환율이 높아지는 경향을 확인하여, 속도 개선의 비즈니스 가치를 파악할 수 있습니다.' },
    en: { title: 'TTFT vs Conversion Rate', description: 'A chart showing the relationship between AI response speed (TTFT) and user conversion rate. Faster responses typically lead to higher conversions, helping you quantify the business value of speed improvements.' },
    ja: { title: 'TTFT対コンバージョン率', description: 'AIの初回応答速度（TTFT）が速くなるほどユーザーコンバージョン率がどう変化するかを表示するチャートです。応答が速いほどコンバージョン率が上がる傾向を確認し、速度改善のビジネス価値を把握できます。' },
  },
  'table-train-vs-inference': {
    ko: { title: '학습 vs 추론 비교', description: 'AI 모델의 학습(Training) 단계와 실제 서비스(Inference) 단계의 성능 지표를 나란히 비교하는 테이블입니다. 학습 때의 성능과 실서비스 성능의 차이를 파악할 수 있습니다.' },
    en: { title: 'Train vs Inference', description: 'A side-by-side comparison of AI model performance during training versus real-world inference. Use it to identify gaps between training performance and production performance that may need addressing.' },
    ja: { title: '学習vs推論比較', description: 'AIモデルの学習（Training）段階と実サービス（Inference）段階の性能指標を並べて比較するテーブルです。学習時の性能と実サービス性能の差を把握できます。' },
  },
  'chart-revenue-by-plan': {
    ko: { title: '플랜별 수익', description: '각 요금 플랜(Basic, Pro, Enterprise 등)에서 발생하는 수익 비율을 파이 차트로 보여줍니다. 어떤 플랜이 가장 큰 수익원인지 파악하여 가격 전략과 마케팅에 활용하세요.' },
    en: { title: 'Revenue by Plan', description: 'A pie chart showing how revenue is distributed across pricing plans (Basic, Pro, Enterprise, etc.). See which plans generate the most revenue and use the data to inform pricing strategy and marketing decisions.' },
    ja: { title: 'プラン別収益', description: '各料金プラン（Basic、Pro、Enterprise等）から発生する収益の割合をパイチャートで表示します。どのプランが最大の収益源かを把握して価格戦略やマーケティングに活用してください。' },
  },
  'table-go-agent-overview': {
    ko: { title: 'Go 에이전트 개요', description: 'Go 언어 기반 서비스의 에이전트별 런타임 지표를 정리한 테이블입니다. 스케줄러 지연, 가비지 컬렉션, 고루틴 수를 에이전트별로 비교하여 문제가 있는 서버를 빠르게 찾을 수 있습니다.' },
    en: { title: 'Go Agent Overview', description: 'A table summarizing key Go runtime metrics (scheduler delay, garbage collection, goroutine count) per agent. Compare agents side by side to quickly identify which servers have performance issues.' },
    ja: { title: 'Goエージェント概要', description: 'Go言語ベースのサービスのエージェント別ランタイム指標をまとめたテーブルです。スケジューラ遅延、GC、ゴルーチン数をエージェント別に比較して問題のあるサーバーを素早く特定できます。' },
  },
  'chart-go-sched-latency': {
    ko: { title: '스케줄러 지연 히스토그램', description: 'Go의 고루틴이 실행 대기하는 시간이 어느 구간에 집중되어 있는지 보여주는 막대 차트입니다. 대부분이 짧은 구간에 있으면 정상이고, 긴 구간에도 많이 분포되면 CPU 경합이 심한 것입니다.' },
    en: { title: 'Scheduler Latency Histogram', description: 'A histogram showing how goroutine scheduling delays are distributed. Ideally most delays fall in the shortest bucket. If significant delays appear in longer buckets, the CPU is heavily contended.' },
    ja: { title: 'スケジューラレイテンシヒストグラム', description: 'Goのゴルーチンが実行待機する時間がどの区間に集中しているかを表示する棒グラフです。ほとんどが短い区間にあれば正常で、長い区間にも多く分布している場合はCPU競合が激しいことを意味します。' },
  },
  'chart-go-gc-stw': {
    ko: { title: 'GC STW 일시정지', description: 'Go의 메모리 정리 시 모든 작업이 멈추는 시간의 변화를 보여주는 차트입니다. 일시정지가 길어지면 순간적인 응답 끊김이 발생하므로, 메모리 할당 패턴을 최적화하세요.' },
    en: { title: 'GC Stop-the-World Pause', description: 'A chart showing how long Go\'s garbage collection pauses last over time. During these pauses all work stops momentarily. If pauses grow longer, optimize memory allocation patterns to reduce GC pressure.' },
    ja: { title: 'GC STWポーズ', description: 'Goのメモリ整理時にすべての処理が停止する時間の変化を表示するチャートです。一時停止が長くなると瞬間的な応答の途切れが発生するため、メモリ割り当てパターンの最適化を検討してください。' },
  },
  'chart-go-goroutine-breakdown': {
    ko: { title: '에이전트별 고루틴 분석', description: '각 에이전트(서버)의 고루틴이 실행 중(Runnable)인지 대기 중(Waiting)인지를 비교하는 차트입니다. 대기 비율이 높은 에이전트는 I/O 병목이나 잠금 경합이 있을 수 있으므로 확인하세요.' },
    en: { title: 'Goroutine Breakdown', description: 'A chart comparing runnable versus waiting goroutines per agent. If an agent has a high proportion of waiting goroutines, it may be experiencing I/O bottlenecks or lock contention that needs investigation.' },
    ja: { title: 'エージェント別ゴルーチン分析', description: '各エージェント（サーバー）のゴルーチンが実行中（Runnable）か待機中（Waiting）かを比較するチャートです。待機割合が高いエージェントはI/Oボトルネックやロック競合がある可能性があるため確認してください。' },
  },
  'chart-dotnet-threadpool': {
    ko: { title: '.NET ThreadPool', description: '.NET 스레드 풀의 스레드 수와 대기열 길이의 시간별 변화를 보여줍니다. 대기열이 계속 늘어나면 스레드가 부족하여 요청 처리가 밀리고 있다는 뜻이므로 비동기 코드 활용을 검토하세요.' },
    en: { title: '.NET ThreadPool', description: 'A chart showing .NET thread pool thread counts and queue lengths over time. If the queue keeps growing, threads cannot keep up with demand. Consider using async code or increasing the thread pool size.' },
    ja: { title: '.NET ThreadPool', description: '.NETスレッドプールのスレッド数とキュー長の時間別変化を表示します。キューが増え続ける場合はスレッドが不足してリクエスト処理が滞っているため、非同期コードの活用を検討してください。' },
  },
  'chart-dotnet-gc': {
    ko: { title: '.NET GC 세대별 수집', description: '.NET 메모리 정리(GC)가 각 세대별로 얼마나 자주 발생하는지 보여주는 차트입니다. Gen0은 자주, Gen2는 드물게 실행되는 것이 정상이며, Gen2가 자주 실행되면 메모리 사용 패턴에 문제가 있을 수 있습니다.' },
    en: { title: '.NET GC Collections', description: 'A chart showing how often .NET garbage collection runs by generation. Gen0 collections should be frequent and Gen2 rare. If Gen2 runs often, the application has memory usage patterns that should be optimized.' },
    ja: { title: '.NET GC世代別収集', description: '.NETメモリ整理（GC）が各世代別にどれくらい頻繁に実行されるかを表示するチャートです。Gen0は頻繁に、Gen2はまれに実行されるのが正常で、Gen2が頻繁に実行される場合はメモリ使用パターンに問題がある可能性があります。' },
  },
  'table-dotnet-aot-warnings': {
    ko: { title: 'AOT 제한 경고', description: '.NET Native AOT 환경에서 호환되지 않는 코드에 대한 경고 목록입니다. 리플렉션이나 동적 코드 사용 부분이 나열되며, 이를 수정하지 않으면 런타임 오류가 발생할 수 있습니다.' },
    en: { title: 'AOT Restriction Warnings', description: 'A list of code compatibility warnings for .NET Native AOT. These flag reflection and dynamic code usage that may cause runtime failures. Fix the flagged code to ensure the application runs reliably in AOT mode.' },
    ja: { title: 'AOT制限警告', description: '.NET Native AOT環境で互換性のないコードに対する警告リストです。リフレクションや動的コードの使用箇所が列挙されており、修正しないとランタイムエラーが発生する可能性があります。' },
  },
};

// Fallback for unknown widgets
const DEFAULT_DESC: Record<Locale, { title: string; description: string }> = {
  ko: { title: '가젯', description: '이 가젯에 대한 설명이 아직 등록되지 않았습니다. 관리자에게 문의하시면 도움말을 추가해 드립니다.' },
  en: { title: 'Widget', description: 'No description available for this widget yet.' },
  ja: { title: 'ウィジェット', description: 'このウィジェットの説明はまだ登録されていません。管理者にお問い合わせいただければヘルプを追加いたします。' },
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
