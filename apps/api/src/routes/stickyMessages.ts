import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/sticky-messages", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.stickyMessage.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/sticky-messages", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, content } = req.body;
  const row = await prisma.stickyMessage.upsert({
    where: { channelId },
    create: { guildId: req.params.guildId, channelId, content },
    update: { content },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/sticky-messages/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.stickyMessage.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
