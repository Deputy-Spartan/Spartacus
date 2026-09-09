import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/announcements", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.announcement.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/announcements", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, content, embedEnabled, embedTitle, embedColor, buttons, scheduledFor } = req.body;
  const row = await prisma.announcement.create({
    data: {
      guildId: req.params.guildId,
      channelId,
      content,
      embedEnabled: Boolean(embedEnabled),
      embedTitle,
      embedColor,
      buttons: buttons ?? [],
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/announcements/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
