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
  | { see: "roles"; roles: RoleKey[]; talk: boolean } // any of these (missing ones are skipped)
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

export function blueprintCategories(games: BlueprintGameId[], layout: BlueprintLayout = "gaming"): BlueprintCategory[] {
  if (layout === "streaming") return streamingCategories(games);
  if (layout === "hq") return hqCategories();
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
      { key: "mm-leaderboard", name: "🏆・leaderboard", kind: "text", topic: "Top players and teams.", aliases: ["leaderboard", "leaderboards"] },
      { key: "mm-threads", name: "💯・matches", kind: "text", topic: "Challenges and private match threads.", aliases: ["matches", "match-threads", "matchmaking"] },
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
  options: Array<{ role?: RoleKey; channel?: string; label: string; emoji?: string }>;
  buttons?: boolean; // posted as buttons instead of a dropdown
}

export function blueprintPickers(games: BlueprintGameId[], layout: BlueprintLayout = "gaming"): BlueprintPicker[] {
  if (layout === "streaming") return streamingPickers(games);
  if (layout === "hq") return HQ_PICKERS;
  const picked = BLUEPRINT_GAMES.filter((g) => games.includes(g.id));
  return [
    { name: "🎮 Pick your games", description: "Each game opens its channel.", options: picked.map((g) => ({ role: `game:${g.id}`, label: g.name, emoji: g.emoji })) },
    { name: "🖥️ Pick your platform", description: "Helps squads match up for crossplay.", options: [{ role: "pc", label: "PC Gamer", emoji: "💻" }, { role: "console", label: "Console Gamer", emoji: "🎮" }, { role: "mobile", label: "Mobile", emoji: "📱" }] },
    { name: "🏆 Pick your playstyle", description: "Matchmaking opens the 1v1s, pickups and team matches.", options: [{ role: "mm", label: "Matchmaking", emoji: "⚔️" }, { role: "comp", label: "Competitive", emoji: "🏆" }, { role: "casual", label: "Casual", emoji: "🕹️" }, { role: "fa", label: "Free Agent", emoji: "👥" }] },
    { name: "🔔 Pick your pings", description: "Choose what you get pinged for.", options: [{ role: "ping:ann", label: "Announcements", emoji: "📢" }, { role: "ping:events", label: "Events", emoji: "📅" }, { role: "ping:giveaways", label: "Giveaways", emoji: "🎁" }, { role: "ping:streams", label: "Streams", emoji: "🔴" }, { role: "ping:match", label: "Match Alerts", emoji: "⚔️" }, { role: "ping:lfg", label: "LFG", emoji: "🔎" }] },
  ];
}

// Discord onboarding: the same choices as the pickers.
export interface BlueprintOnboardingOption { role?: RoleKey; channel?: string; channels?: string[]; label: string; emoji?: string; description?: string }
export interface BlueprintOnboardingPrompt { title: string; singleSelect: boolean; required?: boolean; options: BlueprintOnboardingOption[] }
export function blueprintOnboarding(games: BlueprintGameId[], layout: BlueprintLayout = "gaming"): BlueprintOnboardingPrompt[] {
  if (layout === "hq") return HQ_ONBOARDING;
  if (layout === "streaming") {
    const picked = BLUEPRINT_GAMES.filter((g) => games.includes(g.id));
    return [
      { title: "What brings you here?", singleSelect: false, options: [{ channel: "live", label: "I watch the streams", emoji: "👀" }, { role: "mm", label: "I want to play with the community", emoji: "🎮" }, { role: "creator", label: "I stream too", emoji: "🎥" }] },
      { title: "What should we ping you for?", singleSelect: false, options: streamingPickers(games)[0].options },
      { title: "What do you play?", singleSelect: false, options: picked.map((g) => ({ role: `game:${g.id}`, label: g.name, emoji: g.emoji })) },
    ];
  }
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

// ---- The streaming-community layout (/server-setup layout: Streaming community) ----
// An open server: anyone who joins can see and chat right away. Discord's
// onboarding hands out roles and shows the rules; there's no verify button.

export type BlueprintLayout = "gaming" | "streaming" | "hq";
export const BLUEPRINT_LAYOUTS: Array<{ id: BlueprintLayout; label: string; emoji: string; description: string }> = [
  { id: "gaming", label: "Gaming community", emoji: "🎮", description: "Rules gate, game channels, squads and Matchmaking" },
  { id: "streaming", label: "Streaming community", emoji: "🔴", description: "Open door: stream alerts, clips, hangout, supporters, Matchmaking" },
  { id: "hq", label: "Spartacus HQ & store support", emoji: "🛠️", description: "Bot testing, Spartacus help and OG Armory support, opened by rules and onboarding" },
];
export const DEFAULT_STREAMING_GAMES: BlueprintGameId[] = ["r6", "cod", "other"];

const STREAMING_ROLES: BlueprintRole[] = [
  { key: "admin", name: "⚙️ Admin", color: 0xed4245, hoist: true, aliases: ["admins", "admin", "administrator"], perms: "admin-lite" },
  { key: "mod", name: "🛡️ Moderator", color: 0x5865f2, hoist: true, aliases: ["mods", "mod", "moderator", "moderators", "staff"], perms: "moderator" },
  { key: "live", name: "🔴 Live", color: 0xe74c3c, hoist: true, aliases: ["live", "live-now", "streaming", "now-live"] },
  { key: "vip", name: "⭐ VIP", color: 0xf1c40f, hoist: true, aliases: ["vip", "vips", "regular", "regulars", "og"] },
  { key: "creator", name: "🎥 Content Creator", color: 0x9b59b6, hoist: true, aliases: ["content-creator", "creator", "creators", "streamer", "streamers"] },
  { key: "champion", name: "🏆 Champion", color: 0xffd700, hoist: true, aliases: ["champion", "tournament-champion"] },
  { key: "lvl50", name: "👑 Legend", color: 0xe67e22, aliases: ["legend"] },
  { key: "lvl30", name: "🛡️ Spartan", color: 0xe74c3c, aliases: ["spartan", "elite"] },
  { key: "lvl15", name: "⚔️ Soldier", color: 0x3498db, aliases: ["soldier", "veteran"] },
  { key: "lvl5", name: "🪖 Recruit", color: 0x95a5a6, aliases: ["recruit"] },
  { key: "mm", name: "⚔️ Matchmaking", color: 0, aliases: ["matchmaking"] },
  ...BLUEPRINT_GAMES.map((g): BlueprintRole => ({ key: `game:${g.id}`, name: `${g.emoji} ${g.name}`, color: 0, aliases: [g.slug, ...g.aliases, g.name], game: g.id })),
  { key: "ping:streams", name: "🔴 Stream Alerts", color: 0, aliases: ["stream-alerts", "stream-pings", "streams", "live-pings", "go-live"] },
  { key: "ping:events", name: "📅 Events", color: 0, aliases: ["events", "event-pings"] },
  { key: "ping:giveaways", name: "🎁 Giveaways", color: 0, aliases: ["giveaways", "giveaway-pings"] },
  { key: "ping:gamenight", name: "🎮 Game Nights", color: 0, aliases: ["game-nights", "game-night", "gamenight"] },
  { key: "ping:match", name: "🔔 Match Alerts", color: 0, aliases: ["match-alerts"] },
];

export function blueprintRoles(games: BlueprintGameId[], layout: BlueprintLayout = "gaming"): BlueprintRole[] {
  const list = layout === "streaming" ? STREAMING_ROLES : layout === "hq" ? HQ_ROLES : BLUEPRINT_ROLES;
  return list.filter((r) => !r.game || games.includes(r.game));
}

const everyoneTalk: Access = { see: "everyone", talk: true };
const supporters: Access = { see: "roles", roles: ["vip", "booster", "twitchsub"], talk: true };

function streamingCategories(games: BlueprintGameId[]): BlueprintCategory[] {
  const ro = readOnlyEveryone;
  return [
    { key: "stats", name: "📊 Server Stats", aliases: ["server-stats", "stats"], access: ro, channels: [
      { key: "stat-members", name: "👥 Members: 0", kind: "voice", aliases: ["members", "member-count"] },
    ]},
    { key: "start", name: "📌 Start Here", aliases: ["start-here", "information", "info", "welcome", "information-center"], access: ro, channels: [
      { key: "rules", name: "📜・rules", kind: "text", topic: "The rules. Please read them.", aliases: ["rules", "server-rules"] },
      { key: "welcome", name: "👋・welcome", kind: "text", topic: "Welcome to the community!", aliases: ["welcome", "welcomes"] },
      { key: "announcements", name: "📢・announcements", kind: "announcement", topic: "News from the stream.", aliases: ["announcements", "news", "updates"] },
      { key: "events", name: "📅・stream-schedule", kind: "text", topic: "Upcoming streams and game nights. Tap Interested for a reminder.", aliases: ["stream-schedule", "schedule", "events"] },
      { key: "roles", name: "🎭・pick-roles", kind: "text", topic: "Pick your pings and games.", aliases: ["pick-roles", "roles", "self-roles", "get-roles", "role-select"] },
    ]},
    { key: "stream", name: "🔴 Stream", aliases: ["stream", "streams", "streaming", "twitch"], access: everyoneTalk, channels: [
      { key: "live", name: "🔴・live-now", kind: "text", topic: "Go-live alerts.", aliases: ["live-now", "going-live", "go-live", "stream-alerts", "live"], access: ro },
      { key: "clips", name: "🎬・clips", kind: "text", topic: "Stream clips and highlights. 5 ⭐ sends a post to hall-of-fame.", aliases: ["clips", "highlights", "clips-and-highlights", "stream-clips"] },
      { key: "hof", name: "⭐・hall-of-fame", kind: "text", topic: "The community's favorite moments.", aliases: ["hall-of-fame", "starboard", "best-of"], access: ro },
      { key: "polls", name: "💡・stream-ideas", kind: "text", topic: "Ideas and polls for the stream. Use /suggest.", aliases: ["stream-ideas", "suggestions", "ideas", "polls"] },
      { key: "giveaways", name: "🎁・giveaways", kind: "text", topic: "Giveaways. Tap the button to enter.", aliases: ["giveaways", "giveaway"], access: ro },
    ]},
    { key: "hangout", name: "💬 Hangout", aliases: ["hangout", "community", "general", "chat"], access: everyoneTalk, channels: [
      { key: "general", name: "💬・general", kind: "text", topic: "Main chat.", aliases: ["general", "general-chat", "chat", "lounge"] },
      { key: "memes", name: "😂・memes", kind: "text", topic: "Memes.", aliases: ["memes", "meme"] },
      { key: "media", name: "📸・media", kind: "text", topic: "Pets, setups, food, life.", aliases: ["media", "pics", "photos", "setups", "pets"] },
      { key: "lfg", name: "🎮・gaming", kind: "text", topic: "Game talk. Use !lfg to find a group.", aliases: ["gaming", "gaming-chat", "looking-for-group", "lfg"] },
      { key: "confess", name: "🤫・confessions", kind: "text", topic: "Anonymous confessions with /confess.", aliases: ["confessions", "confess", "anonymous"], access: ro },
      { key: "counting", name: "🔢・counting", kind: "text", topic: "Count up together, one number each.", aliases: ["counting", "count"] },
      { key: "botcmds", name: "🤖・bot-commands", kind: "text", topic: "/rank, /daily, /trivia, the shop. Mention Spartacus to chat.", aliases: ["bot-commands", "commands", "bots", "bot-spam"] },
    ]},
    { key: "mm", name: "⚔️ Matchmaking", aliases: ["matchmaking"], access: ro, channels: [
      { key: "mm-how", name: "📖・how-to-play", kind: "text", topic: "How Matchmaking works. Start here.", aliases: ["how-to-play", "matchmaking-guide"] },
      { key: "mm-board", name: "⚔️・matchmaking", kind: "text", topic: "Find matches, make a team, challenge others.", aliases: ["matchmaking", "start-matchmaking", "matchmaking-board"] },
      { key: "mm-threads", name: "📋・match-feed", kind: "text", topic: "Challenges and match threads.", aliases: ["match-feed", "matches", "match-threads", "match-results"] },
      { key: "mm-now", name: "🎮・playing-now", kind: "text", topic: "On right now? Tap I'm on now.", aliases: ["playing-now"] },
      { key: "mm-tournaments", name: "🏆・tournaments", kind: "text", topic: "Tournament sign-ups and brackets.", aliases: ["tournaments", "tournament"] },
      { key: "mm-leaderboard", name: "📊・leaderboard", kind: "text", topic: "Top players and teams.", aliases: ["leaderboard", "leaderboards"] },
      { key: "mm-lobby", name: "Matchmaking Lobby", kind: "voice", aliases: ["matchmaking-lobby", "lobby"], access: { see: "role", role: "mm", talk: true } },
    ]},
    { key: "rooms", name: "🎮 Match Rooms", aliases: ["match-rooms"], access: { see: "role", role: "mm", talk: true }, channels: [] },
    { key: "voice", name: "🔊 Voice", aliases: ["voice", "voice-channels", "vc"], access: everyoneTalk, channels: [
      { key: "vc-hang", name: "🔊 Hangout", kind: "voice", aliases: ["hangout", "general-vc", "general-voice", "chill", "lounge-vc"] },
      { key: "vc-watch", name: "📺 Watch Party", kind: "voice", aliases: ["watch-party", "watch-along", "stream-watch"] },
      { key: "vc-game", name: "🎮 Game Night", kind: "voice", aliases: ["game-night", "gaming-vc", "gaming-voice"] },
      { key: "squad", name: "➕ Create a VC", kind: "voice", aliases: ["create-a-vc", "create-vc", "join-to-create", "create-a-squad"] },
      { key: "afk", name: "💤 AFK", kind: "voice", aliases: ["afk"] },
    ]},
    { key: "supporters", name: "💎 Supporters", aliases: ["supporters", "subscribers", "subs", "vip"], access: supporters, channels: [
      { key: "sub-chat", name: "💎・supporter-chat", kind: "text", topic: "Thanks for supporting the stream!", aliases: ["supporter-chat", "sub-chat", "subscriber-chat", "vip-chat"] },
      { key: "sub-vc", name: "💎 Supporter Lounge", kind: "voice", aliases: ["supporter-lounge", "sub-lounge", "vip-lounge"] },
    ]},
    { key: "creators", name: "🎥 Creators", aliases: ["creators", "content-creators"], access: { see: "role", role: "creator", talk: true }, channels: [
      { key: "promo", name: "📣・self-promo", kind: "text", topic: "Share your streams and videos.", aliases: ["self-promo", "promo", "promotion", "self-promotion"] },
      { key: "collabs", name: "🤝・collabs", kind: "text", topic: "Find people to stream with.", aliases: ["collabs", "collab", "collaborations"] },
    ]},
    { key: "support", name: "🎫 Help", aliases: ["help", "support", "tickets"], access: ro, channels: [
      { key: "support", name: "🎫・support", kind: "text", topic: "Open a private ticket. You can also DM Spartacus.", aliases: ["support", "open-a-ticket", "tickets", "help"] },
      { key: "apply", name: "📝・apply", kind: "text", topic: "Apply for Moderator, VIP or Content Creator.", aliases: ["apply", "applications", "apply-here"] },
    ]},
    { key: "staff", name: "🛡️ Staff", aliases: ["mods", "staff", "moderators", "mod-only", "staff-only"], access: staffTalk, channels: [
      { key: "staff-chat", name: "🛡️・mod-chat", kind: "text", aliases: ["mod-chat", "staff-chat", "moderator-only", "staff"] },
      { key: "mod-log", name: "📜・mod-logs", kind: "text", topic: "Moderation actions, edits and deletes.", aliases: ["mod-logs", "mod-log", "logs", "audit-log"] },
      { key: "server-log", name: "👋・join-leave", kind: "text", topic: "Joins, leaves and security alerts.", aliases: ["join-leave", "hi-bye", "member-log", "server-log"] },
      { key: "reports", name: "🚩・reports", kind: "text", topic: "Member reports.", aliases: ["reports", "player-reports"] },
      { key: "staff-desk", name: "📨・applications", kind: "text", topic: "Applications and the weekly staff report.", aliases: ["applications-review", "staff-desk", "tickets-and-applications"] },
      { key: "transcripts", name: "🧾・transcripts", kind: "text", topic: "Saved copies of closed tickets.", aliases: ["transcripts", "ticket-logs"] },
      { key: "bot-status", name: "🟢・bot-status", kind: "text", aliases: ["bot-status", "spartacus", "status"] },
      { key: "staff-voice", name: "🔊 Staff Voice", kind: "voice", aliases: ["staff-voice", "staff-vc", "mod-vc"] },
    ]},
  ];
}

function streamingPickers(games: BlueprintGameId[]): BlueprintPicker[] {
  const picked = BLUEPRINT_GAMES.filter((g) => games.includes(g.id));
  return [
    { name: "🔔 Pick your pings", description: "Choose what you get pinged for.", options: [{ role: "ping:streams", label: "When the stream goes live", emoji: "🔴" }, { role: "ping:events", label: "Events", emoji: "📅" }, { role: "ping:giveaways", label: "Giveaways", emoji: "🎁" }, { role: "ping:gamenight", label: "Game nights", emoji: "🎮" }, { role: "ping:match", label: "Match Alerts", emoji: "🔔" }] },
    { name: "🎮 Pick your games", description: "Let people know what you play.", options: picked.map((g) => ({ role: `game:${g.id}`, label: g.name, emoji: g.emoji })) },
    { name: "✨ Extras", description: "Matchmaking lets you play in matches and tournaments; Content Creator opens 🎥 Creators.", options: [{ role: "mm", label: "Matchmaking", emoji: "⚔️" }, { role: "creator", label: "I stream too", emoji: "🎥" }] },
  ];
}

export const STREAMING_RULES = [
  "**1. Be kind.** No hate, harassment, slurs or drama from other places.",
  "**2. Keep it clean.** No NSFW, gore or shock content.",
  "**3. No spam.** Self-promo only in 📣・self-promo.",
  "**4. Respect the stream.** No spoilers, backseating when asked not to, or stream sniping.",
  "**5. Listen to the mods.** If you have a problem, open a ticket in 🎫・support.",
  "**6. Follow Discord's Terms of Service.**",
].join("\n");

export function blueprintTicketTypes(layout: BlueprintLayout = "gaming") {
  if (layout === "hq") return HQ_TICKET_TYPES;
  return layout === "streaming"
    ? [
        { name: "Get Help", emoji: "🙋", description: "Questions or problems with the server." },
        { name: "Report a Member", emoji: "🚩", description: "Report someone breaking the rules." },
        { name: "Partnership", emoji: "🤝", description: "Collabs, partnerships and business." },
      ]
    : BLUEPRINT_TICKET_TYPES;
}

export function blueprintApplications(layout: BlueprintLayout = "gaming") {
  if (layout === "hq") return HQ_APPLICATIONS;
  return layout === "streaming"
    ? [
        { name: "Moderator", emoji: "🛡️", description: "Help keep chat and the server running.", questions: ["How old are you?", "What timezone are you in?", "Why do you want to be a mod?", "Any moderation experience?"] },
        { name: "VIP", emoji: "⭐", description: "For regulars who are always around.", questions: ["How long have you been watching?", "What's your Twitch name?", "Why should you be a VIP?"] },
        { name: "Content Creator", emoji: "🎥", description: "Get the creator role, self-promo and go-live alerts.", questions: ["Link to your channel", "What do you stream or post?", "How often do you go live?"] },
      ]
    : BLUEPRINT_APPLICATIONS;
}

// ---- The Spartacus HQ layout (/hq-setup, or /server-setup layout: Spartacus HQ) ----
// One server for testing Spartacus and for OG Armory store support. New people see only
// 📌 Start Here. Onboarding asks what they want to see (each answer opens one section), their
// pings, and last, a required rules agreement (gives ✅ Member). 🎭・get-roles changes it later.
// The command starts fresh: it deletes every channel, category, role and onboarding question
// first (after a backup), then builds all of this.

const HQ_ROLES: BlueprintRole[] = [
  { key: "admin", name: "⚙️ Admin", color: 0xed4245, hoist: true, aliases: ["admins", "admin", "administrator"], perms: "admin-lite" },
  { key: "mod", name: "🛡️ Moderator", color: 0x5865f2, hoist: true, aliases: ["mods", "mod", "moderator", "moderators"], perms: "moderator" },
  { key: "support", name: "🎟️ Support Team", color: 0x3ba55d, hoist: true, aliases: ["support", "support-team", "helper", "helpers"], perms: "support" },
  { key: "tester", name: "🧪 Bot Tester", color: 0x3cc8ff, hoist: true, aliases: ["bot-tester", "tester", "testers", "beta-tester", "beta"] },
  { key: "buyer", name: "💎 Verified Buyer", color: 0xe7bb5f, hoist: true, aliases: ["verified-buyer", "buyer", "customer-verified", "og-supporter"] },
  { key: "member", name: "✅ Member", color: 0, aliases: ["member", "members", "verified", "community-member"] },
  { key: "customer", name: "🛒 Store Customer", color: 0, aliases: ["store-customer", "customer", "customers", "store"] },
  { key: "spartacus", name: "🤖 Spartacus User", color: 0, aliases: ["spartacus-user", "spartacus-users", "bot-user"] },
  { key: "ping:ann", name: "📢 Announcements", color: 0, aliases: ["announcements", "announcement-pings"] },
  { key: "ping:deals", name: "🛍️ Store Deals", color: 0, aliases: ["store-deals", "deals", "sales"] },
  { key: "ping:updates", name: "🔧 Spartacus Updates", color: 0, aliases: ["spartacus-updates", "bot-updates", "updates", "patch-notes"] },
  { key: "ping:status", name: "🟢 Status Alerts", color: 0, aliases: ["status-alerts", "status", "outages"] },
];

function hqCategories(): BlueprintCategory[] {
  const ro = readOnlyEveryone;
  const store: Access = { see: "roles", roles: ["customer", "buyer"], talk: true };
  const storeRead: Access = { see: "roles", roles: ["customer", "buyer"], talk: false };
  const sp: Access = { see: "role", role: "spartacus", talk: true };
  const lab: Access = { see: "role", role: "tester", talk: true };
  return [
    { key: "start", name: "📌 Start Here", aliases: ["start-here", "information-center", "welcome"], access: ro, channels: [
      { key: "rules", name: "📜・rules", kind: "text", topic: "Read the rules and agree to unlock the server.", aliases: ["rules", "server-rules"] },
      { key: "welcome", name: "👋・welcome", kind: "text", topic: "What's here and how to find your way around.", aliases: ["welcome", "welcomes", "start-here"] },
    ]},
    { key: "info", name: "📢 Information", aliases: ["information", "info", "news"], access: memberRead, channels: [
      { key: "announcements", name: "📢・announcements", kind: "announcement", topic: "News about Spartacus and the OG Armory.", aliases: ["announcements", "news"] },
      { key: "roles", name: "🎭・get-roles", kind: "text", topic: "Open or hide sections and choose your pings. Change it any time.", aliases: ["get-roles", "roles", "self-roles", "role-select", "pick-roles"] },
      { key: "bot-status", name: "🟢・status", kind: "text", topic: "Live status for Spartacus and the store.", aliases: ["status", "bot-status", "uptime"] },
    ]},
    { key: "community", name: "💬 Community", aliases: ["community", "general", "chat"], access: memberTalk, channels: [
      { key: "general", name: "💬・general", kind: "text", topic: "Chat about anything.", aliases: ["general", "general-chat", "chat", "lounge"] },
      { key: "botcmds", name: "🤖・bot-commands", kind: "text", topic: "Use Spartacus commands here: /store, /license, /rank and more.", aliases: ["bot-commands", "commands", "bots", "bot-spam"] },
    ]},
    { key: "store", name: "🛒 OG Armory Store", aliases: ["og-armory-store", "og-armory", "store", "shop"], access: store, channels: [
      { key: "store-news", name: "🛍️・store-news", kind: "text", topic: "New products, sales and drops from outpostgaming.netlify.app.", aliases: ["store-news", "deals", "drops", "shop-news"], access: storeRead },
      { key: "store-chat", name: "💬・store-chat", kind: "text", topic: "Talk about the bots, overlays and dashboards.", aliases: ["store-chat", "shop-chat"] },
      { key: "store-help", name: "❓・store-help", kind: "text", topic: "Quick questions about orders, keys and downloads. Anything private goes in a ticket.", aliases: ["store-help", "order-help", "shop-help"] },
      { key: "buyers", name: "💎・verified-buyers", kind: "text", topic: "For customers with a purchase. The store gives you the role automatically.", aliases: ["verified-buyers", "buyers", "customers-only"], access: { see: "role", role: "buyer", talk: true } },
    ]},
    { key: "spartacus", name: "🤖 Spartacus Help", aliases: ["spartacus-help", "spartacus", "bot-help"], access: sp, channels: [
      { key: "guides", name: "📖・guides", kind: "text", topic: "How to set up and use Spartacus in your server.", aliases: ["guides", "docs", "how-to"], access: { see: "role", role: "spartacus", talk: false } },
      { key: "sp-help", name: "❓・spartacus-help", kind: "text", topic: "Ask anything about setting up or using Spartacus.", aliases: ["spartacus-help", "bot-help", "help"] },
      { key: "requests", name: "💡・feature-requests", kind: "text", topic: "Ideas for new Spartacus features. Use /suggest.", aliases: ["feature-requests", "suggestions", "ideas"] },
    ]},
    { key: "lab", name: "🧪 Test Lab", aliases: ["test-lab", "testing", "beta"], access: lab, channels: [
      { key: "test-notes", name: "📋・what-to-test", kind: "text", topic: "What's new and what needs testing.", aliases: ["what-to-test", "test-notes", "changelog"], access: { see: "role", role: "tester", talk: false } },
      { key: "testing", name: "🧪・testing", kind: "text", topic: "Try commands and features here. Breaking things is the point.", aliases: ["testing", "test", "sandbox"] },
      { key: "bugs", name: "🐞・bug-reports", kind: "text", topic: "What you did, what happened, what you expected. Screenshots help.", aliases: ["bug-reports", "bugs", "issues"] },
      { key: "squad", name: "➕ Create a Test VC", kind: "voice", aliases: ["create-a-test-vc", "create-a-vc", "join-to-create"] },
    ]},
    { key: "support", name: "🎫 Support", aliases: ["support", "help-desk", "help"], access: memberRead, channels: [
      { key: "support", name: "🎫・open-a-ticket", kind: "text", topic: "Private help from the team: store orders, Spartacus, or anything else.", aliases: ["open-a-ticket", "support", "tickets", "create-ticket"] },
    ]},
    { key: "tickets", name: "🗂️ Open Tickets", aliases: ["open-tickets", "store-tickets", "tickets-open"], access: staffTalk, channels: [] },
    { key: "staff", name: "🛡️ Staff", aliases: ["staff", "mods", "moderators", "staff-only"], access: staffTalk, channels: [
      { key: "staff-chat", name: "🛡️・staff-chat", kind: "text", aliases: ["staff-chat", "mod-chat", "staff"] },
      { key: "store-alerts", name: "🛒・store-alerts", kind: "text", topic: "Orders, refunds, failed renewals and new ticket alerts from the OG Armory.", aliases: ["store-alerts", "order-log", "orders"] },
      { key: "mod-log", name: "📋・mod-log", kind: "text", topic: "Moderation actions, edits and deletes.", aliases: ["mod-log", "mod-logs", "logs"] },
      { key: "server-log", name: "📤・server-log", kind: "text", topic: "Joins, leaves, rules accepted and security alerts.", aliases: ["server-log", "join-leave", "member-log"] },
      { key: "staff-desk", name: "🧾・transcripts", kind: "text", topic: "Closed tickets, applications and the weekly report.", aliases: ["transcripts", "ticket-logs", "tickets-and-applications"] },
      { key: "staff-voice", name: "🔊 Staff Voice", kind: "voice", aliases: ["staff-voice", "staff-vc"] },
    ]},
  ];
}

const HQ_PICKERS: BlueprintPicker[] = [
  { name: "🧭 What do you want to see?", description: "Each one opens its own section. Tap again to hide it.", buttons: true, options: [
    { role: "customer", label: "Store & orders", emoji: "🛒" },
    { role: "spartacus", label: "Spartacus help", emoji: "🤖" },
    { role: "tester", label: "Test Lab", emoji: "🧪" },
  ]},
  { name: "🔔 Notifications", description: "Choose what you get pinged for.", buttons: true, options: [
    { role: "ping:ann", label: "Announcements", emoji: "📢" },
    { role: "ping:deals", label: "Store deals", emoji: "🛍️" },
    { role: "ping:updates", label: "Spartacus updates", emoji: "🔧" },
    { role: "ping:status", label: "Status alerts", emoji: "🟢" },
  ]},
];

// The rules agreement is the last question and required, so nobody gets in (or gets any
// section role) without agreeing. Discord hands out every answer's roles at the end.
const HQ_ONBOARDING: BlueprintOnboardingPrompt[] = [
  { title: "What are you here for?", singleSelect: false, required: true, options: [
    { role: "customer", channels: ["store-news", "store-chat", "store-help"], label: "Help with a store order", emoji: "🛒", description: "Orders, license keys, downloads and billing" },
    { role: "spartacus", channels: ["guides", "sp-help", "requests"], label: "Help using Spartacus", emoji: "🤖", description: "Setting it up and using it in your server" },
    { role: "tester", channels: ["test-notes", "testing", "bugs"], label: "Testing new Spartacus features", emoji: "🧪", description: "Try things early and report bugs" },
    { role: "ping:ann", channels: ["announcements"], label: "Just news and updates", emoji: "📢", description: "Announcements only" },
  ]},
  { title: "What should we ping you for?", singleSelect: false, options: HQ_PICKERS[1].options },
  { title: "Last step: do you agree to the server rules?", singleSelect: true, required: true, options: [
    { role: "member", channels: ["rules", "announcements", "roles", "general", "botcmds", "support"], label: "I've read the rules and I agree", emoji: "✅", description: "Required to join. Read #📜・rules first" },
  ]},
];

export const HQ_RULES = [
  "**1. Be respectful.** No harassment, hate or slurs, toward members or staff.",
  "**2. Keep private things private.** Never post license keys, order numbers, emails or payment details in public channels. Open a ticket instead.",
  "**3. Use the right place.** Store questions in 🛒 OG Armory Store, bot questions in 🤖 Spartacus Help, testing in 🧪 Test Lab.",
  "**4. No spam or self-promo.** No unsolicited DMs or ads.",
  "**5. Report bugs, don't abuse them.** Found an exploit in Spartacus or the store? Report it in 🐞・bug-reports or a ticket.",
  "**6. Staff decisions are final.** Disagree? Open a ticket, calmly.",
  "**7. Follow Discord's Terms of Service.**",
  "",
  "Tap **I Agree** below to unlock the server.",
].join("\n");

// The 👋・welcome guide: one message that maps the whole server.
export const HQ_GUIDE = {
  title: "👋 Welcome to Spartacus HQ",
  description: "The home of the **Spartacus** bot and the **OG Armory** store. Here's how it's laid out. You only see the sections you picked; change them any time in 🎭・get-roles.",
  fields: [
    { name: "📢 Information", value: "Announcements, your roles and live status." },
    { name: "💬 Community", value: "General chat and a channel for bot commands." },
    { name: "🛒 OG Armory Store", value: "Store news, chat and quick order questions. Buyers get 💎・verified-buyers automatically." },
    { name: "🤖 Spartacus Help", value: "Guides, help with your setup, and feature requests." },
    { name: "🧪 Test Lab", value: "Try new features early and report bugs." },
    { name: "🎫 Support", value: "Private tickets for orders, keys, billing, Spartacus or anything else. Store tickets opened on the website show up here too." },
  ],
};

export const HQ_TEST_GUIDE = {
  title: "🧪 How testing works",
  description: [
    "1. Check this channel for what's new and what needs testing.",
    "2. Try it in 🧪・testing. Use commands, click buttons, try to break it.",
    "3. Found something? Post in 🐞・bug-reports: **what you did**, **what happened**, **what you expected**, and a screenshot.",
    "4. Security problems or anything with real orders go in a ticket, not in public.",
  ].join("\n"),
};

const HQ_TICKET_TYPES = [
  { name: "Store Order Help", emoji: "🛒", description: "Orders, license keys, downloads, roles and billing." },
  { name: "Spartacus Help", emoji: "🤖", description: "Setting up or using Spartacus in your server." },
  { name: "Report a Bug", emoji: "🐞", description: "Something in Spartacus or the store isn't working." },
  { name: "Something Else", emoji: "🙋", description: "Anything else for the team." },
];

const HQ_APPLICATIONS = [
  { name: "Support Team", emoji: "🎟️", description: "Help customers with orders and Spartacus questions.", questions: ["How old are you?", "What timezone are you in?", "Why do you want to help with support?", "Any support or moderation experience?"] },
  { name: "Bot Tester", emoji: "🧪", description: "Get early access to new Spartacus features.", questions: ["Do you run a Discord server? Which one?", "What Spartacus features do you use most?", "How much time can you give to testing each week?"] },
];
