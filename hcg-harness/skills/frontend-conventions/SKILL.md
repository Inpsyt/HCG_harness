---
name: frontend-conventions
description: 프론트엔드/UI 작업의 포터블 컨벤션(HCG 표준) — contracts/design-guide·api-spec·shared-types를 SSOT로, Next.js App Router + React + Tailwind + TypeScript, 서버상태 TanStack Query·전역UI Zustand·폼 React Hook Form·검증 Zod, feature-centric 최소단위 컴포넌트, 반응형·다크모드·a11y·한글 타이포, 공유 타입 import 바인딩, contracts 읽기전용, 불일치는 TODO 보고. UI/컴포넌트 역할이 로드.
---

# Frontend Conventions — 프론트엔드 스택 컨벤션 (HCG 표준 · 포터블)

UI 레이어의 스택 일반 방법론. 프로젝트 고유의 화면 구성·색상·기능별 UI는 포함하지 않으며, 그것들은 에이전트 body / `project.md`(인스턴스 슬롯) / `contracts/design-guide.md`가 주입한다.

## 단일 진실원 (SSOT)

- `contracts/design-guide.md`의 디자인 가이드 명세에 따라 구현한다.
- `contracts/api-spec.md`의 Response 포맷에 맞춰 데이터를 바인딩한다.
- `contracts/shared-types.ts`의 타입을 **import하여** 사용한다 (재정의 금지).
- `contracts/`는 **읽기 전용** — 이 역할은 계약을 수정하지 않는다.

## 스택 원칙 (HCG 표준)

- **기반 스택**: Next.js App Router + React + Tailwind CSS + TypeScript(strict).
- **서버 상태**: **TanStack Query** 로 데이터 fetch·캐싱·재조회·로딩/에러 처리를 한다. 기능별 훅은 `features/{기능명}/hooks/`(예: `useUser.ts`)에 둔다. (SWR / React Query v3 / Axios·ky 금지 — fetch 래퍼 `lib/fetch.ts` 사용.)
- **전역 UI 상태**: **Zustand**(`lib/store.ts`) — 모달·사이드바 등 가벼운 전역 UI 상태만. (Redux / Jotai 금지.)
- **폼 상태**: **React Hook Form** 으로 입력/제출을 다루고, **Zod**(`features/{기능명}/schema.ts`)로 검증한다. (Formik / Yup / 수동 검증 금지.)
- **스타일**: Tailwind CSS 유틸리티 클래스. (CSS Modules / styled-components 금지.)
- **컴포넌트 구조(feature-centric)**: 화면을 **최소 단위 컴포넌트**로 잘게 쪼갠다. 1개 feature 전용이면 `features/{기능명}/components/`, 2개 이상 feature 에서 쓰면 공통 `components/` 로 승격한다. **영향 격리** — 신규/수정 시 다른 feature 폴더에 영향을 주지 않는다. `app/` 의 page 는 feature 컴포넌트를 import 해 렌더링만 한다(얇게 유지).
- **반응형**: 모바일 반응형 레이아웃을 기본으로 한다.
- **다크 모드**: 라이트/다크 양 테마를 지원하며 SSR 하이드레이션 미스매치를 피한다(테마 토큰/클래스 일관).
- **접근성(a11y)**: 시맨틱 마크업, 키보드 조작, 포커스 관리, role/aria 속성을 준수한다.
- **타이포그래피**: 한글 타이포그래피(system font stack)를 고려한다.

## 검증

- 변경 후 `verification-ladder` 스킬의 사다리를 따른다 — 가능한 한 높은 rung으로 확인한다.
- UI/디자인처럼 자동 검증이 어려운 변경은 rung-4(명시 수용기준 + diff + 사람=검증자)로 마무리하되, 가능한 부분은 타입/빌드/컴포넌트·훅 테스트(`features/{기능명}/__tests__/`)로 끌어올린다.

## 불일치 처리

- 계약과 구현이 어긋나면 `tasks/TODO.md`에 이슈로 기록하여 계약 소유자(기획/오케스트레이션 역할)가 판단하도록 전달한다. contracts/를 직접 수정하지 않는다.
