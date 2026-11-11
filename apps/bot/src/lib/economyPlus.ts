import { ECONOMY_PLUS_DEFAULTS, activeEvent, cleanLadder, weekKey, type CrateRarity, type EconomyPlusSettings } from "@spartacus/shared";
import { prisma } from "./prisma";

// Economy Hub settings for a server, cached briefly (read on every message).
const cache = new Map<string, { at: number; s: EconomyPlusSettings }>();
export function forgetEconomyPlus(guildId: string) {
  cache.delete(guildId);
}
export async function economyPlus(guildId: string): Promise<EconomyPlusSettings> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < 30_000) return hit.s;
  const row = await prisma.economyPlus.findUnique({ where: { guildId } }).catch(() => null);
  const s: EconomyPlusSettings = row
    ? {
        levelColors: row.levelColors,
        levelUpCard: row.levelUpCard,
        levelUpCoins: row.levelUpCoins,
        keepTopLevelRole: row.keepTopLevelRole,
        shopEnabled: row.shopEnabled,
        shopLogChannelId: row.shopLogChannelId,
        cratesEnabled: row.cratesEnabled,
        crateEveryLevels: row.crateEveryLevels,
        crateOnStreak: row.crateOnStreak,
        crateChannelId: row.crateChannelId,
        voiceXpEnabled: row.voiceXpEnabled,
        voiceXpPerMin: row.voiceXpPerMin,
        voiceCoinsPer10: row.voiceCoinsPer10,
        timezone: row.timezone,
        weekendEnabled: row.weekendEnabled,
        weekendMult: row.weekendMult,
        happyEnabled: row.happyEnabled,
        happyHour: row.happyHour,
        happyMult: row.happyMult,
        eventChannelId: row.eventChannelId,
        prestigeBonusPct: row.prestigeBonusPct,
        champsEnabled: row.champsEnabled,
        champsChannelId: row.champsChannelId,
        champsRoleId: row.champsRoleId,
        champsCategories: row.champsCategories,
        ladder: cleanLadder(row.ladder),
      }
    : { ...ECONOMY_PLUS_DEFAULTS };
  cache.set(guildId, { at: Date.now(), s });
  return s;
}

// The XP Events multiplier right now (Double XP Weekend / Happy Hour).
export async function eventMultiplier(guildId: string): Promise<number> {
  const s = await economyPlus(guildId);
  return activeEvent(s)?.mult ?? 1;
}

// Prestige Perks: +N% per prestige, capped at doubling.
export function prestigeMultiplier(s: EconomyPlusSettings, prestige: number): number {
  return 1 + Math.min(1, (s.prestigeBonusPct / 100) * prestige);
}

// A member's own XP potion, if one is running.
export async function personalBoost(guildId: string, userId: string): Promise<number> {
  const inv = await prisma.economyInventory.findUnique({ where: { guildId_userId: { guildId, userId } }, select: { boostUntil: true, boostMult: true } }).catch(() => null);
  return inv?.boostUntil && inv.boostUntil.getTime() > Date.now() ? Math.max(1, inv.boostMult) : 1;
}

// Coins multiplier from events and prestige (applied to message earnings).
export async function coinBonus(guildId: string, userId: string): Promise<number> {
  const s = await economyPlus(guildId);
  const xp = await prisma.memberXp.findUnique({ where: { guildId_userId: { guildId, userId } }, select: { prestige: true } }).catch(() => null);
  return (activeEvent(s)?.mult ?? 1) * prestigeMultiplier(s, xp?.prestige ?? 0);
}

// This week's XP and voice minutes, for Weekly Champions.
export async function addWeekly(guildId: string, userId: string, data: { xp?: number; voiceMin?: number }) {
  const s = await economyPlus(guildId);
  if (!s.champsEnabled) return;
  const week = weekKey(s.timezone);
  await prisma.weeklyStat
    .upsert({
      where: { guildId_userId_week: { guildId, userId, week } },
      create: { guildId, userId, week, xp: data.xp ?? 0, voiceMin: data.voiceMin ?? 0 },
      update: { xp: { increment: data.xp ?? 0 }, voiceMin: { increment: data.voiceMin ?? 0 } },
    })
    .catch(() => null);
}

export async function giveCrates(guildId: string, userId: string, rarity: CrateRarity, count = 1) {
  await prisma.economyInventory.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, [rarity]: count },
    update: { [rarity]: { increment: count } },
  });
}

export async function giveFreezes(guildId: string, userId: string, count: number) {
  await prisma.economyInventory.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, streakFreezes: count },
    update: { streakFreezes: { increment: count } },
  });
}

// Starts (or extends) a personal XP potion. A stronger potion replaces a weaker one.
export async function giveBoost(guildId: string, userId: string, mult: number, minutes: number): Promise<Date> {
  const inv = await prisma.economyInventory.findUnique({ where: { guildId_userId: { guildId, userId } } });
  const now = Date.now();
  const running = inv?.boostUntil && inv.boostUntil.getTime() > now;
  const base = running && (inv?.boostMult ?? 1) === mult ? (inv?.boostUntil as Date).getTime() : now;
  const until = new Date(base + minutes * 60_000);
  const newMult = running ? Math.max(mult, inv?.boostMult ?? 1) : mult;
  await prisma.economyInventory.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, boostUntil: until, boostMult: newMult },
    update: { boostUntil: until, boostMult: newMult },
  });
  return until;
}
