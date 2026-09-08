import { Events, GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

export const saveName = Events.GuildMemberRemove;
export const restoreName = Events.GuildMemberAdd;

export async function onLeave(member: GuildMember | PartialGuildMember) {
  const enabled = await isModuleEnabled(member.guild.id, "ROLE_PERSISTENCE");
  if (!enabled) return;

  const roleIds = member.roles.cache.filter((r) => r.id !== member.guild.roles.everyone.id).map((r) => r.id);
  if (roleIds.length === 0) return;

  await prisma.roleSnapshot.upsert({
    where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
    create: { guildId: member.guild.id, userId: member.id, roleIds },
    update: { roleIds, savedAt: new Date() },
  });
}

export async function onRejoin(member: GuildMember) {
  const enabled = await isModuleEnabled(member.guild.id, "ROLE_PERSISTENCE");
  if (!enabled) return;

  const snapshot = await prisma.roleSnapshot.findUnique({ where: { guildId_userId: { guildId: member.guild.id, userId: member.id } } });
  if (!snapshot) return;

  await member.roles.add(snapshot.roleIds).catch(() => null);
}
