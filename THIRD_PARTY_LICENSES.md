# Third-Party Licenses

> AITOP AI Service Monitoring Platform — 서드파티 라이선스 고지

---

## 1. AITOP Core (자체 코드)

AITOP의 핵심 코드(Collection Server, Agent, Frontend)는 자체 개발 코드입니다.
모든 의존성은 상용 호환 라이선스(MIT, Apache 2.0, BSD, ISC)입니다.

---

## 2. Go 의존성 (Agent / Collection Server)

모든 Go 의존성은 상용 사용 가능한 허용적 라이선스입니다.

| 패키지 | 라이선스 |
|--------|---------|
| github.com/minio/minio-go/v7 | Apache 2.0 |
| github.com/google/uuid | BSD-3-Clause |
| modernc.org/sqlite | Apache 2.0 |
| github.com/klauspost/compress | BSD-3-Clause |
| github.com/rs/xid | MIT |
| github.com/tinylib/msgp | MIT |
| github.com/go-ini/ini | Apache 2.0 |
| golang.org/x/* | BSD-3-Clause |
| gopkg.in/yaml.v3 | MIT |

전체 목록: `agent/go.mod` 참조

---

## 3. NPM 의존성 (Frontend)

99% 이상이 MIT / ISC / Apache 2.0 라이선스입니다.

### 주요 런타임 의존성

| 패키지 | 라이선스 |
|--------|---------|
| next | MIT |
| react / react-dom | MIT |
| d3 | ISC |
| echarts / echarts-for-react | Apache 2.0 / MIT |
| @tanstack/react-query | MIT |
| zustand | MIT |
| tailwindcss | MIT |
| lucide-react | ISC |
| clsx | MIT |

### 주의 사항

| 패키지 | 라이선스 | 비고 |
|--------|---------|------|
| @img/sharp-* (Next.js 이미지 최적화) | LGPL-3.0 | 동적 링크 — 대체로 안전, 법률 검토 권장 |
| caniuse-lite | CC-BY-4.0 | 저작자 표기 필요 |

전체 목록: `frontend/package.json` 참조

---

## 4. 인프라 컴포넌트

### 상용 안전 (Apache 2.0 / BSD / PostgreSQL License)

| 컴포넌트 | 이미지 | 라이선스 |
|---------|--------|---------|
| OTel Collector | otel/opentelemetry-collector-contrib | Apache 2.0 |
| Prometheus | prom/prometheus | Apache 2.0 |
| Jaeger | jaegertracing/all-in-one | Apache 2.0 |
| PostgreSQL | postgres:16-alpine | PostgreSQL License |
| Nginx | nginx:alpine | BSD 2-Clause |

> 상용 배포 시 `docker-compose.commercial.yaml` 사용 — 위 컴포넌트만 포함

### AGPL-3.0 (상용 배포 시 주의)

| 컴포넌트 | 이미지 | 라이선스 | 대안 |
|---------|--------|---------|------|
| Grafana | grafana/grafana | AGPL-3.0 | 자체 Next.js UI (구현 완료) |
| Grafana Tempo | grafana/tempo | AGPL-3.0 | Jaeger (Apache 2.0) |
| Grafana Loki | grafana/loki | AGPL-3.0 | 자체 로그 뷰어 |
| MinIO | minio/minio | AGPL-3.0 | LocalBackend / AWS S3 |

> AGPL-3.0 컴포넌트는 개발/테스트 환경에서만 사용합니다.
> 번들 배포 또는 SaaS 운영 시 소스코드 공개 의무가 발생할 수 있습니다.
> `docker-compose.yaml` (개발용)에는 포함, `docker-compose.commercial.yaml` (상용)에서는 제외됩니다.

---

## 5. 상용 배포 가이드

```bash
# 상용 배포 — AGPL-free 스택
docker compose -f infra/docker/docker-compose.commercial.yaml up -d

# 개발/테스트 — 전체 스택 (AGPL 포함)
docker compose -f infra/docker/docker-compose.yaml up -d
```

---

*이 문서는 의존성 변경 시 업데이트합니다.*
*라이선스 분석 기준일: 2026-03-23*
