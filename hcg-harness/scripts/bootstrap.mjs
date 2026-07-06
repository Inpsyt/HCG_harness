#!/usr/bin/env node
// scripts/bootstrap.mjs — HCG harness 생성/재적용 엔진 (--mode init|upgrade)
// 순수 헬퍼 export + IO + main(). 신규 의존성 없음(node builtins만).
// fail-closed: 오류 시 부분 기록 없이 비-0 종료.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_FS = { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync };

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
  const files = walkRel(templatesDir, "", fs);
  return files
    .map(({ relPath, content }) => {
      const outPath = toPosix(substituteTokens(relPath, tokens));
      return {
        relPath: outPath,
        content: substituteTokens(content, tokens),
        managed: !isUserOwned(outPath, profile.userOwnedGlobs),
      };
    })
    .filter((f) => !excluded.has(f.relPath));
}

// ── Task 5: 마커 + 매니페스트 read/write ─────────────────────────────────────

/** 마커 파일의 POSIX 상대경로. */
export const MARKER_REL = ".claude/.hcg-harness.json";

/** 렌더 목록 → relPath: {managed, sha256(content)} 매니페스트. */
export function buildManifest(rendered) {
  const m = {};
  for (const f of rendered) m[f.relPath] = { managed: f.managed, sha256: sha256(f.content) };
  return m;
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
  const a = { mode: null, profile: null, projectName: null, appDir: null, target: null, profilesDir: null, initMode: "strict", codex: true };
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

export function main(argv, deps = {}) {
  const fs = deps.fs || NODE_FS;
  const log = deps.log || ((s) => process.stdout.write(s + "\n"));
  const args = parseArgs(argv);

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

    const existing = listExisting(args.target, rendered.map((f) => f.relPath), fs);
    const plan = planInit({ rendered, existing, mode: args.initMode });
    if (plan.blocked) {
      log(JSON.stringify({ ok: false, blocked: true, mode: "init", conflicts: plan.conflicts,
        hint: "비어있지 않은 폴더입니다. 기존 파일과 충돌합니다. --gap-fill(없는 것만) 또는 --force(덮어쓰기)로 다시 실행하세요." }));
      return 2;
    }
    applyWrites(args.target, plan.writes, fs);
    const marker = {
      profile: profile.id, profileVersion: profile.version || "0.0.0", harnessVersion: deps.harnessVersion || "0.1.0",
      bootstrappedAt: nowIso(deps), upgradedAt: null, choices, manifest: buildManifest(rendered),
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
      harnessVersion: deps.harnessVersion || prev.harnessVersion, upgradedAt: nowIso(deps),
      manifest: buildManifest(rendered) };
    writeMarker(args.target, marker, fs);
    log(JSON.stringify({ ok: true, mode: "upgrade",
      report: { overwritten: plan.overwritten, created: plan.created, conflicts: plan.conflicts, skipped: plan.skipped } }));
    return 0;
  }

  log(JSON.stringify({ ok: false, error: `unknown --mode '${args.mode}' (init|upgrade)` }));
  return 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
