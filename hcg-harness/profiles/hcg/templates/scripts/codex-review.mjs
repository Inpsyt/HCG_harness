#!/usr/bin/env node
// templates/codex-review.mjs  →  copy to <project>/scripts/codex-review.mjs
//
// Reference wrapper for the qa-agent / codex-review gate. The harness skill
// `codex-review` invokes `npm run codex:review -- <base_sha>`, which must resolve to
// this script. It is NOT bundled into the plugin (it depends on the separate
// codex-companion plugin and on your project's git/CLI), so each consuming
// project copies and wires it. See docs/install.md.
//
// CONTRACT (what the gate expects):
//   • argv[2] = base_sha — the Phase's declared base commit (from
//     tasks/phase-meta.yml). The review analyzes the CUMULATIVE diff base..HEAD.
//   • Emits the codex adversarial-review output to stdout (the skill tees it to
//     tasks/codex-reviews/phase-<N>-<date>.log and parses severity from it).
//   • Exit 0 on a completed review; NON-ZERO on infra failure (auth expired,
//     companion missing, timeout) so the gate can surface "cannot review →
//     Phase cannot close" instead of a false PASS.
//   • D9 focus: the review is told to weight correctness / explicit-requirement
//     violations as gating and treat gap/enhancement/over-design as non-gating
//     (appendix). The qa-agent still makes the final PASS/FAIL by KIND.
//
// CUSTOMIZE: the one project/plugin-specific seam is INVOKE_CODEX below — wire it
// to your installed codex-companion review command. Everything else is generic.

import { spawnSync } from "node:child_process";

const D9_FOCUS = [
  "Adversarial review of the cumulative diff. Classify each finding by KIND",
  "BEFORE severity. GATING (must fix): correctness/safety defects (crash, data",
  "loss/corruption, race condition, security/injection, auth bypass, behavior",
  "contradicting the code's own intent) OR violations of an explicit",
  "requirement/contract (contracts: db-schema, api-spec, shared-types,",
  "design-guide). NON-GATING (appendix only, even if you rate them Critical/",
  "High): 'would be nice to add', gap/enhancement, 'could be more defensive'",
  "(over-design), style/naming/refactor, coverage beyond the stated",
  "requirements. Do not fail the change for missing nice-to-haves.",
].join(" ");

function fail(msg, code = 1) {
  process.stderr.write(`[codex-review] ${msg}\n`);
  process.exit(code);
}

const baseSha = process.argv[2];
if (!baseSha) fail("usage: codex-review <base_sha> (missing base_sha)", 2);

// Cumulative diff base..HEAD. Fail closed if base_sha is unknown to git.
const diff = spawnSync("git", ["diff", `${baseSha}...HEAD`], { encoding: "utf8" });
if (diff.status !== 0) {
  fail(`git diff ${baseSha}...HEAD failed: ${(diff.stderr || "").trim()}`, 1);
}
if (!diff.stdout || diff.stdout.trim() === "") {
  process.stdout.write("No changes between base and HEAD — nothing to review.\n");
  process.exit(0);
}

// CUSTOMIZE ▼ — invoke your codex-companion review with (diff, D9_FOCUS).
// Replace the placeholder below with the real companion review invocation, e.g.
// shelling out to the codex plugin's CLI and passing D9_FOCUS as the focus text
// and `diff.stdout` (or the base_sha range) as the target. It MUST print the
// review to stdout and exit non-zero on infra failure.
function INVOKE_CODEX(_diffText, _focusText) {
  fail(
    "codex invocation not wired — edit scripts/codex-review.mjs (CUSTOMIZE block) " +
      "to call your installed codex-companion review command. See docs/install.md.",
    1
  );
}

INVOKE_CODEX(diff.stdout, D9_FOCUS);
// CUSTOMIZE ▲
