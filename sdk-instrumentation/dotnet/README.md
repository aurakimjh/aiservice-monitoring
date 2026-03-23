# AITOP .NET Profiler

Automatic method-level profiling and distributed tracing for .NET applications.

## Prerequisites

- **.NET 6+** (recommended: .NET 8)
- **ASP.NET Core** (for web application auto-instrumentation)
- Network access to the AITOP collector endpoint

## Installation

### NuGet Package

```bash
dotnet add package Aitop.Profiler
```

### Environment Variables

Set the following environment variables before starting your application:

| Variable | Default | Description |
|---|---|---|
| `CORECLR_ENABLE_PROFILING` | `0` | Set to `1` to enable CLR profiling |
| `CORECLR_PROFILER` | - | AITOP profiler CLSID |
| `CORECLR_PROFILER_PATH` | - | Path to the native profiler library |
| `AITOP_PROFILER_PATH` | - | Path to the AITOP managed profiler assembly |
| `AITOP_SERVER_URL` | `http://localhost:4318` | AITOP collector endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OpenTelemetry OTLP endpoint |
| `AITOP_SERVICE_NAME` | auto-detected | Logical service name |

## Configuration

### Program.cs Integration

```csharp
using Aitop.Profiler;

var builder = WebApplication.CreateBuilder(args);

// Add AITOP profiling
builder.Services.AddAitopProfiling(options =>
{
    options.ServiceName = "my-dotnet-service";
    options.ProfilingThreshold = TimeSpan.FromMilliseconds(5);
    options.TargetNamespaces = new[]
    {
        "MyApp.Controllers",
        "MyApp.Services",
        "MyApp.Repositories"
    };
});

var app = builder.Build();
app.UseAitopProfiling();
app.Run();
```

## Docker Usage

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

WORKDIR /app
COPY --from=build /app/publish .

# AITOP Profiler configuration
ENV CORECLR_ENABLE_PROFILING=1
ENV AITOP_PROFILER_PATH=/opt/aitop/Aitop.Profiler.dll
ENV AITOP_SERVER_URL=http://aitop-collector:4318
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://aitop-collector:4317

EXPOSE 8080
ENTRYPOINT ["dotnet", "MyApp.dll"]
```

## Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-dotnet-service
spec:
  template:
    metadata:
      annotations:
        aitop.io/inject-dotnet: "true"
    spec:
      containers:
        - name: app
          image: my-dotnet-app:latest
          env:
            - name: CORECLR_ENABLE_PROFILING
              value: "1"
            - name: AITOP_SERVER_URL
              value: "http://aitop-collector.monitoring:4318"
```
