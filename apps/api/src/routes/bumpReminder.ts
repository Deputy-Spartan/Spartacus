import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/bump-reminder", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.bumpReminderSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
    mentionRoleId: row?.mentionRoleId ?? null,
    nextReminderAt: row?.nextReminderAt?.toISOString() ?? null,
  });
});

router.put("/guilds/:guildId/bump-reminder", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, mentionRoleId } = req.body as { channelId?: string | null; mentionRoleId?: string | null };

  const row = await prisma.bumpReminderSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null, mentionRoleId: mentionRoleId ?? null },
    update: {
      ...(channelId !== undefined ? { channelId } : {}),
      ...(mentionRoleId !== undefined ? { mentionRoleId } : {}),
    },
  });

  res.json(row);
});

export default router;
