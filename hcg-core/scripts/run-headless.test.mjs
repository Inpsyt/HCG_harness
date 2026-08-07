import { test } from "node:test";
import assert from "node:assert/strict";
import { isModelLimit, isAccountLimit, classify, exitCodeFor, parseArgs, buildResumePrompt } from "./run-headless.mjs";

// 아래 두 문자열은 2026-08-07 A/B 벤치마크에서 실제로 관측된 원문이다.
const MODEL_LIMIT_MSG = "You've reached your Fable 5 limit. Run /usage-credits to continue or switch models with /model.";
const ACCOUNT_LIMIT_MSG = "You've hit your session limit · resets 1:20am (Asia/Seoul)";

// ── 한도 2종 분리 — 모델 전환이 듣는 것은 하나뿐 ──────────────────────────────

test("모델별 한도는 폴백 대상으로 인식한다", () => {
  assert.equal(isModelLimit(MODEL_LIMIT_MSG), true);
  assert.equal(isAccountLimit(MODEL_LIMIT_MSG), false);
});

test("계정·세션 한도는 폴백 대상이 아니다 — 모델을 바꿔도 막힌다", () => {
  assert.equal(isAccountLimit(ACCOUNT_LIMIT_MSG), true);
  assert.equal(isModelLimit(ACCOUNT_LIMIT_MSG), false);
});

test("일반 실패는 한도로 오인하지 않는다", () => {
  for (const s of ["TypeError: undefined is not a function", "빌드가 실패했습니다", "", undefined]) {
    assert.equal(isModelLimit(s), false);
    assert.equal(isAccountLimit(s), false);
  }
});

// ── classify — subtype 은 절대 보지 않는다 ────────────────────────────────────

test("정상 완료 → OK", () => {
  assert.equal(classify(0, { is_error: false, subtype: "success", result: "완료했습니다" }), "OK");
});

test("모델 한도 절단 → MODEL_LIMIT (subtype 이 success 여도)", () => {
  // 실측 관측값: exit 1 · is_error true · subtype "success"
  assert.equal(classify(1, { is_error: true, subtype: "success", result: MODEL_LIMIT_MSG }), "MODEL_LIMIT");
});

test("계정 한도 절단 → ACCOUNT_LIMIT (폴백 시도하지 않음)", () => {
  assert.equal(classify(1, { is_error: true, subtype: "success", result: ACCOUNT_LIMIT_MSG }), "ACCOUNT_LIMIT");
});

test("subtype:success 를 신뢰하지 않는다 — is_error 가 우선", () => {
  const json = { is_error: true, subtype: "success", result: "무언가 터졌다" };
  assert.equal(classify(1, json), "ERROR");
});

test("일반 실패 → ERROR", () => {
  assert.equal(classify(1, { is_error: true, result: "crash" }), "ERROR");
  assert.equal(classify(2, null), "ERROR");
});

// ── exitCodeFor — 조용한 미완주를 구분해 내보낸다 ─────────────────────────────

test("완주 + 검증 통과/생략 → 0", () => {
  assert.equal(exitCodeFor("OK", "PASS"), 0);
  assert.equal(exitCodeFor("OK", "SKIP"), 0);
});

test("세션은 정상 종료했으나 검증 실패 → 10 (조용한 미완주)", () => {
  assert.equal(exitCodeFor("OK", "FAIL"), 10);
});

test("모델 한도 → 20 · 계정 한도 → 21 · 실행 오류 → 1", () => {
  assert.equal(exitCodeFor("MODEL_LIMIT", "SKIP"), 20);
  assert.equal(exitCodeFor("ACCOUNT_LIMIT", "SKIP"), 21);
  assert.equal(exitCodeFor("ERROR", "SKIP"), 1);
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

test("폴백 목록을 콤마로 분해한다", () => {
  const a = parseArgs(["--dir", "/p", "--prompt-file", "p.txt", "--fallback", "claude-opus-5, claude-sonnet-5"]);
  assert.deepEqual(a.fallback, ["claude-opus-5", "claude-sonnet-5"]);
  assert.equal(a.dir, "/p");
  assert.equal(a.maxResumes, 3);
});

test("폴백 미지정이면 빈 배열 — 자동 전환하지 않는다", () => {
  assert.deepEqual(parseArgs(["--dir", "/p", "--prompt-file", "p.txt"]).fallback, []);
});

// ── buildResumePrompt — 첫 턴 한도 절단에서도 작업이 실제로 수행되게 한다 ─────

test("재개 지시문은 원 프롬프트를 다시 싣는다", () => {
  // 한도가 첫 턴에 걸리면 모델이 원 지시를 보기도 전에 죽어 세션 이력이 비어 있다.
  // "이어서 하라"고만 하면 재개 세션이 "진행 중이던 것 없음"으로 아무 일도 안 한다(실측).
  const p = buildResumePrompt("docs/spec.md 를 구현하라");
  assert.match(p, /docs\/spec\.md 를 구현하라/);
  assert.match(p, /아무것도 진행되지 않았다면 아래 지시를 처음부터 수행/);
});

test("재개 지시문은 진행분 확인과 중복 수행 방지를 함께 지시한다", () => {
  const p = buildResumePrompt("X");
  assert.match(p, /어디까지 진행됐는지 확인/);
  assert.match(p, /중복 수행하지 말고/);
});
