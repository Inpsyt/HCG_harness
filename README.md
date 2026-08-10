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
Phase 가 닫혔다. 약한 모델을 여러 역할로 나눠 보정하던 2023–24년형 설계다.

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
claude plugin update hcg-core
claude plugin list                # 확인
```

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
claude plugin update hcg-harness

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
관성을 재현한다), 사용자가 고친 관리 파일은 `<파일>.legacy` 로 백업한다.
**앱 코드(`apps/web/**`)는 한 줄도 건드리지 않는다** — 철거 대상은 프로파일에 선언된 목록뿐이고,
목록 밖은 불가침이다.

> 이행 후 손이 필요한 것 하나: 레거시 `contracts/shared-types.md`(산문)는 아카이브로 가고
> hcg-core 는 `shared-types.ts`(타입 SSOT) 스텁을 새로 만든다 — 기존 타입 정의는 **손으로
> 옮겨야** 한다. 내용은 아카이브에 보존된다.

레거시 표면(5-agent · 파이프라인 스킬 · `/qa`)은 아직 이행하지 않은 프로젝트를 위해 유지된다.
이행이 끝나면 `enabledPlugins` 로 플러그인 자체가 꺼져 스킬 목록에도 나오지 않는다.

---

## 8. 문서

- `docs/install.md` — 설치 상세 + 수동 설치 폴백 (레거시 기준)
- `docs/portable-instance-boundary.md` — 포터블 vs 프로젝트별 분리
- `hcg-core/workflows/README.md` — 워크플로 커스터마이징

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

---

## 변경 이력

> `hcg-core` 와 `hcg-harness` 의 이력이 함께 있다. 접두어 없는 버전(0.2.2 이하)은 전부
> **`hcg-harness`** 것이다 — hcg-core 는 2026-08-06 에 신설됐다.

### hcg-core 0.1.0 — 2026-08-06

신규 플러그인 — unhobbled 하네스. 설계: 2026-08-05 unhobble 진단(레거시 파이프라인은 Fable 5
세대에서 순효과 음수)의 반전으로, 단일 세션 직접 수행이 기본이다.

- **구성**: 슬림 CLAUDE-core(~3KB, Operating Rules §0~§5 + 작업 라우팅 표) · `parallel-tasks`
  스킬(Task-축 병렬화 — 결합도 판정→풀스택 task-agent 병렬 dispatch→통합 검증) · `task-agent`
  1종(역할 5종 폐지) · 이식 스킬 5종(파이프라인 잔재 제거 — 불일치 보고는 tasks/TODO 가 아니라
  완료 보고, 계약 잠금 폐지) · 워크플로 3종(migrate·test-gen·converge — audit/review 는
  ultracode·`/code-review` 내장으로 대체) · SessionStart 훅 1종(마커 `.claude/.hcg-core.json`,
  레거시 마커 감지 시 혼용 경고) · `/hcg-core:init`(`--no-app` 선택형 앱 골격)·`:upgrade`.
- **비포함(Won't)**: 파이프라인 모드·codex 게이트·tasks/ 부기·모델 배정 매트릭스·qa-e2e·
  ui-standard 사본(AX 표준은 upstream `ax-wireframe` 를 frontend-conventions·task-agent·
  project.md 3곳에서 명시 참조)·자동 마이그레이터.
- **검토 반영(2026-08-06, push 전)**: contracts 템플릿 4종의 레거시 잔재 제거(역할·잠금 문구 →
  세션 소유 모델 — 세션이 사용자 합의 후 작성·수정, 구현은 준수+완료 보고), design-guide 를
  ax-wireframe 참조 기준으로 재작성(사본 토큰 표 제거 + **우선순위 규칙**: 충돌 시 design-guide
  의 명시 기록 오버라이드가 전사 기본값보다 우선, 무기록 이탈 금지 — frontend-conventions·
  project.md·task-agent 에도 동일 명시), shared-types 스텁 `.ts`(typed SSOT) 전환,
  `docs/install.md` 레거시 전용 고지 추가.
- **커밋 규율 1줄(2026-08-06 deepsearch 검토)**: §4 끝에 "검증 통과 작업 단위마다 커밋 — git 이
  세션 간 핸드오프·재개의 원장, 메시지에 검증 요약" 추가. 근거: 세션 의도치 않은 종료 시 재개의
  유일한 약점이 미커밋 창이며, 구조화 핸드오프는 모델 세대를 넘어 살아남는 하네스 4요소 중 하나
  (2026 harness engineering 실측 — 같은 모델·다른 하네스 = SWE-bench 22점 차).
- **codex-review 온디맨드 재도입(2026-08-06 딥다이브)**: 상시 게이트는 여전히 비포함 — 뺀
  이유(동기 5–15분 + D9 분류 노동이 모든 변경의 기본 경로에 박힘)는 게이트라는 *형태*의 문제였고,
  교차모델 리뷰의 가치 자체(레거시 Phase 33 에서 workflows 의 fail-open 결함 F7~F13 검출)는
  실증됐기 때문. 재도입 형태: 슬림 `codex-review` **스킬**(게이트 아님) — **닫힌 트리거 7종**
  (스키마 이관·auth·결제/외부 부작용·동시성 invariant·보안 표면·릴리스 직전·긴 세션 끝 대량
  신규)에서 세션이 **제안 의무**·사용자 결정·**백그라운드 실행**(동기 대기 금지)·D9 핵심만
  (정확성·계약 위반만 액션, 갭/개선은 부록 — phase-meta·BUG 부기 전무)·fail-open(실패는 "실행
  못 함"으로 보고, 거짓 통과 금지). 라우팅 표에 1행 추가. wrapper 스크립트 없음 — 레거시
  wrapper 의 실가치(D9 포커스 주입·빈 diff 가드)를 스킬 절차로 흡수해 프로젝트 배선 제로.
  동시에 bootstrap.mjs 의 codex 데드코드(`--no-codex`·`CODEX_*` 토큰·`codexFiles`·marker
  `choices.codex`) 제거 + 회귀 테스트 1건 추가.
- **무인 실행 러너 추가(2026-08-07 A/B 벤치마크 실측 반영)**: `scripts/run-headless.mjs` —
  모델별 사용량 한도로 세션이 끊기면 `--fallback` 모델로 같은 세션을 자동 재개한다(위
  「무인 실행」 절). **세션 안의 지시로는 불가능**하다는 것이 설계 근거 — 한도는 세션
  프로세스를 즉시 죽여 지시를 실행할 주체가 남지 않고, CLI `--fallback-model` 은 모델
  overloaded/unavailable 전용이라 사용량 한도에 미발동한다(한도 상태에서 재현). 실측으로
  확정한 4가지: ① 한도로 죽은 실행의 JSON 에도 `session_id` 가 있어 0턴 세션도 재개 가능
  ② `subtype` 은 오류 시에도 `"success"` 라 판정 금지(exit code + `is_error` 사용)
  ③ 재개 시 **원 프롬프트를 다시 실어야 함** — 첫 턴에 한도가 걸리면 이력이 비어 있어
  "이어서 하라"고만 하면 재개 세션이 아무 일도 않고 정상 종료(라이브 재현 후 수정)
  ④ 모델별 한도와 계정·세션 한도는 분리 — 후자는 모델을 바꿔도 막히므로 폴백을 시도하지
  않는다. `--verify` 로 완주를 외부 검증(exit 10 = 조용한 미완주)해 `verification-ladder`
  를 오케스트레이션 층에 적용한다. 단위 테스트 15건 추가 + bootstrap 스모크의 버전 리터럴
  제거(plugin.json 대조 — 범프마다 깨지던 것). 이 변경 자체는 플러그인 버전 범프 대상이 아니었다
  (0.1.0 유지) — 이후 0.1.1 로의 범프는 아래 항목 참조.

### hcg-core 0.1.1 — 2026-08-07

settings 템플릿이 레거시 플러그인(`hcg-harness`)을 `enabledPlugins` 에서 `false` 로 명시
선언하도록 변경 — 이행된 프로젝트가 레거시 하네스와 hcg-core 를 동시에 활성 상태로 두어 훅
이중 발화·방법론 충돌을 겪지 않도록 한다.

**검증이 환경을 보게 만들기 (2026-08-10 · A/B 벤치마크 실측 반영)** — 근거는 세 관측:
① 단위 테스트 470건 green 인데 기능은 실서버 100% 실패(`$transaction` 모킹이 "렌더 10초 vs
트랜잭션 기본 타임아웃 5초"를 가림) ② `codex-review` 트리거 3종 해당인데 세션 전체에서 **발동
0회** ③ 개발 시드 11행에서는 인덱스 유무·N+1·풀스캔이 전부 똑같이 빨라 **신호 자체가 없음**.
셋의 뿌리가 같다 — **로직은 검증하는데 환경은 검증하지 않는다.**

- **§4 — rung-1 이 무력한 2경우**: (a) 경계를 모킹했다(DB 트랜잭션·파일 IO·바이너리 생성·외부
  어댑터) (b) 데이터 규모·배포 형태에 민감하다(목록·집계·문서 생성) → rung-3 을 **대체가 아니라
  추가로** 통과시킨다. 사다리가 "가장 강한 rung 하나"를 고르게 한 탓에 rung-3 이 rung-1 의
  열등한 대체재로 읽혔으나, 둘은 **직교**한다(rung-1 = 경계를 가정했을 때 로직이 맞는가,
  rung-3 = 그 경계 가정이 실제로 성립하는가). 상세·보고 형식은 `verification-ladder` 스킬.
- **§4 — codex-review 판정을 완료 절차에 편입**: 트리거 7종 해당 여부를 판정하고 해당하면
  제안한다(실행은 사용자 결정). **먼저 스킬 `description` 에 트리거 7종을 열거하는 안을 시도했다가
  라이브 검증에서 반증됐다** — description 이 시스템 프롬프트에 그대로 주입돼 있었고 트리거가
  명백히 성립했는데도 제안이 없었다. 항상 컨텍스트에 있는 것과 세션이 자기 상황에 대입하는 것은
  다른 문제이며, **작업 흐름 안(§4 완료 절차)에 있어야 발동**한다. 목록은 description 한 곳에만
  둔다(규칙을 두 곳에 쓰지 않는다).
- **§1 — 프로세스 밖 의존성은 스텁 우선**: 서버·계정·자격증명이 더 필요한 것(S3·메일·Redis)은
  어댑터 뒤 스텁으로 구현하고 **실제 연결만 질문**한다 — 기능은 완성하고 비가역 결정만 유보.
  §1 이 이미 "외부 부작용은 질문"이라 말하므로 새 규칙이 아니라 "질문하는 동안 무엇을 하는가"의
  보충이다.
- **`project.md` 「운영 규모」 슬롯 + init 질문 1개**: 비개발자가 업무 지식만으로 답할 수 있게
  인원 선택지(50/500/500+/모르겠음)로 묻고, 월 건수·보존·동시성은 파생한다. `contracts/` 에
  5번째 계약(`ops-spec.md`)을 만드는 안은 **기각** — 나머지 4종은 안 채우면 즉시 막히지만 이건
  안 채워도 개발이 굴러가 방치된다(위 ②가 그 전례).
- **`project.md` 「추가 도입」 + `task-agent` 실측 수치·환경 변화**: 표준 스택 밖 라이브러리
  도입을 기록하고, 의존성이 바뀌면 재설치 필요를 알린다. 벤치마크에서 두 암 모두 `pdf-lib` 을
  들여왔으나 **어느 쪽도 기록하지 않았다.**
- **`backend-conventions` — 서버 런타임 자산**: `node_modules` 를 런타임에 읽지 않는다(번들러
  트레이싱 밖 → standalone 에서 누락). 커밋 자산을 `process.cwd()` 기준으로, 포맷은 비압축
  (TTF > WOFF — 압축 해제가 요청마다 든다. 벤치마크에서 이 차이가 지불증 생성 10.7초 vs 0.3초).

**라이브 발동 검증 4/4**(실 MariaDB 프로젝트 3회 실행): codex 제안 · 운영 규모 실측(36만 행
A/B) · 모킹 경계의 실 DB 스모크 · 금지 3종(공수 추정·개선 후 수치 약속·질문으로 종료) 회피.
부수 확인 — 측정 의무화가 **과잉 최적화까지 차단**했다(지시받은 인덱스를 넣고 실측한 뒤 효용
없음을 발견해 계약서 근거를 실측 표로 교체).

> **주의 — 두 벌 존재하는 파일이 있다.** `CLAUDE-core.md` 와 `agents/task-agent.md` 는 플러그인
> 루트본(정본)과 `profiles/hcg/templates/.claude/` 템플릿본으로 **두 벌**이며, 프로젝트에 렌더되는
> 것은 **템플릿본**이다 — 루트본만 고치면 개정이 프로젝트에 도달하지 않는다. 실제로 이 개정
> 작업에서 `task-agent.md` 가 이 경로로 어긋난 채 커밋됐다(사람 눈으로 발견).
> **`scripts/template-sync.test.mjs` 가 재발을 막는다** — frontmatter 를 제외한 본문이 동일한지
> 검사하고(템플릿본은 frontmatter 에 프로젝트 스킬 바인딩을 더 갖는 것이 정상), 새 중복 파일이
> 생기면 `PAIRS` 미등록으로 걸린다. 드리프트 주입 → 실패 → 복원 → 통과로 **가드가 실제로 무는지**
> 확인했다.

### hcg-harness 0.3.0 — 2026-08-07

이행 램프 — 레거시 하네스를 hcg-core 로 넘기는 다리. 훅 4종(PreToolUse 계약+파괴 가드 ·
PostToolUse lint · SessionStart 컨텍스트 · Stop phase-gate) → **2종**(SessionStart 컨텍스트+이행
안내, PreToolUse 파괴적 명령 가드만 matcher `Bash|PowerShell` 로 새 런처 `run-destructive-guard.mjs`
경유 복원 — 계약 잠금 G1/G3 는 이 런처가 `HARNESS_CONTRACTS_WRITE=1` 로 꺼둔 채 유지)으로 다이어트,
플러그인 배선에서 빠진 2종(PostToolUse lint · Stop phase-gate)의 hook 스크립트는 복사 설치(§1B)
수동 배선용으로 번들에 남는다.
SessionStart 는 기존 phase/이슈 컨텍스트 주입에 **이행 안내 배너**(레거시 마커 프로젝트에
`/hcg-harness:upgrade` 권유)를 더한다. **`/hcg-harness:upgrade` 재정의**: 종전의 마커+매니페스트
템플릿 재동기화 대신, 철거(retire) → `.claude/project.md` 섹션 정합화 → `/hcg-core:init --gap-fill`
재건 → 이행 완료 단언 7종을 수행한다. 신설 **`--mode retire` 엔진**(`scripts/bootstrap.mjs`):
`retiredFiles`(delete·archive·replaceIfPristine) 3버킷을 프로파일에서 선언적으로 읽어
managed 미수정 파일은 삭제, 사용자 수정본은 `.legacy` 백업 후 삭제, user-owned 자산은
`docs/legacy-harness/` 로 아카이브(무수정 대응물은 교체 허용, 수정본은 원 위치 보존 + 검토
사유 보고) — 이행 후 고아 파일 0을 스모크로 단언한다. 레거시 5-agent·9-skill·명령 표면은
아직 이행하지 않은 프로젝트를 위해 그대로 유지된다. 신규 설치는 권장하지 않으며 잔류도 지원
대상이 아니다 — 전원 hcg-core 로 이행한다(설계 결정, 이하 워크플로 코드리뷰 개정 E 참조).

### 0.2.2 — 2026-08-05

유지보수 라인(v0.2-maintenance) 패치 — CLAUDE-core 의 자기모순 해소 + 모델 배정 매트릭스 폐지. 기존 프로젝트는 `/hcg-harness:upgrade` 로 에이전트·CLAUDE-core 재동기화 권장. `.claude/project.md` 「모델 배정」은 사용자 소유라 수동 반영(해소표 삭제).

- **모델 배정 매트릭스 폐지 (전 에이전트 inherit)**: 0.2.0 의 MoSCoW×난이도 티어 강등은 실패 방향 분석이 반쪽이었다 — 규율을 *놓친* 방향(inherit)은 비용 증가에 그치지만, 규율을 *지킨* 방향(T1/T2 강등)이 품질 저하 → QA 재작업 루프였고 재작업 비용이 토큰 절감을 상회했다. Task 라인 `난이도:`·`티어:` 필드, qa 티어 상향 규칙, project.md 「모델 배정」 해소표 폐지. plan-agent·qa-agent·pipeline-phase 스킬(fast_path_log `tier:` 필드 포함) 동기 갱신. 워크플로·codex 게이트는 종전대로 이 체계 밖.
- **설계 승인 체크포인트 ①.5 조건부화**: 전 Phase 하드 블록 → §1 판정(가역성×비용) 연동. 되돌리기 어려운 결정(`contracts/` 신설·변경, 스키마/마이그레이션, auth·결제·데이터 삭제/이관·외부 부작용) 포함 시에만 승인 대기, 그 외에는 요약 고지 후 바로 dispatch(veto 가능). §1 "Asking on every ambiguity is its own failure mode" 와의 자기모순 해소.
- **QA 루프 상한**: "qa 통과할 때까지 ⑤⑥ 반복" 의 무한 루프에 상한 도입 — 동일 이슈 2회 연속 FAIL 시 사용자에게 설계 재검토 에스컬레이션(수렴하지 않는 QA 루프는 설계 결함 신호).
- **§0 사용자 오버라이드 명문화**: "직접 코드 작성 금지" 절대어와 §0("Explicit instructions from the user in chat always override these defaults")의 충돌 해소 — 사용자 명시 지시는 파이프라인 의무를 오버라이드하며, 오버라이드 시에도 검증 사다리(§4)는 적용.
- **fast-path veto 시맨틱 명확화**: 사전 고지 후 응답을 기다리지 않고 진행, veto 도착 시점부터 풀 파이프라인 전환(종전 문구는 대기 여부 미명세).
- **byte-verbatim 동결 해제**: 방법론 문서를 버전 관리되는 살아있는 문서로 전환 — §0~§5 개정 시 변경 이력에 근거를 남긴다.

### 0.2.1 — 2026-07-24

- **마커 harnessVersion 하드코딩 제거**: `bootstrap.mjs` CLI 가 마커에 찍는 `harnessVersion` 을 하드코딩 fallback 대신 **플러그인 자신의 `.claude-plugin/plugin.json` 에서 읽어** 기록한다(`readOwnPluginVersion`). 0.2.0 설치 테스트에서 발견 — 신규 init 마커가 구버전(0.1.5)으로 찍혀 doctor 가 version-skew 오경보를 냈고 upgrade 로도 해소되지 않았다. 이제 upgrade 도 plugin.json 버전으로 재도장해 skew 가 자가 해소되며, 릴리스마다 리터럴을 수동 범프할 필요가 없다(리터럴은 미가독 시 최후 방어로만 유지). 회귀 테스트 2건 추가(128 → 130).

### 0.2.0 — 2026-07-23

- **Task 기반 동적 모델 배정**: plan-agent 가 Task 생성 시 MoSCoW × 난이도로 티어(T0/T1/T2)를 도출해 Task 라인에 기록하고, 오케스트레이터가 spawn 시 `Agent` tool `model` 파라미터로 오버라이드한다(CLAUDE-core §모델 배정 매트릭스 신설). plan = T0 고정, qa = Phase 구현자 max +1 단계(상한 T0), fast-path 는 should 간주 + `fast_path_log.tier` 기록. 구체 모델 alias 는 project.md 「모델 배정」 해소표에만 존재(기본 T1=opus · T2=sonnet) — 모델명 하드코딩 없음(0.1.3 취지 유지). 에이전트 frontmatter 는 `model: inherit` 그대로.
- **기존 프로젝트 주의**: `.claude/project.md` 는 사용자 소유라 `/hcg-harness:upgrade` 가 덮어쓰지 않는다 — 「모델 배정」 해소표는 수동 반영(또는 `.new` 병합) 필요. 에이전트·CLAUDE-core 는 upgrade 로 재동기화된다.

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
