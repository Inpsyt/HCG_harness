# 변경 이력

이 레포가 서빙하는 두 플러그인(`hcg-core` · `hcg-harness`)의 이력이 한 파일에 있다. **`hcg-core`
항목이 먼저 오고 그다음이 `hcg-harness`, 각 플러그인 안에서는 시간 역순**(최신이 위)이다. 접두어
없는 버전(**0.2.2 이하**)은 전부 `hcg-harness` 것이다 — `hcg-core` 는 2026-08-06 에 신설됐다.

개요·사용법은 [README](README.md).

> **기록 규율**: 방법론(`CLAUDE-core.md`)이나 규칙을 개정하면 **근거를 여기 남긴다** — 무엇을
> 바꿨는지보다 **왜 그렇게 판단했는지**가 이 문서의 값이다(기각한 대안과 그 이유 포함).
> 커밋 메시지에도 같은 근거를 쓰되, 릴리스 단위의 서술은 여기가 정본이다.

---

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

**배포 전 검증 반영(2026-08-10)** — 같은 날 hcg-harness 0.3.0 에 넣은 매니페스트 정합 수정을 **같은 계보인 hcg-core 엔진에도 반영**
(`finalizeManifest` 동일 규칙). hcg-core 는 철거(retire)가 없어 오늘의 판정을 바꾸지 않는
무해한 변경이지만, 마커가 디스크를 오해하는 상태를 남기지 않는다 — 두 엔진이 갈라지면
다음 개정에서 한쪽만 고쳐지는 것이 이 레포의 실제 사고 패턴이었다(0.1.1 의 두 벌 파일 사고).

**배포 전 정합 점검 — 방향성 불일치 4건 (2026-08-11)**

동작은 실측으로 확인됐다(매니페스트 검증 3건 · 실엔진 init 30파일 + 마커 · 실엔진 upgrade
충돌 `.new` 보존 · SessionStart 3분기 · 단위 237/237). 그 위에서 문서·메타 문구가 hcg-core
교리와 같은 방향을 가리키는지 대조한 결과, **사용자·세션에 노출되는 안내** 4건이 어긋나 있었다.

1. **워크플로 `meta` 가 레거시 교리를 안내했다** — `migrate` 의 whenToUse 는 결합된 변경을
   "static plan→implement→qa pipeline" 으로 보내고, `converge` 는 계약 잠금+리뷰 게이트
   ("the gap the lock+review keeps authoritative")를 전제하며 제안 태스크를 `plan-agent` 에
   넘기라고 했다 — hcg-core 에는 셋 다 없다(파이프라인 폐지 · 잠금 해제 · 에이전트는 task-agent
   1종). `.js` 를 레거시와 byte-identical 로 유지한 정책의 부작용이다. **`meta` 블록은 그 정책의
   예외**로 확정했다 — `description`·`whenToUse` 는 워크플로 목록으로 세션 컨텍스트에 실리는
   표면이라, 실행 본문과 달리 "사본"으로 둘 수 없다. 라우팅 표(결합=세션 직접 · 독립 Task=
   `parallel-tasks`)에 맞춰 다시 쓰고 근거를 `workflows/README.md` 에 명문화.
2. **살아있는 문서 규율의 포인터가 깨져 있었다** — CHANGELOG 분리(`03077e8`) 이후에도
   `CLAUDE-core.md`(루트본·템플릿본)와 `codex-review` 스킬이 "README 변경 이력"을 가리켰다.
   CHANGELOG 자신은 "릴리스 단위 서술은 여기가 정본"이라 선언한다. 더 큰 문제는 `CLAUDE-core.md`
   가 **프로젝트로 렌더되는 파일**이라는 것 — 소비 프로젝트에는 그 README 가 애초에 존재하지
   않는다. "하네스 레포의 `CHANGELOG.md`" 로 통일했다(레거시 2벌 포함, 아래 0.3.0 항목).
3. **SessionStart 레거시 분기가 폐기된 절차를 안내했다** — "README 의 수동 이행 가이드를
   따르세요"는 0.3.0 이행 램프 이전 문구다. 같은 상황에서 레거시 플러그인 자신의 훅은
   `/hcg-harness:upgrade` 1회를 안내하고 있어 **두 플러그인이 서로 다른 절차**를 말하고 있었다.
   자동 절차로 통일하고 회귀 테스트를 붙였다(커맨드 존재 + 폐기 문구 부재 양방향 단언 —
   문구 드리프트는 테스트가 없으면 반드시 재발한다는 것이 이 레포의 이력).
4. **`docs/portable-instance-boundary.md` 에 레거시 경고가 없었다** — `install.md` 는 0.1.0 때
   레거시 전용 배너를 받았지만 이 문서는 누락됐고, README §8 의 표기도 install.md 에만 있었다.
   내용은 "HARNESS core = Pipeline ①–⑥" · 에이전트 셸 5종 · codex 게이트 래퍼 · 훅 4종 번들을
   *포터블*로 서술해 hcg-core 교리와 정면 충돌한다. 배너 + hcg-core 경계 포인터(README §1·§3 이
   정본 — 별도 문서를 새로 만들지 않는다)를 달았다.

공통 원인은 하나다 — **hcg-core 는 레거시에서 파일을 물려받았고, 물려받은 것의 "본문"만
검토했다.** meta·주석·배너처럼 실행되지 않는 텍스트가 검토를 빠져나갔고, 그중 사용자에게
노출되는 것들이 그대로 살아남았다. 버전은 범프하지 않는다(0.1.1 은 origin 에만 있고 미배포).

**배포 절차 문서 정정 — 실제 갱신에서 드러난 3건 (2026-08-11)**

머신에 설치된 0.1.0 을 0.1.1 로 실제로 올려 보며 나왔다. 문서만 읽고는 알 수 없는 것들이라
팀 배포 1단계에서 그대로 막혔을 것이다.

1. **`claude plugin update` 는 전체 ID 를 요구한다.** README §6·§7 의 `claude plugin update
   hcg-core` · `hcg-harness` 는 `Plugin "hcg-core" not found` 로 **실패한다** — 팀이 받는 배포
   안내의 첫 명령이 듣지 않는 상태였다. `hcg-core@hcg-harness-marketplace` 로 교정. 짧은 이름
   해석은 **서브커맨드마다 다르다**(`install`·`enable`·`details` 는 받는다)는 것이 실측 결과라,
   "짧게 써도 되겠지"로 되돌아가지 않도록 근거를 README 본문에 함께 남겼다.
2. **user 스코프 갱신은 로컬 스코프 설치를 건드리지 않는다.** 프로젝트에 로컬로 설치된 사본이
   있으면 user 를 올려도 그 프로젝트는 구버전을 계속 로드한다 — 해당 디렉터리에서 `--scope
   local` 로 한 번 더 갱신해야 한다(실측: user 0.1.1 · local 0.1.0 공존). README §6 에 명시.
3. **한 번 설치된 뒤에는 같은 버전으로 아무리 푸시해도 도달하지 않는다** — README §6 의 배포
   규칙이 경고하던 상황을 실제로 밟았다. 0.1.1(`5e7008c`)을 설치한 뒤 `1234fd3` 이 푸시됐지만
   `marketplace update` + `plugin update` 는 `already at the latest version (0.1.1)` 로 끝났다.
   **미배포 릴리스에 변경을 누적하는 규율(버전 범프 금지)은 아직 아무도 설치하지 않았을 때만
   성립한다** — 설치가 한 대라도 일어난 뒤의 추가 변경은 그 머신에 영원히 도달하지 않는다.
   팀 배포 시점에 지켜야 할 것: **배포 직전 내용을 확정한 뒤 그 시점에 범프**하고, 그 전에
   설치해 본 개발 머신은 재설치로 맞춘다.

같은 점검에서 CHANGELOG 자신의 정렬도 고쳤다 — 머리말은 "시간 역순"이라 선언하면서 `hcg-core`
0.1.0 이 0.1.1 위에 있었다. 실제 구성(플러그인별 그룹 · 그룹 안에서 역순)대로 두 블록을 바꾸고
머리말을 그 구성에 맞췄다.

**앱 템플릿 `.npmrc` — 운영 NODE_ENV=production 빌드 실패 방어 (2026-08-21)**

운영 서버는 전역 `NODE_ENV=production` 이고 배포는 소스 설치 후 서버 빌드다(배포 파이프라인
npm 표준). npm 7+ 는 `NODE_ENV=production` 에서 `omit` 기본값이 `dev` 라 `npm install`/`npm ci`
가 devDependencies(typescript·@types·tailwind·postcss·prisma CLI)를 통째로 건너뛰고, TS
프로젝트의 `next build` 가 실패한다. CI 러너에는 NODE_ENV 가 없어 초록 → **운영에서만 깨지는
비대칭**이라 배포마다 재발했다. 앱 템플릿 `.npmrc` 에 `include=dev` 1줄 추가(실측: npm 10.9,
NODE_ENV=production 에서 dev 미설치 재현 → include=dev 로 복구). 기각 대안 — ① 빌드 필수
패키지를 dependencies 로 이동(dev/runtime 규약 훼손 + 런타임 비대) ② 배포 절차 문서에
`--include=dev` 명시(절차 규율 의존 — 습관적 `npm install` 한 번에 재발, fail-safe 아님)
③ `.npmrc` 에 `omit=` 빈 값(CLI `--omit=dev` 가 자연 오버라이드되는 장점까지 실측 확인했으나,
빈 값→빈 목록 강제는 미문서 동작이라 npm 이 파싱을 바꾸면 원 결함이 조용히 되돌아온다 —
비대는 참아도 회귀는 못 참는다). 부작용 1건 실측·주석 명시 — include 는 omit 보다 우선하므로
이 줄이 있으면 명시적 `npm ci --omit=dev` 도 dev 를 설치한다; 슬림 설치는 `npm ci --omit=dev
--include=`. 레거시 앱 템플릿(`hcg-harness/profiles/.../.npmrc`)에도 동일 적용 — 두 벌 중
한쪽만 고쳐지는 것이 이 레포의 실제 사고 패턴이다(0.1.1 두 벌 파일 사고).

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
  (0.1.0 유지) — 이후 0.1.1 로의 범프는 위 항목 참조.

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

#### 배포 전 검증 반영 — 구버전 이행 결함 3건 (2026-08-10)

**구버전 실사용 경로 실측 검증에서 나온 이행 결함 3건 수정.** 0.1.1·0.1.5·0.2.1·0.2.2 각
버전의 실제 bootstrap 엔진으로 프로젝트를 만들어 0.3.0 이행 램프를 태워본 결과 — 단일 버전
경로는 고아 0 으로 통과했지만, **릴리스마다 재동기화를 돌린 실사용 경로**에서 결함이 드러났다.
최초 이행 스모크가 `orphans == 0` 을 단언하면서도 그 상태를 만들지 않아 놓친 것들이다.

- **`<파일>.new` 잔재가 이행 후 남았다.** 구버전은 릴리스마다 `/hcg-harness:upgrade` 재동기화를
  권했고, 관리 파일을 고친 프로젝트는 그때마다 `<파일>.new` 를 얻었다. 실측에서 `CLAUDE.md.new` ·
  `.claude/agents/qa-agent.md.new` 가 이행 후 고아로 남아 **죽은 5-에이전트 정의를 계속 노출**했다.
  → `planRetire` 가 철거 대상 경로의 `.new` 를 `docs/legacy-harness/` 로 **회수**한다.
  **지우지 않는 이유**: 사용자가 병합 중이었을 수 있다 — 이 릴리스는 사본 없이 사용자 작업을
  없애지 않는다는 기존 원칙을 그대로 따른다. 선언 목록 밖 경로의 `.new` 는 불가침.
- **마커가 user-owned 파일에 대해 거짓말을 했다 → 철거 오분류.** `buildManifest` 는 렌더 결과를
  그대로 적어, upgrade 가 **일부러 쓰지 않은** 파일(user-owned 스킵 · `.new` 충돌 · gap-fill 스킵)
  까지 새 템플릿 해시로 덮어썼다. 그 어긋남이 `planRetire` 의 pristine 판정을 뒤집어, 아무도
  건드리지 않은 `.claude/skills/playwright-e2e/SKILL.md` 가 "사용자 수정본"으로 keeps 에 빠졌다
  (0.1.1 → 0.2.2 upgrade 후 실측). 결과적으로 죽은 `front 에이전트`·`pnpm --filter` 를 가리키는
  레거시 스킬이 이행 후에도 살아남고, 리포트는 그것을 **사용자 수정으로 잘못 안내**했다.
  → 신설 `finalizeManifest`: 마커는 "하네스가 **마지막으로 쓴 것**"만 기록한다(① 이번에 쓴 경로 →
  템플릿 해시 · ② 디스크가 이미 템플릿과 동일 → 템플릿 해시 · ③ 이전 기록 이월 · ④ 그 밖 →
  항목 없음). **기각한 대안**: "마커 = 디스크 현재 상태"로 단순화하는 안 — `.new` 충돌 파일의
  사용자 수정본까지 pristine 으로 만들어 **백업 없이 삭제**하게 된다(단위 테스트로 고정).
  **한계(중요)**: 이 수정은 새 오염을 막을 뿐 **이미 구버전 엔진이 쓴 마커는 되돌리지 못한다** —
  0.1.x·0.2.x 시절 재동기화를 거친 실제 프로젝트는 이미 어긋난 마커를 들고 있고, 0.3.x 의
  `/hcg-harness:upgrade` 는 재동기화가 아니라 이행이라 고쳐 쓸 기회도 없다(실측 재현에서 이행
  후에도 그 스킬이 `keeps` 에 남는다). 되살릴 수 없는 정보를 추측으로 메우지 않기로 하고,
  대신 **`keeps` 사유에서 단정을 뺐다** — "사용자 수정본"이라고 못 박던 문구를 "사용자
  수정본이거나 구버전 매니페스트 드리프트"로 바꾸고 확인 절차(내용을 열어보고 손대지 않은
  스텁이면 삭제 후 gap-fill 재실행)를 `upgrade.md` §7 검토 목록에 명시했다. 사유를 단정하면
  사용자는 손대지 않은 레거시 스텁을 자기 작업물로 알고 그대로 둔다 — 그것이 실제 피해였다.
  hcg-core 쪽은 `/hcg-core:upgrade` 가 살아있는 재동기화 경로라 이 수정의 이득을 그대로 받는다.
- **두 마커 공존 시 철거가 hcg-core 산출물을 파괴할 수 있었다.** 철거 판정은 레거시 마커의
  매니페스트와 디스크를 비교하므로, hcg-core 가 쓴 파일은 매니페스트에 없어 "사용자 수정본"으로
  오인된다. 레거시 위에 `/hcg-core:init --gap-fill` 을 먼저 돌린 프로젝트에서 **hcg-core 가 방금
  만든 `.github/workflows/ci.yml` 을 `.legacy` 백업 후 삭제하는 계획**이 실제로 나왔다.
  `upgrade.md` §0 이 산문으로 금지했지만 엔진은 막지 않았다 — 판단을 절차 준수에만 맡기는 것이
  이 결함의 본체다. → `--mode retire` 는 `.claude/.hcg-core.json` 이 있으면 `coreMarkerPresent:true`
  로 **fail-closed**(dry-run 도 계획을 내놓지 않는다 — 금지된 상태에서 계획을 보여주면 그대로
  진행하게 된다). **override 플래그를 두지 않은 이유**: 이 상태에서 철거가 옳은 경우가 없고,
  탈출구를 만들면 정확히 그 파괴 경로가 다시 열린다. 공존 상태의 정리 절차는 §0 분기에 있다.

**회귀 테스트 18건**(단위 12 · 실파일 4 · 이행 end-to-end 2 — 불가침 가드 2건 포함). 수정 전 엔진에
걸어 **실제로 실패하는지 확인**했다(통합 5건 실패 · 단위 파일은 링크 실패). 이행 스모크에
"릴리스마다 upgrade 를 돌린 프로젝트" 시나리오를 추가해, `orphans == 0` 단언이 이제 그 상태를
실제로 통과한다.

#### 배포 전 정합 점검 반영 (2026-08-11)

`CLAUDE-core.md`(루트본·템플릿본 2벌)의 개정 근거 기록 포인터를 "변경 이력(README)" →
"하네스 레포의 `CHANGELOG.md`" 로 교정 — CHANGELOG 분리(`03077e8`) 이후 끊긴 포인터이고, 이
파일은 프로젝트로 렌더되므로 소비 프로젝트에는 README 가 존재하지 않는다. 같은 개정을 hcg-core
쪽에도 적용했다(위 0.1.1 항목 2). 레거시 이행 안내 문구는 이미 `/hcg-harness:upgrade` 자동
절차를 가리키고 있어 그대로 두고, 어긋나 있던 hcg-core 훅 쪽을 이쪽에 맞췄다.

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
