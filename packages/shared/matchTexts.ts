// Everything Matchmaking says in Discord, with the default wording. The bot and
// the Messages tab both read this list, so the preview always matches Discord.
export interface TextOverride {
  title?: string;
  description?: string;
  footer?: string;
  color?: string;
  text?: string;
}
export type TextOverrides = Record<string, TextOverride>;

export interface MatchTextEntry {
  group: string;
  label: string;
  hint: string;
  defaults: TextOverride;
  tokens: Record<string, string>; // token to example value
}

const GOLD = "#F0B232";
const STEEL = "#7B99BC";
const GREEN = "#3BA55D";

const gameTokens = { game: "Rainbow Six Siege", setup: "Friday Night 5v5", number: "12" };
const countTokens = { progress: "🟩🟩🟩⬛⬛", count: "6", needed: "10" };
const signupTokens = { ...gameTokens, ...countTokens, size: "5v5", start: "Starts when staff start it." };
const matchTokens = { ...gameTokens, onMap: " on Bank", mapWord: "Map" };

const embed = (group: string, label: string, hint: string, defaults: TextOverride, tokens: Record<string, string> = {}): MatchTextEntry => ({ group, label, hint, defaults, tokens });
const line = (group: string, label: string, hint: string, text: string, tokens: Record<string, string> = {}): MatchTextEntry => ({ group, label, hint, defaults: { text }, tokens });
const buttonLabel = (label: string, hint: string): MatchTextEntry => ({ group: "Buttons", label, hint, defaults: { text: label }, tokens: {} });

export const MATCH_TEXTS = {
  boardSolo: embed("Matchmaking", "1v1 board", "The 1v1 half of the always-open board.", { title: "⚔️ 1v1 Matchmaking", description: "Find an opponent or challenge someone. Spartacus sets up the match right away.", color: STEEL }),
  boardTeam: embed("Matchmaking", "Team board", "The team half of the always-open board.", { title: "👥 Team Matchmaking", description: "Create a team once, then queue or challenge any time.", footer: "{live} live now · Open all day", color: GOLD }, { live: "3 matches" }),
  room: embed("Matchmaking", "Match room", "The card posted in each match thread.", { title: "🔴 LIVE: {a} vs {b}", description: "{game}{onMap}", footer: "One side reports, the other confirms", color: GREEN }, { a: "Kuro", b: "FrostByte", game: "Rainbow Six Siege", onMap: " on Bank" }),
  challenge: line("Matchmaking", "Challenge ping", "Sent to the player or team being challenged.", "{target} {from} challenged you to {game}. This expires {expires}.", { target: "@Kuro", from: "@FrostByte", game: "Rainbow Six Siege", expires: "in 5 minutes" }),
  roomWon: line("Matchmaking", "Match finished", "Posted in the thread when a match ends.", "🏆 **{winner}** won {score}. This match is closed.", { winner: "Kuro", score: "4-2" }),
  roomCanceled: line("Matchmaking", "Match canceled", "Posted in the thread when a match is canceled.", "This match was canceled and nothing was recorded."),

  boardPlayers: embed("Leaderboard", "Top 10 players", "The player leaderboard embed.", { title: "🏅 Top 10 Players: {game}", footer: "Updates after every match", color: GOLD }, { game: "All Games" }),
  boardTeams: embed("Leaderboard", "Top 10 teams", "The team leaderboard embed.", { title: "👥 Top 10 Teams: {game}", footer: "Saved and named teams · Updates after every match", color: STEEL }, { game: "All Games" }),

  signup: embed("Sign-Ups", "Match sign-ups", "The panel while a match or 1v1 is open.", { title: "⚔️ Match #{number}: {size} {game} Sign-Ups", description: "{start}\n{progress} **{count}/{needed}**", color: STEEL }, signupTokens),
  registration: embed("Sign-Ups", "Tournament registration", "The panel while a tournament is open.", { title: "🏆 {setup}: Registration", description: "{start}\n{progress} **{count}/{needed}**", color: STEEL }, signupTokens),
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
  pingVoice: line("Pings", "Join voice ping", "Sent to players who weren't in voice.", "{players} Your match started. Join {channel}.", { players: "@Kuro", channel: "#Kuro vs FrostByte" }),

  btnSignUp: buttonLabel("Sign Up", "On match sign-ups."),
  btnRegister: buttonLabel("Register", "On tournament registration."),
  btnLeave: buttonLabel("Leave", "On sign-ups."),
  btnMyTeam: buttonLabel("My Team", "On team sign-ups."),
  btnReady: buttonLabel("Ready Up", "During check-in."),
  btnStart: buttonLabel("Start Match", "Once teams are set."),
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
  btnFindSolo: buttonLabel("1v1: Find a Match", "On the Matchmaking board."),
  btnChallengeSolo: buttonLabel("1v1: Challenge a Player", "On the Matchmaking board."),
  btnLeaveSolo: buttonLabel("Leave 1v1 Queue", "On the Matchmaking board."),
  btnFindTeam: buttonLabel("Teams: Find a Match", "On the Matchmaking board."),
  btnChallengeTeam: buttonLabel("Teams: Challenge a Team", "On the Matchmaking board."),
  btnLeaveTeam: buttonLabel("Leave Team Queue", "On the Matchmaking board."),
  btnCreateTeam: buttonLabel("Create a Team", "On the Matchmaking board."),
  btnMyTeams: buttonLabel("My Teams", "On the Matchmaking board."),
  btnAccept: buttonLabel("Accept", "On challenges."),
  btnDecline: buttonLabel("Decline", "On challenges."),
} satisfies Record<string, MatchTextEntry>;

export type MatchTextKey = keyof typeof MATCH_TEXTS;

export const MATCH_TEXT_GROUPS = ["Matchmaking", "Leaderboard", "Sign-Ups", "Match Steps", "Results", "Pings", "Buttons"];

export function fillText(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => (key in values ? String(values[key] ?? "") : whole));
}

// A blank custom box hides that part, except on buttons and lines, which can't be empty.
export function resolveText(overrides: unknown, key: MatchTextKey, values: Record<string, string | number | null | undefined> = {}): Required<TextOverride> {
  const entry: MatchTextEntry = MATCH_TEXTS[key];
  const custom = (overrides && typeof overrides === "object" ? (overrides as TextOverrides)[key] : undefined) ?? {};
  const pick = (field: "title" | "description" | "footer") => fillText(custom[field] ?? entry.defaults[field] ?? "", values).trim();
  return {
    title: pick("title"),
    description: pick("description"),
    footer: pick("footer"),
    color: custom.color || entry.defaults.color || STEEL,
    text: fillText(custom.text?.trim() || entry.defaults.text || "", values),
  };
}

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
    if (Object.keys(item).length) out[key] = item;
  }
  return out;
}
