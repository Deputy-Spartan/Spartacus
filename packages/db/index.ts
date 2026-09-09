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

// Best-effort error logging — never lets a logging failure become a
// second error. Used by both the API's global error handler and the
// bot's command/event error handlers so everything shows up in one place
// (the dashboard's Errors page) regardless of which process it came from.
export async function logError(source: "api" | "bot", error: unknown, guildId?: string) {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? null) : null;
    await prisma.errorLog.create({ data: { source, message, stack, guildId: guildId ?? null } });
  } catch (loggingError) {
    console.error("[logError] failed to persist error log:", loggingError);
  }
}
