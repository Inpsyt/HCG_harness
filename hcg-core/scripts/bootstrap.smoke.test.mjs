import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./bootstrap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILES = path.resolve(HERE, "..", "profiles");

test("init: hcg-core 마커·앱 골격 생성, tasks/·codex 부재, 토큰 치환", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-boot-"));
  try {
    const out = [];
    const code = main(
      ["--mode", "init", "--profile", "hcg", "--project-name", "Smoke",
       "--app-dir", "apps/web", "--profiles-dir", PROFILES, "--target", dir],
      { log: (s) => out.push(s), now: () => "2026-01-01T00:00:00Z" }
    );
    assert.equal(code, 0);
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-core.json")), "hcg-core 마커");
    assert.ok(!existsSync(path.join(dir, ".claude", ".hcg-harness.json")), "레거시 마커 없음");
    assert.ok(existsSync(path.join(dir, "apps", "web", "package.json")), "앱 골격");
    assert.ok(!existsSync(path.join(dir, "tasks")), "tasks/ 미생성");
    assert.ok(!existsSync(path.join(dir, "scripts", "codex-review.mjs")), "codex 래퍼 미생성");
    const marker = JSON.parse(readFileSync(path.join(dir, ".claude", ".hcg-core.json"), "utf8"));
    assert.equal(marker.harnessVersion, "0.1.0", "plugin.json 버전 반영");
    const pageOut = readFileSync(path.join(dir, "apps", "web", "app", "page.tsx"), "utf8");
    assert.match(pageOut, /Smoke/);
    assert.ok(!/\{\{/.test(pageOut), "미해소 토큰 없음");
    const appPkg = readFileSync(path.join(dir, "apps", "web", "package.json"), "utf8");
    assert.ok(!/codex:review/.test(appPkg), "앱 package.json 에 codex 스크립트 없음");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("init --no-app: 하네스 레이어만 — 앱 골격·.github 미생성, 마커 choices.app=false", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-noapp-"));
  try {
    const code = main(
      ["--mode", "init", "--profile", "hcg", "--project-name", "Smoke",
       "--app-dir", "apps/web", "--profiles-dir", PROFILES, "--target", dir, "--no-app"],
      { log: () => {}, now: () => "2026-01-01T00:00:00Z" }
    );
    assert.equal(code, 0);
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-core.json")), "마커");
    assert.ok(existsSync(path.join(dir, "contracts", "api-spec.md")), "contracts 생성");
    assert.ok(!existsSync(path.join(dir, "apps")), "앱 골격 미생성");
    assert.ok(!existsSync(path.join(dir, ".github")), ".github 미생성");
    const marker = JSON.parse(readFileSync(path.join(dir, ".claude", ".hcg-core.json"), "utf8"));
    assert.equal(marker.choices.app, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("upgrade 라운드트립: 사용자 수정 관리 파일 → .new 충돌, --no-app 지속", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-up-"));
  try {
    main(["--mode", "init", "--profile", "hcg", "--project-name", "Smoke",
          "--app-dir", "apps/web", "--profiles-dir", PROFILES, "--target", dir, "--no-app"],
         { log: () => {}, now: () => "2026-01-01T00:00:00Z" });
    const core = path.join(dir, ".claude", "CLAUDE-core.md");
    writeFileSync(core, "USER EDIT\n", "utf8");
    const upOut = [];
    const up = main(["--mode", "upgrade", "--profile", "hcg",
                     "--profiles-dir", PROFILES, "--target", dir],
                    { log: (s) => upOut.push(s), now: () => "2026-01-02T00:00:00Z" });
    assert.equal(up, 0);
    const rep = JSON.parse(upOut.join("\n"));
    assert.equal(rep.ok, true);
    assert.ok(rep.report.conflicts.some((c) => c.relPath === ".claude/CLAUDE-core.md"), ".new 충돌");
    assert.ok(existsSync(core + ".new"), ".new 생성");
    assert.equal(readFileSync(core, "utf8"), "USER EDIT\n", "사용자 수정 보존");
    assert.ok(!existsSync(path.join(dir, "apps")), "upgrade 후에도 앱 골격 미부활 (choices.app 지속)");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
