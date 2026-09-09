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
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
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

async function send(channel: SendableChannels | null | undefined, embed: EmbedBuilder) {
  await channel?.send({ embeds: [embed] }).catch(() => null);
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
export const onChannelUpdate = (_oldChannel: Channel, newChannel: Channel) => logChannelChange(newChannel, "updated", "logChannelUpdated");

// ---- Invites ----

export async function onInviteCreate(invite: Invite) {
  if (!invite.guild) return;
  const result = await getLogChannel(invite.guild.id, invite.client);
  if (!result?.channel || !result.config.logInvitePosted) return;
  await send(result.channel, baseEmbed(result.config).setDescription(`🔗 Invite created: \`${invite.code}\` by <@${invite.inviterId}>`));
}
