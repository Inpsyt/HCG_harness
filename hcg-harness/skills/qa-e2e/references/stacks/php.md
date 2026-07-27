# Stack — PHP

Laravel · Symfony · CodeIgniter · 순수 PHP

---

## 1. 프레임워크 판별

`composer.json` 의 require 를 본다.

| 마커 (파일 / 의존성) | 프레임워크 |
|---|---|
| `artisan` + `laravel/framework` | **Laravel** |
| `bin/console` + `symfony/framework-bundle` | **Symfony** |
| `spark` + `codeigniter4/framework` | **CodeIgniter 4** |
| `wp-config.php` | WordPress (플러그인/테마 QA) |
| `composer.json` 없음, `.php` 산재 | 순수 PHP / 레거시 |

PHP 버전: `composer.json` 의 `require.php`. `php -v` 와 다르면 의존성 설치부터 실패한다.

## 2. 앱 기동

```bash
# Laravel
php artisan serve --port=8000
# Symfony
symfony server:start          # 또는 php -S localhost:8000 -t public
# CodeIgniter 4
php spark serve
# 순수 PHP
php -S localhost:8000 -t public        # 또는 -t .
```

- 실서비스 형태(Apache/Nginx + php-fpm)로 구성돼 있으면 **문서 루트가 `public/`** 이다.
  `docker-compose.yml` 이나 vhost 설정을 읽어 실제 진입점을 확인한다
- 의존성: `composer install` (실행 전 확인 — 락파일 변경 가능)
- 환경: Laravel/Symfony 모두 `.env`. Laravel 은 `APP_URL`·`APP_ENV`·`APP_DEBUG` 를 본다
- DB 마이그레이션: `php artisan migrate` / `php bin/console doctrine:migrations:migrate` —
  **기존 데이터를 건드리므로 실행 전 확인받는다**

## 3. 단위 테스트

```bash
# PHPUnit (Laravel/Symfony 기본)
./vendor/bin/phpunit
php artisan test                    # Laravel 래퍼 (출력이 읽기 좋다)
php bin/phpunit                     # Symfony 래퍼
./vendor/bin/pest                   # Pest 를 쓰는 프로젝트
```

| 도구 | 비고 |
|---|---|
| PHPUnit | 사실상 표준. 설정은 `phpunit.xml(.dist)` |
| Pest | PHPUnit 위의 DSL. `pest` 의존이 있으면 이걸 쓴다 |
| Mockery | Laravel 관례의 목 라이브러리 |

- 설정 파일의 `<testsuites>` 가 어떤 디렉터리를 도는지 알려준다 (`tests/Unit`, `tests/Feature`)
- **Laravel 의 `tests/Feature` 는 이름과 달리 통합 테스트다** — HTTP 계층을 실제로 탄다.
  `layers` 에 unit·feature 를 나눠 기록하면 리포트가 정확해진다

## 4. 통합 / API 테스트

| 프레임워크 | 방법 |
|---|---|
| Laravel | `$this->get('/x')->assertStatus(200)` · `$this->postJson(...)` · `actingAs($user)` |
| Symfony | `WebTestCase` + `$client->request('GET', '/x')` |
| CodeIgniter 4 | `FeatureTestTrait` 의 `$this->call('get', '/x')` |
| 실행 중 서버 | `curl` / Guzzle |

```php
$this->actingAs($admin)->get('/admin/users')->assertOk()->assertSee('사용자 목록');
```

Laravel 의 `RefreshDatabase` 트레잇은 매 테스트마다 DB 를 롤백한다 — 통과해도 데이터가 남지 않으므로
E2E 시드로 쓸 수 없다.

## 5. E2E 진입 시 주의점

### 라우트 탐색 — 명령으로 뽑는 게 정확하다

```bash
php artisan route:list --json            # Laravel — 완전한 라우트 인벤토리
php bin/console debug:router             # Symfony
```

명령을 못 쓰면 파일에서:

```bash
# Laravel
cat routes/web.php routes/api.php
# Symfony — 어노테이션/애트리뷰트
grep -rn "#\[Route(\|@Route(" src/ | head -40
# CodeIgniter
cat app/Config/Routes.php
```

Laravel 의 `route:list` 는 **미들웨어 컬럼까지 준다** — 권한 게이트 매트릭스를 여기서 바로 만든다.

### 권한 게이트

```bash
grep -rn "middleware(\|->middleware\|IsGranted\|@Security" app/ src/ routes/ | head -30
```

Laravel: `auth`·`auth:sanctum`·`can:`·커스텀 미들웨어. Symfony: `security.yaml` 의 `access_control` 이 정본.

### 서버 렌더 앱의 특징
- Blade/Twig 템플릿이 페이지다: `resources/views/*.blade.php` · `templates/*.twig`
- 폼 제출은 전체 페이지 이동. **Laravel 은 `@csrf` hidden 필드**, Symfony 도 CSRF 토큰이 붙는다.
  브라우저 실제 제출은 자동, `curl` POST 는 419(Laravel)/403 — 앱 버그가 아니다
- 세션 쿠키: `laravel_session` · `PHPSESSID`
- **플래시 메시지**(`session()->flash`)는 리다이렉트 후 한 번만 뜬다. 새로고침하면 사라지므로
  증거 수집은 이동 직후에 한다

### 디버그 툴바
Laravel Debugbar / Symfony Profiler 가 켜져 있으면 화면 하단에 툴바가 뜬다. **UI 요소로 오인하지 말고**,
오히려 쿼리 수·실행 시간·발생 예외를 읽는 증거원으로 쓴다.

## 6. 흔한 함정

- **`APP_DEBUG=true`** — 에러 화면에 스택트레이스·환경변수가 노출된다. 운영형 검증 목적이면
  이 상태의 에러 페이지는 대표성이 없다
- **`storage/`·`bootstrap/cache` 권한** — 쓰기 권한이 없으면 500. QA 이슈가 아니라 환경 문제
- **설정 캐시** — `php artisan config:cache` 가 돌아 있으면 `.env` 변경이 반영되지 않는다.
  값이 안 바뀌면 `config:clear` 를 의심한다
- **`.htaccess` 미적용** — `php -S` 내장 서버는 `.htaccess` 를 읽지 않는다. rewrite 의존 라우팅이
  깨져 보일 수 있다(앱 버그 아님). `public/index.php` 라우터 스크립트로 띄운다
- **문서 루트 오설정** — `/` 가 디렉터리 목록으로 보이면 문서 루트가 `public/` 이 아닌 것이다
- **한글 인코딩** — DB collation(`utf8mb4`) 과 응답 헤더가 어긋나면 화면이 깨진다.
  깨진 문자열은 그대로 인용해 리포트에 남긴다
