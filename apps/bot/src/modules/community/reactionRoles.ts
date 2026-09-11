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
