"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OVERLAYS as OVERLAY_INFO, OVERLAY_KINDS, TOOLS, TOOL_KINDS } from "@spartacus/shared";

// Streaming › Overlays: every overlay. The hub page shows them as cards in
// three groups; each overlay's page has a small bar to get back to them all,
// jump straight to another one, or step to the one before or after.
export const OVERLAYS: Array<{ href: string; label: string; icon: string; line: string; section: "counters" | "extras" | "tools" }> = [
  { href: "/overlays/socials", label: "Socials", icon: "🏷️", line: "Your platform names as a lower third, and a socials post in Discord.", section: "counters" },
  { href: "/overlays/money", label: "Money Counter", icon: "💰", line: "A TOTAL MONEY box you change with a Stream Deck button.", section: "counters" },
  { href: "/overlays/kd", label: "K/D Counter", icon: "🎯", line: "Kills, deaths and K/D, with kill streak banners.", section: "counters" },
  ...OVERLAY_KINDS.map((k) => ({ href: `/overlays/${k}`, label: OVERLAY_INFO[k].title, icon: OVERLAY_INFO[k].icon, line: OVERLAY_INFO[k].line, section: "counters" as const })),
  ...TOOL_KINDS.map((k) => ({ href: `/overlays/${k}`, label: TOOLS[k].title, icon: TOOLS[k].icon, line: TOOLS[k].line, section: TOOLS[k].section })),
];
export const OVERLAY_SECTIONS: Array<[string, string, "counters" | "extras" | "tools"]> = [
  ["Counters & boxes", "Numbers and boxes you change with buttons or a Stream Deck.", "counters"],
  ["Stream extras", "Chat and stats that fill in from your stream.", "extras"],
  ["Tools", "Handy helpers and fun extras for chat.", "tools"],
];

const step = "shrink-0 w-9 h-9 grid place-items-center rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 aria-disabled:opacity-30 aria-disabled:pointer-events-none";

export function OverlayTabs({ guildId }: { guildId: string }) {
  const path = usePathname();
  const router = useRouter();
  const base = `/dashboard/${guildId}`;
  if (path === `${base}/overlays` || path === `${base}/overlays/`) return null;
  const i = OVERLAYS.findIndex((o) => path.startsWith(`${base}${o.href}`));
  const prev = i > 0 ? OVERLAYS[i - 1] : null;
  const next = i >= 0 && i < OVERLAYS.length - 1 ? OVERLAYS[i + 1] : null;
  return (
    <nav aria-label="Overlays" className="max-w-6xl flex items-center gap-2 mb-4">
      <Link href={`${base}/overlays`} className="shrink-0 h-9 px-3 grid place-items-center rounded-lg border border-white/10 text-sm text-slate-300 hover:text-white hover:border-white/30">
        ‹ All overlays
      </Link>
      <select
        className="min-w-0 flex-1 h-9 bg-base-950 border border-white/10 rounded-lg px-2.5 text-sm"
        value={i >= 0 ? OVERLAYS[i].href : ""}
        onChange={(e) => router.push(`${base}${e.target.value}`)}
        aria-label="Go to another overlay"
      >
        {OVERLAY_SECTIONS.map(([title, , key]) => (
          <optgroup key={key} label={title}>
            {OVERLAYS.filter((o) => o.section === key).map((o) => (
              <option key={o.href} value={o.href}>
                {o.icon} {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Link href={prev ? `${base}${prev.href}` : "#"} aria-disabled={!prev} className={step} aria-label={prev ? `Back to ${prev.label}` : "No overlay before this"} title={prev?.label}>
        ‹
      </Link>
      <Link href={next ? `${base}${next.href}` : "#"} aria-disabled={!next} className={step} aria-label={next ? `On to ${next.label}` : "No overlay after this"} title={next?.label}>
        ›
      </Link>
    </nav>
  );
}
