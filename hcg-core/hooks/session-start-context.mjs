#!/usr/bin/env node
// hooks/session-start-context.mjs (hcg-core)
//
// SessionStart 컨텍스트 주입 — 3분기:
//   ① 레거시(hcg-harness) 마커 감지 → 혼용 경고 (최우선)
//   ② hcg-core 마커 없음/불량      → /hcg-core:init 안내
//   ③ hcg-core 마커 있음           → 버전·프로파일 상태 한 줄
// 읽기 전용 · fail-open: 모든 실패 = exit 0.
//
// Environment overrides:
//   SESSION_START_PROJECT_ROOT: 프로젝트 루트 오버라이드
//   SESSION_CONTEXT_LABEL:      주입 블록 헤더 라벨

import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .claude/hooks/ (또는 <plugin>/hooks/) -> 프로젝트 루트는 두 단계 위.
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_LABEL = "[hcg-core session context]";

export const MARKER_REL = path.join(".claude", ".hcg-core.json");
export const LEGACY_MARKER_REL = path.join(".claude", ".hcg-harness.json");

export function readMarker(projectRoot, fs = { readFileSync, existsSync }) {
  const file = path.join(projectRoot, MARKER_REL);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

export function legacyMarkerExists(projectRoot, fs = { existsSync }) {
  return fs.existsSync(path.join(projectRoot, LEGACY_MARKER_REL));
}

export function formatBootstrapHint(label = DEFAULT_LABEL) {
  return [
    label,
    "- 상태: 이 프로젝트는 아직 hcg-core 로 부트스트랩되지 않았습니다.",
    "- 다음 단계: `/hcg-core:init` 를 실행해 하네스 + (선택) 앱 골격을 생성하세요.",
  ].join("\n");
}

export function formatLegacyWarning(label = DEFAULT_LABEL) {
  return [
    label,
    "- ⚠ 레거시 hcg-harness 마커(.claude/.hcg-harness.json)가 감지되었습니다.",
    "- hcg-harness 와 hcg-core 를 같은 프로젝트에 함께 쓰지 마세요 — 훅 이중 발화·방법론 충돌.",
    "- 이행: `/hcg-harness:upgrade` 1회 → hcg-core 로 전환(철거 → 정합화 → 재건 → 단언).",
    "  커맨드가 안 보이면 레거시 플러그인이 비활성입니다 — 이행 동안만 다시 활성화하세요.",
  ].join("\n");
}

export function formatStatus(marker, label = DEFAULT_LABEL) {
  const v = marker && marker.harnessVersion ? marker.harnessVersion : "?";
  const p = marker && marker.profile ? marker.profile : "?";
  return [
    label,
    `- 부트스트랩됨: hcg-core ${v} (profile: ${p}) — 작업 라우팅은 CLAUDE-core, 스택·경로는 .claude/project.md.`,
  ].join("\n");
}

function main() {
  const projectRoot = process.env.SESSION_START_PROJECT_ROOT || DEFAULT_PROJECT_ROOT;
  const label = process.env.SESSION_CONTEXT_LABEL || DEFAULT_LABEL;
  try {
    if (legacyMarkerExists(projectRoot)) {
      process.stdout.write(`${formatLegacyWarning(label)}\n`);
      process.exit(0);
    }
    const marker = readMarker(projectRoot);
    if (!marker) {
      process.stdout.write(`${formatBootstrapHint(label)}\n`);
      process.exit(0);
    }
    process.stdout.write(`${formatStatus(marker, label)}\n`);
  } catch {
    // fail-open
  }
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
