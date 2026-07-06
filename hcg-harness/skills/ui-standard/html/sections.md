# AX Web — Sections (페이지 구조)

Figma `Web Sections`와 동일. 페이지는 **헤더 → 히어로 → 콘텐츠 영역들 → 푸터** 순서.
다크 면(통계·프로모·푸터)은 `--inverse(#111)` + `--on-inverse(#fff)`.

## 영역 카탈로그

| # | 영역 | 용도 | 면 |
|---|------|------|----|
| 01 | 헤더 / GNB | 로고 + 내비 + 유틸/CTA | 흰 + 하단 1px |
| 02 | 히어로 / 비주얼 | 헤드라인 + 부제 + CTA + 비주얼 | `--surface-subtle` |
| 03 | 피처 3카드 | 핵심 가치 3개 | 흰 |
| 04 | 통계 밴드 | 숫자 지표 강조 | 다크 |
| 05 | 2단 콘텐츠 | 이미지 + 텍스트(좌우 교차) | 흰 |
| 06 | 썸네일 그리드 | 목록(신간·베스트 등) | 흰 |
| 07 | 프로모 / CTA 배너 | 전환 유도 | 다크 |
| 08 | FAQ | 아코디언 | 흰 |
| 09 | 푸터 | 로고 + 링크 컬럼 + 카피라이트 | 다크 |

필요하면 같은 규칙으로 영역을 더 추가(공지 배너, 후기, 가격표, 검색 바 등)하되 무채색·토큰을 지킨다.

## 01 · 헤더 / GNB

```html
<header class="gnb">
  <div class="container gnb__inner">
    <div class="gnb__left">
      <a class="gnb__logo" href="/">HCG</a>
      <nav class="gnb__nav"><a aria-current="page">홈</a><a>도서</a><a>전자책</a><a>이벤트</a><a>고객센터</a></nav>
    </div>
    <div class="gnb__util"><a>검색</a><a>로그인</a><button class="btn btn--primary btn--sm">회원가입</button></div>
  </div>
</header>
```
```css
.gnb{border-bottom:1px solid var(--border);background:#fff;}
.gnb__inner{display:flex;align-items:center;justify-content:space-between;height:76px;}
.gnb__left{display:flex;align-items:center;gap:40px;}
.gnb__logo{font-weight:700;font-size:22px;color:var(--text-primary);text-decoration:none;}
.gnb__nav{display:flex;gap:28px;}
.gnb__nav a{color:var(--text-secondary);text-decoration:none;font-size:15px;}
.gnb__nav a[aria-current]{color:var(--text-primary);font-weight:600;}
.gnb__util{display:flex;align-items:center;gap:20px;}
.gnb__util a{color:var(--text-secondary);text-decoration:none;font-size:15px;}
@media(max-width:768px){ .gnb__nav{display:none;} }
```

## 02 · 히어로

좌(텍스트: 오버라인·헤드라인·부제·CTA) + 우(비주얼). 면 `--surface-subtle`.

```html
<section class="hero"><div class="container hero__inner">
  <div class="hero__text">
    <span class="t-label">NEW SERVICE</span>
    <h1 class="t-display">산출물 표준으로<br>더 빠르게, 더 일관되게</h1>
    <p class="t-body-l">핵심 메시지를 한두 문장으로 명확하게.</p>
    <div class="hero__cta"><button class="btn btn--primary btn--lg">시작하기</button>
      <button class="btn btn--secondary btn--lg">자세히 보기</button></div>
  </div>
  <div class="hero__visual">비주얼 영역</div>
</div></section>
```
```css
.hero{background:var(--surface-subtle);}
.hero__inner{display:grid;grid-template-columns:1fr 560px;gap:64px;align-items:center;padding:80px 0;}
.hero__text{display:flex;flex-direction:column;gap:24px;}
.hero__cta{display:flex;gap:12px;margin-top:8px;}
.hero__visual{aspect-ratio:3/2;background:var(--ink-200);border-radius:var(--radius-lg);display:grid;place-items:center;color:var(--text-tertiary);}
@media(max-width:1024px){ .hero__inner{grid-template-columns:1fr;} }
```

## 04 · 통계 밴드 (다크)

```html
<section class="band"><div class="container band__inner">
  <div class="stat"><strong>1,200+</strong><span>누적 도서</span></div>
  <div class="stat"><strong>98%</strong><span>고객 만족</span></div>
  <div class="stat"><strong>24/7</strong><span>지원 채널</span></div>
</div></section>
```
```css
.band{background:var(--inverse);color:var(--on-inverse);}
.band__inner{display:flex;justify-content:space-between;padding:64px 0;}
.stat strong{display:block;font-size:44px;line-height:1.1;font-weight:700;}
.stat span{color:var(--ink-400);font-size:15px;}
```

## 07 · 프로모 / CTA 배너 (다크)

```html
<section class="promo"><div class="container promo__inner">
  <div><h2 class="t-h2" style="color:#fff">지금 표준을 시작하세요</h2>
    <p style="color:var(--ink-400)">한 줄 안내 문구.</p></div>
  <button class="btn btn--lg" style="background:#fff;color:var(--ink-900)">신청하기</button>
</div></section>
```
```css
.promo{background:var(--inverse);}
.promo__inner{display:flex;justify-content:space-between;align-items:center;gap:32px;padding:56px 0;}
@media(max-width:768px){ .promo__inner{flex-direction:column;align-items:flex-start;} }
```

## 09 · 푸터 (다크)

```html
<footer class="footer"><div class="container">
  <div class="footer__top">
    <div class="footer__brand"><div class="t-h3" style="color:#fff">HCG</div>
      <p style="color:var(--ink-400)">AI 산출물 표준 디자인 시스템</p></div>
    <div class="footer__cols">
      <div><h4>서비스</h4><a>도서</a><a>전자책</a><a>이벤트</a></div>
      <div><h4>고객지원</h4><a>공지사항</a><a>FAQ</a><a>문의하기</a></div>
      <div><h4>회사</h4><a>소개</a><a>채용</a><a>제휴문의</a></div>
    </div>
  </div>
  <hr class="footer__div">
  <div class="footer__bot"><span>© 2026 HCG. All rights reserved.</span>
    <span class="footer__util"><a>이용약관</a><a>개인정보처리방침</a></span></div>
</div></footer>
```
```css
.footer{background:var(--inverse);color:var(--on-inverse);padding:64px 0 48px;}
.footer__top{display:flex;justify-content:space-between;gap:64px;flex-wrap:wrap;}
.footer__cols{display:flex;gap:64px;}
.footer__cols h4{color:#fff;font-size:14px;font-weight:600;margin:0 0 14px;}
.footer a{display:block;color:var(--ink-400);text-decoration:none;font-size:14px;margin-bottom:10px;}
.footer__div{border:0;border-top:1px solid var(--ink-700);margin:36px 0;}
.footer__bot{display:flex;justify-content:space-between;color:var(--ink-500);font-size:13px;}
.footer__util{display:flex;gap:20px;}
```

> 03 피처카드·05 2단·06 썸네일 그리드·08 FAQ는 `.container` + `.grid`/카드/아코디언
> 컴포넌트(`components.md`)를 그대로 조합해 구성한다.

## 제품 패턴 (Patterns)

Figma `Patterns` 보드 참고. 컴포넌트를 조합한 실제 화면 패턴 — 같은 토큰·컴포넌트로만 구성한다.

- **데이터 테이블** — 툴바(검색·필터·추가) + 정렬 가능한 헤더 + 체크박스 행 + 상태 칩(무채색) + 행 액션 + 푸터(선택 수·페이지네이션).
- **폼 레이아웃** — 좌측 라벨(+도움말) / 우측 컨트롤 2단, 섹션 헤더, 하단 우측 정렬 취소·저장.
- **필터 + 결과** — 좌측 필터 사이드바(체크/라디오 패싯·카운트) + 우측 정렬 바 + 카드 그리드.
- **대시보드** — 좌측 사이드바 내비 + 상단바(타이틀·액션) + KPI 카드 행 + 활동 리스트/표. 다크모드는 역할 토큰만으로 전체 전환된다.

## 반응형

- 데스크톱 12 / 태블릿 8 / 모바일 4 컬럼. 컨테이너 1200 max.
- 그리드는 `repeat(N, 1fr)`로 컬럼 수만 바꾸고 카드·토큰은 동일하게 유지한다.
- 헤더 내비는 모바일에서 숨기고(`display:none`) 햄버거/하단 탭으로 대체한다.
