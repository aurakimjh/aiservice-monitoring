#!/usr/bin/env bash
# AITOP Agent install script
# Usage: curl -fsSL https://example.com/install.sh | sudo bash
#    or: sudo ./install.sh [--server-url URL] [--token TOKEN]
set -euo pipefail

INSTALL_DIR="/opt/aitop-agent"
CONFIG_DIR="/etc/aitop-agent"
DATA_DIR="/var/lib/aitop-agent"
LOG_DIR="/var/log/aitop-agent"
SERVICE_USER="aitop"
BINARY_NAME="aitop-agent"
SERVICE_FILE="/etc/systemd/system/aitop-agent.service"

# ── parse flags ──────────────────────────────────────────────────────────────
SERVER_URL=""
PROJECT_TOKEN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url) SERVER_URL="$2"; shift 2 ;;
    --token)      PROJECT_TOKEN="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── root check ───────────────────────────────────────────────────────────────
if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: this script must be run as root" >&2
  exit 1
fi

echo "==> Installing AITOP Agent"

# ── create system user ───────────────────────────────────────────────────────
if ! id -u "${SERVICE_USER}" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
  echo "    Created system user: ${SERVICE_USER}"
fi

# ── create directories ───────────────────────────────────────────────────────
for dir in "${INSTALL_DIR}" "${CONFIG_DIR}" "${DATA_DIR}" "${LOG_DIR}"; do
  mkdir -p "${dir}"
done
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DATA_DIR}" "${LOG_DIR}"
chmod 750 "${DATA_DIR}" "${LOG_DIR}"

# ── copy binary ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/${BINARY_NAME}" ]]; then
  cp "${SCRIPT_DIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
else
  echo "ERROR: binary not found at ${SCRIPT_DIR}/${BINARY_NAME}" >&2
  echo "       Build with: cd agent && make build" >&2
  exit 1
fi
chmod 755 "${INSTALL_DIR}/${BINARY_NAME}"
chown root:root "${INSTALL_DIR}/${BINARY_NAME}"

# ── write default config (only if not already present) ────────────────────────
CONFIG_FILE="${CONFIG_DIR}/agent.yaml"
if [[ ! -f "${CONFIG_FILE}" ]]; then
  cat > "${CONFIG_FILE}" <<YAML
agent:
  id: ""           # auto-derived from hostname when empty
  mode: full       # full | collect-only | collect-export

server:
  url: "${SERVER_URL}"
  project_token: "${PROJECT_TOKEN}"
  tls:
    cert: ""
    key:  ""
    ca:   ""

schedule:
  default: "0 */6 * * *"    # evidence collection: every 6 hours
  metrics:  "*/60 * * * * *" # buffer flush: every 60 seconds

collectors:
  os:           { enabled: "auto" }
  ai_llm:       { enabled: "auto" }
  ai_gpu:       { enabled: "auto" }
  otel_metrics: { enabled: "auto", prometheus_url: "" }

buffer:
  path:        "${DATA_DIR}/buffer.db"
  max_size_mb: 500

logging:
  level:       info
  path:        "${LOG_DIR}/aitop-agent.log"
  max_size_mb: 100
  max_backups: 5
YAML
  chown root:"${SERVICE_USER}" "${CONFIG_FILE}"
  chmod 640 "${CONFIG_FILE}"
  echo "    Config written: ${CONFIG_FILE}"
else
  echo "    Config already exists, skipping: ${CONFIG_FILE}"
fi

# ── install systemd unit ──────────────────────────────────────────────────────
SYSTEMD_SRC="${SCRIPT_DIR}/systemd/aitop-agent.service"
if [[ -f "${SYSTEMD_SRC}" ]]; then
  cp "${SYSTEMD_SRC}" "${SERVICE_FILE}"
else
  # Inline minimal service file when deploying from a package.
  cat > "${SERVICE_FILE}" <<UNIT
[Unit]
Description=AITOP Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${BINARY_NAME} --config ${CONFIG_FILE}
Restart=on-failure
RestartSec=10
MemoryMax=200M
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
fi

chmod 644 "${SERVICE_FILE}"
echo "    Service file: ${SERVICE_FILE}"

# ── enable & start ────────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable aitop-agent
systemctl restart aitop-agent

echo ""
echo "==> AITOP Agent installed and started"
echo "    Status:  systemctl status aitop-agent"
echo "    Logs:    journalctl -u aitop-agent -f"
echo "    Config:  ${CONFIG_FILE}"
