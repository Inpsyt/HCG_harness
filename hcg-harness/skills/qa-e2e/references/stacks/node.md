# Stack — Node / TypeScript

Next.js · React SPA · Express · Fastify · NestJS · Koa · Hono

---

## 1. 프레임워크 판별

`package.json` 의 dependencies 를 본다. 모노레포면 **워크스페이스의** package.json 이다.

| 마커 | 프레임워크 | 라우팅 |
|---|---|---|
| `next` + `app/` 디렉터리에 `page.tsx` | **Next.js App Router** | 파일시스템 |
| `next` + `pages/` 디렉터리 | **Next.js Pages Router** | 파일시스템 |
| `react` + `vite` (next 없음) | React SPA (Vite) | 선언형 |
| `react-scripts` | React SPA (CRA, 레거시) | 선언형 |
| `@nestjs/core` | NestJS | 데코레이터 |
| `express` | Express | 명령형 |
| `fastify` | Fastify | 명령형 |
| `koa` / `hono` | Koa / Hono | 명령형 |
| `nuxt` / `@sveltejs/kit` | Nuxt / SvelteKit | 파일시스템 |

패키지 매니저: `pnpm-lock.yaml` → pnpm · `yarn.lock` → yarn · `bun.lockb` → bun · 그 외 npm.
**락파일이 정답이다.** 다른 매니저로 돌리면 설치가 꼬인다.

## 2. 앱 기동

`package.json` 의 `scripts` 가 정답이다. 추측하지 말고 읽는다.

```bash
# 관례
pnpm dev            # Next/Vite dev 서버
pnpm --filter web dev              # pnpm 모노레포
npm run start:dev                  # NestJS 관례
node dist/main.js                  # 빌드 산출물
```

의존 서비스(DB·Redis)는 `docker-compose.yml` 또는 `.env*` 의 접속 문자열로 확인한다.
헬스 엔드포인트(`/api/health`)가 있으면 그걸로 준비 완료를 판정한다.

**dev 서버는 이미 떠 있을 수 있다.** 먼저 `curl` 로 확인하고, 사용자가 띄운 서버를 재시작하지 않는다.

## 3. 단위 테스트

| 마커 | 러너 | 명령 |
|---|---|---|
| `vitest` | Vitest | `pnpm vitest run` (watch 금지 — `run` 필수) |
| `jest` | Jest | `pnpm jest --ci` |
| `node:test` 만 사용 | Node 내장 | `node --test` |
| `mocha` | Mocha | `pnpm mocha` |

- **watch 모드로 띄우지 않는다.** 세션이 붙잡힌다. Vitest 는 `run`, Jest 는 `--ci`
- 커버리지가 필요하면 `--coverage`. 없으면 굳이 켜지 않는다(느려짐)
- 타입 체크는 별도 레이어다: `tsc --noEmit`
- 컴포넌트 테스트는 `@testing-library/react`. `jsdom`/`happy-dom` 환경 설정이 vitest config 에 있어야 한다

`layers[]` 에 unit·typecheck·lint 를 각각 기록한다.

## 4. 통합 / API 테스트

| 대상 | 방법 |
|---|---|
| Express/Fastify/Nest 핸들러 | `supertest` (`request(app).get('/x').expect(200)`) |
| NestJS | `@nestjs/testing` 의 `Test.createTestingModule` + supertest |
| Next.js Route Handler | 함수를 직접 import 해 `Request` 를 넘기거나, dev 서버에 `fetch` |
| 실행 중인 서버 | `curl` / `fetch` — E2E 중 증거 수집으로도 쓴다 |

**API 를 직접 때리는 게 E2E 의 증거원이다.** 화면이 "저장됐습니다"라고 해도 서버에 실제로 들어갔는지는
GET 으로 되읽어야 안다.

## 5. E2E 진입 시 주의점

### Next.js App Router
- **라우트 탐색**: `app/**/page.tsx` = 페이지, `app/**/route.ts` = API.
  `(group)` 은 URL 에 안 나타나고, `[id]`/`[...slug]` 는 동적, `_folder` 는 라우트 아님
- **`middleware.ts` 를 반드시 읽는다.** 인증 리다이렉트·IP 화이트리스트·rewrite 가 전부 여기 있다.
  운영형 환경에서 관리자 페이지가 **404** 로 뜨면 라우트 없음이 아니라 미들웨어 차단인 경우가 많다
- **Server Component 는 브라우저에서만 검증 가능**하다. 단위 테스트로 렌더할 수 없으므로 E2E 가
  유일한 검증 경로다 — 커버리지 배분에서 여기에 비중을 둔다
- **Server Action** 은 네트워크 탭에 POST(같은 URL, `Next-Action` 헤더)로 보인다. 폼 제출 검증 시 이걸 본다
- 개발 모드는 첫 진입이 느리다(온디맨드 컴파일). **첫 로드 타임아웃을 넉넉히** 잡고, 그걸 성능 이슈로 오인하지 않는다
- `next dev` 의 Fast Refresh 로 인한 콘솔 경고는 이슈가 아니다

### Next.js Pages Router
- `pages/**/*.tsx` = 페이지 (`_app`·`_document`·`_error` 제외), `pages/api/**` = API

### React SPA
- 클라이언트 라우팅이라 **직접 URL 진입이 404 가 나면** 서버 fallback 설정 문제다(앱 버그와 구분)
- 라우트 정의: `grep -rn "createBrowserRouter\|<Route " src/`

### NestJS / Express / Fastify (API 전용)
- 웹 UI 가 없으면 E2E 레이어는 `skip`. Swagger UI(`/api`, `/docs`)가 있으면 그걸 화면 표면으로 쓴다
- 라우트 탐색: NestJS 는 `@Controller`/`@Get`/`@Post` grep, Express 는 `app.get(`/`router.` grep

## 6. 흔한 함정

- **`.env` 여러 개.** `.env.local` > `.env.development` > `.env` 순으로 덮인다. baseUrl·DB 가
  예상과 다른 곳을 보고 있을 수 있다. 실제 로드된 값을 헬스 엔드포인트나 로그로 확인한다
- **모노레포 경로.** 명령을 루트에서 돌리면 아무것도 안 된다. `--filter` 나 워크스페이스 cd 필수
- **포트 충돌.** 3000 이 이미 다른 프로젝트일 수 있다. 응답 내용으로 대상 앱이 맞는지 확인한다
- **`dev` 전용 우회.** dev 에서만 켜지는 인증 스킵·rate limit 해제·동시접속 체크 스킵이 흔하다.
  **dev 에서 못 만드는 현상은 운영 빌드(`build && start`)로만 재현된다** — 그런 시나리오는 그 사실을
  명시하고 `blocked` 로 두거나 별도 빌드로 확인한다
- **Prisma/ORM 마이그레이션.** `prisma db push` 류는 데이터를 날릴 수 있다. QA 준비 명목으로
  임의 실행하지 않는다
- **Windows.** 경로 구분자·줄바꿈(CRLF)·`NODE_OPTIONS` 문법이 다르다. 스크립트가 sh 전제면 Git Bash 로 돈다
