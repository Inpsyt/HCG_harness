#!/usr/bin/env node
// scripts/doctor.mjs — 하네스 설치 상태 진단 (슬림 v1)
//
// docs/install.md §3 수동 rung-4 체크리스트의 결정론적 부분을 기계화한다.
// 순수 검사 함수 + 주입식 IO(bootstrap.mjs 와 동형), node builtins 만 사용.
//
//   node <plugin>/scripts/doctor.mjs [--target <projectDir>]
//
// 판정: error 하나라도 있으면 exit 1, 아니면 0 (warn/info/ok 는 통과).
// 진단 도구 원칙: 판정 불가 = warn+사유 (fail-open). 단 marker 부재/파손은
// "미부트스트랩"이라는 명확한 단일 error 로 보고하고 나머지 검사를 생략한다.
//
// v1 범위 밖(의도적): 라이브 프로브(훅 발화 실측 — install.md §3 수동 항목 유지),
// manifest sha 대조(planUpgrade 가 upgrade 시점에 동일 판정 수행), codex CLI
// 인증 상태(비대화형 조회 수단 조사 후 v2), settings 3계층 병합 재현.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_FS = { existsSync, readFileSync, readdirSync };
const MARKER_REL = ".claude/.hcg-harness.json";
const SENTINEL_REL = ".claude/contracts-unlock";

/** 숫자 세그먼트 기준 버전 비교: a<b → 음수, 같음 → 0, a>b → 양수 */
export function compareVersions(a, b) {
  const seg = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [seg(a), seg(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

const f = (id, level, detail, fix) => ({ id, level, detail, ...(fix ? { fix } : {}) });
const join = (target, rel) => path.join(target, rel);

function readJson(fs, abs) {
  try { return JSON.parse(fs.readFileSync(abs, "utf8")); } catch { return null; }
}

/** marker 읽기. 부재/파손이면 error finding, 정상이면 { marker } */
function checkMarker(target, fs) {
  const abs = join(target, MARKER_REL);
  if (!fs.existsSync(abs))
    return { finding: f("marker", "error", `${MARKER_REL} 없음 — 하네스로 부트스트랩되지 않은 프로젝트`, "`/hcg-harness:init` 실행") };
  const marker = readJson(fs, abs);
  if (!marker)
    return { finding: f("marker", "error", `${MARKER_REL} 파싱 실패(손상)`, "`/hcg-harness:init --force` 또는 마커 복구") };
  return { marker, finding: f("marker", "ok", `profile=${marker.profile} harness=${marker.harnessVersion}`) };
}

function checkVersionSkew(marker, pluginVersion) {
  const mv = marker.harnessVersion;
  if (!mv || !pluginVersion || pluginVersion === "unknown")
    return f("version-skew", "info", `버전 비교 불가 (marker=${mv || "?"}, plugin=${pluginVersion || "?"})`);
  const d = compareVersions(mv, pluginVersion);
  if (d < 0) return f("version-skew", "warn", `마커 ${mv} < 플러그인 ${pluginVersion} — 관리 파일이 구버전`, "`/hcg-harness:upgrade` 실행");
  if (d > 0) return f("version-skew", "warn", `마커 ${mv} > 플러그인 ${pluginVersion} — 플러그인이 뒤처짐`, "플러그인 업데이트(README 절차)");
  return f("version-skew", "ok", `${mv} (동기화됨)`);
}

const LAYOUT_REQUIRED = [
  "contracts/api-spec.md", "contracts/db-schema.md",
  "contracts/design-guide.md", "contracts/shared-types.md",
  "tasks/TODO.md", "tasks/phase-meta.yml",
  "CLAUDE.md", ".claude/CLAUDE-core.md",
];

function checkLayout(target, fs) {
  const missing = LAYOUT_REQUIRED.filter((rel) => !fs.existsSync(join(target, rel)));
  let agents = 0;
  try { agents = fs.readdirSync(join(target, ".claude/agents")).filter((n) => n.endsWith(".md")).length; }
  catch { /* 디렉터리 없음 → 0 */ }
  let coreImported = false;
  try { coreImported = /@\.claude\/CLAUDE-core\.md/.test(fs.readFileSync(join(target, "CLAUDE.md"), "utf8")); }
  catch { /* CLAUDE.md 부재는 missing 에 이미 잡힘 */ }
  const problems = [];
  if (missing.length) problems.push(`누락: ${missing.join(", ")}`);
  if (agents < 5) problems.push(`agents ${agents}/5`);
  if (!coreImported) problems.push("CLAUDE.md 에 @.claude/CLAUDE-core.md import 없음");
  if (problems.length) return f("layout", "warn", problems.join(" · "), "`/hcg-harness:upgrade`(관리 파일 재생성) 또는 수동 복구");
  return f("layout", "ok", "contracts 4종 · tasks · agents 5종 · core import OK");
}

function checkStaleSentinel(target, fs) {
  if (fs.existsSync(join(target, SENTINEL_REL)))
    return f("stale-sentinel", "warn",
      `${SENTINEL_REL} 잔존 — contracts 잠금이 꺼진 상태(계약 작성 후 삭제를 잊은 것)`,
      "센티널 파일 삭제로 재잠금");
  return f("stale-sentinel", "ok", "contracts 잠금 활성");
}

function checkCodexWiring(target, marker, fs) {
  if (marker.choices?.codex === false)
    return f("codex-wiring", "info", "codex 게이트 opt-out 프로젝트 — 검사 생략");
  const missing = [];
  if (!fs.existsSync(join(target, "scripts/codex-review.mjs"))) missing.push("scripts/codex-review.mjs");
  const appDir = marker.choices?.appDir || "apps/web";
  const pkg = readJson(fs, join(target, `${appDir}/package.json`));
  if (!pkg?.scripts?.["codex:review"]) missing.push(`${appDir}/package.json 의 "codex:review" 스크립트`);
  if (missing.length)
    return f("codex-wiring", "warn", `누락: ${missing.join(", ")} — qa 의 Phase 게이트가 실행 불가(fail-closed 로 Phase 완료 차단됨)`, "docs/install.md §2e 배선");
  return f("codex-wiring", "ok", "래퍼 + codex:review 스크립트 배선됨 (CLI 인증은 v1 미검사 — 게이트 실행 시 fail-closed)");
}

function checkCiPresent(target, fs) {
  if (!fs.existsSync(join(target, ".github/workflows/ci.yml")))
    return f("ci", "warn", ".github/workflows/ci.yml 없음 — 결정론 검증이 에이전트 수기 기록에만 의존", "`/hcg-harness:upgrade`(0.1.2+ 템플릿이 생성)");
  return f("ci", "ok", "CI 워크플로 존재");
}

function checkToolchain(target, marker, fs) {
  const appDir = marker.choices?.appDir || "apps/web";
  if (!fs.existsSync(join(target, `${appDir}/package.json`)))
    return f("toolchain", "error", `${appDir}/package.json 없음 — 앱 골격 부재(부트스트랩 불완전 또는 appDir 불일치)`, "marker choices.appDir 확인 또는 `/hcg-harness:init --gap-fill`");
  const missing = [];
  if (!fs.existsSync(join(target, `${appDir}/node_modules`))) missing.push("node_modules(pnpm install 미실행)");
  if (!fs.existsSync(join(target, `${appDir}/pnpm-lock.yaml`))) missing.push("pnpm-lock.yaml(커밋 대상 — CI 가 요구)");
  if (!fs.existsSync(join(target, `${appDir}/prisma/schema.prisma`))) missing.push("prisma/schema.prisma");
  let hasDbUrl = false;
  for (const env of [".env", ".env.local"]) {
    try { if (/^DATABASE_URL=/m.test(fs.readFileSync(join(target, `${appDir}/${env}`), "utf8"))) { hasDbUrl = true; break; } }
    catch { /* 없으면 다음 후보 */ }
  }
  if (!hasDbUrl) missing.push("DATABASE_URL(.env — 값은 검사·출력하지 않음)");
  if (missing.length) return f("toolchain", "warn", `${appDir}: ${missing.join(" · ")}`);
  return f("toolchain", "ok", `${appDir} 툴체인 OK`);
}

function checkPlaceholders(target, fs) {
  let text;
  try { text = fs.readFileSync(join(target, ".claude/project.md"), "utf8"); }
  catch { return f("placeholders", "warn", ".claude/project.md 없음 — 인스턴스 슬롯 미작성", "docs/install.md §2a"); }
  // 템플릿 슬롯 형태(<한글 …> / <예: …>)만 겨냥 — 코드 제네릭 등 오탐 회피
  const slots = text.match(/<(?:[가-힣]|예:)[^>\n]*>/g) || [];
  if (slots.length) return f("placeholders", "warn", `인스턴스 슬롯 미기입 ${slots.length}곳 (.claude/project.md)`, "docs/install.md §2a 슬롯 채우기");
  return f("placeholders", "ok", "인스턴스 슬롯 기입됨");
}

/** 전체 진단. 순수: target/pluginVersion/fs 주입. → { findings, exitCode } */
export function runDoctor({ target, pluginVersion, fs = NODE_FS }) {
  const m = checkMarker(target, fs);
  if (!m.marker) return { findings: [m.finding], exitCode: 1 };
  const findings = [
    m.finding,
    checkVersionSkew(m.marker, pluginVersion),
    checkLayout(target, fs),
    checkStaleSentinel(target, fs),
    checkCodexWiring(target, m.marker, fs),
    checkCiPresent(target, fs),
    checkToolchain(target, m.marker, fs),
    checkPlaceholders(target, fs),
  ];
  return { findings, exitCode: findings.some((x) => x.level === "error") ? 1 : 0 };
}

const SYMBOL = { error: "✗", warn: "!", info: "i", ok: "✓" };

export function formatFindings(findings) {
  return findings
    .map((x) => `${SYMBOL[x.level] || "?"} ${x.id} — ${x.detail}${x.fix ? `  → ${x.fix}` : ""}`)
    .join("\n");
}

function main(argv, deps = {}) {
  const fs = deps.fs || NODE_FS;
  const log = deps.log || ((s) => process.stdout.write(s + "\n"));
  let target = null;
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--target") target = argv[++i];
  if (!target) target = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let pluginVersion = "unknown";
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    pluginVersion = JSON.parse(fs.readFileSync(path.join(here, "..", ".claude-plugin", "plugin.json"), "utf8")).version || "unknown";
  } catch { /* fail-open: skew 검사가 info 로 강등됨 */ }

  const { findings, exitCode } = runDoctor({ target, pluginVersion, fs });
  const n = (lv) => findings.filter((x) => x.level === lv).length;
  log(`harness doctor — ${target}`);
  log(formatFindings(findings));
  log(`요약: error ${n("error")} · warn ${n("warn")} · ok ${n("ok")}${exitCode ? "  → 빨간 항목부터 해결" : ""}`);
  return exitCode;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) { process.stderr.write(`[doctor] internal error: ${e?.message || e}\n`); process.exit(1); }
}
