import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

export const MISSED_AFTER_OPTIONS = [5, 10, 15, 30, 60, 90];

router.get("/guilds/:guildId/bump-reminder", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.bumpReminderSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
    mentionRoleId: row?.mentionRoleId ?? null,
    nextReminderAt: row?.nextReminderAt?.toISOString() ?? null,
    lastBumpAt: row?.lastBumpAt?.toISOString() ?? null,
    lastBumpedById: row?.lastBumpedById ?? null,
    missedAlertEnabled: row?.missedAlertEnabled ?? true,
    missedAfterMin: row?.missedAfterMin ?? 30,
    missedAlerts: row?.missedAlerts ?? 0,
  });
});

router.put("/guilds/:guildId/bump-reminder", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, mentionRoleId, missedAlertEnabled, missedAfterMin } = req.body as {
    channelId?: string | null;
    mentionRoleId?: string | null;
    missedAlertEnabled?: boolean;
    missedAfterMin?: number;
  };
  const patch = {
    ...(channelId !== undefined ? { channelId } : {}),
    ...(mentionRoleId !== undefined ? { mentionRoleId } : {}),
    ...(typeof missedAlertEnabled === "boolean" ? { missedAlertEnabled } : {}),
    ...(MISSED_AFTER_OPTIONS.includes(Number(missedAfterMin)) ? { missedAfterMin: Number(missedAfterMin) } : {}),
  };

  const row = await prisma.bumpReminderSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null, mentionRoleId: mentionRoleId ?? null, ...patch },
    update: patch,
  });

  res.json(row);
});

export default router;
