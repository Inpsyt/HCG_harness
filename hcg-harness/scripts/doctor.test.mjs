// scripts/doctor.test.mjs
// 슬림 doctor 단위 테스트. Run: node --test hcg-harness/scripts/
import { test } from "node:test";
import assert from "node:assert/strict";

import { runDoctor, compareVersions } from "./doctor.mjs";

/** rel POSIX path -> content 맵으로 mock fs 구성 (디렉터리는 파일 존재로부터 유도) */
function projFs(files) {
  const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "");
  const has = (rel) => Object.prototype.hasOwnProperty.call(files, rel);
  const isDir = (rel) => Object.keys(files).some((k) => k.startsWith(rel + "/"));
  const toRel = (abs) => {
    const p = norm(abs);
    return p.startsWith("/P/") ? p.slice(3) : p === "/P" ? "" : p;
  };
  return {
    existsSync: (abs) => {
      const rel = toRel(abs);
      return rel === "" || has(rel) || isDir(rel);
    },
    readFileSync: (abs) => {
      const rel = toRel(abs);
      if (!has(rel)) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
      return files[rel];
    },
    readdirSync: (abs) => {
      const rel = toRel(abs);
      const prefix = rel ? rel + "/" : "";
      const kids = new Set();
      for (const k of Object.keys(files)) {
        if (!k.startsWith(prefix)) continue;
        kids.add(k.slice(prefix.length).split("/")[0]);
      }
      if (!kids.size) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
      return [...kids];
    },
  };
}

const MARKER = (extra = {}) =>
  JSON.stringify({
    profile: "hcg", profileVersion: "0.1.1", harnessVersion: "0.1.2",
    choices: { projectName: "Acme", appDir: "apps/web", codex: true },
    manifest: {}, ...extra,
  });

/** 검사 전부 통과하는 최소 완전체 프로젝트 */
function healthyFiles() {
  return {
    ".claude/.hcg-harness.json": MARKER(),
    ".claude/CLAUDE-core.md": "core",
    ".claude/project.md": "- 정체성: Acme 주문 시스템\n- 경로: apps/web",
    ".claude/agents/plan-agent.md": "x", ".claude/agents/db-agent.md": "x",
    ".claude/agents/backend-agent.md": "x", ".claude/agents/front-agent.md": "x",
    ".claude/agents/qa-agent.md": "x",
    "CLAUDE.md": "# Acme\n@.claude/CLAUDE-core.md\n",
    "contracts/api-spec.md": "x", "contracts/db-schema.md": "x",
    "contracts/design-guide.md": "x", "contracts/shared-types.md": "x",
    "tasks/TODO.md": "x", "tasks/phase-meta.yml": "phases: []",
    "scripts/codex-review.mjs": "x",
    ".github/workflows/ci.yml": "x",
    "apps/web/package.json": JSON.stringify({ scripts: { "codex:review": "node ../../scripts/codex-review.mjs" } }),
    "apps/web/node_modules/.keep": "x",
    "apps/web/package-lock.json": "x",
    "apps/web/prisma/schema.prisma": "x",
    "apps/web/.env": "DATABASE_URL=mysql://...\n",
  };
}

const run = (files, pluginVersion = "0.1.2") =>
  runDoctor({ target: "/P", pluginVersion, fs: projFs(files) });

const byId = (r, id) => r.findings.filter((f) => f.id === id);
const levels = (r) => new Set(r.findings.map((f) => f.level));

test("compareVersions: numeric segment order", () => {
  assert.equal(compareVersions("0.1.2", "0.1.2"), 0);
  assert.ok(compareVersions("0.1.1", "0.1.2") < 0);
  assert.ok(compareVersions("0.10.0", "0.2.0") > 0);
});

test("marker 없음 → 단일 error + exit 1 (미부트스트랩)", () => {
  const r = run({});
  assert.equal(r.exitCode, 1);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].id, "marker");
  assert.equal(r.findings[0].level, "error");
  assert.match(r.findings[0].fix, /hcg-harness:init/);
});

test("marker 파싱 실패 → error", () => {
  const r = run({ ".claude/.hcg-harness.json": "{broken" });
  assert.equal(r.exitCode, 1);
  assert.equal(r.findings[0].id, "marker");
});

test("완전체 프로젝트 → error/warn 없음, exit 0", () => {
  const r = run(healthyFiles());
  assert.equal(r.exitCode, 0, JSON.stringify(r.findings, null, 1));
  assert.ok(!levels(r).has("error"));
  assert.ok(!levels(r).has("warn"));
});

test("version skew: marker < plugin → warn + upgrade 안내", () => {
  const files = healthyFiles();
  files[".claude/.hcg-harness.json"] = MARKER({ harnessVersion: "0.1.0" });
  const r = run(files, "0.1.2");
  const f = byId(r, "version-skew");
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "warn");
  assert.match(f[0].fix, /upgrade/);
  assert.equal(r.exitCode, 0); // warn 은 exit 0
});

test("stale sentinel → warn (잠금 꺼짐 경고)", () => {
  const files = healthyFiles();
  files[".claude/contracts-unlock"] = "";
  const r = run(files);
  const f = byId(r, "stale-sentinel");
  assert.equal(f.length, 1);
  assert.equal(f[0].level, "warn");
  assert.match(f[0].detail, /잠금/);
});

test("layout: contracts 파일·에이전트 누락 → warn 에 목록", () => {
  const files = healthyFiles();
  delete files["contracts/shared-types.md"];
  delete files[".claude/agents/qa-agent.md"];
  const r = run(files);
  const f = byId(r, "layout");
  assert.equal(f[0].level, "warn");
  assert.match(f[0].detail, /shared-types\.md/);
  assert.match(f[0].detail, /agents 4\/5/);
});

test("CLAUDE.md 에 core import 없음 → warn", () => {
  const files = healthyFiles();
  files["CLAUDE.md"] = "# Acme (import 누락)";
  const r = run(files);
  assert.equal(byId(r, "layout")[0].level, "warn");
});

test("codex opt-out → info skip / opt-in 배선 누락 → warn", () => {
  const off = healthyFiles();
  off[".claude/.hcg-harness.json"] = MARKER({ choices: { projectName: "A", appDir: "apps/web", codex: false } });
  delete off["scripts/codex-review.mjs"];
  const r1 = run(off);
  assert.equal(byId(r1, "codex-wiring")[0].level, "info");

  const on = healthyFiles();
  delete on["scripts/codex-review.mjs"];
  const r2 = run(on);
  assert.equal(byId(r2, "codex-wiring")[0].level, "warn");
});

test("ci.yml 없음 → warn + upgrade 안내", () => {
  const files = healthyFiles();
  delete files[".github/workflows/ci.yml"];
  const r = run(files);
  const f = byId(r, "ci");
  assert.equal(f[0].level, "warn");
  assert.match(f[0].fix, /upgrade/);
});

test("toolchain: package.json 없음 → error / node_modules·.env 없음 → warn", () => {
  const noPkg = healthyFiles();
  delete noPkg["apps/web/package.json"];
  const r1 = run(noPkg);
  assert.equal(byId(r1, "toolchain")[0].level, "error");
  assert.equal(r1.exitCode, 1);

  const noDeps = healthyFiles();
  delete noDeps["apps/web/node_modules/.keep"];
  delete noDeps["apps/web/.env"];
  const r2 = run(noDeps);
  const f = byId(r2, "toolchain")[0];
  assert.equal(f.level, "warn");
  assert.match(f.detail, /node_modules/);
  assert.match(f.detail, /DATABASE_URL/);
  assert.equal(r2.exitCode, 0);
});

test("project.md 한글 플레이스홀더 잔존 → warn (값은 미출력)", () => {
  const files = healthyFiles();
  files[".claude/project.md"] = "- 정체성: <프로젝트 한 줄 설명>\n- 명령: <예: npm run dev>";
  const r = run(files);
  const f = byId(r, "placeholders");
  assert.equal(f[0].level, "warn");
  assert.match(f[0].detail, /2곳/);
});

test("appDir 는 marker choices 를 따른다 (커스텀 appDir)", () => {
  const files = healthyFiles();
  files[".claude/.hcg-harness.json"] = MARKER({ choices: { projectName: "A", appDir: "apps/admin", codex: false } });
  // apps/web 쪽 파일을 apps/admin 으로 이동
  for (const k of Object.keys(files)) {
    if (k.startsWith("apps/web/")) { files[k.replace("apps/web/", "apps/admin/")] = files[k]; delete files[k]; }
  }
  const r = run(files);
  const tool = byId(r, "toolchain")[0];
  assert.notEqual(tool.level, "error", JSON.stringify(tool));
});
