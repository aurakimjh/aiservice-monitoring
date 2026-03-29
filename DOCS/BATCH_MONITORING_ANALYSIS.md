# Scouter 배치 모니터링 분석 + AITOP 배치 모니터링 설계

> **문서 버전**: v1.1 (대규모 배치 성능 최적화 섹션 추가)
> **작성일**: 2026-03-25 | **최종 업데이트**: 2026-03-29 (대규모 배치 + 경쟁사 분석 + 성능 최적화 엔진)
> **작성자**: Aura Kim — Architect & Lead Developer
> **관점**: Scouter 오픈소스 분석 → AITOP 설계 반영 (Phase 36~38 ✅ 구현 완료) + 대규모 배치 최적화 설계
>
> **관련 문서**:
> - [AGENT_DESIGN.md](./AGENT_DESIGN.md) — AITOP Agent 상세 설계 (Runtime Attach / perf·eBPF 포함)
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — OTel + Agent 통합 아키텍처
> - [UI_DESIGN.md](./UI_DESIGN.md) — 통합 모니터링 대시보드 UI 설계
> - [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) — 주요 솔루션 경쟁 분석

---

## 이 문서를 읽기 전에 — 핵심 개념 이해하기

> 배치 모니터링이나 APM에 익숙하지 않은 분을 위한 배경 설명입니다.
> 이미 알고 계신다면 [목차](#목차)로 바로 이동하세요.

### 배치(Batch)란 무엇인가?

**야간에 혼자 일하는 직원**에 비유할 수 있습니다.

회사에서 매일 자정에 "오늘 매출 정산", "고객에게 이메일 발송", "데이터 백업" 같은 작업을 자동으로 실행합니다. 이처럼 **사람이 직접 요청하지 않아도 정해진 시간에 자동으로 실행되는 프로그램**을 배치(Batch) 또는 배치 잡(Batch Job)이라고 합니다.

```
[웹 서비스]       → 사용자가 버튼을 눌러야 동작 (실시간)
[배치 프로그램]   → 정해진 시간에 자동 실행 (예약)
```

배치는 일반적으로:
- **대량 데이터**를 처리합니다 (수십만 건 이상)
- **장시간 실행**됩니다 (수 분 ~ 수 시간)
- **사용자가 없는 시간대**(심야, 주말)에 동작합니다
- **실패하면 재실행**이 필요하며, 결과를 나중에 확인합니다

### 배치 모니터링이 왜 필요한가?

배치는 눈에 보이지 않아 문제가 생겨도 **아무도 모르고 지나칠 수 있습니다**:

| 상황 | 문제 | 피해 |
|------|------|------|
| 새벽 3시 정산 배치가 오류로 중단 | 다음날 오전까지 아무도 모름 | 매출 누락, 고객 민원 |
| SQL이 느려져 6시간 → 24시간으로 늘어남 | 업무 시작 전 완료 못 함 | 업무 마비 |
| 메모리 부족으로 OOM 킬 | 배치 조용히 종료됨 | 데이터 손실 |

이를 방지하려면 배치가 **언제 시작·종료되었는지**, **얼마나 걸렸는지**, **SQL은 어떻게 실행되었는지**, **CPU·메모리는 어떻게 사용했는지** 를 추적하는 배치 모니터링이 필요합니다.

### Scouter란?

Scouter는 **LG CNS가 오픈소스로 공개한 한국산 APM(Application Performance Monitoring)**입니다. 국내 금융, 공공, 엔터프라이즈 환경에서 널리 쓰이며, 특히 Java WAS(WebLogic, JBoss, Tomcat 등) 모니터링에 강점이 있습니다. 배치 모니터링 기능도 별도 에이전트(batch agent)로 제공합니다.

---

## 목차

1. [Scouter 배치 모니터링 분석](#1-scouter-배치-모니터링-분석)
   - 1.1 [아키텍처](#11-아키텍처)
   - 1.2 [핵심 기능](#12-핵심-기능)
   - 1.3 [설정 옵션 분석](#13-설정-옵션-분석)
   - 1.4 [장점과 한계](#14-장점과-한계)
2. [다른 언어의 배치 프레임워크 분석](#2-다른-언어의-배치-프레임워크-분석)
   - 2.1 [Java: Spring Batch / Quartz / JobRunr](#21-java-spring-batch--quartz--jobrunr)
   - 2.2 [Python: Celery / APScheduler / Airflow / Luigi](#22-python-celery--apscheduler--airflow--luigi)
   - 2.3 [.NET: Hangfire / Quartz.NET / Windows Task Scheduler](#23-net-hangfire--quartznet--windows-task-scheduler)
   - 2.4 [Go: cron 라이브러리 / Temporal](#24-go-cron-라이브러리--temporal)
   - 2.5 [Node.js: Bull/BullMQ / Agenda / node-cron](#25-nodejs-bullbullmq--agenda--node-cron)
3. [AITOP 배치 모니터링 설계 제안](#3-aitop-배치-모니터링-설계-제안)
   - 3.1 [설계 원칙](#31-설계-원칙)
   - 3.2 [수집 방식](#32-수집-방식)
   - 3.3 [배치 대시보드 뷰 설계](#33-배치-대시보드-뷰-설계)
   - 3.4 [Scouter 대비 차별화](#34-scouter-대비-차별화)
   - 3.5 [구현 로드맵 (Phase 제안)](#35-구현-로드맵-phase-제안)

---

## 1. Scouter 배치 모니터링 분석

Scouter의 배치 모니터링은 별도의 **배치 에이전트(batch agent)**를 통해 구현됩니다. 이 섹션에서는 Scouter 오픈소스(GitHub: scouter-project/scouter) 를 기반으로 아키텍처, 핵심 기능, 설정, 장단점을 분석합니다.

### 1.1 아키텍처

#### 전체 구성 요소

Scouter 배치 모니터링은 3개의 컴포넌트로 구성됩니다:

```
┌─────────────────────────────────────────────────────────┐
│                     배치 서버 (Batch Host)                │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │           배치 프로세스 (Java 프로그램)              │   │
│  │                                                   │   │
│  │  ┌────────────────────────────────────────────┐  │   │
│  │  │    Scouter Batch Agent (javaagent)          │  │   │
│  │  │  - SQL 프로파일링                             │  │   │
│  │  │  - Stack Frequency Analyzer                 │  │   │
│  │  │  - 배치 ID 식별                               │  │   │
│  │  │  - 메트릭 수집 (CPU/메모리/실행시간)             │  │   │
│  │  └────────────────┬───────────────────────────┘  │   │
│  │                   │ UDP 6101                      │   │
│  │  ┌────────────────▼───────────────────────────┐  │   │
│  │  │    Scouter Batch Daemon (상주 프로세스)       │  │   │
│  │  │  - 배치 에이전트로부터 상태 수신 (UDP 6101)     │  │   │
│  │  │  - Scouter Server로 데이터 전송 (TCP)        │  │   │
│  │  │  - 배치 생명주기 관리 (시작/종료 감지)           │  │   │
│  │  └────────────────┬───────────────────────────┘  │   │
│  └───────────────────┼───────────────────────────────┘   │
└──────────────────────┼──────────────────────────────────┘
                       │ TCP (Scouter 프로토콜)
┌──────────────────────▼──────────────────────────────────┐
│              Scouter Server (중앙 수집 서버)               │
│  - 배치 이력 저장 및 조회                                   │
│  - 알림 처리 (임계값 초과 시)                               │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│           Scouter Client (Eclipse 기반 GUI)               │
│  - 배치 이력 목록, SQL 통계, 스택 분석 뷰                   │
└─────────────────────────────────────────────────────────┘
```

#### 에이전트 탑재 방식

배치 에이전트는 **javaagent 방식**으로 배치 프로세스에 탑재됩니다. Java의 `-javaagent` 옵션을 사용하면 JVM이 시작될 때 에이전트 JAR가 먼저 로드되어 클래스 로딩 시점에 바이트코드를 수정(Bytecode Instrumentation)할 수 있습니다.

```bash
# 배치 실행 명령에 -javaagent 옵션 추가
java -javaagent:/scouter/lib/scouter.agent.batch.jar \
     -Dscouter.config=/scouter/conf/scouter_batch.conf \
     -jar my-batch-app.jar
```

> **비유**: javaagent는 마치 회사 직원(배치 프로그램)에게 **몰래카메라를 붙여두는 것**과 같습니다. 직원이 무슨 일을 하는지(어떤 SQL을 실행하는지, 어디서 시간을 쓰는지) 실시간으로 기록합니다. 직원(배치 프로그램)의 코드를 바꾸지 않아도 됩니다.

#### 배치 데몬의 역할

배치 에이전트는 배치가 실행될 때마다 새 JVM 프로세스로 시작되고, 배치가 끝나면 종료됩니다. 반면 **배치 데몬은 항상 서버에 상주**하며:

1. 배치 에이전트가 보내는 메트릭을 UDP 6101 포트로 수신
2. Scouter Server(TCP)로 중계 전송
3. 배치 프로세스의 시작·종료를 감지하고 생명주기를 추적

---

### 1.2 핵심 기능

#### 기능 1: 통계 중심 수집 — 대량 레코드에도 오버헤드 최소화

배치는 일반적으로 수십만~수백만 건의 레코드를 처리합니다. 매 레코드마다 상세 정보를 수집하면 **모니터링 도구 자체가 배치를 느리게 만드는 역효과**가 납니다.

Scouter는 이 문제를 **통계 기반 수집**으로 해결합니다:

| 수집 방식 | 설명 | 오버헤드 |
|----------|------|---------|
| 건별 수집 (비권장) | SQL 실행마다 상세 로그 기록 | 높음 (배치 성능 저하) |
| 통계 수집 (Scouter 방식) | SQL 패턴별로 집계 (횟수·총시간·건수) | 매우 낮음 |

```
예시) 동일한 SELECT 쿼리가 100만 번 실행된 경우:
- 건별 수집: 100만 개의 로그 레코드 → 메모리/디스크 폭발
- 통계 수집: 1개의 통계 레코드 (100만 회, 총 300초, 평균 0.3ms) → 경량
```

#### 기능 2: SQL 프로파일링

**PreparedStatement, Statement, ResultSet**의 실행 시점에 바이트코드를 삽입하여 SQL 실행 정보를 자동 수집합니다:

```
수집 정보:
  - SQL 실행문 (PreparedStatement의 파라미터 치환 후 원문)
  - 실행 시간 (ms)
  - 처리 건수 (ResultSet rows)
  - 실행 횟수 (동일 SQL 반복 횟수)
  - 실행 오류 여부

출력 예시:
  SELECT * FROM orders WHERE date = ?     → 500회, 총 150초, 평균 300ms, 건수 45만 건
  UPDATE orders SET status = ? WHERE id=? → 45만 회, 총 90초, 평균 0.2ms
```

이 정보로 **어떤 SQL이 병목인지** 즉시 파악할 수 있습니다.

#### 기능 3: Stack Frequency Analyzer (SFA) — 성능 병목 자동 탐지

> **비유**: SFA는 **탐정이 용의자를 주기적으로 몰래 관찰**하는 것과 같습니다.
> 배치가 실행되는 동안 주기적으로(기본 10초 간격) "지금 뭐 하고 있어?"를 확인하고, 가장 자주 걸리는 곳이 병목이라고 판단합니다.

SFA 동작 방식:

```
① 배치 실행 중 10초마다 JVM 스레드 스택 덤프 수집
② 스택 트레이스에서 각 메서드의 등장 빈도 집계
③ 가장 빈번하게 등장한 메서드 = CPU를 가장 많이 소비하는 병목 지점

예시 SFA 결과:
  빈도  메서드
  85%   com.example.OrderService.processRecord()
  72%   org.hibernate.jdbc.ResultSetWrapper.next()
  41%   java.lang.String.format()   ← 의외의 병목
```

일반 프로파일러와 달리 **매 메서드 호출을 추적하지 않고** 샘플링 방식을 사용하므로 오버헤드가 낮습니다. 단, 10초 간격이므로 순간적으로 짧게 실행되는 메서드는 감지되지 않을 수 있습니다.

#### 기능 4: 배치 ID 식별

여러 배치가 동시에 실행될 수 있으므로 각 배치를 고유하게 식별해야 합니다. Scouter는 세 가지 방법을 조합해 배치를 식별합니다:

| 식별 방법 | 설명 | 예시 |
|----------|------|------|
| **실행 클래스명** | `main()` 메서드가 있는 클래스 이름 | `com.example.OrderBatchJob` |
| **파라미터 인덱스** | 실행 시 전달된 args 배열의 특정 인덱스 값 | args[0] = "2026-03-25" |
| **JVM 속성** | `-D` 옵션으로 지정한 시스템 프로퍼티 | `-Djob.name=order-batch` |

설정 예시:
```properties
# 배치 ID = 클래스명 + 첫 번째 파라미터
obj_name_by_args=true
obj_name_by_args_index=0

# 또는 JVM 속성으로 식별
obj_name_by_props=true
obj_name_by_props_key=job.name
```

#### 기능 5: 임계값 기반 전송 — 서버 부하 최소화

짧게 끝나는 배치까지 모두 서버에 전송하면 Scouter Server 부하가 커집니다. Scouter는 **실행 시간이 설정값 이상일 때만** 서버로 전송합니다:

```properties
# 30초 이상 실행된 배치만 서버 전송 (기본값)
batch_log_send_elapsed_ms=30000
```

```
배치 실행 시간 5초  → Scouter Server에 전송 안 함 (단순 완료 기록만)
배치 실행 시간 45초 → Scouter Server에 상세 프로파일링 데이터 전송
배치 실행 시간 3시간 → Scouter Server에 전송 + 알림 발생
```

#### 기능 6: 수집 메트릭 요약

| 메트릭 | 설명 |
|--------|------|
| `elapsed_time_ms` | 배치 전체 실행 시간 (ms) |
| `cpu_time_ms` | 배치가 사용한 CPU 시간 (ms) |
| `sql_count` | 전체 SQL 실행 횟수 |
| `sql_time_ms` | SQL 실행에 소요된 총 시간 |
| `sql_fetch_count` | ResultSet에서 읽은 총 레코드 건수 |
| `sql_error_count` | SQL 오류 발생 횟수 |
| `stack_frequency` | SFA 결과 (메서드별 빈도 맵) |
| `exit_code` | 배치 종료 코드 (0=정상, 비0=오류) |

---

### 1.3 설정 옵션 분석

`scouter_batch.conf` 주요 설정 항목:

```properties
# ─── 기본 연결 ────────────────────────────────────────
# 배치 데몬 UDP 수신 포트 (에이전트 → 데몬)
udp_port=6101

# ─── SQL 프로파일링 ───────────────────────────────────
# SQL 수집 활성화 여부 (true = 활성)
sql_enabled=true

# SQL 통계에서 수집할 최대 SQL 패턴 수
# 초과 시 가장 오래된 항목부터 드롭 (메모리 보호)
sql_max_count=100

# ─── Stack Frequency Analyzer ────────────────────────
# SFA 활성화 여부
sfa_dump_enabled=true

# 스택 덤프 수집 간격 (ms, 기본 10초)
# 줄이면 정밀도 향상 but CPU 오버헤드 증가
sfa_dump_interval_ms=10000

# 스택 덤프 최대 저장 라인 수
sfa_dump_stack_count=100

# ─── 전송 정책 ────────────────────────────────────────
# 이 시간(ms) 이상 실행된 배치만 Scouter Server로 전송
batch_log_send_elapsed_ms=30000

# ─── 배치 ID 식별 ─────────────────────────────────────
# main() 클래스 args 배열의 어떤 인덱스를 ID로 사용할지 (-1 = 미사용)
obj_name_by_args_index=-1

# JVM 시스템 프로퍼티 키를 ID로 사용 (빈 문자열 = 미사용)
obj_name_by_props_key=

# ─── 제외 설정 ────────────────────────────────────────
# 모니터링에서 제외할 패키지 접두어 (콤마 구분)
ignore_packages=sun.,com.sun.,java.

# ─── 오브젝트 타입 ────────────────────────────────────
# Scouter Client에서 표시될 오브젝트 타입명
obj_type=batch
```

#### 설정 조정 가이드

| 목적 | 조정 항목 | 권장값 |
|------|----------|--------|
| 짧은 배치도 모두 모니터링 | `batch_log_send_elapsed_ms` | `0` (모든 배치 전송) |
| SFA 정밀도 향상 | `sfa_dump_interval_ms` | `5000` (5초 간격) |
| 대용량 SQL 환경 | `sql_max_count` | `200~500` |
| 경량 운영 (CPU 오버헤드 최소화) | `sfa_dump_enabled` | `false` |

---

### 1.4 장점과 한계

#### 장점

| 강점 | 상세 |
|------|------|
| **Java 배치에 특화** | javaagent 방식으로 코드 수정 없이 자동 계측 |
| **성능 오버헤드 낮음** | 통계 기반 수집 + 샘플링 SFA → 배치 성능 영향 미미 |
| **SQL 통계 강력** | PreparedStatement/Statement 모두 훅킹, 패턴별 집계 |
| **국내 환경 친화** | 국내 Java EE 환경(EJB, MDB 등) 지원, 국내 문서화 풍부 |
| **임계값 필터링** | 짧은 배치는 전송 안 함 → Scouter Server 부하 절감 |
| **오픈소스** | 무료, 소스 코드 공개 (Apache 2.0) |

#### 한계 (AITOP 설계 시 개선 기회)

| 한계 | 상세 | AITOP에서의 개선 방향 |
|------|------|-------------------|
| **Java 전용** | Python/Go/.NET/Node.js 배치는 모니터링 불가 | 언어 무관 프로세스 레벨 감지 + Runtime Attach |
| **WEB/WAS와 별도 에이전트** | WAS 에이전트, 배치 에이전트를 따로 설치·관리 | AITOP Agent 하나로 통합 |
| **실시간 대시보드 미약** | 주로 사후 분석(배치 완료 후 조회) | 실시간 실행 현황 대시보드 |
| **플레임그래프 미지원** | SFA 결과를 텍스트로만 제공 | perf/eBPF 기반 플레임그래프 연동 |
| **배치 전용 XLog 없음** | 배치 이력을 전용 시각화로 보기 어려움 | 배치 전용 XLog/히트맵 설계 |
| **스케줄 관리 미연동** | cron/systemd timer/Quartz 스케줄 정보 연동 없음 | 스케줄러 연동으로 "다음 실행 예정" 표시 |
| **클라이언트 구식** | Eclipse 기반 두꺼운 클라이언트 | 웹 기반 대시보드 |

---

## 2. 다른 언어의 배치 프레임워크 분석

기업 환경의 배치는 Java만이 아닙니다. Python 데이터 파이프라인, .NET 정산 배치, Go 마이크로서비스 잡 등 다양한 언어로 작성됩니다. AITOP이 범용 배치 모니터링을 제공하려면 각 언어별 배치 프레임워크의 특성을 이해해야 합니다.

---

### 2.1 Java: Spring Batch / Quartz / JobRunr

#### Spring Batch

Spring Batch는 Java 배치의 **사실상 표준(de facto standard)**입니다. 대용량 데이터 처리를 위한 구조화된 프레임워크를 제공합니다.

**핵심 개념:**
```
Job (배치 작업 단위)
  └── Step (처리 단계)
        ├── ItemReader   (데이터 읽기: DB, 파일, API)
        ├── ItemProcessor (데이터 변환/검증)
        └── ItemWriter   (데이터 쓰기: DB, 파일, MQ)
```

**배치 실행 방식:**
```java
// 전형적인 Spring Batch Job 구성
@Bean
public Job orderProcessingJob(Step step1, Step step2) {
    return jobBuilderFactory.get("orderProcessingJob")
        .start(step1)
        .next(step2)
        .build();
}

// Chunk 기반 처리: 1000건씩 읽고→처리→쓰기 반복
@Bean
public Step processStep(ItemReader<Order> reader,
                        ItemProcessor<Order, Invoice> processor,
                        ItemWriter<Invoice> writer) {
    return stepBuilderFactory.get("processStep")
        .<Order, Invoice>chunk(1000)
        .reader(reader)
        .processor(processor)
        .writer(writer)
        .build();
}
```

**모니터링 포인트:**
| 포인트 | 수집 방법 | 의미 |
|--------|----------|------|
| Job 실행 상태 | `JobExecution.getStatus()` | STARTED/COMPLETED/FAILED |
| Step 처리 건수 | `StepExecution.getReadCount()` 등 | 읽기/처리/쓰기/스킵 건수 |
| 실행 시간 | `JobExecution.getStartTime/EndTime` | 배치 소요 시간 |
| DB 저장 | `JobRepository` (Spring Batch 메타 테이블) | `BATCH_JOB_EXECUTION` 테이블 |

**Spring Batch 메타 테이블 (자동 생성):**
```sql
BATCH_JOB_INSTANCE     -- 잡 정의 (잡 이름, 파라미터)
BATCH_JOB_EXECUTION    -- 잡 실행 이력 (시작/종료/상태)
BATCH_STEP_EXECUTION   -- 스텝 실행 이력 (건수/소요시간)
BATCH_JOB_PARAMS       -- 잡 실행 파라미터
```

**프로파일링 가능 범위:**
- Spring Batch 메타 테이블에서 실행 이력/건수 직접 조회 가능
- SQL 프로파일링: JDBC/Hibernate 레이어에서 훅킹 (Scouter 방식 그대로 적용)
- Method 레벨: javaagent 또는 AITOP Runtime Attach로 Processor 메서드 시간 측정

---

#### Quartz Scheduler

Quartz는 **Java 배치 스케줄러**의 표준입니다. Spring Batch 없이 단독으로도, Spring과 연동해서도 사용합니다.

**배치 실행 방식:**
```java
// Job 정의: 실행할 작업 로직
public class DataSyncJob implements Job {
    @Override
    public void execute(JobExecutionContext context) {
        // 배치 로직
        syncData();
    }
}

// 스케줄 등록: 매일 새벽 2시 실행
JobDetail job = newJob(DataSyncJob.class).withIdentity("dataSyncJob").build();
CronTrigger trigger = newTrigger()
    .withSchedule(cronSchedule("0 0 2 * * ?"))
    .build();
scheduler.scheduleJob(job, trigger);
```

**모니터링 포인트:**
| 포인트 | 수집 방법 |
|--------|----------|
| 스케줄 목록 | `scheduler.getJobGroupNames()` + `getTriggerState()` |
| 실행 이력 | Quartz DB 테이블 (`QRTZ_*`) |
| 다음 실행 시간 | `trigger.getNextFireTime()` |
| 실행 중인 잡 | `scheduler.getCurrentlyExecutingJobs()` |

---

#### JobRunr

JobRunr는 **현대적인 Java 백그라운드 잡 프레임워크**입니다. 대시보드가 기본 내장되어 있어 Spring Batch보다 가볍게 사용할 수 있습니다.

**특징:**
```java
// 즉시 실행
BackgroundJob.enqueue(() -> emailService.sendWelcomeEmail(userId));

// 예약 실행 (크론)
BackgroundJob.scheduleRecurrently("daily-report", Cron.daily(),
    () -> reportService.generateDailyReport());
```

**모니터링 포인트:**
- 내장 웹 대시보드 (`/dashboard`) — 잡 큐/실행 현황 실시간 조회
- REST API로 잡 상태 조회 가능 (`/api/jobs`)
- 실패한 잡 자동 재시도 및 알림

---

### 2.2 Python: Celery / APScheduler / Airflow / Luigi

#### Celery

Celery는 **Python 분산 태스크 큐**입니다. 메시지 브로커(Redis, RabbitMQ)를 통해 작업을 분산 처리합니다.

**배치 실행 방식:**
```python
from celery import Celery
from celery.schedules import crontab

app = Celery('tasks', broker='redis://localhost:6379')

# 태스크 정의
@app.task
def process_daily_orders():
    orders = db.query("SELECT * FROM orders WHERE date = today()")
    for order in orders:
        process_order(order)

# 주기적 실행 (Celery Beat)
app.conf.beat_schedule = {
    'daily-order-processing': {
        'task': 'tasks.process_daily_orders',
        'schedule': crontab(hour=2, minute=0),  # 매일 새벽 2시
    },
}
```

**모니터링 포인트:**
| 포인트 | 수집 방법 |
|--------|----------|
| 태스크 상태 | Celery Events API, Redis/RabbitMQ 큐 길이 |
| 실행 시간 | 태스크 `started_at`, `succeeded_at` 타임스탬프 |
| 워커 상태 | `celery inspect active`, `celery inspect stats` |
| 실패율 | `celery inspect reserved` + retry count |

**프로파일링 가능 범위:**
- `py-spy`: 실행 중인 Python 프로세스에 PID로 attach → 스택 샘플링 (코드 수정 불필요)
- `cProfile`: 코드 내장, 메서드 레벨 성능 측정
- AITOP Runtime Attach: py-spy를 내부적으로 활용해 자동 프로파일링 예정 (Phase 34)

---

#### APScheduler

APScheduler는 **Python 프로세스 내에 내장하는 경량 스케줄러**입니다. 별도의 워커 프로세스 없이 앱 내에서 스케줄을 관리합니다.

```python
from apscheduler.schedulers.blocking import BlockingScheduler

scheduler = BlockingScheduler()

@scheduler.scheduled_job('cron', hour=2, minute=0)
def daily_batch():
    run_batch_job()

scheduler.start()
```

**모니터링 포인트:**
- APScheduler 자체 이벤트 리스너: `EVENT_JOB_EXECUTED`, `EVENT_JOB_ERROR`
- 잡 실행 시작/종료 시간, 예외 정보 수집 가능
- 외부 모니터링 통합: OTel 계측 라이브러리 직접 삽입 필요

---

#### Apache Airflow

Airflow는 **데이터 파이프라인(DAG) 오케스트레이션 플랫폼**입니다. 단순 스케줄링을 넘어 태스크 의존성·재시도·알림을 포함한 복잡한 워크플로우를 관리합니다.

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime

with DAG('data_pipeline', schedule_interval='0 2 * * *',
         start_date=datetime(2026, 1, 1)) as dag:

    extract = PythonOperator(task_id='extract', python_callable=extract_data)
    transform = PythonOperator(task_id='transform', python_callable=transform_data)
    load = PythonOperator(task_id='load', python_callable=load_data)

    extract >> transform >> load  # 의존성: extract 완료 후 transform 실행
```

**모니터링 포인트:**
| 포인트 | 수집 방법 |
|--------|----------|
| DAG 실행 상태 | Airflow REST API (`/api/v1/dags/{dag_id}/dagRuns`) |
| 태스크 상태 | `/api/v1/dags/{dag_id}/dagRuns/{run_id}/taskInstances` |
| SLA 위반 | Airflow 내장 SLA 알림 기능 |
| 로그 | Airflow Task 로그 (`/api/v1/dags/.../logs`) |

**프로파일링 가능 범위:**
- DAG/Task 레벨: Airflow API로 실행 시간 수집 가능
- 코드 레벨: py-spy로 실행 중인 Worker 프로세스에 attach
- SQL 레벨: SQLAlchemy 훅 또는 DB 슬로우 쿼리 로그

---

#### Luigi

Luigi는 Spotify가 만든 **Python 배치 파이프라인 프레임워크**입니다. 태스크 간 의존성 관리와 파일 기반 체크포인트(Target)가 특징입니다.

```python
import luigi

class ProcessData(luigi.Task):
    date = luigi.DateParameter()

    def requires(self):
        return ExtractData(self.date)  # 의존 태스크

    def output(self):
        return luigi.LocalTarget(f'/data/processed_{self.date}.csv')

    def run(self):
        with self.input().open('r') as fin:
            with self.output().open('w') as fout:
                process(fin, fout)
```

**모니터링 포인트:**
- Luigi Central Scheduler: 웹 UI로 태스크 의존성 그래프 시각화
- 태스크 완료 여부: Output Target 파일 존재 여부로 판단
- AITOP 연동: 프로세스 레벨 감지 + py-spy 스택 샘플링

---

### 2.3 .NET: Hangfire / Quartz.NET / Windows Task Scheduler

#### Hangfire

Hangfire는 **.NET 환경에서 가장 인기 있는 백그라운드 잡 라이브러리**입니다. 내장 대시보드가 강점입니다.

```csharp
// 즉시 실행 (Fire and forget)
BackgroundJob.Enqueue(() => Console.WriteLine("Hello!"));

// 지연 실행
BackgroundJob.Schedule(() => SendEmail(userId), TimeSpan.FromDays(1));

// 주기적 실행
RecurringJob.AddOrUpdate("daily-report",
    () => GenerateDailyReport(), Cron.Daily);
```

**모니터링 포인트:**
| 포인트 | 수집 방법 |
|--------|----------|
| 잡 상태 | Hangfire Storage API (Redis, SQL Server, MongoDB) |
| 실행 이력 | `BackgroundJob.States` — Enqueued, Processing, Succeeded, Failed |
| 실행 시간 | `SucceededState.Latency`, `ProcessingTime` |
| 내장 대시보드 | `/hangfire` — 실시간 잡 현황 웹 UI |

**프로파일링 가능 범위:**
- AITOP: .NET EventPipe로 CPU/메모리 메트릭 수집
- AITOP Runtime Attach (Phase 34): .NET `dotnet-trace` 기반 메서드 레벨 프로파일링
- SQL 레벨: EF Core 로깅 또는 SQL Server Profiler 연동

---

#### Quartz.NET

Quartz.NET은 Java Quartz를 .NET으로 포팅한 스케줄러입니다.

```csharp
IJobDetail job = JobBuilder.Create<DataSyncJob>()
    .WithIdentity("dataSyncJob")
    .Build();

ITrigger trigger = TriggerBuilder.Create()
    .WithCronSchedule("0 0 2 * * ?")  // 매일 새벽 2시
    .Build();

await scheduler.ScheduleJob(job, trigger);
```

**모니터링 포인트:**
- `IScheduler.GetCurrentlyExecutingJobs()` — 현재 실행 중인 잡 목록
- Quartz ADO.NET JobStore: DB에 실행 이력 저장 (자동)
- 트리거 다음 실행 시간: `ITrigger.GetNextFireTimeUtc()`

---

#### Windows Task Scheduler

Windows 환경에서 .exe나 PowerShell 스크립트를 배치로 실행하는 **OS 내장 스케줄러**입니다.

**배치 실행 방식:**
- 작업 스케줄러 GUI 또는 `schtasks.exe` CLI로 등록
- XML 형식의 작업 정의 파일

**모니터링 포인트:**
```powershell
# 잡 실행 이력 조회
Get-ScheduledTaskInfo -TaskName "DailyReport"
# → LastRunTime, NextRunTime, LastTaskResult (0=성공, 비0=실패)

# 이벤트 로그에서 실행 이력 조회
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational"
```

**프로파일링 가능 범위:**
- AITOP: Windows Task Scheduler XML 파싱 → 등록된 잡 목록 자동 감지
- Windows Event Log 수집 → 실행 성공/실패 이력
- ETW(Event Tracing for Windows)로 프로세스 레벨 CPU/메모리 수집

---

### 2.4 Go: cron 라이브러리 / Temporal

#### robfig/cron (Go cron 라이브러리)

Go에서 가장 많이 쓰이는 경량 크론 라이브러리입니다.

```go
import "github.com/robfig/cron/v3"

c := cron.New()

// 매일 새벽 2시 실행
c.AddFunc("0 2 * * *", func() {
    log.Println("Running daily batch...")
    processDailyOrders()
})

c.Start()
```

**모니터링 포인트:**
- cron 라이브러리 자체에 모니터링 기능 없음
- 커스텀 래퍼로 실행 시작/종료 시간, 오류를 수동 기록해야 함
- AITOP: 프로세스 레벨에서 Go 바이너리 실행 감지 + `pprof` 엔드포인트 수집

**프로파일링 가능 범위:**
```go
// Go 바이너리에 pprof 내장 (흔한 패턴)
import _ "net/http/pprof"

go func() {
    http.ListenAndServe("localhost:6060", nil)
}()
```

- `http://localhost:6060/debug/pprof/` — CPU, 메모리, goroutine 프로파일
- AITOP: pprof HTTP 엔드포인트 자동 감지 후 수집
- perf/eBPF: Go 바이너리도 Linux에서는 perf stat으로 CPU 사이클/명령어 카운트 수집 가능

---

#### Temporal

Temporal은 **분산 워크플로우 오케스트레이션 플랫폼**입니다. Go, Java, Python, TypeScript를 지원하며, 복잡한 장기 실행 배치 워크플로우에 특화됩니다.

```go
// Workflow 정의
func DataProcessingWorkflow(ctx workflow.Context) error {
    // Activity 1: 데이터 추출 (실패 시 자동 재시도)
    err := workflow.ExecuteActivity(ctx, ExtractDataActivity).Get(ctx, nil)
    if err != nil { return err }

    // Activity 2: 데이터 변환
    err = workflow.ExecuteActivity(ctx, TransformDataActivity).Get(ctx, nil)
    return err
}
```

**모니터링 포인트:**
| 포인트 | 수집 방법 |
|--------|----------|
| 워크플로우 상태 | Temporal gRPC API / Web UI |
| Activity 실행 시간 | Temporal 내장 메트릭 (Prometheus 연동) |
| 재시도 횟수 | `WorkflowExecution.attempt` |
| 실패 원인 | `WorkflowExecution.closeStatus` + 이벤트 히스토리 |

---

### 2.5 Node.js: Bull/BullMQ / Agenda / node-cron

#### Bull/BullMQ

BullMQ는 **Node.js Redis 기반 메시지 큐 및 배치 잡 프레임워크**입니다.

```javascript
import { Queue, Worker } from 'bullmq';

// 큐 생성
const emailQueue = new Queue('emailQueue', { connection });

// 잡 추가
await emailQueue.add('sendWelcomeEmail', { userId: 123 });

// 워커 (잡 처리기)
const worker = new Worker('emailQueue', async (job) => {
    await sendEmail(job.data.userId);
}, { connection });

// 주기적 실행 (크론)
await emailQueue.add('dailyReport', {}, {
    repeat: { cron: '0 2 * * *' }
});
```

**모니터링 포인트:**
| 포인트 | 수집 방법 |
|--------|----------|
| 큐 길이 | `queue.getWaitingCount()`, `getActiveCount()` |
| 잡 상태 | `job.getState()` — waiting/active/completed/failed |
| 실행 시간 | `job.processedOn - job.timestamp` |
| 실패율 | `queue.getFailedCount()` |
| BullBoard | 내장 웹 대시보드 (`@bull-board/express`) |

**프로파일링 가능 범위:**
- Node.js Worker 스레드: V8 `--prof` 플래그 또는 `clinic.js`
- AITOP: Node.js `worker_threads` PID 감지 + `/proc/{pid}/stat` CPU 수집
- 이벤트 루프 지연: `perf_hooks.performance.eventLoopUtilization()`

---

#### node-cron

경량 크론 스케줄러로, 프로세스 내에서 실행합니다.

```javascript
import cron from 'node-cron';

cron.schedule('0 2 * * *', () => {
    console.log('Running daily batch...');
    processDailyOrders();
});
```

**모니터링 포인트:**
- 기본 모니터링 기능 없음 (단순 cron)
- AITOP: 프로세스 레벨 감지 + Node.js `--inspect` 프로토콜 연동

---

### 언어별 배치 모니터링 포인트 비교 요약

| 언어/프레임워크 | 내장 모니터링 | SQL 프로파일링 | 스택 프로파일링 | AITOP 수집 방법 |
|----------------|-------------|--------------|--------------|----------------|
| Java / Spring Batch | ★★★★ (메타 DB) | ★★★★ (javaagent 훅킹) | ★★★★ (SFA/javaagent) | Runtime Attach (Phase 34) + javaagent |
| Java / Quartz | ★★★ (QRTZ_* 테이블) | ★★★★ | ★★★ | Runtime Attach |
| Python / Celery | ★★★ (Flower UI) | ★★ (SQLAlchemy 훅) | ★★★ (py-spy) | py-spy attach |
| Python / Airflow | ★★★★ (내장 UI) | ★★ | ★★★ (py-spy) | Airflow REST API + py-spy |
| .NET / Hangfire | ★★★★ (내장 대시보드) | ★★★ (EF Core 로깅) | ★★★ (EventPipe) | dotnet-trace attach |
| Go / cron | ★ (없음) | ★★ (수동) | ★★★ (pprof) | pprof 엔드포인트 + perf |
| Go / Temporal | ★★★★ (내장 UI) | ★★ | ★★★ | Temporal gRPC API + pprof |
| Node.js / BullMQ | ★★★ (BullBoard) | ★ | ★★ (clinic.js) | 프로세스 레벨 + V8 inspector |
| Node.js / node-cron | ★ (없음) | ★ | ★★ | 프로세스 레벨만 |

---

## 3. AITOP 배치 모니터링 설계 제안

지금까지 Scouter의 배치 모니터링 방식과 다양한 언어의 배치 프레임워크를 분석했습니다. 이 섹션에서는 AITOP이 기존 도구들의 한계를 극복하고 차별화된 배치 모니터링을 제공하기 위한 설계를 제안합니다.

---

### 3.1 설계 원칙

#### 원칙 1: 에이전트 하나로 모든 언어 배치 모니터링

Scouter의 가장 큰 한계는 **Java 전용**이라는 점입니다. AITOP은 이미 멀티 언어 런타임 모니터링을 지원(Phase 24~33 완료)하므로, 배치 모니터링도 **별도의 배치 에이전트 없이 AITOP Agent 하나**로 처리합니다.

```
[Scouter 방식]
  WAS 에이전트 (별도 설치) ─── Tomcat 모니터링
  배치 에이전트 (별도 설치) ─── 배치 모니터링
  → 에이전트 2개, 관리 복잡

[AITOP 방식]
  AITOP Agent (하나로 통합) ─── WAS + 배치 + DB + OS + AI 모두 모니터링
  → 에이전트 1개, 단순 관리
```

#### 원칙 2: 프로세스 자동 감지 — 스케줄러 무관하게 동작

배치가 어떤 스케줄러(cron, systemd timer, Windows Task Scheduler, Quartz 등)로 실행되든 AITOP이 자동으로 감지합니다. **"이 프로그램이 배치임을 AITOP에 알려줘야 한다"는 설정 없이도** 프로세스 패턴으로 자동 인식합니다.

#### 원칙 3: 언어 무관 프로파일링 — perf/eBPF + Runtime Attach 연계

Phase 34 (Runtime Attach) + Phase 35 (perf/eBPF) 에서 설계된 모듈을 배치 모니터링에 그대로 적용합니다. 배치도 결국 프로세스이므로, 언어에 상관없이 커널 레벨에서 프로파일링할 수 있습니다.

---

### 3.2 수집 방식

#### 레이어 1: 프로세스 레벨 — 언어 무관 (Linux/Windows 모두)

모든 배치 프로그램은 결국 **OS 프로세스**이므로 언어와 무관하게 수집할 수 있습니다.

```
수집 항목:
  ┌────────────────────────────────────────────────────────┐
  │ PID, 프로세스 이름, 실행 명령어                          │
  │ 실행 시작 시간 (프로세스 생성 시각)                       │
  │ 실행 종료 시간 + 종료 코드 (exit code: 0=정상, 비0=오류)  │
  │ 총 실행 시간 (elapsed time)                              │
  │                                                        │
  │ CPU 사용률 (%) — 실행 구간 평균 및 최대                   │
  │ 메모리 사용량 (RSS/VSZ) — 실행 구간 평균 및 최대           │
  │ 디스크 I/O — 읽기/쓰기 바이트, IOPS                     │
  │ 네트워크 I/O — 송신/수신 바이트                           │
  └────────────────────────────────────────────────────────┘

수집 방법 (Linux):
  /proc/{pid}/stat          → CPU ticks → 사용률 계산
  /proc/{pid}/status        → 메모리 (VmRSS, VmPeak)
  /proc/{pid}/io            → 디스크 I/O (read_bytes, write_bytes)
  /proc/{pid}/net/dev       → 네트워크 I/O
  waitpid() 또는 /proc/{pid}/exitcode → 종료 코드

수집 방법 (Windows):
  WMI/ETW                   → CPU/메모리/I/O
  PROCESS_INFORMATION       → 시작/종료 시각, 종료 코드
  Windows Event Log         → Task Scheduler 실행 이력
```

#### 레이어 2: 런타임 레벨 — 언어별 특화 프로파일링

프로세스 레벨보다 **더 깊은 내부 정보**(어떤 메서드가 느린지, SQL이 몇 건 실행됐는지)를 수집합니다. Phase 34 Runtime Attach 모듈을 통해 **앱 재시작 없이** 실행 중인 배치에 attach합니다.

```
Java 배치:
  - Java Attach API → JVM에 Agent JAR 동적 로드
  - SQL 프로파일링: JDBC Driver 훅킹 (SQL 문, 실행 시간, 건수)
  - 메서드 프로파일링: 주요 클래스/패키지 바이트코드 삽입
  - JVM 메트릭: GC 횟수/시간, Heap 사용량, 스레드 수
  - Spring Batch 감지 시: BATCH_JOB_EXECUTION 테이블 직접 조회

Python 배치:
  - py-spy attach (PID 기반, sudo 불필요 모드 지원)
  - 스택 샘플링 → 어떤 함수에서 시간을 쓰는지 파악
  - SQLAlchemy 이벤트 훅 → SQL 실행 통계
  - Celery Worker: celery inspect 명령으로 태스크 상태 수집

.NET 배치:
  - dotnet-trace attach (EventPipe 기반)
  - CLR EventSource → GC, ThreadPool, HTTP 메트릭
  - EF Core 쿼리 이벤트 → SQL 실행 시간/건수

Go 배치:
  - pprof HTTP 엔드포인트 자동 감지 및 수집
  - /debug/pprof/cpu: CPU 프로파일 (30초 샘플)
  - /debug/pprof/heap: 메모리 프로파일
  - /debug/pprof/goroutine: 고루틴 덤프

Node.js 배치:
  - V8 Inspector 프로토콜 (--inspect 플래그 감지)
  - CPU 프로파일러: Profiler.start/stop
  - 이벤트 루프 지연: perf_hooks.eventLoopUtilization()
```

#### 레이어 3: perf/eBPF 레벨 — 커널+유저 통합 프로파일링

Phase 35에서 설계된 perf/eBPF Collector를 배치 모니터링에 연계합니다. 이 레이어는 **언어에 완전히 무관**하며, 커널 레벨에서 on-CPU/off-CPU 분석이 가능합니다.

```
수집 항목:
  on-CPU 분석  : CPU에서 실제 실행 중인 시간 → 어떤 함수가 CPU를 쓰는가
  off-CPU 분석 : I/O 대기, 락 대기 등 블로킹 시간 → 왜 CPU를 안 쓰고 기다리는가
  memory 프로파일: 메모리 할당 패턴, 누수 가능 지점

수집 도구:
  Linux:   perf record -p {PID} → folded stack → 플레임그래프 SVG
           eBPF (bpftrace/bcc): uprobe로 런타임 무관 함수 추적
  Windows: ETW (Event Tracing for Windows) → WPA로 플레임그래프

플레임그래프 생성:
  배치 실행 구간 선택 → 해당 시간대의 folded stack 데이터
  → flamegraph.pl 또는 speedscope → SVG/JSON
  → UI에서 인터랙티브 플레임그래프로 표시
```

#### 배치 자동 감지 로직

AITOP Agent는 다음 규칙으로 배치 프로세스를 자동 감지합니다:

```
감지 규칙 (우선순위 순):

1. 스케줄러 자식 프로세스 확인
   - cron (ppid가 crond) → 배치로 분류
   - systemd timer → 서비스명에 ".timer" 포함 → 배치로 분류
   - Windows Task Scheduler → taskeng.exe / svchost(Schedule) 자식 → 배치로 분류

2. 프레임워크 패턴 감지
   - 커맨드라인에 "spring-batch", "quartz", "airflow", "celery" 포함
   - Python: "celery worker", "airflow scheduler" 프로세스명
   - .NET: dotnet 실행 + JobHost 패턴

3. 실행 패턴 기반
   - 단발성 실행 프로세스 (1분 이상 실행 후 종료)
   - HTTP 포트 없음 (서버 프로세스가 아님)
   - 높은 CPU/I/O 사용 후 종료

4. 수동 태그 (agent.yaml)
   batch_processes:
     - name: "daily-order-batch"
       pattern: "OrderBatchJob"   # 프로세스 명 패턴
       language: "java"
```

---

### 3.3 배치 대시보드 뷰 설계

#### 뷰 1: 배치 작업 목록 (Batch Job List)

모든 등록된/감지된 배치 작업의 현황을 한눈에 볼 수 있는 테이블 뷰입니다.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  배치 작업 목록  (총 24개 작업 | 실행 중 3 | 오류 1 | 대기 20)               [+ 수동 등록] │
├──────────────────┬──────────────┬────────┬───────────┬──────────┬────────┬────────────┤
│ 작업명           │ 스케줄       │ 상태   │ 마지막 실행 │ 평균 시간 │ 성공률 │ 다음 실행   │
├──────────────────┼──────────────┼────────┼───────────┼──────────┼────────┼────────────┤
│ 일일 매출 정산   │ 매일 02:00   │ ● 완료 │ 2시간 전  │ 42분     │ 99.2%  │ 내일 02:00 │
│ 고객 이메일 발송 │ 매일 09:00   │ ● 실행 │ 지금      │ 18분     │ 100%   │ —          │
│ 데이터 백업      │ 1시간마다    │ ● 완료 │ 45분 전   │ 8분      │ 98.5%  │ 15분 후    │
│ 월말 리포트      │ 매월 1일 00:00│ ⚠ 오류 │ 어제      │ 2시간    │ 83.3%  │ 내달 1일   │
│ 재고 동기화      │ 30분마다     │ ● 완료 │ 12분 전   │ 2분      │ 100%   │ 18분 후    │
└──────────────────┴──────────────┴────────┴───────────┴──────────┴────────┴────────────┘

색상 범례: ● 초록(완료) ● 파랑(실행중) ⚠ 노랑(경고) ● 빨강(실패) ○ 회색(대기)
```

**핵심 설계 포인트:**
- 스케줄 정보: cron/systemd timer/Quartz에서 자동 추출, 사람이 읽기 쉬운 형식으로 변환 ("0 2 * * *" → "매일 02:00")
- 실시간 갱신: 실행 중인 배치는 진행 상황 라이브 업데이트
- 클릭 → 배치 상세 뷰로 이동

#### 뷰 2: 배치 실행 이력 타임라인 (Batch Execution Timeline)

```
배치명: 일일 매출 정산                                          [최근 30일] [최근 90일]

     Jan 25  Jan 26  Jan 27  Jan 28  Jan 29  Jan 30  Jan 31  Feb 01
      ━━━━    ━━━━━   ━━━━    ━━━━    ━━━━    ━━━━    ━━━━    ━━━━━━  (초록: 정상)
      42m     41m     40m     44m     43m     41m    [██████  ⚠경고]   (노랑: 임계치 초과)
                                                      1h 12m

색상:
  ━━━━ 초록: 정상 완료 (42분)
  ━━━━ 노랑: 임계치 초과 (설정값 60분 초과 시)
  ━━━━ 빨강: 실패 (종료 코드 비0)
  ░░░░ 회색: 미실행 (스킵 또는 수동 중단)
```

**핵심 설계 포인트:**
- 타임라인에서 특정 실행 클릭 → 해당 실행의 상세 뷰로 이동
- 실행 시간 트렌드를 시각적으로 보여줌 (갑자기 느려진 날 즉시 인지)
- 임계값 초과 구간은 색상으로 즉시 구분

#### 뷰 3: 배치 상세 뷰 (Batch Execution Detail)

특정 배치 실행을 클릭하면 볼 수 있는 상세 뷰입니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  일일 매출 정산  |  2026-03-25 02:00:15 ~ 02:42:33  (42분 18초)  ● 완료     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [요약]                                                                     │
│    언어: Java (Spring Batch)  |  PID: 12453  |  호스트: batch-server-01     │
│    종료 코드: 0  |  처리 건수: 458,293 건  |  오류 건수: 0 건                │
│                                                                             │
│  [리소스 사용량 타임라인]                            ← 실행 시간 전체 구간    │
│  CPU % │ ▁▂▅███████████████████████████▅▃▁           최대 87%             │
│  MEM MB│ ▁▁▂▂▂▂▂▂▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▃▂▂▂▁           최대 1.2 GB           │
│  I/O   │ ▁▁▁▁▁▁████████████████████████▁▁           최대 450 MB/s         │
│                                                                             │
│  [SQL Top-N]                                         (총 SQL 1,247,832 건) │
│  #  │ SQL 패턴 (요약)                     │ 건수    │ 총시간  │ 평균    │    │
│  1  │ SELECT * FROM orders WHERE date=? │ 458,293 │ 12m 30s │ 1.6ms  │    │
│  2  │ UPDATE orders SET status=? WHERE  │ 458,293 │ 8m 45s  │ 1.1ms  │    │
│  3  │ INSERT INTO invoices (...)        │ 312,847 │ 15m 12s │ 2.9ms  │    │
│  4  │ SELECT * FROM customers WHERE id  │ 458,293 │ 2m 03s  │ 0.3ms  │    │
│                                                                             │
│  [메서드 Top-N] (Runtime Attach 활성 시)                                    │
│  #  │ 메서드명                                   │ 총시간  │ 호출횟수 │     │
│  1  │ OrderProcessor.processRecord()            │ 22m 15s │ 458,293  │     │
│  2  │ InvoiceWriter.write()                     │ 15m 12s │ 312,847  │     │
│  3  │ CustomerService.findById()                │ 2m 03s  │ 458,293  │     │
│                                                                             │
│  [플레임그래프]  [클릭하면 해당 구간 플레임그래프 표시]                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  [실행 타임라인 클릭 가능 구간]                                         │  │
│  │  02:00 ───────────────────────────────────────────────── 02:42      │  │
│  │      ↑ 클릭하면 해당 시간대 플레임그래프 표시                            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 뷰 4: 배치 XLog — 배치 전용 실행 분포 뷰

일반 웹 트랜잭션용 XLog를 배치에 특화해 재설계한 뷰입니다.

```
[배치 XLog]
                                                  실행시간(분)
                                              120 │
                                               90 │  ●(오류)
                                               60 │        ●  ←임계선
                                               45 │   ●●●●●●●●●●
                                               30 │  ●●●●●●●●●●●●●●
                                               15 │  ●●●●●●●●●●●●●●●●●●
                                                0 └─────────────────────────
                                                  03/01  03/15  03/25 (날짜)

X축: 배치 시작 날짜/시간
Y축: 실행 시간 (분)
색상: 초록(정상) / 노랑(임계치 근접) / 빨강(초과 또는 실패)
크기: 처리 건수에 비례 (건수 많을수록 점이 큼)

각 점 클릭 → 해당 실행의 상세 뷰 표시
```

> **비유**: 기존 XLog가 웹 요청의 분포를 보여주는 산점도라면, 배치 XLog는 **각 배치 실행을 하나의 점**으로 표시하여 "언제 배치가 느렸는지", "어떤 날 실패했는지"를 한눈에 보여줍니다.

#### 뷰 5: 배치 플레임그래프 연동

Phase 35 perf/eBPF Collector와 연계하여 배치 실행 중 특정 시간대의 플레임그래프를 조회합니다.

```
[플레임그래프 생성 흐름]

1. 배치 시작 감지 → perf/eBPF 자동 활성화 (설정 시)
     또는
   배치 실행 이력에서 특정 구간 수동 선택

2. 해당 배치 PID에 대한 folded stack 데이터 수집
   (on-CPU: CPU 실제 소비 구간)
   (off-CPU: I/O 대기, 락 대기 구간)

3. AITOP Server에서 플레임그래프 SVG 생성
   또는 speedscope JSON 포맷으로 전달

4. UI에서 인터랙티브 플레임그래프 표시
   - 넓은 프레임 = 시간을 많이 소비하는 함수
   - 색상: 파랑(Java) / 초록(Python) / 빨강(C/커널)
   - 클릭하면 해당 함수의 소스 코드 위치 표시 (가능 시)
```

플레임그래프 예시 (텍스트 표현):
```
all (100%)
└── main (100%)
    └── BatchRunner.run (98%)
        ├── OrderProcessor.processRecord (54%)
        │   ├── CustomerService.findById (22%)   ← DB 조회가 시간 소비
        │   │   └── HikariCP.getConnection (18%)  ← 커넥션 풀 대기 병목!
        │   └── OrderValidator.validate (32%)
        └── InvoiceWriter.write (44%)
            └── PreparedStatement.executeBatch (43%)
```

#### 뷰 6: 배치 알림 설정

```
[배치 알림 규칙]

규칙 1: 실행 시간 임계치 초과
  조건: 실행 시간 > 60분
  대상: 일일 매출 정산, 월말 리포트
  채널: Slack #batch-alert, 이메일 ops@company.com

규칙 2: 배치 실패 (종료 코드 비0)
  조건: exit_code ≠ 0
  대상: 전체 배치
  채널: PagerDuty (즉시 온콜)

규칙 3: 리소스 사용량 급증
  조건: CPU > 90% 지속 5분 이상, 또는 메모리 > 4GB
  대상: 전체 배치
  채널: Slack #batch-alert

규칙 4: 미실행 감지 (SLA 위반)
  조건: 일일 매출 정산이 03:00까지 시작되지 않음
  채널: PagerDuty (즉시 온콜)
```

---

### 3.4 Scouter 대비 차별화

| 항목 | Scouter 배치 모니터링 | AITOP 배치 모니터링 |
|------|---------------------|-------------------|
| **지원 언어** | Java 전용 | Java/Python/.NET/Go/Node.js (전 언어) |
| **에이전트 수** | 2개 (WAS 에이전트 + 배치 에이전트) | 1개 (AITOP Agent 통합) |
| **설치 방식** | javaagent 수동 설정 필요 | 프로세스 자동 감지 (설정 최소화) |
| **실시간 모니터링** | 미약 (주로 사후 분석) | 실시간 실행 현황 대시보드 |
| **SQL 프로파일링** | ★★★★ (JDBC 훅킹) | ★★★★ (JDBC 훅킹 + ORM 레이어) |
| **스택 분석** | SFA (텍스트 형태) | 플레임그래프 (인터랙티브 시각화) |
| **배치 XLog** | 없음 | 배치 전용 XLog/히트맵 |
| **스케줄 연동** | 없음 | cron/systemd/Quartz 자동 파싱 |
| **알림 채널** | 이메일 | Slack/PagerDuty/Webhook 등 |
| **UI** | Eclipse 두꺼운 클라이언트 | 웹 기반 대시보드 (모바일 지원) |
| **멀티 호스트** | Fleet 관리 없음 | Fleet Dashboard로 전체 배치 서버 통합 관리 |
| **AI 서비스 배치** | 미지원 | LLM 배치, 임베딩 배치, GPU 배치 통합 모니터링 |

#### 핵심 차별화: 멀티 언어 + 플레임그래프 = "배치 성능 원인 즉시 파악"

```
[Scouter SFA 결과]                    [AITOP 플레임그래프]

텍스트 형태:                           인터랙티브 시각화:
빈도  메서드                           ┌─────────────────────────────────────┐
85%   OrderProcessor.processRecord    │ all (100%)                          │
72%   HikariCP.getConnection          │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
41%   String.format                   │   processRecord (85%)               │
...                                   │   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓       │
                                      │     HikariCP (72%) ← 클릭!          │
"어디가 병목인지 눈에 잘 안 들어옴"     │     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓    │
                                      └─────────────────────────────────────┘
                                      "넓을수록 느린 함수 — 즉시 파악 가능"
```

---

### 3.5 구현 로드맵 (Phase 제안)

#### 의존성 그래프

```
Phase 34 (Runtime Attach) ──────┐
                                 ▼
Phase 35 (perf/eBPF) ──────────▶ Phase 36 (배치 모니터링 Core)
                                 │
AITOP Agent (Fleet) ────────────┘
                                 ▼
                          Phase 37 (배치 대시보드 UI)
                                 ▼
                          Phase 38 (배치 알림 + SLA 관리)
```

---

#### Phase 36: 배치 모니터링 Core — 프로세스 감지 + 수집 파이프라인

**목적**: 배치 프로세스를 자동 감지하고 프로세스 레벨 메트릭 수집 파이프라인 구축

**작업 내용:**

| 작업 | 상세 | 예상 작업량 |
|------|------|-----------|
| 배치 프로세스 감지기 구현 | cron/systemd/WTS 자식 프로세스 감지 로직 | 중 (3~5일) |
| 프로세스 레이어 Collector | `/proc/{pid}/stat,io,status` 폴링 (Linux) | 소 (2일) |
| Windows 지원 | ETW/WMI 기반 프로세스 메트릭 수집 | 중 (3일) |
| 배치 생명주기 관리 | 시작/실행중/완료/실패 상태 추적 | 소 (2일) |
| BatchExecution 데이터 모델 | DB 스키마 설계 및 저장 | 소 (1일) |
| Java Spring Batch 연동 | BATCH_JOB_EXECUTION 테이블 자동 감지 | 소 (2일) |
| Airflow REST API 연동 | DAG/Task 실행 이력 수집 | 소 (2일) |

**완료 기준:**
- Java/Python/Go 배치 프로세스가 설정 없이 자동 감지됨
- 프로세스 CPU/메모리/I/O/종료코드 수집 확인
- Spring Batch 실행 이력 자동 수집 확인

**의존성**: AITOP Agent 기본 구조 (완료), Phase 34 Runtime Attach (권장)

---

#### Phase 37: 배치 대시보드 UI — 4개 핵심 뷰 구현

**목적**: 배치 모니터링 전용 대시보드 UI 4개 화면 구현

**작업 내용:**

| 뷰 | 작업 | 예상 작업량 |
|----|------|-----------|
| 배치 작업 목록 | 테이블 + 상태 배지 + 다음 실행 시간 | 소 (2일) |
| 실행 이력 타임라인 | 달력형 타임라인, 컬러 코딩 | 중 (3일) |
| 배치 상세 뷰 | 리소스 타임라인 + SQL Top-N + 메서드 Top-N | 중 (4일) |
| 배치 XLog | XLog 산점도 (배치 전용 X/Y축 설계) | 중 (3일) |
| 플레임그래프 연동 | Phase 35 플레임그래프 뷰어 배치 상세에 통합 | 소 (2일) |

**완료 기준:**
- 배치 목록 화면에서 실행 중인 배치 실시간 확인 가능
- 배치 클릭 시 상세 뷰 (SQL Top-N, 리소스 타임라인) 표시
- 배치 실행 구간에서 플레임그래프 표시 가능

**의존성**: Phase 36 완료, Phase 35 (플레임그래프 연동)

---

#### Phase 38: 배치 알림 + SLA 관리

**목적**: 배치 임계치 기반 알림 및 SLA(Service Level Agreement) 위반 감지

**작업 내용:**

| 작업 | 상세 | 예상 작업량 |
|------|------|-----------|
| 알림 규칙 엔진 | 실행 시간/실패/리소스 임계치 설정 | 소 (2일) |
| SLA 위반 감지 | 정해진 시간까지 배치 미완료 감지 | 소 (2일) |
| 알림 채널 연동 | Slack/PagerDuty/이메일/Webhook | 소 (2일) |
| 알림 이력 관리 | 알림 발생 이력 조회, 중복 알림 방지 | 소 (1일) |
| 배치 알림 UI | 알림 규칙 설정 화면 | 소 (2일) |

**완료 기준:**
- 배치 실패 시 30초 이내 Slack 알림 수신 확인
- SLA 위반 감지 동작 확인
- 알림 규칙 UI에서 CRUD 동작 확인

**의존성**: Phase 36, Phase 37 완료

---

#### Phase 로드맵 요약표

| Phase | 이름 | 주요 기능 | 의존성 | 우선순위 | 예상 작업량 |
|-------|------|---------|--------|---------|-----------|
| **36** | 배치 모니터링 Core | 프로세스 감지, 수집 파이프라인, Spring Batch 연동 | Agent 기본, Phase 34 | P0 | 2~3주 |
| **37** | 배치 대시보드 UI | 4개 핵심 뷰, 배치 XLog, 플레임그래프 연동 | Phase 36, Phase 35 | P0 | 2~3주 |
| **38** | 배치 알림 + SLA | 임계치 알림, SLA 위반 감지, 알림 채널 | Phase 36, Phase 37 | P1 | 1~2주 |
| **39** | 고급 배치 분석 | 회귀 분석, 이상 감지, 배치 간 상관관계 | Phase 37 | P2 | 3~4주 |

> **우선순위 기준**:
> - P0: 배치 모니터링 MVP(최소 기능 제품)에 필수
> - P1: 운영팀이 배치 문제를 인지하는 데 필요
> - P2: 장기적 성능 개선 및 분석에 필요

---

## 결론

### Scouter에서 배운 것

Scouter 배치 모니터링은 Java 배치에 대한 깊은 이해를 바탕으로 설계되었습니다:

1. **통계 기반 수집**: 건별 수집의 오버헤드 문제를 집계 방식으로 해결 → AITOP도 동일 원칙 적용
2. **임계값 필터링**: 짧은 배치는 전송 안 함 → AITOP도 설정 가능한 필터링 제공
3. **SFA (스택 샘플링)**: 낮은 오버헤드로 성능 병목 탐지 → AITOP은 플레임그래프로 발전

### AITOP이 뛰어넘는 것

| 차원 | Scouter | AITOP |
|------|---------|-------|
| **언어** | Java 전용 | 전 언어 (Java/Python/.NET/Go/Node.js) |
| **에이전트** | 2개 (WAS+배치) | 1개 (통합) |
| **가시성** | 텍스트 통계 | 인터랙티브 플레임그래프 |
| **실시간성** | 사후 분석 중심 | 실시간 대시보드 |
| **AI 배치** | 미지원 | LLM/GPU 배치 통합 모니터링 |

배치 모니터링은 AITOP이 "AI 서비스 운영의 글로벌 표준"이 되기 위한 핵심 기능 중 하나입니다. 기업의 핵심 업무(정산, 데이터 동기화, 리포트 생성)가 배치로 처리되는 경우가 많으며, 이를 모니터링하지 못하면 장애가 발생해도 즉각 인지하기 어렵습니다.

Phase 36~38을 통해 AITOP은 기존 APM이 다루지 못했던 **배치 모니터링 영역을 통합**하여, 웹 서비스와 배치 프로그램을 하나의 플랫폼에서 관리할 수 있는 진정한 통합 모니터링 솔루션이 됩니다.

---

## 4. 대규모 배치 성능 최적화 — 은행/금융권 엔터프라이즈 대응

### 4.1 대규모 배치의 현실

은행, 카드사, 보험사 등 금융권에서는 다음과 같은 대규모 배치가 일상적입니다:

| 배치 유형 | 처리 건수 | 소요 시간 | SLA | 빈도 |
|----------|----------|----------|-----|------|
| 일일 정산 (EOD Settlement) | 500만~5,000만 건 | 1~6시간 | 업무시작(09:00) 전 완료 | 매일 |
| 이자 계산 (Interest Calc) | 1,000만~1억 건 | 2~8시간 | 마감일 자정 전 완료 | 매월 |
| 카드 매출 승인 집계 | 2,000만~3,000만 건 | 3~5시간 | 다음날 07:00 전 | 매일 |
| 보험료 산출 | 500만~2,000만 건 | 2~4시간 | 다음날 업무시작 전 | 매월 |
| 대출 연체 관리 | 100만~500만 건 | 30분~2시간 | 업무시작 전 | 매일 |
| 규제 보고 (금감원) | 전 계좌 | 6~24시간 | 보고 기한 전 | 분기 |
| 데이터 마이그레이션 | 수억 건 | 12~72시간 | 주말 내 완료 | 비정기 |

**핵심 문제**: 대부분의 금융 기관은 배치가 **"완료/실패"만 모니터링**하고, **"왜 6시간 걸리는지"**, **"어디를 고치면 3시간으로 줄일 수 있는지"**를 분석하지 못합니다.

### 4.2 경쟁사/시장 분석 — 배치 성능 최적화 솔루션

#### 4.2.1 기존 배치 모니터링 솔루션

| 솔루션 | 유형 | 성능 최적화 기능 | 한계 |
|--------|------|---------------|------|
| **Control-M** (BMC) | 배치 스케줄러 | 실행 순서 최적화, 병렬화 제안 | 코드 레벨 병목 미분석. 스케줄링만 담당 |
| **Automic** (Broadcom) | 워크플로우 자동화 | SLA 기반 스케줄링, 리소스 밸런싱 | APM 연동 없음. 인프라 자원 배분만 |
| **Autosys** (CA/Broadcom) | 배치 스케줄러 | 의존성 관리, 캘린더 기반 | 성능 분석 기능 전무 |
| **Tivoli Workload Scheduler** (IBM) | 엔터프라이즈 스케줄러 | 워크로드 예측, 자원 할당 | SQL/코드 레벨 분석 불가 |
| **Spring Batch Admin** | 오픈소스 | Step별 실행 시간 조회 | 단순 조회만. 최적화 제안 없음 |
| **Scouter Batch** | 오픈소스 APM | SQL 통계 + SFA 스택 분석 | Java 전용. 최적화 권고 없음 |

#### 4.2.2 APM 솔루션의 배치 모니터링

| APM | 배치 모니터링 | 성능 최적화 | 평가 |
|-----|-------------|-----------|------|
| **Datadog** | 커스텀 메트릭으로 수동 구현 | 없음 | 웹 트랜잭션 중심, 배치 비전문 |
| **Dynatrace** | OneAgent로 자동 감지 | PurePath로 코드 레벨 분석 가능 | 배치 전용 뷰 없음. 최적화 권고 없음 |
| **WhaTap** | Java 배치 기본 모니터링 | 없음 | 실행/완료만 확인 |
| **New Relic** | Background Jobs 추적 | 없음 | Celery/Sidekiq 수준 |
| **Scouter** | SQL 통계 + SFA | SFA로 병목 탐지 가능 | 텍스트 기반, 자동 권고 없음 |

#### 4.2.3 시장 공백

```
┌──────────────────────────────────────────────────────────────────┐
│                     시장 공백 (Market Gap)                         │
│                                                                   │
│  기존 솔루션이 하는 것:                                             │
│    ✅ 배치 시작/완료/실패 모니터링                                  │
│    ✅ 실행 시간 추이 조회                                          │
│    ✅ 스케줄 관리 (Control-M, Autosys)                             │
│    ✅ SQL 통계 (Scouter)                                          │
│                                                                   │
│  기존 솔루션이 하지 못하는 것:                                       │
│    ❌ "왜 이 배치가 6시간 걸리는지" 자동 분석                        │
│    ❌ "어떤 SQL을 고치면 3시간으로 줄일 수 있는지" 구체적 권고        │
│    ❌ "지난달 대비 왜 30분 더 걸리는지" 회귀 분석                    │
│    ❌ "청크 크기를 1000→5000으로 바꾸면 20% 빨라진다" 튜닝 시뮬레이션│
│    ❌ "데이터 증가 추세로 볼 때 3개월 후 SLA 위반 예측" 용량 계획     │
│                                                                   │
│  ★ AITOP이 채울 영역:                                              │
│    배치 모니터링 + 성능 자동 분석 + 구체적 최적화 권고               │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 AITOP 배치 성능 최적화 엔진 설계

#### 4.3.1 최적화 분석 6종

```
┌──────────────────────────────────────────────────────────────────┐
│ AITOP Batch Optimization Engine — 6가지 자동 분석                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ① SQL 병목 분석 (SQL Bottleneck Analysis)                        │
│     ─────────────────────────────────────                        │
│     입력: 배치 실행 중 수집된 SQL 통계                              │
│     분석:                                                        │
│       - SQL별 총 소요 시간 비중 (Pareto 분석)                      │
│       - 실행 계획(EXPLAIN) 자동 수집 → 풀스캔/인덱스 미사용 탐지    │
│       - N+1 패턴 감지 (동일 SQL이 건수만큼 반복)                   │
│       - 불필요한 조회 감지 (SELECT 결과 미사용 패턴)                │
│     출력:                                                        │
│       "INSERT INTO invoices 가 전체 시간의 36%를 차지합니다.       │
│        EXPLAIN 결과 orders 테이블 풀스캔 중. idx_orders_date       │
│        인덱스 추가 시 예상 개선: 45분 → 15분 (67% 감소)"          │
│                                                                   │
│  ② 청크/배치 크기 최적화 (Chunk Size Optimization)                 │
│     ─────────────────────────────────────                        │
│     입력: 청크별 처리 시간, 커밋 빈도, 메모리 사용량                 │
│     분석:                                                        │
│       - 현재 청크 크기별 처리 속도 곡선                             │
│       - 메모리 한계 내 최적 청크 크기 계산                          │
│       - 커밋 빈도 vs 재처리 비용 트레이드오프                       │
│     출력:                                                        │
│       "현재 청크 크기 1,000건에서 초당 2,300건 처리.               │
│        청크 크기를 5,000건으로 변경 시 초당 4,800건 예상            │
│        (커밋 횟수 80% 감소, DB 라운드트립 절감).                    │
│        단, 메모리 사용량 1.2GB → 2.8GB 증가 예상. 현재 힙 4GB에서  │
│        충분한 여유."                                               │
│                                                                   │
│  ③ 실행 시간 회귀 분석 (Execution Time Regression)                 │
│     ─────────────────────────────────────                        │
│     입력: 최근 30~90일 배치 실행 이력                               │
│     분석:                                                        │
│       - 실행 시간 트렌드 (선형/지수 회귀)                           │
│       - 데이터 건수 증가와 실행 시간 상관관계                       │
│       - 변곡점 감지 (갑자기 느려진 시점 → 배포/DB 변경 연관)        │
│       - SLA 위반 예측 (현재 트렌드로 N일 후 임계치 초과)            │
│     출력:                                                        │
│       "일일 정산 배치 실행 시간이 3개월간 42분 → 58분으로 증가.     │
│        주요 원인: orders 테이블 일일 증가량 12만 건/일.              │
│        현재 추세 유지 시 45일 후 SLA(90분) 위반 예상.               │
│        권고: orders 테이블 파티셔닝 적용 또는 아카이빙 정책 수립."   │
│                                                                   │
│  ④ 리소스 사용 효율 분석 (Resource Efficiency)                      │
│     ─────────────────────────────────────                        │
│     입력: 배치 실행 중 CPU/Memory/IO 시계열                        │
│     분석:                                                        │
│       - CPU 유휴 구간 탐지 (I/O 바운드 확인 → 병렬화 가능성)       │
│       - 메모리 피크 vs 평균 (GC 과다 여부)                         │
│       - 디스크 I/O 경합 (다른 배치와 동시 실행 시)                  │
│       - DB 커넥션 풀 대기 시간 (풀 크기 부족 탐지)                  │
│     출력:                                                        │
│       "배치 실행 중 CPU 평균 23%, I/O Wait 67%.                    │
│        I/O 바운드 배치입니다. 처리 스레드를 4→8개로 늘리면           │
│        I/O 파이프라이닝으로 예상 개선: 4시간 → 2.5시간.             │
│        단, DB 커넥션 풀을 20→40으로 함께 확대 필요."               │
│                                                                   │
│  ⑤ 병렬화 기회 분석 (Parallelization Opportunity)                   │
│     ─────────────────────────────────────                        │
│     입력: 배치 Step 구조 + Step별 실행 시간                        │
│     분석:                                                        │
│       - Step 간 의존성 그래프 (선행 조건 없는 Step = 병렬 가능)     │
│       - 데이터 파티셔닝 가능성 (날짜/지역/계좌번호 기반 분할)       │
│       - Worker 수 최적화 (처리량 vs 리소스 제한)                    │
│     출력:                                                        │
│       "현재 3개 Step이 순차 실행 중 (총 4시간).                     │
│        Step 2(이자계산)과 Step 3(수수료계산)은 의존성 없음.          │
│        병렬 실행 시 예상 개선: 4시간 → 2.5시간.                    │
│        추가로 Step 2를 계좌번호 범위별 4파티션 분할 시               │
│        예상 개선: 2.5시간 → 1.2시간."                              │
│                                                                   │
│  ⑥ 비교 분석 (Comparative Analysis)                                │
│     ─────────────────────────────────────                        │
│     입력: 동일 배치의 복수 실행 이력                                 │
│     분석:                                                        │
│       - 정상 실행 vs 느린 실행의 SQL 패턴 차이                      │
│       - 정상 실행 vs 느린 실행의 리소스 사용 차이                   │
│       - 배포 전후 성능 비교 (코드 변경 영향 분석)                   │
│       - 동일 배치의 서버별 성능 차이 (인프라 문제 격리)              │
│     출력:                                                        │
│       "3/25 실행(42분)과 3/28 실행(72분) 비교 결과:                │
│        - SELECT orders 쿼리 건당 평균: 0.3ms → 1.8ms (6배 증가)   │
│        - 원인: 3/27 배포에서 WHERE 절 인덱스 컬럼 변경 감지         │
│        - 권고: idx_orders_status 인덱스 복원 또는 쿼리 수정"        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

#### 4.3.2 최적화 리포트 자동 생성

배치 실행 완료 후 자동으로 **최적화 리포트**를 생성합니다:

```
┌──────────────────────────────────────────────────────────────────┐
│ 배치 성능 최적화 리포트                                           │
│ 일일 매출 정산 (EOD Settlement) — 2026-03-29 02:00~05:42        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ■ 실행 요약                                                      │
│   실행 시간: 3시간 42분 (SLA 6시간, 여유 38%)                     │
│   처리 건수: 4,823,491건                                         │
│   처리 속도: 21,700 건/분                                         │
│   종료 코드: 0 (정상)                                             │
│                                                                   │
│ ■ 성능 등급: B (양호)                                             │
│   A: SLA 대비 50% 이상 여유                                       │
│   B: SLA 대비 30~50% 여유 ← 현재                                 │
│   C: SLA 대비 10~30% 여유 (주의)                                  │
│   D: SLA 위반 위험 (즉시 조치)                                    │
│   F: SLA 위반 (장애)                                              │
│                                                                   │
│ ■ Top-3 최적화 권고                                               │
│                                                                   │
│   1. [HIGH] SQL 병목: INSERT INTO invoices (36% 비중)             │
│      현재: 벌크 INSERT 1건씩 → 건당 2.9ms                        │
│      권고: executeBatch(1000) 사용 시 → 건당 0.1ms 예상           │
│      예상 절감: 45분 → 5분 (40분 절감)                            │
│                                                                   │
│   2. [MEDIUM] 청크 크기 비효율                                    │
│      현재: 1,000건 청크, 4,823 커밋                               │
│      권고: 5,000건 청크, 965 커밋 (80% 커밋 감소)                  │
│      예상 절감: 커밋 오버헤드 12분 → 3분 (9분 절감)                │
│                                                                   │
│   3. [LOW] 미사용 조회 감지                                       │
│      SELECT customer_detail ... 458,293회 호출                    │
│      결과 중 address 컬럼만 사용 (30개 컬럼 중 1개)                │
│      권고: SELECT address FROM customer_detail 으로 변경           │
│      예상 절감: 네트워크 I/O 60% 감소 → 약 5분 절감               │
│                                                                   │
│ ■ 전체 예상 개선: 3시간 42분 → 2시간 48분 (24% 단축)              │
│                                                                   │
│ ■ SLA 위반 예측                                                   │
│   현재 데이터 증가 추세: +12만 건/일                               │
│   SLA 위반 예측일: 2026-06-15 (78일 후)                           │
│   권고: 위 최적화 적용 시 SLA 여유 12개월 이상 확보                │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

#### 4.3.3 장시간 배치 실시간 모니터링

1시간 이상 걸리는 대규모 배치를 위한 **실시간 진행 모니터링**:

```
┌──────────────────────────────────────────────────────────────────┐
│ 일일 매출 정산 — 실행 중 (2시간 15분 경과)                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 진행률: ███████████████████░░░░░░░░░░  62.3% (3,005,412 / 4.8M)  │
│ 예상 완료: 03:38 (1시간 23분 남음)  |  SLA 여유: 2시간 22분       │
│                                                                   │
│ [Step별 진행 상황]                                                │
│  Step 1: 데이터 추출        ██████████████████████ 100% (완료, 32분)│
│  Step 2: 정산 계산          ████████████████░░░░░  78% (1시간 28분) │
│  Step 3: 결과 적재          ░░░░░░░░░░░░░░░░░░░░  대기             │
│                                                                   │
│ [실시간 처리 속도]                                                │
│  현재 속도: 22,400 건/분  |  평균: 21,700 건/분                   │
│  속도 트렌드:                                                     │
│  25K │  ▂▃▄▅▆▇█████████████████████████▇▆▅▄▃                    │
│  20K │                                                            │
│  15K │                                                            │
│       02:00     02:30     03:00     03:30     04:00               │
│                                                                   │
│ [실시간 리소스]                                                   │
│  CPU: ████████░░ 78%  |  MEM: ██████░░░░ 2.1/4GB  |  I/O: 320MB/s│
│  DB Conn: ████████████████░░░░ 38/50                              │
│                                                                   │
│ [실시간 SQL Top-3]                                                │
│  INSERT invoices: 1.8ms/건 (정상)                                 │
│  SELECT orders:   0.4ms/건 (정상)                                 │
│  UPDATE status:   ⚠ 3.2ms/건 (지난 10분 2배 증가)                │
│                                                                   │
│ ⚠ 이상 감지: UPDATE status 레이턴시 증가 중 (Lock 경합 의심)       │
│   → Lock 상세 보기 | 플레임그래프 보기 | 알림 설정                  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.4 구현 로드맵 (Phase 39 확장)

기존 Phase 36~38에 이어서:

| Phase | 이름 | 주요 기능 | 예상 |
|-------|------|---------|------|
| **39-1** | SQL 병목 자동 분석 | SQL Pareto 분석, EXPLAIN 자동 수집, N+1 감지, 인덱스 권고 | 2주 |
| **39-2** | 청크/병렬화 분석 | 청크 크기 최적화, Step 병렬화 기회, Worker 수 권고 | 2주 |
| **39-3** | 회귀 분석 + SLA 예측 | 실행 시간 트렌드, 데이터 증가 상관관계, SLA 위반 예측 | 2주 |
| **39-4** | 리소스 효율 분석 | CPU/IO 바운드 판별, 커넥션 풀 최적화, GC 튜닝 권고 | 1주 |
| **39-5** | 비교 분석 + 리포트 | 정상 vs 이상 실행 비교, 배포 전후 비교, 자동 리포트 생성 | 2주 |
| **39-6** | 장시간 배치 실시간 뷰 | 실시간 진행률, Step별 현황, 속도 트렌드, 이상 감지 | 2주 |

### 4.5 경쟁 우위 요약

| 기능 | Control-M | Scouter | Datadog | Dynatrace | **AITOP** |
|------|:---------:|:-------:|:-------:|:---------:|:---------:|
| 배치 실행 모니터링 | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| SQL 통계 | ❌ | ✅ | ❌ | ✅ | ✅ |
| 플레임그래프 | ❌ | ❌ | ✅ | ✅ | ✅ |
| SQL 병목 자동 분석 | ❌ | ❌ | ❌ | ❌ | **✅** |
| 인덱스/쿼리 최적화 권고 | ❌ | ❌ | ❌ | ❌ | **✅** |
| 청크 크기 최적화 | ❌ | ❌ | ❌ | ❌ | **✅** |
| 병렬화 기회 분석 | ❌ | ❌ | ❌ | ❌ | **✅** |
| 실행 시간 회귀 분석 | ❌ | ❌ | ❌ | ❌ | **✅** |
| SLA 위반 예측 | ⚠️ | ❌ | ❌ | ❌ | **✅** |
| 비교 분석 (배포 전후) | ❌ | ❌ | ❌ | ⚠️ | **✅** |
| 자동 최적화 리포트 | ❌ | ❌ | ❌ | ❌ | **✅** |
| 장시간 배치 실시간 뷰 | ⚠️ | ❌ | ❌ | ❌ | **✅** |
| 멀티 언어 지원 | N/A | ❌ (Java only) | ✅ | ✅ | **✅** |
| 온프레미스 배포 | ✅ | ✅ | ❌ | ⚠️ | **✅** |

> **AITOP의 핵심 차별화**: "배치가 완료/실패했다"를 넘어, **"왜 느린지, 어떻게 고치면 빨라지는지, 언제 SLA를 위반할지"**를 자동으로 분석하고 구체적인 권고를 제공하는 **유일한 솔루션**입니다.

---

*문서 이력*
| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| v1.0.0 | 2026-03-25 | 최초 작성 — Scouter 배치 분석 + 멀티 언어 배치 프레임워크 분석 + AITOP 설계 제안 |
| v1.1.0 | 2026-03-29 | §4 추가 — 대규모 배치 성능 최적화 엔진, 은행/금융권 대응, 경쟁사 분석, 6종 자동 분석, 최적화 리포트, 장시간 배치 실시간 뷰, Phase 39 로드맵 |
