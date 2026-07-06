#!/usr/bin/env node
// scripts/install-ax.mjs — AX 산출물 표준(Inpsyt/ax-output-standardization) 설치 엔진
// /hcg-harness:init 의 부가 단계. 순수 헬퍼 export + IO + main(). 신규 의존성 없음(node builtins만).
// fail-closed: git 실패 시 skills 복사 없이 비-0 종료(부분 상태 없음).
// 공식 install.sh 는 심링크를 쓰지만 Windows 제약으로 여기서는 복사(method:"copy")한다.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_FS = { cpSync, existsSync, mkdirSync };

export const AX_SKILLS = ["ax-docx", "ax-output", "ax-pptx", "ax-wireframe"];
export const DEFAULT_REPO = "https://github.com/Inpsyt/ax-output-standardization.git";

/** skills-dir 기준 설치/미설치 스킬 분리. */
export function checkInstalled(skillsDir, fs = NODE_FS) {
  const installed = [], missing = [];
  for (const s of AX_SKILLS) {
    (fs.existsSync(path.join(skillsDir, s)) ? installed : missing).push(s);
  }
  return { installed, missing };
}

/** 순수 플래너: 설치 상태 → 할 일 결정. */
export function planInstall({ missing, cloneDirExists }) {
  if (missing.length === 0) return { action: "skip", status: "already-installed" };
  return { action: cloneDirExists ? "pull-and-copy" : "clone-and-copy" };
}

export function parseArgs(argv, home = homedir()) {
  const a = {
    repo: DEFAULT_REPO,
    cloneDir: path.join(home, ".claude", "ax-output-standardization"),
    skillsDir: path.join(home, ".claude", "skills"),
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const next = () => argv[++i];
    if (t === "--repo") a.repo = next();
    else if (t === "--clone-dir") a.cloneDir = next();
    else if (t === "--skills-dir") a.skillsDir = next();
    else if (t === "--check") a.check = true;
  }
  return a;
}

/** git 실행 (인증 프롬프트 금지 — 실패는 throw). */
function defaultExec(cmd, args) {
  return execFileSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8",
  });
}

export function main(argv, deps = {}) {
  const fs = deps.fs || NODE_FS;
  const exec = deps.exec || defaultExec;
  const log = deps.log || ((s) => process.stdout.write(s + "\n"));
  const args = parseArgs(argv, deps.home);

  const { installed, missing } = checkInstalled(args.skillsDir, fs);
  if (args.check) {
    log(JSON.stringify({ ok: true, mode: "check", installed, missing }));
    return 0;
  }
  const plan = planInstall({ missing, cloneDirExists: fs.existsSync(args.cloneDir) });
  if (plan.action === "skip") {
    log(JSON.stringify({ ok: true, status: "already-installed", installed }));
    return 0;
  }
  try {
    if (plan.action === "clone-and-copy") exec("git", ["clone", "--depth", "1", args.repo, args.cloneDir]);
    else exec("git", ["-C", args.cloneDir, "pull", "--ff-only"]);
  } catch (e) {
    const verb = plan.action === "clone-and-copy" ? "clone" : "pull";
    log(JSON.stringify({
      ok: false,
      error: `git ${verb} failed: ${e.message}`,
      hint: verb === "pull"
        ? `클론 폴더가 손상됐다면 삭제 후 재시도: ${args.cloneDir}`
        : "git 인증/네트워크를 확인하세요 (비공개 레포 — Inpsyt 접근 권한 필요).",
      fallback: "front-agent 는 내장 hcg-harness:ui-standard 스킬로 동일하게 동작합니다.",
    }));
    return 1;
  }
  // gap-fill: 없는 스킬만 복사, 기존 설치본 불변. 복사 실패도 JSON 한 줄로 보고(fail-closed).
  const copied = [], notFoundUpstream = [];
  try {
    fs.mkdirSync(args.skillsDir, { recursive: true });
    for (const s of missing) {
      const src = path.join(args.cloneDir, s);
      if (!fs.existsSync(src)) { notFoundUpstream.push(s); continue; }
      fs.cpSync(src, path.join(args.skillsDir, s), { recursive: true });
      copied.push(s);
    }
  } catch (e) {
    log(JSON.stringify({
      ok: false,
      error: `copy failed: ${e.message}`,
      copied,
      hint: `일부만 복사됐을 수 있습니다 — ${args.skillsDir} 를 확인하세요.`,
      fallback: "front-agent 는 내장 hcg-harness:ui-standard 스킬로 동일하게 동작합니다.",
    }));
    return 1;
  }
  log(JSON.stringify({ ok: true, status: "installed", method: "copy",
    copied, skipped: installed, notFoundUpstream, cloneDir: args.cloneDir }));
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
