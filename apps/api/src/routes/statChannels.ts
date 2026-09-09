import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const VALID_TYPES = new Set(["MEMBER_COUNT", "BOOST_COUNT", "CHANNEL_COUNT"]);

router.get("/guilds/:guildId/stat-channels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.statChannel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/stat-channels", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, statType, format } = req.body as { channelId: string; statType: string; format?: string };
  if (!VALID_TYPES.has(statType)) return res.status(400).json({ error: "Invalid stat type" });

  const row = await prisma.statChannel.upsert({
    where: { channelId },
    create: { guildId: req.params.guildId, channelId, statType, format: format || "{stat}: {count}" },
    update: { statType, format: format || "{stat}: {count}" },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/stat-channels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.statChannel.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Stat channel not found" });
  }
  await prisma.statChannel.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
