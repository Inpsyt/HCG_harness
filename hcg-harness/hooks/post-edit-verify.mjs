#!/usr/bin/env node
// hooks/post-edit-verify.mjs
//
// PostToolUse verification hook (portable harness).
// After an Edit/Write/MultiEdit tool runs, if the changed file is a TypeScript
// source file under the project's app dir (default "apps/web"), run ESLint on
// JUST that file and surface real findings back to the agent.
//
// Design decisions:
//   D1: changed-file ESLint only (no full tsc — out of scope).
//   D3: Node .mjs, shell-agnostic. We spawn `node <eslint.js>` directly
//       (NOT `pnpm`/`npx`, which are .cmd shims on Windows that Node cannot
//       spawn with shell:false).
//   D4: fail-open. Infra failures (eslint missing, spawn error, timeout,
//       config/internal error, unparseable stdin) => exit 0/1 (NON-blocking).
//       Only real lint findings => exit 2 (stderr fed back to Claude).
//
// Exit codes (Claude Code convention):
//   0  = success / no-op / fail-open. (silent or non-fatal warning)
//   2  = blocking: real ESLint errors found; stderr is returned to the agent.
//   (we never use other non-zero codes — fail-open prefers 0)
//
// stdin: PostToolUse hook JSON. Relevant shape (Edit/Write/MultiEdit all carry
// the changed path at tool_input.file_path; MultiEdit additionally has an
// edits[] array which we ignore — one file_path is all we lint):
//   { "tool_name": "Edit"|"Write"|"MultiEdit",
//     "tool_input": { "file_path": "...", ... }, ... }
//
// Environment overrides:
//   POST_EDIT_VERIFY_PROJECT_ROOT: override the resolved project root.
//   POST_EDIT_VERIFY_APP_DIR:      app subdir that holds the lintable source +
//                                  the eslint binary (default "apps/web"). Set
//                                  this when your source root is elsewhere
//                                  (e.g. ".", "web", "packages/app").

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .claude/hooks/ (or <plugin>/hooks/) -> project root is two levels up.
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..", "..");

// App subdir (relative to project root) holding the lintable source tree and
// the local eslint binary. Externalized so the hook is not bound to a monorepo
// layout — on a non-monorepo project set POST_EDIT_VERIFY_APP_DIR=".".
const DEFAULT_APP_DIR = "apps/web";

// Soft timeout for the eslint child. Settings hook timeout is set higher so we
// time out ourselves first and fail-open instead of being killed.
const ESLINT_TIMEOUT_MS = 60_000;

/**
 * Parse the hook stdin payload. Returns the parsed object or null on failure
 * (fail-open: a malformed payload must never block).
 */
export function parseHookInput(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Extract the edited file path from a parsed hook payload (or null).
 * Tool-name-agnostic: Edit, Write, and MultiEdit all expose the changed file
 * at tool_input.file_path (MultiEdit's extra edits[] array is irrelevant here),
 * so a single accessor covers every matched tool.
 */
export function extractFilePath(payload) {
  const fp = payload?.tool_input?.file_path;
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

/**
 * Decide whether `rawPath` is a TypeScript source file under the app dir that
 * we should lint. Returns the absolute path to lint, or null (no-op).
 */
export function resolveLintTarget(
  rawPath,
  projectRoot,
  appDir = process.env.POST_EDIT_VERIFY_APP_DIR || DEFAULT_APP_DIR
) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const abs = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(projectRoot, rawPath);
  const ext = path.extname(abs).toLowerCase();
  if (ext !== ".ts" && ext !== ".tsx") return null;
  const appRoot = path.resolve(projectRoot, appDir);
  const rel = path.relative(appRoot, abs);
  // Inside appRoot iff rel does not escape upward and is not absolute.
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

/**
 * Map an eslint spawnSync result to a hook decision.
 *   eslint exit 0  -> clean        -> hook exit 0
 *   eslint exit 1  -> real findings -> hook exit 2 (blocking)
 *   eslint exit 2  -> config/internal error -> fail-open hook exit 0
 *   null (timeout/signal) / spawn error / anything else -> fail-open exit 0
 */
export function classifyEslintResult(result) {
  if (result == null) return { exit: 0, kind: "infra" };
  if (result.error) return { exit: 0, kind: "infra" };
  if (result.status === 0) return { exit: 0, kind: "clean" };
  if (result.status === 1) return { exit: 2, kind: "findings" };
  return { exit: 0, kind: "infra" };
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const projectRoot =
    process.env.POST_EDIT_VERIFY_PROJECT_ROOT || DEFAULT_PROJECT_ROOT;
  const appDir = process.env.POST_EDIT_VERIFY_APP_DIR || DEFAULT_APP_DIR;

  const payload = parseHookInput(readStdinSync());
  if (!payload) process.exit(0); // unparseable stdin -> fail-open no-op

  const filePath = extractFilePath(payload);
  const target = resolveLintTarget(filePath, projectRoot, appDir);
  if (!target) process.exit(0); // not a lintable .ts/.tsx file -> no-op

  const appRoot = path.resolve(projectRoot, appDir);
  const eslintBin = path.join(
    appRoot,
    "node_modules",
    "eslint",
    "bin",
    "eslint.js"
  );

  if (!existsSync(eslintBin)) {
    process.stderr.write(
      `[post-edit-verify] eslint not found at ${eslintBin} — skipping (fail-open)\n`
    );
    process.exit(0);
  }

  const result = spawnSync(process.execPath, [eslintBin, target], {
    cwd: appRoot,
    encoding: "utf8",
    shell: false,
    timeout: ESLINT_TIMEOUT_MS,
  });

  const decision = classifyEslintResult(result);

  if (decision.kind === "findings") {
    const rel = path.relative(projectRoot, target);
    const detail = `${result.stdout || ""}${result.stderr || ""}`.trim();
    process.stderr.write(
      `[post-edit-verify] ESLint reported problems in ${rel}:\n${detail}\n`
    );
    process.exit(2);
  }

  if (decision.kind === "infra") {
    const why = result?.error
      ? result.error.message
      : result?.status === null
        ? "timed out or terminated by signal"
        : `eslint exit ${result?.status}`;
    process.stderr.write(
      `[post-edit-verify] verification skipped (${why}) — fail-open\n`
    );
    process.exit(0);
  }

  // clean
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
