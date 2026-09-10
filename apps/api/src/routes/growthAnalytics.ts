import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/growth-snapshots", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.growthSnapshot.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  res.json(rows.reverse());
});

export default router;
