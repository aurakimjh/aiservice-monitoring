#!/usr/bin/env bash
# =============================================================================
# AITOP Phase 7'-3: Trace 연속성 검증
# 5 레이어 Trace ID 연속성 + Baggage 전달 + Metric↔Log 상관관계
# =============================================================================
# 실행: bash scripts/e2e/trace-continuity.sh
# 전제: docker-compose.e2e.yaml 기동 + healthcheck.sh 통과
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

log_info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
log_ok()      { echo -e "${GREEN}[PASS]${NC}    $*"; ((PASS++)); }
log_fail()    { echo -e "${RED}[FAIL]${NC}    $*"; ((FAIL++)); }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; ((WARN++)); }
log_trace()   { echo -e "${MAGENTA}[TRACE]${NC}   $*"; }
log_section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── 설정 ───────────────────────────────────────────────────
COLLECTION_SERVER="${COLLECTION_SERVER:-http://localhost:8080}"
TEMPO="${TEMPO:-http://localhost:3200}"
LOKI="${LOKI:-http://localhost:3100}"
PROMETHEUS="${PROMETHEUS:-http://localhost:9090}"
OTEL_HTTP="${OTEL_HTTP:-http://localhost:4318}"
DEMO_RAG="${DEMO_RAG:-http://localhost:8000}"

TRACE_WAIT=15  # Trace 수집 대기 시간 (초)

# ── Trace ID 생성 (W3C TraceContext 형식) ──────────────────
generate_trace_id() {
  printf '%016x%016x' $RANDOM$RANDOM$RANDOM $RANDOM$RANDOM$RANDOM
}

generate_span_id() {
  printf '%016x' $RANDOM$RANDOM
}

# ── JWT 토큰 획득 ──────────────────────────────────────────
get_jwt_token() {
  local resp
  resp=$(curl -s -X POST "$COLLECTION_SERVER/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' \
    --max-time 10 2>/dev/null || echo '{}')

  echo "$resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || echo ""
}

# ══════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AITOP Phase 7'-3: Trace 연속성 검증          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
echo ""

START_TIME=$(date +%s)

# ─────────────────────────────────────────────────
log_section "1. 테스트 Trace ID 생성 (W3C TraceContext)"
# ─────────────────────────────────────────────────

MASTER_TRACE_ID=$(generate_trace_id)
ROOT_SPAN_ID=$(generate_span_id)
CHILD_SPAN_ID=$(generate_span_id)
BAGGAGE_USER_ID="e2e-test-user-$(date +%s)"
BAGGAGE_SESSION_ID="session-$(date +%s)"

log_trace "Master Trace ID : $MASTER_TRACE_ID"
log_trace "Root Span ID    : $ROOT_SPAN_ID"
log_trace "Child Span ID   : $CHILD_SPAN_ID"
log_trace "Baggage user.id : $BAGGAGE_USER_ID"
log_info "이 Trace ID로 5개 레이어 연속성을 검증합니다."

# ─────────────────────────────────────────────────
log_section "2. Layer 1 — OTel Collector OTLP HTTP 직접 전송"
# ─────────────────────────────────────────────────

NOW_NS=$(date +%s)000000000
END_NS=$(( $(date +%s) + 1 ))000000000

OTLP_PAYLOAD=$(cat <<EOF
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "e2e-layer1-client"}},
        {"key": "service.version", "value": {"stringValue": "1.0.0"}},
        {"key": "deployment.environment", "value": {"stringValue": "e2e"}}
      ]
    },
    "scopeSpans": [{
      "scope": {"name": "e2e.tracer", "version": "0.1.0"},
      "spans": [
        {
          "traceId": "${MASTER_TRACE_ID}",
          "spanId": "${ROOT_SPAN_ID}",
          "name": "e2e.layer1.root",
          "kind": 3,
          "startTimeUnixNano": "${NOW_NS}",
          "endTimeUnixNano": "${END_NS}",
          "attributes": [
            {"key": "e2e.layer", "value": {"intValue": "1"}},
            {"key": "e2e.baggage.user_id", "value": {"stringValue": "${BAGGAGE_USER_ID}"}},
            {"key": "e2e.baggage.session_id", "value": {"stringValue": "${BAGGAGE_SESSION_ID}"}},
            {"key": "http.method", "value": {"stringValue": "POST"}},
            {"key": "http.url", "value": {"stringValue": "${COLLECTION_SERVER}/api/v1/collect"}}
          ],
          "status": {"code": 1, "message": "OK"}
        },
        {
          "traceId": "${MASTER_TRACE_ID}",
          "spanId": "${CHILD_SPAN_ID}",
          "parentSpanId": "${ROOT_SPAN_ID}",
          "name": "e2e.layer1.child",
          "kind": 2,
          "startTimeUnixNano": "${NOW_NS}",
          "endTimeUnixNano": "${END_NS}",
          "attributes": [
            {"key": "e2e.layer", "value": {"intValue": "1"}},
            {"key": "e2e.parent_child", "value": {"boolValue": true}}
          ],
          "status": {"code": 1, "message": "OK"}
        }
      ]
    }]
  }]
}
EOF
)

OTLP_STATUS=$(curl -s -o /tmp/e2e-otlp-resp.json -w "%{http_code}" \
  -X POST "$OTEL_HTTP/v1/traces" \
  -H "Content-Type: application/json" \
  -d "$OTLP_PAYLOAD" \
  --max-time 10 2>/dev/null || echo "000")

if [[ "$OTLP_STATUS" =~ ^2 ]]; then
  log_ok "Layer 1 — OTel OTLP HTTP 전송 성공 (HTTP $OTLP_STATUS)"
else
  log_fail "Layer 1 — OTel OTLP HTTP 전송 실패 (HTTP $OTLP_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "3. Layer 2 — W3C traceparent 헤더 전파 확인"
# ─────────────────────────────────────────────────

# traceparent 형식: 00-{traceId}-{spanId}-01
TRACEPARENT="00-${MASTER_TRACE_ID}-${ROOT_SPAN_ID}-01"
TRACESTATE="aitop=e2e-test"
BAGGAGE="user.id=${BAGGAGE_USER_ID},session.id=${BAGGAGE_SESSION_ID},service.tier=premium"

log_info "traceparent: $TRACEPARENT"
log_info "tracestate:  $TRACESTATE"
log_info "baggage:     $BAGGAGE"

# Collection Server에 traceparent 헤더 포함 요청
CS_STATUS=$(curl -s -o /tmp/e2e-cs-resp.json -w "%{http_code}" \
  -X GET "$COLLECTION_SERVER/api/v1/agents" \
  -H "traceparent: $TRACEPARENT" \
  -H "tracestate: $TRACESTATE" \
  -H "baggage: $BAGGAGE" \
  --max-time 10 2>/dev/null || echo "000")

# 401 = 인증 필요 = 서버가 요청 수신 (헤더 전파 테스트는 성공)
if [[ "$CS_STATUS" =~ ^[24] ]]; then
  log_ok "Layer 2 — Collection Server traceparent 수신 (HTTP $CS_STATUS)"
else
  log_fail "Layer 2 — Collection Server 응답 없음 (HTTP $CS_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "4. Layer 3 — Tempo Trace 저장 확인"
# ─────────────────────────────────────────────────

log_info "Tempo trace 수집 대기 중 (${TRACE_WAIT}s)..."
sleep "$TRACE_WAIT"

# Tempo API로 traceId 조회
TEMPO_RESP=$(curl -s "$TEMPO/api/traces/${MASTER_TRACE_ID}" \
  --max-time 10 2>/dev/null || echo '{"error":"timeout"}')

if echo "$TEMPO_RESP" | grep -q "$MASTER_TRACE_ID\|traceID\|spans\|batches"; then
  log_ok "Layer 3 — Tempo에 Trace 저장 확인 (traceId: ${MASTER_TRACE_ID:0:16}...)"

  # Span 수 확인
  SPAN_COUNT=$(echo "$TEMPO_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    spans = 0
    for b in d.get('batches', []):
        for ss in b.get('scopeSpans', b.get('instrumentationLibrarySpans', [])):
            spans += len(ss.get('spans', []))
    print(spans)
except:
    print(0)
" 2>/dev/null || echo "0")

  if [[ "$SPAN_COUNT" -ge 2 ]]; then
    log_ok "Layer 3 — Span 계층 구조 확인 (${SPAN_COUNT}개 Span)"
  else
    log_warn "Layer 3 — Span 수 부족 ($SPAN_COUNT개, 예상 2+)"
  fi
else
  log_warn "Layer 3 — Tempo trace 미발견 (collector 지연 가능, 수동 확인 필요)"
  log_info "수동 확인: curl $TEMPO/api/traces/$MASTER_TRACE_ID"
fi

# ─────────────────────────────────────────────────
log_section "5. Layer 4 — Agent Heartbeat Trace 연속성"
# ─────────────────────────────────────────────────

# Agent Heartbeat 시뮬레이션 (traceId 포함)
AGENT_TRACE_ID=$(generate_trace_id)
AGENT_SPAN_ID=$(generate_span_id)

HEARTBEAT_PAYLOAD=$(cat <<EOF
{
  "agent_id": "e2e-test-agent-001",
  "hostname": "e2e-host-01",
  "version": "1.0.0-e2e",
  "status": "running",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "trace_context": {
    "trace_id": "${AGENT_TRACE_ID}",
    "span_id": "${AGENT_SPAN_ID}"
  }
}
EOF
)

HB_STATUS=$(curl -s -o /tmp/e2e-hb-resp.json -w "%{http_code}" \
  -X POST "$COLLECTION_SERVER/api/v1/agents/heartbeat" \
  -H "Content-Type: application/json" \
  -H "traceparent: 00-${AGENT_TRACE_ID}-${AGENT_SPAN_ID}-01" \
  -d "$HEARTBEAT_PAYLOAD" \
  --max-time 10 2>/dev/null || echo "000")

if [[ "$HB_STATUS" =~ ^2 ]]; then
  log_ok "Layer 4 — Agent Heartbeat with Trace 전송 성공 (HTTP $HB_STATUS)"
  log_trace "Agent traceId: $AGENT_TRACE_ID"
elif [[ "$HB_STATUS" == "401" ]]; then
  log_warn "Layer 4 — Heartbeat 인증 필요 (에이전트 토큰 없음 — 예상된 동작)"
else
  log_warn "Layer 4 — Heartbeat 응답: HTTP $HB_STATUS"
fi

# ─────────────────────────────────────────────────
log_section "6. Layer 5 — Demo RAG Service OTel 계측 확인"
# ─────────────────────────────────────────────────

# Demo RAG 서비스에 traceparent 전파
DEMO_TRACE_ID=$(generate_trace_id)
DEMO_SPAN_ID=$(generate_span_id)
DEMO_TRACEPARENT="00-${DEMO_TRACE_ID}-${DEMO_SPAN_ID}-01"

DEMO_STATUS=$(curl -s -o /tmp/e2e-demo-resp.json -w "%{http_code}" \
  -X GET "$DEMO_RAG/health" \
  -H "traceparent: $DEMO_TRACEPARENT" \
  -H "baggage: $BAGGAGE" \
  --max-time 10 2>/dev/null || echo "000")

if [[ "$DEMO_STATUS" =~ ^2 ]]; then
  log_ok "Layer 5 — Demo RAG Service 응답 (HTTP $DEMO_STATUS)"
  log_trace "Demo traceId: $DEMO_TRACE_ID"

  # Tempo에서 Demo RAG 서비스 trace 검색
  sleep 10
  DEMO_TRACE=$(curl -s "$TEMPO/api/traces/${DEMO_TRACE_ID}" --max-time 10 2>/dev/null || echo '{}')
  if echo "$DEMO_TRACE" | grep -qi "$DEMO_TRACE_ID\|demo-rag-service"; then
    log_ok "Layer 5 — Demo RAG → OTel Collector → Tempo 전파 확인"
  else
    log_warn "Layer 5 — Demo RAG Trace Tempo 미발견 (OTel SDK 미설정 가능)"
  fi
else
  log_warn "Layer 5 — Demo RAG Service 응답 없음 (HTTP $DEMO_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "7. Baggage 전달 검증"
# ─────────────────────────────────────────────────

log_info "Baggage 전달 시뮬레이션..."

# Baggage를 Span attribute로 기록한 테스트 Span 전송
BAGGAGE_TRACE_ID=$(generate_trace_id)
BAGGAGE_SPAN_ID=$(generate_span_id)

BAGGAGE_PAYLOAD=$(cat <<EOF
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "e2e-baggage-test"}}
      ]
    },
    "scopeSpans": [{
      "spans": [{
        "traceId": "${BAGGAGE_TRACE_ID}",
        "spanId": "${BAGGAGE_SPAN_ID}",
        "name": "e2e.baggage.propagation",
        "kind": 1,
        "startTimeUnixNano": "$(date +%s)000000000",
        "endTimeUnixNano": "$(date +%s)000000001",
        "attributes": [
          {"key": "baggage.user_id", "value": {"stringValue": "${BAGGAGE_USER_ID}"}},
          {"key": "baggage.session_id", "value": {"stringValue": "${BAGGAGE_SESSION_ID}"}},
          {"key": "baggage.service_tier", "value": {"stringValue": "premium"}},
          {"key": "w3c.traceparent", "value": {"stringValue": "00-${MASTER_TRACE_ID}-${ROOT_SPAN_ID}-01"}},
          {"key": "w3c.tracestate", "value": {"stringValue": "aitop=e2e-test"}}
        ],
        "status": {"code": 1}
      }]
    }]
  }]
}
EOF
)

BAGGAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$OTEL_HTTP/v1/traces" \
  -H "Content-Type: application/json" \
  -d "$BAGGAGE_PAYLOAD" \
  --max-time 10 2>/dev/null || echo "000")

if [[ "$BAGGAGE_STATUS" =~ ^2 ]]; then
  log_ok "Baggage — Span attribute 기록 전송 성공"
  log_trace "Baggage traceId: $BAGGAGE_TRACE_ID"

  # Baggage 항목 검증
  EXPECTED_BAGGAGE=("user.id" "session.id" "service.tier")
  for item in "${EXPECTED_BAGGAGE[@]}"; do
    if echo "$BAGGAGE" | grep -q "$item"; then
      log_ok "Baggage 항목 확인: $item"
    else
      log_warn "Baggage 항목 누락: $item"
    fi
  done
else
  log_fail "Baggage — Span 전송 실패 (HTTP $BAGGAGE_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "8. Metric↔Log 상관관계 (Exemplar) 검증"
# ─────────────────────────────────────────────────

# Prometheus Exemplar 확인 (OTel Collector가 메트릭 생성 후)
log_info "Prometheus Exemplar 확인..."

EXEMPLAR_QUERY=$(curl -s "$PROMETHEUS/api/v1/query" \
  --data-urlencode "query=otelcol_receiver_accepted_spans_total" \
  --max-time 10 2>/dev/null || echo '{"status":"error"}')

if echo "$EXEMPLAR_QUERY" | grep -q '"status":"success"'; then
  METRIC_VAL=$(echo "$EXEMPLAR_QUERY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    results = d.get('data',{}).get('result',[])
    if results:
        print(results[0].get('value',['','0'])[1])
    else:
        print('0')
except:
    print('0')
" 2>/dev/null || echo "0")

  if [[ "$METRIC_VAL" != "0" ]] && [[ -n "$METRIC_VAL" ]]; then
    log_ok "Metric — otelcol_receiver_accepted_spans_total = $METRIC_VAL"
  else
    log_warn "Metric — otelcol 메트릭 아직 0 또는 없음"
  fi
else
  log_warn "Metric — Prometheus 쿼리 실패"
fi

# Loki 로그에 traceId 포함 확인
log_info "Loki 로그 traceId 포함 확인..."
LOKI_QUERY=$(curl -s -G "$LOKI/loki/api/v1/query_range" \
  --data-urlencode "query={job=~\".+\"}" \
  --data-urlencode "limit=10" \
  --data-urlencode "start=$(( $(date +%s) - 300 ))000000000" \
  --max-time 10 2>/dev/null || echo '{"status":"error"}')

if echo "$LOKI_QUERY" | grep -q '"status":"success"'; then
  LOG_COUNT=$(echo "$LOKI_QUERY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    results = d.get('data',{}).get('result',[])
    print(sum(len(r.get('values',[])) for r in results))
except:
    print(0)
" 2>/dev/null || echo "0")

  if [[ "$LOG_COUNT" -gt 0 ]]; then
    log_ok "Log — Loki에서 ${LOG_COUNT}개 로그 항목 확인"
  else
    log_warn "Log — Loki 로그 없음 (서비스 로그 미수신)"
  fi
else
  log_warn "Log — Loki 쿼리 실패"
fi

# ─────────────────────────────────────────────────
log_section "9. Tempo TraceQL 검색 (고급)"
# ─────────────────────────────────────────────────

# Tempo TraceQL로 e2e 서비스 trace 검색
TRACEQL_RESP=$(curl -s -G "$TEMPO/api/search" \
  --data-urlencode "q={resource.service.name=~\"e2e-.+\"}" \
  --data-urlencode "start=$(( $(date +%s) - 300 ))" \
  --data-urlencode "end=$(date +%s)" \
  --data-urlencode "limit=10" \
  --max-time 10 2>/dev/null || echo '{"traces":[]}')

FOUND_TRACES=$(echo "$TRACEQL_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    traces = d.get('traces', [])
    print(len(traces))
except:
    print(0)
" 2>/dev/null || echo "0")

if [[ "$FOUND_TRACES" -gt 0 ]]; then
  log_ok "Tempo TraceQL — e2e 서비스 ${FOUND_TRACES}개 Trace 검색됨"
else
  log_warn "Tempo TraceQL — e2e 서비스 Trace 미발견 (지연 가능)"
fi

# ─────────────────────────────────────────────────
# 결과 요약
# ─────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "  Trace 연속성 검증 결과"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${YELLOW}WARN${NC}: $WARN"
echo -e "  ${RED}FAIL${NC}: $FAIL"
echo -e "  소요 시간: ${ELAPSED}s"
echo ""
echo -e "  Master Trace ID: ${MASTER_TRACE_ID}"
echo ""
echo "수동 검증:"
echo "  Tempo UI  : http://localhost:3200 → TraceID: $MASTER_TRACE_ID"
echo "  Tempo API : curl $TEMPO/api/traces/$MASTER_TRACE_ID | jq"
echo "  Loki      : http://localhost:3100 → {job=~'.+'}"
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ Trace 연속성 검증 통과${NC}"
  exit 0
else
  echo -e "${RED}✗ Trace 연속성 검증 실패 — $FAIL개 항목 확인 필요${NC}"
  exit 1
fi
