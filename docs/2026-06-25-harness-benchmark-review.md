# HCG Harness — 선행 사례 벤치마크 검토 리포트

**작성일**: 2026-06-25
**방법**: deep-research 워크플로 (5각 병렬 검색 → 24 소스 fetch → 112 주장 추출 → 25 주장 3표 적대 검증 → 22 confirmed / 3 killed → 12 findings)
**비교군**: ① AI 멀티에이전트 코딩 프레임워크(MetaGPT·LangGraph·블랙보드) ② 에이전트 CLI 생태계(Claude Code·Trail of Bits) ③ 스펙/계약 주도 툴링(Spec Kit)
**목표**: (C) 유지 — 잘 설계된 것 검증 / (A) 추가 — 빠진 best-practice / (B) 수정·재설계 신호

> **범위 주의 (2가지)**:
> 1. 원 요청은 *ADD/REMOVE/MODIFY* 였으나 이번 조사는 **(C)유지·(A)추가·(B)수정**으로 한정 — *REMOVE/단순화*는 이번 범위 밖(별도 검토 가능).
> 2. 하네스는 **포터블 플러그인**이다. 패키지엔 방법론·스킬·hooks·워크플로·템플릿만 담기고, `contracts/`(db-schema·api-spec·shared-types.ts·design-guide)·`tasks/phase-meta.yml`·`scripts/codex-review.mjs`는 **하네스가 *규정*하되 소비 프로젝트가 *인스턴스화*하는 per-project 산출물**이다(패키지에 실파일로 존재하지 않음). 아래 "현재 상태"는 *패키지 제공물*(스킬·hooks·워크플로) vs *인스턴스 규정* vs *갭*을 구분한다.

> **신뢰도 읽는 법**: 핵심 결론은 1차 출처(arXiv 피어리뷰·Anthropic/LangGraph/Spec Kit 공식 문서) 기반 **high**. 정량 재설계 주장 1건만 **medium**. 브리프에서 "차별점"이라 주장했으나 **독립 검증 주장이 0건**인 항목은 ⚠로 표기(타당하나 *이 리서치로는 미입증*).

---

## 0. 한 줄 결론

핵심 아키텍처(역할 분담 SOP 파이프라인 · contracts-블랙보드-SSOT · 서브에이전트 격리 · 스킬 spawn-preload · PreToolUse 결정적 가드)는 선행 사례와 **강하게 정합 — 유지** *(단 일부 차별점 — "KIND before severity" 과설계-억제 게이팅 · fail-closed 워크플로 템플릿 · verification ladder — 은 ⚠ 독립 검증 주장 0건: 타당하나 이 리서치로는 미입증)*. 다음 레이어는 ① HITL 승인+체크포인트, ② OS sandbox(실제 enforcement 경계), ③ `/clarify`·`/analyze`·`/converge`(모호성·일관성·drift 단계), ④ 계약의 머신 체크화. 단 ⑤ 순차→그래프 재설계만 **재검증 후** 판단(*medium·데이터사이언스 한정·SWE 일반화 불가*); ⑥ "agent-identity 잠금" 전제는 **재검증 완료(2026-06-25) → intent-lock 확정**(현재 공식문서상 식별자 없음; per-agent 강제는 Anthropic 기능 요청 사항).

---

## (C) 유지 — 잘 설계됨 (선행 사례와 정합)

| 우리 설계 | 근거 (출처) | 판정 |
|---|---|---|
| plan→db→be→fe→qa 역할 파이프라인 | MetaGPT(ICLR 2024): SOP를 프롬프트로 인코딩 + "assembly line" 역할 분담 — 5역할 셸과 직접 대응 [1] | ✅ high |
| contracts/ SSOT + 리뷰로 환각 억제 | MetaGPT: 구조화된 message pool로 중간결과 검증 → "idle chatter 환각 감소". contracts 블랙보드 = 그 pool의 아날로그 [1] | ✅ high |
| 서브에이전트 컨텍스트 격리 + **스킬 spawn-preload** | Claude Code 공식: 독립 컨텍스트/권한, `skills:` frontmatter가 시작 시 스킬 전문 주입 [4][5] | ✅ high |
| PreToolUse 가드(contracts-lock·파괴 명령) | 공식 문서의 정식 결정적 강제 계층(문서 예시가 `rm -rf` 차단) [6][7][8] | ✅ high |
| 게이트형 단계 파이프라인 | Spec Kit도 동일 strict 게이트(`/specify→/plan→/tasks→/implement`) [10][11] | ✅ high |

**차별적·방어 가능**: contracts-블랙보드-SSOT + write-lock, 스킬-preload 역할 셸, 게이트 파이프라인.

> ⚠ **증거 없음(유의)**: "KIND before severity" 과설계-억제 게이팅, fail-closed 워크플로 템플릿, verification ladder, MoSCoW↔게이트 연결 — *독립 비교 주장 0건*. 타당하나 이 리서치로는 "차별적"이라 입증되지 않음. (브리프 주장이 검증 세트에 안 걸린 것이지, 부정된 것은 아님.)

---

## (A) 추가 권장 — 빠진 best-practice (우선순위순)

각 항목에 **현재 상태(이번 세션 반영분 포함) vs 갭**을 함께 표기.

### 1. Human-in-the-loop 승인 체크포인트 · `high`
LangGraph는 도구 호출마다 정책 검사 후 **interrupt**로 멈추고 **4결정**(approve / edit / reject+피드백 / respond=실행 건너뛰고 사람 답을 결과로) 제공. [3]
- **현재**: PreToolUse `deny`(차단) + `HARNESS_CONTRACTS_WRITE` 해제 + Stop `HARNESS_PHASE_GATE_BLOCK`(차단).
- **갭**: 구조화된 *approve/edit/respond + 피드백 라우팅*이 없음 — deny만 가능.

### 2. 영속 체크포인트·재개(resumability) · `high`
LangGraph HITL은 **checkpointer 필수**(상태 영속 → 안전 일시정지·재개). [3]
- **현재**: 하네스가 phase-meta 스키마(+`fast_path_log`)를 `pipeline-phase` 스킬에 *규정* → *인스턴스*에서 산출물(Phase/Task/결정) 영속화. (스키마·git은 패키지/도구 차원, `phase-meta.yml` 파일 자체는 per-project.)
- **갭**: *실행 상태* 재개 메커니즘 없음(중단된 Phase를 그 지점에서 이어받는 체크포인트).

### 3. OS 레벨 sandbox(`/sandbox` · Seatbelt/bubblewrap) · `high`
Trail of Bits + Anthropic 공식: **"hooks는 guardrail이지 wall이 아니다"**, `/sandbox` 없으면 **Bash가 deny rule 우회**. [9][6][12]
- **현재**: `contracts-guard.mjs`가 파괴-명령 regex(DROP/TRUNCATE·`rm -rf` 루트·force-push) 차단 + git-worktree 격리. 우리는 이미 이를 "advisory·rung-4 install 확인"으로 **정직하게 표기**.
- **갭**: 우리 regex는 정확히 우회 가능 클래스(`find -delete`, `psql -f`, child-process) — **실제 enforcement 경계가 없음**. `/sandbox`를 방어심층으로 추가 권장.
- ⚠ 단 Ona 연구(`/proc/self/root`)는 sandbox 자체도 우회 가능함을 보임 → "절대 보장"이 아니라 *방어심층*.

### 4. `/clarify` + `/analyze` 전용 단계 · `high`
Spec Kit엔 **모호성 해소 전용**(`/clarify`)과 **교차 아티팩트 일관성 머신 체크**(`/analyze`)가 별도 단계로 존재. [11]
- **현재**: plan-agent가 Phase 0(MoSCoW)·Phase 1(계약)에서 *암묵적*으로 처리.
- **갭**: "모호성 해소"와 "spec↔plan↔tasks 교차 일관성 체크"를 명시 단계로 승격하면 누락 방지.

### 5. Drift 검출·조정 단계(Spec Kit `/converge`) · `high`
선도 도구조차 contracts↔code drift를 **주기적 재평가**로 관리(누락/부분/모순/충족 분류 후 남은 작업을 task로 append). [11]
- **현재**: lock(`contracts-guard`) + qa codex 리뷰로 권위는 유지.
- **갭**: contracts ↔ 구현 *drift 검출* 전용 패스가 없음. (review 워크플로의 `contracts` 차원이 부분적으로 닿지만, 정기 reconciliation 단계는 아님.)

> ⚠ **증거 미수집(그러나 신뢰할 만한 갭)**: 토큰 예산·관측/트레이싱, **SWE-bench식 평가/회귀 하네스**, 세션 간 영속 메모리, repo-map/검색(Aider), reflection/replanning 루프(Reflexion[15]). 검증 세트에 안 걸렸을 뿐 — 후속 조사 권장(↓ Open Q #4).

---

## (B) 수정·재설계 신호

### 1. 산문 `.md` 계약 → 머신 체크 가능 형태로 승급 · `high`
spec-driven 문헌: 스펙이 *생성의 진실원*, "spec-anchored(머신 체크)"가 프로덕션 sweet spot. [10][11]
- **현재**: 하네스의 `contract-authoring` 스킬이 **typed `shared-types.ts` SSOT + api-spec의 Zod/OpenAPI 표현**을 이미 *권고* — 단 `db-schema.md`/`api-spec.md`는 **산문으로 규정**. (이 계약 파일들은 패키지에 없고 소비 프로젝트가 인스턴스화하는 per-project 산출물 — 즉 "부분 진행"은 *규정* 차원이지 패키지 내 실파일이 아님.)
- **권장**: 하네스 *규정*을 머신 체크 우선으로 강화하고, 소비 프로젝트가 계약을 **생성**할 때 db-schema→Zod / api-spec→OpenAPI 로 만들고 **CI drift 체크**를 붙이도록 한다(하네스가 CI drift 체크 템플릿/워크플로를 제공하면 더 강함 — ↓ 로드맵 1·4).
- ⚠ 단 "코드는 스펙에서 재생성, 손수정 금지" 주장은 **0-3 반박됨**[R3] — 완전 재생성은 과함, *point-in-time 조정*이 현 관행. (우리 "읽기전용 구현자가 계약 소비" 모델은 유지하되 머신 체크 계층만 보강.)

### 2. 정적 순차 dispatch → 의존성 그래프 / 자기선택 블랙보드 · `medium`
블랙보드(자기선택)가 master-slave/오케스트레이터 라우팅 대비 **13–57%** 우위. [2]
- ⚠ **신뢰도 medium**: 단일 비심사 preprint · 저자 자기보고 · **데이터사이언스 도메인**(SW개발 아님) · 13–57% 폭 넓음.
- 우리 contracts 블랙보드(공유 *상태*)는 **검증됨**; 신호는 *rigid 순차 dispatch*가 약한 패턴일 수 있다는 것.
- **판단**: SWE 도메인 head-to-head 없이 재설계 금물(↓ Open Q #1). 우리 fast-path가 부분적 우회를 이미 제공.

### 3. 플러그인 패키징이 per-agent 강제를 무력화 · `high`
공식 문서: **플러그인 서브에이전트는 `hooks`·`mcpServers`·`permissionMode` frontmatter를 무시**. [4]
- **충돌**: portability 목표와 직접 충돌 — 플러그인 자체로는 per-agent 강제 불가 → session `settings.json`(거침) 또는 copied `.claude/agents`(단일출처 portability 상실).
- **재설계 고려**: 가드를 session 레벨로 둘지, copied-agent 경로를 캐노니컬로 둘지 결정 필요(↓ Open Q #2).

### 4. ✅ contracts-guard 전제 재검증 완료 — intent-lock 확정 · `해결됨`
**해결(2026-06-25 재검증)**: 현재 Claude Code 공식 문서 기준 PreToolUse 페이로드(`session_id`·`transcript_path`·`cwd`·`permission_mode`·`tool_name`·`tool_input`)에 **에이전트 식별자 없음**, 간접 신호(transcript_path·permission_mode)도 미문서화·불신뢰 → **hook으로 per-agent 강제 불가**가 확정. 따라서 우리 **intent-lock 설계가 옳다(코드 변경 불필요)**. deep-research의 0-3 반박[R2]은 *현재 공식문서 확인으로 기각*(검증 충돌 해소).
- **남은 길**: 진짜 per-agent 강제는 Anthropic 기능 요청(payload에 `agent_type`/`agent_id`) 사항. 그 전까지 intent-lock + `/sandbox`(OS 경계)가 최선.
- (서브에이전트에 PreToolUse가 발화하는지는 여전히 미문서화 → 설치시 rung-4 확인.)

---

## 반박된 주장 (killed) — 중요

| 주장 | 표결 | 함의 |
|---|---|---|
| [R1] 스킬은 progressive disclosure(이름+설명만 로드, 호출 시 본문) | 1-2 killed | 우리 "스킬 spawn-preload"를 **부정하지 못함** → preload 설계 **지지**(별도 3-0 검증) |
| [R2] PreToolUse 페이로드에 agent identity 없음 | 0-3 killed | ✅ **재검증 기각**(2026-06-25 현재 공식문서: 식별자 없음 확인) → intent-lock 확정, deep-research 반박 무효화 (B)-4 |
| [R3] 스펙 재생성으로 drift "원천 제거" | 0-3 killed | **(B)-1** — 완전 재생성은 과함; point-in-time 조정이 현 관행 |

---

## 증거 약점 / 한계 (정직 고지)

1. (A)의 일부 — 토큰 예산·관측, SWE-bench식 평가 하네스, 영속 메모리, repo-map, planning(reflection/replan) — 은 **검증 주장 0건**. 중요성 부정이 아니라 검증 세트 한계.
2. (C)의 일부 차별점("KIND before severity"·fail-closed 템플릿·verification ladder·MoSCoW 연결) — **독립 비교 주장 0건** → 차별성 *미입증*.
3. 최강 정량 MODIFY(블랙보드 13–57%)는 **단일 비심사 preprint·자기보고·데이터사이언스 도메인** → SW개발 일반화 불가, 유일한 medium.
4. **시점 민감**: 다수 출처가 2025–2026 빠른-변화 기능 문서(Claude Code hooks/subagents/sandbox; LangGraph 1.x HITL; Spec Kit `/converge`는 리포트 ~1주 전 추가) → 필드명·동작 변동 가능.
5. 다수 finding이 **문서화된 버그/우회** 동반(플러그인 스킬-preload 간헐 실패 #25834; sandbox `/proc/self/root` 우회; exit-2 동작 #24327) → 메커니즘은 문서화됐으나 무결하지 않음.
6. 비교군 간 대응은 **유추**(LangGraph 오케스트레이션 ↔ Claude Code 서브에이전트 ↔ Spec Kit SDLC 단계)이지 동형 사상이 아님.

---

## 남은 큰 물음 (리서치 미해결)

1. **순차 vs 그래프**: 오케스트레이터-라우팅/순차 파이프라인이 SW개발 과제에서 실제로 그래프/블랙보드보다 못한가? 정량 증거(13–57%)는 데이터사이언스뿐 — SWE-bench식 head-to-head 필요. → **(B)-2 결정 게이트**: 이 답이 순차→그래프 재설계 GO/NO-GO를 정함.
2. **portability ↔ per-agent 강제**: 플러그인 서브에이전트가 hooks/mcpServers/permissionMode를 무시하는 상황에서 session settings(거침) vs copied agents(portability 상실) 중 무엇이 차악인가? portable 플러그인에서 `/sandbox`를 띄울 수 있는가? → **(B)-3 + (A)-3 결정 게이트**: 가드 패키징 방식과 sandbox 도입 가능성.
3. **계약 머신화 비용**: 하네스가 *규정*하는 산문 db-schema/api-spec 을 소비 프로젝트가 Zod/OpenAPI + CI drift 체크로 인스턴스화하는 비용은? (`contract-authoring`이 이미 typed SSOT를 권고하나 패키지에 실파일은 없음; "재생성 원천 제거"는 반박됨[R3].) → **(B)-1 결정 게이트**: 머신화 기본값화 여부.
4. **미검증 갭 우선순위**: 토큰 예산+관측, SWE-bench식 평가, 영속 메모리, repo-map 중 비교군(LangGraph 트레이싱/체크포인트, Aider repo map, SWE-agent ACI, OpenHands)이 실제 권하는 것과 최우선 도입 대상은? → **(A)-1~5 보강 게이트**: 미검증 갭의 도입 순서.

---

## 권장 로드맵 (레버리지순)

| 순위 | 항목 | 분류 | 노력 | 비고 |
|---|---|---|---|---|
| 1 | `/converge` 류 contracts↔code drift 체크 워크플로 | A-5 | 중 | 기존 review.js 패턴 재사용 가능 |
| 2 | plan에 `/clarify`+`/analyze`(모호성·교차 일관성) 단계 | A-4 | 소 | pipeline-phase 스킬에 단계 추가 |
| 3 | install.md에 `/sandbox` 권장 + agent-identity 재검증 | A-3 / B-4 | 소 | 정직 고지 강화 + 전제 재확인 |
| 4 | 계약 머신 체크화(api-spec→Zod/OpenAPI) + CI drift | B-1 | 중~대 | `contract-authoring` 규정 강화 + 하네스가 CI drift 템플릿 제공 |
| 5 | HITL `ask`+피드백 루프 / 실행 상태 체크포인트 | A-1 / A-2 | 대 | 플랫폼 의존, 설계 선행 필요 |
| — | 순차→그래프 재설계 / per-agent 강제 재패키징 | B-2 / B-3 | 대 | **재검증 후** 결정(Open Q #1·#2) |

> **구현 상태 (2026-06-25 후속 커밋)**: #1 `converge` 워크플로 · #2 `/clarify`+`/analyze` 단계(plan + pipeline-phase) · #3 `/sandbox` 권장 + **agent-identity 재검증(→ intent-lock 확정)** · #4 머신 체크 계약 규정 강화 + `templates/ci-contract-drift.md` — **구현 완료**. #5(HITL approve/edit/respond + 실행 상태 체크포인트)는 *플랫폼 의존·설계 선행*으로 보류(hook 은 allow/deny/ask 까지만; resumable 체크포인트는 플랫폼 미지원). B-2(순차→그래프)·B-3(per-agent 재패키징)은 Open Q #1·#2 재검증 게이트로 보류.

---

## 소스 (1차 우선)

- [1] MetaGPT — arXiv:2308.00352 (ICLR 2024)
- [2] Blackboard multi-agent — arXiv:2510.01285 *(비심사 preprint, medium)*
- [3] LangGraph Human-in-the-loop — docs.langchain.com/oss/python/langchain/human-in-the-loop
- [4] Claude Code Subagents — code.claude.com/docs/en/sub-agents
- [5] Steering Claude Code (skills/hooks/subagents) — claude.com/blog/steering-claude-code-...
- [6] Hook development SKILL — github.com/anthropics/claude-code/.../hook-development/SKILL.md
- [7] Claude Code Hooks — code.claude.com/docs/en/hooks
- [8] (위 [5]/[6]/[7] 교차)
- [9] Trail of Bits claude-code-config — github.com/trailofbits/claude-code-config
- [10] Spec-Driven Development (code→contract) — arXiv:2602.00180
- [11] GitHub Spec Kit — github.com/github/spec-kit
- [12] Claude Code Sandboxing — code.claude.com/docs/en/sandboxing
- [15] Reflexion — arXiv:2303.11366 (NeurIPS 2023)
- 기타: Kiro 소개(kiro.dev), MAST 실패 분류(arXiv:2503.13657), Anthropic 멀티에이전트 리서치 시스템

*전체 검증 로그·표결: deep-research run `wf_998d7b2a-7f0`.*
