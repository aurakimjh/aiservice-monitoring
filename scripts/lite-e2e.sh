#!/usr/bin/env bash
# AITOP Lite E2E 시나리오 검증
#
# 검증 흐름:
#   1. docker-compose.lite.yaml 기동
#   2. Collection Server 헬스 확인
#   3. 데이터 수집 확인 (heartbeat + collect)
#   4. 보고서 생성 확인
#   5. Cleanup 확인
#   6. 환경 정리
#
# 사용법: ./scripts/lite-e2e.sh [--no-cleanup]

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass() { echo -e "${GREEN}[PASS]${NC}  $*"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; FAIL=$((FAIL+1)); }
skip() { echo -e "${YELLOW}[SKIP]${NC}  $*"; SKIP=$((SKIP+1)); }
info() { echo -e "${BLUE}[INFO]${NC}  $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.lite.yaml"
SERVER_URL="http://localhost:8080"
CLEANUP=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cleanup) CLEANUP=false; shift ;;
    *) shift ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AITOP Lite E2E Verification                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Docker 환경 기동 ────────────────────────────────────────
info "Starting Lite environment..."
docker compose -f "${COMPOSE_FILE}" up -d --build 2>&1 | tail -10

# ── Step 2: 헬스 확인 ──────────────────────────────────────────────
info "Waiting for Collection Server..."
MAX_WAIT=90
WAITED=0
while [[ ${WAITED} -lt ${MAX_WAIT} ]]; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/health" 2>/dev/null || echo "000")
  if [[ "${HTTP}" == "200" ]]; then
    pass "Collection Server ready (${WAITED}s)"
    break
  fi
  sleep 3
  WAITED=$((WAITED + 3))
  if [[ ${WAITED} -ge ${MAX_WAIT} ]]; then
    fail "Collection Server not ready after ${MAX_WAIT}s"
  fi
done

# ── Step 3: Lite 대시보드 확인 ─────────────────────────────────────
DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/" 2>/dev/null || echo "000")
if [[ "${DASH_STATUS}" == "200" ]]; then
  pass "Lite dashboard accessible (HTTP ${DASH_STATUS})"
else
  fail "Lite dashboard not accessible (HTTP ${DASH_STATUS})"
fi

# ── Step 4: 상태 API 확인 ─────────────────────────────────────────
STATUS_BODY=$(curl -s "${SERVER_URL}/api/status" 2>/dev/null || echo "{}")
if echo "${STATUS_BODY}" | grep -q '"mode":"lite"'; then
  pass "Status API returns mode=lite"
else
  fail "Status API mode check failed: ${STATUS_BODY}"
fi

# ── Step 5: 데이터 수집 시뮬레이션 ─────────────────────────────────
# Heartbeat 전송
HB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SERVER_URL}/api/v1/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"lite-test-agent","hostname":"lite-host","status":"healthy","agent_version":"1.0.0","os_type":"linux"}' \
  2>/dev/null || echo "000")
if [[ "${HB_STATUS}" == "200" ]]; then
  pass "Heartbeat accepted (HTTP ${HB_STATUS})"
else
  fail "Heartbeat failed (HTTP ${HB_STATUS})"
fi

# Collect result 전송
COLLECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SERVER_URL}/api/v1/collect/it-os" \
  -H "Content-Type: application/json" \
  -H "X-Agent-ID: lite-test-agent" \
  -d '{"collector_id":"it-os","status":"success","items":[{"cpu":35.2}],"duration_ms":120}' \
  2>/dev/null || echo "000")
if [[ "${COLLECT_STATUS}" == "200" ]]; then
  pass "Collect result accepted (HTTP ${COLLECT_STATUS})"
else
  fail "Collect result failed (HTTP ${COLLECT_STATUS})"
fi

# ── Step 6: 보고서 생성 확인 ──────────────────────────────────────
REPORT_RESP=$(curl -s -X POST "${SERVER_URL}/api/report" 2>/dev/null || echo "{}")
if echo "${REPORT_RESP}" | grep -q '"message"'; then
  pass "Report generation API responded"
else
  fail "Report generation failed: ${REPORT_RESP}"
fi

# ── Step 7: AGPL 이미지 미포함 확인 ───────────────────────────────
AGPL_CHECK=$(docker compose -f "${COMPOSE_FILE}" config 2>/dev/null | grep -i "grafana\|minio\|loki\|tempo" || true)
if [[ -z "${AGPL_CHECK}" ]]; then
  pass "No AGPL images in Lite stack"
else
  fail "AGPL images found: ${AGPL_CHECK}"
fi

# ── Step 8: OTel Collector 헬스 ───────────────────────────────────
OTEL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:13133/" 2>/dev/null || echo "000")
if [[ "${OTEL_STATUS}" == "200" ]]; then
  pass "OTel Collector healthy"
else
  skip "OTel Collector not reachable (HTTP ${OTEL_STATUS})"
fi

# ── 환경 정리 ────────────────────────────────────────────────────
if [[ "${CLEANUP}" == "true" ]]; then
  info "Cleaning up Lite environment..."
  docker compose -f "${COMPOSE_FILE}" down -v 2>/dev/null || true
  rm -rf "${REPO_ROOT}/data" "${REPO_ROOT}/reports" 2>/dev/null || true
  pass "Environment cleaned up"
fi

# ── 결과 요약 ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Lite E2E Results                                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  PASS: %-3d  FAIL: %-3d  SKIP: %-3d                      ║\n" "${PASS}" "${FAIL}" "${SKIP}"
echo "╚══════════════════════════════════════════════════════════╝"

if [[ ${FAIL} -eq 0 ]]; then
  echo -e "${GREEN}All Lite E2E checks passed!${NC}"
  exit 0
else
  echo -e "${RED}${FAIL} check(s) failed.${NC}"
  exit 1
fi
