# OTel Collector → AITOP 내장 OTLP Receiver 마이그레이션 가이드

> **대상 독자**: 기존에 OpenTelemetry Collector를 사이드카 또는 게이트웨이로 운영하면서
> AITOP에 텔레메트리를 전달하던 팀.
> **AITOP 버전**: v1.0+ (WS-1.1 구현 이후)

---

## 배경

v0.9.x 이전까지 AITOP은 OTel Collector → Jaeger/Prometheus 경로를 통해 트레이스·메트릭을
수신했습니다. v1.0부터는 **AITOP Collection Server 자체가 OTLP Receiver** 역할을 수행합니다.

```
기존 구조 (v0.9.x)
  App SDK ──OTLP──► OTel Collector ──► Jaeger ──► AITOP(Proxy)
                                   └──► Prometheus ──► AITOP(Proxy)

신규 구조 (v1.0+)
  App SDK ──OTLP/gRPC :4317──► AITOP Collection Server
           ──OTLP/HTTP :8080──►    (내장 TraceEngine + MetricEngine)
```

외부 컨테이너가 **Jaeger, Prometheus, OTel Collector** 3개에서 **0개**로 줄어듭니다.

---

## 1단계: AITOP OTLP 엔드포인트 확인

AITOP Collection Server는 두 가지 방식으로 OTLP를 수신합니다.

| 프로토콜 | 주소 | 환경변수 |
|---------|------|---------|
| OTLP/gRPC (HTTP/2) | `:4317` | `AITOP_OTLP_GRPC_ADDR` |
| OTLP/HTTP (JSON·Protobuf) | `:8080/v1/traces`, `:8080/v1/metrics` | 기존 `addr` 플래그 |

헬스 체크:
```bash
# gRPC
grpcurl -plaintext localhost:4317 grpc.health.v1.Health/Check

# HTTP
curl -s http://localhost:8080/v1/traces -X POST \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}' | cat
# → {}  (빈 응답 = 정상)
```

---

## 2단계: OTel SDK exporter 설정 변경

### Go SDK

```go
// 변경 전
exp, _ := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpoint("otel-collector:4318"),
)

// 변경 후
exp, _ := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpoint("aitop-server:8080"),
    otlptracehttp.WithInsecure(),
)
// 또는 gRPC
exp, _ := otlptracegrpc.New(ctx,
    otlptracegrpc.WithEndpoint("aitop-server:4317"),
    otlptracegrpc.WithInsecure(),
)
```

### Java SDK (환경변수)

```bash
# 변경 전
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

# 변경 후 (HTTP)
OTEL_EXPORTER_OTLP_ENDPOINT=http://aitop-server:8080

# 변경 후 (gRPC)
OTEL_EXPORTER_OTLP_ENDPOINT=http://aitop-server:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

### Python SDK (환경변수)

```bash
# 변경 전
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics

# 변경 후
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://aitop-server:8080/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://aitop-server:8080/v1/metrics
```

### Node.js SDK

```js
// 변경 전
const exporter = new OTLPTraceExporter({
  url: 'http://otel-collector:4318/v1/traces',
});

// 변경 후
const exporter = new OTLPTraceExporter({
  url: 'http://aitop-server:8080/v1/traces',
});
```

---

## 3단계: OTel Collector 설정 제거 또는 유지

### 완전 제거 (권장)

AITOP이 OTLP 엔드포인트를 직접 수신하므로 Collector가 불필요합니다.

```bash
# docker-compose에서 otel-collector 서비스 제거
docker-compose down otel-collector
```

### OTel Collector를 팬아웃 게이트웨이로 유지 (선택)

여러 백엔드에 동시에 전송해야 하는 경우, Collector를 유지하되 AITOP을 exporter로 추가합니다.

```yaml
# otel-collector-config.yaml
exporters:
  otlphttp/aitop:
    endpoint: http://aitop-server:8080
    tls:
      insecure: true

  # 기존 exporter 유지 (이중 전송)
  otlphttp/jaeger:
    endpoint: http://jaeger:4318

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlphttp/aitop, otlphttp/jaeger]  # 병렬 전송
    metrics:
      receivers: [otlp]
      exporters: [otlphttp/aitop]
```

---

## 4단계: docker-compose 업데이트

```yaml
# docker-compose.yml — v1.0 최소 구성
services:
  aitop-server:
    image: aitop/collection-server:1.0
    ports:
      - "8080:8080"   # HTTP API + OTLP/HTTP
      - "4317:4317"   # OTLP/gRPC
    environment:
      AITOP_OTLP_GRPC_ADDR: ":4317"
      AITOP_STORAGE_TYPE: local
      AITOP_STORAGE_PATH: /data
    volumes:
      - aitop-data:/data

  # 아래 서비스들 제거 가능
  # otel-collector: ...  ← 제거
  # jaeger: ...          ← 제거
  # prometheus: ...      ← 제거

volumes:
  aitop-data:
```

**컨테이너 수 변화**: 8개 → 3개 (aitop-server, aitop-agent, app)

---

## 5단계: Kubernetes 업데이트

```yaml
# aitop-server Deployment에 포트 추가
spec:
  template:
    spec:
      containers:
        - name: aitop-server
          ports:
            - containerPort: 8080   # HTTP
            - containerPort: 4317   # OTLP/gRPC
          env:
            - name: AITOP_OTLP_GRPC_ADDR
              value: ":4317"
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: aitop-server
spec:
  ports:
    - name: http
      port: 8080
      targetPort: 8080
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
```

OTel Operator를 사용하는 경우:
```yaml
# OpenTelemetryCollector CR의 exporter를 AITOP으로 변경
exporters:
  otlphttp:
    endpoint: http://aitop-server.monitoring.svc.cluster.local:8080
```

---

## 6단계: 검증

```bash
# 1. 스팬 전송 테스트 (protobuf)
curl -s http://localhost:8080/v1/traces \
  -X POST \
  -H "Content-Type: application/x-protobuf" \
  --data-binary @sample_trace.pb

# 2. 메트릭 전송 테스트 (JSON)
curl -s http://localhost:8080/v1/metrics \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [{"key":"service.name","value":{"stringValue":"my-service"}}]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "http.request.count",
          "gauge": {
            "dataPoints": [{
              "timeUnixNano": "1711756800000000000",
              "asDouble": 42.0
            }]
          }
        }]
      }]
    }]
  }'
# → {}

# 3. gRPC 헬스 체크
grpcurl -plaintext localhost:4317 grpc.health.v1.Health/Check
# → { "status": "SERVING" }

# 4. AITOP 서버 로그에서 수신 확인
docker logs aitop-server | grep "otlp"
# → {"level":"DEBUG","msg":"otlp/http: traces received","spans":1,"queued":1,"dropped":0}
```

---

## 환경변수 레퍼런스

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `AITOP_OTLP_GRPC_ADDR` | `:4317` | OTLP/gRPC 리슨 주소. 빈 문자열이면 gRPC 비활성 |
| `AITOP_OTLP_MAX_BODY_MB` | `4` | 요청 최대 크기 (MiB) |

---

## 지원하는 OTLP 신호 유형

| 신호 | OTLP/HTTP | OTLP/gRPC | Content-Type |
|------|-----------|-----------|--------------|
| Traces | ✅ `/v1/traces` | ✅ `TraceService/Export` | `application/x-protobuf`, `application/json` |
| Metrics | ✅ `/v1/metrics` | ✅ `MetricsService/Export` | `application/x-protobuf`, `application/json` |
| Logs | 🔜 WS-1.x 로드맵 | 🔜 | — |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `connection refused :4317` | gRPC 서버 미시작 | `AITOP_OTLP_GRPC_ADDR` 환경변수 확인, 포트 노출 확인 |
| `parse error: proto: unexpected EOF` | 잘못된 Content-Type | `application/x-protobuf` 또는 `application/json` 사용 |
| 스팬이 AITOP UI에 표시 안 됨 | WS-1.2 TraceEngine 미구현 | v1.0 기준 WS-1.2 완료 여부 확인 |
| `dropped > 0` in logs | Ring Buffer 포화 | 수집량 조절 또는 `BatchTimeout` 단축, WS-1.4 고려 |
| gRPC 클라이언트 `PROTOCOL_ERROR` | HTTP/2 미지원 환경 | OTLP/HTTP 모드 (`/v1/traces`) 사용 |
