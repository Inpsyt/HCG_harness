# HCG Harness

A portable, multi-agent **development harness** for HCG projects, packaged as a
Claude Code plugin. It carries the process methodology and HCG-standard stack
conventions so a new project gets the full pipeline by filling **one instance
slot** (`.claude/project.md`) + a domain skill — no harness re-authoring.

Extracted from an existing in-repo harness and re-aligned to the **HCG
standard stack** (Next.js App Router · MariaDB + Prisma · TanStack Query /
Zustand / React Hook Form / Zod · feature-centric structure). See
`HCG-Framework.md` (one level up) for the full HCG standard.

## What's inside

```
hcg_harness/                         # repo = single-plugin marketplace
├─ .claude-plugin/marketplace.json   # hcg-harness-marketplace
├─ hcg-harness/                      # the plugin (hcg-harness)
│  ├─ .claude-plugin/plugin.json
│  ├─ CLAUDE-core.md                 # HARNESS methodology core (pipeline · fast-path · Operating Rules §0–§5)
│  ├─ agents/                        # 5 generic role shells: plan · qa · db · backend · front
│  ├─ skills/
│  │  ├─ pipeline-phase · codex-review · verification-ladder · contract-authoring  # process (stack-neutral)
│  │  └─ db- · backend- · frontend-conventions                                     # HCG-standard stack
│  ├─ hooks/                         # PreToolUse contracts+destructive guard · PostToolUse lint · SessionStart context · Stop phase-gate (+ launchers · *.test.mjs)
│  └─ workflows/                     # audit · migrate · test-gen · review (dynamic-mode templates)
├─ templates/project.md              # the instance-slot template (HCG defaults)
└─ docs/
   ├─ install.md                     # install + fill-the-slot guide
   └─ portable-instance-boundary.md  # portable vs per-project split
```

## The model

- **Portable** (this package): pipeline ①–⑥, fast-path gates + MoSCoW scope
  discipline, verification ladder, codex review gate, a contracts write-lock +
  destructive-command guard (PreToolUse), and HCG-standard db/backend/frontend
  conventions.
- **Per-project** (the consuming repo): `.claude/project.md` (the one slot), a
  domain skill, `contracts/*`, and the app code.

The 5 agent shells are **generic, de-instanced templates** — they hold no
project domain strings; they point at `project.md` and the domain skill, which
the consuming project authors.

## Install (quick)

```bash
claude plugin marketplace add <path-to>/hcg_harness
claude plugin install hcg-harness@hcg-harness-marketplace
# then: copy templates/project.md → .claude/project.md and fill it in
```

Full steps (including the copy-only fallback and instance-slot authoring):
**`docs/install.md`**.

## Customizing the stack

The `*-conventions` skills encode the HCG standard stack. If a project diverges
(different ORM, DB, or state libraries), edit those three skills — they are the
single place stack methodology lives. Paths and domain rules never go in the
skills; they go in `.claude/project.md` and the domain skill.
