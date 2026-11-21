"use client";

import type { DashboardTheme } from "../../lib/api";
import { THEMES, type ThemeInfo } from "../../lib/userPrefs";

// A small picture of each theme, drawn from its own colors: metal edge and a
// glow line on top, or flat with a thin edge (Capua, Vesuvius). The gold
// block is the button color.
const FLAT = ["capua", "vesuvius"];
function forgedPreview(c: ThemeInfo["colors"]) {
  const [id, , , page, raised, hi, mid, lo, top, bot, accent] = c;
  if (FLAT.includes(id)) {
    return {
      bg: page,
      side: raised,
      card: { background: `linear-gradient(180deg, ${top}, ${bot})`, border: `1px solid ${lo}` } as React.CSSProperties,
    };
  }
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

export function ThemePreview({ id, small }: { id: DashboardTheme; small?: boolean }) {
  const info = THEMES.find((t) => t.id === id) ?? THEMES[THEMES.length - 1];
  const p = forgedPreview(info.colors);
  const card = { ...p.card, borderRadius: 8 };
  const btn = info.colors[11] ?? info.colors[10];
  return (
    <div className={`${small ? "h-14 p-1.5 gap-1" : "h-20 p-2 gap-1.5"} rounded-lg overflow-hidden flex border border-black/10`} style={{ background: p.bg }} aria-hidden="true">
      <div className={`${small ? "w-4" : "w-6"} rounded`} style={{ background: p.side }} />
      <div className={`flex-1 grid grid-cols-2 ${small ? "gap-1" : "gap-1.5"}`}>
        <div style={card} />
        <div style={card} />
        <div style={card} className="col-span-2 flex items-end p-1">
          <span className={`${small ? "h-1.5 w-5" : "h-2 w-8"} rounded-sm`} style={{ background: btn }} />
        </div>
      </div>
    </div>
  );
}
