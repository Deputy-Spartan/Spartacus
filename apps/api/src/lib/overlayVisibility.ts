import { prisma } from "@spartacus/db";
import { OVERLAY_VISIBILITY_KEY, cleanVisibility, isShown, type OverlayVisibility } from "@spartacus/shared";

// Streaming › Overlays: which overlays are hidden on stream. Every public
// overlay feed adds `hidden`, so OBS fades the overlay out.

export async function loadVisibility(guildId: string): Promise<OverlayVisibility> {
  const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key: OVERLAY_VISIBILITY_KEY } } }).catch(() => null);
  return cleanVisibility(row?.value);
}
export async function setShown(guildId: string, id: string, on: boolean) {
  const vis = await loadVisibility(guildId);
  if (on) delete vis[id];
  else vis[id] = false;
  await prisma.streamDeckState.upsert({
    where: { guildId_key: { guildId, key: OVERLAY_VISIBILITY_KEY } },
    create: { guildId, key: OVERLAY_VISIBILITY_KEY, value: vis },
    update: { value: vis },
  });
  return vis;
}
export const isHidden = async (guildId: string, id: string) => !isShown(await loadVisibility(guildId), id);
