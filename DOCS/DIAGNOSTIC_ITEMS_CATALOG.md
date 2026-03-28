# AITOP 진단 항목 카탈로그 (Diagnostic Items Catalog)

> **Phase 31 설계 점검 문서** — 진단/수집 항목 전체 분류 및 수집 방식 관리 기준
> 최종 업데이트: 2026-03-28 (v1.3 AI Observability — AI 진단 항목 5종 추가 / Phase 38 완료 — 배치 프로세스 진단 항목 반영)
> 참고 디렉토리: `C:/aitop/02. Working/20260312_v.0.0.5/` (IT 55건), `Sample_AI_진단항목/` (AI 31건)
> 관련 문서: [AGENT_DESIGN.md](./AGENT_DESIGN.md) §3 Collector 체계, §12 진단 모드 | [METRICS_DESIGN.md](./METRICS_DESIGN.md) §13 미들웨어·Cache·MQ 메트릭

---

## 목차

1. [진단 항목 전체 카탈로그](#1-진단-항목-전체-카탈로그)
   - 1.1 [OS 기본](#11-os-기본-cpu-memory-disk-network-process)
   - 1.2 [GPU](#12-gpu-nvidia-amd-intel-apple)
   - 1.3 [WEB 서버](#13-web-서버-nginx-apache-iis)
   - 1.4 [WAS / 미들웨어](#14-was--미들웨어-tomcat-jboss-kestrel-express-gunicorn-go)
   - 1.5 [DB](#15-db-postgresql-mysql-oracle-mongodb)
   - 1.6 [Cache](#16-cache-redis-memcached)
   - 1.7 [MQ](#17-mq-kafka-rabbitmq)
   - 1.8 [AI 서비스](#18-ai-서비스-llm-vectordb-serving-otel-metrics)
   - 1.9 [보안 진단](#19-보안-진단-인증서-포트-방화벽-pii)
   - 1.10 [성능 진단](#110-성능-진단-connection-pool-thread-pool-event-loop-profiling)
2. [수집 방식별 특성 비교표](#2-수집-방식별-특성-비교표)
3. [진단 항목 변경 관리 방안](#3-진단-항목-변경-관리-방안)
4. [내장 vs 스크립트 판단 기준](#4-내장-vs-스크립트-판단-기준)

---

## 수집 방식 범례

### 출처 분류 (데이터 성격)

| 기호 | 설명 |
|------|------|
| 📊 | **메트릭** — 상시 모니터링, 시계열 데이터. Collector가 주기적으로 수집하여 Prometheus/시계열 DB에 저장 |
| 🔍 | **진단** — 진단 모드(`--mode=diagnose`)에서 수집. 설정·상태 스냅샷. Evidence ZIP으로 업로드 |
| 📊🔍 | **양쪽** — 상시 메트릭으로도, 진단 Evidence로도 수집. 메트릭 ID와 ITEM 번호 모두 보유 |

### 수집 방식 분류 (3가지)

| 분류 | 기호 | 설명 | 변경 시 재빌드 |
|------|------|------|:----------:|
| **내장 (Built-in)** | 🔧 | Go 에이전트 바이너리에 컴파일되어 포함. `/proc`, sysfs, API 호출 등. | 필요 |
| **스크립트 자동 (Script-Auto)** | 📜 | 에이전트가 주기적으로 자동 실행하는 외부 스크립트(`.sh`/`.ps1`/`.py`). 스크립트 파일만 교체하면 반영. | 불필요 |
| **스크립트 수동 (Script-Manual)** | 🖐️ | 사용자가 필요 시 수동으로 실행하는 진단 스크립트. 에이전트가 결과를 수집하거나 UI에서 트리거. | 불필요 |

> **현재 상태 (v.0.0.5)**: 모든 진단 항목은 `AITOP_linux-*-immediate.sh` / `AITOP_windows-*.ps1` 계열 스크립트로 수집 (🖐️ 진단 시 수동 트리거). Phase 31에서 Go 에이전트 통합 시 항목별로 🔧/📜/🖐️ 를 재분류한다.

### 가능한 수집 방식 (복수 표기)

| 키 | 설명 |
|----|------|
| `proc` | `/proc` 파일시스템 파싱 (Linux) |
| `sysfs` | `/sys` 파일시스템 파싱 (Linux) |
| `command` | 외부 명령 실행 (`nvidia-smi`, `jstack`, `sysctl`, `kubectl` 등) |
| `api` | HTTP/gRPC API 호출 (REST, Actuator, VectorDB 등) |
| `jmx` | Java JMX MBean 쿼리 |
| `jdbc` | 데이터베이스 드라이버 쿼리 (Go DB 드라이버 pgx/mysql/godror) |
| `config` | 설정 파일 파싱 (nginx.conf, my.cnf, agent.yaml 등) |
| `log` | 로그 파일 분석 (GC 로그, Access 로그, syslog 등) |
| `ebpf` | eBPF 프로브 (커널 레벨, `CAP_BPF` 필요) |
| `attach` | Runtime Attach (JVM Attach API, py-spy, CDP, dotnet-counters 등) |
| `script` | 외부 스크립트 실행 (커스텀 플러그인, MAT 파이프라인 등) |

### 변경 빈도

- **낮음**: 진단 로직 안정적, OS/DB 공식 인터페이스 기반
- **중간**: 버전/플랫폼 대응으로 간헐적 변경 발생
- **높음**: 비즈니스 정책·AI 파라미터 의존, 자주 변경됨

---

## 1. 진단 항목 전체 카탈로그

> **항목 현황 (v.0.0.5 기준)**: 진단 항목 IT 55건 (개발완료 53, 장기과제 12) + AI 31건 + AI Serving 5건 = 총 **91건**
> **상시 모니터링 메트릭**: OS 6종 + GPU 4종 + WEB 2종 + WAS/미들웨어 6종 + Cache 11종 + MQ 6종 = **35종** (ITEM 번호 없음, Collector 상시 수집)
> ITEM 번호가 없는 행 중 🔍 진단 항목은 Phase 31 에이전트 통합 시 신규 등록 예정. 📊 메트릭 항목은 에이전트 Collector가 상시 수집하는 시계열 데이터.

---

### 1.1 OS 기본 (CPU, Memory, Disk, Network, Process)

> 담당: **IA** (Infrastructure Architecture)
> 수집 스크립트(현행): `AITOP_linux-1.0-immediate.sh`, `AITOP_linux-1.0-delayed.sh`, `AITOP_windows-1.0-immediate.ps1`

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0012 | OS Kernel 설정 분석 | Linux/AIX/HP-UX/Solaris | 🔍 | 📜 / 🔧 | `command`, `sysfs`, `config` | — | 낮음 | `sysctl -a`, `/etc/sysctl.conf`. 에이전트 내장 시 🔧 |
| ITEM0013 | NTP / Syslog 설정 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `chronyc tracking`, `timedatectl`, `/etc/rsyslog.conf` |
| ITEM0014 | OS 성능 로그 분석 | Linux | 🔍 | 📜 | `command`, `log` | — | 낮음 | `vmstat`/`sar`/`nmon` — delayed 수집 (시간 경과 필요) |
| ITEM0015 | OS 네트워크 통계 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `proc` | — | 낮음 | `ss -s`, `netstat`, `/proc/net/dev`. AA·IA 공유 |
| ITEM0016 | OS 시스템 로그 분석 | Linux | 🔍 | 📜 / 🔧 | `log`, `command` | — | 낮음 | `syslog`/`dmesg`/`journalctl -p err` |
| ITEM0037 | TCP Socket CLOSE_WAIT 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `proc` | — | 낮음 | `ss -s` CLOSE_WAIT 카운트. AA ITEM0015와 교차참조 |
| ITEM0040 | OS Page In/Out & Swapping 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `proc` | — | 낮음 | `vmstat -s`, `/proc/vmstat` |
| ITEM0041 | nsswitch / DNS 설정 분석 | Linux | 🔍 | 📜 / 🔧 | `config` | — | 낮음 | `/etc/nsswitch.conf`, `/etc/resolv.conf`, `/etc/hosts` |
| ITEM0044 | IPC 파라미터 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `sysfs` | — | 낮음 | `ipcs -l`, `sysctl kernel.sem` 등 |
| ITEM0045 | Mount 옵션 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `mount -l`, `/etc/fstab`, noatime/nodiratime 점검 |
| ITEM0046 | Kernel Dump 설정 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `kdump`, `/etc/kdump.conf`, `coredumpctl` |
| ITEM0063 | 네트워크 라우팅 및 NFS 구성 | Linux | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | `ip route`, `nfsstat`, `/proc/mounts` |
| ITEM0064 | 디스크/스토리지 구성 | Linux | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | `lsblk`, `lvs`/`vgs`, RAID(`mdadm`), multipath |
| ITEM0066 | 실행 프로세스 및 서비스 점검 | Linux | 🔍 | 📜 / 🔧 | `command`, `proc` | — | 낮음 | `ps aux` 좀비/불필요 프로세스, `systemctl list-units` |
| ITEM0068 | EOS 및 패치 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `eos-lifecycle-db.json` 내장 매칭. 🔧 내장 시 DB 갱신 용이 |
| ITEM0069 | 네트워크 지연 분석 | Linux | 🔍 | 📜 | `command` | — | 중간 | ICMP+TCP RTT(`ping`/`traceroute`). `aitop-rtt-targets.conf` 기반 |
| ITEM0070 | 자동 재시작 설정 점검 | Linux | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `systemctl show`, PM2 `ecosystem.json`, `supervisord.conf` |
| — | CPU 사용률/코어별 | Linux/Windows | 📊 | 🔧 | `proc` | `os.cpu_metrics` | 낮음 | `/proc/stat` 상시 수집. `usage_percent`·코어별 user/system/idle |
| — | 메모리 사용률/가용량 | Linux/Windows | 📊 | 🔧 | `proc` | `os.memory_metrics` | 낮음 | `/proc/meminfo` 상시 수집. MemTotal/Free/Available/Cached |
| — | 디스크 I/O 및 사용률 | Linux/Windows | 📊 | 🔧 | `proc`, `sysfs` | `os.disk_metrics` | 낮음 | `/proc/diskstats` 상시 수집. read/write bytes·IOPS |
| — | 네트워크 I/O (RX/TX) | Linux/Windows | 📊 | 🔧 | `proc` | `os.network_metrics` | 낮음 | `/proc/net/dev` 상시 수집. bytes/packets·에러율 |
| — | 프로세스 목록 및 리소스 | Linux/Windows | 📊 | 🔧 | `proc` | `os.process_list` | 낮음 | `/proc/[pid]/stat` 상시 수집. CPU·RSS 상위 N개 |
| — | 시스템 정보 (OS 버전/업타임) | Linux/Windows | 📊 | 🔧 | `proc`, `command` | `os.system_info` | 낮음 | `/proc/version`, `uname` — 에이전트 부팅 시 수집 |

### 1.2 GPU (NVIDIA, AMD, Intel, Apple)

> 담당: **TA** (Technical Architecture, AI 영역)
> 수집 스크립트(현행): `linux-ai-1.0-immediate.sh` (ITEM0208, 0220, 0228 포함)

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0208 | GPU VRAM OOM 방지 설정 | Linux | 🔍 | 📜 / 🔧 | `command`, `sysfs` | — | 낮음 | `nvidia-smi` VRAM 사용률, OOM kill 설정 점검 |
| ITEM0220 | GPU 활용률 및 처리량 분석 | Linux | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | `nvidia-smi dmon`, GPU utilization %, throughput |
| ITEM0228 | GPU 리소스 모니터링 및 알림 체계 | Linux | 🔍 | 📜 / 🔧 | `command`, `config` | — | 중간 | 알림 임계값 설정, 모니터링 도구 구성 |
| — | GPU 사용률/전력/온도 (상시) | Linux | 📊 | 🔧 | `sysfs`, `command` | `gpu.utilization_pct`, `gpu.power.draw_watts`, `gpu.temperature_c` | 낮음 | NVIDIA/AMD/Intel/Apple 통합. 스키마: `ai.gpu_metrics.v2` |
| — | GPU VRAM 사용량 (상시) | Linux | 📊 | 🔧 | `sysfs`, `command` | `gpu.vram.used_bytes`, `gpu.vram.free_bytes` | 낮음 | NVIDIA go-nvml / AMD sysfs / rocm-smi / Apple ioreg |
| — | GPU SM 클록/메모리 대역폭 (상시) | Linux | 📊 | 🔧 | `sysfs`, `command` | `gpu.sm_clock_hz`, `gpu.memory_bandwidth_pct` | 낮음 | NVIDIA DCGM exporter 연동 또는 nvidia-smi 폴백 |
| — | NVIDIA MIG/vGPU 파티셔닝 (상시) | Linux | 📊 | 🔧 | `command` | `gpu.utilization_pct` (MIG instance) | 중간 | `nvidia-smi mig -lgip`. A100/H100 파티션별 메트릭 |
| — | AMD GPU 상태 (상시) | Linux | 📊 | 🔧 | `sysfs`, `command` | `gpu.utilization_pct` (`vendor=amd`) | 중간 | `/sys/class/drm/card*/device/gpu_busy_percent` → `rocm-smi` |
| — | Intel GPU 상태 (상시) | Linux | 📊 | 🔧 | `sysfs`, `command` | `gpu.utilization_pct` (`vendor=intel`) | 중간 | `/sys/class/drm/card*/` i915/xe sysfs → `intel_gpu_top` |
| — | Apple Silicon GPU 상태 (상시) | macOS | 📊 | 🔧 | `command` | `gpu.utilization_pct` (`vendor=apple`) | 낮음 | `ioreg` (root 불필요) + `powermetrics` (root 필요) |

### 1.3 WEB 서버 (Nginx, Apache, IIS)

> 담당: **AA** (Application Architecture)
> 수집 스크립트(현행): `AITOP_linux-nginx-1.0-immediate.sh`, `AITOP_linux-apache-1.0-immediate.sh`, `AITOP_linux-ohs-1.0-immediate.sh`, `AITOP_windows-iis-1.0-immediate.ps1`, `AITOP_windows-nginx-1.0-immediate.ps1`, `AITOP_windows-apache-1.0-immediate.ps1`

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0006 | HTTP 계층 로드밸런서 구성 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `config`, `command` | — | 낮음 | On-Prem WEB/WAS LB 전용. `nginx -T`, `httpd.conf` |
| ITEM0007 | 부하분산 트래픽 분포 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `command`, `log` | — | 낮음 | LB 분산 비율 분석. Access 로그 파싱 |
| ITEM0050 | 클라우드/K8s LB 및 Ingress 설정 분석 | Linux | 🔍 | 📜 / 🔧 | `command`, `api` | — | 중간 | `kubectl get ingress/svc`. AWS ALB + Istio |
| ITEM0056 | 웹 서버 보안 설정 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `curl` SSL 헤더, `sslscan`, Nginx/Apache/IIS/WebtoB |
| — | Nginx 활성 연결 (상시) | Linux | 📊 | 🔧 | `api` | `middleware.http.request.active` | 낮음 | `/nginx_status` stub_status |
| — | Apache 활성 워커 (상시) | Linux | 📊 | 🔧 | `api` | `middleware.worker.active` | 낮음 | `/server-status?auto` mod_status |
| — | SSL/TLS 인증서 만료일 | Linux/Windows | 📊🔍 | 📜 / 🔧 | `config`, `command` | — | 낮음 | ITEM0056에 포함 또는 독립 항목으로 분리 가능 |

### 1.4 WAS / 미들웨어 (Tomcat, JBoss, Kestrel, Express, Gunicorn, Go)

> 담당: **AA** (Application Architecture)
> 수집 스크립트(현행): `AITOP_linux-tomcat-1.0-immediate.sh`, `AITOP_linux-weblogic-1.0-immediate.sh`, `AITOP_linux-webtob-jeus-1.0-immediate.sh`, `AITOP_windows-tomcat-1.0-immediate.ps1`, `AITOP_windows-weblogic-1.0-immediate.ps1`, `AITOP_windows-webtob-jeus-1.0-immediate.ps1`

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0008 | GC 로그 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `log`, `command` | — | 낮음 | JVM GC 중심. ITEM0034·0035 흡수. `.NET GC`→ITEM0053 |
| ITEM0009 | 런타임 구성 옵션 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `config`, `command` | — | 낮음 | 다언어 JVM/Node.js/Go/Python 기초 점검 |
| ITEM0010 | 서비스 사용량 및 TPS/응답시간 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `log`, `command` | — | 낮음 | WAS 성능 전용. Access 로그 기반 TPS 분석 |
| ITEM0011 | 애플리케이션 에러 로그 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `log` | — | 낮음 | 다언어 (Java/.NET/Node/Python/Go/Ruby) |
| ITEM0026 | 서버 엔진 로그 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `log` | — | 낮음 | Tomcat/WebLogic/JEUS/Nginx/Apache 엔진 로그 패턴 |
| ITEM0030 | 힙 메모리 덤프 분석 — JVM | Linux | 🔍 | 🖐️ | `command`, `script` | — | 높음 | `jmap`/`jcmd` + MAT 파이프라인. MAT 설치 필수 |
| ITEM0036 | OOME / Statement Cache 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `log` | — | 낮음 | OOME 로그 분류 중심. 로그 경로 자동 탐지 |
| ITEM0039 | HTTP 커넥션풀 설정 및 에러 패턴 | Linux/Windows | 🔍 | 📜 / 🔧 | `config`, `log` | — | 낮음 | 설정 탐색 자동화. 에러 분석은 WAS 로그 연동 |
| ITEM0049 | 동시성 분석 (Thread Dump) | Linux/Windows | 🔍 | 🖐️ / 📜 | `command`, `attach` | — | 높음 | `jstack`/`kill -3` 10회 반복 (3초 간격). Java 중심 |
| ITEM0051 | 서킷 브레이커 / 재시도 정책 분석 | Linux | 🔍 | 📜 / 🔧 | `config`, `api` | — | 중간 | Istio + Resilience4j/Spring + Polly 설정 파일 파싱 |
| ITEM0052 | DB 커넥션풀 설정 및 에러 패턴 | Linux/Windows | 🔍 | 📜 / 🔧 | `config`, `log` | — | 중간 | 앱 측 커넥션풀 (HikariCP/DBCP). DBMS 세션→ITEM0019 |
| ITEM0053 | .NET 런타임 진단 | Windows/Linux | 🔍 | 📜 / 🔧 | `command`, `attach` | — | 중간 | `dotnet-counters`. Windows IIS + Linux/Kestrel/Container |
| ITEM0054 | APM 에이전트 설정 적합성 진단 | Linux/Windows | 🔍 | 📜 / 🔧 | `api`, `config` | — | 중간 | `aitop-apm-adapter.sh`. 6개 APM SaaS API (WhaTap/NR/DD/DT/Scouter/OA) |
| ITEM0055 | 로그 관측성(Observability) 품질 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `log`, `config` | — | 중간 | Nginx/Apache/WebLogic/JEUS/IIS/Spring Boot |
| ITEM0058 | 타임아웃 체인 정합성 분석 | Linux | 🔍 | 📜 | `config` | — | 높음 | ITEM0006·0039·0052 결과 재활용. 전용 스크립트 없음 |
| — | Thread Pool 상태 (Java/.NET 상시) | Linux/Windows | 📊 | 🔧 | `jmx`, `attach` | `middleware.thread_pool.active`, `middleware.thread_pool.max` | 낮음 | `middleware.java.v1` / `middleware.dotnet.v1`. Java jcmd, .NET dotnet-counters |
| — | JVM Heap/GC 메트릭 (상시) | Linux/Windows | 📊 | 🔧 | `jmx`, `attach` | `jvm.memory.heap.used`, `jvm.gc.duration` | 낮음 | Java OTel Agent + AITOP Extension. `middleware.java.v1` |
| — | HikariCP/DBCP2 커넥션풀 (상시) | Linux/Windows | 📊 | 🔧 | `jmx` | `middleware.connection_pool.active`, `middleware.connection_pool.pending` | 낮음 | `com.zaxxer.hikari` MBean. `middleware.connection_pool.v1` |
| — | Event Loop 지연 (Node.js 상시) | Linux/Windows | 📊 | 🔧 | `attach`, `api` | `middleware.event_loop.lag`, `middleware.event_loop.utilization` | 중간 | `perf_hooks.monitorEventLoopDelay`. `middleware.nodejs.v1` |
| — | Worker 상태 (Gunicorn/Python 상시) | Linux | 📊 | 🔧 | `proc`, `command` | `middleware.worker.active`, `middleware.worker.restarts` | 낮음 | stats socket + `/proc/[pid]/stat`. `middleware.python.v1` |
| — | Goroutine 수/누수 탐지 (Go 상시) | Linux/Windows | 📊 | 🔧 | `api` | `middleware.goroutine.count`, `middleware.goroutine.created` | 낮음 | `expvar`, `runtime.NumGoroutine()`. `middleware.go.v1` |

### 1.5 DB (PostgreSQL, MySQL, Oracle, MongoDB)

> 담당: **DA** (Data Architecture)
> 수집 스크립트(현행): `AITOP_linux-oracle-1.0-immediate.sh`, `AITOP_linux-mysql-1.0-immediate.sh`, `AITOP_linux-mariadbd-1.0-immediate.sh`, `AITOP_linux-postgresql-1.0-immediate.sh`, `AITOP_windows-oracle-1.0-immediate.ps1`, `AITOP_windows-mysql-1.0-immediate.ps1`, `AITOP_windows-postgresql-1.0-immediate.ps1`, `AITOP_windows-mssql-1.0-immediate.ps1`

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0017 | DBMS 이중화 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc`, `command` | — | 낮음 | Oracle/MySQL/PostgreSQL. RMAN/mysqldump/pg_basebackup |
| ITEM0018 | DBMS 시점 복구 설정 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc`, `config` | — | 낮음 | 아카이브 모드, 백업 정책 설정 |
| ITEM0019 | DBMS 성능지표 및 Session 관리 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | `pg_stat_activity`, `V$SESSION`, `performance_schema` |
| ITEM0020 | DBMS Storage Utilization | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc`, `command` | — | 낮음 | 테이블스페이스 사용률, 디스크 여유 공간 |
| ITEM0021 | DBMS Cache Hit Ratio | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | Buffer cache hit, shared pool hit |
| ITEM0022 | DB SQL Heavy/Slow 쿼리 분석 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc`, `log` | — | 낮음 | `pg_stat_statements`, `V$SQL`, `slow_query_log` |
| ITEM0023 | DBMS 파라미터 (Sort/Openfile) | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | `sort_area_size`, `open_cursors`, `sort_buffer_size` |
| ITEM0024 | DBMS 파라미터 (Log) | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc`, `config` | — | 낮음 | archive/redo 로그 설정 |
| ITEM0025 | DBMS 파라미터 (Memory) | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | `sga_target`, `innodb_buffer_pool_size`, `shared_buffers` |
| ITEM0027 | DBMS Alert/Error Log 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `log`, `jdbc` | — | 낮음 | Oracle alert.log, MySQL error.log, PostgreSQL pg_log |
| ITEM0059 | Oracle RAC 클러스터 점검 | Linux | 🔍 | 📜 / 🖐️ | `command`, `jdbc` | — | 중간 | CRS/OCR/VOTE/인터커넥트 통합. Grid 환경 전용 |
| ITEM0060 | Oracle 자동작업 및 통계 관리 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | Autotask, DBMS_STATS 최신성 |
| ITEM0061 | Oracle SQL 효율성 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | Literal SQL/Sequence/Parallel 힌트 분석 |
| ITEM0062 | DB 오브젝트 품질 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `jdbc` | — | 낮음 | Invalid/Unusable/Nologging 오브젝트 (Oracle/MySQL/PostgreSQL) |

### 1.6 Cache (Redis, Valkey, KeyDB, DragonflyDB, Memcached)

> 담당: **DA** (현행 ITEM 미할당 → Phase 31 신규 등록: ITEM0400~ITEM0410)
> 수집 스크립트(현행): 해당 없음 (에이전트 내장 `it-cache` Collector로 직접 구현)
> 엔진 공통: `engine` 레이블 = `redis` / `valkey` / `keydb` / `dragonfly` / `memcached`

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0400 | Cache 메모리 사용 및 파편화 진단 | Linux/Windows | 📊🔍 | 🔧 | `command` | `cache.memory.used`, `cache.memory.max`, `cache.memory.fragmentation_ratio` | 낮음 | `INFO memory`. 상시 수집 + 진단 시 상세 분석 |
| ITEM0401 | Cache OPS/레이턴시 및 히트율 진단 | Linux/Windows | 📊🔍 | 🔧 | `command` | `cache.ops_per_sec`, `cache.latency`, `cache.hit_rate` | 낮음 | `INFO stats`, `LATENCY HISTORY`. P50/P95/P99 |
| ITEM0402 | Cache 커넥션 상태 진단 | Linux/Windows | 📊🔍 | 🔧 | `command` | `cache.connections.active`, `cache.connections.blocked`, `cache.connections.rejected` | 낮음 | `INFO clients` |
| ITEM0403 | Cache Eviction 현황 진단 | Linux/Windows | 📊🔍 | 🔧 | `command` | `cache.evictions` | 낮음 | `INFO stats` — `evicted_keys` |
| ITEM0404 | Cache Persistence 설정 진단 | Linux | 🔍 | 🔧 | `command` | `cache.persistence.last_save_age`, `cache.persistence.aof_rewrite` | 낮음 | `INFO persistence` — RDB/AOF 상태 스냅샷 |
| ITEM0405 | Cache Replication 상태 진단 | Linux | 📊🔍 | 🔧 | `command` | `cache.replication.lag`, `cache.replication.offset` | 낮음 | `INFO replication`. role/lag |
| ITEM0406 | Cache Slow Log 분석 | Linux/Windows | 📊🔍 | 🔧 | `command` | `cache.slowlog.count` | 낮음 | `SLOWLOG GET <N>` |
| ITEM0407 | Cache Keyspace 통계 | Linux/Windows | 📊🔍 | 🔧 | `command` | `cache.keyspace.keys`, `cache.keyspace.expires`, `cache.keyspace.avg_ttl` | 낮음 | `INFO keyspace` — DB별 키 수 |
| ITEM0408 | Redis Cluster 상태 진단 | Linux | 🔍 | 🔧 | `command` | — | 낮음 | `CLUSTER INFO` — 슬롯/노드 상태. 비클러스터 시 스킵 |
| ITEM0409 | Memcached 통계 진단 | Linux | 📊🔍 | 🔧 | `command` | `cache.hit_rate`, `cache.evictions` (`engine=memcached`) | 낮음 | `stats` 명령. 인증 없음 |
| ITEM0410 | Valkey/KeyDB/DragonflyDB 상태 진단 | Linux | 📊🔍 | 🔧 | `command` | `cache.memory.used`, `cache.ops_per_sec` (`engine=valkey`/`keydb`/`dragonfly`) | 중간 | Redis 호환 `INFO` + 벤더 확장 명령 |

### 1.7 MQ (Kafka, RabbitMQ, ActiveMQ)

> 담당: **DA** (현행 ITEM 미할당 → Phase 31 신규 등록: ITEM0420~ITEM0425)
> 수집 스크립트(현행): 해당 없음 (에이전트 내장 `it-mq` Collector로 직접 구현)

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0420 | Kafka 브로커 상태/설정 진단 | Linux | 📊🔍 | 🔧 / 📜 | `api`, `jmx` | — | 중간 | Admin API + JMX (버전별 차이 큼). 설정 스냅샷 포함 |
| ITEM0421 | Kafka 토픽/파티션 현황 | Linux | 📊🔍 | 🔧 | `api` | `middleware.kafka.consumer.lag`, `middleware.kafka.consumer.lag_max` | 낮음 | `AdminClient.describeTopics()` + Consumer Lag 상시 수집 |
| ITEM0422 | Kafka 컨슈머 그룹 Lag 모니터링 | Linux | 📊 | 🔧 | `api` | `middleware.kafka.consumer.lag_max`, `middleware.kafka.producer.sent_rate` | 낮음 | `AdminClient.listConsumerGroupOffsets()` 상시 수집 |
| ITEM0423 | RabbitMQ 큐 상태 진단 | Linux | 📊🔍 | 🔧 | `api` | `middleware.rabbitmq.queue.depth`, `middleware.rabbitmq.queue.consumers`, `middleware.rabbitmq.queue.publish_rate` | 낮음 | Management API `/api/queues` |
| ITEM0424 | RabbitMQ 노드/클러스터 상태 진단 | Linux | 📊🔍 | 🔧 | `api` | — | 낮음 | `/api/nodes`, `/api/overview` |
| ITEM0425 | ActiveMQ 큐/토픽 통계 진단 | Linux | 📊🔍 | 🔧 / 📜 | `jmx`, `api` | `middleware.activemq.queue.depth`, `middleware.activemq.queue.enqueue_count`, `middleware.activemq.queue.consumer_count` | 중간 | Jolokia REST API (`/api/jolokia`) + JMX MBean |

### 1.8 AI 서비스 (LLM, VectorDB, Serving, OTel Metrics)

> 담당: **AA/DA/TA** (AI 아키텍처 진단 TF)
> 수집 스크립트(현행): `linux-ai-1.0-immediate.sh`, `windows-ai-1.0-immediate.ps1`
> NIST AI RMF 1.0 / Gartner AI TRiSM 매핑: [AI_진단항목_리스트.md](../../../aitop/02.%20Working/Sample_AI_진단항목/AI_진단항목_리스트.md) 참조

#### 1.8.1 안정성 (Stability) — AA 담당

| ITEM | 항목명 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0200 | 환각(Hallucination) 제어 메커니즘 점검 | 🔍 | 🖐️ / 📜 | `config`, `api`, `log` | — | 높음 | 🟡 반자동. 모델별 temperature, top_p 설정 + 출력 검증 로직 |
| ITEM0201 | 에이전트 루프 예외 처리 및 무한 실행 방지 | 🔍 | 📜 / 🔧 | `config`, `log` | — | 높음 | 🟢 자동화. max_iterations, timeout 설정 |
| ITEM0202 | LLM API Rate Limit 대응 및 재시도 정책 | 🔍 | 📜 / 🔧 | `config`, `log` | — | 높음 | 🟢 자동화. retry 설정, backoff 전략 |
| ITEM0203 | LLM 출력 스키마 검증 및 파싱 안정성 | 🔍 | 📜 / 🔧 | `config`, `log` | — | 높음 | 🟢 자동화. Pydantic/JSON Schema 검증 설정 |
| ITEM0204 | RAG 검색 실패 폴백 전략 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. fallback 로직 설정 |

#### 1.8.2 효율성 — AA 담당 (LLM 최적화)

| ITEM | 항목명 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0209 | 컨텍스트 길이 초과 처리 | 🔍 | 📜 / 🔧 | `config`, `log` | — | 높음 | 🟢 자동화. context window 관리 전략 |
| ITEM0210 | 프롬프트 토큰 사용량 최적화 | 🔍 | 📜 / 🔧 | `api`, `log` | — | 높음 | 🟢 자동화. 입출력 토큰 수/비용 집계 |
| ITEM0211 | 시맨틱 캐시 적용 및 효율 점검 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. 캐시 히트율, GPTCache/Semantic Cache 설정 |
| ITEM0212 | 스트리밍 응답 지원 및 TTFT 분석 | 🔍 | 📜 / 🔧 | `api`, `log` | — | 높음 | 🟢 자동화. Time-To-First-Token 측정 |

#### 1.8.3 효율성 — DA 담당 (VectorDB / RAG)

| ITEM | 항목명 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0205 | 임베딩 모델 버전 일관성 및 인덱스 정합성 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. Milvus/Chroma/Qdrant/Weaviate |
| ITEM0206 | 벡터 DB 가용성 및 복제 구성 | 🔍 | 📜 / 🔧 | `api` | — | 중간 | 🟢 자동화. Health Check + 복제 상태 |
| ITEM0213 | 벡터 검색 인덱스 알고리즘 최적화 | 🔍 | 📜 / 🔧 | `api`, `config` | — | 높음 | 🟢 자동화. HNSW/IVF 파라미터 |
| ITEM0214 | 문서 청킹(Chunking) 전략 적합성 | 🔍 | 📜 / 🔧 | `config` | — | 높음 | 🟢 자동화. chunk_size, overlap 설정 |
| ITEM0215 | 리랭킹 파이프라인 품질 및 효율 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. 리랭커 모델 설정 |
| ITEM0216 | 임베딩 배치 처리 효율성 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. batch_size, 동시성 설정 |

#### 1.8.4 효율성 — TA 담당 (GPU / 서빙 최적화)

| ITEM | 항목명 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0207 | 모델 서빙 헬스체크 및 장애 복구 | 🔍 | 📜 / 🔧 | `api` | — | 중간 | 🟢 자동화. vLLM/TGI/Triton `/health` |
| ITEM0217 | KV 캐시 활용 및 추론 가속화 | 🔍 | 📜 / 🔧 | `api`, `config` | — | 높음 | 🟢 자동화. vLLM KV cache 사용률 (→ITEM0234에서 상세) |
| ITEM0218 | 양자화(Quantization) 적용 현황 | 🔍 | 📜 / 🔧 | `config` | — | 중간 | 🟢 자동화. GPTQ/AWQ/INT4/INT8 설정 (→ITEM0233에서 상세) |
| ITEM0219 | 연속 배치(Continuous Batching) 설정 | 🔍 | 📜 / 🔧 | `config` | — | 높음 | 🟢 자동화. max_batch_size, waiting_served_ratio (→ITEM0232에서 상세) |
| ITEM0220 | GPU 활용률 및 처리량 분석 | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | 🟢 자동화. `nvidia-smi dmon`, GPU util %, TPS (→1.2 GPU 상시 메트릭과 연계) |

#### 1.8.5 거버넌스 — AA/DA 담당

| ITEM | 항목명 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0221 | 프롬프트 버전 관리 체계 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. 버전 거버넌스 정책 |
| ITEM0222 | LLM 평가 자동화 파이프라인 | 🔍 | 🖐️ / 📜 | `config`, `api`, `script` | — | 높음 | 🟡 반자동. 평가 파이프라인 설정 |
| ITEM0223 | 에이전트 워크플로우 추적 및 로그 품질 | 🔍 | 📜 / 🔧 | `log`, `config` | — | 높음 | 🟢 자동화. Tracing 설정, 로그 구조화 |
| ITEM0224 | 개인정보(PII) 처리 및 데이터 거버넌스 | 🔍 | 🖐️ / 📜 | `log`, `config`, `script` | — | 높음 | 🟡 반자동. PII 스캔 — 고부하 가능 |
| ITEM0225 | 벡터 인덱스 증분 갱신 전략 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. 갱신 주기/방식 |
| ITEM0226 | 임베딩 모델 교체 대응성 (Migration) | 🔍 | 🖐️ / 📜 | `config`, `script` | — | 높음 | 🟡 반자동. 마이그레이션 전략 문서화 |
| ITEM0227 | 모델 배포 및 롤백 전략 (MLOps) | 🔍 | 🖐️ / 📜 | `config`, `script` | — | 높음 | 🟡 반자동. 배포 파이프라인 설정 |
| ITEM0228 | GPU 리소스 모니터링 및 알림 체계 | 🔍 | 📜 / 🔧 | `command`, `config` | — | 중간 | 🟢 자동화. 알림 임계값, 모니터링 도구 |
| ITEM0229 | 유해 콘텐츠 필터링 (Guardrail) 운영 | 🔍 | 📜 / 🔧 | `config`, `api` | — | 높음 | 🟢 자동화. 필터 설정, 차단 규칙 |
| ITEM0230 | LLM 입출력 로그 추적 (Prompt Logging) | 🔍 | 📜 / 🔧 | `log`, `config` | — | 높음 | 🟢 자동화. 로그 보존 정책, 마스킹 설정 |
| — | OTel/Prometheus 메트릭 스냅샷 | 📊 | 🔧 | `api` | `vectordb.search.duration`, `vectordb.cache.hit.total` | 낮음 | `/metrics` 엔드포인트 — 에이전트 상시 수집

#### 1.8.6 AI 서빙 인프라 — TA 담당

> 담당: **TA** (현행 ITEM 미할당 → Phase 31 신규 등록: ITEM0231~ITEM0235)
> 수집 기반: `ai-serving` Collector (`agent/internal/collector/ai/serving/`) — 스키마 `ai.model_serving_health.v1` 외

| ITEM | 항목명 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0231 | vLLM/Ollama/Triton/TGI/Ray-Serve 헬스체크 | 📊🔍 | 📜 / 🔧 | `api` | `ai.model_serving_health.v1` | 중간 | 🟢 자동화. `/health` 상시 폴링 + 진단 시 상세 프레임워크 정보 |
| ITEM0232 | Continuous Batching 설정 진단 | 🔍 | 📜 / 🔧 | `api`, `config` | `ai.batching_config.v1` | 높음 | 🟢 자동화. max_batch_size, waiting_served_ratio. ITEM0219와 연계 |
| ITEM0233 | 양자화(Quantization) 설정 진단 | 🔍 | 📜 / 🔧 | `config` | `ai.quantization_config.v1` | 중간 | 🟢 자동화. GPTQ/AWQ/INT4/INT8/GGUF 설정. ITEM0218과 연계 |
| ITEM0234 | KV Cache 설정 및 활용 진단 | 🔍 | 📜 / 🔧 | `api`, `config` | `ai.kvcache_config.v1` | 높음 | 🟢 자동화. gpu_memory_utilization, paged_attention, prefix_caching. ITEM0217과 연계 |
| ITEM0235 | K8s GPU 리소스 할당 현황 | 📊🔍 | 🔧 | `api` | `ai.k8s_gpu_resources.v1` | 중간 | 🟢 자동화. nvidia.com/gpu 리소스 할당 상태. K8s 환경 전용 |

### 1.9 보안 진단 (인증서, 포트, 방화벽, PII)

> 담당: **AA/IA** 혼합
> 수집 스크립트(현행): OS 스크립트 및 WEB 스크립트에 포함. `eos-lifecycle-db.json` 활용

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0056 | 웹 서버 보안 설정 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | SSL 헤더, 취약 cipher, `sslscan`. ITEM0056(AA) |
| ITEM0057 | 파일 시스템 및 프로세스 권한 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | `stat`, `ls -la`, K8s SecurityContext |
| ITEM0065 | SELinux/보안 모듈 점검 | Linux | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | `sestatus`, `aa-status`. ITEM0065(IA) |
| ITEM0067 | 백업/복구 환경 구성 점검 | Linux | 🔍 | 🖐️ / 📜 | `command`, `config` | — | 중간 | `crontab`, `rsync` 설정, 스토리지 구성 — 정책 적합성은 전문가 |
| ITEM0068 | EOS 및 패치 점검 | Linux/Windows | 🔍 | 📜 / 🔧 | `command`, `config` | — | 낮음 | `eos-lifecycle-db.json` 매칭. 보안 업데이트 미적용 탐지 |
| — | 오픈 포트 목록 | Linux/Windows | 🔍 | 📜 / 🔧 | `command` | — | 낮음 | `ss -tlnp`. OS 스크립트 내 포함 |
| — | 방화벽 규칙 현황 | Linux/Windows | 🔍 | 📜 / 🖐️ | `command` | — | 낮음 | `iptables -L`, `firewall-cmd`, `Get-NetFirewallRule` |
| — | AI API Key 평문 노출 감지 | Linux | 📊 | 🔧 | `log`, `config` | — | 높음 | Sanitizer 내장 — 에이전트 자동 마스킹 |

### 1.10 성능 진단 (Connection Pool, Thread Pool, Event Loop, Profiling)

> 담당: **AA** (주요), **IA** (eBPF)
> 수집 스크립트(현행): WAS 스크립트 및 OS 스크립트 내 포함. eBPF 항목은 스크립트 미구현(에이전트 내장)

| ITEM | 항목명 | 수집 대상 | 출처 | 수집 방식 분류 | 가능한 수집 방식들 | 메트릭 ID | 변경 빈도 | 비고 |
|------|--------|--------|:----:|:----------:|-----------------|----------|:------:|------|
| ITEM0039 | HTTP 커넥션풀 설정 및 에러 패턴 | Linux/Windows | 🔍 | 📜 / 🔧 | `config`, `log` | — | 낮음 | WAS 측 HTTP 커넥션풀. 에이전트 통합 시 🔧 |
| ITEM0049 | 동시성 분석 (Thread Dump) | Linux/Windows | 🔍 | 🖐️ | `command`, `attach` | — | 높음 | `jstack` 10회/3초 간격. **시스템 영향 없음**, 파일 크기 주의 |
| ITEM0052 | DB 커넥션풀 설정 및 에러 패턴 | Linux/Windows | 🔍 | 📜 / 🔧 | `config`, `log` | — | 중간 | 앱 측 커넥션풀 (HikariCP/DBCP2/C3P0) |
| ITEM0030 | 힙 메모리 덤프 분석 — JVM | Linux | 🔍 | 🖐️ | `command`, `script` | — | 높음 | `jmap -dump`. MAT 파이프라인 필수. **고부하 가능** |
| ITEM0008 | GC 로그 분석 (Full GC 빈도/시간) | Linux/Windows | 🔍 | 📜 / 🔧 | `log` | — | 낮음 | GC 로그 경로 자동 탐지. ITEM0034·0035 흡수 |
| — | Connection Pool 실시간 통합 모니터링 | Linux/Windows | 📊 | 🔧 | `jmx`, `api`, `attach` | `middleware.connection_pool.active`, `middleware.connection_pool.pending`, `middleware.connection_pool.wait_time` | 낮음 | `conn_pool_alert.go` — Java/Go/.NET/Node/Python 통합 |
| — | Event Loop 지연 탐지 (Node.js/Go 상시) | Linux/Windows | 📊 | 🔧 | `attach`, `api` | `middleware.event_loop.lag`, `middleware.event_loop.utilization` | 중간 | `perf_hooks.monitorEventLoopDelay` 상시 수집 |
| — | perf/eBPF on-CPU 프로파일링 | Linux | 🔍 | 🖐️ / 📜 | `ebpf`, `command` | `profiling.cpu.sample_rate`, `profiling.cpu.top_frame_ratio` | 높음 | `CAP_BPF`+`CAP_PERFMON` 필요. 기본 30초 |
| — | perf/eBPF off-CPU 프로파일링 | Linux | 🔍 | 🖐️ | `ebpf` | `profiling.offcpu.total_wait_us`, `profiling.offcpu.lock_wait_ratio` | 높음 | I/O·Lock 대기 분석. 오버헤드 주의 |
| — | 플레임그래프 생성 (SVG/JSON) | Linux | 🔍 | 🖐️ / 📜 | `ebpf`, `attach`, `script` | — | 높음 | 온디맨드, diff 플레임그래프 지원 |
| — | Python py-spy 프로파일링 | Linux | 🔍 | 🖐️ | `attach` | `profiling.cpu.sample_rate` | 높음 | `py-spy record -p <pid>` |

---

## 2. 수집 방식별 특성 비교표

| 수집 방식 | 변경 용이성 | 에이전트 재빌드 | 플러그인 배포 | 실시간성 | 오버헤드 | 적합한 항목 예 |
|---------|:--------:|:----------:|:---------:|:------:|:------:|------------|
| `proc` | 낮음 (내장) | 필요 | 불필요 | 초 단위 | 매우 낮음 | CPU·메모리·프로세스 목록 |
| `sysfs` | 낮음 (내장) | 필요 | 불필요 | 초 단위 | 매우 낮음 | GPU sysfs, 디스크 통계 |
| `command` | 중간 | 필요 (경로 변경 시) | 스크립트로 전환 가능 | 수 초 이상 | 낮음~중간 | `nvidia-smi`, `redis-cli`, `jcmd`, `sysctl` |
| `api` | 높음 | 불필요 (URL/스키마 변경 시만) | 스크립트로 전환 가능 | HTTP 레이턴시 | 낮음 | Prometheus, VectorDB, MQ Management API |
| `jmx` | 낮음 | 필요 (새 MBean 추가 시) | 스크립트 전환 가능 | 수 초 | 낮음~중간 | HikariCP, Tomcat Connector, Kafka JMX |
| `jdbc` | 낮음 | 필요 (쿼리 변경 시) | 스크립트 전환 가능 | 수 초 | 중간 | `pg_stat_activity`, `V$SQL`, `slow_query_log` |
| `config` | 낮음 | 필요 (경로/형식 변경 시) | 부분 가능 | 분 단위 | 매우 낮음 | `nginx.conf`, `my.cnf`, `agent.yaml` |
| `log` | 중간 | 부분 필요 | 스크립트로 전환 가능 | 분 단위 | 낮음~높음 | GC 로그, Access 로그, Oracle alert.log |
| `ebpf` | 낮음 | 필요 | 불가 (커널 레벨) | 마이크로초 | 높음 | on-CPU/off-CPU 프로파일링 |
| `attach` | 중간 | 부분 필요 | 에이전트 플러그인 | 수 초 | 중간~높음 | JVM Attach API, py-spy, dotnet-counters |
| `script` | 높음 | 불필요 | Phase 33 플러그인 | 분~시간 | 가변 | MAT 파이프라인, WebLogic JNDI, 커스텀 진단 |

> **핵심 트레이드오프**: `proc`/`sysfs`/`ebpf`는 오버헤드가 최소이지만 재빌드 필요.
> `script`/`api`는 유연성이 높지만 실시간성이 낮고 외부 의존성 있음.

---

## 3. 진단 항목 변경 관리 방안

### 3.1 항목 추가 시 — 내장 vs 스크립트 판단 흐름

```
신규 진단 항목 추가 요청
        │
        ▼
 수집 빈도가 분 미만(초 단위)인가?
    YES ──────────────────────────────────────► 🔧 내장 (Built-in)
    NO  ──────► /proc, /sys 직접 읽기인가?
                    YES ──────────────────────► 🔧 내장 (Built-in)
                    NO  ──────► 외부 CLI 도구 의존인가?
                                    YES ──────► 도구 변경 가능성 높은가?
                                                    YES ──► 📜 스크립트 자동
                                                    NO  ──► 🔧 내장 (Built-in)
                                    NO  ──────► 사용자 커스터마이징 필요한가?
                                                    YES ──► 📜 스크립트 자동
                                                            또는 🖐️ 스크립트 수동
                                                    NO  ──► 🔧 내장 (Built-in)
```

**판단 기준 요약**:
- **내장 적합**: 높은 수집 빈도(초 단위), `/proc`/`sysfs` 직접 읽기, 낮은 오버헤드 필수, 안정적인 API/바이너리
- **스크립트 자동 적합**: 수집 빈도 낮음(분/시간), 외부 CLI 도구 의존, 자주 변경되는 진단 로직, 벤더별 차이가 큰 항목 (예: Oracle RAC 전용 쿼리, WebLogic JNDI)
- **스크립트 수동 적합**: 일회성 진단, 시스템에 영향이 큰 작업 (Heap Dump, Thread Dump 대량), 관리자 판단 필요, PII 스캔

### 3.2 항목 삭제/병합 시 — 하위 호환성 유지

```
항목 삭제/병합 결정 (예: ITEM0034·0035 → ITEM0008 흡수)
        │
        ├─ 1. 스키마 버전 업 (v1 → v2)
        │      - 기존 v1 스키마는 Deprecated 마킹 (삭제하지 않음)
        │      - agent.yaml의 diagnosis.schema_version 필드로 제어
        │
        ├─ 2. 에이전트 코드에서 구 항목은 2 릴리스 후 제거
        │      - 릴리스 노트에 "Breaking: ITEM-XXX deprecated" 명시
        │      - 진단항목_리스트.MD의 "통합및폐기" 섹션에 기록
        │
        └─ 3. Collection Server 수신 측은 구 스키마/신 스키마 모두 처리
               - 필드 매핑 레이어에서 v1 → v2 자동 변환
```

**실제 사례**: v.0.0.5에서 ITEM0034(빈번한 Full GC) + ITEM0035(평균 Full GC 시간) → **ITEM0008(GC 로그 분석)에 흡수**. 현행 스크립트에서도 두 파일이 `진단항목_리스트.MD`의 "통합및폐기" 목록에 기록됨.

### 3.3 스크립트 자동 업데이트 — Phase 33 플러그인 시스템 연계

`📜 스크립트 자동` 항목은 Phase 33 중앙 플러그인 배포 시스템을 통해 에이전트 재빌드 없이 업데이트된다:

```
플러그인 배포 흐름 (Phase 33):
  서버 측 manifest.yaml 업데이트
        │
        ▼
  에이전트 Plugin Manager가 변경 감지
        │
        ▼
  SHA-256 검증 후 스크립트 파일 갱신 (예: AITOP_linux-oracle-1.0-immediate.sh v1.2.0 → v1.3.0)
        │
        ▼
  Scheduler에 새 스크립트 등록 (에이전트 재시작 불필요)
```

> 참조: [AGENT_DESIGN.md §9.5 중앙 플러그인 배포](./AGENT_DESIGN.md#95-중앙-플러그인-배포--에이전트-재설치-없는-핫-배포)

### 3.4 버전 관리 — 진단 항목 스키마 버전

| 버전 | 상태 | 주요 변경 | 적용 에이전트 버전 |
|-----|------|---------|----------------|
| v1 | Stable | ITEM0006~ITEM0070 IT 55건 + ITEM0200~0230 AI 31건 (v.0.0.5 기준) | 0.x ~ 1.x |
| v2 | Planning | ITEM0231~0235 AI Serving 5건 + ITEM0400~0410 Cache 11건 + ITEM0420~0425 MQ 6건 신규 등록. 출처·메트릭ID 컬럼 추가. 상시 모니터링 메트릭 35종 공식 등재 | 2.x (Phase 31~) |

스키마 버전은 `agent.yaml`의 `diagnosis.schema_version` 필드로 제어한다.
Collection Server는 하위 호환을 위해 v1/v2 모두 수신한다.

---

## 4. 내장 vs 스크립트 판단 기준

### 4.1 내장 (🔧 Built-in) 적합 조건

| 조건 | 이유 |
|-----|------|
| 수집 주기 **60초 이하** | 외부 프로세스 포크 오버헤드가 주기 대비 비율 높음 |
| `/proc`, `/sys` 직접 읽기 | 파일 시스템 파싱 = Go 네이티브 I/O, subprocess 불필요 |
| **낮은 오버헤드 필수** | 모니터링 자체가 시스템에 부담 주면 안 됨 |
| 안정적 인터페이스 (`nvidia-smi`, Redis CLI 등) | 호출 규격이 거의 변하지 않음 — 내장해도 유지보수 부담 낮음 |
| Collector 인터페이스 핵심 기능 | 항상 수집 보장 필요 (진단 여부와 무관) |

### 4.2 스크립트 자동 (📜 Script-Auto) 적합 조건

| 조건 | 이유 |
|-----|------|
| 수집 주기 **5분 이상** (또는 진단 시 일회성) | 포크 오버헤드가 상대적으로 작음 |
| 외부 CLI 도구 의존 (버전 변화 많음) | 스크립트 교체만으로 대응 가능 |
| **자주 변경되는 진단 로직** | 에이전트 재빌드 없이 현장 패치 (Phase 33 플러그인) |
| 사용자 커스터마이징 필요 | 고객사별 추가 쿼리/체크 지원 |
| 벤더별 차이가 큰 항목 | 예: Oracle → `AITOP_linux-oracle-*.sh` 버전별 쿼리 상이 |
| 지연 수집(Delayed) 필요 | `*-delayed.sh` 계열 — vmstat/sar 등 시간 경과 후 수집 |

### 4.3 스크립트 수동 (🖐️ Script-Manual) 적합 조건

| 조건 | 이유 |
|-----|------|
| **일회성 진단** (장애 발생 시 트리거) | 지속 수집 불필요 |
| 시스템 부하/영향이 큰 작업 | Heap Dump (ITEM0030), 대량 Thread Dump (ITEM0049), PII 스캔 (ITEM0224) |
| **관리자 판단 필요** | 자동 실행 시 장애 유발 또는 컴플라이언스 위반 가능 |
| 규정 준수 요구 항목 | 실행 기록/감사 로그 생성 필요 (백업 복구 ITEM0067 등) |

### 4.4 수집 방식 전환 기준

기존 항목의 수집 방식이 변경되어야 할 때:

| 전환 방향 | 트리거 | 방법 |
|---------|-------|-----|
| 🖐️ 수동 → 📜 자동 | 진단 자동화 요구, 스케줄 수집으로 전환 | `agent.yaml`에 `schedule` 추가, 스크립트 무인 실행 검증 |
| 📜 자동 → 🔧 내장 | 수집 빈도 요구가 높아짐 (분 → 초) | 내장 구현 후 스크립트는 Deprecated, 2 릴리스 후 제거 |
| 🔧 내장 → 📜 자동 | 진단 로직이 복잡해지거나 벤더 의존성 높아짐 | 해당 Collector에 `script` 방식 추가, 내장 fallback 유지 |
| 자동/내장 → 🖐️ 수동 | 운영 환경 부하 이슈 발견 | `collect_mode: manual` 설정 추가, UI 트리거 버튼 제공 |

---

---

## 5. AI 진단 항목 5종 (v1.3 AI Observability)

> v1.3에서 추가되는 AI 서비스 전용 실시간 진단 항목입니다.
> 기존 §1.8 AI 서비스 진단이 설정/아키텍처 점검 중심이라면, 이 5종은 **운영 중 자동 탐지 → 알림** 목적의 룰 기반 진단입니다.
> 수집 방식: 🔧 내장 (Agent 진단 엔진 자동 실행)

| ID | 항목명 | 설명 | 룰 / 임계치 | 메트릭 소스 | 심각도 기본값 |
|----|--------|------|------------|-----------|:----------:|
| `ai-cost-spike` | AI 비용 급등 탐지 | 시간당 LLM 비용이 일 예산의 N%를 초과할 때 알림 | `rate(gen_ai.cost_usd[1h]) > daily_budget * 0.15` | `gen_ai.cost_usd` | 🟡 Warning |
| `ai-agent-loop` | AI Agent 무한 루프 탐지 | 동일 Agent가 N회 이상 반복 호출 (tool-call loop) 감지 | `gen_ai.agent.iteration_count > 20` within 5min, 동일 tool 3회 연속 호출 | `gen_ai.agent.iteration_count`, span attributes | 🔴 Critical |
| `ai-rag-quality` | RAG 품질 저하 탐지 | Retrieval 관련성 점수 또는 Faithfulness가 임계치 미만으로 하락 | `avg(gen_ai.eval.relevance[15m]) < 0.6` OR `avg(gen_ai.eval.faithfulness[15m]) < 0.7` | `gen_ai.eval.relevance`, `gen_ai.eval.faithfulness` | 🟡 Warning |
| `ai-gpu-saturation` | AI GPU 포화 탐지 | GPU 활용률이 지속적으로 높아 LLM 추론 큐잉 발생 | `avg(gpu.utilization[5m]) > 0.95` AND `gen_ai.latency_ms P95 > 5000` | `gpu.utilization`, `gen_ai.latency_ms` | 🔴 Critical |
| `ai-model-drift` | AI 모델 드리프트 탐지 | 동일 프롬프트에 대한 응답 품질이 시간 경과에 따라 변동 | `stddev(gen_ai.eval.relevance[1d]) > 0.15` OR `gen_ai.eval.hallucination` 7일 이동평균 > 0.2 | `gen_ai.eval.relevance`, `gen_ai.eval.hallucination` | 🟡 Warning |

### 5.1 진단 항목 상세

#### ai-cost-spike — AI 비용 급등

- **탐지 로직**: 1시간 윈도우의 비용 증가율을 일 예산 대비 비율로 계산
- **자동 대응**: 알림 + 선택적 Rate Limit 적용 (설정 시)
- **Evidence**: 모델별 비용 분해, 비용 급등 시점 전후 호출 패턴

#### ai-agent-loop — AI Agent 무한 루프

- **탐지 로직**: Agent span의 iteration 카운트 + 동일 tool 연속 호출 패턴 감지
- **자동 대응**: 알림 + Agent 강제 종료 권고 (Critical 시)
- **Evidence**: Agent 실행 트레이스, tool-call 시퀀스 로그

#### ai-rag-quality — RAG 품질 저하

- **탐지 로직**: 15분 이동평균 Eval 점수 하락 감지
- **자동 대응**: 알림 + VectorDB 인덱스 재빌드 권고
- **Evidence**: 품질 점수 추이 차트, 최근 낮은 점수 요청 샘플

#### ai-gpu-saturation — AI GPU 포화

- **탐지 로직**: GPU 활용률 포화 + LLM 레이턴시 동시 급등
- **자동 대응**: 알림 + 스케일아웃 권고
- **Evidence**: GPU 사용률 타임라인, 추론 큐 깊이, 레이턴시 상관 차트

#### ai-model-drift — AI 모델 드리프트

- **탐지 로직**: 일간 품질 지표의 표준편차 증가 또는 환각 점수 이동평균 상승
- **자동 대응**: 알림 + 프롬프트 버전 롤백 권고
- **Evidence**: 7일 품질 추이, 프롬프트 버전별 성능 비교

---

> **이 문서는 살아있는 문서(Living Document)다.**
> 진단 항목 추가/삭제/병합 시 이 카탈로그를 먼저 업데이트하고, [AGENT_DESIGN.md 부록 A](./AGENT_DESIGN.md#부록-a-collector-전체-매핑표)와 동기화한다.
> ITEM 번호 관리 원부: `C:/aitop/02. Working/20260312_v.0.0.5/진단항목_리스트.MD` (IT), `Sample_AI_진단항목/AI_진단항목_리스트.md` (AI)
