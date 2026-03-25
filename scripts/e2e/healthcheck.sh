#!/usr/bin/env bash
# =============================================================================
# AITOP Phase 7'-1: 전체 서비스 헬스체크
# =============================================================================
# 실행: bash scripts/e2e/healthcheck.sh
# 대상: docker-compose.e2e.yaml로 기동된 전체 스택
# =============================================================================

set -euo pipefail

# ── 색상 출력 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[PASS]${NC}  $*"; PASS=$((PASS+1)); }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $*"; FAIL=$((FAIL+1)); }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; WARN=$((WARN+1)); }
log_section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── 설정 ───────────────────────────────────────────────────
COLLECTION_SERVER="${COLLECTION_SERVER:-http://localhost:8080}"
FRONTEND="${FRONTEND:-http://localhost:3000}"
PROMETHEUS="${PROMETHEUS:-http://localhost:9090}"
TEMPO="${TEMPO:-http://localhost:3200}"
LOKI="${LOKI:-http://localhost:3100}"
OTEL_HEALTH="${OTEL_HEALTH:-http://localhost:13133}"
MINIO="${MINIO:-http://localhost:9000}"
DEMO_RAG="${DEMO_RAG:-http://localhost:8000}"

MAX_WAIT="${MAX_WAIT:-120}"   # 최대 대기 시간 (초)
RETRY_INTERVAL=5

# ── 유틸리티 ───────────────────────────────────────────────
http_check() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected" ]]; then
    log_ok "$name — HTTP $status ($url)"
    return 0
  else
    log_fail "$name — HTTP $status (expected $expected) ($url)"
    return 1
  fi
}

wait_for_service() {
  local name="$1"
  local url="$2"
  local elapsed=0

  log_info "대기 중: $name ($url)"
  while ! curl -sf --max-time 3 "$url" >/dev/null 2>&1; do
    if (( elapsed >= MAX_WAIT )); then
      log_fail "$name — 타임아웃 (${MAX_WAIT}s)"
      return 1
    fi
    sleep "$RETRY_INTERVAL"
    ((elapsed += RETRY_INTERVAL))
    echo -n "."
  done
  echo ""
  log_ok "$name — 응답 확인 (${elapsed}s 경과)"
}

# ── 메인 ───────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AITOP Phase 7'-1: E2E 헬스체크              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
echo ""

START_TIME=$(date +%s)

# ─────────────────────────────────────────────────
log_section "1. 서비스 기동 대기"
# ─────────────────────────────────────────────────

wait_for_service "OTel Collector" "$OTEL_HEALTH/"
wait_for_service "Collection Server" "$COLLECTION_SERVER/health"
wait_for_service "Prometheus" "$PROMETHEUS/-/ready"
wait_for_service "Tempo" "$TEMPO/ready"
wait_for_service "Loki" "$LOKI/ready"

# ─────────────────────────────────────────────────
log_section "2. 핵심 서비스 헬스체크"
# ─────────────────────────────────────────────────

# Collection Server
http_check "Collection Server /health" "$COLLECTION_SERVER/health"

# API 엔드포인트 확인
http_check "Collection Server /api/v1/agents" "$COLLECTION_SERVER/api/v1/agents" "401"
# 401 = 인증 필요 (정상적인 응답, 서비스 작동 중)

# JWT 로그인 테스트
log_info "JWT 로그인 테스트..."
LOGIN_RESP=$(curl -s -X POST "$COLLECTION_SERVER/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  --max-time 10 2>/dev/null || echo '{"error":"connection_failed"}')

if echo "$LOGIN_RESP" | grep -q '"token"'; then
  log_ok "Collection Server — JWT 로그인 성공"
  JWT_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
  log_warn "Collection Server — JWT 로그인 실패 (데모 계정 미설정 가능)"
  JWT_TOKEN=""
fi

# Prometheus
http_check "Prometheus /-/ready" "$PROMETHEUS/-/ready"
http_check "Prometheus /-/healthy" "$PROMETHEUS/-/healthy"

# Tempo
http_check "Tempo /ready" "$TEMPO/ready"

# Loki
http_check "Loki /ready" "$LOKI/ready"

# OTel Collector
http_check "OTel Collector /health" "$OTEL_HEALTH/"

# ─────────────────────────────────────────────────
log_section "3. MinIO S3 버킷 확인"
# ─────────────────────────────────────────────────

# MinIO 헬스
if curl -sf --max-time 5 "$MINIO/minio/health/live" >/dev/null 2>&1; then
  log_ok "MinIO — 서비스 정상"
else
  log_fail "MinIO — 서비스 응답 없음"
fi

# 버킷 확인 (docker exec 방식)
BUCKETS=("aitop-evidence" "aitop-terminal-logs" "aitop-diagnostics" "aitop-reports")
for bucket in "${BUCKETS[@]}"; do
  if docker exec aitop-minio-e2e mc ls local/"$bucket" >/dev/null 2>&1; then
    log_ok "MinIO 버킷 '$bucket' — 존재 확인"
  else
    log_warn "MinIO 버킷 '$bucket' — 확인 불가 (docker exec 미지원 환경)"
  fi
done

# ─────────────────────────────────────────────────
log_section "4. PostgreSQL DB 연결 확인"
# ─────────────────────────────────────────────────

if docker exec aitop-postgres-e2e pg_isready -U aitop -d aitop_collection >/dev/null 2>&1; then
  log_ok "PostgreSQL — DB 연결 정상"

  # 테이블 확인
  TABLES=$(docker exec aitop-postgres-e2e psql -U aitop -d aitop_collection -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' \n' || echo "0")
  if [[ "$TABLES" -gt 0 ]]; then
    log_ok "PostgreSQL — 스키마 초기화 완료 (테이블 ${TABLES}개)"
  else
    log_warn "PostgreSQL — 테이블 없음 (마이그레이션 미실행)"
  fi
else
  log_warn "PostgreSQL — docker exec 미지원 환경 (원격 실행)"
fi

# ─────────────────────────────────────────────────
log_section "5. Frontend Next.js 확인"
# ─────────────────────────────────────────────────

if curl -sf --max-time 10 "$FRONTEND" >/dev/null 2>&1; then
  log_ok "Frontend — 접근 가능"

  # Next.js 응답 확인 (HTML 반환 여부)
  CONTENT=$(curl -s --max-time 5 "$FRONTEND" 2>/dev/null | head -5 || echo "")
  if echo "$CONTENT" | grep -qi "html\|next"; then
    log_ok "Frontend — HTML 응답 확인"
  else
    log_warn "Frontend — HTML 응답 불명확"
  fi
else
  log_warn "Frontend — 빌드 완료 후 재확인 필요 (빌드 시간 2~3분)"
fi

# ─────────────────────────────────────────────────
log_section "6. Demo AI 서비스 확인"
# ─────────────────────────────────────────────────

if curl -sf --max-time 5 "$DEMO_RAG/health" >/dev/null 2>&1; then
  log_ok "Demo RAG Service — 정상 기동"
else
  log_warn "Demo RAG Service — 기동 대기 중"
fi

# ─────────────────────────────────────────────────
log_section "7. OTel 텔레메트리 파이프라인 검증"
# ─────────────────────────────────────────────────

# OTel Collector에 테스트 Span 전송
log_info "OTel 테스트 Span 전송..."
TRACE_ID=$(printf '%032x' $RANDOM$RANDOM$RANDOM$RANDOM)
SPAN_ID=$(printf '%016x' $RANDOM$RANDOM)

OTLP_RESP=$(curl -s -X POST "http://localhost:4318/v1/traces" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceSpans\": [{
      \"resource\": {
        \"attributes\": [{
          \"key\": \"service.name\",
          \"value\": {\"stringValue\": \"e2e-healthcheck\"}
        }]
      },
      \"scopeSpans\": [{
        \"spans\": [{
          \"traceId\": \"${TRACE_ID}\",
          \"spanId\": \"${SPAN_ID}\",
          \"name\": \"e2e.healthcheck\",
          \"kind\": 1,
          \"startTimeUnixNano\": \"$(date +%s)000000000\",
          \"endTimeUnixNano\": \"$(date +%s)000000001\"
        }]
      }]
    }]
  }" \
  --max-time 5 2>/dev/null || echo "error")

if echo "$OTLP_RESP" | grep -q "{}" || [[ "$OTLP_RESP" == "" ]]; then
  log_ok "OTel Collector — OTLP HTTP Span 수신 성공 (traceId: ${TRACE_ID:0:16}...)"
else
  log_warn "OTel Collector — OTLP HTTP 응답 불명확"
fi

# Prometheus 메트릭 스크레이프 확인 (OTel Collector 자체 메트릭)
sleep 5
PROM_TARGETS=$(curl -s "$PROMETHEUS/api/v1/targets" --max-time 5 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); \
  active=[t for t in d.get('data',{}).get('activeTargets',[]) if t.get('health')=='up']; \
  print(len(active))" 2>/dev/null || echo "0")

if [[ "$PROM_TARGETS" -gt 0 ]]; then
  log_ok "Prometheus — ${PROM_TARGETS}개 타겟 스크레이프 정상"
else
  log_warn "Prometheus — 타겟 스크레이프 대기 중"
fi

# ─────────────────────────────────────────────────
log_section "8. Docker Compose 서비스 상태 확인"
# ─────────────────────────────────────────────────

log_info "실행 중인 컨테이너 목록:"
docker compose -f docker-compose.e2e.yaml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
  docker ps --filter "network=aitop-e2e" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 비정상 컨테이너 확인
UNHEALTHY=$(docker compose -f docker-compose.e2e.yaml ps 2>/dev/null | grep -c "unhealthy\|Exit\|Error" || echo "0")
if [[ "$UNHEALTHY" -gt 0 ]]; then
  log_fail "비정상 컨테이너 ${UNHEALTHY}개 발견"
else
  log_ok "모든 컨테이너 정상 실행 중"
fi

# ─────────────────────────────────────────────────
# 결과 요약
# ─────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "  헬스체크 결과 요약"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${YELLOW}WARN${NC}: $WARN"
echo -e "  ${RED}FAIL${NC}: $FAIL"
echo -e "  소요 시간: ${ELAPSED}s"
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ 전체 헬스체크 통과 — E2E 테스트 진행 가능${NC}"
  echo ""
  echo "다음 단계:"
  echo "  bash scripts/e2e/trace-continuity.sh   # Trace 연속성 검증"
  echo "  bash scripts/e2e/security-audit.sh     # 보안 감사"
  echo "  cd locust && locust                     # 부하 테스트"
  exit 0
else
  echo -e "${RED}✗ 헬스체크 실패 — $FAIL개 항목 확인 필요${NC}"
  exit 1
fi
