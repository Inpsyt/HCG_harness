// Prisma 7 은 드라이버 어댑터가 필수 — MariaDB/MySQL 은 @prisma/adapter-mariadb.
// 어댑터가 mysql:// URL 을 mariadb:// 로 재작성하므로 DATABASE_URL 은 mysql:// 그대로 쓴다.
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client";

const createClient = () =>
  new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL as string) });

// dev 핫리로드마다 새 커넥션 풀이 생기지 않도록 globalThis 에 싱글턴을 유지한다.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
