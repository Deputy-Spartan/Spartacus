import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __spartacusPrisma: PrismaClient | undefined;
}

// Singleton so hot-reloads / multiple imports never open extra pools —
// critical on free-tier Postgres connection caps.
export const prisma = global.__spartacusPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__spartacusPrisma = prisma;
}

export * from "@prisma/client";
