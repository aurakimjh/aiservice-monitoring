# AITOP 개발 가이드

> **문서 버전**: v1.0.0
> **최종 업데이트**: 2026-03-26
> **대상 독자**: 백엔드 개발자, 프론트엔드 개발자, 플랫폼 엔지니어
> **관련 문서**: ARCHITECTURE.md, AGENT_DESIGN.md, UI_DESIGN.md, METRICS_DESIGN.md

---

## 목차

1. [아키텍처 심층 분석](#1-아키텍처-심층-분석)
   - 1.1 [전체 시스템 설계 원칙](#11-전체-시스템-설계-원칙)
   - 1.2 [Collection Server 설계](#12-collection-server-설계)
   - 1.3 [AITOP Agent 설계](#13-aitop-agent-설계)
   - 1.4 [OTel Collector 파이프라인](#14-otel-collector-파이프라인)
   - 1.5 [데이터 흐름](#15-데이터-흐름)
2. [핵심 기능 동작 방식 및 알고리즘](#2-핵심-기능-동작-방식-및-알고리즘)
   - 2.1 [Collector 레지스트리 패턴](#21-collector-레지스트리-패턴)
   - 2.2 [Tail-based Sampling 알고리즘](#22-tail-based-sampling-알고리즘)
   - 2.3 [Network Topology 자동 탐지](#23-network-topology-자동-탐지)
   - 2.4 [perf/eBPF 프로파일링](#24-perfebpf-프로파일링)
   - 2.5 [Runtime Attach 메커니즘](#25-runtime-attach-메커니즘)
   - 2.6 [AI Copilot NL→PromQL 변환](#26-ai-copilot-nlpromql-변환)
   - 2.7 [자동 이상 탐지](#27-자동-이상-탐지)
   - 2.8 [배치 프로세스 감지](#28-배치-프로세스-감지)
3. [코드 구조](#3-코드-구조)
   - 3.1 [Agent (Go) 구조](#31-agent-go-구조)
   - 3.2 [Collection Server (Go) 구조](#32-collection-server-go-구조)
   - 3.3 [Frontend (Next.js) 구조](#33-frontend-nextjs-구조)
   - 3.4 [SDK Instrumentation 구조](#34-sdk-instrumentation-구조)
4. [개발 환경 구성](#4-개발-환경-구성)
   - 4.1 [사전 요구사항](#41-사전-요구사항)
   - 4.2 [로컬 환경 실행](#42-로컬-환경-실행)
   - 4.3 [개발 도구 설정](#43-개발-도구-설정)
5. [빌드](#5-빌드)
   - 5.1 [Agent 빌드](#51-agent-빌드)
   - 5.2 [Collection Server 빌드](#52-collection-server-빌드)
   - 5.3 [Frontend 빌드](#53-frontend-빌드)
   - 5.4 [Docker 이미지 빌드](#54-docker-이미지-빌드)
   - 5.5 [릴리스 빌드](#55-릴리스-빌드)
6. [테스트](#6-테스트)
   - 6.1 [단위 테스트](#61-단위-테스트)
   - 6.2 [통합 테스트](#62-통합-테스트)
   - 6.3 [E2E 테스트](#63-e2e-테스트)
   - 6.4 [부하 테스트](#64-부하-테스트)
7. [새 Collector 추가하기](#7-새-collector-추가하기)
   - 7.1 [Collector 인터페이스 구현](#71-collector-인터페이스-구현)
   - 7.2 [레지스트리에 등록](#72-레지스트리에-등록)
   - 7.3 [설정 스키마 추가](#73-설정-스키마-추가)
   - 7.4 [테스트 작성](#74-테스트-작성)
8. [새 UI 화면 추가하기](#8-새-ui-화면-추가하기)
   - 8.1 [페이지 라우트 생성](#81-페이지-라우트-생성)
   - 8.2 [데이터 페칭 패턴](#82-데이터-페칭-패턴)
   - 8.3 [차트 컴포넌트 사용](#83-차트-컴포넌트-사용)
   - 8.4 [상태 관리](#84-상태-관리)
9. [새 API 엔드포인트 추가하기](#9-새-api-엔드포인트-추가하기)
   - 9.1 [REST API 핸들러](#91-rest-api-핸들러)
   - 9.2 [gRPC 서비스 확장](#92-grpc-서비스-확장)
   - 9.3 [인증 및 권한](#93-인증-및-권한)
10. [코딩 컨벤션](#10-코딩-컨벤션)
    - 10.1 [Go 컨벤션](#101-go-컨벤션)
    - 10.2 [TypeScript/React 컨벤션](#102-typescriptreact-컨벤션)
    - 10.3 [커밋 메시지 컨벤션](#103-커밋-메시지-컨벤션)
    - 10.4 [PR 프로세스](#104-pr-프로세스)
11. [주요 의존성 및 라이브러리](#11-주요-의존성-및-라이브러리)

---

## 1. 아키텍처 심층 분석

### 1.1 전체 시스템 설계 원칙

AITOP은 다음 설계 원칙을 따릅니다:

1. **OTel-Native**: OpenTelemetry 표준을 기반으로, 벤더 중립적인 계측
2. **단일 Agent**: 언어별 에이전트 대신 하나의 Go 바이너리가 모든 데이터 수집
3. **수집 분리**: 데이터 수집(Collector)과 전송(Transport)의 명확한 역할 분리
4. **로컬 버퍼**: 네트워크 장애 시 데이터 유실 방지를 위한 SQLite 로컬 버퍼
5. **Tail Sampling**: 수집 후 분석하여 중요한 트레이스만 선택적 보관
6. **플러그인 아키텍처**: Collector를 런타임에 로드/언로드 가능한 플러그인 구조

### 1.2 Collection Server 설계

Collection Server는 Agent로부터 데이터를 수신하고 UI에 API를 제공하는 중앙 서버입니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  Collection Server                                               │
│                                                                  │
│  ┌─── gRPC Layer ─────────────────────────────────────────────┐ │
│  │  AgentService.PushMetrics()  AgentService.PushEvents()      │ │
│  │  AgentService.Register()     AgentService.Heartbeat()       │ │
│  │  FleetService.GetConfig()    FleetService.OTAUpdate()       │ │
│  └─────────────────┬──────────────────────────────────────────┘ │
│                    │                                             │
│  ┌─── Core ────────▼──────────────────────────────────────────┐ │
│  │  Validation Gateway  Fleet Controller  Event Bus            │ │
│  │  Evidence Store      Copilot Engine    Discovery Scanner    │ │
│  └─────────────────┬──────────────────────────────────────────┘ │
│                    │                                             │
│  ┌─── Storage ─────▼──────────────────────────────────────────┐ │
│  │  PostgreSQL (상태)  Prometheus (메트릭)  Jaeger (트레이스)  │ │
│  │  LocalStorage/S3 (증거 파일)                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─── REST API Layer ─────────────────────────────────────────┐ │
│  │  /api/v1/services   /api/v1/traces    /api/v1/metrics       │ │
│  │  /api/v1/agents     /api/v1/alerts    /api/v1/diagnostics   │ │
│  │  /api/v1/slo        /api/v1/costs     /api/v1/copilot       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**핵심 컴포넌트**:

- **Validation Gateway**: Agent에서 수신된 데이터의 스키마 검증, PII 마스킹, 중복 제거
- **Fleet Controller**: Agent 등록, 헬스체크, OTA 업데이트 조율, Remote CLI 세션 관리
- **Event Bus**: 내부 이벤트 발행/구독 (알림 트리거, 이상 탐지 신호 전달)
- **Copilot Engine**: 자연어를 PromQL로 변환하는 LLM 기반 엔진
- **Discovery Scanner**: 네트워크 토폴로지 자동 탐지 스캐너

### 1.3 AITOP Agent 설계

Agent는 모니터링 대상 서버에서 실행되는 경량 Go 바이너리입니다.

```
┌──────────────────────────────────────────────────────────────────┐
│  AITOP Agent                                                      │
│                                                                   │
│  ┌─── Collector Registry ───────────────────────────────────┐    │
│  │                                                            │    │
│  │  IT Collectors:                                           │    │
│  │    OSCollector     WebCollector    WASCollector           │    │
│  │    DBCollector                                            │    │
│  │                                                            │    │
│  │  AI Collectors:                                           │    │
│  │    GPUCollector    LLMCollector    VectorDBCollector      │    │
│  │    ServingCollector  OTelMetricsCollector                 │    │
│  │                                                            │    │
│  │  Advanced Collectors:                                     │    │
│  │    BatchCollector  ProfilingCollector  CacheCollector     │    │
│  │    MQCollector                                            │    │
│  └─────────────────────┬──────────────────────────────────────┘   │
│                         │                                          │
│  ┌─── Core Services ───▼──────────────────────────────────┐      │
│  │  Config Manager    Health Monitor     Event Bus         │      │
│  │  Network Scanner   Privilege Manager  Sanitizer         │      │
│  │  Attach Manager    Shell Manager      Plugin Manager    │      │
│  └─────────────────────┬──────────────────────────────────┘      │
│                         │                                          │
│  ┌─── Transport Layer ─▼──────────────────────────────────┐      │
│  │  SQLite Buffer  →  gRPC/HTTPS  →  Collection Server     │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

### 1.4 OTel Collector 파이프라인

두 단계의 OTel Collector가 존재합니다.

**Agent 모드 (DaemonSet - 각 노드에 1개)**:

```yaml
수신: OTLP gRPC/HTTP, Jaeger, hostmetrics, k8sattributes
처리: memory_limiter → k8sattributes → resourcedetection → batch
내보내기: OTLP → Gateway Collector
```

**Gateway 모드 (Deployment - 중앙 집중)**:

```yaml
수신: OTLP (Agent에서 수신)
처리: tail_sampling → batch → attributes → transform
내보내기: Prometheus (메트릭), Jaeger (트레이스), AWS S3 (아카이브)
```

Tail Sampling 정책 (Gateway):
1. 오류 트레이스 → 100% 보관
2. 레이턴시 이상 (P99 기준 3σ 이상) → 100% 보관
3. 느린 요청 (200ms 이상) → 100% 보관
4. 그 외 → 10% 확률적 샘플링

### 1.5 데이터 흐름

**메트릭 흐름**:

```
애플리케이션 → OTel SDK → OTel Collector(Agent) → OTel Collector(Gateway)
                                                          ↓
AITOP Agent → gRPC → Collection Server → Prometheus Remote Write
                                              ↓
                                      Prometheus TSDB
                                              ↓
                                     Collection Server API
                                              ↓
                                         Frontend UI
```

**트레이스 흐름**:

```
애플리케이션 → OTel SDK → OTLP → OTel Collector(Agent)
                                          ↓
                              OTel Collector(Gateway)
                              [Tail Sampling 적용]
                                          ↓
                                    Jaeger gRPC
                                          ↓
                                    Jaeger Storage
                                          ↓
                              Collection Server API (Jaeger HTTP)
                                          ↓
                                     Frontend UI
```

**W3C TraceContext 전파**:

```
HTTP 요청 헤더:
  traceparent: 00-{trace-id}-{parent-span-id}-{flags}
  tracestate: aitop=proj:myproject

  trace-id: 16바이트 hex (128비트) → 모든 서비스에서 동일
  parent-span-id: 8바이트 hex (64비트) → 호출 체인
  flags: 01=샘플링, 00=비샘플링
```

---

## 2. 핵심 기능 동작 방식 및 알고리즘

### 2.1 Collector 레지스트리 패턴

모든 Collector는 `Collector` 인터페이스를 구현하고 레지스트리에 등록됩니다.

```go
// agent/internal/core/registry.go

type Collector interface {
    Name() string
    Start(ctx context.Context, cfg CollectorConfig) error
    Stop(ctx context.Context) error
    Collect(ctx context.Context) (*CollectorResult, error)
    IsEnabled() bool
    Health() HealthStatus
}

type CollectorRegistry struct {
    mu         sync.RWMutex
    collectors map[string]Collector
    scheduler  *Scheduler
}

func (r *CollectorRegistry) Register(c Collector) {
    r.mu.Lock()
    defer r.mu.Unlock()
    r.collectors[c.Name()] = c
}

func (r *CollectorRegistry) RunAll(ctx context.Context) {
    r.mu.RLock()
    defer r.mu.RUnlock()
    for name, c := range r.collectors {
        if !c.IsEnabled() {
            continue
        }
        go func(name string, c Collector) {
            result, err := c.Collect(ctx)
            if err != nil {
                log.Error("collector failed", "name", name, "error", err)
                return
            }
            r.emit(result)
        }(name, c)
    }
}
```

**스케줄링**: 각 Collector는 자체 수집 주기를 가집니다.
- 메트릭 Collector: 60초마다 (agent.yaml `schedule.metrics` 설정)
- 증거(Evidence) Collector: 6시간마다 (agent.yaml `schedule.default` 설정)
- 배치 Collector: 5초마다 (poll_interval 설정)

### 2.2 Tail-based Sampling 알고리즘

Head-based Sampling(전송 전 결정)과 달리, Tail-based Sampling은 트레이스가 완성된 후 보관 여부를 결정합니다.

```
트레이스 수신 시작
      ↓
Gateway Collector 버퍼에 임시 저장 (decision_wait=10초)
      ↓
트레이스 완성(루트 Span 수신) 또는 타임아웃
      ↓
정책 평가 (우선순위 순):
  1. 오류 포함? → YES: 보관
  2. 레이턴시 이상(P99 3σ)? → YES: 보관
  3. 느린 요청(>200ms)? → YES: 보관
  4. 중요 서비스 태그? → YES: 보관
  5. 확률적 샘플링(10%)? → 랜덤: 보관/폐기
      ↓
보관 결정 시: Jaeger로 내보내기
폐기 결정 시: 버퍼에서 삭제
```

**버퍼 관리**:
- `num_traces`: 버퍼에 보관할 최대 트레이스 수 (기본 100,000)
- 버퍼 초과 시 가장 오래된 완성되지 않은 트레이스부터 폐기

```go
// collector/config/otelcol-gateway.yaml 해당 로직
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    expected_new_traces_per_sec: 1000
    policies:
      - name: error-policy
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: latency-policy
        type: latency
        latency: {threshold_ms: 200}
```

### 2.3 Network Topology 자동 탐지

`agent/internal/discovery/netscanner.go`가 담당합니다.

**탐지 방식**:

1. **Passive 방식** (기본): `/proc/net/tcp`, `/proc/net/tcp6`를 파싱하여 현재 TCP 연결 목록 수집
2. **Active 방식** (선택적): 알려진 포트(80, 443, 5432, 6379 등)로 커넥션 시도

```go
func (s *NetScanner) ScanConnections() ([]Connection, error) {
    // /proc/net/tcp 파싱
    conns, err := s.parseProcNetTCP()
    if err != nil {
        return nil, err
    }

    // PID → 프로세스명 매핑
    for i := range conns {
        conns[i].ProcessName = s.pidToProcess(conns[i].LocalPID)
    }

    // 프로토콜 식별 (포트 기반 휴리스틱)
    for i := range conns {
        conns[i].Protocol = s.detectProtocol(conns[i].RemotePort)
    }

    return conns, nil
}
```

**프로토콜 식별 휴리스틱**:

| 포트 | 프로토콜 |
|------|----------|
| 5432 | PostgreSQL |
| 3306 | MySQL |
| 6379 | Redis |
| 9200 | Elasticsearch |
| 19530 | Milvus |
| 6333 | Qdrant |
| 4317 | OTel gRPC |
| 80, 443 | HTTP/HTTPS |

탐지된 연결 정보는 Collection Server로 전송되어 D3.js 기반 토폴로지 맵에 표시됩니다.

### 2.4 perf/eBPF 프로파일링

`agent/internal/collector/profiling/perf_ebpf.go`가 담당합니다.

**CPU 프로파일링 흐름**:

```go
func (p *PerfCollector) CollectCPUProfile(ctx context.Context, cfg ProfilingConfig) (*Profile, error) {
    // 1. perf record 실행
    cmd := exec.CommandContext(ctx,
        "perf", "record",
        "-F", strconv.Itoa(cfg.SamplingFrequency),  // 99 Hz
        "-a",              // 모든 CPU
        "-g",              // 콜그래프 수집
        "--call-graph", "dwarf",  // DWARF 기반 스택 언와인딩
        "-o", tmpFile,
        "sleep", strconv.Itoa(cfg.Duration),
    )
    cmd.Run()

    // 2. perf script로 스택 트레이스 추출
    scriptOut, _ := exec.Command("perf", "script", "-i", tmpFile).Output()

    // 3. 언어별 심볼 해석
    stacks := p.parseStacks(scriptOut)
    stacks = p.resolveSymbols(stacks, cfg.SymbolResolvers)

    // 4. FlameGraph 데이터 구조로 변환
    flamegraph := p.buildFlamegraph(stacks)

    return &Profile{Type: "cpu", Flamegraph: flamegraph}, nil
}
```

**스택 심볼 해석 (Java 예시)**:

```go
func (p *PerfCollector) resolveJavaSymbols(stacks []Stack) []Stack {
    // perf-map-agent가 생성한 /tmp/perf-{pid}.map 파일 참조
    // JIT 컴파일된 Java 메서드의 주소 → 메서드명 매핑
    mapFile := fmt.Sprintf("/tmp/perf-%d.map", pid)
    symbolMap := loadPerfMap(mapFile)

    for i, stack := range stacks {
        for j, frame := range stack.Frames {
            if sym, ok := symbolMap[frame.Address]; ok {
                stacks[i].Frames[j].Symbol = sym
            }
        }
    }
    return stacks
}
```

**FlameGraph JSON 구조**:

```json
{
  "name": "root",
  "value": 1000,
  "children": [
    {
      "name": "handleRequest",
      "value": 600,
      "language": "java",
      "children": [
        {
          "name": "callLLM",
          "value": 400,
          "children": []
        }
      ]
    }
  ]
}
```

### 2.5 Runtime Attach 메커니즘

실행 중인 프로세스에 재시작 없이 OTel 계측을 동적으로 주입합니다.

`agent/internal/attach/` 디렉토리에 언어별 Attach 구현이 있습니다.

**Java Attach 방식 (Byte-code Instrumentation)**:

```go
// agent/internal/attach/java_attach.go
func (a *JavaAttacher) Attach(pid int) error {
    // 1. JVM 프로세스 확인
    if !a.isJVMProcess(pid) {
        return ErrNotJVMProcess
    }

    // 2. Attach API 사용 (VirtualMachine.attach)
    // Java Attach API: com.sun.tools.attach.VirtualMachine
    cmd := exec.Command("java",
        "-cp", a.toolsJarPath,
        "AttachLauncher",
        strconv.Itoa(pid),
        a.agentJarPath,        // aitop-agent.jar
        "endpoint="+a.endpoint,  // Agent 주소
    )
    return cmd.Run()
}
```

**Python Attach 방식 (ptrace + code injection)**:

```go
// agent/internal/attach/python_attach.go
func (a *PythonAttacher) Attach(pid int) error {
    // 1. /proc/{pid}/mem을 통한 코드 주입
    // 2. Python C API로 sys.path에 instrumentation 모듈 추가
    // 3. import opentelemetry 동적 실행
    return a.injectPythonCode(pid, instrumentationCode)
}
```

### 2.6 AI Copilot NL→PromQL 변환

자연어를 PromQL로 변환하는 과정입니다.

```
사용자 자연어 질문
        ↓
[메트릭 컨텍스트 수집]
  사용 가능한 메트릭명 목록
  서비스/레이블 목록
  시간 범위 정보
        ↓
[LLM 프롬프트 구성]
  System: "PromQL 전문가. 아래 메트릭을 사용하여 쿼리 작성."
  Context: 메트릭 스키마
  User: 자연어 질문
        ↓
[LLM 호출 (Claude/GPT)]
        ↓
[PromQL 추출 및 검증]
  구문 검증: Prometheus Parser
  실행 검증: Prometheus /api/v1/query 테스트
        ↓
[결과 반환]
  PromQL + 설명 + 차트
```

```go
// agent/cmd/collection-server/copilot_engine.go
func (e *CopilotEngine) NLToPromQL(ctx context.Context, query string) (*CopilotResult, error) {
    // 1. 관련 메트릭 검색 (임베딩 유사도)
    metrics := e.searchRelevantMetrics(ctx, query)

    // 2. LLM 프롬프트 구성
    prompt := e.buildPrompt(query, metrics, e.getTimeRange(ctx))

    // 3. LLM 호출
    response, err := e.llmClient.Complete(ctx, prompt)
    if err != nil {
        return nil, err
    }

    // 4. PromQL 추출
    promql := e.extractPromQL(response)

    // 5. 유효성 검증
    if err := e.validatePromQL(ctx, promql); err != nil {
        // 실패 시 재시도 (최대 3회)
        return e.retryWithError(ctx, query, promql, err)
    }

    return &CopilotResult{PromQL: promql, Explanation: response.Explanation}, nil
}
```

### 2.7 자동 이상 탐지

Collection Server는 두 가지 이상 탐지 알고리즘을 사용합니다.

**1. 통계적 이상 탐지 (Z-Score 기반)**:

```go
func (d *AnomalyDetector) DetectStatistical(series []float64) bool {
    mean := stat.Mean(series, nil)
    stddev := stat.StdDev(series, nil)

    latest := series[len(series)-1]
    zScore := math.Abs(latest-mean) / stddev

    // Z-Score 3 이상 = 이상치 (정규분포 99.7% 범위 초과)
    return zScore > 3.0
}
```

**2. 계절성 기반 이상 탐지 (Seasonal Decomposition)**:

```go
// 같은 요일, 같은 시간대의 역사적 평균과 비교
func (d *AnomalyDetector) DetectSeasonal(
    current float64,
    historicalSamePeriod []float64,
) bool {
    mean := stat.Mean(historicalSamePeriod, nil)
    stddev := stat.StdDev(historicalSamePeriod, nil)

    // 계절성 보정 Z-Score
    seasonalZ := math.Abs(current-mean) / stddev
    return seasonalZ > 2.5
}
```

### 2.8 배치 프로세스 감지

`agent/internal/collector/batch/detector.go`가 담당합니다.

**자동 감지 알고리즘**:

```go
func (d *BatchDetector) Detect(ctx context.Context) ([]BatchProcess, error) {
    processes := d.listProcesses()
    var batches []BatchProcess

    for _, proc := range processes {
        score := d.calcBatchScore(proc)
        if score >= BatchThreshold {
            batches = append(batches, BatchProcess{
                PID:       proc.PID,
                Name:      proc.Name,
                Language:  d.detectLanguage(proc),
                StartTime: proc.StartTime,
                Score:     score,
            })
        }
    }
    return batches, nil
}

func (d *BatchDetector) calcBatchScore(proc Process) float64 {
    score := 0.0

    // 배치 프로세스 특징:
    // 1. 정기적으로 실행되고 종료되는 패턴
    if d.isRecurringProcess(proc.Name) {
        score += 30
    }
    // 2. 특정 프레임워크 키워드 포함
    if d.containsBatchKeyword(proc.Cmdline) {
        score += 40
    }
    // 3. 배치 Job 관련 JVM 클래스 감지
    if d.hasBatchClass(proc) {
        score += 30
    }

    return score
}
```

---

## 3. 코드 구조

### 3.1 Agent (Go) 구조

```
agent/
├── cmd/
│   ├── aitop-agent/
│   │   └── main.go                    # Agent 진입점
│   │       # - 설정 로드
│   │       # - Collector 레지스트리 초기화
│   │       # - 각 Collector 등록 및 시작
│   │       # - 스케줄러 시작
│   │       # - gRPC 연결 및 전송 시작
│   │
│   └── collection-server/
│       ├── main.go                    # Collection Server 진입점
│       ├── batch_api.go               # 배치 모니터링 REST API
│       ├── flamegraph_api.go          # FlameGraph REST API
│       ├── attach_api.go              # Runtime Attach REST API
│       └── plugin_api.go             # Plugin Manager REST API
│
├── internal/
│   ├── collector/
│   │   ├── it/                        # IT 인프라 Collector
│   │   │   ├── os.go                  # CPU, 메모리, 디스크, 네트워크
│   │   │   ├── web.go                 # nginx, Apache 수집
│   │   │   ├── was.go                 # Tomcat, Spring Boot 수집
│   │   │   └── db.go                  # PostgreSQL, MySQL 등 수집
│   │   │
│   │   ├── ai/                        # AI 특화 Collector
│   │   │   ├── gpu.go                 # NVIDIA/AMD/Intel GPU
│   │   │   ├── llm.go                 # LLM 서비스 수집
│   │   │   ├── vectordb.go            # 벡터 DB 수집
│   │   │   ├── serving.go             # vLLM, Triton 수집
│   │   │   └── otel_metrics.go        # OTel 메트릭 프록시
│   │   │
│   │   ├── batch/                     # 배치 프로세스
│   │   │   ├── detector.go            # 배치 프로세스 감지
│   │   │   ├── process_collector.go   # 배치 Job 메트릭 수집
│   │   │   └── framework/
│   │   │       ├── spring_batch.go    # Spring Batch 수집
│   │   │       └── airflow.go         # Airflow DAG 수집
│   │   │
│   │   └── profiling/
│   │       ├── perf_ebpf.go           # perf/eBPF 프로파일러
│   │       └── batch_profiler/        # 언어별 배치 프로파일러
│   │           ├── java.go
│   │           ├── python.go
│   │           ├── dotnet.go
│   │           └── go.go
│   │
│   ├── core/
│   │   └── registry.go               # Collector 레지스트리
│   │
│   ├── config/
│   │   └── config.go                 # 설정 로드/파싱 (Viper 사용)
│   │
│   ├── transport/                     # 데이터 전송
│   │   ├── grpc.go                    # gRPC 클라이언트
│   │   └── retry.go                   # 재시도/백오프 로직
│   │
│   ├── buffer/
│   │   └── sqlite_buffer.go          # SQLite 로컬 버퍼
│   │
│   ├── attach/                        # Runtime Attach
│   │   ├── java_attach.go
│   │   ├── python_attach.go
│   │   ├── dotnet_attach.go
│   │   ├── node_attach.go
│   │   └── go_attach.go
│   │
│   ├── shell/
│   │   └── pty_server.go             # Remote CLI (PTY)
│   │
│   ├── discovery/
│   │   └── netscanner.go             # 네트워크 토폴로지 탐지
│   │
│   ├── diagnose/
│   │   └── runner.go                 # 자동 진단 실행기
│   │
│   ├── sanitizer/
│   │   └── pii.go                    # PII 마스킹
│   │
│   └── updater/
│       └── ota.go                    # OTA 업데이트
│
├── configs/
│   └── agent.yaml                    # 기본 설정 템플릿
│
├── proto/
│   └── agent.proto                   # gRPC 서비스 정의
│
├── go.mod                            # Go 모듈 (Go 1.25)
└── Makefile                          # 빌드 자동화
```

### 3.2 Collection Server (Go) 구조

```
agent/cmd/collection-server/
├── main.go                           # HTTP/gRPC 서버 시작
├── router.go                         # URL 라우팅 (Chi 또는 Echo)
├── middleware.go                      # 인증, 로깅, CORS
├── auth.go                            # JWT + OIDC/SAML
├── grpc_server.go                     # gRPC AgentService 구현
│
├── api handlers (각 도메인별):
│   ├── services_api.go               # 서비스 맵 API
│   ├── traces_api.go                 # 트레이스 검색 (Jaeger HTTP 프록시)
│   ├── metrics_api.go                # 메트릭 쿼리 (Prometheus HTTP 프록시)
│   ├── agents_api.go                 # Agent 관리
│   ├── alerts_api.go                 # 알림 정책 CRUD
│   ├── diagnostics_api.go            # 진단 실행 및 결과
│   ├── slo_api.go                    # SLO 관리
│   ├── costs_api.go                  # 비용 분석
│   ├── copilot_api.go                # Copilot NL→PromQL
│   ├── batch_api.go                  # 배치 모니터링
│   ├── flamegraph_api.go             # 프로파일링
│   ├── attach_api.go                 # Runtime Attach
│   └── plugin_api.go                 # Plugin Manager
│
└── internal/
    ├── fleet/
    │   └── controller.go             # Fleet 중앙 제어
    ├── copilot/
    │   └── engine.go                 # NL→PromQL 엔진
    ├── anomaly/
    │   └── detector.go               # 이상 탐지
    └── eventbus/
        └── bus.go                    # 내부 이벤트 버스
```

### 3.3 Frontend (Next.js) 구조

```
frontend/src/
├── app/                              # Next.js App Router
│   ├── (auth)/                       # 인증 필요 없는 페이지
│   │   └── login/page.tsx
│   │
│   └── (dashboard)/                  # 인증 필요한 페이지
│       ├── layout.tsx                # 공통 레이아웃 (네비게이션)
│       ├── page.tsx                  # 홈 대시보드
│       ├── services/page.tsx         # 서비스 맵
│       ├── traces/
│       │   ├── page.tsx             # XLog/HeatMap
│       │   └── [id]/page.tsx        # 트레이스 상세 (Waterfall)
│       ├── ai/
│       │   ├── llm/page.tsx         # LLM 현황
│       │   ├── gpu/page.tsx         # GPU 모니터링
│       │   ├── rag/page.tsx         # RAG 파이프라인
│       │   ├── guardrail/page.tsx   # 가드레일
│       │   └── training/page.tsx    # 학습 모니터링
│       ├── profiling/
│       │   └── flamegraph/page.tsx  # FlameGraph 뷰어
│       ├── copilot/page.tsx         # AI Copilot
│       ├── topology/page.tsx        # 네트워크 토폴로지 (D3.js)
│       ├── agents/
│       │   ├── page.tsx             # Fleet 현황
│       │   └── [id]/
│       │       ├── page.tsx         # Agent 상세
│       │       └── terminal/page.tsx  # Remote CLI
│       ├── alerts/
│       │   ├── page.tsx             # 알림 정책 목록
│       │   └── incidents/page.tsx   # 인시던트 목록
│       ├── diagnostics/page.tsx     # 진단 보고서
│       ├── slo/page.tsx             # SLO 관리
│       ├── costs/page.tsx           # 비용 분석
│       ├── batch/page.tsx           # 배치 모니터링
│       ├── dashboards/page.tsx      # 커스텀 대시보드 빌더
│       └── settings/
│           ├── users/page.tsx
│           ├── sso/page.tsx
│           └── channels/page.tsx
│
├── components/                       # 재사용 컴포넌트
│   ├── charts/
│   │   ├── EChartsLine.tsx          # ECharts 라인 차트
│   │   ├── HeatMap.tsx              # XLog 히트맵
│   │   ├── FlameGraph.tsx           # FlameGraph (D3.js)
│   │   └── TopologyMap.tsx          # 토폴로지 맵 (D3.js)
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   └── TimeRangePicker.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       └── TopBar.tsx
│
├── lib/
│   ├── api/                          # API 클라이언트
│   │   ├── client.ts                # Axios/Fetch 기반 HTTP 클라이언트
│   │   ├── metrics.ts               # 메트릭 API 함수
│   │   ├── traces.ts                # 트레이스 API 함수
│   │   └── agents.ts                # Agent API 함수
│   ├── hooks/                        # React 커스텀 훅
│   │   ├── useMetrics.ts
│   │   ├── useWebSocket.ts           # 실시간 업데이트
│   │   └── useTimeRange.ts
│   └── store/                        # Zustand 상태 관리
│       ├── projectStore.ts
│       ├── timeRangeStore.ts
│       └── filterStore.ts
│
└── i18n/                             # 국제화
    ├── ko.json
    ├── en.json
    └── ja.json
```

### 3.4 SDK Instrumentation 구조

```
sdk-instrumentation/
├── python/
│   ├── otel_setup.py                 # OTel SDK 초기화 헬퍼
│   ├── agents/
│   │   ├── langchain_tracer.py       # LangChain 계측
│   │   └── langgraph_tracer.py       # LangGraph 계측
│   ├── llm/
│   │   ├── vllm_instrumentation.py   # vLLM 계측
│   │   └── ollama_instrumentation.py # Ollama 계측
│   ├── guardrails/
│   │   └── nemo_instrumentation.py   # NeMo Guardrails 계측
│   └── vector_db/
│       ├── milvus_instrumentation.py
│       ├── qdrant_instrumentation.py
│       └── chroma_instrumentation.py
│
├── java/
│   ├── src/main/java/io/aitop/
│   │   └── AitopAgent.java           # Byte-code instrumentation (ASM)
│   └── build.gradle.kts
│
├── nodejs/
│   ├── otel-setup.js                 # OTel SDK 초기화
│   └── frontend-streaming.js         # 브라우저 RUM + SSE/WebSocket 추적
│
├── go/
│   └── otel_setup.go                 # OTel SDK 초기화
│
└── dotnet/
    ├── Aitop.Profiler.csproj         # .NET CLR Profiler
    └── src/
        ├── ClrProfiler.cpp           # CLR ICorProfilerCallback 구현
        └── EventPipeClient.cs        # EventPipe 기반 메트릭 수집
```

---

## 4. 개발 환경 구성

### 4.1 사전 요구사항

| 도구 | 버전 | 설치 방법 |
|------|------|----------|
| Go | 1.25+ | https://go.dev/dl/ |
| Node.js | 20 LTS+ | https://nodejs.org/ |
| Docker | 24.0+ | https://docs.docker.com/get-docker/ |
| Docker Compose | 2.20+ | Docker Desktop 포함 |
| kubectl | 1.28+ | `brew install kubectl` |
| Helm | 3.14+ | `brew install helm` |
| grpcurl | 최신 | `brew install grpcurl` |
| golangci-lint | 1.58+ | `brew install golangci-lint` |

### 4.2 로컬 환경 실행

```bash
# 1. 저장소 클론
git clone https://github.com/your-org/aiservice-monitoring.git
cd aiservice-monitoring

# 2. 로컬 인프라 기동 (Prometheus + Jaeger + PostgreSQL)
docker compose -f docker-compose.e2e.yaml up -d \
  prometheus jaeger postgres

# 3. Collection Server 실행
cd agent
go run ./cmd/collection-server \
  --config ../configs/server.local.yaml \
  --port 8080 \
  --grpc-port 50051

# 4. Frontend 개발 서버 실행
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
# http://localhost:3000 접속

# 5. Agent 실행 (개발 모드)
cd agent
go run ./cmd/aitop-agent \
  --config ./configs/agent.yaml \
  --server-url http://localhost:50051 \
  --insecure

# 6. 테스트용 샘플 트레이스 생성
cd sdk-instrumentation/python
pip install -r requirements.txt
python demo_service.py
```

### 4.3 개발 도구 설정

**VS Code 설정** (`.vscode/settings.json`):

```json
{
  "go.lintTool": "golangci-lint",
  "go.lintFlags": ["--fast"],
  "go.formatTool": "gofmt",
  "[go]": {
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  },
  "[typescript]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

**golangci-lint 설정** (`.golangci.yml`):

```yaml
linters:
  enable:
    - errcheck
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused
    - gofmt
    - goimports
    - revive
linters-settings:
  revive:
    rules:
      - name: exported
        severity: warning
```

---

## 5. 빌드

### 5.1 Agent 빌드

```bash
cd agent

# 개발 빌드
go build -o bin/aitop-agent ./cmd/aitop-agent

# 프로덕션 빌드 (최적화, 디버그 심볼 제거)
go build \
  -ldflags="-w -s -X main.version=$(git describe --tags)" \
  -trimpath \
  -o bin/aitop-agent \
  ./cmd/aitop-agent

# 크로스 컴파일
GOOS=linux GOARCH=amd64 go build -o bin/aitop-agent-linux-amd64 ./cmd/aitop-agent
GOOS=linux GOARCH=arm64 go build -o bin/aitop-agent-linux-arm64 ./cmd/aitop-agent
GOOS=windows GOARCH=amd64 go build -o bin/aitop-agent-windows-amd64.exe ./cmd/aitop-agent
```

### 5.2 Collection Server 빌드

```bash
cd agent

# Collection Server 빌드
go build \
  -ldflags="-w -s -X main.version=$(git describe --tags)" \
  -o bin/collection-server \
  ./cmd/collection-server

# Proto 파일 재생성 (proto 변경 시)
protoc \
  --go_out=. \
  --go-grpc_out=. \
  --go_opt=paths=source_relative \
  --go-grpc_opt=paths=source_relative \
  proto/agent.proto
```

### 5.3 Frontend 빌드

```bash
cd frontend

# 타입 검사
npm run typecheck

# 린트
npm run lint

# 프로덕션 빌드
npm run build

# 빌드 결과물 분석 (번들 크기 확인)
ANALYZE=true npm run build
```

### 5.4 Docker 이미지 빌드

```bash
# Agent 이미지
docker build \
  -t aitop/agent:$(git describe --tags) \
  -f agent/Dockerfile \
  ./agent

# Collection Server 이미지
docker build \
  -t aitop/collection-server:$(git describe --tags) \
  -f agent/Dockerfile.server \
  ./agent

# Frontend 이미지
docker build \
  -t aitop/frontend:$(git describe --tags) \
  -f frontend/Dockerfile \
  ./frontend

# 멀티-아키텍처 빌드 (amd64 + arm64)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t aitop/agent:$(git describe --tags) \
  --push \
  -f agent/Dockerfile \
  ./agent
```

### 5.5 릴리스 빌드

GitHub Actions CI/CD가 자동으로 처리합니다. 수동 릴리스가 필요한 경우:

```bash
# 태그 생성
git tag -s v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0

# 로컬 릴리스 빌드
make release VERSION=v1.1.0
# Makefile이 아래를 자동 실행:
# - 크로스 컴파일 (linux/amd64, linux/arm64, windows/amd64, darwin/arm64)
# - 체크섬(SHA256) 생성
# - Docker 이미지 빌드 및 푸시
# - Helm 차트 패키징
```

---

## 6. 테스트

### 6.1 단위 테스트

```bash
# Agent 전체 단위 테스트
cd agent
go test ./... -v -race -timeout 60s

# 특정 패키지
go test ./internal/collector/... -v

# 특정 테스트 함수
go test ./internal/collector/it/... -run TestOSCollector_CPU -v

# 커버리지 리포트
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

# Frontend 단위 테스트
cd frontend
npm run test          # Vitest
npm run test:coverage # 커버리지 포함
```

**테스트 작성 예시**:

```go
// agent/internal/collector/it/os_test.go
func TestOSCollector_CPU(t *testing.T) {
    cfg := CollectorConfig{
        Enabled: "true",
    }

    collector := NewOSCollector()
    err := collector.Start(context.Background(), cfg)
    require.NoError(t, err)
    defer collector.Stop(context.Background())

    result, err := collector.Collect(context.Background())
    require.NoError(t, err)

    // CPU 메트릭 존재 확인
    cpuMetric := result.FindMetric("system.cpu.utilization")
    assert.NotNil(t, cpuMetric)
    assert.GreaterOrEqual(t, cpuMetric.Value, 0.0)
    assert.LessOrEqual(t, cpuMetric.Value, 100.0)
}
```

### 6.2 통합 테스트

```bash
# 통합 테스트 환경 기동
docker compose -f docker-compose.e2e.yaml up -d

# 통합 테스트 실행
cd agent
go test ./test/integration/... -v -tags=integration -timeout 5m

# 테스트 후 환경 정리
docker compose -f docker-compose.e2e.yaml down -v
```

통합 테스트는 실제 DB, Prometheus, Jaeger와 연결하여 실행합니다. Mock을 사용하지 않습니다.

### 6.3 E2E 테스트

```bash
# E2E 환경 기동 (전체 스택)
docker compose -f docker-compose.e2e.yaml up -d
sleep 30  # 서비스 기동 대기

# Playwright E2E 테스트
cd frontend
npx playwright test                       # 전체 실행
npx playwright test --ui                  # UI 모드 (디버깅)
npx playwright test traces/               # 특정 디렉토리
npx playwright test --project=chromium    # 특정 브라우저

# E2E 테스트 리포트
npx playwright show-report
```

E2E 테스트 파일 위치: `frontend/e2e/`

```typescript
// frontend/e2e/traces.spec.ts
test('XLog 히트맵에서 트레이스 조회', async ({ page }) => {
    await page.goto('/traces');

    // 히트맵이 렌더링될 때까지 대기
    await page.waitForSelector('[data-testid="heatmap"]');

    // 히트맵에서 영역 드래그 (250px × 100px 영역)
    await page.dragAndDrop('[data-testid="heatmap"]', '[data-testid="heatmap"]', {
        sourcePosition: { x: 100, y: 50 },
        targetPosition: { x: 350, y: 150 }
    });

    // XLog 테이블에 결과가 표시됨
    await expect(page.locator('[data-testid="xlog-table"] tr')).toHaveCount(
        { greaterThan: 0 }
    );
});
```

### 6.4 부하 테스트

```bash
# Locust 부하 테스트
cd locust
pip install locust

# Collection Server API 부하 테스트
locust -f locustfile_api.py \
  --host http://localhost:8080 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m

# 결과 리포트 생성
locust -f locustfile_api.py \
  --headless \
  --csv=results/api_load_test
```

---

## 7. 새 Collector 추가하기

예시: Redis Cluster 메트릭을 수집하는 `RedisClusterCollector`를 추가합니다.

### 7.1 Collector 인터페이스 구현

```go
// agent/internal/collector/it/redis_cluster.go
package it

import (
    "context"
    "github.com/your-org/aiservice-monitoring/agent/internal/core"
)

type RedisClusterCollector struct {
    enabled  bool
    nodes    []string
    password string
}

// 인터페이스 컴파일 타임 검증
var _ core.Collector = (*RedisClusterCollector)(nil)

func NewRedisClusterCollector() *RedisClusterCollector {
    return &RedisClusterCollector{}
}

func (c *RedisClusterCollector) Name() string {
    return "redis_cluster"
}

func (c *RedisClusterCollector) Start(ctx context.Context, cfg core.CollectorConfig) error {
    c.enabled = cfg.GetBool("enabled", false)
    c.nodes = cfg.GetStringSlice("nodes")
    c.password = cfg.GetString("password_env", "")
    if c.password != "" {
        c.password = os.Getenv(c.password)
    }
    return nil
}

func (c *RedisClusterCollector) Stop(ctx context.Context) error {
    return nil
}

func (c *RedisClusterCollector) Collect(ctx context.Context) (*core.CollectorResult, error) {
    if !c.enabled {
        return &core.CollectorResult{}, nil
    }

    result := &core.CollectorResult{}

    for _, node := range c.nodes {
        info, err := c.fetchInfo(ctx, node)
        if err != nil {
            result.AddError(fmt.Errorf("node %s: %w", node, err))
            continue
        }

        result.AddMetric(core.Metric{
            Name:  "redis.cluster.connected_slaves",
            Value: float64(info.ConnectedSlaves),
            Labels: map[string]string{"node": node},
        })
        result.AddMetric(core.Metric{
            Name:  "redis.cluster.used_memory_bytes",
            Value: float64(info.UsedMemory),
            Labels: map[string]string{"node": node},
        })
    }

    return result, nil
}

func (c *RedisClusterCollector) IsEnabled() bool {
    return c.enabled
}

func (c *RedisClusterCollector) Health() core.HealthStatus {
    if !c.enabled {
        return core.HealthDisabled
    }
    // 연결 테스트
    return core.HealthOK
}
```

### 7.2 레지스트리에 등록

```go
// agent/cmd/aitop-agent/main.go
import (
    "github.com/your-org/aiservice-monitoring/agent/internal/collector/it"
)

func main() {
    registry := core.NewCollectorRegistry()

    // 기존 Collector 등록
    registry.Register(it.NewOSCollector())
    registry.Register(it.NewWebCollector())

    // 새 Collector 등록
    registry.Register(it.NewRedisClusterCollector())

    // ... 이하 동일
}
```

### 7.3 설정 스키마 추가

```yaml
# agent/configs/agent.yaml에 추가
collectors:
  redis_cluster:
    enabled: "false"
    nodes:
      - "redis-1:6379"
      - "redis-2:6379"
    password_env: "REDIS_PASSWORD"  # 환경 변수명
```

```go
// agent/internal/config/schema.go에 검증 규칙 추가
func validateRedisCluster(cfg map[string]interface{}) error {
    if nodes, ok := cfg["nodes"].([]interface{}); ok {
        if len(nodes) == 0 {
            return fmt.Errorf("redis_cluster.nodes must not be empty when enabled")
        }
    }
    return nil
}
```

### 7.4 테스트 작성

```go
// agent/internal/collector/it/redis_cluster_test.go
func TestRedisClusterCollector_Collect(t *testing.T) {
    // 테스트용 Redis 서버 (testcontainers 사용)
    ctx := context.Background()
    container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: testcontainers.ContainerRequest{
            Image:        "redis:7",
            ExposedPorts: []string{"6379/tcp"},
            WaitingFor:   wait.ForListeningPort("6379/tcp"),
        },
        Started: true,
    })
    require.NoError(t, err)
    defer container.Terminate(ctx)

    port, _ := container.MappedPort(ctx, "6379")

    collector := NewRedisClusterCollector()
    err = collector.Start(ctx, core.CollectorConfig{
        "enabled": "true",
        "nodes":   []string{fmt.Sprintf("localhost:%s", port.Port())},
    })
    require.NoError(t, err)

    result, err := collector.Collect(ctx)
    require.NoError(t, err)

    metric := result.FindMetric("redis.cluster.used_memory_bytes")
    assert.NotNil(t, metric)
    assert.Greater(t, metric.Value, float64(0))
}
```

---

## 8. 새 UI 화면 추가하기

예시: Redis Cluster 대시보드 페이지를 추가합니다.

### 8.1 페이지 라우트 생성

```bash
# 디렉토리 생성
mkdir -p frontend/src/app/(dashboard)/infra/redis

# 파일 생성
touch frontend/src/app/(dashboard)/infra/redis/page.tsx
```

```typescript
// frontend/src/app/(dashboard)/infra/redis/page.tsx
import { Suspense } from 'react'
import { RedisClusterDashboard } from '@/components/redis/RedisClusterDashboard'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function RedisPage() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Redis Cluster</h1>
            <Suspense fallback={<LoadingSpinner />}>
                <RedisClusterDashboard />
            </Suspense>
        </div>
    )
}
```

### 8.2 데이터 페칭 패턴

```typescript
// frontend/src/lib/api/redis.ts
import { apiClient } from './client'

export interface RedisMetrics {
    node: string
    usedMemoryBytes: number
    connectedSlaves: number
    hitRate: number
}

export async function getRedisMetrics(
    timeRange: TimeRange
): Promise<RedisMetrics[]> {
    const response = await apiClient.get('/api/v1/metrics/redis', {
        params: {
            start: timeRange.start.toISOString(),
            end: timeRange.end.toISOString(),
        }
    })
    return response.data
}
```

```typescript
// frontend/src/lib/hooks/useRedisMetrics.ts
import { useQuery } from '@tanstack/react-query'
import { getRedisMetrics } from '@/lib/api/redis'
import { useTimeRange } from './useTimeRange'

export function useRedisMetrics() {
    const { timeRange } = useTimeRange()

    return useQuery({
        queryKey: ['redis-metrics', timeRange],
        queryFn: () => getRedisMetrics(timeRange),
        refetchInterval: 30_000,  // 30초 자동 갱신
        staleTime: 20_000,
    })
}
```

### 8.3 차트 컴포넌트 사용

```typescript
// frontend/src/components/redis/RedisClusterDashboard.tsx
'use client'

import { useRedisMetrics } from '@/lib/hooks/useRedisMetrics'
import { EChartsLine } from '@/components/charts/EChartsLine'
import { MetricCard } from '@/components/ui/MetricCard'

export function RedisClusterDashboard() {
    const { data, isLoading, error } = useRedisMetrics()

    if (isLoading) return <div>로딩 중...</div>
    if (error) return <div>오류: {error.message}</div>

    return (
        <div className="grid grid-cols-2 gap-4">
            {/* 메트릭 카드 */}
            <MetricCard
                title="평균 메모리 사용"
                value={data?.avgUsedMemoryBytes}
                unit="bytes"
                format="bytes"
            />

            {/* 시계열 차트 */}
            <EChartsLine
                title="메모리 사용률 추세"
                series={data?.memorySeries ?? []}
                xAxis={{ type: 'time' }}
                yAxis={{ name: 'Bytes', type: 'value' }}
            />
        </div>
    )
}
```

### 8.4 상태 관리

전역 상태는 Zustand로 관리합니다.

```typescript
// frontend/src/lib/store/filterStore.ts
import { create } from 'zustand'

interface FilterStore {
    selectedNodes: string[]
    setSelectedNodes: (nodes: string[]) => void
    clearFilters: () => void
}

export const useFilterStore = create<FilterStore>((set) => ({
    selectedNodes: [],
    setSelectedNodes: (nodes) => set({ selectedNodes: nodes }),
    clearFilters: () => set({ selectedNodes: [] }),
}))
```

---

## 9. 새 API 엔드포인트 추가하기

### 9.1 REST API 핸들러

```go
// agent/cmd/collection-server/redis_api.go
package main

import (
    "net/http"
    "github.com/your-org/aiservice-monitoring/agent/internal/auth"
)

func (s *Server) registerRedisRoutes(r chi.Router) {
    r.Route("/api/v1/metrics/redis", func(r chi.Router) {
        r.Use(auth.RequireAuth)
        r.Use(auth.RequireProjectAccess)
        r.Get("/", s.handleGetRedisMetrics)
        r.Get("/{nodeID}", s.handleGetRedisNodeMetrics)
    })
}

func (s *Server) handleGetRedisMetrics(w http.ResponseWriter, r *http.Request) {
    // 1. 쿼리 파라미터 파싱
    start, end, err := parseTimeRange(r)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    projectID := auth.ProjectIDFromContext(r.Context())

    // 2. Prometheus에서 데이터 조회
    query := fmt.Sprintf(
        `redis_cluster_used_memory_bytes{project="%s"}`, projectID)
    result, err := s.prometheus.QueryRange(r.Context(), query, start, end)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    // 3. 응답 직렬화
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(transformToRedisMetrics(result))
}
```

### 9.2 gRPC 서비스 확장

```protobuf
// proto/agent.proto에 메시지 추가
message RedisMetrics {
    string node = 1;
    int64 used_memory_bytes = 2;
    int32 connected_slaves = 3;
    double hit_rate = 4;
    google.protobuf.Timestamp collected_at = 5;
}

// AgentService에 Redis 메시지 추가
message PushMetricsRequest {
    // 기존 필드들...
    repeated RedisMetrics redis_metrics = 20;  // 새 필드 추가
}
```

```bash
# Proto 파일 재생성
cd agent
protoc \
  --go_out=. \
  --go-grpc_out=. \
  --go_opt=paths=source_relative \
  --go-grpc_opt=paths=source_relative \
  proto/agent.proto
```

### 9.3 인증 및 권한

모든 API 핸들러는 JWT 인증 미들웨어를 통과합니다.

```go
// agent/internal/auth/middleware.go

func RequireAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        token := r.Header.Get("Authorization")
        if token == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        claims, err := validateJWT(strings.TrimPrefix(token, "Bearer "))
        if err != nil {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        ctx := context.WithValue(r.Context(), userClaimsKey, claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            claims := UserClaimsFromContext(r.Context())
            for _, role := range roles {
                if claims.Role == role {
                    next.ServeHTTP(w, r)
                    return
                }
            }
            http.Error(w, "Forbidden", http.StatusForbidden)
        })
    }
}
```

Remote CLI 전용 권한 검사:

```go
// Remote CLI는 admin 또는 sre만 허용
r.Route("/api/v1/agents/{agentID}/shell", func(r chi.Router) {
    r.Use(auth.RequireAuth)
    r.Use(auth.RequireRole("admin", "sre"))
    r.Get("/connect", s.handleRemoteShell)
})
```

---

## 10. 코딩 컨벤션

### 10.1 Go 컨벤션

**패키지 구조**:
- `internal/`: 외부에서 임포트 불가한 내부 패키지
- `pkg/`: 외부에서 임포트 가능한 공개 패키지
- `cmd/`: 실행 가능한 메인 패키지

**에러 처리**:
```go
// 에러는 즉시 반환, 무시하지 않음
result, err := collector.Collect(ctx)
if err != nil {
    return fmt.Errorf("collect metrics: %w", err)  // %w로 래핑
}

// 에러 타입 정의
type CollectorError struct {
    Name string
    Err  error
}
func (e *CollectorError) Error() string {
    return fmt.Sprintf("collector %s: %s", e.Name, e.Err)
}
func (e *CollectorError) Unwrap() error { return e.Err }
```

**컨텍스트**:
```go
// 모든 긴 작업에 context 전달 (타임아웃, 취소 지원)
func (c *Collector) Collect(ctx context.Context) (*Result, error) {
    ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
    defer cancel()
    // ...
}
```

**로깅**:
```go
// log/slog 사용 (구조화된 로그)
slog.Info("collector started",
    "name", c.Name(),
    "enabled", c.IsEnabled(),
    "interval", cfg.Interval,
)
slog.Error("collector failed",
    "name", c.Name(),
    "error", err,
)
```

**테이블 주도 테스트**:
```go
func TestParseTimeRange(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    time.Duration
        wantErr bool
    }{
        {"1시간", "1h", time.Hour, false},
        {"잘못된 형식", "abc", 0, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := parseTimeRange(tt.input)
            if tt.wantErr {
                assert.Error(t, err)
                return
            }
            assert.NoError(t, err)
            assert.Equal(t, tt.want, got)
        })
    }
}
```

### 10.2 TypeScript/React 컨벤션

**컴포넌트 작성 규칙**:
```typescript
// 함수형 컴포넌트 + TypeScript 인터페이스
interface MetricCardProps {
    title: string
    value: number | undefined
    unit: string
    format?: 'number' | 'bytes' | 'percent'
    className?: string
}

export function MetricCard({
    title,
    value,
    unit,
    format = 'number',
    className,
}: MetricCardProps) {
    const formatted = formatValue(value, format)

    return (
        <div className={cn('rounded-lg border p-4', className)}>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">
                {formatted} <span className="text-sm">{unit}</span>
            </p>
        </div>
    )
}
```

**데이터 페칭**: React Query 사용, 직접 useEffect 사용 지양
**스타일링**: Tailwind CSS 클래스 사용, 인라인 스타일 지양
**상태 관리**: 전역 상태는 Zustand, 서버 상태는 React Query
**파일 명명**: 컴포넌트는 PascalCase, 유틸리티는 camelCase

### 10.3 커밋 메시지 컨벤션

Conventional Commits 형식을 따릅니다.

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**type 종류**:
- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 리팩토링 (기능 변경 없음)
- `test`: 테스트 추가/수정
- `chore`: 빌드 설정, 의존성 업데이트
- `perf`: 성능 개선

**예시**:
```
feat(collector): Redis Cluster 메트릭 수집 Collector 추가

- INFO 명령으로 메모리, 슬레이브 수, 히트율 수집
- 멀티 노드 지원
- 환경 변수로 비밀번호 관리

Closes #123
```

### 10.4 PR 프로세스

1. **브랜치 명명**: `feat/redis-cluster-collector`, `fix/gpu-collection-nil-panic`
2. **PR 크기**: 하나의 PR = 하나의 기능 또는 버그 수정
3. **필수 항목**:
   - 관련 테스트 포함 (단위/통합)
   - `go test ./...` 통과
   - `golangci-lint run` 통과
   - `npm run lint && npm run typecheck` 통과
4. **리뷰어**: 최소 1명 승인 필요
5. **Merge 방법**: Squash and Merge (커밋 이력 정리)

---

## 11. 주요 의존성 및 라이브러리

### Go (agent/go.mod)

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| `go.opentelemetry.io/otel` | v1.31+ | OTel SDK |
| `go.opentelemetry.io/collector` | v0.104+ | OTel Collector |
| `google.golang.org/grpc` | v1.65+ | gRPC 통신 |
| `github.com/mattn/go-sqlite3` | v1.14+ | SQLite 로컬 버퍼 |
| `github.com/spf13/viper` | v1.18+ | 설정 파일 파싱 |
| `github.com/go-chi/chi/v5` | v5.0+ | HTTP 라우터 |
| `github.com/golang-jwt/jwt/v5` | v5.2+ | JWT 인증 |
| `gonum.org/v1/gonum` | v0.15+ | 통계 계산 (이상 탐지) |
| `github.com/creack/pty` | v1.1+ | PTY (Remote CLI) |
| `github.com/testcontainers/testcontainers-go` | v0.31+ | 통합 테스트 컨테이너 |

### Node.js (frontend/package.json)

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| `next` | 16.2.0 | React 프레임워크 |
| `react` | 19.2.4 | UI 라이브러리 |
| `tailwindcss` | 4.x | CSS 유틸리티 |
| `echarts` | 6.0 | 차트 라이브러리 |
| `d3` | 7.9 | SVG 시각화 (토폴로지, FlameGraph) |
| `zustand` | 5.0 | 전역 상태 관리 |
| `@tanstack/react-query` | 5.x | 서버 상태 관리 |
| `axios` | 1.7+ | HTTP 클라이언트 |
| `@xterm/xterm` | 5.x | 웹 터미널 (Remote CLI) |
| `next-intl` | 3.x | 국제화 (ko/en/ja) |
| `playwright` | 1.44+ | E2E 테스트 |
| `vitest` | 1.6+ | 단위 테스트 |
