import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync,
  copyFileSync, renameSync, rmdirSync,
} from "node:fs";
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

test("init --no-codex: 래퍼 미생성·package.json 무 codex·마커 기록, upgrade 에도 지속", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-nocodex-"));
  try {
    const code = main(
      ["--mode", "init", "--profile", "hcg", "--project-name", "Smoke", "--app-dir", "apps/web",
       "--profiles-dir", PROFILES, "--target", dir, "--no-codex"],
      { log: () => {}, now: () => "2026-01-01T00:00:00Z" }
    );
    assert.equal(code, 0);
    assert.ok(!existsSync(path.join(dir, "scripts", "codex-review.mjs")), "래퍼 미생성");
    const pkg = JSON.parse(readFileSync(path.join(dir, "apps", "web", "package.json"), "utf8"));
    assert.equal(pkg.scripts["codex:review"], undefined, "codex:review 스크립트 없음");
    assert.equal(pkg.scripts["test:e2e"], "playwright test", "인접 스크립트 무손상(JSON 유효)");
    assert.match(readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), /codex 게이트\*\*: 미사용/);
    const marker = JSON.parse(readFileSync(path.join(dir, ".claude", ".hcg-harness.json"), "utf8"));
    assert.equal(marker.choices.codex, false);

    const up = main(
      ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", PROFILES, "--target", dir],
      { log: () => {}, now: () => "2026-01-02T00:00:00Z" }
    );
    assert.equal(up, 0);
    assert.ok(!existsSync(path.join(dir, "scripts", "codex-review.mjs")), "upgrade 후에도 미부활");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function initLegacy(dir) {
  const code = main(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Retire", "--app-dir", "apps/web",
     "--profiles-dir", PROFILES, "--target", dir],
    { log: () => {}, now: () => "2026-01-01T00:00:00Z" }
  );
  assert.equal(code, 0);
}

function runRetire(dir, extraArgs = []) {
  const out = [];
  const code = main(
    ["--mode", "retire", "--profile", "hcg", "--profiles-dir", PROFILES, "--target", dir, ...extraArgs],
    { log: (s) => out.push(s), now: () => "2026-01-01T00:00:00Z" }
  );
  return { code, json: JSON.parse(out[out.length - 1]) };
}

test("retire --dry-run 은 디스크를 건드리지 않는다", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-dry-"));
  try {
    initLegacy(dir);
    const before = existsSync(path.join(dir, "CLAUDE.md"));
    const { code, json } = runRetire(dir, ["--dry-run"]);
    assert.equal(code, 0);
    assert.equal(json.ok, true);
    assert.equal(json.dryRun, true);
    assert.ok(json.plan.deletes.includes("CLAUDE.md"), "삭제 계획에 CLAUDE.md 포함");
    assert.equal(existsSync(path.join(dir, "CLAUDE.md")), before, "dry-run 은 파일을 지우지 않는다");
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")), "마커도 그대로");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire 는 삭제·백업·아카이브·빈 디렉터리 정리·마커 제거를 수행한다", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-"));
  try {
    initLegacy(dir);
    // 사용자 수정 시나리오: CLAUDE.md 를 변조 → .legacy 백업 기대
    writeFileSync(path.join(dir, "CLAUDE.md"), "USER EDIT\n", "utf8");

    const { code, json } = runRetire(dir);
    assert.equal(code, 0);
    assert.equal(json.ok, true);

    // 1) managed 미수정본 삭제
    assert.ok(!existsSync(path.join(dir, ".claude", "agents", "plan-agent.md")), "레거시 에이전트 삭제");
    assert.ok(!existsSync(path.join(dir, ".claude", "agents")), "빈 agents 디렉터리 정리");
    // 2) 사용자 수정본 백업 후 삭제
    assert.ok(!existsSync(path.join(dir, "CLAUDE.md")), "수정본도 원본은 제거");
    assert.equal(readFileSync(path.join(dir, "CLAUDE.md.legacy"), "utf8"), "USER EDIT\n");
    // 3) user-owned 아카이브 이동
    assert.ok(!existsSync(path.join(dir, "tasks")), "tasks 디렉터리 소멸");
    assert.ok(existsSync(path.join(dir, "docs", "legacy-harness", "tasks", "TODO.md")), "아카이브 이동");
    assert.ok(existsSync(path.join(dir, "docs", "legacy-harness", "scripts", "codex-review.mjs")));
    // 4) 마커 제거(마지막)
    assert.ok(!existsSync(path.join(dir, ".claude", ".hcg-harness.json")), "레거시 마커 제거");
    // 5) 불가침 — 사용자 슬롯은 살아있다
    assert.ok(existsSync(path.join(dir, ".claude", "project.md")), "project.md 보존");
    assert.ok(existsSync(path.join(dir, "apps", "web", "package.json")), "앱 보존");
    // 6) contracts/*.md 는 replaceIfPristine — 미수정본은 원 위치가 아니라 아카이브로 이동한다
    //    (교체 허용 — hcg-core gap-fill 이 원 위치에 새 본을 채운다)
    assert.ok(!existsSync(path.join(dir, "contracts", "api-spec.md")), "미수정 contracts 는 원 위치에 남지 않는다");
    assert.ok(existsSync(path.join(dir, "docs", "legacy-harness", "contracts", "api-spec.md")), "미수정 contracts 는 아카이브된다");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire 재실행은 멱등이다 (마커 없음 → 명시적 오류)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-idem-"));
  try {
    initLegacy(dir);
    assert.equal(runRetire(dir).code, 0);
    const second = runRetire(dir);
    assert.equal(second.code, 1, "마커가 없으면 비-0");
    assert.equal(second.json.ok, false);
    assert.match(second.json.error, /마커/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire: .legacy 백업 대상이 이미 있으면 원본을 보존하고 이행을 중단한다", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-bkcol-"));
  try {
    initLegacy(dir);
    writeFileSync(path.join(dir, "CLAUDE.md"), "USER EDIT\n", "utf8");
    writeFileSync(path.join(dir, "CLAUDE.md.legacy"), "MY PRECIOUS ORIGINAL\n", "utf8");

    const { code, json } = runRetire(dir);
    assert.equal(code, 1, "충돌이 남으면 비-0");
    assert.equal(json.ok, false);
    assert.equal(readFileSync(path.join(dir, "CLAUDE.md.legacy"), "utf8"), "MY PRECIOUS ORIGINAL\n",
      "사용자의 기존 .legacy 파일을 덮어쓰지 않는다");
    assert.equal(readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), "USER EDIT\n",
      "백업하지 못한 원본은 삭제하지 않는다");
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")),
      "미해소 충돌이 있으면 마커를 유지해 재실행 가능하게 한다");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire: 아카이브 목적지가 이미 있으면 원본 경로와 함께 보고하고 중단한다", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-arcol-"));
  try {
    initLegacy(dir);
    mkdirSync(path.join(dir, "docs", "legacy-harness", "tasks"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "legacy-harness", "tasks", "TODO.md"), "PRIOR RUN\n", "utf8");

    const { code, json } = runRetire(dir);
    assert.equal(code, 1);
    assert.equal(json.ok, false);
    assert.ok(existsSync(path.join(dir, "tasks", "TODO.md")), "옮기지 못한 원본은 그대로 남는다");
    assert.equal(readFileSync(path.join(dir, "docs", "legacy-harness", "tasks", "TODO.md"), "utf8"),
      "PRIOR RUN\n", "기존 아카이브를 덮어쓰지 않는다");
    const skipped = json.report.skippedArchive;
    assert.ok(skipped.some((s) => s.relPath === "tasks/TODO.md"),
      "리포트가 프로젝트에 남은 원본 경로를 이름으로 알려준다");
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")), "마커 유지 → 재실행 가능");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire --dry-run 은 목적지 충돌을 실행 전에 보고한다 (반쪽 철거 방지)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-drycol-"));
  try {
    initLegacy(dir);
    writeFileSync(path.join(dir, "CLAUDE.md"), "USER EDIT\n", "utf8");
    writeFileSync(path.join(dir, "CLAUDE.md.legacy"), "MY PRECIOUS ORIGINAL\n", "utf8");

    const { code, json } = runRetire(dir, ["--dry-run"]);
    assert.equal(code, 1, "dry-run 도 충돌이면 비-0");
    assert.equal(json.incomplete, true);
    assert.ok(json.unresolved.some((b) => b.relPath === "CLAUDE.md" && b.kind === "backup"));
    // 그리고 실제 실행도 아무것도 지우지 않아야 한다
    const real = runRetire(dir);
    assert.equal(real.code, 1);
    assert.ok(existsSync(path.join(dir, ".claude", "CLAUDE-core.md")), "충돌 시 다른 파일도 지우지 않는다");
    assert.ok(existsSync(path.join(dir, ".claude", "agents", "plan-agent.md")));
    assert.ok(existsSync(path.join(dir, "tasks", "TODO.md")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire: 알 수 없는 인자는 거부한다 (오타 플래그로 실수 삭제 금지)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-badflag-"));
  try {
    initLegacy(dir);
    const { code, json } = runRetire(dir, ["--dry-run=true"]);
    assert.equal(code, 1);
    assert.equal(json.ok, false);
    assert.match(json.error, /알 수 없는 인자/);
    assert.ok(existsSync(path.join(dir, "CLAUDE.md")), "거부되었으므로 아무것도 삭제되지 않는다");
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire: 철거 도중 fs 오류(EPERM 등)가 나면 그때까지 처리분을 report.deleted 로 보고하고 partial:true 로 실패한다", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-eperm-"));
  try {
    initLegacy(dir);
    // profile.json 의 retiredFiles.delete 순서: plan-agent.md, db-agent.md, backend-agent.md, ...
    // 3번째 항목에서 던지면 앞의 2개는 이미 처리된 채로 예외가 나야 한다.
    const throwRel = ".claude/agents/backend-agent.md";
    const throwAbs = path.resolve(path.join(dir, throwRel));
    const flakyFs = {
      readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync, renameSync, rmdirSync,
      rmSync: (p, opts) => {
        if (path.resolve(p) === throwAbs) {
          throw Object.assign(new Error("EPERM: operation not permitted, unlink"), { code: "EPERM" });
        }
        return rmSync(p, opts);
      },
    };

    const out = [];
    const code = main(
      ["--mode", "retire", "--profile", "hcg", "--profiles-dir", PROFILES, "--target", dir],
      { log: (s) => out.push(s), now: () => "2026-01-01T00:00:00Z", fs: flakyFs }
    );
    const json = JSON.parse(out[out.length - 1]);

    assert.equal(code, 1, "fs 오류는 비-0 종료 (fail-closed)");
    assert.equal(json.ok, false);
    assert.equal(json.partial, true);
    assert.match(json.error, /EPERM/);
    assert.ok(json.report.deleted.includes(".claude/agents/plan-agent.md"),
      "던지기 전에 처리된 항목은 report.deleted 에 남는다");
    assert.ok(json.report.deleted.includes(".claude/agents/db-agent.md"));
    assert.ok(!json.report.deleted.includes(throwRel), "던진 파일 자체는 완료로 기록되지 않는다");
    assert.ok(!existsSync(path.join(dir, ".claude", "agents", "plan-agent.md")),
      "던지기 전 처리분은 실제로 디스크에도 반영되어 있다");
    assert.ok(existsSync(path.join(dir, ".claude", "agents", "backend-agent.md")),
      "던진 파일 자체는 디스크에 그대로 남는다");
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")),
      "마커는 유지되어 재실행으로 이어서 처리할 수 있다");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── hcg-core 마커 공존 시 철거 fail-closed ────────────────────────────
// 철거 판정은 레거시 마커의 매니페스트와 디스크를 비교한다. hcg-core 가 이미 쓴 파일은 그
// 매니페스트에 없으므로 "사용자 수정본"으로 오인되어 `.legacy` 백업 후 삭제된다 — 실측에서
// hcg-core 가 방금 만든 `.github/workflows/ci.yml` 이 그 경로로 사라질 계획이 나왔다.
// upgrade.md §0 이 산문으로 금지하던 것을 엔진이 직접 막는다.

test("retire: hcg-core 마커가 있으면 철거를 거부한다 (디스크·마커 무변경)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-coremarker-"));
  try {
    initLegacy(dir);
    writeFileSync(path.join(dir, ".claude", ".hcg-core.json"),
      JSON.stringify({ profile: "hcg", harnessVersion: "0.1.1", manifest: {} }), "utf8");

    const { code, json } = runRetire(dir);
    assert.equal(code, 1, "공존 상태에서는 비-0 (fail-closed)");
    assert.equal(json.ok, false);
    assert.equal(json.coreMarkerPresent, true);
    assert.match(json.error, /hcg-core 마커/);
    // 아무것도 지워지지 않았다
    assert.ok(existsSync(path.join(dir, "CLAUDE.md")));
    assert.ok(existsSync(path.join(dir, ".claude", "agents", "plan-agent.md")));
    assert.ok(existsSync(path.join(dir, "tasks", "TODO.md")));
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")), "레거시 마커도 그대로");
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-core.json")), "hcg-core 마커도 그대로");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire --dry-run 도 hcg-core 마커 공존이면 계획을 내놓지 않는다", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-coremarker-dry-"));
  try {
    initLegacy(dir);
    writeFileSync(path.join(dir, ".claude", ".hcg-core.json"), "{}", "utf8");
    const { code, json } = runRetire(dir, ["--dry-run"]);
    assert.equal(code, 1);
    assert.equal(json.ok, false);
    assert.equal(json.plan, undefined, "금지된 상태에서 계획을 보여주면 사용자가 그대로 진행한다");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── 구버전 upgrade 잔재(`<파일>.new`) 회수 ────────────────────────────

test("retire: upgrade 가 남긴 `.new` 잔재를 아카이브로 회수한다 (프로젝트에 남기지 않음)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-newresidue-"));
  try {
    initLegacy(dir);
    // 구버전 사용 패턴: 관리 파일을 고친 상태에서 릴리스마다 upgrade 재동기화 → `.new` 충돌
    writeFileSync(path.join(dir, "CLAUDE.md"), "USER EDIT\n", "utf8");
    writeFileSync(path.join(dir, ".claude", "agents", "qa-agent.md"), "팀 커스텀 qa\n", "utf8");
    const upCode = main(
      ["--mode", "upgrade", "--profile", "hcg", "--profiles-dir", PROFILES, "--target", dir],
      { log: () => {}, now: () => "2026-01-02T00:00:00Z" }
    );
    assert.equal(upCode, 0);
    assert.ok(existsSync(path.join(dir, "CLAUDE.md.new")), "전제: upgrade 가 .new 를 남긴다");
    assert.ok(existsSync(path.join(dir, ".claude", "agents", "qa-agent.md.new")));

    const { code, json } = runRetire(dir);
    assert.equal(code, 0);
    assert.equal(json.ok, true);

    // 프로젝트에는 `.new` 가 남지 않는다
    assert.ok(!existsSync(path.join(dir, "CLAUDE.md.new")));
    assert.ok(!existsSync(path.join(dir, ".claude", "agents", "qa-agent.md.new")));
    // 내용은 아카이브에 보존된다 (병합 중이었을 수 있으므로 삭제하지 않는다)
    assert.ok(existsSync(path.join(dir, "docs", "legacy-harness", "CLAUDE.md.new")));
    assert.ok(existsSync(path.join(dir, "docs", "legacy-harness", ".claude", "agents", "qa-agent.md.new")));
    assert.ok(json.report.archived.includes("docs/legacy-harness/CLAUDE.md.new"), "리포트에도 실린다");
    // 사용자 수정 원본은 여전히 `.legacy` 로 백업된다
    assert.equal(readFileSync(path.join(dir, "CLAUDE.md.legacy"), "utf8"), "USER EDIT\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retire: 사용자 소유 경로의 `.new` 는 건드리지 않는다 (불가침)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-retire-newuser-"));
  try {
    initLegacy(dir);
    const userNew = path.join(dir, "apps", "web", "app", "page.tsx.new");
    writeFileSync(userNew, "사용자가 직접 만든 .new\n", "utf8");
    const { code } = runRetire(dir);
    assert.equal(code, 0);
    assert.equal(readFileSync(userNew, "utf8"), "사용자가 직접 만든 .new\n",
      "철거 목록 밖 경로의 .new 는 이동 대상이 아니다");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
