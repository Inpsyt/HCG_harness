# HCG Harness — bootstrap design

**작성일**: 2026-06-24
**상태**: Approved (사용자 승인 후 구현 완료)
**출처**: KMA 프로젝트의 in-repo 하네스(`D:\99_KMA\packaging\harness-plugin` + `docs/harness/`)를
KMA 인스턴스와 분리하여 HCG 전용 포터블 하네스로 재패키징.

## 1. 배경 / 문제

범용 하네스를 KMA 폴더 안에서 작성하다 보니 KMA 프로젝트 내용과 충돌. 특히
패키지된 `db/backend-conventions` 스킬이 **KMA 스택(PostgreSQL + Drizzle + pg_trgm)**
으로 작성되어 있는데, HCG 표준 스택은 **MariaDB + Prisma**(Drizzle 명시 금지) +
TanStack Query / Zustand / React Hook Form / Zod + feature-centric 구조다
(`HCG-Framework.md` 참조). → KMA와 분리된 클린 HCG 하네스 repo가 필요.

## 2. 결정 (사용자 확정)

- **형태**: 포터블 **Claude Code 플러그인 repo**(앱 코드/스캐폴드 없음). 새 HCG
  프로젝트에 `claude plugin install` 로 도입.
- **스택 컨벤션**: db/backend/frontend-conventions 를 **HCG 표준으로 재작성**
  (KMA Postgres/Drizzle 제거).
- 대상 경로: `D:\100_HCG_Harness\hcg_harness`. KMA(`D:\99_KMA`)는 무변경.

## 3. 구조 (Claude 플러그인 + 마켓플레이스 규약)

```
hcg_harness/                          # repo = 마켓플레이스
├─ .claude-plugin/marketplace.json    # hcg-harness-marketplace
├─ hcg-harness/                       # 플러그인
│  ├─ .claude-plugin/plugin.json      # hcg-harness
│  ├─ CLAUDE-core.md                  # HARNESS 코어 (C1 해소 — 번들에 포함)
│  ├─ agents/ (5) · skills/ (6) · hooks/ (2+런처) · workflows/ (3)
├─ templates/project.md               # 인스턴스 슬롯 템플릿(HCG 기본값)
└─ docs/ (install · portable-instance-boundary · 본 설계 문서)
```

## 4. 무엇이 그대로 / 재작성 / 신규

- **그대로**: 프로세스 스킬 3종(pipeline-phase·codex-review·verification-ladder),
  workflows 3종, hook 골격, run-*.mjs 런처. (스택·도메인 중립)
- **재작성**: db/backend/frontend-conventions → HCG 스택. 에이전트 3종
  (db·backend·front) frontmatter `description` de-KMA. (plan·qa 는 누출 없어 유지)
- **신규**: `CLAUDE-core.md`(KMA→HCG repo 이식 — 순수 HARNESS, 무변경 복사),
  `templates/project.md`, `docs/{install,portable-instance-boundary}.md`, `README.md`.

## 5. 제네릭화 (잔존 결합 제거)

- hook `apps/web` 하드코딩 → env `POST_EDIT_VERIFY_APP_DIR`(기본 `apps/web`).
- hook `[KMA session context]` 라벨 → env `SESSION_CONTEXT_LABEL`(기본
  `[harness session context]`).
- 에이전트 frontmatter description 의 KMA 문자열 제거(body 는 이미 de-instanced).

## 6. 검증 (acceptance)

- `claude plugin validate hcg-harness --strict` + `… hcg_harness --strict` exit 0.
- 패키지 전역에 KMA 도메인 문자열 0 (grep: `KMA`, `Drizzle`, `pg_trgm`,
  `PostgreSQL`, `복부`, `판 정렬` 등).
- 에이전트 `skills:` 항목 100% 번들 내 SKILL.md resolve(dangling 0).
- hook 2종 smoke(직접 호출 + env override) 동작.
- JSON 매니페스트 parse OK.

## 7. 후속(미수행, 의도적)

- **drift**: 소비 프로젝트가 셸을 복사·수정하면 이 패키지와 drift. canonical
  adoption(프로젝트가 플러그인을 단일 출처로 소비)은 별도 결정.
- 스택이 HCG 표준에서 벗어나는 프로젝트는 `*-conventions` 3스킬을 프로젝트에서 조정.
