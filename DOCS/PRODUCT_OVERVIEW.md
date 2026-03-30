# AITOP — 제품 개요 (Product Overview)

> **문서 버전**: v0.9.0-rc.1
> **문서 유형**: 제품 개요서 (영업/기술 소개용)
> **최종 업데이트**: 2026-03-30
> **관련 문서**:
> - [README.md](../README.md) — 빠른 시작 · 현재 동작 항목 · 배포 방법
> - [SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md) — 비전 · 시장 분석 · GTM 전략 · 차세대 로드맵
> - [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) — 경쟁 솔루션 상세 비교

---

## 제품 한 줄 요약

AI 에이전트 및 LLM 서비스의 복잡한 레이어(가드레일 → 에이전트 → 외부 API → 벡터 DB → LLM 추론)에 대한 **엔드-투-엔드 가시성**을 확보하고, TTFT·TPS·GPU VRAM 등 AI 특화 지표를 통해 성능 최적화 및 장애를 선제 방어하는 **통합 모니터링 플랫폼**입니다.

---

## 핵심 기능 전체 목록

| 기능 | 설명 |
|------|------|
| **통합 모니터링 UI** | Next.js 16 기반 67개 화면 — APM + AI + 인프라 + 에이전트 + 프로파일링 + 토폴로지 + 커스텀 대시보드를 단일 플랫폼에서 통합 |
| **AITOP Agent** | Go 기반 경량 에이전트 — 12개 Collector (OS/WEB/WAS/DB/GPU/LLM/VectorDB/Serving/OTel/Cache/MQ/Profiling) |
| **AI Copilot** | 자연어 → PromQL 변환 (NL→PromQL), AI 기반 장애 분석 및 쿼리 자동 생성 |
| **Continuous Profiling** | FlameGraph 기반 CPU/메모리/Lock 프로파일링 — Go/Java/.NET 지원 |
| **Topology Auto-Discovery** | D3.js 기반 네트워크 토폴로지 자동 탐지 — 프로토콜 감지 및 의존성 시각화 |
| **분산 추적** | 사용자 요청이 모든 레이어를 통과하는 동안 Trace ID 연속성 보장 (W3C TraceContext) |
| **AI 특화 메트릭** | TTFT, TPS, ms/token, GPU VRAM 포화 예측, 가드레일 차단율, Fine-tuning 학습 모니터링 |
| **Multi-Cloud 모니터링** | AWS CloudWatch, GCP Monitoring, Azure Monitor 통합 — 비용 최적화 포함 |
| **Data Pipeline 모니터링** | Airflow, Prefect, Dagster 파이프라인 실행 상태 및 성능 추적 |
| **Business KPI** | 비즈니스 메트릭과 기술 메트릭 상관 분석 — 매출, 전환율, SLA 대시보드 |
| **Marketplace** | 대시보드 템플릿, 알림 정책, 커스텀 Collector 공유 마켓플레이스 |
| **Mobile Dashboard** | 반응형 모바일 대시보드 — 주요 지표 실시간 확인 및 알림 수신 |
| **SSO 인증** | OIDC/SAML 지원 — Okta, Azure AD, Google Workspace 통합 |
| **Terraform Provider** | IaC 기반 모니터링 설정 — 5개 리소스, 3개 데이터소스 |
| **지능형 샘플링** | Head-based + Tail-based Sampling으로 저장 비용 80% 절감 |
| **Fleet 관리** | 에이전트 중앙 관리, 서버 그룹, OTA 업데이트, 원격 CLI, 수집 스케줄링 |
| **이상 탐지** | 자동 이상 탐지 + 합성 모니터링(Synthetic Monitoring) + 정기 보고서 |
| **진단 보고서** | IT 55항목 + AI 31항목 = 86개 자동 진단 및 교차 분석 |
| **가드레일 가시성** | 차단율, 위반 유형, 레이턴시 기여도 실시간 측정 |
| **미들웨어 모니터링** | Redis/Memcached 캐시 + RabbitMQ/Kafka 메시지 큐 모니터링 |
| **RUM** | Core Web Vitals (LCP/FID/CLS/INP), Session Replay, 글로벌 PoP 레이턴시 |
| **SRE Golden Signals** | Latency/Traffic/Errors/Saturation 통합 뷰 + SLO Burn Rate 경고 |
| **런타임 모니터링** | Python GIL/Free-Thread, .NET AOT/ThreadPool, Go Scheduler Latency |
| **DB 모니터링** | PostgreSQL/MySQL 슬로우 쿼리, 락 분석, 대기 이벤트, 실행 계획 |
| **SLO 기반 알림** | 6개 SLO + 2계층 Burn Rate Alert (page/ticket) + Error Budget 추적 |
| **멀티테넌트** | 프로젝트 기반 리소스 격리, White-label, RBAC |
| **국제화** | 한국어/영어/일본어 3개 언어 지원 |

---

## 현재 완성도 (v0.9.0-rc.1)

| 구분 | 상태 | 비고 |
|------|------|------|
| UI/UX 설계 및 구현 | 설계/시연 완료 | 67개 화면, Next.js 16 |
| AITOP Agent 설계 | 설계/시연 완료 | 12개 Collector, Go 구현 |
| SDK 계측 (Python/Node/Go/Java/.NET) | 설계/시연 완료 | OTel 표준 기반 |
| Terraform Provider | 설계/시연 완료 | 5 resources, 3 datasources |
| 자체 스토리지 엔진 (Prom/Jaeger 제거) | **미착수** (WS-1) | v1.0 상용 릴리스 필수 과제 |
| 엔터프라이즈 패키징 · HA · 수평 확장 | **미착수** (WS-2~7) | v1.0 상용 릴리스 필수 과제 |

> **상용 릴리스(v1.0)까지 남은 과제**: [WORK_STATUS.md](../WORK_STATUS.md) 참조

---

## 비전 및 전략

전체 비전(미션, GTM, 차세대 로드맵)은 **[SOLUTION_STRATEGY.md](./SOLUTION_STRATEGY.md)**를 참조하세요.

경쟁 솔루션 비교(Datadog, Dynatrace, New Relic 등 8개 제품)는 **[COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md)**를 참조하세요.

---

## 대상 고객

| 역할 | 주요 관심사 |
|------|-----------|
| **SRE / Platform Engineer** | MTTD < 30초, MTTR < 5분, SLO 자동화 |
| **MLOps / AI Engineer** | TTFT·TPS·GPU VRAM 추적, LLM 성능 최적화 |
| **CTO / 아키텍트** | 상용 배포 가능 여부, 라이선스 안전성, 확장성 |
| **영업 / SE** | 데모 시나리오, 경쟁 우위, TCO 비교 |
