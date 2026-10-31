// The match rules with no Discord or database in them: splitting teams,
// building brackets, picking maps and counting votes. flow.ts runs these and
// handles everything that actually touches Discord.

export type Side = "a" | "b";

export interface MatchTeam {
  name: string;
  players: string[];
  captain: string;
}

export interface BracketTie {
  a: number | null; // index into MatchState.teams
  b: number | null;
  winner: Side | null;
  scoreA: number | null;
  scoreB: number | null;
  map: string | null;
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
  bracket: BracketTie[][];
  tie: [number, number] | null;
  mapOptions: string[];
  votes: Record<string, string>;
  banned: string[];
  banTurn: Side;
  map: string | null;
  mapNote: string | null;
  report: MatchReport | null;
  winner: Side | null;
  score: string | null;
  champion: number | null;
  notInVoice: string[];
  pingIds: string[];
}

export function emptyState(signups: string[] = []): MatchState {
  return {
    signups,
    ready: [],
    teams: [],
    draftPool: [],
    draftPick: 0,
    bracket: [],
    tie: null,
    mapOptions: [],
    votes: {},
    banned: [],
    banTurn: "a",
    map: null,
    mapNote: null,
    report: null,
    winner: null,
    score: null,
    champion: null,
    notInVoice: [],
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

// Brackets only run with 2, 4, 8 or 16 teams so nobody gets a free pass.
export function bracketTeamCount(players: number, teamSize: number, maxTeams: number): number {
  const possible = Math.min(maxTeams, Math.floor(players / teamSize));
  let count = 0;
  for (let n = 2; n <= possible; n *= 2) count = n;
  return count;
}

export function buildBracket(teamCount: number): BracketTie[][] {
  const blank = (a: number | null, b: number | null): BracketTie => ({ a, b, winner: null, scoreA: null, scoreB: null, map: null });
  const seeds = shuffle(Array.from({ length: teamCount }, (_, i) => i));
  const rounds: BracketTie[][] = [[]];
  for (let i = 0; i < seeds.length; i += 2) rounds[0].push(blank(seeds[i], seeds[i + 1]));
  for (let ties = teamCount / 4; ties >= 1; ties /= 2) rounds.push(Array.from({ length: ties }, () => blank(null, null)));
  return rounds;
}

export function nextTie(bracket: BracketTie[][]): [number, number] | null {
  for (let r = 0; r < bracket.length; r++) {
    for (let i = 0; i < bracket[r].length; i++) {
      const tie = bracket[r][i];
      if (tie.a !== null && tie.b !== null && !tie.winner) return [r, i];
    }
  }
  return null;
}

// Records a result and moves the winner up. Returns the champion's team index
// once the final is decided, otherwise null.
export function recordTie(bracket: BracketTie[][], [r, i]: [number, number], winner: Side, winnerScore: number, loserScore: number): number | null {
  const tie = bracket[r][i];
  tie.winner = winner;
  tie.scoreA = winner === "a" ? winnerScore : loserScore;
  tie.scoreB = winner === "b" ? winnerScore : loserScore;
  const team = winner === "a" ? tie.a : tie.b;
  const next = bracket[r + 1]?.[Math.floor(i / 2)];
  if (!next) return team;
  if (i % 2 === 0) next.a = team;
  else next.b = team;
  return null;
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

export function ratingChange(won: boolean): number {
  return won ? 20 : -20;
}

// The two teams playing right now: the match itself, or the bracket's live tie.
export function currentTeams(state: MatchState): [MatchTeam, MatchTeam] | null {
  if (state.tie) {
    const tie = state.bracket[state.tie[0]][state.tie[1]];
    if (tie.a === null || tie.b === null) return null;
    return [state.teams[tie.a], state.teams[tie.b]];
  }
  return state.teams.length === 2 ? [state.teams[0], state.teams[1]] : null;
}
