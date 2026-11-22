// Streaming › Overlays: Game, Win/Loss, Timer, Goal bar, Challenge, Discord
// box and Latest follower. Each is one StreamDeckState row (key "ov:<kind>")
// holding its look (shared with the counters, counters.ts) plus its numbers.
// The API, the bot (Stream Deck keys, Kick follows) and the dashboard all
// change them through applyOverlayAction, so they always agree.
import { COUNTER_COLORS, COUNTER_DSIZES, type AnimChoice, type CounterLook, cleanColor, cleanCounterLook, cleanText } from "./counters";

export const OVERLAY_KINDS = ["game", "winloss", "timer", "goal", "challenge", "discord", "ticker"] as const;
export type OverlayKind = (typeof OVERLAY_KINDS)[number];
export const isOverlayKind = (k: unknown): k is OverlayKind => OVERLAY_KINDS.includes(k as OverlayKind);
export const overlayStateKey = (k: OverlayKind) => `ov:${k}`;

// Everything any of the seven can hold; each kind uses its own part.
export interface OverlayState extends CounterLook {
  [key: string]: unknown;
}
export interface TimerValue {
  running: boolean;
  base: number; // ms left (countdown) or counted (stopwatch) at t0
  t0: number; // when base was taken (server time)
}

const ANIM_START: AnimChoice[] = [
  ["bounce", "Bounce", "Hops and the change bounces in."],
  ["float", "Float", "Floats all the time. The change drifts up."],
  ["slam", "Slam", "The change slams down and it shakes."],
  ["burst", "Burst", "Bits pop out of it."],
];
const ANIM_END: AnimChoice[] = [
  ["pop", "Pop", "It jumps big and wiggles."],
  ["bullets", "Bullets", "Bullets fly in and hit the wall: holes and sparks."],
  ["jackpot", "Jackpot", "Glows gold and sparkles fly out."],
  ["spin", "Spin", "Flips all the way round."],
  ["glitch", "Glitch", "Jitters with a red and blue split, then snaps."],
];
const anims = (slot: AnimChoice, rain: AnimChoice): AnimChoice[] => [...ANIM_START, slot, rain, ...ANIM_END];
const SLOT: AnimChoice = ["slot", "Slot machine", "The digits spin like a slot machine."];
const SCRAMBLE: AnimChoice = ["slot", "Scramble", "The letters scramble, then land one by one."];

const LABEL_LAYOUTS = [
  ["side", "Label on top"],
  ["line", "Label beside"],
] as const;
const PAIR_LAYOUTS = [
  ["side", "Side by side"],
  ["stacked", "Stacked"],
  ["line", "One line"],
] as const;

// What the dashboard shows for each kind, and its defaults.
export interface OverlayInfo {
  kind: OverlayKind;
  title: string;
  icon: string;
  line: string; // one line on its card
  anims: AnimChoice[];
  sounds: ReadonlyArray<readonly [string, string]>;
  layouts: ReadonlyArray<readonly [string, string]>;
  defaults: OverlayState;
}
const look = (o: Partial<CounterLook>): CounterLook => ({
  size: 100,
  anim: "bounce",
  spot: "right",
  look: "dark",
  font: "lilita",
  corners: "round",
  outline: "thick",
  idle: "none",
  color: COUNTER_COLORS[0][0],
  dstyle: "pill",
  dsize: COUNTER_DSIZES[1][0],
  speed: 1,
  sound: "off",
  volume: 0.6,
  layout: "side",
  ...o,
});

export const OVERLAYS: Record<OverlayKind, OverlayInfo> = {
  game: {
    kind: "game",
    title: "Game",
    icon: "🎮",
    line: "NOW PLAYING and your game, with a NEW GAME tag when you switch.",
    anims: anims(SCRAMBLE, ["rain", "Icon rain", "Your icon rains down the screen."]),
    sounds: [["off", "Off"], ["whoosh", "Whoosh"], ["ding", "Ding"], ["pop", "Pop"]],
    layouts: LABEL_LAYOUTS,
    defaults: { ...look({ anim: "slot", spot: "corner" }), game: "Just Chatting", gameLabel: "NOW PLAYING", icon: "🎮", sub: "", uppercase: false, tag: "NEW GAME", showTag: true, recentGames: [] },
  },
  winloss: {
    kind: "winloss",
    title: "Win / Loss",
    icon: "🏆",
    line: "Wins, losses and win %, with win streak banners.",
    anims: anims(SLOT, ["rain", "Trophy rain", "🏆 rain down for wins, ❌ for losses."]),
    sounds: [["off", "Off"], ["ding", "Ding"], ["coin", "Coin"], ["hitmarker", "Hitmarker"]],
    layouts: PAIR_LAYOUTS,
    defaults: {
      ...look({ anim: "jackpot", spot: "above", font: "russo", color: "#4ade80" }),
      wins: 0, losses: 0, streak: 0, dcolor: "#f87171", colors: "kd", dtext: "word", ratio: true, streakOn: true, streakEvery: 3,
      winsLabel: "WINS", lossesLabel: "LOSSES", rateLabel: "WIN %",
    },
  },
  timer: {
    kind: "timer",
    title: "Timer",
    icon: "⏱️",
    line: "A countdown or stopwatch. The last 10 seconds flash, then TIME'S UP.",
    anims: anims(SCRAMBLE, ["rain", "Clock rain", "⏰ rain down the screen."]),
    sounds: [["off", "Off"], ["ding", "Ding"], ["coin", "Coin"], ["pop", "Pop"]],
    layouts: LABEL_LAYOUTS,
    defaults: {
      ...look({ anim: "pop", spot: "above", font: "bebas", color: "#ffffff" }),
      timer: { running: false, base: 300000, t0: 0 } satisfies TimerValue, timerMode: "down", timerLen: 300000,
      timerLabel: "STARTING SOON", doneText: "⏰ TIME'S UP!", finalFlash: true,
    },
  },
  goal: {
    kind: "goal",
    title: "Goal bar",
    icon: "📈",
    line: "A bar that fills up toward a goal, with confetti when you reach it.",
    anims: anims(SLOT, ["rain", "Confetti rain", "🎉 rain down the screen."]),
    sounds: [["off", "Off"], ["coin", "Coin"], ["ding", "Ding"], ["pop", "Pop"]],
    layouts: LABEL_LAYOUTS,
    defaults: { ...look({ corners: "pill", idle: "shine" }), cur: 0, target: 1000, goalLabel: "FOLLOWER GOAL", goalDone: "🎉 GOAL REACHED!", showPct: true, autoKick: false },
  },
  challenge: {
    kind: "challenge",
    title: "Challenge",
    icon: "🏋️",
    line: "Any count with your own words, like SQUATS OWED 30.",
    anims: anims(SLOT, ["rain", "Icon rain", "Your icon rains down the screen."]),
    sounds: [["off", "Off"], ["hitmarker", "Hitmarker"], ["ding", "Ding"], ["pop", "Pop"]],
    layouts: LABEL_LAYOUTS,
    defaults: { ...look({ anim: "slam", look: "red", font: "bangers", color: "#ffffff", dstyle: "text" }), count: 0, chLabel: "SQUATS OWED", icon: "🏋️", upBad: true },
  },
  discord: {
    kind: "discord",
    title: "Discord box",
    icon: "💬",
    line: "JOIN THE DISCORD, your invite, and live member counts from your server.",
    anims: anims(SCRAMBLE, ["rain", "Wave rain", "👋 rain down the screen."]),
    sounds: [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["coin", "Coin"]],
    layouts: LABEL_LAYOUTS,
    defaults: { ...look({ look: "discord", idle: "float", color: "#ffffff" }), discordLabel: "JOIN THE DISCORD", invite: "", showOnline: true },
  },
  ticker: {
    kind: "ticker",
    title: "Latest follower",
    icon: "💜",
    line: "Your latest follower, sub or raid, with a NEW FOLLOWER tag.",
    anims: anims(SCRAMBLE, ["rain", "Icon rain", "Your icon rains down the screen."]),
    sounds: [["off", "Off"], ["whoosh", "Whoosh"], ["ding", "Ding"], ["pop", "Pop"]],
    layouts: LABEL_LAYOUTS,
    defaults: {
      ...look({ anim: "slot", spot: "corner" }), type: "follow", name: "—", recent: [], icon: "💜",
      followLabel: "LATEST FOLLOWER", subLabel: "LATEST SUB", raidLabel: "LATEST RAID", showRecent: true, uppercase: false, showTag: true, autoKick: true,
    },
  },
};

// Pick lists the dashboard shows for the kind-specific settings.
export const OVERLAY_ICONS: Record<"game" | "challenge" | "ticker", string[]> = {
  game: ["🎮", "🔫", "⚔️", "🏎️", "⚽", ""],
  challenge: ["🏋️", "🔥", "😡", "🍺", "💀", ""],
  ticker: ["💜", "⭐", "❤️", "🔔", "👑", ""],
};
export const TIMER_LENGTHS = [
  [60000, "1 min"],
  [300000, "5 min"],
  [600000, "10 min"],
  [1800000, "30 min"],
] as const;
export const WIN_STREAKS = [
  [3, "3 wins"],
  [5, "5 wins"],
  [10, "10 wins"],
] as const;

// The fields that are numbers you change (kept when the look is saved).
export const OVERLAY_VALUE_KEYS: Record<OverlayKind, string[]> = {
  game: ["game", "recentGames"],
  winloss: ["wins", "losses", "streak"],
  timer: ["timer"],
  goal: ["cur"],
  challenge: ["count"],
  discord: [],
  ticker: ["type", "name", "recent"],
};

const MAX = 999_999_999;
const clampN = (n: unknown, lo = 0, hi = MAX) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(Number(n)) ? Number(n) : 0)));
const bool = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
const oneOfN = (x: unknown, list: ReadonlyArray<readonly [number, string]>, d: number) => (list.some(([n]) => n === Number(x)) ? Number(x) : d);
const names = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x.filter((s) => typeof s === "string").map((s: string) => s.slice(0, max)).slice(0, n) : []);

export function cleanOverlay(kind: OverlayKind, raw: unknown): OverlayState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const info = OVERLAYS[kind];
  const d = info.defaults;
  const base: OverlayState = { ...cleanCounterLook(r, d, { anims: info.anims, sounds: info.sounds, layouts: info.layouts }) };
  const t = (key: string, max: number) => cleanText(r[key], max, d[key] as string);
  const b = (key: string) => bool(r[key], d[key] as boolean);
  switch (kind) {
    case "game":
      return { ...base, game: t("game", 60), gameLabel: t("gameLabel", 30), icon: t("icon", 8), sub: t("sub", 60), uppercase: b("uppercase"), tag: t("tag", 24), showTag: b("showTag"), recentGames: names(r.recentGames, 6, 60) };
    case "winloss":
      return {
        ...base, wins: clampN(r.wins), losses: clampN(r.losses), streak: clampN(r.streak),
        dcolor: cleanColor(r.dcolor, d.dcolor as string), colors: r.colors === "updown" ? "updown" : "kd", dtext: r.dtext === "num" ? "num" : "word",
        ratio: b("ratio"), streakOn: b("streakOn"), streakEvery: oneOfN(r.streakEvery, WIN_STREAKS, 3),
        winsLabel: t("winsLabel", 24), lossesLabel: t("lossesLabel", 24), rateLabel: t("rateLabel", 24),
      };
    case "timer": {
      const tv = (r.timer && typeof r.timer === "object" ? r.timer : {}) as Partial<TimerValue>;
      return {
        ...base,
        timer: { running: !!tv.running, base: clampN(tv.base ?? 300000, 0, 99 * 3600_000), t0: clampN(tv.t0, 0, Number.MAX_SAFE_INTEGER) },
        timerMode: r.timerMode === "up" ? "up" : "down", timerLen: oneOfN(r.timerLen, TIMER_LENGTHS, 300000),
        timerLabel: t("timerLabel", 30), doneText: t("doneText", 30), finalFlash: b("finalFlash"),
      };
    }
    case "goal":
      return { ...base, cur: clampN(r.cur), target: Math.max(1, clampN(r.target ?? 1000)), goalLabel: t("goalLabel", 30), goalDone: t("goalDone", 30), showPct: b("showPct"), autoKick: b("autoKick") };
    case "challenge":
      return { ...base, count: clampN(r.count), chLabel: t("chLabel", 30), icon: t("icon", 8), upBad: b("upBad") };
    case "discord":
      return { ...base, discordLabel: t("discordLabel", 30), invite: t("invite", 60), showOnline: b("showOnline") };
    case "ticker":
      return {
        ...base, type: ["sub", "raid"].includes(String(r.type)) ? String(r.type) : "follow", name: t("name", 40), recent: names(r.recent, 3, 40), icon: t("icon", 8),
        followLabel: t("followLabel", 30), subLabel: t("subLabel", 30), raidLabel: t("raidLabel", 30), showRecent: b("showRecent"), uppercase: b("uppercase"), showTag: b("showTag"), autoKick: b("autoKick"),
      };
  }
}

// Saving the look keeps the numbers as they are right now.
export function mergeOverlayLook(kind: OverlayKind, current: OverlayState, look: unknown): OverlayState {
  const next = { ...(look && typeof look === "object" ? look : {}) } as Record<string, unknown>;
  for (const k of OVERLAY_VALUE_KEYS[kind]) next[k] = current[k];
  return cleanOverlay(kind, next);
}

export function timerNow(st: OverlayState, now = Date.now()) {
  const t = st.timer as TimerValue;
  const run = t.running ? now - t.t0 : 0;
  return st.timerMode === "up" ? t.base + run : Math.max(0, t.base - run);
}
export const formatClock = (ms: number, up = false) => {
  const t = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

// One change, from the dashboard, a Stream Deck key or a Kick follow.
//   game:      { game }
//   winloss:   { stat: "wins"|"losses"|"both", add } or { stat, set }
//   timer:     { op: "toggle"|"restart"|"add"|"set", ms }
//   goal / challenge: { add } or { set }
//   ticker:    { type, name } (someone new) or { clear: true }
export type OverlayAction = Record<string, unknown>;
export function applyOverlayAction(kind: OverlayKind, cur: OverlayState, a: OverlayAction, now = Date.now()): OverlayState | { error: string } {
  const st = { ...cur };
  const has = (k: string) => a[k] !== undefined && a[k] !== null && a[k] !== "" && Number.isFinite(Number(a[k]));
  switch (kind) {
    case "game": {
      const g = typeof a.game === "string" ? a.game.trim().slice(0, 60) : "";
      if (!g) return { error: "Type a game." };
      if (g !== st.game) st.recentGames = [st.game as string, ...((st.recentGames as string[]) ?? []).filter((x) => x !== g && x !== st.game)].filter(Boolean).slice(0, 6);
      st.game = g;
      return st;
    }
    case "winloss": {
      const stats: Array<"wins" | "losses"> = a.stat === "both" ? ["wins", "losses"] : [a.stat === "losses" ? "losses" : "wins"];
      if (!has("set") && (!has("add") || a.stat === "both")) return { error: "Type an amount." };
      for (const s of stats) {
        const before = Number(st[s]) || 0;
        const after = clampN(has("set") ? a.set : before + Number(a.add));
        st[s] = after;
        if (s === "wins") st.streak = has("set") ? 0 : clampN((Number(st.streak) || 0) + (after - before));
        if (s === "losses" && after > before) st.streak = 0;
      }
      return st;
    }
    case "timer": {
      const t = { ...(st.timer as TimerValue) };
      const left = timerNow(st, now);
      if (a.op === "toggle") st.timer = { running: !t.running, base: left, t0: now };
      else if (a.op === "restart") st.timer = { running: true, base: st.timerMode === "up" ? 0 : Number(st.timerLen) || 300000, t0: now };
      else if (a.op === "add" && has("ms")) st.timer = { running: t.running, base: Math.max(0, left + Number(a.ms)), t0: now };
      else if (a.op === "set" && has("ms")) st.timer = { running: false, base: clampN(a.ms, 0, 99 * 3600_000), t0: now };
      else return { error: "Pick start, restart or add time." };
      return st;
    }
    case "goal":
    case "challenge": {
      const key = kind === "goal" ? "cur" : "count";
      if (has("set")) st[key] = clampN(a.set);
      else if (has("add")) st[key] = clampN((Number(st[key]) || 0) + Number(a.add));
      else return { error: "Type an amount." };
      return st;
    }
    case "ticker": {
      if (a.clear) return { ...st, name: "—", recent: [] };
      const name = typeof a.name === "string" ? a.name.trim().slice(0, 40) : "";
      if (!name) return { error: "Type a name." };
      const prev = st.name && st.name !== "—" ? [st.name as string] : [];
      return { ...st, type: ["sub", "raid"].includes(String(a.type)) ? String(a.type) : "follow", name, recent: [...prev, ...((st.recent as string[]) ?? [])].slice(0, 3) };
    }
    case "discord":
      return { error: "The Discord box updates by itself." };
  }
}
