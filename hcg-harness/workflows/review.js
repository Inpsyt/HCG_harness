export const meta = {
  name: 'review',
  description:
    'Read-oriented code-REVIEW fan-out over a changeset (a diff range / PR / scope) — decompose review into independent dimensions, run one reviewer agent per dimension in parallel (each finding tagged KIND: gating vs non-gating, per codex D9), adversarially verify the GATING findings to drop false positives, then synthesize a gate verdict (PASS/FAIL) with a non-gating appendix. Read-only: every agent runs as the built-in `Explore` agent type (file edits runtime-blocked; shell mutation advisory). Complements the codex-review gate as an in-harness Claude fan-out — it does NOT replace your CI.',
  whenToUse:
    'When you want a multi-dimension review of a changeset (a phase diff, a PR, or a scoped set of files) and want findings split into GATING (correctness/safety defect OR explicit requirement/contract violation → would fail the gate) vs NON-GATING (gap/enhancement/over-design/style → appendix, never fails the gate — codex D9). Pass the diff range / PR / file scope as args (e.g. "abc123...HEAD", "PR 42", "src/auth/**"). This is review-ONLY (no edits); for changes use the migrate workflow.',
  phases: [
    { title: 'Scope', detail: 'Resolve the changeset (args) + decompose review into independent dimensions' },
    { title: 'Find', detail: 'One reviewer agent per dimension, in parallel — each finding tagged KIND (gating/non-gating)' },
    { title: 'Verify', detail: 'Adversarially re-check the GATING findings to drop false positives' },
    { title: 'Synthesize', detail: 'Emit a gate verdict (PASS/FAIL) + non-gating appendix' },
  ],
}

// review: Scope → parallel(Find per dimension) → Verify (gating findings only) → Synthesize (gate verdict)
// Generic, runnable skeleton. The changeset + project specifics are injected via args / .claude/project.md.
//
// DELIBERATELY LIGHTER than audit.js: this template carries the ESSENTIAL fail-closed guards (null/array
// normalization, degraded-finder/verifier → incomplete, never a false PASS) but NOT the 20-round
// defensive-hardening sweep audit.js accreted — consistent with the harness's own D9 anti-over-design
// philosophy (don't gold-plate a prototype template). Harden further only if a real run exposes a gap.
//
// READ-ONLY: every ag() call sets agentType:'Explore' (built-in) → Edit/Write/NotebookEdit are
// runtime-blocked. Explore does NOT block Bash, so a mutating shell command is only prompt-suppressed
// (READ_ONLY_RULE, advisory). For a hard no-mutation guarantee set a Read/Grep/Glob-only REVIEW_AGENT_TYPE.
// Invoke: Workflow({ name: 'review', args: '<diff range | PR | file scope>' })

// ── Tunables (CUSTOMIZE) ──
const MAX_DIMENSIONS = 6        // cap on parallel reviewer agents
const MAX_GATING_VERIFIED = 30  // cap on gating findings sent to verify; over-cap are carried as overflow (→ incomplete)
const VERIFY_VOTES = 1          // adversarial re-checks per gating finding; raise to 3 for multi-vote
const REVIEW_AGENT_TYPE = 'Explore' // built-in read-only agent type (blocks file edits; see note above)

// CUSTOMIZE: default review dimensions when the Scope agent cannot derive them from args.
const DEFAULT_DIMENSIONS = [
  { label: 'correctness', focus: 'logic bugs, unhandled errors, race conditions, off-by-one, wrong edge cases' },
  { label: 'security', focus: 'injection, authz/authn gaps, secret handling, unsafe input at trust boundaries' },
  { label: 'contracts', focus: 'divergence from contracts/ (db-schema, api-spec, shared-types, design-guide) or the stated requirement' },
  { label: 'performance', focus: 'N+1 queries, unbounded work, missing indexes/memoization introduced by the change' },
  { label: 'tests', focus: 'missing/weak tests for the changed behavior; tests that would pass while the code is wrong' },
]

const READ_ONLY_RULE =
  'STRICT READ-ONLY: use ONLY Read, Grep, and Glob (and, if needed to read the diff, a non-mutating git ' +
  'command). Do NOT edit, write, create, delete, or run any mutating command. You are reviewing, not fixing.'

// KIND is the D9 axis: GATING = correctness/safety defect OR explicit requirement/contract violation;
// NON-GATING = gap/enhancement/over-design/style (codex-review skill §게이트 범위 D9). Only confirmed
// gating findings fail the gate; non-gating ride the appendix regardless of severity.
const KINDS = ['gating', 'non-gating']

// ── Structured-output schemas ──
const SCOPE_SCHEMA = {
  type: 'object',
  required: ['changeset', 'dimensions'],
  properties: {
    changeset: { type: 'string' },   // the resolved diff range / PR / scope being reviewed
    strategy: { type: 'string' },
    dimensions: {
      type: 'array', minItems: 1, maxItems: MAX_DIMENSIONS,
      items: {
        type: 'object', required: ['label', 'focus'],
        properties: { label: { type: 'string' }, focus: { type: 'string' }, where: { type: 'string' } },
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
        type: 'object', required: ['title', 'kind', 'severity', 'location', 'evidence'],
        properties: {
          title: { type: 'string' },
          kind: { enum: KINDS },
          severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
          location: { type: 'string' },
          evidence: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
  },
}
const ALLOWED_KINDS = new Set(KINDS)
const ALLOWED_SEVERITIES = new Set(FIND_SCHEMA.properties.findings.items.properties.severity.enum)
const isValidFinding = (f) =>
  !!f && typeof f === 'object' &&
  typeof f.title === 'string' &&
  typeof f.kind === 'string' && ALLOWED_KINDS.has(f.kind) &&
  typeof f.severity === 'string' && ALLOWED_SEVERITIES.has(f.severity) &&
  typeof f.location === 'string' &&
  typeof f.evidence === 'string'
const VERDICT_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'rationale'],
  properties: { confirmed: { type: 'boolean' }, rationale: { type: 'string' } },
}
const REPORT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'summary'],
  properties: {
    verdict: { enum: ['pass', 'fail', 'incomplete'] },
    summary: { type: 'string' },
    gating: {
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
    appendix: { type: 'array', items: { type: 'string' } },
  },
}

// ─── Phase 1: Scope ───
phase('Scope')
const TARGET = (typeof args === 'string' && args.trim()) || ''
const scope = await agent(
  'You are scoping a read-only code review of a CHANGESET.\n\n' +
  '## Changeset to review\n' + (TARGET || '(no explicit range given — review the cumulative diff of the current in-progress phase, or HEAD~1...HEAD; see .claude/project.md)') + '\n\n' +
  '## Task\n1. Resolve the changeset (a git diff range, a PR, or a file scope) and state it in `changeset`.\n' +
  '2. Decompose the review into independent dimensions to fan out. Common axes: correctness · security · ' +
  'contracts-conformance · performance · tests. Give each a `focus` and optional `where` hint. Keep them non-overlapping.\n' +
  READ_ONLY_RULE + '\n\nStructured output only.',
  { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA, agentType: REVIEW_AGENT_TYPE }
)

const dimsRaw = scope != null ? scope.dimensions : undefined
const scopeMalformed =
  dimsRaw != null &&
  (!Array.isArray(dimsRaw) || dimsRaw.some(d => !d || typeof d.label !== 'string' || typeof d.focus !== 'string'))
if (scopeMalformed) {
  log('Scope MALFORMED — `dimensions` is not a usable array; review INCOMPLETE.')
  return {
    changeset: TARGET, verdict: 'incomplete', incomplete: true, error: 'malformed-scope',
    summary: 'Review INCOMPLETE — the Scope agent returned a malformed `dimensions` value; nothing was reviewed (NOT a PASS). Re-run scope.',
    gating: [], appendix: [], stats: { dimensions: 0, failedDimensions: 0 },
  }
}
const scopedDimensions = (Array.isArray(dimsRaw) && dimsRaw.length) ? dimsRaw : DEFAULT_DIMENSIONS
const dimensions = scopedDimensions.slice(0, MAX_DIMENSIONS)
const droppedDimensions = scopedDimensions.slice(MAX_DIMENSIONS).map(d => (d && d.label) || '(unlabeled)')
const changeset = (scope && typeof scope.changeset === 'string' && scope.changeset) || TARGET || '(current phase diff)'
log('Reviewing ' + dimensions.length + ' dimensions of [' + changeset + ']: ' + dimensions.map(d => d.label).join(', ') +
  (droppedDimensions.length ? ' — ' + droppedDimensions.length + ' over cap, dropped (incomplete): ' + droppedDimensions.join(', ') : ''))

// ─── Phase 2: Find — one reviewer per dimension ───
phase('Find')
const finderRaw = await parallel(
  dimensions.map(dim => () =>
    agent(
      '## Reviewer: ' + dim.label + '\n\n' +
      'Changeset: ' + changeset + '\n' +
      'Dimension: **' + dim.label + '** — ' + dim.focus + '\n' +
      (dim.where ? 'Scope hint: ' + dim.where + '\n' : '') +
      '\n## Task\nReview ONLY the changeset (the diff), not the whole codebase. For each issue give a precise ' +
      'location (file:line), a quoted evidence snippet, a severity, a recommendation, and — critically — a **KIND**:\n' +
      '- `gating`: a correctness/safety defect (crash, data loss, race, injection, auth bypass, behavior ' +
      'contradicting the code\'s own intent) OR a violation of an explicit requirement / `contracts/` spec.\n' +
      '- `non-gating`: a gap/enhancement ("would be nice to add"), over-design suggestion, or style/naming/refactor — ' +
      'even if you feel it is high severity. Do NOT mark missing nice-to-haves as gating.\n' +
      'Report only real, defensible findings — no speculation. ' + READ_ONLY_RULE + '\n\nStructured output only.',
      { label: 'review:' + dim.label, phase: 'Find', schema: FIND_SCHEMA, agentType: REVIEW_AGENT_TYPE }
    ).then(r => {
      if (!(r && Array.isArray(r.findings)))
        return { dimension: dim.label, ok: false, findings: [] }
      const findings = []
      for (const f of r.findings) if (isValidFinding(f)) findings.push({ ...f, dimension: dim.label })
      return { dimension: dim.label, ok: true, findings }
    })
  )
)
const finderResults = Array.isArray(finderRaw) ? finderRaw : []
const perDim = dimensions.map((dim, i) => finderResults[i] || { dimension: dim.label, ok: false, findings: [] })
const failedDimensions = perDim.filter(d => !d.ok).map(d => d.dimension)
const findersComplete = failedDimensions.length === 0

const allFindings = perDim.flatMap(d => d.findings)
const gatingAll = allFindings.filter(f => f.kind === 'gating')
const nonGating = allFindings.filter(f => f.kind === 'non-gating')
const gating = gatingAll.slice(0, MAX_GATING_VERIFIED)
const overflowGating = gatingAll.slice(MAX_GATING_VERIFIED) // over-cap gating: never verified ⇒ incomplete
log('Found ' + allFindings.length + ' findings (' + gatingAll.length + ' gating, ' + nonGating.length + ' non-gating) from ' +
  (dimensions.length - failedDimensions.length) + '/' + dimensions.length + ' reviewers' +
  (failedDimensions.length ? ' — ' + failedDimensions.length + ' FAILED (' + failedDimensions.join(', ') + ')' : '') +
  ' → verifying ' + gating.length + ' gating')

// ─── Phase 3: Verify — adversarially re-check GATING findings only ───
phase('Verify')
const triagedRaw = await parallel(
  gating.map(f => () =>
    parallel(
      Array.from({ length: VERIFY_VOTES }, () => () =>
        agent(
          '## Skeptical verifier (read-only)\n\nTry to DISPROVE this GATING review finding. Confirm it only if it ' +
          'truly is a correctness/safety defect OR an explicit requirement/contract violation in the changeset.\n\n' +
          '**Dimension:** ' + f.dimension + '\n**Finding:** ' + f.title + '\n**Severity:** ' + f.severity + '\n' +
          '**Location:** ' + f.location + '\n**Evidence:** ' + f.evidence + '\n\n' +
          '## Checklist\n1. Re-read the cited location in the diff — does the defect/violation actually hold?\n' +
          '2. False positive? (guarded elsewhere, intentional, already handled, or actually a non-gating nice-to-have)\n' +
          'Set confirmed=false if it is a false positive or is really non-gating. ' + READ_ONLY_RULE + '\n\nStructured output only.',
          { label: 'verify:' + String(f.title).slice(0, 30), phase: 'Verify', schema: VERDICT_SCHEMA, agentType: REVIEW_AGENT_TYPE }
        )
      )
    ).then(votes => {
      const verdicts = Array.isArray(votes) ? votes : []
      const valid = verdicts.filter(v => v && typeof v.confirmed === 'boolean')
      const verdict = valid.length === 0 ? 'unverified' : (valid.every(v => v.confirmed) ? 'confirmed' : 'refuted')
      return { ...f, verdict }
    })
  )
)
const triagedResults = Array.isArray(triagedRaw) ? triagedRaw : []
const triaged = gating.map((f, i) => triagedResults[i] || { ...f, verdict: 'unverified' })
const confirmed = triaged.filter(t => t.verdict === 'confirmed')
const refuted = triaged.filter(t => t.verdict === 'refuted')
const unverified = triaged.filter(t => t.verdict === 'unverified')
log('Verify: ' + gating.length + ' gating → ' + confirmed.length + ' confirmed, ' + refuted.length + ' refuted, ' + unverified.length + ' unverified')

// A degraded run (any failed reviewer / unverified gating finding / over-cap gating / dropped dimension)
// must NEVER read as a clean PASS — it is INCOMPLETE.
const incomplete = !findersComplete || unverified.length > 0 || overflowGating.length > 0 || droppedDimensions.length > 0
const degraded = {
  ...(incomplete ? { incomplete: true } : {}),
  ...(failedDimensions.length ? { failedDimensions } : {}),
  ...(droppedDimensions.length ? { droppedDimensions } : {}),
  ...(unverified.length ? { unverifiedGating: unverified.map(u => ({ title: u.title, location: u.location, dimension: u.dimension })) } : {}),
  ...(overflowGating.length ? { overflowGating: overflowGating.map(o => ({ title: o.title, location: o.location, dimension: o.dimension })) } : {}),
}
const appendixItems = nonGating.map(f => '(' + f.severity + ', ' + f.dimension + ') ' + f.title + ' — ' + f.location)

// ─── Phase 4: Synthesize — gate verdict ───
phase('Synthesize')
const sevRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const verdictGuess = incomplete ? 'incomplete' : (confirmed.length > 0 ? 'fail' : 'pass')
const block = [...confirmed]
  .sort((a, b) => sevRank[a.severity] - sevRank[b.severity])
  .map((f, i) => '### [' + i + '] (' + f.severity + ', ' + f.dimension + ') ' + f.title + '\nLocation: ' + f.location +
    '\nEvidence: ' + f.evidence + '\n' + (f.recommendation ? 'Recommendation: ' + f.recommendation + '\n' : ''))
  .join('\n')

const report = await agent(
  '## Synthesis: code-review gate verdict\n\n' +
  '**Changeset:** ' + changeset + '\n' +
  '**Provisional verdict:** ' + verdictGuess.toUpperCase() +
  (incomplete ? ' (run is DEGRADED — see incomplete/failedDimensions/unverifiedGating)' : '') + '\n\n' +
  confirmed.length + ' confirmed GATING findings; ' + nonGating.length + ' non-gating.\n\n' +
  '## Confirmed gating findings\n' + (block || '(none)') + '\n\n' +
  '## Non-gating (appendix)\n' + (appendixItems.length ? appendixItems.map(a => '- ' + a).join('\n') : '(none)') + '\n\n' +
  '## Instructions\n' +
  '1. Set `verdict`: **fail** if there is ≥1 confirmed gating finding; **incomplete** if the run is degraded ' +
  '(failed reviewer / unverified gating / dropped dimension); otherwise **pass**.\n' +
  '2. Merge gating findings that describe the same issue (combine locations), ranked by severity.\n' +
  '3. Put every non-gating item in `appendix` (one line each) — these NEVER fail the gate (D9).\n' +
  '4. Write a 3-5 sentence summary stating the verdict and why.\n' + READ_ONLY_RULE + '\n\nStructured output only.',
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT_SCHEMA, agentType: REVIEW_AGENT_TYPE }
)

const stats = {
  dimensions: dimensions.length,
  failedDimensions: failedDimensions.length,
  droppedDimensions: droppedDimensions.length,
  findings: allFindings.length,
  gating: gatingAll.length,
  nonGating: nonGating.length,
  verifiedGating: gating.length,
  overflowGating: overflowGating.length,
  confirmed: confirmed.length,
  refuted: refuted.length,
  unverified: unverified.length,
}

if (!report || typeof report.verdict !== 'string') {
  // Salvage: synthesis skipped/malformed — compute the verdict ourselves, fail-closed.
  return {
    changeset, ...degraded,
    verdict: verdictGuess,
    summary: 'Synthesis skipped/malformed — computed verdict ' + verdictGuess.toUpperCase() + ' from ' +
      confirmed.length + ' confirmed gating finding(s)' + (incomplete ? ' (DEGRADED run — not a clean pass)' : '') + '.',
    gating: confirmed.map(f => ({ title: f.title, severity: f.severity, locations: [f.location], detail: f.evidence, recommendation: f.recommendation })),
    appendix: appendixItems,
    stats,
  }
}

// Fail-closed override: never let the agent report PASS on a degraded run, or PASS while gating findings
// were confirmed. The computed verdictGuess wins when it is stricter.
const finalVerdict = incomplete ? 'incomplete' : (confirmed.length > 0 ? 'fail' : (report.verdict === 'pass' ? 'pass' : report.verdict))
return {
  changeset,
  ...degraded,
  ...report,
  verdict: finalVerdict,
  ...(incomplete ? { summary: 'Review INCOMPLETE (degraded — see incomplete/failedDimensions/unverifiedGating). ' + (report.summary || '') } : {}),
  stats: { ...stats, agentCalls: 1 + dimensions.length + (gating.length * VERIFY_VOTES) + 1 },
}
