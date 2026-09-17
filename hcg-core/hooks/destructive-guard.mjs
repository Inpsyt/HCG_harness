#!/usr/bin/env node
// hooks/destructive-guard.mjs
//
// PreToolUse destructive-command guard (hcg-core). Ported from the legacy
// hcg-harness G2 guard (contracts-guard.mjs) as a standalone module — the
// contracts-lock guards (G1/G3) are deliberately NOT ported: in the hcg-core
// session-owned contracts model the session itself is the legitimate author,
// so a lock would put friction on the normal path (the hobble hcg-core removed).
//
// Why this guard exists in hcg-core (CHANGELOG 0.1.6):
//   - scripts/run-headless.mjs runs with --dangerously-skip-permissions, so on
//     the unattended path there is NO permission prompt between the model and
//     `DROP DATABASE` / `rm -rf` / `prisma migrate reset`. This hook is the
//     only mechanical backstop there.
//   - By the design spec's own taxonomy this is a guardrail (cliff curve), not
//     a hobble (speed bump on every road): hooks.json matches Bash|PowerShell
//     only, so Edit/Write calls pay nothing; a false positive is relieved with
//     HARNESS_DISABLE_DESTRUCTIVE_GUARD=1 for that step.
//
// A command matching a curated set of irreversible/catastrophic patterns
// (prisma migrate reset, prisma db push --force-reset/--accept-data-loss,
// SQL DROP DATABASE/TABLE/SCHEMA, TRUNCATE TABLE, `rm -rf` /
// `Remove-Item -Recurse -Force` on a filesystem/home root, `git push --force`)
// is DENIED unless disabled via env HARNESS_DISABLE_DESTRUCTIVE_GUARD.
//
// Deny mechanism (Claude Code PreToolUse convention): exit 2 with the reason on
// stderr — Claude Code cancels the tool call and feeds the reason back to Claude.
// Fail-open: any infra/parse failure => exit 0 (a hook bug must never block work).
//
// Exit codes:
//   0 = allow (no violation, or fail-open on an infra/parse error)
//   2 = deny  (violation detected; stderr reason is returned to the agent)
//
// Environment overrides:
//   HARNESS_DISABLE_DESTRUCTIVE_GUARD truthy => disable the guard.
//
// hooks.json invokes this file directly (no run-* launcher: unlike
// session-start-context there is no env mapping to perform).

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const COMMAND_TOOLS = new Set(["Bash", "PowerShell"]);

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
 * Env truthiness: a value is "truthy" iff it is set and not one of the falsey
 * spellings ("", "0", "false", "no", "off", case-insensitive).
 */
export function isEnvTruthy(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

// Destructive rules. Each test(cmd) => true means "deny".
const RM_RECURSIVE_FORCE =
  /\brm\s+(?:-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r)\b|\brm\b(?=[^\n]*\s-[A-Za-z]*r\b)(?=[^\n]*\s-[A-Za-z]*f\b)/;
const RM_DANGEROUS_TARGET =
  /(?:^|\s)(?:\/|\/\*|~\/?|\$HOME|\.{1,2})(?:\s|$)|(?:^|\s)[A-Za-z]:\\?(?:\s|$)/;

export const DESTRUCTIVE_RULES = [
  {
    label: "prisma migrate reset (drops and recreates the entire database)",
    test: (c) => /\bprisma\s+migrate\s+reset\b/i.test(c),
  },
  {
    label: "prisma db push with a data-loss flag",
    test: (c) =>
      /\bprisma\s+db\s+push\b[^\n]*--(?:force-reset|accept-data-loss)\b/i.test(c),
  },
  {
    label: "SQL DROP DATABASE/TABLE/SCHEMA",
    test: (c) => /\bdrop\s+(?:database|table|schema)\b/i.test(c),
  },
  {
    label: "SQL TRUNCATE TABLE",
    test: (c) => /\btruncate\s+table\b/i.test(c),
  },
  {
    label: "rm -rf on a filesystem/home root",
    test: (c) => RM_RECURSIVE_FORCE.test(c) && RM_DANGEROUS_TARGET.test(c),
  },
  {
    label: "git push --force (use --force-with-lease, or push a fresh branch)",
    test: (c) =>
      /\bgit\s+push\b/.test(c) &&
      (/--force(?!-with-lease)\b/.test(c) || /\s-f\b/.test(c)),
  },
  {
    label: "Remove-Item -Recurse -Force on a filesystem/home root",
    test: (c) =>
      /\bRemove-Item\b(?=[^\n]*\s-Recurse\b)(?=[^\n]*\s-Force\b)/i.test(c) &&
      RM_DANGEROUS_TARGET.test(c),
  },
];

/**
 * Destructive command guard. Returns { deny, reason }.
 *   opts: { enabled }
 */
export function checkDestructiveBash(payload, opts) {
  const { enabled } = opts;
  if (!enabled) return { deny: false };
  if (!payload || !COMMAND_TOOLS.has(payload.tool_name)) return { deny: false };
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== "string" || cmd.length === 0) return { deny: false };
  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.test(cmd)) {
      return {
        deny: true,
        reason:
          `Blocked a destructive/irreversible command (${rule.label}). ` +
          `If this is intentional and safe, run it yourself or set ` +
          `HARNESS_DISABLE_DESTRUCTIVE_GUARD=1 for this step.`,
      };
    }
  }
  return { deny: false };
}

/**
 * Top-level decision for a parsed payload. Returns { deny, reason }.
 * Pure: env is passed in so it is fully testable.
 */
export function evaluate(payload, { env = process.env } = {}) {
  return checkDestructiveBash(payload, {
    enabled: !isEnvTruthy(env.HARNESS_DISABLE_DESTRUCTIVE_GUARD),
  });
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const payload = parseHookInput(readStdinSync());
  if (!payload) process.exit(0); // unparseable stdin -> fail-open allow

  let decision;
  try {
    decision = evaluate(payload, { env: process.env });
  } catch {
    process.exit(0); // any evaluation bug -> fail-open allow
  }

  if (decision.deny) {
    process.stderr.write(`[destructive-guard] ${decision.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
