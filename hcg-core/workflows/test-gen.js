export const meta = {
  name: 'test-gen',
  description:
    'Per-module test generation fan-out — discover the modules that need tests, then for each module (one agent per module, disjoint output files) generate its test file AND run that module\'s suite inside the same isolated git worktree, reporting per-module green/red. Co-located generate+run so parallel writes never collide and verification always sees the generated files.',
  whenToUse:
    'When you want to bootstrap or backfill unit tests across many independent modules at once and each module can be tested in isolation. Pass the module glob (and optionally the test framework/conventions) as args. One agent generates one test file per module — best when modules are decoupled; for cross-module integration tests prefer a single targeted agent.',
  phases: [
    { title: 'Discover', detail: 'Find the modules that need tests; assign each a disjoint test-output path; fail closed if discovery exceeds the cap or is not provably complete' },
    { title: 'Generate', detail: 'Parallel: one agent per module writes its test file AND runs its suite inside the same isolated worktree (fail-closed)' },
    { title: 'Verify', detail: 'Aggregate the co-located per-module suite results into the per-module pass/fail report' },
  ],
}

// test-gen: Discover → parallel(Generate test file + run its suite, co-located) → Verify (aggregate)
// Generic, runnable skeleton. The module glob + test conventions are injected via args.
//
// D7 WRITE SAFETY (two independent guarantees):
//   1. Disjoint output files — each module is assigned ONE distinct test-file path, deduped by
//      a CANONICAL path key so alias spellings (./x vs x, \ vs /, a/./b, case variants) collapse
//      to one key; a canonical collision FAILS CLOSED (the run aborts) rather than silently
//      letting two generator agents write the same file.
//   2. Worktree isolation — each generator runs with `isolation: 'worktree'` (a fresh git
//      worktree), so concurrent writes are physically separated.
//
// ── CONFIRMED worktree semantics (Claude Code CLI 2.1.183 binary — read from the binary's own
//    agent()/Workflow API strings, NOT guessed; see migrate.js header for the verbatim strings) ──
//   • `isolation: "worktree"` gives the agent its own worktree; it is auto-cleaned if the agent makes
//     no changes, otherwise the worktree path+branch are returned in the result (fields
//     `worktreePath` / `worktreeBranch`). There is NO automatic merge-back into the shared checkout —
//     a default (shared-tree) agent spawned afterwards does NOT see an isolated agent's writes.
//   • CAPTURING the coordinates: a schema-set agent() returns ONLY the validated structured-output
//     object (binary-confirmed: the workflow agent() does `if (schema) return parsed`), so the
//     runtime's worktree path/branch are NOT guaranteed to be merged into a schema result. Therefore
//     each generator agent SELF-REPORTS `worktreePath`/`worktreeBranch` in its schema (it is told its
//     worktree path and can read its branch via `git rev-parse --abbrev-ref HEAD`). We also spread any
//     runtime-injected fields defensively (`{...r}`) — the field names match the official ones so they
//     align if the runtime does inject them. (Mirrors migrate.js verbatim.)
//
// DESIGN (verification is merge-back-independent; the generated FILES still need merge-back — both fail-closed):
//   • VERIFICATION is CO-LOCATED: the same worktree-isolated agent that writes a module's test file
//     also RUNS that module's suite in its own worktree, where the file definitely exists. The
//     per-module green/red signal needs no merge-back. The Verify phase only AGGREGATES these
//     co-located results; it never re-runs in the shared checkout (which would lack the
//     worktree-isolated files and report false greens).
//   • The generated test FILES are the whole point (test backfill) — but they live ONLY in each
//     module's isolated worktree and the runtime does NOT auto-merge them, so without merge-back they
//     are LOST when the worktree is cleaned up (the caller would get a "green" report and zero files —
//     the test-backfill intent violated). So each generated module CARRIES its
//     `worktreePath`/`worktreeBranch` to the result and the run surfaces an explicit merge-back
//     precondition (MERGE_BACK_NOTE) for the caller to materialize them. (Mirrors migrate's
//     aggregate-gate merge-back; test-gen has no aggregate gate, so the coordinates + precondition ride
//     the RESULT instead of a gate prompt.)
//   • FAIL-CLOSED (two independent demotions): a module is trusted as "generated" only if the worktree
//     proves the test file is on disk (generatedPresent) AND it self-reported worktree coordinates
//     (without them the file cannot be merged back / would be lost — un-materializable). Either gap
//     demotes the module to "failed" (never a silent green); `generationComplete` then counts only
//     coordinate-bearing generation. (Mirrors migrate's unmergeable→fail-closed, expressed per-module
//     since test-gen has no single aggregate gate.)
//   • SINGLE-FILE WRITE-SCOPE (F7 — merge-back must NOT trust the whole worktree): a generator could
//     write files OTHER than its assigned testPath in its worktree; since the caller's merge-back
//     (MERGE_BACK_NOTE) would land them too, each generator self-reports `changedFiles` (every path it
//     created/modified in its worktree) and the reconciliation CODE-checks it is EXACTLY its one owned
//     testPath — extra/missing/absolute/retargeted demotes the module to "failed" (fail-closed; never
//     merged). MERGE_BACK_NOTE additionally PREFERS a path-scoped apply (land only the owned testPath).
//     HONEST CAP: the actual VCS apply is a // CUSTOMIZE seam the consuming project wires — the template
//     provides scope verification + fail-closed structure, not an automatic whole-branch merge.
//     (Mirrors migrate's F7.)
//
//   NOTE: running a suite inside a fresh worktree may require dependencies (e.g. node_modules) to be
//   present there. Claude Code can symlink dirs from the main repo into worktrees via the worktree
//   `includeFiles` / symlink setting (e.g. "node_modules", ".cache") — configure it for your repo so
//   the co-located run resolves deps. See workflows/README.md §4.
//
// Invoke: Workflow({ name: 'test-gen', args: '<module glob> :: <test framework / conventions>' })

// ── Tunables (CUSTOMIZE) ──
const MAX_MODULES = 100        // fail-closed UPPER BOUND on modules per run (F9) — an over-cap (or not
                               // provably complete) discovery ABORTS rather than silently truncating;
                               // split a large pass across narrower `args`, or raise this deliberately

// CUSTOMIZE: how generated test files are named/located, and how the suite is run.
// Defaults defer to .claude/project.md and the project's existing test conventions.
const TEST_CONVENTION =
  "Follow the project's test conventions in .claude/project.md / the test skill. HCG default: " +
  "unit/integration with Vitest, co-located as `features/{feature}/__tests__/<module>.test.ts` " +
  "(use `.test.tsx` when the test renders JSX/components); E2E with Playwright. " +
  "If the project overrides these, follow the project."
const RUN_TESTS_INSTRUCTION =
  "Run the project's test command (HCG default: `vitest run <path>`; see .claude/project.md " +
  "「주요 명령어」 / package scripts) scoped to this module's generated test file."

// CUSTOMIZE: how the caller materializes each generated test file from its per-module worktree into
// the working tree. The runtime does NOT auto-merge worktree writes (see CONFIRMED semantics above),
// so the generated files live ONLY in their isolated worktrees until merged — without this they are
// lost on worktree cleanup. test-gen has no aggregate gate to do this, so it returns this precondition
// (with each file's coordinates) for the caller to run. The exact mechanism is CLI-version specific
// (e.g. merge each file's `worktreeBranch`, or apply its `worktreePath` patch). Leave generic here;
// wire to your runtime. See workflows/README.md §4.
const MERGE_BACK_NOTE =
  "Each generated test file was written in its OWN isolated git worktree; the runtime does NOT " +
  "auto-merge those writes into your checkout — without merge-back they are lost on worktree cleanup. " +
  "Materialize each one with a PATH-SCOPED apply: for each generated module below merge ONLY its owned " +
  "testPath (e.g. `git checkout <worktreeBranch> -- <testPath>`, or apply a <testPath>-scoped patch " +
  "from `worktreePath`) — never a blanket whole-branch merge (a branch could carry files beyond its " +
  "one owned testPath). The workflow has already code-verified each worktree created EXACTLY its owned " +
  "testPath (changedFiles == [testPath]); honor that scope. NOTE: the actual VCS apply is a " +
  "// CUSTOMIZE seam your project wires to its runtime — this template provides the scope verification " +
  "+ fail-closed structure, not an automatic whole-branch merge."

// ── Structured-output schemas ──
const DISCOVER_SCHEMA = {
  type: 'object',
  required: ['modules'],
  properties: {
    framework: { type: 'string' },
    // F9 (codex Phase 33 #10, mirrors migrate): `complete` attests the modules list is the EXHAUSTIVE
    // set needing tests (NOT truncated by the agent to fit the cap). The Discover phase fails closed if
    // this is not strictly true (`complete !== true` ⇒ abort) — the overflow guard below only catches
    // CODE-level truncation; this catches AGENT-level silent truncation to a ≤cap subset. Kept OUT of
    // `required` for the same runtime-subset caution as the per-status fields — enforced in code.
    complete: { type: 'boolean' },
    modules: {
      // NOT capped with `maxItems` ON PURPOSE (F9): the schema must let discovery report the FULL count
      // so an over-cap list is OBSERVABLE and fails closed in code, instead of the schema silently
      // clamping the array to MAX_MODULES — which would hide the overflow and ship partial generation
      // as success. MAX_MODULES is enforced as a fail-closed UPPER BOUND in the Discover phase below,
      // never as a silent slice. (Mirrors migrate's DISCOVER_SCHEMA.)
      type: 'array',
      items: {
        type: 'object', required: ['module', 'testPath'],
        properties: {
          module: { type: 'string' },    // source module under test
          testPath: { type: 'string' },  // the single disjoint test file to create
          surface: { type: 'string' },   // exports / behavior worth testing
          // F10 (codex Phase 33 #11, mirrors migrate): OPTIONAL not-applicable marker. If discovery
          // surfaces a module it inspected but ruled OUT (no test needed / untestable), it sets
          // skip=true here INSTEAD of omitting it — the module is then ACCOUNTED as explicitly-skipped,
          // never silently dropped. Optional (kept out of `required`); accounted in code, not schema.
          skip: { type: 'boolean' },
        },
      },
    },
  },
}
// Generate + co-located run fold into ONE result: the worktree agent writes the test file and then
// runs its suite in the same worktree. `generatedPresent` is the worktree-local proof the file
// exists; `passed`/`detail` are the co-located suite result. Both feed the fail-closed logic below.
const GENERATE_SCHEMA = {
  type: 'object',
  required: ['module', 'testPath', 'status', 'generatedPresent'],
  properties: {
    module: { type: 'string' },
    testPath: { type: 'string' },
    status: { enum: ['generated', 'skipped', 'failed'] },
    generatedPresent: { type: 'boolean' }, // true ONLY if the test file is actually on disk in THIS worktree
    // Worktree coordinates the caller needs to MERGE this generated test file back into the working
    // tree (the runtime does NOT auto-merge — see CONFIRMED semantics above; without merge-back the
    // file is lost on cleanup). Field names match the official result fields (binary-confirmed:
    // `worktreePath` / `worktreeBranch`); the isolated agent is told its worktree path and can read
    // its branch (`git rev-parse --abbrev-ref HEAD`), so it self-reports them here. (Required only when
    // status==='generated' — instructed in the prompt; coordinate-absence fails the module closed.)
    worktreePath: { type: 'string' },   // absolute path of this agent's isolated worktree
    worktreeBranch: { type: 'string' }, // the branch holding this generated test file, to merge back
    // F7: the EXACT list of files this agent created/modified in its worktree (repo-relative POSIX).
    // The reconciliation CODE-checks this set is exactly [testPath]; extra/missing/absolute/retargeted
    // fails the module closed so merge-back never pulls UNRELATED worktree files into the working tree.
    // (Required when status==='generated' — instructed in the prompt; enforced in code, same
    // status-conditional reason as the coordinates.)
    changedFiles: { type: 'array', items: { type: 'string' } },
    passed: { type: 'boolean' },           // co-located suite result for THIS module's generated tests
    caseCount: { type: 'integer' },
    detail: { type: 'string' },            // failing output when passed=false
    summary: { type: 'string' },
    error: { type: 'string' },
  },
}

// ── Path canonicalization (pure; dry-run-testable) ──
// Fold alias variants of the SAME testPath to ONE key so the disjoint-output dedup below
// cannot be bypassed by `./x` vs `x`, `\` vs `/`, `a/./b`, `a/b/../c`, or (on a
// case-insensitive filesystem) case variants. Two modules whose testPaths canonicalize to
// the same key would otherwise spawn two parallel worktrees writing ONE physical file →
// merge-back conflict / lost output (D7 guarantee #1 defeated). String-only by design: the
// workflow runtime gives NO `import`s (README §1), so this does NOT resolve symlinks /
// realpath, nor make absolute paths repo-relative — that residual is shrunk at the source
// by instructing discovery (below) to emit repo-relative POSIX paths.
// (Helper duplicated verbatim from migrate.js: workflow scripts are self-contained — the
// runtime gives no `import`, so the helper cannot be shared via a module.)
// CUSTOMIZE: set CASE_INSENSITIVE_FS=false on a case-SENSITIVE filesystem (most Linux)
// where `Foo.ts` and `foo.ts` are genuinely different files.
const CASE_INSENSITIVE_FS =
  typeof process !== 'undefined' &&
  (process.platform === 'win32' || process.platform === 'darwin')

function canonicalizePath(raw) {
  if (typeof raw !== 'string') return null
  let p = raw.trim()
  if (!p) return null
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/') // \→/, collapse repeated slashes
  const absolute = p.startsWith('/')
  const out = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue           // drop empty + `.` (incl. leading ./)
    if (seg === '..') {                                // resolve a real parent; else keep
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')              // can't climb above a relative root
      continue
    }
    out.push(seg)
  }
  let key = (absolute ? '/' : '') + out.join('/')
  if (CASE_INSENSITIVE_FS) key = key.toLowerCase()
  return key || null
}

// ── Repo-relative safety gate (Pattern A; pure; dry-run-testable) ──
// canonicalizePath PRESERVES absolute paths and a leading `..` (it has no `import`/realpath to
// resolve them). The discovery prompt ASKS for repo-relative POSIX testPaths, but a prompt is not an
// enforcement — a returned `/tmp/x.js`, `C:\x.js`, or `../outside.js` would otherwise be queued and
// handed to a WRITING worktree agent as "create this file" → a file created OUTSIDE the test tree /
// repo. This gate is the CODE enforcement: given a canonical key it returns null if the path is a
// safe repo-relative target, else a STRING reason. Unsafe items are NOT queued — the run fails closed.
// (Helper duplicated verbatim from migrate.js: workflow scripts are self-contained — no `import`.)
function repoRelativeViolation(canonKey) {
  if (!canonKey) return 'empty or non-canonicalizable path'
  if (canonKey.startsWith('/')) return 'absolute path (leading "/" — POSIX or collapsed UNC)'
  if (/^[a-zA-Z]:/.test(canonKey)) return 'absolute path (Windows drive letter)'
  if (canonKey === '..' || canonKey.startsWith('../')) return 'parent-traversal escapes the repo root'
  return null
}

// ── Single-file write-scope gate (Pattern C; pure; dry-run-testable) ──
// F7 (codex Phase 33 #8): merge-back must NOT trust the whole generator worktree/branch. The generate
// prompt allows only one testPath and Pattern B pins ownership to the scheduler's testPath, but a
// generator could still write OTHER files in its worktree; since the caller's merge-back
// (MERGE_BACK_NOTE) would land them too, unrelated files would leak into the working tree. This gate is
// the CODE enforcement: given the agent's self-reported list of files it changed in its worktree and the
// scheduler-owned testPath, it returns null IFF the worktree changed EXACTLY that one owned file, else a
// STRING reason (extra / missing / absolute / retargeted). Violating modules are demoted to "failed"
// below (fail-closed) so their worktree is never merged. Pairs with the path-scoped-apply preference in
// MERGE_BACK_NOTE. (Helper duplicated verbatim from migrate.js: workflow scripts are self-contained —
// the runtime gives no `import`, so the helper cannot be shared via a module.)
function writeScopeViolation(reportedFiles, ownedPath) {
  const ownedKey = canonicalizePath(ownedPath)
  if (!ownedKey) return 'assigned path is not canonicalizable'
  if (!Array.isArray(reportedFiles)) return 'no changedFiles list reported — cannot prove single-file scope'
  const keys = new Set()
  for (const f of reportedFiles) {
    const k = canonicalizePath(f)
    if (!k) return 'changedFiles contains an empty / non-canonicalizable entry'
    const unsafe = repoRelativeViolation(k)
    if (unsafe) return 'changed file outside the repo (' + f + '): ' + unsafe
    keys.add(k)
  }
  if (keys.size === 0) return 'empty changedFiles but status=generated — no proof the owned file was created'
  if (keys.size > 1) return 'worktree changed ' + keys.size + ' files; exactly the one owned testPath is allowed (extra files)'
  if (!keys.has(ownedKey)) return 'worktree changed a different file than assigned (retargeted scope)'
  return null
}

// ─── Phase 1: Discover — modules that need tests, each with a disjoint test path ───
phase('Discover')
const SPEC = (typeof args === 'string' && args.trim()) || ''
const discovery = await agent(
  'You are scoping a test-generation pass.\n\n' +
  '## Spec\n' + (SPEC || '(no glob given — discover testable modules from .claude/project.md 「경로」)') + '\n\n' +
  '## Conventions\n' + TEST_CONVENTION + '\n\n' +
  '## Task\nUse Read/Grep/Glob to find modules that lack adequate tests. For each, give the source `module`, ' +
  'a single `testPath` (the test file to create — one per module, no path reused), and a short `surface` ' +
  '(the exports/behavior worth covering). Give `testPath` as a NON-EMPTY repo-root-relative POSIX path ' +
  '(forward slashes, no leading "./", no absolute paths, never empty/blank); never reuse a path or a ' +
  'spelling-variant of one, and never omit a module for a missing path. If you surface a module you ' +
  'inspected but that does NOT need a test (untestable / not applicable), mark it `skip:true` (with the ' +
  'reason in `surface`) rather than omitting it — it is then accounted as skipped, never silently ' +
  'dropped. Set `complete=true` ONLY if the returned list is the EXHAUSTIVE set of every module needing ' +
  'tests (you enumerated all; none omitted or truncated) — otherwise set it false. The list must hold ' +
  'at most ' + MAX_MODULES + ' modules; if MORE need tests, do NOT truncate to fit — report the full ' +
  'count you found (the run will fail closed and ask to narrow the scope or raise the cap), because ' +
  'silently dropping modules ships PARTIAL generation. ' +
  'Do NOT write tests yet — discovery only.\n\nStructured output only.',
  { label: 'discover', phase: 'Discover', schema: DISCOVER_SCHEMA }
)
// F11 (codex Phase 33 #12, mirrors migrate): a SKIPPED / DIED / INVALID discovery agent returns null
// (runtime contract: agent() "returns null if the user skips the agent mid-run or the subagent dies on
// a terminal API error after retries"), or a malformed object with no usable modules array. The OLD
// single guard collapsed that DEGRADED-DEPENDENCY case into the SAME non-error no-op branch as a
// genuine empty result — returning "nothing to generate" with NO `error`, so a caller reads a clean
// SUCCESS while generation ran NOTHING and completeness was NEVER proven. That fails OPEN,
// contradicting every other guard in this file (truncated / incomplete / over-cap / unsafe discovery
// all fail CLOSED). So split it THREE ways (same as migrate):
//   (1) missing / malformed discovery (null, or `modules` is not an array) → HARD ERROR, fail-closed.
//   (2) a VALID, EMPTY, COMPLETE-attested module list → the ONLY legitimate clean no-op ("nothing to
//       generate"): discovery ran exhaustively (complete===true) and found zero modules. Mirrors the
//       all-skipped no-op below (generationComplete:true, no `error`).
//   (3) a valid NON-EMPTY array → fall through to normal processing (completeness enforced by the F9
//       `discovery.complete !== true` guard further down).
// An empty array that is NOT complete-attested (complete!==true) is fail-closed too — consistent with
// F9: an unattested empty result could be a silently-truncated subset of a non-empty true set.
if (!discovery || !Array.isArray(discovery.modules)) {
  return {
    spec: SPEC,
    error: 'discovery failed or returned a malformed result (agent skipped/died/invalid — no usable ' +
      'modules array); the module-list completeness cannot be proven, so generation is aborted ' +
      '(fail-closed) rather than reported as a no-op success. Re-run discovery.',
    generationComplete: false,
    generated: [], skipped: [], failed: [],
  }
}
if (discovery.modules.length === 0) {
  if (discovery.complete === true) {
    // Legitimate clean no-op: discovery ran exhaustively and found nothing needing tests. No `error`
    // (distinguishes it from the fail-closed cases) + generationComplete:true (the pass completed with
    // zero failures — mirrors the all-skipped no-op below).
    return { spec: SPEC, generationComplete: true, summary: 'No testable modules found — nothing to generate.', generated: [], skipped: [], failed: [] }
  }
  return {
    spec: SPEC,
    error: 'discovery returned an EMPTY module list without attesting completeness (complete !== true); ' +
      'an unattested empty result could be a silently-truncated subset of a non-empty true set, so ' +
      'generation is aborted (fail-closed) rather than reported as a no-op. Re-run discovery so it can ' +
      'enumerate exhaustively and attest complete=true.',
    generationComplete: false,
    generated: [], skipped: [], failed: [],
  }
}

// D7 guarantee #1: dedup by CANONICAL testPath key (not raw string) so each generator owns
// a DISJOINT physical output file. FAIL-CLOSED: two modules whose testPaths canonicalize to
// the same file are a defect in discovery (aliased paths) — we do NOT silently drop one and
// proceed (that risks two worktrees writing one file). We abort the run and report the
// colliding aliases so the spec can be fixed.
// F10 (codex Phase 33 #11, mirrors migrate): NO discovered module is silently dropped. The old
// `if (!m.testPath) continue` quietly discarded a falsy `testPath` BEFORE the safety gate — but an
// empty string passes the schema's string `required:['module','testPath']`, so a module with an empty
// testPath dropped the module, generated the rest, and reported generationComplete:true on a PARTIAL
// pass (the fail-closed completeness contract violated). Now EVERY discovered module is classified into
// EXACTLY one bucket — queued / explicitly-skipped / unsafe(fail-closed abort) / canonical-collision
// (fail-closed abort) — and the accounting invariant below asserts the buckets sum to the discovered
// count (any module escaping accounting => abort). This closes the "silent drop" CLASS structurally
// (empty/blank/null testPaths, future drop-style edits) with a single guard, not per-symptom point-fixes.
const seenCanon = new Map()   // canonicalKey -> first raw testPath seen
const collisions = []         // duplicate canonical (fail-closed abort bucket)
const unsafePaths = []        // Pattern A / F10: empty/blank/null/absolute/drive/UNC/parent-escape (fail-closed)
const discoverySkipped = []   // F10: discovery explicitly marked not-applicable (accounted, not generated)
const uniqueModules = []      // queued for Generate
for (const m of discovery.modules) {
  // (1) EXPLICIT-SKIP: discovery may mark a found-but-not-applicable module `skip:true`. It is ACCOUNTED
  // as skipped (not generated, not aborted) instead of being omitted — honest accounting, never a drop.
  // A skipped module is never written, so it does NOT need a safe testPath and does NOT enter dedup.
  if (m && m.skip === true) {
    discoverySkipped.push({ module: m && m.module, testPath: m && m.testPath, reason: m && m.surface })
    continue
  }
  // (2) PATH SAFETY (Pattern A + F10): an empty / missing / null / whitespace-only `testPath`
  // canonicalizes to null and is ROUTED to unsafePaths (never silently dropped) —
  // repoRelativeViolation(null) flags it. Absolute / Windows-drive / UNC / parent-escaping testPaths
  // are likewise rejected BEFORE dedup+queue. Fail-closed — do NOT hand an out-of-repo (or empty)
  // "create this file" target to a worktree agent. canonicalizePath cannot resolve these away, so gate here.
  const key = canonicalizePath(m && m.testPath)
  const unsafe = repoRelativeViolation(key)
  if (unsafe) {
    unsafePaths.push({ testPath: m && m.testPath, canonical: key, reason: unsafe })
    continue
  }
  // (3) CANONICAL COLLISION: two modules folding to one output file (D7 #1 defeated) — accounted, fail-closed.
  if (seenCanon.has(key)) {
    collisions.push({ canonical: key, testPaths: [seenCanon.get(key), m.testPath] })
    continue
  }
  // (4) QUEUED: valid, canonical, repo-relative, distinct.
  seenCanon.set(key, m.testPath)
  uniqueModules.push(m)
}
// F10 ACCOUNTING INVARIANT (mirrors migrate): every discovered module must land in EXACTLY one bucket.
// If the buckets do NOT sum to the original discovered count, a module escaped accounting (a "silent
// drop") — abort fail-closed rather than generate an under-counted module list. This single structural
// guard closes the drop CLASS: empty/blank testPaths, duplicate/overflow miscounts, and any FUTURE
// drop-style regression all trip it. queued + explicitly-skipped + unsafe + collision == discovered.
const discoveredCount = discovery.modules.length
const accountedCount = uniqueModules.length + discoverySkipped.length + unsafePaths.length + collisions.length
if (accountedCount !== discoveredCount) {
  return {
    spec: SPEC,
    error: 'discovery accounting invariant violated: only ' + accountedCount + ' of ' + discoveredCount +
      ' discovered modules were classified (queued/skipped/unsafe/collision); ' +
      (discoveredCount - accountedCount) + ' module(s) escaped accounting (silent drop) — generation ' +
      'is aborted (fail-closed).',
    discovered: discoveredCount, accounted: accountedCount,
    generated: [], skipped: [], failed: [],
  }
}
if (unsafePaths.length) {
  return {
    spec: SPEC,
    error: 'Discovery assigned testPath(s) that are not safe repo-relative targets (empty/missing/blank, ' +
      'absolute, Windows-drive, UNC, or parent-traversal escaping the repo root). Creating them would ' +
      'write OUTSIDE the test tree / repo (or have no target), so generation is aborted (fail-closed). ' +
      'Fix the spec to emit NON-EMPTY repo-relative POSIX testPaths that stay inside the repo (or mark ' +
      'genuinely not-applicable modules skip:true).',
    unsafePaths,
    generated: [], skipped: [], failed: [],
  }
}
if (collisions.length) {
  return {
    spec: SPEC,
    error: 'Discovery assigned aliased testPaths that canonicalize to the same file — disjoint ' +
      'output ownership cannot be guaranteed, so generation is aborted (fail-closed). Fix the ' +
      'spec so each test file is unique (repo-relative POSIX paths).',
    collisions,
    generated: [], skipped: [], failed: [],
  }
}
// FAIL-CLOSED overflow guard (F9 — codex Phase 33 #10, mirrors migrate): the discovery prompt requires
// EVERY module needing tests, so the list must be COMPLETE. MAX_MODULES is a defensive UPPER BOUND, not
// a silent truncation point — quietly slicing to the first cap modules (the old
// `uniqueModules.slice(0, MAX_MODULES)`) would generate+run tests for only a SUBSET while leaving the
// overflow modules neither generated/skipped/failed, report stats.discovered as the truncated count, and
// (if the subset passed) read as a full-coverage success on a PARTIAL generation. So an over-cap
// discovery ABORTS: completeness is unprovable without truncating, and the user must narrow the scope
// (args) to fit the cap or raise MAX_MODULES deliberately. We do NOT process the first capped subset.
if (uniqueModules.length > MAX_MODULES) {
  return {
    spec: SPEC,
    error: 'discovery exceeded MAX_MODULES (' + uniqueModules.length + ' > ' + MAX_MODULES +
      '); completeness unprovable without silent truncation — generation is aborted (fail-closed). ' +
      'Narrow the scope (args) so the module list fits the cap, or raise MAX_MODULES deliberately.',
    generationComplete: false,
    discovered: uniqueModules.length,
    cap: MAX_MODULES,
    generated: [], skipped: [], failed: [],
  }
}
// FAIL-CLOSED completeness guard (F9): the overflow guard above only catches CODE-level truncation; the
// discovery AGENT could instead silently return a ≤cap SUBSET of a larger true set. So discovery must
// ATTEST the list is exhaustive via `complete`. If it cannot (complete !== true), generating tests for
// the list would risk partial coverage (un-enumerated modules left untested, reported as success) — abort.
if (discovery.complete !== true) {
  return {
    spec: SPEC,
    error: 'discovery did not attest the module list is the COMPLETE set needing tests ' +
      '(complete !== true); a truncated/partial list would generate tests for only some modules and ' +
      'report success (fail-closed). Re-run discovery so it can enumerate exhaustively, or narrow the spec.',
    generationComplete: false,
    discovered: uniqueModules.length,
    cap: MAX_MODULES,
    generated: [], skipped: [], failed: [],
  }
}
const modules = uniqueModules   // no silent slice (F9): over-cap already aborted above
log('Discovered ' + modules.length + ' modules to test (disjoint output paths enforced, canonical-deduped, complete ≤ cap)')

// ─── Phase 2: Generate — one isolated-worktree agent per module, in parallel. Each agent writes
//     its test file AND runs that module's suite IN THE SAME WORKTREE (co-located; no merge-back). ───
phase('Generate')
const genResults = await parallel(
  modules.map(m => () =>
    agent(
      '## Test author + runner: ' + m.module + '\n\n' +
      '## Conventions\n' + TEST_CONVENTION + '\n\n' +
      '## Module under test\n' + m.module + '\n' +
      (m.surface ? 'Surface to cover: ' + m.surface + '\n' : '') +
      'Write the test file at EXACTLY: ' + m.testPath + ' (create ONLY this file).\n\n' +
      '## Task (generate AND verify in THIS worktree — do not defer verification)\n' +
      '1. Generate focused, meaningful tests for this module: cover the public surface, edge cases, ' +
      'and error paths. Tests must capture the requirement, not mirror the implementation (no ' +
      'tautological asserts). Touch NO other file. If the module is untestable as-is, set ' +
      'status="skipped" and generatedPresent=false.\n' +
      '2. If you generated it: confirm the test file is actually on disk in THIS worktree ' +
      '(generatedPresent=true), then RUN its suite IN THIS SAME WORKTREE (' + RUN_TESTS_INSTRUCTION + '). ' +
      'Report passed (true/false) and, on failure, the failing detail. (Co-located: the runtime does ' +
      'NOT auto-merge worktree writes into the shared checkout, so the suite is run HERE where the ' +
      'file exists — never deferred to a shared-tree step that would not see it. The suite may need ' +
      'deps (node_modules) symlinked into the worktree; see the header / workflows/README.md §4.)\n' +
      '3. If you generated it: report THIS worktree\'s coordinates so the caller can merge your ' +
      'generated test file back (the runtime does NOT auto-merge it — without this it is lost on ' +
      'cleanup). Set worktreePath (the isolated git worktree path you were given, or `git rev-parse ' +
      '--show-toplevel`) and worktreeBranch (`git rev-parse --abbrev-ref HEAD`). These identify which ' +
      'branch/worktree holds your file; without them it cannot be materialized and the module fails ' +
      'closed.\n' +
      '4. If you generated it: set changedFiles to the EXACT list of every file you created/modified ' +
      'in THIS worktree, as repo-relative POSIX paths (from `git status --porcelain` / `git diff ' +
      '--name-only HEAD`). It MUST be exactly this one file (' + m.testPath + ') and nothing else — ' +
      'merge-back applies ONLY your owned testPath, and the module fails closed if the worktree touched ' +
      'any other file. Create NO other file.\n\n' +
      'Structured output only.',
      { label: 'gen:' + m.module, phase: 'Generate', schema: GENERATE_SCHEMA, isolation: 'worktree' }
    ).then(r => {
      if (!r) return { ...m, status: 'failed', generatedPresent: false, error: 'agent skipped or died' }
      // OWNERSHIP IMMUTABILITY (Pattern B): the scheduler-assigned `testPath` and `module` are
      // AUTHORITATIVE. The agent's structured output must NOT be able to retarget which file it owns —
      // a returned `testPath` could otherwise point the generated-file accounting at the WRONG path,
      // defeating disjoint output ownership. So the assigned coords always win (`testPath`/`module`
      // after the spread); a returned testPath that canonicalizes elsewhere (or a different module)
      // fails the module closed. Reports use only scheduler-owned coords.
      const testPathChanged = typeof r.testPath === 'string' && canonicalizePath(r.testPath) !== canonicalizePath(m.testPath)
      const moduleChanged = typeof r.module === 'string' && r.module !== m.module
      const g = { ...m, ...r, testPath: m.testPath, module: m.module }
      if (testPathChanged || moduleChanged) {
        return { ...g, status: 'failed', error: 'agent returned ' +
          (testPathChanged ? 'testPath "' + r.testPath + '"' : 'module "' + r.module + '"') +
          ' different from the assigned (' + m.testPath + ' / ' + m.module + ') — ownership violation (fail-closed)' }
      }
      // FAIL-CLOSED (presence): a "generated" module must prove its test file exists on disk in the
      // worktree. Absent file => module failure, never reported as green.
      if (g.status === 'generated' && g.generatedPresent !== true) {
        return { ...g, status: 'failed', error: g.error || 'generated test file absent in worktree (fail-closed)' }
      }
      // FAIL-CLOSED (materializability): a "generated" file lives ONLY in its isolated worktree and the
      // runtime does NOT auto-merge it; without worktree coordinates the caller cannot merge it back, so
      // it would be LOST on cleanup (a green report with zero files — the test-backfill intent violated).
      // A generated module that self-reported NEITHER coordinate is therefore un-materializable and is
      // demoted to "failed" (mirrors migrate's unmergeable→fail-closed; never a silent coordinate-less
      // green; this in turn flips generationComplete via the failed count below).
      if (g.status === 'generated' && !g.worktreeBranch && !g.worktreePath) {
        return { ...g, status: 'failed', error: g.error ||
          'generated test file lacks worktree coordinates — cannot be merged back, would be lost on cleanup (fail-closed)' }
      }
      // FAIL-CLOSED (F7 single-file write-scope): the worktree must have created EXACTLY the one
      // assigned testPath (not extra/other/out-of-repo files), or merge-back (MERGE_BACK_NOTE) would
      // pull the unrelated files into the working tree. Demote to failed (fail-closed) so it is never
      // merged (and flips generationComplete via the failed count).
      if (g.status === 'generated') {
        const scopeViolation = writeScopeViolation(g.changedFiles, g.testPath)
        if (scopeViolation) {
          return { ...g, status: 'failed', error: g.error || 'worktree write-scope violation (fail-closed): ' + scopeViolation }
        }
      }
      return g
    })
  )
)

// F12-mirror / TASK-156-F5 (codex Phase 33 #14): RESULTS-STAGE accounting invariant — the F10 discovery
// "every-item-accounted" guard MIRRORED onto the generation-results side (discovery + results both
// closed). The OLD `parallel(...).filter(Boolean)` DROPPED null/degraded outputs, then bucketed the
// rest by exact status — so a result that was null (a degraded slot) OR non-null but malformed / with a
// missing or unknown status landed in NONE of made/skipped/failed. If every module fell into that gap,
// made=0 && failed=0 would report generationComplete:true + the "all-skipped" clean no-op while NOTHING
// was generated (fail-OPEN — contradicting every other guard here). So: (a) require parallel() to return
// an array (a non-array result is a hard fail-closed, mirror of F11's malformed-discovery guard); (b)
// DROP the `.filter(Boolean)` — account EVERY result by its module INDEX (positional — parallel
// preserves order), preserving the scheduler-owned module/testPath; (c) validate status against the
// allowed set and DEMOTE null/undefined/malformed/unknown-status to "failed" (carrying the indexed
// module) — never drop; (d) assert the buckets sum to modules.length AND parallel yielded exactly one
// result per module before ANY generationComplete:true / no-op return.
if (!Array.isArray(genResults)) {
  return {
    spec: SPEC,
    error: 'the generation pipeline returned a malformed (non-array) result; the per-module outcomes ' +
      'cannot be accounted, so generation is aborted (fail-closed) rather than reported over an unknown ' +
      'result set.',
    generationComplete: false,
    generated: [], skipped: [], failed: [],
  }
}
const ALLOWED_STATUS = new Set(['generated', 'skipped', 'failed'])
const made = []
const skipped = []
const failed = []
for (let i = 0; i < modules.length; i++) {
  const m = modules[i]
  const g = genResults[i]
  if (g && typeof g === 'object' && ALLOWED_STATUS.has(g.status)) {
    if (g.status === 'generated') made.push(g)
    else if (g.status === 'skipped') skipped.push(g)
    else failed.push(g)
  } else {
    // null/undefined slot (degraded parallel output) OR non-null malformed / missing / unknown status:
    // DEMOTE to failed (fail-closed), carrying the scheduler-owned module from the index so the failed
    // report + the generationComplete guard still identify it. Never silently dropped.
    failed.push({
      module: m && m.module,
      testPath: m && m.testPath,
      status: 'failed',
      error: (g == null)
        ? 'generation pipeline returned no result for this module (degraded slot) — demoted to failed (fail-closed)'
        : 'generation pipeline result had a missing/unknown status (' +
          (typeof g === 'object' ? String(g.status) : typeof g) + ') — demoted to failed (fail-closed)',
    })
  }
}
// F12-mirror RESULTS ACCOUNTING INVARIANT (mirror of the F10 discovery invariant, on the results side):
// every queued module must land in EXACTLY one results bucket. The bucketing demotes individual bad
// results to failed, so a SINGLE null/malformed result keeps this satisfied (counted as failed, then
// generationComplete flips via the failed count below). The invariant FIRES when parallel() yielded a
// DIFFERENT number of results than modules (a degraded stage dropped/added whole slots) — abort
// fail-closed rather than report over an under/over-counted set. The bucket-sum term is a regression
// guard (tautological by construction here, like F10's); the length-parity term is the active check.
// made + skipped + failed == modules.length == genResults.length.
const resultAccounted = made.length + skipped.length + failed.length
if (resultAccounted !== modules.length || genResults.length !== modules.length) {
  return {
    spec: SPEC,
    error: 'generation results accounting invariant violated: ' + resultAccounted + ' of ' +
      modules.length + ' modules were bucketed (generated/skipped/failed) and the pipeline yielded ' +
      genResults.length + ' result(s); a degraded stage dropped/added slots, so generation is aborted ' +
      '(fail-closed) rather than reported over an under/over-counted result set.',
    generationComplete: false,
    discovered: discovery.modules.length, queued: modules.length, accounted: resultAccounted, results: genResults.length,
    generated: [], skipped: [], failed: [],
  }
}
log('Generate: ' + made.length + ' files created + suite run in-worktree, ' + skipped.length + ' skipped, ' + failed.length + ' failed')

if (made.length === 0) {
  // FAIL-CLOSED partial guard for the nothing-generated exits: 0 generated WITH any generation
  // FAILURES (agent died / file absent / ownership violation / missing worktree coordinates — NOT a
  // red suite) means discovered modules were left with NO usable test file. Flag
  // generationComplete=false and surface the failed identifiers so a failed run can never read as
  // success. All-skipped (failed.length===0) is the ONLY legitimate nothing-to-do outcome (every
  // discovered module explicitly not testable).
  return {
    spec: SPEC,
    generationComplete: failed.length === 0,
    summary: failed.length > 0
      ? '0 generated, ' + skipped.length + ' skipped, ' + failed.length + ' failed to generate — ' +
        'PARTIAL GENERATION (fail-closed; modules left without a test file): ' + failed.map(f => f.module).join(', ')
      : 'No test files generated (all ' + skipped.length + ' skipped / not testable) — nothing to do.',
    generated: [],
    skipped,
    failed,
    discoverySkipped: discoverySkipped.map(s => ({ module: s.module, testPath: s.testPath, reason: s.reason })),
  }
}

// ─── Phase 3: Verify — AGGREGATE the per-module suites that already ran co-located in Generate. ───
// We do NOT re-run in the shared checkout: it would not contain the worktree-isolated test files
// (the runtime does not auto-merge them) and would report false greens. Source of truth = the
// co-located runs. Fail-closed: a module with no reported pass is counted red, not green.
phase('Verify')
const verification = {
  suiteRan: true,
  results: made.map(g => ({
    module: g.module,
    passed: g.passed === true,
    detail: g.detail || (g.passed === true ? 'green (co-located run)' : 'no pass reported by co-located run'),
  })),
}
const green = verification.results.filter(r => r.passed)
log('Verify (aggregated co-located runs): ' + green.length + '/' + verification.results.length + ' modules green')

// FAIL-CLOSED (partial-generation guard): the discovered module list is the contract — each module
// must end generated (test file proven on disk AND carrying worktree coordinates so it can be merged
// back) OR explicitly skipped (not testable). A non-empty `failed` = generation FAILURES (agent died /
// file absent / ownership violation / missing worktree coordinates — un-materializable), so generation
// is INCOMPLETE and the green ratio below covers only the generated SUBSET — it must NOT read as a
// full-coverage success. (A generated-but-RED suite is status='generated' with passed=false — a
// LEGITIMATE result, NOT a generation failure — so it does NOT flip generationComplete; only the
// `failed` count does. This keeps "generated but red" distinct from "failed to generate".)
const generationComplete = failed.length === 0
return {
  spec: SPEC,
  generationComplete,
  summary: (generationComplete ? '' : 'PARTIAL GENERATION — ' + failed.length +
    ' module(s) failed to generate (coverage incomplete): ' + failed.map(f => f.module).join(', ') + '. ') +
    made.length + ' test files generated, ' + skipped.length + ' skipped, ' + failed.length + ' failed; ' +
    green.length + '/' + verification.results.length + ' modules green (co-located runs, generated subset)',
  // Each generated module carries its worktree coordinates: the file lives ONLY in that worktree and
  // the runtime does NOT auto-merge it, so the caller must merge it back (MERGE_BACK_NOTE) or it is
  // lost on cleanup. Coordinate-less generations were already demoted to `failed` above (fail-closed),
  // so every entry here is materializable.
  generated: made.map(g => ({ module: g.module, testPath: g.testPath, caseCount: g.caseCount, passed: g.passed === true, summary: g.summary, worktreePath: g.worktreePath, worktreeBranch: g.worktreeBranch })),
  skipped: skipped.map(s => ({ module: s.module, summary: s.summary })),
  failed: failed.map(f => ({ module: f.module, error: f.error })),
  discoverySkipped: discoverySkipped.map(s => ({ module: s.module, testPath: s.testPath, reason: s.reason })),
  mergeBack: MERGE_BACK_NOTE,
  verification,
  stats: { discovered: discovery.modules.length, queued: modules.length, discoverySkipped: discoverySkipped.length, generated: made.length, skipped: skipped.length, failed: failed.length, green: green.length, generationComplete },
}
