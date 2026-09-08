import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// --- Invite Tracking (read) ---
router.get("/guilds/:guildId/invite-stats", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.inviteStat.findMany({ where: { guildId: req.params.guildId }, orderBy: { uses: "desc" } });
  res.json(rows);
});

// --- Server Partnerships ---
router.get("/guilds/:guildId/partnerships", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.serverPartnership.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/partnerships", requireAuth, requireGuildPermission, async (req, res) => {
  const { partnerName, partnerInvite, type } = req.body;
  const row = await prisma.serverPartnership.create({
    data: { guildId: req.params.guildId, partnerName, partnerInvite, type },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/partnerships/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.serverPartnership.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// --- Counting Game ---
router.get("/guilds/:guildId/counting-game", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.countingGameConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, channelId: null, currentCount: 0, resetOnMistake: true, highScore: 0 });
});

router.put("/guilds/:guildId/counting-game", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, resetOnMistake } = req.body;
  const config = await prisma.countingGameConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId, resetOnMistake },
    update: { channelId, resetOnMistake },
  });
  res.json(config);
});

// --- Polls / Suggestions (read) ---
router.get("/guilds/:guildId/polls", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.poll.findMany({ where: { guildId: req.params.guildId }, include: { votes: true }, orderBy: { createdAt: "desc" } });
  res.json(rows);
});

router.get("/guilds/:guildId/suggestions", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.suggestion.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" } });
  res.json(rows);
});

export default router;
