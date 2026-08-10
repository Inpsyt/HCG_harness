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
  formatMigrationBanner,
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

import {
  markerExists,
  formatBootstrapHint,
  detectHalfMigrated,
  formatResumeHint,
} from "./session-start-context.mjs";

test("markerExists true/false", () => {
  assert.equal(markerExists("/p", { existsSync: () => true }), true);
  assert.equal(markerExists("/p", { existsSync: () => false }), false);
});

test("formatBootstrapHint 는 hcg-core:init 을 가리키고 /hcg-harness:init 을 권하지 않는다 (E-D1)", () => {
  const s = formatBootstrapHint("[x]");
  assert.match(s, /\/hcg-core:init/);
  assert.ok(!s.includes("/hcg-harness:init"), "레거시는 0.3.0 부터 신규 설치 대상이 아니다");
  assert.match(s, /부트스트랩/);
});

// path.join(projectRoot, rel) 를 다시 rel 로 되돌린다 — fs 스텁이 rel 기준으로만 판단하면
// 되도록, 실제 path 모듈이 붙이는 플랫폼별 구분자(윈도우 "\\" 포함)를 흡수한다.
function _relOf(absPath) {
  return String(absPath)
    .replace(/\\/g, "/")
    .replace(/^\/proj\//, "");
}

test("detectHalfMigrated: 양성 증거 — docs/legacy-harness 아카이브 존재", () => {
  const has = new Set(["docs/legacy-harness"]);
  const fs = { existsSync: (p) => has.has(_relOf(p)) };
  assert.equal(detectHalfMigrated("/proj", fs), true);
});

test("detectHalfMigrated: 양성 증거 — CLAUDE.md.legacy 백업 존재", () => {
  const has = new Set(["CLAUDE.md.legacy"]);
  const fs = { existsSync: (p) => has.has(_relOf(p)) };
  assert.equal(detectHalfMigrated("/proj", fs), true);
});

test("detectHalfMigrated: 보강 증거 — 하네스 자산은 있는데 managed 파일만 사라짐", () => {
  const has = new Set(["contracts", ".claude"]);
  const fs = { existsSync: (p) => has.has(_relOf(p)) };
  assert.equal(detectHalfMigrated("/proj", fs), true);
});

test("detectHalfMigrated: 음성 — 아무 증거도 없으면 false", () => {
  const fs = { existsSync: () => false };
  assert.equal(detectHalfMigrated("/proj", fs), false);
});

test("detectHalfMigrated: 음성 — CLAUDE.md 가 아직 있으면(철거 전) 보강 증거만으론 true 가 아니다", () => {
  const has = new Set(["contracts", ".claude", "CLAUDE.md"]);
  const fs = { existsSync: (p) => has.has(_relOf(p)) };
  assert.equal(detectHalfMigrated("/proj", fs), false);
});

test("formatResumeHint: hcg-harness:upgrade 재실행으로 안내하고 /hcg-harness:init 을 금지한다", () => {
  const s = formatResumeHint("[x]");
  assert.match(s, /\/hcg-harness:upgrade/);
  assert.match(s, /\/hcg-harness:init/);
  assert.match(s, /실행하지 마세요/);
});

import { readFileSync as _readFileSyncForHooksJson } from "node:fs";
import * as _pathForHooksJson from "node:path";
import { fileURLToPath as _fileURLToPathForHooksJson } from "node:url";

test("formatMigrationBanner 는 hcg-core 이행을 안내한다", () => {
  const out = formatMigrationBanner();
  assert.match(out, /레거시/);
  assert.match(out, /\/hcg-harness:upgrade/);
  assert.match(out, /hcg-core/);
  assert.ok(!out.includes("session context]"), "레이블 줄을 중복 출력하지 않는다");
});

test("hooks.json: 편집 경로에는 훅이 없고 셸에만 파괴 가드가 붙는다 (0.3.0)", () => {
  const here = _pathForHooksJson.dirname(_fileURLToPathForHooksJson(import.meta.url));
  const json = JSON.parse(_readFileSyncForHooksJson(_pathForHooksJson.join(here, "hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(json.hooks), ["PreToolUse", "SessionStart"]);
  const m = json.hooks.PreToolUse[0].matcher;
  assert.equal(m, "Bash|PowerShell");
  for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
    assert.ok(!m.includes(tool), `편집 도구가 matcher 에 있으면 안 된다: ${tool}`);
  }
  assert.match(json.hooks.PreToolUse[0].hooks[0].command, /run-destructive-guard\.mjs/);
  assert.equal(json.hooks.SessionStart[0].hooks[0].timeout, 15);
});

test("run-destructive-guard.mjs 는 HARNESS_CONTRACTS_WRITE 를 설정해 G1/G3 를 끈다 (E-D2)", () => {
  const here = _pathForHooksJson.dirname(_fileURLToPathForHooksJson(import.meta.url));
  const src = _readFileSyncForHooksJson(
    _pathForHooksJson.join(here, "run-destructive-guard.mjs"),
    "utf8"
  );
  assert.match(src, /process\.env\.HARNESS_CONTRACTS_WRITE\s*=\s*["']1["']/);
  assert.match(src, /contracts-guard\.mjs/);
});
