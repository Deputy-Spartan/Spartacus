import { levelForXp } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { xpCooldownCache } from "../../lib/cache";
import { addWeekly, economyPlus, eventMultiplier, personalBoost, prestigeMultiplier } from "../../lib/economyPlus";

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

export interface XpResult {
  leveledUp: boolean;
  from: number; // level before
  level: number; // level now
  gained: number;
}

// Adds XP with every multiplier that applies: the Stream Deck boost, XP
// Events, the member's own potion, and Prestige Perks. Levels are a straight
// line (100 XP per level, see levelForXp), and one award can cross several.
export async function awardXp(guildId: string, userId: string, base: number): Promise<XpResult> {
  const [server, event, personal, plus, before] = await Promise.all([
    xpBoost(guildId),
    eventMultiplier(guildId),
    personalBoost(guildId, userId),
    economyPlus(guildId),
    prisma.memberXp.findUnique({ where: { guildId_userId: { guildId, userId } }, select: { prestige: true, level: true } }),
  ]);
  const gained = Math.max(1, Math.round(base * server * event * personal * prestigeMultiplier(plus, before?.prestige ?? 0)));
  const record = await prisma.memberXp.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, xp: gained },
    update: { xp: { increment: gained } },
  });
  void addWeekly(guildId, userId, { xp: gained });
  const from = record.level;
  const target = levelForXp(record.xp);
  if (target > from) {
    // Only raise it if nothing else did meanwhile, so a level-up is announced once.
    const moved = await prisma.memberXp.updateMany({ where: { guildId, userId, level: from }, data: { level: target } });
    if (moved.count) return { leveledUp: true, from, level: target, gained };
  }
  return { leveledUp: false, from, level: from, gained };
}

export async function awardMessageXp(guildId: string, userId: string): Promise<XpResult | null> {
  const key = `${guildId}:${userId}`;
  if (xpCooldownCache.has(key)) return null;
  xpCooldownCache.set(key, Date.now(), { ttl: COOLDOWN_MS });
  const base = Math.floor(Math.random() * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1)) + XP_PER_MESSAGE_MIN;
  return awardXp(guildId, userId, base);
}
