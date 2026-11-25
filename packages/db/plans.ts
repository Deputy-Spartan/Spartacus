import { prisma } from "./index";

// Paid plans (Outpost Gaming store) — the one place that decides which plans
// a server has. Bot and API run in the same process, so they share this cache.
//
// Plans are switched on by setting STORE_BRIDGE_SECRET on the API (the same
// value as on the store). Until then nothing is locked, so a deploy can never
// lock anyone out by surprise.
//
// The store owns every purchase. A GuildPlan row remembers which server a
// purchase is on and the store's last word on it (status + periodEnd). Rows
// are re-checked with the store when they are more than CHECK_EVERY old, so a
// cancel, refund or renewal shows up within the hour without asking the store
// on every message.

type Tier = "pro" | "kit" | "deck";
const ALL: Tier[] = ["pro", "kit", "deck"];
const CHECK_EVERY = 60 * 60_000;
const GRACE = 3 * 24 * 60 * 60_000; // a late renewal payment doesn't lock anyone out straight away
const CACHE_MS = 60_000;

export const storeUrl = () => (process.env.STORE_URL || "https://outpostgaming.netlify.app").replace(/\/+$/, "");
export const plansEnforced = () => (process.env.STORE_BRIDGE_SECRET || "").length >= 32;

// The bot tells us who owns each server (it has the Discord cache); the bot
// owner's own servers always have everything.
let ownerOf: (guildId: string) => string | null = () => null;
export function setGuildOwnerLookup(fn: (guildId: string) => string | null) {
  ownerOf = fn;
}
const isBotOwner = (id: string | null | undefined) => !!id && !!process.env.OWNER_DISCORD_ID && id === process.env.OWNER_DISCORD_ID;

export interface StoreEntitlement {
  id: string;
  discordId: string;
  productId: string;
  productName: string;
  planId: string;
  interval: "month" | "year" | null;
  status: string;
  periodEnd: string | null;
}

/** What these Discord accounts bought, straight from the store. Throws if the store can't be reached. */
export async function fetchStoreAccess(discordIds: string[]): Promise<StoreEntitlement[]> {
  const ids = [...new Set(discordIds)].filter(Boolean);
  if (!ids.length || !plansEnforced()) return [];
  const res = await fetch(`${storeUrl()}/api/bridge/access?discordId=${ids.join(",")}`, {
    headers: { authorization: `Bearer ${process.env.STORE_BRIDGE_SECRET}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`The store answered ${res.status}.`);
  const body = (await res.json()) as { entitlements?: StoreEntitlement[] };
  return body.entitlements ?? [];
}

// The store's own Discord server, asked once every 6 hours, so only joins
// there are reported (the store then gives the buyer their customer roles).
let storeGuild: { id: string | null; at: number } | null = null;
async function storeGuildId(): Promise<string | null> {
  if (storeGuild && Date.now() - storeGuild.at < 6 * 60 * 60_000) return storeGuild.id;
  try {
    const res = await fetch(`${storeUrl()}/api/bridge/info`, {
      headers: { authorization: `Bearer ${process.env.STORE_BRIDGE_SECRET}` },
      signal: AbortSignal.timeout(8000),
    });
    const body = res.ok ? ((await res.json()) as { guildId?: string | null }) : null;
    storeGuild = { id: body?.guildId ?? null, at: Date.now() };
  } catch {
    storeGuild = { id: storeGuild?.id ?? null, at: Date.now() - 5 * 60 * 60_000 }; // try again in an hour
  }
  return storeGuild.id;
}

/** Someone joined a server. If it's the store's, the store gives their Subscriber / Customer / Returning Customer roles now. */
export async function notifyStoreJoin(guildId: string, discordId: string): Promise<void> {
  if (!plansEnforced()) return;
  if ((await storeGuildId()) !== guildId) return;
  await fetch(`${storeUrl()}/api/bridge/joined`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.STORE_BRIDGE_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ discordId, guildId }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
}

/** Live on the store: paid up (or within the grace days of a late renewal). */
export function entitlementLive(status: string, periodEnd: Date | string | null): boolean {
  if (status === "active") return true;
  if (status === "past_due" && periodEnd) return new Date(periodEnd).getTime() + GRACE > Date.now();
  return false;
}

const cache = new Map<string, { at: number; tiers: Tier[]; features: string[]; reason: "owner" | "gift" | "paid" | undefined }>();
const refreshing = new Set<string>();

export function forgetGuildPlan(guildId?: string) {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}

/** Brings every GuildPlan row of these buyers in line with the store. */
export async function refreshBuyers(discordIds: string[]): Promise<StoreEntitlement[]> {
  const list = await fetchStoreAccess(discordIds);
  const rows = await prisma.guildPlan.findMany({ where: { ownerDiscordId: { in: discordIds }, NOT: { entitlementId: { startsWith: "gift:" } } } });
  for (const row of rows) {
    const e = list.find((x) => x.id === row.entitlementId);
    await prisma.guildPlan.update({
      where: { id: row.id },
      data: { status: e ? e.status : "ended", periodEnd: e?.periodEnd ? new Date(e.periodEnd) : row.periodEnd, checkedAt: new Date() },
    });
    forgetGuildPlan(row.guildId);
  }
  return list;
}

/** The plans (and single features) a server has right now, and why. */
export async function guildPlanState(guildId: string): Promise<{ tiers: Tier[]; features: string[]; reason?: "owner" | "gift" | "paid" }> {
  if (!plansEnforced()) return { tiers: ALL, features: [] };
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;

  let tiers: Tier[] = [];
  let features: string[] = [];
  let reason: "owner" | "gift" | "paid" | undefined;
  if (isBotOwner(ownerOf(guildId))) {
    tiers = ALL;
    reason = "owner";
  } else {
    const rows = await prisma.guildPlan.findMany({ where: { guildId } }).catch(() => []);
    const got = new Set<Tier>();
    const singles = new Set<string>();
    for (const r of rows) {
      const gift = r.entitlementId.startsWith("gift:");
      if (!gift && !entitlementLive(r.status, r.periodEnd)) continue;
      // GuildPlan.tiers holds whole plans ("pro") and single features ("m:ANTI_RAID", "o:money") together.
      for (const t of r.tiers) (ALL.includes(t as Tier) ? got.add(t as Tier) : singles.add(t));
      reason = gift && reason !== "paid" ? "gift" : "paid";
    }
    tiers = ALL.filter((t) => got.has(t));
    features = [...singles];
    // Out of date? Ask the store in the background; the next check uses the answer.
    const stale = [...new Set(rows.filter((r) => !r.entitlementId.startsWith("gift:") && Date.now() - r.checkedAt.getTime() > CHECK_EVERY).map((r) => r.ownerDiscordId))];
    for (const buyer of stale) {
      if (refreshing.has(buyer)) continue;
      refreshing.add(buyer);
      void refreshBuyers([buyer])
        .catch((e) => console.warn("[plans] store check failed:", e instanceof Error ? e.message : e))
        .finally(() => refreshing.delete(buyer));
    }
  }
  const out = { at: Date.now(), tiers, features, reason };
  cache.set(guildId, out);
  return out;
}

export async function guildHasTier(guildId: string, tier: Tier): Promise<boolean> {
  return (await guildPlanState(guildId)).tiers.includes(tier);
}

/**
 * Has this server got a feature, either through its whole plan (tier) or
 * bought on its own? feature "o:*" = any single overlay or tool, "t:*" = any tool.
 */
export async function guildHasFeature(guildId: string, feature: string | null, tier: Tier | null): Promise<boolean> {
  if (!tier) return true;
  const s = await guildPlanState(guildId);
  if (s.tiers.includes(tier)) return true;
  if (!feature) return false;
  if (feature === "o:*") return s.features.some((f) => f.startsWith("o:") || f.startsWith("t:"));
  if (feature === "t:*") return s.features.some((f) => f.startsWith("t:"));
  return s.features.includes(feature);
}
