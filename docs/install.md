# 새 프로젝트에 HCG 하네스 설치하기

> **⚠ 이 문서는 레거시 `hcg-harness`(파이프라인 하네스) 전용이다.** 0.3.0 부터 `hcg-harness` 는
> **hcg-core 로의 이행 램프일 뿐이다** — 신규 설치는 권장하지 않고, 잔류도 지원 대상이 아니다.
> 전원 `hcg-core`(unhobbled, 기본 권장)로 이행한다. 이행은 `/hcg-harness:upgrade` 1회로
> 자동 수행되며(철거 → 정합화 → hcg-core 재건 → 단언), 별도 `resync`/재동기화 명령은 없다.
> 설치·빠른 시작·이행 가이드는 루트 `README.md` 를 본다.

> 빈 프로젝트가 (a) **포터블 HCG 하네스**를 설치하고 (b) **인스턴스 슬롯**을 채워
> 에이전트 셸이 그 프로젝트의 경로·스택·도메인 규칙으로 해소되게 하는 방법.
>
> 하네스는 포터블 레이어를 싣는다: 5개 에이전트 셸, 9개 포터블 스킬
> (프로세스 5 — pipeline-phase · codex-review · verification-ladder · contract-authoring ·
> qa-e2e · HCG 스택 컨벤션 3 · UI 표준 1), 플러그인이 배선하는 hook **2개**(SessionStart —
> phase/이슈 컨텍스트 + 이행 안내 배너; PreToolUse — 파괴적 명령 가드만, matcher `Bash|PowerShell`
> 한정, 새 런처 `run-destructive-guard.mjs` 가 계약 잠금 G1/G3 는 꺼둔 채 유지; 계약 잠금 자체와
> PostToolUse lint · Stop phase-gate 는 0.3.0 부터 플러그인 배선에서 빠졌다 — 스크립트 자체는
> 번들에 남아 있고 §1B 복사 설치로 수동 배선할 때만 쓰인다), 5개 워크플로 템플릿,
> 3개 커맨드(`init` · `upgrade` · `qa` → `/hcg-harness:init` · `:upgrade` · `:qa`), 부트스트랩 엔진
> (`scripts/bootstrap.mjs`), HCG 프로파일(`profiles/hcg/`), HARNESS 방법론 코어
> (`CLAUDE-core.md`). 프로젝트 경로·도메인 규칙·codex 게이트 래퍼·프로젝트별 스킬은
> **소비 프로젝트**에 둔다.

---

## 0. 요구사항

- **Claude Code CLI** — 플러그인 설치 + `/hcg-harness:init` 호출용.
- **Node.js 22+** (LTS · 배포 서버 표준 22.13.0) PATH 등록 — hook과 부트스트랩 엔진이 `.mjs`.
- **npm 10+** (Node 22 에 동봉 — 별도 설치 불요 · 배포 서버 표준 10.9.2) — HCG 프로파일의
  패키지 매니저; 생성되는 `setupCommands`가 npm/npx 사용. 잠금파일은 `package-lock.json`(커밋
  대상 — CI `npm ci` 가 요구). 생성 앱은 `.npmrc`(`engine-strict=true`)가 engines
  가드(node>=22/npm>=10)를, `"packageManager": "npm@10.9.2"` 필드(pnpm 조기 거부 + corepack
  버전 고정)와 preinstall 가드(`npx only-allow npm`)가 npm 전용(타 PM 설치 차단)을 기계
  강제한다.
- **배포 서버 표준 스펙 (HCG 규정)**: node 22.13.0 · npm 10.9.2 · pm2 7.0.3 — 배포
  파이프라인은 소스에서 `npm ci` 로 설치하며, 프로세스 매니저는 pm2(서버 측 전용 — 로컬
  개발·부트스트랩엔 불요).
- **git** — codex 게이트(base_sha diff)와 worktree 격리 워크플로(`migrate`/`test-gen`)용.
- 하네스 소스 — 이 레포(`hcg_harness/`), 또는 `.claude-plugin/marketplace.json`을
  호스팅하는 git 레포.
- **MariaDB/MySQL** — 앱을 실제 DB에 연결(Prisma migrate/connect)할 때만 필요;
  부트스트랩·`npm run build`엔 불요.

---

## 1. 포터블 번들 설치

두 방법. **A(플러그인)**가 권장·버전관리 가능 경로, **B(복사)**는 무툴링 폴백.

### A. Claude Code 플러그인으로 (권장)

이 레포는 단일 플러그인 마켓플레이스(`.claude-plugin/marketplace.json`)가
플러그인(`hcg-harness/.claude-plugin/plugin.json`)을 감싼 구조다.

```bash
# 1. (선택) 설치 전 검증
claude plugin validate <path-to>/hcg_harness/hcg-harness --strict
claude plugin validate <path-to>/hcg_harness --strict

# 2. 마켓플레이스 추가 (로컬 경로 · URL · GitHub 레포)
claude plugin marketplace add <path-to>/hcg_harness
#   …또는 git에서:  claude plugin marketplace add <owner>/<repo>   (예: Inpsyt/HCG_harness)

# 3. 플러그인 설치
claude plugin install hcg-harness@hcg-harness-marketplace

# 4. 적재 인벤토리 확인 (5 agents + 9 skills + 2 hooks + 5 workflows + 3 commands)
claude plugin list
claude plugin details hcg-harness
```

> 로컬 경로 vs git 소스: **로컬 경로**는 작업 사본에 live-link되어 개발 중 편하지만
> 그 폴더에 의존한다(폴더가 사라지면 못 씀). **git 소스**(`<owner>/<repo>`)는 푸시된
> 커밋 상태를 가져오므로 다른 PC 설치·배포에 적합하다. 배포 시점엔 git 소스를 권장.

이는 에이전트 셸·스킬·hook·워크플로 템플릿을 프로젝트 자체의 `.claude/` 위에
**덮어쓰지 않고** 얹는다.

동봉된 **5개 워크플로 템플릿**(`audit` / `migrate` / `test-gen` / `review` /
`converge`)은 플러그인이 자동 발견하는 `workflows/` 디렉터리에 있고, 설치되면 명명
워크플로로 로드된다 —
`Workflow({ name: 'audit' | 'migrate' | 'test-gen' | 'review' | 'converge', args })`
— 정적 파이프라인에 안 맞는 독립·대량·읽기전용 작업용
(`review` = diff에 대한 읽기전용 코드리뷰 fan-out + codex-D9 게이팅 분리;
`converge` = 계약↔코드 드리프트 정합 + 태스크 제안, 읽기전용).
generic 골격이므로 프로젝트 고유값은 `args` + `.claude/project.md`로 주입한다.
(워크플로 기능은 소비 프로젝트에서 활성화돼야 함 — `disableWorkflows`
/ env `CLAUDE_CODE_DISABLE_WORKFLOWS`로 게이트.)

### 자동 부트스트랩 (`/hcg-harness:init`, 수동 복사보다 권장)

플러그인 설치 후 새 세션을 열면 SessionStart 가 미부트스트랩을 감지해 `/hcg-harness:init` 실행을
안내한다. `/hcg-harness:init` 는 프레임워크(HCG 기본)·프로젝트명을 묻고, 하네스 레이어 + 최소 앱
골격을 생성한 뒤 setup 명령(`npm install` 등)을 안내한다(실행은 사용자 몫). 이행은
`/hcg-harness:upgrade`(0.3.0 부터 재동기화가 아니라 hcg-core 로의 이행 — 철거 → 정합화 →
hcg-core 재건 → 단언; 재동기화/`resync` 명령은 없다). 아래 §2 "수동 슬롯 채우기"는 부트스트랩을 쓰지
않거나 기존 프로젝트에 얹을 때의 절차다.

### B. 레이아웃 복사 (플러그인 툴링 없이)

```bash
cp -r hcg-harness/agents/*       <new-project>/.claude/agents/
cp -r hcg-harness/skills/*       <new-project>/.claude/skills/
cp -r hcg-harness/hooks/*.mjs    <new-project>/.claude/hooks/
cp -r hcg-harness/workflows/*.js <new-project>/.claude/workflows/   # 선택
cp    hcg-harness/CLAUDE-core.md <new-project>/.claude/CLAUDE-core.md
```

그다음 새 프로젝트의 `.claude/settings.json` `hooks` 블록에 hook을 배선한다.
**여기서 `hcg-harness/hooks/hooks.json`을 참조하지 말 것** — 그 파일은 **플러그인-방식
배선 전용**이다: 명령이 `node "${CLAUDE_PLUGIN_ROOT}/hooks/run-*.mjs"`인데, 복사 설치엔
`${CLAUDE_PLUGIN_ROOT}`가 없어 경로가 빈 값으로 해소되고 hook이 fail-open 하기도 **전에**
실행 실패한다. 복사 방식에서는 실제 hook을 **직접** 호출한다:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/contracts-guard.mjs", "timeout": 15 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/post-edit-verify.mjs", "timeout": 90 }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/session-start-context.mjs", "timeout": 15 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node .claude/hooks/phase-gate-check.mjs", "timeout": 15 }
        ]
      }
    ]
  }
}
```

복사 방식에서는 hook이 `.claude/hooks/`에 있어, 각 hook의 기본
`path.resolve(__dirname, "..", "..")`가 곧장 프로젝트 루트로 해소되고
`node .claude/hooks/<hook>.mjs`가 직접 호출한다(`invokedDirectly` 가드가 발동).
`${CLAUDE_PLUGIN_ROOT}`도, `run-*.mjs` 런처도 필요 없다(`cp`가 `run-*.mjs` 런처도
빼는데, 그것들은 플러그인-방식 전용이라 여기선 그냥 미사용).

---

## 2. 인스턴스 슬롯 채우기

번들 설치만으로는 "포인터만 있는 빈 껍데기"를 얻는다. 에이전트는 spawn 시
`.claude/project.md`와 도메인 스킬을 Read하므로, 둘 다 작성한다.

### 2a. `.claude/project.md`

`templates/project.md`를 `.claude/project.md`로 복사하고 모든 필드를 채운다. HCG 스택
기본값(Next.js App Router · MariaDB + Prisma · TanStack Query / Zustand / React Hook
Form / Zod · Vitest + Playwright · feature-centric)이 미리 채워져 있으니 프로젝트에 맞게
조정한다. `project.md`는 **자동 주입되지 않는다** — 각 에이전트가 spawn 시 Read하므로,
에이전트 실행 전에 반드시 존재해야 한다.

### 2b. 도메인 스킬 `.claude/skills/<domain>/SKILL.md`

프로젝트의 불변 비즈니스 규칙을 스킬로 작성한다. **도메인 규칙만** 담는다 — 스택
방법론은 `*-conventions` 스킬에, 경로는 `project.md`에 둔다.

### 2c. `CLAUDE.md` PROJECT 섹션 + HARNESS 코어

HARNESS 방법론(파이프라인 ①–⑥, fast-path 게이트, Operating Rules §0–§5)은
`CLAUDE-core.md`로 싣는다. 이를 `.claude/CLAUDE-core.md`에 두고(플러그인 방식: 플러그인에서
복사하거나 플러그인 루트에서 `@import`), 프로젝트 `CLAUDE.md`에 한 줄 import로 끌어온다:

```markdown
## 공통 방법론 (HARNESS)

@.claude/CLAUDE-core.md
```

`CLAUDE.md`에 PROJECT 섹션을 추가해 프로젝트 정체성/개요/명령을 적되, PROJECT 값은
`.claude/project.md`와 도메인 스킬을 가리키는 포인터로 유지한다. (템플릿: `templates/CLAUDE.md`.)

### 2d. 에이전트 셸을 이 인스턴스에 바인딩

패키지 셸은 **generic·사전-rebind 템플릿**이다 — frontmatter `skills:`와 본문 모두
프로젝트 무관(소스 프로젝트 도메인 문자열 0; frontmatter `description`은 사람이 읽을
HCG-스택 힌트만 유지). 설치는 **generic → instance**: placeholder를 당신 값으로 채운다.

1. **`skills:` frontmatter** — 패키지 셸은 포터블 스킬만 바인딩한다
   (`<role>-conventions`; plan = `pipeline-phase`, qa = `codex-review`). 여기에
   프로젝트별 스킬을 **추가**: `<domain>` 스킬을 **5개 전부**에, E2E 스킬을 **front** 셸에 —
   그리고 `project.md`의 「도메인 스킬」/「테스트 스킬」에 이름을 적는다. 본문은 project.md
   필드로 스킬을 참조하므로, 필드가 당신 스킬명을 가리키면 "프로젝트의 도메인 스킬"
   포인터가 전부 해소된다. (선택: 각 구현자 셸에 `verification-ladder`도 추가 — 모든
   구현자가 preload하는 게 좋다.)
2. **정체성 / 스택 / 도메인** — `project.md`(§2a)와 `<domain>` 스킬(§2b)을 작성한다.
   셸 본문엔 도메인 echo가 없고 그것들에 위임한다. 스택이 HCG 표준과 다르면
   `*-conventions` 스킬을 조정한다.

> 플러그인 방식 주의: 설치된 플러그인 안의 복사본을 편집하면 drift가 재발한다. 깔끔한
> 장기 해법은 canonical 채택(프로젝트가 플러그인을 단일 출처로 소비, 셸은 한 번만
> 무균화)이고, 그 전까진 위의 슬롯-추가 흐름이 가산적 경로다. `portable-instance-boundary.md` 참조.

### 2e. Codex 게이트 래퍼 (`scripts/codex-review.mjs`)

qa-agent의 Phase 완료 게이트(`codex-review` 스킬)는 `npm run codex:review -- <base_sha>`를
실행한다 — 이 래퍼는 플러그인이 **동봉하지 않는다**(별도 **codex-companion** 플러그인과
프로젝트의 git/CLI에 의존). 프로젝트마다 한 번 배선한다:

1. 레퍼런스 복사: `cp templates/codex-review.mjs <project>/scripts/codex-review.mjs`.
2. 프로젝트 `package.json`에 스크립트 추가:
   ```json
   { "scripts": { "codex:review": "node scripts/codex-review.mjs" } }
   ```
3. `scripts/codex-review.mjs`의 `// CUSTOMIZE` 블록을 편집해 설치한 codex-companion 리뷰
   명령을 호출하게 한다(누적 diff + 내장 `D9_FOCUS`가 전달됨). 리뷰를 stdout에 출력하고
   인프라 실패 시 비-0 종료해야 게이트가 fail-closed 된다(리뷰 불가 → Phase 종료 불가).
4. 첫 실행 인증: `node "<codex plugin>/codex-companion.mjs" setup --json` (또는 `/codex:setup`).

배선 전까지 codex 게이트는 사용 불가 — qa는 거짓 PASS 대신 "리뷰 불가"를 표면화한다.

> **opt-out**: `/hcg-harness:init` 3단계에서 "codex 리뷰 게이트 사용 안 함"을 선택하면
> (`bootstrap.mjs --no-codex`) 이 래퍼·`package.json` 스크립트가 아예 생성되지 않고, 마커
> `.claude/.hcg-harness.json` 에 `choices.codex: false` 로 기록된다(`/hcg-harness:upgrade` 에도
> 지속 — 래퍼가 부활하지 않는다). qa 는 자체 검증(테스트·빌드·타입·린트)으로 Phase 를 닫고
> Stop 훅(phase-gate-check)도 경고하지 않는다.
>
> **사후 활성화**: 마커의 `choices.codex` 를 `true` 로 수정한 뒤 `/hcg-harness:upgrade` 를
> 실행하면 래퍼(`scripts/codex-review.mjs`)가 생성된다. 단 `package.json` 은 user-owned 라
> upgrade 가 덮어쓰지 않으므로 `"codex:review": "node ../../scripts/codex-review.mjs"` 스크립트는
> 직접 추가한다 — 또는 이 §2e 수동 배선 절차를 그대로 수행해도 된다.

---

## 3. 설치 검증 (rung-4, 수동)

> **`/hcg-harness:init` 자동 부트스트랩 경로**는 자체 rung-4 수용을 가진다 — 환경 의존이라
> 첫 실설치 때 수동 실행: 커맨드 발견 + `${CLAUDE_PLUGIN_ROOT}` 토큰 치환 확인, `/hcg-harness:init`
> end-to-end 실행, 그다음 생성물에서 `npm install` / build / dev, 그리고 `/hcg-harness:upgrade`.
> 아래 표는 포터블 번들 / 수동 설치 검증을 다룬다.

> 아래 표의 **결정론 항목은 doctor 스크립트로 기계화**되어 있다 — `node <플러그인 루트>/scripts/doctor.mjs --target <프로젝트>` 한 번으로 marker·버전 skew·레이아웃·잠금 센티널·codex 배선·CI·툴체인·인스턴스 슬롯 8종을 진단한다(error 시 exit 1). 훅 발화 실측 등 라이브 항목은 여전히 수동이다.

| 검사 | 방법 |
|---|---|
| 매니페스트 유효 | `claude plugin validate <pkg> --strict` → exit 0 (방식 A) |
| 컴포넌트 적재 | `claude plugin details hcg-harness`에 5 agents + 9 skills + 2 hooks(SessionStart + PreToolUse 파괴적 명령 가드) + 3 commands 표시 |
| Hook 단위 테스트 | `npm test` (또는 `node --test hcg-harness/hooks/*.test.mjs`) → 전부 통과 (배선 여부와 무관하게 4개 hook 스크립트 전부 테스트 대상) |
| 에이전트 슬롯 해소 | 에이전트 spawn → `.claude/project.md`와 `<domain>` 스킬을 Read하는지 확인 |
| SessionStart 컨텍스트 발화 | 새 세션 → SessionStart가 phase/이슈 컨텍스트 주입, 레거시 마커(`.claude/.hcg-harness.json`) 프로젝트면 이행 안내 배너도 주입 |
| Lint hook 발화 | 0.3.0 부터 플러그인 배선에는 없음(§1B 복사 설치로 `.claude/settings.json`에 수동 배선했을 때만 해당) — app dir 아래 `*.ts` 편집 → PostToolUse가 ESLint 실행 |
| 계약 잠금 발화 | 0.3.0 부터 플러그인 배선에는 없음(§1B 복사 설치로 수동 배선했을 때만 해당) — 잠금 해제(센티널 `.claude/contracts-unlock` 생성 또는 기동 시 `HARNESS_CONTRACTS_WRITE=1`) 없이 `contracts/*` 편집 **및** 셸 쓰기(`echo x > contracts/…`, PS `Set-Content`) 시도 → PreToolUse가 거부. 서브에이전트 발화는 미문서화 동작 — **2026-07-10 실측(Windows·플러그인 훅): 서브에이전트의 Write 도 동일하게 거부 확인**; 새 환경/버전에서는 재실측 |
| 파괴 가드 발화 | 0.3.0 부터 플러그인 배선에 **복원됨**(`run-destructive-guard.mjs`, PreToolUse matcher `Bash\|PowerShell` 전용 — Edit/Write 등 편집 도구에는 붙지 않는다; 계약 잠금 G1/G3 는 이 런처가 `HARNESS_CONTRACTS_WRITE=1` 로 꺼둔 채 유지) — Bash/PowerShell `rm -rf /`·`Remove-Item -Recurse -Force C:\`·`prisma migrate reset`은 `HARNESS_DISABLE_DESTRUCTIVE_GUARD=1` 없이 거부됨. 주의: regex 가드(우회 가능 — `find -delete`, `psql -f`); 방어심층이지 벽이 아님 |
| CI 게이트 | init 렌더물 `.github/workflows/ci.yml` 푸시 → GitHub Actions에서 core(lint/tsc/test/build) + contract-drift(prisma validate/migrate diff) 잡 통과 확인. E2E 잡은 주석 해제로 opt-in |
| 실제 강제 경계 | hook은 guardrail이지 보안 경계가 아니다. OS 레벨 강제는 Claude Code를 `/sandbox`(Seatbelt/bubblewrap)로 실행 — 없으면 Bash가 hook 거부를 우회. `portable-instance-boundary.md` 참조 |
| Stop의 phase-gate | 0.3.0 부터 플러그인 배선에는 없음(§1B 복사 설치로 수동 배선했을 때만 해당) — `tasks/phase-meta.yml`에 진행중·미게이트 phase가 있으면 세션 종료 시 경고(또는 `HARNESS_PHASE_GATE_BLOCK=1`이면 차단) |
| Hook app dir | 소스 루트가 `apps/web`가 아니면 `POST_EDIT_VERIFY_APP_DIR` 설정(예: `.`, `web`, 또는 쉼표구분 목록); 아니면 lint hook이 조용히 no-op |
| 타입체크 게이트 | 선택: `POST_EDIT_VERIFY_TSC=1`이면 클린 lint 후 프로젝트 `tsc --noEmit`도 실행 |
| 세션 라벨 | 선택: `SESSION_CONTEXT_LABEL`을 프로젝트명으로 설정(기본 `[harness session context]`) |

빈 프로젝트에서의 완전한 end-to-end 설치+실행은 환경 의존(별도 레포 + 라이브 Claude Code)이며
**rung-4 수동 수용** 단계다.

플러그인 hook이 의존하는 `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` 토큰 확장은
**검증된 공식 동작**이다 — Claude Code가 셸 실행 *전에* 이 토큰들을 인라인 치환하며
(plugins-reference, "substituted inline … in … hook commands …"), 셸 문법 의존 없이
크로스플랫폼(Windows PowerShell/`cmd` 포함)으로 동작한다.
