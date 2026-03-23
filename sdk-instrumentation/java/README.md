# AITOP Java Agent

Automatic method-level profiling and distributed tracing for Java applications.

## Prerequisites

- **Java 11+** (LTS recommended: 11, 17, 21)
- **Spring Boot 2.7+ / 3.x** (optional but recommended)
- Network access to the AITOP collector endpoint

## Installation

### 1. Download the Agent JAR

Download `aitop-java-agent.jar` from the AITOP release page or build from source (see below).

### 2. Add JVM Options

```bash
java -javaagent:aitop-java-agent.jar \
     -Daitop.profiling.threshold=5ms \
     -jar your-application.jar
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `AITOP_SERVER_URL` | `http://localhost:4318` | AITOP collector gRPC/HTTP endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OpenTelemetry OTLP exporter endpoint |
| `AITOP_SERVICE_NAME` | auto-detected | Logical service name |
| `AITOP_PROFILING_THRESHOLD` | `5ms` | Minimum method duration to record |
| `AITOP_TARGET_PACKAGES` | `com.*.controller,com.*.service,com.*.repository` | Comma-separated class patterns to instrument |

### Full Example

```bash
java -javaagent:aitop-java-agent.jar \
     -Daitop.profiling.threshold=5ms \
     -Daitop.target.packages=com.myapp.controller,com.myapp.service,com.myapp.repository \
     -jar my-spring-boot-app.jar
```

## Docker Usage

```dockerfile
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

COPY build/libs/my-app.jar app.jar
COPY aitop-java-agent.jar /opt/aitop/aitop-java-agent.jar

ENV AITOP_SERVER_URL=http://aitop-collector:4318
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://aitop-collector:4317
ENV JAVA_TOOL_OPTIONS="-javaagent:/opt/aitop/aitop-java-agent.jar -Daitop.profiling.threshold=5ms"

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

## Kubernetes Auto-Injection

Add the following annotation to your Pod or Deployment spec for automatic agent injection via the AITOP Operator:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
spec:
  template:
    metadata:
      annotations:
        aitop.io/inject-java: "true"
        aitop.io/profiling-threshold: "5ms"
    spec:
      containers:
        - name: app
          image: my-app:latest
          env:
            - name: AITOP_SERVER_URL
              value: "http://aitop-collector.monitoring:4318"
```

The AITOP Operator will automatically:
1. Mount the agent JAR as an init container volume
2. Set `JAVA_TOOL_OPTIONS` with the `-javaagent` flag
3. Configure OTLP exporter endpoints

## Building from Source

```bash
./gradlew shadowJar
# Output: build/libs/aitop-java-agent-all.jar
```
