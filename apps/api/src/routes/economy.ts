import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const DEFAULT_CONFIG = {
  currencyName: "Coins",
  currencyIcon: "🪙",
  embedColor: "#E8C547",
  maxBalance: 1_000_000_000,
  earnOnMessages: true,
  messageEarnMin: 2,
  messageEarnMax: 6,
  messageCooldownSec: 60,
  minMessageLength: 4,
  dailyEnabled: true,
  dailyAmount: 200,
  streakBonusPerDay: 0,
  streakCapDays: 7,
  transfersEnabled: true,
  transferMinAmount: 1,
  transferTaxPercent: 0,
  channelMultipliers: [] as unknown as Prisma.InputJsonValue,
  roleMultipliers: [] as unknown as Prisma.InputJsonValue,
  maxBet: 5000,
};
const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[];

router.get("/guilds/:guildId/economy/config", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.economyConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, ...DEFAULT_CONFIG });
});

router.put("/guilds/:guildId/economy/config", requireAuth, requireGuildPermission, async (req, res) => {
  const data: Record<string, unknown> = {};
  for (const key of CONFIG_KEYS) if (req.body[key] !== undefined) data[key] = req.body[key];

  const config = await prisma.economyConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...DEFAULT_CONFIG, ...data },
    update: data,
  });
  res.json(config);
});

router.get("/guilds/:guildId/economy/leaderboard", requireAuth, requireGuildPermission, async (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const rows = await prisma.economyBalance.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { balance: "desc" },
    take: 25,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
  res.json(rows);
});

router.get("/guilds/:guildId/economy/analytics", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const windowDays = Number(req.query.days) || 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [balances, activeMembers, earnedAgg, removedAgg, topEarners] = await Promise.all([
    prisma.economyBalance.findMany({ where: { guildId }, orderBy: { balance: "desc" } }),
    prisma.economyBalance.count({ where: { guildId, balance: { gt: 0 } } }),
    prisma.economyTransaction.aggregate({ where: { guildId, amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.economyTransaction.aggregate({ where: { guildId, amount: { lt: 0 }, createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.economyBalance.findMany({ where: { guildId }, orderBy: { totalEarned: "desc" }, take: 10 }),
  ]);

  const totalHeld = balances.reduce((sum, b) => sum + b.balance, 0);
  const top = (n: number) => {
    const slice = balances.slice(0, n).reduce((sum, b) => sum + b.balance, 0);
    return totalHeld > 0 ? (slice / totalHeld) * 100 : 0;
  };

  res.json({
    totalHeld,
    activeMembers,
    earned: earnedAgg._sum.amount ?? 0,
    removed: Math.abs(removedAgg._sum.amount ?? 0),
    concentration: { top5: top(5), top10: top(10), top50: top(50) },
    topEarners: topEarners.map((b) => ({ userId: b.userId, totalEarned: b.totalEarned, balance: b.balance })),
  });
});

export default router;
