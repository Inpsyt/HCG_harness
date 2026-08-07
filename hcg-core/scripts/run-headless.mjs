#!/usr/bin/env node
// run-headless.mjs — 무인(headless) claude 실행 러너.
// **사용량 한도로 세션이 죽으면 지정한 폴백 모델로 자동 재개**해 작업을 이어간다.
//
// 왜 세션 밖이어야 하는가 (2026-08-07 실측):
//   한도에 걸리는 순간 세션 프로세스가 즉시 종료된다 — CLAUDE.md 에 "한도면 모델을 바꿔
//   계속하라"고 적어도 그 지시를 실행할 주체가 이미 없다. CLI 의 `--fallback-model` 도
//   해결하지 못한다(모델이 overloaded/unavailable 일 때 전용 — 계정 사용량 한도는 미발동,
//   한도 상태에서 재현 확인). 따라서 전환은 **세션을 띄우는 바깥 층**에서만 가능하다.
//
// 판정 규칙 (실행 4회 전수 대조로 확정):
//   - `subtype` 은 오류 시에도 "success" 를 반환한다 → **판정에 쓰지 않는다**.
//   - exit code 와 `is_error` 는 신뢰할 수 있다.
//   - 단, 종료 신호는 "세션이 턴을 끝냈다"일 뿐 "과업이 끝났다"가 아니다
//     → `--verify` 로 저장소 상태를 기계 검증한다(선택).
//
// 사용:
//   node run-headless.mjs --dir <프로젝트> --prompt-file <파일> \
//        [--model claude-fable-5] [--fallback claude-opus-5[,claude-sonnet-5]] \
//        [--verify "<셸 명령>"] [--max-resumes 3] [--budget 50] [--out-dir <디렉터리>]
//
// 종료 코드: 0 완주 · 10 조용한 미완주(검증 실패) · 20 한도 소진(폴백 고갈) · 1 실행 오류

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";

// ── 순수 로직 (테스트 대상) ────────────────────────────────────────────────────

// 한도는 두 종류이고, **모델 전환이 듣는 것은 하나뿐이다**(2026-08-07 실측 관측):
//   ① 모델별 한도 — "You've reached your Fable 5 limit. … switch models with /model."
//      → 다른 모델은 살아 있다. 폴백 전환으로 즉시 이어갈 수 있다.
//   ② 계정/세션 한도 — "You've hit your session limit · resets 1:20am (Asia/Seoul)"
//      → 모델을 바꿔도 동일하게 막힌다. 리셋을 기다리는 것 외에 방법이 없다.
// 둘을 뭉뚱그리면 ②에서 폴백 모델만 헛되이 소진하므로 분리한다.

/** ① 모델별 한도 — 폴백 전환이 유효하다. */
export function isModelLimit(resultText) {
  const s = String(resultText ?? "");
  return /reached your .*\blimit\b|switch models with \/model|\/usage-credits/i.test(s)
    && !isAccountLimit(s);
}

/** ② 계정·세션 전체 한도 — 모델을 바꿔도 소용없다(대기 필요). */
export function isAccountLimit(resultText) {
  return /\bsession limit\b|hit your (usage|plan) limit|out of (credits|usage)/i
    .test(String(resultText ?? ""));
}

/**
 * 한 번의 실행 결과를 OK · MODEL_LIMIT · ACCOUNT_LIMIT · ERROR 로 분류한다.
 * `subtype` 은 의도적으로 보지 않는다 — 오류 시에도 "success" 다.
 */
export function classify(exitCode, json) {
  const isError = json?.is_error === true;
  if (exitCode === 0 && !isError) return "OK";
  const result = json?.result;
  if (isAccountLimit(result)) return "ACCOUNT_LIMIT";
  if (isModelLimit(result)) return "MODEL_LIMIT";
  return "ERROR";
}

/** state × verify 결과 → 최종 종료 코드. */
export function exitCodeFor(state, verdict) {
  if (state === "OK") return verdict === "FAIL" ? 10 : 0;
  if (state === "MODEL_LIMIT") return 20;
  if (state === "ACCOUNT_LIMIT") return 21;
  return 1;
}

export function parseArgs(argv) {
  const a = { dir: "", promptFile: "", model: "", fallback: [], verify: "", maxResumes: 3, budget: "", outDir: "" };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--dir": a.dir = next(); break;
      case "--prompt-file": a.promptFile = next(); break;
      case "--model": a.model = next(); break;
      case "--fallback": a.fallback = String(next()).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--verify": a.verify = next(); break;
      case "--max-resumes": a.maxResumes = Number(next()); break;
      case "--budget": a.budget = next(); break;
      case "--out-dir": a.outDir = next(); break;
    }
  }
  return a;
}

/**
 * 재개 시 넘길 지시문 — **원 프롬프트를 반드시 다시 싣는다.**
 *
 * 세션 이력에 원 지시가 남아 있다고 가정하면 안 된다: 한도가 첫 턴에서 걸리면 모델이
 * 프롬프트를 보기도 전에 죽어 이력이 비어 있고, 그 상태로 "이어서 하라"고만 하면
 * 재개 세션이 "진행 중이던 것이 없다"며 아무 일도 하지 않고 정상 종료한다(실측 재현).
 * 진행분이 있든 없든 동작하도록 이어가기 지시 + 원 지시를 함께 준다.
 */
export function buildResumePrompt(originalPrompt) {
  return [
    "[자동 재개] 이전 모델의 사용량 한도로 세션이 중단되어 다른 모델로 이어받았다.",
    "먼저 `git status`·`git log`·미커밋 변경으로 **어디까지 진행됐는지 확인**하라.",
    "진행분이 있으면 그 지점부터 이어가고, 아무것도 진행되지 않았다면 아래 지시를 처음부터 수행하라.",
    "이미 끝난 작업을 중복 수행하지 말고, 사용자 개입 없이 완료 기준까지 끝까지 진행하라.",
    "",
    "--- 원래 지시 ---",
    originalPrompt,
  ].join("\n");
}

// ── IO ────────────────────────────────────────────────────────────────────────

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function runClaude({ dir, promptText, model, resumeId, budget, outFile, errFile }) {
  const args = ["-p", "--output-format", "json", "--dangerously-skip-permissions"];
  if (model) args.push("--model", model);
  if (budget) args.push("--max-budget-usd", String(budget));
  if (resumeId) args.push("--resume", resumeId);
  args.push(promptText);

  const r = spawnSync("claude", args, {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32", // Windows 에서 claude 는 .cmd 셔임
    env: {
      ...process.env,
      // 서브에이전트에 위임하고 턴을 끝내는 하네스가 600s 한도로 잘리지 않게 한다.
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS ?? "0",
    },
  });
  writeFileSync(outFile, r.stdout ?? "", "utf8");
  writeFileSync(errFile, r.stderr ?? "", "utf8");
  return r.status ?? 1;
}

function runVerify(dir, cmd, logFile) {
  if (!cmd) return "SKIP";
  const r = spawnSync(cmd, { cwd: dir, encoding: "utf8", shell: true, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(logFile, `${r.stdout ?? ""}\n${r.stderr ?? ""}`, "utf8");
  return r.status === 0 ? "PASS" : "FAIL";
}

function totalCost(outDir) {
  let sum = 0;
  for (const f of readdirSync(outDir)) {
    if (!/^attempt-\d+\.json$/.test(f)) continue;
    sum += readJson(path.join(outDir, f))?.total_cost_usd ?? 0;
  }
  return sum;
}

export function main(argv, log = (s) => process.stdout.write(`${s}\n`)) {
  const a = parseArgs(argv);
  if (!a.dir || !a.promptFile) {
    log("usage: run-headless.mjs --dir <d> --prompt-file <f> [--model M] [--fallback M1,M2] [--verify CMD]");
    return 1;
  }
  const outDir = a.outDir || path.join(tmpdir(), `hcg-headless-${process.pid}`);
  mkdirSync(outDir, { recursive: true });
  const promptText = readFileSync(a.promptFile, "utf8");

  log(`[run] dir=${a.dir} model=${a.model || "<default>"} fallback=[${a.fallback.join(", ")}] out=${outDir}`);

  let attempt = 0;
  const tag = () => `attempt-${attempt}`;
  let status = runClaude({
    dir: a.dir, promptText, model: a.model, resumeId: null, budget: a.budget,
    outFile: path.join(outDir, `${tag()}.json`), errFile: path.join(outDir, `${tag()}.err`),
  });
  let json = readJson(path.join(outDir, `${tag()}.json`));
  let state = classify(status, json);
  const sessionId = json?.session_id ?? null;
  log(`[attempt ${attempt}] exit=${status} state=${state} session=${sessionId ?? "<none>"}`);

  // 모델별 한도 → 폴백 모델을 순서대로 갈아끼우며 같은 세션을 재개한다.
  // (한도로 죽은 실행의 JSON 에도 session_id 가 있고, 0턴 세션도 재개 가능함을 실측 확인)
  let fbIndex = 0;
  while (state === "MODEL_LIMIT" && attempt < a.maxResumes && fbIndex < a.fallback.length) {
    if (!sessionId) { log("[limit] session_id 없음 — 자동 재개 불가"); break; }
    const nextModel = a.fallback[fbIndex++];
    attempt += 1;
    log(`[limit] 모델 한도 감지 → --resume ${sessionId} --model ${nextModel} (재개 ${attempt}/${a.maxResumes})`);
    status = runClaude({
      dir: a.dir, promptText: buildResumePrompt(promptText), model: nextModel, resumeId: sessionId, budget: a.budget,
      outFile: path.join(outDir, `${tag()}.json`), errFile: path.join(outDir, `${tag()}.err`),
    });
    json = readJson(path.join(outDir, `${tag()}.json`));
    state = classify(status, json);
    log(`[attempt ${attempt}] exit=${status} state=${state}`);
  }
  if (state === "MODEL_LIMIT") {
    log(a.fallback.length === 0 ? "[limit] --fallback 미지정 — 자동 전환하지 않음" : "[limit] 폴백 모델 목록 고갈");
  }
  if (state === "ACCOUNT_LIMIT") {
    log("[limit] 계정·세션 전체 한도 — 모델을 바꿔도 막힌다. 리셋 후 재개해야 한다.");
  }

  const verdict = runVerify(a.dir, a.verify, path.join(outDir, "verify.log"));
  const code = exitCodeFor(state, verdict);

  log("");
  log("=== 결과 ===");
  log(`세션 상태 : ${state}   (subtype 은 판정에 쓰지 않음)`);
  log(`완주 검증 : ${verdict}${a.verify ? `  (${a.verify})` : ""}`);
  log(`누적 비용 : $${totalCost(outDir).toFixed(2)}`);
  log(`산출물    : ${outDir}`);
  const resumeHint = sessionId ? `claude --resume ${sessionId}` : "새 세션에서 git status 로 진행분 확인";
  log(
    code === 0 ? "→ 완주"
      : code === 10 ? "→ ⚠ 세션은 정상 종료했으나 완주 검증 실패 — '조용한 미완주'"
      : code === 20 ? `→ 모델 한도 (폴백 미지정/고갈) — \`${resumeHint} --model <다른모델>\``
      : code === 21 ? `→ 계정 한도 — 리셋 대기 후 \`${resumeHint}\``
      : "→ 실행 오류 — attempt-*.err 확인",
  );
  return code;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
