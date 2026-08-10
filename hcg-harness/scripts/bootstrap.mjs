#!/usr/bin/env node
// scripts/bootstrap.mjs — HCG harness 생성/재적용 엔진 (--mode init|upgrade)
// 순수 헬퍼 export + IO + main(). 신규 의존성 없음(node builtins만).
// fail-closed: 오류 시 부분 기록 없이 비-0 종료.

import { createHash } from "node:crypto";
import {
  readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync,
  copyFileSync, renameSync, rmSync, rmdirSync,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_FS = {
  readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync,
  copyFileSync, renameSync, rmSync, rmdirSync,
};

/** 프로젝트명 → npm/디렉터리 안전 슬러그. 소문자·하이픈, 빈 결과는 "app". */
export function slugify(name) {
  const s = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "app";
}

/** {{KEY}} 토큰을 치환. 미정의 토큰은 원문 유지. */
export function substituteTokens(text, tokens) {
  return String(text).replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key]) : m
  );
}

/** CRLF/CR → LF. 해시·비교 전 정규화. */
export function normalizeForHash(text) {
  return String(text).replace(/\r\n?/g, "\n");
}

/** LF 정규화 후 sha256 hex. */
export function sha256(text) {
  return createHash("sha256").update(normalizeForHash(text), "utf8").digest("hex");
}

/** 최소 glob → anchored RegExp. 지원: ** (세그먼트 횡단), * (세그먼트 내). */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; }
      else re += "[^/]*";
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** relPath(POSIX)가 userOwnedGlobs 중 하나라도 매칭하면 true. */
export function isUserOwned(relPath, userOwnedGlobs) {
  const globs = Array.isArray(userOwnedGlobs) ? userOwnedGlobs : [];
  return globs.some((g) => globToRegExp(g).test(relPath));
}

// ── Task 3: 프로파일 발견 · 로드 · 검증 ──────────────────────────────────────

const REQUIRED = {
  id: "string", label: "string", appDir: "string",
  setupCommands: "array", userOwnedGlobs: "array",
};

/** 누락/부적합 필드명 배열 반환 (빈 배열 = 유효). */
export function validateProfile(profile) {
  const missing = [];
  if (!profile || typeof profile !== "object") return Object.keys(REQUIRED);
  for (const [field, kind] of Object.entries(REQUIRED)) {
    const v = profile[field];
    const ok = kind === "array" ? Array.isArray(v) : typeof v === kind && v !== "";
    if (!ok) missing.push(field);
  }
  return missing;
}

/** 하위 디렉터리의 profile.json을 읽어 {id,label} 목록 반환. 손상 항목 건너뜀. */
export function discoverProfiles(profilesDir, fs = NODE_FS) {
  let entries;
  try { entries = fs.readdirSync(profilesDir, { withFileTypes: true }); }
  catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(profilesDir, e.name, "profile.json");
    try {
      const p = JSON.parse(fs.readFileSync(file, "utf8"));
      if (validateProfile(p).length === 0) out.push({ id: p.id, label: p.label });
    } catch { /* 손상 프로파일 건너뜀 */ }
  }
  return out;
}

/** 검증된 profile 객체 반환. 없거나 무효면 throw. */
export function loadProfile(profilesDir, id, fs = NODE_FS) {
  const file = path.join(profilesDir, id, "profile.json");
  if (!fs.existsSync(file)) throw new Error(`profile '${id}' not found at ${file}`);
  let p;
  try { p = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { throw new Error(`profile '${id}' is not valid JSON: ${e.message}`); }
  const missing = validateProfile(p);
  if (missing.length) throw new Error(`profile '${id}' missing/invalid fields: ${missing.join(", ")}`);
  return p;
}

// ── Task 4: 템플릿 walk + 프로파일 렌더 ─────────────────────────────────────

/** 백슬래시→슬래시, 중복 슬래시 축약, 선행 ./ 제거. */
export function toPosix(p) {
  return String(p).replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
}

/** templatesDir 기준 상대경로를 보존하며 재귀 walk. (내부 헬퍼) */
function walkRel(rootDir, rel, fs) {
  const dir = rel ? path.join(rootDir, rel) : rootDir;
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkRel(rootDir, childRel, fs));
    else out.push({ relPath: toPosix(childRel), content: fs.readFileSync(path.join(rootDir, childRel), "utf8") });
  }
  return out;
}

/** dir 하위 모든 파일의 POSIX 상대경로 + 내용. */
export function walkTemplates(dir, fs = NODE_FS) { return walkRel(dir, "", fs); }

/** walk → 경로·내용 토큰 치환 → 경로 정규화 → isUserOwned로 managed 결정.
 *  choices.codex === false 면 CODEX_* 토큰을 off 값으로 렌더하고 profile.codexFiles 를 제외한다. */
export function renderProfile({ templatesDir, profile, choices, fs = NODE_FS }) {
  const codex = choices.codex !== false;
  const tokens = {
    PROJECT_NAME: choices.projectName,
    APP_DIR: choices.appDir,
    PROJECT_SLUG: slugify(choices.projectName),
    CODEX_PKG_SCRIPT: codex ? ',\n    "codex:review": "node ../../scripts/codex-review.mjs"' : "",
    CODEX_CLAUDE_LINE: codex
      ? '- **codex 게이트 래퍼**(qa Phase 완료 검증용): `scripts/codex-review.mjs` + `package.json` 의 `"codex:review"` 스크립트. 설치·배선은 `docs/install.md` 참조. (codex-companion 플러그인 의존.)'
      : '- **codex 게이트**: 미사용 (init 에서 제외). qa 는 자체 검증(테스트·빌드·타입·린트)으로 Phase 를 닫는다. 코드 리뷰가 필요하면 내장 `review` 워크플로를 수동 실행. (사후 활성화: `docs/install.md` §2e.)',
  };
  const excluded = new Set(codex ? [] : (profile.codexFiles || []).map(toPosix));
  // globs 도 경로와 같은 토큰을 치환 — "{{APP_DIR}}/**" 가 선택된 appDir 를 따라간다.
  // 토큰 없는 리터럴 glob 은 그대로 통과(substituteTokens 는 미정의 토큰 보존).
  const userOwnedGlobs = (Array.isArray(profile.userOwnedGlobs) ? profile.userOwnedGlobs : [])
    .map((g) => toPosix(substituteTokens(g, tokens)));
  const files = walkRel(templatesDir, "", fs);
  return files
    .map(({ relPath, content }) => {
      const outPath = toPosix(substituteTokens(relPath, tokens));
      return {
        relPath: outPath,
        content: substituteTokens(content, tokens),
        managed: !isUserOwned(outPath, userOwnedGlobs),
      };
    })
    .filter((f) => !excluded.has(f.relPath));
}

// ── Task 5: 마커 + 매니페스트 read/write ─────────────────────────────────────

/** 마커 파일의 POSIX 상대경로. */
export const MARKER_REL = ".claude/.hcg-harness.json";

/** hcg-core 마커의 POSIX 상대경로 — 철거 fail-closed 판정용(공존 금지). */
export const CORE_MARKER_REL = ".claude/.hcg-core.json";

/** 렌더 목록 → relPath: {managed, sha256(content)} 매니페스트. */
export function buildManifest(rendered) {
  const m = {};
  for (const f of rendered) m[f.relPath] = { managed: f.managed, sha256: sha256(f.content) };
  return m;
}

/**
 * 매니페스트는 "하네스가 그 경로에 **마지막으로 쓴 것**"을 기록해야 한다.
 *
 * buildManifest 는 렌더 결과(=템플릿)를 그대로 적는다. 그래서 엔진이 **일부러 쓰지 않은**
 * 파일(user-owned 스킵 · `.new` 충돌로 원본 보존 · gap-fill 스킵)까지 새 템플릿 해시로
 * 덮어써 마커가 디스크와 어긋난다. 그 어긋남은 나중에 planRetire 의 pristine 판정을 뒤집어
 * **손대지 않은 파일을 "사용자 수정본"으로 오분류**한다 — 실측(0.1.1 → 0.2.2 upgrade)에서
 * 아무도 건드리지 않은 `.claude/skills/playwright-e2e/SKILL.md` 가 keeps 로 빠져,
 * 죽은 `front 에이전트`·`pnpm --filter` 를 가리키는 레거시 스킬이 이행 후에도 남았다.
 *
 * 규칙(우선순위):
 *   1. 이번 실행이 실제로 쓴 경로  → 템플릿 해시 (하네스가 방금 쓴 것)
 *   2. 디스크가 이미 템플릿과 동일 → 템플릿 해시 (내용상 하네스 산출물)
 *   3. 이전 매니페스트에 있음      → 그 값을 그대로 이월 (하네스가 마지막으로 쓴 것)
 *   4. 그 밖                       → **항목 없음** — 하네스가 쓴 적 없으므로 아무 주장도 하지
 *      않는다. pristine 판정이 false 로 떨어져 보존 쪽(keeps/백업)으로 기운다(fail-safe).
 */
export function finalizeManifest({ rendered, writtenPaths = new Set(), prevManifest = {}, currentHashes = {} }) {
  const out = {};
  for (const f of rendered) {
    const templateHash = sha256(f.content);
    if (writtenPaths.has(f.relPath) || currentHashes[f.relPath] === templateHash) {
      out[f.relPath] = { managed: f.managed, sha256: templateHash };
      continue;
    }
    const prev = prevManifest[f.relPath];
    if (prev && typeof prev.sha256 === "string") {
      out[f.relPath] = { managed: f.managed, sha256: prev.sha256 };
    }
  }
  return out;
}

/** 마커 읽기. 없거나 파싱 실패 시 null. */
export function readMarker(targetDir, fs = NODE_FS) {
  const file = path.join(targetDir, MARKER_REL);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

/** .claude/ 보장 후 pretty JSON으로 마커 기록. */
export function writeMarker(targetDir, marker, fs = NODE_FS) {
  const file = path.join(targetDir, MARKER_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(marker, null, 2) + "\n", "utf8");
}

// ── Task 7: planUpgrade — 매니페스트 기반 3-way 판정 ─────────────────────────

/**
 * upgrade 시 파일별로 덮어쓰기/.new충돌/생성/무변경을 결정하는 순수 플래너.
 * - 사용자소유(managed=false): 디스크에 없으면 created, 있으면 skipped.
 * - managed:
 *   - 디스크에 없음 → created (writes에 추가)
 *   - 새 콘텐츠 해시 == 디스크 해시 → skipped (변경 없음)
 *   - 디스크 해시 == prevManifest 해시 (미수정) → overwritten (writes에 추가)
 *   - 디스크 해시 != prevManifest 해시 (사용자 수정) → .new 충돌
 */
export function planUpgrade({ rendered, prevManifest = {}, currentHashes = {} }) {
  const writes = [], conflicts = [], created = [], overwritten = [], skipped = [];
  for (const f of rendered) {
    const onDisk = Object.prototype.hasOwnProperty.call(currentHashes, f.relPath);
    const diskHash = currentHashes[f.relPath];
    const newHash = sha256(f.content);

    if (!f.managed) {
      if (!onDisk) { writes.push({ relPath: f.relPath, content: f.content }); created.push(f.relPath); }
      else skipped.push(f.relPath);
      continue;
    }
    // managed
    if (!onDisk) { writes.push({ relPath: f.relPath, content: f.content }); created.push(f.relPath); continue; }
    if (diskHash === newHash) { skipped.push(f.relPath); continue; }
    const prevHash = prevManifest[f.relPath]?.sha256;
    if (diskHash === prevHash) { writes.push({ relPath: f.relPath, content: f.content }); overwritten.push(f.relPath); }
    else {
      const newPath = `${f.relPath}.new`;
      writes.push({ relPath: newPath, content: f.content });
      conflicts.push({ relPath: f.relPath, newPath });
    }
  }
  return { writes, conflicts, created, overwritten, skipped };
}

// ── 0.3.0: 이행 램프 — 철거 판정 ────────────────────────────────────────────

/** 철거된 사용자 자산의 아카이브 루트(POSIX 상대경로). */
export const ARCHIVE_ROOT = "docs/legacy-harness";

/**
 * 이행 시 파일별 처분을 결정하는 순수 플래너.
 * retire = { delete, archive, replaceIfPristine } (profile.retiredFiles)
 * - delete(managed): 미수정 → 삭제 / 사용자 수정 → `.legacy` 백업 후 삭제
 * - archive(user-owned, hcg-core 대응물 없음): 항상 ARCHIVE_ROOT 로 이동(삭제 금지)
 * - replaceIfPristine(user-owned, 동일 경로 대응물 있음): 미수정 → 아카이브(교체 허용),
 *   사용자 수정 → 원 위치 보존 + 사유 보고
 * 세 목록에 없는 파일은 절대 나타나지 않는다(불가침).
 *
 * newFiles: 세 목록 항목의 `<파일>.new`(구버전 upgrade 충돌 잔재) 중 디스크에 실재하는 것.
 *   `.new` 는 **레거시 템플릿 사본**이라 방치하면 이행 후에도 죽은 레거시 정의가 프로젝트에
 *   남는다(실측: 릴리스마다 upgrade 를 돌린 프로젝트에서 `CLAUDE.md.new` ·
 *   `.claude/agents/qa-agent.md.new` 가 고아로 잔존). 삭제하지 않고 아카이브로 회수한다 —
 *   사용자가 병합 중이었을 수 있으므로 내용은 보존한다.
 */
export function planRetire({ retire = {}, prevManifest = {}, currentHashes = {}, existingDests = new Set(), newFiles = new Set() }) {
  const deletes = [], backups = [], archives = [], keeps = [], missing = [], blocked = [];
  const onDisk = (rel) => Object.prototype.hasOwnProperty.call(currentHashes, rel);
  const pristine = (rel) => currentHashes[rel] === (prevManifest[rel] && prevManifest[rel].sha256);
  const dest = (rel) => `${ARCHIVE_ROOT}/${rel}`;
  const taken = (p) => existingDests.has(p);

  for (const rel of retire.delete || []) {
    if (!onDisk(rel)) { missing.push(rel); continue; }
    if (pristine(rel)) { deletes.push(rel); continue; }
    const backupPath = `${rel}.legacy`;
    // 목적지가 이미 있으면 사용자 파일이다 — 이번 실행 전체를 막는다(부분 철거 금지).
    if (taken(backupPath)) blocked.push({ relPath: rel, destPath: backupPath, kind: "backup" });
    else backups.push({ relPath: rel, backupPath });
  }
  for (const rel of retire.archive || []) {
    if (!onDisk(rel)) { missing.push(rel); continue; }
    const destPath = dest(rel);
    if (taken(destPath)) blocked.push({ relPath: rel, destPath, kind: "archive" });
    else archives.push({ relPath: rel, destPath });
  }
  for (const rel of retire.replaceIfPristine || []) {
    if (!onDisk(rel)) { missing.push(rel); continue; }
    if (!pristine(rel)) {
      keeps.push({ relPath: rel, reason: "사용자 수정본 — 원 위치 보존. 죽은 에이전트 참조 검토 필요" });
      continue;
    }
    const destPath = dest(rel);
    if (taken(destPath)) blocked.push({ relPath: rel, destPath, kind: "archive" });
    else archives.push({ relPath: rel, destPath });
  }
  // `<파일>.new` 잔재 회수 — 원본이 이미 없어졌어도(missing) 잔재는 남을 수 있으므로
  // onDisk 와 무관하게 세 목록 전체를 훑는다. missing 에는 싣지 않는다(선언된 철거 대상이 아님).
  for (const rel of [...(retire.delete || []), ...(retire.archive || []), ...(retire.replaceIfPristine || [])]) {
    const src = `${rel}.new`;
    if (!newFiles.has(src)) continue;
    const destPath = dest(src);
    if (taken(destPath)) blocked.push({ relPath: src, destPath, kind: "archive" });
    else archives.push({ relPath: src, destPath });
  }
  return { deletes, backups, archives, keeps, missing, blocked };
}

// ── Task 6: planInit — 빈/비어있지않은 폴더 가드 ─────────────────────────────

/**
 * init 시 어떤 파일을 쓸지/막을지 결정하는 순수 플래너.
 * mode: "strict"(기본) | "force" | "gap-fill"
 * - strict: 충돌이 하나라도 있으면 blocked:true, writes 비움.
 * - force: 전부 쓴다(겹쳐도 덮어씀), conflicts는 보고용.
 * - gap-fill: 존재하지 않는 것만 쓰고 존재하는 건 skipped.
 */
export function planInit({ rendered, existing, mode = "strict" }) {
  const conflicts = rendered.filter((f) => existing.has(f.relPath)).map((f) => f.relPath);
  if (mode === "strict" && conflicts.length) {
    return { writes: [], skipped: [], conflicts, blocked: true };
  }
  if (mode === "gap-fill") {
    const writes = rendered.filter((f) => !existing.has(f.relPath)).map((f) => ({ relPath: f.relPath, content: f.content }));
    return { writes, skipped: conflicts, conflicts: [], blocked: false };
  }
  // strict(무충돌) 또는 force
  const writes = rendered.map((f) => ({ relPath: f.relPath, content: f.content }));
  return { writes, skipped: [], conflicts, blocked: false };
}

// ── Task 8: IO 적용 + CLI main() (init·upgrade) ──────────────────────────────

export function parseArgs(argv) {
  const a = { mode: null, profile: null, projectName: null, appDir: null, target: null, profilesDir: null, initMode: "strict", codex: true, dryRun: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    if (t === "--mode") a.mode = next();
    else if (t === "--profile") a.profile = next();
    else if (t === "--project-name") a.projectName = next();
    else if (t === "--app-dir") a.appDir = next();
    else if (t === "--target") a.target = next();
    else if (t === "--profiles-dir") a.profilesDir = next();
    else if (t === "--force") a.initMode = "force";
    else if (t === "--gap-fill") a.initMode = "gap-fill";
    else if (t === "--no-codex") a.codex = false;
    else if (t === "--dry-run") a.dryRun = true;
    else a.unknown.push(t);
  }
  if (!a.target) a.target = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!a.profilesDir) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    a.profilesDir = path.resolve(here, "..", "profiles");
  }
  return a;
}

export function applyWrites(targetDir, writes, fs = NODE_FS) {
  for (const w of writes) {
    const abs = path.join(targetDir, w.relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, w.content, "utf8");
  }
}

/**
 * 주어진 상대경로들의 조상 디렉터리 중 비어버린 것을 깊은 것부터 제거한다.
 * 정리는 부수 효과이므로 실패해도 이행을 막지 않는다(개별 try/catch).
 */
export function pruneEmptyDirs(targetDir, relPaths, fs = NODE_FS) {
  const dirs = new Set();
  for (const rel of relPaths) {
    let d = path.posix.dirname(String(rel).split(path.sep).join("/"));
    while (d && d !== "." && d !== "/") {
      // 방어: 목록이 프로젝트 밖을 가리키면 조상 추적을 멈춘다(부모 디렉터리 삭제 방지).
      if (d === ".." || d.startsWith("../") || path.posix.isAbsolute(d)) break;
      dirs.add(d);
      d = path.posix.dirname(d);
    }
  }
  const removed = [];
  const deepestFirst = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);
  for (const d of deepestFirst) {
    const abs = path.join(targetDir, d);
    try {
      if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) { fs.rmdirSync(abs); removed.push(d); }
    } catch { /* 정리 실패는 무시 */ }
  }
  return removed;
}

/**
 * planRetire 결과를 디스크에 적용한다.
 * 충돌 규칙: 목적지가 이미 있으면 **덮어쓰지 않고 원본도 건드리지 않는다**(skipped* 로 보고).
 * 마커 삭제는 호출자(main)가 미해소 충돌이 없을 때만 마지막에 수행한다.
 * `done` 은 호출자가 소유한다(기본값은 새 객체) — copyFileSync/rmSync/renameSync 가 중간에
 * 던져도(EPERM/EBUSY 등) 호출자가 잡은 뒤 이 객체를 그대로 읽어 "어디까지 처리됐는지" 보고할 수 있다.
 */
export function applyRetire(targetDir, plan, fs = NODE_FS, done = {
  deleted: [], backedUp: [], archived: [], skippedBackup: [], skippedArchive: [], prunedDirs: [],
}) {
  for (const { relPath, backupPath } of plan.backups) {
    const backupAbs = path.join(targetDir, backupPath);
    if (fs.existsSync(backupAbs)) {
      // 백업 목적지가 이미 존재 — 사용자 파일이다. 덮어쓰지도, 원본을 지우지도 않는다.
      done.skippedBackup.push({ relPath, backupPath });
      continue;
    }
    const abs = path.join(targetDir, relPath);
    fs.copyFileSync(abs, backupAbs);
    fs.rmSync(abs);
    done.backedUp.push(backupPath);
    done.deleted.push(relPath);
  }
  for (const rel of plan.deletes) {
    fs.rmSync(path.join(targetDir, rel));
    done.deleted.push(rel);
  }
  const movedSources = [];
  for (const { relPath, destPath } of plan.archives) {
    const destAbs = path.join(targetDir, destPath);
    if (fs.existsSync(destAbs)) {
      // relPath 를 함께 기록한다 — 리포트가 "프로젝트에 남은 파일"을 이름으로 지목해야 한다.
      done.skippedArchive.push({ relPath, destPath });
      continue;
    }
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.renameSync(path.join(targetDir, relPath), destAbs);
    done.archived.push(destPath);
    movedSources.push(relPath);
  }
  done.prunedDirs = pruneEmptyDirs(targetDir, [...done.deleted, ...movedSources], fs);
  return done;
}

export function listExisting(targetDir, relPaths, fs = NODE_FS) {
  const set = new Set();
  for (const r of relPaths) if (fs.existsSync(path.join(targetDir, r))) set.add(r);
  return set;
}

export function hashExisting(targetDir, relPaths, fs = NODE_FS) {
  const out = {};
  for (const r of relPaths) {
    const abs = path.join(targetDir, r);
    if (fs.existsSync(abs)) out[r] = sha256(fs.readFileSync(abs, "utf8"));
  }
  return out;
}

function nowIso(deps) { return deps.now ? deps.now() : new Date().toISOString(); }

// marker harnessVersion 의 단일 출처는 플러그인 자신의 plugin.json 이다 — 리터럴은 미가독 시 최후 방어.
export function readOwnPluginVersion(fs = NODE_FS) {
  try {
    const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json");
    const v = JSON.parse(fs.readFileSync(p, "utf8")).version;
    return typeof v === "string" && v ? v : null;
  } catch { return null; }
}

export function main(argv, deps = {}) {
  const fs = deps.fs || NODE_FS;
  const log = deps.log || ((s) => process.stdout.write(s + "\n"));
  const args = parseArgs(argv);

  if (args.unknown.length) {
    log(JSON.stringify({ ok: false, error: `알 수 없는 인자: ${args.unknown.join(", ")}` }));
    return 1;
  }
  if (args.dryRun && args.mode !== "retire") {
    log(JSON.stringify({ ok: false, error: "--dry-run 은 --mode retire 에서만 지원합니다." }));
    return 1;
  }

  let profile;
  try { profile = loadProfile(args.profilesDir, args.profile, fs); }
  catch (e) { log(JSON.stringify({ ok: false, error: e.message })); return 1; }

  const templatesDir = path.join(args.profilesDir, profile.id, "templates");

  if (args.mode === "init") {
    if (readMarker(args.target, fs) && args.initMode !== "force") {
      log(JSON.stringify({ ok: false, alreadyBootstrapped: true, mode: "init",
        hint: "이미 부트스트랩된 프로젝트입니다(.claude/.hcg-harness.json 존재). 템플릿 갱신은 /hcg-harness:upgrade 를, 재생성을 강제하려면 --force 를 사용하세요." }));
      return 1;
    }
    const choices = { projectName: args.projectName || profile.id, appDir: args.appDir || profile.appDir, codex: args.codex };
    let rendered;
    try { rendered = renderProfile({ templatesDir, profile, choices, fs }); }
    catch (e) { log(JSON.stringify({ ok: false, error: `render failed: ${e.message}` })); return 1; }

    const relPaths = rendered.map((f) => f.relPath);
    const existing = listExisting(args.target, relPaths, fs);
    const plan = planInit({ rendered, existing, mode: args.initMode });
    if (plan.blocked) {
      log(JSON.stringify({ ok: false, blocked: true, mode: "init", conflicts: plan.conflicts,
        hint: "비어있지 않은 폴더입니다. 기존 파일과 충돌합니다. --gap-fill(없는 것만) 또는 --force(덮어쓰기)로 다시 실행하세요." }));
      return 2;
    }
    // 쓰기 **전** 디스크 상태 — gap-fill 이 건너뛴 파일까지 매니페스트가 사실대로 기록하도록.
    const preHashes = hashExisting(args.target, relPaths, fs);
    applyWrites(args.target, plan.writes, fs);
    const marker = {
      profile: profile.id, profileVersion: profile.version || "0.0.0", harnessVersion: deps.harnessVersion || readOwnPluginVersion(fs) || "0.3.0",
      bootstrappedAt: nowIso(deps), upgradedAt: null, choices,
      manifest: finalizeManifest({
        rendered, prevManifest: {}, currentHashes: preHashes,
        writtenPaths: new Set(plan.writes.map((w) => w.relPath)),
      }),
    };
    writeMarker(args.target, marker, fs);
    log(JSON.stringify({ ok: true, mode: "init",
      report: { written: plan.writes.map((w) => w.relPath), skipped: plan.skipped, conflicts: plan.conflicts },
      setupCommands: profile.setupCommands }));
    return 0;
  }

  if (args.mode === "upgrade") {
    const prev = readMarker(args.target, fs);
    if (!prev) { log(JSON.stringify({ ok: false, error: "마커가 없습니다. 먼저 /hcg-harness:init 를 실행하세요." })); return 1; }
    const choices = { projectName: prev.choices?.projectName || profile.id, appDir: prev.choices?.appDir || profile.appDir, codex: prev.choices?.codex !== false };
    let rendered;
    try { rendered = renderProfile({ templatesDir, profile, choices, fs }); }
    catch (e) { log(JSON.stringify({ ok: false, error: `render failed: ${e.message}` })); return 1; }

    const currentHashes = hashExisting(args.target, rendered.map((f) => f.relPath), fs);
    const plan = planUpgrade({ rendered, prevManifest: prev.manifest || {}, currentHashes });
    applyWrites(args.target, plan.writes, fs);
    const marker = { ...prev, profileVersion: profile.version || prev.profileVersion,
      harnessVersion: deps.harnessVersion || readOwnPluginVersion(fs) || prev.harnessVersion, upgradedAt: nowIso(deps),
      manifest: finalizeManifest({
        rendered, prevManifest: prev.manifest || {}, currentHashes,
        writtenPaths: new Set(plan.writes.map((w) => w.relPath)),
      }) };
    writeMarker(args.target, marker, fs);
    log(JSON.stringify({ ok: true, mode: "upgrade",
      report: { overwritten: plan.overwritten, created: plan.created, conflicts: plan.conflicts, skipped: plan.skipped } }));
    return 0;
  }

  if (args.mode === "retire") {
    const prev = readMarker(args.target, fs);
    if (!prev) {
      log(JSON.stringify({ ok: false, error: "레거시 마커가 없습니다(.claude/.hcg-harness.json). 이미 이행되었거나 레거시 하네스 프로젝트가 아닙니다." }));
      return 1;
    }
    // fail-closed: hcg-core 마커가 이미 있으면 철거하지 않는다. 철거 판정은 레거시 마커의
    // 매니페스트와 디스크를 비교하는데, hcg-core 가 쓴 파일은 그 매니페스트에 없어
    // "사용자 수정본"으로 오인된다 — 실측에서 hcg-core 가 방금 만든 `.github/workflows/ci.yml`
    // 을 `.legacy` 로 백업한 뒤 삭제하는 계획이 나왔다. 문서 지침만으로 막지 않는다.
    if (fs.existsSync(path.join(args.target, CORE_MARKER_REL))) {
      log(JSON.stringify({ ok: false, mode: "retire", coreMarkerPresent: true,
        error: "hcg-core 마커(.claude/.hcg-core.json)가 이미 있는 프로젝트입니다 — 이 상태에서 철거하면 " +
          "hcg-core 가 쓴 파일을 레거시 사용자 수정본으로 오인해 백업·삭제합니다. 철거하지 말고 " +
          "/hcg-harness:upgrade 0단계의 '둘 다 있음' 분기(레거시 마커 삭제 · enabledPlugins 기록 · " +
          "CLAUDE-core 교체)를 따르세요." }));
      return 1;
    }
    const retire = profile.retiredFiles || {};
    const all = [...(retire.delete || []), ...(retire.archive || []), ...(retire.replaceIfPristine || [])];
    if (!all.length) {
      log(JSON.stringify({ ok: false, error: "프로파일에 retiredFiles 선언이 없습니다 — 철거 대상이 없어 중단합니다(마커 유지)." }));
      return 1;
    }
    const currentHashes = hashExisting(args.target, all, fs);
    // 구버전 upgrade 가 남긴 `<파일>.new` 충돌 잔재도 함께 회수한다.
    const newFiles = listExisting(args.target, all.map((r) => `${r}.new`), fs);
    const probe = planRetire({ retire, prevManifest: prev.manifest || {}, currentHashes, newFiles });
    const candidateDests = [
      ...probe.backups.map((b) => b.backupPath),
      ...probe.archives.map((a) => a.destPath),
    ];
    const existingDests = listExisting(args.target, candidateDests, fs);
    const plan = planRetire({ retire, prevManifest: prev.manifest || {}, currentHashes, existingDests, newFiles });

    if (plan.blocked.length) {
      // 변경 전에 멈춘다 — 디스크는 그대로, 마커도 그대로. dry-run 과 실제 실행이 같은 판정을 낸다.
      const report = {
        deleted: [], backedUp: [], archived: [], prunedDirs: [],
        skippedBackup: plan.blocked.filter((b) => b.kind === "backup")
          .map(({ relPath, destPath }) => ({ relPath, backupPath: destPath })),
        skippedArchive: plan.blocked.filter((b) => b.kind === "archive")
          .map(({ relPath, destPath }) => ({ relPath, destPath })),
        keeps: plan.keeps, missing: plan.missing,
      };
      log(JSON.stringify({ ok: false, mode: "retire", dryRun: !!args.dryRun, incomplete: true,
        report, unresolved: plan.blocked,
        error: "목적지 충돌 — 아무것도 변경하지 않고 중단했습니다. 충돌 파일을 옮기거나 이름을 바꾼 뒤 다시 실행하세요." }));
      return 1;
    }

    if (args.dryRun) {
      log(JSON.stringify({ ok: true, mode: "retire", dryRun: true, plan,
        hint: "실제 적용은 --dry-run 없이 재실행하세요." }));
      return 0;
    }

    // done 은 여기서 소유한다 — applyRetire 도중 fs 오류(EPERM/EBUSY 등)가 던져져도
    // catch 안에서 "그때까지 처리된 항목"을 그대로 보고할 수 있다(부분 기록이 아니라 부분 *보고*).
    const done = { deleted: [], backedUp: [], archived: [], skippedBackup: [], skippedArchive: [], prunedDirs: [] };
    try {
      applyRetire(args.target, plan, fs, done);
      const unresolved = [...done.skippedBackup, ...done.skippedArchive];
      if (unresolved.length) {
        log(JSON.stringify({ ok: false, mode: "retire", incomplete: true,
          report: { ...done, keeps: plan.keeps, missing: plan.missing },
          error: "목적지 충돌로 옮기지 못한 파일이 있습니다. 마커를 유지했으니 충돌을 해소한 뒤 다시 실행하세요.",
          unresolved }));
        return 1;
      }
      fs.rmSync(path.join(args.target, MARKER_REL)); // 미해소 충돌이 없을 때만, 마지막에 — 재실행 가능성 보존
    } catch (e) {
      // 마커는 남는다 → 재실행하면 이미 처리된 것은 missing 으로 빠지고 나머지를 이어서 처리한다.
      log(JSON.stringify({ ok: false, mode: "retire", partial: true,
        report: { ...done, keeps: plan.keeps, missing: plan.missing },
        error: `철거 중 파일 시스템 오류: ${e.message}. 마커를 유지했으니 원인(파일 잠금 등)을 해소한 뒤 다시 실행하세요.` }));
      return 1;
    }
    log(JSON.stringify({ ok: true, mode: "retire", dryRun: false,
      report: { ...done, keeps: plan.keeps, missing: plan.missing },
      next: "재건: /hcg-core:init (비어있지 않은 폴더이므로 --gap-fill 로 재실행)" }));
    return 0;
  }

  log(JSON.stringify({ ok: false, error: `unknown --mode '${args.mode}' (init|upgrade|retire)` }));
  return 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
