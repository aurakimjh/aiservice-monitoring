#!/usr/bin/env bash
# Phase 17-3-1: AITOP Agent 자동 빌드 + Docker 테스트 환경 등록 검증
#
# 수행 작업:
#   1. Linux amd64 에이전트 바이너리 빌드
#   2. 테스트 컨테이너 3대에 에이전트 설치
#   3. 각 에이전트가 Collection Server에 등록되었는지 확인
#
# 전제 조건:
#   - docker compose -f infra/docker/docker-compose.test.yaml up -d 실행 완료
#   - Collection Server 헬스 OK (localhost:8080/health)
#
# 사용법:
#   ./scripts/phase17-3/01-agent-install.sh [--server http://localhost:8080]

set -euo pipefail

# ── 색상 출력 ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── 기본값 ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
AGENT_DIR="${REPO_ROOT}/agent"
SERVER_URL="http://localhost:8080"
PROJECT_TOKEN="test-token-phase17"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER_URL="$2"; shift 2 ;;
    --token)  PROJECT_TOKEN="$2"; shift 2 ;;
    *) error "Unknown flag: $1"; exit 1 ;;
  esac
done

BINARY_PATH="${AGENT_DIR}/bin/aitop-agent-linux-amd64"

# ── 1. 바이너리 빌드 ────────────────────────────────────────────────────────
info "Step 1/4: Building Linux amd64 agent binary..."

pushd "${AGENT_DIR}" > /dev/null
make build-linux
popd > /dev/null

if [[ ! -f "${BINARY_PATH}" ]]; then
  error "Binary not found after build: ${BINARY_PATH}"
  exit 1
fi

FILE_INFO=$(file "${BINARY_PATH}" 2>/dev/null || echo "unknown")
success "Binary built: ${BINARY_PATH} (${FILE_INFO##*: })"

# ── 2. Collection Server 헬스 확인 ─────────────────────────────────────────
info "Step 2/4: Checking Collection Server health at ${SERVER_URL}..."

MAX_RETRIES=30
RETRY_INTERVAL=2
for i in $(seq 1 ${MAX_RETRIES}); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/health" 2>/dev/null || echo "000")
  if [[ "${HTTP_STATUS}" == "200" ]]; then
    success "Collection Server is healthy (HTTP ${HTTP_STATUS})"
    break
  fi
  if [[ $i -eq ${MAX_RETRIES} ]]; then
    error "Collection Server not ready after $((MAX_RETRIES * RETRY_INTERVAL))s (last status: ${HTTP_STATUS})"
    error "Start the test environment with: docker compose -f infra/docker/docker-compose.test.yaml up -d"
    exit 1
  fi
  warn "Waiting for Collection Server... (${i}/${MAX_RETRIES})"
  sleep ${RETRY_INTERVAL}
done

# ── 3. Docker 테스트 컨테이너에 에이전트 설치 ──────────────────────────────
info "Step 3/4: Installing agent into Docker test containers..."

# 테스트 대상 컨테이너 정의
declare -A TEST_CONTAINERS=(
  ["test-api-server"]="test-api-01"
  ["test-db-server"]="test-db-01"
  ["test-web-server"]="test-web-01"
)

INSTALLED_COUNT=0

for CONTAINER in "${!TEST_CONTAINERS[@]}"; do
  AGENT_ID="${TEST_CONTAINERS[$CONTAINER]}"
  info "  Installing agent on container: ${CONTAINER} (agent-id: ${AGENT_ID})"

  # 컨테이너 실행 중 확인
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
    # docker compose prefix 포함 이름 시도
    FULL_NAME=$(docker ps --format '{{.Names}}' 2>/dev/null | grep "${CONTAINER}" | head -1 || echo "")
    if [[ -z "${FULL_NAME}" ]]; then
      warn "  Container '${CONTAINER}' is not running — skipping"
      continue
    fi
    CONTAINER="${FULL_NAME}"
  fi

  # 바이너리를 컨테이너로 복사
  docker cp "${BINARY_PATH}" "${CONTAINER}:/usr/local/bin/aitop-agent" 2>/dev/null || {
    warn "  Cannot copy binary to ${CONTAINER} — skipping"
    continue
  }
  docker exec "${CONTAINER}" chmod +x /usr/local/bin/aitop-agent 2>/dev/null || true

  # 에이전트 설정 파일 생성 (컨테이너 내부)
  HOSTNAME=$(docker exec "${CONTAINER}" hostname 2>/dev/null || echo "${AGENT_ID}")
  docker exec "${CONTAINER}" sh -c "mkdir -p /etc/aitop-agent /var/lib/aitop-agent /var/log/aitop-agent" 2>/dev/null || true
  docker exec "${CONTAINER}" sh -c "cat > /etc/aitop-agent/agent.yaml" <<YAML
agent:
  id: "${AGENT_ID}"
  mode: "collect-only"

server:
  url: "${SERVER_URL}"
  project_token: "${PROJECT_TOKEN}"

schedule:
  default: "0 */6 * * *"
  metrics: "*/60 * * * * *"

collectors:
  os:
    enabled: "true"
  ai_llm:
    enabled: "false"
  ai_gpu:
    enabled: "false"

buffer:
  path: "/var/lib/aitop-agent/buffer.db"
  max_size_mb: 100

logging:
  level: "info"
  path: "/var/log/aitop-agent/agent.log"
  max_size_mb: 10
  max_backups: 2
YAML

  # 에이전트 collect-only 모드로 실행 (백그라운드, 즉시 종료)
  docker exec -d "${CONTAINER}" sh -c \
    "aitop-agent --config /etc/aitop-agent/agent.yaml --mode collect-only > /var/log/aitop-agent/agent.log 2>&1 &" \
    2>/dev/null || true

  success "  Agent installed on ${CONTAINER}"
  INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
done

# ── 4. 에이전트가 Collection Server에 등록되었는지 확인 ─────────────────────
info "Step 4/4: Verifying agent registration with Collection Server..."

# JWT 토큰 획득
LOGIN_RESP=$(curl -s -X POST "${SERVER_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aitop.io","password":"admin"}')

ACCESS_TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || echo "")

if [[ -z "${ACCESS_TOKEN}" ]]; then
  warn "Could not obtain JWT token — skipping agent list verification"
  warn "Login response: ${LOGIN_RESP}"
else
  # 에이전트 목록 조회 (fleet + agents 양쪽 엔드포인트 시도)
  sleep 3  # 에이전트가 heartbeat를 보낼 시간 대기

  AGENTS_RESP=$(curl -s "${SERVER_URL}/api/v1/fleet/agents" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" || echo '{"items":[],"total":0}')

  TOTAL=$(echo "${AGENTS_RESP}" | grep -o '"total":[0-9]*' | cut -d: -f2 || echo "0")
  info "  Registered agents in fleet: ${TOTAL}"

  if [[ "${TOTAL:-0}" -gt 0 ]]; then
    success "Agents registered successfully (${TOTAL} total)"
  else
    warn "No agents registered yet — they may need more time or direct heartbeat"
    warn "You can manually send a heartbeat with: ./scripts/phase17-3/02-pipeline-verify.sh"
  fi
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Phase 17-3-1 Summary"
echo "══════════════════════════════════════════════════════════"
echo "  Binary:      ${BINARY_PATH}"
echo "  Server:      ${SERVER_URL}"
echo "  Installed:   ${INSTALLED_COUNT} containers"
echo "  Next step:   ./scripts/phase17-3/02-pipeline-verify.sh"
echo "══════════════════════════════════════════════════════════"
