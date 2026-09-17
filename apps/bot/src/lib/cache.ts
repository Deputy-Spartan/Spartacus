import { LRUCache } from "lru-cache";

// Bounded caches shared across modules so nothing in the bot process grows
// unbounded — every cache here has a hard `max` and a `ttl`, which is the
// key discipline for staying under a 512MB host ceiling.

// Short TTL is deliberate: the dashboard (a separate process) has no way to
// push a cache invalidation here when someone flips a module's Enabled
// toggle, so this window is the entire delay between toggling a module and
// it actually taking effect. 2 minutes read as "broken" to anyone testing
// right after flipping a switch — 5s is cheap at this scale and effectively
// immediate to a human.
export const moduleToggleCache = new LRUCache<string, boolean>({
  max: 2000,
  ttl: 1000 * 5,
});

export const xpCooldownCache = new LRUCache<string, number>({
  max: 5000,
  ttl: 1000 * 60, // 1 min — matches the XP-per-message cooldown window
});

export interface CustomCommandEntry {
  response: string;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedColor: string | null;
  buttons: unknown;
  embedExtra: unknown;
  savedEmbedId: string | null;
}

export const customCommandCache = new LRUCache<string, Map<string, CustomCommandEntry>>({
  max: 500, // one entry per guild, capped
  ttl: 1000 * 60 * 5,
});
