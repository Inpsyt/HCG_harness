# AX Web — Tokens (Mono)

Figma `Foundations`와 동일. Figma에서는 **Variables 컬렉션 `AX Tokens / Mono`**(38개:
스케일 11 · 역할 12 · 간격 11 · 라운드 4)로 토큰화돼 있고, 아래 CSS 변수가 그와 1:1 대응한다.
아래 `:root`를 그대로 주입하고, 값을 임의로 바꾸지 않는다.

```css
:root {
  /* ---- Grayscale scale (단일 무채색 스케일) ---- */
  --ink-900:#111111; --ink-800:#1F1F1F; --ink-700:#333333; --ink-600:#4D4D4D;
  --ink-500:#767676; --ink-400:#999999; --ink-300:#C2C2C2; --ink-200:#E0E0E0;
  --ink-100:#EFEFEF; --ink-50:#F7F7F7;  --white:#FFFFFF;

  /* ---- Roles ---- */
  --text-primary:#111111;   /* 제목·강조 */
  --text-secondary:#4D4D4D; /* 본문 */
  --text-tertiary:#767676;  /* 보조설명 (최저 명도, 더 흐리게 금지) */
  --text-disabled:#999999;
  --on-inverse:#FFFFFF;     /* 다크 면 위 텍스트 */

  --surface:#FFFFFF;
  --surface-subtle:#F7F7F7;
  --surface-muted:#EFEFEF;
  --inverse:#111111;        /* 다크 섹션(통계 밴드·프로모·푸터) */

  --border:#E0E0E0;         /* 기본 1px 실선 */
  --border-strong:#111111;
  --divider:#EDEDED;        /* 리스트·표 행 구분 */

  /* ---- Typography ---- */
  --font-sans:'Pretendard','IBM Plex Sans KR','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif;
  /* 굵기: 400 Regular / 500 Medium / 600 SemiBold / 700 Bold */

  /* ---- Radius ---- */
  --radius-sm:4px; --radius:8px; --radius-lg:12px; --radius-pill:999px;

  /* ---- Spacing (4px base) ---- */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px;
  --sp-8:32px; --sp-10:40px; --sp-12:48px; --sp-16:64px; --sp-20:80px;

  /* ---- Layout ---- */
  --viewport:1920px;        /* 데스크톱 기준 해상도(아트보드 폭) — 밴드/푸터는 풀블리드 */
  --container:1440px;       /* 콘텐츠 최대폭 — 1920 안에서 중앙 정렬 */
  --col:12; --gutter:24px; --margin:24px; /* 데스크톱 그리드(컨테이너 내부 거터) */
  /* 모바일 기준 해상도 = 360px */
}

/* 폰트: 저장소 번들(OFL)을 우선 사용 — 사용자에게 없어도 자동 제공됨.
   프로젝트에 fonts/web/ 을 복사하고 아래를 넣는다:
   <link rel="stylesheet" href="fonts/web/fonts.css">
   (대안 CDN: https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css) */

html{ -webkit-font-smoothing:antialiased; }
body{ font-family:var(--font-sans); color:var(--text-secondary); background:var(--surface); margin:0; line-height:1.6; }
* { box-sizing:border-box; }
```

## Type scale

`px` 정수, line-height `px`. 클래스로 적용한다.

| 토큰 | size / line | weight | 용도 |
|------|:---:|:---:|------|
| `.t-display` | 48 / 56 | 700 | 히어로 헤드라인 |
| `.t-h1` | 36 / 46 | 700 | 페이지 타이틀 |
| `.t-h2` | 28 / 38 | 700 | 섹션 제목 |
| `.t-h3` | 22 / 32 | 600 | 블록 제목 |
| `.t-h4` | 18 / 28 | 600 | 카드 제목 |
| `.t-body-l` | 18 / 30 | 400 | 큰 본문 |
| `.t-body` | 16 / 26 | 400 | 본문 |
| `.t-body-s` | 14 / 22 | 400 | 작은 본문 |
| `.t-caption` | 12 / 18 | 400 | 캡션·메타 |
| `.t-label` | 12 / 16 | 600 | 오버라인 (letter-spacing .04em, 대문자 가능) |

```css
.t-display{font-size:48px;line-height:56px;font-weight:700;color:var(--text-primary);}
.t-h1{font-size:36px;line-height:46px;font-weight:700;color:var(--text-primary);}
.t-h2{font-size:28px;line-height:38px;font-weight:700;color:var(--text-primary);}
.t-h3{font-size:22px;line-height:32px;font-weight:600;color:var(--text-primary);}
.t-h4{font-size:18px;line-height:28px;font-weight:600;color:var(--text-primary);}
.t-body-l{font-size:18px;line-height:30px;font-weight:400;color:var(--text-secondary);}
.t-body{font-size:16px;line-height:26px;font-weight:400;color:var(--text-secondary);}
.t-body-s{font-size:14px;line-height:22px;font-weight:400;color:var(--text-secondary);}
.t-caption{font-size:12px;line-height:18px;font-weight:400;color:var(--text-tertiary);}
.t-label{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.04em;color:var(--text-tertiary);}

/* 반응형: 모바일에서 디스플레이/타이틀 축소 */
@media (max-width:768px){
  .t-display{font-size:32px;line-height:40px;}
  .t-h1{font-size:28px;line-height:36px;}
  .t-h2{font-size:22px;line-height:30px;}
}
```

## Container & grid

```css
.container{ max-width:var(--container); margin:0 auto; padding:0 24px; }
.grid{ display:grid; grid-template-columns:repeat(12,1fr); gap:var(--gutter); }
@media (max-width:1024px){ .grid{ grid-template-columns:repeat(8,1fr); } }
@media (max-width:768px){ .grid{ grid-template-columns:repeat(4,1fr); gap:16px; } }
.section{ padding:80px 0; }                 /* 섹션 상하 여백 */
@media (max-width:768px){ .section{ padding:48px 0; } }
```

## Elevation & focus

면 분리는 그림자가 아니라 **1px 테두리**로. 그림자는 오버레이(모달·팝오버·드롭다운)
한 단계만 허용한다.

```css
:root{
  --shadow-overlay: 0 12px 32px rgba(17,17,17,.14);  /* E1 — 모달 */
  --shadow-popover: 0 8px 24px rgba(17,17,17,.10);   /* E1 — 팝오버/메뉴 */
  --focus-ring: 0 0 0 2px #fff, 0 0 0 4px #111;       /* 키보드 포커스 */
}
:where(button,a,input,select,textarea):focus-visible{ outline:none; box-shadow:var(--focus-ring); }
```

## Motion

절제된 기능적 모션. 바운스·스프링 금지.

```css
:root{
  --dur-fast:120ms; --dur-base:200ms; --dur-slow:320ms;
  --ease-standard:cubic-bezier(.2,0,0,1);  /* 진입·이동 */
  --ease-exit:cubic-bezier(.4,0,1,1);       /* 퇴장 */
}
```

## Iconography — Phosphor Icons

아이콘은 **[Phosphor Icons](https://phosphoricons.com)** 로 통일한다(문서·웹·앱·발표 전 영역 공통).
웹은 **웹폰트**로 — `ph`(Regular) 가중치 기본, 색은 `currentColor`(역할 토큰 상속).

```html
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1">
<i class="ph ph-magnifying-glass"></i>   <!-- 검색 -->
<i class="ph ph-arrow-right"></i>        <!-- 버튼 안 등 -->
<i class="ph ph-moon"></i>               <!-- 다크 토글 -->
```
```css
.ph{ font-size:20px; color:inherit; vertical-align:-2px; }   /* 본문 옆 */
```
- 가중치는 **Regular(`ph`) 기본**. 강조가 꼭 필요할 때만 `ph-bold`/`ph-fill`. 한 화면에서 가중치를 섞지 않는다.
- 채움(`-fill`) 남발·다색 금지. 색은 무채색 역할 토큰(또는 dark 모드 자동).
- 자주 쓰는 이름: `house · magnifying-glass · user · heart · star · list · x · plus · caret-right · arrow-right · check · funnel · download-simple · target · lightning · chart-bar · shield-check · trend-up`.

## Imagery — Unsplash

사진은 **[Unsplash](https://unsplash.com/ko)** 리소스만 쓴다(전 영역 공통). 무채색 시스템과
맞추기 위해 **그레이스케일로 통일** — imgix 파라미터 `sat=-100` 을 붙여 흑백으로 받는다.

```html
<img src="https://images.unsplash.com/photo-{id}?w=900&h=650&fit=crop&sat=-100&q=75" alt="">
```
```css
img{ width:100%; height:100%; object-fit:cover; display:block; filter:grayscale(1); }
```
- URL `sat=-100` 으로 1차 흑백 + CSS `filter:grayscale(1)` 로 안전망(브라우저·캐시 차이 대비).
- 크기는 `w`·`h`·`fit=crop` 으로 컨테이너 비율에 맞춰 요청(과대 다운로드 금지).
- 컬러 사진·필터 효과(세피아·듀오톤 등) 금지. 인물·오피스·건축 등 중립적 소재.

## Dark mode

Figma `AX Tokens`의 **Dark 모드**와 1:1. 스케일(절대값)은 그대로 두고 **역할 토큰만 반전**한다.
`[data-theme="dark"]`만 토글하면 전체가 전환된다(컴포넌트 CSS는 역할 변수만 쓰므로 수정 불필요).

```css
[data-theme="dark"]{
  --text-primary:#F7F7F7; --text-secondary:#C2C2C2; --text-tertiary:#999999; --text-disabled:#4D4D4D;
  --on-inverse:#111111;
  --surface:#111111; --surface-subtle:#1F1F1F; --surface-muted:#333333; --inverse:#F7F7F7;
  --border:#333333; --border-strong:#F7F7F7; --divider:#1F1F1F;
}
[data-theme="dark"] body{ background:var(--surface); color:var(--text-secondary); }
```

> 컴포넌트는 항상 **역할 토큰**(`--text-*`,`--surface-*`,`--border-*`)만 참조한다.
> Primary 버튼은 `--inverse`(면)+`--on-inverse`(글자)를 써야 라이트=검정/다크=흰색으로 자동 반전된다.

## Accessibility (필수)

- **명도 대비**: 본문 ≥ 4.5:1(AA). 무채색 스케일에서 흰 배경 본문의 한계선은 `#767676`(약 4.7:1).
  그보다 옅은 회색(`#999` 이하)은 본문 텍스트로 쓰지 않는다.
- **터치 타깃** ≥ 44×44px. 아이콘이 작아도 클릭/탭 영역은 패딩으로 확보. 모바일 버튼 높이 ≥ 48.
- **포커스**: 키보드 포커스는 `--focus-ring`(2px)으로 항상 보이게. `outline:none`만 두지 않는다.
- 시맨틱 태그 · `alt` · 라벨 연결(`<label for>`) · 상태는 색만이 아니라 텍스트/아이콘으로도 전달.
