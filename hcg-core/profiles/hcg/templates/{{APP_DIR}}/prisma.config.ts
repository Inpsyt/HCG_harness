// Prisma 7 CLI 설정 — v7 부터 CLI 가 .env 를 자동 로드하지 않고, datasource url 도
// schema.prisma 가 아닌 이 파일이 정본이다.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: env("DATABASE_URL"),
    // v7 은 마이그레이션 재생(migrate diff --from-migrations 등)에 shadow DB 가 필수.
    // CI 드리프트 게이트가 서비스 컨테이너를 이 변수로 주입한다 — 미설정이면 생략.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
