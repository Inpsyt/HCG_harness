# design-guide (SSOT)

> 계약서. plan/orchestration 역할만 작성하며 기본 잠금(읽기전용)이다.

## UI 표준 (기본값 — HCG AX)

이 프로젝트의 UI는 **HCG AX 표준**을 따른다.

- **정본(회사 표준)**: `ui-standard` 스킬 (hcg-harness 내장 — Inpsyt/ax-output-standardization
  `ax-wireframe`의 사본). 머신에 ax 스킬 4종이 설치돼 있으면 `/ax-wireframe` 등 사람용
  스킬도 같은 표준이다.
- **이 파일의 역할**: 프로젝트별 확장·오버라이드(배지/상태 색상 매핑, 도메인 시각 규칙 등)를
  기록한다. 아래 「프로젝트별 확장」에 없는 값은 ui-standard 기본값을 따른다.

### 핵심 토큰 요약 (상세·정본은 ui-standard 스킬의 references/·html/)

- **해상도**: 데스크톱 아트보드 1920 / 콘텐츠 컨테이너 1440(중앙 정렬) / 모바일 360
- **색**: 순수 무채색(모노) — 잉크 `#111111`, 본문 `#333333`/`#4D4D4D`, 보조 `#767676`,
  면 `#FFFFFF`/`#F7F7F7`/`#EFEFEF`, 테두리 `#E0E0E0`/`#E7E7E7`. 포인트 컬러 금지
  (상태는 위치·굵기·크기로). 이미지는 그레이스케일.
- **서체**: Pretendard → Noto Sans KR → system. 굵기 Regular/SemiBold 2단 위주.
- **타입 스케일(px)**: Display 48–56 · H1 34–44 · H2 28–32 · H3 20–24 · Body 16–18 ·
  Caption 12–14 · Label 12–13
- **라운드**: 컨트롤 8–10 · 카드 12–16 · 칩/아바타 999
- **아이콘**: Phosphor Regular(라인, stroke 2, round) — 채움(`-fill`)·다색 금지
- **CSS 변수**: ui-standard 스킬 `html/tokens.md`의 `:root` 블록을 그대로 주입한다.

## 프로젝트별 확장 (plan-agent가 채운다)

_(아직 없음 — 배지/상태 색상 매핑, 도메인 컴포넌트 규칙 등을 여기에 추가한다.
값을 추가하면 그 값이 ui-standard 기본값보다 우선한다.)_
