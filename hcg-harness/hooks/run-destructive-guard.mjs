#!/usr/bin/env node
// hooks/run-destructive-guard.mjs
//
// 0.3.0 런처 — 파괴적 명령 가드(G2)만 활성화한다.
// 계약 잠금(G1/G3)은 0.3.0 에서 폐지되었으므로 HARNESS_CONTRACTS_WRITE 로 끈다.
// hooks.json 의 matcher 를 Bash|PowerShell 로 좁혀 편집 경로에는 훅이 붙지 않는다.
import { fileURLToPath } from "node:url";

if (process.env.CLAUDE_PROJECT_DIR && !process.env.CONTRACTS_GUARD_PROJECT_ROOT) {
  process.env.CONTRACTS_GUARD_PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR;
}
process.env.HARNESS_CONTRACTS_WRITE = "1"; // G1+G3 off — 0.3.0 은 계약 잠금을 쓰지 않는다

process.argv[1] = fileURLToPath(new URL("./contracts-guard.mjs", import.meta.url));

await import("./contracts-guard.mjs");
