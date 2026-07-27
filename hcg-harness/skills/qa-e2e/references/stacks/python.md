# Stack — Python

FastAPI · Django · Flask · 순수 스크립트

---

## 1. 프레임워크 판별

| 마커 | 프레임워크 |
|---|---|
| `manage.py` + `settings.py` | **Django** (+ `rest_framework` 면 DRF) |
| `fastapi` 의존 / `FastAPI(` 인스턴스 | **FastAPI** |
| `flask` 의존 / `Flask(__name__)` | **Flask** |
| `streamlit` / `gradio` | 데이터 앱 — 라우트 개념이 다름(§6) |
| 위 없음, `.py` 스크립트만 | CLI/배치 — 웹 E2E 는 `skip` |

의존성 소스: `pyproject.toml`(poetry/uv/pdm) · `requirements*.txt` · `Pipfile` · `environment.yml`.

**가상환경을 먼저 찾는다.** 없이 돌리면 임포트가 전부 실패한다:

```bash
ls -d .venv venv env 2>/dev/null
python -c "import sys; print(sys.prefix)"
```

`.venv/Scripts/activate` (Windows) · `.venv/bin/activate` (POSIX). poetry 면 `poetry run <cmd>`,
uv 면 `uv run <cmd>` 로 감싼다.

## 2. 앱 기동

```bash
# FastAPI
uvicorn app.main:app --reload --port 8000
# Django
python manage.py runserver 8000
# Flask
flask --app app run --port 5000     # 또는 python app.py
```

- 진입점(`app.main:app`)은 추측하지 말고 README·Dockerfile·`Procfile`·CI 워크플로에서 찾는다
- 환경변수: `.env` + `python-dotenv`, 또는 Django `DJANGO_SETTINGS_MODULE`
- **Django 는 마이그레이션이 안 돼 있으면 500 이 난다**: `python manage.py migrate` 필요 여부 확인
  (실행 전 사용자 확인 — 기존 DB 를 건드린다)
- FastAPI 는 `/docs`(Swagger)·`/openapi.json` 이 기본 제공된다. **인벤토리의 API 목록을 여기서 그대로 얻는다**

## 3. 단위 테스트

```bash
pytest -q                          # 기본
pytest -q --tb=short               # 실패 출력 축약
pytest tests/test_foo.py::test_bar # 단건
python manage.py test              # Django 내장 러너 (pytest-django 없을 때)
```

| 도구 | 용도 |
|---|---|
| pytest | 사실상 표준. `conftest.py` 의 fixture 를 먼저 읽는다 |
| `pytest-asyncio` | async 함수 테스트 (`@pytest.mark.asyncio`) |
| `pytest-django` | Django + pytest (`DJANGO_SETTINGS_MODULE` 필요) |
| `unittest` | 표준 라이브러리. `python -m unittest` |

- **테스트가 아예 없는 저장소가 흔하다.** 그러면 `layers` 에 unit 을 넣지 말고 리포트에
  "단위 테스트 없음"을 사실로 적는다. 없는 걸 통과로 쓰지 않는다
- 수집 에러(`ERROR collecting`)는 테스트 실패가 아니라 임포트/환경 문제다. 구분해서 보고한다

## 4. 통합 / API 테스트

| 프레임워크 | 방법 |
|---|---|
| FastAPI | `from fastapi.testclient import TestClient` → `client.get("/items")` |
| FastAPI (async) | `httpx.AsyncClient(app=app, base_url="http://test")` |
| Django | `django.test.Client` 또는 DRF `APIClient` |
| Flask | `app.test_client()` |
| 실행 중 서버 | `httpx` / `requests` / `curl` |

```python
r = client.post("/api/items", json={"name": "x"})
assert r.status_code == 201 and r.json()["id"]
```

Django 는 `@pytest.mark.django_db` 또는 `TestCase` 없이는 DB 접근이 막힌다 — 이건 버그가 아니다.

## 5. E2E 진입 시 주의점

### 라우트 탐색

```bash
# FastAPI / Flask — 데코레이터
grep -rn "@app\.\(get\|post\|put\|delete\)\|@router\.\(get\|post\)" --include=*.py . | head -40

# Django — URLConf 를 따라간다 (루트 urls.py → include() → 앱별 urls.py)
find . -name urls.py -not -path '*/.venv/*'
```

**Django 는 라우트 목록을 명령으로 뽑는 게 가장 정확하다:**

```bash
python manage.py show_urls          # django-extensions 설치 시
```

**FastAPI 는 `/openapi.json` 이 완전한 API 인벤토리다.** 코드 grep 보다 이걸 쓴다.

### 템플릿 페이지
Django/Flask 가 HTML 을 렌더하면 `templates/` 아래 파일이 페이지다. 뷰 함수의
`render(request, "x.html")` 로 라우트↔템플릿을 잇는다.

### 권한 게이트

```bash
grep -rn "login_required\|permission_required\|IsAuthenticated\|@login_required\|LoginRequiredMixin" \
  --include=*.py . | head -30
```

Django 관리자(`/admin/`)는 기본 활성인 경우가 많다 — 별도 스위트로 잡을 가치가 있다.

### 서버 렌더 앱의 특징
- 폼 제출이 전체 페이지 이동. **Django 는 CSRF 토큰이 hidden 필드**로 들어가며, 브라우저 실제 제출은
  자동 처리되지만 `curl` POST 는 403 이다 — 앱 버그가 아니다
- 세션 쿠키는 `sessionid`(Django) / `session`(Flask)

## 6. 흔한 함정

- **가상환경 미활성** — `ModuleNotFoundError` 가 쏟아지면 QA 이슈가 아니라 환경 문제다
- **`DEBUG=True`** — Django 는 디버그 모드에서 에러 페이지에 스택트레이스와 설정을 노출한다.
  운영형 검증이 목적이면 이 상태의 에러 화면은 대표성이 없다
- **DB 가 SQLite 인데 운영은 Postgres** — 마이그레이션·제약·대소문자 동작이 달라 로컬 통과가
  운영 보증이 아니다. 리포트에 환경 차이를 적는다
- **`ALLOWED_HOSTS`** — Django 에서 `localhost` 외 호스트로 접근 시 400. 앱 버그가 아니다
- **Streamlit/Gradio** — URL 라우트가 없고 위젯 상태로만 동작한다. 인벤토리는 "화면 단위"가 아니라
  "위젯 상호작용 단위"로 잡고, 브라우저 드라이버로만 검증한다
- **Windows 인코딩** — 콘솔 출력이 `UnicodeEncodeError` 로 죽으면 `PYTHONUTF8=1` 또는
  `PYTHONIOENCODING=utf-8` 를 붙인다
