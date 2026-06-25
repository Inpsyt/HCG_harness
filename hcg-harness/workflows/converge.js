export const meta = {
  name: 'converge',
  description:
    'Read-only contracts↔code DRIFT reconciliation (Spec Kit /converge analog). Compares the contracts/ SSOT (db-schema · api-spec · shared-types · design-guide) against the implementation, classifies each contract requirement satisfied / partial / missing / contradicts, adversarially verifies each drift to drop false positives, then synthesizes a drift report + PROPOSED tasks for the plan/orchestration role to add. It does NOT write tasks or edit code — every agent runs as the built-in `Explore` agent type (file edits runtime-blocked; shell mutation advisory). Fail-closed: a degraded reconciler/verifier or a missing contracts dir yields `verdict:"incomplete"`, never a false `"aligned"`.',
  whenToUse:
    'Periodically, or before closing a milestone, to detect drift between the authoritative contracts/ and what the code actually implements — the gap the lock+review keeps authoritative but never measures. Pass an optional scope as args (e.g. "db-schema,api-spec" to limit areas, or a feature path). Output: per-requirement drift (satisfied/partial/missing/contradicts) + proposed reconciliation tasks. Read-only; for the actual fixes, feed the proposed tasks to plan-agent.',
  phases: [
    { title: 'Scope', detail: 'Locate contract files + map each to its implementation surface' },
    { title: 'Reconcile', detail: 'One reconciler per contract area, in parallel — classify each requirement' },
    { title: 'Verify', detail: 'Adversarially re-check each drift to drop false positives' },
    { title: 'Synthesize', detail: 'Drift report + proposed reconciliation tasks + verdict' },
  ],
}

// converge: Scope → parallel(Reconcile per contract area) → Verify drifts → Synthesize (verdict + proposed tasks)
// Generic, runnable skeleton. Mirrors review.js's fail-closed structured-output conventions (deliberately
// lighter than audit's multi-round hardening — anti-over-design). Read-only: agentType 'Explore' blocks
// Edit/Write/NotebookEdit (Bash advisory only). Invoke: Workflow({ name: 'converge', args: '<areas or scope>' })

// ── Tunables (CUSTOMIZE) ──
const MAX_AREAS = 6              // cap on parallel reconcilers
const MAX_DRIFTS_VERIFIED = 40  // cap on drifts sent to verify; over-cap carried as overflow (→ incomplete)
const VERIFY_VOTES = 1          // adversarial re-checks per drift; raise to 3 for multi-vote
const CONVERGE_AGENT_TYPE = 'Explore'
const CONTRACTS_DIR = 'contracts' // CUSTOMIZE: override if your contracts live elsewhere

// CUSTOMIZE: default contract areas (contract file ↔ implementation surface) when the Scope agent
// cannot derive them from args. Domain-neutral; adjust file/impl mappings to your project layout.
const DEFAULT_AREAS = [
  { label: 'db-schema', contract: 'contracts/db-schema.md', impl: 'prisma/schema.prisma + prisma/migrations/', focus: 'tables, columns, types, indexes, constraints, relations' },
  { label: 'api-spec', contract: 'contracts/api-spec.md', impl: 'app/api/**/route.ts + features/*/{actions,schema}.ts', focus: 'endpoints, request/response shapes, status codes, zod validation' },
  { label: 'shared-types', contract: 'contracts/shared-types.ts', impl: 'imports/usages across features', focus: 'every exported type is imported (not redefined) and matches usage' },
  { label: 'design-guide', contract: 'contracts/design-guide.md', impl: 'components + CSS variables/tokens', focus: 'color tokens / badge mappings used via CSS vars (no hardcoded values)' },
]

const READ_ONLY_RULE =
  'STRICT READ-ONLY: use ONLY Read, Grep, and Glob (and a non-mutating git command if needed). Do NOT edit, ' +
  'write, create, delete, or run any mutating command. You are reconciling, not fixing.'

// Drift status taxonomy (Spec Kit /converge classification). DRIFT = anything but `satisfied`.
const STATUSES = ['satisfied', 'partial', 'missing', 'contradicts']
const ALLOWED_STATUS = new Set(STATUSES)

// ── Structured-output schemas ──
const SCOPE_SCHEMA = {
  type: 'object',
  required: ['areas'],
  properties: {
    contractsPresent: { type: 'boolean' }, // false ⇒ nothing to reconcile (per-project contracts not instantiated)
    note: { type: 'string' },
    areas: {
      type: 'array', maxItems: MAX_AREAS,
      items: {
        type: 'object', required: ['label', 'contract', 'impl'],
        properties: {
          label: { type: 'string' },
          contract: { type: 'string' },  // contract file path
          impl: { type: 'string' },      // implementation surface
          focus: { type: 'string' },
        },
      },
    },
  },
}
const RECONCILE_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array', maxItems: 25,
      items: {
        type: 'object', required: ['requirement', 'status', 'evidence'],
        properties: {
          requirement: { type: 'string' },   // the contract requirement being checked
          status: { enum: STATUSES },
          location: { type: 'string' },        // impl file:line (or contract loc for missing)
          evidence: { type: 'string' },
          suggestedTask: { type: 'string' },   // remediation if not satisfied
        },
      },
    },
  },
}
const isValidItem = (it) =>
  !!it && typeof it === 'object' &&
  typeof it.requirement === 'string' &&
  typeof it.status === 'string' && ALLOWED_STATUS.has(it.status) &&
  typeof it.evidence === 'string'
const VERDICT_SCHEMA = {
  type: 'object',
  required: ['confirmed', 'rationale'],
  properties: { confirmed: { type: 'boolean' }, rationale: { type: 'string' } }, // confirmed=true ⇒ real drift
}
const REPORT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'summary'],
  properties: {
    verdict: { enum: ['aligned', 'drift', 'incomplete'] },
    summary: { type: 'string' },
    drifts: {
      type: 'array',
      items: {
        type: 'object', required: ['area', 'requirement', 'status', 'detail'],
        properties: {
          area: { type: 'string' },
          requirement: { type: 'string' },
          status: { enum: STATUSES },
          locations: { type: 'array', items: { type: 'string' } },
          detail: { type: 'string' },
        },
      },
    },
    proposedTasks: { type: 'array', items: { type: 'string' } },
  },
}

// ─── Phase 1: Scope ───
phase('Scope')
const TARGET = (typeof args === 'string' && args.trim()) || ''
const scope = await agent(
  'You are scoping a read-only contracts↔code drift reconciliation.\n\n' +
  '## Scope hint (optional)\n' + (TARGET || '(none — reconcile all contract areas found under ' + CONTRACTS_DIR + '/)') + '\n\n' +
  '## Task\n1. Look for the contract SSOT under `' + CONTRACTS_DIR + '/` (db-schema · api-spec · shared-types · design-guide, ' +
  'or whatever exists). Set `contractsPresent` accordingly. The contracts/ dir is a PER-PROJECT artifact — if it does ' +
  'not exist, set contractsPresent=false (there is nothing to reconcile).\n' +
  '2. For each contract that exists, identify its implementation surface (the files that should satisfy it) and give a `focus`.\n' +
  '   Map paths from `.claude/project.md` 「경로」 if present.\n' + READ_ONLY_RULE + '\n\nStructured output only.',
  { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA, agentType: CONVERGE_AGENT_TYPE }
)

if (scope && scope.contractsPresent === false) {
  log('No contracts/ found — nothing to reconcile (contracts are a per-project artifact).')
  return {
    target: TARGET, verdict: 'incomplete', incomplete: true, error: 'no-contracts',
    summary: 'Converge INCOMPLETE — no contract SSOT found under ' + CONTRACTS_DIR + '/. Contracts are a per-project ' +
      'artifact the harness prescribes; author them (contract-authoring skill) before reconciling. NOT an "aligned" result.',
    drifts: [], proposedTasks: [], stats: { areas: 0, failedAreas: 0 },
  }
}

const areasRaw = scope != null ? scope.areas : undefined
const scopeMalformed =
  areasRaw != null &&
  (!Array.isArray(areasRaw) || areasRaw.some(a => !a || typeof a.label !== 'string' || typeof a.contract !== 'string'))
if (scopeMalformed) {
  log('Scope MALFORMED — `areas` is not a usable array; converge INCOMPLETE.')
  return {
    target: TARGET, verdict: 'incomplete', incomplete: true, error: 'malformed-scope',
    summary: 'Converge INCOMPLETE — the Scope agent returned a malformed `areas` value; nothing reconciled (NOT aligned). Re-run scope.',
    drifts: [], proposedTasks: [], stats: { areas: 0, failedAreas: 0 },
  }
}
const scopedAreas = (Array.isArray(areasRaw) && areasRaw.length) ? areasRaw : DEFAULT_AREAS
const areas = scopedAreas.slice(0, MAX_AREAS)
const droppedAreas = scopedAreas.slice(MAX_AREAS).map(a => (a && a.label) || '(unlabeled)')
log('Reconciling ' + areas.length + ' areas: ' + areas.map(a => a.label).join(', ') +
  (droppedAreas.length ? ' — ' + droppedAreas.length + ' over cap, dropped (incomplete): ' + droppedAreas.join(', ') : ''))

// ─── Phase 2: Reconcile — one reconciler per contract area ───
phase('Reconcile')
const reconRaw = await parallel(
  areas.map(area => () =>
    agent(
      '## Reconciler: ' + area.label + '\n\n' +
      'Contract (authoritative SSOT): ' + area.contract + '\n' +
      'Implementation surface: ' + area.impl + '\n' +
      (area.focus ? 'Focus: ' + area.focus + '\n' : '') +
      '\n## Task\nRead the contract, then read the implementation. For EACH discrete requirement the contract states, ' +
      'classify how the code matches it:\n' +
      '- `satisfied`: implemented exactly as the contract requires.\n' +
      '- `partial`: implemented but incompletely / divergently (e.g. missing index, looser type).\n' +
      '- `missing`: the contract requires it; the code does not implement it.\n' +
      '- `contradicts`: the code does something CONTRARY to the contract (wrong type, different shape, renamed field).\n' +
      'For non-`satisfied` items give a precise location, quoted evidence, and a one-line `suggestedTask` to reconcile. ' +
      'Report real, defensible drift only — no speculation. ' + READ_ONLY_RULE + '\n\nStructured output only.',
      { label: 'reconcile:' + area.label, phase: 'Reconcile', schema: RECONCILE_SCHEMA, agentType: CONVERGE_AGENT_TYPE }
    ).then(r => {
      if (!(r && Array.isArray(r.items)))
        return { area: area.label, ok: false, items: [] }
      const items = []
      for (const it of r.items) if (isValidItem(it)) items.push({ ...it, area: area.label })
      return { area: area.label, ok: true, items }
    })
  )
)
const reconResults = Array.isArray(reconRaw) ? reconRaw : []
const perArea = areas.map((area, i) => reconResults[i] || { area: area.label, ok: false, items: [] })
const failedAreas = perArea.filter(a => !a.ok).map(a => a.area)
const areasComplete = failedAreas.length === 0

const allItems = perArea.flatMap(a => a.items)
const satisfied = allItems.filter(it => it.status === 'satisfied')
const driftsAll = allItems.filter(it => it.status !== 'satisfied')
const drifts = driftsAll.slice(0, MAX_DRIFTS_VERIFIED)
const overflowDrifts = driftsAll.slice(MAX_DRIFTS_VERIFIED) // over-cap: never verified ⇒ incomplete
log('Checked ' + allItems.length + ' requirements (' + satisfied.length + ' satisfied, ' + driftsAll.length + ' drift) from ' +
  (areas.length - failedAreas.length) + '/' + areas.length + ' reconcilers' +
  (failedAreas.length ? ' — ' + failedAreas.length + ' FAILED (' + failedAreas.join(', ') + ')' : '') +
  ' → verifying ' + drifts.length + ' drift')

// ─── Phase 3: Verify — adversarially re-check each drift (drop false positives) ───
phase('Verify')
const triagedRaw = await parallel(
  drifts.map(d => () =>
    parallel(
      Array.from({ length: VERIFY_VOTES }, () => () =>
        agent(
          '## Skeptical verifier (read-only)\n\nTry to DISPROVE this contract↔code drift — i.e. show the code actually ' +
          'DOES satisfy the contract (so the reported drift is a false positive).\n\n' +
          '**Area:** ' + d.area + '\n**Requirement:** ' + d.requirement + '\n**Reported status:** ' + d.status + '\n' +
          '**Location:** ' + (d.location || '(n/a)') + '\n**Evidence:** ' + d.evidence + '\n\n' +
          '## Checklist\n1. Re-read the contract requirement and the cited code — is the drift real?\n' +
          '2. Is it satisfied elsewhere (another file/migration) and the reconciler missed it?\n' +
          'Set confirmed=true if the drift is REAL, confirmed=false if the code actually satisfies the contract. ' +
          READ_ONLY_RULE + '\n\nStructured output only.',
          { label: 'verify:' + String(d.requirement).slice(0, 30), phase: 'Verify', schema: VERDICT_SCHEMA, agentType: CONVERGE_AGENT_TYPE }
        )
      )
    ).then(votes => {
      const verdicts = Array.isArray(votes) ? votes : []
      const valid = verdicts.filter(v => v && typeof v.confirmed === 'boolean')
      const verdict = valid.length === 0 ? 'unverified' : (valid.every(v => v.confirmed) ? 'confirmed' : 'refuted')
      return { ...d, verdict }
    })
  )
)
const triagedResults = Array.isArray(triagedRaw) ? triagedRaw : []
const triaged = drifts.map((d, i) => triagedResults[i] || { ...d, verdict: 'unverified' })
const confirmed = triaged.filter(t => t.verdict === 'confirmed')
const refuted = triaged.filter(t => t.verdict === 'refuted')
const unverified = triaged.filter(t => t.verdict === 'unverified')
log('Verify: ' + drifts.length + ' drift → ' + confirmed.length + ' confirmed, ' + refuted.length + ' refuted (false), ' + unverified.length + ' unverified')

// A degraded run (failed reconciler / unverified drift / over-cap / dropped area) must NEVER read as "aligned".
const incomplete = !areasComplete || unverified.length > 0 || overflowDrifts.length > 0 || droppedAreas.length > 0
const degraded = {
  ...(incomplete ? { incomplete: true } : {}),
  ...(failedAreas.length ? { failedAreas } : {}),
  ...(droppedAreas.length ? { droppedAreas } : {}),
  ...(unverified.length ? { unverifiedDrifts: unverified.map(u => ({ area: u.area, requirement: u.requirement })) } : {}),
  ...(overflowDrifts.length ? { overflowDrifts: overflowDrifts.map(o => ({ area: o.area, requirement: o.requirement })) } : {}),
}
const proposed = confirmed.map(d => d.suggestedTask || ('[' + d.area + '/' + d.status + '] ' + d.requirement))

// ─── Phase 4: Synthesize — verdict + proposed reconciliation tasks ───
phase('Synthesize')
const statusRank = { contradicts: 0, missing: 1, partial: 2, satisfied: 3 }
const verdictGuess = incomplete ? 'incomplete' : (confirmed.length > 0 ? 'drift' : 'aligned')
const block = [...confirmed]
  .sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9))
  .map((d, i) => '### [' + i + '] (' + d.status + ', ' + d.area + ') ' + d.requirement + '\nLocation: ' + (d.location || 'n/a') +
    '\nEvidence: ' + d.evidence + (d.suggestedTask ? '\nSuggested task: ' + d.suggestedTask : ''))
  .join('\n')

const report = await agent(
  '## Synthesis: contracts↔code drift report\n\n' +
  '**Provisional verdict:** ' + verdictGuess.toUpperCase() +
  (incomplete ? ' (run is DEGRADED — see incomplete/failedAreas/unverifiedDrifts)' : '') + '\n\n' +
  confirmed.length + ' confirmed drifts; ' + satisfied.length + ' requirements satisfied.\n\n' +
  '## Confirmed drifts\n' + (block || '(none)') + '\n\n' +
  '## Instructions\n' +
  '1. Set `verdict`: **drift** if ≥1 confirmed drift; **incomplete** if the run is degraded; otherwise **aligned**.\n' +
  '2. Merge drifts describing the same gap (combine locations), ranked contradicts→missing→partial.\n' +
  '3. Emit `proposedTasks`: one actionable reconciliation task per confirmed drift (for the plan role to add — this ' +
  'workflow does NOT write tasks itself).\n' +
  '4. Write a 3-5 sentence summary stating the verdict and the biggest gaps.\n' + READ_ONLY_RULE + '\n\nStructured output only.',
  { label: 'synthesize', phase: 'Synthesize', schema: REPORT_SCHEMA, agentType: CONVERGE_AGENT_TYPE }
)

const stats = {
  areas: areas.length,
  failedAreas: failedAreas.length,
  droppedAreas: droppedAreas.length,
  requirements: allItems.length,
  satisfied: satisfied.length,
  drift: driftsAll.length,
  verifiedDrift: drifts.length,
  overflowDrifts: overflowDrifts.length,
  confirmed: confirmed.length,
  refuted: refuted.length,
  unverified: unverified.length,
}

if (!report || typeof report.verdict !== 'string') {
  return {
    target: TARGET, ...degraded,
    verdict: verdictGuess,
    summary: 'Synthesis skipped/malformed — computed verdict ' + verdictGuess.toUpperCase() + ' from ' +
      confirmed.length + ' confirmed drift(s)' + (incomplete ? ' (DEGRADED run — not a clean aligned)' : '') + '.',
    drifts: confirmed.map(d => ({ area: d.area, requirement: d.requirement, status: d.status, locations: [d.location || 'n/a'], detail: d.evidence })),
    proposedTasks: proposed,
    stats,
  }
}

// Fail-closed override: never report "aligned" on a degraded run or while drifts were confirmed.
const finalVerdict = incomplete ? 'incomplete' : (confirmed.length > 0 ? 'drift' : (report.verdict === 'aligned' ? 'aligned' : report.verdict))
return {
  target: TARGET,
  ...degraded,
  ...report,
  verdict: finalVerdict,
  proposedTasks: (Array.isArray(report.proposedTasks) && report.proposedTasks.length) ? report.proposedTasks : proposed,
  ...(incomplete ? { summary: 'Converge INCOMPLETE (degraded — see incomplete/failedAreas/unverifiedDrifts). ' + (report.summary || '') } : {}),
  stats: { ...stats, agentCalls: 1 + areas.length + (drifts.length * VERIFY_VOTES) + 1 },
}
