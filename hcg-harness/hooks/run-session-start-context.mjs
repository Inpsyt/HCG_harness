#!/usr/bin/env node
// hooks/run-session-start-context.mjs
//
// Shell-agnostic launcher for session-start-context.mjs (plugin-method hook wiring).
// Same rationale as run-post-edit-verify.mjs — see that file for the full why.
//
// What it does
// ------------
//   1. Map the portable CLAUDE_PROJECT_DIR into SESSION_START_PROJECT_ROOT — the
//      override env name the real hook reads (session-start-context.mjs main():
//      process.env.SESSION_START_PROJECT_ROOT). Only set when absent so an
//      explicit override still wins.
//   2. Realign process.argv[1] to the real hook so its invokedDirectly guard
//      (`path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)`) fires
//      on import. The real hook is unchanged; it reads its files and calls
//      process.exit(0) on its own (fail-open, read-only).

import { fileURLToPath } from "node:url";

if (
  process.env.CLAUDE_PROJECT_DIR &&
  !process.env.SESSION_START_PROJECT_ROOT
) {
  process.env.SESSION_START_PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR;
}

// Same URL the imported module computes for its own import.meta.url, so the
// invokedDirectly guard compares equal.
process.argv[1] = fileURLToPath(
  new URL("./session-start-context.mjs", import.meta.url)
);

await import("./session-start-context.mjs");
