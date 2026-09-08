import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/giveaways", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.giveaway.findMany({
    where: { guildId: req.params.guildId },
    include: { entries: true },
    orderBy: { endsAt: "desc" },
  });
  res.json(rows);
});

// The bot posts the giveaway embed with an Enter button and ends it via
// jobs/giveawayEnder.ts — this just schedules it.
router.post("/guilds/:guildId/giveaways", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, prize, winnerCount, endsAt } = req.body;
  const row = await prisma.giveaway.create({
    data: { guildId: req.params.guildId, channelId, prize, winnerCount, endsAt: new Date(endsAt) },
  });
  res.status(201).json(row);
});

export default router;
