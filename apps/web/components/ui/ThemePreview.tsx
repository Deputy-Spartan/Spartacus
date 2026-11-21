"use client";

import type { DashboardTheme } from "../../lib/api";

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

export function ThemePreview({ id, small }: { id: DashboardTheme; small?: boolean }) {
  const p = PREVIEW[id as keyof typeof PREVIEW] ?? PREVIEW.studio;
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
