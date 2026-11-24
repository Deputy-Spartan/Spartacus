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

// ---------------------------------------------------------------------------
// Single features. Each paid feature can also be bought on its own, unlocking
// just that one thing on one server. A feature id is:
//   m:<MODULE_KEY>   a paid module (the Economy Hub's tabs go with m:ECONOMY)
//   p:partnerships   Server Partnerships (no module switch)
//   o:<kind>         one overlay: money, kd, socials, or an OVERLAY_KINDS box
//   t:<kind>         one stream tool (TOOL_KINDS)
//   cc               Chat Commands (the Kick/Twitch chat bot)
// A plan covers every feature in it; a single covers only itself.
// ---------------------------------------------------------------------------
const ECONOMY_TABS: readonly ModuleKey[] = ["LEVELING", "PRESTIGE", "VOICE_ACTIVITY", "ACHIEVEMENTS", "PROFILE_CARDS", "RANK_CARDS"];
export const moduleFeature = (key: ModuleKey) => `m:${ECONOMY_TABS.includes(key) ? "ECONOMY" : key}`;

const COUNTER_KINDS = ["money", "kd", "socials", "game", "message", "winloss", "timer", "goal", "challenge", "discord", "ticker"] as const;
const TOOL_IDS = ["chat", "stats", "clip", "cmds", "qr", "squad", "poll", "wheel", "dice", "predict", "welcome", "cmdfx"] as const;

/** Every single item for sale: [store product id, feature, the plan that also includes it, name]. */
export const SINGLE_ITEMS: ReadonlyArray<{ product: string; feature: string; tier: PlanTier; name: string }> = [
  ...([
    ["anti-raid", "ANTI_RAID", "Anti-Raid"], ["anti-nuke", "ANTI_NUKE", "Anti-Nuke"], ["ai-moderation", "AI_MODERATION", "AI Moderation"],
    ["perm-watch", "PERM_WATCH", "Perm Watch"], ["honeypot", "HONEYPOT", "Honeypot"], ["server-backup", "SERVER_BACKUP", "Server Backup"],
    ["warn-escalation", "WARN_ESCALATION", "Warn Escalation"], ["ban-appeals", "BAN_APPEALS", "Ban Appeals"], ["weekly-staff-report", "MOD_DIGEST", "Weekly Staff Report"],
    ["applications", "APPLICATIONS", "Applications"], ["support-dm", "SUPPORT_INTAKE", "Support DM"], ["server-config-templates", "SERVER_TEMPLATES", "Server Config Templates"],
    ["economy-hub", "ECONOMY", "Economy Hub"], ["ai-chat", "AI_CHAT", "AI Chat"], ["event-scheduler", "EVENTS", "Event Scheduler"],
    ["matchmaking", "MATCHES", "Matchmaking"], ["anonymous-posts", "CONFESSIONS", "Anonymous Posts"], ["sticky-messages", "STICKY_MESSAGES", "Sticky Messages"],
    ["weekly-recap", "WEEKLY_RECAP", "Weekly Recap"], ["growth-analytics", "GROWTH_ANALYTICS", "Growth Analytics"], ["suggestion-analytics", "SUGGESTION_ANALYTICS", "Suggestion Analytics"],
    ["member-milestones", "MEMBER_MILESTONES", "Member Milestones"],
  ] as const).map(([product, key, name]) => ({ product, feature: `m:${key}`, tier: "pro" as const, name })),
  { product: "server-partnerships", feature: "p:partnerships", tier: "pro", name: "Server Partnerships" },
  ...([
    ["stream-extras", "STREAM_EXTRAS", "Stream Extras"], ["stream-growth", "STREAM_GROWTH", "Stream Growth"], ["pre-stream-checklist", "PRE_STREAM", "Pre-Stream Checklist"],
  ] as const).map(([product, key, name]) => ({ product, feature: `m:${key}`, tier: "kit" as const, name })),
  { product: "chat-commands", feature: "cc", tier: "kit", name: "Chat Commands" },
  ...([
    ["money-counter", "money", "Money Counter"], ["kd-counter", "kd", "K/D Counter"], ["socials-overlay", "socials", "Socials Overlay"],
    ["game-overlay", "game", "Game Box"], ["message-box", "message", "Message Box"], ["win-loss-counter", "winloss", "Win/Loss Counter"],
    ["timer-overlay", "timer", "Stream Timer"], ["goal-bar", "goal", "Goal Bar"], ["challenge-counter", "challenge", "Challenge Counter"],
    ["discord-box", "discord", "Discord Box"], ["event-ticker", "ticker", "Follower Ticker"],
  ] as const).map(([product, kind, name]) => ({ product, feature: `o:${kind}`, tier: "kit" as const, name })),
  ...([
    ["chat-box", "chat", "Chat Box"], ["stats-bar", "stats", "Stats Bar"], ["clip-marker", "clip", "Clip Marker"], ["command-tips", "cmds", "Command Tips"],
    ["qr-code", "qr", "QR Code"], ["squad-box", "squad", "Squad Box"], ["stream-poll", "poll", "Stream Poll"], ["spin-wheel", "wheel", "Spin Wheel"],
    ["dice-and-coin", "dice", "Dice & Coin"], ["predictions", "predict", "Predictions"], ["first-time-welcome", "welcome", "First-Time Welcome"], ["command-alerts", "cmdfx", "Command Alerts"],
  ] as const).map(([product, kind, name]) => ({ product, feature: `t:${kind}`, tier: "kit" as const, name })),
];
const SINGLE_BY_PRODUCT = new Map(SINGLE_ITEMS.map((s) => [s.product, s]));
const TIER_OF_FEATURE = new Map(SINGLE_ITEMS.map((s) => [s.feature, s.tier]));

/** What store products unlock in Spartacus: whole plans plus single features, as one list (stored on GuildPlan.tiers). */
export function unlocksForProducts(productIds: readonly string[]): string[] {
  const out = new Set<string>(tiersForProducts(productIds));
  for (const id of productIds) {
    const s = SINGLE_BY_PRODUCT.get(id);
    if (s) out.add(s.feature);
  }
  return [...out];
}

/** Does a list of unlocks (plans + single features) cover this feature? */
export function covers(unlocks: readonly string[], feature: string | null, tier: PlanTier | null): boolean {
  if (!tier) return true;
  if (unlocks.includes(tier)) return true;
  if (!feature) return false;
  if (feature === "o:*") return unlocks.some((u) => u.startsWith("o:") || u.startsWith("t:"));
  if (feature === "t:*") return unlocks.some((u) => u.startsWith("t:"));
  return unlocks.includes(feature);
}

/** The single feature (and its plan) a dashboard page belongs to, or null if it's free. */
export function featureForPath(path: string, moduleKeyForHref?: (href: string) => ModuleKey | undefined): { feature: string | null; tier: PlanTier } | null {
  const ov = /^\/overlays\/([\w-]+)/.exec(path);
  if (ov) {
    const k = ov[1];
    if ((TOOL_IDS as readonly string[]).includes(k)) return { feature: `t:${k}`, tier: "kit" };
    if ((COUNTER_KINDS as readonly string[]).includes(k)) return { feature: `o:${k}`, tier: "kit" };
    return { feature: "o:*", tier: "kit" };
  }
  if (path === "/overlays") return { feature: "o:*", tier: "kit" };
  if (path === "/chat-commands" || path.startsWith("/chat-commands/")) return { feature: "cc", tier: "kit" };
  if (path === "/partnerships" || path.startsWith("/partnerships/")) return { feature: "p:partnerships", tier: "pro" };
  const tier = tierForPath(path, moduleKeyForHref);
  if (!tier) return null;
  const key = moduleKeyForHref?.("/" + (path.split("/")[1] ?? ""));
  return { feature: key ? moduleFeature(key) : null, tier };
}

/** The feature a Stream Deck key drives (besides needing the Stream Deck plan). */
export const SD_ACTION_FEATURE: Record<string, string> = {
  money: "o:money", dmoney: "o:money", kd: "o:kd", dkd: "o:kd", ovgame: "o:game", ovmsg: "o:message", ovwl: "o:winloss", ovtimer: "o:timer",
  ovgoal: "o:goal", ovchal: "o:challenge", ovshow: "o:*", clipit: "t:clip", tool: "t:*", chatcmd: "cc",
  apps: "m:APPLICATIONS", event: "m:EVENTS", sticky: "m:STICKY_MESSAGES", dxp: "m:ECONOMY", dmm: "m:MATCHES",
};

export const featureTier = (feature: string): PlanTier | null => TIER_OF_FEATURE.get(feature) ?? null;

/** What the dashboard gets for a server. `enforced: false` means plans aren't switched on yet: everything is open. */
export interface GuildPlanState {
  enforced: boolean;
  tiers: PlanTier[];
  /** Single features bought on their own (see SINGLE_ITEMS). */
  features: string[];
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
  /** Single features (when the purchase is one item, not a plan). */
  features: string[];
  interval: "month" | "year" | null;
  status: string;
  periodEnd: string | null;
  guildId: string | null;
  guildName: string | null;
}
