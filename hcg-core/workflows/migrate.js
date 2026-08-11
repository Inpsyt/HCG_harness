export const meta = {
  name: 'migrate',
  description:
    'Bulk migration / codemod fan-out — discover a work-list of files to transform, apply the same transformation to each via a streaming pipeline (one agent per file, disjoint file ownership), verifying each edit INSIDE its own worktree, then run an aggregate build/test/type gate over the merged result. Writing agents run in isolated git worktrees so parallel mutations never collide.',
  whenToUse:
    'When the same mechanical change must be applied across many independent files (a codemod, an API rename, a dependency bump, a lint-rule rollout) and the files do not depend on each other. Pass the discovery pattern + the transformation instruction as args. NOT for tightly-coupled changes (one change forcing edits across layers) — the session performs those directly, or dispatches independent Tasks via the `parallel-tasks` skill.',
  phases: [
    { title: 'Discover', detail: 'Find the work-list (files/symbols to transform), enforce disjoint file ownership, and fail closed if discovery exceeds the cap or is not provably complete' },
    { title: 'Transform', detail: 'Streaming pipeline: one agent per file applies the change AND self-checks it inside the same isolated worktree (fail-closed)' },
    { title: 'Verify', detail: 'Aggregate build/test/type gate over the merged result; fail-closed if the migrated files are not present in the gated tree OR if any aggregate gate fails (success requires every gate passed)' },
  ],
}

// migrate: Discover → pipeline(Transform + co-located self-check per file) → Verify (aggregate gate)
// Generic, runnable skeleton. The discovery pattern + transformation rule are injected via args.
//
// D7 WRITE SAFETY (two independent guarantees):
//   1. Disjoint file ownership — the work-list is deduped by a CANONICAL path key so each
//      agent owns exactly ONE distinct physical file; alias spellings (./x vs x, \ vs /,
//      a/./b, case variants) collapse to one key and a canonical collision FAILS CLOSED
//      (the run aborts) rather than silently spawning two worktrees on one file. In logic below.
//   2. Worktree isolation — each writing agent runs with `isolation: 'worktree'`, a fresh
//      git worktree, so even concurrent writes are physically separated.
//
// ── CONFIRMED worktree semantics (Claude Code CLI 2.1.183 binary — read from the binary's own
//    agent()/Workflow API strings, NOT guessed) ──
//   • `isolation: "worktree"` gives the agent its own git worktree.
//   • The worktree is "automatically cleaned up if the agent makes no changes; otherwise the path
//     and branch are returned in the result" (fields `worktreePath` / `worktreeBranch`).
//   • The isolated agent is told: "You are operating in an isolated git worktree at <path>. Edit the
//     worktree copy of this file instead of the shared-checkout path."
//   ⇒ There is NO automatic merge-back into the shared checkout. A *default* (shared-tree) agent
//     spawned afterwards does NOT see an isolated agent's edits — they live in a separate
//     worktree+branch. So any verification done by a separate shared-tree agent would inspect the
//     PRE-migration tree and could green-light broken/absent codemods.
//   • CAPTURING the coordinates: a schema-set agent() returns ONLY the validated structured
//     output object (binary-confirmed: the workflow agent() does `if (schema) return parsed`), so
//     the runtime's worktree path/branch are NOT guaranteed to be merged into a schema result.
//     Therefore each transform agent SELF-REPORTS `worktreePath`/`worktreeBranch` in its schema
//     (it is told its worktree path and can read its branch via `git rev-parse --abbrev-ref HEAD`).
//     We also spread any runtime-injected fields defensively (`{...r}`) — belt-and-suspenders, and
//     the field names match the official ones so they align if the runtime does inject them.
//
// DESIGN (merge-back-independent + fail-closed):
//   • Per-file check is CO-LOCATED: the same worktree-isolated agent that edits a file also
//     re-reads and validates that file in its own worktree, where the edit definitely exists.
//     This needs no merge-back. Fail-closed: an item is trusted as "changed" only if the worktree
//     proves the file was modified AND the co-located check passed — otherwise it is demoted to
//     "failed" (never a silent green).
//   • The aggregate build/test/type gate inherently needs ALL migrated files in ONE tree, so it
//     REQUIRES merge-back as an explicit precondition (// CUSTOMIZE per runtime). It is given each
//     changed item's `worktreePath`/`worktreeBranch` so it KNOWS which branch/worktree to merge
//     (without them it could not locate the edits to land). Before trusting any gate result it
//     asserts the migration is actually present in the gated tree; if not (the symptom of gating
//     the pre-migration tree) — OR if any changed item lacks its worktree coordinates
//     (un-materializable) — it fails closed. See workflows/README.md §4.
//   • SINGLE-FILE WRITE-SCOPE (F7 — merge-back must NOT trust the whole worktree): the transform
//     prompt allows only one file and ownership-immutability pins the path to the scheduler, but a
//     transform agent could still edit files OTHER than its assigned one in its worktree (or
//     self-report a branch carrying extra mutations). Because the expected file ALSO changed, the
//     presence assertion alone would still pass and merge-back would pull the UNRELATED mutations
//     into the gated tree (disjoint / single-file contract broken; unrelated files corrupted by the
//     codemod). So each transform agent self-reports `changedFiles` (every path it modified in its
//     worktree) and the reconciliation CODE-checks that set is EXACTLY its one owned path —
//     extra/missing/absolute/retargeted demotes the item to "failed" (fail-closed; never merged, and
//     failed>0 forces changesPresent=false). The merge step additionally PREFERS a path-scoped apply
//     (land only the owned path) over a whole-branch merge. HONEST CAP: the actual VCS apply is a
//     // CUSTOMIZE seam the consuming project wires — the template provides scope verification +
//     fail-closed structure, not an automatic whole-branch merge. See workflows/README.md §4.
//
// Invoke: Workflow({ name: 'migrate', args: '<glob to migrate> :: <transformation instruction>' })

// ── Tunables (CUSTOMIZE) ──
const MAX_WORK_ITEMS = 200     // fail-closed UPPER BOUND on files per run (F9) — an over-cap (or not
                               // provably complete) discovery ABORTS rather than silently truncating;
                               // split a large migration across narrower `args`, or raise this deliberately

// CUSTOMIZE: how to verify the migration. Default points at .claude/project.md's
// build/test/type commands — replace with your project's actual gate commands.
const VERIFY_INSTRUCTION =
  "Run the project's type-check, lint, build, and test commands (see .claude/project.md " +
  "「주요 명령어」 / package scripts). Report each gate as pass/fail with the failing output."

// CUSTOMIZE: how to merge each per-file worktree's edits back into one tree for the aggregate gate.
// The runtime does NOT auto-merge worktree writes (see CONFIRMED semantics above), so the gate must
// materialize them first. The exact mechanism is CLI-version specific (e.g. merge each item's
// `worktreeBranch`, or apply each worktree's patch). Leave generic here; wire to your runtime.
const MERGE_BACK_INSTRUCTION =
  "Each changed file was edited in its OWN isolated git worktree; the runtime does NOT auto-merge " +
  "those edits into this checkout, AND it is NOT safe to merge a whole worktree branch blindly (a " +
  "branch could carry mutations beyond its one owned file). PREFER a PATH-SCOPED apply: for each item " +
  "below, materialize ONLY its owned path (e.g. `git checkout <worktreeBranch> -- <path>`, or apply a " +
  "<path>-scoped patch from `worktreePath`) — never a blanket whole-branch merge. The workflow has " +
  "already code-verified that each worktree changed EXACTLY its owned file (changedFiles == [path]); " +
  "honor that scope. If a file's coordinates are marked missing you cannot merge it: set " +
  "changesPresent=false (see workflows/README.md §4). NOTE: the actual VCS apply is a // CUSTOMIZE " +
  "seam your project wires to its runtime — this template provides the scope verification + " +
  "fail-closed structure, not an automatic whole-branch merge."

// ── Structured-output schemas ──
const DISCOVER_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    rule: { type: 'string' }, // the transformation, restated for the transform agents
    // F9 (codex Phase 33 #10): `complete` attests the items list is the EXHAUSTIVE set of files
    // needing the change (NOT truncated by the agent to fit the cap). The Discover phase fails closed
    // if this is not strictly true (`complete !== true` ⇒ abort) — the overflow guard below only
    // catches CODE-level truncation; this catches AGENT-level silent truncation to a ≤cap subset.
    // Kept OUT of `required` for the same runtime-subset caution as TRANSFORM_SCHEMA.check (the
    // JSON-Schema subset is not assumed to enforce it) — enforced in code, not schema.
    complete: { type: 'boolean' },
    items: {
      // NOT capped with `maxItems` ON PURPOSE (F9): the schema must let discovery report the FULL
      // count so an over-cap work-list is OBSERVABLE and fails closed in code, instead of the schema
      // silently clamping the array to MAX_WORK_ITEMS — which would hide the overflow and ship a
      // partial migration as success. MAX_WORK_ITEMS is enforced as a fail-closed UPPER BOUND in the
      // Discover phase below, never as a silent slice.
      type: 'array',
      items: {
        type: 'object', required: ['path', 'reason'],
        properties: {
          path: { type: 'string' },   // the single file this work-item owns
          reason: { type: 'string' }, // why it needs the change / what to change
          // F10 (codex Phase 33 #11): OPTIONAL not-applicable marker. If discovery surfaces a file it
          // inspected but ruled OUT (does not actually need the change), it sets skip=true here INSTEAD
          // of omitting the item — the file is then ACCOUNTED as explicitly-skipped, never silently
          // dropped. Optional (kept out of `required`); accounted in code, not schema.
          skip: { type: 'boolean' },
        },
      },
    },
  },
}
// Transform + co-located check fold into ONE result: the worktree agent edits the file and then
// validates it in the same worktree. `changedPresent` is the worktree-local proof of the edit;
// `check` is the co-located sanity result. Both feed the fail-closed reconciliation below.
const TRANSFORM_SCHEMA = {
  type: 'object',
  required: ['path', 'status', 'changedPresent'],
  properties: {
    path: { type: 'string' },
    status: { enum: ['changed', 'skipped', 'failed'] },
    changedPresent: { type: 'boolean' }, // true ONLY if the file was actually modified on disk in THIS worktree
    // Worktree coordinates the AGGREGATE gate needs to merge this edit back (the runtime does
    // NOT auto-merge — see CONFIRMED semantics above). Field names match the official
    // result fields (binary-confirmed: `worktreePath` / `worktreeBranch`); the isolated agent
    // is told its worktree path and can read its branch (`git rev-parse --abbrev-ref HEAD`),
    // so it self-reports them here. (Required only when status==='changed' — instructed below.)
    worktreePath: { type: 'string' },   // absolute path of this agent's isolated worktree
    worktreeBranch: { type: 'string' }, // the branch holding this edit, to merge into the gate tree
    // F7: the EXACT list of files this agent modified in its worktree (repo-relative POSIX). The
    // reconciliation CODE-checks this set is exactly [path]; extra/missing/absolute/retargeted fails
    // the item closed so merge-back never pulls UNRELATED worktree mutations into the gated tree.
    // (Required when status==='changed' — instructed in the prompt; enforced in code, not schema, for
    // the same status-conditional reason as `check`.)
    changedFiles: { type: 'array', items: { type: 'string' } },
    // INTENT: when status==='changed', `check` with `check.ok===true` is REQUIRED — the reconciliation
    // below treats a missing `check` (or non-true `check.ok`) as fail-closed and demotes the item to
    // "failed". `check` is not in the top-level `required` array because the requirement is conditional
    // on status (changed vs skipped/failed) and the runtime's JSON-Schema subset is not assumed to
    // support if/then/dependentRequired; the per-status enforcement lives in code. If your runtime
    // supports conditional requirements, promote this to a schema-level `required` for changed results.
    check: {
      type: 'object',
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },   // co-located: the edited file parses / is internally consistent in the worktree
        note: { type: 'string' },
      },
    },
    summary: { type: 'string' },
    error: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object',
  required: ['gates', 'changesPresent'],
  properties: {
    changesPresent: { type: 'boolean' }, // attestation: the migrated files are materialized in the gated tree
    gates: {
      type: 'array',
      items: {
        type: 'object', required: ['name', 'passed'],
        properties: { name: { type: 'string' }, passed: { type: 'boolean' }, detail: { type: 'string' } },
      },
    },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

// ── Path canonicalization (pure; dry-run-testable) ──
// Fold alias variants of the SAME path to ONE key so the disjoint-ownership dedup below
// cannot be bypassed by `./x` vs `x`, `\` vs `/`, `a/./b`, `a/b/../c`, or (on a
// case-insensitive filesystem) case variants. If two work-items canonicalize to the same
// key they would otherwise spawn two parallel worktrees on ONE physical file →
// merge-back conflict / lost edits (D7 guarantee #1 defeated). String-only by design: the
// workflow runtime gives NO `import`s (README §1), so this does NOT resolve symlinks /
// realpath, nor make absolute paths repo-relative — that residual is shrunk at the source
// by instructing discovery (below) to emit repo-relative POSIX paths.
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
// resolve them). The discovery prompt ASKS for repo-relative POSIX paths, but a prompt is not an
// enforcement — a returned `/tmp/x.js`, `C:\x.js`, or `../outside.js` would otherwise be queued and
// handed to a WRITING worktree agent as its one edit target → mutation OUTSIDE the repo. This gate
// is the CODE enforcement: given a canonical key it returns null if the path is a safe repo-relative
// write target, else a STRING reason. Unsafe items are NOT queued — the run fails closed (below).
function repoRelativeViolation(canonKey) {
  if (!canonKey) return 'empty or non-canonicalizable path'
  if (canonKey.startsWith('/')) return 'absolute path (leading "/" — POSIX or collapsed UNC)'
  if (/^[a-zA-Z]:/.test(canonKey)) return 'absolute path (Windows drive letter)'
  if (canonKey === '..' || canonKey.startsWith('../')) return 'parent-traversal escapes the repo root'
  return null
}

// ── Single-file write-scope gate (Pattern C; pure; dry-run-testable) ──
// F7 (codex Phase 33 #8): merge-back must NOT trust the whole agent worktree/branch. The transform
// prompt allows only one file and Pattern B pins ownership to the scheduler's path, but a transform
// agent could still edit OTHER files in its worktree (or self-report a branch carrying extra
// mutations). Because the expected file ALSO changed, a naive presence assertion (changesPresent)
// would still pass and merge-back would pull the unrelated mutations into the gated tree — disjoint /
// single-file contract broken, unrelated files corrupted by the codemod. This gate is the CODE
// enforcement: given the agent's self-reported list of files it changed in its worktree and the
// scheduler-owned path, it returns null IFF the worktree changed EXACTLY that one owned file, else a
// STRING reason (extra / missing / absolute / retargeted). Reuses canonicalizePath +
// repoRelativeViolation (F5). Violating items are demoted to "failed" below (fail-closed) so their
// worktree is never merged. Pairs with the path-scoped-apply preference in the merge/verify step.
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
  if (keys.size === 0) return 'empty changedFiles but status=changed — no proof the owned file was modified'
  if (keys.size > 1) return 'worktree changed ' + keys.size + ' files; exactly the one owned file is allowed (extra files)'
  if (!keys.has(ownedKey)) return 'worktree changed a different file than assigned (retargeted scope)'
  return null
}

// ─── Phase 1: Discover — build the work-list, enforce disjoint file ownership ───
phase('Discover')
const SPEC = (typeof args === 'string' && args.trim()) || ''
if (!SPEC) {
  return { error: "No migration spec provided. Pass it as args: Workflow({ name: 'migrate', args: '<glob> :: <transformation>' })." }
}
const discovery = await agent(
  'You are scoping a bulk migration (codemod).\n\n' +
  '## Migration spec\n' + SPEC + '\n\n' +
  '## Task\nUse Read/Grep/Glob to find every file that needs this change. Return one work-item per file ' +
  '(path + the reason/what-to-change). Do NOT edit anything yet — this is discovery only. ' +
  'Each item must own exactly ONE file; do not list the same file twice. ' +
  'Every `path` MUST be a NON-EMPTY repo-root-relative POSIX path (forward slashes, no leading "./", ' +
  'no absolute paths, never empty/blank) so the same file cannot appear under two spellings and no ' +
  'item is lost for a missing path. If you surface a file you inspected but that does NOT need the ' +
  'change, mark it `skip:true` (with the reason) rather than omitting it — it is then accounted as ' +
  'skipped, never silently dropped. ' +
  'Set `complete=true` ONLY if the returned list is the EXHAUSTIVE set of every file needing this ' +
  'change (you enumerated all matches; none omitted or truncated) — otherwise set it false. ' +
  'The list must hold at most ' + MAX_WORK_ITEMS + ' files; if MORE match, do NOT truncate to fit — ' +
  'report the full count you found (the run will fail closed and ask to narrow the scope or raise ' +
  'the cap), because silently dropping files ships a PARTIAL migration. ' +
  'Also restate the transformation rule clearly so the per-file agents apply it identically.\n\nStructured output only.',
  { label: 'discover', phase: 'Discover', schema: DISCOVER_SCHEMA }
)
// F11 (codex Phase 33 #12): a SKIPPED / DIED / INVALID discovery agent returns null (runtime
// contract: agent() "returns null if the user skips the agent mid-run or the subagent dies on a
// terminal API error after retries"), or a malformed object with no usable items array. The OLD
// single guard `if (!discovery || !discovery.items || discovery.items.length === 0)` collapsed that
// DEGRADED-DEPENDENCY case into the SAME non-error no-op branch as a genuine empty match — returning
// "nothing to do" with NO `error`, so a caller reads a clean SUCCESS while the migration ran NOTHING
// and completeness was NEVER proven. That fails OPEN, contradicting every other guard in this file
// (truncated / incomplete / over-cap / unsafe discovery all fail CLOSED). So split it THREE ways:
//   (1) missing / malformed discovery (null, or `items` is not an array) → HARD ERROR, fail-closed:
//       the agent skipped/died/returned an invalid result; the work-list's completeness is unprovable,
//       so we MUST NOT report a no-op success.
//   (2) a VALID, EMPTY, COMPLETE-attested work-list → the ONLY legitimate clean no-op ("nothing to
//       do"): discovery ran, enumerated exhaustively (complete===true), and found zero files. Mirrors
//       the all-skipped no-op below (changesPresent:false, no `error`).
//   (3) a valid NON-EMPTY array → fall through to normal processing (its completeness is enforced by
//       the F9 `discovery.complete !== true` guard further down).
// An empty array that is NOT complete-attested (complete!==true) is fail-closed too — consistent with
// F9: an unattested empty result could be a silently-truncated subset of a non-empty true set.
if (!discovery || !Array.isArray(discovery.items)) {
  return {
    spec: SPEC,
    error: 'discovery failed or returned a malformed result (agent skipped/died/invalid — no usable ' +
      'items array); the work-list completeness cannot be proven, so the migration is aborted ' +
      '(fail-closed) rather than reported as a no-op success. Re-run discovery.',
    changesPresent: false,
    changed: [], skipped: [], failed: [],
  }
}
if (discovery.items.length === 0) {
  if (discovery.complete === true) {
    // Legitimate clean no-op: discovery ran exhaustively and found nothing to migrate. No `error`
    // (distinguishes it from the fail-closed cases) + changesPresent:false (nothing materialized —
    // mirrors the all-skipped no-op below).
    return { spec: SPEC, changesPresent: false, summary: 'No files matched the migration spec — nothing to do.', changed: [], skipped: [], failed: [] }
  }
  return {
    spec: SPEC,
    error: 'discovery returned an EMPTY work-list without attesting completeness (complete !== true); ' +
      'an unattested empty result could be a silently-truncated subset of a non-empty true set, so the ' +
      'migration is aborted (fail-closed) rather than reported as a no-op. Re-run discovery so it can ' +
      'enumerate exhaustively and attest complete=true.',
    changesPresent: false,
    changed: [], skipped: [], failed: [],
  }
}

// D7 guarantee #1: dedup by CANONICAL key (not raw string) so each agent owns a DISJOINT
// physical file. FAIL-CLOSED: two items that canonicalize to the same file are a defect in
// discovery (aliased paths) — we do NOT silently drop one and proceed (that risks applying
// the codemod under an ambiguous work-list). We abort the run and report the colliding
// aliases so the discovery spec can be fixed.
// F10 (codex Phase 33 #11): NO discovered item is silently dropped. The old `if (!it.path) continue`
// quietly discarded a falsy `path` BEFORE the safety gate — but an empty string passes the schema's
// string `required:['path']`, so `[{path:'a'},{path:''}]`+complete:true dropped the second work-item,
// migrated only `a`, and (if the subset passed) attested changesPresent:true on a PARTIAL tree (the
// fail-closed completeness contract violated). Now EVERY discovered item is classified into EXACTLY
// one bucket — queued / explicitly-skipped / unsafe(fail-closed abort) / canonical-collision
// (fail-closed abort) — and the accounting invariant below asserts the buckets sum to the discovered
// count (any item escaping accounting => abort). This closes the "silent drop" CLASS structurally
// (empty/blank/null paths, future drop-style edits) with a single guard, not per-symptom point-fixes.
const seenCanon = new Map()   // canonicalKey -> first raw path seen
const collisions = []         // duplicate canonical (fail-closed abort bucket)
const unsafePaths = []        // Pattern A / F10: empty/blank/null/absolute/drive/UNC/parent-escape (fail-closed)
const discoverySkipped = []   // F10: discovery explicitly marked not-applicable (accounted, not migrated)
const uniqueItems = []        // queued for Transform
for (const it of discovery.items) {
  // (1) EXPLICIT-SKIP: discovery may mark a found-but-not-applicable item `skip:true`. It is ACCOUNTED
  // as skipped (not migrated, not aborted) instead of being omitted — honest accounting, never a drop.
  // A skipped item is never written, so it does NOT need a safe path and does NOT enter dedup.
  if (it && it.skip === true) {
    discoverySkipped.push({ path: it && it.path, reason: it && it.reason })
    continue
  }
  // (2) PATH SAFETY (Pattern A + F10): an empty / missing / null / whitespace-only `path` canonicalizes
  // to null and is ROUTED to unsafePaths (never silently dropped) — repoRelativeViolation(null) flags
  // it. Absolute / Windows-drive / UNC / parent-escaping paths are likewise rejected BEFORE dedup+queue.
  // Fail-closed — do NOT hand an out-of-repo (or empty) write target to a worktree agent (code
  // enforcement, not prompt dependency). canonicalizePath cannot resolve these away, so we gate here.
  const key = canonicalizePath(it && it.path)
  const unsafe = repoRelativeViolation(key)
  if (unsafe) {
    unsafePaths.push({ path: it && it.path, canonical: key, reason: unsafe })
    continue
  }
  // (3) CANONICAL COLLISION: two items folding to one physical file (D7 #1 defeated) — accounted, fail-closed.
  if (seenCanon.has(key)) {
    collisions.push({ canonical: key, paths: [seenCanon.get(key), it.path] })
    continue
  }
  // (4) QUEUED: valid, canonical, repo-relative, distinct.
  seenCanon.set(key, it.path)
  uniqueItems.push(it)
}
// F10 ACCOUNTING INVARIANT: every discovered item must land in EXACTLY one bucket. If the buckets do
// NOT sum to the original discovered count, an item escaped accounting (a "silent drop") — abort
// fail-closed rather than migrate an under-counted work-list. This single structural guard closes the
// drop CLASS: empty/blank paths, duplicate/overflow miscounts, and any FUTURE drop-style regression all
// trip it (not point-fixes per symptom). queued + explicitly-skipped + unsafe + collision == discovered.
const discoveredCount = discovery.items.length
const accountedCount = uniqueItems.length + discoverySkipped.length + unsafePaths.length + collisions.length
if (accountedCount !== discoveredCount) {
  return {
    spec: SPEC,
    error: 'discovery accounting invariant violated: only ' + accountedCount + ' of ' + discoveredCount +
      ' discovered items were classified (queued/skipped/unsafe/collision); ' +
      (discoveredCount - accountedCount) + ' item(s) escaped accounting (silent drop) — the migration ' +
      'is aborted (fail-closed).',
    discovered: discoveredCount, accounted: accountedCount,
    changed: [], skipped: [], failed: [],
  }
}
if (unsafePaths.length) {
  return {
    spec: SPEC,
    error: 'Discovery returned path(s) that are not safe repo-relative targets (empty/missing/blank, ' +
      'absolute, Windows-drive, UNC, or parent-traversal escaping the repo root). Queuing them would ' +
      'hand an out-of-repo or empty write target to a worktree agent, so the migration is aborted ' +
      '(fail-closed). Fix the discovery spec to emit NON-EMPTY repo-relative POSIX paths that stay ' +
      'inside the repo (or mark genuinely not-applicable files skip:true).',
    unsafePaths,
    changed: [], skipped: [], failed: [],
  }
}
if (collisions.length) {
  return {
    spec: SPEC,
    error: 'Discovery returned aliased paths that canonicalize to the same file — disjoint ' +
      'file ownership cannot be guaranteed, so the migration is aborted (fail-closed). Fix ' +
      'the discovery spec so each physical file appears exactly once (repo-relative POSIX paths).',
    collisions,
    changed: [], skipped: [], failed: [],
  }
}
// FAIL-CLOSED overflow guard (F9 — codex Phase 33 #10): the discovery prompt requires EVERY file
// needing the change, so the work-list must be COMPLETE. MAX_WORK_ITEMS is a defensive UPPER BOUND,
// not a silent truncation point — quietly slicing to the first cap items (the old
// `uniqueItems.slice(0, MAX_WORK_ITEMS)`) would transform+gate only a SUBSET while leaving the
// overflow files neither changed/skipped/failed, report stats.discovered as the truncated count, and
// (if the subset passed) attest changesPresent=true on a PARTIAL migration — the fail-closed
// partial-migration invariant violated, un-migrated files shipped silently. So an over-cap discovery
// ABORTS: completeness is unprovable without truncating, and the user must narrow the scope (args) to
// fit the cap or raise MAX_WORK_ITEMS deliberately. We do NOT process the first capped subset.
if (uniqueItems.length > MAX_WORK_ITEMS) {
  return {
    spec: SPEC,
    error: 'discovery exceeded MAX_WORK_ITEMS (' + uniqueItems.length + ' > ' + MAX_WORK_ITEMS +
      '); completeness unprovable without silent truncation — the migration is aborted (fail-closed). ' +
      'Narrow the scope (args) so the work-list fits the cap, or raise MAX_WORK_ITEMS deliberately.',
    changesPresent: false,
    discovered: uniqueItems.length,
    cap: MAX_WORK_ITEMS,
    changed: [], skipped: [], failed: [],
  }
}
// FAIL-CLOSED completeness guard (F9): the overflow guard above only catches CODE-level truncation;
// the discovery AGENT could instead silently return a ≤cap SUBSET of a larger true set. So discovery
// must ATTEST the list is exhaustive via `complete`. If it cannot (complete !== true), migrating the
// list would risk a partial tree (un-enumerated files left un-migrated, reported as success) — abort.
if (discovery.complete !== true) {
  return {
    spec: SPEC,
    error: 'discovery did not attest the work-list is the COMPLETE set of files needing the change ' +
      '(complete !== true); a truncated/partial work-list would migrate only some files and report ' +
      'success (fail-closed). Re-run discovery so it can enumerate exhaustively, or narrow the spec.',
    changesPresent: false,
    discovered: uniqueItems.length,
    cap: MAX_WORK_ITEMS,
    changed: [], skipped: [], failed: [],
  }
}
const workItems = uniqueItems   // no silent slice (F9): over-cap already aborted above
const RULE = discovery.rule || SPEC
log('Discovered ' + workItems.length + ' files to migrate (disjoint ownership enforced, canonical-deduped, complete ≤ cap)')

// ─── Phase 2: Transform — streaming pipeline; each agent transforms AND self-checks its one file
//     INSIDE its own worktree (co-located so the check runs where the edit lives — no merge-back). ───
phase('Transform')
const results = await pipeline(
  workItems,

  // Single co-located stage: transform the file in an isolated worktree (D7 guarantee #2), then
  // validate it IN THE SAME WORKTREE. A separate shared-tree check would NOT see this edit (the
  // runtime does not auto-merge worktrees), so the check is folded into this same agent.
  item => agent(
    '## Codemod: ' + item.path + '\n\n' +
    '## Transformation rule\n' + RULE + '\n\n' +
    '## Your file (and ONLY this file)\n' + item.path + '\nReason: ' + item.reason + '\n\n' +
    '## Task (transform AND verify in THIS worktree — do not defer verification)\n' +
    '1. Apply the transformation to this one file. Touch NO other file. Preserve behavior except ' +
    'for the intended change. If the change does not apply (already migrated / not applicable), set ' +
    'status="skipped", changedPresent=false, and leave the file unchanged.\n' +
    '2. If you changed it: confirm the edit is actually on disk in THIS worktree (changedPresent=true), ' +
    'then re-read the file and verify it is syntactically valid and internally consistent — report ' +
    'check.ok=false with a note if the edit looks broken. (Co-located: the runtime does NOT auto-merge ' +
    'worktree writes into the shared checkout, so this check is done HERE where the edit exists, never ' +
    'deferred to a shared-tree step that would not see it.)\n' +
    '3. If you changed it: report THIS worktree\'s coordinates so the later aggregate gate can merge ' +
    'your edit back (the runtime does NOT auto-merge it). Set worktreePath (the isolated git worktree ' +
    'path you were given, or `git rev-parse --show-toplevel`) and worktreeBranch (`git rev-parse ' +
    '--abbrev-ref HEAD`). These identify which branch/worktree holds your change; without them it ' +
    'cannot be materialized for the gate.\n' +
    '4. If you changed it: set changedFiles to the EXACT list of every file you modified in THIS ' +
    'worktree, as repo-relative POSIX paths (from `git status --porcelain` / `git diff --name-only ' +
    'HEAD`). It MUST be exactly this one file (' + item.path + ') and nothing else — merge-back applies ' +
    'ONLY your owned path, and the workflow fails this item closed if the worktree touched any other ' +
    'file. Do NOT edit, add, or stage any other file.\n\nStructured output only.',
    { label: 'migrate:' + item.path, phase: 'Transform', schema: TRANSFORM_SCHEMA, isolation: 'worktree' }
  ).then(r => {
    if (!r) return { ...item, status: 'failed', changedPresent: false, error: 'agent skipped or died' }
    // OWNERSHIP IMMUTABILITY (Pattern B): the scheduler-assigned `item.path` is AUTHORITATIVE. The
    // agent's structured output must NOT be able to retarget which file this work-item owns — a
    // returned `path` could otherwise mark the WRONG file as changed and feed the WRONG worktree
    // coordinates into merge-back + the aggregate gate, defeating disjoint ownership. So the assigned
    // path always wins (`path: item.path` after the spread); a returned path that canonicalizes to a
    // DIFFERENT file fails the item closed. Merge-back/report coords therefore use only scheduler-owned paths.
    const retargeted = typeof r.path === 'string' && canonicalizePath(r.path) !== canonicalizePath(item.path)
    const m = { ...item, ...r, path: item.path }
    if (retargeted) {
      return { ...m, status: 'failed', error: 'agent returned a path (' + r.path + ') different from the ' +
        'assigned ' + item.path + ' — ownership violation, item rejected (fail-closed)' }
    }
    // FAIL-CLOSED reconciliation: trust "changed" only if the worktree proved the file was modified
    // (changedPresent===true) AND the co-located check EXPLICITLY passed (check.ok===true). A missing
    // `check`, or any non-true `check.ok`, is NOT a pass — it means the edit was never proven valid, so
    // we demote to "failed" rather than letting an un-self-checked codemod flow into merge-back / the
    // aggregate gate counted as verified. Unproven => failed, never a silent green.
    if (m.status === 'changed') {
      const present = m.changedPresent === true
      const checkOk = !!(m.check && m.check.ok === true)
      // F7: code-level single-file write-scope guard — the worktree must have changed EXACTLY the
      // scheduler-owned file (not extra/other/out-of-repo files), or merge-back would pull unrelated
      // mutations into the gated tree (the expected file also changed, so the presence assertion alone
      // would not catch it). Demote to failed (fail-closed) so this worktree is never merged; failed>0
      // in turn forces changesPresent=false (F6).
      const scopeViolation = writeScopeViolation(m.changedFiles, item.path)
      if (!present || !checkOk || scopeViolation) {
        return {
          ...m, status: 'failed',
          error: m.error || (!present
            ? 'change not present in worktree (fail-closed)'
            : !checkOk
              ? (!m.check
                ? 'co-located check missing — unverified edit (fail-closed)'
                : 'co-located check failed: ' + (m.check.note || 'invalid edit'))
              : 'worktree write-scope violation (fail-closed): ' + scopeViolation),
        }
      }
    }
    return m
  })
)

// F12 (codex Phase 33 #14): RESULTS-STAGE accounting invariant — the F10 discovery "every-item-
// accounted" guard MIRRORED onto the OTHER side of the pipeline (discovery + results are now both
// closed). The OLD three independent `results.filter(r => r && r.status === 'X')` SILENTLY DROPPED any
// result that was null/undefined (a degraded pipeline slot) OR non-null but malformed / with a missing
// or unknown status — it landed in NONE of the three buckets. If every queued item fell into that gap,
// changed=0 && failed=0 would return the "No files were changed (all N skipped) — nothing to do" CLEAN
// no-op while the discovered work-list was NOT migrated (fail-OPEN — contradicting every other guard
// here). So: (a) require `results` to be an array (a non-array pipeline result is a hard fail-closed,
// mirror of F11's malformed-discovery guard, rather than throwing on the loop); (b) account EVERY
// result by its work-item INDEX (positional — the pipeline preserves work-item order), preserving the
// scheduler-owned path; (c) validate status against the allowed set and DEMOTE null/undefined/malformed/
// unknown-status to "failed" (carrying the indexed work-item's path) — never drop; (d) assert the
// buckets sum to workItems.length AND the pipeline yielded exactly one result per work-item before ANY
// success/no-op return. A length mismatch (a degraded stage dropped/added whole slots) fails closed.
if (!Array.isArray(results)) {
  return {
    spec: SPEC,
    error: 'transform pipeline returned a malformed (non-array) result; the per-file outcomes cannot ' +
      'be accounted, so the migration is aborted (fail-closed) rather than reported over an unknown ' +
      'result set.',
    changesPresent: false,
    changed: [], skipped: [], failed: [],
  }
}
const ALLOWED_STATUS = new Set(['changed', 'skipped', 'failed'])
const changed = []
const skipped = []
const failed = []
for (let i = 0; i < workItems.length; i++) {
  const item = workItems[i]
  const r = results[i]
  if (r && typeof r === 'object' && ALLOWED_STATUS.has(r.status)) {
    if (r.status === 'changed') changed.push(r)
    else if (r.status === 'skipped') skipped.push(r)
    else failed.push(r)
  } else {
    // null/undefined slot (degraded pipeline stage) OR non-null malformed / missing / unknown status:
    // DEMOTE to failed (fail-closed), carrying the scheduler-owned path from the work-item index so the
    // failed report + the F6 partial-migration guard still identify it. Never silently dropped.
    failed.push({
      path: item && item.path,
      status: 'failed',
      error: (r == null)
        ? 'pipeline returned no result for this work-item (degraded slot) — demoted to failed (fail-closed)'
        : 'pipeline result had a missing/unknown status (' +
          (typeof r === 'object' ? String(r.status) : typeof r) + ') — demoted to failed (fail-closed)',
    })
  }
}
// F12 RESULTS ACCOUNTING INVARIANT (mirror of the F10 discovery invariant, on the results side): every
// queued work-item must land in EXACTLY one results bucket. The bucketing demotes individual bad results
// to failed, so a SINGLE null/malformed result keeps this satisfied (its slot is counted as failed, then
// the F6 changed===0 / changesPresent guards fail it closed). The invariant FIRES when the pipeline
// yielded a DIFFERENT number of results than work-items (a degraded stage dropped/added whole slots) —
// abort fail-closed rather than report a (possibly clean) outcome over an under/over-counted result set.
// The bucket-sum term is a regression guard (tautological by construction here, like F10's); the
// length-parity term is the active check. changed + skipped + failed == workItems.length == results.length.
const resultAccounted = changed.length + skipped.length + failed.length
if (resultAccounted !== workItems.length || results.length !== workItems.length) {
  return {
    spec: SPEC,
    error: 'transform results accounting invariant violated: ' + resultAccounted + ' of ' +
      workItems.length + ' work-items were bucketed (changed/skipped/failed) and the pipeline yielded ' +
      results.length + ' result(s); a degraded stage dropped/added slots, so the migration is aborted ' +
      '(fail-closed) rather than reported over an under/over-counted result set.',
    changesPresent: false,
    discovered: discovery.items.length, queued: workItems.length, accounted: resultAccounted, results: results.length,
    changed: [], skipped: [], failed: [],
  }
}
log('Transform: ' + changed.length + ' changed (self-checked in worktree), ' + skipped.length + ' skipped, ' + failed.length + ' failed')

// Each changed item must carry its worktree coordinates so the aggregate gate can merge it back
// (the runtime does not auto-merge). An item missing BOTH coordinates is un-materializable, so the
// gate cannot be complete — we force fail-closed below regardless of what the gate agent reports.
const unmergeable = changed.filter(c => !c.worktreeBranch && !c.worktreePath)
if (unmergeable.length) {
  log('WARNING: ' + unmergeable.length + ' changed file(s) lack worktree coordinates — aggregate gate will fail closed')
}

if (changed.length === 0) {
  // FAIL-CLOSED partial guard for the nothing-changed exits: 0 changed WITH any failures means the
  // discovered work-list was NOT migrated (a failed-only / all-failed run) — NOT a clean "nothing to
  // do". Flag it as a gate failure (changesPresent=false) and surface the failed identifiers so a
  // failed-only run can never read as success. All-skipped (failed.length===0) is the ONLY legitimate
  // nothing-to-do outcome (every discovered item explicitly not-applicable).
  return {
    spec: SPEC,
    changesPresent: false,
    summary: failed.length > 0
      ? '0 changed, ' + skipped.length + ' skipped, ' + failed.length + ' failed — GATE FAILED ' +
        '(fail-closed; the discovered work-list was not migrated): ' + failed.map(f => f.path).join(', ')
      : 'No files were changed (all ' + skipped.length + ' skipped / not applicable) — nothing to do.',
    changed: [],
    skipped,
    failed,
    discoverySkipped: discoverySkipped.map(s => ({ path: s.path, reason: s.reason })),
  }
}

// ─── Phase 3: Verify — aggregate build/test/type gate over the MERGED migration result. ───
// The aggregate gate needs every migrated file in one tree, so it REQUIRES merge-back (the runtime
// does not auto-merge worktrees). The gate first materializes the edits, then asserts they are
// actually present before trusting any result — fail-closed if the gated tree is unmigrated.
phase('Verify')
const verify = await agent(
  '## Migration gate (aggregate build/test/type)\n\n' +
  changed.length + ' files were migrated under the rule: ' + RULE + '\n' +
  'Each was edited in its OWN isolated git worktree (listed with the branch/path to merge):\n' +
  changed.map(c => '- ' + c.path +
    '\n    worktreeBranch: ' + (c.worktreeBranch || '(MISSING — cannot merge this file; gate must fail closed)') +
    '\n    worktreePath: ' + (c.worktreePath || '(missing)')
  ).join('\n') + '\n\n' +
  '## PRECONDITION — merge-back (CUSTOMIZE per runtime)\n' + MERGE_BACK_INSTRUCTION + '\n\n' +
  '## FAIL-CLOSED presence assertion (BEFORE trusting any gate)\n' +
  'Confirm the migration is actually present in THIS tree: for the changed files above, verify via ' +
  'git status / git diff --stat / grep for the post-change shape that they carry the migration. Set ' +
  'changesPresent=true ONLY if they do. If the tree shows NONE of the migrated changes (the symptom ' +
  'of gating the pre-migration tree), set changesPresent=false and mark every gate as failed — do NOT ' +
  'report green on an unmigrated tree. ALSO confirm the materialized changes are SCOPED to the listed ' +
  'owned paths only: if merge-back introduced any file beyond them, set changesPresent=false (never ' +
  'gate a tree carrying out-of-scope mutations).\n\n' +
  '## Task\n' + VERIFY_INSTRUCTION + '\nReport changesPresent, then each gate pass/fail, and list any failures.\n\nStructured output only.',
  { label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA }
)

// FAIL-CLOSED: if the gate could not confirm the migrated files are present in the tree it checked,
// any "passed" gate is meaningless (it may have run on the pre-migration tree). Treat unproven
// presence as a hard verification failure regardless of the per-gate booleans. ADDITIONALLY, if we
// already KNOW some changed item lacks its worktree coordinates, that edit cannot have been merged
// into the gated tree — force changesPresent=false regardless of the agent's claim.
// FAIL-CLOSED (partial-migration guard): the discovered work-list is the contract — every item must
// end changed-with-proof OR explicitly skipped (not-applicable). If ANY item FAILED to transform,
// the aggregate gate ran over only the successful SUBSET; attesting changesPresent=true on that subset
// would report a green on a PARTIAL migration (one un-migrated file in a codemod / API rename =
// user-visible correctness breakage). So a non-empty `failed` forces changesPresent=false regardless
// of what the gate agent claims for the subset it saw — only a fully-resolved work-list can pass.
// F8 (codex Phase 33 #9): the aggregate build/test/type gate must FAIL CLOSED on FAILED gates, not
// only on absent/unscoped files. Presence + coordinates + write-scope prove the migrated files are
// MATERIALIZED in the gated tree — they do NOT prove that tree builds / tests / type-checks. The verify
// agent can return changesPresent=true while one or more gates FAILED (e.g. "0/3 passed"); if the gate
// outcome is not folded into the final boolean, this code would keep changesPresent=true and emit only
// a passed-count, so a caller using changesPresent/stats as the verdict would proceed on a build/test-
// broken migrated tree (fail-closed intent violated). So the final success ALSO requires an EXPLICIT
// all-gates-passed condition: the gates array must be NON-EMPTY and every gate passed===true. An empty
// or absent gates array is itself fail-closed (no proof a passing build/test/type gate ran).
// F13 (codex Phase 33 #18 — final defensive sweep): NORMALIZE verify.gates BEFORE any array method. The
// OLD `(verify && verify.gates) ? verify.gates.length / verify.gates.filter(...)` trusted a TRUTHY
// `verify.gates` to be an array — but a degraded verify agent can return `gates` as `{}`, a string, or
// another non-array truthy value (schema unmet on a skipped-schema run). `{}.length` is undefined and
// `{}.filter` / `'str'.filter` is NOT a function, so `.filter` on the non-array THREW — turning a
// recoverable gate-evidence failure into a HARD CRASH before the fail-closed changesPresent=false branch
// could run (the same degraded-agent fail-closed violation this sweep closes everywhere). So: normalize
// to an array first (Array.isArray ? gates : []), compute totals from THAT, and treat a PRESENT-but-non-
// array `gates` as `gatesMalformed` — gatesAllPassed stays false (gatesTotal=0 ⇒ changesPresent=false)
// AND a distinct verdict reason surfaces it. Each element is also guarded (`g && g.passed`) so a null /
// non-object gate entry cannot throw on `.passed`. Crash 0; malformed gate evidence fails closed.
const gatesMalformed = !!(verify && verify.gates != null && !Array.isArray(verify.gates))
const gates = (verify && Array.isArray(verify.gates)) ? verify.gates : []
const gatesTotal = gates.length
const gatesPassed = gates.filter(g => g && g.passed === true).length
const gatesAllPassed = gatesTotal > 0 && gatesPassed === gatesTotal
// presenceOk: the migrated files are materialized in the gated tree (verify attests changesPresent),
// every changed item is materializable (carries worktree coordinates — F3), and the work-list is
// complete (no failed transforms — F6/F7). This is necessary but NOT sufficient on its own.
const presenceOk =
  !!(verify && verify.changesPresent === true) && unmergeable.length === 0 && failed.length === 0
// Final success folds BOTH: files present/in-scope (presenceOk) AND the aggregate gate actually passed
// (gatesAllPassed). Any failed gate — or no gates reported — forces changesPresent=false (fail-closed).
const changesPresent = presenceOk && gatesAllPassed
const gateVerdict = !verify
  ? 'gate not run'
  : failed.length
    ? failed.length + ' item(s) failed transform — partial migration, gate fails (fail-closed): ' +
      failed.map(f => f.path).join(', ')
    : unmergeable.length
      ? 'GATE FAILED — ' + unmergeable.length + ' changed file(s) lack worktree coordinates; cannot merge back (fail-closed)'
      : !presenceOk
        ? 'GATE FAILED — migrated files NOT present in gated tree (fail-closed; verify merge-back)'
        : !gatesAllPassed
          ? 'GATE FAILED — ' + (gatesMalformed
              ? 'verify returned a malformed (non-array) gates value — gate evidence unusable (fail-closed)'
              : 'aggregate gates failed: ' + gatesPassed + '/' + gatesTotal + ' passed (fail-closed)' +
                (gatesTotal === 0 ? ' — no gates reported' : ''))
          : gatesPassed + '/' + gatesTotal + ' gates passed'

return {
  spec: SPEC,
  rule: RULE,
  changesPresent,
  summary: changed.length + ' migrated (worktree self-checked), ' + skipped.length + ' skipped, ' +
    failed.length + ' failed; ' + gateVerdict,
  changed: changed.map(c => ({ path: c.path, summary: c.summary, check: c.check, worktreePath: c.worktreePath, worktreeBranch: c.worktreeBranch })),
  skipped: skipped.map(s => ({ path: s.path, summary: s.summary })),
  failed: failed.map(f => ({ path: f.path, error: f.error })),
  discoverySkipped: discoverySkipped.map(s => ({ path: s.path, reason: s.reason })),
  verification: verify || null,
  stats: { discovered: discovery.items.length, queued: workItems.length, discoverySkipped: discoverySkipped.length, changed: changed.length, skipped: skipped.length, failed: failed.length, unmergeable: unmergeable.length, gatesPassed, gatesTotal, gatesAllPassed, gatesMalformed, changesPresent },
}
