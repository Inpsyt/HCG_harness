// hooks/contracts-guard.test.mjs
// Unit tests for the PreToolUse contracts-lock + destructive-command guard.
// Run: node --test hcg-harness/hooks/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

import {
  parseHookInput,
  isEnvTruthy,
  resolveProjectRoot,
  extractWritePath,
  isUnderDir,
  checkContractsLock,
  checkDestructiveBash,
  checkShellContractsWrite,
  UNLOCK_SENTINEL_REL,
  evaluate,
} from "./contracts-guard.mjs";

const ROOT = path.resolve("/repo");
const lockOpts = (extra = {}) => ({ projectRoot: ROOT, unlocked: false, ...extra });
const write = (tool_name, file_path) => ({ tool_name, tool_input: { file_path } });
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

test("parseHookInput: valid / empty / malformed", () => {
  assert.deepEqual(parseHookInput('{"a":1}'), { a: 1 });
  assert.equal(parseHookInput(""), null);
  assert.equal(parseHookInput("   "), null);
  assert.equal(parseHookInput("{not json"), null);
  assert.equal(parseHookInput(null), null);
});

test("isEnvTruthy: set/truthy vs falsey spellings", () => {
  for (const t of ["1", "true", "yes", "on", "anything"]) assert.equal(isEnvTruthy(t), true, t);
  for (const f of [undefined, null, "", "0", "false", "FALSE", "no", "off"])
    assert.equal(isEnvTruthy(f), false, String(f));
});

test("resolveProjectRoot: env > cwd > default", () => {
  assert.equal(resolveProjectRoot({ cwd: "/x" }, { CONTRACTS_GUARD_PROJECT_ROOT: "/o" }), "/o");
  assert.equal(resolveProjectRoot({ cwd: "/x" }, {}), "/x");
  assert.equal(typeof resolveProjectRoot({}, {}), "string"); // falls back to default root
});

test("extractWritePath: file_path and notebook_path", () => {
  assert.equal(extractWritePath(write("Edit", "a.ts")), "a.ts");
  assert.equal(extractWritePath({ tool_input: { notebook_path: "n.ipynb" } }), "n.ipynb");
  assert.equal(extractWritePath({ tool_input: {} }), null);
  assert.equal(extractWritePath({}), null);
});

test("isUnderDir: membership, not the dir itself, no escape", () => {
  const c = path.resolve(ROOT, "contracts");
  assert.equal(isUnderDir(path.resolve(ROOT, "contracts/db-schema.md"), c), true);
  assert.equal(isUnderDir(path.resolve(ROOT, "contracts/sub/x.ts"), c), true);
  assert.equal(isUnderDir(c, c), false); // the dir itself is not "under"
  assert.equal(isUnderDir(path.resolve(ROOT, "src/a.ts"), c), false);
  assert.equal(isUnderDir(path.resolve(ROOT, "contractsX/foo.md"), c), false); // sibling, anti-overfit
});

// ---- G1: contracts lock --------------------------------------------------
test("contracts lock: blocks write under contracts when locked", () => {
  for (const tool of ["Edit", "Write", "MultiEdit"]) {
    const r = checkContractsLock(write(tool, "contracts/db-schema.md"), lockOpts());
    assert.equal(r.deny, true, tool);
    assert.match(r.reason, /read-only SSOT/);
  }
});

test("contracts lock: absolute path under contracts is blocked", () => {
  const abs = path.resolve(ROOT, "contracts/api-spec.md");
  assert.equal(checkContractsLock(write("Write", abs), lockOpts()).deny, true);
});

test("contracts lock: NotebookEdit under contracts is blocked", () => {
  const p = { tool_name: "NotebookEdit", tool_input: { notebook_path: "contracts/x.ipynb" } };
  assert.equal(checkContractsLock(p, lockOpts()).deny, true);
});

test("contracts lock: allows non-contracts paths, unlocked, and non-write tools", () => {
  assert.equal(checkContractsLock(write("Edit", "src/foo.ts"), lockOpts()).deny, false);
  assert.equal(checkContractsLock(write("Edit", "contractsX/foo.md"), lockOpts()).deny, false); // sibling
  assert.equal(
    checkContractsLock(write("Edit", "contracts/db-schema.md"), lockOpts({ unlocked: true })).deny,
    false
  );
  assert.equal(
    checkContractsLock({ tool_name: "Read", tool_input: { file_path: "contracts/x.md" } }, lockOpts()).deny,
    false
  );
});

test("contracts lock: honors a custom contractsDir", () => {
  const r = checkContractsLock(write("Edit", "spec/db.md"), lockOpts({ contractsDir: "spec" }));
  assert.equal(r.deny, true);
  // default dir name no longer matches once overridden
  assert.equal(checkContractsLock(write("Edit", "contracts/x.md"), lockOpts({ contractsDir: "spec" })).deny, false);
});

// ---- G2: destructive command guard ---------------------------------------
const denies = (cmd) => checkDestructiveBash(bash(cmd), { enabled: true }).deny;

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

test("destructive: disabled guard and non-Bash tools allow", () => {
  assert.equal(checkDestructiveBash(bash("rm -rf /"), { enabled: false }).deny, false);
  assert.equal(checkDestructiveBash(write("Edit", "a.ts"), { enabled: true }).deny, false);
});

// ---- G3: shell writes into contracts/ -------------------------------------
const g3 = (cmd, extra = {}) =>
  checkShellContractsWrite(bash(cmd), {
    projectRoot: ROOT, contractsDir: "contracts", unlocked: false, ...extra,
  });
const ps = (command) => ({ tool_name: "PowerShell", tool_input: { command } });
const g3ps = (cmd) =>
  checkShellContractsWrite(ps(cmd), {
    projectRoot: ROOT, contractsDir: "contracts", unlocked: false,
  });

test("shell-write: redirection into contracts blocked, elsewhere allowed", () => {
  assert.equal(g3("echo hi > contracts/api-spec.md").deny, true);
  assert.equal(g3("cat notes.md >> contracts/db-schema.md").deny, true);
  assert.equal(g3("echo hi > ./contracts/x.md").deny, true);
  assert.equal(g3('echo hi > "contracts/x.md"').deny, true);
  assert.equal(g3("node run.mjs > out/log.txt").deny, false); // anti-overfit
  assert.equal(g3("pnpm test 2> err.log").deny, false); // anti-overfit
});

test("shell-write: tee / sed -i into contracts blocked, reads allowed", () => {
  assert.equal(g3("echo x | tee contracts/api-spec.md").deny, true);
  assert.equal(g3("sed -i 's/a/b/' contracts/db-schema.md").deny, true);
  assert.equal(g3("cat contracts/api-spec.md").deny, false);
  assert.equal(g3("grep -n foo contracts/db-schema.md").deny, false);
  assert.equal(g3("git diff contracts/").deny, false);
  assert.equal(g3("sed -n '1,10p' contracts/api-spec.md").deny, false); // read-only sed
});

test("shell-write: rm/touch/mv mutate contracts anywhere; cp only as dest", () => {
  assert.equal(g3("rm contracts/old-spec.md").deny, true);
  assert.equal(g3("touch contracts/new.md").deny, true);
  assert.equal(g3("mv contracts/a.md contracts/b.md").deny, true);
  assert.equal(g3("mv contracts/a.md /tmp/").deny, true); // move OUT still mutates contracts
  assert.equal(g3("cp docs/x.md contracts/x.md").deny, true); // dest
  assert.equal(g3("cp contracts/x.md /tmp/backup.md").deny, false); // source = read
  assert.equal(g3("rm -rf node_modules").deny, false); // anti-overfit
});

test("shell-write: PowerShell write cmdlets blocked, reads allowed", () => {
  assert.equal(g3ps('Set-Content -Path contracts\\api-spec.md -Value "x"').deny, true);
  assert.equal(g3ps('"x" | Out-File contracts/db-schema.md').deny, true);
  assert.equal(g3ps("Remove-Item contracts\\old.md").deny, true);
  assert.equal(g3ps("Get-Content contracts/api-spec.md").deny, false);
  assert.equal(g3ps("Copy-Item docs/a.md contracts/a.md").deny, true);
});

test("shell-write: unlocked / non-command tools / custom dir", () => {
  assert.equal(g3("echo hi > contracts/x.md", { unlocked: true }).deny, false);
  assert.equal(
    checkShellContractsWrite(write("Edit", "contracts/x.md"), {
      projectRoot: ROOT, contractsDir: "contracts", unlocked: false,
    }).deny,
    false
  );
  assert.equal(g3("echo x > spec/api.md", { contractsDir: "spec" }).deny, true);
  assert.equal(g3("echo x > contracts/x.md", { contractsDir: "spec" }).deny, false);
});

// ---- G2 extension: PowerShell tool coverage --------------------------------
test("destructive: PowerShell commands are guarded too", () => {
  const d = (cmd) => checkDestructiveBash(ps(cmd), { enabled: true }).deny;
  assert.equal(d("pnpm prisma migrate reset"), true);
  assert.equal(d('mysql -e "DROP TABLE users"'), true);
  assert.equal(d("Remove-Item -Recurse -Force C:\\"), true);
  assert.equal(d("Remove-Item -Force -Recurse ~"), true);
  assert.equal(d("Remove-Item -Recurse -Force .\\dist"), false); // anti-overfit
  assert.equal(d("Remove-Item -Recurse .\\dist"), false); // anti-overfit
});

// ---- unlock sentinel --------------------------------------------------------
test("evaluate: sentinel file unlocks contracts writes (Edit and shell)", () => {
  const env = { CONTRACTS_GUARD_PROJECT_ROOT: ROOT };
  const sentinelAbs = path.resolve(ROOT, UNLOCK_SENTINEL_REL);
  const withSentinel = (p) => path.resolve(p) === sentinelAbs;
  const noSentinel = () => false;

  const edit = write("Edit", "contracts/db-schema.md");
  assert.equal(evaluate(edit, { env, fileExists: noSentinel }).deny, true);
  assert.equal(evaluate(edit, { env, fileExists: withSentinel }).deny, false);

  const shell = bash("echo x > contracts/db-schema.md");
  assert.equal(evaluate(shell, { env, fileExists: noSentinel }).deny, true);
  assert.equal(evaluate(shell, { env, fileExists: withSentinel }).deny, false);
});

test("evaluate: shell contracts write blocked by default, unlocked by env", () => {
  const p = bash("echo x >> contracts/api-spec.md");
  assert.equal(evaluate(p, { env: { CONTRACTS_GUARD_PROJECT_ROOT: ROOT } }).deny, true);
  assert.equal(
    evaluate(p, { env: { CONTRACTS_GUARD_PROJECT_ROOT: ROOT, HARNESS_CONTRACTS_WRITE: "1" } }).deny,
    false
  );
});

// ---- evaluate(): env integration -----------------------------------------
test("evaluate: contracts locked by default, unlocked by env", () => {
  const p = write("Edit", "contracts/db-schema.md");
  assert.equal(evaluate(p, { env: { CONTRACTS_GUARD_PROJECT_ROOT: ROOT } }).deny, true);
  assert.equal(
    evaluate(p, { env: { CONTRACTS_GUARD_PROJECT_ROOT: ROOT, HARNESS_CONTRACTS_WRITE: "1" } }).deny,
    false
  );
});

test("evaluate: destructive guard on by default, off by env", () => {
  const p = bash("prisma migrate reset");
  assert.equal(evaluate(p, { env: {} }).deny, true);
  assert.equal(evaluate(p, { env: { HARNESS_DISABLE_DESTRUCTIVE_GUARD: "1" } }).deny, false);
});

test("evaluate: clean calls pass", () => {
  assert.equal(evaluate(write("Edit", "src/app.ts"), { env: { CONTRACTS_GUARD_PROJECT_ROOT: ROOT } }).deny, false);
  assert.equal(evaluate(bash("pnpm test"), { env: {} }).deny, false);
});
