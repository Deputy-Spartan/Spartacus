import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/mod-digest-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.modDigestSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
    frequency: row?.frequency ?? "WEEKLY",
    dayOfWeek: row?.dayOfWeek ?? 1,
    hourUtc: row?.hourUtc ?? 12,
    staffRoleIds: row?.staffRoleIds ?? [],
    lastSentAt: row?.lastSentAt?.toISOString() ?? null,
  });
});

router.put("/guilds/:guildId/mod-digest-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, frequency, dayOfWeek, hourUtc, staffRoleIds } = req.body as {
    channelId?: string | null;
    frequency?: "DAILY" | "WEEKLY";
    dayOfWeek?: number;
    hourUtc?: number;
    staffRoleIds?: string[];
  };

  const data: Record<string, unknown> = {};
  if (channelId !== undefined) data.channelId = channelId;
  if (frequency !== undefined) data.frequency = frequency;
  if (dayOfWeek !== undefined) data.dayOfWeek = dayOfWeek;
  if (hourUtc !== undefined) data.hourUtc = hourUtc;
  if (staffRoleIds !== undefined) data.staffRoleIds = staffRoleIds;

  const row = await prisma.modDigestSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      channelId: channelId ?? null,
      frequency: frequency ?? "WEEKLY",
      dayOfWeek: dayOfWeek ?? 1,
      hourUtc: hourUtc ?? 12,
      staffRoleIds: staffRoleIds ?? [],
    },
    update: data,
  });

  res.json({ ...row, lastSentAt: row.lastSentAt?.toISOString() ?? null });
});

// Dashboard's "Send Now" button — the bot's modDigest job polls for this
// every minute and clears it once it posts.
router.post("/guilds/:guildId/mod-digest-settings/send-now", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.modDigestSettings.findUnique({ where: { guildId: req.params.guildId } });
  if (!row?.channelId) return res.status(400).json({ error: "Set a digest channel first." });

  await prisma.modDigestSettings.update({ where: { guildId: req.params.guildId }, data: { manualSendRequestedAt: new Date() } });
  res.status(202).json({ ok: true });
});

export default router;
