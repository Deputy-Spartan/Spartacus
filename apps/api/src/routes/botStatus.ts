import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { getEffectiveBotStatus } from "../lib/botStatus";

const router = Router();

router.get("/bot-status", requireAuth, async (_req, res) => {
  const status = await getEffectiveBotStatus();

  // Only surfaced when actually offline (and not a manual override or a
  // deploy) — this is the "what's wrong, where do I look" context for a
  // real outage, not noise on every routine status check.
  let lastError: { message: string; source: string; createdAt: string } | null = null;
  if (status.phase === "offline" && !status.manual) {
    const err = await prisma.errorLog.findFirst({ orderBy: { createdAt: "desc" } });
    if (err) lastError = { message: err.message, source: err.source, createdAt: err.createdAt.toISOString() };
  }

  res.json({
    online: status.phase === "online",
    updating: status.phase === "updating",
    manual: status.manual,
    message: status.message,
    lastHeartbeatAt: status.lastHeartbeatAt?.toISOString() ?? null,
    lastError,
    dashboardDeployingSince: status.dashboardDeployingSince?.toISOString() ?? null,
  });
});

export default router;
