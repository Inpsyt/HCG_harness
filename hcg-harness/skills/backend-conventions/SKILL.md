---
name: backend-conventions
description: 백엔드/API 작업의 포터블 컨벤션(HCG 표준) — contracts/api-spec·shared-types를 SSOT로, Next.js App Router API Routes(얇게, features actions 호출), 기능별 actions.ts에 로직, Prisma 데이터 접근, Zod 입력 검증, 변경 후 tsc/lint/build/test 검증, contracts 읽기전용, 불일치는 TODO 보고. API/서비스 로직 역할이 로드.
---

# Backend Conventions — 백엔드 스택 컨벤션 (HCG 표준 · 포터블)

API·서비스 레이어의 스택 일반 방법론. 프로젝트 고유의 비즈니스 우선순위·도메인 규칙은 포함하지 않으며, 그것들은 에이전트 body / `project.md`(인스턴스 슬롯) / 도메인 스킬이 주입한다.

## 단일 진실원 (SSOT)

- `contracts/api-spec.md`의 Request/Response 포맷을 **정확히** 따른다.
- `contracts/shared-types.ts`의 타입 인터페이스를 **그대로 import하여** 사용한다 (재정의·복제 금지).
- `contracts/db-schema.md`는 데이터 접근 시 참조한다(읽기 전용).
- `contracts/`는 **읽기 전용** — 이 역할은 계약을 수정하지 않는다.

## 스택 원칙 (HCG 표준)

- **프레임워크**: Next.js App Router. `app/api/{...}/route.ts` 는 **얇게 유지** — 요청 파싱/응답만 하고 실제 로직은 해당 기능의 `features/{기능명}/actions.ts`(Server Action / API 핸들러)를 호출한다.
- **기능 중심 구조**: 한 기능의 로직·타입·검증을 한 폴더에 격리한다 — `features/{기능명}/{actions.ts, schema.ts, types.ts}`. 다른 feature 폴더의 파일을 수정하지 않는다.
- **데이터 접근**: Prisma 로 DB 에 접근한다(MariaDB, `provider="mysql"`). 입력은 항상 파라미터 바인딩으로 전달하고 문자열 보간(raw SQL 주입)을 피한다. 대체 ORM(TypeORM 등) 도입 금지.
- **입력 검증**: 경계(요청 바디·쿼리)에서 **Zod 스키마**(`features/{기능명}/schema.ts`)로 검증한 뒤 로직에 넘긴다.
- 요청/응답은 계약에 정의된 스키마와 1:1로 매핑한다.
- **모듈 분리**: 대용량·배치·실시간 등 복잡 로직만 별도 서비스(`services/`, Fastify 우선)로 분리한다. 처음부터 마이크로서비스로 쪼개지 않는다.

## 검증

- 변경 후 `verification-ladder` 스킬의 사다리를 따른다 — 가능한 한 높은 rung으로 확인한다. 백엔드 기본 게이트: **tsc(타입) / lint / build / test** clean.
- 정의 가능한 I/O가 있으면 자동화 테스트(rung-1)를 우선한다 — `features/{기능명}/__tests__/actions.test.ts`(DB CRUD·에러 처리·입력 검증).

## 불일치 처리

- 계약과 구현이 어긋나면 `tasks/TODO.md`에 이슈로 기록하여 계약 소유자(기획/오케스트레이션 역할)가 판단하도록 전달한다. contracts/를 직접 수정하지 않는다.
