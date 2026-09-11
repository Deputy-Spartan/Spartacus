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

// Neon's free tier suspends the database after a period of no traffic, and
// the first query after that has to wait for it to wake back up — if that
// wake-up takes longer than Prisma's connect timeout, the query fails
// outright with no retry anywhere in the app (P1001 unreachable, P1002
// timed out, P1017 connection closed). A couple of short, cheap retries
// absorbs exactly that one-time cold-start delay; anything else (a bad
// query, a constraint violation) isn't one of these codes and fails
// immediately as before — this only ever retries connectivity failures.
const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1017"]);
const RETRY_DELAYS_MS = [300, 800];

prisma.$use(async (params, next) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await next(params);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (!code || !RETRYABLE_CODES.has(code) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
});

export * from "@prisma/client";
export * from "./embedComponents";

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
