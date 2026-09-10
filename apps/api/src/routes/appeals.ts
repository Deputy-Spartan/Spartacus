import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/appeal-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.appealSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({ appealChannelId: row?.appealChannelId ?? null });
});

router.put("/guilds/:guildId/appeal-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const { appealChannelId } = req.body as { appealChannelId?: string | null };

  const row = await prisma.appealSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, appealChannelId: appealChannelId ?? null },
    update: { ...(appealChannelId !== undefined ? { appealChannelId } : {}) },
  });

  res.json(row);
});

router.get("/guilds/:guildId/appeals", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.appeal.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows);
});

export default router;
