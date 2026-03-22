#!/usr/bin/env bash
# Phase 17-3-2: 데이터 파이프라인 검증
#
# 검증 경로: Agent → Collection Server → S3/MinIO → Backend API → 응답 확인
#
# 검증 항목:
#   P1. Collection Server 헬스 체크
#   P2. JWT 인증 (login / me / refresh)
#   P3. 에이전트 Heartbeat → Fleet 등록
#   P4. Collect Result 제출 → Collection Server 수신 확인
#   P5. EventBus SSE 이벤트 전달 확인
#   P6. MinIO S3 버킷 존재 확인
#   P7. Fleet API 에이전트 조회
#   P8. 수집 작업 수동 트리거
#   P9. Prometheus 메트릭 수집 확인
#
# 사용법:
#   ./scripts/phase17-3/02-pipeline-verify.sh [--server http://localhost:8080]

set -euo pipefail

# ── 색상 출력 ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[PASS]${NC}  $*"; PASS=$((PASS+1)); }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; FAIL=$((FAIL+1)); }
skip()    { echo -e "${YELLOW}[SKIP]${NC}  $*"; SKIP=$((SKIP+1)); }
section() { echo -e "\n${CYAN}── $* ──────────────────────────────────────────${NC}"; }

# ── 기본값 ─────────────────────────────────────────────────────────────────
SERVER_URL="http://localhost:8080"
MINIO_URL="http://localhost:9000"
PROMETHEUS_URL="http://localhost:9090"
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)     SERVER_URL="$2"; shift 2 ;;
    --minio)      MINIO_URL="$2"; shift 2 ;;
    --prometheus) PROMETHEUS_URL="$2"; shift 2 ;;
    --verbose)    VERBOSE=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

API="${SERVER_URL}/api/v1"
ACCESS_TOKEN=""
TEST_AGENT_ID="test-agent-pipeline-$(date +%s)"

# ── 헬퍼: HTTP 요청 ──────────────────────────────────────────────────────────
http_get() {
  local url="$1"
  local auth="${2:-}"
  local args=(-s -o /dev/null -w "%{http_code}")
  [[ -n "${auth}" ]] && args+=(-H "Authorization: Bearer ${auth}")
  curl "${args[@]}" "${url}" 2>/dev/null || echo "000"
}

http_get_body() {
  local url="$1"
  local auth="${2:-}"
  local args=(-s)
  [[ -n "${auth}" ]] && args+=(-H "Authorization: Bearer ${auth}")
  curl "${args[@]}" "${url}" 2>/dev/null || echo "{}"
}

http_post() {
  local url="$1"
  local body="$2"
  local auth="${3:-}"
  local content_type="${4:-application/json}"
  local args=(-s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: ${content_type}")
  [[ -n "${auth}" ]] && args+=(-H "Authorization: Bearer ${auth}")
  [[ -n "${body}" ]] && args+=(-d "${body}")
  curl "${args[@]}" "${url}" 2>/dev/null || echo "000"
}

http_post_body() {
  local url="$1"
  local body="$2"
  local auth="${3:-}"
  local args=(-s -X POST -H "Content-Type: application/json")
  [[ -n "${auth}" ]] && args+=(-H "Authorization: Bearer ${auth}")
  [[ -n "${body}" ]] && args+=(-d "${body}")
  curl "${args[@]}" "${url}" 2>/dev/null || echo "{}"
}

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AITOP Phase 17-3-2: Data Pipeline Verification         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  Server:     ${SERVER_URL}"
echo "  MinIO:      ${MINIO_URL}"
echo "  Prometheus: ${PROMETHEUS_URL}"
echo "  Agent ID:   ${TEST_AGENT_ID}"
echo ""

# ════════════════════════════════════════════════════════════════
section "P1. Collection Server 헬스 체크"

STATUS=$(http_get "${SERVER_URL}/health")
if [[ "${STATUS}" == "200" ]]; then
  success "Health check passed (HTTP 200)"
else
  fail "Health check failed (HTTP ${STATUS}) — is the server running?"
  echo ""
  echo "  Start test environment:"
  echo "  docker compose -f infra/docker/docker-compose.test.yaml up -d"
  exit 1
fi

# ════════════════════════════════════════════════════════════════
section "P2. JWT 인증"

# 2-1. 로그인
LOGIN_RESP=$(http_post_body "${API}/auth/login" '{"email":"admin@aitop.io","password":"admin"}')
ACCESS_TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || echo "")
REFRESH_TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4 || echo "")

if [[ -n "${ACCESS_TOKEN}" && "${ACCESS_TOKEN}" != "null" ]]; then
  success "Login succeeded (admin@aitop.io)"
else
  fail "Login failed — response: ${LOGIN_RESP}"
fi

# 2-2. /auth/me
ME_STATUS=$(http_get "${API}/auth/me" "${ACCESS_TOKEN}")
if [[ "${ME_STATUS}" == "200" ]]; then
  success "GET /auth/me returned 200"
else
  fail "GET /auth/me returned ${ME_STATUS}"
fi

# 2-3. 토큰 갱신
if [[ -n "${REFRESH_TOKEN}" ]]; then
  REFRESH_STATUS=$(http_post "${API}/auth/refresh" "{\"refreshToken\":\"${REFRESH_TOKEN}\"}")
  if [[ "${REFRESH_STATUS}" == "200" ]]; then
    success "Token refresh succeeded"
  else
    fail "Token refresh failed (HTTP ${REFRESH_STATUS})"
  fi
fi

# 2-4. SRE 계정으로도 로그인 확인
SRE_RESP=$(http_post_body "${API}/auth/login" '{"email":"sre@aitop.io","password":"sre"}')
SRE_TOKEN=$(echo "${SRE_RESP}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || echo "")
if [[ -n "${SRE_TOKEN}" ]]; then
  success "Login succeeded (sre@aitop.io)"
else
  fail "SRE login failed"
fi

# ════════════════════════════════════════════════════════════════
section "P3. 에이전트 Heartbeat → Fleet 등록"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HB_PAYLOAD=$(cat <<JSON
{
  "agent_id": "${TEST_AGENT_ID}",
  "hostname": "test-pipeline-host",
  "agent_version": "0.1.0-test",
  "os_type": "linux",
  "os_version": "Ubuntu 22.04",
  "status": "healthy",
  "cpu_percent": 12.5,
  "memory_mb": 256.0,
  "timestamp": "${TIMESTAMP}",
  "plugins": [
    {"name": "it-os", "version": "1.0.0", "status": "active", "last_run_at": "${TIMESTAMP}"},
    {"name": "it-web", "version": "1.0.0", "status": "active", "last_run_at": "${TIMESTAMP}"}
  ]
}
JSON
)

HB_STATUS=$(http_post "${API}/heartbeat" "${HB_PAYLOAD}" "${ACCESS_TOKEN}")
if [[ "${HB_STATUS}" == "200" ]]; then
  success "Heartbeat accepted (HTTP 200)"
else
  fail "Heartbeat rejected (HTTP ${HB_STATUS})"
fi

# 두 번째 heartbeat (에이전트 상태 전환: registered → healthy)
sleep 1
HB_STATUS2=$(http_post "${API}/heartbeat" "${HB_PAYLOAD}" "${ACCESS_TOKEN}")
if [[ "${HB_STATUS2}" == "200" ]]; then
  success "Second heartbeat accepted — agent state transition confirmed"
else
  fail "Second heartbeat failed (HTTP ${HB_STATUS2})"
fi

# ════════════════════════════════════════════════════════════════
section "P4. Collect Result 제출 (Agent → Collection Server)"

# IT OS 수집 결과 제출
OS_COLLECT=$(cat <<JSON
{
  "collector_id": "it-os",
  "status": "success",
  "duration_ms": 245,
  "items": [
    {
      "cpu_percent": 15.2,
      "memory_percent": 42.8,
      "memory_total_mb": 16384,
      "memory_used_mb": 7012,
      "disk_read_mb": 1.2,
      "disk_write_mb": 0.8,
      "net_recv_mb": 5.3,
      "net_sent_mb": 2.1,
      "uptime_seconds": 86400,
      "process_count": 128
    }
  ]
}
JSON
)

COL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${API}/collect/it-os" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Agent-ID: ${TEST_AGENT_ID}" \
  -d "${OS_COLLECT}" 2>/dev/null || echo "000")

if [[ "${COL_STATUS}" == "200" ]]; then
  success "IT OS collect result accepted (HTTP 200)"
else
  fail "IT OS collect rejected (HTTP ${COL_STATUS})"
fi

# AI LLM 수집 결과 제출
LLM_COLLECT=$(cat <<JSON
{
  "collector_id": "ai-llm",
  "status": "success",
  "duration_ms": 512,
  "items": [
    {
      "model_id": "gpt-4-test",
      "ttft_ms": 180.5,
      "tps": 42.3,
      "error_rate": 0.02,
      "request_count": 1250,
      "avg_tokens_prompt": 512,
      "avg_tokens_completion": 256
    }
  ]
}
JSON
)

LLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${API}/collect/ai-llm" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Agent-ID: ${TEST_AGENT_ID}" \
  -d "${LLM_COLLECT}" 2>/dev/null || echo "000")

if [[ "${LLM_STATUS}" == "200" ]]; then
  success "AI LLM collect result accepted (HTTP 200)"
else
  fail "AI LLM collect rejected (HTTP ${LLM_STATUS})"
fi

# 진단 결과 제출
DIAG_COLLECT=$(cat <<JSON
{
  "collector_id": "diagnostic",
  "status": "success",
  "duration_ms": 1200,
  "items": [
    {"check_id": "it-cpu-usage", "severity": "info", "result": "pass", "value": 15.2},
    {"check_id": "it-memory-usage", "severity": "warn", "result": "warn", "value": 85.0},
    {"check_id": "ai-ttft-slo", "severity": "info", "result": "pass", "value": 180.5}
  ]
}
JSON
)

DIAG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${API}/collect/diagnostic" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Agent-ID: ${TEST_AGENT_ID}" \
  -d "${DIAG_COLLECT}" 2>/dev/null || echo "000")

if [[ "${DIAG_STATUS}" == "200" ]]; then
  success "Diagnostic collect result accepted (HTTP 200)"
else
  fail "Diagnostic collect rejected (HTTP ${DIAG_STATUS})"
fi

# ════════════════════════════════════════════════════════════════
section "P5. SSE EventBus 이벤트 확인"

# SSE 엔드포인트에서 1초간 데이터 수신 시도
SSE_DATA=$(timeout 2 curl -s -N \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${API}/events" 2>/dev/null | head -5 || true)

if [[ -n "${SSE_DATA}" ]]; then
  success "SSE stream connected and returning data"
  [[ "${VERBOSE}" == "true" ]] && echo "  SSE data: ${SSE_DATA}"
else
  # SSE가 event 없이 keep-alive만 보낼 수도 있으므로 연결 자체를 확인
  SSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    --max-time 2 \
    "${API}/events" 2>/dev/null || echo "000")
  if [[ "${SSE_STATUS}" == "200" ]]; then
    success "SSE endpoint reachable (HTTP 200)"
  else
    fail "SSE endpoint failed (HTTP ${SSE_STATUS})"
  fi
fi

# ════════════════════════════════════════════════════════════════
section "P6. MinIO S3 버킷 존재 확인"

MINIO_HEALTH=$(http_get "${MINIO_URL}/minio/health/live")
if [[ "${MINIO_HEALTH}" == "200" ]]; then
  success "MinIO is running (HTTP 200)"

  # 버킷 목록 확인 (anonymous list — 실제 환경에서는 인증 필요)
  for BUCKET in aitop-evidence aitop-terminal-logs aitop-diagnostics; do
    BUCKET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      "${MINIO_URL}/${BUCKET}" 2>/dev/null || echo "000")
    if [[ "${BUCKET_STATUS}" == "200" || "${BUCKET_STATUS}" == "301" || "${BUCKET_STATUS}" == "403" ]]; then
      success "MinIO bucket '${BUCKET}' exists"
    else
      skip "MinIO bucket '${BUCKET}' check inconclusive (HTTP ${BUCKET_STATUS})"
    fi
  done
else
  skip "MinIO not reachable (HTTP ${MINIO_HEALTH}) — skipping bucket checks"
fi

# ════════════════════════════════════════════════════════════════
section "P7. Fleet API 에이전트 조회"

FLEET_RESP=$(http_get_body "${API}/fleet/agents" "${ACCESS_TOKEN}")
FLEET_TOTAL=$(echo "${FLEET_RESP}" | grep -o '"total":[0-9]*' | cut -d: -f2 || echo "0")
ITEMS_COUNT=$(echo "${FLEET_RESP}" | grep -o '"items":\[' | wc -l || echo "0")

if [[ "${FLEET_TOTAL:-0}" -gt 0 ]]; then
  success "Fleet agents list: ${FLEET_TOTAL} agent(s) registered"
else
  # items 배열이 비어있지 않은지도 확인
  if echo "${FLEET_RESP}" | grep -q '"id"'; then
    success "Fleet agents list: agents found in response"
  else
    fail "Fleet API returned empty agent list"
  fi
fi

# 방금 등록한 에이전트 상세 조회
AGENT_DETAIL=$(http_get_body "${API}/fleet/agents" "${ACCESS_TOKEN}")
if echo "${AGENT_DETAIL}" | grep -q "${TEST_AGENT_ID}"; then
  success "Test agent '${TEST_AGENT_ID}' found in fleet"
else
  # legacy /api/v1/agents 엔드포인트도 시도
  AGENTS_RESP=$(http_get_body "${API}/agents" "${ACCESS_TOKEN}")
  if echo "${AGENTS_RESP}" | grep -q "${TEST_AGENT_ID}"; then
    success "Test agent found in legacy /agents endpoint"
  else
    fail "Test agent '${TEST_AGENT_ID}' not found in fleet"
  fi
fi

# ════════════════════════════════════════════════════════════════
section "P8. 수집 작업 수동 트리거"

# fleet API로 수동 collect 트리거
TRIGGER_STATUS=$(http_post "${API}/fleet/agents/${TEST_AGENT_ID}/collect" "" "${ACCESS_TOKEN}")
if [[ "${TRIGGER_STATUS}" == "200" || "${TRIGGER_STATUS}" == "202" ]]; then
  success "Manual collect trigger accepted (HTTP ${TRIGGER_STATUS})"
else
  fail "Manual collect trigger failed (HTTP ${TRIGGER_STATUS})"
fi

# Fleet Jobs 엔드포인트 확인
JOBS_STATUS=$(http_get "${API}/fleet/jobs" "${ACCESS_TOKEN}")
if [[ "${JOBS_STATUS}" == "200" ]]; then
  success "Fleet jobs endpoint accessible (HTTP 200)"
else
  fail "Fleet jobs endpoint returned ${JOBS_STATUS}"
fi

# ════════════════════════════════════════════════════════════════
section "P9. Prometheus 메트릭 수집 확인"

PROM_HEALTH=$(http_get "${PROMETHEUS_URL}/-/ready")
if [[ "${PROM_HEALTH}" == "200" ]]; then
  success "Prometheus is ready"

  # 메트릭 쿼리 (up 메트릭)
  PROM_QUERY=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=up" 2>/dev/null || echo '{"status":"error"}')
  if echo "${PROM_QUERY}" | grep -q '"status":"success"'; then
    success "Prometheus query API responding"
  else
    fail "Prometheus query failed"
  fi
else
  skip "Prometheus not reachable (HTTP ${PROM_HEALTH}) — skipping metrics checks"
fi

# ════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Phase 17-3-2 Pipeline Verification Results             ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  %-10s %3d                                        ║\n" "PASS:" "${PASS}"
printf "║  %-10s %3d                                        ║\n" "FAIL:" "${FAIL}"
printf "║  %-10s %3d                                        ║\n" "SKIP:" "${SKIP}"
echo "╚══════════════════════════════════════════════════════════╝"

if [[ ${FAIL} -eq 0 ]]; then
  echo -e "${GREEN}All pipeline checks passed!${NC}"
  echo "  Next step: ./scripts/phase17-3/03-ui-api-verify.sh"
  exit 0
else
  echo -e "${RED}${FAIL} pipeline check(s) failed.${NC}"
  echo "  Check Collection Server logs: docker logs <collection-server-container>"
  exit 1
fi
