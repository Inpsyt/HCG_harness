// hooks/post-edit-verify.test.mjs
// Unit tests for the PostToolUse ESLint/tsc verification hook pure functions.
// Run: node --test hcg-harness/hooks/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import {
  isEnvTruthy,
  parseHookInput,
  extractFilePath,
  parseAppDirs,
  resolveLintTarget,
  resolveBin,
  classifyEslintResult,
  classifyTscResult,
} from "./post-edit-verify.mjs";

const ROOT = path.resolve("/repo");

test("parseHookInput / extractFilePath", () => {
  assert.equal(parseHookInput("{bad"), null);
  assert.deepEqual(parseHookInput('{"x":1}'), { x: 1 });
  assert.equal(extractFilePath({ tool_input: { file_path: "a.ts" } }), "a.ts");
  assert.equal(extractFilePath({ tool_input: {} }), null);
});

test("isEnvTruthy", () => {
  for (const t of ["1", "true", "yes", "on"]) assert.equal(isEnvTruthy(t), true, t);
  for (const f of [undefined, "", "0", "false", "off", "no"]) assert.equal(isEnvTruthy(f), false, String(f));
});

test("parseAppDirs: default, single, comma list, blank", () => {
  assert.deepEqual(parseAppDirs(undefined), ["apps/web"]);
  assert.deepEqual(parseAppDirs(""), ["apps/web"]);
  assert.deepEqual(parseAppDirs("."), ["."]);
  assert.deepEqual(parseAppDirs("apps/web, apps/admin , packages/ui"), [
    "apps/web",
    "apps/admin",
    "packages/ui",
  ]);
});

test("resolveLintTarget: .ts under an app dir matches; others no-op", () => {
  const dirs = ["apps/web", "packages/ui"];
  const a = resolveLintTarget("apps/web/feat/x.ts", ROOT, dirs);
  assert.equal(a.appDir, "apps/web");
  assert.equal(a.target, path.resolve(ROOT, "apps/web/feat/x.ts"));

  const b = resolveLintTarget("packages/ui/y.tsx", ROOT, dirs);
  assert.equal(b.appDir, "packages/ui"); // second dir in the list

  assert.equal(resolveLintTarget("src/z.ts", ROOT, dirs), null); // outside all app dirs
  assert.equal(resolveLintTarget("apps/web/x.js", ROOT, dirs), null); // not ts/tsx
  assert.equal(resolveLintTarget("", ROOT, dirs), null);
});

test("resolveLintTarget: absolute path under app dir", () => {
  const abs = path.resolve(ROOT, "apps/web/a.ts");
  const r = resolveLintTarget(abs, ROOT, ["apps/web"]);
  assert.equal(r.target, abs);
});

test("resolveLintTarget: '.' app dir = non-monorepo whole project", () => {
  const r = resolveLintTarget("src/app.ts", ROOT, ["."]);
  assert.equal(r.appDir, ".");
  assert.equal(r.target, path.resolve(ROOT, "src/app.ts"));
});

test("resolveBin: prefers appRoot, falls back to projectRoot", () => {
  const appRoot = path.resolve(ROOT, "apps/web");
  const appCand = path.join(appRoot, "node_modules", "eslint", "bin", "eslint.js");
  const rootCand = path.join(ROOT, "node_modules", "eslint", "bin", "eslint.js");

  // present in appRoot -> appRoot wins
  assert.equal(resolveBin(["eslint", "bin", "eslint.js"], appRoot, ROOT, (p) => p === appCand), appCand);
  // absent in appRoot, present at root -> fallback (pnpm hoist)
  assert.equal(resolveBin(["eslint", "bin", "eslint.js"], appRoot, ROOT, (p) => p === rootCand), rootCand);
  // absent everywhere -> null
  assert.equal(resolveBin(["eslint", "bin", "eslint.js"], appRoot, ROOT, () => false), null);
});

test("classifyEslintResult", () => {
  assert.deepEqual(classifyEslintResult(null), { exit: 0, kind: "infra" });
  assert.deepEqual(classifyEslintResult({ error: new Error("x") }), { exit: 0, kind: "infra" });
  assert.deepEqual(classifyEslintResult({ status: 0 }), { exit: 0, kind: "clean" });
  assert.deepEqual(classifyEslintResult({ status: 1 }), { exit: 2, kind: "findings" });
  assert.deepEqual(classifyEslintResult({ status: 2 }), { exit: 0, kind: "infra" }); // config error fail-open
});

test("classifyTscResult", () => {
  assert.deepEqual(classifyTscResult(null), { exit: 0, kind: "infra" });
  assert.deepEqual(classifyTscResult({ error: new Error("x") }), { exit: 0, kind: "infra" });
  assert.deepEqual(classifyTscResult({ status: 0 }), { exit: 0, kind: "clean" });
  assert.deepEqual(classifyTscResult({ status: 1 }), { exit: 2, kind: "findings" });
  assert.deepEqual(classifyTscResult({ status: 2 }), { exit: 2, kind: "findings" }); // any >0 blocks
});
