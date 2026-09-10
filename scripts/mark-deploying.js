// Runs as the very first step of `npm start` in production, before
// `prisma migrate deploy` — flips a flag the dashboard/status channel use
// to show "Updating" instead of a scary "Offline" during the normal
// restart window a deploy causes. Written as raw SQL (not the generated
// Prisma Client's typed model) specifically so it still works on the one
// deploy that *introduces* the deployingSince column, before migrate
// deploy has run yet — and wrapped so it can NEVER fail the deploy: if the
// column doesn't exist yet, or the DB is unreachable, this just no-ops.
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "BotConfig" (id, "deployingSince", "updatedAt")
      VALUES ('singleton', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET "deployingSince" = NOW(), "updatedAt" = NOW();
    `);
  } catch (err) {
    console.warn("[mark-deploying] skipped (non-fatal):", err.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})();
