# Driver — 로컬 Playwright (MCP 없음)

Node 로 Playwright 스크립트를 직접 돌린다. Chrome 확장도 MCP 도 없을 때의 경로.

**강점**: 어디서든 돈다(CI 포함). 재현 가능하고, 원하면 회귀 자산으로 남길 수 있다.
**약점**: 스크립트를 써야 하고 실패 시 디버깅이 간접적이다. 인증은 여전히 문제.

---

## 준비

```bash
npx playwright --version                 # 있으면 그대로 사용
ls node_modules/.bin/playwright          # 프로젝트에 이미 있는지
```

없으면 설치를 **제안하고 확인받는다** (프로젝트 의존성을 건드리는 일이다):

```bash
npm i -D @playwright/test && npx playwright install chromium
# 프로젝트를 건드리기 싫으면 임시 디렉터리에서:
npx --yes playwright@latest install chromium
```

프로젝트에 `playwright.config.ts` 가 이미 있으면 **그 설정을 존중한다** (baseURL·프로젝트·리포터).

## 두 가지 사용법

### (a) 탐색용 일회성 스크립트 — 기본

시나리오를 확인하는 목적. **스크립트는 스크래치 영역에 쓰고 프로젝트를 오염시키지 않는다.**

```js
// qa/.tmp/run-S6.mjs
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false })   // 눈으로 봐야 하면 headless:false
const ctx = await browser.newContext()
const page = await ctx.newPage()

const net = []
page.on('request', r => net.push(`${r.method()} ${r.url()}`))
page.on('response', r => net.push(`← ${r.status()} ${r.url()}`))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()) })

await page.goto('http://localhost:3000/student/exams')
await page.getByRole('button', { name: '시험 시작' }).click()
await page.getByText('응시자 정보').waitFor()

console.log(await page.title())
console.log(net.filter(l => l.includes('/api/')).join('\n'))   // ← 증거
await browser.close()
```

```bash
node qa/.tmp/run-S6.mjs
```

- `headless: false` 로 두면 사람이 화면을 볼 수 있어 인증 개입이 가능하다
- `slowMo: 200` 을 주면 앱의 이탈 감지·rate limit 오탐을 줄인다
- 네트워크 로그를 **반드시 수집한다** — 이 드라이버에서 증거를 얻는 주 경로다

### (b) 회귀 spec 으로 남기기 — 사용자가 요청할 때만

통과한 플로우를 `.spec.ts` 로 남기면 다음 회차부터 자동화된다. 단 **프로젝트의 테스트 규약에
침범**하므로 기본 동작이 아니다. 남길 때는:

- 프로젝트의 기존 e2e 디렉터리 구조·명명을 따른다
- 시나리오 ID 를 테스트 이름에 넣는다 (`test('S6 응시 전체 흐름', ...)`)
- 시드 데이터 의존을 명시한다

## 인증

`playwright-mcp.md` §인증 처리와 동일하다. 추가로 이 드라이버에서만 가능한 것:

**storageState 재사용** — 한 번 로그인한 상태를 저장해 이후 실행에서 건너뛴다.

```js
await ctx.storageState({ path: 'qa/.tmp/auth-student.json' })       // 저장
const ctx2 = await browser.newContext({ storageState: 'qa/.tmp/auth-student.json' })  // 재사용
```

> **함정**: `storageState` 는 **쿠키와 localStorage 만** 복원한다. 세션을 `sessionStorage` 에
> 두는 앱은 복원되지 않아 로그인이 유지되지 않는다. `discovery.md` §3 에서 확인한 저장소가
> sessionStorage 면 이 방법을 쓸 수 없다.

인증 상태 파일은 **자격증명이 든 파일**이다. 커밋하지 않고 QA 후 지운다.

## 조작 주의

- 셀렉터는 `getByRole` / `getByLabel` / `getByText` 우선. CSS 클래스 해시는 쉽게 깨진다
- `page.waitForTimeout` 대신 `waitFor` / `expect(...).toBeVisible()` 조건 대기
- `page.evaluate` 로 DOM 을 직접 조작하지 않는다 — 앱의 감지 로직을 우회하거나 오탐을 만든다
- 실패 시 진단: `await page.screenshot({ path: 'qa/shots/fail.png' })` + 현재 URL + 콘솔 로그

## 정리

- 임시 스크립트·storageState·트레이스는 `qa/.tmp/` 에 두고 QA 후 지운다
- 설치한 것이 있으면 사용자에게 알린다 (`@playwright/test` 를 devDependencies 에 추가했다 등)
- 백그라운드로 띄운 브라우저·dev 서버를 남기지 않는다

## 이 드라이버에서 흔한 함정

- **브라우저 바이너리 미설치** — `npx playwright install chromium` 필요. 첫 실행에서만 오래 걸린다
- **headless 와 headed 의 동작 차이** — 일부 앱은 headless 를 탐지하거나 폰트/레이아웃이 달라진다.
  화면 검증이 목적이면 `headless: false`
- **Windows 경로** — 스크립트에 하드코딩한 `/` 경로가 안 맞을 수 있다. `path.join` 을 쓴다
- **좀비 프로세스** — `browser.close()` 를 빠뜨리면 Chromium 이 남는다. try/finally 로 감싼다
- **프로젝트 config 무시** — 프로젝트에 `playwright.config.ts` 가 있는데 `playwright` 를 직접
  import 하면 baseURL·타임아웃 설정이 적용되지 않는다. 의도한 것인지 확인한다
