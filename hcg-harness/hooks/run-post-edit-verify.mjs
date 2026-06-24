#!/usr/bin/env node
// hooks/run-post-edit-verify.mjs
//
// Shell-agnostic launcher for post-edit-verify.mjs (plugin-method hook wiring).
//
// Why this wrapper exists
// -----------------------
// The plugin's hooks.json must invoke the verifier WITHOUT a POSIX inline
// env-prefix (`VAR="..." node ...`). On Windows cmd/PowerShell that prefix is
// parsed as an executable/syntax rather than an assignment, so the hook fails to
// launch BEFORE the .mjs can fail-open — silently disabling PostToolUse
// verification on Windows. Instead hooks.json runs `node <this wrapper>` (works
// in every shell), and the wrapper performs the env mapping in JS before loading
// the real, unmodified hook.
//
// What it does
// ------------
//   1. Map the portable CLAUDE_PROJECT_DIR (set by Claude Code for every hook)
//      into POST_EDIT_VERIFY_PROJECT_ROOT — the override env name the real hook
//      reads (post-edit-verify.mjs main(): process.env.POST_EDIT_VERIFY_PROJECT_ROOT).
//      Only set when absent so an explicit override still wins.
//   2. Realign process.argv[1] to the real hook before importing it. The real
//      hook only runs main() when invoked DIRECTLY — its guard is
//      `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)`. Node
//      invoked THIS wrapper, so without realignment a plain import would load the
//      module but never run main() (the hook would no-op). Pointing argv[1] at
//      the real hook's own path makes its unmodified guard fire on import.
//      stdin + exit-code passthrough are then handled by the real hook itself
//      (it reads stdin via readFileSync(0) and calls process.exit).

import { fileURLToPath } from "node:url";

if (
  process.env.CLAUDE_PROJECT_DIR &&
  !process.env.POST_EDIT_VERIFY_PROJECT_ROOT
) {
  process.env.POST_EDIT_VERIFY_PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR;
}

// Same URL the imported module computes for its own import.meta.url, so the
// invokedDirectly guard compares equal.
process.argv[1] = fileURLToPath(new URL("./post-edit-verify.mjs", import.meta.url));

await import("./post-edit-verify.mjs");
