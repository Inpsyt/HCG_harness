// hooks/session-start-context.test.mjs
// Unit tests for the SessionStart context-injection hook pure functions.
// Run: node --test hcg-harness/hooks/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parsePhasesLineBased,
  parseInProgressPhases,
  extractOpenIssuesSection,
  parseOpenIssues,
  formatContext,
} from "./session-start-context.mjs";

const META = `phases:
  - id: 1
    title: "Bootstrap"
    status: completed
  - id: 2
    title: "Search feature"
    status: in-progress
`;

test("parsePhasesLineBased: id (numeric) / title / status per block", () => {
  const p = parsePhasesLineBased(META);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { id: 1, title: "Bootstrap", status: "completed" });
  assert.deepEqual(p[1], { id: 2, title: "Search feature", status: "in-progress" });
});

test("parsePhasesLineBased: tolerant of non-string / empty", () => {
  assert.deepEqual(parsePhasesLineBased(123), []);
  assert.deepEqual(parsePhasesLineBased(""), []);
  assert.deepEqual(parsePhasesLineBased("phases: []"), []);
});

test("parseInProgressPhases: returns only in-progress {id,title}", async () => {
  const r = await parseInProgressPhases(META);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { id: 2, title: "Search feature" });
});

test("parseInProgressPhases: empty / blank / bad => []", async () => {
  assert.deepEqual(await parseInProgressPhases(""), []);
  assert.deepEqual(await parseInProgressPhases("   "), []);
  assert.deepEqual(await parseInProgressPhases(undefined), []);
  // all completed => none in-progress
  assert.deepEqual(
    await parseInProgressPhases("phases:\n  - id: 1\n    title: A\n    status: completed\n"),
    []
  );
});

test("extractOpenIssuesSection: between heading and next ## ", () => {
  const md = `# TODO

## QA 이슈 (현재 열림)
- [ ] BUG-001: alpha
- [ ] BUG-002: beta

## 완료 (요약)
done here`;
  const s = extractOpenIssuesSection(md);
  assert.match(s, /BUG-001/);
  assert.match(s, /BUG-002/);
  assert.ok(!/done here/.test(s)); // stops at the next level-2 heading
});

test("extractOpenIssuesSection: absent heading / non-string => null", () => {
  assert.equal(extractOpenIssuesSection("# no open-issues section"), null);
  assert.equal(extractOpenIssuesSection(123), null);
});

test("parseOpenIssues: list / (없음) / absent", () => {
  const md = `## QA 이슈 (현재 열림)
- [ ] BUG-001: alpha
- [ ] BUG-002: beta
`;
  const issues = parseOpenIssues(md);
  assert.equal(issues.length, 2);
  assert.match(issues[0], /BUG-001: alpha/);
  assert.match(issues[1], /BUG-002: beta/);
  assert.deepEqual(parseOpenIssues("## QA 이슈 (현재 열림)\n(없음)"), []);
  assert.deepEqual(parseOpenIssues("# nothing here"), []);
});

test("parseOpenIssues: truncates very long lines", () => {
  const long = "x".repeat(400);
  const md = `## QA 이슈 (현재 열림)\n- ${long}`;
  const [only] = parseOpenIssues(md);
  assert.ok(only.length <= 200);
  assert.ok(only.endsWith("..."));
});

test("formatContext: phases + issues", () => {
  const out = formatContext([{ id: 2, title: "Search" }], ["BUG-001: x"], "[test ctx]");
  assert.match(out, /^\[test ctx\]/);
  assert.match(out, /진행중 Phase:/);
  assert.match(out, /Phase 2: Search/);
  assert.match(out, /열린 QA 이슈 \(1건\):/);
  assert.match(out, /BUG-001: x/);
});

test("formatContext: clean state", () => {
  const out = formatContext([], [], "[test ctx]");
  assert.match(out, /진행중 Phase: 없음/);
  assert.match(out, /열린 QA 이슈: 없음/);
  assert.match(out, /clean/);
});

test("formatContext: phase with missing title falls back", () => {
  const out = formatContext([{ id: 5 }], [], "[x]");
  assert.match(out, /Phase 5: \(제목 없음\)/);
});

import { markerExists, formatBootstrapHint } from "./session-start-context.mjs";

test("markerExists true/false", () => {
  assert.equal(markerExists("/p", { existsSync: () => true }), true);
  assert.equal(markerExists("/p", { existsSync: () => false }), false);
});

test("formatBootstrapHint mentions /hcg-harness:hcg-init", () => {
  const s = formatBootstrapHint("[x]");
  assert.match(s, /\/hcg-harness:hcg-init/);
  assert.match(s, /부트스트랩/);
});
