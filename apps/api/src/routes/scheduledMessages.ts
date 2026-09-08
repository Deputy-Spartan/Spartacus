import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/scheduled-messages", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.scheduledMessage.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/scheduled-messages", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, content, cronExpr } = req.body;
  const row = await prisma.scheduledMessage.create({
    data: { guildId: req.params.guildId, channelId, content, cronExpr },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/scheduled-messages/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.scheduledMessage.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
