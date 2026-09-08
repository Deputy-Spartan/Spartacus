import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// --- Player Reports ---
router.get("/guilds/:guildId/reports", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.playerReport.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

router.patch("/guilds/:guildId/reports/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { status } = req.body;
  const row = await prisma.playerReport.update({ where: { id: req.params.id }, data: { status } });
  res.json(row);
});

// --- Perm Watch ---
router.get("/guilds/:guildId/perm-watch", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.permWatchConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, alertChannelId: null });
});

router.put("/guilds/:guildId/perm-watch", requireAuth, requireGuildPermission, async (req, res) => {
  const { alertChannelId } = req.body;
  const config = await prisma.permWatchConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, alertChannelId },
    update: { alertChannelId },
  });
  res.json(config);
});

export default router;
