import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/suggestion-analytics", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.suggestionAnalyticsSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({ channelId: row?.channelId ?? null });
});

router.put("/guilds/:guildId/suggestion-analytics", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId } = req.body as { channelId?: string | null };

  const row = await prisma.suggestionAnalyticsSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null },
    update: { channelId: channelId ?? null },
  });

  res.json(row);
});

export default router;
