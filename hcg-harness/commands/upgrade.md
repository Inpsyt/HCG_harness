---
description: 레거시 하네스를 hcg-core 로 이행 (철거 → 정합화 → 재건 → 단언)
---

# /hcg-harness:upgrade — 이행 램프

0.3.0 부터 이 커맨드는 템플릿 재동기화가 아니라 **hcg-core 로의 이행**을 수행한다.
**철거는 이 플러그인이, 재건은 hcg-core 가** 담당한다(레거시는 hcg-core 템플릿 사본을 갖지 않는다).

## 0. 선행 조건 — 하나라도 실패하면 중단한다

1. 레거시 마커 `.claude/.hcg-harness.json` 이 있는가?
   - **있음 + `.claude/.hcg-core.json` 없음** → 정상 시작. **지금 마커를 읽어 `choices.projectName`
     과 `choices.appDir` 를 기록해 둔다.** 2단계 철거가 성공하면 마커를 삭제하므로, 3단계
     (project.md 정합화)부터는 더 이상 읽을 수 없다.
   - **있음 + `.claude/.hcg-core.json` 도 있음** → `/hcg-core:init` 을 레거시 프로젝트 위에 먼저
     실행한 경우다. **철거하지 않는다.** 철거 판정(2단계)은 레거시 자신의 이전 상태(마커의
     매니페스트)와 디스크를 비교하므로, hcg-core 가 쓴 파일(`.github/workflows/ci.yml` 처럼
     레거시 매니페스트에 없는 것 포함)을 "레거시 사용자 수정"으로 오인해 `.legacy` 로 백업하거나
     지울 수 있다 — hcg-core 가 쓴 내용을 파괴한다. **엔진도 이를 거부한다**
     (`--mode retire` 가 `.claude/.hcg-core.json` 을 감지하면 `coreMarkerPresent:true` 로 실패하고
     디스크를 건드리지 않는다) — 실수로 2단계를 실행해도 안전하지만, 절차는 그대로 아래를 따른다:
     1. 사용자에게 상태("hcg-core 가 이미 초기화됨 — 레거시 잔재만 정리")를 보고한다.
     2. 레거시 마커 `.claude/.hcg-harness.json` 삭제에 동의를 받은 뒤 삭제한다(레거시 파일 자체는
        건드리지 않는다 — 남은 `CLAUDE.md`·`.claude/agents/*`·`tasks/**`·`scripts/codex-review.mjs`
        등은 사용자가 직접 정리해야 하는 잔재로 7단계 검토 목록에 싣는다).
     3. `.claude/settings.json` 의 `enabledPlugins` 에 `"hcg-harness@hcg-harness-marketplace": false`
        가 없으면 추가한다(파일이 없으면 hcg-core 템플릿과 같은 형태로 생성한다). 앞서 돌린
        `/hcg-core:init --gap-fill` 은 **이미 있는 파일을 건너뛰므로** 이 파일을 만들거나 고쳐주지
        않는다 — 이 단계 없이는 레거시 플러그인이 계속 활성 상태로 남는다.
     4. **레거시 방법론 코어 교체.** 6단계(재건)를 건너뛰므로, 앞서 돌린 `/hcg-core:init
        --gap-fill` 은 **이미 있는 파일을 건너뛰는 그 성질 그대로** `.claude/CLAUDE-core.md` 를
        레거시 본인 채 남겨둔다 — 방치하면 7단계 단언 5번("`.claude/CLAUDE-core.md` 가 hcg-core
        슬림본")이 실패하고, 프로젝트는 레거시 파이프라인 방법론을 계속 따르게 된다(실측 확인:
        레거시 본 11,928바이트 vs hcg-core 슬림본 4,301바이트). `.claude/CLAUDE-core.md` 를 확인해
        레거시 본(~11.9KB, 역할 파이프라인 서술)이면 — hcg-core 슬림본은 ~4.3KB, Operating Rules
        §0~§5 + 작업 라우팅 표 — 다음을 수행한다:
        1. **먼저 백업한다**: `.claude/CLAUDE-core.md` → `.claude/CLAUDE-core.md.legacy`. `CLAUDE.md`
           도 여전히 레거시 import 구조(`## 공통 방법론 (HARNESS)` → `@.claude/CLAUDE-core.md` 및
           레거시 PROJECT 섹션 서술)를 갖고 있으면 같은 방식으로 `CLAUDE.md` → `CLAUDE.md.legacy`.
           **백업이 먼저다** — 두 파일 다 사용자가 직접 수정했을 수 있고, 이 릴리스는 사본 없이
           사용자 작업을 지우지 않는다.
        2. 백업한 원본(`.claude/CLAUDE-core.md`, 그리고 백업했다면 `CLAUDE.md`)을 지운다 — 이제
           그 자리가 비어 `--gap-fill` 이 채울 수 있다.
        3. `/hcg-core:init --gap-fill` 을 다시 실행한다. 비어 있는 두 슬롯에 hcg-core 가 슬림
           `.claude/CLAUDE-core.md` 와 `CLAUDE.md` 를 새로 쓴다 — 이 재실행 뒤에는 7단계 단언
           5번이 정상적으로 통과한다.

        사용자가 이 교체를 원하지 않으면(레거시 코어를 의도적으로 유지) remedy 를 건너뛸 수
        있다 — 다만 그 경우 5번은 실패로 남고 레거시 방법론 코어가 계속 적용됨을 사용자에게
        명시적으로 알린다. 둘 중 어느 쪽을 택했는지 리포트에 남긴다.
     5. **1·2·4~6단계(dry-run·철거·정리·이관·재건)를 모두 건너뛰고 3단계(project.md 정합화)로
        바로 이동, 그다음 7단계(단언)로 간다.** 7단계에서 레거시 잔재 관련 항목(2·3번)은 이
        경로에서는 의도적으로 남아 있으므로 "실패"가 아니라 "수동 정리 필요" 검토 항목으로
        보고한다. 위 4번 remedy 를 적용했다면 5번("`.claude/CLAUDE-core.md` 가 hcg-core 슬림본")도
        정상 통과하므로 제외 목록에 넣지 않는다 — remedy 를 건너뛰었다면 5번은 실패로 보고하고
        레거시 방법론 코어가 남아 있음을 명시한다.
   - **없음 + `.claude/.hcg-core.json` 있음** → 이미 이행이 끝난 프로젝트다. "이행 완료 상태"를
     보고하고 중단(원한다면 7단계 단언만 재확인).
   - **둘 다 없음** → **중단된 이행일 수 있다.** 철거(2단계)는 성공하면 레거시 마커를 지우는데,
     hcg-core 마커는 6단계(재건)가 끝나야 생기므로, 그 사이(2~6단계 도중)에 세션이 끊기면 두
     마커가 모두 없는 상태가 된다. 다음 순서로 판정한다 — **부재만으로 판단하지 않는다**(빈 신규
     프로젝트도 `CLAUDE.md` 가 없기 때문):
     1. **양성 증거**: `docs/legacy-harness/` 가 있거나 `<파일>.legacy` 백업이 하나라도 있다
        → 중단된 이행 확정. (철거는 `tasks/phase-meta.yml`·`tasks/TODO.md` 를 아카이브하므로
        정상 경로에서는 대개 이 디렉터리가 생긴다 — 다만 아카이브 대상이 철거 전에 이미 없었다면
        생기지 않을 수도 있으므로, 없다고 해서 곧장 미이행으로 단정하지 말고 아래 보강 증거를
        함께 본다.)
     2. **보강 증거**: 양성 증거가 없더라도 `contracts/` 와 `.claude/` 는 있는데 `CLAUDE.md` 와
        `.claude/CLAUDE-core.md` 가 둘 다 없다 → 중단된 이행으로 판정.
     3. 둘 다 아니면 "이 프로젝트는 레거시 하네스가 아닙니다"를 보고하고 **중단**.

     중단된 이행으로 판정되면 **1·2단계를 건너뛰고 3단계(project.md 정합화)부터 재개**한다. 이때는
     마커가 없어 프로젝트명·앱 디렉터리를 도출할 수 없으므로 6단계(재건)의 예외 규칙(아래)을
     따른다.
2. hcg-core 가 설치되어 있는가? 세션에서 `/hcg-core:init` 커맨드가 보이는지로 판정한다
   (보조: `claude plugin list`). 없으면 아래를 안내하고 **중단** — 철거만 하고 재건하지 못하는
   반쪽 상태를 만들지 않기 위함이다.
   ```
   claude plugin install hcg-core@hcg-harness-marketplace
   ```
3. `git status` 를 확인한다. 미커밋 변경이 있으면 "철거는 파일을 삭제·이동합니다. 먼저 커밋하거나
   스태시하는 것을 권장합니다"를 고지하고 사용자 확인을 받는다.

## 1. dry-run 리포트

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" --mode retire --profile hcg --profiles-dir "${CLAUDE_PLUGIN_ROOT}/profiles" --target "${CLAUDE_PROJECT_DIR}" --dry-run
```

결과 해석:

- `ok:true` → `plan.deletes`(삭제) · `plan.backups`(`.legacy` 백업 후 삭제) · `plan.archives`
  (`docs/legacy-harness/` 로 이동) · `plan.keeps`(보존 + 검토 필요) · `plan.missing`(이미 없음) 을
  사용자에게 그대로 보여주고 진행 여부를 확인받는다. `plan.archives` 에는 구버전 upgrade 가 남긴
  `<파일>.new` 충돌 잔재도 포함된다(삭제하지 않고 아카이브로 회수한다. 방치하면 죽은
  레거시 정의가 이행 후에도 프로젝트에 남는다).
- `ok:false, incomplete:true` → 목적지 충돌이 있으면 dry-run 도 이 형태로 실패한다 — **이때는
  `plan` 키가 없다. `plan.*` 를 읽으려 하지 말 것.** 대신 `report`·`unresolved` 를 그대로
  보여준다. `unresolved` 는 `plan.blocked` 를 그대로 실은 배열로, 각 항목은
  `{relPath, destPath, kind}` 형태다(`kind` 는 `"backup"` 또는 `"archive"` — 백업 충돌이면
  `destPath` 가 이미 존재하는 `<파일>.legacy` 경로, 아카이브 충돌이면 이미 존재하는
  `docs/legacy-harness/...` 경로다). 어느 쪽이든 `relPath` 가 프로젝트에 그대로 남아 있는
  파일이다. dry-run 이므로 디스크는 애초에 바뀌지 않았다 — 충돌 파일을 옮기거나 이름을 바꿔
  해소한 뒤 **이 dry-run 을 다시 실행**한다. 해소 전에는 **2단계로 넘어가지 않는다**.
- 그 밖의 `ok:false`(예: 레거시 마커 없음) → 그대로 보고하고 중단한다.

## 2. 철거

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" --mode retire --profile hcg --profiles-dir "${CLAUDE_PLUGIN_ROOT}/profiles" --target "${CLAUDE_PROJECT_DIR}"
```

결과 해석:

- `ok:true` → `report`(deleted · backedUp · archived · keeps · missing · prunedDirs)를 보고하고 3단계로. (`deleted` 는 `backedUp` 항목의 원본을 포함한다 — 사용자가 수정한 파일은 `.legacy` 로 백업한 뒤 원본이 삭제되므로, 같은 파일이 두 목록에 나타나는 것이 정상이다.)
- `ok:false, incomplete:true` → **목적지 충돌로 옮기지 못한 파일이 있다.** `unresolved` 는
  `plan.blocked` 를 그대로 실은 배열로, 각 항목은 `{relPath, destPath, kind}` 형태다(`kind` 는
  `"backup"` 또는 `"archive"`). 어느 쪽이든 `relPath` 가 **프로젝트에 그대로 남은 파일**이다.
  이 경우 **마커가 보존되어 재실행이 가능하다**. 충돌은 변경 전에 판정되므로 **이 경우 디스크는
  변경되지 않았다 — 충돌만 해소하면 그대로 다시 실행하면 된다.** 사용자에게 충돌 파일을 그대로
  보여주고 — 예: 이미 존재하는 `<파일>.legacy`, 이미 존재하는 `docs/legacy-harness/...` — 그것을
  옮기거나 이름을 바꿔 충돌을 해소한 뒤 **2단계를 다시 실행**하라고 안내한다. 3단계로 넘어가지 않는다.
- `ok:false, partial:true` → 철거 도중 파일 시스템 오류(파일 잠금 등)로 중단됐다. `report` 에는
  오류가 나기 전까지 **실제로 처리된 항목만** 담겨 있다(부분 *기록*이 아니라 부분 *보고* — 디스크
  상태와 report 는 일치한다). 마커가 보존되어 재실행이 가능하다. `error` 메시지가 가리키는 원인
  (파일 잠금 등)을 해소한 뒤 **2단계를 다시 실행**한다 — 이미 처리된 항목은 다음 실행에서
  `missing` 으로 빠지고 나머지만 이어서 처리된다. 3단계로 넘어가지 않는다.
- 그 밖의 `ok:false` → 그대로 보고하고 중단한다.

## 3. `.claude/project.md` 정합화

이 파일은 hcg-core 에서도 **유일한 인스턴스 슬롯**(task-agent 가 spawn 시 Read)이라 살아있어야
하지만, 레거시본은 내용이 낡았고 **UI 표준 섹션이 아예 없다**. 통째로 교체하지 말고 섹션 단위로
수술한다. 편집 전 `.claude/project.md.legacy` 백업을 남기고, 편집 후 변경 내용을 사용자에게 보여준다.

- **삭제**: `## 모델 배정`(폐지된 티어 매트릭스) · `## 활성 에이전트`(5-에이전트 시대) ·
  `## 기본 모드`(“결합=정적(파이프라인)”)
- **수정**: “5개 에이전트 셸의 `skills:` 에 추가” · “front 셸의 `skills:` 에 추가” → task-agent 기준
  문구로. `## 경로` 의 `app dir(hook 검증 대상) ← POST_EDIT_VERIFY_APP_DIR` 줄 제거(0.3.0 에서
  해당 훅이 제거됨).
- **추가**: `## UI 표준` — 없으면 이행된 프로젝트의 task-agent 가 AX 표준을 전달받지 못한다.
  ```markdown
  ## UI 표준
  - `ax-wireframe` (HCG AX — 전사 표준. 세션에 없으면 설치를 요청하고 임의 디자인 금지).
    프로젝트별 구체값·오버라이드는 `contracts/design-guide.md` — 충돌 시 design-guide(사용자
    합의로 명시 기록된 오버라이드)가 우선한다.
  ```
- **보존**: `## 정체성` · `## 스택` · `## 경로`(실제 경로 값) · `## 계약` · `## 도메인 스킬` ·
  `## 테스트 스킬`(섹션 자체는 유지 — 위 “수정”의 죽은 문구만 고친다) · `## 환경변수`, 그리고 위
  목록에 없는 **사용자가 직접 추가한 섹션**(손대지 말고 보고).

## 4. 끊긴 `codex:review` npm 스크립트 정리

`<appDir>/package.json` 은 user-owned 라 재건(6단계) gap-fill 이 건드리지 않는다 — 그리고 이
파일은 2단계 철거가 끝난 순간 이미 최종 형태로 남아 있으므로, 재건을 기다리지 않고 지금 바로
정리할 수 있다. 2단계 철거가 `scripts/codex-review.mjs` 를 아카이브로 옮기므로, codex 를 켜고
초기화했던 프로젝트는 `package.json` 의 `"codex:review": "node ../../scripts/codex-review.mjs"`
가 더 이상 존재하지 않는 파일을 가리키게 된다(hcg-core 의 codex-review 는 래퍼 스크립트 없이
`codex-review` 스킬 절차로 직접 동작하므로 대체 파일도 필요 없다).

- 앱 디렉터리는 0단계에 기록한 `choices.appDir` 다(중단된 이행 재개 경로로 들어와 마커가 없다면
  6단계의 재개 경로 예외 규칙으로 먼저 판별한다).
- `<appDir>/package.json` 자체가 없으면(앱 골격이 아예 없는 프로젝트 — 6단계도 이 경우
  `--no-app` 으로 진행하게 된다) 이 단계는 건너뛴다.
- `<appDir>/package.json` 을 읽어 `scripts` 의 `codex:review` 항목이 있으면 제거한다. 원래
  없었다면(codex 미사용으로 초기화된 프로젝트) 아무 것도 하지 않는다.
- 제거했는지 여부를 리포트에 남긴다.

## 5. `contracts/shared-types` 이관

2단계 철거는 `contracts/shared-types.md` 를 `docs/legacy-harness/contracts/shared-types.md` 로
옮기기만 하고, 그 내용을 어디에도 다시 써주지는 않는다. `*-conventions` 스킬들은 여전히
task-agent 에게 이 SSOT 에서 타입을 바인딩하라고 지시하므로, 옮기지 않으면 계약이 조용히
비어버린다.

**이 단계를 6단계(재건)보다 앞에 두는 이유** — `--gap-fill` 은 이미 있는 파일을 건너뛴다. 즉
`contracts/shared-types.ts` 를 여기서 먼저 써 두면, 6단계의 gap-fill 이 그 파일을 스텁으로
덮어쓰지 않고 그대로 보존한다. 그 결과 6단계(레거시 플러그인을 비활성화하는 단계) 다음에는
7단계(읽기 전용 단언)만 남는다.

- `docs/legacy-harness/contracts/shared-types.md` 를 읽는다.
- 플레이스홀더뿐인 미작성 스텁이면(실제 타입 정의가 없으면) 이 단계를 건너뛴다 — 6단계의
  gap-fill 이 빈 스텁(`export {};`)을 대신 만든다.
- 실제 타입 계약이 있으면 그 내용을 TypeScript 로 옮겨 적어 `contracts/shared-types.ts` 를 새로
  작성한다(재건이 이 파일을 덮어쓰지 않는다 — gap-fill 은 존재하는 파일을 건너뛴다). 변환
  결과(옮긴 타입 목록)를 사용자에게 보여 확인받는다.
- 수행/건너뜀 여부를 리포트에 남긴다 — 7단계 사용자 검토 목록에도 오른다.

## 6. 재건 — `/hcg-core:init` 위임

**여기서부터가 분기점이다.** `--gap-fill` 재건은 `enabledPlugins.hcg-harness:false` 를 프로젝트
설정에 기록한다 — 그 결과 **다음 세션부터** 레거시 플러그인(과 이 커맨드)이 사라진다. 그러므로
남은 단계는 가능하면 **이번 세션 안에서** 마저 끝낸다. 다만 이어지는 7단계(단언)는 레거시
플러그인이 전혀 필요 없어 다음 세션(hcg-core 만으로)에서도 그대로 이어 할 수 있으니, 여기서
세션이 끊기더라도 갇히지 않는다.

`/hcg-core:init` 을 호출한다. init 이 묻는 값은 **0단계에서 기록해 둔 마커 값**으로 답한다(사용자에게
다시 묻지 않는다). **마커 파일 자체는 2단계에서 이미 삭제되었으므로 여기서 다시 읽으려 하지 말 것.**

- 프로젝트명 · 앱 디렉터리: 0단계에 기록한 `choices.projectName` · `choices.appDir`
- 앱 골격 생성 여부: `<appDir>/package.json` 이 **있으면 예**, 없으면 아니오.
  - **아니오로 판정되면 실행 전에 고지한다**: `--no-app` 은 `{{APP_DIR}}/**` 뿐 아니라 `.github/`
    도 제외한다. 이 경로에서는 2단계에서 철거된 `.github/workflows/ci.yml` 이 **재생성되지
    않는다** — 필요하면 진행 전에 사용자에게 백업을 권한다. (7단계 단언도 이 공백을 실패로
    처리하지 않고 검토 목록에 싣는다.)
- **재개 경로 예외** — 0단계에서 "중단된 이행"으로 진입해 기록해 둔 마커 값이 없는 경우: 앱
  디렉터리는 `apps/web` 을 먼저 확인하고 없으면 `package.json` 이 있는 디렉터리를 찾는다.
  프로젝트명은 `<appDir>/package.json` 의 `name` 을 후보로 삼되, **확신이 없으면 사용자에게 묻는다**
  — 이 경로는 예외 상황이므로 재질문이 허용된다.

폴더가 비어있지 않으므로 init 은 `blocked` 를 반환한다. init 절차대로 **`--gap-fill` 로 재실행**한다
(없는 것만 채움 → 살아남은 `contracts/**` · `{{APP_DIR}}/**` · `.claude/project.md` ·
`.claude/skills/**` 는 보존된다).

`created` 목록을 사용자에게 보여준다 — gap-fill 은 사용자가 의도적으로 지웠던 앱 파일도 되살릴 수
있으므로, 원치 않는 파일은 삭제하도록 안내한다.

## 7. 이행 완료 단언 + 리포트

7개를 기계적으로 확인하고, 하나라도 실패하면 **“이행 미완”** 으로 명시한다. (0단계에서 "있음 +
hcg-core 도 있음"(둘 다 있음) 경로로 들어왔다면 2·3번은 철거를 의도적으로 건너뛰었으므로
실패가 아니라 "수동 정리 필요" 검토 항목으로 옮겨 보고한다. 5번은 0단계 그 분기의 레거시
방법론 코어 교체 remedy 적용 여부로 갈린다 — remedy 를 적용했다면 정상적으로 통과하므로
제외 목록에 넣지 않고, 사용자가 remedy 를 건너뛰었다면 5번은 실제 실패이며 레거시 방법론
코어(`.claude/CLAUDE-core.md`)가 그대로 남아 있음을 그렇게 보고한다 — 이 경우는 "수동 정리
필요"로 눙치지 않는다.)

1. `.claude/settings.json` 의 `enabledPlugins` 에 `hcg-harness@hcg-harness-marketplace: false`
2. `.claude/agents/` 에 레거시 5종 없음(있다면 `task-agent.md` 만). 단, 마커에 매니페스트가 없던
   구 프로젝트는 5종이 `.legacy` 로 백업된 채 남을 수 있다 — `*.md` 원본이 없으면 통과이고,
   `*.md.legacy` 잔존은 실패가 아니라 아래 사용자 검토 목록 항목이다.
3. `tasks/phase-meta.yml` 없음 · `tasks/TODO.md` 없음 · `scripts/codex-review.mjs` 없음 ·
   `contracts/shared-types.md` 없음 · **철거 대상 경로의 `<파일>.new` 잔재 없음**(2단계가
   아카이브로 회수했어야 한다 — 남아 있으면 죽은 레거시 정의가 그대로 노출된다). (디렉터리
   `tasks/` 자체는 사용자 소유(`tasks/**`)라 다른 파일이 남아 있을 수 있다 — 디렉터리 존재는
   실패로 보지 않고, 남은 파일이 있으면 검토 목록에 싣는다.)
4. `.github/workflows/ci.yml` — **앱 골격이 있으면** 존재를 확인한다(6단계가 재생성했어야 한다).
   **앱 골격이 없으면**(6단계에서 `--no-app`) 이 파일은 재생성되지 않는 **알려진 공백**이다 — 6단계
   에서 이미 사전 고지했으므로 실패로 처리하지 않고 아래 사용자 검토 목록에 싣는다.
5. `.claude/CLAUDE-core.md` 가 hcg-core 슬림본(레거시 11.9KB 본이 아님)
6. `.claude/.hcg-harness.json` 없음 · `.claude/.hcg-core.json` 있음
7. `.claude/project.md` 에 죽은 섹션 3종 없음 + `## UI 표준` 있음

이어서 **사용자 검토 목록**을 보고한다: `.legacy` 백업(병합 후 삭제, 자동 병합 금지) ·
`docs/legacy-harness/` 아카이브(보관 여부는 사용자 판단 — 회수된 `<파일>.new` 도 여기 있다) ·
`plan.keeps` 항목(**각 항목의 내용을 직접 열어본다** — `keeps` 는 "마커와 내용이 다르다"만 뜻하며,
사용자 수정본일 수도 있고 구버전 upgrade 가 남긴 매니페스트 드리프트일 수도 있다. 손대지 않은
부트스트랩 스텁이면 삭제한 뒤 `/hcg-core:init --gap-fill` 을 다시 돌려 hcg-core 본으로 채운다 —
방치하면 죽은 에이전트 이름·옛 패키지 매니저를 가리키는 레거시 스텁이 그대로 남는다) ·
`.claude/skills/<slug>-domain/SKILL.md` 의 에이전트 이름 참조 · `contracts/shared-types` 이관 여부
(5단계) · 앱 골격 없음 경로의 `ci.yml` 공백(위 4번 항목).

마지막으로 안내한다: **이 세션에서는 레거시 플러그인이 아직 로드되어 있으므로, 새 세션을 열면
hcg-core 로 전환된다.** 변경분을 커밋하면 팀 전체에 공유된다.
