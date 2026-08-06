---
description: 프로젝트에 hcg-core 하네스(+선택형 앱 골격)를 부트스트랩
---

# /hcg-core:init

이 커맨드는 대화/오케스트레이션만 담당하고, 모든 파일 작업은
`${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs` 엔진이 수행한다.

## 절차

1. **사전 안내**: 부트스트랩은 파일을 생성하지만 setup 명령(`npm install` 등)은 실행하지
   않는다고 사용자에게 알린다.
2. **AskUserQuestion 으로 수집**:
   - 프로젝트명 (`{{PROJECT_NAME}}`)
   - 앱 디렉터리: `apps/web` (기본 — v1 은 이 값 고정 권장)
   - **앱 골격 생성 여부**: 예(기본 — 빈 프로젝트) / 아니오(기존 앱에 하네스만 얹음 →
     하네스 레이어 + contracts 만 생성)
3. **init 실행**:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.mjs" --mode init --profile hcg --project-name "<NAME>" --app-dir "<APP_DIR>" --profiles-dir "${CLAUDE_PLUGIN_ROOT}/profiles" --target "${CLAUDE_PROJECT_DIR}"`
   (`<APP_DIR>` = 2단계 수집값, 기본 `apps/web`. "앱 골격 아니오"를 선택했으면 명령 끝에
   `--no-app` 을 붙인다.)
4. **결과 해석** (JSON):
   - `ok:false, blocked:true` → 비어있지 않은 폴더. `--gap-fill`(없는 것만 채움) 또는
     `--force`(덮어씀) 재실행을 제안하고, 동의 시 해당 플래그로 3단계 재실행.
   - `ok:false, alreadyBootstrapped:true` → 이미 부트스트랩된 프로젝트. 템플릿 갱신은
     `/hcg-core:upgrade` 를 안내하고, 재생성을 원할 때만 `--force` 재실행.
   - `ok:false, error` → 오류 그대로 보고.
   - `ok:true` → 생성 파일 요약 + `setupCommands` 를 코드블록으로 안내(앱 골격 생성 시에만).
     실행은 사용자 몫.
5. **다음 단계 안내**:
   - `.claude/project.md`(인스턴스 슬롯)·도메인 스킬·`contracts/*` 를 채우라고 안내한다.
   - **UI 표준 확인**: 세션에 `ax-wireframe` 스킬이 있는지 확인하고, 없으면 "UI 작업 전
     ax-wireframe(HCG AX 전사 표준) 설치가 필요합니다"를 고지한다(설치 채널은 사내 배포 —
     이 플러그인은 사본을 싣지 않는다).
