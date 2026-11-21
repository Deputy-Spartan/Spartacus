"use client";

import type { DashboardTheme } from "../../lib/api";
import { THEMES, type ThemeInfo } from "../../lib/userPrefs";

// A small picture of each theme, drawn with the theme's own look.
const PREVIEW: Record<"studio" | "glass" | "daylight" | "steel" | "midnight" | "dusk", { bg: string; side: string; card: React.CSSProperties }> = {
  studio: { bg: "#1c1d20", side: "#242529", card: { background: "linear-gradient(90deg,#5e7fa6,#7b99bc,#94a3b8) top/100% 3px no-repeat, #2a2c31", border: "1px solid #37393f" } },
  glass: {
    bg: "radial-gradient(120px 80px at 15% 10%, rgba(123,153,188,.45), transparent 70%), radial-gradient(120px 90px at 100% 100%, rgba(94,127,166,.5), transparent 70%), #1c1d20",
    side: "rgba(255,255,255,.08)",
    card: { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)" },
  },
  daylight: { bg: "#b9c2cd", side: "#c8d0d9", card: { background: "#d0d7df", border: "1px solid rgba(25,40,60,.16)", boxShadow: "0 2px 6px rgba(25,40,60,.12)" } },
  steel: { bg: "#0b0c0e", side: "#121316", card: { background: "#15171a", border: "1px solid #262930", boxShadow: "0 0 10px rgba(74,149,255,.25)" } },
  midnight: { bg: "#000000", side: "#07080c", card: { background: "#0b0d13", border: "1px solid #1a1e2a", boxShadow: "0 0 10px rgba(79,209,255,.22)" } },
  dusk: { bg: "#1d1a24", side: "#24202d", card: { background: "#2a2534", border: "1px solid #3b3448", boxShadow: "0 0 10px rgba(185,162,255,.2)" } },
};
// Forged themes: drawn from their own colors (metal edge, glow line on top).
function forgedPreview(c: NonNullable<ThemeInfo["colors"]>) {
  const [, , , page, raised, hi, mid, lo, top, bot, accent] = c;
  return {
    bg: `radial-gradient(140px 70px at 80% 0%, ${accent}40, transparent 70%), ${page}`,
    side: `linear-gradient(180deg, ${raised}, ${page})`,
    card: {
      border: "1px solid transparent",
      background: `linear-gradient(90deg, transparent, ${accent}, transparent) center top / 80% 2px no-repeat padding-box, linear-gradient(180deg, ${top}, ${bot}) padding-box, linear-gradient(160deg, ${hi}, ${mid} 35%, ${lo} 75%, ${mid}) border-box`,
      boxShadow: `0 0 10px ${accent}33`,
    } as React.CSSProperties,
  };
}

// Sleek is flat (no metal edge or glow line), so it gets its own picture.
const SLEEK = {
  bg: "radial-gradient(140px 70px at 80% 0%, #5b8cff22, transparent 70%), #0a0a0c",
  side: "#111114",
  card: { background: "linear-gradient(180deg,#17171b,#121215)", border: "1px solid rgba(255,255,255,.09)" } as React.CSSProperties,
};

export function ThemePreview({ id, small }: { id: DashboardTheme; small?: boolean }) {
  const info = THEMES.find((t) => t.id === id);
  const p = id === "sleek" ? SLEEK : info?.colors ? forgedPreview(info.colors) : PREVIEW[id as keyof typeof PREVIEW] ?? PREVIEW.studio;
  const card = { ...p.card, borderRadius: 8 };
  return (
    <div className={`${small ? "h-14 p-1.5 gap-1" : "h-20 p-2 gap-1.5"} rounded-lg overflow-hidden flex`} style={{ background: p.bg }} aria-hidden="true">
      <div className={`${small ? "w-4" : "w-6"} rounded`} style={{ background: p.side }} />
      <div className={`flex-1 grid grid-cols-2 ${small ? "gap-1" : "gap-1.5"}`}>
        <div style={card} />
        <div style={card} />
        <div style={card} className="col-span-2" />
      </div>
    </div>
  );
}
