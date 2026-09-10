import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/status-channels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.statusChannel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/status-channels", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId } = req.body as { channelId: string };
  if (!channelId) return res.status(400).json({ error: "channelId is required" });

  const row = await prisma.statusChannel.upsert({
    where: { channelId },
    create: { guildId: req.params.guildId, channelId },
    // Changing channels should redraw a fresh message there, not try to edit
    // a messageId that lived in the old channel.
    update: { channelId, messageId: null },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/status-channels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.statusChannel.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Status channel not found" });
  }
  await prisma.statusChannel.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
