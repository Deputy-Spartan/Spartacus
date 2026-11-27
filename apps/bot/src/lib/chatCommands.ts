import type { StreamerAccount } from "@prisma/client";
import {
  CHAT_COMMANDS_KEY,
  CHAT_COMMANDS_STATE_KEY,
  afkListOf,
  cleanToolRow,
  cleanChatCommands,
  cleanChatCommandsState,
  findChatCommand,
  renderChatReply,
  toolStateKey,
  type ChatCommand,
  type ChatCommandsConfig,
  type ChatCommandsState,
  type ChatRank,
} from "@spartacus/shared";
import { guildHasFeature, logError } from "@spartacus/db";
import { prisma } from "./prisma";
import { changeTool } from "./streamTools";
import { changeOverlay } from "../modules/utility/streamDeck";
import { canChat, sendStreamChat, twitchFollowage } from "../modules/stream/accounts";
import { isLeader } from "./leader";

// Streaming › Chat Commands: answers !commands in Kick and Twitch chat (as
// the streamer's own connected account) and posts timed messages while live.
// Sounds, pop-ups and other apps go through the Command alerts overlay in OBS.
// Rules live in packages/shared/chatCommands.ts.

type Platform = "kick" | "twitch";

// ---- Settings (cached; the dashboard clears it on save) ----
const cfgCache = new Map<string, { at: number; v: ChatCommandsConfig }>();
export async function chatCommandsOf(guildId: string): Promise<ChatCommandsConfig> {
  const hit = cfgCache.get(guildId);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key: CHAT_COMMANDS_KEY } } });
  const v = cleanChatCommands(row?.value);
  cfgCache.set(guildId, { at: Date.now(), v });
  return v;
}
export function forgetChatCommands(guildId: string) {
  cfgCache.delete(guildId);
}

// Counts and quotes, changed one after another per server.
const stateChains = new Map<string, Promise<unknown>>();
function changeState<T>(guildId: string, f: (st: ChatCommandsState) => T): Promise<T> {
  const run = (stateChains.get(guildId) ?? Promise.resolve()).then(async () => {
    const where = { guildId_key: { guildId, key: CHAT_COMMANDS_STATE_KEY } };
    const st = cleanChatCommandsState((await prisma.streamDeckState.findUnique({ where }))?.value);
    const out = f(st);
    await prisma.streamDeckState.upsert({ where, create: { guildId, key: CHAT_COMMANDS_STATE_KEY, value: st as object }, update: { value: st as object } });
    return out;
  });
  stateChains.set(guildId, run.catch(() => null));
  return run;
}

// ---- What the bot just said, so its own message coming back isn't run ----
const sent = new Map<string, Array<{ text: string; at: number }>>();
function remember(platform: string, channel: string, text: string) {
  const k = `${platform}:${channel.toLowerCase()}`;
  const list = (sent.get(k) ?? []).filter((x) => Date.now() - x.at < 60_000);
  list.push({ text: text.trim(), at: Date.now() });
  sent.set(k, list.slice(-30));
}
export function isOwnEcho(platform: string, channel: string, text: string) {
  const list = sent.get(`${platform}:${channel.toLowerCase()}`);
  return !!list?.some((x) => Date.now() - x.at < 60_000 && x.text === text.trim());
}

async function say(a: StreamerAccount, text: string): Promise<string | null> {
  if (!text) return null;
  remember(a.platform, a.login, text);
  const problem = await sendStreamChat(a, text);
  // The reply shows in the Chat box overlay too (its echo from chat is skipped).
  if (!problem && (await prisma.streamDeckState.count({ where: { guildId: a.guildId, key: toolStateKey("chat") } })))
    void changeTool(a.guildId, "chat", { name: a.displayName || a.login, text, badge: "👑", platform: a.platform }).catch(() => null);
  return problem;
}

// ---- Chat activity for timed messages ----
const chatCount = new Map<string, number>(); // platform:channel → messages seen
export function countChatLine(platform: string, channel: string) {
  const k = `${platform}:${channel.toLowerCase()}`;
  chatCount.set(k, (chatCount.get(k) ?? 0) + 1);
}

// ---- Running a command ----
const lastUsed = new Map<string, number>(); // guild:cmd → when
const handled = new Map<string, number>(); // one reply per message, even if two servers share the channel

export interface RunInput {
  guildId: string;
  platform: Platform;
  channel: string; // the streamer's login
  user: string;
  text: string;
  rank: ChatRank;
  from?: string; // "Stream Deck", "Lumia"…: skips the wait and who-can-use
}

async function liveInfo(guildId: string, platform: Platform, channel: string) {
  const sub = await prisma.streamSubscription.findFirst({ where: { guildId, platform, channelName: { equals: channel, mode: "insensitive" } } }).catch(() => null);
  const tz = (await prisma.streamExtrasConfig.findUnique({ where: { guildId }, select: { scheduleTimezone: true } }).catch(() => null))?.scheduleTimezone || "UTC";
  const start = sub?.isLive ? (sub.liveStartedAt ?? sub.lastNotifiedAt) : null;
  return { liveMs: start ? Date.now() - start.getTime() : null, game: sub?.lastGame ?? "", title: sub?.lastTitle ?? "", tz };
}

// ---- Overlay tools run from chat: AFK popups (!brb, !coffee… and !back)
// and the Spin wheel (!spin). Only for you and your mods; anyone else's
// message goes on to the normal commands (so a viewer's !back still works).
const clock = (ms: number) => {
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
async function postAs(input: RunInput, text: string) {
  if (!input.channel) return;
  const account = await prisma.streamerAccount.findFirst({ where: { guildId: input.guildId, platform: input.platform, login: input.channel.toLowerCase() } });
  if (account) await say(account, text);
}
async function runToolCommand(input: RunInput): Promise<{ ok: boolean; message: string } | null> {
  const m = input.text.trim().match(/^!(\S+)\s*(.*)$/s);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const { guildId } = input;
  const rank = input.from ? 3 : input.rank;
  if (rank < 2) return null;
  const rows = await prisma.streamDeckState.findMany({ where: { guildId, key: { in: [toolStateKey("afk"), toolStateKey("wheel")] } } });

  const afkRow = rows.find((r) => r.key === toolStateKey("afk"));
  if (afkRow) {
    const row = cleanToolRow("afk", afkRow.value);
    const s = row.settings;
    const item = afkListOf(s).find((x) => x.cmd === name);
    const isBack = name === String(s.backCmd || "back");
    if ((item || (isBack && row.state.cur)) && rank >= (s.who === "me" ? 3 : 2)) {
      if (!(await guildHasFeature(guildId, "t:afk", "kit"))) return { ok: false, message: "AFK popups need the Streamer Kit." };
      const minutes = parseInt(m[2], 10);
      const next = await changeTool(guildId, "afk", isBack && !item ? { op: "back" } : { op: "start", cmd: name, min: minutes > 0 ? minutes : undefined });
      if ("error" in next) return { ok: false, message: next.error };
      if (isBack && !item) {
        const gone = Number(next.events[next.events.length - 1]?.data.gone) || 0;
        if (s.chatPost) await postAs(input, `👋 Back! Gone for ${clock(gone)}`).catch(() => null);
        return { ok: true, message: `Cleared the AFK popup (gone ${clock(gone)}).` };
      }
      const cur = next.state.cur as { ico: string; t: string; min: number };
      if (s.chatPost) await postAs(input, `${cur.t} ${cur.ico} back in ${cur.min} min`.trim()).catch(() => null);
      return { ok: true, message: `Showing ${cur.t} for ${cur.min} min.` };
    }
  }

  const wheelRow = rows.find((r) => r.key === toolStateKey("wheel"));
  if (wheelRow) {
    const s = cleanToolRow("wheel", wheelRow.value).settings;
    if (s.chatSpin && name === String(s.spinCmd || "spin")) {
      if (!(await guildHasFeature(guildId, "t:wheel", "kit"))) return { ok: false, message: "The Spin wheel needs the Streamer Kit." };
      const next = await changeTool(guildId, "wheel", { op: "spin" });
      if ("error" in next) return { ok: false, message: next.error };
      const result = String(next.state.last ?? "");
      // Said once the wheel has stopped on stream.
      if (s.chatPost && result) setTimeout(() => void postAs(input, `🎡 The wheel landed on: ${result}`).catch(() => null), (Number(s.spinTime) || 7) * 1000 + 900);
      return { ok: true, message: `Spinning… it lands on ${result}.` };
    }
  }
  return null;
}

export async function runChatCommand(input: RunInput): Promise<{ ok: boolean; message: string }> {
  const { guildId, platform, channel, user, rank } = input;
  const tool = await runToolCommand(input).catch((e) => (logError("bot", e, guildId), null));
  if (tool) return tool;
  const cfg = await chatCommandsOf(guildId);
  if (!cfg.on || !cfg[platform]) return { ok: false, message: "Chat commands are off." };
  // The Kick/Twitch chat bot is part of the Streamer Kit.
  if (!(await guildHasFeature(guildId, "cc", "kit"))) return { ok: false, message: "Chat commands need the Streamer Kit." };
  const found = findChatCommand(cfg, input.text);
  if (!found) return { ok: false, message: "No command like that." };
  const { cmd, parts } = found;
  if (!input.from && rank < cmd.who) return { ok: false, message: "Not allowed." };
  const key = `${guildId}:${cmd.id}`;
  const now = Date.now();
  if (!input.from && rank < 2 && cmd.cd && now - (lastUsed.get(key) ?? 0) < cmd.cd * 1000) return { ok: false, message: "Waiting." };
  lastUsed.set(key, now);
  if (lastUsed.size > 5000) for (const [k, t] of lastUsed) if (now - t > 3600_000) lastUsed.delete(k);

  const account = await prisma.streamerAccount.findFirst({ where: { guildId, platform, login: channel.toLowerCase() } });
  const args = parts.join(" ");
  const target = (parts[0] ?? user).replace(/^@/, "");
  const info = await liveInfo(guildId, platform, channel);
  const usesCount = /\{count\}/.test(cmd.reply + cmd.atext) || cmd.ov === "win" || cmd.ov === "loss";

  // Counts and quotes.
  let n: number | undefined, quote: string | undefined;
  const st = await changeState(guildId, (s) => {
    if (usesCount) s.counts[cmd.id] = (s.counts[cmd.id] ?? 0) + 1;
    if (cmd.name === "addquote" && args) { s.quotes.push(args.slice(0, 300)); s.quotes = s.quotes.slice(-500); n = s.quotes.length; }
    if (cmd.name === "quote" && s.quotes.length) {
      const i = Number(parts[0]) - 1;
      const k = s.quotes[i] ? i : Math.floor(Math.random() * s.quotes.length);
      n = k + 1; quote = s.quotes[k];
    }
    return { counts: { ...s.counts } };
  });
  if (cmd.name === "addquote" && !args) return { ok: false, message: "Type the quote after !addquote." };
  if (cmd.name === "quote" && !quote) quote = "No quotes yet. Mods can add one with !addquote";

  const followage = /\{followage\}/.test(cmd.reply) && account && platform === "twitch" ? await twitchFollowage(account, user.toLowerCase()).catch(() => null) : null;
  const ctx = {
    user, target, args, platform, game: info.game, title: info.title, liveMs: info.liveMs, timeZone: info.tz,
    followage: followage ?? (platform === "kick" ? "a while (Kick doesn't share follow dates)" : "a while"),
    count: st.counts[cmd.id] ?? 0, counts: st.counts, cmds: cfg.cmds, n, quote,
  };
  const reply = renderChatReply(cmd.reply, ctx);

  await Promise.all([overlayAction(guildId, cmd, target), alertAction(guildId, cmd, ctx.user, renderChatReply(cmd.atext || cmd.reply, ctx), renderChatReply(cmd.appv || cmd.name, ctx))]).catch((e) => logError("bot", e, guildId));
  if (!account) return { ok: true, message: `Ran !${cmd.name}. Connect your ${platform === "twitch" ? "Twitch" : "Kick"} account on Stream Growth so Spartacus can reply in chat.` };
  const problem = await say(account, reply);
  if (problem) logError("bot", new Error(`chat command reply: ${problem}`), guildId);
  return { ok: !problem, message: problem ?? `Ran !${cmd.name}.` };
}

async function overlayAction(guildId: string, cmd: ChatCommand, target: string) {
  switch (cmd.ov) {
    case "need": {
      const n = Math.max(0, Math.min(99, parseInt(target, 10)));
      await changeOverlay(guildId, "message", Number.isFinite(n) ? { op: "need", n } : { op: "plus" });
      return;
    }
    case "full": await changeOverlay(guildId, "message", { op: "full" }); return;
    case "next": await changeOverlay(guildId, "message", { op: "next" }); return;
    case "win": await changeOverlay(guildId, "winloss", { stat: "wins", add: 1 }); return;
    case "loss": await changeOverlay(guildId, "winloss", { stat: "losses", add: 1 }); return;
  }
}

async function alertAction(guildId: string, cmd: ChatCommand, user: string, text: string, appv: string) {
  const popup = cmd.ov === "alert";
  const sound = cmd.soundUrl || cmd.sound !== "none";
  if (!popup && !sound && cmd.app === "none") return;
  await changeTool(guildId, "cmdfx", { op: "fire", sound: cmd.sound, soundUrl: cmd.soundUrl, popup, emoji: cmd.emoji, text, style: cmd.style, app: cmd.app, appv, user, cmd: cmd.name });
}

// From stream chat (streamTools.onStreamChat). True when it was a command.
export async function onChatCommand(guildIds: string[], platform: Platform, channel: string, user: string, text: string, rank: ChatRank): Promise<boolean> {
  if (!text.trim().startsWith("!")) return false;
  if (rank === 3 && isOwnEcho(platform, channel, text)) return true;
  const msgKey = `${platform}:${channel}:${user}:${text}`;
  for (const guildId of guildIds) {
    const owns = await prisma.streamerAccount.count({ where: { guildId, platform, login: channel.toLowerCase() } });
    if (!owns) continue;
    // Two servers on the same channel: only the first answers.
    if (Date.now() - (handled.get(msgKey) ?? 0) < 3000) return true;
    handled.set(msgKey, Date.now());
    if (handled.size > 2000) for (const [k, t] of handled) if (Date.now() - t > 10_000) handled.delete(k);
    await runChatCommand({ guildId, platform, channel, user, text, rank }).catch((e) => logError("bot", e, guildId));
    return true;
  }
  return false;
}

// From the dashboard's Test, a Stream Deck key or a run link (Lumia,
// Streamer.bot): runs it on the first connected channel (or the one asked for).
export async function runChatCommandFrom(guildId: string, name: string, from: string, platform?: Platform, args = "") {
  const accounts = await prisma.streamerAccount.findMany({ where: { guildId, ...(platform ? { platform } : {}) }, orderBy: { createdAt: "asc" } });
  const cfg = await chatCommandsOf(guildId);
  const live = await prisma.streamSubscription.findMany({ where: { guildId, isLive: true }, select: { platform: true, channelName: true } });
  const isLive = (a: StreamerAccount) => live.some((l) => l.platform === a.platform && l.channelName.toLowerCase() === a.login);
  const pick = accounts.filter((a) => cfg[a.platform as Platform]).sort((a, b) => Number(isLive(b)) - Number(isLive(a)))[0];
  const text = `!${name.replace(/^!/, "")}${args ? " " + args : ""}`;
  if (!pick) {
    // No account: the sounds, pop-ups and overlays still go off.
    return runChatCommand({ guildId, platform: platform ?? "kick", channel: "", user: from, text, rank: 3, from });
  }
  return runChatCommand({ guildId, platform: pick.platform as Platform, channel: pick.login, user: pick.displayName || pick.login, text, rank: 3, from });
}

// ---- Timed messages (every minute, while live) ----
const timerLast = new Map<string, { at: number; chat: number }>();
export function startChatTimersJob() {
  setInterval(() => void timersTick().catch((e) => logError("bot", e)), 60_000);
}
async function timersTick() {
  if (!isLeader()) return;
  const rows = await prisma.streamDeckState.findMany({ where: { key: CHAT_COMMANDS_KEY }, select: { guildId: true, value: true } });
  for (const row of rows) {
    const cfg = cleanChatCommands(row.value);
    const timers = cfg.timers.filter((t) => t.on);
    if (!cfg.on || !timers.length) continue;
    if (!(await guildHasFeature(row.guildId, "cc", "kit"))) continue;
    const accounts = await prisma.streamerAccount.findMany({ where: { guildId: row.guildId } });
    for (const a of accounts) {
      const platform = a.platform as Platform;
      if (!cfg[platform] || !canChat(a)) continue;
      const live = await prisma.streamSubscription.findFirst({ where: { guildId: row.guildId, platform, channelName: { equals: a.login, mode: "insensitive" }, isLive: true } });
      const ck = `${platform}:${a.login}`;
      if (!live) {
        for (const t of timers) timerLast.delete(`${row.guildId}:${ck}:${t.id}`);
        continue;
      }
      const seen = chatCount.get(ck) ?? 0;
      for (const t of timers) {
        const k = `${row.guildId}:${ck}:${t.id}`;
        const last = timerLast.get(k);
        // The first one waits a full gap after going live.
        if (!last) { timerLast.set(k, { at: Date.now(), chat: seen }); continue; }
        if (Date.now() - last.at < t.every * 60_000 || seen - last.chat < t.chat) continue;
        timerLast.set(k, { at: Date.now(), chat: seen });
        const problem = await say(a, t.text);
        if (problem) logError("bot", new Error(`timed message: ${problem}`), row.guildId);
        break; // one timed message per minute per channel
      }
    }
  }
}
