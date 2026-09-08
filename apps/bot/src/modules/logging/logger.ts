import { EmbedBuilder, Events, Message, PartialMessage, GuildMember, PartialGuildMember, VoiceState } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

const LOG_COLOR = 0x00e5ff;

async function getLogChannel(guildId: string, client: import("discord.js").Client) {
  const enabled = await isModuleEnabled(guildId, "LOGGING");
  if (!enabled) return null;

  const config = await prisma.loggingConfig.findUnique({ where: { guildId } });
  if (!config?.logChannelId) return null;

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  return { channel: isSendableChannel(channel) ? channel : null, config };
}

export const name = Events.MessageDelete;

export async function onMessageDelete(message: Message | PartialMessage) {
  if (!message.guildId || message.author?.bot) return;
  const result = await getLogChannel(message.guildId, message.client);
  if (!result?.channel || !result.config.logDeletes) return;

  const embed = new EmbedBuilder()
    .setColor(LOG_COLOR)
    .setDescription(`🗑️ Message deleted in <#${message.channelId}>`)
    .addFields({ name: "Author", value: message.author ? `<@${message.author.id}>` : "Unknown", inline: true })
    .addFields({ name: "Content", value: message.content?.slice(0, 500) || "*(no cached content)*" })
    .setTimestamp();

  await result.channel.send({ embeds: [embed] }).catch(() => null);
}

export async function onMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
  if (!newMessage.guildId || newMessage.author?.bot || oldMessage.content === newMessage.content) return;
  const result = await getLogChannel(newMessage.guildId, newMessage.client);
  if (!result?.channel || !result.config.logEdits) return;

  const embed = new EmbedBuilder()
    .setColor(LOG_COLOR)
    .setDescription(`✎ Message edited in <#${newMessage.channelId}> · [Jump to message](${newMessage.url})`)
    .addFields({ name: "Author", value: `<@${newMessage.author?.id}>`, inline: true })
    .addFields({ name: "Before", value: oldMessage.content?.slice(0, 400) || "*(uncached)*" })
    .addFields({ name: "After", value: newMessage.content?.slice(0, 400) || "*(empty)*" })
    .setTimestamp();

  await result.channel.send({ embeds: [embed] }).catch(() => null);
}

export async function onMemberAdd(member: GuildMember) {
  const result = await getLogChannel(member.guild.id, member.client);
  if (!result?.channel || !result.config.logJoinsLeaves) return;
  await result.channel
    .send({ embeds: [new EmbedBuilder().setColor(0x34d399).setDescription(`📥 <@${member.id}> joined the server.`).setTimestamp()] })
    .catch(() => null);
}

export async function onMemberRemove(member: GuildMember | PartialGuildMember) {
  const result = await getLogChannel(member.guild.id, member.client);
  if (!result?.channel || !result.config.logJoinsLeaves) return;
  await result.channel
    .send({ embeds: [new EmbedBuilder().setColor(0xfb7185).setDescription(`📤 ${member.user.tag} left the server.`).setTimestamp()] })
    .catch(() => null);
}

export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  if (oldState.channelId === newState.channelId) return;
  const guildId = newState.guild.id;
  const result = await getLogChannel(guildId, newState.client);
  if (!result?.channel || !result.config.logVoice) return;

  var desc: string;
  if (!oldState.channelId && newState.channelId) desc = `🔊 <@${newState.id}> joined voice channel <#${newState.channelId}>`;
  else if (oldState.channelId && !newState.channelId) desc = `🔇 <@${newState.id}> left voice channel <#${oldState.channelId}>`;
  else desc = `🔀 <@${newState.id}> moved from <#${oldState.channelId}> to <#${newState.channelId}>`;

  await result.channel.send({ embeds: [new EmbedBuilder().setColor(LOG_COLOR).setDescription(desc).setTimestamp()] }).catch(() => null);
}
