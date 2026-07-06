# ax-wireframe — Tokens

디자인 시스템(`:: component`, node 1:7)과 1:1. 값을 임의로 바꾸지 않는다.

## 해상도 · 레이아웃 (반드시)

| 항목 | 값 |
|------|-----|
| 데스크톱 아트보드(프레임 폭) | **1920** |
| 콘텐츠 컨테이너 | **1440** — 1920 안에서 중앙 정렬(x=240~1680) |
| 배경 밴드 / 헤더 / 푸터 / 통계·CTA 밴드 | **풀블리드 1920**(끝까지) |
| 모바일 아트보드 | **360** |
| 앱셸(대시보드 등) | 예외적으로 1920 풀폭(사이드바+메인) |
| 데스크톱 섹션 세로 패딩 | 64~88 |
| 모바일 섹션 좌우 패딩 | 20 · 세로 24~32 |

> 컨테이너 1440은 "콘텐츠 영역"의 폭이다. 모든 섹션의 콘텐츠 좌우 경계는 x=240 / x=1680으로
> **정확히 일치**해야 한다(섹션마다 폭이 다르면 안 됨).

## 색 — 순수 무채색(모노)

| 토큰 | HEX | 용도 |
|------|-----|------|
| INK | `#111111` | 제목·강조·주요 버튼·아이콘 |
| INK2 | `#0A0A0A` | 최하단 푸터 |
| T2 | `#333333` | 강한 본문 |
| T3 | `#4D4D4D` | 본문 |
| MUT | `#767676` | 보조설명(최저 명도) |
| LINE | `#E0E0E0` / `#E7E7E7` | 테두리 · 구분선 |
| SURF | `#FFFFFF` | 기본 면 |
| SURF2 | `#F7F7F7` | 은은한 밴드·패널 |
| SURF3 | `#EFEFEF` | 칩·아이콘 타일·이미지 플레이스홀더 |
| DARK 텍스트(다크면 위) | `#FFFFFF` / `#9A9A9A`(보조) / `#7A7A7A`(푸터) | |

포인트 컬러 금지. 상태(성공/경고 등)는 색이 아니라 **위치·굵기·크기·아이콘**으로.

### 로우파이 전용 회색 바
| 용도 | HEX |
|------|-----|
| 제목 바 | `#C6C6C6` |
| 본문 바 | `#D9D9D9` |
| 이미지 박스 | 면 `#E6E6E6` · 테두리 `#DADADA` · 라벨 “이미지” `#A8A8A8` |
| 다크 밴드 위 바 | `#3A3A3A` / `#333333` |

## 서체

- **Figma**: `IBM Plex Sans KR` — 스타일 `Regular` / `SemiBold`(제목).
  (Pretendard는 Figma 미설치, Noto Sans KR엔 SemiBold 없음 → Figma는 IBM Plex 고정.)
- **실제 CSS 표준**: `Pretendard → Noto Sans KR → system`.

### 타입 스케일 (px)
| 용도 | 크기 | 굵기 |
|------|:---:|:---:|
| Display / Hero H1 | 44–56 | SemiBold |
| Section H2 | 28–34 | SemiBold |
| Card/Block H3 | 18–24 | SemiBold |
| 리드 문단 | 18–20 | Regular |
| 본문 | 15–17 | Regular |
| 캡션 · 메타 | 12–14 | Regular |
| 라벨 · eyebrow | 12–13 | SemiBold |

행간(lineHeight)은 본문 24~29px, 제목 42~66px로 지정(px). 모바일은 한 단계 축소.

## 라운드 · 간격
- 라운드: 컨트롤/버튼 8–10 · 카드 12–16 · 칩·아바타·배지 999.
- 카드 내부 패딩 20–32 · 카드 간 그리드 gap 20–24 · 리스트 항목 간 12–16.

## 아이콘 — Phosphor Icons
- **[Phosphor Icons](https://phosphoricons.com)** 로 통일한다(문서·웹·앱·발표 전 영역 공통).
- 가중치 **Regular** 기본(라인). 강조가 꼭 필요할 때만 `-bold`, 채움(`-fill`)·다색 금지.
- 크기 20–24px, stroke 1.8–2, round cap/join. 색은 무채색 역할 토큰(INK/SURF)만.
- 자주 쓰는 이름: `house · magnifying-glass · user · heart · star · list · x · plus ·
  caret-right · arrow-right · check · funnel · chart-bar · shield-check · trend-up · target`.
- **HTML**: 웹폰트(`<i class="ph ph-*">`, `html/tokens.md` 참고).
- **Figma hi-fi**: Phosphor SVG를 `figma.createNodeFromSvg`로 vector 삽입(references/figma-build.md).

## 이미지 (hi-fi)
- Unsplash 그레이스케일: `?w=..&h=..&fit=crop&sat=-100&q=72`. 표시폭의 ~2배로 요청.
- Figma 적용: `upload_assets(nodeId)` → 반환 URL에 파일 POST → **imageHash를 받아
  `use_figma`로 `node.fills=[{type:'IMAGE',scaleMode:'FILL',imageHash}]` 로 직접 설정.**
  (upload_assets의 자동 배치가 첫 카드류에서 조용히 실패하므로 해시 직접 설정이 안전.)
