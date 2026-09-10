import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// The bot writes lastHeartbeatAt every ~20s while its gateway connection is
// up (see apps/bot/src/index.ts). Anything older than this is treated as
// offline — covers a crashed/redeploying process without needing a
// separate push channel between the bot and API (which may or may not run
// in the same process depending on the deploy setup).
const STALE_AFTER_MS = 60_000;

// deployingSince (see scripts/mark-deploying.js) is a best-effort flag, not
// a guarantee — if a deploy fails before the bot ever restarts, nothing
// would ever clear it. Capping how long it's trusted means a botched
// deploy falls back to normal offline detection instead of permanently
// claiming to be "just updating".
const UPDATING_TIMEOUT_MS = 5 * 60_000;

router.get("/bot-status", requireAuth, async (_req, res) => {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  const lastHeartbeatAt = config?.lastHeartbeatAt ?? null;
  const online = !!lastHeartbeatAt && Date.now() - lastHeartbeatAt.getTime() < STALE_AFTER_MS;

  const deployingSince = config?.deployingSince ?? null;
  const updating = !online && !!deployingSince && Date.now() - deployingSince.getTime() < UPDATING_TIMEOUT_MS;

  // Only surfaced when actually offline (and not mid-deploy) — this is the
  // "what's wrong, where do I look" context for a real outage, not noise
  // on every routine status check.
  let lastError: { message: string; source: string; createdAt: string } | null = null;
  if (!online && !updating) {
    const err = await prisma.errorLog.findFirst({ orderBy: { createdAt: "desc" } });
    if (err) lastError = { message: err.message, source: err.source, createdAt: err.createdAt.toISOString() };
  }

  res.json({ online, updating, lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null, lastError });
});

export default router;
