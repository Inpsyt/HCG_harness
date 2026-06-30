# Installing the HCG harness in a new project

> How an empty project (a) installs the **portable HCG harness** and (b) fills
> the **instance slot** so the agent shells resolve to that project's paths,
> stack, and domain rules.
>
> The harness ships the portable layer: 5 agent shells, 7 portable skills
> (4 process + 3 HCG-stack conventions), 4 hooks (PreToolUse contracts+destructive
> guard · PostToolUse lint · SessionStart context · Stop phase-gate), 5 workflow
> templates, 2 commands (`init` · `upgrade` → `/hcg-harness:init` · `:upgrade`), the bootstrap engine
> (`scripts/bootstrap.mjs`), the HCG profile (`profiles/hcg/`), and the HARNESS
> methodology core (`CLAUDE-core.md`). Project paths, domain rules, the
> codex-gate wrapper, and per-project skills live in the **consuming** project.

---

## 0. Prerequisites

- **Claude Code CLI** — to install the plugin + invoke `/hcg-harness:init`.
- **Node.js 20+** (LTS; verified on 22) on PATH — the hooks and bootstrap engine are `.mjs`.
- **pnpm 9+** (verified on 10) — the HCG profile's package manager; the generated
  `setupCommands` use pnpm. (pnpm 10+ blocks postinstall build scripts by default —
  run `pnpm approve-builds` before `pnpm prisma generate`.)
- **git** — for the codex gate (base_sha diff) and the worktree-isolated workflows
  (`migrate` / `test-gen`).
- The harness source — this repo (`hcg_harness/`), or a git repo hosting
  `.claude-plugin/marketplace.json`.
- **MariaDB/MySQL** — only when running the app against a real DB (Prisma
  migrate/connect); not needed for bootstrap or `pnpm build`.

---

## 1. Install the portable bundle

Two mechanisms. **A (plugin)** is the recommended, version-able path; **B (copy)**
is a zero-tooling fallback.

### A. As a Claude Code plugin (recommended)

This repo is a single-plugin marketplace (`.claude-plugin/marketplace.json`)
wrapping the plugin (`hcg-harness/.claude-plugin/plugin.json`).

```bash
# 1. (optional) validate before installing
claude plugin validate <path-to>/hcg_harness/hcg-harness --strict
claude plugin validate <path-to>/hcg_harness --strict

# 2. add the marketplace (local path, URL, or GitHub repo)
claude plugin marketplace add <path-to>/hcg_harness
#   …or from git:  claude plugin marketplace add <owner>/<repo>

# 3. install the plugin
claude plugin install hcg-harness@hcg-harness-marketplace

# 4. confirm the loaded inventory (5 agents + 7 skills + 4 hooks + 5 workflows + 2 commands)
claude plugin list
claude plugin details hcg-harness
```

This layers the agent shells, skills, hooks, and workflow templates on top of
the project's own `.claude/` **without overwriting** anything in it.

The bundled **5 workflow templates** (`audit` / `migrate` / `test-gen` / `review` /
`converge`) live in the plugin's auto-discovered `workflows/` dir; once installed
they are loadable as named workflows —
`Workflow({ name: 'audit' | 'migrate' | 'test-gen' | 'review' | 'converge', args })`
— for independent · bulk · read-only work that does not fit the static pipeline
(`review` = a read-only code-review fan-out over a diff with codex-D9 gating split;
`converge` = a read-only contracts↔code drift reconciliation that proposes tasks).
They are generic skeletons; inject project specifics via `args` + `.claude/project.md`.
(Workflows must be enabled in the consuming project — gated by `disableWorkflows`
/ env `CLAUDE_CODE_DISABLE_WORKFLOWS`.)

### 자동 부트스트랩 (`/hcg-harness:init`, 권장)

플러그인 설치 후 새 세션을 열면 SessionStart 가 미부트스트랩을 감지해 `/hcg-harness:init` 실행을
안내한다. `/hcg-harness:init` 는 프레임워크(HCG 기본)·프로젝트명을 묻고, 하네스 레이어 + 최소 앱
골격을 생성한 뒤 setup 명령(`pnpm install` 등)을 안내한다(실행은 사용자 몫). 재동기화는
`/hcg-harness:upgrade`. 아래 §2 "수동 슬롯 채우기"는 부트스트랩을 쓰지 않거나 기존 프로젝트에
얹을 때의 절차다.

### B. Copy the layout (no plugin tooling)

```bash
cp -r hcg-harness/agents/*       <new-project>/.claude/agents/
cp -r hcg-harness/skills/*       <new-project>/.claude/skills/
cp -r hcg-harness/hooks/*.mjs    <new-project>/.claude/hooks/
cp -r hcg-harness/workflows/*.js <new-project>/.claude/workflows/   # optional
cp    hcg-harness/CLAUDE-core.md <new-project>/.claude/CLAUDE-core.md
```

Then wire the hooks in the new project's `.claude/settings.json` `hooks` block.
**Do not reference `hcg-harness/hooks/hooks.json` here** — that file is the
**plugin-method wiring only**: its commands are
`node "${CLAUDE_PLUGIN_ROOT}/hooks/run-*.mjs"`, and a copy install has no
`${CLAUDE_PLUGIN_ROOT}`, so the path resolves to nothing and the hook fails to
launch **before** it can fail-open. For the copy method, call the real hooks
**directly**:

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

With the copy method the hooks live at `.claude/hooks/`, so each hook's default
`path.resolve(__dirname, "..", "..")` resolves straight to the project root and
`node .claude/hooks/<hook>.mjs` invokes it directly (its `invokedDirectly` guard
fires). No `${CLAUDE_PLUGIN_ROOT}` and no `run-*.mjs` launcher needed (the `cp`
also drops the `run-*.mjs` launchers, which are plugin-method only and simply
unused here).

---

## 2. Fill the instance slot

Installing the bundle gives you empty-shells-with-pointers. The agents read
`.claude/project.md` and the domain skill at spawn; author both.

### 2a. `.claude/project.md`

Copy `templates/project.md` to `.claude/project.md` and fill every field. HCG
stack defaults (Next.js App Router · MariaDB + Prisma · TanStack Query / Zustand
/ React Hook Form / Zod · Vitest + Playwright · feature-centric) are pre-filled —
adjust per project. `project.md` is **not** auto-injected; each agent Reads it on
spawn, so it must exist before agents run.

### 2b. Domain skill `.claude/skills/<domain>/SKILL.md`

Write your project's invariant business rules as a skill. Keep it to **domain
rules only** — stack methodology belongs in the `*-conventions` skills, paths in
`project.md`.

### 2c. `CLAUDE.md` PROJECT section + HARNESS core

The HARNESS methodology (pipeline ①–⑥, fast-path gates, Operating Rules §0–§5)
ships as `CLAUDE-core.md`. Place it at `.claude/CLAUDE-core.md` (plugin method:
copy it out of the plugin, or `@import` from the plugin root) and pull it into
the project's `CLAUDE.md` with a bare import line:

```markdown
## 공통 방법론 (HARNESS)

@.claude/CLAUDE-core.md
```

Add a PROJECT section to `CLAUDE.md` for project identity/overview/commands; keep
PROJECT values as pointers to `.claude/project.md` and the domain skill.
(Template: `templates/CLAUDE.md`.)

### 2d. Bind the agent shells to this instance

The packaged shells are a **generic, pre-rebind template** — both frontmatter
`skills:` and body are project-agnostic (zero source-project domain strings;
the frontmatter `description` keeps a human-readable HCG-stack hint). Install is
**generic → instance**: fill the placeholders with your values.

1. **`skills:` frontmatter** — packaged shells bind only portable skills
   (`<role>-conventions`; plan = `pipeline-phase`, qa = `codex-review`). **Add**
   your per-project skills: your `<domain>` skill to **all 5** shells, your E2E
   skill to the **front** shell — and name them in `project.md`
   「도메인 스킬」/「테스트 스킬」. The body refers to skills by the project.md
   field, so once the field names your skill, every "프로젝트의 도메인 스킬"
   pointer resolves. (Optionally also add `verification-ladder` to each
   implementer shell — every implementer should preload it.)
2. **Identity / stack / domain** — author `project.md` (§2a) and the `<domain>`
   skill (§2b). The shell bodies have no inline domain echo; they defer to those.
   If your stack diverges from HCG standard, adjust the `*-conventions` skills.

> Plugin-method note: editing copies inside an installed plugin re-introduces
> drift. The clean long-term answer is canonical adoption (the project consumes
> the plugin as its single source, shells sterilized once); until then the
> add-the-slots flow above is the additive path. See `portable-instance-boundary.md`.

### 2e. Codex gate wrapper (`scripts/codex-review.mjs`)

The qa-agent's Phase-completion gate (`codex-review` skill) runs
`pnpm codex:review <base_sha>` — a wrapper this plugin does **not** bundle (it
depends on the separate **codex-companion** plugin and your project's git/CLI).
Wire it once per project:

1. Copy the reference: `cp templates/codex-review.mjs <project>/scripts/codex-review.mjs`.
2. Add the script to the project `package.json`:
   ```json
   { "scripts": { "codex:review": "node scripts/codex-review.mjs" } }
   ```
3. Edit the `// CUSTOMIZE` block in `scripts/codex-review.mjs` to call your
   installed codex-companion review command (it is handed the cumulative diff +
   the built-in `D9_FOCUS`). It must print the review to stdout and exit non-zero
   on infra failure so the gate fails closed (cannot review → Phase cannot close).
4. First-run auth: `node "<codex plugin>/codex-companion.mjs" setup --json` (or
   `/codex:setup`).

Until wired, the codex gate is unavailable — qa surfaces "cannot review" rather
than a false PASS.

---

## 3. Verify the install (rung-4, manual)

> The **`/hcg-harness:init` auto-bootstrap path** has its own rung-4 acceptance — environment-dependent,
> run manually on first real install: confirm commands discovery + `${CLAUDE_PLUGIN_ROOT}` token
> substitution, run `/hcg-harness:init` end-to-end, then `pnpm install` / build / dev on the generated
> project, and `/hcg-harness:upgrade`. The table below covers the portable-bundle / manual-install verification.

| Check | How |
|---|---|
| Manifests valid | `claude plugin validate <pkg> --strict` → exit 0 (method A) |
| Components loaded | `claude plugin details hcg-harness` shows 5 agents + 7 skills + 4 hooks + 2 commands |
| Hook unit tests | `npm test` (or `node --test hcg-harness/hooks/*.test.mjs`) → all pass |
| Agent resolves slot | Spawn an agent; confirm it Reads `.claude/project.md` and the `<domain>` skill |
| Lint hook fires | Edit a `*.ts` under the app dir → PostToolUse runs ESLint; new session → SessionStart injects phase/issue context |
| Contracts lock fires | Try to Edit `contracts/*` without `HARNESS_CONTRACTS_WRITE=1` → PreToolUse denies it (set the env only for deliberate authoring). NB: whether PreToolUse fires for *subagent* calls is undocumented — verify in your env |
| Destructive guard fires | A Bash `rm -rf /` or `prisma migrate reset` is denied unless `HARNESS_DISABLE_DESTRUCTIVE_GUARD=1`. NB: this is a regex guard (evadable — `find -delete`, `psql -f`); it is defense-in-depth, not a wall |
| Real enforcement boundary | Hooks are guardrails, not a security boundary. For OS-level enforcement run Claude Code with `/sandbox` (Seatbelt/bubblewrap) — without it, Bash bypasses hook denies. See `portable-instance-boundary.md` |
| Phase-gate at Stop | With an in-progress, un-gated phase in `tasks/phase-meta.yml`, ending the session warns (or blocks if `HARNESS_PHASE_GATE_BLOCK=1`) |
| Hook app dir | If your source root is not `apps/web`, set `POST_EDIT_VERIFY_APP_DIR` (e.g. `.`, `web`, or a comma-separated list); else the lint hook silently no-ops |
| Type-check gate | Optional: `POST_EDIT_VERIFY_TSC=1` adds a project `tsc --noEmit` after a clean lint |
| Session label | Optional: set `SESSION_CONTEXT_LABEL` to your project name (default `[harness session context]`) |

A full empty-project end-to-end install + run is environment-dependent (separate
repo + live Claude Code) and is a **rung-4 manual acceptance** step.

The `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` token expansion the plugin
hooks rely on is **verified official behavior** — Claude Code substitutes these
tokens inline *before* shell execution (plugins-reference, "substituted inline …
in … hook commands …"), cross-platform (Windows PowerShell/`cmd` included) with
no shell-syntax dependency.
