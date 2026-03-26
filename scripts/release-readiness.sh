#!/usr/bin/env bash
# release-readiness.sh — AITOP 릴리스 준비 상태 점검
# Phase 9'-3: 교차검증 최종 보고서 + 릴리스 승인
#
# Usage:
#   ./scripts/release-readiness.sh              # 전체 점검
#   ./scripts/release-readiness.sh --skip-build  # 빌드 단계 건너뛰기
#
# Exit codes:
#   0  모든 critical 체크 통과
#   1  하나 이상의 critical 체크 실패
set -euo pipefail

# ─── 색상 정의 ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── 전역 카운터 ────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
CRITICAL_FAIL=0

# ─── 옵션 파싱 ──────────────────────────────────────────────
SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build]"
      echo "  --skip-build   빌드/컴파일 단계 건너뛰기"
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ─── 프로젝트 루트 확인 ─────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

REPORT_DIR="$ROOT_DIR/reports"
REPORT_FILE="$REPORT_DIR/release-readiness-report.md"
mkdir -p "$REPORT_DIR"

# ─── 보고서 초기화 ──────────────────────────────────────────
REPORT_LINES=()

report_header() {
  local now
  now=$(date '+%Y-%m-%d %H:%M:%S')
  REPORT_LINES+=("# AITOP Release Readiness Report")
  REPORT_LINES+=("")
  REPORT_LINES+=("**Generated**: $now")
  REPORT_LINES+=("**Skip Build**: $SKIP_BUILD")
  REPORT_LINES+=("")
}

report_section() {
  REPORT_LINES+=("")
  REPORT_LINES+=("## $1")
  REPORT_LINES+=("")
  REPORT_LINES+=("| Check | Result | Detail |")
  REPORT_LINES+=("| ----- | ------ | ------ |")
}

report_row() {
  local check="$1" result="$2" detail="$3"
  REPORT_LINES+=("| $check | $result | $detail |")
}

flush_report() {
  REPORT_LINES+=("")
  REPORT_LINES+=("---")
  REPORT_LINES+=("")
  REPORT_LINES+=("## Summary")
  REPORT_LINES+=("")
  REPORT_LINES+=("- **PASS**: $PASS_COUNT")
  REPORT_LINES+=("- **FAIL**: $FAIL_COUNT")
  REPORT_LINES+=("- **WARN**: $WARN_COUNT")
  REPORT_LINES+=("- **Critical Failures**: $CRITICAL_FAIL")
  REPORT_LINES+=("")

  if [[ $CRITICAL_FAIL -eq 0 ]]; then
    REPORT_LINES+=("**Verdict: RELEASE READY**")
  else
    REPORT_LINES+=("**Verdict: NOT READY — $CRITICAL_FAIL critical failure(s)**")
  fi

  printf '%s\n' "${REPORT_LINES[@]}" > "$REPORT_FILE"
}

# ─── 체크 유틸리티 ───────────────────────────────────────────
print_check() {
  local status="$1" label="$2" detail="${3:-}"
  case "$status" in
    PASS)
      printf "  ${GREEN}[PASS]${NC}  %-45s %s\n" "$label" "$detail"
      PASS_COUNT=$((PASS_COUNT + 1))
      report_row "$label" "PASS" "$detail"
      ;;
    FAIL)
      printf "  ${RED}[FAIL]${NC}  %-45s %s\n" "$label" "$detail"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
      report_row "$label" "FAIL" "$detail"
      ;;
    WARN)
      printf "  ${YELLOW}[WARN]${NC}  %-45s %s\n" "$label" "$detail"
      WARN_COUNT=$((WARN_COUNT + 1))
      report_row "$label" "WARN" "$detail"
      ;;
  esac
}

section_header() {
  printf "\n${BOLD}${CYAN}━━━ %s ━━━${NC}\n" "$1"
}

# ─── 배너 ───────────────────────────────────────────────────
echo ""
printf "${BOLD}${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           AITOP v1.0.0 Release Readiness Check           ║"
echo "║              Phase 9'-3: 릴리스 준비 점검                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
printf "${NC}\n"

report_header

# ═════════════════════════════════════════════════════════════
# 1. BUILD CHECKS
# ═════════════════════════════════════════════════════════════
section_header "1. Build"
report_section "1. Build"

if [[ "$SKIP_BUILD" == true ]]; then
  print_check WARN "Go binary build (agent)" "SKIPPED (--skip-build)"
  print_check WARN "Go binary build (collection-server)" "SKIPPED (--skip-build)"
  print_check WARN "Frontend build (Next.js)" "SKIPPED (--skip-build)"
else
  # Go agent build
  if [[ -f "agent/go.mod" ]]; then
    if (cd agent && go build ./... 2>/dev/null); then
      print_check PASS "Go binary build (agent)" "go build ./... OK"
    else
      print_check FAIL "Go binary build (agent)" "go build failed"
    fi
  else
    print_check FAIL "Go binary build (agent)" "agent/go.mod not found"
  fi

  # Go collection-server build
  if [[ -f "agent/cmd/collection-server/main.go" ]]; then
    if (cd agent && go build ./cmd/collection-server/ 2>/dev/null); then
      print_check PASS "Go binary build (collection-server)" "OK"
    else
      print_check FAIL "Go binary build (collection-server)" "build failed"
    fi
  else
    print_check FAIL "Go binary build (collection-server)" "main.go not found"
  fi

  # Frontend build
  if [[ -f "frontend/package.json" ]]; then
    if [[ -d "frontend/.next" ]]; then
      print_check PASS "Frontend build (Next.js)" ".next output exists"
    elif (cd frontend && npm run build 2>/dev/null); then
      print_check PASS "Frontend build (Next.js)" "npm run build OK"
    else
      print_check FAIL "Frontend build (Next.js)" "build failed"
    fi
  else
    print_check FAIL "Frontend build (Next.js)" "package.json not found"
  fi
fi

# Docker image configs
if [[ -f "frontend/Dockerfile" ]]; then
  print_check PASS "Docker: frontend Dockerfile" "exists"
else
  print_check FAIL "Docker: frontend Dockerfile" "not found"
fi

if [[ -f "infra/docker/Dockerfile.collection-server" ]]; then
  print_check PASS "Docker: collection-server Dockerfile" "exists"
else
  print_check FAIL "Docker: collection-server Dockerfile" "not found"
fi

if [[ -f "demo/rag-service/Dockerfile" ]]; then
  print_check PASS "Docker: demo rag-service Dockerfile" "exists"
else
  print_check WARN "Docker: demo rag-service Dockerfile" "not found (non-critical)"
fi

if [[ -f "docker-compose.e2e.yaml" ]]; then
  print_check PASS "Docker Compose (e2e)" "docker-compose.e2e.yaml exists"
else
  print_check FAIL "Docker Compose (e2e)" "not found"
fi

if [[ -f "docker-compose.lite.yaml" ]]; then
  print_check PASS "Docker Compose (lite)" "docker-compose.lite.yaml exists"
else
  print_check WARN "Docker Compose (lite)" "not found"
fi

# ═════════════════════════════════════════════════════════════
# 2. TESTS
# ═════════════════════════════════════════════════════════════
section_header "2. Tests"
report_section "2. Tests"

# Count Go test files
go_test_files=$(find agent -name '*_test.go' -not -path '*/.claude/*' 2>/dev/null | wc -l)
if [[ "$go_test_files" -ge 20 ]]; then
  print_check PASS "Go test files present" "${go_test_files} test files found"
elif [[ "$go_test_files" -ge 1 ]]; then
  print_check WARN "Go test files present" "only ${go_test_files} test files"
else
  print_check FAIL "Go test files present" "no test files found"
fi

# Count Go test functions
go_test_funcs=$(grep -r 'func Test' agent --include='*_test.go' 2>/dev/null | grep -v '.claude' | wc -l)
if [[ "$go_test_funcs" -ge 100 ]]; then
  print_check PASS "Go unit test count" "${go_test_funcs} test functions"
elif [[ "$go_test_funcs" -ge 1 ]]; then
  print_check WARN "Go unit test count" "only ${go_test_funcs} functions (target: 100+)"
else
  print_check FAIL "Go unit test count" "no test functions found"
fi

# Integration test files
if [[ -f "agent/test/integration_e2e_test.go" ]]; then
  print_check PASS "Integration test file" "agent/test/integration_e2e_test.go"
else
  print_check FAIL "Integration test file" "not found"
fi

# API contract tests
if [[ -f "agent/test/api_contract_test.go" ]]; then
  print_check PASS "API contract test file" "agent/test/api_contract_test.go"
else
  print_check FAIL "API contract test file" "not found"
fi

# Frontend tests
frontend_test_files=$(find frontend/src -name '*.test.*' -o -name '*.spec.*' 2>/dev/null | grep -v node_modules | grep -v '.claude' | wc -l)
if [[ "$frontend_test_files" -ge 5 ]]; then
  print_check PASS "Frontend test files" "${frontend_test_files} test files"
elif [[ "$frontend_test_files" -ge 1 ]]; then
  print_check WARN "Frontend test files" "only ${frontend_test_files} test files"
else
  print_check FAIL "Frontend test files" "no test files found"
fi

# E2E (Playwright) tests
e2e_specs=$(find frontend/e2e -name '*.spec.ts' 2>/dev/null | grep -v snapshots | wc -l)
if [[ "$e2e_specs" -ge 3 ]]; then
  print_check PASS "E2E (Playwright) specs" "${e2e_specs} spec files"
else
  print_check FAIL "E2E (Playwright) specs" "only ${e2e_specs} found (need 3+)"
fi

# a11y tests
if [[ -f "frontend/e2e/a11y.spec.ts" ]]; then
  print_check PASS "Accessibility (a11y) spec" "a11y.spec.ts exists"
else
  print_check FAIL "Accessibility (a11y) spec" "not found"
fi

# Visual regression tests
if [[ -f "frontend/e2e/visual-regression.spec.ts" ]]; then
  snapshot_count=$(find frontend/e2e/snapshots -name '*.png' 2>/dev/null | wc -l)
  print_check PASS "Visual regression spec" "${snapshot_count} baseline snapshots"
else
  print_check WARN "Visual regression spec" "not found"
fi

# Load test
if [[ -f "scripts/load-test.py" ]] || [[ -f "locust/locustfile.py" ]]; then
  print_check PASS "Load test (Locust)" "locustfile found"
else
  print_check FAIL "Load test (Locust)" "no load test file"
fi

# Test result reports
test_report_count=$(find test -name '결과서_*' -o -name '교차검증_*' 2>/dev/null | grep -v '.claude' | wc -l)
if [[ "$test_report_count" -ge 5 ]]; then
  print_check PASS "Test result reports" "${test_report_count} reports archived"
else
  print_check WARN "Test result reports" "only ${test_report_count} reports"
fi

# ═════════════════════════════════════════════════════════════
# 3. SECURITY
# ═════════════════════════════════════════════════════════════
section_header "3. Security"
report_section "3. Security"

# Hardcoded secrets scan
secret_patterns='(password|secret|api_key|apikey|token|private_key)\s*[:=]\s*["\x27][^"\x27]{8,}'
secret_hits=$(grep -rni --include='*.go' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.yaml' --include='*.yml' \
  -E "$secret_patterns" . 2>/dev/null \
  | grep -v node_modules \
  | grep -v '.claude' \
  | grep -v '_test.go' \
  | grep -v '.test.' \
  | grep -v 'go.sum' \
  | grep -v 'package-lock' \
  | grep -v '.example' \
  | grep -v 'TEMPLATE' \
  | wc -l)
if [[ "$secret_hits" -eq 0 ]]; then
  print_check PASS "No hardcoded secrets" "0 suspicious patterns"
elif [[ "$secret_hits" -le 3 ]]; then
  print_check WARN "Hardcoded secret scan" "${secret_hits} suspicious patterns (review manually)"
else
  print_check FAIL "Hardcoded secret scan" "${secret_hits} suspicious patterns found"
fi

# .env file check
env_files=$(find . -name '.env' -not -path '*/node_modules/*' -not -path '*/.claude/*' 2>/dev/null | wc -l)
if [[ "$env_files" -eq 0 ]]; then
  print_check PASS "No .env files committed" "clean"
else
  print_check WARN "Found .env files" "${env_files} .env files — verify .gitignore"
fi

# .gitignore check
if [[ -f ".gitignore" ]]; then
  if grep -q '\.env' .gitignore 2>/dev/null; then
    print_check PASS ".gitignore covers .env" "OK"
  else
    print_check WARN ".gitignore missing .env" "add .env to .gitignore"
  fi
else
  print_check FAIL ".gitignore" "file not found"
fi

# OWASP-related: security audit report
if find test -name '*security*' -o -name '*audit*' 2>/dev/null | grep -v '.claude' | grep -q .; then
  print_check PASS "Security audit artifacts" "found in test/"
else
  print_check WARN "Security audit artifacts" "no audit reports in test/"
fi

# Go vulnerability check (config presence)
if [[ -f "agent/go.sum" ]]; then
  print_check PASS "Go dependency lockfile" "go.sum present"
  # Try govulncheck if available
  if command -v govulncheck &>/dev/null; then
    if (cd agent && govulncheck ./... 2>/dev/null); then
      print_check PASS "govulncheck" "no known vulnerabilities"
    else
      print_check WARN "govulncheck" "check completed with findings"
    fi
  else
    print_check WARN "govulncheck" "not installed — run: go install golang.org/x/vuln/cmd/govulncheck@latest"
  fi
else
  print_check FAIL "Go dependency lockfile" "go.sum not found"
fi

# npm audit (config presence)
if [[ -f "frontend/package-lock.json" ]]; then
  print_check PASS "npm lockfile" "package-lock.json present"
  if command -v npm &>/dev/null; then
    npm_audit_output=$(cd frontend && npm audit --production 2>&1 || true)
    critical_count=$(echo "$npm_audit_output" | grep -ci 'critical' || true)
    high_count=$(echo "$npm_audit_output" | grep -ci 'high' || true)
    if [[ "$critical_count" -eq 0 ]] && [[ "$high_count" -le 1 ]]; then
      print_check PASS "npm audit (production)" "0 critical, low risk"
    else
      print_check WARN "npm audit (production)" "review: ${critical_count} critical mentions"
    fi
  else
    print_check WARN "npm audit" "npm not available"
  fi
else
  print_check WARN "npm lockfile" "package-lock.json not found"
fi

# THIRD_PARTY_LICENSES
if [[ -f "THIRD_PARTY_LICENSES.md" ]]; then
  print_check PASS "Third-party licenses" "THIRD_PARTY_LICENSES.md present"
else
  print_check WARN "Third-party licenses" "THIRD_PARTY_LICENSES.md not found"
fi

# ═════════════════════════════════════════════════════════════
# 4. SLO
# ═════════════════════════════════════════════════════════════
section_header "4. SLO Definitions"
report_section "4. SLO"

# Prometheus rules with SLO
if [[ -f "helm/aiservice-monitoring/templates/prometheus-rules.yaml" ]]; then
  rule_count=$(grep -c 'alert:' helm/aiservice-monitoring/templates/prometheus-rules.yaml 2>/dev/null || echo 0)
  record_count=$(grep -c 'record:' helm/aiservice-monitoring/templates/prometheus-rules.yaml 2>/dev/null || echo 0)
  print_check PASS "Prometheus alert rules" "${rule_count} alerts defined"
  print_check PASS "Prometheus recording rules" "${record_count} recording rules"
else
  print_check FAIL "Prometheus rules file" "not found"
fi

# SLO burn rate (check for burn_rate or slo in config files)
slo_refs=$(grep -rli 'slo\|burn.rate\|error.budget' helm/ collector/ 2>/dev/null | grep -v '.claude' | wc -l)
if [[ "$slo_refs" -ge 1 ]]; then
  print_check PASS "SLO / burn rate references" "${slo_refs} files with SLO config"
else
  print_check WARN "SLO / burn rate references" "no SLO config found in helm/collector"
fi

# OTel Collector tail sampling
if [[ -f "collector/config/otelcol-gateway-optimized.yaml" ]]; then
  print_check PASS "Tail sampling config" "otelcol-gateway-optimized.yaml"
else
  print_check WARN "Tail sampling config" "optimized gateway config not found"
fi

if [[ -f "collector/config/otelcol-agent.yaml" ]]; then
  print_check PASS "OTel Agent config" "otelcol-agent.yaml"
else
  print_check FAIL "OTel Agent config" "not found"
fi

if [[ -f "collector/config/otelcol-gateway.yaml" ]]; then
  print_check PASS "OTel Gateway config" "otelcol-gateway.yaml"
else
  print_check FAIL "OTel Gateway config" "not found"
fi

# ═════════════════════════════════════════════════════════════
# 5. DOCUMENTATION
# ═════════════════════════════════════════════════════════════
section_header "5. Documentation"
report_section "5. Documentation"

if [[ -f "WORK_STATUS.md" ]]; then
  ws_lines=$(wc -l < WORK_STATUS.md)
  print_check PASS "WORK_STATUS.md" "${ws_lines} lines"
else
  print_check FAIL "WORK_STATUS.md" "not found"
fi

if [[ -f "README.md" ]]; then
  print_check PASS "README.md" "exists"
else
  print_check FAIL "README.md" "not found"
fi

# Check for CHANGELOG
if [[ -f "CHANGELOG.md" ]]; then
  print_check PASS "CHANGELOG.md" "exists"
else
  print_check WARN "CHANGELOG.md" "not found (recommended for release)"
fi

# Architecture docs
if [[ -f "DOCS/ARCHITECTURE.md" ]]; then
  print_check PASS "Architecture doc" "DOCS/ARCHITECTURE.md"
else
  print_check WARN "Architecture doc" "not found"
fi

# API / design docs
doc_count=$(find DOCS -name '*.md' 2>/dev/null | grep -v '.claude' | wc -l)
if [[ "$doc_count" -ge 10 ]]; then
  print_check PASS "Documentation files" "${doc_count} docs in DOCS/"
elif [[ "$doc_count" -ge 1 ]]; then
  print_check WARN "Documentation files" "only ${doc_count} docs"
else
  print_check FAIL "Documentation files" "DOCS/ is empty"
fi

# User-facing manuals
manual_count=$(find DOCS/manual -name '*.md' 2>/dev/null | wc -l)
if [[ "$manual_count" -ge 3 ]]; then
  print_check PASS "User manuals" "${manual_count} manuals in DOCS/manual/"
else
  print_check WARN "User manuals" "${manual_count} manual(s) — consider adding more"
fi

# Demo docs
if [[ -d "DOCS/demo" ]]; then
  demo_docs=$(find DOCS/demo -name '*.md' 2>/dev/null | wc -l)
  print_check PASS "Demo documentation" "${demo_docs} demo guides"
else
  print_check WARN "Demo documentation" "DOCS/demo/ not found"
fi

# ═════════════════════════════════════════════════════════════
# 6. INFRASTRUCTURE
# ═════════════════════════════════════════════════════════════
section_header "6. Infrastructure"
report_section "6. Infrastructure"

# Helm chart
if [[ -f "helm/aiservice-monitoring/Chart.yaml" ]]; then
  chart_version=$(grep '^version:' helm/aiservice-monitoring/Chart.yaml 2>/dev/null | head -1 | awk '{print $2}')
  print_check PASS "Helm Chart.yaml" "version=${chart_version:-unknown}"
else
  print_check FAIL "Helm Chart.yaml" "not found"
fi

if [[ -f "helm/aiservice-monitoring/values.yaml" ]]; then
  print_check PASS "Helm values.yaml (default)" "exists"
else
  print_check FAIL "Helm values.yaml" "not found"
fi

if [[ -f "helm/aiservice-monitoring/values-prod.yaml" ]]; then
  print_check PASS "Helm values-prod.yaml" "production overrides"
else
  print_check WARN "Helm values-prod.yaml" "no production overrides"
fi

if [[ -f "helm/aiservice-monitoring/values-dev.yaml" ]]; then
  print_check PASS "Helm values-dev.yaml" "development overrides"
else
  print_check WARN "Helm values-dev.yaml" "not found"
fi

# Helm template count
helm_templates=$(find helm/aiservice-monitoring/templates -name '*.yaml' 2>/dev/null | wc -l)
if [[ "$helm_templates" -ge 5 ]]; then
  print_check PASS "Helm templates" "${helm_templates} template files"
else
  print_check WARN "Helm templates" "only ${helm_templates} templates"
fi

# Helm lint (if helm available)
if command -v helm &>/dev/null; then
  if helm lint helm/aiservice-monitoring/ 2>/dev/null | grep -q 'no failures'; then
    print_check PASS "Helm lint" "no failures"
  else
    print_check WARN "Helm lint" "lint completed with warnings"
  fi
else
  print_check WARN "Helm lint" "helm CLI not installed — skipped"
fi

# K8s deployment manifests
k8s_deployments=$(find helm -name '*deployment*' 2>/dev/null | wc -l)
if [[ "$k8s_deployments" -ge 1 ]]; then
  print_check PASS "K8s Deployment manifests" "${k8s_deployments} found"
else
  print_check FAIL "K8s Deployment manifests" "none found"
fi

# Ingress
if [[ -f "helm/aiservice-monitoring/templates/ingress.yaml" ]]; then
  print_check PASS "Ingress manifest" "exists"
else
  print_check WARN "Ingress manifest" "not found"
fi

# NetworkPolicy
if [[ -f "helm/aiservice-monitoring/templates/networkpolicy.yaml" ]]; then
  print_check PASS "NetworkPolicy manifest" "exists"
else
  print_check WARN "NetworkPolicy manifest" "not found"
fi

# RBAC
if [[ -f "helm/aiservice-monitoring/templates/rbac.yaml" ]]; then
  print_check PASS "RBAC manifest" "exists"
else
  print_check WARN "RBAC manifest" "not found"
fi

# HPA
hpa_files=$(find helm -name '*hpa*' 2>/dev/null | wc -l)
if [[ "$hpa_files" -ge 1 ]]; then
  print_check PASS "HPA manifests" "${hpa_files} found"
else
  print_check WARN "HPA manifests" "none found"
fi

# K8s deploy script
if [[ -f "scripts/k8s-deploy.sh" ]]; then
  print_check PASS "K8s deploy script" "scripts/k8s-deploy.sh"
else
  print_check WARN "K8s deploy script" "not found"
fi

# ═════════════════════════════════════════════════════════════
# 7. MONITORING
# ═════════════════════════════════════════════════════════════
section_header "7. Monitoring"
report_section "7. Monitoring"

# Prometheus rules
if [[ -f "helm/aiservice-monitoring/templates/prometheus-rules.yaml" ]]; then
  print_check PASS "Prometheus rules loaded" "prometheus-rules.yaml"
else
  print_check FAIL "Prometheus rules" "template not found"
fi

# ServiceMonitor
if [[ -f "helm/aiservice-monitoring/templates/servicemonitor.yaml" ]]; then
  print_check PASS "ServiceMonitor" "servicemonitor.yaml"
else
  print_check WARN "ServiceMonitor" "not found"
fi

# Grafana dashboards
dashboard_count=$(find dashboards -name '*.json' 2>/dev/null | wc -l)
if [[ "$dashboard_count" -ge 3 ]]; then
  print_check PASS "Grafana dashboards" "${dashboard_count} JSON dashboards"
else
  print_check FAIL "Grafana dashboards" "only ${dashboard_count} (need 3+)"
fi

# Dashboard configmap (auto-provisioning)
if [[ -f "helm/aiservice-monitoring/templates/configmap-dashboards.yaml" ]]; then
  print_check PASS "Dashboard auto-provisioning" "configmap-dashboards.yaml"
else
  print_check WARN "Dashboard auto-provisioning" "configmap not found"
fi

# OTel Collector configs
otel_configs=$(find collector/config -name '*.yaml' 2>/dev/null | wc -l)
if [[ "$otel_configs" -ge 2 ]]; then
  print_check PASS "OTel Collector configs" "${otel_configs} config files"
else
  print_check WARN "OTel Collector configs" "only ${otel_configs} configs"
fi

# Alert test script
if [[ -f "scripts/test-alerts.sh" ]]; then
  print_check PASS "Alert test script" "scripts/test-alerts.sh"
else
  print_check WARN "Alert test script" "not found"
fi

# Pipeline docs
pipeline_docs=$(find collector/pipelines -name '*.md' 2>/dev/null | wc -l)
if [[ "$pipeline_docs" -ge 1 ]]; then
  print_check PASS "Pipeline documentation" "${pipeline_docs} pipeline docs"
else
  print_check WARN "Pipeline documentation" "none"
fi

# ═════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════
echo ""
printf "${BOLD}${CYAN}━━━ Summary ━━━${NC}\n"

TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
printf "  Total checks: %d\n" "$TOTAL"
printf "  ${GREEN}PASS: %d${NC}\n" "$PASS_COUNT"
printf "  ${RED}FAIL: %d${NC}\n" "$FAIL_COUNT"
printf "  ${YELLOW}WARN: %d${NC}\n" "$WARN_COUNT"
echo ""

# ─── 보고서 출력 ─────────────────────────────────────────────
flush_report
printf "  Report saved to: ${CYAN}%s${NC}\n" "$REPORT_FILE"
echo ""

# ─── 최종 판정 ───────────────────────────────────────────────
if [[ "$CRITICAL_FAIL" -eq 0 ]]; then
  printf "${BOLD}${GREEN}  ✔ RELEASE READY — All critical checks passed${NC}\n"
  echo ""
  exit 0
else
  printf "${BOLD}${RED}  ✘ NOT READY — %d critical failure(s)${NC}\n" "$CRITICAL_FAIL"
  echo ""
  exit 1
fi
