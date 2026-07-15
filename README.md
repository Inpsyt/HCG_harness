# HCG Harness

HCG 프로젝트를 위한 포터블 멀티에이전트 **개발 하네스**. Claude Code 플러그인으로 패키징되어
있다. 프로세스 방법론과 HCG 표준 스택 컨벤션을 함께 싣고 있어, 새 프로젝트는 **인스턴스 슬롯
하나**(`.claude/project.md`) + 도메인 스킬만 채우면 전체 파이프라인을 얻는다 — 하네스 재작성 불필요.

기존 in-repo 하네스에서 추출해 **HCG 표준 스택**(Next.js App Router · MariaDB + Prisma ·
TanStack Query / Zustand / React Hook Form / Zod · Vitest + Playwright · feature-centric 구조)에
맞춰 재정렬했다.

## 구성

```
hcg_harness/                         # 레포 = 단일 플러그인 마켓플레이스
├─ .claude-plugin/marketplace.json   # hcg-harness-marketplace
├─ hcg-harness/                      # 플러그인 (hcg-harness)
│  ├─ .claude-plugin/plugin.json
│  ├─ CLAUDE-core.md                 # HARNESS 방법론 코어 (pipeline · fast-path · Operating Rules §0–§5)
│  ├─ agents/                        # 5개 generic 역할 shell: plan · qa · db · backend · front
│  ├─ commands/                      # init · upgrade  (호출: /hcg-harness:init · :upgrade)
│  ├─ skills/
│  │  ├─ pipeline-phase · codex-review · verification-ladder · contract-authoring  # 프로세스 (스택 중립)
│  │  └─ db- · backend- · frontend-conventions                                     # HCG 표준 스택
│  ├─ hooks/                         # PreToolUse(계약+파괴가드) · PostToolUse(lint) · SessionStart(컨텍스트) · Stop(phase-gate) (+런처 · *.test.mjs)
│  ├─ profiles/hcg/                  # profile.json + templates (HCG 표준 스택 초기 파일)
│  ├─ scripts/bootstrap.mjs          # 부트스트랩 엔진 (토큰 치환 · init · upgrade)
│  └─ workflows/                     # audit · migrate · test-gen · review · converge (dynamic-mode 템플릿)
├─ templates/project.md              # 인스턴스 슬롯 템플릿 (HCG 기본값)
└─ docs/
   ├─ install.md                     # 설치 + 슬롯 채우기 가이드
   └─ portable-instance-boundary.md  # 포터블 vs 프로젝트별 분리
```

## 모델

- **포터블** (이 패키지): pipeline ①–⑥, fast-path 게이트 + MoSCoW 범위 규율, verification ladder,
  codex 리뷰 게이트, 계약 쓰기잠금 + 파괴명령 가드(PreToolUse), HCG 표준 db/backend/frontend 컨벤션.
- **프로젝트별** (소비 레포): `.claude/project.md`(단일 슬롯), 도메인 스킬, `contracts/*`, 앱 코드.

5개 agent shell은 **generic·de-instanced 템플릿** — 프로젝트 도메인 문자열을 담지 않고,
소비 프로젝트가 작성하는 `project.md`와 도메인 스킬을 가리킨다.

---

## 자동 부트스트랩 (`/hcg-harness:init` · `/hcg-harness:upgrade`)

새 프로젝트를 시작하는 권장 방식이다.

**요구사항(최소)**: Node.js 22+ (npm 10+ 동봉, 별도 설치 불요) · git · Claude Code CLI. **배포 서버 표준 스펙(HCG 규정): node 22.13.0 · npm 10.9.2 · pm2 7.0.3** — HCG 프로파일의 패키지 매니저는 npm(파이프라인이 소스에서 `npm ci` 설치), 잠금파일은 `package-lock.json`(커밋 대상). 생성 앱은 engines(node>=22/npm>=10) + `.npmrc`(engine-strict) + preinstall 가드(`only-allow npm` — pnpm/yarn 설치 차단)로 표준을 기계 강제한다. DB(MariaDB/MySQL)는 앱을 실제 DB에 연결·마이그레이션할 때만 필요(부트스트랩·빌드엔 불요).

**설치 → 부트스트랩 → 환경세팅 순서** (빈 폴더 기준):

**① 터미널 — 마켓플레이스 추가 + 플러그인 설치 (최초 1회)**
```bash
claude plugin marketplace add Inpsyt/HCG_harness          # git 소스(배포·타 PC). 로컬 개발이면: claude plugin marketplace add <hcg_harness 폴더 경로>
claude plugin install hcg-harness@hcg-harness-marketplace
claude plugin list                                        # 확인: hcg-harness ✔ enabled
```

**② 빈 프로젝트 폴더에서 새 세션 열기** → SessionStart가 *"아직 부트스트랩 안 됨 → `/hcg-harness:init` 실행"* 안내를 주입.

**③ 세션에서 부트스트랩 실행**
```
/hcg-harness:init
```
→ 프레임워크(HCG 기본)·프로젝트명·앱 레이아웃·codex 리뷰 게이트 사용 여부를 묻고 → 하네스 레이어 + 최소 앱 골격 생성 + 마커 기록 → setup 명령 안내(실행은 사용자 몫).

**④ 터미널 — 안내된 setup 명령 실행 (생성된 앱 디렉터리에서)**
```bash
cd apps/web
npm install                   # package-lock.json 생성 — 커밋 대상(CI npm ci 가 요구)
npx prisma generate
npx playwright install
npm run dev                   # http://localhost:3000
```

**재적용**(템플릿 갱신)은 세션에서 `/hcg-harness:upgrade`. (마켓플레이스가 git 소스면 먼저 `claude plugin marketplace update hcg-harness-marketplace`로 최신 커밋 반영.)

**핵심 결정**
- 생성 범위: 하네스 레이어 + **최소** 앱 골격(데모 없음) + setup 명령 **안내**(자동 실행 안 함)
- 프레임워크 선택: 선택 인프라는 처음부터, v1은 **HCG 프로파일 1개**만 동봉
- 확장: 프레임워크 추가 = `profiles/<id>/` 디렉터리 1개 추가 (코어 코드 무수정)
- 트리거: `/hcg-harness:init` 커맨드 + SessionStart 감지기 (플러그인 제약상 "설치 즉시 실행"은 불가)
- agent 바인딩: 5개 shell을 `.claude/agents/`로 복사 후 frontmatter 바인딩 (자족성·자동로딩)
- 생성 엔진: 얇은 커맨드 + `scripts/bootstrap.mjs`(단순 토큰 치환·결정적·테스트 대상)
- 재적용: **`/hcg-harness:upgrade`** — 마커+매니페스트(해시) 기반으로 사용자 수정은 보존하며 하네스
  관리 파일만 안전 재생성 (복사 방식의 drift 해소책)

---

## 플러그인 업데이트 (이미 쓰고 있는 프로젝트)

이 레포에 새 버전이 푸시되어도 소비 프로젝트에 **자동 반영되지 않는다**. 실무 프로젝트마다 아래 순서로 갱신한다.

**① 터미널 — 마켓플레이스 갱신 + 플러그인 업데이트**
```bash
claude plugin marketplace update hcg-harness-marketplace   # 마켓플레이스 소스(git/로컬) 최신화
claude plugin update hcg-harness                           # 또는 세션에서 /plugin 메뉴 → 업데이트
claude plugin list                                         # 확인: hcg-harness 새 버전
```

**② 세션 재시작** — 플러그인이 서빙하는 스킬·훅·에이전트·커맨드·워크플로는 새 세션부터 새 버전으로 동작한다.

**③ (템플릿 변경이 포함된 릴리스면) 프로젝트 파일 재동기화**
```
/hcg-harness:upgrade
```
`/hcg-harness:init`으로 프로젝트 안에 이미 생성된 하네스 관리 파일은 플러그인 업데이트만으로는 바뀌지 않는다. `upgrade`가 마커+매니페스트(해시) 기반으로 사용자 수정은 보존하고 하네스 관리 파일만 재생성한다(충돌 시 `.new`로 생성).

> **배포 측 규칙**: 내용 변경을 푸시할 때는 `plugin.json` · `marketplace.json`의 `version`을 반드시 올린다. 버전이 그대로면 소비 측에서 "이미 최신"으로 판단해 업데이트가 감지되지 않을 수 있다.

---

## 수동 설치 (대안)

기존 프로젝트에 하네스를 얹거나 자동 부트스트랩 없이 설치할 때의 방법이다.

```bash
claude plugin marketplace add <path-to>/hcg_harness
claude plugin install hcg-harness@hcg-harness-marketplace
# 이후: templates/project.md → .claude/project.md 복사 후 작성
```

전체 단계(copy-only 폴백 + 인스턴스 슬롯 작성 포함): **`docs/install.md`**.

## 스택 커스터마이징

`*-conventions` 스킬이 HCG 표준 스택을 인코딩한다. 프로젝트가 갈라지면(다른 ORM·DB·상태·테스트
라이브러리 — 예: Vitest/Playwright 교체) 이 세 스킬을 수정한다 — 스택 방법론이 사는 단일 지점이다.
경로와 도메인 규칙은 스킬에 넣지 않는다. `.claude/project.md`와 도메인 스킬에 넣는다.

## 워크플로 (동적 모드 fan-out)

긴밀히 결합된 기능은 정적 파이프라인(`plan → db/be/fe → qa`)으로 가지만, 일이 **독립적·대량·발견형**일
때는 아래 5개 워크플로(fan-out 레시피)를 쓴다. 모두 **Scope/Discover → 병렬 fan-out → 적대적 검증
→ 종합** 골격에 **fail-closed**(degraded면 거짓 통과 대신 `incomplete`/`fail`)이며, `workflows/`
폴더에서 자동 발견된다. 호출: `Workflow({ name, args })`. 프로젝트 고유값은 `args` +
`.claude/project.md` + 소스의 `// CUSTOMIZE` 자리로 주입한다. (상세: `hcg-harness/workflows/README.md`.)

| 워크플로 | 목적 | 쓰기 | 사용법 (`args`) |
|---|---|---|---|
| `audit` | 다차원 코드 진단(보안·성능·a11y·데드코드·타입 등) → 중복제거·심각도 정렬 리포트 | ❌ 읽기전용(`Explore`) | `Workflow({ name:'audit', args:'<범위 또는 차원 목록>' })` |
| `review` | 변경분(diff/PR) 다차원 리뷰 → `gating`/`non-gating`(codex D9) 분리 → **PASS/FAIL 게이트** | ❌ 읽기전용 | `Workflow({ name:'review', args:'<diff 범위 \| PR \| 파일 스코프>' })` |
| `converge` | `contracts/` SSOT ↔ 코드 **드리프트** 검출 → 요구사항별 satisfied/partial/missing/contradicts → **제안 태스크**(직접 안 씀) | ❌ 읽기전용 | `Workflow({ name:'converge', args:'<선택 스코프, 예 db-schema,api-spec>' })` |
| `migrate` | 대량 코드모드(API 리네임·의존성 범프 등) → 파일별 worktree 격리 변환 + 집계 게이트 | ✅ 격리 쓰기 | `Workflow({ name:'migrate', args:'<glob> :: <변경 지시>' })` |
| `test-gen` | 모듈별 단위 테스트 백필 → worktree 격리 생성 + 그 모듈 스위트 실행 | ✅ 격리 쓰기 | `Workflow({ name:'test-gen', args:'<모듈 glob> :: <프레임워크/규약>' })` |

- **읽기전용 3종**(`audit`·`review`·`converge`)은 `agentType:'Explore'`로 파일 편집이 런타임 차단된다(셸 변경은 권고 수준).
- **쓰기 2종**(`migrate`·`test-gen`)은 git worktree 격리 + 파일 소유 분리로 병렬 충돌을 막는다. merge-back은 `// CUSTOMIZE` 시임이라 소비 프로젝트가 배선한다.
- 이들은 **검증된 출발점 템플릿**이지 완성된 codemod/test 엔진이 아니다 — 게이트 명령·merge-back·캡 등은 프로젝트가 customizing·재검증한다(`workflows/README.md` §6).
- 워크플로 기능은 소비 프로젝트에서 활성화돼 있어야 한다(`disableWorkflows` / env `CLAUDE_CODE_DISABLE_WORKFLOWS`로 게이트).

---

## 변경 이력

### 0.1.5 — 2026-07-15

기존 프로젝트는 `apps/web/package.json` 이 user-owned 이므로 preinstall 가드·engines 를 수동 반영한다.

- **배포 서버 표준 스펙 명시 (HCG 규정)**: node 22.13.0 · npm 10.9.2 · pm2 7.0.3 — README·install.md §0 요구사항에 명문화. 생성 앱 engines 를 배포 타깃에 맞춰 `node>=22`(npm>=10 유지)로 상향.
- **npm 전용 이중 가드**: 생성 `package.json` 에 ① `"packageManager": "npm@10.9.2"`(배포 서버 npm 버전 고정 — pnpm 10 이 설치 시도 시 **아무것도 만들기 전에** 즉시 거부, 실측 검증) + ② preinstall `npx only-allow npm`(packageManager 필드를 무시하는 yarn 1.x 등 차단, 심층 방어 — 단 pnpm 은 preinstall 을 설치 후 실행하므로 ①이 1차 가드). 습관적 `pnpm install` 이 조용히 성공해 잠금·node_modules 를 오염시키는 함정 제거. `.npmrc` engine-strict 와 함께 npm 표준을 기계 강제.
- **버전 표기 동기화**: 0.1.5 (프로파일 0.1.3).

### 0.1.4 — 2026-07-15

기존 설치 프로젝트는 플러그인 업데이트(①·②) 후 ③ `/hcg-harness:upgrade` 권장 — managed 파일(CI·에이전트·스킬)의 npm 전환이 전파된다. **user-owned 파일은 수동 이관 필요**: `apps/web/package.json` engines(`npm>=10`), `.npmrc`(`engine-strict=true`) 추가, `pnpm-lock.yaml` 삭제 후 `npm install`로 `package-lock.json` 생성·커밋.

- **패키지 매니저 npm 전환 (pnpm → npm)**: 배포 파이프라인 규정(npm · 소스에서 설치)에 맞춰 HCG 프로파일 전환. `profile.json`(packageManager·setupCommands `npm install`/`npx …`) · CI 템플릿(`npm ci` + `package-lock.json` 캐시, pnpm/action-setup 제거) · codex 게이트 호출 규약(`npm run codex:review -- <base_sha>` — npm 은 인자 전달에 `--` 필요) · doctor 잠금 센티널(`package-lock.json`) · playwright webServer(`npm run dev`) 일괄 갱신.
- **engines 가드 강제 유지**: npm 은 engines 를 경고만 하므로 생성 앱에 `.npmrc`(`engine-strict=true`)를 동봉해 pnpm 시절의 버전 가드 강제성을 보존. engines 는 `node>=20` / `npm>=10`.
- **버전 표기 동기화**: 0.1.4 (프로파일 0.1.2).

### 0.1.3 — 2026-07-10

기존 설치 프로젝트는 플러그인 업데이트(①·②) 후 ③ `/hcg-harness:upgrade` 권장 — 에이전트 정의(managed)의 모델 고정 해제가 전파된다.

- **모델 고정 해제(`model: inherit`)**: 에이전트 5종 frontmatter 의 `opus`/`sonnet` 고정을 `inherit`(세션 모델 상속)로 교체 — 상위 모델 세션에서 서브에이전트가 구세대 모델로 강등되던 제약 제거. CLAUDE-core fast-path 의 "동급(Opus)" 규칙을 상대 티어 문구(**구현자와 같은 티어 이상**)로, project.md 「모델 배정」을 템플릿 기본값에서 **인스턴스 결정 슬롯**으로 전환(하위 티어 고정은 프로젝트별 선택).
- **harness doctor 슬림 v1**: `scripts/doctor.mjs` — marker(부트스트랩)·version-skew·layout·stale-sentinel(잠금 꺼짐)·codex-wiring(opt-out 인지)·ci·toolchain·placeholders 8종 진단, error 시 exit 1. `docs/install.md` §3 결정론 항목의 기계화(훅 발화 실측 등 라이브 항목은 수동 유지).
- **버전 표기 동기화**: 0.1.3.

### 0.1.2 — 2026-07-10

기존 설치 프로젝트는 위 **플러그인 업데이트** 절차로 반영한다(①·② 필수, init 템플릿 변경 포함이므로 부트스트랩된 프로젝트는 ③ `/hcg-harness:upgrade` 권장 — CI 워크플로가 새로 생성된다).

- **CI 이중화**: init 템플릿에 `.github/workflows/ci.yml` 렌더 — core(lint/tsc/test/build) + contract-drift(prisma validate·migrate diff `--exit-code`) 잡, E2E(MariaDB 서비스 컨테이너) 잡은 주석 opt-in. 에이전트의 수기 검증 기록(phase-meta)과 기계 재검증을 이중화한다. 플러그인 repo 자체에도 훅·bootstrap 테스트 CI 추가(ubuntu+windows 매트릭스).
- **contracts-guard G3 (셸 쓰기 차단)**: `echo x > contracts/…`·`tee`·in-place `sed`·`rm/mv/touch`·`cp`(dest)·PS `Set-Content` 류의 셸 쓰기를 Edit 와 동일 잠금으로 거부 — G1 의 가장 뻔한 우회를 폐쇄. PreToolUse matcher 에 `PowerShell` 추가, G2 에 `Remove-Item -Recurse -Force` 루트 패턴 추가.
- **세션 중 계약 잠금 해제 — 센티널**: `.claude/contracts-unlock` 파일 존재 = 해제. hook env 는 기동 시 고정이라 plan 역할이 세션 중 스스로 해제(생성)·재잠금(삭제)할 수 있는 유일한 경로. 기동 시 `HARNESS_CONTRACTS_WRITE=1` 은 대안으로 유지.
- **서브에이전트 훅 발화 실측**: PreToolUse 가 서브에이전트 tool call 에도 발화함을 실측 확인(2026-07-10, Windows·플러그인 훅) — contracts lock 이 위협 모델의 핵심인 구현 서브에이전트를 실제로 커버. `docs/install.md` §3 · `docs/portable-instance-boundary.md` 에 기록.
- **fix — userOwnedGlobs 토큰화**: `renderProfile` 이 `userOwnedGlobs` 에도 `{{APP_DIR}}` 등 토큰을 치환하고, hcg 프로파일 glob 을 `apps/web/**` → `{{APP_DIR}}/**` 로 교체(프로파일 0.1.1). 종전에는 init 에서 appDir 를 기본값과 다르게 고르면 앱 파일이 managed 로 잘못 분류되어 upgrade 가 사용자 앱 코드를 덮어쓸 수 있었다. 토큰 없는 리터럴 glob 은 종전대로 동작.
- **버전 표기 동기화**: `plugin.json` · `marketplace.json` · `package.json` · bootstrap 마커 fallback 을 0.1.2로 통일.

### 0.1.1 — 2026-07-07

0.1.0 표기 이후 누적된 변경분 릴리스. 기존 설치 프로젝트는 위 **플러그인 업데이트** 절차로 반영한다(①·②는 필수, 이번 릴리스는 init 템플릿 변경을 포함하므로 부트스트랩된 프로젝트는 ③ `/hcg-harness:upgrade`도 권장).

- **설계 승인 체크포인트(①.5)**: pipeline에 plan 완료 → 사용자 설계 승인 → 구현 dispatch 순서를 강제. 승인 전 구현 에이전트 투입 금지.
- **AX UI 표준 통합**: init이 AX 스킬 4종을 자동 설치(`install-ax`)하고, 내장 `ui-standard` 스킬 + `contracts/design-guide` 시드를 제공.
- **codex 리뷰 게이트 opt-in/out**: init에서 사용 여부를 선택. `--no-codex` 시 codex 관련 파일 렌더 제외, 선택이 마커에 기록되어 upgrade에도 지속, 게이트/훅이 opt-out을 인지.
- **engines 가드**: 생성되는 `package.json`에 `node>=20` / `pnpm>=9` 명시.
- **버전 표기 동기화**: `plugin.json` · `marketplace.json` · `package.json` · bootstrap 마커 fallback을 0.1.1로 통일.

### 0.1.0 — 2026-06-24

초기 릴리스 — 포터블 하네스(5 agent shell · 프로세스/스택 스킬 · 4 hooks · 5 workflows) + `/hcg-harness:init` · `:upgrade` 자동 부트스트랩(HCG 프로파일).
