#!/usr/bin/env node
// hooks/run-contracts-guard.mjs
//
// Shell-agnostic launcher for contracts-guard.mjs (plugin-method hook wiring).
// Same rationale as run-post-edit-verify.mjs: hooks.json must invoke the guard
// with no POSIX inline env-prefix (which breaks on Windows cmd/PowerShell before
// the .mjs can fail-open). hooks.json runs `node <this wrapper>`; the wrapper
// maps env in JS, then loads the real, unmodified hook.
//
//   1. Map CLAUDE_PROJECT_DIR (set by Claude Code for every hook) into
//      CONTRACTS_GUARD_PROJECT_ROOT — the override the real hook reads. Only when
//      absent, so an explicit override still wins. (The guard also falls back to
//      the payload's `cwd`, so this is belt-and-suspenders.)
//   2. Realign process.argv[1] to the real hook so its `invokedDirectly` guard
//      fires on import (Node invoked THIS wrapper, not the hook).

import { fileURLToPath } from "node:url";

if (
  process.env.CLAUDE_PROJECT_DIR &&
  !process.env.CONTRACTS_GUARD_PROJECT_ROOT
) {
  process.env.CONTRACTS_GUARD_PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR;
}

process.argv[1] = fileURLToPath(new URL("./contracts-guard.mjs", import.meta.url));

await import("./contracts-guard.mjs");
