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

export default router;
