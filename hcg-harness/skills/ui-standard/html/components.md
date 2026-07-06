# AX Web — Components (Mono)

Figma `Components`와 동일. 토큰(`tokens.md`)을 전제로 한다. 모두 무채색.

## Buttons

```css
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  border-radius:var(--radius);font-weight:600;font-family:inherit;cursor:pointer;
  border:1.5px solid transparent;white-space:nowrap;transition:background .15s,opacity .15s;}
.btn--lg{height:56px;padding:0 24px;font-size:16px;}
.btn--md{height:48px;padding:0 20px;font-size:15px;}
.btn--sm{height:40px;padding:0 16px;font-size:14px;}
.btn--primary{background:var(--ink-900);color:#fff;}
.btn--primary:hover{background:var(--ink-700);}
.btn--secondary{background:#fff;color:var(--ink-900);border-color:var(--ink-900);}
.btn--secondary:hover{background:var(--ink-50);}
.btn--ghost{background:transparent;color:var(--ink-900);}
.btn--ghost:hover{background:var(--ink-50);}
.btn:disabled{background:var(--ink-100);color:var(--text-disabled);border-color:transparent;cursor:not-allowed;}
```
```html
<button class="btn btn--primary btn--lg">버튼</button>
<button class="btn btn--secondary btn--md">버튼</button>
<button class="btn btn--ghost btn--sm">버튼</button>
```

## Forms

```css
.field{display:flex;flex-direction:column;gap:8px;}
.field > label{font-size:13px;font-weight:600;color:var(--text-primary);}
.input,.select,.textarea{font:inherit;font-size:15px;color:var(--text-primary);
  background:#fff;border:1.2px solid var(--ink-300);border-radius:var(--radius);
  padding:0 16px;height:48px;width:100%;outline:none;}
.textarea{height:auto;min-height:110px;padding:12px 16px;line-height:1.6;resize:vertical;}
.input::placeholder,.textarea::placeholder{color:var(--text-disabled);}
.input:focus,.select:focus,.textarea:focus{border-color:var(--ink-900);border-width:2px;}
.input:disabled{background:var(--ink-50);border-color:var(--border);color:var(--text-disabled);}
.field .help{font-size:12px;color:var(--text-tertiary);}
.select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg width='12' height='8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23111' fill='none' stroke-width='1.5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;}
```
```html
<div class="field">
  <label for="x">라벨</label>
  <input id="x" class="input" placeholder="플레이스홀더">
  <span class="help">도움말 텍스트</span>
</div>
```

체크박스·라디오·토글은 무채색: 체크/선택/켜짐 = `--ink-900` 채움, 미선택 = 흰 면 + `--ink-900` 테두리, 토글 off 트랙 = `--ink-200`.

## Badges · Tags · Chips

```css
.badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;
  padding:4px 12px;border-radius:var(--radius-pill);}
.badge--solid{background:var(--ink-900);color:#fff;}
.badge--outline{background:#fff;color:var(--ink-900);border:1.2px solid var(--ink-900);}
.tag{background:var(--ink-100);color:var(--ink-700);border-radius:var(--radius-sm);padding:4px 10px;font-size:13px;font-weight:600;}
.chip{background:#fff;border:1.2px solid var(--ink-300);color:var(--ink-700);border-radius:var(--radius-pill);padding:4px 12px;font-size:13px;}
```

## Card

```css
.card{background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
.card__thumb{aspect-ratio:16/10;background:var(--ink-100);display:grid;place-items:center;color:var(--text-disabled);font-size:13px;}
.card__body{padding:20px;display:flex;flex-direction:column;gap:8px;}
.card__cat{font-size:12px;font-weight:600;color:var(--text-tertiary);letter-spacing:.03em;}
.card__foot{display:flex;justify-content:space-between;align-items:center;padding-top:4px;}
```
```html
<article class="card">
  <div class="card__thumb">이미지</div>
  <div class="card__body">
    <span class="card__cat">카테고리</span>
    <h3 class="t-h4">카드 제목</h3>
    <p class="t-body-s">카드 설명 두 줄.</p>
    <div class="card__foot"><span class="t-caption">2026.06.30</span>
      <button class="btn btn--primary btn--sm">자세히</button></div>
  </div>
</article>
```

## List

```css
.list{border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
.list__item{display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid var(--divider);}
.list__item:last-child{border-bottom:0;}
.list__thumb{width:48px;height:48px;border-radius:var(--radius);background:var(--ink-100);flex:none;}
.list__item .chev{margin-left:auto;color:var(--text-disabled);}
```

## Tabs

```css
.tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);}
.tab{padding:12px 16px;font-size:15px;font-weight:600;color:var(--text-tertiary);
  border-bottom:2px solid transparent;cursor:pointer;background:none;border-top:0;border-left:0;border-right:0;}
.tab[aria-selected="true"]{color:var(--text-primary);border-bottom-color:var(--ink-900);}
```

## Breadcrumb · Pagination

```css
.breadcrumb{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--text-tertiary);}
.breadcrumb [aria-current]{color:var(--text-primary);font-weight:600;}
.breadcrumb .sep{color:var(--ink-300);}
.pagination{display:flex;gap:8px;align-items:center;}
.page{width:40px;height:40px;display:grid;place-items:center;border-radius:var(--radius);
  border:1px solid var(--border);background:#fff;font-size:14px;font-weight:600;color:var(--ink-700);}
.page[aria-current]{background:var(--ink-900);color:#fff;border-color:var(--ink-900);}
```

## Accordion · Table

```css
.accordion{border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
.accordion__item{border-bottom:1px solid var(--divider);}
.accordion__item:last-child{border-bottom:0;}
.accordion__head{display:flex;justify-content:space-between;align-items:center;
  padding:18px 20px;font-weight:600;color:var(--text-primary);cursor:pointer;}
.accordion__body{padding:0 20px 20px;color:var(--text-secondary);font-size:14px;}

.table{width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;}
.table thead th{background:var(--surface-subtle);text-align:left;font-weight:600;color:var(--text-primary);
  padding:14px 18px;border-bottom:1px solid var(--border);font-size:14px;}
.table td{padding:14px 18px;border-bottom:1px solid var(--divider);color:var(--text-secondary);font-size:14px;}
.table tr:last-child td{border-bottom:0;}
```

## Feedback (Alert · Toast · Progress · Avatar)

```css
.alert{display:flex;gap:12px;padding:16px;border:1px solid var(--border);
  background:var(--surface-subtle);border-radius:var(--radius);}
.alert__icon{width:24px;height:24px;border-radius:50%;background:var(--ink-900);color:#fff;
  display:grid;place-items:center;font-weight:700;flex:none;}
.toast{display:flex;justify-content:space-between;align-items:center;gap:16px;
  background:var(--ink-900);color:#fff;border-radius:var(--radius);padding:14px 16px 14px 18px;font-weight:600;}
.progress{height:8px;background:var(--ink-200);border-radius:var(--radius-pill);overflow:hidden;}
.progress > i{display:block;height:100%;background:var(--ink-900);}
.avatar{border-radius:50%;background:var(--ink-900);color:#fff;display:grid;place-items:center;font-weight:600;}
```

> 알림·토스트도 색이 아닌 **텍스트·위치·굵기**로 상태를 전달한다. 빨강/초록 상태색 금지.

---

## Extended (확장 컴포넌트)

Figma `Components — Extended`와 동일. 모두 무채색.

### 입력 — 아이콘 · 상태
- 리딩/트레일링 아이콘은 입력 박스 안에 `.icon`(16~20px, `#767676`)로.
- **에러는 색이 아니라** 강한 테두리(`border:2px solid #111`) + `!` 아이콘 + 굵은 도움말(`#111`).
- 성공은 트레일링 `check` 아이콘 + 도움말. `search`는 리딩 검색 아이콘 + placeholder.

### 입력 — 컨트롤
```css
.stepper{display:inline-flex;border:1.2px solid var(--ink-300);border-radius:var(--radius);overflow:hidden;height:44px;}
.stepper button{width:44px;border:0;background:#fff;font-size:20px;cursor:pointer;}
.stepper .val{min-width:48px;display:grid;place-items:center;border-left:1px solid var(--border);border-right:1px solid var(--border);font-weight:600;}
.segmented{display:inline-flex;gap:0;background:var(--ink-100);border-radius:var(--radius);padding:4px;}
.segmented button{border:0;background:none;padding:0 18px;height:34px;border-radius:6px;font-weight:600;color:var(--text-tertiary);cursor:pointer;}
.segmented button[aria-selected="true"]{background:#fff;color:var(--text-primary);}
input[type="range"]{appearance:none;height:4px;border-radius:999px;background:var(--ink-200);}
input[type="range"]::-webkit-slider-thumb{appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:1.5px solid var(--ink-900);}
.dropzone{border:1.4px solid var(--ink-300);background:var(--surface-subtle);border-radius:var(--radius-lg);
  padding:28px;text-align:center;display:grid;gap:8px;place-items:center;}
```

### 오버레이
```css
.modal{background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-overlay);max-width:460px;}
.modal__head{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid var(--divider);}
.modal__foot{display:flex;justify-content:flex-end;gap:12px;padding:16px 24px 24px;}
.tooltip{background:var(--ink-900);color:#fff;border-radius:6px;padding:8px 12px;font-size:13px;position:relative;}
.tooltip::after{content:"";position:absolute;top:100%;left:24px;border:6px solid transparent;border-top-color:var(--ink-900);}
.menu{background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-popover);padding:6px;}
.menu a{display:block;padding:11px 16px;border-radius:6px;color:var(--text-secondary);text-decoration:none;}
.menu a:hover{background:var(--surface-subtle);}
.banner{display:flex;justify-content:space-between;align-items:center;background:var(--ink-900);color:#fff;border-radius:var(--radius);padding:14px 20px;}
.banner .tag{background:#fff;color:var(--ink-900);border-radius:4px;padding:4px 9px;font-size:12px;font-weight:600;}
```

### 데이터 표시
```css
.kpi{border:1px solid var(--border);border-radius:var(--radius-lg);padding:26px;}
.kpi__num{font-size:36px;font-weight:700;color:var(--text-primary);line-height:1.2;}
.kpi__delta{display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600;color:var(--text-primary);}
.plan{border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px;display:flex;flex-direction:column;gap:20px;}
.plan--featured{border:2px solid var(--ink-900);}            /* 추천 = 진한 테두리 + 다크 CTA */
.rating{display:flex;gap:4px;align-items:center;}            /* 별: 채움=#111, 빈=#C2C2C2 outline */
.empty{display:grid;gap:12px;place-items:center;text-align:center;padding:44px;border:1px solid var(--border);border-radius:var(--radius-lg);}
.skeleton{background:var(--ink-100);border-radius:var(--radius-sm);}  /* 블록·라인 플레이스홀더 */
.spinner{width:40px;height:40px;}                            /* 8-dot 회색 그라데이션 회전 */
.step{display:flex;align-items:center;}
.step .dot{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;}
.step .dot--done{background:var(--ink-900);color:#fff;}
.step .dot--current{border:2px solid var(--ink-900);color:var(--ink-900);}
.step .dot--todo{border:1.5px solid var(--ink-300);color:var(--text-disabled);}
.step .bar{flex:1;height:2px;background:var(--ink-200);}     /* 완료 구간은 #111 */
```

### 내비게이션 확장
```css
.pill-tabs{display:flex;gap:8px;}
.pill-tabs button{border:1px solid var(--border);background:#fff;color:var(--text-secondary);border-radius:999px;padding:0 18px;height:38px;font-weight:600;}
.pill-tabs button[aria-selected="true"]{background:var(--ink-900);color:#fff;border-color:var(--ink-900);}
.side-nav a{display:flex;gap:12px;align-items:center;padding:11px 14px;border-radius:var(--radius);color:var(--text-secondary);text-decoration:none;}
.side-nav a[aria-current]{background:var(--ink-900);color:#fff;}
.bottom-nav{display:flex;border-top:1px solid var(--border);}
.bottom-nav a{flex:1;display:grid;gap:5px;justify-items:center;padding:10px 0;color:var(--text-disabled);font-size:11px;text-decoration:none;}
.bottom-nav a[aria-current]{color:var(--text-primary);}
```
