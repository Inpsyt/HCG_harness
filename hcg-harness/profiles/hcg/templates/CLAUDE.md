# {{PROJECT_NAME}}

> 소비 프로젝트의 `CLAUDE.md` 템플릿. 루트(`./CLAUDE.md`)에 두고 `<...>` 를 채운다.
> 두 부분으로 구성된다: **PROJECT 섹션**(이 프로젝트 고유 — 포인터만) + **HARNESS 코어 import**(포터블 방법론, 무수정).

## PROJECT (이 프로젝트 고유)

- **정체성·스택·경로·계약·도메인 스킬**: `.claude/project.md` 를 단일 출처로 한다 (인스턴스 슬롯). 여기 값을 복제하지 말고 그 파일을 가리킨다.
- **도메인 규칙**(정렬·코드·검색 우선순위 등): `.claude/skills/<domain>/SKILL.md`.
- **주요 명령**(빌드/테스트/lint): `<예: npm run dev / npm run build / npm test / npm run lint>`
{{CODEX_CLAUDE_LINE}}

## 공통 방법론 (HARNESS)

@.claude/CLAUDE-core.md
