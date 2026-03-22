#!/usr/bin/env bash
# Phase 17-3: 실데이터 통합 검증 — 전체 실행 마스터 스크립트
#
# 실행 순서:
#   1. Docker 테스트 환경 기동 (docker-compose.test.yaml)
#   2. Collection Server 헬스 대기
#   3. 17-3-1: 에이전트 빌드 + Docker 컨테이너 설치
#   4. 17-3-2: 데이터 파이프라인 검증
#   5. 17-3-3~6: UI 뷰 API 검증
#   6. 테스트 환경 정리 (선택)
#
# 사용법:
#   ./scripts/phase17-3/run-all.sh [--no-docker] [--no-cleanup] [--server URL]
#
# 옵션:
#   --no-docker   Docker Compose 기동/종료 생략 (이미 실행 중인 경우)
#   --no-cleanup  테스트 후 Docker 환경 유지
#   --server URL  Collection Server URL (기본: http://localhost:8080)
#   --skip-build  에이전트 빌드 건너뜀 (바이너리 이미 존재하는 경우)

set -euo pipefail

# ── 색상 출력 ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
banner()  { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ── 경로 ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/docker/docker-compose.test.yaml"

# ── 옵션 파싱 ──────────────────────────────────────────────────────────────
USE_DOCKER=true
CLEANUP=true
SERVER_URL="http://localhost:8080"
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-docker)   USE_DOCKER=false; shift ;;
    --no-cleanup)  CLEANUP=false; shift ;;
    --server)      SERVER_URL="$2"; shift 2 ;;
    --skip-build)  SKIP_BUILD=true; shift ;;
    --help|-h)
      echo "Usage: $(basename "$0") [--no-docker] [--no-cleanup] [--server URL] [--skip-build]"
      exit 0 ;;
    *) error "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── 결과 추적 ──────────────────────────────────────────────────────────────
PHASE_RESULTS=()
TOTAL_PASS=0
TOTAL_FAIL=0
START_TIME=$(date +%s)

run_phase() {
  local phase_name="$1"
  local script="$2"
  shift 2

  banner "══ ${phase_name} ══"

  if [[ ! -f "${script}" ]]; then
    warn "Script not found: ${script} — skipping"
    PHASE_RESULTS+=("SKIP: ${phase_name}")
    return 0
  fi

  chmod +x "${script}"

  if bash "${script}" "$@"; then
    success "${phase_name} — PASSED"
    PHASE_RESULTS+=("PASS: ${phase_name}")
    TOTAL_PASS=$((TOTAL_PASS + 1))
  else
    local exit_code=$?
    error "${phase_name} — FAILED (exit ${exit_code})"
    PHASE_RESULTS+=("FAIL: ${phase_name}")
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
}

# ── cleanup 핸들러 ──────────────────────────────────────────────────────────
cleanup() {
  if [[ "${CLEANUP}" == "true" && "${USE_DOCKER}" == "true" ]]; then
    info "Stopping Docker test environment..."
    docker compose -f "${COMPOSE_FILE}" down -v 2>/dev/null || true
    success "Docker test environment stopped"
  fi
}
trap cleanup EXIT

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  AITOP Phase 17-3: Real Data Integration Verification     ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S')                                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo "  Repo:    ${REPO_ROOT}"
echo "  Server:  ${SERVER_URL}"
echo "  Docker:  ${USE_DOCKER}"
echo "  Cleanup: ${CLEANUP}"
echo ""

# ── Step 0: go build 확인 ──────────────────────────────────────────────────
banner "══ Step 0: Go Build Verification ══"

pushd "${REPO_ROOT}/agent" > /dev/null
info "Running: go build ./..."
if go build ./... 2>&1; then
  success "go build ./... passed"
  PHASE_RESULTS+=("PASS: go build")
  TOTAL_PASS=$((TOTAL_PASS + 1))
else
  error "go build failed"
  PHASE_RESULTS+=("FAIL: go build")
  TOTAL_FAIL=$((TOTAL_FAIL + 1))
fi

info "Running: go test ./..."
if go test -timeout 120s ./... 2>&1; then
  success "go test ./... passed"
  PHASE_RESULTS+=("PASS: go test")
  TOTAL_PASS=$((TOTAL_PASS + 1))
else
  error "go test failed"
  PHASE_RESULTS+=("FAIL: go test")
  TOTAL_FAIL=$((TOTAL_FAIL + 1))
fi
popd > /dev/null

# ── Step 1: Docker 환경 기동 ───────────────────────────────────────────────
if [[ "${USE_DOCKER}" == "true" ]]; then
  banner "══ Step 1: Docker Test Environment ══"

  if [[ ! -f "${COMPOSE_FILE}" ]]; then
    error "docker-compose.test.yaml not found: ${COMPOSE_FILE}"
    exit 1
  fi

  info "Starting Docker test environment..."
  docker compose -f "${COMPOSE_FILE}" up -d --build 2>&1 | tail -20

  # Collection Server 헬스 대기
  info "Waiting for Collection Server to be ready..."
  MAX_WAIT=120
  WAITED=0
  while [[ ${WAITED} -lt ${MAX_WAIT} ]]; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/health" 2>/dev/null || echo "000")
    if [[ "${HTTP_STATUS}" == "200" ]]; then
      success "Collection Server is ready (${WAITED}s)"
      PHASE_RESULTS+=("PASS: Docker environment")
      TOTAL_PASS=$((TOTAL_PASS + 1))
      break
    fi
    sleep 3
    WAITED=$((WAITED + 3))
    if [[ ${WAITED} -ge ${MAX_WAIT} ]]; then
      error "Collection Server not ready after ${MAX_WAIT}s"
      PHASE_RESULTS+=("FAIL: Docker environment")
      TOTAL_FAIL=$((TOTAL_FAIL + 1))
      # 로그 출력
      docker compose -f "${COMPOSE_FILE}" logs collection-server 2>/dev/null | tail -20 || true
    fi
  done
else
  banner "══ Step 1: Skipping Docker (--no-docker) ══"
  # 서버가 실행 중인지만 확인
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/health" 2>/dev/null || echo "000")
  if [[ "${HTTP_STATUS}" == "200" ]]; then
    success "Collection Server reachable at ${SERVER_URL}"
  else
    error "Collection Server not reachable at ${SERVER_URL} (HTTP ${HTTP_STATUS})"
    error "Start with: docker compose -f infra/docker/docker-compose.test.yaml up -d"
    exit 1
  fi
fi

# ── Step 2: 17-3-1 에이전트 설치 ──────────────────────────────────────────
if [[ "${SKIP_BUILD}" == "false" ]]; then
  run_phase "17-3-1: Agent Install & Registration" \
    "${SCRIPT_DIR}/01-agent-install.sh" \
    --server "${SERVER_URL}"
else
  info "Skipping agent build (--skip-build)"
  PHASE_RESULTS+=("SKIP: 17-3-1 Agent Install")
fi

# ── Step 3: 17-3-2 파이프라인 검증 ────────────────────────────────────────
run_phase "17-3-2: Data Pipeline Verification" \
  "${SCRIPT_DIR}/02-pipeline-verify.sh" \
  --server "${SERVER_URL}"

# ── Step 4: 17-3-3~6 UI 뷰 API 검증 ──────────────────────────────────────
run_phase "17-3-3~6: UI View API Verification" \
  "${SCRIPT_DIR}/03-ui-api-verify.sh" \
  --server "${SERVER_URL}"

# ── 결과 요약 ──────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Phase 17-3 Integration Test Summary                      ║"
echo "╠════════════════════════════════════════════════════════════╣"
for result in "${PHASE_RESULTS[@]}"; do
  if [[ "${result}" == PASS:* ]]; then
    printf "║  ${GREEN}%-58s${NC} ║\n" "${result}"
  elif [[ "${result}" == FAIL:* ]]; then
    printf "║  ${RED}%-58s${NC} ║\n" "${result}"
  else
    printf "║  ${YELLOW}%-58s${NC} ║\n" "${result}"
  fi
done
echo "╠════════════════════════════════════════════════════════════╣"
printf "║  PASS: %-3d  FAIL: %-3d  Elapsed: %ds%s ║\n" \
  "${TOTAL_PASS}" "${TOTAL_FAIL}" "${ELAPSED}" "$(printf '%*s' $((20 - ${#ELAPSED})) '')"
echo "╚════════════════════════════════════════════════════════════╝"

if [[ ${TOTAL_FAIL} -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}Phase 17-3 ALL CHECKS PASSED!${NC}"
  echo ""
  echo "  Phase 17-3 (실데이터 통합 검증) 완료"
  echo "  다음 단계: Phase 18 (프론트엔드 품질 + 자동 테스트)"
  exit 0
else
  echo -e "${RED}${BOLD}${TOTAL_FAIL} phase(s) FAILED.${NC}"
  echo ""
  echo "  Troubleshooting:"
  echo "    docker compose -f infra/docker/docker-compose.test.yaml logs"
  echo "    docker compose -f infra/docker/docker-compose.test.yaml ps"
  exit 1
fi
