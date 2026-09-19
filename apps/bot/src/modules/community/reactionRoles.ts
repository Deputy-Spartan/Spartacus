import { Events, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { describeAccess, emojiKeyOf, grantAccess, revokeAccess, type AccessTarget } from "../../lib/accessGrants";

function emojiKey(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

export const addName = Events.MessageReactionAdd;
export const removeName = Events.MessageReactionRemove;

async function findTarget(reaction: MessageReaction | PartialMessageReaction): Promise<AccessTarget | null> {
  const rows = await prisma.reactionRole.findMany({ where: { messageId: reaction.message.id } });
  const key = emojiKey(reaction);
  const row = rows.find((r) => emojiKeyOf(r.emoji) === key);
  if (!row) return null;
  const extra = Array.isArray(row.extraRoleIds) ? (row.extraRoleIds as string[]) : [];
  const channels = Array.isArray(row.channelIds) ? (row.channelIds as string[]) : [];
  return { roleIds: [row.roleId, ...extra].filter(Boolean), channelIds: channels };
}

// Reactions have no interaction to reply to, so the "hidden" confirmation is a
// DM — the only place only the member sees it. Silent if their DMs are closed.
async function notify(user: User | PartialUser, guildName: string, text: string) {
  await user.send(`**${guildName}** — ${text}`).catch(() => null);
}

export async function onReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  if (!(await isModuleEnabled(reaction.message.guildId, "REACTION_ROLES"))) return;

  const target = await findTarget(reaction);
  if (!target) return;

  const guild = reaction.message.guild;
  const member = await guild?.members.fetch(user.id).catch(() => null);
  if (!member || !guild) return;
  try {
    await grantAccess(member, target);
    await notify(user, guild.name, `➕ You now have access to ${describeAccess(target)}.`);
  } catch {
    await notify(user, guild.name, "⚠️ I couldn't give you that — an admin needs to check my permissions.");
  }
}

export async function onReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  if (!(await isModuleEnabled(reaction.message.guildId, "REACTION_ROLES"))) return;

  const target = await findTarget(reaction);
  if (!target) return;

  const guild = reaction.message.guild;
  const member = await guild?.members.fetch(user.id).catch(() => null);
  if (!member || !guild) return;
  try {
    await revokeAccess(member, target);
    await notify(user, guild.name, `➖ Removed your access to ${describeAccess(target)}.`);
  } catch {
    await notify(user, guild.name, "⚠️ I couldn't remove that — an admin needs to check my permissions.");
  }
}
