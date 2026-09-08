import { prisma } from "../../lib/prisma";
import { xpCooldownCache } from "../../lib/cache";

const XP_PER_MESSAGE_MIN = 15;
const XP_PER_MESSAGE_MAX = 25;
const COOLDOWN_MS = 60_000;

function xpForNextLevel(level: number) {
  return 5 * level * level + 50 * level + 100;
}

export async function awardMessageXp(guildId: string, userId: string) {
  const key = `${guildId}:${userId}`;
  if (xpCooldownCache.has(key)) return null;
  xpCooldownCache.set(key, Date.now(), { ttl: COOLDOWN_MS });

  const gained = Math.floor(Math.random() * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1)) + XP_PER_MESSAGE_MIN;

  const record = await prisma.memberXp.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, xp: gained },
    update: { xp: { increment: gained } },
  });

  const requiredXp = xpForNextLevel(record.level);
  if (record.xp >= requiredXp) {
    const leveledUp = await prisma.memberXp.update({
      where: { guildId_userId: { guildId, userId } },
      data: { level: { increment: 1 } },
    });
    return { leveledUp: true, level: leveledUp.level };
  }

  return { leveledUp: false, level: record.level };
}
