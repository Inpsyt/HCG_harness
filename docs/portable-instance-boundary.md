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
| Process skills (3) | `hcg-harness/skills/{pipeline-phase,codex-review,verification-ladder}/` | Phase lifecycle, codex gate, verification ladder — stack- and domain-neutral. |
| Stack conventions (3) | `hcg-harness/skills/{db,backend,frontend}-conventions/` | **HCG-standard** stack methodology (Prisma/MariaDB · Next.js App Router · TanStack/Zustand/RHF/Zod · feature-centric). No project domain values. |
| Verification hooks (2) | `hcg-harness/hooks/*.mjs` (+ `run-*.mjs` launchers, `hooks.json`) | PostToolUse ESLint + SessionStart context. Instance values (app dir, label) externalized to env — 0 hardcoded project values. |
| Workflow templates (3) | `hcg-harness/workflows/*.js` | `audit` / `migrate` / `test-gen` generic skeletons for dynamic-mode fan-out. |

## Per-project (the consuming project authors)

| Item | Path | Note |
|---|---|---|
| Instance slot | `.claude/project.md` | The single slot — identity, stack, paths, contracts, model assignment, active agents, env keys. Template: `templates/project.md`. |
| Domain skill | `.claude/skills/<domain>/SKILL.md` | Invariant business rules. Added to all 5 shells' `skills:`. |
| Test/E2E skill | `.claude/skills/<e2e>/SKILL.md` | Optional. Added to the front shell. |
| `CLAUDE.md` PROJECT section | `CLAUDE.md` | Project overview + `@.claude/CLAUDE-core.md` import. |
| Contracts | `contracts/*` | The blackboard SSOT (db-schema/api-spec/shared-types/design-guide). |
| App + DB | `apps/web`, `prisma/`, … | The actual product code. |

## Residual install-time seams

Genericized so a fresh install needs **no source edits**, only configuration:

- **App dir** — the lint hook scopes to `apps/web` by default; on a non-monorepo
  or differently-laid-out project set env `POST_EDIT_VERIFY_APP_DIR` (e.g. `.`).
- **Session label** — set env `SESSION_CONTEXT_LABEL` to your project name
  (default `[harness session context]`).
- **Agent skills** — add per-project `<domain>` / E2E skills to the shells'
  `skills:` frontmatter (install.md §2d).

## Drift caveat (additive install)

This package is an additive layer. If a project *copies* the shells/skills into
its own `.claude/` and edits them, those copies **drift** from this package —
edits here do not propagate and vice-versa. Eliminating drift means canonical
adoption (the project consumes the plugin as its single source). Until then,
treat this package as the upstream and re-pull rather than diverging.
