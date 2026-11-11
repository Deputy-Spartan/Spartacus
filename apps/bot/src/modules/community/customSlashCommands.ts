import {
  ActionRowBuilder,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GuildExplicitContentFilter,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  GuildVerificationLevel,
  PermissionFlagsBits,
  type ButtonInteraction,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  type OverwriteResolvable,
  type PermissionsString,
  type Role,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import type { CustomSlashCommand } from "@spartacus/db";
import { logError } from "@spartacus/db";
import { ACTION_BY_ID, MODULE_KEYS, levelForXp, parseDuration, type CommandInput, type CommandStep, type ModuleKey } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { addBalance } from "../../lib/economy";
import { logCase } from "../../lib/cases";
import { isSendableChannel } from "../../lib/channels";
import { invalidateModuleCache } from "../../lib/moduleGate";
import { lockdownGuild } from "../security/antiRaid";

// Command Builder: runs a dashboard-made /command step by step. Each step is
// an action from packages/shared/commandBuilder.ts. Inputs the person typed
// fill {name} anywhere in a step; {me} is whoever ran it.

type InputValue = { kind: "user" | "role" | "channel"; id: string } | { kind: "value"; value: string };
interface Ctx {
  guild: Guild;
  me: GuildMember;
  channelId: string;
  inputs: Map<string, InputValue>;
  made: { channel?: string; role?: string; category?: string; message?: { channelId: string; id: string } };
  lines: string[]; // what happened, for the reply and the log
  privateNotes: string[];
  checkPerms: boolean;
  stopped: string | null;
  skip: Set<number>;
}

const MAX_WAIT_MS = 10 * 60_000;
const cooldowns = new Map<string, number>();
const pending = new Map<string, { commandId: string; userId: string; inputs: Record<string, InputValue>; channelId: string; expires: number }>();
const asSteps = (v: unknown): CommandStep[] => (Array.isArray(v) ? (v as CommandStep[]).filter((s) => s && typeof s.action === "string") : []);
const asInputs = (v: unknown): CommandInput[] => (Array.isArray(v) ? (v as CommandInput[]) : []);
const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Filling in {inputs} ----

function fill(ctx: Ctx, raw: string): string {
  return String(raw ?? "").replace(/\{([a-z0-9_-]+)\}/gi, (whole, key: string) => {
    const k = key.toLowerCase();
    if (k === "me") return `<@${ctx.me.id}>`;
    if (k === "server") return ctx.guild.name;
    if (k === "channel") return `<#${ctx.channelId}>`;
    if (k === "new_channel") return ctx.made.channel ? `<#${ctx.made.channel}>` : whole;
    if (k === "new_role") return ctx.made.role ? `<@&${ctx.made.role}>` : whole;
    const v = ctx.inputs.get(k);
    if (!v) return "";
    if (v.kind === "user") return `<@${v.id}>`;
    if (v.kind === "role") return `<@&${v.id}>`;
    if (v.kind === "channel") return `<#${v.id}>`;
    return v.kind === "value" ? v.value : "";
  });
}

// A user, role or channel from a step: an id, a mention, {me}, {an_input} or {new_…}.
function refId(ctx: Ctx, raw: string, kind: "user" | "role" | "channel"): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const tok = t.match(/^\{([a-z0-9_-]+)\}$/i)?.[1]?.toLowerCase();
  if (tok) {
    if (tok === "me") return kind === "user" ? ctx.me.id : null;
    if (tok === "channel") return kind === "channel" ? ctx.channelId : null;
    if (tok === "new_channel" || tok === "new_category") return kind === "channel" ? (tok === "new_channel" ? ctx.made.channel : ctx.made.category) ?? null : null;
    if (tok === "new_role") return kind === "role" ? ctx.made.role ?? null : null;
    const v = ctx.inputs.get(tok);
    if (!v) return null;
    if (v.kind === kind) return v.id;
    if (v.kind === "value") return v.value.match(/\d{15,25}/)?.[0] ?? null;
    return null;
  }
  return t.match(/\d{15,25}/)?.[0] ?? null;
}

async function member(ctx: Ctx, raw: string, orMe: boolean): Promise<GuildMember> {
  const id = refId(ctx, raw, "user") ?? (orMe ? ctx.me.id : null);
  if (!id) throw new Error("no member picked");
  const m = await ctx.guild.members.fetch(id).catch(() => null);
  if (!m) throw new Error("that member isn't in the server");
  return m;
}
async function role(ctx: Ctx, raw: string, required = true): Promise<Role | null> {
  const id = refId(ctx, raw, "role");
  if (!id) {
    if (required) throw new Error("no role picked");
    return null;
  }
  const r = await ctx.guild.roles.fetch(id).catch(() => null);
  if (!r) throw new Error("that role doesn't exist anymore");
  return r;
}
async function channel(ctx: Ctx, raw: string, orHere: boolean): Promise<GuildBasedChannel> {
  const id = refId(ctx, raw, "channel") ?? (orHere ? ctx.channelId : null);
  if (!id) throw new Error("no channel picked");
  const c = await ctx.guild.channels.fetch(id).catch(() => null);
  if (!c) throw new Error("that channel doesn't exist anymore");
  return c;
}
async function textChannel(ctx: Ctx, raw: string) {
  const c = await channel(ctx, raw, true);
  if (!isSendableChannel(c)) throw new Error(`#${c.name} isn't a channel Spartacus can post in`);
  return c;
}
async function category(ctx: Ctx, raw: string, required: boolean): Promise<CategoryChannel | null> {
  if (!String(raw ?? "").trim()) {
    if (required) throw new Error("no category picked");
    return null;
  }
  const c = await channel(ctx, raw, false);
  if (c.type !== ChannelType.GuildCategory) throw new Error(`${c.name} isn't a category`);
  return c;
}
async function voice(ctx: Ctx, raw: string): Promise<VoiceChannel> {
  const c = await channel(ctx, raw, false);
  if (c.type !== ChannelType.GuildVoice) throw new Error(`${c.name} isn't a voice channel`);
  return c;
}
async function message(ctx: Ctx, raw: string): Promise<Message> {
  const t = fill(ctx, raw).trim();
  let channelId = ctx.made.message?.channelId ?? ctx.channelId;
  let id = ctx.made.message?.id ?? null;
  const link = t.match(/channels\/\d+\/(\d+)\/(\d+)/);
  if (link) [channelId, id] = [link[1], link[2]];
  else if (/^\d{15,25}$/.test(t)) id = t;
  if (!id) throw new Error("no message picked (paste a message link)");
  const c = await ctx.guild.channels.fetch(channelId).catch(() => null);
  if (!c || !("messages" in c)) throw new Error("couldn't find that message's channel");
  const m = await c.messages.fetch(id).catch(() => null);
  if (!m) throw new Error("couldn't find that message");
  return m;
}
const text = (ctx: Ctx, raw: string) => fill(ctx, raw).trim();
function num(ctx: Ctx, raw: string, fallback: number): number {
  const n = Number(fill(ctx, raw).trim());
  return Number.isFinite(n) && String(raw ?? "").trim() !== "" ? n : fallback;
}
function dur(ctx: Ctx, raw: string, required = true): number | null {
  const t = fill(ctx, raw).trim();
  if (!t) {
    if (required) throw new Error("no time given");
    return null;
  }
  const ms = parseDuration(t);
  if (ms === null) throw new Error(`“${t}” isn't a time like 10m, 2h or 1d`);
  return ms;
}
const yes = (v: string) => v === "Yes" || v === "On";
function color(ctx: Ctx, raw: string): number | undefined {
  const t = fill(ctx, raw).trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(t) ? parseInt(t, 16) : undefined;
}
// "SendMessages:allow,ViewChannel:deny" into an overwrite.
function permMap(raw: string): Partial<Record<PermissionsString, boolean | null>> {
  const out: Partial<Record<PermissionsString, boolean | null>> = {};
  for (const part of String(raw ?? "").split(",")) {
    const [k, v] = part.split(":").map((x) => x.trim());
    if (k && k in PermissionFlagsBits) out[k as PermissionsString] = v === "allow" ? true : v === "deny" ? false : null;
  }
  return out;
}
function allowBits(raw: string): bigint {
  let bits = 0n;
  for (const [k, v] of Object.entries(permMap(raw))) if (v) bits |= PermissionFlagsBits[k as keyof typeof PermissionFlagsBits];
  return bits;
}

// The person must outrank who they act on (unless they own the server), and so must Spartacus.
function outranks(ctx: Ctx, target: GuildMember) {
  if (target.id === ctx.guild.ownerId) throw new Error("nobody can do that to the server owner");
  const bot = ctx.guild.members.me;
  if (bot && target.roles.highest.position >= bot.roles.highest.position) throw new Error(`${target.displayName}'s top role is above Spartacus's`);
  if (ctx.checkPerms && ctx.me.id !== ctx.guild.ownerId && target.id !== ctx.me.id && target.roles.highest.position >= ctx.me.roles.highest.position) throw new Error(`you can't do that to ${target.displayName} (their top role is as high as yours)`);
}
function roleBelow(ctx: Ctx, r: Role) {
  const bot = ctx.guild.members.me;
  if (r.managed) throw new Error(`${r.name} belongs to an app or Discord, so it can't be changed`);
  if (bot && r.position >= bot.roles.highest.position) throw new Error(`${r.name} is above Spartacus's role, drag Spartacus higher`);
  if (ctx.checkPerms && ctx.me.id !== ctx.guild.ownerId && r.position >= ctx.me.roles.highest.position) throw new Error(`${r.name} is as high as your top role`);
}
const reasonOf = (ctx: Ctx, raw: string | undefined) => `${text(ctx, raw ?? "") || "No reason given"} (by ${ctx.me.user.username} via /command)`.slice(0, 500);

// ---- Onboarding (edits keep everything else as it was) ----
async function onboardingData(guild: Guild) {
  const ob = await guild.fetchOnboarding();
  const prompts = [...ob.prompts.values()].map((p) => ({
    id: p.id,
    title: p.title,
    singleSelect: p.singleSelect,
    required: p.required,
    inOnboarding: p.inOnboarding,
    type: p.type,
    options: [...p.options.values()].map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      emoji: o.emoji?.id ?? o.emoji?.name ?? undefined,
      roles: [...o.roles.keys()],
      channels: [...o.channels.keys()],
    })),
  }));
  return { ob, prompts, defaultChannels: [...ob.defaultChannels.keys()] };
}
type OnbPrompt = Awaited<ReturnType<typeof onboardingData>>["prompts"][number];
async function saveOnboarding(guild: Guild, prompts: OnbPrompt[], defaultChannels: string[], enabled?: boolean) {
  const ob = await guild.fetchOnboarding();
  await guild.editOnboarding({ prompts: prompts as never, defaultChannels, enabled: enabled ?? ob.enabled, mode: ob.mode });
}
const findPrompt = (prompts: OnbPrompt[], title: string) => prompts.find((p) => p.title.toLowerCase() === title.toLowerCase());

async function rawIncidents(client: Client, guildId: string): Promise<{ invites?: string | null; dms?: string | null }> {
  const g = (await client.rest.get(`/guilds/${guildId}`).catch(() => null)) as { incidents_data?: { invites_disabled_until?: string | null; dms_disabled_until?: string | null } } | null;
  return { invites: g?.incidents_data?.invites_disabled_until ?? null, dms: g?.incidents_data?.dms_disabled_until ?? null };
}

async function moveBy<T extends { position: number; setPosition: (n: number, o?: { relative?: boolean; reason?: string }) => Promise<unknown> }>(thing: T, dir: string, by: number) {
  const steps = Math.max(1, Math.round(by || 1));
  await thing.setPosition(dir === "Down" ? -steps : steps, { relative: true });
}

// ---- The actions ----
type Runner = (ctx: Ctx, p: Record<string, string>) => Promise<string>;
const RUN: Record<string, Runner> = {
  // Messages
  async send_message(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    const m = await c.send({ content: text(ctx, p.text).slice(0, 2000) || "​", allowedMentions: { parse: ["users", "roles"] } });
    ctx.made.message = { channelId: c.id, id: m.id };
    return `Sent a message in <#${c.id}>`;
  },
  async post_embed(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    const e = new EmbedBuilder().setDescription(text(ctx, p.description).slice(0, 4000) || "​").setColor(color(ctx, p.color) ?? 0x5865f2);
    if (text(ctx, p.title)) e.setTitle(text(ctx, p.title).slice(0, 256));
    if (/^https?:\/\//.test(text(ctx, p.image))) e.setImage(text(ctx, p.image));
    const m = await c.send({ embeds: [e], allowedMentions: { parse: [] } });
    ctx.made.message = { channelId: c.id, id: m.id };
    return `Posted an embed in <#${c.id}>`;
  },
  async reply_private(ctx, p) {
    ctx.privateNotes.push(text(ctx, p.text));
    return "Replied privately";
  },
  async dm(ctx, p) {
    const m = await member(ctx, p.user, false);
    await m.send({ content: text(ctx, p.text).slice(0, 2000) }).catch(() => {
      throw new Error(`${m.displayName} doesn't accept DMs`);
    });
    return `DMed ${m.displayName}`;
  },
  async role_buttons(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    const roles: Role[] = [];
    for (const id of String(p.roles ?? "").split(",").map((x) => refId(ctx, x, "role")).filter((x): x is string => !!x).slice(0, 25)) {
      const r = await ctx.guild.roles.fetch(id).catch(() => null);
      if (r) roles.push(r);
    }
    if (!roles.length) throw new Error("no roles picked");
    for (const r of roles) roleBelow(ctx, r);
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    roles.forEach((r, i) => {
      if (i % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
      rows[rows.length - 1].addComponents(new ButtonBuilder().setCustomId(`cmdbrole:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary));
    });
    const m = await c.send({ content: text(ctx, p.text).slice(0, 2000), components: rows, allowedMentions: { parse: [] } });
    ctx.made.message = { channelId: c.id, id: m.id };
    return `Posted ${roles.length} role buttons in <#${c.id}>`;
  },
  async poll(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    const answers = text(ctx, p.answers).split(/\n|,/).map((a) => a.trim()).filter(Boolean).slice(0, 10);
    if (answers.length < 2) throw new Error("a poll needs at least 2 answers");
    const m = await c.send({ poll: { question: { text: text(ctx, p.question).slice(0, 300) }, answers: answers.map((a) => ({ text: a.slice(0, 55) })), duration: Math.min(768, Math.max(1, Math.round(num(ctx, p.hours, 24)))), allowMultiselect: yes(p.multi) } });
    ctx.made.message = { channelId: c.id, id: m.id };
    return `Posted a poll in <#${c.id}>`;
  },
  async edit_message(ctx, p) {
    const m = await message(ctx, p.message);
    if (m.author.id !== ctx.guild.client.user.id) throw new Error("Spartacus can only edit its own messages");
    await m.edit({ content: text(ctx, p.text).slice(0, 2000) });
    return "Edited the message";
  },
  async purge(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    if (!("bulkDelete" in c)) throw new Error("can't purge here");
    const count = Math.min(100, Math.max(1, Math.round(num(ctx, p.count, 10))));
    const fetched = await c.messages.fetch({ limit: 100 });
    const who = p.only === "From one member" ? refId(ctx, p.user, "user") : null;
    const pick = [...fetched.values()]
      .filter((m) => (p.only === "From bots" ? m.author.bot : p.only === "With links" ? /https?:\/\//.test(m.content) : p.only === "With images" ? m.attachments.size > 0 : who ? m.author.id === who : true))
      .slice(0, count);
    const done = await c.bulkDelete(pick, true);
    return `Deleted ${done.size} message${done.size === 1 ? "" : "s"} in <#${c.id}>${done.size < pick.length ? " (Discord can't bulk delete messages over 2 weeks old)" : ""}`;
  },
  async pin(ctx, p) {
    const m = await message(ctx, p.message);
    if (p.mode === "Unpin") await m.unpin();
    else await m.pin();
    return `${p.mode === "Unpin" ? "Unpinned" : "Pinned"} the message`;
  },
  async react(ctx, p) {
    const m = await message(ctx, p.message);
    await m.react(text(ctx, p.emoji));
    return "Reacted";
  },
  async publish(ctx, p) {
    const m = await message(ctx, p.message);
    if (m.channel.type !== ChannelType.GuildAnnouncement) throw new Error("only messages in announcement channels can be published");
    await m.crosspost();
    return "Published the announcement";
  },
  async send_later(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    const ms = Math.min(30 * 86_400_000, dur(ctx, p.after)!);
    await prisma.commandTimer.create({ data: { guildId: ctx.guild.id, kind: "SEND", channelId: c.id, text: text(ctx, p.text).slice(0, 2000), runAt: new Date(Date.now() + ms) } });
    return `Will send a message in <#${c.id}> <t:${Math.floor((Date.now() + ms) / 1000)}:R>`;
  },
  async thread(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    if (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement) throw new Error("threads need a text channel");
    const t = await c.threads.create({ name: text(ctx, p.name).slice(0, 100) || "thread", type: (p.kind === "Private" && c.type === ChannelType.GuildText ? ChannelType.PrivateThread : ChannelType.PublicThread) as never });
    if (p.kind === "Private") await t.members.add(ctx.me.id).catch(() => null);
    ctx.made.channel = t.id;
    return `Made thread <#${t.id}>`;
  },
  // Members
  async warn(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    const c = await logCase({ guildId: ctx.guild.id, userId: m.id, action: "WARN", reason: text(ctx, p.reason) || "No reason given", moderatorId: ctx.me.id, client: ctx.guild.client });
    await m.send(`You were warned in **${ctx.guild.name}**: ${text(ctx, p.reason) || "No reason given"}`).catch(() => null);
    return `Warned ${m.displayName} (case #${c.caseNumber})`;
  },
  async timeout(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    const ms = Math.min(28 * 86_400_000, dur(ctx, p.for)!);
    await m.timeout(ms, reasonOf(ctx, p.reason));
    await logCase({ guildId: ctx.guild.id, userId: m.id, action: "MUTE", reason: text(ctx, p.reason) || "No reason given", moderatorId: ctx.me.id, client: ctx.guild.client }).catch(() => null);
    return `Timed out ${m.displayName} until <t:${Math.floor((Date.now() + ms) / 1000)}:t>`;
  },
  async untimeout(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    await m.timeout(null);
    await logCase({ guildId: ctx.guild.id, userId: m.id, action: "UNMUTE", reason: "Timeout removed", moderatorId: ctx.me.id, client: ctx.guild.client }).catch(() => null);
    return `Removed ${m.displayName}'s timeout`;
  },
  async kick(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    await m.kick(reasonOf(ctx, p.reason));
    await logCase({ guildId: ctx.guild.id, userId: m.id, action: "KICK", reason: text(ctx, p.reason) || "No reason given", moderatorId: ctx.me.id, client: ctx.guild.client }).catch(() => null);
    return `Kicked ${m.displayName}`;
  },
  async ban(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    const days = Math.min(7, Math.max(0, Math.round(num(ctx, p.days, 0))));
    await m.ban({ reason: reasonOf(ctx, p.reason), deleteMessageSeconds: days * 86_400 });
    await logCase({ guildId: ctx.guild.id, userId: m.id, action: "BAN", reason: text(ctx, p.reason) || "No reason given", moderatorId: ctx.me.id, client: ctx.guild.client }).catch(() => null);
    return `Banned ${m.displayName}`;
  },
  async tempban(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    const ms = Math.min(365 * 86_400_000, dur(ctx, p.for)!);
    await m.ban({ reason: reasonOf(ctx, p.reason) });
    await prisma.commandTimer.create({ data: { guildId: ctx.guild.id, kind: "UNBAN", userId: m.id, runAt: new Date(Date.now() + ms) } });
    await logCase({ guildId: ctx.guild.id, userId: m.id, action: "BAN", reason: `${text(ctx, p.reason) || "No reason given"} (temporary)`, moderatorId: ctx.me.id, client: ctx.guild.client }).catch(() => null);
    return `Banned ${m.displayName} until <t:${Math.floor((Date.now() + ms) / 1000)}:f>`;
  },
  async unban(ctx, p) {
    const id = refId(ctx, p.user, "user");
    if (!id) throw new Error("no user ID given");
    await ctx.guild.bans.remove(id, reasonOf(ctx, p.reason));
    await logCase({ guildId: ctx.guild.id, userId: id, action: "UNBAN", reason: text(ctx, p.reason) || "No reason given", moderatorId: ctx.me.id, client: ctx.guild.client }).catch(() => null);
    return `Unbanned <@${id}>`;
  },
  async nickname(ctx, p) {
    const m = await member(ctx, p.user, false);
    if (m.id !== ctx.me.id) outranks(ctx, m);
    await m.setNickname(text(ctx, p.nick).slice(0, 32) || null);
    return text(ctx, p.nick) ? `Set ${m.user.username}'s nickname to ${text(ctx, p.nick).slice(0, 32)}` : `Reset ${m.user.username}'s nickname`;
  },
  async move_voice(ctx, p) {
    const m = await member(ctx, p.user, false);
    if (!m.voice.channelId) throw new Error(`${m.displayName} isn't in voice`);
    const v = await voice(ctx, p.voice);
    await m.voice.setChannel(v);
    return `Moved ${m.displayName} to 🔊 ${v.name}`;
  },
  async disconnect(ctx, p) {
    const m = await member(ctx, p.user, false);
    if (!m.voice.channelId) throw new Error(`${m.displayName} isn't in voice`);
    await m.voice.disconnect();
    return `Disconnected ${m.displayName}`;
  },
  async server_mute(ctx, p) {
    const m = await member(ctx, p.user, false);
    if (!m.voice.channelId) throw new Error(`${m.displayName} isn't in voice`);
    await m.voice.setMute(p.mode !== "Unmute");
    return `${p.mode === "Unmute" ? "Unmuted" : "Muted"} ${m.displayName}`;
  },
  async server_deafen(ctx, p) {
    const m = await member(ctx, p.user, false);
    if (!m.voice.channelId) throw new Error(`${m.displayName} isn't in voice`);
    await m.voice.setDeaf(p.mode !== "Undeafen");
    return `${p.mode === "Undeafen" ? "Undeafened" : "Deafened"} ${m.displayName}`;
  },
  async quarantine(ctx, p) {
    const m = await member(ctx, p.user, false);
    outranks(ctx, m);
    const previous = m.roles.cache.filter((r) => r.id !== ctx.guild.id && !r.managed).map((r) => r.id);
    await prisma.quarantineRecord.create({ data: { guildId: ctx.guild.id, userId: m.id, reason: text(ctx, p.reason) || "No reason given", quarantinedBy: ctx.me.id, previousRoles: previous } });
    await m.roles.set(m.roles.cache.filter((r) => r.managed).map((r) => r.id), reasonOf(ctx, p.reason));
    return `Quarantined ${m.displayName} (${previous.length} roles saved, /release gives them back)`;
  },
  // Roles
  async give_role(ctx, p) {
    const m = await member(ctx, p.user, true);
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    await m.roles.add(r);
    return `Gave ${r.name} to ${m.displayName}`;
  },
  async remove_role(ctx, p) {
    const m = await member(ctx, p.user, true);
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    await m.roles.remove(r);
    return `Took ${r.name} from ${m.displayName}`;
  },
  async toggle_role(ctx, p) {
    const m = await member(ctx, p.user, true);
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    if (m.roles.cache.has(r.id)) {
      await m.roles.remove(r);
      return `Took ${r.name} from ${m.displayName}`;
    }
    await m.roles.add(r);
    return `Gave ${r.name} to ${m.displayName}`;
  },
  async temp_role(ctx, p) {
    const m = await member(ctx, p.user, true);
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    const ms = Math.min(365 * 86_400_000, dur(ctx, p.for)!);
    await m.roles.add(r);
    await prisma.commandTimer.create({ data: { guildId: ctx.guild.id, kind: "REMOVE_ROLE", userId: m.id, roleId: r.id, runAt: new Date(Date.now() + ms) } });
    return `Gave ${r.name} to ${m.displayName} until <t:${Math.floor((Date.now() + ms) / 1000)}:f>`;
  },
  async create_role(ctx, p) {
    const r = await ctx.guild.roles.create({ name: text(ctx, p.name).slice(0, 100) || "new role", color: color(ctx, p.color), hoist: yes(p.hoist), mentionable: yes(p.mentionable), permissions: [], reason: reasonOf(ctx, "") });
    ctx.made.role = r.id;
    return `Made role ${r.name}`;
  },
  async edit_role(ctx, p) {
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    const perms = String(p.perms ?? "").trim() ? r.permissions.add(allowBits(p.perms)).remove(Object.entries(permMap(p.perms)).filter(([, v]) => v === false).map(([k]) => PermissionFlagsBits[k as keyof typeof PermissionFlagsBits])) : undefined;
    if (perms && ctx.checkPerms && ctx.me.id !== ctx.guild.ownerId && !ctx.me.permissions.has(perms.bitfield)) throw new Error("you can't give a role permissions you don't have");
    await r.edit({ name: text(ctx, p.name) || undefined, color: color(ctx, p.color), permissions: perms });
    return `Updated role ${r.name}`;
  },
  async move_role(ctx, p) {
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    await moveBy(r, p.dir, num(ctx, p.by, 1));
    return `Moved ${r.name} ${p.dir === "Down" ? "down" : "up"}`;
  },
  async delete_role(ctx, p) {
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    await r.delete(reasonOf(ctx, ""));
    return `Deleted role ${r.name}`;
  },
  async bulk_give(ctx, p) {
    const from = (await role(ctx, p.from))!;
    const to = (await role(ctx, p.role))!;
    roleBelow(ctx, to);
    await ctx.guild.members.fetch();
    let n = 0;
    for (const m of from.members.values()) if (!m.roles.cache.has(to.id) && (await m.roles.add(to).then(() => true, () => false))) n++;
    return `Gave ${to.name} to ${n} member${n === 1 ? "" : "s"} with ${from.name}`;
  },
  async bulk_remove(ctx, p) {
    const r = (await role(ctx, p.role))!;
    roleBelow(ctx, r);
    await ctx.guild.members.fetch();
    let n = 0;
    for (const m of r.members.values()) if (await m.roles.remove(r).then(() => true, () => false)) n++;
    return `Took ${r.name} from ${n} member${n === 1 ? "" : "s"}`;
  },
  // Channels
  async create_text(ctx, p) {
    const parent = await category(ctx, p.category, false);
    const c = await ctx.guild.channels.create({ name: text(ctx, p.name).slice(0, 100) || "new-channel", type: ChannelType.GuildText, parent: parent ?? undefined, topic: text(ctx, p.topic) || undefined, permissionOverwrites: privateFor(ctx, yes(p.private), parent) });
    ctx.made.channel = c.id;
    return `Made <#${c.id}>`;
  },
  async create_voice(ctx, p) {
    const parent = await category(ctx, p.category, false);
    const c = await ctx.guild.channels.create({ name: text(ctx, p.name).slice(0, 100) || "New Voice", type: ChannelType.GuildVoice, parent: parent ?? undefined, userLimit: Math.min(99, Math.max(0, Math.round(num(ctx, p.limit, 0)))), permissionOverwrites: privateFor(ctx, yes(p.private), parent) });
    ctx.made.channel = c.id;
    return `Made 🔊 ${c.name}`;
  },
  async create_other(ctx, p) {
    const parent = await category(ctx, p.category, false);
    const type = p.kind === "Stage" ? ChannelType.GuildStageVoice : p.kind === "Announcement" ? ChannelType.GuildAnnouncement : ChannelType.GuildForum;
    const c = await ctx.guild.channels.create({ name: text(ctx, p.name).slice(0, 100) || "new-channel", type, parent: parent ?? undefined });
    ctx.made.channel = c.id;
    return `Made ${p.kind || "Forum"} channel <#${c.id}>`;
  },
  async rename_channel(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (!("setName" in c)) throw new Error("that can't be renamed");
    const old = c.name;
    await c.setName(text(ctx, p.name).slice(0, 100));
    return `Renamed ${old} to ${text(ctx, p.name).slice(0, 100)}`;
  },
  async set_topic(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    if (!("setTopic" in c)) throw new Error("that channel has no topic");
    await (c as TextChannel).setTopic(text(ctx, p.topic).slice(0, 1024) || null);
    return `Set the topic of <#${c.id}>`;
  },
  async move_channel(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    const parent = (await category(ctx, p.category, true))!;
    if (!("setParent" in c)) throw new Error("that can't be moved");
    await c.setParent(parent, { lockPermissions: false });
    return `Moved ${c.name} into ${parent.name}`;
  },
  async clone_channel(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (!("clone" in c)) throw new Error("that can't be cloned");
    const copy = await c.clone({ name: text(ctx, p.name) || undefined });
    ctx.made.channel = copy.id;
    return `Cloned ${c.name} as <#${copy.id}>`;
  },
  async delete_channel(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (c.id === ctx.channelId) throw new Error("can't delete the channel the command was used in (the reply would vanish); run it somewhere else");
    const name = c.name;
    await c.delete(reasonOf(ctx, ""));
    return `Deleted ${name}`;
  },
  async lock_channel(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    const r = (await role(ctx, p.role, false)) ?? ctx.guild.roles.everyone;
    if (!("permissionOverwrites" in c)) throw new Error("that channel has no permissions");
    const lock = p.mode !== "Unlock";
    await c.permissionOverwrites.edit(r, { SendMessages: lock ? false : null, SendMessagesInThreads: lock ? false : null, AddReactions: lock ? false : null });
    return `${lock ? "Locked" : "Unlocked"} <#${c.id}> for ${r.id === ctx.guild.id ? "@everyone" : r.name}`;
  },
  async hide_channel(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    const r = (await role(ctx, p.role, false)) ?? ctx.guild.roles.everyone;
    if (!("permissionOverwrites" in c)) throw new Error("that channel has no permissions");
    await c.permissionOverwrites.edit(r, { ViewChannel: p.mode === "Show" ? null : false });
    return `${p.mode === "Show" ? "Showed" : "Hid"} ${c.name} for ${r.id === ctx.guild.id ? "@everyone" : r.name}`;
  },
  async channel_perms(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (!("permissionOverwrites" in c)) throw new Error("that channel has no permissions");
    const r = await role(ctx, p.role, false);
    const target = r ?? (String(p.user ?? "").trim() ? await member(ctx, p.user, false) : null);
    if (!target) throw new Error("pick a role or a member");
    if (ctx.checkPerms && ctx.me.id !== ctx.guild.ownerId && !ctx.me.permissions.has(allowBits(p.perms))) throw new Error("you can't allow permissions you don't have");
    await c.permissionOverwrites.edit(target, permMap(p.perms));
    return `Updated permissions on ${c.name} for ${"name" in target ? target.name : target.displayName}`;
  },
  async sync_channel(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (!("lockPermissions" in c) || !c.parent) throw new Error(`${c.name} isn't in a category`);
    await c.lockPermissions();
    return `Synced ${c.name} with ${c.parent.name}`;
  },
  async slowmode(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    if (!("setRateLimitPerUser" in c)) throw new Error("that channel has no slowmode");
    const secs = Math.min(21_600, Math.round((dur(ctx, p.every) ?? 0) / 1000));
    await c.setRateLimitPerUser(secs);
    return secs ? `Slowmode in <#${c.id}>: one message every ${secs}s` : `Slowmode off in <#${c.id}>`;
  },
  async nsfw(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    if (!("setNSFW" in c)) throw new Error("that channel can't be age-restricted");
    await c.setNSFW(p.mode !== "Off");
    return `Age-restricted ${p.mode === "Off" ? "off" : "on"} in <#${c.id}>`;
  },
  async voice_settings(ctx, p) {
    const v = await voice(ctx, p.voice);
    await v.edit({
      userLimit: String(p.limit ?? "").trim() ? Math.min(99, Math.max(0, Math.round(num(ctx, p.limit, 0)))) : undefined,
      bitrate: String(p.bitrate ?? "").trim() ? Math.min(ctx.guild.maximumBitrate, Math.max(8000, Math.round(num(ctx, p.bitrate, 64)) * 1000)) : undefined,
    });
    return `Updated 🔊 ${v.name}`;
  },
  async voice_status(ctx, p) {
    const v = await voice(ctx, p.voice);
    await ctx.guild.client.rest.put(`/channels/${v.id}/voice-status`, { body: { status: text(ctx, p.status).slice(0, 500) } });
    return `Set the status of 🔊 ${v.name}`;
  },
  async thread_manage(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (!c.isThread()) throw new Error(`${c.name} isn't a thread`);
    if (p.mode === "Delete") await c.delete();
    else if (p.mode === "Lock") await c.setLocked(true);
    else await c.setArchived(true);
    return `${p.mode === "Delete" ? "Deleted" : p.mode === "Lock" ? "Locked" : "Archived"} the thread ${c.name}`;
  },
  async invite(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    if (!("createInvite" in c)) throw new Error("can't make an invite to that channel");
    const exp = dur(ctx, p.expires, false);
    const inv = await c.createInvite({ maxUses: Math.max(0, Math.round(num(ctx, p.uses, 0))), maxAge: exp ? Math.min(604_800, Math.round(exp / 1000)) : 0, unique: true, reason: reasonOf(ctx, "") });
    ctx.privateNotes.push(`🔗 ${inv.url}`);
    return `Made an invite: ${inv.url}`;
  },
  async delete_invites(ctx, p) {
    const code = text(ctx, p.code).replace(/^.*\//, "");
    if (code) {
      await ctx.guild.invites.delete(code);
      return `Deleted invite ${code}`;
    }
    const all = await ctx.guild.invites.fetch();
    for (const inv of all.values()) await inv.delete().catch(() => null);
    return `Deleted ${all.size} invite${all.size === 1 ? "" : "s"}`;
  },
  // Categories
  async create_category(ctx, p) {
    const c = await ctx.guild.channels.create({ name: text(ctx, p.name).slice(0, 100) || "NEW CATEGORY", type: ChannelType.GuildCategory, permissionOverwrites: yes(p.private) ? [{ id: ctx.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: ctx.guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }] : undefined });
    ctx.made.category = c.id;
    return `Made category ${c.name}`;
  },
  async rename_category(ctx, p) {
    const c = (await category(ctx, p.category, true))!;
    const old = c.name;
    await c.setName(text(ctx, p.name).slice(0, 100));
    return `Renamed ${old} to ${c.name}`;
  },
  async move_category(ctx, p) {
    const c = (await category(ctx, p.category, true))!;
    await moveBy(c, p.dir, num(ctx, p.by, 1));
    return `Moved ${c.name} ${p.dir === "Down" ? "down" : "up"}`;
  },
  async category_perms(ctx, p) {
    const c = (await category(ctx, p.category, true))!;
    const r = (await role(ctx, p.role, false)) ?? ctx.guild.roles.everyone;
    if (ctx.checkPerms && ctx.me.id !== ctx.guild.ownerId && !ctx.me.permissions.has(allowBits(p.perms))) throw new Error("you can't allow permissions you don't have");
    await c.permissionOverwrites.edit(r, permMap(p.perms));
    let synced = 0;
    if (p.sync !== "No") for (const ch of c.children.cache.values()) if (await ch.lockPermissions().then(() => true, () => false)) synced++;
    return `Updated ${c.name} for ${r.id === ctx.guild.id ? "@everyone" : r.name}${synced ? ` and synced ${synced} channels` : ""}`;
  },
  async delete_category(ctx, p) {
    const c = (await category(ctx, p.category, true))!;
    const kids = [...c.children.cache.values()];
    if (p.mode === "Delete them too") {
      if (kids.some((k) => k.id === ctx.channelId)) throw new Error("the command was used inside that category; run it somewhere else");
      for (const k of kids) await k.delete(reasonOf(ctx, "")).catch(() => null);
    }
    const name = c.name;
    await c.delete(reasonOf(ctx, ""));
    return `Deleted category ${name}${p.mode === "Delete them too" ? ` and its ${kids.length} channels` : ""}`;
  },
  // Onboarding
  async onb_question(ctx, p) {
    const { prompts, defaultChannels } = await onboardingData(ctx.guild);
    const r = await role(ctx, p.role, false);
    const ch = String(p.channel ?? "").trim() ? await channel(ctx, p.channel, false) : null;
    prompts.push({ title: text(ctx, p.title).slice(0, 100), singleSelect: yes(p.single), required: yes(p.required), inOnboarding: true, type: 0, options: [{ title: text(ctx, p.answer).slice(0, 50), roles: r ? [r.id] : [], channels: ch ? [ch.id] : [] }] } as unknown as OnbPrompt);
    await saveOnboarding(ctx.guild, prompts, defaultChannels);
    return `Added the onboarding question “${text(ctx, p.title)}”`;
  },
  async onb_answer(ctx, p) {
    const { prompts, defaultChannels } = await onboardingData(ctx.guild);
    const q = findPrompt(prompts, text(ctx, p.question));
    if (!q) throw new Error(`no onboarding question called “${text(ctx, p.question)}”`);
    const r = await role(ctx, p.role, false);
    const ch = String(p.channel ?? "").trim() ? await channel(ctx, p.channel, false) : null;
    if (!r && !ch) throw new Error("an answer needs a role or a channel");
    q.options.push({ title: text(ctx, p.answer).slice(0, 50), roles: r ? [r.id] : [], channels: ch ? [ch.id] : [], emoji: text(ctx, p.emoji) || undefined } as OnbPrompt["options"][number]);
    await saveOnboarding(ctx.guild, prompts, defaultChannels);
    return `Added “${text(ctx, p.answer)}” to “${q.title}”`;
  },
  async onb_edit(ctx, p) {
    const { prompts, defaultChannels } = await onboardingData(ctx.guild);
    const q = findPrompt(prompts, text(ctx, p.question));
    if (!q) throw new Error(`no onboarding question called “${text(ctx, p.question)}”`);
    if (text(ctx, p.title)) q.title = text(ctx, p.title).slice(0, 100);
    if (p.required === "Yes" || p.required === "No") q.required = p.required === "Yes";
    await saveOnboarding(ctx.guild, prompts, defaultChannels);
    return `Updated the onboarding question “${q.title}”`;
  },
  async onb_remove(ctx, p) {
    const { prompts, defaultChannels } = await onboardingData(ctx.guild);
    const q = findPrompt(prompts, text(ctx, p.question));
    if (!q) throw new Error(`no onboarding question called “${text(ctx, p.question)}”`);
    const answer = text(ctx, p.answer);
    if (answer) {
      const before = q.options.length;
      q.options = q.options.filter((o) => o.title.toLowerCase() !== answer.toLowerCase());
      if (q.options.length === before) throw new Error(`“${q.title}” has no answer called “${answer}”`);
      await saveOnboarding(ctx.guild, prompts, defaultChannels);
      return `Removed “${answer}” from “${q.title}”`;
    }
    await saveOnboarding(ctx.guild, prompts.filter((x) => x !== q), defaultChannels);
    return `Removed the onboarding question “${q.title}”`;
  },
  async onb_default(ctx, p) {
    const { prompts, defaultChannels } = await onboardingData(ctx.guild);
    const c = await channel(ctx, p.channel, false);
    const next = p.mode === "Remove" ? defaultChannels.filter((id) => id !== c.id) : [...new Set([...defaultChannels, c.id])];
    await saveOnboarding(ctx.guild, prompts, next);
    return `${p.mode === "Remove" ? "Removed" : "Added"} ${c.name} ${p.mode === "Remove" ? "from" : "to"} the default channels`;
  },
  async onb_toggle(ctx, p) {
    const { prompts, defaultChannels } = await onboardingData(ctx.guild);
    await saveOnboarding(ctx.guild, prompts, defaultChannels, p.mode !== "Off");
    return `Onboarding turned ${p.mode === "Off" ? "off" : "on"}`;
  },
  // Server
  async server_name(ctx, p) {
    await ctx.guild.setName(text(ctx, p.name).slice(0, 100), reasonOf(ctx, ""));
    return `Renamed the server to ${text(ctx, p.name).slice(0, 100)}`;
  },
  async server_image(ctx, p) {
    const url = text(ctx, p.url);
    if (!/^https?:\/\//.test(url)) throw new Error("that isn't an image link");
    if (p.which === "Banner") await ctx.guild.setBanner(url);
    else await ctx.guild.setIcon(url);
    return `Changed the server ${p.which === "Banner" ? "banner" : "icon"}`;
  },
  async server_channels(ctx, p) {
    const c = await channel(ctx, p.channel, false);
    if (c.type !== ChannelType.GuildText) throw new Error("pick a text channel");
    if (p.which === "Rules") await ctx.guild.setRulesChannel(c);
    else if (p.which === "Community updates") await ctx.guild.setPublicUpdatesChannel(c);
    else await ctx.guild.setSystemChannel(c);
    return `Set the ${(p.which || "System").split(" ")[0].toLowerCase()} channel to <#${c.id}>`;
  },
  async verification(ctx, p) {
    const levels = { None: GuildVerificationLevel.None, Low: GuildVerificationLevel.Low, Medium: GuildVerificationLevel.Medium, High: GuildVerificationLevel.High, Highest: GuildVerificationLevel.VeryHigh } as const;
    await ctx.guild.setVerificationLevel(levels[(p.level || "Low") as keyof typeof levels] ?? GuildVerificationLevel.Low);
    return `Verification level: ${p.level || "Low"}`;
  },
  async content_filter(ctx, p) {
    const levels = { Nobody: GuildExplicitContentFilter.Disabled, "Members without roles": GuildExplicitContentFilter.MembersWithoutRoles, Everyone: GuildExplicitContentFilter.AllMembers } as const;
    await ctx.guild.setExplicitContentFilter(levels[(p.level || "Everyone") as keyof typeof levels] ?? GuildExplicitContentFilter.AllMembers);
    return `Content filter: ${p.level || "Everyone"}`;
  },
  async pause(ctx, p) {
    const ms = dur(ctx, p.for, false);
    const until = ms ? new Date(Date.now() + Math.min(86_400_000, ms)).toISOString() : null;
    const cur = await rawIncidents(ctx.guild.client, ctx.guild.id);
    const what = p.what || "Invites";
    await ctx.guild.client.rest.put(`/guilds/${ctx.guild.id}/incident-actions`, {
      body: { invites_disabled_until: what === "DMs" ? cur.invites : until, dms_disabled_until: what === "Invites" ? cur.dms : until },
    });
    return until ? `Paused ${what.toLowerCase()} until <t:${Math.floor(Date.parse(until) / 1000)}:t>` : `Unpaused ${what.toLowerCase()}`;
  },
  async lockdown(ctx) {
    await lockdownGuild(ctx.guild);
    return "Raid lockdown is on (undo it from the dashboard or Stream Deck)";
  },
  // AutoMod
  async automod_create(ctx, p) {
    const kind = p.kind || "Words";
    const words = text(ctx, p.words).split(",").map((w) => w.trim()).filter(Boolean).slice(0, 1000);
    if (kind === "Words" && !words.length) throw new Error("add some words to block");
    const triggerType = kind === "Spam" ? AutoModerationRuleTriggerType.Spam : kind === "Mention spam" ? AutoModerationRuleTriggerType.MentionSpam : AutoModerationRuleTriggerType.Keyword;
    const triggerMetadata =
      kind === "Words" ? { keywordFilter: words } : kind === "Invite links" ? { regexPatterns: ["discord(?:\\.gg|(?:app)?\\.com/invite)/\\S+"] } : kind === "Mention spam" ? { mentionTotalLimit: Math.min(50, Math.max(1, Math.round(num(ctx, p.limit, 5)))) } : undefined;
    const rule = await ctx.guild.autoModerationRules.create({ name: text(ctx, p.name).slice(0, 100), eventType: AutoModerationRuleEventType.MessageSend, triggerType, triggerMetadata, actions: [{ type: AutoModerationActionType.BlockMessage }], enabled: true, reason: reasonOf(ctx, "") });
    return `Made the AutoMod rule ${rule.name}`;
  },
  async automod_word(ctx, p) {
    const rules = await ctx.guild.autoModerationRules.fetch();
    const rule = rules.find((r) => r.name.toLowerCase() === text(ctx, p.rule).toLowerCase());
    if (!rule) throw new Error(`no AutoMod rule called “${text(ctx, p.rule)}”`);
    if (rule.triggerType !== AutoModerationRuleTriggerType.Keyword) throw new Error(`${rule.name} isn't a word list rule`);
    const word = text(ctx, p.word);
    const list = rule.triggerMetadata.keywordFilter;
    const next = p.mode === "Remove" ? list.filter((w) => w.toLowerCase() !== word.toLowerCase()) : [...new Set([...list, word])];
    await rule.setKeywordFilter(next);
    return `${p.mode === "Remove" ? "Removed" : "Added"} “${word}” ${p.mode === "Remove" ? "from" : "to"} ${rule.name}`;
  },
  async automod_toggle(ctx, p) {
    const rules = await ctx.guild.autoModerationRules.fetch();
    const rule = rules.find((r) => r.name.toLowerCase() === text(ctx, p.rule).toLowerCase());
    if (!rule) throw new Error(`no AutoMod rule called “${text(ctx, p.rule)}”`);
    await rule.setEnabled(p.mode !== "Off");
    return `${rule.name} turned ${p.mode === "Off" ? "off" : "on"}`;
  },
  // Events
  async event_create(ctx, p) {
    const start = new Date(Date.now() + Math.max(60_000, dur(ctx, p.in)!));
    const v = String(p.voice ?? "").trim() ? await voice(ctx, p.voice) : null;
    const ev = await ctx.guild.scheduledEvents.create(
      v
        ? { name: text(ctx, p.name).slice(0, 100), scheduledStartTime: start, privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, entityType: GuildScheduledEventEntityType.Voice, channel: v, description: text(ctx, p.about).slice(0, 1000) || undefined }
        : { name: text(ctx, p.name).slice(0, 100), scheduledStartTime: start, scheduledEndTime: new Date(start.getTime() + 2 * 3_600_000), privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, entityType: GuildScheduledEventEntityType.External, entityMetadata: { location: text(ctx, p.where).slice(0, 100) || ctx.guild.name }, description: text(ctx, p.about).slice(0, 1000) || undefined }
    );
    return `Made the event ${ev.name} for <t:${Math.floor(start.getTime() / 1000)}:f>`;
  },
  async event_status(ctx, p) {
    const all = await ctx.guild.scheduledEvents.fetch();
    const ev = all.find((e) => e.name.toLowerCase() === text(ctx, p.name).toLowerCase());
    if (!ev) throw new Error(`no event called “${text(ctx, p.name)}”`);
    const status = p.mode === "End" ? GuildScheduledEventStatus.Completed : p.mode === "Cancel" ? GuildScheduledEventStatus.Canceled : GuildScheduledEventStatus.Active;
    await ev.setStatus(status as never);
    return `${p.mode === "End" ? "Ended" : p.mode === "Cancel" ? "Canceled" : "Started"} the event ${ev.name}`;
  },
  // Emojis, stickers, webhooks
  async emoji_add(ctx, p) {
    const e = await ctx.guild.emojis.create({ attachment: text(ctx, p.url), name: text(ctx, p.name).replace(/[^\w]/g, "_").slice(0, 32) || "emoji" });
    return `Added the emoji ${e}`;
  },
  async emoji_delete(ctx, p) {
    const all = await ctx.guild.emojis.fetch();
    const e = all.find((x) => x.name?.toLowerCase() === text(ctx, p.name).replace(/:/g, "").toLowerCase());
    if (!e) throw new Error(`no emoji called ${text(ctx, p.name)}`);
    await e.delete();
    return `Deleted the emoji :${e.name}:`;
  },
  async sticker_add(ctx, p) {
    const s = await ctx.guild.stickers.create({ file: text(ctx, p.url), name: text(ctx, p.name).slice(0, 30), tags: text(ctx, p.tag) || "⭐" });
    return `Added the sticker ${s.name}`;
  },
  async sticker_delete(ctx, p) {
    const all = await ctx.guild.stickers.fetch();
    const s = all.find((x) => x.name.toLowerCase() === text(ctx, p.name).toLowerCase());
    if (!s) throw new Error(`no sticker called ${text(ctx, p.name)}`);
    await s.delete();
    return `Deleted the sticker ${s.name}`;
  },
  async webhook_send(ctx, p) {
    const c = await channel(ctx, p.channel, true);
    if (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement) throw new Error("webhooks need a text channel");
    const hooks = await (c as TextChannel).fetchWebhooks();
    const hook = hooks.find((h) => h.owner?.id === ctx.guild.client.user.id && h.name === "Spartacus Commands") ?? (await (c as TextChannel).createWebhook({ name: "Spartacus Commands" }));
    const avatar = text(ctx, p.avatar);
    await hook.send({ content: text(ctx, p.text).slice(0, 2000), username: text(ctx, p.name).slice(0, 80) || "Spartacus", avatarURL: /^https?:\/\//.test(avatar) ? avatar : undefined, allowedMentions: { parse: [] } });
    return `Sent as ${text(ctx, p.name).slice(0, 80)} in <#${c.id}>`;
  },
  // Spartacus
  async coins(ctx, p) {
    const m = await member(ctx, p.user, true);
    const amount = Math.round(num(ctx, p.amount, 0));
    if (!amount) throw new Error("the amount is 0");
    await addBalance(ctx.guild.id, m.id, amount, "custom_command");
    return `${amount > 0 ? "Gave" : "Took"} ${Math.abs(amount)} coins ${amount > 0 ? "to" : "from"} ${m.displayName}`;
  },
  async xp(ctx, p) {
    const m = await member(ctx, p.user, true);
    const amount = Math.round(num(ctx, p.amount, 0));
    const row = await prisma.memberXp.upsert({ where: { guildId_userId: { guildId: ctx.guild.id, userId: m.id } }, create: { guildId: ctx.guild.id, userId: m.id, xp: Math.max(0, amount) }, update: { xp: { increment: amount } } });
    const xp = Math.max(0, row.xp);
    await prisma.memberXp.update({ where: { id: row.id }, data: { xp, level: levelForXp(xp) } });
    return `Gave ${amount} XP to ${m.displayName} (level ${levelForXp(xp)})`;
  },
  async giveaway(ctx, p) {
    const c = await textChannel(ctx, p.channel);
    const ms = Math.min(30 * 86_400_000, dur(ctx, p.for)!);
    await prisma.giveaway.create({ data: { guildId: ctx.guild.id, channelId: c.id, prize: text(ctx, p.prize).slice(0, 200), winnerCount: Math.min(20, Math.max(1, Math.round(num(ctx, p.winners, 1)))), endsAt: new Date(Date.now() + ms) } });
    return `Started a giveaway for ${text(ctx, p.prize)} in <#${c.id}> (posts within a minute)`;
  },
  async reminder(ctx, p) {
    const m = await member(ctx, p.user, true);
    const ms = Math.min(365 * 86_400_000, dur(ctx, p.in)!);
    await prisma.reminder.create({ data: { userId: m.id, guildId: ctx.guild.id, channelId: ctx.channelId, message: text(ctx, p.text).slice(0, 1000), remindAt: new Date(Date.now() + ms) } });
    return `Will remind ${m.displayName} <t:${Math.floor((Date.now() + ms) / 1000)}:R>`;
  },
  async module(ctx, p) {
    const key = p.key as ModuleKey;
    if (!(MODULE_KEYS as readonly string[]).includes(key)) throw new Error("pick a module");
    const on = p.mode !== "Off";
    await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: ctx.guild.id, key } }, create: { guildId: ctx.guild.id, key, enabled: on }, update: { enabled: on } });
    invalidateModuleCache(ctx.guild.id, key);
    return `Turned ${key.replace(/_/g, " ").toLowerCase()} ${on ? "on" : "off"}`;
  },
  async tournament(ctx, p) {
    const t = await prisma.matchTournament.findFirst({ where: { guildId: ctx.guild.id, status: { in: ["DRAFT", "OPEN", "CHECKIN"] } }, orderBy: { createdAt: "desc" } });
    if (!t) throw new Error("there's no tournament waiting; make one on the dashboard");
    const { openTournament, tournamentCheckIn, startTournamentNow } = await import("../matches/tournaments");
    const run = p.mode === "Start now" ? startTournamentNow : p.mode === "Open check-in" ? tournamentCheckIn : openTournament;
    const problem = await run(ctx.guild.client, t.id);
    if (problem) throw new Error(problem);
    return `${p.mode || "Open registration"}: ${t.name}`;
  },
  async log(ctx, p) {
    return `📝 ${text(ctx, p.text)}`;
  },
  // Flow (only_if, wait, random and stop are handled by the runner itself)
  async confirm() {
    return "";
  },
};

function privateFor(ctx: Ctx, isPrivate: boolean, parent: CategoryChannel | null): OverwriteResolvable[] | undefined {
  void parent;
  if (!isPrivate) return undefined;
  return [
    { id: ctx.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ctx.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: ctx.guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
  ];
}

// Turns Discord's errors into something a server owner understands.
function friendly(err: unknown): string {
  const e = err as { code?: number; message?: string };
  if (e?.code === 50013) return "Spartacus is missing a permission for this (or its role is too low)";
  if (e?.code === 50001) return "Spartacus can't see that";
  if (e?.code === 10011) return "that role doesn't exist";
  if (e?.code === 10003) return "that channel doesn't exist";
  if (e?.code === 30005) return "the server has too many roles";
  if (e?.code === 30013) return "the server has too many channels";
  if (e?.code === 50035) return `Discord didn't accept that: ${String(e.message ?? "").split("\n").slice(-1)[0].slice(0, 120)}`;
  return String(e?.message ?? err).slice(0, 160);
}

// ---- Running a command ----

async function runSteps(ctx: Ctx, steps: CommandStep[]) {
  for (let i = 0; i < steps.length && !ctx.stopped; i++) {
    if (ctx.skip.has(i)) continue;
    const step = steps[i];
    const def = ACTION_BY_ID[step.action];
    const p = step.params ?? {};
    if (!def) continue;
    try {
      if (def.id === "only_if") {
        const check = p.check || "They have a role";
        let ok = true;
        if (check === "They have a role" || check === "They don't have a role") {
          const r = refId(ctx, p.role, "role");
          ok = !!r && ctx.me.roles.cache.has(r) === (check === "They have a role");
        } else if (check === "Used in a channel") ok = refId(ctx, p.channel, "channel") === ctx.channelId;
        else {
          const v = ctx.inputs.get(String(p.input ?? "").toLowerCase().replace(/[{}]/g, ""));
          const value = v ? (v.kind === "value" ? v.value : v.id) : "";
          ok = value.toLowerCase() === text(ctx, p.value).toLowerCase();
        }
        if (!ok) ctx.stopped = text(ctx, p.otherwise) || "Stopped: the check didn't pass.";
        continue;
      }
      if (def.id === "wait") {
        await sleep(Math.min(MAX_WAIT_MS, dur(ctx, p.for) ?? 0));
        continue;
      }
      if (def.id === "random") {
        const n = Math.max(1, Math.min(steps.length - i - 1, Math.round(num(ctx, p.count, 2))));
        const keep = i + 1 + Math.floor(Math.random() * n);
        for (let j = i + 1; j <= i + n; j++) if (j !== keep) ctx.skip.add(j);
        continue;
      }
      if (def.id === "stop") {
        ctx.stopped = text(ctx, p.text) || " ";
        continue;
      }
      if (ctx.checkPerms && def.perm && ctx.me.id !== ctx.guild.ownerId && !ctx.me.permissions.has(def.perm as PermissionsString)) {
        ctx.lines.push(`⚠️ ${def.name}: you need the ${def.perm.replace(/([a-z])([A-Z])/g, "$1 $2")} permission`);
        continue;
      }
      const run = RUN[def.id];
      if (!run) continue;
      const line = await run(ctx, p);
      if (line) ctx.lines.push(`✅ ${line}`);
    } catch (err) {
      ctx.lines.push(`⚠️ ${def.name}: ${friendly(err)}`);
    }
  }
}

function resultOf(ctx: Ctx): "OK" | "PARTIAL" | "FAILED" {
  const bad = ctx.lines.filter((l) => l.startsWith("⚠️")).length;
  if (!bad) return "OK";
  return bad === ctx.lines.length ? "FAILED" : "PARTIAL";
}

async function logRun(guild: Guild, command: CustomSlashCommand, userId: string, inputs: Record<string, InputValue>, result: string, details: string[]) {
  const flat = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.kind === "value" ? v.value : v.id]));
  await prisma.customCommandRun.create({ data: { guildId: guild.id, commandId: command.id, commandName: command.name, userId, inputs: flat, result, details } }).catch((err) => logError("bot", err, guild.id));
  if (command.logChannelId && result !== "DENIED") {
    const c = await guild.channels.fetch(command.logChannelId).catch(() => null);
    if (isSendableChannel(c)) {
      const color = result === "OK" ? 0x3ba55d : result === "PARTIAL" ? 0xf0b232 : 0xed4245;
      await c.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(`/${command.name}`).setDescription([`Run by <@${userId}>`, ...details].join("\n").slice(0, 4000)).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => null);
    }
  }
}

function readInputs(interaction: ChatInputCommandInteraction, inputs: CommandInput[]): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const i of inputs) {
    const o = interaction.options.get(i.name);
    if (!o) continue;
    if (i.type === "member" && o.user) out[i.name] = { kind: "user", id: o.user.id };
    else if (i.type === "role" && o.role) out[i.name] = { kind: "role", id: o.role.id };
    else if (i.type === "channel" && o.channel) out[i.name] = { kind: "channel", id: o.channel.id };
    else if (i.type === "yesno") out[i.name] = { kind: "value", value: o.value ? "Yes" : "No" };
    else if (o.value !== undefined && o.value !== null) out[i.name] = { kind: "value", value: String(o.value) };
  }
  return out;
}

async function denied(command: CustomSlashCommand, me: GuildMember, channelId: string): Promise<string | null> {
  if (!command.enabled) return "This command is turned off.";
  const channels = asIds(command.channelIds);
  if (channels.length && !channels.includes(channelId)) return `/${command.name} only works in ${channels.map((c) => `<#${c}>`).join(", ")}.`;
  const owner = me.id === me.guild.ownerId;
  if (!owner) {
    if (command.access === "ADMINS" && !me.permissions.has(PermissionFlagsBits.Administrator)) return `Only admins can use /${command.name}.`;
    if (command.access === "MODS" && !me.permissions.has(PermissionFlagsBits.ModerateMembers)) return `Only moderators can use /${command.name}.`;
    if (command.access === "ROLES") {
      const roles = asIds(command.roleIds);
      if (!roles.some((r) => me.roles.cache.has(r))) return `Only ${roles.map((r) => `<@&${r}>`).join(", ")} can use /${command.name}.`;
    }
  }
  if (command.cooldownSec > 0) {
    const key = `${command.id}:${me.id}`;
    const until = cooldowns.get(key) ?? 0;
    if (Date.now() < until) return `Slow down: you can use /${command.name} again <t:${Math.ceil(until / 1000)}:R>.`;
  }
  return null;
}

async function execute(command: CustomSlashCommand, guild: Guild, me: GuildMember, channelId: string, inputs: Record<string, InputValue>) {
  if (command.cooldownSec > 0) cooldowns.set(`${command.id}:${me.id}`, Date.now() + command.cooldownSec * 1000);
  const ctx: Ctx = { guild, me, channelId, inputs: new Map(Object.entries(inputs)), made: {}, lines: [], privateNotes: [], checkPerms: command.checkPerms, stopped: null, skip: new Set() };
  await runSteps(ctx, asSteps(command.steps));
  const result = resultOf(ctx);
  await logRun(guild, command, me.id, inputs, ctx.lines.length ? result : "OK", ctx.lines.length ? ctx.lines : ["(no steps)"]);
  return ctx;
}

function replyText(command: CustomSlashCommand, ctx: Ctx): string {
  const failed = ctx.lines.filter((l) => l.startsWith("⚠️"));
  const parts = [
    ctx.stopped && ctx.stopped.trim() ? ctx.stopped : "",
    !ctx.stopped || ctx.stopped.trim() === "" ? fill(ctx, command.reply).trim() : "",
    ...ctx.privateNotes,
    failed.length ? `\n${failed.join("\n")}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, 2000) || (failed.length ? "Some steps didn't work." : "✅ Done.");
}

const isRisky = (command: CustomSlashCommand) => asSteps(command.steps).some((s) => ACTION_BY_ID[s.action]?.risky || s.action === "confirm");

export async function executeCustomCommand(interaction: ChatInputCommandInteraction, command: CustomSlashCommand) {
  const guild = interaction.guild;
  if (!guild) return;
  const me = await guild.members.fetch(interaction.user.id);
  const no = await denied(command, me, interaction.channelId);
  const inputs = readInputs(interaction, asInputs(command.inputs));
  if (no) {
    await interaction.reply({ content: no, ephemeral: true, allowedMentions: { parse: [] } });
    if (command.enabled) await logRun(guild, command, me.id, inputs, "DENIED", [no]);
    return;
  }
  if (isRisky(command) && !command.skipConfirm) {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    pending.set(token, { commandId: command.id, userId: me.id, inputs, channelId: interaction.channelId, expires: Date.now() + 5 * 60_000 });
    const steps = asSteps(command.steps);
    const ask = steps.find((s) => s.action === "confirm")?.params?.question;
    const list = steps.filter((s) => !["confirm", "only_if", "wait", "random", "stop"].includes(s.action)).map((s, i) => `${i + 1}. ${ACTION_BY_ID[s.action]?.name ?? s.action}${ACTION_BY_ID[s.action]?.risky ? " ⚠️" : ""}`);
    await interaction.reply({
      ephemeral: true,
      content: [`**${ask ? ask.replace(/\{([a-z0-9_-]+)\}/gi, (w, k) => (inputs[k] ? (inputs[k].kind === "value" ? (inputs[k] as { value: string }).value : `<@${(inputs[k] as { id: string }).id}>`) : w)) : `Run /${command.name}?`}**`, ...list].join("\n").slice(0, 2000),
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cmdb:yes:${token}`).setLabel("Yes, do it").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`cmdb:no:${token}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary))],
      allowedMentions: { parse: [] },
    });
    return;
  }
  await interaction.deferReply({ ephemeral: !command.replyPublic });
  const ctx = await execute(command, guild, me, interaction.channelId, inputs);
  await interaction.editReply({ content: replyText(command, ctx), allowedMentions: { parse: ["users"] } });
}

// "Yes, do it" / "Cancel" on risky commands, and role buttons.
export async function handleCommandButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  const [prefix, action, arg] = interaction.customId.split(":");
  if (prefix === "cmdbrole") {
    const r = await guild.roles.fetch(action).catch(() => null);
    const m = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!r || !m) return void (await interaction.reply({ content: "That role doesn't exist anymore.", ephemeral: true }));
    const has = m.roles.cache.has(r.id);
    const ok = await (has ? m.roles.remove(r) : m.roles.add(r)).then(() => true, () => false);
    await interaction.reply({ content: ok ? (has ? `Took **${r.name}** off.` : `You have **${r.name}** now.`) : "Spartacus couldn't change that role (it's above Spartacus's role).", ephemeral: true });
    return;
  }
  const job = pending.get(arg);
  if (!job || job.expires < Date.now()) {
    pending.delete(arg);
    return void (await interaction.update({ content: "This expired. Run the command again.", components: [] }));
  }
  if (job.userId !== interaction.user.id) return void (await interaction.reply({ content: "Only the person who ran it can answer this.", ephemeral: true }));
  pending.delete(arg);
  const command = await prisma.customSlashCommand.findUnique({ where: { id: job.commandId } });
  if (!command) return void (await interaction.update({ content: "That command was deleted.", components: [] }));
  if (action === "no") {
    await logRun(guild, command, job.userId, job.inputs, "CANCELED", ["Canceled before anything happened"]);
    return void (await interaction.update({ content: "Canceled. Nothing happened.", components: [] }));
  }
  await interaction.update({ content: "Working on it…", components: [] });
  const me = await guild.members.fetch(job.userId);
  const ctx = await execute(command, guild, me, job.channelId, job.inputs);
  const content = replyText(command, ctx);
  await interaction.editReply({ content, allowedMentions: { parse: ["users"] } });
  if (command.replyPublic && !ctx.stopped) {
    const c = await guild.channels.fetch(job.channelId).catch(() => null);
    if (isSendableChannel(c)) await c.send({ content: fill(ctx, command.reply).slice(0, 2000) || "✅ Done.", allowedMentions: { parse: ["users"] } }).catch(() => null);
  }
}

// ---- Later: temporary bans and roles, and delayed messages ----
export async function tickCommandTimers(client: Client) {
  const due = await prisma.commandTimer.findMany({ where: { runAt: { lte: new Date() } }, take: 50 });
  for (const t of due) {
    await prisma.commandTimer.delete({ where: { id: t.id } }).catch(() => null);
    const guild = client.guilds.cache.get(t.guildId);
    if (!guild) continue;
    try {
      if (t.kind === "UNBAN" && t.userId) await guild.bans.remove(t.userId, "Temporary ban ended");
      else if (t.kind === "REMOVE_ROLE" && t.userId && t.roleId) {
        const m = await guild.members.fetch(t.userId).catch(() => null);
        await m?.roles.remove(t.roleId, "Temporary role ended");
      } else if (t.kind === "SEND" && t.channelId) {
        const c = await guild.channels.fetch(t.channelId).catch(() => null);
        if (isSendableChannel(c)) await c.send({ content: (t.text ?? "").slice(0, 2000) || "​", allowedMentions: { parse: ["users", "roles"] } });
      }
    } catch (err) {
      logError("bot", err, t.guildId);
    }
  }
}
