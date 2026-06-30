# HCG Harness

HCG 프로젝트를 위한 포터블 멀티에이전트 **개발 하네스**. Claude Code 플러그인으로 패키징되어
있다. 프로세스 방법론과 HCG 표준 스택 컨벤션을 함께 싣고 있어, 새 프로젝트는 **인스턴스 슬롯
하나**(`.claude/project.md`) + 도메인 스킬만 채우면 전체 파이프라인을 얻는다 — 하네스 재작성 불필요.

기존 in-repo 하네스에서 추출해 **HCG 표준 스택**(Next.js App Router · MariaDB + Prisma ·
TanStack Query / Zustand / React Hook Form / Zod · Vitest + Playwright · feature-centric 구조)에
맞춰 재정렬했다. 전체 HCG 표준은 `HCG-Framework.md`(상위 폴더) 참조.

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

**요구사항(최소)**: Node.js 20+ (LTS · 검증 22) · pnpm 9+ (HCG 프로파일의 패키지 매니저 · 검증 10) · git · Claude Code CLI. DB(MariaDB/MySQL)는 앱을 실제 DB에 연결·마이그레이션할 때만 필요(부트스트랩·빌드엔 불요). pnpm 10+는 postinstall을 기본 차단하므로 `pnpm prisma generate` 전에 `pnpm approve-builds`가 필요할 수 있음.

**흐름** (거의 빈 폴더 기준):

```
1. claude plugin install hcg-harness@hcg-harness-marketplace
2. 세션 열기 → SessionStart 감지기가 "아직 부트스트랩 안 됨 → /hcg-harness:init 실행" 안내 주입
3. /hcg-harness:init 실행 → 프레임워크 선택(HCG 기본) · 프로젝트명 · 앱 레이아웃 질문
4. 하네스 레이어 + 최소 앱 골격 파일 자동 생성 + 마커 + hook env 기록
5. setup 명령 안내 출력 (pnpm install / prisma generate / playwright install / dev) — 실행은 사용자 몫
```

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
