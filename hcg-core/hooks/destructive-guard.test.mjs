// hooks/destructive-guard.test.mjs
// Unit tests for the PreToolUse destructive-command guard (ported from the
// legacy G2 tests in hcg-harness/hooks/contracts-guard.test.mjs).
// Run: node --test hcg-core/hooks/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseHookInput,
  isEnvTruthy,
  checkDestructiveBash,
  DESTRUCTIVE_RULES,
  evaluate,
} from "./destructive-guard.mjs";

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const ps = (command) => ({ tool_name: "PowerShell", tool_input: { command } });
const write = (tool_name, file_path) => ({ tool_name, tool_input: { file_path } });
const denies = (cmd) => checkDestructiveBash(bash(cmd), { enabled: true }).deny;

test("parseHookInput: valid / empty / malformed", () => {
  assert.deepEqual(parseHookInput('{"a":1}'), { a: 1 });
  assert.equal(parseHookInput(""), null);
  assert.equal(parseHookInput("   "), null);
  assert.equal(parseHookInput("{not json"), null);
});

test("isEnvTruthy: falsey spellings", () => {
  for (const v of [undefined, null, "", "0", "false", "no", "off", "OFF"])
    assert.equal(isEnvTruthy(v), false, String(v));
  for (const v of ["1", "true", "yes", "on"]) assert.equal(isEnvTruthy(v), true, v);
});

test("destructive: prisma migrate reset blocked, migrate dev allowed", () => {
  assert.equal(denies("pnpm prisma migrate reset"), true);
  assert.equal(denies("npx prisma migrate reset --force"), true);
  assert.equal(denies("pnpm prisma migrate dev"), false); // anti-overfit
  assert.equal(denies("pnpm prisma migrate deploy"), false);
});

test("destructive: prisma db push only with data-loss flag", () => {
  assert.equal(denies("prisma db push --accept-data-loss"), true);
  assert.equal(denies("prisma db push --force-reset"), true);
  assert.equal(denies("prisma db push"), false); // anti-overfit
});

test("destructive: SQL DROP / TRUNCATE", () => {
  assert.equal(denies('mysql -e "DROP TABLE users"'), true);
  assert.equal(denies('mysql -e "drop database app"'), true);
  assert.equal(denies('mysql -e "TRUNCATE TABLE logs"'), true);
  assert.equal(denies('echo "backdrop and raindrop"'), false); // anti-overfit: \bdrop\b
  assert.equal(denies('mysql -e "SELECT * FROM truncate_audit"'), false); // anti-overfit
});

test("destructive: rm -rf only on dangerous roots", () => {
  assert.equal(denies("rm -rf /"), true);
  assert.equal(denies("rm -rf /*"), true);
  assert.equal(denies("rm -rf ~"), true);
  assert.equal(denies("rm -rf $HOME"), true);
  assert.equal(denies("rm -fr /"), true);
  assert.equal(denies("rm -r -f /"), true);
  assert.equal(denies("rm -rf ."), true);
  assert.equal(denies("rm -rf ./dist"), false); // anti-overfit: relative subdir
  assert.equal(denies("rm -rf node_modules"), false); // anti-overfit
  assert.equal(denies("rm -rf .next"), false); // anti-overfit
});

test("destructive: git push --force vs --force-with-lease", () => {
  assert.equal(denies("git push --force"), true);
  assert.equal(denies("git push -f origin main"), true);
  assert.equal(denies("git push --force-with-lease"), false); // anti-overfit: lease is safe
  assert.equal(denies("git push origin main"), false);
});

test("destructive: PowerShell commands are guarded too", () => {
  const d = (cmd) => checkDestructiveBash(ps(cmd), { enabled: true }).deny;
  assert.equal(d("pnpm prisma migrate reset"), true);
  assert.equal(d('mysql -e "DROP TABLE users"'), true);
  assert.equal(d("Remove-Item -Recurse -Force C:\\"), true);
  assert.equal(d("Remove-Item -Force -Recurse ~"), true);
  assert.equal(d("Remove-Item -Recurse -Force .\\dist"), false); // anti-overfit
  assert.equal(d("Remove-Item -Recurse .\\dist"), false); // anti-overfit
});

test("destructive: disabled guard and non-command tools allow", () => {
  assert.equal(checkDestructiveBash(bash("rm -rf /"), { enabled: false }).deny, false);
  assert.equal(checkDestructiveBash(write("Edit", "a.ts"), { enabled: true }).deny, false);
  assert.equal(checkDestructiveBash(null, { enabled: true }).deny, false);
  assert.equal(checkDestructiveBash(bash(""), { enabled: true }).deny, false);
});

test("every rule carries a label (deny reason is always specific)", () => {
  for (const rule of DESTRUCTIVE_RULES) {
    assert.equal(typeof rule.label, "string");
    assert.ok(rule.label.length > 0);
    assert.equal(typeof rule.test, "function");
  }
});

test("evaluate: guard on by default, off by env", () => {
  const p = bash("prisma migrate reset");
  assert.equal(evaluate(p, { env: {} }).deny, true);
  assert.equal(evaluate(p, { env: { HARNESS_DISABLE_DESTRUCTIVE_GUARD: "1" } }).deny, false);
  assert.equal(evaluate(p, { env: { HARNESS_DISABLE_DESTRUCTIVE_GUARD: "0" } }).deny, true);
});

test("evaluate: clean calls pass", () => {
  assert.equal(evaluate(bash("pnpm test"), { env: {} }).deny, false);
  assert.equal(evaluate(write("Edit", "src/app.ts"), { env: {} }).deny, false);
});
