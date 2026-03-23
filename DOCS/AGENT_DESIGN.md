# AITOP Agent 상세 설계서

> **문서 버전**: v1.3.1
> **작성일**: 2026-03-21 | **최종 업데이트**: 2026-03-23 (Session 33 — 수집 서버 저장 계층 설계 추가: StorageBackend 인터페이스, S3/Local/Dual 구현체, 설정 스키마)
> **구현 상태**: Phase 15 (Agent MVP) ✅ 완료 | Phase 16 (Agent GA) ✅ 완료
> **관련 문서**:
> - [UI_DESIGN.md](./UI_DESIGN.md) — 통합 모니터링 대시보드 UI 설계 (26개 화면)
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — OTel + Agent 통합 아키텍처
> - [METRICS_DESIGN.md](./METRICS_DESIGN.md) — 레이어별 지표 정의 및 수식
> - [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md) — 솔루션 방향성, 경쟁 분석

---

## 목차

1. [설계 개요](#1-설계-개요)
2. [에이전트 아키텍처](#2-에이전트-아키텍처)
3. [Collector 체계 — 데이터 수집 설계](#3-collector-체계--데이터-수집-설계)
4. [권한 관리 및 실행 결과 응답](#4-권한-관리-및-실행-결과-응답)
5. [중앙 에이전트 관리 (Fleet Management)](#5-중앙-에이전트-관리-fleet-management)
   - 5.5 [SDK / 에이전트 자동 인식](#55-sdk--에이전트-자동-인식)
   - 5.6 [중앙 설정 관리 — UI에서 agent.yaml 원격 편집](#56-중앙-설정-관리--ui에서-agentyaml-원격-편집)
   - 5.7 [설정 반영 수준 체계](#57-설정-반영-수준-체계)
   - 5.8 [원격 재기동](#58-원격-재기동)
6. [원격 CLI / 터미널 구현](#6-원격-cli--터미널-구현)
7. [수집 데이터 저장 전략](#7-수집-데이터-저장-전략)
   - 7.6 [StorageBackend 인터페이스 설계](#76-storagebackend-인터페이스-설계)
8. [UI 화면 연동 — 에이전트 수집 데이터 기반 동작](#8-ui-화면-연동--에이전트-수집-데이터-기반-동작)
9. [통신 프로토콜 및 보안](#9-통신-프로토콜-및-보안)
10. [배포 및 설치](#10-배포-및-설치)
11. [API 명세](#11-api-명세)
12. [구현 로드맵](#12-구현-로드맵)

---

## 1. 설계 개요

### 1.1 목적

AITOP Agent는 대상 서버에 설치되어 IT 인프라(OS/WEB/WAS/DB) 및 AI 시스템(LLM/RAG/GPU/VectorDB) 데이터를 자동 수집하고, 중앙 서버로 전송하는 경량 에이전트다. 동시에 중앙에서 에이전트를 관리·제어·모니터링할 수 있어야 하며, UI에서 원격 CLI 접근이 가능해야 한다.

### 1.2 핵심 요구사항

| # | 요구사항 | 상세 | 우선순위 |
|---|---------|------|---------|
| R1 | Collector 기반 데이터 수집 | 플러그인별 Collector가 OS/MW/DB/AI 데이터를 수집 | P0 |
| R2 | 권한 부족 시 명확한 응답 | root 등 필요 권한 없을 때 "권한 없음" 사유 포함 응답 반환 | P0 |
| R3 | 중앙 에이전트 관리 | Fleet 대시보드에서 에이전트 등록/상태/업데이트/제어 | P0 |
| R4 | 원격 CLI (터미널) | UI 화면에서 에이전트 서버의 명령창(SSH-like) 구현 | P1 |
| R5 | 수집 데이터 저장 전략 | 시계열/스냅샷/Evidence별 최적 저장소 설계 | P0 |
| R6 | UI 연동 데이터 흐름 | UI_DESIGN.md의 모든 뷰가 에이전트 수집 데이터로 동작 | P0 |

### 1.3 설계 원칙

1. **Collector 중심**: 모든 데이터 수집은 Collector 인터페이스를 통해 표준화
2. **Fail-Safe 응답**: 수집 실패 시 원인(권한/타임아웃/미설치)을 구조화된 JSON으로 반환
3. **경량성**: 메모리 50MB 이하, idle 시 CPU 1% 미만
4. **플러그인 확장**: IT/AI 플러그인 독립 배포·업데이트
5. **보안 우선**: mTLS, 최소 권한, 원격 CLI는 RBAC 기반 접근 제어

---

## 2. 에이전트 아키텍처

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AITOP Agent (Go Binary)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      Agent Core                                   │ │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐│ │
│  │  │Scheduler │ │Config Manager│ │Health Monitor│ │Privilege   ││ │
│  │  │(cron)    │ │(local+remote)│ │(self-check)  │ │Checker     ││ │
│  │  └──────────┘ └──────────────┘ └──────────────┘ └────────────┘│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                   Collector Runtime                                │ │
│  │  ┌─────────────────────────────────────────────────────────────┐│ │
│  │  │ IT Collectors                                                ││ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      ││ │
│  │  │  │OS        │ │WEB       │ │WAS       │ │DB        │      ││ │
│  │  │  │Collector │ │Collector │ │Collector │ │Collector │      ││ │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      ││ │
│  │  └─────────────────────────────────────────────────────────────┘│ │
│  │  ┌─────────────────────────────────────────────────────────────┐│ │
│  │  │ AI Collectors (선택적 활성화)                                  ││ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      ││ │
│  │  │  │LLM/Agent │ │VectorDB/ │ │GPU/Model │ │OTel      │      ││ │
│  │  │  │Collector │ │Embedding │ │Serving   │ │Metrics   │      ││ │
│  │  │  │          │ │Collector │ │Collector │ │Collector │      ││ │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      ││ │
│  │  └─────────────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                  Remote Shell Service                              │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │ │
│  │  │PTY Allocator │ │Session Manager│ │RBAC Filter   │             │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                  Transport Layer                                   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │ │
│  │  │gRPC Client   │ │HTTPS Fallback│ │WebSocket     │             │ │
│  │  │(데이터 전송)  │ │(방화벽 우회)  │ │(원격 터미널)  │             │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Local Buffer (SQLite) — 오프라인 시 데이터 로컬 저장              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Sanitizer — API Key/PII 마스킹, 민감정보 1차 필터링              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Agent Core 상세

| 컴포넌트 | 역할 | 상세 |
|---------|------|------|
| **Scheduler** | 수집 스케줄 관리 | cron 표현식 기반, 원격 오버라이드 가능 |
| **Config Manager** | 설정 관리 | 로컬 YAML + 중앙 서버 원격 설정 병합 |
| **Health Monitor** | 자기 진단 | CPU/메모리 사용량, Collector 상태, 연결 상태 |
| **Privilege Checker** | 권한 사전 검증 | 각 Collector 실행 전 필요 권한 확인 |

### 2.3 동작 모드

```
에이전트 동작 모드 (--mode 옵션):

┌──────────────────────────────────────────────────────────────────┐
│  --mode=full (기본)                                                │
│    상주 Agent → 스케줄 기반 수집 → gRPC 스트리밍 → 중앙 서버       │
│    OTA 업데이트, 원격 CLI, Fleet 관리 전체 지원                     │
│                                                                    │
│  --mode=collect-only (원격 수집 전용)                                │
│    1회 실행 → JSON 수집 → HTTPS 전송 → 종료                        │
│    최소 권한, 프로젝트 토큰 인증, 전송 후 로컬 파일 삭제             │
│                                                                    │
│  --mode=collect-export (오프라인 내보내기)                            │
│    1회 실행 → JSON 수집 → 로컬 ZIP 생성 → 종료                     │
│    네트워크 불가 시, ZIP 수동 업로드 경로로 전달                     │
└──────────────────────────────────────────────────────────────────┘
```

### 2.4 기술 스택

| 구성요소 | 기술 | 선정 사유 |
|---------|------|---------|
| Agent Core | **Go 1.22+** | 크로스 컴파일, 단일 바이너리, 경량, 고성능 동시성 |
| Transport | **gRPC** (양방향 스트리밍) + HTTPS fallback | 대용량 데이터 + 방화벽 친화 |
| Local Buffer | **SQLite** (CGo-free: modernc.org/sqlite) | 외부 의존 없는 오프라인 버퍼링 |
| Config | **YAML** (로컬) + gRPC (원격) | 사람 편집 가능 + 서버 동적 오버라이드 |
| Remote Shell | **WebSocket** + PTY (creack/pty) | 브라우저 ↔ 에이전트 양방향 터미널 |
| Sanitizer | **regexp** 기반 패턴 매칭 | API key, PII 1차 마스킹 |
| AI 수집 보조 | **Python subprocess** 호출 | nvidia-smi, pip list, 라이브러리 감지 |
| Packaging | RPM/DEB/MSI + 단일 바이너리 | 플랫폼별 설치 편의성 |

---

## 3. Collector 체계 — 데이터 수집 설계

### 3.1 Collector 인터페이스

모든 수집은 통일된 `Collector` 인터페이스를 구현한다:

```go
// Collector 공통 인터페이스
type Collector interface {
    // 플러그인 메타정보
    ID() string                      // "os", "web", "was", "db", "ai-llm", "ai-gpu", ...
    Version() string                 // "1.2.0"
    SupportedPlatforms() []string    // ["linux", "windows"]

    // 필요 권한 선언
    RequiredPrivileges() []Privilege // [root, read:/proc, exec:nvidia-smi, ...]

    // 환경 자동 탐지 — 이 Collector가 활성화되어야 하는지
    AutoDetect(ctx context.Context) (DetectResult, error)

    // 데이터 수집 실행
    Collect(ctx context.Context, cfg CollectConfig) (*CollectResult, error)

    // 출력 스키마 선언
    OutputSchemas() []string         // ["os.cpu_metrics.v1", "ai.gpu_metrics.v1", ...]
}

// 수집 결과 — 성공/실패 모두 구조화
type CollectResult struct {
    CollectorID   string              `json:"collector_id"`
    Timestamp     time.Time           `json:"timestamp"`
    Status        CollectStatus       `json:"status"`         // SUCCESS, PARTIAL, FAILED
    Items         []CollectedItem     `json:"items"`          // 수집된 데이터
    Errors        []CollectError      `json:"errors"`         // 수집 중 발생한 오류
    Duration      time.Duration       `json:"duration"`
    Metadata      map[string]string   `json:"metadata"`
}

// 수집 오류 — 권한 부족 등 원인을 명확히 포함
type CollectError struct {
    Code       ErrorCode   `json:"code"`        // PERMISSION_DENIED, TIMEOUT, NOT_INSTALLED, ...
    Message    string      `json:"message"`     // 사람이 읽을 수 있는 메시지
    Command    string      `json:"command"`     // 실행하려던 명령
    Required   string      `json:"required"`    // 필요한 권한/조건
    Current    string      `json:"current"`     // 현재 상태
    Suggestion string      `json:"suggestion"`  // 해결 방법 제안
}
```

### 3.2 IT Collectors

#### OS Collector

```
역할: OS 레벨 메트릭 수집 (CPU, Memory, Disk, Network, Process)
UI 연동: 호스트 목록, 호스트 상세 > 개요 탭, 인프라 뷰
대상 ITEM: ITEM0036~ITEM0040 (메모리/OOME), ITEM0064 (디스크), ITEM0066 (프로세스)

수집 항목:
  ┌──────────────────────────────────────────────────────────────┐
  │ 메트릭           │ 소스 (Linux)          │ 소스 (Windows)      │
  ├──────────────────────────────────────────────────────────────┤
  │ CPU 사용률/코어별 │ /proc/stat, mpstat    │ WMI/PDH             │
  │ 메모리 사용       │ /proc/meminfo         │ WMI/GlobalMemoryStatus│
  │ 디스크 사용/IOPS  │ /proc/diskstats, df   │ WMI/LogicalDisk      │
  │ 네트워크 I/O      │ /proc/net/dev         │ WMI/NetworkAdapter   │
  │ 프로세스 목록     │ /proc/[pid]/stat      │ WMI/Win32_Process    │
  │ 시스템 정보       │ uname, /etc/os-release│ WMI/Win32_OS         │
  │ 오픈 파일/소켓    │ /proc/sys/fs, ss      │ netstat              │
  │ SELinux/방화벽    │ sestatus, iptables    │ Get-NetFirewallRule  │
  └──────────────────────────────────────────────────────────────┘

필요 권한:
  - 기본: read:/proc, read:/sys
  - 확장: root (iptables, 일부 /proc 파일)

출력 스키마: os.cpu_metrics.v1, os.memory_metrics.v1, os.disk_metrics.v1,
            os.network_metrics.v1, os.process_list.v1, os.system_info.v1
```

#### WEB Collector (Nginx, Apache, IIS)

```
역할: 웹 서버 설정·상태·성능 수집
UI 연동: 호스트 상세 > 미들웨어 상태, 서비스 맵
대상 ITEM: ITEM0006~ITEM0009 (웹 서버 설정/성능)

수집 항목:
  - 서버 버전, 설정 파일 (nginx.conf, httpd.conf)
  - Worker/Thread 설정, Connection Pool
  - Access/Error 로그 최근 N건
  - 상태 페이지 (/nginx_status, /server-status)
  - SSL 인증서 만료일
  - 가상 호스트 목록

필요 권한:
  - read: 설정 파일 경로 (/etc/nginx, /etc/httpd)
  - exec: nginx -T, apachectl -S
  - 권한 없을 시: "설정 파일 접근 불가 — nginx 설정 디렉토리 read 권한 필요" 응답
```

#### WAS Collector (Tomcat, JBoss, Spring Boot, WebLogic)

```
역할: WAS 설정·JVM 메트릭·성능 수집
UI 연동: 호스트 상세 > 미들웨어 상태, 서비스 맵
대상 ITEM: ITEM0010~ITEM0035 (WAS 설정/성능)

수집 항목:
  - JVM 설정 (Heap, GC, Thread)
  - 커넥션풀 설정/상태
  - 배포 설정 (context.xml, server.xml)
  - Thread Dump (jstack 또는 JMX)
  - GC 로그 분석 결과
  - Heap Dump 트리거 (조건부)

필요 권한:
  - exec: jcmd, jstack, jstat (JDK 도구)
  - read: 설정 파일, 로그 디렉토리
  - JMX 접근: JMX Remote 포트 접근 (인증 필요 시)
```

#### DB Collector (Oracle, MySQL, PostgreSQL, MongoDB)

```
역할: DB 설정·성능·커넥션풀·슬로우 쿼리 수집
UI 연동: 호스트 상세 > 미들웨어 상태, 데이터베이스 모니터링
대상 ITEM: ITEM0050~ITEM0065 (DB 설정/성능)

수집 항목:
  - DB 버전, 파라미터 설정
  - 커넥션 수/최대/사용률
  - 슬로우 쿼리 Top N
  - 테이블스페이스 사용률
  - 리플리케이션 상태 (Lag, 지연)
  - 백업 설정/이력

필요 권한:
  - DB 접속 계정 (읽기 전용 권한이면 충분)
  - 설정 파일 접근: postgresql.conf, my.cnf, init.ora
  - Oracle: SYS/DBA 뷰 접근 필요 시 → 권한 부족 응답 반환
```

#### Redis/Cache Collector (Redis, Valkey, KeyDB, Memcached, DragonflyDB)

```
역할: Redis 계열 캐시 DB의 메모리·성능·복제·영속성·클러스터 상태 수집
UI 연동: 호스트 상세 > 미들웨어 상태, Redis/Cache 대시보드
대상 ITEM: ITEM0066~ITEM0085 (Redis/Cache 설정·성능·진단)

지원 대상:
  - Redis (5.x / 6.x / 7.x)
  - Valkey (Redis 포크)
  - KeyDB (멀티스레드 Redis 호환)
  - DragonflyDB (Redis 호환 고성능 캐시)
  - Memcached (stats 명령 전용)

수집 방법:
  Redis/Valkey/KeyDB/DragonflyDB:
    - INFO all          : 서버·메모리·성능·복제·영속성 전체 상태
    - SLOWLOG GET <N>   : 최근 느린 명령어 목록 + 실행 시간
    - CONFIG GET *      : 런타임 설정값 (maxmemory, save, appendonly 등)
    - CLUSTER INFO      : 클러스터 모드 활성화 시 슬롯 배분 및 상태
  Memcached:
    - stats             : get_hits/get_misses, curr_connections, bytes, evictions

진단 항목:
  [메모리]
    - used_memory                현재 사용 중인 메모리 (bytes)
    - maxmemory                  설정된 최대 메모리 한도
    - mem_fragmentation_ratio    메모리 파편화 비율 (> 1.5 경고)
    - evicted_keys               정책(LRU/LFU)에 의해 삭제된 키 수

  [성능]
    - hit_rate                   keyspace_hits / (keyspace_hits + keyspace_misses)
    - instantaneous_ops_per_sec  초당 처리 커맨드 수 (OPS)
    - latency_percentile         레이턴시 분포 (P50/P95/P99) — LATENCY HISTORY

  [커넥션]
    - connected_clients          현재 연결된 클라이언트 수
    - blocked_clients            BLPOP/BRPOP 등으로 블로킹된 클라이언트 수
    - rejected_connections       maxclients 초과로 거부된 누적 연결 수

  [Persistence]
    - rdb_last_save_time         마지막 RDB 스냅샷 저장 시각 (Unix timestamp)
    - rdb_changes_since_last_save  마지막 저장 이후 변경된 키 수
    - aof_rewrite_in_progress    AOF 재작성 진행 여부 (0/1)

  [Replication]
    - role                       서버 역할 (master / replica)
    - master_repl_offset         마스터의 현재 복제 오프셋
    - repl_lag                   레플리카의 지연 바이트 수 (connected_slaves 기준)

  [Slow Log]
    - slowlog_len                현재 슬로우 로그 항목 수
    - slowlog entries            느린 명령어 목록 (명령어 + 인자 + 실행 시간 µs)

  [Keyspace]
    - db{N}.keys                 데이터베이스 N의 키 수
    - db{N}.expires              TTL 설정된 키 수
    - db{N}.avg_ttl              평균 TTL (ms)

  [Cluster (클러스터 모드)]
    - cluster_state              클러스터 상태 (ok / fail)
    - cluster_slots_assigned     배정된 슬롯 수 (정상: 16384)
    - cluster_slots_ok           정상 응답 슬롯 수
    - cluster_slots_pfail        PFAIL(의심) 상태 슬롯 수
    - cluster_slots_fail         FAIL 상태 슬롯 수

  [Memcached 전용]
    - get_hits / get_misses      캐시 히트·미스 누적 카운트
    - curr_connections           현재 연결 수
    - bytes                      현재 사용 중인 메모리 bytes
    - evictions                  퇴출된 항목 수

필요 권한:
  - Redis 접속 계정 (AUTH 설정 시 비밀번호 필요)
  - CONFIG GET 실행 권한 (rename-command 설정 시 제한될 수 있음)
  - 클러스터 모드: CLUSTER INFO 실행 가능한 일반 클라이언트 권한으로 충분
  - Memcached: 네트워크 접근 권한만 필요 (인증 없음)
```

### 3.2.5 미들웨어 Collector — 언어별 런타임 모니터링

> **설계 목표**: WAS Collector가 다루는 Tomcat/JBoss 외에, 언어 런타임 수준의 미들웨어(스레드 풀, 커넥션 풀, 이벤트 루프, 워커, 고루틴)를 언어별로 세분화하여 수집한다.

#### 언어별 미들웨어 대응표

| 언어 | 프레임워크 / 미들웨어 | 런타임 수집 방식 |
|------|---------------------|----------------|
| Java | Tomcat, JBoss, Spring Boot, WebLogic | JMX / jcmd / HikariCP MBean |
| .NET | Kestrel, IIS, ASP.NET Core | CLR EventSource / dotnet-counters |
| Node.js | Express, Fastify, NestJS | `perf_hooks` event loop stats / `pg` pool events |
| Python | Gunicorn, Uvicorn, Flask, FastAPI | `/proc` + Gunicorn stats socket / SQLAlchemy pool |
| Go | net/http, Gin, Echo, Fiber | `expvar` / `runtime` package / `database/sql` Stats |

#### Java 수집 메트릭

```
Thread Pool (Tomcat/JBoss Connector):
  - thread_pool.active_threads       현재 활성 스레드 수
  - thread_pool.idle_threads         유휴 스레드 수
  - thread_pool.max_threads          최대 스레드 수 (maxThreads 설정값)
  - thread_pool.queue_size           대기 중인 요청 큐 길이

Connection Pool (HikariCP / DBCP / C3P0):
  - connection_pool.active           현재 사용 중인 커넥션 수
  - connection_pool.idle             유휴 커넥션 수
  - connection_pool.max              최대 커넥션 수 (maximumPoolSize)
  - connection_pool.wait_time_ms     커넥션 대기 시간 (P50/P95/P99)
  - connection_pool.pending_threads  커넥션 획득 대기 스레드 수

Request Queue:
  - request_queue.depth              처리 대기 중인 HTTP 요청 수

Session (Servlet 컨테이너):
  - session.active                   현재 활성 세션 수
  - session.created                  생성된 총 세션 수
  - session.expired                  만료된 세션 수

수집 방법:
  - JMX MBean (catalina:type=ThreadPool, com.zaxxer.hikari)
  - jcmd <pid> VM.native_memory
  - Spring Boot Actuator /actuator/metrics 엔드포인트
```

#### .NET 수집 메트릭

```
Kestrel Connection:
  - kestrel.active_connections       현재 활성 HTTP 연결 수
  - kestrel.queued_connections       큐에 대기 중인 연결 수
  - kestrel.total_connections        누적 연결 수

Thread Pool Queue:
  - thread_pool.queue_length         Thread Pool 작업 큐 길이
  - thread_pool.completed_items      완료된 작업 항목 수

GC / Heap:
  - gc.heap_size_bytes               현재 힙 크기
  - gc.gen0_collection_count         Gen0 GC 횟수
  - gc.gen1_collection_count         Gen1 GC 횟수
  - gc.gen2_collection_count         Gen2 GC 횟수 (Full GC 지표)

EF Core Connection Pool:
  - ef_core.connection_pool.active   EF Core 활성 커넥션 수
  - ef_core.connection_pool.idle     EF Core 유휴 커넥션 수

수집 방법:
  - dotnet-counters / EventSource (System.Runtime, Microsoft.AspNetCore.Hosting)
  - CLR ETW 이벤트
  - Process.GetCurrentProcess() + GC.CollectionCount()
```

#### Node.js 수집 메트릭

```
Event Loop:
  - event_loop.lag_ms                이벤트 루프 지연 (ms) — 100ms 초과 시 경고
  - event_loop.utilization           이벤트 루프 사용률 (0~1) — 0.8 초과 시 포화

Active Connections:
  - active_connections               현재 활성 HTTP 연결 수

DB Connection Pool (pg-pool, mongoose):
  - db_pool.total                    전체 풀 크기
  - db_pool.idle                     유휴 커넥션 수
  - db_pool.waiting                  커넥션 대기 중인 요청 수

수집 방법:
  - `perf_hooks.performance.eventLoopUtilization()`
  - `server.getConnections()` 콜백
  - pg-pool Pool 객체 `.totalCount`, `.idleCount`, `.waitingCount` 속성
  - mongoose.connection 이벤트 리스너
```

#### Python 수집 메트릭

```
Gunicorn Worker Pool:
  - worker.active                    현재 요청 처리 중인 워커 수
  - worker.idle                      유휴 워커 수
  - worker.restarts                  워커 재시작 횟수 (비정상 종료 지표)

Request Queue:
  - request_queue.depth              대기 중인 요청 수

SQLAlchemy Pool:
  - sqlalchemy_pool.checked_out      현재 체크아웃된 커넥션 수
  - sqlalchemy_pool.checked_in       풀에 반환된 커넥션 수
  - sqlalchemy_pool.overflow         overflow 커넥션 수 (pool_size 초과)
  - sqlalchemy_pool.invalid          무효화된 커넥션 수

수집 방법:
  - Gunicorn stats socket (`/tmp/gunicorn.sock` 또는 `--statsd`)
  - `engine.pool.status()` — SQLAlchemy Pool 상태 조회
  - `/proc/{pid}/status` + `/proc/{pid}/fd` 파일 디스크립터 수
  - Uvicorn: `asyncio` event loop 상태 (`asyncio.get_event_loop().is_running()`)
```

#### Go 수집 메트릭

```
Goroutine:
  - goroutine.count                  현재 고루틴 수 — 급격한 증가 시 누수 감지
  - goroutine.created                누적 생성된 고루틴 수 (runtime.NumGoroutine 증감)

database/sql Pool:
  - db_pool.max_open_connections     최대 오픈 커넥션 수 (MaxOpenConns 설정값)
  - db_pool.open_connections         현재 오픈 커넥션 수 (InUse + Idle)
  - db_pool.in_use                   현재 사용 중인 커넥션 수
  - db_pool.idle                     유휴 커넥션 수
  - db_pool.wait_count               커넥션 대기 누적 횟수
  - db_pool.wait_duration_ms         커넥션 대기 누적 시간 (ms)

수집 방법:
  - `runtime.NumGoroutine()` — 고루틴 수 폴링
  - `sql.DB.Stats()` — DB Pool 전체 통계 (MaxOpenConnections, InUse, Idle, WaitCount 등)
  - `expvar` 패키지 — `/debug/vars` 엔드포인트 노출 시 원격 수집 가능
  - pprof goroutine 덤프: `http://localhost:6060/debug/pprof/goroutine`
```

#### 공통 HTTP 요청 지표

```
HTTP Request:
  - http.request.duration_ms         요청 처리 시간 (P50/P95/P99)
  - http.request.status_code_dist    상태코드 분포 (2xx/3xx/4xx/5xx 비율)
  - http.request.tps                 초당 처리 요청 수 (TPS)
  - http.request.error_rate          에러율 (4xx+5xx / 전체)
  - http.request.active              현재 처리 중인 동시 요청 수
```

#### Connection Pool 실시간 모니터링

| 커넥션 풀 구현체 | 언어 | 주요 지표 | 수집 방법 |
|----------------|------|----------|----------|
| HikariCP | Java | active/idle/pending/max/wait_ms | JMX MBean (com.zaxxer.hikari) |
| DBCP2 | Java | active/idle/max/mean_borrow_time | JMX MBean (org.apache.commons.pool2) |
| C3P0 | Java | active/idle/max/acquire_time | JMX MBean (com.mchange.v2.c3p0) |
| EF Core (Microsoft) | .NET | active/idle | dotnet-counters / DiagnosticListener |
| pg-pool | Node.js | total/idle/waiting | Pool 객체 속성 직접 조회 |
| mongoose | Node.js | active/idle | 이벤트 리스너 + `connection.pool` |
| SQLAlchemy | Python | checked_out/checked_in/overflow/invalid | `engine.pool.status()` |
| database/sql | Go | open/in_use/idle/wait_count/wait_duration | `sql.DB.Stats()` |

**누수 감지 알림 기준**:
- Connection Pool active/max ≥ 90% 이상이면 경고
- pool.waiting > 0 이 30초 이상 지속되면 경고
- Go goroutine.count 이 기준값 대비 2배 이상 증가 시 누수 의심 알림

#### 메시지 큐 모니터링

```
Kafka:
  - kafka.consumer.lag               Consumer Group별 파티션 Lag (지연 메시지 수)
  - kafka.consumer.lag_max           Consumer Group 내 최대 Lag
  - kafka.producer.sent_rate         초당 전송 메시지 수
  - kafka.topic.partition.offset     파티션별 최신/현재 오프셋

수집 방법:
  - kafka-consumer-groups.sh --describe (Lag 계산)
  - Kafka JMX (kafka.consumer:type=consumer-fetch-manager-metrics)
  - Confluent Schema Registry REST API (스키마 정보)

RabbitMQ:
  - rabbitmq.queue.depth             큐에 쌓인 메시지 수
  - rabbitmq.queue.consumers         소비자 수
  - rabbitmq.queue.publish_rate      초당 Publish 수
  - rabbitmq.queue.deliver_rate      초당 Deliver 수

수집 방법:
  - RabbitMQ Management HTTP API (/api/queues, /api/overview)
  - AMQP 메트릭 플러그인

ActiveMQ:
  - activemq.queue.depth             큐 메시지 수
  - activemq.queue.enqueue_count     누적 Enqueue 수
  - activemq.queue.dequeue_count     누적 Dequeue 수
  - activemq.queue.consumer_count    소비자 수

수집 방법:
  - ActiveMQ JMX (org.apache.activemq:type=Broker)
  - ActiveMQ REST API (/api/jolokia)
```

```
자동 탐지 기준:
  - Java: JMX 포트 오픈 여부 + HikariCP/DBCP 클래스 존재 여부
  - .NET: dotnet 프로세스 + Kestrel 포트 바인딩 감지
  - Node.js: node 프로세스 + package.json 내 express/fastify/pg/mongoose 의존성
  - Python: gunicorn/uvicorn 프로세스 + requirements.txt 내 SQLAlchemy 확인
  - Go: Go 바이너리 + /debug/vars 또는 /debug/pprof 엔드포인트 노출 여부

필요 권한:
  - net: JMX 포트, Management API, /debug/vars 엔드포인트 접근
  - read: package.json, requirements.txt, go.mod (의존성 확인)
  - exec: dotnet-counters, kafka-consumer-groups.sh (필요 시)
```

### 3.3 AI Collectors

#### LLM/Agent Collector (AA 영역)

```
역할: LLM 설정, Agent 워크플로, 프롬프트, 출력 검증 데이터 수집
UI 연동: AI 서비스 개요, LLM 성능 대시보드, Agent 실행 모니터링, 가드레일 분석
대상 ITEM: ITEM0200~0204, ITEM0209~0212, ITEM0221~0223, ITEM0230

수집 대상:
  ┌──────────────────────────────────────────────────────────────┐
  │ 항목                    │ 수집 방법                          │
  ├──────────────────────────────────────────────────────────────┤
  │ LLM API 설정            │ 설정 파일 파싱 (YAML/JSON/Python)  │
  │ (temperature, max_tokens)│ 환경변수 검사                      │
  │                          │                                    │
  │ Agent 설정               │ LangChain/LangGraph 설정 파싱      │
  │ (max_iterations, timeout)│ Python AST 분석                    │
  │                          │                                    │
  │ Rate Limiting 설정       │ API Gateway 설정, .env 파일        │
  │ (RPM, TPM, retry)       │                                    │
  │                          │                                    │
  │ 프롬프트 버전 이력        │ Git 연동 (프롬프트 디렉토리 해시)   │
  │                          │ 본문 미수집, 메타데이터만            │
  │                          │                                    │
  │ 토큰 사용 로그           │ API 응답 usage 필드 집계            │
  │                          │ 로그 파일 패턴 매칭                  │
  │                          │                                    │
  │ 출력 검증/가드레일 설정   │ guardrail 설정 파일, NeMo 설정      │
  └──────────────────────────────────────────────────────────────┘

자동 탐지 기준:
  - Python 프로세스 + openai/anthropic/langchain 라이브러리 존재
  - 환경변수: OPENAI_API_KEY, ANTHROPIC_API_KEY 등
  - 설정 파일: .env, config.yaml, pyproject.toml

Plugin Manifest:
  pluginId: "ai-llm-agent"
  requiredPrivileges: [read:app-config, exec:python3, exec:pip]
  outputSchemas: [
    ai.hallucination_config.v1,    ai.agent_loop_safety.v1,
    ai.rate_limiting.v1,           ai.output_validation.v1,
    ai.token_usage.v1,             ai.prompt_versioning.v1,
    ai.streaming_config.v1,        ai.semantic_caching.v1
  ]
```

#### VectorDB/Embedding Collector (DA 영역)

```
역할: Vector DB 상태, 임베딩 일관성, 인덱스 최적화, PII 처리 데이터 수집
UI 연동: RAG 파이프라인 뷰, Vector DB 상태
대상 ITEM: ITEM0205~0206, ITEM0213~0216, ITEM0224~0226

수집 대상:
  ┌──────────────────────────────────────────────────────────────┐
  │ Vector DB Health       │ REST API: /health, /collections     │
  │                        │ 복제 상태, 세그먼트 수               │
  │ 인덱스 메트릭           │ 크기, 유형(HNSW/IVF), 검색 지연     │
  │ 임베딩 설정             │ 모델 버전, 차원, 배치 크기            │
  │ Chunking 설정          │ chunk_size, overlap, strategy       │
  │ Reranking 설정         │ model, top_k, latency              │
  │ PII 탐지 설정           │ regex 패턴, 마스킹 룰               │
  └──────────────────────────────────────────────────────────────┘

자동 탐지:
  - 프로세스: milvus, chroma, qdrant, weaviate
  - 포트: 19530, 8000, 6333, 8080
  - 라이브러리: chromadb, pymilvus, pinecone-client

requiredPrivileges: [read:app-config, exec:curl, read:/var/lib/milvus]
```

#### GPU/Model Serving Collector (TA 영역)

```
역할: GPU 상태, 모델 서빙 Health, 배칭/양자화 설정, MLOps 파이프라인 수집
UI 연동: GPU 클러스터 뷰, LLM 성능 대시보드, 호스트 상세 > GPU 탭
대상 ITEM: ITEM0207~0208, ITEM0217~0220, ITEM0227~0229

수집 대상:
  ┌──────────────────────────────────────────────────────────────┐
  │ GPU 메트릭 (nvidia-smi) │ VRAM 사용/총량, 온도, 전력, SM%    │
  │                          │ GPU별 프로세스, ECC 에러             │
  │                          │                                    │
  │ 모델 서빙 상태           │ /health, /v1/models 엔드포인트 호출  │
  │                          │ 큐 길이, 지연시간, 에러율             │
  │                          │                                    │
  │ 배칭 설정                │ max_batch_size, continuous_batching │
  │ 양자화 설정              │ quantization_method, bits            │
  │ KV Cache 설정            │ size, PagedAttention 여부            │
  │                          │                                    │
  │ K8s 리소스               │ GPU limits/requests, HPA 설정       │
  │ MLOps 설정               │ CI/CD 파이프라인, 모델 레지스트리     │
  │                          │                                    │
  │ OTel/Prometheus 스냅샷   │ /metrics 엔드포인트에서 시계열 스냅샷 │
  │ (모니터링 연동 시)        │ TTFT, TPS, GPU 시계열              │
  └──────────────────────────────────────────────────────────────┘

자동 탐지:
  - nvidia-smi 실행 가능 여부
  - 프로세스: vllm, text-generation-launcher, tritonserver, ollama
  - K8s 리소스: nvidia.com/gpu

requiredPrivileges: [exec:nvidia-smi, exec:curl, exec:kubectl]
supportedPlatforms: [linux]  # GPU 서버는 Linux 한정
```

#### OTel Metrics Collector (모니터링 연동)

```
역할: 기존 OTel/Prometheus 모니터링 인프라에서 메트릭 스냅샷 수집
UI 연동: 프로젝트 대시보드, 서비스 상세, AI 서비스 상세 — 실시간 데이터 보강
용도: aiservice-monitoring 등 기존 모니터링의 데이터를 진단 Evidence로 재사용

수집 대상:
  - Prometheus /metrics 또는 /api/v1/query 엔드포인트
  - OTel Collector OTLP gRPC (:4317) 또는 HTTP (:4318)
  - 진단 시점의 시계열 스냅샷 (최근 1시간~24시간)

수집 메트릭:
  ┌──────────────────────────────────────────────────────────────┐
  │ OTel 표준 메트릭                       │ 연동 ITEM            │
  ├──────────────────────────────────────────────────────────────┤
  │ llm.time_to_first_token (P95)          │ ITEM0207             │
  │ llm.tokens_per_second (P50)            │ ITEM0207             │
  │ gpu.utilization, gpu.memory.used       │ ITEM0220             │
  │ gpu.temperature, gpu.power.draw        │ ITEM0228             │
  │ vectordb.search.duration (P99)         │ ITEM0206             │
  │ guardrail.validation.duration (P99)    │ ITEM0229             │
  │ guardrail.block.total                  │ ITEM0229             │
  │ external_api.error.total               │ ITEM0202             │
  │ vectordb.cache.hit.total               │ ITEM0211             │
  └──────────────────────────────────────────────────────────────┘

필요 조건:
  - Prometheus 또는 OTel Collector 엔드포인트 접근 가능
  - 접근 불가 시: 에이전트 자체 수집(nvidia-smi 등)으로 대체
```

### 3.4 Collector 실행 흐름

```
                    Scheduler (cron trigger)
                            │
                            ▼
                    ┌───────────────┐
                    │ Privilege     │
                    │ Pre-Check     │  ← 각 Collector의 RequiredPrivileges() 사전 검증
                    └───────┬───────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
             권한 충분             권한 부족
                  │                   │
                  ▼                   ▼
          ┌──────────────┐   ┌──────────────────┐
          │ AutoDetect() │   │ CollectError 생성  │
          │ 환경 탐지     │   │ code: PERMISSION  │
          └──────┬───────┘   │ DENIED            │
                 │           │ required: "root"   │
           ┌─────┴─────┐    │ suggestion: "sudo  │
           │           │    │ 또는 서비스 계정"    │
        탐지됨      미탐지    └──────────┬─────────┘
           │           │              │
           ▼           ▼              │
    ┌────────────┐  SKIP(환경 없음)    │
    │ Collect()  │                    │
    └──────┬─────┘                    │
           │                          │
           ▼                          ▼
    ┌────────────────────────────────────┐
    │         Sanitizer                    │
    │  API Key 마스킹, PII 1차 필터링      │
    └──────────────┬───────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────┐
    │         Local Buffer (SQLite)        │
    │  네트워크 불가 시 로컬 저장            │
    └──────────────┬───────────────────────┘
                   │
                   ▼
    ┌────────────────────────────────────┐
    │    Transport (gRPC / HTTPS)          │
    │    중앙 Collection Server로 전송      │
    └──────────────────────────────────────┘
```

### 3.5 수집 데이터 출력 포맷 (NDJSON)

```json
{
  "schema_name": "ai.gpu_metrics",
  "schema_version": "1.0.0",
  "collector_type": "agent-plugin",
  "collector_id": "ai-gpu-serving",
  "collector_version": "1.0.0",
  "agent_id": "agent-prod-gpu-01",
  "project_id": "PROJ001",
  "tenant_id": "TENANT001",
  "hostname": "prod-gpu-01",
  "timestamp": "2026-03-21T14:30:00Z",
  "category": "ai",
  "collect_status": "SUCCESS",
  "data": {
    "gpus": [
      {
        "index": 0,
        "name": "NVIDIA A100 80GB",
        "vram_used_mb": 57600,
        "vram_total_mb": 81920,
        "vram_percent": 70.3,
        "temperature_c": 62,
        "power_draw_w": 280,
        "sm_utilization_percent": 85,
        "ecc_errors": 0
      }
    ]
  },
  "errors": []
}
```

**권한 부족 시 응답 예시:**

```json
{
  "schema_name": "ai.gpu_metrics",
  "schema_version": "1.0.0",
  "collector_id": "ai-gpu-serving",
  "agent_id": "agent-prod-gpu-01",
  "hostname": "prod-gpu-01",
  "timestamp": "2026-03-21T14:30:00Z",
  "category": "ai",
  "collect_status": "FAILED",
  "data": null,
  "errors": [
    {
      "code": "PERMISSION_DENIED",
      "message": "nvidia-smi 실행 권한이 없습니다",
      "command": "nvidia-smi --query-gpu=...",
      "required": "exec:nvidia-smi (nvidia-utils 패키지 설치 및 실행 권한)",
      "current": "aitop-agent 사용자: nvidia-smi not found in PATH",
      "suggestion": "1) nvidia-utils 패키지 설치: apt install nvidia-utils-535\n2) 에이전트 사용자를 video 그룹에 추가: usermod -aG video aitop-agent\n3) 또는 에이전트를 root로 실행"
    }
  ]
}
```

---

## 4. 권한 관리 및 실행 결과 응답

### 4.1 권한 체계

```
Privilege 모델:

┌──────────────────────────────────────────────────────────────────┐
│                    Privilege Type                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  read:<path>        파일/디렉토리 읽기                              │
│  write:<path>       파일/디렉토리 쓰기                              │
│  exec:<command>     명령 실행 (nvidia-smi, jcmd, curl 등)          │
│  net:<host:port>    네트워크 접근 (DB 접속, API 호출)               │
│  root               root/Administrator 권한                        │
│  docker             Docker 소켓 접근                               │
│  k8s:<resource>     Kubernetes API 접근                            │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 사전 권한 검증 (Pre-flight Check)

에이전트 시작 시 및 매 수집 전에 각 Collector의 필요 권한을 사전 검증한다:

```go
// 에이전트 시작 시 전체 권한 리포트 생성
type PrivilegeReport struct {
    AgentID      string              `json:"agent_id"`
    Timestamp    time.Time           `json:"timestamp"`
    RunAsUser    string              `json:"run_as_user"`    // "aitop-agent" 또는 "root"
    RunAsGroups  []string            `json:"run_as_groups"`  // ["aitop", "video", "docker"]
    Checks       []PrivilegeCheck    `json:"checks"`
}

type PrivilegeCheck struct {
    Collector    string   `json:"collector"`     // "ai-gpu-serving"
    Privilege    string   `json:"privilege"`     // "exec:nvidia-smi"
    Status       string   `json:"status"`        // "GRANTED", "DENIED", "PARTIAL"
    Detail       string   `json:"detail"`        // "nvidia-smi found at /usr/bin/nvidia-smi"
    AffectedItems []string `json:"affected_items"` // ["ITEM0220", "ITEM0228"]
}
```

### 4.3 권한 부족 시 응답 규칙

| 상황 | collect_status | 행동 |
|------|---------------|------|
| 모든 수집 성공 | `SUCCESS` | 정상 데이터 전송 |
| 일부 항목 권한 부족 | `PARTIAL` | 수집 가능한 항목만 전송 + 권한 부족 항목은 errors에 기록 |
| Collector 전체 권한 없음 | `FAILED` | errors에 권한 없음 상세 사유 포함하여 전송 |
| 명령 미설치 | `FAILED` | code=NOT_INSTALLED, suggestion에 설치 방법 안내 |
| 타임아웃 | `FAILED` | code=TIMEOUT, 실행 시간 초과 정보 포함 |
| DB 접속 실패 | `FAILED` | code=CONNECTION_REFUSED, DB 주소/인증 정보 확인 안내 |

**모든 실패 응답은 중앙 서버로 전송되어 Fleet 대시보드에 표시된다:**

```
Fleet 대시보드 표시 예:
┌──────────────────────────────────────────────────────────────┐
│ prod-gpu-01  │ 🟡 PARTIAL │ AI-GPU Collector 부분 수집       │
│              │            │ nvidia-smi: OK                   │
│              │            │ kubectl: ⛔ PERMISSION_DENIED     │
│              │            │ → "kubeconfig 설정 필요"          │
├──────────────────────────────────────────────────────────────┤
│ prod-api-03  │ 🔴 FAILED  │ DB Collector 수집 실패            │
│              │            │ Oracle: ⛔ CONNECTION_REFUSED      │
│              │            │ → "TNS 리스너 확인, 방화벽 확인"   │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 권한 레벨별 수집 가능 범위

| 실행 권한 | OS Collector | WEB/WAS/DB | AI-GPU | AI-LLM | 원격 CLI |
|---------|:-----------:|:---------:|:------:|:------:|:-------:|
| 일반 사용자 (aitop-agent) | 기본 메트릭 (CPU/MEM/DISK) | 설정 파일 읽기 (권한 있을 때) | nvidia-smi (video 그룹) | Python 환경 탐지 | 해당 사용자 권한 내 |
| 일반 + 그룹 추가 | + 네트워크 상세 | + 로그 접근 | + 전체 GPU 메트릭 | + pip list, 설정 파싱 | + 제한된 명령 |
| root / sudo | 전체 항목 | 전체 항목 | 전체 항목 | 전체 항목 | 전체 명령 |

---

## 5. 중앙 에이전트 관리 (Fleet Management)

### 5.1 Fleet Management 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                  AITOP Collection Server                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Agent Registry                                                 │   │
│  │  - 에이전트 등록/인증 (mTLS 기반)                                │   │
│  │  - 에이전트 ID 발급 (UUID)                                      │   │
│  │  - 프로젝트-에이전트 매핑                                        │   │
│  │  - 에이전트 메타정보 저장 (OS, 버전, 플러그인 목록)               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Fleet Controller                                               │   │
│  │  - 에이전트 그룹 관리 (프로젝트별/환경별/OS별/AI환경별)           │   │
│  │  - 원격 설정 배포 (수집 스케줄, 플러그인 활성화)                  │   │
│  │  - OTA 업데이트 오케스트레이션 (canary → staged → full)          │   │
│  │  - 원격 명령 실행 (수집 즉시 실행, 진단 트리거)                   │   │
│  │  - 원격 CLI 세션 프록시                                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Health Monitor                                                 │   │
│  │  - Heartbeat 수신 (30초 간격)                                   │   │
│  │  - 상태 판정: healthy → degraded → offline                     │   │
│  │  - 알림 발행: 에이전트 오프라인, 수집 실패, 권한 문제            │   │
│  │  - 자동 복구: 오프라인 에이전트 재연결 감지                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Update Manager                                                 │   │
│  │  - 에이전트 바이너리 버전 관리                                   │   │
│  │  - 플러그인별 독립 업데이트                                      │   │
│  │  - 롤백 지원 (이전 안정 버전)                                    │   │
│  │  - 코드 서명 검증                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 에이전트 생명주기

```
에이전트 상태 머신:

  ┌──────────┐     등록 요청      ┌──────────┐     관리자 승인     ┌──────────┐
  │ UNKNOWN  │ ──────────────▶ │REGISTERED│ ──────────────▶  │ APPROVED │
  └──────────┘                  └──────────┘                  └────┬─────┘
                                                                   │
                                                          Heartbeat 시작
                                                                   │
                                                                   ▼
                          ┌──────────────────────────────────────────┐
                          │                                            │
                   ┌──────▼─────┐  Heartbeat 지연  ┌──────────────┐  │
                   │  HEALTHY   │ ───────────────▶│  DEGRADED     │  │
                   │ (정상 동작) │◀────────────────│ (응답 지연)    │  │
                   └──────┬─────┘  Heartbeat 복구  └──────┬───────┘  │
                          │                               │          │
                    업데이트 가능                    3분 무응답       │
                          │                               │          │
                   ┌──────▼─────────┐             ┌──────▼─────┐    │
                   │UPGRADE_AVAILABLE│             │  OFFLINE   │    │
                   └──────┬─────────┘             └──────┬─────┘    │
                          │                               │          │
                    업데이트 시작                     재연결 시       │
                          │                               │          │
                   ┌──────▼──────────┐                    │          │
                   │UPGRADE_IN_PROGRESS│                    │          │
                   └──────┬──────────┘                    │          │
                          │                               │          │
                    업데이트 완료 ─────────────────────────┘          │
                          │                                          │
                   보안 위반/격리                                     │
                          │                                          │
                   ┌──────▼─────┐      수동 해제     ┌──────────┐  │
                   │QUARANTINED │ ─────────────────▶│  RETIRED  │  │
                   │ (격리됨)    │                    │ (폐기됨)   │  │
                   └────────────┘                    └──────────┘  │
                                                                    │
                          ◀────────────────────────────────────────┘
```

### 5.3 Heartbeat 프로토콜

```protobuf
// agent_heartbeat.proto
message Heartbeat {
  string agent_id = 1;
  string hostname = 2;
  int64 timestamp = 3;
  AgentStatus status = 4;
  ResourceUsage self_usage = 5;       // 에이전트 자체 CPU/MEM 사용량
  repeated PluginStatus plugins = 6;  // 플러그인별 상태
  repeated CollectSummary recent_collections = 7; // 최근 수집 요약
  PrivilegeReport privileges = 8;     // 권한 상태 리포트
}

message HeartbeatResponse {
  repeated RemoteCommand commands = 1;    // 대기 중인 원격 명령
  ConfigUpdate config_update = 2;         // 설정 변경 있으면
  UpdateNotification update_available = 3; // 업데이트 알림
}
```

### 5.4 그룹 기반 관리

```
에이전트 그룹 체계:

Organization (AITOP)
  └── Project (AI-Production)
        ├── HostGroup: API Servers
        │     ├── prod-api-01  [IT]
        │     ├── prod-api-02  [IT]
        │     └── prod-api-03  [IT]
        │
        ├── HostGroup: GPU Servers
        │     ├── prod-gpu-01  [IT + AI(GPU, LLM, VectorDB)]
        │     ├── prod-gpu-02  [IT + AI(GPU, LLM)]
        │     └── prod-gpu-03  [IT + AI(GPU)]
        │
        └── HostGroup: DB Servers
              ├── prod-db-01   [IT(DB)]
              └── prod-db-02   [IT(DB)]

그룹 단위 제어:
  - 수집 스케줄 일괄 변경
  - 플러그인 일괄 배포/활성화
  - OTA 업데이트 단계 배포
  - 원격 수집 즉시 실행
```

### 5.5 SDK / 에이전트 자동 인식

에이전트 설치 또는 계측 SDK 추가 시 UI가 자동으로 인지하고 표시한다.

#### 자동 인식 흐름

```
[에이전트 설치 시]
  에이전트 기동 → Collection Server에 Register 요청
    → Agent Registry에 등록 (UUID 발급)
    → Fleet 콘솔에 즉시 표시 (30초 이내, Heartbeat 기반)
    → 신규 에이전트 배지 "🆕 NEW" 표시 (24시간)

[SDK 계측 추가 시]
  앱 재기동 → OTel SDK가 OTLP/gRPC로 첫 데이터 전송
    → Collection Server가 service.name 속성으로 서비스 자동 탐지
    → 인프라 뷰 / 서비스 맵에 자동 노드 추가
    → "🆕 SDK 감지됨" 배지 + 알림 발송 (설정 가능)

[언어/SDK 자동 판별]
  OTel span의 telemetry.sdk.language 속성 기반:
    java       → ☕ Java Agent 아이콘
    dotnet     → 🔷 .NET CLR Profiler 아이콘
    python     → 🐍 Python SDK 아이콘
    nodejs     → 🟩 Node.js SDK 아이콘
    go         → 🐹 Go SDK 아이콘
    (미탐지)   → ❓ Unknown 아이콘 + 수동 지정 유도
```

#### 에이전트 자동 인식 — Heartbeat 기반

| 이벤트 | 트리거 | UI 반응 |
|--------|--------|---------|
| 에이전트 최초 등록 | Register gRPC 호출 | Fleet 목록에 즉시 추가, "🆕 NEW" 배지 |
| 플러그인 신규 활성화 | Heartbeat `plugins` 필드 변경 | 플러그인 목록 자동 갱신, 수집 항목 추가 |
| AI 환경 자동 탐지 | Heartbeat `ai_detected: true` | AI 탭 자동 활성화, AI 메트릭 수집 시작 |
| SDK 첫 데이터 수신 | OTel OTLP 첫 요청 | 서비스 맵에 신규 노드 추가 |
| 에이전트 오프라인 | Heartbeat 3분 무응답 | 🔴 오프라인 표시, 알림 발송 |

### 5.6 중앙 설정 관리 — UI에서 agent.yaml 원격 편집

UI에서 에이전트의 `agent.yaml` 설정을 원격으로 열람·편집하고, 저장 즉시 에이전트에 반영한다.

#### 설계 원칙

1. **설정파일에 없는 기본값도 표시**: UI는 스키마 전체를 기반으로 렌더링하며, 에이전트에 설정이 없는 항목도 기본값(default)으로 표시하고 편집 가능하게 한다.
2. **설정 반영 수준 표시**: 각 설정 항목 옆에 반영 수준 아이콘(🟢/🟡/🔴)을 표시한다 (§5.7 참조).
3. **저장 시 즉시 배포**: 편집 후 저장하면 Collection Server가 설정을 저장하고, 에이전트가 다음 Heartbeat 또는 즉시 폴링 시 가져간다.
4. **설정 이력 관리**: 편집 이력을 저장하여 이전 버전으로 롤백 가능.

#### 설정 배포 흐름

```
[UI 편집 → 에이전트 반영 흐름]

UI 설정 편집기
  → 저장 버튼 클릭
  → Backend: PUT /api/v1/agents/{agentId}/config
      ├── 설정 스키마 유효성 검증
      ├── DB에 새 설정 버전 저장 (revision N+1)
      └── 에이전트가 다음 Heartbeat 시 ConfigUpdate 수신

에이전트 측:
  Heartbeat Response에 ConfigUpdate 포함
  └── 🟢 Hot Reload 항목: 즉시 메모리 내 반영 (재기동 없음)
  └── 🟡 Agent Restart 항목: UI에서 재기동 버튼 클릭 후 반영
  └── 🔴 App Restart 항목: "수동 재기동 필요" 경고만 표시

[설정 폴링 주기]
  기본: Heartbeat(30초)에 포함
  긴급 반영: POST /api/v1/agents/{agentId}/config/reload → 즉시 폴링 트리거
```

#### 설정 스키마 레지스트리

Collection Server는 에이전트 버전별 `config-schema.json`을 보유한다. UI는 이 스키마를 기반으로:
- 모든 설정 항목(기본값 포함) 렌더링
- 항목별 타입 (boolean/string/int/duration) 기반 입력 컴포넌트 선택
- 항목별 반영 수준 아이콘 표시
- 유효성 오류(타입 불일치, 범위 초과) 실시간 피드백

### 5.7 설정 반영 수준 체계

각 설정 항목은 변경 후 반영에 필요한 수준을 3단계로 분류한다.

| 수준 | 아이콘 | 명칭 | 설명 | 예시 |
|------|--------|------|------|------|
| **Hot Reload** | 🟢 | 운영 중 즉시 반영 | 에이전트가 Heartbeat 폴링 시 자동 적용. 재기동 불필요. | 수집 주기, 로그 레벨, 슬로우 쿼리 임계치 |
| **Agent Restart** | 🟡 | 에이전트 재기동 필요 | 에이전트 프로세스 재시작 후 반영. UI에서 원격 재기동 가능. | 서버 URL, 인증 토큰, gRPC 포트 |
| **App Restart** | 🔴 | 애플리케이션 재기동 필요 | 대상 애플리케이션 재기동 필요. 원격 제어 불가 — 수동 안내만 표시. | Java `-javaagent` 경로, .NET CLR Profiler 활성화, 포트 바인딩 |

#### UI 동작 규칙

```
편집된 항목에 따른 UI 동작:

🟢 Hot Reload 항목만 변경 시:
  → 저장 즉시 반영
  → "✅ 설정이 적용되었습니다 (Hot Reload)" 토스트

🟡 Agent Restart 항목 포함 시:
  → 저장 후 "이 설정은 에이전트 재기동이 필요합니다" 배너 표시
  → [🔄 에이전트 재기동] 버튼 제공
  → 재기동 완료 후 설정 반영 확인

🔴 App Restart 항목 포함 시:
  → 저장 전 경고 모달: "⚠️ 이 설정은 애플리케이션 재기동이 필요합니다.
     UI에서 원격으로 재기동할 수 없으며, 서버 관리자가 직접 재기동해야 합니다."
  → 저장 후 "⚠️ 수동 재기동 필요" 배너 지속 표시 (재기동 확인 전까지)
```

#### agent.yaml 설정 항목별 반영 수준

```yaml
# 각 항목 옆 주석: [🟢 Hot] [🟡 AgentRestart] [🔴 AppRestart]

server:
  url: "https://collection-server:8443"   # 🟡 AgentRestart — gRPC 연결 재수립 필요
  token: "aitop-agent-token-..."          # 🟡 AgentRestart — 인증 재수립 필요
  tls_verify: true                        # 🟡 AgentRestart

agent:
  project_id: "proj-001"                  # 🟡 AgentRestart
  host_group: "결제 서비스 그룹"            # 🟢 Hot — 메타데이터만 변경
  tags: {env: prod, region: kr-central}   # 🟢 Hot

collectors:
  os:
    enabled: true                         # 🟡 AgentRestart — Collector 스레드 재초기화
    interval: "60s"                       # 🟢 Hot — 스케줄러 즉시 업데이트
  web:
    enabled: true                         # 🟡 AgentRestart
    interval: "6h"                        # 🟢 Hot
  was:
    enabled: true                         # 🟡 AgentRestart
    interval: "6h"                        # 🟢 Hot
  db:
    enabled: true                         # 🟡 AgentRestart
    interval: "6h"                        # 🟢 Hot
    host: "10.0.0.10"                     # 🟡 AgentRestart
    port: 5432                            # 🟡 AgentRestart
    user: "aitop_readonly"                # 🟡 AgentRestart
    password_env: "AITOP_DB_PASSWORD"     # 🟡 AgentRestart
  ai_llm:
    enabled: auto                         # 🟡 AgentRestart
  ai_gpu:
    enabled: auto                         # 🟡 AgentRestart
  ai_vectordb:
    enabled: auto                         # 🟡 AgentRestart
  otel_metrics:
    enabled: false                        # 🟡 AgentRestart
    prometheus_url: "http://localhost:9090"# 🟡 AgentRestart

# Java/CLR 계측 설정 — 대상 앱 재기동 필요
java_agent:
  enabled: false                          # 🔴 AppRestart — JVM -javaagent 플래그 변경 필요
  jar_path: "/opt/aitop/aitop-agent.jar"  # 🔴 AppRestart

dotnet_profiler:
  enabled: false                          # 🔴 AppRestart — CORECLR_ENABLE_PROFILING 환경변수 변경 필요
  profiler_path: "/opt/aitop/aitop.so"   # 🔴 AppRestart

remote_shell:
  enabled: true                           # 🟡 AgentRestart
  allowed_roles: ["admin", "sre"]         # 🟢 Hot
  max_sessions: 3                         # 🟢 Hot
  idle_timeout: 600                       # 🟢 Hot
  blocked_commands: [...]                 # 🟢 Hot

buffer:
  path: "/var/lib/aitop-agent/buffer.db"  # 🟡 AgentRestart
  max_size_mb: 500                        # 🟢 Hot

logging:
  level: "info"                           # 🟢 Hot — 즉시 로그 레벨 변경
  path: "/var/log/aitop-agent/agent.log"  # 🟡 AgentRestart
  max_size_mb: 100                        # 🟢 Hot
  max_backups: 5                          # 🟢 Hot
```

### 5.8 원격 재기동

UI에서 에이전트 프로세스를 안전하게 원격 재기동할 수 있다.

#### 에이전트 재기동 (🟡 Agent Restart)

```
재기동 흐름:

1. UI: [🔄 에이전트 재기동] 버튼 클릭
2. Backend: POST /api/v1/agents/{agentId}/restart
3. Collection Server → 에이전트 Heartbeat Response에 RESTART_COMMAND 삽입
4. 에이전트:
   a. 현재 수집 작업 안전하게 완료 (graceful shutdown, 최대 30초 대기)
   b. 버퍼 flush → Collection Server 전송
   c. 프로세스 재시작 (systemd/launchd/Windows Service 기반)
5. 재기동 후 Heartbeat 재개 → UI에서 🟢 정상 확인
6. UI: "✅ 에이전트가 재기동되었습니다" 알림

오류 처리:
  - 5분 내 Heartbeat 없으면 → "⚠️ 재기동 실패 — 수동 확인 필요" 경고
  - 재기동 중 수집 손실 없음 (버퍼 flush 보장)
```

#### 애플리케이션 재기동 (🔴 App Restart — 원격 제어 불가)

```
🔴 AppRestart 항목 변경 시 UI 안내:

┌─────────────────────────────────────────────────────────┐
│ ⚠️  애플리케이션 재기동이 필요합니다                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  변경된 설정:                                             │
│  • java_agent.enabled: false → true                     │
│  • java_agent.jar_path: /opt/aitop/aitop-agent.jar      │
│                                                          │
│  이 설정은 JVM 시작 시 적용되므로 애플리케이션을            │
│  재기동해야 합니다. UI에서 원격으로 재기동할 수 없습니다.   │
│                                                          │
│  적용 절차:                                              │
│  1. 서버 관리자에게 아래 JVM 옵션 추가를 요청하세요:        │
│     -javaagent:/opt/aitop/aitop-agent.jar               │
│  2. 애플리케이션을 재기동하세요.                           │
│  3. 재기동 후 AITOP UI에서 SDK 탐지를 확인하세요.          │
│                                                          │
│  [📋 설정 복사]  [✕ 닫기]                                 │
└─────────────────────────────────────────────────────────┘
```

| 재기동 유형 | UI 지원 여부 | 방법 |
|------------|------------|------|
| 🟡 에이전트 재기동 | ✅ 원격 지원 | UI [재기동] 버튼 → gRPC RESTART_COMMAND |
| 🔴 애플리케이션 재기동 | ❌ 원격 불가 | UI 안내문 + 절차 표시만 제공 |

---

## 6. 원격 CLI / 터미널 구현

### 6.1 개요

UI 화면에서 에이전트가 설치된 서버의 명령창을 구현한다. SSH와 유사한 경험을 제공하되, 별도의 SSH 설정 없이 에이전트 연결만으로 동작한다.

### 6.2 아키텍처

```
┌──────────────────┐     WebSocket     ┌──────────────────┐    gRPC    ┌──────────────────┐
│   Browser         │ ◀────────────▶   │  Backend          │ ◀──────▶  │  AITOP Agent      │
│   (xterm.js)      │                  │  (WS Proxy)       │           │  (PTY Service)    │
│                   │                  │                    │           │                   │
│  ┌─────────────┐ │                  │  ┌──────────────┐ │           │  ┌─────────────┐ │
│  │ Terminal UI  │ │   stdin/stdout   │  │ Session Mgr  │ │  stream   │  │ PTY Alloc   │ │
│  │ (xterm.js)  │◀├─────────────────▶│  │ + Auth Check │◀├──────────▶│  │ /bin/bash   │ │
│  │             │ │                  │  │ + Audit Log  │ │           │  │ or cmd.exe  │ │
│  └─────────────┘ │                  │  └──────────────┘ │           │  └─────────────┘ │
│                   │                  │                    │           │                   │
│  ┌─────────────┐ │                  │  ┌──────────────┐ │           │  ┌─────────────┐ │
│  │ FitAddon    │ │                  │  │ RBAC Filter  │ │           │  │ Command     │ │
│  │ SearchAddon │ │                  │  │ (역할별 제한) │ │           │  │ Filter      │ │
│  └─────────────┘ │                  │  └──────────────┘ │           │  │ (차단 명령)  │ │
│                   │                  │                    │           │  └─────────────┘ │
└──────────────────┘                  └──────────────────┘           └──────────────────┘
```

### 6.3 통신 흐름

```
1. 사용자가 UI에서 "터미널 열기" 클릭 (에이전트 상세 페이지)
2. Frontend → Backend: WebSocket 연결 (ws://backend/api/v1/agents/{agentId}/terminal)
3. Backend: 사용자 인증 + 역할 확인 (admin/sre만 허용)
4. Backend → Agent: gRPC 양방향 스트림 (OpenTerminalSession RPC)
5. Agent: PTY 할당 (Linux: /bin/bash, Windows: cmd.exe)
6. 양방향 데이터 스트리밍:
   - 사용자 입력 → WS → Backend → gRPC → Agent PTY stdin
   - Agent PTY stdout → gRPC → Backend → WS → xterm.js 렌더링
7. 세션 종료: exit 입력 또는 UI에서 닫기 → PTY 해제
```

### 6.4 보안 제어

| 보안 계층 | 구현 |
|---------|------|
| **인증** | JWT 토큰 기반 — 유효한 로그인 세션 필수 |
| **인가 (RBAC)** | `admin`, `sre` 역할만 터미널 접근 허용. `ai_engineer`, `viewer` 차단 |
| **명령 필터링** | Agent 측에서 위험 명령 차단 (configurable blacklist) |
| **세션 타임아웃** | 유휴 10분 후 자동 종료, 최대 세션 시간 1시간 |
| **감사 로그** | 모든 명령 입력/출력을 audit log에 기록 |
| **동시 세션 제한** | 에이전트당 최대 3개 동시 터미널 세션 |
| **읽기 전용 모드** | `viewer` 역할용 — 출력만 볼 수 있는 읽기 전용 터미널 (선택) |

**명령 차단 목록 (기본값, 설정 변경 가능):**

```yaml
# agent-config.yaml — remote_shell 섹션
remote_shell:
  enabled: true
  allowed_roles: ["admin", "sre"]
  max_sessions: 3
  idle_timeout: 600          # 10분
  max_session_duration: 3600 # 1시간
  blocked_commands:
    - "rm -rf /"
    - "mkfs"
    - "dd if=/dev/zero"
    - ":(){ :|:& };:"        # fork bomb
    - "shutdown"
    - "reboot"
    - "init 0"
    - "halt"
  audit:
    enabled: true
    log_path: "/var/log/aitop-agent/terminal-audit.log"
    log_retention_days: 90
```

### 6.5 Frontend 구현 (xterm.js)

```
UI 화면 위치: 에이전트 관리 > 에이전트 상세 > [🖥️ 터미널] 탭

┌──────────────────────────────────────────────────────────────────────┐
│ 🖥️ 원격 터미널 — prod-gpu-01                    [전체화면] [닫기]     │
│ OS: Ubuntu 22.04 | 에이전트: v1.2.0 | 연결: 🟢 WebSocket             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  aitop@prod-gpu-01:~$ nvidia-smi                                      │
│  +-----------------------------------------------------------+        │
│  | NVIDIA-SMI 535.129.03  Driver Version: 535.129.03          |        │
│  | CUDA Version: 12.2                                         |        │
│  |-----------------------------------------------------------+        │
│  | GPU  Name       Persistence-M | Bus-Id    Disp.A | VRAM   |        │
│  |   0  A100 80GB          On    | 00:3B:00.0 Off   | 57600M |        │
│  |   1  A100 80GB          On    | 00:86:00.0 Off   | 54400M |        │
│  +-----------------------------------------------------------+        │
│                                                                        │
│  aitop@prod-gpu-01:~$ top -b -n 1 | head -20                         │
│  top - 14:32:15 up 45 days, 3:12, 1 user, load average: 2.15         │
│  Tasks: 245 total,   2 running, 243 sleeping, 0 stopped               │
│  %Cpu(s): 45.2 us,  3.1 sy,  0.0 ni, 51.2 id, 0.0 wa                │
│  MiB Mem : 128000.0 total, 24500.0 free, 82500.0 used                │
│                                                                        │
│  aitop@prod-gpu-01:~$ █                                               │
│                                                                        │
├──────────────────────────────────────────────────────────────────────┤
│  세션 시작: 14:30:15 | 경과: 02:00 | 감사 로그: 활성화 🔴              │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.6 gRPC 서비스 정의

```protobuf
// terminal_service.proto
service TerminalService {
  // 양방향 스트리밍 — 터미널 입출력
  rpc OpenSession(stream TerminalInput) returns (stream TerminalOutput);
}

message TerminalInput {
  oneof payload {
    SessionOpen open = 1;       // 세션 시작 요청
    bytes stdin = 2;            // 사용자 입력
    WindowResize resize = 3;    // 터미널 크기 변경
    SessionClose close = 4;     // 세션 종료
  }
}

message SessionOpen {
  string session_id = 1;
  string user_id = 2;
  string role = 3;
  string shell = 4;            // "/bin/bash", "cmd.exe", 빈 값이면 기본 셸
  uint32 rows = 5;
  uint32 cols = 6;
}

message TerminalOutput {
  oneof payload {
    bytes stdout = 1;           // 터미널 출력
    SessionStatus status = 2;   // 세션 상태 변경 (connected, closed, error)
  }
}

message WindowResize {
  uint32 rows = 1;
  uint32 cols = 2;
}
```

---

## 7. 수집 데이터 저장 전략

### 7.1 데이터 유형별 저장소 선정

수집 데이터는 성격에 따라 최적의 저장소를 선택한다:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     수집 데이터 저장 아키텍처                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [1] 시계열 메트릭 → Prometheus (TSDB) / VictoriaMetrics          │  │
│  │                                                                    │  │
│  │  용도: 실시간 대시보드, 알림, 트렌드 분석                            │  │
│  │  데이터: CPU/MEM/DISK/NET, GPU VRAM/Temp/Power, TTFT, TPS 등      │  │
│  │  보존: 15일 (raw) → 1년 (다운샘플링)                               │  │
│  │  쿼리: PromQL                                                      │  │
│  │  수집 주기: 10초~60초 (에이전트 → Prometheus Remote Write)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [2] 진단 Evidence (스냅샷) → S3/MinIO (Object Storage)           │  │
│  │                                                                    │  │
│  │  용도: AITOP 86개 항목 진단 입력, 보고서 근거                       │  │
│  │  데이터: 설정 파일, 로그 스냅샷, API 응답, 스크립트 출력 (NDJSON)   │  │
│  │  보존: 무기한 (프로젝트 단위 관리, 용량 정책)                       │  │
│  │  쿼리: metadata 기반 검색 (PostgreSQL 메타 + S3 조회)              │  │
│  │  수집 주기: 일/주/월 단위 스케줄 또는 수동 트리거                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [3] 관계형 메타데이터 → PostgreSQL                                │  │
│  │                                                                    │  │
│  │  용도: 에이전트 레지스트리, 프로젝트, 호스트, 플러그인 메타정보      │  │
│  │        진단 결과 (ITEM별 판정, 점수, 교차분석 결과)                 │  │
│  │        수집 이력, 알림 정책, 사용자/역할                            │  │
│  │  보존: 영구 (아카이빙 정책 적용)                                    │  │
│  │  쿼리: SQL                                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [4] 로그 → Loki (또는 OpenSearch)                                │  │
│  │                                                                    │  │
│  │  용도: 에이전트 수집 로그, 애플리케이션 로그, 에러 로그              │  │
│  │  데이터: 수집 스크립트 stdout/stderr, 에러 트레이스백                │  │
│  │  보존: 30일 (raw) → 1년 (압축)                                     │  │
│  │  쿼리: LogQL 또는 전문 검색                                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [5] 트레이스 → Tempo (또는 Jaeger)                                │  │
│  │                                                                    │  │
│  │  용도: 분산 추적 데이터 (OTel 연동 시)                              │  │
│  │  데이터: Span 데이터, 서비스 맵 생성 소스                           │  │
│  │  보존: 7일 (raw) → 30일 (샘플링)                                   │  │
│  │  쿼리: TraceQL                                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [6] 원격 CLI 감사 로그 → PostgreSQL + S3                          │  │
│  │                                                                    │  │
│  │  용도: 원격 터미널 세션 기록, 컴플라이언스 감사                      │  │
│  │  데이터: 세션 ID, 사용자, 명령 입출력, 타임스탬프                    │  │
│  │  보존: 90일 (DB 인덱스) + 1년 (S3 아카이브)                        │  │
│  │  쿼리: 세션/사용자/시간 기반 SQL 검색                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.2 데이터 흐름 — Collector 출력 → 저장소 매핑

```
Collector 출력 분류:

[OS Collector]
  ├── 시계열 메트릭 (CPU/MEM/DISK/NET 수치) ──▶ [1] Prometheus
  ├── 프로세스 목록 (스냅샷) ──────────────────▶ [2] S3/MinIO
  └── 시스템 정보 (OS 버전 등) ────────────────▶ [3] PostgreSQL

[WEB/WAS/DB Collector]
  ├── 성능 메트릭 (TPS, 커넥션 수 등) ─────────▶ [1] Prometheus
  ├── 설정 파일 스냅샷 (nginx.conf 등) ────────▶ [2] S3/MinIO
  ├── 로그 스냅샷 (에러 로그 최근 N건) ────────▶ [4] Loki
  └── 미들웨어 메타정보 (버전, 포트 등) ───────▶ [3] PostgreSQL

[AI-GPU Collector]
  ├── GPU 시계열 (VRAM, 온도, 전력, SM%) ──────▶ [1] Prometheus
  ├── GPU 스냅샷 (전체 nvidia-smi 출력) ───────▶ [2] S3/MinIO
  └── 모델 서빙 상태 (Health, 큐 길이) ────────▶ [1] Prometheus + [2] S3

[AI-LLM Collector]
  ├── 토큰 사용 메트릭 (토큰 수, 비용) ────────▶ [1] Prometheus
  ├── 설정 스냅샷 (Agent 설정, Rate Limit) ────▶ [2] S3/MinIO
  └── 프롬프트 메타데이터 (버전, 해시) ────────▶ [3] PostgreSQL

[OTel Metrics Collector]
  └── 메트릭 스냅샷 (TTFT, TPS 등) ───────────▶ [2] S3/MinIO (Evidence)
```

### 7.3 DB 스키마 (PostgreSQL — 핵심 테이블)

```sql
-- 에이전트 관리
CREATE TABLE agents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    project_id    UUID NOT NULL REFERENCES projects(id),
    hostname      VARCHAR(255) NOT NULL,
    agent_version VARCHAR(20) NOT NULL,
    os_type       VARCHAR(50) NOT NULL,    -- linux, windows, aix
    os_version    VARCHAR(100),
    status        VARCHAR(20) NOT NULL DEFAULT 'registered',
    mode          VARCHAR(20) NOT NULL DEFAULT 'full',
    last_heartbeat TIMESTAMPTZ,
    last_collection TIMESTAMPTZ,
    config_json   JSONB,                   -- 원격 설정 오버라이드
    privilege_report JSONB,                -- 최신 권한 리포트
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_agent_tenant_host UNIQUE(tenant_id, hostname)
);

-- 에이전트 플러그인 상태
CREATE TABLE agent_plugins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    plugin_id     VARCHAR(50) NOT NULL,    -- ai-llm-agent, ai-gpu-serving, ...
    version       VARCHAR(20) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'inactive',
    items_covered TEXT[],                  -- {ITEM0200, ITEM0201, ...}
    auto_detected BOOLEAN DEFAULT FALSE,
    config_json   JSONB,
    last_collect  TIMESTAMPTZ,

    CONSTRAINT uq_agent_plugin UNIQUE(agent_id, plugin_id)
);

-- 수집 이력
CREATE TABLE collection_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL,
    project_id        UUID NOT NULL,
    agent_id          UUID NOT NULL REFERENCES agents(id),
    job_type          VARCHAR(20) NOT NULL,  -- scheduled, manual, emergency
    status            VARCHAR(20) NOT NULL,  -- queued, running, completed, failed
    total_items       INT NOT NULL,
    success_items     INT DEFAULT 0,
    failed_items      INT DEFAULT 0,
    skipped_items     INT DEFAULT 0,
    errors            JSONB,                 -- 수집 오류 배열 (권한 부족 등)
    evidence_s3_path  VARCHAR(500),          -- S3 저장 경로
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    duration_ms       INT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 진단 결과
CREATE TABLE diagnostic_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    project_id      UUID NOT NULL,
    host_id         UUID NOT NULL,
    collection_job_id UUID REFERENCES collection_jobs(id),
    executed_at     TIMESTAMPTZ NOT NULL,
    total_items     INT NOT NULL,
    report_url      VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 진단 항목별 결과
CREATE TABLE diagnostic_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id       UUID NOT NULL REFERENCES diagnostic_results(id) ON DELETE CASCADE,
    item_id         VARCHAR(20) NOT NULL,   -- ITEM0200
    item_name       VARCHAR(200) NOT NULL,
    category        VARCHAR(5) NOT NULL,    -- it, ai
    area            VARCHAR(20) NOT NULL,   -- stability, efficiency, maintainability
    severity        VARCHAR(10) NOT NULL,   -- good, warning, critical
    score           INT CHECK (score BETWEEN 0 AND 100),
    summary         TEXT,
    recommendations JSONB,
    related_metrics TEXT[],                 -- OTel 메트릭명
    evidence_refs   JSONB,                  -- Evidence S3 경로 참조

    CONSTRAINT uq_result_item UNIQUE(result_id, item_id)
);

-- 원격 CLI 감사 로그
CREATE TABLE terminal_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id       UUID NOT NULL REFERENCES agents(id),
    user_id        UUID NOT NULL,
    user_role      VARCHAR(20) NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL,
    ended_at       TIMESTAMPTZ,
    duration_sec   INT,
    command_count  INT DEFAULT 0,
    audit_log_path VARCHAR(500),            -- S3 상세 로그 경로
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_agents_tenant_status ON agents(tenant_id, status);
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_collection_jobs_agent ON collection_jobs(agent_id, created_at DESC);
CREATE INDEX idx_diagnostic_items_result ON diagnostic_items(result_id);
CREATE INDEX idx_diagnostic_items_item ON diagnostic_items(item_id, severity);
CREATE INDEX idx_terminal_sessions_agent ON terminal_sessions(agent_id, started_at DESC);
```

### 7.4 데이터 보존 정책

| 데이터 유형 | 저장소 | Hot (즉시 조회) | Warm (지연 조회) | Cold (아카이브) |
|-----------|--------|:-------------:|:-------------:|:-------------:|
| 시계열 메트릭 | Prometheus | 15일 (raw, 10초) | 6개월 (5분 다운샘플) | 2년 (1시간 다운샘플) |
| 진단 Evidence | S3/MinIO | 90일 (Standard) | 1년 (IA) | 5년 (Glacier) |
| 관계형 메타 | PostgreSQL | 영구 (최근 1년 인덱스 최적화) | — | 파티셔닝 후 아카이브 |
| 로그 | Loki | 30일 (raw) | 1년 (압축) | — |
| 트레이스 | Tempo | 7일 (raw) | 30일 (샘플링) | — |
| 감사 로그 | PG + S3 | 90일 (DB) | 1년 (S3) | 5년 (컴플라이언스) |

### 7.5 Lite 모드 (단일 서버) 저장소

```
Lite 모드 (docker-compose 단일 서버):

┌──────────────────────────────────────────────────────┐
│ Docker Compose — 단일 서버                             │
│                                                        │
│  [1] Prometheus (단일 노드, 15일 보존)                  │
│  [2] MinIO (로컬 볼륨, 프로젝트 기간 보존)              │
│  [3] PostgreSQL (단일 인스턴스)                          │
│  [4] Loki (단일 노드, 7일 보존)                         │
│  [5] 트레이스: 비활성 (Lite에서 선택적)                  │
│                                                        │
│  디스크 요구: 서버 20대 × 86항목 × 월간 수집 ≈ 50GB     │
│  메모리 요구: 8GB 이상                                  │
│  CPU 요구: 4 코어 이상                                  │
└──────────────────────────────────────────────────────┘
```

### 7.6 StorageBackend 인터페이스 설계

Evidence(진단 스냅샷·설정 파일 등) 파일 저장은 **StorageBackend 인터페이스**를 통해 추상화하여, S3 호환 스토리지와 로컬 파일시스템을 동일하게 다룬다. Prometheus 시계열·Loki 로그·Tempo 트레이스는 기존 설계(§7.1~7.4)를 그대로 따른다.

#### 인터페이스 정의 (Go)

```go
// pkg/storage/backend.go

package storage

import (
    "context"
    "io"
    "time"
)

// StorageEntry — 저장된 파일의 메타 정보
type StorageEntry struct {
    Key          string            // 논리적 경로 (예: tenants/t1/jobs/j1/nginx.conf.json)
    Size         int64             // 바이트
    LastModified time.Time
    Metadata     map[string]string // 수집 시각, 에이전트 ID, ITEM ID 등
}

// StorageBackend — Evidence 파일 저장소 추상 인터페이스
//
// 구현체: S3Backend · LocalBackend · DualBackend
type StorageBackend interface {
    // Put — key 위치에 data를 저장하고 접근 가능한 참조 URL(또는 경로)을 반환
    Put(ctx context.Context, key string, data []byte, metadata map[string]string) (ref string, err error)

    // PutStream — 대용량 파일 스트림 저장 (io.Reader)
    PutStream(ctx context.Context, key string, r io.Reader, size int64, metadata map[string]string) (ref string, err error)

    // Get — key에 해당하는 파일 내용 반환
    Get(ctx context.Context, key string) ([]byte, error)

    // List — prefix로 시작하는 파일 목록 반환
    List(ctx context.Context, prefix string) ([]StorageEntry, error)

    // Delete — 지정 key 파일 삭제
    Delete(ctx context.Context, key string) error

    // Purge — retentionDays 이전에 생성된 파일 일괄 삭제 (보존 정책 적용)
    Purge(ctx context.Context, before time.Time) (deletedCount int, err error)

    // Type — 백엔드 식별자 ("s3" | "local" | "dual")
    Type() string
}
```

#### S3Backend

```go
// pkg/storage/s3_backend.go

package storage

import (
    "bytes"
    "context"
    "fmt"
    "io"
    "time"

    "github.com/minio/minio-go/v7"
    "github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Backend — AWS S3 / MinIO / GCS 호환 스토리지 구현체
type S3Backend struct {
    client    *minio.Client
    bucket    string
    publicURL string // 선택적 — Evidence URL 생성용
}

func NewS3Backend(cfg S3Config) (*S3Backend, error) {
    client, err := minio.New(cfg.Endpoint, &minio.Options{
        Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
        Secure: cfg.UseSSL,
        Region: cfg.Region,
    })
    if err != nil {
        return nil, fmt.Errorf("s3 init: %w", err)
    }
    return &S3Backend{client: client, bucket: cfg.Bucket, publicURL: cfg.PublicURL}, nil
}

func (b *S3Backend) Put(ctx context.Context, key string, data []byte, metadata map[string]string) (string, error) {
    opts := minio.PutObjectOptions{ContentType: "application/json", UserMetadata: metadata}
    _, err := b.client.PutObject(ctx, b.bucket, key, bytes.NewReader(data), int64(len(data)), opts)
    if err != nil {
        return "", fmt.Errorf("s3 put %s: %w", key, err)
    }
    return fmt.Sprintf("s3://%s/%s", b.bucket, key), nil
}

func (b *S3Backend) Purge(ctx context.Context, before time.Time) (int, error) {
    // ListObjects → before 이전 객체 삭제 (배치 처리)
    // ... (구현 생략)
    return 0, nil
}

func (b *S3Backend) Type() string { return "s3" }

// PutStream, Get, List, Delete — minio-go SDK 표준 API 활용
```

#### LocalBackend

```go
// pkg/storage/local_backend.go

package storage

import (
    "context"
    "fmt"
    "io"
    "os"
    "path/filepath"
    "time"
)

// LocalBackend — 로컬 파일시스템 저장 구현체
//
// 디렉터리 구조: {basePath}/{key}
// 예) /var/aitop/data/tenants/t1/jobs/j1/nginx.conf.json
type LocalBackend struct {
    basePath      string
    retentionDays int
}

func NewLocalBackend(cfg LocalConfig) (*LocalBackend, error) {
    if err := os.MkdirAll(cfg.BasePath, 0750); err != nil {
        return nil, fmt.Errorf("local storage mkdir %s: %w", cfg.BasePath, err)
    }
    return &LocalBackend{basePath: cfg.BasePath, retentionDays: cfg.RetentionDays}, nil
}

func (b *LocalBackend) Put(ctx context.Context, key string, data []byte, metadata map[string]string) (string, error) {
    absPath := filepath.Join(b.basePath, filepath.FromSlash(key))
    if err := os.MkdirAll(filepath.Dir(absPath), 0750); err != nil {
        return "", fmt.Errorf("local mkdir: %w", err)
    }
    if err := os.WriteFile(absPath, data, 0640); err != nil {
        return "", fmt.Errorf("local write %s: %w", key, err)
    }
    return "file://" + absPath, nil
}

func (b *LocalBackend) Purge(ctx context.Context, before time.Time) (int, error) {
    // filepath.Walk → ModTime < before → os.Remove
    count := 0
    _ = filepath.Walk(b.basePath, func(path string, info os.FileInfo, err error) error {
        if err != nil || info.IsDir() {
            return nil
        }
        if info.ModTime().Before(before) {
            if removeErr := os.Remove(path); removeErr == nil {
                count++
            }
        }
        return nil
    })
    return count, nil
}

func (b *LocalBackend) Type() string { return "local" }

// PutStream, Get, List, Delete — os 패키지 표준 파일 I/O 활용
```

#### DualBackend

```go
// pkg/storage/dual_backend.go

package storage

import (
    "context"
    "io"
    "time"
)

// DualBackend — S3 + Local 동시 저장 구현체
//
// 두 백엔드 모두 Put 성공 시에만 성공으로 처리.
// 운영 환경의 고가용성 + 로컬 빠른 읽기가 동시에 필요한 경우 사용.
type DualBackend struct {
    primary   StorageBackend // S3Backend
    secondary StorageBackend // LocalBackend
}

func NewDualBackend(primary, secondary StorageBackend) *DualBackend {
    return &DualBackend{primary: primary, secondary: secondary}
}

func (b *DualBackend) Put(ctx context.Context, key string, data []byte, metadata map[string]string) (string, error) {
    ref, err := b.primary.Put(ctx, key, data, metadata)
    if err != nil {
        return "", err
    }
    // secondary 실패는 경고 로그만 남기고 계속 (비동기 재시도 가능)
    if _, secErr := b.secondary.Put(ctx, key, data, metadata); secErr != nil {
        // log.Warn("dual backend secondary write failed", "key", key, "err", secErr)
        _ = secErr
    }
    return ref, nil
}

func (b *DualBackend) Purge(ctx context.Context, before time.Time) (int, error) {
    n1, _ := b.primary.Purge(ctx, before)
    n2, _ := b.secondary.Purge(ctx, before)
    return n1 + n2, nil
}

func (b *DualBackend) Type() string { return "dual" }

// Get — primary 우선, 실패 시 secondary fallback
// List, Delete — primary + secondary 동기화 처리
```

#### 설정 스키마 (server.yaml)

```yaml
# server.yaml (Collection Server 설정)

storage:
  # "s3"   — S3 호환 스토리지만 사용 (프로덕션 권장)
  # "local" — 로컬 파일시스템만 사용 (개발/테스트 환경)
  # "both"  — S3 + 로컬 동시 저장 (DualBackend)
  type: "local"

  s3:
    endpoint:   "http://minio:9000"   # AWS S3는 빈 문자열 (기본 엔드포인트 사용)
    bucket:     "aitop-evidence"
    access-key: "minioadmin"
    secret-key: "minioadmin"
    region:     "us-east-1"
    use-ssl:    false                 # MinIO 로컬: false / AWS: true
    path-style: true                  # MinIO 호환: true / AWS S3: false

  local:
    base-path:      "/var/aitop/data" # Evidence 저장 루트 디렉터리
    retention-days: 30                # 이 일수 이상 된 파일 자동 정리 (0 = 비활성)
```

#### StorageBackend 팩토리

```go
// pkg/storage/factory.go

package storage

import "fmt"

// NewFromConfig — server.yaml의 storage 섹션을 읽어 적절한 구현체 반환
func NewFromConfig(cfg StorageConfig) (StorageBackend, error) {
    switch cfg.Type {
    case "s3":
        return NewS3Backend(cfg.S3)
    case "local":
        return NewLocalBackend(cfg.Local)
    case "both":
        s3, err := NewS3Backend(cfg.S3)
        if err != nil {
            return nil, fmt.Errorf("dual backend s3: %w", err)
        }
        local, err := NewLocalBackend(cfg.Local)
        if err != nil {
            return nil, fmt.Errorf("dual backend local: %w", err)
        }
        return NewDualBackend(s3, local), nil
    default:
        return nil, fmt.Errorf("unknown storage type %q (must be s3|local|both)", cfg.Type)
    }
}
```

#### DB 스키마 연계

`collection_jobs.evidence_storage_path` 컬럼은 StorageBackend가 반환한 **참조 URL**을 저장한다. 백엔드 유형에 따라 형식이 달라진다:

| 백엔드 | 참조 URL 예시 |
|--------|-------------|
| S3Backend | `s3://aitop-evidence/tenants/t1/jobs/j1/nginx.json` |
| LocalBackend | `file:///var/aitop/data/tenants/t1/jobs/j1/nginx.json` |
| DualBackend | S3 primary URL (s3://) 반환 |

> **기존 컬럼명**: `evidence_s3_path` → 새 구현에서는 `evidence_storage_path`로 마이그레이션 권장.
> 현재 MVP(인메모리/단일 MinIO) 환경에서는 `evidence_s3_path` 유지 가능.

#### 환경별 권장 설정

| 환경 | `storage.type` | 이유 |
|------|---------------|------|
| 로컬 개발 / 테스트 | `local` | S3/MinIO 컨테이너 불필요, 디스크 직접 확인 가능 |
| CI / E2E 자동화 | `local` | 외부 의존 없이 파이프라인 독립 실행 |
| 단일 서버 Lite 운영 | `local` 또는 `s3` (MinIO) | 요구사항에 따라 선택 |
| 프로덕션 (멀티 서버) | `s3` | 고가용성, 스케일아웃, 수명주기 정책 |
| 프로덕션 + 로컬 캐시 | `both` | S3 기본 + 로컬 빠른 읽기 (선택적) |

---

## 8. UI 화면 연동 — 에이전트 수집 데이터 기반 동작

UI_DESIGN.md의 각 화면이 에이전트에서 수집한 데이터로 어떻게 동작하는지 매핑한다.

### 8.1 UI 화면 ↔ Collector ↔ 저장소 매핑

| UI 화면 (UI_DESIGN.md 참조) | 데이터 소스 Collector | 저장소 | 갱신 방식 |
|----------------------------|---------------------|--------|---------|
| **홈 > Executive Dashboard** | 전체 Collector 집계 | Prometheus + PG | WS push 5초 |
| **프로젝트 대시보드 > KPI 카드** | OS + WAS + AI-GPU + AI-LLM | Prometheus | WS push 5초 |
| **프로젝트 대시보드 > 서비스 헬스맵** | OS + WAS + OTel | Prometheus + PG | WS push 10초 |
| **프로젝트 대시보드 > AI 서비스 요약** | AI-GPU + AI-LLM + OTel | Prometheus | WS push 5초 |
| **인프라 > 호스트 목록** | OS Collector | Prometheus + PG | WS push 10초 |
| **인프라 > 호스트 상세 > CPU/MEM/DISK** | OS Collector | Prometheus | WS push 5초 |
| **인프라 > 호스트 상세 > GPU 카드** | AI-GPU Collector | Prometheus | WS push 5초 |
| **인프라 > 호스트 상세 > 미들웨어 상태** | WEB/WAS/DB Collector | PG + Prometheus | Polling 30초 |
| **인프라 > 호스트 상세 > 프로세스** | OS Collector | Prometheus | Polling 10초 |
| **서비스 맵 (토폴로지)** | OTel Traces | Tempo + PG | Polling 30초 |
| **서비스 상세 > 골든 시그널** | OTel Metrics | Prometheus | WS push 5초 |
| **서비스 상세 > XLog** | OTel Traces | Tempo | WS push 1초 |
| **서비스 상세 > 엔드포인트 Top 10** | OTel Traces | Tempo + Prometheus | Polling 10초 |
| **AI 서비스 > 개요** | AI-GPU + AI-LLM + OTel | Prometheus | WS push 5초 |
| **AI 서비스 > LLM 성능 (TTFT, TPS)** | AI-LLM + OTel Metrics | Prometheus | WS push 5초 |
| **AI 서비스 > GPU 클러스터 뷰** | AI-GPU Collector | Prometheus | WS push 5초 |
| **AI 서비스 > RAG 파이프라인** | AI-LLM + AI-VectorDB + OTel | Prometheus + S3 | WS push 5초 |
| **AI 서비스 > Agent 실행 모니터링** | AI-LLM + OTel Traces | Tempo | Polling 10초 |
| **AI 서비스 > 가드레일 분석** | AI-LLM Collector | Prometheus | WS push 10초 |
| **에이전트 관리 > Fleet 대시보드** | Heartbeat | PG | WS push 30초 |
| **에이전트 관리 > 수집 작업 현황** | Collection Jobs | PG | WS push 10초 |
| **에이전트 관리 > 플러그인 상태** | Plugin Status | PG | Polling 30초 |
| **에이전트 관리 > 원격 터미널** | Remote Shell | WebSocket stream | 실시간 |
| **진단 보고서 > IT 진단 (55개)** | IT Collectors → Evidence | S3 + PG | Polling (진단 중) |
| **진단 보고서 > AI 진단 (31개)** | AI Collectors → Evidence | S3 + PG | Polling (진단 중) |
| **진단 보고서 > 교차 분석** | IT + AI Collectors → Evidence | S3 + PG | 진단 완료 시 |
| **알림 > 인시던트 타임라인** | 전체 (Prometheus Alert → PG) | PG | WS push 즉시 |
| **트레이스 탐색 > 워터폴** | OTel Traces | Tempo | Polling |
| **로그 탐색** | OS/WEB/WAS Collector 로그 | Loki | Polling |
| **메트릭 탐색기** | 전체 Collector 메트릭 | Prometheus | Polling |

### 8.2 실시간 데이터 흐름 (에이전트 → UI)

```
[에이전트 수집 → UI 표시 경로]

경로 1: 시계열 메트릭 (실시간)
  Agent → Prometheus Remote Write → Prometheus → Backend Query API → WebSocket → UI 차트

경로 2: 진단 Evidence (배치)
  Agent → gRPC Push → Collection Server → S3 저장 → Event Bus
  → Diagnosis Engine (86개 항목) → PostgreSQL 결과 저장 → REST API → UI 진단 뷰

경로 3: 에이전트 상태 (Heartbeat)
  Agent → gRPC Heartbeat (30초) → Collection Server → PostgreSQL 갱신
  → WebSocket push → UI Fleet Dashboard

경로 4: 원격 CLI (실시간 스트리밍)
  Browser xterm.js → WebSocket → Backend Proxy → gRPC Stream → Agent PTY
  Agent PTY stdout → gRPC Stream → Backend Proxy → WebSocket → xterm.js
```

### 8.3 데이터 소스 전환 (에이전트 없는 환경)

에이전트가 설치되지 않은 환경에서도 UI가 동작해야 한다:

| 데이터 소스 | 에이전트 있음 | 에이전트 없음 (OTel만) | 둘 다 없음 |
|-----------|:-----------:|:-------------------:|:---------:|
| 시계열 메트릭 | Agent → Prometheus | OTel SDK → Prometheus | 수동 입력 불가 |
| 진단 Evidence | Agent 자동 수집 | 수집 스크립트 → ZIP 업로드 | 수집 스크립트 → ZIP 업로드 |
| 호스트 정보 | Agent 자동 등록 | node_exporter | 수동 등록 |
| 원격 CLI | Agent 경유 | 불가 (SSH 직접 사용) | 불가 |
| 서비스 맵 | OTel + Agent | OTel | 수동 구성 |

---

## 9. 통신 프로토콜 및 보안

### 9.1 프로토콜 스택

```
┌──────────────────────────────────────────────────────────────┐
│                      Application Layer                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │Collection │ │Heartbeat │ │Remote CLI│ │OTA Update      │ │
│  │(Evidence) │ │(Status)  │ │(Terminal)│ │(Binary/Plugin) │ │
│  └──────┬───┘ └──────┬───┘ └──────┬───┘ └──────┬─────────┘ │
│         │            │            │             │            │
│  ┌──────▼────────────▼────────────▼─────────────▼──────────┐ │
│  │              gRPC (Protobuf)                               │ │
│  │  CollectionService / HeartbeatService / TerminalService   │ │
│  │  UpdateService                                             │ │
│  └──────────────────────┬────────────────────────────────────┘ │
│                         │                                      │
│  ┌──────────────────────▼────────────────────────────────────┐ │
│  │              TLS 1.3 (mTLS 상호 인증)                       │ │
│  │  Agent Certificate + Server Certificate                    │ │
│  └──────────────────────┬────────────────────────────────────┘ │
│                         │                                      │
│  ┌──────────────────────▼────────────────────────────────────┐ │
│  │              TCP / HTTP/2                                   │ │
│  │  Port: 443 (HTTPS fallback) / 50051 (gRPC direct)        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 보안 설계

| 영역 | 위협 | 대응 |
|------|------|------|
| 통신 암호화 | 데이터 도청/변조 | TLS 1.3 필수, HSTS |
| 에이전트 인증 | 위조 에이전트 접속 | mTLS 상호 인증, 에이전트별 고유 인증서 |
| API Key 보호 | 수집 시 LLM API key 평문 전송 | Sanitizer 1차 마스킹 + Collection Server 2차 검증 |
| PII 보호 | 프롬프트/로그에 개인정보 | Sanitizer 패턴 매칭 + 미마스킹 시 QUARANTINED |
| 원격 CLI | 비인가 접근, 위험 명령 | RBAC + 명령 필터링 + 감사 로그 |
| OTA 업데이트 | 악성 바이너리 | 코드 서명(Ed25519) + 체크섬 검증 |
| 에이전트 권한 | 과도한 시스템 접근 | 최소 권한 원칙, 전용 서비스 계정(aitop-agent) |
| GPU 자원 | 수집 에이전트의 GPU 점유 | nvidia-smi 읽기 전용, CUDA 연산 수행 금지 |

### 9.3 인증서 관리

```
에이전트 인증서 발급 흐름:

1. 에이전트 최초 설치 시 CSR(Certificate Signing Request) 생성
2. 등록 토큰(프로젝트별 1회용)과 함께 CSR을 Collection Server에 제출
3. Collection Server가 내부 CA로 인증서 서명 후 반환
4. 에이전트는 서명된 인증서로 mTLS 연결 수립
5. 인증서 갱신: 만료 30일 전 자동 갱신 (gRPC RPC)

인증서 저장 위치:
  Linux:   /etc/aitop-agent/certs/
  Windows: C:\ProgramData\aitop-agent\certs\
```

---

## 10. 배포 및 설치

### 10.1 설치 방법

```
── Linux (DEB/RPM) ──

# Debian/Ubuntu
curl -fsSL https://packages.aitop.io/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/aitop.gpg
echo "deb [signed-by=/usr/share/keyrings/aitop.gpg] https://packages.aitop.io/apt stable main" | \
  sudo tee /etc/apt/sources.list.d/aitop.list
sudo apt update && sudo apt install aitop-agent

# RHEL/CentOS
sudo yum install -y https://packages.aitop.io/rpm/aitop-agent-latest.rpm

# 설정 및 시작
sudo vi /etc/aitop-agent/agent.yaml   # server_url, project_token 설정
sudo systemctl enable --now aitop-agent


── Windows (MSI) ──

# PowerShell (관리자)
Invoke-WebRequest -Uri https://packages.aitop.io/msi/aitop-agent-latest.msi -OutFile aitop-agent.msi
Start-Process msiexec.exe -ArgumentList '/i aitop-agent.msi /quiet' -Wait

# 설정
notepad C:\ProgramData\aitop-agent\agent.yaml
Restart-Service aitop-agent


── 단일 바이너리 (포터블) ──

# Linux
curl -O https://releases.aitop.io/agent/aitop-agent-linux-amd64
chmod +x aitop-agent-linux-amd64
./aitop-agent-linux-amd64 --mode=collect-only --server=https://aitop.company.com --token=xxx


── Docker ──

docker run -d --name aitop-agent \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -v /etc/aitop-agent:/etc/aitop-agent \
  --pid=host --net=host \
  aitop/agent:latest
```

### 10.2 설정 파일 구조

```yaml
# /etc/aitop-agent/agent.yaml
agent:
  id: ""                          # 자동 생성 (최초 등록 시)
  mode: "full"                    # full, collect-only, collect-export

server:
  url: "https://collection.aitop.company.com:50051"
  project_token: "proj_xxxxx"     # 프로젝트 등록 토큰
  tls:
    cert: "/etc/aitop-agent/certs/agent.crt"
    key: "/etc/aitop-agent/certs/agent.key"
    ca: "/etc/aitop-agent/certs/ca.crt"

schedule:
  default: "0 */6 * * *"         # 6시간마다 기본 수집
  metrics: "*/60 * * * * *"      # 60초마다 메트릭 수집 (Prometheus Remote Write)

collectors:
  os:
    enabled: true
  web:
    enabled: true
    config_paths: ["/etc/nginx", "/etc/httpd"]
  was:
    enabled: true
  db:
    enabled: true
    connections:
      - type: "postgresql"
        host: "localhost"
        port: 5432
        user: "aitop_readonly"
        password_env: "AITOP_DB_PASSWORD"  # 환경변수 참조
  ai_llm:
    enabled: auto                 # 자동 탐지
  ai_gpu:
    enabled: auto
  ai_vectordb:
    enabled: auto
  otel_metrics:
    enabled: false
    prometheus_url: "http://localhost:9090"

remote_shell:
  enabled: true
  allowed_roles: ["admin", "sre"]
  max_sessions: 3
  idle_timeout: 600
  blocked_commands:
    - "rm -rf /"
    - "shutdown"
    - "reboot"

buffer:
  path: "/var/lib/aitop-agent/buffer.db"
  max_size_mb: 500

logging:
  level: "info"
  path: "/var/log/aitop-agent/agent.log"
  max_size_mb: 100
  max_backups: 5
```

---

## 11. API 명세

### 11.1 Collection Server REST API (Fleet Management)

```
/api/v1/fleet
├── POST   /agents/register                       # 에이전트 등록
├── GET    /agents                                # 에이전트 목록 (필터: project, status, os, group)
├── GET    /agents/{agentId}                      # 에이전트 상세
├── PATCH  /agents/{agentId}                      # 에이전트 메타 변경 (그룹 할당 포함)
├── DELETE /agents/{agentId}                      # 에이전트 삭제 (retire)
├── POST   /agents/{agentId}/collect              # 즉시 수집 트리거
├── GET    /agents/{agentId}/privileges           # 권한 리포트 조회
│
├── GET    /agents/{agentId}/config               # 에이전트 현재 설정 조회 (기본값 포함 전체 스키마)
├── PUT    /agents/{agentId}/config               # 에이전트 설정 저장 (신규 revision 생성)
├── POST   /agents/{agentId}/config/reload        # 설정 즉시 폴링 트리거 (Hot Reload)
├── GET    /agents/{agentId}/config/history       # 설정 변경 이력 목록
├── POST   /agents/{agentId}/config/rollback      # 특정 revision으로 설정 롤백
├── POST   /agents/{agentId}/restart              # 에이전트 원격 재기동 (🟡 AgentRestart)
│
├── GET    /groups                                # 서버 그룹 목록 (프로젝트별)
├── POST   /groups                                # 새 그룹 생성
├── GET    /groups/{groupId}                      # 그룹 상세 (소속 에이전트 목록, KPI)
├── PUT    /groups/{groupId}                      # 그룹 정보 수정
├── DELETE /groups/{groupId}                      # 그룹 삭제
├── POST   /groups/{groupId}/agents               # 그룹에 에이전트 할당
├── DELETE /groups/{groupId}/agents/{agentId}     # 그룹에서 에이전트 제거
├── GET    /groups/{groupId}/dashboard            # 그룹 대시보드 데이터 (KPI + 서버 목록 + 헬스)
│
├── GET    /config/schema                         # 에이전트 설정 스키마 (버전별, 반영수준 포함)
│
├── GET    /plugins                               # 플러그인 목록
├── POST   /plugins/deploy                        # 플러그인 배포 (그룹 단위)
│
├── GET    /jobs                                  # 수집 작업 목록
├── GET    /jobs/{jobId}                          # 수집 작업 상세 (진행률, 오류)
│
├── POST   /updates/rollout                       # OTA 업데이트 배포 시작
├── GET    /updates/status                        # 업데이트 진행 상태
├── POST   /updates/rollback                      # 롤백 실행
│
└── WS     /agents/{agentId}/terminal             # 원격 터미널 WebSocket
```

### 11.2 gRPC 서비스 정의

```protobuf
// aitop_agent.proto

service CollectionService {
  // 에이전트 → 서버: 수집 데이터 스트리밍 전송
  rpc PushCollectedData(stream CollectedDataChunk) returns (PushResponse);

  // 에이전트 → 서버: Evidence 파일 업로드
  rpc UploadEvidence(stream EvidenceChunk) returns (UploadResponse);
}

service HeartbeatService {
  // 에이전트 → 서버: 주기적 상태 보고 + 서버 → 에이전트: 대기 명령 반환
  rpc SendHeartbeat(Heartbeat) returns (HeartbeatResponse);
}

service TerminalService {
  // 양방향 스트리밍: 원격 CLI 세션
  rpc OpenSession(stream TerminalInput) returns (stream TerminalOutput);
}

service UpdateService {
  // 에이전트 → 서버: 업데이트 확인
  rpc CheckUpdate(UpdateCheckRequest) returns (UpdateCheckResponse);

  // 에이전트 → 서버: 바이너리/플러그인 다운로드
  rpc DownloadUpdate(DownloadRequest) returns (stream DownloadChunk);

  // 에이전트 → 서버: 업데이트 결과 보고
  rpc ReportUpdateResult(UpdateResult) returns (Empty);
}

service ConfigService {
  // 에이전트 → 서버: 최신 설정 가져오기 (Heartbeat Response에 포함되거나 직접 호출)
  rpc GetConfig(ConfigRequest) returns (ConfigResponse);
}

// HeartbeatResponse 확장 — 재기동 명령 추가
// message HeartbeatResponse (기존 정의 확장):
//   repeated RemoteCommand commands = 1;  // RESTART_AGENT 명령 포함 가능
//   ConfigUpdate config_update = 2;       // 변경된 설정 (reload_level 포함)
//   UpdateNotification update_available = 3;
//
// message ConfigUpdate {
//   string revision = 1;                  // 설정 revision ID
//   bytes config_yaml = 2;               // 전체 설정 YAML
//   repeated string hot_reload_keys = 3; // 🟢 즉시 반영 가능한 키 목록
//   repeated string restart_keys = 4;    // 🟡 재기동 필요 키 목록
// }
//
// enum RemoteCommandType {
//   COLLECT_NOW = 0;
//   RESTART_AGENT = 1;  // 🟡 에이전트 재기동
//   // 🔴 App Restart는 원격 명령 없음 — UI 안내만 제공
// }
```

---

## 12. 구현 로드맵

### Phase F: 에이전트 MVP (6주)

| # | 작업 | 산출물 | 주 |
|---|------|--------|---|
| F-1 | Agent Core 프레임워크 (Go) | 기본 바이너리, Config, Scheduler | 1-2 |
| F-2 | Collector 인터페이스 + OS Collector (Linux) | CPU/MEM/DISK/NET 수집 | 2-3 |
| F-3 | 권한 검증 시스템 (Privilege Checker) | 사전 권한 검증 + 오류 응답 구조화 | 3 |
| F-4 | Collection Server MVP | gRPC 수신 + S3 저장 + Agent Registry | 3-4 |
| F-5 | Heartbeat + Fleet 기본 UI | 에이전트 목록/상태 대시보드 | 4-5 |
| F-6 | AI-GPU Collector PoC | nvidia-smi 수집 (ITEM0220, ITEM0228) | 5 |
| F-7 | AI-LLM Collector PoC | LLM 설정/토큰 수집 (ITEM0201, ITEM0209) | 5-6 |
| F-8 | Prometheus Remote Write 연동 | 시계열 메트릭 → Prometheus | 6 |
| F-9 | collect-only 모드 | 1회 실행 수집 → HTTPS 전송 | 6 |

### Phase G: 에이전트 GA + 원격 CLI (8주)

| # | 작업 | 산출물 | 주 |
|---|------|--------|---|
| G-1 | WEB/WAS/DB Collector | MW 수집 Go 포팅 | 1-2 |
| G-2 | Windows Agent | Windows 네이티브 지원 | 2-3 |
| G-3 | AI-VectorDB Collector | Milvus/Chroma/Qdrant 수집 | 3-4 |
| G-4 | AI-LLM/Agent Collector 정식 | 전체 AA 항목 수집 | 4-5 |
| G-5 | **원격 CLI 구현** | PTY + gRPC Stream + xterm.js | 5-6 |
| G-6 | **RBAC + 감사 로그** | 역할 기반 접근 + 명령 기록 | 6-7 |
| G-7 | OTA 업데이트 + 단계 배포 | canary/staged rollout | 7 |
| G-8 | Fleet 관리 콘솔 완성 | 그룹 관리, 플러그인 배포, 수집 현황 | 7-8 |
| G-9 | OTel Metrics Collector | 모니터링 시스템 연동 | 8 |
| G-10 | collect-export 모드 | 오프라인 ZIP 내보내기 | 8 |

### Phase H: 고도화 (12주)

| # | 작업 | 산출물 |
|---|------|--------|
| H-1 | AIX/HP-UX/Solaris Agent | 레거시 Unix 지원 |
| H-2 | 증분 수집 + 오프라인 모드 | 변경분 감지, 로컬 버퍼링 → 자동 동기화 |
| H-3 | eBPF Plugin (선택적) | 커널 수준 AI 워크로드 프로파일링 |
| H-4 | Diagnostic Plugin (py-spy, pprof) | 런타임 프로파일링, Flamegraph |
| H-5 | 멀티테넌트 Fleet 관리 | SaaS 모델, 테넌트 격리 |
| H-6 | 원격 CLI 고급 기능 | 파일 전송, 세션 공유, 읽기 전용 모드 |

---

## 부록 A: Collector 전체 매핑표

| Collector | 대상 ITEM | UI 화면 | 수집 주기 | 저장소 | 필요 권한 |
|-----------|----------|---------|---------|--------|---------|
| OS | ITEM0036~0040, 0064, 0066 | 호스트 목록/상세 | 60초(메트릭), 6시간(Evidence) | Prometheus + StorageBackend¹ | read:/proc |
| WEB | ITEM0006~0009 | 미들웨어 상태 | 6시간 | StorageBackend¹ + PG | read:설정파일 |
| WAS | ITEM0010~0035 | 미들웨어 상태 | 6시간 | StorageBackend¹ + PG | exec:jcmd, read:설정파일 |
| DB | ITEM0050~0065 | DB 모니터링 | 6시간 | StorageBackend¹ + PG | net:DB접속, read:설정 |
| AI-LLM | ITEM0200~0204, 0209~0212, 0221~0223, 0230 | AI 서비스, LLM 성능, 가드레일 | 6시간 | StorageBackend¹ + Prometheus | exec:python3, read:설정 |
| AI-VectorDB | ITEM0205~0206, 0213~0216, 0224~0226 | RAG 파이프라인, VectorDB | 6시간 | StorageBackend¹ + Prometheus | exec:curl, read:설정 |
| AI-GPU | ITEM0207~0208, 0217~0220, 0227~0229 | GPU 클러스터, LLM 성능 | 60초(메트릭), 6시간(Evidence) | Prometheus + StorageBackend¹ | exec:nvidia-smi |
| OTel | ITEM0207 연동 | 전체 대시보드 보강 | 6시간(스냅샷) | StorageBackend¹ | net:Prometheus접근 |

> ¹ **StorageBackend**: `storage.type` 설정에 따라 S3Backend(s3) / LocalBackend(local) / DualBackend(both) 중 하나가 선택됨 (§7.6 참조)

## 부록 B: 에러 코드 정의

| 코드 | 의미 | HTTP equiv | 사용자 메시지 예 |
|------|------|-----------|--------------|
| `PERMISSION_DENIED` | 실행 권한 부족 | 403 | "nvidia-smi 실행 권한 없음 — video 그룹 추가 필요" |
| `NOT_INSTALLED` | 필요 도구 미설치 | 404 | "nvidia-smi가 설치되어 있지 않음 — nvidia-utils 패키지 설치" |
| `TIMEOUT` | 수집 시간 초과 | 408 | "DB 쿼리 30초 초과 — 슬로우 쿼리 또는 네트워크 확인" |
| `CONNECTION_REFUSED` | 네트워크 접근 불가 | 502 | "PostgreSQL 5432 포트 연결 불가 — 방화벽/리스너 확인" |
| `AUTH_FAILED` | 인증 실패 | 401 | "Oracle 접속 인증 실패 — 사용자명/비밀번호 확인" |
| `PARSE_ERROR` | 출력 파싱 실패 | 422 | "nginx -T 출력 파싱 실패 — 예상과 다른 형식" |
| `ENV_NOT_DETECTED` | AI 환경 미탐지 | 200 | "GPU 미탑재 서버 — AI-GPU Collector 비활성화 (정상)" |
| `PARTIAL_SUCCESS` | 부분 성공 | 206 | "GPU 메트릭 수집 성공, K8s 리소스 조회 실패 (kubeconfig 없음)" |
| `QUARANTINED` | 보안 정책 위반 | 451 | "수집 데이터에 마스킹되지 않은 API Key 감지 — 격리됨" |

---

> **다음 단계**: Phase F 구현 시작. Agent Core 프레임워크부터 OS Collector, 권한 검증 시스템 순서로 진행한다.
> Collection Server MVP와 병행하여 에이전트-서버 간 gRPC 통신을 조기에 검증한다.
