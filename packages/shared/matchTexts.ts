// Everything Matchmaking says in Discord, with the default wording. The bot and
// the Messages tab both read this list, so the preview always matches Discord.
export interface TextField {
  name: string;
  value: string;
  inline: boolean;
}

export interface TextOverride {
  title?: string;
  description?: string;
  footer?: string;
  color?: string;
  text?: string;
  url?: string;
  authorName?: string;
  authorIcon?: string;
  thumbnail?: string;
  image?: string;
  footerIcon?: string;
  timestamp?: boolean;
  fields?: TextField[];
}
export type TextOverrides = Record<string, TextOverride>;
export type GameTextOverrides = Record<string, TextOverrides>;

export interface ResolvedText {
  title: string;
  description: string;
  footer: string;
  color: string;
  text: string;
  url: string;
  authorName: string;
  authorIcon: string;
  thumbnail: string;
  image: string;
  footerIcon: string;
  timestamp: boolean;
  fields: TextField[];
}

export interface MatchTextEntry {
  group: string;
  label: string;
  hint: string;
  defaults: TextOverride;
  tokens: Record<string, string>; // token to example value
  global?: boolean; // shared by every game, so it can't differ per game
  previewFields?: Array<{ name: string; value: string }>; // what the bot adds below, for the preview
}

const GOLD = "#F0B232";
const STEEL = "#7B99BC";
const GREEN = "#3BA55D";

const gameTokens = { game: "Rainbow Six Siege", setup: "Friday Night 5v5", number: "12" };
const samplePlayers = "🥇 Kuro: 12W 3L · 80%\n🥈 FrostByte: 10W 4L · 71%\n🥉 Deimos: 9W 5L · 64%";
const sampleTeams = "🥇 Night Crew: 7W 1L · 88%\n🥈 Red Line: 5W 3L · 63%";
const countTokens = { progress: "🟩🟩🟩⬛⬛", count: "6", needed: "10" };
const signupTokens = { ...gameTokens, ...countTokens, size: "5v5", start: "Starts when staff start it.", startTime: "Friday, November 6 at 10:00 PM (in 6 days)", format: "Tournament · Single Elimination", teams: "Up to 4 teams · Up to 5 per team", maps: "Player vote on 3 maps", signedUp: "**6** signed up", eventLink: "[View event](https://discord.com)" };
const signupPlayers = [{ name: "Players", value: "Nobody yet. Be the first!" }];
const signupRows = [
  { name: "📅 Starts", value: "{startTime}\n{eventLink}", inline: false },
  { name: "🎮 Format", value: "{format}", inline: true },
  { name: "👥 Teams", value: "{teams}", inline: true },
  { name: "🗺️ Maps", value: "{maps}", inline: true },
  { name: "📣 Sign-Ups", value: "{signedUp}", inline: true },
];
const matchTokens = { ...gameTokens, onMap: " on Bank", mapWord: "Map" };

const embed = (group: string, label: string, hint: string, defaults: TextOverride, tokens: Record<string, string> = {}): MatchTextEntry => ({ group, label, hint, defaults, tokens });
const line = (group: string, label: string, hint: string, text: string, tokens: Record<string, string> = {}): MatchTextEntry => ({ group, label, hint, defaults: { text }, tokens });
const buttonLabel = (label: string, hint: string, global = false): MatchTextEntry => ({ group: "Buttons", label, hint, defaults: { text: label }, tokens: {}, global });
const note = (label: string, hint: string, text: string, tokens: Record<string, string> = {}, global = false): MatchTextEntry => ({ group: "Labels and Notes", label, hint, defaults: { text }, tokens, global });

export const MATCH_TEXTS = {
  boardSolo: { ...embed("Matchmaking", "1v1 board", "The 1v1 half of the always-open board.", { title: "⚔️ 1v1 Matchmaking", description: "Find an opponent or challenge someone. Spartacus sets up the match right away.", color: STEEL }), global: true },
  boardTeam: { ...embed("Matchmaking", "Team board", "The team half of the always-open board.", { title: "👥 Team Matchmaking", description: "Create a team once, then queue or challenge any time.", footer: "{live} live now · Open all day", color: GOLD }, { live: "3 matches" }), global: true },
  boardTeamList: {
    ...embed("Matchmaking", "Teams list", "The third part of the always-open board: every team and who's on it.", { title: "🛡️ Teams", description: "Every team and who's on it. Captains manage theirs from My Teams.", color: STEEL }),
    previewFields: [{ name: "Night Crew · Rainbow Six Siege (2/5)", value: "👑 @Kuro\n👤 @FrostByte" }],
    global: true,
  },
  room: embed("Matchmaking", "Match room", "The card posted in each match thread.", { title: "🔴 LIVE: {a} vs {b}", description: "{game}{onMap}", footer: "One side reports, the other confirms", color: GREEN }, { a: "Kuro", b: "FrostByte", game: "Rainbow Six Siege", onMap: " on Bank" }),
  challenge: line("Matchmaking", "Challenge ping", "Sent to the player or team being challenged.", "{target} {from} challenged you to {game}. This expires {expires}.", { target: "@Kuro", from: "@FrostByte", game: "Rainbow Six Siege", expires: "in 5 minutes" }),
  roomWon: line("Matchmaking", "Match finished", "Posted in the thread when a match ends.", "🏆 **{winner}** won {score}. This match is closed.", { winner: "Kuro", score: "4-2" }),
  roomCanceled: line("Matchmaking", "Match canceled", "Posted in the thread when a match is canceled.", "This match was canceled and nothing was recorded."),

  boardCombined: { ...embed("Leaderboard", "One Clean Post", "Each game's post in the One Clean Post style.", { title: "🏆 {game}", footer: "Updates after every match", color: GOLD }, { game: "Rainbow Six Siege" }), previewFields: [{ name: "🏅 Top 10 Players", value: samplePlayers }, { name: "👥 Top 10 Teams", value: sampleTeams }] },
  boardPlayers: embed("Leaderboard", "Separate: top 10 players", "The player embed in the Separate Embeds style.", { title: "🏅 Top 10 Players: {game}", description: "{list}", footer: "Updates after every match", color: GOLD }, { game: "Rainbow Six Siege", list: samplePlayers }),
  boardTeams: embed("Leaderboard", "Separate: top 10 teams", "The team embed in the Separate Embeds style.", { title: "👥 Top 10 Teams: {game}", description: "{list}", footer: "Saved and named teams · Updates after every match", color: STEEL }, { game: "Rainbow Six Siege", list: sampleTeams }),

  signup: { ...embed("Sign-Ups", "Match sign-ups", "The panel while a match or 1v1 is open.", { title: "⚔️ Match #{number}: {size} {game} Sign-Ups", description: "Sign up below to play **{game}**.", fields: signupRows, color: STEEL }, signupTokens), previewFields: signupPlayers },
  registration: { ...embed("Sign-Ups", "Tournament registration", "The panel while a tournament is open.", { title: "🏆 {setup}", description: "Register below to play **{game}**.", fields: signupRows, color: GOLD }, signupTokens), previewFields: signupPlayers },
  noteManual: line("Sign-Ups", "Start note: staff", "Fills in {start} when staff start it.", "Starts when staff start it."),
  noteFull: line("Sign-Ups", "Start note: when full", "Fills in {start} when it starts on a full lobby.", "Starts when the lobby fills."),
  noteTime: line("Sign-Ups", "Start note: set time", "Fills in {start} for a scheduled start.", "Starts {time}.", { time: "Saturday at 8:00 PM" }),
  noteHidden: line("Sign-Ups", "Hidden rosters note", "Added while rosters are hidden.", "🔒 Rosters stay hidden until registration closes."),
  pingFull: line("Sign-Ups", "Lobby full ping", "Sent when the lobby fills.", "The lobby is full."),

  checkin: embed("Match Steps", "Check-in", "Shown when players ready up.", { title: "✅ Lobby Full: Check In", description: "{deadline}\n{progress} **{count}/{needed}** ready", color: GOLD }, { ...countTokens, deadline: "Ready up to continue. Staff can skip this." }),
  draft: embed("Match Steps", "Captains draft", "Shown while captains pick players.", { title: "🎯 Match #{number}: Captains Draft", description: "{captain} is picking.", color: STEEL }, { ...gameTokens, captain: "@Kuro" }),
  teams: embed("Match Steps", "Teams", "Shown once teams are made.", { title: "🎯 Match #{number}: Teams", description: "Captains can start when both sides are ready.{auto}", footer: "Captains are marked with 👑", color: STEEL }, { ...gameTokens, auto: " Waiting for a captain or staff to start." }),
  nameTeams: embed("Match Steps", "Name your teams", "Shown when tournament captains pick team names.", { title: "🏆 {setup}: Name Your Teams", description: "Captains can name their team.{auto}", footer: "Captains are marked with 👑", color: STEEL }, { ...gameTokens, auto: " Waiting for a captain or staff to start." }),
  vote: embed("Match Steps", "Map vote", "Shown during a player vote.", { title: "🗺️ Vote for the {mapWord}", description: "{deadline}", color: STEEL }, { ...matchTokens, deadline: "Voting stays open until everyone votes or staff end it." }),
  bans: embed("Match Steps", "Captain bans", "Shown while captains ban maps.", { title: "🚫 Captains Ban {mapWord}s", description: "{captain} bans next.{banned}", footer: "The last one left gets played", color: STEEL }, { ...matchTokens, captain: "@Kuro", banned: "" }),
  live: embed("Match Steps", "Live match", "Shown while a match is being played.", { title: "🔴 LIVE: {match}{onMap}", description: "{mapNote}", footer: "{reportRule}", color: GREEN }, { ...matchTokens, match: "Match #12", mapNote: "Map pick: Bank 6 · Oregon 4", reportRule: "One captain reports, the other confirms" }),
  done: embed("Match Steps", "Match finished", "Shown after a match ends.", { title: "🏆 {winner} wins {score}{onMap}", description: "{rewards}", color: GOLD }, { ...matchTokens, winner: "Team Blue", score: "4-2", rewards: "Leaderboard updated." }),
  champion: embed("Match Steps", "Tournament champion", "Shown when a tournament ends.", { title: "🏆 {winner} won {setup}!", description: "{players}", color: GOLD }, { ...gameTokens, winner: "Night Crew", players: "@Kuro @FrostByte" }),

  result: embed("Results", "Match result", "Posted in the results channel.", { title: "Match #{number}: {winner} won {score}", description: "{details}", color: GOLD }, { number: "12", winner: "Team Blue", score: "4-2", details: "Map: Bank · Rounds" }),
  rosters: embed("Results", "Rosters revealed", "Posted when hidden rosters are shown.", { title: "🔓 Rosters Revealed", description: "Registration closed.", color: STEEL }),
  bracket: embed("Results", "Bracket", "The tournament bracket post.", { title: "🏆 {setup} Bracket", color: GOLD }, { setup: "Siege Cup" }),
  stats: embed("Results", "My Stats", "The private stats reply.", { title: "🎖️ Your {game} Stats", color: STEEL }, { game: "Rainbow Six Siege" }),

  pingCheckIn: line("Pings", "Check-in ping", "Sent when check-in starts.", "{players} Lobby is full. Check in on the panel.", { players: "@Kuro @FrostByte" }),
  pingReveal: line("Pings", "Rosters revealed ping", "Sent when registration closes.", "Registration closed. Rosters are revealed."),
  matchRoomWelcome: embed("Match Rooms", "Match room welcome", "The first post in a match's text channel. Teams appear below it.", { title: "⚔️ Match {number}: {a} vs {b}", description: "This channel is for this match only. Use the buttons here to play.", color: STEEL }, { ...gameTokens, number: "1", a: "Night Crew", b: "Red Line" }),
  matchRoomReady: embed("Match Rooms", "Ready to start", "Shown in the match room until the match starts.", { title: "Ready?", description: "Join your team's voice channel. A captain or staff starts {next}.{auto}", color: STEEL }, { ...gameTokens, next: "the map vote", auto: "" }),
  matchRoomClosing: embed("Match Rooms", "Room closing", "Shown in the match room once the result is saved.", { title: "🏆 {winner} won {score}", description: "Saved to the results channel and leaderboard. This channel and its voice channels close {time}.", color: GOLD }, { ...gameTokens, winner: "Night Crew", score: "4-2", time: "in 60 seconds" }),
  matchRoomNotice: embed("Match Rooms", "Panel during a match", "The main panel while a match plays in its room.", { title: "🏆 {setup}", description: "🔴 **{match}** is being played in {room}.", color: GOLD }, { ...gameTokens, match: "Night Crew vs Red Line", room: "#match-1-night-crew-vs-red-line" }),
  matchRoomNoticeDone: embed("Match Rooms", "Panel after a match", "The main panel while a finished match's room closes.", { title: "🏆 {setup}", description: "**{winner}** won {score}.{next}", color: GOLD }, { ...gameTokens, winner: "Night Crew", score: "4-2", next: " The next match opens when this room closes." }),
  pingVoice: line("Pings", "Join voice ping", "Sent to players who weren't in voice.", "{players} Your match started. Join {channel}.", { players: "@Kuro", channel: "#Kuro vs FrostByte" }),

  btnSignUp: buttonLabel("Sign Up", "On match sign-ups."),
  btnRegister: buttonLabel("Register", "On tournament registration."),
  btnLeave: buttonLabel("Leave", "On sign-ups."),
  btnMyTeam: buttonLabel("My Team", "On team sign-ups."),
  btnReady: buttonLabel("Ready Up", "During check-in."),
  btnStart: buttonLabel("Start Match", "Once teams are set."),
  btnStartVote: buttonLabel("Start Map Vote", "In a match room, when the map is voted on."),
  btnNameTeam: buttonLabel("Name Team", "When captains name teams."),
  btnConfirm: buttonLabel("Confirm", "When a result needs confirming."),
  btnDispute: buttonLabel("Dispute", "When a result needs confirming."),
  btnRunBack: buttonLabel("Run It Back", "After a match."),
  btnNewSignups: buttonLabel("New Sign-Ups", "After a match."),
  btnNewTournament: buttonLabel("Start New Tournament", "After a tournament."),
  btnSubs: buttonLabel("Subs", "On the panel."),
  btnStats: buttonLabel("My Stats", "On the panel."),
  btnLeaderboard: buttonLabel("Leaderboard", "On the panel."),
  btnResults: buttonLabel("All Results", "On the panel."),
  btnStaff: buttonLabel("Staff", "On the panel."),
  btnFindSolo: buttonLabel("1v1: Find a Match", "On the Matchmaking board.", true),
  btnChallengeSolo: buttonLabel("1v1: Challenge a Player", "On the Matchmaking board.", true),
  btnLeaveSolo: buttonLabel("Leave 1v1 Queue", "On the Matchmaking board.", true),
  btnFindTeam: buttonLabel("Teams: Find a Match", "On the Matchmaking board.", true),
  btnChallengeTeam: buttonLabel("Teams: Challenge a Team", "On the Matchmaking board.", true),
  btnLeaveTeam: buttonLabel("Leave Team Queue", "On the Matchmaking board.", true),
  btnCreateTeam: buttonLabel("Create a Team", "On the Matchmaking board.", true),
  btnMyTeams: buttonLabel("My Teams", "On the Matchmaking board.", true),
  btnLookingForTeam: buttonLabel("Looking for a Team", "On the Matchmaking board. Tap again to come off the list.", true),
  btnPickup: buttonLabel("Start Pickup Match", "On the Matchmaking board. Picks players from voice and the Looking for a Team list, makes two teams and starts now.", true),
  btnAccept: buttonLabel("Accept", "On challenges."),
  btnDecline: buttonLabel("Decline", "On challenges."),

  labelTopPlayers: note("Top players heading", "In the One Clean Post leaderboard.", "🏅 Top 10 Players"),
  labelTopTeams: note("Top teams heading", "In the One Clean Post leaderboard.", "👥 Top 10 Teams"),
  labelNoPlayers: note("No matches yet", "When a leaderboard has no players.", "No matches played yet."),
  labelNoTeams: note("No team matches yet", "When a leaderboard has no teams.", "No team matches played yet."),
  labelPlayers: note("Players heading", "Above the sign-up list.", "Players"),
  labelNoSignups: note("No sign-ups yet", "In the player list before anyone joins.", "Nobody yet. Be the first!"),
  labelPicking: note("Draft heading", "Above players still to pick.", "Still to pick"),
  labelConfirm: note("Confirmation heading", "Above a reported score.", "Waiting for confirmation"),
  labelSubs: note("Subs heading", "When a sub is needed.", "Subs needed"),
  labelSubsNote: note("Subs note", "Under the subs heading.", "{count} open. Tap Subs to jump in.", { count: "1" }),
  labelWaiting: note("1v1 queue heading", "On the Matchmaking board.", "Waiting ({count})", { count: "2" }, true),
  labelTeamsWaiting: note("Team queue heading", "On the Matchmaking board.", "Teams waiting ({count})", { count: "1" }, true),
  labelLookingForTeam: note("Looking for a team heading", "In the Teams list.", "Looking for a team ({count})", { count: "2" }, true),
  labelNoTeamsYet: note("No teams yet", "In the Teams list before anyone makes one.", "No teams yet. Tap Create a Team to start one.", {}, true),
  labelMultiTeam: note("On more than one team heading", "In the Teams list.", "On more than one team", {}, true),
  noteCheckinOpen: note("Check-in with no timer", "Fills in {deadline}.", "Ready up to continue. Staff can skip this."),
  noteCheckinTimed: note("Check-in with a timer", "Fills in {deadline}.", "Ready up {time} or your slot opens for the next player.", { time: "in 2 minutes" }),
  noteVoteOpen: note("Vote with no timer", "Fills in {deadline}.", "Voting stays open until everyone votes or staff end it."),
  noteVoteTimed: note("Vote with a timer", "Fills in {deadline}.", "Voting closes {time}. Ties are picked at random.", { time: "in 1 minute" }),
  noteTeamsWait: note("Teams with no timer", "Fills in {auto}.", " Waiting for a captain or staff to start."),
  noteTeamsAuto: note("Teams with a timer", "Fills in {auto}.", " Starts by itself {time}.", { time: "in 2 minutes" }),
  noteDone: note("Finished, no rewards", "Fills in {rewards}.", "Leaderboard updated."),
  noteDoneRewards: note("Finished, with rewards", "Fills in {rewards}.", "+{win} coins to the winners, +{loss} to the other team. Leaderboard updated.", { win: "100", loss: "25" }),
  roundFinal: note("Final", "Bracket round name.", "Final"),
  roundSemi: note("Semifinals", "Bracket round name.", "Semifinals"),
  roundQuarter: note("Quarterfinals", "Bracket round name.", "Quarterfinals"),
  roundOf: note("Early rounds", "Bracket round name.", "Round of {teams}", { teams: "16" }),
} satisfies Record<string, MatchTextEntry>;

export type MatchTextKey = keyof typeof MATCH_TEXTS;

export const MATCH_TEXT_GROUPS = ["Matchmaking", "Leaderboard", "Sign-Ups", "Match Steps", "Match Rooms", "Results", "Pings", "Buttons", "Labels and Notes"];

export function fillText(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => (key in values ? String(values[key] ?? "") : whole));
}

// Gives each game its own steady color, so posts are easy to tell apart.
const GAME_COLORS = ["#F0B232", "#5865F2", "#3BA55D", "#ED4245", "#EB459E", "#1ABC9C", "#E67E22", "#9B59B6", "#3498DB", "#2ECC71"];
export function gameColor(game: string): string {
  if (game === "ALL") return GOLD;
  let hash = 0;
  for (const letter of game) hash = (hash * 31 + letter.charCodeAt(0)) % 9973;
  return GAME_COLORS[hash % GAME_COLORS.length];
}

// A game's edits sit on top of All Games, one box at a time.
export function textsForGame(all: unknown, byGame: unknown, game: string | null | undefined): TextOverrides {
  const base = (all && typeof all === "object" ? all : {}) as TextOverrides;
  const games = (byGame && typeof byGame === "object" ? byGame : {}) as GameTextOverrides;
  const own = game ? games[game] ?? {} : {};
  const merged: TextOverrides = { ...base };
  for (const [key, value] of Object.entries(own)) merged[key] = { ...base[key], ...value };
  return merged;
}

// A blank custom box hides that part, except on buttons and lines, which can't be empty.
export function resolveText(overrides: unknown, key: MatchTextKey, values: Record<string, string | number | null | undefined> = {}): ResolvedText {
  const entry: MatchTextEntry = MATCH_TEXTS[key];
  const custom = (overrides && typeof overrides === "object" ? (overrides as TextOverrides)[key] : undefined) ?? {};
  const fill = (text: string) => fillText(text, values).trim();
  const pick = (field: "title" | "description" | "footer") => fill(custom[field] ?? entry.defaults[field] ?? "");
  return {
    title: pick("title"),
    description: pick("description"),
    footer: pick("footer"),
    color: custom.color || entry.defaults.color || STEEL,
    text: fillText(custom.text?.trim() || entry.defaults.text || "", values),
    url: custom.url ?? "",
    authorName: fill(custom.authorName ?? ""),
    authorIcon: custom.authorIcon ?? "",
    thumbnail: custom.thumbnail ?? "",
    image: custom.image ?? "",
    footerIcon: custom.footerIcon ?? "",
    timestamp: custom.timestamp ?? false,
    fields: (custom.fields ?? entry.defaults.fields ?? []).map((f) => ({ name: fill(f.name), value: fill(f.value), inline: f.inline })).filter((f) => f.name && f.value),
  };
}

const webLink = (value: unknown) => (typeof value === "string" && /^https?:\/\/\S+$/.test(value.trim()) ? value.trim().slice(0, 500) : "");

export function cleanOverrides(raw: unknown): TextOverrides {
  const out: TextOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, TextOverride>)) {
    if (!(key in MATCH_TEXTS) || !value || typeof value !== "object") continue;
    const item: TextOverride = {};
    if (typeof value.title === "string") item.title = value.title.slice(0, 256);
    if (typeof value.description === "string") item.description = value.description.slice(0, 4000);
    if (typeof value.footer === "string") item.footer = value.footer.slice(0, 2000);
    if (typeof value.text === "string") item.text = value.text.slice(0, key.startsWith("btn") ? 60 : 1500);
    if (typeof value.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color)) item.color = value.color;
    if (typeof value.authorName === "string") item.authorName = value.authorName.slice(0, 256);
    for (const link of ["url", "authorIcon", "thumbnail", "image", "footerIcon"] as const) if (value[link] !== undefined) item[link] = webLink(value[link]);
    if (typeof value.timestamp === "boolean") item.timestamp = value.timestamp;
    if (Array.isArray(value.fields)) item.fields = value.fields.slice(0, 10).map((f) => ({ name: String(f?.name ?? "").slice(0, 256), value: String(f?.value ?? "").slice(0, 1024), inline: Boolean(f?.inline) }));
    if (Object.keys(item).length) out[key] = item;
  }
  return out;
}

export function cleanGameOverrides(raw: unknown): GameTextOverrides {
  const out: GameTextOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [game, value] of Object.entries(raw as Record<string, unknown>)) {
    const cleaned = cleanOverrides(value);
    if (Object.keys(cleaned).length) out[game.slice(0, 80)] = cleaned;
  }
  return out;
}
