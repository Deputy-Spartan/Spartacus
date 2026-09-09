import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/errors", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.errorLog.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows);
});

router.delete("/guilds/:guildId/errors", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.errorLog.deleteMany({ where: { guildId: req.params.guildId } });
  res.status(204).send();
});

export default router;
