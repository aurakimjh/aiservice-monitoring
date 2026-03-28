# AITOP v0.9.0-rc.1 Release Notes

> **릴리스 날짜**: 2026-03-28
> **상태**: Release Candidate (수동 테스트 통과 후 정식 릴리스 판정)
> **빌드**: E2E 49/49 ALL PASS

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/aurakimjh/aiservice-monitoring.git
cd aiservice-monitoring

# 2. Production stack (AGPL-free)
docker compose -f docker-compose.production.yaml up -d

# 3. Open UI
open http://localhost:3000
```

---

## What's New

### AI Observability (v1.3)

OTel GenAI Semantic Conventions 기반 AI 서비스 모니터링:

- **LLM 추적**: TTFT P95, Token/s 처리 속도, 모델별 비용 계산
- **RAG 파이프라인**: Guardrail → Embedding → Vector Search → LLM Inference 워터폴
- **AI 진단**: Cost Spike, Agent Loop, RAG Quality, GPU Saturation, Model Drift
- **Evaluation Framework**: 프롬프트 버전별 성능 비교, A/B 테스트
- **보안**: Guardrail 차단률, PII 마스킹

### Custom Dashboard (v1.2)

드래그앤드롭 방식 커스텀 대시보드:

- 11종 APM/AI 위젯 (TPS, 응답시간, 액티브 트랜잭션, TTFT, 토큰 비용 등)
- 템플릿 저장/불러오기, 내보내기/가져오기
- SUM/Individual 뷰 모드 전환
- Widget Help — 다국어 팝오버 (ko/en/ja)

### Entity Model (v1.2)

5레벨 계층 구조: Project → Host → Service → Instance → ServiceGroup

### 67 Pages UI

| 카테고리 | 페이지 수 | 주요 기능 |
|---------|----------|----------|
| Overview | 1 | KPI 요약, 응답시간/에러율 차트 |
| Services (APM) | 5 | 서비스 목록/상세, XLog, 히트맵 |
| Infrastructure | 8 | 호스트 목록/상세, Cache, MW, Queue |
| AI Services | 10 | AI 목록/상세, GPU, Eval, LLM Traces, Prompts, Costs |
| Batch | 3 | 배치 목록, XLog, 실행 상세 |
| Dashboards | 1 | 커스텀 대시보드 |
| Alerts | 1 | 알림 규칙/이력 |
| Topology | 1 | 서비스 토폴로지 맵 |
| Others | 37 | Agents, Logs, SLO, Profiling, Runtime, RUM 등 |

---

## Deployment Options

### Docker Compose (권장)

```bash
# 상용 배포 (AGPL-free)
docker compose -f docker-compose.production.yaml up -d

# 개발/테스트 (전체 스택)
docker compose -f docker-compose.e2e.yaml up -d
```

### Kubernetes (Helm)

```bash
helm install aitop ./helm/aiservice-monitoring \
  --namespace aitop-monitoring \
  --create-namespace \
  -f helm/aiservice-monitoring/values-prod.yaml
```

### Agent (각 서버)

```bash
# DEB
sudo dpkg -i aitop-agent_0.9.0_amd64.deb
sudo systemctl enable --now aitop-agent

# Binary
./aitop-agent --config=/etc/aitop-agent/agent.yaml
```

---

## Components & Versions

| Component | Image | Port |
|-----------|-------|------|
| Frontend | aitop/frontend:0.9.0-rc.1 | 3000 |
| Collection Server | aitop/collection-server:0.9.0-rc.1 | 8080, 50051 |
| OTel Collector | otel/opentelemetry-collector-contrib:0.104.0 | 4317, 4318 |
| Prometheus | prom/prometheus:v2.53.0 | 9090 |
| Jaeger | jaegertracing/all-in-one:1.58 | 16686 |

---

## License

- **AITOP Core**: 자체 코드 (상용 라이선스)
- **Dependencies**: Apache 2.0, MIT, BSD, ISC (전체 상용 호환)
- **AGPL-free**: Grafana/Tempo/Loki/MinIO 미포함

상세: [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md)

---

## Known Limitations

- FlameGraph 실데이터: perf/eBPF 실환경 필요 (데모에서 정적 SVG)
- GPU 실데이터: NVIDIA GPU 필요 (데모에서 Mock 메트릭)
- Windows Celery prefork: WSL2/Docker 환경에서만 지원
- PostgreSQL 옵션: 현재 SQLite 기본, PostgreSQL 전환 시 마이그레이션 필요

---

## Upgrade Path

이 버전은 최초 릴리스 후보입니다. 향후 버전:

```
0.9.0-rc.1 → 0.9.0-rc.2 (수동 테스트 이슈 수정) → 1.0.0 (정식 릴리스)
```
