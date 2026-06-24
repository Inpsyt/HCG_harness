# Installing the HCG harness in a new project

> How an empty project (a) installs the **portable HCG harness** and (b) fills
> the **instance slot** so the agent shells resolve to that project's paths,
> stack, and domain rules.
>
> The harness ships the portable layer only: 5 agent shells, 6 portable skills
> (3 process + 3 HCG-stack conventions), 2 verification hooks, 3 workflow
> templates, and the HARNESS methodology core (`CLAUDE-core.md`). Project paths,
> domain rules, and per-project skills live in the **consuming** project.

---

## 0. Prerequisites

- Claude Code CLI (plugin commands come from `claude plugin --help`).
- Node.js on PATH (the verification hooks are `.mjs`).
- The harness source — this repo (`hcg_harness/`), or a git repo hosting
  `.claude-plugin/marketplace.json`.

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

# 4. confirm the loaded inventory (5 agents + 6 skills + 2 hooks + 3 workflows)
claude plugin list
claude plugin details hcg-harness
```

This layers the agent shells, skills, hooks, and workflow templates on top of
the project's own `.claude/` **without overwriting** anything in it.

The bundled **3 workflow templates** (`audit` / `migrate` / `test-gen`) live in
the plugin's auto-discovered `workflows/` dir; once installed they are loadable
as named workflows — `Workflow({ name: 'audit' | 'migrate' | 'test-gen', args })`
— for independent · bulk · read-only work that does not fit the static pipeline.
They are generic skeletons; inject project specifics via `args` + `.claude/project.md`.
(Workflows must be enabled in the consuming project — gated by `disableWorkflows`
/ env `CLAUDE_CODE_DISABLE_WORKFLOWS`.)

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
/ React Hook Form / Zod · feature-centric) are pre-filled — adjust per project.
`project.md` is **not** auto-injected; each agent Reads it on spawn, so it must
exist before agents run.

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

---

## 3. Verify the install (rung-4, manual)

| Check | How |
|---|---|
| Manifests valid | `claude plugin validate <pkg> --strict` → exit 0 (method A) |
| Components loaded | `claude plugin details hcg-harness` shows 5 agents + 6 skills + 2 hooks |
| Agent resolves slot | Spawn an agent; confirm it Reads `.claude/project.md` and the `<domain>` skill |
| Hooks fire | Edit a `*.ts` file under the app dir → PostToolUse runs ESLint; new session → SessionStart injects phase/issue context |
| Hook app dir | If your source root is not `apps/web`, set `POST_EDIT_VERIFY_APP_DIR` (e.g. `.`, `web`); else the lint hook silently no-ops |
| Session label | Optional: set `SESSION_CONTEXT_LABEL` to your project name (default `[harness session context]`) |

A full empty-project end-to-end install + run is environment-dependent (separate
repo + live Claude Code) and is a **rung-4 manual acceptance** step.

The `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}` token expansion the plugin
hooks rely on is **verified official behavior** — Claude Code substitutes these
tokens inline *before* shell execution (plugins-reference, "substituted inline …
in … hook commands …"), cross-platform (Windows PowerShell/`cmd` included) with
no shell-syntax dependency.
