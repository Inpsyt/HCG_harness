import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { AX_SKILLS, DEFAULT_REPO, checkInstalled, planInstall, parseArgs, main } from "./install-ax.mjs";

/** existing: 정규화(POSIX) 경로 문자열 Set. cp/mkdir 호출 기록. */
function mockFs(existing = new Set()) {
  const calls = { cp: [], mkdir: [] };
  const norm = (p) => String(p).replace(/\\/g, "/");
  return {
    calls,
    existsSync: (p) => existing.has(norm(p)),
    cpSync: (src, dest) => calls.cp.push([norm(src), norm(dest)]),
    mkdirSync: (p) => calls.mkdir.push(norm(p)),
  };
}

test("AX_SKILLS는 4종 전부를 담는다", () => {
  assert.deepEqual(AX_SKILLS, ["ax-docx", "ax-output", "ax-pptx", "ax-wireframe"]);
});

test("checkInstalled: 설치/미설치 분리", () => {
  const fs = mockFs(new Set(["/h/.claude/skills/ax-docx", "/h/.claude/skills/ax-wireframe"]));
  const { installed, missing } = checkInstalled("/h/.claude/skills", fs);
  assert.deepEqual(installed, ["ax-docx", "ax-wireframe"]);
  assert.deepEqual(missing, ["ax-output", "ax-pptx"]);
});

test("checkInstalled: 전부 설치", () => {
  const fs = mockFs(new Set(AX_SKILLS.map((s) => `/h/.claude/skills/${s}`)));
  assert.deepEqual(checkInstalled("/h/.claude/skills", fs).missing, []);
});

test("planInstall: missing 없음 → skip", () => {
  assert.deepEqual(planInstall({ missing: [], cloneDirExists: false }),
    { action: "skip", status: "already-installed" });
});

test("planInstall: missing + 클론 폴더 있음 → pull-and-copy", () => {
  assert.deepEqual(planInstall({ missing: ["ax-docx"], cloneDirExists: true }),
    { action: "pull-and-copy" });
});

test("planInstall: missing + 클론 폴더 없음 → clone-and-copy", () => {
  assert.deepEqual(planInstall({ missing: ["ax-docx"], cloneDirExists: false }),
    { action: "clone-and-copy" });
});

test("parseArgs: 기본값은 home 기준", () => {
  const a = parseArgs([], "/h");
  assert.equal(a.repo, DEFAULT_REPO);
  assert.equal(a.cloneDir, path.join("/h", ".claude", "ax-output-standardization"));
  assert.equal(a.skillsDir, path.join("/h", ".claude", "skills"));
  assert.equal(a.check, false);
});

test("parseArgs: 플래그가 기본값을 덮는다", () => {
  const a = parseArgs(["--repo", "r", "--clone-dir", "c", "--skills-dir", "s", "--check"], "/h");
  assert.deepEqual(a, { repo: "r", cloneDir: "c", skillsDir: "s", check: true });
});

// ── main() — IO 주입 테스트 ─────────────────────────────────────────────────

function mockExec(behavior = () => "") {
  const calls = [];
  const fn = (cmd, args) => { calls.push([cmd, ...args]); return behavior(cmd, args); };
  fn.calls = calls;
  return fn;
}

function capture() {
  const lines = [];
  const log = (s) => lines.push(s);
  log.json = () => JSON.parse(lines[0]);
  return log;
}

test("main --check: 상태만 보고, exec/복사 없음", () => {
  const fs = mockFs(new Set(["/h/.claude/skills/ax-docx"]));
  const exec = mockExec();
  const log = capture();
  const code = main(["--check"], { fs, exec, log, home: "/h" });
  assert.equal(code, 0);
  assert.equal(exec.calls.length, 0);
  assert.equal(fs.calls.cp.length, 0);
  const j = log.json();
  assert.equal(j.mode, "check");
  assert.deepEqual(j.installed, ["ax-docx"]);
});

test("main: 4종 전부 설치 → already-installed, exec 호출 없음", () => {
  const fs = mockFs(new Set(AX_SKILLS.map((s) => `/h/.claude/skills/${s}`)));
  const exec = mockExec();
  const log = capture();
  const code = main([], { fs, exec, log, home: "/h" });
  assert.equal(code, 0);
  assert.equal(exec.calls.length, 0);
  assert.equal(log.json().status, "already-installed");
});

test("main: 클론 폴더 없음 → git clone --depth 1", () => {
  const existing = new Set();
  // clone 성공 후 upstream에 스킬 폴더가 생겼다고 가정
  const exec = mockExec(() => {
    for (const s of AX_SKILLS) existing.add(`/h/.claude/ax-output-standardization/${s}`.replace(/\\/g, "/"));
    return "";
  });
  const fs = mockFs(existing);
  const log = capture();
  const code = main([], { fs, exec, log, home: "/h" });
  assert.equal(code, 0);
  assert.deepEqual(exec.calls[0].slice(0, 4), ["git", "clone", "--depth", "1"]);
  const j = log.json();
  assert.equal(j.status, "installed");
  assert.equal(j.method, "copy");
  assert.deepEqual(j.copied, AX_SKILLS);
  assert.equal(fs.calls.cp.length, 4);
});

test("main: 클론 폴더 있음 → git pull --ff-only, 없는 스킬만 복사(gap-fill)", () => {
  const paths = ["/h/.claude/ax-output-standardization",
    ...AX_SKILLS.map((s) => `/h/.claude/ax-output-standardization/${s}`),
    "/h/.claude/skills/ax-docx"]; // ax-docx 는 이미 설치됨
  const fs = mockFs(new Set(paths));
  const exec = mockExec();
  const log = capture();
  const code = main([], { fs, exec, log, home: "/h" });
  assert.equal(code, 0);
  assert.deepEqual(exec.calls[0], ["git", "-C", path.join("/h", ".claude", "ax-output-standardization"), "pull", "--ff-only"]);
  const j = log.json();
  assert.deepEqual(j.copied, ["ax-output", "ax-pptx", "ax-wireframe"]);
  assert.deepEqual(j.skipped, ["ax-docx"]);
  assert.equal(fs.calls.cp.length, 3); // 기존 설치본 불변
});

test("main: git 실패 → ok:false + fallback 문구 + exit 1, 복사 없음", () => {
  const fs = mockFs(new Set());
  const exec = mockExec(() => { throw new Error("auth required"); });
  const log = capture();
  const code = main([], { fs, exec, log, home: "/h" });
  assert.equal(code, 1);
  assert.equal(fs.calls.cp.length, 0);
  const j = log.json();
  assert.equal(j.ok, false);
  assert.match(j.error, /clone failed/);
  assert.match(j.fallback, /ui-standard/);
});

test("main: upstream에 없는 스킬은 notFoundUpstream으로 보고", () => {
  const existing = new Set();
  const exec = mockExec(() => {
    existing.add("/h/.claude/ax-output-standardization/ax-wireframe");
    return "";
  });
  const fs = mockFs(existing);
  const log = capture();
  main([], { fs, exec, log, home: "/h" });
  const j = log.json();
  assert.deepEqual(j.copied, ["ax-wireframe"]);
  assert.deepEqual(j.notFoundUpstream, ["ax-docx", "ax-output", "ax-pptx"]);
});

test("main: 복사 중 실패 → ok:false + copy failed + exit 1 (JSON 한 줄, 크래시 금지)", () => {
  const existing = new Set();
  const exec = mockExec(() => {
    for (const s of AX_SKILLS) existing.add(`/h/.claude/ax-output-standardization/${s}`);
    return "";
  });
  const fs = mockFs(existing);
  const origCp = fs.cpSync;
  let n = 0;
  fs.cpSync = (src, dest) => { n++; if (n === 2) throw new Error("EACCES"); origCp(src, dest); };
  const log = capture();
  const code = main([], { fs, exec, log, home: "/h" });
  assert.equal(code, 1);
  const j = log.json();
  assert.equal(j.ok, false);
  assert.match(j.error, /copy failed/);
  assert.deepEqual(j.copied, ["ax-docx"]);
  assert.match(j.fallback, /ui-standard/);
});
