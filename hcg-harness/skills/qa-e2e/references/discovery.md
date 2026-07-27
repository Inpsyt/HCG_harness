# 2 DISCOVER — 인벤토리 뽑기

목표: 코드에서 **테스트 가능한 표면 전체**를 뽑아 `qa/inventory.json` 에 남긴다.

> 이 단계의 출력이 커버리지의 **상한**이다. 여기서 빠진 페이지는 영원히 테스트되지 않는다.
> 시간이 없으면 실행을 줄이지 인벤토리를 줄이지 않는다 — 안 도는 항목은 `skip` 으로 남기면 된다.

---

## 뽑아야 하는 5가지

| # | 대상 | 왜 |
|---|---|---|
| 1 | **페이지 라우트** | 화면 시나리오의 목록 그 자체 |
| 2 | **API 엔드포인트** | 화면 뒤에서 무엇이 성공/실패했는지 판정하는 증거원 |
| 3 | **인증·권한 게이트** | 어떤 역할로 로그인해야 각 화면이 열리는지 |
| 4 | **상태 분기** | 같은 화면이 상태에 따라 다르게 보이는 지점(빈 목록·마감·잠김·에러) |
| 5 | **부수효과** | 결제·메일·파일생성·외부호출 — 안전 규칙 3번의 대상 |

---

## 1. 페이지 라우트

프레임워크별 정확한 규칙은 `stacks/<lang>.md` 에 있다. 공통 접근:

```bash
# 파일시스템 라우팅 (Next.js App/Pages, Nuxt, SvelteKit)
find . -path ./node_modules -prune -o \( -name 'page.tsx' -o -name 'page.jsx' \) -print
find ./pages -name '*.tsx' -not -name '_*' 2>/dev/null

# 선언형 라우팅 (React Router, Vue Router, Angular)
grep -rn "createBrowserRouter\|<Route \|routes:\s*\[" src/ --include=*.ts --include=*.tsx | head -40

# 서버 라우팅 (Spring / Django / Laravel / Express)
# → stacks/<lang>.md §라우트 탐색
```

**동적 세그먼트**(`[id]`, `:id`, `{id}`)는 실제 값이 필요하다. 어디서 얻을지 같이 적어둔다
("목록에서 첫 행 클릭" / "시드 데이터 id=1" / "생성 플로우가 만든 것").

**주의**: 라우트 파일이 있다고 도달 가능한 게 아니다. 미들웨어·가드·기능 플래그로 막혀 있을 수 있다.
반대로 파일이 없어도 rewrite/프록시로 존재할 수 있다. 미들웨어를 반드시 같이 읽는다.

## 2. API 엔드포인트

```bash
# OpenAPI/Swagger 가 있으면 그게 1순위
find . -name 'openapi*.y*ml' -o -name 'swagger*.json' -o -name 'api-spec*.md' | grep -v node_modules
```

없으면 `stacks/<lang>.md` §API 탐색. 각 엔드포인트에 대해 메서드·경로·인증요구·주요 상태코드를 적는다.

> 하네스 프로젝트면 `contracts/api-spec.md` 가 **기대값의 기준**이다. 코드가 아니라 계약이 정답이고,
> 불일치는 그 자체로 이슈다.

## 3. 인증·권한 게이트

```bash
grep -rn "middleware\|requireAuth\|@PreAuthorize\|login_required\|auth:sanctum\|can(" \
  --include=*.ts --include=*.java --include=*.py --include=*.php . | grep -v node_modules | head -40
```

**세션 저장소를 반드시 확인한다.** 영역마다 다르면(관리자=쿠키A, 사용자=쿠키B, 신청자=sessionStorage)
**영역별로 별도 브라우저 프로필/시크릿 창**을 써야 한다. 이걸 놓치면 로그인이 서로를 덮어써서
원인 불명의 실패가 반복된다.

역할별로 이 표를 만든다:

| 역할 | 로그인 경로 | 세션 저장소 | 접근 가능 라우트 | 자격증명 출처 |
|---|---|---|---|---|

## 4. 상태 분기

각 페이지마다 최소 이 4개를 확인한다 — **가장 자주 깨지는 곳이 여기다**:

- **빈 상태** — 데이터 0건일 때 (스켈레톤이 안 사라지거나 크래시)
- **경계/마감** — 시간창·수량 한도·마감일 전후 (경계에서 문구가 뒤바뀜)
- **권한 없음** — 남의 리소스 접근 (403 인가 아니면 그냥 보이는가 = 보안 이슈)
- **에러** — 서버 500·네트워크 끊김 시 사용자에게 뭐가 보이는가

**시간 의존 로직**은 별도로 표시한다. 시험 시간·마감·공개일처럼 "현재 시각"에 따라 화면이 바뀌는
것은 데이터를 **현재 시각 기준으로 옮겨야** 검증할 수 있다. 옮길 수단이 없으면 `blocked` 감이다.

## 5. 부수효과

결제·환불·메일/SMS 발송·파일 생성·외부 API 호출·삭제. 각각에 대해:
- 테스트 모드가 있는가 (테스트 결제키, 메일 캐처, dev 무발송)
- 없으면 실행 전 확인받아야 하는 항목으로 표시

---

## 언어 무관 폴백

프레임워크 규칙을 모르겠으면:

1. **앱을 띄우고 홈에서 링크를 따라간다** — 실제 도달 가능한 라우트만 나온다는 게 오히려 장점
2. **`sitemap.xml` / `robots.txt`** 확인
3. **빌드 산출물의 라우트 매니페스트** (`.next/routes-manifest.json`, `build/manifest.json` 등)
4. **네비게이션 컴포넌트**(GNB·사이드바)를 읽어 링크를 수집
5. **E2E 테스트가 이미 있으면 그게 라우트 목록이다** — `grep -rn "goto(\|visit(" e2e/ tests/`

---

## qa/inventory.json

```json
{
  "pages": [
    { "path": "/apply/manage", "name": "신청 조회·수정", "auth": "신청자",
      "dynamic": [], "states": ["빈 목록", "수정마감 전/후", "취소완료"],
      "source": "app/apply/manage/page.tsx" },
    { "path": "/student/exams/[id]/take", "name": "응시 화면", "auth": "학생",
      "dynamic": [{ "seg": "id", "from": "목록 첫 카드 클릭" }],
      "states": ["응시가능", "시간종료", "오프라인 차단"], "sideEffects": ["답안 제출"],
      "source": "app/student/exams/[id]/take/page.tsx" }
  ],
  "apis": [
    { "method": "POST", "path": "/api/student/autosave", "auth": "학생",
      "codes": [200, 401, 409], "source": "app/api/student/autosave/route.ts" }
  ],
  "roles": [
    { "name": "학생", "loginPath": "/student/login", "session": "쿠키 student_session (idle 15분)",
      "credentials": "빠른 로그인 버튼(dev)" }
  ],
  "sideEffects": [
    { "what": "카드 환불", "where": "/admin?tab=appDetail", "testMode": "테스트 결제키 사용 중", "confirmRequired": true }
  ],
  "notes": ["관리자는 IP 화이트리스트가 있어 운영형 환경에서 404 로 보임"]
}
```

`source` 를 비우지 않는다. 시나리오가 틀렸을 때 코드로 되돌아가는 경로다.
