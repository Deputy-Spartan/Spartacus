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
  icon?: string; // the group's own icon in the sidebar and on the Modules page
  description?: string; // one line under the group's name on the Modules page
  items: NavItem[];
}

// Each section is one group in the sidebar. Opening a group goes straight to
// its first page, and the group's other pages sit beside it as tabs (see
// components/nav/HubTabs.tsx), so related settings are one click apart.
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
    icon: "🛡️",
    description: "Warn, mute and review members, and keep channels in order.",
    items: [
      { href: "/moderation", label: "Moderator", icon: "🛡️", moduleKey: "MODERATION" },
      { href: "/cases", label: "Cases & Warnings", icon: "📁", moduleKey: "MODERATION" },
      { href: "/reports", label: "Player Reports", icon: "🚩", moduleKey: "PLAYER_REPORTS" },
      { href: "/warn-escalation", label: "Warn Escalation", icon: "📈", moduleKey: "WARN_ESCALATION" },
      { href: "/appeals", label: "Appeals", icon: "🙏", moduleKey: "BAN_APPEALS" },
      { href: "/mod-digest", label: "Weekly Staff Report", icon: "📋", moduleKey: "MOD_DIGEST" },
      { href: "/slow-mode", label: "Slow Mode", icon: "🐢", moduleKey: "SLOW_MODE" },
      { href: "/channel-locks", label: "Channel Locks", icon: "🔒", moduleKey: "CHANNEL_LOCKS" },
    ],
  },
  {
    section: "Protection",
    icon: "🚨",
    description: "Stop raids, nukes and risky permission changes before they spread.",
    items: [
      { href: "/ai-moderation", label: "AI Moderation", icon: "🤖", moduleKey: "AI_MODERATION" },
      { href: "/anti-raid", label: "Anti-Raid", icon: "🚨", moduleKey: "ANTI_RAID" },
      { href: "/anti-nuke", label: "Anti-Nuke", icon: "💣", moduleKey: "ANTI_NUKE" },
      { href: "/perm-watch", label: "Perm Watch", icon: "🔍", moduleKey: "PERM_WATCH" },
      { href: "/honeypot", label: "Honeypot", icon: "🍯", moduleKey: "HONEYPOT" },
      { href: "/server-backup", label: "Server Backup", icon: "🗄️", moduleKey: "SERVER_BACKUP" },
    ],
  },
  {
    section: "Onboarding",
    icon: "👋",
    description: "Greet new members and get them through the door.",
    items: [
      { href: "/welcome", label: "Welcome", icon: "👋", moduleKey: "WELCOME" },
      { href: "/verification", label: "Verification", icon: "✅", moduleKey: "VERIFICATION" },
      { href: "/rules-gate", label: "Rules", icon: "📜", moduleKey: "RULES_GATE" },
    ],
  },
  {
    section: "Streaming",
    icon: "🔴",
    description: "Going-live alerts, clips, the stream schedule and viewer rewards.",
    items: [
      { href: "/stream-alerts", label: "Going Live", icon: "🔴", moduleKey: "STREAM_ALERTS" },
      { href: "/stream-extras", label: "Stream Extras", icon: "🎬", moduleKey: "STREAM_EXTRAS" },
    ],
  },
  {
    section: "Messaging",
    icon: "📢",
    description: "Announcements, daily posts, sticky messages and custom commands.",
    items: [
      { href: "/announcements", label: "Announcements", icon: "📢", moduleKey: "ANNOUNCEMENTS" },
      { href: "/quote-of-the-day", label: "Quote of the Day", icon: "💭", moduleKey: "QOTD" },
      { href: "/sticky-messages", label: "Sticky Messages", icon: "📌", moduleKey: "STICKY_MESSAGES" },
      { href: "/embed-creator", label: "Embed Creator", icon: "🧱", moduleKey: "EMBED_CREATOR" },
      { href: "/commands", label: "Custom Commands", icon: "💬", moduleKey: "CUSTOM_COMMANDS" },
      { href: "/bump-reminder", label: "Bump Reminder", icon: "⏰", moduleKey: "BUMP_REMINDER" },
    ],
  },
  {
    section: "Groups & Events",
    icon: "⚔️",
    description: "Event signups, matchmaking and finding people to play with.",
    items: [
      { href: "/events", label: "Event Scheduler", icon: "⚔️", moduleKey: "EVENTS" },
      { href: "/matches", label: "Matchmaking", icon: "👑", moduleKey: "MATCHES" },
      { href: "/lfg", label: "LFG", icon: "👥", moduleKey: "LFG" },
      { href: "/playing-now", label: "Playing Now", icon: "🎮", moduleKey: "PLAYING_NOW" },
    ],
  },
  {
    section: "Fun & Engagement",
    icon: "🎁",
    description: "Giveaways, polls, starboard and community games.",
    items: [
      { href: "/giveaways", label: "Giveaways", icon: "🎁", moduleKey: "GIVEAWAYS" },
      { href: "/polls", label: "Polls", icon: "🗳️", moduleKey: "POLLS" },
      { href: "/starboard", label: "Starboard", icon: "⭐", moduleKey: "STARBOARD" },
      { href: "/counting-game", label: "Counting Game", icon: "🔢", moduleKey: "COUNTING_GAME" },
      { href: "/confessions", label: "Anonymous", icon: "🤫", moduleKey: "CONFESSIONS" },
      { href: "/ai-chat", label: "AI Chat", icon: "💡", moduleKey: "AI_CHAT" },
      { href: "/birthdays", label: "Birthdays", icon: "🎂", moduleKey: "BIRTHDAYS" },
    ],
  },
  {
    section: "Levelling & Economy",
    icon: "💰",
    description: "Coins, levels, the shop and achievements.",
    items: [
      { href: "/economy-hub", label: "Economy Hub", icon: "💰", moduleKey: "ECONOMY" },
    ],
  },
  {
    section: "Roles & Channels",
    icon: "🎭",
    description: "Self-serve roles, temporary voice channels and server templates.",
    items: [
      { href: "/role-manager", label: "Role Manager", icon: "⚙️", moduleKey: "ROLE_MANAGER" },
      { href: "/reaction-roles", label: "Reaction Roles", icon: "🎭", moduleKey: "REACTION_ROLES" },
      { href: "/temp-channels", label: "Temp Channels", icon: "🔊", moduleKey: "TEMP_CHANNELS" },
      { href: "/server-templates", label: "Server Config Templates", icon: "🖥️", moduleKey: "SERVER_TEMPLATES" },
      { href: "/partnerships", label: "Server Partnerships", icon: "🤝" }, // no module toggle of its own
    ],
  },
  {
    section: "Support",
    icon: "🎟️",
    description: "Tickets, applications and help by DM.",
    items: [
      { href: "/tickets", label: "Tickets", icon: "🎟️", moduleKey: "TICKETS" },
      { href: "/applications", label: "Applications", icon: "📝", moduleKey: "APPLICATIONS" },
      { href: "/support-intake", label: "Support DM", icon: "📨", moduleKey: "SUPPORT_INTAKE" },
    ],
  },
  {
    section: "Insights",
    icon: "📉",
    description: "Weekly recaps, growth and live server stats.",
    items: [
      { href: "/weekly-recap", label: "Weekly Recap", icon: "📊", moduleKey: "WEEKLY_RECAP" },
      { href: "/growth-analytics", label: "Growth Analytics", icon: "📉", moduleKey: "GROWTH_ANALYTICS" },
      { href: "/suggestion-analytics", label: "Suggestion Analytics", icon: "📥", moduleKey: "SUGGESTION_ANALYTICS" },
      { href: "/member-milestones", label: "Member Milestones", icon: "🏅", moduleKey: "MEMBER_MILESTONES" },
      { href: "/stat-channels", label: "Server Stat Channels", icon: "📈", moduleKey: "STAT_CHANNELS" },
      { href: "/status-channel", label: "Status Channel", icon: "🟢", moduleKey: "STATUS_CHANNEL" },
    ],
  },
];

// Section names from before the pages were regrouped. !setup-test-server
// moves their channels into the groups above and removes the emptied
// categories, so a test server set up earlier ends up matching.
export const RETIRED_NAV_SECTIONS = ["Security", "Community", "Engagement", "Utility"];

// The group a dashboard page belongs to, from its path under
// /dashboard/:guildId ("/cases", or a deeper page like "/tickets/123").
export function navSectionForPath(path: string): NavSection | null {
  if (!path) return null;
  return NAV_SECTIONS.find((s) => s.section && s.items.some((i) => i.href && (path === i.href || path.startsWith(i.href + "/")))) ?? null;
}

// Not folded into the categories a member's server would have — these are
// dashboard-account-owner tools, so !setup-test-server skips this section
// entirely rather than creating channels for it.
export const OWNER_NAV_SECTION: NavSection = {
  section: "Owner Only",
  items: [
    { href: "/bot-customization", label: "Bot Customization", icon: "🤖" },
    { href: "/owner-panel", label: "Command Center", icon: "🔑" },
    { href: "/stream-deck", label: "Stream Deck", icon: "🎛️" },
    { href: "/quick-links", label: "Quick Links", icon: "🔗" },
    { href: "/front-page", label: "Front Page", icon: "🏠" },
    { href: "/whats-new", label: "What's New", icon: "🔔" },
  ],
};

// Modules with no settings page of their own. They still default to off, so
// the Modules page gives them a switch here.
export const UNLISTED_MODULES: Array<{ key: ModuleKey; description: string }> = [
  { key: "RANK_CARDS", description: "/rank" },
  { key: "REMINDERS", description: "/remindme" },
  { key: "SUGGESTIONS", description: "/suggest, /approve-suggestion and /deny-suggestion" },
  { key: "QUARANTINE", description: "/quarantine and /release" },
  { key: "TRIVIA", description: "/trivia" },
  { key: "CASINO", description: "/coinflip and /slots" },
  { key: "ROLE_PERSISTENCE", description: "Gives members their roles back when they rejoin" },
  { key: "INVITE_TRACKING", description: "Counts who invited each new member" },
];

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
// These are tabs of the Economy Hub rather than sidebar pages.
Object.assign(MODULE_KEY_TO_HREF, {
  LEVELING: "/economy-hub?tab=levels",
  PRESTIGE: "/economy-hub?tab=boosts",
  VOICE_ACTIVITY: "/economy-hub?tab=boosts",
  ACHIEVEMENTS: "/economy-hub?tab=achievements",
  PROFILE_CARDS: "/economy-hub?tab=profile",
  RANK_CARDS: "/economy-hub?tab=levels",
});

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
