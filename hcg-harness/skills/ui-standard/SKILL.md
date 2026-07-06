---
name: ui-standard
description: HCG AX의 단일 웹·앱 UI 표준 (hcg-harness 내장본 — upstream ax-wireframe 사본). 웹/앱 화면·와이어프레임·목업·UI를 만들거나(Figma 또는 HTML/CSS), 웹/앱 디자인·레이아웃 작업을 할 때 사용한다. lo-fi 구조 와이어프레임과 hi-fi(고완성도) 모두 포함. 모노 디자인 시스템, 데스크톱 1920/콘텐츠 1440 + 모바일 360, 8대 아키타입, 무채색 실사진, Phosphor 라인 아이콘. Triggers on "와이어프레임/wireframe 만들어줘", "웹/앱 화면·UI·목업 만들어줘", "랜딩/상세/리스트 페이지 짜줘", "HTML로 만들어줘" 류.
---

> **출처**: Inpsyt/ax-output-standardization 의 `ax-wireframe` 사본 (기준 커밋 `0d0130ff36b1786fbdf105e52f7ac0b1e2a7174b`,
> 라이선스: upstream LICENSE · 폰트 OFL). **재동기화**: upstream 갱신 시 클론본의
> `ax-wireframe/` 을 이 폴더로 재복사하고 이 헤더(frontmatter `name`·이 블록)만 다시 적용한다.
>
> **적응 노트**: Figma 경로(시각적 기준·figma-build)는 Figma MCP 가 있을 때만 유효하다.
> 코드 구현 에이전트(front-agent)의 기본 소비는 **`html/` 경로**(tokens·components·sections)다.

# ax-wireframe — HCG AX 웹·앱 UI · 와이어프레임 표준 (단일)

> **웹/앱 UI와 와이어프레임은 하나의 표준이다.** 이 스킬이 그 정본이며, 누가 어떤 작업 내용을
> 주든 항상 같은 스타일이 나오게 하는 정의다. 시각적 정답(source of truth)은 아래 두 Figma
> 페이지이고, **Figma 와이어프레임이 정의**·**HTML/CSS(`html/`)가 그 구현**이다. 새 산출물은
> 이 정의를 그대로 재현한다.

## 시각적 기준 (Source of Truth)

파일: `HCG AX 산출물 표준 v.1.0.0` (fileKey `wXcNHHZFQHHsj3X9mZgIla`)

- **디자인 시스템 (컴포넌트)** — page `:: component` (node `1:7`)
  Foundations · Components · Web Sections · Mobile · Patterns · Dark 등 12개 보드.
  색·타입·라운드·컴포넌트의 완성형 정의.
- **하이파이 와이어프레임** — page `:: wireframe (Hi-fi)` (node `58:9`)
  8대 아키타입(홈·랜딩·리스트·상세·회사소개·아티클·대시보드·요금제)의 데스크톱+모바일 반응형 완성본.
- **로우파이 와이어프레임** — page `:: wireframe (Lo-fi)` (node `37:8`)
  WEB·APP·BANNER 섹션으로 구분된 42종의 구조 와이어프레임.
- **산출물(output) 페이지** — page `:: output` (node `197:2`) — **새 와이어프레임 산출물은 항상 여기에 배치한다.**

> **정의 vs 산출 위치(중요).** `:: component`(1:7)·`:: wireframe (Hi-fi)`(58:9)·`(Lo-fi)`(37:8)은
> **재현 기준(정의)** 이며 새 산출물을 여기 쌓지 않는다. **누가 무엇을 만들어 달라 하든, 완성 산출물은
> `:: output`(197:2)에 넣는다.**

새 화면을 만들기 전, 가장 가까운 아키타입/보드를 위 기준 페이지(1:7·58:9)에서 참고(get_screenshot)한 뒤
동일 토큰·컴포넌트로 재현하고, **결과물은 `:: output`(197:2)에** 둔다. **임의로 색·폰트·간격을 바꾸지 않는다.**

## 절대 규칙 (요약 — 상세는 references/)

1. **해상도**: 데스크톱 아트보드 **1920**, 콘텐츠 컨테이너 **1440**(x=240~1680 중앙 정렬),
   배경 밴드·헤더·푸터는 **풀블리드(1920)**. 모바일 **360**. (대시보드 등 앱셸은 예외적 풀폭)
2. **색 — 순수 무채색(모노)**: 잉크 `#111111`, 본문 `#333333`/`#4D4D4D`, 보조 `#767676`,
   면 `#FFFFFF`/`#F7F7F7`/`#EFEFEF`, 테두리 `#E0E0E0`/`#E7E7E7`, 다크 `#111111`/`#0A0A0A`.
   포인트 컬러 금지(상태는 위치·굵기·크기로). 이미지는 **그레이스케일**.
3. **서체**: Figma에선 **IBM Plex Sans KR**(Regular/SemiBold). 실제 CSS 표준은
   Pretendard → Noto Sans KR → system. 굵기는 Regular / SemiBold 2단 위주.
4. **타입 스케일(px)**: Display 48–56 · H1 34–44 · H2 28–32 · H3 20–24 · Body 16–18 ·
   Caption 12–14 · Label 12–13. 라운드: 컨트롤 8–10 · 카드 12–16 · 칩/아바타 999.
5. **아이콘**: **[Phosphor Icons](https://phosphoricons.com)** Regular(라인, stroke 2, round)로 통일 — 문서·웹·앱·발표 전 영역 공통. 채움(`-fill`)·다색 금지, 색은 무채색 역할 토큰. HTML은 웹폰트(`ph ph-*`), Figma hi-fi는 Phosphor SVG를 vector로 넣는다(references/figma-build.md 참고).
6. **이미지**: [Unsplash](https://unsplash.com) 그레이스케일(`sat=-100`). Figma엔
   `upload_assets`로 올리고, **해시로 fill을 직접 설정**한다(자동 배치 실패 대비).
7. **로우파이 vs 하이파이**
   - **Lo-fi**: 회색 바(제목 `#C6C6C6`/본문 `#D9D9D9`)로 텍스트 대체, 이미지=“이미지” 라벨 박스,
     구조·정렬·여백만 검증. 색·이미지 없음.
   - **Hi-fi**: 실제 타이포·카피·무채색 이미지·Phosphor 라인 아이콘·컴포넌트로 완성.
8. **구조는 아키타입을 따른다**(references/archetypes.md). 섹션 순서를 임의로 바꾸지 않는다.

## 작업 프로세스

1. **브리프 해석** → 어떤 화면 유형인지 판단하고 가장 가까운 **아키타입** 선택
   (홈·랜딩·리스트·상세·회사소개·아티클·대시보드·요금제, 또는 조합).
2. **참고**: 해당 아키타입을 `58:9`(hi-fi)/`1:7`(컴포넌트)에서 `get_screenshot`으로 확인.
3. **빌드**: `figma-use` 플러그인 API로 auto-layout 기반 구축.
   - **반드시 [figma-use] 스킬을 먼저 로드**하고 `use_figma`를 호출한다.
   - 빌드 규칙·헬퍼·함정은 **references/figma-build.md**를 그대로 따른다(band/cont, FILL 규칙,
     이미지 fill, arcData 도넛, cleanTable, 모바일 텍스트 줄바꿈 등).
   - 데스크톱과 **모바일(360)** 을 **쌍으로** 만든다(모든 웹은 반응형).
4. **이미지**: hi-fi면 Unsplash 그레이스케일을 받아 `upload_assets`→해시 fill.
5. **정리·배치**: 완성 프레임을 **Figma SECTION**으로 묶고, **`:: output` 페이지(`197:2`)에 배치**한다.
   - 한 섹션 안에서 `[데스크톱 + 모바일]` 쌍을 **가로 한 줄·top 정렬**로(세로 컬럼 금지, figma-build §7).
   - 여러 산출물은 섹션을 세로로 겹치지 않게 밴딩. **58:9/37:8/1:7에는 새 산출물을 쌓지 않는다(기준용).**
6. **검수**: 오버플로 0, 콘텐츠 폭 1440(데스크톱), 모바일 오버플로 0을 **감사(audit)** 로 확인.
   렌더 검증은 **REST `get_screenshot`이 정본**이다(use_figma 렌더는 이미지 캐시 지연 있음).

## 산출물 배치 규칙

- **모든 새 산출물(lo-fi·hi-fi) → `:: output` 페이지(`197:2`)에 SECTION으로 배치.**
  섹션 안은 `[데스크톱+모바일]` 가로 한 줄·top 정렬. 섹션끼리는 세로 밴딩(겹침 금지).
- `:: component`(1:7)·`:: wireframe (Hi-fi)`(58:9)·`(Lo-fi)`(37:8)은 **재현 기준(정의)** —
  새 산출물을 여기 쌓지 않는다(참고·재현용).

## references
**Figma 와이어프레임 (정의)**
- `references/tokens.md` — 색·타입·간격·라운드·해상도 토큰
- `references/components.md` — 컴포넌트 패턴(GNB·히어로·카드·테이블·차트·푸터 등)
- `references/archetypes.md` — 8대 아키타입 섹션 구조 + lo-fi/hi-fi 차이
- `references/figma-build.md` — figma-use 빌드 방법·헬퍼·함정(반드시 준수)

**HTML/CSS 구현** (같은 표준을 실제 코드로) — `html/`
- `html/tokens.md` — CSS 변수(모노 스케일·타입·그리드) + 폰트(`fonts/web/fonts.css`) · 아이콘 · 이미지
- `html/components.md` · `html/sections.md` — 컴포넌트·섹션 마크업
- `html/demo/index.html` — 동작 데모

폰트는 저장소 `fonts/`(OFL) 사용 — Figma는 IBM Plex Sans KR, HTML/문서는 Pretendard·IBM Plex Mono.
