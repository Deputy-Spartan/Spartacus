import { GuildMember } from "discord.js";
import { prisma } from "./prisma";

const DEFAULTS = {
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
  channelMultipliers: [] as Array<{ channelId: string; multiplier: number }>,
  roleMultipliers: [] as Array<{ roleId: string; multiplier: number }>,
  maxBet: 5000,
};

export async function getConfig(guildId: string) {
  const config = await prisma.economyConfig.findUnique({ where: { guildId } });
  if (!config) return { guildId, ...DEFAULTS };
  return {
    ...config,
    channelMultipliers: Array.isArray(config.channelMultipliers) ? (config.channelMultipliers as Array<{ channelId: string; multiplier: number }>) : [],
    roleMultipliers: Array.isArray(config.roleMultipliers) ? (config.roleMultipliers as Array<{ roleId: string; multiplier: number }>) : [],
  };
}

export async function getBalance(guildId: string, userId: string): Promise<number> {
  const row = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
  return row?.balance ?? 0;
}

// The single choke point every earn/spend/transfer passes through — clamps
// to [0, maxBalance], tracks lifetime earned/spent, and drops a ledger row
// so analytics has real history instead of guessing from the current balance.
export async function addBalance(guildId: string, userId: string, amount: number, reason: string, maxBalance?: number) {
  const cap = maxBalance ?? DEFAULTS.maxBalance;
  const existing = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
  const current = existing?.balance ?? 0;
  const next = Math.max(0, Math.min(cap, current + amount));
  const delta = next - current;

  const row = await prisma.economyBalance.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: {
      guildId,
      userId,
      balance: next,
      totalEarned: delta > 0 ? delta : 0,
      totalSpent: delta < 0 ? -delta : 0,
    },
    update: {
      balance: next,
      ...(delta > 0 ? { totalEarned: { increment: delta } } : {}),
      ...(delta < 0 ? { totalSpent: { increment: -delta } } : {}),
    },
  });

  if (delta !== 0) {
    await prisma.economyTransaction.create({ data: { guildId, userId, amount: delta, reason } });
  }

  return row;
}

function multiplierFor(member: GuildMember | null | undefined, channelId: string, config: Awaited<ReturnType<typeof getConfig>>): number {
  const channelMatch = config.channelMultipliers.find((m) => m.channelId === channelId);
  const channelMultiplier = channelMatch?.multiplier ?? 1;

  let roleMultiplier = 1;
  if (member) {
    const matches = config.roleMultipliers.filter((m) => member.roles.cache.has(m.roleId));
    if (matches.length > 0) roleMultiplier = Math.max(...matches.map((m) => m.multiplier));
  }

  return channelMultiplier * roleMultiplier;
}

// Applies the message-earning cooldown, minimum length, and channel/role
// multipliers all in one place — messageCreate.ts just calls this per
// message and trusts the result.
export async function awardMessageEarnings(
  guildId: string,
  member: GuildMember,
  channelId: string,
  messageContent: string
): Promise<void> {
  const config = await getConfig(guildId);
  if (!config.earnOnMessages) return;
  if (messageContent.trim().length < config.minMessageLength) return;

  const balanceRow = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId: member.id } } });
  if (balanceRow?.lastMessageEarnAt) {
    const elapsedSec = (Date.now() - balanceRow.lastMessageEarnAt.getTime()) / 1000;
    if (elapsedSec < config.messageCooldownSec) return;
  }

  const base = Math.floor(Math.random() * (config.messageEarnMax - config.messageEarnMin + 1)) + config.messageEarnMin;
  const amount = Math.round(base * multiplierFor(member, channelId, config));

  await prisma.economyBalance.upsert({
    where: { guildId_userId: { guildId, userId: member.id } },
    create: { guildId, userId: member.id, lastMessageEarnAt: new Date() },
    update: { lastMessageEarnAt: new Date() },
  });
  await addBalance(guildId, member.id, amount, "message", config.maxBalance);
}

// Streak resets if the member skips a day; bonus is capped at streakCapDays
// worth of bonus, matching how the dashboard describes it.
export async function claimDaily(guildId: string, userId: string) {
  const config = await getConfig(guildId);
  if (!config.dailyEnabled) return { ok: false as const, reason: "disabled" as const };

  const row = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
  const now = new Date();

  if (row?.lastDailyClaim) {
    const hoursSince = (now.getTime() - row.lastDailyClaim.getTime()) / 3_600_000;
    if (hoursSince < 24) return { ok: false as const, reason: "cooldown" as const, hoursRemaining: 24 - hoursSince };
  }

  const daysSinceLast = row?.lastDailyClaim ? (now.getTime() - row.lastDailyClaim.getTime()) / 86_400_000 : Infinity;
  const streakContinues = daysSinceLast < 48; // claimed yesterday or today, within a 48h grace window
  const nextStreak = streakContinues ? (row?.dailyStreak ?? 0) + 1 : 1;
  const cappedStreak = Math.min(nextStreak, config.streakCapDays);
  const amount = config.dailyAmount + cappedStreak * config.streakBonusPerDay;

  await prisma.economyBalance.update({
    where: { guildId_userId: { guildId, userId } },
    data: { lastDailyClaim: now, dailyStreak: nextStreak },
  }).catch(async () => {
    await prisma.economyBalance.create({ data: { guildId, userId, lastDailyClaim: now, dailyStreak: nextStreak } });
  });
  await addBalance(guildId, userId, amount, "daily", config.maxBalance);

  return { ok: true as const, amount, streak: nextStreak };
}

export async function transfer(guildId: string, fromUserId: string, toUserId: string, amount: number) {
  const config = await getConfig(guildId);
  if (!config.transfersEnabled) return { ok: false as const, reason: "disabled" as const };
  if (amount < config.transferMinAmount) return { ok: false as const, reason: "below_minimum" as const };

  const fromBalance = await getBalance(guildId, fromUserId);
  if (fromBalance < amount) return { ok: false as const, reason: "insufficient" as const };

  const tax = Math.floor((amount * config.transferTaxPercent) / 100);
  const received = amount - tax;

  await addBalance(guildId, fromUserId, -amount, "transfer_out", config.maxBalance);
  await addBalance(guildId, toUserId, received, "transfer_in", config.maxBalance);
  if (tax > 0) await prisma.economyTransaction.create({ data: { guildId, userId: fromUserId, amount: -tax, reason: "transfer_tax" } });

  return { ok: true as const, received, tax };
}
