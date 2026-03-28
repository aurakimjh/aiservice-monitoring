# AITOP 운영자 가이드

> **문서 버전**: v1.3.0
> **최종 업데이트**: 2026-03-28
> **대상 독자**: 시스템 운영자, SRE, 인프라 엔지니어
> **관련 문서**: INSTALLATION_GUIDE.md, USER_GUIDE.md

---

## 목차

1. [운영 아키텍처 개요](#1-운영-아키텍처-개요)
2. [리소스 관리](#2-리소스-관리)
   - 2.1 [CPU/메모리 모니터링](#21-cpumemory-모니터링)
   - 2.2 [스토리지 용량 관리](#22-스토리지-용량-관리)
   - 2.3 [Agent 리소스 제한](#23-agent-리소스-제한)
3. [로그 관리](#3-로그-관리)
   - 3.1 [로그 파일 위치](#31-로그-파일-위치)
   - 3.2 [로그 레벨 변경](#32-로그-레벨-변경)
   - 3.3 [로그 로테이션](#33-로그-로테이션)
   - 3.4 [중앙 로그 수집 연동](#34-중앙-로그-수집-연동)
4. [데이터 보관 주기](#4-데이터-보관-주기)
   - 4.1 [Prometheus 메트릭 보관](#41-prometheus-메트릭-보관)
   - 4.2 [Jaeger 트레이스 보관](#42-jaeger-트레이스-보관)
   - 4.3 [증거(Evidence) 파일 보관](#43-증거evidence-파일-보관)
   - 4.4 [감사 로그 보관](#44-감사-로그-보관)
5. [백업 및 복구](#5-백업-및-복구)
   - 5.1 [PostgreSQL 백업](#51-postgresql-백업)
   - 5.2 [Prometheus 데이터 백업](#52-prometheus-데이터-백업)
   - 5.3 [설정 파일 백업](#53-설정-파일-백업)
   - 5.4 [복구 절차](#54-복구-절차)
6. [인증서 관리](#6-인증서-관리)
   - 6.1 [인증서 만료 확인](#61-인증서-만료-확인)
   - 6.2 [인증서 갱신 절차](#62-인증서-갱신-절차)
   - 6.3 [자동 갱신 설정](#63-자동-갱신-설정)
7. [점검 체크리스트](#7-점검-체크리스트)
   - 7.1 [일일 점검](#71-일일-점검)
   - 7.2 [주간 점검](#72-주간-점검)
   - 7.3 [월간 점검](#73-월간-점검)
8. [장애 대응](#8-장애-대응)
   - 8.1 [장애 등급 분류](#81-장애-등급-분류)
   - 8.2 [Collection Server 장애](#82-collection-server-장애)
   - 8.3 [Agent 장애](#83-agent-장애)
   - 8.4 [Frontend 장애](#84-frontend-장애)
   - 8.5 [데이터베이스 장애](#85-데이터베이스-장애)
   - 8.6 [스토리지 포화](#86-스토리지-포화)
9. [업그레이드 절차](#9-업그레이드-절차)
   - 9.1 [업그레이드 전 확인사항](#91-업그레이드-전-확인사항)
   - 9.2 [Collection Server 업그레이드](#92-collection-server-업그레이드)
   - 9.3 [Agent 일괄 업그레이드 (OTA)](#93-agent-일괄-업그레이드-ota)
   - 9.4 [롤백 절차](#94-롤백-절차)
10. [성능 튜닝](#10-성능-튜닝)
    - 10.1 [샘플링 비율 조정](#101-샘플링-비율-조정)
    - 10.2 [메트릭 수집 주기 조정](#102-메트릭-수집-주기-조정)
    - 10.3 [OTel Collector 튜닝](#103-otel-collector-튜닝)
11. [보안 운영](#11-보안-운영)
    - 11.1 [계정 및 권한 관리](#111-계정-및-권한-관리)
    - 11.2 [PII 마스킹 설정](#112-pii-마스킹-설정)
    - 11.3 [원격 CLI 감사](#113-원격-cli-감사)
12. [v1.3 AI 운영](#12-v13-ai-운영)
    - 12.1 [LLM 비용 모니터링](#121-llm-비용-모니터링)
    - 12.2 [AI 진단 ITEM 확인](#122-ai-진단-item-확인)
    - 12.3 [보안 이벤트 확인](#123-보안-이벤트-확인)

---

## 1. 운영 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│  운영자 모니터링 포인트                                           │
│                                                                  │
│  ┌─── Collection Server ─────────────────────────────────────┐  │
│  │  • 프로세스 상태   • PostgreSQL 연결   • gRPC 수신 포트    │  │
│  │  • Prometheus 적재  • 메모리/CPU 사용률  • 디스크 잔여량   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── Agent (각 서버) ───────────────────────────────────────┐  │
│  │  • 연결 상태       • Collector 활성 여부  • 버퍼 사용률   │  │
│  │  • 마지막 전송 시각  • 로그 오류          • 리소스 사용   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─── 스토리지 ──────────────────────────────────────────────┐  │
│  │  • Prometheus 디스크  • Jaeger 디스크  • PostgreSQL 디스크│  │
│  │  • Evidence 파일 크기  • 로그 파일 크기                   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**핵심 운영 원칙**:
- Agent 장애는 모니터링 공백이지 서비스 장애가 아닙니다. 로컬 버퍼가 최대 500MB(약 수 시간분) 데이터를 보관합니다.
- Collection Server 장애 발생 시 Agent는 자동으로 재연결을 시도합니다 (지수 백오프).
- 데이터 유실 방지를 위해 PostgreSQL과 Prometheus 백업이 가장 중요합니다.

---

## 2. 리소스 관리

### 2.1 CPU/메모리 모니터링

**Collection Server 권장 임계값**:

| 지표 | 경고 | 위험 |
|------|------|------|
| CPU 사용률 | 70% | 90% |
| 메모리 사용률 | 75% | 90% |
| gRPC 연결 수 | Agent 수 × 1.5 | Agent 수 × 2 |
| DB 연결 풀 | 80% | 95% |

```bash
# Collection Server 리소스 실시간 확인 (Docker)
docker stats collection-server

# Kubernetes
kubectl top pod -n aitop-monitoring -l app=collection-server

# 프로세스 세부
cat /proc/$(pgrep -f collection-server)/status | grep -E "VmRSS|VmPeak"
```

**Prometheus 쿼리로 운영 지표 확인**:

```promql
# Collection Server 메모리 사용량
process_resident_memory_bytes{job="collection-server"}

# gRPC 초당 요청 수
rate(grpc_server_handled_total{job="collection-server"}[5m])

# Agent 연결 수
aitop_connected_agents_total

# 메트릭 적재 지연 (초)
aitop_ingestion_lag_seconds
```

### 2.2 스토리지 용량 관리

각 구성 요소별 디스크 사용량을 주기적으로 확인합니다.

```bash
# 전체 사용량 요약
df -h /data

# 구성 요소별 상세
du -sh /data/prometheus    # Prometheus 메트릭
du -sh /data/jaeger        # Jaeger 트레이스
du -sh /data/postgres      # PostgreSQL 상태 DB
du -sh /data/evidence      # Evidence 파일
du -sh /var/log/aitop-*    # Agent/Server 로그
```

**스토리지 증가 예측 (Agent 50대 기준)**:

| 데이터 유형 | 일일 증가량 | 30일 총량 |
|------------|-----------|---------|
| Prometheus | ~2 GB | ~60 GB |
| Jaeger | ~5 GB | ~150 GB |
| Evidence | ~500 MB | ~15 GB |
| PostgreSQL | ~200 MB | ~6 GB |

### 2.3 Agent 리소스 제한

Agent가 모니터링 대상 서버에 미치는 영향을 최소화합니다.

**systemd cgroup 제한 설정**:

```bash
# /etc/systemd/system/aitop-agent.service.d/override.conf
sudo mkdir -p /etc/systemd/system/aitop-agent.service.d
sudo tee /etc/systemd/system/aitop-agent.service.d/override.conf << 'EOF'
[Service]
# CPU 최대 30% 제한
CPUQuota=30%
# 메모리 최대 512MB
MemoryMax=512M
# IO 대역폭 제한 (10 MB/s)
IOReadBandwidthMax=/dev/sda 10M
IOWriteBandwidthMax=/dev/sda 10M
EOF

sudo systemctl daemon-reload
sudo systemctl restart aitop-agent
```

**Kubernetes Pod 리소스 제한**:

```yaml
# aitop-agent-daemonset.yaml
resources:
  requests:
    cpu: "100m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

---

## 3. 로그 관리

### 3.1 로그 파일 위치

| 구성 요소 | 로그 경로 | 형식 |
|----------|----------|------|
| AITOP Agent | `/var/log/aitop-agent/agent.log` | JSON |
| Remote CLI 감사 | `/var/log/aitop-agent/terminal-audit.log` | JSON |
| Collection Server | Docker: `docker logs collection-server` | JSON |
| Frontend | PM2: `~/.pm2/logs/aitop-frontend-out.log` | 텍스트 |
| Prometheus | Docker: `docker logs prometheus` | 텍스트 |

### 3.2 로그 레벨 변경

```bash
# Agent 로그 레벨 변경 (재시작 필요)
sudo sed -i 's/level: "info"/level: "debug"/' /etc/aitop-agent/agent.yaml
sudo systemctl restart aitop-agent

# 확인 후 원복
sudo sed -i 's/level: "debug"/level: "info"/' /etc/aitop-agent/agent.yaml
sudo systemctl restart aitop-agent

# Collection Server 런타임 로그 레벨 변경 (재시작 불필요)
curl -X POST http://localhost:8080/admin/log-level \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"level": "debug"}'
```

### 3.3 로그 로테이션

Agent는 내장 로테이션을 사용합니다 (`agent.yaml`의 `max_size_mb`, `max_backups`).

Collection Server는 `/etc/logrotate.d/aitop-server`를 추가합니다:

```
/var/log/aitop-server/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        docker kill --signal=USR1 collection-server 2>/dev/null || true
    endscript
}
```

### 3.4 중앙 로그 수집 연동

Fluent Bit을 사용하여 ELK/Loki로 로그를 전송합니다.

```ini
# /etc/fluent-bit/fluent-bit.conf
[INPUT]
    Name    tail
    Path    /var/log/aitop-agent/agent.log
    Parser  json
    Tag     aitop.agent

[OUTPUT]
    Name    loki
    Match   aitop.*
    Host    loki.monitoring.internal
    Port    3100
    Labels  job=aitop-agent,host=${HOSTNAME}
```

---

## 4. 데이터 보관 주기

### 4.1 Prometheus 메트릭 보관

기본 보관 기간은 30일입니다. 환경에 맞게 조정합니다.

```bash
# Docker Compose .env 수정
PROMETHEUS_RETENTION=30d         # 기간 기반
# 또는 용량 기반 (둘 다 설정 시 먼저 도달한 쪽 적용)
PROMETHEUS_RETENTION_SIZE=100GB

# Kubernetes Helm values.yaml 수정
prometheus:
  retention: "90d"
  retentionSize: "200GB"

# 즉시 반영을 위해 재시작
docker compose restart prometheus
# 또는
kubectl rollout restart deployment/prometheus -n aitop-monitoring
```

**보관 기간별 권장 사항**:

| 용도 | 권장 기간 | 이유 |
|------|----------|------|
| 실시간 운영 | 30일 | 즉각 조회, 용량 균형 |
| 트렌드 분석 | 90일 | 분기 추세 파악 |
| 규정 준수 | 1년 | 감사 요건 충족 |

장기 보관 시 Prometheus Thanos 또는 Grafana Mimir를 연동하세요.

### 4.2 Jaeger 트레이스 보관

```bash
# Jaeger Badger 스토리지 TTL 설정
# docker-compose.yaml에서 Jaeger 환경 변수 수정
SPAN_STORAGE_TYPE=badger
BADGER_EPHEMERAL=false
BADGER_DIRECTORY_VALUE=/data/jaeger/data
BADGER_DIRECTORY_KEY=/data/jaeger/key
BADGER_SPAN_STORE_TTL=168h    # 7일 (기본값)
# 30일로 변경: 720h
```

> **주의**: 트레이스 데이터는 메트릭 대비 10~30배 많은 스토리지를 사용합니다.
> 스토리지 제약이 있으면 트레이스 보관 기간을 7~14일로 유지하세요.

### 4.3 증거(Evidence) 파일 보관

Evidence는 진단 보고서 생성 시 첨부되는 수집 데이터입니다.

```bash
# 수동 정리: 30일 이전 파일 삭제
find /data/evidence -type f -mtime +30 -delete

# cron으로 자동화 (매일 02:00)
echo "0 2 * * * root find /data/evidence -type f -mtime +30 -delete" \
  | sudo tee /etc/cron.d/aitop-evidence-cleanup

# S3 사용 시 버킷 Lifecycle Policy 적용
aws s3api put-bucket-lifecycle-configuration \
  --bucket aitop-evidence \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "expire-old-evidence",
      "Status": "Enabled",
      "Filter": {"Prefix": "evidence/"},
      "Expiration": {"Days": 90}
    }]
  }'
```

### 4.4 감사 로그 보관

원격 CLI 감사 로그는 보안 요건상 장기 보관이 권장됩니다.

```bash
# 감사 로그 압축 보관 (연간 유지)
# /etc/logrotate.d/aitop-audit
/var/log/aitop-agent/terminal-audit.log {
    monthly
    rotate 12
    compress
    delaycompress
    missingok
    dateext
    dateformat -%Y%m
}
```

---

## 5. 백업 및 복구

### 5.1 PostgreSQL 백업

PostgreSQL에는 AITOP 설정, 프로젝트, 사용자, 알림 정책 등 핵심 상태가 저장됩니다.

```bash
# 즉시 백업
pg_dump -h localhost -U aitop -d aitop \
  -F c -b -v \
  -f /backup/aitop-$(date +%Y%m%d-%H%M%S).dump

# 복원 테스트 (별도 인스턴스)
pg_restore -h test-host -U aitop -d aitop_test \
  -F c -v /backup/aitop-20260326-020000.dump

# 자동 백업 스크립트 생성
cat > /usr/local/bin/aitop-backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/backup/aitop"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# PostgreSQL 백업
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "${POSTGRES_HOST:-localhost}" \
  -U "${POSTGRES_USER:-aitop}" \
  -d "${POSTGRES_DB:-aitop}" \
  -F c -b \
  -f "$BACKUP_DIR/postgres-$DATE.dump"

# 오래된 백업 삭제
find "$BACKUP_DIR" -name "postgres-*.dump" -mtime +$RETENTION_DAYS -delete

echo "$(date): Backup completed: postgres-$DATE.dump" >> /var/log/aitop-backup.log
SCRIPT

chmod +x /usr/local/bin/aitop-backup.sh

# cron 등록 (매일 03:00)
echo "0 3 * * * root /usr/local/bin/aitop-backup.sh" \
  | sudo tee /etc/cron.d/aitop-backup
```

### 5.2 Prometheus 데이터 백업

```bash
# Prometheus 스냅샷 생성 (무중단)
curl -X POST http://localhost:9090/api/v1/admin/tsdb/snapshot
# 응답: {"status":"success","data":{"name":"20260326T030000Z-abcdef"}}

# 스냅샷 압축 및 보관
tar -czf /backup/prometheus-$(date +%Y%m%d).tar.gz \
  /data/prometheus/snapshots/20260326T030000Z-abcdef/

# 스냅샷 파일 삭제 (원본 데이터는 유지)
rm -rf /data/prometheus/snapshots/
```

### 5.3 설정 파일 백업

```bash
# 설정 파일 전체 백업
tar -czf /backup/aitop-config-$(date +%Y%m%d).tar.gz \
  /etc/aitop-agent/ \
  /etc/aitop-server/ \
  infra/docker/.env \
  helm/aiservice-monitoring/values.yaml

# Git으로 설정 관리 (권장)
git init /etc/aitop-config
git -C /etc/aitop-config add .
git -C /etc/aitop-config commit -m "config backup $(date +%Y-%m-%d)"
```

### 5.4 복구 절차

**PostgreSQL 복구**:

```bash
# 1. Collection Server 중지
docker compose stop collection-server
# 또는
kubectl scale deployment collection-server --replicas=0 -n aitop-monitoring

# 2. 기존 DB 삭제 및 재생성
psql -U postgres -c "DROP DATABASE aitop;"
psql -U postgres -c "CREATE DATABASE aitop OWNER aitop;"

# 3. 백업 복원
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
  -h localhost -U aitop -d aitop \
  -F c -v /backup/aitop-20260326-020000.dump

# 4. Collection Server 재시작
docker compose start collection-server
```

**전체 재구축 (최악의 경우)**:

```bash
# 1. 백업에서 설정 복원
tar -xzf /backup/aitop-config-20260326.tar.gz -C /

# 2. Collection Server 재설치 (5장 참조)
docker compose -f infra/docker/docker-compose.yaml up -d

# 3. DB 복원 (5.4 절차 동일)

# 4. Agent는 자동으로 재연결됩니다
#    (Agent에 저장된 agent.yaml의 project_token으로 재등록)
```

---

## 6. 인증서 관리

### 6.1 인증서 만료 확인

```bash
# Collection Server TLS 인증서 만료일 확인
openssl s_client -connect collection-server:50051 -servername collection-server \
  2>/dev/null | openssl x509 -noout -dates

# Agent 클라이언트 인증서 만료일
openssl x509 -in /etc/aitop-agent/certs/agent.crt -noout -dates

# CA 인증서 만료일
openssl x509 -in /etc/aitop-agent/certs/ca.crt -noout -dates

# 30일 이내 만료 인증서 찾기 (cron으로 자동화 권장)
for cert in /etc/aitop-agent/certs/*.crt; do
  expiry=$(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)
  days_left=$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 ))
  echo "$cert: $days_left days remaining"
  if [ "$days_left" -lt 30 ]; then
    echo "WARNING: $cert expires in $days_left days!"
  fi
done
```

### 6.2 인증서 갱신 절차

**사설 CA 환경**:

```bash
# 새 서버 인증서 발급
openssl genrsa -out server-new.key 2048
openssl req -new -key server-new.key -out server-new.csr \
  -subj "/C=KR/O=AITOP/CN=collection-server"
openssl x509 -req -in server-new.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server-new.crt -days 365 -sha256

# Collection Server에 새 인증서 적용
cp server-new.crt /etc/aitop-server/certs/server.crt
cp server-new.key /etc/aitop-server/certs/server.key

# 무중단 재시작 (Kubernetes)
kubectl rollout restart deployment/collection-server -n aitop-monitoring

# Agent는 인증서 갱신 후 자동 재연결
```

**Agent 클라이언트 인증서 갱신**:

```bash
# 새 Agent 인증서 발급
openssl genrsa -out agent-new.key 2048
openssl req -new -key agent-new.key -out agent-new.csr \
  -subj "/C=KR/O=AITOP/CN=aitop-agent"
openssl x509 -req -in agent-new.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out agent-new.crt -days 365 -sha256

# Fleet을 통한 일괄 배포 (UI → Fleet → Certificates → Deploy)
# 또는 개별 서버에서 수동 갱신
sudo cp agent-new.crt /etc/aitop-agent/certs/agent.crt
sudo cp agent-new.key /etc/aitop-agent/certs/agent.key
sudo systemctl restart aitop-agent
```

### 6.3 자동 갱신 설정

**Let's Encrypt 자동 갱신**:

```bash
# certbot renew hook 등록
cat > /etc/letsencrypt/renewal-hooks/deploy/aitop-reload.sh << 'EOF'
#!/bin/bash
# Collection Server 인증서 reload
docker kill --signal=SIGHUP collection-server
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/aitop-reload.sh

# cron으로 자동 갱신 (이미 certbot --deploy-hook로 처리됨)
# 단, 인증서 갱신 후 Agent에도 CA 변경이 없으면 별도 작업 불필요
```

---

## 7. 점검 체크리스트

### 7.1 일일 점검

매일 업무 시작 시 확인합니다.

**시스템 상태**

- [ ] Collection Server 프로세스 정상 동작 (`docker ps` 또는 `kubectl get pods`)
- [ ] Frontend 접속 가능 (`curl -I http://frontend:3000`)
- [ ] Prometheus 정상 동작 (`curl http://prometheus:9090/-/healthy`)
- [ ] Jaeger UI 접속 가능

**Agent 상태**

- [ ] 전체 Agent 연결 수 확인 (UI → Fleet → Overview)
- [ ] 연결 끊긴 Agent 있는지 확인 (연결 끊김 후 30분 미복구 시 조치)
- [ ] Agent 오류 로그 확인 (`level=error` 키워드 검색)

**데이터 수집 상태**

- [ ] 최근 1시간 메트릭 데이터 공백 없는지 확인
- [ ] 알림 발생 현황 검토 (UI → Alerts → Active)
- [ ] 스토리지 잔여 용량 확인 (경고 임계값 80%)

```bash
# 일일 점검 자동화 스크립트
#!/bin/bash
echo "=== AITOP 일일 점검 $(date) ==="

# Collection Server 상태
curl -sf http://localhost:8080/health > /dev/null \
  && echo "✓ Collection Server: OK" \
  || echo "✗ Collection Server: FAIL"

# Prometheus 상태
curl -sf http://localhost:9090/-/healthy > /dev/null \
  && echo "✓ Prometheus: OK" \
  || echo "✗ Prometheus: FAIL"

# 연결된 Agent 수
AGENTS=$(curl -sf http://localhost:8080/api/v1/agents/count \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.connected')
echo "✓ Connected Agents: $AGENTS"

# 디스크 사용률
df -h /data | awk 'NR==2{print "✓ Storage: " $5 " used (" $4 " free)"}'
```

### 7.2 주간 점검

매주 월요일 오전에 수행합니다.

**용량 및 성능**

- [ ] 스토리지 증가 추세 확인 (주간 증가량 계산)
- [ ] Prometheus 쿼리 응답 시간 확인 (P99 < 2초 권장)
- [ ] Collection Server 메모리 증가 여부 확인 (메모리 누수 탐지)
- [ ] 느린 API 엔드포인트 확인 (P99 > 500ms 항목)

**보안**

- [ ] 비정상 로그인 시도 확인 (UI → Settings → Audit Log)
- [ ] 원격 CLI 세션 기록 검토
- [ ] Agent 버전 현황 확인 (UI → Fleet → Versions)

**데이터 품질**

- [ ] 수집 실패 메트릭 확인 (`aitop_collector_errors_total`)
- [ ] 누락된 서비스 없는지 확인 (Topology 화면에서 검토)
- [ ] 알림 정책 정확도 검토 (오탐/미탐 비율)

### 7.3 월간 점검

매월 첫 번째 업무일에 수행합니다.

**설정 검토**

- [ ] 사용하지 않는 알림 정책 정리
- [ ] 비활성 사용자 계정 비활성화 또는 삭제
- [ ] 각 프로젝트 토큰 만료 여부 확인
- [ ] Collector 설정 최적화 검토 (미사용 Collector 비활성화)

**인증서 및 보안**

- [ ] 모든 TLS 인증서 만료일 확인 (60일 이내 갱신 준비)
- [ ] PostgreSQL 패스워드 정책 점검
- [ ] RBAC 권한 적정성 검토

**백업 검증**

- [ ] PostgreSQL 백업 파일 정상 여부 확인 (`pg_restore --list` 테스트)
- [ ] 복구 절차 문서 최신 유지 여부 확인
- [ ] 백업 저장 위치 용량 확인

**업그레이드 계획**

- [ ] 최신 AITOP 버전 릴리스 노트 검토
- [ ] 업그레이드 필요 여부 판단
- [ ] 업그레이드 일정 계획 수립

---

## 8. 장애 대응

### 8.1 장애 등급 분류

| 등급 | 정의 | 대응 시간 | 예시 |
|------|------|-----------|------|
| P1 (Critical) | 전체 서비스 중단 | 즉시 (15분 이내) | Collection Server 다운, Frontend 전체 불가 |
| P2 (High) | 주요 기능 장애 | 1시간 이내 | 특정 Collector 전체 실패, 알림 미발송 |
| P3 (Medium) | 일부 기능 저하 | 4시간 이내 | 특정 Agent 연결 끊김, 느린 쿼리 |
| P4 (Low) | 경미한 이슈 | 다음 업무일 | 로그 오류, UI 표시 오류 |

### 8.2 Collection Server 장애

**증상**: UI 접속 불가, Agent 연결 끊김 대량 발생

```bash
# 1. 장애 확인
docker ps -a | grep collection-server
# 또는
kubectl get pods -n aitop-monitoring -l app=collection-server

# 2. 로그 확인
docker logs collection-server --tail=100
# 또는
kubectl logs -n aitop-monitoring -l app=collection-server --tail=100

# 3. 재시작 (빠른 복구)
docker compose restart collection-server
# 또는
kubectl rollout restart deployment/collection-server -n aitop-monitoring

# 4. 재시작 후 상태 확인
watch -n 5 'docker compose ps collection-server'
# 또는
kubectl rollout status deployment/collection-server -n aitop-monitoring

# 5. 재시작으로 해결 안 될 경우: DB 연결 확인
docker exec collection-server \
  psql -h postgres -U aitop -d aitop -c "SELECT 1;"

# 6. OOM으로 죽은 경우: 메모리 제한 증가
# docker-compose.yaml에서 mem_limit 증가
```

**장애 동안 Agent 동작**:
- Agent는 로컬 SQLite 버퍼에 최대 500MB까지 데이터를 저장합니다.
- Collection Server 복구 후 자동으로 버퍼 데이터를 전송합니다.
- 버퍼 초과 시 오래된 메트릭부터 삭제됩니다.

### 8.3 Agent 장애

**단일 Agent 연결 끊김**:

```bash
# 대상 서버에서 Agent 상태 확인
sudo systemctl status aitop-agent
sudo journalctl -u aitop-agent -n 50 --no-hostname

# 재시작
sudo systemctl restart aitop-agent

# 재시작 후 연결 확인
aitop-agent status
```

**다수 Agent 동시 연결 끊김**:

```bash
# Collection Server 부하 확인 (다수 Agent → CS 부하 급증)
curl http://localhost:8080/metrics | grep grpc_server

# gRPC 연결 한도 확인 및 증가
# docker-compose.yaml:
# CS_MAX_CONCURRENT_CONNECTIONS=5000  (기본값 1000)

# 네트워크 장애 여부 확인 (라우팅 테이블)
traceroute collection-server

# CS 재시작 없이 연결 한도만 동적 변경
curl -X POST http://localhost:8080/admin/config \
  -d '{"max_connections": 5000}' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 8.4 Frontend 장애

```bash
# Next.js 프로세스 확인
pm2 status
pm2 logs aitop-frontend

# 재시작
pm2 restart aitop-frontend

# 빌드 오류 확인
cat ~/.pm2/logs/aitop-frontend-error.log | tail -50

# Collection Server API 연결 확인 (CORS, 인증 문제 포함)
curl http://localhost:8080/api/v1/health \
  -H "Origin: http://frontend-server:3000"
```

### 8.5 데이터베이스 장애

**PostgreSQL 연결 오류**:

```bash
# PostgreSQL 상태 확인
docker compose ps postgres
# 또는
pg_lsclusters  # 패키지 설치 환경

# 연결 수 확인 (max_connections 초과 여부)
psql -U aitop -d aitop -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='aitop';"

# 연결 수 증가 (postgresql.conf)
# max_connections = 200   # 기본값 100에서 증가

# 오래된 연결 강제 종료
psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname='aitop' AND state='idle'
   AND query_start < now() - interval '1 hour';"

# DB 재시작 (최후 수단)
docker compose restart postgres
```

### 8.6 스토리지 포화

**증상**: 쓰기 실패, Prometheus 적재 오류, Collection Server crash

```bash
# 즉각 조치: 오래된 데이터 삭제
# 1. 오래된 Evidence 삭제 (7일 이전)
find /data/evidence -type f -mtime +7 -delete

# 2. Prometheus 오래된 블록 삭제
curl -X POST http://localhost:9090/api/v1/admin/tsdb/clean_tombstones

# 3. Jaeger 오래된 트레이스 삭제 (Badger 수동 압축)
docker exec jaeger jaeger-query --badger.maintenance.interval=1m &

# 4. 로그 파일 정리
find /var/log/aitop-* -name "*.log.*" -mtime +7 -delete

# 근본 해결: 스토리지 확장 또는 보관 기간 단축
# Prometheus 보관 기간 단축: PROMETHEUS_RETENTION=15d
```

---

## 9. 업그레이드 절차

### 9.1 업그레이드 전 확인사항

```bash
# 1. 현재 버전 확인
docker exec collection-server ./collection-server --version
aitop-agent --version

# 2. 릴리스 노트 검토 (Breaking Changes 확인)
# https://releases.aitop.io/changelog

# 3. 백업 수행 (5장 절차)
/usr/local/bin/aitop-backup.sh

# 4. 업그레이드 대상 환경 점검
docker compose ps
kubectl get pods -n aitop-monitoring

# 5. 유지보수 알림 발송 (사용자 사전 공지)
```

### 9.2 Collection Server 업그레이드

**Docker Compose 환경**:

```bash
# 1. 새 이미지 Pull
docker compose pull collection-server frontend

# 2. 롤링 업그레이드 (무중단)
docker compose up -d --no-deps --build collection-server

# 3. DB 마이그레이션 (자동 실행, 로그 확인)
docker logs collection-server | grep -i migration

# 4. Health check
curl http://localhost:8080/health

# 5. Frontend 업그레이드
docker compose up -d --no-deps --build frontend
```

**Kubernetes 환경**:

```bash
# Helm 값 파일 업데이트
vi helm/aiservice-monitoring/values.yaml
# image.tag: "1.1.0"  # 새 버전으로 변경

# 롤링 업그레이드 (무중단)
helm upgrade aitop ./helm/aiservice-monitoring \
  --namespace aitop-monitoring \
  --atomic \
  --timeout 10m

# 업그레이드 상태 확인
kubectl rollout status deployment/collection-server -n aitop-monitoring
kubectl rollout status deployment/frontend -n aitop-monitoring
```

### 9.3 Agent 일괄 업그레이드 (OTA)

UI의 Fleet 기능을 사용하여 Agent를 무중단 일괄 업그레이드합니다.

1. **UI → Fleet → OTA 업데이트** 접속
2. 업그레이드 대상 그룹 선택 (전체 또는 특정 서버 그룹)
3. 새 버전 선택 및 롤아웃 전략 설정:
   - Canary: 5% → 25% → 50% → 100% 순차 배포
   - Blue/Green: 일괄 전환
   - Manual: 개별 승인 후 배포
4. 배포 시작 후 Health Check 자동 실행
5. 오류 발생 시 자동 롤백 (Canary 전략)

```bash
# CLI로 OTA 업그레이드 시작
aitop-admin fleet upgrade \
  --version 1.1.0 \
  --group production \
  --strategy canary \
  --canary-steps "5,25,50,100" \
  --health-check-interval 60s
```

### 9.4 롤백 절차

```bash
# Collection Server 롤백 (Docker)
docker compose stop collection-server
docker compose pull collection-server  # 이전 버전 태그로 변경 후
# .env에서 IMAGE_TAG=1.0.0으로 변경
docker compose up -d collection-server

# Collection Server 롤백 (Kubernetes)
kubectl rollout undo deployment/collection-server -n aitop-monitoring

# Agent 롤백 (개별)
aitop-agent downgrade --version 1.0.0

# Agent 롤백 (Fleet 전체)
aitop-admin fleet rollback --group production
```

---

## 10. 성능 튜닝

### 10.1 샘플링 비율 조정

대규모 트래픽 환경에서는 트레이스 샘플링 비율을 낮춰 비용을 절감합니다.

```yaml
# collector/config/otelcol-gateway.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    expected_new_traces_per_sec: 1000
    policies:
      # 오류 트레이스는 100% 보관
      - name: errors-policy
        type: status_code
        status_code: {status_codes: [ERROR]}
      # 느린 요청 보관 (200ms 이상)
      - name: slow-traces-policy
        type: latency
        latency: {threshold_ms: 200}
      # 나머지는 10% 샘플링
      - name: sample-policy
        type: probabilistic
        probabilistic: {sampling_percentage: 10}
```

### 10.2 메트릭 수집 주기 조정

```yaml
# agent.yaml - 고해상도 수집 (고부하 환경 주의)
schedule:
  metrics: "*/30 * * * * *"    # 30초마다 (기본 60초)

# 저부하 수집 (비용 절감)
schedule:
  metrics: "*/120 * * * * *"   # 2분마다
```

### 10.3 OTel Collector 튜닝

```yaml
# otelcol-gateway.yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 4000            # 4GB 제한
    spike_limit_mib: 1000

  batch:
    timeout: 5s
    send_batch_size: 1000      # 기본값
    send_batch_max_size: 2000  # 최대 배치 크기

exporters:
  prometheusremotewrite:
    endpoint: "http://prometheus:9090/api/v1/write"
    timeout: 30s
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s
```

---

## 11. 보안 운영

### 11.1 계정 및 권한 관리

```
AITOP RBAC 역할:
  admin   - 모든 기능, 설정 변경, 사용자 관리
  sre     - 읽기 + 원격 CLI + 알림 관리
  dev     - 읽기 + 트레이스/로그 조회
  viewer  - 읽기 전용 (대시보드, 메트릭 조회)
```

```bash
# 사용자 비활성화 (퇴직자 처리)
curl -X PATCH http://localhost:8080/api/v1/users/user-id \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'

# 전체 사용자 목록 조회
curl http://localhost:8080/api/v1/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[] | {id, email, role, last_login}'

# 90일 이상 미접속 사용자 목록
curl "http://localhost:8080/api/v1/users?inactive_days=90" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 11.2 PII 마스킹 설정

LLM 프롬프트에 개인정보가 포함될 수 있으므로, 수집 데이터에서 PII를 마스킹합니다.

```yaml
# agent.yaml에 sanitizer 설정 추가
sanitizer:
  enabled: true
  rules:
    - type: "email"
      replacement: "[EMAIL]"
    - type: "phone"
      replacement: "[PHONE]"
    - type: "credit_card"
      replacement: "[CC]"
    - type: "regex"
      pattern: "Bearer [A-Za-z0-9._-]+"
      replacement: "Bearer [TOKEN]"
    - type: "regex"
      pattern: "password[=:][^&\\s]+"
      replacement: "password=[REDACTED]"
```

### 11.3 원격 CLI 감사

모든 원격 CLI 세션은 감사 로그에 기록됩니다.

```bash
# 감사 로그 형식
cat /var/log/aitop-agent/terminal-audit.log | jq '.' | head -20
# {
#   "timestamp": "2026-03-26T10:30:00Z",
#   "user": "sre-engineer@company.com",
#   "session_id": "sess-abcdef",
#   "agent_id": "agt-prod-web-01",
#   "command": "df -h",
#   "output_size": 256
# }

# 특정 사용자 명령 이력
grep '"user":"sre-engineer@company.com"' \
  /var/log/aitop-agent/terminal-audit.log | jq '.command'

# 위험 명령 실행 이력 조회
grep -E '"command":"(sudo|rm|chmod|passwd|iptables)"' \
  /var/log/aitop-agent/terminal-audit.log
```

---

## 12. v1.3 AI 운영

> v1.3에서 LLM 트레이싱, 토큰 비용 분석, AI 진단, GenAI 보안 이벤트 기능이 추가되었습니다.
> 이 섹션에서는 운영자가 AI 관련 기능을 모니터링하고 관리하는 방법을 설명합니다.

### 12.1 LLM 비용 모니터링

LLM API 호출에 따른 토큰 비용을 실시간으로 추적합니다.

**API 엔드포인트**: `GET /ai/costs`

**주요 확인 항목**:
- 모델별 일간/주간/월간 비용 추이
- 서비스별 토큰 소비량 상위 순위
- 비용 급증(spike) 알림 설정

**운영 절차**:
```bash
# 현재 비용 현황 조회
curl -s http://localhost:8080/ai/costs | jq '.'

# 모델별 비용 조회 (기간 지정)
curl -s "http://localhost:8080/ai/costs?from=2026-03-01&to=2026-03-28&group_by=model" | jq '.'

# 서비스별 비용 조회
curl -s "http://localhost:8080/ai/costs?group_by=service" | jq '.'
```

**비용 알림 설정**:
- 일일 비용이 임계값을 초과하면 알림 발송
- 설정 → 알림 정책에서 `token_cost_daily > $100` 등의 조건 설정 가능

### 12.2 AI 진단 ITEM 확인

AI 서비스의 건전성을 자동으로 진단하는 항목(ITEM)들을 관리합니다.

**API 엔드포인트**: `GET /ai/diagnostics`

**진단 항목 목록 조회**:
```bash
# 전체 진단 결과 조회
curl -s http://localhost:8080/ai/diagnostics | jq '.'

# 특정 심각도 필터링
curl -s "http://localhost:8080/ai/diagnostics?severity=critical" | jq '.'
```

**주요 진단 ITEM**:
| ITEM ID | 설명 | 점검 주기 |
|---------|------|----------|
| `llm_error_rate_high` | LLM 에러율 임계치 초과 | 1분 |
| `token_cost_spike` | 토큰 비용 급증 감지 | 5분 |
| `rag_retrieval_latency` | RAG 검색 지연 P99 초과 | 1분 |
| `model_drift_detected` | 모델 응답 품질 하락 | 1시간 |
| `guardrail_block_rate` | 가드레일 차단율 초과 | 5분 |
| `embedding_throughput_low` | 임베딩 처리량 저하 | 5분 |

**운영 대응**:
1. Critical 항목은 즉시 대응 — 알림 채널로 자동 발송
2. Warning 항목은 일일 점검 시 확인
3. 각 진단 항목의 근거 데이터(evidence)를 확인하여 원인 분석

### 12.3 보안 이벤트 확인

GenAI 관련 보안 이벤트(프롬프트 인젝션 시도, PII 유출 감지 등)를 모니터링합니다.

**API 엔드포인트**: `GET /genai/security-events`

**보안 이벤트 조회**:
```bash
# 전체 보안 이벤트 조회
curl -s http://localhost:8080/genai/security-events | jq '.'

# 최근 24시간 이벤트
curl -s "http://localhost:8080/genai/security-events?from=24h" | jq '.'

# 심각도별 필터링
curl -s "http://localhost:8080/genai/security-events?severity=high" | jq '.'
```

**보안 이벤트 유형**:
| 이벤트 유형 | 설명 | 심각도 |
|------------|------|--------|
| `prompt_injection` | 프롬프트 인젝션 시도 감지 | High |
| `pii_leakage` | 응답에 PII 포함 감지 | High |
| `sensitive_topic` | 민감 주제 질의 감지 | Medium |
| `jailbreak_attempt` | 탈옥 시도 감지 | High |
| `data_exfiltration` | 데이터 유출 패턴 감지 | Critical |

**운영 절차**:
1. 일일 점검 시 보안 이벤트 대시보드 확인
2. High/Critical 이벤트는 즉시 해당 서비스 담당자에게 통보
3. 반복되는 패턴은 가드레일 규칙에 추가하여 자동 차단
