import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getGuildMember } from "../lib/discordRest";

const router = Router();

router.get(
  "/guilds/:guildId/leaderboard",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    const top = await prisma.memberXp.findMany({
      where: { guildId: req.params.guildId },
      orderBy: { xp: "desc" },
      take: 50, // bounded result set, not a full table scan into memory
    });

    // getGuildMember is per-user cached (10s TTL) — fine to resolve each row
    // individually rather than a bulk fetch, at this row count.
    const withNames = await Promise.all(
      top.map(async (row) => {
        const member = await getGuildMember(req.params.guildId, row.userId).catch(() => null);
        return { ...row, username: member?.username ?? null, nickname: member?.nickname ?? null };
      })
    );

    res.json(withNames);
  }
);

// Where level-up announcements post — without this, the bot posts in
// whatever channel the XP-earning message happened to be sent in.
router.get("/guilds/:guildId/leveling-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.levelingSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json(row ?? { guildId: req.params.guildId, channelId: null, levelUpMessage: "🎉 {user} just reached **Level {level}**!" });
});

router.patch("/guilds/:guildId/leveling-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, levelUpMessage } = req.body as { channelId?: string | null; levelUpMessage?: string };
  const row = await prisma.levelingSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      channelId: channelId || null,
      levelUpMessage: levelUpMessage?.trim() || "🎉 {user} just reached **Level {level}**!",
    },
    update: {
      channelId: channelId !== undefined ? channelId || null : undefined,
      levelUpMessage: levelUpMessage !== undefined ? levelUpMessage.trim() || "🎉 {user} just reached **Level {level}**!" : undefined,
    },
  });
  res.json(row);
});

export default router;
