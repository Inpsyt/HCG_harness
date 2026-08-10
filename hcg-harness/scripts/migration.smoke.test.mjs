import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { main as legacyMain } from "./bootstrap.mjs";
import { main as coreMain } from "../../hcg-core/scripts/bootstrap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_PROFILES = path.resolve(HERE, "..", "profiles");
const CORE_PROFILES = path.resolve(HERE, "..", "..", "hcg-core", "profiles");
const NOW = () => "2026-01-01T00:00:00Z";
const QUIET = { log: () => {}, now: NOW };

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

function legacyInit(dir) {
  assert.equal(legacyMain(
    ["--mode", "init", "--profile", "hcg", "--project-name", "Mig", "--app-dir", "apps/web",
     "--profiles-dir", LEGACY_PROFILES, "--target", dir], QUIET), 0, "레거시 init");
}
function legacyRetire(dir) {
  assert.equal(legacyMain(
    ["--mode", "retire", "--profile", "hcg",
     "--profiles-dir", LEGACY_PROFILES, "--target", dir], QUIET), 0, "retire");
}
function coreInit(dir, gapFill) {
  const argv = ["--mode", "init", "--profile", "hcg", "--project-name", "Mig", "--app-dir", "apps/web",
                "--profiles-dir", CORE_PROFILES, "--target", dir];
  if (gapFill) argv.splice(2, 0, "--gap-fill");
  assert.equal(coreMain(argv, QUIET), 0, gapFill ? "hcg-core gap-fill" : "hcg-core 신규 init");
}

/** 이행본 A 와 신규 기준선 B 를 비교해 { missing, orphans } 를 낸다. */
function orphanReport(migrated, fresh) {
  const A = new Set(walk(migrated));
  const B = new Set(walk(fresh));
  return {
    A, B,
    missing: [...B].filter((f) => !A.has(f)),
    orphans: [...A].filter((f) => !B.has(f))
      .filter((f) => !f.startsWith("docs/legacy-harness/") && !f.endsWith(".legacy")),
  };
}

test("레거시 init → retire → hcg-core gap-fill 이후 고아가 0 이다", () => {
  const migrated = mkdtempSync(path.join(tmpdir(), "hcg-migrated-"));
  let fresh;
  try {
    fresh = mkdtempSync(path.join(tmpdir(), "hcg-fresh-"));

    // ① 레거시 부트스트랩
    legacyInit(migrated);

    // ② 철거
    legacyRetire(migrated);

    // ③ hcg-core 재건 (비어있지 않으므로 gap-fill)
    coreInit(migrated, true);

    // ④ 기준선: hcg-core 신규 init
    coreInit(fresh, false);

    const { A, missing, orphans } = orphanReport(migrated, fresh);
    assert.deepEqual(missing, [], `hcg-core 신규 init 의 파일이 이행본에 없음: ${missing.join(", ")}`);
    assert.deepEqual(orphans, [], `이행 후 남은 고아: ${orphans.join(", ")}`);

    // 아카이브가 실제로 자산을 보존했는지
    assert.ok(A.has("docs/legacy-harness/tasks/TODO.md"), "tasks 아카이브 보존");
    assert.ok(A.has("docs/legacy-harness/scripts/codex-review.mjs"), "codex 래퍼 아카이브 보존");
    // 마커 전환
    assert.ok(A.has(".claude/.hcg-core.json"), "hcg-core 마커 생성");
    assert.ok(!A.has(".claude/.hcg-harness.json"), "레거시 마커 제거");
    // 5-에이전트 소멸 · task-agent 등장
    assert.ok(!A.has(".claude/agents/plan-agent.md"), "레거시 에이전트 소멸");
    assert.ok(A.has(".claude/agents/task-agent.md"), "task-agent 생성");
  } finally {
    rmSync(migrated, { recursive: true, force: true });
    if (fresh) rmSync(fresh, { recursive: true, force: true });
  }
});

test("사용자 수정본이 있는 프로젝트도 백업·보존이 성립하고 고아가 0 이다", () => {
  const migrated = mkdtempSync(path.join(tmpdir(), "hcg-migrated-dirty-"));
  let fresh;
  try {
    fresh = mkdtempSync(path.join(tmpdir(), "hcg-fresh-dirty-"));

    legacyInit(migrated);

    // 현실의 이행 조건: 사용자가 파일을 손댄 상태.
    //  - delete 버킷 + 수정  → `.legacy` 백업 후 삭제되어야 한다
    //  - replaceIfPristine + 수정 → 원 위치에 그대로 남아야 한다
    const claude = path.join(migrated, "CLAUDE.md");
    const skill = path.join(migrated, ".claude", "skills", "playwright-e2e", "SKILL.md");
    writeFileSync(claude, "USER EDIT\n", "utf8");
    writeFileSync(skill, "USER EDITED SKILL\n", "utf8");

    legacyRetire(migrated);

    assert.equal(readFileSync(path.join(migrated, "CLAUDE.md.legacy"), "utf8"), "USER EDIT\n",
      "수정본은 .legacy 로 백업되어야 한다 — 백업 없이 삭제되면 사용자 작업 소실");
    assert.ok(!existsSync(claude), "백업된 원본은 제거되어 hcg-core 본이 자리를 잡는다");
    assert.equal(readFileSync(skill, "utf8"), "USER EDITED SKILL\n",
      "replaceIfPristine 의 사용자 수정본은 원 위치 보존");

    coreInit(migrated, true);
    coreInit(fresh, false);

    const { missing, orphans } = orphanReport(migrated, fresh);
    assert.deepEqual(missing, [], `이행본에 없는 파일: ${missing.join(", ")}`);
    assert.deepEqual(orphans, [], `이행 후 남은 고아: ${orphans.join(", ")}`);
  } finally {
    rmSync(migrated, { recursive: true, force: true });
    if (fresh) rmSync(fresh, { recursive: true, force: true });
  }
});

// ── 구버전 실사용 패턴 회귀 ───────────────────────────────────────────
// 구버전은 릴리스마다 `/hcg-harness:upgrade` 재동기화를 권장했다. 관리 파일을 고친 프로젝트는
// 그때마다 `<파일>.new` 를 얻었고, 실측에서 그 잔재가 이행 후에도 고아로 남았다.

function legacyUpgrade(dir) {
  assert.equal(legacyMain(
    ["--mode", "upgrade", "--profile", "hcg",
     "--profiles-dir", LEGACY_PROFILES, "--target", dir], QUIET), 0, "레거시 upgrade");
}

test("릴리스마다 upgrade 를 돌린(=`.new` 가 쌓인) 프로젝트도 이행 후 고아가 0 이다", () => {
  const migrated = mkdtempSync(path.join(tmpdir(), "hcg-migrated-new-"));
  let fresh;
  try {
    fresh = mkdtempSync(path.join(tmpdir(), "hcg-fresh-new-"));

    legacyInit(migrated);
    // 관리 파일 2종을 팀이 고친 상태에서 재동기화 → `.new` 충돌 잔재
    writeFileSync(path.join(migrated, "CLAUDE.md"), "팀이 고친 CLAUDE\n", "utf8");
    writeFileSync(path.join(migrated, ".claude", "agents", "qa-agent.md"), "팀 커스텀 qa\n", "utf8");
    legacyUpgrade(migrated);
    assert.ok(existsSync(path.join(migrated, "CLAUDE.md.new")), "전제: `.new` 잔재가 생겼다");

    legacyRetire(migrated);
    coreInit(migrated, true);
    coreInit(fresh, false);

    const { A, missing, orphans } = orphanReport(migrated, fresh);
    assert.deepEqual(missing, [], `이행본에 없는 파일: ${missing.join(", ")}`);
    assert.deepEqual(orphans, [], `이행 후 남은 고아: ${orphans.join(", ")}`);
    // 잔재는 지워진 게 아니라 아카이브로 보존된다 — 병합 중이었을 수 있다
    assert.ok(A.has("docs/legacy-harness/CLAUDE.md.new"), "`.new` 내용은 아카이브에 보존");
    assert.ok(A.has("docs/legacy-harness/.claude/agents/qa-agent.md.new"));
    // 사용자 수정 원본은 `.legacy` 백업으로 남는다
    assert.equal(readFileSync(path.join(migrated, "CLAUDE.md.legacy"), "utf8"), "팀이 고친 CLAUDE\n");
  } finally {
    rmSync(migrated, { recursive: true, force: true });
    if (fresh) rmSync(fresh, { recursive: true, force: true });
  }
});

test("hcg-core init 을 레거시 위에 먼저 돌린 프로젝트는 철거가 거부된다 (hcg-core 산출물 보호)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hcg-both-markers-"));
  try {
    legacyInit(dir);
    coreInit(dir, true); // upgrade.md §0 이 금지하는 순서 — 두 마커 공존
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-harness.json")));
    assert.ok(existsSync(path.join(dir, ".claude", ".hcg-core.json")));
    // gap-fill 이 새로 만든 hcg-core 산출물 — 레거시 매니페스트에 없어 "사용자 수정본"으로
    // 오인되던 파일이다.
    const coreWritten = path.join(dir, "contracts", "shared-types.ts");
    assert.ok(existsSync(coreWritten), "전제: hcg-core 가 새 파일을 썼다");

    const out = [];
    const code = legacyMain(
      ["--mode", "retire", "--profile", "hcg", "--profiles-dir", LEGACY_PROFILES, "--target", dir],
      { log: (s) => out.push(s), now: NOW });
    assert.equal(code, 1, "공존 상태에서는 철거하지 않는다");
    assert.equal(JSON.parse(out[out.length - 1]).coreMarkerPresent, true);
    assert.ok(existsSync(coreWritten), "hcg-core 가 쓴 파일이 살아있다");
    assert.ok(!existsSync(path.join(dir, "contracts", "shared-types.ts.legacy")), "백업 후 삭제도 없었다");
    assert.ok(existsSync(path.join(dir, "CLAUDE.md")), "레거시 파일도 그대로 — 반쪽 상태를 만들지 않는다");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
