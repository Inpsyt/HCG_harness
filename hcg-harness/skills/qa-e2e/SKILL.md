---
name: qa-e2e
description: hcg-harness 와 연결해 QA 를 수행하는 스킬(하네스 없이 어떤 프로젝트에서도 동작) — 코드에서 라우트·API·권한 게이트를 탐색해 시나리오 카탈로그(SCENARIOS.md)를 만들고, 단위/통합 테스트 러너와 브라우저 E2E(Claude for Chrome · Playwright MCP · 로컬 Playwright)를 실행한 뒤 HTML + Markdown 리포트를 산출한다. Node(Next.js·React·Express·Fastify·NestJS)·Java(Spring Boot)·Python(FastAPI·Django·Flask)·PHP(Laravel·Symfony) 사전정의 + 미지 스택 폴백. "QA 해줘", "E2E 테스트", "테스트 시나리오 만들어줘", "전 페이지 점검", "QA 리포트", "브라우저로 확인해줘" 류에 사용.
---
> **출처**: 독립 저장소 `qa-e2e-skill` 의 `qa-e2e/` 사본. **정본은 그쪽이고 여기는 번들 복사본이다.**
> **재동기화**: 정본 갱신 시 `qa-e2e/` 를 이 폴더로 재복사하고 이 헤더 블록만 다시 적용한다
> (frontmatter 는 동일하므로 손대지 않는다). 수정은 항상 정본에서 하고 여기로 내려보낸다.
> (동일 패턴: `ui-standard` 스킬)


# qa-e2e — 범용 QA / E2E 실행 스킬

**주 사용처는 hcg-harness 플러그인이다** — `/hcg-harness:qa` 커맨드와 `qa-agent` 가 진입점이고,
`verification-ladder` 의 rung-3(runnable smoke)를 이 스킬이 채운다. **다만 하드 의존은 없다**:
`contracts/`·phase 파일·`.claude/project.md` 가 없는 외부 프로젝트에서도 그대로 동작한다.
있으면 기대값 기준으로 쓰고, 없으면 코드만 본다 (§하네스 접점).

**이 문서는 얇다.** 깊이는 전부 `references/` 에 있고, 아래 라우팅 표대로 **필요한 것만** 읽는다.
전부 미리 읽지 않는다.

---

## 안전 규칙 (여기만 강제)

이 4개만 hard rule 이다. **나머지는 전부 기본값을 제안하는 가이드**이며 사용자가 뒤집을 수 있다.

1. **대상 확인.** 시작 전 base URL 이 로컬/스테이징인지 확인한다. 운영 도메인(실사용자 트래픽)이면
   **멈추고 확인받는다.** 운영에서는 조회조차 개인정보 노출이므로 지양하고, 생성·수정·삭제·결제·
   환불은 절대 하지 않는다.
2. **자격증명 대리입력 금지.** 비밀번호·OTP·결제정보는 대신 입력하지 않는다. 로그인 화면까지
   이동하고 비민감 필드(전화번호·학번·검색어)만 채운 뒤 인증은 사용자에게 넘긴다.
   dev 우회 수단(빠른 로그인 버튼, 고정 OTP)이 있으면 그걸 먼저 안내한다.
3. **파괴적 액션은 사전 확인.** 삭제·환불·전체취소·초기화·마이그레이션은 실행 직전에 한 번 확인받는다.
4. **실 PII·자격증명 보호.** 화면에 실제 사용자 실명·연락처가 뜨면 스크린샷을 저장하지 않고,
   리포트에 실명을 쓰지 않는다(역할·ID 로 대체). **토큰·세션 쿠키·`Authorization` 헤더·쿼리스트링
   비밀값은 증거에 남기지 않는다** — `<redacted>` 로 치환한다. 리포트는 공유되는 문서다.

---

## 5단계 루프

| 단계 | 하는 일 | 읽을 것 | 남는 파일 |
|---|---|---|---|
| **0 TARGET** | base URL·범위 확인, 위 안전 규칙 적용 | (이 문서) | — |
| **1 DETECT** | 언어·프레임워크·러너·기동 명령·앱 진입점 확정 | `references/_detect.md` → `references/stacks/<lang>.md` | `qa/context.json` |
| **2 DISCOVER** | 라우트·페이지·API·권한 게이트 인벤토리 | `references/discovery.md` | `qa/inventory.json` |
| **3 PLAN** | 시나리오 카탈로그 작성(기존 문서 있으면 병합) | `references/scenarios.md` | **`qa/SCENARIOS.md`** |
| **4 RUN** | 러너 실행 + 브라우저 E2E 실행, 결과 누적 | `references/drivers/_choose.md` → 해당 드라이버 | `qa/results.json` |
| **5 REPORT** | 렌더 | `references/reporting.md` | **`qa/report.md` + `qa/report.html`** |

산출물 루트는 기본 `qa/` (프로젝트 루트 기준). 사용자가 다른 경로를 주면 그걸 쓴다.

**커밋 규약** — `qa/SCENARIOS.md` 는 커밋할 자산이다. `qa/.tmp/`(인증 상태·임시 스크립트)와
`qa/shots/`(스크린샷)는 **커밋하지 않는다** — 세션 쿠키와 PII 가 들어간다. 첫 실행 때 `.gitignore`
항목을 제안한다. 상세는 `references/reporting.md` §산출물 취급.

### 단계별 요지

**0 TARGET** — 대상 URL, **레이어**, 범위, 시간 예산을 먼저 합의한다.

- **레이어** — `unit` · `integration` · `e2e` 중 이번에 돌 것. **기본은 전부.** 사용자가 "단위만",
  "E2E만" 처럼 지정하면 그것만 돈다. 안 돈 레이어는 조용히 빼지 말고 리포트에 명시한다
- **범위** — 스모크(★만) / 특정 플로우 / 전체. "전체"면 3단계에서 스위트를 나누고 순서를 제시한다
- **이어하기** — `qa/results.json` 이 이미 있으면 새로 시작하지 않는다. 대상 동일성을 확인하고
  남은 시나리오부터 재개한다 (`references/reporting.md` §이어하기)

**1 DETECT** — 스택을 **추측하지 말고 파일 마커로 판정**한다. 판정 결과와 근거(어떤 파일을 보고
그렇게 판단했는지)를 `qa/context.json` 에 남긴다. 모노레포면 어느 워크스페이스가 대상인지도.

**2 DISCOVER** — 코드를 읽어 인벤토리를 만든다. 이 단계의 출력이 커버리지의 상한이므로 여기서
빠진 페이지는 영원히 테스트되지 않는다. `contracts/api-spec.md`·OpenAPI·라우트 파일이 있으면 쓴다.

**3 PLAN** — 인벤토리를 시나리오로 바꾼다. 기존 시나리오 문서(`docs/E2E_*.md` 등)가 있으면
**덮어쓰지 말고 병합**하고, 기존 ID 를 보존한다. 실행 전에 사용자에게 스위트 목록을 보여준다.

**4 RUN** — **0단계에서 합의한 레이어만** 돈다. 기본은 전부:
- **러너 레이어** (`unit`·`integration`): 스택의 테스트 명령을 실행하고 집계를 `layers[]` 에 기록
- **E2E 레이어** (`e2e`): 드라이버로 시나리오를 실행

뺀 레이어는 리포트에 남긴다 — 해당 시나리오를 `skip` 으로 두고 "이번 범위 밖"을 사유로 적는다.
**환경 때문에 못 돈 것과 사용자가 뺀 것을 구분한다** (전자는 `blocked`, 후자는 `skip`).

**케이스 하나가 끝날 때마다 `qa/results.json` 에 append 한다.** 세션이 컨텍스트를 다 써도
리포트가 나오게 하는 유일한 장치다. 마지막에 몰아서 쓰지 않는다.

**5 REPORT** — 직접 HTML 을 쓰지 않는다. 렌더러를 돌린다:

```bash
node "<이 스킬 폴더>/scripts/render-report.mjs" qa/results.json
# 플러그인 경로 형태: ${CLAUDE_PLUGIN_ROOT}/skills/qa-e2e/scripts/render-report.mjs
```

`qa/report.md` 와 `qa/report.html` 이 같은 데이터에서 함께 나온다. 인코딩(UTF-8)·집계·레이아웃이
실행마다 동일해진다. 리포트 문구를 손보고 싶으면 `results.json` 을 고치고 다시 렌더한다.

---

## 라우팅 표 — 언제 무엇을 읽나

| 상황 | 읽을 파일 |
|---|---|
| 스택을 아직 모른다 | `references/_detect.md` |
| Node/TS 프로젝트 (Next.js·React·Express·Fastify·NestJS) | `references/stacks/node.md` |
| Java 프로젝트 (Spring Boot·Jakarta) | `references/stacks/java.md` |
| Python 프로젝트 (FastAPI·Django·Flask) | `references/stacks/python.md` |
| PHP 프로젝트 (Laravel·Symfony·CodeIgniter) | `references/stacks/php.md` |
| 위 어디에도 없는 스택 | `references/_detect.md` §미지 스택 폴백 |
| 어떤 드라이버로 브라우저를 몰지 정해야 한다 | `references/drivers/_choose.md` |
| Claude for Chrome 으로 몬다 | `references/drivers/claude-for-chrome.md` |
| Playwright MCP 로 몬다 | `references/drivers/playwright-mcp.md` |
| MCP 없이 로컬 Playwright 로 몬다 | `references/drivers/playwright-local.md` |
| 인벤토리를 뽑는다 | `references/discovery.md` |
| 시나리오를 쓴다 / ID 를 붙인다 | `references/scenarios.md` + `assets/SCENARIOS-template.md` |
| results.json 스키마·상태값·리포트 규약 | `references/reporting.md` |

---

## 결과 상태 4종

| 상태 | 뜻 |
|---|---|
| `pass` | 기대대로 동작함을 **관찰**했다 |
| `fail` | 기대와 다르게 동작했다 |
| `blocked` | 환경·구조 제약으로 **검증 자체가 불가**했다 (시간창 마감, 계정 없음, 드라이버 불가) |
| `skip` | 범위 밖이라 의도적으로 건너뛰었다 |

`blocked` 를 `fail` 로 뭉개거나 조용히 생략하지 않는다. "왜 못 봤는지"가 리포트의 가치다.

---

## 원칙

- **본 것만 쓴다.** 화면·네트워크·서버 응답으로 확인한 것만 `pass` 다. 코드를 읽고 "될 것 같다"는
  `pass` 가 아니다. 확인 못 한 건 `blocked` 로 남기고 이유를 적는다.
- **증거를 붙인다.** 네트워크 응답(`POST /api/x 200 ×26`), 화면 문구, 스크린샷 경로. 리포트의
  신뢰도는 전부 여기서 나온다.
- **실패해도 계속 간다.** 케이스 하나가 깨졌다고 멈추지 않는다. 기록하고 다음 스위트로 넘어가되,
  선행 케이스 실패로 뒤 케이스가 무의미해졌으면 그건 `blocked` 로 표시한다.
- **자동화 조작에 주의.** 빠른 JS 클릭·DOM 직접 조작은 앱의 부정행위 감지·이탈 감지·rate limit 을
  건드려 **테스트가 앱을 오염시킬** 수 있다. 실제 UI 클릭 위주로, 사람이 쓰는 속도로 조작한다.
- **범위를 줄이는 건 사용자 결정.** 시간이 모자라면 임의로 잘라내지 말고, 남은 것을 `skip` 으로
  명시하고 무엇이 빠졌는지 리포트에 적는다.

## 하네스 접점 (있을 때만)

- `verification-ladder` 의 **rung-3(runnable smoke)** 를 이 스킬이 채운다. rung-1/2(테스트·타입·빌드)는
  4단계의 러너 레이어에 해당한다.
- `contracts/api-spec.md`·`contracts/design-guide.md` 가 있으면 2단계 DISCOVER 의 추가 입력이자
  기대값 기준이 된다. 없으면 코드만 본다.
- 발견 이슈를 `tasks/TODO.md` 에 넘길지는 사용자에게 확인한다(하네스 프로젝트일 때만 의미 있음).
