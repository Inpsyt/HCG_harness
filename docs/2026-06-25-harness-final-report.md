# HCG Harness — 최종 보고서

**작성일**: 2026-06-25
**대상**: `Inpsyt/HCG_harness` `main` (포터블 Claude Code 멀티에이전트 개발 하네스 플러그인)
**방법**: 6차원 전수 감사(13 에이전트) + 적대 검증(7 gap/risk → **7 confirmed / 0 refuted**) + 기계 검증

---

## 0. 종합 판정

하네스는 **프로덕션 채택 가능한 건강한 상태**다. 6개 감사 차원 중 **4개 solid**(워크플로 fail-closed · 방법론 정합 · 포터빌리티 경계 · 한계 정직성), 1개 minor, 1개 gaps였고 — gaps의 핵심(세션-시작 hook 무테스트)은 **이 보고서 작성 중 해소**(테스트 45/45). 나머지 확정 갭은 *기능 결함이 아니라 미문서 한계*였고 전부 문서화했다. 설계의 차별점은 선행 사례(MetaGPT·Spec Kit·Claude Code 공식)와 정합하며, 한계는 은폐 없이 명시돼 있다.

---

## 1. 현재 인벤토리 (post-changes)

| 구성요소 | 수 | 내용 |
|---|---|---|
| 에이전트 셸 | 5 | plan · qa · db · backend · front (탈인스턴스 템플릿) |
| 스킬 | 7 | 프로세스 4(pipeline-phase · codex-review · verification-ladder · contract-authoring) + HCG 스택 3(db/backend/frontend-conventions) |
| Hooks | 4 이벤트 | PreToolUse(contracts-lock + 파괴 명령 가드) · PostToolUse(eslint + opt-in tsc) · SessionStart(컨텍스트) · Stop(phase-gate) — 4 스크립트 + 4 런처 |
| 워크플로 | 5 | audit · migrate · test-gen · review · converge (dynamic-mode fail-closed 템플릿) |
| 테스트 | **45** | 4개 hook 전부의 pure 함수 단위 테스트(node:test) |
| 템플릿 | 4 | project.md · CLAUDE.md · codex-review.mjs · ci-contract-drift.md |
| 코어 | — | CLAUDE-core.md (파이프라인 ①–⑥ · fast-path · Operating Rules §0–§5) |

**파이프라인**: plan(Clarify→MoSCoW→contracts→Analyze 게이트) → db/be/fe → qa(codex D9 게이트) → 버그 시 재루프. 소규모는 fast-path(4게이트 + fast_path_log). 결합도 낮은 대량/탐색은 workflow.

---

## 2. 세션 이력 (4 커밋)

| 커밋 | 내용 |
|---|---|
| `e9ef2ef` | **KMA 잔재 제거** — Drizzle 잔재·출처 문구·부트스트랩 설계문서 제거(전역 grep 0) |
| `7ed770b` | **하드닝** — contracts-guard · phase-gate · tsc/멀티dir · 본문/스킬 중복 제거 · MoSCoW · contract-authoring · review 워크플로 · 34 테스트 |
| `6e71ca0` | **벤치마크 + 로드맵** — converge 워크플로 · /clarify+/analyze · /sandbox 권장 · 머신체크 계약 · **agent-identity 재검증(intent-lock 확정)** |
| (본 커밋) | **최종 감사 수정** — 누락 테스트 추가(→45) · 미문서 한계 문서화 · 본 보고서 |

부수 작업: 원격 `Inpsyt/HCG_harness` 등록, `master→main`, 무관 히스토리 병합.

---

## 3. 최종 감사 결과 (6차원)

| 차원 | 건강도 | 요지 |
|---|---|---|
| 워크플로 fail-closed | ✅ solid | 5 템플릿 모두 degraded→incomplete 강제, false-clean/pass/aligned 경로 **0**. review/converge는 의도적으로 가볍되(불량 요소 drop) fail-closed 유지 |
| 방법론 정합 | ✅ solid | 에이전트 본문이 preload 스킬에 위임(중복 0), Clarify/Analyze 통합, D9·MoSCoW·게이팅 일치, dangling 참조 0 |
| 포터빌리티 경계 | ✅ solid | 패키지에 인스턴스 파일 0·도메인 누출 0, install A/B 정확, env 시임 문서화 |
| 한계 정직성 | ✅ solid | 알려진 한계 전부 명시("guardrail not wall" 등), 벤치마크 미입증 주장은 ⚠ 표기 |
| 인벤토리 일관성 | 🟡 minor | 카운트·교차참조·매니페스트 정확. **단 hook 테스트 3/4**(해소됨↓) |
| Hook 정확성 | 🟡 gaps→해소 | fail-open/closed·intent-lock·런처 정확. **session-start hook 무테스트**(해소됨↓) |

### 적대 검증된 갭 7건 → 처리

| 갭 | 심각도 | 처리 |
|---|---|---|
| `session-start-context.test.mjs` 누락(pure 함수 5개 무테스트) | high | ✅ **수정** — 테스트 11건 추가(전체 45/45) |
| ↳ 동일 건(hooks 차원 재확인) | high | ✅ 위와 동일 |
| 플러그인 per-agent 필드 무시 한계가 메인 문서 미반영 | medium | ✅ **문서화** — boundary "Known limitations" |
| 토큰/비용 예산·관측 부재 | medium | ✅ **문서화**(한계로 명시) |
| 성능/확장 한계 미측정 | medium | ✅ **문서화**(한계로 명시) |
| 워크플로 런타임 CLI 2.1.183 핀 | medium | ✅ **문서화**(업그레이드 시 rung-4 재확인) |
| 에이전트 self-report는 prompt-driven | low | ✅ 이미 명시(boundary에 재확인) |

> **0 refuted** — 7건 모두 적대 검증에서 실재로 확인됨. 모두 처리 완료(수정 또는 정직한 문서화).

---

## 4. 검증 상태

- `claude plugin validate hcg-harness --strict` + 마켓플레이스 `--strict` → **exit 0**
- hook 단위 테스트 **45/45 pass** (4개 hook 전부 커버)
- 5개 워크플로 구문 OK + meta 로드 OK
- 에이전트 `skills:` → 번들 SKILL.md **11/11 resolve** (dangling 0)
- KMA 도메인 문자열 전역 **0**
- 워크플로 fail-closed: 적대 리뷰 false-clean 경로 **0**

> 환경 의존(rung-4, 미실행): 실설치 end-to-end, 서브에이전트에서 PreToolUse 발화 여부, 대규모 fan-out 실행. 문서화됨.

---

## 5. 미해결 / 보류 (의도적)

| 항목 | 분류 | 사유 |
|---|---|---|
| HITL approve/edit/respond + 재개형 체크포인트 | 보류 | 플랫폼 의존(hook은 allow/deny/ask까지) · 설계 선행 |
| 순차→그래프 dispatch 재설계 (B-2) | 게이트 | SWE 도메인 실증 부재(벤치 Open Q #1) |
| per-agent 강제 재패키징 (B-3) | 게이트 | 플러그인이 per-agent 필드 무시(Open Q #2); intent-lock + `/sandbox`가 현 최선 |
| 머신체크 계약 기본 강제 | 부분 | *규정*은 강화(contract-authoring) + CI 템플릿 제공; 기본 강제는 소비 프로젝트가 배선 |
| 평가/회귀 하네스(SWE-bench식)·repo-map·영속 메모리 | 미조사 | 벤치 검증 세트 미수집(Open Q #4) — 후속 |

---

## 6. 알려진 한계 (정직 고지)

전부 `docs/portable-instance-boundary.md` §Known limitations 에 명시:
- **Hooks는 보안 경계가 아님** — regex 가드 우회 가능, intent 기반(페이로드에 agent 식별자 없음, 2026-06-25 재검증). 실경계는 `/sandbox`.
- **플러그인 per-agent 강제 제약** — 플러그인 서브에이전트는 `hooks`/`mcpServers`/`permissionMode` 무시.
- **토큰/비용·성능 미계측**, **런타임 CLI 2.1.183 핀**, **self-report는 prompt-driven**.

---

## 7. 권고 (선택)

1. (있다면) **HITL `ask` 게이트** — 위험 도구에 PreToolUse `ask` + 피드백(플랫폼 지원 범위 내 achievable slice).
2. **소비 프로젝트 1곳에서 end-to-end 설치 검증**(rung-4) — 서브에이전트 PreToolUse 발화·게이트 동작 실측.
3. B-2/B-3 결정을 위한 **SWE-bench식 순차 vs 그래프 소규모 실증**(Open Q #1).

이상으로 현 하네스는 **클린(KMA 0) · 일관 · fail-closed · 정직하게 문서화된** 상태이며, 핵심 설계는 선행 사례 대비 견고하다. 남은 것은 *플랫폼 의존 기능*과 *재검증 게이트 항목*뿐이다.

---

## 부록 — 관련 문서

- 선행 사례 벤치마크: `docs/2026-06-25-harness-benchmark-review.md`
- 포터블/인스턴스 경계 + 알려진 한계: `docs/portable-instance-boundary.md`
- 설치: `docs/install.md` · 워크플로 규약: `hcg-harness/workflows/README.md`
- 감사 run: `wf_5c8cc4dd-4a2` (6차원 + 검증)
