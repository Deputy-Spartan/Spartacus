"use client";

import { useEffect, useReducer } from "react";
import type { GuildPlanState, PlanTier } from "@spartacus/shared";
import { api } from "./api";

// Which paid plans this server has (Outpost Gaming store). One copy per
// server, shared by the sidebar 🔒s, the page lock and the Plans page, so
// putting a plan on a server unlocks everything at once.
const cache = new Map<string, GuildPlanState>();
const listeners = new Set<() => void>();
const loading = new Set<string>();

export function refreshGuildPlan(guildId: string) {
  if (loading.has(guildId)) return;
  loading.add(guildId);
  api
    .getGuildPlan(guildId)
    .then((s) => {
      cache.set(guildId, s);
      listeners.forEach((f) => f());
    })
    .catch(() => null)
    .finally(() => loading.delete(guildId));
}

export function useGuildPlan(guildId: string): GuildPlanState | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    if (!cache.has(guildId)) refreshGuildPlan(guildId);
    return () => {
      listeners.delete(bump);
    };
  }, [guildId]);
  return cache.get(guildId) ?? null;
}

/**
 * Is this plan missing here? Before paid plans are switched on, nothing is
 * locked except the Stream Deck, which stays the bot owner's until then.
 */
export function isLocked(state: GuildPlanState | null, tier: PlanTier | null, isOwner = false): boolean {
  if (!tier || !state) return false;
  if (!state.enforced) return tier === "deck" && !isOwner;
  return !state.tiers.includes(tier);
}
