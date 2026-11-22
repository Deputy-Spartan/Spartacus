// Streaming › K/D Counter: KILLS / DEATHS (and K/D) on stream, changed with
// Stream Deck keys or the dashboard. Same looks and animations as the Money
// Counter (counters.ts), plus kill streaks.
import { COUNTER_COLORS, KD_ANIMS, KD_SOUNDS, cleanColor, cleanCounterLook, cleanText, type CounterLook } from "./counters";

export const KD_STATE_KEY = "kd"; // its row in StreamDeckState
export const KD_MAX = 99_999;
export const KD_LAYOUTS = [
  ["side", "Side by side"],
  ["stacked", "Stacked"],
  ["line", "One line"],
] as const;
export const KD_COLOR_MODES = [
  ["kd", "Kills green, deaths red"],
  ["updown", "Up green, down red"],
] as const;
export const KD_DTEXTS = [
  ["num", "+1"],
  ["word", "+1 KILL"],
] as const;
export const KD_STREAKS = [
  [3, "3 kills"],
  [5, "5 kills"],
  [10, "10 kills"],
] as const;

export interface KdCounter extends CounterLook {
  kills: number;
  deaths: number;
  streak: number; // kills since the last death
  dcolor: string; // the deaths number's color (color is the kills number's)
  colors: "kd" | "updown"; // how +/- are colored
  dtext: "num" | "word"; // "+1" or "+1 KILL"
  ratio: boolean; // show a K/D box
  streakOn: boolean; // KILL STREAK banner
  streakEvery: number;
  killsLabel: string;
  deathsLabel: string;
  ratioLabel: string;
}

export const KD_DEFAULTS: KdCounter = {
  kills: 0,
  deaths: 0,
  streak: 0,
  dcolor: "#ffffff",
  colors: "kd",
  dtext: "num",
  ratio: true,
  streakOn: true,
  streakEvery: 5,
  killsLabel: "KILLS",
  deathsLabel: "DEATHS",
  ratioLabel: "K/D",
  size: 100,
  anim: "bullets",
  spot: "above",
  look: "dark",
  font: "blackops",
  corners: "round",
  outline: "thick",
  idle: "none",
  color: COUNTER_COLORS[0][0],
  dstyle: "text",
  dsize: 1,
  speed: 1,
  sound: "off",
  volume: 0.6,
  layout: "side",
};

export const clampKd = (n: number) => Math.max(0, Math.min(KD_MAX, Math.round(Number.isFinite(n) ? n : 0)));

export function cleanKd(v: unknown): KdCounter {
  const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const every = Number(r.streakEvery);
  return {
    ...cleanCounterLook(r, KD_DEFAULTS, { anims: KD_ANIMS, sounds: KD_SOUNDS, layouts: KD_LAYOUTS }),
    kills: clampKd(Number(r.kills ?? 0)),
    deaths: clampKd(Number(r.deaths ?? 0)),
    streak: clampKd(Number(r.streak ?? 0)),
    dcolor: cleanColor(r.dcolor, KD_DEFAULTS.dcolor),
    colors: r.colors === "updown" ? "updown" : "kd",
    dtext: r.dtext === "word" ? "word" : "num",
    ratio: typeof r.ratio === "boolean" ? r.ratio : KD_DEFAULTS.ratio,
    streakOn: typeof r.streakOn === "boolean" ? r.streakOn : KD_DEFAULTS.streakOn,
    streakEvery: KD_STREAKS.some(([n]) => n === every) ? every : KD_DEFAULTS.streakEvery,
    killsLabel: cleanText(r.killsLabel, 24, KD_DEFAULTS.killsLabel),
    deathsLabel: cleanText(r.deathsLabel, 24, KD_DEFAULTS.deathsLabel),
    ratioLabel: cleanText(r.ratioLabel, 24, KD_DEFAULTS.ratioLabel),
  };
}

// Kills or deaths change; the streak follows (a death ends it).
export function changeKd(cur: KdCounter, stat: "kills" | "deaths" | "both", op: { add: number } | { set: number }): KdCounter {
  const next = { ...cur };
  const stats: Array<"kills" | "deaths"> = stat === "both" ? ["kills", "deaths"] : [stat];
  for (const s of stats) {
    const before = next[s];
    next[s] = clampKd("set" in op ? op.set : before + op.add);
    const diff = next[s] - before;
    if (s === "kills") next.streak = "set" in op ? 0 : clampKd(next.streak + diff);
    if (s === "deaths" && diff > 0) next.streak = 0;
  }
  return next;
}

export const kdRatio = (k: number, d: number) => (k / Math.max(1, d)).toFixed(2);
