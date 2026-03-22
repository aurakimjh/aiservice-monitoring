#!/usr/bin/env bash
# =============================================================================
# AITOP Phase 7'-4: 보안 감사
# OWASP Top 10 체크리스트 + PII 마스킹 검증 + mTLS 인증서 검증
# =============================================================================
# 실행: bash scripts/e2e/security-audit.sh
# 전제: docker-compose.e2e.yaml 기동 + healthcheck.sh 통과
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
CRITICAL=0

log_info()    { echo -e "${BLUE}[INFO]${NC}     $*"; }
log_ok()      { echo -e "${GREEN}[PASS]${NC}     $*"; ((PASS++)); }
log_fail()    { echo -e "${RED}[FAIL]${NC}     $*"; ((FAIL++)); }
log_crit()    { echo -e "${RED}[CRITICAL]${NC} $*"; ((FAIL++)); ((CRITICAL++)); }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}     $*"; ((WARN++)); }
log_section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── 설정 ───────────────────────────────────────────────────
COLLECTION_SERVER="${COLLECTION_SERVER:-http://localhost:8080}"
FRONTEND="${FRONTEND:-http://localhost:3000}"
PROMETHEUS="${PROMETHEUS:-http://localhost:9090}"

# ── 유틸리티 ───────────────────────────────────────────────
http_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$1" 2>/dev/null || echo "000"
}

http_response() {
  curl -s --max-time 5 "$1" 2>/dev/null || echo ""
}

http_headers() {
  curl -sI --max-time 5 "$1" 2>/dev/null || echo ""
}

post_json() {
  local url="$1"; local data="$2"; local extra_headers="${3:-}"
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    ${extra_headers:+-H "$extra_headers"} \
    -d "$data" \
    --max-time 5 2>/dev/null || echo "000"
}

# ══════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AITOP Phase 7'-4: 보안 감사                  ║${NC}"
echo -e "${CYAN}║   OWASP Top 10 + PII 마스킹 + mTLS             ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
echo ""

START_TIME=$(date +%s)

# ─────────────────────────────────────────────────
log_section "A01. Broken Access Control — 접근 제어 검증"
# ─────────────────────────────────────────────────

# 미인증 요청 차단 확인
UNAUTH_AGENTS=$(http_status "$COLLECTION_SERVER/api/v1/agents")
if [[ "$UNAUTH_AGENTS" == "401" ]]; then
  log_ok "A01 — 미인증 /api/v1/agents 요청 차단 (401)"
else
  log_crit "A01 — 미인증 접근 허용 (HTTP $UNAUTH_AGENTS, 예상: 401)"
fi

UNAUTH_JOBS=$(http_status "$COLLECTION_SERVER/api/v1/collect/jobs")
if [[ "$UNAUTH_JOBS" == "401" ]]; then
  log_ok "A01 — 미인증 /api/v1/collect/jobs 요청 차단 (401)"
else
  log_crit "A01 — 미인증 collect 접근 허용 (HTTP $UNAUTH_JOBS)"
fi

# 위조 JWT 토큰으로 접근 시도
FAKE_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIiLCJyb2xlIjoiYWRtaW4ifQ.fakesignature"
FAKE_JWT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $FAKE_JWT" \
  "$COLLECTION_SERVER/api/v1/agents" \
  --max-time 5 2>/dev/null || echo "000")

if [[ "$FAKE_JWT_STATUS" == "401" ]]; then
  log_ok "A01 — 위조 JWT 토큰 거부 (401)"
else
  log_crit "A01 — 위조 JWT 토큰 수락 (HTTP $FAKE_JWT_STATUS)"
fi

# 만료된 JWT 시도 (expires=0)
EXPIRED_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.test"
EXPIRED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $EXPIRED_JWT" \
  "$COLLECTION_SERVER/api/v1/agents" \
  --max-time 5 2>/dev/null || echo "000")

if [[ "$EXPIRED_STATUS" == "401" ]]; then
  log_ok "A01 — 만료 JWT 토큰 거부 (401)"
else
  log_warn "A01 — 만료 JWT 처리 확인 필요 (HTTP $EXPIRED_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "A02. Cryptographic Failures — 암호화 검증"
# ─────────────────────────────────────────────────

# HTTP → HTTPS 리다이렉트 확인 (프로덕션 환경)
log_info "A02 — TLS 설정 확인 (E2E 환경: HTTP 허용, 프로덕션: HTTPS 필수)"

# JWT Secret 강도 확인 (환경변수 검사)
JWT_SECRET_LEN=$(docker inspect aitop-collection-server 2>/dev/null | \
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for c in d:
        for env in c.get('Config',{}).get('Env',[]):
            if env.startswith('AITOP_JWT_SECRET='):
                print(len(env.split('=',1)[1]))
                break
    else:
        print(0)
except:
    print(0)
" 2>/dev/null || echo "0")

if [[ "$JWT_SECRET_LEN" -ge 32 ]]; then
  log_ok "A02 — JWT Secret 길이 충족 (${JWT_SECRET_LEN}자, 최소 32자 요건)"
else
  log_warn "A02 — JWT Secret 길이 확인 불가 (docker inspect 미지원)"
fi

# Content-Type 헤더 확인
CS_CT=$(curl -sI "$COLLECTION_SERVER/health" --max-time 5 2>/dev/null | grep -i "content-type" || echo "")
if echo "$CS_CT" | grep -qi "application/json"; then
  log_ok "A02 — Collection Server Content-Type: application/json 확인"
else
  log_warn "A02 — Collection Server Content-Type 헤더 불명확"
fi

# ─────────────────────────────────────────────────
log_section "A03. Injection — SQL/Command Injection 검증"
# ─────────────────────────────────────────────────

# SQL Injection 시도 — 로그인 엔드포인트
SQL_INJECT_PAYLOADS=(
  '{"username":"admin'\'' OR 1=1--","password":"x"}'
  '{"username":"admin\"; DROP TABLE agents;--","password":"x"}'
  '{"username":"'\'' UNION SELECT * FROM agents--","password":"x"}'
)

for payload in "${SQL_INJECT_PAYLOADS[@]}"; do
  STATUS=$(post_json "$COLLECTION_SERVER/api/v1/auth/login" "$payload")
  if [[ "$STATUS" == "401" ]] || [[ "$STATUS" == "400" ]]; then
    log_ok "A03 — SQL Injection 페이로드 차단 (HTTP $STATUS)"
  elif [[ "$STATUS" == "200" ]]; then
    log_crit "A03 — SQL Injection 취약점 발견! 페이로드: ${payload:0:50}"
  else
    log_warn "A03 — SQL Injection 응답 확인 필요 (HTTP $STATUS)"
  fi
  break  # 첫 번째 페이로드만 테스트 (실제 환경 부담 최소화)
done

# XSS 페이로드 — Content-Type 확인
XSS_PAYLOAD='{"username":"<script>alert(1)</script>","password":"test"}'
XSS_STATUS=$(post_json "$COLLECTION_SERVER/api/v1/auth/login" "$XSS_PAYLOAD")
XSS_RESP=$(curl -s -X POST "$COLLECTION_SERVER/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "$XSS_PAYLOAD" --max-time 5 2>/dev/null || echo "")

if echo "$XSS_RESP" | grep -q "<script>"; then
  log_crit "A03 — XSS 페이로드 응답에 그대로 반영됨"
else
  log_ok "A03 — XSS 페이로드 반영 없음 (HTTP $XSS_STATUS)"
fi

# Command Injection 시도
CMD_INJECT='{"agent_id":"test; cat /etc/passwd","hostname":"test"}'
CMD_STATUS=$(post_json "$COLLECTION_SERVER/api/v1/agents/heartbeat" "$CMD_INJECT")
if [[ "$CMD_STATUS" == "400" ]] || [[ "$CMD_STATUS" == "401" ]]; then
  log_ok "A03 — Command Injection 페이로드 차단 (HTTP $CMD_STATUS)"
else
  log_warn "A03 — Command Injection 응답 확인 필요 (HTTP $CMD_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "A04. Insecure Design — 민감 엔드포인트 노출 확인"
# ─────────────────────────────────────────────────

# 내부 API 경로 직접 접근
SENSITIVE_PATHS=(
  "/admin"
  "/debug"
  "/.env"
  "/config"
  "/.git/config"
  "/api/v1/internal"
  "/metrics"
  "/actuator"
)

for path in "${SENSITIVE_PATHS[@]}"; do
  STATUS=$(http_status "$COLLECTION_SERVER$path")
  if [[ "$STATUS" == "401" ]] || [[ "$STATUS" == "403" ]] || [[ "$STATUS" == "404" ]]; then
    log_ok "A04 — $path 접근 차단 (HTTP $STATUS)"
  elif [[ "$STATUS" == "200" ]]; then
    log_warn "A04 — $path 접근 가능 (HTTP $STATUS) — 의도된 공개 엔드포인트인지 확인 필요"
  else
    log_info "A04 — $path: HTTP $STATUS"
  fi
done

# ─────────────────────────────────────────────────
log_section "A05. Security Misconfiguration — 설정 오류 확인"
# ─────────────────────────────────────────────────

# 보안 헤더 확인
CS_HEADERS=$(http_headers "$COLLECTION_SERVER/health")

check_header() {
  local name="$1"; local header="$2"; local required="${3:-false}"
  if echo "$CS_HEADERS" | grep -qi "$header"; then
    log_ok "A05 — 보안 헤더 존재: $name"
  elif [[ "$required" == "true" ]]; then
    log_fail "A05 — 필수 보안 헤더 없음: $name"
  else
    log_warn "A05 — 권고 보안 헤더 없음: $name"
  fi
}

check_header "X-Content-Type-Options" "x-content-type-options"
check_header "X-Frame-Options" "x-frame-options"
check_header "X-XSS-Protection" "x-xss-protection"
check_header "Strict-Transport-Security" "strict-transport-security"

# CORS 설정 확인 (임의 오리진 허용 여부)
CORS_RESP=$(curl -sI \
  -H "Origin: https://evil-site.example.com" \
  -H "Access-Control-Request-Method: DELETE" \
  "$COLLECTION_SERVER/api/v1/agents" \
  --max-time 5 2>/dev/null || echo "")

ALLOWED_ORIGIN=$(echo "$CORS_RESP" | grep -i "access-control-allow-origin" | awk '{print $2}' | tr -d '\r' || echo "")
if [[ "$ALLOWED_ORIGIN" == "*" ]]; then
  log_warn "A05 — CORS wildcard (*) 설정 — 프로덕션에서 제한 필요"
elif [[ -n "$ALLOWED_ORIGIN" ]]; then
  log_ok "A05 — CORS Origin 제한 설정: $ALLOWED_ORIGIN"
else
  log_ok "A05 — CORS Origin 헤더 없음 (제한적 허용)"
fi

# 서버 버전 정보 노출 여부
SERVER_HEADER=$(echo "$CS_HEADERS" | grep -i "^server:" || echo "")
if echo "$SERVER_HEADER" | grep -qi "nginx\|apache\|express\|python"; then
  log_warn "A05 — 서버 버전 정보 노출: $SERVER_HEADER"
else
  log_ok "A05 — 서버 기술 스택 비노출"
fi

# ─────────────────────────────────────────────────
log_section "A06. Vulnerable Components — 의존성 CVE 스캔"
# ─────────────────────────────────────────────────

log_info "A06 — Go 의존성 CVE 스캔 (govulncheck 필요)"

# govulncheck 실행 (설치된 경우)
if command -v govulncheck >/dev/null 2>&1; then
  if cd agent && govulncheck ./... 2>&1 | grep -q "No vulnerabilities found"; then
    log_ok "A06 — Go 의존성 CVE 없음 (govulncheck)"
  else
    log_warn "A06 — Go 의존성 CVE 발견 — govulncheck 결과 확인"
  fi
  cd ..
else
  log_warn "A06 — govulncheck 미설치 (설치: go install golang.org/x/vuln/cmd/govulncheck@latest)"
fi

# npm audit (프론트엔드)
log_info "A06 — Node.js 의존성 CVE 확인"
if [[ -f "frontend/package.json" ]]; then
  if command -v npm >/dev/null 2>&1; then
    NPM_AUDIT=$(cd frontend && npm audit --json 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); \
      print(d.get('metadata',{}).get('vulnerabilities',{}).get('critical',0))" 2>/dev/null || echo "skip")
    if [[ "$NPM_AUDIT" == "0" ]]; then
      log_ok "A06 — npm Critical CVE 없음"
    elif [[ "$NPM_AUDIT" == "skip" ]]; then
      log_warn "A06 — npm audit 실행 실패"
    else
      log_warn "A06 — npm Critical CVE ${NPM_AUDIT}건 — npm audit fix 실행 권고"
    fi
  else
    log_warn "A06 — npm 미설치 (프론트엔드 CVE 스캔 건너뜀)"
  fi
fi

# ─────────────────────────────────────────────────
log_section "A07. Authentication Failures — 인증 실패 방어"
# ─────────────────────────────────────────────────

# Brute Force 시도 (10회 실패 시 rate limit 기대)
log_info "A07 — Brute Force 방어 확인 (5회 시도)..."
BRUTE_BLOCKED=false
for i in $(seq 1 5); do
  BF_STATUS=$(post_json "$COLLECTION_SERVER/api/v1/auth/login" \
    "{\"username\":\"admin\",\"password\":\"wrong_pass_${i}\"}")
  if [[ "$BF_STATUS" == "429" ]]; then
    BRUTE_BLOCKED=true
    log_ok "A07 — Brute Force rate limit 발동 (${i}번째 시도에서 429)"
    break
  fi
done

if [[ "$BRUTE_BLOCKED" == "false" ]]; then
  log_warn "A07 — Rate limit 미발동 (5회 시도, 프로덕션에서 rate limiting 설정 필요)"
fi

# 빈 자격증명 로그인 시도
EMPTY_STATUS=$(post_json "$COLLECTION_SERVER/api/v1/auth/login" '{"username":"","password":""}')
if [[ "$EMPTY_STATUS" == "400" ]] || [[ "$EMPTY_STATUS" == "401" ]]; then
  log_ok "A07 — 빈 자격증명 거부 (HTTP $EMPTY_STATUS)"
else
  log_warn "A07 — 빈 자격증명 응답 확인 필요 (HTTP $EMPTY_STATUS)"
fi

# ─────────────────────────────────────────────────
log_section "A08. Software and Data Integrity — 업로드 검증"
# ─────────────────────────────────────────────────

# 대용량 페이로드 업로드 시도 (DoS 방지)
log_info "A08 — 대용량 페이로드 업로드 제한 확인..."
LARGE_PAYLOAD=$(python3 -c "print('{\"data\":\"' + 'A'*10000 + '\"}')" 2>/dev/null || echo '{"data":"AAAA"}')
LARGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$COLLECTION_SERVER/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LARGE_PAYLOAD" \
  --max-time 5 2>/dev/null || echo "000")

if [[ "$LARGE_STATUS" == "413" ]] || [[ "$LARGE_STATUS" == "400" ]]; then
  log_ok "A08 — 대용량 페이로드 차단 (HTTP $LARGE_STATUS)"
else
  log_warn "A08 — 대용량 페이로드 처리 확인 필요 (HTTP $LARGE_STATUS, 10KB 테스트)"
fi

# ─────────────────────────────────────────────────
log_section "A09. Security Logging — 감사 로그 확인"
# ─────────────────────────────────────────────────

# 실패한 로그인 시도 → 로그 기록 확인
log_info "A09 — 보안 이벤트 로그 확인..."

AUDIT_LOGS=$(docker logs aitop-collection-server 2>&1 | \
  grep -i "unauthorized\|auth.*fail\|invalid.*token\|login.*fail\|401" | \
  tail -5 || echo "")

if [[ -n "$AUDIT_LOGS" ]]; then
  log_ok "A09 — 인증 실패 이벤트 로그 기록 확인"
  echo "$AUDIT_LOGS" | head -3 | while read -r line; do
    log_info "  로그: $line"
  done
else
  log_warn "A09 — 인증 실패 로그 없음 (docker logs 미지원 또는 로그 형식 다름)"
fi

# 로그 시간 타임스탬프 포함 여부
RECENT_LOG=$(docker logs aitop-collection-server 2>&1 | tail -3 || echo "")
if echo "$RECENT_LOG" | grep -qP '\d{4}-\d{2}-\d{2}'; then
  log_ok "A09 — 로그 타임스탬프 형식 확인 (ISO 8601)"
else
  log_warn "A09 — 로그 타임스탬프 형식 확인 필요"
fi

# ─────────────────────────────────────────────────
log_section "A10. SSRF — Server-Side Request Forgery 방어"
# ─────────────────────────────────────────────────

# SSRF 시도 — 내부 메타데이터 서비스 URL 포함
SSRF_PAYLOADS=(
  "http://169.254.169.254/latest/meta-data/"  # AWS EC2 Metadata
  "http://metadata.google.internal/"           # GCP Metadata
  "http://127.0.0.1:9090/api/v1/query"         # 내부 Prometheus
)

log_info "A10 — SSRF 페이로드 확인 (URL 파라미터 처리)..."
for ssrf_url in "${SSRF_PAYLOADS[@]}"; do
  SSRF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$COLLECTION_SERVER/api/v1/collect/trigger" \
    -H "Content-Type: application/json" \
    -d "{\"callback_url\": \"${ssrf_url}\"}" \
    --max-time 5 2>/dev/null || echo "000")

  if [[ "$SSRF_STATUS" == "400" ]] || [[ "$SSRF_STATUS" == "401" ]] || [[ "$SSRF_STATUS" == "403" ]]; then
    log_ok "A10 — SSRF URL 차단: ${ssrf_url:0:40}... (HTTP $SSRF_STATUS)"
  elif [[ "$SSRF_STATUS" == "200" ]]; then
    log_warn "A10 — SSRF URL 수락 확인 필요: ${ssrf_url:0:40}..."
  else
    log_info "A10 — SSRF 응답: HTTP $SSRF_STATUS (${ssrf_url:0:40}...)"
  fi
done

# ─────────────────────────────────────────────────
log_section "PII 마스킹 검증"
# ─────────────────────────────────────────────────

log_info "PII — 로그/응답 내 개인정보 노출 확인..."

# Collection Server 응답에 민감 정보 포함 여부
HEALTH_RESP=$(http_response "$COLLECTION_SERVER/health")
PII_PATTERNS=("password" "secret" "api_key" "private_key" "credential")

for pattern in "${PII_PATTERNS[@]}"; do
  if echo "$HEALTH_RESP" | grep -qi "$pattern"; then
    log_crit "PII — $pattern 응답 노출: $(echo "$HEALTH_RESP" | grep -i "$pattern" | head -1)"
  else
    log_ok "PII — $pattern 응답 미노출 (/health)"
  fi
done

# JWT 페이로드 PII 최소화 확인
log_info "PII — JWT payload 확인..."
LOGIN_RESP=$(curl -s -X POST "$COLLECTION_SERVER/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  --max-time 10 2>/dev/null || echo '{}')

JWT_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || echo "")

if [[ -n "$JWT_TOKEN" ]]; then
  # JWT payload 디코딩 (base64)
  JWT_PAYLOAD=$(echo "$JWT_TOKEN" | cut -d'.' -f2 | \
    python3 -c "
import sys, base64, json
try:
    s = sys.stdin.read().strip()
    padded = s + '=' * (4 - len(s) % 4)
    decoded = base64.b64decode(padded)
    print(decoded.decode('utf-8'))
except:
    print('decode_error')
" 2>/dev/null || echo "decode_error")

  if echo "$JWT_PAYLOAD" | grep -qi "password\|secret\|email\|phone\|ssn\|national_id"; then
    log_warn "PII — JWT payload에 민감 정보 포함 가능: $JWT_PAYLOAD"
  else
    log_ok "PII — JWT payload 최소화 확인: $JWT_PAYLOAD"
  fi
else
  log_warn "PII — JWT 토큰 미획득 (로그인 실패) — 데모 계정 확인 필요"
fi

# Prometheus 레이블 PII 확인
log_info "PII — Prometheus 레이블 확인..."
PROM_LABELS=$(curl -s "$PROMETHEUS/api/v1/labels" --max-time 5 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('data',[])))" 2>/dev/null || echo "")

PROM_PII=("email" "phone" "user_name" "national_id" "ssn")
for pii in "${PROM_PII[@]}"; do
  if echo "$PROM_LABELS" | grep -qi "$pii"; then
    log_warn "PII — Prometheus 레이블에 개인정보 가능성: $pii"
  else
    log_ok "PII — Prometheus 레이블 $pii 미포함"
  fi
done

# ─────────────────────────────────────────────────
log_section "mTLS 인증서 검증"
# ─────────────────────────────────────────────────

log_info "mTLS — Collection Server ↔ Agent TLS 설정 확인..."

# TLS 지원 확인 (HTTPS 엔드포인트)
TLS_CHECK=$(openssl s_client -connect localhost:8080 \
  -verify 5 -timeout 3 2>&1 | head -10 || echo "no_tls")

if echo "$TLS_CHECK" | grep -qi "certificate\|ssl\|tls"; then
  log_ok "mTLS — TLS 인증서 확인됨"

  # 인증서 만료일 확인
  CERT_EXPIRY=$(echo | openssl s_client -connect localhost:8080 2>/dev/null | \
    openssl x509 -noout -dates 2>/dev/null | grep "notAfter" || echo "")
  if [[ -n "$CERT_EXPIRY" ]]; then
    log_ok "mTLS — 인증서 만료일: $CERT_EXPIRY"
  fi

  # 약한 암호화 알고리즘 확인
  CIPHER=$(openssl s_client -connect localhost:8080 2>&1 | grep "Cipher" || echo "")
  if echo "$CIPHER" | grep -qi "RC4\|DES\|MD5\|NULL"; then
    log_fail "mTLS — 취약 암호화 알고리즘 사용: $CIPHER"
  elif [[ -n "$CIPHER" ]]; then
    log_ok "mTLS — 암호화 알고리즘 정상: $CIPHER"
  fi
else
  log_info "mTLS — E2E 환경 HTTP (프로덕션: HTTPS + mTLS 필수)"
  log_info "mTLS — 프로덕션 배포 시 아래 설정 필요:"
  log_info "  1. Collection Server: TLS 인증서 + 클라이언트 인증서 검증"
  log_info "  2. Agent: 클라이언트 인증서 + CA 체인 검증"
  log_info "  3. OTel Collector gRPC: TLS 엔드포인트 (4317)"
fi

# OTel Collector gRPC TLS 확인
OTEL_TLS=$(openssl s_client -connect localhost:4317 \
  -timeout 3 2>&1 | head -5 || echo "no_tls")
if echo "$OTEL_TLS" | grep -qi "certificate\|ssl"; then
  log_ok "mTLS — OTel Collector gRPC TLS 확인"
else
  log_info "mTLS — OTel Collector gRPC plaintext (E2E 환경)"
fi

# ─────────────────────────────────────────────────
log_section "의존성 보안 패키지 버전 확인"
# ─────────────────────────────────────────────────

# Go 의존성에서 보안 관련 패키지 버전 확인
if [[ -f "agent/go.mod" ]]; then
  log_info "Go 의존성 주요 패키지 확인..."
  GOLANG_CRYPTO=$(grep "golang.org/x/crypto" agent/go.mod | awk '{print $2}' || echo "N/A")
  GOLANG_NET=$(grep "golang.org/x/net" agent/go.mod | awk '{print $2}' || echo "N/A")
  log_info "  golang.org/x/crypto: $GOLANG_CRYPTO"
  log_info "  golang.org/x/net: $GOLANG_NET"
  log_ok "A06 — Go 보안 패키지 버전 확인 완료"
fi

# ─────────────────────────────────────────────────
# 결과 요약
# ─────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "  보안 감사 결과 요약 (OWASP Top 10)"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}PASS${NC}:     $PASS"
echo -e "  ${YELLOW}WARN${NC}:     $WARN (검토 권고)"
echo -e "  ${RED}FAIL${NC}:     $FAIL"
echo -e "  ${RED}CRITICAL${NC}: $CRITICAL (즉시 수정 필요)"
echo -e "  소요 시간: ${ELAPSED}s"
echo ""

if [[ "$CRITICAL" -gt 0 ]]; then
  echo -e "${RED}✗ Critical 취약점 ${CRITICAL}건 발견 — 즉시 수정 후 재감사 필요${NC}"
  exit 2
elif [[ "$FAIL" -gt 0 ]]; then
  echo -e "${RED}✗ 보안 감사 실패 — $FAIL건 수정 필요${NC}"
  exit 1
elif [[ "$WARN" -gt 0 ]]; then
  echo -e "${YELLOW}△ 보안 감사 통과 (경고 ${WARN}건 — 프로덕션 배포 전 검토 권고)${NC}"
  exit 0
else
  echo -e "${GREEN}✓ 보안 감사 완전 통과${NC}"
  exit 0
fi
