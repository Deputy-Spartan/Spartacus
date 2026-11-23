// Streaming › Money Counter and K/D Counter: the look settings both overlays
// share. The overlay engine is apps/web/public/overlays/counter-engine.js and
// reads these same names.

export type Choice<T extends string | number = string> = readonly [T, string];
export type AnimChoice = readonly [string, string, string];

export const COUNTER_SPOTS = [
  ["right", "→ Right"],
  ["left", "← Left"],
  ["above", "↑ Above"],
  ["below", "↓ Below"],
  ["over", "On the number"],
  ["corner", "↗ Corner"],
] as const;
export const COUNTER_LOOKS = [
  ["dark", "Dark"],
  ["gold", "Gold"],
  ["neon", "Neon"],
  ["clean", "White"],
  ["glass", "Glass"],
  ["military", "Army"],
  ["red", "Red"],
  ["discord", "Discord"],
  ["none", "No box"],
] as const;
// [id, name on the button, the font itself for the button]
export const COUNTER_FONTS = [
  ["lilita", "Chunky", "Lilita One"],
  ["bangers", "Comic", "Bangers"],
  ["russo", "Bold", "Russo One"],
  ["blackops", "Stencil", "Black Ops One"],
  ["bebas", "Tall", "Bebas Neue"],
  ["luckiest", "Cartoon", "Luckiest Guy"],
] as const;
export const COUNTER_CORNERS = [
  ["round", "Round"],
  ["square", "Square"],
  ["pill", "Pill"],
] as const;
export const COUNTER_OUTLINES = [
  ["thick", "Thick"],
  ["thin", "Thin"],
  ["none", "None"],
] as const;
export const COUNTER_IDLES = [
  ["none", "Still"],
  ["float", "Float"],
  ["pulse", "Pulse"],
  ["shine", "Shine"],
] as const;
export const COUNTER_COLORS = [
  ["#f9c933", "Gold"],
  ["#ffffff", "White"],
  ["#4ade80", "Green"],
  ["#f87171", "Red"],
  ["#22d3ee", "Cyan"],
  ["#f472b6", "Pink"],
  ["#fb923c", "Orange"],
  ["#a78bfa", "Purple"],
] as const;
export const COUNTER_DSTYLES = [
  ["text", "Outlined text"],
  ["pill", "Pill badge"],
] as const;
export const COUNTER_DSIZES = [
  [0.75, "Small"],
  [1, "Medium"],
  [1.4, "Big"],
] as const;
export const COUNTER_SPEEDS = [
  [0.6, "Slow"],
  [1, "Normal"],
  [1.6, "Fast"],
] as const;
export const COUNTER_VOLUMES = [
  [0.3, "Quiet"],
  [0.6, "Medium"],
  [1, "Loud"],
] as const;

const ANIM_START: AnimChoice[] = [
  ["bounce", "Bounce", "Hops and the amount bounces in."],
  ["float", "Float", "Floats all the time. The amount drifts up."],
  ["slam", "Slam", "The amount slams down and it shakes."],
  ["burst", "Burst", "Bits pop out of the number."],
  ["slot", "Slot machine", "The digits spin like a slot machine."],
  ["pop", "Pop", "The number jumps big and wiggles."],
];
const ANIM_END: AnimChoice[] = [
  ["jackpot", "Jackpot", "Glows gold and sparkles fly out."],
  ["spin", "Spin", "Flips all the way round, then counts."],
  ["glitch", "Glitch", "Jitters with a red and blue split, then snaps."],
];
export const MONEY_ANIMS: AnimChoice[] = [...ANIM_START, ["rain", "Money rain", "💵 rain down when you add. 💸 fly away when you take."], ...ANIM_END];
export const KD_ANIMS: AnimChoice[] = [...ANIM_START, ["bullets", "Bullets", "Bullets fly in and hit the wall: holes and sparks."], ...ANIM_END];

export const MONEY_SOUNDS = [
  ["off", "Off"],
  ["chaching", "Cha-ching"],
  ["coin", "Coin"],
  ["pop", "Pop"],
] as const;
export const KD_SOUNDS = [
  ["off", "Off"],
  ["gunshot", "Gunshot"],
  ["hitmarker", "Hitmarker"],
  ["ding", "Ding"],
] as const;

// Everything both overlays have.
export interface CounterLook {
  size: number; // percent
  anim: string; // how it moves when a number changes
  spot: string; // where the +/- shows
  look: string; // the box
  font: string;
  corners: string;
  outline: string;
  idle: string; // what it does while nothing's happening
  color: string; // the (first) number's color
  dstyle: string; // the +/-: outlined letters or a badge
  dsize: number;
  speed: number;
  sound: string;
  volume: number;
  layout: string;
  canvasW?: number; // the OBS browser source size (preview and OBS link)
  canvasH?: number;
}

// Canvas sizes for the OBS browser source: [width, height, name].
export const CANVAS_SIZES = [
  [1400, 500, "Wide"],
  [1000, 400, "Medium"],
  [700, 300, "Small"],
  [1920, 1080, "Full screen"],
  [1280, 720, "720p screen"],
] as const;
export const cleanCanvas = (w: unknown, h: unknown, dw: number, dh: number) => {
  const n = (x: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.max(lo, Math.min(hi, Math.round(Number(x)))) : d);
  return { canvasW: n(w, 200, 3840, dw), canvasH: n(h, 100, 2160, dh) };
};

const oneOf = <T extends string | number>(v: unknown, list: ReadonlyArray<readonly [T, ...unknown[]]>, d: T): T =>
  list.some(([id]) => id === v) ? (v as T) : list.some(([id]) => typeof id === "number" && id === Number(v)) ? (Number(v) as T) : d;
export const cleanText = (x: unknown, max: number, d: string) => (typeof x === "string" ? x.slice(0, max) : d);
export const cleanColor = (x: unknown, d: string) => (typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : d);

export function cleanCounterLook(
  r: Record<string, unknown>,
  d: CounterLook,
  lists: { anims: ReadonlyArray<AnimChoice>; sounds: ReadonlyArray<Choice>; layouts: ReadonlyArray<Choice> },
): CounterLook {
  const size = Math.round(Number(r.size));
  return {
    size: Number.isFinite(size) ? Math.max(30, Math.min(250, size)) : d.size,
    anim: oneOf(r.anim, lists.anims, d.anim),
    spot: oneOf(r.spot, COUNTER_SPOTS, d.spot),
    look: oneOf(r.look, COUNTER_LOOKS, d.look),
    font: oneOf(r.font, COUNTER_FONTS, d.font),
    corners: oneOf(r.corners, COUNTER_CORNERS, d.corners),
    outline: oneOf(r.outline, COUNTER_OUTLINES, d.outline),
    idle: oneOf(r.idle, COUNTER_IDLES, d.idle),
    color: cleanColor(r.color, d.color),
    dstyle: oneOf(r.dstyle, COUNTER_DSTYLES, d.dstyle),
    dsize: oneOf(r.dsize, COUNTER_DSIZES, d.dsize),
    speed: oneOf(r.speed, COUNTER_SPEEDS, d.speed),
    sound: oneOf(r.sound, lists.sounds, d.sound),
    volume: oneOf(r.volume, COUNTER_VOLUMES, d.volume),
    layout: oneOf(r.layout, lists.layouts, d.layout),
    ...cleanCanvas(r.canvasW, r.canvasH, d.canvasW ?? 1400, d.canvasH ?? 500),
  };
}
