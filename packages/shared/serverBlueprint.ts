// The server /server-setup builds: roles, categories, channels, role pickers,
// onboarding and module wiring for an FPS gaming community. Existing roles and
// channels are matched by name (aliases cover common older names) and reused,
// so running it on a server that already has some of this renames and moves
// instead of making doubles.

export type BlueprintGameId = "r6" | "cod" | "bf" | "val" | "cs2" | "apex" | "ow" | "other";

export interface BlueprintGame {
  id: BlueprintGameId;
  name: string;
  emoji: string;
  slug: string;
  aliases: string[];
  short: string; // used in squad channel names, like "🟧 R6 Squad 1"
  squad: number; // squad channel limit for this game, 0 for none
}

export const BLUEPRINT_GAMES: BlueprintGame[] = [
  { id: "r6", name: "Rainbow Six Siege", emoji: "🟧", slug: "r6-siege", aliases: ["rainbow-six-siege", "r6", "siege", "rainbow-six"], short: "R6", squad: 5 },
  { id: "cod", name: "Call of Duty", emoji: "🪖", slug: "call-of-duty", aliases: ["cod", "warzone"], short: "CoD", squad: 4 },
  { id: "bf", name: "Battlefield", emoji: "🟦", slug: "battlefield", aliases: ["bf"], short: "BF", squad: 4 },
  { id: "val", name: "Valorant", emoji: "🟥", slug: "valorant", aliases: ["val"], short: "Valorant", squad: 5 },
  { id: "cs2", name: "Counter-Strike 2", emoji: "🟨", slug: "cs2", aliases: ["counter-strike", "csgo"], short: "CS2", squad: 5 },
  { id: "apex", name: "Apex Legends", emoji: "🔺", slug: "apex-legends", aliases: ["apex"], short: "Apex", squad: 3 },
  { id: "ow", name: "Overwatch 2", emoji: "🟠", slug: "overwatch-2", aliases: ["overwatch"], short: "OW2", squad: 5 },
  { id: "other", name: "Other Games", emoji: "🎮", slug: "other-games", aliases: ["variety"], short: "Squad", squad: 0 },
];
export const DEFAULT_BLUEPRINT_GAMES: BlueprintGameId[] = ["r6", "cod", "bf", "other"];

// The squad channel game menu for the picked games, like "🟧 R6 Squad 1".
export function blueprintGameChoices(games: BlueprintGameId[]) {
  return BLUEPRINT_GAMES.filter((g) => games.includes(g.id)).map((g) => ({
    label: g.name,
    emoji: g.emoji,
    nameFormat: g.id === "other" ? `${g.emoji} {user}'s Squad` : `${g.emoji} ${g.short} Squad {index}`,
    userLimit: g.squad,
  }));
}

// Roles are referred to by key everywhere else in the blueprint.
export type RoleKey = string;
export interface BlueprintRole {
  key: RoleKey;
  name: string;
  color: number;
  hoist?: boolean;
  aliases?: string[];
  // Permission sets the build is allowed to give a role it creates. Existing
  // roles keep their own permissions.
  perms?: "admin-lite" | "moderator" | "support" | "none";
  game?: BlueprintGameId;
}

export const BLUEPRINT_ROLES: BlueprintRole[] = [
  { key: "admin", name: "⚙️ Admin", color: 0xed4245, hoist: true, aliases: ["admins", "admin", "administrator"], perms: "admin-lite" },
  { key: "mod", name: "🛡️ Moderator", color: 0x5865f2, hoist: true, aliases: ["mods", "mod", "moderator", "moderators"], perms: "moderator" },
  { key: "support", name: "🎟️ Support Team", color: 0x3ba55d, hoist: true, aliases: ["support", "support-team", "helper", "helpers"], perms: "support" },
  { key: "host", name: "🎉 Event Host", color: 0xeb459e, aliases: ["event-host", "host"] },
  { key: "staff", name: "🛡️ Staff", color: 0x71368a, aliases: ["staff", "team"] },
  { key: "champion", name: "🏆 Tournament Champion", color: 0xf1c40f, hoist: true, aliases: ["champion", "tournament-champion"] },
  { key: "creator", name: "🎥 Content Creator", color: 0x9b59b6, hoist: true, aliases: ["content-creator", "creator", "streamer"] },
  { key: "partner", name: "🤝 Partner", color: 0x1abc9c, aliases: ["partner", "partners"] },
  { key: "lvl50", name: "Legend", color: 0xe67e22, aliases: ["legend"] },
  { key: "lvl30", name: "Elite", color: 0xe74c3c, aliases: ["elite"] },
  { key: "lvl15", name: "Veteran", color: 0x3498db, aliases: ["veteran"] },
  { key: "lvl5", name: "Recruit", color: 0x95a5a6, aliases: ["recruit"] },
  { key: "member", name: "✅ Member", color: 0xf1c40f, aliases: ["community-member", "member", "members", "verified"] },
  { key: "mm", name: "⚔️ Matchmaking", color: 0, aliases: ["matchmaking"] },
  ...BLUEPRINT_GAMES.map((g): BlueprintRole => ({ key: `game:${g.id}`, name: `${g.emoji} ${g.name}`, color: 0, aliases: [g.slug, ...g.aliases, g.name], game: g.id })),
  { key: "pc", name: "💻 PC Gamer", color: 0, aliases: ["pc-gamer", "pc"] },
  { key: "console", name: "🎮 Console Gamer", color: 0, aliases: ["console-gamer", "console", "playstation", "xbox"] },
  { key: "mobile", name: "📱 Mobile", color: 0, aliases: ["mobile"] },
  { key: "comp", name: "🏆 Competitive", color: 0, aliases: ["competitive"] },
  { key: "casual", name: "🕹️ Casual", color: 0, aliases: ["casual", "variety-gamer"] },
  { key: "fa", name: "👥 Free Agent", color: 0, aliases: ["free-agent"] },
  { key: "ping:ann", name: "📢 Announcements", color: 0, aliases: ["announcements", "announcement-pings"] },
  { key: "ping:events", name: "📅 Events", color: 0, aliases: ["events", "event-pings"] },
  { key: "ping:giveaways", name: "🎁 Giveaways", color: 0, aliases: ["giveaways", "giveaway-pings"] },
  { key: "ping:streams", name: "🔴 Streams", color: 0, aliases: ["streams", "stream-pings"] },
  { key: "ping:match", name: "⚔️ Match Alerts", color: 0, aliases: ["match-alerts"] },
  { key: "ping:lfg", name: "🔎 LFG", color: 0, aliases: ["lfg"] },
];

// Who can see and talk in a channel. "everyone" includes people who haven't
// accepted the rules; "member" means the ✅ Member role.
export type Access =
  | { see: "everyone"; talk: boolean }
  | { see: "member"; talk: boolean }
  | { see: "role"; role: RoleKey; talk: boolean }
  | { see: "staff"; talk: boolean };

export type ChannelKind = "text" | "voice" | "announcement";

export interface BlueprintChannel {
  key: string;
  name: string;
  kind: ChannelKind;
  topic?: string;
  aliases?: string[];
  access?: Access; // defaults to the category's
  game?: BlueprintGameId;
  userLimit?: number;
}

export interface BlueprintCategory {
  key: string;
  name: string;
  aliases?: string[];
  access: Access;
  channels: BlueprintChannel[];
}

const readOnlyEveryone: Access = { see: "everyone", talk: false };
const memberTalk: Access = { see: "member", talk: true };
const memberRead: Access = { see: "member", talk: false };
const mmRead: Access = { see: "role", role: "mm", talk: false };
const staffTalk: Access = { see: "staff", talk: true };

export function blueprintCategories(games: BlueprintGameId[]): BlueprintCategory[] {
  const picked = BLUEPRINT_GAMES.filter((g) => games.includes(g.id));
  return [
    { key: "stats", name: "📊 Server Stats", aliases: ["server-stats", "stats"], access: readOnlyEveryone, channels: [
      { key: "stat-members", name: "👥 Members: 0", kind: "voice", aliases: ["members"] },
    ]},
    { key: "start", name: "📌 Start Here", aliases: ["start-here", "information-center", "info", "information", "welcome"], access: readOnlyEveryone, channels: [
      { key: "welcome", name: "👋・welcome", kind: "text", topic: "New members are greeted here.", aliases: ["welcome", "welcomes"] },
      { key: "rules", name: "📜・rules", kind: "text", topic: "Read the rules and tap Accept to unlock the server.", aliases: ["rules", "server-rules"] },
      { key: "roles", name: "🎭・roles", kind: "text", topic: "Pick your games, platform, playstyle and pings.", aliases: ["roles", "role-select", "get-roles", "self-roles"] },
    ]},
    { key: "info", name: "📢 Information", aliases: ["information-hub", "news"], access: memberRead, channels: [
      { key: "announcements", name: "📢・announcements", kind: "announcement", topic: "Server news.", aliases: ["announcements", "news"] },
      { key: "events", name: "📅・events-and-giveaways", kind: "text", topic: "Scrim nights, community game nights and giveaways.", aliases: ["events-and-giveaways", "community-events", "events", "giveaways"] },
      { key: "live", name: "🔴・live-now", kind: "text", topic: "When our creators go live.", aliases: ["live-now", "streams", "stream-alerts"] },
    ]},
    { key: "community", name: "💬 Community", aliases: ["community", "general"], access: memberTalk, channels: [
      { key: "general", name: "💬・general", kind: "text", topic: "Main chat.", aliases: ["general", "general-chat", "chat", "lounge"] },
      { key: "clips", name: "🎬・clips-and-memes", kind: "text", topic: "Aces, clutches, funny moments and memes.", aliases: ["clips-and-memes", "clips-and-highlights", "clips", "highlights"] },
      { key: "polls", name: "💡・polls-and-suggestions", kind: "text", topic: "Polls and ideas for the server.", aliases: ["polls-and-suggestions", "community-polls", "polls", "suggestions"] },
      { key: "botcmds", name: "🤖・bot-commands", kind: "text", topic: "Commands like /rank and stat lookups.", aliases: ["bot-commands", "commands", "bots", "stat-check"] },
    ]},
    { key: "games", name: "🎮 Games", aliases: ["games", "gaming-zone", "gaming"], access: memberTalk, channels: [
      { key: "lfg", name: "🔎・looking-for-group", kind: "text", topic: "Find a squad.", aliases: ["looking-for-group", "lfg"] },
      ...picked.map((g): BlueprintChannel => ({ key: `game:${g.id}`, name: `${g.emoji}・${g.slug}`, kind: "text", topic: `${g.name} chat.`, aliases: [g.slug, ...g.aliases], game: g.id, access: { see: "role", role: `game:${g.id}`, talk: true } })),
    ]},
    { key: "mm", name: "⚔️ Matchmaking", aliases: ["matchmaking"], access: mmRead, channels: [
      { key: "mm-board", name: "⚔️・matchmaking", kind: "text", topic: "Queue, challenge, start a pickup match or manage your team.", aliases: ["start-matchmaking", "matchmaking-board"] },
      { key: "mm-threads", name: "🧵・match-threads", kind: "text", topic: "Challenges and private match threads.", aliases: ["match-threads", "matchmaking"] },
      { key: "mm-leaderboard", name: "🏆・leaderboard", kind: "text", topic: "Top players and teams.", aliases: ["leaderboard", "leaderboards"] },
      { key: "mm-tournaments", name: "🏟️・tournaments", kind: "text", topic: "Tournament sign-ups and results.", aliases: ["tournaments", "match-results", "results"] },
      { key: "mm-lobby", name: "🎯 Matchmaking Lobby", kind: "voice", aliases: ["lobby", "matchmaking-lobby"], access: { see: "role", role: "mm", talk: true } },
    ]},
    { key: "duels", name: "⚔️ 1v1 Matches", aliases: ["1v1s", "1v1-s", "1v1", "1v1-matches", "duels"], access: { see: "role", role: "mm", talk: true }, channels: [] },
    { key: "teammatches", name: "👥 Team Matches", aliases: ["team-matches", "teams"], access: { see: "role", role: "mm", talk: true }, channels: [] },
    { key: "voice", name: "🔊 Voice", aliases: ["voice-channels", "voice"], access: memberTalk, channels: [
      { key: "squad", name: "➕ Create a Squad", kind: "voice", aliases: ["create-a-squad", "create-gaming-vc", "join-to-create", "create-vc"] },
      { key: "afk", name: "💤 AFK", kind: "voice", aliases: ["afk"] },
    ]},
    { key: "support", name: "🎟️ Support", aliases: ["support", "tickets", "help"], access: memberRead, channels: [
      { key: "support", name: "🎟️・support", kind: "text", topic: "Open a private ticket or apply to join the team.", aliases: ["support", "open-a-ticket", "tickets", "apply", "applications"] },
    ]},
    { key: "staff", name: "🛡️ Staff", aliases: ["mods", "staff", "moderators", "mod-only"], access: staffTalk, channels: [
      { key: "staff-chat", name: "🛡️・staff-chat", kind: "text", aliases: ["staff-chat", "moderator-only", "mod-chat", "staff"] },
      { key: "mod-log", name: "📋・mod-log", kind: "text", topic: "Moderation actions, edits, deletes and reports.", aliases: ["mod-log", "mod-logs", "logs"] },
      { key: "server-log", name: "📤・server-log", kind: "text", topic: "Joins, leaves, rules accepted and security alerts.", aliases: ["server-log", "hi-bye", "member-log", "join-leave"] },
      { key: "staff-desk", name: "📥・tickets-and-applications", kind: "text", topic: "Ticket transcripts, applications and the weekly report.", aliases: ["tickets-and-applications", "ticket-logs", "transcripts"] },
      { key: "staff-siege", name: "🛡️・staff-siege", kind: "text", aliases: ["staff-siege", "siege-chat"] },
      { key: "emojis", name: "😀・emojis", kind: "text", aliases: ["emojis", "emoji-requests"] },
      { key: "bot-status", name: "🟢・bot-status", kind: "text", aliases: ["bot-status", "spartacus", "status"] },
      { key: "staff-voice", name: "🔊 Staff Voice", kind: "voice", aliases: ["staff-voice", "staff-vc"] },
    ]},
  ];
}

export const ARCHIVE_CATEGORY = "📦 Archive";

// The 🎭・roles pickers, as role keys. Game options follow the picked games.
export interface BlueprintPicker {
  name: string;
  description: string;
  options: Array<{ role: RoleKey; label: string; emoji?: string }>;
}

export function blueprintPickers(games: BlueprintGameId[]): BlueprintPicker[] {
  const picked = BLUEPRINT_GAMES.filter((g) => games.includes(g.id));
  return [
    { name: "🎮 Pick your games", description: "Each game opens its channel.", options: picked.map((g) => ({ role: `game:${g.id}`, label: g.name, emoji: g.emoji })) },
    { name: "🖥️ Pick your platform", description: "Helps squads match up for crossplay.", options: [{ role: "pc", label: "PC Gamer", emoji: "💻" }, { role: "console", label: "Console Gamer", emoji: "🎮" }, { role: "mobile", label: "Mobile", emoji: "📱" }] },
    { name: "🏆 Pick your playstyle", description: "Matchmaking opens the 1v1s, pickups and team matches.", options: [{ role: "mm", label: "Matchmaking", emoji: "⚔️" }, { role: "comp", label: "Competitive", emoji: "🏆" }, { role: "casual", label: "Casual", emoji: "🕹️" }, { role: "fa", label: "Free Agent", emoji: "👥" }] },
    { name: "🔔 Pick your pings", description: "Choose what you get pinged for.", options: [{ role: "ping:ann", label: "Announcements", emoji: "📢" }, { role: "ping:events", label: "Events", emoji: "📅" }, { role: "ping:giveaways", label: "Giveaways", emoji: "🎁" }, { role: "ping:streams", label: "Streams", emoji: "🔴" }, { role: "ping:match", label: "Match Alerts", emoji: "⚔️" }, { role: "ping:lfg", label: "LFG", emoji: "🔎" }] },
  ];
}

// Discord onboarding: the same choices as the pickers.
export function blueprintOnboarding(games: BlueprintGameId[]) {
  const pickers = blueprintPickers(games);
  const titles = ["Which games do you play?", "What do you play on?", "How do you like to play?", "What should we ping you for?"];
  return pickers.map((p, i) => ({ title: titles[i], singleSelect: false, options: p.options }));
}

export const BLUEPRINT_RULES = [
  "**1. Respect everyone.** No hate, harassment or slurs.",
  "**2. No cheating.** No boosting, account selling or cheats.",
  "**3. Right channel, right topic.** Keep it where it belongs.",
  "**4. No spam or self-promo.**",
  "**5. Follow Discord's Terms of Service.**",
  "",
  "Tap **I Agree** below to unlock the server.",
].join("\n");

export const BLUEPRINT_LEVEL_ROLES: Array<{ level: number; role: RoleKey }> = [
  { level: 5, role: "lvl5" },
  { level: 15, role: "lvl15" },
  { level: 30, role: "lvl30" },
  { level: 50, role: "lvl50" },
];

export const BLUEPRINT_TICKET_TYPES = [
  { name: "Get Help", emoji: "🙋", description: "Questions or problems with the server." },
  { name: "Report a Player", emoji: "🚩", description: "Report someone breaking the rules." },
  { name: "Partnership", emoji: "🤝", description: "Partner your server or community with us." },
];

export const BLUEPRINT_APPLICATIONS = [
  { name: "Moderator", emoji: "🛡️", description: "Help keep the server running.", questions: ["How old are you?", "What timezone are you in?", "Why do you want to be a moderator?", "Any moderation experience?"] },
  { name: "Content Creator", emoji: "🎥", description: "Get the creator role and go-live alerts.", questions: ["Link to your channel", "What do you stream or post?", "How often do you go live?"] },
  { name: "Server Team", emoji: "🎮", description: "Play on a team that represents the server.", questions: ["Which game?", "Your rank", "What role or position do you play?", "When are you usually free?"] },
];

// Lowercase, emoji and box-drawing characters stripped, words joined by "-".
// "──┤ INFORMATION CENTER├──" → "information-center", "👋┃welcome" → "welcome".
export function blueprintSlug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
