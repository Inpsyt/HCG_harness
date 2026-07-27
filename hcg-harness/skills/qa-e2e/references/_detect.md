# 1 DETECT — 스택 판정

목표: **추측하지 말고 파일 마커로** 언어·프레임워크·테스트 러너·기동 명령·앱 진입점을 확정하고
근거와 함께 `qa/context.json` 에 남긴다.

---

## 절차

### 1. 저장소 형태부터

```bash
ls -a                      # 루트 마커
cat package.json 2>/dev/null | head -40
```

**모노레포 판정** — 아래 중 하나라도 있으면 모노레포다. **어느 워크스페이스가 QA 대상인지 먼저 정한다.**

| 마커 | 도구 |
|---|---|
| `pnpm-workspace.yaml` | pnpm workspaces |
| `package.json` 의 `workspaces` | npm/yarn workspaces |
| `turbo.json` / `nx.json` / `lerna.json` | Turborepo / Nx / Lerna |
| `apps/*` + `packages/*` 디렉터리 | 관례적 모노레포 |

> HCG 표준 프로젝트는 웹앱이 **`apps/web`** 에 있다. `apps/web/package.json` 이 보이면 거기가 대상이다.
> 명령도 전부 그 디렉터리 기준으로 잡는다.

### 2. 언어 판정 — 루트 마커

| 마커 파일 | 언어 | 읽을 다음 문서 |
|---|---|---|
| `package.json` | Node/TypeScript | `stacks/node.md` |
| `pom.xml` / `build.gradle(.kts)` | Java/Kotlin | `stacks/java.md` |
| `pyproject.toml` / `requirements.txt` / `Pipfile` / `setup.py` | Python | `stacks/python.md` |
| `composer.json` | PHP | `stacks/php.md` |
| 위 중 둘 이상 | 폴리글랏 — **각각 판정**하고 QA 대상 서비스를 사용자와 정한다 | 해당 문서들 |
| 아무것도 없음 | §미지 스택 폴백 | (아래) |

### 3. 프레임워크·러너 판정

해당 `stacks/<lang>.md` 의 **§프레임워크 판별** 표를 따른다. 각 문서는 동일한 6슬롯 구조다:

1. 프레임워크 판별 마커
2. 앱 기동 명령
3. 단위 테스트 (러너·명령·관례)
4. 통합/API 테스트
5. E2E 진입 시 주의점
6. 흔한 함정

### 4. 앱이 실제로 뜨는지 확인

**기동 명령을 안다고 뜨는 게 아니다.** 반드시 확인한다:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' <baseUrl>
curl -sS <baseUrl>/api/health 2>/dev/null | head -5   # 있으면
```

- 이미 떠 있으면 그대로 쓴다 (**사용자가 띄워둔 서버를 임의로 재시작하지 않는다**)
- 안 떠 있으면 기동 명령을 **사용자에게 제안**하고 실행 여부를 확인받는다. 백그라운드로 띄웠으면
  누가 띄웠는지 기록하고 끝나고 정리한다
- DB·Redis 등 의존 서비스가 필요한 스택이면 그것도 확인한다(헬스 엔드포인트 우선)

### 5. 자격증명·시드 데이터 확인

E2E 는 로그인 없이는 대부분 시작도 못 한다. **PLAN 단계 전에** 확인한다:

- 시드 스크립트가 있는가 (`prisma/seed.ts`, `db/seeds`, `fixtures/`, 관리 명령)
- **시드 계정이 실제로 DB 에 있는가** — 문서에 적힌 계정이 실제와 다른 경우가 흔하다.
  운영 덤프를 임포트한 개발 DB 면 시드 계정이 아예 없을 수 있다
- dev 전용 우회 수단이 있는가 (빠른 로그인 버튼, 고정 OTP, 인증 스킵 플래그)
- 없으면 **사용자에게 계정을 요청**한다. 만들어 내지 않는다

> 시드를 재실행하기 전에 반드시 확인받는다. 기존 데이터를 날릴 수 있다.

---

## qa/context.json

```json
{
  "target":   { "baseUrl": "http://localhost:3000", "env": "local-dev", "scope": "smoke|full|<플로우명>",
                "layers": ["unit", "integration", "e2e"] },
  "repo":     { "root": ".", "monorepo": "pnpm", "workspace": "apps/web" },
  "stack":    { "language": "node", "framework": "next-app-router",
                "unitRunner": "vitest", "e2eRunner": "playwright",
                "evidence": ["apps/web/package.json: next@15, vitest", "app/ 디렉터리 존재"] },
  "commands": { "dev": "pnpm --filter web dev", "unit": "pnpm --filter web vitest run",
                "typecheck": "pnpm --filter web tsc --noEmit", "e2e": "pnpm --filter web playwright test" },
  "server":   { "alreadyRunning": true, "startedByUs": false, "health": "/api/health" },
  "auth":     { "seedAvailable": true, "devBypass": "학생 로그인 페이지의 빠른 로그인 버튼",
                "accountsFrom": "사용자 제공", "note": "OTP·비번은 사용자가 직접 입력" },
  "driver":   "claude-for-chrome"
}
```

`evidence` 를 비우지 않는다. 나중에 판정이 틀렸을 때 어디를 고칠지 알려주는 유일한 단서다.

---

## 미지 스택 폴백

사전정의 4종에 없는 스택(Go, Rust, Ruby, .NET, Elixir, Flutter …)이면 **스킬을 포기하지 않는다.**
같은 6슬롯을 직접 채운다:

1. **기동** — README / Makefile / `docker-compose.yml` / CI 워크플로(`.github/workflows/*.yml`)를 읽는다.
   CI 는 "이 프로젝트를 어떻게 빌드·테스트하는가"의 가장 정확한 문서다
2. **테스트 러너** — CI 워크플로의 test 스텝이 정답이다. 없으면 언어 기본값
   (`go test ./...` · `cargo test` · `bundle exec rspec` · `dotnet test` · `mix test` · `flutter test`)
3. **라우트 탐색** — `discovery.md` 의 §언어 무관 폴백을 쓴다
4. **E2E** — 브라우저 드라이버는 언어와 무관하다. `drivers/_choose.md` 가 그대로 적용된다
5. 판정 근거를 `evidence` 에 남기고, 리포트 메타의 `stack` 에 "미지 스택 — CI 기준" 이라고 명시한다

**웹 UI 가 없는 프로젝트**(CLI·라이브러리·배치)면 E2E 레이어를 `blocked` 가 아니라 `skip` 으로 두고
(범위 밖이므로) 러너 레이어 + CLI 스모크만 수행한다. 리포트에 그 사실을 적는다.
