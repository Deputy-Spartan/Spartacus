import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
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
  const { channelId, prize, description, embedColor, imageUrl, buttons, winnerCount, endsAt, embedExtra, savedEmbedId } = req.body;
  const row = await prisma.giveaway.create({
    data: {
      guildId: req.params.guildId,
      channelId,
      prize,
      description,
      embedColor,
      imageUrl,
      buttons: buttons ?? [],
      winnerCount,
      endsAt: new Date(endsAt),
      embedExtra: (embedExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      savedEmbedId: savedEmbedId ?? null,
    },
  });
  res.status(201).json(row);
});

export default router;
