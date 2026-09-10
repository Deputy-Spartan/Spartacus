import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/achievements", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.achievement.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { awardedAt: "desc" },
    take: 50,
  });
  res.json(rows);
});

export default router;
