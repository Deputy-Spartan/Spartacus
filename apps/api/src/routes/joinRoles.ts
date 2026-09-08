import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/join-roles", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.joinRole.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/join-roles", requireAuth, requireGuildPermission, async (req, res) => {
  const { roleId } = req.body;
  const row = await prisma.joinRole.upsert({
    where: { guildId_roleId: { guildId: req.params.guildId, roleId } },
    create: { guildId: req.params.guildId, roleId },
    update: {},
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/join-roles/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.joinRole.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
