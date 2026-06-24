#!/usr/bin/env node
// hooks/run-phase-gate-check.mjs
//
// Shell-agnostic launcher for phase-gate-check.mjs (plugin-method hook wiring).
// Same rationale as the other run-*.mjs launchers: hooks.json runs
// `node <this wrapper>` (works in every shell); the wrapper maps env in JS, then
// loads the real, unmodified hook.

import { fileURLToPath } from "node:url";

if (process.env.CLAUDE_PROJECT_DIR && !process.env.PHASE_GATE_PROJECT_ROOT) {
  process.env.PHASE_GATE_PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR;
}

process.argv[1] = fileURLToPath(new URL("./phase-gate-check.mjs", import.meta.url));

await import("./phase-gate-check.mjs");
