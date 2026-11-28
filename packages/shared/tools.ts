// Streaming › Overlays › stream tools: Chat box, Stats bar, Clip marker,
// Command tips, QR code, Squad box, Poll, Spin wheel, Dice & coin,
// Predictions and First-time welcome.
//
// Each is one StreamDeckState row (key "tool:<kind>") holding
//   { settings, state, events: [{ id, type, data, at }], seq }
// The OBS page (apps/web/public/overlays/tool.html) draws `state` and plays
// each new event once. The dashboard, Stream Deck, Kick events and stream chat
// all change it through applyToolAction, so they always agree.
import { cleanCanvas } from "./counters";

export const TOOL_KINDS = ["chat", "stats", "clip", "cmds", "qr", "squad", "poll", "wheel", "dice", "predict", "welcome", "cmdfx", "afk"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
export const isToolKind = (k: unknown): k is ToolKind => TOOL_KINDS.includes(k as ToolKind);
export const toolStateKey = (k: ToolKind) => `tool:${k}`;

type Item = readonly [string | number, string, string?];
export interface ToolGroup {
  title: string;
  kind: "big" | "small" | "four";
  items: ReadonlyArray<Item>;
  font?: boolean; // show each choice in its font
  swatch?: boolean; // show each choice as a color dot
}
// Fine-tuning options, shown in fold-out groups on the dashboard.
// `show: [key, value]` only shows it while that setting has that value.
// The value can also be a list: it shows while the setting is any of them.
export type ToolField = { key: string; label: string; show?: readonly [string, string | number | boolean | ReadonlyArray<string>] } & (
  | { type: "color" }
  | { type: "colors"; max: number } // a comma list of colors
  | { type: "range"; min: number; max: number; step?: number; unit?: string }
  | { type: "switch" }
  | { type: "text"; max: number }
  | { type: "pick"; items: ReadonlyArray<Item> }
);
export interface ToolSection {
  title: string;
  fields: ToolField[];
}
export interface ToolInfo {
  kind: ToolKind;
  title: string;
  icon: string;
  line: string;
  section: "extras" | "tools";
  settings: Record<string, string | number | boolean>;
  state: Record<string, unknown>;
  groups: Record<string, ToolGroup>;
  sections?: ToolSection[];
  // Picking a "preset" group choice also sets these.
  presets?: Record<string, Record<string, string | number | boolean>>;
  toggles: Array<[string, string, string]>;
  words: Array<[string, string]>;
  // Buttons on the dashboard (and Stream Deck commands): [label, action]
  buttons: Array<[string, Record<string, unknown>]>;
  auto: string; // what fills it in by itself
}

const COLORS: Item[] = [["#f9c933", "Gold"], ["#ffffff", "White"], ["#4ade80", "Green"], ["#f87171", "Red"], ["#22d3ee", "Cyan"], ["#f472b6", "Pink"], ["#fb923c", "Orange"], ["#a78bfa", "Purple"]];
const G = {
  look: { title: "Box look", kind: "four", items: [["dark", "Dark"], ["gold", "Gold"], ["neon", "Neon"], ["clean", "White"], ["glass", "Glass"], ["military", "Army"], ["red", "Red"], ["discord", "Discord"], ["none", "No box"]] },
  font: { title: "Font", kind: "small", font: true, items: [["lilita", "Chunky"], ["bangers", "Comic"], ["russo", "Bold"], ["blackops", "Stencil"], ["bebas", "Tall"], ["luckiest", "Cartoon"], ["teko", "Sharp"], ["barlow", "Narrow"], ["fredoka", "Round"], ["marker", "Marker"]] },
  color: { title: "Color", kind: "four", swatch: true, items: COLORS },
  corners: { title: "Corners", kind: "small", items: [["round", "Round"], ["square", "Square"], ["pill", "Pill"]] },
  outline: { title: "Outline", kind: "small", items: [["thick", "Thick"], ["thin", "Thin"], ["none", "None"]] },
  size: { title: "Size", kind: "small", items: [[0.8, "Small"], [1, "Medium"], [1.25, "Big"]] },
  volume: { title: "Volume", kind: "small", items: [[0.3, "Quiet"], [0.6, "Medium"], [1, "Loud"]] },
} satisfies Record<string, ToolGroup>;
const LOOKS = { look: G.look, font: G.font, color: G.color, corners: G.corners, outline: G.outline, size: G.size };
const COMMON = { look: "dark", font: "lilita", color: "#f9c933", corners: "round", outline: "thick", size: 1, volume: 0.6 };
const SPOTS4: Item[] = [["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]];
const sound = (title: string, items: Item[]): ToolGroup => ({ title, kind: "four", items });
const IDLE: ToolGroup = { title: "While it's up", kind: "four", items: [["none", "Still"], ["float", "Float"], ["pulse", "Pulse"], ["glow", "Glow"]] };

// ---- Spin wheel: flat looks to start from, then every part can be changed ----
export const WHEEL_SLICES = 16;
// The look: a starting look sets all of these (your words and choices stay).
const WHEEL_LOOK = {
  colors: "#e5484d,#f5a524,#30a46c,#3e63dd,#8e4ec6,#d6409f", fill: "solid",
  dividers: true, dividerColor: "#ffffff", dividerWidth: 5,
  pegs: true, pegStyle: "stud", pegColor: "#d4d4d8", pegSize: 9, pegFlash: true, pegFlashColor: "#ffffff",
  textSize: 100, upper: true, textMode: "auto", textColor: "#ffffff", sOutline: false, sOutlineColor: "#000000", sOutlineWidth: 4, sShadow: false,
  rimWidth: 22, rimColor: "#ffffff", rimStyle: "flat",
  hubSize: 70, hubColor: "#ffffff", hubTextColor: "#111318", hubBorder: 0, hubBorderColor: "#d4a24c",
  pointerSide: "top", pointerStyle: "flapper", pointerColor: "#111318", pointerSize: 100, pointer3d: true, pointerShadow: true,
  lights: false, lightsColor: "#ffd98a", lightsCount: 24, lightsMode: "chase", shine: false, shadow: true, winColor: "#ffffff",
  font: "teko",
};
// Everything else about the wheel (kept when you pick a starting look).
const WHEEL_MORE = {
  perSlice: false, odds: false, extra: "[]",
  hubType: "text", hubText: "S", hubMedia: "", hubFit: "cover", hubTurns: false,
  textDir: "out", textAlign: "edge", textMove: 0, textShift: 0,
  bounce: true, bounceHard: "normal",
  spinTime: 7, turns: 6, dir: "cw", ease: "smooth", tick: true, winSound: "fanfare", idle: false,
  winHighlight: "glow", resStyle: "card", resTop: "THE WHEEL SAYS", resSecs: 6, confetti: true, remove: false, history: false,
  chatMsg: "🎡 The wheel landed on: {winner}",
  showMode: "always", enter: "zoom", leave: "zoom", enterTime: 700, hideSecs: 3,
  wheelSize: 92, place: "center", titlePos: "above", titleSize: 100,
};
const WHEEL_PRESETS: Record<string, Record<string, string | number | boolean>> = {
  clean: { ...WHEEL_LOOK },
  mono: { ...WHEEL_LOOK, colors: "#16181c,#eeeeee", dividers: false, pegColor: "#e11d48", rimColor: "#16181c", hubColor: "#eeeeee", hubTextColor: "#16181c", pointerColor: "#e11d48", font: "bebas" },
  pastel: { ...WHEEL_LOOK, colors: "#fbcfe8,#bfdbfe,#bbf7d0,#fde68a,#ddd6fe,#fed7aa", fill: "shaded", pegColor: "#e5e7eb", pointerColor: "#1f2937", hubTextColor: "#1f2937", font: "fredoka", upper: false },
  twotone: { ...WHEEL_LOOK, colors: "#d4a24c,#1b1f25", dividers: false, pegColor: "#f5f0e6", rimColor: "#2a2f36", hubColor: "#0d0f12", hubTextColor: "#d4a24c", pointerColor: "#d4a24c", font: "bebas", winColor: "#d4a24c" },
  retro: { ...WHEEL_LOOK, colors: "#e4572e,#f3a712,#29335c,#4c9f70,#b4436c", dividerColor: "#fbf5e6", pegColor: "#29335c", rimColor: "#fbf5e6", hubColor: "#fbf5e6", hubTextColor: "#e4572e", pointerColor: "#29335c", pointerStyle: "pin", font: "barlow" },
  neon: { ...WHEEL_LOOK, colors: "#22d3ee,#f472b6,#a3e635,#facc15", fill: "neon", dividerColor: "#22d3ee", dividerWidth: 3, pegColor: "#ffffff", rimWidth: 40, rimColor: "#0a0d14", lights: true, lightsColor: "#22d3ee", hubColor: "#0a0d14", hubTextColor: "#22d3ee", pointerColor: "#f472b6", shine: true, winColor: "#22d3ee" },
  olive: { ...WHEEL_LOOK, colors: "#535838,#ffc641,#6a5f31,#000000", dividerColor: "#000000", dividerWidth: 4, rimWidth: 30, rimColor: "#000000", pegColor: "#ffc641", hubColor: "#000000", hubTextColor: "#ffc641", hubBorder: 6, hubBorderColor: "#ffc641", pointerColor: "#ffc641", pointerStyle: "arrow", winColor: "#ffc641", font: "blackops", lights: true, lightsColor: "#ffc641", lightsMode: "steady", lightsCount: 20 },
};
const WHEEL_SAMPLE = ["No scope only", "10 squats", "Pistol only", "Free pass", "Chat picks my loadout", "Crouch the whole round"];
const wheelSlots = Object.fromEntries(Array.from({ length: WHEEL_SLICES }, (_, i) => [`s${i + 1}`, WHEEL_SAMPLE[i] ?? ""]));
export const wheelSlicesOf = (s: Record<string, unknown>) =>
  Array.from({ length: WHEEL_SLICES }, (_, i) => String(s[`s${i + 1}`] ?? "").trim()).filter(Boolean);
// Each slice's extras, by slot (slice 1 is [0]): its own color, text color,
// odds (1-5) and the words for when it wins.
export interface WheelExtra { c: string; tc: string; w: number; msg: string }
export interface WheelItem extends WheelExtra { t: string; slot: number }
export function cleanWheelExtra(raw: unknown): WheelExtra[] {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { v = []; }
  }
  const arr = Array.isArray(v) ? v : [];
  const hex = (x: unknown) => (typeof x === "string" && HEX.test(x) ? x.toLowerCase() : "");
  return Array.from({ length: WHEEL_SLICES }, (_, i) => {
    const x = (arr[i] && typeof arr[i] === "object" ? arr[i] : {}) as Record<string, unknown>;
    return { c: hex(x.c), tc: hex(x.tc), w: Math.max(1, Math.min(5, Math.round(Number(x.w) || 1))), msg: typeof x.msg === "string" ? x.msg.trim().slice(0, 60) : "" };
  });
}
// The slices on the wheel right now (empty ones and the ones taken off are left out).
export function wheelItemsOf(s: Record<string, unknown>, out: number[] = []): WheelItem[] {
  const ex = cleanWheelExtra(s.extra);
  const items: WheelItem[] = [];
  for (let i = 0; i < WHEEL_SLICES; i++) {
    const t = String(s[`s${i + 1}`] ?? "").trim();
    if (t && !out.includes(i + 1)) items.push({ t, slot: i + 1, ...ex[i] });
  }
  return items;
}
const wheelOut = (st: Record<string, unknown>) => (Array.isArray(st.out) ? st.out.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= WHEEL_SLICES) : []);

// ---- AFK popups: !brb, !coffee… show a card with a countdown over the game ----
export interface AfkItem {
  cmd: string; // without the !
  ico: string;
  t: string; // title
  s: string; // second line
  min: number;
  c: string; // color
}
export const AFK_MAX = 16;
export const AFK_DEFAULTS: AfkItem[] = [
  { cmd: "brb", ico: "⏳", t: "Be right back", s: "Hang tight, chat's still open", min: 5, c: "#d4a24c" },
  { cmd: "bathroom", ico: "🚽", t: "Bio break", s: "Nature called. Back in a flash", min: 3, c: "#38bdf8" },
  { cmd: "coffee", ico: "☕", t: "Coffee run", s: "Refueling. Talk amongst yourselves", min: 5, c: "#c08457" },
  { cmd: "food", ico: "🍔", t: "Grabbing food", s: "Can't game on an empty stomach", min: 10, c: "#f97316" },
  { cmd: "door", ico: "🚪", t: "At the door", s: "Someone knocked. Be right back", min: 2, c: "#a78bfa" },
  { cmd: "pet", ico: "🐾", t: "Pet duty", s: "The real boss needs me", min: 3, c: "#4ade80" },
  { cmd: "phone", ico: "📞", t: "Quick call", s: "Gotta take this one", min: 3, c: "#f472b6" },
  { cmd: "tech", ico: "🔧", t: "Fixing tech", s: "Something broke. Fixing it now", min: 5, c: "#ef4444" },
];
const HEX = /^#[0-9a-f]{6}$/i;
const cmdWord = (v: unknown) => String(v ?? "").toLowerCase().replace(/^!+/, "").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 20);
export function cleanAfkList(raw: unknown): AfkItem[] {
  let list: unknown = raw;
  if (typeof raw === "string") { try { list = JSON.parse(raw); } catch { list = null; } }
  if (!Array.isArray(list)) return AFK_DEFAULTS.map((x) => ({ ...x }));
  const seen = new Set<string>();
  const out: AfkItem[] = [];
  for (const r of list.slice(0, AFK_MAX)) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const cmd = cmdWord(o.cmd);
    if (!cmd || seen.has(cmd)) continue;
    seen.add(cmd);
    out.push({
      cmd,
      ico: String(o.ico ?? "").trim().slice(0, 8),
      t: String(o.t ?? "").trim().slice(0, 30),
      s: String(o.s ?? "").trim().slice(0, 60),
      min: Math.max(1, Math.min(120, Math.round(Number(o.min)) || 5)),
      c: HEX.test(String(o.c)) ? String(o.c) : "#d4a24c",
    });
  }
  return out;
}
export const afkListOf = (s: Record<string, unknown>) => cleanAfkList(s.list);

export const TOOLS: Record<ToolKind, ToolInfo> = {
  chat: {
    kind: "chat", title: "Chat box", icon: "💬", section: "extras", line: "Your live Kick and Twitch chat on screen.",
    settings: { ...COMMON, color: "#a78bfa", side: "left", max: 6, style: "bubbles", anim: "slide", names: "rainbow", badges: true, platformIcons: true, fade: 0, chatFont: "clean", sound: "off" },
    state: { msgs: [] },
    groups: {
      style: { title: "Style", kind: "small", items: [["bubbles", "Bubbles"], ["panel", "One panel"], ["clean", "Just text"]] },
      anim: { title: "New messages", kind: "four", items: [["slide", "Slide"], ["pop", "Pop"], ["fade", "Fade"], ["bounce", "Bounce"]] },
      side: { title: "Side", kind: "small", items: [["left", "Left"], ["right", "Right"]] },
      max: { title: "How many show", kind: "small", items: [[4, "4"], [6, "6"], [10, "10"]] },
      fade: { title: "Messages leave after", kind: "small", items: [[0, "Never"], [15, "15 sec"], [30, "30 sec"]] },
      names: { title: "Name colors", kind: "small", items: [["rainbow", "Each person"], ["accent", "All one color"]] },
      chatFont: { title: "Message font", kind: "small", items: [["clean", "Clean"], ["big", "Same as titles"]] },
      look: G.look, font: G.font, color: { ...G.color, title: "Name color (All one color)" }, corners: G.corners, size: G.size,
      sound: sound("Sound", [["off", "Off"], ["blip", "Blip"], ["pop", "Pop"], ["ding", "Ding"]]),
      volume: G.volume,
    },
    toggles: [["badges", "Badges", "🛡️ for mods, ⭐ for subs, 👑 for you."], ["platformIcons", "Where they typed", "A Kick or Twitch icon next to each name."]],
    words: [],
    buttons: [["💬 Test message", { op: "test" }], ["🧹 Clear", { op: "clear" }]],
    auto: "Messages come from your Kick and Twitch chat by themselves.",
  },
  stats: {
    kind: "stats", title: "Stats bar", icon: "📊", section: "extras", line: "One slim bar with your money, K/D, wins, goal and game.",
    settings: { ...COMMON, mode: "cycle", pos: "bottom", every: 5, showMoney: true, showKd: true, showRatio: false, showWl: true, showWinrate: false, showGoal: true, showGame: true, showTimer: false, showChallenge: false, showLatest: false, showNext: false, sound: "off" },
    state: {},
    groups: {
      mode: { title: "How it shows them", kind: "small", items: [["cycle", "One at a time"], ["row", "All in a row"], ["scroll", "Scrolling"]] },
      pos: { title: "Where", kind: "small", items: [["top", "Top"], ["bottom", "Bottom"]] },
      every: { title: "Switch every (one at a time)", kind: "small", items: [[3, "3 sec"], [5, "5 sec"], [8, "8 sec"]] },
      look: G.look, font: G.font, color: G.color, corners: G.corners, outline: G.outline,
    },
    toggles: [
      ["showMoney", "💰 Money", "From your Money Counter."],
      ["showKd", "🎯 Kills / deaths", "From your K/D Counter."],
      ["showRatio", "🎯 K/D ratio", "Kills ÷ deaths, like 3.00."],
      ["showWl", "🏆 Wins / losses", "From your Win/Loss."],
      ["showWinrate", "🏆 Win %", "Your win rate."],
      ["showGoal", "📈 Goal", "From your Goal bar."],
      ["showGame", "🎮 Game", "From your Game overlay."],
      ["showTimer", "⏱️ Timer", "From your Timer, counting live."],
      ["showChallenge", "🏋️ Challenge", "From your Challenge counter."],
      ["showLatest", "💜 Latest follower", "From your Latest follower."],
      ["showNext", "📅 Next stream", "From your schedule."],
    ],
    words: [],
    buttons: [],
    auto: "It reads the numbers from your other overlays by itself.",
  },
  clip: {
    kind: "clip", title: "Clip marker", icon: "📌", section: "tools", line: "Press a key when something good happens; Spartacus saves the time.",
    settings: { ...COMMON, color: "#ffffff", show: "both", spot: "tr", words: "CLIPPED!", bigWords: "BIG MOMENT!", sound: "shutter" },
    state: { marks: [] },
    groups: {
      show: { title: "On stream", kind: "small", items: [["both", "Flash + badge"], ["badge", "Badge only"], ["flash", "Flash only"], ["hidden", "Nothing (just save it)"]] },
      spot: { title: "Badge spot", kind: "four", items: SPOTS4 },
      ...LOOKS,
      sound: sound("Sound", [["off", "Off"], ["shutter", "Camera"], ["ding", "Ding"], ["pop", "Pop"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["words", "Badge words"], ["bigWords", "Big moment words"]],
    buttons: [["📌 Clip it", { op: "clip" }], ["⭐ Big moment", { op: "clip", big: true }], ["🧹 Clear the list", { op: "clearMarks" }]],
    auto: "Each press saves the time and how far into the stream it was.",
  },
  cmds: {
    kind: "cmds", title: "Command tips", icon: "⌨️", section: "tools", line: "Rotating tips like Type !discord, so new viewers know what to type.",
    settings: { ...COMMON, color: "#22d3ee", corners: "pill", trans: "flip", every: 8, spot: "bl", label: "TYPE IN CHAT", tip1: "!discord — join the server", tip2: "!socials — all my links", tip3: "!join — enter the giveaway", tip4: "!lurk — lurk with us", sound: "off" },
    state: {},
    groups: {
      trans: { title: "Switching tips", kind: "small", items: [["flip", "Flip"], ["slide", "Slide"], ["type", "Typing"]] },
      every: { title: "Next tip every", kind: "small", items: [[5, "5 sec"], [8, "8 sec"], [15, "15 sec"]] },
      spot: { title: "Where", kind: "four", items: SPOTS4 },
      ...LOOKS,
    },
    toggles: [],
    words: [["label", "Top words"], ["tip1", "Tip 1"], ["tip2", "Tip 2"], ["tip3", "Tip 3"], ["tip4", "Tip 4 (optional)"]],
    buttons: [["➡ Next tip", { op: "next" }], ["⏸ Pause / play", { op: "pause" }]],
    auto: "Type your own tips, like !discord — join the server.",
  },
  qr: {
    kind: "qr", title: "QR code", icon: "📲", section: "tools", line: "Scan to join your Discord or follow you.",
    settings: { ...COMMON, color: "#5865f2", link: "https://discord.gg/yourcode", label: "SCAN TO JOIN", caption: "discord.gg/yourcode", spot: "br", when: 0, idle: "float", qrColor: "dark", sound: "off" },
    state: {},
    groups: {
      when: { title: "When it shows", kind: "small", items: [[0, "Always"], [5, "Every 5 min"], [10, "Every 10 min"]] },
      spot: { title: "Where", kind: "four", items: SPOTS4 },
      qrColor: { title: "Code color", kind: "small", items: [["dark", "Black"], ["accent", "Accent color"]] },
      idle: IDLE,
      ...LOOKS,
    },
    toggles: [],
    words: [["link", "Link it opens"], ["label", "Top words"], ["caption", "Under the code"]],
    buttons: [["👀 Show now", { op: "show" }]],
    auto: "Point a phone camera at the preview to check the link.",
  },
  squad: {
    kind: "squad", title: "Squad box", icon: "🎧", section: "tools", line: "Who's in your Discord voice channel right now.",
    settings: { ...COMMON, color: "#4ade80", layout: "list", side: "left", showNames: true, label: "🎧 SQUAD", follow: "me", voiceChannelId: "", followUserId: "", sound: "off" },
    state: {},
    groups: {
      layout: { title: "Layout", kind: "small", items: [["list", "List"], ["row", "Row of faces"]] },
      side: { title: "Side", kind: "small", items: [["left", "Left"], ["right", "Right"]] },
      ...LOOKS,
      sound: sound("Sound when someone joins", [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["blip", "Blip"]]),
      volume: G.volume,
    },
    toggles: [["showNames", "Names", "Show each name."]],
    words: [["label", "Top words"]],
    buttons: [],
    auto: "Shows whichever voice channel you're in (or the one you pick), with avatars and who's muted.",
  },
  poll: {
    kind: "poll", title: "Poll", icon: "📊", section: "tools", line: "Chat votes by typing 1, 2, 3 or 4, with live bars.",
    settings: { ...COMMON, color: "#22d3ee", question: "Next game?", o1: "Siege", o2: "Valorant", o3: "", o4: "", len: 120000, how: "Type 1 or 2 in chat", bars: "solid", sound: "ding" },
    state: { votes: [0, 0, 0, 0], voters: [], t0: 0, open: false, ended: false },
    groups: {
      len: { title: "How long", kind: "four", items: [[60000, "1 min"], [120000, "2 min"], [300000, "5 min"], [0, "Until I end it"]] },
      bars: { title: "Bars", kind: "small", items: [["solid", "Solid"], ["striped", "Striped"]] },
      ...LOOKS,
      sound: sound("Sound for the result", [["off", "Off"], ["ding", "Ding"], ["fanfare", "Fanfare"], ["pop", "Pop"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["question", "Question"], ["o1", "Choice 1"], ["o2", "Choice 2"], ["o3", "Choice 3 (optional)"], ["o4", "Choice 4 (optional)"], ["how", "How to vote"]],
    buttons: [["▶ Start poll", { op: "start" }], ["🏁 End poll", { op: "end" }]],
    auto: "Votes come from Kick and Twitch chat (one vote each; typing again changes it).",
  },
  wheel: {
    kind: "wheel", title: "Spin wheel", icon: "🎡", section: "tools", line: "A wheel you spin with a button, a Stream Deck key or !spin in chat.",
    settings: { ...COMMON, color: "#ffffff", label: "🎡 CHALLENGE WHEEL", preset: "clean", ...WHEEL_LOOK, ...WHEEL_MORE, ...wheelSlots, chatSpin: true, chatPost: true, spinCmd: "spin" },
    state: {},
    groups: {
      preset: { title: "Starting look (then change anything below)", kind: "small", items: [["clean", "Clean"], ["mono", "Mono"], ["pastel", "Pastel"], ["twotone", "Two-Tone"], ["retro", "Retro"], ["neon", "Neon"], ["olive", "Olive & Gold"]] },
      font: { ...G.font, title: "Font (slices and words)" },
      look: { ...G.look, title: "Top words and result box" },
      color: { ...G.color, title: "Top words color" },
      corners: { ...G.corners, title: "Result box corners" },
      outline: { ...G.outline, title: "Text outline (top words and result)" },
      volume: G.volume,
    },
    sections: [
      { title: "📐 Size and place", fields: [
        { type: "range", key: "wheelSize", label: "Wheel size", min: 30, max: 100, unit: "%" },
        { type: "pick", key: "place", label: "Where on screen", items: [["left", "Left"], ["center", "Middle"], ["right", "Right"]] },
        { type: "pick", key: "titlePos", label: "Top words go", items: [["above", "Above the wheel"], ["below", "Below the wheel"]] },
        { type: "range", key: "titleSize", label: "Top words size", min: 50, max: 180, unit: "%" },
      ]},
      { title: "🎬 Coming in and out", fields: [
        { type: "pick", key: "showMode", label: "Show the wheel", items: [["always", "All the time"], ["spins", "Only for a spin"]] },
        { type: "pick", key: "enter", label: "How it comes in", items: [["zoom", "Zoom in"], ["drop", "Drop in"], ["rise", "Rise up"], ["spin", "Spin in"], ["slide", "Slide in"], ["fade", "Fade in"], ["none", "Just appear"]] },
        { type: "pick", key: "leave", label: "How it leaves", items: [["zoom", "Zoom out"], ["drop", "Drop down"], ["rise", "Fly up"], ["spin", "Spin out"], ["slide", "Slide out"], ["fade", "Fade out"], ["none", "Just vanish"]] },
        { type: "range", key: "enterTime", label: "How long it takes", min: 300, max: 1500, step: 100, unit: " ms" },
        { type: "range", key: "hideSecs", label: "Leaves this long after the result", min: 1, max: 30, unit: " sec", show: ["showMode", "spins"] },
      ]},
      { title: "🎨 Slices", fields: [
        { type: "switch", key: "perSlice", label: "Pick a color for each slice (in Your slices)" },
        { type: "colors", key: "colors", label: "Slice colors (they repeat around the wheel)", max: 8, show: ["perSlice", false] },
        { type: "pick", key: "fill", label: "Fill", items: [["solid", "Solid"], ["shaded", "Shaded"], ["neon", "Dark with neon edge"]] },
        { type: "switch", key: "dividers", label: "Lines between slices" },
        { type: "color", key: "dividerColor", label: "Line color", show: ["dividers", true] },
        { type: "range", key: "dividerWidth", label: "Line thickness", min: 1, max: 12, show: ["dividers", true] },
        { type: "switch", key: "odds", label: "Some slices win more often (set odds in Your slices)" },
      ]},
      { title: "🔤 Slice text", fields: [
        { type: "range", key: "textSize", label: "Size", min: 50, max: 150, unit: "%" },
        { type: "switch", key: "upper", label: "ALL CAPS" },
        { type: "pick", key: "textMode", label: "Text color", items: [["auto", "Black or white for me"], ["one", "One color"], ["slice", "Per slice"]] },
        { type: "color", key: "textColor", label: "Color", show: ["textMode", "one"] },
        { type: "pick", key: "textDir", label: "Direction", items: [["out", "Out from the center"], ["across", "Across the slice"], ["curve", "Curved"]] },
        { type: "pick", key: "textAlign", label: "Line up", items: [["edge", "Near the edge"], ["middle", "Middle"], ["center", "Near the center"]] },
        { type: "range", key: "textMove", label: "Move toward the edge (+) or center (−)", min: -150, max: 150 },
        { type: "range", key: "textShift", label: "Move sideways", min: -60, max: 60 },
        { type: "switch", key: "sOutline", label: "Outline" },
        { type: "color", key: "sOutlineColor", label: "Outline color", show: ["sOutline", true] },
        { type: "range", key: "sOutlineWidth", label: "Outline thickness", min: 1, max: 10, show: ["sOutline", true] },
        { type: "switch", key: "sShadow", label: "Shadow" },
      ]},
      { title: "⭕ Center", fields: [
        { type: "pick", key: "hubType", label: "What's in the center", items: [["text", "Letters"], ["image", "Picture"], ["video", "Video"], ["none", "Nothing"]] },
        { type: "text", key: "hubText", label: "Letters (up to 6)", max: 6, show: ["hubType", "text"] },
        { type: "color", key: "hubTextColor", label: "Letter color", show: ["hubType", "text"] },
        { type: "pick", key: "hubFit", label: "Fit", items: [["cover", "Fill the circle"], ["contain", "Fit inside"]], show: ["hubType", ["image", "video"]] },
        { type: "switch", key: "hubTurns", label: "Turns with the wheel", show: ["hubType", ["text", "image", "video"]] },
        { type: "range", key: "hubSize", label: "Size", min: 0, max: 220 },
        { type: "color", key: "hubColor", label: "Background" },
        { type: "range", key: "hubBorder", label: "Ring thickness", min: 0, max: 24 },
        { type: "color", key: "hubBorderColor", label: "Ring color" },
      ]},
      { title: "🛞 Rim, pegs and lights", fields: [
        { type: "range", key: "rimWidth", label: "Rim thickness", min: 0, max: 60 },
        { type: "color", key: "rimColor", label: "Rim color" },
        { type: "pick", key: "rimStyle", label: "Rim finish", items: [["flat", "Flat"], ["metal", "Metal"]] },
        { type: "switch", key: "pegs", label: "Pegs on the edge (the pointer hits them)" },
        { type: "pick", key: "pegStyle", label: "Peg shape", items: [["stud", "Round studs"], ["dot", "Flat dots"], ["bar", "Bars"], ["diamond", "Diamonds"]], show: ["pegs", true] },
        { type: "color", key: "pegColor", label: "Peg color", show: ["pegs", true] },
        { type: "range", key: "pegSize", label: "Peg size", min: 4, max: 30, show: ["pegs", true] },
        { type: "switch", key: "pegFlash", label: "Pegs flash when the pointer hits them", show: ["pegs", true] },
        { type: "color", key: "pegFlashColor", label: "Flash color", show: ["pegFlash", true] },
        { type: "switch", key: "lights", label: "Lights on the rim (needs a rim 12 or thicker)" },
        { type: "color", key: "lightsColor", label: "Light color", show: ["lights", true] },
        { type: "range", key: "lightsCount", label: "How many lights", min: 8, max: 48, step: 4, show: ["lights", true] },
        { type: "pick", key: "lightsMode", label: "Light pattern", items: [["chase", "Chase"], ["blink", "Blink"], ["steady", "Always on"]], show: ["lights", true] },
        { type: "switch", key: "shine", label: "Shine" },
        { type: "switch", key: "shadow", label: "Shadow under the wheel" },
      ]},
      { title: "📍 Pointer", fields: [
        { type: "pick", key: "pointerSide", label: "Where", items: [["top", "Top"], ["right", "Right"], ["bottom", "Bottom"], ["left", "Left"]] },
        { type: "pick", key: "pointerStyle", label: "Shape", items: [["flapper", "Flapper"], ["triangle", "Triangle"], ["arrow", "Arrow"], ["pin", "Pin"], ["notch", "Thin"]] },
        { type: "color", key: "pointerColor", label: "Color" },
        { type: "range", key: "pointerSize", label: "Size", min: 50, max: 160, unit: "%" },
        { type: "switch", key: "pointer3d", label: "3D shading" },
        { type: "switch", key: "pointerShadow", label: "Shadow" },
        { type: "switch", key: "bounce", label: "Bends on each peg" },
        { type: "pick", key: "bounceHard", label: "How much it bends", items: [["soft", "A little"], ["normal", "Normal"], ["strong", "A lot"]], show: ["bounce", true] },
      ]},
      { title: "🌀 Spin", fields: [
        { type: "range", key: "spinTime", label: "Spin time", min: 3, max: 20, unit: " sec" },
        { type: "range", key: "turns", label: "Turns before it stops", min: 2, max: 15 },
        { type: "pick", key: "dir", label: "Direction", items: [["cw", "Clockwise"], ["ccw", "Counter-clockwise"]] },
        { type: "pick", key: "ease", label: "How it slows down", items: [["smooth", "Smooth"], ["tense", "Slow, tense finish"], ["quick", "Quick stop"]] },
        { type: "switch", key: "tick", label: "Tick sound on each peg" },
        { type: "pick", key: "winSound", label: "Win sound", items: [["fanfare", "Fanfare"], ["ding", "Ding"], ["airhorn", "Air horn"], ["drumroll", "Drum"], ["off", "None"]] },
        { type: "switch", key: "idle", label: "Turn slowly while waiting" },
      ]},
      { title: "🏆 When it lands", fields: [
        { type: "pick", key: "winHighlight", label: "The winning slice", items: [["glow", "Glows"], ["dim", "Others go dark"], ["both", "Both"], ["none", "Nothing"]] },
        { type: "color", key: "winColor", label: "Winner color" },
        { type: "pick", key: "resStyle", label: "Show the result", items: [["card", "Box on the wheel"], ["banner", "Banner at the bottom"], ["big", "Big across the screen"], ["off", "Don't show it"]] },
        { type: "text", key: "resTop", label: "Top line of the result", max: 30 },
        { type: "range", key: "resSecs", label: "Show it for", min: 2, max: 20, unit: " sec" },
        { type: "switch", key: "confetti", label: "Confetti" },
        { type: "switch", key: "remove", label: "Take the winner off the wheel (Put slices back brings them back)" },
        { type: "switch", key: "history", label: "Show the last 5 results" },
        { type: "text", key: "chatMsg", label: "Chat message ({winner} is the slice)", max: 80 },
      ]},
    ],
    presets: WHEEL_PRESETS,
    toggles: [
      ["chatSpin", "!spin in chat", "You and your mods can spin it by typing it in Kick or Twitch chat. The Lumia link works either way."],
      ["chatPost", "Post the result in chat", "Says what it landed on when it stops (needs your account connected)."],
    ],
    words: [["label", "Top words"], ["spinCmd", "Chat command (without the !)"]],
    buttons: [["🎡 Spin", { op: "spin" }], ["↩️ Put slices back", { op: "putback" }]],
    auto: "Up to 16 slices. Set them in Your slices below.",
  },
  dice: {
    kind: "dice", title: "Dice & coin", icon: "🎲", section: "tools", line: "Roll dice or flip a coin on stream to settle bets with chat.",
    settings: { ...COMMON, count: 2, dieColor: "white", heads: "HEADS", tails: "TAILS", sound: "pop" },
    state: {},
    groups: {
      count: { title: "Dice", kind: "small", items: [[1, "1 die"], [2, "2 dice"], [3, "3 dice"]] },
      dieColor: { title: "Dice color", kind: "four", items: [["white", "White"], ["red", "Red"], ["black", "Black"], ["gold", "Gold"]] },
      look: { ...G.look, title: "Result box look" }, font: G.font, color: G.color, size: G.size,
      sound: sound("Sound", [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["coin", "Coin"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["heads", "Heads words"], ["tails", "Tails words"]],
    buttons: [["🎲 Roll dice", { op: "roll" }], ["🪙 Flip coin", { op: "flip" }]],
    auto: "",
  },
  predict: {
    kind: "predict", title: "Predictions", icon: "🔮", section: "tools", line: "Chat bets points on YES or NO, and you settle it.",
    settings: { ...COMMON, color: "#a78bfa", question: "Will I win this match?", yes: "YES", no: "NO", yesColor: "#22d3ee", noColor: "#f472b6", len: 60000, start: 1000, sound: "fanfare" },
    state: { pool: [0, 0], bettors: [0, 0], bets: {}, t0: 0, phase: "idle", winner: -1, top: ["", 0] },
    groups: {
      len: { title: "Betting open for", kind: "four", items: [[30000, "30 sec"], [60000, "1 min"], [120000, "2 min"], [0, "Until I lock"]] },
      yesColor: { title: "Yes color", kind: "four", swatch: true, items: COLORS },
      noColor: { title: "No color", kind: "four", swatch: true, items: COLORS },
      ...LOOKS,
      sound: sound("Sound for the result", [["off", "Off"], ["fanfare", "Fanfare"], ["ding", "Ding"], ["airhorn", "Airhorn"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["question", "Question"], ["yes", "Yes side"], ["no", "No side"]],
    buttons: [["▶ Open betting", { op: "open" }], ["🔒 Lock", { op: "lock" }], ["✅ Yes won", { op: "settle", side: 0 }], ["❌ No won", { op: "settle", side: 1 }]],
    auto: "Chat types !bet yes 100 or !bet no 50. Everyone starts each prediction with 1,000 points; winners split the pot. (Points here aren't your server's coins.)",
  },
  welcome: {
    kind: "welcome", title: "First-time welcome", icon: "👋", section: "tools", line: "Welcomes people the first time they chat.",
    settings: { ...COMMON, color: "#4ade80", corners: "pill", spot: "tl", anim: "slide", words: "Welcome {name}! First time here", backWords: "Welcome back {name}!", back: true, hold: 5, sound: "pop" },
    state: { seen: {} },
    groups: {
      anim: { title: "How it comes in", kind: "four", items: [["slide", "Slide"], ["pop", "Pop"], ["bounce", "Bounce"], ["wave", "Wave"]] },
      spot: { title: "Where", kind: "four", items: SPOTS4 },
      hold: { title: "Stays up for", kind: "small", items: [[3, "3 sec"], [5, "5 sec"], [8, "8 sec"]] },
      ...LOOKS,
      sound: sound("Sound", [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["blip", "Blip"]]),
      volume: G.volume,
    },
    toggles: [["back", "Welcome back", "Also welcomes people who haven't chatted in 30 days."]],
    words: [["words", "New chatter words ({name} = their name)"], ["backWords", "Welcome back words"]],
    buttons: [["👋 Test", { op: "test" }]],
    auto: "Fires by itself the first time someone chats in your Kick or Twitch chat.",
  },
  cmdfx: {
    kind: "cmdfx", title: "Command alerts", icon: "📣", section: "tools", line: "The sounds and pop-ups from your chat commands, and the link to Lumia Stream, Streamer.bot and OBS.",
    settings: { ...COMMON, color: "#fb923c", spot: "center", hold: 3, volume: 0.6, sounds: true, popups: true, apps: true, sound: "off" },
    state: {},
    groups: {
      spot: { title: "Where pop-ups show", kind: "four", items: [["center", "Middle"], ["top", "Top"], ["bottom", "Bottom"], ["tl", "Top left"]] },
      hold: { title: "Pop-ups stay for", kind: "small", items: [[2, "2 sec"], [3, "3 sec"], [5, "5 sec"]] },
      ...LOOKS,
      volume: G.volume,
    },
    toggles: [
      ["sounds", "Sounds", "Play each command's sound."],
      ["popups", "Pop-ups", "Show each command's pop-up."],
      ["apps", "Other apps", "Send to Lumia Stream, Streamer.bot and OBS on this PC."],
    ],
    words: [],
    buttons: [["📣 Test pop-up", { op: "test" }]],
    auto: "Set the commands up on the Chat Commands page. This overlay must be open in OBS for sounds, pop-ups and other apps to work.",
  },
  afk: {
    kind: "afk", title: "AFK popups", icon: "☕", section: "tools", line: "!brb, !coffee, !bathroom… show a popup with a countdown over your game. The stream stays live.",
    settings: {
      style: "card", pos: "bl", font: "teko", textColor: "#ffffff", bg: "#111418", bgOpacity: 94, eachColor: true, color: "#d4a24c",
      radius: 14, scale: 100, showIcon: true, showSub: true, showTimer: true, showBar: true, dim: true,
      who: "mods", chatPost: true, backCmd: "back", backWords: "WELCOME BACK", sound: "whoosh", volume: 0.6,
      list: JSON.stringify(AFK_DEFAULTS),
    },
    state: { cur: null, t0: 0, len: 0 },
    groups: {
      style: { title: "Style", kind: "small", items: [["card", "Corner card"], ["banner", "Banner"], ["full", "Full screen"]] },
      pos: { title: "Where (card and banner)", kind: "four", items: SPOTS4 },
      font: G.font,
      who: { title: "Who can use them in chat", kind: "small", items: [["mods", "Me and mods"], ["me", "Only me"]] },
      sound: sound("Sound when it pops up", [["off", "Off"], ["whoosh", "Whoosh"], ["ding", "Ding"], ["pop", "Pop"]]),
      volume: G.volume,
    },
    sections: [
      { title: "🎨 Look", fields: [
        { type: "color", key: "textColor", label: "Text color" },
        { type: "color", key: "bg", label: "Background" },
        { type: "range", key: "bgOpacity", label: "Background strength", min: 0, max: 100, unit: "%" },
        { type: "switch", key: "eachColor", label: "Each command uses its own color" },
        { type: "color", key: "color", label: "Color for all of them", show: ["eachColor", false] },
        { type: "range", key: "radius", label: "Round corners", min: 0, max: 40 },
        { type: "range", key: "scale", label: "Size", min: 60, max: 140, unit: "%" },
      ]},
      { title: "👀 What shows", fields: [
        { type: "switch", key: "showIcon", label: "Icon" },
        { type: "switch", key: "showSub", label: "Second line" },
        { type: "switch", key: "showTimer", label: "Countdown" },
        { type: "switch", key: "showBar", label: "Progress bar (ring on Full screen)" },
        { type: "switch", key: "dim", label: "Darken the screen (Full screen)" },
      ]},
    ],
    toggles: [["chatPost", "Post in chat", "Like \"Coffee run ☕ back in 5 min\", and how long you were gone on !back (needs your account connected)."]],
    words: [["backCmd", "Clear command (without the !)"], ["backWords", "Words when you're back"]],
    buttons: [["👋 I'm back (clear it)", { op: "back" }]],
    auto: "Type a command in Kick or Twitch chat, like !coffee. Add a number to set the minutes: !coffee 8.",
  },
};

// Stream Deck: the Overlay Tool key's choices. [value, label, kind, action]
export const TOOL_COMMANDS: Array<[string, string, ToolKind, Record<string, unknown>]> = [
  ["clip", "📌 Clip it", "clip", { op: "clip" }],
  ["clipbig", "⭐ Big moment", "clip", { op: "clip", big: true }],
  ["spin", "🎡 Spin the wheel", "wheel", { op: "spin" }],
  ["roll", "🎲 Roll dice", "dice", { op: "roll" }],
  ["flip", "🪙 Flip a coin", "dice", { op: "flip" }],
  ["pollStart", "📊 Start poll", "poll", { op: "start" }],
  ["pollEnd", "🏁 End poll", "poll", { op: "end" }],
  ["predOpen", "🔮 Open betting", "predict", { op: "open" }],
  ["predLock", "🔒 Lock betting", "predict", { op: "lock" }],
  ["predYes", "✅ Prediction: Yes won", "predict", { op: "settle", side: 0 }],
  ["predNo", "❌ Prediction: No won", "predict", { op: "settle", side: 1 }],
  ["qrShow", "📲 Show QR code", "qr", { op: "show" }],
  ["tipNext", "⌨️ Next command tip", "cmds", { op: "next" }],
];

// ---- Saving ----
export interface ToolEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
  at: number;
}
export interface ToolRow {
  settings: Record<string, string | number | boolean>;
  state: Record<string, unknown>;
  events: ToolEvent[];
  seq: number;
}

// Settings are the defaults' keys only, each kept to its default's type.
export function cleanToolSettings(kind: ToolKind, raw: unknown): ToolRow["settings"] {
  const d = TOOLS[kind].settings;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ToolRow["settings"] = {};
  for (const [k, def] of Object.entries(d)) {
    const v = r[k];
    if (typeof def === "number") out[k] = Number.isFinite(Number(v)) && v !== "" && v !== null && v !== undefined ? Math.max(-1e12, Math.min(1e12, Number(v))) : def;
    else if (typeof def === "boolean") out[k] = typeof v === "boolean" ? v : def;
    else out[k] = typeof v === "string" ? v.slice(0, k === "link" ? 300 : k === "list" ? 4000 : k === "extra" ? 3000 : k === "hubMedia" ? 400 : 120) : def;
  }
  // The wheel used to have a "pick black or white for me" switch.
  if (kind === "wheel" && r.textMode === undefined && r.autoText === false) out.textMode = "one";
  // Only the choices on offer, for the ones picked from a list.
  for (const [k, g] of Object.entries(TOOLS[kind].groups)) {
    // Color picks also take your own hex code.
    if (g.swatch && HEX.test(String(out[k]))) out[k] = String(out[k]).toLowerCase();
    else if (!g.items.some(([id]) => String(id) === String(out[k]))) out[k] = d[k];
    else if (typeof d[k] === "number") out[k] = Number(out[k]);
  }
  for (const f of (TOOLS[kind].sections ?? []).flatMap((x) => x.fields)) {
    const v = out[f.key];
    if (f.type === "color" && !HEX.test(String(v))) out[f.key] = d[f.key];
    if (f.type === "colors") {
      const list = String(v).split(",").map((c) => c.trim()).filter((c) => HEX.test(c)).slice(0, f.max);
      out[f.key] = list.length ? list.join(",") : d[f.key];
    }
    if (f.type === "range") out[f.key] = Math.max(f.min, Math.min(f.max, Number(v)));
    if (f.type === "text") out[f.key] = String(v).slice(0, f.max);
    if (f.type === "pick" && !f.items.some(([id]) => String(id) === String(v))) out[f.key] = d[f.key];
  }
  if (out.color && !HEX.test(String(out.color))) out.color = d.color;
  if (typeof out.spinCmd === "string") out.spinCmd = cmdWord(out.spinCmd) || "spin";
  if (typeof out.backCmd === "string") out.backCmd = cmdWord(out.backCmd) || "back";
  if (kind === "afk") out.list = JSON.stringify(cleanAfkList(out.list));
  if (kind === "wheel") {
    out.extra = JSON.stringify(cleanWheelExtra(out.extra));
    // Only a web link (an uploaded file gets one from the API).
    if (!/^https:\/\/[^\s"'<>]+$/i.test(String(out.hubMedia))) out.hubMedia = "";
  }
  // The OBS browser source size (the tools are made for 1920x1080).
  Object.assign(out, cleanCanvas(r.canvasW, r.canvasH, 1920, 1080));
  return out;
}
export function cleanToolRow(kind: ToolKind, raw: unknown): ToolRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ToolRow>;
  return {
    settings: cleanToolSettings(kind, r.settings),
    state: { ...TOOLS[kind].state, ...(r.state && typeof r.state === "object" ? r.state : {}) },
    events: Array.isArray(r.events) ? r.events.slice(-15) : [],
    seq: Number(r.seq) || 0,
  };
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const SAMPLE = ["xNova", "PixelPete", "Lena_GG", "SkyBlaze", "Mo_Plays", "QuietStorm", "Kai2k", "Jules", "RazorFox", "BeanzTV"];
const str = (x: unknown, n = 60) => (typeof x === "string" ? x.trim().slice(0, n) : "");

function push(row: ToolRow, type: string, data: Record<string, unknown> = {}, now = Date.now()) {
  row.seq += 1;
  row.events = [...row.events, { id: row.seq, type, data, at: now }].slice(-15);
}

// One change: from the dashboard, a Stream Deck key, a Kick event or chat.
// Returns the new row, or { error } in plain words.
export function applyToolAction(kind: ToolKind, current: ToolRow, a: Record<string, unknown>, now = Date.now()): ToolRow | { error: string } {
  const row: ToolRow = { settings: current.settings, state: { ...current.state }, events: [...current.events], seq: current.seq };
  const s = row.settings;
  const st = row.state as Record<string, any>;
  const op = String(a.op ?? "");
  switch (kind) {
    case "chat": {
      if (op === "clear") return { ...row, state: { ...st, msgs: [] } };
      const text = str(a.text, 300) || (op === "test" ? "This is what chat looks like on stream 👋" : "");
      if (!text) return { error: "Nothing to show." };
      const msg = { id: now + Math.random(), name: str(a.name, 40) || "Spartacus", text, badge: str(a.badge, 4), platform: str(a.platform, 10) };
      st.msgs = [...(Array.isArray(st.msgs) ? st.msgs : []), msg].slice(-20);
      return row;
    }
    case "qr":
    case "cmds":
      push(row, op || "flash", {}, now);
      return row;
    case "clip": {
      if (op === "clearMarks") return { ...row, state: { ...st, marks: [] } };
      const big = !!a.big;
      const into = Number(a.into) > 0 ? Number(a.into) : null;
      st.marks = [...(Array.isArray(st.marks) ? st.marks : []), { at: now, into, big }].slice(-200);
      push(row, "clip", { big }, now);
      return row;
    }
    case "poll": {
      const choices = [s.o1, s.o2, s.o3, s.o4].map((x) => String(x || "").trim());
      if (op === "start") { st.votes = [0, 0, 0, 0]; st.voters = []; st.t0 = now; st.open = true; st.ended = false; push(row, "start", {}, now); return row; }
      if (op === "end") { if (!st.open) return { error: "There's no poll running." }; st.open = false; st.ended = true; push(row, "end", {}, now); return row; }
      if (op === "vote") {
        const i = Number(a.choice) - 1, user = str(a.user, 40).toLowerCase();
        if (!st.open || !(i >= 0 && i < 4) || !choices[i] || !user) return row;
        if (Number(s.len) && now - st.t0 > Number(s.len)) { st.open = false; st.ended = true; push(row, "end", {}, now); return row; }
        const voters: Array<[string, number]> = Array.isArray(st.voters) ? st.voters : [];
        const prev = voters.find((v) => v[0] === user);
        const votes = [...(st.votes as number[])];
        if (prev) { if (prev[1] === i) return row; votes[prev[1]]--; prev[1] = i; } else voters.push([user, i]);
        votes[i]++;
        st.votes = votes; st.voters = voters.slice(-5000);
        return row;
      }
      return { error: "Start or end the poll." };
    }
    case "wheel": {
      const out = wheelOut(st);
      if (op === "putback") {
        if (!out.length) return { error: "Every slice is already on the wheel." };
        st.out = [];
        push(row, "putback", {}, now);
        return row;
      }
      const items = wheelItemsOf(s, out);
      if (!items.length) return { error: out.length ? "Every slice was taken off. Press Put slices back." : "Add at least one slice." };
      if (out.length && items.length < 2) return { error: "Only one slice is left. Press Put slices back." };
      // One spin at a time (a little grace for coming in and the rock back at the end).
      const busyFor = (Number(s.spinTime) || 7) * 1000 + 800 + (s.showMode === "spins" ? Number(s.enterTime) || 700 : 0);
      if (now - (Number(st.spunAt) || 0) < busyFor) return { error: "It's still spinning." };
      // Odds: a 3× slice is 3 times as likely (and drawn 3 times as big).
      const ws = items.map((x) => (s.odds ? x.w : 1));
      let r = Math.random() * ws.reduce((a, b) => a + b, 0), index = items.length - 1;
      for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) { index = i; break; } }
      const win = items[index];
      push(row, "spin", { index, slot: win.slot, result: win.t, msg: win.msg, out }, now);
      st.last = win.t;
      st.lastMsg = win.msg;
      st.spunAt = now;
      if (s.remove) st.out = [...out, win.slot];
      return row;
    }
    case "afk": {
      if (op === "back") {
        if (!st.cur) return { error: "Nothing is up right now." };
        push(row, "back", { gone: Math.max(0, now - (Number(st.t0) || now)) }, now);
        st.cur = null; st.t0 = 0; st.len = 0;
        return row;
      }
      if (op !== "start") return { error: "Pick a command." };
      const list = afkListOf(s);
      const want = cmdWord(a.cmd);
      const item = list.find((x) => x.cmd === want) ?? (Number.isInteger(a.i) ? list[Number(a.i)] : undefined);
      if (!item) return { error: "No AFK command like that." };
      const min = Number(a.min) > 0 ? Math.max(1, Math.min(120, Math.round(Number(a.min)))) : item.min;
      st.cur = { ...item, min, id: now };
      st.t0 = now; st.len = min * 60000;
      push(row, "start", { cmd: item.cmd }, now);
      return row;
    }
    case "dice": {
      if (op === "flip") { const heads = Math.random() < 0.5; push(row, "flip", { heads }, now); st.last = heads ? s.heads : s.tails; return row; }
      const nums = Array.from({ length: Math.max(1, Math.min(3, Number(s.count) || 1)) }, () => 1 + Math.floor(Math.random() * 6));
      push(row, "roll", { nums }, now);
      st.last = nums.join(" + ");
      return row;
    }
    case "predict": {
      if (op === "open") { st.pool = [0, 0]; st.bettors = [0, 0]; st.bets = {}; st.t0 = now; st.phase = "open"; st.winner = -1; st.top = ["", 0]; push(row, "open", {}, now); return row; }
      if (op === "lock") { if (st.phase !== "open") return { error: "Betting isn't open." }; st.phase = "locked"; return row; }
      if (op === "settle") {
        if (st.phase !== "open" && st.phase !== "locked") return { error: "Open betting first." };
        st.phase = "done"; st.winner = Number(a.side) === 1 ? 1 : 0;
        push(row, "settle", { side: st.winner }, now);
        return row;
      }
      if (op === "bet") {
        const user = str(a.user, 40).toLowerCase(), side = Number(a.side) === 1 ? 1 : 0, amt = Math.floor(Number(a.amount));
        if (st.phase !== "open" || !user || !(amt > 0)) return row;
        if (Number(s.len) && now - st.t0 > Number(s.len)) { st.phase = "locked"; return row; }
        const bets: Record<string, [number, number]> = { ...(st.bets ?? {}) };
        if (bets[user]) return row; // one bet each
        const amount = Math.min(amt, Number(s.start) || 1000);
        bets[user] = [side, amount];
        const pool = [...st.pool], bettors = [...st.bettors];
        pool[side] += amount; bettors[side]++;
        st.bets = bets; st.pool = pool; st.bettors = bettors;
        if (amount > (st.top?.[1] ?? 0)) st.top = [str(a.user, 40), amount];
        return row;
      }
      return { error: "Open, lock or settle." };
    }
    case "welcome": {
      const name = str(a.name, 40) || pick(SAMPLE);
      if (op === "chat") {
        // Kept per name: the last time they chatted.
        const seen: Record<string, number> = { ...(st.seen ?? {}) };
        const key = name.toLowerCase(), last = seen[key];
        seen[key] = now;
        const keys = Object.keys(seen);
        if (keys.length > 20000) for (const k of keys.sort((x, y) => seen[x] - seen[y]).slice(0, 2000)) delete seen[k];
        st.seen = seen;
        if (!last) push(row, "welcome", { name, back: false }, now);
        else if (s.back && now - last > 30 * 86400_000) push(row, "welcome", { name, back: true }, now);
        return row;
      }
      push(row, "welcome", { name, back: !!a.back }, now);
      return row;
    }
    case "cmdfx": {
      // One command going off: { sound, soundUrl, emoji, text, style, app, appv }.
      const d = (x: unknown, n: number) => str(x, n);
      if (op === "test") { push(row, "fire", { sound: "ding", emoji: "📣", text: "Command alerts work!", style: "pop", popup: true }, now); return row; }
      if (op !== "fire") return { error: "Nothing to show." };
      push(row, "fire", {
        sound: d(a.sound, 20), soundUrl: /^https:\/\//i.test(String(a.soundUrl ?? "")) ? d(a.soundUrl, 400) : "",
        emoji: d(a.emoji, 8), text: d(a.text, 120), style: d(a.style, 10), popup: !!a.popup,
        app: d(a.app, 20), appv: d(a.appv, 80), user: d(a.user, 40), cmd: d(a.cmd, 30),
      }, now);
      return row;
    }
    case "stats":
    case "squad":
      return { error: "This one fills in by itself." };
  }
}

// What's "live" (read fresh, never saved): sent to the overlay next to state.
export interface ToolLive {
  [key: string]: unknown;
}
