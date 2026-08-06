# Workflows (hcg-core — 3종)

레거시 hcg-harness 의 dynamic-mode 템플릿 5종 중, 내장 기능과 겹치지 않는 3종만 싣는다
(리뷰 → `/code-review` ultra, 감사·리서치 → ultracode / 즉석 Workflow — CLAUDE-core 라우팅 표).
`.js` 파일은 레거시 0.2.2 와 **byte-identical 사본**이다 — 런타임 계약·검증 이력·`// CUSTOMIZE`
시임 상세는 레거시 `hcg-harness/workflows/README.md` 가 정본이다.

| 템플릿 | 목적 | 쓰기 | 호출 |
|---|---|---|---|
| `migrate` | 대량 코드모드 — 파일별 worktree 격리 변환 + 집계 게이트 (fail-closed) | ✅ 격리 | `Workflow({ name:'migrate', args:'<glob> :: <변경 지시>' })` |
| `test-gen` | 모듈별 테스트 백필 — 격리 생성 + co-located 스위트 실행 (fail-closed) | ✅ 격리 | `Workflow({ name:'test-gen', args:'<모듈 glob> :: <프레임워크/규약>' })` |
| `converge` | contracts/ ↔ 코드 드리프트 검출 → 제안 태스크 (read-only, fail-closed) | ❌ | `Workflow({ name:'converge', args:'<선택 스코프, 예 db-schema,api-spec>' })` |

- merge-back·게이트 명령 등 `// CUSTOMIZE` 시임은 소비 프로젝트가 배선·재검증한다.
- Workflow 기능 비활성 환경(`disableWorkflows`)에서는 사용 불가 — 순차 직접 수행으로 대체한다.
- `audit`/`review` 부활 조건: 즉석 저작·내장 기능이 실전에서 불충분하다고 증명될 때(레거시에서 복사).
