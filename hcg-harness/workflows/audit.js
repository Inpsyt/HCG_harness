export const meta = {
  name: 'audit',
  description:
    'Read-oriented audit fan-out — decompose a target into independent audit dimensions, run one finder agent per dimension in parallel, adversarially verify each finding to drop false positives, then synthesize a deduped, severity-ranked report. Every agent runs as the built-in `Explore` agent type, which runtime-blocks the file-edit tools (Edit/Write/NotebookEdit). NOT an absolute read-only guarantee: Explore does NOT block Bash, so a shell-level mutation is only prompt-suppressed (advisory). For a hard no-mutation guarantee, set a Read/Grep/Glob-only agentType in AUDIT_AGENT_TYPE (// CUSTOMIZE).',
  whenToUse:
    'When you want a broad, multi-dimension assessment of a codebase or scope (e.g. security + performance + accessibility + dead-code + type-safety) where the dimensions are independent enough to fan out. Pass the audit scope/target as args (a path glob, a question, or a comma-separated dimension list). If the scope is vague, narrow it to 1-2 sentences before invoking. File edits are runtime-blocked (agentType:"Explore"); shell mutation is only prompt-suppressed (advisory) unless you set a Read/Grep/Glob-only agentType (see AUDIT_AGENT_TYPE). For changes use the migrate workflow instead.',
  phases: [
    { title: 'Scope', detail: 'Decompose the audit target (args) into independent audit dimensions' },
    { title: 'Find', detail: 'One read-only finder agent per dimension, in parallel (Read/Grep/Glob only)' },
    { title: 'Verify', detail: 'Adversarially re-check each finding to drop false positives' },
    { title: 'Synthesize', detail: 'Merge duplicate findings, rank by severity, emit the report' },
  ],
}

// audit: Scope → parallel(Find per dimension) → Verify (skeptical, drop false positives) → Synthesize
// Generic, runnable skeleton. Project-specific scope is injected via args / .claude/project.md.
//
// READ-ORIENTED (file edits runtime-blocked; shell mutation advisory — NOT an absolute
// no-mutation guarantee): every ag() call below sets `agentType: AUDIT_AGENT_TYPE`
// ('Explore'), a BUILT-IN agent type whose `disallowedTools` include Edit/Write/NotebookEdit
// (and sub-agent spawning), so a tool-selection bug or prompt deviation cannot EDIT FILES via
// those tools. HONEST LIMIT: Explore does NOT disallow Bash, so a mutating shell command is
// still possible and is suppressed ONLY by the READ_ONLY_RULE prompt below (advisory, kept as
// defense-in-depth) — this workflow does NOT runtime-guarantee zero mutation. For a hard
// no-mutation guarantee, define a Read/Grep/Glob-only custom agent type and set it in
// AUDIT_AGENT_TYPE (see the // CUSTOMIZE there). See README §3 for the binary-verified evidence.
// Invoke: Workflow({ name: 'audit', args: '<scope or dimension list>' })

// ── Tunables (CUSTOMIZE: adjust to the size/cost budget of your audit) ──
const MAX_DIMENSIONS = 8       // cap on parallel finder agents; over-cap dimensions are NOT silently
                              // dropped — they are tracked as droppedDimensions and force incomplete:true (F4)
const MAX_FINDINGS_VERIFIED = 40 // cap on findings sent to the verify stage; over-cap findings are NOT
                              // silently dropped — they are carried as overflowFindings (never verified)
                              // and force incomplete:true, fail-closed (F4 — see Find phase)
const VERIFY_VOTES = 1         // skeptical re-checks per finding; raise to 3 for adversarial multi-vote

// CUSTOMIZE: default audit dimensions used when the Scope agent cannot derive them
// from args. Generic software-audit axes — replace with the axes that matter for
// your project (kept domain-neutral on purpose).
const DEFAULT_DIMENSIONS = [
  { label: 'security', focus: 'injection, authn/authz gaps, secret handling, unsafe deserialization' },
  { label: 'correctness', focus: 'logic bugs, unhandled errors, race conditions, off-by-one' },
  { label: 'performance', focus: 'N+1 queries, unbounded loops, missing memoization/indexes' },
  { label: 'dead-code', focus: 'unused exports, unreachable branches, orphaned files' },
  { label: 'type-safety', focus: 'any/unknown leaks, unchecked casts, missing null guards' },
]

// ── Structured-output schemas (the runtime forces StructuredOutput when schema is set) ──
const SCOPE_SCHEMA = {
  type: 'object',
  required: ['target', 'dimensions'],
  properties: {
    target: { type: 'string' },
    strategy: { type: 'string' },
    dimensions: {
      type: 'array', minItems: 1, maxItems: MAX_DIMENSIONS,
      items: {
        type: 'object', required: ['label', 'focus'],
        properties: {
          label: { type: 'string' },
          focus: { type: 'string' },
          where: { type: 'string' }, // optional path/glob hint for the finder
        },
      },
    },
  },
}
const FIND_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array', maxItems: 15,
      items: {
        type: 'object', required: ['title', 'severity', 'location', 'evidence'],
        properties: {
          title: { type: 'string' },
          severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
          location: { type: 'string' },   // file:line or symbol
          evidence: { type: 'string' },    // quoted snippet / concrete observation
          recommendation: { type: 'string' },
        },
      },
    },
  },
}
// F6 ELEMENT-LEVEL VALIDATION (runtime enforcement of FIND_SCHEMA's per-element contract — completes F5's
// array-level guard at the element grain; codex round-17): the structured-output runtime SHOULD reject
// schema-violating finder output, but a skipped-schema run or a degraded finder can still surface
// `findings:[{}]`, `[{title:123}]`, an element missing a required field, or an out-of-enum severity. An
// array `findings` (the F5/F11 check) does NOT prove each ELEMENT is well-formed — so every element is
// re-validated here BEFORE it flows downstream into `f.title.slice(...)` (verify label) / `sevRank[severity]`
// (synthesis sort), which would otherwise THROW / mis-sort on a malformed element — turning a degraded finder
// into a HARD CRASH instead of an honest incomplete (degraded-agent fail-closed violated). Allowed severities
// mirror FIND_SCHEMA's enum (single source — no duplicated magic strings).
const ALLOWED_SEVERITIES = new Set(FIND_SCHEMA.properties.findings.items.properties.severity.enum)
const isValidFinding = (f) =>
  !!f && typeof f === 'object' &&
  typeof f.title === 'string' &&
  typeof f.severity === 'string' && ALLOWED_SEVERITIES.has(f.severity) &&
  typeof f.location === 'string' &&
  typeof f.evidence === 'string'
const VERDICT_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'rationale'],
  properties: {
    confirmed: { type: 'boolean' },      // false = false positive, drop it
    rationale: { type: 'string' },
    severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] }, // verifier may downgrade
  },
}
const REPORT_SCHEMA = {
  type: 'object',
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', required: ['title', 'severity', 'locations', 'detail'],
        properties: {
          title: { type: 'string' },
          severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
          locations: { type: 'array', items: { type: 'string' } },
          detail: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

// File-edit-blocking agent type. 'Explore' is a built-in agent type whose
// `disallowedTools` include Edit/Write/NotebookEdit (and Task/Agent spawning) — verified
// verbatim against the Claude Code CLI 2.1.183 binary (`{agentType:"Explore",
// source:"built-in", disallowedTools:[Agent, ExitPlanMode, Edit, Write, NotebookEdit],
// model:"haiku", …}`) and named in the workflow agent() API doc as a valid value
// ("opts.agentType uses a custom subagent type (e.g. 'Explore', 'code-reviewer') …
// resolved from the same registry as the Agent tool"). This makes FILE MUTATION
// (Edit/Write/NotebookEdit) runtime-blocked, not prompt-only — but Explore does NOT block
// Bash, so it is NOT an absolute read-only guarantee (a shell command could still mutate;
// that is suppressed only by READ_ONLY_RULE below, advisory).
// CUSTOMIZE: 'Explore' blocks file edits but allows Bash. For a HARD no-mutation guarantee,
// register a custom agent type whose allowed tools are exactly Read/Grep/Glob (no Bash, no
// edit tools) and put its name here — then shell mutation is runtime-blocked too.
const AUDIT_AGENT_TYPE = 'Explore'

// Defense-in-depth prompt rule. Explore runtime-blocks file edits but NOT Bash, so a
// mutating shell command is only prevented by this instruction — keep it.
const READ_ONLY_RULE =
  'STRICT READ-ONLY: use ONLY Read, Grep, and Glob. Do NOT edit, write, create, ' +
  'delete, or run any mutating command. You are auditing, not fixing.'

// ─── Phase 1: Scope — decompose the audit target into dimensions ───
phase('Scope')
const TARGET = (typeof args === 'string' && args.trim()) || ''
const scope = await agent(
  'You are scoping a read-only audit.\n\n' +
  '## Audit target\n' + (TARGET || '(no explicit target given — audit the project as described in .claude/project.md)') + '\n\n' +
  '## Task\nDecompose this audit into independent dimensions (axes) that can be investigated in parallel.\n' +
  'Pick axes that fit the target. Common axes: security · correctness · performance · accessibility · dead-code · type-safety · dependency risk.\n' +
  'For each dimension give a short `focus` (what specifically to look for) and, if known, a `where` path/glob hint.\n' +
  'Keep dimensions non-overlapping. ' + READ_ONLY_RULE + '\n\nStructured output only.',
  { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA, agentType: AUDIT_AGENT_TYPE }
)

// F5 FAIL-CLOSED (scope consumption — completes the agent-output guard sweep; codex round-16): the
// Scope agent can return null (skipped/died — runtime contract), a malformed object whose `dimensions`
// is present but NOT a usable array, or a valid result. NEVER call an array method on an unvalidated
// value. The OLD `scope && scope.dimensions && scope.dimensions.length` treated a truthy `.length` as
// proof of an array — but a non-array carrier (e.g. a string `'bad'` has `.length`, an object can carry
// a `length` field) would pass that check and then THROW on `scopedDimensions.slice(...).map(...)` BELOW
// — BEFORE the failedDimensions / incomplete accounting — turning a degraded scope into a HARD CRASH
// (degraded-agent fail-closed violated: an audit degradation became a thrown error instead of an
// honest incomplete result).
const dimsRaw = scope != null ? scope.dimensions : undefined
// MALFORMED scope: `dimensions` is present but not a usable dimension array — either not an array at
// all, or an array carrying an element without a string `label`/`focus` (the contract each finder
// consumes via dim.label/dim.focus below). This is a degraded agent output, NOT an accepted "no result":
// fail closed (incomplete) — do NOT silently fall back to DEFAULT_DIMENSIONS (that would mask a broken
// scope as a clean run) and do NOT call array methods on a non-array (that would throw). The `||`
// short-circuits so `.some` is only reached when dimsRaw IS an array (no method call on a non-array).
const scopeMalformed =
  dimsRaw != null &&
  (!Array.isArray(dimsRaw) ||
    dimsRaw.some(d => !d || typeof d.label !== 'string' || typeof d.focus !== 'string'))
if (scopeMalformed) {
  log('Scope MALFORMED — `dimensions` is not a usable dimension array (' +
    (Array.isArray(dimsRaw) ? 'array with a malformed element' : typeof dimsRaw) +
    '); audit INCOMPLETE, nothing audited.')
  return {
    target: TARGET,
    incomplete: true,
    summary: 'Audit INCOMPLETE — the Scope agent returned a malformed `dimensions` value (' +
      (Array.isArray(dimsRaw) ? 'array with a malformed element (missing string label/focus)' : typeof dimsRaw + ', not an array') +
      '); no dimension could be derived, so NOTHING was audited (NOT a clean result). Re-run the scope step.',
    findings: [],
    error: 'malformed-scope',
    stats: { dimensions: 0, failedDimensions: 0, droppedDimensions: 0, malformedFindings: 0, findings: 0 },
  }
}
// ABSENT scope (scope null, or dimensions null/empty) → fall back to the default axes — the
// explicitly-accepted fallback for a skipped/empty scope (audit is read-only). A VALID non-empty array
// of well-formed dimensions → use it.
const scopedDimensions = (Array.isArray(dimsRaw) && dimsRaw.length) ? dimsRaw : DEFAULT_DIMENSIONS
const dimensions = scopedDimensions.slice(0, MAX_DIMENSIONS)
// F4 OVERFLOW ACCOUNTING (dimensions — no silent slice): SCOPE_SCHEMA caps dimensions at
// maxItems:MAX_DIMENSIONS so a schema-valid scope cannot exceed it, but a skipped-schema run or an
// oversized DEFAULT_DIMENSIONS edit could. A dimension dropped by the cap is an UN-AUDITED axis (the same
// fail-closed class as a failed finder), so it is tracked here and folded into `incomplete` below — the
// cap must never silently shrink the audit surface and let the result read as clean. (audit is read-only,
// so incomplete:true is the right fail-closed mode — not abort.)
const droppedDimensions = scopedDimensions.slice(MAX_DIMENSIONS).map(d => (d && d.label) || '(unlabeled)')
log('Auditing ' + dimensions.length + ' dimensions: ' + dimensions.map(d => d.label).join(', ') +
  (droppedDimensions.length ? ' — ' + droppedDimensions.length + ' OVER MAX_DIMENSIONS cap, dropped (run will be incomplete): ' + droppedDimensions.join(', ') : ''))

// ─── Phase 2: Find — one read-only finder per dimension, in parallel ───
phase('Find')
// F11 FAIL-CLOSED (audit finder — mirrors migrate/test-gen's degraded-discovery handling; completes
// the 3-template parity): a finder can return null (the agent was skipped mid-run or died on a terminal
// API error after retries — runtime contract) or a malformed object (no `findings` array — schema
// unmet), and a THROWING outer thunk can itself null-resolve here. The OLD
// `r => (r && r.findings ? r.findings.map(...) : [])` collapsed EVERY such DEGRADED finder into the SAME
// empty array as a finder that VALIDLY found nothing — so if all finders skipped/died the Find phase
// read as "No findings across N dimensions" (a CLEAN audit) when in truth NOTHING was audited
// (false-clean — dangerous for a security/correctness audit). So each finder is classified VALID
// (structured result carrying a findings array, possibly empty = a genuine per-dimension clean) vs
// FAILED (null / malformed), and a failed finder is tracked as an UN-AUDITED dimension instead of a
// silent empty. A failed required finder makes the run `incomplete:true` (below) — never a clean report.
const finderResultsRaw = await parallel(
  dimensions.map(dim => () =>
    agent(
      '## Finder: ' + dim.label + '\n\n' +
      'Audit target: ' + (TARGET || '(see .claude/project.md)') + '\n' +
      'Dimension: **' + dim.label + '** — ' + dim.focus + '\n' +
      (dim.where ? 'Scope hint: ' + dim.where + '\n' : '') +
      '\n## Task\nSearch the codebase for concrete issues in this dimension. For each finding give a precise ' +
      'location (file:line or symbol), a quoted evidence snippet, a severity, and a recommendation. ' +
      'Report only real, defensible findings — no speculation. ' + READ_ONLY_RULE + '\n\nStructured output only.',
      { label: 'find:' + dim.label, phase: 'Find', schema: FIND_SCHEMA, agentType: AUDIT_AGENT_TYPE }
    ).then(r => {
      // VALID finder = structured output with a findings array (0 findings is a GENUINE clean for this
      // dimension); FAILED = null (skipped/died) or malformed (no findings array). Never map a failed
      // finder to a clean empty.
      if (!(r && Array.isArray(r.findings)))
        return { dimension: dim.label, ok: false, findings: [], malformed: [] }
      // F6 ELEMENT-LEVEL FAIL-CLOSED: an array `findings` does NOT prove each ELEMENT is well-formed. A
      // degraded finder can return `findings:[{}]` / `[{title:123}]` / an out-of-enum severity — the OLD
      // `r.findings.map(f => ({...f}))` accepted those raw, so a malformed element flowed downstream and
      // THREW at `f.title.slice(0,30)` / mis-sorted on `sevRank[severity]` (degraded finder → hard crash).
      // So validate EVERY element: well-formed elements are kept (tagged with the dimension); malformed ones
      // are NOT passed downstream (never reach f.title.slice etc.) but tracked as malformed candidates that
      // force incomplete:true below — never silently dropped, never crashing.
      const findings = []
      const malformed = []
      for (const f of r.findings) {
        if (isValidFinding(f)) findings.push({ ...f, dimension: dim.label })
        else malformed.push({ dimension: dim.label })
      }
      return { dimension: dim.label, ok: true, findings, malformed }
    })
  )
)
// F8 FAIL-CLOSED (codex Phase 33 #19 — parallel() result normalization, mirror of test-gen's
// `Array.isArray(genResults) ? ... : []` and migrate's results guard; completes the 3-template parity):
// the OLD code chained `.map` DIRECTLY onto the raw `await parallel(...)` value. The documented runtime
// contract is that parallel() ALWAYS returns an array (a throwing thunk resolves to a null ELEMENT, never
// rejects), so `.map` is contract-safe — but migrate/test-gen normalize their parallel/pipeline outputs
// before any array method, and audit must be consistent: a degraded finder fan-out that returned a
// null/non-array value would THROW here on `.map` (a degraded run → HARD CRASH) instead of the honest
// incomplete this template guarantees everywhere else (degraded-agent fail-closed). So normalize to an
// array FIRST; a non-array result yields an empty array, which leaves finderResults[i] undefined for EVERY
// dimension ⇒ each falls through to the failed fallback below ⇒ all dimensions failed ⇒ findersComplete=false
// ⇒ incomplete:true (never a clean read), crash 0.
const finderResults = Array.isArray(finderResultsRaw) ? finderResultsRaw : []
const findPerDim = dimensions.map((dim, i) =>
  // Defensive: a throwing outer thunk can null-resolve (codex finding), AND a non-array parallel() result
  // (normalized to []) leaves finderResults[i] undefined — both recover the dimension label by index and
  // count it as a FAILED finder (fail-closed), never a silent drop. `malformed:[]` keeps the later
  // flatMap(d => d.malformed) total well-formed (every entry must carry the array).
  finderResults[i] || { dimension: dim.label, ok: false, findings: [], malformed: [] }
)
const failedDimensions = findPerDim.filter(d => !d.ok).map(d => d.dimension)
const findersComplete = failedDimensions.length === 0
// F6: malformed finding elements (well-formed finder, bad element) are un-usable surface — collected here,
// never passed to verify/synthesis, and folded into `incomplete` below exactly like overflow/unverified.
const malformedFindings = findPerDim.flatMap(d => d.malformed)
// F4 OVERFLOW ACCOUNTING (findings — no silent slice): the OLD code did
// `flatMap(...).slice(0, MAX_FINDINGS_VERIFIED)`, so finding #41+ vanished from the workflow entirely —
// never verified, never registered as unverified, never counted in stats.rawFindings, never able to flip
// `incomplete`. A broad security/correctness audit that surfaces 40+ candidates (FIND_SCHEMA allows 15
// per finder × up to MAX_DIMENSIONS finders) would then SILENTLY DROP real high-severity findings and
// still report "all refuted"/a clean surviving subset — the unverified-candidate fail-closed intent
// violated. So: track the PRE-cap raw count, verify up to the cap, and carry the OVER-cap findings as
// `overflowFindings` (never verified ⇒ the same fail-closed class as `unverified`), which forces
// `incomplete:true` below. audit is read-only, so incomplete (not abort) is the right fail-closed mode.
const rawFindingsAll = findPerDim.flatMap(d => d.findings)
const rawFindingsCount = rawFindingsAll.length
const allFindings = rawFindingsAll.slice(0, MAX_FINDINGS_VERIFIED)
const overflowFindings = rawFindingsAll.slice(MAX_FINDINGS_VERIFIED) // over-cap: accounted, never silently dropped
log('Collected ' + rawFindingsCount + ' raw findings from ' + (dimensions.length - failedDimensions.length) +
  '/' + dimensions.length + ' finders' +
  (failedDimensions.length ? ' — ' + failedDimensions.length + ' FAILED (' + failedDimensions.join(', ') + ')' : '') +
  (malformedFindings.length ? ' — ' + malformedFindings.length + ' MALFORMED finding element(s) discarded (run will be incomplete)' : '') +
  (overflowFindings.length ? ' — ' + overflowFindings.length + ' OVER MAX_FINDINGS_VERIFIED cap, NOT verified (run will be incomplete)' : '') +
  ' → verifying ' + allFindings.length)

if (allFindings.length === 0) {
  // overflowFindings is necessarily empty here (allFindings empty ⇒ rawFindingsCount 0 ⇒ no over-cap), so
  // the degradation sources at this point are FAILED finders, DROPPED (over-cap) dimensions, and MALFORMED
  // finding elements (F6 — a finder that returned ONLY malformed elements yields 0 valid findings here).
  if (findersComplete && droppedDimensions.length === 0 && malformedFindings.length === 0) {
    // GENUINE clean: every finder returned a valid structured result, every element was well-formed, found
    // nothing, and no dimension was dropped by the cap.
    return { target: TARGET, summary: 'No findings across ' + dimensions.length + ' dimensions.', findings: [], stats: { dimensions: dimensions.length, failedDimensions: 0, droppedDimensions: 0, malformedFindings: 0, findings: 0 } }
  }
  // FALSE-clean guard (F11 + F4 + F6): one or more finders skipped/died/returned malformed output, AND/OR
  // one or more dimensions were dropped by MAX_DIMENSIONS, AND/OR one or more finding elements were
  // malformed and discarded — so the absence of findings is UNPROVEN. Report `incomplete:true` (+ the
  // degradation details) so the caller can tell this degraded run apart from a genuine all-clean.
  const allFailed = failedDimensions.length === dimensions.length && droppedDimensions.length === 0 && malformedFindings.length === 0
  return {
    target: TARGET,
    incomplete: true,
    summary: allFailed
      ? 'Audit INCOMPLETE — all ' + dimensions.length + ' finder(s) failed (skipped/died/malformed); no ' +
        'dimension was actually audited, so the absence of findings is unproven (NOT a clean result). Re-run.'
      : 'Audit INCOMPLETE — the run is degraded so the absence of findings is unproven (NOT a clean result)' +
        (failedDimensions.length ? '; ' + failedDimensions.length + ' finder(s) failed (skipped/died/malformed): ' + failedDimensions.join(', ') : '') +
        (droppedDimensions.length ? '; ' + droppedDimensions.length + ' dimension(s) over MAX_DIMENSIONS cap: ' + droppedDimensions.join(', ') : '') +
        (malformedFindings.length ? '; ' + malformedFindings.length + ' finding element(s) MALFORMED (missing/invalid required fields) and discarded' : '') +
        '. Re-run the degraded steps.',
    findings: [],
    failedDimensions,
    ...(droppedDimensions.length ? { droppedDimensions } : {}),
    ...(malformedFindings.length ? { malformedFindings: malformedFindings.map(m => ({ dimension: m.dimension })) } : {}),
    stats: { dimensions: dimensions.length, failedDimensions: failedDimensions.length, droppedDimensions: droppedDimensions.length, malformedFindings: malformedFindings.length, findings: 0 },
  }
}

// ─── Phase 3: Verify — skeptical re-check, drop false positives ───
phase('Verify')
// F11 FAIL-CLOSED (audit verifier): a verifier vote can be null (skipped/died) or malformed (no boolean
// `confirmed` — schema unmet), and a THROWING outer thunk can null-resolve a whole candidate. The OLD
// code did `valid = verdicts.filter(Boolean)` then `survives = valid.length > 0 && valid.every(confirmed)`
// and returned `null` (→ dropped, reported as "refuted") for every non-survivor — so a candidate whose
// votes ALL failed (`valid.length === 0`, NEVER actually checked) was reported as REFUTED, identical to a
// genuinely-disproven finding. Dropping an UNVERIFIED candidate as refuted is a false-clean (a real issue
// silently discarded). So triage each candidate THREE ways: CONFIRMED (≥1 valid vote, all valid votes
// confirm), REFUTED (≥1 valid vote, some valid vote disconfirms), UNVERIFIED (no valid vote — never
// checked). Unverified is tracked separately and makes the run `incomplete` — it is never folded into
// refuted, and never silently dropped.
const triagedResultsRaw = await parallel(
  allFindings.map(f => () =>
    parallel(
      Array.from({ length: VERIFY_VOTES }, () => () =>
        agent(
          '## Skeptical verifier (read-only)\n\n' +
          'Try to DISPROVE this audit finding. Confirm it only if the evidence holds up.\n\n' +
          '**Dimension:** ' + f.dimension + '\n**Finding:** ' + f.title + '\n' +
          '**Severity (claimed):** ' + f.severity + '\n**Location:** ' + f.location + '\n' +
          '**Evidence:** ' + f.evidence + '\n\n' +
          '## Checklist\n1. Re-read the cited location — does the code actually exhibit this issue?\n' +
          '2. Is it a false positive (guarded elsewhere, intentional, already mitigated)?\n' +
          '3. Is the claimed severity accurate, or should it be down/upgraded?\n' +
          'Set confirmed=false for false positives. ' + READ_ONLY_RULE + '\n\nStructured output only.',
          // F6 belt-and-suspenders: every `f` here came through isValidFinding (string title guaranteed),
          // so `.slice` is safe — String() makes the label crash-proof even if a future refactor lets an
          // unvalidated finding reach this point (the codex-named crash site stays crash-0 unconditionally).
          { label: 'verify:' + String(f.title).slice(0, 30), phase: 'Verify', schema: VERDICT_SCHEMA, agentType: AUDIT_AGENT_TYPE }
        )
      )
    ).then(votes => {
      // F8 FAIL-CLOSED (codex Phase 33 #19 — per-finding vote fan-out parallel() normalization): `votes`
      // is a raw `await parallel(...)` value consumed by `.filter` below. The runtime contract says
      // parallel() always returns an array (throwing votes resolve to null ELEMENTS), but mirror
      // migrate/test-gen and normalize FIRST — a degraded non-array vote result would THROW on `.filter`
      // (a degraded verifier → hard crash). A non-array normalizes to [] ⇒ no valid vote ⇒ this candidate
      // is marked UNVERIFIED below (fail-closed: never silently refuted/dropped), crash 0.
      const verdicts = Array.isArray(votes) ? votes : []
      // A valid vote carries a boolean `confirmed`; null / malformed votes are NOT evidence.
      const valid = verdicts.filter(v => v && typeof v.confirmed === 'boolean')
      // F7 (codex Phase 33 #18 — final defensive sweep): the verifier MAY down/upgrade severity
      // (VERDICT_SCHEMA.severity is optional), but a degraded verifier can return an OUT-OF-ENUM value
      // (e.g. {confirmed:true, severity:'bogus'}). The OLD `(valid.find(v => v.severity) || {}).severity
      // || f.severity` accepted ANY truthy severity with NO enum check — so 'bogus' REPLACED the finding's
      // already-validated severity and flowed downstream into synthesis, where `sevRank['bogus']` is
      // undefined ⇒ the sort comparator goes NaN (ranking corrupted) and the salvage exit could return the
      // invalid-severity finding directly. So accept a verifier severity ONLY if it is in ALLOWED_SEVERITIES
      // (the SAME enum every finding's own severity is validated against via isValidFinding); an invalid one
      // is IGNORED and the finding keeps its already-validated `f.severity`. The surviving finding therefore
      // ALWAYS carries an enum-valid severity ⇒ sevRank lookup is never undefined (no rank corruption).
      const verifierSeverity = (valid.find(v => typeof v.severity === 'string' && ALLOWED_SEVERITIES.has(v.severity)) || {}).severity
      const severity = verifierSeverity || f.severity
      // No valid vote => UNVERIFIED (never actually checked) — NOT refuted. ≥1 valid vote: all-confirm
      // keeps (confirmed), any disconfirm refutes (a real false positive).
      const verdict = valid.length === 0 ? 'unverified' : (valid.every(v => v.confirmed) ? 'confirmed' : 'refuted')
      return { ...f, severity, verdict }
    })
  )
)
// F8 FAIL-CLOSED (codex Phase 33 #19 — verifier fan-out parallel() normalization, mirror of the finder
// guard above and migrate/test-gen): the OLD code chained `.map` DIRECTLY onto the raw `await parallel(...)`
// value. Normalize to an array FIRST (3-template consistency); a non-array verifier fan-out yields an empty
// array, leaving triagedResults[i] undefined for EVERY candidate ⇒ each is marked UNVERIFIED below ⇒
// unverified.length > 0 ⇒ incomplete:true — never a throw on `.map`, never a silently-refuted candidate.
const triagedResults = Array.isArray(triagedResultsRaw) ? triagedResultsRaw : []
const triaged = allFindings.map((f, i) =>
  // Defensive: a throwing outer thunk can null-resolve (codex finding), AND a non-array parallel() result
  // (normalized to []) leaves triagedResults[i] undefined — both recover the finding by index and mark it
  // UNVERIFIED (fail-closed: an un-checkable candidate is never silently refuted/dropped).
  triagedResults[i] || { ...f, verdict: 'unverified' }
)
const verified = triaged.filter(t => t.verdict === 'confirmed')
const refuted = triaged.filter(t => t.verdict === 'refuted')
const unverified = triaged.filter(t => t.verdict === 'unverified')
log('Verify: ' + allFindings.length + ' candidates → ' + verified.length + ' confirmed, ' + refuted.length +
  ' refuted, ' + unverified.length + ' unverified (verifier skipped/died/malformed)')

// The run is INCOMPLETE (degraded — not a trustworthy clean) if any finder failed OR any candidate could
// not be verified. `degraded` is spread into every remaining return so a false-clean is never reported
// as a clean all-clear; it carries the machine-readable `incomplete:true` plus the un-audited dimensions
// and the unverified candidates so the caller can re-run only the degraded steps.
// F4: a dropped (over-cap) dimension and an over-cap finding are BOTH un-checked surface — each forces
// incomplete, exactly like a failed finder or an unverified candidate. No silent truncation can read clean.
// F6: a malformed finding element (discarded before verify) is also un-checked surface — same class.
const incomplete = !findersComplete || unverified.length > 0 || overflowFindings.length > 0 || droppedDimensions.length > 0 || malformedFindings.length > 0
const degraded = {
  ...(incomplete ? { incomplete: true } : {}),
  ...(failedDimensions.length ? { failedDimensions } : {}),
  ...(droppedDimensions.length ? { droppedDimensions } : {}),
  ...(unverified.length ? { unverified: unverified.map(u => ({ title: u.title, severity: u.severity, location: u.location, dimension: u.dimension })) } : {}),
  ...(overflowFindings.length ? { overflowFindings: overflowFindings.map(o => ({ title: o.title, severity: o.severity, location: o.location, dimension: o.dimension })) } : {}),
  ...(malformedFindings.length ? { malformedFindings: malformedFindings.map(m => ({ dimension: m.dimension })) } : {}),
}

if (verified.length === 0) {
  // No finding survived verification. This is a genuine "all refuted" clean ONLY if every candidate was
  // actually refuted by a valid vote AND every finder ran — otherwise it is INCOMPLETE (some candidate
  // unverified, or some dimension un-audited) and must NOT read as a clean all-clear.
  return {
    target: TARGET,
    ...degraded,
    summary: incomplete
      ? 'Audit INCOMPLETE — 0 confirmed findings, but the run is degraded' +
        (unverified.length ? '; ' + unverified.length + ' candidate(s) UNVERIFIED (verifier skipped/died/malformed)' : '') +
        (overflowFindings.length ? '; ' + overflowFindings.length + ' finding(s) OVER MAX_FINDINGS_VERIFIED cap (never verified)' : '') +
        (malformedFindings.length ? '; ' + malformedFindings.length + ' finding element(s) MALFORMED (discarded before verify)' : '') +
        (failedDimensions.length ? '; ' + failedDimensions.length + ' finder(s) FAILED: ' + failedDimensions.join(', ') : '') +
        (droppedDimensions.length ? '; ' + droppedDimensions.length + ' dimension(s) OVER MAX_DIMENSIONS cap: ' + droppedDimensions.join(', ') : '') +
        '. NOT a clean result — re-run the degraded steps.'
      : 'All ' + allFindings.length + ' candidate findings were refuted on verification.',
    findings: [],
    stats: { dimensions: dimensions.length, failedDimensions: failedDimensions.length, droppedDimensions: droppedDimensions.length, malformedFindings: malformedFindings.length, rawFindings: rawFindingsCount, verifiedCandidates: allFindings.length, overflowFindings: overflowFindings.length, confirmed: 0, refuted: refuted.length, unverified: unverified.length },
  }
}

// ─── Phase 4: Synthesize — merge duplicates, rank by severity ───
phase('Synthesize')
const sevRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const block = [...verified]
  .sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
  .map((f, i) => '### [' + i + '] (' + f.severity + ', ' + f.dimension + ') ' + f.title + '\n' +
    'Location: ' + f.location + '\nEvidence: ' + f.evidence + '\n' +
    (f.recommendation ? 'Recommendation: ' + f.recommendation + '\n' : ''))
  .join('\n')

const report = await agent(
  '## Synthesis: audit report\n\n' +
  '**Target:** ' + (TARGET || '(project)') + '\n\n' +
  verified.length + ' findings survived verification across ' + dimensions.length + ' dimensions.\n\n' +
  '## Confirmed findings\n' + block + '\n\n' +
  '## Instructions\n' +
  '1. Merge findings that describe the same underlying issue — combine their locations.\n' +
  '2. Rank by severity (critical first), then by blast radius.\n' +
  '3. Write a 3-5 sentence executive summary.\n' +
  '4. List any open questions the audit could not resolve.\n' + READ_ONLY_RULE + '\n\nStructured output only.',
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT_SCHEMA, agentType: AUDIT_AGENT_TYPE }
)

if (!report || !Array.isArray(report.findings)) {
  // F5 FAIL-CLOSED (synthesis consumption): the synthesis agent can return null (skipped/died) OR a
  // malformed object whose `findings` is not an array (schema unmet on a skipped-schema run). Consuming
  // `report.findings.length` on the success path below would THROW on a malformed report — so validate
  // the array BEFORE use and route both null and malformed to this salvage exit. Salvage the verified
  // findings rather than discarding the run. `degraded` is still spread so any upstream finder failure /
  // unverified candidate stays visible (incomplete:true) even on this fallback path — a degraded run
  // never loses its honesty on the salvage exit.
  return {
    target: TARGET,
    ...degraded,
    summary: 'Synthesis step skipped or returned malformed output — returning ' + verified.length + ' verified findings unmerged.',
    findings: verified.map(f => ({ title: f.title, severity: f.severity, locations: [f.location], detail: f.evidence, recommendation: f.recommendation })),
    stats: { dimensions: dimensions.length, failedDimensions: failedDimensions.length, droppedDimensions: droppedDimensions.length, malformedFindings: malformedFindings.length, rawFindings: rawFindingsCount, verifiedCandidates: allFindings.length, overflowFindings: overflowFindings.length, confirmed: verified.length, refuted: refuted.length, unverified: unverified.length, afterSynthesis: 0 },
  }
}

return {
  target: TARGET,
  // Spread `degraded` FIRST so the synthesized report's fields win on any (non-existent) key overlap —
  // but on an incomplete run, override `summary` AFTER `...report` to prefix the degradation up front so
  // the human-readable summary is honest too (the machine-readable `incomplete:true` rides in `degraded`).
  ...degraded,
  ...report,
  ...(incomplete ? { summary: 'Audit INCOMPLETE (degraded run — see incomplete / failedDimensions / droppedDimensions / malformedFindings / unverified / overflowFindings). ' + (report.summary || '') } : {}),
  stats: {
    dimensions: dimensions.length,
    failedDimensions: failedDimensions.length,
    droppedDimensions: droppedDimensions.length,
    malformedFindings: malformedFindings.length,
    rawFindings: rawFindingsCount,
    verifiedCandidates: allFindings.length,
    overflowFindings: overflowFindings.length,
    confirmed: verified.length,
    refuted: refuted.length,
    unverified: unverified.length,
    afterSynthesis: report.findings.length,
    agentCalls: 1 + dimensions.length + (allFindings.length * VERIFY_VOTES) + 1,
  },
}
