# AITOP Agent

AITOP 에이전트 — 대상 서버에 설치되어 IT/AI 시스템 데이터를 자동 수집하는 경량 Go 바이너리.

## 설계 문서

- [AGENT_DESIGN.md](../DOCS/AGENT_DESIGN.md) — 상세 설계서

## 프로젝트 구조

```
agent/
├── cmd/aitop-agent/        # 메인 엔트리포인트
├── internal/
│   ├── core/               # Collector Registry, 오케스트레이션
│   ├── config/             # YAML 설정 로더
│   ├── collector/
│   │   ├── os/             # OS Collector (CPU, Memory, Disk, Network)
│   │   ├── web/            # WEB Collector (Nginx, Apache)
│   │   ├── was/            # WAS Collector (Tomcat, Spring Boot)
│   │   ├── db/             # DB Collector (PostgreSQL, MySQL, Oracle)
│   │   └── ai/
│   │       ├── gpu/        # GPU Collector (nvidia-smi)
│   │       ├── llm/        # LLM/Agent Collector
│   │       ├── vectordb/   # VectorDB Collector
│   │       └── otel/       # OTel Metrics Collector
│   ├── privilege/          # 권한 사전 검증
│   ├── sanitizer/          # API Key / PII 마스킹
│   ├── health/             # 에이전트 자체 헬스 모니터
│   ├── transport/          # gRPC / HTTPS 전송
│   ├── buffer/             # SQLite 오프라인 버퍼
│   ├── shell/              # 원격 CLI (PTY)
│   ├── scheduler/          # Cron 스케줄러
│   └── updater/            # OTA 업데이트
├── pkg/
│   ├── models/             # 공유 데이터 모델 (Collector, Agent, Heartbeat)
│   └── version/            # 빌드 버전 정보
├── proto/                  # gRPC Proto 파일
├── configs/                # 설정 파일 템플릿
├── scripts/                # 설치/배포 스크립트
├── test/                   # 통합 테스트
├── Makefile
└── go.mod
```

## 빌드

```bash
# 현재 플랫폼
make build

# Linux amd64
make build-linux

# 전체 플랫폼
make build-all
```

## 실행

```bash
# Full 모드 (상주 에이전트)
./bin/aitop-agent --config=configs/agent.yaml

# One-shot 수집 모드
./bin/aitop-agent --config=configs/agent.yaml --mode=collect-only

# 버전 확인
./bin/aitop-agent --version
```

## 동작 모드

| 모드 | 설명 |
|------|------|
| `full` | 상주 에이전트 — 스케줄 수집, Heartbeat, 원격 CLI |
| `collect-only` | 1회 수집 → 서버 전송 → 종료 |
| `collect-export` | 1회 수집 → 로컬 ZIP → 종료 |
