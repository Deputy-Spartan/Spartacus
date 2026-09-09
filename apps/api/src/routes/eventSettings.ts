import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/event-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const settings = await prisma.eventSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    settings ?? {
      guildId: req.params.guildId,
      defaultChannelId: null,
      defaultReminder: 15,
      mentionRoleId: null,
    }
  );
});

router.put("/guilds/:guildId/event-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { defaultChannelId, defaultReminder, mentionRoleId } = req.body as {
    defaultChannelId?: string | null;
    defaultReminder?: number;
    mentionRoleId?: string | null;
  };

  const data = { defaultChannelId, defaultReminder: defaultReminder ?? 15, mentionRoleId };
  const settings = await prisma.eventSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...data },
    update: data,
  });
  res.json(settings);
});

export default router;
