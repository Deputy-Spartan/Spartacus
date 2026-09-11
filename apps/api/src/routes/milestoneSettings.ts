import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/milestone-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.milestoneSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
  });
});

router.put("/guilds/:guildId/milestone-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId } = req.body as { channelId?: string | null };

  const row = await prisma.milestoneSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null },
    update: {
      ...(channelId !== undefined ? { channelId } : {}),
    },
  });

  res.json(row);
});

export default router;
