---
name: db-conventions
description: 데이터베이스 작업의 포터블 컨벤션(HCG 표준) — contracts/db-schema를 SSOT로, Prisma 스키마 정의(MariaDB, provider="mysql"), Prisma Migrate 마이그레이션, 데이터 이관 시 레코드 수 parity 검증, contracts 읽기전용, 불일치는 TODO 보고. DB 스키마/마이그레이션 역할이 로드.
---

# DB Conventions — 데이터베이스 스택 컨벤션 (HCG 표준 · 포터블)

데이터베이스 레이어의 스택 일반 방법론. 프로젝트 고유의 테이블·도메인·정렬 규칙은 포함하지 않으며, 그것들은 에이전트 body / `project.md`(인스턴스 슬롯) / 도메인 스킬이 주입한다.

## 단일 진실원 (SSOT)

- `contracts/db-schema.md`를 **단일 진실원**으로 따른다. 테이블명·컬럼명·타입·인덱스·제약·관계를 명세 그대로 구현한다.
- `contracts/`는 **읽기 전용** — 이 역할은 계약을 수정하지 않는다. 명세와 구현이 어긋나면 직접 고치지 말고 보고한다(↓ 불일치 처리).

## 스택 원칙 (HCG 표준)

- **DBMS**: MariaDB (MySQL 호환).
- **ORM**: Prisma — `prisma/schema.prisma` 의 `datasource` `provider = "mysql"` 로 MariaDB 에 연결한다. 스키마 정의 / 마이그레이션 / 데이터 접근을 모두 Prisma 로 일관한다.
  - **금지**: TypeORM 등 대체 ORM 도입 금지(HCG 표준 위반). raw SQL 이 꼭 필요하면 `prisma.$queryRaw`(파라미터 바인딩) 로만 작성하고 문자열 보간을 피한다.
- **스키마 위치**: `prisma/schema.prisma` (모델) + `prisma/migrations/`(마이그레이션). 인덱스·유니크·관계는 명세(`contracts/db-schema.md`)에 정의된 것을 정확히 반영한다.
- **데이터 접근 위치**: DB 접근 로직은 각 기능의 `features/{기능명}/actions.ts`(Server Action / API 핸들러)에 둔다. 다른 feature 의 데이터 계층을 침범하지 않는다.

## 마이그레이션 정합성

- 스키마 변경은 `prisma migrate dev`(개발) / `prisma migrate deploy`(배포) 로 적용하고, 생성된 마이그레이션을 명세와 대조한다.
- 데이터 이관 시 **레코드 수 parity** 를 검증한다 — 소스 레코드 수 = 타겟 레코드 수가 일치해야 한다.
- 파괴적/비가역 작업(스키마 변경·데이터 이관)은 실행 전 검증 방법을 명시하고, 정합성 확인 후 완료 처리한다.

## 검증

- 변경 후 `verification-ladder` 스킬의 사다리를 따른다 — 가능한 한 높은 rung(자동화 테스트 → 빌드/타입 → 스모크 → 수용기준)으로 확인한다.
- `prisma validate` / `prisma generate` 가 clean 한지 확인하고, 가능한 I/O 는 `features/{기능명}/__tests__/` 의 테스트로 끌어올린다.

## 불일치 처리

- 계약과 구현/데이터가 어긋나면 `tasks/TODO.md`에 이슈로 기록하여 계약 소유자(기획/오케스트레이션 역할)가 판단하도록 전달한다. contracts/를 직접 수정하지 않는다.
