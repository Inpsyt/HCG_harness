# Workflows (hcg-core — 3종)

레거시 hcg-harness 의 dynamic-mode 템플릿 5종 중, 내장 기능과 겹치지 않는 3종만 싣는다
(리뷰 → `/code-review` ultra, 감사·리서치 → ultracode / 즉석 Workflow — CLAUDE-core 라우팅 표).
`.js` 파일의 **실행 본문은 레거시 0.2.2 사본**이다(런타임 계약·fail-closed 구조·`// CUSTOMIZE`
시임 그대로). **예외는 `meta` 블록**이다 — `description`·`whenToUse` 는 워크플로 목록으로
**사용자·세션 컨텍스트에 노출되는 표면**이라, 레거시 교리(역할 파이프라인·plan-agent·계약 잠금)를
그대로 실으면 hcg-core 에 없는 절차를 안내하게 된다. 그래서 meta 텍스트만 hcg-core 라우팅
(결합된 작업 = 세션이 직접 · 독립 Task = `parallel-tasks`)에 맞춰 다시 썼다.
본문 개정 이력·검증 근거는 하네스 레포의 `CHANGELOG.md` 와 레거시 `hcg-harness/workflows/README.md`
(레포에만 있다 — hcg-core 만 설치한 프로젝트에서는 열람 불가)를 본다.

| 템플릿 | 목적 | 쓰기 | 호출 |
|---|---|---|---|
| `migrate` | 대량 코드모드 — 파일별 worktree 격리 변환 + 집계 게이트 (fail-closed) | ✅ 격리 | `Workflow({ name:'migrate', args:'<glob> :: <변경 지시>' })` |
| `test-gen` | 모듈별 테스트 백필 — 격리 생성 + co-located 스위트 실행 (fail-closed) | ✅ 격리 | `Workflow({ name:'test-gen', args:'<모듈 glob> :: <프레임워크/규약>' })` |
| `converge` | contracts/ ↔ 코드 드리프트 검출 → 제안 태스크 (read-only, fail-closed) | ❌ | `Workflow({ name:'converge', args:'<선택 스코프, 예 db-schema,api-spec>' })` |

- merge-back·게이트 명령 등 `// CUSTOMIZE` 시임은 소비 프로젝트가 배선·재검증한다.
- Workflow 기능 비활성 환경(`disableWorkflows`)에서는 사용 불가 — 순차 직접 수행으로 대체한다.
- `audit`/`review` 부활 조건: 즉석 저작·내장 기능이 실전에서 불충분하다고 증명될 때(레거시에서 복사).
