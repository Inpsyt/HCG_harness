import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, "session-start-context.mjs");

function runHook(projectRoot) {
  return spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    env: { ...process.env, SESSION_START_PROJECT_ROOT: projectRoot },
  });
}

test("마커 없음 → init 안내 + exit 0", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-hook-"));
  try {
    const r = runHook(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\/hcg-core:init/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("hcg-core 마커 있음 → 버전·프로파일 상태 주입", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-hook-"));
  try {
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    writeFileSync(path.join(dir, ".claude", ".hcg-core.json"),
      JSON.stringify({ profile: "hcg", harnessVersion: "0.1.0" }), "utf8");
    const r = runHook(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /hcg-core 0\.1\.0/);
    assert.match(r.stdout, /profile: hcg/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("레거시 마커 감지 → 혼용 경고 (hcg-core 마커보다 우선)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-hook-"));
  try {
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    writeFileSync(path.join(dir, ".claude", ".hcg-harness.json"), "{}", "utf8");
    writeFileSync(path.join(dir, ".claude", ".hcg-core.json"),
      JSON.stringify({ profile: "hcg", harnessVersion: "0.1.0" }), "utf8");
    const r = runHook(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /레거시 hcg-harness 마커/);
    // 이행 경로는 0.3.0 부터 `/hcg-harness:upgrade` 1회 자동 절차다. 폐기된 "수동 가이드"
    // 안내로 되돌아가면(레거시 플러그인 자신의 훅과 서로 다른 절차를 안내하던 상태) 여기서 깨진다.
    assert.match(r.stdout, /\/hcg-harness:upgrade/);
    assert.doesNotMatch(r.stdout, /수동 이행 가이드/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("깨진 마커 JSON → fail-open: init 안내로 강등 + exit 0", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcgcore-hook-"));
  try {
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    writeFileSync(path.join(dir, ".claude", ".hcg-core.json"), "not-json", "utf8");
    const r = runHook(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\/hcg-core:init/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
