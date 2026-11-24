import { prisma } from "./prisma";
import { moduleToggleCache } from "./cache";
import { guildHasTier } from "@spartacus/db";
import { MODULE_TIER, type ModuleKey } from "@spartacus/shared";

// Central gate every module-owned command/listener/button must pass through
// before doing anything. Cached with a short TTL so we don't hit Postgres
// on every single message/interaction.
//
// A module that needs a paid plan (Spartacus Pro, Streamer Kit) only runs on
// a server that has that plan, even if its switch was left on. The switch
// itself is kept, so it comes straight back when the plan does.
export async function isModuleEnabled(guildId: string, key: ModuleKey): Promise<boolean> {
  const cacheKey = `${guildId}:${key}`;
  let enabled = moduleToggleCache.get(cacheKey);
  if (enabled === undefined) {
    const row = await prisma.moduleToggle.findUnique({
      where: { guildId_key: { guildId, key } },
    });
    enabled = row?.enabled ?? false;
    moduleToggleCache.set(cacheKey, enabled);
  }
  if (!enabled) return false;
  const tier = MODULE_TIER[key];
  return tier ? guildHasTier(guildId, tier) : true;
}

export function invalidateModuleCache(guildId: string, key: ModuleKey) {
  moduleToggleCache.delete(`${guildId}:${key}`);
}
