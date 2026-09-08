import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

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
    res.json(top);
  }
);

export default router;
