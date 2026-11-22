// Streaming › Money Counter: a "TOTAL MONEY  $7,300,000" box for OBS that
// Stream Deck keys (and the dashboard) add to or set. The dashboard, the API,
// the bot and the overlay page all read this.

export const MONEY_STATE_KEY = "money"; // its row in StreamDeckState
export const MONEY_MAX = 999_999_999_999;

export interface MoneyCounter {
  amount: number;
  label: string; // the small line above the number, e.g. TOTAL MONEY
  prefix: string; // before the number, e.g. $
  suffix: string; // after it, e.g. " coins"
  size: number; // percent
  anim: MoneyAnim; // how it moves when the number changes
  spot: MoneySpot; // where the green +$ / red -$ amount shows
  look: MoneyLook; // the box behind the number
  color: string; // the number's color, #rrggbb
  dstyle: "text" | "pill"; // the +$ / -$: outlined letters or a badge
  dsize: number; // the +$ / -$ size: 0.75, 1 or 1.4
  speed: number; // animation speed: 0.6, 1 or 1.6
  bigwin: boolean; // adding 1,000,000 or more also gets the gold glow and sparkles
  short: boolean; // $7.3M instead of $7,300,000
}

export const MONEY_LOOKS = [
  ["dark", "Dark"],
  ["gold", "Gold"],
  ["neon", "Neon"],
  ["clean", "White"],
  ["glass", "Glass"],
  ["none", "No box"],
] as const;
export type MoneyLook = (typeof MONEY_LOOKS)[number][0];

export const MONEY_COLORS = [
  ["#f9c933", "Gold"],
  ["#ffffff", "White"],
  ["#4ade80", "Green"],
  ["#22d3ee", "Cyan"],
  ["#f472b6", "Pink"],
  ["#fb923c", "Orange"],
] as const;
export const MONEY_DSIZES = [
  [0.75, "Small"],
  [1, "Medium"],
  [1.4, "Big"],
] as const;
export const MONEY_SPEEDS = [
  [0.6, "Slow"],
  [1, "Normal"],
  [1.6, "Fast"],
] as const;

export const MONEY_ANIMS = [
  ["bounce", "Bounce", "The box hops and the amount bounces in, then floats away."],
  ["float", "Float", "The box gently floats all the time. The amount drifts up and wobbles."],
  ["slam", "Slam", "The amount slams down, the box shakes and flashes green or red."],
  ["burst", "Money burst", "$ signs pop out of the number, and the amount pops up."],
  ["slot", "Slot machine", "Each digit spins like a slot machine. The amount floats up."],
  ["pop", "Pop", "The number jumps big and wiggles."],
  ["rain", "Money rain", "💵 rain down when you add. 💸 fly away when you take."],
  ["jackpot", "Jackpot", "The box glows gold and sparkles ✨ fly out."],
] as const;
export type MoneyAnim = (typeof MONEY_ANIMS)[number][0];

export const MONEY_SPOTS = [
  ["right", "→ Right"],
  ["left", "← Left"],
  ["above", "↑ Above"],
  ["below", "↓ Below"],
  ["over", "On the number"],
  ["corner", "↗ Corner"],
] as const;
export type MoneySpot = (typeof MONEY_SPOTS)[number][0];

export const MONEY_DEFAULTS: MoneyCounter = { amount: 0, label: "TOTAL MONEY", prefix: "$", suffix: "", size: 100, anim: "bounce", spot: "right", look: "dark", color: "#f9c933", dstyle: "text", dsize: 1, speed: 1, bigwin: true, short: false };

const pickNum = (v: unknown, list: ReadonlyArray<readonly [number, string]>, d: number) => {
  const n = Number(v);
  return list.some(([x]) => x === n) ? n : d;
};

export const clampMoney = (n: number) => Math.max(-MONEY_MAX, Math.min(MONEY_MAX, Math.round(Number.isFinite(n) ? n : 0)));

export function cleanMoney(v: unknown): MoneyCounter {
  const r = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof MoneyCounter, unknown>>;
  const text = (x: unknown, max: number, d: string) => (typeof x === "string" ? x.slice(0, max) : d);
  const size = Math.round(Number(r.size));
  return {
    amount: clampMoney(Number(r.amount ?? 0)),
    label: text(r.label, 40, MONEY_DEFAULTS.label),
    prefix: text(r.prefix, 6, MONEY_DEFAULTS.prefix),
    suffix: text(r.suffix, 12, MONEY_DEFAULTS.suffix),
    size: Number.isFinite(size) ? Math.max(30, Math.min(250, size)) : 100,
    anim: MONEY_ANIMS.some(([id]) => id === r.anim) ? (r.anim as MoneyAnim) : MONEY_DEFAULTS.anim,
    spot: MONEY_SPOTS.some(([id]) => id === r.spot) ? (r.spot as MoneySpot) : MONEY_DEFAULTS.spot,
    look: MONEY_LOOKS.some(([id]) => id === r.look) ? (r.look as MoneyLook) : MONEY_DEFAULTS.look,
    color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : MONEY_DEFAULTS.color,
    dstyle: r.dstyle === "pill" ? "pill" : "text",
    dsize: pickNum(r.dsize, MONEY_DSIZES, 1),
    speed: pickNum(r.speed, MONEY_SPEEDS, 1),
    bigwin: typeof r.bigwin === "boolean" ? r.bigwin : MONEY_DEFAULTS.bigwin,
    short: r.short === true,
  };
}

// $7,300,000 (and -$5 for below zero).
export function formatMoney(n: number, prefix = "$", suffix = "") {
  return `${n < 0 ? "-" : ""}${prefix}${Math.abs(Math.round(n)).toLocaleString("en-US")}${suffix}`;
}

// $7.3M, for small screens like a Stream Deck key.
export function shortMoney(n: number, prefix = "$") {
  const a = Math.abs(n);
  const [d, u] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e4 ? [1e3, "K"] : [1, ""];
  const v = d === 1 ? Math.round(a).toLocaleString("en-US") : `${parseFloat((a / d).toFixed(a / d >= 100 ? 0 : 1))}${u}`;
  return `${n < 0 ? "-" : ""}${prefix}${v}`;
}
