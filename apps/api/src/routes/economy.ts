import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/economy/config", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.economyConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      currencyName: "Coins",
      currencyIcon: "🪙",
      messageEarnMin: 2,
      messageEarnMax: 6,
      dailyAmount: 200,
      maxBet: 5000,
    }
  );
});

router.put("/guilds/:guildId/economy/config", requireAuth, requireGuildPermission, async (req, res) => {
  const { currencyName, currencyIcon, messageEarnMin, messageEarnMax, dailyAmount, maxBet } = req.body;
  const config = await prisma.economyConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, currencyName, currencyIcon, messageEarnMin, messageEarnMax, dailyAmount, maxBet },
    update: { currencyName, currencyIcon, messageEarnMin, messageEarnMax, dailyAmount, maxBet },
  });
  res.json(config);
});

router.get("/guilds/:guildId/economy/leaderboard", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.economyBalance.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { balance: "desc" },
    take: 50,
  });
  res.json(rows);
});

export default router;
