# Stack — Java / Kotlin

Spring Boot (MVC · WebFlux) · Jakarta EE / Servlet 레거시

---

## 1. 프레임워크 판별

빌드 파일부터: `pom.xml` → Maven · `build.gradle(.kts)` → Gradle.

| 마커 (의존성 / 파일) | 프레임워크 |
|---|---|
| `spring-boot-starter-web` | **Spring Boot MVC** (서블릿, 동기) |
| `spring-boot-starter-webflux` | **Spring Boot WebFlux** (리액티브) |
| `spring-boot-starter-thymeleaf` / `.jsp` 파일 | 서버사이드 렌더링 — 페이지가 컨트롤러에 있다 |
| `spring-boot-starter-security` | 인증·인가 게이트 존재 → `SecurityConfig` 를 읽는다 |
| `WEB-INF/web.xml` + `.jsp` | Jakarta/Servlet 레거시 |
| `spring-boot-starter-data-jpa` / `mybatis` | 데이터 계층 (시드·검증 경로) |

Java 버전은 `pom.xml` 의 `<java.version>` 또는 gradle 의 `sourceCompatibility`.
**설치된 JDK 와 다르면 빌드부터 실패한다** — `java -version` 으로 먼저 확인한다.

## 2. 앱 기동

```bash
# Maven
./mvnw spring-boot:run
./mvnw -q -DskipTests package && java -jar target/*.jar

# Gradle
./gradlew bootRun
./gradlew -q bootJar && java -jar build/libs/*.jar

# 프로파일 지정 (application-<profile>.yml)
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
java -jar app.jar --spring.profiles.active=local
```

- **래퍼(`mvnw`/`gradlew`)를 쓴다.** 시스템 maven/gradle 은 버전이 다를 수 있다
- 포트·컨텍스트 경로는 `application*.yml|properties` 의 `server.port`·`server.servlet.context-path`.
  **컨텍스트 경로가 있으면 모든 URL 앞에 붙는다** — baseUrl 에 반영한다
- 헬스: `spring-boot-starter-actuator` 가 있으면 `/actuator/health`
- 기동이 느리다(수십 초). 준비 완료를 로그(`Started ...Application in`)나 actuator 로 판정한다

## 3. 단위 테스트

```bash
./mvnw test                      # 전체
./mvnw -Dtest=FooServiceTest test # 단건
./gradlew test
./gradlew test --tests '*FooServiceTest'
```

| 도구 | 용도 |
|---|---|
| JUnit 5 (`junit-jupiter`) | 기본 러너. `@Test`·`@ParameterizedTest`·`@Nested` |
| Mockito (`mockito-core`) | 협력 객체 스텁 |
| AssertJ (`assertj-core`) | `assertThat(x).isEqualTo(y)` — 가독성 |
| JUnit 4 (`junit:junit`) | 레거시. `@RunWith(SpringRunner.class)` |

- 결과 리포트: `target/surefire-reports/*.txt` (Maven) · `build/reports/tests/test/index.html` (Gradle).
  **집계 수치는 여기서 읽는다** — 콘솔 요약이 잘리면 이 파일이 정본
- `@SpringBootTest` 는 컨텍스트를 전부 띄워 느리다. 순수 단위는 `@ExtendWith(MockitoExtension.class)`

## 4. 통합 / API 테스트

| 대상 | 방법 |
|---|---|
| MVC 컨트롤러 | `@WebMvcTest` + `MockMvc` — 서버 안 띄우고 HTTP 계층 검증 |
| WebFlux | `@WebFluxTest` + `WebTestClient` |
| 전체 스택 | `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `TestRestTemplate`/`WebTestClient` |
| 실 DB 필요 | Testcontainers (`testcontainers` 의존) — Docker 필요 |
| 외부 실행 서버 | RestAssured 또는 `curl` |

```java
mockMvc.perform(get("/api/items").with(user("admin").roles("ADMIN")))
       .andExpect(status().isOk())
       .andExpect(jsonPath("$.items.length()").value(3));
```

Spring Security 가 있으면 인증 없는 MockMvc 호출은 **401/403 이 정상**이다. 버그로 오인하지 않는다.

## 5. E2E 진입 시 주의점

### 라우트 탐색

```bash
grep -rn "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping\|@RequestMapping" \
  src/main/java --include=*.java | head -60
```

- `@RestController` → JSON API · `@Controller` + `return "view"` → **서버 렌더 페이지**
- 클래스 레벨 `@RequestMapping("/admin")` 이 메서드 경로 앞에 붙는다. 합쳐서 읽는다
- 뷰 이름 → `src/main/resources/templates/<name>.html` (Thymeleaf) 또는 `/WEB-INF/views/<name>.jsp`

### 권한 게이트

```bash
grep -rn "SecurityFilterChain\|antMatchers\|requestMatchers\|@PreAuthorize\|@Secured" src/main/java
```

`SecurityConfig` 가 역할별 접근 매트릭스의 정본이다. 인터셉터(`HandlerInterceptor`)도 같이 본다 —
Security 를 통과해도 인터셉터에서 막힐 수 있다.

### 서버 렌더 앱의 특징
- 폼 제출이 **전체 페이지 이동**이다. SPA 처럼 XHR 을 기다리지 말고 네비게이션 완료를 기다린다
- **CSRF 토큰**이 hidden 필드로 들어간다. 브라우저로 실제 폼을 제출하면 자동 처리되지만,
  `curl` 로 POST 하면 403 이 난다 — 이건 앱 버그가 아니다
- 세션은 `JSESSIONID` 쿠키. 서버 재시작 시 전부 만료된다(세션 저장소가 메모리면)

### 브라우저 드라이버
언어와 무관하다. `drivers/_choose.md` 를 그대로 쓴다. 프로젝트에 Selenium 이 이미 있어도
탐색적 QA 에는 Claude for Chrome / Playwright 가 낫다.

## 6. 흔한 함정

- **JDK 버전 불일치** — 빌드가 `invalid target release` 로 죽으면 QA 이슈가 아니라 환경 문제다
- **컨텍스트 경로 누락** — `server.servlet.context-path=/app` 인데 `/login` 으로 접근하면 404
- **프로파일** — `local`/`dev`/`prod` 마다 DB·외부연동이 다르다. 어느 프로파일로 떴는지 기동 로그로 확인
- **한글 인코딩** — 응답이 깨지면 `server.servlet.encoding.*` 또는 필터 설정 문제. 리포트에 적을 때
  실제 깨진 문자열을 그대로 인용한다
- **Flyway/Liquibase** — 기동 시 마이그레이션이 자동 실행된다. 기존 DB 를 건드릴 수 있으므로
  운영 덤프를 쓰는 dev DB 라면 특히 주의
- **`@Transactional` 테스트 롤백** — 통합 테스트가 통과해도 데이터가 남지 않는다. E2E 준비용
  시드로 쓸 수 없다
