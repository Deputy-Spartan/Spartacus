import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/auto-purge", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.autoPurgeConfig.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/auto-purge", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, intervalMinutes, ignorePinned, ignoreImages, ignoreLinks, protectedEmojis } = req.body;
  const data = {
    guildId: req.params.guildId,
    channelId,
    intervalMinutes: Number(intervalMinutes) || 60,
    ignorePinned: Boolean(ignorePinned),
    ignoreImages: Boolean(ignoreImages),
    ignoreLinks: Boolean(ignoreLinks),
    protectedEmojis: (Array.isArray(protectedEmojis) ? protectedEmojis : []) as Prisma.InputJsonValue,
  };
  const row = await prisma.autoPurgeConfig.upsert({ where: { channelId }, create: data, update: data });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/auto-purge/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.autoPurgeConfig.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });

  const { intervalMinutes, ignorePinned, ignoreImages, ignoreLinks, protectedEmojis } = req.body;
  const data: Record<string, unknown> = {};
  if (intervalMinutes !== undefined) data.intervalMinutes = Number(intervalMinutes);
  if (ignorePinned !== undefined) data.ignorePinned = Boolean(ignorePinned);
  if (ignoreImages !== undefined) data.ignoreImages = Boolean(ignoreImages);
  if (ignoreLinks !== undefined) data.ignoreLinks = Boolean(ignoreLinks);
  if (protectedEmojis !== undefined) data.protectedEmojis = Array.isArray(protectedEmojis) ? protectedEmojis : [];

  const row = await prisma.autoPurgeConfig.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/auto-purge/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.autoPurgeConfig.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Not found" });
  await prisma.autoPurgeConfig.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
