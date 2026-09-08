import { Events, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

function emojiKey(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

export const addName = Events.MessageReactionAdd;
export const removeName = Events.MessageReactionRemove;

export async function onReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  const enabled = await isModuleEnabled(reaction.message.guildId, "REACTION_ROLES");
  if (!enabled) return;

  const mapping = await prisma.reactionRole.findFirst({
    where: { messageId: reaction.message.id, emoji: emojiKey(reaction) },
  });
  if (!mapping) return;

  const member = await reaction.message.guild?.members.fetch(user.id).catch(() => null);
  await member?.roles.add(mapping.roleId).catch(() => null);
}

export async function onReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  const enabled = await isModuleEnabled(reaction.message.guildId, "REACTION_ROLES");
  if (!enabled) return;

  const mapping = await prisma.reactionRole.findFirst({
    where: { messageId: reaction.message.id, emoji: emojiKey(reaction) },
  });
  if (!mapping) return;

  const member = await reaction.message.guild?.members.fetch(user.id).catch(() => null);
  await member?.roles.remove(mapping.roleId).catch(() => null);
}

// Called once at startup and whenever a mapping is created, so the bot's
// own reaction is seeded on the target message for members to click.
export async function seedReactionSeed(client: import("discord.js").Client, mapping: { channelId: string; messageId: string; emoji: string }) {
  const channel = await client.channels.fetch(mapping.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const message = await channel.messages.fetch(mapping.messageId).catch(() => null);
  await message?.react(mapping.emoji).catch(() => null);
}
