#!/bin/bash
# AITOP Agent — 설치 전 스크립트 (preinstall)
# aitop 시스템 사용자/그룹 생성

set -e

AITOP_USER="aitop"
AITOP_GROUP="aitop"

# 그룹 생성 (존재하지 않으면)
if ! getent group "$AITOP_GROUP" > /dev/null 2>&1; then
    groupadd --system "$AITOP_GROUP"
    echo "Created system group: $AITOP_GROUP"
fi

# 사용자 생성 (존재하지 않으면)
if ! getent passwd "$AITOP_USER" > /dev/null 2>&1; then
    useradd --system \
        --gid "$AITOP_GROUP" \
        --home-dir /opt/aitop-agent \
        --no-create-home \
        --shell /usr/sbin/nologin \
        "$AITOP_USER"
    echo "Created system user: $AITOP_USER"
fi

exit 0
