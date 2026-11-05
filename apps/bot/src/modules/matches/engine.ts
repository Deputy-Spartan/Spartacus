// The match rules with no Discord or database in them: splitting teams,
// picking maps and counting votes. flow.ts runs these and
// handles everything that actually touches Discord.

export type Side = "a" | "b";

export interface MatchTeam {
  name: string;
  players: string[];
  captain: string;
}

export interface MatchReport {
  winner: Side;
  winnerScore: number;
  loserScore: number;
  by: string;
}

export interface MatchState {
  signups: string[];
  ready: string[];
  teams: MatchTeam[];
  draftPool: string[];
  draftPick: number;
  mapOptions: string[];
  votes: Record<string, string>;
  banned: string[];
  banTurn: Side;
  map: string | null;
  mapNote: string | null;
  report: MatchReport | null;
  winner: Side | null;
  score: string | null;
  voiceIds: string[]; // temporary team channels, deleted when the match ends
  roomId: string | null; // the match's temporary text channel
  roomMessageId: string | null;
  closing: { winner: string; score: string } | null; // the result shown while a room closes
  named: number[]; // teams whose captain has picked a name
  reminded: boolean;
  disputes: number;
  subsNeeded: string[]; // players who can't play and want replacing
  picks: Record<string, number>; // player to team slot, when players choose a team
  reveal: boolean; // rosters were hidden, so post them when registration closes
  eventId: string | null;
  eventAt: string | null;
  eventLive: boolean;
  eventPanelId: string | null; // the panel message the event links to
  fullPinged: boolean;
  pingIds: string[];
}

export function emptyState(signups: string[] = []): MatchState {
  return {
    signups,
    ready: [],
    teams: [],
    draftPool: [],
    draftPick: 0,
    mapOptions: [],
    votes: {},
    banned: [],
    banTurn: "a",
    map: null,
    mapNote: null,
    report: null,
    winner: null,
    score: null,
    voiceIds: [],
    roomId: null,
    roomMessageId: null,
    closing: null,
    named: [],
    reminded: false,
    disputes: 0,
    subsNeeded: [],
    picks: {},
    reveal: false,
    eventId: null,
    eventAt: null,
    eventLive: false,
    eventPanelId: null,
    fullPinged: false,
    pingIds: [],
  };
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Fills the team with the lowest total rating each time, strongest player
// first, which keeps the team totals close for any team count or size.
export function splitTeams(players: string[], ratings: Record<string, number>, teamCount: number, teamSize: number, method: string): string[][] {
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  if (method === "RANDOM") {
    shuffle(players).forEach((id, i) => teams[i % teamCount].push(id));
    return teams.map((t) => t.slice(0, teamSize));
  }
  const total = (t: string[]) => t.reduce((sum, id) => sum + (ratings[id] ?? 1000), 0);
  const strongestFirst = shuffle(players).sort((x, y) => (ratings[y] ?? 1000) - (ratings[x] ?? 1000));
  for (const id of strongestFirst) {
    const open = teams.filter((t) => t.length < teamSize);
    if (open.length === 0) break;
    open.sort((x, y) => total(x) - total(y) || x.length - y.length);
    open[0].push(id);
  }
  return teams;
}

export function pickCaptain(players: string[], ratings: Record<string, number>, rule: string): string {
  if (rule === "RANDOM") return pickOne(players);
  return [...players].sort((x, y) => (ratings[y] ?? 1000) - (ratings[x] ?? 1000))[0];
}

// Captains pick in A, B, B, A order so the first pick isn't a lasting edge.
export function draftSide(pick: number): Side {
  return pick % 4 === 0 || pick % 4 === 3 ? "a" : "b";
}

// Falls back to the full list when skipping recent maps wouldn't leave enough.
export function mapPool(maps: string[], recent: string[], needed: number): string[] {
  const fresh = maps.filter((m) => !recent.includes(m));
  return fresh.length >= needed ? fresh : maps;
}

export function tallyVotes(options: string[], votes: Record<string, string>): { winner: string; note: string } {
  const counts = new Map(options.map((o) => [o, 0]));
  for (const choice of Object.values(votes)) {
    if (counts.has(choice)) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  const most = Math.max(...counts.values());
  const tied = options.filter((o) => counts.get(o) === most);
  const ordered = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  return { winner: pickOne(tied), note: ordered.map(([name, n]) => `${name} ${n}`).join(" · ") };
}

// Starting rating from a member's chosen rank, on a 1000 to 1800 scale.
export function ratingFromRank(rank: number, rankCount: number): number {
  return 1000 + Math.round((rank / Math.max(1, rankCount - 1)) * 800);
}

// Team names show in embeds and channel names, so mentions and markup are removed.
export function cleanTeamName(raw: string): string {
  return raw.replace(/[<>@#*_`~|\\:]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
}

export function replacePlayer(state: MatchState, out: string, sub: string): MatchTeam | null {
  const team = state.teams.find((t) => t.players.includes(out));
  if (!team) return null;
  team.players = team.players.map((id) => (id === out ? sub : id));
  if (team.captain === out) team.captain = sub;
  state.signups = state.signups.map((id) => (id === out ? sub : id));
  state.subsNeeded = state.subsNeeded.filter((id) => id !== out);
  delete state.votes[out];
  return team;
}

export function ratingChange(won: boolean): number {
  return won ? 20 : -20;
}

// The two teams playing, once teams are made.
export function currentTeams(state: MatchState): [MatchTeam, MatchTeam] | null {
  return state.teams.length === 2 ? [state.teams[0], state.teams[1]] : null;
}

export const onTeam = (state: MatchState, slot: number) => state.signups.filter((id) => state.picks[id] === slot);

// Default names say nothing about who's on a team, so they stay off the leaderboard.
export function countsAsNamedTeam(name: string, first: string, second: string): boolean {
  return name !== first && name !== second && !/^Team \d+$/.test(name);
}

export interface BoardRow {
  winners: string[];
  losers: string[];
  winnerTeam: string | null;
  loserTeam: string | null;
}

export interface BoardEntry {
  key: string;
  wins: number;
  losses: number;
}

const rate = (e: BoardEntry) => (e.wins + e.losses ? e.wins / (e.wins + e.losses) : 0);

function topTen(records: Map<string, BoardEntry>): BoardEntry[] {
  return [...records.values()].sort((x, y) => y.wins - x.wins || rate(y) - rate(x) || x.losses - y.losses).slice(0, 10);
}

// Built from results rather than running totals, so a void or a new season is
// always right without undoing anything.
export function tallyBoard(rows: BoardRow[]): { players: BoardEntry[]; teams: BoardEntry[] } {
  const players = new Map<string, BoardEntry>();
  const teams = new Map<string, BoardEntry>();
  const add = (map: Map<string, BoardEntry>, key: string, won: boolean) => {
    const entry = map.get(key) ?? { key, wins: 0, losses: 0 };
    if (won) entry.wins++;
    else entry.losses++;
    map.set(key, entry);
  };
  for (const row of rows) {
    row.winners.forEach((id) => add(players, id, true));
    row.losers.forEach((id) => add(players, id, false));
    if (row.winnerTeam) add(teams, row.winnerTeam, true);
    if (row.loserTeam) add(teams, row.loserTeam, false);
  }
  return { players: topTen(players), teams: topTen(teams) };
}
