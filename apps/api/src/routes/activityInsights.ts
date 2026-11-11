import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getGuildChannels } from "../lib/discordRest";

const router = Router();

// The last 7 days of message activity: totals per UTC hour (the dashboard
// shifts them to the viewer's own time zone) and the 5 busiest channels.
router.get("/guilds/:guildId/activity-insights", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const guildId = req.params.guildId;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.messageActivity.findMany({ where: { guildId, day: { gte: since } }, select: { day: true, hour: true, channelId: true, count: true } });

  const hours = Array.from({ length: 24 }, () => 0);
  const perChannel = new Map<string, number>();
  const days = new Set<string>();
  for (const r of rows) {
    hours[r.hour] += r.count;
    perChannel.set(r.channelId, (perChannel.get(r.channelId) ?? 0) + r.count);
    days.add(r.day.toISOString().slice(0, 10));
  }
  const names = new Map((await getGuildChannels(guildId).catch(() => [])).map((c) => [c.id, c.name]));
  const channels = [...perChannel.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, name: names.get(id) ?? null, count }));

  res.json({ hours, channels, days: days.size, total: rows.reduce((n, r) => n + r.count, 0) });
});

export default router;
