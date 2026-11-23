// Streaming › Overlays: every overlay can be shown or hidden on stream (from
// its page, the Overlays list, or a Stream Deck key). Kept in one
// StreamDeckState row: { [overlayId]: false } for the hidden ones.
import { OVERLAYS, OVERLAY_KINDS } from "./overlays";
import { TOOLS, TOOL_KINDS } from "./tools";

export const OVERLAY_VISIBILITY_KEY = "overlay-visibility";

// Every overlay: [id, name]. The id is the end of its dashboard address.
export const ALL_OVERLAYS: Array<[string, string]> = [
  ["socials", "🏷️ Socials"],
  ["money", "💰 Money Counter"],
  ["kd", "🎯 K/D Counter"],
  ...OVERLAY_KINDS.map((k) => [k, `${OVERLAYS[k].icon} ${OVERLAYS[k].title}`] as [string, string]),
  ...TOOL_KINDS.map((k) => [k, `${TOOLS[k].icon} ${TOOLS[k].title}`] as [string, string]),
];
export const isOverlayId = (id: unknown): id is string => ALL_OVERLAYS.some(([k]) => k === id);

export type OverlayVisibility = Record<string, boolean>;
export function cleanVisibility(raw: unknown): OverlayVisibility {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: OverlayVisibility = {};
  for (const [id] of ALL_OVERLAYS) if (r[id] === false) out[id] = false;
  return out;
}
export const isShown = (vis: OverlayVisibility, id: string) => vis[id] !== false;
