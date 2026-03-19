# AITOP Monitor — Frontend

> **프레임워크**: Next.js 16 (App Router) + React 19 + TypeScript 5
> **스타일**: Tailwind CSS v4 + CSS Variables (다크/라이트 테마)
> **상태관리**: Zustand + TanStack React Query
> **차트**: Apache ECharts 6 + Canvas 2D
> **관련 문서**: [DOCS/UI_DESIGN.md](../DOCS/UI_DESIGN.md) — 상용 솔루션 수준 UI 설계서

---

## 빠른 시작

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
# → http://localhost:3000

# 프로덕션 빌드
npm run build
npm run start
```

---

## 데모 계정

백엔드 없이 프론트엔드만으로 동작하는 내장 데모 계정이 제공됩니다.
로그인 페이지(`/login`)에서 **Quick Login** 버튼으로 즉시 로그인할 수 있습니다.

| 역할 | 이메일 | 비밀번호 | 접근 범위 |
|------|--------|---------|---------|
| **Administrator** | `admin@aitop.io` | `admin` | 전체 기능 (설정, 사용자 관리, 삭제 포함) |
| **SRE / DevOps** | `sre@aitop.io` | `sre` | 프로젝트/인프라/서비스/AI/알림/에이전트/진단 읽기+쓰기, 설정 읽기 |
| **AI Engineer** | `ai@aitop.io` | `ai` | AI 서비스 읽기+쓰기, 나머지 읽기 전용 |
| **Viewer** | `viewer@aitop.io` | `viewer` | 전체 읽기 전용 (설정/에이전트 접근 불가) |

> **주의**: 데모 계정은 개발/테스트 전용입니다. 프로덕션 배포 시 실제 백엔드 인증으로 전환하세요.

---

## 프로젝트 구조

```
frontend/src/
├── app/                        # Next.js App Router 페이지
│   ├── layout.tsx              # 루트 레이아웃
│   ├── app-shell.tsx           # 사이드바 + 상단바 + 콘텐츠 셸
│   ├── providers.tsx           # React Query + 테마 Provider
│   ├── page.tsx                # / — 홈 대시보드
│   ├── login/page.tsx          # /login — 로그인
│   ├── projects/page.tsx       # /projects — 프로젝트 목록
│   ├── infra/page.tsx          # /infra — 인프라 (호스트)
│   ├── services/page.tsx       # /services — 서비스 (APM)
│   ├── ai/page.tsx             # /ai — AI 서비스
│   ├── metrics/page.tsx        # /metrics — 메트릭 탐색기
│   ├── traces/page.tsx         # /traces — 분산 추적
│   ├── logs/page.tsx           # /logs — 로그 탐색기
│   ├── diagnostics/page.tsx    # /diagnostics — AITOP 진단
│   ├── alerts/page.tsx         # /alerts — 알림/인시던트
│   ├── agents/page.tsx         # /agents — Agent Fleet
│   └── settings/page.tsx       # /settings — 설정 (SRE+ only)
│
├── components/
│   ├── ui/                     # 기본 UI 컴포넌트
│   │   ├── button.tsx          # Button (primary/secondary/ghost/danger/outline)
│   │   ├── badge.tsx           # Badge + StatusDot
│   │   ├── card.tsx            # Card + CardHeader + CardTitle
│   │   ├── input.tsx           # Input + SearchInput + Select
│   │   ├── modal.tsx           # Modal (sm/md/lg/xl/full)
│   │   ├── tooltip.tsx         # Tooltip (top/bottom/left/right)
│   │   ├── dropdown.tsx        # Dropdown + DropdownItem
│   │   ├── breadcrumb.tsx      # Breadcrumb (계층 경로)
│   │   └── tabs.tsx            # Tabs (underline/pill)
│   │
│   ├── charts/                 # 차트 컴포넌트
│   │   ├── echarts-wrapper.tsx # ECharts 범용 래퍼
│   │   ├── time-series-chart.tsx # 시계열 차트
│   │   └── spark-line.tsx      # 인라인 미니 차트 (Canvas)
│   │
│   ├── monitoring/             # 모니터링 도메인 컴포넌트
│   │   ├── kpi-card.tsx        # KPI 카드 (값 + 트렌드 + 스파크라인)
│   │   ├── status-badge.tsx    # StatusIndicator + SeverityIcon
│   │   ├── service-health-grid.tsx # 서비스 헬스맵 (색상 격자)
│   │   ├── gpu-card.tsx        # GPU 카드 (VRAM/온도/전력)
│   │   └── alert-banner.tsx    # 알림 배너
│   │
│   ├── layout/                 # 레이아웃 컴포넌트
│   │   ├── sidebar.tsx         # 좌측 사이드바 (접기/펼치기)
│   │   ├── topbar.tsx          # 상단 바 (프로젝트/검색/알림/유저)
│   │   ├── status-bar.tsx      # 하단 상태바
│   │   └── command-palette.tsx # Ctrl+K 통합 검색
│   │
│   └── auth/                   # 인증/인가 컴포넌트
│       └── auth-guard.tsx      # AuthGuard + RequireRole + RequirePermission
│
├── stores/                     # Zustand 상태 관리
│   ├── ui-store.ts             # 사이드바, 테마, 시간범위, 자동갱신
│   ├── project-store.ts        # 현재 프로젝트
│   └── auth-store.ts           # 인증 (user, tokens, RBAC)
│
├── lib/                        # 유틸리티
│   ├── utils.ts                # cn(), formatNumber/Duration/Bytes/Percent/Cost
│   └── api-client.ts           # API fetch + JWT 자동 주입 + demoLogin()
│
└── types/                      # TypeScript 타입 정의
    ├── monitoring.ts           # Project, Host, Service, AIService, Alert 등
    └── auth.ts                 # User, Role, AuthTokens, RBAC 권한 매트릭스
```

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 다크/라이트 테마 | CSS Variables 기반, 상단바 토글 |
| 사이드바 네비게이션 | 12개 메뉴, 접기/펼치기, 툴팁 |
| Command Palette | `Ctrl+K` 통합 검색, 키보드 네비게이션 |
| 프로젝트 전환 | 상단바 드롭다운으로 프로젝트 컨텍스트 전환 |
| 인증/인가 (RBAC) | 4역할 (admin/sre/ai_engineer/viewer), 라우트 가드 |
| 시계열 차트 | ECharts 기반, 임계선, 다중 시리즈 |
| KPI 카드 | 값 + 트렌드 화살표 + 스파크라인 |
| 서비스 헬스맵 | 색상 격자로 전체 상태 한눈에 |

---

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api/v1` | 백엔드 API 주소 |
