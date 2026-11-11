import { ChannelType, EmbedBuilder, PermissionFlagsBits, type Client, type Guild, type GuildMember, type GuildTextBasedChannel, type VoiceBasedChannel } from "discord.js";
import { MODULE_KEYS, MODULE_LABELS, cleanTempGameChoices, type ModuleKey } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { invalidateModuleCache } from "../../lib/moduleGate";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
import { lockdownGuild } from "../security/antiRaid";
import { sendBumpStatusNow } from "../../lib/bumpStatus";
import { forceRepost } from "../community/stickyMessages";
import { createSquad } from "../community/tempChannels";
import { changeRole } from "./roleManager";
import { forgetXpBoost } from "../leveling/xp";

// Everything the Spartacus Stream Deck plugin can do. A key shows a "face"
// (a title, a line under it and a tone), and pressing it runs the action.
// Dials send turn/press/tap with the dial's current value.

export type Settings = Record<string, string | number | boolean | undefined>;
export interface Face {
  title: string;
  line: string;
  tone: "" | "red" | "green" | "warn" | "off";
  pct?: number; // dials: how full the bar is, 0 to 1
}
export interface RunResult {
  ok: boolean;
  message: string;
  openUrl?: string;
  face?: Face;
}
export interface SdActor {
  guild: Guild;
  userId: string;
  keyId: string;
}

const DASH = process.env.NEXTAUTH_URL?.replace(/\/+$/, "") || "https://spartc.us";
const SLOW_STEPS = [0, 5, 10, 30, 60];
const DIAL_SLOW = [0, 5, 10, 15, 30, 60, 120, 300, 600];
const STATUS = [
  ["🔴", "Live", "red", 0xed4245],
  ["🟡", "Be right back", "warn", 0xf1c40f],
  ["⚫", "Offline", "", 0x4e5058],
] as const;

const str = (s: Settings, k: string) => (typeof s[k] === "string" ? (s[k] as string).trim() : "");
const num = (s: Settings, k: string, d: number) => (Number.isFinite(Number(s[k])) && s[k] !== "" ? Number(s[k]) : d);
const secs = (n: number) => (n ? (n >= 60 ? `${n / 60}m` : `${n}s`) : "Off");
const short = (t: string, n = 14) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

async function getState<T>(guildId: string, key: string): Promise<T | null> {
  const row = await prisma.streamDeckState.findUnique({ where: { guildId_key: { guildId, key } } });
  return (row?.value as T) ?? null;
}
async function setState(guildId: string, key: string, value: unknown) {
  if (value === null) return prisma.streamDeckState.deleteMany({ where: { guildId, key } });
  return prisma.streamDeckState.upsert({ where: { guildId_key: { guildId, key } }, create: { guildId, key, value: value as object }, update: { value: value as object } });
}

function textChannel(guild: Guild, id: string): GuildTextBasedChannel | null {
  const c = id ? guild.channels.cache.get(id) : null;
  return c && c.isTextBased() && !c.isThread() && !c.isVoiceBased() ? (c as GuildTextBasedChannel) : null;
}
const isLocked = (guild: Guild, c: GuildTextBasedChannel) =>
  "permissionOverwrites" in c && !!c.permissionOverwrites.cache.get(guild.id)?.deny.has(PermissionFlagsBits.SendMessages);
async function me(guild: Guild): Promise<GuildMember | null> {
  return guild.members.fetch({ user: guild.client.user.id }).catch(() => null);
}
async function actorMember(a: SdActor) {
  return a.guild.members.fetch(a.userId).catch(() => null);
}
function myVoice(m: GuildMember | null): VoiceBasedChannel | null {
  return m?.voice.channel ?? null;
}
async function lockedDown(guild: Guild) {
  return !!(await getState<{ on: boolean }>(guild.id, "lockdown"))?.on;
}

// ---- Options for the plugin's settings (dropdowns) ----
export async function streamDeckOptions(guild: Guild) {
  const channels = [...guild.channels.cache.values()].sort((a, b) => ("rawPosition" in a && "rawPosition" in b ? a.rawPosition - b.rawPosition : 0));
  const embeds = await prisma.embedCreatorPreset.findMany({ where: { guildId: guild.id }, select: { id: true, name: true }, take: 50 }).catch(() => []);
  const lobby = await prisma.tempChannelLobby.findFirst({ where: { guildId: guild.id } });
  return {
    guild: { id: guild.id, name: guild.name },
    text: channels.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).map((c) => ({ value: c.id, label: `#${c.name}` })),
    voice: channels.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).map((c) => ({ value: c.id, label: `🔊 ${c.name}` })),
    roles: [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ value: r.id, label: `@${r.name}` })),
    modules: MODULE_KEYS.map((k) => ({ value: k, label: MODULE_LABELS[k] })),
    embeds: embeds.map((e) => ({ value: e.id, label: e.name })),
    games: lobby ? cleanTempGameChoices(lobby.gameChoices).map((g) => ({ value: g.label, label: `${g.emoji ?? "🎮"} ${g.label}` })) : [],
  };
}

// ---- Faces ----
export async function streamDeckFace(a: SdActor, action: string, s: Settings): Promise<Face> {
  const g = a.guild;
  switch (action) {
    case "raid":
      return (await lockedDown(g)) ? { title: "Lockdown", line: "LOCKED", tone: "red" } : { title: "Lockdown", line: "Off", tone: "" };
    case "bump": {
      const b = await prisma.bumpReminderSettings.findUnique({ where: { guildId: g.id } });
      if (!b?.nextReminderAt) return { title: "Bump", line: "No bump yet", tone: "" };
      const left = b.nextReminderAt.getTime() - Date.now();
      return left > 0 ? { title: "Bump", line: clock(left), tone: "" } : { title: "Bump", line: "READY", tone: "green" };
    }
    case "lock": {
      const c = textChannel(g, str(s, "channel"));
      if (!c) return { title: "Lock", line: "Pick a channel", tone: "off" };
      const on = isLocked(g, c);
      return { title: short("#" + c.name), line: on ? "Locked" : "Open", tone: on ? "red" : "" };
    }
    case "slow":
    case "dslow": {
      const c = textChannel(g, str(s, "channel"));
      if (!c) return { title: "Slowmode", line: "Pick a channel", tone: "off" };
      const v = "rateLimitPerUser" in c ? c.rateLimitPerUser ?? 0 : 0;
      return { title: short("#" + c.name), line: secs(v), tone: v ? "warn" : "", pct: DIAL_SLOW.indexOf(v) / (DIAL_SLOW.length - 1) };
    }
    case "post":
      return { title: "Go Live Post", line: str(s, "embed") ? "Saved embed" : "Pick an embed", tone: str(s, "embed") ? "" : "off" };
    case "module": {
      const k = str(s, "module") as ModuleKey;
      if (!k) return { title: "Module", line: "Pick one", tone: "off" };
      const t = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId: g.id, key: k } } });
      return { title: short(MODULE_LABELS[k] ?? k), line: t?.enabled ? "On" : "Off", tone: t?.enabled ? "green" : "red" };
    }
    case "role": {
      const r = g.roles.cache.get(str(s, "role"));
      if (!r) return { title: "My Role", line: "Pick a role", tone: "off" };
      const m = await actorMember(a);
      const has = !!m?.roles.cache.has(r.id);
      return { title: short(r.name), line: has ? "✓ On" : "Off", tone: has ? "green" : "" };
    }
    case "squadlock":
    case "dlimit": {
      const vc = myVoice(await actorMember(a));
      if (!vc) return { title: action === "dlimit" ? "Squad Limit" : "My Squad", line: "Not in voice", tone: "off" };
      const locked = !!vc.permissionOverwrites.cache.get(g.id)?.deny.has(PermissionFlagsBits.Connect);
      if (action === "dlimit") return { title: short(vc.name), line: vc.userLimit ? `Limit ${vc.userLimit}` : "No limit", tone: locked ? "red" : "", pct: vc.userLimit / 99 };
      return { title: short(vc.name), line: locked ? "Locked" : "Open", tone: locked ? "red" : "" };
    }
    case "mute": {
      const m = await actorMember(a);
      const vc = myVoice(m);
      if (!vc) return { title: "Mute Squad", line: "Not in voice", tone: "off" };
      const muted = vc.members.some((x) => x.id !== a.userId && !!x.voice.serverMute);
      return { title: "Mute Squad", line: muted ? "Muted" : "Talking", tone: muted ? "red" : "" };
    }
    case "online":
    case "dstats": {
      const full = await g.fetch().catch(() => g);
      const stats: Array<[string, number]> = [
        ["Online", full.approximatePresenceCount ?? 0],
        ["In voice", g.voiceStates.cache.filter((v) => !!v.channelId).size],
        ["Members", full.approximateMemberCount ?? g.memberCount],
        ["Open tickets", await prisma.ticket.count({ where: { guildId: g.id, status: { in: ["OPEN", "CLAIMED"] } } })],
        ["Applications", await prisma.application.count({ where: { guildId: g.id, status: "PENDING" } })],
      ];
      const i = action === "online" ? 0 : ((num(s, "stat", 0) % stats.length) + stats.length) % stats.length;
      return { title: stats[i][0], line: String(stats[i][1]), tone: "", pct: i / (stats.length - 1) };
    }
    case "tickets": {
      const n = await prisma.ticket.count({ where: { guildId: g.id, status: { in: ["OPEN", "CLAIMED"] } } });
      return { title: "Tickets", line: `${n} open`, tone: n ? "warn" : "green" };
    }
    case "claim": {
      const n = await prisma.ticket.count({ where: { guildId: g.id, status: "OPEN", claimedById: null } });
      return { title: "Claim Ticket", line: n ? `${n} waiting` : "None", tone: n ? "warn" : "green" };
    }
    case "apps": {
      const n = await prisma.application.count({ where: { guildId: g.id, status: "PENDING" } });
      return { title: "Applications", line: n ? `${n} to review` : "None", tone: n ? "warn" : "green" };
    }
    case "giveaway":
    case "dtimer": {
      const gw = await prisma.giveaway.findFirst({ where: { guildId: g.id, ended: false }, orderBy: { endsAt: "asc" } });
      if (gw && gw.endsAt.getTime() > Date.now()) return { title: short(gw.prize), line: `Ends ${clock(gw.endsAt.getTime() - Date.now())}`, tone: "green", pct: 1 };
      const mins = num(s, "minutes", 60);
      return { title: action === "dtimer" ? (s.mode === "poll" ? "Poll" : "Giveaway") : "Giveaway", line: action === "dtimer" ? `${mins} min` : "Start", tone: "", pct: Math.min(1, mins / 120) };
    }
    case "dxp": {
      const l = await prisma.levelingSettings.findUnique({ where: { guildId: g.id } });
      const on = !!(l?.xpBoostEndsAt && l.xpBoostEndsAt.getTime() > Date.now());
      const pick = num(s, "boost", 2);
      return on ? { title: `${l!.xpBoost}x XP`, line: `Ends ${clock(l!.xpBoostEndsAt!.getTime() - Date.now())}`, tone: "green", pct: (l!.xpBoost - 1) / 2 } : { title: "XP Boost", line: `${pick}x · press`, tone: "", pct: (pick - 1) / 2 };
    }
    case "purge":
    case "dpurge":
      return { title: "Clear Chat", line: `${num(s, "count", 10)} msgs`, tone: "", pct: num(s, "count", 10) / 100 };
    case "dlock": {
      const list = [...g.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText).sort((x, y) => ("rawPosition" in x && "rawPosition" in y ? x.rawPosition - y.rawPosition : 0));
      const c = list.length ? (list[((num(s, "index", 0) % list.length) + list.length) % list.length] as GuildTextBasedChannel) : null;
      if (!c) return { title: "Channel Lock", line: "No channels", tone: "off" };
      const on = isLocked(g, c);
      return { title: short("#" + c.name), line: on ? "Locked" : "Open", tone: on ? "red" : "", pct: list.indexOf(c as never) / Math.max(1, list.length - 1) };
    }
    case "dmm":
    case "mm": {
      const t = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId: g.id, key: "MATCHES" } } });
      return { title: "Matchmaking", line: t?.enabled ? "Queues open" : "Closed", tone: t?.enabled ? "green" : "" };
    }
    case "poll":
      return { title: "Quick Poll", line: short(str(s, "question") || "Set a question", 16), tone: str(s, "question") ? "" : "off" };
    case "say":
      return { title: "Say", line: short(str(s, "text") || "Set a message", 16), tone: str(s, "text") ? "" : "off" };
    case "golive":
      return { title: "Go Live", line: (await getState<{ on: boolean }>(g.id, "safe"))?.on ? "LIVE" : "4 steps", tone: (await getState<{ on: boolean }>(g.id, "safe"))?.on ? "red" : "" };
    case "safe": {
      const on = !!(await getState<{ on: boolean }>(g.id, "safe"))?.on;
      return { title: "Stream Safe", line: on ? "ON" : "Off", tone: on ? "green" : "" };
    }
    case "liveind": {
      const st = await getState<{ on: boolean }>(g.id, `liveind:${str(s, "channel")}`);
      return { title: "Live Indicator", line: !str(s, "channel") ? "Pick a channel" : st?.on ? "LIVE" : "Off stream", tone: !str(s, "channel") ? "off" : st?.on ? "red" : "" };
    }
    case "shout":
      return { title: "Shoutout", line: short(str(s, "streamer") || "Set a name"), tone: str(s, "streamer") ? "" : "off" };
    case "event": {
      const ev = await prisma.event.findFirst({ where: { guildId: g.id, status: "SCHEDULED", startTime: { gte: new Date(Date.now() - 6 * 3600_000) } }, orderBy: { startTime: "asc" } });
      return { title: "Start Event", line: ev ? short(ev.title) : "None scheduled", tone: ev ? "" : "off" };
    }
    case "pull": {
      const from = g.channels.cache.get(str(s, "voice"));
      const n = from && from.isVoiceBased() ? from.members.size : 0;
      return { title: "Pull Squad", line: from ? `${n} in ${short(from.name, 10)}` : "Pick a channel", tone: from ? "" : "off" };
    }
    case "newsquad":
      return { title: "New Squad", line: short(str(s, "game") || "Any game"), tone: "" };
    case "sticky":
      return { title: "Resend Sticky", line: textChannel(g, str(s, "channel")) ? short("#" + textChannel(g, str(s, "channel"))!.name) : "Pick a channel", tone: textChannel(g, str(s, "channel")) ? "" : "off" };
    case "status": {
      const st = (await getState<{ level: number }>(g.id, `status:${a.userId}`))?.level ?? 2;
      return { title: "My Status", line: `${STATUS[st][0]} ${STATUS[st][1]}`, tone: STATUS[st][2] };
    }
    case "botstat":
      return { title: "Spartacus", line: `Online · ${Math.max(0, Math.round(g.client.ws.ping))}ms`, tone: "green" };
  }
  return { title: action, line: "", tone: "" };
}

// ---- Running a key or dial ----
async function post(a: SdActor, s: Settings): Promise<RunResult> {
  const c = textChannel(a.guild, str(s, "channel"));
  if (!c) return { ok: false, message: "Pick the channel to post in." };
  const saved = await resolveSavedEmbed(str(s, "embed") || null);
  if (!saved) return { ok: false, message: "Pick a saved embed from the Embed Creator." };
  const payload = await buildSavedEmbedPayload(a.guild.id, saved);
  const ping = str(s, "ping");
  await c.send({ ...payload, content: [ping ? `<@&${ping}>` : "", payload.content ?? ""].filter(Boolean).join(" ") || undefined, allowedMentions: { roles: ping ? [ping] : [] } });
  return { ok: true, message: `Posted in #${c.name}.` };
}

async function setSlow(c: GuildTextBasedChannel, v: number) {
  if ("setRateLimitPerUser" in c) await c.setRateLimitPerUser(v, "Stream Deck");
}

async function toggleSafe(a: SdActor, s: Settings, want?: boolean): Promise<RunResult> {
  const g = a.guild;
  const st = await getState<{ on: boolean; channel?: string; prevSlow?: number; prevInvites?: boolean }>(g.id, "safe");
  const on = want ?? !st?.on;
  if (on === !!st?.on) return { ok: true, message: on ? "Stream Safe is already on." : "Stream Safe is already off." };
  if (on) {
    const c = textChannel(g, str(s, "channel"));
    const prevSlow = c && "rateLimitPerUser" in c ? c.rateLimitPerUser ?? 0 : 0;
    const prevInvites = g.features.includes("INVITES_DISABLED");
    if (!prevInvites) await g.disableInvites(true).catch(() => null);
    if (c) await setSlow(c, num(s, "slow", 10)).catch(() => null);
    await setState(g.id, "safe", { on: true, channel: c?.id, prevSlow, prevInvites });
    return { ok: true, message: `Stream Safe on: invites paused${c ? `, ${num(s, "slow", 10)}s slowmode in #${c.name}` : ""}.` };
  }
  if (!st?.prevInvites) await g.disableInvites(false).catch(() => null);
  const c = st?.channel ? textChannel(g, st.channel) : null;
  if (c) await setSlow(c, st?.prevSlow ?? 0).catch(() => null);
  await setState(g.id, "safe", null);
  return { ok: true, message: "Stream Safe off: invites and slowmode are back to how they were." };
}

async function toggleLiveIndicator(a: SdActor, s: Settings, want?: boolean): Promise<RunResult> {
  const g = a.guild;
  const ch = g.channels.cache.get(str(s, "channel"));
  if (!ch || ch.isThread() || !("setName" in ch)) return { ok: false, message: "Pick the channel to rename." };
  const key = `liveind:${ch.id}`;
  const st = await getState<{ on: boolean; name: string }>(g.id, key);
  const on = want ?? !st?.on;
  if (on === !!st?.on) return { ok: true, message: "" };
  if (on) {
    await setState(g.id, key, { on: true, name: ch.name });
    await ch.setName(`🔴 LIVE: ${str(s, "game") || "on stream"}`.slice(0, 100), "Stream Deck: going live");
    return { ok: true, message: "Live Indicator on." };
  }
  await ch.setName(st?.name || ch.name.replace(/^🔴 LIVE: .*$/, "off-stream"), "Stream Deck: stream over");
  await setState(g.id, key, null);
  return { ok: true, message: "Live Indicator off." };
}

export async function runStreamDeck(a: SdActor, action: string, s: Settings, op: "press" | "turn" | "tap" = "press", value?: number): Promise<RunResult> {
  const g = a.guild;
  const member = await actorMember(a);
  const bot = await me(g);
  if (!bot) return { ok: false, message: "Spartacus isn't in this server." };

  switch (action) {
    case "raid": {
      const st = await getState<{ on: boolean; pre: string[] }>(g.id, "lockdown");
      if (!st?.on) {
        const text = [...g.channels.cache.values()].filter((c) => c.isTextBased() && !c.isThread() && !c.isVoiceBased()) as GuildTextBasedChannel[];
        const pre = text.filter((c) => isLocked(g, c)).map((c) => c.id);
        await setState(g.id, "lockdown", { on: true, pre });
        await lockdownGuild(g);
        await g.disableInvites(true).catch(() => null);
        return { ok: true, message: "Server locked down: chat is read-only and invites are paused." };
      }
      for (const c of [...g.channels.cache.values()]) {
        if (!c.isTextBased() || c.isThread() || c.isVoiceBased() || st.pre.includes(c.id)) continue;
        await (c as GuildTextBasedChannel & { permissionOverwrites: { edit: Function } }).permissionOverwrites.edit(g.roles.everyone, { SendMessages: null }, { reason: "Stream Deck: lockdown lifted" }).catch(() => null);
      }
      await g.disableInvites(false).catch(() => null);
      await setState(g.id, "lockdown", null);
      return { ok: true, message: "Lockdown lifted." };
    }
    case "bump": {
      const r = await sendBumpStatusNow(g.client, g.id);
      return r.ok ? { ok: true, message: "Sent the bump message." } : { ok: false, message: r.error ?? "Couldn't send it." };
    }
    case "lock":
    case "dlock": {
      let c = textChannel(g, str(s, "channel"));
      if (action === "dlock") {
        const list = [...g.channels.cache.values()].filter((x) => x.type === ChannelType.GuildText).sort((x, y) => ("rawPosition" in x && "rawPosition" in y ? x.rawPosition - y.rawPosition : 0));
        if (op !== "press") return { ok: true, message: "" };
        c = list.length ? (list[((num(s, "index", 0) % list.length) + list.length) % list.length] as GuildTextBasedChannel) : null;
      }
      if (!c || !("permissionOverwrites" in c)) return { ok: false, message: "Pick a channel." };
      const on = !isLocked(g, c);
      await c.permissionOverwrites.edit(g.roles.everyone, { SendMessages: on ? false : null }, { reason: "Stream Deck" });
      return { ok: true, message: on ? `Locked #${c.name}.` : `Unlocked #${c.name}.` };
    }
    case "slow":
    case "dslow": {
      const c = textChannel(g, str(s, "channel"));
      if (!c) return { ok: false, message: "Pick a channel." };
      const cur = "rateLimitPerUser" in c ? c.rateLimitPerUser ?? 0 : 0;
      let next: number;
      if (action === "slow") next = SLOW_STEPS[(SLOW_STEPS.indexOf(cur) + 1) % SLOW_STEPS.length] ?? 0;
      else if (op === "press") next = 0;
      else next = DIAL_SLOW[Math.max(0, Math.min(DIAL_SLOW.length - 1, Math.round(value ?? 0)))];
      await setSlow(c, next);
      return { ok: true, message: next ? `Slowmode ${secs(next)} in #${c.name}.` : `Slowmode off in #${c.name}.` };
    }
    case "post":
      return post(a, s);
    case "module": {
      const k = str(s, "module") as ModuleKey;
      if (!MODULE_KEYS.includes(k)) return { ok: false, message: "Pick a module." };
      const cur = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId: g.id, key: k } } });
      const enabled = !cur?.enabled;
      await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: g.id, key: k } }, create: { guildId: g.id, key: k, enabled }, update: { enabled } });
      invalidateModuleCache(g.id, k);
      return { ok: true, message: `${MODULE_LABELS[k]} ${enabled ? "on" : "off"}.` };
    }
    case "dmm":
    case "mm": {
      const cur = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId: g.id, key: "MATCHES" } } });
      const enabled = !cur?.enabled;
      await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: g.id, key: "MATCHES" } }, create: { guildId: g.id, key: "MATCHES", enabled }, update: { enabled } });
      invalidateModuleCache(g.id, "MATCHES");
      return { ok: true, message: enabled ? "Matchmaking queues open." : "Matchmaking closed." };
    }
    case "role": {
      const r = g.roles.cache.get(str(s, "role"));
      if (!r || !member) return { ok: false, message: "Pick a role." };
      const res = await changeRole(g, a.userId, r.id, member.roles.cache.has(r.id) ? "TAKE" : "GIVE", { id: a.userId, name: member.user.tag, isOwner: g.ownerId === a.userId, member }, "DASHBOARD");
      return { ok: res.ok, message: res.message };
    }
    case "squadlock":
    case "dlimit": {
      const vc = myVoice(member);
      if (!vc) return { ok: false, message: "Join a voice channel first." };
      if (action === "dlimit" && op === "turn") {
        const lim = Math.max(0, Math.min(99, Math.round(value ?? vc.userLimit)));
        await vc.setUserLimit(lim, "Stream Deck");
        return { ok: true, message: lim ? `Limit ${lim}.` : "No limit." };
      }
      const locked = !!vc.permissionOverwrites.cache.get(g.id)?.deny.has(PermissionFlagsBits.Connect);
      await vc.permissionOverwrites.edit(g.roles.everyone, { Connect: locked ? null : false }, { reason: "Stream Deck" });
      return { ok: true, message: locked ? `Unlocked ${vc.name}.` : `Locked ${vc.name}.` };
    }
    case "mute": {
      const vc = myVoice(member);
      if (!vc) return { ok: false, message: "Join a voice channel first." };
      const others = vc.members.filter((x) => x.id !== a.userId);
      const mute = !others.some((x) => !!x.voice.serverMute);
      for (const m of others.values()) await m.voice.setMute(mute, "Stream Deck: mute squad").catch(() => null);
      return { ok: true, message: mute ? `Muted ${others.size} in ${vc.name}.` : "Unmuted everyone." };
    }
    case "online":
    case "dstats":
      return { ok: true, message: "Refreshed." };
    case "tickets":
      return { ok: true, message: "", openUrl: `${DASH}/dashboard/${g.id}/tickets` };
    case "apps":
      return { ok: true, message: "", openUrl: `${DASH}/dashboard/${g.id}/applications` };
    case "claim": {
      const t = await prisma.ticket.findFirst({ where: { guildId: g.id, status: "OPEN", claimedById: null }, orderBy: { createdAt: "asc" } });
      if (!t) return { ok: false, message: "No tickets are waiting." };
      await prisma.ticket.update({ where: { id: t.id }, data: { claimedById: a.userId, status: "CLAIMED" } });
      const c = textChannel(g, t.channelId);
      await c?.send({ content: `🙋 <@${a.userId}> claimed this ticket.`, allowedMentions: { parse: [] } }).catch(() => null);
      return { ok: true, message: `Claimed ticket #${t.ticketNumber}.`, openUrl: `discord://-/channels/${g.id}/${t.channelId}` };
    }
    case "giveaway":
    case "dtimer": {
      if (action === "dtimer" && op !== "press") return { ok: true, message: "" };
      const c = textChannel(g, str(s, "channel"));
      if (!c) return { ok: false, message: "Pick the channel to post in." };
      const minutes = Math.max(1, Math.min(10080, num(s, "minutes", 60)));
      if (action === "dtimer" && s.mode === "poll") {
        const m = await c.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🗳️ ${str(s, "question") || "Quick poll"}`).setDescription(`Vote below. Ends <t:${Math.floor((Date.now() + minutes * 60_000) / 1000)}:R>.`)] });
        await m.react("👍").catch(() => null);
        await m.react("👎").catch(() => null);
        return { ok: true, message: `Poll posted for ${minutes} minutes.` };
      }
      await prisma.giveaway.create({ data: { guildId: g.id, channelId: c.id, prize: str(s, "prize") || "Mystery prize", endsAt: new Date(Date.now() + minutes * 60_000), winnerCount: Math.max(1, num(s, "winners", 1)) } });
      return { ok: true, message: `Giveaway starts in #${c.name} within a minute.` };
    }
    case "dxp": {
      if (op !== "press") return { ok: true, message: "" };
      const boost = Math.max(1, Math.min(3, num(s, "boost", 2)));
      const endsAt = new Date(Date.now() + 60 * 60_000);
      await prisma.levelingSettings.upsert({ where: { guildId: g.id }, create: { guildId: g.id, xpBoost: boost, xpBoostEndsAt: endsAt }, update: { xpBoost: boost, xpBoostEndsAt: endsAt } });
      forgetXpBoost(g.id);
      const c = textChannel(g, str(s, "channel"));
      await c?.send(`⭐ **${boost}x XP for the next hour!** Chat and hang out in voice to level up faster. Ends <t:${Math.floor(endsAt.getTime() / 1000)}:R>.`).catch(() => null);
      return { ok: true, message: `${boost}x XP for an hour.` };
    }
    case "purge":
    case "dpurge": {
      if (action === "dpurge" && op !== "press") return { ok: true, message: "" };
      const c = textChannel(g, str(s, "channel"));
      if (!c || !("bulkDelete" in c)) return { ok: false, message: "Pick a channel." };
      const n = Math.max(1, Math.min(100, num(s, "count", 10)));
      const gone = await c.bulkDelete(n, true).catch(() => null);
      return { ok: !!gone, message: gone ? `Cleared ${gone.size} messages in #${c.name}.` : "Couldn't clear them." };
    }
    case "poll": {
      const c = textChannel(g, str(s, "channel"));
      if (!c) return { ok: false, message: "Pick a channel." };
      const m = await c.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🗳️ ${str(s, "question") || "Quick poll"}`).setDescription("Vote with the reactions below.")] });
      await m.react("👍").catch(() => null);
      await m.react("👎").catch(() => null);
      return { ok: true, message: "Poll posted." };
    }
    case "say": {
      const c = textChannel(g, str(s, "channel"));
      if (!c || !str(s, "text")) return { ok: false, message: "Pick a channel and type a message." };
      await c.send({ content: str(s, "text").slice(0, 2000), allowedMentions: { parse: [] } });
      return { ok: true, message: "Sent." };
    }
    case "safe":
      return toggleSafe(a, s);
    case "liveind":
      return toggleLiveIndicator(a, s);
    case "golive": {
      // One press: Live Indicator on, Stream Safe on, then the Go Live post.
      const live = !(await getState<{ on: boolean }>(g.id, "safe"))?.on;
      const steps: string[] = [];
      if (str(s, "liveChannel")) steps.push((await toggleLiveIndicator(a, { channel: s.liveChannel, game: s.game }, live)).message);
      steps.push((await toggleSafe(a, { channel: s.safeChannel, slow: s.slow }, live)).message);
      if (live && str(s, "embed")) steps.push((await post(a, s)).message);
      return { ok: true, message: live ? "You're live." : "Stream ended.", face: { title: "Go Live", line: live ? "LIVE" : "4 steps", tone: live ? "red" : "" } };
    }
    case "shout": {
      const c = textChannel(g, str(s, "channel"));
      const who = str(s, "streamer");
      if (!c || !who) return { ok: false, message: "Pick a channel and a streamer." };
      const url = str(s, "link") || `https://twitch.tv/${who.replace(/^@/, "")}`;
      await c.send({ embeds: [new EmbedBuilder().setColor(0x9146ff).setTitle(`📣 Go follow ${who}!`).setURL(url).setDescription(str(s, "note") || `Show them some love at ${url}`)] });
      return { ok: true, message: `Shouted out ${who}.` };
    }
    case "event": {
      const ev = await prisma.event.findFirst({ where: { guildId: g.id, status: "SCHEDULED", startTime: { gte: new Date(Date.now() - 6 * 3600_000) } }, orderBy: { startTime: "asc" }, include: { signups: true } });
      if (!ev) return { ok: false, message: "No scheduled event." };
      const c = textChannel(g, ev.channelId);
      const pings = [...new Set(ev.signups.map((x) => x.userId))].slice(0, 50);
      await c?.send({ content: `📅 **${ev.title}** is starting now!${pings.length ? `\n${pings.map((u) => `<@${u}>`).join(" ")}` : ""}`, allowedMentions: { users: pings } });
      return { ok: true, message: `Started ${ev.title}.` };
    }
    case "pull": {
      const vc = myVoice(member);
      const from = g.channels.cache.get(str(s, "voice"));
      if (!vc) return { ok: false, message: "Join your voice channel first." };
      if (!from || !from.isVoiceBased()) return { ok: false, message: "Pick the lobby to pull from." };
      let n = 0;
      for (const m of from.members.values()) if (await m.voice.setChannel(vc, "Stream Deck: pull squad").then(() => true, () => false)) n++;
      return { ok: true, message: `Moved ${n} into ${vc.name}.` };
    }
    case "newsquad": {
      if (!member) return { ok: false, message: "Couldn't find you in the server." };
      const lobby = await prisma.tempChannelLobby.findFirst({ where: { guildId: g.id } });
      if (!lobby) return { ok: false, message: "Set up Temp Channels first." };
      const game = cleanTempGameChoices(lobby.gameChoices).find((x) => x.label === str(s, "game"));
      const ch = await createSquad(g, member, lobby, game);
      return ch ? { ok: true, message: `Created ${ch.name}.`, openUrl: `discord://-/channels/${g.id}/${ch.id}` } : { ok: false, message: "Couldn't create the squad." };
    }
    case "sticky": {
      const c = textChannel(g, str(s, "channel"));
      const sticky = c ? await prisma.stickyMessage.findUnique({ where: { channelId: c.id } }) : null;
      if (!sticky) return { ok: false, message: "That channel has no sticky message." };
      const r = await forceRepost(g.client as Client, sticky.id);
      return r.ok ? { ok: true, message: "Sticky resent." } : { ok: false, message: r.error ?? "Couldn't resend it." };
    }
    case "status": {
      const key = `status:${a.userId}`;
      const st = (await getState<{ level: number; channel?: string; messageId?: string }>(g.id, key)) ?? { level: 2 };
      const level = (st.level + 1) % STATUS.length;
      const c = textChannel(g, str(s, "channel"));
      const [emoji, text, , color] = STATUS[level];
      const embed = new EmbedBuilder().setColor(color).setTitle(`${emoji} ${member?.displayName ?? "I'm"} ${level === 1 ? "will be right back" : `is ${text.toLowerCase()}`}`).setTimestamp();
      if (str(s, "note")) embed.setDescription(str(s, "note"));
      let messageId = st.messageId;
      if (c) {
        const old = messageId && st.channel === c.id ? await c.messages.fetch(messageId).catch(() => null) : null;
        if (old) await old.edit({ embeds: [embed] }).catch(() => null);
        else messageId = (await c.send({ embeds: [embed] }).catch(() => null))?.id;
      }
      await setState(g.id, key, { level, channel: c?.id, messageId });
      return { ok: true, message: `Status: ${text}.` };
    }
    case "botstat":
      return { ok: true, message: `Online. Ping ${Math.round(g.client.ws.ping)} ms, up ${clock(g.client.uptime ?? 0)}.` };
  }
  return { ok: false, message: "Spartacus doesn't know that button yet. Update the plugin." };
}
