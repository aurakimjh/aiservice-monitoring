# Changelog

All notable changes to the AITOP AI Service Monitoring Platform are documented here.

---

## [0.9.0-rc.1] — 2026-03-28 (Release Candidate)

> 수동 테스트 통과 후 정식 릴리스 판정 예정

### Highlights

- **67개 페이지 UI** — 메인 대시보드, 서비스 상세, AI Observability, 인프라 모니터링
- **커스텀 대시보드** — 드래그앤드롭, 11종 APM/AI 위젯, 템플릿 저장/불러오기
- **AI Observability** — OTel GenAI Semantic Conventions 기반 LLM 추적, RAG 파이프라인 워터폴
- **E2E 테스트 49/49 ALL PASS** — 인프라, 앱, API, 관측, Agent, AI, 배치, 프론트 전수 검증
- **AGPL-free 상용 스택** — Grafana/Tempo/Loki/MinIO 없이 배포 가능

### Added

- **Frontend**
  - 67개 페이지 (Overview, Services, Infra, AI, Batch, Alerts, Topology, Dashboards 등)
  - 커스텀 대시보드 시스템 (11종 APM/AI 위젯, drag-and-drop)
  - WidgetHelp 다국어 도움말 팝오버 (ko/en/ja, 35+ 가젯)
  - 듀얼 모드 아키텍처 (Demo/Live/Auto) — `useDataSource` 훅
  - i18n 다국어 지원 (한국어, English, 日本語)
  - 서비스 토폴로지 맵 (D3.js force-directed)
  - XLog 산점도 + 히트맵 (brush 선택 → 트레이스 상세)
  - SLO 대시보드, 비용 분석, Executive 리포트

- **Collection Server (Go)**
  - 50+ REST API 엔드포인트
  - Prometheus 프록시 API (실시간 메트릭 쿼리)
  - Jaeger 프록시 API (트레이스 조회)
  - SQLite 기반 메타데이터 저장 (projects, agents, services, instances 등)
  - AI 진단 항목 5종 (cost spike, agent loop, RAG quality, GPU saturation, model drift)
  - 모델 가격 테이블 자동 시드 (gpt-4o, claude-sonnet-4, ollama 등)
  - JWT 인증 미들웨어 + 경로 기반 bypass

- **AITOP Agent (Go)**
  - 12개 Collector (OS, WEB, WAS, DB, GPU, LLM, VectorDB, Serving 등)
  - 크로스 플랫폼 OS 메트릭 (Linux /proc + Windows API)
  - Heartbeat + Fleet 관리
  - DEB/RPM 패키지, Docker, Kubernetes DaemonSet 배포

- **AI Observability**
  - OTel GenAI Semantic Conventions 구현
  - TTFT/TPS P95 추적, 토큰 비용 계산
  - RAG 파이프라인 워터폴 (Guardrail → Embedding → Vector Search → LLM Inference)
  - Guardrail 차단률, 모델 드리프트 감지
  - AI 서비스 상세 (GPU, Evaluation, LLM Traces, Prompts)

- **인프라**
  - Docker Compose: production, e2e, lite, commercial, test
  - Helm chart (v0.9.0): OTel Agent/Gateway, Prometheus, Jaeger, Collection Server, Frontend
  - DEB/RPM 패키지 빌드 (nfpm)
  - Makefile: 40+ 타겟 (build, test, package, k8s, e2e)

- **데모 환경**
  - 5개 언어 앱 (Java, Go, Python, .NET, Node.js) + OTel 계측
  - Python/Java 배치 모니터링 (Celery + Spring Batch)
  - Linux 컨테이너 Agent
  - k6 부하 생성기

### Fixed

- useDataSource 무한 루프 (transformRef/demoRef 패턴)
- Auth 401 경로 bypass (strings.HasPrefix)
- SQLite multi-statement CREATE TABLE
- Topology null crash (노드 없는 경우)
- Alerts .map undefined (채널/타임라인 null safety)
- XLog brush 미동작 (dataZoom 충돌)
- Batch .slice error (API 응답 형태 불일치)
- Agent CPU/Memory 잘못된 수집 (Go process → OS system)

### Infrastructure

- **라이선스**: 전체 상용 호환 (Apache 2.0, MIT, BSD, ISC)
- **AGPL-free**: Grafana → 자체 UI, Tempo → Jaeger, Loki → 자체 로그 뷰어, MinIO → LocalBackend
- **테스트**: E2E 49/49 PASS, Frontend 빌드 통과

---

## Version Policy

- `0.x.y` — 수동 테스트 및 QA 통과 전 프리릴리스
- `1.0.0` — 정식 릴리스 (수동 테스트 전수 통과 후)
- `-rc.N` — Release Candidate (릴리스 후보)
