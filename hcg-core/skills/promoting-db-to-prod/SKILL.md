---
name: promoting-db-to-prod
description: Use when 로컬/개발 DB를 운영 DB 서버로 이관·승격할 때 — "DB 이관해줘", "운영 DB로 옮겨줘", 덤프/복원/migration 요청. MariaDB·MySQL·PostgreSQL 공통. 로컬 DB 단일화(도커→네이티브 등 같은 PC 내 이동)에도 같은 절차를 적용.
---

# DB 운영 이관 (HCG 표준 · 포터블) — dump → restore → 3중 검증

## Overview

엔진 불문 불변 뼈대: **덤프 → 대상 준비(DB·전용계정) → 복원 → 3중 검증(행수 parity + ORM 마이그레이션 상태 + 앱 스모크)**. 엔진 차이는 명령뿐이다. 덮어쓰기 전 대상 백업은 무조건. parity 규율은 `db-conventions` 와 동일(레코드 수 일치).

**안전 원칙**: DROP·덮어쓰기 복원·계정 생성 같은 파괴/권한 변경 명령은 에이전트가 직접 실행하지 않는다 — 명령을 완성해 사용자가 `!` 프롬프트로 직접 실행하도록 전달한다(인간 승인). 읽기(덤프·조회·검증)는 세션이 수행한다.

## 파라미터 확정 규칙 — 값의 성격별로 판별 방법이 다르다

**실측 가능한 값은 묻지 않고 검증한다:**

| 값 | 판별 방법 |
|---|---|
| DB 종류(maria/mysql/pg) | `schema.prisma` provider + `.env`의 URL 스킴 |
| 서버 버전 | 접속 후 `SELECT VERSION()` |
| dev PC IP | `ipconfig`/`ip addr` 실측 |
| 클라이언트 경로 | 파일 존재 확인 (Windows 예: `"C:\Program Files\MariaDB 10.11\bin"`) |
| 로컬 DB 접속 정보 | 프로젝트 `.env` |

**실측 불가능한 값(어디로 보낼지)은 기록 → 없으면 반드시 질문:**

| 값 | 탐색 순서 |
|---|---|
| 운영 DB 서버 host:port | `.claude/project.md`(인스턴스 슬롯) → `.env.production` → 배포 문서/메모리 → **질문** |
| WAS IP | 위와 동일 → **질문** |

조직 표준 인프라 값이 있으면 질문 시 Recommended 제안값으로만 쓴다(HCG: DB `192.168.100.76:3306`·WAS `192.168.100.105`). 제안값을 조용한 가정으로 쓰지 않는다 — 기록에 없는 대상 서버로의 복원은 비가역이므로 근거 없는 IP 로 진행 금지. 확정된 값은 `project.md` 에 기록해 다음 이관부터 질문을 없앤다. 앱 계정 규약: DB명과 동일 계정, 허용 호스트 = WAS IP + dev PC IP(검증용, 안정화 후 DROP). 앱 계정 비밀번호는 사용자가 정한다(질문).

## 절차 (MariaDB 기준 · PG는 괄호)

1. **사전**: 포트 도달성(`Test-NetConnection <host> -Port 3306`) + `SELECT VERSION()`. 대상에 같은 DB 있으면 **먼저 백업 덤프** 후 진행.
2. **덤프** (세션이 수행 — 읽기 전용):
   ```bash
   mariadb-dump -u<u> -p'<pw>' -h127.0.0.1 -P3306 \
     --single-transaction --routines --triggers --default-character-set=utf8mb4 --databases <db> > <db>-dump.sql
   ```
   (PG: `pg_dump -Fc`)
3. **대상 준비+복원 — 사용자 `!` 실행용 한 줄을 만들어 전달**:
   ```bash
   mariadb -uroot -p'<rootpw>' -h<host> --default-character-set=utf8mb4 -e "CREATE DATABASE IF NOT EXISTS <db> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '<db>'@'<WAS_IP>' IDENTIFIED BY '<pw>'; CREATE USER IF NOT EXISTS '<db>'@'<DEV_IP>' IDENTIFIED BY '<pw>'; GRANT ALL PRIVILEGES ON <db>.* TO '<db>'@'<WAS_IP>'; GRANT ALL PRIVILEGES ON <db>.* TO '<db>'@'<DEV_IP>'; FLUSH PRIVILEGES; SOURCE <절대경로>/<db>-dump.sql;"
   ```
   (PG: `createdb` + `pg_restore -d`)
4. **검증 ①②** — 세션이 ORM 경로로 수행(프로젝트의 자연스러운 도구):
   - parity: `DATABASE_URL=... node -e` 로 테이블별 `SELECT COUNT(*)` → 원본 기록과 `diff`. `information_schema.TABLE_ROWS` 금지(근사치).
   - `DATABASE_URL=... npx prisma migrate status` → "up to date" 확인(`_prisma_migrations` 가 덤프에 포함되므로 정상이어야 함).
5. **검증 ③ 스모크**: 앱 `.env` 전환 후 기동 → 로그인 + DB 조회 API 1개 실측(한글 포함 데이터). 종료 후 `.env` 원복.
6. **마감**: 백업 파일 위치 보고, 개인정보 덤프는 안정화 후 삭제 안내, `codex-review` 트리거 ①(데이터 이관) 해당 — 리뷰 제안(실행은 사용자 결정).

## 실행 함정 (실측 2026-09-01)

| 함정 | 대응 |
|---|---|
| Windows 의 `!` 프롬프트는 **Git Bash**다 | PowerShell 문법(`&`, 백틱) 금지. 경로는 `"/c/Program Files/..."`, 한 줄 구성 |
| `-p` 단독(대화형 프롬프트)은 비대화형 셸에서 행 걸림 | `-p'비밀번호'` 인라인 (세션 기록에 남음을 고지, 필요시 추후 교체 안내) |
| PowerShell 엔 `<` 입력 리다이렉트 없음 | 복원은 클라이언트 내장 `SOURCE <절대경로>.sql` 사용 |
| DATABASE_URL 비밀번호 인코딩 | `@ : / ? # %` 공백만 필수 인코딩. `! *` 등은 그대로 동작 |
| MariaDB 10.11+ 덤프의 `/*!999999 sandbox*/` 첫 줄 | MySQL 서버 복원 시 에러 — 첫 줄 제거. MariaDB끼리는 무해 |
| 신→구 버전 이관(예: 10.11→10.5) | 대체로 동작하나 복원 stderr 확인. 이후 마이그레이션에서 신기능 금지 |
| 셸 cwd 가 산출물/대상 폴더 안이면 삭제·빌드 실패(busy) | 작업 전 cwd 를 밖으로 이동 |

## 완료 기준

전 테이블 행수 일치(`diff` 출력 0) · migrate status up to date · 스모크 통과 · 백업 경로 보고. 하나라도 미충족이면 완료 선언 금지.
