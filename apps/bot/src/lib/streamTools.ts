import { applyToolAction, cleanToolRow, toolStateKey, type ChatRank, type ToolKind } from "@spartacus/shared";
import { countChatLine, isOwnEcho, onChatCommand } from "./chatCommands";
import { logError } from "@spartacus/db";
import { prisma } from "./prisma";

// Streaming › Overlays › stream tools, fed by the stream itself:
//   stream chat (Kick and Twitch) → Chat box, Poll votes, Predictions (!bet),
//     First-time welcome
// Only tools a server has opened on the dashboard (a saved row) are touched.

// Changes to one row happen one after another, so a burst of chat can't
// overwrite itself.
const chains = new Map<string, Promise<unknown>>();
export function changeTool(guildId: string, kind: ToolKind, action: Record<string, unknown>) {
  const key = `${guildId}:${kind}`;
  const run = (chains.get(key) ?? Promise.resolve()).then(async () => {
    const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key: toolStateKey(kind) } } });
    const next = applyToolAction(kind, cleanToolRow(kind, row?.value), action);
    if ("error" in next) return next;
    await prisma.streamDeckState.upsert({ where: { guildId_key: { guildId, key: toolStateKey(kind) } }, create: { guildId, key: toolStateKey(kind), value: next as object }, update: { value: next as object } });
    return next;
  });
  chains.set(key, run.catch(() => null));
  return run;
}

// Which servers follow this stream channel, and which tools each has.
const guildCache = new Map<string, { at: number; ids: string[] }>();
async function guildsFor(platform: string, channel: string) {
  const k = `${platform}:${channel.toLowerCase()}`;
  const hit = guildCache.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const subs = await prisma.streamSubscription.findMany({ where: { platform, channelName: { equals: channel, mode: "insensitive" } }, select: { guildId: true } });
  const ids = [...new Set(subs.map((s) => s.guildId))];
  guildCache.set(k, { at: Date.now(), ids });
  return ids;
}
const toolCache = new Map<string, { at: number; kinds: Set<string>; settings: Map<string, Record<string, unknown>> }>();
async function toolsOf(guildId: string) {
  const hit = toolCache.get(guildId);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  const rows = await prisma.streamDeckState.findMany({ where: { guildId, key: { startsWith: "tool:" } } });
  const kinds = new Set<string>(), settings = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const kind = r.key.slice(5);
    kinds.add(kind);
    settings.set(kind, ((r.value as { settings?: Record<string, unknown> })?.settings ?? {}) as Record<string, unknown>);
  }
  const v = { at: Date.now(), kinds, settings };
  toolCache.set(guildId, v);
  return v;
}

const seenRows = new Map<string, Record<string, number>>(); // first-time welcome, kept in memory and saved now and then
const seenSaved = new Map<string, number>();

const BADGE_OF = ["", "⭐", "🛡️", "👑"];
export async function onStreamChat(platform: "kick" | "twitch", channel: string, user: string, text: string, rank: ChatRank = 0) {
  try {
    const guilds = await guildsFor(platform, channel);
    countChatLine(platform, channel);
    // Spartacus's own replies come back through chat: don't show or run them twice.
    if (rank === 3 && isOwnEcho(platform, channel, text)) return;
    const badge = BADGE_OF[rank];
    if (guilds.length) void onChatCommand(guilds, platform, channel, user, text, rank).catch((e) => logError("bot", e));
    for (const guildId of guilds) {
      const t = await toolsOf(guildId);
      const msg = text.trim();
      if (t.kinds.has("chat")) void changeTool(guildId, "chat", { name: user, text: msg, badge, platform });
      if (t.kinds.has("poll") && /^[1-4]$/.test(msg)) void changeTool(guildId, "poll", { op: "vote", user, choice: Number(msg) });
      const bet = msg.match(/^!bet\s+(\S+)\s+(\d+)/i);
      if (t.kinds.has("predict") && bet) {
        const s = t.settings.get("predict") ?? {};
        const word = bet[1].toLowerCase();
        const side = word === String(s.no ?? "no").toLowerCase() || word === "no" || word === "2" ? 1 : word === String(s.yes ?? "yes").toLowerCase() || word === "yes" || word === "1" ? 0 : -1;
        if (side >= 0) void changeTool(guildId, "predict", { op: "bet", user, side, amount: Number(bet[2]) });
      }
      if (t.kinds.has("welcome") && rank < 3) await welcomeCheck(guildId, user, t.settings.get("welcome") ?? {});
    }
  } catch (err) {
    logError("bot", err);
  }
}

// The first time someone chats (or the first time in 30 days), welcome them.
async function welcomeCheck(guildId: string, user: string, settings: Record<string, unknown>) {
  const key = toolStateKey("welcome") + ":seen";
  let seen = seenRows.get(guildId);
  if (!seen) {
    const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key } } });
    seen = ((row?.value as Record<string, number>) ?? {}) as Record<string, number>;
    seenRows.set(guildId, seen);
  }
  const name = user.toLowerCase(), last = seen[name], now = Date.now();
  seen[name] = now;
  if (!last) void changeTool(guildId, "welcome", { name: user, back: false });
  else if (settings.back !== false && now - last > 30 * 86400_000) void changeTool(guildId, "welcome", { name: user, back: true });
  // Saved once a minute at most.
  if (now - (seenSaved.get(guildId) ?? 0) > 60_000) {
    seenSaved.set(guildId, now);
    const keys = Object.keys(seen);
    if (keys.length > 50_000) for (const k of keys.sort((a, b) => seen![a] - seen![b]).slice(0, 5000)) delete seen[k];
    await prisma.streamDeckState.upsert({ where: { guildId_key: { guildId, key } }, create: { guildId, key, value: seen }, update: { value: seen } }).catch(() => null);
  }
}
