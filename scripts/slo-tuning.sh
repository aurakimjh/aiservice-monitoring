#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# slo-tuning.sh — AITOP SLO 임계치 튜닝 도구
#
# Phase 9'-1: 프로덕션 운영 데이터를 기반으로 SLO 임계치를 점검하고 조정합니다.
#
# Usage:
#   ./scripts/slo-tuning.sh check    [--prometheus-url URL]
#   ./scripts/slo-tuning.sh report   [--prometheus-url URL]
#   ./scripts/slo-tuning.sh apply    [--prometheus-url URL] [--dry-run]
#   ./scripts/slo-tuning.sh validate [--prometheus-url URL]
#
# Commands:
#   check    — 현재 메트릭 값 vs 임계치 비교 테이블 출력
#   report   — Markdown 튜닝 리포트 생성 (reports/slo-tuning-report.md)
#   apply    — Prometheus recording/alerting rules 업데이트
#   validate — 모든 SLO가 임계치 범위 내인지 검증
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── 상수 / 기본값 ───────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
THRESHOLDS_FILE="$PROJECT_ROOT/infra/slo/slo-thresholds.yaml"
REPORT_DIR="$PROJECT_ROOT/reports"
REPORT_FILE="$REPORT_DIR/slo-tuning-report.md"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
DRY_RUN=false
VERBOSE=false

# ── 색상 ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  RED='' YELLOW='' GREEN='' CYAN='' BOLD='' DIM='' RESET=''
fi

# ── 상태 아이콘 ─────────────────────────────────────────────────────────────
ICON_OK="OK"
ICON_WARN="WARN"
ICON_CRIT="CRIT"
ICON_UNKNOWN="??"

# 터미널이 UTF-8을 지원하면 이모지 사용
if [[ "${LANG:-}" == *UTF-8* ]] || [[ "${LC_ALL:-}" == *UTF-8* ]] || [[ "${TERM_PROGRAM:-}" == "iTerm"* ]]; then
  ICON_OK=$'\xe2\x9c\x85'       # ✅
  ICON_WARN=$'\xe2\x9a\xa0\xef\xb8\x8f'  # ⚠️
  ICON_CRIT=$'\xf0\x9f\x94\xb4' # 🔴
  ICON_UNKNOWN=$'\xe2\x9d\x93'  # ❓
fi

# ── 유틸리티 함수 ───────────────────────────────────────────────────────────
log_info()  { echo -e "${CYAN}[INFO]${RESET}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
log_ok()    { echo -e "${GREEN}[OK]${RESET}    $*"; }

print_header() {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  $1${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

# ── 의존성 확인 ─────────────────────────────────────────────────────────────
check_dependencies() {
  local missing=()
  for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done

  # yq is optional; we can parse YAML with a simple approach if missing
  if ! command -v yq &>/dev/null; then
    log_warn "yq not found — using built-in YAML parser (limited)"
    HAS_YQ=false
  else
    HAS_YQ=true
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing required tools: ${missing[*]}"
    log_error "Install with: apt-get install ${missing[*]}  (or brew install ${missing[*]})"
    exit 1
  fi
}

# ── YAML 파서 (간이) ────────────────────────────────────────────────────────
# Extracts metric definitions from the thresholds YAML.
# Returns lines: category|key|description|unit|baseline|warning|critical|direction|sli
parse_thresholds() {
  if [[ ! -f "$THRESHOLDS_FILE" ]]; then
    log_error "Thresholds file not found: $THRESHOLDS_FILE"
    exit 1
  fi

  if $HAS_YQ; then
    _parse_with_yq
  else
    _parse_with_awk
  fi
}

_parse_with_yq() {
  # Iterate over top-level categories (llm, gpu, guardrail, external_api, vectordb, infra)
  local categories
  categories=$(yq e 'keys | .[]' "$THRESHOLDS_FILE" 2>/dev/null | grep -v -E '^(version|tuned_at|tuning_window|slo_definitions)$')

  for cat in $categories; do
    local keys
    keys=$(yq e ".$cat | keys | .[]" "$THRESHOLDS_FILE" 2>/dev/null) || continue
    for key in $keys; do
      local desc unit baseline warning critical direction sli
      desc=$(yq e ".$cat.$key.description // \"\"" "$THRESHOLDS_FILE")
      unit=$(yq e ".$cat.$key.unit // \"\"" "$THRESHOLDS_FILE")
      baseline=$(yq e ".$cat.$key.baseline // \"\"" "$THRESHOLDS_FILE")
      warning=$(yq e ".$cat.$key.warning // \"\"" "$THRESHOLDS_FILE")
      critical=$(yq e ".$cat.$key.critical // \"\"" "$THRESHOLDS_FILE")
      direction=$(yq e ".$cat.$key.direction // \"higher_is_worse\"" "$THRESHOLDS_FILE")
      sli=$(yq e ".$cat.$key.sli // \"\"" "$THRESHOLDS_FILE")
      echo "${cat}|${key}|${desc}|${unit}|${baseline}|${warning}|${critical}|${direction}|${sli}"
    done
  done
}

_parse_with_awk() {
  # Fallback AWK-based parser for systems without yq
  awk '
    /^[a-z_]+:$/ && !/^(version|tuned_at|tuning_window|slo_definitions)/ {
      category = $1; gsub(/:/, "", category); next
    }
    /^  [a-z_]+:$/ && category != "" {
      key = $1; gsub(/:/, "", key)
      desc=""; unit=""; baseline=""; warning=""; critical=""; direction="higher_is_worse"; sli=""
      next
    }
    /^    description:/ && key != "" { desc = $0; gsub(/^    description: *"?/, "", desc); gsub(/"$/, "", desc) }
    /^    unit:/        && key != "" { unit = $2; gsub(/"/, "", unit) }
    /^    baseline:/    && key != "" { baseline = $2 }
    /^    warning:/     && key != "" { warning = $2 }
    /^    critical:/    && key != "" { critical = $2 }
    /^    direction:/   && key != "" { direction = $2 }
    /^    sli:/         && key != "" {
      sli = $0; gsub(/^    sli: */, "", sli)
      # Print the record once we have sli (last expected field for metrics with sli)
    }
    # Detect end of a metric block (next metric or section starts)
    /^  [a-z_]+:$/ && critical != "" && key != "" {
      # flush previous
    }
    /^$/ || /^[a-z#]/ {
      if (key != "" && baseline != "") {
        print category"|"key"|"desc"|"unit"|"baseline"|"warning"|"critical"|"direction"|"sli
        key=""; baseline=""
      }
    }
    END {
      if (key != "" && baseline != "") {
        print category"|"key"|"desc"|"unit"|"baseline"|"warning"|"critical"|"direction"|"sli
      }
    }
  ' "$THRESHOLDS_FILE"
}

# ── Prometheus 쿼리 ─────────────────────────────────────────────────────────
prometheus_query() {
  local query="$1"
  local result

  if [[ -z "$query" ]]; then
    echo ""
    return
  fi

  result=$(curl -sf --max-time 10 \
    "${PROMETHEUS_URL}/api/v1/query" \
    --data-urlencode "query=${query}" 2>/dev/null) || {
    echo ""
    return
  }

  echo "$result" | jq -r '.data.result[0].value[1] // empty' 2>/dev/null || echo ""
}

# Checks if Prometheus is reachable
prometheus_health() {
  if curl -sf --max-time 5 "${PROMETHEUS_URL}/-/healthy" &>/dev/null; then
    return 0
  else
    return 1
  fi
}

# ── 상태 판정 ───────────────────────────────────────────────────────────────
# Determines status given current value, thresholds, and direction
# Returns: ok | warning | critical | unknown
evaluate_status() {
  local current="$1" baseline="$2" warning="$3" critical="$4" direction="${5:-higher_is_worse}"

  if [[ -z "$current" || "$current" == "null" ]]; then
    echo "unknown"
    return
  fi

  if [[ "$direction" == "lower_is_worse" ]]; then
    # Lower values are bad (e.g., cache hit rate, TPS)
    if awk "BEGIN { exit !($current <= $critical) }" 2>/dev/null; then
      echo "critical"
    elif awk "BEGIN { exit !($current <= $warning) }" 2>/dev/null; then
      echo "warning"
    else
      echo "ok"
    fi
  else
    # Higher values are bad (e.g., latency, error rate)
    if awk "BEGIN { exit !($current >= $critical) }" 2>/dev/null; then
      echo "critical"
    elif awk "BEGIN { exit !($current >= $warning) }" 2>/dev/null; then
      echo "warning"
    else
      echo "ok"
    fi
  fi
}

# Calculates drift percentage: how far current is from baseline
calculate_drift() {
  local current="$1" baseline="$2"

  if [[ -z "$current" || "$current" == "null" || -z "$baseline" || "$baseline" == "0" ]]; then
    echo "N/A"
    return
  fi

  awk "BEGIN { printf \"%.1f\", (($current - $baseline) / $baseline) * 100 }" 2>/dev/null || echo "N/A"
}

# ── 상태 아이콘 매핑 ────────────────────────────────────────────────────────
status_icon() {
  case "$1" in
    ok)       echo "$ICON_OK" ;;
    warning)  echo "$ICON_WARN" ;;
    critical) echo "$ICON_CRIT" ;;
    *)        echo "$ICON_UNKNOWN" ;;
  esac
}

status_color() {
  case "$1" in
    ok)       echo "${GREEN}" ;;
    warning)  echo "${YELLOW}" ;;
    critical) echo "${RED}" ;;
    *)        echo "${DIM}" ;;
  esac
}

# ── 메트릭 매핑: key → Prometheus 쿼리 ──────────────────────────────────────
# Maps metric category.key to a known Prometheus query when SLI is not defined
get_default_query() {
  local cat="$1" key="$2"
  case "${cat}.${key}" in
    gpu.vram_utilization)     echo 'avg(DCGM_FI_DEV_FB_USED / DCGM_FI_DEV_FB_TOTAL * 100)' ;;
    gpu.temperature)          echo 'avg(DCGM_FI_DEV_GPU_TEMP)' ;;
    gpu.power_utilization)    echo 'avg(DCGM_FI_DEV_POWER_USAGE / DCGM_FI_DEV_POWER_LIMIT * 100)' ;;
    infra.cpu_utilization)    echo '100 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100' ;;
    infra.memory_utilization) echo '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100' ;;
    *)                        echo '' ;;
  esac
}

# ── 명령: check ─────────────────────────────────────────────────────────────
cmd_check() {
  print_header "AITOP SLO Threshold Check"

  local prom_available=false
  if prometheus_health; then
    prom_available=true
    log_ok "Prometheus reachable at ${PROMETHEUS_URL}"
  else
    log_warn "Prometheus unreachable at ${PROMETHEUS_URL} — showing thresholds only"
  fi

  echo ""
  printf "${BOLD}%-30s │ %10s │ %10s │ %10s │ %10s │ %8s │ %s${RESET}\n" \
    "Metric" "Baseline" "Warning" "Critical" "Current" "Drift" "Status"
  printf "%.0s─" {1..105}; echo ""

  local total=0 ok_count=0 warn_count=0 crit_count=0 unknown_count=0

  while IFS='|' read -r cat key desc unit baseline warning critical direction sli; do
    [[ -z "$cat" ]] && continue

    local label="${cat}/${key}"
    local current=""
    local status="unknown"
    local drift="N/A"

    # Determine query
    local query="$sli"
    if [[ -z "$query" ]]; then
      query=$(get_default_query "$cat" "$key")
    fi

    # Query Prometheus if available
    if $prom_available && [[ -n "$query" ]]; then
      current=$(prometheus_query "$query")
      if [[ -n "$current" && "$current" != "null" ]]; then
        # Round to 2 decimal places
        current=$(awk "BEGIN { printf \"%.2f\", $current }" 2>/dev/null || echo "$current")
        status=$(evaluate_status "$current" "$baseline" "$warning" "$critical" "$direction")
        drift=$(calculate_drift "$current" "$baseline")
      fi
    fi

    # Format output
    local color
    color=$(status_color "$status")
    local icon
    icon=$(status_icon "$status")

    local current_display="${current:-—}"
    local drift_display
    if [[ "$drift" == "N/A" ]]; then
      drift_display="—"
    elif [[ "$drift" == -* ]]; then
      drift_display="${drift}%"
    else
      drift_display="+${drift}%"
    fi

    printf "${color}%-30s │ %8s %s │ %8s %s │ %8s %s │ %8s %s │ %8s │ %s${RESET}\n" \
      "$label" \
      "$baseline" "$unit" \
      "$warning" "$unit" \
      "$critical" "$unit" \
      "$current_display" "$unit" \
      "$drift_display" \
      "$icon"

    total=$((total + 1))
    case "$status" in
      ok)       ok_count=$((ok_count + 1)) ;;
      warning)  warn_count=$((warn_count + 1)) ;;
      critical) crit_count=$((crit_count + 1)) ;;
      *)        unknown_count=$((unknown_count + 1)) ;;
    esac
  done < <(parse_thresholds)

  # Summary
  echo ""
  printf "%.0s─" {1..105}; echo ""
  echo -e "${BOLD}Summary:${RESET} ${total} metrics total"
  echo -e "  ${GREEN}${ICON_OK} OK:${RESET}       ${ok_count}"
  echo -e "  ${YELLOW}${ICON_WARN} Warning:${RESET}  ${warn_count}"
  echo -e "  ${RED}${ICON_CRIT} Critical:${RESET} ${crit_count}"
  echo -e "  ${DIM}${ICON_UNKNOWN} Unknown:${RESET}  ${unknown_count}"
  echo ""

  if [[ $crit_count -gt 0 ]]; then
    log_error "Critical thresholds breached! Immediate action required."
    return 2
  elif [[ $warn_count -gt 0 ]]; then
    log_warn "Warning thresholds breached. Schedule tuning review."
    return 1
  else
    log_ok "All metrics within acceptable bounds."
    return 0
  fi
}

# ── 명령: report ─────────────────────────────────────────────────────────────
cmd_report() {
  print_header "AITOP SLO Tuning Report Generator"

  mkdir -p "$REPORT_DIR"

  local prom_available=false
  if prometheus_health; then
    prom_available=true
    log_ok "Prometheus reachable — including live data"
  else
    log_warn "Prometheus unreachable — report will contain threshold definitions only"
  fi

  local timestamp
  timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  local date_human
  date_human=$(date '+%Y-%m-%d %H:%M')

  # Start building report
  cat > "$REPORT_FILE" <<HEADER
# AITOP SLO Tuning Report

**Generated:** ${date_human}
**Prometheus:** ${PROMETHEUS_URL}
**Thresholds File:** \`infra/slo/slo-thresholds.yaml\`
**Tuning Window:** 2 weeks production data

---

## Threshold Overview

| Metric | Unit | Baseline | Warning | Critical | Current | Drift | Status |
|--------|------|----------|---------|----------|---------|-------|--------|
HEADER

  local total=0 ok_count=0 warn_count=0 crit_count=0 unknown_count=0
  local recommendations=""

  while IFS='|' read -r cat key desc unit baseline warning critical direction sli; do
    [[ -z "$cat" ]] && continue

    local label="${cat}/${key}"
    local current="" status="unknown" drift="N/A"

    local query="$sli"
    if [[ -z "$query" ]]; then
      query=$(get_default_query "$cat" "$key")
    fi

    if $prom_available && [[ -n "$query" ]]; then
      current=$(prometheus_query "$query")
      if [[ -n "$current" && "$current" != "null" ]]; then
        current=$(awk "BEGIN { printf \"%.2f\", $current }" 2>/dev/null || echo "$current")
        status=$(evaluate_status "$current" "$baseline" "$warning" "$critical" "$direction")
        drift=$(calculate_drift "$current" "$baseline")
      fi
    fi

    local current_display="${current:-N/A}"
    local drift_display
    if [[ "$drift" == "N/A" ]]; then
      drift_display="N/A"
    elif [[ "$drift" == -* ]]; then
      drift_display="${drift}%"
    else
      drift_display="+${drift}%"
    fi

    local status_emoji
    case "$status" in
      ok)       status_emoji="OK" ;;
      warning)  status_emoji="WARN" ;;
      critical) status_emoji="CRIT" ;;
      *)        status_emoji="??" ;;
    esac

    echo "| ${label} | ${unit} | ${baseline} | ${warning} | ${critical} | ${current_display} | ${drift_display} | ${status_emoji} |" >> "$REPORT_FILE"

    # Collect recommendations
    if [[ "$status" == "critical" ]]; then
      recommendations+="- **CRITICAL** \`${label}\`: Current=${current_display} exceeds critical=${critical}. "
      recommendations+="Investigate immediately. Consider adjusting baseline or fixing root cause.\n"
    elif [[ "$status" == "warning" ]]; then
      recommendations+="- **WARNING** \`${label}\`: Current=${current_display} exceeds warning=${warning}. "
      if [[ "$drift" != "N/A" ]]; then
        recommendations+="Drift: ${drift_display} from baseline. "
      fi
      recommendations+="Schedule review within 48h.\n"
    elif [[ "$status" == "ok" && "$drift" != "N/A" ]]; then
      # Check if drift is > 20%
      local abs_drift
      abs_drift=$(echo "$drift" | tr -d '-')
      if awk "BEGIN { exit !($abs_drift > 20) }" 2>/dev/null; then
        recommendations+="- **DRIFT** \`${label}\`: ${drift_display} drift from baseline (baseline=${baseline}, current=${current_display}). "
        recommendations+="Consider rebaselining.\n"
      fi
    fi

    total=$((total + 1))
    case "$status" in
      ok)       ok_count=$((ok_count + 1)) ;;
      warning)  warn_count=$((warn_count + 1)) ;;
      critical) crit_count=$((crit_count + 1)) ;;
      *)        unknown_count=$((unknown_count + 1)) ;;
    esac
  done < <(parse_thresholds)

  # Write summary and recommendations
  cat >> "$REPORT_FILE" <<SUMMARY

---

## Summary

- **Total Metrics:** ${total}
- **OK:** ${ok_count}
- **Warning:** ${warn_count}
- **Critical:** ${crit_count}
- **Unknown:** ${unknown_count}

## Recommendations

SUMMARY

  if [[ -n "$recommendations" ]]; then
    echo -e "$recommendations" >> "$REPORT_FILE"
  else
    echo "No recommendations at this time. All metrics are within baseline expectations." >> "$REPORT_FILE"
  fi

  # SLO Budget section
  cat >> "$REPORT_FILE" <<'SLO_SECTION'

---

## SLO Error Budget Status

| SLO | Service | Target | Window | Burn Rate (page) | Burn Rate (ticket) |
|-----|---------|--------|--------|-------------------|--------------------|
SLO_SECTION

  if $HAS_YQ; then
    local slo_count
    slo_count=$(yq e '.slo_definitions | length' "$THRESHOLDS_FILE" 2>/dev/null || echo 0)
    for i in $(seq 0 $((slo_count - 1))); do
      local name service target window page ticket
      name=$(yq e ".slo_definitions[$i].name" "$THRESHOLDS_FILE")
      service=$(yq e ".slo_definitions[$i].service" "$THRESHOLDS_FILE")
      target=$(yq e ".slo_definitions[$i].target" "$THRESHOLDS_FILE")
      window=$(yq e ".slo_definitions[$i].window" "$THRESHOLDS_FILE")
      page=$(yq e ".slo_definitions[$i].burn_rate_thresholds.page" "$THRESHOLDS_FILE")
      ticket=$(yq e ".slo_definitions[$i].burn_rate_thresholds.ticket" "$THRESHOLDS_FILE")
      echo "| ${name} | ${service} | ${target}% | ${window} | ${page}x | ${ticket}x |" >> "$REPORT_FILE"
    done
  else
    echo "| *(Install yq to populate SLO definitions)* | | | | | |" >> "$REPORT_FILE"
  fi

  # Tuning history
  cat >> "$REPORT_FILE" <<FOOTER

---

## Tuning Methodology

1. **Baseline Collection:** P95 values collected over 2-week production window
2. **Warning Threshold:** baseline x 1.5 (or +20% for utilization metrics)
3. **Critical Threshold:** baseline x 2.0 (or SLA contractual limit)
4. **Direction:** Some metrics are "lower_is_worse" (throughput, cache hit rate)
5. **Burn Rate:** Multi-window burn rate alerts per Google SRE handbook

## Next Steps

- [ ] Review metrics with >20% drift from baseline
- [ ] Rebaseline metrics that have stabilized at new normals
- [ ] Verify burn rate alert thresholds match incident response SLAs
- [ ] Schedule next tuning review in 2 weeks

---
*Generated by \`scripts/slo-tuning.sh report\` — Phase 9'-1 SLO Threshold Tuning*
FOOTER

  log_ok "Report written to: ${REPORT_FILE}"
  echo ""
  echo -e "  ${DIM}View:  cat ${REPORT_FILE}${RESET}"
  echo -e "  ${DIM}HTML:  python scripts/md_to_html.py ${REPORT_FILE}${RESET}"
}

# ── 명령: apply ──────────────────────────────────────────────────────────────
cmd_apply() {
  print_header "AITOP SLO Threshold Apply"

  local rules_file="$PROJECT_ROOT/infra/docker/prometheus-rules.yaml"

  if [[ ! -f "$rules_file" ]]; then
    log_error "Prometheus rules file not found: $rules_file"
    exit 1
  fi

  log_info "Reading thresholds from: $THRESHOLDS_FILE"
  log_info "Target rules file: $rules_file"

  if $DRY_RUN; then
    log_warn "DRY RUN mode — no files will be modified"
    echo ""
  fi

  # Generate recording rules from SLO definitions
  local generated_rules=""
  generated_rules+="# ── Auto-generated SLO Recording Rules ──────────────────────────────\n"
  generated_rules+="# Generated by: scripts/slo-tuning.sh apply\n"
  generated_rules+="# Source: infra/slo/slo-thresholds.yaml\n"
  generated_rules+="# Time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')\n\n"

  # Generate threshold-based alerting rules
  local alert_count=0

  while IFS='|' read -r cat key desc unit baseline warning critical direction sli; do
    [[ -z "$cat" || -z "$sli" ]] && continue

    local metric_name="aiservice:slo:${cat}_${key}"
    local alert_name="SLO_${cat}_${key}"
    alert_name=$(echo "$alert_name" | tr '[:lower:]' '[:upper:]')

    if [[ "$direction" == "lower_is_worse" ]]; then
      local warn_rule="  - alert: ${alert_name}_WARNING"
      warn_rule+="\n    expr: ${sli} < ${warning}"
      warn_rule+="\n    for: 5m"
      warn_rule+="\n    labels:"
      warn_rule+="\n      severity: warning"
      warn_rule+="\n      category: ${cat}"
      warn_rule+="\n    annotations:"
      warn_rule+="\n      summary: \"${desc} below warning threshold\""
      warn_rule+="\n      description: \"Current value {{ \$value }} below warning threshold ${warning} ${unit}\""

      local crit_rule="  - alert: ${alert_name}_CRITICAL"
      crit_rule+="\n    expr: ${sli} < ${critical}"
      crit_rule+="\n    for: 2m"
      crit_rule+="\n    labels:"
      crit_rule+="\n      severity: critical"
      crit_rule+="\n      category: ${cat}"
      crit_rule+="\n    annotations:"
      crit_rule+="\n      summary: \"${desc} below critical threshold\""
      crit_rule+="\n      description: \"Current value {{ \$value }} below critical threshold ${critical} ${unit}\""
    else
      local warn_rule="  - alert: ${alert_name}_WARNING"
      warn_rule+="\n    expr: ${sli} > ${warning}"
      warn_rule+="\n    for: 5m"
      warn_rule+="\n    labels:"
      warn_rule+="\n      severity: warning"
      warn_rule+="\n      category: ${cat}"
      warn_rule+="\n    annotations:"
      warn_rule+="\n      summary: \"${desc} exceeds warning threshold\""
      warn_rule+="\n      description: \"Current value {{ \$value }} exceeds warning threshold ${warning} ${unit}\""

      local crit_rule="  - alert: ${alert_name}_CRITICAL"
      crit_rule+="\n    expr: ${sli} > ${critical}"
      crit_rule+="\n    for: 2m"
      crit_rule+="\n    labels:"
      crit_rule+="\n      severity: critical"
      crit_rule+="\n      category: ${cat}"
      crit_rule+="\n    annotations:"
      crit_rule+="\n      summary: \"${desc} exceeds critical threshold\""
      crit_rule+="\n      description: \"Current value {{ \$value }} exceeds critical threshold ${critical} ${unit}\""
    fi

    generated_rules+="${warn_rule}\n\n"
    generated_rules+="${crit_rule}\n\n"
    alert_count=$((alert_count + 2))

  done < <(parse_thresholds)

  if $DRY_RUN; then
    echo -e "${BOLD}Generated ${alert_count} alert rules:${RESET}"
    echo ""
    echo -e "$generated_rules"
    echo ""
    log_info "Dry run complete. Use without --dry-run to apply changes."
  else
    # Write generated rules to a separate file that can be included
    local slo_rules_file="$PROJECT_ROOT/infra/docker/prometheus-slo-rules.yaml"
    {
      echo "# prometheus-slo-rules.yaml — Auto-generated from slo-thresholds.yaml"
      echo "# DO NOT EDIT MANUALLY — run 'scripts/slo-tuning.sh apply' to regenerate"
      echo "# Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      echo ""
      echo "groups:"
      echo "  - name: slo_thresholds"
      echo "    rules:"
      echo -e "$generated_rules"
    } > "$slo_rules_file"

    log_ok "Wrote ${alert_count} alert rules to: ${slo_rules_file}"
    echo ""
    log_info "Next steps:"
    echo "  1. Review: cat $slo_rules_file"
    echo "  2. Reload: curl -X POST ${PROMETHEUS_URL}/-/reload"
    echo "  3. Verify: curl ${PROMETHEUS_URL}/api/v1/rules | jq '.data.groups[] | select(.name==\"slo_thresholds\")'"
  fi
}

# ── 명령: validate ───────────────────────────────────────────────────────────
cmd_validate() {
  print_header "AITOP SLO Threshold Validation"

  local prom_available=false
  if prometheus_health; then
    prom_available=true
    log_ok "Prometheus reachable at ${PROMETHEUS_URL}"
  else
    log_error "Prometheus unreachable at ${PROMETHEUS_URL}"
    log_error "Cannot validate SLOs without live metric data."
    exit 1
  fi

  echo ""
  local total=0 passed=0 failed=0 skipped=0
  local failed_metrics=()

  while IFS='|' read -r cat key desc unit baseline warning critical direction sli; do
    [[ -z "$cat" ]] && continue
    total=$((total + 1))

    local label="${cat}/${key}"
    local query="$sli"
    if [[ -z "$query" ]]; then
      query=$(get_default_query "$cat" "$key")
    fi

    if [[ -z "$query" ]]; then
      printf "  ${DIM}%-40s SKIP (no query)${RESET}\n" "$label"
      skipped=$((skipped + 1))
      continue
    fi

    local current
    current=$(prometheus_query "$query")

    if [[ -z "$current" || "$current" == "null" ]]; then
      printf "  ${DIM}%-40s SKIP (no data)${RESET}\n" "$label"
      skipped=$((skipped + 1))
      continue
    fi

    current=$(awk "BEGIN { printf \"%.2f\", $current }" 2>/dev/null || echo "$current")
    local status
    status=$(evaluate_status "$current" "$baseline" "$warning" "$critical" "$direction")

    if [[ "$status" == "critical" ]]; then
      printf "  ${RED}%-40s FAIL  current=%s %s (critical=%s)${RESET}\n" "$label" "$current" "$unit" "$critical"
      failed=$((failed + 1))
      failed_metrics+=("$label")
    elif [[ "$status" == "warning" ]]; then
      printf "  ${YELLOW}%-40s WARN  current=%s %s (warning=%s)${RESET}\n" "$label" "$current" "$unit" "$warning"
      # Warnings count as pass for validation
      passed=$((passed + 1))
    else
      printf "  ${GREEN}%-40s PASS  current=%s %s${RESET}\n" "$label" "$current" "$unit"
      passed=$((passed + 1))
    fi
  done < <(parse_thresholds)

  echo ""
  printf "%.0s─" {1..70}; echo ""
  echo -e "${BOLD}Validation Results:${RESET}"
  echo -e "  Total:   ${total}"
  echo -e "  ${GREEN}Passed:  ${passed}${RESET}"
  echo -e "  ${RED}Failed:  ${failed}${RESET}"
  echo -e "  ${DIM}Skipped: ${skipped}${RESET}"
  echo ""

  if [[ $failed -gt 0 ]]; then
    log_error "Validation FAILED — ${failed} metric(s) in critical state:"
    for m in "${failed_metrics[@]}"; do
      echo -e "  ${RED}- ${m}${RESET}"
    done
    echo ""
    log_info "Run './scripts/slo-tuning.sh check' for detailed comparison."
    return 1
  else
    log_ok "Validation PASSED — all queried metrics within acceptable bounds."
    return 0
  fi
}

# ── CLI 파싱 ─────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
${BOLD}AITOP SLO Threshold Tuning Tool${RESET}

${BOLD}Usage:${RESET}
  $(basename "$0") <command> [options]

${BOLD}Commands:${RESET}
  check      Compare current metrics against thresholds
  report     Generate Markdown tuning report
  apply      Generate Prometheus alerting rules from thresholds
  validate   Verify all SLOs are within acceptable bounds

${BOLD}Options:${RESET}
  --prometheus-url URL   Prometheus server URL (default: http://localhost:9090)
  --dry-run              Preview changes without applying (for 'apply')
  --verbose              Show detailed debug output
  -h, --help             Show this help

${BOLD}Examples:${RESET}
  $(basename "$0") check
  $(basename "$0") check --prometheus-url http://prometheus:9090
  $(basename "$0") report
  $(basename "$0") apply --dry-run
  $(basename "$0") validate

${BOLD}Environment:${RESET}
  PROMETHEUS_URL         Override default Prometheus URL

${DIM}Phase 9'-1: SLO Threshold Tuning — AITOP AI Service Monitoring${RESET}
EOF
}

main() {
  local command=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      check|report|apply|validate)
        command="$1"
        shift
        ;;
      --prometheus-url)
        PROMETHEUS_URL="${2:?'--prometheus-url requires a URL'}"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        log_error "Unknown argument: $1"
        echo ""
        usage
        exit 1
        ;;
    esac
  done

  if [[ -z "$command" ]]; then
    usage
    exit 1
  fi

  # Pre-flight
  check_dependencies

  if [[ ! -f "$THRESHOLDS_FILE" ]]; then
    log_error "Thresholds file not found: $THRESHOLDS_FILE"
    log_error "Expected at: infra/slo/slo-thresholds.yaml"
    exit 1
  fi

  log_info "Thresholds: ${THRESHOLDS_FILE}"
  log_info "Prometheus: ${PROMETHEUS_URL}"

  # Dispatch
  case "$command" in
    check)    cmd_check    ;;
    report)   cmd_report   ;;
    apply)    cmd_apply    ;;
    validate) cmd_validate ;;
  esac
}

main "$@"
