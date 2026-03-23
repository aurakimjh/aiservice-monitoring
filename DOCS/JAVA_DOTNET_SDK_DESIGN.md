# Java / .NET SDK 지원 및 메소드 프로파일링 통합 설계

> **문서 버전**: v1.0.0
> **작성일**: 2026-03-23 (Session 28)
> **상태**: 설계 완료, 구현 대기 (Phase 24 예정)
>
> **관련 문서**:
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — OTel + Agent 통합 아키텍처
> - [METRICS_DESIGN.md](./METRICS_DESIGN.md) — 지표 정의 및 수집 방안
> - [XLOG_DASHBOARD_REDESIGN.md](./XLOG_DASHBOARD_REDESIGN.md) — XLog/HeatMap 대시보드 설계
> - [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md) — 솔루션 방향성 및 경쟁 분석

---

## 이 문서를 읽기 전에 — 핵심 개념 이해하기

### 바이트코드 계측이란?

Java와 .NET은 **소스코드를 직접 실행하지 않습니다.** 컴파일된 중간 언어(바이트코드)를 JVM/CLR이 실행합니다.

**비유**: 택배 차량이 물건을 싣기 전에 자동으로 GPS 추적기를 부착하는 것처럼, 바이트코드 계측은 애플리케이션을 **재컴파일하지 않고** 메소드 진입/종료 시점에 자동으로 성능 측정 코드를 삽입합니다.

```
소스코드 → [컴파일] → 바이트코드 → [JVM/CLR 로드 시 Agent 개입] → 계측된 실행
                                           ↑
                                    여기서 메소드 시작/종료 시간 자동 측정
```

### 메소드 콜 트리란?

하나의 HTTP 요청이 처리될 때 내부적으로 수십~수백 개의 메소드가 호출됩니다.

**비유**: 레스토랑 주문 → 주방장 지시 → 각 파트 조리 → 플레이팅 → 서빙. 메소드 콜 트리는 이 전체 과정을 **시간 순서 + 계층 구조**로 보여줍니다.

```
HTTP GET /api/recommend          (총 245ms)
├─ AuthFilter.doFilter()         (2ms)
├─ RecommendController.get()     (240ms)
│   ├─ UserService.getProfile()  (15ms)
│   │   └─ UserDAO.findById()    (14ms)  ← SQL: SELECT * FROM users WHERE id=?
│   ├─ MLService.predict()       (198ms) ← ← 병목!
│   │   ├─ FeatureExtractor.run() (45ms)
│   │   └─ ModelInference.call() (150ms) ← HTTP to Python LLM
│   └─ CacheService.put()        (2ms)
└─ ResponseMapper.toJSON()       (3ms)
```

### 왜 Java/.NET을 지원해야 하나?

APM 시장의 현실을 보면 명확합니다:
- **전체 엔터프라이즈 백엔드의 60~70%**가 Java 또는 .NET으로 작성됨
- Spring Boot (Java), ASP.NET Core (.NET)은 AI 서비스를 호출하는 **프론트엔드 게이트웨이** 역할
- "Java Spring → Python LLM 호출 → Java 응답 처리" 패턴이 실제 엔터프라이즈에서 가장 흔함
- 기존 APM 시장 리더(Datadog, Dynatrace, AppDynamics)는 모두 Java 에이전트를 핵심으로 함

---

## 목차

1. [배경 및 필요성](#1-배경-및-필요성)
2. [Java SDK 설계](#2-java-sdk-설계)
3. [.NET SDK 설계](#3-net-sdk-설계)
4. [메소드 프로파일링 데이터 모델](#4-메소드-프로파일링-데이터-모델)
5. [XLog 통합 뷰 설계](#5-xlog-통합-뷰-설계)
6. [AI 서비스 융합 시나리오](#6-ai-서비스-융합-시나리오)
7. [수집 메트릭 확장](#7-수집-메트릭-확장)
8. [구현 로드맵](#8-구현-로드맵)

---

## 1. 배경 및 필요성

### 1.1 현재 SDK 지원 현황

| 언어 | SDK | 계측 방식 | 상태 |
|------|-----|----------|------|
| Python | OTel Python SDK | 자동 + 수동 | ✅ 완료 |
| Node.js | OTel Node SDK | 자동 (require hook) | ✅ 완료 |
| Go | OTel Go SDK | 수동 (코드 삽입) | ✅ 완료 |
| **Java** | **OTel Java Agent** | **바이트코드 자동 계측** | 📋 설계 완료, 구현 예정 |
| **.NET** | **OTel .NET SDK + CLR Profiler** | **바이트코드 자동 계측** | 📋 설계 완료, 구현 예정 |

### 1.2 APM 시장에서 Java/.NET의 중요성

```
APM 시장 점유율 기준 언어별 고객 비중 (추정)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Java          ████████████████████████ 45%
.NET (C#)     ██████████████ 25%
Python        █████████ 17%
Node.js       ███ 6%
Go/기타       ██ 4%  ←── 현재 AITOP이 여기만 지원
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**경쟁 솔루션 비교**:
- **Datadog APM**: Java/Python/Ruby/.NET/Go/Node/PHP 전체 지원 → 시장 리더
- **Dynatrace**: Java 바이트코드 계측 기반 → 엔터프라이즈 1위
- **Scouter (오픈소스)**: Java 전용, 메소드 프로파일링 특화 → 국내 APM 표준
- **Pinpoint (오픈소스)**: Java/.NET 지원, 분산 트레이싱 특화
- **AITOP (현재)**: Python/Node/Go만 지원 → **시장의 70% 커버 불가**

### 1.3 엔터프라이즈 AI 서비스의 실제 아키텍처

실제 기업의 AI 서비스는 순수 Python으로만 이루어지지 않습니다:

```
[사용자 브라우저]
      │
      ▼
[Java Spring Boot Gateway]   ← 인증, 라우팅, 비즈니스 로직
      │
      ├──▶ [Python FastAPI + LLM]   ← AI 추론
      │         └──▶ [vLLM/Ollama]
      │
      ├──▶ [.NET C# 추천 서비스]    ← 개인화 로직
      │         └──▶ [Python ML 모델]
      │
      └──▶ [Java 결제/재고 서비스]  ← 기존 엔터프라이즈 시스템
```

AITOP이 Python LLM 레이어만 관찰하면, **Java Gateway의 병목 → 전체 레이턴시 악화**를 탐지할 수 없습니다.

---

## 2. Java SDK 설계

### 2.1 접근 전략: OTel Java Agent + 커스텀 확장

OTel Java Agent를 기반으로 하되, AITOP 특화 메소드 프로파일링을 추가합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    Java 애플리케이션                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ JVM                                                  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ Java Instrumentation API (java.lang.instrument) │  │   │
│  │  │   ├─ OTel Java Agent (auto-instrumentation)     │  │   │
│  │  │   │    ├─ Spring Boot / Spring MVC              │  │   │
│  │  │   │    ├─ JDBC / Hibernate                      │  │   │
│  │  │   │    ├─ Apache HttpClient / OkHttp            │  │   │
│  │  │   │    └─ Kafka / Redis / MongoDB               │  │   │
│  │  │   └─ AITOP Java Extension (커스텀)              │  │   │
│  │  │        ├─ 메소드 프로파일링 (샘플링 기반)         │  │   │
│  │  │        ├─ SQL 바인딩 파라미터 캡처               │  │   │
│  │  │        └─ JVM 힙/GC/Thread 메트릭               │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
              │ OTLP gRPC :4317
              ▼
     [OTel Collector / AITOP Agent]
```

### 2.2 Java 에이전트 배포

**기존 코드 변경 없이** JVM 시작 옵션만 추가합니다:

```bash
# 방법 1: JVM 옵션 직접 추가
java -javaagent:/opt/aitop/aitop-java-agent.jar \
     -Dotel.service.name=recommend-service \
     -Dotel.exporter.otlp.endpoint=http://aitop-collector:4317 \
     -Daitop.profiling.enabled=true \
     -Daitop.profiling.threshold.ms=5 \
     -jar myapp.jar

# 방법 2: 환경변수로 설정 (Docker/K8s 친화적)
JAVA_TOOL_OPTIONS="-javaagent:/opt/aitop/aitop-java-agent.jar"
OTEL_SERVICE_NAME=recommend-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://aitop-collector:4317
AITOP_PROFILING_ENABLED=true
AITOP_PROFILING_THRESHOLD_MS=5

# 방법 3: Spring Boot Actuator와 통합
# application.yml에 추가만 하면 됨
```

**Kubernetes 자동 주입** (AITOP Operator 사용 시):

```yaml
# Pod 어노테이션만 추가하면 자동으로 Java 에이전트 주입
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recommend-service
spec:
  template:
    metadata:
      annotations:
        aitop.io/inject-java-agent: "true"
        aitop.io/service-name: "recommend-service"
        aitop.io/profiling: "enabled"
```

### 2.3 메소드 프로파일링 구현 원리

OTel Java Agent의 ByteBuddy 기반 계측에 AITOP 확장을 추가합니다:

```java
// sdk-instrumentation/java/src/main/java/io/aitop/profiler/MethodProfilerExtension.java
package io.aitop.profiler;

import net.bytebuddy.asm.Advice;
import java.lang.reflect.Method;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * ByteBuddy Advice를 이용한 메소드 수준 프로파일링.
 * 모든 public 메소드 진입/종료 시점을 AOP 방식으로 가로채어 실행 시간을 측정한다.
 *
 * 성능 영향 최소화:
 * - 임계치(기본 5ms) 이상인 메소드만 Span 생성
 * - ThreadLocal 기반 콜 스택 → 힙 할당 최소화
 * - 비동기 배치 전송 (100ms 버퍼)
 */
public class MethodProfilerAdvice {

    // 스레드별 콜 스택 관리 (멀티스레드 안전)
    private static final ThreadLocal<Deque<MethodCallFrame>> callStack =
        ThreadLocal.withInitial(ArrayDeque::new);

    @Advice.OnMethodEnter
    public static long onEnter(@Advice.Origin Method method) {
        long startNano = System.nanoTime();
        callStack.get().push(new MethodCallFrame(
            method.getDeclaringClass().getName(),
            method.getName(),
            startNano
        ));
        return startNano;
    }

    @Advice.OnMethodExit(onThrowable = Throwable.class)
    public static void onExit(
        @Advice.Enter long startNano,
        @Advice.Origin Method method,
        @Advice.Thrown Throwable thrown
    ) {
        long durationNanos = System.nanoTime() - startNano;
        long durationMs = durationNanos / 1_000_000;

        MethodCallFrame frame = callStack.get().poll();
        if (frame == null) return;

        // 임계치 이상만 수집 (기본 5ms)
        long threshold = Long.getLong("aitop.profiling.threshold.ms", 5L);
        if (durationMs >= threshold) {
            ProfilerCollector.record(new MethodProfile(
                frame.className,
                frame.methodName,
                durationMs,
                thrown != null,
                thrown != null ? thrown.getClass().getName() : null,
                Thread.currentThread().getName()
            ));
        }
    }
}

// 메소드 프로파일 데이터 구조
record MethodProfile(
    String className,
    String methodName,
    long durationMs,
    boolean hasError,
    String errorType,
    String threadName
) {}
```

### 2.4 SQL 바인딩 파라미터 캡처

Scouter와 동일한 방식으로 PreparedStatement의 실제 바인딩 값을 캡처합니다:

```java
// sdk-instrumentation/java/src/main/java/io/aitop/jdbc/SqlBindingInterceptor.java
package io.aitop.jdbc;

import io.opentelemetry.api.trace.Span;

/**
 * JDBC PreparedStatement 바인딩 파라미터 캡처.
 * 실행된 SQL의 실제 파라미터를 Span 속성으로 기록한다.
 *
 * 보안 주의:
 * - PII(개인정보) 컬럼은 자동 마스킹 (설정 가능)
 * - 파라미터 최대 길이: 1000자 (truncate)
 * - 비활성화 가능: aitop.jdbc.capture-bindings=false
 */
public class SqlBindingCapture {

    // 마스킹 대상 컬럼명 패턴 (대소문자 무시)
    private static final Set<String> PII_PATTERNS = Set.of(
        "password", "passwd", "secret", "token", "ssn",
        "credit_card", "email", "phone", "birth"
    );

    public static void attachToSpan(Span span, String sql, Object[] params) {
        if (params == null || params.length == 0) return;

        span.setAttribute("db.statement", sql);

        StringBuilder bindingStr = new StringBuilder();
        for (int i = 0; i < params.length; i++) {
            if (i > 0) bindingStr.append(", ");
            bindingStr.append(maskIfPii(sql, i, params[i]));
        }

        // Span 속성에 바인딩 파라미터 기록
        span.setAttribute("db.sql.bindings", bindingStr.toString());
        span.setAttribute("db.sql.param_count", params.length);
    }

    private static String maskIfPii(String sql, int idx, Object value) {
        // SQL에서 해당 위치의 컬럼명 추출 (정규식 파싱)
        String colName = extractColumnNameAt(sql, idx);
        if (colName != null && PII_PATTERNS.stream()
            .anyMatch(p -> colName.toLowerCase().contains(p))) {
            return "****";
        }
        String str = String.valueOf(value);
        return str.length() > 100 ? str.substring(0, 100) + "..." : str;
    }
}
```

### 2.5 JVM 메트릭 수집

```java
// sdk-instrumentation/java/src/main/java/io/aitop/metrics/JvmMetricsCollector.java
package io.aitop.metrics;

import io.opentelemetry.api.metrics.*;
import java.lang.management.*;

/**
 * JVM 런타임 메트릭 자동 수집.
 * OTel Java SDK의 기본 JVM 메트릭에 AITOP 특화 지표를 추가한다.
 */
public class JvmMetricsCollector {

    public static void register(Meter meter) {
        MemoryMXBean memBean = ManagementFactory.getMemoryMXBean();
        List<GarbageCollectorMXBean> gcBeans = ManagementFactory.getGarbageCollectorMXBeans();
        ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();

        // Heap 사용량
        meter.gaugeBuilder("jvm.heap.used")
            .setUnit("bytes")
            .setDescription("JVM Heap 사용 중인 메모리")
            .buildWithCallback(obs -> obs.record(
                memBean.getHeapMemoryUsage().getUsed()
            ));

        // Heap 최대 용량
        meter.gaugeBuilder("jvm.heap.max")
            .setUnit("bytes")
            .setDescription("JVM Heap 최대 용량")
            .buildWithCallback(obs -> obs.record(
                memBean.getHeapMemoryUsage().getMax()
            ));

        // GC 일시정지 시간 (Young GC / Full GC 구분)
        for (GarbageCollectorMXBean gc : gcBeans) {
            String gcName = gc.getName().replace(" ", "_").toLowerCase();
            meter.counterBuilder("jvm.gc.pause.time")
                .setUnit("ms")
                .setDescription("GC 일시정지 누적 시간")
                .build()
                .add(0, Attributes.of(
                    AttributeKey.stringKey("gc.name"), gcName
                ));
        }

        // 스레드 풀 상태
        meter.gaugeBuilder("jvm.threads.live")
            .setUnit("1")
            .setDescription("현재 살아있는 JVM 스레드 수")
            .buildWithCallback(obs -> obs.record(threadBean.getThreadCount()));

        meter.gaugeBuilder("jvm.threads.deadlocked")
            .setUnit("1")
            .setDescription("데드락 상태 스레드 수")
            .buildWithCallback(obs -> {
                long[] ids = threadBean.findDeadlockedThreads();
                obs.record(ids != null ? ids.length : 0);
            });

        // 클래스 로딩
        ClassLoadingMXBean classBean = ManagementFactory.getClassLoadingMXBean();
        meter.gaugeBuilder("jvm.classes.loaded")
            .setUnit("1")
            .setDescription("로드된 클래스 수")
            .buildWithCallback(obs -> obs.record(classBean.getLoadedClassCount()));
    }
}
```

---

## 3. .NET SDK 설계

### 3.1 접근 전략: OTel .NET SDK + CLR Profiler API

```
┌─────────────────────────────────────────────────────────────┐
│                   .NET 애플리케이션                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CLR (Common Language Runtime)                        │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │ CLR Profiling API (ICorProfilerCallback)         │ │   │
│  │  │   ├─ OTel .NET Auto-Instrumentation              │ │   │
│  │  │   │    ├─ ASP.NET Core (HTTP 서버/클라이언트)    │ │   │
│  │  │   │    ├─ Entity Framework Core (DB 쿼리)        │ │   │
│  │  │   │    ├─ HttpClient / gRPC                      │ │   │
│  │  │   │    └─ MassTransit / Azure Service Bus        │ │   │
│  │  │   └─ AITOP .NET Profiler (커스텀)                │ │   │
│  │  │        ├─ 메소드 프로파일링 (JIT Hook)            │ │   │
│  │  │        ├─ 예외 추적 (ICorProfilerCallback)       │ │   │
│  │  │        └─ CLR GC / Thread Pool 메트릭            │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 .NET 에이전트 배포

```bash
# 방법 1: 환경변수로 CLR Profiler 활성화 (Linux)
export CORECLR_ENABLE_PROFILING=1
export CORECLR_PROFILER={B4C89B0F-9908-4F73-9F59-0D77C5A06874}
export CORECLR_PROFILER_PATH=/opt/aitop/aitop-profiler.so
export OTEL_SERVICE_NAME=recommendation-api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://aitop-collector:4317
export AITOP_PROFILING_ENABLED=true

dotnet MyApp.dll

# 방법 2: Windows (환경변수 또는 레지스트리)
set CORECLR_ENABLE_PROFILING=1
set CORECLR_PROFILER={B4C89B0F-9908-4F73-9F59-0D77C5A06874}
set CORECLR_PROFILER_PATH=C:\aitop\aitop-profiler.dll
dotnet MyApp.dll

# 방법 3: Docker (멀티스테이지 Dockerfile)
# AITOP 에이전트 레이어만 추가하면 됨
```

```dockerfile
# sdk-instrumentation/dotnet/Dockerfile.instrumented
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base

# AITOP .NET Profiler 설치
COPY --from=aitop/dotnet-profiler:latest /opt/aitop /opt/aitop

ENV CORECLR_ENABLE_PROFILING=1
ENV CORECLR_PROFILER={B4C89B0F-9908-4F73-9F59-0D77C5A06874}
ENV CORECLR_PROFILER_PATH=/opt/aitop/aitop-profiler.so
ENV AITOP_PROFILING_ENABLED=true
ENV AITOP_PROFILING_THRESHOLD_MS=5

# 기존 앱 이미지 복사 (변경 없음)
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "MyApp.dll"]
```

### 3.3 ASP.NET Core 미들웨어 통합 (선택적 수동 계측)

```csharp
// sdk-instrumentation/dotnet/src/Aitop.Instrumentation/AitopMiddleware.cs
using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using OpenTelemetry.Trace;

namespace Aitop.Instrumentation;

/// <summary>
/// ASP.NET Core 미들웨어: 요청별 메소드 프로파일링 컨텍스트 관리.
/// OTel Activity와 AITOP 프로파일링 데이터를 연결한다.
/// </summary>
public class AitopProfilingMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly ActivitySource ActivitySource =
        new("Aitop.Instrumentation", "1.0.0");

    public AitopProfilingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        using var activity = ActivitySource.StartActivity(
            $"HTTP {context.Request.Method} {context.Request.Path}",
            ActivityKind.Server
        );

        // AITOP 트랜잭션 ID 생성 및 응답 헤더 추가
        var txId = Guid.NewGuid().ToString("N")[..8];
        activity?.SetTag("aitop.txid", txId);
        context.Response.Headers["X-Aitop-TxId"] = txId;

        // 메소드 프로파일링 세션 시작
        using var session = MethodProfilingSession.Begin(txId);

        var sw = Stopwatch.StartNew();
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            activity?.RecordException(ex);
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            throw;
        }
        finally
        {
            sw.Stop();

            // 메소드 프로파일 데이터를 Span 이벤트로 기록
            var profiles = session.GetProfiles();
            if (profiles.Any())
            {
                activity?.AddEvent(new ActivityEvent("method.profiles", tags:
                    new ActivityTagsCollection
                    {
                        ["profile.count"] = profiles.Count,
                        ["profile.top_slow"] = profiles
                            .OrderByDescending(p => p.DurationMs)
                            .Take(5)
                            .Select(p => $"{p.MethodName}:{p.DurationMs}ms")
                            .Aggregate((a, b) => $"{a},{b}")
                    }
                ));
            }

            activity?.SetTag("http.response.status_code", context.Response.StatusCode);
            activity?.SetTag("aitop.duration_ms", sw.ElapsedMilliseconds);
        }
    }
}

// Program.cs에서 한 줄 추가로 활성화
// app.UseMiddleware<AitopProfilingMiddleware>();
```

### 3.4 CLR 메트릭 수집

```csharp
// sdk-instrumentation/dotnet/src/Aitop.Instrumentation/ClrMetricsCollector.cs
using System.Diagnostics.Metrics;
using System.Runtime;

namespace Aitop.Instrumentation;

/// <summary>
/// CLR 런타임 메트릭 수집.
/// .NET 6+의 System.Runtime 이벤트소스를 활용한다.
/// </summary>
public static class ClrMetricsCollector
{
    private static readonly Meter Meter = new("Aitop.Clr", "1.0.0");

    public static void Register()
    {
        // GC 힙 메모리
        Meter.CreateObservableGauge(
            "clr.gc.heap.size",
            () => (double)GC.GetTotalMemory(false),
            unit: "bytes",
            description: "CLR GC 힙 전체 크기"
        );

        // GC 세대별 수집 횟수
        for (int gen = 0; gen <= GC.MaxGeneration; gen++)
        {
            int capturedGen = gen;
            Meter.CreateObservableCounter(
                "clr.gc.collections",
                () => new Measurement<long>(
                    GC.CollectionCount(capturedGen),
                    new KeyValuePair<string, object?>("generation", capturedGen)
                ),
                unit: "1",
                description: $"GC Gen{gen} 수집 횟수"
            );
        }

        // 스레드 풀 상태
        Meter.CreateObservableGauge(
            "clr.threadpool.threads",
            () =>
            {
                ThreadPool.GetAvailableThreads(out int worker, out _);
                ThreadPool.GetMaxThreads(out int max, out _);
                return (double)(max - worker);
            },
            unit: "1",
            description: "스레드 풀 활성 스레드 수"
        );

        Meter.CreateObservableGauge(
            "clr.threadpool.queue.length",
            () => (double)ThreadPool.PendingWorkItemCount,
            unit: "1",
            description: "스레드 풀 대기 작업 수"
        );

        // 예외 발생률
        Meter.CreateObservableCounter(
            "clr.exceptions.thrown",
            () => (double)AppDomain.CurrentDomain
                .GetAssemblies()
                .Sum(a => 0L), // 실제 구현: DiagnosticListener 이벤트로 카운팅
            unit: "1",
            description: "CLR 예외 발생 총 횟수"
        );
    }
}
```

---

## 4. 메소드 프로파일링 데이터 모델

### 4.1 MethodCallTree 데이터 구조

```json
{
  "txid": "a1b2c3d4",
  "trace_id": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "service": "recommend-service",
  "language": "java",
  "start_time": "2026-03-23T10:00:00.000Z",
  "total_duration_ms": 245,
  "http": {
    "method": "GET",
    "url": "/api/recommend",
    "status_code": 200
  },
  "method_call_tree": {
    "class": "com.example.api.RecommendController",
    "method": "getRecommendations",
    "duration_ms": 245,
    "error": false,
    "children": [
      {
        "class": "com.example.service.UserService",
        "method": "getProfile",
        "duration_ms": 15,
        "error": false,
        "children": [
          {
            "class": "com.example.dao.UserDAO",
            "method": "findById",
            "duration_ms": 14,
            "type": "sql",
            "sql": {
              "query": "SELECT id, name, tier FROM users WHERE id=?",
              "bindings": ["user-42"],
              "rows_affected": 1
            }
          }
        ]
      },
      {
        "class": "com.example.ml.MLService",
        "method": "predict",
        "duration_ms": 198,
        "error": false,
        "children": [
          {
            "class": "com.example.ml.FeatureExtractor",
            "method": "run",
            "duration_ms": 45
          },
          {
            "class": "com.example.ml.ModelInference",
            "method": "call",
            "duration_ms": 150,
            "type": "http_client",
            "http_client": {
              "url": "http://python-llm-service/predict",
              "method": "POST",
              "status_code": 200,
              "child_trace_id": "00-5bf92f3577b34da6a3ce929d0e0e4737-01"
            }
          }
        ]
      }
    ]
  }
}
```

### 4.2 Python LLM 호출 체인 데이터 구조 (기존)

```json
{
  "txid": "e5f6g7h8",
  "trace_id": "00-5bf92f3577b34da6a3ce929d0e0e4737-00f067aa0ba902b7-01",
  "parent_trace_id": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "service": "python-llm-service",
  "language": "python",
  "llm_call_chain": [
    {
      "step": "guardrail.validate",
      "duration_ms": 12,
      "result": "pass"
    },
    {
      "step": "embedding.encode",
      "duration_ms": 45,
      "model": "text-embedding-3-small",
      "tokens": 128
    },
    {
      "step": "vectordb.search",
      "duration_ms": 38,
      "results_count": 5
    },
    {
      "step": "llm.generate",
      "duration_ms": 820,
      "model": "llama3-70b",
      "ttft_ms": 180,
      "tps": 42,
      "input_tokens": 512,
      "output_tokens": 380
    },
    {
      "step": "guardrail.output_filter",
      "duration_ms": 8,
      "result": "pass"
    }
  ]
}
```

### 4.3 통합 트랜잭션 데이터 모델

Trace ID로 Java 트랜잭션과 Python 트랜잭션을 연결합니다:

```
Trace ID: 4bf92f3577b34da6a3ce929d0e0e4736
│
├─ Java Span: RecommendController.get()      [0ms ~ 245ms]
│   ├─ Java Span: UserService.getProfile()   [0ms ~ 15ms]
│   │   └─ Java Span: SQL findById()         [1ms ~ 14ms]
│   └─ Java Span: MLService.predict()        [15ms ~ 213ms]
│       ├─ Java Span: FeatureExtractor.run() [15ms ~ 60ms]
│       └─ HTTP Client → Python LLM          [60ms ~ 213ms]
│                │
│                └─ Trace ID: 5bf92f3577b34... (자식 Trace)
│                    ├─ Python Span: guardrail.validate   [+0ms]
│                    ├─ Python Span: embedding.encode     [+12ms]
│                    ├─ Python Span: vectordb.search      [+57ms]
│                    ├─ Python Span: llm.generate         [+95ms]
│                    └─ Python Span: output_filter        [+915ms]
```

---

## 5. XLog 통합 뷰 설계

### 5.1 언어별 상세 뷰 자동 선택

XLog에서 트랜잭션을 클릭하면, 서비스 언어에 따라 **자동으로** 적합한 상세 뷰를 선택합니다.

```
XLog 산점도 (언어 구분 없이 모든 트랜잭션)
         ↓ 트랜잭션 클릭
    ┌─── 언어 감지 (Span 속성: telemetry.sdk.language) ───┐
    │                                                       │
  Java / .NET                                           Python / Go
    │                                                       │
    ▼                                                       ▼
메소드 콜 트리 뷰                                    LLM 호출 체인 뷰
(Scouter/Pinpoint 스타일)                           (AITOP AI 특화)
```

### 5.2 Java/.NET 트랜잭션 상세 뷰 (메소드 콜 트리)

```
┌────────────────────────────────────────────────────────────────────┐
│  트랜잭션 상세                              [Java] recommend-service │
│  GET /api/recommend  ●  245ms  ●  200 OK  ●  2026-03-23 10:00:00  │
├────────────────────────────────────────────────────────────────────┤
│  타임라인 (ms)                                                      │
│  0        50       100       150       200       245               │
│  ├────────┼─────────┼─────────┼─────────┼─────────┤               │
│                                                                    │
├─ 메소드 콜 트리 ──────────────────────────────────────────────────┤
│  ▼ RecommendController.getRecommendations()            ■■■■■ 245ms │
│    ▼ UserService.getProfile()                         ■ 15ms       │
│      ▼ UserDAO.findById()                             ■ 14ms [SQL] │
│        SQL: SELECT id,name,tier FROM users WHERE id=?              │
│        바인딩: [user-42]  rows: 1                                  │
│    ▼ MLService.predict()                         ■■■■■■■■■ 198ms   │
│      ▶ FeatureExtractor.run()                    ■■ 45ms           │
│      ▶ ModelInference.call()             ■■■■■■■ 150ms [HTTP→LLM] │
│        → python-llm-service (Trace 연결 ▶)                        │
│    ResponseMapper.toJSON()                                ■ 3ms    │
├─ SQL 요약 ────────────────────────────────────────────────────────┤
│  3건 실행  |  총 28ms  |  최장: findById() 14ms                   │
├─ 예외 ────────────────────────────────────────────────────────────┤
│  없음                                                              │
└────────────────────────────────────────────────────────────────────┘
```

### 5.3 Python AI 트랜잭션 상세 뷰 (LLM 호출 체인)

```
┌────────────────────────────────────────────────────────────────────┐
│  트랜잭션 상세                           [Python] python-llm-service │
│  POST /predict  ●  923ms  ●  200 OK  ●  2026-03-23 10:00:00      │
│  상위 트랜잭션: Java recommend-service → [연결 보기 ▶]             │
├────────────────────────────────────────────────────────────────────┤
│  LLM 호출 체인                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 가드레일 입력 │→ │  임베딩 생성  │→ │  벡터 검색   │            │
│  │     12ms     │  │     45ms     │  │     38ms     │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                              ↓                    │
│  ┌──────────────────────────────────────────────────┐            │
│  │                   LLM 생성                        │            │
│  │  TTFT: 180ms  |  TPS: 42 tok/s  |  820ms 총      │            │
│  │  입력 512 토큰  |  출력 380 토큰  |  llama3-70b   │            │
│  └──────────────────────────────────────────────────┘            │
│                              ↓                                    │
│  ┌──────────────┐                                                 │
│  │  가드레일 출력 │  8ms  PASS                                    │
│  └──────────────┘                                                 │
└────────────────────────────────────────────────────────────────────┘
```

### 5.4 통합 뷰: 공통 스팬 타임라인 + 언어별 확장 패널

Java → Python 호출을 포함하는 복합 트랜잭션의 통합 뷰:

```
┌────────────────────────────────────────────────────────────────────┐
│  분산 트랜잭션 통합 뷰                                              │
│  Trace: 4bf92f35...              전체 소요: 245ms (Java 기준)      │
├─ 공통 스팬 타임라인 ──────────────────────────────────────────────┤
│  [Java: recommend-service]                          ████████ 245ms │
│    [Java: UserService.getProfile]     ██ 15ms                      │
│    [Java: MLService.predict]                   ████████ 198ms      │
│      [Python: python-llm-service]              ██████ 153ms        │
│        [Python: llm.generate]                  █████ 143ms         │
├─ 언어별 확장 패널 ────────────────────────────────────────────────┤
│  ┌────────── Java ──────────┐  ┌──────── Python ────────────┐     │
│  │ 메소드 콜 트리 (접기/펼치기) │  │ LLM 체인 세부 정보           │     │
│  │ SQL 3건 / 28ms           │  │ TTFT: 180ms / TPS: 42      │     │
│  │ 예외: 없음               │  │ 토큰: 512→380              │     │
│  │ GC 정지: 0회             │  │ 가드레일: 2회 PASS          │     │
│  └──────────────────────────┘  └────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

### 5.5 Frontend 구현 전략

```typescript
// frontend/src/components/xlog/TransactionDetail.tsx (설계)

type Language = 'java' | 'dotnet' | 'python' | 'nodejs' | 'go';

interface TransactionDetailProps {
  txId: string;
  traceId: string;
  language: Language;
  hasChildTrace?: boolean;
  childTraceLanguage?: Language;
}

function TransactionDetail({ language, ...props }: TransactionDetailProps) {
  // 언어에 따라 적절한 상세 패널 렌더링
  const DetailPanel = useMemo(() => {
    switch (language) {
      case 'java':
      case 'dotnet':
        return MethodCallTreePanel;   // 메소드 콜 트리 (기존 APM 스타일)
      case 'python':
        return LLMCallChainPanel;     // LLM 호출 체인 (AITOP AI 특화)
      default:
        return GenericSpanPanel;      // 공통 Span 뷰
    }
  }, [language]);

  return (
    <div className="transaction-detail">
      <CommonSpanTimeline {...props} />  {/* 언어 공통: 스팬 타임라인 */}
      <DetailPanel {...props} />         {/* 언어별: 확장 패널 */}
      {props.hasChildTrace && (
        <ChildTraceConnector               {/* 부모-자식 Trace 연결 */}
          childLanguage={props.childTraceLanguage}
        />
      )}
    </div>
  );
}
```

---

## 6. AI 서비스 융합 시나리오

### 6.1 시나리오 1: Java Spring → Python LLM (가장 흔한 패턴)

```
[사용자 요청]
      │
      ▼
Java Spring Boot (API Gateway)
  ├─ AuthFilter: JWT 검증          2ms
  ├─ RateLimitFilter: 요청 제한    1ms
  └─ RecommendController           →────────────────────────────────┐
      ├─ UserService: DB 조회       14ms (SQL)                      │
      ├─ CacheService: Redis 확인   2ms                             │
      └─ LLMClient: HTTP 호출       150ms ───────────────────────────┘
                                          │
                                          ▼
                              Python FastAPI + LLM
                                ├─ Guardrail 입력: 12ms
                                ├─ 임베딩: 45ms (text-embedding-3-small)
                                ├─ 벡터 검색: 38ms (Qdrant)
                                ├─ LLM 생성: 820ms (llama3-70b)
                                │   TTFT: 180ms / TPS: 42
                                └─ Guardrail 출력: 8ms
                                          │
                                          ▼
                              Java Spring (결과 처리)
                                ├─ ResponseMapper: 3ms
                                └─ CacheService.put: 2ms

전체 레이턴시: 245ms (Java 시각)
  = Java 처리 95ms + Python LLM 150ms (네트워크 포함)
```

**AITOP 모니터링 인사이트**:
- Python LLM 시간(150ms)이 전체의 61% → GPU 클러스터 자원 최적화 필요
- Java SQL 조회(14ms)는 적정 수준
- Redis 캐시 히트율이 낮으면 LLM 호출 증가 → 캐시 정책 검토

### 6.2 시나리오 2: .NET 마이크로서비스 + Python ML 앙상블

```
.NET API Gateway (ASP.NET Core)
  └─ 3개 Python ML 서비스 병렬 호출 (Task.WhenAll)
      ├─ Python: 협업 필터링      120ms
      ├─ Python: 컨텐츠 기반      85ms
      └─ Python: LLM 개인화       320ms (병목)
  └─ .NET 앙상블: 결과 통합      15ms
  └─ .NET SQL: 로깅              8ms

총 소요: 335ms (병렬화로 단일 최장 320ms + 오버헤드)
```

### 6.3 시나리오 3: Java 배치 파이프라인 + AI 처리

```
Java Batch (Spring Batch)
  └─ Step 1: DB에서 1000건 조회    2.3s (JDBC, 배치 최적화)
  └─ Step 2: Python AI 분류 (배치) 45.0s (HTTP, 비동기 청크)
      └─ Python: GPT-4 분류 × 1000  = 병렬 10개 × 100 반복
  └─ Step 3: DB 결과 저장          1.8s (JDBC bulk insert)

총 소요: 49.1s → 병목: Python AI 분류 91%
→ Python 서비스 수평 확장 또는 모델 경량화 권장
```

---

## 7. 수집 메트릭 확장

### 7.1 Java 전용 메트릭

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `jvm.heap.used` | Gauge | bytes | `service` | Heap 사용량 |
| `jvm.heap.max` | Gauge | bytes | `service` | Heap 최대 용량 |
| `jvm.heap.usage_ratio` | Gauge | 1 (0~1) | `service` | Heap 사용률 (used/max) |
| `jvm.gc.pause.time` | Counter | ms | `gc.name`, `service` | GC 일시정지 누적 시간 |
| `jvm.gc.collections` | Counter | 1 | `generation`, `service` | GC 수집 횟수 |
| `jvm.threads.live` | Gauge | 1 | `service` | 활성 스레드 수 |
| `jvm.threads.deadlocked` | Gauge | 1 | `service` | 데드락 스레드 수 |
| `jvm.threads.peak` | Gauge | 1 | `service` | 최대 동시 스레드 수 |
| `jvm.classes.loaded` | Gauge | 1 | `service` | 로드된 클래스 수 |
| `jvm.compilation.time` | Counter | ms | `service` | JIT 컴파일 누적 시간 |
| `jdbc.connections.active` | Gauge | 1 | `pool`, `service` | 활성 DB 커넥션 수 |
| `jdbc.connections.max` | Gauge | 1 | `pool`, `service` | 커넥션 풀 최대 크기 |
| `jdbc.slow_query.count` | Counter | 1 | `service` | 슬로우 쿼리 발생 횟수 |
| `method.profile.duration` | Histogram | ms | `class`, `method`, `service` | 메소드 실행 시간 분포 |
| `method.profile.error` | Counter | 1 | `class`, `method`, `error_type` | 메소드 예외 발생 수 |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 |
|--------|------|------|
| `jvm.heap.usage_ratio` | > 0.75 | > 0.90 |
| `jvm.gc.pause.time` (rate/5m) | > 500ms/5m | > 2s/5m |
| `jvm.threads.deadlocked` | > 0 | > 0 (즉시 알림) |
| `jdbc.connections.active / max` | > 0.80 | > 0.95 |

### 7.2 .NET 전용 메트릭

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `clr.gc.heap.size` | Gauge | bytes | `service` | GC 힙 전체 크기 |
| `clr.gc.collections` | Counter | 1 | `generation`, `service` | GC 세대별 수집 횟수 |
| `clr.gc.pause.duration` | Histogram | ms | `generation`, `service` | GC 일시정지 시간 |
| `clr.threadpool.threads` | Gauge | 1 | `service` | 활성 스레드 풀 스레드 수 |
| `clr.threadpool.queue.length` | Gauge | 1 | `service` | 스레드 풀 대기 작업 수 |
| `clr.threadpool.completed` | Counter | 1 | `service` | 완료된 스레드 풀 작업 수 |
| `clr.exceptions.thrown` | Counter | 1 | `exception.type`, `service` | 예외 발생 수 |
| `clr.assemblies.loaded` | Gauge | 1 | `service` | 로드된 어셈블리 수 |
| `aspnetcore.requests.active` | Gauge | 1 | `service` | 처리 중인 HTTP 요청 수 |
| `aspnetcore.request.duration` | Histogram | ms | `method`, `route`, `service` | 요청 처리 시간 |
| `efcore.query.duration` | Histogram | ms | `table`, `service` | EF Core 쿼리 실행 시간 |

**SLO 기준값:**

| 메트릭 | 경고 | 위험 |
|--------|------|------|
| `clr.gc.pause.duration` P95 | > 200ms | > 500ms |
| `clr.threadpool.queue.length` | > 100 | > 500 |
| `aspnetcore.requests.active` | > 200 | > 500 |

### 7.3 메소드 프로파일링 메트릭

언어 공통으로 수집되는 메소드 수준 지표:

| 메트릭명 | 타입 | 단위 | 레이블 | 설명 |
|---------|------|------|--------|------|
| `method.duration` | Histogram | ms | `language`, `class`, `method` | 메소드 실행 시간 분포 |
| `method.calls.total` | Counter | 1 | `language`, `class`, `method` | 메소드 호출 횟수 |
| `method.errors.total` | Counter | 1 | `language`, `class`, `method`, `error_type` | 메소드 예외 발생 수 |
| `method.sql.count` | Counter | 1 | `language`, `method` | 메소드당 SQL 호출 수 |
| `method.sql.duration` | Histogram | ms | `language`, `method` | 메소드 내 SQL 총 소요 시간 |

---

## 8. 구현 로드맵

### Phase 24-1: Java SDK MVP (예상 6주)

| # | 작업 | 상세 | 예상 공수 |
|---|------|------|----------|
| 24-1-1 | OTel Java Agent 통합 | `opentelemetry-javaagent.jar` 기반 자동 계측 (Spring Boot, JDBC, HttpClient) | 2주 |
| 24-1-2 | AITOP Java Extension | ByteBuddy 기반 메소드 프로파일링 확장 (임계치 필터링, ThreadLocal 스택) | 2주 |
| 24-1-3 | SQL 바인딩 캡처 | PreparedStatement 바인딩 값 캡처 + PII 마스킹 | 1주 |
| 24-1-4 | JVM 메트릭 수집 | Heap/GC/Thread/커넥션 풀 메트릭 + SLO 알림 | 1주 |

### Phase 24-2: .NET SDK MVP (예상 6주)

| # | 작업 | 상세 | 예상 공수 |
|---|------|------|----------|
| 24-2-1 | OTel .NET 자동 계측 | ASP.NET Core, HttpClient, EF Core, gRPC 자동 계측 패키지 | 2주 |
| 24-2-2 | CLR Profiler 통합 | `ICorProfilerCallback` 기반 메소드 JIT Hook | 3주 |
| 24-2-3 | CLR 메트릭 수집 | GC/ThreadPool/예외 메트릭 + `System.Diagnostics.Metrics` | 1주 |

### Phase 24-3: XLog 통합 뷰 (예상 4주)

| # | 작업 | 상세 | 예상 공수 |
|---|------|------|----------|
| 24-3-1 | 언어 감지 로직 | Span 속성(telemetry.sdk.language) 기반 자동 감지 | 0.5주 |
| 24-3-2 | 메소드 콜 트리 UI | 접기/펼치기 가능한 트리 컴포넌트 (Scouter 스타일) | 2주 |
| 24-3-3 | 통합 Trace 뷰 | Java→Python 부모-자식 Trace 연결 및 시각화 | 1.5주 |

### Phase 24-4: K8s 자동 주입 (예상 3주)

| # | 작업 | 상세 | 예상 공수 |
|---|------|------|----------|
| 24-4-1 | AITOP Operator | K8s Admission Webhook으로 Java/CLR 에이전트 자동 주입 | 2주 |
| 24-4-2 | Helm 차트 업데이트 | Java/CLR 에이전트 ConfigMap + Secret 관리 | 1주 |

---

## 부록: Scouter/Pinpoint 대비 설계 비교

| 기능 | Scouter | Pinpoint | **AITOP (설계)** |
|------|---------|---------|-----------------|
| Java 메소드 트리 | ✅ | ✅ | ✅ 동등 수준 목표 |
| .NET 지원 | ❌ | ❌ | ✅ **차별화** |
| Python AI 체인 | ❌ | ❌ | ✅ **핵심 강점** |
| Java↔Python 통합 뷰 | ❌ | ❌ | ✅ **독보적 차별화** |
| LLM TTFT/TPS | ❌ | ❌ | ✅ |
| GPU 모니터링 | ❌ | ❌ | ✅ |
| OTel 표준 기반 | ❌ | ❌ | ✅ 벤더 중립 |
| 오픈소스 | ✅ | ✅ | 📋 상용 솔루션 |

---

*이 문서는 Phase 24 구현 시 상세 기술 스펙으로 확장됩니다.*
*관련 문서: [ARCHITECTURE.md](./ARCHITECTURE.md) | [METRICS_DESIGN.md](./METRICS_DESIGN.md) | [XLOG_DASHBOARD_REDESIGN.md](./XLOG_DASHBOARD_REDESIGN.md)*
