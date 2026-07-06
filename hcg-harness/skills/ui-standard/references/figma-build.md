# ax-wireframe — Figma Build Guide

`use_figma`(Plugin API)로 와이어프레임을 짜는 방법과 **실전 함정**. 이 규칙을 어기면 레이아웃이
깨지거나 이미지가 백지로 나온다. 반드시 준수한다. (먼저 **figma-use 스킬 로드** 후 `use_figma` 호출.)

## 0. 공통 헬퍼 (매 호출에 붙여 쓴다)

```js
const F='IBM Plex Sans KR';
await figma.loadFontAsync({family:F,style:'Regular'});
await figma.loadFontAsync({family:F,style:'SemiBold'});
const hx=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const SC=h=>[{type:'SOLID',color:hx(h)}];
function R(w,h,fill,stroke,rad){const r=figma.createRectangle();r.resize(Math.max(1,w),Math.max(1,h));r.fills=fill?SC(fill):[];if(stroke){r.strokes=SC(stroke);r.strokeWeight=1;}r.cornerRadius=rad==null?0:rad;return r;}
function T(s,size,w,color,lh){const t=figma.createText();t.fontName={family:F,style:w||'Regular'};t.fontSize=size;t.characters=s;t.fills=SC(color||'#111111');if(lh)t.lineHeight={unit:'PIXELS',value:lh};t.textAutoResize='WIDTH_AND_HEIGHT';return t;}
const V=g=>{const f=figma.createAutoLayout('VERTICAL',{itemSpacing:g});f.fills=[];return f;};
const H=g=>{const f=figma.createAutoLayout('HORIZONTAL',{itemSpacing:g});f.fills=[];return f;};
const full=(p,n)=>{p.appendChild(n);n.layoutSizingHorizontal='FILL';return n;};      // 자식 폭 채움
const TF=(p,s,size,w,c,lh,ctr)=>{const t=T(s,size,w,c,lh);if(ctr)t.textAlignHorizontal='CENTER';p.appendChild(t);t.layoutSizingHorizontal='FILL';return t;}; // 줄바꿈 본문
```

### 데스크톱 풀블리드 밴드 + 1440 컨테이너
```js
function band(frame,bg){const s=V(0);if(bg)s.fills=SC(bg);s.counterAxisAlignItems='CENTER';s.counterAxisSizingMode='FIXED';frame.appendChild(s);s.layoutSizingHorizontal='FILL';return s;}          // 1920 풀폭
function cont(b,padY,gap){const c=V(gap==null?24:gap);c.paddingTop=padY;c.paddingBottom=padY;c.counterAxisSizingMode='FIXED';c.counterAxisAlignItems='CENTER';b.appendChild(c);c.resize(1440,10);c.layoutSizingVertical='HUG';return c;} // 1440 중앙 컨테이너
// 프레임: const P=V(0);P.counterAxisSizingMode='FIXED';P.resize(1920,100);  (모바일은 360)
```
밴드는 `band(P,bg)`로 만들고 그 안에 `cont(band,padY)`로 1440 콘텐츠를 담는다.
→ 배경은 1920 끝까지, 콘텐츠는 x=240~1680에 정렬(전 섹션 동일).

## 1. Auto-layout FILL 규칙 (가장 중요)
- 자식을 **부모(auto-layout)에 append한 "뒤"** 에 `layoutSizingHorizontal='FILL'`을 준다.
  → `full(parent,node)` 사용. append 전 FILL은 에러.
- `'HUG'`/`'FILL'`은 부모가 auto-layout일 때만 유효. `'FIXED'`는 항상 가능.
- **`counterAxisAlignItems`에 `'STRETCH'` 없음.** 자식을 교차축(높이)에 맞추려면 그 자식에
  `layoutSizingVertical='FILL'`(부모 높이는 HUG 형제가 정의). 예: 2단에서 짧은 카드 FILL로 맞춤.
- `layoutSizing*`(자식: FIXED/HUG/FILL)과 `*AxisSizingMode`(프레임 자신: FIXED/AUTO)는 다른 enum.
  섞지 말 것.

## 2. resize / 순서 함정
- **FILL을 준 뒤 `resize()`를 호출하면 FIXED로 되돌아간다.** (막대 그래프가 폭 10으로 collapse한 대표 사고)
  → 고정폭이 필요하면 `layoutSizingHorizontal='FIXED'` 후 `resize`. FILL로 두려면 resize 금지.
- 페이지 최상위 노드는 (0,0) 겹침 → x/y를 비워 있는 곳으로 지정.
- `figma.currentPage`는 호출마다 첫 페이지로 초기화 → `await figma.setCurrentPageAsync(page)`.

## 3. 노드/속성 함정
- **Figma 노드에 임의 커스텀 속성 금지**(`node._x=1` 에러). 상태는 JS 변수로만.
- 텍스트 변경 전 폰트 load 필수. `figma.notify` 금지.
- 원자성: 스크립트가 에러나면 **아무 것도 커밋 안 됨**(부분 변경 없음). 고쳐서 재실행.

## 4. 텍스트 줄바꿈 (모바일 오버플로 방지)
- `T()`는 `textAutoResize='WIDTH_AND_HEIGHT'`라 **긴 텍스트가 폭으로 늘어나 프레임 밖으로 넘친다.**
- 문단/긴 텍스트는 반드시 **`TF(parent,...)`(=append 후 FILL)** 로 넣어 부모 폭에서 **줄바꿈**시킨다.
  중앙정렬 문단은 `TF(p,...,true)`. 짧은 라벨·버튼·제목만 `T()`로 hug.

## 5. 이미지 (hi-fi)
- `createImageAsync(URL)`은 이 환경에서 불가. 대신:
  1) 로컬로 Unsplash 그레이스케일 다운로드(`sat=-100`, 표시폭 ~2배).
  2) `upload_assets({fileKey,nodeId,count:1})` → 반환 submitUrl에 파일 POST(multipart `file`).
  3) 응답의 **imageHash**를 받아 `use_figma`로 `node.fills=[{type:'IMAGE',scaleMode:'FILL',imageHash}]`.
- **upload_assets의 자동 fill 배치는 일부 노드(각 그리드 첫 카드)에서 조용히 실패**(HTTP 200,
  success:false) → 해시로 **직접 fill 설정**이 안전. 같은 이미지는 해시 재사용(추가 업로드 0).
- **검증은 REST `get_screenshot`이 정본.** `use_figma`의 `node.screenshot()`는 이미지가
  캐시로 백지/구버전이 나올 수 있다(레이아웃 검증엔 OK, 이미지 확인엔 REST).

## 6. 특수 컴포넌트
- **도넛/게이지**: `const e=figma.createEllipse(); e.strokes=SC('#111'); e.strokeWeight=16; e.strokeCap='ROUND';
  const s=1.5*Math.PI; e.arcData={startingAngle:s, endingAngle:s+2*Math.PI*pct, innerRadius:0.74};`
  ⚠️ **startingAngle은 반드시 양수(0~2π)로.** 음수(예 `-Math.PI/2`)를 주면 Figma가 **0으로 클램프**해
  아크가 3시부터 그려져 **U자로 깨진다.** 12시 시작은 `1.5*Math.PI`(=3π/2)를 쓴다(end가 2π 초과해도 OK).
  배경 링(전체 원, LINE) 위에 전경 아크를 겹친다.
  **중앙 % 텍스트는 도넛과 같은 좌표(0,0)에 겹쳐 얹는다 — 래퍼를 auto-layout으로 두면 세로로
  쌓여 도넛이 클립되니, 래퍼는 `layoutMode='NONE'`(절대배치)로 두고 도넛·% 둘 다 (0,0)에 놓는다.**
- **바 차트**: 플롯은 **비-AL 프레임을 FIXED 폭**으로 만들고 격자선 rect(고정폭)과
  막대 H 프레임(고정폭, counterAxisAlignItems='MAX')을 절대좌표(0,0)로 얹는다. 막대 열은
  V(FILL 폭·FILL 높이·primaryAxisAlignItems='MAX') 안에 고정높이 막대. (FILL은 AL 프레임 안에서만)
- **cleanTable**: 세로 카드(V, 라운드14, clipsContent) → 헤더 행(`#F4F4F4`) + 데이터 행 +
  행 사이 1px 구분선. 각 셀은 H(counterAxisAlignItems='CENTER', primaryAxisAlignItems 'CENTER'|'MIN').
  좁은 열=FIXED 폭, 넓은(제목) 열=FILL.
- **색 감지로 노드 찾기 금지**: `#F4F4F4`를 톨러런스로 매칭하면 `#F2F2F2`(활성칩)·`#EFEFEF`(칩)까지
  잘못 잡는다. 노드 id/이름으로 특정하라.
- **아이콘 = Phosphor SVG(vector)**: 손으로 path를 그리지 말고 실제 Phosphor SVG를 넣는다.
  phosphoricons.com 또는 unpkg(`@phosphor-icons/core@2/assets/regular/<name>.svg`)에서 Regular
  SVG 문자열을 받아 `const ic=figma.createNodeFromSvg(svg);` → 색은 `ic.findAll(n=>'fills' in n)`
  로 순회하며 `SC('#111')` 지정(원본 fill 제거), 크기는 `ic.rescale(24/ic.width)`. 아이콘 타일
  안에 넣을 땐 만든 vector 그룹을 AL 셀에 `appendChild` 후 중앙정렬. **stroke가 아니라 fill 기반**
  이므로 굵기는 아이콘 자체(Regular)로 유지하고 별도 strokeWeight를 주지 않는다.

```js
// Phosphor 아이콘 삽입 헬퍼 — svg 문자열을 받아 무채색 vector로
function phicon(svg, hex, size){
  const ic = figma.createNodeFromSvg(svg);          // <svg>...</svg> 원본
  ic.findAll(n => 'fills' in n).forEach(n => { n.fills = SC(hex); });
  if (ic.strokes) ic.strokes = [];
  ic.rescale(size / ic.width);
  ic.name = 'icon';
  return ic;                                          // AL 셀에 appendChild 후 정렬
}
```

## 7. 정리(섹션) · 검수

### ⚠️ 섹션 자식 좌표계는 "환경마다 다르다" — 가정하지 말고 **자가보정**하라 (가장 흔한 함정)
`SECTION`에 `appendChild`할 때 자식 `x/y`가 **섹션 상대좌표**로 해석되는 환경도 있고
**페이지 절대좌표**로 해석되는 환경도 있다(Figma 버전차). 그래서 "상대라고 단정"한 코드는
**어떤 환경(예: 일부 Windows/버전)에선 산출물이 섹션 프레임 바깥으로 튀어나온다.**
→ **좌표계를 가정하지 말 것.** 넣어본 뒤 `absoluteBoundingBox`를 읽어, 목표 화면좌표와의
차이만큼 보정한다. 아래 헬퍼는 상대/절대 **어느 쪽이든 동일하게** 동작한다(OS·버전 무관).

```js
// 완성 프레임들을 섹션으로 감싸는 헬퍼 — 좌표계 자가보정(OS/버전 무관)
// nodes: 이미 만들어 둔 최상위 프레임들 / pad·gap: 섹션 내부 여백·간격
function wrapInSection(nodes, {x=0, y=0, pad=80, gap=120, name='Section', bg='#F7F7F7'} = {}) {
  // 1) 최종 크기를 먼저 계산해 섹션을 그 크기로 생성 → append 중 원점 드리프트 방지
  let totalW = pad, maxH = 0;
  for (const n of nodes) { totalW += n.width + gap; maxH = Math.max(maxH, n.height); }
  const sec = figma.createSection();
  sec.name = name;
  if (bg) sec.fills = SC(bg);                 // 톤다운 배경으로 구분 (SC = 공통 헬퍼)
  figma.currentPage.appendChild(sec);
  sec.x = x; sec.y = y;
  sec.resizeWithoutConstraints(totalW - gap + pad, maxH + pad * 2);
  // 2) 좌표계를 모르므로: 넣고 → 실제 abs 읽고 → "목표 abs(sec원점+로컬)"로 델타 보정
  let cx = pad;
  for (const n of nodes) {
    sec.appendChild(n);
    const sa = sec.absoluteBoundingBox;       // 섹션의 현재 화면 원점
    const b  = n.absoluteBoundingBox;         // 넣은 직후 노드의 실제 화면 위치
    n.x += (sa.x + cx)  - b.x;                // 상대든 절대든 결과는 (sa.x+cx, sa.y+pad)
    n.y += (sa.y + pad) - b.y;
    cx += n.width + gap;
  }
  return sec;
}
// 노드 하나를 섹션 안 로컬(lx,ly)에 두는 단일 헬퍼도 원리 동일:
//   sec.appendChild(n);
//   const s = sec.absoluteBoundingBox, b = n.absoluteBoundingBox;
//   n.x += (s.x + lx) - b.x;  n.y += (s.y + ly) - b.y;   // ← 절대/상대 자동 대응
```
- 섹션들은 세로로 겹치지 않게 배치(밴드/그룹별 y 밴딩). 새 섹션의 `y`는 이전 섹션 `y + height + 여백`.
- **여러 산출물은 가로 한 줄로 정렬한다(Lo-fi 방식).** 아키타입을 세로로 길게 쌓지 말 것 —
  `[데스크톱 + 모바일]` 쌍을 하나의 셀로 보고 **top 정렬 + 균등 간격**으로 좌→우 배치하고,
  라벨은 프레임 위에 둔다. 셀 폭 ≈ `1920 + 80 + 360 + 셀간격(~240)`. 섹션은 내용에 맞춰
  **넓고 낮게**(예: 8아키타입 → ~21000×~5300). 세로로 늘어진 좁은 컬럼은 금지.
- **검수(필수)**: `wrapInSection` 후 각 자식의 `node.absoluteBoundingBox`가 `sec.absoluteBoundingBox`
  **안에 들어오는지** 확인한다. 벗어나면 좌표계 가정 실수 — 위 **자가보정 헬퍼**를 쓰면
  Mac/Windows·Figma 버전 무관하게 섹션 안에 정확히 들어온다(직접 `n.x = 로컬값`으로 단정하지 말 것).
- **감사(audit)**: 각 프레임에서 자식 절대bbox가 프레임 우측을 넘으면 오버플로 → 0이어야 함.
  데스크톱 섹션 콘텐츠 폭이 1440(좌 240)인지 확인. 모바일 오버플로 0 확인.
