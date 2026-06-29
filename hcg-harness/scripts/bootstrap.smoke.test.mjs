import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./bootstrap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILES = path.resolve(HERE, "..", "profiles");

test("init then upgrade round-trip on a temp dir", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-boot-"));
  try {
    const initOut = [];
    const code = main(
      ["--mode", "init", "--profile", "hcg", "--project-name", "Smoke", "--app-dir", "apps/web", "--profiles-dir", PROFILES, "--target", dir],
      { log: (s) => initOut.push(s), now: () => "2026-01-01T00:00:00Z" }
    );
    assert.equal(code, 0);
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")), "marker exists");
    assert.ok(existsSync(path.join(dir, "apps", "web", "package.json")), "app skeleton exists");
    const pageOut = readFileSync(path.join(dir, "apps", "web", "app", "page.tsx"), "utf8");
    assert.match(pageOut, /Smoke/);
    assert.ok(!/\{\{/.test(pageOut), "no unresolved tokens");

    // managed 파일(CLAUDE-core.md) 변조 → upgrade 시 .new 충돌 기대
    const core = path.join(dir, ".claude", "CLAUDE-core.md");
    writeFileSync(core, "USER EDIT\n", "utf8");

    const upOut = [];
    const up = main(
      ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", PROFILES, "--target", dir],
      { log: (s) => upOut.push(s), now: () => "2026-01-02T00:00:00Z" }
    );
    assert.equal(up, 0);
    const rep = JSON.parse(upOut.join("\n"));
    assert.equal(rep.ok, true);
    const conflicted = rep.report.conflicts.some((c) => c.relPath === ".claude/CLAUDE-core.md");
    assert.ok(conflicted, "user-modified managed file -> .new conflict");
    assert.ok(existsSync(core + ".new"), ".new written");
    assert.equal(readFileSync(core, "utf8"), "USER EDIT\n", "user edit preserved");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
