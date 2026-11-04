import { prisma } from "../../lib/prisma";
import { xpCooldownCache } from "../../lib/cache";

// The server's XP boost (from the Stream Deck XP Boost dial), cached for a
// minute so every message isn't a database read.
const boostCache = new Map<string, { boost: number; at: number }>();
export function forgetXpBoost(guildId: string) {
  boostCache.delete(guildId);
}
async function xpBoost(guildId: string): Promise<number> {
  const hit = boostCache.get(guildId);
  if (hit && Date.now() - hit.at < 60_000) return hit.boost;
  const s = await prisma.levelingSettings.findUnique({ where: { guildId }, select: { xpBoost: true, xpBoostEndsAt: true } }).catch(() => null);
  const boost = s?.xpBoostEndsAt && s.xpBoostEndsAt.getTime() > Date.now() ? Math.max(1, Math.min(5, s.xpBoost)) : 1;
  boostCache.set(guildId, { boost, at: Date.now() });
  return boost;
}

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

  const base = Math.floor(Math.random() * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1)) + XP_PER_MESSAGE_MIN;
  const gained = Math.round(base * (await xpBoost(guildId)));

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
