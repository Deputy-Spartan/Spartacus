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
}

export const MONEY_DEFAULTS: MoneyCounter = { amount: 0, label: "TOTAL MONEY", prefix: "$", suffix: "", size: 100 };

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
