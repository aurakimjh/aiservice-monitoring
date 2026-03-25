# Java Agent → Go Agent 마이그레이션 가이드

> **Phase 31-4b**
> **작성일**: 2026-03-26
> **작성자**: Aura Kim (Architect)
> **관련 문서**: [ADR-001_AGENT_UNIFICATION.md](./ADR-001_AGENT_UNIFICATION.md) | [JAVA_AGENT_EOL_TIMELINE.md](./JAVA_AGENT_EOL_TIMELINE.md)

---

## 개요

AITOP은 기존 Java Agent(aitop-onsite)를 Go Agent(aitop-agent)로 일원화합니다.
이 문서는 기존 Java Agent 사용자가 Go Agent로 전환하는 절차를 단계별로 안내합니다.

### 전환 이유

| 항목 | Java Agent (구) | Go Agent (신) |
|------|:--------------:|:-------------:|
| 설치 크기 | ~470 MB (바이너리+JRE) | ~25 MB (단일 바이너리) |
| 상주 메모리 | ~250 MB | ~50 MB |
| JRE 필요 | ✅ Java 17+ 필수 | ❌ 불필요 |
| 설치 시간 | ~15분 | < 5분 |
| 진단 항목 커버리지 | 86개 (IT 55 + AI 31) | 86개 (동일) |
| 실시간 모니터링 | ❌ 별도 Monitoring Agent 필요 | ✅ `--mode=full` 통합 제공 |
| OTA 업데이트 | Java Agent + Monitoring Agent 2회 | 1회 |

---

## 사전 요구사항

- aitop-agent 바이너리 `v2.0.0+` 수신 완료
- `agent.yaml` 설정 파일 준비 (§3 참조)
- AITOP 프로젝트 토큰 (기존 Java Agent 사용 중인 토큰 재사용 가능)
- OS: Linux (x86_64 / ARM64) · Windows Server 2019+ · macOS 12+

---

## 단계별 마이그레이션 절차

### Step 1 — 기존 Java Agent 수집 정책 확인

```bash
# 현재 Java Agent 설정 파일 위치 확인
find /opt/aitop-onsite -name "*.yaml" -o -name "*.properties" 2>/dev/null
```

Java Agent 설정 파일(`config.yaml` 또는 `aitop.properties`)에서 다음 항목을 메모합니다.

| Java Agent 설정 키 | 의미 |
|--------------------|------|
| `server.endpoint` | Collection Server URL |
| `project.token` | 프로젝트 인증 토큰 |
| `diagnose.schedule` | 진단 스케줄 (cron 형식) |
| `collect.targets` | 수집 대상 (DB, WAS, WEB 등) |

---

### Step 2 — Go Agent 설치

```bash
# Linux
curl -sSL https://dist.aitop.io/agent/install.sh | bash -s -- --version 2.0.0

# Windows PowerShell
iex (irm https://dist.aitop.io/agent/install.ps1)

# 설치 확인
aitop-agent --version
```

---

### Step 3 — `agent.yaml` 작성

Go Agent는 단일 YAML 파일로 설정합니다. Java Agent 설정 값을 아래에 매핑하여 작성합니다.

```yaml
# /etc/aitop/agent.yaml

# [필수] 인증
project_token: "YOUR_PROJECT_TOKEN"   # Java Agent의 project.token

# [필수] Collection Server
endpoint: "https://collect.aitop.io"  # Java Agent의 server.endpoint

# [필수] 실행 모드
# - monitor   : 24/7 실시간 모니터링만
# - diagnose  : 온디맨드 진단만 (Java Agent 동등)
# - full      : 모니터링 + 진단 (권장)
mode: full

# [선택] 진단 스케줄 (Java Agent의 diagnose.schedule)
diagnose:
  schedule: "0 2 * * *"   # 매일 새벽 2시

# [선택] 수집 대상 — Java Agent의 collect.targets 매핑
collectors:
  os:
    enabled: true
  web:
    enabled: true
    nginx:
      config_path: /etc/nginx/nginx.conf   # 자동 탐지 시 생략 가능
  was:
    enabled: true
    tomcat:
      jmx_port: 8686
  db:
    enabled: true
    postgresql:
      host: localhost
      port: 5432
      user: monitor          # 읽기 전용 모니터링 계정
      password: ""           # 또는 환경변수 AITOP_DB_PASS

# [선택] GPU 수집 (AI 서버 전용)
gpu:
  enabled: false
```

> **보안 팁**: `password` 대신 환경변수 `AITOP_DB_PASS`를 사용하세요.

---

### Step 4 — Java Agent 설정 → Go Agent YAML 매핑 참조표

| Java Agent 설정 | Go Agent YAML 경로 | 비고 |
|----------------|-------------------|------|
| `server.endpoint` | `endpoint` | 동일 값 사용 |
| `project.token` | `project_token` | 동일 값 사용 |
| `diagnose.schedule` | `diagnose.schedule` | cron 형식 동일 |
| `collect.os=true` | `collectors.os.enabled: true` | |
| `collect.web=nginx` | `collectors.web.nginx.config_path` | 자동 탐지 가능 |
| `collect.was=tomcat` | `collectors.was.tomcat.jmx_port` | |
| `collect.db=postgresql` | `collectors.db.postgresql.*` | |
| `collect.db=mysql` | `collectors.db.mysql.*` | |
| `collect.db=oracle` | `collectors.db.oracle.*` | |
| `collect.db=mssql` | `collectors.db.mssql.*` | |
| `log.level` | `log.level` | debug/info/warn/error |
| `proxy.host` | `http_proxy` | 환경변수 또는 YAML |

---

### Step 5 — Go Agent 기동 확인

```bash
# 설정 파일 유효성 검사
aitop-agent check --config /etc/aitop/agent.yaml

# 포그라운드 실행 (테스트용)
aitop-agent start --config /etc/aitop/agent.yaml --log-level debug

# systemd 서비스 등록 (Linux)
aitop-agent install --config /etc/aitop/agent.yaml
systemctl start aitop-agent
systemctl status aitop-agent
```

**정상 기동 로그 확인 포인트**:

```
INFO  agent started            mode=full version=2.0.0
INFO  collector registered     id=os-collector
INFO  collector registered     id=web-collector
INFO  collector registered     id=db-collector
INFO  heartbeat sent           endpoint=https://collect.aitop.io
```

---

### Step 6 — 기능 동등성 현장 검증

```bash
# 즉시 진단 수집 실행 (Java Agent의 수동 진단 트리거 대응)
aitop-agent diagnose --config /etc/aitop/agent.yaml --output /tmp/diag.zip

# 수집 결과 항목 수 확인
unzip -l /tmp/diag.zip | grep "evidence-" | wc -l
```

예상 결과: **31개 이상** 항목 파일 확인

| 검증 항목 | 확인 방법 | 기대값 |
|----------|----------|-------|
| OS 메트릭 수집 | Collection Server 대시보드 확인 | CPU/MEM/Disk 지표 유입 |
| WEB 설정 수집 | `/tmp/diag.zip` 내 `evidence-config-web-*.json` | nginx.conf 파싱 결과 포함 |
| DB 상태 수집 | `/tmp/diag.zip` 내 `evidence-builtin-items-db-*.json` | 연결 수, 슬로우 쿼리 포함 |
| 진단 업로드 | Collection Server 로그 확인 | `POST /api/v1/evidence/upload 200` |
| EOS 체크 | `/tmp/diag.zip` 내 `evidence-eos-*.json` | 버전별 EOL 날짜 포함 |

---

### Step 7 — Java Agent 서비스 중지

검증 완료 후 Java Agent를 안전하게 중지합니다.

```bash
# Linux systemd
systemctl stop aitop-onsite
systemctl disable aitop-onsite

# 또는 직접 프로세스 종료
kill $(pgrep -f aitop-onsite)

# Java Agent 제거 (선택)
/opt/aitop-onsite/uninstall.sh
```

> **주의**: 병행 운영 기간(3개월) 동안은 Java Agent를 완전 제거하지 말고 **서비스만 중지**하는 것을 권장합니다. 문제 발생 시 즉시 Java Agent로 복귀할 수 있습니다.

---

## 롤백 절차

Go Agent에 문제가 발생할 경우 Java Agent로 즉시 복귀합니다.

```bash
# Go Agent 중지
systemctl stop aitop-agent

# Java Agent 재기동
systemctl start aitop-onsite
```

---

## 자주 묻는 질문

### Q1. 프로젝트 토큰을 새로 발급해야 하나요?
아니요. 기존 Java Agent에서 사용하던 토큰을 그대로 사용할 수 있습니다.

### Q2. Java Agent와 Go Agent를 동시에 실행해도 되나요?
병행 운영 기간 중에는 가능하지만 **동일 서버에 두 에이전트를 동시에 상시 실행하면 수집 데이터가 중복**됩니다. 검증 목적의 짧은 병행 실행은 무방합니다.

### Q3. DB 비밀번호를 YAML에 평문으로 저장해야 하나요?
환경변수를 권장합니다.
```bash
export AITOP_DB_PASS="your_password"
```
YAML에서는 `password: ""` (빈 문자열)로 남겨두면 환경변수를 우선 참조합니다.

### Q4. AIX/HP-UX 환경도 지원하나요?
Go Agent는 AIX/HP-UX에서 임베디드 스크립트 래핑 방식으로 동작합니다. 기술지원팀에 문의하세요.

### Q5. 진단 스케줄이 Java Agent와 다르게 동작하면 어떻게 하나요?
`diagnose.schedule` cron 표현식은 Java Agent와 동일한 형식(5-field cron)을 사용합니다. 타임존은 서버 로컬 타임존을 따릅니다.

---

## 지원 채널

| 채널 | 용도 |
|------|------|
| AITOP 고객 포털 | 마이그레이션 지원 티켓 |
| Slack `#aitop-migration` | 실시간 기술 지원 (병행 운영 기간) |
| `migration@aitop.io` | 이메일 문의 |

---

> 이 가이드는 병행 운영 기간(3개월) 동안 지속적으로 업데이트됩니다.
> 최신 버전: [AITOP 고객 포털 > 문서 > 마이그레이션 가이드]
