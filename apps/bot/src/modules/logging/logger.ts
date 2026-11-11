import {
  EmbedBuilder,
  Events,
  Message,
  PartialMessage,
  GuildMember,
  PartialGuildMember,
  VoiceState,
  GuildBan,
  Role,
  User,
  Guild,
  GuildEmoji,
  Invite,
  Channel,
  Client,
  PartialUser,
  SendableChannels,
  AuditLogEvent,
  ChannelType,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { claimEvent, sweepEventClaims } from "../../lib/eventClaims";
import { createHash } from "node:crypto";
import type { LoggingConfig } from "@spartacus/db";

const LOG_COLOR = 0x00e5ff;

async function getLogChannel(guildId: string, client: Client) {
  const enabled = await isModuleEnabled(guildId, "MODERATION");
  if (!enabled) return null;

  const config = await prisma.loggingConfig.findUnique({ where: { guildId } });
  if (!config?.logChannelId) return null;

  const ignored = Array.isArray(config.ignoredChannelIds) ? (config.ignoredChannelIds as string[]) : [];
  if (ignored.includes(config.logChannelId)) return null;

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  return { channel: isSendableChannel(channel) ? channel : null, config };
}

function isIgnoredChannel(config: LoggingConfig, channelId: string | null | undefined) {
  if (!channelId) return false;
  const ignored = Array.isArray(config.ignoredChannelIds) ? (config.ignoredChannelIds as string[]) : [];
  return ignored.includes(channelId);
}

// During a deploy the old and new bot both run for a moment and both see
// every event, which posted log lines twice (like an invite logged twice).
// Whichever copy claims a line first posts it; the claim is keyed on what the
// line says, per 15 seconds, so the same event is only posted once.
async function firstToPost(channelId: string, embed: EmbedBuilder) {
  const text = embed.data.description ?? JSON.stringify(embed.data.fields ?? []);
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 16);
  void sweepEventClaims();
  return claimEvent(`log:${channelId}:${hash}:${Math.floor(Date.now() / 15_000)}`).catch(() => true);
}

async function send(channel: SendableChannels | null | undefined, embed: EmbedBuilder) {
  if (!channel) return;
  if (!(await firstToPost(channel.id, embed))) return;
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

function baseEmbed(_config: LoggingConfig, color = LOG_COLOR) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

// ---- Messages ----

export const name = Events.MessageDelete;

export async function onMessageDelete(message: Message | PartialMessage) {
  if (!message.guildId) return;
  const result = await getLogChannel(message.guildId, message.client);
  if (!result?.channel || !result.config.logDeletes) return;
  if (result.config.ignoreBots && message.author?.bot) return;
  if (isIgnoredChannel(result.config, message.channelId)) return;

  const embed = baseEmbed(result.config)
    .setDescription(`🗑️ Message deleted in <#${message.channelId}>`)
    .addFields({ name: "Author", value: message.author ? `<@${message.author.id}>` : "Unknown", inline: true })
    .addFields({ name: "Content", value: message.content?.slice(0, 500) || "*(no cached content)*" });
  if (!result.config.hideThumbnails && message.author) embed.setThumbnail(message.author.displayAvatarURL());

  await send(result.channel, embed);
}

export async function onMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
  if (!newMessage.guildId || oldMessage.content === newMessage.content) return;
  const result = await getLogChannel(newMessage.guildId, newMessage.client);
  if (!result?.channel || !result.config.logEdits) return;
  if (result.config.ignoreBots && newMessage.author?.bot) return;
  if (isIgnoredChannel(result.config, newMessage.channelId)) return;

  const embed = baseEmbed(result.config)
    .setDescription(`✎ Message edited in <#${newMessage.channelId}> · [Jump to message](${newMessage.url})`)
    .addFields({ name: "Author", value: `<@${newMessage.author?.id}>`, inline: true })
    .addFields({ name: "Before", value: oldMessage.content?.slice(0, 400) || "*(uncached)*" })
    .addFields({ name: "After", value: newMessage.content?.slice(0, 400) || "*(empty)*" });

  await send(result.channel, embed);
}

// ---- Members ----

export async function onMemberAdd(member: GuildMember) {
  const result = await getLogChannel(member.guild.id, member.client);
  if (!result?.channel || !result.config.logJoinsLeaves) return;

  const embed = new EmbedBuilder().setColor(0x34d399).setDescription(`📥 <@${member.id}> joined the server.`).setTimestamp();
  if (!result.config.hideThumbnails) embed.setThumbnail(member.user.displayAvatarURL());

  await send(result.channel, embed);
}

export async function onMemberRemove(member: GuildMember | PartialGuildMember) {
  const result = await getLogChannel(member.guild.id, member.client);
  if (!result?.channel || !result.config.logJoinsLeaves) return;

  const embed = new EmbedBuilder().setColor(0xfb7185).setDescription(`📤 ${member.user.tag} left the server.`).setTimestamp();
  if (!result.config.hideThumbnails) embed.setThumbnail(member.user.displayAvatarURL());

  await send(result.channel, embed);
}

export async function onMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
  const result = await getLogChannel(newMember.guild.id, newMember.client);
  if (!result?.channel) return;

  if (result.config.logNicknameChanged && oldMember.nickname !== newMember.nickname) {
    await send(
      result.channel,
      baseEmbed(result.config).setDescription(
        `✏️ <@${newMember.id}> nickname changed: **${oldMember.nickname ?? oldMember.user?.username ?? "—"}** → **${newMember.nickname ?? newMember.user.username}**`
      )
    );
  }

  if (result.config.logMemberRolesChanged) {
    const oldRoles = new Set(oldMember.roles?.cache?.map((r) => r.id) ?? []);
    const newRoles = new Set(newMember.roles.cache.map((r) => r.id));
    const added = [...newRoles].filter((r) => !oldRoles.has(r));
    const removed = [...oldRoles].filter((r) => !newRoles.has(r));
    if (added.length || removed.length) {
      const parts = [
        added.length ? `+ ${added.map((r) => `<@&${r}>`).join(", ")}` : null,
        removed.length ? `- ${removed.map((r) => `<@&${r}>`).join(", ")}` : null,
      ].filter(Boolean);
      await send(result.channel, baseEmbed(result.config).setDescription(`🎭 <@${newMember.id}> roles changed: ${parts.join(" ")}`));
    }
  }
}

export async function onGuildBanAdd(ban: GuildBan) {
  const result = await getLogChannel(ban.guild.id, ban.client);
  if (!result?.channel || !result.config.logMemberBanned) return;
  await send(result.channel, baseEmbed(result.config, 0xef4444).setDescription(`🔨 ${ban.user.tag} was banned from the server.`));
}

export async function onGuildBanRemove(ban: GuildBan) {
  const result = await getLogChannel(ban.guild.id, ban.client);
  if (!result?.channel || !result.config.logMemberUnbanned) return;
  await send(result.channel, baseEmbed(result.config, 0x34d399).setDescription(`🔓 ${ban.user.tag} was unbanned.`));
}

export async function onUserUpdate(oldUser: User | PartialUser, newUser: User) {
  if (oldUser.username === newUser.username && oldUser.avatar === newUser.avatar) return;

  for (const guild of newUser.client.guilds.cache.values()) {
    if (!guild.members.cache.has(newUser.id)) continue;
    const result = await getLogChannel(guild.id, newUser.client);
    if (!result?.channel || !result.config.logUserUpdated) continue;
    await send(result.channel, baseEmbed(result.config).setDescription(`👤 <@${newUser.id}> updated their profile (username/avatar).`));
  }
}

// ---- Roles ----

export async function onRoleCreate(role: Role) {
  const result = await getLogChannel(role.guild.id, role.client);
  if (!result?.channel || !result.config.logRoleCreated) return;
  await send(result.channel, baseEmbed(result.config).setDescription(`➕ Role created: **${role.name}**`));
}

export async function onRoleUpdate(oldRole: Role, newRole: Role) {
  if (oldRole.name === newRole.name && oldRole.color === newRole.color && oldRole.permissions.bitfield === newRole.permissions.bitfield) return;
  const result = await getLogChannel(newRole.guild.id, newRole.client);
  if (!result?.channel || !result.config.logRoleUpdated) return;
  await send(result.channel, baseEmbed(result.config).setDescription(`✎ Role updated: **${newRole.name}**`));
}

export async function onRoleDelete(role: Role) {
  const result = await getLogChannel(role.guild.id, role.client);
  if (!result?.channel || !result.config.logRoleDeleted) return;
  await send(result.channel, baseEmbed(result.config, 0xef4444).setDescription(`➖ Role deleted: **${role.name}**`));
}

// ---- Voice ----

export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  if (oldState.channelId === newState.channelId) return;
  const result = await getLogChannel(newState.guild.id, newState.client);
  if (!result?.channel || !result.config.logVoice) return;

  let desc: string;
  if (!oldState.channelId && newState.channelId) desc = `🔊 <@${newState.id}> joined voice channel <#${newState.channelId}>`;
  else if (oldState.channelId && !newState.channelId) desc = `🔇 <@${newState.id}> left voice channel <#${oldState.channelId}>`;
  else desc = `🔀 <@${newState.id}> moved from <#${oldState.channelId}> to <#${newState.channelId}>`;

  await send(result.channel, baseEmbed(result.config).setDescription(desc));
}

// ---- Server ----

export async function onGuildUpdate(oldGuild: Guild, newGuild: Guild) {
  if (oldGuild.name === newGuild.name && oldGuild.icon === newGuild.icon) return;
  const result = await getLogChannel(newGuild.id, newGuild.client);
  if (!result?.channel || !result.config.logServerEdited) return;
  await send(result.channel, baseEmbed(result.config).setDescription(`⚙️ Server settings updated.`));
}

async function logEmojiChange(emoji: GuildEmoji, verb: string) {
  const result = await getLogChannel(emoji.guild.id, emoji.client);
  if (!result?.channel || !result.config.logEmojisUpdated) return;
  await send(result.channel, baseEmbed(result.config).setDescription(`😀 Emoji ${verb}: **${emoji.name}**`));
}
export const onEmojiCreate = (emoji: GuildEmoji) => logEmojiChange(emoji, "added");
export const onEmojiDelete = (emoji: GuildEmoji) => logEmojiChange(emoji, "removed");
export const onEmojiUpdate = (_oldEmoji: GuildEmoji, newEmoji: GuildEmoji) => logEmojiChange(newEmoji, "updated");

// ---- Channels ----

async function logChannelChange(channel: Channel, verb: string, configKey: "logChannelCreated" | "logChannelUpdated" | "logChannelDeleted") {
  const guild = "guild" in channel ? (channel as { guild?: Guild }).guild : undefined;
  if (!guild) return;
  const result = await getLogChannel(guild.id, channel.client);
  if (!result?.channel || !result.config[configKey]) return;
  const name = "name" in channel ? (channel as { name: string }).name : channel.id;
  await send(result.channel, baseEmbed(result.config).setDescription(`📺 Channel ${verb}: **#${name}**`));
}
export const onChannelCreate = (channel: Channel) => logChannelChange(channel, "created", "logChannelCreated");
export const onChannelDelete = (channel: Channel) => logChannelChange(channel, "deleted", "logChannelDeleted");
// What actually changed between two versions of a channel. Position is left
// out on purpose: creating, deleting or dragging one channel makes Discord
// renumber every channel below it and send an update for each, which used to
// flood the log with empty "Channel updated" lines.
type ChannelLike = Channel & {
  name?: string;
  topic?: string | null;
  nsfw?: boolean;
  rateLimitPerUser?: number | null;
  parentId?: string | null;
  bitrate?: number;
  userLimit?: number;
  permissionOverwrites?: { cache: Map<string, { allow: { bitfield: bigint }; deny: { bitfield: bigint } }> };
};

function overwriteKey(c: ChannelLike) {
  const cache = c.permissionOverwrites?.cache;
  if (!cache) return "";
  return [...cache.entries()]
    .map(([id, o]) => `${id}:${o.allow.bitfield}:${o.deny.bitfield}`)
    .sort()
    .join("|");
}

export function describeChannelChanges(oldC: ChannelLike, newC: ChannelLike): string[] {
  const out: string[] = [];
  const cut = (t: string | null | undefined) => (t ? (t.length > 120 ? `${t.slice(0, 117)}…` : t) : "*(none)*");
  if (oldC.name !== newC.name) out.push(`**Name:** #${oldC.name} → #${newC.name}`);
  if ((oldC.topic ?? "") !== (newC.topic ?? "")) out.push(`**Topic:** ${cut(oldC.topic)} → ${cut(newC.topic)}`);
  if ((oldC.parentId ?? null) !== (newC.parentId ?? null)) {
    const cat = (id: string | null | undefined) => (id ? `<#${id}>` : "no category");
    out.push(`**Category:** ${cat(oldC.parentId)} → ${cat(newC.parentId)}`);
  }
  if ((oldC.rateLimitPerUser ?? 0) !== (newC.rateLimitPerUser ?? 0)) out.push(`**Slowmode:** ${oldC.rateLimitPerUser ?? 0}s → ${newC.rateLimitPerUser ?? 0}s`);
  if (!!oldC.nsfw !== !!newC.nsfw) out.push(`**Age-restricted:** ${oldC.nsfw ? "on" : "off"} → ${newC.nsfw ? "on" : "off"}`);
  if (oldC.bitrate !== undefined && oldC.bitrate !== newC.bitrate) out.push(`**Bitrate:** ${Math.round((oldC.bitrate ?? 0) / 1000)} → ${Math.round((newC.bitrate ?? 0) / 1000)} kbps`);
  if (oldC.userLimit !== undefined && oldC.userLimit !== newC.userLimit) out.push(`**User limit:** ${oldC.userLimit || "none"} → ${newC.userLimit || "none"}`);
  if (overwriteKey(oldC) !== overwriteKey(newC)) out.push("**Permissions** changed");
  return out;
}

// Who made the change, from the audit log, when Spartacus can see it.
async function changedBy(guild: Guild, channelId: string): Promise<string | null> {
  const types = [AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete];
  for (const type of types) {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
    const entry = logs?.entries.find((e) => (e.target as { id?: string } | null)?.id === channelId && Date.now() - e.createdTimestamp < 15_000);
    if (entry?.executorId) return entry.executorId;
  }
  return null;
}

// ---- Channel moves ----
// Dragging one channel makes Discord renumber a whole batch of channels at
// once. The batch is gathered for a moment, then the channels that really
// moved are worked out: in each group (a category's channels, or the
// categories themselves), the longest run that kept its order just shifted,
// and anything outside that run was moved.
const MOVE_WAIT_MS = 2000;
const pendingMoves = new Map<string, { guild: Guild; old: Map<string, number>; timer: ReturnType<typeof setTimeout> }>();

function queueMove(guild: Guild, channelId: string, oldPosition: number) {
  let batch = pendingMoves.get(guild.id);
  if (!batch) {
    batch = { guild, old: new Map(), timer: setTimeout(() => void flushMoves(guild.id), MOVE_WAIT_MS) };
    pendingMoves.set(guild.id, batch);
  }
  // Keep the first old position seen for a channel in this batch.
  if (!batch.old.has(channelId)) batch.old.set(channelId, oldPosition);
}

// Indexes of the longest increasing run in a list.
export function longestKeptOrder(values: number[]): Set<number> {
  const tails: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < values[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) keep.add(k);
  return keep;
}

export interface MoveItem {
  id: string;
  oldPos: number;
  newPos: number;
}

// Which items in one group were actually moved.
export function movedInGroup(items: MoveItem[]): string[] {
  const byOld = [...items].sort((x, y) => x.oldPos - y.oldPos || x.id.localeCompare(y.id));
  const keep = longestKeptOrder(byOld.map((x) => x.newPos));
  return byOld.filter((_, i) => !keep.has(i)).map((x) => x.id);
}

type Positioned = { id: string; rawPosition: number; parentId: string | null; type: number; name: string };
const kindOf = (type: number) => (type === ChannelType.GuildCategory ? "cat" : type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice ? "voice" : "text");

async function flushMoves(guildId: string) {
  const batch = pendingMoves.get(guildId);
  pendingMoves.delete(guildId);
  if (!batch) return;
  const guild = batch.guild;
  const result = await getLogChannel(guild.id, guild.client);
  if (!result?.channel || !result.config.logChannelUpdated) return;

  // Brand-new channels are logged as created, not moved, and would only muddle the order.
  const fresh = Date.now() - 15_000;
  const all = [...guild.channels.cache.values()].filter((c) => "rawPosition" in c && !c.isThread() && c.createdTimestamp < fresh) as unknown as Positioned[];
  const groupKey = (c: Positioned) => (kindOf(c.type) === "cat" ? "cat" : `${c.parentId ?? "none"}:${kindOf(c.type)}`);
  const touched = new Set([...batch.old.keys()].map((id) => all.find((c) => c.id === id)).filter(Boolean).map((c) => groupKey(c!)));

  const lines: string[] = [];
  for (const key of touched) {
    const group = all.filter((c) => groupKey(c) === key);
    const moved = movedInGroup(group.map((c) => ({ id: c.id, oldPos: batch.old.get(c.id) ?? c.rawPosition, newPos: c.rawPosition })));
    const order = [...group].sort((x, y) => x.rawPosition - y.rawPosition);
    for (const id of moved) {
      const c = order.find((x) => x.id === id)!;
      if (isIgnoredChannel(result.config, id)) continue;
      const i = order.indexOf(c);
      const above = order[i - 1];
      const where = above ? `now below ${kindOf(above.type) === "cat" ? `**${above.name}**` : `<#${above.id}>`}` : c.parentId ? `now at the top of <#${c.parentId}>` : "now at the top";
      lines.push(kindOf(c.type) === "cat" ? `↕️ Category moved: **${c.name}**, ${where}` : `↕️ Channel moved: <#${c.id}>, ${where}`);
    }
  }
  if (!lines.length) return;
  await send(result.channel, baseEmbed(result.config).setDescription(lines.slice(0, 20).join("\n")));
}

export async function onChannelUpdate(oldChannel: Channel, newChannel: Channel) {
  const guild = "guild" in newChannel ? (newChannel as { guild?: Guild }).guild : undefined;
  if (!guild) return;
  const changes = describeChannelChanges(oldChannel as ChannelLike, newChannel as ChannelLike);
  if (changes.length === 0) {
    const before = (oldChannel as { rawPosition?: number }).rawPosition;
    const after = (newChannel as { rawPosition?: number }).rawPosition;
    if (before !== undefined && after !== undefined && before !== after) queueMove(guild, newChannel.id, before);
    return;
  }
  const result = await getLogChannel(guild.id, newChannel.client);
  if (!result?.channel || !result.config.logChannelUpdated) return;
  if (isIgnoredChannel(result.config, newChannel.id)) return;
  const by = await changedBy(guild, newChannel.id);
  const lines = [`📺 Channel updated: <#${newChannel.id}>${by ? ` by <@${by}>` : ""}`, ...changes];
  await send(result.channel, baseEmbed(result.config).setDescription(lines.join("\n").slice(0, 4096)));
}

// ---- Invites ----

export async function onInviteCreate(invite: Invite) {
  if (!invite.guild) return;
  const result = await getLogChannel(invite.guild.id, invite.client);
  if (!result?.channel || !result.config.logInvitePosted) return;
  await send(result.channel, baseEmbed(result.config).setDescription(`🔗 Invite created: \`${invite.code}\` by <@${invite.inviterId}>`));
}
