import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/xp-blacklist", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.xpBlacklistEntry.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/xp-blacklist", requireAuth, requireGuildPermission, async (req, res) => {
  const { targetId, type } = req.body;
  const row = await prisma.xpBlacklistEntry.upsert({
    where: { guildId_targetId: { guildId: req.params.guildId, targetId } },
    create: { guildId: req.params.guildId, targetId, type },
    update: { type },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/xp-blacklist/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.xpBlacklistEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
