# Portable / per-project boundary

What ships in the **HCG harness** package (portable) vs what each **consuming
project** authors (per-project). The rule: process methodology and HCG-standard
stack conventions are portable; identity, paths, domain rules, and contracts are
per-project.

## Portable (in this package)

| Item | Path | Why portable |
|---|---|---|
| HARNESS core | `hcg-harness/CLAUDE-core.md` | Pipeline ①–⑥ · fast-path gates · Operating Rules §0–§5 — project-invariant methodology. |
| Agent shells (5) | `hcg-harness/agents/*.md` | Generic, de-instanced role templates. Frontmatter binds only portable skills; body uses generic placeholders / `project.md` pointers. Frontmatter `description` keeps a human-readable HCG-stack hint (not load-bearing). |
| Process skills (4) | `hcg-harness/skills/{pipeline-phase,codex-review,verification-ladder,contract-authoring}/` | Phase lifecycle, codex gate, verification ladder, contract-authoring (format + SSOT discipline) — stack- and domain-neutral. |
| Stack conventions (3) | `hcg-harness/skills/{db,backend,frontend}-conventions/` | **HCG-standard** stack methodology (Prisma/MariaDB · Next.js App Router · TanStack/Zustand/RHF/Zod · Vitest/Playwright tests · feature-centric). No project domain values. |
| Guard + verification hooks (4) | `hcg-harness/hooks/*.mjs` (+ `run-*.mjs` launchers, `*.test.mjs`, `hooks.json`) | PreToolUse contracts-lock + destructive-command guard · PostToolUse ESLint (+ opt-in tsc) · SessionStart context · Stop phase-gate advisory. Instance values (app dir, label, locks) externalized to env — 0 hardcoded project values. |
| Workflow templates (5) | `hcg-harness/workflows/*.js` | `audit` / `migrate` / `test-gen` / `review` / `converge` generic skeletons for dynamic-mode fan-out. |

## Per-project (the consuming project authors)

| Item | Path | Note |
|---|---|---|
| Instance slot | `.claude/project.md` | The single slot — identity, stack, paths, contracts, model assignment, active agents, env keys. Template: `templates/project.md`. |
| Domain skill | `.claude/skills/<domain>/SKILL.md` | Invariant business rules. Added to all 5 shells' `skills:`. |
| Test/E2E skill | `.claude/skills/<e2e>/SKILL.md` | Optional skill; HCG default = Playwright E2E. Added to the front shell. |
| `CLAUDE.md` PROJECT section | `CLAUDE.md` | Project overview + `@.claude/CLAUDE-core.md` import. Template: `templates/CLAUDE.md`. |
| Contracts | `contracts/*` | The blackboard SSOT (db-schema/api-spec/shared-types/design-guide). |
| Codex gate wrapper | `scripts/codex-review.mjs` + `package.json` `codex:review` | The qa codex gate calls `npm run codex:review -- <base_sha>`; copy `templates/codex-review.mjs` and wire it to codex-companion (install.md §2e). Not bundled — depends on the external codex plugin. |
| CI contract-drift gate | CI config (e.g. `.github/workflows/contracts.yml`) | Deterministic contract↔code drift checks (`tsc` · `prisma validate`/`migrate diff` · OpenAPI lint · token lint). Template: `templates/ci-contract-drift.md`. Semantic drift → the `converge` workflow. |
| App + DB | `apps/web`, `prisma/`, … | The actual product code. |

## Residual install-time seams

Genericized so a fresh install needs **no source edits**, only configuration:

- **App dir(s)** — the lint hook scopes to `apps/web` by default; set env
  `POST_EDIT_VERIFY_APP_DIR` to your source root (`.` for a non-monorepo) or a
  comma-separated list for several apps/packages. The eslint/tsc binary resolves
  from the matched app dir's `node_modules`, falling back to the project-root
  `node_modules` (pnpm hoist / flat layouts).
- **Type-check gate** — `POST_EDIT_VERIFY_TSC=1` also runs a project
  `tsc --noEmit` after a clean lint (opt-in: whole-project, so slower).
- **Contracts lock** — `contracts/` writes are denied by default (PreToolUse
  `contracts-guard`), including shell writes (`echo > contracts/…`, `tee`,
  in-place `sed`, PS `Set-Content` — the G3 heuristic). Unlock deliberately for
  the contract-authoring step only: create the sentinel file
  `.claude/contracts-unlock` (works mid-session — hook env is fixed at Claude
  Code startup, so a running plan role cannot set env for itself but CAN
  write/delete the sentinel), or set `HARNESS_CONTRACTS_WRITE=1` at launch.
  Delete the sentinel when done. Override the dir with `HARNESS_CONTRACTS_DIR`.
- **Destructive-command guard** — irreversible Bash/PowerShell (prisma migrate
  reset, SQL DROP/TRUNCATE, `rm -rf` / `Remove-Item -Recurse -Force` on a root,
  `git push --force`) is denied; set `HARNESS_DISABLE_DESTRUCTIVE_GUARD=1` to
  disable for a step.
- **Phase-gate at Stop** — advisory by default; `HARNESS_PHASE_GATE_BLOCK=1` makes
  it block stopping while an in-progress phase's codex gate hasn't run.
- **Session label** — set env `SESSION_CONTEXT_LABEL` to your project name
  (default `[harness session context]`).
- **Agent skills** — add per-project `<domain>` / E2E skills to the shells'
  `skills:` frontmatter (install.md §2d).

> **Verified limit (contracts-guard) — re-confirmed 2026-06-25:** the PreToolUse
> payload (`session_id`, `transcript_path`, `cwd`, `permission_mode`,
> `hook_event_name`, `tool_name`, `tool_input`) carries **no agent identifier**
> (current Claude Code docs), and no indirect field is documented to distinguish
> subagents — so true per-agent enforcement is **not possible from a hook today**.
> The lock therefore correctly keys on intent (unlock sentinel /
> `HARNESS_CONTRACTS_WRITE`), not on "which agent is calling". (Per-agent
> enforcement would need an Anthropic feature request — an `agent_type`/`agent_id`
> field in the payload.) Whether PreToolUse fires for *subagent* tool calls is
> undocumented upstream, but **measured 2026-07-10** (Claude Code on Windows,
> plugin-level hook): a general-purpose subagent's `Write` into `contracts/` was
> denied by this guard exactly like a main-thread call — subagent coverage
> confirmed in that environment. Undocumented behavior can change; keep the
> rung-4 install re-check per environment/version.
>
> **Hooks are guardrails, not a security boundary.** The regex destructive-guard is
> evadable (e.g. `find -delete`, `psql -f`, a child-process) — Anthropic and Trail
> of Bits are explicit that hooks are "guardrails, not walls". For a real
> enforcement boundary, run Claude Code with **`/sandbox`** (OS-level Seatbelt /
> bubblewrap): it enforces deny rules at the OS level, whereas Bash bypasses hook
> denies without it. Treat the harness hooks + git-worktree isolation as
> defense-in-depth *above* a sandbox, not a replacement for one.

## Drift caveat (additive install)

This package is an additive layer. If a project *copies* the shells/skills into
its own `.claude/` and edits them, those copies **drift** from this package —
edits here do not propagate and vice-versa. Eliminating drift means canonical
adoption (the project consumes the plugin as its single source). Until then,
treat this package as the upstream and re-pull rather than diverging.

## Known limitations (documented honestly — not defects)

Deliberate scope boundaries / platform constraints, surfaced so a consuming
project adopts with eyes open:

- **Hooks are guardrails, not a security boundary** — the PreToolUse guards are
  evadable (`find -delete`, `psql -f`, child-process) and key on intent (no agent
  identity in the payload, re-verified 2026-06-25). Run with `/sandbox` for a real
  OS-level boundary (see the contracts-guard note above).
- **Plugin-method per-agent enforcement is limited** — Claude Code ignores the
  `hooks` / `mcpServers` / `permissionMode` frontmatter on *plugin* subagents, so
  per-agent hooks/permissions can't be enforced by the plugin itself; they fall to
  session-level `settings.json` (coarse) or copied `.claude/agents/` (loses
  single-source portability). [official sub-agents docs]
- **No built-in cost / token budgeting or observability** — workflows cap fan-out
  size (`MAX_DIMENSIONS` / `MAX_WORK_ITEMS` …) but there is no token accounting,
  cost cap, or tracing; wire your platform's observability if needed.
- **Performance/scalability is not benchmarked** — phase runtimes, safe project
  size, and parallelization overhead are unmeasured; the caps are safety bounds,
  not tuned values.
- **Workflow runtime contract is version-pinned** — verified against Claude Code
  CLI 2.1.183 (`workflows/README`); field names / behaviors may drift on other
  versions — re-confirm on upgrade (rung-4).
- **Agent self-reports are prompt-driven** — the fail-closed guards constrain and
  cross-check self-reported data but cannot prove an agent did on disk exactly what
  it reported; the ultimate guarantee rests on runtime/VCS verification + your CI.
- **Deferred (design-first / gated)** — HITL approve/edit/respond + resumable
  execution-state checkpoints (platform-dependent); machine-checkable contracts are
  *prescribed*, not enforced-by-default (wire `templates/ci-contract-drift.md`);
  sequential→graph dispatch and per-agent enforcement repackaging await
  re-verification (benchmark review Open Q #1·#2).
