# AITOP 테스트 관리 디렉토리

> **목적**: 모든 테스트 라운드의 절차서, 결과서, 교차검증, 변경이력을 체계적으로 관리
> **관련 문서**: [TEST_GUIDE.md](../DOCS/TEST_GUIDE.md) | [MANUAL_TESTING_GUIDE.md](../DOCS/MANUAL_TESTING_GUIDE.md)

---

## 디렉토리 구조

```
test/
├── README.md                      ← 현재 문서
├── UI_화면_테스트_체크리스트.md   ← 43페이지 + 공통 UX 화면 점검표
├── templates/                     ← 재사용 가능한 문서 템플릿
│   ├── 절차서_TEMPLATE.md
│   ├── 결과서_TEMPLATE.md
│   ├── 변경이력_TEMPLATE.md
│   └── OS별_명령어_참조.md       ← Windows PowerShell ↔ Bash 대응표
│
├── 단위테스트_1차_2026-03-24/     ← 테스트 라운드 폴더
│   ├── 절차서_단위테스트_1차.md   ← 실행 절차 (AI + 수동)
│   ├── 결과서_단위테스트_1차_AI.md    ← AI 실행 결과
│   ├── 결과서_단위테스트_1차_수동.md  ← 수동 검증 결과
│   ├── 교차검증_단위테스트_1차.md     ← AI vs 수동 대조표
│   ├── 변경이력_단위테스트_1차.md     ← 테스트 중 코드 변경 기록
│   └── logs/                          ← 원본 실행 로그
│
├── 통합테스트_1차_YYYY-MM-DD/    ← (추후 생성)
└── E2E테스트_1차_YYYY-MM-DD/     ← (추후 생성)
```

## 네이밍 규칙

### 라운드 폴더

```
{테스트유형}_{차수}_{YYYY-MM-DD}
```

| 항목 | 값 | 예시 |
|------|---|------|
| 테스트유형 | `단위테스트` / `통합테스트` / `E2E테스트` | `단위테스트` |
| 차수 | `1차`, `2차`, `3차`, ... | `1차` |
| 날짜 | 실행 시작일 (ISO 형식) | `2026-03-24` |

### 내부 파일

| 파일명 | 설명 |
|--------|------|
| `절차서_{유형}_{N}차.md` | 테스트 실행 절차 (AI + 수동) |
| `결과서_{유형}_{N}차_AI.md` | AI(Claude Code) 실행 결과 |
| `결과서_{유형}_{N}차_수동.md` | 사용자 수동 검증 결과 |
| `교차검증_{유형}_{N}차.md` | AI vs 수동 결과 대조표 |
| `변경이력_{유형}_{N}차.md` | 테스트 중 발생한 코드/UI 변경 |
| `logs/` | 명령어 원본 출력 (txt, json) |

## 교차검증 프로세스

```
1. AI 테스트 실행 → 결과서_AI.md 작성
2. 사용자 수동 검증 → 결과서_수동.md 작성
3. 양쪽 결과 대조 → 교차검증.md 작성
4. 불일치 항목 → 원인 조사 후 최종 판정
5. 코드 수정 발생 → 변경이력.md 기록
```

## 명령어 실행 위치

> 프로젝트 루트: `C:\workspace\aiservice-monitoring\`

```
C:\workspace\aiservice-monitoring\          ← 프로젝트 루트
├── agent\                                  ← Go 명령 실행 위치
├── frontend\                               ← npm 명령 실행 위치
├── docker-compose.e2e.yaml                 ← Docker 명령 (루트에서 실행)
├── scripts\                                ← bash 스크립트 (루트에서 실행)
└── test\                                   ← 테스트 문서
```

| 작업 | 실행 위치 | 명령어 예시 |
|------|----------|-----------|
| Go 빌드/테스트 | `cd agent` | `go build ./...` / `go test ./...` |
| Frontend 개발 서버 | `cd frontend` | `npm run dev` |
| Frontend Vitest | `cd frontend` | `npx vitest run` |
| Frontend Playwright | `cd frontend` | `npx playwright test` |
| Docker 스택 기동 | **프로젝트 루트** | `docker compose -f docker-compose.e2e.yaml up -d` |
| Bash 스크립트 | **프로젝트 루트** | `bash scripts/e2e/healthcheck.sh` |
| Locust 부하 테스트 | **프로젝트 루트** | `locust -f locust/locustfile.py` |

> Windows PowerShell 사용 시 [OS별 명령어 참조](templates/OS별_명령어_참조.md) 참고

## 참고

- `agent/test/` — Go 통합/계약 테스트 코드 (이 디렉토리와 별개)
- `reports/` — 도구 자동 생성 리포트 (Playwright HTML, Coverage HTML 등)
- `test/` — 사람이 읽는 구조화된 테스트 문서
