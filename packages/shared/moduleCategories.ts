import type { ModuleKey } from "./moduleKeys";

// Purely a display/grouping hint (used by the dashboard sidebar's section
// headers and by the bot's /setup-test-server channel scaffolding) — never
// a source of truth for "does this module exist". A ModuleKey missing from
// this map still gets a channel/nav entry, just filed under "🧩 other"
// instead of a named section, so a newly added module can never be silently
// dropped just because someone forgot to categorize it here.
export const MODULE_CATEGORY_ORDER = [
  "🛡️ moderation",
  "🔒 security",
  "👋 community",
  "📢 engagement",
  "🏆 levelling & economy",
  "🎫 support",
  "🧰 utility",
  "🧩 other",
] as const;

export type ModuleCategory = (typeof MODULE_CATEGORY_ORDER)[number];

export const MODULE_CATEGORIES: Partial<Record<ModuleKey, ModuleCategory>> = {
  MODERATION: "🛡️ moderation",
  WARN_ESCALATION: "🛡️ moderation",
  BAN_APPEALS: "🛡️ moderation",
  MOD_DIGEST: "🛡️ moderation",
  PLAYER_REPORTS: "🛡️ moderation",

  AI_MODERATION: "🔒 security",
  ANTI_RAID: "🔒 security",
  ANTI_NUKE: "🔒 security",
  HONEYPOT: "🔒 security",
  SERVER_BACKUP: "🔒 security",
  VERIFICATION: "🔒 security",
  QUARANTINE: "🔒 security",
  ROLE_PERSISTENCE: "🔒 security",
  PERM_WATCH: "🔒 security",
  RULES_GATE: "🔒 security",

  WELCOME: "👋 community",
  REACTION_ROLES: "👋 community",
  STICKY_MESSAGES: "👋 community",
  STARBOARD: "👋 community",
  TEMP_CHANNELS: "👋 community",
  AI_CHAT: "👋 community",
  BIRTHDAYS: "👋 community",
  MEMBER_MILESTONES: "👋 community",
  CONFESSIONS: "👋 community",
  EVENTS: "👋 community",
  LFG: "👋 community",
  INVITE_TRACKING: "👋 community",
  MODMAIL: "👋 community",

  ANNOUNCEMENTS: "📢 engagement",
  GIVEAWAYS: "📢 engagement",
  STREAM_ALERTS: "📢 engagement",
  CUSTOM_COMMANDS: "📢 engagement",
  WEEKLY_RECAP: "📢 engagement",
  BUMP_REMINDER: "📢 engagement",
  SUGGESTIONS: "📢 engagement",
  SUGGESTION_ANALYTICS: "📢 engagement",
  POLLS: "📢 engagement",
  SCHEDULED_MESSAGES: "📢 engagement",

  LEVELING: "🏆 levelling & economy",
  RANK_CARDS: "🏆 levelling & economy",
  PRESTIGE: "🏆 levelling & economy",
  VOICE_ACTIVITY: "🏆 levelling & economy",
  ACHIEVEMENTS: "🏆 levelling & economy",
  GROWTH_ANALYTICS: "🏆 levelling & economy",
  ECONOMY: "🏆 levelling & economy",
  COUNTING_GAME: "🏆 levelling & economy",
  TRIVIA: "🏆 levelling & economy",
  CASINO: "🏆 levelling & economy",

  TICKETS: "🎫 support",
  APPLICATIONS: "🎫 support",

  CHANNEL_LOCKS: "🧰 utility",
  SLOW_MODE: "🧰 utility",
  STAT_CHANNELS: "🧰 utility",
  STATUS_CHANNEL: "🧰 utility",
  SERVER_TEMPLATES: "🧰 utility",
  REMINDERS: "🧰 utility",
};

export function getModuleCategory(key: ModuleKey): ModuleCategory {
  return MODULE_CATEGORIES[key] ?? "🧩 other";
}

// A handful of modules are meaningfully tied to a voice channel rather than
// a text one (a stat channel's whole point is a voice channel with a locked
// name; temp channels need a "join to create" voice hub).
export const VOICE_MODULE_KEYS: ReadonlySet<ModuleKey> = new Set<ModuleKey>(["STAT_CHANNELS", "TEMP_CHANNELS"]);

// Turns a module's display label into a Discord-safe channel name.
export function slugifyModuleLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}
