import type { ModuleKey } from "./moduleKeys";

// Paid plans from the Outpost Gaming store. One list, read by the bot (which
// features run), the API (what can be switched on) and the dashboard (🔒 and
// Unlock buttons), so the three can never disagree.
//
//   pro  = Spartacus Pro       kit  = Streamer Kit       deck = Stream Deck
//
// Anything not listed here is free for everyone.
export type PlanTier = "pro" | "kit" | "deck";
export const PLAN_TIERS: readonly PlanTier[] = ["pro", "kit", "deck"];

export const TIER_INFO: Record<PlanTier, { name: string; icon: string; blurb: string; product: string }> = {
  pro: { name: "Spartacus Pro", icon: "⭐", blurb: "Protection, staff tools, economy, events and analytics.", product: "spartacus-pro" },
  kit: { name: "Streamer Kit", icon: "🎥", blurb: "OBS overlays, the Kick/Twitch chat bot and stream growth tools.", product: "streamer-kit" },
  deck: { name: "Stream Deck", icon: "🎛️", blurb: "Run Spartacus from an Elgato Stream Deck: 50 keys and dials.", product: "stream-deck" },
};

// Which plans each store product unlocks. A product id that isn't here
// (a download, say) unlocks nothing in Spartacus.
export const PRODUCT_TIERS: Record<string, PlanTier[]> = {
  "spartacus-pro": ["pro"],
  "streamer-kit": ["kit"],
  "stream-deck": ["deck"],
  "streamer-deck": ["kit", "deck"],
  "all-access": ["pro", "kit", "deck"],
};

// Module switches that need a plan. Economy Hub's tabs (levels, prestige,
// voice XP, achievements, profile and rank cards) go with the Economy Hub.
export const MODULE_TIER: Partial<Record<ModuleKey, PlanTier>> = {
  WARN_ESCALATION: "pro",
  BAN_APPEALS: "pro",
  MOD_DIGEST: "pro",
  AI_MODERATION: "pro",
  ANTI_RAID: "pro",
  ANTI_NUKE: "pro",
  PERM_WATCH: "pro",
  HONEYPOT: "pro",
  SERVER_BACKUP: "pro",
  SERVER_TEMPLATES: "pro",
  APPLICATIONS: "pro",
  SUPPORT_INTAKE: "pro",
  ECONOMY: "pro",
  LEVELING: "pro",
  PRESTIGE: "pro",
  VOICE_ACTIVITY: "pro",
  ACHIEVEMENTS: "pro",
  PROFILE_CARDS: "pro",
  RANK_CARDS: "pro",
  CONFESSIONS: "pro",
  AI_CHAT: "pro",
  EVENTS: "pro",
  MATCHES: "pro",
  STICKY_MESSAGES: "pro",
  WEEKLY_RECAP: "pro",
  GROWTH_ANALYTICS: "pro",
  SUGGESTION_ANALYTICS: "pro",
  MEMBER_MILESTONES: "pro",
  STREAM_EXTRAS: "kit",
  STREAM_GROWTH: "kit",
  PRE_STREAM: "kit",
};

// Dashboard pages that need a plan but have no module switch of their own.
// Paths are relative to /dashboard/:guildId, and a page's sub-pages count too.
export const PAGE_TIER: Record<string, PlanTier> = {
  "/partnerships": "pro",
  "/overlays": "kit",
  "/chat-commands": "kit",
  "/stream-deck": "deck",
};

// Stream Deck keys that drive a Pro or Streamer Kit feature need that plan
// too (on top of the Stream Deck plan for the plugin itself).
export const SD_ACTION_TIER: Record<string, PlanTier> = {
  money: "kit", kd: "kit", ovgame: "kit", chatcmd: "kit", ovmsg: "kit", ovwl: "kit", ovtimer: "kit",
  ovgoal: "kit", ovchal: "kit", ovshow: "kit", clipit: "kit", tool: "kit", dmoney: "kit", dkd: "kit",
  apps: "pro", event: "pro", sticky: "pro", dxp: "pro", dmm: "pro",
};

/** The plan a dashboard page needs, from its path under /dashboard/:guildId, or null if it's free. */
export function tierForPath(path: string, moduleKeyForHref?: (href: string) => ModuleKey | undefined): PlanTier | null {
  for (const [href, tier] of Object.entries(PAGE_TIER)) if (path === href || path.startsWith(href + "/")) return tier;
  if (moduleKeyForHref) {
    const href = "/" + (path.split("/")[1] ?? "");
    const key = moduleKeyForHref(href);
    if (key && MODULE_TIER[key]) return MODULE_TIER[key]!;
  }
  return null;
}

/** Every plan the given store products unlock, together. */
export function tiersForProducts(productIds: readonly string[]): PlanTier[] {
  const out = new Set<PlanTier>();
  for (const id of productIds) for (const t of PRODUCT_TIERS[id] ?? []) out.add(t);
  return PLAN_TIERS.filter((t) => out.has(t));
}

/** What the dashboard gets for a server. `enforced: false` means plans aren't switched on yet: everything is open. */
export interface GuildPlanState {
  enforced: boolean;
  tiers: PlanTier[];
  /** "owner" = the bot owner's own server (always everything), "gift" = given free by the owner. */
  reason?: "owner" | "gift" | "paid";
  storeUrl: string | null;
}

/** One purchase from the store that unlocks something, and the server it's on (if picked). */
export interface PlanPurchase {
  entitlementId: string;
  productId: string;
  productName: string;
  tiers: PlanTier[];
  interval: "month" | "year" | null;
  status: string;
  periodEnd: string | null;
  guildId: string | null;
  guildName: string | null;
}
