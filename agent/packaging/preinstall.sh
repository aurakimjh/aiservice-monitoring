#!/bin/bash
# preinstall.sh — AITOP Agent 패키지 설치 전 스크립트

# aitop 사용자/그룹 생성 (없는 경우)
if ! getent group aitop >/dev/null 2>&1; then
    groupadd --system aitop
fi

if ! getent passwd aitop >/dev/null 2>&1; then
    useradd --system --gid aitop --home-dir /var/lib/aitop --shell /sbin/nologin aitop
fi

exit 0
