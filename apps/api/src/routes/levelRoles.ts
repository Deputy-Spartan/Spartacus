import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/level-roles", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.levelRole.findMany({ where: { guildId: req.params.guildId }, orderBy: { level: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/level-roles", requireAuth, requireGuildPermission, async (req, res) => {
  const { level, roleId } = req.body;
  const row = await prisma.levelRole.upsert({
    where: { guildId_level: { guildId: req.params.guildId, level } },
    create: { guildId: req.params.guildId, level, roleId },
    update: { roleId },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/level-roles/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.levelRole.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
