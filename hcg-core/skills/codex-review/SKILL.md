---
name: codex-review
description: 외부 교차모델(codex) 온디맨드 적대적 리뷰. 다음 7종 중 하나를 완료했으면 세션은 리뷰를 반드시 제안한다(실행은 사용자 결정) — ① 스키마 마이그레이션·데이터 이관 ② auth·권한·세션 경계 ③ 결제·외부 부작용(메일·웹훅·서드파티 쓰기) ④ 동시성·트랜잭션·정산 invariant ⑤ 보안 표면(입력 검증·파일 업로드·인젝션 가능 지점) ⑥ 릴리스·배포 직전 누적 diff ⑦ 긴 세션 끝의 대량 신규 코드. 목록 밖에는 제안하지 않는다(상시 게이트로의 퇴화 금지). 게이트 아님 · 백그라운드 실행 · D9 핵심(정확성·계약 위반만 액션). 트리거 해당 작업을 완료했거나 릴리스를 준비할 때 로드.
---

# Codex Review — 외부 교차모델 온디맨드 리뷰 (게이트 아님)

같은 계열 모델이 공유하는 맹점을 다른 모델 분포의 눈으로 보완한다 — 작성자가 생각 못 한 실패는
테스트도 못 잡고(rung-1 의 한계), fresh-context 리뷰어(`/code-review`)도 같은 사고 패턴을
공유한다. **상시 게이트가 아니다** — 아래 트리거에서만 제안하고, 실행 여부는 사용자가 결정한다.

## 트리거 (닫힌 목록)

> 목록은 §1 의 비가역 축과 동형이다. **항목 추가·완화는 금지** — "애매하면 돌리자"는 상시
> 게이트로의 퇴화다. 개정하려면 하네스 레포의 `CHANGELOG.md` 에 근거를 남긴다(살아있는 문서 규율).

다음 중 하나에 해당하는 변경을 완료했거나 릴리스를 준비할 때, 세션은 codex 리뷰를 **반드시
제안한다**(제안 의무 — 빼먹으면 규칙 위반. 단 실행 결정은 사용자):

1. 스키마 마이그레이션 · 데이터 이관
2. auth · 권한 · 세션 경계
3. 결제 · 외부 부작용(메일·웹훅·서드파티 쓰기)
4. 동시성 · 트랜잭션 · 정산/회계 invariant
5. 보안 표면(입력 검증 · 파일 업로드 · 인젝션 가능 지점)
6. 릴리스·배포 직전 누적 diff (1회)
7. 긴 세션 끝의 대량 신규 코드 (자기 가정 앵커링이 최대인 지점)

해당 없는 가역적 일상 변경에는 **제안하지 않는다** — 일반 코드 리뷰는 내장 `/code-review`.

## 실행 절차

1. **base 결정**: 리뷰 범위의 시작 커밋을 대화 맥락·`git log` 로 정한다(작업 시작 시점 커밋).
   `git diff <base>...HEAD` 가 비어 있으면 "리뷰할 변경 없음"으로 보고하고 종료한다.
2. **백그라운드 실행**: 설치된 codex 채널(codex-companion 플러그인 커맨드 또는 `codex` CLI)로
   `<base>...HEAD` 누적 diff 의 적대적 리뷰를 **백그라운드**(`run_in_background`)로 요청하고,
   아래 「D9 포커스」 를 focus/지시문으로 함께 전달한다.
   **결과를 기다리는 동안 무관 작업을 계속한다** — 크리티컬 패스 동기 대기 금지.
3. **판정 (D9 핵심 — KIND 가 severity 보다 먼저)**: 결과의 각 finding 을 KIND 로 먼저 분류한다.
   - **액션 대상**: ① 정확성·안전 결함(crash · 데이터 손실/오염 · race · 보안/인젝션 · auth
     우회 · 코드 자기 의도와 모순되는 동작) **또는** ② 명시 요구사항·`contracts/` 위반
     → 수정하고 §4 사다리로 재검증한다.
   - **참고 부록**: 그 외 전부(갭/개선 제안 · "더 방어적으로" · 스타일/네이밍/리팩터 ·
     요구사항 밖 커버리지) — codex 가 Critical/High 를 매겼어도 **부록**이다. 사용자에게
     요약만 전달하고 **작업을 막지 않는다**.
4. **완료 보고**: 실행 여부 · base · 액션 대상 N건(수정 내역 + 재검증 결과) · 부록 요약.

## D9 포커스 (codex 호출 시 그대로 전달)

> Adversarial review of the cumulative diff. Classify each finding by KIND BEFORE severity.
> GATING (must fix): correctness/safety defects (crash, data loss/corruption, race condition,
> security/injection, auth bypass, behavior contradicting the code's own intent) OR violations
> of an explicit requirement/contract (contracts/: db-schema, api-spec, shared-types,
> design-guide). NON-GATING (appendix only, even if rated Critical/High): "would be nice to
> add", gap/enhancement, "could be more defensive" (over-design), style/naming/refactor,
> coverage beyond stated requirements. Do not fail the change for missing nice-to-haves.

## 실패 모드 (fail-open — 게이트가 아니므로 작업을 볼모로 잡지 않는다)

- codex 미설치 · 인증 만료 · 타임아웃 → 상태와 해결 방법(플러그인 설치 / `setup` 재인증 /
  재시도)을 사용자에게 알리고, 리뷰 없이 진행할지 묻는다.
- 실패를 조용히 "통과"로 둔갑시키지 않는다 — 완료 보고에 **"리뷰 실행 못 함(사유)"** 으로
  명시한다. 리뷰 부재와 리뷰 통과는 다른 상태다.

## 퇴화 가드 (가드레일이 게이트로 되돌아가지 않게)

- **트리거는 닫혀 있다** — 목록 밖 제안 금지, 확장은 문서 개정 절차로만.
- **codex 출력은 조언이다** — 액션 대상 KIND(정확성·계약 위반) 외의 어떤 finding 도 작업을
  막지 못한다.
- **실행은 항상 백그라운드** — 리뷰가 도는 동안 세션이 손을 놓으면 비동기의 이득이 소멸한다.
- **강제 없음** — 제안은 의무지만 실행은 사용자 결정. PASS 스탬프 개념 자체가 없다.
