# 프로젝트: <이름>

> 이 파일은 하네스의 **유일한 인스턴스 슬롯**이다(스펙 §4.4). 에이전트 셸은
> spawn 시 이 파일과 도메인 스킬을 Read 해 경로·스택·도메인 값을 주입받는다.
> 설치한 새 프로젝트의 `.claude/project.md` 로 복사한 뒤 모든 `<...>` 를 채운다.
> (HCG 표준 기본값을 미리 채워 두었으니, 프로젝트에 맞게 수정한다.)

## 정체성
<이 제품이 무엇인지 한두 줄>

## 스택
- 프레임워크: Next.js (App Router) + TypeScript(strict)
- 스타일: Tailwind CSS
- 서버 상태: TanStack Query · 전역 UI 상태: Zustand · 폼: React Hook Form · 검증: Zod
- 테스트: 단위/통합 Vitest · E2E Playwright
- DB: MariaDB · ORM: Prisma(`provider="mysql"`)
- 복잡 로직 모듈(필요 시): Fastify(우선) / Express — `services/`
- 패키지 매니저: <npm / pnpm / yarn>

## 경로
- db: `prisma/`(schema.prisma · migrations) + 기능별 `features/*/actions.ts`
- backend: `apps/web/app/api/*/route.ts`(얇게) → `features/*/actions.ts`
- frontend: `apps/web/features/*/(components|hooks)` + 공통 `apps/web/components/`
- app dir(hook 검증 대상): `apps/web`  ← 비-monorepo면 `POST_EDIT_VERIFY_APP_DIR` 로 조정

## 계약
- `contracts/{db-schema,api-spec,shared-types,design-guide}`

## 도메인 스킬
- `<예: my-domain>`  ← 프로젝트 불변 비즈니스 규칙을 담은 스킬(`.claude/skills/<domain>/SKILL.md`). 5개 에이전트 셸의 `skills:` 에 추가한다.

## 테스트 스킬
- 단위/통합: **Vitest** — 별도 스킬 불요(`*-conventions` 스킬이 규정). `package.json` 에 `"test": "vitest run"` 배선.
- E2E: **Playwright** (HCG 표준) — `playwright-e2e` 스킬을 작성해 front 셸의 `skills:` 에 추가한다.

## 모델 배정
- 기본: 전 에이전트 `inherit`(세션 모델 상속) — 템플릿은 특정 모델명을 고정하지 않는다.
- 비용 최적화가 필요하면 **이 인스턴스에서** 에이전트별 하위 티어를 고정한다(예: db 를 경량 모델로 — 해당 `.claude/agents/*.md` 의 `model:` 수정). 단 qa 는 구현자와 같은 티어 이상 유지(CLAUDE-core fast-path 규칙).

## 활성 에이전트
- `<예: db, backend, frontend>` (해당 없는 레이어는 비활성)

## 기본 모드
- 결합=정적(파이프라인) / 대량·읽기=workflow

## 환경변수
- <키 목록만, placeholder> (예: `DATABASE_URL`, `JWT_SECRET`, … — 실값 금지)
