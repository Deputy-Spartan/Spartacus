import { prisma } from "./prisma";

export async function getConfig(guildId: string) {
  const config = await prisma.economyConfig.findUnique({ where: { guildId } });
  return (
    config ?? {
      guildId,
      currencyName: "Coins",
      currencyIcon: "🪙",
      messageEarnMin: 2,
      messageEarnMax: 6,
      dailyAmount: 200,
      maxBet: 5000,
    }
  );
}

export async function getBalance(guildId: string, userId: string): Promise<number> {
  const row = await prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } });
  return row?.balance ?? 0;
}

export async function addBalance(guildId: string, userId: string, amount: number) {
  return prisma.economyBalance.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, balance: Math.max(0, amount) },
    update: { balance: { increment: amount } },
  });
}
