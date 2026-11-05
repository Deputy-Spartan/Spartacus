// Matchmaking tournaments: single elimination brackets for Matchmaking teams.
// The bracket is plain data so the bot and the dashboard draw the same thing.

export interface TournamentTie {
  a: string | null; // entry id, or null for a bye (round 1) / not decided yet
  b: string | null;
  w: string | null; // winning entry id
  sa: number | null;
  sb: number | null;
  roomId: string | null; // the live match room
  forfeit?: boolean; // staff set the winner without a played score
}
export type TournamentBracket = TournamentTie[][];

export const TOURNAMENT_SIZES = [4, 8, 16, 32] as const;
export const TOURNAMENT_BEST_OF = { BO1: "All best of 1", BO1F3: "Best of 1, final best of 3", BO3: "All best of 3" } as const;
export type TournamentBestOf = keyof typeof TOURNAMENT_BEST_OF;
export const TOURNAMENT_STATUS = {
  DRAFT: "Draft",
  OPEN: "Registration open",
  CHECKIN: "Check-in",
  LIVE: "Live",
  DONE: "Finished",
  CANCELED: "Canceled",
} as const;
export type TournamentStatus = keyof typeof TOURNAMENT_STATUS;

// Seeds in bracket order (1, 8, 4, 5, 2, 7, 3, 6 for 8), so seeds 1 and 2
// can only meet in the final and byes go to the top seeds.
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order.slice(0, Math.max(2, size));
}

// `seeded` is entry ids, best seed first. Byes are already moved through.
export function buildTournamentBracket(seeded: string[]): TournamentBracket {
  let size = 2;
  while (size < seeded.length) size *= 2;
  const order = seedOrder(size);
  const blank = (a: string | null, b: string | null): TournamentTie => ({ a, b, w: null, sa: null, sb: null, roomId: null });
  const rounds: TournamentBracket = [[]];
  for (let i = 0; i < order.length; i += 2) rounds[0].push(blank(seeded[order[i] - 1] ?? null, seeded[order[i + 1] - 1] ?? null));
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => blank(null, null)));
  rounds[0].forEach((tie, i) => {
    if (tie.a && !tie.b) advanceTie(rounds, 0, i, tie.a, null, null);
    else if (!tie.a && tie.b) advanceTie(rounds, 0, i, tie.b, null, null);
  });
  return rounds;
}

// Records a winner and moves them into the next round. Returns true when
// that was the final.
export function advanceTie(bracket: TournamentBracket, r: number, i: number, winner: string, winnerScore: number | null, loserScore: number | null, forfeit = false): boolean {
  const tie = bracket[r][i];
  tie.w = winner;
  tie.roomId = null;
  if (forfeit) tie.forfeit = true;
  if (winnerScore !== null) {
    tie.sa = tie.a === winner ? winnerScore : loserScore;
    tie.sb = tie.b === winner ? winnerScore : loserScore;
  }
  const next = bracket[r + 1]?.[Math.floor(i / 2)];
  if (!next) return true;
  if (i % 2 === 0) next.a = winner;
  else next.b = winner;
  return false;
}

// Ties with both teams known and no winner or room yet: ready to start.
export function readyTies(bracket: TournamentBracket): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  bracket.forEach((ties, r) => ties.forEach((t, i) => t.a && t.b && !t.w && !t.roomId && out.push([r, i])));
  return out;
}

export function roundName(bracket: TournamentBracket, r: number): string {
  const n = bracket[r]?.length ?? 0;
  return n === 1 ? "Final" : n === 2 ? "Semifinals" : n === 4 ? "Quarterfinals" : `Round of ${n * 2}`;
}

export function isFinalRound(bracket: TournamentBracket, r: number): boolean {
  return r === bracket.length - 1;
}

// How many games a tie is: the final can be best of 3 when the rest are best of 1.
export function tieBestOf(bestOf: string, bracket: TournamentBracket, r: number): 1 | 3 {
  if (bestOf === "BO3") return 3;
  if (bestOf === "BO1F3" && isFinalRound(bracket, r)) return 3;
  return 1;
}

export function readBracket(v: unknown): TournamentBracket {
  return Array.isArray(v) ? (v as TournamentBracket) : [];
}

export interface TournamentInput {
  name: string;
  game: string;
  maxTeams: number;
  bestOf: TournamentBestOf;
  seeding: "RECORD" | "RANDOM";
  checkIn: boolean;
  checkInMinutes: number;
  soloSignups: boolean;
  startAt: string | null; // ISO
  channelId: string | null;
  pingRoleId: string | null;
  rules: string;
  winCoins: number;
  championCoins: number;
  runnerUpCoins: number;
  championRoleId: string | null;
}

export const TOURNAMENT_DEFAULTS: TournamentInput = {
  name: "Saturday Cup",
  game: "",
  maxTeams: 8,
  bestOf: "BO1F3",
  seeding: "RECORD",
  checkIn: true,
  checkInMinutes: 15,
  soloSignups: true,
  startAt: null,
  channelId: null,
  pingRoleId: null,
  rules: "",
  winCoins: 100,
  championCoins: 500,
  runnerUpCoins: 150,
  championRoleId: null,
};

const snowflake = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
const whole = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);

// Returns the cleaned settings, or an error message for the dashboard.
export function cleanTournament(b: Record<string, unknown>, games: string[]): TournamentInput | string {
  const D = TOURNAMENT_DEFAULTS;
  const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!name) return "Give the tournament a name.";
  const game = typeof b.game === "string" ? b.game : "";
  if (!games.includes(game)) return "Pick a game from your Matchmaking games.";
  let startAt: string | null = null;
  if (typeof b.startAt === "string" && b.startAt) {
    const t = new Date(b.startAt);
    if (Number.isNaN(t.getTime())) return "That start time isn't a valid date.";
    startAt = t.toISOString();
  }
  return {
    name,
    game,
    maxTeams: (TOURNAMENT_SIZES as readonly number[]).includes(b.maxTeams as number) ? (b.maxTeams as number) : D.maxTeams,
    bestOf: typeof b.bestOf === "string" && b.bestOf in TOURNAMENT_BEST_OF ? (b.bestOf as TournamentBestOf) : D.bestOf,
    seeding: b.seeding === "RANDOM" ? "RANDOM" : "RECORD",
    checkIn: typeof b.checkIn === "boolean" ? b.checkIn : D.checkIn,
    checkInMinutes: [5, 10, 15, 30].includes(b.checkInMinutes as number) ? (b.checkInMinutes as number) : D.checkInMinutes,
    soloSignups: typeof b.soloSignups === "boolean" ? b.soloSignups : D.soloSignups,
    startAt,
    channelId: snowflake(b.channelId),
    pingRoleId: snowflake(b.pingRoleId),
    rules: typeof b.rules === "string" ? b.rules.trim().slice(0, 1000) : "",
    winCoins: whole(b.winCoins, 0, 100000, D.winCoins),
    championCoins: whole(b.championCoins, 0, 100000, D.championCoins),
    runnerUpCoins: whole(b.runnerUpCoins, 0, 100000, D.runnerUpCoins),
    championRoleId: snowflake(b.championRoleId),
  };
}
