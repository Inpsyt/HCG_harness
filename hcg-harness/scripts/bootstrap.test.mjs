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

import { planUpgrade } from "./bootstrap.mjs";

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
