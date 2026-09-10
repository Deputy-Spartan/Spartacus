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

router.get("/bot-status", requireAuth, async (_req, res) => {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  const lastHeartbeatAt = config?.lastHeartbeatAt ?? null;
  const online = !!lastHeartbeatAt && Date.now() - lastHeartbeatAt.getTime() < STALE_AFTER_MS;

  res.json({ online, lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null });
});

export default router;
