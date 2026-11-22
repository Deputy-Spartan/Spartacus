// Streaming › Money Counter: a "TOTAL MONEY  $7,300,000" box for OBS that
// Stream Deck keys (and the dashboard) add to or set. The dashboard, the API,
// the bot and the overlay all read this. The look settings are shared with
// the K/D Counter (counters.ts).
import { MONEY_ANIMS, MONEY_SOUNDS, cleanCounterLook, cleanText, type CounterLook } from "./counters";

export const MONEY_STATE_KEY = "money"; // its row in StreamDeckState
export const MONEY_MAX = 999_999_999_999;
export const MONEY_LAYOUTS = [
  ["side", "Label on top"],
  ["line", "Label beside"],
] as const;

export interface MoneyCounter extends CounterLook {
  amount: number;
  label: string; // the small line above the number, e.g. TOTAL MONEY
  prefix: string; // before the number, e.g. $
  suffix: string; // after it, e.g. " coins"
  bigwin: boolean; // adding 1,000,000 or more also gets the gold glow and sparkles
  short: boolean; // $7.3M instead of $7,300,000
}

export const MONEY_DEFAULTS: MoneyCounter = {
  amount: 0,
  label: "TOTAL MONEY",
  prefix: "$",
  suffix: "",
  bigwin: true,
  short: false,
  size: 100,
  anim: "bounce",
  spot: "right",
  look: "dark",
  font: "lilita",
  corners: "round",
  outline: "thick",
  idle: "none",
  color: "#f9c933",
  dstyle: "text",
  dsize: 1,
  speed: 1,
  sound: "off",
  volume: 0.6,
  layout: "side",
};

export const clampMoney = (n: number) => Math.max(-MONEY_MAX, Math.min(MONEY_MAX, Math.round(Number.isFinite(n) ? n : 0)));

export function cleanMoney(v: unknown): MoneyCounter {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    ...cleanCounterLook(r, MONEY_DEFAULTS, { anims: MONEY_ANIMS, sounds: MONEY_SOUNDS, layouts: MONEY_LAYOUTS }),
    amount: clampMoney(Number(r.amount ?? 0)),
    label: cleanText(r.label, 40, MONEY_DEFAULTS.label),
    prefix: cleanText(r.prefix, 6, MONEY_DEFAULTS.prefix),
    suffix: cleanText(r.suffix, 12, MONEY_DEFAULTS.suffix),
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
