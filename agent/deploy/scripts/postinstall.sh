#!/bin/bash
# AITOP Agent — 설치 후 스크립트 (postinstall)
# 디렉토리 권한 설정, systemd 등록

set -e

AITOP_USER="aitop"
AITOP_GROUP="aitop"

# 디렉토리 소유권 설정
chown -R "$AITOP_USER:$AITOP_GROUP" /opt/aitop-agent
chown -R "$AITOP_USER:$AITOP_GROUP" /var/lib/aitop-agent
chown -R "$AITOP_USER:$AITOP_GROUP" /var/log/aitop-agent
chown "$AITOP_USER:$AITOP_GROUP" /etc/aitop-agent/agent.yaml

# systemd 서비스 등록
systemctl daemon-reload

# 서비스 활성화 (시작하지는 않음 — 설정 후 수동 시작)
systemctl enable aitop-agent.service

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AITOP Agent 설치 완료                                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  설정 파일: /etc/aitop-agent/agent.yaml                  ║"
echo "║  데이터:    /var/lib/aitop-agent/                        ║"
echo "║  로그:      journalctl -u aitop-agent -f                ║"
echo "║                                                          ║"
echo "║  시작: sudo systemctl start aitop-agent                  ║"
echo "║  상태: sudo systemctl status aitop-agent                 ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

exit 0
