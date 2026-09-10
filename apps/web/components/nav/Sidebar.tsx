"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBotAvatar } from "../../lib/useBotAvatar";

export const NAV_SECTIONS = [
  {
    section: null,
    items: [
      { href: "", label: "Overview", icon: "📊" },
      { href: "/modules", label: "Modules", icon: "🧩" },
      { href: "/bot-customization", label: "Bot Customization", icon: "🤖" },
      { href: "/errors", label: "Errors", icon: "⚠️" },
    ],
  },
  {
    section: "Moderation",
    items: [
      { href: "/moderation", label: "Moderator", icon: "🛡️" },
      { href: "/cases", label: "Cases & Warnings", icon: "📁" },
      { href: "/reports", label: "Player Reports", icon: "🚩" },
    ],
  },
  {
    section: "Security",
    items: [
      { href: "/ai-moderation", label: "AI Moderation", icon: "🤖" },
      { href: "/anti-raid", label: "Anti-Raid", icon: "🚨" },
      { href: "/anti-nuke", label: "Anti-Nuke", icon: "💣" },
      { href: "/server-backup", label: "Server Backup", icon: "🗄️" },
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
      { href: "/role-panels", label: "Role Panels", icon: "🎚️" },
      { href: "/join-roles", label: "Join Roles", icon: "🎫" },
      { href: "/sticky-messages", label: "Sticky Messages", icon: "📌" },
      { href: "/starboard", label: "Starboard", icon: "⭐" },
      { href: "/temp-channels", label: "Temp Channels", icon: "🔊" },
      { href: "/ai-chat", label: "AI Chat", icon: "💡" },
      { href: "/birthdays", label: "Birthdays", icon: "🎂" },
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
      { href: "/announcements", label: "Announcements", icon: "📢" },
      { href: "/giveaways", label: "Giveaways", icon: "🎁" },
      { href: "/stream-alerts", label: "Stream Alerts", icon: "🔴" },
      { href: "/commands", label: "Custom Commands", icon: "💬" },
    ],
  },
  {
    section: "Economy",
    items: [
      { href: "/economy/settings", label: "Settings", icon: "⚙️" },
      { href: "/economy/earning", label: "Earning", icon: "📈" },
      { href: "/economy/leaderboard", label: "Leaderboard", icon: "🏅" },
      { href: "/economy/analytics", label: "Analytics", icon: "📊" },
      { href: "/counting-game", label: "Counting Game", icon: "🔢" },
    ],
  },
  {
    section: "Support",
    items: [
      { href: "/tickets", label: "Tickets", icon: "🎟️" },
      { href: "/applications", label: "Applications", icon: "📝" },
    ],
  },
  {
    section: "Coordination",
    items: [{ href: "/events", label: "Event Scheduler", icon: "⚔️" }],
  },
  {
    section: "Integrations",
    items: [{ href: "/partnerships", label: "Server Partnerships", icon: "🤝" }],
  },
  {
    section: "Utility",
    items: [
      { href: "/channel-locks", label: "Channel Locks", icon: "🔒" },
      { href: "/slow-mode", label: "Slow Mode", icon: "🐢" },
      { href: "/stat-channels", label: "Server Stat Channels", icon: "📈" },
      { href: "/status-channel", label: "Status Channel", icon: "🟢" },
    ],
  },
];

export function Sidebar({ guildId, open, onClose }: { guildId: string; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const avatarUrl = useBotAvatar();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_SECTIONS;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  const searching = query.trim().length > 0;

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={[
          "fixed left-0 top-0 h-screen w-64 sm:w-60 bg-base-900 border-r border-white/5 flex flex-col overflow-y-auto z-40",
          "transition-transform duration-200 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
      <div className="px-5 py-6 flex items-center gap-3 shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
        ) : (
          <span className="text-3xl">⚡</span>
        )}
        <span className="spartacus-wave inline-block text-2xl font-bold">Spartacus</span>
        <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-200 text-xl md:hidden" aria-label="Close menu">
          ✕
        </button>
      </div>

      <div className="px-3 pb-3 shrink-0">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            className="w-full bg-base-950 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50"
          />
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 pb-6">
        {filtered.map((section) => {
          const key = section.section ?? "top";
          const isCollapsed = !searching && collapsed[key];
          return (
            <div key={key} className="pt-2 first:pt-0">
              {section.section && (
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center justify-between px-3 mb-1 group"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 group-hover:text-slate-400">
                    {section.section}
                  </span>
                  <span className={`text-slate-600 text-[10px] transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▼</span>
                </button>
              )}
              {!isCollapsed && (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const href = `/dashboard/${guildId}${item.href}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={onClose}
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
              )}
            </div>
          );
        })}
        {searching && filtered.length === 0 && (
          <p className="px-3 text-xs text-slate-600">No modules match "{query}".</p>
        )}
      </nav>
      </aside>
    </>
  );
}
