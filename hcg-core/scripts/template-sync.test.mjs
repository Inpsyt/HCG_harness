// 플러그인 루트본 ↔ 프로파일 템플릿본 동기화 가드.
//
// 왜 필요한가 (2026-08-10 실사고):
//   `CLAUDE-core.md` 와 `agents/task-agent.md` 는 **두 벌 존재**한다 — 플러그인 루트본(문서·정본)
//   과 `profiles/hcg/templates/.claude/` 템플릿본(실제로 프로젝트에 렌더되는 것). 방법론을
//   개정하면서 루트본만 고치면 **개정이 프로젝트에 도달하지 않는다**. 실제로 hcg-core 개정
//   작업에서 `task-agent.md` 가 이 경로로 어긋난 채 커밋됐고, 사람 눈으로 발견했다.
//
// 규칙: **frontmatter 를 제외한 본문은 바이트 동일**해야 한다.
//   템플릿본은 frontmatter 에 프로젝트 스킬 바인딩(`{{PROJECT_SLUG}}-domain` 등)을 더 갖는
//   것이 정상이므로 frontmatter 는 비교 대상에서 뺀다. 본문에 토큰이 필요해지면 이 테스트가
//   실패하는데, 그때는 "왜 본문이 갈라져야 하는가"를 먼저 답해야 한다(대개는 실수다).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, "..");
const TEMPLATE_CLAUDE_DIR = path.join(PLUGIN, "profiles", "hcg", "templates", ".claude");

/** 루트본 상대경로 → 템플릿본(.claude 기준) 상대경로. */
const PAIRS = [
  ["CLAUDE-core.md", "CLAUDE-core.md"],
  ["agents/task-agent.md", "agents/task-agent.md"],
];

/** YAML frontmatter(선두 `---` 블록)를 떼어낸 본문. frontmatter 가 없으면 원문 그대로. */
export function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  const nl = text.indexOf("\n", end + 1);
  return nl === -1 ? "" : text.slice(nl + 1);
}

test("stripFrontmatter — frontmatter 만 제거하고 본문은 보존한다", () => {
  assert.equal(stripFrontmatter("---\nname: x\n---\nbody\n"), "body\n");
  assert.equal(stripFrontmatter("no frontmatter\n"), "no frontmatter\n");
  // 본문 안의 `---`(수평선)은 종료 펜스로 오인하지 않는다
  assert.equal(stripFrontmatter("---\na: 1\n---\nintro\n\n---\n\nmore\n"), "intro\n\n---\n\nmore\n");
});

for (const [rootRel, tplRel] of PAIRS) {
  test(`두 벌 동기: ${rootRel} — frontmatter 제외 본문 동일`, () => {
    const rootPath = path.join(PLUGIN, rootRel);
    const tplPath = path.join(TEMPLATE_CLAUDE_DIR, tplRel);
    assert.ok(existsSync(rootPath), `루트본 없음: ${rootPath}`);
    assert.ok(existsSync(tplPath), `템플릿본 없음: ${tplPath}`);

    const rootBody = stripFrontmatter(readFileSync(rootPath, "utf8"));
    const tplBody = stripFrontmatter(readFileSync(tplPath, "utf8"));

    assert.equal(
      tplBody,
      rootBody,
      `${rootRel} 의 루트본과 템플릿본 본문이 다릅니다. 프로젝트에 렌더되는 것은 ` +
        `templates/.claude/${tplRel} 이므로, 루트본만 고치면 개정이 프로젝트에 도달하지 않습니다. ` +
        `양쪽을 맞추세요(본문이 의도적으로 갈라져야 한다면 이 테스트의 PAIRS 를 조정).`,
    );
  });
}

test("PAIRS 가 템플릿의 중복 후보를 모두 덮는다", () => {
  // 템플릿 .claude 에 있으면서 플러그인 루트에도 같은 상대경로로 존재하는 파일은 전부 PAIRS 에
  // 있어야 한다 — 새 중복 파일이 추가되면 여기서 걸린다.
  const candidates = ["CLAUDE-core.md", "agents/task-agent.md", "project.md", "settings.json"];
  const covered = new Set(PAIRS.map(([r]) => r));
  for (const rel of candidates) {
    const bothExist =
      existsSync(path.join(PLUGIN, rel)) && existsSync(path.join(TEMPLATE_CLAUDE_DIR, rel));
    if (bothExist) {
      assert.ok(covered.has(rel), `루트·템플릿 양쪽에 있는 ${rel} 이 PAIRS 에 없습니다`);
    }
  }
});
