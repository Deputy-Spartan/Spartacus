// Streaming › Chat Commands: !discord, !uptime, !so and the rest, answered by
// Spartacus in your Kick and Twitch chat (as your own channel account), plus
// timed messages. A command can also play a sound and show a pop-up (through
// the Command alerts overlay in OBS), change your Message box or W/L, and set
// off something in Lumia Stream, Streamer.bot or OBS on your PC.
//
// Saved as one StreamDeckState row (CHAT_COMMANDS_KEY); counts and quotes in
// another (CHAT_COMMANDS_STATE_KEY) so chat never rewrites your settings.

export const CHAT_COMMANDS_KEY = "chatcmds";
export const CHAT_COMMANDS_STATE_KEY = "chatcmds:state";

// Who can use a command: 0 everyone, 1 subs (and VIPs), 2 mods, 3 only you.
export type ChatRank = 0 | 1 | 2 | 3;
export const CHAT_WHO = ["Everyone", "Subs and up", "Mods and you", "Only you"] as const;

export const CHAT_SOUNDS: Array<[string, string]> = [
  ["none", "No sound"], ["ding", "🔔 Ding"], ["coin", "🪙 Coin"], ["levelup", "⬆️ Level up"], ["airhorn", "📯 Air horn"], ["laser", "🔫 Laser"],
  ["boo", "👎 Sad trombone"], ["buzzer", "❌ Buzzer"], ["whoosh", "💨 Whoosh"], ["drumroll", "🥁 Drum roll"], ["applause", "👏 Applause"], ["fanfare", "🎺 Fanfare"], ["pop", "🫧 Pop"],
];
export const CHAT_OVERLAY_ACTIONS: Array<[string, string]> = [
  ["none", "Nothing"], ["alert", "Pop-up alert"], ["need", "Message box: need {target}"], ["full", "Message box: squad full"], ["next", "Message box: next message"], ["win", "Win +1"], ["loss", "Loss +1"],
];
export const CHAT_POPUP_STYLES: Array<[string, string]> = [["pop", "Pop"], ["slide", "Slide in"], ["bounce", "Drop and bounce"], ["shake", "Shake"], ["spin", "Spin in"]];
export const CHAT_APP_ACTIONS: Array<[string, string]> = [
  ["none", "Nothing"], ["lumia", "Lumia: run command"], ["lumia-alert", "Lumia: play alert"], ["sbot", "Streamer.bot: run action"], ["obs-scene", "OBS: switch scene"], ["obs-src", "OBS: show source"],
];
export const CHAT_GROUPS = ["Info", "Fun", "Mods", "Overlays", "Mine"] as const;
export const CHAT_VARIABLES: Array<[string, string]> = [
  ["{user}", "who typed it"], ["{target}", "the name after the command (or who typed it)"], ["{args}", "everything after the command"],
  ["{game}", "your game right now"], ["{title}", "your stream title"], ["{uptime}", "how long you've been live"], ["{followage}", "how long they've followed (Twitch)"],
  ["{time}", "your time now"], ["{count}", "how many times this was used"], ["{random:1-100}", "a random number"], ["{pick:a|b|c}", "one of these at random"],
  ["{get:death}", "another command's count"], ["{commands}", "the list of commands"], ["{platform}", "Kick or Twitch"],
];

export interface ChatCommand {
  id: string;
  name: string;
  alias: string[];
  reply: string;
  who: ChatRank;
  cd: number; // seconds between uses (mods and you skip it)
  sound: string;
  soundUrl: string; // your own sound: a link to an mp3 / wav / ogg
  ov: string;
  style: string;
  emoji: string;
  atext: string; // pop-up words (the reply when empty)
  app: string;
  appv: string; // the name in that app
  on: boolean;
  group: string;
}
export interface ChatTimer {
  id: string;
  text: string;
  every: number; // minutes
  chat: number; // chat messages needed since the last time
  on: boolean;
}
export interface ChatCommandsConfig {
  on: boolean;
  kick: boolean;
  twitch: boolean;
  cmds: ChatCommand[];
  timers: ChatTimer[];
  runKey: string; // for the run links (Lumia, Streamer.bot); set by the server
}
export interface ChatCommandsState {
  counts: Record<string, number>;
  quotes: string[];
}

const C = (name: string, reply: string, o: Partial<ChatCommand> = {}): ChatCommand => ({
  id: name, name, alias: [], reply, who: 0, cd: 5, sound: "none", soundUrl: "", ov: "none", style: "pop", emoji: "", atext: "", app: "none", appv: "", on: true, group: "Info", ...o,
});

export const STARTER_COMMANDS: ChatCommand[] = [
  C("commands", "Commands: {commands}", { alias: ["help", "cmds"] }),
  C("discord", "Join the squad on Discord 👉 discord.gg/yourlink", { alias: ["dc"] }),
  C("socials", "Follow everywhere: TikTok @you · YouTube @you · Kick /you · Twitch /you"),
  C("uptime", "Live for {uptime}."),
  C("game", "Playing {game} right now."),
  C("title", "{title}"),
  C("followage", "{user} has followed for {followage}.", { alias: ["fa"] }),
  C("schedule", "Live Mon, Wed and Fri at 7pm. Pings on !discord"),
  C("rules", "Be kind, no spam, no backseating unless asked. Have fun!"),
  C("specs", "PC: your CPU · your GPU · 32GB RAM · 1440p 165Hz", { alias: ["pc"] }),
  C("sens", "Sens 6 · ADS 1.00 · 800 DPI", { alias: ["settings"] }),
  C("time", "It's {time} for me."),
  C("lurk", "{user} is lurking. Enjoy the stream! 👀", { group: "Fun" }),
  C("unlurk", "Welcome back {user}! 👋", { group: "Fun", alias: ["back"] }),
  C("hug", "{user} gives {target} a big hug 🤗", { group: "Fun" }),
  C("8ball", "🎱 {pick:Yes|No|Ask again later|Definitely|No chance|Probably|Don't count on it}", { group: "Fun" }),
  C("roll", "{user} rolled a {random:1-6} 🎲", { group: "Fun", alias: ["dice"], sound: "coin" }),
  C("hype", "HYPE! 🔥🔥🔥", { group: "Fun", cd: 30, sound: "airhorn", ov: "alert", style: "shake", emoji: "🔥", atext: "HYPE!", app: "lumia", appv: "hype" }),
  C("quote", "Quote #{n}: {quote}", { group: "Fun" }),
  C("addquote", "Saved quote #{n} ✅", { group: "Fun", who: 2, cd: 0 }),
  C("clip", "Clip it! Thanks {user} 🎬", { group: "Fun", cd: 20, sound: "laser" }),
  C("so", "Go check out {target}! They're great 🔥 {solink}", { group: "Mods", who: 2, cd: 0, alias: ["shoutout"], sound: "ding", ov: "alert", style: "slide", emoji: "📣", atext: "Go follow {target}!" }),
  C("death", "Deaths: {count} 💀", { group: "Mods", who: 2, cd: 0, sound: "boo", ov: "alert", style: "bounce", emoji: "💀", atext: "Death #{count}" }),
  C("deaths", "Deaths so far: {get:death} 💀", { group: "Mods" }),
  C("need", "Need {target} to join! Type !discord to hop in", { group: "Overlays", who: 2, cd: 0, ov: "need", sound: "ding" }),
  C("full", "Squad's full ✅ Next one, type !discord", { group: "Overlays", who: 2, cd: 0, ov: "full", sound: "levelup" }),
  C("win", "W! 🏆 That's {count} today", { group: "Overlays", who: 2, cd: 0, ov: "win", sound: "levelup" }),
  C("loss", "L. We go again 😤", { group: "Overlays", who: 2, cd: 0, ov: "loss", sound: "buzzer" }),
  C("brb", "Be right back! ☕", { group: "Overlays", who: 3, cd: 0, sound: "whoosh", app: "obs-scene", appv: "BRB" }),
];
export const STARTER_TIMERS: ChatTimer[] = [
  { id: "t1", text: "Join the Discord to squad up 👉 type !discord", every: 15, chat: 5, on: true },
  { id: "t2", text: "Enjoying the stream? A follow helps a lot ❤️", every: 20, chat: 5, on: true },
  { id: "t3", text: "Type !commands to see everything you can do", every: 30, chat: 10, on: false },
];
export const CHAT_COMMANDS_MAX = 100;
export const CHAT_TIMERS_MAX = 20;

// ---- Cleaning what's saved ----
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, n) : "");
const word = (v: unknown) => str(v, 30).toLowerCase().replace(/^!+/, "").replace(/[^\p{L}\p{N}_-]/gu, "");
const oneOf = (v: unknown, list: Array<[string, string]>, d: string) => (list.some(([k]) => k === v) ? String(v) : d);
const num = (v: unknown, min: number, max: number, d: number) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.max(min, Math.min(max, Math.round(Number(v)))) : d);
const soundLink = (v: unknown) => {
  const s = str(v, 400);
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
};

export function cleanChatCommand(raw: unknown, i = 0): ChatCommand | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = word(r.name);
  if (!name) return null;
  return {
    id: str(r.id, 40) || `${name}-${i}`,
    name,
    alias: (Array.isArray(r.alias) ? r.alias : []).map(word).filter((a) => a && a !== name).slice(0, 5),
    reply: str(r.reply, 400),
    who: num(r.who, 0, 3, 0) as ChatRank,
    cd: num(r.cd, 0, 3600, 5),
    sound: oneOf(r.sound, CHAT_SOUNDS, "none"),
    soundUrl: soundLink(r.soundUrl),
    ov: oneOf(r.ov, CHAT_OVERLAY_ACTIONS, "none"),
    style: oneOf(r.style, CHAT_POPUP_STYLES, "pop"),
    emoji: str(r.emoji, 8),
    atext: str(r.atext, 80),
    app: oneOf(r.app, CHAT_APP_ACTIONS, "none"),
    appv: str(r.appv, 80),
    on: r.on !== false,
    group: (CHAT_GROUPS as readonly string[]).includes(String(r.group)) ? String(r.group) : "Mine",
  };
}

export function cleanChatCommands(raw: unknown): ChatCommandsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.cmds) ? r.cmds : STARTER_COMMANDS;
  const cmds: ChatCommand[] = [];
  const used = new Set<string>(), ids = new Set<string>();
  list.slice(0, CHAT_COMMANDS_MAX).forEach((c, i) => {
    const k = cleanChatCommand(c, i);
    if (!k || used.has(k.name)) return;
    k.alias = k.alias.filter((a) => !used.has(a));
    if (ids.has(k.id)) k.id = `${k.name}-${i}`;
    [k.name, ...k.alias].forEach((n) => used.add(n));
    ids.add(k.id);
    cmds.push(k);
  });
  const tl = Array.isArray(r.timers) ? r.timers : STARTER_TIMERS;
  const timers: ChatTimer[] = tl.slice(0, CHAT_TIMERS_MAX).map((t, i) => {
    const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    return { id: str(x.id, 40) || `t${i}`, text: str(x.text, 400), every: num(x.every, 1, 240, 15), chat: num(x.chat, 0, 500, 5), on: x.on !== false };
  }).filter((t) => t.text);
  return { on: r.on !== false, kick: r.kick !== false, twitch: r.twitch !== false, cmds, timers, runKey: /^[A-Za-z0-9_-]{16,64}$/.test(String(r.runKey ?? "")) ? String(r.runKey) : "" };
}

export function cleanChatCommandsState(raw: unknown): ChatCommandsState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const counts: Record<string, number> = {};
  if (r.counts && typeof r.counts === "object") for (const [k, v] of Object.entries(r.counts as Record<string, unknown>)) if (Number.isFinite(Number(v))) counts[k.slice(0, 40)] = Math.max(0, Math.floor(Number(v)));
  const quotes = (Array.isArray(r.quotes) ? r.quotes : []).map((q) => str(q, 300)).filter(Boolean).slice(-500);
  return { counts, quotes };
}

// ---- Using them ----

// The command a chat message runs, if any: "!so @Nova hi" → so, ["@Nova", "hi"].
export function findChatCommand(cfg: ChatCommandsConfig, text: string): { cmd: ChatCommand; parts: string[] } | null {
  const t = text.trim();
  if (!t.startsWith("!")) return null;
  const parts = t.slice(1).trim().split(/\s+/);
  const w = (parts.shift() ?? "").toLowerCase();
  if (!w) return null;
  const cmd = cfg.cmds.find((c) => c.on && (c.name === w || c.alias.includes(w)));
  return cmd ? { cmd, parts } : null;
}

// Who someone is in chat, from their badges.
export function chatRankFrom(badges: string[]): ChatRank {
  const b = badges.map((x) => x.toLowerCase());
  if (b.includes("broadcaster")) return 3;
  if (b.some((x) => x === "moderator" || x === "staff" || x === "admin" || x === "global_mod")) return 2;
  if (b.some((x) => x === "subscriber" || x === "vip" || x === "founder" || x === "og" || x === "sub_gifter")) return 1;
  return 0;
}

export const fmtUptime = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};

export interface ChatReplyContext {
  user: string;
  target: string;
  args: string;
  platform: "kick" | "twitch" | string;
  game?: string;
  title?: string;
  liveMs?: number | null; // null: not live
  timeZone?: string;
  followage?: string;
  count?: number;
  counts?: Record<string, number>; // by command id
  cmds?: ChatCommand[];
  n?: number;
  quote?: string;
  random?: () => number;
}

// Fill in {user}, {uptime}, {pick:a|b} and the rest. Unknown {words} stay.
export function renderChatReply(tpl: string, x: ChatReplyContext): string {
  const rnd = x.random ?? Math.random;
  const out = tpl.replace(/\{(\w+)(?::([^}]*))?\}/g, (all, k: string, arg?: string) => {
    switch (k) {
      case "user": return x.user;
      case "target": return x.target;
      case "args": return x.args;
      case "game": return x.game || "something";
      case "title": return x.title || "";
      case "uptime": return x.liveMs == null ? "not live right now" : fmtUptime(x.liveMs);
      case "time":
        try { return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: x.timeZone || "UTC" }); } catch { return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
      case "followage": return x.followage || "a while";
      case "count": return String(x.count ?? 0);
      case "get": {
        const o = x.cmds?.find((c) => c.name === String(arg ?? "").toLowerCase() || c.alias.includes(String(arg ?? "").toLowerCase()));
        return String((o && x.counts?.[o.id]) || 0);
      }
      case "random": {
        const m = String(arg ?? "1-100").match(/^(-?\d+)-(-?\d+)$/);
        const a = m ? Number(m[1]) : 1, b = m ? Number(m[2]) : 100;
        const lo = Math.min(a, b), hi = Math.max(a, b);
        return String(lo + Math.floor(rnd() * (hi - lo + 1)));
      }
      case "pick": {
        const o = String(arg ?? "").split("|").map((s) => s.trim()).filter(Boolean);
        return o.length ? o[Math.floor(rnd() * o.length)] : "";
      }
      case "commands": return (x.cmds ?? []).filter((c) => c.on && c.who === 0).map((c) => "!" + c.name).join(" ");
      case "solink": return `${x.platform === "twitch" ? "twitch.tv" : "kick.com"}/${x.target.replace(/^@/, "").toLowerCase()}`;
      case "platform": return x.platform === "twitch" ? "Twitch" : x.platform === "kick" ? "Kick" : x.platform;
      case "n": return x.n == null ? "" : String(x.n);
      case "quote": return x.quote ?? "";
      default: return all;
    }
  });
  return out.replace(/\s+/g, " ").trim().slice(0, 450);
}

// What a command also sends to an app on your PC, worded for people.
export function chatAppLabel(app: string, v: string) {
  return ({ lumia: `Lumia › run command "${v}"`, "lumia-alert": `Lumia › play alert "${v}"`, sbot: `Streamer.bot › run action "${v}"`, "obs-scene": `OBS › switch to scene "${v}"`, "obs-src": `OBS › show "${v}" for 5 seconds` } as Record<string, string>)[app] ?? "";
}
