#!/bin/bash
# AITOP Agent — 제거 전 스크립트 (preremove)
# 서비스 중지 및 비활성화

set -e

# 서비스가 실행 중이면 중지
if systemctl is-active --quiet aitop-agent.service 2>/dev/null; then
    echo "Stopping aitop-agent service..."
    systemctl stop aitop-agent.service
fi

# 서비스 비활성화
if systemctl is-enabled --quiet aitop-agent.service 2>/dev/null; then
    systemctl disable aitop-agent.service
fi

systemctl daemon-reload

echo "AITOP Agent service stopped and disabled."
echo "Data preserved in /var/lib/aitop-agent/ (remove manually if needed)."

exit 0
