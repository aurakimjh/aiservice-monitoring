#!/bin/bash
# preremove.sh — AITOP Agent 패키지 제거 전 스크립트

# 서비스 중지
systemctl stop aitop-agent 2>/dev/null || true
systemctl stop aitop-collection-server 2>/dev/null || true
systemctl disable aitop-agent 2>/dev/null || true
systemctl disable aitop-collection-server 2>/dev/null || true

exit 0
