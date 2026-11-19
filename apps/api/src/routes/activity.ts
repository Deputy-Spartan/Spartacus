import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getGuildCounts } from "../lib/discordRest";

const router = Router();

// Backed by requireGuildPermission's own logging hook — every mutating
// dashboard request against this guild lands a row there, so this route is
// purely read-only.
router.get("/guilds/:guildId/activity", requireAuth, requireGuildPermission, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await prisma.dashboardAuditEntry.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json(rows);
});

// The live strip across the top of the Overview page: members and how many
// are online (Discord's own estimate), the change in members since about a
// day ago (from the daily growth snapshots), and who is live right now (the
// server's own streams and its streamer friends).
router.get("/guilds/:guildId/live-strip", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [counts, before, streams, friends] = await Promise.all([
    getGuildCounts(guildId).catch(() => null),
    prisma.growthSnapshot.findFirst({ where: { guildId, createdAt: { lte: dayAgo } }, orderBy: { createdAt: "desc" }, select: { memberCount: true } }),
    prisma.streamSubscription.findMany({ where: { guildId, isLive: true }, select: { platform: true, channelName: true, displayName: true }, take: 10 }),
    prisma.streamFriend.findMany({ where: { guildId, isLive: true }, select: { platform: true, handle: true, displayName: true }, take: 10 }),
  ]);
  res.json({
    memberCount: counts?.memberCount ?? null,
    onlineCount: counts?.onlineCount ?? null,
    memberChange: counts && before ? counts.memberCount - before.memberCount : null,
    liveNow: [
      ...streams.map((s) => ({ name: s.displayName || s.channelName, platform: s.platform, friend: false })),
      ...friends.map((f) => ({ name: f.displayName || f.handle, platform: f.platform, friend: true })),
    ],
  });
});

export default router;
