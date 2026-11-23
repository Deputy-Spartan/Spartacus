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

// Each section is one group in the sidebar. Tapping a group lists its pages
// under it (one group open at a time), and the group's pages also sit as tabs
// along the top of each of them (components/nav/HubTabs.tsx), so related
// settings are one click apart.
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
    section: "Safety",
    icon: "🛡️",
    description: "Moderation, plus protection from raids, nukes and risky permission changes.",
    items: [
      { href: "/moderation", label: "Moderator", icon: "🛡️", moduleKey: "MODERATION" },
      { href: "/cases", label: "Cases & Warnings", icon: "📁", moduleKey: "MODERATION" },
      { href: "/reports", label: "Player Reports", icon: "🚩", moduleKey: "PLAYER_REPORTS" },
      { href: "/warn-escalation", label: "Warn Escalation", icon: "📈", moduleKey: "WARN_ESCALATION" },
      { href: "/appeals", label: "Appeals", icon: "🙏", moduleKey: "BAN_APPEALS" },
      { href: "/mod-digest", label: "Weekly Staff Report", icon: "📋", moduleKey: "MOD_DIGEST" },
      { href: "/slow-mode", label: "Slow Mode", icon: "🐢", moduleKey: "SLOW_MODE" },
      { href: "/channel-locks", label: "Channel Locks", icon: "🔒", moduleKey: "CHANNEL_LOCKS" },
      { href: "/ai-moderation", label: "AI Moderation", icon: "🤖", moduleKey: "AI_MODERATION" },
      { href: "/anti-raid", label: "Anti-Raid", icon: "🚨", moduleKey: "ANTI_RAID" },
      { href: "/anti-nuke", label: "Anti-Nuke", icon: "💣", moduleKey: "ANTI_NUKE" },
      { href: "/perm-watch", label: "Perm Watch", icon: "🔍", moduleKey: "PERM_WATCH" },
      { href: "/honeypot", label: "Honeypot", icon: "🍯", moduleKey: "HONEYPOT" },
      { href: "/server-backup", label: "Server Backup", icon: "🗄️", moduleKey: "SERVER_BACKUP" },
    ],
  },
  {
    section: "Community",
    icon: "👋",
    description: "Welcomes, verification, roles, channels, tickets and applications.",
    items: [
      { href: "/welcome", label: "Welcome", icon: "👋", moduleKey: "WELCOME" },
      { href: "/verification", label: "Verification", icon: "✅", moduleKey: "VERIFICATION" },
      { href: "/rules-gate", label: "Rules", icon: "📜", moduleKey: "RULES_GATE" },
      { href: "/role-manager", label: "Role Manager", icon: "⚙️", moduleKey: "ROLE_MANAGER" },
      { href: "/reaction-roles", label: "Reaction Roles", icon: "🎭", moduleKey: "REACTION_ROLES" },
      { href: "/temp-channels", label: "Temp Channels", icon: "🔊", moduleKey: "TEMP_CHANNELS" },
      { href: "/server-templates", label: "Server Config Templates", icon: "🖥️", moduleKey: "SERVER_TEMPLATES" },
      { href: "/partnerships", label: "Server Partnerships", icon: "🤝" }, // no module toggle of its own
      { href: "/tickets", label: "Tickets", icon: "🎟️", moduleKey: "TICKETS" },
      { href: "/applications", label: "Applications", icon: "📝", moduleKey: "APPLICATIONS" },
      { href: "/support-intake", label: "Support DM", icon: "📨", moduleKey: "SUPPORT_INTAKE" },
    ],
  },
  {
    section: "Streaming",
    icon: "🔴",
    description: "Going-live alerts, clips, the schedule, viewer rewards, raids, recaps, game nights, your pre-stream checklist, and your OBS overlays: socials, a money counter and a kill/death counter.",
    items: [
      { href: "/stream-alerts", label: "Going Live", icon: "🔴", moduleKey: "STREAM_ALERTS" },
      { href: "/stream-extras", label: "Stream Extras", icon: "🎬", moduleKey: "STREAM_EXTRAS" },
      { href: "/stream-growth", label: "Stream Growth", icon: "📣", moduleKey: "STREAM_GROWTH" },
      { href: "/chat-commands", label: "Chat Commands", icon: "⌨️" },
      { href: "/pre-stream", label: "Pre-Stream Checklist", icon: "📋", moduleKey: "PRE_STREAM" },
      // Socials, Money Counter and K/D Counter live inside it (/overlays/socials, /money, /kd).
      { href: "/overlays", label: "Overlays", icon: "🎨" },
    ],
  },
  {
    section: "Fun & Rewards",
    icon: "🎁",
    description: "Giveaways, polls, games, events, coins and levels.",
    items: [
      { href: "/giveaways", label: "Giveaways", icon: "🎁", moduleKey: "GIVEAWAYS" },
      { href: "/polls", label: "Polls", icon: "🗳️", moduleKey: "POLLS" },
      { href: "/economy-hub", label: "Economy Hub", icon: "💰", moduleKey: "ECONOMY" },
      { href: "/starboard", label: "Starboard", icon: "⭐", moduleKey: "STARBOARD" },
      { href: "/counting-game", label: "Counting Game", icon: "🔢", moduleKey: "COUNTING_GAME" },
      { href: "/confessions", label: "Anonymous", icon: "🤫", moduleKey: "CONFESSIONS" },
      { href: "/ai-chat", label: "AI Chat", icon: "💡", moduleKey: "AI_CHAT" },
      { href: "/birthdays", label: "Birthdays", icon: "🎂", moduleKey: "BIRTHDAYS" },
      { href: "/events", label: "Event Scheduler", icon: "⚔️", moduleKey: "EVENTS" },
      { href: "/matches", label: "Matchmaking", icon: "👑", moduleKey: "MATCHES" },
      { href: "/lfg", label: "LFG", icon: "👥", moduleKey: "LFG" },
      { href: "/playing-now", label: "Playing Now", icon: "🎮", moduleKey: "PLAYING_NOW" },
    ],
  },
  {
    section: "Posts & Stats",
    icon: "📢",
    description: "Announcements, daily posts, custom commands, recaps and server stats.",
    items: [
      { href: "/announcements", label: "Announcements", icon: "📢", moduleKey: "ANNOUNCEMENTS" },
      { href: "/quote-of-the-day", label: "Quote of the Day", icon: "💭", moduleKey: "QOTD" },
      { href: "/sticky-messages", label: "Sticky Messages", icon: "📌", moduleKey: "STICKY_MESSAGES" },
      { href: "/embed-creator", label: "Embed Creator", icon: "🧱", moduleKey: "EMBED_CREATOR" },
      { href: "/commands", label: "Custom Commands", icon: "💬", moduleKey: "CUSTOM_COMMANDS" },
      { href: "/bump-reminder", label: "Bump Reminder", icon: "⏰", moduleKey: "BUMP_REMINDER" },
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
export const RETIRED_NAV_SECTIONS = [
  // the first regroup
  "Security",
  "Engagement",
  "Utility",
  // the 11 groups, folded into the 5 above
  "Moderation",
  "Protection",
  "Onboarding",
  "Messaging",
  "Groups & Events",
  "Fun & Engagement",
  "Levelling & Economy",
  "Roles & Channels",
  "Support",
  "Insights",
];

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
