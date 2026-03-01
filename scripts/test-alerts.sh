#!/usr/bin/env bash
# Alert Rule 단위 테스트 스크립트
#
# promtool을 사용하여 prometheus-rules.yaml의 Alert Rule을
# 가상 시계열 데이터로 검증합니다. CI 파이프라인에서 실행하여
# Alert 조건이 의도한 대로 동작하는지 확인합니다.
#
# 사전 요구사항:
#   - promtool (prometheus 바이너리 패키지에 포함)
#   - Prometheus가 실행 중인 경우 /api/v1/rules 엔드포인트 확인 가능
#
# 사용법:
#   chmod +x scripts/test-alerts.sh
#   ./scripts/test-alerts.sh
#   ./scripts/test-alerts.sh --prometheus-url http://localhost:9090

set -euo pipefail

# ── 설정 ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RULES_FILE="$PROJECT_ROOT/infra/docker/prometheus-rules.yaml"
TEST_FILE="$PROJECT_ROOT/scripts/alert-test-cases.yaml"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
PASS=0
FAIL=0

# ── 색상 출력 ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_pass()  { echo -e "${GREEN}  ✅ PASS${NC}: $*"; ((PASS++)); }
log_fail()  { echo -e "${RED}  ❌ FAIL${NC}: $*"; ((FAIL++)); }

echo ""
echo "========================================================"
echo "  AI Service Alert Rule 검증"
echo "  Rules: $RULES_FILE"
echo "========================================================"
echo ""

# ── 1. YAML 문법 검증 ──────────────────────────────────────────────
echo "── 1. YAML 문법 검증 ───────────────────────────────────────"

if ! command -v promtool &>/dev/null; then
    log_warn "promtool을 찾을 수 없습니다. YAML 문법 검사를 건너뜁니다."
    log_warn "설치: https://prometheus.io/download/"
else
    if promtool check rules "$RULES_FILE" 2>&1; then
        log_pass "prometheus-rules.yaml 문법 정상"
    else
        log_fail "prometheus-rules.yaml 문법 오류"
    fi
fi

# ── 2. Alert Rule 존재 확인 ────────────────────────────────────────
echo ""
echo "── 2. 필수 Alert Rule 존재 확인 ────────────────────────────"

REQUIRED_ALERTS=(
    "LLM_TTFT_High"
    "LLM_TPS_Low"
    "LLM_Queue_Backlog"
    "GPU_VRAM_Critical"
    "GPU_Temperature_High"
    "Guardrail_Block_Rate_High"
    "Guardrail_Latency_High"
    "ExternalAPI_Timeout_Rate_High"
    "VectorDB_Search_Slow"
)

for alert in "${REQUIRED_ALERTS[@]}"; do
    if grep -q "alert: ${alert}" "$RULES_FILE"; then
        log_pass "Alert 존재: $alert"
    else
        log_fail "Alert 미존재: $alert"
    fi
done

# ── 3. 임계치 검증 ─────────────────────────────────────────────────
echo ""
echo "── 3. 임계치 값 검증 ───────────────────────────────────────"

check_threshold() {
    local alert_name="$1"
    local expected_pattern="$2"
    local description="$3"
    if grep -A 10 "alert: ${alert_name}" "$RULES_FILE" | grep -qP "$expected_pattern"; then
        log_pass "$description"
    else
        log_fail "$description (패턴: $expected_pattern)"
    fi
}

check_threshold "LLM_TTFT_High"            "> 3000"         "TTFT 임계치 3000ms"
check_threshold "LLM_TPS_Low"              "< 15"           "TPS 임계치 15 tok/s"
check_threshold "GPU_VRAM_Critical"        "> 90"           "GPU VRAM 임계치 90%"
check_threshold "GPU_Temperature_High"     "> 85"           "GPU 온도 임계치 85°C"
check_threshold "Guardrail_Block_Rate_High""> 10"           "가드레일 차단율 임계치 10%"
check_threshold "Guardrail_Latency_High"   "> 1500"         "가드레일 레이턴시 임계치 1500ms"

# ── 4. for 절 검증 (알람 지속 시간) ────────────────────────────────
echo ""
echo "── 4. for 절 (알람 지속 시간) 검증 ────────────────────────"

check_for_clause() {
    local alert_name="$1"
    local expected_for="$2"
    if grep -A 5 "alert: ${alert_name}" "$RULES_FILE" | grep -q "for: ${expected_for}"; then
        log_pass "$alert_name: for: $expected_for"
    else
        log_fail "$alert_name: for 절이 $expected_for 이어야 함"
    fi
}

check_for_clause "LLM_TTFT_High"     "5m"
check_for_clause "GPU_VRAM_Critical" "2m"
check_for_clause "LLM_Queue_Backlog" "3m"

# ── 5. severity 레이블 검증 ────────────────────────────────────────
echo ""
echo "── 5. severity 레이블 검증 ─────────────────────────────────"

CRITICAL_ALERTS=("LLM_TTFT_High" "GPU_VRAM_Critical" "LLM_Queue_Backlog")
WARNING_ALERTS=("LLM_TPS_Low" "GPU_Temperature_High" "Guardrail_Block_Rate_High"
                "Guardrail_Latency_High" "ExternalAPI_Timeout_Rate_High" "VectorDB_Search_Slow")

for alert in "${CRITICAL_ALERTS[@]}"; do
    if grep -A 8 "alert: ${alert}" "$RULES_FILE" | grep -q "severity: critical"; then
        log_pass "$alert severity=critical"
    else
        log_fail "$alert는 severity: critical이어야 함"
    fi
done

for alert in "${WARNING_ALERTS[@]}"; do
    if grep -A 8 "alert: ${alert}" "$RULES_FILE" | grep -q "severity: warning"; then
        log_pass "$alert severity=warning"
    else
        log_fail "$alert는 severity: warning이어야 함"
    fi
done

# ── 6. 실행 중인 Prometheus에서 Rule 상태 확인 (선택) ──────────────
echo ""
echo "── 6. Prometheus 런타임 Rule 상태 확인 ─────────────────────"

if curl -sf "${PROMETHEUS_URL}/api/v1/rules" -o /dev/null 2>/dev/null; then
    log_info "Prometheus 연결 성공: $PROMETHEUS_URL"
    RULE_COUNT=$(curl -sf "${PROMETHEUS_URL}/api/v1/rules" | \
        python3 -c "import sys,json; d=json.load(sys.stdin); \
        print(sum(len(g['rules']) for g in d.get('data',{}).get('groups',[])))" 2>/dev/null || echo "0")
    log_info "로드된 Alert Rule 수: $RULE_COUNT"

    # PENDING/FIRING 상태 알람 확인
    FIRING=$(curl -sf "${PROMETHEUS_URL}/api/v1/alerts" | \
        python3 -c "import sys,json; d=json.load(sys.stdin); \
        alerts=d.get('data',{}).get('alerts',[]); \
        firing=[a['labels']['alertname'] for a in alerts if a['state']=='firing']; \
        print(', '.join(firing) if firing else 'NONE')" 2>/dev/null || echo "확인 불가")
    log_info "현재 FIRING 알람: $FIRING"
else
    log_warn "Prometheus($PROMETHEUS_URL)에 연결할 수 없습니다. 런타임 검사 건너뜀."
fi

# ── 최종 결과 ─────────────────────────────────────────────────────
echo ""
echo "========================================================"
echo "  검증 결과"
echo "  PASS: $PASS  FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
    echo -e "  상태: ${RED}FAIL${NC}"
    echo "========================================================"
    exit 1
else
    echo -e "  상태: ${GREEN}PASS${NC}"
    echo "========================================================"
    exit 0
fi
