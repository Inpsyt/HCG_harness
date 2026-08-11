# HCG Harness

**Claude Code 가 HCG 표준대로 일하게 만드는 하네스.** 새 프로젝트에 플러그인 하나를 설치하면
방법론·스택 컨벤션·계약 규약·검증 규율이 프로젝트 안으로 들어온다. 사람이 바뀌어도, 세션이
끊겨도, 같은 방식으로 일한다.

```bash
claude plugin marketplace add Inpsyt/HCG_harness
claude plugin install hcg-core@hcg-harness-marketplace
# 프로젝트 폴더에서 새 세션 → /hcg-core:init
```

플러그인은 **2개**를 서빙하고, 프로젝트당 **하나만** 설치한다.

| | 성격 | 대상 |
|---|---|---|
| **`hcg-core`** 0.1.1 | **기본** — 세션이 직접 일하고, 필요할 때만 병렬화한다 | **신규 프로젝트 전부** |
| `hcg-harness` 0.3.0 | 레거시(파이프라인) — 지금은 **hcg-core 로 넘어가는 다리** 역할만 | 기존 레거시 프로젝트의 이행 전용 |

---

## 1. 이 하네스가 해주는 일

### 프로젝트의 "일하는 방식"이 코드와 함께 산다

설치하면 프로젝트에 이런 것들이 생긴다(30개 파일, `/hcg-core:init`):

```
CLAUDE.md                     # 세션이 매번 읽는 진입점
.claude/
  CLAUDE-core.md              # 방법론 — 진행 vs 질문, 단순성, 수술적 변경, 검증 사다리
  project.md                  # ★ 인스턴스 슬롯 — 이 프로젝트의 스택·경로·도메인·운영 규모
  agents/task-agent.md        # 풀스택 Task 실행 에이전트
  skills/                     # 도메인 규칙 · E2E 규약
contracts/                    # ★ 공유 계약서 (SSOT)
  db-schema.md · api-spec.md · shared-types.ts · design-guide.md
apps/web/                     # 앱 골격 (선택 — 기존 앱이 있으면 --no-app)
```

핵심은 **★ 두 개**다. `project.md` 하나만 채우면 나머지는 포터블하게 재사용되고,
`contracts/` 가 "무엇을 만들기로 했는가"의 단일 출처가 된다.

### 어떤 작업이든 같은 길로 흐른다

| 하려는 일 | 어디로 가는가 |
|---|---|
| 기능 하나·버그 수정 (대부분) | 세션이 **직접** 수행 + 검증 사다리 |
| 서로 독립적인 Task 여러 개 | `parallel-tasks` — 결합도 판정 후 병렬 실행 |
| 대량 반복 작업(코드모드·테스트 백필) | `migrate` · `test-gen` 워크플로 |
| 계약 ↔ 코드가 어긋났는지 점검 | `converge` 워크플로 |
| 고위험 변경의 교차 검증 | `codex-review` (외부 모델, 온디맨드) |

### 검증을 "했다"가 아니라 "증명한다"

작업마다 **가능한 가장 강한 방법**으로 검증한다 — ① 자동화 테스트 ② 타입·린트·빌드
③ 실행 스모크 ④ 명시 수용기준. 여기에 실측으로 얻은 규칙 두 개가 붙는다:

- **모킹한 경계는 테스트가 증명하지 못한다** — DB 트랜잭션·파일 IO·문서 생성·외부 어댑터를
  모킹했다면 **한 번은 실물로** 돌린다.
- **개발 데이터로는 성능을 알 수 없다** — 목록·집계·문서 생성은 `project.md` 「운영 규모」의
  실제 규모로 재보고 **초 단위로 보고**한다.

### 비개발자도 결과를 판단할 수 있다

완료 보고가 개발 용어가 아니라 **판단 가능한 문장**으로 나온다:

```
## 확인한 것
✅ 기능 — 테스트 315개 전부 통과
⚠️ 속도 — 지불증 만들기가 10.7초 걸립니다

   버튼을 누르고 10초를 기다려야 해서 "멈춘 것 같다"는 반응이 나올 수준입니다.
   원인: PDF 글꼴을 압축된 형태로 넣어둬서 만들 때마다 압축을 푸느라 시간이 걸립니다.
   개선 여지가 있습니다. 지금은 그대로 두고 진행했으니 고칠지 알려주세요.
```

"N+1 쿼리가 있습니다"에는 아무 조치도 못 하지만 **"이 화면 10.7초"는 누구나 이상하다고 안다.**
그래서 근거 없는 공수 추정("반나절이면 됩니다")과 지킬 수 없는 약속("1초로 줄어듭니다")은
**금지**하고, 원인만 사람 말로 설명한다.

### 끊겨도 이어서 한다

장시간 무인 작업이 **모델 사용량 한도로 끊기면 다른 모델로 자동 재개**한다
(`scripts/run-headless.mjs`, [§5](#5-무인-실행)). 그리고 검증을 통과한 단위마다 커밋하므로,
어디서 끊겨도 git 이 인수인계 원장이 된다.

---

## 2. 왜 파이프라인을 걷어냈나 (hcg-core 의 근거)

레거시 `hcg-harness` 는 **역할 5종 파이프라인**이었다 — 기획 에이전트가 Task 를 쪼개
DB·백엔드·프론트 에이전트에 나눠주고, QA 에이전트가 검사하고, 외부 모델 게이트를 통과해야
Phase 가 닫혔다. 약한 모델을 여러 역할로 나눠 보정하던 2023–26년 초기형 설계다.

**2026-08-07, 같은 기능정의서를 두 하네스에 던져 실측했다**(동일 코드베이스·동일 모델·동일 프롬프트):

| | 레거시 파이프라인 | **hcg-core** |
|---|---:|---:|
| 소요 시간 | 3시간 31분 | **1시간 2분** (3.4배 빠름) |
| 비용 | $213.91 | **$86.52** (2.5배 저렴) |
| 스펙 검증 기준 6개 | 6/6 통과 | **6/6 통과** (동률) |
| 구현 중 만든 치명 결함 | **3건** (직접 수정) | **0건** |
| 재현 가능한 E2E 테스트 | 0건 추가 | **7건 추가** |

**품질은 동률인데 3.4배 느리고 2.5배 비쌌다.** 그 시간의 상당 부분은 파이프라인이 *자기가 만든
결함을 되돌리는 데* 썼다 — 빌드 실패, 지불증 생성 전면 500, 계약 위반. hcg-core 는 그 결함들을
애초에 만들지 않았다.

원인은 **컨텍스트 분절**이었다. 역할이 갈릴 때마다 앞 단계의 판단이 마크다운 문서로 압축돼
넘어가고, 다음 에이전트는 그 요약만 받는다. 결함을 발견하는 QA 는 코드를 쓴 시점에서 몇 시간
떨어져 있다. hcg-core 는 **쓰는 사람이 바로 검증**한다.

> **다만 걷어내지 않은 것**: 파이프라인의 *검증 장치*는 값을 했다. 실서버 스모크가 단위 테스트
> 470건이 놓친 치명 결함을 잡았고, 외부 모델 리뷰가 내부 리뷰가 놓친 계약 위반을 잡았다.
> 그래서 그 둘은 **게이트가 아니라 조건부 규칙으로** hcg-core 에 흡수했다(§1 검증 절).
> 교훈은 "검증을 없애라"가 아니라 **"검증을 별도 단계가 아니라 작성 시점으로 옮겨라"** 였다.

### 설계 원칙 — 무엇을 넣고 무엇을 빼는가

- **hobble**(제거 대상) = 필요 여부와 무관하게 **매번** 내는 비용. 상시 게이트·역할 분절·
  Phase 부기·모델 강등·모든 도구 호출에 붙는 훅.
- **가드레일**(유지) = **되돌리기 어려운 지점에서만** 발동. 스키마·계약·auth·결제·외부 부작용.

즉 **"규칙 없음"이 아니라 "무조건성 없음"** 이다. 그래서 hcg-core 의 규칙은 대부분 조건부다 —
해당하지 않으면 비용이 0 이다.

---

## 3. 구성

```
hcg-core/
├─ CLAUDE-core.md          # 방법론 (60줄) — 작업 라우팅 + Operating Rules §0~§5
├─ agents/task-agent.md    # 풀스택 Task 실행 에이전트 1종 (역할 분할 없음)
├─ commands/               # /hcg-core:init · :upgrade
├─ skills/                 # 7종
│  ├─ parallel-tasks           # Task-축 병렬화 절차
│  ├─ verification-ladder      # 검증 사다리 + 실측 보고 형식
│  ├─ contract-authoring       # contracts/ 작성 규약
│  ├─ codex-review             # 외부 교차모델 리뷰 (온디맨드)
│  └─ db- · backend- · frontend-conventions   # HCG 표준 스택
├─ workflows/              # migrate · test-gen · converge
├─ hooks/                  # SessionStart 1종 (부트스트랩 상태 안내)
├─ profiles/hcg/           # 프로파일 + 템플릿 (init 이 렌더하는 30개 파일)
└─ scripts/
   ├─ bootstrap.mjs        # init · upgrade 엔진
   └─ run-headless.mjs     # 무인 실행 러너
```

**훅은 1종뿐**이다. 레거시는 4종(계약 잠금·편집마다 lint·Phase 게이트·컨텍스트)이었고, 그중 셋이
모든 도구 호출에 프로세스를 띄우는 상시 비용이었다.

### HCG 표준 스택

Next.js App Router · TypeScript(strict) · Tailwind · MariaDB + Prisma ·
TanStack Query / Zustand / React Hook Form / Zod · Vitest + Playwright · feature-centric 구조.

다른 스택을 쓴다면 `*-conventions` 스킬 3개를 고친다 — **스택 방법론이 사는 단일 지점**이다.
경로·도메인 규칙은 여기 넣지 않고 `.claude/project.md` 와 도메인 스킬에 넣는다.

---

## 4. 워크플로 (대량·발견형 작업)

결합된 기능은 세션이 직접 하지만, **독립적·대량**인 일은 fan-out 이 빠르다.
호출: `Workflow({ name, args })`.

| | 목적 | 쓰기 |
|---|---|---|
| `migrate` | 대량 코드모드(API 리네임·의존성 범프) — 파일별 worktree 격리 변환 + 집계 게이트 | ✅ 격리 |
| `test-gen` | 모듈별 단위 테스트 백필 — 격리 생성 + 그 모듈 스위트 실행 | ✅ 격리 |
| `converge` | `contracts/` ↔ 코드 **드리프트** 검출 → 요구사항별 satisfied/partial/missing | ❌ 읽기전용 |

전면 감사·코드 리뷰는 별도 워크플로 없이 **내장 `/code-review` 와 ultracode** 를 쓴다.
상세·커스터마이징: `hcg-core/workflows/README.md`.

---

## 5. 무인 실행

장시간 작업을 사람 없이 돌릴 때. **모델 한도로 끊기면 폴백 모델로 같은 세션을 자동 재개**한다.

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/run-headless.mjs" \
  --dir . --prompt-file task.txt \
  --model claude-fable-5 --fallback claude-opus-5,claude-sonnet-5 \
  --verify "git diff --quiet && cd apps/web && npx tsc --noEmit && npx vitest run"
```

**왜 세션 밖인가**: 한도에 걸리면 세션 프로세스가 즉시 죽는다 — `CLAUDE.md` 에 "한도면 모델을
바꿔 계속하라"고 적어도 그 지시를 실행할 주체가 없다. CLI 의 `--fallback-model` 도 모델이
overloaded/unavailable 일 때 전용이라 **사용량 한도에는 발동하지 않는다**(실측 확인).

- **한도 2종 구분** — 모델별 한도(폴백 유효) vs 계정·세션 한도(모델을 바꿔도 막힘 → 대기).
  뭉뚱그리면 후자에서 폴백 모델만 헛되이 소진한다.
- **`--verify` 는 완주의 외부 증거** — 종료 신호는 "세션이 턴을 끝냈다"일 뿐 "과업이 끝났다"가
  아니다. 실제로 레거시 벤치마크에서 `exit 0` 인데 미완주인 사례가 나왔다.
- 종료 코드: `0` 완주 · `10` **조용한 미완주**(검증 실패) · `20` 모델 한도 · `21` 계정 한도 ·
  `1` 실행 오류. (`subtype` 은 오류 시에도 `"success"` 라 판정에 쓰지 않는다.)

---

## 6. 플러그인 업데이트

이 레포에 새 버전이 푸시돼도 **소비 프로젝트에 자동 반영되지 않는다.**

```bash
claude plugin marketplace update hcg-harness-marketplace
claude plugin update hcg-core@hcg-harness-marketplace
claude plugin list                # 확인
```

`update` 는 **전체 ID 를 요구한다** — `claude plugin update hcg-core` 는
`Plugin "hcg-core" not found` 로 실패한다(`install`·`enable`·`details` 는 짧은 이름을 받는다).
프로젝트에 로컬 스코프로 따로 설치돼 있으면(`claude plugin list` 의 `Scope: local`) 그
프로젝트 디렉터리에서 `--scope local` 로 한 번 더 갱신해야 한다 — user 스코프 갱신은 로컬
설치를 건드리지 않는다.

**세션을 재시작**해야 스킬·훅·에이전트·커맨드가 새 버전으로 동작한다.
프로젝트 안의 관리 파일(`CLAUDE-core.md` 등)을 새 템플릿으로 맞추려면 `/hcg-core:upgrade` —
사용자가 고친 파일은 덮어쓰지 않고 `<파일>.new` 로 남긴다.

> **배포 측 규칙**: 내용을 푸시할 때 `plugin.json` · `marketplace.json` 의 `version` 을 올린다.
> 버전이 그대로면 소비 측이 "이미 최신"으로 판단해 업데이트를 감지하지 못한다.

---

## 7. 레거시 `hcg-harness` — 이행 안내

**신규 설치는 권장하지 않는다.** 0.3.0 은 hcg-core 로 넘어가는 **다리**로 재정의됐다.

### 업데이트하면 무엇이 달라지나

`hcg-harness` 0.2.x → 0.3.0 으로 올리면 **새 세션부터** 이렇게 바뀐다:

| | 0.2.x | 0.3.0 |
|---|---|---|
| 훅 | 4종 (계약 잠금 · 편집마다 lint · SessionStart · Stop phase-gate) | **2종** — SessionStart(+이행 안내) · 파괴적 명령 가드(셸 호출 한정) |
| 계약 쓰기 잠금 | 훅으로 강제 | **해제** — 스킬·컨벤션 문서로만 |
| 편집 후 lint | 편집마다 자동(최대 90초) | **없음** |
| Phase 종료 게이트 | codex 리뷰 강제 | **없음** |
| `/hcg-harness:upgrade` | 템플릿 재동기화 | **hcg-core 로 이행** |

즉 **업데이트만 해도 훅 비용과 상시 게이트 병목이 사라진다.** 배선에서 빠진 훅 스크립트
(lint · phase-gate)는 번들에 남아 있어, 필요하면 프로젝트가 `hooks.json` 을 직접 재배선한다.

### 이행 절차 (3단계)

```bash
# ① 플러그인 갱신 — 반드시 새 세션에서 진행
claude plugin marketplace update hcg-harness-marketplace
claude plugin update hcg-harness@hcg-harness-marketplace   # update 는 전체 ID 필수

# ② hcg-core 설치 — 머신당 1회
claude plugin install hcg-core@hcg-harness-marketplace
```

```
# ③ 프로젝트에서 1회
/hcg-harness:upgrade
```

③ 이 하는 일: **철거**(레거시 파일 회수) → **`project.md` 정합화**(죽은 섹션 제거 + UI 표준
추가) → **`/hcg-core:init --gap-fill` 재건** → **잔재 0 단언 7종**.

**사용자 자산은 삭제하지 않는다.** `tasks/` · codex 래퍼 · `shared-types.md` 같은 실제 작업
이력은 `docs/legacy-harness/` 로 **이동**하고(원 경로에 남으면 세션이 다시 읽어 파이프라인
관성을 재현한다), 사용자가 고친 관리 파일은 `<파일>.legacy` 로 백업한다. 릴리스마다 재동기화를
돌리며 쌓인 `<파일>.new` 충돌 잔재도 같은 아카이브로 **회수**한다(지우지 않는다).
**앱 코드(`apps/web/**`)는 한 줄도 건드리지 않는다** — 철거 대상은 프로파일에 선언된 목록뿐이고,
목록 밖은 불가침이다. hcg-core 를 레거시 위에 먼저 초기화해 **두 마커가 공존하는 상태에서는
철거 자체를 거부한다**(hcg-core 가 쓴 파일을 레거시 사용자 수정본으로 오인해 지우는 것을 막는다).

> 이행 후 손이 필요한 것 하나: 레거시 `contracts/shared-types.md`(산문)는 아카이브로 가고
> hcg-core 는 `shared-types.ts`(타입 SSOT) 스텁을 새로 만든다 — 기존 타입 정의는 **손으로
> 옮겨야** 한다. 내용은 아카이브에 보존된다.

레거시 표면(5-agent · 파이프라인 스킬 · `/qa`)은 아직 이행하지 않은 프로젝트를 위해 유지된다.
이행이 끝나면 `enabledPlugins` 로 플러그인 자체가 꺼져 스킬 목록에도 나오지 않는다.

---

## 8. 문서

- `docs/hcg-core-onboarding.html` — 팀 온보딩 발표자료 (브라우저로 열기 — 발표+자습 겸용)
- `docs/install.md` — 설치 상세 + 수동 설치 폴백 (레거시 기준)
- `docs/portable-instance-boundary.md` — 포터블 vs 프로젝트별 분리 (레거시 기준 — hcg-core 의
  경계는 위 §1·§3 이 정본)
- `hcg-core/workflows/README.md` — 워크플로 커스터마이징
- **[`CHANGELOG.md`](CHANGELOG.md)** — 두 플러그인의 전체 변경 이력 + 개정 근거

### 요구사항

Node.js 22+ · git · Claude Code CLI.
**배포 서버 표준(HCG 규정)**: node 22.13.0 · npm 10.9.2 · pm2 7.0.3 — 패키지 매니저는 **npm**
고정이고, 생성 앱이 engines + `.npmrc`(engine-strict) + preinstall 가드(`only-allow npm`)로
이를 기계 강제한다. DB(MariaDB)는 앱을 실제로 연결·마이그레이션할 때만 필요하다.

### 개발자 주의 — 두 벌 존재하는 파일

`CLAUDE-core.md` 와 `agents/task-agent.md` 는 **플러그인 루트본**(정본)과
**`profiles/hcg/templates/.claude/` 템플릿본**으로 두 벌이며, **프로젝트에 렌더되는 것은
템플릿본**이다 — 루트본만 고치면 개정이 프로젝트에 도달하지 않는다.
`scripts/template-sync.test.mjs` 가 frontmatter 를 제외한 본문 동일성을 검사해 재발을 막는다
(템플릿본이 frontmatter 에 프로젝트 스킬 바인딩을 더 갖는 것은 정상).
