import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/alert-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.alertSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    errorChannelId: row?.errorChannelId ?? null,
    deployChannelId: row?.deployChannelId ?? null,
    uptimeChannelId: row?.uptimeChannelId ?? null,
  });
});

// Partial update — the Errors page only ever sends errorChannelId/
// deployChannelId, the Status Channel page only ever sends uptimeChannelId;
// whichever fields are omitted are left untouched.
router.put("/guilds/:guildId/alert-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { errorChannelId, deployChannelId, uptimeChannelId } = req.body as {
    errorChannelId?: string | null;
    deployChannelId?: string | null;
    uptimeChannelId?: string | null;
  };

  const row = await prisma.alertSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      errorChannelId: errorChannelId ?? null,
      deployChannelId: deployChannelId ?? null,
      uptimeChannelId: uptimeChannelId ?? null,
    },
    update: {
      ...(errorChannelId !== undefined ? { errorChannelId } : {}),
      ...(deployChannelId !== undefined ? { deployChannelId } : {}),
      ...(uptimeChannelId !== undefined ? { uptimeChannelId } : {}),
    },
  });

  res.json(row);
});

export default router;
