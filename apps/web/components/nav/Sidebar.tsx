"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBotAvatar } from "../../lib/useBotAvatar";
import { api, type ModuleState } from "../../lib/api";
import { usePinnedModules } from "../../lib/usePinnedModules";

// Maps each nav item's href to the ModuleKey that gates it, so the sidebar
// can show a live enabled/disabled dot next to every module. A handful of
// pages (Overview, Modules, Owner-only settings, Server Partnerships) have
// no on/off toggle of their own and are left out — no entry, no dot.
export const NAV_MODULE_KEYS: Record<string, string> = {
  "/moderation": "MODERATION",
  "/cases": "MODERATION",
  "/reports": "PLAYER_REPORTS",
  "/mod-digest": "MOD_DIGEST",
  "/warn-escalation": "WARN_ESCALATION",
  "/appeals": "BAN_APPEALS",
  "/ai-moderation": "AI_MODERATION",
  "/anti-raid": "ANTI_RAID",
  "/anti-nuke": "ANTI_NUKE",
  "/server-backup": "SERVER_BACKUP",
  "/verification": "VERIFICATION",
  "/rules-gate": "RULES_GATE",
  "/honeypot": "HONEYPOT",
  "/perm-watch": "PERM_WATCH",
  "/welcome": "WELCOME",
  "/reaction-roles": "REACTION_ROLES",
  "/sticky-messages": "STICKY_MESSAGES",
  "/starboard": "STARBOARD",
  "/temp-channels": "TEMP_CHANNELS",
  "/ai-chat": "AI_CHAT",
  "/birthdays": "BIRTHDAYS",
  "/member-milestones": "MEMBER_MILESTONES",
  "/confessions": "CONFESSIONS",
  "/events": "EVENTS",
  "/lfg": "LFG",
  "/embed-creator": "EMBED_CREATOR",
  "/announcements": "ANNOUNCEMENTS",
  "/giveaways": "GIVEAWAYS",
  "/stream-alerts": "STREAM_ALERTS",
  "/commands": "CUSTOM_COMMANDS",
  "/weekly-recap": "WEEKLY_RECAP",
  "/bump-reminder": "BUMP_REMINDER",
  "/suggestion-analytics": "SUGGESTION_ANALYTICS",
  "/leveling": "LEVELING",
  "/level-roles": "LEVELING",
  "/prestige": "PRESTIGE",
  "/voice-activity": "VOICE_ACTIVITY",
  "/achievements": "ACHIEVEMENTS",
  "/growth-analytics": "GROWTH_ANALYTICS",
  "/economy/settings": "ECONOMY",
  "/economy/earning": "ECONOMY",
  "/economy/leaderboard": "ECONOMY",
  "/economy/analytics": "ECONOMY",
  "/counting-game": "COUNTING_GAME",
  "/tickets": "TICKETS",
  "/applications": "APPLICATIONS",
  "/channel-locks": "CHANNEL_LOCKS",
  "/slow-mode": "SLOW_MODE",
  "/stat-channels": "STAT_CHANNELS",
  "/status-channel": "STATUS_CHANNEL",
  "/server-templates": "SERVER_TEMPLATES",
};

// Reverse of NAV_MODULE_KEYS — first href that gates a given ModuleKey wins,
// for anywhere that only has the key (e.g. Overview's Enabled Modules list)
// and needs somewhere to link a module to.
export const MODULE_KEY_TO_HREF: Record<string, string> = {};
for (const [href, key] of Object.entries(NAV_MODULE_KEYS)) {
  if (!(key in MODULE_KEY_TO_HREF)) MODULE_KEY_TO_HREF[key] = href;
}

export const NAV_SECTIONS = [
  {
    section: null,
    items: [
      { href: "", label: "Overview", icon: "📊" },
      { href: "/modules", label: "Modules", icon: "🧩" },
      { href: "/errors", label: "Errors", icon: "⚠️" },
    ],
  },
  {
    section: "Moderation",
    items: [
      { href: "/moderation", label: "Moderator", icon: "🛡️" },
      { href: "/cases", label: "Cases & Warnings", icon: "📁" },
      { href: "/reports", label: "Player Reports", icon: "🚩" },
      { href: "/mod-digest", label: "Mod Digest", icon: "📋" },
      { href: "/warn-escalation", label: "Warn Escalation", icon: "📈" },
      { href: "/appeals", label: "Appeals", icon: "🙏" },
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
      { href: "/rules-gate", label: "Rules Gate", icon: "📜" },
      { href: "/honeypot", label: "Honeypot", icon: "🍯" },
      { href: "/perm-watch", label: "Perm Watch", icon: "🔍" },
    ],
  },
  {
    section: "Community",
    items: [
      { href: "/welcome", label: "Welcome", icon: "👋" },
      { href: "/reaction-roles", label: "Reaction Roles", icon: "🎭" },
      { href: "/sticky-messages", label: "Sticky Messages", icon: "📌" },
      { href: "/starboard", label: "Starboard", icon: "⭐" },
      { href: "/temp-channels", label: "Temp Channels", icon: "🔊" },
      { href: "/ai-chat", label: "AI Chat", icon: "💡" },
      { href: "/birthdays", label: "Birthdays", icon: "🎂" },
      { href: "/member-milestones", label: "Member Milestones", icon: "🏅" },
      { href: "/confessions", label: "Anonymous", icon: "🤫" },
      { href: "/events", label: "Event Scheduler", icon: "⚔️" },
      { href: "/lfg", label: "LFG", icon: "🔊" },
    ],
  },
  {
    section: "Engagement",
    items: [
      { href: "/embed-creator", label: "Embed Creator", icon: "🧩" },
      { href: "/announcements", label: "Announcements", icon: "📢" },
      { href: "/giveaways", label: "Giveaways", icon: "🎁" },
      { href: "/stream-alerts", label: "Stream Alerts", icon: "🔴" },
      { href: "/commands", label: "Custom Commands", icon: "💬" },
      { href: "/weekly-recap", label: "Weekly Recap", icon: "📊" },
      { href: "/bump-reminder", label: "Bump Reminder", icon: "⏰" },
      { href: "/suggestion-analytics", label: "Suggestion Analytics", icon: "💡" },
      { href: "/partnerships", label: "Server Partnerships", icon: "🤝" },
    ],
  },
  {
    section: "Levelling & Economy",
    items: [
      { href: "/leveling", label: "Leaderboard", icon: "📈" },
      { href: "/level-roles", label: "Level Roles", icon: "🏅" },
      { href: "/prestige", label: "Prestige", icon: "⭐" },
      { href: "/voice-activity", label: "Voice Activity", icon: "🎙️" },
      { href: "/achievements", label: "Achievements", icon: "🏆" },
      { href: "/growth-analytics", label: "Growth Analytics", icon: "📉" },
      { href: "/economy/settings", label: "Economy Settings", icon: "⚙️" },
      { href: "/economy/earning", label: "Economy Earning", icon: "📈" },
      { href: "/economy/leaderboard", label: "Economy Leaderboard", icon: "🏅" },
      { href: "/economy/analytics", label: "Economy Analytics", icon: "📊" },
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
    section: "Utility",
    items: [
      { href: "/channel-locks", label: "Channel Locks", icon: "🔒" },
      { href: "/slow-mode", label: "Slow Mode", icon: "🐢" },
      { href: "/stat-channels", label: "Server Stat Channels", icon: "📈" },
      { href: "/status-channel", label: "Status Channel", icon: "🟢" },
      { href: "/server-templates", label: "Server Config Templates", icon: "📋" },
    ],
  },
];

const OWNER_NAV_SECTION = {
  section: "Owner Only",
  items: [
    { href: "/bot-customization", label: "Bot Customization", icon: "🤖" },
    { href: "/owner-panel", label: "Access Control", icon: "🔑" },
    { href: "/whats-new", label: "What's New", icon: "🔔" },
  ],
};

export function Sidebar({
  guildId,
  open,
  onClose,
  isOwner,
}: {
  guildId: string;
  open: boolean;
  onClose: () => void;
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const avatarUrl = useBotAvatar();
  const [modules, setModules] = useState<Record<string, ModuleState> | null>(null);
  const { isPinned, togglePin } = usePinnedModules(guildId);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.getModules(guildId).then((m) => {
        if (!cancelled) setModules(m);
      });
    }
    load();
    // Toggling a module elsewhere on the page doesn't re-render the sidebar
    // on its own — a light poll keeps the dots honest without wiring up a
    // dedicated event for every page that has an enable/disable switch.
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [guildId]);

  const baseSections = useMemo(
    () => (isOwner ? [...NAV_SECTIONS, OWNER_NAV_SECTION] : NAV_SECTIONS),
    [isOwner]
  );

  // Every pinnable item, in one flat list, so the Pinned group below can
  // look up an item's label/icon regardless of which category it lives in.
  const allItems = useMemo(() => baseSections.flatMap((s) => s.items), [baseSections]);

  const pinnedItems = useMemo(() => allItems.filter((item) => isPinned(item.href)), [allItems, isPinned]);

  // Not searching: categories collapse to one row each (icon + name), linking
  // to that category's own card grid — browsing a category's individual
  // pages happens there, not by expanding a list in the sidebar itself.
  // Owner Only is small (owner-exclusive tools, not real "modules") and
  // stays a regular expandable section instead of folding into that grid.
  const categoryRows = useMemo(
    () =>
      baseSections
        .slice(1)
        .filter((s) => s.section !== "Owner Only")
        .map((s) => ({
          href: `/modules?section=${encodeURIComponent(s.section as string)}`,
          label: s.section as string,
          icon: s.items[0]?.icon ?? "🧩",
        })),
    [baseSections]
  );
  const ownerSection = useMemo(() => baseSections.find((s) => s.section === "Owner Only"), [baseSections]);

  const browseSections = useMemo(() => {
    const sections: Array<{ section: string | null; items: typeof allItems }> = [baseSections[0]];
    if (pinnedItems.length > 0) sections.push({ section: "Pinned", items: pinnedItems });
    sections.push({ section: "Categories", items: categoryRows });
    if (ownerSection) sections.push(ownerSection);
    return sections;
  }, [baseSections, pinnedItems, categoryRows, ownerSection]);

  // Searching needs real pages to match against, not category names — swap
  // in the full per-page list (pinned items excluded from their category,
  // same as the unfiltered view) only while there's a query.
  const searchSections = useMemo(() => {
    const rest = baseSections
      .slice(1)
      .map((s) => ({ ...s, items: s.items.filter((item) => !isPinned(item.href)) }))
      .filter((s) => s.items.length > 0);
    return [baseSections[0], ...(pinnedItems.length > 0 ? [{ section: "Pinned", items: pinnedItems }] : []), ...rest];
  }, [baseSections, pinnedItems, isPinned]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return browseSections;
    return searchSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((section) => section.items.length > 0);
  }, [query, browseSections, searchSections]);

  const searching = query.trim().length > 0;
  const sectionKeys = useMemo(() => browseSections.filter((s) => s.section).map((s) => s.section as string), [browseSections]);
  const allCollapsed = sectionKeys.length > 0 && sectionKeys.every((k) => collapsed[k]);

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAllSections() {
    setCollapsed(allCollapsed ? {} : Object.fromEntries(sectionKeys.map((k) => [k, true])));
  }

  // Picking a page closes the drawer on mobile (it's covering the content
  // you just asked for) but leaves it open on desktop, where it's pushed
  // beside the content rather than over it — only mobile should auto-close.
  function onNavigate() {
    if (window.innerWidth < 768) onClose();
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={[
          "fixed left-0 top-0 h-screen w-64 sm:w-60 bg-base-900 border-r border-white/5 flex flex-col overflow-y-auto z-40",
          "transition-transform duration-200",
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
        <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-200 text-xl" aria-label="Hide sidebar" title="Hide sidebar">
          ✕
        </button>
      </div>

      <div className="px-3 pb-3 shrink-0">
        <div className="relative mb-2">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            className="w-full bg-base-950 border border-white/10 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50"
          />
        </div>
        {!searching && (
          <button
            onClick={toggleAllSections}
            className="w-full text-[10px] font-semibold uppercase tracking-widest text-slate-600 hover:text-slate-400 border border-white/10 rounded-lg py-1.5 transition-colors"
          >
            {allCollapsed ? "Expand All" : "Collapse All"}
          </button>
        )}
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
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-widest group-hover:text-slate-400 ${
                      section.section === "Owner Only" ? "text-purple-400" : "text-slate-600"
                    }`}
                  >
                    {section.section}
                  </span>
                  <span className={`text-slate-600 text-[10px] transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▼</span>
                </button>
              )}
              {!isCollapsed && (
                <div className="space-y-1">
                  {section.section === "Categories"
                    ? section.items.map((cat) => {
                        const rawHref = cat.href as string;
                        const href = `/dashboard/${guildId}${rawHref}`;
                        // Both the plain path and its filtered ?section= variant count as "on this category".
                        const active = pathname + (typeof window !== "undefined" ? window.location.search : "") === href || pathname === href.split("?")[0];
                        return (
                          <Link
                            key={rawHref}
                            href={href}
                            onClick={onNavigate}
                            className={[
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              active
                                ? "bg-base-800 text-neon-blue shadow-glow-blue"
                                : (cat as { owner?: boolean }).owner
                                  ? "text-purple-300 hover:text-purple-100 hover:bg-base-800/60"
                                  : "text-slate-400 hover:text-slate-100 hover:bg-base-800/60",
                            ].join(" ")}
                          >
                            <span>{cat.icon}</span>
                            <span className="flex-1 min-w-0 truncate">{cat.label}</span>
                          </Link>
                        );
                      })
                    : section.items.map((item) => {
                    const href = `/dashboard/${guildId}${item.href}`;
                    const active = pathname === href;
                    const moduleKey = NAV_MODULE_KEYS[item.href];
                    const enabled = moduleKey ? (modules?.[moduleKey]?.enabled ?? false) : null;
                    const pinned = isPinned(item.href);
                    return (
                      <div
                        key={`${section.section ?? "top"}:${item.href}`}
                        className={[
                          "group flex items-center gap-1 rounded-lg pr-1.5 text-sm transition-colors",
                          active
                            ? "bg-base-800 text-neon-blue shadow-glow-blue"
                            : section.section === "Owner Only"
                              ? "text-purple-300 hover:text-purple-100 hover:bg-base-800/60"
                              : "text-slate-400 hover:text-slate-100 hover:bg-base-800/60",
                        ].join(" ")}
                      >
                        <Link href={href} onClick={onNavigate} className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2">
                          <span>{item.icon}</span>
                          <span className="flex-1 min-w-0 truncate">{item.label}</span>
                          {enabled !== null && (
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${enabled ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]" : "bg-rose-500"}`}
                              title={enabled ? "Enabled" : "Disabled"}
                            />
                          )}
                        </Link>
                        <button
                          onClick={() => togglePin(item.href)}
                          title={pinned ? "Unpin" : "Pin to top"}
                          className={[
                            "shrink-0 w-6 h-6 flex items-center justify-center rounded transition-opacity text-xs",
                            pinned ? "opacity-100 text-neon-blue" : "opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-300",
                          ].join(" ")}
                        >
                          📌
                        </button>
                      </div>
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
