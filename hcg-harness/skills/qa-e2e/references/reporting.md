# 4-5 RUN / REPORT — results.json 과 리포트

`qa/results.json` 이 **유일한 SSOT** 다. 리포트는 여기서 파생될 뿐이다.

---

## 규칙 1 — 케이스마다 즉시 append

시나리오 하나가 끝날 때마다 `qa/results.json` 의 `results[]` 에 추가한다.
**마지막에 몰아서 쓰지 않는다.** 긴 QA 세션이 컨텍스트를 다 써도 리포트가 나오게 하는 유일한 장치다.

시작 시점에 `meta` + 빈 `results: []` 로 파일을 먼저 만든다.

## 규칙 2 — 본 것만 pass

`pass` 는 **관찰**의 결과다. 코드를 읽고 "될 것 같다"는 `pass` 가 아니다.

## 규칙 3 — HTML 을 손으로 쓰지 않는다

```bash
node "<스킬 폴더>/scripts/render-report.mjs" qa/results.json
# → qa/report.md, qa/report.html
# 옵션: --out-dir DIR (기본: results.json 이 있는 디렉터리), --quiet
```

문구를 고치고 싶으면 `results.json` 을 고치고 다시 렌더한다. 렌더러가 인코딩(UTF-8)·집계·
레이아웃·XSS 이스케이프를 책임진다.

---

## 스키마

```json
{
  "meta": {
    "project":  "CBT 2026",
    "title":    "단체 신청 ~ 응시 ~ 감독 ~ 어드민 E2E",
    "baseUrl":  "http://localhost:3000",
    "env":      "local-dev",
    "target":   "#0097 (간호사 · 1회차 · 온라인 · 단체 · 2명)",
    "commit":   "a1b2c3d",
    "driver":   "claude-for-chrome",
    "stack":    { "language": "node", "framework": "next-app-router",
                  "unitRunner": "vitest", "e2eRunner": "playwright" },
    "startedAt":  "2026-07-27T10:00:00+09:00",
    "finishedAt": "2026-07-27T13:21:19+09:00",
    "accounts": [
      { "role": "학생", "id": "qa0002", "note": "로그인/OTP/비밀번호는 사용자가 직접 수행" }
    ],
    "summary":  "선택. 비우면 집계로 자동 생성된다.",
    "extra":    { "임의 라벨": "임의 값" }
  },

  "layers": [
    { "name": "unit", "command": "pnpm vitest run",
      "passed": 84, "failed": 0, "skipped": 3, "durationMs": 12400, "note": "" },
    { "name": "typecheck", "command": "pnpm tsc --noEmit",
      "passed": 1, "failed": 0, "durationMs": 8100, "note": "에러 0" }
  ],

  "suites": [
    { "id": "P1", "name": "단체 신청 / 신청내역 조회", "note": "선택" }
  ],

  "results": [
    {
      "id": "QA-1",
      "suite": "P1",
      "title": "결제 금액 = 응시료 × 인원",
      "status": "pass",
      "expected": "확인 화면 총액이 30,000 × 2 = 60,000원",
      "actual": "60,000원 표기",
      "steps": ["직종 간호사 선택", "수험생 2명 등록", "확인 화면 진입"],
      "evidence": [
        { "type": "network", "detail": "POST /api/applications 200" },
        { "type": "screen",  "detail": "총 결제금액 60,000원" },
        { "type": "screenshot", "path": "qa/shots/QA-1.png" }
      ],
      "note": ""
    }
  ],

  "issues": [
    { "severity": "high",
      "title": "어드민 시험 배지가 학생 화면 상태와 불일치",
      "repro": "학생은 '응시 가능', 어드민 목록 배지는 '채점중'",
      "expected": "두 화면이 같은 phase 를 표기",
      "actual": "배지만 채점중",
      "refs": ["QA-5"] }
  ],

  "nextSteps": ["자유응시(FREE_PERIOD) 시험을 별도 생성해 전 교시 즉시 응시까지 검증"]
}
```

### 필수 / 선택

| 필드 | 필수 | 비고 |
|---|---|---|
| `meta` | 권장 | 전부 비어도 렌더는 되지만 리포트가 빈약해진다 |
| `results[].status` | **필수** | `pass`·`fail`·`blocked`·`skip` 만. 다른 값이면 렌더러가 던진다 |
| `results[].title` | 권장 | |
| `results[].suite` | 권장 | 없으면 "기타"로 모인다 |
| `suites` | 선택 | 있으면 리포트의 스위트 **순서**를 결정한다 |
| `layers` | 선택 | 있을 때만 "자동화 테스트 레이어" 표가 생긴다 |
| `issues` | 선택 | 없으면 "발견된 이슈 없음"으로 명시된다 |
| `nextSteps` | 선택 | 있을 때만 섹션이 생긴다 |

값이 빈 메타 항목은 렌더에서 자동으로 빠진다 — 모르는 필드를 억지로 채우지 않는다.

---

## 상태 4종

| 상태 | 뜻 | 판정 |
|---|---|---|
| `pass` | 기대대로 동작함을 관찰 | ✅ |
| `fail` | 기대와 다르게 동작 | ❌ — 스위트를 FAIL 로 만든다 |
| `blocked` | 환경·구조 제약으로 **검증 자체가 불가** | ⚠️ — fail 이 없으면 스위트는 "부분" |
| `skip` | 범위 밖이라 의도적으로 건너뜀 | ⏭ |

**`blocked` 를 `fail` 로 뭉개지 않는다.** "감독관 시간창이 이미 마감돼 입장 자체가 불가"는 버그가
아니라 검증 불가다. 이유를 `actual`·`note` 에 반드시 적는다 — "왜 못 봤는지"가 리포트의 가치다.

스위트 판정 우선순위: **fail > blocked > pass > skip**.

## evidence 타입

| type | detail 예시 |
|---|---|
| `network` | `POST /api/student/autosave 200 ×26 (실패 0)` |
| `screen` | `모달 문구: 입장 불가 — 시험이 종료되어…` |
| `server` | `GET /api/student/autosave?periodId=304 → 답안 키 105개` |
| `console` | `Uncaught TypeError: … at page-3f2.js:14` |
| `screenshot` | `path` 필드 사용. **실 PII 가 보이면 저장하지 않는다** |
| `test` | `vitest: 84 passed, 3 skipped` |

**네트워크 증거를 최우선으로 모은다.** 화면만 보면 "저장된 것처럼 보였다"와 "저장됐다"를 구분할 수 없다.

---

## 리포트 구조 (렌더러 출력)

1. 헤더 메타 (작성일·환경·대상·드라이버·스택·계정)
2. **1. 요약** — 문단 + 스위트별 집계표(통과/실패/검증불가/스킵/판정) + 전체 행 + 자동화 레이어 표
3. **2. 스위트별 상세** — 케이스마다 기대/실제/단계/증거/비고
4. **3. 발견된 이슈** — 심각도·재현·기대·실제·관련 ID
5. **4. 다음 테스트 권장**
6. 푸터

HTML 은 인라인 CSS 단일 파일이라 외부 네트워크 없이 열린다. 라이트/다크 모두 스타일되고,
표는 가로 스크롤 컨테이너 안에서만 넘친다.

---

## 마지막에 할 것

1. 렌더 실행
2. **생성된 `qa/report.md` 를 실제로 읽어 확인한다** — 집계가 실제 실행과 맞는지, `blocked` 사유가
   비어 있지 않은지
3. 사용자에게 두 파일 경로 + 한 줄 판정을 알린다
4. `skip` 이 있으면 무엇을 왜 안 돌았는지 명시한다. 조용히 넘어가지 않는다
