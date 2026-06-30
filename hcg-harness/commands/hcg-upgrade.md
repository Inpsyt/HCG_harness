---
description: 하네스 관리 파일을 새 템플릿으로 안전 재동기화 (사용자 변경 보존)
---

# /hcg-harness:hcg-upgrade

마커 + 매니페스트를 근거로 하네스 관리 파일만 재생성한다. 사용자 변경은 절대 무단 덮어쓰지
않는다(충돌은 `<파일>.new` + 보고).

## 절차

1. **실행**:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" --mode upgrade --profile hcg --profiles-dir "${CLAUDE_PLUGIN_ROOT}/profiles" --target "${CLAUDE_PROJECT_DIR}"`
   (profile/choices는 마커에서 재사용되므로 질문 없음.)
2. **결과 해석** (JSON):
   - `ok:false, error` (마커 없음 등) → 그대로 보고. 마커 없으면 `/hcg-harness:hcg-init` 먼저.
   - `ok:true` → `overwritten`/`created`/`conflicts`(.new)/`skipped` 목록을 사용자에게 보고.
3. **충돌 안내**: `conflicts`가 있으면 각 `<파일>` vs `<파일>.new` 를 사용자가 비교/병합하도록
   안내한다(자동 병합 금지).
