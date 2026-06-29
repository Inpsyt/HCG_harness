---
description: 빈 프로젝트에 HCG 하네스 + 앱 골격을 선택형으로 부트스트랩
---

# /hcg-init

이 커맨드는 대화/오케스트레이션만 담당하고, 모든 파일 작업은
`${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs` 엔진이 수행한다.

## 절차

1. **사전 안내**: 부트스트랩은 파일을 생성하지만 setup 명령(`pnpm install` 등)은 실행하지
   않는다고 사용자에게 알린다.
2. **프로파일 목록**: 다음을 실행해 사용 가능한 프로파일을 읽는다.
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" --mode init --profile __list__`은 사용하지 말고,
   `profiles/` 목록은 `discoverProfiles`가 노출되어 있으나 v1은 단일 `hcg` 프로파일이므로
   바로 다음 질문으로 진행한다.
3. **AskUserQuestion**으로 수집:
   - 프레임워크/프로파일: 기본 `hcg` (v1 선택지 1개)
   - 프로젝트명 (`{{PROJECT_NAME}}`)
   - 앱 레이아웃: `apps/web`(모노레포, 기본) — v1은 이 값 고정 권장
4. **init 실행**:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" --mode init --profile hcg --project-name "<NAME>" --app-dir apps/web --profiles-dir "${CLAUDE_PLUGIN_ROOT}/profiles" --target "${CLAUDE_PROJECT_DIR}"`
5. **결과 해석**:
   - JSON `ok:false, blocked:true` → 비어있지 않은 폴더. 사용자에게 `--gap-fill` 또는 `--force` 재실행을 제안(동의 시 해당 플래그로 다시 4단계).
   - JSON `ok:false, error` → 오류 그대로 보고.
   - JSON `ok:true` → 생성 파일 요약 + `setupCommands`를 코드블록으로 안내. 사용자가 원하면 실행.
6. **다음 단계 안내**: `.claude/project.md`·도메인 스킬·`contracts/*`를 채우라고 안내.
