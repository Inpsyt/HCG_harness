// hooks/phase-gate-check.test.mjs
// Unit tests for the Stop-time phase-gate advisory hook.
// Run: node --test hcg-harness/hooks/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isEnvTruthy,
  parsePhaseGatesLineBased,
  findUngatedPhases,
  formatWarning,
  isCodexOptedOut,
} from "./phase-gate-check.mjs";

const META = `phases:
  - id: 1
    title: "Bootstrap"
    status: completed
    codex_review:
      executed: true
  - id: 2
    title: "Add search"
    status: in-progress
    codex_review:
      executed: false
  - id: 3
    title: "Refactor"
    status: in-progress
    codex_review:
      executed: true
`;

test("isEnvTruthy", () => {
  assert.equal(isEnvTruthy("1"), true);
  assert.equal(isEnvTruthy("0"), false);
  assert.equal(isEnvTruthy(undefined), false);
});

test("parsePhaseGatesLineBased: captures status + codex_review.executed", () => {
  const phases = parsePhaseGatesLineBased(META);
  assert.equal(phases.length, 3);
  assert.deepEqual(phases[0], { id: 1, title: "Bootstrap", status: "completed", executed: true });
  assert.deepEqual(phases[1], { id: 2, title: "Add search", status: "in-progress", executed: false });
  assert.deepEqual(phases[2], { id: 3, title: "Refactor", status: "in-progress", executed: true });
});

test("findUngatedPhases: only in-progress AND not-yet-gated", async () => {
  const ungated = await findUngatedPhases(META);
  assert.equal(ungated.length, 1);
  assert.equal(ungated[0].id, 2);
  assert.equal(ungated[0].title, "Add search");
});

test("findUngatedPhases: empty / bad input => []", async () => {
  assert.deepEqual(await findUngatedPhases(""), []);
  assert.deepEqual(await findUngatedPhases("not: [valid"), []);
  assert.deepEqual(await findUngatedPhases(undefined), []);
});

test("findUngatedPhases: all gated or none in-progress => []", async () => {
  const allClosed = `phases:
  - id: 1
    title: A
    status: completed
    codex_review:
      executed: true
`;
  assert.deepEqual(await findUngatedPhases(allClosed), []);
});

test("formatWarning lists the phases", () => {
  const w = formatWarning([{ id: 2, title: "Add search" }]);
  assert.match(w, /Phase 2: Add search/);
  assert.match(w, /codex/i);
});

test("isCodexOptedOut: choices.codex === false 만 true", () => {
  assert.equal(isCodexOptedOut({ choices: { codex: false } }), true);
  assert.equal(isCodexOptedOut({ choices: { codex: true } }), false);
  assert.equal(isCodexOptedOut({ choices: {} }), false);
  assert.equal(isCodexOptedOut({}), false);
  assert.equal(isCodexOptedOut(null), false);
  assert.equal(isCodexOptedOut("garbage"), false);
});
