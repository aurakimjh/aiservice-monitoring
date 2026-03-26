#!/bin/bash
# postinstall.sh — AITOP Agent 패키지 설치 후 스크립트

# 디렉토리 소유권 설정
chown -R aitop:aitop /var/log/aitop
chown -R aitop:aitop /var/lib/aitop

# systemd 리로드
systemctl daemon-reload

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  AITOP Agent installed successfully!"
echo ""
echo "  Configuration: /etc/aitop/agent.yaml"
echo "  Logs:          /var/log/aitop/"
echo "  Data:          /var/lib/aitop/"
echo ""
echo "  Start Agent:   sudo systemctl start aitop-agent"
echo "  Enable:        sudo systemctl enable aitop-agent"
echo ""
echo "  Start Server:  sudo systemctl start aitop-collection-server"
echo "  Enable:        sudo systemctl enable aitop-collection-server"
echo "═══════════════════════════════════════════════════════════"

exit 0
