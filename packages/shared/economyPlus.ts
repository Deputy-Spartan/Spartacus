// Economy Hub: everything that makes levels and coins worth chasing, in the
// one Economy module. Shared by the bot and the dashboard.

// ---- XP curve: a straight line, 100 XP per level. The XP total to reach
// level 10 is 1,000, level 20 is 2,000, level 30 is 3,000, and so on.
export const XP_PER_LEVEL = 100;
export function xpForLevel(level: number): number {
  return Math.max(0, level) * XP_PER_LEVEL;
}
export function levelForXp(xp: number): number {
  return Math.max(0, Math.floor(xp / XP_PER_LEVEL));
}

// ---- The level ladder: one role every 5 levels, colors progressing from
// grey through green, blue, purple, red and orange to gold. Every level in
// between gets its own color on the same path (levelColor), so level-ups
// shift color a little each time and match the role you're working toward.
export interface LadderRung {
  level: number;
  name: string;
  color: string;
}
export const LEVEL_LADDER: LadderRung[] = [
  { level: 1, name: "Recruit", color: "#95A5A6" },
  { level: 5, name: "Squire", color: "#2ECC71" },
  { level: 10, name: "Warrior", color: "#1ABC9C" },
  { level: 15, name: "Vanguard", color: "#3498DB" },
  { level: 20, name: "Gladiator", color: "#5865F2" },
  { level: 25, name: "Champion", color: "#9B59B6" },
  { level: 30, name: "Centurion", color: "#E91E63" },
  { level: 35, name: "Warlord", color: "#E74C3C" },
  { level: 40, name: "Conqueror", color: "#E67E22" },
  { level: 45, name: "Titan", color: "#F1C40F" },
  { level: 50, name: "Spartan Legend", color: "#FFD700" },
];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// The color for any level: exactly the role color on a rung, blended
// between rungs, gold from 50 up.
export function levelColor(level: number): string {
  const L = LEVEL_LADDER;
  if (level <= L[0].level) return L[0].color;
  if (level >= L[L.length - 1].level) return L[L.length - 1].color;
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = L[i + 1];
    if (level >= a.level && level <= b.level) {
      const t = (level - a.level) / (b.level - a.level);
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
      return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
    }
  }
  return L[0].color;
}

// The rung a level belongs to (the last role earned).
export function ladderRung(level: number): LadderRung | null {
  let found: LadderRung | null = null;
  for (const r of LEVEL_LADDER) if (level >= r.level) found = r;
  return found;
}

// ---- Loot crates ----
export const CRATE_RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type CrateRarity = (typeof CRATE_RARITIES)[number];
export const CRATE_INFO: Record<CrateRarity, { name: string; color: string; emoji: string }> = {
  common: { name: "Common", color: "#9AA3B5", emoji: "📦" },
  rare: { name: "Rare", color: "#5AA7FF", emoji: "🎁" },
  epic: { name: "Epic", color: "#B07CFF", emoji: "💎" },
  legendary: { name: "Legendary", color: "#FFD700", emoji: "👑" },
};
// What each crate can give: [chance %, reward]. Coins are a range.
export type CrateReward =
  | { kind: "coins"; min: number; max: number }
  | { kind: "boost"; mult: number; minutes: number }
  | { kind: "freeze"; count: number }
  | { kind: "crate"; rarity: CrateRarity };
export const CRATE_TABLE: Record<CrateRarity, Array<[number, CrateReward]>> = {
  common: [[70, { kind: "coins", min: 150, max: 400 }], [20, { kind: "boost", mult: 2, minutes: 30 }], [10, { kind: "freeze", count: 1 }]],
  rare: [[60, { kind: "coins", min: 600, max: 1200 }], [25, { kind: "boost", mult: 2, minutes: 60 }], [15, { kind: "freeze", count: 2 }]],
  epic: [[60, { kind: "coins", min: 2000, max: 4000 }], [30, { kind: "boost", mult: 2, minutes: 180 }], [10, { kind: "crate", rarity: "legendary" }]],
  legendary: [[70, { kind: "coins", min: 8000, max: 15000 }], [30, { kind: "boost", mult: 3, minutes: 360 }]],
};
// Crates from levelling up get better as you climb.
export function levelCrateRarity(level: number): CrateRarity {
  if (level >= 50) return "legendary";
  if (level >= 35) return "epic";
  if (level >= 20) return "rare";
  return "common";
}

// ---- Shop ----
export const SHOP_ITEM_TYPES = {
  ROLE: "Give a role (for a number of days, or for good)",
  XP_BOOST: "Personal XP potion (a multiplier for some minutes)",
  CRATE: "A loot crate",
  STREAK_FREEZE: "Streak freeze (covers one missed /daily)",
  CUSTOM: "Something staff hand out (a shoutout, a nickname change…), posted to the shop log",
} as const;
export type ShopItemType = keyof typeof SHOP_ITEM_TYPES;
export const MAX_SHOP_ITEMS = 25;

export const STARTER_SHOP: Array<{ emoji: string; name: string; description: string; price: number; type: ShopItemType; durationDays?: number; boostMult?: number; boostMinutes?: number; crateRarity?: CrateRarity }> = [
  { emoji: "🧪", name: "2x XP Potion", description: "Double XP for you for 1 hour", price: 800, type: "XP_BOOST", boostMult: 2, boostMinutes: 60 },
  { emoji: "🎁", name: "Mystery Crate", description: "A Rare crate: coins, a potion or freezes", price: 1000, type: "CRATE", crateRarity: "rare" },
  { emoji: "🛡️", name: "Streak Freeze", description: "Miss a day without losing your /daily streak", price: 600, type: "STREAK_FREEZE" },
  { emoji: "📣", name: "Shoutout", description: "Staff post a shoutout for you or your stream", price: 2500, type: "CUSTOM" },
];

// ---- XP events ----
export const EVENT_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Berlin",
  "Australia/Sydney",
  "UTC",
] as const;

// The hour and weekday in a timezone.
export function localParts(tz: string, at = new Date()): { weekday: number; hour: number; minute: number; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday: wd, hour: Number(get("hour")) % 24, minute: Number(get("minute")), ymd: `${get("year")}-${get("month")}-${get("day")}` };
}

// A label for the week (Monday to Sunday) in a timezone, e.g. "2026-11-02".
export function weekKey(tz: string, at = new Date()): string {
  const p = localParts(tz, at);
  const daysSinceMonday = (p.weekday + 6) % 7;
  const d = new Date(`${p.ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

export interface EconomyEventSettings {
  timezone: string;
  weekendEnabled: boolean;
  weekendMult: number;
  happyEnabled: boolean;
  happyHour: number;
  happyMult: number;
}
// Which event is on right now, if any (the bigger one wins if both are).
export function activeEvent(s: EconomyEventSettings, at = new Date()): { kind: "weekend" | "happy"; mult: number } | null {
  const p = localParts(s.timezone || "UTC", at);
  const weekend = s.weekendEnabled && ((p.weekday === 5 && p.hour >= 18) || p.weekday === 6 || p.weekday === 0);
  const happy = s.happyEnabled && p.hour === s.happyHour;
  if (weekend && (!happy || s.weekendMult >= s.happyMult)) return { kind: "weekend", mult: s.weekendMult };
  if (happy) return { kind: "happy", mult: s.happyMult };
  return null;
}

// ---- Weekly champions ----
export const CHAMP_CATEGORIES = {
  xp: "📈 Most XP this week",
  coins: "🪙 Top earner this week",
  voice: "🎙️ Voice MVP (most voice XP minutes)",
  streak: "🔥 Longest /daily streak",
} as const;
export type ChampCategory = keyof typeof CHAMP_CATEGORIES;

// ---- Settings ----
export const ECONOMY_PLUS_DEFAULTS = {
  levelColors: true,
  levelUpCard: true,
  levelUpCoins: 50,
  keepTopLevelRole: true,
  shopEnabled: false,
  shopLogChannelId: null as string | null,
  cratesEnabled: false,
  crateEveryLevels: 5,
  crateOnStreak: true,
  crateChannelId: null as string | null,
  voiceXpEnabled: false,
  voiceXpPerMin: 5,
  voiceCoinsPer10: 3,
  timezone: "America/New_York",
  weekendEnabled: false,
  weekendMult: 2,
  happyEnabled: false,
  happyHour: 20,
  happyMult: 1.5,
  eventChannelId: null as string | null,
  prestigeBonusPct: 10,
  champsEnabled: false,
  champsChannelId: null as string | null,
  champsRoleId: null as string | null,
  champsCategories: ["xp", "coins", "voice", "streak"] as string[],
};
export type EconomyPlusSettings = typeof ECONOMY_PLUS_DEFAULTS;

const int = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const num = (v: unknown, allowed: number[], d: number) => (typeof v === "number" && allowed.includes(v) ? v : d);
const id = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function cleanEconomyPlus(b: Record<string, unknown>): EconomyPlusSettings {
  const D = ECONOMY_PLUS_DEFAULTS;
  return {
    levelColors: bool(b.levelColors, D.levelColors),
    levelUpCard: bool(b.levelUpCard, D.levelUpCard),
    levelUpCoins: int(b.levelUpCoins, 0, 10000, D.levelUpCoins),
    keepTopLevelRole: bool(b.keepTopLevelRole, D.keepTopLevelRole),
    shopEnabled: bool(b.shopEnabled, D.shopEnabled),
    shopLogChannelId: id(b.shopLogChannelId),
    cratesEnabled: bool(b.cratesEnabled, D.cratesEnabled),
    crateEveryLevels: num(b.crateEveryLevels, [0, 1, 2, 5, 10], D.crateEveryLevels),
    crateOnStreak: bool(b.crateOnStreak, D.crateOnStreak),
    crateChannelId: id(b.crateChannelId),
    voiceXpEnabled: bool(b.voiceXpEnabled, D.voiceXpEnabled),
    voiceXpPerMin: int(b.voiceXpPerMin, 1, 20, D.voiceXpPerMin),
    voiceCoinsPer10: int(b.voiceCoinsPer10, 0, 50, D.voiceCoinsPer10),
    timezone: typeof b.timezone === "string" && (EVENT_TIMEZONES as readonly string[]).includes(b.timezone) ? b.timezone : D.timezone,
    weekendEnabled: bool(b.weekendEnabled, D.weekendEnabled),
    weekendMult: num(b.weekendMult, [1.5, 2, 3], D.weekendMult),
    happyEnabled: bool(b.happyEnabled, D.happyEnabled),
    happyHour: int(b.happyHour, 0, 23, D.happyHour),
    happyMult: num(b.happyMult, [1.25, 1.5, 2], D.happyMult),
    eventChannelId: id(b.eventChannelId),
    prestigeBonusPct: num(b.prestigeBonusPct, [0, 5, 10, 15, 20, 25], D.prestigeBonusPct),
    champsEnabled: bool(b.champsEnabled, D.champsEnabled),
    champsChannelId: id(b.champsChannelId),
    champsRoleId: id(b.champsRoleId),
    champsCategories: Array.isArray(b.champsCategories) ? [...new Set(b.champsCategories.filter((c): c is string => typeof c === "string" && c in CHAMP_CATEGORIES))] : D.champsCategories,
  };
}

export interface ShopItemInput {
  emoji: string;
  name: string;
  description: string;
  price: number;
  type: ShopItemType;
  roleId: string | null;
  durationDays: number | null;
  boostMult: number | null;
  boostMinutes: number | null;
  crateRarity: CrateRarity | null;
  stock: number | null;
  enabled: boolean;
}
export function cleanShopItem(b: Record<string, unknown>): ShopItemInput | string {
  const type = typeof b.type === "string" && b.type in SHOP_ITEM_TYPES ? (b.type as ShopItemType) : null;
  if (!type) return "Pick what the item does.";
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return "Give the item a name.";
  const price = int(b.price, 0, 10_000_000, -1);
  if (price < 0) return "Set a price.";
  const roleId = id(b.roleId);
  if (type === "ROLE" && !roleId) return "Pick the role this item gives.";
  const rarity = typeof b.crateRarity === "string" && (CRATE_RARITIES as readonly string[]).includes(b.crateRarity) ? (b.crateRarity as CrateRarity) : null;
  if (type === "CRATE" && !rarity) return "Pick the crate's rarity.";
  return {
    emoji: typeof b.emoji === "string" && b.emoji.trim() ? b.emoji.trim().slice(0, 64) : "🛒",
    name,
    description: typeof b.description === "string" ? b.description.trim().slice(0, 120) : "",
    price,
    type,
    roleId: type === "ROLE" ? roleId : null,
    durationDays: type === "ROLE" && typeof b.durationDays === "number" && b.durationDays > 0 ? int(b.durationDays, 1, 365, 7) : null,
    boostMult: type === "XP_BOOST" ? num(b.boostMult, [1.5, 2, 3], 2) : null,
    boostMinutes: type === "XP_BOOST" ? int(b.boostMinutes, 5, 1440, 60) : null,
    crateRarity: type === "CRATE" ? rarity : null,
    stock: typeof b.stock === "number" && b.stock >= 0 ? int(b.stock, 0, 100000, 0) : null,
    enabled: bool(b.enabled, true),
  };
}
