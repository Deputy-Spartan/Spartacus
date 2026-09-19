import { Events, Guild, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { describeAccessNames, emojiKeyOf, grantAccess, revokeAccess, type AccessTarget } from "../../lib/accessGrants";

function emojiKey(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

export const addName = Events.MessageReactionAdd;
export const removeName = Events.MessageReactionRemove;

async function findTarget(reaction: MessageReaction | PartialMessageReaction): Promise<{ target: AccessTarget; notifyMode: string } | null> {
  const rows = await prisma.reactionRole.findMany({ where: { messageId: reaction.message.id } });
  const key = emojiKey(reaction);
  const row = rows.find((r) => emojiKeyOf(r.emoji) === key);
  if (!row) return null;
  const extra = Array.isArray(row.extraRoleIds) ? (row.extraRoleIds as string[]) : [];
  const channels = Array.isArray(row.channelIds) ? (row.channelIds as string[]) : [];
  const panel = row.panelId ? await prisma.reactionRolePanel.findUnique({ where: { id: row.panelId }, select: { notifyMode: true } }) : null;
  return { target: { roleIds: [row.roleId, ...extra].filter(Boolean), channelIds: channels }, notifyMode: panel?.notifyMode ?? "PRIVATE" };
}

// Reactions have no interaction to reply to, so Discord can't show a truly
// hidden message. PRIVATE posts a short-lived note in the channel that
// deletes itself; DM sends a direct message (names spelled out, since mentions
// don't resolve in DMs); NONE stays silent.
async function notify(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, guild: Guild, mode: string, text: (names: string) => string, target: AccessTarget) {
  if (mode === "NONE") return;
  const names = describeAccessNames(guild, target);
  if (mode === "DM") {
    await user.send(`**${guild.name}** — ${text(names)}`).catch(() => null);
    return;
  }
  const channel = reaction.message.channel;
  if (!("send" in channel)) return;
  const sent = await channel.send({ content: `<@${user.id}> ${text(names)}`, allowedMentions: { parse: [] } }).catch(() => null);
  if (sent) setTimeout(() => void sent.delete().catch(() => null), 6000);
}

export async function onReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  if (!(await isModuleEnabled(reaction.message.guildId, "REACTION_ROLES"))) return;

  const found = await findTarget(reaction);
  if (!found) return;
  const { target, notifyMode } = found;

  const guild = reaction.message.guild;
  const member = await guild?.members.fetch(user.id).catch(() => null);
  if (!member || !guild) return;
  try {
    await grantAccess(member, target);
    await notify(reaction, user, guild, notifyMode, (n) => `➕ You now have access to ${n}.`, target);
  } catch {
    await notify(reaction, user, guild, notifyMode, () => "⚠️ I couldn't give you that — an admin needs to check my permissions.", target);
  }
}

export async function onReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  if (!(await isModuleEnabled(reaction.message.guildId, "REACTION_ROLES"))) return;

  const found = await findTarget(reaction);
  if (!found) return;
  const { target, notifyMode } = found;

  const guild = reaction.message.guild;
  const member = await guild?.members.fetch(user.id).catch(() => null);
  if (!member || !guild) return;
  try {
    await revokeAccess(member, target);
    await notify(reaction, user, guild, notifyMode, (n) => `➖ Removed your access to ${n}.`, target);
  } catch {
    await notify(reaction, user, guild, notifyMode, () => "⚠️ I couldn't remove that — an admin needs to check my permissions.", target);
  }
}
