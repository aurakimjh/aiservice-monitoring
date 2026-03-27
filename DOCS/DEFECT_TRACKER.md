# AITOP 결함 목록 및 진행 상황

> **최종 업데이트**: 2026-03-28 (Session 54 — v1.2 Phase A+B 완료)
> **총 건수**: 19건 (해결 16 / 진행중 1 / 접수 2)

---

## 상태 범례

| 상태 | 설명 |
|------|------|
| ✅ 해결 | 수정 완료 + 커밋 |
| 🔧 진행중 | 원인 파악, 수정 작업 중 |
| 📋 접수 | 확인됨, 미착수 |
| ⏸ 보류 | 우선순위 낮음 또는 외부 의존 |

---

## 1. 인프라 / Agent 연동

| # | 심각도 | 제목 | 상태 | 원인 | 해결 | 커밋 |
|---|--------|------|------|------|------|------|
| D-001 | Critical | Agent Heartbeat CPU/Memory가 Agent 프로세스 값만 보고 | ✅ 해결 | `BuildHeartbeat`가 `runtime.MemStats` (Go 프로세스)만 사용 | `sysmetrics.go` — /proc/stat, /proc/meminfo로 시스템 전체 메트릭 수집 | `5c5f9fe` |
| D-002 | Major | Agent collect 데이터가 "missing required field: status"로 거부 | ✅ 해결 | `validation.Gateway`가 status 필드 필수 검증 | status 누락 시 기본값 `"success"` 자동 설정 | `b27c4a1` |
| D-003 | Major | 호스트 상세 페이지 404 (Live 모드) | ✅ 해결 | `/infra/[hostname]`이 데모 데이터에서만 검색 | `useDataSource('/realdata/hosts/{hostname}')` 연동 + hostname 조회 지원 | `b27c4a1` |
| D-004 | Major | Windows Agent — CPU/Memory/Disk/Network/Process 미수집 | ✅ 해결 | Linux /proc 전용 코드만 존재 | `sysmetrics_windows.go` — GetSystemTimes, GlobalMemoryStatusEx, GetDiskFreeSpaceEx, tasklist, netstat | `a8f2c31` |
| D-005 | Minor | 호스트 상세 API 응답에 agent_version, status 누락 | ✅ 해결 | 상세 핸들러가 `agentToMap` 미사용 | 상세 API에서도 `agentToMap` 사용하도록 수정 | `b27c4a1` |
| D-006 | Minor | Collection Server 재시작 시 Agent approved 상태 초기화 | ✅ 해결 | In-memory 저장소라 재시작하면 리셋 | A-1 SQLite 영속화로 해결 (store.go) | `6d79f24` |
| D-007 | Minor | Windows Agent Network I/O — 첫 수집 시 0 | 🔧 진행중 | 델타 계산에 이전 값 필요 (첫 회차는 baseline) | 2회차 Heartbeat부터 정상 표시 | 설계상 정상 |
| D-008 | Minor | Linux 컨테이너 Agent — Disk 0개, Process 1개 | 📋 접수 | Alpine 컨테이너 내부에서 /dev/ 마운트 제한, 프로세스 1개만 존재 | 호스트 PID namespace 공유 또는 privileged 모드 필요 |  |

---

## 2. 프론트엔드 UI

| # | 심각도 | 제목 | 상태 | 원인 | 해결 | 커밋 |
|---|--------|------|------|------|------|------|
| D-010 | Major | Live 모드에서 데모 프로젝트가 여전히 표시 | ✅ 해결 | topbar가 `DEMO_PROJECTS` 하드코딩 사용 | `isLive` 체크 → 프로젝트 셀렉터/알림 벨 숨김 | `7b4ddfa` |
| D-011 | Major | Settings Data Source 모드 선택이 새로고침 후 초기화 | ✅ 해결 | `useUIStore`에 `persist` 미들웨어 없음 | `zustand/persist` 추가 → LocalStorage 영속화 | `cd4f1aa` |
| D-012 | Major | Add Host 버튼 클릭 시 모달 미표시 | ✅ 해결 | `Modal` 컴포넌트 `open` prop 누락 | `<Modal open={showAddModal}>` 추가 | `e9a1b33` |
| D-013 | Minor | 호스트 개별 선택(체크박스) 시 선택 안 됨 | ✅ 해결 | `<tr onClick>` + `<input onChange>` 이벤트 버블링으로 2회 토글 | `<td onClick={stopPropagation}>` 추가 | `f3b2d41` |
| D-014 | Minor | 호스트 상세 Overview 차트가 실데이터와 불일치 | ✅ 해결 | `generateTimeSeries` 하드코딩 값 사용 | `os_metrics` 기반 CPU(User/Sys/IOWait), Memory(Used/Cached) 차트 | `8e71c52` |
| D-015 | Minor | 호스트 상세 Runtime/Processes/Logs 탭 — 항상 데모 데이터 | ✅ 해결 | Live 모드 분기 없음 | Live: 실데이터 또는 "수집 대기 중" / Demo: 기존 데모 | `5c5f9fe` |
| D-016 | Minor | /projects 페이지 — Live 모드에서도 데모 프로젝트 표시 | ✅ 해결 | `useProjectStore.projects`가 항상 데모 로드 | `dataSourceMode === 'live'` 시 빈 배열 | `7b4ddfa` |
| D-017 | Major | Services(APM) 페이지 — 실데이터 미표시 (메트릭 0) | ✅ 해결 | Jaeger 서비스명만 가져오고 Prometheus 메트릭 미결합 | `/realdata/services` API — Jaeger + Prometheus RPM/P95/ErrorRate 결합 | `6f9ba7d` |

---

## 3. 데모 환경

| # | 심각도 | 제목 | 상태 | 원인 | 해결 | 커밋 |
|---|--------|------|------|------|------|------|
| D-020 | Major | .NET 데모 앱 빌드 실패 (CS8803) | 📋 접수 | Program.cs에 top-level statement가 class 선언 뒤에 위치 | class를 파일 하단으로 이동 또는 별도 파일 분리 필요 |  |
| D-021 | Minor | 프론트엔드 dev 서버 재시작 시 포트 3000 점유 잔존 | 🔧 진행중 | Turbopack 프로세스 완전 종료 안 됨 | `powershell Stop-Process` + `.next` 캐시 삭제로 대응 | 워크어라운드 |

---

## 4. 해결 통계

```
해결됨:  16건  ████████████████░░  84%
진행중:   1건  █░░░░░░░░░░░░░░░░░   5%
접수:     2건  ██░░░░░░░░░░░░░░░░  11%
```

### 해결 타임라인

| 시간 | 해결 건수 | 주요 내용 |
|------|----------|----------|
| Session 53 전반 | 3건 | Phase 42~47 빌드 + 배포 이슈 |
| Session 53 중반 | 6건 | Live 모드 UI 전수 점검 (프로젝트/알림/모달) |
| Session 53 후반 | 5건 | Agent 메트릭 파이프라인 (수집→저장→표시) |

---

## 5. 우선순위 백로그

| 우선순위 | # | 제목 | 비고 |
|----------|---|------|------|
| P1 | D-020 | .NET 데모 앱 CS8803 | 5개 언어 중 1개 미동작 |
| P2 | D-008 | Linux 컨테이너 Disk/Process 제한 | 컨테이너 환경 한계 |
| P3 | D-021 | Frontend dev 서버 포트 잔존 | 워크어라운드 존재 |
