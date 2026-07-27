// skills/qa-e2e/scripts/render-report.test.mjs
// Unit tests for the qa-e2e results.json -> report.md + report.html renderer.
// Run: node --test hcg-harness/skills/*/scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { summarize, renderMarkdown, renderHtml, inlineMd, verdictBadge, STATUS } from "./render-report.mjs";

const R = (id, suite, status, extra = {}) => ({ id, suite, status, title: `case ${id}`, ...extra });

const fixture = (over = {}) => ({
  meta: {
    project: "샘플",
    title: "단체 신청 ~ 응시 E2E",
    baseUrl: "http://localhost:3000",
    env: "local-dev",
    driver: "claude-for-chrome",
    stack: { language: "node", framework: "next-app-router", unitRunner: "vitest" },
    startedAt: "2026-07-27T10:00:00+09:00",
    finishedAt: "2026-07-27T13:21:19+09:00",
    ...over.meta,
  },
  suites: over.suites ?? [
    { id: "P1", name: "신청" },
    { id: "P2", name: "응시" },
  ],
  layers: over.layers,
  results: over.results ?? [R("QA-1", "P1", "pass"), R("QA-2", "P2", "fail")],
  issues: over.issues,
  nextSteps: over.nextSteps,
});

// ─────────────────────────────────────────── summarize

test("summarize: 스위트별로 묶고 선언 순서를 유지한다", () => {
  const s = summarize(
    fixture({
      suites: [
        { id: "P2", name: "응시" },
        { id: "P1", name: "신청" },
      ],
      results: [R("a", "P1", "pass"), R("b", "P2", "pass"), R("c", "P1", "pass")],
    }),
  );
  assert.deepEqual(
    s.suites.map((x) => x.name),
    ["응시", "신청"],
  );
  assert.equal(s.suites.find((x) => x.id === "P1").items.length, 2);
});

test("summarize: 미선언 스위트는 키를 이름으로 쓰고 뒤로 정렬된다", () => {
  const s = summarize(fixture({ results: [R("a", "미선언", "pass"), R("b", "P1", "pass")] }));
  assert.deepEqual(
    s.suites.map((x) => x.name),
    ["신청", "미선언"],
  );
});

test("summarize: suite 누락 결과는 '기타'로 모인다", () => {
  const s = summarize(fixture({ results: [{ id: "x", status: "pass", title: "t" }] }));
  assert.equal(s.suites[0].name, "기타");
});

test("verdict: fail 이 blocked 보다 우선하고, blocked 는 pass 보다 우선한다", () => {
  const v = (statuses) => summarize(fixture({ results: statuses.map((st, i) => R(`r${i}`, "P1", st)) })).verdict;
  assert.equal(v(["pass", "pass"]), "pass");
  assert.equal(v(["pass", "blocked"]), "blocked");
  assert.equal(v(["pass", "blocked", "fail"]), "fail");
  assert.equal(v(["skip", "skip"]), "skip");
  assert.equal(v(["skip", "pass"]), "pass");
});

test("verdict: 결과가 하나도 없으면 skip", () => {
  const s = summarize(fixture({ results: [] }));
  assert.equal(s.verdict, "skip");
  assert.equal(s.total, 0);
});

test("counts: 4개 상태를 모두 집계한다", () => {
  const s = summarize(
    fixture({ results: ["pass", "pass", "fail", "blocked", "skip"].map((st, i) => R(`r${i}`, "P1", st)) }),
  );
  assert.deepEqual(s.totals, { pass: 2, fail: 1, blocked: 1, skip: 1 });
});

test("알 수 없는 status 는 조용히 넘기지 않고 던진다", () => {
  assert.throws(() => summarize(fixture({ results: [R("x", "P1", "flaky")] })), /알 수 없는 status/);
  // 대소문자는 허용
  assert.doesNotThrow(() => summarize(fixture({ results: [R("x", "P1", "PASS")] })));
});

// ─────────────────────────────────────────── verdict 라벨

test("verdictBadge: 통과가 섞인 blocked 판정은 '부분', 통과 0이면 '검증 불가'", () => {
  assert.equal(verdictBadge("blocked", { pass: 2, fail: 0, blocked: 1, skip: 0 }).label, "부분");
  assert.equal(verdictBadge("blocked", { pass: 0, fail: 0, blocked: 1, skip: 0 }).label, "검증 불가");
  assert.equal(verdictBadge("pass", { pass: 1, fail: 0, blocked: 0, skip: 0 }).label, "PASS");
  assert.equal(verdictBadge("fail", { pass: 0, fail: 1, blocked: 0, skip: 0 }).label, "FAIL");
});

test("verdictBadge: 케이스 상태 라벨은 그대로 유지된다", () => {
  // 개별 케이스는 '검증 불가'로 표기되어야 한다 (판정 라벨과 별개)
  assert.equal(STATUS.blocked.label, "검증 불가");
});

test("리포트 판정 라벨: 부분 통과 스위트가 '부분'으로 렌더된다", () => {
  const data = fixture({
    suites: [{ id: "P1", name: "혼합" }],
    results: [R("a", "P1", "pass"), R("b", "P1", "blocked")],
  });
  assert.match(renderMarkdown(data), /⚠️ 부분/);
  assert.match(renderHtml(data), /⚠️ 부분/);
});

test("리포트 판정 라벨: 전부 blocked 인 스위트는 '검증 불가'", () => {
  const data = fixture({
    suites: [{ id: "P1", name: "전부막힘" }],
    results: [R("a", "P1", "blocked")],
  });
  assert.match(renderMarkdown(data), /⚠️ 검증 불가/);
  assert.doesNotMatch(renderMarkdown(data), /⚠️ 부분/);
});

// ─────────────────────────────────────────── inlineMd (인코딩·이스케이프)

test("inlineMd: HTML 을 먼저 이스케이프한 뒤 최소 마크다운만 되살린다", () => {
  assert.equal(inlineMd("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(inlineMd("**굵게**"), "<strong>굵게</strong>");
  assert.equal(inlineMd("`code`"), "<code>code</code>");
  assert.equal(inlineMd("a\nb"), "a<br>b");
  assert.equal(inlineMd('"q" & \'s\''), "&quot;q&quot; &amp; &#39;s&#39;");
});

test("inlineMd: 마크다운 안의 태그도 이스케이프된 채로 남는다", () => {
  assert.equal(inlineMd("**<b>x</b>**"), "<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
});

// ─────────────────────────────────────────── Markdown

test("markdown: 표 셀 안의 파이프·줄바꿈이 표를 깨뜨리지 않는다", () => {
  const md = renderMarkdown(fixture({ suites: [{ id: "P1", name: "a|b" }], results: [R("x", "P1", "pass")] }));
  const row = md.split("\n").find((l) => l.includes("a\\|b"));
  assert.ok(row, "파이프가 이스케이프되어야 한다");
  // 이스케이프된 파이프를 제거하고 나면 구분자 파이프만 남아야 한다 (6칸 표 = 파이프 7개)
  assert.equal(row.replaceAll("\\|", "").split("|").length - 1, 7);
});

test("markdown: 요약 문단이 없으면 집계로 자동 생성한다", () => {
  const md = renderMarkdown(fixture());
  assert.match(md, /총 2건 중 ✅ 1건 통과/);
  assert.match(md, /❌ 1건 실패/);
});

test("markdown: 요약 문단이 있으면 그대로 쓴다", () => {
  const md = renderMarkdown(fixture({ meta: { summary: "직접 쓴 요약." } }));
  assert.match(md, /직접 쓴 요약\./);
  assert.doesNotMatch(md, /총 2건 중/);
});

test("markdown: 값이 빈 메타 항목은 렌더하지 않는다", () => {
  const md = renderMarkdown(fixture({ meta: { commit: "", target: "   " } }));
  assert.doesNotMatch(md, /\*\*커밋\*\*/);
  assert.doesNotMatch(md, /\*\*대상\*\*/);
});

test("markdown: 이슈가 없으면 섹션을 비우지 않고 명시한다", () => {
  const md = renderMarkdown(fixture());
  assert.match(md, /## 3\. 발견된 이슈/);
  assert.match(md, /발견된 이슈 없음\./);
});

test("markdown: 이슈 severity 를 한국어로 표기하고 미지정도 처리한다", () => {
  const md = renderMarkdown(
    fixture({ issues: [{ severity: "high", title: "A" }, { title: "B" }] }),
  );
  assert.match(md, /\[높음\] A/);
  assert.match(md, /\[미분류\] B/);
});

test("markdown: layers / nextSteps 는 있을 때만 섹션이 생긴다", () => {
  const bare = renderMarkdown(fixture());
  assert.doesNotMatch(bare, /자동화 테스트 레이어/);
  assert.doesNotMatch(bare, /다음 테스트 권장/);

  const with_ = renderMarkdown(
    fixture({
      layers: [{ name: "unit", command: "pnpm vitest run", passed: 84, failed: 0, skipped: 3, durationMs: 12400 }],
      nextSteps: ["자유응시 시험 별도 생성"],
    }),
  );
  assert.match(with_, /자동화 테스트 레이어/);
  assert.match(with_, /`pnpm vitest run`/);
  assert.match(with_, /12\.4s/);
  assert.match(with_, /다음 테스트 권장/);
});

test("markdown: steps / evidence 를 렌더한다", () => {
  const md = renderMarkdown(
    fixture({
      results: [
        R("QA-9", "P1", "pass", {
          steps: ["로그인", "제출"],
          evidence: [{ type: "network", detail: "POST /api/autosave 200 ×26" }, "수동 관찰"],
        }),
      ],
    }),
  );
  assert.match(md, /1\. 로그인/);
  assert.match(md, /2\. 제출/);
  assert.match(md, /\[network\] POST \/api\/autosave 200 ×26/);
  assert.match(md, /- 수동 관찰/);
});

// ─────────────────────────────────────────── HTML

test("html: charset·viewport·lang 을 항상 포함한다 (Windows 인코딩 깨짐 방지)", () => {
  const html = renderHtml(fixture());
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /initial-scale=1/);
});

test("html: 한글이 원문 그대로 살아 있다", () => {
  const html = renderHtml(fixture());
  assert.match(html, /단체 신청 ~ 응시 E2E/);
  assert.match(html, /발견된 이슈/);
  assert.ok(!html.includes("ë¦¬í"), "mojibake 가 없어야 한다");
});

test("html: 외부 리소스를 참조하지 않는다 (오프라인 열람 가능)", () => {
  const html = renderHtml(fixture());
  assert.doesNotMatch(html, /<link[^>]+href=/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /https?:\/\/[^"'\s]*\.(css|js)/i);
});

test("html: 표는 가로 스크롤 컨테이너로 감싼다", () => {
  const html = renderHtml(fixture());
  const tables = html.match(/<table>/g) ?? [];
  const wraps = html.match(/<div class="tw">/g) ?? [];
  assert.equal(tables.length, wraps.length);
  assert.ok(tables.length >= 1);
});

test("html: 라이트/다크 양쪽을 스타일한다", () => {
  const html = renderHtml(fixture());
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /\[data-theme=dark\]/);
  assert.match(html, /\[data-theme=light\]/);
});

test("html: 결과 제목에 상태 아이콘이, 카드에 상태 클래스가 붙는다", () => {
  const html = renderHtml(fixture());
  assert.match(html, /<div class="case pass">/);
  assert.match(html, /<div class="case fail">/);
  assert.ok(html.includes(STATUS.fail.icon));
});

test("html: 사용자 입력이 마크업으로 새지 않는다", () => {
  const html = renderHtml(
    fixture({
      results: [R("x", "P1", "pass", { title: "<img src=x onerror=alert(1)>" })],
      issues: [{ severity: "low", title: "</style><script>bad()</script>" }],
    }),
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>bad\(\)/);
  assert.match(html, /&lt;img src=x/);
});

test("html + markdown: 같은 판정을 낸다", () => {
  const data = fixture({ results: ["pass", "blocked"].map((st, i) => R(`r${i}`, "P1", st)) });
  assert.equal(summarize(data).verdict, "blocked");
  assert.match(renderMarkdown(data), /검증 불가/);
  assert.match(renderHtml(data), /st-blocked/);
});
