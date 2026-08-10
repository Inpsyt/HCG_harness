import { test } from "node:test";
import assert from "node:assert/strict";
import { substituteTokens, normalizeForHash, sha256 } from "./bootstrap.mjs";
import { globToRegExp, isUserOwned } from "./bootstrap.mjs";
import { validateProfile, discoverProfiles, loadProfile } from "./bootstrap.mjs";

test("substituteTokens replaces all occurrences", () => {
  const out = substituteTokens("a {{X}} b {{X}} {{Y}}", { X: "1", Y: "2" });
  assert.equal(out, "a 1 b 1 2");
});

test("substituteTokens leaves undefined tokens intact", () => {
  assert.equal(substituteTokens("{{X}} {{Z}}", { X: "1" }), "1 {{Z}}");
});

test("normalizeForHash converts CRLF and CR to LF", () => {
  assert.equal(normalizeForHash("a\r\nb\rc\n"), "a\nb\nc\n");
});

test("sha256 is stable across line-ending differences", () => {
  assert.equal(sha256("a\r\nb"), sha256("a\nb"));
  assert.match(sha256("x"), /^[0-9a-f]{64}$/);
});

test("globToRegExp: * matches within a segment, not across /", () => {
  assert.ok(globToRegExp("contracts/*").test("contracts/db.md"));
  assert.ok(!globToRegExp("contracts/*").test("contracts/sub/db.md"));
});

test("globToRegExp: ** matches across segments", () => {
  assert.ok(globToRegExp("app/**").test("app/a/b/c.tsx"));
});

test("globToRegExp escapes regex metacharacters", () => {
  assert.ok(globToRegExp("a.b+c").test("a.b+c"));
  assert.ok(!globToRegExp("a.b+c").test("aXbXc"));
});

test("isUserOwned matches any glob", () => {
  const globs = [".claude/project.md", "contracts/**", "app/**", "package.json"];
  assert.ok(isUserOwned(".claude/project.md", globs));
  assert.ok(isUserOwned("contracts/db-schema.md", globs));
  assert.ok(isUserOwned("app/page.tsx", globs));
  assert.ok(!isUserOwned(".claude/CLAUDE-core.md", globs));
});

// ── Task 3: 프로파일 발견 · 로드 · 검증 ──────────────────────────────────────

const GOOD = {
  id: "hcg", label: "HCG", appDir: "apps/web",
  setupCommands: ["pnpm install"], userOwnedGlobs: ["app/**"],
};

function mockFs(tree) {
  // tree: { "hcg/profile.json": "<json>", ... } (profilesDir 기준 상대)
  return {
    readdirSync: (dir, opts) => {
      const names = new Set();
      for (const k of Object.keys(tree)) names.add(k.split("/")[0]);
      return [...names].map((name) => ({ name, isDirectory: () => true }));
    },
    readFileSync: (p) => {
      const key = p.replace(/\\/g, "/").split("/profiles/")[1] ?? p;
      if (tree[key] == null) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
      return tree[key];
    },
    existsSync: (p) => {
      const key = p.replace(/\\/g, "/").split("/profiles/")[1] ?? p;
      return tree[key] != null;
    },
  };
}

test("validateProfile returns [] for a valid profile", () => {
  assert.deepEqual(validateProfile(GOOD), []);
});

test("validateProfile lists missing/invalid fields", () => {
  const bad = validateProfile({ id: "x" });
  assert.ok(bad.includes("label"));
  assert.ok(bad.includes("appDir"));
  assert.ok(bad.includes("setupCommands"));
  assert.ok(bad.includes("userOwnedGlobs"));
});

test("discoverProfiles lists id+label, skips broken", () => {
  const fs = mockFs({
    "hcg/profile.json": JSON.stringify(GOOD),
    "broken/profile.json": "{ not json",
  });
  const got = discoverProfiles("/x/profiles", fs);
  assert.deepEqual(got, [{ id: "hcg", label: "HCG" }]);
});

test("loadProfile throws on missing", () => {
  const fs = mockFs({ "hcg/profile.json": JSON.stringify(GOOD) });
  assert.throws(() => loadProfile("/x/profiles", "nope", fs), /not found/i);
});

test("loadProfile returns validated profile", () => {
  const fs = mockFs({ "hcg/profile.json": JSON.stringify(GOOD) });
  assert.equal(loadProfile("/x/profiles", "hcg", fs).id, "hcg");
});

// ── Task 4: 템플릿 walk + 프로파일 렌더 ─────────────────────────────────────

import { toPosix, walkTemplates, renderProfile, slugify } from "./bootstrap.mjs";

test("toPosix normalizes separators and leading ./", () => {
  assert.equal(toPosix("a\\b//c"), "a/b/c");
  assert.equal(toPosix("./x/y"), "x/y");
});

function walkFs(files) {
  // files: { "rel/path": "content" } (templatesDir 기준)
  const root = "/T";
  return {
    readdirSync: (dir, opts) => {
      const rel = dir === root ? "" : dir.slice(root.length + 1).replace(/\\/g, "/");
      const prefix = rel ? rel + "/" : "";
      const kids = new Map();
      for (const k of Object.keys(files)) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const seg = rest.split("/")[0];
        const isDir = rest.includes("/");
        if (!kids.has(seg)) kids.set(seg, isDir);
      }
      return [...kids].map(([name, isDir]) => ({ name, isDirectory: () => isDir, isFile: () => !isDir }));
    },
    readFileSync: (p) => files[p.slice(root.length + 1).replace(/\\/g, "/")],
  };
}

test("walkTemplates returns posix relpaths + content", () => {
  const fs = walkFs({ "a.txt": "1", "sub/b.txt": "2" });
  const got = walkTemplates("/T", fs).sort((x, y) => x.relPath.localeCompare(y.relPath));
  assert.deepEqual(got, [
    { relPath: "a.txt", content: "1" },
    { relPath: "sub/b.txt", content: "2" },
  ]);
});

test("renderProfile substitutes path+content and classifies", () => {
  const fs = walkFs({
    "{{APP_DIR}}/page.tsx": "// {{PROJECT_NAME}}",
    ".claude/CLAUDE-core.md": "core",
  });
  const profile = { userOwnedGlobs: ["apps/web/**"] };
  const rendered = renderProfile({
    templatesDir: "/T", profile,
    choices: { projectName: "Acme", appDir: "apps/web" }, fs,
  }).sort((a, b) => a.relPath.localeCompare(b.relPath));
  assert.deepEqual(rendered, [
    { relPath: ".claude/CLAUDE-core.md", content: "core", managed: true },
    { relPath: "apps/web/page.tsx", content: "// Acme", managed: false },
  ]);
});

// ── Task 5: 마커 + 매니페스트 read/write ─────────────────────────────────────

import { MARKER_REL, buildManifest, readMarker, writeMarker } from "./bootstrap.mjs";

test("buildManifest records managed flag + content hash", () => {
  const m = buildManifest([
    { relPath: "a.md", content: "x", managed: true },
    { relPath: "b.md", content: "y", managed: false },
  ]);
  assert.equal(m["a.md"].managed, true);
  assert.equal(m["a.md"].sha256, sha256("x"));
  assert.equal(m["b.md"].managed, false);
});

test("readMarker returns null when absent", () => {
  const fs = { existsSync: () => false, readFileSync: () => { throw new Error(); } };
  assert.equal(readMarker("/proj", fs), null);
});

test("writeMarker then readMarker round-trips", () => {
  const store = {};
  const fs = {
    existsSync: (p) => p.replace(/\\/g, "/") in store,
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[p.replace(/\\/g, "/")] = c; },
    readFileSync: (p) => store[p.replace(/\\/g, "/")],
  };
  const marker = { profile: "hcg", manifest: {} };
  writeMarker("/proj", marker, fs);
  assert.deepEqual(readMarker("/proj", fs), marker);
  assert.ok(MARKER_REL.endsWith(".hcg-harness.json"));
});

// ── Task 6: planInit — 빈/비어있지않은 폴더 가드 ─────────────────────────────

import { planInit } from "./bootstrap.mjs";

const R = [
  { relPath: "a", content: "A", managed: true },
  { relPath: "b", content: "B", managed: false },
];

test("planInit strict on empty dir writes all", () => {
  const p = planInit({ rendered: R, existing: new Set(), mode: "strict" });
  assert.equal(p.blocked, false);
  assert.deepEqual(p.writes.map((w) => w.relPath).sort(), ["a", "b"]);
});

test("planInit strict blocks on any conflict", () => {
  const p = planInit({ rendered: R, existing: new Set(["b"]), mode: "strict" });
  assert.equal(p.blocked, true);
  assert.deepEqual(p.writes, []);
  assert.deepEqual(p.conflicts, ["b"]);
});

test("planInit force writes all despite conflicts", () => {
  const p = planInit({ rendered: R, existing: new Set(["b"]), mode: "force" });
  assert.equal(p.blocked, false);
  assert.deepEqual(p.writes.map((w) => w.relPath).sort(), ["a", "b"]);
  assert.deepEqual(p.conflicts, ["b"]);
});

test("planInit gap-fill writes only missing", () => {
  const p = planInit({ rendered: R, existing: new Set(["b"]), mode: "gap-fill" });
  assert.equal(p.blocked, false);
  assert.deepEqual(p.writes.map((w) => w.relPath), ["a"]);
  assert.deepEqual(p.skipped, ["b"]);
});

// ── Task 7: planUpgrade — 매니페스트 기반 3-way 판정 ─────────────────────────

import { planUpgrade, planRetire, ARCHIVE_ROOT } from "./bootstrap.mjs";

test("planUpgrade: user-owned created if absent, skipped if present", () => {
  const rendered = [{ relPath: "app/page.tsx", content: "NEW", managed: false }];
  const a = planUpgrade({ rendered, prevManifest: {}, currentHashes: {} });
  assert.deepEqual(a.created, ["app/page.tsx"]);
  assert.deepEqual(a.writes, [{ relPath: "app/page.tsx", content: "NEW" }]);
  const b = planUpgrade({ rendered, prevManifest: {}, currentHashes: { "app/page.tsx": sha256("OLD") } });
  assert.deepEqual(b.skipped, ["app/page.tsx"]);
  assert.deepEqual(b.writes, []);
});

test("planUpgrade: managed unmodified -> overwrite", () => {
  const rendered = [{ relPath: "x.md", content: "v2", managed: true }];
  const prevManifest = { "x.md": { managed: true, sha256: sha256("v1") } };
  const currentHashes = { "x.md": sha256("v1") };
  const p = planUpgrade({ rendered, prevManifest, currentHashes });
  assert.deepEqual(p.overwritten, ["x.md"]);
  assert.deepEqual(p.writes, [{ relPath: "x.md", content: "v2" }]);
});

test("planUpgrade: managed user-modified -> .new conflict", () => {
  const rendered = [{ relPath: "x.md", content: "v2", managed: true }];
  const prevManifest = { "x.md": { managed: true, sha256: sha256("v1") } };
  const currentHashes = { "x.md": sha256("USER_EDIT") };
  const p = planUpgrade({ rendered, prevManifest, currentHashes });
  assert.deepEqual(p.conflicts, [{ relPath: "x.md", newPath: "x.md.new" }]);
  assert.deepEqual(p.writes, [{ relPath: "x.md.new", content: "v2" }]);
  assert.deepEqual(p.overwritten, []);
});

test("planUpgrade: managed absent -> created", () => {
  const rendered = [{ relPath: "n.md", content: "v1", managed: true }];
  const p = planUpgrade({ rendered, prevManifest: {}, currentHashes: {} });
  assert.deepEqual(p.created, ["n.md"]);
  assert.deepEqual(p.writes, [{ relPath: "n.md", content: "v1" }]);
});

test("planUpgrade: managed identical new content -> skipped", () => {
  const rendered = [{ relPath: "x.md", content: "same", managed: true }];
  const prevManifest = { "x.md": { managed: true, sha256: sha256("old") } };
  const currentHashes = { "x.md": sha256("same") };
  const p = planUpgrade({ rendered, prevManifest, currentHashes });
  assert.deepEqual(p.skipped, ["x.md"]);
  assert.deepEqual(p.writes, []);
});

// ── Task 8: IO 적용 + CLI main() (init·upgrade·list) ─────────────────────────

import { parseArgs, main } from "./bootstrap.mjs";

test("parseArgs reads flags + defaults", () => {
  const a = parseArgs(["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web", "--target", "/p", "--force"]);
  assert.equal(a.mode, "init");
  assert.equal(a.projectName, "Acme");
  assert.equal(a.appDir, "apps/web");
  assert.equal(a.target, "/p");
  assert.equal(a.initMode, "force");
});

test("main init writes files + marker, prints setupCommands", () => {
  const store = {}; // posix abs path -> content
  const norm = (p) => p.replace(/\\/g, "/");
  const profile = { id: "hcg", label: "HCG", appDir: "apps/web", setupCommands: ["pnpm install"], userOwnedGlobs: ["{{APP_DIR}}/**".replace("{{APP_DIR}}","apps/web"), "apps/web/**"] };
  const fs = {
    readdirSync: (dir, opts) => {
      const d = norm(dir);
      if (d.endsWith("/profiles")) return [{ name: "hcg", isDirectory: () => true }];
      // templatesDir walk: /profiles/hcg/templates
      const base = "/profiles/hcg/templates";
      if (d === base) return [{ name: "{{APP_DIR}}", isDirectory: () => true, isFile: () => false }, { name: ".claude", isDirectory: () => true, isFile: () => false }];
      if (d === base + "/{{APP_DIR}}") return [{ name: "page.tsx", isDirectory: () => false, isFile: () => true }];
      if (d === base + "/.claude") return [{ name: "CLAUDE-core.md", isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFileSync: (p) => {
      const f = norm(p);
      if (f.endsWith("/profiles/hcg/profile.json")) return JSON.stringify(profile);
      if (f.endsWith("/templates/{{APP_DIR}}/page.tsx")) return "// {{PROJECT_NAME}}";
      if (f.endsWith("/templates/.claude/CLAUDE-core.md")) return "core";
      if (store[f] != null) return store[f];
      const e = new Error("ENOENT"); e.code = "ENOENT"; throw e;
    },
    existsSync: (p) => { const f = norm(p); return f.endsWith("profile.json") || f in store; },
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[norm(p)] = c; },
  };
  const out = [];
  const code = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web", "--target", "/proj", "--profiles-dir", "/profiles"],
    { fs, log: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.equal(store["/proj/apps/web/page.tsx"], "// Acme");
  assert.equal(store["/proj/.claude/CLAUDE-core.md"], "core");
  assert.ok(store["/proj/.claude/.hcg-harness.json"], "marker written");
  const report = JSON.parse(out.join("\n"));
  assert.deepEqual(report.setupCommands, ["pnpm install"]);
  assert.equal(report.ok, true);
});

// ── Defect 2: slugify + PROJECT_SLUG token ───────────────────────────────────

test("slugify lowercases, hyphenates, trims, falls back to 'app'", () => {
  assert.equal(slugify("My App"), "my-app");
  assert.equal(slugify("Demo"), "demo");
  assert.equal(slugify("  a/b__c  "), "a-b-c");
  assert.equal(slugify("***"), "app");
});

test("renderProfile provides PROJECT_SLUG token", () => {
  const fs = walkFs({ "slug.txt": "{{PROJECT_SLUG}}" });
  const rendered = renderProfile({
    templatesDir: "/T", profile: { userOwnedGlobs: [] },
    choices: { projectName: "My App", appDir: "apps/web" }, fs,
  });
  assert.equal(rendered[0].content, "my-app");
});

// ── userOwnedGlobs 토큰화 회귀: appDir 를 프로파일 기본값과 다르게 골라도
//    앱 파일은 user-owned 여야 한다 (아니면 upgrade 가 사용자 앱 코드를 덮어씀) ──

test("renderProfile substitutes tokens in userOwnedGlobs (custom appDir stays user-owned)", () => {
  const fs = walkFs({ "{{APP_DIR}}/page.tsx": "// {{PROJECT_NAME}}", "CLAUDE.md": "managed" });
  const rendered = renderProfile({
    templatesDir: "/T", profile: { userOwnedGlobs: ["{{APP_DIR}}/**"] },
    choices: { projectName: "Acme", appDir: "apps/admin" }, fs,
  });
  const page = rendered.find((f) => f.relPath === "apps/admin/page.tsx");
  assert.ok(page, "app file rendered under the chosen appDir");
  assert.equal(page.managed, false); // user-owned — upgrade must never overwrite
  const claude = rendered.find((f) => f.relPath === "CLAUDE.md");
  assert.equal(claude.managed, true); // non-glob files stay managed
});

test("renderProfile keeps literal (token-free) userOwnedGlobs working", () => {
  const fs = walkFs({ "{{APP_DIR}}/page.tsx": "x" });
  const rendered = renderProfile({
    templatesDir: "/T", profile: { userOwnedGlobs: ["apps/web/**"] },
    choices: { projectName: "Acme", appDir: "apps/web" }, fs,
  });
  assert.equal(rendered[0].managed, false);
});

// ── Defect 1 regression: upgrade reuses marker choices (not profile.id) ───────

test("main upgrade preserves marker projectName for managed files", () => {
  const store = {}; // posix abs path -> content
  const norm = (p) => p.replace(/\\/g, "/");
  // CLAUDE.md is managed (NOT in userOwnedGlobs); app/** is user-owned.
  const profile = { id: "hcg", label: "HCG", appDir: "apps/web", setupCommands: ["pnpm install"], userOwnedGlobs: ["apps/web/**"] };
  const fs = {
    readdirSync: (dir, opts) => {
      const d = norm(dir);
      if (d.endsWith("/PROFILES")) return [{ name: "hcg", isDirectory: () => true }];
      const base = "/PROFILES/hcg/templates";
      if (d === base) return [{ name: "CLAUDE.md", isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFileSync: (p) => {
      const f = norm(p);
      if (f.endsWith("/PROFILES/hcg/profile.json")) return JSON.stringify(profile);
      if (f.endsWith("/templates/CLAUDE.md")) return "# {{PROJECT_NAME}}";
      if (store[f] != null) return store[f];
      const e = new Error("ENOENT"); e.code = "ENOENT"; throw e;
    },
    existsSync: (p) => { const f = norm(p); return f.endsWith("profile.json") || f in store; },
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[norm(p)] = c; },
  };
  const log = () => {};

  const initCode = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web", "--profiles-dir", "/PROFILES", "--target", "/proj"],
    { fs, log }
  );
  assert.equal(initCode, 0);
  assert.equal(store["/proj/CLAUDE.md"], "# Acme");

  // Upgrade with NO --project-name: must reuse marker's "Acme", not profile.id "hcg".
  const upCode = main(
    ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", "/PROFILES", "--target", "/proj"],
    { fs, log }
  );
  assert.equal(upCode, 0);
  assert.equal(store["/proj/CLAUDE.md"], "# Acme", "upgrade must not clobber project name with profile.id");
});

// ── Task 8 §7: 이미 부트스트랩됨 guard ───────────────────────────────────────

test("main init refuses on already-bootstrapped project, bypasses with --force", () => {
  const store = {}; // posix abs path -> content
  const norm = (p) => p.replace(/\\/g, "/");
  const profile = { id: "hcg", label: "HCG", appDir: "apps/web", setupCommands: ["pnpm install"], userOwnedGlobs: ["apps/web/**"] };
  const fs = {
    readdirSync: (dir, opts) => {
      const d = norm(dir);
      if (d.endsWith("/profiles")) return [{ name: "hcg", isDirectory: () => true }];
      const base = "/profiles/hcg/templates";
      if (d === base) return [{ name: "{{APP_DIR}}", isDirectory: () => true, isFile: () => false }, { name: ".claude", isDirectory: () => true, isFile: () => false }];
      if (d === base + "/{{APP_DIR}}") return [{ name: "page.tsx", isDirectory: () => false, isFile: () => true }];
      if (d === base + "/.claude") return [{ name: "CLAUDE-core.md", isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFileSync: (p) => {
      const f = norm(p);
      if (f.endsWith("/profiles/hcg/profile.json")) return JSON.stringify(profile);
      if (f.endsWith("/templates/{{APP_DIR}}/page.tsx")) return "// {{PROJECT_NAME}}";
      if (f.endsWith("/templates/.claude/CLAUDE-core.md")) return "core";
      if (store[f] != null) return store[f];
      const e = new Error("ENOENT"); e.code = "ENOENT"; throw e;
    },
    existsSync: (p) => { const f = norm(p); return f.endsWith("profile.json") || f in store; },
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[norm(p)] = c; },
  };
  const BASE_ARGV = ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web", "--target", "/proj", "--profiles-dir", "/profiles"];

  // 1. First init — must succeed and write the marker.
  const out1 = [];
  const code1 = main(BASE_ARGV, { fs, log: (s) => out1.push(s) });
  assert.equal(code1, 0, "first init should return 0");
  assert.ok(store["/proj/.claude/.hcg-harness.json"], "marker must be written after first init");

  // 2. Second init with NO --force — must refuse with alreadyBootstrapped.
  const out2 = [];
  const code2 = main(BASE_ARGV, { fs, log: (s) => out2.push(s) });
  assert.equal(code2, 1, "second init without --force must return 1");
  const report2 = JSON.parse(out2[0]);
  assert.equal(report2.ok, false, "refusal report must have ok:false");
  assert.equal(report2.alreadyBootstrapped, true, "refusal report must have alreadyBootstrapped:true");
  // Store write count must not have increased (no files rewritten).
  const storeSnapshot = JSON.stringify(store);

  // 3. Third init WITH --force — must bypass guard and return 0.
  const out3 = [];
  const code3 = main([...BASE_ARGV, "--force"], { fs, log: (s) => out3.push(s) });
  assert.equal(code3, 0, "init with --force must return 0");
  const report3 = JSON.parse(out3[0]);
  assert.equal(report3.ok, true, "forced init must have ok:true");
});

// ── codex opt-out: 토큰 · 파일 제외 · 마커 지속 ─────────────────────────────

test("parseArgs: --no-codex 는 codex=false, 기본은 true", () => {
  assert.equal(parseArgs([]).codex, true);
  assert.equal(parseArgs(["--no-codex"]).codex, false);
});

test("renderProfile: codex 기본(on) — CODEX 토큰이 배선 값으로 렌더", () => {
  const fs = walkFs({ "pkg.json": '"test:e2e": "playwright test"{{CODEX_PKG_SCRIPT}}' });
  const rendered = renderProfile({
    templatesDir: "/T", profile: { userOwnedGlobs: [] },
    choices: { projectName: "Acme", appDir: "apps/web" }, fs,
  });
  assert.equal(rendered[0].content,
    '"test:e2e": "playwright test",\n    "codex:review": "node ../../scripts/codex-review.mjs"');
});

test("renderProfile: codex off — CODEX_PKG_SCRIPT 빈 문자열 + codexFiles 제외", () => {
  const fs = walkFs({
    "pkg.json": '"test:e2e": "playwright test"{{CODEX_PKG_SCRIPT}}',
    "scripts/codex-review.mjs": "// wrapper",
  });
  const rendered = renderProfile({
    templatesDir: "/T",
    profile: { userOwnedGlobs: [], codexFiles: ["scripts/codex-review.mjs"] },
    choices: { projectName: "Acme", appDir: "apps/web", codex: false }, fs,
  });
  const paths = rendered.map((f) => f.relPath);
  assert.ok(!paths.includes("scripts/codex-review.mjs"), "codexFiles 는 렌더에서 제외");
  assert.equal(rendered.find((f) => f.relPath === "pkg.json").content,
    '"test:e2e": "playwright test"');
});

test("renderProfile: codex off + CODEX_CLAUDE_LINE 은 미사용 문구", () => {
  const fs = walkFs({ "CLAUDE.md": "{{CODEX_CLAUDE_LINE}}" });
  const off = renderProfile({
    templatesDir: "/T", profile: { userOwnedGlobs: [] },
    choices: { projectName: "A", appDir: "apps/web", codex: false }, fs,
  })[0].content;
  assert.match(off, /codex 게이트\*\*: 미사용/);
  const on = renderProfile({
    templatesDir: "/T", profile: { userOwnedGlobs: [] },
    choices: { projectName: "A", appDir: "apps/web" }, fs,
  })[0].content;
  assert.match(on, /codex 게이트 래퍼/);
});

test("main init --no-codex: 마커 choices.codex=false 기록, upgrade 가 재사용", () => {
  const store = {};
  const norm = (p) => p.replace(/\\/g, "/");
  const profile = { id: "hcg", label: "HCG", appDir: "apps/web", setupCommands: [],
    userOwnedGlobs: [], codexFiles: ["scripts/codex-review.mjs"] };
  const fs = {
    readdirSync: (dir) => {
      const d = norm(dir);
      if (d.endsWith("/profiles")) return [{ name: "hcg", isDirectory: () => true }];
      const base = "/profiles/hcg/templates";
      if (d === base) return [
        { name: "scripts", isDirectory: () => true },
        { name: "CLAUDE.md", isDirectory: () => false },
      ];
      if (d === base + "/scripts") return [{ name: "codex-review.mjs", isDirectory: () => false }];
      return [];
    },
    readFileSync: (p) => {
      const f = norm(p);
      if (f.endsWith("/profiles/hcg/profile.json")) return JSON.stringify(profile);
      if (f.endsWith("/templates/scripts/codex-review.mjs")) return "// wrapper";
      if (f.endsWith("/templates/CLAUDE.md")) return "{{CODEX_CLAUDE_LINE}}";
      if (store[f] != null) return store[f];
      const e = new Error("ENOENT"); e.code = "ENOENT"; throw e;
    },
    existsSync: (p) => { const f = norm(p); return f.endsWith("profile.json") || f in store; },
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[norm(p)] = c; },
  };
  const log = () => {};
  const code = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web",
     "--target", "/proj", "--profiles-dir", "/profiles", "--no-codex"],
    { fs, log }
  );
  assert.equal(code, 0);
  assert.equal(store["/proj/scripts/codex-review.mjs"], undefined, "래퍼 미생성");
  const marker = JSON.parse(store["/proj/.claude/.hcg-harness.json"]);
  assert.equal(marker.choices.codex, false, "마커에 opt-out 기록");
  assert.match(store["/proj/CLAUDE.md"], /미사용/);

  // upgrade (플래그 없이) — prev.choices.codex 재사용 → 래퍼 부활 금지
  const up = main(
    ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", "/profiles", "--target", "/proj"],
    { fs, log }
  );
  assert.equal(up, 0);
  assert.equal(store["/proj/scripts/codex-review.mjs"], undefined, "upgrade 후에도 래퍼 미부활");
  const marker2 = JSON.parse(store["/proj/.claude/.hcg-harness.json"]);
  assert.equal(marker2.choices.codex, false, "upgrade 후 opt-out 유지");
});

test("main init 기본(codex on): 마커 choices.codex=true", () => {
  const store = {};
  const norm = (p) => p.replace(/\\/g, "/");
  const profile = { id: "hcg", label: "HCG", appDir: "apps/web", setupCommands: [],
    userOwnedGlobs: [], codexFiles: ["scripts/codex-review.mjs"] };
  const fs = {
    readdirSync: (dir) => {
      const d = norm(dir);
      if (d.endsWith("/profiles")) return [{ name: "hcg", isDirectory: () => true }];
      if (d === "/profiles/hcg/templates") return [{ name: "scripts", isDirectory: () => true }];
      if (d === "/profiles/hcg/templates/scripts") return [{ name: "codex-review.mjs", isDirectory: () => false }];
      return [];
    },
    readFileSync: (p) => {
      const f = norm(p);
      if (f.endsWith("/profiles/hcg/profile.json")) return JSON.stringify(profile);
      if (f.endsWith("/templates/scripts/codex-review.mjs")) return "// wrapper";
      if (store[f] != null) return store[f];
      const e = new Error("ENOENT"); e.code = "ENOENT"; throw e;
    },
    existsSync: (p) => { const f = norm(p); return f.endsWith("profile.json") || f in store; },
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[norm(p)] = c; },
  };
  const code = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web",
     "--target", "/proj", "--profiles-dir", "/profiles"],
    { fs, log: () => {} }
  );
  assert.equal(code, 0);
  assert.equal(store["/proj/scripts/codex-review.mjs"], "// wrapper", "기본 경로는 래퍼 생성");
  assert.equal(JSON.parse(store["/proj/.claude/.hcg-harness.json"]).choices.codex, true);

  // 하위호환: 마커에서 codex 필드를 지워도(구버전 init 마커) upgrade 는 codex=on 으로 동작.
  const legacy = JSON.parse(store["/proj/.claude/.hcg-harness.json"]);
  delete legacy.choices.codex;
  store["/proj/.claude/.hcg-harness.json"] = JSON.stringify(legacy);
  const up = main(
    ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", "/profiles", "--target", "/proj"],
    { fs, log: () => {} }
  );
  assert.equal(up, 0);
  assert.equal(store["/proj/scripts/codex-review.mjs"], "// wrapper", "구마커(필드 없음)는 on 으로 간주 — 래퍼 유지");
});

// ── 0.2.1 회귀: marker harnessVersion 은 플러그인 자신의 plugin.json 을 따른다 ──
// (하드코딩 fallback 은 매 릴리스 수동 범프가 필요해 0.2.0 에서 누락 → 신규 init 마커가
//  구버전으로 찍히고 doctor version-skew 오경보가 upgrade 로도 해소되지 않았다.)

import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

const OWN_PLUGIN_JSON = path2
  .resolve(path2.dirname(fileURLToPath2(import.meta.url)), "..", ".claude-plugin", "plugin.json")
  .replace(/\\/g, "/");

function pluginVersionFs(store, pluginVersionRef) {
  const norm = (p) => p.replace(/\\/g, "/");
  const profile = { id: "hcg", label: "HCG", appDir: "apps/web", setupCommands: [], userOwnedGlobs: [] };
  return {
    readdirSync: (dir) => {
      const d = norm(dir);
      if (d.endsWith("/profiles")) return [{ name: "hcg", isDirectory: () => true }];
      if (d === "/profiles/hcg/templates") return [{ name: "CLAUDE.md", isDirectory: () => false, isFile: () => true }];
      return [];
    },
    readFileSync: (p) => {
      const f = norm(p);
      if (f.endsWith("/profiles/hcg/profile.json")) return JSON.stringify(profile);
      if (f === "/profiles/hcg/templates/CLAUDE.md") return "# {{PROJECT_NAME}}";
      if (f === OWN_PLUGIN_JSON && pluginVersionRef.v != null) return JSON.stringify({ name: "hcg-harness", version: pluginVersionRef.v });
      if (store[f] != null) return store[f];
      const e = new Error("ENOENT"); e.code = "ENOENT"; throw e;
    },
    existsSync: (p) => {
      const f = norm(p);
      if (f === OWN_PLUGIN_JSON) return pluginVersionRef.v != null;
      return f.endsWith("profile.json") || f in store;
    },
    mkdirSync: () => {},
    writeFileSync: (p, c) => { store[norm(p)] = c; },
  };
}

test("main init stamps marker harnessVersion from own plugin.json (no stale hardcode)", () => {
  const store = {};
  const fs = pluginVersionFs(store, { v: "9.9.9" });
  const code = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web",
     "--target", "/proj", "--profiles-dir", "/profiles"],
    { fs, log: () => {} }
  );
  assert.equal(code, 0);
  assert.equal(JSON.parse(store["/proj/.claude/.hcg-harness.json"]).harnessVersion, "9.9.9");
});

test("main upgrade re-stamps harnessVersion from own plugin.json (skew self-heals)", () => {
  const store = {};
  const ref = { v: null }; // init 시점: plugin.json 미가독 → fallback 으로 구버전 마커
  const fs = pluginVersionFs(store, ref);
  const initCode = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Acme", "--app-dir", "apps/web",
     "--target", "/proj", "--profiles-dir", "/profiles"],
    { fs, log: () => {} }
  );
  assert.equal(initCode, 0);
  ref.v = "9.9.9"; // 이후 플러그인이 9.9.9 로 업데이트된 상황
  const upCode = main(
    ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", "/profiles", "--target", "/proj"],
    { fs, log: () => {} }
  );
  assert.equal(upCode, 0);
  assert.equal(JSON.parse(store["/proj/.claude/.hcg-harness.json"]).harnessVersion, "9.9.9",
    "upgrade 가 plugin.json 버전으로 재도장해야 doctor version-skew 가 해소된다");
});

// ── 0.3.0: 이행 램프 — 철거 판정 ────────────────────────────────────────────

const RETIRE_FIXTURE = {
  delete: [".claude/agents/plan-agent.md", "CLAUDE.md"],
  archive: ["tasks/TODO.md"],
  replaceIfPristine: [".claude/skills/playwright-e2e/SKILL.md"],
};

test("planRetire: managed 미수정본은 삭제한다", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa" },
  });
  assert.deepEqual(out.deletes, ["CLAUDE.md"]);
  assert.deepEqual(out.backups, []);
});

test("planRetire: managed 사용자 수정본은 .legacy 백업 후 삭제한다", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "bbb" },
  });
  assert.deepEqual(out.deletes, []);
  assert.deepEqual(out.backups, [{ relPath: "CLAUDE.md", backupPath: "CLAUDE.md.legacy" }]);
});

test("planRetire: user-owned 는 수정 여부와 무관하게 아카이브로 이동한다", () => {
  const out = planRetire({
    retire: { delete: [], archive: ["tasks/TODO.md"], replaceIfPristine: [] },
    prevManifest: { "tasks/TODO.md": { managed: false, sha256: "aaa" } },
    currentHashes: { "tasks/TODO.md": "사용자가-계속-수정한-해시" },
  });
  assert.deepEqual(out.archives, [
    { relPath: "tasks/TODO.md", destPath: `${ARCHIVE_ROOT}/tasks/TODO.md` },
  ]);
  assert.deepEqual(out.deletes, []);
});

test("planRetire: replaceIfPristine — 미수정이면 아카이브(교체 허용)", () => {
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const out = planRetire({
    retire: { delete: [], archive: [], replaceIfPristine: [rel] },
    prevManifest: { [rel]: { managed: false, sha256: "aaa" } },
    currentHashes: { [rel]: "aaa" },
  });
  assert.deepEqual(out.archives, [{ relPath: rel, destPath: `${ARCHIVE_ROOT}/${rel}` }]);
  assert.deepEqual(out.keeps, []);
});

test("planRetire: replaceIfPristine — 사용자 수정본은 원 위치 보존 + 사유 보고", () => {
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const out = planRetire({
    retire: { delete: [], archive: [], replaceIfPristine: [rel] },
    prevManifest: { [rel]: { managed: false, sha256: "aaa" } },
    currentHashes: { [rel]: "bbb" },
  });
  assert.deepEqual(out.archives, []);
  assert.equal(out.keeps.length, 1);
  assert.equal(out.keeps[0].relPath, rel);
  assert.match(out.keeps[0].reason, /검토/);
});

test("planRetire: 디스크에 없는 대상은 missing 으로만 보고한다 (멱등)", () => {
  const out = planRetire({
    retire: RETIRE_FIXTURE,
    prevManifest: {},
    currentHashes: {},
  });
  assert.deepEqual(out.deletes, []);
  assert.deepEqual(out.archives, []);
  assert.deepEqual(out.backups, []);
  assert.equal(out.missing.length, 4);
});

test("planRetire: 목록에 없는 파일은 어떤 버킷에도 나타나지 않는다 (불가침)", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa", "src/user-file.ts": "zzz", "README.md": "yyy" },
  });
  const touched = [
    ...out.deletes,
    ...out.backups.map((b) => b.relPath),
    ...out.archives.map((a) => a.relPath),
    ...out.keeps.map((k) => k.relPath),
    ...out.missing,
  ];
  assert.ok(!touched.includes("src/user-file.ts"));
  assert.ok(!touched.includes("README.md"));
});

// ── blocked 버킷(목적지 충돌 사전 판정) 단위 커버리지 ─────────────────
// 철거는 all-or-nothing 이다 — 목적지가 이미 점유된 항목은 실행 버킷(backups/archives)에서
// 빠지고 blocked 로만 보고되어야 한다. 이 판정이 무너지면 dry-run 이 통과시킨 계획이
// 실제 실행 중간에 멈춰 프로젝트가 반쯤 뜯긴 채 남는다.

test("planRetire: 백업 목적지가 점유되어 있으면 backups 대신 blocked 로 간다", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "bbb" }, // 사용자 수정 → 원래는 .legacy 백업 대상
    existingDests: new Set(["CLAUDE.md.legacy"]),
  });
  assert.deepEqual(out.backups, [], "충돌 항목은 실행 버킷에 남으면 안 된다");
  assert.deepEqual(out.deletes, []);
  assert.deepEqual(out.blocked, [
    { relPath: "CLAUDE.md", destPath: "CLAUDE.md.legacy", kind: "backup" },
  ]);
});

test("planRetire: 아카이브 목적지가 점유되어 있으면 archives 대신 blocked 로 간다", () => {
  const rel = "tasks/TODO.md";
  const out = planRetire({
    retire: { delete: [], archive: [rel], replaceIfPristine: [] },
    prevManifest: {},
    currentHashes: { [rel]: "zzz" },
    existingDests: new Set([`${ARCHIVE_ROOT}/${rel}`]),
  });
  assert.deepEqual(out.archives, []);
  assert.deepEqual(out.blocked, [
    { relPath: rel, destPath: `${ARCHIVE_ROOT}/${rel}`, kind: "archive" },
  ]);
});

test("planRetire: replaceIfPristine 미수정본도 목적지 충돌이면 blocked 로 간다", () => {
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const out = planRetire({
    retire: { delete: [], archive: [], replaceIfPristine: [rel] },
    prevManifest: { [rel]: { managed: false, sha256: "aaa" } },
    currentHashes: { [rel]: "aaa" }, // 미수정 → 원래는 아카이브 대상
    existingDests: new Set([`${ARCHIVE_ROOT}/${rel}`]),
  });
  assert.deepEqual(out.archives, []);
  assert.deepEqual(out.keeps, [], "미수정본이 keeps 로 새면 안 된다");
  assert.deepEqual(out.blocked, [
    { relPath: rel, destPath: `${ARCHIVE_ROOT}/${rel}`, kind: "archive" },
  ]);
});

test("planRetire: replaceIfPristine 수정본은 목적지가 점유돼 있어도 keeps 다 (애초에 옮기지 않음)", () => {
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const out = planRetire({
    retire: { delete: [], archive: [], replaceIfPristine: [rel] },
    prevManifest: { [rel]: { managed: false, sha256: "aaa" } },
    currentHashes: { [rel]: "bbb" }, // 사용자 수정 → 원 위치 보존
    existingDests: new Set([`${ARCHIVE_ROOT}/${rel}`]),
  });
  assert.deepEqual(out.blocked, [], "옮기지 않는 파일은 목적지 충돌과 무관하다");
  assert.equal(out.keeps.length, 1);
  assert.equal(out.keeps[0].relPath, rel);
});

test("planRetire: existingDests 를 주지 않으면 blocked 는 비어 있다 (기본 경로 회귀)", () => {
  const out = planRetire({
    retire: RETIRE_FIXTURE,
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa", "tasks/TODO.md": "x" },
  });
  assert.deepEqual(out.blocked, []);
  assert.deepEqual(out.deletes, ["CLAUDE.md"]);
  assert.equal(out.archives.length, 1);
});

// ── Task 3: retiredFiles 선언 + 오타 회귀 가드 ──────────────────────────────

import * as _p from "node:path";
import { fileURLToPath as _fu } from "node:url";

const PROFILES_DIR = _p.resolve(_p.dirname(_fu(import.meta.url)), "..", "profiles");

test("hcg 프로파일은 retiredFiles 3버킷을 선언한다", () => {
  const profile = loadProfile(PROFILES_DIR, "hcg");
  const r = profile.retiredFiles;
  assert.ok(r, "retiredFiles 필드 존재");
  assert.deepEqual(r.delete, [
    ".claude/agents/plan-agent.md",
    ".claude/agents/db-agent.md",
    ".claude/agents/backend-agent.md",
    ".claude/agents/front-agent.md",
    ".claude/agents/qa-agent.md",
    "CLAUDE.md",
    ".claude/CLAUDE-core.md",
    ".claude/settings.json",
    ".github/workflows/ci.yml",
  ]);
  assert.deepEqual(r.archive, [
    "tasks/phase-meta.yml",
    "tasks/TODO.md",
    "scripts/codex-review.mjs",
    "contracts/shared-types.md",
  ]);
  assert.deepEqual(r.replaceIfPristine, [
    ".claude/skills/playwright-e2e/SKILL.md",
    "contracts/db-schema.md",
    "contracts/api-spec.md",
    "contracts/design-guide.md",
  ]);
});

test("retiredFiles 의 모든 항목은 실제 렌더되는 하네스 파일이다 (오타 가드)", () => {
  const profile = loadProfile(PROFILES_DIR, "hcg");
  const templatesDir = _p.join(PROFILES_DIR, profile.id, "templates");
  const rendered = renderProfile({
    templatesDir,
    profile,
    choices: { projectName: "Guard", appDir: profile.appDir, codex: true },
  });
  const known = new Set(rendered.map((f) => f.relPath));
  const r = profile.retiredFiles;
  for (const rel of [...r.delete, ...r.archive, ...r.replaceIfPristine]) {
    assert.ok(known.has(rel), `retiredFiles 항목이 템플릿에 없음(오타 의심): ${rel}`);
  }
});

test("retiredFiles 버킷은 managed/user-owned 파티션과 일치한다 (파괴 안전 가드)", () => {
  const profile = loadProfile(PROFILES_DIR, "hcg");
  const templatesDir = _p.join(PROFILES_DIR, profile.id, "templates");
  const rendered = renderProfile({
    templatesDir,
    profile,
    choices: { projectName: "Guard", appDir: profile.appDir, codex: true },
  });
  const byPath = new Map(rendered.map((f) => [f.relPath, f]));
  const r = profile.retiredFiles;
  // delete 버킷만 파일을 삭제한다 → managed(하네스 소유)여야 한다.
  for (const rel of r.delete) {
    assert.equal(byPath.get(rel).managed, true, `delete 버킷은 managed 여야 한다: ${rel}`);
  }
  // archive/replaceIfPristine 는 이동만 한다 → user-owned 여야 한다.
  for (const rel of [...r.archive, ...r.replaceIfPristine]) {
    assert.equal(byPath.get(rel).managed, false, `archive 계열은 user-owned 여야 한다: ${rel}`);
  }
});

// ── finalizeManifest — 마커는 "하네스가 마지막으로 쓴 것"을 기록한다 ────
//
// 왜 필요한가 (2026-08-10 실측): buildManifest 는 렌더 결과를 그대로 적기 때문에, upgrade 가
// **일부러 쓰지 않은** 파일(user-owned 스킵 · `.new` 충돌)까지 새 템플릿 해시로 덮어썼다.
// 그러면 마커가 디스크와 어긋나고, 그 어긋남이 이후 planRetire 의 pristine 판정을 뒤집어
// 손대지 않은 파일을 "사용자 수정본"으로 오분류한다 — 구버전(0.1.1) → 0.2.2 upgrade 를 거친
// 프로젝트에서 아무도 건드리지 않은 playwright-e2e 스킬이 keeps 로 빠져, 죽은 레거시 스킬이
// 이행 후에도 프로젝트에 남았다.

import { finalizeManifest } from "./bootstrap.mjs";

test("finalizeManifest: 이번 실행이 실제로 쓴 파일은 템플릿 해시로 기록한다", () => {
  const rendered = [{ relPath: "x.md", content: "v2", managed: true }];
  const m = finalizeManifest({ rendered, writtenPaths: new Set(["x.md"]) });
  assert.deepEqual(m, { "x.md": { managed: true, sha256: sha256("v2") } });
});

test("finalizeManifest: 쓰지 않았어도 디스크가 이미 템플릿과 같으면 템플릿 해시다", () => {
  const rendered = [{ relPath: "x.md", content: "same", managed: true }];
  const m = finalizeManifest({
    rendered, writtenPaths: new Set(),
    prevManifest: { "x.md": { managed: true, sha256: sha256("old") } },
    currentHashes: { "x.md": sha256("same") },
  });
  assert.equal(m["x.md"].sha256, sha256("same"));
});

test("finalizeManifest: 쓰지 않은 파일은 이전 매니페스트 값을 이월한다", () => {
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const rendered = [{ relPath: rel, content: "STUB v2", managed: false }];
  const m = finalizeManifest({
    rendered, writtenPaths: new Set(), // user-owned → upgrade 가 건너뜀
    prevManifest: { [rel]: { managed: false, sha256: sha256("STUB v1") } },
    currentHashes: { [rel]: sha256("STUB v1") },
  });
  assert.equal(m[rel].sha256, sha256("STUB v1"),
    "엔진이 쓰지 않았는데 새 템플릿 해시를 적으면 마커가 디스크를 오해한다");
});

test("finalizeManifest: 쓴 적도 없고 이전 기록도 없으면 항목을 만들지 않는다 (fail-safe)", () => {
  const rendered = [{ relPath: "u.md", content: "tpl", managed: false }];
  const m = finalizeManifest({
    rendered, writtenPaths: new Set(), prevManifest: {}, currentHashes: { "u.md": sha256("사용자가-먼저-만든-파일") },
  });
  assert.deepEqual(m, {}, "하네스가 쓴 적 없는 파일에 대해 아무 주장도 하지 않는다");
});

test("finalizeManifest→planRetire 회귀: 손대지 않은 user-owned 스킬은 keeps 가 아니라 아카이브다", () => {
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const v1 = "STUB v1", v2 = "STUB v2";
  // ① init: 엔진이 v1 을 실제로 썼다
  const afterInit = finalizeManifest({
    rendered: [{ relPath: rel, content: v1, managed: false }], writtenPaths: new Set([rel]),
  });
  // ② upgrade: 템플릿이 v2 로 바뀌었지만 user-owned 라 엔진은 쓰지 않는다(디스크는 v1 그대로)
  const afterUpgrade = finalizeManifest({
    rendered: [{ relPath: rel, content: v2, managed: false }], writtenPaths: new Set(),
    prevManifest: afterInit, currentHashes: { [rel]: sha256(v1) },
  });
  // ③ 철거: 사용자가 손댄 적 없으므로 아카이브(교체 허용)여야 한다
  const plan = planRetire({
    retire: { replaceIfPristine: [rel] }, prevManifest: afterUpgrade, currentHashes: { [rel]: sha256(v1) },
  });
  assert.deepEqual(plan.keeps, [], "손대지 않은 파일이 '사용자 수정본'으로 새면 안 된다");
  assert.deepEqual(plan.archives, [{ relPath: rel, destPath: `${ARCHIVE_ROOT}/${rel}` }]);

  // 대조군 — 옛 동작(buildManifest)이었다면 바로 이 자리에서 keeps 로 샜다
  const legacyBehaviour = planRetire({
    retire: { replaceIfPristine: [rel] },
    prevManifest: buildManifest([{ relPath: rel, content: v2, managed: false }]),
    currentHashes: { [rel]: sha256(v1) },
  });
  assert.equal(legacyBehaviour.keeps.length, 1, "회귀 대조군: 옛 동작은 오분류했다");
});

test("finalizeManifest: `.new` 충돌 파일은 디스크 해시를 적지 않는다 (백업 없는 삭제 방지)", () => {
  const rel = "CLAUDE.md";
  const m = finalizeManifest({
    rendered: [{ relPath: rel, content: "v2", managed: true }],
    writtenPaths: new Set([`${rel}.new`]), // 원본이 아니라 .new 를 썼다
    prevManifest: { [rel]: { managed: true, sha256: sha256("v1") } },
    currentHashes: { [rel]: sha256("USER EDIT") },
  });
  assert.equal(m[rel].sha256, sha256("v1"));
  const plan = planRetire({
    retire: { delete: [rel] }, prevManifest: m, currentHashes: { [rel]: sha256("USER EDIT") },
  });
  assert.deepEqual(plan.backups, [{ relPath: rel, backupPath: "CLAUDE.md.legacy" }],
    "사용자 수정본은 반드시 .legacy 백업을 거쳐 삭제되어야 한다");
  assert.deepEqual(plan.deletes, []);
});

// ── `<파일>.new` 잔재 회수 ────────────────────────────────────────────
// 구버전은 릴리스마다 `/hcg-harness:upgrade` 재동기화를 권했고, 사용자가 고친 managed 파일은
// 그때마다 `<파일>.new` 를 남겼다. 이행이 이를 훑지 않으면 죽은 레거시 정의(5-에이전트 셸 등)가
// 그대로 프로젝트에 남는다 — 실측에서 CLAUDE.md.new · qa-agent.md.new 가 고아로 잔존했다.

test("planRetire: `<파일>.new` 잔재는 아카이브로 회수한다 (삭제하지 않음)", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa" },
    newFiles: new Set(["CLAUDE.md.new"]),
  });
  assert.deepEqual(out.deletes, ["CLAUDE.md"]);
  assert.deepEqual(out.archives, [
    { relPath: "CLAUDE.md.new", destPath: `${ARCHIVE_ROOT}/CLAUDE.md.new` },
  ]);
});

test("planRetire: 원본이 이미 없어도(missing) `.new` 잔재는 회수한다", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: {}, currentHashes: {},                 // 원본은 디스크에 없음
    newFiles: new Set(["CLAUDE.md.new"]),
  });
  assert.deepEqual(out.missing, ["CLAUDE.md"]);
  assert.deepEqual(out.archives, [
    { relPath: "CLAUDE.md.new", destPath: `${ARCHIVE_ROOT}/CLAUDE.md.new` },
  ]);
});

test("planRetire: `.new` 아카이브 목적지가 점유되어 있으면 blocked 로 간다", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa" },
    newFiles: new Set(["CLAUDE.md.new"]),
    existingDests: new Set([`${ARCHIVE_ROOT}/CLAUDE.md.new`]),
  });
  assert.deepEqual(out.archives, []);
  assert.deepEqual(out.blocked, [
    { relPath: "CLAUDE.md.new", destPath: `${ARCHIVE_ROOT}/CLAUDE.md.new`, kind: "archive" },
  ]);
});

test("planRetire: newFiles 를 주지 않으면 `.new` 관련 동작이 전혀 없다 (기본 경로 회귀)", () => {
  const out = planRetire({
    retire: RETIRE_FIXTURE,
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa", "tasks/TODO.md": "x" },
  });
  assert.ok(!out.archives.some((a) => a.relPath.endsWith(".new")));
  assert.deepEqual(out.blocked, []);
});

test("planRetire: 선언 목록 밖 파일의 `.new` 는 건드리지 않는다 (불가침)", () => {
  const out = planRetire({
    retire: { delete: ["CLAUDE.md"], archive: [], replaceIfPristine: [] },
    prevManifest: { "CLAUDE.md": { managed: true, sha256: "aaa" } },
    currentHashes: { "CLAUDE.md": "aaa" },
    newFiles: new Set(["CLAUDE.md.new", "src/user-file.ts.new"]),
  });
  const touched = out.archives.map((a) => a.relPath);
  assert.ok(touched.includes("CLAUDE.md.new"));
  assert.ok(!touched.includes("src/user-file.ts.new"));
});

test("planRetire: keeps 사유는 '사용자 수정본'으로 단정하지 않는다 (구버전 마커 드리프트 가능성)", () => {
  // 구버전 엔진(0.2.x 이하)이 쓴 마커에서는 이 불일치가 사용자 편집이 아니라 매니페스트 드리프트일 수
  // 있다. 사유가 단정하면 사용자는 손대지 않은 레거시 스텁을 자기 작업물로 알고 그대로 둔다.
  const rel = ".claude/skills/playwright-e2e/SKILL.md";
  const out = planRetire({
    retire: { replaceIfPristine: [rel] },
    prevManifest: { [rel]: { managed: false, sha256: "aaa" } },
    currentHashes: { [rel]: "bbb" },
  });
  assert.equal(out.keeps.length, 1);
  assert.match(out.keeps[0].reason, /드리프트/, "두 번째 가능성(구버전 마커 드리프트)을 알려야 한다");
  assert.match(out.keeps[0].reason, /검토|확인/, "사람이 확인할 행동을 지시해야 한다");
  assert.ok(!/^사용자 수정본/.test(out.keeps[0].reason), "단정으로 시작하면 안 된다");
});
