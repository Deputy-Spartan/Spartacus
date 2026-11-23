import type { Client } from "discord.js";
import { LINK_CODE_PATTERN, chatRankFrom } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isLeader } from "../../lib/leader";
import { forgetChannel, forgetOldChatters, recordChat } from "../../lib/chatActivity";
import { onStreamChat } from "../../lib/streamTools";

// Reads Twitch chat anonymously (the same way a viewer's browser does) for the
// channels that are live right now, so viewers who linked their Twitch name can
// be rewarded for chatting, and so a link code typed in chat proves the name is
// theirs. One connection for everything; it only joins live channels, never
// sends anything, and only the active copy of the bot connects.

const URL = "wss://irc-ws.chat.twitch.tv:443";
const MAX_CHANNELS = 25;

let ws: WebSocket | null = null;
let discord: Client | null = null;
let wanted = new Set<string>();
const joined = new Set<string>();
let retry = 0;
let retryTimer: NodeJS.Timeout | null = null;

export function startTwitchChat(client: Client) {
  discord = client;
}

function send(line: string) {
  if (ws && ws.readyState === 1) ws.send(line);
}

function connect() {
  if (ws || !wanted.size || !isLeader()) return;
  try {
    ws = new WebSocket(URL);
  } catch (err) {
    logError("bot", err);
    return;
  }
  const mine = ws;
  mine.addEventListener("open", () => {
    retry = 0;
    // Tags say who's a mod or sub (for Chat Commands) and their shown name.
    send("CAP REQ :twitch.tv/tags");
    send("PASS SCHMOOPIIE");
    send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
    joined.clear();
    reconcile();
  });
  mine.addEventListener("message", (ev) => {
    for (const line of String(ev.data).split("\r\n")) if (line) onLine(line);
  });
  const lost = () => {
    if (ws !== mine) return;
    ws = null;
    joined.clear();
    if (!wanted.size || retryTimer) return;
    retry = Math.min(retry + 1, 6);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, Math.min(60_000, 3000 * 2 ** retry));
  };
  mine.addEventListener("close", lost);
  mine.addEventListener("error", lost);
}

function disconnect() {
  const old = ws;
  ws = null;
  joined.clear();
  try {
    old?.close();
  } catch {
    // already closed
  }
}

// Join what's wanted and leave what isn't.
function reconcile() {
  for (const c of wanted) if (!joined.has(c)) {
    send(`JOIN #${c}`);
    joined.add(c);
  }
  for (const c of [...joined]) if (!wanted.has(c)) {
    send(`PART #${c}`);
    joined.delete(c);
    forgetChannel("twitch", c);
  }
}

// The channels to listen to. Called whenever the live list may have changed.
export function setChatChannels(logins: string[]) {
  wanted = new Set(logins.map((l) => l.toLowerCase()).slice(0, MAX_CHANNELS));
  if (!wanted.size || !isLeader()) {
    disconnect();
    return;
  }
  if (!ws) connect();
  else if (ws.readyState === 1) reconcile();
  // Forget chatters nobody will ask about again.
  forgetOldChatters(30 * 60_000);
}

function onLine(raw: string) {
  if (raw.startsWith("PING")) {
    send("PONG :tmi.twitch.tv");
    return;
  }
  // "@badges=moderator/1,subscriber/12;display-name=Nova;… :nova!nova@… PRIVMSG #chan :hi"
  let tags: Record<string, string> = {};
  let line = raw;
  if (raw[0] === "@") {
    const sp = raw.indexOf(" ");
    if (sp < 0) return;
    tags = Object.fromEntries(raw.slice(1, sp).split(";").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));
    line = raw.slice(sp + 1);
  }
  const at = line.indexOf(" PRIVMSG #");
  if (at < 0 || line[0] !== ":") return;
  const bang = line.indexOf("!");
  if (bang < 2 || bang > at) return;
  const user = line.slice(1, bang).toLowerCase();
  const rest = line.slice(at + 10);
  const space = rest.indexOf(" :");
  if (space < 0) return;
  const channel = rest.slice(0, space).toLowerCase();
  const text = rest.slice(space + 2);
  const badges = (tags.badges ?? "").split(",").map((b) => b.split("/")[0]).filter(Boolean);
  if (tags.mod === "1") badges.push("moderator");
  const rank = user === channel ? 3 : chatRankFrom(badges);
  const shown = tags["display-name"]?.replace(/\\s/g, " ").trim() || user;
  void onStreamChat("twitch", channel, shown, text, rank);
  if (user === channel) return;
  recordChat("twitch", channel, user);
  const code = text.match(LINK_CODE_PATTERN);
  if (code) void verifyLink(user, code[0]);
}

// Someone typed their code in a live chat: the Twitch name is theirs.
async function verifyLink(login: string, code: string) {
  try {
    const link = await prisma.streamLink.findFirst({ where: { handle: login, code, verified: false } });
    if (!link) return;
    await prisma.streamLink.update({ where: { id: link.id }, data: { verified: true, verifiedAt: new Date() } });
    const user = await discord?.users.fetch(link.userId).catch(() => null);
    await user
      ?.send(`✅ Your Twitch name **${login}** is linked. While your favourite streamers are live, chatting there now earns rewards in the server.`)
      .catch(() => null);
  } catch (err) {
    logError("bot", err);
  }
}
