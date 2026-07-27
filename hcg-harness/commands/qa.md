---
description: 브라우저 E2E + 단위/통합 테스트를 실행하고 HTML·Markdown QA 리포트를 산출
---

# /hcg-harness:qa

`qa-e2e` 스킬의 얇은 진입점이다. **절차의 정본은 스킬**이고 이 커맨드는 인자를 정리해 넘길 뿐이다.

## 인자

`$ARGUMENTS` 를 아래로 해석한다. 전부 선택이다.

| 형태 | 뜻 |
|---|---|
| URL (`http://localhost:3000`) | 대상 base URL |
| `--scope=smoke` | ★ 항목만 (기본은 사용자와 합의) |
| `--scope=full` | 전체 스위트 |
| `--scope=<자유 텍스트>` | 특정 플로우만 (예: `--scope=결제~환불`) |
| `--driver=chrome\|playwright-mcp\|playwright-local` | 드라이버 고정 (기본: 자동 판별) |
| `--out=<경로>` | 산출물 디렉터리 (기본 `qa/`) |
| 그 외 텍스트 | 범위 설명으로 취급 |

## 절차

1. **`qa-e2e` 스킬을 호출한다.** 위에서 파싱한 값을 그대로 전달한다.
2. 스킬의 5단계 루프(TARGET → DETECT → DISCOVER → PLAN → RUN → REPORT)를 따른다.
3. base URL 이 인자로 안 왔으면 **DETECT 단계에서 판정한 뒤 사용자에게 확인받는다.**
   운영 도메인이면 멈춘다.
4. 실행 전 SCENARIOS 요약(스위트별 항목 수 · 사용자 입력 필요 지점 · 파괴적 액션 · 예상 blocked)을
   제시하고 범위를 확정받는다.

## 산출물

| 파일 | 내용 |
|---|---|
| `qa/SCENARIOS.md` | 시나리오 카탈로그 — 프로젝트에 누적되는 자산 |
| `qa/results.json` | 실행 결과 SSOT (케이스마다 append) |
| `qa/report.md` · `qa/report.html` | 렌더러 산출 리포트 |

## 마칠 때

두 리포트 파일 경로 + 한 줄 판정(전체 통과/실패/부분)을 알리고, `skip`·`blocked` 가 있으면
무엇을 왜 못 돌았는지 명시한다.
