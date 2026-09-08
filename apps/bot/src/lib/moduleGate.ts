import { prisma } from "./prisma";
import { moduleToggleCache } from "./cache";
import type { ModuleKey } from "@spartacus/shared";

// Central gate every module-owned command/listener/button must pass through
// before doing anything. Cached with a short TTL so we don't hit Postgres
// on every single message/interaction.
export async function isModuleEnabled(guildId: string, key: ModuleKey): Promise<boolean> {
  const cacheKey = `${guildId}:${key}`;
  const cached = moduleToggleCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const row = await prisma.moduleToggle.findUnique({
    where: { guildId_key: { guildId, key } },
  });

  const enabled = row?.enabled ?? false;
  moduleToggleCache.set(cacheKey, enabled);
  return enabled;
}

export function invalidateModuleCache(guildId: string, key: ModuleKey) {
  moduleToggleCache.delete(`${guildId}:${key}`);
}
