"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Streaming › Overlays: the three overlays. The hub page shows them as cards,
// and each overlay's page has them as tabs along the top.
export const OVERLAYS = [
  { href: "/overlays/socials", label: "Socials", icon: "🏷️", line: "Your platform names as a lower third, and a socials post in Discord." },
  { href: "/overlays/money", label: "Money Counter", icon: "💰", line: "A TOTAL MONEY box you change with a Stream Deck button." },
  { href: "/overlays/kd", label: "K/D Counter", icon: "🎯", line: "Kills, deaths and K/D, with kill streak banners." },
] as const;

export function OverlayTabs({ guildId }: { guildId: string }) {
  const path = usePathname();
  const base = `/dashboard/${guildId}`;
  if (path === `${base}/overlays` || path === `${base}/overlays/`) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-3 [scrollbar-width:none]" role="tablist" aria-label="Overlays">
      <Link href={`${base}/overlays`} className="shrink-0 text-sm px-3 py-1.5 rounded-full border border-white/10 text-slate-400 hover:text-white hover:border-white/30">
        ‹ All
      </Link>
      {OVERLAYS.map((o) => {
        const on = path.startsWith(`${base}${o.href}`);
        return (
          <Link
            key={o.href}
            href={`${base}${o.href}`}
            role="tab"
            aria-selected={on}
            aria-pressed={on}
            className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors ${on ? "border-neon-blue bg-neon-blue/15 text-white font-semibold" : "border-white/10 text-slate-300 hover:border-white/30"}`}
          >
            {o.icon} {o.label}
          </Link>
        );
      })}
    </div>
  );
}
