"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_SECTIONS = [
  {
    section: null,
    items: [
      { href: "", label: "Overview", icon: "📊" },
      { href: "/modules", label: "Modules", icon: "🧩" },
    ],
  },
  {
    section: "Moderation",
    items: [
      { href: "/moderation", label: "Automod", icon: "🛡️" },
      { href: "/cases", label: "Cases & Warnings", icon: "📁" },
      { href: "/reports", label: "Player Reports", icon: "🚩" },
      { href: "/logging", label: "Logging", icon: "📜" },
    ],
  },
  {
    section: "Security",
    items: [
      { href: "/anti-raid", label: "Anti-Raid", icon: "🚨" },
      { href: "/anti-nuke", label: "Anti-Nuke", icon: "💣" },
      { href: "/verification", label: "Verification", icon: "✅" },
      { href: "/honeypot", label: "Honeypot", icon: "🍯" },
      { href: "/perm-watch", label: "Perm Watch", icon: "🔍" },
    ],
  },
  {
    section: "Community",
    items: [
      { href: "/welcome", label: "Welcome", icon: "👋" },
      { href: "/reaction-roles", label: "Reaction Roles", icon: "🎭" },
      { href: "/join-roles", label: "Join Roles", icon: "🎫" },
      { href: "/sticky-messages", label: "Sticky Messages", icon: "📌" },
      { href: "/starboard", label: "Starboard", icon: "⭐" },
      { href: "/temp-channels", label: "Temp Channels", icon: "🔊" },
    ],
  },
  {
    section: "Levelling",
    items: [
      { href: "/leveling", label: "Leaderboard", icon: "📈" },
      { href: "/level-roles", label: "Level Roles", icon: "🏅" },
    ],
  },
  {
    section: "Engagement",
    items: [
      { href: "/giveaways", label: "Giveaways", icon: "🎁" },
      { href: "/stream-alerts", label: "Stream Alerts", icon: "🔴" },
      { href: "/commands", label: "Custom Commands", icon: "💬" },
    ],
  },
  {
    section: "Economy",
    items: [
      { href: "/economy", label: "Economy", icon: "🪙" },
      { href: "/counting-game", label: "Counting Game", icon: "🔢" },
    ],
  },
  {
    section: "Support",
    items: [{ href: "/tickets", label: "Tickets", icon: "🎟️" }],
  },
  {
    section: "Coordination",
    items: [{ href: "/events", label: "Events", icon: "⚔️" }],
  },
  {
    section: "Integrations",
    items: [{ href: "/partnerships", label: "Server Partnerships", icon: "🤝" }],
  },
];

export function Sidebar({ guildId }: { guildId: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-base-900 border-r border-white/5 flex flex-col overflow-y-auto">
      <div className="px-5 py-6 flex items-center gap-2 shrink-0">
        <span className="text-2xl">⚡</span>
        <span className="text-lg font-bold bg-neon-gradient bg-clip-text text-transparent">Spartacus</span>
      </div>

      <nav className="flex-1 px-3 space-y-4 pb-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.section ?? "top"}>
            {section.section && (
              <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">{section.section}</p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const href = `/dashboard/${guildId}${item.href}`;
                const active = pathname === href;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={[
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-base-800 text-neon-blue shadow-glow-blue"
                        : "text-slate-400 hover:text-slate-100 hover:bg-base-800/60",
                    ].join(" ")}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
