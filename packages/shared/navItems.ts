import type { ModuleKey } from "./moduleKeys";

// The single source of truth for "what pages does the dashboard have, and
// which category is each one in" — the dashboard sidebar and the bot's
// !setup-test-server channel scaffold both build off this exact list, so
// the two can never drift apart the way they did when each kept its own
// hand-written copy. Add a page here once and both pick it up automatically.
export interface NavItem {
  href: string; // relative to /dashboard/:guildId, "" = the Overview page itself
  label: string;
  icon: string;
  moduleKey?: ModuleKey; // omitted for pages with no on/off toggle of their own
}

export interface NavSection {
  section: string | null; // null = the top, ungrouped items (Overview/Modules/Errors)
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
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
      { href: "/moderation", label: "Moderator", icon: "🛡️", moduleKey: "MODERATION" },
      { href: "/cases", label: "Cases & Warnings", icon: "📁", moduleKey: "MODERATION" },
      { href: "/reports", label: "Player Reports", icon: "🚩", moduleKey: "PLAYER_REPORTS" },
      { href: "/mod-digest", label: "Mod Digest", icon: "📋", moduleKey: "MOD_DIGEST" },
      { href: "/warn-escalation", label: "Warn Escalation", icon: "📈", moduleKey: "WARN_ESCALATION" },
      { href: "/appeals", label: "Appeals", icon: "🙏", moduleKey: "BAN_APPEALS" },
    ],
  },
  {
    section: "Security",
    items: [
      { href: "/ai-moderation", label: "AI Moderation", icon: "🤖", moduleKey: "AI_MODERATION" },
      { href: "/anti-raid", label: "Anti-Raid", icon: "🚨", moduleKey: "ANTI_RAID" },
      { href: "/anti-nuke", label: "Anti-Nuke", icon: "💣", moduleKey: "ANTI_NUKE" },
      { href: "/server-backup", label: "Server Backup", icon: "🗄️", moduleKey: "SERVER_BACKUP" },
      { href: "/verification", label: "Verification", icon: "✅", moduleKey: "VERIFICATION" },
      { href: "/rules-gate", label: "Rules Gate", icon: "📜", moduleKey: "RULES_GATE" },
      { href: "/honeypot", label: "Honeypot", icon: "🍯", moduleKey: "HONEYPOT" },
      { href: "/perm-watch", label: "Perm Watch", icon: "🔍", moduleKey: "PERM_WATCH" },
    ],
  },
  {
    section: "Community",
    items: [
      { href: "/welcome", label: "Welcome", icon: "👋", moduleKey: "WELCOME" },
      { href: "/reaction-roles", label: "Reaction Roles", icon: "🎭", moduleKey: "REACTION_ROLES" },
      { href: "/sticky-messages", label: "Sticky Messages", icon: "📌", moduleKey: "STICKY_MESSAGES" },
      { href: "/starboard", label: "Starboard", icon: "⭐", moduleKey: "STARBOARD" },
      { href: "/temp-channels", label: "Temp Channels", icon: "🔊", moduleKey: "TEMP_CHANNELS" },
      { href: "/ai-chat", label: "AI Chat", icon: "💡", moduleKey: "AI_CHAT" },
      { href: "/birthdays", label: "Birthdays", icon: "🎂", moduleKey: "BIRTHDAYS" },
      { href: "/member-milestones", label: "Member Milestones", icon: "🏅", moduleKey: "MEMBER_MILESTONES" },
      { href: "/confessions", label: "Anonymous", icon: "🤫", moduleKey: "CONFESSIONS" },
      { href: "/events", label: "Event Scheduler", icon: "⚔️", moduleKey: "EVENTS" },
      { href: "/lfg", label: "LFG", icon: "🔊", moduleKey: "LFG" },
    ],
  },
  {
    section: "Engagement",
    items: [
      { href: "/embed-creator", label: "Embed Creator", icon: "🧩", moduleKey: "EMBED_CREATOR" },
      { href: "/announcements", label: "Announcements", icon: "📢", moduleKey: "ANNOUNCEMENTS" },
      { href: "/giveaways", label: "Giveaways", icon: "🎁", moduleKey: "GIVEAWAYS" },
      { href: "/polls", label: "Polls", icon: "🗳️", moduleKey: "POLLS" },
      { href: "/stream-alerts", label: "Stream Alerts", icon: "🔴", moduleKey: "STREAM_ALERTS" },
      { href: "/commands", label: "Custom Commands", icon: "💬", moduleKey: "CUSTOM_COMMANDS" },
      { href: "/weekly-recap", label: "Weekly Recap", icon: "📊", moduleKey: "WEEKLY_RECAP" },
      { href: "/bump-reminder", label: "Bump Reminder", icon: "⏰", moduleKey: "BUMP_REMINDER" },
      { href: "/suggestion-analytics", label: "Suggestion Analytics", icon: "💡", moduleKey: "SUGGESTION_ANALYTICS" },
      { href: "/partnerships", label: "Server Partnerships", icon: "🤝" }, // no module toggle of its own
    ],
  },
  {
    section: "Levelling & Economy",
    items: [
      { href: "/leveling", label: "Leaderboard", icon: "📈", moduleKey: "LEVELING" },
      { href: "/level-roles", label: "Level Roles", icon: "🏅", moduleKey: "LEVELING" },
      { href: "/prestige", label: "Prestige", icon: "⭐", moduleKey: "PRESTIGE" },
      { href: "/voice-activity", label: "Voice Activity", icon: "🎙️", moduleKey: "VOICE_ACTIVITY" },
      { href: "/achievements", label: "Achievements", icon: "🏆", moduleKey: "ACHIEVEMENTS" },
      { href: "/growth-analytics", label: "Growth Analytics", icon: "📉", moduleKey: "GROWTH_ANALYTICS" },
      { href: "/economy/settings", label: "Economy Settings", icon: "⚙️", moduleKey: "ECONOMY" },
      { href: "/economy/earning", label: "Economy Earning", icon: "📈", moduleKey: "ECONOMY" },
      { href: "/economy/leaderboard", label: "Economy Leaderboard", icon: "🏅", moduleKey: "ECONOMY" },
      { href: "/economy/analytics", label: "Economy Analytics", icon: "📊", moduleKey: "ECONOMY" },
      { href: "/counting-game", label: "Counting Game", icon: "🔢", moduleKey: "COUNTING_GAME" },
    ],
  },
  {
    section: "Support",
    items: [
      { href: "/tickets", label: "Tickets", icon: "🎟️", moduleKey: "TICKETS" },
      { href: "/applications", label: "Applications", icon: "📝", moduleKey: "APPLICATIONS" },
      { href: "/support-intake", label: "Support DM", icon: "📨", moduleKey: "SUPPORT_INTAKE" },
    ],
  },
  {
    section: "Utility",
    items: [
      { href: "/channel-locks", label: "Channel Locks", icon: "🔒", moduleKey: "CHANNEL_LOCKS" },
      { href: "/slow-mode", label: "Slow Mode", icon: "🐢", moduleKey: "SLOW_MODE" },
      { href: "/stat-channels", label: "Server Stat Channels", icon: "📈", moduleKey: "STAT_CHANNELS" },
      { href: "/status-channel", label: "Status Channel", icon: "🟢", moduleKey: "STATUS_CHANNEL" },
      { href: "/server-templates", label: "Server Config Templates", icon: "📋", moduleKey: "SERVER_TEMPLATES" },
    ],
  },
];

// Not folded into the categories a member's server would have — these are
// dashboard-account-owner tools, so !setup-test-server skips this section
// entirely rather than creating channels for it.
export const OWNER_NAV_SECTION: NavSection = {
  section: "Owner Only",
  items: [
    { href: "/bot-customization", label: "Bot Customization", icon: "🤖" },
    { href: "/owner-panel", label: "Access Control", icon: "🔑" },
    { href: "/whats-new", label: "What's New", icon: "🔔" },
  ],
};

export const NAV_MODULE_KEYS: Record<string, ModuleKey> = Object.fromEntries(
  NAV_SECTIONS.flatMap((s) => s.items).filter((i): i is NavItem & { moduleKey: ModuleKey } => !!i.moduleKey).map((i) => [i.href, i.moduleKey])
);

// Reverse of NAV_MODULE_KEYS — first href that gates a given ModuleKey wins,
// for anywhere that only has the key (e.g. Overview's Enabled Modules list)
// and needs somewhere to link a module to.
export const MODULE_KEY_TO_HREF: Partial<Record<ModuleKey, string>> = {};
for (const [href, key] of Object.entries(NAV_MODULE_KEYS)) {
  if (!(key in MODULE_KEY_TO_HREF)) MODULE_KEY_TO_HREF[key as ModuleKey] = href;
}

// A handful of modules are meaningfully tied to a voice channel rather than
// a text one (a stat channel's whole point is a voice channel with a locked
// name; temp channels need a "join to create" voice hub).
export const VOICE_MODULE_KEYS: ReadonlySet<ModuleKey> = new Set<ModuleKey>(["STAT_CHANNELS", "TEMP_CHANNELS"]);

// Turns a page's display label into a Discord-safe channel name.
export function slugifyModuleLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}
