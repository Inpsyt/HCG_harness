# Workflow templates (dynamic-mode fan-out scaffolds)

> **Dynamic-mode workflow templates (additive, non-destructive).**
> Five reusable **Workflow** fan-out templates for the harness's *dynamic
> execution mode* — the mode used when work is **independent · bulk · discovery-
> shaped** (codemods, mass migrations, per-module test generation, read-only
> audits/research, diff reviews, contracts↔code drift reconciliation), as opposed
> to the *static mode* (tightly-coupled features run through the plan→db/be/fe→qa
> pipeline).
>
> These ship inside the portable `hcg-harness` plugin bundle and are **generic,
> runnable skeletons**: the load-bearing `.js` templates carry zero source-project
> paths or domain values (`rg -i "<your project/domain tokens>" --glob '*.js'`
> over this directory → **0 hits**). Project-specific inputs are injected at run
> time via `args` and `.claude/project.md`; every injection point is marked
> `// CUSTOMIZE:` in the source.

| Template | File | Shape | Writes? |
|---|---|---|---|
| `audit` | `audit.js` | read-oriented fan-out: Scope → parallel finders → adversarial verify → synthesize (**fail-closed:** a degraded finder/verifier surfaces `incomplete:true`, never a false-clean — F11; every agent-output is structure-validated before use, so a malformed scope/synthesis is an honest `incomplete`/salvage, never a crash — F5; each finding ELEMENT is validated too, so a malformed finding element is discarded into an honest `incomplete`, never a crash at the verify label — F6; a verifier-supplied `severity` is accepted only if in `ALLOWED_SEVERITIES`, so an out-of-enum severity can't corrupt the `sevRank` sort — F7) | **No file edits** — `agentType:'Explore'` runtime-blocks Edit/Write/NotebookEdit (Bash *not* blocked → shell mutation advisory; set a Read/Grep/Glob-only `AUDIT_AGENT_TYPE` for a hard guarantee) |
| `migrate` | `migrate.js` | bulk codemod: Discover → pipeline transform + **co-located self-check** (worktree-isolated) → aggregate gate (fail-closed; `verify.gates` normalized to an array before any method, so a non-array `gates` fails closed as malformed-gates, never a crash — F13) | Yes — isolated + disjoint |
| `test-gen` | `test-gen.js` | per-module tests: Discover → parallel generate + **co-located suite run** (worktree-isolated) → aggregate (fail-closed) | Yes — isolated + disjoint |
| `review` | `review.js` | read-oriented **code-review** fan-out over a changeset: Scope (resolve diff + dimensions) → parallel reviewers (each finding tagged KIND gating/non-gating per codex D9) → adversarial verify of GATING findings → synthesize a PASS/FAIL gate verdict + non-gating appendix. **Fail-closed:** a degraded reviewer/verifier or an over-cap/dropped dimension forces `verdict:'incomplete'` (never a false PASS); the final verdict is code-overridden to `fail` on any confirmed gating finding. **Deliberately lighter** than audit's multi-round hardening (anti-over-design — §6). | **No file edits** — `agentType:'Explore'` runtime-blocks Edit/Write/NotebookEdit (Bash advisory) |
| `converge` | `converge.js` | read-oriented **contracts↔code drift** reconciliation (Spec Kit `/converge` analog): Scope (locate contract files + map to impl surfaces) → parallel reconcilers (classify each contract requirement `satisfied`/`partial`/`missing`/`contradicts`) → adversarial verify each drift (drop false positives) → synthesize `verdict` (aligned/drift/incomplete) + **proposed reconciliation tasks** for the plan role. **Fail-closed:** degraded reconciler/verifier, over-cap, or **missing contracts/ dir** → `incomplete`, never a false `aligned`. Proposes tasks; does NOT write them. | **No file edits** — `agentType:'Explore'` runtime-blocks Edit/Write/NotebookEdit (Bash advisory) |

---

## 1. Runtime contract (verified, not guessed)

**1st source (real generated scripts):** Claude Code materializes every workflow
run as a self-contained script under the session's project dir
(`~/.claude/projects/<project>/<session>/workflows/scripts/<name>-wf_<runId>.js`)
plus a run record (`workflows/wf_<runId>.json`). The contract below was read
directly from those scripts (e.g. `deep-research-wf_*.js`,
`reset-pw-atomic-phase19-wf_*.js`) and **cross-checked against the Claude Code
CLI 2.1.183 binary's own Workflow-tool API doc** (the strings quoted below are
verbatim from the CLI).

A workflow script is an **ES module** with:

1. **`export const meta`** — a pure object literal at the top of the file:
   ```js
   export const meta = {
     name: 'audit',               // workflow identifier (resolves Workflow({name}))
     description: '…',            // one-line summary
     whenToUse: '…',             // when to invoke + how to narrow scope before invoking
     phases: [{ title, detail }], // declared phases (titles match the phase() calls)
   }
   ```
2. **Top-level body** — the runtime wraps the script in an async function, so the
   body uses **top-level `await`** and **top-level `return`** (early-exit /
   final result) directly. No wrapping function, no `import`s.
3. **Runtime globals** (injected — used without importing). Quoted from the CLI's
   own API description:
   - `agent(prompt: string, opts?: {label?, phase?, schema?, model?, effort?, isolation?, agentType?}): Promise<any>`
     — *"spawn a subagent. Without schema, returns its final text as a string.
     With schema (a JSON Schema), the subagent is forced to call a
     StructuredOutput tool and agent() returns the validated object. Returns
     `null` if the user skips the agent mid-run or the subagent dies on a
     terminal API error after retries (filter with `.filter(Boolean)`)."*
     - `opts.label` — display label · `opts.phase` — progress group (set it inside
       `pipeline()`/`parallel()` stages to avoid racing the global `phase()`
       state) · `opts.model` — per-call model override (omit to inherit) ·
       `opts.effort` — `'low'|'medium'|'high'|'xhigh'|'max'` · `opts.agentType` —
       named subagent type · `opts.isolation` — see §4.
   - `parallel(thunks: Array<() => Promise<any>>): Promise<any[]>` — *"run tasks
     concurrently. This is a BARRIER: awaits all thunks before returning. A thunk
     that throws (or whose agent errors) resolves to `null` in the result array —
     the call itself never rejects, so `.filter(Boolean)` before using the
     results."*
   - `pipeline(items, stage1Fn, stage2Fn, …)` — streaming staged pipeline; each
     stage receives the previous stage's result and runs as upstream items
     complete (no barrier between stages). If a stage returns `null` the item
     stops advancing.
   - `phase(title: string): void` — *"start a new phase; subsequent agent() calls
     are grouped under this title in the progress display."*
   - `log(message: string): void` — *"emit a progress message to the user (shown
     as a narrator line above the progress tree)."*
   - `args` — *"the value passed as Workflow's `args` input, verbatim (undefined
     if not provided)."* The project-specific input channel.
4. The script **`return`s** its final result object.

**Invoke** a discovered workflow by name:
```
Workflow({ name: 'audit' | 'migrate' | 'test-gen' | 'review' | 'converge', args: '<scope / spec>' })
```
(Run an arbitrary script file ad hoc with `Workflow({ scriptPath: '<file>' })`.)

---

## 2. Discovery — confirmed official (CLI 2.1.183)

> **TASK-157 D-4 question:** does a plugin auto-discover a `workflows/` directory,
> or are these copy-and-adapt scaffolds? **Answer: plugins DO auto-discover
> `workflows/` — verified, not guessed.**

Evidence from the installed CLI binary (`@anthropic-ai/claude-code` 2.1.183,
`claude --version` → `2.1.183`):

- A `loadPluginWorkflows` routine loads, per enabled plugin, *"workflows from
  plugin `<name>` **default directory**"* and optionally a *"custom path"* /
  *"custom file"*. The default directory is the plugin root's **`workflows/`**
  folder (`join(pluginRoot, "workflows")`); a manifest **`workflows`** field can
  override it (the validator emits a `folder-shadowed-by-manifest` warning when
  both a `workflows/` folder and a manifest `workflows` field exist).
- Plugin-component validation walks `output-styles/`, `themes/`, **`workflows/`**
  among the plugin-root component dirs, confirming `workflows/` is a recognized
  plugin component directory (alongside the `agents/` · `skills/` · `hooks/`
  already documented in `docs/portable-instance-boundary.md`).
- Project/user-scope discovery also exists: `Workflow({name})` resolves a
  built-in **or** `.claude/workflows/<name>.js` (project) /
  `~/.claude/workflows/<name>.js` (user). The CLI help string for the Workflow
  tool's `name` field: *"Name of a predefined workflow (built-in or from
  `.claude/workflows/`). Resolves to a self-contained script."*

**So this directory is a real auto-discovered plugin component.** When the
`hcg-harness` plugin is installed, `audit` / `migrate` / `test-gen` are
loadable as named workflows. (To surface them, the consuming project may also
need the Workflows feature enabled — it is gated by the managed setting
`disableWorkflows` / env `CLAUDE_CODE_DISABLE_WORKFLOWS`.)

**Residual rung-4 (install-time, environment-dependent):** the *end-to-end* check
— install the plugin, then confirm `audit`/`migrate`/`test-gen` appear via
`claude plugin details hcg-harness` and resolve under `Workflow({name})` in a
live session — requires an installed-plugin context and is therefore a manual
acceptance step, exactly like the component-inventory check for agents/skills
(plugin `README.md` §field-status #4). The *mechanism* above is
documented-correct; only the live inventory smoke is deferred.

> Note on the plugin manifest: `.claude-plugin/plugin.json` does **not** need a
> `workflows` field — that field only **overrides** the default location. With
> the files in the conventional `workflows/` folder, the default loader picks
> them up. (Adding a `workflows` field while keeping the folder triggers the
> `folder-shadowed-by-manifest` validator warning, so we deliberately omit it.)

---

## 3. Using the templates (`// CUSTOMIZE` / injection points)

All three are **generic skeletons**. They run as-is, but become useful by
injecting your project's specifics through `args` (per call) and
`.claude/project.md` (per project). Source markers: `// CUSTOMIZE:` (project
seam) and `// VERIFY` / rung-4 notes (runtime behavior to confirm on first run).

### `audit` (read-only)
```
Workflow({ name: 'audit', args: '<scope or comma-separated dimension list>' })
```
- `// CUSTOMIZE` seams: `DEFAULT_DIMENSIONS` (the audit axes used when the Scope
  agent has no explicit list), `MAX_DIMENSIONS` / `MAX_FINDINGS_VERIFIED` (cost
  caps), `VERIFY_VOTES` (raise from 1 for adversarial multi-vote verification),
  `AUDIT_AGENT_TYPE` (the read-only agent type, default `'Explore'`).
- **`MAX_DIMENSIONS` / `MAX_FINDINGS_VERIFIED` over-cap ⇒ `incomplete:true`, never a silent slice (F4).**
  audit is read-only, so a cap overflow does **not** abort (as the writers do) — instead it is
  **accounted as degraded**. Findings beyond `MAX_FINDINGS_VERIFIED` are carried as `overflowFindings`
  (never verified ⇒ same fail-closed class as `unverified`); dimensions beyond `MAX_DIMENSIONS` are carried
  as `droppedDimensions` (un-audited axes ⇒ same class as a failed finder). Either one forces
  `incomplete:true` and the `stats` report the **pre-cap** `rawFindings` plus `verifiedCandidates` /
  `overflowFindings` / `droppedDimensions`, so a 40+-finding audit can never read as "all refuted" / clean
  while real high-severity findings were silently dropped. Raise the caps deliberately, or narrow the scope.
- **File edits are runtime-blocked (not just prompt-suppressed) — but this is NOT
  an absolute read-only guarantee.** Every audit agent is spawned with
  **`agentType: 'Explore'`** — a *built-in* agent type whose `disallowedTools`
  block Edit / Write / NotebookEdit (and sub-agent spawning), so a tool-selection
  bug or prompt deviation **cannot edit files via those tools**. Verified verbatim
  against the Claude Code CLI 2.1.183 binary (same binary-string method used in
  §1/§4):
  - the CLI registers it as built-in —
    `{ agentType:"Explore", source:"built-in", disallowedTools:[Agent, ExitPlanMode, Edit, Write, NotebookEdit], model:"haiku", … }`;
  - the workflow `agent()` API doc names it as a valid value —
    *"opts.agentType uses a custom subagent type (e.g. 'Explore', 'code-reviewer') … resolved from the same registry as the Agent tool"*;
  - `LAi = new Set(["Explore","Plan"])` and the input-schema example *"Agent type
    identifier (e.g. \"Explore\")"* corroborate it.
  - **One honest residual (so: not a hard guarantee):** Explore's
    `disallowedTools` does **not** include `Bash`, so a mutating shell command is
    still possible and is prevented **only** by the prompt (`READ_ONLY_RULE`, kept
    as defense-in-depth). File mutation (Edit/Write/NotebookEdit) is runtime-
    blocked; **shell mutation is advisory.** For a hard no-mutation guarantee, set
    `AUDIT_AGENT_TYPE` (`// CUSTOMIZE`) to a custom agent type whose tools are
    exactly Read/Grep/Glob (no Bash) — then shell mutation is runtime-blocked too.

### `review` (read-only diff review)
```
Workflow({ name: 'review', args: '<diff range | PR | file scope>' })
```
- `// CUSTOMIZE` seams: `DEFAULT_DIMENSIONS` (review axes), `MAX_DIMENSIONS` /
  `MAX_GATING_VERIFIED` (caps), `VERIFY_VOTES`, `REVIEW_AGENT_TYPE`.
- **KIND split (codex D9):** each finding is tagged `gating` (correctness/safety
  defect OR explicit requirement/`contracts/` violation) vs `non-gating`
  (gap/enhancement/over-design/style). Only confirmed **gating** findings fail the
  gate; non-gating ride the appendix regardless of severity — the same gating
  philosophy as the `codex-review` skill, so an in-harness Claude review and the
  codex gate agree.
- **Fail-closed verdict:** the final `verdict` is code-overridden — `fail` on any
  confirmed gating finding, `incomplete` on any degraded reviewer / unverified
  gating / over-cap / dropped dimension — so a degraded run never reads as a clean
  PASS. Read-only (`agentType:'Explore'`); it does **not** replace your CI.

### `migrate` (bulk codemod — writes)
```
Workflow({ name: 'migrate', args: '<glob to migrate> :: <transformation instruction>' })
```
- `// CUSTOMIZE` seams: `VERIFY_INSTRUCTION` (your build/test/type gate commands),
  `MAX_WORK_ITEMS`.
- **`MAX_WORK_ITEMS` is a fail-closed UPPER BOUND, not a silent truncation (F9).** Discovery must
  return the **complete** set of files needing the change and attest it (`complete=true`); the
  template processes **≤ cap** files. If discovery finds **more** than `MAX_WORK_ITEMS` (or cannot
  prove the list is complete), the run **aborts** (`changesPresent:false`, `error: discovery exceeded
  MAX_WORK_ITEMS (N>cap)`) instead of transforming only the first `MAX_WORK_ITEMS` and reporting a
  partial migration as success. Split a large migration across narrower `args` globs, or raise
  `MAX_WORK_ITEMS` deliberately.
- Write-safety: see §4.

### `test-gen` (per-module tests — writes)
```
Workflow({ name: 'test-gen', args: '<module glob> :: <framework / conventions>' })
```
- `// CUSTOMIZE` seams: `TEST_CONVENTION` (file naming/location),
  `RUN_TESTS_INSTRUCTION` (your test command), `MAX_MODULES`.
- **`MAX_MODULES` is a fail-closed UPPER BOUND, not a silent truncation (F9)** — same contract as
  `migrate`'s `MAX_WORK_ITEMS`. Discovery must return the **complete** module list and attest it
  (`complete=true`); the template processes **≤ cap** modules. If discovery finds **more** than
  `MAX_MODULES` (or cannot prove completeness), the run **aborts** (`generationComplete:false`,
  `error: discovery exceeded MAX_MODULES (N>cap)`) instead of generating tests for only the first
  `MAX_MODULES` and reporting a partial pass as success. Split across narrower `args`, or raise
  `MAX_MODULES` deliberately.
- Write-safety: see §4.

---

## 4. Write-safety + verification-visibility for `migrate` / `test-gen` (D7)

The two writing templates apply **two independent write-safety guarantees** so
parallel writes never collide:

1. **Disjoint file ownership (enforced in logic, canonical + fail-closed).** The
   discovery output is deduped so each agent owns **exactly one distinct physical
   file** — `migrate` dedups by the file `path`, `test-gen` by `testPath`. The
   dedup key is a **canonical** form, not the raw string: a pure
   `canonicalizePath()` helper folds alias spellings of the same file to one key
   (`\`→`/`, collapsed `//`, leading `./` and `.` segments dropped, resolvable
   `..` segments, and case-folding on case-insensitive filesystems via the
   `CASE_INSENSITIVE_FS` `// CUSTOMIZE` flag) so `./src/a.ts`, `src/a.ts`,
   `src\a.ts`, and `src/./a.ts` all collapse to one owner. **Fail-closed:** if two
   work-items canonicalize to the *same* file the run does **not** silently drop
   one and proceed (which would risk applying the change under an ambiguous
   work-list, or two worktrees racing one file) — it **aborts** and returns the
   colliding aliases so the discovery spec can be fixed. **No discovered item is
   ever silently dropped (F10):** the sanitization loop classifies every item into
   exactly one bucket — *queued* / *explicitly-skipped* (`skip:true`) / *unsafe*
   (empty/blank/null/absolute/parent-escape → fail-closed abort) / *canonical
   collision* (fail-closed abort) — and a code-asserted accounting invariant
   (`queued + skipped + unsafe + collision == discovered`) aborts the run if any
   item escapes accounting, so an empty path (which passes the schema's string
   `required`) can never quietly shrink the work-list into a partial migration. The
   helper is **pure** (no I/O), so this dedup is dry-run testable. *Limitation:* it
   is string-only — the
   no-`import` workflow runtime (§1) cannot resolve symlinks / realpath or make
   absolute paths repo-relative, so discovery is additionally instructed to emit
   repo-relative POSIX paths to shrink the alias surface at the source.
2. **Worktree isolation (official `agent()` option).** Each writing agent is
   spawned with **`isolation: 'worktree'`**, a recognized `agent()` option
   (verified verbatim against CLI 2.1.183): *"opts.isolation: 'worktree' runs the
   agent in a fresh git worktree — EXPENSIVE (~200-500ms setup + disk per agent),
   use ONLY when agents mutate files in parallel."* This is exactly the
   parallel-mutation case, so the templates set it on the transform/generate
   agents (and only those). The other valid value is `'remote'`; the default
   (omitted) runs in the shared tree.

### Worktree merge-back semantics — **confirmed** (CLI 2.1.183 binary)

Read directly from the CLI binary's own `agent()`/Workflow API strings (same
binary-string cross-check method used elsewhere in this Phase):

- *"`isolation: "worktree"` gives the agent its own git worktree (auto-cleaned if
  unchanged)."*
- *"With `isolation: "worktree"`, the worktree is automatically cleaned up if the
  agent makes no changes; otherwise the path and branch are returned in the
  result."* (result fields `worktreePath` / `worktreeBranch` — both names read
  verbatim from the binary).
- The isolated agent is told: *"You are operating in an isolated git worktree at
  `<path>`. Edit the worktree copy of this file instead of the shared-checkout
  path."*
- **Capturing those coordinates.** A schema-set `agent()` returns **only** the
  validated structured-output object (binary-confirmed: the workflow `agent()`
  does `if (schema) return parsed` — the remote path reads literally
  `…ne.schema)return p(he);return Ae`), so the runtime's worktree path/branch are
  **not guaranteed to be merged into a schema result**. The templates therefore
  have each transform agent **self-report** `worktreePath` / `worktreeBranch` in
  its schema (it is told its worktree path and reads its branch via `git rev-parse
  --abbrev-ref HEAD`), and additionally spread any runtime-injected fields
  defensively (`{...r}`) — the field names match the official ones, so they align
  if the runtime does inject them.

**Conclusion: there is NO automatic merge-back into the shared checkout.** An
isolated agent's edits stay in a separate worktree + branch; a *default*
(shared-tree) agent spawned afterwards does **not** see them. So a verification
step run by a separate shared-tree agent would inspect the **pre-mutation tree**
and could green-light broken or absent output. The templates are designed around
this fact:

- **Co-located verification (merge-back-independent).** The *same*
  worktree-isolated agent that mutates a file also verifies it **in its own
  worktree**, where the edit definitely exists: `migrate`'s transform agent
  re-reads and sanity-checks the file it just edited; `test-gen`'s generator
  **runs that module's suite** in the same worktree. No merge-back needed for the
  per-item correctness signal.
- **Fail-closed (no silent green).** An item is trusted only if the worktree
  *proves* the write landed: `migrate` requires `changedPresent === true` and a
  passing co-located `check` or the item is demoted to `failed`; `test-gen`
  requires `generatedPresent === true` **and** self-reported worktree coordinates
  (`worktreePath`/`worktreeBranch` — without them the generated file cannot be
  merged back and would be lost on cleanup) or the module is `failed`. A module
  whose co-located suite reports no pass is counted **red**, never green.
- **`migrate`'s aggregate gate** (full build/test/type across *all* migrated
  files) inherently needs every file in one tree, so it **requires merge-back as
  an explicit precondition** (`MERGE_BACK_INSTRUCTION`, a `// CUSTOMIZE` seam —
  the exact merge command is CLI-version specific). The gate prompt is given **each
  changed item's `worktreeBranch` / `worktreePath`** so it knows *which* branch /
  worktree to merge (without them it could not locate the edits to land). Before
  trusting any gate result it **asserts the migration is present** in the gated
  tree (`changesPresent`); if the tree is unmigrated (the symptom of gating the
  pre-migration tree) **or any changed item lacks its worktree coordinates**
  (un-materializable — tracked as `stats.unmergeable`), the gate **fails closed**
  (`changesPresent` is forced `false` regardless of the agent's claim).
- **`test-gen` does not re-run in the shared tree at all.** Its `Verify` phase
  only *aggregates* the co-located per-module results — there is no shared-tree
  suite run that would miss the worktree-isolated files. **But the generated test
  FILES still need merge-back** (that is the backfill goal): each generated file
  lives only in its module's worktree and the runtime does not auto-merge it, so
  every generated module **carries its `worktreeBranch` / `worktreePath`** to the
  result and the run surfaces an explicit merge-back precondition (`MERGE_BACK_NOTE`)
  for the caller to materialize them. A generated module that self-reports **no
  worktree coordinates** is un-materializable (the file would be lost on cleanup),
  so it is demoted to `failed` — `generationComplete` then counts only
  coordinate-bearing generation. (test-gen has no aggregate gate, so the
  coordinates + precondition ride the **result**, not a gate prompt — the per-module
  analog of `migrate`'s `stats.unmergeable` → fail-closed.)
- **Single-file write-scope — merge-back never trusts the whole worktree (F7,
  code-level + fail-closed).** Disjoint ownership and the prompt assign each agent
  *one* file, but a writing agent could still edit/create files **beyond** its
  assigned one inside its worktree (or self-report a branch carrying extra
  mutations). Because the expected file *also* changed, a naive presence check would
  still pass and a blanket whole-branch merge-back would drag the **unrelated**
  mutations into the merged tree (single-file contract broken; unrelated files
  corrupted). So each writing agent **self-reports `changedFiles`** (every path it
  modified in its worktree) and the reconciliation **code-checks that set is exactly
  its one owned path** (`migrate` → `[path]`, `test-gen` → `[testPath]`), reusing
  `canonicalizePath` + `repoRelativeViolation`: **extra / missing / absolute /
  retargeted** demotes the item to `failed` (fail-closed — never merged; for
  `migrate` `failed>0` also forces `changesPresent=false`). The merge / gate prompts
  additionally **prefer a path-scoped apply** (land **only** the owned path, e.g.
  `git checkout <worktreeBranch> -- <path>`) over a whole-branch merge, and the
  presence assertion re-confirms no out-of-scope file landed. **Honest cap:** the
  *actual* VCS apply is a `// CUSTOMIZE` seam the consuming project wires to its
  runtime — these templates provide the **scope verification + fail-closed
  structure**, not an automatic whole-branch merge (the same honesty as `audit`'s
  read-only being runtime-blocked for file edits but advisory for shell).

**Operational note (test-gen co-located run):** running a suite inside a fresh
worktree may need dependencies present there. Claude Code can symlink dirs from
the main repo into worktrees (the worktree symlink/`includeFiles` setting — e.g.
`"node_modules"`, `".cache"`); configure it for your repo so the co-located run
resolves deps.

**Residual rung-4 (first-run check):** the *exact merge-back command* for
`migrate`'s aggregate gate (how to land each `worktreeBranch` into the gate tree
on your CLI version) is the one seam to confirm on your first real run — but it is
now guarded: if merge-back is missing or wrong, the gate's presence assertion
fails closed rather than shipping a false green.

---

## 5. Verification status (Phase 33 / D-5)

In-session checks performed (rung-2/-3):

- **Syntax** — top-level `return`/`await` make raw `node --check` fail with
  *"Illegal return statement"*, so each template was verified two ways actually
  run in-session: (a) the body is wrapped in `(async () => { … })()` and passes
  `node --check` (all 3 templates OK), and (b) the `export const meta` literal is
  loaded via ESM `import()` (all 3 OK; keys `name`/`description`/`whenToUse`/
  `phases`). Anti-overfit confirmed: a deliberately broken body is rejected by
  `node --check`. (An `acorn` parse with `{ allowReturnOutsideFunction:true,
  allowAwaitOutsideFunction:true, sourceType:'module', ecmaVersion:'latest' }` is
  an **equivalent alternative** that checks the whole file in one pass, but is
  **not required** and was not run here — `acorn` is not installed in this
  environment.)
- **`meta` structure** — each file's `export const meta` is a pure literal with
  `name` / `description` / `whenToUse` / `phases:[{title,detail}]`, and the
  `meta.phases` titles match the `phase()` calls 1:1 (AST-checked).
- **Canonical dedup (dry-run, rung-3)** — `canonicalizePath()` (identical in
  `migrate.js` and `test-gen.js`) was extracted and exercised on alias cases:
  `./src/a.ts`, `src\a.ts` (real backslash bytes), `src/./a.ts`, `src/b/../a.ts`,
  `src//a.ts`, and `SRC/A.ts` (on this win32 host) all fold to one key, while
  genuinely distinct files (`src/a.ts` vs `src/b.ts`, `a.ts` vs `../a.ts`, absolute
  vs relative) stay distinct. The dedup loop was simulated: an aliased pair / triple
  reports a **collision** (fail-closed abort), a distinct pair keeps both, and
  empty/`.`/blank paths are skipped — all PASS.
- **Worktree-coordinate propagation + merge fail-closed (`migrate`, dry-run,
  rung-3)** — the `migrate` body was wrapped and run with stubbed
  `agent`/`parallel`/`pipeline` over two scenarios. *(a) happy:* both transform
  agents report `worktreePath`/`worktreeBranch`; the coordinates land in the
  result's `changed[]`, the aggregate-gate prompt lists each file's
  `worktreeBranch` (so the gate knows which branch to merge), `stats.unmergeable=0`,
  and `changesPresent=true`. *(b) missing-coords:* one transform agent omits its
  coordinates and the verify agent *lies* (`changesPresent:true`) — the workflow
  still forces final `changesPresent=false` (`stats.unmergeable=1`,
  verdict "1 changed file(s) lack worktree coordinates; cannot merge back"), and
  the gate prompt shows the `MISSING — cannot merge` marker for that file. Both PASS
  (fail-closed proven).
- **Worktree-coordinate propagation + merge fail-closed (`test-gen`, dry-run,
  rung-3)** — the `test-gen` body was wrapped and run with stubbed
  `agent`/`parallel` over three scenarios (mirrors the `migrate` proof above, since
  `test-gen`'s generated files also need merge-back). *(S1) happy+red:* a green and a
  **red** generator both report `worktreePath`/`worktreeBranch` (plus a `skipped`
  module) — both land in `generated[]` carrying their coordinates, the **red** suite
  stays `generated` with `passed:false` (a legitimate result, not a generation
  failure — F6), `failed=0`, `generationComplete=true`, and the `mergeBack`
  precondition is surfaced. *(S2) coordless-only:* a module reports
  `status:'generated'` **without** coordinates — it is demoted to `failed` (reason
  "generated test file lacks worktree coordinates"), `generated=[]`,
  `generationComplete=false`. *(S3) mixed:* a coord-bearing module stays
  `generated[]` (with coords) while a coordless one is demoted to `failed` and flips
  `generationComplete=false`; `mergeBack` surfaced. All PASS (fail-closed proven;
  coordinate-less generation can never read as a silent green).
- **Single-file write-scope guard (F7, both writers, dry-run, rung-3)** — both
  bodies were wrapped (real source bytes, stubbed `agent`/`parallel`/`pipeline`) and
  run over scoped scenarios; each writing agent now self-reports `changedFiles` and
  the reconciliation code-checks it equals exactly the owned path. *(happy + alias +
  skipped):* an agent reporting `changedFiles:['./src/a.ts']` for owned `src/a.ts`
  still PASSES (canonical equivalence), a `skipped` item needs no `changedFiles`, and
  the run reaches `changesPresent=true` / `generationComplete=true`. *(extra file):*
  `changedFiles:[owned,'…/evil.ts']` → that item demoted to `failed` ("worktree
  changed 2 files…"), and for `migrate` `changesPresent` is forced `false`
  (failed>0), for `test-gen` `generationComplete=false`. *(absolute):* `['/etc/
  passwd']` → fail-closed ("changed file outside the repo… absolute path").
  *(retargeted):* a single different file → fail-closed ("retargeted scope").
  *(missing):* no `changedFiles` on a changed/generated item → fail-closed ("no
  changedFiles list reported"). **17/17 assertions PASS** across `migrate` + `test-gen`
  (extra/absolute/retargeted/missing all blocked from merge-back; alias still
  accepted — anti-overfit). The *actual* VCS path-scoped apply remains a
  `// CUSTOMIZE` seam (honest cap, see §4) — verified here is the **scope check +
  fail-closed structure**, not an automatic whole-branch merge.
- **Cap-overflow fail-closed (F9, both writers, dry-run, rung-3)** — the work-item / module cap is now
  a fail-closed upper bound, not a silent `slice(0, cap)`. Both bodies (real source bytes, stubbed
  `agent`/`parallel`/`pipeline`) were run over cap scenarios. *(≤cap + complete):* a within-cap
  discovery with `complete:true` proceeds normally to Transform/Generate (`changesPresent` /
  `generationComplete` reachable). *(>cap):* a discovery returning `cap+1` deduped items **aborts**
  before any transform/generate agent is spawned — `error` carries `exceeded MAX_WORK_ITEMS (N>cap)` /
  `exceeded MAX_MODULES (N>cap)`, `changesPresent:false` / `generationComplete:false`, `discovered:N`,
  `cap`, and `changed`/`generated` are empty (no subset processed). *(incomplete):* a ≤cap discovery
  with `complete:false` (or missing) **aborts** the same way (`complete !== true`). The `DISCOVER_SCHEMA`
  arrays dropped `maxItems` so the overflow is observable rather than schema-clamped (anti-overfit: the
  ≤cap+complete path still reaches the happy result, so the guard is not a blanket block). All PASS
  (over-cap / incomplete can never silently truncate to a partial migration reported as success).
- **Audit cap-overflow accounting — silent-truncation class closed (F4, `audit`, dry-run, rung-3).** The
  read-only `audit` template's caps were the last silent `slice(0, cap)` in the three templates: findings
  past `MAX_FINDINGS_VERIFIED` (40) were dropped from the workflow entirely — never verified, never counted
  in `stats.rawFindings`, never able to flip `incomplete` — so a 40+-finding audit could report "all
  refuted" / a clean subset while real high-severity findings vanished. Now every cap is **fail-closed
  accounting**, not a drop: over-cap findings → `overflowFindings` (same class as `unverified`), over-cap
  dimensions → `droppedDimensions` (same class as a failed finder), both forcing `incomplete:true`; `stats`
  report **pre-cap** `rawFindings` + `verifiedCandidates` + `overflowFindings` + `droppedDimensions`. The
  real body (stubbed `agent`/`parallel`) was run over 4 scenarios: *(50 findings, cap 40):* `rawFindings:50`,
  `verifiedCandidates:40`, `overflowFindings:10`, `incomplete:true`, summary `INCOMPLETE` (not "all
  refuted"). *(10 dimensions, cap 8, 0 findings):* `droppedDimensions:['d8','d9']`, `incomplete:true`,
  summary `INCOMPLETE` (not the clean "No findings"). *(25 findings ≤cap)* and *(5 dims, 0 findings,
  genuine clean):* `incomplete` unset, no `overflowFindings`/`droppedDimensions` field — anti-overfit, the
  ≤cap path is not falsely flagged. `migrate` / `test-gen` were re-checked: their `MAX_WORK_ITEMS` /
  `MAX_MODULES` already **abort** fail-closed (F9, the writer-appropriate mode) with no surviving silent
  `slice` — confirmed, unchanged. All PASS.
- **Discovery accounting — silent-drop class closed (F10, both writers, dry-run, rung-3)** — the
  discovery-sanitization loops no longer `continue`-drop a falsy `path`/`testPath` *before* the safety
  gate (an empty string passes the schema's string `required`, so the old `if (!it.path) continue`
  silently discarded a work-item and could ship a partial migration as success). Every discovered item
  is now classified into **exactly one** bucket — *queued* / *explicitly-skipped* (`skip:true`) /
  *unsafe* (fail-closed abort) / *canonical-collision* (fail-closed abort) — and a code-asserted
  **accounting invariant** (`queued + explicitly-skipped + unsafe + collision == discovered`) fails the
  run closed if any item escapes accounting. Both bodies (real source bytes, stubbed
  `agent`/`pipeline`/`parallel`) were run over 46 assertions. *(empty / null / blank / absolute /
  parent-escape path):* routed to `unsafePaths` and **abort** before any transform/generate agent
  (`error` "not safe repo-relative … empty/missing/blank …", spawn count 0). *(explicit skip):* a
  `skip:true` item is **not queued** (one fewer agent spawned) and is **accounted** as
  `discoverySkipped` (`stats.discovered` counts it; `stats.queued` / `discoverySkipped` split shown),
  never dropped. *(forced mismatch):* an array-like discovery whose reported `length` exceeds the
  iterated count makes the buckets under-sum → the invariant **fires** ("accounting invariant violated:
  1 of 3 … escaped accounting", spawn 0) — proving the structural guard catches a hypothetical future
  drop, not just today's empty-path symptom. *(all-valid / over-cap / incomplete):* the invariant does
  **not** false-fire — valid lists proceed, and F9's over-cap / `complete!==true` aborts still fire
  (anti-overfit: guard is not a blanket block). All 46 PASS.
- **Audit fail-closed — degraded finder/verifier never reads as clean (F11, `audit`, dry-run, rung-3)** —
  the `audit` body was wrapped (real source bytes, stubbed `agent`/`parallel`/`phase`/`log`) and run over
  10 finder/verifier degradation scenarios (**42 assertions**), mirroring migrate/test-gen's F11
  degraded-discovery handling to complete the 3-template fail-closed parity (`audit` was the remaining
  template whose degraded agents could be reported as a false-clean). *(all finders null):* every finder
  skipped/died → `incomplete:true`, summary "all N finder(s) failed", `failedDimensions` = all — NEVER the
  old "No findings across N dimensions" clean. *(some finders null):* `incomplete:true` + the failed-
  dimension list (the surviving finders' empty result is not reported as a clean audit). *(all finders valid
  + 0 findings):* GENUINE clean — `summary:"No findings across N dimensions."`, no `incomplete`,
  `stats.failedDimensions=0` (anti-overfit: the guard does not false-fire on a real clean). *(verifier null
  / malformed vote):* the candidate is `unverified` (tracked + `incomplete:true`), NOT folded into
  "refuted" — the old `filter(Boolean)` + all-confirm logic reported an un-checked candidate as a refuted
  false-positive (a real issue silently dropped). *(genuine refute, all finders ok):* clean "All N candidate
  findings were refuted on verification", no `incomplete` (anti-overfit). *(thrown finder):* a finder whose
  outer thunk null-resolves is recovered by index and counted as a FAILED dimension (never a silent drop); a
  confirmed finding from another dimension still lands, with `incomplete:true` propagated into the final
  synthesized report (summary prefixed "Audit INCOMPLETE (degraded run …"). *(synthesis skipped):* the
  salvage exit still spreads the degradation (`incomplete:true` + `unverified`). **All 42 PASS** —
  read-only, so the run does not abort; instead the RESULT honestly reflects the degradation (`incomplete`,
  `failedDimensions`, `unverified`) so a caller can tell a false-clean from a genuine clean.
- **Audit agent-output consumption guards — crash-class closed (F5, `audit`, dry-run, rung-3).** The
  fail-closed guards (F11/F4) protected against *degraded* finder/verifier *results*, but a malformed
  *scope* output could still HARD-CRASH the run before any accounting: the old
  `scope && scope.dimensions && scope.dimensions.length` test treated a truthy `.length` as proof of an
  array, so a non-array carrier (e.g. a string) passed it and then threw on `scopedDimensions.slice().map()`
  — turning a degraded scope into an exception instead of an honest `incomplete`. The fix validates every
  agent-output **before** any array/object method touches it: the scope's `dimensions` is `Array.isArray`-
  checked (and its elements checked for string `label`/`focus`) → a malformed scope returns
  `incomplete:true` + `error:'malformed-scope'` (never silently falling back to defaults, never throwing),
  while `scope==null` / `dimensions` null/empty still falls back to `DEFAULT_DIMENSIONS` (the accepted
  read-only fallback); the synthesis report is guarded `Array.isArray(report.findings)` before
  `report.findings.length` so a malformed synthesis routes to the salvage exit instead of throwing.
  (Finder/verifier consumption was already index-recovered + `Array.isArray`-guarded — F11/F4 — re-confirmed
  unchanged.) The real body (stubbed `agent`/`parallel`) was run over 9 scenarios (**29 assertions**):
  *(dimensions `'bad'` — non-array truthy length)* and *(dimensions array with a label-only element)* →
  `incomplete:true` + `error:'malformed-scope'`, **no crash**; *(scope `{}` / `null` / `{dimensions:[]}`)* →
  fallback to the 5 default axes, genuine clean, no crash; *(normal 1-dim scope)* → clean across 1 dimension;
  *(synthesis returns `{summary}` with no findings array)* and *(synthesis `null`)* → salvage exit returns the
  verified findings unmerged, no crash; *(synthesis valid)* → success path reads `report.findings.length`
  cleanly (anti-overfit — the guard does not divert a valid report). **Anti-overfit RED proven** (separate
  harness): restoring the pre-F5 lines makes the non-array-scope case throw
  `scopedDimensions.slice(...).map is not a function` and the malformed-synthesis case throw
  `Cannot read properties of undefined (reading 'length')` — both crashes the fix removes. All 29 PASS.
- **Audit element-level finder validation — crash-class closed at the element grain (F6, `audit`, dry-run,
  rung-3).** F5 closed the *array-level* crash (a non-array `dimensions`/`findings`); F6 closes the
  *element-level* one: an array `findings` does **not** prove each ELEMENT is well-formed. A degraded finder
  returning `findings:[{}]` / `[{title:123}]` / an element missing a required field or carrying an
  out-of-enum severity passed the old `Array.isArray(r.findings)` check, was counted as an auditable
  candidate, and then **threw** at the verify label `f.title.slice(0,30)` (or mis-sorted on
  `sevRank[severity]`) — a degraded finder becoming a HARD CRASH instead of an honest incomplete. The fix
  re-validates every element against `FIND_SCHEMA`'s per-element contract (string `title`/`severity`/
  `location`/`evidence` + severity in the schema enum) **before** it flows downstream: well-formed elements
  are kept, malformed ones are **never passed to verify/synthesis** but tracked in a `malformedFindings`
  bucket that forces `incomplete:true` (same fail-closed class as `unverified`/`overflowFindings`), and the
  verify label is additionally `String(f.title).slice(…)` (belt-and-suspenders so the codex-named crash site
  is crash-0 unconditionally). The real body (stubbed `agent`/`parallel`) was run over the codex-recommended
  regression set (**35 assertions**): *(`findings:[{}]`)*, *(`[{title:123}]`)*, *(`[{title:'x'}]`)*, *(invalid
  severity)* → each **no crash**, `incomplete:true`, `stats.malformedFindings` counted, routed to the
  degraded summary (not `malformed-scope`); *(mixed valid+malformed)* → the valid finding still reaches
  verify (`String(f.title).slice`) and is **confirmed** (not dropped — anti-overfit), the 2 malformed are
  accounted (`incomplete:true`, `rawFindings` counts only the 1 valid); *(all-valid)* → **not** incomplete,
  `malformedFindings:0`, no `malformedFindings` field, both findings confirmed (anti-overfit — valid elements
  are never misclassified). RED demonstration: the bare `({}).title.slice(0,30)` the gate routes around does
  throw. All 35 PASS.
- **Final defensive sweep — every agent-output consumption point guarded; crash-class structurally closed
  (F13 `migrate` + F7 `audit`, dry-run, rung-3).** The last two unguarded method-calls on raw agent output
  were closed and the whole class swept across all three templates. *(F13, `migrate.js`):* the aggregate-gate
  fold trusted a **truthy** `verify.gates` to be an array — a degraded verify agent returning `gates` as
  `{}` / a string / any non-array truthy value made `verify.gates.filter(...)` **throw** (`{}.filter is not a
  function`) before the fail-closed `changesPresent=false` branch could run (a recoverable gate-evidence
  failure became a HARD CRASH). Fixed by **normalizing first** — `gatesMalformed = !!(verify && verify.gates
  != null && !Array.isArray(verify.gates))`, `gates = Array.isArray(verify.gates) ? verify.gates : []`, totals
  computed from `gates`, each element guarded (`g && g.passed`) — a present-but-non-array `gates` forces
  `gatesAllPassed=false` (⇒ `changesPresent=false`) with a distinct **malformed-gates** verdict + a
  `stats.gatesMalformed` flag, never a crash. *(F7, `audit.js`):* the verifier vote's optional `severity`
  was accepted on **truthiness alone** — a degraded verifier returning `{confirmed:true, severity:'bogus'}`
  replaced the finding's validated severity, and `sevRank['bogus']` is undefined ⇒ the synthesis sort
  comparator goes NaN (ranking corrupted) and the salvage exit could return the invalid-severity finding.
  Fixed by accepting a verifier severity **only if it is in `ALLOWED_SEVERITIES`** (the same enum every
  finding's own severity is validated against); an invalid one is ignored and the finding keeps its
  already-validated `f.severity`, so a surviving finding always carries an enum-valid severity (sevRank never
  undefined) — a legitimate enum-valued down/upgrade is still accepted. *(sweep):* every remaining agent /
  structured-output consumer in all three templates (`discovery.items`/`modules`, `results`/`genResults`,
  `scope.dimensions`, finder `r.findings`, `verdicts`, `verify.gates`) was grep-audited to confirm an
  `Array.isArray` / null / `typeof` / enum guard (or normalization) precedes every `.filter` / `.map` /
  `.length` / property method — F13/F7 were the last two gaps; the rest were already guarded by F5/F10/F11/F12
  (`test-gen` unchanged — no `verify.gates` analog; its `verification` object is built from the validated
  `made` results). The real bodies (stubbed `agent`/`parallel`/`pipeline`) were run over the sweep
  regression set (**25 assertions**): migrate `verify.gates`=`{}`/string → **no crash**, `changesPresent:false`,
  `gatesMalformed:true`, malformed verdict; `gates:null` (absent ≠ malformed) → no crash, `changesPresent:false`,
  `gatesMalformed:false`, "no gates reported"; valid all-passed → `changesPresent:true`, "2/2" (anti-overfit,
  not flagged); `gates:[null,{passed:true}]` → no crash, 1/2 (element guard); audit verifier `severity:'bogus'`
  → **no crash**, surviving severity stays `high` ('bogus' never reaches the synthesis block); valid `'low'`
  downgrade accepted (anti-overfit); no-severity vote → keeps `f.severity`. **RED proven (2/2):** restoring the
  pre-F13 lines makes `gates={}` throw `verify.gates.filter is not a function`, and the pre-F7 line lets
  `'bogus'` into the synthesis block (`sevRank['bogus']` undefined). All 25 PASS — **objective met: no raw
  agent output is method-called without validation in any of the three templates.**
- **File-edit enforcement (`audit`)** — `agentType: 'Explore'` is set on every
  `audit` agent; `Explore` is a *built-in* agent type whose `disallowedTools` block
  Edit/Write/NotebookEdit, verified verbatim from the CLI 2.1.183 binary and the
  workflow `agent()` API doc (see §3). This makes file mutation a runtime guarantee,
  not prompt-only. **Honest residual:** Explore does not block Bash, so shell
  mutation stays advisory (see §3) — `audit` is not an absolute read-only guarantee.
- **Generic** — `rg -i … --glob '*.js'` over the load-bearing `.js` templates
  for source-project paths/domain values → **0 hits**. (A directory-wide `rg`
  without `--glob` matches only this README's own quotation of the pattern —
  self-reference, excluded from the count.)

Out-of-session (rung-4, environment-dependent): a real large fan-out run, and the
installed-plugin discovery smoke (§2). These need a live Claude Code + cost/disk
budget and are documented, not executed in-session.

---

## 6. Known limitations (prototype templates)

These are **hardened starting-point templates, not a production codemod / test-gen
engine.** They are deliberately honest about what they do and do **not** guarantee
so a consuming project can wire them up with eyes open rather than mistaking the
fail-closed scaffolding for a turnkey, fully-verified migration tool.

- **Templates, not a finished engine.** Every project-specific seam is marked
  `// CUSTOMIZE` (gate commands, merge-back/apply mechanism, file naming, caps,
  case-sensitivity). The consuming project **owns** customizing and re-verifying
  them for its stack — the templates ship the *structure*, not your project's
  exact behavior.
- **Agent-driven, with self-reported results.** The load-bearing phases —
  discovery, transform, generate, and the per-item/aggregate checks — are
  performed by **agents**, which **self-report** what they did (the work-list and
  its `complete` attestation, `changedPresent`/`generatedPresent`, the co-located
  `check`/suite result, `changedFiles`, and the `worktreePath`/`worktreeBranch`
  coordinates). The templates layer **multiple code-level fail-closed guards** over
  that self-reported data — the discovery 3-way split (missing/malformed →
  hard-error, empty must be `complete`-attested to no-op, else abort — F11), the
  accounting invariant (F10), the cap-overflow + completeness aborts (F9), the
  single-file write-scope check (F7), the unmergeable/coordinate guards (F3), the
  partial-migration guards (F6), and the explicit all-gates-passed fold (F8). **But
  these guards constrain and cross-check the self-reported data; they cannot, on
  their own, prove an agent actually did on disk exactly what it reported.** That
  ultimate guarantee is **prompt-driven** by nature and rests on **runtime / VCS
  verification** outside the template.
- **Merge-back / apply is yours to implement.** The runtime does **not** auto-merge
  worktree writes (see §4), and the *actual* VCS apply (path-scoped
  `git checkout <branch> -- <path>` / patch application) is a `// CUSTOMIZE` seam.
  The consuming project must implement merge-back **with its own VCS** and run a
  **final verification in CI** over the merged tree — the templates' aggregate gate
  asserts presence/scope and fails closed on a false green, but it is not a
  substitute for your CI re-running build/test/type on the landed result.
- **What is guaranteed vs. what remains (sharp line):**
  - **Guaranteed by code here (fail-closed structure):** degraded/malformed/empty-
    unattested/over-cap/incomplete discovery → abort, never a silent no-op success
    (F9/F10/F11); no discovered item silently dropped (accounting invariant, F10);
    each worktree changed exactly its one owned path or the item is demoted to
    failed and never merged (F7); a changed item without worktree coordinates is
    un-materializable → fail-closed (F3); any failed transform or any failed/absent
    aggregate gate forces the success boolean false (F6/F8); a degraded `audit`
    finder/verifier (null/malformed/skipped/thrown) is tracked as an un-audited
    dimension / unverified candidate and surfaces `incomplete:true` — never a
    false-clean (F11, completing the 3-template parity); every `audit` agent-output
    consumption point validates structure (`Array.isArray`/null) **before** any
    array/object method, so a malformed scope/synthesis becomes an honest
    `incomplete` / salvage result, never a hard crash (F5), and each finding ELEMENT
    is re-validated against `FIND_SCHEMA`'s contract so a malformed finding element
    is discarded into a tracked `malformedFindings` / `incomplete:true` rather than
    crashing at the verify label (F6 — element-level defensive-validation complete);
    `migrate`'s aggregate gate normalizes `verify.gates` (`Array.isArray ? gates : []`)
    before any array method, so a non-array `gates` fails closed as **malformed-gates**
    (`changesPresent=false`) instead of throwing on `.filter`, and `audit` accepts a
    verifier-supplied `severity` only if it is in `ALLOWED_SEVERITIES`, so an
    out-of-enum severity can never corrupt the synthesis `sevRank` sort (F13/F7 —
    completing the sweep: **no raw agent output is method-called without a structure /
    enum guard in any of the three templates**); `audit` file edits are runtime-blocked
    via `agentType:'Explore'` (§3).
  - **Remaining (your responsibility — customization + runtime trust):** the
    **agent's honesty** about its own self-reported fields, and the **actual
    merge-back/apply + final CI verification** of the landed changes. These are
    customization + runtime/VCS concerns the consuming project wires and validates,
    not properties the prompt-driven templates can prove by themselves.
  - **`audit` schema caps (documented residual, not code-effective):** unlike
    `migrate`/`test-gen` discovery (which dropped schema `maxItems` in F9 so overflow is
    observable to code-level accounting), `audit`'s scope/finder structured-output schemas
    still carry `maxItems` (`MAX_DIMENSIONS`; 15 findings/finder). For an audit exceeding
    those, the agent output can be schema-clamped **before** F4's code-level overflow
    accounting (`overflowFindings`/`droppedDimensions`/`incomplete`) sees it, so a very
    broad audit may report over only the schema-admitted subset. F4 still catches the
    post-schema `.slice` overflow; the residual is the schema-level clamp. A consuming
    project hardening `audit` for breadth should remove these `maxItems` (mirroring F9) or
    add `complete`/`overflow` fields to scope/finder outputs. Flagged by codex round 20;
    documented, not fixed — a deliberate prototype over-investment cap after 20 adversarial
    review rounds established this as a non-terminating defensive-hardening class.
